import type { ResumoDaRotina } from '@/lib/auditoria/rotina'
import { momento } from '@/lib/oficios/documento'
import { ehPapel, PAPEL } from '@/lib/permissoes'
import {
  CODIGO_DE_CERTIFICADO, CODIGO_DE_OFICIO, lerCodigo, ROTULO_DA_ACAO, ROTULO_DO_ESTADO, ROTULO_DO_FLUXO, ROTULO_DO_MOTIVO, ROTULO_DO_TIPO,
} from '@/lib/auditoria/catalogo'

/**
 * O que as funções da trilha devolvem à administração (migração
 * …_cvrj_auditoria.sql: auditoria_painel, auditoria_item_interno,
 * auditoria_verificar_cadeia, auditoria_sincronizar) e a leitura defensiva
 * disso. O banco manda jsonb sem tipo: ler num lugar só evita que um campo
 * ausente derrube a tela inteira, e um tipo novo no banco (a transparência
 * está chegando) aparece com o nome cru em vez de sumir.
 *
 * Módulo puro — sem banco, sem 'server-only' — porque serve à página, às
 * actions (app/actions/trilha.ts) e ao painel no navegador.
 */

// ------------------------------------------------------------------ formatos

export type EstadoDoOts = 'pendente' | 'enviado' | 'confirmado'

export type FluxoConferido = { fluxo: string; eventos: number; ordem_final: number; ok: boolean; primeira_quebra_ordem: number | null }

/** Uma conferência da cadeia: a última gravada (painel) ou a que acabou de rodar. */
export type Conferencia = {
  executado_em: string | null
  ok: boolean
  eventos: number
  fluxos: FluxoConferido[]
  lotes: number
  lotes_ok: boolean
  primeiro_lote_com_falha: string | null
  duracao_ms: number | null
}

export type LoteNoPainel = {
  dia: string
  fechado_em: string | null
  itens: number
  compromisso: string
  assinado: boolean
  chave_id: string | null
  ots_estado: EstadoDoOts
  bloco: number | null
  tsa: boolean
  publicado_em: string | null
  /** Última cópia no espelho do R2 (null: espelho desligado ou ainda não copiado). */
  espelhado_em: string | null
  tentativas: number
  ultimo_erro: string | null
}

export type FalhaNoPainel = { id: number; ocorrido_em: string | null; origem: string; referencia_id: string | null; erro: string }

export type ItemRecente = {
  codigo: string
  tipo: string
  classe: string
  versao: number
  titulo_publico: string | null
  url_publica: string | null
  referencia_id: string | null
  registrado_em: string | null
  estado: string
  lote: string | null
}

export type DadosDoPainel = {
  verificacao: Conferencia | null
  lotes: LoteNoPainel[]
  falhas: FalhaNoPainel[]
  totais: Record<string, number>
  pendentes_de_lote: number
  recentes: ItemRecente[]
}

export type EventoDoItem = { acao: string; ocorrido_em: string | null; papel: string; ordem: number; depois: Record<string, unknown> | null; hash: string }

/** A projeção pública do item (a mesma da consulta do site) mais o que só a administração vê. */
export type ItemInterno = {
  codigo: string
  classe: string
  tipo: string
  versao: number
  hash: string
  hash_arquivo: string | null
  /** Itens públicos: data e hora. Ofício e certificado: só o dia (AAAA-MM-DD), como na consulta pública. */
  registrado_em: string | null
  estado: string
  estado_em: string | null
  substituido_por: { codigo: string; url: string | null; versao: number | null } | null
  titulo: string | null
  url: string | null
  certificado: { nome: string | null; curso: string | null; carga_horaria: number | null; emitido_em: string | null; valido_ate: string | null } | null
  lote: { dia: string; compromisso: string; assinado: boolean; chave_id: string | null; ots: boolean; bitcoin: { confirmado: boolean; bloco: number | null }; tsa: boolean } | null
  cadeia: { integra: boolean; verificada_em: string | null } | null
  referencia_id: string | null
  codigo_externo: string | null
  fluxo: string
  eventos: EventoDoItem[]
}

/** O que a rotina de pendências registrou: contagens por tipo, mais falhas. */
export type Sincronizacao = Record<string, number>

