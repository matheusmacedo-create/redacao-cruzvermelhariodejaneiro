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
 * estar nos dois — por isso a fusão de-duplica pelo endereço do post e, na
 * falta dele, pelo par canal+começo do texto.
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

const chave = (i: ItemDaLinha) =>
  i.url?.trim() ? `url:${i.url.trim()}` : `txt:${i.canal}:${resumoDoPost(i.texto, 60).toLowerCase()}`

/**
 * Funde as fontes, tira o eco e ordena do mais novo para o mais velho.
 * A primeira fonte ganha o desempate — quem chama põe a mais confiável antes.
 */
export function fundirLinhaDoTempo(fontes: ItemDaLinha[][], teto = 80): ItemDaLinha[] {
  const vistos = new Set<string>()
  const saida: ItemDaLinha[] = []
  for (const fonte of fontes) {
    for (const item of fonte) {
      if (!item.texto?.trim() && !item.url) continue
      if (Number.isNaN(item.quando.getTime())) continue
      const k = chave(item)
      if (vistos.has(k)) continue
      vistos.add(k)
      saida.push(item)
    }
  }
  return saida.sort((a, b) => b.quando.getTime() - a.quando.getTime()).slice(0, teto)
}
