import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarComSeguranca } from '@/lib/contas/servidor'
import { emailDeNotificacao } from '@/lib/notificacoes/emails'
import { notificar } from '@/lib/notificacoes/servidor'
import { urlBase } from '@/lib/newsletter/contexto'
import { lugar, rotuloDoAparelho, type DadosDaRequisicao } from './agente'
import {
  JANELA_MIN, LIMITE_POR_CONTA, LIMITE_POR_IP, ROTULO_DO_SINAL, sinaisDaEntrada, situacaoDoBloqueio,
  type Bloqueio, type SinaisDoNavegador, type SinalDeRisco,
} from './regras'

/**
 * O registro de acessos no servidor (docs/registro-de-acessos.md).
 *
 * Regra de ouro: NADA aqui pode impedir alguém de entrar. Toda função engole
 * o próprio erro e registra no log do servidor — banco sem a migração, tabela
 * cheia ou e-mail fora do ar deixam a entrada como era antes. A única exceção
 * é o bloqueio por tentativas, que é decisão deliberada (§5.1).
 */

type Admin = ReturnType<typeof createAdminClient>
export type TipoDeConta = 'equipe' | 'voluntario'
export type Evento = 'entrada' | 'entrada_falhou' | 'entrada_bloqueada' | 'mfa_ok' | 'mfa_falhou' | 'codigo_pedido' | 'saida'

/** O cookie que reconhece o aparelho. Só o hash dele vai ao banco. */
export const COOKIE_DO_APARELHO = 'cvrj_aparelho'
export const OPCOES_DO_COOKIE_DO_APARELHO = {
  httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/',
  // 400 dias é o máximo que os navegadores aceitam.
  maxAge: 400 * 24 * 60 * 60,
}

const sha = (texto: string) => createHash('sha256').update(texto).digest('hex')
export const hashDoIdentificador = (identificador: string) => sha(`acesso:${identificador.trim().toLowerCase()}`)
export const novoCookieDeAparelho = () => randomBytes(16).toString('hex')

const log = (rotulo: string, causa: unknown) =>
  console.error(`[acessos] ${rotulo}:`, causa instanceof Error ? causa.message : causa)

async function espacoPrincipal(admin: Admin): Promise<string | null> {
  const { data } = await admin.from('workspaces').select('id, kind').order('created_at').limit(5)
  const lista = (data ?? []) as { id: string; kind: string }[]
  return (lista.find((w) => w.kind === 'production') ?? lista[0])?.id ?? null
}

/** A conta da equipe por trás do que foi digitado (usuário ou e-mail), se existir. */
async function contaDaEquipe(admin: Admin, identificador: string): Promise<{ id: string; workspaceId: string | null } | null> {
  const valor = identificador.trim().toLowerCase().slice(0, 254)
  if (!valor) return null
  const consulta = admin.from('profiles').select('id')
  const { data } = await (valor.includes('@')
    ? consulta.eq('email', valor).not('email_confirmado_em', 'is', null)
    : consulta.eq('username', valor)).limit(1).maybeSingle()
  if (!data) return null
  const { data: vinculo } = await admin.from('workspace_members').select('workspace_id').eq('user_id', data.id).limit(1).maybeSingle()
  return { id: data.id as string, workspaceId: (vinculo?.workspace_id as string | undefined) ?? null }
}

type NovoEvento = {
  evento: Evento
  tipoDeConta: TipoDeConta
  contaId?: string | null
  workspaceId?: string | null
  identificador?: string | null
  requisicao: DadosDaRequisicao
  aparelhoId?: string | null
  sinais?: SinaisDoNavegador | null
  sinaisDeRisco?: SinalDeRisco[]
  motivo?: string | null
}

async function gravar(admin: Admin, e: NovoEvento): Promise<void> {
  const r = e.requisicao
  const { componentes, impressao, ...resto } = e.sinais ?? ({} as Partial<SinaisDoNavegador>)
  const { error } = await admin.from('acessos_eventos').insert({
    workspace_id: e.workspaceId ?? await espacoPrincipal(admin),
    evento: e.evento,
    tipo_de_conta: e.tipoDeConta,
    conta_id: e.contaId ?? null,
    identificador_hash: e.identificador ? hashDoIdentificador(e.identificador) : null,
    ip: r.ip, pais: r.pais, estado: r.estado, cidade: r.cidade, latitude: r.latitude, longitude: r.longitude, fuso: r.fuso,
    user_agent: r.userAgent, navegador: r.navegador?.slice(0, 60) ?? null, sistema: r.sistema?.slice(0, 60) ?? null, dispositivo: r.dispositivo,
    aparelho_id: e.aparelhoId ?? null,
    sinais: e.sinais ? { ...resto, componentes, idiomasDaRequisicao: r.idiomas } : (r.idiomas ? { idiomasDaRequisicao: r.idiomas } : {}),
    impressao: impressao ?? null,
    sinais_de_risco: e.sinaisDeRisco ?? [],
    motivo: e.motivo?.slice(0, 200) ?? null,
  })
  if (error) throw new Error(error.message)
}

