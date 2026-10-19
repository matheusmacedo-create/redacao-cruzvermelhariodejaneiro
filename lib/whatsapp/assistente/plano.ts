import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { podeAgirPeloWhatsapp, type Pessoa } from '../acoes'
import { pessoaDoEspaco } from '../consultas'
import { criarConfirmacao } from '../confirmacoes'
import type { Entrega } from '../fila'
import type { Interativo, MensagemRecebida } from '../regras'
import {
  criarFluxoDoPlano, type FluxoDoPlano, type MudancaDoPlano, type PlanoGuardado, type RepositorioDePlanos, type SituacaoDoPlano,
  SITUACOES_ABERTAS, SITUACOES_ENCERRADAS,
} from './fluxo'
import { redigirVencidos } from './faxina'
import { executarPasso, fonteDoSupabase } from './executores'
import { revalidarPasso } from './preparos'
import { acoesDeHoje, criarRegistroDoUso, lerConfig } from './uso'
import {
  LIMITES, TEXTOS_FIXOS, interativoDoPlano, mensagensComInterativo, modoCobre, passoIsento, textoDoLinkNoPalacio, textoDoPlano, validarRascunho,
  type Passo, type PlanoAberto, type TipoDeAcao,
} from './regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Os planos e as perguntas do assistente no banco (whatsapp_ia_planos, só o service role): o repositório do
 * Supabase para o fluxo de fluxo.ts (o mesmo contrato do repositório em memória dos testes) e o que o turno e o bot
 * precisam dele:
 *  - guardarPlano e guardarPergunta: o que estava aberto da pessoa é substituído (e redigido na hora), e a pergunta
 *    do bot que estivesse aberta é encerrada — as duas nunca ficam abertas juntas;
 *  - guardarPlanoDoChat: a resposta citando o aviso de um canal do Chat, sem cara de pedido ao assistente, vira um
 *    plano de um passo (sem modelo), confirmado como os outros;
 *  - confirmarPlano: o "confirmo" (já com a vez da pessoa), pelo fluxo — assenta, confere a mensagem no meio,
 *    consome o plano, confere a pessoa, o número, a verificação em duas etapas e as cotas do dia, revalida todos os
 *    passos e só então executa (executores.ts), parando no primeiro que não deu; redige na hora e devolve o recibo
 *    (com o "Não fui eu"). O plano sensível não executa aqui: ganha o link de confirmar no Palácio (uso único,
 *    15 min; app/confirmar/[token], ramo "plano"), e a página executa pela sessão (palacio.ts).
 *
 * Nunca lança: sem a tabela (migração ainda não aplicada) ou com erro, devolve null ou [] — e o assistente nem
 * chega a ficar disponível sem a configuração, que é da mesma migração.
 */

const daLinha = (l: Record<string, unknown>): PlanoGuardado => ({
  id: l.id as string, workspaceId: l.workspace_id as string, userId: l.user_id as string, numero: l.numero as string, papel: l.papel as string,
  situacao: l.situacao as SituacaoDoPlano,
  passos: Array.isArray(l.passos) ? l.passos as PlanoGuardado['passos'] : [],
  opcoes: Array.isArray(l.opcoes) ? (l.opcoes as unknown[]).map(String) : [],
  permitidas: Array.isArray(l.permitidas) ? l.permitidas as TipoDeAcao[] : [],
  pedidoEmAberto: (l.pedido_em_aberto as string | null) ?? null,
  hash: (l.hash as string | null) ?? null, sensivel: l.sensivel === true,
  mensagens: Array.isArray(l.mensagens) ? (l.mensagens as unknown[]).map(String) : [],
  entregueEm: (l.entregue_em as string | null) ?? null,
  resultado: Array.isArray(l.resultado) ? l.resultado as PlanoGuardado['resultado'] : [],
  redigidoEm: (l.redigido_em as string | null) ?? null, criadoEm: l.criado_em as string, expiraEm: l.expira_em as string, atualizadoEm: l.atualizado_em as string,
})

