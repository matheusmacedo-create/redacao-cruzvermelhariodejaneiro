import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { situacaoDasChaves } from '@/lib/integracoes/chaves'
import { PAPEL, ehPapel, pode } from '@/lib/permissoes'
import { situacaoDaConexao, situacaoDoWebhook, type ConfigDoWhatsapp } from './servidor'
import { cotaDeConversas, processarFila, resumoDaFila } from './fila'
import { falhasRecentes, ultimaRotina } from './estado'
import { criarConfirmacao } from './confirmacoes'
import {
  TEXTO_PEDE_QUEM_DESATIVAR, acharPeloNome, oQueDaDesativacao, resumoDasFalhas, situacaoDaSincronizacao, textoDeNinguemParaDesativar, textoDeQuemDesativar,
  textoDoComandoFila, textoDoLinkDeConfirmacao, textoDoStatus, type ComandoDaAdministracao, type OrigemDaEscola, type SincronizacaoDaEscola,
} from './regras'
import { INDISPONIVEL, type Pessoa } from './acoes'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Os comandos da administração pelo WhatsApp do Palácio, para quem administra
 * o espaço (a mesma permissão de Configurações → WhatsApp,
 * "integracoes.configurar") com o número confirmado em Meu perfil:
 *
 *  - "status" só lê: a conexão com a Kapso (com o exame de saúde), o
 *    recebimento (webhook), a fila, as conversas iniciadas nas últimas 24 h
 *    (a cota diária da Meta), as falhas de envio das últimas 24 h por
 *    motivo, as integrações sem chave (só os nomes, nunca os valores), as
 *    autorizações do Google expiradas, a última sincronização de cada conta
 *    da Escola (Únicopag e Meta: em dia, atrasada ou com o erro gravado) e a
 *    última rotina diária;
 *  - "fila" faz a fila andar agora, como "Enviar a fila agora". Não age em
 *    nome de ninguém nem manda nada novo — qualquer mensagem ao número já faz
 *    a fila andar (rota do webhook) —, por isso vale também para quem usa a
 *    verificação em duas etapas, ao contrário das ações de lib/whatsapp/acoes.ts.
 *
 * E, para quem gerencia usuários ("usuarios.gerenciar", a permissão da tela
 * de Usuários), "desativar conta: <nome ou usuário>": nada é desativado por
 * aqui — sai o link de confirmar no Palácio (lib/whatsapp/confirmacoes.ts), e
 * lá a desativação é a MESMA da tela (desativarUsuario: sessões encerradas,
 * login bloqueado, WhatsApp liberado, aviso e auditoria). Mudar papel, tirar
 * a verificação em duas etapas e mexer em chaves não têm caminho por aqui.
 *
 * Para quem não administra, as palavras nem viram comando (regras.ts,
 * lerPedido); aqui a permissão é conferida de novo. O registro do comando em
 * whatsapp_mensagens é o de sempre, feito pelo bot. Nunca lança.
 */

/** Rodada curta: a resposta não pode demorar, e a rota do webhook ainda roda a dela depois. */
const ORCAMENTO_DA_FILA_MS = 90_000
const LIMITE_DA_FILA = 20

export const ehAdministracao = (pessoa: Pessoa | null): boolean => Boolean(pessoa && pode(pessoa.papel, 'integracoes.configurar'))

/** Quem gerencia usuários (a tela de Usuários): só para estes "desativar conta: …" é comando. */
export const gerenciaUsuarios = (pessoa: Pessoa | null): boolean => Boolean(pessoa && pode(pessoa.papel, 'usuarios.gerenciar'))

/** Até tantas pessoas na lista de "achei mais de uma" (o usuário desfaz a dúvida). */
const QUEM_DESATIVAR_NA_LISTA = 9

/**
 * "desativar conta: Ana Lima": acha a pessoa ativa da equipe pelo nome ou pelo usuário (a própria pessoa fica
 * de fora: ninguém desativa a si mesmo, como na tela) e responde com o link de confirmar no Palácio. Mais de uma
 * com o nome, a lista com os usuários. null para quem não gerencia usuários (o bot segue como sempre).
 */
export async function pedirDesativacao(admin: Admin, workspaceId: string, pessoa: Pessoa, nome: string, base: string): Promise<string | null> {
  if (!gerenciaUsuarios(pessoa)) return null
  if (nome.trim().length < 2) return TEXTO_PEDE_QUEM_DESATIVAR
  try {
    const { data, error } = await admin.from('workspace_members').select('user_id, role, profiles(full_name, username, active)').eq('workspace_id', workspaceId)
    if (error) return `Não consegui ler a equipe agora. Desative pelo Palácio: ${base}/usuarios`
    const equipe = (data ?? []).flatMap((m) => {
      const perfil = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string | null; username?: string | null; active?: boolean } | null
      if (!perfil || perfil.active === false || m.user_id === pessoa.id || !perfil.username) return []
      return [{ id: m.user_id as string, nome: perfil.full_name?.trim() || perfil.username, usuario: perfil.username, papel: m.role as string, apelidos: [perfil.username] }]
    })
    const achados = acharPeloNome(equipe, nome)
    if (!achados.length) return textoDeNinguemParaDesativar(nome)
    if (achados.length > 1) return textoDeQuemDesativar(achados.slice(0, QUEM_DESATIVAR_NA_LISTA))
    const alvo = achados[0]
    const link = await criarConfirmacao(admin, { workspaceId, userId: pessoa.id, acao: 'desativar_conta', alvoId: alvo.id, dados: { nome: alvo.nome, usuario: alvo.usuario } })
    if ('erro' in link) return link.erro === 'limite' ? `Muitos links pedidos na última hora. Desative pelo Palácio: ${base}/usuarios` : `${INDISPONIVEL}: ${base}/usuarios`
    const papel = ehPapel(alvo.papel) ? PAPEL[alvo.papel].rotulo : alvo.papel
    return textoDoLinkDeConfirmacao({ oQue: oQueDaDesativacao({ nome: alvo.nome, usuario: alvo.usuario, papel }), url: link.url })
  } catch (causa) {
    console.error('[whatsapp] pedido de desativação não montado:', causa instanceof Error ? causa.message : causa)
    return `Não consegui montar o pedido agora. Desative pelo Palácio: ${base}/usuarios`
  }
}

