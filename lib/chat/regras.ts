/**
 * Regras do chat sem banco nem rede — dá para conferir com tsx.
 *
 * Menção: o texto guarda "@Nome Sobrenome" como a pessoa digitou (escolhido
 * na lista do @), e a lista de ids vai à parte — é ela que o banco usa para
 * avisar. "@canal" e "@todos" chamam todo mundo do canal.
 */

export type AnexoDoChat = { id: string; nome: string; mime: string; tamanho: number; tipo: 'imagem' | 'audio' | 'video' | 'arquivo'; duracao: number | null }
export type ReacaoDoChat = { emoji: string; pessoas: string[] }

export type MensagemDoChat = {
  id: string
  canal_id: string
  autor_id: string | null
  corpo: string
  mencoes: string[]
  menciona_todos: boolean
  editada_em: string | null
  apagada_em: string | null
  created_at: string
  /** Resposta em fio: a mensagem principal. */
  resposta_de: string | null
  respostas: number
  ultima_resposta_em: string | null
  respondentes: string[]
  reacoes: ReacaoDoChat[]
  anexos: AnexoDoChat[]
}

export type PessoaDoChat = { id: string; nome: string; iniciais: string; cor: string | null; avatar: string | null; ativo: boolean }

export const COLUNAS_DA_MENSAGEM = 'id,canal_id,autor_id,corpo,mencoes,menciona_todos,editada_em,apagada_em,created_at,resposta_de,respostas,ultima_resposta_em,respondentes,reacoes,anexos'
export const POR_PAGINA = 60
export const TAMANHO_MAXIMO = 8000
export const ARQUIVOS_POR_MENSAGEM = 10
export const TAMANHO_MAXIMO_DO_ARQUIVO = 50 * 1024 * 1024
/** Gravação de voz: para sozinha aos 10 minutos. */
export const DURACAO_MAXIMA_DO_AUDIO = 600

/** As reações de um clique e o resto da paleta. */
export const REACOES_RAPIDAS = ['👍', '❤️', '😂', '🎉', '🙏', '👀']
export const REACOES = [...REACOES_RAPIDAS, '✅', '👏', '🙌', '💪', '🔥', '⭐', '😊', '😍', '🤔', '😮', '😢', '😅', '🚑', '⛑️', '📌', '📣', '✍️', '👌']

/** "@canal" ou "@todos", como palavra solta. */
export const chamaTodos = (corpo: string) => /(^|\s)@(canal|todos)\b/i.test(corpo)

/** Os ids mencionados que ainda aparecem no texto (quem apagou o "@Fulano" do rascunho não é avisado). */
export function mencoesNoTexto(corpo: string, escolhidas: { id: string; nome: string }[]): string[] {
  return [...new Set(escolhidas.filter((p) => p.nome && corpo.includes(`@${p.nome}`)).map((p) => p.id))]
}