const COLUNA: Record<keyof MudancaDoPlano, string> = {
  situacao: 'situacao', passos: 'passos', pedidoEmAberto: 'pedido_em_aberto', mensagens: 'mensagens', entregueEm: 'entregue_em',
  resultado: 'resultado', redigidoEm: 'redigido_em', atualizadoEm: 'atualizado_em', expiraEm: 'expira_em',
}

const paraLinha = (m: MudancaDoPlano): Record<string, unknown> =>
  Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined).map(([k, v]) => [COLUNA[k as keyof MudancaDoPlano], v]))

const linhaOuNull = (data: unknown) => (data && typeof data === 'object' ? daLinha(data as Record<string, unknown>) : null)

/** O repositório do fluxo no Supabase: cada mudança é um update condicional pela situação (devolve a linha só se mudou). */
export function repoSupabase(admin: Admin): RepositorioDePlanos {
  const tabela = () => admin.from('whatsapp_ia_planos')
  return {
    async inserir(p) {
      const linha = (permitidas: string[]) => ({
        workspace_id: p.workspaceId, user_id: p.userId, numero: p.numero, papel: p.papel, situacao: p.situacao, passos: p.passos, opcoes: p.opcoes,
        permitidas, pedido_em_aberto: p.pedidoEmAberto, hash: p.hash, sensivel: p.sensivel, mensagens: p.mensagens, entregue_em: p.entregueEm,
        resultado: p.resultado, redigido_em: p.redigidoEm, expira_em: p.expiraEm,
      })
      let { data, error } = await tabela().insert(linha(p.permitidas)).select('*').single()
      // Antes da migração do Drive (20261019030000), o banco não conhece "drive" no portão: guarda sem ele (o pedido
      // de guardar no Drive deixa de valer só numa correção ou na escolha, que pedem de novo).
      if (error?.code === '23514' && p.permitidas.includes('drive')) ({ data, error } = await tabela().insert(linha(p.permitidas.filter((x) => x !== 'drive'))).select('*').single())
      if (error && error.code !== '23505') console.error('[whatsapp] assistente: plano não guardado:', error.code)
      return error ? null : linhaOuNull(data)
    },
    async buscar(id) {
      const { data } = await tabela().select('*').eq('id', id).maybeSingle()
      return linhaOuNull(data)
    },
    async abertoDaPessoa(userId) {
      const { data } = await tabela().select('*').eq('user_id', userId).in('situacao', [...SITUACOES_ABERTAS]).order('criado_em', { ascending: false }).limit(1).maybeSingle()
      return linhaOuNull(data)
    },
    async daMensagem(userId, mensagemId) {
      const { data } = await tabela().select('*').eq('user_id', userId).contains('mensagens', [mensagemId]).order('criado_em', { ascending: false }).limit(1).maybeSingle()
      return linhaOuNull(data)
    },
    async ultimoEncerrado(userId) {
      const { data } = await tabela().select('*').eq('user_id', userId).in('situacao', [...SITUACOES_ENCERRADAS]).order('atualizado_em', { ascending: false }).limit(1).maybeSingle()
      return linhaOuNull(data)
    },
    async mudar(id, de, mudanca, condicao = {}) {
      let q = tabela().update(paraLinha(mudanca)).eq('id', id).in('situacao', [...de])
      if (condicao.vigenteEm) q = q.gt('expira_em', condicao.vigenteEm)
      const { data } = await q.select('*').maybeSingle()
      return linhaOuNull(data)
    },
    async mudarDaPessoa(userId, de, mudanca) {
      const { data } = await tabela().update(paraLinha(mudanca)).eq('user_id', userId).in('situacao', [...de]).select('*')
      return (data ?? []).map((l) => daLinha(l as Record<string, unknown>))
    },
    async mensagemNoMeio(userId, depoisDe, ateMs, excetoMensagemId) {
      let q = admin.from('whatsapp_mensagens').select('id').eq('user_id', userId).eq('direcao', 'entrada').in('comando', ['ia', 'ia_escolha'])
        .gt('enviada_em', depoisDe).lte('enviada_em', new Date(ateMs).toISOString())
      if (excetoMensagemId) q = q.neq('mensagem_id', excetoMensagemId)
      const { data } = await q.limit(1)
      return Boolean(data?.length)
    },
  }
}