/** Grava um evento sem nunca lançar. */
export async function registrarEvento(e: NovoEvento): Promise<void> {
  try { await gravar(createAdminClient(), e) } catch (causa) { log(`evento ${e.evento} não gravado`, causa) }
}

// ------------------------------------------------------------ bloqueio

/** Confere as tentativas erradas recentes da conta digitada e do IP. */
export async function conferirBloqueio(identificador: string, ip: string | null): Promise<Bloqueio> {
  try {
    const admin = createAdminClient()
    const desde = new Date(Date.now() - JANELA_MIN * 60_000).toISOString()
    const [{ data: daConta, error }, { data: doIp }] = await Promise.all([
      admin.from('acessos_eventos').select('ocorrido_em').eq('identificador_hash', hashDoIdentificador(identificador))
        .eq('evento', 'entrada_falhou').gte('ocorrido_em', desde).order('ocorrido_em', { ascending: false }).limit(LIMITE_POR_CONTA),
      ip
        ? admin.from('acessos_eventos').select('ocorrido_em').eq('ip', ip).eq('tipo_de_conta', 'equipe')
          .eq('evento', 'entrada_falhou').gte('ocorrido_em', desde).order('ocorrido_em', { ascending: false }).limit(LIMITE_POR_IP)
        : Promise.resolve({ data: [] as { ocorrido_em: string }[] }),
    ])
    if (error) throw new Error(error.message)
    const agora = new Date()
    const porConta = situacaoDoBloqueio((daConta ?? []).map((l) => l.ocorrido_em), agora, LIMITE_POR_CONTA)
    if (porConta.bloqueado) return porConta
    return situacaoDoBloqueio((doIp ?? []).map((l) => l.ocorrido_em), agora, LIMITE_POR_IP)
  } catch (causa) {
    // Sem como conferir (banco sem a migração, por exemplo): não bloqueia.
    log('bloqueio não conferido', causa)
    return { bloqueado: false }
  }
}

// ------------------------------------------------------------ equipe

/** Tentativa com senha errada ou conta desativada. Avisa quem lê o registro quando a conta é bloqueada. */
export async function registrarFalhaDaEquipe(identificador: string, motivo: string, requisicao: DadosDaRequisicao, sinais: SinaisDoNavegador | null) {
  try {
    const admin = createAdminClient()
    const conta = await contaDaEquipe(admin, identificador)
    await gravar(admin, {
      evento: 'entrada_falhou', tipoDeConta: 'equipe', contaId: conta?.id, workspaceId: conta?.workspaceId,
      identificador, requisicao, sinais, motivo: conta ? motivo : `${motivo} (usuário inexistente)`,
    })
    const bloqueio = await conferirBloqueio(identificador, requisicao.ip)
    if (!bloqueio.bloqueado) return
    // Só na tentativa que fecha o bloqueio: as seguintes nem chegam aqui (a tela para antes).
    const desde = new Date(Date.now() - JANELA_MIN * 60_000).toISOString()
    const { count } = await admin.from('acessos_eventos').select('id', { count: 'exact', head: true })
      .eq('identificador_hash', hashDoIdentificador(identificador)).eq('evento', 'entrada_falhou').gte('ocorrido_em', desde)
    if ((count ?? 0) !== LIMITE_POR_CONTA) return
    await avisarLeitores(admin, conta?.workspaceId ?? await espacoPrincipal(admin), {
      titulo: 'Conta bloqueada por tentativas erradas',
      mensagem: `${LIMITE_POR_CONTA} senhas erradas em ${JANELA_MIN} minutos para "${identificador.slice(0, 60)}", de ${lugar(requisicao)} (${requisicao.ip ?? 'IP desconhecido'}).`,
    })
  } catch (causa) { log('falha não registrada', causa) }
}

/**
 * Entrada certa de alguém da equipe: reconhece (ou cadastra) o aparelho,
 * calcula os sinais de risco, grava o evento e manda os alertas. Devolve o
 * cookie de aparelho a gravar quando ele ainda não existia.
 */
