import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { avisarQuemPediu } from '@/lib/aprovacoes/avisos'
import { comentarNoChamado, criarChamado, mudarStatusNoChamado, transferirNoChamado } from '@/lib/chamados/nucleo'
import { ENCERRADOS } from '@/lib/chamados/regras'
import { carregarChamado, filasQueAtendo, papeisNoChamado } from '@/lib/chamados/servidor'
import { enviarMensagemDireta } from '@/lib/mensagens/enviar'
import { ehEquipeDaEscola } from '@/lib/permissoes'
import { visitaEsperandoResposta } from '@/lib/portaria/servidor'
import { CODIGO_DO_VOTO, enviarNoChat, gravarRespostaDaVisita, rodadaDoVoto, votar, type Pessoa } from '../acoes'
import { assumirChamado } from '../atendimento'
import { gravarEntrada } from '../portaria'
import { documentoEsperando, guardarDocumento, ondeGuarda } from '../drive'
import { tituloDoRelato } from '../regras'
import { lerQuadroDePessoas, type PessoaDoQuadro } from './leituras'
import { acoesDeHoje } from './uso'
import type { FonteDosPreparos } from './preparos'
import { registroDaConferenciaDoPlano, temHomonimo, type Passo, type ResultadoDaAcao } from './regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O que o plano do assistente do WhatsApp lê e faz no banco:
 *  - fonteDoSupabase: a fonte dos preparos e da revalidação (preparos.ts), com as regras da tela refeitas para a
 *    pessoa — não há sessão no WhatsApp, o cliente é o de serviço;
 *  - executarPasso: cada passo confirmado, pelas MESMAS funções do bot e da tela, que o banco reconfere —
 *    whatsapp_votar_uma_vez (trava a rodada e a linha, recusa voto repetido e matéria mudada), whatsapp_mensagem_direta,
 *    portaria_responder_whatsapp, whatsapp_chat_enviar, lib/chamados/nucleo.ts, e o guardar no Drive de
 *    lib/whatsapp/drive.ts —, devolvendo ResultadoDaAcao: o fluxo (fluxo.ts) para no primeiro `ok: false`.
 *
 * Dois canais:
 *  - `whatsapp`: o "confirmo" no WhatsApp (sessão simulada aal1: quem usa a verificação em duas etapas cai no banco);
 *  - `sessao`: o "Confirmar" na página do Palácio (app/confirmar/[token], lib/whatsapp/assistente/palacio.ts), com a
 *    sessão e o nível das telas: o voto por votar_conferido (o hash vale aqui também), a mensagem, o Chat e a portaria
 *    pela sessão (enviarMensagemDireta, chat_enviar, portaria_registrar_entrada), o chamado pelas funções da tela
 *    (que, como a tela, escrevem com o serviço depois de conferir o papel de quem está logado).
 * A decisão do Financeiro nunca sai daqui: pelo WhatsApp é recusada; no Palácio, palacio.ts a faz pela função da tela.
 * Cada passo feito deixa a trilha no activity_log com { canal, via: 'assistente', plano_id } (o voto, pela própria
 * função de votar). Nunca lança.
 */

/** Por onde o passo sai: o WhatsApp do Palácio, ou a sessão da página de confirmar no Palácio. */
export type CanalDoPasso = { via: 'whatsapp'; admin: Admin } | { via: 'sessao'; supabase: SupabaseClient; admin: Admin }

export type ContextoDaExecucao = { workspaceId: string; pessoa: Pessoa; planoId: string; base: string }

/**
 * A fonte dos preparos e da revalidação, no banco. `quadro`: o quadro de pessoas já lido no turno (o mesmo das
 * leituras). `decisao`: a leitura do que espera a decisão da pessoa no Financeiro (leituras.ts, decisaoDaPessoa) —
 * injetada, para este módulo não puxar o Financeiro; sem ela, nada espera.
 */
