'use server'

import { revalidatePath } from 'next/cache'
import { requirePermissao, requireWorkspace } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import {
  ehNivel, ehStatus, efeitosDaMudanca, podeMudar, podeReabrir, prazos, prioridade, ROTULO_DA_PRIORIDADE,
  ROTULO_DO_STATUS, ROTULO_DO_STATUS_PARA_EQUIPE, slaDaFila, PRIORIDADES, ENCERRADOS, type Status,
} from '@/lib/chamados/regras'
import {
  avisarSobreChamado, carregarChamado, equipeDaFila, filasQueAtendo, lerAnexos, papeisNoChamado, registrarAnexos,
  type ChamadoCarregado,
} from '@/lib/chamados/servidor'

/**
 * Chamados (docs/CHAMADOS.md).
 *
 * Toda escrita passa por aqui, com o service role: o banco não aceita
 * insert/update das tabelas de chamados pela Data API. Então CADA action
 * confere quem é a pessoa neste chamado (quem abriu, equipe da fila, admin)
 * antes de mudar qualquer coisa — é esta conferência que substitui o RLS de
 * escrita. As regras de status, prioridade e prazo vêm de lib/chamados/regras.ts.
 */

type Resultado = { erro?: string; recado?: string; id?: string }
const texto = (f: FormData, k: string, max = 10_000) => String(f.get(k) ?? '').trim().slice(0, max)
type Admin = ReturnType<typeof createAdminClient>

function revalidar(id?: string) {
  revalidatePath('/chamados')
  if (id) revalidatePath(`/chamados/${id}`)
}

async function evento(admin: Admin, c: { workspace_id: string; id: string }, autorId: string | null, dados: Record<string, unknown>, textoDoEvento?: string | null) {
  await admin.from('chamado_interacoes').insert({ workspace_id: c.workspace_id, chamado_id: c.id, autor_id: autorId, tipo: 'evento', texto: textoDoEvento ?? null, dados })
}

/** Carrega o chamado e diz o papel de quem pede. Sem papel, "não encontrado". */
async function contextoDoChamado(formData: FormData) {
  const context = await requireWorkspace()
  const admin = createAdminClient()
  const c = await carregarChamado(admin, context.workspace.id, texto(formData, 'chamadoId', 60))
  const atendo = await filasQueAtendo(admin, context.workspace.id, context.user.id, context.role)
  const papeis = c ? papeisNoChamado(c, context.user.id, atendo) : []
  // Mesma resposta para "não existe" e "não é seu": não confirma que existe.
  if (!c || !papeis.length) throw new Error('Chamado não encontrado.')
  return { context, admin, c, papeis, atendo, equipe: papeis.includes('equipe'), solicitante: papeis.includes('solicitante') }
}

// ------------------------------------------------------------------ abrir

