import type { PassoDoTour, Pergunta, Tarefa } from './tipos'

/**
 * "Ouvir" na ajuda (docs/AJUDA.md §12): o texto que a voz da filial lê para cada peça da ajuda, e o código que
 * identifica esse texto. Puro e sem 'server-only': o botão (no navegador) e a rota do áudio (no servidor) montam o
 * mesmo texto e chegam ao mesmo código.
 *
 * O áudio é pedido pelo código do texto, e não pelo id da tarefa ou da pergunta: os ids se repetem entre áreas (a
 * mesma pergunta em Notificações e em Navegar), e o mesmo texto, onde quer que apareça, usa um áudio só. O servidor só
 * grava um texto cujo código ele reconhece na ajuda (lib/ajuda/ouvir-servidor.ts): ninguém usa a rota para gastar
 * crédito com um texto qualquer.
 */

/** Um texto acima disso é narrado em trechos (lib/voz/elevenlabs.ts, narrar); nenhum da ajuda chega perto. */
export const TETO_DO_TEXTO_FALADO = 6000

/** Espaços normalizados e um ponto no fim, para a voz fazer a pausa entre as partes. */
function frase(texto: string): string {
  const t = texto.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  return /[.!?…:;]$/.test(t) ? t : `${t}.`
}

const juntar = (partes: (string | null | undefined)[]) => partes.map((p) => frase(p ?? '')).filter(Boolean).join(' ')

/** Frases soltas emendadas num texto só, com a pausa da voz entre elas (o guia para começar, lib/ajuda/comecar.ts). */
export function textoCorrido(partes: (string | null | undefined)[]): string {
  return juntar(partes)
}

/** "Criar uma pauta. Passo 1: … Passo 2: … Dica: …". O exemplo fica de fora: é uma história, e a tela já a mostra. */
export function textoDaTarefa(t: Tarefa): string {
  return juntar([t.titulo, ...t.passos.map((p, i) => `Passo ${i + 1}: ${p}`), t.dica ? `Dica: ${t.dica}` : null])
}

/** A pergunta e a resposta, com os parágrafos emendados. */
export function textoDaPergunta(p: Pergunta): string {
  return juntar([p.pergunta, ...p.resposta.split(/\n{2,}/)])
}

/** Um balão do tour: o título e o texto. */
export function textoDoPassoDoTour(p: PassoDoTour): string {
  return juntar([p.titulo, p.texto])
}

/** Um termo do glossário (lib/ajuda/glossario.ts): a palavra e o que ela quer dizer. */
export function textoDoTermo(t: { termo: string; definicao: string }): string {
  return juntar([t.termo, t.definicao])
}

/** O "para que serve" de uma área (e, se houver, quem usa). */
export function textoDaArea(paraQueServe: string, quemUsa?: string | null): string {
  return juntar([paraQueServe, quemUsa ? `Quem usa: ${quemUsa}` : null])
}

/**
 * O código do texto: os 24 primeiros dígitos do SHA-256, pelo Web Crypto (existe no navegador e no Node 20+). É o
 * que vai no endereço do áudio (/api/ajuda/ouvir?c=…); o nome do arquivo guardado leva também a voz e o modelo.
 */
export async function codigoDoTexto(texto: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24)
}

export const ehCodigoDoTexto = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{24}$/.test(v)