/**
 * A chave de assinatura, vista pela página. Nunca leva a chave nem a variável:
 * no máximo a impressão digital (os 16 hex que já vão públicos em cada lote).
 */
export type SituacaoDaChave =
  | { estado: 'configurada'; id: string }
  | { estado: 'ausente' }
  | { estado: 'invalida'; motivo: 'tipo' | 'formato' }

// ------------------------------------------------------------------ leitura

type Bruto = Record<string, unknown>

const objeto = (v: unknown): Bruto | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Bruto) : null)
const objetos = (v: unknown): Bruto[] => (Array.isArray(v) ? v.map(objeto).filter((o): o is Bruto => o !== null) : [])
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
const numeroOuNulo = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
const contagem = (v: unknown): number => numeroOuNulo(v) ?? 0
const ESTADOS_DO_OTS: readonly EstadoDoOts[] = ['pendente', 'enviado', 'confirmado']

export function lerConferencia(bruto: unknown): Conferencia | null {
  const c = objeto(bruto)
  if (!c || typeof c.ok !== 'boolean') return null
  return {
    executado_em: texto(c.executado_em),
    ok: c.ok,
    eventos: contagem(c.eventos),
    fluxos: objetos(c.fluxos).map((f) => ({
      fluxo: texto(f.fluxo) ?? '—',
      eventos: contagem(f.eventos),
      ordem_final: contagem(f.ordem_final),
      ok: f.ok === true,
      primeira_quebra_ordem: numeroOuNulo(f.primeira_quebra_ordem),
    })),
    lotes: contagem(c.lotes),
    lotes_ok: c.lotes_ok !== false,
    primeiro_lote_com_falha: texto(c.primeiro_lote_com_falha),
    duracao_ms: numeroOuNulo(c.duracao_ms),
  }
}

export function lerSincronizacao(bruto: unknown): Sincronizacao {
  return Object.fromEntries(Object.entries(objeto(bruto) ?? {}).map(([k, v]) => [k, contagem(v)]))
}

export function lerPainel(bruto: unknown): DadosDoPainel {
  const p = objeto(bruto) ?? {}
  return {
    verificacao: lerConferencia(p.verificacao),
    lotes: objetos(p.lotes).flatMap((l) => {
      const dia = texto(l.dia)
      if (!dia) return []
      return [{
        dia,
        fechado_em: texto(l.fechado_em),
        itens: contagem(l.itens),
        compromisso: texto(l.compromisso) ?? '',
        assinado: l.assinado === true,
        chave_id: texto(l.chave_id),
        ots_estado: ESTADOS_DO_OTS.find((e) => e === l.ots_estado) ?? 'pendente',
        bloco: numeroOuNulo(l.bloco),
        tsa: l.tsa === true,
        publicado_em: texto(l.publicado_em),
        espelhado_em: texto(l.espelhado_em),
        tentativas: contagem(l.tentativas),
        ultimo_erro: texto(l.ultimo_erro),
      }]
    }),
    falhas: objetos(p.falhas).map((f) => ({
      id: contagem(f.id),
      ocorrido_em: texto(f.ocorrido_em),
      origem: texto(f.origem) ?? 'desconhecida',
      referencia_id: texto(f.referencia_id),
      erro: texto(f.erro) ?? '',
    })),
    totais: lerSincronizacao(p.totais),
    pendentes_de_lote: contagem(p.pendentes_de_lote),
    recentes: objetos(p.recentes).flatMap((r) => {
      const codigo = texto(r.codigo)
      if (!codigo) return []
      return [{
        codigo,
        tipo: texto(r.tipo) ?? '',
        classe: texto(r.classe) ?? '',
        versao: contagem(r.versao) || 1,
        titulo_publico: texto(r.titulo_publico),
        url_publica: texto(r.url_publica),
        referencia_id: texto(r.referencia_id),
        registrado_em: texto(r.registrado_em),
        estado: texto(r.estado) ?? 'vigente',
        lote: texto(r.lote),
      }]
    }),
  }
}

