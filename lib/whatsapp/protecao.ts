import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { auditarConta, avisar, encerrarSessoesDaConta, revogarLinksDaConta } from '@/lib/contas/servidor'
import { notificar } from '@/lib/notificacoes/servidor'
import { encerrarPendencia } from './acoes'
import { redigirVencidos } from './assistente/faxina'
import {
  BOTOES_DA_CONFERENCIA, MARCA_DO_NAO_FUI_EU, NAO_FUI_EU_CITANDO_DIAS, NAO_FUI_EU_VALE_HORAS, PENDENCIA_VALE_MIN, TEXTO_NAO_FUI_EU_INDISPONIVEL,
  TEXTO_NAO_FUI_EU_JA_FEITO, TEXTO_NAO_FUI_EU_SEM_AVISO, ehCancelamento, ehConfirmacao, ehNaoFuiEu, mascararNumero, textoDaConferenciaDoNaoFuiEu, textoDoNaoFuiEuFeito,
  type Interativo, type MensagemRecebida,
} from './regras'

/**
 * "Não fui eu": a resposta a um aviso de segurança da conta pelo WhatsApp.
 *
 * O aviso de algo que a própria pessoa faria — acesso de um aparelho ou país
 * novo, entrada bloqueada, senha trocada, verificação mexida, e-mail trocado,
 * e o recado ao número antigo quando o WhatsApp da conta é trocado ou
 * removido — termina com "Responda NÃO FUI EU se não foi você" (e, dentro da
 * janela, o botão). A saída desse aviso fica marcada no registro
 * (whatsapp_mensagens.comando = "nao_fui_eu", lib/whatsapp/fila.ts).
 *
 * A resposta vale citando o aviso (até NAO_FUI_EU_CITANDO_DIAS) ou, sem
 * citar, até NAO_FUI_EU_VALE_HORAS depois dele; citando outra mensagem (o
 * aviso de um chamado, do Chat), segue o caminho de sempre. É PROTEÇÃO, não
 * ação em nome da pessoa: vale mesmo para quem usa a verificação em duas
 * etapas e vale do número a que o aviso foi — inclusive o antigo, que já não
 * está em whatsapp_contas (é justamente por ele que a pessoa descobre que
 * trocaram o número dela). Só não vale se, nesse meio-tempo, o número foi
 * confirmado em OUTRA conta: ali já é de outra pessoa. Cada aviso protege uma
 * vez só, e do número que já não é da conta, uma proteção a cada
 * NAO_FUI_EU_VALE_HORAS basta (jaProtegida, pela auditoria de acesso): quem
 * ficou com o número antigo não derruba as sessões da pessoa, nem o link de
 * senha que ela acabou de pedir, a cada rodada — nem fecha as perguntas que
 * ela tem abertas pelo número de agora.
 *
 * Antes, a conferência ("confirmo"), para um toque por engano não derrubar
 * ninguém. Ela fica em whatsapp_pendencias (tipo "nao_fui_eu", migração
 * 20261018223000), com o número em `dados`, e só esse número a responde:
 * quem está com o número de agora da conta não a responde nem a cancela.
 * Confirmado, protegerConta: encerra todas as sessões, cancela os links de
 * senha, de convite e de confirmação pendentes, avisa a administração (sino e,
 * conforme a preferência, e-mail e WhatsApp, categoria "auditoria", a dos
 * alertas de acesso) e a própria pessoa (e-mail confirmado) e registra na
 * auditoria de acesso, com o aviso respondido. Não troca a senha nem desativa
 * a conta.
 *
 * Antes da migração, a conferência não tem onde ficar e o bot orienta a
 * trocar a senha e falar com a administração. Nada aqui lança.
 *
 * O recibo de um plano do assistente confirmado pelo WhatsApp também oferece o
 * "Não fui eu" (sai como aviso de segurança, com a mesma linha e a mesma
 * marca): quem pegou o celular destravado não age em nome da pessoa em
 * silêncio. Protegida a conta, o assistente também para no número dela (até
 * ela confirmar o número de novo, com login) e o plano que estiver aberto ou
 * esperando o Palácio é cancelado.
 */

