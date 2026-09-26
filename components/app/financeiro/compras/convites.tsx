'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Copy, Loader2, Mail, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cancelarConvite, linkDoConviteParaCopiar, pedirPropostas } from '@/app/actions/compras'
import {
  MAXIMO_POR_VEZ, PRAZO_MAXIMO_DIAS, SITUACOES, dataComDia, ehEmail, motivoDaSugestao, resumoDosConvites, situacaoDoConvite,
  type Convite, type Sugestao,
} from '@/lib/compras/convites'
import { dataCurta } from '@/lib/financeiro/regras'
import { cn } from '@/lib/utils'
import { campo, Rotulo } from './comum'

export type ConviteNaTela = Convite & { id: string; favorecido_id: string; fornecedor: string; email: string }

const TONS = {
  neutro: 'bg-muted text-muted-foreground',
  aviso: 'bg-warning/15 text-warning-foreground',
  ok: 'bg-success/15 text-success',
  erro: 'bg-destructive/10 text-destructive',
} as const
const quando = (iso: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Pedir propostas aos fornecedores: a lista já vem marcada com os habituais
 * (quem vende a categoria do pedido e quem já cotou compras dela); quem cota
 * confere, escolhe o prazo e envia. Cada fornecedor recebe um e-mail com um
 * link só dele e responde sem login; a proposta cai no mapa comparativo.
 */
export function PedirPropostas({ pedidoId, podeCotar, convites, sugestoes, categoria, caixas, prazoSugerido, prazoAtual, hoje, minimas }: {
  pedidoId: string
  podeCotar: boolean
  convites: ConviteNaTela[]
  sugestoes: Sugestao[]
  categoria: string | null
  caixas: { id: string; email: string }[]
  prazoSugerido: string
  prazoAtual: string | null
  hoje: string
  minimas: number
}) {
  const [aberto, setAberto] = useState(false)
  const resumo = resumoDosConvites(convites)
  const vencido = prazoAtual !== null && hoje > prazoAtual

  return (
    <section data-ajuda="compras.pedir-propostas" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5" aria-label="Pedir propostas" data-convites>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">Pedir propostas aos fornecedores</p>
          <p className="text-sm text-muted-foreground">
            {convites.length
              ? <>{resumo.texto}{prazoAtual && <> · prazo {vencido ? <span className="font-medium text-warning-foreground">acabou em {dataCurta(prazoAtual)}</span> : dataComDia(prazoAtual)}</>}</>
              : `Cada fornecedor recebe um e-mail com um link só dele, preenche os preços sem precisar de senha, e a proposta entra sozinha no mapa comparativo abaixo. Esta compra pede ${minimas === 1 ? '1 proposta' : `pelo menos ${minimas} propostas`}.`}
          </p>
        </div>
        {podeCotar && !aberto && (
          <Button size="sm" onClick={() => setAberto(true)}><Send className="size-4" />{convites.length ? 'Convidar mais fornecedores' : 'Pedir propostas'}</Button>
        )}
      </div>

      {aberto && (
        <Formulario pedidoId={pedidoId} sugestoes={sugestoes} categoria={categoria} caixas={caixas} prazoSugerido={prazoAtual && prazoAtual >= hoje ? prazoAtual : prazoSugerido}
          hoje={hoje} onFim={() => setAberto(false)} />
      )}

      {convites.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border" data-lista-convites>
          {convites.map((c) => <LinhaDoConvite key={c.id} pedidoId={pedidoId} c={c} podeCotar={podeCotar} />)}
        </ul>
      )}
    </section>
  )
}

function LinhaDoConvite({ pedidoId, c, podeCotar }: { pedidoId: string; c: ConviteNaTela; podeCotar: boolean }) {
  const router = useRouter()
  const [ocupado, iniciar] = useTransition()
  const [copiado, setCopiado] = useState(false)
  const [erro, setErro] = useState('')
  const s = situacaoDoConvite(c)
  const detalhe = s === 'respondeu' ? `em ${quando(c.respondido_em!)}`
    : s === 'recusou' ? (c.motivo_recusa ? `“${c.motivo_recusa}”` : '')
    : s === 'falhou' ? c.envio_erro ?? ''
    : s === 'viu' ? `em ${quando(c.visto_em!)}${c.lembrete_em ? ' · lembrete enviado' : ''}`
    : s === 'enviado' ? `em ${quando(c.enviado_em!)}${c.lembrete_em ? ' · lembrete enviado' : ''}`
    : s === 'link' ? 'copie o link e mande por WhatsApp ou e-mail' : ''
  const botao = 'inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50'
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm" data-convite={s}>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{c.fornecedor}</p>
        <p className="truncate text-xs text-muted-foreground">{c.email}</p>
      </div>
      <div className="flex flex-col items-end gap-0.5 text-right">
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', TONS[SITUACOES[s].tom])}>{SITUACOES[s].rotulo}</span>
        {detalhe && <span className="max-w-64 truncate text-xs text-muted-foreground" title={detalhe}>{detalhe}</span>}
      </div>
      {podeCotar && s !== 'cancelado' && (
        <div className="flex gap-1.5">
          <button type="button" className={botao} disabled={ocupado} onClick={() => iniciar(async () => {
            setErro('')
            const r = await linkDoConviteParaCopiar(pedidoId, c.id)
            if (r.erro || !r.link) { setErro(r.erro ?? 'Não foi possível copiar.'); return }
            try { await navigator.clipboard.writeText(r.link); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { window.prompt('Copie o link:', r.link) }
          })}>
            {copiado ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}{copiado ? 'Copiado' : 'Copiar link'}
          </button>
          {s !== 'respondeu' && (
            <button type="button" className={botao} disabled={ocupado} title="O link para de abrir" onClick={() => {
              if (!window.confirm(`Cancelar o convite de ${c.fornecedor}? O link dele para de abrir.`)) return
              iniciar(async () => { const r = await cancelarConvite(pedidoId, c.id); if (r.erro) setErro(r.erro); else router.refresh() })
            }}><X className="size-3.5" />Cancelar</button>
          )}
        </div>
      )}
      {erro && <p className="w-full text-xs text-destructive" role="alert">{erro}</p>}
    </li>
  )
}

