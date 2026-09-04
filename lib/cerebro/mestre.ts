import type { CanalCerebro, MidiaDaPauta, PautaDoCerebro } from './contrato'
import { DESTINO_POR_CANAL } from './contrato'
import { gerarVariante, temErro, validarVariante } from '@/lib/publicacao/variantes'
import type { Mestre } from '@/lib/publicacao/canais'

/**
 * Da pauta do Cérebro para um pacote pronto de trabalhar.
 *
 * A legenda crua do Instagram não serve de mestre: o título vinha cortado com
 * reticências, as hashtags entravam no meio do texto da matéria e o plano do
 * Cérebro aparecia nos destinos como se fosse a peça. Aqui a legenda vira o
 * que o hub espera — título limpo, linha fina, corpo em parágrafos com as
 * hashtags num bloco final — e cada destino nasce da mesma `gerarVariante`
 * que o botão "Regerar" usa. O plano do Cérebro vai para as notas, que é o
 * lugar de orientação, não de peça.
 */

const TETO_TITULO = 110
const TETO_LINHA_FINA = 190
const TETO_PARAGRAFO = 320
const TETO_HASHTAGS = 12

/** O que a importação grava em cada destino; falta só workspace e pacote. */
export type DestinoPlanejado = {
  canal: string
  formato: string
  corpo: string
  extras: Record<string, string>
  file_ids: string[]
  estado: 'gerada' | 'bloqueada'
  /** Peça escrita à parte (a IA redigiu a legenda): o mestre não a sobrescreve. */
  descolada?: boolean
}

/** Peças por canal que vieram prontas — da IA — em vez de derivadas do mestre. */
export type PecasProntas = {
  feed?: string
  stories?: string
}

export function mestreDaPauta(
  p: PautaDoCerebro,
  capaFalhou?: string,
): { corpo: string; titulo: string; subtitulo: string; notas: string; linkUrl: string } {
  const legenda = (p.resumo || p.titulo || '').trim()
  const { corpo: semTags, hashtags } = separarHashtagsFinais(legenda)

  // Boletim oficial abre com a manchete em caixa alta ("CBMERJ ATIVA QUARTEL
  // EM PARAÍBA DO SUL Nesta terça..."): ela é o título, e repeti-la no corpo
  // só faria a matéria gritar duas vezes.
  const boletim = tituloDeBoletim(semTags)
  const texto = boletim ? boletim.resto : semTags
  const frasesDoTexto = semFragmentoCortado(frases(texto), legenda)

  const titulo = boletim
    ? boletim.titulo
    : limparFimDeTitulo(cortarEmPalavra(frasesDoTexto[0] ?? p.titulo.replace(/…$/u, ''), TETO_TITULO))

  return {
    corpo: corpoDeMateria(frasesDoTexto, hashtags, p),
    titulo: titulo || 'Sugestão do Cérebro',
    subtitulo: linhaFina(frasesDoTexto, boletim !== null, p),
    notas: notasDaPauta(p, capaFalhou),
    linkUrl: p.fato.url,
  }
}

/**
 * A mídia da pauta pode entrar na peça? Material da filial entra (como
 * `pending`, até alguém confirmar quem aparece na foto). Material de terceiro
 * fica na Biblioteca como referência: o Cérebro é explícito em que ele não
 * viaja para uma peça da Cruz.
 */
export function capaPodeIrParaPeca(midia: MidiaDaPauta | null): boolean {
  return Boolean(midia && (midia.podePublicar || midia.daCasa))
}

/** Fonte de uso interno alimenta decisão de equipe, nunca conteúdo público. */
export function fonteDeUsoInterno(p: PautaDoCerebro): boolean {
  return (
    p.canais.length > 0 &&
    p.canais.every((c) => !c.usar) &&
    p.proibido.some((x) => /publicação pública/i.test(x))
  )
}

/**
 * Os destinos que o Cérebro liberou, já com a peça gerada.
 *
 * Antes a importação criava site, feed e stories para qualquer sinal —
 * inclusive quando o plano dizia NÃO em dois deles, e dois de três destinos
 * nasciam vermelhos. Agora só nasce o canal com `usar: true` no plano; o
 * site entra sempre que o Cérebro não vetou publicação pública, porque é a
 * base de onde as redes saem (e o hub a garante ao abrir de todo jeito).
 * Reels só quando o sinal é vídeo e o plano liberou — e mesmo aí sem anexo,
 * porque a capa que trazemos é a foto de capa, não o vídeo.
 *
 * O que nasce sem mídia utilizável nasce `bloqueada`, com o erro dizendo o
 * que falta. Peça que a IA redigiu (`pecas`) entra descolada: o autosave do
 * mestre não a sobrescreve com a legenda derivada.
 */
