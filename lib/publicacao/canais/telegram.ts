import type { Adapter } from './contrato'

/**
 * Telegram, pelo bot conectado. O limite muda com a mídia: mensagem de texto
 * vai a 4.096 caracteres, mas legenda de foto ou vídeo para em 1.024 — e o
 * que passa disso o Telegram corta sozinho, sem avisar ninguém.
 */
export const telegram: Adapter = {
  id: 'telegram',
  nome: 'Telegram',
  cor: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300',
  formatos: [
    { id: 'texto', rotulo: 'Mensagem', midia: { min: 0, max: 0, proporcaoPreferida: 'livre', video: 'nao' },
      texto: { max: 4_096, unidade: 'caracteres' } },
    { id: 'feed', rotulo: 'Com foto', midia: { min: 1, max: 10, proporcaoPreferida: 'livre', video: 'nao' },
      texto: { max: 1_024, unidade: 'caracteres' } },
    { id: 'video', rotulo: 'Vídeo', midia: { min: 1, max: 1, proporcaoPreferida: 'livre', video: 'obrigatorio' },
      texto: { max: 1_024, unidade: 'caracteres' } },
  ],
  camposExtras: [],
}
