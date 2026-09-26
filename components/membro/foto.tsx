'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, CircleCheck, LoaderCircle, Trash2 } from 'lucide-react'
import { iniciais } from '@/lib/membro/regras'
import { ErroDaFoto, prepararFotoDePerfil } from '@/lib/membro/preparar-foto'
import { cn } from '@/lib/utils'
import { botaoFantasma, botaoPerigo, botaoSecundario } from './marca'

/**
 * A foto de perfil do voluntário. Serve às duas portas: a Área do Voluntário
 * (`/api/membro/foto`) e a edição da ficha pela equipe
 * (`/api/voluntariado/[id]/foto`) — muda só o endereço.
 */

/**
 * O retrato: a foto, ou as iniciais quando não há foto (ou ela não carrega).
 * Decorativo por padrão (`alt=""`): o nome da pessoa está sempre ao lado.
 */
export function Retrato({ url, nome, className, alt = '' }: { url: string | null | undefined; nome: string; className?: string; alt?: string }) {
  // Guarda qual endereço falhou: trocada a foto, o novo endereço tenta de novo.
  const [falhou, setFalhou] = useState<string | null>(null)
  const base = cn('flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted font-semibold text-foreground', className)
  if (!url || falhou === url) return <span aria-hidden={alt ? undefined : true} role={alt ? 'img' : undefined} aria-label={alt || undefined} className={base}>{iniciais(nome)}</span>
  // <img> e não next/image: a foto é privada, servida por rota com sessão, e o otimizador do Next não a alcança.
  return <img src={url} alt={alt} className={cn(base, 'object-cover')} onError={() => setFalhou(url)} decoding="async" />
}

type Estado = { tipo: 'ok' | 'erro'; texto: string; vez: number } | null

export function EditorDaFoto({ url, nome, endpoint, podeEditar = true, porta = 'membro', className }: {
  url: string | null; nome: string; endpoint: string; podeEditar?: boolean; porta?: 'membro' | 'equipe'; className?: string
}) {
  const router = useRouter()
  const entrada = useRef<HTMLInputElement>(null)
  const idDaDica = useId()
  const [estado, setEstado] = useState<Estado>(null)
  const [enviando, setEnviando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [atualizando, iniciar] = useTransition()
  const ocupado = enviando || atualizando
  const aviso = (tipo: 'ok' | 'erro', texto: string) => setEstado((e) => ({ tipo, texto, vez: (e?.vez ?? 0) + 1 }))

  async function enviar(file: File) {
    setEnviando(true)
    setEstado(null)
    setConfirmar(false)
    try {
      const foto = await prepararFotoDePerfil(file)
      const corpo = new FormData()
      corpo.append('foto', foto)
      const r = await fetch(endpoint, { method: 'POST', body: corpo })
      const dados = await r.json().catch(() => ({})) as { error?: string }
      if (!r.ok) throw new ErroDaFoto(dados.error ?? 'Não foi possível salvar a foto.')
      aviso('ok', url ? 'Foto trocada.' : 'Foto salva.')
      iniciar(() => router.refresh())
    } catch (causa) {
      aviso('erro', causa instanceof ErroDaFoto ? causa.message : 'Não foi possível enviar a foto. Confira a conexão e tente de novo.')
    } finally {
      setEnviando(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  async function remover() {
    setEnviando(true)
    setEstado(null)
    try {
      const r = await fetch(endpoint, { method: 'DELETE' })
      const dados = await r.json().catch(() => ({})) as { error?: string }
      if (!r.ok) throw new ErroDaFoto(dados.error ?? 'Não foi possível remover a foto.')
      setConfirmar(false)
      aviso('ok', 'Foto removida.')
      iniciar(() => router.refresh())
    } catch (causa) {
      aviso('erro', causa instanceof ErroDaFoto ? causa.message : 'Não foi possível remover a foto. Confira a conexão e tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-4', className)} data-ajuda={porta === 'equipe' ? 'voluntarios.foto-editar' : 'membro.foto'}>
      <Retrato url={url} nome={nome} className="size-20 text-2xl" alt={url ? `Foto de ${nome}` : ''} />
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-2">
        {podeEditar ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {/* O input fica escondido e o rótulo é o botão: abre a galeria ou a câmera no celular. */}
              <label className={cn(botaoSecundario, 'cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring', ocupado && 'pointer-events-none opacity-60')}>
                <input ref={entrada} type="file" accept="image/*" className="sr-only" disabled={ocupado} aria-describedby={idDaDica}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f) }} />
                {enviando && !confirmar ? <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" /> : <Camera className="size-4 shrink-0" aria-hidden="true" />}
                {enviando && !confirmar ? 'Enviando…' : url ? 'Trocar foto' : 'Escolher foto'}
              </label>
              {url && !confirmar && (
                <button type="button" className={botaoFantasma} disabled={ocupado} onClick={() => setConfirmar(true)}>
                  <Trash2 className="size-4 shrink-0" aria-hidden="true" />Remover
                </button>
              )}
            </div>
            {confirmar && (
              <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Confirmar remoção da foto">
                <span>Remover a foto?</span>
                <button type="button" className={botaoPerigo} disabled={ocupado} onClick={() => void remover()}>
                  {enviando ? <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" /> : <Trash2 className="size-4 shrink-0" aria-hidden="true" />}Remover
                </button>
                <button type="button" className={botaoFantasma} disabled={ocupado} onClick={() => setConfirmar(false)}>Cancelar</button>
              </div>
            )}
            <p id={idDaDica} className="text-sm text-muted-foreground">Uma foto do rosto, de frente. Ela é recortada em quadrado e reduzida aqui mesmo, antes de enviar; a localização da foto não vai junto.</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{url ? 'Foto de perfil.' : 'Sem foto de perfil.'}</p>
        )}
        {/* Sempre no DOM: a região precisa existir antes de mudar para o leitor de tela anunciar. */}
        <p role="status" className="flex items-center gap-1.5 text-sm">
          {estado?.tipo === 'ok' && <><CircleCheck className="size-4 shrink-0 text-success" aria-hidden="true" /><span className="text-(--success-texto)">{estado.texto}</span></>}
        </p>
        {estado?.tipo === 'erro' && <p role="alert" key={estado.vez} className="text-sm text-destructive">{estado.texto}</p>}
      </div>
    </div>
  )
}
