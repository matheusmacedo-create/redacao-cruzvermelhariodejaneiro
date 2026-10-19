import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { claudeConfigurado, esforcoDoAssistente, modeloDoAssistente } from '@/lib/ia/anthropic'
import { notificar } from '@/lib/notificacoes/servidor'
import { podeAgirPeloWhatsapp, type Pessoa } from '../acoes'
import {
  TETOS_PADRAO, TEXTOS_FIXOS, contarAcoesDoDia, custoEstimado, decidirConfianca, inicioDoDiaEmBrasilia, modoCobre, ehFerramenta, type ModoDoAssistente, type UsoDaChamada,
} from './regras'
import type { AssistenteNoStatus } from '../regras'

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

// ------------------------------------------------------------------ cotas (somas no SQL)

/** Os turnos com modelo da pessoa na última hora e desde a meia-noite de Brasília; null se não deu para contar. */
export async function contarTurnos(admin: Admin, userId: string, agora: Date = new Date()): Promise<{ hora: number; dia: number } | null> {
  try {
    const contar = (desde: Date) => admin.from('whatsapp_ia_uso').select('id', { count: 'exact', head: true }).eq('user_id', userId).gt('chamadas', 0).gte('criado_em', desde.toISOString())
    const [hora, dia] = await Promise.all([contar(new Date(agora.getTime() - 3_600_000)), contar(inicioDoDiaEmBrasilia(agora))])
    if (hora.error || dia.error) return null
    return { hora: hora.count ?? 0, dia: dia.count ?? 0 }
  } catch {
    return null
  }
}

/** O gasto de hoje (desde a meia-noite de Brasília), do espaço ou só da pessoa, em US$; null se não deu para somar. */
export async function gastoDeHoje(admin: Admin, workspaceId: string, p: { userId?: string; agora?: Date } = {}): Promise<number | null> {
  try {
    const { data, error } = await admin.rpc('whatsapp_ia_gasto_desde', {
      p_workspace_id: workspaceId, p_desde: inicioDoDiaEmBrasilia(p.agora ?? new Date()).toISOString(), p_user_id: p.userId ?? null,
    })
    return error ? null : Number(data ?? 0)
  } catch {
    return null
  }
}

/** As leituras de detalhe da pessoa hoje (ver_aprovacao, ver_chamado, buscar_pessoa); null se não deu para somar. */
export async function leiturasDeHoje(admin: Admin, userId: string, agora: Date = new Date()): Promise<number | null> {
  try {
    const { data, error } = await admin.rpc('whatsapp_ia_leituras_desde', { p_user_id: userId, p_desde: inicioDoDiaEmBrasilia(agora).toISOString() })
    return error ? null : Number(data ?? 0)
  } catch {
    return null
  }
}

/**
 * Os planos que a pessoa executou hoje (executado ou parcial, desde a meia-noite de Brasília) e as mensagens diretas
 * que saíram por eles: as cotas do dia (LIMITES.planosDia e whatsapp_ia_config.mensagens_dia). null se não deu para contar.
 */
export async function acoesDeHoje(admin: Admin, userId: string, agora: Date = new Date()): Promise<{ planos: number; mensagens: number } | null> {
  try {
    const { data, error } = await admin.from('whatsapp_ia_planos').select('passos, resultado').eq('user_id', userId).in('situacao', ['executado', 'parcial'])
      .gte('atualizado_em', inicioDoDiaEmBrasilia(agora).toISOString()).limit(200)
    return error ? null : contarAcoesDoDia(data ?? [])
  } catch {
    return null
  }
}

// ------------------------------------------------------------------ o registro do uso (uma linha por turno, gravada a cada chamada)

export type DesfechoDoUso = 'resposta' | 'plano' | 'pergunta' | 'confirmado' | 'recusa' | 'erro' | 'prazo' | 'teto' | 'cota' | 'ocupado' | 'repetida'

const MAX_CHAMADAS = 10
const MAX_DETALHE = 50
const NOME_DE_FERRAMENTA = /^[a-z_]{3,40}$/

/**
 * O registro de um turno em whatsapp_ia_uso: tokens, custo, modelo, recuo, nomes das ferramentas, leituras de
 * detalhe, tempo e desfecho — nunca texto. A linha nasce na primeira chamada ("andamento") e é regravada a cada
 * chamada: uma função cortada pelo maxDuration não esconde o gasto (a faxina fecha o que ficou em andamento).
 */
