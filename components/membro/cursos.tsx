import Link from 'next/link'
import { Award, CheckCircle2, ChevronRight, ClipboardCheck, Clock, GraduationCap, Lock, PlayCircle } from 'lucide-react'
import type { CursoNoCatalogo } from '@/lib/membro/cursos'
import { etapaDoCurso } from '@/lib/membro/inicio'
import { duracaoLegivel } from '@/lib/cursos/regras'
import { cn } from '@/lib/utils'
import { Selo } from './pecas'

export function BarraDeProgresso({ pct, rotulo }: { pct: number; rotulo?: string }) {
  return (
    <div className="flex items-center gap-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={rotulo ?? 'Progresso'}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  )
}

/**
 * Capa do curso. Sem imagem, um fundo neutro com o ícone: o vermelho fica
 * para o que pede ação, e um degradê vermelho em todo cartão sem capa
 * competia com o botão principal. Decorativa (o título vem logo ao lado).
 */
export function Capa({ url, className = 'aspect-[2/1] w-full' }: { url: string | null; className?: string }) {
  if (url) return <img src={url} alt="" className={cn('object-cover', className)} />
  return (
    <div className={cn('flex items-center justify-center bg-muted', className)} aria-hidden="true">
      <GraduationCap className="size-8 text-muted-foreground/60 sm:size-10" />
    </div>
  )
}

/**
 * Cartão do catálogo. No celular, horizontal (miniatura de 80px), para caber
 * mais de um curso na tela. A partir de sm, fica vertical com a capa em cima
 * só quando algum curso do catálogo tem imagem (`vertical`, decidido pela
 * página inteira); sem nenhuma capa, fica horizontal em todas as larguras, em
 * vez de repetir blocos cinza vazios. O estado fica sempre no mesmo lugar,
 * embaixo: barra de progresso, "Falta a prova final" (a 100% sem certificado,
 * que antes parecia concluído) ou "Concluído". A etapa segue a mesma regra do
 * Início (`etapaDoCurso`).
 */
export function CartaoDeCurso({ c, vertical }: { c: CursoNoCatalogo; vertical: boolean }) {
  const etapa = etapaDoCurso(c)
  return (
    <Link href={`/membro/cursos/${c.id}`} data-curso={c.id}
      className={cn('group flex h-full gap-3 overflow-hidden rounded-xl border border-border bg-card p-3 transition-colors hover:border-foreground/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', vertical && 'sm:flex-col sm:gap-0 sm:p-0')}>
      <div className={cn('size-20 shrink-0 overflow-hidden rounded-lg', vertical && 'sm:size-auto sm:w-full sm:rounded-none')}>
        <Capa url={c.capa} className={cn('size-full', vertical && 'sm:aspect-[2/1] sm:h-auto')} />
      </div>
      <div className={cn('flex min-w-0 flex-1 flex-col gap-1.5', vertical && 'sm:gap-2 sm:p-4')}>
        <h3 className="font-semibold leading-snug wrap-break-word">{c.titulo}</h3>
        {c.resumo && <p className="line-clamp-2 text-sm text-muted-foreground">{c.resumo}</p>}
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><PlayCircle className="size-3.5" aria-hidden="true" />{c.aulas} {c.aulas === 1 ? 'aula' : 'aulas'}</span>
          {(c.carga_horaria || c.duracao > 0) && <span className="flex items-center gap-1"><Clock className="size-3.5" aria-hidden="true" />{c.carga_horaria ? `${c.carga_horaria.toLocaleString('pt-BR')} h` : duracaoLegivel(c.duracao)}</span>}
          {c.temProva && <span className="flex items-center gap-1"><ClipboardCheck className="size-3.5" aria-hidden="true" />com prova</span>}
        </p>
        {etapa !== 'novo' && (
          <div className="mt-auto pt-1">
            {etapa === 'andamento' && <BarraDeProgresso pct={c.progresso.pct} rotulo={`Progresso em ${c.titulo}`} />}
            {etapa === 'prova' && <Selo tom="aviso" icone={ClipboardCheck}>Falta a prova final</Selo>}
            {etapa === 'concluido' && <Selo tom="sucesso" icone={Award}>Concluído</Selo>}
          </div>
        )}
      </div>
    </Link>
  )
}

export type EstadoDaProva = 'aprovada' | 'liberada' | 'bloqueada'

/**
 * A prova final como último item do conteúdo (na página do curso e na
 * lateral da aula). Bloqueada, diz o que falta em vez de só sumir; liberada,
 * é um link. `compacto` é o tamanho da lateral.
 */
export function ItemDaProva({ cursoId, estado, aulas, detalhe, compacto = false }: { cursoId: string; estado: EstadoDaProva; aulas: number; detalhe?: string; compacto?: boolean }) {
  const caixa = cn('flex items-center gap-3 text-sm', compacto ? 'min-h-11 gap-2 px-3 py-2' : 'min-h-12 px-4 py-3')
  const icone = compacto ? 'size-4 shrink-0' : 'size-5 shrink-0'
  if (estado === 'liberada') {
    return (
      <Link href={`/membro/cursos/${cursoId}/prova`} className={cn(caixa, 'font-medium transition-colors hover:bg-muted/60')}>
        <ClipboardCheck className={cn(icone, 'text-primary')} aria-hidden="true" />
        <span className="min-w-0 flex-1">Prova final{detalhe && <span className="block text-xs font-normal text-muted-foreground">{detalhe}</span>}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    )
  }
  return (
    <div className={caixa}>
      {estado === 'aprovada'
        ? <CheckCircle2 className={cn(icone, 'text-success')} aria-hidden="true" />
        : <Lock className={cn(icone, 'text-muted-foreground')} aria-hidden="true" />}
      <span className="min-w-0 flex-1">
        Prova final
        <span className="block text-xs text-muted-foreground">{estado === 'aprovada' ? 'Aprovada' : `Libera ao concluir ${aulas === 1 ? 'a aula' : `as ${aulas} aulas`}`}</span>
      </span>
    </div>
  )
}

/** A grade de cartões: uma coluna no celular, duas a partir de sm e, com capas (`vertical`), três no computador. */
export function GradeDeCursos({ cursos, vertical, className }: { cursos: CursoNoCatalogo[]; vertical: boolean; className?: string }) {
  return (
    <ul className={cn('grid gap-3 sm:grid-cols-2 sm:gap-4', vertical && 'lg:grid-cols-3', className)} data-ajuda="membro.cursos">
      {cursos.map((c) => <li key={c.id} className="min-w-0"><CartaoDeCurso c={c} vertical={vertical} /></li>)}
    </ul>
  )
}
