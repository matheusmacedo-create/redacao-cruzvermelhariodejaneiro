import 'server-only'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ehEquipeDaEscola } from '@/lib/permissoes'
import { armazenamento } from '@/lib/envios/servidor'
import { conexaoDoDrive, copiarDoR2ParaODrive, driveConectado, enviarAoDrive, garantirPasta } from '@/lib/google/drive'
import {
  TAMANHO_MAXIMO_NO_DRIVE, TEXTO_SEM_SETOR, caminhoDoEnvio, chaveDaPasta, descricaoDoArquivoDoEnvio, linkDaPasta, nomeDoArquivoNoDrive, normalizarCaminho, podeGuardarEm, tipoDoDocumento,
  type QuemGuarda,
} from '@/lib/google/drive-regras'
import type { Autorizacao } from '@/lib/envios/regras'
import { baixarMidia, configDoWhatsapp, type ConfigDoWhatsapp } from './servidor'
import { encerrarPendencia, guardarPendencia, podeAgirPeloWhatsapp, type Pendencia, type Pessoa, type Resposta, type ResultadoDaAcao } from './acoes'
import { envioAberto } from './envio'
import type { DriveNoStatus, MensagemRecebida } from './regras'
import {
  TEXTO_DRIVE_DOIS_FATORES, TEXTO_DRIVE_ESCOLA, TEXTO_DRIVE_GRANDE, TEXTO_DRIVE_JA_GUARDADO, TEXTO_DRIVE_RESPONDA, TEXTO_DRIVE_TIPO, TEXTO_PASTA_NA_LEGENDA,
  documentoDosDados, lerLegendaDeGuardar, lerPastaDaResposta, textoDoGuardado, textoPedeAPasta, type DocumentoRecebido,
} from './drive-regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O Google Drive no WhatsApp do Palácio (a conexão e as pastas: lib/google/drive.ts; as regras: ./drive-regras.ts e
 * lib/google/drive-regras.ts). Sem o Drive conectado (ou sem a migração dele), nada aqui muda o bot.
 *
 *  - Cópia dos envios: quando um envio de fotos e vídeos que veio do WhatsApp é concluído (lib/whatsapp/envio.ts), os
 *    arquivos do R2 vão para "Palácio – Arquivos/Envios do WhatsApp/AAAA-MM/<título> (ENV-…)" depois da resposta
 *    (after), com a autorização de imagem na descrição de cada arquivo. Só a conclusão que virou o estado agenda a
 *    cópia; a vez de quem copia (envios.drive_copia_em) e a marca de cada arquivo (envio_arquivos.drive_arquivo_id)
 *    não deixam duplicar, e a rotina diária retoma o que caiu no meio. O link da pasta fica no envio.
 *  - Guardar documento: o documento (não foto nem vídeo) de quem é da equipe e pode agir pelo WhatsApp (a regra de
 *    sempre: sem a verificação em duas etapas) vai para a pasta que ela disser — na legenda ("guardar em
 *    Financeiro/2026"), na resposta à pergunta do bot ou pelo assistente (preparar_guardar_no_drive, com o plano e
 *    o "confirmo"). Cada pessoa guarda só sob a pasta do próprio setor; quem administra, em qualquer lugar da raiz.
 *    O arquivo é baixado da Kapso na hora de guardar (nada fica no R2 esperando) e a resposta traz o link.
 *  - O "status" de quem administra ganha a linha do Drive.
 *
 * Nunca lança: falha vira o texto da resposta (ou o log, na cópia que roda depois da resposta).
 */

/** O envio criado pelo bot (envio.ts): é por ele que a retomada acha os envios do WhatsApp. */
const AGENTE_DO_BOT = 'WhatsApp (bot do Palácio Virtual)'
/** Uma cópia que começou e não terminou em tanto tempo pode ser retomada por outra. */
const COPIA_PRESA_MIN = 15

const semColuna = (error: { code?: string } | null) => error?.code === 'PGRST204' || error?.code === '42703'

// ------------------------------------------------------------------ quem guarda onde

/**
 * Os setores ativos da pessoa (Pessoas → Setores: setor_membros, e a coordenação que bate com o nome de um setor) e
 * se ela administra o espaço. É o que podeGuardarEm confere.
 */
