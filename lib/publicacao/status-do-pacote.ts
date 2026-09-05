import 'server-only'
import { after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { enviarAceite } from '@/lib/cerebro/cliente'

/**
 * O status do pacote é consequência do estado dos destinos, nunca ao
 * contrário — e a fórmula é uma só, usada pela publicação, pelo reprocesso,
 * pela conferência de status e pelo webhook do conector. Antes cada caminho
 * recalculava do seu jeito, e um deles nunca avisava o Cérebro.
 *
 * Aceita qualquer cliente Supabase: o das Server Actions (sessão) e o
 * administrativo do webhook.
 */
type Cliente = Pick<SupabaseClient, 'from'>

export async function recalcularStatusDoPacote(supabase: Cliente, pacoteId: string, workspaceId: string): Promise<void> {
  const { data: estados } = await supabase
    .from('package_destinations').select('estado')
    .eq('package_id', pacoteId).eq('workspace_id', workspaceId)
  const lista = ((estados ?? []) as { estado: string }[]).map((e) => e.estado)
  if (!lista.length) return

  const publicados = lista.filter((e) => e === 'publicada').length
  const falhas = lista.filter((e) => e === 'falhou').length
  const pendentes = lista.filter((e) => !['publicada', 'na_fila', 'ignorada', 'falhou'].includes(e)).length

  const status = falhas > 0 || pendentes > 0
    ? (publicados > 0 ? 'parcial' : falhas > 0 ? 'falhou' : 'rascunho')
    : 'publicado'
  await supabase.from('social_packages').update({ status })
    .eq('id', pacoteId).eq('workspace_id', workspaceId)

  // Pacote que nasceu de um sinal do Cérebro e tem algo no ar: o "sim"
  // volta para lá, depois da resposta, para o Cérebro tirar o sinal da
  // atenção e saber que a Casa já cobriu a família dele. Depois da resposta
  // porque quem publica não precisa esperar o Cérebro, e falha ali não é
  // falha de publicação. O Cérebro guarda a primeira data, então repetir o
  // aviso a cada recontagem não desloca "quando publicou".
  if (publicados > 0) {
    after(async () => {
      const { data: pacote } = await supabase
        .from('social_packages').select('cerebro_sinal_id')
        .eq('id', pacoteId).eq('workspace_id', workspaceId).maybeSingle()
      const sinalId = (pacote as { cerebro_sinal_id?: string | null } | null)?.cerebro_sinal_id
      if (!sinalId) return
      const { data: noAr } = await supabase
        .from('package_destinations').select('canal,external_url')
        .eq('package_id', pacoteId).eq('workspace_id', workspaceId).eq('estado', 'publicada')
      const destinos = (noAr ?? []) as { canal: string; external_url: string | null }[]
      const canais = [...new Set(destinos.map((d) => d.canal))]
      const url = destinos.find((d) => d.canal === 'site_web' && (d.external_url ?? '').startsWith('http'))?.external_url ?? undefined
      const r = await enviarAceite(sinalId, 'publicado', { pacoteId, url, canais })
      if (r.erro) console.error('[pacotes] aceite "publicado" não chegou ao Cérebro:', r.erro)
    })
  }
}
