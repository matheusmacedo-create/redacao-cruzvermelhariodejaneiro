'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Loader2,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PostPreview } from './post-preview'
import { FacebookIcon, InstagramIcon } from './platform-icon'
import {
  agendarPost,
  anexarMidia,
  cancelarAgendamento,
  definirDestinos,
  publicarAgora,
  removerMidia,
  salvarPost,
} from '@/app/actions/social'
import { LEGENDA_MAXIMA, REGRAS, temBloqueio, validarPost } from '@/lib/meta/validation'
import {
  POST_STATUS_LABEL,
  POST_TYPE_LABEL,
  type MediaFile,
  type PostType,
  type SocialChannel,
  type SocialPlatform,
} from '@/lib/meta/types'
import { cn } from '@/lib/utils'

/**
 * Editor de publicação.
 *
 * A regra que estrutura a tela: os botões de disparo só aparecem depois da
 * aprovação. Antes disso a pessoa monta e envia para revisão — não existe
 * caminho para publicar direto, nem por engano.
 */

type ArquivoBiblioteca = MediaFile & { storage_path: string }

type MidiaAnexada = { id: string; role: 'media' | 'cover'; file: ArquivoBiblioteca }

const TIPOS: PostType[] = ['feed', 'carousel', 'reels', 'story']

const previewUrl = (file: ArquivoBiblioteca) =>
  `/api/private-blob?pathname=${encodeURIComponent(file.storage_path)}`

function fusoLocal() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo'
  } catch {
    return 'America/Sao_Paulo'
  }
}

