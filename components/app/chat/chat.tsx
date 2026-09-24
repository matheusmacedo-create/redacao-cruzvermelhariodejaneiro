'use client'

import Link from 'next/link'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Bell, BellOff, Hash, Loader2, Lock, MoreHorizontal, Pencil, Plus, Search, SendHorizontal, Trash2, UserPlus, Users, X } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { privateAvatarUrl } from '@/lib/avatar-url'
import { createClient as clienteDoNavegador } from '@/lib/supabase/client'
import {
  abrirDireta, adicionarAoCanal, apagarMensagem, carregarAnteriores, criarCanal, editarCanal, editarMensagem, entrarNoCanal,
  enviarMensagem, marcarLido, mudarAvisos, sairDoCanal,
} from '@/app/actions/chat'
import {
  agrupar, juntar, mencaoEmAndamento, mencoesNoTexto, pessoasParaMencionar, rotuloDoDia, TAMANHO_MAXIMO, tituloDaConversa, trechos,
  type MensagemDoChat, type PessoaDoChat,
} from '@/lib/chat/regras'
import type { ConversaNoPainel } from '@/lib/chat/servidor'
import { useChatAoVivo } from './ao-vivo'

const campo = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const hojeEmSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const importa = (c: ConversaNoPainel) => c.membro && c.avisar !== 'nada' && (c.tipo === 'direta' || c.avisar === 'tudo' ? c.nao_lidas > 0 : c.mencoes > 0)

