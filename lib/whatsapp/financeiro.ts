import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { numeroDoPedido } from '@/lib/compras/regras'
import { pessoasDaDiretoria } from '@/lib/compras/servidor'
import { nivelDoNome } from '@/lib/financeiro/regras'
import { ehEquipeDaEscola } from '@/lib/permissoes'
import { criarConfirmacao } from './confirmacoes'
import {
  DECISOES_NA_RESPOSTA, MOTIVO_MINIMO, lerDecisaoFinanceira, lerEscolha, oQueDaDecisao, textoDasDecisoes, textoDoLinkDeConfirmacao, type ItemParaDecidir,
} from './regras'
import { INDISPONIVEL, type Pendencia, type Pessoa, type Resposta } from './acoes'

/**
 * As decisões do Financeiro e de Compras pelo WhatsApp do Palácio: quem
 * decide pede "financeiro" e vê a lista curta, numerada, do que espera a
 * decisão dele (valor, descrição e fornecedor, quem pediu); "aprovar 2" ou
 * "recusar 2: motivo" viram o link de confirmar no Palácio
 * (lib/whatsapp/confirmacoes.ts). Nada se decide por aqui: a decisão é da
 * MESMA função da tela (decidirAprovacao, em app/actions/financeiro.ts, e
 * decidirPedido, em app/actions/compras.ts), com a sessão e a verificação de
 * sempre. Pagar, conciliar e fechar o mês continuam só na tela.
 *
 * Quem decide é quem a tela deixa:
 *  - despesa esperando aprovação: nível "aprovar" ou "gestão" no Financeiro
 *    da empresa do lançamento, e nunca quem lançou (financeiro_decidir);
 *  - compra em aprovação: na vez do Financeiro, o mesmo nível na empresa do
 *    pedido; na da Diretoria (acima do limite), quem é da Diretoria. Quem
 *    pediu não decide, e a mesma pessoa não aprova pelas duas
 *    (compras_decidir, e a tela do pedido, minhaVez).
 * O nível é lido como o banco lê (private.nivel_fin), sem sessão: admin tem
 * tudo; a equipe da Escola, só o acesso dado aos livros da Escola; os outros,
 * o de todas as empresas ou o daquela. O banco confere tudo de novo ao
 * confirmar.
 *
 * A lista fica em whatsapp_pendencias (tipo "financeiro", da migração
 * 20261018223000) só para o número apontar o item certo. Antes dela, a lista
 * sai com o link de cada item. Vale também para quem usa a verificação em
 * duas etapas: daqui só sai o link, e a confirmação pede o código.
 */

type Admin = ReturnType<typeof createAdminClient>

/** O item da lista guardada na pergunta: só o que acha o lançamento ou o pedido (e a vez, na compra). */
type ItemNaPergunta = { tipo: 'despesa' | 'compra'; id: string; papel: 'financeiro' | 'diretoria' | null }

export type ItemComId = ItemParaDecidir & { id: string }

const um = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

/** O nível da pessoa no Financeiro de cada empresa, como private.nivel_fin, sem sessão. */
async function niveisNoFinanceiro(admin: Admin, workspaceId: string, pessoa: Pessoa): Promise<(entidadeId: string) => number> {
  if (pessoa.papel === 'admin') return () => 4
  const [{ data: acessos }, { data: empresas }] = await Promise.all([
    admin.from('fin_acesso').select('nivel, entidade_id').eq('workspace_id', workspaceId).eq('user_id', pessoa.id),
    admin.from('fin_entidades').select('id, tipo').eq('workspace_id', workspaceId),
  ])
  const tipoDe = new Map((empresas ?? []).map((e) => [e.id as string, e.tipo as string]))
  const lista = (acessos ?? []).map((a) => ({ nivel: nivelDoNome(a.nivel as string), entidadeId: (a.entidade_id as string | null) ?? null }))
  const escola = ehEquipeDaEscola(pessoa.papel)
  return (entidadeId) => Math.max(0, ...lista
    .filter((a) => (escola ? a.entidadeId === entidadeId && tipoDe.get(entidadeId) === 'escola' : a.entidadeId === null || a.entidadeId === entidadeId))
    .map((a) => a.nivel))
}

