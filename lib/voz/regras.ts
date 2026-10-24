import { parseContentBlocks, textoDosTrechos } from '@/lib/content-blocks'

/**
 * A voz da instituição (ElevenLabs): as regras puras, conferidas por
 * `npx tsx scripts/conferir-voz.ts` sem rede e sem banco.
 *
 * Dois usos, os dois desligados por padrão (Configurações › Voz):
 *  - narração da matéria: ao publicar no site, o texto vira um MP3 que sobe
 *    para a pasta da matéria e a página ganha o "Ouça esta matéria";
 *  - resposta em áudio no WhatsApp: quem mandou áudio ao assistente recebe a
 *    resposta por escrito (sempre) e, logo depois, a mesma resposta falada.
 *
 * O áudio nunca substitui o texto: link, código e "confirmo" ficam só na
 * escrita, e o áudio não carrega nada que o texto não tenha.
 */

/** O modelo padrão: o atual da ElevenLabs para narração em português (até 10.000 caracteres por pedido). */
export const MODELO_PADRAO = 'eleven_v4'

/** Os modelos que a tela oferece. `eleven_flash_v2_5` é o rápido e barato; os outros dois, os de narração. */
export const MODELOS_DA_VOZ = [
  { valor: 'eleven_v4', rotulo: 'Eleven v4 (padrão: a melhor narração)' },
  { valor: 'eleven_multilingual_v2', rotulo: 'Multilingual v2 (o anterior, mais conhecido)' },
  { valor: 'eleven_flash_v2_5', rotulo: 'Flash v2.5 (mais rápido e mais barato)' },
] as const

export type ModeloDaVoz = (typeof MODELOS_DA_VOZ)[number]['valor']

export const ehModeloDaVoz = (v: unknown): v is ModeloDaVoz => MODELOS_DA_VOZ.some((m) => m.valor === v)

/** O id de voz da ElevenLabs: letras e números (ex.: 21m00Tcm4TlvDq8ikWAM). */
export const vozIdValido = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9]{8,40}$/.test(v)

/**
 * Tamanho de cada pedido. Os modelos aceitam 10.000 (o Flash, 40.000), mas o eleven_v4 leva mais de um minuto para
 * gerar 4.300 caracteres: pedidos menores, três por vez, terminam antes e, cortados em fim de parágrafo, a emenda não
 * se ouve (cada trecho leva o anterior e o seguinte como contexto).
 */
export const TAMANHO_DO_TRECHO = 2000

/** Matéria acima disso não é narrada (custo e tempo da publicação); a página sai sem o áudio, com aviso. */
export const TETO_DA_MATERIA = 30_000

/** Resposta do assistente acima disso não vira áudio: lista longa se lê, não se ouve. */
export const TETO_DO_WHATSAPP = 700

/** Abaixo disso não vale um áudio ("Pronto.", "Não achei."). */
export const MINIMO_DO_WHATSAPP = 20

const URL_SOLTA = /\bhttps?:\/\/\S+|\bwww\.\S+/gi

/** Espaços em ordem, sem URL solta, com pontuação no fim de cada parte (a voz respira no ponto, não na quebra de linha). */
function arrumar(parte: string): string {
  const t = parte.replace(URL_SOLTA, ' ').replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, ' ').trim()
  if (!t) return ''
  return /[.!?…:;]["”»)]?$/.test(t) ? t : `${t}.`
}

/**
 * O texto que a voz lê numa matéria: título, linha fina e corpo, na ordem da página. Fica de fora o que não se ouve —
 * foto, vídeo, áudio, legenda e crédito — e o endereço dos links (o texto do link fica). Parágrafos separados por
 * linha em branco: é por eles que `dividirEmTrechos` corta.
 */
export function textoParaNarrar(m: { titulo: string; subtitulo?: string | null; corpo?: string | null }): string {
  const partes: string[] = [arrumar(m.titulo), arrumar(m.subtitulo ?? '')]
  for (const b of parseContentBlocks(m.corpo)) {
    if (b.type === 'text' || b.type === 'heading' || b.type === 'quote') partes.push(arrumar(textoDosTrechos(b.inline)))
    else if (b.type === 'list') partes.push(b.items.map((i) => arrumar(textoDosTrechos(i))).filter(Boolean).join(' '))
  }
  return partes.filter(Boolean).join('\n\n')
}

/**
 * Divide em trechos de até `maximo` caracteres: no fim de parágrafo; o parágrafo maior que o trecho, no fim de frase;
 * a frase maior que o trecho (não acontece em texto de gente), no espaço. Nada se perde nem se repete.
 */
