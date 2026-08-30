'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Bold, Check, CircleAlert, Clock, Globe, Heading2, ImagePlus, Italic,
  Link2, List, Loader2, Pencil, Plus, Quote, RefreshCw, Rocket, Trash2, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ADAPTERS, adapter, formatoDoAdapter, type Aviso, type CampoExtra } from '@/lib/publicacao/canais'
import { contar } from '@/lib/publicacao/contagem'
import { validarVariante, temErro } from '@/lib/publicacao/variantes'
import { montarPaginaDoArtigo } from '@/lib/site/artigo-html'
import { mediaToken, parseMediaLine } from '@/lib/content-blocks'
import {
  adicionarDestino, arquivarPacote, enviarPacoteParaAprovacao, estimarCota, marcarPronta,
  publicarPacote, realimentarDestino, regenerarVariantes, removerDestino, reprocessarDestino,
  salvarMestre, salvarVariante,
} from '@/app/actions/pacotes'
import { SeletorDeRevisores, type PessoaDoEspaco } from '@/components/app/seletor-de-revisores'
import type { ArquivoDaBiblioteca, DestinoRegistro, PacoteRegistro } from './tipos'

/**
 * O hub de criação multicanal: Mestre → Destinos → Variantes.
 *
 * Quatro regiões, como no spec: cabeçalho do pacote, trilho de destinos,
 * editor (tabs Mestre/Canal) com preview ao lado, e a barra de ação. Todos os
 * limites e campos vêm dos adapters — esta tela não hardcoda canal nenhum.
 */

const SEMAFORO: Record<string, { classe: string; rotulo: string }> = {
  gerada: { classe: 'bg-muted-foreground/40', rotulo: 'gerada, revise antes de publicar' },
  em_ajuste: { classe: 'bg-amber-500', rotulo: 'em ajuste — há erro na variante' },
  pronta: { classe: 'bg-emerald-500', rotulo: 'pronta para publicar' },
  bloqueada: { classe: 'bg-destructive', rotulo: 'bloqueada — falta algo essencial' },
  ignorada: { classe: 'bg-muted-foreground/20', rotulo: 'ignorada neste pacote' },
  na_fila: { classe: 'bg-sky-500', rotulo: 'agendada' },
  publicando: { classe: 'bg-sky-500 animate-pulse', rotulo: 'publicando…' },
  publicada: { classe: 'bg-emerald-600', rotulo: 'publicada' },
  falhou: { classe: 'bg-destructive', rotulo: 'falhou — reprocesse' },
}

function proporcaoNumerica(rotulo: string): number {
  const m = /^([\d.]+):([\d.]+)$/.exec(rotulo)
  if (!m) return 1
  return parseFloat(m[1]) / parseFloat(m[2])
}