export function fonteDoSupabase(admin: Admin, workspaceId: string, pessoa: Pessoa, opcoes: {
  quadro?: () => Promise<Map<string, PessoaDoQuadro>>
  decisao?: FonteDosPreparos['decisao']
} = {}): FonteDosPreparos {
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
    async chamadoParaAtender(id) {
      const c = await carregarChamado(admin, workspaceId, id)
      if (!c) return null
      const papeis = ehEquipeDaEscola(pessoa.papel) ? [] : papeisNoChamado(c, pessoa.id, await filasQueAtendo(admin, workspaceId, pessoa.id, pessoa.papel))
      if (!papeis.length) return null
      return { codigo: c.codigo, titulo: c.titulo, status: c.status, equipe: papeis.includes('equipe'), responsavelId: c.responsavel_id ?? null, filaId: c.fila_id }
    },
    // A portaria é de quem a tela e o banco dizem (private.pode_portaria): membro do Palácio, menos a equipe da Escola.
    temPortaria: async () => !ehEquipeDaEscola(pessoa.papel),
    decisao: opcoes.decisao ?? (async () => null),
    // O documento que espera a pasta do Drive (a pergunta guardada pelo bot) e onde a pessoa guarda (lib/whatsapp/drive.ts).
    documentoParaGuardar: () => documentoEsperando(admin, workspaceId, pessoa.id),
    quemGuarda: () => ondeGuarda(admin, workspaceId, pessoa),
  }
}

/** O texto da falha sem o link do fim (o recibo põe os links que valem; o motivo fica limpo). */
const semLinkNoFim = (r: ResultadoDaAcao): ResultadoDaAcao => (r.ok ? r : { ...r, texto: r.texto.replace(/\s*https?:\/\/\S+\s*$/, '').trim() || 'não deu certo' })

/** A trilha do passo feito (o voto deixa a dele, em votar): quem, o quê, por onde e de qual plano. */
async function registrarPasso(admin: Admin, ctx: ContextoDaExecucao, canal: CanalDoPasso['via'], acao: string, entidade: { tipo: string; id: string | null }) {
  const { error } = await admin.from('activity_log').insert({
    workspace_id: ctx.workspaceId, actor_id: ctx.pessoa.id, action: `whatsapp_assistente_${acao}`, entity_type: entidade.tipo, entity_id: entidade.id,
    metadata: { canal: canal === 'sessao' ? 'palacio' : 'whatsapp', via: 'assistente', plano_id: ctx.planoId },
  })
  if (error) console.error('[whatsapp] assistente: trilha do passo não gravada:', error.code)
}

/** A função do banco não existe (a migração do assistente ainda não foi aplicada). */
const semFuncao = (error: { code?: string } | null) => error?.code === 'PGRST202' || error?.code === '42883'

/**
 * O voto pela sessão (a página de confirmar no Palácio): votar_conferido, com o nível da sessão (quem usa a
 * verificação em duas etapas, só com o código), a mesma trava e o mesmo hash do conteúdo do plano (WA001 já votou,
 * WA002 a matéria mudou, WA003 a rodada encerrou). A trilha e o aviso a quem pediu, como a tela.
 */
async function votarPelaSessao(supabase: SupabaseClient, passo: Extract<Passo, { acao: 'votar' }>, ctx: ContextoDaExecucao): Promise<ResultadoDaAcao> {
  const abrir = `${ctx.base}/aprovacoes/${passo.aprovacaoId}`
  const conferencia = passo.decisao === 'approved' ? registroDaConferenciaDoPlano(passo.conferencia) : ''
  const comentario = [passo.nota, conferencia, 'Voto pedido ao assistente do WhatsApp e confirmado no Palácio.'].filter(Boolean).join('\n\n')
  const { error } = await supabase.rpc('votar_conferido', { p_approval_id: passo.aprovacaoId, p_decision: passo.decisao, p_comment: comentario, p_hash_conteudo: passo.hashConteudo })
  if (semFuncao(error)) return { ok: false, codigo: 'indisponivel', texto: 'o voto pelo plano ainda não está ligado; vote pela tela da aprovação' }
  if (error) {
    const conhecido = error.code === 'P0001' || error.code === '42501' || /^WA00[123]$/.test(error.code ?? '')
    return { ok: false, codigo: CODIGO_DO_VOTO[error.code ?? ''] ?? 'erro', texto: conhecido && error.message ? error.message : 'Não foi possível registrar o voto.' }
  }
  await supabase.from('activity_log').insert({
    workspace_id: ctx.workspaceId, actor_id: ctx.pessoa.id, action: passo.decisao, entity_type: 'approval', entity_id: passo.aprovacaoId,
    metadata: { note: comentario, canal: 'palacio', via: 'assistente', plano_id: ctx.planoId },
  })
  await avisarQuemPediu({ approvalId: passo.aprovacaoId, workspaceId: ctx.workspaceId, atorId: ctx.pessoa.id, quem: ctx.pessoa.nome || 'Um colega', decisao: passo.decisao, nota: passo.nota })
  return { ok: true, codigo: 'feito', texto: passo.decisao === 'approved' ? 'Voto registrado: aprovado.' : 'Pedido de ajustes registrado.', link: abrir }
}

