import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { situacaoDasChaves } from '@/lib/integracoes/chaves'
import { pode } from '@/lib/permissoes'
import { situacaoDaConexao, situacaoDoWebhook, type ConfigDoWhatsapp } from './servidor'
import { processarFila, resumoDaFila } from './fila'
import { falhasRecentes, ultimaRotina } from './estado'
import { resumoDasFalhas, textoDoComandoFila, textoDoStatus, type ComandoDaAdministracao } from './regras'
import type { Pessoa } from './acoes'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Os comandos da administração pelo WhatsApp do Palácio, para quem administra
 * o espaço (a mesma permissão de Configurações → WhatsApp,
 * "integracoes.configurar") com o número confirmado em Meu perfil:
 *
 *  - "status" só lê: a conexão com a Kapso (com o exame de saúde), o
 *    recebimento (webhook), a fila, as falhas de envio das últimas 24 h por
 *    motivo, as integrações sem chave (só os nomes, nunca os valores), as
 *    autorizações do Google expiradas e a última rotina diária;
 *  - "fila" faz a fila andar agora, como "Enviar a fila agora". Não age em
 *    nome de ninguém nem manda nada novo — qualquer mensagem ao número já faz
 *    a fila andar (rota do webhook) —, por isso vale também para quem usa a
 *    verificação em duas etapas, ao contrário das ações de lib/whatsapp/acoes.ts.
 *
 * Para quem não administra, as palavras nem viram comando (regras.ts,
 * lerPedido); aqui a permissão é conferida de novo. O registro do comando em
 * whatsapp_mensagens é o de sempre, feito pelo bot. Nunca lança.
 */

/** Rodada curta: a resposta não pode demorar, e a rota do webhook ainda roda a dela depois. */
const ORCAMENTO_DA_FILA_MS = 90_000
const LIMITE_DA_FILA = 20

export const ehAdministracao = (pessoa: Pessoa | null): boolean => Boolean(pessoa && pode(pessoa.papel, 'integracoes.configurar'))

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
  const [conexao, webhook, fila, falhas, chaves, gmail, googleAdmin, rotina] = await Promise.all([
    situacaoDaConexao(config),
    situacaoDoWebhook(config, workspaceId),
    resumoDaFila(admin, workspaceId),
    falhasRecentes(admin, workspaceId),
    // Só o nome do serviço e se há chave (lib/integracoes/chaves.ts nunca lê o valor aqui).
    situacaoDasChaves(admin, workspaceId).catch(() => null),
    admin.from('google_conexao').select('email_conta, estado').eq('workspace_id', workspaceId).maybeSingle(),
    admin.from('google_admin_conexao').select('email_conta, estado').eq('workspace_id', workspaceId).maybeSingle(),
    ultimaRotina(admin, workspaceId),
  ])
  const googleExpiradas = [
    gmail.data?.estado === 'expirada' ? { onde: 'E-mail dos setores', conta: String(gmail.data.email_conta ?? '') } : null,
    googleAdmin.data?.estado === 'expirada' ? { onde: 'Criar e-mails (conta de administrador)', conta: String(googleAdmin.data.email_conta ?? '') } : null,
  ].filter((g): g is { onde: string; conta: string } => g !== null)
  return textoDoStatus({
    conexao, webhook, fila,
    falhas: falhas ? { total: falhas.total, grupos: resumoDasFalhas(falhas.erros) } : null,
    semChave: chaves ? chaves.filter((c) => !c.origem).map((c) => nomeCurto(c.nome)) : null,
    googleExpiradas, rotina, urlBase: base,
  })
}

/** "Google (cliente OAuth do Gmail)" vira "Google (Gmail)"; o resto perde o parêntese (como na visão geral das Configurações). */
const nomeCurto = (nome: string) => nome.includes('Gmail') ? 'Google (Gmail)' : nome.replace(/ \(.*\)$/, '')