export async function quemGuarda(admin: Admin, workspaceId: string, pessoa: Pessoa): Promise<QuemGuarda> {
  try {
    const [{ data: membros }, { data: setores }, { data: vinculo }] = await Promise.all([
      admin.from('setor_membros').select('setor_id').eq('workspace_id', workspaceId).eq('user_id', pessoa.id),
      admin.from('setores').select('id, nome, ativo').eq('workspace_id', workspaceId),
      admin.from('workspace_members').select('coordination').eq('workspace_id', workspaceId).eq('user_id', pessoa.id).maybeSingle(),
    ])
    const ativos = (setores ?? []).filter((s) => s.ativo !== false) as { id: string; nome: string }[]
    const ids = new Set((membros ?? []).map((m) => m.setor_id as string))
    const coordenacao = chaveDaPasta(String(vinculo?.coordination ?? ''))
    const deles = ativos.filter((s) => ids.has(s.id) || (coordenacao && chaveDaPasta(s.nome) === coordenacao)).map((s) => String(s.nome))
    return { administra: pessoa.papel === 'admin', setores: [...new Set(deles)].sort((a, b) => a.localeCompare(b, 'pt-BR')) }
  } catch {
    return { administra: pessoa.papel === 'admin', setores: [] }
  }
}

/** Onde a pessoa guarda e se o Drive está conectado agora (o preparo e a revalidação do passo do assistente). */
export async function ondeGuarda(admin: Admin, workspaceId: string, pessoa: Pessoa): Promise<QuemGuarda & { conectado: boolean }> {
  const [conectado, quem] = await Promise.all([driveConectado(admin, workspaceId), quemGuarda(admin, workspaceId, pessoa)])
  return { ...quem, conectado }
}

// ------------------------------------------------------------------ guardar um documento

/**
 * Guarda o documento que chegou ao WhatsApp na pasta (o caminho já normalizado e conferido): baixa da Kapso, garante
 * as pastas, manda ao Drive e deixa a trilha. `nome`: o nome pedido (senão, o que veio). Devolve ResultadoDaAcao,
 * com o link do arquivo — é também o executor do passo do assistente (executores.ts).
 */
export async function guardarDocumento(admin: Admin, workspaceId: string, pessoa: Pessoa, doc: DocumentoRecebido, partes: readonly string[], opcoes: {
  config?: ConfigDoWhatsapp | null; nome?: string | null; via?: 'legenda' | 'pergunta' | 'assistente'; planoId?: string | null
} = {}): Promise<ResultadoDaAcao> {
  try {
    const config = opcoes.config ?? await configDoWhatsapp(workspaceId)
    if (!config) return { ok: false, codigo: 'indisponivel', texto: 'O WhatsApp do Palácio não está configurado agora.' }
    const baixado = await baixarMidia(config, doc.arquivo, TAMANHO_MAXIMO_NO_DRIVE, doc.endereco)
    if (!baixado.ok) return { ok: false, codigo: 'erro', texto: `Não consegui pegar o documento (${baixado.erro}). Mande de novo.` }
    const pasta = await garantirPasta(workspaceId, partes)
    if (!pasta.ok) return { ok: false, codigo: pasta.reconectar ? 'indisponivel' : 'erro', texto: pasta.erro }
    const nome = nomeDoArquivoNoDrive(doc.nome, opcoes.nome, doc.extensao)
    const descricao = `Guardado pelo WhatsApp do Palácio por ${String(pessoa.nome ?? 'alguém da equipe').slice(0, 120)}.`
    const arquivo = await enviarAoDrive(workspaceId, { pastaId: pasta.id, nome, mime: baixado.mime || doc.mime, conteudo: baixado.conteudo, descricao })
    if (!arquivo.ok) return { ok: false, codigo: arquivo.reconectar ? 'indisponivel' : 'erro', texto: arquivo.erro }
    // A pergunta da pasta deste documento, se ainda estiver aberta, acaba aqui.
    await admin.from('whatsapp_pendencias').update({ encerrada_em: new Date().toISOString() }).eq('user_id', pessoa.id).eq('tipo', 'guardar_documento')
      .is('encerrada_em', null).eq('dados->documento->>mensagemId', doc.mensagemId)
    await admin.from('activity_log').insert({
      workspace_id: workspaceId, actor_id: pessoa.id, action: 'drive_documento_guardado', entity_type: 'drive_arquivo', entity_id: null,
      metadata: { canal: 'whatsapp', via: opcoes.via ?? 'legenda', caminho: partes.join('/'), arquivo_id: arquivo.id, nome: nome.slice(0, 120), ...(opcoes.planoId ? { plano_id: opcoes.planoId } : {}) },
    })
    return { ok: true, codigo: 'feito', texto: textoDoGuardado({ nome, partes, link: arquivo.link }), link: arquivo.link }
  } catch (causa) {
    console.error('[whatsapp] drive: documento não guardado:', causa instanceof Error ? causa.message : causa)
    return { ok: false, codigo: 'erro', texto: 'Não consegui guardar o documento agora. Tente de novo daqui a pouco.' }
  }
}

