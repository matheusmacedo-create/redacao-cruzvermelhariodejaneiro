import type { Adapter } from './contrato'

export const bluesky: Adapter = {
  id: 'bluesky',
  nome: 'Bluesky',
  cor: 'border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
  formatos: [
    // O limite é em grafemas: "família👨‍👩‍👧" conta o emoji composto como 1.
    { id: 'texto', rotulo: 'Texto', midia: { min: 0, max: 0, proporcaoPreferida: 'livre', video: 'nao' },
      texto: { max: 300, unidade: 'grafemas' } },
    { id: 'feed', rotulo: 'Post', midia: { min: 0, max: 4, proporcaoPreferida: '1:1', video: 'permitido' },
      texto: { max: 300, unidade: 'grafemas' } },
  ],
  camposExtras: [],
}
