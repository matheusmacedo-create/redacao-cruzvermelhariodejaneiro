import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import { enviarAoVoluntario } from '@/lib/membro/comunicacao'
import { emailDeLembrete } from '@/lib/membro/emails'
import { quando } from '@/lib/oportunidades/regras'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Início do dia (00h de São Paulo, UTC-3) a `dias` de hoje, em ISO. */
function diaEmSaoPaulo(dias: number) {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const d = new Date(`${hoje}T00:00:00-03:00`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString()
}

/**
 * Rotina diária (vercel.json): lembrete por e-mail a quem está inscrito numa
 * atividade que acontece amanhã. Cada inscrição recebe um lembrete só
 * (oportunidade_inscricoes.lembrete_em). Protegida por CRON_SECRET, como as
 * outras rotinas.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  const recebido = request.headers.get('authorization') ?? ''
  const esperado = `Bearer ${segredo ?? ''}`
  const ok = Boolean(segredo) && recebido.length === esperado.length && timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))
  if (!ok) return Response.json({ erro: 'Não autorizado.' }, { status: 401 })

  const admin = createAdminClient()
  const { data: oportunidades, error } = await admin.from('oportunidades').select('id,titulo,descricao,local,inicio,fim')
    .eq('publicado', true).is('cancelada_em', null).gte('inicio', diaEmSaoPaulo(1)).lt('inicio', diaEmSaoPaulo(2)).limit(200)
  if (error) return Response.json({ erro: 'Falha ao ler as oportunidades.' }, { status: 500 })

  let enviados = 0
  for (const o of oportunidades ?? []) {
    const { data: inscricoes } = await admin.from('oportunidade_inscricoes').select('id,participantes(nome,nome_social,email,situacao)')
      .eq('oportunidade_id', o.id).eq('situacao', 'inscrito').is('lembrete_em', null).limit(2000)
    for (const i of inscricoes ?? []) {
      const p = (Array.isArray(i.participantes) ? i.participantes[0] : i.participantes) as { nome: string; nome_social: string | null; email: string | null; situacao: string } | null
      if (p?.situacao === 'ativo' && await enviarAoVoluntario(p.email, emailDeLembrete({
        nome: p.nome_social || p.nome, titulo: o.titulo, quando: quando(o.inicio, o.fim), local: o.local, descricao: o.descricao, url: `${urlBase()}/membro/oportunidades`,
      }))) enviados++
      // Marca mesmo sem e-mail: a rotina não tenta de novo amanhã a mesma inscrição.
      await admin.from('oportunidade_inscricoes').update({ lembrete_em: new Date().toISOString() }).eq('id', i.id)
    }
  }
  return Response.json({ ok: true, oportunidades: oportunidades?.length ?? 0, enviados })
}