/** O pedaço do texto que o "@" está digitando agora (para a lista de pessoas), ou null. */
export function mencaoEmAndamento(texto: string, cursor: number): { inicio: number; busca: string } | null {
  const antes = texto.slice(0, cursor)
  const m = /(^|\s)@([\p{L}\p{N}._-]{0,30})$/u.exec(antes)
  if (!m) return null
  return { inicio: antes.length - m[2].length - 1, busca: m[2] }
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function pessoasParaMencionar<T extends { nome: string; ativo?: boolean }>(pessoas: T[], busca: string, max = 6): T[] {
  const b = semAcento(busca)
  return pessoas.filter((p) => p.ativo !== false && semAcento(p.nome).split(/\s+/).some((parte) => parte.startsWith(b)) || (b && semAcento(p.nome).startsWith(b))).slice(0, max)
}

export type Trecho = { tipo: 'texto' | 'link' | 'mencao'; valor: string }

/** Divide o texto em pedaços para a tela: links clicáveis e menções em destaque. Nada vira HTML. */
export function trechos(corpo: string, nomes: string[]): Trecho[] {
  const nomesOrdenados = [...new Set(nomes.filter(Boolean))].sort((a, b) => b.length - a.length)
  const partes: Trecho[] = []
  const padrao = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g
  let ultimo = 0
  const empurrarTexto = (t: string) => {
    let resto = t
    while (resto) {
      let achou: { i: number; nome: string } | null = null
      for (const n of [...nomesOrdenados.map((x) => `@${x}`), '@canal', '@todos']) {
        const i = resto.indexOf(n)
        if (i >= 0 && (!achou || i < achou.i)) achou = { i, nome: n }
      }
      if (!achou) { partes.push({ tipo: 'texto', valor: resto }); break }
      if (achou.i > 0) partes.push({ tipo: 'texto', valor: resto.slice(0, achou.i) })
      partes.push({ tipo: 'mencao', valor: achou.nome })
      resto = resto.slice(achou.i + achou.nome.length)
    }
  }
  for (const m of corpo.matchAll(padrao)) {
    if (m.index! > ultimo) empurrarTexto(corpo.slice(ultimo, m.index))
    partes.push({ tipo: 'link', valor: m[0] })
    ultimo = m.index! + m[0].length
  }
  if (ultimo < corpo.length) empurrarTexto(corpo.slice(ultimo))
  return partes
}

/** Tipos que o navegador mostra sem risco; o resto é sempre baixado. */
export const abreNaTela = (mime: string) => /^(image\/(png|jpe?g|gif|webp|avif)|audio\/|video\/(mp4|webm|ogg|quicktime)|application\/pdf$)/.test(mime)

export function tipoDoArquivo(mime: string): AnexoDoChat['tipo'] {
  if (mime.startsWith('image/')) return 'imagem'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  return 'arquivo'
}

export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',')} MB`
}

export function duracaoLegivel(segundos: number | null | undefined): string {
  const s = Math.max(0, Math.round(segundos ?? 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** O nome do arquivo no caminho do Storage: sem acento, espaço ou símbolo (o nome original fica na mensagem). */
export function nomeParaCaminho(nome: string): string {
  const limpo = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const ponto = limpo.lastIndexOf('.')
  const base = (ponto > 0 ? limpo.slice(0, ponto) : limpo).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'arquivo'
  const ext = ponto > 0 ? limpo.slice(ponto + 1).replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toLowerCase() : ''
  return ext ? `${base}.${ext}` : base
}

/** O que o aviso diz de uma mensagem: o texto, ou o que foi mandado. */
export function textoDoAviso(m: { corpo: string; anexos?: { tipo: string; nome: string }[] | null }, max = 140): string {
  const texto = resumoDaMensagem(m.corpo ?? '', max)
  if (texto) return texto
  const anexos = m.anexos ?? []
  if (!anexos.length) return ''
  if (anexos.length === 1 && anexos[0].tipo === 'audio') return '🎤 Mensagem de voz'
  if (anexos.length === 1) return `📎 ${anexos[0].nome}`
  return `📎 ${anexos.length} arquivos`
}

/** Liga ou desliga a minha reação (para a tela responder antes do banco). */
export function alternarReacao(reacoes: ReacaoDoChat[], emoji: string, eu: string): ReacaoDoChat[] {
  const i = reacoes.findIndex((r) => r.emoji === emoji)
  if (i < 0) return [...reacoes, { emoji, pessoas: [eu] }]
  const r = reacoes[i]
  const pessoas = r.pessoas.includes(eu) ? r.pessoas.filter((p) => p !== eu) : [...r.pessoas, eu]
  const copia = reacoes.slice()
  if (pessoas.length) copia[i] = { ...r, pessoas }; else copia.splice(i, 1)
  return copia
}

/** Os pedaços do texto que batem com a busca (sem acento, por começo de palavra), para destacar. */
export function marcarBusca(bruto: string, busca: string): { valor: string; achou: boolean }[] {
  // Composto (NFC), cada letra acentuada vira uma só sem acento: as posições batem com o original.
  const texto = bruto.normalize('NFC')
  const palavras = semAcento(busca).split(/[^a-z0-9]+/).filter(Boolean)
  if (!palavras.length) return [{ valor: texto, achou: false }]
  const normal = semAcento(texto)
  const partes: { valor: string; achou: boolean }[] = []
  let i = 0
  const re = /[\p{L}\p{N}]+/gu
  for (const m of normal.matchAll(re)) {
    if (!palavras.some((p) => m[0].startsWith(p))) continue
    const tamanho = Math.max(...palavras.filter((p) => m[0].startsWith(p)).map((p) => p.length))
    if (m.index! > i) partes.push({ valor: texto.slice(i, m.index), achou: false })
    partes.push({ valor: texto.slice(m.index, m.index! + tamanho), achou: true })
    i = m.index! + tamanho
  }
  if (i < texto.length) partes.push({ valor: texto.slice(i), achou: false })
  return partes
}

/** Um trecho curto da mensagem para o aviso (sino, e-mail, notificação do navegador). */
export const resumoDaMensagem = (corpo: string, max = 140) => {
  const t = corpo.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

const diaEmSP = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

export type BlocoDoDia<T extends { autor_id: string | null; created_at: string }> = {
  dia: string
  grupos: { autor_id: string | null; mensagens: T[] }[]
}

/**
 * Separa por dia (em Brasília) e junta mensagens seguidas da mesma pessoa
 * com menos de 5 minutos entre elas — como no Slack, o nome aparece uma vez.
 */
export function agrupar<T extends { autor_id: string | null; created_at: string }>(mensagens: T[]): BlocoDoDia<T>[] {
  const dias: BlocoDoDia<T>[] = []
  for (const m of mensagens) {
    const dia = diaEmSP(m.created_at)
    let bloco = dias[dias.length - 1]
    if (!bloco || bloco.dia !== dia) { bloco = { dia, grupos: [] }; dias.push(bloco) }
    const grupo = bloco.grupos[bloco.grupos.length - 1]
    const anterior = grupo?.mensagens[grupo.mensagens.length - 1]
    if (grupo && grupo.autor_id === m.autor_id && anterior && Date.parse(m.created_at) - Date.parse(anterior.created_at) < 5 * 60_000) grupo.mensagens.push(m)
    else bloco.grupos.push({ autor_id: m.autor_id, mensagens: [m] })
  }
  return dias
}

/** "Hoje", "Ontem" ou "segunda-feira, 22 de setembro". */
export function rotuloDoDia(dia: string, hoje: string): string {
  if (dia === hoje) return 'Hoje'
  const ontem = new Date(Date.parse(`${hoje}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  if (dia === ontem) return 'Ontem'
  const t = new Date(`${dia}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Junta a mensagem que chegou (ao vivo ou ao enviar) na lista, sem repetir e em ordem. */
export function juntar<T extends { id: string; created_at: string }>(lista: T[], nova: T): T[] {
  const i = lista.findIndex((m) => m.id === nova.id)
  if (i >= 0) { const copia = lista.slice(); copia[i] = nova; return copia }
  const copia = [...lista, nova]
  return copia[copia.length - 2] && copia[copia.length - 2].created_at > nova.created_at ? copia.sort((a, b) => a.created_at.localeCompare(b.created_at)) : copia
}

/** Troca a mensagem que mudou (editada, apagada, reação, resposta nova) — só se ela já está na lista. */
export function substituir<T extends { id: string }>(lista: T[], nova: T): T[] {
  const i = lista.findIndex((m) => m.id === nova.id)
  if (i < 0) return lista
  const copia = lista.slice(); copia[i] = { ...copia[i], ...nova }; return copia
}

/** Título da conversa: #canal, ou os nomes de quem está na direta. */
export function tituloDaConversa(c: { tipo: string; nome: string | null; pessoas: string[] | null }, nomeDe: (id: string) => string): string {
  if (c.tipo === 'canal') return `#${c.nome}`
  const nomes = (c.pessoas ?? []).map(nomeDe)
  return nomes.length ? nomes.join(', ') : 'Só você'
}