export function planejarDestinos(p: PautaDoCerebro, mestre: Mestre, pecas: PecasProntas = {}): DestinoPlanejado[] {
  if (fonteDeUsoInterno(p)) return []

  const liberado = (canal: CanalCerebro) => p.canais.some((c) => c.canal === canal && c.usar)

  const formatos: { canal: string; formato: string; fileIds: string[]; pronta?: string }[] = [
    { canal: 'site_web', formato: 'materia', fileIds: mestre.fileIds },
  ]
  if (liberado('feed')) formatos.push({ canal: 'instagram', formato: 'feed', fileIds: mestre.fileIds, pronta: pecas.feed })
  if (liberado('stories')) formatos.push({ canal: 'instagram', formato: 'stories', fileIds: mestre.fileIds, pronta: pecas.stories })
  if (liberado('reels') && p.midia?.tipo === 'video' && capaPodeIrParaPeca(p.midia)) {
    formatos.push({ canal: 'instagram', formato: 'reels', fileIds: [] })
  }

  return formatos.map(({ canal, formato, fileIds, pronta }) => {
    const { variante, avisos } = gerarVariante({ ...mestre, fileIds }, canal, formato)
    if (pronta?.trim()) {
      const escrita = { ...variante, corpo: pronta.trim() }
      return {
        canal,
        formato,
        corpo: escrita.corpo,
        extras: escrita.extras,
        file_ids: escrita.fileIds,
        estado: temErro(validarVariante(escrita, canal, formato)) ? 'bloqueada' : 'gerada',
        descolada: true,
      }
    }
    return {
      canal,
      formato,
      corpo: variante.corpo,
      extras: variante.extras,
      file_ids: variante.fileIds,
      estado: temErro(avisos) ? 'bloqueada' : 'gerada',
    }
  })
}

/* ------------------------------------------------------------------ */
/* Título e linha fina                                                 */
/* ------------------------------------------------------------------ */

/**
 * O bloco inicial em caixa alta de um boletim, quando existe. Precisa de pelo
 * menos três palavras com letra maiúscula — "O 7 de Setembro" não conta.
 */
function tituloDeBoletim(texto: string): { titulo: string; resto: string } | null {
  const tokens = texto.split(' ')
  let n = 0
  while (n < tokens.length && !/\p{Ll}/u.test(tokens[n]!)) n++
  if (tokens.slice(0, n).filter((t) => /\p{Lu}/u.test(t)).length < 3) return null
  const titulo = tokens.slice(0, n).join(' ').replace(/[|\s·—–-]+$/u, '').trim()
  if (titulo.length < 15 || titulo.length > TETO_TITULO) return null
  return { titulo, resto: tokens.slice(n).join(' ').trim() }
}

/**
 * A linha fina são as frases seguintes ao título que caibam inteiras. Quando
 * nenhuma cabe, entra a ficha da publicação — cortar uma frase no meio para
 * caber viraria o mesmo defeito das reticências no título.
 */
function linhaFina(frasesDoTexto: string[], tituloEhBoletim: boolean, p: PautaDoCerebro): string {
  // Sem boletim, a primeira frase virou o título; a linha fina começa depois.
  const candidatas = frasesDoTexto.slice(tituloEhBoletim ? 0 : 1)
  let saida = ''
  for (const f of candidatas) {
    const junto = saida ? `${saida} ${f}` : f
    if (junto.length > TETO_LINHA_FINA) break
    saida = junto
  }
  if (saida) return saida

  const quando = dataPorExtenso(p.fato.quando)
  const conta = p.fato.conta ? ` (${p.fato.conta})` : ''
  return `${p.fato.fonte}${conta}${quando ? `, em ${quando}` : ''}.`
}

function cortarEmPalavra(texto: string, teto: number): string {
  const limpo = texto.trim()
  if (limpo.length <= teto) return limpo
  const corte = limpo.slice(0, teto + 1)
  const espaco = corte.lastIndexOf(' ')
  return espaco > teto * 0.4 ? corte.slice(0, espaco) : corte.slice(0, teto)
}

/**
 * Ponto final não pertence a manchete; exclamação e interrogação sim. E um
 * corte por largura pode parar numa palavra de ligação — "…representantes da
 * Associação de Bombeiros Civis do" — que fica pendurada sem o que vinha
 * depois; ela sai também, até sobrar palavra com conteúdo.
 */
const PALAVRA_PENDURADA =
  /\s+(?:[aoe]|[ao]s|à|às|aos?|ou|d[aoe]s?|em|n[ao]s?|um(?:as?)?|uns|para|pra|por|com|sem|que|se|seus?|suas?|noss[ao]s?)$/iu

function limparFimDeTitulo(titulo: string): string {
  let t = titulo.replace(/[.\s,;:—–-]+$/u, '').trim()
  for (let antes = ''; antes !== t; ) {
    antes = t
    t = t.replace(PALAVRA_PENDURADA, '').replace(/[,;:—–-]+$/u, '').trim()
  }
  return t
}

/* ------------------------------------------------------------------ */
/* Corpo em formato de matéria                                         */
/* ------------------------------------------------------------------ */

function corpoDeMateria(frasesDoTexto: string[], hashtags: string[], p: PautaDoCerebro): string {
  const blocos = [...emParagrafos(frasesDoTexto), paragrafoDeFonte(p)]
  if (hashtags.length) blocos.push(hashtags.slice(0, TETO_HASHTAGS).join(' '))
  return blocos.join('\n\n')
}

