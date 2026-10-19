import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { avisarQuemPediu } from '@/lib/aprovacoes/avisos'
import { conferenciaDaRodada, registroDaConferencia } from '@/lib/aprovacoes/setores'
import { avisarSobreMensagem } from '@/lib/chat/avisos'
import { COLUNAS_DA_MENSAGEM, type MensagemDoChat } from '@/lib/chat/regras'
import { comentarNoChamado, criarChamado } from '@/lib/chamados/nucleo'
import { URGENCIA } from '@/lib/chamados/regras'
import { carregarChamado, filasQueAtendo, papeisNoChamado } from '@/lib/chamados/servidor'
import { avisarMensagemDireta } from '@/lib/mensagens/avisos'
import { ehEquipeDaEscola, type Papel } from '@/lib/permissoes'
import { situacaoDaVerificacao } from '@/lib/usuarios/verificacao'
import {
  BOTOES_DA_CONFERENCIA, BOTOES_DOS_DETALHES, PENDENCIA_VALE_MIN, TEXTO_SEM_ACAO_PELO_WHATSAPP, alvoDoLink, ehCancelamento, ehConfirmacao, ehPular,
  interativoDaEscolha, lerDecisao, lerEscolha, oQueDoVoto, textoDaConferencia, textoDaEscolha, textoDoLinkDeConfirmacao, textoDoOficioPeloWhatsapp, textoPedeDetalhes,
  tituloDoRelato, type Interativo, type Opcao, type ResultadoDaAcao,
} from './regras'
import { seguirEnvio } from './envio'
import { atenderPeloAviso, seguirAtendimento } from './atendimento'
import { seguirVisita } from './portaria'
import { seguirDecisoes } from './financeiro'
import { seguirPresenca } from './presenca'
import { seguirViagem } from './frota'
import { criarConfirmacao } from './confirmacoes'
import { PERGUNTA_DA_VISITA, RESPOSTAS, lerRespostaDaVisita, linkDaVisita, type RespostaDaVisita } from '@/lib/portaria/regras'
import { aposResposta } from '@/lib/portaria/servidor'
import { redigirVencidos } from './assistente/faxina'

export type { ResultadoDaAcao }

/**
 * O que o bot do WhatsApp FAZ em nome de quem escreveu: responder o aviso de
 * um chamado, do Chat ou de uma mensagem direta citando o próprio aviso,
 * votar numa aprovação e abrir um chamado. Quem atende uma fila também
 * assume, resolve e transfere o chamado (lib/whatsapp/atendimento.ts), quem
 * tem a portaria registra a chegada de um visitante (lib/whatsapp/portaria.ts),
 * quem coordena as oportunidades marca a presença da ação de hoje
 * (lib/whatsapp/presenca.ts) e quem opera a frota registra a saída e o
 * retorno dos veículos (lib/whatsapp/frota.ts).
 *
 * Quem é a pessoa, o bot já sabe pelo número confirmado (whatsapp_contas).
 * Daí em diante valem as mesmas regras da tela: os chamados passam por
 * lib/chamados/nucleo.ts, o Chat e o voto pelas funções do banco
 * (whatsapp_chat_enviar / whatsapp_votar, que chamam chat_enviar e
 * vote_on_approval como a pessoa) e os avisos pelos mesmos módulos das
 * actions.
 *
 * O WhatsApp não pede o código do app autenticador: quem usa a verificação
 * em duas etapas (ou é obrigado a usar) consulta, abre chamado e responde à
 * portaria por aqui; o resto (responder, atender chamado, registrar visita,
 * mandar fotos) fica no Palácio. O voto dele sai com o link de confirmar no
 * Palácio (lib/whatsapp/confirmacoes.ts), onde a sessão tem o código. O banco
 * confere de novo no Chat, no voto e no registro da visita (a sessão simulada
 * é aal1).
 *
 * Nada aqui envia mensagem: cada função devolve o texto da resposta e, quando
 * precisa de mais um passo, a pergunta a guardar (whatsapp_pendencias). As
 * ações em si (votar, gravarRespostaDaVisita, enviarNoChat) devolvem
 * ResultadoDaAcao: quem chama decide por `ok` — é assim que o plano do
 * assistente (lib/whatsapp/assistente) para no primeiro passo que não deu.
 */

type Admin = ReturnType<typeof createAdminClient>

export type Pessoa = { id: string; nome: string | null; papel: Papel }

/**
 * `atender_chamado` e `registrar_visita` vêm da migração 20261018213700; `financeiro` (a lista das decisões, para o
 * "aprovar 2") e `nao_fui_eu` (a conferência do "Não fui eu", achada pelo número: lib/whatsapp/protecao.ts), da
 * 20261018223000; `marcar_presenca`, `frota_saida` e `frota_retorno`, da 20261018233000. Antes delas, o banco
 * recusa a pergunta e o bot manda para o Palácio.
 */
export type TipoDePendencia =
  | 'aprovar' | 'abrir_chamado' | 'envio' | 'atender_chamado' | 'registrar_visita' | 'financeiro' | 'nao_fui_eu'
  | 'marcar_presenca' | 'frota_saida' | 'frota_retorno'
export type Pendencia = { id: number; tipo: TipoDePendencia; dados: Record<string, unknown> }

/**
 * A resposta do bot e, se houver, a pergunta que fica esperando (`id` = a pendência que continua).
 * `interativo`: os botões ou a lista da pergunta (só valem com `pergunta`: o toque é reconhecido pela
 * pendência da mensagem tocada; em mensagem sem pergunta, o bot leria o toque como pergunta vencida).
 */
