'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, ChevronLeft, ChevronRight, ImagePlus, Loader2, Star, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { definirCapaDoBem } from '@/app/actions/patrimonio'
import { MAXIMO_DE_FOTOS_DO_BEM } from '@/lib/patrimonio/fotos'
import { enviarFotoDoBem } from '@/lib/patrimonio/preparar-foto'

export type FotoNaTela = { id: string; url: string }

/** Envia uma a uma (cada foto reduzida no navegador) e devolve os erros, com o nome do arquivo. */
export async function enviarFotos(bemId: string, arquivos: File[], aoAvancar?: (feitas: number) => void): Promise<string[]> {
  const erros: string[] = []
  for (const [i, f] of arquivos.entries()) {
    const erro = await enviarFotoDoBem(bemId, f)
    if (erro) erros.push(`${f.name}: ${erro}`)
    aoAvancar?.(i + 1)
  }
  return erros
}

/** Os dois botões: tirar com a câmera (celular) ou escolher várias da galeria. */
function Escolher({ aoEscolher, restam, ocupado }: { aoEscolher: (arquivos: File[]) => void; restam: number; ocupado: boolean }) {
  const camera = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)
  const ler = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivos = [...(e.target.files ?? [])]
    e.target.value = ''
    if (arquivos.length) aoEscolher(arquivos)
  }
  return (
    <div className="flex flex-wrap gap-2">
      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" aria-hidden="true" tabIndex={-1} onChange={ler} />
      <input ref={galeria} type="file" accept="image/*" multiple className="sr-only" aria-hidden="true" tabIndex={-1} onChange={ler} />
      <Button type="button" variant="outline" size="sm" disabled={ocupado || restam <= 0} onClick={() => camera.current?.click()}><Camera className="size-4" />Tirar foto</Button>
      <Button type="button" variant="outline" size="sm" disabled={ocupado || restam <= 0} onClick={() => galeria.current?.click()}><ImagePlus className="size-4" />Escolher fotos</Button>
    </div>
  )
}

/**
 * As fotos na ficha do bem: a capa primeiro, ampliar ao tocar e, para quem
 * opera o Patrimônio, pôr, tirar e trocar a capa.
 */
