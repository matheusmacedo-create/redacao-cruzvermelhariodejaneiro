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
  PENDENCIA_VALE_MIN, TEXTO_SEM_ACAO_PELO_WHATSAPP, alvoDoLink, ehCancelamento, ehConfirmacao, ehPular, lerDecisao, lerEscolha, textoDaConferencia,
  textoDaEscolha, textoPedeDetalhes, tituloDoRelato,
} from './regras'
import { seguirEnvio } from './envio'
import { PERGUNTA_DA_VISITA, RESPOSTAS, lerRespostaDaVisita, linkDaVisita } from '@/lib/portaria/regras'
import { aposResposta } from '@/lib/portaria/servidor'

/**
 * O que o bot do WhatsApp FAZ em nome de quem escreveu: responder o aviso de
 * um chamado, do Chat ou de uma mensagem direta citando o próprio aviso,
 * votar numa aprovação e abrir um chamado.
 *
 * Quem é a pessoa, o bot já sabe pelo número confirmado (whatsapp_contas).
 * Daí em diante valem as mesmas regras da tela: os chamados passam por
 * lib/chamados/nucleo.ts, o Chat e o voto pelas funções do banco
 * (whatsapp_chat_enviar / whatsapp_votar, que chamam chat_enviar e
 * vote_on_approval como a pessoa) e os avisos pelos mesmos módulos das
 * actions.
 *
 * O WhatsApp não pede o código do app autenticador: quem usa a verificação
 * em duas etapas (ou é obrigado a usar) consulta e abre chamado por aqui; o
 * resto (responder, votar, mandar fotos) fica no Palácio. O banco confere de
 * novo no Chat e no voto (a sessão simulada é aal1).
 *
 * Nada aqui envia mensagem: cada função devolve o texto da resposta e, quando
 * precisa de mais um passo, a pergunta a guardar (whatsapp_pendencias).
 */

type Admin = ReturnType<typeof createAdminClient>

export type Pessoa = { id: string; nome: string | null; papel: Papel }

export type TipoDePendencia = 'aprovar' | 'abrir_chamado' | 'envio'
export type Pendencia = { id: number; tipo: TipoDePendencia; dados: Record<string, unknown> }

/** A resposta do bot e, se houver, a pergunta que fica esperando (`id` = a pendência que continua). */
export type Resposta = {
  texto: string
  pergunta?: { tipo: TipoDePendencia; dados: Record<string, unknown>; id?: number }
}

