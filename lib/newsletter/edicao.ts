import { newsletter } from '@/lib/publicacao/canais/newsletter'

/**
 * A edição escrita na própria Newsletter ("Nova edição", 19/11/2026), sem rede nem banco. Conferido em
 * scripts/conferir-newsletter-edicao.ts.
 *
 * Até essa data só havia um caminho para mandar uma edição: abrir Publicações, montar um pacote e acrescentar o
 * destino "Newsletter". Quem abria a Newsletter para mandar um aviso à lista não achava onde escrever. A tela nova
 * (app/(app)/newsletter/nova) é o caminho curto: assunto, texto, prévia, teste e envio. O caminho do pacote continua
 * valendo para a notícia que sai junto no site e nas redes.
 *
 * Este módulo é o que a tela e a ação do servidor têm em comum: limpar o que foi digitado e dizer o que impede o
 * envio. A tela usa para avisar enquanto a pessoa escreve; o servidor confere de novo com a mesma função, porque a
 * tela pode estar desatualizada e e-mail enviado não volta. As regras do assunto são as do canal
 * (lib/publicacao/canais/newsletter.ts): uma edição não pode valer aqui e ser recusada lá.
 */

export type RascunhoDaEdicao = {
  assunto: string
  /** A linha que a caixa de entrada mostra ao lado do assunto. Opcional. */
  chamada: string
  /** O texto, com uma linha em branco entre os parágrafos. */
  texto: string
  /** Endereço do botão no fim da mensagem. Opcional; sem ele a edição sai sem botão. */
  link: string
  rotuloDoBotao: string
}

export const RASCUNHO_VAZIO: RascunhoDaEdicao = { assunto: '', chamada: '', texto: '', link: '', rotuloDoBotao: '' }

export const LIMITES = { assunto: 90, chamada: 140, texto: 8_000, rotuloDoBotao: 40, link: 500 } as const

export type EdicaoPronta = {
  assunto: string
  chamada?: string
  paragrafos: string[]
  urlDaMateria?: string
  rotuloDoBotao?: string
}

export type Conferencia = {
  /** O que impede o envio. Vazio = pode enviar. */
  erros: string[]
  /** O que vale rever, sem impedir. */
  avisos: string[]
  edicao: EdicaoPronta
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v : '').replace(/\r\n?/g, '\n').slice(0, max * 4)

/** Lê o que veio da tela (ou do rascunho guardado no aparelho) sem confiar no formato. */
export function lerRascunho(bruto: unknown): RascunhoDaEdicao {
  const r = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>
  return {
    assunto: texto(r.assunto, LIMITES.assunto).replace(/\s+/g, ' '),
    chamada: texto(r.chamada, LIMITES.chamada).replace(/\s+/g, ' '),
    texto: texto(r.texto, LIMITES.texto),
    link: texto(r.link, LIMITES.link).trim(),
    rotuloDoBotao: texto(r.rotuloDoBotao, LIMITES.rotuloDoBotao).replace(/\s+/g, ' '),
  }
}

/** Parágrafos: separados por linha em branco; quebra simples dentro do parágrafo vira espaço. */
export function paragrafosDe(textoDigitado: string): string[] {
  return textoDigitado.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)
}

/**
 * O link do botão, pronto para o e-mail, ou null se não serve. Só https: cliente de e-mail marca http como inseguro, e
 * "javascript:" ou "mailto:" num botão de leitura seria erro ou coisa pior. Quem digita "site.org/pagina" quis dizer
 * https.
 */
export function linkDoBotao(digitado: string): string | null {
  const limpo = digitado.trim()
  if (!limpo) return null
  const comProtocolo = /^[a-z][a-z0-9+.-]*:/i.test(limpo) ? limpo : `https://${limpo}`
  try {
    const url = new URL(comProtocolo)
    if (url.protocol !== 'https:' || !url.hostname.includes('.') || /\s/.test(limpo)) return null
    return url.toString()
  } catch {
    return null
  }
}

export function conferirEdicao(bruto: unknown): Conferencia {
  const r = lerRascunho(bruto)
  const assunto = r.assunto.trim()
  const chamada = r.chamada.trim()
  const rotulo = r.rotuloDoBotao.trim()
  const paragrafos = paragrafosDe(r.texto)
  const corpo = paragrafos.join('\n\n')

  const erros: string[] = []
  const avisos: string[] = []

  // As regras do assunto e do texto vazio são as do canal: a mesma edição, pelo pacote, passa pela mesma conferência.
  for (const aviso of newsletter.validarExtras?.({ corpo, extras: { assunto }, fileIds: [] }, 'edicao') ?? []) {
    ;(aviso.nivel === 'erro' ? erros : avisos).push(aviso.mensagem)
  }

  if (chamada.length > LIMITES.chamada) erros.push(`A chamada tem ${chamada.length} caracteres; o limite é ${LIMITES.chamada}.`)
  if (corpo.length > LIMITES.texto) {
    erros.push(`O texto tem ${corpo.length} caracteres; o limite é ${LIMITES.texto}. Acima disso o Gmail corta a mensagem, e o link de saída some junto.`)
  }
  if (rotulo.length > LIMITES.rotuloDoBotao) erros.push(`O texto do botão tem ${rotulo.length} caracteres; o limite é ${LIMITES.rotuloDoBotao}.`)

  const url = linkDoBotao(r.link)
  if (r.link.trim() && !url) erros.push('O link do botão não é um endereço válido. Use um endereço completo, começando por https://.')
  if (!r.link.trim() && rotulo) avisos.push('Você escreveu o texto do botão, mas não o link: sem link, o botão não aparece.')

  return {
    erros,
    avisos,
    edicao: {
      assunto,
      ...(chamada ? { chamada } : {}),
      paragrafos,
      ...(url ? { urlDaMateria: url, ...(rotulo ? { rotuloDoBotao: rotulo } : {}) } : {}),
    },
  }
}

/** Minutos em que a mesma edição (mesmo assunto) não sai de novo: a defesa contra o toque duplo no "Enviar". */
export const MINUTOS_SEM_REPETIR = 10
