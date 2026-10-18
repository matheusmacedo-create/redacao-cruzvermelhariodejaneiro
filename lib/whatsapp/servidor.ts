import 'server-only'
import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterCampos } from '@/lib/integracoes/chaves'
import { urlBase } from '@/lib/newsletter/contexto'
import type { EstadoDaConexao, MotivoDaFalha } from './regras'
import {
  baixarMidiaKapso, enviarTextoKapso, ligarWebhookKapso, numeroIdValido, perfilConectadoKapso, situacaoDaConexaoKapso, situacaoDoWebhookKapso,
  type ConfigDaKapso,
} from './kapso'

/**
 * O WhatsApp do Palácio Virtual, pela Kapso (API oficial da Meta; o contrato
 * está em lib/whatsapp/kapso.ts). Quem chama usa só o que está aqui.
 *
 * Três regras, as mesmas das outras integrações:
 *  - Nunca lança. WhatsApp fora do ar não derruba o que chamou (o aviso é
 *    consequência de algo que já foi salvo).
 *  - A chave nunca sai daqui: nem para a tela, nem para o log, nem no texto
 *    de erro.
 *  - Diagnóstico só lê. Ligar o webhook é ação que alguém pediu na tela de
 *    conexão (ARQUITETURA §10.4).
 */

type Admin = ReturnType<typeof createAdminClient>

export type ConfigDoWhatsapp = ConfigDaKapso

/** A configuração do espaço: cofre (Configurações → Integrações) primeiro, ambiente (KAPSO_WHATSAPP, em JSON) depois. */
export async function configDoWhatsapp(workspaceId: string): Promise<ConfigDoWhatsapp | null> {
  try {
    const campos = await obterCampos(workspaceId, 'kapso')
    const chave = String(campos?.chave ?? '').trim()
    const numeroId = String(campos?.numeroId ?? '').replace(/\s/g, '')
    if (chave.length < 8 || !numeroIdValido(numeroId)) return null
    return { provedor: 'kapso', chave, numeroId, modelo: String(campos?.modelo ?? '').trim() || null }
  } catch {
    return null
  }
}

// ------------------------------------------------------------------ mensagens

/**
 * `semResposta`: o tempo acabou antes de a Kapso confirmar. A mensagem pode
 * ter saído mesmo assim: quem chama não trata isso como "não chegou".
 */
export type Envio = { ok: true; id: string | null } | { ok: false; erro: string; motivo: MotivoDaFalha; semResposta?: boolean }

/** Manda um texto. `numero` em dígitos. Fora da janela de 24 h, vai pelo modelo aprovado (kapso.ts). */
export const enviarTexto = (config: ConfigDoWhatsapp, numero: string, texto: string): Promise<Envio> => enviarTextoKapso(config, numero, texto)

export type MidiaBaixada = { ok: true; conteudo: Buffer; mime: string | null; nome: string | null } | { ok: false; erro: string }

/** O arquivo de uma mensagem recebida, pelo id da mídia (MidiaRecebida.arquivo). O webhook não traz o arquivo. */
export const baixarMidia = (config: ConfigDoWhatsapp, midiaId: string, tetoBytes: number): Promise<MidiaBaixada> => baixarMidiaKapso(config, midiaId, tetoBytes)

// ------------------------------------------------------------------ conexão

export type SituacaoDaConexao = { estado: EstadoDaConexao; erro: string | null }

export const situacaoDaConexao = (config: ConfigDoWhatsapp): Promise<SituacaoDaConexao> => situacaoDaConexaoKapso(config)

/** Número e nome verificado do WhatsApp do Palácio. */
export const perfilConectado = (config: ConfigDoWhatsapp): Promise<{ numero: string | null; nome: string | null }> => perfilConectadoKapso(config)

// ------------------------------------------------------------------ webhook

