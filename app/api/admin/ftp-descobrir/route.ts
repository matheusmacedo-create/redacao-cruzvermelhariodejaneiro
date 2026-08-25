import { NextResponse } from 'next/server'
import { Readable } from 'node:stream'
import { requireAdmin } from '@/lib/session'
import { ftpConfig, withFtp, FtpConfigError, type TlsMode } from '@/lib/publicacao/ftp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Descobre sozinho qual pasta do FTP corresponde ao site publicado.
 *
 * Por que existe: o campo de diretório do painel da Hostinger mostra o prefixo
 * cortado, então quem cria a conta não vê onde ela vai parar. O resultado foram
 * várias rodadas de tentativa e erro — conta na raiz do site, conta numa pasta
 * irmã de public_html que a web não serve.
 *
 * Em vez de continuar adivinhando, isto mede: grava um arquivo em cada pasta
 * candidata e busca na web para ver qual delas aparece. O que volta é o valor
 * exato de FTP_BASE_DIR, sem palpite.
 */

type Achado = {
  pasta: string
  gravou: boolean
  urlQueRespondeu: string | null
  detalhe: string
}

const RAIZ_DO_SITE = 'https://cruzvermelhariodejaneiro.org'

/** Onde o arquivo pode aparecer, e o que cada acerto significa. */
const DESTINOS = [
  { sufixo: '', significado: 'esta pasta é a raiz do site' },
  { sufixo: '/noticias', significado: 'esta pasta é a raiz do site (notícias fica dentro)' },
]

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

  const modos: TlsMode[] = ['ftps-estrito', 'ftps-sem-verificar', 'sem-tls']
  const achados: Achado[] = []
  let recomendacao: string | null = null
  let conectado: TlsMode | null = null

  for (const modo of modos) {
    try {
      await withFtp(async (client) => {
        conectado = modo

        // Candidatas: a própria raiz da conta e as pastas de primeiro nível que
        // costumam abrigar o site. Lista curta de propósito — cada uma custa
        // uma gravação e duas buscas.
        const itens = await client.list()
        const subpastas = itens.filter((i) => i.isDirectory).map((i) => i.name)
        const candidatas = ['.', ...['public_html', 'noticias', 'htdocs'].filter((n) => subpastas.includes(n))]
        for (const nome of subpastas) {
          if (nome === 'public_html' && !candidatas.includes('public_html/noticias')) {
            candidatas.push('public_html/noticias')
          }
        }

        for (const pasta of candidatas) {
          const nomeTemp = `cvrj-sonda-${Date.now()}.txt`
          let gravou = false
          try {
            await client.cd('/')
            if (pasta !== '.') await client.cd(pasta)
            await client.uploadFrom(Readable.from(['sonda\n']), nomeTemp)
            gravou = true

            let acertou: string | null = null
            let significado = ''
            for (const destino of DESTINOS) {
              const url = `${RAIZ_DO_SITE}${destino.sufixo}/${nomeTemp}`
              try {
                const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12_000) })
                if (r.ok) { acertou = url; significado = destino.significado; break }
              } catch { /* uma URL que não responde só elimina a candidata */ }
            }

            achados.push({
              pasta: pasta === '.' ? '(raiz da conta)' : pasta,
              gravou: true,
              urlQueRespondeu: acertou,
              detalhe: acertou ? significado : 'gravou, mas não aparece na web',
            })

            // A recomendação é sempre o caminho que leva à pasta de notícias.
            if (acertou && !recomendacao) {
              const base = pasta === '.' ? '' : `/${pasta}`
              recomendacao = acertou.includes('/noticias/') ? base || '/' : `${base}/noticias`
            }
          } catch (cause) {
            achados.push({
              pasta: pasta === '.' ? '(raiz da conta)' : pasta,
              gravou: false,
              urlQueRespondeu: null,
              detalhe: (cause instanceof Error ? cause.message : String(cause)).slice(0, 160),
            })
          } finally {
            // Sonda que fica para trás vira lixo no servidor da instituição.
            if (gravou) { try { await client.remove(nomeTemp) } catch { /* já era */ } }
          }
        }
      }, modo)
      break
    } catch {
      // Modo de TLS que não conecta apenas cede a vez ao próximo.
    }
  }

  if (!conectado) {
    return NextResponse.json({
      ok: false,
      mensagem: 'Não foi possível conectar ao FTP com nenhum modo de TLS.'
        + ' Confira FTP_USER e FTP_PASSWORD antes de rodar esta descoberta.',
    }, { status: 502 })
  }

  return NextResponse.json({
    ok: Boolean(recomendacao),
    conectado,
    baseDirAtual: config.baseDir,
    recomendacao,
    instrucao: recomendacao
      ? recomendacao === config.baseDir
        ? `FTP_BASE_DIR já está correto (${recomendacao}). O problema é outro.`
        : `Troque FTP_BASE_DIR para "${recomendacao}" na Vercel e faça Redeploy.`
      : 'Nenhuma pasta visível por esta conta aparece no site.'
        + ' A conta foi criada fora de public_html — recrie-a deixando o diretório no padrão.',
    achados,
  })
}
