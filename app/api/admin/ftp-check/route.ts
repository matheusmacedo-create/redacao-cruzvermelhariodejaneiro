import { NextResponse } from 'next/server'
import { Readable } from 'node:stream'
import { requireAdmin } from '@/lib/session'
import { ftpConfig, withFtp, FtpConfigError, type TlsMode } from '@/lib/publicacao/ftp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Probe = { etapa: string; ok: boolean; detalhe: string }

/**
 * A mensagem de erro do servidor de FTP é útil para diagnóstico, mas pode ecoar
 * o que mandamos — inclusive o usuário. A senha nunca aparece nela, e mesmo
 * assim recortamos qualquer ocorrência antes de devolver ao navegador.
 */
function seguro(erro: unknown, password: string): string {
  const texto = erro instanceof Error ? erro.message : String(erro)
  return texto.split(password).join('«senha»').slice(0, 300)
}

export async function GET() {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) }

  let config
  try {
    config = ftpConfig()
  } catch (cause) {
    if (cause instanceof FtpConfigError) {
      return NextResponse.json({ ok: false, faltando: cause.missing, mensagem: cause.message }, { status: 503 })
    }
    throw cause
  }

  const probes: Probe[] = [{
    etapa: 'variáveis de ambiente',
    ok: true,
    // Host e usuário não são segredo; a senha só aparece como comprimento.
    detalhe: `host=${config.host} user=${config.user} baseDir=${config.baseDir} senha=${config.password.length} caracteres`,
  }]

  // Da conexão mais segura para a menos segura, parando na primeira que passar.
  // O objetivo não é "conseguir de qualquer jeito" — é saber exatamente até
  // onde este servidor chega, para decidir com dado e não com suposição.
  const modos: TlsMode[] = ['ftps-estrito', 'ftps-sem-verificar', 'sem-tls']
  let conectado: TlsMode | null = null

  for (const modo of modos) {
    try {
      await withFtp(async (client) => { await client.pwd() }, modo)
      probes.push({ etapa: `conexão (${modo})`, ok: true, detalhe: 'autenticou' })
      conectado = modo
      break
    } catch (cause) {
      probes.push({ etapa: `conexão (${modo})`, ok: false, detalhe: seguro(cause, config.password) })
    }
  }

  if (!conectado) {
    return NextResponse.json({ ok: false, conectado: null, probes }, { status: 502 })
  }

  const nomeTemp = `.cvrj-diagnostico-${Date.now()}.txt`
  let raiz = ''

  try {
    await withFtp(async (client) => {
      raiz = await client.pwd()
      probes.push({ etapa: 'pasta ao entrar', ok: true, detalhe: raiz })

      const itens = await client.list()
      probes.push({
        etapa: 'listagem',
        ok: true,
        detalhe: itens.length
          ? itens.slice(0, 20).map((item) => `${item.isDirectory ? 'dir ' : 'arq '}${item.name}`).join(', ')
          : '(pasta vazia — esperado numa pasta recém-criada)',
      })

      // Escrita e remoção: é o que o publicador vai fazer de verdade. Falhar
      // aqui com a conexão funcionando aponta para permissão da conta FTP.
      const corpo = 'Arquivo temporário de diagnóstico da Redação. Pode ser apagado.\n'
      await client.uploadFrom(Readable.from([corpo]), nomeTemp)
      probes.push({ etapa: 'gravar arquivo', ok: true, detalhe: nomeTemp })

      const depois = await client.list()
      const gravou = depois.some((item) => item.name === nomeTemp)
      probes.push({ etapa: 'confirmar gravação', ok: gravou, detalhe: gravou ? 'apareceu na listagem' : 'NÃO apareceu na listagem' })

      await client.remove(nomeTemp)
      probes.push({ etapa: 'apagar arquivo', ok: true, detalhe: 'removido' })
    }, conectado)
  } catch (cause) {
    probes.push({ etapa: 'escrita', ok: false, detalhe: seguro(cause, config.password) })
    return NextResponse.json({ ok: false, conectado, probes }, { status: 502 })
  }

  // As tentativas de conexão descartadas não contam como falha: sondar do modo
  // mais seguro para o menos seguro é o desenho, e a primeira reprovar é o
  // resultado esperado enquanto FTP_HOST for um IP.
  const falhou = probes.some((p) => !p.ok && !p.etapa.startsWith('conexão ('))

  return NextResponse.json({
    ok: !falhou,
    conectado,
    pastaEsperada: config.baseDir,
    aviso: raiz === '/' && config.baseDir === '/'
      ? 'A conta de FTP está na raiz do site, com permissão de escrita sobre o index.html mantido pela outra equipe. Aponte FTP_BASE_DIR para /noticias e, quando puder, recrie a conta limitada a /public_html/noticias.'
      : null,
    probes,
  })
}