export function Chat({ eu, ehAdmin, redacao, conversas: inicial, atual, mensagens: primeiras, temMais: haMais, membros: membrosIniciais, pessoas }: {
  eu: string
  ehAdmin: boolean
  /** Membro da Redação (cria canais, vê os abertos). A equipe da escola só conversa onde foi chamada. */
  redacao: boolean
  conversas: ConversaNoPainel[]
  atual: ConversaNoPainel
  mensagens: MensagemDoChat[]
  temMais: boolean
  membros: string[]
  pessoas: PessoaDoChat[]
}) {
  const router = useRouter()
  const aoVivo = useChatAoVivo()
  const [conversas, setConversas] = useState(inicial)
  const [mensagens, setMensagens] = useState(primeiras)
  const [temMais, setTemMais] = useState(haMais)
  const [membros, setMembros] = useState(membrosIniciais)
  const [painel, setPainel] = useState<'nada' | 'canal' | 'direta' | 'membros'>('nada')
  const [verLista, setVerLista] = useState(false)
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()
  const lista = useRef<HTMLDivElement>(null)
  const noFim = useRef(true)

  // Quando o servidor manda a página de novo (router.refresh), a lista e as pessoas acompanham.
  // (Cada conversa é um componente novo: a página usa key={atual.id}.)
  const [vindoDoServidor, setVindoDoServidor] = useState({ inicial, primeiras, membrosIniciais })
  if (vindoDoServidor.inicial !== inicial || vindoDoServidor.primeiras !== primeiras || vindoDoServidor.membrosIniciais !== membrosIniciais) {
    setVindoDoServidor({ inicial, primeiras, membrosIniciais })
    setConversas(inicial)
    setMembros(membrosIniciais)
    setMensagens((l) => primeiras.reduce((acc, m) => juntar(acc, m), l))
  }

  const pessoaDe = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas])
  const nomeDe = useCallback((id: string) => pessoaDe.get(id)?.nome ?? 'Alguém', [pessoaDe])
  const conversaAtual = conversas.find((c) => c.id === atual.id) ?? atual
  const titulo = tituloDaConversa(conversaAtual, nomeDe)

  // Diz ao aviso ao vivo qual conversa está aberta, e o número do menu acompanha o que falta ler.
  useEffect(() => { aoVivo?.abrir(atual.id); return () => aoVivo?.abrir(null) }, [atual.id, aoVivo])
  useEffect(() => {
    aoVivo?.definir(conversas.filter((c) => c.id !== atual.id).reduce((s, c) => s + (importa(c) ? (c.tipo === 'direta' || c.avisar === 'tudo' ? c.nao_lidas : c.mencoes) : 0), 0))
  }, [conversas, atual.id, aoVivo])

  // Ao vivo: mensagens novas e editadas desta conversa; nas outras, só o contador.
  const lerDepois = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const supabase = clienteDoNavegador()
    const canal = supabase.channel(`chat-conversa-${atual.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_mensagens' }, (p: { new: Record<string, unknown> }) => {
        const m = p.new as unknown as MensagemDoChat
        if (m.canal_id === atual.id) {
          setMensagens((l) => juntar(l, m))
          if (conversaAtual.membro) {
            if (lerDepois.current) clearTimeout(lerDepois.current)
            lerDepois.current = setTimeout(() => { void marcarLido(atual.id) }, 1500)
          }
        } else if (m.autor_id !== eu) {
          setConversas((cs) => cs.map((c) => c.id === m.canal_id && c.membro
            ? { ...c, nao_lidas: c.nao_lidas + 1, mencoes: c.mencoes + ((m.mencoes ?? []).includes(eu) || m.menciona_todos ? 1 : 0), ultima_mensagem_em: m.created_at }
            : c))
          if (!conversas.some((c) => c.id === m.canal_id)) router.refresh()
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_mensagens', filter: `canal_id=eq.${atual.id}` }, (p: { new: Record<string, unknown> }) => {
        setMensagens((l) => juntar(l, p.new as unknown as MensagemDoChat))
      })
      .subscribe()
    return () => { void supabase.removeChannel(canal); if (lerDepois.current) clearTimeout(lerDepois.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual.id, eu])

  // Rola para o fim quando chega mensagem e a pessoa já estava no fim.
  useLayoutEffect(() => {
    const el = lista.current
    if (el && noFim.current) el.scrollTop = el.scrollHeight
  }, [mensagens])

  const agir = (fn: () => Promise<{ erro?: string }>, depois?: () => void) => iniciar(async () => {
    setErro('')
    const r = await fn()
    if (r.erro) setErro(r.erro); else { depois?.(); router.refresh() }
  })

  const anteriores = () => iniciar(async () => {
    const el = lista.current
    const altura = el?.scrollHeight ?? 0
    const r = await carregarAnteriores(atual.id, mensagens[0]?.created_at ?? new Date().toISOString())
    if (r.erro) { setErro(r.erro); return }
    noFim.current = false
    setMensagens((l) => [...(r.mensagens ?? []), ...l])
    setTemMais(Boolean(r.temMais))
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - altura })
  })

  const canais = conversas.filter((c) => c.tipo === 'canal' && c.membro)
  const abertos = conversas.filter((c) => c.tipo === 'canal' && !c.membro)
  const diretas = conversas.filter((c) => c.tipo === 'direta')
  const naCoversa = membros.map((id) => pessoaDe.get(id)).filter(Boolean) as PessoaDoChat[]
  const podeAdministrar = ehAdmin

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[28rem] overflow-hidden rounded-xl border border-border bg-card" data-chat>
      {/* Lateral: canais e conversas diretas */}
      <aside className={`${verLista ? 'flex' : 'hidden'} w-full flex-col border-r border-border bg-muted/30 md:flex md:w-64 md:shrink-0`} aria-label="Conversas">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <p className="font-semibold">Chat</p>
          <div className="flex gap-1">
            {redacao && <button type="button" onClick={() => setPainel(painel === 'canal' ? 'nada' : 'canal')} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Novo canal" title="Novo canal"><Hash className="size-4" /></button>}
            <button type="button" onClick={() => setPainel(painel === 'direta' ? 'nada' : 'direta')} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Nova conversa" title="Nova conversa"><Plus className="size-4" /></button>
          </div>
        </div>
        <AlertasDoComputador />
        <nav className="flex-1 overflow-y-auto px-2 py-2 text-sm">
          <Secao titulo="Canais">
            {canais.map((c) => <ItemDaLista key={c.id} c={c} atual={c.id === atual.id} rotulo={c.nome ?? ''} icone={c.privado ? Lock : Hash} />)}
          </Secao>
          <Secao titulo="Mensagens diretas">
            {diretas.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Nenhuma ainda. Use o + para começar.</p>}
            {diretas.map((c) => {
              const outras = (c.pessoas ?? []).map((id) => pessoaDe.get(id)).filter(Boolean) as PessoaDoChat[]
              return <ItemDaLista key={c.id} c={c} atual={c.id === atual.id} rotulo={outras.map((p) => p.nome).join(', ') || 'Só você'}
                avatar={outras.length === 1 ? outras[0] : undefined} />
            })}
          </Secao>
          {abertos.length > 0 && (
            <Secao titulo="Outros canais abertos">
              {abertos.map((c) => <ItemDaLista key={c.id} c={c} atual={c.id === atual.id} rotulo={c.nome ?? ''} icone={Hash} apagado />)}
            </Secao>
          )}
        </nav>
      </aside>

      {/* Conversa */}
      <section className={`${verLista ? 'hidden' : 'flex'} min-w-0 flex-1 flex-col md:flex`} aria-label={titulo}>
        <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted md:hidden" onClick={() => setVerLista(true)} aria-label="Ver conversas"><ArrowLeft className="size-4" /></button>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate font-semibold" data-titulo-da-conversa>
              {conversaAtual.tipo === 'canal' && conversaAtual.privado && <Lock className="size-3.5 shrink-0 text-muted-foreground" />}{titulo}
              {conversaAtual.arquivado && <span className="ml-1 rounded bg-muted px-1.5 text-[11px] font-normal text-muted-foreground">arquivado</span>}
            </p>
            {conversaAtual.descricao && <p className="truncate text-xs text-muted-foreground">{conversaAtual.descricao}</p>}
          </div>
          <button type="button" onClick={() => setPainel(painel === 'membros' ? 'nada' : 'membros')} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Pessoas nesta conversa">
            <Users className="size-3.5" />{membros.length}
          </button>
          {conversaAtual.membro && <Avisos c={conversaAtual} onMudar={(v) => agir(() => mudarAvisos(atual.id, v), () => setConversas((cs) => cs.map((c) => (c.id === atual.id ? { ...c, avisar: v } : c))))} />}
        </header>

        {painel === 'canal' && <NovoCanal pessoas={pessoas.filter((p) => p.id !== eu && p.ativo)} onFechar={() => setPainel('nada')} />}
        {painel === 'direta' && <NovaDireta pessoas={pessoas.filter((p) => p.id !== eu && p.ativo)} onFechar={() => setPainel('nada')} />}
        {painel === 'membros' && (
          <Membros c={conversaAtual} pessoas={naCoversa} todas={pessoas} eu={eu} redacao={redacao} podeAdministrar={podeAdministrar} ocupado={pendente}
            onAdicionar={(ids) => agir(() => adicionarAoCanal(atual.id, ids), () => setMembros((m) => [...new Set([...m, ...ids])]))}
            onSair={() => agir(() => sairDoCanal(atual.id), () => router.push('/chat'))}
            onArquivar={(a) => agir(() => editarCanal(atual.id, conversaAtual.descricao, a))}
            onFechar={() => setPainel('nada')} />
        )}

        <div ref={lista} className="flex-1 overflow-y-auto px-3 py-3" data-mensagens
          onScroll={(e) => { const el = e.currentTarget; noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }}>
          {temMais && (
            <div className="mb-3 text-center">
              <Button size="sm" variant="ghost" disabled={pendente} onClick={anteriores}>{pendente && <Loader2 className="size-3.5 animate-spin" />}Carregar mensagens anteriores</Button>
            </div>
          )}
          {!mensagens.length && (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Nada por aqui ainda.</p>
              <p>{conversaAtual.tipo === 'canal' ? `Esta é a primeira página de ${titulo}.` : 'Mande a primeira mensagem.'}</p>
            </div>
          )}
          <Mensagens mensagens={mensagens} pessoaDe={pessoaDe} eu={eu} ehAdmin={ehAdmin} nomes={pessoas.map((p) => p.nome)} onErro={setErro} />
        </div>

        {erro && <p className="mx-3 mb-1 rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive" role="alert">{erro}</p>}
        {!conversaAtual.membro && conversaAtual.tipo === 'canal' && (
          <div className="mx-3 mb-1 flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Você está vendo {titulo} sem participar.</span>
            <Button size="sm" disabled={pendente} onClick={() => agir(() => entrarNoCanal(atual.id))}>Entrar no canal</Button>
          </div>
        )}
        {conversaAtual.arquivado
          ? <p className="border-t border-border px-3 py-3 text-center text-sm text-muted-foreground">Canal arquivado: dá para ler, não para escrever.</p>
          : <Escrever canalId={atual.id} tipo={conversaAtual.tipo} titulo={titulo} pessoas={naCoversa.filter((p) => p.id !== eu)} onEnviada={(m) => { noFim.current = true; setMensagens((l) => juntar(l, m)) }} onErro={setErro} />}
      </section>
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  )
}

function ItemDaLista({ c, atual, rotulo, icone: Icone, avatar, apagado }: {
  c: ConversaNoPainel; atual: boolean; rotulo: string; icone?: typeof Hash; avatar?: PessoaDoChat; apagado?: boolean
}) {
  const destaque = importa(c)
  const n = c.tipo === 'direta' || c.avisar === 'tudo' ? c.nao_lidas : c.mencoes
  const temNovas = c.membro && c.nao_lidas > 0 && c.avisar !== 'nada'
  return (
    <li>
      <Link href={`/chat/${c.id}`} aria-current={atual ? 'page' : undefined} data-conversa={rotulo}
        className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${atual ? 'bg-primary/10 text-primary' : 'hover:bg-muted'} ${temNovas ? 'font-semibold text-foreground' : apagado ? 'text-muted-foreground' : ''}`}>
        {avatar ? <Avatar initials={avatar.iniciais} color={avatar.cor ?? undefined} src={privateAvatarUrl(avatar.avatar)} size="xs" className="size-5 text-[9px]" />
          : Icone ? <Icone className="size-3.5 shrink-0 opacity-70" /> : <Users className="size-3.5 shrink-0 opacity-70" />}
        <span className="min-w-0 flex-1 truncate">{rotulo}</span>
        {c.avisar === 'nada' && c.membro && <BellOff className="size-3 opacity-50" aria-label="Silenciado" />}
        {destaque && n > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground" data-nao-lidas>{n > 99 ? '99+' : n}</span>}
      </Link>
    </li>
  )
}