export type Resposta = {
  texto: string
  pergunta?: { tipo: TipoDePendencia; dados: Record<string, unknown>; id?: number }
  interativo?: Interativo | null
  /** O texto que vai no lugar quando a pergunta não pôde ser guardada (a migração dela ainda não foi aplicada); sem ele, "Isto ainda não está ligado…". */
  semPergunta?: string
}

export const INDISPONIVEL = 'Isto ainda não está ligado no WhatsApp do Palácio. Faça pelo Palácio'
/** A função do banco não existe: a migração das ações ainda não foi aplicada. */
export const semFuncao = (error: { code?: string } | null) => error?.code === 'PGRST202' || error?.code === '42883'

/** Onde fazer pelo Palácio o que a pergunta faria (a pergunta não pôde ser guardada: a migração dela ainda não foi aplicada). */
export function ondeNoPalacio(p: { tipo: TipoDePendencia; dados: Record<string, unknown> }): string {
  if (p.tipo === 'aprovar') return `/aprovacoes/${String(p.dados.approvalId ?? '')}`
  if (p.tipo === 'atender_chamado') return `/chamados/${String(p.dados.chamadoId ?? '')}`
  if (p.tipo === 'registrar_visita') return '/portaria'
  if (p.tipo === 'envio') return '/enviar'
  if (p.tipo === 'financeiro') return '/financeiro?aba=aprovacao'
  if (p.tipo === 'nao_fui_eu') return '/perfil'
  if (p.tipo === 'marcar_presenca') {
    const acao = p.dados.acao as { id?: unknown } | undefined
    return typeof acao?.id === 'string' ? `/voluntariado/oportunidades/${acao.id}#inscritos` : '/voluntariado/oportunidades'
  }
  if (p.tipo === 'frota_saida' || p.tipo === 'frota_retorno') {
    const veiculo = p.dados.veiculo as { id?: unknown } | undefined
    return typeof veiculo?.id === 'string' ? `/patrimonio/frota/${veiculo.id}` : '/patrimonio/frota'
  }
  return '/chamados/novo'
}

// ------------------------------------------------------------------ quem pode agir

/** Só age pelo WhatsApp quem não usa (nem é obrigado a usar) a verificação em duas etapas. Na dúvida, não. */
export async function podeAgirPeloWhatsapp(admin: Admin, workspaceId: string, pessoa: Pessoa): Promise<boolean> {
  try {
    const [{ data: espaco, error }, fatores] = await Promise.all([
      admin.from('workspaces').select('mfa_obrigatorio_para').eq('id', workspaceId).maybeSingle(),
      admin.auth.admin.mfa.listFactors({ userId: pessoa.id }),
    ])
    if (error || fatores.error) return false
    const temFatorVerificado = (fatores.data?.factors ?? []).some((f) => f.status === 'verified')
    return situacaoDaVerificacao({ nivel: 'aal1', temFatorVerificado, papel: pessoa.papel, obrigatorioPara: espaco?.mfa_obrigatorio_para as string[] | null }) === 'em_dia'
  } catch {
    return false
  }
}

// ------------------------------------------------------------------ o aviso citado

/** O link do aviso que saiu por esta mensagem do WhatsApp, se ela foi para esta pessoa. */
export async function avisoCitado(admin: Admin, workspaceId: string, userId: string, citada: string): Promise<{ link: string | null } | null> {
  const { data: saida } = await admin.from('whatsapp_mensagens').select('notificacao_id, user_id')
    .eq('workspace_id', workspaceId).eq('direcao', 'saida').eq('mensagem_id', citada).not('notificacao_id', 'is', null).limit(1).maybeSingle()
  if (!saida?.notificacao_id || saida.user_id !== userId) return null
  const { data: aviso } = await admin.from('notifications').select('link').eq('id', saida.notificacao_id).eq('user_id', userId).maybeSingle()
  return aviso ? { link: (aviso.link as string | null) ?? null } : null
}