export const fluxoDoPlano = (admin: Admin): FluxoDoPlano => criarFluxoDoPlano(repoSupabase(admin))

/** O que a rota precisa saber: o plano ou a pergunta da pessoa e o que a mensagem citou. null sem a tabela ou com erro. */
export type AbertoDaPessoa = { aberto: PlanoAberto; plano: PlanoGuardado | null }

export async function planoAberto(admin: Admin, userId: string, citada: string | null, opcoes: { citacaoResolvida?: boolean } = {}): Promise<AbertoDaPessoa | null> {
  try {
    // Antes de olhar: o vencido da pessoa vira "vencido" e é redigido (a faxina geral pode estar longe).
    await redigirVencidos(admin, { limite: 10, userId })
    return await fluxoDoPlano(admin).abertoPara(userId, citada, opcoes)
  } catch (causa) {
    console.error('[whatsapp] assistente: plano aberto não lido:', causa instanceof Error ? causa.message : causa)
    return null
  }
}

/**
 * Guarda a pergunta do assistente ("Qual Ana?"): o que estava aberto da pessoa é substituído (e redigido), e a
 * pergunta do bot que estivesse aberta é encerrada — as duas nunca ficam abertas juntas (o envio de fotos e a
 * conferência do "Não fui eu" seguem, como em guardarPendencia). `permitidas`: o portão do pedido, que vale
 * de novo quando a pessoa escolher.
 */
export async function guardarPergunta(admin: Admin, p: {
  workspaceId: string; userId: string; numero: string; papel: string; opcoes: string[]; pedidoEmAberto: string | null; permitidas: TipoDeAcao[]
}): Promise<PlanoGuardado | null> {
  try {
    await redigirVencidos(admin, { limite: 10, userId: p.userId })
    await encerrarPerguntasDoBot(admin, p.userId)
    return await fluxoDoPlano(admin).guardar({
      workspaceId: p.workspaceId, userId: p.userId, numero: p.numero, papel: p.papel, tipo: 'pergunta',
      passos: [], opcoes: p.opcoes, permitidas: p.permitidas, pedidoEmAberto: p.pedidoEmAberto, sensivel: false,
    })
  } catch (causa) {
    console.error('[whatsapp] assistente: pergunta não guardada:', causa instanceof Error ? causa.message : causa)
    return null
  }
}

/** A pergunta do bot aberta da pessoa cede a vez (o envio de fotos e a conferência do "Não fui eu" seguem, como em guardarPendencia). */
async function encerrarPerguntasDoBot(admin: Admin, userId: string): Promise<void> {
  await admin.from('whatsapp_pendencias').update({ encerrada_em: new Date().toISOString() }).eq('user_id', userId).is('encerrada_em', null)
    .not('tipo', 'in', '(envio,nao_fui_eu)')
}

/**
 * Guarda o plano do assistente (já validado: validarRascunho), com o hash e 15 minutos: o que estava aberto da
 * pessoa vira "substituido" e é redigido, e a pergunta do bot aberta é encerrada. `permitidas`: o portão do pedido
 * (vale de novo numa correção). null se o banco recusou.
 */
export async function guardarPlano(admin: Admin, p: {
  workspaceId: string; userId: string; numero: string; papel: string; passos: Passo[]; permitidas: TipoDeAcao[]; sensivel: boolean
}): Promise<PlanoGuardado | null> {
  try {
    await redigirVencidos(admin, { limite: 10, userId: p.userId })
    await encerrarPerguntasDoBot(admin, p.userId)
    return await fluxoDoPlano(admin).guardar({
      workspaceId: p.workspaceId, userId: p.userId, numero: p.numero, papel: p.papel, tipo: 'plano',
      passos: p.passos, opcoes: [], permitidas: p.permitidas, pedidoEmAberto: null, sensivel: p.sensivel,
    })
  } catch (causa) {
    console.error('[whatsapp] assistente: plano não guardado:', causa instanceof Error ? causa.message : causa)
    return null
  }
}

