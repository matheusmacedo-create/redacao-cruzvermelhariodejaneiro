import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { comentarNoChamado, criarChamado } from '@/lib/chamados/nucleo'
import { ENCERRADOS } from '@/lib/chamados/regras'
import { carregarChamado, filasQueAtendo, papeisNoChamado } from '@/lib/chamados/servidor'
import { enviarMensagemDireta } from '@/lib/mensagens/enviar'
import { visitaEsperandoResposta } from '@/lib/portaria/servidor'
import { enviarNoChat, gravarRespostaDaVisita, rodadaDoVoto, votar, type Pessoa } from '../acoes'
import { tituloDoRelato } from '../regras'
import { lerQuadroDePessoas, temHomonimo, type PessoaDoQuadro } from './leituras'
import { acoesDeHoje } from './uso'
import type { FonteDosPreparos } from './preparos'
import { registroDaConferenciaDoPlano, type Passo, type ResultadoDaAcao } from './regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O que o plano do assistente do WhatsApp lê e faz no banco:
 *  - fonteDoSupabase: a fonte dos preparos e da revalidação (preparos.ts), com as regras da tela refeitas para a
 *    pessoa — não há sessão no WhatsApp, o cliente é o de serviço;
 *  - executarPasso: cada passo confirmado, pelas MESMAS funções do bot e da tela, que o banco reconfere —
 *    whatsapp_votar_uma_vez (trava a rodada e a linha, recusa voto repetido e matéria mudada), whatsapp_mensagem_direta,
 *    portaria_responder_whatsapp, whatsapp_chat_enviar, lib/chamados/nucleo.ts —, devolvendo ResultadoDaAcao: o fluxo
 *    (fluxo.ts) para no primeiro `ok: false`.
 *
 * O canal é sempre o do WhatsApp (sessão simulada aal1: quem usa a verificação em duas etapas cai no banco). [etapa 4]
 * O canal da sessão (a página de confirmar no Palácio) entra aqui. Cada passo feito deixa a trilha no activity_log com
 * { canal: 'whatsapp', via: 'assistente', plano_id } (o voto, pela própria função de votar). Nunca lança.
 */

/** Por onde o passo sai. [etapa 4] `{ via: 'sessao', supabase, admin }`, pela página de confirmar no Palácio. */
export type CanalDoPasso = { via: 'whatsapp'; admin: Admin }

export type ContextoDaExecucao = { workspaceId: string; pessoa: Pessoa; planoId: string; base: string }

