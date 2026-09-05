import { contar, type UnidadeDeTexto } from '@/lib/publicacao/contagem'
import { adapter, formatoDoAdapter, type Aviso, type Mestre, type Variante } from '@/lib/publicacao/canais'
import { temMarcacaoVisivel, textoParaRede } from '@/lib/publicacao/texto-plano'

/**
 * Gera e valida a variante de um destino a partir do Mestre.
 *
 * O Mestre nunca vai para a API: cada destino recebe uma versão que cabe no
 * contrato daquele canal. O enxugamento segue a ordem do spec (cap. 7.2):
 * hashtags saem do corpo primeiro (para o primeiro comentário, quando o canal
 * tem), depois o corte cai no último parágrafo inteiro que caiba, depois no
 * último espaço — e nunca no meio de uma URL ou de uma @menção.
 */

const TOKEN_INTOCAVEL = /^(https?:\/\/\S+|www\.\S+|@[\w.]+)$/i
const SO_HASHTAGS = /^#[^\s#]+([ \t]+#[^\s#]+)*$/

export function gerarVariante(mestre: Mestre, canalId: string, formatoId: string): { variante: Variante; avisos: Aviso[] } {
  const canal = adapter(canalId)
  if (!canal) throw new Error(`Canal desconhecido: ${canalId}`)
  const formato = formatoDoAdapter(canal, formatoId)
  if (!formato) throw new Error(`${canal.nome} não publica no formato ${formatoId}.`)

  const extras: Record<string, string> = {}
  // O mestre é escrito no formato da matéria. A página do site entende esse
  // formato; nenhuma rede social entende — lá a marcação sai literal na
  // legenda. Converter aqui, antes de contar e de enxugar, é o que faz o
  // contador medir o texto que a rede vai receber de fato.
  let corpo = canalId === 'site_web' ? mestre.corpo.trim() : textoParaRede(mestre.corpo).texto

  // 1. Link do mestre entra no fim do corpo quando o canal não tem campo
  //    próprio de link (nas redes atuais, é sempre no corpo). O X fica de
  //    fora: o conector apaga endereços clicáveis antes de publicar, então
  //    colar o link ali só deixaria um parágrafo vazio no tuíte.
  if (mestre.linkUrl && canalId !== 'site_web' && canalId !== 'x' && !corpo.includes(mestre.linkUrl)) {
    corpo = corpo ? `${corpo}\n\n${mestre.linkUrl}` : mestre.linkUrl
  }

  // 2. Enxugadores, na ordem, só se estourar o limite.
  const suportaFirstComment = canal.camposExtras.some((c) => c.chave === 'firstComment')
  if (contar(corpo, formato.texto.unidade) > formato.texto.max) {
    const { corpoSem, hashtags } = separarHashtags(corpo)
    if (hashtags && suportaFirstComment) {
      corpo = corpoSem
      extras.firstComment = hashtags
    } else if (hashtags && contar(corpoSem, formato.texto.unidade) <= formato.texto.max) {
      // Sem first comment, só remove as hashtags se isso resolver sozinho:
      // apagar hashtags E cortar texto seria perder duas coisas de uma vez.
      corpo = corpoSem
    }
  }
  if (contar(corpo, formato.texto.unidade) > formato.texto.max) {
    corpo = cortar(corpo, formato.texto.max, formato.texto.unidade)
  }

  // 3. Mídias: respeita o teto do formato. Vídeo obrigatório sem vídeo é
  //    resolvido na validação, não aqui — a geração não adivinha tipo.
  const fileIds = mestre.fileIds.slice(0, formato.midia.max)

  let variante: Variante = { corpo, extras, fileIds }
  if (canal.aoGerar) variante = canal.aoGerar(variante, mestre, formatoId)

  return { variante, avisos: validarVariante(variante, canalId, formatoId) }
}

