import type { Adapter, Aviso, Variante } from './contrato'

/**
 * Reddit. Diferente de toda rede daqui, o Reddit separa título e corpo: o
 * título é obrigatório, tem 300 caracteres, e o texto do post é o corpo. Sem
 * o subreddit de destino a API não tem para onde publicar.
 */
export const reddit: Adapter = {
  id: 'reddit',
  nome: 'Reddit',
  cor: 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300',
  formatos: [
    { id: 'texto', rotulo: 'Texto', midia: { min: 0, max: 0, proporcaoPreferida: 'livre', video: 'nao' },
      texto: { max: 5_000, unidade: 'caracteres' } },
    { id: 'feed', rotulo: 'Com foto', midia: { min: 1, max: 1, proporcaoPreferida: 'livre', video: 'nao' },
      texto: { max: 5_000, unidade: 'caracteres' } },
    { id: 'video', rotulo: 'Vídeo', midia: { min: 1, max: 1, proporcaoPreferida: 'livre', video: 'obrigatorio' },
      texto: { max: 5_000, unidade: 'caracteres' } },
  ],
  camposExtras: [
    { chave: 'subreddit', rotulo: 'Subreddit', tipo: 'texto', max: 50,
      dica: 'Sem o "r/". Ex.: riodejaneiro. Obrigatório — é para onde o post vai.' },
    { chave: 'redditTitulo', rotulo: 'Título do post', tipo: 'texto', max: 300,
      dica: 'Obrigatório. No Reddit o título é o que aparece na lista; o texto acima é o corpo.' },
    { chave: 'redditFlairId', rotulo: 'Flair (ID)', tipo: 'texto',
      dica: 'Opcional. Alguns subreddits exigem flair; o ID vem das regras do subreddit.' },
  ],
  aoGerar(variante, mestre): Variante {
    if (mestre.titulo && !variante.extras.redditTitulo) {
      return { ...variante, extras: { ...variante.extras, redditTitulo: mestre.titulo.slice(0, 300) } }
    }
    return variante
  },
  validarExtras(variante): Aviso[] {
    const avisos: Aviso[] = []
    if (!variante.extras.subreddit?.trim()) {
      avisos.push({ nivel: 'erro', mensagem: 'O Reddit exige o subreddit de destino.' })
    }
    if (!variante.extras.redditTitulo?.trim()) {
      avisos.push({ nivel: 'erro', mensagem: 'O Reddit exige um título para o post.' })
    }
    return avisos
  },
}
