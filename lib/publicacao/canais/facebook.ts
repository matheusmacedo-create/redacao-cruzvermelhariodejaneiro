import type { Adapter } from './contrato'

export const facebook: Adapter = {
  id: 'facebook',
  nome: 'Facebook',
  cor: 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  formatos: [
    // Diferente do Instagram, a página aceita post sem mídia nenhuma.
    { id: 'texto', rotulo: 'Texto', midia: { min: 0, max: 0, proporcaoPreferida: 'livre', video: 'nao' },
      texto: { max: 63_206, unidade: 'caracteres', dobra: 125 } },
    { id: 'feed', rotulo: 'Feed', midia: { min: 0, max: 10, proporcaoPreferida: '1.91:1', video: 'permitido' },
      texto: { max: 63_206, unidade: 'caracteres', dobra: 125 } },
    { id: 'stories', rotulo: 'Stories', midia: { min: 1, max: 1, proporcaoPreferida: '9:16', video: 'permitido', duracaoMaxima: 60 },
      texto: { max: 63_206, unidade: 'caracteres' } },
    { id: 'reels', rotulo: 'Reels', midia: { min: 1, max: 1, proporcaoPreferida: '9:16', video: 'obrigatorio', duracaoMaxima: 90 },
      texto: { max: 63_206, unidade: 'caracteres', dobra: 125 } },
  ],
  camposExtras: [],
}