/** É da Diretoria nas compras (private.compras_eh_diretoria: o setor configurado ou o "Diretoria"; sem ninguém nele, os administradores)? */
async function ehDaDiretoria(admin: Admin, workspaceId: string, pessoa: Pessoa): Promise<boolean> {
  if (ehEquipeDaEscola(pessoa.papel)) return false
  const { data: config } = await admin.from('compras_config').select('diretoria_setor_id').eq('workspace_id', workspaceId).maybeSingle()
  const diretoria = await pessoasDaDiretoria(admin, workspaceId, (config?.diretoria_setor_id as string | null) ?? null)
  return diretoria.includes(pessoa.id)
}

/** Decide alguma coisa no Financeiro ou em Compras (o "financeiro" no menu e o comando)? Na dúvida, não. */
export async function podeDecidirNoFinanceiro(admin: Admin, workspaceId: string, pessoa: Pessoa): Promise<boolean> {
  try {
    if (pessoa.papel === 'admin') return true
    const { data: acesso } = await admin.from('fin_acesso').select('user_id').eq('workspace_id', workspaceId).eq('user_id', pessoa.id)
      .in('nivel', ['aprovar', 'gestao']).limit(1).maybeSingle()
    return Boolean(acesso) || await ehDaDiretoria(admin, workspaceId, pessoa)
  } catch {
    return false
  }
}

/**
 * O que espera a decisão da pessoa: as despesas (da que vence antes) e depois as compras (da que foi para
 * aprovação antes). null quando não deu para ler. Também é o que o assistente lê (consultar_area financeiro) e
 * reconfere (preparar_decisao_financeira) — a decisão em si é sempre no Palácio.
 */
