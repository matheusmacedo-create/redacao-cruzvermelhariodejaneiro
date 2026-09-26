'use client'

import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, CircleCheck, LoaderCircle, MessageCircle, MessageCirclePlus, MessageCircleReply, Reply, Send, Sparkles, XCircle, type LucideIcon } from 'lucide-react'
import { abrirConversa, responderConversa } from '@/app/actions/membro'
import { CATEGORIAS_DA_CONVERSA, type CategoriaDaConversa } from '@/lib/canal/regras'
import type { ChaveDaSituacao } from '@/lib/membro/canal'
import { cn } from '@/lib/utils'
import { areaDoMembro, barraFixa, botaoDoMembro, botaoFantasma, campoDoMembro } from './marca'
import { CabecalhoDaPagina, EstadoVazio, Recado, Selo, type TomDoSelo } from './pecas'

/*
 * Os formulários daqui enviam por `onSubmit` + `startTransition`, e não por
 * `<form action>`: com `action`, o React 19 zera o formulário depois de toda
 * ação — inclusive quando o servidor devolve erro, e a pessoa perdia o texto
 * que tinha escrito. Assim, o texto só sai no sucesso.
 */

/** Verbo parado e verbo em andamento no mesmo lugar: o botão não muda de largura ao enviar. */
function RotuloDeEnvio({ ocupado, icone: Icone, rotulo, andamento }: { ocupado: boolean; icone: LucideIcon; rotulo: string; andamento: string }) {
  const camada = 'col-start-1 row-start-1 inline-flex items-center justify-center gap-2'
  return (
    <span className="inline-grid">
      <span className={cn(camada, ocupado && 'invisible')}><Icone className="size-4 shrink-0" aria-hidden="true" />{rotulo}</span>
      <span className={cn(camada, !ocupado && 'invisible')}><LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />{andamento}</span>
    </span>
  )
}

/**
 * O topo de Mensagens, a nova mensagem e a lista (que vem pronta do servidor
 * em `children`). `categoria` vem do `?nova=`: com ela, o formulário já abre
 * com a categoria certa (o "Pedir correção" do Perfil manda `documentos`).
 * Sem conversas, o botão fica só no estado vazio: um botão principal por tela.
 */
export function CaixaDeMensagens({ categoria, vazia, children }: { categoria: CategoriaDaConversa | null; vazia: boolean; children?: React.ReactNode }) {
  const [aberta, setAberta] = useState(categoria !== null)
  // Foco no assunto só quando a pessoa abriu agora; vindo pelo link, o foco fica no topo da página.
  const [focar, setFocar] = useState(false)
  const botao = useRef<HTMLButtonElement>(null)
  const devolverFoco = useRef(false)

  useEffect(() => {
    if (aberta || !devolverFoco.current) return
    devolverFoco.current = false
    botao.current?.focus()
  }, [aberta])

  function fechar() {
    devolverFoco.current = true
    setAberta(false)
    // Tira o ?nova= do endereço, para recarregar a página não reabrir o formulário.
    if (new URLSearchParams(window.location.search).has('nova')) window.history.replaceState(null, '', window.location.pathname)
  }

  const nova = (
    <button ref={botao} type="button" onClick={() => { setFocar(true); setAberta(true) }} className={botaoDoMembro} data-ajuda="membro.nova-mensagem">
      <MessageCirclePlus className="size-4" aria-hidden="true" />Nova mensagem
    </button>
  )
  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaPagina titulo="Mensagens" descricao="Fale direto com a coordenação do Voluntariado. A resposta chega aqui e no seu e-mail."
        acao={!aberta && !vazia ? nova : undefined} />
      {aberta ? <NovaConversa categoria={categoria ?? 'duvida'} focar={focar} aoCancelar={fechar} /> : vazia && (
        <EstadoVazio icone={MessageCircle} titulo="Nenhuma conversa ainda."
          texto="Dúvidas sobre ações, disponibilidade, certificados ou uma sugestão: é só escrever." acao={nova} />
      )}
      {!vazia && children}
    </div>
  )
}