/** O item da consulta interna, ou null quando o banco respondeu {encontrado: false}. */
export function lerItemInterno(bruto: unknown): ItemInterno | null {
  const i = objeto(bruto)
  const codigo = texto(i?.codigo)
  if (!i || i.encontrado !== true || !codigo) return null
  const sucessor = objeto(i.substituido_por)
  const codigoDoSucessor = texto(sucessor?.codigo)
  const certificado = objeto(i.certificado)
  const lote = objeto(i.lote)
  const diaDoLote = texto(lote?.dia)
  const bitcoin = objeto(lote?.bitcoin)
  const cadeia = objeto(i.cadeia)
  return {
    codigo,
    classe: texto(i.classe) ?? '',
    tipo: texto(i.tipo) ?? '',
    versao: contagem(i.versao) || 1,
    hash: texto(i.hash) ?? '',
    hash_arquivo: texto(i.hash_arquivo),
    registrado_em: texto(i.registrado_em),
    estado: texto(i.estado) ?? 'vigente',
    estado_em: texto(i.estado_em),
    substituido_por: codigoDoSucessor ? { codigo: codigoDoSucessor, url: texto(sucessor?.url), versao: numeroOuNulo(sucessor?.versao) } : null,
    titulo: texto(i.titulo),
    url: texto(i.url),
    certificado: certificado ? {
      nome: texto(certificado.nome),
      curso: texto(certificado.curso),
      carga_horaria: numeroOuNulo(certificado.carga_horaria),
      emitido_em: texto(certificado.emitido_em),
      valido_ate: texto(certificado.valido_ate),
    } : null,
    lote: lote && diaDoLote ? {
      dia: diaDoLote,
      compromisso: texto(lote.compromisso) ?? '',
      assinado: lote.assinado === true,
      chave_id: texto(lote.chave_id),
      ots: lote.ots === true,
      bitcoin: { confirmado: bitcoin?.confirmado === true, bloco: numeroOuNulo(bitcoin?.bloco) },
      tsa: lote.tsa === true,
    } : null,
    cadeia: cadeia && typeof cadeia.integra === 'boolean' ? { integra: cadeia.integra, verificada_em: texto(cadeia.verificada_em) } : null,
    referencia_id: texto(i.referencia_id),
    codigo_externo: texto(i.codigo_externo),
    fluxo: texto(i.fluxo) ?? '',
    eventos: objetos(i.eventos).map((e) => ({
      acao: texto(e.acao) ?? '',
      ocorrido_em: texto(e.ocorrido_em),
      papel: texto(e.papel) ?? '',
      ordem: contagem(e.ordem),
      depois: objeto(e.depois),
      hash: texto(e.hash) ?? '',
    })),
  }
}

/**
 * O que há de errado com o texto digitado na busca, antes de ir ao servidor
 * (que confere de novo). As regras de leitura são as de lerCodigo — as mesmas
 * do banco.
 */
export function problemaDoCodigo(valor: string): string | null {
  if (!valor.trim()) return 'Digite ou cole um código.'
  if (/^[0-9a-f]{64}$/i.test(valor.trim())) return 'Isso é um hash (SHA-256), não um código. A consulta por hash fica na página pública de conferência.'
  if (!lerCodigo(valor)) return 'Esse texto não tem o formato de nenhum código da trilha: 26 caracteres (letras e números, com ou sem hífens), os 32 caracteres impressos no ofício ou o XXXX-XXXX do certificado.'
  return null
}

// ------------------------------------------------------------------ rótulos

const rotulo = (tabela: Record<string, string>, chave: string) => (tabela as Record<string, string | undefined>)[chave]

export const rotuloDoTipo = (tipo: string) => rotulo(ROTULO_DO_TIPO, tipo) ?? tipo
export const rotuloDoEstado = (estado: string) => rotulo(ROTULO_DO_ESTADO, estado) ?? estado
export const rotuloDoFluxo = (fluxo: string) => rotulo(ROTULO_DO_FLUXO, fluxo) ?? 'Fluxo reservado'
export const rotuloDaAcao = (acao: string) => rotulo(ROTULO_DA_ACAO, acao) ?? acao

/** "substituicao" é o motivo que o próprio banco grava ao trocar de versão; não está no catálogo de motivos escolhíveis. */
export const rotuloDoMotivo = (motivo: string) => rotulo(ROTULO_DO_MOTIVO, motivo) ?? (motivo === 'substituicao' ? 'Substituição por versão nova' : motivo)

