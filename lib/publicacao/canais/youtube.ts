import type { Adapter, Aviso, Variante } from './contrato'

/**
 * YouTube. O único canal em que o texto do post é a descrição, e o título é
 * campo separado e obrigatório — sem ele a API recusa o envio.
 */
export const youtube: Adapter = {
  id: 'youtube',
  nome: 'YouTube',
  cor: 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
  formatos: [
    { id: 'video', rotulo: 'Vídeo', midia: { min: 1, max: 1, proporcaoPreferida: '16:9', video: 'obrigatorio' },
      texto: { max: 5_000, unidade: 'caracteres' } },
  ],
  camposExtras: [
    { chave: 'youtubeTitulo', rotulo: 'Título do vídeo', tipo: 'texto', max: 100,
      dica: 'Obrigatório. Aparece na busca e na página do vídeo; o texto acima vira a descrição.' },
    { chave: 'youtubePrivacidade', rotulo: 'Visibilidade', tipo: 'select', opcoes: ['public', 'unlisted', 'private'],
      dica: 'public = público · unlisted = não listado · private = privado. Em branco, publica como público.' },
  ],
  aoGerar(variante, mestre): Variante {
    if (mestre.titulo && !variante.extras.youtubeTitulo) {
      return { ...variante, extras: { ...variante.extras, youtubeTitulo: mestre.titulo.slice(0, 100) } }
    }
    return variante
  },
  validarExtras(variante): Aviso[] {
    if (!variante.extras.youtubeTitulo?.trim()) {
      return [{ nivel: 'erro', mensagem: 'O YouTube exige um título para o vídeo.' }]
    }
    return []
  },
}
