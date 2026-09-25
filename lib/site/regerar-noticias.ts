import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withFtp, enviarArquivo } from '@/lib/publicacao/ftp'
import { slugValido } from '@/lib/site/slug'
import { prepararChatDoSite } from '@/lib/site/chat-do-site'
import { atualizarVitrine, descobrirRaizDoSite, noticiasPublicadas, publicarPaginasJuridicas, type NoticiaPublicada } from '@/lib/site/vitrine'
import {
  COLUNAS_DA_PECA, baseDoSite, gerarPaginaDaMateria, leitorDaBiblioteca, mensagemDaPublicacao, rastreioDaMateria, resumoDoRegistro,
  type PecaNoSite,
} from '@/lib/site/publicar-materia'

/**
 * Regera TODAS as matérias publicadas com o molde atual — e, no fim, o índice,
 * as páginas de base, o sitemap e o robots.
 *
 * Existe porque cada página é um arquivo estático gravado no dia em que foi
 * publicada: corrigir o gerador não corrige o que já está no ar. A regeração
 * refaz a página e as fotos de cada matéria a partir do banco, no mesmo
 * endereço e com as mesmas datas (a da primeira publicação e a da última
 * edição do texto — regerar não é editar).
 *
 * Em rodadas: cada chamada trabalha até perto do limite de tempo da função e
 * devolve de onde continuar; a tela chama de novo até acabar (o mesmo jeito
 * de "Atualizar as páginas do acervo"). A ordem é pelo id, e a continuação é
 * o id da última matéria vista — publicar ou tirar uma matéria no meio do
 * caminho não faz pular nem repetir as outras.
 *
 * O que NÃO se regera, e volta na lista de puladas:
 *  - matéria com texto editado depois da última publicação: regerar colocaria
 *    no ar um texto que ninguém mandou publicar. Ela se republica pela própria
 *    tela, depois de revisada;
 *  - matéria publicada em outro endereço (outra pasta, outro domínio): a
 *    regeração só escreve na pasta de notícias atual.
 */

export type Continuacao = { depoisDe: string | null; soVitrine: boolean }

export type ResultadoDaRegeracao = {
  /** Matérias no ar. */
  total: number
  /** Regeradas nesta rodada. */
  feitas: number
  /** Vistas nesta rodada (regeradas, puladas ou com falha). */
  vistas: number
  puladas: { titulo: string; motivo: string }[]
  falhas: { titulo: string; erro: string }[]
  /** Avisos das páginas regeradas (mídia ou link que ficou de fora). */
  avisos: { titulo: string; aviso: string }[]
  /** O índice, as páginas de base, o sitemap e o robots foram refeitos nesta rodada. */
  vitrine?: { feita: boolean; detalhes: string[] }
  /** De onde continuar; ausente quando acabou. */
  proximo?: Continuacao
}

const TAMANHO_DO_LOTE = 40
/** Edição até alguns segundos depois do registro da publicação é a própria publicação (relógios diferentes). */
const FOLGA_DO_RELOGIO_MS = 5000
const tempo = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : Number.NaN)