export async function decisoesDaPessoa(admin: Admin, workspaceId: string, pessoa: Pessoa): Promise<ItemComId[] | null> {
  try {
    const [nivel, diretoria, { data: despesas, error: e1 }, { data: pedidos, error: e2 }] = await Promise.all([
      niveisNoFinanceiro(admin, workspaceId, pessoa),
      ehDaDiretoria(admin, workspaceId, pessoa),
      admin.from('fin_lancamentos').select('id, entidade_id, descricao, valor, favorecido_id, criado_por')
        .eq('workspace_id', workspaceId).eq('tipo', 'despesa').eq('aprovacao', 'pendente').order('vencimento').limit(200),
      admin.from('compras_pedidos')
        .select('id, entidade_id, ano, numero, titulo, valor_aprovado, solicitante_id, proposta_id, exige_diretoria, aprovado_fin_em, aprovado_fin_por, aprovado_dir_em, aprovado_dir_por')
        .eq('workspace_id', workspaceId).eq('estado', 'em_aprovacao').order('enviado_aprovacao_em').limit(200),
    ])
    if (e1 || e2) return null
    const eu = pessoa.id
    const minhasDespesas = (despesas ?? []).filter((d) => d.criado_por !== eu && nivel(d.entidade_id as string) >= 3)
    // A vez da pessoa no pedido, como a tela (minhaVez): o Financeiro primeiro; a Diretoria, se o pedido passa por ela.
    const minhasCompras = (pedidos ?? []).flatMap((p) => {
      if (p.solicitante_id === eu) return []
      const peloFinanceiro = !p.aprovado_fin_em && p.aprovado_dir_por !== eu && nivel(p.entidade_id as string) >= 3
      const pelaDiretoria = Boolean(p.exige_diretoria) && !p.aprovado_dir_em && p.aprovado_fin_por !== eu && diretoria
      const papel = peloFinanceiro ? 'financeiro' as const : pelaDiretoria ? 'diretoria' as const : null
      return papel ? [{ ...p, papel }] : []
    })

    const propostas = minhasCompras.map((p) => p.proposta_id as string | null).filter((x): x is string => Boolean(x))
    const { data: dasPropostas } = propostas.length ? await admin.from('compras_propostas').select('id, favorecido_id').in('id', propostas) : { data: [] }
    const fornecedorDaProposta = new Map((dasPropostas ?? []).map((x) => [x.id as string, x.favorecido_id as string]))
    const favorecidos = [...new Set([
      ...minhasDespesas.map((d) => d.favorecido_id as string | null),
      ...[...fornecedorDaProposta.values()],
    ].filter((x): x is string => Boolean(x)))]
    const pessoas = [...new Set([...minhasDespesas.map((d) => d.criado_por), ...minhasCompras.map((p) => p.solicitante_id)].filter((x): x is string => Boolean(x)))]
    const [{ data: favs }, { data: perfis }] = await Promise.all([
      favorecidos.length ? admin.from('fin_favorecidos').select('id, nome').in('id', favorecidos) : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
      pessoas.length ? admin.from('profiles').select('id, full_name').in('id', pessoas) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    ])
    const nomeDoFavorecido = new Map((favs ?? []).map((f) => [f.id as string, f.nome as string]))
    const nomeDe = new Map((perfis ?? []).map((x) => [x.id as string, (x.full_name as string | null) ?? '']))

    return [
      ...minhasDespesas.map((d): ItemComId => ({
        tipo: 'despesa', id: d.id as string, titulo: (d.descricao as string | null)?.trim() || 'Despesa sem descrição', valor: Number(d.valor ?? 0),
        fornecedor: nomeDoFavorecido.get(d.favorecido_id as string) ?? null, quem: nomeDe.get(d.criado_por as string) || null, link: `/financeiro/${d.id}`,
      })),
      ...minhasCompras.map((p): ItemComId => ({
        tipo: 'compra', id: p.id as string, titulo: (p.titulo as string | null)?.trim() || 'Pedido de compra', valor: Number(p.valor_aprovado ?? 0),
        fornecedor: nomeDoFavorecido.get(fornecedorDaProposta.get(p.proposta_id as string) ?? '') ?? null, quem: nomeDe.get(p.solicitante_id as string) || null,
        codigo: numeroDoPedido(Number(p.ano), Number(p.numero)), papel: p.papel, link: `/financeiro/compras/${p.id}`,
      })),
    ]
  } catch (causa) {
    console.error('[whatsapp] decisões do Financeiro não lidas:', causa instanceof Error ? causa.message : causa)
    return null
  }
}

/** O "financeiro": a lista, guardada como pergunta para o "aprovar 2" achar o item. */
export async function listarDecisoes(admin: Admin, workspaceId: string, pessoa: Pessoa, base: string): Promise<Resposta> {
  const itens = await decisoesDaPessoa(admin, workspaceId, pessoa)
  if (!itens) return { texto: `Não consegui ler o que espera a sua decisão agora. Veja em ${base}/financeiro` }
  if (!itens.length) return { texto: textoDasDecisoes({ itens: [], total: 0, urlBase: base }) }
  const mostrados = itens.slice(0, DECISOES_NA_RESPOSTA)
  const naPergunta: ItemNaPergunta[] = mostrados.map((i) => ({ tipo: i.tipo, id: i.id, papel: i.papel ?? null }))
  return {
    texto: textoDasDecisoes({ itens: mostrados, total: itens.length, urlBase: base }),
    pergunta: { tipo: 'financeiro', dados: { itens: naPergunta } },
    semPergunta: textoDasDecisoes({ itens: mostrados, total: itens.length, urlBase: base, comLinks: true }),
  }
}

function itensDaPergunta(p: Pendencia | null): ItemNaPergunta[] {
  const lista = Array.isArray(p?.dados.itens) ? p.dados.itens as unknown[] : []
  return lista.flatMap((x) => {
    const i = x && typeof x === 'object' ? x as Record<string, unknown> : null
    if (!i || (i.tipo !== 'despesa' && i.tipo !== 'compra') || typeof i.id !== 'string') return []
    return [{ tipo: i.tipo, id: i.id, papel: i.papel === 'financeiro' || i.papel === 'diretoria' ? i.papel : null }]
  })
}

