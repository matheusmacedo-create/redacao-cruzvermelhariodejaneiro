import 'server-only'
import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterCampos } from '@/lib/integracoes/chaves'
import { urlBase } from '@/lib/newsletter/contexto'
import {
  baseDoHashDoCodigo, wabaValido, type EstadoDaConexao, type EstadoDoWebhook, type Finalidade, type Interativo, type MotivoDaFalha, type ObjetoDoModelo,
  type SentidoDoCodigo,
} from './regras'
import { modeloDaSituacao, type MontagemDoModelo, type ModeloNaMeta, type SituacaoDoModelo } from './modelos'
import {
  TETO_DA_IMAGEM_NA_META, apagarMidiaKapso, baixarMidiaKapso, enviarAudioKapso, enviarModeloKapso, subirAudioKapso, enviarTextoKapso, ligarWebhookKapso, modelosDaMetaKapso, numeroIdValido,
  perfilConectadoKapso, situacaoDaConexaoKapso, situacaoDoWebhookKapso, subirMidiaKapso, type ConfigDaKapso,
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

/**
 * A configuração do espaço: cofre (Configurações → Integrações) primeiro, ambiente (KAPSO_WHATSAPP, em JSON) depois.
 * Os três modelos são opcionais: o dos avisos (`modelo`), o de Autenticação para códigos (`modeloCodigo`) e o de
 * segurança da conta (`modeloSeguranca`; vazio, a segurança usa o dos avisos). `wabaId`, também opcional: a conta do
 * WhatsApp Business, só usada quando a Kapso não diz qual é (os modelos por situação — kapso.ts, wabaDoNumeroKapso).
 */
export async function configDoWhatsapp(workspaceId: string): Promise<ConfigDoWhatsapp | null> {
  try {
    const campos = await obterCampos(workspaceId, 'kapso')
    const chave = String(campos?.chave ?? '').trim()
    const numeroId = String(campos?.numeroId ?? '').replace(/\s/g, '')
    if (chave.length < 8 || !numeroIdValido(numeroId)) return null
    const nome = (id: 'modelo' | 'modeloCodigo' | 'modeloSeguranca') => String(campos?.[id] ?? '').trim() || null
    const wabaId = String(campos?.wabaId ?? '').replace(/\s/g, '')
    return {
      provedor: 'kapso', chave, numeroId, modelo: nome('modelo'), modeloCodigo: nome('modeloCodigo'), modeloSeguranca: nome('modeloSeguranca'),
      wabaId: wabaValido(wabaId) ? wabaId : null,
    }
  } catch {
    return null
  }
}

// ------------------------------------------------------------------ mensagens

/**
 * `semResposta`: o tempo acabou antes de a Kapso confirmar. A mensagem pode
 * ter saído mesmo assim: quem chama não trata isso como "não chegou".
 * `modelo`: saiu por modelo (o nome dele), fora da janela de 24 h.
 * `foraDaJanela`: não saiu porque a pessoa não escreveu nas últimas 24 h e
 * não havia modelo para a mensagem — quem chama pode seguir por outro caminho.
 */
export type Envio =
  | { ok: true; id: string | null; modelo?: string | null }
  | { ok: false; erro: string; motivo: MotivoDaFalha; semResposta?: boolean; foraDaJanela?: boolean }

/**
 * `finalidade` escolhe o modelo fora da janela de 24 h (regras.ts, modeloParaEnviar; sem ela, aviso): a resposta do
 * bot nunca vai por modelo, e o código vai pelo de Autenticação com o próprio `codigo`. `interativo`: botões ou lista
 * junto do texto (regras.ts, Interativo), só dentro da janela; o id de cada um é o comando que o bot já lê digitado.
 * `modeloForaDaJanela`: em vez do modelo da finalidade, o modelo da situação (modeloAprovado), pedido só quando a
 * janela está fechada; null, a mensagem não sai (Envio.foraDaJanela).
 */
export type OpcoesDoEnvio = {
  finalidade?: Finalidade; codigo?: string | null; interativo?: Interativo | null
  modeloForaDaJanela?: (() => Promise<ObjetoDoModelo | null>) | null
}

/**
 * Manda um texto. `numero` em dígitos. Com `interativo`, tenta antes com os botões ou a lista; se não couberem ou a Meta
 * recusar, vai o mesmo texto. Fora da janela de 24 h, vai pelo modelo aprovado da finalidade, sem botão (kapso.ts).
 */
export const enviarTexto = (config: ConfigDoWhatsapp, numero: string, texto: string, opcoes?: OpcoesDoEnvio): Promise<Envio> =>
  enviarTextoKapso(config, numero, texto, opcoes)

/**
 * Manda um modelo já montado (modeloAprovado), com cabeçalho, corpo e botões. Não depende da janela de 24 h: é o
 * caminho para quem nunca escreveu ao número (kapso.ts, enviarModeloKapso). Sem registro: quem chama registra.
 */
export const enviarModelo = (config: ConfigDoWhatsapp, numero: string, modelo: ObjetoDoModelo): Promise<Envio> =>
  enviarModeloKapso(config, numero, modelo)

export type MidiaBaixada = { ok: true; conteudo: Buffer; mime: string | null; nome: string | null } | { ok: false; erro: string }

/** O arquivo de uma mensagem recebida, pelo id da mídia (MidiaRecebida.arquivo; `reserva` = MidiaRecebida.endereco). O webhook não traz o arquivo. */
export const baixarMidia = (config: ConfigDoWhatsapp, midiaId: string, tetoBytes: number, reserva?: string | null): Promise<MidiaBaixada> =>
  baixarMidiaKapso(config, midiaId, tetoBytes, reserva)

export type MidiaEnviada = { ok: true; id: string } | { ok: false; erro: string; motivo: MotivoDaFalha }

/** O teto da Meta para a imagem que o Palácio sobe (5 MB, JPEG ou PNG). */
export { TETO_DA_IMAGEM_NA_META }

/** Sobe uma imagem (JPEG ou PNG, até 5 MB) para a Meta; o id vai no cabeçalho dos botões ou do modelo (kapso.ts, subirMidiaKapso). */
export const subirMidia = (config: ConfigDoWhatsapp, conteudo: Uint8Array, mime?: string): Promise<MidiaEnviada> =>
  subirMidiaKapso(config, conteudo, mime)

/** Sobe um áudio (OGG Opus, que vira mensagem de voz, ou MP3) para a Meta (kapso.ts, subirAudioKapso). */
export const subirAudio = (config: ConfigDoWhatsapp, conteudo: Uint8Array, mime: 'audio/ogg' | 'audio/mpeg'): Promise<MidiaEnviada> =>
  subirAudioKapso(config, conteudo, mime)

/** Manda um áudio já subido, só dentro da janela de 24 h; `voz`: como mensagem de voz (kapso.ts, enviarAudioKapso). Sem registro: quem chama registra. */
export const enviarAudio = (config: ConfigDoWhatsapp, numero: string, midiaId: string, voz: boolean): Promise<Envio> =>
  enviarAudioKapso(config, numero, midiaId, voz)

/** Apaga da Meta a mídia que o Palácio subiu, depois de usada. Melhor esforço; nunca lança. */
export const apagarMidia = (config: ConfigDoWhatsapp, midiaId: string): Promise<boolean> => apagarMidiaKapso(config, midiaId)

// ------------------------------------------------------------------ modelos por situação (lib/whatsapp/modelos.ts)

/** Os modelos da conta como estão na Meta, com cache de alguns minutos; vazio se não deu para ler. */
export const modelosDaMeta = (config: ConfigDoWhatsapp): Promise<ModeloNaMeta[]> => modelosDaMetaKapso(config)

/**
 * O modelo aprovado da situação, já montado (modelos.ts, modeloDaSituacao): aprovado na Meta, de Utilidade, em
 * português. null se nenhum serve agora — quem chama segue pelo caminho de antes. Nunca lança.
 */
export async function modeloAprovado(config: ConfigDoWhatsapp, situacao: SituacaoDoModelo, montagem: MontagemDoModelo): Promise<ObjetoDoModelo | null> {
  try {
    return modeloDaSituacao(situacao, await modelosDaMeta(config), montagem)
  } catch {
    return null
  }
}

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

export type SituacaoDoWebhook = EstadoDoWebhook

/** O webhook do número aponta para cá, ligado e com a senha certa? */
export const situacaoDoWebhook = (config: ConfigDoWhatsapp, workspaceId: string): Promise<SituacaoDoWebhook> =>
  situacaoDoWebhookKapso(config, workspaceId, urlDoWebhook(workspaceId))

// ------------------------------------------------------------------ registro e envio com registro

export type LinhaDoRegistro = {
  workspaceId: string
  direcao: 'entrada' | 'saida'
  tipo: Finalidade
  situacao: 'recebida' | 'enviada' | 'falhou' | 'ignorada'
  numero?: string | null
  userId?: string | null
  mensagemId?: string | null
  /**
   * Na entrada, o comando reconhecido (nunca o texto); na saída, só as marcas "menu" (a lista do menu: o toque nela vale
   * como comando — bot.ts) e "nao_fui_eu" (o aviso de segurança que aceita a resposta "NÃO FUI EU" — protecao.ts).
   */
  comando?: string | null
  notificacaoId?: string | null
  erro?: string | null
  /** Na entrada, a hora em que a pessoa enviou (MensagemRecebida.enviadaEm, em ms): ordena o "confirmo" do assistente. */
  enviadaEm?: number | null
}

/** A coluna não existe no banco (a migração dela ainda não foi aplicada): grava de novo sem ela. */
export const semColuna = (error: { code?: string } | null) => error?.code === 'PGRST204' || error?.code === '42703'

/** Até quando esta instância grava o registro sem a hora de envio (a coluna não existia na última vez). */
let semEnviadaEmAte = 0

/**
 * Grava no registro. Devolve false se a mensagem de entrada já estava lá
 * (reentrega do webhook) — é o que evita responder duas vezes. Nunca lança.
 * Antes da migração do assistente (whatsapp_mensagens.enviada_em), grava sem
 * a hora de envio: a trava por id continua valendo.
 */
export async function registrar(admin: Admin, l: LinhaDoRegistro): Promise<boolean> {
  try {
    const linha = {
      workspace_id: l.workspaceId, direcao: l.direcao, tipo: l.tipo, situacao: l.situacao,
      numero: l.numero ?? null, user_id: l.userId ?? null, mensagem_id: l.mensagemId ?? null,
      comando: l.comando?.slice(0, 40) ?? null, notificacao_id: l.notificacaoId ?? null, erro: l.erro?.slice(0, 500) ?? null,
    }
    const enviada = typeof l.enviadaEm === 'number' && Number.isFinite(l.enviadaEm) && Date.now() >= semEnviadaEmAte ? new Date(l.enviadaEm).toISOString() : null
    const comHora: typeof linha & { enviada_em?: string } = enviada ? { ...linha, enviada_em: enviada } : linha
    let { error } = await admin.from('whatsapp_mensagens').insert(comHora)
    if (enviada && semColuna(error)) {
      semEnviadaEmAte = Date.now() + 5 * 60_000
      ;({ error } = await admin.from('whatsapp_mensagens').insert(linha))
    }
    if (error?.code === '23505') return false
    if (error) console.error('[whatsapp] registro não gravado:', error.message)
    return true
  } catch (causa) {
    console.error('[whatsapp] registro não gravado:', causa instanceof Error ? causa.message : causa)
    return true
  }
}

/**
 * Envia e registra. Sem configuração, não faz nada (e diz). O tipo é a finalidade do envio; no tipo "codigo",
 * `codigo` é o código de confirmação, que vai sozinho no modelo de Autenticação fora da janela de 24 h.
 * `interativo` e `modeloForaDaJanela`: como em OpcoesDoEnvio; o registro é o mesmo (só o número e o resultado,
 * nunca o texto).
 */
export async function mandar(admin: Admin, workspaceId: string, p: {
  numero: string; texto: string; tipo: LinhaDoRegistro['tipo']; codigo?: string | null; userId?: string | null; notificacaoId?: string | null; config?: ConfigDoWhatsapp | null
  interativo?: Interativo | null; modeloForaDaJanela?: OpcoesDoEnvio['modeloForaDaJanela']
}): Promise<Envio> {
  const config = p.config ?? await configDoWhatsapp(workspaceId)
  if (!config) return { ok: false, erro: 'O WhatsApp do Palácio Virtual não está configurado.', motivo: 'chave' }
  const envio = await enviarTexto(config, p.numero, p.texto, {
    finalidade: p.tipo, codigo: p.tipo === 'codigo' ? p.codigo : null, interativo: p.interativo, modeloForaDaJanela: p.modeloForaDaJanela,
  })
  await registrar(admin, {
    workspaceId, direcao: 'saida', tipo: p.tipo, situacao: envio.ok ? 'enviada' : 'falhou', numero: p.numero,
    userId: p.userId, mensagemId: envio.ok ? envio.id : null, notificacaoId: p.notificacaoId, erro: envio.ok ? null : envio.erro,
  })
  return envio
}

// ------------------------------------------------------------------ código de confirmação

export const gerarCodigo = () => String(randomInt(0, 1_000_000)).padStart(6, '0')

/**
 * No banco vai só o hash, amarrado à pessoa, ao número e ao sentido (regras.ts, baseDoHashDoCodigo):
 * o código mostrado na tela (ida) não serve para digitar, nem o mandado ao número (volta) para mandar ao bot.
 */
export const hashDoCodigo = (userId: string, numero: string, codigo: string, sentido: SentidoDoCodigo = 'volta') =>
  createHash('sha256').update(baseDoHashDoCodigo(sentido, userId, numero, codigo), 'utf8').digest('hex')

export function codigoConfere(esperado: string, userId: string, numero: string, codigo: string, sentido: SentidoDoCodigo = 'volta'): boolean {
  const a = Buffer.from(esperado, 'hex')
  const b = Buffer.from(hashDoCodigo(userId, numero, codigo, sentido), 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