type Admin = ReturnType<typeof createAdminClient>

/** A resposta do bot e, se ela pergunta, a pendência a marcar com o id da mensagem que saiu. */
export type RespostaDaProtecao = { texto: string; interativo?: Interativo | null; pergunta?: number | null }

/** O que fazer com a mensagem: a marca no registro da entrada e a resposta (que, no "confirmo", protege a conta). */
export type ConversaDeProtecao = { comando: string; responder: () => Promise<RespostaDaProtecao> }

type AvisoDoNumero = { userId: string; mensagemId: string | null }
type PerguntaDoNumero = { id: number; userId: string; aberta: boolean; criadoEm: string; aviso: string | null }

/**
 * A mensagem é do "Não fui eu"? A resposta ao aviso, ou a conferência dele (citada, ou "confirmo"/"cancelar" sem
 * citar). null para o resto, que segue o caminho de sempre. `donoDoNumero`: de quem é o número hoje em
 * whatsapp_contas (null: de ninguém, como o número antigo de uma conta).
 */
export async function conversaDeProtecao(admin: Admin, workspaceId: string, numero: string, m: MensagemRecebida, donoDoNumero: string | null): Promise<ConversaDeProtecao | null> {
  try {
    const texto = m.texto
    if (m.citada || ehConfirmacao(texto) || ehCancelamento(texto)) {
      const p = await perguntaDoNumero(admin, workspaceId, numero, m.citada)
      // O número passou para outra conta: a pergunta antiga não pega as mensagens de quem está com ele agora (nem o toque
      // no botão que ficou no histórico). Sem citar, só se ela é a pergunta mais nova da pessoa (o "confirmo" de uma
      // conferência aberta depois é daquela).
      const doNumeroAinda = p && (!donoDoNumero || donoDoNumero === p.userId)
      if (p && doNumeroAinda && (m.citada || !donoDoNumero || !await temPerguntaMaisNova(admin, workspaceId, donoDoNumero, p.criadoEm))) {
        return { comando: 'pendencia_nao_fui_eu', responder: () => seguir(admin, workspaceId, numero, p, texto, donoDoNumero) }
      }
    }
    if (!ehNaoFuiEu(texto)) return null
    const aviso = await avisoDoNumero(admin, workspaceId, numero, m.citada)
    // Citou outra mensagem (o aviso do Chat "Quem apagou a planilha?"): a resposta segue para ela, como sempre.
    if (!aviso && m.citada) return null
    // O número passou para outra conta depois do aviso: não é mais de quem recebeu.
    if (!aviso || (donoDoNumero && donoDoNumero !== aviso.userId)) {
      // Número de ninguém da equipe segue o caminho de sempre (a apresentação); quem é da equipe ouve o que fazer.
      return donoDoNumero ? { comando: 'nao_fui_eu', responder: async () => ({ texto: TEXTO_NAO_FUI_EU_SEM_AVISO }) } : null
    }
    return { comando: 'nao_fui_eu', responder: () => perguntar(admin, workspaceId, numero, aviso, donoDoNumero === aviso.userId) }
  } catch (causa) {
    console.error('[whatsapp] "não fui eu" não conferido:', causa instanceof Error ? causa.message : causa)
    return null
  }
}

/**
 * O aviso de segurança com o "Não fui eu" que saiu para este número: citando, só o citado (até 7 dias; outra
 * mensagem citada não é ele); sem citar, o mais novo das últimas 24 h.
 */
