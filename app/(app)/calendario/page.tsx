import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { CalendarView } from './calendar-view'
import { tituloDaArea } from '@/lib/navegacao'
import { feriadosDoAno } from '@/lib/apis-publicas/servidor'

export const metadata = { title: tituloDaArea('/calendario') }

/** De quando o calendário carrega: seis meses para trás cobre a consulta ao
 *  que já passou sem trazer o histórico inteiro a cada abertura. */
function inicioDaJanela() {
  const d = new Date()
  d.setMonth(d.getMonth() - 6)
  return d.toISOString().slice(0, 10)
}

export default async function CalendarioPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data: events } = await supabase
    .from('calendar_events')
    .select('id,title,event_date,event_time,type,pauta_id,content_id,channel')
    .eq('workspace_id', context.workspace.id)
    .gte('event_date', inicioDaJanela())
    .order('event_date')
    .limit(1000)
  // Feriados nacionais (BrasilAPI) e os do Rio, do ano passado ao próximo.
  const ano = new Date().getFullYear()
  const feriados = (await Promise.all([ano - 1, ano, ano + 1].map(feriadosDoAno))).flat()
  return <div><PageHeader title="Calendário editorial" description="Prazos, atividades e publicações programadas neste espaço. Os feriados nacionais e do Rio aparecem em destaque." /><CalendarView events={events ?? []} feriados={feriados} /></div>
}
