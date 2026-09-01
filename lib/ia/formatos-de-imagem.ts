/**
 * Os formatos de imagem da matéria — os três lugares onde a arte vive.
 *
 * A proporção certa nasce no gerador, não no corte depois: 16:9 abre a
 * página no site, 4:5 é o retrato que o feed premia, 9:16 toma a tela no
 * Stories. A tela lê daqui; a action valida contra isto; ninguém hardcoda.
 */

export interface FormatoDeImagem {
  id: 'site' | 'feed' | 'stories'
  rotulo: string
  explica: string
  proporcao: string
}

export const FORMATOS_DE_IMAGEM: FormatoDeImagem[] = [
  { id: 'site', rotulo: 'Site', explica: 'Capa da matéria na página — paisagem (16:9).', proporcao: '16:9' },
  { id: 'feed', rotulo: 'Feed', explica: 'Instagram e Facebook — retrato (4:5).', proporcao: '4:5' },
  { id: 'stories', rotulo: 'Stories', explica: 'Tela cheia vertical (9:16).', proporcao: '9:16' },
]

export const formatoDeImagem = (id: string) => FORMATOS_DE_IMAGEM.find((f) => f.id === id)