/** O documento da mensagem, como a pergunta e o passo guardam; null se não é um documento que se guarda. */
function documentoDaMensagem(m: MensagemRecebida): DocumentoRecebido | null {
  const midia = m.midia
  if (!midia || midia.categoria !== 'documento' || !m.id) return null
  const tipo = tipoDoDocumento(midia.nome, midia.mime)
  if (!tipo || (!midia.arquivo && !midia.endereco)) return null
  return {
    mensagemId: m.id, arquivo: midia.arquivo ?? '', endereco: midia.endereco ?? null, nome: midia.nome ?? `documento.${tipo.extensao}`, mime: midia.mime,
    tamanho: midia.tamanho, tipo: tipo.rotulo, extensao: tipo.extensao,
  }
}

/**
 * Para onde vai o documento que chegou (antes do registro, que marca o comando): null = o caminho de sempre (o Drive
 * não está conectado, não é documento, ou há um envio de fotos aberto e a legenda não pede o Drive); "guardar" = a
 * legenda diz a pasta; "assistente" = a legenda pede algo com outras palavras e o assistente pode preparar ações para
 * a pessoa; "perguntar" = sem legenda (ou sem o assistente), o bot pergunta a pasta.
 */
export async function destinoDoDocumento(admin: Admin, workspaceId: string, pessoa: Pessoa, m: MensagemRecebida, opcoes: { assistente: boolean }): Promise<'guardar' | 'assistente' | 'perguntar' | null> {
  try {
    if (m.midia?.categoria !== 'documento') return null
    const legenda = lerLegendaDeGuardar(m.texto)
    if (!legenda && await envioAberto(admin, pessoa.id)) return null
    if (!await driveConectado(admin, workspaceId)) return null
    if (legenda) return 'guardar'
    return m.texto.trim() && opcoes.assistente ? 'assistente' : 'perguntar'
  } catch {
    return null
  }
}

export type DocumentoAtendido = { tipo: 'resposta'; resposta: Resposta } | { tipo: 'assistente' }

/**
 * O documento que chegou, já com o destino: guarda (a legenda diz a pasta), pergunta a pasta (a pergunta vai na
 * resposta; o bot a guarda antes de enviar), ou deixa a pergunta guardada para o assistente, que lê o documento no
 * contexto. As cercas de sempre antes: a equipe da Escola, a verificação em duas etapas, o tipo e o tamanho.
 */
export async function receberDocumento(admin: Admin, workspaceId: string, pessoa: Pessoa, m: MensagemRecebida, config: ConfigDoWhatsapp, destino: 'guardar' | 'assistente' | 'perguntar'): Promise<DocumentoAtendido> {
  const responder = (texto: string): DocumentoAtendido => ({ tipo: 'resposta', resposta: { texto } })
  if (ehEquipeDaEscola(pessoa.papel)) return responder(TEXTO_DRIVE_ESCOLA)
  if (!await podeAgirPeloWhatsapp(admin, workspaceId, pessoa)) return responder(TEXTO_DRIVE_DOIS_FATORES)
  const doc = documentoDaMensagem(m)
  if (!doc) return responder(TEXTO_DRIVE_TIPO)
  if (doc.tamanho && doc.tamanho > TAMANHO_MAXIMO_NO_DRIVE) return responder(TEXTO_DRIVE_GRANDE)
  const quem = await quemGuarda(admin, workspaceId, pessoa)

  if (destino === 'guardar') {
    const caminho = normalizarCaminho(lerLegendaDeGuardar(m.texto) ?? '')
    if (!caminho.ok) return responder(`${caminho.erro} Mande o documento de novo com a pasta na legenda.`)
    const pode = podeGuardarEm(caminho.partes, quem)
    if (!pode.ok) return responder(`${pode.erro} Mande o documento de novo com a pasta na legenda.`)
    return responder((await guardarDocumento(admin, workspaceId, pessoa, doc, pode.partes, { config, via: 'legenda' })).texto)
  }

  if (!quem.administra && !quem.setores.length) return responder(TEXTO_SEM_SETOR)
  const pergunta = { tipo: 'guardar_documento' as const, dados: { etapa: 'pasta', documento: doc } }
  if (destino === 'assistente') {
    // A pergunta fica guardada (é dela que o contexto do assistente lê o documento); a resposta é do assistente.
    const id = await guardarPendencia(admin, workspaceId, pessoa.id, pergunta)
    return id ? { tipo: 'assistente' } : responder(TEXTO_PASTA_NA_LEGENDA)
  }
  return { tipo: 'resposta', resposta: { texto: textoPedeAPasta({ documento: doc, setores: quem.setores, administra: quem.administra }), pergunta, semPergunta: TEXTO_PASTA_NA_LEGENDA } }
}