function frases(texto: string): string[] {
  return texto
    .split(/(?<=[.!?…])\s+/u)
    .map((f) => f.trim())
    .filter(Boolean)
}

/**
 * O Cérebro entrega a legenda com um teto de caracteres; quando o corte caiu
 * no meio de uma frase, a última "frase" é um toco ("...credenciamento e
 * alinha"). Publicar o toco é pior do que fechar no último ponto final.
 */
function semFragmentoCortado(fs: string[], legenda: string): string[] {
  const ultima = fs[fs.length - 1]
  if (fs.length > 1 && ultima && legenda.length >= 560 && !/[.!?…)"”]$/u.test(ultima)) {
    return fs.slice(0, -1)
  }
  return fs
}

/** A legenda chega achatada numa linha só; parágrafos voltam por frase. */
function emParagrafos(fs: string[], teto = TETO_PARAGRAFO): string[] {
  const paragrafos: string[] = []
  let atual = ''
  for (const f of fs) {
    const junto = atual ? `${atual} ${f}` : f
    if (junto.length > teto && atual) {
      paragrafos.push(atual)
      atual = f
    } else {
      atual = junto
    }
  }
  if (atual) paragrafos.push(atual)
  return paragrafos
}

/**
 * O crédito, como parágrafo da matéria. No site o link sai clicável; nas
 * redes a conversão para texto simples escreve o endereço por extenso —
 * crédito é a única exigência que atravessa todos os canais.
 */
function paragrafoDeFonte(p: PautaDoCerebro): string {
  const quando = dataPorExtenso(p.fato.quando)
  const quem = p.fato.conta ? `${p.fato.fonte} (${p.fato.conta})` : p.fato.fonte
  return `Com informações de ${quem}${quando ? `, publicadas em ${quando}` : ''} — [publicação original](${p.fato.url}).`
}

/** Bloco final de hashtags separado do texto: no feed ele fecha a legenda. */
function separarHashtagsFinais(texto: string): { corpo: string; hashtags: string[] } {
  const tokens = texto.trim().split(/\s+/)
  const tags: string[] = []
  while (tokens.length && /^#[^\s#]+$/u.test(tokens[tokens.length - 1]!)) {
    tags.unshift(tokens.pop()!)
  }
  return { corpo: tokens.join(' '), hashtags: [...new Set(tags)] }
}

function dataPorExtenso(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/* ------------------------------------------------------------------ */
/* Notas: o raciocínio e as travas, fora do texto publicável           */
/* ------------------------------------------------------------------ */

function notasDaPauta(p: PautaDoCerebro, capaFalhou?: string): string {
  const notas = [
    `Sugerido pelo Cérebro · nota ${p.decisao.nota}/100 · ${p.decisao.modoRotulo}.`,
    'Cada destino já nasceu com a peça gerada a partir deste mestre. Ajuste o texto aqui e "Regerar" propaga; apague os destinos que não quiser.',
    '',
    'POR QUE APARECEU',
    ...p.decisao.porque.map((x) => `· ${x}`),
    '',
    'O QUE O CÉREBRO FARIA EM CADA CANAL',
  ]

  for (const c of p.canais) {
    const rotulo = DESTINO_POR_CANAL[c.canal]?.rotulo ?? c.canal
    notas.push(`· ${rotulo} — ${c.usar ? 'faria' : 'NÃO faria'} (${c.formato}).`)
    if (c.texto) notas.push(`  ${c.texto.replace(/\n/gu, ' ')}`)
    if (c.cta && c.cta !== '—') notas.push(`  Encaminhamento: ${c.cta}`)
    if (c.midia && c.midia !== '—') notas.push(`  Mídia: ${c.midia}`)
  }

  notas.push('', 'NÃO PODE', ...p.proibido.map((x) => `· ${x}`))

  if (p.midia) {
    notas.push('', 'CAPA DO SINAL', `· ${p.midia.credito} — direito: ${p.midia.direito}.`)
    if (capaFalhou) {
      notas.push(`· A capa não pôde ser trazida (${capaFalhou}). Veja no link da fonte abaixo.`)
    } else if (p.midia.daCasa) {
      notas.push(
        '· Material da própria filial, na Biblioteca como PENDENTE. Confirme a autorização de quem aparece na foto antes de publicar.',
      )
    } else {
      notas.push(
        '· Material de terceiro, na Biblioteca como INTERNO. Serve de referência e não sai publicado em nome da Cruz — use arte própria ou foto autorizada da filial.',
      )
    }
  }

  if (p.agrupados && p.agrupados.quantidade > 0) {
    notas.push('', `Junto com este sinal, o Cérebro agrupou mais ${p.agrupados.quantidade} boletim(ns) semelhante(s) da mesma conta.`)
  }

  notas.push('', `Fonte: ${p.fato.fonte} — ${p.fato.url}`)
  if (p.urlNoCerebro) notas.push(`Raciocínio completo: ${p.urlNoCerebro}`)
  return notas.join('\n')
}