function Formulario({ pedidoId, sugestoes, categoria, caixas, prazoSugerido, hoje, onFim }: {
  pedidoId: string; sugestoes: Sugestao[]; categoria: string | null; caixas: { id: string; email: string }[]; prazoSugerido: string; hoje: string; onFim: () => void
}) {
  const router = useRouter()
  const [marcados, setMarcados] = useState(() => new Set(sugestoes.filter((s) => s.marcado).map((s) => s.id)))
  const [emails, setEmails] = useState<Record<string, string>>(() => Object.fromEntries(sugestoes.map((s) => [s.id, s.email ?? ''])))
  const [prazo, setPrazo] = useState(prazoSugerido)
  // A caixa de Compras, se houver; senão a primeira que a pessoa pode usar.
  const [caixa, setCaixa] = useState(() => (caixas.find((c) => /compra/i.test(c.email)) ?? caixas[0])?.id ?? '')
  const [recado, setRecado] = useState('')
  const [busca, setBusca] = useState('')
  const [todos, setTodos] = useState(false)
  const [erro, setErro] = useState('')
  const [feito, setFeito] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()

  const habituais = sugestoes.filter((s) => s.vende || s.cotou > 0)
  const termo = busca.trim().toLowerCase()
  const visiveis = useMemo(() => {
    const base = termo ? sugestoes.filter((s) => s.nome.toLowerCase().includes(termo) || (s.email ?? '').toLowerCase().includes(termo))
      : todos || !habituais.length ? sugestoes : sugestoes.filter((s) => s.vende || s.cotou > 0 || marcados.has(s.id))
    return base.slice(0, 200)
  }, [sugestoes, termo, todos, habituais.length, marcados])
  const escolhidos = sugestoes.filter((s) => marcados.has(s.id))
  const semEmail = escolhidos.filter((s) => !ehEmail((emails[s.id] ?? '').trim()))

  const alternar = (id: string) => setMarcados((antes) => { const n = new Set(antes); if (n.has(id)) n.delete(id); else n.add(id); return n })

  if (feito) {
    return (
      <div className={cn('flex flex-col gap-3 rounded-lg border p-4 text-sm', feito.startsWith('Nenhum') ? 'border-warning/40 bg-warning/10' : 'border-success/30 bg-success/5')} role="status">
        <p className="whitespace-pre-line">{feito}</p>
        <div><Button size="sm" variant="outline" onClick={() => { setFeito(null); onFim(); router.refresh() }}>Fechar</Button></div>
      </div>
    )
  }

  if (!sugestoes.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        Nenhum fornecedor cadastrado nesta empresa. Cadastre em <Link href="/financeiro/cadastros?aba=favorecidos" className="text-primary underline">Financeiro → Cadastros → Favorecidos</Link>, com o e-mail e o que ele vende.
      </div>
    )
  }

  return (
    <form className="flex flex-col gap-4 rounded-lg border border-border bg-muted/30 p-4" onSubmit={(e) => {
      e.preventDefault()
      setErro('')
      iniciar(async () => {
        const r = await pedirPropostas(pedidoId, {
          prazo, caixaId: caixa || null, recado,
          convites: escolhidos.map((s) => ({ favorecido_id: s.id, email: (emails[s.id] ?? '').trim() })),
        })
        if (r.erro) { setErro(r.erro); return }
        const linhas = caixa
          ? [
              r.enviados ? `Pedido enviado para ${r.enviados} ${r.enviados === 1 ? 'fornecedor' : 'fornecedores'}. Você recebe um aviso no sino a cada resposta.` : 'Nenhum e-mail saiu, mas os links estão prontos: use “Copiar link” em cada fornecedor.',
              ...(r.falhas?.length ? ['Não saiu para:', ...r.falhas.map((f) => `• ${f}`)] : []),
            ]
          : [`${r.semEnvio} ${r.semEnvio === 1 ? 'link pronto' : 'links prontos'}. Use “Copiar link” em cada fornecedor e mande por WhatsApp ou e-mail.`]
        setFeito(linhas.join('\n'))
      })
    }}>
      {!categoria && <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning-foreground">Este pedido ainda não tem categoria. Classifique (em “Alterar”) para o sistema sugerir quem vende o que se está comprando.</p>}
      {categoria && !habituais.length && <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Nenhum fornecedor marcado como vendedor de {categoria} ainda, e ninguém cotou compras dessa categoria. Marque abaixo; para a próxima vez, diga no cadastro do fornecedor o que ele vende.</p>}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">Fornecedores <span className="font-normal text-muted-foreground">— {escolhidos.length} {escolhidos.length === 1 ? 'marcado' : 'marcados'}</span></p>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar outro fornecedor" aria-label="Buscar fornecedor" className={cn(campo, 'ml-auto h-8 max-w-56 py-1')} />
        </div>
        <ul className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border bg-background">
          {visiveis.map((s) => {
            const marcado = marcados.has(s.id)
            const motivo = motivoDaSugestao(s, categoria)
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <label className="flex min-w-0 flex-1 items-start gap-2">
                  <input type="checkbox" checked={marcado} onChange={() => alternar(s.id)} className="mt-1" />
                  <span className="min-w-0">
                    <span className="font-medium">{s.nome}</span>
                    {(motivo || s.convidado) && <span className="block text-xs text-muted-foreground">{[motivo, s.convidado && 'já convidado (reenvia)'].filter(Boolean).join(' · ')}</span>}
                  </span>
                </label>
                {marcado && (
                  <input type="email" value={emails[s.id] ?? ''} onChange={(e) => setEmails((x) => ({ ...x, [s.id]: e.target.value }))} placeholder="e-mail do fornecedor"
                    aria-label={`E-mail de ${s.nome}`} className={cn(campo, 'h-8 w-full py-1 sm:w-64', !ehEmail((emails[s.id] ?? '').trim()) && 'border-destructive')} />
                )}
              </li>
            )
          })}
          {!visiveis.length && <li className="px-3 py-4 text-center text-sm text-muted-foreground">Ninguém com esse nome.</li>}
        </ul>
        {!termo && habituais.length > 0 && habituais.length < sugestoes.length && (
          <button type="button" className="self-start text-xs text-primary underline" onClick={() => setTodos((t) => !t)}>
            {todos ? 'Mostrar só os habituais' : `Mostrar todos os ${sugestoes.length} fornecedores`}
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Rotulo texto="Prazo para as propostas" ajuda={prazo ? `Até ${dataComDia(prazo)}. Na véspera, quem não respondeu recebe um lembrete.` : undefined}>
          <input type="date" required value={prazo} min={hoje} max={somarDias(hoje, PRAZO_MAXIMO_DIAS)} onChange={(e) => setPrazo(e.target.value)} className={campo} />
        </Rotulo>
        <Rotulo texto="Enviar pelo e-mail" ajuda={caixa ? 'As respostas por e-mail chegam nesta caixa, em “E-mail do setor”.' : 'Nada é enviado: os links ficam prontos para você copiar.'}>
          <select value={caixa} onChange={(e) => setCaixa(e.target.value)} className={campo}>
            {caixas.map((c) => <option key={c.id} value={c.id}>{c.email}</option>)}
            <option value="">Não enviar e-mail (só gerar os links)</option>
          </select>
        </Rotulo>
        <Rotulo texto="Recado (opcional)" className="sm:col-span-2" ajuda="Vai no e-mail, antes da lista de itens. Os itens, as quantidades, o local de entrega e o prazo já vão sozinhos.">
          <textarea value={recado} onChange={(e) => setRecado(e.target.value)} maxLength={1000} rows={2} placeholder="Ex.: entrega só em horário comercial; precisamos de nota fiscal em nome da filial." className={campo} />
        </Rotulo>
      </div>

      {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {semEmail.length > 0 && <p className="mr-auto text-xs text-destructive">Falta o e-mail de {semEmail.map((s) => s.nome).join(', ')}.</p>}
        {escolhidos.length > MAXIMO_POR_VEZ && <p className="mr-auto text-xs text-destructive">No máximo {MAXIMO_POR_VEZ} por vez.</p>}
        <Button type="button" variant="ghost" size="sm" onClick={onFim}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={ocupado || !escolhidos.length || semEmail.length > 0 || escolhidos.length > MAXIMO_POR_VEZ || !prazo}>
          {ocupado ? <Loader2 className="size-4 animate-spin" /> : caixa ? <Mail className="size-4" /> : <Copy className="size-4" />}
          {caixa ? `Enviar para ${escolhidos.length} ${escolhidos.length === 1 ? 'fornecedor' : 'fornecedores'}` : `Gerar ${escolhidos.length} ${escolhidos.length === 1 ? 'link' : 'links'}`}
        </Button>
      </div>
    </form>
  )
}
