'use client'

import Link from 'next/link'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, AtSign, Bell, BellOff, Hash, Loader2, Lock, MoreHorizontal, Paperclip, Plus, Search, UserPlus, Users, X } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { privateAvatarUrl } from '@/lib/avatar-url'
import { createClient as clienteDoNavegador } from '@/lib/supabase/client'
import {
  abrirDireta, adicionarAoCanal, carregarAnteriores, carregarFio, criarCanal, editarCanal, entrarNoCanal, marcarLido, mudarAvisos, sairDoCanal,
} from '@/app/actions/chat'
import { juntar, pessoasParaMencionar, substituir, tituloDaConversa, type MensagemDoChat, type PessoaDoChat } from '@/lib/chat/regras'
import type { ConversaNoPainel } from '@/lib/chat/servidor'
import { useChatAoVivo } from './ao-vivo'
import { Busca, buscaVazia, type FiltrosDaBusca } from './busca'
import { Escrever, type EntradaDeArquivos } from './escrever'
import { Fio, type FioAberto } from './fio'
import { campo, Mensagens, type Contexto } from './mensagem'

const importa = (c: ConversaNoPainel) => c.membro && c.avisar !== 'nada' && (c.tipo === 'direta' || c.avisar === 'tudo' ? c.nao_lidas > 0 : c.mencoes > 0)

type Lado = { tipo: 'nada' } | { tipo: 'fio'; fio: FioAberto } | { tipo: 'busca'; filtros: FiltrosDaBusca; vez: number }