/** A fonte dos preparos e da revalidação, no banco. `quadro`: o quadro de pessoas já lido no turno (o mesmo das leituras). */
export function fonteDoSupabase(admin: Admin, workspaceId: string, pessoa: Pessoa, opcoes: { quadro?: () => Promise<Map<string, PessoaDoQuadro>> } = {}): FonteDosPreparos {
  let quadro: Promise<Map<string, PessoaDoQuadro>> | null = null
  const lerQuadro = () => (quadro ??= opcoes.quadro ? opcoes.quadro() : lerQuadroDePessoas(admin, workspaceId))
  return {
    async rodada(aprovacaoId) {
      const r = await rodadaDoVoto(admin, workspaceId, pessoa, aprovacaoId)
      if ('erro' in r) return { ok: false, codigo: r.codigo ?? 'erro', texto: r.erro ?? 'Não deu para conferir a rodada.' }
      return {
        ok: true, titulo: r.titulo, contentId: r.contentId, pedidaPor: r.pedidaPor, pedidaEm: r.pedidaEm,
        conferencia: r.blocos.map((b) => ({ setor: b.setor.nome, itens: [...b.itens] })),
      }
    },
    async hashDoConteudo(contentId) {
      const { data, error } = await admin.rpc('whatsapp_hash_do_conteudo', { p_content_id: contentId })
      return !error && typeof data === 'string' && /^[0-9a-f]{64}$/.test(data) ? data : null
    },
    async pessoa(id) {
      const q = await lerQuadro()
      const p = q.get(id)
      return p ? { nome: p.nome, username: p.username, setor: p.setor, homonimo: temHomonimo(q, id), ativa: p.ativo } : null
    },
    async chamado(id) {
      const c = await carregarChamado(admin, workspaceId, id)
      if (!c) return null
      const papeis = papeisNoChamado(c, pessoa.id, await filasQueAtendo(admin, workspaceId, pessoa.id, pessoa.papel))
      return { codigo: c.codigo, titulo: c.titulo, encerrado: ENCERRADOS.includes(c.status), temPapel: papeis.length > 0 }
    },
    async assunto(filaId, assuntoId) {
      const [{ data: fila }, { data: categoria }] = await Promise.all([
        admin.from('chamado_filas').select('nome, ativa').eq('workspace_id', workspaceId).eq('id', filaId).maybeSingle(),
        admin.from('chamado_categorias').select('nome, ativa, pede_local').eq('workspace_id', workspaceId).eq('fila_id', filaId).eq('id', assuntoId).maybeSingle(),
      ])
      if (!fila?.ativa || !categoria?.ativa) return null
      return { filaNome: String(fila.nome ?? ''), assuntoNome: String(categoria.nome ?? ''), pedeLocal: Boolean(categoria.pede_local) }
    },
    visitaEsperando: () => visitaEsperandoResposta(admin, workspaceId, pessoa.id),
    async avisosSemLer(ids) {
      if (ids !== 'todos' && !ids.length) return 0
      let q = admin.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', pessoa.id).eq('workspace_id', workspaceId).is('read_at', null)
      if (ids !== 'todos') q = q.in('id', ids)
      const { count } = await q
      return count ?? 0
    },
    mensagensDeHoje: async () => (await acoesDeHoje(admin, pessoa.id))?.mensagens ?? null,
    async canal(canalId) {
      const { data } = await admin.from('chat_canais').select('tipo, nome, arquivado').eq('workspace_id', workspaceId).eq('id', canalId).maybeSingle()
      if (!data || data.arquivado) return null
      return { nome: data.tipo === 'canal' ? String(data.nome ?? '') : '' }
    },
  }
}

/** O texto da falha sem o link do fim (o recibo põe os links que valem; o motivo fica limpo). */
const semLinkNoFim = (r: ResultadoDaAcao): ResultadoDaAcao => (r.ok ? r : { ...r, texto: r.texto.replace(/\s*https?:\/\/\S+\s*$/, '').trim() || 'não deu certo' })

/** A trilha do passo feito (o voto deixa a dele, em votar): quem, o quê, por onde e de qual plano. */
async function registrarPasso(admin: Admin, ctx: ContextoDaExecucao, acao: string, entidade: { tipo: string; id: string | null }) {
  const { error } = await admin.from('activity_log').insert({
    workspace_id: ctx.workspaceId, actor_id: ctx.pessoa.id, action: `whatsapp_assistente_${acao}`, entity_type: entidade.tipo, entity_id: entidade.id,
    metadata: { canal: 'whatsapp', via: 'assistente', plano_id: ctx.planoId },
  })
  if (error) console.error('[whatsapp] assistente: trilha do passo não gravada:', error.code)
}

/**
 * Um passo confirmado, pelo canal do WhatsApp. A revalidação (preparos.ts, revalidarPasso) já passou para TODOS os
 * passos; aqui as funções do banco conferem de novo, na mesma transação da escrita (o voto com o hash do conteúdo).
 */