/** A resposta que cita um aviso vai para onde o aviso aponta. */
export async function responderAoAviso(admin: Admin, workspaceId: string, pessoa: Pessoa, link: string | null, texto: string, base: string): Promise<Resposta> {
  const alvo = alvoDoLink(link)
  const abrir = `${base}${link ?? '/notificacoes'}`
  if (!alvo) return { texto: `Este aviso não aceita resposta por aqui. Abra no Palácio: ${abrir}` }
  // A visita na portaria: "1", "2" ou "3" já são a resposta inteira.
  if (alvo.tipo === 'visita') return responderVisita(admin, workspaceId, pessoa, alvo.id, texto, base)
  // O pedido de assinatura de um ofício: nada se assina por aqui (nem se recusa), só o caminho.
  if (alvo.tipo === 'oficio') return { texto: textoDoOficioPeloWhatsapp(abrir) }
  const corpo = texto.trim()
  if (corpo.length < 2) return { texto: 'Escreva a resposta respondendo a mensagem do aviso.' }
  const escola = ehEquipeDaEscola(pessoa.papel)
  if (!await podeAgirPeloWhatsapp(admin, workspaceId, pessoa)) {
    // O voto de quem usa a verificação em duas etapas: o link de confirmar no Palácio, onde a sessão tem o código.
    if (alvo.tipo === 'aprovacao' && !escola) return votarPeloPalacio(admin, workspaceId, pessoa, alvo.id, corpo, base)
    return { texto: `${TEXTO_SEM_ACAO_PELO_WHATSAPP}\n\n${abrir}` }
  }
  const autor = { id: pessoa.id, nome: pessoa.nome }

  if (alvo.tipo === 'chamado') {
    if (escola) return { texto: `Responda pelo Palácio: ${abrir}` }
    const c = await carregarChamado(admin, workspaceId, alvo.id)
    const papeis = c ? papeisNoChamado(c, pessoa.id, await filasQueAtendo(admin, workspaceId, pessoa.id, pessoa.papel)) : []
    if (!c || !papeis.length) return { texto: 'Chamado não encontrado.' }
    // Quem atende pode assumir, resolver ou transferir respondendo o próprio aviso ("resolvido: troquei o toner").
    const atendimento = await atenderPeloAviso(admin, workspaceId, pessoa, c, papeis, corpo, base)
    if (atendimento) return atendimento
    try {
      await comentarNoChamado(admin, { c, papeis, autor, texto: corpo })
    } catch (causa) {
      return { texto: `${causa instanceof Error ? causa.message : 'Não foi possível enviar a mensagem.'} ${abrir}` }
    }
    return { texto: `Enviado no chamado *${c.codigo}*. ${base}/chamados/${c.id}` }
  }

  if (alvo.tipo === 'chat') return { texto: (await enviarNoChat(admin, workspaceId, pessoa, alvo.canalId, alvo.fio, corpo, abrir)).texto }

  if (alvo.tipo === 'mensagem') {
    if (escola || alvo.pessoaId === pessoa.id) return { texto: `Responda pelo Palácio: ${abrir}` }
    if (corpo.length > 2000) return { texto: 'A mensagem pode ter até 2.000 caracteres.' }
    const { data: membro } = await admin.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('user_id', alvo.pessoaId).maybeSingle()
    if (!membro) return { texto: 'Essa pessoa não está mais no espaço.' }
    const { error } = await admin.from('messages').insert({ workspace_id: workspaceId, pauta_id: null, author_id: pessoa.id, recipient_id: alvo.pessoaId, body: corpo })
    if (error) return { texto: `Não foi possível enviar a mensagem. ${abrir}` }
    await avisarMensagemDireta(admin, { workspaceId, autorId: pessoa.id, nome: pessoa.nome || 'Um colega', para: alvo.pessoaId, corpo })
    return { texto: `Mensagem enviada. ${base}/mensagens/pessoa/${alvo.pessoaId}` }
  }

  if (alvo.tipo === 'aprovacao') return decidirAprovacao(admin, workspaceId, pessoa, alvo.id, corpo, base)
  return { texto: `Este aviso não aceita resposta por aqui. Abra no Palácio: ${abrir}` }
}

/**
 * Manda no Chat (canal ou fio) em nome de quem escreveu, pela função do banco (whatsapp_chat_enviar, que chama
 * chat_enviar como a pessoa: quem não pode lá não pode aqui), e avisa os membros. `abrir`: o link da conversa.
 */
export async function enviarNoChat(admin: Admin, workspaceId: string, pessoa: Pessoa, canalId: string, fio: string | null, corpo: string, abrir: string): Promise<ResultadoDaAcao> {
  const { data, error } = await admin.rpc('whatsapp_chat_enviar', { p_user_id: pessoa.id, p_canal_id: canalId, p_corpo: corpo.slice(0, 8000), p_resposta_de: fio })
  if (semFuncao(error)) return { ok: false, codigo: 'indisponivel', texto: `${INDISPONIVEL}: ${abrir}` }
  if (error || !data) return { ok: false, codigo: error?.code === '42501' ? 'sem_permissao' : 'erro', texto: `${error?.code === 'P0001' && error.message ? error.message : 'Não foi possível enviar.'} ${abrir}` }
  const { data: mensagem } = await admin.from('chat_mensagens').select(COLUNAS_DA_MENSAGEM).eq('id', (data as { id: string }).id).single()
  if (mensagem) await avisarSobreMensagem(workspaceId, canalId, pessoa.id, mensagem as MensagemDoChat)
  return { ok: true, codigo: 'feito', texto: `${fio ? 'Respondido no fio' : 'Enviado na conversa'}. ${abrir}`, link: abrir }
}

// ------------------------------------------------------------------ visita na portaria

/**
 * Quem é visitado responde à portaria: pode subir, aguarde na recepção ou não
 * pode agora (lib/portaria/regras.ts). Vale com a verificação em duas etapas,
 * como abrir chamado: é só a resposta à visita dele, e o banco confere que a
 * visita é mesmo para esta pessoa (portaria_responder_whatsapp).
 */
export async function responderVisita(admin: Admin, workspaceId: string, pessoa: Pessoa, visitaId: string, texto: string, base: string): Promise<Resposta> {
  const abrir = `${base}${linkDaVisita(visitaId)}`
  const lida = lerRespostaDaVisita(texto)
  if (!lida) return { texto: `Não entendi a resposta. ${PERGUNTA_DA_VISITA}\n\nOu responda pelo Palácio: ${abrir}` }
  return { texto: (await gravarRespostaDaVisita(admin, workspaceId, pessoa, visitaId, lida.resposta, lida.recado, base)).texto }
}

/**
 * Grava a resposta à portaria (portaria_responder_whatsapp: o banco confere que a visita é desta pessoa e espera
 * resposta) e avisa a portaria e o visitante (aposResposta).
 */
