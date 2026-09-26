import 'server-only'
import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import { notificar } from '@/lib/notificacoes/servidor'
import { enviarPelaCaixaAutomatica } from '@/lib/correio/enviar'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'
import { dataCurta } from '@/lib/financeiro/regras'
import { numeroDoPedido } from './regras'
import { diaSeguinte, resumoDosConvites, textoDoLembrete, type Convite } from './convites'
import { pessoasDoFinanceiro } from './servidor'

/**
 * O lado do servidor de "Pedir propostas" (docs/compras-cotacao-automatica.md).
 * A página e as rotas do fornecedor (/cotacao/<token>, /api/publico/cotacao)
 * não têm sessão: tudo aqui usa o cliente de serviço e só devolve o que o
 * token abre.
 */

type Admin = SupabaseClient

export const novoTokenDoConvite = () => randomBytes(24).toString('base64url')
export const ehTokenDoConvite = (t: string) => /^[A-Za-z0-9_-]{32}$/.test(t)
export const linkDoConvite = (token: string) => `${urlBase()}/cotacao/${token}`

const hojeEmSaoPaulo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

/** Quem compra, como sai no e-mail e na página do fornecedor. */
export async function compradorDe(admin: Admin, entidadeId: string): Promise<{ nome: string; cnpj: string | null }> {
  const { data: e } = await admin.from('fin_entidades').select('nome,razao_social,cnpj,tipo,principal').eq('id', entidadeId).maybeSingle()
  const filial = !e || e.principal || e.tipo === 'filial'
  return {
    nome: (e?.razao_social as string | null) || (filial ? DADOS_DA_FILIAL.nome : (e?.nome as string) ?? DADOS_DA_FILIAL.nome),
    cnpj: (e?.cnpj as string | null) ?? (filial ? DADOS_DA_FILIAL.cnpj.replace(/\D/g, '') : null),
  }
}

export type ConviteAberto = {
  convite: { id: string; token: string; favorecido_id: string; respondido_em: string | null; recusado_em: string | null; visto_em: string | null; cancelado_em: string | null }
  pedido: { id: string; workspace_id: string; entidade_id: string; codigo: string; titulo: string; estado: string; local_entrega: string | null; necessario_ate: string | null; cotacao_prazo: string | null }
  itens: { id: string; descricao: string; especificacao: string | null; quantidade: number; unidade: string }[]
  fornecedor: string
  comprador: { nome: string; cnpj: string | null }
  /** A proposta que o fornecedor já mandou (para editar até o prazo). */
  proposta: { validade: string | null; prazo_entrega: string | null; condicao_pagamento: string | null; frete: number; observacao: string | null; arquivo_nome: string | null; precos: Record<string, number | null> } | null
  /** Por que o link não aceita mais proposta (null: aceita). */
  fechado: null | 'cancelado' | 'encerrado' | 'prazo'
}