async function avisoDoNumero(admin: Admin, workspaceId: string, numero: string, citada: string | null): Promise<AvisoDoNumero | null> {
  const base = () => admin.from('whatsapp_mensagens').select('user_id, mensagem_id').eq('workspace_id', workspaceId).eq('direcao', 'saida')
    .eq('tipo', 'seguranca').eq('situacao', 'enviada').eq('comando', MARCA_DO_NAO_FUI_EU).eq('numero', numero).not('user_id', 'is', null)
  if (citada) {
    const desde = new Date(Date.now() - NAO_FUI_EU_CITANDO_DIAS * 86_400_000).toISOString()
    const { data } = await base().eq('mensagem_id', citada).gte('criado_em', desde).limit(1).maybeSingle()
    return data?.user_id ? { userId: data.user_id as string, mensagemId: (data.mensagem_id as string | null) ?? null } : null
  }
  const desde = new Date(Date.now() - NAO_FUI_EU_VALE_HORAS * 3_600_000).toISOString()
  const { data } = await base().gte('criado_em', desde).order('criado_em', { ascending: false }).limit(1).maybeSingle()
  return data?.user_id ? { userId: data.user_id as string, mensagemId: (data.mensagem_id as string | null) ?? null } : null
}

/** A conferência do "Não fui eu" deste número: a citada (aberta ou não) ou, sem citar, a aberta mais nova. */
async function perguntaDoNumero(admin: Admin, workspaceId: string, numero: string, citada: string | null): Promise<PerguntaDoNumero | null> {
  let consulta = admin.from('whatsapp_pendencias').select('id, user_id, dados, criado_em, encerrada_em, expira_em')
    .eq('workspace_id', workspaceId).eq('tipo', 'nao_fui_eu').eq('dados->>numero', numero)
  consulta = citada ? consulta.eq('mensagem_id', citada) : consulta.is('encerrada_em', null).gt('expira_em', new Date().toISOString())
  const { data, error } = await consulta.order('criado_em', { ascending: false }).limit(1).maybeSingle()
  if (error || !data) return null
  const aberta = !data.encerrada_em && new Date(data.expira_em as string).getTime() > Date.now()
  const aviso = (data.dados as { aviso?: unknown } | null)?.aviso
  return { id: data.id as number, userId: data.user_id as string, aberta, criadoEm: data.criado_em as string, aviso: typeof aviso === 'string' ? aviso : null }
}

/**
 * A pessoa tem outra pergunta aberta, feita depois desta (a conferência de um voto, um chamado em etapas, ou o plano
 * ou a pergunta do assistente: o "confirmo" do plano que chegou depois é dele)? Sem a tabela do assistente (migração
 * ainda não aplicada), a consulta dela falha e só as perguntas do bot contam.
 */
async function temPerguntaMaisNova(admin: Admin, workspaceId: string, userId: string, desde: string): Promise<boolean> {
  const agora = new Date().toISOString()
  const [{ data }, { data: doAssistente }] = await Promise.all([
    admin.from('whatsapp_pendencias').select('id').eq('workspace_id', workspaceId).eq('user_id', userId)
      .is('encerrada_em', null).gt('expira_em', agora).neq('tipo', 'nao_fui_eu').gt('criado_em', desde).limit(1).maybeSingle(),
    admin.from('whatsapp_ia_planos').select('id').eq('workspace_id', workspaceId).eq('user_id', userId)
      .in('situacao', ['pergunta', 'aberto', 'em_revisao']).gt('criado_em', desde).gt('expira_em', agora).limit(1).maybeSingle(),
  ])
  return Boolean(data || doAssistente)
}

/**
 * O "Não fui eu" já valeu? O aviso que já protegeu a conta não vale de novo (nem citado, nos 7 dias), e do número
 * que já não é da conta uma proteção nas últimas NAO_FUI_EU_VALE_HORAS basta. Pela auditoria de acesso, que
 * protegerConta grava com o aviso respondido. Na dúvida (a consulta falhou), não: a proteção segue.
 */
async function jaProtegida(admin: Admin, workspaceId: string, userId: string, aviso: string | null, daConta: boolean): Promise<boolean> {
  const base = () => admin.from('auditoria_de_acesso').select('id').eq('workspace_id', workspaceId).eq('alvo_id', userId).eq('acao', 'nao_fui_eu')
  if (aviso) {
    const { data } = await base().eq('detalhes->>aviso', aviso).limit(1).maybeSingle()
    if (data) return true
  }
  if (daConta) return false
  const desde = new Date(Date.now() - NAO_FUI_EU_VALE_HORAS * 3_600_000).toISOString()
  const { data } = await base().gte('criado_em', desde).limit(1).maybeSingle()
  return Boolean(data)
}