export function PacoteHub({ pacote: inicial, destinos: destinosIniciais, pessoas = [] }: {
  pacote: PacoteRegistro
  destinos: DestinoRegistro[]
  pessoas?: PessoaDoEspaco[]
}) {
  const router = useRouter()
  const [enviando, iniciar] = useTransition()

  const [tituloInterno, setTituloInterno] = useState(inicial.tituloInterno)
  const [mestre, setMestre] = useState(inicial.mestre)
  const [fileIds, setFileIds] = useState<string[]>(inicial.fileIds)
  const [agendarPara, setAgendarPara] = useState(inicial.agendarPara)
  const [destinos, setDestinos] = useState<DestinoRegistro[]>(destinosIniciais)
  const [ativo, setAtivo] = useState<string>('mestre')
  const [salvo, setSalvo] = useState<'ok' | 'salvando' | 'pendente'>('ok')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [conectadas, setConectadas] = useState<string[] | null>(null)
  const [biblioteca, setBiblioteca] = useState<ArquivoDaBiblioteca[]>([])
  const [modalPublicar, setModalPublicar] = useState<null | { grupos: number | null }>(null)
  const [incluidos, setIncluidos] = useState<string[]>([])
  const [modalAprovacao, setModalAprovacao] = useState(false)
  const [revisores, setRevisores] = useState<string[]>([])
  const [adicionando, setAdicionando] = useState(false)
  const blocoAdicionar = useRef<HTMLDivElement>(null)

  // Popover que só fecha no X obriga a mira num alvo de 14px e prende quem
  // navega pelo teclado. O bloco inteiro entra no ref para o clique no
  // próprio botão continuar alternando, em vez de fechar e reabrir.
  useEffect(() => {
    if (!adicionando) return
    function foraDaCaixa(evento: MouseEvent) {
      if (!blocoAdicionar.current?.contains(evento.target as Node)) setAdicionando(false)
    }
    function noEscape(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAdicionando(false)
    }
    document.addEventListener('mousedown', foraDaCaixa)
    document.addEventListener('keydown', noEscape)
    return () => {
      document.removeEventListener('mousedown', foraDaCaixa)
      document.removeEventListener('keydown', noEscape)
    }
  }, [adicionando])

  const encerrado = ['publicado', 'arquivado'].includes(inicial.status)

  useEffect(() => {
    fetch('/api/redes/conectadas', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setConectadas(d.redes ?? []))
      .catch(() => setConectadas([]))
    fetch('/api/redes/imagens', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setBiblioteca(d.arquivos ?? []))
      .catch(() => setBiblioteca([]))
  }, [])

  const arquivoPorId = useMemo(() => new Map(biblioteca.map((a) => [a.id, a])), [biblioteca])
  const destinoAtivo = destinos.find((d) => d.id === ativo) ?? null

  // ---------- autosave ----------
  const salvarAgora = useCallback(async () => {
    setSalvo('salvando')
    const form = new FormData()
    form.set('pacoteId', inicial.id)
    form.set('tituloInterno', tituloInterno)
    form.set('corpo', mestre.corpo)
    form.set('titulo', mestre.titulo)
    form.set('subtitulo', mestre.subtitulo)
    form.set('linkUrl', mestre.linkUrl)
    form.set('notas', mestre.notas)
    form.set('agendarPara', agendarPara)
    for (const id of fileIds) form.append('fileIds', id)
    const r = await salvarMestre(form)
    if (r.erro) { setErro(r.erro); setSalvo('pendente'); return }
    setSalvo('ok')
  }, [inicial.id, tituloInterno, mestre, fileIds, agendarPara])

  const primeiraRenderizacao = useRef(true)
  useEffect(() => {
    if (primeiraRenderizacao.current) { primeiraRenderizacao.current = false; return }
    if (encerrado) return
    setSalvo('pendente')
    const timer = setTimeout(() => { salvarAgora() }, 4000)
    return () => clearTimeout(timer)
  }, [tituloInterno, mestre, fileIds, agendarPara, salvarAgora, encerrado])

  const salvarVarianteAgora = useCallback(async (d: DestinoRegistro) => {
    const form = new FormData()
    form.set('destinoId', d.id)
    form.set('corpo', d.corpo)
    form.set('extras', JSON.stringify(d.extras))
    form.set('crops', JSON.stringify(d.crops))
    form.set('agendarPara', d.agendarPara)
    for (const id of d.fileIds) form.append('fileIds', id)
    const r = await salvarVariante(form)
    if (r.erro) setErro(r.erro)
  }, [])

  const varianteSuja = useRef<string | null>(null)

  // router.refresh() traz props novas, mas useState não reinicializa com elas:
  // sem esta sincronização, um destino criado no servidor nunca aparecia no
  // trilho ("0/0") e o segundo clique dava "já está neste pacote".
  useEffect(() => {
    setDestinos((atual) =>
      destinosIniciais.map((doServidor) => {
        const local = atual.find((d) => d.id === doServidor.id)
        // Edição ainda não salva vence a versão do servidor.
        return local && varianteSuja.current === doServidor.id ? local : doServidor
      }),
    )
  }, [destinosIniciais])

  /** Salva a variante ativa só se houver edição pendente. Salvar sem mudança
   *  antes de publicar era o que rebaixava um destino pronto para "gerada". */
  const salvarSeSuja = useCallback(async (d: DestinoRegistro | null) => {
    if (!d || varianteSuja.current !== d.id) return
    varianteSuja.current = null
    await salvarVarianteAgora(d)
  }, [salvarVarianteAgora])
  useEffect(() => {
    if (!destinoAtivo || !varianteSuja.current || varianteSuja.current !== destinoAtivo.id) return
    const alvo = destinoAtivo
    const timer = setTimeout(() => { salvarVarianteAgora(alvo); varianteSuja.current = null }, 4000)
    return () => clearTimeout(timer)
  }, [destinos, destinoAtivo, salvarVarianteAgora])

  function editarVariante(id: string, mudanca: Partial<DestinoRegistro>) {
    varianteSuja.current = id
    setDestinos((atual) => atual.map((d) => (d.id === id ? { ...d, ...mudanca, descolada: true } : d)))
  }

  // ---------- destinos ----------
  async function adicionar(canalId: string, formatoId: string) {
    setErro(''); setAdicionando(false)
    // Garante que a variante nasce do mestre atual, não do último salvo.
    await salvarAgora()
    const form = new FormData()
    form.set('pacoteId', inicial.id)
    form.set('canal', canalId)
    form.set('formato', formatoId)
    const r = await adicionarDestino(form)
    if (r.erro) { setErro(r.erro); return }
    router.refresh()
    if (r.id) setAtivo(r.id)
  }

  async function remover(d: DestinoRegistro) {
    if (!confirm(`Remover ${nomeDoDestino(d)} deste pacote?`)) return
    const form = new FormData()
    form.set('destinoId', d.id)
    const r = await removerDestino(form)
    if (r.erro) { setErro(r.erro); return }
    setDestinos((atual) => atual.filter((x) => x.id !== d.id))
    if (ativo === d.id) setAtivo('mestre')
    router.refresh()
  }

  async function regenerar() {
    setErro(''); setAviso('')
    await salvarAgora()
    const form = new FormData()
    form.set('pacoteId', inicial.id)
    const r = await regenerarVariantes(form)
    if (r.erro) { setErro(r.erro); return }
    setAviso('Variantes regeneradas. As editadas à mão não foram tocadas.')
    router.refresh()
  }

  async function pronta(d: DestinoRegistro) {
    setErro('')
    await salvarSeSuja(d)
    const form = new FormData()
    form.set('destinoId', d.id)
    const r = await marcarPronta(form)
    if (r.erro) { setErro(r.erro); return }
    setDestinos((atual) => atual.map((x) => (x.id === d.id ? { ...x, estado: 'pronta' } : x)))
  }

  async function realimentar(d: DestinoRegistro) {
    const form = new FormData()
    form.set('destinoId', d.id)
    const r = await realimentarDestino(form)
    if (r.erro) { setErro(r.erro); return }
    router.refresh()
  }

  async function reprocessar(d: DestinoRegistro) {
    setErro('')
    const form = new FormData()
    form.set('destinoId', d.id)
    iniciar(async () => {
      const r = await reprocessarDestino(form)
      if (r.erro) { setErro(r.erro); return }
      router.refresh()
    })
  }

  async function pedirAprovacao() {
    setErro(''); setAviso('')
    await salvarAgora()
    await salvarSeSuja(destinoAtivo)
    const form = new FormData()
    form.set('pacoteId', inicial.id)
    for (const id of revisores) form.append('aprovadores', id)
    const r = await enviarPacoteParaAprovacao(form)
    if (r.erro) { setErro(r.erro); return }
    setModalAprovacao(false)
    setAviso('Enviado para aprovação. O pacote inteiro — site e redes — aparece na tela de Aprovações de quem você marcou.')
    router.refresh()
  }

  // ---------- publicar ----------
  // Sem erro na validação = elegível para ir junto, mesmo sem o clique em
  // "marcar como pronta". Foi o buraco do primeiro teste real: o site ficou
  // para trás em silêncio.
  const elegiveis = destinos.filter((d) =>
    ['gerada', 'em_ajuste'].includes(d.estado)
    && !temErro(validarVariante({ corpo: d.corpo, extras: d.extras, fileIds: d.fileIds }, d.canal, d.formato)))
  const barrados = destinos.filter((d) =>
    ['gerada', 'em_ajuste', 'bloqueada'].includes(d.estado)
    && temErro(validarVariante({ corpo: d.corpo, extras: d.extras, fileIds: d.fileIds }, d.canal, d.formato)))

  async function estimar(ids: string[]) {
    const form = new FormData()
    form.set('pacoteId', inicial.id)
    for (const id of ids) form.append('incluir', id)
    const r = await estimarCota(form)
    if (r.erro) {
      // Sem isto o modal ficava preso em "Calculando a cota…" para sempre.
      setModalPublicar(null)
      setErro(r.erro)
      return
    }
    setModalPublicar({ grupos: r.grupos ?? 0 })
  }

  async function abrirModalPublicar() {
    setErro('')
    await salvarAgora()
    await salvarSeSuja(destinoAtivo)
    const marcados = elegiveis.map((d) => d.id)
    setIncluidos(marcados)
    setModalPublicar({ grupos: null })
    await estimar(marcados)
  }

  function alternarIncluido(id: string) {
    const proximos = incluidos.includes(id) ? incluidos.filter((x) => x !== id) : [...incluidos, id]
    setIncluidos(proximos)
    estimar(proximos)
  }

  function publicar() {
    const form = new FormData()
    form.set('pacoteId', inicial.id)
    for (const id of incluidos) form.append('incluir', id)
    setModalPublicar(null)
    iniciar(async () => {
      const r = await publicarPacote(form)
      if (r.erro) { setErro(r.erro); return }
      setAviso(
        r.falhas
          ? `${r.publicados} destino(s) publicados, ${r.falhas} falharam. Veja o motivo em cada card e reprocesse.`
          : `${r.publicados} destino(s) publicados.`,
      )
      router.refresh()
    })
  }

  const prontos = destinos.filter((d) => d.estado === 'pronta').length
  const publicadas = destinos.filter((d) => d.estado === 'publicada').length
  const comAlerta = destinos.filter((d) => ['em_ajuste', 'bloqueada', 'falhou'].includes(d.estado)).length

  return (
    <div className="flex flex-col gap-4 pb-24">
      {/* Região 0 — cabeçalho do pacote */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/redes" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" />Redes Sociais
          </Link>
          <span className="text-xs text-muted-foreground">/</span>
          <input
            value={tituloInterno}
            onChange={(e) => setTituloInterno(e.target.value)}
            placeholder="Nome interno do pacote (não é publicado)"
            disabled={encerrado}
            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold outline-none focus:border-border focus:bg-background sm:w-80"
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{prontos + publicadas}/{destinos.length || 0} prontos</span>
          {!encerrado && (
            <button type="button" onClick={async () => { const f = new FormData(); f.set('pacoteId', inicial.id); const r = await arquivarPacote(f); if (r.erro) setErro(r.erro); else router.push('/redes') }} className="hover:text-foreground">
              Arquivar
            </button>
          )}
        </div>
      </div>

      {/* Região 1 — trilho de destinos.
          O trilho rola na horizontal, mas o botão de adicionar fica FORA dessa
          área: overflow recorta filho posicionado, e o popover aberto de dentro
          dela aparecia espremido na altura do trilho, com barra de rolagem
          própria. Do lado de fora ele abre inteiro — e ainda fica sempre à
          vista, em vez de sumir quando há muitos destinos. */}
      <div className="flex items-stretch gap-2">
      <div className="flex min-w-0 flex-1 items-stretch gap-2 overflow-x-auto pb-1">
        <TrilhoCard ativo={ativo === 'mestre'} onClick={() => setAtivo('mestre')}>
          <span className="text-xs font-semibold uppercase tracking-wide">Mestre</span>
          <span className="text-[11px] text-muted-foreground">texto canônico</span>
        </TrilhoCard>
        {destinos.map((d) => {
          const sem = SEMAFORO[d.estado] ?? SEMAFORO.gerada
          return (
            <TrilhoCard key={d.id} ativo={ativo === d.id} onClick={() => setAtivo(d.id)} title={sem.rotulo}>
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <span className={`size-2 rounded-full ${sem.classe}`} />
                {d.canal === 'site_web' && <Globe className="size-3" />}
                {adapter(d.canal)?.nome ?? d.canal}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                {formatoDoAdapter(adapter(d.canal)!, d.formato)?.rotulo ?? d.formato}
                {d.descolada && <Pencil className="size-2.5" aria-label="editada à mão" />}
              </span>
              {!encerrado && !['publicada', 'publicando'].includes(d.estado) && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); remover(d) }}
                  className="absolute -right-1.5 -top-1.5 hidden rounded-full border border-border bg-background p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
                  aria-label="Remover destino"
                >
                  <X className="size-3" />
                </button>
              )}
            </TrilhoCard>
          )
        })}
      </div>
        {!encerrado && (
          <div className="relative shrink-0 pb-1" ref={blocoAdicionar}>
            <TrilhoCard ativo={adicionando} onClick={() => setAdicionando((v) => !v)}>
              <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><Plus className="size-3.5" />Adicionar destino</span>
            </TrilhoCard>
            {adicionando && (
              <PopoverDestinos
                conectadas={conectadas}
                jaExistem={destinos.map((d) => `${d.canal}:${d.formato}`)}
                onEscolher={adicionar}
                onFechar={() => setAdicionando(false)}
              />
            )}
          </div>
        )}
      </div>

      {/* Região 2 — editor + preview */}
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="min-w-0 p-5">
          {ativo === 'mestre' || !destinoAtivo ? (
            <EditorMestre
              mestre={mestre}
              onMudar={(m) => setMestre(m)}
              fileIds={fileIds}
              onFileIds={setFileIds}
              biblioteca={biblioteca}
              agendarPara={agendarPara}
              onAgendarPara={setAgendarPara}
              onRegenerar={regenerar}
              temDestinos={destinos.length > 0}
              encerrado={encerrado}
            />
          ) : (
            <EditorCanal
              destino={destinoAtivo}
              arquivoPorId={arquivoPorId}
              fileIdsDoMestre={fileIds}
              onEditar={(mudanca) => editarVariante(destinoAtivo.id, mudanca)}
              onPronta={() => pronta(destinoAtivo)}
              onRealimentar={() => realimentar(destinoAtivo)}
              onReprocessar={() => reprocessar(destinoAtivo)}
              encerrado={encerrado}
            />
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <PreviaDestino destino={destinoAtivo} arquivoPorId={arquivoPorId} mestre={mestre} />
          {destinoAtivo && <ValidacaoDoDestino destino={destinoAtivo} />}
          {destinos.length > 1 && (
            <Card className="p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Como vai sair nas outras</p>
              <div className="flex flex-col gap-1.5">
                {destinos.filter((d) => d.id !== ativo).map((d) => (
                  <button key={d.id} type="button" onClick={() => setAtivo(d.id)} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted">
                    <span className={`size-2 shrink-0 rounded-full ${(SEMAFORO[d.estado] ?? SEMAFORO.gerada).classe}`} />
                    <span className="font-medium">{nomeDoDestino(d)}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.canal === 'site_web' ? d.extras.titulo : d.corpo.slice(0, 60)}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Região 3 — barra de ação. Erros e avisos moram aqui, colados nos
          botões que os causaram — no topo da página eles passavam batidos
          ou pareciam vir de outro lugar. */}
      <div className="sticky bottom-0 z-40 -mx-1 rounded-t-lg border border-border bg-background/95 backdrop-blur">
        {erro && (
          <div className="flex items-start justify-between gap-3 border-b border-destructive/30 bg-destructive/5 px-4 py-2">
            <p className="text-sm text-destructive">{erro}</p>
            <button type="button" onClick={() => setErro('')} aria-label="Dispensar erro" className="mt-0.5 text-destructive/70 hover:text-destructive"><X className="size-3.5" /></button>
          </div>
        )}
        {aviso && !erro && (
          <div className="flex items-start justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2">
            <p className="text-sm text-muted-foreground">{aviso}</p>
            <button type="button" onClick={() => setAviso('')} aria-label="Dispensar aviso" className="mt-0.5 text-muted-foreground/70 hover:text-muted-foreground"><X className="size-3.5" /></button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {salvo === 'ok' ? <><Check className="size-3.5 text-emerald-600" />Salvo</>
              : salvo === 'salvando' ? <><Loader2 className="size-3.5 animate-spin" />Salvando…</>
                : <><Clock className="size-3.5" />Alterações pendentes</>}
          </span>
          <span className="text-xs text-muted-foreground">
            {prontos} pronto{prontos === 1 ? '' : 's'}{publicadas ? ` · ${publicadas} publicado${publicadas === 1 ? '' : 's'}` : ''}{comAlerta ? ` · ${comAlerta} com alerta` : ''}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setModalAprovacao(true)} disabled={enviando || encerrado || destinos.length === 0 || inicial.status === 'em_aprovacao'}>
              {inicial.status === 'em_aprovacao' ? 'Em aprovação' : 'Pedir aprovação'}
            </Button>
            <Button onClick={abrirModalPublicar} disabled={enviando || encerrado || (prontos === 0 && elegiveis.length === 0)}>
              <Rocket className="size-4" />
              {enviando ? 'Publicando…' : agendarPara ? 'Agendar prontos' : 'Publicar prontos'}
            </Button>
          </div>
        </div>
      </div>

      {modalAprovacao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="dialog" aria-modal="true">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-lg font-semibold">Enviar para aprovação</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Quem você marcar recebe o pacote inteiro para revisar — a página do site e cada post, como vão sair.
            </p>
            <div className="mt-4">
              <SeletorDeRevisores pessoas={pessoas} selecionados={revisores} onChange={setRevisores} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setModalAprovacao(false)}>Cancelar</Button>
              <Button onClick={pedirAprovacao} disabled={!revisores.length}>Enviar</Button>
            </div>
          </Card>
        </div>
      )}

      {modalPublicar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="dialog" aria-modal="true">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-lg font-semibold">Confirmar publicação</h2>
            <p className="mt-2 text-sm text-muted-foreground">Vai sair agora{agendarPara ? ' (agendado)' : ''}:</p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {destinos.filter((d) => d.estado === 'pronta').map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-sm">
                  <Check className="size-4 text-emerald-600" />{nomeDoDestino(d)}
                </li>
              ))}
              {elegiveis.map((d) => (
                <li key={d.id}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={incluidos.includes(d.id)}
                      onChange={() => alternarIncluido(d.id)}
                      className="size-4 accent-primary"
                    />
                    {nomeDoDestino(d)}
                    <span className="text-xs text-muted-foreground">— sem pendências, vai junto</span>
                  </label>
                </li>
              ))}
            </ul>
            {barrados.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Ficam de fora, com pendência:</p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {barrados.map((d) => (
                    <li key={d.id} className="text-xs text-amber-700 dark:text-amber-400">
                      {nomeDoDestino(d)} — corrija a validação para incluir.
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-4 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {modalPublicar.grupos === null
                ? 'Calculando a cota…'
                : <>Este envio consome <strong className="text-foreground">{modalPublicar.grupos} publicaç{modalPublicar.grupos === 1 ? 'ão' : 'ões'}</strong> do plano do Upload-Post
                  {[...destinos.filter((d) => d.estado === 'pronta'), ...elegiveis.filter((d) => incluidos.includes(d.id))].some((d) => d.canal === 'site_web') ? ' (o site não conta na cota)' : ''}.
                  {' '}Destinos com o mesmo texto e mídia saem numa chamada só.</>}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setModalPublicar(null)}>Cancelar</Button>
              <Button onClick={publicar} disabled={modalPublicar.grupos === null || (destinos.filter((d) => d.estado === 'pronta').length + incluidos.length === 0)}><Rocket className="size-4" />Confirmar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

function nomeDoDestino(d: DestinoRegistro): string {
  const canal = adapter(d.canal)
  const formato = canal ? formatoDoAdapter(canal, d.formato) : undefined
  return `${canal?.nome ?? d.canal} · ${formato?.rotulo ?? d.formato}`
}

function TrilhoCard({ ativo, onClick, title, children }: {
  ativo: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`group relative flex min-w-32 shrink-0 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors ${
        ativo ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:bg-muted/50'
      }`}
    >
      {children}
    </button>
  )
}

/** Tira acento e caixa: quem procura "grafica" acha "Google Meu Negócio". */
function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function PopoverDestinos({ conectadas, jaExistem, onEscolher, onFechar }: {
  conectadas: string[] | null
  jaExistem: string[]
  onEscolher: (canal: string, formato: string) => void
  onFechar: () => void
}) {
  const [busca, setBusca] = useState('')
  const campoRef = useRef<HTMLInputElement>(null)

  // Abrir já digitando poupa o passo de mirar no campo com o mouse.
  useEffect(() => { campoRef.current?.focus() }, [])

  const canais = useMemo(() => {
    const termo = semAcento(busca.trim())
    return ADAPTERS
      .map((canal) => {
        const conectado = canal.id === 'site_web' || conectadas === null || conectadas.includes(canal.id)
        // Buscar pelo nome do canal traz todos os formatos dele; buscar por um
        // formato ("reels") traz só o formato procurado.
        const canalCasa = !termo || semAcento(canal.nome).includes(termo)
        const formatos = canal.formatos.filter((f) => canalCasa || semAcento(f.rotulo).includes(termo))
        return { canal, conectado, formatos }
      })
      .filter((linha) => linha.formatos.length > 0)
      // Conta conectada primeiro: o que dá para usar agora fica no alcance da
      // vista, e o que exige conectar antes desce para o fim da lista.
      .sort((a, b) => Number(b.conectado) - Number(a.conectado))
  }, [busca, conectadas])

  const disponiveis = canais.filter((l) => l.conectado)
    .flatMap((l) => l.formatos.filter((f) => !jaExistem.includes(`${l.canal.id}:${f.id}`)))

  return (
    <div className="absolute right-0 top-full z-30 mt-2 w-80 rounded-lg border border-border bg-background p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Novo destino</p>
        <button type="button" onClick={onFechar} aria-label="Fechar"><X className="size-3.5 text-muted-foreground" /></button>
      </div>

      <input
        ref={campoRef}
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        onKeyDown={(e) => {
          // Enter com um único candidato à vista adiciona sem tirar a mão do teclado.
          if (e.key === 'Enter' && disponiveis.length === 1) {
            const linha = canais.find((l) => l.conectado && l.formatos.includes(disponiveis[0]))
            if (linha) onEscolher(linha.canal.id, disponiveis[0].id)
          }
        }}
        placeholder="Buscar canal ou formato…"
        className="mb-2 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
      />

      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {canais.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">Nenhum canal ou formato com “{busca}”.</p>
        )}
        {canais.map(({ canal, conectado, formatos }) => (
          <div key={canal.id}>
            <p className={`flex items-center gap-1 text-xs font-medium ${conectado ? '' : 'text-muted-foreground'}`}>
              {canal.id === 'site_web' && <Globe className="size-3" />}
              {canal.nome}{!conectado && ' — conta não conectada'}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {formatos.map((f) => {
                const existe = jaExistem.includes(`${canal.id}:${f.id}`)
                return (
                  <button
                    key={f.id}
                    type="button"
                    disabled={!conectado || existe}
                    onClick={() => onEscolher(canal.id, f.id)}
                    title={existe ? 'Já está neste pacote' : !conectado ? 'Conecte a conta em Redes Sociais' : `Adicionar ${canal.nome} · ${f.rotulo}`}
                    className="rounded-full border border-border px-2.5 py-1 text-xs transition-colors hover:border-primary hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border"
                  >
                    {f.rotulo}{existe && ' ✓'}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- editores

const inputClass = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

function EditorMestre({ mestre, onMudar, fileIds, onFileIds, biblioteca, agendarPara, onAgendarPara, onRegenerar, temDestinos, encerrado }: {
  mestre: { corpo: string; titulo: string; subtitulo: string; linkUrl: string; notas: string }
  onMudar: (m: EditorMestreProps) => void
  fileIds: string[]
  onFileIds: (ids: string[]) => void
  biblioteca: ArquivoDaBiblioteca[]
  agendarPara: string
  onAgendarPara: (v: string) => void
  onRegenerar: () => void
  temDestinos: boolean
  encerrado: boolean
}) {
  const muda = (campo: keyof typeof mestre) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onMudar({ ...mestre, [campo]: e.target.value })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Texto-mestre</h2>
        {temDestinos && !encerrado && (
          <Button size="sm" variant="outline" onClick={onRegenerar}>
            <RefreshCw className="size-3.5" />Regenerar variantes
          </Button>
        )}
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Escreva uma vez, longo e completo. Cada destino recebe uma versão adaptada ao limite daquele canal — e você ajusta
        cada uma antes de publicar. O mestre nunca vai direto para a API.
      </p>

      <label className="text-sm font-medium">Título
        <input value={mestre.titulo} onChange={muda('titulo')} disabled={encerrado} placeholder="Vira o título da página no site e o título do pin" className={`mt-1 ${inputClass}`} />
      </label>
      <label className="text-sm font-medium">Linha fina <span className="font-normal text-muted-foreground">(opcional)</span>
        <input value={mestre.subtitulo} onChange={muda('subtitulo')} disabled={encerrado} className={`mt-1 ${inputClass}`} />
      </label>
      <label className="text-sm font-medium">Texto
        <textarea value={mestre.corpo} onChange={muda('corpo')} rows={10} disabled={encerrado} className={`mt-1 ${inputClass}`} />
        <span className="mt-1 block text-xs font-normal text-muted-foreground">
          Hashtags no fim do texto são movidas automaticamente quando o canal aperta. Escreva {'{{URL_DA_MATERIA}}'} onde o
          endereço da página do site deve entrar — ele é preenchido na hora da publicação.
        </span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Link já existente <span className="font-normal text-muted-foreground">(opcional)</span>
          <input value={mestre.linkUrl} onChange={muda('linkUrl')} disabled={encerrado} placeholder="https://…" className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-sm font-medium">Agendar o pacote <span className="font-normal text-muted-foreground">(opcional)</span>
          <input type="datetime-local" value={agendarPara} onChange={(e) => onAgendarPara(e.target.value)} disabled={encerrado} className={`mt-1 ${inputClass}`} />
          <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">Horário de Brasília. Cada destino pode ter o seu.</span>
        </label>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Mídias do pacote</p>
        <GradeDaBiblioteca biblioteca={biblioteca} selecionados={fileIds} onMudar={onFileIds} limite={10} desabilitado={encerrado} />
      </div>

      <label className="text-sm font-medium">Notas para quem aprova <span className="font-normal text-muted-foreground">(não são publicadas)</span>
        <textarea value={mestre.notas} onChange={muda('notas')} rows={2} disabled={encerrado} className={`mt-1 ${inputClass}`} />
      </label>
    </div>
  )
}
type EditorMestreProps = { corpo: string; titulo: string; subtitulo: string; linkUrl: string; notas: string }

function GradeDaBiblioteca({ biblioteca, selecionados, onMudar, limite, desabilitado, filtroTipo }: {
  biblioteca: ArquivoDaBiblioteca[]
  selecionados: string[]
  onMudar: (ids: string[]) => void
  limite: number
  desabilitado?: boolean
  filtroTipo?: 'foto' | 'video'
}) {
  const lista = filtroTipo ? biblioteca.filter((a) => a.tipo === filtroTipo) : biblioteca
  function alternar(id: string) {
    if (desabilitado) return
    if (selecionados.includes(id)) { onMudar(selecionados.filter((x) => x !== id)); return }
    if (selecionados.length >= limite) return
    onMudar([...selecionados, id])
  }
  if (!lista.length) {
    return <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
      Nenhum arquivo autorizado na Biblioteca. Envie por lá e marque a autorização de uso de imagem.
    </p>
  }
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {lista.map((a) => {
        const ordem = selecionados.indexOf(a.id)
        return (
          <button key={a.id} type="button" onClick={() => alternar(a.id)} disabled={desabilitado}
            className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-colors ${ordem >= 0 ? 'border-primary' : 'border-transparent hover:border-border'}`}
            title={a.nome}
          >
            {a.tipo === 'video'
              ? <video src={a.previa} muted playsInline preload="metadata" className="size-full object-cover" />
              : <img src={a.previa} alt={a.nome} className="size-full object-cover" />}
            {ordem >= 0 && (
              <span className="absolute left-1 top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{ordem + 1}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function EditorCanal({ destino, arquivoPorId, fileIdsDoMestre, onEditar, onPronta, onRealimentar, onReprocessar, encerrado }: {
  destino: DestinoRegistro
  arquivoPorId: Map<string, ArquivoDaBiblioteca>
  fileIdsDoMestre: string[]
  onEditar: (mudanca: Partial<DestinoRegistro>) => void
  onPronta: () => void
  onRealimentar: () => void
  onReprocessar: () => void
  encerrado: boolean
}) {
  const canal = adapter(destino.canal)!
  const formato = formatoDoAdapter(canal, destino.formato)!
  const congelado = encerrado || ['publicada', 'publicando'].includes(destino.estado)
  const tamanho = contar(destino.corpo, formato.texto.unidade)
  const estourou = tamanho > formato.texto.max
  const eSite = destino.canal === 'site_web'
  const midiasDoMestre = fileIdsDoMestre.map((id) => arquivoPorId.get(id)).filter((a): a is ArquivoDaBiblioteca => Boolean(a))
  const camposVisiveis = canal.camposExtras.filter((c) => !c.formatos || c.formatos.includes(destino.formato))
  const proporcaoAlvo = proporcaoNumerica(formato.midia.proporcaoPreferida)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {eSite && <Globe className="size-4" />}
          {canal.nome} · {formato.rotulo}
          {destino.descolada && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">não acompanha mais o mestre</span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {destino.descolada && !congelado && (
            <Button size="sm" variant="ghost" onClick={onRealimentar} title="Descarta a edição e regenera do mestre">
              <RefreshCw className="size-3.5" />Realimentar do mestre
            </Button>
          )}
          {destino.estado === 'falhou' && (
            <Button size="sm" variant="outline" onClick={onReprocessar}><RefreshCw className="size-3.5" />Reprocessar</Button>
          )}
          {!congelado && destino.estado !== 'pronta' && (
            <Button size="sm" onClick={onPronta}><Check className="size-3.5" />Marcar como pronta</Button>
          )}
          {destino.estado === 'pronta' && <span className="flex items-center gap-1 text-xs font-medium text-emerald-600"><Check className="size-3.5" />Pronta</span>}
          {destino.estado === 'publicada' && (
            destino.externalUrl
              ? <a href={destino.externalUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-emerald-700 underline">Publicada — abrir</a>
              : <span className="text-xs font-medium text-emerald-700">Publicada</span>
          )}
        </div>
      </div>

      {destino.erro && destino.estado === 'falhou' && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{destino.erro}</p>
      )}
      {destino.erro && destino.estado === 'publicada' && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">{destino.erro}</p>
      )}

      <label className="text-sm font-medium">{eSite ? 'Texto da página' : 'Legenda'}
        {eSite ? (
          <div className="mt-1">
            <CampoDaMateria
              valor={destino.corpo}
              onMudar={(v) => onEditar({ corpo: v })}
              desabilitado={congelado}
              max={formato.texto.max}
              tamanho={tamanho}
              estourou={estourou}
            />
          </div>
        ) : (
        <div className="relative mt-1">
          <textarea
            value={destino.corpo}
            onChange={(e) => onEditar({ corpo: e.target.value })}
            rows={7}
            disabled={congelado}
            className={inputClass}
          />
          <span className={`pointer-events-none absolute bottom-2 right-2 rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-medium ${estourou ? 'text-destructive' : 'text-muted-foreground'}`}>
            {tamanho}/{formato.texto.max}
          </span>
        </div>
        )}
        {formato.texto.dobra && tamanho > formato.texto.dobra && !estourou && (
          <span className="mt-1 block text-xs font-normal text-amber-600 dark:text-amber-500">
            Acima de {formato.texto.dobra} o leitor vê "…mais" — o essencial precisa estar antes disso.
          </span>
        )}
      </label>

      {camposVisiveis.map((campo) => (
        <CampoExtraInput
          key={campo.chave}
          campo={campo}
          valor={destino.extras[campo.chave] ?? ''}
          onMudar={(v) => onEditar({ extras: { ...destino.extras, [campo.chave]: v } })}
          desabilitado={congelado}
        />
      ))}

      {formato.midia.max > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">
            Mídias deste destino <span className="font-normal text-muted-foreground">({formato.midia.min === 0 ? 'até' : `${formato.midia.min} a`} {formato.midia.max}{formato.midia.video === 'obrigatorio' ? ' · vídeo' : ''})</span>
          </p>
          {midiasDoMestre.length === 0 ? (
            <p className="text-xs text-muted-foreground">Adicione mídias na tab Mestre primeiro — os destinos escolhem entre elas.</p>
          ) : (
            <GradeDaBiblioteca
              biblioteca={midiasDoMestre}
              selecionados={destino.fileIds}
              onMudar={(ids) => onEditar({ fileIds: ids })}
              limite={formato.midia.max}
              desabilitado={congelado}
              filtroTipo={formato.midia.video === 'obrigatorio' ? 'video' : undefined}
            />
          )}
        </div>
      )}

      {!eSite && destino.fileIds.length > 0 && formato.midia.proporcaoPreferida !== 'livre' && (
        <RecorteControles
          destino={destino}
          arquivoPorId={arquivoPorId}
          proporcaoAlvo={proporcaoAlvo}
          rotuloProporcao={formato.midia.proporcaoPreferida}
          onEditar={onEditar}
          desabilitado={congelado}
        />
      )}

      <label className="text-sm font-medium">Horário deste destino <span className="font-normal text-muted-foreground">(vazio herda o do pacote)</span>
        <input
          type="datetime-local"
          value={destino.agendarPara}
          onChange={(e) => onEditar({ agendarPara: e.target.value })}
          disabled={congelado}
          className={`mt-1 ${inputClass} sm:w-64`}
        />
      </label>
    </div>
  )
}

/**
 * O campo de texto da matéria: barra de formatação, foto no meio do texto e
 * legenda/crédito por foto.
 *
 * Foto de notícia não é anexo: tem lugar no texto, legenda e crédito de quem
 * fotografou. Enquanto escolher da biblioteca era o único caminho, toda foto
 * caía antes do primeiro parágrafo ou depois do último — nunca ao lado do
 * trecho que ela ilustra.
 */
function CampoDaMateria({ valor, onMudar, desabilitado, max, tamanho, estourou }: {
  valor: string
  onMudar: (v: string) => void
  desabilitado: boolean
  max: number
  tamanho: number
  estourou: boolean
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  // Parágrafo é a unidade do formato: a linha de mídia mora sozinha em um.
  const paragrafos = useMemo(() => valor.split(/\n\n+/), [valor])
  const fotos = useMemo(
    () => paragrafos.flatMap((p, i) => {
      const midia = parseMediaLine(p)
      return midia ? [{ indice: i, ...midia }] : []
    }),
    [paragrafos],
  )

  function focarEm(inicio: number, fim: number) {
    requestAnimationFrame(() => {
      const el = areaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(inicio, fim)
    })
  }

  /** Bloco próprio (foto, por ora) entra no ponto do cursor, isolado por linhas em branco. */
  function inserirBloco(bloco: string) {
    const posicao = areaRef.current?.selectionStart ?? valor.length
    const antes = valor.slice(0, posicao).replace(/\s+$/, '')
    const depois = valor.slice(posicao).replace(/^\s+/, '')
    onMudar(`${antes}${antes ? '\n\n' : ''}${bloco}${depois ? `\n\n${depois}` : '\n'}`)
    const fim = (antes ? antes.length + 2 : 0) + bloco.length
    focarEm(fim, fim)
  }

  function envolver(abre: string, fecha: string, exemplo: string) {
    const el = areaRef.current
    if (!el) return
    const i = el.selectionStart
    const f = el.selectionEnd
    const selecionado = valor.slice(i, f) || exemplo
    onMudar(valor.slice(0, i) + abre + selecionado + fecha + valor.slice(f))
    focarEm(i + abre.length, i + abre.length + selecionado.length)
  }

  function prefixarLinhas(prefixo: string) {
    const el = areaRef.current
    if (!el) return
    const inicio = valor.lastIndexOf('\n', el.selectionStart - 1) + 1
    const quebra = valor.indexOf('\n', el.selectionEnd)
    const fim = quebra === -1 ? valor.length : quebra
    const trecho = valor.slice(inicio, fim).split('\n')
      .map((linha) => (linha.startsWith(prefixo) ? linha : `${prefixo}${linha}`)).join('\n')
    onMudar(valor.slice(0, inicio) + trecho + valor.slice(fim))
    focarEm(inicio, inicio + trecho.length)
  }

  function inserirLink() {
    const el = areaRef.current
    if (!el) return
    const endereco = window.prompt('Endereço do link (https://…)')
    if (!endereco) return
    const i = el.selectionStart
    const f = el.selectionEnd
    const texto = valor.slice(i, f) || 'texto do link'
    onMudar(`${valor.slice(0, i)}[${texto}](${endereco})${valor.slice(f)}`)
    focarEm(i + 1, i + 1 + texto.length)
  }

  async function subirFoto(arquivo: File) {
    setErro('')
    setEnviando(true)
    try {
      const dados = new FormData()
      dados.set('file', arquivo)
      dados.set('tags', 'materia')
      const resposta = await fetch('/api/files/upload', { method: 'POST', body: dados })
      const resultado = await resposta.json()
      if (!resposta.ok) throw new Error(resultado.error || 'Não foi possível enviar a foto.')
      // A foto entra sem legenda de propósito: o nome do arquivo ("IMG_2043")
      // viraria legenda na página. O painel abaixo pede o texto de verdade.
      inserirBloco(mediaToken('image', `/api/private-blob?pathname=${encodeURIComponent(resultado.storagePath)}`, ''))
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não foi possível enviar a foto.')
    } finally {
      setEnviando(false)
    }
  }

  function mudarFoto(indice: number, campos: { legenda?: string; credito?: string }) {
    const midia = parseMediaLine(paragrafos[indice])
    if (!midia) return
    const copia = [...paragrafos]
    copia[indice] = mediaToken(midia.tipo, midia.url, campos.legenda ?? midia.alt, campos.credito ?? midia.credito)
    onMudar(copia.join('\n\n'))
  }

  function tirarFoto(indice: number) {
    onMudar(paragrafos.filter((_, i) => i !== indice).join('\n\n'))
  }

  const botao = 'inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-40'

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <button type="button" className={botao} disabled={desabilitado || enviando} onClick={() => arquivoRef.current?.click()}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
          {enviando ? 'Enviando…' : 'Foto'}
        </button>
        <span className="mx-1 h-4 w-px bg-border" />
        <button type="button" className={botao} disabled={desabilitado} onClick={() => prefixarLinhas('## ')}><Heading2 className="size-3.5" />Intertítulo</button>
        <button type="button" className={botao} disabled={desabilitado} onClick={() => prefixarLinhas('> ')}><Quote className="size-3.5" />Citação</button>
        <button type="button" className={botao} disabled={desabilitado} onClick={() => prefixarLinhas('- ')}><List className="size-3.5" />Lista</button>
        <span className="mx-1 h-4 w-px bg-border" />
        <button type="button" className={botao} disabled={desabilitado} onClick={() => envolver('**', '**', 'negrito')} title="Negrito"><Bold className="size-3.5" /></button>
        <button type="button" className={botao} disabled={desabilitado} onClick={() => envolver('*', '*', 'itálico')} title="Itálico"><Italic className="size-3.5" /></button>
        <button type="button" className={botao} disabled={desabilitado} onClick={inserirLink} title="Link"><Link2 className="size-3.5" /></button>
      </div>

      <input
        ref={arquivoRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void subirFoto(f); e.target.value = '' }}
      />

      <div className="relative">
        <textarea
          ref={areaRef}
          value={valor}
          onChange={(e) => onMudar(e.target.value)}
          rows={14}
          disabled={desabilitado}
          className={inputClass}
        />
        <span className={`pointer-events-none absolute bottom-2 right-2 rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-medium ${estourou ? 'text-destructive' : 'text-muted-foreground'}`}>
          {tamanho}/{max}
        </span>
      </div>
      <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
        A foto fica onde você a inseriu. Se estiver antes do primeiro parágrafo, abre a matéria em destaque.
      </span>
      {erro && <p className="mt-1 text-xs text-destructive">{erro}</p>}

      {fotos.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fotos no texto</p>
          {fotos.map((foto) => (
            <div key={`${foto.indice}-${foto.url}`} className="flex items-start gap-3 rounded-lg border border-border p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto.url} alt="" className="size-16 shrink-0 rounded object-cover" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <input
                  value={foto.alt}
                  onChange={(e) => mudarFoto(foto.indice, { legenda: e.target.value })}
                  placeholder="Legenda — o que a foto mostra"
                  disabled={desabilitado}
                  className={inputClass}
                />
                <input
                  value={foto.credito}
                  onChange={(e) => mudarFoto(foto.indice, { credito: e.target.value })}
                  placeholder="Crédito — ex.: Ana Souza/CVB-RJ"
                  disabled={desabilitado}
                  className={inputClass}
                />
                {!foto.alt.trim() && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-500">
                    Sem legenda a foto sai muda para quem usa leitor de tela.
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => tirarFoto(foto.indice)}
                disabled={desabilitado}
                title="Tirar esta foto da matéria"
                className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CampoExtraInput({ campo, valor, onMudar, desabilitado }: {
  campo: CampoExtra
  valor: string
  onMudar: (v: string) => void
  desabilitado: boolean
}) {
  const inativo = desabilitado || Boolean(campo.indisponivel)
  return (
    <label className="text-sm font-medium">
      {campo.rotulo}
      {campo.tipo === 'textarea' ? (
        <textarea value={valor} onChange={(e) => onMudar(e.target.value)} rows={2} maxLength={campo.max} disabled={inativo} className={`mt-1 ${inputClass}`} />
      ) : campo.tipo === 'select' ? (
        <select value={valor} onChange={(e) => onMudar(e.target.value)} disabled={inativo} className={`mt-1 ${inputClass}`}>
          <option value="">—</option>
          {(campo.opcoes ?? []).map((o) => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input value={valor} onChange={(e) => onMudar(e.target.value)} maxLength={campo.max} disabled={inativo} className={`mt-1 ${inputClass}`} />
      )}
      {campo.indisponivel
        ? <span className="mt-0.5 block text-[11px] font-normal text-amber-600 dark:text-amber-500">{campo.indisponivel}</span>
        : campo.dica && <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{campo.dica}</span>}
    </label>
  )
}

function RecorteControles({ destino, arquivoPorId, proporcaoAlvo, rotuloProporcao, onEditar, desabilitado }: {
  destino: DestinoRegistro
  arquivoPorId: Map<string, ArquivoDaBiblioteca>
  proporcaoAlvo: number
  rotuloProporcao: string
  onEditar: (mudanca: Partial<DestinoRegistro>) => void
  desabilitado: boolean
}) {
  const [selecionado, setSelecionado] = useState(destino.fileIds[0] ?? '')
  const arquivo = arquivoPorId.get(selecionado)
  useEffect(() => {
    if (!destino.fileIds.includes(selecionado)) setSelecionado(destino.fileIds[0] ?? '')
  }, [destino.fileIds, selecionado])
  if (!arquivo || arquivo.tipo !== 'foto') return null

  const caixa = destino.crops[selecionado] ?? { fx: 0.5, fy: 0.5, ratio: proporcaoAlvo }
  const mudar = (campo: 'fx' | 'fy', v: number) =>
    onEditar({ crops: { ...destino.crops, [selecionado]: { ...caixa, ratio: proporcaoAlvo, [campo]: v } } })

  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Enquadramento {rotuloProporcao}
      </p>
      <div className="flex flex-wrap items-start gap-4">
        {destino.fileIds.length > 1 && (
          <div className="flex flex-col gap-1">
            {destino.fileIds.map((id) => {
              const a = arquivoPorId.get(id)
              if (!a || a.tipo !== 'foto') return null
              return (
                <button key={id} type="button" onClick={() => setSelecionado(id)}
                  className={`size-10 overflow-hidden rounded border-2 ${id === selecionado ? 'border-primary' : 'border-transparent'}`}>
                  <img src={a.previa} alt="" className="size-full object-cover" />
                </button>
              )
            })}
          </div>
        )}
        <div className="overflow-hidden rounded-md border border-border" style={{ aspectRatio: String(proporcaoAlvo), width: 180 }}>
          <img
            src={arquivo.previa}
            alt=""
            className="size-full object-cover"
            style={{ objectPosition: `${caixa.fx * 100}% ${caixa.fy * 100}%` }}
          />
        </div>
        <div className="flex min-w-40 flex-1 flex-col gap-3 text-xs text-muted-foreground">
          <label>Horizontal
            <input type="range" min={0} max={100} value={Math.round(caixa.fx * 100)} disabled={desabilitado}
              onChange={(e) => mudar('fx', Number(e.target.value) / 100)} className="mt-1 w-full accent-primary" />
          </label>
          <label>Vertical
            <input type="range" min={0} max={100} value={Math.round(caixa.fy * 100)} disabled={desabilitado}
              onChange={(e) => mudar('fy', Number(e.target.value) / 100)} className="mt-1 w-full accent-primary" />
          </label>
          <p>O corte é feito na hora do envio; o original da Biblioteca não muda.</p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- previews

function PreviaDestino({ destino, arquivoPorId, mestre }: {
  destino: DestinoRegistro | null
  arquivoPorId: Map<string, ArquivoDaBiblioteca>
  mestre: { titulo: string; subtitulo: string }
}) {
  if (!destino) {
    return (
      <Card className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prévia</p>
        <p className="mt-2 text-sm text-muted-foreground">Escolha um destino no trilho para ver como vai sair.</p>
      </Card>
    )
  }
  if (destino.canal === 'site_web') {
    return <PreviaSite destino={destino} mestre={mestre} arquivoPorId={arquivoPorId} />
  }
  return <PreviaRede destino={destino} arquivoPorId={arquivoPorId} />
}

/**
 * A prévia do site É o gerador real: o mesmo módulo que monta a página
 * publicada renderiza dentro de um iframe. Mockup que diverge da página de
 * verdade é mentira com boa intenção.
 */
function PreviaSite({ destino, mestre, arquivoPorId }: {
  destino: DestinoRegistro
  mestre: { titulo: string; subtitulo: string }
  arquivoPorId: Map<string, ArquivoDaBiblioteca>
}) {
  const html = useMemo(() => {
    const arquivos = new Map<string, { nome: string; alt: string }>()
    let corpo = destino.corpo
    // Mídias entram na prévia como blocos, na mesma posição do disparo real.
    const tokens = destino.fileIds
      .map((id) => arquivoPorId.get(id))
      .filter((a): a is ArquivoDaBiblioteca => Boolean(a))
      .map((a) => {
        arquivos.set(a.previa, { nome: a.previa, alt: a.nome })
        return `![${a.nome}](${a.previa})`
      })
    if (tokens.length) corpo = `${tokens[0]}\n\n${corpo}${tokens.length > 1 ? `\n\n${tokens.slice(1).join('\n\n')}` : ''}`
    // Fotos escritas no meio do texto: o gerador só desenha a mídia que
    // conhece, então cada uma precisa entrar no mapa antes de montar a página.
    for (const paragrafo of corpo.split(/\n\n+/)) {
      const midia = parseMediaLine(paragrafo)
      if (midia && !arquivos.has(midia.url)) arquivos.set(midia.url, { nome: midia.url, alt: midia.alt })
    }
    return montarPaginaDoArtigo({
      titulo: destino.extras.titulo || mestre.titulo || 'Sem título',
      subtitulo: destino.extras.subtitulo || mestre.subtitulo,
      corpo,
      slug: destino.extras.slug || 'previa',
      baseUrl: 'https://cruzvermelhariodejaneiro.org/noticias',
      publicadoEm: new Date(),
      arquivos,
    })
  }, [destino, mestre, arquivoPorId])

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prévia da página</p>
        <span className="truncate font-mono text-[10px] text-muted-foreground">/noticias/{destino.extras.slug || '…'}/</span>
      </div>
      <iframe srcDoc={html} title="Prévia da página no site" sandbox="allow-same-origin" className="h-96 w-full bg-white" />
    </Card>
  )
}

function PreviaRede({ destino, arquivoPorId }: {
  destino: DestinoRegistro
  arquivoPorId: Map<string, ArquivoDaBiblioteca>
}) {
  const canal = adapter(destino.canal)!
  const formato = formatoDoAdapter(canal, destino.formato)!
  const midias = destino.fileIds.map((id) => arquivoPorId.get(id)).filter((a): a is ArquivoDaBiblioteca => Boolean(a))
  const capa = midias[0]
  const caixa = capa ? destino.crops[capa.id] : undefined
  const proporcao = formato.midia.proporcaoPreferida === 'livre' ? 1 : proporcaoNumerica(formato.midia.proporcaoPreferida)
  const dobra = formato.texto.dobra
  const cortado = dobra && destino.corpo.length > dobra
  const [slide, setSlide] = useState(0)
  useEffect(() => { setSlide(0) }, [destino.id, destino.fileIds.length])
  const atual = midias[Math.min(slide, Math.max(0, midias.length - 1))]

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prévia · {canal.nome} {formato.rotulo}</p>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">CV</span>
          <div className="leading-tight">
            <p className="text-xs font-semibold">cruzvermelhabrasileirj</p>
            <p className="text-[10px] text-muted-foreground">agora · {formato.rotulo}</p>
          </div>
        </div>
        {atual && formato.midia.max > 0 && (
          <div className="relative mt-3 overflow-hidden rounded-lg bg-muted" style={{ aspectRatio: String(proporcao) }}>
            {atual.tipo === 'video'
              ? <video src={atual.previa} controls muted playsInline preload="metadata" className="size-full bg-foreground/90 object-contain" />
              : <img src={atual.previa} alt="" className="size-full object-cover"
                  style={caixa && atual.id === capa?.id ? { objectPosition: `${caixa.fx * 100}% ${caixa.fy * 100}%` } : undefined} />}
            {midias.length > 1 && (
              <>
                <button type="button" onClick={() => setSlide((s) => Math.max(0, s - 1))} disabled={slide === 0}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1 disabled:opacity-30" aria-label="Anterior">‹</button>
                <button type="button" onClick={() => setSlide((s) => Math.min(midias.length - 1, s + 1))} disabled={slide === midias.length - 1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1 disabled:opacity-30" aria-label="Próxima">›</button>
                <span className="absolute right-2 top-2 rounded-full bg-foreground/70 px-2 py-0.5 text-[10px] font-medium text-background">{slide + 1}/{midias.length}</span>
              </>
            )}
          </div>
        )}
        {destino.corpo && (
          <p className="mt-3 whitespace-pre-line text-sm leading-snug">
            {cortado ? <>{destino.corpo.slice(0, dobra)}<span className="text-muted-foreground">… mais</span></> : destino.corpo}
          </p>
        )}
        {destino.extras.firstComment && (
          <p className="mt-2 rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
            <span className="font-semibold">cruzvermelhabrasileirj</span> {destino.extras.firstComment}
            <span className="ml-1 text-[10px]">(primeiro comentário)</span>
          </p>
        )}
      </div>
    </Card>
  )
}

function ValidacaoDoDestino({ destino }: { destino: DestinoRegistro }) {
  const avisos: Aviso[] = useMemo(
    () => validarVariante({ corpo: destino.corpo, extras: destino.extras, fileIds: destino.fileIds }, destino.canal, destino.formato),
    [destino],
  )
  if (!avisos.length) {
    return (
      <Card className="flex items-center gap-2 p-3 text-xs text-emerald-700 dark:text-emerald-500">
        <Check className="size-4" />Nada a corrigir neste destino.
      </Card>
    )
  }
  return (
    <Card className="p-3">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Validação</p>
      <ul className="flex flex-col gap-1">
        {avisos.map((a, i) => (
          <li key={i} className={`flex items-start gap-1.5 text-xs ${a.nivel === 'erro' ? 'text-destructive' : a.nivel === 'aviso' ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground'}`}>
            <CircleAlert className="mt-0.5 size-3 shrink-0" />{a.mensagem}
          </li>
        ))}
      </ul>
      {temErro(avisos) && <p className="mt-2 text-[11px] text-muted-foreground">Com erro, o destino não pode ser marcado como pronto.</p>}
    </Card>
  )
}
