'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, ExternalLink, FileText, Loader2, Plus, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, inputClass } from '@/components/app/imprensa/comum'
import { createClient } from '@/lib/supabase/client'
import { abrirApostila, excluirApostila, prepararEnvioDeApostila, publicarApostila, registrarApostila, revogarCertificado } from '@/app/actions/cursos'

export type ApostilaDaEquipe = { id: string; titulo: string; descricao: string | null; tamanho: number; publicado: boolean; curso: string | null; created_at: string }

const tamanho = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`)

function useAcao() {
  const router = useRouter()
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const executar = (f: () => Promise<{ erro?: string }>, depois?: () => void) => iniciar(async () => {
    setErro('')
    const r = await f()
    if (r.erro) { setErro(r.erro); return }
    depois?.()
    router.refresh()
  })
  return { erro, ocupado, executar, setErro }
}

/** Biblioteca de apostilas: envio de PDF direto ao Storage, publicar, abrir e excluir. */
export function Apostilas({ lista, cursos, podeEditar }: { lista: ApostilaDaEquipe[]; cursos: { id: string; titulo: string }[]; podeEditar: boolean }) {
  const { erro, ocupado, executar, setErro } = useAcao()
  const [novo, setNovo] = useState(false)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [etapa, setEtapa] = useState('')

  const enviar = (f: FormData) => executar(async () => {
    if (!arquivo) return { erro: 'Escolha o PDF.' }
    if (arquivo.type !== 'application/pdf') return { erro: 'A apostila precisa ser PDF.' }
    if (arquivo.size > 50 * 1024 * 1024) return { erro: 'A apostila pode ter até 50 MB.' }
    setEtapa('Preparando…')
    const p = await prepararEnvioDeApostila(arquivo.size)
    if (p.erro || !p.caminho || !p.token) { setEtapa(''); return { erro: p.erro ?? 'Falhou.' } }
    setEtapa('Enviando…')
    const { error } = await createClient().storage.from('membro-materiais').uploadToSignedUrl(p.caminho, p.token, arquivo, { contentType: 'application/pdf' })
    if (error) { setEtapa(''); return { erro: 'O envio falhou. Confira a conexão e tente de novo.' } }
    setEtapa('Conferindo…')
    const r = await registrarApostila(p.caminho, arquivo.name, f)
    setEtapa('')
    return r
  }, () => { setNovo(false); setArquivo(null) })

  return (
    <div className="flex flex-col gap-4" id="apostilas">
      {podeEditar && (novo ? (
        <form className="flex flex-col gap-3 rounded-lg border border-border p-4" id="nova-apostila" onSubmit={(e) => { e.preventDefault(); enviar(new FormData(e.currentTarget)) }}>
          <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm hover:border-primary/60">
            <Upload className="size-5 text-muted-foreground" />
            {arquivo ? <span className="font-medium">{arquivo.name} <span className="font-normal text-muted-foreground">({tamanho(arquivo.size)})</span></span> : <span>Escolher PDF</span>}
            <span className="text-xs text-muted-foreground">PDF até 50 MB</span>
            <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              setArquivo(f)
              const t = e.currentTarget.form?.querySelector<HTMLInputElement>('input[name=titulo]')
              if (f && t && !t.value) t.value = f.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').slice(0, 200)
            }} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium">Título<input name="titulo" required minLength={2} maxLength={200} className={inputClass} /></label>
            <label className="flex flex-col gap-1 text-sm font-medium">Curso (opcional)
              <select name="curso_id" defaultValue="" className={inputClass}><option value="">Apostila avulsa</option>{cursos.map((c) => <option key={c.id} value={c.id}>{c.titulo}</option>)}</select>
            </label>
          </div>
          <input name="descricao" maxLength={600} placeholder="Descrição (opcional)" aria-label="Descrição" className={inputClass} />
          {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
          <div className="flex items-center justify-end gap-2">
            {etapa && <span className="text-xs text-muted-foreground">{etapa}</span>}
            <Button type="button" size="sm" variant="ghost" onClick={() => { setNovo(false); setArquivo(null); setErro('') }} disabled={ocupado}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={ocupado || !arquivo}>{ocupado && <Loader2 className="size-3.5 animate-spin" />}Publicar apostila</Button>
          </div>
        </form>
      ) : <Button variant="outline" className="self-start" onClick={() => setNovo(true)}><Plus className="size-4" />Nova apostila</Button>)}
      {!novo && erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {lista.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="flex min-w-0 items-start gap-2">
              <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block font-medium">{a.titulo}{!a.publicado && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">oculta</span>}</span>
                <span className="block text-xs text-muted-foreground">{[a.curso ?? 'avulsa', tamanho(a.tamanho), a.descricao].filter(Boolean).join(' · ')}</span>
              </span>
            </span>
            <span className="flex items-center gap-1">
              <button type="button" title="Abrir" aria-label="Abrir" disabled={ocupado} onClick={() => executar(async () => { const r = await abrirApostila(a.id); if (r.url) window.open(r.url, '_blank', 'noopener'); return r })}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><ExternalLink className="size-3.5" /></button>
              {podeEditar && <>
                <button type="button" title={a.publicado ? 'Ocultar dos voluntários' : 'Mostrar aos voluntários'} aria-label={a.publicado ? 'Ocultar' : 'Mostrar'} disabled={ocupado}
                  onClick={() => executar(() => publicarApostila(a.id, !a.publicado))} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">{a.publicado ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</button>
                <button type="button" title="Excluir" aria-label="Excluir" disabled={ocupado} onClick={() => { if (confirm(`Excluir a apostila "${a.titulo}"?`)) executar(() => excluirApostila(a.id)) }}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-3.5" /></button>
              </>}
            </span>
          </li>
        ))}
        {!lista.length && <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma apostila ainda.</li>}
      </ul>
    </div>
  )
}

export function CancelarCertificado({ id, codigo }: { id: string; codigo: string }) {
  const { erro, ocupado, executar, setErro } = useAcao()
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => { setAberto(true); setMotivo(''); setErro('') }}>Cancelar</Button>
      {aberto && (
        <Dialog titulo={`Cancelar o certificado ${codigo}`} onFechar={() => !ocupado && setAberto(false)} podeFechar={!ocupado}
          descricao="A página de verificação passa a dizer que ele foi cancelado, e a formação sai do cadastro do voluntário. Não tem volta.">
          <form className="flex flex-col gap-3 px-6 py-5" onSubmit={(e) => { e.preventDefault(); executar(() => revogarCertificado(id, motivo), () => setAberto(false)) }}>
            <label className="flex flex-col gap-1 text-sm font-medium">Motivo<textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={600} className={inputClass} /></label>
            {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={ocupado}>Voltar</Button>
              <Button type="submit" variant="destructive" disabled={ocupado || motivo.trim().length < 3}>{ocupado && <Loader2 className="size-4 animate-spin" />}Cancelar certificado</Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  )
}