export async function abrirChamado(formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const admin = createAdminClient()
    const filaId = texto(formData, 'filaId', 60)
    const { data: fila } = await admin.from('chamado_filas').select('id, nome, ativa, sla, atendimento_24h')
      .eq('workspace_id', context.workspace.id).eq('id', filaId).maybeSingle()
    if (!fila || !fila.ativa) throw new Error('Escolha para qual equipe é o chamado.')
    const { data: categoria } = await admin.from('chamado_categorias').select('id, nome, tipo, pede_local, ativa')
      .eq('fila_id', fila.id).eq('id', texto(formData, 'categoriaId', 60)).maybeSingle()
    if (!categoria || !categoria.ativa) throw new Error('Escolha o assunto do chamado.')

    const titulo = texto(formData, 'titulo', 140).replace(/\s+/g, ' ')
    const descricao = texto(formData, 'descricao')
    const local = texto(formData, 'local', 140) || null
    const urgencia = Number(formData.get('urgencia'))
    if (titulo.length < 3) throw new Error('Resuma o problema no título (pelo menos 3 letras).')
    if (descricao.length < 5) throw new Error('Descreva o que está acontecendo.')
    if (!ehNivel(urgencia)) throw new Error('Diga o quanto isso atrapalha.')
    if (categoria.pede_local && !local) throw new Error('Informe o local (sala, andar ou setor).')

    const impacto = 1 as const
    const p = prioridade(urgencia, impacto)
    const agora = new Date()
    const prazo = prazos(agora, p, slaDaFila(fila.sla), fila.atendimento_24h)
    const membro = context.memberships.find((m: { workspaces: unknown }) => {
      const w = Array.isArray(m.workspaces) ? m.workspaces[0] : m.workspaces
      return (w as { id?: string } | null)?.id === context.workspace.id
    }) as { coordination?: string | null } | undefined

    const { data: criado, error } = await admin.from('chamados').insert({
      workspace_id: context.workspace.id, fila_id: fila.id, categoria_id: categoria.id,
      // numero e codigo são do gatilho de numeração; estes valores são descartados.
      numero: 0, codigo: '',
      tipo: categoria.tipo, titulo, descricao, local, urgencia, impacto, prioridade: p,
      solicitante_id: context.user.id, setor_solicitante: membro?.coordination ?? null,
      prazo_resposta: prazo.resposta.toISOString(), prazo_solucao: prazo.solucao.toISOString(),
    }).select('id, codigo, workspace_id').single()
    if (error || !criado) throw new Error('Não foi possível abrir o chamado.')

    await evento(admin, criado, context.user.id, { acao: 'aberto', prioridade: p })
    await registrarAnexos(admin, { workspaceId: context.workspace.id, chamadoId: criado.id, interacaoId: null, autorId: context.user.id, interno: false, anexos: lerAnexos(formData) })
      .catch(async (causa) => {
        // O chamado vale sem o anexo: melhor abrir e avisar do que perder o relato.
        await evento(admin, criado, null, { acao: 'anexo_recusado' }, causa instanceof Error ? causa.message : null)
      })

    await avisarSobreChamado(admin, {
      workspaceId: context.workspace.id, chamado: { id: criado.id, codigo: criado.codigo, titulo }, atorId: context.user.id,
      para: await equipeDaFila(admin, context.workspace.id, fila.id),
      titulo: 'Chamado novo', mensagem: `${context.profile?.full_name ?? 'Alguém'} abriu um chamado em ${fila.nome} (${categoria.nome}), prioridade ${ROTULO_DA_PRIORIDADE[p].toLowerCase()}.`,
      citacao: descricao.slice(0, 600),
    })
    revalidar()
    return { id: criado.id, recado: `Chamado ${criado.codigo} aberto.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível abrir o chamado.') }
  }
}

// ------------------------------------------------------------------ conversa

export async function comentarChamado(formData: FormData): Promise<Resultado> {
  try {
    const { context, admin, c, equipe, solicitante } = await contextoDoChamado(formData)
    const corpo = texto(formData, 'texto')
    const anexos = lerAnexos(formData)
    const interno = formData.get('interno') === '1'
    if (!corpo && !anexos.length) throw new Error('Escreva a mensagem ou anexe um arquivo.')
    if (interno && !equipe) throw new Error('Nota interna é só para a equipe que atende.')
    if (ENCERRADOS.includes(c.status)) throw new Error('Este chamado está encerrado. Abra um novo, se precisar.')

    const { data: interacao, error } = await admin.from('chamado_interacoes').insert({
      workspace_id: c.workspace_id, chamado_id: c.id, autor_id: context.user.id, tipo: interno ? 'nota_interna' : 'comentario', texto: corpo || null,
    }).select('id').single()
    if (error || !interacao) throw new Error('Não foi possível enviar a mensagem.')
    if (anexos.length) await registrarAnexos(admin, { workspaceId: c.workspace_id, chamadoId: c.id, interacaoId: interacao.id, autorId: context.user.id, interno, anexos })

    const agora = new Date()
    const patch: Record<string, unknown> = { atualizado_em: agora.toISOString() }
    // A primeira resposta pública da equipe para o relógio de "1ª resposta".
    if (equipe && !interno && !c.respondido_em && c.solicitante_id !== context.user.id) patch.respondido_em = agora.toISOString()
    // Quem abriu respondeu o que a equipe pediu: o chamado volta para a equipe.
    let voltou = false
    if (solicitante && !equipe && c.status === 'aguardando_solicitante') {
      Object.assign(patch, await patchDeStatus(c, 'em_atendimento', agora, false))
      voltou = true
    }
    await admin.from('chamados').update(patch).eq('id', c.id)
    if (voltou) await evento(admin, c, context.user.id, { acao: 'status', de: c.status, para: 'em_atendimento', automatico: true })

    if (!interno) {
      const daEquipe = equipe && c.solicitante_id !== context.user.id
      await avisarSobreChamado(admin, {
        workspaceId: c.workspace_id, chamado: c, atorId: context.user.id,
        para: daEquipe ? [c.solicitante_id] : c.responsavel_id ? [c.responsavel_id] : await equipeDaFila(admin, c.workspace_id, c.fila_id),
        titulo: daEquipe ? 'Nova resposta da equipe' : 'Nova mensagem de quem abriu',
        mensagem: `${context.profile?.full_name ?? 'Alguém'} escreveu no chamado.`, citacao: corpo || '(anexo)',
      })
    }
    revalidar(c.id)
    return { recado: interno ? 'Nota interna registrada.' : 'Mensagem enviada.' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível enviar a mensagem.') }
  }
}

// ------------------------------------------------------------------ status

async function patchDeStatus(c: ChamadoCarregado, para: Status, agora: Date, porEquipe: boolean) {
  const efeitos = efeitosDaMudanca({
    status: c.status, pausadoDesde: c.pausado_desde ? new Date(c.pausado_desde) : null, minutosPausados: c.minutos_pausados,
    respondidoEm: c.respondido_em ? new Date(c.respondido_em) : null, resolvidoEm: c.resolvido_em ? new Date(c.resolvido_em) : null, reaberturas: c.reaberturas,
  }, para, agora, { porEquipe, vinteQuatroHoras: c.fila.atendimento24h })
  const patch: Record<string, unknown> = { status: para, atualizado_em: agora.toISOString() }
  if ('pausadoDesde' in efeitos) patch.pausado_desde = efeitos.pausadoDesde?.toISOString() ?? null
  if ('respondidoEm' in efeitos) patch.respondido_em = efeitos.respondidoEm?.toISOString()
  if ('resolvidoEm' in efeitos) patch.resolvido_em = efeitos.resolvidoEm?.toISOString() ?? null
  if ('fechadoEm' in efeitos) patch.fechado_em = efeitos.fechadoEm?.toISOString() ?? null
  if ('reaberturas' in efeitos) patch.reaberturas = efeitos.reaberturas
  if ('minutosPausados' in efeitos) {
    // Saiu da pausa: os prazos andam o tempo parado.
    patch.minutos_pausados = efeitos.minutosPausados
    const pz = prazos(new Date(c.criado_em), c.prioridade, c.fila.sla, c.fila.atendimento24h, efeitos.minutosPausados)
    patch.prazo_resposta = pz.resposta.toISOString()
    patch.prazo_solucao = pz.solucao.toISOString()
  }
  return patch
}

export async function mudarStatusDoChamado(formData: FormData): Promise<Resultado> {
  try {
    const { context, admin, c, papeis, equipe } = await contextoDoChamado(formData)
    const para = texto(formData, 'status', 40)
    if (!ehStatus(para)) throw new Error('Status desconhecido.')
    if (para === c.status) return { recado: 'Nada mudou.' }
    if (!podeMudar(c.status, para, papeis)) throw new Error(`Não é possível passar de "${ROTULO_DO_STATUS[c.status]}" para "${ROTULO_DO_STATUS[para]}".`)

    const nota = texto(formData, 'texto', 5000)
    const reabrindo = c.status === 'resolvido' && para === 'em_atendimento'
    if (para === 'resolvido' && nota.length < 5) throw new Error('Descreva a solução: é o que quem abriu vai ler para confirmar.')
    if (reabrindo && !equipe) {
      if (!podeReabrir(c.resolvido_em ? new Date(c.resolvido_em) : null)) throw new Error('O prazo para reabrir passou. Abra um novo chamado e cite este.')
      if (nota.length < 3) throw new Error('Diga o que ainda não foi resolvido.')
    }
    if (para === 'cancelado' && nota.length < 3) throw new Error('Diga o motivo do cancelamento.')

    const agora = new Date()
    const patch = await patchDeStatus(c, para, agora, equipe && c.solicitante_id !== context.user.id)
    if (para === 'resolvido') patch.solucao = nota
    // Quem da equipe começa a atender um chamado sem dono passa a ser o dono.
    if (equipe && para === 'em_atendimento' && !c.responsavel_id && !reabrindo) patch.responsavel_id = context.user.id

    // Só muda se ninguém mudou antes (duas pessoas clicando ao mesmo tempo).
    const { data: mudou, error } = await admin.from('chamados').update(patch).eq('id', c.id).eq('status', c.status).select('id').maybeSingle()
    if (error) throw new Error('Não foi possível mudar o status.')
    if (!mudou) throw new Error('O chamado mudou enquanto você olhava. Recarregue a página.')
    await evento(admin, c, context.user.id, { acao: 'status', de: c.status, para, reabertura: reabrindo || undefined }, nota || null)

    const nome = context.profile?.full_name ?? 'Alguém'
    const aviso: Partial<Record<Status, { para: (string | null)[]; titulo: string; mensagem: string; botao?: string }>> = {
      aguardando_solicitante: { para: [c.solicitante_id], titulo: 'A equipe precisa de você', mensagem: `${nome} pediu uma informação para continuar o atendimento. O prazo fica pausado até você responder.`, botao: 'Responder' },
      resolvido: { para: [c.solicitante_id], titulo: 'Chamado resolvido', mensagem: `${nome} marcou o chamado como resolvido. Confirme e avalie o atendimento — ou reabra, se o problema continuar.`, botao: 'Confirmar ou reabrir' },
      cancelado: { para: equipe ? [c.solicitante_id] : [c.responsavel_id], titulo: 'Chamado cancelado', mensagem: `${nome} cancelou o chamado.` },
      em_atendimento: reabrindo ? { para: [c.responsavel_id ?? null], titulo: 'Chamado reaberto', mensagem: `${nome} reabriu o chamado.` } : undefined,
    }
    const a = aviso[para]
    if (a) await avisarSobreChamado(admin, { workspaceId: c.workspace_id, chamado: c, atorId: context.user.id, para: a.para, titulo: a.titulo, mensagem: a.mensagem, citacao: nota || null, botao: a.botao })
    if (reabrindo && !c.responsavel_id) {
      await avisarSobreChamado(admin, { workspaceId: c.workspace_id, chamado: c, atorId: context.user.id, para: await equipeDaFila(admin, c.workspace_id, c.fila_id), titulo: 'Chamado reaberto', mensagem: `${nome} reabriu o chamado.`, citacao: nota })
    }
    revalidar(c.id)
    return { recado: `Status: ${(equipe ? ROTULO_DO_STATUS_PARA_EQUIPE : ROTULO_DO_STATUS)[para]}.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mudar o status.') }
  }
}

