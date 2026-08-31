import type { Adapter } from './contrato'

/**
 * Mastodon. 500 caracteres é o padrão; cada instância pode configurar outro,
 * então o limite aqui é o conservador — passar dele depende da instância.
 */
export const mastodon: Adapter = {
  id: 'mastodon',
  nome: 'Mastodon',
  cor: 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300',
  formatos: [
    { id: 'texto', rotulo: 'Publicação', midia: { min: 0, max: 0, proporcaoPreferida: 'livre', video: 'nao' },
      texto: { max: 500, unidade: 'caracteres' } },
    { id: 'feed', rotulo: 'Com imagem', midia: { min: 1, max: 4, proporcaoPreferida: 'livre', video: 'nao' },
      texto: { max: 500, unidade: 'caracteres' } },
    { id: 'video', rotulo: 'Vídeo', midia: { min: 1, max: 1, proporcaoPreferida: 'livre', video: 'obrigatorio' },
      texto: { max: 500, unidade: 'caracteres' } },
  ],
  camposExtras: [],
}
