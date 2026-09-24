/**
 * Regras do chat sem banco nem rede — dá para conferir com tsx.
 *
 * Menção: o texto guarda "@Nome Sobrenome" como a pessoa digitou (escolhido
 * na lista do @), e a lista de ids vai à parte — é ela que o banco usa para
 * avisar. "@canal" e "@todos" chamam todo mundo do canal.
 */

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
}

export type PessoaDoChat = { id: string; nome: string; iniciais: string; cor: string | null; avatar: string | null; ativo: boolean }

export const COLUNAS_DA_MENSAGEM = 'id,canal_id,autor_id,corpo,mencoes,menciona_todos,editada_em,apagada_em,created_at'
export const POR_PAGINA = 60
export const TAMANHO_MAXIMO = 8000

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

/** Título da conversa: #canal, ou os nomes de quem está na direta. */
export function tituloDaConversa(c: { tipo: string; nome: string | null; pessoas: string[] | null }, nomeDe: (id: string) => string): string {
  if (c.tipo === 'canal') return `#${c.nome}`
  const nomes = (c.pessoas ?? []).map(nomeDe)
  return nomes.length ? nomes.join(', ') : 'Só você'
}