export async function gravarRespostaDaVisita(admin: Admin, workspaceId: string, pessoa: Pessoa, visitaId: string, resposta: RespostaDaVisita, recado: string | null, base: string): Promise<ResultadoDaAcao> {
  const abrir = `${base}${linkDaVisita(visitaId)}`
  const { error } = await admin.rpc('portaria_responder_whatsapp', { p_user_id: pessoa.id, p_id: visitaId, p_resposta: resposta, p_recado: recado })
  if (semFuncao(error)) return { ok: false, codigo: 'indisponivel', texto: `${INDISPONIVEL}: ${abrir}` }
  if (error) return { ok: false, codigo: 'erro', texto: `${error.code === 'P0001' && error.message ? error.message : 'Não foi possível registrar a resposta.'} ${abrir}` }
  const { visitanteAvisado } = await aposResposta(visitaId, pessoa.id)
  return {
    ok: true,
    codigo: 'feito',
    texto: [
      `Pronto: *${RESPOSTAS[resposta].rotulo}*. A portaria foi avisada${visitanteAvisado ? ' e o visitante recebeu a resposta no WhatsApp' : ''}.`,
      resposta === 'aguardar' ? 'Quando puder receber, responda de novo com *1*.' : null,
    ].filter(Boolean).join(' '),
    link: abrir,
  }
}

// ------------------------------------------------------------------ aprovação

/**
 * A rodada em que a pessoa vai votar: aberta, com ela convidada e ainda sem o voto dela; o título e a conferência do
 * setor, e (para o plano do assistente) a matéria, quem pediu e quando. No erro, o `codigo` de ResultadoDaAcao.
 */
export async function rodadaDoVoto(admin: Admin, workspaceId: string, pessoa: Pessoa, approvalId: string) {
  const { data: aprovacao } = await admin.from('approvals').select('id, status, content_id, requested_by, created_at').eq('id', approvalId).eq('workspace_id', workspaceId).maybeSingle()
  if (!aprovacao || aprovacao.status !== 'pending') return { erro: 'Esta rodada já foi encerrada.', codigo: 'encerrada' } as const
  const { data: voto } = await admin.from('approval_voters').select('decision').eq('approval_id', approvalId).eq('user_id', pessoa.id).maybeSingle()
  if (!voto) return { erro: 'Você não está entre as pessoas convidadas para aprovar este conteúdo.', codigo: 'sem_permissao' } as const
  if (voto.decision !== 'pending') return { erro: 'Você já votou nesta rodada.', codigo: 'ja_votou' } as const
  const [{ data: peca }, { data: vinculo }] = await Promise.all([
    admin.from('content_pieces').select('title, pauta_id').eq('id', aprovacao.content_id).eq('workspace_id', workspaceId).maybeSingle(),
    admin.from('workspace_members').select('coordination').eq('workspace_id', workspaceId).eq('user_id', pessoa.id).maybeSingle(),
  ])
  const { data: pauta } = peca?.pauta_id ? await admin.from('pautas').select('coordination').eq('id', peca.pauta_id).maybeSingle() : { data: null }
  return {
    titulo: (peca?.title as string | null)?.trim() || 'Conteúdo editorial',
    // A mesma conferência da tela (lib/aprovacoes/setores.ts), calculada aqui no servidor.
    blocos: conferenciaDaRodada((pauta?.coordination as string | null) ?? null, (vinculo?.coordination as string | null) ?? null),
    contentId: aprovacao.content_id as string,
    pedidaPor: (aprovacao.requested_by as string | null) ?? null,
    pedidaEm: aprovacao.created_at as string,
  } as const
}

async function decidirAprovacao(admin: Admin, workspaceId: string, pessoa: Pessoa, approvalId: string, texto: string, base: string): Promise<Resposta> {
  const abrir = `${base}/aprovacoes/${approvalId}`
  const decisao = lerDecisao(texto)
  if (!decisao) return { texto: `Para votar por aqui, responda o aviso com *aprovar* ou com *ajustes:* e o que precisa mudar. Ou abra: ${abrir}` }
  if (decisao.decisao === 'ajustes' && decisao.nota.length < 5) return { texto: 'Diga o que precisa mudar, respondendo o aviso com *ajustes:* e o texto.' }
  const rodada = await rodadaDoVoto(admin, workspaceId, pessoa, approvalId)
  if ('erro' in rodada) return { texto: `${rodada.erro} ${abrir}` }
  if (decisao.decisao === 'ajustes') return { texto: (await votar(admin, workspaceId, pessoa, approvalId, 'changes_requested', decisao.nota, base)).texto }
  return {
    texto: textoDaConferencia({ titulo: rodada.titulo, blocos: rodada.blocos.map((b) => ({ setor: b.setor.nome, itens: b.itens })) }),
    pergunta: { tipo: 'aprovar', dados: { approvalId } },
    interativo: BOTOES_DA_CONFERENCIA,
  }
}

/**
 * O voto de quem usa (ou é obrigado a usar) a verificação em duas etapas: "aprovar" ou "ajustes: …", como
 * sempre, mas o voto não sai daqui — vira o link de confirmar no Palácio (lib/whatsapp/confirmacoes.ts). Lá,
 * com a sessão verificada, a conferência do setor aparece antes do botão, e o voto passa pela mesma função
 * da tela da aprovação (lib/aprovacoes/voto.ts, votarNaRodada).
 */
