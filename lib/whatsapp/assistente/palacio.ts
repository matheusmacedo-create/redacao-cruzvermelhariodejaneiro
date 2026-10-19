import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import { pessoaDoEspaco } from '../consultas'
import { executar as executarPelaTela, type QuemConfirma } from '../confirmar-no-palacio'
import type { Confirmacao } from '../confirmacoes'
import type { Pessoa } from '../acoes'
import { executarPasso, fonteDoSupabase } from './executores'
import { decisaoDaPessoa } from './leituras'
import { fluxoDoPlano, repoSupabase } from './plano'
import { revalidarPasso } from './preparos'
import { acoesDeHoje, lerConfig } from './uso'
import type { DesfechoDaConfirmacao, PlanoGuardado } from './fluxo'
import {
  LIMITES, TEXTOS_FIXOS, blocosDaTela, conferenciaDoPlano, hashDoPlano, linhasDoPlano, modoCobre, textoDoPlanoQueNaoVale,
  type BlocoDaTela, type Passo, type ResultadoDaAcao,
} from './regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O plano do assistente confirmado no Palácio (app/confirmar/[token], ramo "plano"). O plano inteiro vem para cá
 * quando algum passo é sensível: o voto, a mensagem, o comentário, o atendimento ou o registro de visita de quem usa
 * a verificação em duas etapas, e a decisão de despesa ou compra de qualquer pessoa. O WhatsApp não pede o código do
 * app autenticador; aqui, a sessão é a das telas (requireWorkspace já pediu o código a quem usa).
 *
 *  - descreverPlano: o que a página mostra — os MESMOS passos do texto do WhatsApp (linhasDoPlano, em blocos), lidos
 *    do plano guardado pelo serviço (whatsapp_ia_planos é só do servidor), conferindo que é desta pessoa, deste
 *    espaço, que ainda espera o Palácio e que o hash confere; e a conferência do setor a marcar (votos "aprovado");
 *  - executarPlanoNoPalacio: o "Confirmar". Confere a conferência antes de tudo (faltando item, nada muda), e então o
 *    fluxo COMEÇA pela transição atômica no_palacio → executando (dois cliques ou duas abas não executam duas vezes),
 *    confere a pessoa, o papel, a escrita do assistente e as cotas do dia, revalida TODOS os passos e executa pela
 *    sessão (executores.ts, canal "sessao"); a decisão do Financeiro, pela MESMA função da tela
 *    (confirmar-no-palacio.ts: decidirAprovacao e decidirPedido). Redige na hora e devolve o recibo.
 *
 * Nunca lança: o erro vira o texto da tela.
 */

export type DescricaoDoPlano = {
  titulo: string
  blocos: BlocoDaTela[]
  conferencia: { setor: string; itens: string[] }[]
  efeito: string
  botao: string
}

/** O plano do link, se é desta pessoa e deste espaço (a leitura é pelo serviço: só o servidor lê os planos). */
async function planoDoLink(admin: Admin, c: Confirmacao, quem: QuemConfirma): Promise<PlanoGuardado | null> {
  if (c.acao !== 'plano') return null
  const plano = await repoSupabase(admin).buscar(c.alvoId).catch(() => null)
  return plano && plano.userId === quem.userId && plano.workspaceId === quem.workspaceId ? plano : null
}

const confere = (p: PlanoGuardado) => Boolean(p.hash) && hashDoPlano({ userId: p.userId, workspaceId: p.workspaceId, passos: p.passos }) === p.hash

/** O que a página mostra, ou por que o plano não vale mais. */
export async function descreverPlano(admin: Admin, c: Confirmacao, quem: QuemConfirma): Promise<DescricaoDoPlano | { erro: string }> {
  try {
    const plano = await planoDoLink(admin, c, quem)
    if (!plano) return { erro: 'Este link não vale para a sua conta.' }
    if (plano.situacao !== 'no_palacio') return { erro: textoDoPlanoQueNaoVale(plano.situacao) }
    if (Date.parse(plano.expiraEm) <= Date.now()) return { erro: textoDoPlanoQueNaoVale('vencido') }
    if (!confere(plano)) return { erro: 'Este plano não confere. Peça de novo pelo WhatsApp do Palácio.' }
    const varios = plano.passos.length > 1
    return {
      titulo: varios ? 'Confirmar o plano' : 'Confirmar o pedido',
      blocos: blocosDaTela(linhasDoPlano(plano.passos)),
      conferencia: conferenciaDoPlano(plano.passos),
      efeito: varios
        ? 'Os passos são feitos em ordem, com a sua sessão; se um falhar, os seguintes não são feitos. O recibo aparece aqui e vai para o seu WhatsApp.'
        : 'É feito com a sua sessão, como na tela. O recibo aparece aqui e vai para o seu WhatsApp.',
      botao: varios ? 'Confirmar e fazer tudo' : 'Confirmar e fazer',
    }
  } catch (causa) {
    console.error('[whatsapp] assistente: plano no Palácio não descrito:', causa instanceof Error ? causa.message : causa)
    return { erro: 'Não deu para ler o plano agora. Tente de novo em instantes.' }
  }
}

