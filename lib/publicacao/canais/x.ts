import type { Adapter } from './contrato'

export const x: Adapter = {
  id: 'x',
  nome: 'X',
  cor: 'border-neutral-400 bg-neutral-100 text-neutral-800 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200',
  formatos: [
    // 280 é a dobra, não o teto: acima disso o conector quebra em thread
    // automaticamente. O aviso existe para ninguém publicar uma thread sem
    // querer; o erro só vem no limite real.
    { id: 'texto', rotulo: 'Texto', midia: { min: 0, max: 0, proporcaoPreferida: 'livre', video: 'nao' },
      texto: { max: 25_000, unidade: 'ponderado_x', dobra: 280 } },
    { id: 'feed', rotulo: 'Post', midia: { min: 0, max: 4, proporcaoPreferida: '16:9', video: 'permitido' },
      texto: { max: 25_000, unidade: 'ponderado_x', dobra: 280 } },
  ],
  camposExtras: [],
}
