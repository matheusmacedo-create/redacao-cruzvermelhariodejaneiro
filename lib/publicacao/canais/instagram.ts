import type { Adapter } from './contrato'

export const instagram: Adapter = {
  id: 'instagram',
  nome: 'Instagram',
  cor: 'border-pink-300 bg-pink-50 text-pink-700 dark:border-pink-800 dark:bg-pink-950 dark:text-pink-300',
  formatos: [
    { id: 'feed', rotulo: 'Feed', midia: { min: 1, max: 10, proporcaoPreferida: '4:5', video: 'permitido' },
      texto: { max: 2_200, unidade: 'caracteres', dobra: 125, maxHashtags: 30 } },
    { id: 'stories', rotulo: 'Stories', midia: { min: 1, max: 1, proporcaoPreferida: '9:16', video: 'permitido', duracaoMaxima: 60 },
      texto: { max: 2_200, unidade: 'caracteres' } },
    { id: 'reels', rotulo: 'Reels', midia: { min: 1, max: 1, proporcaoPreferida: '9:16', video: 'obrigatorio', duracaoMaxima: 15 * 60 },
      texto: { max: 2_200, unidade: 'caracteres', dobra: 125, maxHashtags: 30 } },
  ],
  camposExtras: [
    { chave: 'firstComment', rotulo: 'Primeiro comentário', tipo: 'textarea', max: 2_200,
      formatos: ['feed', 'reels'],
      dica: 'Hashtags aqui deixam a legenda limpa. Publicado logo depois do post, pela própria conta.' },
  ],
}
