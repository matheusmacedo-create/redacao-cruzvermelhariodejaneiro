'use server'

import { revalidatePath } from 'next/cache'
import { requirePermissao } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { chaveDaElevenlabs, falar, listarVozes, semTabelaDaVoz } from '@/lib/voz/elevenlabs'
import { FRASE_DA_AMOSTRA, ehModeloDaVoz, lerConfigDaVoz, vozIdValido } from '@/lib/voz/regras'

/**
 * Configurações › Voz (ARQUITETURA §8.7): a voz da instituição na ElevenLabs, o modelo e onde ela fala. Só quem tem
 * integracoes.configurar; a chave fica no cofre (Integrações) e nunca passa por aqui de volta para a tela.
 */

type Resultado = { erro?: string; recado?: string }

export async function salvarVoz(entrada: unknown): Promise<Resultado> {
  try {
    const context = await requirePermissao('integracoes.configurar')
    const lido = lerConfigDaVoz(entrada)
    if (!lido.ok) throw new Error(lido.erro)
    const c = lido.valor
    // A voz tem de ser da conta: conferida na ElevenLabs (listar não custa crédito). O nome gravado é o de lá.
    let vozNome = c.vozNome
    if (c.vozId) {
      const chave = await chaveDaElevenlabs(context.workspace.id)
      if (!chave) throw new Error('Falta a chave da ElevenLabs: guarde-a em Configurações › Integrações antes de escolher a voz.')
      const lista = await listarVozes(chave)
      if (!lista.ok) throw new Error(lista.erro)
      const achada = lista.vozes.find((v) => v.id === c.vozId)
      if (!achada) throw new Error('Essa voz não está na conta da ElevenLabs. Escolha uma da lista.')
      vozNome = achada.nome
    }
    const admin = createAdminClient()
    const { error } = await admin.from('voz_config').upsert({
      workspace_id: context.workspace.id, voz_id: c.vozId, voz_nome: vozNome, modelo: c.modelo, materias: c.materias, whatsapp: c.whatsapp,
      atualizado_por: context.user.id, atualizado_em: new Date().toISOString(),
    }, { onConflict: 'workspace_id' })
    if (error) throw new Error(semTabelaDaVoz(error) ? 'A voz ainda não está pronta no banco (falta aplicar a migração dela).' : 'Não foi possível salvar a voz.')
    await admin.from('activity_log').insert({
      workspace_id: context.workspace.id, actor_id: context.user.id, action: 'voz_configurada', entity_type: 'integracao',
      metadata: { servico: 'elevenlabs', voz: c.vozId, modelo: c.modelo, materias: c.materias, whatsapp: c.whatsapp },
    })
    revalidatePath('/configuracoes/voz')
    const ligados = [c.materias && 'a narração das matérias', c.whatsapp && 'o áudio no WhatsApp'].filter(Boolean)
    return { recado: ligados.length ? `Voz salva. Ligado: ${ligados.join(' e ')}.` : 'Voz salva. A narração e o áudio no WhatsApp estão desligados.' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar a voz.') }
  }
}

/**
 * Uma amostra curta da voz com o modelo escolhido, em português (~100 caracteres de crédito). A amostra pronta da
 * ElevenLabs (preview_url) costuma ser em inglês; esta é a frase que a filial vai ouvir.
 */
export async function amostraDaVoz(entrada: { vozId?: unknown; modelo?: unknown }): Promise<{ erro?: string; audio?: string }> {
  try {
    const context = await requirePermissao('integracoes.configurar')
    if (!vozIdValido(entrada.vozId)) throw new Error('Escolha uma voz da lista.')
    if (!ehModeloDaVoz(entrada.modelo)) throw new Error('Modelo desconhecido.')
    const chave = await chaveDaElevenlabs(context.workspace.id)
    if (!chave) throw new Error('Falta a chave da ElevenLabs em Configurações › Integrações.')
    const fala = await falar({ chave, vozId: entrada.vozId, modelo: entrada.modelo }, FRASE_DA_AMOSTRA, 'mp3_44100_64')
    if (!fala.ok) throw new Error(fala.erro)
    return { audio: `data:audio/mpeg;base64,${fala.bytes.toString('base64')}` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível gerar a amostra.') }
  }
}