export async function registrarEntradaDaEquipe(p: {
  userId: string
  requisicao: DadosDaRequisicao
  sinais: SinaisDoNavegador | null
  cookieAtual: string | null
}): Promise<{ novoCookie: string | null }> {
  const novoCookie = p.cookieAtual && /^[0-9a-f]{32}$/.test(p.cookieAtual) ? null : novoCookieDeAparelho()
  try {
    const admin = createAdminClient()
    const cookie = novoCookie ?? p.cookieAtual!
    const cookieHash = sha(`aparelho:${cookie}`)
    const { data: vinculo } = await admin.from('workspace_members').select('workspace_id').eq('user_id', p.userId).limit(1).maybeSingle()
    const workspaceId = (vinculo?.workspace_id as string | undefined) ?? await espacoPrincipal(admin)
    if (!workspaceId) return { novoCookie }

    const noventaDias = new Date(Date.now() - 90 * 24 * 60 * 60_000).toISOString()
    const [{ data: aparelhos }, { data: anteriores }, { count: falhasAntes }] = await Promise.all([
      admin.from('acessos_aparelhos').select('id, cookie_hash, assinatura, impressao').eq('tipo_de_conta', 'equipe').eq('conta_id', p.userId),
      admin.from('acessos_eventos').select('pais').eq('tipo_de_conta', 'equipe').eq('conta_id', p.userId).eq('evento', 'entrada').gte('ocorrido_em', noventaDias).limit(500),
      admin.from('acessos_eventos').select('id', { count: 'exact', head: true }).eq('tipo_de_conta', 'equipe').eq('conta_id', p.userId)
        .eq('evento', 'entrada_falhou').gte('ocorrido_em', new Date(Date.now() - JANELA_MIN * 60_000).toISOString()),
    ])
    const lista = (aparelhos ?? []) as { id: string; cookie_hash: string; assinatura: string | null; impressao: string | null }[]
    // O mesmo aparelho: pelo cookie; sem ele (apagado, aba anônima), pela impressão digital; por último, pela assinatura.
    const conhecido = lista.find((a) => a.cookie_hash === cookieHash)
      ?? (p.sinais?.impressao ? lista.find((a) => a.impressao === p.sinais!.impressao) : undefined)
      ?? (p.sinais?.assinatura ? lista.find((a) => a.assinatura === p.sinais!.assinatura) : undefined)
    const { count: temAlgum } = await admin.from('acessos_eventos').select('id', { count: 'exact', head: true })
      .eq('tipo_de_conta', 'equipe').eq('conta_id', p.userId).eq('evento', 'entrada')

    const sinaisDeRisco = sinaisDaEntrada({
      temHistorico: (temAlgum ?? 0) > 0,
      aparelhoConhecido: Boolean(conhecido),
      paisesConhecidos: [...new Set((anteriores ?? []).map((a) => a.pais as string).filter(Boolean))],
      pais: p.requisicao.pais,
      fusoDoNavegador: p.sinais?.fuso ?? null,
      fusoDoIp: p.requisicao.fuso,
      falhasAntes: falhasAntes ?? 0,
    })

    const agora = new Date().toISOString()
    const comum = {
      ultimo_em: agora, ultimo_ip: p.requisicao.ip, ultima_cidade: lugar(p.requisicao).slice(0, 200),
      rotulo: rotuloDoAparelho(p.requisicao), cookie_hash: cookieHash,
      ...(p.sinais?.assinatura ? { assinatura: p.sinais.assinatura } : {}),
      ...(p.sinais?.impressao ? { impressao: p.sinais.impressao } : {}),
    }
    let aparelhoId = conhecido?.id ?? null
    if (conhecido) {
      const { error } = await admin.from('acessos_aparelhos').update(comum).eq('id', conhecido.id)
      if (error) log('aparelho não atualizado', error.message)
    } else {
      const { data, error } = await admin.from('acessos_aparelhos')
        .insert({ workspace_id: workspaceId, tipo_de_conta: 'equipe', conta_id: p.userId, primeiro_em: agora, ...comum })
        .select('id').single()
      if (error) log('aparelho não cadastrado', error.message)
      aparelhoId = (data?.id as string | undefined) ?? null
    }

    await gravar(admin, {
      evento: 'entrada', tipoDeConta: 'equipe', contaId: p.userId, workspaceId, requisicao: p.requisicao,
      aparelhoId, sinais: p.sinais, sinaisDeRisco,
    })

    if (sinaisDeRisco.includes('aparelho_novo') || sinaisDeRisco.includes('pais_novo')) {
      await avisarAPessoa(admin, p.userId, p.requisicao, sinaisDeRisco)
    }
    if (sinaisDeRisco.includes('pais_novo')) {
      const { data: pessoa } = await admin.from('profiles').select('full_name').eq('id', p.userId).maybeSingle()
      await avisarLeitores(admin, workspaceId, {
        titulo: 'Acesso de um país novo',
        mensagem: `${pessoa?.full_name ?? 'Alguém da equipe'} entrou de ${lugar(p.requisicao)} (${rotuloDoAparelho(p.requisicao)}).`,
      })
    }
  } catch (causa) { log('entrada não registrada', causa) }
  return { novoCookie }
}

