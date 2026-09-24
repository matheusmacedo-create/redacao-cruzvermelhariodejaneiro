'use server'

import { revalidatePath } from 'next/cache'
import { requirePermissao } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { lerCodigo } from '@/lib/auditoria/catalogo'
import { PAINEL_DA_TRILHA, rotinaDiaria, type ResumoDaRotina } from '@/lib/auditoria/rotina'
import { lerConferencia, lerItemInterno, lerSincronizacao, type Conferencia, type ItemInterno, type Sincronizacao } from '@/components/app/trilha/dados'

/**
 * A trilha pública vista pela administração (/trilha-publica): a consulta por
 * código e as três rodadas manuais.
 *
 * Toda action abre com requirePermissao('trilha.ver') — a tela esconder a
 * área não impede ninguém de chamar a action. A consulta vai pelo cliente da
 * própria pessoa (o banco confere de novo que ela é admin). Conferir a cadeia,
 * registrar pendências e a rodada do lote são funções que o banco reserva ao
 * service role: ele só entra depois da checagem.
 *
 * Nada aqui lê ou devolve a chave de assinatura nem valor de variável.
 */

type Resultado = { erro?: string }

// O banco escreve mensagens próprias (P0001) para as recusas de regra; o
// resto (permissão, rede, função ausente) vira uma mensagem genérica.
function erroDoBanco(error: { message?: string; code?: string } | null, padrao: string): never {
  if (error?.code === 'P0001' && error.message) throw new Error(error.message)
  if (error) console.error('[trilha]', padrao, error.code, error.message)
  throw new Error(padrao)
}

/** Um item da trilha pelo código (26 caracteres, ofício de 32 hex ou certificado XXXX-XXXX), com a história inteira. */
export async function consultarCodigoNaTrilha(codigo: string): Promise<Resultado & { item?: ItemInterno | null }> {
  try {
    const context = await requirePermissao('trilha.ver')
    const lido = lerCodigo(codigo)
    if (!lido) throw new Error('Código não reconhecido: use os 26 caracteres da trilha, os 32 impressos no ofício ou o XXXX-XXXX do certificado.')
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('auditoria_item_interno', { p_workspace_id: context.workspace.id, p_codigo: lido.codigo })
    if (error) erroDoBanco(error, 'Não foi possível consultar a trilha agora.')
    return { item: lerItemInterno(data) }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível consultar a trilha agora.') }
  }
}

/** "Conferir a cadeia agora": a mesma conferência do cron, gravada com origem "manual". */
export async function conferirCadeiaAgora(): Promise<Resultado & { conferencia?: Conferencia }> {
  try {
    await requirePermissao('trilha.ver')
    const { data, error } = await createAdminClient().rpc('auditoria_verificar_cadeia', { p_origem: 'manual' })
    if (error) erroDoBanco(error, 'Não foi possível conferir a cadeia agora.')
    const conferencia = lerConferencia(data)
    if (!conferencia) throw new Error('A conferência rodou, mas a resposta veio num formato inesperado. Recarregue a página para ver o resultado.')
    revalidatePath(PAINEL_DA_TRILHA)
    return { conferencia }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível conferir a cadeia agora.') }
  }
}

/** "Registrar pendências agora": registra o que os ganchos perderam (a rede de segurança do cron). */
export async function registrarPendenciasAgora(): Promise<Resultado & { registrados?: Sincronizacao }> {
  try {
    await requirePermissao('trilha.ver')
    const { data, error } = await createAdminClient().rpc('auditoria_sincronizar')
    if (error) erroDoBanco(error, 'Não foi possível registrar as pendências agora.')
    revalidatePath(PAINEL_DA_TRILHA)
    return { registrados: lerSincronizacao(data) }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar as pendências agora.') }
  }
}

/**
 * "Fechar e carimbar o lote de ontem agora": a rodada inteira da madrugada.
 * É idempotente — lote fechado não fecha de novo, assinatura e carimbo só
 * entram uma vez — e cada passo falha sozinho, anotado no resumo. Pode levar
 * até um minuto (a página declara maxDuration = 60).
 */
export async function fecharLoteDeOntemAgora(): Promise<Resultado & { rodada?: ResumoDaRotina }> {
  try {
    await requirePermissao('trilha.ver')
    const rodada = await rotinaDiaria()
    revalidatePath(PAINEL_DA_TRILHA)
    return { rodada }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'A rodada do lote não terminou. Recarregue a página para ver o que chegou a ser feito.') }
  }
}