/** Tudo o que a página do fornecedor mostra, pelo token. Nulo se o token não existe. */
export async function conviteDoToken(token: string, admin: Admin = createAdminClient()): Promise<ConviteAberto | null> {
  if (!ehTokenDoConvite(token)) return null
  const { data: c } = await admin.from('compras_convites')
    .select('id,token,pedido_id,favorecido_id,respondido_em,recusado_em,visto_em,cancelado_em').eq('token', token).maybeSingle()
  if (!c) return null
  const [{ data: p }, { data: itens }, { data: fav }, { data: pr }] = await Promise.all([
    admin.from('compras_pedidos').select('id,workspace_id,entidade_id,ano,numero,titulo,estado,local_entrega,necessario_ate,cotacao_prazo').eq('id', c.pedido_id).maybeSingle(),
    admin.from('compras_itens').select('id,descricao,especificacao,quantidade,unidade').eq('pedido_id', c.pedido_id).order('ordem'),
    admin.from('fin_favorecidos').select('nome').eq('id', c.favorecido_id).maybeSingle(),
    admin.from('compras_propostas').select('validade,prazo_entrega,condicao_pagamento,frete,observacao,arquivo_nome,compras_proposta_itens(item_id,valor_unitario)')
      .eq('pedido_id', c.pedido_id).eq('favorecido_id', c.favorecido_id).maybeSingle(),
  ])
  if (!p) return null
  const hoje = hojeEmSaoPaulo()
  const fechado: ConviteAberto['fechado'] = c.cancelado_em ? 'cancelado'
    : !['aberto', 'em_cotacao'].includes(p.estado as string) ? 'encerrado'
    : p.cotacao_prazo && hoje > (p.cotacao_prazo as string) ? 'prazo' : null
  return {
    convite: c as ConviteAberto['convite'],
    pedido: {
      id: p.id, workspace_id: p.workspace_id, entidade_id: p.entidade_id, codigo: numeroDoPedido(p.ano, p.numero), titulo: p.titulo, estado: p.estado,
      local_entrega: p.local_entrega, necessario_ate: p.necessario_ate, cotacao_prazo: p.cotacao_prazo,
    },
    itens: (itens ?? []).map((i) => ({ ...i, quantidade: Number(i.quantidade) })) as ConviteAberto['itens'],
    fornecedor: (fav?.nome as string) ?? 'Fornecedor',
    comprador: await compradorDe(admin, p.entidade_id),
    proposta: pr ? {
      validade: pr.validade, prazo_entrega: pr.prazo_entrega, condicao_pagamento: pr.condicao_pagamento, frete: Number(pr.frete), observacao: pr.observacao, arquivo_nome: pr.arquivo_nome,
      precos: Object.fromEntries(((pr.compras_proposta_itens ?? []) as { item_id: string; valor_unitario: number | null }[]).map((x) => [x.item_id, x.valor_unitario === null ? null : Number(x.valor_unitario)])),
    } : null,
    fechado,
  }
}

/** Marca que o fornecedor abriu o link (só a primeira vez). Nunca lança. */
export async function marcarVisto(conviteId: string): Promise<void> {
  try {
    await createAdminClient().from('compras_convites').update({ visto_em: new Date().toISOString() }).eq('id', conviteId).is('visto_em', null)
  } catch { /* só um sinal para a tela */ }
}

/** Quem acompanha a cotação: quem mandou os convites; sem ninguém, quem lança no Financeiro da empresa. */
async function quemAcompanha(admin: Admin, pedido: { id: string; workspace_id: string; entidade_id: string }): Promise<string[]> {
  const { data } = await admin.from('compras_convites').select('enviado_por').eq('pedido_id', pedido.id).not('enviado_por', 'is', null)
  const ids = [...new Set((data ?? []).map((x) => x.enviado_por as string))]
  return ids.length ? ids : pessoasDoFinanceiro(admin, pedido.workspace_id, pedido.entidade_id, 2)
}

/** Avisa no sino que um fornecedor respondeu (e, quando for o caso, que todos responderam). Nunca lança. */
export async function avisarResposta(aberto: ConviteAberto, tipo: 'proposta' | 'recusa', todosResponderam: boolean, motivo?: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const para = await quemAcompanha(admin, aberto.pedido)
    const link = `/financeiro/compras/${aberto.pedido.id}`
    const { pedido, fornecedor } = aberto
    await notificar(admin, {
      workspaceId: pedido.workspace_id, para, atorId: null, categoria: 'financeiro', link, botao: 'Ver a cotação',
      titulo: tipo === 'proposta' ? `${fornecedor} mandou a proposta (${pedido.codigo})` : `${fornecedor} não vai cotar (${pedido.codigo})`,
      mensagem: tipo === 'proposta'
        ? `A proposta para “${pedido.titulo}” já está no mapa comparativo.`
        : `Para “${pedido.titulo}”.${motivo ? ` Motivo: ${motivo}` : ''}`.slice(0, 280),
    })
    if (todosResponderam) {
      await notificar(admin, {
        workspaceId: pedido.workspace_id, para, atorId: null, categoria: 'financeiro', link, botao: 'Comparar as propostas',
        titulo: `Todos os fornecedores responderam (${pedido.codigo})`,
        mensagem: `As respostas de “${pedido.titulo}” chegaram. Dá para comparar e mandar para aprovação.`,
      })
    }
  } catch (causa) {
    console.error('[compras] aviso de resposta:', causa instanceof Error ? causa.message : causa)
  }
}

