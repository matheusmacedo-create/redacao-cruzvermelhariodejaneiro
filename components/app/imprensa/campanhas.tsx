'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, ChevronDown, CircleX, FilePen, Loader2, MailCheck, MailOpen, Plus, Reply, Save, Search, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  cancelarAgendamento, destinatariosDaCampanha, enviarCampanha, enviarTesteDaCampanha, excluirRascunho,
  naoAbriramDaCampanha, salvarRascunho,
  type ContatoDeImprensa, type DestinatarioDaCampanha,
} from '@/app/actions/imprensa'
import {
  agendamentoParaLer, alertaDeEntrega, minimoDoAgendamento, TETO_DE_DESTINATARIOS, taxas, type NumerosDeCampanhas,
} from '@/lib/imprensa/campanha'
import { Dialog, inputClass, selectClass, noSegmento, podeReceber, quandoLegivel, SEGMENTOS, type Segmento } from './comum'

export type CampanhaNaTela = {
  id: string
  assunto: string
  corpo: string
  linkUrl: string
  linkRotulo: string
  estado: string
  destinatarios: number
  enviados: number
  falhas: number
  aberturas: number
  aberturasTotais: number
  cliques: number
  cliquesTotais: number
  descadastros: number
  /** Devolvidas em definitivo e denúncias de spam, avisadas pelo provedor. */
  devolucoes: number
  denuncias: number
  /** Quando sai, se está agendada. */
  agendadaPara: string | null
  /** Quantas mensagens já saíram, enquanto a campanha está em envio. */
  jaSairam: number | null
  criadaEm: string
  enviadaEm: string | null
  quem: string
}

/** O que abre o diálogo de campanha: seleção da tabela, rascunho ou follow-up. */
export type Composicao = {
  ids?: string[]
  rascunho?: CampanhaNaTela
  base?: { assunto: string; corpo: string; linkUrl: string; linkRotulo: string }
  origem?: string
}

const PERIODOS = [
  { id: '7', rotulo: 'Últimos 7 dias', dias: 7 },
  { id: '30', rotulo: 'Últimos 30 dias', dias: 30 },
  { id: '90', rotulo: 'Últimos 90 dias', dias: 90 },
  { id: '365', rotulo: 'Últimos 12 meses', dias: 365 },
  { id: 'tudo', rotulo: 'Todo o período', dias: 0 },
]

const ABAS = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'rascunho', rotulo: 'Rascunhos' },
  { id: 'enviada', rotulo: 'Enviadas' },
  { id: 'falha', rotulo: 'Com falha' },
] as const

const ESTADO: Record<string, { rotulo: string; classe: string }> = {
  rascunho: { rotulo: 'Rascunho', classe: 'bg-secondary text-secondary-foreground' },
  agendada: { rotulo: 'Agendada', classe: 'bg-violet-500/15 text-violet-700' },
  enviando: { rotulo: 'Enviando', classe: 'bg-sky-500/15 text-sky-700' },
  enviada: { rotulo: 'Enviada', classe: 'bg-emerald-500/15 text-emerald-700' },
  parcial: { rotulo: 'Parcial', classe: 'bg-amber-500/15 text-amber-700' },
  falhou: { rotulo: 'Falhou', classe: 'bg-destructive/10 text-destructive' },
}

const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' })
const numero = new Intl.NumberFormat('pt-BR')
const porcento = (v: number) => `${numero.format(v)}%`
const taxaDe = (parte: number, todo: number) => (todo ? Math.round((parte / todo) * 100) : 0)

/** Por quanto tempo a tela acompanha sozinha uma campanha em envio. Passado
 * disso ela travou (ou é das antigas, de antes da fila) e atualizar de cinco
 * em cinco segundos para sempre não ajudaria ninguém. */
const ACOMPANHAR_POR_MS = 30 * 60_000

/**
 * As campanhas, em formato de painel: as métricas do período no topo e a
 * lista de envios embaixo, com rascunhos e follow-up. Tudo visível a toda a
 * equipe — é o registro do que saiu, não de quem disparou.
 */