const INDISPONIVEL = 'Isto ainda não está ligado no WhatsApp do Palácio. Faça pelo Palácio'
/** A função do banco não existe: a migração das ações ainda não foi aplicada. */
const semFuncao = (error: { code?: string } | null) => error?.code === 'PGRST202' || error?.code === '42883'

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
  const corpo = texto.trim()
  if (corpo.length < 2) return { texto: 'Escreva a resposta respondendo a mensagem do aviso.' }
  if (!await podeAgirPeloWhatsapp(admin, workspaceId, pessoa)) return { texto: `${TEXTO_SEM_ACAO_PELO_WHATSAPP}\n\n${abrir}` }
  const escola = ehEquipeDaEscola(pessoa.papel)
  const autor = { id: pessoa.id, nome: pessoa.nome }

  if (alvo.tipo === 'chamado') {
    if (escola) return { texto: `Responda pelo Palácio: ${abrir}` }
    const c = await carregarChamado(admin, workspaceId, alvo.id)
    const papeis = c ? papeisNoChamado(c, pessoa.id, await filasQueAtendo(admin, workspaceId, pessoa.id, pessoa.papel)) : []
    if (!c || !papeis.length) return { texto: 'Chamado não encontrado.' }
    try {
      await comentarNoChamado(admin, { c, papeis, autor, texto: corpo })
    } catch (causa) {
      return { texto: `${causa instanceof Error ? causa.message : 'Não foi possível enviar a mensagem.'} ${abrir}` }
    }
    return { texto: `Enviado no chamado *${c.codigo}*. ${base}/chamados/${c.id}` }
  }

  if (alvo.tipo === 'chat') {
    const { data, error } = await admin.rpc('whatsapp_chat_enviar', { p_user_id: pessoa.id, p_canal_id: alvo.canalId, p_corpo: corpo.slice(0, 8000), p_resposta_de: alvo.fio })
    if (semFuncao(error)) return { texto: `${INDISPONIVEL}: ${abrir}` }
    if (error || !data) return { texto: `${error?.code === 'P0001' && error.message ? error.message : 'Não foi possível enviar.'} ${abrir}` }
    const { data: mensagem } = await admin.from('chat_mensagens').select(COLUNAS_DA_MENSAGEM).eq('id', (data as { id: string }).id).single()
    if (mensagem) await avisarSobreMensagem(workspaceId, alvo.canalId, pessoa.id, mensagem as MensagemDoChat)
    return { texto: `${alvo.fio ? 'Respondido no fio' : 'Enviado na conversa'}. ${abrir}` }
  }

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

  return decidirAprovacao(admin, workspaceId, pessoa, alvo.id, corpo, base)
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
  const { error } = await admin.rpc('portaria_responder_whatsapp', { p_user_id: pessoa.id, p_id: visitaId, p_resposta: lida.resposta, p_recado: lida.recado })
  if (semFuncao(error)) return { texto: `${INDISPONIVEL}: ${abrir}` }
  if (error) return { texto: `${error.code === 'P0001' && error.message ? error.message : 'Não foi possível registrar a resposta.'} ${abrir}` }
  const { visitanteAvisado } = await aposResposta(visitaId, pessoa.id)
  return {
    texto: [
      `Pronto: *${RESPOSTAS[lida.resposta].rotulo}*. A portaria foi avisada${visitanteAvisado ? ' e o visitante recebeu a resposta no WhatsApp' : ''}.`,
      lida.resposta === 'aguardar' ? 'Quando puder receber, responda de novo com *1*.' : null,
    ].filter(Boolean).join(' '),
  }
}

// ------------------------------------------------------------------ aprovação

async function rodadaDoVoto(admin: Admin, workspaceId: string, pessoa: Pessoa, approvalId: string) {
  const { data: aprovacao } = await admin.from('approvals').select('id, status, content_id').eq('id', approvalId).eq('workspace_id', workspaceId).maybeSingle()
  if (!aprovacao || aprovacao.status !== 'pending') return { erro: 'Esta rodada já foi encerrada.' } as const
  const { data: voto } = await admin.from('approval_voters').select('decision').eq('approval_id', approvalId).eq('user_id', pessoa.id).maybeSingle()
  if (!voto) return { erro: 'Você não está entre as pessoas convidadas para aprovar este conteúdo.' } as const
  if (voto.decision !== 'pending') return { erro: 'Você já votou nesta rodada.' } as const
  const [{ data: peca }, { data: vinculo }] = await Promise.all([
    admin.from('content_pieces').select('title, pauta_id').eq('id', aprovacao.content_id).eq('workspace_id', workspaceId).maybeSingle(),
    admin.from('workspace_members').select('coordination').eq('workspace_id', workspaceId).eq('user_id', pessoa.id).maybeSingle(),
  ])
  const { data: pauta } = peca?.pauta_id ? await admin.from('pautas').select('coordination').eq('id', peca.pauta_id).maybeSingle() : { data: null }
  return {
    titulo: (peca?.title as string | null)?.trim() || 'Conteúdo editorial',
    // A mesma conferência da tela (lib/aprovacoes/setores.ts), calculada aqui no servidor.
    blocos: conferenciaDaRodada((pauta?.coordination as string | null) ?? null, (vinculo?.coordination as string | null) ?? null),
  } as const
}

