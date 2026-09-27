import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { datasDeFeriado } from '@/lib/apis-publicas/servidor'
import {
  ehNivel, efeitosDaMudanca, prazos, prioridade, slaDaFila, ENCERRADOS, ROTULO_DA_PRIORIDADE, type Quem, type Status,
} from './regras'
import { avisarSobreChamado, equipeDaFila, registrarAnexos, type AnexoPedido, type ChamadoCarregado } from './servidor'

/**
 * O que abrir e comentar um chamado fazem, sem a tela: as actions
 * (app/actions/chamados.ts) e o bot do WhatsApp (lib/whatsapp/acoes.ts)
 * passam por aqui, então a regra é uma só. Quem chama já conferiu QUEM é a
 * pessoa e o papel dela no chamado (papeisNoChamado); aqui se confere o
 * resto e se grava com o service role. Erro esperado sai como Error com a
 * mensagem para a pessoa.
 */

type Admin = ReturnType<typeof createAdminClient>

export async function evento(admin: Admin, c: { workspace_id: string; id: string }, autorId: string | null, dados: Record<string, unknown>, textoDoEvento?: string | null) {
  await admin.from('chamado_interacoes').insert({ workspace_id: c.workspace_id, chamado_id: c.id, autor_id: autorId, tipo: 'evento', texto: textoDoEvento ?? null, dados })
}

/** Feriados do ano passado ao próximo: um chamado pode atravessar a virada. */
export async function feriadosPerto(agora = new Date()) {
  const ano = agora.getFullYear()
  return datasDeFeriado([ano - 1, ano, ano + 1])
}

export async function patchDeStatus(c: ChamadoCarregado, para: Status, agora: Date, porEquipe: boolean) {
  const feriados = await feriadosPerto(agora)
  const efeitos = efeitosDaMudanca({
    status: c.status, pausadoDesde: c.pausado_desde ? new Date(c.pausado_desde) : null, minutosPausados: c.minutos_pausados,
    respondidoEm: c.respondido_em ? new Date(c.respondido_em) : null, resolvidoEm: c.resolvido_em ? new Date(c.resolvido_em) : null, reaberturas: c.reaberturas,
  }, para, agora, { porEquipe, vinteQuatroHoras: c.fila.atendimento24h, feriados })
  const patch: Record<string, unknown> = { status: para, atualizado_em: agora.toISOString() }
  if ('pausadoDesde' in efeitos) patch.pausado_desde = efeitos.pausadoDesde?.toISOString() ?? null
  if ('respondidoEm' in efeitos) patch.respondido_em = efeitos.respondidoEm?.toISOString()
  if ('resolvidoEm' in efeitos) patch.resolvido_em = efeitos.resolvidoEm?.toISOString() ?? null
  if ('fechadoEm' in efeitos) patch.fechado_em = efeitos.fechadoEm?.toISOString() ?? null
  if ('reaberturas' in efeitos) patch.reaberturas = efeitos.reaberturas
  if ('minutosPausados' in efeitos) {
    // Saiu da pausa: os prazos andam o tempo parado.
    patch.minutos_pausados = efeitos.minutosPausados
    const pz = prazos(new Date(c.criado_em), c.prioridade, c.fila.sla, c.fila.atendimento24h, efeitos.minutosPausados, feriados)
    patch.prazo_resposta = pz.resposta.toISOString()
    patch.prazo_solucao = pz.solucao.toISOString()
  }
  return patch
}

export type Autor = { id: string; nome: string | null }

// ------------------------------------------------------------------ abrir

