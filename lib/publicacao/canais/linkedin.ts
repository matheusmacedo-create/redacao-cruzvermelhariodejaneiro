import type { Adapter } from './contrato'

export const linkedin: Adapter = {
  id: 'linkedin',
  nome: 'LinkedIn',
  cor: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300',
  formatos: [
    { id: 'texto', rotulo: 'Texto', midia: { min: 0, max: 0, proporcaoPreferida: 'livre', video: 'nao' },
      texto: { max: 3_000, unidade: 'caracteres', dobra: 140 } },
    { id: 'feed', rotulo: 'Post', midia: { min: 0, max: 9, proporcaoPreferida: '1.91:1', video: 'permitido' },
      texto: { max: 3_000, unidade: 'caracteres', dobra: 140 } },
  ],
  camposExtras: [],
}
