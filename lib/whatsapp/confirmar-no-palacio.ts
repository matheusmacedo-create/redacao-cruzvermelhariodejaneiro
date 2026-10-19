import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { decidirAprovacao } from '@/app/actions/financeiro'
import { decidirPedido } from '@/app/actions/compras'
import { desativarUsuario } from '@/app/actions/usuarios'
import { conferenciaDoVoto, votarNaRodada } from '@/lib/aprovacoes/voto'
import { numeroDoPedido } from '@/lib/compras/regras'
import { dataCurta, reais } from '@/lib/financeiro/regras'
import { PAPEL, ehEquipeDaEscola, ehPapel, pode, type Papel } from '@/lib/permissoes'
import type { Confirmacao } from './confirmacoes'

/**
 * A tela de confirmar no Palácio (app/confirmar/[token]): o que vai ser feito,
 * lido AGORA (não o que o WhatsApp mostrou: a despesa pode ter sido decidida
 * por outra pessoa no meio-tempo), e a execução pela MESMA função da tela de
 * cada área — decidirAprovacao (Financeiro), decidirPedido (Compras),
 * votarNaRodada (Aprovações) e desativarUsuario (Usuários). Essas funções
 * leem a sessão de quem está logado e conferem tudo de novo, como na tela; o
 * banco confere mais uma vez.
 *
 * A leitura usa o cliente da sessão sempre que dá (o RLS mostra só o que a
 * pessoa enxerga); os nomes de quem pediu e do fornecedor, como nas telas,
 * vêm pelo serviço.
 */

type Admin = ReturnType<typeof createAdminClient>

/** Quem está confirmando: o contexto da sessão (requireWorkspace já conferido na página). */
export type QuemConfirma = { userId: string; workspaceId: string; papel: Papel; nome: string | null }

export type Descricao = {
  titulo: string
  linhas: { rotulo: string; valor: string }[]
  /** O que acontece depois de confirmar, numa frase. */
  efeito: string
  /** A conferência do setor, antes de aprovar um conteúdo (como na tela da aprovação). */
  conferencia?: { setor: string; itens: string[] }[]
  botao: string
  destrutivo?: boolean
  /** A tela do item, para fazer por lá. */
  link: string
}

const texto = (v: unknown) => (typeof v === 'string' ? v : '')

/** Onde fica, no Palácio, o que a confirmação faz (para o "faça pela tela" e o retorno pelo WhatsApp). */
export function linkDaConfirmacao(c: Pick<Confirmacao, 'acao' | 'alvoId'>): string {
  if (c.acao === 'decidir_despesa') return `/financeiro/${c.alvoId}`
  if (c.acao === 'decidir_compra') return `/financeiro/compras/${c.alvoId}`
  if (c.acao === 'votar_aprovacao') return `/aprovacoes/${c.alvoId}`
  return '/usuarios'
}

/** Ações que ficam fora do portão da equipe da Escola (Aprovações e Usuários): para ela, a confirmação não abre. */
export const foraDoAcessoDaEscola = (c: Pick<Confirmacao, 'acao'>, papel: Papel) =>
  ehEquipeDaEscola(papel) && (c.acao === 'votar_aprovacao' || c.acao === 'desativar_conta')