/**
 * "aprovar 2" / "recusar 2: motivo" sobre a lista aberta (`lista`: a pergunta "financeiro" citada ou a mais nova).
 * O item é relido agora — outra pessoa pode ter decidido, ou a vez pode ter mudado — e vira o link de confirmar.
 */
export async function decidirPeloWhatsapp(admin: Admin, workspaceId: string, pessoa: Pessoa, lista: Pendencia | null, texto: string, base: string): Promise<Resposta> {
  const d = lerDecisaoFinanceira(texto)
  if (!d) return { texto: 'Para decidir, responda *aprovar* e o número, ou *recusar*, o número e o motivo (ex.: _recusar 2: valor acima do orçado_).' }
  const itens = itensDaPergunta(lista)
  if (!itens.length) return { texto: 'Mande *financeiro* para ver o que espera a sua decisão; depois, *aprovar* e o número, ou *recusar*, o número e o motivo.' }
  if (d.n > itens.length) return { texto: `A lista tem ${itens.length === 1 ? '1 item' : `${itens.length} itens`}: responda com um número de 1 a ${itens.length}. Para ver de novo, mande *financeiro*.` }
  if (d.decisao === 'recusar' && d.motivo.length < MOTIVO_MINIMO) {
    return { texto: `Diga o motivo: *recusar ${d.n}:* e o motivo (ao menos ${MOTIVO_MINIMO} letras). Quem pediu recebe o motivo.` }
  }
  const alvo = itens[d.n - 1]
  const agora = await decisoesDaPessoa(admin, workspaceId, pessoa)
  if (!agora) return { texto: `Não consegui conferir o item agora. Decida pelo Palácio: ${base}/financeiro` }
  const item = agora.find((i) => i.tipo === alvo.tipo && i.id === alvo.id)
  if (!item) return { texto: `O item ${d.n} não espera mais a sua decisão: já foi decidido, ou mudou. Mande *financeiro* para ver a lista de agora.` }
  const link = await criarConfirmacao(admin, {
    workspaceId, userId: pessoa.id, alvoId: item.id,
    ...(item.tipo === 'despesa'
      ? { acao: 'decidir_despesa' as const, dados: { aprovar: d.decisao === 'aprovar', motivo: d.decisao === 'recusar' ? d.motivo : '' } }
      : { acao: 'decidir_compra' as const, dados: { decisao: d.decisao, motivo: d.motivo, papel: item.papel ?? 'financeiro' } }),
  })
  if ('erro' in link) {
    return { texto: link.erro === 'limite' ? `Muitos links pedidos na última hora. Decida pelo Palácio: ${base}${item.link}` : `${INDISPONIVEL}: ${base}${item.link}` }
  }
  return { texto: textoDoLinkDeConfirmacao({ oQue: oQueDaDecisao(item, d), url: link.url }) }
}

/** A resposta à lista aberta (citando-a, ou a pergunta mais nova): a decisão, ou como decidir. Sem citar, o que não serve segue adiante (null). */
export async function seguirDecisoes(admin: Admin, workspaceId: string, pessoa: Pessoa, p: Pendencia, texto: string, base: string, estrita: boolean): Promise<Resposta | null> {
  if (lerDecisaoFinanceira(texto)) return decidirPeloWhatsapp(admin, workspaceId, pessoa, p, texto, base)
  // O número sozinho não decide nada (nem vira o "2" dos avisos lidos): ensina o comando com ele.
  const n = lerEscolha(texto, itensDaPergunta(p).length)
  if (n) return { texto: `Para o item ${n}, responda *aprovar ${n}* ou *recusar ${n}:* e o motivo.` }
  return estrita ? { texto: 'Para decidir, responda *aprovar* e o número, ou *recusar*, o número e o motivo. Para ver a lista de novo, mande *financeiro*.' } : null
}
