import { PASTA_RAIZ, caminhoPorExtenso, tamanhoLegivel } from '@/lib/google/drive-regras'
import { PENDENCIA_VALE_MIN, limpo } from './regras'

/**
 * Guardar documentos no Google Drive pelo WhatsApp — as regras, sem banco nem rede (conferidas por
 * `npx tsx scripts/conferir-drive.ts`). O servidor fica em lib/whatsapp/drive.ts; o Drive, em lib/google/drive.ts.
 *
 * Quem é da equipe manda um DOCUMENTO (PDF, planilha, texto, apresentação; foto e vídeo continuam virando envio) e
 * diz a pasta: na legenda ("guardar em Financeiro/2026"), na resposta à pergunta do bot ("Em que pasta?"), ou pelo
 * assistente (preparar_guardar_no_drive, sempre com o plano e o "confirmo"). O caminho é o de dentro de
 * "Palácio – Arquivos", começando pelo setor da pessoa (quem administra escolhe qualquer pasta).
 */

/** O documento que chegou ao WhatsApp, como fica na pergunta (whatsapp_pendencias.dados.documento) e no passo do plano. */
export type DocumentoRecebido = {
  /** A mensagem do WhatsApp que trouxe o documento. */
  mensagemId: string
  /** O id da mídia na Meta e o endereço de reserva na Kapso: é por eles que o arquivo é baixado na hora de guardar. */
  arquivo: string
  endereco: string | null
  nome: string
  mime: string
  tamanho: number | null
  /** "PDF", "planilha", "texto", "apresentação" (drive-regras.ts, tipoDoDocumento) e a extensão. */
  tipo: string
  extensao: string
}

/** Lê o documento guardado na pergunta (ou no passo); null se falta o que é preciso para baixá-lo. */
export function documentoDosDados(d: unknown): DocumentoRecebido | null {
  const o = d && typeof d === 'object' ? d as Record<string, unknown> : null
  const texto = (v: unknown) => (typeof v === 'string' ? v : '')
  if (!o || !texto(o.mensagemId) || (!texto(o.arquivo) && !texto(o.endereco)) || !texto(o.extensao)) return null
  const tamanho = Number(o.tamanho)
  return {
    mensagemId: texto(o.mensagemId).slice(0, 128), arquivo: texto(o.arquivo).slice(0, 128), endereco: texto(o.endereco).slice(0, 2000) || null,
    nome: texto(o.nome).slice(0, 200) || `documento.${texto(o.extensao)}`, mime: texto(o.mime).slice(0, 120) || 'application/octet-stream',
    tamanho: Number.isFinite(tamanho) && tamanho > 0 ? tamanho : null, tipo: texto(o.tipo).slice(0, 20) || 'documento', extensao: texto(o.extensao).slice(0, 5),
  }
}

const VERBOS_DE_GUARDAR = '(?:guard|salv|arquiv|coloc|bot|p[oõ]e|ponh|manda|joga)[a-zà-ú]*'
const PEDIDO_DE_GUARDAR = new RegExp(`^(?:(?:por\\s+favor|pfv|pf)[,\\s]+)?${VERBOS_DE_GUARDAR}\\s+(?:(?:isso|isto|aqui|este|esse|o\\s+arquivo|o\\s+documento)\\s+)?(?:em|na|no|nas|nos|dentro\\s+d[aeo]s?)\\s+(?:(?:pasta|pastas)\\s+)?`, 'i')

/**
 * O caminho que a pessoa escreveu. `semVerbo`: a resposta à pergunta "Em que pasta?" (o caminho sozinho vale,
 * "Financeiro/2026"); sem ele, só a legenda que pede ("guardar em Financeiro/2026", "salva na pasta Financeiro").
 * Só vale o que tem cara de caminho — com barra (ou >) entre os níveis, ou de até 3 palavras: "guarda na pasta do
 * financeiro de 2026" não é caminho (vai ao assistente, se ele atende a pessoa, ou ganha a pergunta).
 */
