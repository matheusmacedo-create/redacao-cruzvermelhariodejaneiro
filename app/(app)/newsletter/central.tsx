'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  AlertTriangle, CheckCircle2, Download, Loader2, Mail, MailCheck, Plus,
  RefreshCw, Search, Send, Trash2, X,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { rotuloDoEstado } from '@/lib/newsletter/csv'
import {
  adicionarInscrito, apagarInscrito, reenviarConvite, reenviarConvitesPendentes,
} from '@/app/actions/newsletter'

export type Inscrito = {
  id: string
  email: string
  nome: string
  estado: 'pendente' | 'confirmado' | 'descadastrado' | 'invalido'
  origem: string
  created_at: string
  confirmado_em: string | null
  descadastrado_em: string | null
}

export type Edicao = {
  id: string
  assunto: string
  estado: string
  destinatarios: string
  erro: string
  quando: string
}

type Contagens = { total: number; confirmados: number; pendentes: number; descadastrados: number; invalidos: number }
type Mes = { chave: string; rotulo: string; quantos: number }

/**
 * O tom de cada situação.
 *
 * Cor SEMPRE acompanhada do rótulo. Situação comunicada só por cor é
 * ilegível para quem não distingue verde de vermelho — e "confirmado" e
 * "endereço inválido" são exatamente o par que se confunde.
 */
const TOM: Record<Inscrito['estado'], string> = {
  confirmado: 'bg-success/14 text-success',
  pendente: 'bg-warning/20 text-warning-foreground',
  descadastrado: 'bg-secondary text-secondary-foreground',
  invalido: 'bg-destructive/12 text-destructive',
}

const FILTROS = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'confirmado', rotulo: 'Confirmados' },
  { id: 'pendente', rotulo: 'Aguardando' },
  { id: 'descadastrado', rotulo: 'Saíram' },
  { id: 'invalido', rotulo: 'Inválidos' },
] as const

function dataCurta(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function Central({
  contagens, inscritos, truncada, limiteDaTela, meses, historico, envio, podeApagar,
}: {
  contagens: Contagens
  inscritos: Inscrito[]
  truncada: boolean
  limiteDaTela: number
  meses: Mes[]
  historico: Edicao[]
  envio: { configurado: boolean; remetente: string; responderPara: string }
  podeApagar: boolean
}) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('todos')
  const [busca, setBusca] = useState('')
  const [recado, setRecado] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [abrindoForm, setAbrindoForm] = useState(false)
  const [processando, comecar] = useTransition()

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return inscritos
      .filter((i) => filtro === 'todos' || i.estado === filtro)
      .filter((i) => !termo || i.email.includes(termo) || i.nome.toLowerCase().includes(termo))
  }, [inscritos, filtro, busca])

  const executar = (acao: () => Promise<{ erro?: string; recado?: string }>) => {
    comecar(async () => {
      const r = await acao()
      setRecado(r.erro ? { tom: 'erro', texto: r.erro } : { tom: 'ok', texto: r.recado ?? 'Pronto.' })
    })
  }

  return (
    <div className="space-y-6">
      {recado && (
        <div className={cn(
          'flex items-start gap-2 rounded-lg px-4 py-3 text-sm',
          recado.tom === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-success/12 text-success',
        )}>
          {recado.tom === 'erro' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
          <p className="flex-1">{recado.texto}</p>
          <button type="button" onClick={() => setRecado(null)} aria-label="Fechar aviso"><X className="size-4" /></button>
        </div>
      )}

      <Numeros contagens={contagens} />
      <EstadoDoEnvio envio={envio} pendentes={contagens.pendentes} executar={executar} processando={processando} />
      <Crescimento meses={meses} total={contagens.total} />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex flex-wrap gap-1.5">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  filtro === f.id ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                {f.rotulo}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por e-mail ou nome"
                aria-label="Buscar na lista"
                className="h-9 w-56 rounded-lg border border-border bg-background pl-8 pr-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setAbrindoForm((v) => !v)}>
              <Plus className="size-4" />Acrescentar
            </Button>
            <Button variant="outline" size="sm" render={<a href="/api/newsletter/exportar" />}>
              <Download className="size-4" />Exportar
            </Button>
          </div>
        </div>

        {abrindoForm && <FormularioManual executar={executar} processando={processando} fechar={() => setAbrindoForm(false)} />}

        <Tabela
          lista={lista}
          vazia={inscritos.length === 0}
          buscando={busca.trim().length > 0}
          podeApagar={podeApagar}
          executar={executar}
          processando={processando}
        />

        {truncada && (
          <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            A tela mostra os {limiteDaTela} mais recentes de {contagens.total}. Use <strong>Exportar</strong> para a lista inteira.
          </p>
        )}
      </Card>

      <Historico edicoes={historico} />
    </div>
  )
}

