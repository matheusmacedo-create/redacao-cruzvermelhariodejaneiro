'use server'

import { requireWorkspace } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { withFtp, baixarTexto, regravarPaginaListada } from '@/lib/publicacao/ftp'
import { candidatosDeIndex } from '@/lib/site/formulario-newsletter'
import { ligarAnalyticsNaPagina, temAnalytics, ID_DO_ANALYTICS } from '@/lib/site/analytics'
import type { Client } from 'basic-ftp'

/**
 * Liga o Google Analytics em TODAS as páginas do site institucional.
 *
 * A home já tinha o gtag; as páginas de notícia geradas por aqui e as páginas
 * soltas (equipe, campanha, privacidade…) não. Novas páginas já nascem com o
 * bloco pelo gerador; esta ação completa o que JÁ ESTÁ no servidor.
 *
 * As mesmas regras do enxerto da newsletter, porque o risco é o mesmo — FTP
 * com acesso ao servidor inteiro:
 *  - SÓ ADMIN.
 *  - A pasta do site é DESCOBERTA pelo conteúdo (a home tem a seção da
 *    newsletter), nunca adivinhada.
 *  - Só toca em .html com </head>; página que já tem QUALQUER gtag não ganha
 *    um segundo — com dois, cada visita conta duas vezes.
 *  - IDEMPOTENTE: rodar de novo não muda nada.
 *  - CONFERE DEPOIS: busca uma página pública alterada para provar que a
 *    mudança está no ar.
 */

export type ResultadoDoAnalytics = {
  erro?: string
  recado?: string
  ligadas?: string[]
  jaTinham?: number
  puladas?: string[]
  confirmado?: boolean
}

const MAX_PAGINAS = 150
const MAX_PROFUNDIDADE = 3
/** Pastas que não são páginas do site — não vale a viagem nem o risco. */
const PASTAS_IGNORADAS = new Set(['assets', 'css', 'js', 'img', 'images', 'fonts', 'cgi-bin', 'error_docs'])

export async function ligarAnalyticsDoSite(): Promise<ResultadoDoAnalytics> {
  try {
    const context = await requireWorkspace()
    if (context.role !== 'admin') throw new Error('Só um administrador pode alterar as páginas do site.')

    const resultado = await withFtp(async (client, config) => {
      // Descobre a pasta do site pela home — mesma técnica do enxerto da
      // newsletter: o conteúdo identifica, o caminho não.
      await client.cd('/')
      const naRaiz = await client.list()
      const pastasDaRaiz = naRaiz.filter((i) => i.isDirectory).map((i) => i.name)
      let pastasDeDomains: string[] = []
      if (pastasDaRaiz.includes('domains')) {
        try {
          await client.cd('/domains')
          pastasDeDomains = (await client.list()).filter((i) => i.isDirectory).map((i) => i.name)
          await client.cd('/')
        } catch { /* sem listar domains, os outros candidatos seguem */ }
      }

      let pastaDoSite = ''
      for (const caminho of candidatosDeIndex({ baseDir: config.baseDir, pastasDaRaiz, pastasDeDomains })) {
        try {
          const html = await baixarTexto(client, caminho)
          if (html.includes('newsletter-section') || temAnalytics(html)) {
            pastaDoSite = caminho.slice(0, caminho.lastIndexOf('/')) || '/'
            break
          }
        } catch { /* candidato sem index: segue */ }
      }
      if (!pastaDoSite) {
        return { ok: false as const, detalhe: 'Não encontrei a pasta do site pela home. Me diga qual é a pasta e eu acrescento.' }
      }

      // Anda pela pasta do site juntando as páginas .html.
      const paginas: string[] = []
      await listarHtml(client, pastaDoSite, 0, paginas)

      const ligadas: string[] = []
      const puladas: string[] = []
      let jaTinham = 0
      for (const caminho of paginas) {
        let html: string
        try { html = await baixarTexto(client, caminho) } catch { puladas.push(`${caminho} (não consegui ler)`); continue }
        const troca = ligarAnalyticsNaPagina(html)
        if (troca.estado === 'ja-ligado') { jaTinham++; continue }
        if (troca.estado === 'recusado') { puladas.push(`${caminho} (${troca.detalhe})`); continue }
        await regravarPaginaListada(client, caminho, troca.html)
        ligadas.push(caminho.slice(pastaDoSite.length) || '/')
      }

      return { ok: true as const, pastaDoSite, ligadas, puladas, jaTinham }
    })

    if (!resultado.ok) return { erro: resultado.detalhe }

    // A prova pública: uma das páginas alteradas tem de mostrar o bloco.
    let confirmado = false
    if (resultado.ligadas.length) {
      try {
        const caminho = resultado.ligadas[0].replace(/index\.html$/, '')
        const res = await fetch(`https://cruzvermelhariodejaneiro.org${caminho}`, { cache: 'no-store' })
        confirmado = temAnalytics(await res.text())
      } catch { /* rede: a conferência falha, a gravação não se desfaz */ }
    }

    if (resultado.ligadas.length) {
      await createAdminClient().from('activity_log').insert({
        workspace_id: context.workspace.id,
        actor_id: context.user.id,
        action: 'analytics_ligado_no_site',
        entity_type: 'site',
        metadata: { id: ID_DO_ANALYTICS, ligadas: resultado.ligadas.slice(0, 50), jaTinham: resultado.jaTinham, confirmado },
      })
    }

    const partes = [
      resultado.ligadas.length
        ? `Analytics ligado em ${resultado.ligadas.length} página(s).`
        : 'Nenhuma página precisava: todas já carregam o Analytics.',
      resultado.jaTinham ? `${resultado.jaTinham} já tinham.` : '',
      resultado.puladas.length ? `${resultado.puladas.length} pulada(s) por segurança.` : '',
      resultado.ligadas.length ? (confirmado ? 'Conferido no ar.' : 'Gravado — a conferência pública não respondeu ainda; veja daqui a pouco.') : '',
    ].filter(Boolean)

    return {
      recado: partes.join(' '),
      ligadas: resultado.ligadas,
      jaTinham: resultado.jaTinham,
      puladas: resultado.puladas,
      confirmado,
    }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível ligar o Analytics no site.') }
  }
}

/** Junta os .html da pasta, descendo até o limite — o site é raso, e limite é o que impede a varredura de virar aventura. */
async function listarHtml(client: Client, pasta: string, profundidade: number, saida: string[]): Promise<void> {
  if (profundidade > MAX_PROFUNDIDADE || saida.length >= MAX_PAGINAS) return
  let itens
  try { await client.cd(pasta); itens = await client.list() } catch { return }
  for (const item of itens) {
    if (saida.length >= MAX_PAGINAS) return
    const caminho = `${pasta.replace(/\/$/, '')}/${item.name}`
    if (item.isDirectory) {
      if (item.name.startsWith('.') || PASTAS_IGNORADAS.has(item.name.toLowerCase())) continue
      await listarHtml(client, caminho, profundidade + 1, saida)
    } else if (item.isFile && item.name.toLowerCase().endsWith('.html')) {
      saida.push(caminho)
    }
  }
}
