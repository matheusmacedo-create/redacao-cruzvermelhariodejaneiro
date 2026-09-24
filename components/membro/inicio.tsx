import Link from 'next/link'
import { Award, CalendarCheck2, CalendarHeart, ChevronRight, Clock, GraduationCap, UserRound } from 'lucide-react'
import type { Atividade, Formacao, Perfil } from '@/lib/membro/dados'
import type { CursoNoCatalogo } from '@/lib/membro/cursos'
import type { OportunidadeDoMembro } from '@/lib/membro/oportunidades'
import { quando } from '@/lib/oportunidades/regras'
import { BarraDeProgresso } from './cursos'
import { horasLegiveis, mesEAno, primeiroNome, resumoDeHoras, saudacao } from '@/lib/membro/regras'
import { situacaoDaFormacao, VINCULOS } from '@/lib/participantes/regras'

const DATA = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' })

function Numero({ icone: Icone, valor, rotulo }: { icone: typeof Clock; valor: string | number; rotulo: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <Icone className="mb-2 size-5 text-[#e32219]" />
      <p className="text-2xl font-bold tabular-nums tracking-tight">{valor}</p>
      <p className="text-xs text-neutral-500">{rotulo}</p>
    </div>
  )
}

/**
 * A vista do início: quem ele é na filial, as horas, os
 * certificados e o que fez por último.
 */
export function InicioView({ nome, perfil, formacoes, atividades, hoje, hora, continuar = null, proxima = null }: {
  nome: string; perfil: Perfil; formacoes: Formacao[]; atividades: Atividade[]; hoje: string; hora: number; continuar?: CursoNoCatalogo | null; proxima?: OportunidadeDoMembro | null
}) {
  const horas = resumoDeHoras(atividades, hoje)
  const validas = formacoes.filter((f) => situacaoDaFormacao(f.valido_ate, hoje) !== 'vencida').length
  const desde = perfil.aprovado_em ?? perfil.created_at

  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-2xl bg-neutral-900 p-6 text-white sm:p-8">
        <p className="text-sm text-neutral-300">{saudacao(hora)},</p>
        <h1 className="text-3xl font-bold tracking-tight">{primeiroNome(nome)}</h1>
        <p className="mt-2 text-sm text-neutral-300">
          {[VINCULOS[perfil.vinculo as keyof typeof VINCULOS]?.rotulo ?? 'Voluntário', perfil.funcao, perfil.setores.join(', ')].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-1 text-xs text-neutral-400">Voluntário da Cruz Vermelha RJ desde {mesEAno(desde)}</p>
      </section>

      {proxima && (
        <Link href="/membro/oportunidades" className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 hover:border-emerald-300" id="proxima-atividade">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white"><CalendarHeart className="size-6 text-emerald-700" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium uppercase tracking-wide text-emerald-800">{proxima.minha === 'espera' ? 'Na lista de espera' : 'Sua próxima atividade'}</span>
            <span className="block truncate font-semibold">{proxima.titulo}</span>
            <span className="block text-xs text-emerald-900/80">{quando(proxima.inicio, proxima.fim)}{proxima.local ? ` · ${proxima.local}` : ''}</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-emerald-700/60" />
        </Link>
      )}

      {continuar && (
        <Link href={`/membro/cursos/${continuar.id}`} className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4 hover:border-neutral-300" id="continuar">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-red-50"><GraduationCap className="size-6 text-[#e32219]" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium uppercase tracking-wide text-neutral-500">{continuar.progresso.feitas ? 'Continue de onde parou' : 'Comece um curso'}</span>
            <span className="block truncate font-semibold">{continuar.titulo}</span>
            {continuar.progresso.feitas > 0 && <BarraDeProgresso pct={continuar.progresso.pct} />}
          </span>
          <ChevronRight className="size-5 shrink-0 text-neutral-400" />
        </Link>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Seus números">
        <Numero icone={Clock} valor={horasLegiveis(horas.noAno)} rotulo={`de voluntariado em ${hoje.slice(0, 4)}`} />
        <Numero icone={CalendarCheck2} valor={horas.acoesNoAno} rotulo={`${horas.acoesNoAno === 1 ? 'ação' : 'ações'} em ${hoje.slice(0, 4)}`} />
        <Numero icone={Clock} valor={horasLegiveis(horas.total)} rotulo="no total" />
        <Numero icone={Award} valor={validas} rotulo={validas === 1 ? 'certificado válido' : 'certificados válidos'} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5" id="certificados">
          <h2 className="mb-3 flex items-center justify-between font-semibold">Meus certificados e formações<Link href="/membro/certificados" className="text-xs font-medium text-[#e32219] hover:underline">Ver todos</Link></h2>
          {formacoes.length ? (
            <ul className="flex flex-col gap-2">
              {formacoes.map((f) => {
                const s = situacaoDaFormacao(f.valido_ate, hoje)
                return (
                  <li key={f.id} className="flex items-start justify-between gap-3 rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{f.titulo}</span>
                      <span className="block text-xs text-neutral-500">{[f.instituicao, f.concluido_em ? `concluída em ${DATA(f.concluido_em)}` : null].filter(Boolean).join(' · ')}</span>
                    </span>
                    {f.valido_ate && (
                      <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${s === 'vencida' ? 'bg-red-50 text-red-700' : s === 'vence_logo' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                        {s === 'vencida' ? 'Venceu' : 'Vale até'} {DATA(f.valido_ate)}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : <p className="text-sm text-neutral-500">Suas formações aparecem aqui assim que a coordenação registrar.</p>}
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5" id="atividades">
          <h2 className="mb-3 font-semibold">Minhas últimas atividades</h2>
          {atividades.length ? (
            <ul className="divide-y divide-neutral-100">
              {atividades.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0"><span className="block truncate">{a.atividade}</span><span className="text-xs text-neutral-500">{DATA(a.data)}</span></span>
                  <span className="shrink-0 font-medium tabular-nums">{horasLegiveis(a.horas)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-neutral-500">Suas horas de voluntariado aparecem aqui conforme a coordenação registra cada ação.</p>}
        </section>
      </div>

      <Link href="/membro/perfil" className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-sm hover:border-neutral-300">
        <UserRound className="size-5 text-neutral-500" />
        <span><span className="font-medium">Mantenha seu cadastro em dia</span><span className="block text-xs text-neutral-500">Telefone, endereço, contato de emergência e disponibilidade.</span></span>
      </Link>
    </div>
  )
}