/**
 * Os números.
 *
 * Contagem não vira gráfico: é um valor único, e o número escrito é a forma
 * mais legível que existe para um valor único. Gráfico aqui seria decoração.
 */
function Numeros({ contagens }: { contagens: Contagens }) {
  const tiles = [
    { rotulo: 'Na lista', valor: contagens.confirmados, dica: 'Confirmaram e recebem as edições', destaque: true },
    { rotulo: 'Aguardando', valor: contagens.pendentes, dica: 'Pediram, ainda não confirmaram' },
    { rotulo: 'Saíram', valor: contagens.descadastrados, dica: 'Pediram para não receber mais' },
    { rotulo: 'Inválidos', valor: contagens.invalidos, dica: 'O endereço devolveu a mensagem' },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => (
        <Card key={t.rotulo} className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.rotulo}</p>
          <p className={cn('mt-2 text-3xl font-bold tabular-nums', t.destaque && 'text-primary')}>{t.valor}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.dica}</p>
        </Card>
      ))}
    </div>
  )
}

/**
 * O estado do envio, e o que fazer com os pendentes.
 *
 * A conferência do domínio é sob demanda, não no carregamento: é uma chamada
 * ao Resend, e a tela não pode abrir na velocidade dele.
 */
function EstadoDoEnvio({ envio, pendentes, executar, processando }: {
  envio: { configurado: boolean; remetente: string; responderPara: string }
  pendentes: number
  executar: (a: () => Promise<{ erro?: string; recado?: string }>) => void
  processando: boolean
}) {
  const [conferindo, setConferindo] = useState(false)
  const [diagnostico, setDiagnostico] = useState<{ veredito?: string; oQueFazer?: string[]; dominioVerificado?: boolean } | null>(null)

  const conferir = async () => {
    setConferindo(true)
    try {
      const r = await fetch('/api/admin/newsletter-check')
      setDiagnostico(r.status === 403
        ? { veredito: 'O diagnóstico completo é restrito a administradores.' }
        : await r.json())
    } catch {
      setDiagnostico({ veredito: 'Não foi possível conferir agora.' })
    } finally {
      setConferindo(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-muted-foreground" />
            <h2 className="font-semibold">Envio</h2>
            <span className={cn(
              'rounded-md px-2 py-0.5 text-xs font-medium',
              envio.configurado ? 'bg-success/14 text-success' : 'bg-warning/20 text-warning-foreground',
            )}>
              {envio.configurado ? 'Configurado' : 'Sem chave do Resend'}
            </span>
          </div>
          <p className="mt-2 break-all text-sm text-muted-foreground">
            Sai de <strong className="text-foreground">{envio.remetente}</strong>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {envio.responderPara
              ? <>Respostas vão para {envio.responderPara}.</>
              : <>Sem endereço de resposta configurado: quem responder a uma edição escreve para o vazio.</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={conferir} disabled={conferindo}>
            {conferindo ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Conferir envio
          </Button>
          {pendentes > 0 && (
            <Button
              size="sm"
              disabled={processando || !envio.configurado}
              onClick={() => executar(() => reenviarConvitesPendentes())}
            >
              <Send className="size-4" />
              Reenviar {pendentes} convite{pendentes === 1 ? '' : 's'}
            </Button>
          )}
        </div>
      </div>

      {diagnostico && (
        <div className="mt-4 space-y-2 rounded-lg bg-muted/50 p-4 text-sm">
          {diagnostico.veredito && (
            <p className="flex items-start gap-2">
              {diagnostico.dominioVerificado
                ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />}
              <span>{diagnostico.veredito}</span>
            </p>
          )}
          {diagnostico.oQueFazer?.map((item, i) => (
            <p key={i} className="pl-6 text-xs leading-relaxed text-muted-foreground">• {item}</p>
          ))}
        </div>
      )}
    </Card>
  )
}

/**
 * Como a lista cresceu.
 *
 * Barras de série única, com o valor escrito em cima de cada uma. O rótulo
 * direto vale mais do que uma dica ao passar o mouse: o número fica legível
 * sempre, inclusive para quem navega por toque ou por leitor de tela, e a
 * altura da barra vira reforço em vez de ser a única informação.
 *
 * Só aparece quando há alguém na base. Seis barras zeradas não informam nada
 * que a frase "ainda não há inscrições" não diga melhor.
 */
function Crescimento({ meses, total }: { meses: Mes[]; total: number }) {
  if (!total) return null
  const teto = Math.max(...meses.map((m) => m.quantos), 1)

  return (
    <Card className="p-5">
      <h2 className="font-semibold">Inscrições por mês</h2>
      <p className="mt-1 text-xs text-muted-foreground">Últimos seis meses.</p>
      <div className="mt-5 flex items-end gap-2" role="img" aria-label={`Inscrições por mês: ${meses.map((m) => `${m.rotulo}, ${m.quantos}`).join('; ')}`}>
        {meses.map((m) => (
          <div key={m.chave} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-xs font-semibold tabular-nums text-foreground">{m.quantos || ''}</span>
            {/* Barra estreita, não bloco: a marca fina deixa a diferença de
                altura ser lida como comparação, e não como área colorida.
                Mês sem inscrição vira um traço na linha de base — o buraco na
                sequência informa mais do que a ausência da barra. */}
            <div
              className={cn('w-full max-w-14 rounded-t bg-primary', !m.quantos && 'bg-border')}
              style={{ height: `${Math.max((m.quantos / teto) * 96, m.quantos ? 6 : 2)}px` }}
            />
            <span className="text-xs capitalize text-muted-foreground">{m.rotulo}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function FormularioManual({ executar, processando, fechar }: {
  executar: (a: () => Promise<{ erro?: string; recado?: string }>) => void
  processando: boolean
  fechar: () => void
}) {
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [confirmou, setConfirmou] = useState(false)

  return (
    <form
      className="border-b border-border bg-muted/30 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        const dados = new FormData()
        dados.set('email', email)
        dados.set('nome', nome)
        executar(async () => {
          const r = await adicionarInscrito(dados)
          if (!r.erro) { setEmail(''); setNome(''); setConfirmou(false); fechar() }
          return r
        })
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="e-mail" aria-label="E-mail"
          className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        />
        <input
          value={nome} onChange={(e) => setNome(e.target.value)}
          placeholder="nome (opcional)" aria-label="Nome"
          className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        />
        <Button type="submit" size="sm" disabled={processando || !confirmou}>
          {processando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Acrescentar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={fechar}>Cancelar</Button>
      </div>

      {/* A trava do consentimento. Sem esta afirmação o botão não habilita:
          acrescentar endereço de quem não pediu é o caminho mais curto para a
          instituição inteira ser marcada como spam. */}
      <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <input type="checkbox" checked={confirmou} onChange={(e) => setConfirmou(e.target.checked)} className="mt-0.5" />
        <span>
          Declaro que esta pessoa pediu para receber a newsletter. Ela ainda vai receber um e-mail
          de confirmação — só entra na lista depois de clicar. Um endereço por vez, de propósito.
        </span>
      </label>
    </form>
  )
}

function Tabela({ lista, vazia, buscando, podeApagar, executar, processando }: {
  lista: Inscrito[]
  vazia: boolean
  /** Há termo de busca digitado — muda o que a lista vazia significa. */
  buscando: boolean
  podeApagar: boolean
  executar: (a: () => Promise<{ erro?: string; recado?: string }>) => void
  processando: boolean
}) {
  const [confirmandoApagar, setConfirmandoApagar] = useState<string | null>(null)

  if (vazia) {
    return (
      <div className="p-10 text-center">
        <MailCheck className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 font-medium">Ainda não há ninguém na lista</p>
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
          As inscrições chegam pelo formulário do site institucional. Se ele já está publicado e
          nada aparece aqui, use <strong>Conferir envio</strong> acima — o diagnóstico diz se o
          formulário da home está ligado nesta rota ou se ainda é o decorativo.
        </p>
      </div>
    )
  }

  if (!lista.length) {
    // A frase muda conforme a causa. "Nenhum inscrito nesta situação" com o
    // filtro em Todos e uma busca digitada manda procurar no lugar errado.
    return (
      <p className="p-10 text-center text-sm text-muted-foreground">
        {buscando ? 'Nenhum inscrito corresponde à busca.' : 'Nenhum inscrito nesta situação.'}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-semibold">Pessoa</th>
            <th className="px-4 py-3 font-semibold">Situação</th>
            <th className="px-4 py-3 font-semibold">Origem</th>
            <th className="px-4 py-3 font-semibold">Inscrição</th>
            <th className="px-4 py-3 font-semibold">Confirmação</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {lista.map((i) => (
            <tr key={i.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3">
                <p className="font-medium">{i.nome || '—'}</p>
                <p className="break-all text-xs text-muted-foreground">{i.email}</p>
              </td>
              <td className="px-4 py-3">
                <span className={cn('inline-block rounded-md px-2 py-0.5 text-xs font-medium', TOM[i.estado])}>
                  {rotuloDoEstado(i.estado)}
                </span>
              </td>
              <td className="px-4 py-3 text-xs capitalize text-muted-foreground">{i.origem}</td>
              <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">{dataCurta(i.created_at)}</td>
              <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">{dataCurta(i.confirmado_em)}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  {i.estado === 'pendente' && (
                    <Button
                      variant="ghost" size="sm" disabled={processando}
                      onClick={() => {
                        const dados = new FormData(); dados.set('id', i.id)
                        executar(() => reenviarConvite(dados))
                      }}
                    >
                      <Send className="size-3.5" />Reenviar
                    </Button>
                  )}
                  {podeApagar && (
                    confirmandoApagar === i.id ? (
                      <span className="flex items-center gap-1">
                        <Button
                          variant="ghost" size="sm" disabled={processando}
                          className="text-destructive"
                          onClick={() => {
                            const dados = new FormData(); dados.set('id', i.id)
                            setConfirmandoApagar(null)
                            executar(() => apagarInscrito(dados))
                          }}
                        >
                          Apagar mesmo
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmandoApagar(null)}>Não</Button>
                      </span>
                    ) : (
                      <Button
                        variant="ghost" size="sm"
                        aria-label={`Apagar ${i.email}`}
                        onClick={() => setConfirmandoApagar(i.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Historico({ edicoes }: { edicoes: Edicao[] }) {
  return (
    <Card>
      <div className="border-b border-border p-4">
        <h2 className="font-semibold">Edições enviadas</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          A newsletter sai como destino de um pacote, em Publicações — ao lado das redes sociais.
        </p>
      </div>
      {edicoes.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma edição enviada ainda. Abra um pacote em Publicações e acrescente o destino Newsletter.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {edicoes.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{e.assunto}</p>
                <p className="text-xs text-muted-foreground">
                  {e.quando ? dataCurta(e.quando) : '—'}
                  {e.destinatarios ? ` · ${e.destinatarios}` : ''}
                </p>
                {e.erro && <p className="mt-1 text-xs text-destructive">{e.erro}</p>}
              </div>
              <span className={cn(
                'rounded-md px-2 py-0.5 text-xs font-medium',
                e.estado === 'publicada' ? 'bg-success/14 text-success'
                  : e.estado === 'na_fila' ? 'bg-info/12 text-info'
                  : e.estado === 'falhou' ? 'bg-destructive/12 text-destructive'
                  : 'bg-secondary text-secondary-foreground',
              )}>
                {e.estado === 'publicada' ? 'Enviada' : e.estado === 'na_fila' ? 'Agendada' : e.estado === 'falhou' ? 'Falhou' : e.estado}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