async function votarPeloPalacio(admin: Admin, workspaceId: string, pessoa: Pessoa, approvalId: string, texto: string, base: string): Promise<Resposta> {
  const abrir = `${base}/aprovacoes/${approvalId}`
  const decisao = lerDecisao(texto)
  if (!decisao) {
    return { texto: `Para votar, responda o aviso com *aprovar* ou com *ajustes:* e o que precisa mudar: chega um link para você confirmar no Palácio (a sua conta usa a verificação em duas etapas). Ou abra: ${abrir}` }
  }
  if (decisao.decisao === 'ajustes' && decisao.nota.length < 5) return { texto: 'Diga o que precisa mudar, respondendo o aviso com *ajustes:* e o texto.' }
  const rodada = await rodadaDoVoto(admin, workspaceId, pessoa, approvalId)
  if ('erro' in rodada) return { texto: `${rodada.erro} ${abrir}` }
  const voto = decisao.decisao === 'aprovar' ? { decisao: 'approved' as const, nota: '' } : { decisao: 'changes_requested' as const, nota: decisao.nota }
  const link = await criarConfirmacao(admin, { workspaceId, userId: pessoa.id, acao: 'votar_aprovacao', alvoId: approvalId, dados: voto })
  if ('erro' in link) return { texto: `${TEXTO_SEM_ACAO_PELO_WHATSAPP}\n\n${abrir}` }
  return { texto: textoDoLinkDeConfirmacao({ oQue: oQueDoVoto({ titulo: rodada.titulo, ...voto }), url: link.url }) }
}

/** O código de erro do voto conferido (whatsapp_votar_uma_vez) no vocabulário de ResultadoDaAcao. */
const CODIGO_DO_VOTO: Record<string, Extract<ResultadoDaAcao, { ok: false }>['codigo']> = {
  WA001: 'ja_votou', WA002: 'mudou', WA003: 'encerrada', 42501: 'sem_permissao',
}

/**
 * O voto em nome de quem escreveu. Sem `extra`, pela função de sempre (whatsapp_votar). Com `extra` (o plano do
 * assistente), pela conferida (whatsapp_votar_uma_vez): trava a rodada e a linha do votante, recusa voto repetido
 * (inclusive o dado na tela no meio do caminho) e matéria mudada depois do plano (o hash do conteúdo). Nunca
 * lança: devolve ResultadoDaAcao, e o `texto` é o mesmo que o bot sempre mandou.
 */
export async function votar(admin: Admin, workspaceId: string, pessoa: Pessoa, approvalId: string, decisao: 'approved' | 'changes_requested', nota: string, base: string, conferencia?: string,
  extra?: { via: 'assistente'; plano_id: string; hashConteudo: string }): Promise<ResultadoDaAcao> {
  const abrir = `${base}/aprovacoes/${approvalId}`
  const comentario = [nota, conferencia, 'Voto dado pelo WhatsApp.'].filter(Boolean).join('\n\n')
  const { error } = extra
    ? await admin.rpc('whatsapp_votar_uma_vez', { p_user_id: pessoa.id, p_approval_id: approvalId, p_decision: decisao, p_comment: comentario, p_hash_conteudo: extra.hashConteudo })
    : await admin.rpc('whatsapp_votar', { p_user_id: pessoa.id, p_approval_id: approvalId, p_decision: decisao, p_comment: comentario })
  if (semFuncao(error)) return { ok: false, codigo: 'indisponivel', texto: `${INDISPONIVEL}: ${abrir}` }
  if (error) {
    const conhecido = error.code === 'P0001' || error.code === '42501' || (extra && /^WA00[123]$/.test(error.code ?? ''))
    return { ok: false, codigo: CODIGO_DO_VOTO[error.code ?? ''] ?? 'erro', texto: `${conhecido && error.message ? error.message : 'Não foi possível registrar o voto.'} ${abrir}` }
  }
  await admin.from('activity_log').insert({
    workspace_id: workspaceId, actor_id: pessoa.id, action: decisao, entity_type: 'approval', entity_id: approvalId,
    metadata: { note: comentario, canal: 'whatsapp', ...(extra ? { via: extra.via, plano_id: extra.plano_id } : {}) },
  })
  await avisarQuemPediu({ approvalId, workspaceId, atorId: pessoa.id, quem: pessoa.nome || 'Um colega', decisao, nota })
  return {
    ok: true,
    codigo: 'feito',
    texto: decisao === 'approved' ? `Voto registrado: *aprovado*. ${abrir}` : `Pedido de ajustes registrado; quem pediu a aprovação foi avisado. ${abrir}`,
    link: abrir,
  }
}

// ------------------------------------------------------------------ pendências (o passo que falta)

/**
 * A pergunta aberta: a citada (se a pessoa respondeu citando) ou a mais recente dos últimos 15 minutos; com `tipo`,
 * só daquele tipo (a lista do "financeiro" para o "aprovar 2"). A conferência do "Não fui eu" nunca vem por aqui:
 * ela é do número que respondeu ao aviso (lib/whatsapp/protecao.ts), e quem está com o número de agora da conta
 * não a responde nem a cancela.
 */
export async function pendenciaAberta(admin: Admin, workspaceId: string, userId: string, citada: string | null, tipo?: TipoDePendencia): Promise<Pendencia | null> {
  let consulta = admin.from('whatsapp_pendencias').select('id, tipo, dados').eq('workspace_id', workspaceId).eq('user_id', userId)
    .is('encerrada_em', null).gt('expira_em', new Date().toISOString())
  consulta = tipo ? consulta.eq('tipo', tipo) : consulta.neq('tipo', 'nao_fui_eu')
  if (citada) consulta = consulta.eq('mensagem_id', citada)
  const { data, error } = await consulta.order('criado_em', { ascending: false }).limit(1).maybeSingle()
  if (error || !data) return null
  return { id: data.id as number, tipo: data.tipo as TipoDePendencia, dados: (data.dados ?? {}) as Record<string, unknown> }
}