function Avisos({ c, onMudar }: { c: ConversaNoPainel; onMudar: (v: 'tudo' | 'mencoes' | 'nada') => void }) {
  const opcoes = c.tipo === 'direta'
    ? [['tudo', 'Avisar toda mensagem'], ['nada', 'Silenciar']] as const
    : [['tudo', 'Avisar toda mensagem'], ['mencoes', 'Só quando me mencionarem'], ['nada', 'Silenciar']] as const
  return (
    <label className="flex items-center gap-1 text-xs text-muted-foreground" title="Quando esta conversa avisa você (sino, e-mail e alerta)">
      {c.avisar === 'nada' ? <BellOff className="size-3.5" /> : <Bell className="size-3.5" />}
      <select value={c.avisar} onChange={(e) => onMudar(e.target.value as 'tudo' | 'mencoes' | 'nada')} className="max-w-36 rounded border-0 bg-transparent py-1 text-xs outline-none hover:bg-muted" aria-label="Avisos desta conversa">
        {opcoes.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
      </select>
    </label>
  )
}

function Mensagens({ mensagens, pessoaDe, eu, ehAdmin, nomes, onErro }: {
  mensagens: MensagemDoChat[]; pessoaDe: Map<string, PessoaDoChat>; eu: string; ehAdmin: boolean; nomes: string[]; onErro: (e: string) => void
}) {
  const hoje = hojeEmSP()
  const dias = useMemo(() => agrupar(mensagens), [mensagens])
  return (
    <div className="flex flex-col gap-3">
      {dias.map((d) => (
        <div key={d.dia}>
          <div className="relative my-2 flex items-center justify-center" role="separator">
            <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
            <span className="relative rounded-full border border-border bg-card px-3 py-0.5 text-[11px] font-medium text-muted-foreground">{rotuloDoDia(d.dia, hoje)}</span>
          </div>
          {d.grupos.map((g) => {
            const p = g.autor_id ? pessoaDe.get(g.autor_id) : undefined
            return (
              <div key={g.mensagens[0].id} className="flex gap-2.5 py-1">
                <Avatar initials={p?.iniciais ?? '?'} color={p?.cor ?? undefined} src={privateAvatarUrl(p?.avatar)} size="sm" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm"><span className="font-semibold">{p?.nome ?? 'Alguém'}</span> <span className="text-[11px] text-muted-foreground">{hora(g.mensagens[0].created_at)}</span></p>
                  {g.mensagens.map((m) => <UmaMensagem key={m.id} m={m} minha={m.autor_id === eu} podeApagar={m.autor_id === eu || ehAdmin} nomes={nomes} eu={pessoaDe.get(eu)?.nome} onErro={onErro} />)}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function UmaMensagem({ m, minha, podeApagar, nomes, eu, onErro }: { m: MensagemDoChat; minha: boolean; podeApagar: boolean; nomes: string[]; eu?: string; onErro: (e: string) => void }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(m.corpo)
  const [ocupado, iniciar] = useTransition()
  if (m.apagada_em) return <p className="text-sm italic text-muted-foreground" data-mensagem={m.id}>mensagem apagada</p>
  const salvar = () => iniciar(async () => { const r = await editarMensagem(m.id, texto); if (r.erro) onErro(r.erro); else setEditando(false) })
  return (
    <div className="group relative -mx-1 rounded px-1 hover:bg-muted/40" data-mensagem={m.id}>
      {editando ? (
        <div className="flex flex-col gap-1 py-1">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={TAMANHO_MAXIMO} className={campo} autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); salvar() } if (e.key === 'Escape') setEditando(false) }} />
          <div className="flex gap-2 text-xs"><Button size="sm" disabled={ocupado} onClick={salvar}>Salvar</Button><Button size="sm" variant="ghost" onClick={() => { setEditando(false); setTexto(m.corpo) }}>Cancelar</Button></div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {trechos(m.corpo, nomes).map((t, i) => t.tipo === 'link'
            ? <a key={i} href={t.valor} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{t.valor}</a>
            : t.tipo === 'mencao'
              ? <span key={i} className={`rounded px-0.5 font-medium ${t.valor === `@${eu}` || t.valor === '@canal' || t.valor === '@todos' ? 'bg-warning/25 text-foreground' : 'bg-primary/10 text-primary'}`}>{t.valor}</span>
              : <span key={i}>{t.valor}</span>)}
          {m.editada_em && <span className="ml-1 text-[11px] text-muted-foreground">(editada)</span>}
        </p>
      )}
      {!editando && (minha || podeApagar) && (
        <div className="absolute -top-3 right-1 hidden gap-0.5 rounded-md border border-border bg-card p-0.5 shadow-sm group-hover:flex group-focus-within:flex">
          {minha && <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Editar mensagem" onClick={() => setEditando(true)}><Pencil className="size-3.5" /></button>}
          {podeApagar && <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="Apagar mensagem" disabled={ocupado}
            onClick={() => { if (confirm('Apagar esta mensagem? Ela some da conversa (o registro fica guardado para a administração).')) iniciar(async () => { const r = await apagarMensagem(m.id); if (r.erro) onErro(r.erro) }) }}><Trash2 className="size-3.5" /></button>}
        </div>
      )}
    </div>
  )
}

function Escrever({ canalId, tipo, titulo, pessoas, onEnviada, onErro }: {
  canalId: string; tipo: string; titulo: string; pessoas: PessoaDoChat[]; onEnviada: (m: MensagemDoChat) => void; onErro: (e: string) => void
}) {
  const chave = `chat-rascunho-${canalId}`
  const [texto, setTexto] = useState('')
  const [escolhidas, setEscolhidas] = useState<{ id: string; nome: string }[]>([])
  const [mencao, setMencao] = useState<{ inicio: number; busca: string } | null>(null)
  const [indice, setIndice] = useState(0)
  const [enviando, iniciar] = useTransition()
  const caixa = useRef<HTMLTextAreaElement>(null)

  // O rascunho não se perde ao trocar de conversa.
  // O rascunho guardado só existe no navegador: lido depois de montar, para o HTML do servidor bater.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { try { setTexto(localStorage.getItem(chave) ?? '') } catch { setTexto('') } }, [chave])
  useEffect(() => { try { if (texto) localStorage.setItem(chave, texto); else localStorage.removeItem(chave) } catch { /* sem armazenamento local */ } }, [chave, texto])
  useEffect(() => { const el = caixa.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 200)}px` } }, [texto])

  const opcoes = useMemo(() => {
    if (!mencao) return []
    const lista: { id: string; nome: string; sub?: string }[] = pessoasParaMencionar(pessoas, mencao.busca).map((p) => ({ id: p.id, nome: p.nome }))
    if (tipo === 'canal' && 'canal'.startsWith(mencao.busca.toLowerCase())) lista.push({ id: 'canal', nome: 'canal', sub: 'avisa todo mundo do canal' })
    return lista
  }, [mencao, pessoas, tipo])

  const escolher = (o: { id: string; nome: string }) => {
    if (!mencao) return
    const antes = texto.slice(0, mencao.inicio)
    const depois = texto.slice(mencao.inicio + 1 + mencao.busca.length)
    const novo = `${antes}@${o.nome} ${depois}`
    setTexto(novo)
    if (o.id !== 'canal') setEscolhidas((e) => [...e.filter((x) => x.id !== o.id), { id: o.id, nome: o.nome }])
    setMencao(null)
    requestAnimationFrame(() => { const el = caixa.current; if (el) { const pos = antes.length + o.nome.length + 2; el.focus(); el.setSelectionRange(pos, pos) } })
  }

  const enviar = () => {
    const corpo = texto.trim()
    if (!corpo || enviando) return
    iniciar(async () => {
      const r = await enviarMensagem(canalId, corpo, mencoesNoTexto(corpo, escolhidas))
      if (r.erro) { onErro(r.erro); return }
      onErro('')
      setTexto(''); setEscolhidas([])
      if (r.mensagem) onEnviada(r.mensagem)
    })
  }

  return (
    <div className="relative border-t border-border p-3">
      {mencao && opcoes.length > 0 && (
        <ul className="absolute bottom-full left-3 z-10 mb-1 w-64 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg" role="listbox" aria-label="Mencionar">
          {opcoes.map((o, i) => (
            <li key={o.id}>
              <button type="button" role="option" aria-selected={i === indice} onMouseDown={(e) => { e.preventDefault(); escolher(o) }}
                className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm ${i === indice ? 'bg-muted' : ''}`}>
                <span className="font-medium">@{o.nome}</span>{o.sub && <span className="text-xs text-muted-foreground">{o.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
        <textarea ref={caixa} value={texto} rows={1} maxLength={TAMANHO_MAXIMO} placeholder={`Mensagem para ${titulo}`} aria-label={`Mensagem para ${titulo}`}
          className="max-h-[200px] min-h-6 flex-1 resize-none bg-transparent text-sm outline-none"
          onChange={(e) => { setTexto(e.target.value); setMencao(mencaoEmAndamento(e.target.value, e.target.selectionStart ?? e.target.value.length)); setIndice(0) }}
          onKeyDown={(e) => {
            if (mencao && opcoes.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIndice((i) => (i + 1) % opcoes.length); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIndice((i) => (i - 1 + opcoes.length) % opcoes.length); return }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); escolher(opcoes[indice]); return }
              if (e.key === 'Escape') { setMencao(null); return }
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); enviar() }
          }} />
        <Button size="icon" className="size-8 shrink-0" disabled={enviando || !texto.trim()} onClick={enviar} aria-label="Enviar">
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
        </Button>
      </div>
      <p className="mt-1 px-1 text-[11px] text-muted-foreground">Enter envia · Shift+Enter quebra linha · @ menciona{tipo === 'canal' ? ' · @canal avisa todos' : ''}</p>
    </div>
  )
}

function EscolherPessoas({ pessoas, marcadas, setMarcadas }: { pessoas: PessoaDoChat[]; marcadas: Set<string>; setMarcadas: (s: Set<string>) => void }) {
  const [busca, setBusca] = useState('')
  const visiveis = busca ? pessoasParaMencionar(pessoas, busca, 50) : pessoas
  return (
    <div className="flex flex-col gap-2">
      <label className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa" className={`${campo} pl-8`} aria-label="Buscar pessoa" /></label>
      <div className="grid max-h-44 gap-1 overflow-y-auto sm:grid-cols-2">
        {visiveis.map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={marcadas.has(p.id)} onChange={() => { const n = new Set(marcadas); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); setMarcadas(n) }} />
            {p.nome}
          </label>
        ))}
      </div>
    </div>
  )
}