/**
 * A resposta à pergunta da pasta. O que não tem cara de caminho: com a pergunta citada, pede de novo; sem citar,
 * devolve null (segue como mensagem comum — e, com o assistente, vai a ele, que vê o documento no contexto).
 */
export async function seguirGuardarDocumento(admin: Admin, workspaceId: string, pessoa: Pessoa, p: Pendencia, texto: string, estrita: boolean): Promise<Resposta | null> {
  const doc = documentoDosDados((p.dados as { documento?: unknown }).documento)
  if (!doc) {
    await encerrarPendencia(admin, p.id)
    return { texto: 'Não achei mais o documento desta pergunta. Mande de novo.' }
  }
  const pasta = lerPastaDaResposta(texto)
  if (!pasta) return estrita ? { texto: TEXTO_DRIVE_RESPONDA } : null
  const caminho = normalizarCaminho(pasta)
  if (!caminho.ok) return { texto: `${caminho.erro} ${TEXTO_DRIVE_RESPONDA}` }
  const pode = podeGuardarEm(caminho.partes, await quemGuarda(admin, workspaceId, pessoa))
  if (!pode.ok) return { texto: `${pode.erro} ${TEXTO_DRIVE_RESPONDA}` }
  // Ligou a verificação em duas etapas depois da pergunta: fica de fora, como na chegada.
  if (!await podeAgirPeloWhatsapp(admin, workspaceId, pessoa)) {
    await encerrarPendencia(admin, p.id)
    return { texto: TEXTO_DRIVE_DOIS_FATORES }
  }
  // Duas respostas seguidas (reenvio, toque duplo) chegam em paralelo: só uma guarda.
  if (!await encerrarPendencia(admin, p.id)) return { texto: TEXTO_DRIVE_JA_GUARDADO }
  return { texto: (await guardarDocumento(admin, workspaceId, pessoa, doc, pode.partes, { via: 'pergunta' })).texto }
}

/** O documento que espera a pasta (a pergunta aberta dos últimos 15 minutos): o contexto e o preparo do assistente leem daqui. */
export async function documentoEsperando(admin: Admin, workspaceId: string, userId: string): Promise<DocumentoRecebido | null> {
  try {
    const { data } = await admin.from('whatsapp_pendencias').select('dados').eq('workspace_id', workspaceId).eq('user_id', userId).eq('tipo', 'guardar_documento')
      .is('encerrada_em', null).gt('expira_em', new Date().toISOString()).order('criado_em', { ascending: false }).limit(1).maybeSingle()
    return data ? documentoDosDados((data.dados as { documento?: unknown } | null)?.documento) : null
  } catch {
    return null
  }
}

// ------------------------------------------------------------------ a cópia dos envios

/**
 * Copia para o Drive os arquivos de um envio do WhatsApp já concluído. Sem o Drive conectado, sem as colunas da
 * migração ou já copiado: nada. Toma a vez (drive_copia_em) antes; cada arquivo copiado ganha o id do Drive (a
 * retomada pula); o link da pasta só é gravado quando todos chegaram. Nunca lança.
 */
