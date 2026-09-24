import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificar } from '@/lib/notificacoes/servidor'
import { somarDias } from '@/lib/financeiro/avisos'
import { quemOperaOPatrimonio } from '@/lib/patrimonio/destinatarios'
import { diasAte, quantidade } from '@/lib/patrimonio/estoque'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Rotina diária do Patrimônio (vercel.json). Para não repetir o mesmo aviso
 * todo dia, avisa em datas certas: manutenção que vence daqui a 7 dias, que
 * venceu ontem, devolução que devia ter acontecido ontem e, no Estoque, lote
 * que entra no prazo de aviso do item hoje ou que venceu ontem. Vai para
 * quem opera o patrimônio (e admins). Protegida por CRON_SECRET.
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
  const [{ data: manut }, { data: devol }, { data: lotes }] = await Promise.all([
    admin.from('pat_manutencoes').select('workspace_id,bem_id,descricao,prevista_para,pat_bens(plaqueta,nome,situacao)').is('realizada_em', null).in('prevista_para', [daqui7, ontem]),
    admin.from('pat_cautelas').select('workspace_id,bem_id,nome,prevista_devolucao,pat_bens(plaqueta,nome)').is('devolvido_em', null).eq('prevista_devolucao', ontem),
    admin.from('est_saldos').select('workspace_id,item_id,validade,quantidade,est_itens(codigo,nome,unidade,aviso_validade_dias,ativo)').gt('quantidade', 0)
      .gte('validade', ontem).lte('validade', somarDias(hoje, 365)).limit(20000),
  ])
  type Item = { titulo: string; mensagem: string; link: string; botao?: string }
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
  // Estoque: um aviso por item e validade (somando os locais), no dia em que entra no prazo e no dia seguinte ao vencimento.
  type Material = { codigo: string; nome: string; unidade: string; aviso_validade_dias: number; ativo: boolean }
  const vencimentos = new Map<string, { workspaceId: string; itemId: string; validade: string; qtd: number; m: Material }>()
  for (const l of lotes ?? []) {
    const m = (Array.isArray(l.est_itens) ? l.est_itens[0] : l.est_itens) as Material | null
    const validade = l.validade as string
    if (!m?.ativo || (validade !== ontem && diasAte(validade, hoje) !== m.aviso_validade_dias)) continue
    const chave = `${l.item_id}|${validade}`
    const v = vencimentos.get(chave) ?? { workspaceId: l.workspace_id as string, itemId: l.item_id as string, validade, qtd: 0, m }
    v.qtd += Number(l.quantidade)
    vencimentos.set(chave, v)
  }
  for (const v of vencimentos.values()) {
    const venceu = v.validade === ontem
    porEspaco.set(v.workspaceId, [...(porEspaco.get(v.workspaceId) ?? []), {
      titulo: venceu ? `Material vencido: ${v.m.nome}` : `Material vence em ${v.m.aviso_validade_dias} dias: ${v.m.nome}`,
      mensagem: `${quantidade(v.qtd, v.m.unidade)} (${v.m.codigo}) ${venceu ? 'venceram ontem: registre a perda e tire do uso.' : `vencem em ${v.validade.split('-').reverse().join('/')}: use primeiro.`}`,
      link: `/patrimonio/estoque/${v.itemId}`, botao: 'Ver o material',
    }])
  }
  let avisos = 0
  for (const [workspaceId, itens] of porEspaco) {
    const para = await quemOperaOPatrimonio(admin, workspaceId)
    for (const i of itens.slice(0, 30)) {
      await notificar(admin, { workspaceId, para, atorId: null, categoria: 'patrimonio', titulo: i.titulo, mensagem: i.mensagem, link: i.link, botao: i.botao ?? 'Ver o bem' })
      avisos++
    }
  }
  return Response.json({ ok: true, avisos })
}