/** Verificação em duas etapas (o código do app autenticador). */
export async function registrarVerificacaoDaEquipe(userId: string, ok: boolean, requisicao: DadosDaRequisicao, cookieAtual: string | null) {
  try {
    const admin = createAdminClient()
    const { data: vinculo } = await admin.from('workspace_members').select('workspace_id').eq('user_id', userId).limit(1).maybeSingle()
    let aparelhoId: string | null = null
    if (cookieAtual) {
      const { data } = await admin.from('acessos_aparelhos').select('id').eq('tipo_de_conta', 'equipe').eq('conta_id', userId)
        .eq('cookie_hash', sha(`aparelho:${cookieAtual}`)).maybeSingle()
      aparelhoId = (data?.id as string | undefined) ?? null
    }
    await gravar(admin, {
      evento: ok ? 'mfa_ok' : 'mfa_falhou', tipoDeConta: 'equipe', contaId: userId,
      workspaceId: vinculo?.workspace_id as string | undefined, requisicao, aparelhoId,
      motivo: ok ? null : 'Código do app autenticador errado',
    })
  } catch (causa) { log('verificação não registrada', causa) }
}

// ------------------------------------------------------------ alertas

/**
 * E-mail direto à própria pessoa, fora das preferências de notificação:
 * aviso de segurança não pode depender de alguém ter desligado o e-mail.
 */
async function avisarAPessoa(admin: Admin, userId: string, r: DadosDaRequisicao, sinais: SinalDeRisco[]) {
  try {
    const { data: pessoa } = await admin.from('profiles').select('full_name, email, email_confirmado_em, active').eq('id', userId).maybeSingle()
    if (!pessoa?.active || !pessoa.email || !pessoa.email_confirmado_em) return
    const quando = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date())
    const motivo = sinais.filter((s) => s === 'aparelho_novo' || s === 'pais_novo').map((s) => ROTULO_DO_SINAL[s].toLowerCase()).join(' e ')
    await enviarComSeguranca(pessoa.email, emailDeNotificacao({
      urlBase: urlBase(),
      nome: pessoa.full_name ?? '',
      titulo: 'Novo acesso à sua conta do Palácio Virtual',
      mensagem: `Sua conta do Palácio Virtual acabou de ser acessada (${motivo}): ${rotuloDoAparelho(r)}, em ${lugar(r)}, em ${quando}.`,
      citacao: 'Se foi você, não precisa fazer nada. Se não foi, troque sua senha agora em Meu perfil e avise a administração.',
      link: '/perfil',
      botao: 'Abrir Meu perfil',
      nota: 'Este aviso de segurança é enviado sempre, independentemente das suas preferências de notificação.',
    }))
  } catch (causa) { log('aviso à pessoa não enviado', causa) }
}

/** Sino (e e-mail, conforme a preferência) para quem lê o registro de acessos. */
async function avisarLeitores(admin: Admin, workspaceId: string | null, aviso: { titulo: string; mensagem: string }) {
  if (!workspaceId) return
  try {
    const { data } = await admin.from('acessos_leitores').select('user_id').eq('workspace_id', workspaceId)
    await notificar(admin, {
      workspaceId, para: (data ?? []).map((l) => l.user_id as string), atorId: null, categoria: 'auditoria',
      titulo: aviso.titulo, mensagem: aviso.mensagem, link: '/acessos', botao: 'Abrir o registro de acessos',
    })
  } catch (causa) { log('aviso aos leitores não enviado', causa) }
}

// ------------------------------------------------------------ leitura

/** Esta pessoa lê o registro de acessos deste espaço? (Decisão de 25/09/2026: só o Matheus.) */
export async function podeVerAcessos(userId: string, workspaceId: string): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().from('acessos_leitores').select('user_id')
      .eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle()
    return !error && Boolean(data)
  } catch { return false }
}
