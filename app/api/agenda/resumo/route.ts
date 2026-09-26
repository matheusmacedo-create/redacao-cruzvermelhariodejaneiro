import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import { enviarComSeguranca } from '@/lib/contas/servidor'
import { lerCamadas } from '@/lib/agenda/camadas'
import { camadasDisponiveis, itensDaAgenda } from '@/lib/agenda/fontes'
import { agoraEmBrasilia, segundaDaSemana, somarDias } from '@/lib/agenda/datas'
import { alertasDaAgenda } from '@/lib/agenda/regras'
import { emailDoResumoSemanal } from '@/lib/agenda/resumo'
import { ehPapel } from '@/lib/permissoes'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Resumo semanal da Agenda (vercel.json, segunda de manhã): a semana que
 * começa e o que pede atenção, só para quem ligou o resumo na Agenda. Respeita
 * as camadas que a pessoa desligou e o que ela pode ver em cada área (o
 * e-mail vai para a própria pessoa, então entram também as camadas que não
 * saem no link de assinatura, como Financeiro, se ela tiver acesso).
 *
 * Protegida por CRON_SECRET, como /api/notificacoes/resumo.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  const recebido = request.headers.get('authorization') ?? ''
  const esperado = `Bearer ${segredo ?? ''}`
  const ok = Boolean(segredo) && recebido.length === esperado.length && timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))
  if (!ok) return Response.json({ erro: 'Não autorizado.' }, { status: 401 })

  const admin = createAdminClient()
  const { data: quem, error } = await admin.from('agenda_preferencias').select('workspace_id,user_id,camadas_ocultas').eq('resumo_semanal', true).limit(500)
  if (error) return Response.json({ erro: 'Falha ao ler as preferências da agenda.' }, { status: 500 })
  if (!quem?.length) return Response.json({ ok: true, enviados: 0 })

  const agora = agoraEmBrasilia()
  const de = segundaDaSemana(agora.dia)
  const ate = somarDias(de, 6)
  const ids = [...new Set(quem.map((q) => q.user_id as string))]
  const [{ data: pessoas }, { data: vinculos }] = await Promise.all([
    admin.from('profiles').select('id, full_name, email, email_confirmado_em, active').in('id', ids),
    admin.from('workspace_members').select('workspace_id, user_id, role').in('user_id', ids),
  ])
  const pessoaDe = new Map((pessoas ?? []).map((p) => [p.id as string, p]))

  let enviados = 0
  for (const q of quem) {
    const pessoa = pessoaDe.get(q.user_id)
    const vinculo = (vinculos ?? []).find((v) => v.workspace_id === q.workspace_id && v.user_id === q.user_id)
    if (!pessoa?.active || !pessoa.email || !pessoa.email_confirmado_em || !vinculo || !ehPapel(vinculo.role)) continue
    try {
      const disponiveis = await camadasDisponiveis(admin, q.workspace_id, q.user_id, vinculo.role, { semSessao: true })
      const ocultas = lerCamadas(q.camadas_ocultas)
      const camadas = [...disponiveis].filter((c) => !ocultas.includes(c))
      // Olha três semanas à frente para os alertas (data comemorativa chegando, conta vencendo).
      const { itens } = await itensDaAgenda(admin, q.workspace_id, q.user_id, { de: somarDias(de, -7), ate: somarDias(de, 27) }, camadas)
      const alertas = alertasDaAgenda(itens, agora, somarDias(de, 27))
      const enviado = await enviarComSeguranca(pessoa.email, emailDoResumoSemanal({
        urlBase: urlBase(), nome: pessoa.full_name ?? '', de, ate, itens, alertas,
      }))
      if (enviado) enviados += 1
    } catch (causa) {
      console.error('[agenda] resumo não enviado:', causa instanceof Error ? causa.message : causa)
    }
  }
  return Response.json({ ok: true, enviados })
}
