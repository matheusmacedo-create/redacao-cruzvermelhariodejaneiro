import { FORMATOS, redesDoFormato, type Formato } from '@/lib/publicacao/upload-post'

/** Limites reais de cada rede, para recusar aqui em vez de descobrir no erro
 * da API depois que metade das redes já publicou. */
export const LIMITE_DE_TEXTO: Record<string, number> = {
  x: 25_000,        // vira thread automaticamente acima de 280
  threads: 25_000,  // idem acima de 500
  bluesky: 300,
  instagram: 2_200,
  facebook: 63_206,
  linkedin: 3_000,
  pinterest: 500,
}

/**
 * Confere um post antes de ele virar linha no banco e chamada à API.
 *
 * `temMidia` e `midiaUrl` são coisas separadas de propósito. A mídia pode vir
 * da Biblioteca, e nesse caso não existe URL nenhuma para validar — só bytes
 * que o servidor vai ler depois. Antes isso era um parâmetro só: quando o
 * arquivo vinha da Biblioteca, passava-se a palavra "biblioteca" no lugar da
 * URL, e a conferência de URL logo abaixo estourava em cima dela. Nenhuma
 * publicação com arquivo da Biblioteca chegava a ser gravada.
 *
 * Mora fora do arquivo de server actions porque é lógica pura — dá para
 * conferir sem banco, sem rede e sem navegador, que foi o que faltou.
 */
export function validarPost(params: {
  formato: Formato
  redes: string[]
  corpo: string
  temMidia: boolean
  midiaUrl: string
}) {
  const { formato, redes, corpo, temMidia, midiaUrl } = params

  if (!redes.length) throw new Error('Escolha ao menos uma rede.')

  const permitidas = redesDoFormato(formato)
  const incompativel = redes.find((rede) => !permitidas.includes(rede))
  if (incompativel) {
    throw new Error(`${incompativel} não aceita ${FORMATOS[formato].rotulo}. Desmarque essa rede ou troque o formato.`)
  }

  // Stories não leva legenda: a Meta ignora o texto nesse formato. Exigir texto
  // aqui seria pedir trabalho que não vai aparecer em lugar nenhum.
  const exigeTexto = formato !== 'stories'
  if (exigeTexto && corpo.length < 2) throw new Error('Escreva o texto da publicação.')

  for (const rede of redes) {
    const limite = LIMITE_DE_TEXTO[rede]
    if (limite && corpo.length > limite) {
      throw new Error(`O texto tem ${corpo.length} caracteres e o limite do ${rede} é ${limite}.`)
    }
  }

  const midia = FORMATOS[formato].midia
  if (midia !== 'nenhuma' && !temMidia) {
    const oQue = midia === 'video' ? 'um vídeo' : midia === 'imagem' ? 'uma imagem' : 'uma imagem ou um vídeo'
    throw new Error(`${FORMATOS[formato].rotulo} exige ${oQue}. Envie um arquivo da Biblioteca ou cole uma URL https.`)
  }

  // Só há o que conferir quando a mídia veio por endereço.
  if (midiaUrl) {
    let url: URL
    try { url = new URL(midiaUrl) } catch { throw new Error('A URL da mídia é inválida.') }
    if (url.protocol !== 'https:') throw new Error('A URL da mídia precisa ser https.')
  }
}
