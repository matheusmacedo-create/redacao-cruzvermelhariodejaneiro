import Link from 'next/link'
import { Award, CalendarCheck2, CalendarHeart, ChevronRight, Clock, GraduationCap, Megaphone, Pin, UserRound } from 'lucide-react'
import type { Atividade, Formacao, Perfil } from '@/lib/membro/dados'
import type { CursoNoCatalogo } from '@/lib/membro/cursos'
import type { OportunidadeDoMembro } from '@/lib/membro/oportunidades'
import type { AvisoDoMembro } from '@/lib/membro/canal'
import { quando } from '@/lib/oportunidades/regras'
import { BarraDeProgresso } from './cursos'
import { horasLegiveis, mesEAno, primeiroNome, resumoDeHoras, saudacao } from '@/lib/membro/regras'
import { situacaoDaFormacao, VINCULOS } from '@/lib/participantes/regras'

const DATA = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' })

function Numero({ icone: Icone, valor, rotulo }: { icone: typeof Clock; valor: string | number; rotulo: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Icone className="mb-2 size-5 text-primary" />
      <p className="text-2xl font-bold tabular-nums tracking-tight">{valor}</p>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
    </div>
  )
}

/**
 * A vista do início: quem ele é na filial, as horas, os
 * certificados e o que fez por último.
 */