export async function executarPasso(passo: Passo, canal: CanalDoPasso, ctx: ContextoDaExecucao): Promise<ResultadoDaAcao> {
  const { admin } = canal
  const { workspaceId, pessoa, base } = ctx
  try {
    if (passo.acao === 'votar') {
      const conferencia = passo.decisao === 'approved' ? registroDaConferenciaDoPlano(passo.conferencia) : undefined
      return semLinkNoFim(await votar(admin, workspaceId, pessoa, passo.aprovacaoId, passo.decisao, passo.nota, base, conferencia || undefined, {
        via: 'assistente', plano_id: ctx.planoId, hashConteudo: passo.hashConteudo,
      }))
    }
    if (passo.acao === 'mensagem_direta') {
      const r = await enviarMensagemDireta({ via: 'whatsapp', admin }, { workspaceId, autor: { id: pessoa.id, nome: pessoa.nome }, paraId: passo.paraId, corpo: passo.texto, origem: 'whatsapp' })
      if (r.ok) await registrarPasso(admin, ctx, 'mensagem', { tipo: 'mensagem_direta', id: passo.paraId })
      return semLinkNoFim(r)
    }
    if (passo.acao === 'comentar_chamado') {
      const c = await carregarChamado(admin, workspaceId, passo.chamadoId)
      const papeis = c ? papeisNoChamado(c, pessoa.id, await filasQueAtendo(admin, workspaceId, pessoa.id, pessoa.papel)) : []
      if (!c || !papeis.length) return { ok: false, codigo: 'sem_permissao', texto: 'Você não está mais nesse chamado.' }
      try {
        await comentarNoChamado(admin, { c, papeis, autor: { id: pessoa.id, nome: pessoa.nome }, texto: passo.texto })
      } catch (causa) {
        return { ok: false, codigo: 'erro', texto: causa instanceof Error ? causa.message : 'Não foi possível comentar no chamado.' }
      }
      await registrarPasso(admin, ctx, 'comentario', { tipo: 'chamado', id: c.id })
      return { ok: true, codigo: 'feito', texto: `Comentário no chamado *${c.codigo}*.`, link: `${base}/chamados/${c.id}` }
    }
    if (passo.acao === 'abrir_chamado') {
      const { data: vinculo } = await admin.from('workspace_members').select('coordination').eq('workspace_id', workspaceId).eq('user_id', pessoa.id).maybeSingle()
      try {
        const criado = await criarChamado(admin, {
          workspaceId, autor: { id: pessoa.id, nome: pessoa.nome, setor: (vinculo?.coordination as string | null) ?? null },
          filaId: passo.filaId, categoriaId: passo.categoriaId, titulo: tituloDoRelato(passo.relato), descricao: passo.relato, local: passo.local, urgencia: passo.urgencia,
        })
        await registrarPasso(admin, ctx, 'chamado', { tipo: 'chamado', id: criado.id })
        return { ok: true, codigo: 'feito', texto: `Chamado *${criado.codigo}* aberto.`, link: `${base}/chamados/${criado.id}` }
      } catch (causa) {
        return { ok: false, codigo: 'erro', texto: causa instanceof Error ? causa.message : 'Não foi possível abrir o chamado.' }
      }
    }
    if (passo.acao === 'responder_visita') {
      const r = await gravarRespostaDaVisita(admin, workspaceId, pessoa, passo.visitaId, passo.resposta, passo.recado, base)
      if (r.ok) await registrarPasso(admin, ctx, 'visita', { tipo: 'portaria_visita', id: passo.visitaId })
      return semLinkNoFim(r)
    }
    if (passo.acao === 'responder_chat') {
      const r = await enviarNoChat(admin, workspaceId, pessoa, passo.canalId, passo.fio, passo.texto, `${base}/chat/${passo.canalId}${passo.fio ? `?fio=${passo.fio}` : ''}`)
      if (r.ok) await registrarPasso(admin, ctx, 'chat', { tipo: 'chat_canal', id: passo.canalId })
      return semLinkNoFim(r)
    }
    // Marcar como lidos: só os avisos da própria pessoa (todos os sem ler, ou os do plano).
    let q = admin.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', pessoa.id).eq('workspace_id', workspaceId).is('read_at', null)
    if (passo.avisoIds !== 'todos') q = q.in('id', passo.avisoIds)
    const { error } = await q
    if (error) return { ok: false, codigo: 'erro', texto: 'Não foi possível marcar os avisos como lidos.' }
    await registrarPasso(admin, ctx, 'lidos', { tipo: 'notificacao', id: null })
    return { ok: true, codigo: 'feito', texto: 'Avisos marcados como lidos.', link: `${base}/notificacoes` }
  } catch (causa) {
    console.error('[whatsapp] assistente: passo não executado:', passo.acao, causa instanceof Error ? causa.name : '')
    return { ok: false, codigo: 'erro', texto: 'Erro inesperado.' }
  }
}