export function lerPastaDoPedido(texto: string, opcoes: { semVerbo?: boolean } = {}): string | null {
  let t = String(texto ?? '').normalize('NFC').replace(/\p{Cf}/gu, '').replace(/\s+/g, ' ').trim()
  const pedido = PEDIDO_DE_GUARDAR.exec(t)
  if (pedido) t = t.slice(pedido[0].length)
  else if (!opcoes.semVerbo) return null
  else t = t.replace(/^(?:(?:em|na|no)\s+)?(?:(?:a\s+)?pasta\s+)?/i, '')
  t = t.trim().replace(/[.!;,]+$/, '').trim()
  if (!t || t.length > 300) return null
  const temSeparador = /[/\\>›»]/.test(t)
  return temSeparador || t.split(' ').length <= 3 ? t : null
}

/** A legenda do documento pede para guardar ("guardar em Financeiro/2026")? O caminho; null se não. */
export const lerLegendaDeGuardar = (texto: string) => lerPastaDoPedido(texto)
/** A resposta à pergunta da pasta ("Financeiro/2026", "guardar em Financeiro/2026"): o caminho; null se não parece um. */
export const lerPastaDaResposta = (texto: string) => lerPastaDoPedido(texto, { semVerbo: true })

/** "*relatorio.pdf* (PDF, 2,3 MB)". */
export function rotuloDoDocumento(d: Pick<DocumentoRecebido, 'nome' | 'tipo' | 'tamanho'>): string {
  const tamanho = tamanhoLegivel(d.tamanho)
  return `*${limpo(d.nome, 120) || 'documento'}* (${[d.tipo, tamanho].filter(Boolean).join(', ')})`
}

/** A pergunta da pasta, para o documento que chegou sem ela (quem administra começa por qualquer pasta). */
export function textoPedeAPasta(p: { documento: Pick<DocumentoRecebido, 'nome' | 'tipo' | 'tamanho'>; setores: readonly string[]; administra: boolean }): string {
  const exemplo = p.administra || !p.setores.length ? 'Financeiro/2026' : `${limpo(p.setores[0], 60)}/2026`
  const onde = p.administra
    ? `Responda com o caminho dentro de “${PASTA_RAIZ}” (ex.: *${exemplo}*); a pasta é criada se não existir.`
    : `Responda com o caminho, começando pelo seu setor${p.setores.length > 1 ? ` (${p.setores.slice(0, 4).map((s) => limpo(s, 60)).join(', ')})` : ''}: ex.: *${exemplo}*. A pasta é criada se não existir.`
  return [
    `Recebi ${rotuloDoDocumento(p.documento)}. Em que pasta do Google Drive do Palácio eu guardo?`,
    onde,
    `Para desistir, *cancelar*. Vale por ${PENDENCIA_VALE_MIN} minutos.`,
  ].join('\n\n')
}

/** Quando a pergunta não pôde ser guardada (a migração do Drive ainda não foi aplicada): a legenda resolve. */
export const TEXTO_PASTA_NA_LEGENDA = 'Para guardar no Google Drive do Palácio, mande o documento de novo com a pasta na legenda: *guardar em Financeiro/2026*.'

/** O documento guardado: onde e o link do arquivo. */
export function textoDoGuardado(p: { nome: string; partes: readonly string[]; link: string }): string {
  return `Guardado no Google Drive: *${limpo(p.nome, 120)}* em _${limpo(caminhoPorExtenso(p.partes), 300)}_.\n\n${p.link}`
}

export const TEXTO_DRIVE_TIPO = 'Pelo WhatsApp eu guardo no Drive só PDF, planilhas, textos e apresentações. Foto e vídeo viram envio para a comunicação (mande sem a legenda de pasta).'
export const TEXTO_DRIVE_GRANDE = 'Este documento é grande demais para vir pelo WhatsApp (até 64 MB). Guarde direto no Google Drive.'
export const TEXTO_DRIVE_DOIS_FATORES =
  'Sua conta usa a verificação em duas etapas, então guardar arquivos no Drive pelo WhatsApp fica de fora (o WhatsApp não pede o código do app). Guarde direto no Google Drive, ou peça a alguém do seu setor.'
export const TEXTO_DRIVE_ESCOLA = 'Guardar no Drive pelo WhatsApp é da equipe do Palácio; a equipe da Escola guarda direto no Google Drive.'
export const TEXTO_DRIVE_JA_GUARDADO = 'Este documento já foi guardado (ou a pergunta já foi respondida).'
export const TEXTO_DRIVE_RESPONDA = 'Responda com a pasta (ex.: *Financeiro/2026*), ou *cancelar*.'
