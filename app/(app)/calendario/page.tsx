import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { CalendarView } from './calendar-view'

export default async function CalendarioPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data: events } = await supabase.from('calendar_events').select('id,title,event_date,event_time,type,pauta_id').eq('workspace_id', context.workspace.id).order('event_date')
  return <div><PageHeader title="Calendário editorial" description="Prazos, atividades e publicações programadas neste espaço." /><CalendarView events={events ?? []} /></div>
}
