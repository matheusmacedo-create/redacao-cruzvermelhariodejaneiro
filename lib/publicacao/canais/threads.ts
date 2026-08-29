import type { Adapter } from './contrato'

export const threads: Adapter = {
  id: 'threads',
  nome: 'Threads',
  cor: 'border-neutral-400 bg-neutral-100 text-neutral-800 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200',
  formatos: [
    { id: 'texto', rotulo: 'Texto', midia: { min: 0, max: 0, proporcaoPreferida: 'livre', video: 'nao' },
      texto: { max: 25_000, unidade: 'caracteres', dobra: 500 } },
    { id: 'feed', rotulo: 'Post', midia: { min: 0, max: 10, proporcaoPreferida: '1:1', video: 'permitido' },
      texto: { max: 25_000, unidade: 'caracteres', dobra: 500 } },
  ],
  camposExtras: [],
}