/** A resposta ao comando; null para quem não administra (o bot segue como "desconhecido"). */
export async function respostaDaAdministracao(admin: Admin, workspaceId: string, pessoa: Pessoa, comando: ComandoDaAdministracao, config: ConfigDoWhatsapp, base: string): Promise<string | null> {
  if (!ehAdministracao(pessoa)) return null
  try {
    if (comando === 'fila') {
      const rodada = await processarFila(admin, workspaceId, { orcamentoMs: ORCAMENTO_DA_FILA_MS, limite: LIMITE_DA_FILA })
      return textoDoComandoFila({ rodada, fila: await resumoDaFila(admin, workspaceId) })
    }
    return await statusDoCanal(admin, workspaceId, config, base)
  } catch (causa) {
    console.error('[whatsapp] comando da administração falhou:', causa instanceof Error ? causa.message : causa)
    return `Não consegui montar a resposta agora. Veja em ${base}/configuracoes/whatsapp`
  }
}

/** O "status": tudo em paralelo; o que não der para ler sai como "não deu para ler agora". */
async function statusDoCanal(admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, base: string): Promise<string> {
  const [conexao, webhook, fila, cota, falhas, chaves, gmail, googleAdmin, rotina, escola] = await Promise.all([
    situacaoDaConexao(config),
    situacaoDoWebhook(config, workspaceId),
    resumoDaFila(admin, workspaceId),
    cotaDeConversas(admin, workspaceId),
    falhasRecentes(admin, workspaceId),
    // Só o nome do serviço e se há chave (lib/integracoes/chaves.ts nunca lê o valor aqui).
    situacaoDasChaves(admin, workspaceId).catch(() => null),
    admin.from('google_conexao').select('email_conta, estado').eq('workspace_id', workspaceId).maybeSingle(),
    admin.from('google_admin_conexao').select('email_conta, estado').eq('workspace_id', workspaceId).maybeSingle(),
    ultimaRotina(admin, workspaceId),
    sincronizacoesDaEscola(admin, workspaceId),
  ])
  const googleExpiradas = [
    gmail.data?.estado === 'expirada' ? { onde: 'E-mail dos setores', conta: String(gmail.data.email_conta ?? '') } : null,
    googleAdmin.data?.estado === 'expirada' ? { onde: 'Criar e-mails (conta de administrador)', conta: String(googleAdmin.data.email_conta ?? '') } : null,
  ].filter((g): g is { onde: string; conta: string } => g !== null)
  return textoDoStatus({
    conexao, webhook, fila, conversas: cota?.usadas ?? null,
    falhas: falhas ? { total: falhas.total, grupos: resumoDasFalhas(falhas.falhas) } : null,
    semChave: chaves ? chaves.filter((c) => !c.origem).map((c) => nomeCurto(c.nome)) : null,
    googleExpiradas, rotina, escola, urlBase: base,
  })
}

/**
 * As contas ativas da Escola — a Únicopag (saldo e transações) e o Meta (marketing) — com a última leitura
 * certa e o erro da última tentativa (o texto que lib/escola grava, sem chave nem dado de aluno). Sem conta
 * ativa, a lista vem vazia e a linha não sai; null = não deu para ler.
 */
async function sincronizacoesDaEscola(admin: Admin, workspaceId: string): Promise<SincronizacaoDaEscola[] | null> {
  try {
    const colunas = 'nome, sincronizada_em, sincronizacao_erro'
    const [unicopag, meta] = await Promise.all([
      admin.from('escola_contas').select(colunas).eq('workspace_id', workspaceId).eq('ativa', true).order('nome'),
      admin.from('escola_meta_contas').select(colunas).eq('workspace_id', workspaceId).eq('ativa', true).order('nome'),
    ])
    if (unicopag.error && meta.error) return null
    const agora = new Date()
    const ler = (origem: OrigemDaEscola, linhas: Record<string, unknown>[] | null) => (linhas ?? []).map((c): SincronizacaoDaEscola => {
      const conta = { sincronizadaEm: (c.sincronizada_em as string | null) ?? null, erro: (c.sincronizacao_erro as string | null) ?? null }
      return { origem, nome: (c.nome as string | null) ?? null, ...conta, situacao: situacaoDaSincronizacao(conta, agora) }
    })
    return [...ler('unicopag', unicopag.data), ...ler('meta', meta.data)]
  } catch {
    return null
  }
}

/** "Google (cliente OAuth do Gmail)" vira "Google (Gmail)"; o resto perde o parêntese (como na visão geral das Configurações). */
const nomeCurto = (nome: string) => nome.includes('Gmail') ? 'Google (Gmail)' : nome.replace(/ \(.*\)$/, '')
