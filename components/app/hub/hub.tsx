'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle, ArrowLeft, Bold, Check, ChevronDown, CircleAlert, Clock, Eraser, Globe, Heading2, ImagePlus, Italic,
  Link2, List, ListOrdered, Loader2, Pencil, Plus, Quote, RefreshCw, Rocket, ShieldAlert,
  Sparkles, Trash2, UploadCloud, Wand2, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ehCanalDeRede, ADAPTERS, adapter, formatoDoAdapter, type Aviso, type CampoExtra } from '@/lib/publicacao/canais'
import { emailDaNewsletter } from '@/lib/newsletter/modelo'
import { contar } from '@/lib/publicacao/contagem'
import { gerarVariante, validarVariante, temErro, type DadosDoArquivo } from '@/lib/publicacao/variantes'
import { temMarcacaoVisivel, textoParaRede } from '@/lib/publicacao/texto-plano'
import { enviarParaBiblioteca } from '@/lib/upload-cliente'
import {
  adaptarLegendaDoDestino, descartarImagemDaIa, gerarImagemDoDestino,
  sugerirIdeiasDeImagem, usarImagemNoDestino,
} from '@/app/actions/ia'
import { sugestoesDePrompt, type Estilo } from '@/lib/ia/sugestoes'
import { tamanhoParaProporcao, medidaComoTexto } from '@/lib/ia/tamanho'
import { montarPaginaDoArtigo } from '@/lib/site/artigo-html'
import { corpoComMidias } from '@/lib/publicacao/legendas'
import { gerarSlug } from '@/lib/site/slug'
import { mediaToken, normalizarQuebras, parseMediaLine } from '@/lib/content-blocks'
import { arrumarTexto, textoDaColagem } from '@/lib/colagem'
import {
  adicionarDestino, alternarPublicacao, arquivarPacote, atualizarStatusDoPacote,
  enviarPacoteParaAprovacao, estimarCota, marcarPronta, publicarPacote, realimentarDestino,
  removerDestino, reprocessarDestino, salvarMestre, salvarVariante,
} from '@/app/actions/pacotes'
import { autorizarUsoDeImagem } from '@/app/actions/arquivos'
import { SeletorDeRevisores, type PessoaDoEspaco } from '@/components/app/seletor-de-revisores'
import type { ArquivoDaBiblioteca, DestinoRegistro, LegendaDaMidia, MestreRegistro, PacoteRegistro } from './tipos'