/** Papel de quem agiu, gravado no evento (o ator nunca aparece, nem aqui). */
export const rotuloDoPapel = (papel: string) =>
  ehPapel(papel) ? PAPEL[papel].rotulo : papel === 'sistema' ? 'Sistema (rotina ou servidor)' : papel === 'membro' ? 'Membro' : papel || '—'

/** O "depois" de um evento de item: motivo (código do catálogo) e versão. */
export function detalheDoEvento(e: EventoDoItem): string {
  const d = e.depois ?? {}
  const partes: string[] = []
  if (typeof d.motivo === 'string') partes.push(`Motivo: ${rotuloDoMotivo(d.motivo)}`)
  if (typeof d.versao === 'number' || typeof d.versao === 'string') partes.push(e.acao === 'item.substituido' ? `nova versão: ${d.versao}` : `versão ${d.versao}`)
  if (typeof d.estado === 'string') partes.push(`estado: ${d.estado}`)
  return partes.join(' · ') || '—'
}

export const ROTULO_DA_CLASSE: Record<string, string> = {
  P: 'Público por natureza',
  V: 'Verificável por quem tem o documento',
  C: 'Certificado',
}

/** O que a página pública mostra de cada classe (docs/auditoria-publica.md §2.1). */
export const O_QUE_O_PUBLICO_VE: Record<string, string> = {
  P: 'Na consulta pública aparecem título, data e hora, endereço, hash, estado e provas, e o texto canônico para baixar.',
  V: 'Na consulta pública aparecem só "confere", o dia do registro, o estado e as provas. O texto continua na página própria do ofício.',
  C: 'Na consulta pública aparecem estado, nome, curso, carga horária e datas — o mesmo da página do certificado.',
}

export type Tom = 'ok' | 'aviso' | 'erro' | 'info' | 'neutro'

export const tomDoEstado = (estado: string): Tom =>
  estado === 'vigente' ? 'ok' : estado === 'revogado' ? 'erro' : estado === 'substituido' ? 'info' : 'neutro'

// ------------------------------------------------------------------ datas e números

export const numero = (n: number) => n.toLocaleString('pt-BR')
export const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios)
const LISTA = new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' })
export const emLista = (itens: string[]) => LISTA.format(itens)

/** "23/09/2026", a partir do dia do banco (AAAA-MM-DD), sem passar por fuso. */
export function diaLegivel(dia: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'
}

/** Data e hora de São Paulo ("24/09/2026 às 05:00"), ou só o dia, quando o banco manda só o dia. */
export function quando(valor: string | null | undefined): string {
  if (!valor) return '—'
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return diaLegivel(valor)
  return Number.isNaN(Date.parse(valor)) ? '—' : momento(valor)
}

export function duracao(ms: number | null): string | null {
  if (ms === null) return null
  return ms < 1000 ? `${numero(ms)} ms` : `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`
}

/** O dia de hoje em São Paulo (AAAA-MM-DD) no instante dado. */
export const diaEmSaoPaulo = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000)

/**
 * A rotina confere a cadeia toda madrugada: mais de 36 horas sem conferência
 * quer dizer que ela não rodou. `agora` vem do servidor, para a tela não
 * depender do relógio de quem abre.
 */
export function conferenciaAtrasada(executadoEm: string | null, agora: string): boolean {
  const a = Date.parse(executadoEm ?? ''), b = Date.parse(agora)
  return Number.isFinite(a) && Number.isFinite(b) && b - a > 36 * 3_600_000
}

/**
 * O lote de ontem fecha de madrugada (e fecha mesmo sem itens, para ancorar as
 * pontas das cadeias). Antes das 5h o mais novo ainda é o de anteontem; mais
 * velho que isso, a rotina não rodou.
 */
export function loteAtrasado(ultimoDia: string | null, agora: string): boolean {
  if (!ultimoDia || Number.isNaN(Date.parse(agora))) return false
  return diasEntre(ultimoDia, diaEmSaoPaulo(agora)) > 2
}

// ------------------------------------------------------------------ endereços

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type Endereco = { href: string; rotulo: string }

/**
 * Onde o item nasceu, dentro da Redação. Certificado não tem tela própria
 * aqui (a do curso é por curso). Canais oficiais guardam o espaço como
 * referência, então o link não depende dela.
 */