export function criarRegistroDoUso(admin: Admin, workspaceId: string, userId: string) {
  const inicio = Date.now()
  let id: number | null = null
  const t = { chamadas: 0, entrada: 0, cacheEscrita: 0, cacheLida: 0, saida: 0, custo: 0, modelo: null as string | null, recuo: false, stop: null as string | null }
  const ferramentas = new Set<string>()
  let detalhe = 0

  const linha = () => ({
    modelo: t.modelo?.slice(0, 60) ?? null, recuo: t.recuo, chamadas: Math.min(t.chamadas, MAX_CHAMADAS),
    ferramentas: [...ferramentas].filter((n) => NOME_DE_FERRAMENTA.test(n)).slice(0, 24), leituras_detalhe: Math.min(detalhe, MAX_DETALHE),
    entrada: t.entrada, cache_escrita: t.cacheEscrita, cache_lida: t.cacheLida, saida: t.saida, custo_usd: Math.round(t.custo * 100_000) / 100_000,
    ms: Date.now() - inicio, stop_reason: t.stop?.slice(0, 30) ?? null,
  })

  async function gravar(extra: Record<string, unknown>) {
    try {
      if (id === null) {
        const { data, error } = await admin.from('whatsapp_ia_uso').insert({ workspace_id: workspaceId, user_id: userId, ...linha(), ...extra }).select('id').single()
        if (error) { console.error('[whatsapp] assistente: uso não registrado:', error.code); return }
        id = data.id as number
      } else {
        const { error } = await admin.from('whatsapp_ia_uso').update({ ...linha(), ...extra }).eq('id', id)
        if (error) console.error('[whatsapp] assistente: uso não atualizado:', error.code)
      }
    } catch (causa) {
      console.error('[whatsapp] assistente: uso não registrado:', causa instanceof Error ? causa.message : causa)
    }
  }

  return {
    /** Depois de cada chamada: soma os tokens e o custo (cada iteração do recuo pelo preço do modelo que a fez). */
    async somar(r: Anthropic.Beta.BetaMessage) {
      const u = r.usage
      t.chamadas++
      t.entrada += u.input_tokens ?? 0
      t.saida += u.output_tokens ?? 0
      t.cacheLida += u.cache_read_input_tokens ?? 0
      t.cacheEscrita += u.cache_creation_input_tokens ?? 0
      t.modelo = r.model
      t.stop = r.stop_reason ?? null
      t.recuo ||= (u.iterations ?? []).some((i) => i.type === 'fallback_message') || r.content.some((b) => b.type === 'fallback')
      const { usd, desconhecido } = custoEstimado(u as unknown as UsoDaChamada, r.model)
      if (desconhecido) console.error('[whatsapp] assistente: modelo sem preço na tabela (pago como o padrão):', r.model)
      t.custo += usd
      await gravar({ desfecho: 'andamento' })
    },
    /** Os nomes das ferramentas chamadas (só nomes da lista fechada). */
    usar(nome: string) {
      if (ehFerramenta(nome)) ferramentas.add(nome)
    },
    /** Uma leitura de detalhe feita (conta no teto diário da pessoa). */
    detalhe() {
      detalhe++
    },
    get leiturasDeDetalhe() { return detalhe },
    get chamadas() { return t.chamadas },
    /** O desfecho do turno (com ou sem chamada ao modelo). `erro`: só a classe do erro, nunca texto da pessoa. */
    async fechar(desfecho: DesfechoDoUso, extra: { erro?: string | null; categoriaRecusa?: string | null; planoId?: string | null } = {}) {
      await gravar({
        desfecho, erro: extra.erro?.slice(0, 120) ?? null, categoria_recusa: extra.categoriaRecusa?.slice(0, 40) ?? null, plano_id: extra.planoId ?? null,
      })
    },
  }
}

export type RegistroDoUso = ReturnType<typeof criarRegistroDoUso>

// ------------------------------------------------------------------ disjuntor e alertas

/** As classes de erro de quem está do outro lado (o disjuntor conta só estas). */
export const ERROS_DE_FORA = ['RateLimitError', 'InternalServerError', 'APIConnectionError', 'APIConnectionTimeoutError'] as const

/** O disjuntor abre com tantas falhas de fora em tantos minutos, e fica aberto por tantos minutos. */
const DISJUNTOR = { falhas: 3, janelaMin: 10, pausaMin: 10 } as const
/** Chave recusada ou modelo inexistente: pausa mais longa (não adianta tentar a cada mensagem). */
const PAUSA_DE_CONFIGURACAO_MIN = 30

/**
 * Uma falha de fora (429, 529, 5xx, conexão, tempo): soma no contador e, com DISJUNTOR.falhas em
 * DISJUNTOR.janelaMin (contadas no registro do uso), abre o disjuntor — o assistente fica fora por
 * DISJUNTOR.pausaMin e o bot de comandos responde sozinho.
 */
