'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Folder, Loader2, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { MAX_FOTOS_POR_COLETA, VALIDADES } from '@/lib/imagem/regras'
import { criarColeta } from '@/app/actions/autorizacoes-de-imagem'

type Foto = { id: string; nome: string; tipo: string; caminho: string | null; pasta: string | null; pendente: boolean }
const campo = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm'

export function NovaColeta({ fotos, escolhidasDeInicio }: { fotos: Foto[]; escolhidasDeInicio: string[] }) {
  const router = useRouter()
  const [escolhidas, setEscolhidas] = useState<string[]>(escolhidasDeInicio)
  const [pasta, setPasta] = useState('todas')
  const [so, setSo] = useState<'todas' | 'pendentes'>(escolhidasDeInicio.length ? 'todas' : 'pendentes')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const pastas = useMemo(() => [...new Set(fotos.map((f) => f.pasta).filter((p): p is string => !!p))].sort(), [fotos])
  const visiveis = fotos.filter((f) => (pasta === 'todas' || f.pasta === pasta) && (so === 'todas' || f.pendente || escolhidas.includes(f.id)))
  const alternar = (id: string) => setEscolhidas((a) => a.includes(id) ? a.filter((x) => x !== id) : [...a, id])

  async function criar(formData: FormData) {
    setErro('')
    setEnviando(true)
    escolhidas.forEach((id) => formData.append('arquivos', id))
    const r = await criarColeta(formData)
    if (r.erro || !r.id) { setErro(r.erro ?? 'Não foi possível criar o link.'); setEnviando(false); return }
    router.push(`/biblioteca/autorizacoes/${r.id}`)
  }

  return (
    <form action={criar} className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 p-5">
        <label className="flex flex-col gap-1.5 text-sm font-medium">Ação
          <input name="titulo" required minLength={3} maxLength={120} placeholder="Ex.: Mutirão de saúde em Campo Grande — 12/09" className={campo} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Recado para quem vai assinar (opcional)
          <textarea name="descricao" maxLength={500} rows={2} placeholder="Ex.: Oi! Estas são as fotos do mutirão de sábado. Para podermos divulgar, precisamos da sua autorização." className={campo} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium sm:max-w-xs">O link vale por
          <select name="validade" defaultValue="30" className={campo}>
            {Object.entries(VALIDADES).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </label>
      </Card>

      <section aria-labelledby="escolher" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="escolher" className="text-base font-semibold">Fotos e vídeos ({escolhidas.length} de no máximo {MAX_FOTOS_POR_COLETA})</h2>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEscolhidas((a) => [...new Set([...a, ...visiveis.map((f) => f.id)])].slice(0, MAX_FOTOS_POR_COLETA))}>Marcar as {Math.min(visiveis.length, MAX_FOTOS_POR_COLETA)} da lista</Button>
            {escolhidas.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => setEscolhidas([])}>Desmarcar tudo</Button>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" onClick={() => setSo('pendentes')} className={cn('rounded-lg px-3 py-1.5 font-medium', so === 'pendentes' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}>Falta autorizar</button>
          <button type="button" onClick={() => setSo('todas')} className={cn('rounded-lg px-3 py-1.5 font-medium', so === 'todas' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}>Todas</button>
          {pastas.length > 0 && (
            <select value={pasta} onChange={(e) => setPasta(e.target.value)} aria-label="Pasta" className="rounded-lg border border-border bg-background px-2 py-1.5">
              <option value="todas">Todas as pastas</option>
              {pastas.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </div>
        {visiveis.length ? (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {visiveis.map((f) => {
              const marcada = escolhidas.includes(f.id)
              return (
                <li key={f.id}>
                  <button type="button" onClick={() => alternar(f.id)} aria-pressed={marcada} title={f.nome}
                    className={cn('relative block aspect-square w-full overflow-hidden rounded-lg border-2 bg-muted', marcada ? 'border-primary' : 'border-transparent')}>
                    {f.tipo === 'foto' && f.caminho
                      ? <img src={`/api/private-blob?pathname=${encodeURIComponent(f.caminho)}`} alt={f.nome} loading="lazy" className="size-full object-cover" />
                      : <span className="flex size-full flex-col items-center justify-center gap-1 p-1 text-[10px] text-muted-foreground"><Video className="size-5" aria-hidden="true" /><span className="line-clamp-2 break-all">{f.nome}</span></span>}
                    <span className={cn('absolute right-1 top-1 flex size-6 items-center justify-center rounded-full border-2 border-white shadow', marcada ? 'bg-primary text-primary-foreground' : 'bg-black/30')}>
                      {marcada && <Check className="size-3.5" aria-hidden="true" />}
                    </span>
                    {f.pasta && <span className="absolute bottom-1 left-1 inline-flex max-w-[90%] items-center gap-0.5 truncate rounded bg-black/55 px-1 text-[10px] text-white"><Folder className="size-2.5" aria-hidden="true" />{f.pasta}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : <Card className="p-6 text-sm text-muted-foreground">Nenhuma foto aqui. Envie as fotos na Biblioteca primeiro.</Card>}
      </section>

      {erro && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{erro}</p>}
      <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-sm">
        <span className="text-sm text-muted-foreground">{escolhidas.length} escolhida(s)</span>
        <Button type="submit" disabled={enviando || !escolhidas.length || escolhidas.length > MAX_FOTOS_POR_COLETA}>
          {enviando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Gerar o link
        </Button>
      </div>
    </form>
  )
}