export function linkDaOrigem(tipo: string, referencia: string | null): Endereco | null {
  const id = referencia && UUID.test(referencia) ? referencia : null
  switch (tipo) {
    case 'materia': return id ? { href: `/conteudos/${id}`, rotulo: 'Abrir o conteúdo' } : null
    case 'oficio': return id ? { href: `/oficios/${id}`, rotulo: 'Abrir o ofício' } : null
    case 'comunicado': return { href: '/imprensa', rotulo: 'Abrir a Imprensa' }
    case 'documento':
    case 'parceria': return { href: '/transparencia', rotulo: 'Abrir a Transparência' }
    case 'canais': return { href: '/canais-oficiais', rotulo: 'Abrir os Canais oficiais' }
    default: return null
  }
}

/** A página pública que a própria Redação serve para o documento: a do ofício e a do certificado. */
export function paginaDoDocumento(tipo: string, codigoExterno: string | null): Endereco | null {
  if (!codigoExterno) return null
  if (tipo === 'oficio' && CODIGO_DE_OFICIO.test(codigoExterno)) return { href: `/verificar/${codigoExterno}`, rotulo: 'Página de conferência do ofício' }
  if (tipo === 'certificado' && CODIGO_DE_CERTIFICADO.test(codigoExterno)) return { href: `/certificado/${codigoExterno}`, rotulo: 'Página do certificado' }
  return null
}

export const linkDoBloco = (bloco: number) => `https://mempool.space/block/${bloco}`

/** Quem gravou a falha em auditoria.falhas: gancho_<origem> (na hora) ou sincronizar_<origem> (rotina de pendências). */
const ORIGENS: Record<string, { nome: string; tipo: string }> = {
  oficio: { nome: 'Ofício', tipo: 'oficio' },
  certificado: { nome: 'Certificado', tipo: 'certificado' },
  materia: { nome: 'Matéria', tipo: 'materia' },
  comunicado: { nome: 'Comunicado à imprensa', tipo: 'comunicado' },
  transparencia: { nome: 'Documento da transparência', tipo: 'documento' },
  documento: { nome: 'Documento da transparência', tipo: 'documento' },
  parceria: { nome: 'Parceria', tipo: 'parceria' },
  canais: { nome: 'Canais oficiais', tipo: 'canais' },
}

export function origemDaFalha(origem: string): { rotulo: string; tipo: string | null } {
  const m = /^(gancho|sincronizar)_([a-z_]+)$/.exec(origem)
  const o = m ? ORIGENS[m[2]] : undefined
  if (!m || !o) return { rotulo: origem, tipo: null }
  return { rotulo: `${o.nome} · ${m[1] === 'gancho' ? 'no momento do registro' : 'na rotina de pendências'}`, tipo: o.tipo }
}

// ------------------------------------------------------------------ resumos das rodadas manuais

export type Resumo = { tom: 'ok' | 'atencao'; titulo: string; detalhes: string[] }

/** As chaves de auditoria_sincronizar (as do portal vêm de auditoria.sincronizar_portal, na migração da transparência). */
const REGISTRADOS: Record<string, [string, string]> = {
  oficios: ['ofício', 'ofícios'],
  certificados: ['certificado', 'certificados'],
  materias: ['matéria', 'matérias'],
  comunicados: ['comunicado', 'comunicados'],
  documentos: ['documento da transparência', 'documentos da transparência'],
  parcerias: ['parceria', 'parcerias'],
  canais: ['versão dos canais oficiais', 'versões dos canais oficiais'],
}

/** "2 ofícios e 1 matéria", ou null se nada entrou. Chave desconhecida (tipo novo) entra com o nome cru. */
function registradosAgora(s: Sincronizacao): string | null {
  const partes = Object.entries(s)
    .filter(([k, n]) => k !== 'falhas' && k !== 'falhas_24h' && n > 0)
    .map(([k, n]) => `${numero(n)} ${REGISTRADOS[k] ? plural(n, ...REGISTRADOS[k]) : k}`)
  return partes.length ? emLista(partes) : null
}