async function decidirAprovacao(admin: Admin, workspaceId: string, pessoa: Pessoa, approvalId: string, texto: string, base: string): Promise<Resposta> {
  const abrir = `${base}/aprovacoes/${approvalId}`
  const decisao = lerDecisao(texto)
  if (!decisao) return { texto: `Para votar por aqui, responda o aviso com *aprovar* ou com *ajustes:* e o que precisa mudar. Ou abra: ${abrir}` }
  if (decisao.decisao === 'ajustes' && decisao.nota.length < 5) return { texto: 'Diga o que precisa mudar, respondendo o aviso com *ajustes:* e o texto.' }
  const rodada = await rodadaDoVoto(admin, workspaceId, pessoa, approvalId)
  if ('erro' in rodada) return { texto: `${rodada.erro} ${abrir}` }
  if (decisao.decisao === 'ajustes') return { texto: await votar(admin, workspaceId, pessoa, approvalId, 'changes_requested', decisao.nota, base) }
  return {
    texto: textoDaConferencia({ titulo: rodada.titulo, blocos: rodada.blocos.map((b) => ({ setor: b.setor.nome, itens: b.itens })) }),
    pergunta: { tipo: 'aprovar', dados: { approvalId } },
  }
}

async function votar(admin: Admin, workspaceId: string, pessoa: Pessoa, approvalId: string, decisao: 'approved' | 'changes_requested', nota: string, base: string, conferencia?: string): Promise<string> {
  const abrir = `${base}/aprovacoes/${approvalId}`
  const comentario = [nota, conferencia, 'Voto dado pelo WhatsApp.'].filter(Boolean).join('\n\n')
  const { error } = await admin.rpc('whatsapp_votar', { p_user_id: pessoa.id, p_approval_id: approvalId, p_decision: decisao, p_comment: comentario })
  if (semFuncao(error)) return `${INDISPONIVEL}: ${abrir}`
  if (error) return `${(error.code === 'P0001' || error.code === '42501') && error.message ? error.message : 'Não foi possível registrar o voto.'} ${abrir}`
  await admin.from('activity_log').insert({ workspace_id: workspaceId, actor_id: pessoa.id, action: decisao, entity_type: 'approval', entity_id: approvalId, metadata: { note: comentario, canal: 'whatsapp' } })
  await avisarQuemPediu({ approvalId, workspaceId, atorId: pessoa.id, quem: pessoa.nome || 'Um colega', decisao, nota })
  return decisao === 'approved' ? `Voto registrado: *aprovado*. ${abrir}` : `Pedido de ajustes registrado; quem pediu a aprovação foi avisado. ${abrir}`
}

// ------------------------------------------------------------------ pendências (o passo que falta)

