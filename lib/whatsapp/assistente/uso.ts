import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { claudeConfigurado } from '@/lib/ia/anthropic'
import { notificar } from '@/lib/notificacoes/servidor'
import { podeAgirPeloWhatsapp, type Pessoa } from '../acoes'
import { TETOS_PADRAO, TEXTOS_FIXOS, decidirConfianca, modoCobre, type ModoDoAssistente } from './regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Se o assistente atende esta pessoa agora, e em que nível: o interruptor do espaço (whatsapp_ia_config, sem
 * deploy), o modo, a chave da Anthropic, o disjuntor, o papel e a confiança do número. Sem a configuração (ou sem a
 * tabela: migração ainda não aplicada), indisponível — e o bot responde exatamente como sempre.
 *
 * Os níveis de leitura: `amplo` (as permissões da tela) só para quem pode agir pelo WhatsApp (sem a verificação em
 * duas etapas) e com o número de confiança recente; os outros ficam no `pessoal` (só o que é da própria pessoa).
 * A escrita pelo assistente exige a escrita ligada no espaço e o número recente.
 */

export type ConfigDoAssistente = {
  modo: ModoDoAssistente; piloto: string[]; escrita: boolean
  teto_usd_dia: number; teto_usd_pessoa_dia: number; turnos_pessoa_hora: number; turnos_pessoa_dia: number
  leituras_detalhe_dia: number; mensagens_dia: number
  falhas_seguidas: number; pausada_ate: string | null; motivo_pausa: string | null
}

const MODOS = new Set<ModoDoAssistente>(['desligado', 'piloto', 'admins', 'equipe'])
const numero = (v: unknown, padrao: number) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : padrao)

/** A configuração do espaço; null sem linha, sem a tabela ou com erro (= desligado). */
export async function lerConfig(admin: Admin, workspaceId: string): Promise<ConfigDoAssistente | null> {
  try {
    const { data, error } = await admin.from('whatsapp_ia_config').select('*').eq('workspace_id', workspaceId).maybeSingle()
    if (error || !data) return null
    const modo = MODOS.has(data.modo as ModoDoAssistente) ? data.modo as ModoDoAssistente : 'desligado'
    return {
      modo,
      piloto: Array.isArray(data.piloto) ? (data.piloto as unknown[]).map(String) : [],
      escrita: data.escrita === true,
      teto_usd_dia: numero(data.teto_usd_dia, TETOS_PADRAO.teto_usd_dia),
      teto_usd_pessoa_dia: numero(data.teto_usd_pessoa_dia, TETOS_PADRAO.teto_usd_pessoa_dia),
      turnos_pessoa_hora: numero(data.turnos_pessoa_hora, TETOS_PADRAO.turnos_pessoa_hora),
      turnos_pessoa_dia: numero(data.turnos_pessoa_dia, TETOS_PADRAO.turnos_pessoa_dia),
      leituras_detalhe_dia: numero(data.leituras_detalhe_dia, TETOS_PADRAO.leituras_detalhe_dia),
      mensagens_dia: numero(data.mensagens_dia, TETOS_PADRAO.mensagens_dia),
      falhas_seguidas: numero(data.falhas_seguidas, 0),
      pausada_ate: (data.pausada_ate as string | null) ?? null,
      motivo_pausa: (data.motivo_pausa as string | null) ?? null,
    }
  } catch {
    return null
  }
}

export type ConfiancaDoNumero = { suspenso: boolean; recente: boolean }

/**
 * A confiança do número (regras.ts, decidirConfianca), com o que ela pede: grava o primeiro nome de perfil das contas
 * de antes, ou suspende o assistente no número quando o nome mudou — e avisa a pessoa no sino e no e-mail (categoria
 * "sistema": nunca pelo WhatsApp, que pode estar em outras mãos). Sem as colunas (migração ainda não aplicada) ou
 * com erro: suspenso, por segurança.
 */