/** O que vai ser feito, ou por que não dá mais (já decidido, fora do acesso). */
export async function descrever(supabase: SupabaseClient, admin: Admin, c: Confirmacao, quem: QuemConfirma): Promise<Descricao | { erro: string; link: string }> {
  const link = linkDaConfirmacao(c)
  const d = c.dados
  const nomeDe = async (id: string | null | undefined) => {
    if (!id) return null
    const { data } = await admin.from('profiles').select('full_name').eq('id', id).maybeSingle()
    return (data?.full_name as string | null) ?? null
  }

  if (c.acao === 'decidir_despesa') {
    const { data: l } = await supabase.from('fin_lancamentos').select('id, descricao, valor, vencimento, aprovacao, criado_por, favorecido_id')
      .eq('id', c.alvoId).eq('workspace_id', quem.workspaceId).maybeSingle()
    if (!l) return { erro: 'Despesa não encontrada, ou fora do seu acesso ao Financeiro.', link }
    if (l.aprovacao !== 'pendente') return { erro: 'Esta despesa não está mais esperando aprovação.', link }
    if (l.criado_por === quem.userId) return { erro: 'Quem lançou a despesa não pode aprová-la. Peça a outra pessoa com acesso de aprovação.', link }
    const aprovar = d.aprovar === true
    const [{ data: fav }, quemLancou] = await Promise.all([
      l.favorecido_id ? admin.from('fin_favorecidos').select('nome').eq('id', l.favorecido_id).maybeSingle() : Promise.resolve({ data: null }),
      nomeDe(l.criado_por as string | null),
    ])
    return {
      titulo: aprovar ? 'Aprovar a despesa' : 'Recusar a despesa',
      linhas: [
        { rotulo: 'Despesa', valor: (l.descricao as string | null) ?? '—' },
        { rotulo: 'Valor', valor: reais(Number(l.valor ?? 0)) },
        ...(fav?.nome ? [{ rotulo: 'Favorecido', valor: fav.nome as string }] : []),
        ...(l.vencimento ? [{ rotulo: 'Vencimento', valor: dataCurta(l.vencimento as string) }] : []),
        ...(quemLancou ? [{ rotulo: 'Lançada por', valor: quemLancou }] : []),
        ...(!aprovar ? [{ rotulo: 'Motivo da recusa', valor: texto(d.motivo) }] : []),
      ],
      efeito: aprovar ? 'Depois de aprovada, a despesa pode ser paga. Quem lançou é avisado.' : 'Quem lançou recebe a recusa com o motivo.',
      botao: aprovar ? 'Confirmar a aprovação' : 'Confirmar a recusa', destrutivo: !aprovar, link,
    }
  }

  if (c.acao === 'decidir_compra') {
    const { data: p } = await supabase.from('compras_pedidos')
      .select('id, ano, numero, titulo, valor_aprovado, estado, solicitante_id, proposta_id, aprovado_fin_em, aprovado_dir_em')
      .eq('id', c.alvoId).eq('workspace_id', quem.workspaceId).maybeSingle()
    if (!p) return { erro: 'Pedido de compra não encontrado, ou fora do seu acesso.', link }
    if (p.estado !== 'em_aprovacao') return { erro: 'Este pedido não está mais em aprovação.', link }
    if (p.solicitante_id === quem.userId) return { erro: 'Quem pediu a compra não decide sobre ela.', link }
    const recusar = d.decisao === 'recusar'
    const diretoria = d.papel === 'diretoria'
    // A etapa já aprovada por outra pessoa no meio-tempo (o banco recusaria; aqui o link não se gasta à toa).
    if (!recusar && (diretoria ? p.aprovado_dir_em : p.aprovado_fin_em)) return { erro: diretoria ? 'A Diretoria já aprovou este pedido.' : 'O Financeiro já aprovou este pedido.', link }
    const { data: proposta } = p.proposta_id ? await admin.from('compras_propostas').select('favorecido_id').eq('id', p.proposta_id).maybeSingle() : { data: null }
    const [{ data: fav }, quemPediu] = await Promise.all([
      proposta?.favorecido_id ? admin.from('fin_favorecidos').select('nome').eq('id', proposta.favorecido_id).maybeSingle() : Promise.resolve({ data: null }),
      nomeDe(p.solicitante_id as string | null),
    ])
    return {
      titulo: recusar ? 'Recusar a compra' : diretoria ? 'Aprovar a compra pela Diretoria' : 'Aprovar a compra pelo Financeiro',
      linhas: [
        { rotulo: 'Pedido', valor: `${numeroDoPedido(Number(p.ano), Number(p.numero))} · ${(p.titulo as string | null) ?? ''}` },
        { rotulo: 'Valor', valor: reais(Number(p.valor_aprovado ?? 0)) },
        ...(fav?.nome ? [{ rotulo: 'Fornecedor', valor: fav.nome as string }] : []),
        ...(quemPediu ? [{ rotulo: 'Pedido por', valor: quemPediu }] : []),
        ...(texto(d.motivo) ? [{ rotulo: recusar ? 'Motivo da recusa' : 'Observação', valor: texto(d.motivo) }] : []),
      ],
      efeito: recusar ? 'O pedido é encerrado como recusado; quem pediu recebe o motivo.' : 'Quem pediu é avisado quando a compra estiver aprovada por todas as etapas.',
      botao: recusar ? 'Confirmar a recusa' : 'Confirmar a aprovação', destrutivo: recusar, link,
    }
  }

  if (c.acao === 'votar_aprovacao') {
    const [{ data: aprovacao }, { data: voto }] = await Promise.all([
      supabase.from('approvals').select('id, status, content_id').eq('id', c.alvoId).eq('workspace_id', quem.workspaceId).maybeSingle(),
      supabase.from('approval_voters').select('decision').eq('approval_id', c.alvoId).eq('user_id', quem.userId).maybeSingle(),
    ])
    if (!aprovacao) return { erro: 'Aprovação não encontrada.', link }
    if (aprovacao.status !== 'pending') return { erro: 'Esta rodada já foi encerrada.', link }
    if (!voto) return { erro: 'Você não está entre as pessoas convidadas para aprovar este conteúdo.', link }
    if (voto.decision !== 'pending') return { erro: 'Você já votou nesta rodada.', link }
    const { data: peca } = await supabase.from('content_pieces').select('title').eq('id', aprovacao.content_id).maybeSingle()
    const aprovar = d.decisao === 'approved'
    const blocos = aprovar ? await conferenciaDoVoto(supabase, quem.workspaceId, quem.userId, aprovacao.content_id as string) : []
    return {
      titulo: aprovar ? 'Aprovar o conteúdo' : 'Pedir ajustes',
      linhas: [
        { rotulo: 'Conteúdo', valor: (peca?.title as string | null)?.trim() || 'Conteúdo editorial' },
        ...(!aprovar ? [{ rotulo: 'O que precisa mudar', valor: texto(d.nota) }] : []),
      ],
      efeito: aprovar ? 'Marque a conferência do setor: é o que vai junto do voto, no histórico.' : 'Quem pediu a aprovação recebe o pedido de ajustes.',
      conferencia: blocos.map((b) => ({ setor: b.setor.nome, itens: b.itens })),
      botao: aprovar ? 'Confirmar o voto' : 'Confirmar o pedido de ajustes', link,
    }
  }

  // desativar_conta
  if (!pode(quem.papel, 'usuarios.gerenciar')) return { erro: 'Desativar contas é só de quem gerencia os usuários.', link }
  if (c.alvoId === quem.userId) return { erro: 'Você não pode desativar a sua própria conta.', link }
  const { data: membro } = await admin.from('workspace_members').select('role, profiles(full_name, username, active)')
    .eq('workspace_id', quem.workspaceId).eq('user_id', c.alvoId).maybeSingle()
  const perfil = (Array.isArray(membro?.profiles) ? membro?.profiles[0] : membro?.profiles) as { full_name?: string | null; username?: string | null; active?: boolean } | null | undefined
  if (!membro || !perfil) return { erro: 'Esta pessoa não está mais no espaço.', link }
  if (perfil.active === false) return { erro: `${perfil.full_name ?? 'Esta pessoa'} já estava desativado.`, link }
  return {
    titulo: 'Desativar o acesso',
    linhas: [
      { rotulo: 'Pessoa', valor: perfil.full_name ?? '—' },
      { rotulo: 'Usuário', valor: perfil.username ?? '—' },
      { rotulo: 'Papel', valor: ehPapel(membro.role) ? PAPEL[membro.role].rotulo : String(membro.role) },
    ],
    efeito: 'A pessoa perde o acesso na hora e sai de todas as sessões, e o WhatsApp dela é liberado. O histórico dela continua no sistema, e dá para reativar em Usuários e permissões.',
    botao: 'Confirmar a desativação', destrutivo: true, link,
  }
}

