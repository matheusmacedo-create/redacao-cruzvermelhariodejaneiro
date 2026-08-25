'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ExternalLink, Heart, Loader2, MessageCircle, Play, RefreshCw,
  Send, Share2, TriangleAlert, Image as ImageIcon, Film, Type as TypeIcon, Layers,
  Upload, X as XIcon, Check, ShieldCheck, Smile,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmojiPicker } from '@/components/app/emoji-picker'
import { publicarNasRedes, atualizarStatusPublicacao } from '@/app/actions/redes'
import { upload } from '@vercel/blob/client'
import { caminhoDaBiblioteca } from '@/lib/storage'
import { conferir, tambemAceitam, type Achado, type Midia } from '@/lib/publicacao/requisitos'

/** Espelha FORMATOS do cliente da API. Mantido aqui porque este arquivo roda no
 * navegador e não pode importar código marcado com 'server-only'. */
const FORMATOS = {
  texto: { rotulo: 'Texto', icone: TypeIcon, midia: 'nenhuma',
    redes: ['facebook', 'linkedin', 'x', 'threads', 'bluesky', 'google_business'],
    dica: 'Post escrito. Link vira card de pré-visualização.' },
  feed: { rotulo: 'Feed', icone: ImageIcon, midia: 'imagem',
    redes: ['instagram', 'facebook', 'linkedin', 'x', 'threads', 'bluesky', 'pinterest', 'google_business'],
    dica: 'Imagem quadrada com legenda. Fica no perfil.' },
  stories: { rotulo: 'Stories', icone: Layers, midia: 'imagem-ou-video',
    redes: ['instagram', 'facebook'],
    dica: 'Vertical, some em 24 horas. A legenda não aparece.' },
  reels: { rotulo: 'Reels', icone: Film, midia: 'video',
    redes: ['instagram', 'facebook'],
    dica: 'Vídeo vertical. Alcança quem ainda não segue.' },
} as const

type Formato = keyof typeof FORMATOS

const REDES: Record<string, { nome: string; cor: string }> = {
  instagram: { nome: 'Instagram', cor: 'bg-[#C13584] text-white border-[#C13584]' },
  facebook: { nome: 'Facebook', cor: 'bg-[#1877F2] text-white border-[#1877F2]' },
  linkedin: { nome: 'LinkedIn', cor: 'bg-[#0A66C2] text-white border-[#0A66C2]' },
  x: { nome: 'X', cor: 'bg-foreground text-background border-foreground' },
  threads: { nome: 'Threads', cor: 'bg-foreground text-background border-foreground' },
  bluesky: { nome: 'Bluesky', cor: 'bg-[#0085FF] text-white border-[#0085FF]' },
  pinterest: { nome: 'Pinterest', cor: 'bg-[#E60023] text-white border-[#E60023]' },
  google_business: { nome: 'Perfil do Google', cor: 'bg-[#1A73E8] text-white border-[#1A73E8]' },
}

const LIMITES: Record<string, number> = {
  bluesky: 300, linkedin: 3_000, instagram: 2_200, pinterest: 500, google_business: 1_500,
}

export type ArquivoDaBiblioteca = {
  id: string
  nome: string
  tipo: 'foto' | 'video'
  contentType: string
  tamanho: number
  previa: string
}

export type PublicacaoRegistro = {
  id: string
  redes: string[]
  corpo: string
  status: string
  criadaEm: string
  agendadaPara: string | null
  erro: string | null
  formato?: string
  resultados: Array<{ rede: string; ok: boolean; mensagem: string | null; url: string | null; pulada: boolean }>
}

const ROTULO_STATUS: Record<string, string> = {
  pending: 'aguardando', queued: 'na fila', processing: 'processando',
  in_progress: 'em andamento', completed: 'publicado', failed: 'falhou',
}

const ehVideo = (url: string) => /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url)