export async function copiarEnvioParaODrive(admin: Admin, envioId: string): Promise<'copiado' | 'sem_drive' | 'nada' | 'falhou'> {
  try {
    const { data: envio, error } = await admin.from('envios')
      .select('id, workspace_id, protocolo, titulo, nome, setor, autorizacao_imagem, concluido_em, estado, drive_pasta_link').eq('id', envioId).maybeSingle()
    if (error || !envio || envio.drive_pasta_link || envio.estado === 'recebendo' || !envio.concluido_em) return 'nada'
    const workspaceId = envio.workspace_id as string
    if (!await driveConectado(admin, workspaceId)) return 'sem_drive'
    const r2 = armazenamento()
    if (!r2) return 'falhou'
    // A vez de quem copia: uma só por envio; a que caiu no meio libera depois de COPIA_PRESA_MIN.
    const agora = new Date()
    const presa = new Date(agora.getTime() - COPIA_PRESA_MIN * 60_000).toISOString()
    const { data: vez, error: semVez } = await admin.from('envios').update({ drive_copia_em: agora.toISOString() }).eq('id', envioId).is('drive_pasta_link', null)
      .or(`drive_copia_em.is.null,drive_copia_em.lt.${presa}`).select('id').maybeSingle()
    if (semColuna(semVez) || !vez) return 'nada'

    const pasta = await garantirPasta(workspaceId, caminhoDoEnvio({ concluidoEm: envio.concluido_em as string, titulo: String(envio.titulo), protocolo: (envio.protocolo as string | null) ?? null }))
    if (!pasta.ok) {
      console.error('[whatsapp] drive: pasta do envio não criada:', envio.protocolo, pasta.erro)
      return 'falhou'
    }
    const descricao = descricaoDoArquivoDoEnvio({
      protocolo: (envio.protocolo as string | null) ?? null, titulo: String(envio.titulo), nome: String(envio.nome), setor: (envio.setor as string | null) ?? null,
      autorizacao: envio.autorizacao_imagem as Autorizacao,
    })
    const { data: arquivos } = await admin.from('envio_arquivos').select('id, chave, nome, tipo_mime, drive_arquivo_id').eq('envio_id', envioId).eq('estado', 'recebido').order('criado_em')
    for (const a of arquivos ?? []) {
      if (a.drive_arquivo_id) continue
      const copiado = await copiarDoR2ParaODrive(workspaceId, r2, a.chave as string, {
        pastaId: pasta.id, nome: String(a.nome), mime: (a.tipo_mime as string | null) || 'application/octet-stream', descricao,
      })
      if (!copiado.ok) {
        console.error('[whatsapp] drive: arquivo do envio não copiado:', envio.protocolo, copiado.erro)
        return 'falhou'
      }
      await admin.from('envio_arquivos').update({ drive_arquivo_id: copiado.id }).eq('id', a.id)
    }
    await admin.from('envios').update({ drive_pasta_link: pasta.link || linkDaPasta(pasta.id) }).eq('id', envioId)
    await admin.from('activity_log').insert({
      workspace_id: workspaceId, actor_id: null, action: 'envio_copiado_ao_drive', entity_type: 'envio', entity_id: envioId,
      metadata: { protocolo: envio.protocolo, arquivos: (arquivos ?? []).length },
    })
    return 'copiado'
  } catch (causa) {
    console.error('[whatsapp] drive: envio não copiado:', causa instanceof Error ? causa.message : causa)
    return 'falhou'
  }
}

/** A cópia do envio depois da resposta (after); fora de uma requisição (um script), na hora. */
export async function agendarCopiaDoEnvio(admin: Admin, envioId: string): Promise<void> {
  const copiar = async () => { await copiarEnvioParaODrive(admin, envioId) }
  try { after(copiar) } catch { await copiar() }
}

/**
 * A retomada da rotina diária: os envios do WhatsApp concluídos nos últimos 7 dias sem a cópia terminada (o after
 * que caiu no meio, o Drive que estava fora do ar). Poucos por vez: a rotina tem outras coisas a fazer.
 */
export async function copiarEnviosPendentes(admin: Admin, limite = 5): Promise<number> {
  try {
    const desde = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const { data, error } = await admin.from('envios').select('id').is('drive_pasta_link', null).not('concluido_em', 'is', null).gte('concluido_em', desde)
      .eq('user_agent', AGENTE_DO_BOT).order('concluido_em').limit(limite)
    if (error) return 0
    let copiados = 0
    for (const e of data ?? []) if (await copiarEnvioParaODrive(admin, e.id as string) === 'copiado') copiados++
    return copiados
  } catch {
    return 0
  }
}

// ------------------------------------------------------------------ o "status"

/** A linha do Drive no "status": conectado (com a pasta raiz), expirado ou sem conexão; null = não deu para ler. */
export async function driveNoStatus(admin: Admin, workspaceId: string): Promise<DriveNoStatus | null> {
  const c = await conexaoDoDrive(admin, workspaceId)
  if (!c.ok) return null
  if (!c.conexao) return 'sem_conexao'
  return { estado: c.conexao.estado, conta: c.conexao.email, pastaRaiz: Boolean(c.conexao.pastaRaizLink) }
}