/** A entrega de várias mensagens em ordem: `ids`, as que saíram. */
export type EntregaEmPartes = Entrega & { ids: (string | null)[] }

/**
 * O texto com os botões (ou a lista), no limite do corpo interativo: até 1.024 caracteres, uma mensagem; acima, o
 * texto sozinho e depois a `chamada` com os botões (mensagensComInterativo). Se a primeira não sai, é a falha; se a
 * segunda não sai, o texto já saiu e vale (dá para responder *confirmo* ou o número).
 */
export async function entregarComInterativo(enviar: (texto: string, interativo: Interativo | null) => Promise<Entrega>, texto: string, interativo: Interativo | null, chamada: string): Promise<EntregaEmPartes> {
  const ids: (string | null)[] = []
  let saiu: Entrega | null = null
  for (const parte of mensagensComInterativo(texto, interativo, chamada)) {
    const entrega = await enviar(parte.texto, parte.interativo)
    if (entrega.situacao !== 'enviada') {
      if (!saiu) return { ...entrega, ids }
      break
    }
    ids.push(entrega.id)
    saiu = entrega
  }
  return { ...(saiu as Entrega), ids }
}

/** O plano com os botões Confirmar e Cancelar (o id curto e o hash: o toque num plano antigo, ou trocado, não confirma). */
export const entregarPlano = (enviar: (texto: string, interativo: Interativo | null) => Promise<Entrega>, texto: string, plano: Pick<PlanoGuardado, 'id' | 'hash'>) =>
  entregarComInterativo(enviar, texto, plano.hash ? interativoDoPlano(plano.id, plano.hash) : null, TEXTOS_FIXOS.confirma_o_plano)

/**
 * Como as mensagens saem: o plano e o que depende de ser visto agora, sem fila (com `plano`, com os botões Confirmar e
 * Cancelar; acima de 1.024 caracteres, numa segunda mensagem — `ids` traz as duas); o aviso curto (sem textos de
 * ação), pela fila normal.
 */
export type SaidaDoPlano = {
  semFila: (texto: string, interativo?: Interativo | null) => Promise<Entrega>
  naFila: (texto: string) => Promise<Entrega>
}

/**
 * A resposta citando o aviso de um canal do Chat, sem cara de pedido ao assistente ("ok, combinado"), vira um plano
 * de um passo, sem modelo: o texto da pessoa, inteiro e citado, e o canal. Sai como os outros planos (sem fila; se não
 * saiu, cancelado e redigido) e só vai ao canal com o "confirmo". Quem chama já conferiu a escrita e a verificação em
 * duas etapas (com ela, o caminho de sempre responde).
 */
export async function guardarPlanoDoChat(admin: Admin, p: {
  workspaceId: string; pessoa: Pessoa; numero: string; alvo: { canalId: string; fio: string | null }; texto: string; base: string; saida: SaidaDoPlano
}): Promise<void> {
  const abrir = `${p.base}/chat/${p.alvo.canalId}${p.alvo.fio ? `?fio=${p.alvo.fio}` : ''}`
  const canal = await fonteDoSupabase(admin, p.workspaceId, p.pessoa).canal(p.alvo.canalId).catch(() => null)
  if (!canal) {
    await p.saida.semFila(`Esta conversa não aceita mensagens agora. Abra no Palácio: ${abrir}`)
    return
  }
  const passo: Passo = { acao: 'responder_chat', canalId: p.alvo.canalId, fio: p.alvo.fio, canalNome: canal.nome, texto: p.texto.trim(), isento: false }
  const valido = validarRascunho([passo])
  if (!valido.ok) {
    await p.saida.semFila(`${valido.erro} ${abrir}`)
    return
  }
  const guardado = await guardarPlano(admin, { workspaceId: p.workspaceId, userId: p.pessoa.id, numero: p.numero, papel: p.pessoa.papel, passos: valido.passos, permitidas: ['chat'], sensivel: false })
  if (!guardado) {
    await p.saida.semFila(`${TEXTOS_FIXOS.plano_nao_saiu} Ou responda pelo Palácio: ${abrir}`)
    return
  }
  const entrega = await entregarPlano((texto, interativo) => p.saida.semFila(texto, interativo), textoDoPlano({ passos: valido.passos }).texto, guardado)
  if (entrega.situacao === 'enviada') {
    await marcarEntrega(admin, guardado.id, entrega.ids)
  } else {
    await entregaFalhou(admin, guardado.id)
    await p.saida.naFila(TEXTOS_FIXOS.plano_nao_saiu)
  }
}

