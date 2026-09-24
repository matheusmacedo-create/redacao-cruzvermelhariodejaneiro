import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificar } from '@/lib/notificacoes/servidor'
import { somarDias } from '@/lib/financeiro/avisos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Rotina diária do Patrimônio (vercel.json). Para não repetir o mesmo aviso
 * todo dia, avisa em datas certas: manutenção que vence daqui a 7 dias, que
 * venceu ontem, e devolução que devia ter acontecido ontem. Vai para quem
 * opera o patrimônio (e admins). Protegida por CRON_SECRET.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  const recebido = request.headers.get('authorization') ?? ''
  const esperado = `Bearer ${segredo ?? ''}`
  const ok = Boolean(segredo) && recebido.length === esperado.length && timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))
  if (!ok) return Response.json({ erro: 'Não autorizado.' }, { status: 401 })

  const admin = createAdminClient()
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const daqui7 = somarDias(hoje, 7), ontem = somarDias(hoje, -1)
  const [{ data: manut }, { data: devol }] = await Promise.all([
    admin.from('pat_manutencoes').select('workspace_id,bem_id,descricao,prevista_para,pat_bens(plaqueta,nome,situacao)').is('realizada_em', null).in('prevista_para', [daqui7, ontem]),
    admin.from('pat_cautelas').select('workspace_id,bem_id,nome,prevista_devolucao,pat_bens(plaqueta,nome)').is('devolvido_em', null).eq('prevista_devolucao', ontem),
  ])
  type Item = { titulo: string; mensagem: string; link: string }
  const porEspaco = new Map<string, Item[]>()
  const bem = (x: unknown) => (Array.isArray(x) ? x[0] : x) as { plaqueta: string; nome: string; situacao?: string } | null
  for (const m of manut ?? []) {
    const b = bem(m.pat_bens)
    if (!b || b.situacao === 'baixado') continue
    const venceu = m.prevista_para === ontem
    porEspaco.set(m.workspace_id as string, [...(porEspaco.get(m.workspace_id as string) ?? []), {
      titulo: venceu ? `Manutenção vencida: ${b.plaqueta}` : `Manutenção em 7 dias: ${b.plaqueta}`, mensagem: `${b.nome} — ${m.descricao as string}`, link: `/patrimonio/${m.bem_id}`,
    }])
  }
  for (const c of devol ?? []) {
    const b = bem(c.pat_bens)
    if (!b) continue
    porEspaco.set(c.workspace_id as string, [...(porEspaco.get(c.workspace_id as string) ?? []), {
      titulo: `Devolução atrasada: ${b.plaqueta}`, mensagem: `${b.nome} está com ${c.nome as string} e devia ter voltado ontem.`, link: `/patrimonio/${c.bem_id}`,
    }])
  }
  let avisos = 0
  for (const [workspaceId, itens] of porEspaco) {
    const [{ data: admins }, { data: acessos }] = await Promise.all([
      admin.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('role', 'admin'),
      admin.from('pat_acesso').select('user_id').eq('workspace_id', workspaceId).in('nivel', ['operar', 'gestao']),
    ])
    const para = [...new Set([...(admins ?? []), ...(acessos ?? [])].map((x) => x.user_id as string))]
    for (const i of itens.slice(0, 20)) {
      await notificar(admin, { workspaceId, para, atorId: null, categoria: 'patrimonio', titulo: i.titulo, mensagem: i.mensagem, link: i.link, botao: 'Ver o bem' })
      avisos++
    }
  }
  return Response.json({ ok: true, avisos })
}