export function dividirEmTrechos(texto: string, maximo = TAMANHO_DO_TRECHO): string[] {
  const trechos: string[] = []
  let atual = ''
  const juntar = (parte: string, sep: string) => {
    if (!atual) atual = parte
    else if (atual.length + sep.length + parte.length <= maximo) atual += sep + parte
    else { trechos.push(atual); atual = parte }
  }
  for (const paragrafo of texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    if (paragrafo.length <= maximo) { juntar(paragrafo, '\n\n'); continue }
    const frases = paragrafo.match(/[^.!?…]+[.!?…]+["”»)]?\s*|[^.!?…]+$/g) ?? [paragrafo]
    let primeira = true
    for (const bruta of frases) {
      const frase = bruta.trim()
      if (!frase) continue
      const sep = primeira ? '\n\n' : ' '
      primeira = false
      if (frase.length <= maximo) { juntar(frase, sep); continue }
      let resto = frase
      while (resto.length > maximo) {
        const corte = resto.lastIndexOf(' ', maximo)
        const ate = corte > maximo / 2 ? corte : maximo
        juntar(resto.slice(0, ate).trim(), sep)
        resto = resto.slice(ate).trim()
      }
      if (resto) juntar(resto, ' ')
    }
  }
  if (atual) trechos.push(atual)
  return trechos
}

/** Os MP3 de narração antigos na pasta (para limpar depois de subir o novo). */
export const ehAudioDeNarracao = (nome: string) => /^ouvir-[0-9a-f]{12}\.mp3$/.test(nome)

/**
 * A resposta do assistente, pronta para falar: sem link (fica no texto, que vai antes), sem a marcação do WhatsApp
 * (*negrito*, _itálico_, ~riscado~, `código`), sem emoji e sem marcador de lista. null quando não vale um áudio:
 * curta demais, longa demais, ou o que sobra é quase só número (código, protocolo, telefone: isso se lê).
 */
export function textoParaFalarNoWhatsapp(texto: string): string | null {
  const t = texto
    .replace(URL_SOLTA, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_~`]+/g, '')
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/^\s*(?:[-•▪◦·]|\d{1,2}[.)])\s+/gm, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n+\s*/g, '\n')
    .trim()
  if (t.length < MINIMO_DO_WHATSAPP || t.length > TETO_DO_WHATSAPP) return null
  const digitos = (t.match(/\d/g) ?? []).length
  const letras = (t.match(/\p{L}/gu) ?? []).length
  if (letras < 15 || digitos > letras) return null
  // Uma linha por parte, com ponto: a voz pausa entre os itens de uma lista em vez de emendar.
  return t.split('\n').map(arrumar).filter(Boolean).join(' ')
}

/** Os primeiros bytes de um arquivo Ogg: só assim ele vai como mensagem de voz (a bolinha com play) no WhatsApp. */
export function ehOgg(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53
}

/** Os primeiros bytes de um MP3 (cabeçalho ID3 ou quadro de sincronia). */
export function ehMp3(bytes: Uint8Array): boolean {
  if (bytes.length < 3) return false
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0
}

/** A configuração que a tela grava (voz_config), já conferida. */
export type ConfigDaVoz = { vozId: string | null; vozNome: string | null; modelo: ModeloDaVoz; materias: boolean; whatsapp: boolean }

/** Lê o que veio da tela. Ligar qualquer uso exige a voz escolhida (o banco confere de novo). */
export function lerConfigDaVoz(entrada: unknown): { ok: true; valor: ConfigDaVoz } | { ok: false; erro: string } {
  const e = entrada && typeof entrada === 'object' ? entrada as Record<string, unknown> : {}
  const vozId = typeof e.vozId === 'string' && e.vozId.trim() ? e.vozId.trim() : null
  if (vozId !== null && !vozIdValido(vozId)) return { ok: false, erro: 'A voz escolhida não é um id válido da ElevenLabs.' }
  const vozNome = vozId && typeof e.vozNome === 'string' && e.vozNome.trim() ? e.vozNome.replace(/\s+/g, ' ').trim().slice(0, 120) : null
  const modelo = e.modelo ?? MODELO_PADRAO
  if (!ehModeloDaVoz(modelo)) return { ok: false, erro: 'Modelo desconhecido.' }
  const materias = e.materias === true
  const whatsapp = e.whatsapp === true
  if ((materias || whatsapp) && !vozId) return { ok: false, erro: 'Escolha a voz antes de ligar a narração ou o áudio no WhatsApp.' }
  return { ok: true, valor: { vozId, vozNome, modelo, materias, whatsapp } }
}

/** A frase da amostra na tela: curta (custa ~90 caracteres) e com cara de instituição. */
export const FRASE_DA_AMOSTRA = 'Olá! Esta é a voz da Cruz Vermelha Brasileira no Rio de Janeiro. Obrigado por acompanhar o nosso trabalho.'
