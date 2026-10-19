import { agoraEmBrasilia } from '@/lib/agenda/datas'
import { AUTORIZACOES, type Autorizacao } from '@/lib/envios/regras'

/**
 * O Google Drive do Palácio, sem banco nem rede — conferido por `npx tsx scripts/conferir-drive.ts`. O servidor
 * fica em lib/google/drive.ts.
 *
 * Tudo mora numa pasta só, "Palácio – Arquivos", no Drive da conta conectada (a da filial). O escopo é o
 * drive.file: o Palácio só enxerga o que ele mesmo criou — a pasta raiz, as subpastas e os arquivos que mandou.
 * Dentro dela:
 *  - "Envios do WhatsApp/AAAA-MM/<título do envio> (ENV-00042)": a cópia automática de cada envio de fotos e
 *    vídeos que chegou pelo WhatsApp (lib/whatsapp/drive.ts), com a autorização de imagem na descrição de cada
 *    arquivo;
 *  - as pastas dos setores ("Financeiro/2026"): os documentos guardados pelo WhatsApp. Cada pessoa guarda só sob
 *    a pasta do próprio setor (o nome do setor no Palácio); quem administra, em qualquer lugar da raiz.
 *
 * O caminho que a pessoa escreve é normalizado aqui: sem "..", sem barras extras, até 4 níveis, cada nome com até
 * 80 caracteres. Os pedidos à API (a busca da pasta, a criação, o envio em partes) também são montados aqui, para
 * o script conferir o formato sem rede.
 */

export const PASTA_RAIZ = 'Palácio – Arquivos'
export const PASTA_DOS_ENVIOS = 'Envios do WhatsApp'
export const MIME_DE_PASTA = 'application/vnd.google-apps.folder'

/** Níveis abaixo da raiz que a pessoa pode escrever ("Financeiro/2026/Notas/Outubro"). */
export const NIVEIS_DO_CAMINHO = 4
export const NOME_DA_PASTA_MAX = 80
export const NOME_DO_ARQUIVO_MAX = 120
/** O teto de um arquivo mandado ao Drive (o mesmo do WhatsApp: tudo o que chega por lá cabe). */
export const TAMANHO_MAXIMO_NO_DRIVE = 64 * 1024 * 1024
/** Cada parte do envio em partes (múltiplo de 256 KiB, como a API exige). */
export const PEDACO_DO_ENVIO = 8 * 1024 * 1024

export const API_DO_DRIVE = 'https://www.googleapis.com/drive/v3'
export const ENVIO_DO_DRIVE = 'https://www.googleapis.com/upload/drive/v3'

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
/** "Comunicação Social" = "comunicacao  social": sem acento, caixa ou espaço extra (como private.chave_do_nome). */
export const chaveDaPasta = (s: string) => semAcento(String(s ?? '')).toLowerCase().replace(/\s+/g, ' ').trim()

/** A chave sem diferença entre hífen, meia-risca e travessão ("Palacio - Arquivos" = "Palácio – Arquivos"). */
const chaveSemTraco = (s: string) => chaveDaPasta(s).replace(/\s*[-–—]\s*/g, '-')

/** Sem controles nem invisíveis de formatação (a inversão de direção, o espaço de largura zero), numa linha. */
const umaLinha = (s: string) => String(s ?? '').normalize('NFC').replace(/\p{Cf}/gu, '').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim()

// ------------------------------------------------------------------ o caminho

export type Caminho = { ok: true; partes: string[] } | { ok: false; erro: string }

/**
 * O caminho escrito pela pessoa, em partes: "Financeiro/2026", "Financeiro > 2026" e "Palácio – Arquivos/Financeiro/2026"
 * dão ["Financeiro", "2026"]. Barras extras somem; "." e ".." são recusados; até NIVEIS_DO_CAMINHO níveis, cada nome
 * com até NOME_DA_PASTA_MAX caracteres (sem ponto ou espaço sobrando no fim).
 */