/** A conferência marcada antes de gastar o link: faltando item, o link continua valendo (a pessoa marca e confirma). */
export async function faltaNaConferencia(supabase: SupabaseClient, c: Confirmacao, quem: QuemConfirma, conferidos: string[]): Promise<string | null> {
  if (c.acao !== 'votar_aprovacao' || c.dados.decisao !== 'approved') return null
  const { data: aprovacao } = await supabase.from('approvals').select('content_id').eq('id', c.alvoId).eq('workspace_id', quem.workspaceId).maybeSingle()
  if (!aprovacao) return null
  const marcados = new Set(conferidos)
  const faltam = (await conferenciaDoVoto(supabase, quem.workspaceId, quem.userId, aprovacao.content_id as string)).flatMap((b) => b.itens).filter((i) => !marcados.has(i))
  return faltam.length ? `Confira antes de aprovar: ${faltam.join('; ')}.` : null
}

/** Executa pela função da tela. `ok` falso: a função recusou (a mensagem é a dela). */
export async function executar(supabase: SupabaseClient, c: Confirmacao, quem: QuemConfirma, conferidos: string[]): Promise<{ ok: boolean; mensagem: string }> {
  const d = c.dados
  if (c.acao === 'decidir_despesa') {
    const aprovar = d.aprovar === true
    const r = await decidirAprovacao(c.alvoId, aprovar, aprovar ? '' : texto(d.motivo))
    return r.erro ? { ok: false, mensagem: r.erro } : { ok: true, mensagem: aprovar ? 'Despesa aprovada.' : 'Despesa recusada; quem lançou recebe o motivo.' }
  }
  if (c.acao === 'decidir_compra') {
    const decisao = d.decisao === 'recusar' ? 'recusar' : 'aprovar'
    const papel = d.papel === 'diretoria' ? 'diretoria' : 'financeiro'
    const r = await decidirPedido(c.alvoId, decisao, texto(d.motivo), papel)
    if (r.erro) return { ok: false, mensagem: r.erro }
    if (decisao === 'recusar') return { ok: true, mensagem: 'Compra recusada; quem pediu recebe o motivo.' }
    return {
      ok: true,
      mensagem: r.estado === 'aprovado' ? 'Compra aprovada.' : `Aprovação ${papel === 'diretoria' ? 'da Diretoria' : 'do Financeiro'} registrada; a compra ainda espera ${papel === 'diretoria' ? 'o Financeiro' : 'a Diretoria'}.`,
    }
  }
  if (c.acao === 'votar_aprovacao') {
    const aprovar = d.decisao === 'approved'
    try {
      await votarNaRodada({
        supabase, workspaceId: quem.workspaceId, userId: quem.userId, nome: quem.nome, approvalId: c.alvoId, decisao: aprovar ? 'approved' : 'changes_requested',
        nota: aprovar ? '' : texto(d.nota), conferidos, rodape: 'Voto pedido pelo WhatsApp e confirmado no Palácio.',
      })
    } catch (causa) {
      return { ok: false, mensagem: causa instanceof Error ? causa.message.slice(0, 400) : 'Não foi possível registrar o voto.' }
    }
    revalidatePath('/aprovacoes')
    revalidatePath(`/aprovacoes/${c.alvoId}`)
    return { ok: true, mensagem: aprovar ? 'Voto registrado: aprovado.' : 'Pedido de ajustes registrado; quem pediu a aprovação foi avisado.' }
  }
  const formulario = new FormData()
  formulario.set('userId', c.alvoId)
  const r = await desativarUsuario(formulario)
  return r.erro ? { ok: false, mensagem: r.erro } : { ok: true, mensagem: r.recado ?? 'Acesso desativado.' }
}
