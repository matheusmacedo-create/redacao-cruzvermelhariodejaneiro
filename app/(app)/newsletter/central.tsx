'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, CheckCircle2, Download, Info, Loader2, Mail, MailCheck, PenLine, Plus,
  Globe, RefreshCw, Search, Send, Settings, Trash2, Users, X,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { rotuloDoEstado } from '@/lib/newsletter/csv'
import {
  adicionarInscrito, apagarInscrito, ligarFormularioDoSite, reenviarConvite,
  reenviarConvitesPendentes,
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

/**
 * As três partes da tela (19/11/2026). Antes era uma página só, de cima a baixo: números, formulário do site, envio,
 * gráfico, lista e, lá no fim, as edições, sem botão para escrever uma. Quem abria a Newsletter para mandar um aviso
 * à lista não achava por onde. A ordem agora é a do trabalho: o botão "Nova edição" no alto, o que saiu, quem recebe,
 * e a configuração por último, porque ninguém mexe nela no dia a dia.
 */
const ABAS = [
  { id: 'edicoes', rotulo: 'Edições', icone: Send },
  { id: 'inscritos', rotulo: 'Inscritos', icone: Users },
  { id: 'configuracao', rotulo: 'Configuração', icone: Settings },
] as const

type Aba = (typeof ABAS)[number]['id']

export function Central({
  contagens, inscritos, truncada, limiteDaTela, meses, historico, envio, podeApagar, podeExportar, abaInicial,
}: {
  contagens: Contagens
  inscritos: Inscrito[]
  truncada: boolean
  limiteDaTela: number
  meses: Mes[]
  historico: Edicao[]
  envio: { configurado: boolean; remetente: string; responderPara: string }
  podeApagar: boolean
  podeExportar: boolean
  abaInicial?: string
}) {
  const [aba, setAba] = useState<Aba>(ABAS.some((a) => a.id === abaInicial) ? (abaInicial as Aba) : 'edicoes')
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('todos')
  const [busca, setBusca] = useState('')
  const [recado, setRecado] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [abrindoForm, setAbrindoForm] = useState(false)
  const [processando, comecar] = useTransition()
  // O que a conferência do formulário do site respondeu (o cartão fica na aba Configuração, e a conferência roda
  // sozinha ao abrir a tela): formulário desligado é o tipo de problema que não pode ficar escondido atrás de uma aba.
  const [formularioDesligado, setFormularioDesligado] = useState(false)

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

  const irPara = (id: Aba) => {
    setAba(id)
    // O endereço acompanha a aba, para "voltar" e "atualizar" caírem no mesmo lugar. Sem navegação: é só o endereço.
    try { window.history.replaceState(null, '', id === 'edicoes' ? '/newsletter' : `/newsletter?aba=${id}`) } catch { /* só conveniência */ }
  }

  const contagemDoFiltro: Record<(typeof FILTROS)[number]['id'], number> = {
    todos: contagens.total,
    confirmado: contagens.confirmados,
    pendente: contagens.pendentes,
    descadastrado: contagens.descadastrados,
    invalido: contagens.invalidos,
  }
  // "Aguardando" é de inscrição antiga (de quando havia o clique de confirmação): só aparece enquanto houver alguma.
  const filtros = FILTROS.filter((f) => f.id !== 'pendente' || contagens.pendentes > 0)
  const precisaDeAtencao = !envio.configurado || formularioDesligado

  return (
    <div className="space-y-5">
      {recado && (
        <div className={cn(
          'flex items-start gap-2 rounded-lg px-4 py-3 text-sm',
          recado.tom === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-success/12 text-success',
        )}>
          {recado.tom === 'erro' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
          <p className="flex-1">{recado.texto}</p>
          <button type="button" onClick={() => setRecado(null)} aria-label="Fechar aviso" className="-m-2 p-2"><X className="size-4" /></button>
        </div>
      )}

      {precisaDeAtencao && aba !== 'configuracao' && (
        <button
          type="button" onClick={() => irPara('configuracao')}
          className="flex w-full items-start gap-3 rounded-xl bg-warning/15 px-4 py-3 text-left text-sm text-warning-foreground"
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <span>
            <strong className="block text-base">{!envio.configurado ? 'O envio de e-mail não está configurado' : 'O formulário do site não está ligado'}</strong>
            {!envio.configurado ? 'Nenhuma mensagem sai até isso ser resolvido.' : 'Quem se inscreve no site pode estar ficando de fora.'} Toque para ver em Configuração.
          </span>
        </button>
      )}

      <Numeros contagens={contagens} meses={meses} historico={historico} />

      <div data-ajuda="newsletter.abas" role="tablist" aria-label="Partes da Newsletter" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
        {ABAS.map(({ id, rotulo, icone: Icone }) => (
          <button
            key={id} type="button" role="tab" aria-selected={aba === id} aria-controls={`painel-${id}`}
            onClick={() => irPara(id)}
            className={cn(
              'relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-sm font-medium transition-colors sm:flex-row sm:gap-2 sm:text-base',
              aba === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icone className="size-4" />
            <span>{rotulo}</span>
            {id === 'configuracao' && precisaDeAtencao && (
              <span className="absolute right-2 top-2 size-2 rounded-full bg-warning" aria-label="precisa de atenção" />
            )}
          </button>
        ))}
      </div>

      {/* Os três painéis ficam montados e só um aparece: trocar de aba não perde a busca digitada, e a conferência do
          formulário do site (na Configuração) roda ao abrir a tela, esteja a aba aberta ou não. */}
      <div id="painel-edicoes" role="tabpanel" hidden={aba !== 'edicoes'}>
        <Historico edicoes={historico} naLista={contagens.confirmados} />
      </div>

      <div id="painel-inscritos" role="tabpanel" hidden={aba !== 'inscritos'} className="space-y-5">
        <Crescimento meses={meses} total={contagens.total} />

        <Card>
          <div data-ajuda="newsletter.lista" className="space-y-3 border-b border-border p-4">
            <div className="flex flex-wrap gap-2">
              {filtros.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltro(f.id)}
                  aria-pressed={filtro === f.id}
                  className={cn(
                    'flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors',
                    filtro === f.id ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground',
                  )}
                >
                  {f.rotulo}
                  <span className="tabular-nums opacity-70">{contagemDoFiltro[f.id]}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por e-mail ou nome"
                  aria-label="Buscar na lista"
                  className="h-11 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-base outline-none focus:border-primary sm:text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button variant="outline" className="h-11 px-4" onClick={() => setAbrindoForm((v) => !v)}>
                  <Plus className="size-4" />Acrescentar
                </Button>
                {podeExportar && <Button variant="outline" className="h-11 px-4" render={<a href="/api/newsletter/exportar" />}>
                  <Download className="size-4" />Exportar
                </Button>}
              </div>
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
      </div>

      <div id="painel-configuracao" role="tabpanel" hidden={aba !== 'configuracao'} className="space-y-5">
        <FormularioDaHome podeLigar={podeApagar} executar={executar} processando={processando} aoConferir={setFormularioDesligado} />
        <EstadoDoEnvio envio={envio} pendentes={contagens.pendentes} executar={executar} processando={processando} />
      </div>
    </div>
  )
}

/**
 * Os números.
 *
 * Contagem não vira gráfico: é um valor único, e o número escrito é a forma
 * mais legível que existe para um valor único. Gráfico aqui seria decoração.
 */
function Numeros({ contagens, meses, historico }: { contagens: Contagens; meses: Mes[]; historico: Edicao[] }) {
  // Três números que respondem ao que se quer saber ao abrir a tela: quantos recebem, se a lista está crescendo e
  // quando saiu a última edição. "Saíram" e "Inválidos" foram para os filtros da lista, onde dá para ver quem são.
  const noMes = meses[meses.length - 1]?.quantos ?? 0
  const ultima = historico.find((e) => e.estado === 'publicada')
  const tiles = [
    { rotulo: 'Na lista', valor: String(contagens.confirmados), dica: contagens.confirmados === 1 ? 'pessoa' : 'pessoas', destaque: true },
    { rotulo: 'Novas este mês', valor: String(noMes), dica: noMes === 1 ? 'inscrição' : 'inscrições' },
    { rotulo: 'Última edição', valor: ultima?.quando ? dataCurta(ultima.quando).slice(0, 5) : '—', dica: ultima ? ultima.assunto : 'Nenhuma enviada ainda' },
  ]
  return (
    <div data-ajuda="newsletter.numeros" className="grid grid-cols-3 gap-2 sm:gap-4">
      {tiles.map((t) => (
        <Card key={t.rotulo} className="min-w-0 p-3 sm:p-5">
          <p className="text-[0.7rem] font-semibold uppercase leading-tight tracking-wide text-muted-foreground sm:text-xs">{t.rotulo}</p>
          <p className={cn('mt-1.5 text-2xl font-bold tabular-nums sm:text-3xl', t.destaque && 'text-primary')}>{t.valor}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">{t.dica}</p>
        </Card>
      ))}
    </div>
  )
}

/**
 * O formulário da home: saber se está ligado — e só então falar.
 *
 * A primeira versão esperava um clique em "Ver situação" para conferir, e até
 * lá abria no aviso de perigo com o botão "Ligar o formulário" — TODA visita à
 * Central recomeçava do susto, mesmo com o formulário ligado há dias. Alarme
 * que dispara sem conferir ensina a ser ignorado, e o dia em que o formulário
 * cair de verdade ninguém vai acreditar nele.
 *
 * Agora a conferência roda sozinha ao abrir o cartão. Ela lê a home pública
 * pela rota de diagnóstico, mas não segura a tela: o resto da Central abre na
 * hora, e este cartão diz "conferindo…" até saber — e só acusa quando SABE
 * que está desligado.
 */
function FormularioDaHome({ podeLigar, executar, processando, aoConferir }: {
  podeLigar: boolean
  executar: (a: () => Promise<{ erro?: string; recado?: string }>) => void
  processando: boolean
  /** Diz à Central se a conferência achou o formulário desligado (só o que foi conferido e deu errado). */
  aoConferir?: (desligado: boolean) => void
}) {
  const [estado, setEstado] = useState<string | null>(null)
  const [olhando, setOlhando] = useState(false)

  const olhar = useCallback(async () => {
    setOlhando(true)
    try {
      // Só a leitura da home: esta conferência roda sozinha a cada abertura, e não chama o Resend para isso.
      const r = await fetch('/api/admin/newsletter-check?so=formulario')
      const d = await r.json()
      setEstado(r.status === 403 ? 'restrito' : (d.formularioDaHome ?? 'sem-resposta'))
    } catch {
      setEstado('sem-resposta')
    } finally {
      setOlhando(false)
    }
  }, [])

  // No modo estrito o efeito roda duas vezes; a trava evita a chamada dupla.
  const jaOlhou = useRef(false)
  useEffect(() => {
    if (jaOlhou.current) return
    jaOlhou.current = true
    olhar()
  }, [olhar])

  const ligado = estado === 'ligado'
  // Só é problema o que foi CONFERIDO e deu errado. Conferência que não
  // respondeu é dúvida, e dúvida não veste vermelho.
  const desligado = estado !== null && !ligado && estado !== 'restrito' && estado !== 'sem-resposta'

  useEffect(() => { aoConferir?.(desligado) }, [desligado, aoConferir])

  return (
    <Card data-ajuda="newsletter.formulario" className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-muted-foreground" />
            <h2 className="font-semibold">Formulário do site</h2>
            {estado === null && (
              <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />Conferindo…
              </span>
            )}
            {estado !== null && (
              <span className={cn(
                'rounded-md px-2 py-0.5 text-xs font-medium',
                ligado ? 'bg-success/14 text-success'
                  : desligado ? 'bg-warning/20 text-warning-foreground'
                    : 'bg-muted text-muted-foreground',
              )}>
                {ligado ? 'Ligado'
                  : estado === 'restrito' ? 'Restrito a administrador'
                    : estado === 'sem-resposta' ? 'Sem resposta agora'
                      : 'Não está ligado'}
              </span>
            )}
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {estado === null
              ? 'Conferindo se o formulário da home aponta para cá…'
              : ligado
                ? 'A home de cruzvermelhariodejaneiro.org envia as inscrições para cá.'
                : estado === 'restrito'
                  ? 'A situação do formulário é visível para administradores.'
                  : estado === 'sem-resposta'
                    ? 'Não consegui ler a home do site agora. Isso costuma ser instabilidade passageira — confira de novo daqui a pouco.'
                    : 'A home promete "Receba novidades da Cruz Vermelha RJ". Enquanto o formulário de lá não apontar para cá, quem se inscreve tem o endereço descartado sem saber.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-11 px-4" onClick={olhar} disabled={olhando}>
            {olhando ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Ver situação
          </Button>
          {podeLigar && desligado && (
            <Button
              className="h-11 px-4"
              disabled={processando}
              onClick={() => executar(async () => {
                const r = await ligarFormularioDoSite()
                if (!r.erro) setEstado('ligado')
                return r
              })}
            >
              {processando ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}
              Ligar o formulário
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

/**
 * O estado do envio, e o que fazer com os pendentes.
 *
 * A conferência do domínio é sob demanda, não no carregamento: é uma chamada
 * ao Resend, e a tela não pode abrir na velocidade dele.
 *
 * O ícone do resultado segue o tom que o diagnóstico devolve
 * (lib/newsletter/diagnostico.ts): certo, atenção, ou neutro quando não deu
 * para conferir. Não dar para conferir não é problema, e não veste o alerta.
 */
function EstadoDoEnvio({ envio, pendentes, executar, processando }: {
  envio: { configurado: boolean; remetente: string; responderPara: string }
  pendentes: number
  executar: (a: () => Promise<{ erro?: string; recado?: string }>) => void
  processando: boolean
}) {
  const [conferindo, setConferindo] = useState(false)
  const [diagnostico, setDiagnostico] = useState<{ veredito?: string; oQueFazer?: string[]; tom?: 'ok' | 'neutro' | 'atencao' } | null>(null)

  const conferir = async () => {
    setConferindo(true)
    try {
      const r = await fetch('/api/admin/newsletter-check')
      setDiagnostico(r.status === 403
        ? { veredito: 'O diagnóstico completo é restrito a administradores.', tom: 'neutro' }
        : await r.json())
    } catch {
      setDiagnostico({ veredito: 'Não foi possível conferir agora.', tom: 'neutro' })
    } finally {
      setConferindo(false)
    }
  }

  return (
    <Card data-ajuda="newsletter.envio" className="p-5">
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
          <Button variant="outline" className="h-11 px-4" onClick={conferir} disabled={conferindo}>
            {conferindo ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Conferir envio
          </Button>
          {pendentes > 0 && (
            <Button
              className="h-11 px-4"
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
              {diagnostico.tom === 'ok'
                ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                : diagnostico.tom === 'neutro'
                  ? <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />}
              <span className="min-w-0 break-words">{diagnostico.veredito}</span>
            </p>
          )}
          {diagnostico.oQueFazer?.map((item, i) => (
            <p key={i} className="break-words pl-6 text-xs leading-relaxed text-muted-foreground">• {item}</p>
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
        <Button type="submit" className="h-11 px-4" disabled={processando || !confirmou}>
          {processando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Acrescentar
        </Button>
        <Button type="button" variant="ghost" className="h-11 px-4" onClick={fechar}>Cancelar</Button>
      </div>

      {/* A trava do consentimento. Sem esta afirmação o botão não habilita:
          acrescentar endereço de quem não pediu é o caminho mais curto para a
          instituição inteira ser marcada como spam. */}
      <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <input type="checkbox" checked={confirmou} onChange={(e) => setConfirmou(e.target.checked)} className="mt-0.5" />
        <span>
          Declaro que esta pessoa pediu para receber a newsletter. Ela entra na lista na hora e
          recebe uma mensagem de boas-vindas, com o link para sair. Um endereço por vez, de propósito.
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

  const acoes = (i: Inscrito) => (
    <div className="flex items-center justify-end gap-1">
      {i.estado === 'pendente' && (
        <Button
          variant="ghost" className="h-11 px-3" disabled={processando}
          onClick={() => {
            const dados = new FormData(); dados.set('id', i.id)
            executar(() => reenviarConvite(dados))
          }}
        >
          <Send className="size-4" />Reenviar
        </Button>
      )}
      {podeApagar && (
        confirmandoApagar === i.id ? (
          <span className="flex items-center gap-1">
            <Button
              variant="ghost" disabled={processando}
              className="h-11 px-3 text-destructive"
              onClick={() => {
                const dados = new FormData(); dados.set('id', i.id)
                setConfirmandoApagar(null)
                executar(() => apagarInscrito(dados))
              }}
            >
              Apagar mesmo
            </Button>
            <Button variant="ghost" className="h-11 px-3" onClick={() => setConfirmandoApagar(null)}>Não</Button>
          </span>
        ) : (
          <Button
            variant="ghost" className="size-11"
            aria-label={`Apagar ${i.email}`}
            onClick={() => setConfirmandoApagar(i.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        )
      )}
    </div>
  )

  return (
    <>
    {/* No celular, uma pessoa por linha, em cartão: tabela de seis colunas em 390 px obriga a arrastar de lado para
        ler a situação, que é a coluna que mais importa. */}
    <ul className="divide-y divide-border md:hidden">
      {lista.map((i) => (
        <li key={i.id} className="flex items-start gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="break-all text-base font-medium">{i.nome || i.email}</p>
            {i.nome && <p className="break-all text-sm text-muted-foreground">{i.email}</p>}
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className={cn('rounded-md px-2 py-0.5 font-medium', TOM[i.estado])}>{rotuloDoEstado(i.estado)}</span>
              <span>desde {dataCurta(i.created_at)}</span>
              <span className="capitalize">· {i.origem}</span>
            </p>
          </div>
          {acoes(i)}
        </li>
      ))}
    </ul>
    <div className="hidden overflow-x-auto md:block">
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
              <td className="px-4 py-3">{acoes(i)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  )
}

function Historico({ edicoes, naLista }: { edicoes: Edicao[]; naLista: number }) {
  return (
    <Card data-ajuda="newsletter.edicoes">
      <div className="border-b border-border p-4">
        <h2 className="text-base font-semibold">Edições</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          O que já saiu para a lista, da mais recente para a mais antiga.
        </p>
      </div>
      {edicoes.length === 0 ? (
        <div className="p-8 text-center">
          <PenLine className="mx-auto size-9 text-muted-foreground" />
          <p className="mt-3 text-lg font-semibold">Nenhuma edição enviada ainda</p>
          <p className="mx-auto mt-1 max-w-md text-base leading-relaxed text-muted-foreground">
            {naLista > 0
              ? `${naLista} pessoa${naLista === 1 ? ' espera' : 's esperam'} notícias da filial. Escreva a primeira: assunto, texto e pronto.`
              : 'Quando houver gente na lista, é aqui que você escreve para ela.'}
          </p>
          <Button className="mt-5 h-12 px-5 text-base" render={<Link href="/newsletter/nova" />}>
            <PenLine className="size-5" />Escrever a primeira edição
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {edicoes.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-base font-medium leading-snug">{e.assunto}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {e.quando ? dataCurta(e.quando) : '—'}
                  {e.destinatarios ? ` · ${e.destinatarios}` : ''}
                </p>
                {e.erro && <p className="mt-1 text-sm text-destructive">{e.erro}</p>}
              </div>
              <span className={cn(
                'shrink-0 rounded-md px-2 py-0.5 text-xs font-medium',
                e.estado === 'publicada' ? 'bg-success/14 text-success'
                  : e.estado === 'na_fila' ? 'bg-info/12 text-info'
                  : e.estado === 'falhou' ? 'bg-destructive/12 text-destructive'
                  : 'bg-secondary text-secondary-foreground',
              )}>
                {ROTULO_DA_EDICAO[e.estado] ?? e.estado}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
        A notícia que também vai para o site e para as redes continua saindo por{' '}
        <Link href="/redes" className="font-medium text-foreground underline underline-offset-2">Publicações</Link>, com a Newsletter como um dos destinos.
      </p>
    </Card>
  )
}

/** A situação da edição, em palavras de quem lê (os nomes do banco são os do pacote de Publicações). */
const ROTULO_DA_EDICAO: Record<string, string> = {
  publicada: 'Enviada',
  na_fila: 'Agendada',
  falhou: 'Falhou',
  publicando: 'Enviando…',
  gerada: 'Rascunho',
  em_ajuste: 'Rascunho',
  pronta: 'Pronta para sair',
  bloqueada: 'Bloqueada',
  ignorada: 'Fora desta rodada',
}