export function Chat({ eu, ehAdmin, redacao, conversas: inicial, atual, mensagens: primeiras, temMais: haMais, membros: membrosIniciais, pessoas, fioInicial, destaque: destaqueInicial }: {
  eu: string
  ehAdmin: boolean
  /** Membro da Redação (cria canais, vê os abertos). A equipe da escola só conversa onde foi chamada. */
  redacao: boolean
  conversas: ConversaNoPainel[]
  atual: ConversaNoPainel
  /** As principais (respostas em fio ficam no fio). */
  mensagens: MensagemDoChat[]
  temMais: boolean
  membros: string[]
  pessoas: PessoaDoChat[]
  /** Aberta por link: o fio já carregado e a mensagem para destacar. */
  fioInicial?: { pai: MensagemDoChat; respostas: MensagemDoChat[] } | null
  destaque?: string | null
}) {
  const router = useRouter()
  const aoVivo = useChatAoVivo()
  const [conversas, setConversas] = useState(inicial)
  const [mensagens, setMensagens] = useState(primeiras)
  const [temMais, setTemMais] = useState(haMais)
  const [membros, setMembros] = useState(membrosIniciais)
  const [painel, setPainel] = useState<'nada' | 'canal' | 'direta' | 'membros'>('nada')
  const [lado, setLado] = useState<Lado>(fioInicial ? { tipo: 'fio', fio: { ...fioInicial, carregando: false } } : { tipo: 'nada' })
  const [verLista, setVerLista] = useState(false)
  const [erro, setErro] = useState('')
  const [fora, setFora] = useState<string[]>([])
  const [destaque, setDestaque] = useState(destaqueInicial ?? null)
  const [arrastando, setArrastando] = useState(false)
  const [pendente, iniciar] = useTransition()
  const lista = useRef<HTMLDivElement>(null)
  const noFim = useRef(!destaqueInicial)
  const entrada = useRef<EntradaDeArquivos>(null)

  // Quando o servidor manda a página de novo (router.refresh), a lista e as pessoas acompanham.
  // (Cada conversa — e cada mensagem aberta por link — é um componente novo: a página usa key.)
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
  const fioAberto = lado.tipo === 'fio' ? lado.fio.pai.id : null
  const fioRef = useRef(fioAberto)
  useEffect(() => { fioRef.current = fioAberto }, [fioAberto])

  // Diz ao aviso ao vivo qual conversa está aberta, e o número do menu acompanha o que falta ler.
  useEffect(() => { aoVivo?.abrir(atual.id); return () => aoVivo?.abrir(null) }, [atual.id, aoVivo])
  useEffect(() => {
    aoVivo?.definir(conversas.filter((c) => c.id !== atual.id).reduce((s, c) => s + (importa(c) ? (c.tipo === 'direta' || c.avisar === 'tudo' ? c.nao_lidas : c.mencoes) : 0), 0))
  }, [conversas, atual.id, aoVivo])

  // A mensagem aberta por link aparece no meio da tela e fica marcada por uns segundos.
  useEffect(() => {
    if (!destaqueInicial) return
    const el = document.querySelector(`[data-mensagem="${destaqueInicial}"]`)
    el?.scrollIntoView({ block: 'center' })
    const t = setTimeout(() => setDestaque(null), 4000)
    return () => clearTimeout(t)
  }, [destaqueInicial])

  // Mensagem que mudou (editada, apagada, reação, resposta nova): na lista e no fio.
  const mudar = useCallback((m: MensagemDoChat) => {
    if (!m.resposta_de) setMensagens((l) => substituir(l, m))
    setLado((l) => {
      if (l.tipo !== 'fio') return l
      if (l.fio.pai.id === m.id) return { ...l, fio: { ...l.fio, pai: { ...l.fio.pai, ...m } } }
      if (m.resposta_de === l.fio.pai.id) return { ...l, fio: { ...l.fio, respostas: substituir(l.fio.respostas, m) } }
      return l
    })
  }, [])
  // Respostas já contadas na principal (a mesma resposta chega pelo envio e pelo tempo real).
  const contadas = useRef(new Set<string>())
  const chegou = useCallback((m: MensagemDoChat) => {
    if (!m.resposta_de) { setMensagens((l) => juntar(l, m)); return }
    if (!contadas.current.has(m.id)) {
      contadas.current.add(m.id)
      // O número de respostas sobe na hora; o UPDATE da principal, pelo tempo real, confirma o valor do banco.
      setMensagens((l) => l.map((x) => x.id === m.resposta_de
        ? { ...x, respostas: x.respostas + 1, ultima_resposta_em: m.created_at, respondentes: x.respondentes.includes(m.autor_id ?? '') || !m.autor_id ? x.respondentes : [...x.respondentes, m.autor_id].slice(0, 10) }
        : x))
    }
    setLado((l) => (l.tipo === 'fio' && l.fio.pai.id === m.resposta_de ? { ...l, fio: { ...l.fio, respostas: juntar(l.fio.respostas, m) } } : l))
  }, [])

  // Ao vivo: mensagens novas e mudanças desta conversa; nas outras, só o contador.
  const lerDepois = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const supabase = clienteDoNavegador()
    const canal = supabase.channel(`chat-conversa-${atual.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_mensagens' }, (p: { new: Record<string, unknown> }) => {
        const m = p.new as unknown as MensagemDoChat
        if (m.canal_id === atual.id) {
          chegou(m)
          if (conversaAtual.membro && !m.resposta_de) {
            if (lerDepois.current) clearTimeout(lerDepois.current)
            lerDepois.current = setTimeout(() => { void marcarLido(atual.id) }, 1500)
          }
        } else if (m.autor_id !== eu) {
          const paraMim = (m.mencoes ?? []).includes(eu) || m.menciona_todos
          if (m.resposta_de && !paraMim) return
          setConversas((cs) => cs.map((c) => c.id === m.canal_id && c.membro
            ? { ...c, nao_lidas: c.nao_lidas + (m.resposta_de ? 0 : 1), mencoes: c.mencoes + (paraMim ? 1 : 0), ultima_mensagem_em: m.created_at }
            : c))
          if (!conversas.some((c) => c.id === m.canal_id)) router.refresh()
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_mensagens', filter: `canal_id=eq.${atual.id}` }, (p: { new: Record<string, unknown> }) => {
        mudar(p.new as unknown as MensagemDoChat)
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

  // O endereço acompanha o fio aberto (dá para recarregar ou mandar o link).
  const marcarEndereco = (fio: string | null) => {
    try {
      const url = new URL(window.location.href)
      if (fio) url.searchParams.set('fio', fio); else url.searchParams.delete('fio')
      window.history.replaceState(null, '', `${url.pathname}${url.search}`)
    } catch { /* sem history */ }
  }
  const abrirFio = (m: MensagemDoChat) => {
    setLado({ tipo: 'fio', fio: { pai: m, respostas: [], carregando: true } })
    marcarEndereco(m.id)
    void carregarFio(m.id).then((r) => {
      if (fioRef.current !== m.id) return
      if (r.erro || !r.pai) { setErro(r.erro ?? 'Não foi possível abrir o fio.'); setLado({ tipo: 'nada' }); return }
      setLado({ tipo: 'fio', fio: { pai: r.pai, respostas: r.respostas ?? [], carregando: false } })
    })
  }
  const fecharLado = () => { if (lado.tipo === 'fio') marcarEndereco(null); setLado({ tipo: 'nada' }) }
  const abrirBusca = (filtros: FiltrosDaBusca) => { if (lado.tipo === 'fio') marcarEndereco(null); setLado({ tipo: 'busca', filtros, vez: Date.now() }); setVerLista(false) }

  const canais = conversas.filter((c) => c.tipo === 'canal' && c.membro)
  const abertos = conversas.filter((c) => c.tipo === 'canal' && !c.membro)
  const diretas = conversas.filter((c) => c.tipo === 'direta')
  const naCoversa = membros.map((id) => pessoaDe.get(id)).filter(Boolean) as PessoaDoChat[]
  const podeEscrever = !conversaAtual.arquivado
  // No canal dá para mencionar quem ainda não está (e chamar depois); na direta, só quem está nela.
  const mencionaveis = (conversaAtual.tipo === 'canal' && redacao ? pessoas.filter((p) => p.ativo) : naCoversa).filter((p) => p.id !== eu)
  const ctx: Contexto = { eu, ehAdmin, pessoaDe, nomes: pessoas.map((p) => p.nome), podeEscrever, onErro: setErro, onMudar: mudar, onAbrirFio: abrirFio, destaque }
  const quemFicouDeFora = fora.map(nomeDe)

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[28rem] overflow-hidden rounded-xl border border-border bg-card" data-chat>
      {/* Lateral: canais e conversas diretas */}
      <aside className={`${verLista ? 'flex' : 'hidden'} w-full flex-col border-r border-border bg-muted/30 md:flex md:w-64 md:shrink-0`} aria-label="Conversas">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <p className="font-semibold">Chat</p>
          <div className="flex gap-1">
            <button type="button" onClick={() => abrirBusca(buscaVazia)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Buscar no chat" title="Buscar no chat"><Search className="size-4" /></button>
            {redacao && <button type="button" onClick={() => setPainel(painel === 'canal' ? 'nada' : 'canal')} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Novo canal" title="Novo canal"><Hash className="size-4" /></button>}
            <button type="button" onClick={() => setPainel(painel === 'direta' ? 'nada' : 'direta')} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Nova conversa" title="Nova conversa"><Plus className="size-4" /></button>
          </div>
        </div>
        <AlertasDoComputador />
        <nav className="flex-1 overflow-y-auto px-2 py-2 text-sm">
          <ul className="mb-3 flex flex-col gap-0.5">
            <li><button type="button" onClick={() => abrirBusca({ ...buscaVazia, soMencoes: true })} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"><AtSign className="size-3.5 opacity-70" />Menções a mim</button></li>
            <li><button type="button" onClick={() => abrirBusca({ ...buscaVazia, comArquivos: true, aqui: true })} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"><Paperclip className="size-3.5 opacity-70" />Arquivos desta conversa</button></li>
          </ul>
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
      <section className={`${verLista || lado.tipo !== 'nada' ? 'hidden' : 'flex'} relative min-w-0 flex-1 flex-col ${lado.tipo !== 'nada' ? 'lg:flex' : 'md:flex'}`} aria-label={titulo}
        onDragOver={(e) => { if (podeEscrever && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setArrastando(true) } }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setArrastando(false) }}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); if (podeEscrever) entrada.current?.adicionar([...e.dataTransfer.files]) }}>
        <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted md:hidden" onClick={() => setVerLista(true)} aria-label="Ver conversas"><ArrowLeft className="size-4" /></button>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate font-semibold" data-titulo-da-conversa>
              {conversaAtual.tipo === 'canal' && conversaAtual.privado && <Lock className="size-3.5 shrink-0 text-muted-foreground" />}{titulo}
              {conversaAtual.arquivado && <span className="ml-1 rounded bg-muted px-1.5 text-[11px] font-normal text-muted-foreground">arquivado</span>}
            </p>
            {conversaAtual.descricao && <p className="truncate text-xs text-muted-foreground">{conversaAtual.descricao}</p>}
          </div>
          <button type="button" onClick={() => abrirBusca({ ...buscaVazia, aqui: true })} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden" aria-label="Buscar"><Search className="size-4" /></button>
          <button type="button" onClick={() => setPainel(painel === 'membros' ? 'nada' : 'membros')} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Pessoas nesta conversa">
            <Users className="size-3.5" />{membros.length}
          </button>
          {conversaAtual.membro && <Avisos c={conversaAtual} onMudar={(v) => agir(() => mudarAvisos(atual.id, v), () => setConversas((cs) => cs.map((c) => (c.id === atual.id ? { ...c, avisar: v } : c))))} />}
        </header>

        {painel === 'canal' && <NovoCanal pessoas={pessoas.filter((p) => p.id !== eu && p.ativo)} onFechar={() => setPainel('nada')} />}
        {painel === 'direta' && <NovaDireta pessoas={pessoas.filter((p) => p.id !== eu && p.ativo)} onFechar={() => setPainel('nada')} />}
        {painel === 'membros' && (
          <Membros c={conversaAtual} pessoas={naCoversa} todas={pessoas} eu={eu} redacao={redacao} podeAdministrar={ehAdmin} ocupado={pendente}
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
          <Mensagens mensagens={mensagens} ctx={ctx} />
        </div>

        {erro && <p className="mx-3 mb-1 rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive" role="alert">{erro}</p>}
        {fora.length > 0 && (
          <div className="mx-3 mb-1 flex flex-wrap items-center gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm" role="status" data-fora-do-canal>
            <span className="flex-1">{quemFicouDeFora.join(', ')} {fora.length === 1 ? 'não está' : 'não estão'} em {titulo} e não {fora.length === 1 ? 'foi avisada' : 'foram avisadas'}.</span>
            <Button size="sm" disabled={pendente} onClick={() => { const ids = fora; setFora([]); agir(() => adicionarAoCanal(atual.id, ids), () => setMembros((m) => [...new Set([...m, ...ids])])) }}>Chamar para o canal</Button>
            <Button size="sm" variant="ghost" onClick={() => setFora([])}>Deixar</Button>
          </div>
        )}
        {!conversaAtual.membro && conversaAtual.tipo === 'canal' && (
          <div className="mx-3 mb-1 flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Você está vendo {titulo} sem participar.</span>
            <Button size="sm" disabled={pendente} onClick={() => agir(() => entrarNoCanal(atual.id))}>Entrar no canal</Button>
          </div>
        )}
        {conversaAtual.arquivado
          ? <p className="border-t border-border px-3 py-3 text-center text-sm text-muted-foreground">Canal arquivado: dá para ler, não para escrever.</p>
          : <Escrever ref={entrada} canalId={atual.id} tipo={conversaAtual.tipo} titulo={titulo} pessoas={mencionaveis} membros={membros}
              onEnviada={(m) => { noFim.current = true; chegou(m) }} onErro={setErro} onForaDaConversa={redacao && conversaAtual.tipo === 'canal' ? setFora : undefined} />}
        {arrastando && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5 text-sm font-medium text-primary">
            <Paperclip className="mr-2 size-4" />Solte para anexar à mensagem
          </div>
        )}
      </section>

      {lado.tipo === 'fio' && (
        <Fio fio={lado.fio} titulo={titulo} tipo={conversaAtual.tipo} ctx={ctx} pessoas={mencionaveis} membros={membros}
          onEnviada={chegou} onForaDaConversa={redacao && conversaAtual.tipo === 'canal' ? setFora : undefined} onFechar={fecharLado} />
      )}
      {lado.tipo === 'busca' && (
        <Busca key={lado.vez} inicial={lado.filtros} canalId={atual.id} tituloAqui={titulo} pessoas={pessoas} nomeDe={nomeDe} onFechar={fecharLado} />
      )}
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
      <select value={c.avisar} onChange={(e) => onMudar(e.target.value as 'tudo' | 'mencoes' | 'nada')} className="max-w-20 rounded border-0 bg-transparent py-1 text-xs outline-none hover:bg-muted sm:max-w-36" aria-label="Avisos desta conversa">
        {opcoes.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
      </select>
    </label>
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
