/**
 * Confere a leitura da Únicopag com prazo (lib/escola/servidor.ts), contra uma
 * Únicopag de mentira e um banco de mentira — sem rede, sem banco de verdade.
 *
 *   npx tsx scripts/conferir-leitura-unicopag.ts
 *
 * O que prova:
 *  - com prazo, uma Únicopag lenta não estoura: a leitura para, grava o que leu e avisa "parcial";
 *  - a janela de 30 dias do botão para na primeira página mais velha que ela;
 *  - a primeira carga (conta nunca lida) não para por prazo;
 *  - as contas leem ao mesmo tempo (o tempo total é o da mais lenta, não a soma).
 */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Module from 'node:module'

// lib/escola/servidor.ts começa com import 'server-only', que só existe dentro do Next: aqui vira um arquivo vazio.
const vazio = join(tmpdir(), 'server-only-vazio.js')
writeFileSync(vazio, '')
const M = Module as unknown as { _resolveFilename: (pedido: string, ...resto: unknown[]) => string }
const resolver = M._resolveFilename
M._resolveFilename = function (pedido: string, ...resto: unknown[]) { return pedido === 'server-only' ? vazio : resolver.call(this, pedido, ...resto) }

const DIA = 86_400_000
let falhas = 0
const conferir = (ok: boolean, nome: string) => { console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`); if (!ok) falhas++ }

/** 10 páginas de 100 vendas, 7 dias para trás a cada página (página 1 = hoje). Cada página demora `atraso` ms; a página 2 da conta "f", 20 s. */
function unicopagDeMentira(atraso: number) {
  const pedidas: number[] = []
  const servidor = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x')
    if (u.pathname.endsWith('/balance')) { res.end(JSON.stringify({ data: { available: 0, pending: 0 } })); return }
    const pagina = Number(u.searchParams.get('page') ?? '1')
    pedidas.push(pagina)
    const conta = u.searchParams.get('api_token') ?? '?'
    const itens = Array.from({ length: 100 }, (_, i) => ({
      hash: `${conta}-${pagina}-${i}`, amount: 9900, payment_status: 'paid',
      created_at: new Date(Date.now() - (pagina - 1) * 7 * DIA).toISOString(),
    }))
    setTimeout(() => { if (!res.writableEnded && !res.destroyed) res.end(JSON.stringify({ data: itens, last_page: 10 })) }, conta === 'f' && pagina === 2 ? 20_000 : atraso)
  })
  return new Promise<{ url: string; pedidas: number[]; fechar: () => void }>((ok) => servidor.listen(0, () => {
    ok({ url: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`, pedidas, fechar: () => servidor.close() })
  }))
}

/** O mínimo do cliente do Supabase que sincronizarConta usa: a chave do cofre, gravar e o resto vazio. */
function bancoDeMentira() {
  const gravadas: number[] = []
  const admin = {
    rpc: async (nome: string, args: Record<string, unknown>) => {
      if (nome === 'chave_de_integracao') return { data: String(args.p_servico).replace('unicopag:', ''), error: null }
      if (nome === 'escola_gravar_sincronizacao') {
        const n = Array.isArray(args.p_transacoes) ? args.p_transacoes.length : 0
        gravadas.push(n)
        return { data: n, error: null }
      }
      return { data: {}, error: null }
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }
  return { admin, gravadas }
}

async function main() {
  const lenta = await unicopagDeMentira(1500)
  process.env.UNICOPAG_URL = lenta.url
  const { sincronizarConta, servicoDaConta } = await import('@/lib/escola/servidor')
  const conta = (id: string, jaLida: boolean) => ({ id, nome: id, sincronizada_em: jaLida ? new Date().toISOString() : null })
  // A chave no cofre de mentira é o próprio id da conta, para a Únicopag de mentira separar as contas.
  const servico = servicoDaConta('x')
  conferir(servico.endsWith('x'), `o serviço da chave termina no id da conta (${servico})`)

  // 1) Botão com prazo curto (4 s) e Únicopag lenta (1,5 s por página): para, grava e avisa.
  {
    const { admin, gravadas } = bancoDeMentira()
    lenta.pedidas.length = 0
    const inicio = Date.now()
    const r = await sincronizarConta(admin as never, 'ws', conta('a', true), { janelaDias: 365, prazo: Date.now() + 4_000 })
    const levou = Date.now() - inicio
    conferir(r.ok, 'prazo: a leitura dá certo')
    conferir(levou < 6_000, `prazo: termina a tempo (${levou} ms)`)
    conferir(/só uma parte/.test(r.mensagem), 'prazo: a mensagem avisa que foi parcial')
    conferir(gravadas.length === 1 && gravadas[0] > 0 && gravadas[0] < 1000, `prazo: grava o que leu (${gravadas[0]} de 1000)`)
  }

  // 2) Janela de 30 dias: página 1 = hoje, 2 = 7 dias, ... 5 = 28 dias, 6 = 35 dias (inteira fora) -> para na 6.
  {
    const { admin } = bancoDeMentira()
    lenta.pedidas.length = 0
    const r = await sincronizarConta(admin as never, 'ws', conta('b', true), { janelaDias: 30, prazo: Date.now() + 30_000 })
    conferir(r.ok && !/só uma parte/.test(r.mensagem), 'janela: lê sem ser parcial')
    conferir(Math.max(...lenta.pedidas) === 6, `janela de 30 dias: para na página 6 (pediu ${lenta.pedidas.join(',')})`)
  }

  // 3) Primeira carga (conta nunca lida): ignora o prazo e lê as 10 páginas.
  {
    const { admin, gravadas } = bancoDeMentira()
    lenta.pedidas.length = 0
    const r = await sincronizarConta(admin as never, 'ws', conta('c', false), { janelaDias: 30, prazo: Date.now() + 1_000 })
    conferir(r.ok && !/só uma parte/.test(r.mensagem), 'primeira carga: não é parcial')
    conferir(lenta.pedidas.length === 10 && gravadas.reduce((a, b) => a + b, 0) === 1000, `primeira carga: lê tudo (${lenta.pedidas.length} páginas)`)
  }

  // 4) Duas contas ao mesmo tempo: ~ o tempo de uma.
  {
    const { admin } = bancoDeMentira()
    const inicio = Date.now()
    const modo = { janelaDias: 365, prazo: Date.now() + 4_000 }
    await Promise.all([sincronizarConta(admin as never, 'ws', conta('d', true), modo), sincronizarConta(admin as never, 'ws', conta('e', true), modo)])
    const levou = Date.now() - inicio
    conferir(levou < 6_000, `duas contas em paralelo cabem no prazo de uma (${levou} ms)`)
  }

  // 5) A página 2 demora mais que o prazo: a leitura não falha, guarda a página 1 e avisa.
  {
    const { admin, gravadas } = bancoDeMentira()
    const inicio = Date.now()
    const r = await sincronizarConta(admin as never, 'ws', conta('f', true), { janelaDias: 365, prazo: Date.now() + 6_000 })
    const levou = Date.now() - inicio
    conferir(r.ok && /só uma parte/.test(r.mensagem), 'página que estoura o prazo: dá certo e avisa parcial')
    conferir(gravadas[0] === 100, `página que estoura o prazo: grava a página 1 (${gravadas[0]})`)
    conferir(levou < 8_000, `página que estoura o prazo: termina a tempo (${levou} ms)`)
  }

  lenta.fechar()
  console.log(falhas ? `${falhas} conferência(s) falharam` : 'Tudo certo.')
  process.exit(falhas ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
