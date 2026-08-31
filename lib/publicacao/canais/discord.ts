import type { Adapter } from './contrato'

/** Discord, pelo webhook conectado. Mensagem de 2.000 caracteres, até 10 anexos. */
export const discord: Adapter = {
  id: 'discord',
  nome: 'Discord',
  cor: 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  formatos: [
    { id: 'texto', rotulo: 'Mensagem', midia: { min: 0, max: 0, proporcaoPreferida: 'livre', video: 'nao' },
      texto: { max: 2_000, unidade: 'caracteres' } },
    { id: 'feed', rotulo: 'Com imagem', midia: { min: 1, max: 10, proporcaoPreferida: 'livre', video: 'nao' },
      texto: { max: 2_000, unidade: 'caracteres' } },
    { id: 'video', rotulo: 'Vídeo', midia: { min: 1, max: 1, proporcaoPreferida: 'livre', video: 'obrigatorio' },
      texto: { max: 2_000, unidade: 'caracteres' } },
  ],
  camposExtras: [],
}
