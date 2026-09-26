import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificar } from '@/lib/notificacoes/servidor'
import { somarDias } from '@/lib/financeiro/avisos'
import { quemOperaOPatrimonio } from '@/lib/patrimonio/destinatarios'
import { diasAte, quantidade } from '@/lib/patrimonio/estoque'
import { TIPOS_DE_DOCUMENTO, placaLegivel, somarMeses, type TipoDeDocumento } from '@/lib/patrimonio/frota'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Rotina diária do Patrimônio (vercel.json). Para não repetir o mesmo aviso
 * todo dia, avisa em datas certas: manutenção que vence daqui a 7 dias, que
 * venceu ontem, devolução que devia ter acontecido ontem e, no Estoque, lote
 * que entra no prazo de aviso do item hoje ou que venceu ontem; na Frota,
 * documento que vence em 30 ou 7 dias ou venceu ontem, CNH e curso de
 * emergência que vencem em 30 dias ou venceram ontem, e manutenção por data
 * que vence em 7 dias ou venceu ontem. Vai para quem opera o patrimônio (e
 * admins). Protegida por CRON_SECRET.
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
  const daqui30 = somarDias(hoje, 30)
  const [{ data: manut }, { data: devol }, { data: lotes }, { data: docs }, { data: condutores }, { data: planos }] = await Promise.all([
    admin.from('pat_manutencoes').select('workspace_id,bem_id,descricao,prevista_para,pat_bens(plaqueta,nome,situacao)').is('realizada_em', null).in('prevista_para', [daqui7, ontem]),
    admin.from('pat_cautelas').select('workspace_id,bem_id,nome,prevista_devolucao,pat_bens(plaqueta,nome)').is('devolvido_em', null).eq('prevista_devolucao', ontem),
    admin.from('est_saldos').select('workspace_id,item_id,validade,quantidade,est_itens(codigo,nome,unidade,aviso_validade_dias,ativo)').gt('quantidade', 0)
      .gte('validade', ontem).lte('validade', somarDias(hoje, 365)).limit(20000),
    admin.from('frota_documentos').select('workspace_id,veiculo_id,tipo,descricao,vencimento,frota_veiculos(placa,apelido)').in('vencimento', [daqui30, daqui7, ontem]),
    admin.from('frota_condutores').select('workspace_id,nome,cnh_validade,emergencia_validade').eq('ativo', true).or(`cnh_validade.in.(${daqui30},${ontem}),emergencia_validade.in.(${daqui30},${ontem})`),
    admin.from('frota_planos').select('workspace_id,veiculo_id,nome,a_cada_meses,ultima_data,frota_veiculos(placa,apelido)').eq('ativo', true).not('a_cada_meses', 'is', null).not('ultima_data', 'is', null).limit(20000),
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
  // Frota.
  const veiculo = (x: unknown) => { const v = (Array.isArray(x) ? x[0] : x) as { placa: string; apelido: string | null } | null; return v ? `${v.apelido ? `${v.apelido} · ` : ''}${placaLegivel(v.placa)}` : 'veículo' }
  const avisar = (ws: string, i: Item) => porEspaco.set(ws, [...(porEspaco.get(ws) ?? []), i])
  const br = (d: string) => d.split('-').reverse().join('/')
  for (const d of docs ?? []) {
    const venceu = d.vencimento === ontem
    avisar(d.workspace_id as string, {
      titulo: `${TIPOS_DE_DOCUMENTO[d.tipo as TipoDeDocumento]} ${venceu ? 'vencido' : `vence em ${diasAte(d.vencimento as string, hoje)} dias`}: ${veiculo(d.frota_veiculos)}`,
      mensagem: `${d.descricao ? `${d.descricao}. ` : ''}${venceu ? 'Venceu ontem' : `Vence em ${br(d.vencimento as string)}`}${venceu ? ': o veículo não deve rodar sem ele.' : '.'}`,
      link: `/patrimonio/frota/${d.veiculo_id}`, botao: 'Ver o veículo',
    })
  }
  for (const c of condutores ?? []) {
    for (const [data, oque] of [[c.cnh_validade, 'CNH'], [c.emergencia_validade, 'curso de veículo de emergência']] as [string | null, string][]) {
      if (data !== daqui30 && data !== ontem) continue
      avisar(c.workspace_id as string, {
        titulo: `${oque === 'CNH' ? 'CNH' : 'Curso de emergência'} de ${c.nome as string} ${data === ontem ? 'venceu' : 'vence em 30 dias'}`,
        mensagem: data === ontem ? `Venceu ontem: o Palácio Virtual não deixa ${c.nome as string} sair com ${oque === 'CNH' ? 'veículo' : 'ambulância'} até renovar.` : `Vence em ${br(data)}. Peça a renovação.`,
        link: '/patrimonio/frota/condutores', botao: 'Ver condutores',
      })
    }
  }
  for (const pl of planos ?? []) {
    const proxima = somarMeses(pl.ultima_data as string, Number(pl.a_cada_meses))
    if (proxima !== daqui7 && proxima !== ontem) continue
    avisar(pl.workspace_id as string, {
      titulo: `${pl.nome as string} ${proxima === ontem ? 'vencida' : 'em 7 dias'}: ${veiculo(pl.frota_veiculos)}`,
      mensagem: `Manutenção programada por tempo (a cada ${pl.a_cada_meses} meses) — ${proxima === ontem ? 'venceu ontem' : `vence em ${br(proxima)}`}.`,
      link: `/patrimonio/frota/${pl.veiculo_id}`, botao: 'Ver o veículo',
    })
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