/**
 * Encerra a pergunta e diz se foi ESTA chamada que encerrou: duas respostas
 * seguidas (reenvio, toque duplo) chegam em entregas paralelas, e só uma pode
 * votar ou abrir o chamado.
 */
export async function encerrarPendencia(admin: Admin, id: number): Promise<boolean> {
  const { data } = await admin.from('whatsapp_pendencias').update({ encerrada_em: new Date().toISOString() }).eq('id', id).is('encerrada_em', null).select('id').maybeSingle()
  return Boolean(data)
}

/** A pergunta que saiu nesta mensagem já foi respondida, vencida ou trocada por outra? */
export async function perguntaVencida(admin: Admin, workspaceId: string, userId: string, citada: string): Promise<boolean> {
  const { data } = await admin.from('whatsapp_pendencias').select('id').eq('workspace_id', workspaceId).eq('user_id', userId).eq('mensagem_id', citada).limit(1).maybeSingle()
  return Boolean(data)
}

/** Guarda (ou atualiza) a pergunta antes de enviar; sem a tabela, devolve null e o bot manda para o Palácio. */
export async function guardarPendencia(admin: Admin, workspaceId: string, userId: string, p: { tipo: TipoDePendencia; dados: Record<string, unknown>; id?: number }): Promise<number | null> {
  const expira = new Date(Date.now() + PENDENCIA_VALE_MIN * 60_000).toISOString()
  if (p.id) {
    const { error } = await admin.from('whatsapp_pendencias').update({ dados: p.dados, expira_em: expira, mensagem_id: null }).eq('id', p.id)
    return error ? null : p.id
  }
  // Uma pergunta por vez: a nova substitui as que ficaram abertas (o envio de fotos aberto continua, e a conferência
  // do "Não fui eu", que é do número que respondeu ao aviso, também: uma pergunta nova não a cancela).
  await admin.from('whatsapp_pendencias').update({ encerrada_em: new Date().toISOString() }).eq('user_id', userId).is('encerrada_em', null)
    .not('tipo', 'in', '(envio,nao_fui_eu)')
  // O plano ou a pergunta do assistente também cedem a vez (os dois nunca ficam abertos juntos) e são redigidos.
  // Sem a tabela (migração do assistente ainda não aplicada), o erro é ignorado.
  const { data: substituidos } = await admin.from('whatsapp_ia_planos').update({ situacao: 'substituido', atualizado_em: new Date().toISOString() })
    .eq('user_id', userId).in('situacao', ['pergunta', 'aberto', 'em_revisao']).select('id')
  if (substituidos?.length) await redigirVencidos(admin, { limite: 10, userId })
  const { data, error } = await admin.from('whatsapp_pendencias').insert({ workspace_id: workspaceId, user_id: userId, tipo: p.tipo, dados: p.dados, expira_em: expira }).select('id').single()
  return error || !data ? null : (data.id as number)
}

export async function marcarPergunta(admin: Admin, id: number, mensagemId: string | null) {
  if (mensagemId) await admin.from('whatsapp_pendencias').update({ mensagem_id: mensagemId }).eq('id', id)
}

/**
 * A resposta à pergunta aberta. `estrita` = a pessoa citou a pergunta: o que
 * não serve é pedido de novo. Sem citar, o que não serve devolve null e segue
 * como mensagem comum (a pessoa pode ter mudado de assunto).
 */
export async function seguirPendencia(admin: Admin, workspaceId: string, pessoa: Pessoa, p: Pendencia, texto: string, base: string, estrita: boolean): Promise<Resposta | null> {
  if (p.tipo === 'envio') return seguirEnvio(admin, pessoa, p, texto, base, estrita)
  // Na pergunta dos detalhes (e na do motivo da visita e na das ocorrências do retorno), "não" quer dizer "sem detalhes", não "desisto".
  const pulandoDetalhes = ((p.tipo === 'abrir_chamado' && p.dados.etapa === 'detalhes') || (p.tipo === 'registrar_visita' && p.dados.etapa === 'motivo')
    || (p.tipo === 'frota_retorno' && p.dados.etapa === 'ocorrencias')) && ehPular(texto)
  if (ehCancelamento(texto) && !pulandoDetalhes) {
    await encerrarPendencia(admin, p.id)
    const desistiu: Record<Exclude<TipoDePendencia, 'envio'>, string> = {
      aprovar: 'Pronto: nenhum voto registrado.',
      abrir_chamado: 'Pronto: o chamado não foi aberto.',
      atender_chamado: 'Pronto: nada mudou no chamado.',
      registrar_visita: 'Pronto: a entrada não foi registrada.',
      financeiro: 'Pronto: nada foi decidido.',
      nao_fui_eu: 'Pronto: nada mudou na conta.',
      marcar_presenca: 'Pronto: nenhuma presença foi marcada.',
      frota_saida: 'Pronto: a saída não foi registrada.',
      frota_retorno: 'Pronto: o retorno não foi registrado.',
    }
    return { texto: desistiu[p.tipo] }
  }
  if (p.tipo === 'atender_chamado') return seguirAtendimento(admin, workspaceId, pessoa, p, texto, base, estrita)
  if (p.tipo === 'registrar_visita') return seguirVisita(admin, workspaceId, pessoa, p, texto, base, estrita)
  if (p.tipo === 'marcar_presenca') return seguirPresenca(admin, workspaceId, pessoa, p, texto, base, estrita)
  if (p.tipo === 'frota_saida' || p.tipo === 'frota_retorno') return seguirViagem(admin, workspaceId, pessoa, p, texto, base, estrita)
  if (p.tipo === 'financeiro') return seguirDecisoes(admin, workspaceId, pessoa, p, texto, base, estrita)
  // A conferência do "Não fui eu" é respondida pelo número, antes de tudo (lib/whatsapp/protecao.ts); aqui não chega.
  if (p.tipo === 'nao_fui_eu') return null

  if (p.tipo === 'aprovar') {
    const approvalId = String(p.dados.approvalId ?? '')
    if (!ehConfirmacao(texto)) return estrita ? { texto: 'Para aprovar, responda a conferência com *confirmo*; para desistir, *cancelar*.' } : null
    if (!await encerrarPendencia(admin, p.id)) return { texto: 'Esta conferência já foi respondida.' }
    // Ligou a verificação em duas etapas depois da conferência: o voto vira o link de confirmar no Palácio.
    if (!await podeAgirPeloWhatsapp(admin, workspaceId, pessoa)) return votarPeloPalacio(admin, workspaceId, pessoa, approvalId, 'aprovar', base)
    const rodada = await rodadaDoVoto(admin, workspaceId, pessoa, approvalId)
    if ('erro' in rodada) return { texto: `${rodada.erro} ${base}/aprovacoes/${approvalId}` }
    return { texto: (await votar(admin, workspaceId, pessoa, approvalId, 'approved', '', base, registroDaConferencia(rodada.blocos))).texto }
  }

  return seguirChamado(admin, workspaceId, pessoa, p, texto, base, estrita)
}