/**
 * A conferência, guardada antes de sair. Do número da conta, as outras perguntas abertas dela caem (menos o envio
 * de fotos); do número antigo, só a conferência anterior dele: quem está com esse número não mexe nas conversas que
 * a pessoa tem pelo número de agora.
 */
async function perguntar(admin: Admin, workspaceId: string, numero: string, aviso: AvisoDoNumero, daConta: boolean): Promise<RespostaDaProtecao> {
  const { data: perfil } = await admin.from('profiles').select('active').eq('id', aviso.userId).maybeSingle()
  if (perfil?.active === false) return { texto: 'Esta conta já está desativada: ninguém entra nela. Dúvidas? Fale com a administração.' }
  if (await jaProtegida(admin, workspaceId, aviso.userId, aviso.mensagemId, daConta)) return { texto: TEXTO_NAO_FUI_EU_JA_FEITO }
  const agora = new Date()
  const abertas = admin.from('whatsapp_pendencias').update({ encerrada_em: agora.toISOString() }).eq('user_id', aviso.userId).is('encerrada_em', null)
  await (daConta ? abertas.neq('tipo', 'envio') : abertas.eq('tipo', 'nao_fui_eu').eq('dados->>numero', numero))
  const { data, error } = await admin.from('whatsapp_pendencias').insert({
    workspace_id: workspaceId, user_id: aviso.userId, tipo: 'nao_fui_eu', dados: { numero, aviso: aviso.mensagemId, daConta },
    expira_em: new Date(agora.getTime() + PENDENCIA_VALE_MIN * 60_000).toISOString(),
  }).select('id').single()
  // Sem a migração, o tipo novo fica fora do CHECK: o caminho de sempre, a senha e a administração.
  if (error || !data) return { texto: TEXTO_NAO_FUI_EU_INDISPONIVEL }
  return { texto: textoDaConferenciaDoNaoFuiEu({ daConta }), interativo: BOTOES_DA_CONFERENCIA, pergunta: data.id as number }
}

async function seguir(admin: Admin, workspaceId: string, numero: string, p: PerguntaDoNumero, texto: string, donoDoNumero: string | null): Promise<RespostaDaProtecao> {
  if (!p.aberta) return { texto: 'Esta pergunta não vale mais: já foi respondida, venceu ou foi trocada por outra. Se precisar, responda *NÃO FUI EU* de novo.' }
  if (ehCancelamento(texto)) {
    await encerrarPendencia(admin, p.id)
    return { texto: 'Pronto: nada mudou na conta.' }
  }
  if (!ehConfirmacao(texto)) return { texto: 'Para proteger a conta, responda a pergunta com *confirmo*; se foi engano, *cancelar*.' }
  // Duas respostas seguidas (o toque duplo) chegam em entregas paralelas: só uma protege.
  if (!await encerrarPendencia(admin, p.id)) return { texto: 'Esta pergunta já foi respondida.' }
  // O número passou para outra conta enquanto a pergunta esperava: não é mais de quem recebeu o aviso.
  if (donoDoNumero && donoDoNumero !== p.userId) return { texto: TEXTO_NAO_FUI_EU_SEM_AVISO }
  const daConta = donoDoNumero === p.userId
  // O aviso já protegeu a conta, ou o número antigo já protegeu há pouco: não derruba tudo de novo.
  if (await jaProtegida(admin, workspaceId, p.userId, p.aviso, daConta)) return { texto: TEXTO_NAO_FUI_EU_JA_FEITO }
  await protegerConta(admin, workspaceId, p.userId, { numero, daConta, aviso: p.aviso })
  return { texto: textoDoNaoFuiEuFeito({ daConta }) }
}

/**
 * Protege a conta: encerra todas as sessões (em qualquer aparelho), cancela os links de conta e os códigos do
 * WhatsApp pendentes, registra na auditoria de acesso (com `aviso`, o id do aviso respondido: é por ele que o
 * mesmo aviso não vale de novo) e avisa a administração e a pessoa. Cada passo engole o próprio erro: um e-mail
 * fora do ar não deixa as sessões abertas.
 */
