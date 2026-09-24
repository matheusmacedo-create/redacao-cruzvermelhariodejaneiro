import Link from 'next/link'
import { Award, CheckCircle2, Clock, GraduationCap, PlayCircle } from 'lucide-react'
import type { CursoNoCatalogo } from '@/lib/membro/cursos'
import { duracaoLegivel } from '@/lib/cursos/regras'

export function BarraDeProgresso({ pct, rotulo }: { pct: number; rotulo?: string }) {
  return (
    <div className="flex items-center gap-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={rotulo ?? 'Progresso'}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  )
}

/** Capa do curso; sem imagem, um fundo com a inicial. */
export function Capa({ url, titulo, className = '' }: { url: string | null; titulo: string; className?: string }) {
  if (url) {
    return <img src={url} alt="" className={`aspect-video w-full object-cover ${className}`} />
  }
  return (
    <div className={`flex aspect-video w-full items-center justify-center bg-gradient-to-br from-primary to-[rgb(160_20_14)] ${className}`} aria-hidden="true">
      <GraduationCap className="size-10 text-white/70" />
      <span className="sr-only">{titulo}</span>
    </div>
  )
}

export function CartaoDeCurso({ c }: { c: CursoNoCatalogo }) {
  const destino = `/membro/cursos/${c.id}`
  return (
    <Link href={destino} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition hover:border-primary/40 hover:shadow-sm" data-curso={c.id}>
      <div className="relative">
        <Capa url={c.capa} titulo={c.titulo} />
        {c.certificado && <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-[11px] font-semibold text-white"><Award className="size-3" />Certificado</span>}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-semibold leading-snug group-hover:text-primary">{c.titulo}</h3>
        {c.resumo && <p className="line-clamp-2 text-sm text-muted-foreground">{c.resumo}</p>}
        <p className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><PlayCircle className="size-3.5" />{c.aulas} {c.aulas === 1 ? 'aula' : 'aulas'}</span>
          {(c.carga_horaria || c.duracao > 0) && <span className="flex items-center gap-1"><Clock className="size-3.5" />{c.carga_horaria ? `${c.carga_horaria.toLocaleString('pt-BR')} h` : duracaoLegivel(c.duracao)}</span>}
          {c.temProva && <span className="flex items-center gap-1"><CheckCircle2 className="size-3.5" />com prova</span>}
        </p>
        {c.progresso.feitas > 0 && !c.certificado && <BarraDeProgresso pct={c.progresso.pct} />}
      </div>
    </Link>
  )
}