/**
 * Na confirmação, tudo de novo antes de qualquer escrita: o número é o do plano e o desta mensagem, e não está
 * suspenso; a escrita continua ligada para a pessoa; a pessoa ativa e com o mesmo papel; a verificação em duas
 * etapas (um passo não isento de quem passou a usar não sai pelo WhatsApp; o plano sensível segue para o Palácio);
 * o número de confiança recente; e as cotas do dia (planos executados e mensagens diretas, contando as do plano).
 * null = confere; senão, o motivo (minúsculo).
 */
async function conferirIdentidade(admin: Admin, p: { workspaceId: string; pessoa: Pessoa; numero: string | null; recente: boolean }, linha: PlanoGuardado): Promise<string | null> {
  const [{ data: conta }, config, atual, podeAgir, hoje] = await Promise.all([
    admin.from('whatsapp_contas').select('numero, assistente_suspenso_em').eq('user_id', p.pessoa.id).maybeSingle(),
    lerConfig(admin, p.workspaceId),
    pessoaDoEspaco(admin, p.workspaceId, p.pessoa.id),
    podeAgirPeloWhatsapp(admin, p.workspaceId, p.pessoa),
    acoesDeHoje(admin, p.pessoa.id),
  ])
  if (!conta || conta.numero !== linha.numero || conta.numero !== p.numero || conta.assistente_suspenso_em) return 'o número não é mais o do plano'
  if (!config?.escrita || !modoCobre(config, p.pessoa)) return 'pedir ações por aqui foi desligado'
  if (!atual || atual.papel !== linha.papel) return TEXTOS_FIXOS.conta_mudou
  // O plano feito para sair pelo WhatsApp não sai se a pessoa passou a usar a verificação em duas etapas (o sensível vai ao Palácio).
  if (!linha.sensivel && !podeAgir && linha.passos.some((x) => !passoIsento(x))) return TEXTOS_FIXOS.conta_mudou
  if (!p.recente) return 'faz tempo que este número não é confirmado nem há login no Palácio'
  if (hoje && hoje.planos >= LIMITES.planosDia) return TEXTOS_FIXOS.limite_de_planos
  const mensagensDoPlano = linha.passos.filter((x) => x.acao === 'mensagem_direta').length
  if (mensagensDoPlano && (hoje?.mensagens ?? 0) + mensagensDoPlano > config.mensagens_dia) return TEXTOS_FIXOS.limite_de_mensagens
  return null
}

/**
 * O que sai depois do "confirmo": `recibo` (o recibo, ou o "Nada foi feito" da revalidação, sem textos de ação — pode
 * esperar na fila, e oferece o "Não fui eu"), `link` (o link de confirmar no Palácio do plano sensível: sai na hora,
 * como os avisos da conta) ou `fixo` (um dos textos fixos).
 */
export type SaidaDaConfirmacao = { texto: string; saida: 'recibo' | 'link' | 'fixo' }

/**
 * O "confirmo" do plano aberto (a rota já conferiu que foi escrito depois da entrega, citando o plano, ou o toque no
 * botão com o hash, e quem chama já tem a vez da pessoa). O plano sensível ganha o link de confirmar no Palácio (sem a
 * migração das confirmações do plano, ou com links demais na última hora, falha e é redigido). O uso fica registrado
 * com o desfecho "confirmado", custo zero e o plano.
 */