export function PublicadorRedes({
  contentId,
  textoInicial,
  linkInicial = '',
  publicacoes = [],
  podeConectar = false,
  perfil = 'cruzvermelhabrasileirj',
  workspaceId,
}: {
  contentId?: string
  textoInicial: string
  linkInicial?: string
  publicacoes?: PublicacaoRegistro[]
  podeConectar?: boolean
  perfil?: string
  /** Necessário para montar o caminho do arquivo no armazenamento. */
  workspaceId: string
}) {
  const router = useRouter()
  const [enviando, iniciarEnvio] = useTransition()
  const [formato, setFormato] = useState<Formato>('feed')
  const [selecionadas, setSelecionadas] = useState<string[]>([])
  const [corpo, setCorpo] = useState(textoInicial)
  const [linkUrl, setLinkUrl] = useState(linkInicial)
  const [midiaUrl, setMidiaUrl] = useState('')
  const [arquivo, setArquivo] = useState<ArquivoDaBiblioteca | null>(null)
  const [midia, setMidia] = useState<Midia | null>(null)
  const [agendarPara, setAgendarPara] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [emojiAberto, setEmojiAberto] = useState(false)
  const areaTexto = useRef<HTMLTextAreaElement>(null)

  // Insere no cursor, não no fim: emoji quase sempre entra no meio da frase.
  function inserirEmoji(emoji: string) {
    const area = areaTexto.current
    const pos = area?.selectionStart ?? corpo.length
    setCorpo(corpo.slice(0, pos) + emoji + corpo.slice(area?.selectionEnd ?? pos))
    setEmojiAberto(false)
    requestAnimationFrame(() => {
      area?.focus()
      const destino = pos + emoji.length
      area?.setSelectionRange(destino, destino)
    })
  }

  const [conectadas, setConectadas] = useState<string[] | null>(null)
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'sem-chave' | 'indisponivel'>('carregando')

  useEffect(() => {
    let ativo = true
    fetch('/api/redes/conectadas', { cache: 'no-store' })
      .then((r) => r.json())
      .then((dados) => {
        if (!ativo) return
        setConectadas(dados.redes ?? [])
        setEstado(!dados.configurado ? 'sem-chave' : dados.indisponivel ? 'indisponivel' : 'ok')
      })
      .catch(() => { if (ativo) setEstado('indisponivel') })
    return () => { ativo = false }
  }, [])

  const previaUrl = arquivo?.previa || midiaUrl
  const midiaEhVideo = arquivo ? arquivo.tipo === 'video' : ehVideo(midiaUrl)

  // Medir no navegador é o único jeito de saber as dimensões sem decodificar o
  // arquivo no servidor. O tamanho vem do registro da Biblioteca quando existe.
  useEffect(() => {
    if (!previaUrl) { setMidia(null); return }
    let ativo = true
    const tamanho = arquivo?.tamanho

    if (midiaEhVideo) {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.onloadedmetadata = () => {
        if (ativo) setMidia({ largura: v.videoWidth, altura: v.videoHeight, duracao: v.duration, tamanho })
      }
      v.onerror = () => { if (ativo) setMidia(null) }
      v.src = previaUrl
    } else {
      const img = new Image()
      img.onload = () => {
        if (ativo) setMidia({ largura: img.naturalWidth, altura: img.naturalHeight, tamanho })
      }
      img.onerror = () => { if (ativo) setMidia(null) }
      img.src = previaUrl
    }
    return () => { ativo = false }
  }, [previaUrl, midiaEhVideo, arquivo?.tamanho])

  const spec = FORMATOS[formato]

  const achados: Achado[] = useMemo(
    () => (selecionadas.length ? conferir({ formato, redes: selecionadas, texto: corpo, midia }) : []),
    [formato, selecionadas, corpo, midia],
  )
  const temErro = achados.some((a) => a.nivel === 'erro')

  const sugestoes = useMemo(
    () => (conectadas && selecionadas.length
      ? tambemAceitam({ formato, jaMarcadas: selecionadas, conectadas, texto: corpo, midia })
      : []),
    [formato, selecionadas, conectadas, corpo, midia],
  )

  // Trocar de formato não pode deixar para trás uma rede que o novo não aceita:
  // o envio seria recusado por algo que a tela não mostra mais.
  function trocarFormato(novo: Formato) {
    // Reels só aceita vídeo; manter uma foto escolhida ali só produziria erro.
    if (novo === 'reels' && arquivo?.tipo === 'foto') setArquivo(null)
    setFormato(novo)
    setSelecionadas((atual) => atual.filter((r) => (FORMATOS[novo].redes as readonly string[]).includes(r)))
    setErro('')
  }

  const alternar = (id: string) =>
    setSelecionadas((atual) => (atual.includes(id) ? atual.filter((r) => r !== id) : [...atual, id]))

  const limite = useMemo(() => selecionadas.reduce<number | null>((menor, rede) => {
    const l = LIMITES[rede]
    if (!l) return menor
    return menor === null ? l : Math.min(menor, l)
  }, null), [selecionadas])

  const precisaMidia = spec.midia !== 'nenhuma' && !midiaUrl.trim() && !arquivo
  const excedeu = limite !== null && corpo.length > limite
  const exigeTexto = formato !== 'stories'
  const bloqueado = enviando || !selecionadas.length || estado !== 'ok'
    || (exigeTexto && corpo.trim().length < 2) || precisaMidia || excedeu || temErro

  function enviar() {
    setErro(''); setAviso('')
    const form = new FormData()
    if (contentId) form.set('contentId', contentId)
    form.set('formato', formato)
    for (const rede of selecionadas) form.append('redes', rede)
    form.set('corpo', corpo)
    form.set('linkUrl', linkUrl.trim())
    form.set('midiaUrl', arquivo ? '' : midiaUrl.trim())
    if (arquivo) form.set('fileId', arquivo.id)
    form.set('agendarPara', agendarPara)

    iniciarEnvio(async () => {
      try {
        await publicarNasRedes(form)
        setAviso(agendarPara ? 'Publicação agendada.' : 'Enviado. O resultado por rede aparece abaixo em segundos.')
        setSelecionadas([])
        setArquivo(null)
        router.refresh()
      } catch (causa) {
        setErro(causa instanceof Error ? causa.message : 'Não foi possível publicar.')
      }
    })
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="size-4" />
            Publicar nas redes
          </CardTitle>
          <CardDescription>{spec.dica}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {estado === 'sem-chave' && <Alerta>A integração com as redes ainda não foi configurada neste ambiente.</Alerta>}
          {estado === 'indisponivel' && <Alerta>Não foi possível consultar as redes conectadas agora. Tente em instantes.</Alerta>}

          {/* Formato */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Formato</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(FORMATOS) as Formato[]).map((id) => {
                const F = FORMATOS[id]
                const Icone = F.icone
                const ativo = formato === id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => trocarFormato(id)}
                    aria-pressed={ativo}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-colors ${
                      ativo ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <Icone className="size-4" />
                    {F.rotulo}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Redes */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Onde publicar
            </p>
            <div className="flex flex-wrap gap-2">
              {spec.redes.map((id) => {
                const rede = REDES[id]
                const conectada = conectadas === null || conectadas.includes(id)
                const marcada = selecionadas.includes(id)
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!conectada || estado !== 'ok'}
                    onClick={() => alternar(id)}
                    aria-pressed={marcada}
                    title={conectada ? undefined : 'Conta não conectada'}
                    className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-35 ${
                      marcada ? rede.cor : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {rede.nome}
                  </button>
                )
              })}
            </div>
            {conectadas?.length === 0 && estado === 'ok' && (
              <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-sm text-muted-foreground">
                  Nenhuma conta conectada ainda.
                  {podeConectar ? ' Autorize as contas oficiais para liberar a publicação.' : ' Peça a um administrador para autorizar.'}
                </p>
                {podeConectar && (
                  <Button variant="outline" size="lg" className="mt-3" render={<a href="/api/admin/redes-conectar" />}>
                    Conectar contas
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Texto */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {formato === 'stories' ? 'Texto (não aparece no Stories)' : 'Legenda'}
            </label>
            {/* O seletor se posiciona sozinho abaixo do botão (top-11), então o
                botão precisa vir antes da área de texto, não sobre ela. */}
            <div className="relative mb-1.5">
              <button
                type="button"
                aria-label="Inserir emoji"
                aria-expanded={emojiAberto}
                onClick={() => setEmojiAberto((v) => !v)}
                className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Smile className="size-4" />
              </button>
              {emojiAberto && <EmojiPicker onSelect={inserirEmoji} onClose={() => setEmojiAberto(false)} />}
            </div>
            <textarea
              ref={areaTexto}
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              rows={5}
              className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm outline-none focus-visible:border-ring"
              placeholder={formato === 'stories' ? 'Opcional — o Stories não exibe legenda' : 'Escreva a legenda da publicação'}
            />
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full transition-all ${excedeu ? 'bg-destructive' : 'bg-primary'}`}
                  style={{ width: `${Math.min(100, limite ? (corpo.length / limite) * 100 : corpo.length / 20)}%` }}
                />
              </div>
              <span className={`shrink-0 text-xs ${excedeu ? 'text-destructive' : 'text-muted-foreground'}`}>
                {corpo.length}{limite !== null && ` / ${limite}`}
              </span>
            </div>
          </div>

          {/* Mídia e opções */}
          <div className="grid gap-3 sm:grid-cols-2">
            {spec.midia !== 'nenhuma' && (
              <div className="sm:col-span-2">
                <SeletorDeMidia
                  workspaceId={workspaceId}
                  formato={formato}
                  arquivo={arquivo}
                  onEscolher={(a) => { setArquivo(a); setMidiaUrl('') }}
                  midiaUrl={midiaUrl}
                  onUrl={(v) => { setMidiaUrl(v); if (v) setArquivo(null) }}
                />
              </div>
            )}

            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Link da matéria (opcional)</span>
              <input
                type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://cruzvermelhariodejaneiro.org/noticias/..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Agendar (opcional)</span>
              <input
                type="datetime-local" value={agendarPara} onChange={(e) => setAgendarPara(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
              />
            </label>
          </div>

          {precisaMidia && (
            <p className="text-sm text-destructive">
              {spec.rotulo} exige {spec.midia === 'video' ? 'um vídeo' : spec.midia === 'imagem' ? 'uma imagem' : 'uma imagem ou vídeo'}.
              Informe a URL acima.
            </p>
          )}
          {achados.length > 0 && (
            <div className="space-y-1.5 rounded-lg border border-border p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <ShieldCheck className="size-3.5" />
                Conferência
              </p>
              {achados.map((a, i) => (
                <p key={i} className={`text-xs ${a.nivel === 'erro' ? 'text-destructive' : 'text-amber-600 dark:text-amber-500'}`}>
                  <span className="font-medium">{REDES[a.rede]?.nome ?? a.rede}</span>
                  {a.nivel === 'erro' ? ' recusa: ' : ' aceita, mas '}
                  {a.mensagem}
                </p>
              ))}
              {temErro && (
                <p className="pt-1 text-xs text-muted-foreground">
                  Corrija os itens em vermelho ou desmarque essas redes para liberar o envio.
                </p>
              )}
            </div>
          )}

          {selecionadas.length > 0 && !temErro && achados.length === 0 && midia && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-primary" />
              {midia.largura}×{midia.altura}
              {midia.duracao ? ` · ${Math.round(midia.duracao)}s` : ''} — tudo dentro do que as redes marcadas aceitam.
            </p>
          )}

          {sugestoes.length > 0 && (
            <div className="rounded-lg border border-dashed border-border p-3">
              <p className="text-xs text-muted-foreground">
                Este mesmo post também caberia em:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {sugestoes.map((rede) => (
                  <button
                    key={rede}
                    type="button"
                    onClick={() => alternar(rede)}
                    className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    + {REDES[rede]?.nome ?? rede}
                  </button>
                ))}
              </div>
            </div>
          )}

          {erro && <p className="text-sm text-destructive">{erro}</p>}
          {aviso && <p className="text-sm text-muted-foreground">{aviso}</p>}

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              {selecionadas.length
                ? `${selecionadas.length} ${selecionadas.length === 1 ? 'rede marcada' : 'redes marcadas'} · conta como 1 publicação`
                : 'Nenhuma rede marcada'}
            </p>
            <Button onClick={enviar} disabled={bloqueado} size="lg">
              {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {agendarPara ? 'Agendar' : 'Publicar agora'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-5">
        <Previa formato={formato} corpo={corpo} midiaUrl={previaUrl} eVideo={midiaEhVideo} midia={midia} perfil={perfil} />
        {publicacoes.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Envios recentes</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {publicacoes.map((pub) => <RegistroDeEnvio key={pub.id} publicacao={pub} />)}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function Alerta({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  )
}

/**
 * Prévia do post. Não é uma renderização fiel de cada rede — é o suficiente
 * para responder a pergunta que importa antes de publicar: a foto corta? a
 * legenda ficou grande demais? O Stories aparece em 9:16 justamente porque é
 * onde o enquadramento errado mais estraga.
 */
function Previa({ formato, corpo, midiaUrl, eVideo, midia, perfil }: {
  formato: Formato; corpo: string; midiaUrl: string; eVideo: boolean; midia: Midia | null; perfil: string
}) {
  const vertical = formato === 'stories' || formato === 'reels'
  const video = eVideo

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Prévia</CardTitle>
        <CardDescription className="text-xs">Aproximada — cada rede tem seu recorte.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mx-auto w-full max-w-[260px] overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 p-2.5">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              CV
            </span>
            <span className="truncate text-xs font-semibold">{perfil}</span>
          </div>

          <div className={`relative bg-muted ${vertical ? 'aspect-[9/16]' : 'aspect-square'}`}>
            {midiaUrl && !video && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={midiaUrl} alt="" className="size-full object-cover" />
            )}
            {midiaUrl && video && (
              <div className="flex size-full items-center justify-center bg-foreground/90">
                <Play className="size-8 text-background" />
              </div>
            )}
            {!midiaUrl && (
              <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
                {formato === 'texto'
                  ? <TypeIcon className="size-6" />
                  : <ImageIcon className="size-6" />}
                <span className="px-4 text-center text-[10px]">
                  {formato === 'texto' ? 'post sem mídia' : 'cole a URL da mídia'}
                </span>
              </div>
            )}
            {vertical && corpo && formato === 'reels' && (
              <p className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-foreground/80 to-transparent p-2 text-[10px] text-background">
                {corpo}
              </p>
            )}
          </div>

          {!vertical && (
            <div className="space-y-1.5 p-2.5">
              <div className="flex gap-3 text-muted-foreground">
                <Heart className="size-3.5" />
                <MessageCircle className="size-3.5" />
              </div>
              <p className="line-clamp-4 text-[11px] leading-snug">
                <span className="font-semibold">{perfil} </span>
                {corpo || <span className="text-muted-foreground">a legenda aparece aqui</span>}
              </p>
            </div>
          )}
          {formato === 'stories' && (
            <p className="p-2.5 text-[10px] text-muted-foreground">Stories não exibe legenda · some em 24h</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function RegistroDeEnvio({ publicacao }: { publicacao: PublicacaoRegistro }) {
  const router = useRouter()
  const [atualizando, iniciar] = useTransition()
  const [erro, setErro] = useState('')
  const terminou = publicacao.status === 'completed' || publicacao.status === 'failed'

  function atualizar() {
    setErro('')
    const form = new FormData()
    form.set('publicacaoId', publicacao.id)
    iniciar(async () => {
      try { await atualizarStatusPublicacao(form); router.refresh() }
      catch (causa) { setErro(causa instanceof Error ? causa.message : 'Não foi possível atualizar.') }
    })
  }

  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded px-1.5 py-0.5 text-[11px] ${
            publicacao.status === 'failed' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
          }`}>
            {ROTULO_STATUS[publicacao.status] ?? publicacao.status}
          </span>
          {publicacao.formato && publicacao.formato !== 'texto' && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {FORMATOS[publicacao.formato as Formato]?.rotulo ?? publicacao.formato}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{publicacao.redes.join(', ')}</span>
        </div>
        {!terminou && (
          <Button variant="ghost" size="sm" onClick={atualizar} disabled={atualizando}>
            {atualizando ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          </Button>
        )}
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {publicacao.agendadaPara ? `agendado para ${publicacao.agendadaPara}` : publicacao.criadaEm}
      </p>

      {publicacao.resultados.length > 0 && (
        <ul className="mt-2 space-y-1">
          {publicacao.resultados.map((r, i) => (
            <li key={`${r.rede}-${i}`} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium">{REDES[r.rede]?.nome ?? r.rede}</span>
              <span className={r.ok ? 'text-muted-foreground' : 'text-destructive'}>
                {r.pulada ? 'não conectada' : r.ok ? 'ok' : (r.mensagem ?? 'falhou')}
              </span>
              {r.url && (
                <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  ver <ExternalLink className="size-3" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {publicacao.erro && <p className="mt-2 text-xs text-destructive">{publicacao.erro}</p>}
      {erro && <p className="mt-2 text-xs text-destructive">{erro}</p>}
    </div>
  )
}

/**
 * Escolher a mídia da Biblioteca, subir uma nova, ou colar uma URL de fora.
 *
 * A Biblioteca vem primeiro porque é o caminho que funciona sem o usuário
 * precisar saber o que é uma URL pública — e porque um arquivo de lá já está
 * dentro do espaço, com autoria registrada.
 */
function SeletorDeMidia({
  workspaceId, formato, arquivo, onEscolher, midiaUrl, onUrl,
}: {
  workspaceId: string
  formato: Formato
  arquivo: ArquivoDaBiblioteca | null
  onEscolher: (a: ArquivoDaBiblioteca | null) => void
  midiaUrl: string
  onUrl: (v: string) => void
}) {
  const spec = FORMATOS[formato]
  const [arquivos, setArquivos] = useState<ArquivoDaBiblioteca[] | null>(null)
  const [subindo, setSubindo] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [erro, setErro] = useState('')
  const [mostrarUrl, setMostrarUrl] = useState(false)

  async function carregar() {
    try {
      const r = await fetch('/api/redes/imagens', { cache: 'no-store' })
      const d = await r.json()
      setArquivos(d.arquivos ?? [])
    } catch { setArquivos([]) }
  }

  useEffect(() => { carregar() }, [])

  // Reels não aceita foto; mostrar o que não serve só gera clique frustrado.
  const compativeis = (arquivos ?? []).filter((a) =>
    spec.midia === 'video' ? a.tipo === 'video'
      : spec.midia === 'imagem' ? a.tipo === 'foto'
        : true)

  async function subir(file: File) {
    setErro(''); setSubindo(true)
    try {
      // Direto do navegador para o Blob: um Reels de 40 MB não passaria pela
      // função serverless, que corta o corpo da requisição em 4,5 MB.
      // O caminho vai daqui: o servidor não consegue trocá-lo ao emitir a
      // permissão, só conferir se pertence a este espaço — e ele confere.
      const blob = await upload(caminhoDaBiblioteca(workspaceId, file.name), file, {
        // Privado como o resto da Biblioteca: o arquivo é servido por
        // /api/private-blob, que confere a sessão a cada pedido.
        access: 'private',
        handleUploadUrl: '/api/files/upload-token',
        clientPayload: String(file.size),
        onUploadProgress: ({ percentage }) => setProgresso(Math.round(percentage)),
      })

      const r = await fetch('/api/files/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pathname: blob.pathname,
          name: file.name,
          // Quem envia por aqui está enviando para publicar; a autorização de
          // uso de imagem é confirmada no mesmo gesto, não numa tela à parte.
          authorization: 'authorized',
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Não foi possível registrar o arquivo.')

      const lista = await fetch('/api/redes/imagens', { cache: 'no-store' }).then((x) => x.json())
      setArquivos(lista.arquivos ?? [])
      const novo = (lista.arquivos ?? []).find((a: ArquivoDaBiblioteca) => a.id === d.id)
      if (novo) onEscolher(novo)
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Falha no envio.')
    } finally { setSubindo(false); setProgresso(0) }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {spec.midia === 'video' ? 'Vídeo' : spec.midia === 'imagem' ? 'Imagem' : 'Imagem ou vídeo'}
          <span className="ml-1 text-destructive">obrigatório</span>
        </span>
        <button
          type="button"
          onClick={() => setMostrarUrl((v) => !v)}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {mostrarUrl ? 'usar a Biblioteca' : 'ou colar uma URL'}
        </button>
      </div>

      {mostrarUrl ? (
        <input
          type="url" value={midiaUrl} onChange={(e) => onUrl(e.target.value)}
          placeholder="https://exemplo.org/foto.jpg"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
        />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            <label className={`flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:bg-muted ${subindo ? 'pointer-events-none opacity-60' : ''}`}>
              {subindo ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              <span className="text-[10px]">{subindo ? `${progresso}%` : 'enviar'}</span>
              <input
                type="file"
                accept={spec.midia === 'video' ? 'video/*' : spec.midia === 'imagem' ? 'image/*' : 'image/*,video/*'}
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }}
              />
            </label>

            {arquivos === null && (
              <div className="col-span-3 flex aspect-square items-center justify-center text-xs text-muted-foreground sm:col-span-5">
                <Loader2 className="size-4 animate-spin" />
              </div>
            )}

            {compativeis.map((a) => {
              const escolhido = arquivo?.id === a.id
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onEscolher(escolhido ? null : a)}
                  title={a.nome}
                  className={`relative aspect-square overflow-hidden rounded-lg border transition-all ${
                    escolhido ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:opacity-80'
                  }`}
                >
                  {a.tipo === 'foto' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.previa} alt={a.nome} className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center bg-muted text-muted-foreground">
                      <Film className="size-4" />
                    </span>
                  )}
                  {escolhido && (
                    <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {arquivos !== null && compativeis.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Nenhum {spec.midia === 'video' ? 'vídeo' : 'arquivo'} na Biblioteca ainda. Envie um pelo botão acima.
            </p>
          )}
        </>
      )}

      {arquivo && (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Check className="size-3 text-primary" />
          {arquivo.nome}
          <button type="button" onClick={() => onEscolher(null)} className="hover:text-foreground" aria-label="Remover seleção">
            <XIcon className="size-3" />
          </button>
        </p>
      )}
      {erro && <p className="mt-2 text-xs text-destructive">{erro}</p>}
    </div>
  )
}