/**
 * O hub de criação multicanal: a notícia no site → destinos → variantes.
 *
 * A BASE É A PÁGINA DO SITE, e isso não é detalhe de layout.
 *
 * Antes havia um "Mestre (texto canônico)" — uma aba com título, linha fina e
 * texto — e, ao lado, um destino "Site da instituição" com título, linha fina
 * e texto. A mesma notícia digitada em dois lugares, sem que a tela dissesse
 * qual dos dois era o de verdade. Não era: o destino do site é gerado do
 * mestre, campo por campo, o tempo todo.
 *
 * Agora existe uma coisa só. Escreve-se a notícia como ela vai sair no site —
 * que é o canal da casa, o que não depende do alcance que rede nenhuma
 * resolva dar — e cada rede recebe uma versão adaptada dessa página. O pacote
 * nasce com ela e não dá para removê-la; dá para não publicá-la desta vez.
 *
 * Quatro regiões: cabeçalho do pacote, trilho de destinos, editor com preview
 * ao lado, e a barra de ação. Todos os limites e campos vêm dos adapters —
 * esta tela não hardcoda canal nenhum.
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

export function PacoteHub({ pacote: inicial, destinos: destinosIniciais, pessoas = [], workspaceId, iaDisponivel = false }: {
  pacote: PacoteRegistro
  destinos: DestinoRegistro[]
  pessoas?: PessoaDoEspaco[]
  /** Necessário para enviar mídia direto do navegador ao armazenamento. */
  workspaceId: string
  /** Há chave da OpenAI configurada. Sem ela os botões não aparecem — botão
   *  que só produz "falta a chave" é pior do que botão nenhum. */
  iaDisponivel?: boolean
}) {
  const router = useRouter()
  const [enviando, iniciar] = useTransition()

  const [tituloInterno, setTituloInterno] = useState(inicial.tituloInterno)
  const [mestre, setMestre] = useState(inicial.mestre)
  const [fileIds, setFileIds] = useState<string[]>(inicial.fileIds)
  const [agendarPara, setAgendarPara] = useState(inicial.agendarPara)
  // A base vem primeiro no trilho mesmo quando foi criada por último — é o
  // caso dos pacotes anteriores a esta mudança, que a ganharam ao serem
  // abertos. Ordem de criação não é a ordem de leitura.
  const ordenar = (lista: DestinoRegistro[]) =>
    [...lista].sort((a, b) => Number(b.canal === 'site_web') - Number(a.canal === 'site_web'))
  const [destinos, setDestinos] = useState<DestinoRegistro[]>(() => ordenar(destinosIniciais))
  const base = destinos.find((d) => d.canal === 'site_web') ?? null
  /* Chegando do Cérebro, a URL diz em qual destino abrir; sem ela, a notícia. */
  const destinoPedido = useSearchParams().get('destino')
  const [ativo, setAtivo] = useState<string>(
    () => {
      const ordenados = ordenar(destinosIniciais)
      return ordenados.find((d) => d.canal === destinoPedido)?.id ?? ordenados[0]?.id ?? ''
    },
  )
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
      const alvo = evento.target as Element | null
      // O popover mora num portal, fora desta árvore: sem checar por ele,
      // qualquer clique dentro da própria lista fecharia a lista.
      if (alvo?.closest?.('[data-popover-destinos]')) return
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

  // O envio é assíncrono: a API aceita e publica depois. Sem perguntar de
  // volta, o hub mostraria para sempre o aceite como se fosse o resultado —
  // sem endereço do post, sem a falha posterior, e com o agendado parado em
  // "na fila". A conferência roda ao abrir, só quando há o que confirmar.
  const precisaConferir = destinos.some((d) =>
    ehCanalDeRede(d.canal)
    && (d.estado === 'na_fila' || d.estado === 'publicando'
        || (d.estado === 'publicada' && !d.externalUrl)))
  const jaConferiu = useRef(false)

  useEffect(() => {
    if (!precisaConferir || jaConferiu.current) return
    jaConferiu.current = true
    const form = new FormData()
    form.set('pacoteId', inicial.id)
    atualizarStatusDoPacote(form).then((r) => { if (r.mudou) router.refresh() })
  }, [precisaConferir, inicial.id, router])

  const recarregarBiblioteca = useCallback(() => {
    fetch('/api/redes/imagens', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setBiblioteca(d.arquivos ?? []))
      .catch(() => setBiblioteca([]))
  }, [])

  useEffect(() => {
    fetch('/api/redes/conectadas', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setConectadas(d.redes ?? []))
      .catch(() => setConectadas([]))
    recarregarBiblioteca()
  }, [recarregarBiblioteca])

  const arquivoPorId = useMemo(() => new Map(biblioteca.map((a) => [a.id, a])), [biblioteca])
  // Sem isto a validação não barra vídeo num formato que só aceita foto — e o
  // erro só apareceria na resposta da API — nem acusa mídia sem autorização
  // de uso, que só falharia na hora do disparo.
  const dadosPorArquivo = useMemo(
    () => Object.fromEntries(biblioteca.map((a) => [a.id, { tipo: a.tipo, autorizacao: a.autorizacao }])),
    [biblioteca],
  )
  // Foto escrita no texto da matéria não vira anexo de rede social: as redes
  // recebem mídia por fora da legenda. Contar aqui é o que permite avisar.
  const midiasNoTextoDoMestre = useMemo(() => textoParaRede(mestre.corpo).midiasNoTexto, [mestre.corpo])
  /**
   * O que cada destino vai receber, calculado do texto que está na tela agora.
   *
   * O autosave só chega quatro segundos depois da última tecla, e o painel
   * "como vai sair nas outras" lia a linha do banco: mostrava a versão
   * anterior da notícia — às vezes de dias antes — como se fosse o que ia ao
   * ar. Aqui a variante é gerada pelo MESMO módulo que o servidor usa, então
   * a prévia é o resultado, não uma aproximação dele.
   *
   * Descolada não entra: alguém escreveu aquele texto à mão, e sobrescrevê-lo
   * na tela seria apagar o trabalho sem avisar.
   */
  const destinosAoVivo = useMemo(() => destinos.map((d) => {
    if (d.descolada || ['publicada', 'publicando', 'na_fila'].includes(d.estado)) return d
    try {
      const { variante } = gerarVariante({ ...mestre, fileIds }, d.canal, d.formato)
      return { ...d, corpo: variante.corpo, extras: { ...d.extras, ...variante.extras }, fileIds: variante.fileIds }
    } catch {
      // Canal ou formato que este build não conhece: mostra o que está gravado.
      return d
    }
  }), [destinos, mestre, fileIds])

  const destinoAtivo = destinosAoVivo.find((d) => d.id === ativo) ?? null
  const baseAtiva = destinoAtivo?.canal === 'site_web'

  /**
   * Registra a autorização de uso de imagem de uma mídia da Biblioteca.
   *
   * Muda o arquivo, não o pacote: a foto vale autorizada em todo lugar onde
   * for usada, que é o que a declaração diz. Por isso a lista local é
   * atualizada inteira, e não só o item deste destino.
   */
  const autorizarMidia = useCallback(async (arquivo: ArquivoDaBiblioteca) => {
    setErro('')
    const form = new FormData()
    form.set('fileId', arquivo.id)
    const r = await autorizarUsoDeImagem(form)
    if (r.erro) { setErro(r.erro); return }
    setBiblioteca((atual) => atual.map((a) => (a.id === arquivo.id ? { ...a, autorizacao: 'authorized' } : a)))
    setAviso(`Autorização registrada para ${arquivo.nome}.`)
  }, [])

  /** Mídia recém-enviada entra na Biblioteca da tela e no Mestre do pacote. */
  const acolherMidia = useCallback((arquivo: ArquivoDaBiblioteca) => {
    setBiblioteca((atual) => (atual.some((a) => a.id === arquivo.id) ? atual : [arquivo, ...atual]))
    setFileIds((ids) => (ids.includes(arquivo.id) ? ids : [...ids, arquivo.id]))
  }, [])

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
    form.set('slug', mestre.slug)
    form.set('notas', mestre.notas)
    form.set('legendas', JSON.stringify(mestre.legendas ?? {}))
    form.set('agendarPara', agendarPara)
    for (const id of fileIds) form.append('fileIds', id)
    const r = await salvarMestre(form)
    if (r.erro) { setErro(r.erro); setSalvo('pendente'); return }
    // O servidor regenerou as variantes que acompanham a notícia; aplicar a
    // resposta aqui evita um router.refresh() no meio da digitação, que
    // devolveria o cursor para o começo do campo.
    if (r.destinos?.length) {
      const porId = new Map(r.destinos.map((d) => [d.id, d]))
      setDestinos((atual) => atual.map((d) => {
        const novo = porId.get(d.id)
        return novo ? { ...d, corpo: novo.corpo, extras: novo.extras, fileIds: novo.fileIds, estado: novo.estado } : d
      }))
    }
    setSalvo('ok')
  }, [inicial.id, tituloInterno, mestre, fileIds, agendarPara])

  // O autosave dispara pelo CONTEÚDO, não por "não é a primeira renderização".
  // A trava anterior era um ref ligado no primeiro efeito — e no modo estrito,
  // que roda cada efeito duas vezes, a segunda passava direto: o hub salvava
  // sozinho ao abrir, sem ninguém ter digitado nada.
  const assinatura = JSON.stringify({ tituloInterno, mestre, fileIds, agendarPara })
  const ultimaSalva = useRef(assinatura)
  useEffect(() => {
    if (encerrado || assinatura === ultimaSalva.current) return
    setSalvo('pendente')
    const timer = setTimeout(() => {
      ultimaSalva.current = assinatura
      salvarAgora()
    }, 4000)
    return () => clearTimeout(timer)
  }, [assinatura, salvarAgora, encerrado])

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
    if (ativo === d.id) setAtivo(base?.id ?? '')
    router.refresh()
  }

  async function alternarSaida(d: DestinoRegistro, ignorar: boolean) {
    setErro(''); setAviso('')
    const form = new FormData()
    form.set('destinoId', d.id)
    form.set('ignorar', ignorar ? '1' : '0')
    const r = await alternarPublicacao(form)
    if (r.erro) { setErro(r.erro); return }
    setDestinos((atual) => atual.map((x) => (x.id === d.id ? { ...x, estado: r.estado ?? x.estado } : x)))
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
    && !temErro(validarVariante({ corpo: d.corpo, extras: d.extras, fileIds: d.fileIds }, d.canal, d.formato, dadosPorArquivo)))
  const barrados = destinos.filter((d) =>
    ['gerada', 'em_ajuste', 'bloqueada'].includes(d.estado)
    && temErro(validarVariante({ corpo: d.corpo, extras: d.extras, fileIds: d.fileIds }, d.canal, d.formato, dadosPorArquivo)))

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
          <span>{prontos + publicadas}/{destinos.filter((d) => d.estado !== 'ignorada').length} prontos</span>
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
        {destinos.map((d) => {
          const sem = SEMAFORO[d.estado] ?? SEMAFORO.gerada
          const ehBase = d.canal === 'site_web'
          return (
            <TrilhoCard
              key={d.id}
              ativo={ativo === d.id}
              onClick={() => setAtivo(d.id)}
              title={ehBase ? 'A notícia — base do pacote' : sem.rotulo}
              // A base não tem X: apagá-la deixaria o pacote sem texto nenhum.
              acao={!ehBase && !encerrado && !['publicada', 'publicando'].includes(d.estado) ? (
                <button
                  type="button"
                  onClick={() => remover(d)}
                  // Só no hover, o X fica inalcançável em telas de toque, onde
                  // hover não existe. Aparece sempre; o desktop é que o esconde.
                  className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-background p-0.5 text-muted-foreground transition-opacity hover:text-destructive focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                  aria-label={`Remover ${adapter(d.canal)?.nome ?? d.canal}`}
                >
                  <X className="size-3" />
                </button>
              ) : undefined}
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <span className={`size-2 rounded-full ${sem.classe}`} />
                {ehBase && <Globe className="size-3" />}
                {ehBase ? 'A notícia' : adapter(d.canal)?.nome ?? d.canal}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                {ehBase
                  ? (d.estado === 'ignorada' ? 'não sai no site' : 'página no site')
                  : formatoDoAdapter(adapter(d.canal)!, d.formato)?.rotulo ?? d.formato}
                {d.descolada && !ehBase && <Pencil className="size-2.5" aria-label="editada à mão" />}
              </span>
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
                ancora={blocoAdicionar}
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
          {!destinoAtivo || baseAtiva ? (
            <EditorDaNoticia
              base={destinoAtivo}
              mestre={mestre}
              onMudar={(m) => setMestre(m)}
              fileIds={fileIds}
              onFileIds={setFileIds}
              biblioteca={biblioteca}
              agendarPara={agendarPara}
              onAgendarPara={setAgendarPara}
              onPronta={() => destinoAtivo && pronta(destinoAtivo)}
              onReprocessar={() => destinoAtivo && reprocessar(destinoAtivo)}
              onAlternarSaida={(ignorar) => destinoAtivo && alternarSaida(destinoAtivo, ignorar)}
              quantasRedes={destinos.filter((d) => d.canal !== 'site_web').length}
              encerrado={encerrado}
              workspaceId={workspaceId}
              onNovaMidia={acolherMidia}
              onAutorizarMidia={autorizarMidia}
            />
          ) : (
            <EditorCanal
              destino={destinoAtivo}
              arquivoPorId={arquivoPorId}
              fileIdsDoMestre={fileIds}
              midiasNoTextoDoMestre={midiasNoTextoDoMestre}
              mestre={mestre}
              onEditar={(mudanca) => editarVariante(destinoAtivo.id, mudanca)}
              onPronta={() => pronta(destinoAtivo)}
              onRealimentar={() => realimentar(destinoAtivo)}
              onReprocessar={() => reprocessar(destinoAtivo)}
              encerrado={encerrado}
              workspaceId={workspaceId}
              onNovaMidia={acolherMidia}
              onAutorizarMidia={autorizarMidia}
              iaDisponivel={iaDisponivel}
              onRecarregarBiblioteca={recarregarBiblioteca}
            />
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <PreviaDestino destino={destinoAtivo} arquivoPorId={arquivoPorId} mestre={mestre} />
          {destinoAtivo && <ValidacaoDoDestino destino={destinoAtivo} dadosPorArquivo={dadosPorArquivo} />}
          {destinos.length > 1 && (
            <Card className="p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Como vai sair nas outras</p>
              <div className="flex flex-col gap-1.5">
                {destinosAoVivo.filter((d) => d.id !== ativo).map((d) => (
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
                  {[...destinos.filter((d) => d.estado === 'pronta'), ...elegiveis.filter((d) => incluidos.includes(d.id))].some((d) => !ehCanalDeRede(d.canal)) ? ' (site e newsletter não contam na cota)' : ''}.
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
  // A base tem nome próprio: no trilho e nas listas ela é "a notícia", não
  // mais um canal entre os outros.
  if (d.canal === 'site_web') return 'A notícia · site'
  const canal = adapter(d.canal)
  const formato = canal ? formatoDoAdapter(canal, d.formato) : undefined
  return `${canal?.nome ?? d.canal} · ${formato?.rotulo ?? d.formato}`
}

/**
 * Um cartão do trilho de destinos.
 *
 * A ação de remover é irmã do botão, não filha: botão dentro de botão é HTML
 * inválido — o React acusa erro de hidratação e o navegador pode reconstruir a
 * árvore por conta própria, deixando o X sem clique. Por isso `acao` entra
 * fora do <button>, ancorada pelo <div> que envolve os dois.
 */
function TrilhoCard({ ativo, onClick, title, acao, children }: {
  ativo: boolean
  onClick: () => void
  title?: string
  acao?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="group relative shrink-0">
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`flex h-full min-w-32 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors ${
          ativo ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:bg-muted/50'
        }`}
      >
        {children}
      </button>
      {acao}
    </div>
  )
}

/** Tira acento e caixa: quem procura "grafica" acha "Google Meu Negócio". */
function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/**
 * A lista de canais e formatos, aberta a partir do botão "Adicionar destino".
 *
 * Vai num portal, com posição fixa medida a partir do botão, por um motivo
 * concreto: a página inteira vive dentro de <main class="overflow-y-auto
 * overflow-x-hidden"> e o trilho de destinos rola na horizontal. Qualquer
 * ancestral com overflow recorta filho posicionado — foi assim que este
 * popover apareceu espremido na altura do trilho, com barra de rolagem
 * própria e a lista cortada. Fora da árvore, ninguém o recorta.
 */
function PopoverDestinos({ ancora, conectadas, jaExistem, onEscolher, onFechar }: {
  ancora: React.RefObject<HTMLDivElement | null>
  conectadas: string[] | null
  jaExistem: string[]
  onEscolher: (canal: string, formato: string) => void
  onFechar: () => void
}) {
  const [busca, setBusca] = useState('')
  const [caixa, setCaixa] = useState<{ top: number; left: number; largura: number; altura: number } | null>(null)
  const campoRef = useRef<HTMLInputElement>(null)

  // Abrir já digitando poupa o passo de mirar no campo com o mouse. A trava é
  // necessária porque `caixa` é remedida a cada rolagem: sem ela, o foco
  // voltaria para o campo de busca no meio da digitação.
  const jaFocou = useRef(false)
  useEffect(() => {
    if (!caixa || jaFocou.current) return
    jaFocou.current = true
    campoRef.current?.focus()
  }, [caixa])

  useEffect(() => {
    function medir() {
      const botao = ancora.current?.getBoundingClientRect()
      if (!botao) return
      const margem = 12
      const largura = Math.min(320, window.innerWidth - margem * 2)
      // Alinhado pela direita do botão, sem escapar da janela nos dois lados.
      const left = Math.max(margem, Math.min(botao.right - largura, window.innerWidth - largura - margem))
      const abaixo = window.innerHeight - botao.bottom - margem
      const acima = botao.top - margem
      // Abre para baixo quando cabe; senão para cima, onde houver mais espaço.
      const paraBaixo = abaixo >= 260 || abaixo >= acima
      const altura = Math.min(460, paraBaixo ? abaixo : acima)
      const top = paraBaixo ? botao.bottom + 8 : Math.max(margem, botao.top - altura - 8)
      setCaixa({ top, left, largura, altura })
    }
    medir()
    window.addEventListener('resize', medir)
    // O <main> rola, não a janela: sem a fase de captura o popover ficaria
    // parado enquanto o botão que o ancora sobe com a página.
    window.addEventListener('scroll', medir, true)
    return () => {
      window.removeEventListener('resize', medir)
      window.removeEventListener('scroll', medir, true)
    }
  }, [ancora])

  const canais = useMemo(() => {
    const termo = semAcento(busca.trim())
    return ADAPTERS
      // O site não entra na lista: ele já é a base do pacote, sempre presente
      // no começo do trilho. Oferecê-lo aqui criaria uma segunda página com a
      // mesma notícia.
      .filter((canal) => canal.id !== 'site_web')
      .map((canal) => {
        // Canal próprio da instituição não depende de conexão com o
        // Upload-Post: o site sai por FTP e a newsletter, pelo Resend.
        const conectado = !ehCanalDeRede(canal.id) || conectadas === null || conectadas.includes(canal.id)
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

  // Conta ligada no Upload-Post que o hub ainda não sabe montar. Some da lista
  // por não ter adapter — e sumir em silêncio faria parecer que a conexão não
  // funcionou. Dizer o nome é o que transforma um sumiço num pedido claro.
  const semSuporte = (conectadas ?? []).filter((id) => !ADAPTERS.some((a) => a.id === id))

  // Até a primeira medição não há onde desenhar; renderizar antes disso
  // faria o popover piscar no canto da tela.
  if (!caixa) return null

  return createPortal(
    <div
      data-popover-destinos=""
      style={{ position: 'fixed', top: caixa.top, left: caixa.left, width: caixa.largura, maxHeight: caixa.altura }}
      className="z-50 flex flex-col overflow-hidden rounded-lg border border-border bg-background p-3 shadow-xl"
    >
      <div className="mb-2 flex shrink-0 items-center justify-between">
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
        className="mb-2 w-full shrink-0 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
      />

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {canais.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">Nenhum canal ou formato com “{busca}”.</p>
        )}
        {semSuporte.length > 0 && !busca && (
          <p className="rounded-md bg-muted/60 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
            Conectadas mas ainda sem suporte aqui: {semSuporte.join(', ')}.
          </p>
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
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------- editores

const inputClass = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

/**
 * Traduz o que veio da área de transferência para o formato da matéria.
 *
 * O jeito real de escrever aqui é colar — de uma resposta de IA, de um
 * documento, de um e-mail. Sem isto, `### Subtítulo`, `1. Passo` e a lista
 * com `•` chegam à página publicada como texto cru.
 *
 * Devolve null quando não há nada a ganhar: aí o navegador cola sozinho e o
 * desfazer nativo continua funcionando.
 */
function colagemNoFormato(
  evento: React.ClipboardEvent<HTMLTextAreaElement>,
  valor: string,
): { texto: string; inicio: number; fim: number } | null {
  const html = evento.clipboardData.getData('text/html')
  const plano = evento.clipboardData.getData('text/plain')
  if (!plano && !html) return null

  const convertido = textoDaColagem(html, plano)
  if (!convertido || convertido === plano) return null

  const el = evento.currentTarget
  const i = el.selectionStart
  const f = el.selectionEnd

  // Colar uma frase solta no meio de um parágrafo não pode abrir parágrafo
  // novo; colar blocos no meio de um, sim — senão o primeiro bloco gruda na
  // frase anterior e deixa de ser título ou item.
  const temBloco = /\n/.test(convertido) || /^(## |- |\d+\. |> |!\[)/.test(convertido)
  if (!temBloco) {
    return { texto: valor.slice(0, i) + convertido + valor.slice(f), inicio: i + convertido.length, fim: i + convertido.length }
  }

  const antes = valor.slice(0, i).replace(/\s+$/, '')
  const depois = valor.slice(f).replace(/^\s+/, '')
  const posicao = (antes ? antes.length + 2 : 0) + convertido.length
  return {
    texto: `${antes}${antes ? '\n\n' : ''}${convertido}${depois ? `\n\n${depois}` : ''}`,
    inicio: posicao,
    fim: posicao,
  }
}

/**
 * O editor da notícia — a base do pacote.
 *
 * Aqui se escreve a matéria como ela vai sair no site: título, linha fina,
 * texto com fotos no meio, endereço. É a mesma coisa que antes estava
 * repartida entre uma aba "Mestre" e um destino "Site da instituição", com os
 * mesmos três campos em cada uma. Quem escrevia num não via o outro mudar, e
 * a pergunta "qual dos dois é o que vale?" não tinha resposta na tela.
 *
 * As mídias, o agendamento e as notas para quem aprova moram aqui porque valem
 * para o pacote inteiro — cada destino escolhe entre as mídias e pode ter o
 * seu horário, mas o conjunto é um só.
 */
function EditorDaNoticia({ base, mestre, onMudar, fileIds, onFileIds, biblioteca, agendarPara, onAgendarPara, onPronta, onReprocessar, onAlternarSaida, quantasRedes, encerrado, workspaceId, onNovaMidia, onAutorizarMidia }: {
  /** A página do site. Nula só no instante entre criar o pacote e a base existir. */
  base: DestinoRegistro | null
  mestre: MestreRegistro
  onMudar: (m: MestreRegistro) => void
  fileIds: string[]
  onFileIds: (ids: string[]) => void
  biblioteca: ArquivoDaBiblioteca[]
  agendarPara: string
  onAgendarPara: (v: string) => void
  onPronta: () => void
  onReprocessar: () => void
  onAlternarSaida: (ignorar: boolean) => void
  quantasRedes: number
  encerrado: boolean
  workspaceId: string
  onNovaMidia: (arquivo: ArquivoDaBiblioteca) => void
  onAutorizarMidia: (arquivo: ArquivoDaBiblioteca) => void
}) {
  const [maisOpcoes, setMaisOpcoes] = useState(false)
  const muda = (campo: keyof MestreRegistro) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onMudar({ ...mestre, [campo]: e.target.value })

  // Na ordem em que entram na página, e não na ordem da Biblioteca: a
  // primeira é a que abre a matéria, e isso precisa estar visível.
  const escolhidas = fileIds
    .map((id) => biblioteca.find((a) => a.id === id))
    .filter((a): a is ArquivoDaBiblioteca => Boolean(a))

  const naoSaiNoSite = base?.estado === 'ignorada'
  const publicada = base?.estado === 'publicada'
  const congelado = encerrado || publicada || base?.estado === 'publicando'
  const formato = base ? formatoDoAdapter(adapter('site_web')!, base.formato) : undefined
  const max = formato?.texto.max ?? 20_000
  const tamanho = contar(mestre.corpo, 'caracteres')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Globe className="size-4" />A notícia
          <span className="font-normal text-muted-foreground">
            {naoSaiNoSite ? '— não sai no site desta vez' : '— vira uma página no site'}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          {publicada && (
            base.externalUrl
              ? <a href={base.externalUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-emerald-700 underline">Publicada — abrir</a>
              : <span className="text-xs font-medium text-emerald-700">Publicada</span>
          )}
          {base?.estado === 'falhou' && (
            <Button size="sm" variant="outline" onClick={onReprocessar}><RefreshCw className="size-3.5" />Reprocessar</Button>
          )}
          {base && !congelado && !naoSaiNoSite && base.estado !== 'pronta' && (
            <Button size="sm" onClick={onPronta}><Check className="size-3.5" />Marcar como pronta</Button>
          )}
          {base?.estado === 'pronta' && (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600"><Check className="size-3.5" />Pronta</span>
          )}
        </div>
      </div>

      <p className="-mt-2 text-xs text-muted-foreground">
        Escreva a matéria inteira, do jeito que ela vai aparecer no site.
        {quantasRedes === 0
          ? ' Depois use “Adicionar destino” para mandá-la às redes, cada uma no limite dela.'
          : quantasRedes === 1
            ? ' O destino no trilho recebe uma versão adaptada ao limite dele, atualizada enquanto você digita.'
            : ` Os ${quantasRedes} destinos no trilho recebem uma versão adaptada ao limite de cada um, atualizada enquanto você digita.`}
      </p>

      {base?.erro && ['falhou', 'publicada'].includes(base.estado) && (
        <p className={`rounded-lg border px-3 py-2 text-xs ${base.estado === 'falhou' ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'}`}>{base.erro}</p>
      )}

      <label className="text-sm font-medium">Título
        <input value={mestre.titulo} onChange={muda('titulo')} disabled={congelado} placeholder="O título da página no site" className={`mt-1 ${inputClass}`} />
      </label>
      <label className="text-sm font-medium">Linha fina <span className="font-normal text-muted-foreground">(opcional)</span>
        <input value={mestre.subtitulo} onChange={muda('subtitulo')} disabled={congelado} placeholder="Uma frase de resumo — é o que o Google e as redes mostram" className={`mt-1 ${inputClass}`} />
      </label>

      {/* Sem botão de "ajustar formatação" nem dica de colagem aqui: o campo da
          matéria já traz os dois na própria barra de ferramentas, e a versão
          desta tela aparecia logo acima da dele, dizendo quase a mesma coisa
          duas vezes. */}
      <label className="text-sm font-medium">
        Texto da matéria
        <div className="mt-1">
          <CampoDaMateria
            valor={mestre.corpo}
            onMudar={(v) => onMudar({ ...mestre, corpo: v })}
            desabilitado={congelado}
            max={max}
            tamanho={tamanho}
            estourou={tamanho > max}
            workspaceId={workspaceId}
          />
        </div>
        <span className="mt-1 block text-xs font-normal text-muted-foreground">
          As hashtags do fim são movidas para o primeiro comentário quando a rede aperta. Escreva {'{{URL_DA_MATERIA}}'} onde
          o endereço desta página deve entrar nas redes — ele é preenchido na hora da publicação.
        </span>
      </label>

      <div>
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <p className="pt-1 text-sm font-medium">
            Mídias do pacote <span className="font-normal text-muted-foreground">(cada destino escolhe entre elas)</span>
          </p>
          {!congelado && <BotaoEnviarMidia workspaceId={workspaceId} onEnviada={onNovaMidia} />}
        </div>
        <GradeDaBiblioteca biblioteca={biblioteca} selecionados={fileIds} onMudar={onFileIds} limite={10} desabilitado={congelado} onAutorizar={onAutorizarMidia} />

        {/* O rodapé de cada foto na página. Existe aqui porque a foto anexada
            ao pacote não tem onde carregar isso — a escrita dentro do texto
            leva legenda e crédito na própria linha, esta não levava nenhum, e
            a página saía com o nome do arquivo embaixo da imagem. */}
        {escolhidas.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Rodapé das fotos na página
            </p>
            {escolhidas.map((a, i) => {
              const atual = mestre.legendas?.[a.id] ?? { legenda: '', credito: '' }
              const mudarLegenda = (campos: Partial<LegendaDaMidia>) =>
                onMudar({ ...mestre, legendas: { ...(mestre.legendas ?? {}), [a.id]: { ...atual, ...campos } } })
              return (
                <div key={a.id} className="flex items-start gap-3 rounded-lg border border-border p-2">
                  {a.tipo === 'video'
                    ? <video src={a.previa} muted playsInline preload="metadata" className="size-16 shrink-0 rounded object-cover" />
                    : <img src={a.previa} alt="" className="size-16 shrink-0 rounded object-cover" />}
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <input
                      value={atual.legenda}
                      onChange={(e) => mudarLegenda({ legenda: e.target.value })}
                      placeholder="Legenda — o que a foto mostra"
                      disabled={congelado}
                      className={inputClass}
                    />
                    <input
                      value={atual.credito}
                      onChange={(e) => mudarLegenda({ credito: e.target.value })}
                      placeholder="Crédito — ex.: Ana Souza/CVB-RJ"
                      disabled={congelado}
                      className={inputClass}
                    />
                    <span className="text-[11px] text-muted-foreground">
                      {i === 0
                        ? 'Esta abre a matéria, em destaque.'
                        : 'Entra no fim da página, depois do texto.'}
                      {!atual.legenda.trim() && ' Sem legenda a foto sai muda para quem usa leitor de tela.'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* O que quase ninguém mexe fica recolhido: o endereço nasce do título,
          o agendamento é opcional e o link externo é exceção. Deixar os três
          sempre abertos empurrava o texto da matéria para baixo da dobra. */}
      <div className="rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setMaisOpcoes((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/50"
        >
          Endereço, agendamento e notas
          <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${maisOpcoes ? 'rotate-180' : ''}`} />
        </button>
        {maisOpcoes && (
          <div className="flex flex-col gap-4 border-t border-border p-3">
            <label className="text-sm font-medium">Endereço da página <span className="font-normal text-muted-foreground">(opcional)</span>
              <input
                value={mestre.slug}
                onChange={muda('slug')}
                disabled={congelado}
                placeholder={mestre.titulo ? gerarSlug(mestre.titulo) : 'nasce-do-titulo'}
                className={`mt-1 ${inputClass}`}
              />
              <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                A parte final da URL, depois de /noticias/. Em branco, nasce do título. Depois de publicada não muda —
                mudá-la quebraria os links já compartilhados.
              </span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">Link já existente <span className="font-normal text-muted-foreground">(opcional)</span>
                <input value={mestre.linkUrl} onChange={muda('linkUrl')} disabled={congelado} placeholder="https://…" className={`mt-1 ${inputClass}`} />
                <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">Para apontar as redes a uma página que já existe, em vez desta.</span>
              </label>
              <label className="text-sm font-medium">Agendar o pacote <span className="font-normal text-muted-foreground">(opcional)</span>
                <input type="datetime-local" value={agendarPara} onChange={(e) => onAgendarPara(e.target.value)} disabled={encerrado} className={`mt-1 ${inputClass}`} />
                <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">Horário de Brasília. Cada destino pode ter o seu.</span>
              </label>
            </div>
            <label className="text-sm font-medium">Notas para quem aprova <span className="font-normal text-muted-foreground">(não são publicadas)</span>
              <textarea value={mestre.notas} onChange={muda('notas')} rows={2} disabled={encerrado} className={`mt-1 ${inputClass}`} />
            </label>
            {base && !congelado && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={naoSaiNoSite}
                  onChange={(e) => onAlternarSaida(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0"
                />
                <span>
                  Não publicar no site desta vez
                  <span className="block text-[11px] text-muted-foreground">
                    O texto continua sendo escrito aqui e as redes continuam saindo dele — só a página não é criada.
                  </span>
                </span>
              </label>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * O estúdio de imagem: um diálogo de tela cheia, não um balão apertado.
 *
 * O que estava aqui antes era um campo em branco num popover de 28rem — a
 * pior tela possível para quem escreve a matéria e não sabe descrever imagem.
 * Agora a matéria escrita alimenta cinco pedidos prontos, o modelo pode
 * propor mais três, e o resultado aparece ANTES de virar mídia do post.
 *
 * Três coisas atravessam todos os pedidos, e nenhuma é escolha de quem clica:
 *
 *  - o enquadramento vem do canal (9:16 no Stories, 4:5 no feed);
 *  - nenhum pedido pede pessoa — rosto sintético numa publicação humanitária
 *    é lido como registro de atendimento;
 *  - nenhum pedido pede o emblema. A cruz vermelha sobre fundo branco é
 *    símbolo protegido pelas Convenções de Genebra, e uma versão torta saída
 *    de um gerador é pior do que imagem nenhuma no canal oficial.
 */
function GerarImagemComIa({ destino, canal, proporcao, mestre, cheio, onMudou }: {
  destino: DestinoRegistro
  canal: string
  proporcao: string
  mestre: MestreRegistro
  cheio: boolean
  onMudou: () => void
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted"
      >
        <Sparkles className="size-3.5" />Gerar imagem
      </button>
      {aberto && (
        <EstudioDeImagem
          destino={destino}
          canal={canal}
          proporcao={proporcao}
          mestre={mestre}
          cheio={cheio}
          onMudou={onMudou}
          onFechar={() => setAberto(false)}
        />
      )}
    </>
  )
}

const QUALIDADES = [
  { id: 'low' as const, rotulo: 'Rápida', dica: 'Mais barata e mais rápida. Boa para testar uma ideia.' },
  { id: 'medium' as const, rotulo: 'Média', dica: 'O equilíbrio que serve à maioria dos posts.' },
  { id: 'high' as const, rotulo: 'Caprichada', dica: 'Mais detalhe, mais custo, mais espera.' },
]

function EstudioDeImagem({ destino, canal, proporcao, mestre, cheio, onMudou, onFechar }: {
  destino: DestinoRegistro
  canal: string
  proporcao: string
  mestre: MestreRegistro
  cheio: boolean
  onMudou: () => void
  onFechar: () => void
}) {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [qualidade, setQualidade] = useState<'low' | 'medium' | 'high'>('medium')
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [ideias, setIdeias] = useState<string[]>([])
  const [pedindoIdeias, pedirIdeias] = useTransition()
  const [gerando, gerar] = useTransition()
  const [salvando, salvar] = useTransition()
  const [erro, setErro] = useState('')
  const [pronta, setPronta] = useState<{ fileId: string; previa: string; restantes?: number } | null>(null)

  const sugestoes = useMemo(() => sugestoesDePrompt(mestre), [mestre])
  const medida = useMemo(() => tamanhoParaProporcao(proporcao), [proporcao])
  const semMateria = sugestoes.length === 0
  const resumoDaMateria = useMemo(() => {
    const limpo = textoParaRede(mestre.corpo).texto.replace(/\s+/g, ' ').trim()
    return limpo.length > 220 ? `${limpo.slice(0, 220)}…` : limpo
  }, [mestre.corpo])

  useEffect(() => {
    function noEscape(e: KeyboardEvent) { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', noEscape)
    return () => document.removeEventListener('keydown', noEscape)
  }, [onFechar])

  function usarSugestao(texto: string, id: string) {
    setPrompt(texto)
    setEscolhido(id)
    setErro('')
  }

  function pedir() {
    setErro('')
    pedirIdeias(async () => {
      const form = new FormData()
      form.set('destinoId', destino.id)
      const r = await sugerirIdeiasDeImagem(form)
      if (r.erro) { setErro(r.erro); return }
      setIdeias(r.ideias ?? [])
    })
  }

  function gerarAgora() {
    setErro('')
    gerar(async () => {
      const form = new FormData()
      form.set('destinoId', destino.id)
      form.set('prompt', prompt)
      form.set('qualidade', qualidade)
      const r = await gerarImagemDoDestino(form)
      if (r.erro) { setErro(r.erro); return }
      setPronta({ fileId: r.fileId!, previa: r.previa!, restantes: r.restantesNoMes })
      onMudou()
    })
  }

  function usar() {
    if (!pronta) return
    setErro('')
    salvar(async () => {
      const form = new FormData()
      form.set('destinoId', destino.id)
      form.set('fileId', pronta.fileId)
      const r = await usarImagemNoDestino(form)
      if (r.erro) { setErro(r.erro); return }
      onMudou()
      router.refresh()
      onFechar()
    })
  }

  function descartar() {
    if (!pronta) return
    setErro('')
    salvar(async () => {
      const form = new FormData()
      form.set('fileId', pronta.fileId)
      const r = await descartarImagemDaIa(form)
      if (r.erro) { setErro(r.erro); return }
      setPronta(null)
      onMudou()
    })
  }

  const ocupado = gerando || salvando || pedindoIdeias

  return createPortal(
    <div
      data-estudio-de-imagem=""
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/45 p-4 py-8"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !ocupado) onFechar() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="estudio-titulo"
    >
      <Card className="w-full max-w-3xl overflow-hidden p-0 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h2 id="estudio-titulo" className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="size-4 text-primary" />Gerar imagem
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {canal} · sai em <span className="font-medium text-foreground">{medidaComoTexto(medida)}</span>
              {proporcao !== 'livre' && <> ({proporcao})</>}, o enquadramento deste canal.
            </p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted">
            <X className="size-4" />
          </button>
        </header>

        {pronta ? (
          <div className="px-6 py-5">
            <p className="mb-3 text-sm font-medium">Ficou assim.</p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <img
                src={pronta.previa}
                alt="Imagem gerada"
                className="mx-auto max-h-80 w-auto rounded-lg border border-border object-contain"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Já está na Biblioteca, marcada como gerada por IA — você pagou por ela de todo jeito. Usar aqui a
                  anexa a <span className="font-medium text-foreground">{canal}</span>; descartar apaga o arquivo.
                </p>
                {typeof pronta.restantes === 'number' && (
                  <p className="text-xs text-muted-foreground">
                    Ainda cabem <span className="font-medium text-foreground">{pronta.restantes}</span> imagens no teto deste mês.
                  </p>
                )}
                {erro && <p className="text-xs text-destructive">{erro}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <Button onClick={usar} disabled={salvando || cheio}>
                    {salvando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    Usar neste destino
                  </Button>
                  <Button variant="outline" onClick={() => setPronta(null)} disabled={salvando}>
                    <RefreshCw className="size-4" />Gerar outra
                  </Button>
                  <Button variant="ghost" onClick={descartar} disabled={salvando}>
                    <Trash2 className="size-4" />Descartar
                  </Button>
                </div>
                {cheio && (
                  <p className="text-xs text-amber-600 dark:text-amber-500">
                    Este destino já está com o número máximo de mídias. Tire uma antes de anexar esta.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5 px-6 py-5">
            {semMateria ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Escreva o texto-mestre primeiro. As sugestões de imagem saem da matéria — sem ela, sobra o campo em
                branco, que é justamente o que esta tela existe para evitar.
              </p>
            ) : (
              <>
                <section className="rounded-lg bg-muted/50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">A matéria</p>
                  {mestre.titulo && <p className="mt-1 font-medium">{mestre.titulo}</p>}
                  <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{resumoDaMateria}</p>
                </section>

                <section>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">Comece por um destes</p>
                    <Button size="sm" variant="outline" onClick={pedir} disabled={ocupado}>
                      {pedindoIdeias ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                      {pedindoIdeias ? 'Pensando…' : 'Pedir ideias à IA'}
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {sugestoes.map(({ estilo, prompt: sugerido }) => (
                      <CartaoDeEstilo
                        key={estilo.id}
                        estilo={estilo}
                        ativo={escolhido === estilo.id}
                        onEscolher={() => usarSugestao(sugerido, estilo.id)}
                      />
                    ))}
                  </div>
                  {ideias.length > 0 && (
                    <div className="mt-2 flex flex-col gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ideias da IA</p>
                      {ideias.map((ideia, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => usarSugestao(ideia, `ia-${i}`)}
                          className={`rounded-lg border px-3 py-2 text-left text-xs leading-relaxed transition-colors hover:bg-muted ${
                            escolhido === `ia-${i}` ? 'border-primary bg-primary/5' : 'border-border'
                          }`}
                        >
                          {ideia}
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <label className="text-sm font-medium">
                    <span className="flex items-center justify-between gap-2">
                      Pedido
                      <span className="text-[11px] font-normal text-muted-foreground">{prompt.length}/4000</span>
                    </span>
                    <textarea
                      value={prompt}
                      onChange={(e) => { setPrompt(e.target.value); setEscolhido(null) }}
                      rows={6}
                      disabled={ocupado}
                      placeholder="Escolha um cartão acima ou descreva a imagem: o que aparece, o enquadramento, a luz, as cores…"
                      className={`mt-1 ${inputClass}`}
                    />
                  </label>
                </section>

                <section>
                  <p className="mb-1.5 text-sm font-medium">Capricho</p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUALIDADES.map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setQualidade(q.id)}
                        title={q.dica}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          qualidade === q.id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
                        }`}
                      >
                        {q.rotulo}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {QUALIDADES.find((q) => q.id === qualidade)?.dica}
                  </p>
                </section>

                <section className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
                  <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                    Os pedidos prontos já proíbem <strong>pessoas</strong> e o <strong>emblema da cruz vermelha</strong>.
                    O emblema é símbolo protegido pelas Convenções de Genebra — uma versão saída de um gerador não pode
                    sair no canal oficial. E imagem que finja registro de atendimento custa a credibilidade do que a
                    instituição mostra. Se escrever o pedido à mão, mantenha essas duas linhas.
                  </p>
                </section>

                {erro && <p className="text-sm text-destructive">{erro}</p>}
              </>
            )}
          </div>
        )}

        {!pronta && !semMateria && (
          <footer className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-6 py-3">
            <Button variant="ghost" onClick={onFechar} disabled={ocupado}>Cancelar</Button>
            <Button onClick={gerarAgora} disabled={ocupado || prompt.trim().length < 15}>
              {gerando ? <><Loader2 className="size-4 animate-spin" />Gerando… pode levar um minuto</> : <><Sparkles className="size-4" />Gerar imagem</>}
            </Button>
          </footer>
        )}
      </Card>
    </div>,
    document.body,
  )
}

function CartaoDeEstilo({ estilo, ativo, onEscolher }: {
  estilo: Estilo
  ativo: boolean
  onEscolher: () => void
}) {
  return (
    <button
      type="button"
      onClick={onEscolher}
      className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
        ativo ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:bg-muted'
      }`}
    >
      <span className="block text-xs font-semibold">{estilo.rotulo}</span>
      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{estilo.resumo}</span>
    </button>
  )
}

/**
 * Propõe a legenda deste canal a partir do texto-mestre.
 *
 * A resposta do modelo entra como PROPOSTA, lado a lado com o que está
 * escrito, e só substitui a legenda se alguém aceitar. Texto institucional que
 * troca sozinho é texto que ninguém leu antes de publicar.
 */
function AdaptarComIa({ destino, onAceitar }: {
  destino: DestinoRegistro
  onAceitar: (texto: string) => void
}) {
  const [pensando, iniciar] = useTransition()
  const [proposta, setProposta] = useState('')
  const [erro, setErro] = useState('')

  function pedir() {
    setErro('')
    iniciar(async () => {
      const form = new FormData()
      form.set('destinoId', destino.id)
      const r = await adaptarLegendaDoDestino(form)
      if (r.erro) { setErro(r.erro); return }
      setProposta(r.texto ?? '')
    })
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={pedir}
        disabled={pensando}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-40"
        title="Propõe a legenda no limite deste canal, a partir da notícia"
      >
        {pensando ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        {pensando ? 'Pensando…' : 'Adaptar com IA'}
      </button>

      {(proposta || erro) && (
        <span className="absolute right-0 top-full z-20 mt-2 block w-[min(30rem,78vw)] rounded-lg border border-border bg-background p-3 text-left shadow-xl">
          {erro
            ? <span className="block text-xs text-destructive">{erro}</span>
            : (
              <>
                <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="size-3" />Proposta da IA — confira antes de aceitar
                </span>
                <span className="block whitespace-pre-wrap text-sm font-normal">{proposta}</span>
                <span className="mt-2 flex items-center gap-2">
                  <Button size="sm" onClick={() => { onAceitar(proposta); setProposta('') }}>
                    <Check className="size-3.5" />Usar esta
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setProposta('')}>Descartar</Button>
                </span>
              </>
            )}
        </span>
      )}
    </span>
  )
}

/**
 * Envia foto ou vídeo sem sair do pacote.
 *
 * Antes, a única porta era a Biblioteca, em outra tela: quem montava o pacote
 * lia "adicione mídias na tab Mestre primeiro", ia até lá, encontrava a mesma
 * grade vazia e não tinha o que clicar. Um destino de Stories, que exige uma
 * mídia, ficava impossível de completar sem abandonar a tela.
 *
 * A declaração de uso de imagem continua obrigatória e explícita: é a regra da
 * instituição, e mídia enviada aqui vai para publicação por definição. Envio
 * direto do navegador ao armazenamento — vídeo não passa pela função.
 */
function BotaoEnviarMidia({ workspaceId, somenteFoto, onEnviada }: {
  workspaceId: string
  somenteFoto?: boolean
  onEnviada: (arquivo: ArquivoDaBiblioteca) => void
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [escolhido, setEscolhido] = useState<File | null>(null)
  const [autorizado, setAutorizado] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  function limpar() {
    setEscolhido(null)
    setAutorizado(false)
    setProgresso(0)
    if (entrada.current) entrada.current.value = ''
  }

  async function enviar() {
    if (!escolhido || !autorizado) return
    setErro('')
    setEnviando(true)
    try {
      const salvo = await enviarParaBiblioteca(escolhido, {
        workspaceId,
        tags: ['redes'],
        autorizacao: 'authorized',
        onProgresso: setProgresso,
      })
      onEnviada({
        id: salvo.id,
        nome: escolhido.name,
        tipo: escolhido.type.startsWith('video/') ? 'video' : 'foto',
        contentType: escolhido.type,
        tamanho: escolhido.size,
        previa: salvo.previa,
        // Enviado daqui já vai autorizado: a caixa de confirmação acima é
        // exatamente essa declaração.
        autorizacao: 'authorized',
      })
      limpar()
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não foi possível enviar o arquivo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-w-56 flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={enviando}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-40"
      >
        <UploadCloud className="size-3.5" />{somenteFoto ? 'Enviar foto' : 'Enviar foto ou vídeo'}
      </button>
      <input
        ref={entrada}
        type="file"
        accept={somenteFoto ? 'image/*' : 'image/*,video/*'}
        className="hidden"
        onChange={(e) => { setEscolhido(e.target.files?.[0] ?? null); setErro('') }}
      />

      {escolhido && (
        <div className="w-full rounded-lg border border-border bg-muted/40 p-3">
          <p className="truncate text-xs font-medium">{escolhido.name}</p>
          <p className="text-[11px] text-muted-foreground">{(escolhido.size / 1024 / 1024).toFixed(1)} MB</p>
          <label className="mt-2 flex items-start gap-2 text-[11px] leading-snug">
            <input type="checkbox" checked={autorizado} onChange={(e) => setAutorizado(e.target.checked)} className="mt-0.5" />
            <span>Confirmo que há autorização de uso de imagem para publicar esta mídia.</span>
          </label>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" onClick={enviar} disabled={!autorizado || enviando}>
              {enviando ? <><Loader2 className="size-3.5 animate-spin" />{progresso}%</> : <>Enviar</>}
            </Button>
            <Button size="sm" variant="ghost" onClick={limpar} disabled={enviando}>Cancelar</Button>
          </div>
        </div>
      )}
      {erro && <p className="w-full text-[11px] text-destructive">{erro}</p>}
    </div>
  )
}

/**
 * As mídias disponíveis, com o estado de autorização de uso à vista.
 *
 * Esta grade mostrava só o que já estava autorizado. Parecia prudente e era o
 * contrário: a foto do post importado do Cérebro entra pendente, ficava
 * anexada ao pacote e não aparecia aqui — quem importava via as fotos antigas
 * da Biblioteca no lugar da foto da matéria, sem aviso nenhum, e não tinha
 * como autorizar o que não conseguia ver.
 *
 * Agora aparece tudo, com a diferença dita:
 *
 *  - autorizada: escolhe e publica;
 *  - pendente: escolhe, aparece marcada, e a peça acusa erro enquanto a
 *    autorização não for confirmada — que se confirma aqui mesmo;
 *  - uso interno: material de terceiro. Aparece como referência e não pode
 *    ser escolhida, porque não sai publicada em nome da Cruz Vermelha.
 */
function GradeDaBiblioteca({ biblioteca, selecionados, onMudar, limite, desabilitado, filtroTipo, onAutorizar }: {
  biblioteca: ArquivoDaBiblioteca[]
  selecionados: string[]
  onMudar: (ids: string[]) => void
  limite: number
  desabilitado?: boolean
  filtroTipo?: 'foto' | 'video'
  /** Sem isto a mídia pendente ainda aparece marcada — só não dá para liberar daqui. */
  onAutorizar?: (arquivo: ArquivoDaBiblioteca) => void
}) {
  const [confirmando, setConfirmando] = useState<ArquivoDaBiblioteca | null>(null)
  const lista = filtroTipo ? biblioteca.filter((a) => a.tipo === filtroTipo) : biblioteca
  function alternar(id: string) {
    if (desabilitado) return
    // Material de terceiro não entra em peça nenhuma: é referência.
    if (biblioteca.find((a) => a.id === id)?.autorizacao === 'internal') return
    if (selecionados.includes(id)) { onMudar(selecionados.filter((x) => x !== id)); return }
    if (selecionados.length >= limite) return
    onMudar([...selecionados, id])
  }
  if (!lista.length) {
    return <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
      {filtroTipo === 'video'
        ? 'Nenhum vídeo disponível ainda. Envie um aqui ou pela Biblioteca.'
        : filtroTipo === 'foto'
          ? 'Nenhuma foto disponível ainda. Envie uma aqui ou pela Biblioteca.'
          : 'Nenhuma foto ou vídeo disponível ainda. Envie um aqui ou pela Biblioteca.'}
    </p>
  }
  const pendentesEscolhidas = lista.filter((a) => selecionados.includes(a.id) && a.autorizacao === 'pending')

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {lista.map((a) => {
        const ordem = selecionados.indexOf(a.id)
        const interna = a.autorizacao === 'internal'
        const pendente = a.autorizacao === 'pending'
        return (
          <button key={a.id} type="button" onClick={() => alternar(a.id)} disabled={desabilitado || interna}
            className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
              ordem >= 0 ? (pendente ? 'border-amber-500' : 'border-primary') : 'border-transparent hover:border-border'
            } ${interna ? 'cursor-not-allowed' : ''}`}
            title={interna
              ? `${a.nome} — uso interno: material de terceiro, não publica em nome da Cruz Vermelha`
              : pendente ? `${a.nome} — falta confirmar a autorização de uso de imagem` : a.nome}
          >
            {a.tipo === 'video'
              ? <video src={a.previa} muted playsInline preload="metadata" className={`size-full object-cover ${interna ? 'opacity-45' : ''}`} />
              : <img src={a.previa} alt={a.nome} className={`size-full object-cover ${interna ? 'opacity-45' : ''}`} />}
            {ordem >= 0 && (
              <span className={`absolute left-1 top-1 flex size-5 items-center justify-center rounded-full text-[11px] font-bold ${pendente ? 'bg-amber-500 text-white' : 'bg-primary text-primary-foreground'}`}>{ordem + 1}</span>
            )}
            {(pendente || interna) && (
              <span
                className={`absolute inset-x-0 bottom-0 truncate px-1 py-0.5 text-[9px] font-semibold text-white ${interna ? 'bg-neutral-700/85' : 'bg-amber-600/90'}`}
              >
                {interna ? 'uso interno' : 'falta autorizar'}
              </span>
            )}
            {a.geradaPorIa && (
              <span className="absolute right-1 top-1 flex items-center gap-0.5 rounded bg-foreground/75 px-1 py-0.5 text-[9px] font-semibold text-background" title="Imagem gerada por IA">
                <Sparkles className="size-2.5" />IA
              </span>
            )}
          </button>
        )
      })}
      </div>

      {/* A confirmação fica junto do que foi escolhido, não numa outra tela.
          Quem decide sobre a foto é quem está olhando para ela. */}
      {onAutorizar && !desabilitado && pendentesEscolhidas.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1">
            <span className="font-medium">{a.nome}</span> ainda não tem autorização de uso de imagem — a peça não sai assim.
          </span>
          <button
            type="button"
            onClick={() => setConfirmando(a)}
            className="rounded-md border border-amber-600/50 px-2 py-1 font-medium text-amber-800 transition-colors hover:bg-amber-500/20 dark:text-amber-300"
          >
            Autorizar uso
          </button>
        </div>
      ))}

      {confirmando && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
          <p className="font-medium">Autorizar “{confirmando.nome}”?</p>
          <p className="mt-1 text-muted-foreground">
            Confirmo que há autorização de uso de imagem das pessoas que aparecem nesta mídia para publicação pela Cruz
            Vermelha Brasileira — Rio de Janeiro. Isto fica registrado na Biblioteca e vale para todos os usos deste arquivo.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => { onAutorizar?.(confirmando); setConfirmando(null) }}>
              <Check className="size-3.5" />Confirmo
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmando(null)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function EditorCanal({ destino, arquivoPorId, fileIdsDoMestre, midiasNoTextoDoMestre, mestre, onEditar, onPronta, onRealimentar, onReprocessar, encerrado, workspaceId, onNovaMidia, onAutorizarMidia, iaDisponivel, onRecarregarBiblioteca }: {
  destino: DestinoRegistro
  arquivoPorId: Map<string, ArquivoDaBiblioteca>
  fileIdsDoMestre: string[]
  midiasNoTextoDoMestre: number
  /** O texto-mestre alimenta as sugestões de imagem: elas falam da matéria. */
  mestre: MestreRegistro
  onEditar: (mudanca: Partial<DestinoRegistro>) => void
  onPronta: () => void
  onRealimentar: () => void
  onReprocessar: () => void
  encerrado: boolean
  workspaceId: string
  onNovaMidia: (arquivo: ArquivoDaBiblioteca) => void
  onAutorizarMidia: (arquivo: ArquivoDaBiblioteca) => void
  iaDisponivel: boolean
  onRecarregarBiblioteca: () => void
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
  // O formato manda no que pode ser oferecido: Reels sem vídeo e Perfil do
  // Google com vídeo são recusas da API, não escolhas de quem publica.
  const filtroDeTipo = formato.midia.video === 'obrigatorio' ? 'video' as const
    : formato.midia.video === 'nao' ? 'foto' as const
    : undefined

  const midiasEscolhidas = destino.fileIds
    .map((id) => arquivoPorId.get(id))
    .filter((a): a is ArquivoDaBiblioteca => Boolean(a))
  const temImagemDeIa = midiasEscolhidas.some((a) => a.geradaPorIa)

  /** Mídia enviada daqui já entra selecionada neste destino, até o teto. */
  function acolherAqui(arquivo: ArquivoDaBiblioteca) {
    onNovaMidia(arquivo)
    if (destino.fileIds.includes(arquivo.id)) return
    onEditar({ fileIds: [...destino.fileIds, arquivo.id].slice(0, formato.midia.max) })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {eSite && <Globe className="size-4" />}
          {canal.nome} · {formato.rotulo}
          {destino.descolada && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">escrita à mão — não acompanha mais a notícia</span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {destino.descolada && !congelado && (
            <Button size="sm" variant="ghost" onClick={onRealimentar} title="Descarta esta edição e gera de novo a partir da notícia">
              <RefreshCw className="size-3.5" />Voltar a seguir a notícia
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

      <label className="text-sm font-medium">
        <span className="flex items-center justify-between gap-2">
          {eSite ? 'Texto da página' : 'Legenda'}
          <span className="flex items-center gap-1.5">
            {!eSite && temMarcacaoVisivel(destino.corpo) && !congelado && (
              <button
                type="button"
                onClick={() => onEditar({ corpo: textoParaRede(destino.corpo).texto })}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted"
                title="Tira **, ## e linhas de foto — a rede publicaria tudo isso literalmente"
              >
                <Eraser className="size-3.5" />Limpar marcação
              </button>
            )}
            {!eSite && iaDisponivel && !congelado && (
              <AdaptarComIa destino={destino} onAceitar={(texto) => onEditar({ corpo: texto })} />
            )}
          </span>
        </span>
        {eSite ? (
          <div className="mt-1">
            <CampoDaMateria
              valor={destino.corpo}
              onMudar={(v) => onEditar({ corpo: v })}
              desabilitado={congelado}
              max={formato.texto.max}
              tamanho={tamanho}
              estourou={estourou}
              workspaceId={workspaceId}
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
            Acima de {formato.texto.dobra} o leitor vê “…mais” — o essencial precisa estar antes disso.
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
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <p className="pt-1 text-sm font-medium">
              Mídias deste destino <span className="font-normal text-muted-foreground">({formato.midia.min === 0 ? 'até' : `${formato.midia.min} a`} {formato.midia.max}{formato.midia.video === 'obrigatorio' ? ' · só vídeo' : formato.midia.video === 'nao' ? ' · só foto' : ''})</span>
            </p>
            <span className="flex flex-wrap items-start gap-2">
              {!congelado && iaDisponivel && formato.midia.video !== 'obrigatorio' && (
                <GerarImagemComIa
                  destino={destino}
                  canal={`${canal.nome} · ${formato.rotulo}`}
                  proporcao={formato.midia.proporcaoPreferida}
                  mestre={mestre}
                  cheio={destino.fileIds.length >= formato.midia.max}
                  onMudou={onRecarregarBiblioteca}
                />
              )}
              {!congelado && (
                <BotaoEnviarMidia workspaceId={workspaceId} somenteFoto={filtroDeTipo === 'foto'} onEnviada={acolherAqui} />
              )}
            </span>
          </div>
          <GradeDaBiblioteca
            biblioteca={midiasDoMestre}
            selecionados={destino.fileIds}
            onMudar={(ids) => onEditar({ fileIds: ids })}
            limite={formato.midia.max}
            desabilitado={congelado}
            filtroTipo={filtroDeTipo}
            onAutorizar={onAutorizarMidia}
          />
          {temImagemDeIa && (
            <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
              <Sparkles className="mt-0.5 size-3 shrink-0" />
              <span>
                Este destino leva imagem gerada por IA. Ela sai declarada como sintética para a rede — e não deve
                ilustrar como registro fotográfico algo que não aconteceu.
              </span>
            </p>
          )}
          {!eSite && midiasNoTextoDoMestre > 0 && destino.fileIds.length === 0 && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-500">
              O texto da notícia tem {midiasNoTextoDoMestre === 1 ? 'uma foto escrita no meio do texto' : `${midiasNoTextoDoMestre} fotos escritas no meio do texto`}.
              Isso vale para a página do site; em rede social a mídia é anexo — escolha acima qual vai junto.
            </p>
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
function CampoDaMateria({ valor, onMudar, desabilitado, max, tamanho, estourou, workspaceId }: {
  valor: string
  onMudar: (v: string) => void
  desabilitado: boolean
  max: number
  tamanho: number
  estourou: boolean
  workspaceId: string
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  // Parágrafo é a unidade do formato: a linha de mídia mora sozinha em um.
  // Texto vindo de fora chega com quebra do Windows: sem normalizar, o corpo
  // inteiro é um parágrafo só e o painel de fotos abaixo nunca acha nenhuma.
  const paragrafos = useMemo(() => normalizarQuebras(valor).split(/\n\n+/), [valor])
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

  /** Numera as linhas selecionadas — a ordem é o que a lista numerada carrega. */
  function numerarLinhas() {
    const el = areaRef.current
    if (!el) return
    const inicio = valor.lastIndexOf('\n', el.selectionStart - 1) + 1
    const quebra = valor.indexOf('\n', el.selectionEnd)
    const fim = quebra === -1 ? valor.length : quebra
    const trecho = valor.slice(inicio, fim).split('\n')
      .map((linha, i) => (/^\d+\.\s/.test(linha) ? linha : `${i + 1}. ${linha.replace(/^[-*]\s+/, '')}`))
      .join('\n')
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
      // Direto do navegador ao armazenamento: pela função serverless, a Vercel
      // corta o corpo em 4,5 MB e foto de celular já batia nesse teto.
      const salvo = await enviarParaBiblioteca(arquivo, { workspaceId, tags: ['materia'] })
      // A foto entra sem legenda de propósito: o nome do arquivo ("IMG_2043")
      // viraria legenda na página. O painel abaixo pede o texto de verdade.
      inserirBloco(mediaToken('image', salvo.previa, ''))
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
        <button type="button" className={botao} disabled={desabilitado} onClick={numerarLinhas}><ListOrdered className="size-3.5" />Numerada</button>
        <span className="mx-1 h-4 w-px bg-border" />
        <button type="button" className={botao} disabled={desabilitado} onClick={() => envolver('**', '**', 'negrito')} title="Negrito"><Bold className="size-3.5" /></button>
        <button type="button" className={botao} disabled={desabilitado} onClick={() => envolver('*', '*', 'itálico')} title="Itálico"><Italic className="size-3.5" /></button>
        <button type="button" className={botao} disabled={desabilitado} onClick={inserirLink} title="Link"><Link2 className="size-3.5" /></button>
        <button
          type="button"
          className={`${botao} ml-auto`}
          disabled={desabilitado || !valor.trim()}
          onClick={() => onMudar(arrumarTexto(valor))}
          title="Põe o texto todo no padrão: títulos, listas, negrito e parágrafos"
        >
          <Wand2 className="size-3.5" />Ajustar formatação
        </button>
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
          onPaste={(e) => {
            const colado = colagemNoFormato(e, valor)
            if (!colado) return
            e.preventDefault()
            onMudar(colado.texto)
            focarEm(colado.inicio, colado.fim)
          }}
          rows={14}
          disabled={desabilitado}
          className={inputClass}
        />
        <span className={`pointer-events-none absolute bottom-2 right-2 rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-medium ${estourou ? 'text-destructive' : 'text-muted-foreground'}`}>
          {tamanho}/{max}
        </span>
      </div>
      <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
        Texto colado de IA ou de documento entra já no padrão: títulos, listas e negrito são convertidos.
        A foto fica onde você a inseriu — se estiver antes do primeiro parágrafo, abre a matéria em destaque.
      </span>
      {erro && <p className="mt-1 text-xs text-destructive">{erro}</p>}

      {fotos.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fotos no texto</p>
          {fotos.map((foto) => (
            <div key={`${foto.indice}-${foto.url}`} className="flex items-start gap-3 rounded-lg border border-border p-2">
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
  const [escolhido, setEscolhido] = useState(destino.fileIds[0] ?? '')
  // Derivado, não corrigido por efeito: quando a mídia escolhida sai da lista,
  // o controle já desenha a próxima em vez de passar um quadro apontando para
  // um arquivo que não está mais lá.
  const selecionado = destino.fileIds.includes(escolhido) ? escolhido : (destino.fileIds[0] ?? '')
  const arquivo = arquivoPorId.get(selecionado)
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
                <button key={id} type="button" onClick={() => setEscolhido(id)}
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
  mestre: { titulo: string; subtitulo: string; legendas?: Record<string, LegendaDaMidia> }
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
  if (destino.canal === 'newsletter') {
    return <PreviaNewsletter destino={destino} mestre={mestre} arquivoPorId={arquivoPorId} />
  }
  // A key remonta a prévia ao trocar de destino — é o que devolve o carrossel
  // ao primeiro slide, sem um efeito zerando estado depois do desenho.
  return <PreviaRede key={destino.id} destino={destino} arquivoPorId={arquivoPorId} />
}

/**
 * A prévia do site É o gerador real: o mesmo módulo que monta a página
 * publicada renderiza dentro de um iframe. Mockup que diverge da página de
 * verdade é mentira com boa intenção.
 */
function PreviaSite({ destino, mestre, arquivoPorId }: {
  destino: DestinoRegistro
  mestre: { titulo: string; subtitulo: string; legendas?: Record<string, LegendaDaMidia> }
  arquivoPorId: Map<string, ArquivoDaBiblioteca>
}) {
  const html = useMemo(() => {
    const arquivos = new Map<string, { nome: string; alt: string }>()
    // Mídias entram na prévia como blocos, pelo MESMO módulo que o disparo
    // usa: era por montarem isto separado que a prévia e a página publicada
    // erravam igual, com o nome do arquivo no lugar da legenda.
    const anexadas = destino.fileIds
      .map((id) => ({ id, arquivo: arquivoPorId.get(id) }))
      .filter((m): m is { id: string; arquivo: ArquivoDaBiblioteca } => Boolean(m.arquivo))
    // `alt` fica vazio de propósito: a descrição da foto é a legenda escrita,
    // que já viaja no bloco. Pôr o nome do arquivo aqui era o que fazia a
    // prévia mostrar "cerebro-9093f620.jpg" embaixo da imagem.
    for (const m of anexadas) arquivos.set(m.arquivo.previa, { nome: m.arquivo.previa, alt: '' })
    let corpo = corpoComMidias(
      destino.corpo,
      anexadas.map((m) => ({ id: m.id, url: m.arquivo.previa })),
      mestre.legendas ?? {},
    )
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

/**
 * A prévia da newsletter É o gerador real, como a do site: o mesmo módulo que
 * monta a mensagem enviada renderiza dentro do iframe. Prévia que diverge do
 * que sai seria pior aqui do que em qualquer outro canal — e-mail enviado não
 * se corrige.
 *
 * A capa aparece só quando o pacote também publica no site, porque é a
 * publicação no site que torna a imagem pública: cliente de e-mail não
 * autentica, e a Biblioteca é privada. A prévia mostra a imagem local para dar
 * a ideia do enquadramento, com o aviso ao lado.
 */
function PreviaNewsletter({ destino, mestre, arquivoPorId }: {
  destino: DestinoRegistro
  mestre: { titulo: string; subtitulo: string }
  arquivoPorId: Map<string, ArquivoDaBiblioteca>
}) {
  const capa = destino.fileIds
    .map((id) => arquivoPorId.get(id))
    .find((a): a is ArquivoDaBiblioteca => Boolean(a) && a!.tipo === 'foto')

  const html = useMemo(() => emailDaNewsletter({
    titulo: destino.extras.assunto || mestre.titulo || 'Sem assunto',
    chamada: destino.extras.chamada,
    paragrafos: (destino.corpo || '').split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean),
    urlDaMateria: 'https://cruzvermelhariodejaneiro.org/noticias/exemplo/',
    rotuloDoBotao: destino.extras.rotuloDoBotao,
    imagemUrl: capa?.previa,
    urlDeSaida: 'https://redacao.cruzvermelhariodejaneiro.org/newsletter/sair?t=previa',
  }).html, [destino, mestre, capa])

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prévia do e-mail</p>
        <span className="truncate text-[10px] text-muted-foreground">
          Assunto: {destino.extras.assunto || '(vazio)'}
        </span>
      </div>
      <iframe srcDoc={html} title="Prévia da newsletter" sandbox="allow-same-origin" className="h-96 w-full bg-white" />
      <p className="border-t border-border px-4 py-2 text-[11px] leading-relaxed text-muted-foreground">
        O botão só aparece no envio real se o pacote também publicar no site.
        {capa ? ' A capa também depende disso: e-mail não abre imagem da Biblioteca, que é privada.' : ''}
      </p>
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

function ValidacaoDoDestino({ destino, dadosPorArquivo }: {
  destino: DestinoRegistro
  dadosPorArquivo: Record<string, DadosDoArquivo>
}) {
  const avisos: Aviso[] = useMemo(
    () => validarVariante({ corpo: destino.corpo, extras: destino.extras, fileIds: destino.fileIds }, destino.canal, destino.formato, dadosPorArquivo),
    [destino, dadosPorArquivo],
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
