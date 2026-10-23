import { createHash } from 'node:crypto'

/**
 * O nome do MP3 na pasta da matéria: muda quando muda o texto, a voz ou o modelo — e só aí. Republicar a mesma matéria
 * acha o arquivo que já está no ar e não gasta crédito de novo; editar o texto gera outro. Fora de regras.ts porque
 * usa node:crypto, e regras.ts também vai para o navegador (a tela de Configurações › Voz).
 */
export function nomeDoAudio(texto: string, vozId: string, modelo: string): string {
  const h = createHash('sha256').update(`${vozId}\u0000${modelo}\u0000${texto}`).digest('hex').slice(0, 12)
  return `ouvir-${h}.mp3`
}