export function InicioView({ nome, perfil, formacoes, atividades, hoje, hora, continuar = null, proxima = null, avisos = [] }: {
  nome: string; perfil: Perfil; formacoes: Formacao[]; atividades: Atividade[]; hoje: string; hora: number; continuar?: CursoNoCatalogo | null; proxima?: OportunidadeDoMembro | null; avisos?: AvisoDoMembro[]
}) {
  const horas = resumoDeHoras(atividades, hoje)
  const validas = formacoes.filter((f) => situacaoDaFormacao(f.valido_ate, hoje) !== 'vencida').length
  const desde = perfil.aprovado_em ?? perfil.created_at

  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-xl bg-primary p-6 text-primary-foreground sm:p-8" id="boas-vindas">
        {/* A cruz, grande e discreta, como marca d'água do cartão. */}
        <span aria-hidden="true" className="pointer-events-none absolute -right-6 -top-6 size-44 opacity-[0.12] sm:right-6 sm:top-1/2 sm:-translate-y-1/2">
          <span className="absolute left-1/2 top-0 h-full w-[34%] -translate-x-1/2 bg-primary-foreground" />
          <span className="absolute left-0 top-1/2 h-[34%] w-full -translate-y-1/2 bg-primary-foreground" />
        </span>
        <p className="relative text-sm text-primary-foreground/85">{saudacao(hora)},</p>
        <h1 className="relative text-3xl font-bold tracking-tight">{primeiroNome(nome)}</h1>
        <p className="relative mt-2 text-sm text-primary-foreground/85">
          {[VINCULOS[perfil.vinculo as keyof typeof VINCULOS]?.rotulo ?? 'Voluntário', perfil.funcao, perfil.setores.join(', ')].filter(Boolean).join(' · ')}
        </p>
        <p className="relative mt-1 text-xs text-primary-foreground/75">Voluntário da Cruz Vermelha RJ desde {mesEAno(desde)}</p>
      </section>

      {avisos.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5" id="mural">
          <h2 className="mb-3 flex items-center justify-between font-semibold"><span className="flex items-center gap-2"><Megaphone className="size-4 text-primary" />Avisos</span><Link href="/membro/avisos" className="text-xs font-medium text-primary hover:underline">Ver todos</Link></h2>
          <ul className="flex flex-col gap-2">
            {avisos.slice(0, 3).map((a) => (
              <li key={a.id} className="rounded-xl bg-muted/60 px-3 py-2.5">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {a.fixado && <Pin className="size-3.5 shrink-0 text-primary" aria-label="Fixado" />}{a.titulo}
                  {!a.visto && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">Novo</span>}
                </p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{a.texto}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {proxima && (
        <Link href="/membro/oportunidades" className="flex items-center gap-4 rounded-xl border border-success/30 bg-success/10 p-4 hover:border-success/50" id="proxima-atividade">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-card"><CalendarHeart className="size-6 text-success" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium uppercase tracking-wide text-success">{proxima.minha === 'espera' ? 'Na lista de espera' : 'Sua próxima atividade'}</span>
            <span className="block truncate font-semibold">{proxima.titulo}</span>
            <span className="block text-xs text-success/80">{quando(proxima.inicio, proxima.fim)}{proxima.local ? ` · ${proxima.local}` : ''}</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-success/60" />
        </Link>
      )}

      {continuar && (
        <Link href={`/membro/cursos/${continuar.id}`} className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 hover:border-primary/40" id="continuar">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-destructive/10"><GraduationCap className="size-6 text-primary" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">{continuar.progresso.feitas ? 'Continue de onde parou' : 'Comece um curso'}</span>
            <span className="block truncate font-semibold">{continuar.titulo}</span>
            {continuar.progresso.feitas > 0 && <BarraDeProgresso pct={continuar.progresso.pct} />}
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground/70" />
        </Link>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Seus números">
        <Numero icone={Clock} valor={horasLegiveis(horas.noAno)} rotulo={`de voluntariado em ${hoje.slice(0, 4)}`} />
        <Numero icone={CalendarCheck2} valor={horas.acoesNoAno} rotulo={`${horas.acoesNoAno === 1 ? 'ação' : 'ações'} em ${hoje.slice(0, 4)}`} />
        <Numero icone={Clock} valor={horasLegiveis(horas.total)} rotulo="no total" />
        <Numero icone={Award} valor={validas} rotulo={validas === 1 ? 'certificado válido' : 'certificados válidos'} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5" id="certificados">
          <h2 className="mb-3 flex items-center justify-between font-semibold">Meus certificados e formações<Link href="/membro/certificados" className="text-xs font-medium text-primary hover:underline">Ver todos</Link></h2>
          {formacoes.length ? (
            <ul className="flex flex-col gap-2">
              {formacoes.map((f) => {
                const s = situacaoDaFormacao(f.valido_ate, hoje)
                return (
                  <li key={f.id} className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/60 px-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{f.titulo}</span>
                      <span className="block text-xs text-muted-foreground">{[f.instituicao, f.concluido_em ? `concluída em ${DATA(f.concluido_em)}` : null].filter(Boolean).join(' · ')}</span>
                    </span>
                    {f.valido_ate && (
                      <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${s === 'vencida' ? 'bg-destructive/10 text-destructive' : s === 'vence_logo' ? 'bg-warning/15 text-warning-foreground' : 'bg-success/10 text-success'}`}>
                        {s === 'vencida' ? 'Venceu' : 'Vale até'} {DATA(f.valido_ate)}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Suas formações aparecem aqui assim que a coordenação registrar.</p>}
        </section>

        <section className="rounded-xl border border-border bg-card p-5" id="atividades">
          <h2 className="mb-3 font-semibold">Minhas últimas atividades</h2>
          {atividades.length ? (
            <ul className="divide-y divide-border">
              {atividades.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0"><span className="block truncate">{a.atividade}</span><span className="text-xs text-muted-foreground">{DATA(a.data)}</span></span>
                  <span className="shrink-0 font-medium tabular-nums">{horasLegiveis(a.horas)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Suas horas de voluntariado aparecem aqui conforme a coordenação registra cada ação.</p>}
        </section>
      </div>

      <Link href="/membro/perfil" className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm hover:border-primary/40">
        <UserRound className="size-5 text-muted-foreground" />
        <span><span className="font-medium">Mantenha seu cadastro em dia</span><span className="block text-xs text-muted-foreground">Telefone, endereço, contato de emergência e disponibilidade.</span></span>
      </Link>
    </div>
  )
}