// ------------------------------------------------------------------ abrir chamado

type FilaNaConversa = { id: string; nome: string }
type CategoriaNaConversa = { id: string; nome: string; pedeLocal: boolean }
type DadosDoChamado = {
  etapa?: 'fila' | 'categoria' | 'local' | 'urgencia' | 'detalhes'
  relato: string
  filas?: FilaNaConversa[]
  filaId?: string
  categorias?: CategoriaNaConversa[]
  categoriaId?: string
  pedeLocal?: boolean
  local?: string | null
  urgencia?: 1 | 2 | 3
}

export async function comecarChamado(admin: Admin, workspaceId: string, pessoa: Pessoa, relato: string, base: string): Promise<Resposta> {
  if (ehEquipeDaEscola(pessoa.papel)) return { texto: `Chamados ficam no Palácio: ${base}/chamados` }
  // Abrir chamado vale mesmo com a verificação em duas etapas (decisão de 27/09/2026): só cria o pedido
  // no nome de quem escreveu, não lê nem mexe no que é de outros.
  return proximoPasso(admin, workspaceId, pessoa, { relato: relato.trim().slice(0, 4000) }, base)
}

/** A descrição da linha "Cancelar" nas listas do chamado. */
const NAO_ABRIR = 'Não abrir o chamado'

async function proximoPasso(admin: Admin, workspaceId: string, pessoa: Pessoa, d: DadosDoChamado, base: string, pendenciaId?: number): Promise<Resposta> {
  const perguntar = (dados: DadosDoChamado, texto: string, interativo: Interativo | null = null): Resposta =>
    ({ texto, pergunta: { tipo: 'abrir_chamado', dados, id: pendenciaId }, interativo })
  // A escolha numerada vai também como lista (dentro da janela): cada linha leva o número, como a resposta digitada.
  const escolher = (dados: DadosDoChamado, pergunta: string, opcoes: Opcao[]) =>
    perguntar(dados, textoDaEscolha({ pergunta, opcoes }), interativoDaEscolha(opcoes, { cancelar: NAO_ABRIR }))

  if (!d.filaId) {
    const { data } = await admin.from('chamado_filas').select('id, nome, descricao').eq('workspace_id', workspaceId).eq('ativa', true).order('ordem').limit(9)
    const filas = (data ?? []) as { id: string; nome: string; descricao: string | null }[]
    if (!filas.length) return { texto: 'Nenhuma equipe está recebendo chamados agora.' }
    if (filas.length > 1) {
      return escolher({ ...d, etapa: 'fila', filas: filas.map((f) => ({ id: f.id, nome: f.nome })) },
        `Vou abrir o chamado: _${tituloDoRelato(d.relato)}_\n\nPara qual equipe?`, filas.map((f) => ({ nome: f.nome, detalhe: f.descricao })))
    }
    d = { ...d, filaId: filas[0].id }
  }

  if (!d.categoriaId) {
    const { data } = await admin.from('chamado_categorias').select('id, nome, pede_local').eq('workspace_id', workspaceId).eq('fila_id', d.filaId).eq('ativa', true).order('ordem').limit(9)
    const categorias = (data ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string, pedeLocal: Boolean(c.pede_local) }))
    if (!categorias.length) return { texto: `Esta equipe ainda não tem assuntos para chamado. Abra pelo Palácio: ${base}/chamados/novo` }
    if (categorias.length > 1) return escolher({ ...d, etapa: 'categoria', categorias }, 'Qual é o assunto?', categorias.map((c) => ({ nome: c.nome })))
    d = { ...d, categoriaId: categorias[0].id, pedeLocal: categorias[0].pedeLocal }
  }

  if (d.pedeLocal && !d.local) {
    return perguntar({ ...d, etapa: 'local' }, `Onde é? Responda com a sala, o andar ou o setor (ou *cancelar*). Vale por ${PENDENCIA_VALE_MIN} minutos.`)
  }

  // As três urgências como lista, não botões: "Atrapalha meu trabalho" passa dos 20 caracteres do botão, e a ajuda vai na descrição.
  if (!d.urgencia) {
    return escolher({ ...d, etapa: 'urgencia' }, 'Quanto isso atrapalha?', ([1, 2, 3] as const).map((n) => ({ nome: URGENCIA[n].rotulo, detalhe: URGENCIA[n].ajuda })))
  }

  // A última pergunta é opcional: quem atende lê o relato, e "wifi da sala 2" diz pouco.
  return perguntar({ ...d, etapa: 'detalhes' }, textoPedeDetalhes(), BOTOES_DOS_DETALHES)
}