export async function protegerConta(admin: Admin, workspaceId: string, userId: string, p: { numero: string; daConta: boolean; aviso: string | null }): Promise<void> {
  const [sessoes, links, { data: pessoa }] = await Promise.all([
    encerrarSessoesDaConta(admin, userId),
    revogarLinksDaConta(admin, userId),
    admin.from('profiles').select('full_name, username').eq('id', userId).maybeSingle(),
    pararOAssistente(admin, userId),
  ])
  const nome = (pessoa?.full_name as string | null)?.trim() || (pessoa?.username as string | null) || 'Alguém da equipe'
  await auditarConta(admin, {
    userId, atorId: userId, acao: 'nao_fui_eu', workspaceId,
    detalhes: { caminho: 'whatsapp', numero: mascararNumero(p.numero), numero_da_conta: p.daConta, aviso: p.aviso, sessoes_encerradas: sessoes, links_revogados: links },
  })
  await Promise.all([
    avisarAdministracao(admin, workspaceId, userId, nome, p.daConta),
    // Só o e-mail: a resposta no WhatsApp já diz o que foi feito.
    avisar(admin, userId, { tipo: 'sessoes_encerradas', numeroAntigo: !p.daConta }, { whatsapp: null }).catch(() => false),
  ])
}

/**
 * O assistente do WhatsApp para no número da conta (assistente_suspenso_em, como na troca do nome de perfil: volta
 * quando a pessoa confirma o número de novo, o que exige login) e o plano aberto, ou esperando o Palácio, é cancelado
 * e redigido. Sem as colunas e a tabela do assistente (migração ainda não aplicada), não faz nada. Nunca lança.
 */
async function pararOAssistente(admin: Admin, userId: string): Promise<void> {
  try {
    const agora = new Date().toISOString()
    await admin.from('whatsapp_contas').update({ assistente_suspenso_em: agora }).eq('user_id', userId).is('assistente_suspenso_em', null)
    const { data: cancelados } = await admin.from('whatsapp_ia_planos').update({ situacao: 'cancelado', atualizado_em: agora })
      .eq('user_id', userId).in('situacao', ['pergunta', 'aberto', 'em_revisao', 'no_palacio']).select('id')
    if (cancelados?.length) await redigirVencidos(admin, { limite: 10, userId })
  } catch (causa) {
    console.error('[whatsapp] "não fui eu": assistente não parado:', causa instanceof Error ? causa.message : causa)
  }
}

/** Sino, e-mail e WhatsApp (conforme a preferência, na categoria dos alertas de acesso) para os administradores e quem lê o registro de acessos. */
async function avisarAdministracao(admin: Admin, workspaceId: string, userId: string, nome: string, daConta: boolean): Promise<void> {
  try {
    const [{ data: admins }, { data: leitores }] = await Promise.all([
      admin.from('workspace_members').select('user_id, profiles(active)').eq('workspace_id', workspaceId).eq('role', 'admin'),
      admin.from('acessos_leitores').select('user_id').eq('workspace_id', workspaceId),
    ])
    const ativos = (admins ?? []).filter((a) => (Array.isArray(a.profiles) ? a.profiles[0] : a.profiles as { active?: boolean } | null)?.active !== false)
    const para = [...new Set([...ativos, ...(leitores ?? [])].map((x) => x.user_id as string))]
    await notificar(admin, {
      workspaceId, para, atorId: userId, categoria: 'auditoria',
      titulo: `“Não fui eu”: sessões de ${nome} encerradas`,
      mensagem: `${nome} respondeu “Não fui eu” a um aviso de segurança pelo WhatsApp${daConta ? '' : ', do número que a conta usava antes'}. Todas as sessões da conta foram encerradas; a senha não mudou e a conta segue ativa. Fale com a pessoa por outro canal.`,
      link: '/usuarios', botao: 'Abrir Usuários e permissões',
    })
  } catch (causa) {
    console.error('[whatsapp] aviso do "não fui eu" à administração não enviado:', causa instanceof Error ? causa.message : causa)
  }
}