export async function confiancaDoNumero(admin: Admin, workspaceId: string, pessoa: Pessoa, m: { numero: string | null; nome: string | null }): Promise<ConfiancaDoNumero> {
  try {
    const { data: conta, error } = await admin.from('whatsapp_contas').select('numero, confirmado_em, nome_no_whatsapp, assistente_suspenso_em').eq('user_id', pessoa.id).maybeSingle()
    if (error || !conta || !m.numero || conta.numero !== m.numero) return { suspenso: true, recente: false }
    const usuario = await admin.auth.admin.getUserById(pessoa.id).catch(() => null)
    const decisao = decidirConfianca({
      confirmadoEm: (conta.confirmado_em as string | null) ?? null, nomeGuardado: (conta.nome_no_whatsapp as string | null) ?? null,
      suspensoEm: (conta.assistente_suspenso_em as string | null) ?? null, nomeAgora: m.nome, ultimoLogin: usuario?.data?.user?.last_sign_in_at ?? null, agora: Date.now(),
    })
    const agora = new Date().toISOString()
    if (decisao.acao === 'gravar_nome') {
      await admin.from('whatsapp_contas').update({ nome_no_whatsapp: m.nome?.trim().slice(0, 80) ?? null }).eq('user_id', pessoa.id).is('nome_no_whatsapp', null)
    } else if (decisao.acao === 'suspender') {
      const { data: suspensa } = await admin.from('whatsapp_contas').update({ assistente_suspenso_em: agora, atualizado_em: agora })
        .eq('user_id', pessoa.id).is('assistente_suspenso_em', null).select('user_id').maybeSingle()
      // Só quem suspendeu avisa (duas mensagens juntas não avisam duas vezes).
      if (suspensa) {
        await notificar(admin, {
          workspaceId, para: [pessoa.id], atorId: null, categoria: 'sistema',
          titulo: 'O assistente do WhatsApp parou no seu número', mensagem: TEXTOS_FIXOS.nome_mudou, link: '/perfil#whatsapp',
        })
      }
    }
    return { suspenso: decisao.suspenso, recente: decisao.recente }
  } catch {
    return { suspenso: true, recente: false }
  }
}

export type NivelDeLeitura = 'pessoal' | 'amplo'
export type MotivoDaIndisponibilidade = 'sem_config' | 'fora_do_modo' | 'sem_chave' | 'pausado' | 'escola' | 'suspenso' | 'erro'

export type Disponibilidade = {
  disponivel: boolean; nivel: NivelDeLeitura; escrita: boolean; podeAgir: boolean; recente: boolean
  motivo: MotivoDaIndisponibilidade | null; config: ConfigDoAssistente | null
}

/** O assistente fora: o bot de hoje responde. */
export const ASSISTENTE_INDISPONIVEL: Disponibilidade = { disponivel: false, nivel: 'pessoal', escrita: false, podeAgir: false, recente: false, motivo: 'sem_config', config: null }

const indisponivel = (motivo: MotivoDaIndisponibilidade, config: ConfigDoAssistente | null = null): Disponibilidade => ({ ...ASSISTENTE_INDISPONIVEL, motivo, config })

/**
 * O assistente atende esta pessoa nesta mensagem? As conferências baratas primeiro (configuração, modo, chave,
 * disjuntor, papel); a confiança do número e a verificação em duas etapas só quando passam. Nunca lança.
 */
export async function disponibilidadeDoAssistente(admin: Admin, workspaceId: string, pessoa: Pessoa, m: { numero: string | null; nome: string | null }): Promise<Disponibilidade> {
  try {
    const config = await lerConfig(admin, workspaceId)
    if (!config || config.modo === 'desligado') return indisponivel('sem_config', config)
    if (pessoa.papel === 'escola') return indisponivel('escola', config)
    if (!modoCobre(config, pessoa)) return indisponivel('fora_do_modo', config)
    if (!claudeConfigurado()) return indisponivel('sem_chave', config)
    if (config.pausada_ate && Date.parse(config.pausada_ate) > Date.now()) return indisponivel('pausado', config)
    const [confianca, podeAgir] = await Promise.all([confiancaDoNumero(admin, workspaceId, pessoa, m), podeAgirPeloWhatsapp(admin, workspaceId, pessoa)])
    if (confianca.suspenso) return indisponivel('suspenso', config)
    return {
      disponivel: true, nivel: podeAgir && confianca.recente ? 'amplo' : 'pessoal', escrita: config.escrita && confianca.recente,
      podeAgir, recente: confianca.recente, motivo: null, config,
    }
  } catch {
    return indisponivel('erro')
  }
}