export async function confirmarPlano(admin: Admin, p: {
  workspaceId: string; pessoa: Pessoa; m: Pick<MensagemRecebida, 'id' | 'numero' | 'enviadaEm' | 'toque'>; plano: PlanoGuardado; base: string; recente: boolean
}): Promise<SaidaDaConfirmacao> {
  try {
    const fluxo = fluxoDoPlano(admin)
    const fonte = fonteDoSupabase(admin, p.workspaceId, p.pessoa)
    const r = await fluxo.confirmar({
      plano: p.plano, pessoaId: p.pessoa.id, mensagem: { id: p.m.id, enviadaEm: p.m.enviadaEm, toque: p.m.toque }, urlBase: p.base,
      conferirIdentidade: (linha) => conferirIdentidade(admin, { workspaceId: p.workspaceId, pessoa: p.pessoa, numero: p.m.numero, recente: p.recente }, linha),
      revalidar: (passo) => revalidarPasso(passo, fonte, p.pessoa.id),
      executar: (passo) => executarPasso(passo, { via: 'whatsapp', admin }, { workspaceId: p.workspaceId, pessoa: p.pessoa, planoId: p.plano.id, base: p.base }),
    })
    if (r.tipo === 'nada') return { texto: r.texto, saida: 'fixo' }
    if (r.tipo === 'no_palacio') {
      const link = await criarConfirmacao(admin, { workspaceId: p.workspaceId, userId: p.pessoa.id, acao: 'plano', alvoId: r.plano.id, dados: {} })
      if ('erro' in link) {
        await fluxo.falharNoPalacio(r.plano.id)
        return { texto: link.erro === 'limite' ? TEXTOS_FIXOS.limite_de_links : TEXTOS_FIXOS.sem_confirmacao_no_palacio, saida: 'fixo' }
      }
      await criarRegistroDoUso(admin, p.workspaceId, p.pessoa.id).fechar('confirmado', { planoId: r.plano.id })
      return { texto: textoDoLinkNoPalacio(link.url), saida: 'link' }
    }
    await criarRegistroDoUso(admin, p.workspaceId, p.pessoa.id).fechar('confirmado', { planoId: r.plano.id })
    return { texto: r.texto, saida: 'recibo' }
  } catch (causa) {
    console.error('[whatsapp] assistente: confirmação falhou:', p.pessoa.id, causa instanceof Error ? causa.name : '')
    return { texto: TEXTOS_FIXOS.fora_do_ar, saida: 'fixo' }
  }
}

/** Embrulha uma chamada do fluxo: o erro vira o valor de reserva (e o log, só com a classe). */
async function semLancar<T>(reserva: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (causa) {
    console.error('[whatsapp] assistente: plano:', causa instanceof Error ? causa.message : causa)
    return reserva
  }
}

/** Saiu: as mensagens que mostraram o plano ou a pergunta (com os botões numa segunda, as duas) e a hora da entrega. */
export const marcarEntrega = (admin: Admin, id: string, mensagens: (string | null)[]) => semLancar(null, () => fluxoDoPlano(admin).marcarEntrega(id, mensagens))
export const entregaFalhou = (admin: Admin, id: string) => semLancar(null, () => fluxoDoPlano(admin).entregaFalhou(id))
export const cancelarPlano = (admin: Admin, userId: string) => semLancar([], () => fluxoDoPlano(admin).cancelar(userId))
export const fecharPergunta = (admin: Admin, userId: string) => semLancar([], () => fluxoDoPlano(admin).fecharPergunta(userId))
export const marcarEmRevisao = (admin: Admin, id: string) => semLancar(null, () => fluxoDoPlano(admin).marcarEmRevisao(id))
export const rearmar = (admin: Admin, id: string, mensagemId: string | null) => semLancar(null, () => fluxoDoPlano(admin).rearmar(id, mensagemId))