/**
 * O que a Biblioteca sabe sobre um arquivo e a validação precisa saber.
 *
 * A autorização de uso de imagem entra aqui, e não numa checagem separada na
 * hora do disparo, porque o problema não é técnico: é que alguém escolheu uma
 * foto que não pode sair. Isso tem de aparecer enquanto se edita, junto do
 * resto — descobrir na hora de publicar é descobrir tarde.
 */
export type DadosDoArquivo = {
  tipo?: 'foto' | 'video'
  /** 'authorized' | 'pending' | 'internal' — como está na Biblioteca. */
  autorizacao?: string
}

/**
 * Confere a variante contra o contrato do canal.
 *
 * `porArquivo` é opcional porque nem todo chamador tem a Biblioteca em
 * mãos; quando vem, as regras de vídeo do formato passam a valer de verdade —
 * mandar vídeo para um formato que só aceita foto falha na API com uma
 * mensagem que ninguém decifra — e a autorização de uso passa a ser conferida.
 */
export function validarVariante(
  variante: Variante,
  canalId: string,
  formatoId: string,
  porArquivo?: Record<string, DadosDoArquivo>,
): Aviso[] {
  const canal = adapter(canalId)
  if (!canal) return [{ nivel: 'erro', mensagem: `Canal desconhecido: ${canalId}` }]
  const formato = formatoDoAdapter(canal, formatoId)
  if (!formato) return [{ nivel: 'erro', mensagem: `${canal.nome} não publica neste formato.` }]

  const avisos: Aviso[] = []
  const tamanho = contar(variante.corpo, formato.texto.unidade)

  if (tamanho > formato.texto.max) {
    avisos.push({ nivel: 'erro', mensagem: `Texto com ${tamanho} ${nomeDaUnidade(formato.texto.unidade)}; o limite é ${formato.texto.max}.` })
  } else if (formato.texto.dobra && tamanho > formato.texto.dobra) {
    avisos.push({ nivel: 'aviso', mensagem: `Acima de ${formato.texto.dobra} o texto é cortado com "ver mais" (${tamanho} no total).` })
  }

  if (formato.texto.maxHashtags) {
    const n = (variante.corpo.match(/#[^\s#]+/g) ?? []).length
    if (n > formato.texto.maxHashtags) {
      avisos.push({ nivel: 'erro', mensagem: `${n} hashtags; o máximo é ${formato.texto.maxHashtags}.` })
    }
  }

  if (variante.fileIds.length < formato.midia.min) {
    avisos.push({ nivel: 'erro', mensagem: formato.midia.video === 'obrigatorio' ? 'Este formato exige um vídeo.' : 'Este formato exige mídia.' })
  }
  if (variante.fileIds.length > formato.midia.max) {
    avisos.push({ nivel: 'erro', mensagem: `${variante.fileIds.length} mídias; o máximo é ${formato.midia.max}.` })
  }

  if (porArquivo) {
    const tipos = variante.fileIds.map((id) => porArquivo[id]?.tipo).filter(Boolean)
    if (formato.midia.video === 'obrigatorio' && tipos.some((t) => t !== 'video')) {
      avisos.push({ nivel: 'erro', mensagem: 'Este formato aceita apenas vídeo.' })
    }
    if (formato.midia.video === 'nao' && tipos.some((t) => t === 'video')) {
      avisos.push({ nivel: 'erro', mensagem: 'Este formato não aceita vídeo — só foto.' })
    }

    // Autorização de uso de imagem. O disparo já barra (lib/publicacao/
    // arquivos.ts), mas barrar lá é avisar tarde: a peça já foi dada como
    // pronta, aprovada, agendada — e falha na hora em que deveria sair.
    const semAutorizacao = variante.fileIds.filter((id) => {
      const estado = porArquivo[id]?.autorizacao
      return estado !== undefined && estado !== 'authorized'
    })
    if (semAutorizacao.length) {
      const interna = semAutorizacao.some((id) => porArquivo[id]?.autorizacao === 'internal')
      avisos.push({
        nivel: 'erro',
        mensagem: interna
          ? 'Há mídia marcada como uso interno nesta peça. Material de terceiro serve de referência na tela e não sai publicado em nome da Cruz Vermelha.'
          : `${semAutorizacao.length === 1 ? 'A mídia escolhida ainda não tem' : `${semAutorizacao.length} mídias escolhidas ainda não têm`} autorização de uso de imagem. Confirme a autorização na mídia antes de publicar.`,
      })
    }
  }

  // Marcação da matéria numa legenda de rede social sai literal para o leitor.
  // Aviso e não erro: pode ser uma legenda antiga, e travar a publicação por
  // causa de um asterisco seria pior do que mostrar o problema.
  if (canalId !== 'site_web' && temMarcacaoVisivel(variante.corpo)) {
    avisos.push({
      nivel: 'aviso',
      mensagem: 'A legenda tem marcação de texto (**, ##, ![foto]) que a rede publica literalmente. Use "Limpar marcação".',
    })
  }

  // O que a IA acrescentou por conta própria fica entre ⟦ ⟧ até alguém
  // conferir. Erro, e não aviso: é conteúdo não apurado, em qualquer canal —
  // inclusive na página do site.
  if (/[⟦⟧]/u.test(variante.corpo)) {
    avisos.push({
      nivel: 'erro',
      mensagem: 'O texto tem acréscimos da IA entre ⟦ ⟧ ainda não conferidos. Confirme ou apague os colchetes antes de publicar.',
    })
  }

  if (canal.validarExtras) avisos.push(...canal.validarExtras(variante, formatoId))
  return avisos
}

export function temErro(avisos: Aviso[]): boolean {
  return avisos.some((a) => a.nivel === 'erro')
}

function nomeDaUnidade(unidade: UnidadeDeTexto): string {
  if (unidade === 'ponderado_x') return 'caracteres (na régua do X: URL vale 23, emoji vale 2)'
  if (unidade === 'grafemas') return 'grafemas'
  return 'caracteres'
}

/**
 * Separa o bloco final de hashtags do corpo. Só o bloco final: uma #hashtag no
 * meio de uma frase faz parte da frase.
 */
export function separarHashtags(texto: string): { corpoSem: string; hashtags: string } {
  const linhas = texto.trimEnd().split('\n')
  const doFim: string[] = []
  while (linhas.length) {
    const linha = linhas[linhas.length - 1].trim()
    if (!linha) { linhas.pop(); continue }
    if (SO_HASHTAGS.test(linha)) { doFim.unshift(linhas.pop()!.trim()); continue }
    break
  }
  return { corpoSem: linhas.join('\n').trimEnd(), hashtags: doFim.join(' ') }
}

/**
 * Corta o texto no limite sem partir o que não pode ser partido.
 * Primeiro tenta o último parágrafo inteiro que caiba; depois recua palavra a
 * palavra — URL e @menção são atômicas — e fecha com reticências.
 */
export function cortar(texto: string, max: number, unidade: UnidadeDeTexto): string {
  if (contar(texto, unidade) <= max) return texto

  // Parágrafo inteiro
  const paragrafos = texto.split(/\n{2,}/)
  for (let n = paragrafos.length - 1; n >= 1; n--) {
    const tentativa = paragrafos.slice(0, n).join('\n\n')
    if (contar(tentativa, unidade) <= max) return tentativa
  }

  // Palavra a palavra, preservando tokens atômicos
  const palavras = texto.split(/\s+/)
  let fim = palavras.length
  while (fim > 0) {
    const tentativa = `${palavras.slice(0, fim).join(' ')}…`
    if (contar(tentativa, unidade) <= max) return tentativa
    fim--
  }

  // Uma palavra só já estoura (ex.: URL gigante num limite minúsculo):
  // corta caracteres mesmo, mas nunca no meio de URL/mention — nesse caso
  // devolve vazio com reticências para o validador acusar.
  const unica = palavras[0] ?? ''
  if (TOKEN_INTOCAVEL.test(unica)) return '…'
  let corte = ''
  for (const ch of unica) {
    if (contar(`${corte}${ch}…`, unidade) > max) break
    corte += ch
  }
  return `${corte}…`
}