export async function registrarFalha(admin: Admin, workspaceId: string, config: ConfigDoAssistente | null): Promise<void> {
  try {
    const agora = Date.now()
    const { count } = await admin.from('whatsapp_ia_uso').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('desfecho', 'erro')
      .in('erro', [...ERROS_DE_FORA]).gte('criado_em', new Date(agora - DISJUNTOR.janelaMin * 60_000).toISOString())
    const abrir = (count ?? 0) >= DISJUNTOR.falhas
    await admin.from('whatsapp_ia_config').update({
      falhas_seguidas: Math.min(32_000, (config?.falhas_seguidas ?? 0) + 1),
      ...(abrir ? { pausada_ate: new Date(agora + DISJUNTOR.pausaMin * 60_000).toISOString(), motivo_pausa: `A Anthropic falhou ${count} vezes em ${DISJUNTOR.janelaMin} minutos.` } : {}),
    }).eq('workspace_id', workspaceId)
  } catch (causa) {
    console.error('[whatsapp] assistente: falha não registrada:', causa instanceof Error ? causa.message : causa)
  }
}

/** Uma resposta bem-sucedida zera o contador (só grava se havia falha). */
export async function zerarFalhas(admin: Admin, workspaceId: string, config: ConfigDoAssistente | null): Promise<void> {
  if (!config?.falhas_seguidas) return
  try {
    await admin.from('whatsapp_ia_config').update({ falhas_seguidas: 0 }).eq('workspace_id', workspaceId)
  } catch {
    // Fica para a próxima resposta.
  }
}

/**
 * Chave recusada (401/403) ou modelo que não existe (404): pausa o assistente por PAUSA_DE_CONFIGURACAO_MIN, com o
 * motivo (sem segredo), e avisa a administração uma vez por dia (sino e e-mail; nunca pelo WhatsApp).
 */
export async function pausarPorConfiguracao(admin: Admin, workspaceId: string, qual: 'chave' | 'modelo', motivo: string): Promise<void> {
  try {
    await admin.from('whatsapp_ia_config').update({
      pausada_ate: new Date(Date.now() + PAUSA_DE_CONFIGURACAO_MIN * 60_000).toISOString(), motivo_pausa: `${qual}: ${motivo}`.slice(0, 200),
    }).eq('workspace_id', workspaceId)
    await alertarAdmins(admin, workspaceId, {
      titulo: qual === 'chave' ? 'O assistente do WhatsApp parou: a Anthropic recusou a chave' : 'O assistente do WhatsApp parou: o modelo não existe',
      mensagem: `${motivo.slice(0, 200)} Enquanto isso, o bot de comandos responde sozinho.`,
    })
  } catch (causa) {
    console.error('[whatsapp] assistente: pausa não gravada:', causa instanceof Error ? causa.message : causa)
  }
}

/**
 * Avisa os administradores do espaço no sino e no e-mail (categoria "sistema": nunca pelo WhatsApp), no máximo uma
 * vez por título desde `desde` (a meia-noite de Brasília, se nada for dito) — conferido pelos próprios avisos já
 * gravados. Devolve se avisou.
 */
export async function alertarAdmins(admin: Admin, workspaceId: string, a: { titulo: string; mensagem: string; desde?: Date }): Promise<boolean> {
  try {
    const desde = (a.desde ?? inicioDoDiaEmBrasilia(new Date())).toISOString()
    const { data: ja } = await admin.from('notifications').select('id').eq('workspace_id', workspaceId).eq('title', a.titulo).gte('created_at', desde).limit(1)
    if (ja?.length) return false
    const { data: admins } = await admin.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('role', 'admin')
    if (!admins?.length) return false
    await notificar(admin, {
      workspaceId, para: admins.map((x) => x.user_id as string), atorId: null, categoria: 'sistema',
      titulo: a.titulo, mensagem: a.mensagem, link: '/configuracoes/whatsapp', botao: 'Ver o assistente',
    })
    return true
  } catch (causa) {
    console.error('[whatsapp] assistente: alerta não enviado:', causa instanceof Error ? causa.message : causa)
    return false
  }
}

// ------------------------------------------------------------------ o cartão em Configurações → WhatsApp

export type NumerosDeHoje = { conversas: number; pessoas: number; gasto: number; comCache: number; recusas: number; erros: number }

/** Os números de hoje (desde a meia-noite de Brasília), só contagens: o cartão mostra, e nenhum texto sai daqui. */
export async function numerosDeHoje(admin: Admin, workspaceId: string, agora: Date = new Date()): Promise<NumerosDeHoje | null> {
  try {
    const { data, error } = await admin.from('whatsapp_ia_uso').select('user_id, chamadas, cache_lida, desfecho, custo_usd').eq('workspace_id', workspaceId)
      .gte('criado_em', inicioDoDiaEmBrasilia(agora).toISOString()).limit(5000)
    if (error) return null
    const linhas = data ?? []
    const comModelo = linhas.filter((l) => Number(l.chamadas) > 0)
    return {
      conversas: comModelo.length,
      pessoas: new Set(comModelo.map((l) => l.user_id as string | null).filter(Boolean)).size,
      gasto: Math.round(linhas.reduce((soma, l) => soma + (Number(l.custo_usd) || 0), 0) * 100) / 100,
      comCache: comModelo.length ? Math.round((comModelo.filter((l) => Number(l.cache_lida) > 0).length / comModelo.length) * 100) : 0,
      recusas: linhas.filter((l) => l.desfecho === 'recusa').length,
      erros: linhas.filter((l) => l.desfecho === 'erro').length,
    }
  } catch {
    return null
  }
}