/** O endereço do webhook (o `p=kapso` fica: é o endereço já cadastrado na Kapso). */
export const urlDoWebhook = (workspaceId: string) => `${urlBase()}/api/webhooks/whatsapp?w=${encodeURIComponent(workspaceId)}&p=kapso`

export const ligarWebhook = (config: ConfigDoWhatsapp, workspaceId: string): Promise<{ erro: string | null }> =>
  ligarWebhookKapso(config, workspaceId, urlDoWebhook(workspaceId))

export type SituacaoDoWebhook = 'ligado' | 'outro_endereco' | 'desligado' | 'desconhecido'

/** O webhook do número aponta para cá, ligado e com a senha certa? */
export const situacaoDoWebhook = (config: ConfigDoWhatsapp, workspaceId: string): Promise<SituacaoDoWebhook> =>
  situacaoDoWebhookKapso(config, workspaceId, urlDoWebhook(workspaceId))

// ------------------------------------------------------------------ registro e envio com registro

export type LinhaDoRegistro = {
  workspaceId: string
  direcao: 'entrada' | 'saida'
  tipo: 'aviso' | 'seguranca' | 'codigo' | 'bot' | 'teste'
  situacao: 'recebida' | 'enviada' | 'falhou' | 'ignorada'
  numero?: string | null
  userId?: string | null
  mensagemId?: string | null
  comando?: string | null
  notificacaoId?: string | null
  erro?: string | null
}

/**
 * Grava no registro. Devolve false se a mensagem de entrada já estava lá
 * (reentrega do webhook) — é o que evita responder duas vezes. Nunca lança.
 */
export async function registrar(admin: Admin, l: LinhaDoRegistro): Promise<boolean> {
  try {
    const { error } = await admin.from('whatsapp_mensagens').insert({
      workspace_id: l.workspaceId, direcao: l.direcao, tipo: l.tipo, situacao: l.situacao,
      numero: l.numero ?? null, user_id: l.userId ?? null, mensagem_id: l.mensagemId ?? null,
      comando: l.comando?.slice(0, 40) ?? null, notificacao_id: l.notificacaoId ?? null, erro: l.erro?.slice(0, 500) ?? null,
    })
    if (error?.code === '23505') return false
    if (error) console.error('[whatsapp] registro não gravado:', error.message)
    return true
  } catch (causa) {
    console.error('[whatsapp] registro não gravado:', causa instanceof Error ? causa.message : causa)
    return true
  }
}

/** Envia e registra. Sem configuração, não faz nada (e diz). */
export async function mandar(admin: Admin, workspaceId: string, p: {
  numero: string; texto: string; tipo: LinhaDoRegistro['tipo']; userId?: string | null; notificacaoId?: string | null; config?: ConfigDoWhatsapp | null
}): Promise<Envio> {
  const config = p.config ?? await configDoWhatsapp(workspaceId)
  if (!config) return { ok: false, erro: 'O WhatsApp do Palácio Virtual não está configurado.', motivo: 'chave' }
  const envio = await enviarTexto(config, p.numero, p.texto)
  await registrar(admin, {
    workspaceId, direcao: 'saida', tipo: p.tipo, situacao: envio.ok ? 'enviada' : 'falhou', numero: p.numero,
    userId: p.userId, mensagemId: envio.ok ? envio.id : null, notificacaoId: p.notificacaoId, erro: envio.ok ? null : envio.erro,
  })
  return envio
}

// ------------------------------------------------------------------ código de confirmação

export const gerarCodigo = () => String(randomInt(0, 1_000_000)).padStart(6, '0')

/** No banco vai só o hash, amarrado à pessoa e ao número. */
export const hashDoCodigo = (userId: string, numero: string, codigo: string) =>
  createHash('sha256').update(`whatsapp:${userId}:${numero}:${codigo}`, 'utf8').digest('hex')

export function codigoConfere(esperado: string, userId: string, numero: string, codigo: string): boolean {
  const a = Buffer.from(esperado, 'hex')
  const b = Buffer.from(hashDoCodigo(userId, numero, codigo), 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