/**
 * Um passo confirmado. A revalidação (preparos.ts, revalidarPasso) já passou para TODOS os passos; aqui as funções
 * do banco conferem de novo, na mesma transação da escrita (o voto com o hash do conteúdo).
 */
export async function executarPasso(passo: Passo, canal: CanalDoPasso, ctx: ContextoDaExecucao): Promise<ResultadoDaAcao> {
  const { admin } = canal
  const sessao = canal.via === 'sessao' ? canal.supabase : undefined
  const { workspaceId, pessoa, base } = ctx
  // O evento do chamado diz que veio do WhatsApp só quando veio de lá (confirmado no Palácio, é como a tela).
  const peloWhatsapp = canal.via === 'whatsapp' ? { canal: 'whatsapp' as const } : {}
  try {
    if (passo.acao === 'decidir_financeiro') {
      // Nunca pelo WhatsApp; no Palácio, quem executa é palacio.ts, pela função da tela.
      return { ok: false, codigo: 'sem_permissao', texto: 'decisão de despesa ou compra só se confirma no Palácio' }
    }
    if (passo.acao === 'votar') {
      if (sessao) return await votarPelaSessao(sessao, passo, ctx)
      const conferencia = passo.decisao === 'approved' ? registroDaConferenciaDoPlano(passo.conferencia) : undefined
      return semLinkNoFim(await votar(admin, workspaceId, pessoa, passo.aprovacaoId, passo.decisao, passo.nota, base, conferencia || undefined, {
        via: 'assistente', plano_id: ctx.planoId, hashConteudo: passo.hashConteudo,
      }))
    }
    if (passo.acao === 'mensagem_direta') {
      const r = await enviarMensagemDireta(sessao ? { via: 'sessao', supabase: sessao, admin } : { via: 'whatsapp', admin }, {
        workspaceId, autor: { id: pessoa.id, nome: pessoa.nome }, paraId: passo.paraId, corpo: passo.texto, origem: 'whatsapp',
      })
      if (r.ok) await registrarPasso(admin, ctx, canal.via, 'mensagem', { tipo: 'mensagem_direta', id: passo.paraId })
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
      await registrarPasso(admin, ctx, canal.via, 'comentario', { tipo: 'chamado', id: c.id })
      return { ok: true, codigo: 'feito', texto: `Comentário no chamado *${c.codigo}*.`, link: `${base}/chamados/${c.id}` }
    }
    if (passo.acao === 'atender_chamado') {
      const c = await carregarChamado(admin, workspaceId, passo.chamadoId)
      const papeis = c && !ehEquipeDaEscola(pessoa.papel) ? papeisNoChamado(c, pessoa.id, await filasQueAtendo(admin, workspaceId, pessoa.id, pessoa.papel)) : []
      if (!c || !papeis.includes('equipe')) return { ok: false, codigo: 'sem_permissao', texto: 'Você não atende mais a fila desse chamado.' }
      const autor = { id: pessoa.id, nome: pessoa.nome }
      const abrir = `${base}/chamados/${c.id}`
      try {
        if (passo.tipo === 'assumir') {
          await assumirChamado(admin, autor, c, papeis, canal.via === 'whatsapp' ? 'whatsapp' : undefined)
        } else if (passo.tipo === 'resolver') {
          const mudou = await mudarStatusNoChamado(admin, { c, papeis, autor, para: 'resolvido', nota: passo.nota, ...peloWhatsapp })
          if (!mudou) return { ok: false, codigo: 'encerrada', texto: `o chamado ${c.codigo} já estava resolvido` }
        } else {
          const novo = await transferirNoChamado(admin, { c, papeis, autor, filaId: passo.filaId ?? '', categoriaId: passo.categoriaId ?? '', motivo: passo.nota, ...peloWhatsapp })
          await registrarPasso(admin, ctx, canal.via, 'atendimento', { tipo: 'chamado', id: c.id })
          return { ok: true, codigo: 'feito', texto: `Chamado transferido para ${novo.fila}: agora é *${novo.codigo}*.`, link: abrir }
        }
      } catch (causa) {
        return { ok: false, codigo: 'erro', texto: causa instanceof Error ? causa.message : 'Não foi possível atender o chamado.' }
      }
      await registrarPasso(admin, ctx, canal.via, 'atendimento', { tipo: 'chamado', id: c.id })
      return { ok: true, codigo: 'feito', texto: passo.tipo === 'assumir' ? `Chamado *${c.codigo}* assumido.` : `Chamado *${c.codigo}* resolvido.`, link: abrir }
    }
    if (passo.acao === 'registrar_visita') {
      if (ehEquipeDaEscola(pessoa.papel)) return { ok: false, codigo: 'sem_permissao', texto: 'A portaria fica fora do seu acesso.' }
      const r = await gravarEntrada(admin, workspaceId, pessoa, { nome: passo.visitante, empresa: passo.empresa, motivo: passo.motivo, visitadoId: passo.visitadoId }, `${base}/portaria`, sessao)
      if (r.ok) await registrarPasso(admin, ctx, canal.via, 'visita_registrada', { tipo: 'portaria_visita', id: null })
      return semLinkNoFim(r)
    }
    if (passo.acao === 'abrir_chamado') {
      const { data: vinculo } = await admin.from('workspace_members').select('coordination').eq('workspace_id', workspaceId).eq('user_id', pessoa.id).maybeSingle()
      try {
        const criado = await criarChamado(admin, {
          workspaceId, autor: { id: pessoa.id, nome: pessoa.nome, setor: (vinculo?.coordination as string | null) ?? null },
          filaId: passo.filaId, categoriaId: passo.categoriaId, titulo: tituloDoRelato(passo.relato), descricao: passo.relato, local: passo.local, urgencia: passo.urgencia,
        })
        await registrarPasso(admin, ctx, canal.via, 'chamado', { tipo: 'chamado', id: criado.id })
        return { ok: true, codigo: 'feito', texto: `Chamado *${criado.codigo}* aberto.`, link: `${base}/chamados/${criado.id}` }
      } catch (causa) {
        return { ok: false, codigo: 'erro', texto: causa instanceof Error ? causa.message : 'Não foi possível abrir o chamado.' }
      }
    }
    if (passo.acao === 'responder_visita') {
      const r = await gravarRespostaDaVisita(admin, workspaceId, pessoa, passo.visitaId, passo.resposta, passo.recado, base)
      if (r.ok) await registrarPasso(admin, ctx, canal.via, 'visita', { tipo: 'portaria_visita', id: passo.visitaId })
      return semLinkNoFim(r)
    }
    if (passo.acao === 'guardar_no_drive') {
      // O mesmo caminho da legenda e da pergunta do bot: baixa da Kapso, garante as pastas e manda ao Drive (com o link).
      const r = await guardarDocumento(admin, workspaceId, pessoa, {
        mensagemId: passo.mensagemId, arquivo: passo.arquivo, endereco: passo.endereco, nome: passo.nome, mime: passo.mime, tamanho: passo.tamanho,
        tipo: passo.tipo, extensao: passo.extensao,
      }, passo.partes, { nome: passo.nome, via: 'assistente', planoId: ctx.planoId })
      if (r.ok) await registrarPasso(admin, ctx, canal.via, 'drive', { tipo: 'drive_arquivo', id: null })
      return r.ok ? { ...r, texto: 'Documento guardado no Google Drive.' } : r
    }
    if (passo.acao === 'responder_chat') {
      const r = await enviarNoChat(admin, workspaceId, pessoa, passo.canalId, passo.fio, passo.texto, `${base}/chat/${passo.canalId}${passo.fio ? `?fio=${passo.fio}` : ''}`, sessao)
      if (r.ok) await registrarPasso(admin, ctx, canal.via, 'chat', { tipo: 'chat_canal', id: passo.canalId })
      return semLinkNoFim(r)
    }
    // Marcar como lidos: só os avisos da própria pessoa (os do plano, ou todos os sem ler que já existiam no preparo).
    let q = admin.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', pessoa.id).eq('workspace_id', workspaceId).is('read_at', null)
    if (passo.avisoIds !== 'todos') q = q.in('id', passo.avisoIds)
    else if (passo.ate) q = q.lte('created_at', passo.ate)
    const { error } = await q
    if (error) return { ok: false, codigo: 'erro', texto: 'Não foi possível marcar os avisos como lidos.' }
    await registrarPasso(admin, ctx, canal.via, 'lidos', { tipo: 'notificacao', id: null })
    return { ok: true, codigo: 'feito', texto: 'Avisos marcados como lidos.', link: `${base}/notificacoes` }
  } catch (causa) {
    console.error('[whatsapp] assistente: passo não executado:', passo.acao, causa instanceof Error ? causa.name : '')
    return { ok: false, codigo: 'erro', texto: 'Erro inesperado.' }
  }
}