export function PostComposer({
  post,
  canais,
  destinosIniciais,
  midiasIniciais,
  biblioteca,
  podePublicar,
  historico,
}: {
  post: {
    id: string
    content_id: string | null
    post_type: PostType
    caption: string
    first_comment: string | null
    status: string
    scheduled_for: string | null
    last_error: string | null
  }
  canais: SocialChannel[]
  destinosIniciais: string[]
  midiasIniciais: MidiaAnexada[]
  biblioteca: ArquivoBiblioteca[]
  podePublicar: boolean
  historico: Array<{ id: string; event: string; created_at: string; detail: any; autor: string | null }>
}) {
  const [postType, setPostType] = useState<PostType>(post.post_type)
  const [legenda, setLegenda] = useState(post.caption)
  const [primeiroComentario, setPrimeiroComentario] = useState(post.first_comment ?? '')
  const [destinos, setDestinos] = useState<string[]>(destinosIniciais)
  const [midias, setMidias] = useState<MidiaAnexada[]>(midiasIniciais)
  const [quando, setQuando] = useState('')
  const [seletorAberto, setSeletorAberto] = useState(false)
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()

  const plataformas = useMemo(() => {
    const encontradas = destinos
      .map((id) => canais.find((canal) => canal.id === id)?.platform)
      .filter(Boolean) as SocialPlatform[]
    return [...new Set(encontradas)]
  }, [destinos, canais])

  const arquivos = useMemo(() => midias.filter((m) => m.role === 'media').map((m) => m.file), [midias])

  const problemas = useMemo(
    () => validarPost({ postType, legenda, midias: arquivos, plataformas }),
    [postType, legenda, arquivos, plataformas],
  )
  const bloqueado = temBloqueio(problemas)

  const limiteLegenda = plataformas.includes('instagram')
    ? LEGENDA_MAXIMA.instagram
    : LEGENDA_MAXIMA.facebook

  const aprovado = ['aprovado', 'agendado', 'falhou'].includes(post.status)
  const noAr = ['publicado', 'parcial', 'publicando'].includes(post.status)
  const contaPreview =
    canais.find((canal) => destinos.includes(canal.id) && canal.platform === 'instagram')?.username ??
    canais.find((canal) => destinos.includes(canal.id))?.account_name ??
    'cruzvermelharj'

  function executar(acao: () => Promise<unknown>, sucesso: string) {
    setMensagem(null)
    iniciar(async () => {
      try {
        await acao()
        setMensagem({ tipo: 'ok', texto: sucesso })
      } catch (erro) {
        setMensagem({ tipo: 'erro', texto: erro instanceof Error ? erro.message : 'Algo deu errado.' })
      }
    })
  }

  const formBase = () => {
    const form = new FormData()
    form.set('postId', post.id)
    form.set('contentId', post.content_id ?? '')
    return form
  }

  function salvarRascunho() {
    executar(async () => {
      const form = formBase()
      form.set('postType', postType)
      form.set('caption', legenda)
      form.set('firstComment', primeiroComentario)
      await salvarPost(form)

      const destinoForm = formBase()
      destinos.forEach((id) => destinoForm.append('channelIds', id))
      await definirDestinos(destinoForm)
    }, 'Rascunho salvo.')
  }

  function anexar(file: ArquivoBiblioteca) {
    executar(async () => {
      const form = formBase()
      form.set('fileId', file.id)
      form.set('role', 'media')
      await anexarMidia(form)
      setMidias((atual) => [...atual, { id: crypto.randomUUID(), role: 'media', file }])
      setSeletorAberto(false)
    }, 'Mídia anexada.')
  }

  function desanexar(midia: MidiaAnexada) {
    executar(async () => {
      const form = formBase()
      form.set('mediaId', midia.id)
      await removerMidia(form)
      setMidias((atual) => atual.filter((item) => item.id !== midia.id))
    }, 'Mídia removida.')
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
      {/* ------------------------------------------------------------- edição */}
      <div className="flex min-w-0 flex-col gap-5">
        {/* Formato */}
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Formato</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {TIPOS.map((tipo) => (
              <button
                key={tipo}
                type="button"
                disabled={noAr}
                onClick={() => setPostType(tipo)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50',
                  postType === tipo
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-muted',
                )}
              >
                {POST_TYPE_LABEL[tipo]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {REGRAS[postType].minMidias === REGRAS[postType].maxMidias
              ? `${REGRAS[postType].maxMidias} arquivo`
              : `De ${REGRAS[postType].minMidias} a ${REGRAS[postType].maxMidias} arquivos`}
            {' · '}
            {REGRAS[postType].aceita === 'video' ? 'somente vídeo' : 'imagem ou vídeo'}
          </p>
        </Card>

        {/* Canais */}
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Onde publicar</h2>
          {canais.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Nenhum canal conectado. Conecte uma conta em Configurações → Canais de publicação.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {canais.map((canal) => {
                const Icone = canal.platform === 'instagram' ? InstagramIcon : FacebookIcon
                const marcado = destinos.includes(canal.id)
                const indisponivel = canal.status !== 'active'
                return (
                  <label
                    key={canal.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors',
                      marcado ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                      (indisponivel || noAr) && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={marcado}
                      disabled={indisponivel || noAr}
                      onChange={(evento) =>
                        setDestinos((atual) =>
                          evento.target.checked
                            ? [...atual, canal.id]
                            : atual.filter((id) => id !== canal.id),
                        )
                      }
                    />
                    <Icone className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {canal.account_name}
                      {canal.username ? ` · @${canal.username}` : ''}
                    </span>
                    {indisponivel && <span className="text-xs text-warning-foreground">reconectar</span>}
                  </label>
                )
              })}
            </div>
          )}
        </Card>

        {/* Mídia */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Mídia</h2>
            {!noAr && (
              <Button variant="outline" size="sm" onClick={() => setSeletorAberto(true)}>
                Escolher da Biblioteca
              </Button>
            )}
          </div>

          {midias.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nenhum arquivo anexado.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-3">
              {midias.map((midia) => (
                <div key={midia.id} className="relative">
                  <div className="size-24 overflow-hidden rounded-lg border border-border bg-muted">
                    {midia.file.content_type.startsWith('video/') ? (
                      <video src={previewUrl(midia.file)} className="size-full object-cover" muted preload="metadata" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewUrl(midia.file)} alt={midia.file.name} className="size-full object-cover" />
                    )}
                  </div>
                  {!noAr && (
                    <button
                      type="button"
                      onClick={() => desanexar(midia)}
                      aria-label={`Remover ${midia.file.name}`}
                      className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-destructive text-white shadow"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Legenda */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Legenda</h2>
            <span
              className={cn(
                'text-xs tabular-nums',
                legenda.length > limiteLegenda ? 'font-semibold text-destructive' : 'text-muted-foreground',
              )}
            >
              {legenda.length.toLocaleString('pt-BR')} / {limiteLegenda.toLocaleString('pt-BR')}
            </span>
          </div>
          <textarea
            value={legenda}
            disabled={noAr}
            onChange={(evento) => setLegenda(evento.target.value)}
            rows={7}
            placeholder="Escreva a legenda da publicação…"
            className="mt-3 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed disabled:opacity-60"
          />

          {postType !== 'story' && (
            <label className="mt-4 block text-sm font-medium">
              Primeiro comentário
              <span className="ml-1 font-normal text-muted-foreground">(opcional)</span>
              <textarea
                value={primeiroComentario}
                disabled={noAr}
                onChange={(evento) => setPrimeiroComentario(evento.target.value)}
                rows={2}
                placeholder="Hashtags ou créditos, publicados como comentário logo após o post."
                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
              />
            </label>
          )}
        </Card>

        {/* Validação */}
        {problemas.length > 0 && (
          <Card className="border-warning/40 bg-warning/5 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-warning-foreground">
              <AlertTriangle className="size-4" />
              Ajustes necessários antes de publicar
            </p>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
              {problemas.map((problema, indice) => (
                <li key={indice}>{problema.mensagem}</li>
              ))}
            </ul>
          </Card>
        )}

        {post.last_error && (
          <Card className="border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">Última falha</p>
            <p className="mt-1 text-sm text-muted-foreground">{post.last_error}</p>
          </Card>
        )}

        {/* Ações */}
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium">
              {POST_STATUS_LABEL[post.status as keyof typeof POST_STATUS_LABEL] ?? post.status}
            </span>

            {!noAr && (
              <Button variant="outline" onClick={salvarRascunho} disabled={pendente}>
                {pendente ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Salvar rascunho
              </Button>
            )}
          </div>

          {!aprovado && !noAr && (
            <p className="mt-4 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
              Esta publicação ainda não foi aprovada. Envie o conteúdo para aprovação — os botões de
              agendamento e publicação são liberados assim que a aprovação sair.
            </p>
          )}

          {aprovado && !podePublicar && (
            <p className="mt-4 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
              A publicação está aprovada. O disparo é feito por um administrador.
            </p>
          )}

          {aprovado && podePublicar && (
            <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm font-medium">
                  Agendar para
                  <input
                    type="datetime-local"
                    value={quando}
                    onChange={(evento) => setQuando(evento.target.value)}
                    className="mt-1 block rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>
                <Button
                  variant="outline"
                  size="lg"
                  disabled={pendente || bloqueado || !quando}
                  onClick={() =>
                    executar(async () => {
                      const form = formBase()
                      form.set('scheduledFor', new Date(quando).toISOString())
                      form.set('timezone', fusoLocal())
                      await agendarPost(form)
                    }, 'Publicação agendada.')
                  }
                >
                  <CalendarClock className="size-4" />
                  Agendar
                </Button>

                <Button
                  size="lg"
                  disabled={pendente || bloqueado}
                  onClick={() =>
                    executar(async () => {
                      await publicarAgora(formBase())
                    }, 'Publicação enviada para a Meta.')
                  }
                >
                  {pendente ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Publicar agora
                </Button>

                {post.status === 'agendado' && (
                  <Button
                    variant="ghost"
                    size="lg"
                    disabled={pendente}
                    onClick={() =>
                      executar(async () => {
                        await cancelarAgendamento(formBase())
                      }, 'Agendamento cancelado.')
                    }
                  >
                    Cancelar agendamento
                  </Button>
                )}
              </div>

              {post.scheduled_for && post.status === 'agendado' && (
                <p className="text-sm text-muted-foreground">
                  Agendado para{' '}
                  {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' }).format(
                    new Date(post.scheduled_for),
                  )}
                  .
                </p>
              )}
            </div>
          )}

          {mensagem && (
            <p
              className={cn(
                'mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
                mensagem.tipo === 'ok' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
              )}
            >
              {mensagem.tipo === 'ok' ? <Check className="size-4" /> : <AlertTriangle className="size-4" />}
              {mensagem.texto}
            </p>
          )}
        </Card>

        {/* Histórico */}
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Histórico</h2>
          {historico.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nenhum registro ainda.</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2">
              {historico.map((evento) => (
                <li key={evento.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium">
                    {POST_STATUS_LABEL[evento.event as keyof typeof POST_STATUS_LABEL] ?? evento.event}
                  </span>
                  {evento.autor && <span className="text-muted-foreground">por {evento.autor}</span>}
                  <span className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
                      new Date(evento.created_at),
                    )}
                  </span>
                  {evento.detail?.permalink && (
                    <a
                      href={evento.detail.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary underline-offset-4 hover:underline"
                    >
                      ver publicação
                    </a>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------------------ preview */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <PostPreview
          plataformas={plataformas}
          conta={contaPreview}
          legenda={legenda}
          postType={postType}
          midias={arquivos.map((file) => ({
            id: file.id,
            url: previewUrl(file as ArquivoBiblioteca),
            contentType: file.content_type,
            name: file.name,
          }))}
        />
      </div>

      {/* --------------------------------------------- seletor da Biblioteca */}
      {seletorAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="seletor-titulo"
        >
          <Card className="flex max-h-[80vh] w-full max-w-2xl flex-col">
            <div className="flex items-center justify-between border-b border-border p-5">
              <h2 id="seletor-titulo" className="text-base font-semibold">
                Escolher da Biblioteca
              </h2>
              <Button variant="ghost" size="icon-sm" onClick={() => setSeletorAberto(false)} aria-label="Fechar">
                <X className="size-4" />
              </Button>
            </div>

            <div className="grid flex-1 grid-cols-3 gap-3 overflow-y-auto p-5 sm:grid-cols-4">
              {biblioteca.length === 0 && (
                <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                  Nenhum arquivo de imagem ou vídeo na Biblioteca deste espaço.
                </p>
              )}
              {biblioteca.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => anexar(file)}
                  className="group overflow-hidden rounded-lg border border-border text-left transition-colors hover:border-primary"
                >
                  <div className="aspect-square bg-muted">
                    {file.content_type.startsWith('video/') ? (
                      <video src={previewUrl(file)} className="size-full object-cover" muted preload="metadata" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewUrl(file)} alt={file.name} className="size-full object-cover" />
                    )}
                  </div>
                  <p className="truncate px-2 py-1.5 text-xs">{file.name}</p>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