export type PessoaDoPiloto = { id: string; nome: string; usuario: string; papel: string; whatsapp: boolean }

export type EstadoDoAssistente = {
  /** A tabela existe (a migração do assistente foi aplicada). */
  pronto: boolean
  config: ConfigDoAssistente | null
  numeros: NumerosDeHoje | null
  pessoas: PessoaDoPiloto[]
  chave: boolean
  modelo: string
  esforco: string
  /** A pausa em vigor (disjuntor, chave ou modelo): até quando e por quê; null sem pausa. */
  pausa: { ate: string; motivo: string | null } | null
}

/** Tudo o que o cartão "Assistente" mostra (só para quem tem integracoes.configurar: a página confere antes). */
export async function estadoDoAssistente(admin: Admin, workspaceId: string): Promise<EstadoDoAssistente> {
  const base = { chave: claudeConfigurado(), modelo: modeloDoAssistente(), esforco: esforcoDoAssistente() }
  const { error } = await admin.from('whatsapp_ia_config').select('workspace_id').eq('workspace_id', workspaceId).maybeSingle()
  if (error) return { ...base, pronto: false, config: null, numeros: null, pessoas: [], pausa: null }
  const [config, numeros, { data: membros }, { data: contas }] = await Promise.all([
    lerConfig(admin, workspaceId),
    numerosDeHoje(admin, workspaceId),
    admin.from('workspace_members').select('user_id, role, profiles(full_name, username, active)').eq('workspace_id', workspaceId).neq('role', 'escola').limit(3000),
    admin.from('whatsapp_contas').select('user_id'),
  ])
  const comWhatsapp = new Set((contas ?? []).map((c) => c.user_id as string))
  const pessoas = (membros ?? []).flatMap((m) => {
    const perfil = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string | null; username?: string | null; active?: boolean } | null
    if (!perfil || perfil.active === false) return []
    return [{ id: m.user_id as string, nome: perfil.full_name?.trim() || perfil.username || 'Sem nome', usuario: perfil.username ?? '', papel: String(m.role), whatsapp: comWhatsapp.has(m.user_id as string) }]
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const pausa = config?.pausada_ate && Date.parse(config.pausada_ate) > Date.now() ? { ate: config.pausada_ate, motivo: config.motivo_pausa } : null
  return { ...base, pronto: true, config, numeros, pessoas, pausa }
}

/**
 * A linha do assistente no "status" da administração (lib/whatsapp/admin.ts): o modo, se prepara ações, a pausa
 * e os números de hoje (conversas, gasto e teto, cache, recusas, pessoas no teto de consultas detalhadas). Sem a
 * configuração (ou sem a tabela), null: o "status" sai como sempre. Nunca lança.
 */
export async function assistenteNoStatus(admin: Admin, workspaceId: string, agora: Date = new Date()): Promise<AssistenteNoStatus | null> {
  try {
    const config = await lerConfig(admin, workspaceId)
    if (!config) return null
    const pausado = Boolean(config.pausada_ate && Date.parse(config.pausada_ate) > agora.getTime())
    const base = { modo: config.modo, escrita: config.escrita, pausado, teto: Number(config.teto_usd_dia) }
    if (config.modo === 'desligado') return { ...base, numeros: null }
    const [numeros, { data: detalhes }] = await Promise.all([
      numerosDeHoje(admin, workspaceId, agora),
      admin.from('whatsapp_ia_uso').select('user_id, leituras_detalhe').eq('workspace_id', workspaceId).gt('leituras_detalhe', 0)
        .gte('criado_em', inicioDoDiaEmBrasilia(agora).toISOString()).limit(5000),
    ])
    const porPessoa = new Map<string, number>()
    for (const d of detalhes ?? []) if (d.user_id) porPessoa.set(d.user_id as string, (porPessoa.get(d.user_id as string) ?? 0) + (Number(d.leituras_detalhe) || 0))
    const noTeto = [...porPessoa.values()].filter((n) => n >= config.leituras_detalhe_dia).length
    return { ...base, numeros: numeros ? { conversas: numeros.conversas, gasto: numeros.gasto, comCache: numeros.comCache, recusas: numeros.recusas, noTeto } : null }
  } catch {
    return null
  }
}