export function GaleriaDoBem({ bemId, fotos, podeEditar, avisoInicial }: { bemId: string; fotos: FotoNaTela[]; podeEditar: boolean; avisoInicial?: string }) {
  const router = useRouter()
  const [aberta, setAberta] = useState<number | null>(null)
  const [aviso, setAviso] = useState(avisoInicial ?? '')
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null)
  const [ocupado, rodar] = useTransition()
  const restam = MAXIMO_DE_FOTOS_DO_BEM - fotos.length

  const adicionar = (arquivos: File[]) => {
    const vao = arquivos.slice(0, Math.max(0, restam))
    setAviso(arquivos.length > vao.length ? `Só cabem mais ${restam} ${restam === 1 ? 'foto' : 'fotos'}: as outras ficaram de fora.` : '')
    setProgresso({ feitas: 0, total: vao.length })
    rodar(async () => {
      const erros = await enviarFotos(bemId, vao, (feitas) => setProgresso({ feitas, total: vao.length }))
      setProgresso(null)
      if (erros.length) setAviso(erros.join(' '))
      router.refresh()
    })
  }
  const tirar = (id: string) => {
    if (!window.confirm('Apagar esta foto do bem?')) return
    rodar(async () => {
      const r = await fetch(`/api/patrimonio/fotos/${id}`, { method: 'DELETE' })
      const dados = await r.json().catch(() => ({})) as { error?: string }
      setAviso(r.ok ? '' : dados.error ?? 'Não foi possível apagar a foto.')
      setAberta(null)
      router.refresh()
    })
  }
  const capa = (id: string) => rodar(async () => {
    const r = await definirCapaDoBem(bemId, id)
    setAviso(r.erro ?? '')
    setAberta(null)
    router.refresh()
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Fotos {fotos.length > 0 && <span className="text-sm font-normal text-muted-foreground">· {fotos.length}</span>}</h2>
        {podeEditar && <Escolher aoEscolher={adicionar} restam={restam} ocupado={ocupado} />}
      </div>
      {progresso && <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" />Enviando {progresso.feitas + 1 > progresso.total ? progresso.total : progresso.feitas + 1} de {progresso.total}…</p>}
      {aviso && <p className="text-sm text-destructive" role="alert">{aviso}</p>}
      {fotos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {podeEditar ? 'Nenhuma foto ainda. Fotografe o bem inteiro, a plaqueta e o número de série: ajuda a achar, a conferir no inventário e a provar o estado.' : 'Nenhuma foto ainda.'}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-fotos-do-bem>
          {fotos.map((f, i) => (
            <li key={f.id} className="relative">
              <button type="button" onClick={() => setAberta(i)} className="block aspect-square w-full overflow-hidden rounded-lg border border-border bg-muted focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Ampliar a foto ${i + 1}`}>
                <img src={f.url} alt={`Foto ${i + 1} do bem`} loading="lazy" className="size-full object-cover" />
              </button>
              {i === 0 && <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">Capa</span>}
            </li>
          ))}
        </ul>
      )}
      {aberta !== null && fotos[aberta] && (
        <Ampliada fotos={fotos} indice={aberta} setIndice={setAberta} podeEditar={podeEditar} ocupado={ocupado} aoTirar={tirar} aoCapa={capa} />
      )}
    </div>
  )
}

function Ampliada({ fotos, indice, setIndice, podeEditar, ocupado, aoTirar, aoCapa }: {
  fotos: FotoNaTela[]; indice: number; setIndice: (i: number | null) => void; podeEditar: boolean; ocupado: boolean
  aoTirar: (id: string) => void; aoCapa: (id: string) => void
}) {
  const f = fotos[indice]
  const ir = useCallback((passo: number) => setIndice((indice + passo + fotos.length) % fotos.length), [indice, fotos.length, setIndice])
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIndice(null)
      else if (e.key === 'ArrowRight') ir(1)
      else if (e.key === 'ArrowLeft') ir(-1)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [ir, setIndice])
  return (
    <div role="dialog" aria-modal="true" aria-label={`Foto ${indice + 1} de ${fotos.length}`} className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={() => setIndice(null)}>
      <div className="flex items-center justify-between gap-2 p-3 text-sm text-white" onClick={(e) => e.stopPropagation()}>
        <span>{indice + 1} de {fotos.length}</span>
        <div className="flex flex-wrap items-center gap-1">
          {podeEditar && indice > 0 && <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" disabled={ocupado} onClick={() => aoCapa(f.id)}><Star className="size-4" />Usar como capa</Button>}
          {podeEditar && <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" disabled={ocupado} onClick={() => aoTirar(f.id)}><Trash2 className="size-4" />Apagar foto</Button>}
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setIndice(null)} aria-label="Fechar"><X className="size-5" /></Button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2">
        <img src={f.url} alt={`Foto ${indice + 1} do bem`} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        {fotos.length > 1 && (
          <>
            <button type="button" aria-label="Foto anterior" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); ir(-1) }}><ChevronLeft className="size-6" /></button>
            <button type="button" aria-label="Próxima foto" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); ir(1) }}><ChevronRight className="size-6" /></button>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * As fotos no cadastro de um bem novo: escolhidas antes de salvar, com
 * miniatura, e enviadas logo depois que o banco dá o id (FormularioDoBem).
 */
export function FotosNoCadastro({ arquivos, setArquivos }: { arquivos: File[]; setArquivos: (f: File[]) => void }) {
  const miniaturas = useMemo(() => arquivos.map((f) => URL.createObjectURL(f)), [arquivos])
  useEffect(() => () => miniaturas.forEach((u) => URL.revokeObjectURL(u)), [miniaturas])
  const restam = MAXIMO_DE_FOTOS_DO_BEM - arquivos.length
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4" data-ajuda="patrimonio.bem-fotos">
      <legend className="px-1 text-sm font-semibold">Fotos</legend>
      <p className="text-sm text-muted-foreground">O bem inteiro, a plaqueta e o número de série. A primeira vira a capa. Dá para pôr mais depois, na ficha do bem.</p>
      <Escolher aoEscolher={(novos) => setArquivos([...arquivos, ...novos].slice(0, MAXIMO_DE_FOTOS_DO_BEM))} restam={restam} ocupado={false} />
      {arquivos.length > 0 && (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {arquivos.map((f, i) => (
            <li key={`${f.name}-${f.lastModified}-${i}`} className="relative">
              {miniaturas[i] && (
                <img src={miniaturas[i]} alt={`Foto escolhida ${i + 1}`} className="aspect-square w-full rounded-lg border border-border object-cover" />
              )}
              <button type="button" aria-label={`Remover a foto ${i + 1}`} onClick={() => setArquivos(arquivos.filter((_, j) => j !== i))}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"><X className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  )
}
