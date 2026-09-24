import Link from 'next/link'
import { Award, Download } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { certificadosDoMembro } from '@/lib/membro/cursos'
import { historicoDoMembro } from '@/lib/membro/dados'
import { situacaoDaFormacao } from '@/lib/participantes/regras'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'

export const dynamic = 'force-dynamic'

const DATA = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString('pt-BR', { timeZone: d.length === 10 ? 'UTC' : 'America/Sao_Paulo' })

/**
 * Os certificados emitidos aqui (com PDF e código de verificação) e as
 * demais formações que a coordenação registrou no cadastro.
 */
export default async function Certificados() {
  const m = await exigirMembro()
  const [certificados, { formacoes }] = await Promise.all([certificadosDoMembro(m), historicoDoMembro(m)])
  const hoje = hojeEmSaoPaulo()
  const daqui = new Set(certificados.map((c) => c.curso_titulo))
  const outras = formacoes.filter((f) => !(f.instituicao?.includes('Área do Voluntário') && daqui.has(f.titulo)))
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Certificados</h1>
        <p className="text-sm text-muted-foreground">Tudo o que você concluiu. Cada certificado tem um código que qualquer pessoa pode conferir.</p>
      </div>
      <section className="grid gap-3 sm:grid-cols-2" id="emitidos">
        {certificados.map((c) => {
          const s = situacaoDaFormacao(c.valido_ate, hoje)
          return (
            <div key={c.codigo} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/10"><Award className="size-5 text-success" /></span>
                <span className="min-w-0">
                  <span className="block font-semibold">{c.curso_titulo}</span>
                  <span className="block text-xs text-muted-foreground">Emitido em {DATA(c.emitido_em)}{c.carga_horaria ? ` · ${c.carga_horaria.toLocaleString('pt-BR')} h` : ''} · código {c.codigo}</span>
                  {c.valido_ate && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${s === 'vencida' ? 'bg-destructive/10 text-destructive' : s === 'vence_logo' ? 'bg-warning/15 text-warning-foreground' : 'bg-success/10 text-success'}`}>{s === 'vencida' ? 'Venceu' : 'Vale até'} {DATA(c.valido_ate)}</span>}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <a href={`/membro/certificados/${c.codigo}/pdf`} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground hover:bg-primary/90"><Download className="size-4" />PDF</a>
                <a href={`/certificado/${c.codigo}`} target="_blank" rel="noopener noreferrer" className="rounded-lg px-3 py-2 font-medium text-foreground/85 hover:bg-muted">Página de verificação</a>
              </div>
            </div>
          )
        })}
        {!certificados.length && (
          <p className="rounded-xl border border-dashed border-input bg-card p-8 text-center text-sm text-muted-foreground sm:col-span-2">
            Conclua um <Link href="/membro/cursos" className="font-medium text-primary hover:underline">curso</Link> para ganhar seu primeiro certificado.
          </p>
        )}
      </section>
      {outras.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5" id="outras">
          <h2 className="mb-3 font-semibold">Outras formações no seu cadastro</h2>
          <ul className="divide-y divide-border">
            {outras.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span><span className="block font-medium">{f.titulo}</span><span className="text-xs text-muted-foreground">{[f.instituicao, f.concluido_em ? `concluída em ${DATA(f.concluido_em)}` : null].filter(Boolean).join(' · ')}</span></span>
                {f.valido_ate && <span className="shrink-0 text-xs text-muted-foreground">até {DATA(f.valido_ate)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