export function PainelDeCampanhas({ campanhas, envioNoMes, podeDisparar, envioDisponivel, abrirCampanha }: {
  campanhas: CampanhaNaTela[]
  envioNoMes: { enviados: number; limite: number | null }
  podeDisparar: boolean
  envioDisponivel: boolean
  abrirCampanha: (c: Composicao) => void
}) {
  const [periodo, setPeriodo] = useState('30')
  const [aba, setAba] = useState<(typeof ABAS)[number]['id']>('todas')
  const [busca, setBusca] = useState('')
  const [quem, setQuem] = useState('todos')
  const [agora] = useState(() => Date.now())
  const router = useRouter()

  // O que ainda vai sair: em envio primeiro, depois as agendadas, pela hora.
  const naFila = useMemo(() => campanhas
    .filter((c) => c.estado === 'agendada' || (c.estado === 'enviando' && c.enviadaEm && agora - new Date(c.enviadaEm).getTime() < ACOMPANHAR_POR_MS))
    .sort((a, b) => (a.estado === b.estado
      ? new Date(a.agendadaPara ?? a.criadaEm).getTime() - new Date(b.agendadaPara ?? b.criadaEm).getTime()
      : a.estado === 'enviando' ? -1 : 1)), [campanhas, agora])
  const emEnvio = naFila.some((c) => c.estado === 'enviando')
  useEffect(() => {
    if (!emEnvio) return
    const relogio = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(relogio)
  }, [emEnvio, router])

  const noPeriodo = useMemo(() => {
    const dias = PERIODOS.find((p) => p.id === periodo)?.dias ?? 0
    const corte = dias ? agora - dias * 86_400_000 : 0
    return campanhas.filter((c) => c.estado !== 'rascunho' && c.enviadaEm && new Date(c.enviadaEm).getTime() >= corte)
  }, [campanhas, periodo, agora])

  const numeros: NumerosDeCampanhas = useMemo(() => noPeriodo.reduce((n, c) => ({
    enviados: n.enviados + c.enviados,
    aberturasUnicas: n.aberturasUnicas + c.aberturas,
    aberturasTotais: n.aberturasTotais + c.aberturasTotais,
    cliquesUnicos: n.cliquesUnicos + c.cliques,
    cliquesTotais: n.cliquesTotais + c.cliquesTotais,
    descadastros: n.descadastros + c.descadastros,
    falhas: n.falhas + c.falhas,
    devolucoes: n.devolucoes + c.devolucoes,
    denuncias: n.denuncias + c.denuncias,
  }), { enviados: 0, aberturasUnicas: 0, aberturasTotais: 0, cliquesUnicos: 0, cliquesTotais: 0, descadastros: 0, falhas: 0, devolucoes: 0, denuncias: 0 }), [noPeriodo])
  const t = taxas(numeros)
  const alerta = alertaDeEntrega(numeros)

  const remetentes = useMemo(() => [...new Set(campanhas.map((c) => c.quem))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [campanhas])
  const contagem = useMemo(() => ({
    todas: campanhas.length,
    rascunho: campanhas.filter((c) => c.estado === 'rascunho').length,
    enviada: campanhas.filter((c) => c.estado === 'enviada').length,
    falha: campanhas.filter((c) => c.estado === 'parcial' || c.estado === 'falhou').length,
  }), [campanhas])

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return campanhas.filter((c) => {
      if (aba === 'rascunho' && c.estado !== 'rascunho') return false
      if (aba === 'enviada' && c.estado !== 'enviada') return false
      if (aba === 'falha' && c.estado !== 'parcial' && c.estado !== 'falhou') return false
      if (quem !== 'todos' && c.quem !== quem) return false
      return !termo || c.assunto.toLowerCase().includes(termo)
    })
  }, [campanhas, aba, busca, quem])

  const rotuloDoPeriodo = PERIODOS.find((p) => p.id === periodo)?.rotulo ?? ''

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className={selectClass} aria-label="Período das métricas">
          {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
        </select>
        <span className="flex-1" />
        {podeDisparar && (
          <Button onClick={() => abrirCampanha({})}><Plus className="size-4" />Nova campanha</Button>
        )}
      </div>

      {naFila.length > 0 && (
        <Card className="p-4" data-ajuda="imprensa.fila">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Na fila de envio</p>
          <ul className="mt-1 divide-y divide-border">
            {naFila.map((c) => <ItemDaFila key={c.id} campanha={c} podeDisparar={podeDisparar} />)}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-5 lg:divide-x">
          <Metrica titulo="Taxa de abertura" valor={t.abertura} dica="Quem abriu, sobre quem recebeu. Estimativa: alguns programas abrem sozinhos, outros bloqueiam imagens." linhas={[
            ['Aberturas únicas', numero.format(numeros.aberturasUnicas)],
            ['Aberturas totais', numero.format(numeros.aberturasTotais)],
            ['Média por quem abriu', numero.format(t.mediaDeAberturas)],
          ]} />
          <Metrica titulo="Taxa de cliques" valor={t.cliques} dica="Quem clicou no link, sobre quem recebeu." linhas={[
            ['Cliques únicos', numero.format(numeros.cliquesUnicos)],
            ['Cliques totais', numero.format(numeros.cliquesTotais)],
          ]} />
          <Metrica titulo="Cliques / aberturas" valor={t.cliquesSobreAberturas} dica="Dos que abriram, quantos clicaram. Mede o texto, não a lista." linhas={[]} />
          <Metrica titulo="Descadastros" valor={t.descadastro} dica="Quem saiu da lista a partir de uma campanha do período." linhas={[
            ['Saíram', numero.format(numeros.descadastros)],
          ]} />
          <Metrica titulo="Falhas no envio" valor={t.falha} dica="Mensagens que o provedor recusou na hora do envio. Devolvidas: saíram, e o servidor de quem recebe recusou em definitivo. Denúncias: quem marcou como spam (o Gmail não avisa, então o número real é maior)." linhas={[
            ['Não saíram', numero.format(numeros.falhas)],
            ['Enviadas', numero.format(numeros.enviados)],
            ['Devolvidas', numero.format(numeros.devolucoes)],
            ['Denúncias de spam', numero.format(numeros.denuncias)],
          ]} />
        </div>
        {alerta && (
          <p className="border-t border-border bg-amber-500/10 px-5 py-2.5 text-sm text-amber-800">{alerta}</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
          <span>Métricas de engajamento · {rotuloDoPeriodo} · {noPeriodo.length} campanha(s)</span>
          <span>
            Enviados este mês: <strong className="tabular-nums text-foreground">{numero.format(envioNoMes.enviados)}{envioNoMes.limite ? ` / ${numero.format(envioNoMes.limite)}` : ''}</strong>
          </span>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <div className="flex overflow-hidden rounded-lg border border-border" role="tablist">
            {ABAS.map((a) => (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={aba === a.id}
                onClick={() => setAba(a.id)}
                className={`border-r border-border px-3 py-1.5 text-sm last:border-r-0 ${aba === a.id ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {a.rotulo} <span className="tabular-nums text-xs">({contagem[a.id]})</span>
              </button>
            ))}
          </div>
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pelo assunto" className={`pl-9 ${inputClass}`} />
          </div>
          <select value={quem} onChange={(e) => setQuem(e.target.value)} className={selectClass} aria-label="Enviada por">
            <option value="todos">Enviada por: todos</option>
            {remetentes.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {!campanhas.length ? (
          <div className="p-10 text-center">
            <MailOpen className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-medium">Nenhuma campanha ainda</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Use <strong>Nova campanha</strong> e escolha uma lista e um segmento, ou marque contatos na aba Contatos. Tudo o que sair aparece aqui, para toda a equipe.
            </p>
          </div>
        ) : !lista.length ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Nenhuma campanha neste filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5">Campanha</th>
                  <th className="px-3 py-2.5">Situação</th>
                  <th className="px-3 py-2.5">Enviada</th>
                  <th className="px-3 py-2.5 text-right">Destinatários</th>
                  <th className="px-3 py-2.5 text-right">Abertura</th>
                  <th className="px-3 py-2.5 text-right">Cliques</th>
                  <th className="px-3 py-2.5 text-right">Saíram</th>
                  <th className="px-3 py-2.5">Follow-up</th>
                  <th className="px-3 py-2.5">Criada</th>
                  <th className="w-10 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <LinhaDaCampanha key={c.id} campanha={c} podeDisparar={podeDisparar} envioDisponivel={envioDisponivel} abrirCampanha={abrirCampanha} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

/**
 * Uma campanha que ainda vai sair: em envio (com o andamento) ou agendada
 * (com a hora e o botão de cancelar). Em coluna no celular, sem tabela.
 */
function ItemDaFila({ campanha: c, podeDisparar }: { campanha: CampanhaNaTela; podeDisparar: boolean }) {
  const router = useRouter()
  const [erro, setErro] = useState('')
  const [ocupado, rodar] = useTransition()
  const agendada = c.estado === 'agendada'

  function cancelar() {
    if (!confirm(`Cancelar o agendamento de "${c.assunto}"? A campanha volta para os rascunhos e nada é enviado.`)) return
    setErro('')
    rodar(async () => {
      const form = new FormData()
      form.set('id', c.id)
      const r = await cancelarAgendamento(form)
      if (r.erro) { setErro(r.erro); return }
      router.refresh()
    })
  }

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-medium">{c.assunto || '(sem assunto)'}</p>
        {agendada ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClock className="size-4 shrink-0" />
            <span>Sai em {c.agendadaPara ? quandoLegivel.format(new Date(c.agendadaPara)) : '—'} · {numero.format(c.destinatarios)} contato(s) · {c.quem}</span>
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="size-4 shrink-0 animate-spin" />
            <span>Enviando: {numero.format(c.jaSairam ?? 0)} de {numero.format(c.destinatarios)}</span>
          </p>
        )}
        {erro && <p className="mt-1 text-sm text-destructive">{erro}</p>}
      </div>
      {agendada && podeDisparar && (
        <Button variant="outline" onClick={cancelar} disabled={ocupado} className="min-h-11 shrink-0 sm:min-h-0">
          {ocupado ? <Loader2 className="size-4 animate-spin" /> : <CircleX className="size-4" />}Cancelar agendamento
        </Button>
      )}
    </li>
  )
}

/** Um valor-manchete: o número escrito é a informação; o anel só reforça. */
function Metrica({ titulo, valor, dica, linhas }: { titulo: string; valor: number; dica: string; linhas: [string, string][] }) {
  const r = 11
  const volta = 2 * Math.PI * r
  const preenchido = Math.min(Math.max(valor, 0), 100) / 100
  return (
    <div className="p-5">
      <p className="text-sm text-muted-foreground" title={dica}>{titulo}</p>
      <div className="mt-2 flex items-center gap-2.5">
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" className="shrink-0 -rotate-90">
          <circle cx="14" cy="14" r={r} fill="none" stroke="var(--border)" strokeWidth="3" />
          {preenchido > 0 && (
            <circle cx="14" cy="14" r={r} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${preenchido * volta} ${volta}`} />
          )}
        </svg>
        <span className="text-2xl font-semibold tabular-nums">{porcento(valor)}</span>
      </div>
      {linhas.length > 0 && (
        <dl className="mt-3 space-y-1 text-xs">
          {linhas.map(([rotulo, v]) => (
            <div key={rotulo} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{rotulo}</dt>
              <dd className="tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

function LinhaDaCampanha({ campanha: c, podeDisparar, envioDisponivel, abrirCampanha }: {
  campanha: CampanhaNaTela
  podeDisparar: boolean
  envioDisponivel: boolean
  abrirCampanha: (c: Composicao) => void
}) {
  const router = useRouter()
  const [aberta, setAberta] = useState(false)
  const [destinatarios, setDestinatarios] = useState<DestinatarioDaCampanha[] | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, rodar] = useTransition()
  const rascunho = c.estado === 'rascunho'
  const agendada = c.estado === 'agendada'
  const enviando = c.estado === 'enviando'
  // Sem envio ainda, não há o que medir.
  const semNumeros = rascunho || agendada
  const estado = ESTADO[c.estado] ?? ESTADO.enviando

  function alternar() {
    if (rascunho) { abrirCampanha({ rascunho: c }); return }
    const abrir = !aberta
    setAberta(abrir)
    if (abrir && !destinatarios) {
      rodar(async () => {
        const form = new FormData()
        form.set('id', c.id)
        const r = await destinatariosDaCampanha(form)
        if (r.erro) { setErro(r.erro); return }
        setDestinatarios(r.destinatarios ?? [])
      })
    }
  }

  function followUp() {
    setErro('')
    rodar(async () => {
      const form = new FormData()
      form.set('id', c.id)
      const r = await naoAbriramDaCampanha(form)
      if (r.erro) { setErro(r.erro); return }
      if (!r.ids?.length) { setErro('Todo mundo que recebeu já abriu — não há para quem fazer follow-up.'); return }
      abrirCampanha({
        ids: r.ids,
        base: { assunto: c.assunto, corpo: c.corpo, linkUrl: c.linkUrl, linkRotulo: c.linkRotulo },
        origem: `Follow-up de "${c.assunto}": ${r.ids.length} contato(s) que não abriram.`,
      })
    })
  }

  function apagar() {
    if (!confirm(`Apagar o rascunho "${c.assunto || '(sem assunto)'}"?`)) return
    rodar(async () => {
      const form = new FormData()
      form.set('id', c.id)
      const r = await excluirRascunho(form)
      if (r.erro) { setErro(r.erro); return }
      router.refresh()
    })
  }

  return (
    <>
      <tr className="border-b border-border align-top last:border-0 hover:bg-muted/30">
        <td className="max-w-80 px-4 py-3">
          <button type="button" onClick={alternar} className="block max-w-full truncate text-left font-medium text-primary hover:underline" aria-expanded={rascunho ? undefined : aberta}>
            {c.assunto || '(sem assunto)'}
          </button>
          <p className="text-xs text-muted-foreground">{c.quem}</p>
          {erro && <p className="mt-1 text-xs text-destructive">{erro}</p>}
        </td>
        <td className="px-3 py-3"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${estado.classe}`}>{estado.rotulo}</span></td>
        <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
          {c.enviadaEm ? quandoLegivel.format(new Date(c.enviadaEm)) : agendada && c.agendadaPara ? `sai em ${quandoLegivel.format(new Date(c.agendadaPara))}` : '—'}
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
          {rascunho ? '—' : agendada ? numero.format(c.destinatarios) : enviando ? `${numero.format(c.jaSairam ?? c.enviados)} de ${numero.format(c.destinatarios)}` : numero.format(c.enviados)}
        </td>
        <td className="px-3 py-3 text-right font-medium tabular-nums">{semNumeros ? '—' : porcento(taxaDe(c.aberturas, c.enviados))}</td>
        <td className="px-3 py-3 text-right tabular-nums">{semNumeros || !c.linkUrl ? '—' : porcento(taxaDe(c.cliques, c.enviados))}</td>
        <td className="px-3 py-3 text-right tabular-nums">{semNumeros ? '—' : numero.format(c.descadastros)}</td>
        <td className="px-3 py-3">
          {!rascunho && podeDisparar && c.enviados > c.aberturas ? (
            <button type="button" onClick={followUp} disabled={ocupado || !envioDisponivel}
              title="Nova campanha só para quem recebeu esta e não abriu"
              className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-primary hover:underline disabled:opacity-50">
              {ocupado ? <Loader2 className="size-3.5 animate-spin" /> : <Reply className="size-3.5" />}Criar
            </button>
          ) : <span className="text-xs text-muted-foreground">—</span>}
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">{dataCurta.format(new Date(c.criadaEm))}</td>
        <td className="px-3 py-3">
          {rascunho ? (
            podeDisparar && (
              <span className="flex gap-1">
                <button type="button" onClick={() => abrirCampanha({ rascunho: c })} title="Editar e enviar" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><FilePen className="size-4" /></button>
                <button type="button" onClick={apagar} disabled={ocupado} title="Apagar rascunho" className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>
              </span>
            )
          ) : (
            <button type="button" onClick={alternar} aria-label="Ver detalhes" className="rounded-md p-1 text-muted-foreground hover:bg-muted">
              <ChevronDown className={`size-4 transition-transform ${aberta ? 'rotate-180' : ''}`} />
            </button>
          )}
        </td>
      </tr>
      {aberta && (
        <tr className="border-b border-border bg-muted/20">
          <td colSpan={10} className="px-4 py-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mensagem</p>
                <p className="whitespace-pre-wrap text-sm">{c.corpo}</p>
                {c.linkUrl && <a href={c.linkUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block break-all text-xs text-primary hover:underline">{c.linkRotulo || 'Link'}: {c.linkUrl}</a>}
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Destinatários</p>
                {ocupado && !destinatarios && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />Carregando…</p>}
                {destinatarios && (
                  <ul className="max-h-72 overflow-y-auto rounded-lg border border-border bg-background text-sm">
                    {destinatarios.map((d, i) => (
                      <li key={`${d.email}-${i}`} className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5 last:border-0">
                        <span className="min-w-0 truncate">{d.nome ? `${d.nome} · ` : ''}<span className="text-muted-foreground">{d.email}</span></span>
                        <span className="flex shrink-0 gap-1.5 text-[11px]">
                          {d.estado === 'falhou' && <span className="text-destructive" title={d.erro ?? ''}>falhou</span>}
                          {d.estado === 'na_fila' && <span className="text-muted-foreground">{agendada || enviando ? 'na fila' : 'sem confirmação'}</span>}
                          {d.estado === 'enviando' && <span className="text-muted-foreground">enviando</span>}
                          {d.estado === 'de_fora' && <span className="text-amber-700" title={d.erro ?? ''}>ficou de fora</span>}
                          {d.estado === 'enviado' && d.devolvidoEm && <span className="text-destructive" title={d.motivoDaDevolucao ?? ''}>devolveu</span>}
                          {d.estado === 'enviado' && !d.devolvidoEm && !d.abertoEm && <span className="text-muted-foreground">não abriu</span>}
                          {d.abertoEm && <span className="text-emerald-700">abriu</span>}
                          {d.clicadoEm && <span className="text-primary">clicou</span>}
                          {d.denunciouEm && <span className="text-destructive">denunciou spam</span>}
                          {d.descadastrouEm && <span className="text-amber-700">saiu</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {destinatarios && destinatarios.length >= 1000 && (
                  <p className="mt-1 text-xs text-muted-foreground">A lista mostra os primeiros 1.000 destinatários.</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * Escrever e enviar uma campanha — nova, de um rascunho, ou follow-up. Os
 * destinatários vêm prontos (seleção da tabela, follow-up) ou de um segmento
 * escolhido aqui: lista de origem + comportamento de leitura.
 */
export function DialogCampanha({ todos, inicial, onFechar, onFeito }: {
  todos: ContatoDeImprensa[]
  inicial: Composicao
  onFechar: () => void
  onFeito: (recado: string, enviou: boolean) => void
}) {
  const base = inicial.rascunho ?? inicial.base
  const [campanhaId] = useState(inicial.rascunho?.id ?? '')
  const [assunto, setAssunto] = useState(base?.assunto ?? '')
  const [corpo, setCorpo] = useState(base?.corpo || 'Olá, {nome}!\n\n')
  const [linkUrl, setLinkUrl] = useState(base?.linkUrl ?? '')
  const [linkRotulo, setLinkRotulo] = useState(base?.linkRotulo ?? '')
  const [fixos, setFixos] = useState(Boolean(inicial.ids))
  const [lista, setLista] = useState('todas')
  const [segmento, setSegmento] = useState<Segmento>('todos')
  const [momento, setMomento] = useState<'agora' | 'agendar'>('agora')
  const [dataHora, setDataHora] = useState('')
  const [minimo] = useState(() => minimoDoAgendamento())
  const [teste, setTeste] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, rodar] = useTransition()
  const [testando, rodarTeste] = useTransition()
  const parado = ocupado || testando
  const agendar = momento === 'agendar'

  const listas = useMemo(() => [...new Set(todos.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [todos])
  const aptos = useMemo(() => {
    if (fixos && inicial.ids) {
      const ids = new Set(inicial.ids)
      return todos.filter((c) => ids.has(c.id) && podeReceber(c))
    }
    return todos.filter((c) => podeReceber(c) && noSegmento(c, segmento, lista))
  }, [todos, fixos, inicial.ids, segmento, lista])
  const alemDoTeto = aptos.length > TETO_DE_DESTINATARIOS

  const formulario = () => {
    const form = new FormData()
    if (campanhaId) form.set('campanhaId', campanhaId)
    form.set('assunto', assunto)
    form.set('corpo', corpo)
    form.set('linkUrl', linkUrl)
    form.set('linkRotulo', linkRotulo)
    return form
  }

  function guardar() {
    setErro('')
    rodar(async () => {
      const r = await salvarRascunho(formulario())
      if (r.erro) { setErro(r.erro); return }
      onFeito('Rascunho guardado. Ele fica na aba Campanhas → Rascunhos.', false)
    })
  }

  function enviar() {
    if (agendar && !dataHora) { setErro('Escolha o dia e a hora do envio.'); return }
    const pergunta = agendar
      ? `Agendar "${assunto}" para ${agendamentoParaLer(dataHora)} (horário de Brasília), para ${aptos.length} contato(s)?`
      : `Enviar "${assunto}" para ${aptos.length} contato(s)? Depois de enviado, não dá para desfazer.`
    if (!confirm(pergunta)) return
    setErro('')
    rodar(async () => {
      const form = formulario()
      form.set('ids', JSON.stringify(aptos.map((c) => c.id)))
      // O campo manda o horário como foi escrito; quem o lê como de Brasília é o servidor.
      if (agendar) form.set('agendarPara', dataHora)
      const r = await enviarCampanha(form)
      if (r.erro) { setErro(r.erro); return }
      onFeito(r.recado ?? (agendar ? 'Campanha agendada.' : 'Campanha enviada.'), true)
    })
  }

  /** A mensagem como está agora, só para o e-mail de quem está escrevendo. */
  function testar() {
    setErro('')
    setTeste('')
    rodarTeste(async () => {
      const r = await enviarTesteDaCampanha(formulario())
      if (r.erro) { setErro(r.erro); return }
      setTeste(r.recado ?? 'Teste enviado.')
    })
  }

  return (
    <Dialog
      titulo={inicial.rascunho ? 'Rascunho de campanha' : inicial.origem ? 'Follow-up' : 'Nova campanha'}
      descricao="Sai do Palácio Virtual, fica registrada para toda a equipe e mostra quem abriu e clicou."
      largura="max-w-2xl"
      onFechar={onFechar}
      podeFechar={!parado}
    >
      <div className="rounded-lg border border-border p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Destinatários</p>
        {fixos && inicial.ids ? (
          <p className="mt-1 text-sm">
            {inicial.origem ?? 'Contatos selecionados na tabela.'} <strong>{aptos.length}</strong> podem receber.{' '}
            <button type="button" onClick={() => setFixos(false)} className="text-xs text-primary hover:underline">Escolher por segmento</button>
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select value={lista} onChange={(e) => setLista(e.target.value)} className={selectClass} aria-label="Lista">
              <option value="todas">Todas as listas</option>
              {listas.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={segmento} onChange={(e) => setSegmento(e.target.value as Segmento)} className={selectClass} aria-label="Segmento">
              {SEGMENTOS.map((s) => <option key={s.id} value={s.id}>{s.rotulo}</option>)}
            </select>
            <span className="text-sm"><strong className="tabular-nums">{aptos.length}</strong> contato(s)</span>
          </div>
        )}
        <p className="mt-1 text-xs text-muted-foreground">Sem e-mail, e-mail inválido ou devolvido e quem saiu da lista ficam de fora sempre.</p>
        {alemDoTeto && <p className="mt-1 text-xs text-destructive">No máximo {TETO_DE_DESTINATARIOS} por campanha. Escolha uma lista ou segmento menor.</p>}
      </div>

      <label className="text-sm font-medium">Assunto
        <input value={assunto} onChange={(e) => setAssunto(e.target.value)} disabled={parado} maxLength={200} className={`mt-1 ${inputClass}`} />
      </label>
      <label className="text-sm font-medium">Mensagem
        <textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} disabled={parado} rows={9} className={`mt-1 font-normal ${inputClass}`} />
        <span className="mt-1 block text-xs font-normal text-muted-foreground">
          <code>{'{nome}'}</code> vira o primeiro nome de cada contato (some sozinho quando não há nome). Linha em branco separa parágrafos.
        </span>
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="text-sm font-medium">Link <span className="font-normal text-muted-foreground">(opcional — mede cliques)</span>
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} disabled={parado} placeholder="https://cruzvermelhariodejaneiro.org/noticias/…" className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-sm font-medium">Texto do link
          <input value={linkRotulo} onChange={(e) => setLinkRotulo(e.target.value)} disabled={parado} placeholder="Leia o release" className={`mt-1 ${inputClass}`} />
        </label>
      </div>

      <fieldset className="rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quando enviar</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Quando enviar">
          {(['agora', 'agendar'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={momento === m}
              onClick={() => setMomento(m)}
              disabled={parado}
              className={`min-h-11 rounded-lg border px-4 text-sm ${momento === m ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
            >
              {m === 'agora' ? 'Agora' : 'Agendar'}
            </button>
          ))}
        </div>
        {agendar && (
          <label className="mt-3 block text-sm font-medium">Dia e hora <span className="font-normal text-muted-foreground">(horário de Brasília)</span>
            <input type="datetime-local" value={dataHora} min={minimo} onChange={(e) => setDataHora(e.target.value)} disabled={parado} className={`mt-1 min-h-11 ${inputClass} sm:w-64`} />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              Jornalistas costumam preferir receber pela manhã. Até a hora marcada, dá para cancelar na aba Campanhas.
            </span>
          </label>
        )}
      </fieldset>

      {teste && <p className="text-xs text-emerald-700">{teste}</p>}
      {erro && <p className="text-xs text-destructive">{erro}</p>}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onFechar} disabled={parado} className="min-h-11 sm:min-h-0">Cancelar</Button>
        <Button variant="outline" onClick={testar} disabled={parado || assunto.trim().length < 3 || corpo.trim().length < 10} title="Manda esta mensagem só para o seu e-mail, para ver como chega" className="min-h-11 sm:min-h-0">
          {testando ? <Loader2 className="size-4 animate-spin" /> : <MailCheck className="size-4" />}Enviar teste para mim
        </Button>
        <Button variant="outline" onClick={guardar} disabled={parado || (!assunto.trim() && !corpo.trim())} className="min-h-11 sm:min-h-0">
          <Save className="size-4" />Salvar rascunho
        </Button>
        <Button onClick={enviar} disabled={parado || !aptos.length || alemDoTeto || assunto.trim().length < 3 || corpo.trim().length < 10} className="min-h-11 sm:min-h-0">
          {ocupado ? <Loader2 className="size-4 animate-spin" /> : agendar ? <CalendarClock className="size-4" /> : <Send className="size-4" />}
          {ocupado ? 'Aguarde…' : agendar ? `Agendar para ${numero.format(aptos.length)}` : `Enviar para ${numero.format(aptos.length)}`}
        </Button>
      </div>
    </Dialog>
  )
}
