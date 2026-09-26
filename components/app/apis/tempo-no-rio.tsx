import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, Snowflake, Sun, TriangleAlert } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { previsaoDoRio } from '@/lib/apis-publicas/servidor'
import { alertasDoDia, descricaoDoTempo, type DiaDoTempo } from '@/lib/apis-publicas/regras'
import { cn } from '@/lib/utils'

function Icone({ codigo, className }: { codigo: number | null; className?: string }) {
  const C = codigo == null ? Cloud : codigo === 0 ? Sun : codigo <= 2 ? CloudSun : codigo === 3 ? Cloud : codigo <= 48 ? CloudFog
    : codigo <= 57 ? CloudDrizzle : codigo <= 67 || (codigo >= 80 && codigo <= 82) ? CloudRain : codigo <= 86 ? Snowflake : CloudLightning
  return <C className={className} aria-hidden />
}

const diaDaSemana = (iso: string, i: number) =>
  i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)).replace('.', '')

/**
 * Previsão de 7 dias para a sede (Open-Meteo), com os dias de risco em
 * destaque — chuva forte, ventania, calor extremo. É o gancho para o GRD e
 * para a pauta se prepararem antes de a Defesa Civil soar a sirene.
 * Fora do ar, some sem quebrar o painel.
 */
export async function TempoNoRio() {
  const dias: DiaDoTempo[] = await previsaoDoRio()
  if (!dias.length) return null
  const comAlerta = dias.map((d) => ({ d, alertas: alertasDoDia(d) }))
  const pior = comAlerta.flatMap((x) => x.alertas.map((a) => ({ ...a, dia: x.d.data })))
  const temAlerta = pior.some((a) => a.nivel === 'alerta')
  return (
    <Card className={cn('p-4', temAlerta && 'border-destructive/50')}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Tempo no Rio · próximos 7 dias</h2>
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="text-[11px] text-muted-foreground hover:underline">Previsão: Open-Meteo</a>
      </div>
      {pior.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1">
          {pior.slice(0, 4).map((a, i) => (
            <li key={i} className={cn('flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium', a.nivel === 'alerta' ? 'bg-destructive/10 text-destructive' : 'bg-warning/15 text-warning-foreground')}>
              <TriangleAlert className="size-3.5 shrink-0" />{diaDaSemana(a.dia, dias.findIndex((d) => d.data === a.dia))}: {a.motivo}
            </li>
          ))}
        </ul>
      )}
      <ol className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {comAlerta.map(({ d, alertas }, i) => (
          <li key={d.data} title={descricaoDoTempo(d.codigo)}
            className={cn('flex flex-col items-center gap-0.5 rounded-lg border p-2 text-center', alertas.some((a) => a.nivel === 'alerta') ? 'border-destructive/50 bg-destructive/5' : alertas.length ? 'border-warning/50 bg-warning/5' : 'border-border')}>
            <span className="text-[11px] font-medium capitalize text-muted-foreground">{diaDaSemana(d.data, i)}</span>
            <Icone codigo={d.codigo} className="size-5 text-muted-foreground" />
            <span className="text-xs font-semibold tabular-nums">{d.maxima != null ? Math.round(d.maxima) : '–'}° <span className="font-normal text-muted-foreground">{d.minima != null ? Math.round(d.minima) : '–'}°</span></span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{d.chuvaMm >= 0.5 ? `${Math.round(d.chuvaMm)} mm` : 'sem chuva'}</span>
          </li>
        ))}
      </ol>
    </Card>
  )
}