/**
 * Na confirmação pelo Palácio, de novo antes de qualquer escrita: a pessoa ativa e com o mesmo papel, a escrita do
 * assistente ainda ligada para ela e as cotas do dia (planos executados e mensagens diretas). O número e a
 * verificação em duas etapas, aqui, são a própria sessão. null = confere; senão, o motivo (minúsculo).
 */
async function conferirNaSessao(admin: Admin, pessoa: Pessoa, workspaceId: string, linha: PlanoGuardado): Promise<string | null> {
  const [atual, config, hoje] = await Promise.all([pessoaDoEspaco(admin, workspaceId, pessoa.id), lerConfig(admin, workspaceId), acoesDeHoje(admin, pessoa.id)])
  if (!atual || atual.papel !== linha.papel) return TEXTOS_FIXOS.conta_mudou
  if (!config?.escrita || !modoCobre(config, atual)) return 'pedir ações pelo assistente foi desligado'
  if (hoje && hoje.planos >= LIMITES.planosDia) return TEXTOS_FIXOS.limite_de_planos
  const mensagensDoPlano = linha.passos.filter((x) => x.acao === 'mensagem_direta').length
  if (mensagensDoPlano && (hoje?.mensagens ?? 0) + mensagensDoPlano > config.mensagens_dia) return TEXTOS_FIXOS.limite_de_mensagens
  return null
}

/** A decisão de despesa ou compra pela MESMA função da tela (a do link do comando "financeiro"), com a sessão de quem confirma. */
async function decidirPelaTela(supabase: SupabaseClient, passo: Extract<Passo, { acao: 'decidir_financeiro' }>, quem: QuemConfirma, base: string): Promise<ResultadoDaAcao> {
  const c: Confirmacao = {
    id: '', workspaceId: quem.workspaceId, userId: quem.userId, alvoId: passo.itemId, criadoEm: '', expiraEm: '', usadoEm: null, resultado: null,
    ...(passo.tipo === 'despesa'
      ? { acao: 'decidir_despesa' as const, dados: { aprovar: passo.decisao === 'aprovar', motivo: passo.decisao === 'recusar' ? passo.motivo : '' } }
      : { acao: 'decidir_compra' as const, dados: { decisao: passo.decisao, motivo: passo.motivo, papel: passo.papel ?? 'financeiro' } }),
  }
  const r = await executarPelaTela(supabase, c, quem, [])
  const link = `${base}${passo.tipo === 'despesa' ? `/financeiro/${passo.itemId}` : `/financeiro/compras/${passo.itemId}`}`
  return r.ok ? { ok: true, codigo: 'feito', texto: r.mensagem, link } : { ok: false, codigo: 'erro', texto: r.mensagem }
}

export type ResultadoNoPalacio = { erro: string; conferencia?: true } | { desfecho: DesfechoDaConfirmacao }

/**
 * O "Confirmar" na página. `conferidos`: os itens da conferência do setor que a pessoa marcou (o voto "aprovado"
 * exige todos, como na tela da aprovação). `{ erro }` antes de mudar qualquer coisa (o link continua valendo);
 * `{ desfecho }` depois da transição — o recibo, o "Nada foi feito" ou o plano que já não esperava o Palácio.
 */
export async function executarPlanoNoPalacio(p: { supabase: SupabaseClient; admin: Admin; c: Confirmacao; quem: QuemConfirma; conferidos: string[] }): Promise<ResultadoNoPalacio> {
  const { supabase, admin, c, quem } = p
  try {
    const plano = await planoDoLink(admin, c, quem)
    if (!plano) return { erro: 'Este link não vale para a sua conta.' }
    const marcados = new Set(p.conferidos)
    const faltam = conferenciaDoPlano(plano.passos).flatMap((b) => b.itens).filter((i) => !marcados.has(i))
    if (faltam.length) return { erro: `Confira antes de aprovar: ${faltam.join('; ')}.`, conferencia: true }

    const base = urlBase()
    const pessoa: Pessoa = { id: quem.userId, nome: quem.nome, papel: quem.papel }
    const fonte = fonteDoSupabase(admin, quem.workspaceId, pessoa, { decisao: (tipo, id) => decisaoDaPessoa(admin, quem.workspaceId, pessoa, tipo, id) })
    const ctx = { workspaceId: quem.workspaceId, pessoa, planoId: plano.id, base }
    const desfecho = await fluxoDoPlano(admin).executarNoPalacio({
      planoId: plano.id, pessoaId: quem.userId, workspaceId: quem.workspaceId, urlBase: base,
      conferirIdentidade: (linha) => conferirNaSessao(admin, pessoa, quem.workspaceId, linha),
      revalidar: (passo) => revalidarPasso(passo, fonte, quem.userId),
      executar: (passo) => (passo.acao === 'decidir_financeiro' ? decidirPelaTela(supabase, passo, quem, base) : executarPasso(passo, { via: 'sessao', supabase, admin }, ctx)),
    })
    return { desfecho }
  } catch (causa) {
    console.error('[whatsapp] assistente: plano no Palácio não executado:', causa instanceof Error ? causa.name : '')
    return { erro: 'Não foi possível confirmar agora. Tente de novo em instantes.' }
  }
}