/** A pergunta aberta: a citada (se a pessoa respondeu citando) ou a mais recente dos últimos 15 minutos. */
export async function pendenciaAberta(admin: Admin, workspaceId: string, userId: string, citada: string | null): Promise<Pendencia | null> {
  let consulta = admin.from('whatsapp_pendencias').select('id, tipo, dados').eq('workspace_id', workspaceId).eq('user_id', userId)
    .is('encerrada_em', null).gt('expira_em', new Date().toISOString())
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
  // Uma pergunta por vez: a nova substitui as que ficaram abertas (o envio de fotos aberto continua).
  await admin.from('whatsapp_pendencias').update({ encerrada_em: new Date().toISOString() }).eq('user_id', userId).is('encerrada_em', null).neq('tipo', 'envio')
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
  // Na pergunta dos detalhes, "não" quer dizer "sem detalhes", não "desisto do chamado".
  const pulandoDetalhes = p.tipo === 'abrir_chamado' && p.dados.etapa === 'detalhes' && ehPular(texto)
  if (ehCancelamento(texto) && !pulandoDetalhes) {
    await encerrarPendencia(admin, p.id)
    return { texto: p.tipo === 'aprovar' ? 'Pronto: nenhum voto registrado.' : 'Pronto: o chamado não foi aberto.' }
  }

  if (p.tipo === 'aprovar') {
    const approvalId = String(p.dados.approvalId ?? '')
    if (!ehConfirmacao(texto)) return estrita ? { texto: 'Para aprovar, responda a conferência com *confirmo*; para desistir, *cancelar*.' } : null
    if (!await encerrarPendencia(admin, p.id)) return { texto: 'Esta conferência já foi respondida.' }
    if (!await podeAgirPeloWhatsapp(admin, workspaceId, pessoa)) return { texto: TEXTO_SEM_ACAO_PELO_WHATSAPP }
    const rodada = await rodadaDoVoto(admin, workspaceId, pessoa, approvalId)
    if ('erro' in rodada) return { texto: `${rodada.erro} ${base}/aprovacoes/${approvalId}` }
    return { texto: await votar(admin, workspaceId, pessoa, approvalId, 'approved', '', base, registroDaConferencia(rodada.blocos)) }
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

async function proximoPasso(admin: Admin, workspaceId: string, pessoa: Pessoa, d: DadosDoChamado, base: string, pendenciaId?: number): Promise<Resposta> {
  const perguntar = (dados: DadosDoChamado, texto: string): Resposta => ({ texto, pergunta: { tipo: 'abrir_chamado', dados, id: pendenciaId } })

  if (!d.filaId) {
    const { data } = await admin.from('chamado_filas').select('id, nome, descricao').eq('workspace_id', workspaceId).eq('ativa', true).order('ordem').limit(9)
    const filas = (data ?? []) as { id: string; nome: string; descricao: string | null }[]
    if (!filas.length) return { texto: 'Nenhuma equipe está recebendo chamados agora.' }
    if (filas.length > 1) {
      return perguntar({ ...d, etapa: 'fila', filas: filas.map((f) => ({ id: f.id, nome: f.nome })) },
        textoDaEscolha({ pergunta: `Vou abrir o chamado: _${tituloDoRelato(d.relato)}_\n\nPara qual equipe?`, opcoes: filas.map((f) => ({ nome: f.nome, detalhe: f.descricao })) }))
    }
    d = { ...d, filaId: filas[0].id }
  }

  if (!d.categoriaId) {
    const { data } = await admin.from('chamado_categorias').select('id, nome, pede_local').eq('workspace_id', workspaceId).eq('fila_id', d.filaId).eq('ativa', true).order('ordem').limit(9)
    const categorias = (data ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string, pedeLocal: Boolean(c.pede_local) }))
    if (!categorias.length) return { texto: `Esta equipe ainda não tem assuntos para chamado. Abra pelo Palácio: ${base}/chamados/novo` }
    if (categorias.length > 1) {
      return perguntar({ ...d, etapa: 'categoria', categorias }, textoDaEscolha({ pergunta: 'Qual é o assunto?', opcoes: categorias.map((c) => ({ nome: c.nome })) }))
    }
    d = { ...d, categoriaId: categorias[0].id, pedeLocal: categorias[0].pedeLocal }
  }

  if (d.pedeLocal && !d.local) {
    return perguntar({ ...d, etapa: 'local' }, `Onde é? Responda com a sala, o andar ou o setor (ou *cancelar*). Vale por ${PENDENCIA_VALE_MIN} minutos.`)
  }

  if (!d.urgencia) {
    return perguntar({ ...d, etapa: 'urgencia' }, textoDaEscolha({
      pergunta: 'Quanto isso atrapalha?',
      opcoes: ([1, 2, 3] as const).map((n) => ({ nome: URGENCIA[n].rotulo, detalhe: URGENCIA[n].ajuda })),
    }))
  }

  // A última pergunta é opcional: quem atende lê o relato, e "wifi da sala 2" diz pouco.
  return perguntar({ ...d, etapa: 'detalhes' }, textoPedeDetalhes())
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

/** A pergunta aberta espera texto livre (o local ou os detalhes do chamado, o título do envio)? Aí até frase com "agenda" é resposta. */
export function esperaTextoLivre(p: Pendencia | null): boolean {
  const etapa = p?.dados.etapa
  return (p?.tipo === 'abrir_chamado' && (etapa === 'local' || etapa === 'detalhes')) || (p?.tipo === 'envio' && etapa === 'titulo')
}