/** Quem abriu confirma a solução (fecha) e avalia de 1 a 5. */
export async function avaliarChamado(formData: FormData): Promise<Resultado> {
  try {
    const { context, admin, c, solicitante } = await contextoDoChamado(formData)
    if (!solicitante) throw new Error('Só quem abriu o chamado avalia o atendimento.')
    const nota = Number(formData.get('nota'))
    if (![1, 2, 3, 4, 5].includes(nota)) throw new Error('Escolha uma nota de 1 a 5.')
    if (c.status !== 'resolvido' && c.status !== 'fechado') throw new Error('Só dá para avaliar depois de resolvido.')
    if (c.avaliacao) throw new Error('Este atendimento já foi avaliado.')
    const comentario = texto(formData, 'comentario', 1000) || null
    const agora = new Date()
    const patch: Record<string, unknown> = { avaliacao: nota, avaliacao_comentario: comentario, atualizado_em: agora.toISOString() }
    if (c.status === 'resolvido') Object.assign(patch, await patchDeStatus(c, 'fechado', agora, false))
    await admin.from('chamados').update(patch).eq('id', c.id)
    await evento(admin, c, context.user.id, { acao: 'avaliado', nota, fechou: c.status === 'resolvido' }, comentario)
    await avisarSobreChamado(admin, {
      workspaceId: c.workspace_id, chamado: c, atorId: context.user.id, para: [c.responsavel_id],
      titulo: `Avaliação: ${'★'.repeat(nota)}${'☆'.repeat(5 - nota)}`, mensagem: `${context.profile?.full_name ?? 'Quem abriu'} confirmou a solução e avaliou o atendimento com nota ${nota}.`, citacao: comentario,
    })
    revalidar(c.id)
    return { recado: 'Obrigado! Chamado fechado.' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar a avaliação.') }
  }
}

// ------------------------------------------------------------------ triagem (equipe)

export async function atribuirChamado(formData: FormData): Promise<Resultado> {
  try {
    const { context, admin, c, equipe } = await contextoDoChamado(formData)
    if (!equipe) throw new Error('Só a equipe que atende define o responsável.')
    if (ENCERRADOS.includes(c.status)) throw new Error('Chamado encerrado.')
    const novo = texto(formData, 'responsavelId', 60) || null
    if (novo === c.responsavel_id) return { recado: 'Nada mudou.' }
    if (novo) {
      const atendeFila = await filasQueAtendo(admin, c.workspace_id, novo, await papelDe(admin, c.workspace_id, novo))
      if (!atendeFila.has(c.fila_id)) throw new Error('Essa pessoa não faz parte da equipe desta fila.')
    }
    await admin.from('chamados').update({ responsavel_id: novo, atualizado_em: new Date().toISOString() }).eq('id', c.id)
    await evento(admin, c, context.user.id, { acao: 'responsavel', de: c.responsavel_id, para: novo })
    if (novo) await avisarSobreChamado(admin, { workspaceId: c.workspace_id, chamado: c, atorId: context.user.id, para: [novo], titulo: 'Chamado atribuído a você', mensagem: `${context.profile?.full_name ?? 'Alguém'} deixou o chamado com você (prioridade ${ROTULO_DA_PRIORIDADE[c.prioridade].toLowerCase()}).` })
    revalidar(c.id)
    return { recado: novo ? 'Responsável definido.' : 'Chamado sem responsável.' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível definir o responsável.') }
  }
}

async function papelDe(admin: Admin, workspaceId: string, userId: string) {
  const { data } = await admin.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle()
  return (data?.role ?? 'colaborador') as 'admin' | 'editor' | 'colaborador'
}

/** A equipe avalia o impacto (GLPI): recalcula prioridade e prazos. */
export async function definirImpacto(formData: FormData): Promise<Resultado> {
  try {
    const { context, admin, c, equipe } = await contextoDoChamado(formData)
    if (!equipe) throw new Error('Só a equipe que atende avalia o impacto.')
    if (ENCERRADOS.includes(c.status)) throw new Error('Chamado encerrado.')
    const impacto = Number(formData.get('impacto'))
    if (!ehNivel(impacto)) throw new Error('Impacto inválido.')
    if (impacto === c.impacto) return { recado: 'Nada mudou.' }
    const p = prioridade(c.urgencia, impacto)
    const pz = prazos(new Date(c.criado_em), p, c.fila.sla, c.fila.atendimento24h, c.minutos_pausados)
    await admin.from('chamados').update({ impacto, prioridade: p, prazo_resposta: pz.resposta.toISOString(), prazo_solucao: pz.solucao.toISOString(), atualizado_em: new Date().toISOString() }).eq('id', c.id)
    await evento(admin, c, context.user.id, { acao: 'prioridade', de: c.prioridade, para: p, impacto })
    revalidar(c.id)
    return { recado: `Prioridade: ${ROTULO_DA_PRIORIDADE[p]}. Prazos recalculados.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mudar o impacto.') }
  }
}

/** Mandar para outra fila (ex.: o ar-condicionado da sala dos servidores). */
export async function transferirChamado(formData: FormData): Promise<Resultado> {
  try {
    const { context, admin, c, equipe } = await contextoDoChamado(formData)
    if (!equipe) throw new Error('Só a equipe que atende transfere o chamado.')
    if (ENCERRADOS.includes(c.status) || c.status === 'resolvido') throw new Error('Só dá para transferir chamado em aberto.')
    const { data: destino } = await admin.from('chamado_filas').select('id, nome, ativa, sla, atendimento_24h').eq('workspace_id', c.workspace_id).eq('id', texto(formData, 'filaId', 60)).maybeSingle()
    if (!destino || !destino.ativa || destino.id === c.fila_id) throw new Error('Escolha outra fila.')
    const { data: categoria } = await admin.from('chamado_categorias').select('id, tipo').eq('fila_id', destino.id).eq('id', texto(formData, 'categoriaId', 60)).maybeSingle()
    if (!categoria) throw new Error('Escolha o assunto na fila de destino.')
    const motivo = texto(formData, 'texto', 2000)
    if (motivo.length < 3) throw new Error('Diga por que está transferindo.')
    const pz = prazos(new Date(c.criado_em), c.prioridade, slaDaFila(destino.sla), destino.atendimento_24h, c.minutos_pausados)
    const { data: novo, error } = await admin.from('chamados').update({
      fila_id: destino.id, categoria_id: categoria.id, tipo: categoria.tipo, responsavel_id: null,
      prazo_resposta: pz.resposta.toISOString(), prazo_solucao: pz.solucao.toISOString(), atualizado_em: new Date().toISOString(),
    }).eq('id', c.id).select('codigo').single()
    if (error || !novo) throw new Error('Não foi possível transferir.')
    await evento(admin, c, context.user.id, { acao: 'transferido', de: c.fila.nome, para: destino.nome, codigo_anterior: c.codigo, codigo_novo: novo.codigo }, motivo)
    await avisarSobreChamado(admin, { workspaceId: c.workspace_id, chamado: { ...c, codigo: novo.codigo }, atorId: context.user.id, para: await equipeDaFila(admin, c.workspace_id, destino.id), titulo: 'Chamado transferido para a sua fila', mensagem: `${context.profile?.full_name ?? 'Alguém'} transferiu o chamado ${c.codigo} de ${c.fila.nome} para ${destino.nome}.`, citacao: motivo })
    await avisarSobreChamado(admin, { workspaceId: c.workspace_id, chamado: { ...c, codigo: novo.codigo }, atorId: context.user.id, para: [c.solicitante_id], titulo: 'Seu chamado mudou de equipe', mensagem: `O chamado foi encaminhado para ${destino.nome} e agora se chama ${novo.codigo}.` })
    revalidar(c.id)
    return { recado: `Transferido para ${destino.nome} como ${novo.codigo}.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível transferir.') }
  }
}

// ------------------------------------------------------------------ configuração (admin)

const SLUG = /^[a-z0-9-]{2,40}$/
const PREFIXO = /^[A-Z]{2,6}$/

export async function salvarFila(formData: FormData): Promise<Resultado> {
  try {
    const context = await requirePermissao('chamados.configurar')
    const admin = createAdminClient()
    const id = texto(formData, 'id', 60)
    const nome = texto(formData, 'nome', 60)
    const prefixo = texto(formData, 'prefixo', 6).toUpperCase()
    const descricao = texto(formData, 'descricao', 300) || null
    if (nome.length < 2) throw new Error('Dê um nome à fila.')
    if (!PREFIXO.test(prefixo)) throw new Error('O prefixo deve ter de 2 a 6 letras maiúsculas (ex.: TI, MAN).')
    const sla: Record<string, { resposta: number; solucao: number }> = {}
    for (const p of PRIORIDADES) {
      const r = Number(formData.get(`sla_${p}_resposta`)), s = Number(formData.get(`sla_${p}_solucao`))
      if (!(r > 0 && s > 0 && r <= s && s <= 2000)) throw new Error(`SLA de prioridade ${ROTULO_DA_PRIORIDADE[p].toLowerCase()}: a solução precisa ser maior ou igual à primeira resposta.`)
      sla[p] = { resposta: r, solucao: s }
    }
    const campos = { nome, prefixo, descricao, sla, atendimento_24h: formData.get('atendimento24h') === '1', ativa: formData.get('ativa') !== '0' }
    if (id) {
      const { error } = await admin.from('chamado_filas').update(campos).eq('workspace_id', context.workspace.id).eq('id', id)
      if (error) throw new Error(error.code === '23505' ? 'Já existe uma fila com esse prefixo.' : 'Não foi possível salvar a fila.')
    } else {
      const slug = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
      if (!SLUG.test(slug)) throw new Error('Nome de fila inválido.')
      const { error } = await admin.from('chamado_filas').insert({ ...campos, workspace_id: context.workspace.id, slug, ordem: 50 })
      if (error) throw new Error(error.code === '23505' ? 'Já existe uma fila com esse nome ou prefixo.' : 'Não foi possível criar a fila.')
    }
    revalidar()
    revalidatePath('/chamados/configurar')
    return { recado: 'Fila salva.' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar a fila.') }
  }
}

export async function definirEquipeDaFila(formData: FormData): Promise<Resultado> {
  try {
    const context = await requirePermissao('chamados.configurar')
    const admin = createAdminClient()
    const filaId = texto(formData, 'filaId', 60)
    const { data: fila } = await admin.from('chamado_filas').select('id').eq('workspace_id', context.workspace.id).eq('id', filaId).maybeSingle()
    if (!fila) throw new Error('Fila não encontrada.')
    const escolhidos = [...new Set(formData.getAll('membros').map(String))]
    const { data: membros } = await admin.from('workspace_members').select('user_id').eq('workspace_id', context.workspace.id).in('user_id', escolhidos.length ? escolhidos : ['00000000-0000-0000-0000-000000000000'])
    const validos = (membros ?? []).map((m) => m.user_id as string)
    await admin.from('chamado_fila_membros').delete().eq('fila_id', fila.id)
    if (validos.length) await admin.from('chamado_fila_membros').insert(validos.map((user_id) => ({ fila_id: fila.id, user_id, workspace_id: context.workspace.id })))
    await admin.from('auditoria_de_acesso').insert({ workspace_id: context.workspace.id, ator_id: context.user.id, alvo_id: null, acao: 'equipe_de_chamados_alterada', detalhes: { fila: fila.id, membros: validos.length } })
    revalidatePath('/chamados/configurar')
    return { recado: `Equipe salva (${validos.length} ${validos.length === 1 ? 'pessoa' : 'pessoas'}).` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar a equipe.') }
  }
}

export async function salvarCategoria(formData: FormData): Promise<Resultado> {
  try {
    const context = await requirePermissao('chamados.configurar')
    const admin = createAdminClient()
    const filaId = texto(formData, 'filaId', 60)
    const { data: fila } = await admin.from('chamado_filas').select('id').eq('workspace_id', context.workspace.id).eq('id', filaId).maybeSingle()
    if (!fila) throw new Error('Fila não encontrada.')
    const nome = texto(formData, 'nome', 80)
    if (nome.length < 2) throw new Error('Dê um nome ao assunto.')
    const tipo = texto(formData, 'tipo', 20) === 'incidente' ? 'incidente' : 'solicitacao'
    const campos = { nome, descricao: texto(formData, 'descricao', 200) || null, tipo, pede_local: formData.get('pedeLocal') === '1', ativa: formData.get('ativa') !== '0' }
    const id = texto(formData, 'id', 60)
    const { error } = id
      ? await admin.from('chamado_categorias').update(campos).eq('fila_id', fila.id).eq('id', id)
      : await admin.from('chamado_categorias').insert({ ...campos, fila_id: fila.id, workspace_id: context.workspace.id, ordem: 50 })
    if (error) throw new Error('Não foi possível salvar o assunto.')
    revalidatePath('/chamados/configurar')
    revalidatePath('/chamados/novo')
    return { recado: 'Assunto salvo.' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o assunto.') }
  }
}