function Quadro({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="border-b border-border bg-muted/30 p-3" data-quadro={titulo}>
      <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">{titulo}</p>
        <button type="button" onClick={onFechar} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X className="size-4" /></button></div>
      {children}
    </div>
  )
}

function NovoCanal({ pessoas, onFechar }: { pessoas: PessoaDoChat[]; onFechar: () => void }) {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [privado, setPrivado] = useState(false)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  return (
    <Quadro titulo="Novo canal" onFechar={onFechar}>
      <form className="flex flex-col gap-2" onSubmit={(e) => {
        e.preventDefault()
        iniciar(async () => { const r = await criarCanal({ nome, descricao, privado, pessoas: [...marcadas] }); if (r.erro) setErro(r.erro); else if (r.id) { onFechar(); router.push(`/chat/${r.id}`) } })
      }}>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="nome (ex.: campanha-natal)" required maxLength={40} className={campo} aria-label="Nome do canal" />
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Para que serve (opcional)" maxLength={300} className={campo} aria-label="Descrição" />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={privado} onChange={(e) => setPrivado(e.target.checked)} />
          Privado <span className="text-xs text-muted-foreground">(só quem for chamado vê; aberto, qualquer um da Redação lê e entra)</span></label>
        <p className="text-xs font-medium text-muted-foreground">Chamar pessoas</p>
        <EscolherPessoas pessoas={pessoas} marcadas={marcadas} setMarcadas={setMarcadas} />
        {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={onFechar}>Cancelar</Button>
          <Button type="submit" size="sm" disabled={ocupado || nome.trim().length < 2}>{ocupado && <Loader2 className="size-3.5 animate-spin" />}Criar canal</Button></div>
      </form>
    </Quadro>
  )
}

function NovaDireta({ pessoas, onFechar }: { pessoas: PessoaDoChat[]; onFechar: () => void }) {
  const router = useRouter()
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  return (
    <Quadro titulo="Nova conversa direta" onFechar={onFechar}>
      <EscolherPessoas pessoas={pessoas} marcadas={marcadas} setMarcadas={setMarcadas} />
      {erro && <p className="mt-2 text-xs text-destructive" role="alert">{erro}</p>}
      <div className="mt-2 flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={onFechar}>Cancelar</Button>
        <Button size="sm" disabled={ocupado || !marcadas.size} onClick={() => iniciar(async () => { const r = await abrirDireta([...marcadas]); if (r.erro) setErro(r.erro); else if (r.id) { onFechar(); router.push(`/chat/${r.id}`) } })}>
          {ocupado && <Loader2 className="size-3.5 animate-spin" />}Abrir conversa{marcadas.size > 1 ? ` com ${marcadas.size} pessoas` : ''}</Button></div>
    </Quadro>
  )
}

function Membros({ c, pessoas, todas, eu, redacao, podeAdministrar, ocupado, onAdicionar, onSair, onArquivar, onFechar }: {
  c: ConversaNoPainel; pessoas: PessoaDoChat[]; todas: PessoaDoChat[]; eu: string; redacao: boolean; podeAdministrar: boolean; ocupado: boolean
  onAdicionar: (ids: string[]) => void; onSair: () => void; onArquivar: (a: boolean) => void; onFechar: () => void
}) {
  const [chamando, setChamando] = useState(false)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const fora = todas.filter((p) => p.ativo && !pessoas.some((x) => x.id === p.id))
  return (
    <Quadro titulo={`Pessoas (${pessoas.length})`} onFechar={onFechar}>
      <ul className="mb-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
        {pessoas.map((p) => <li key={p.id} className="flex items-center gap-1.5 rounded-full bg-background py-0.5 pl-0.5 pr-2 text-xs"><Avatar initials={p.iniciais} color={p.cor ?? undefined} src={privateAvatarUrl(p.avatar)} size="xs" className="size-5 text-[9px]" />{p.nome}{p.id === eu && ' (você)'}</li>)}
      </ul>
      {chamando ? (
        <div className="flex flex-col gap-2">
          <EscolherPessoas pessoas={fora} marcadas={marcadas} setMarcadas={setMarcadas} />
          <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setChamando(false)}>Cancelar</Button>
            <Button size="sm" disabled={ocupado || !marcadas.size} onClick={() => { onAdicionar([...marcadas]); setChamando(false); setMarcadas(new Set()) }}>Chamar</Button></div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {c.tipo === 'canal' && redacao && !c.arquivado && <Button size="sm" variant="outline" onClick={() => setChamando(true)}><UserPlus className="size-3.5" />Chamar pessoas</Button>}
          {c.tipo === 'canal' && c.membro && !c.geral && <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => { if (confirm(`Sair de #${c.nome}?`)) onSair() }}>Sair do canal</Button>}
          {c.tipo === 'canal' && !c.geral && podeAdministrar && <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => onArquivar(!c.arquivado)}><MoreHorizontal className="size-3.5" />{c.arquivado ? 'Desarquivar' : 'Arquivar canal'}</Button>}
        </div>
      )}
    </Quadro>
  )
}

/** Pede, uma vez, para o navegador mostrar os alertas do chat quando a aba estiver em segundo plano. */
function AlertasDoComputador() {
  const [estado, setEstado] = useState<'pedir' | 'ok' | 'negado' | 'sem'>('ok')
  // A permissão só existe no navegador: lida depois de montar.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (typeof Notification === 'undefined') { setEstado('sem'); return }
    setEstado(Notification.permission === 'default' ? 'pedir' : Notification.permission === 'granted' ? 'ok' : 'negado')
  }, [])
  if (estado !== 'pedir') return null
  return (
    <button type="button" className="mx-2 mt-2 flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-left text-xs text-primary hover:bg-primary/15" data-ativar-alertas
      onClick={async () => { const r = await Notification.requestPermission(); setEstado(r === 'granted' ? 'ok' : 'negado') }}>
      <Bell className="size-3.5 shrink-0" />Ativar alertas no computador para mensagens novas
    </button>
  )
}