export async function criarChamado(admin: Admin, p: {
  workspaceId: string
  autor: Autor & { setor: string | null }
  filaId: string
  categoriaId: string
  titulo: string
  descricao: string
  local: string | null
  urgencia: number
  anexos?: AnexoPedido[]
}): Promise<{ id: string; codigo: string; semAnexo: boolean }> {
  const { data: fila } = await admin.from('chamado_filas').select('id, nome, ativa, sla, atendimento_24h')
    .eq('workspace_id', p.workspaceId).eq('id', p.filaId).maybeSingle()
  if (!fila || !fila.ativa) throw new Error('Escolha para qual equipe é o chamado.')
  const { data: categoria } = await admin.from('chamado_categorias').select('id, nome, tipo, pede_local, ativa')
    .eq('fila_id', fila.id).eq('id', p.categoriaId).maybeSingle()
  if (!categoria || !categoria.ativa) throw new Error('Escolha o assunto do chamado.')

  const titulo = p.titulo.trim().slice(0, 140).replace(/\s+/g, ' ')
  const descricao = p.descricao.trim()
  const local = p.local?.trim().slice(0, 140) || null
  const urgencia = p.urgencia
  if (titulo.length < 3) throw new Error('Resuma o problema no título (pelo menos 3 letras).')
  if (descricao.length < 5) throw new Error('Descreva o que está acontecendo.')
  if (!ehNivel(urgencia)) throw new Error('Diga o quanto isso atrapalha.')
  if (categoria.pede_local && !local) throw new Error('Informe o local (sala, andar ou setor).')

  const impacto = 1 as const
  const pr = prioridade(urgencia, impacto)
  const agora = new Date()
  const prazo = prazos(agora, pr, slaDaFila(fila.sla), fila.atendimento_24h, 0, await feriadosPerto(agora))

  const { data: criado, error } = await admin.from('chamados').insert({
    workspace_id: p.workspaceId, fila_id: fila.id, categoria_id: categoria.id,
    // numero e codigo são do gatilho de numeração; estes valores são descartados.
    numero: 0, codigo: '',
    tipo: categoria.tipo, titulo, descricao, local, urgencia, impacto, prioridade: pr,
    solicitante_id: p.autor.id, setor_solicitante: p.autor.setor,
    prazo_resposta: prazo.resposta.toISOString(), prazo_solucao: prazo.solucao.toISOString(),
  }).select('id, codigo, workspace_id').single()
  if (error || !criado) throw new Error('Não foi possível abrir o chamado.')

  await evento(admin, criado, p.autor.id, { acao: 'aberto', prioridade: pr })
  let semAnexo = false
  if (p.anexos?.length) {
    await registrarAnexos(admin, { workspaceId: p.workspaceId, chamadoId: criado.id, interacaoId: null, autorId: p.autor.id, interno: false, anexos: p.anexos })
      .catch(async (causa) => {
        // O chamado vale sem o anexo: melhor abrir e avisar do que perder o relato.
        semAnexo = true
        await evento(admin, criado, null, { acao: 'anexo_recusado' }, causa instanceof Error ? causa.message : null)
      })
  }

  await avisarSobreChamado(admin, {
    workspaceId: p.workspaceId, chamado: { id: criado.id, codigo: criado.codigo, titulo }, atorId: p.autor.id,
    para: await equipeDaFila(admin, p.workspaceId, fila.id),
    titulo: 'Chamado novo', mensagem: `${p.autor.nome ?? 'Alguém'} abriu um chamado em ${fila.nome} (${categoria.nome}), prioridade ${ROTULO_DA_PRIORIDADE[pr].toLowerCase()}.`,
    citacao: descricao.slice(0, 600),
  })
  return { id: criado.id as string, codigo: criado.codigo as string, semAnexo }
}

// ------------------------------------------------------------------ conversa

export async function comentarNoChamado(admin: Admin, p: {
  c: ChamadoCarregado
  autor: Autor
  papeis: Quem[]
  texto: string
  interno?: boolean
  anexos?: AnexoPedido[]
}): Promise<void> {
  const { c, autor } = p
  const corpo = p.texto.trim()
  const anexos = p.anexos ?? []
  const interno = Boolean(p.interno)
  const equipe = p.papeis.includes('equipe')
  const solicitante = p.papeis.includes('solicitante')
  if (!corpo && !anexos.length) throw new Error('Escreva a mensagem ou anexe um arquivo.')
  if (interno && !equipe) throw new Error('Nota interna é só para a equipe que atende.')
  if (ENCERRADOS.includes(c.status)) throw new Error('Este chamado está encerrado. Abra um novo, se precisar.')

  const { data: interacao, error } = await admin.from('chamado_interacoes').insert({
    workspace_id: c.workspace_id, chamado_id: c.id, autor_id: autor.id, tipo: interno ? 'nota_interna' : 'comentario', texto: corpo || null,
  }).select('id').single()
  if (error || !interacao) throw new Error('Não foi possível enviar a mensagem.')
  if (anexos.length) await registrarAnexos(admin, { workspaceId: c.workspace_id, chamadoId: c.id, interacaoId: interacao.id, autorId: autor.id, interno, anexos })

  const agora = new Date()
  const patch: Record<string, unknown> = { atualizado_em: agora.toISOString() }
  // A primeira resposta pública da equipe para o relógio de "1ª resposta".
  if (equipe && !interno && !c.respondido_em && c.solicitante_id !== autor.id) patch.respondido_em = agora.toISOString()
  // Quem abriu respondeu o que a equipe pediu: o chamado volta para a equipe.
  let voltou = false
  if (solicitante && !equipe && c.status === 'aguardando_solicitante') {
    Object.assign(patch, await patchDeStatus(c, 'em_atendimento', agora, false))
    voltou = true
  }
  const { error: erroDoPatch } = await admin.from('chamados').update(patch).eq('id', c.id)
  // A mensagem já foi; se o relógio ou a volta do status falharem, fica no log.
  if (erroDoPatch) console.error('[chamados] comentário:', erroDoPatch.message)
  if (voltou && !erroDoPatch) await evento(admin, c, autor.id, { acao: 'status', de: c.status, para: 'em_atendimento', automatico: true })

  if (!interno) {
    const daEquipe = equipe && c.solicitante_id !== autor.id
    await avisarSobreChamado(admin, {
      workspaceId: c.workspace_id, chamado: c, atorId: autor.id,
      para: daEquipe ? [c.solicitante_id] : c.responsavel_id ? [c.responsavel_id] : await equipeDaFila(admin, c.workspace_id, c.fila_id),
      titulo: daEquipe ? 'Nova resposta da equipe' : 'Nova mensagem de quem abriu',
      mensagem: `${autor.nome ?? 'Alguém'} escreveu no chamado.`, citacao: corpo || '(anexo)',
    })
  }
}