export function normalizarCaminho(texto: string): Caminho {
  const linha = umaLinha(texto).replace(/^["“'`]+|["”'`]+$/g, '')
  const brutas = linha.split(/[/\\>›»]/).map((p) => p.trim())
  if (brutas.some((p) => /^\.+$/.test(p))) return { ok: false, erro: 'O caminho não pode ter "." nem "..": escreva os nomes das pastas, como Financeiro/2026.' }
  // Barras extras ("Financeiro//2026/") somem; ponto ou espaço sobrando no fim de um nome, também.
  const partes = brutas.map((p) => p.replace(/[.\s]+$/, '')).filter(Boolean)
  // A raiz escrita junto ("Palácio – Arquivos/…", "Palacio - Arquivos/…") não é um nível.
  if (partes.length && chaveSemTraco(partes[0]) === chaveSemTraco(PASTA_RAIZ)) partes.shift()
  if (!partes.length) return { ok: false, erro: 'Diga a pasta, começando pelo setor (ex.: Financeiro/2026).' }
  if (partes.length > NIVEIS_DO_CAMINHO) return { ok: false, erro: `No máximo ${NIVEIS_DO_CAMINHO} níveis de pasta (ex.: Financeiro/2026/Notas/Outubro).` }
  const comprida = partes.find((p) => p.length > NOME_DA_PASTA_MAX)
  if (comprida) return { ok: false, erro: `Cada pasta pode ter até ${NOME_DA_PASTA_MAX} caracteres.` }
  return { ok: true, partes }
}

/** O caminho como a pessoa lê: "Palácio – Arquivos/Financeiro/2026". */
export const caminhoPorExtenso = (partes: readonly string[]) => [PASTA_RAIZ, ...partes].join('/')

/** Quem não administra e não está em setor nenhum não tem onde guardar. */
export const TEXTO_SEM_SETOR = 'Você ainda não está em nenhum setor no Palácio: peça a um administrador para incluir você em Pessoas → Setores (ou para guardar por você).'

export type QuemGuarda = {
  /** Administra o espaço (papel admin): guarda em qualquer lugar da raiz. */
  administra: boolean
  /** Os setores ativos da pessoa no Palácio (os nomes oficiais, de Pessoas → Setores). */
  setores: readonly string[]
}

/**
 * Pode guardar nesse caminho? Quem administra, em qualquer lugar da raiz. Os outros, só sob a pasta de um setor
 * deles: o primeiro nível tem de ser o nome do setor (sem diferença de acento ou caixa), e volta escrito como no
 * Palácio ("financeiro/2026" vira "Financeiro/2026"). A pasta dos envios é do Palácio: ninguém guarda nela à mão.
 */
export function podeGuardarEm(partes: readonly string[], quem: QuemGuarda): Caminho {
  if (!partes.length) return { ok: false, erro: 'Diga a pasta, começando pelo setor (ex.: Financeiro/2026).' }
  if (chaveDaPasta(partes[0]) === chaveDaPasta(PASTA_DOS_ENVIOS)) {
    return { ok: false, erro: `A pasta “${PASTA_DOS_ENVIOS}” recebe só as cópias automáticas dos envios; escolha outra.` }
  }
  if (quem.administra) return { ok: true, partes: [...partes] }
  const setor = quem.setores.find((s) => chaveDaPasta(s) === chaveDaPasta(partes[0]))
  if (setor) return { ok: true, partes: [umaLinha(setor).slice(0, NOME_DA_PASTA_MAX), ...partes.slice(1)] }
  if (!quem.setores.length) return { ok: false, erro: TEXTO_SEM_SETOR }
  const lista = quem.setores.slice(0, 4).map((s) => umaLinha(s)).join(', ')
  return { ok: false, erro: `Você guarda só na pasta do seu setor (${lista}). Ex.: ${umaLinha(quem.setores[0])}/2026.` }
}

/** O mês em Brasília, "2026-10". */
export const mesEmBrasilia = (iso: string | null | undefined): string => {
  const t = iso ? Date.parse(iso) : NaN
  return agoraEmBrasilia(Number.isFinite(t) ? new Date(t) : new Date()).dia.slice(0, 7)
}

/** O nome de pasta de um texto livre (o título do envio): numa linha, sem barras (não vira outro nível), cortado. */
export function nomeDePasta(texto: string, max = NOME_DA_PASTA_MAX): string {
  const t = umaLinha(texto).replace(/[/\\]+/g, '-').replace(/^\.+/, '').replace(/[.\s]+$/, '')
  return (t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`) || 'Sem título'
}

/**
 * Onde vai a cópia de um envio: "Envios do WhatsApp/2026-10/<título> (ENV-00042)". O protocolo vai junto no nome
 * da pasta: dois envios com o mesmo título no mesmo mês não se misturam.
 */
export function caminhoDoEnvio(e: { concluidoEm: string | null; titulo: string; protocolo: string | null }): string[] {
  const protocolo = e.protocolo && /^[A-Z]{2,5}-\d{1,9}$/.test(e.protocolo) ? ` (${e.protocolo})` : ''
  return [PASTA_DOS_ENVIOS, mesEmBrasilia(e.concluidoEm), `${nomeDePasta(e.titulo, NOME_DA_PASTA_MAX - protocolo.length)}${protocolo}`]
}

/** A descrição de cada arquivo copiado de um envio: de onde veio, quem mandou e a autorização de imagem. */
export function descricaoDoArquivoDoEnvio(e: { protocolo: string | null; titulo: string; nome: string; setor: string | null; autorizacao: Autorizacao }): string {
  const aut = AUTORIZACOES[e.autorizacao] ?? AUTORIZACOES.nao_sei
  return [
    `Envio${e.protocolo ? ` ${umaLinha(e.protocolo).slice(0, 20)}` : ''} — “${umaLinha(e.titulo).slice(0, 200)}”, mandado pelo WhatsApp do Palácio por ${umaLinha(e.nome).slice(0, 120)}${e.setor ? ` (${umaLinha(e.setor).slice(0, 80)})` : ''}.`,
    `Autorização de imagem: ${aut.rotulo}. ${aut.detalhe}`,
    aut.podePublicar ? null : 'Confira a autorização antes de publicar.',
  ].filter(Boolean).join('\n')
}

// ------------------------------------------------------------------ o documento guardado pelo WhatsApp

/** Os documentos que se guardam pelo WhatsApp (foto e vídeo continuam virando envio): a extensão e o que é. */
const TIPOS_DE_DOCUMENTO: Record<string, string> = {
  pdf: 'PDF', doc: 'texto', docx: 'texto', odt: 'texto', rtf: 'texto', txt: 'texto', md: 'texto',
  xls: 'planilha', xlsx: 'planilha', ods: 'planilha', csv: 'planilha',
  ppt: 'apresentação', pptx: 'apresentação', odp: 'apresentação',
}
const EXTENSAO_DO_MIME: Record<string, string> = {
  'application/pdf': 'pdf', 'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.oasis.opendocument.text': 'odt', 'application/rtf': 'rtf', 'text/rtf': 'rtf', 'text/plain': 'txt', 'text/markdown': 'md',
  'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods', 'text/csv': 'csv',
  'application/vnd.ms-powerpoint': 'ppt', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.oasis.opendocument.presentation': 'odp',
}

const extensaoDe = (nome: string | null | undefined) => /\.([a-z0-9]{1,5})$/i.exec(String(nome ?? '').trim())?.[1]?.toLowerCase() ?? null

/** O que é o documento ("PDF", "planilha"…) e a extensão; null se não é um tipo que se guarda pelo WhatsApp. */
export function tipoDoDocumento(nome: string | null | undefined, mime: string | null | undefined): { rotulo: string; extensao: string } | null {
  const pelaExtensao = extensaoDe(nome)
  const extensao = pelaExtensao && TIPOS_DE_DOCUMENTO[pelaExtensao] ? pelaExtensao : EXTENSAO_DO_MIME[String(mime ?? '').toLowerCase()] ?? null
  return extensao ? { rotulo: TIPOS_DE_DOCUMENTO[extensao], extensao } : null
}

/**
 * O nome do arquivo no Drive: o que a pessoa pediu (sem barra, numa linha, com a extensão do original se ela não
 * escreveu), ou o nome que veio; sem nome nenhum, "documento.<ext>".
 */
export function nomeDoArquivoNoDrive(original: string | null | undefined, pedido: string | null | undefined, extensao: string): string {
  const limpar = (s: string) => umaLinha(s).replace(/[/\\]+/g, '-').replace(/^\.+/, '').trim()
  const base = limpar(String(pedido ?? '')) || limpar(String(original ?? '')) || 'documento'
  const comExtensao = extensaoDe(base) === extensao ? base : `${base.replace(/\.+$/, '')}.${extensao}`
  if (comExtensao.length <= NOME_DO_ARQUIVO_MAX) return comExtensao
  return `${comExtensao.slice(0, NOME_DO_ARQUIVO_MAX - extensao.length - 2).trimEnd()}….${extensao}`
}

/** "2,3 MB", "180 KB". */
export function tamanhoLegivel(bytes: number | null | undefined): string {
  const b = Number(bytes)
  if (!Number.isFinite(b) || b <= 0) return ''
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`
  return `${(b / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

// ------------------------------------------------------------------ os pedidos à API

export type PedidoAoDrive = { metodo: 'GET' | 'POST' | 'PUT'; url: string; cabecalhos: Record<string, string>; corpo?: string }

/** Um nome dentro da busca do Drive (q): a barra invertida e o apóstrofo escapados. */
export const escaparNaBusca = (nome: string) => String(nome ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")

/** A pasta com esse nome dentro da pasta-mãe ("root" é o Meu Drive), fora da lixeira. Com o drive.file, só as que o Palácio criou. */
export function pedidoDeBuscarPasta(nome: string, paiId: string): PedidoAoDrive {
  const q = `name = '${escaparNaBusca(nome)}' and mimeType = '${MIME_DE_PASTA}' and '${escaparNaBusca(paiId)}' in parents and trashed = false`
  const u = new URL(`${API_DO_DRIVE}/files`)
  u.searchParams.set('q', q)
  u.searchParams.set('fields', 'files(id,name,webViewLink)')
  u.searchParams.set('spaces', 'drive')
  u.searchParams.set('pageSize', '10')
  return { metodo: 'GET', url: u.toString(), cabecalhos: {} }
}

/** Cria a pasta (sem pasta-mãe: no Meu Drive). */
export function pedidoDeCriarPasta(nome: string, paiId: string | null): PedidoAoDrive {
  return {
    metodo: 'POST', url: `${API_DO_DRIVE}/files?fields=id%2CwebViewLink`, cabecalhos: { 'Content-Type': 'application/json; charset=UTF-8' },
    corpo: JSON.stringify({ name: nome, mimeType: MIME_DE_PASTA, ...(paiId ? { parents: [paiId] } : {}) }),
  }
}

/** A pasta guardada ainda existe (e não está na lixeira)? */
export function pedidoDeConferirPasta(id: string): PedidoAoDrive {
  return { metodo: 'GET', url: `${API_DO_DRIVE}/files/${encodeURIComponent(id)}?fields=id%2Ctrashed%2CwebViewLink%2CmimeType`, cabecalhos: {} }
}

/** A conta que autorizou (o drive.file basta para o about). */
export function pedidoDaConta(): PedidoAoDrive {
  return { metodo: 'GET', url: `${API_DO_DRIVE}/about?fields=user(emailAddress%2CdisplayName)`, cabecalhos: {} }
}

/**
 * O começo do envio em partes (uploadType=resumable): os metadados no corpo, o tipo e o tamanho do arquivo nos
 * cabeçalhos X-Upload-*; a resposta traz em Location o endereço da sessão, para onde vão as partes.
 */
export function pedidoDeInicioDoEnvio(a: { nome: string; mime: string; tamanho: number; pastaId: string; descricao?: string | null }): PedidoAoDrive {
  return {
    metodo: 'POST',
    url: `${ENVIO_DO_DRIVE}/files?uploadType=resumable&fields=id%2CwebViewLink`,
    cabecalhos: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': a.mime || 'application/octet-stream',
      'X-Upload-Content-Length': String(a.tamanho),
    },
    corpo: JSON.stringify({ name: a.nome, parents: [a.pastaId], ...(a.descricao ? { description: a.descricao.slice(0, 4000) } : {}) }),
  }
}

/** A faixa de uma parte: do byte `inicio` até o último que cabe em PEDACO_DO_ENVIO (ou o fim do arquivo). */
export function faixaDoPedaco(inicio: number, total: number, pedaco = PEDACO_DO_ENVIO): { fim: number; cabecalho: string } {
  const fim = Math.min(inicio + pedaco, total) - 1
  return { fim, cabecalho: `bytes ${inicio}-${fim}/${total}` }
}

/** A pergunta "até onde chegou?" de uma sessão interrompida: PUT vazio com esta faixa. */
export const faixaDaConsulta = (total: number) => `bytes */${total}`

/** De onde continuar, pela resposta 308 (Range: bytes=0-8388607 → 8388608); sem Range, nada chegou ainda. */
export function proximoInicio(range: string | null | undefined): number {
  const m = /bytes=0-(\d+)/.exec(String(range ?? ''))
  return m ? Number(m[1]) + 1 : 0
}

/** O link de uma pasta quando a API não devolve o webViewLink. */
export const linkDaPasta = (id: string) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`
export const linkDoArquivo = (id: string) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`

// ------------------------------------------------------------------ as falhas

export type MotivoDaFalhaDoDrive = 'reconectar' | 'sem_acesso' | 'cota' | 'limite' | 'nao_existe' | 'fora_do_ar' | 'outro'

/**
 * Por que a API recusou, pelo status e pela razão do erro (error.errors[0].reason ou error.status): 401 e a falta de
 * permissão do escopo pedem reconectar; o arquivo que o Palácio não criou (o drive.file não o enxerga), "sem acesso";
 * o Drive cheio, "cota"; chamadas demais, "limite"; 5xx ou sem resposta, "fora do ar".
 */
export function motivoDaFalhaDoDrive(status: number, razao?: string | null): MotivoDaFalhaDoDrive {
  const r = String(razao ?? '')
  if (status === 401 || /authError|insufficientPermissions|insufficientScopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(r)) return 'reconectar'
  if (/storageQuotaExceeded|quotaExceeded|teamDriveFileLimitExceeded/i.test(r)) return 'cota'
  if (status === 429 || /rateLimitExceeded|userRateLimitExceeded|sharingRateLimitExceeded/i.test(r)) return 'limite'
  if (/appNotAuthorizedToFile|appNotAuthorizedToChild|cannotAddParent/i.test(r)) return 'sem_acesso'
  if (status === 404) return 'nao_existe'
  if (status === 0 || status >= 500) return 'fora_do_ar'
  return 'outro'
}

/** A frase da falha, para a pessoa (sem detalhe técnico). */
export function textoDaFalhaDoDrive(motivo: MotivoDaFalhaDoDrive): string {
  if (motivo === 'reconectar') return 'A autorização do Google Drive expirou ou foi revogada. Um administrador reconecta em Configurações → E-mail dos setores.'
  if (motivo === 'cota') return 'O Google Drive da conta conectada está sem espaço. Um administrador libera espaço ou troca a conta em Configurações → E-mail dos setores.'
  if (motivo === 'limite') return 'O Google Drive pediu para esperar um pouco (muitos pedidos de uma vez). Tente de novo daqui a alguns minutos.'
  if (motivo === 'sem_acesso') return 'O Palácio não enxerga essa pasta no Drive (ela não foi criada por ele). Escolha outra pasta.'
  if (motivo === 'nao_existe') return 'A pasta não existe mais no Drive (foi apagada?). Tente de novo: o Palácio cria outra.'
  if (motivo === 'fora_do_ar') return 'O Google Drive não respondeu agora. Tente de novo daqui a pouco.'
  return 'O Google Drive recusou o pedido agora. Tente de novo daqui a pouco.'
}