/**
 * A rotina diária da cotação (chamada pela rotina do Financeiro, 8h):
 *  - lembrete para quem ainda não respondeu, na véspera do prazo, pela mesma
 *    caixa do convite (só uma vez por convite);
 *  - aviso a quem pediu as propostas quando o prazo acabou (uma vez por pedido).
 */
export async function rotinaDasCotacoes(admin: Admin = createAdminClient()): Promise<{ lembretes: number; falhas: number; avisos: number }> {
  const hoje = hojeEmSaoPaulo()
  const amanha = diaSeguinte(hoje)
  let lembretes = 0
  let falhas = 0
  let avisos = 0

  // 1) Véspera do prazo: lembrete.
  const { data: vespera } = await admin.from('compras_pedidos')
    .select('id,workspace_id,entidade_id,ano,numero,titulo,cotacao_prazo').eq('cotacao_prazo', amanha).in('estado', ['aberto', 'em_cotacao']).limit(500)
  for (const p of vespera ?? []) {
    const { data: convites } = await admin.from('compras_convites')
      .select('id,email,token,caixa_id,favorecido_id,fin_favorecidos(nome)')
      .eq('pedido_id', p.id).is('respondido_em', null).is('recusado_em', null).is('cancelado_em', null).is('lembrete_em', null)
      .not('enviado_em', 'is', null).not('caixa_id', 'is', null)
    if (!convites?.length) continue
    const comprador = await compradorDe(admin, p.entidade_id)
    for (const c of convites as unknown as { id: string; email: string; token: string; caixa_id: string; fin_favorecidos: { nome: string } | null }[]) {
      const texto = textoDoLembrete({ comprador: comprador.nome, fornecedor: c.fin_favorecidos?.nome ?? 'fornecedor', codigo: numeroDoPedido(p.ano, p.numero), titulo: p.titulo, prazo: p.cotacao_prazo, link: linkDoConvite(c.token) })
      try {
        await enviarPelaCaixaAutomatica(p.workspace_id, c.caixa_id, { para: c.email, assunto: texto.assunto, corpo: texto.corpo })
        await admin.from('compras_convites').update({ lembrete_em: new Date().toISOString() }).eq('id', c.id)
        lembretes++
      } catch (causa) {
        falhas++
        console.error('[compras] lembrete não saiu:', causa instanceof Error ? causa.message : causa)
      }
    }
  }

  // 2) Prazo que acabou ontem (ou antes, se a rotina falhou): avisa quem pediu.
  const { data: vencidos } = await admin.from('compras_pedidos')
    .select('id,workspace_id,entidade_id,ano,numero,titulo,cotacao_prazo').lt('cotacao_prazo', hoje).is('cotacao_prazo_avisado_em', null).in('estado', ['aberto', 'em_cotacao']).limit(500)
  for (const p of vencidos ?? []) {
    const { data: convites } = await admin.from('compras_convites')
      .select('enviado_em,envio_erro,visto_em,respondido_em,recusado_em,motivo_recusa,cancelado_em,lembrete_em').eq('pedido_id', p.id)
    const resumo = resumoDosConvites((convites ?? []) as Convite[])
    await notificar(admin, {
      workspaceId: p.workspace_id, para: await quemAcompanha(admin, p), atorId: null, categoria: 'financeiro',
      link: `/financeiro/compras/${p.id}`, botao: 'Comparar as propostas',
      titulo: `Acabou o prazo das propostas (${numeroDoPedido(p.ano, p.numero)})`,
      mensagem: `“${p.titulo}”: ${resumo.total ? resumo.texto : 'nenhum fornecedor convidado'}. O prazo era ${dataCurta(p.cotacao_prazo)}.`.slice(0, 280),
    })
    await admin.from('compras_pedidos').update({ cotacao_prazo_avisado_em: new Date().toISOString() }).eq('id', p.id)
    avisos++
  }
  return { lembretes, falhas, avisos }
}
