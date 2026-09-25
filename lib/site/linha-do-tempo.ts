import { textoParaRede } from '@/lib/publicacao/texto-plano'

/**
 * A linha do tempo da central de notícias: tudo que a instituição publicou,
 * em todos os canais, numa corrente só.
 *
 * As matérias do site abrem a página como manchete e fila; isto aqui é o
 * resto da vida editorial — o post do Instagram, o do Facebook, o do
 * LinkedIn — que antes só existia dentro de cada rede, invisível para quem
 * chega pelo site.
 *
 * Duas fontes contam a mesma história: os destinos publicados pelo hub e o
 * registro de disparos (que inclui o tempo de antes do hub). Um post pode
 * estar nos dois — por isso a fusão de-duplica pelo par canal + começo do
 * texto, e fica com a cópia que tem o endereço do post.
 */

export type ItemDaLinha = {
  canal: string
  texto: string
  url?: string
  quando: Date
}

export const NOME_DO_CANAL: Record<string, string> = {
  instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', x: 'X',
  threads: 'Threads', bluesky: 'Bluesky', tiktok: 'TikTok', youtube: 'YouTube',
  pinterest: 'Pinterest', google_business: 'Perfil da Empresa', newsletter: 'Newsletter',
  telegram: 'Telegram', discord: 'Discord', mastodon: 'Mastodon',
}

/** O texto como o público leu: sem marcação de matéria, curto, cortado em palavra. */
export function resumoDoPost(corpo: string, limite = 200): string {
  const limpo = textoParaRede(corpo ?? '').texto.replace(/\s+/g, ' ').trim()
  if (limpo.length <= limite) return limpo
  return `${limpo.slice(0, limite).replace(/\s+\S*$/, '')}…`
}

/** O começo do texto sem acento, pontuação nem caixa: o mesmo post, vindo de duas fontes, dá a mesma chave. */
export function textoComparavel(texto: string, limite = 60): string {
  return textoParaRede(texto ?? '').texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .slice(0, limite)
    .trim()
}

/**
 * A chave do eco: canal + começo do texto. Antes a chave era o endereço
 * quando havia um, e o texto quando não havia — e o mesmo post, com endereço
 * numa fonte e sem na outra, aparecia duas vezes. Post só de imagem (sem
 * texto) fica com o endereço, que é o que ele tem.
 */
const chave = (i: ItemDaLinha) => {
  const texto = textoComparavel(i.texto)
  return texto ? `txt:${i.canal}:${texto}` : `url:${i.url?.trim() ?? ''}`
}

/**
 * Funde as fontes, tira o eco e ordena do mais novo para o mais velho.
 * No eco fica a cópia que tem o endereço do post; entre duas iguais nisso, a
 * primeira fonte ganha — quem chama põe a mais confiável antes.
 */
export function fundirLinhaDoTempo(fontes: ItemDaLinha[][], teto = 80): ItemDaLinha[] {
  const porChave = new Map<string, ItemDaLinha>()
  for (const fonte of fontes) {
    for (const item of fonte) {
      if (!item.texto?.trim() && !item.url?.trim()) continue
      if (Number.isNaN(item.quando.getTime())) continue
      const k = chave(item)
      const antes = porChave.get(k)
      if (!antes || (!antes.url?.trim() && item.url?.trim())) porChave.set(k, item)
    }
  }
  return [...porChave.values()].sort((a, b) => b.quando.getTime() - a.quando.getTime()).slice(0, teto)
}