function NovaConversa({ categoria, focar, aoCancelar }: { categoria: CategoriaDaConversa; focar: boolean; aoCancelar: () => void }) {
  // No sucesso a ação redireciona para a conversa criada; aqui só volta erro.
  const [estado, enviar, enviando] = useActionState(abrirConversa, {})
  return (
    <form id="nova-conversa" aria-labelledby="nova-conversa-titulo" data-ajuda="membro.nova-mensagem" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault()
        // O Enviar fica em `aria-disabled`, e não `disabled`, para não perder o foco: a guarda barra o envio repetido.
        if (enviando) return
        const dados = new FormData(e.currentTarget)
        startTransition(() => enviar(dados))
      }}>
      <h2 id="nova-conversa-titulo" className="text-base font-semibold">Nova mensagem</h2>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="nova-assunto" className="text-sm font-medium">Assunto</label>
          <input id="nova-assunto" name="assunto" required minLength={3} maxLength={160} autoComplete="off" autoFocus={focar} className={campoDoMembro} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="nova-categoria" className="text-sm font-medium">Sobre</label>
          <select id="nova-categoria" name="categoria" defaultValue={categoria} className={campoDoMembro}>
            {Object.entries(CATEGORIAS_DA_CONVERSA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="nova-texto" className="text-sm font-medium">Mensagem</label>
        <textarea id="nova-texto" name="texto" required rows={5} maxLength={4000} className={areaDoMembro} />
      </div>
      {estado.erro && <Recado tipo="erro">{estado.erro}</Recado>}
      {/* No celular, os dois botões ocupam a largura, com Enviar em cima, perto do polegar. */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={aoCancelar} disabled={enviando} className={botaoFantasma}>Cancelar</button>
        <button type="submit" aria-disabled={enviando || undefined} className={cn(botaoDoMembro, 'aria-disabled:opacity-60')}>
          <RotuloDeEnvio ocupado={enviando} icone={Send} rotulo="Enviar" andamento="Enviando…" />
        </button>
      </div>
    </form>
  )
}

const SELOS_DA_SITUACAO: Record<ChaveDaSituacao, { tom: TomDoSelo; icone: LucideIcon }> = {
  nova: { tom: 'destaque', icone: MessageCircleReply },
  aberta: { tom: 'neutro', icone: Clock },
  respondida: { tom: 'neutro', icone: Reply },
  encerrada: { tom: 'neutro', icone: CircleCheck },
}

/** O selo de situação da conversa: sempre ícone e texto (o texto vem de `situacaoDaConversa`). */
export function SeloDaConversa({ chave, texto }: { chave: ChaveDaSituacao; texto: string }) {
  const { tom, icone } = SELOS_DA_SITUACAO[chave]
  return <Selo tom={tom} icone={icone}>{texto}</Selo>
}

/**
 * A lista de mensagens (os itens vêm prontos do servidor). Ao abrir e a cada
 * mensagem nova, rola até a última: a conversa longa abria no topo, longe da
 * resposta que a pessoa veio ler. Se a última for mais alta que a tela, para
 * no começo dela, para dar para ler do início.
 */
export function ListaDaConversa({ total, children }: { total: number; children: React.ReactNode }) {
  const lista = useRef<HTMLOListElement>(null)
  const primeira = useRef(true)
  useEffect(() => {
    const ultima = lista.current?.lastElementChild
    if (!(ultima instanceof HTMLElement)) return
    // Ao abrir, pula direto; depois de enviar, desliza — se a pessoa não pediu menos movimento.
    const suave = !primeira.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    primeira.current = false
    const fundo = document.documentElement.scrollHeight - window.innerHeight
    // `window.scrollTo` ignora o `scroll-padding` do <html> (que no computador
    // desconta o cabeçalho que gruda no alto): soma-se aqui à margem do item.
    const margem = (parseFloat(getComputedStyle(ultima).scrollMarginTop) || 0)
      + (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0)
    const inicioDaUltima = ultima.getBoundingClientRect().top + window.scrollY - margem
    window.scrollTo({ top: Math.max(0, Math.min(fundo, inicioDaUltima)), behavior: suave ? 'smooth' : 'instant' })
  }, [total])
  return <ol ref={lista} id="mensagens" aria-label="Mensagens da conversa" className="flex flex-col gap-4" data-ajuda="membro.mensagens-da-conversa">{children}</ol>
}

/** Altura do campo acompanhando o texto, até um teto (daí em diante, rola por dentro). */
function ajustarAltura(campo: HTMLTextAreaElement) {
  campo.style.height = 'auto'
  // `scrollHeight` não inclui a borda (1px em cima e embaixo) e o `box-sizing` é `border-box`.
  campo.style.height = `${campo.scrollHeight + 2}px`
}

/**
 * A caixa de resposta, grudada embaixo (acima da barra de navegação do
 * celular). O campo cresce com o texto; Ctrl/⌘+Enter também envia. Se o
 * servidor devolver erro, o texto fica onde estava.
 */
export function Responder({ conversaId, encerrada }: { conversaId: string; encerrada: boolean }) {
  const [estado, enviar, enviando] = useActionState(responderConversa.bind(null, conversaId), {})
  const campo = useRef<HTMLTextAreaElement>(null)
  // Só no sucesso (`ok` muda a cada envio): limpa o campo e devolve a altura de uma linha.
  useEffect(() => {
    if (!estado.ok || !campo.current) return
    campo.current.value = ''
    campo.current.style.height = ''
  }, [estado.ok])
  const descricao = [encerrada && 'resposta-encerrada', estado.erro && 'resposta-erro'].filter(Boolean).join(' ') || undefined
  return (
    <form id="responder" className={cn(barraFixa, 'flex flex-col gap-2')} data-ajuda="membro.responder"
      onSubmit={(e) => {
        e.preventDefault()
        // Botão em `aria-disabled` (o foco fica nele) e Ctrl+Enter (`requestSubmit` ignora o `disabled`): a guarda barra o envio repetido.
        if (enviando) return
        const dados = new FormData(e.currentTarget)
        startTransition(() => enviar(dados))
      }}>
      {encerrada && <p id="resposta-encerrada" className="text-xs text-muted-foreground">A coordenação encerrou esta conversa. Se você escrever, ela é reaberta.</p>}
      <div className="flex items-end gap-2">
        <label htmlFor="resposta" className="sr-only">Sua resposta</label>
        <textarea ref={campo} id="resposta" name="texto" required rows={1} maxLength={4000} placeholder="Escreva sua resposta"
          aria-describedby={descricao} className={cn(areaDoMembro, 'max-h-40 min-h-11 resize-none overflow-y-auto')}
          onInput={(e) => ajustarAltura(e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }} />
        <button type="submit" aria-disabled={enviando || undefined} aria-label={enviando ? 'Enviando resposta' : 'Enviar resposta'} className={cn(botaoDoMembro, 'size-11 shrink-0 px-0 aria-disabled:opacity-60')}>
          {enviando ? <LoaderCircle className="size-5 motion-safe:animate-spin" aria-hidden="true" /> : <Send className="size-5" aria-hidden="true" />}
        </button>
      </div>
      {estado.erro && (
        <p id="resposta-erro" role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
          <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{estado.erro}
        </p>
      )}
      {/* A resposta aparece na lista; quem usa leitor de tela fica sabendo por aqui. */}
      <p role="status" className="sr-only">{estado.ok && !enviando ? 'Resposta enviada.' : ''}</p>
    </form>
  )
}

/**
 * O layout conta as novidades (o número na aba Mensagens e nas sub-abas) na
 * mesma requisição em que a página marca a conversa ou os avisos como lidos
 * — às vezes antes dela —, e não é refeito ao navegar entre páginas: o
 * número ficava lá até a próxima carga completa. Montado só quando a página
 * acabou de marcar algo, pede ao servidor a versão nova uma vez.
 */
export function AtualizarNovidades() {
  const router = useRouter()
  useEffect(() => { router.refresh() }, [router])
  return null
}

/**
 * "Novo" que sobrevive ao `router.refresh()` acima: a página marca os avisos
 * como vistos ao abrir, e a versão atualizada já viria sem nenhum novo. O
 * selo guarda o que era novo quando a pessoa chegou.
 */
export function SeloDeNovo({ novo }: { novo: boolean }) {
  const [eraNovo] = useState(novo)
  return eraNovo ? <Selo tom="destaque" icone={Sparkles}>Novo</Selo> : null
}