export function resumoDaConferencia(c: Conferencia): Resumo {
  const quebras = c.fluxos.filter((f) => !f.ok)
  const detalhes = [
    `${numero(c.eventos)} ${plural(c.eventos, 'evento', 'eventos')} em ${numero(c.fluxos.length)} ${plural(c.fluxos.length, 'fluxo', 'fluxos')}${quebras.length ? '' : ', sem nenhuma quebra'}.`,
    ...quebras.map((f) => `${f.fluxo} (${rotuloDoFluxo(f.fluxo)}): ${f.primeira_quebra_ordem ? `quebra na posição ${numero(f.primeira_quebra_ordem)}` : 'divergência'}.`),
    !c.lotes_ok ? `Lotes: divergência a partir do lote de ${diaLegivel(c.primeiro_lote_com_falha)}.`
      : c.lotes ? `${numero(c.lotes)} ${plural(c.lotes, 'lote conferido', 'lotes conferidos')}, sem divergência.` : 'Nenhum lote fechado ainda.',
  ]
  return c.ok
    ? { tom: 'ok', titulo: 'Cadeia íntegra.', detalhes }
    : { tom: 'atencao', titulo: 'A conferência encontrou divergência.', detalhes }
}

export function resumoDaSincronizacao(s: Sincronizacao): Resumo {
  const registrados = registradosAgora(s)
  const falhas = s.falhas ?? 0
  const detalhes = registrados ? [`Registrados agora: ${registrados}.`] : []
  if (falhas) detalhes.push(`${numero(falhas)} ${plural(falhas, 'registro não entrou e ficou anotado', 'registros não entraram e ficaram anotados')} em Falhas de registro.`)
  return {
    tom: falhas ? 'atencao' : 'ok',
    titulo: registrados ? 'Pendências registradas.' : falhas ? 'Nada novo entrou na trilha.' : 'Nada pendente: tudo já estava na trilha.',
    detalhes,
  }
}

/** O resumo da rodada inteira (lib/auditoria/rotina.ts → rotinaDiaria). */
export function resumoDaRodada(r: ResumoDaRotina): Resumo {
  const detalhes: string[] = []
  if (r.lote) detalhes.push(`Lote de ${diaLegivel(r.lote.dia)} fechado com ${numero(r.lote.itens)} ${plural(r.lote.itens, 'item', 'itens')}.`)
  else if (r.lote === null) detalhes.push('O lote de ontem já estava fechado.')
  if (r.cadeia) {
    detalhes.push(r.cadeia.ok
      ? `Cadeia íntegra: ${numero(r.cadeia.eventos)} ${plural(r.cadeia.eventos, 'evento', 'eventos')} e ${numero(r.cadeia.lotes)} ${plural(r.cadeia.lotes, 'lote conferido', 'lotes conferidos')}.`
      : 'A conferência da cadeia encontrou divergência (detalhes em Conferência da cadeia).')
  }
  const registrados = r.sincronizacao ? registradosAgora(r.sincronizacao) : null
  if (registrados) detalhes.push(`Registrados agora: ${registrados}.`)
  for (const l of r.lotes) {
    if (l.passos.length) detalhes.push(`Lote de ${diaLegivel(l.dia)}: ${l.passos.join('; ')}.`)
  }
  if (r.publicados.length) detalhes.push(`Arquivos publicados no site: ${emLista(r.publicados.map((d) => `lote de ${diaLegivel(d)}`))}.`)
  const espelhados = r.espelhados ?? []
  if (espelhados.length) detalhes.push(`Copiados para o espelho no R2: ${emLista(espelhados.map((d) => `lote de ${diaLegivel(d)}`))}.`)
  const divergencias = r.divergencias ?? []
  const erros = r.lotes.flatMap((l) => l.erros.map((e) => `Lote de ${diaLegivel(l.dia)} — ${e}`))
  detalhes.push(...erros, ...divergencias.map((d) => `Registro permanente no R2 diferente do banco — ${d}`), ...r.avisos)
  const pendencias = erros.length + divergencias.length + r.avisos.length + (r.cadeia && !r.cadeia.ok ? 1 : 0)
  if (!detalhes.length) detalhes.push('Nada a fazer nesta rodada.')
  return pendencias
    ? { tom: 'atencao', titulo: 'Rodada concluída, com pontos de atenção.', detalhes }
    : { tom: 'ok', titulo: 'Rodada concluída.', detalhes }
}