async function seguirChamado(admin: Admin, workspaceId: string, pessoa: Pessoa, p: Pendencia, texto: string, base: string, estrita: boolean): Promise<Resposta | null> {
  const d = p.dados as unknown as DadosDoChamado
  const deNovo = (texto2: string) => (estrita ? { texto: texto2 } : null)
  // O passo seguinte, e a pergunta encerrada quando ele não pergunta mais nada.
  const avancar = async (dados: DadosDoChamado) => {
    const r = await proximoPasso(admin, workspaceId, pessoa, dados, base, p.id)
    if (!r.pergunta) await encerrarPendencia(admin, p.id)
    return r
  }

  if (d.etapa === 'fila') {
    const n = lerEscolha(texto, d.filas?.length ?? 0)
    if (!n || !d.filas) return deNovo(`Responda com o número da equipe (1 a ${d.filas?.length ?? 1}), ou *cancelar*.`)
    return avancar({ relato: d.relato, filaId: d.filas[n - 1].id })
  }
  if (d.etapa === 'categoria') {
    const n = lerEscolha(texto, d.categorias?.length ?? 0)
    if (!n || !d.categorias) return deNovo(`Responda com o número do assunto (1 a ${d.categorias?.length ?? 1}), ou *cancelar*.`)
    const c = d.categorias[n - 1]
    return avancar({ relato: d.relato, filaId: d.filaId, categoriaId: c.id, pedeLocal: c.pedeLocal })
  }
  if (d.etapa === 'local') {
    const local = texto.trim().replace(/\s+/g, ' ')
    if (local.length < 2 || local.length > 140) return deNovo('Diga onde é em poucas palavras: a sala, o andar ou o setor.')
    return avancar({ ...d, local })
  }
  if (d.etapa === 'urgencia') {
    const urgencia = lerEscolha(texto, 3)
    if (!urgencia) return deNovo('Responda com 1, 2 ou 3, ou *cancelar*.')
    return avancar({ ...d, urgencia: urgencia as 1 | 2 | 3 })
  }
  if (d.etapa !== 'detalhes' || !d.filaId || !d.categoriaId || !d.urgencia) {
    await encerrarPendencia(admin, p.id)
    return { texto: `Não consegui continuar este chamado. Abra pelo Palácio: ${base}/chamados/novo` }
  }

  // Os detalhes: texto livre que entra na descrição, depois do relato; "pular" (ou "não") abre só com o relato.
  const pula = ehPular(texto)
  const detalhes = pula ? '' : texto.trim().replace(/[ \t]+/g, ' ').slice(0, 4000)
  if (!pula && (detalhes.length < 3 || lerEscolha(texto, 99) !== null)) return deNovo('Escreva o que está acontecendo, ou responda *pular* para abrir o chamado assim.')
  if (!await encerrarPendencia(admin, p.id)) return { texto: 'Este chamado já foi aberto.' }
  const { data: vinculo } = await admin.from('workspace_members').select('coordination').eq('workspace_id', workspaceId).eq('user_id', pessoa.id).maybeSingle()
  try {
    const criado = await criarChamado(admin, {
      workspaceId, autor: { id: pessoa.id, nome: pessoa.nome, setor: (vinculo?.coordination as string | null) ?? null },
      filaId: d.filaId, categoriaId: d.categoriaId, titulo: tituloDoRelato(d.relato), descricao: [d.relato, detalhes].filter(Boolean).join('\n\n'),
      local: d.local ?? null, urgencia: d.urgencia,
    })
    return { texto: `Chamado *${criado.codigo}* aberto. As respostas da equipe chegam por aqui; para responder, responda a mensagem do aviso.\n\n${base}/chamados/${criado.id}` }
  } catch (causa) {
    return { texto: `${causa instanceof Error ? causa.message : 'Não foi possível abrir o chamado.'} Abra pelo Palácio: ${base}/chamados/novo` }
  }
}

/**
 * A pergunta aberta espera texto livre (o local ou os detalhes do chamado, o título do envio, a solução ou o
 * motivo da transferência, o nome, quem visita e o motivo da visita, o veículo, quem dirige, o destino e as
 * ocorrências da viagem)? Aí até frase com "agenda" é resposta.
 */
export function esperaTextoLivre(p: Pendencia | null): boolean {
  const etapa = p?.dados.etapa
  return (p?.tipo === 'abrir_chamado' && (etapa === 'local' || etapa === 'detalhes')) || (p?.tipo === 'envio' && etapa === 'titulo')
    || (p?.tipo === 'atender_chamado' && (etapa === 'nota' || etapa === 'motivo' || etapa === 'fila'))
    || (p?.tipo === 'registrar_visita' && (etapa === 'nome' || etapa === 'pessoa' || etapa === 'escolher_pessoa' || etapa === 'motivo'))
    || ((p?.tipo === 'frota_saida' || p?.tipo === 'frota_retorno') && (etapa === 'veiculo' || etapa === 'condutor' || etapa === 'destino' || etapa === 'ocorrencias'))
}