export async function regerarNoticias(p: {
  workspaceId: string
  userId: string
  continuacao?: Continuacao
  /** Até quando esta rodada pode começar trabalho novo (o limite da função menos a folga da resposta). */
  tempoMaximoMs: number
}): Promise<ResultadoDaRegeracao> {
  const inicio = Date.now()
  const noPrazo = (reserva = 0) => Date.now() - inicio + reserva < p.tempoMaximoMs
  const supabase = await createClient()
  const admin = createAdminClient()
  const base = baseDoSite()
  const depoisDe = p.continuacao?.depoisDe ?? null

  const { count } = await supabase
    .from('content_pieces').select('id', { count: 'exact', head: true })
    .eq('workspace_id', p.workspaceId).not('site_url', 'is', null)
  const resultado: ResultadoDaRegeracao = { total: count ?? 0, feitas: 0, vistas: 0, puladas: [], falhas: [], avisos: [] }

  let lote: PecaNoSite[] = []
  if (!p.continuacao?.soVitrine) {
    let consulta = supabase.from('content_pieces').select(COLUNAS_DA_PECA)
      .eq('workspace_id', p.workspaceId).not('site_url', 'is', null)
      .order('id', { ascending: true }).limit(TAMANHO_DO_LOTE)
    if (depoisDe) consulta = consulta.gt('id', depoisDe)
    const { data, error } = await consulta
    if (error) throw new Error('Não foi possível ler as matérias publicadas.')
    lote = (data ?? []) as PecaNoSite[]
  }

  // A última publicação de cada matéria: é contra ela que se mede se o texto
  // mudou depois (site_published_at é a PRIMEIRA publicação).
  const ultimaPublicacao = new Map<string, number>()
  if (lote.length) {
    const { data: registros } = await admin
      .from('activity_log').select('entity_id,created_at')
      .eq('workspace_id', p.workspaceId).eq('action', 'site_published')
      .in('entity_id', lote.map((m) => m.id))
    for (const r of registros ?? []) {
      const id = String(r.entity_id)
      ultimaPublicacao.set(id, Math.max(ultimaPublicacao.get(id) ?? 0, tempo(r.created_at as string)))
    }
  }

  let noAr: NoticiaPublicada[] = []
  try { noAr = await noticiasPublicadas(p.workspaceId) } catch { noAr = [] }
  const chat = await prepararChatDoSite()

  let ultimoVisto: string | null = depoisDe
  let loteInteiro = true

  await withFtp(async (client, config) => {
    for (const peca of lote) {
      // Cada matéria baixa as fotos, gera as versões e sobe tudo: começa só se
      // couber no prazo, com folga para ela e para a resposta.
      if (!noPrazo(8000)) { loteInteiro = false; break }
      ultimoVisto = peca.id
      resultado.vistas++
      const titulo = peca.title || 'Sem título'

      const slug = peca.slug || String(peca.site_url ?? '').replace(/\/+$/, '').split('/').pop() || ''
      if (!slugValido(slug)) { resultado.puladas.push({ titulo, motivo: 'o endereço gravado não é um endereço válido de matéria' }); continue }
      const url = `${base}/${slug}/`
      const gravada = String(peca.site_url ?? '').replace(/^http:\/\//i, 'https://').replace('://www.', '://')
      if (gravada !== url) { resultado.puladas.push({ titulo, motivo: `está publicada em outro endereço (${peca.site_url})` }); continue }

      const publicada = tempo(peca.site_published_at)
      const editada = tempo(peca.updated_at)
      const marco = Math.max(Number.isNaN(publicada) ? 0 : publicada, ultimaPublicacao.get(peca.id) ?? 0)
      if (!Number.isNaN(editada) && editada > marco + FOLGA_DO_RELOGIO_MS) {
        resultado.puladas.push({ titulo, motivo: 'o texto foi editado depois da última publicação — revise e republique pela própria matéria' })
        continue
      }

      const publicadoEm = new Date(Number.isNaN(publicada) ? (Number.isNaN(editada) ? Date.now() : editada) : publicada)
      const modificadoEm = !Number.isNaN(editada) && editada > publicadoEm.getTime() ? new Date(editada) : publicadoEm
      try {
        const pagina = await gerarPaginaDaMateria({
          lerArquivo: leitorDaBiblioteca(supabase, p.workspaceId),
          peca,
          slug,
          base,
          publicadoEm,
          modificadoEm,
          relacionadas: noAr.filter((n) => n.url !== url).slice(0, 8).map((n) => ({ titulo: n.titulo, url: n.url, publicadaEm: n.publicadaEm })),
          rastreio: await rastreioDaMateria(p.workspaceId, peca.id),
          chat,
        })
        for (const arquivo of pagina.paraSubir) await enviarArquivo(client, config, `${slug}/${arquivo.nome}`, arquivo.bytes)
        await enviarArquivo(client, config, `${slug}/index.html`, pagina.html)
        // A capa pode ter mudado de arquivo (o PNG antigo virou o JPEG
        // canônico): o índice precisa do nome novo. Só a capa — as datas e o
        // texto não mudam, e o gancho da trilha não dispara.
        const capa = pagina.capa?.url ?? null
        if (capa !== peca.site_cover_url) {
          await supabase.from('content_pieces').update({ site_cover_url: capa })
            .eq('id', peca.id).eq('workspace_id', p.workspaceId)
          noAr = noAr.map((n) => (n.url === url ? { ...n, capa, capaLargura: pagina.capa?.largura, capaAltura: pagina.capa?.altura } : n))
        }
        const aviso = resumoDoRegistro(pagina.registro)
        if (aviso) resultado.avisos.push({ titulo, aviso })
        resultado.feitas++
      } catch (causa) {
        resultado.falhas.push({ titulo, erro: mensagemDaPublicacao(causa) })
      }
    }

    const acabouAsMaterias = p.continuacao?.soVitrine || (loteInteiro && lote.length < TAMANHO_DO_LOTE)
    if (!acabouAsMaterias) {
      resultado.proximo = { depoisDe: ultimoVisto, soVitrine: false }
      return
    }
    // Todas as matérias vistas: o índice, as páginas de base, o sitemap e o
    // robots. Sem tempo para isso nesta rodada, fica para a próxima.
    if (!noPrazo(15000)) {
      resultado.proximo = { depoisDe: ultimoVisto, soVitrine: true }
      return
    }
    const detalhes: string[] = []
    const agora = new Date()
    try {
      const raiz = await descobrirRaizDoSite(client, config)
      if (!raiz) throw new Error('pasta do site não encontrada')
      await publicarPaginasJuridicas(client, raiz, agora)
      detalhes.push('/privacidade/ e /termos/ regeradas')
    } catch (causa) {
      detalhes.push(`atenção: as páginas de base não subiram (${causa instanceof Error ? causa.message : 'erro'})`)
    }
    const vitrine = await atualizarVitrine(client, config, p.workspaceId, agora)
    if (vitrine.indice) detalhes.push(`/noticias/ regerada (${vitrine.noticias} matéria(s))`)
    if (vitrine.sitemap) detalhes.push('sitemap.xml e robots.txt regerados')
    if (vitrine.aviso) detalhes.push(`atenção: ${vitrine.aviso}`)
    resultado.vitrine = { feita: vitrine.indice && vitrine.sitemap, detalhes }
  })

  return resultado
}
