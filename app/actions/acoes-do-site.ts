'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createClient } from '@/lib/supabase/server'
import { withFtp } from '@/lib/publicacao/ftp'
import { atualizarVitrine } from '@/lib/site/vitrine'
import { validarAcao, type AcaoDoMestre } from '@/lib/site/marca-de-acao'

/**
 * A marca "Nossas ações" de um pacote (lib/site/acoes.ts): diz que a notícia
 * conta uma ação que a filial realizou, em que dia e onde. É o que põe a
 * matéria na página /acoes/ do site.
 *
 * A marca vive em `mestre.acao`. Grava-se só essa chave, sobre o mestre lido
 * na hora: o autosave do texto (salvarMestre) faz o mesmo e preserva as chaves
 * que não edita, então um não apaga o que o outro gravou.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ResultadoDaAcao = {
  erro?: string
  /** A marca como ficou gravada; nulo quando foi tirada. */
  acao?: AcaoDoMestre | null
  /** O que aconteceu com a página do site, em português. */
  aviso?: string
}

export async function salvarAcaoDoPacote(
  pacoteId: string,
  entrada: { ligada: boolean; data: string; local: string },
): Promise<ResultadoDaAcao> {
  try {
    const context = await requireWorkspace()
    const ws = context.workspace.id
    if (!UUID.test(pacoteId)) throw new Error('Pacote não encontrado neste espaço.')
    const supabase = await createClient()

    const { data: pacote } = await supabase
      .from('social_packages')
      .select('id,mestre,status,content_id,origem_tipo,origem_id')
      .eq('id', pacoteId).eq('workspace_id', ws).maybeSingle()
    if (!pacote) throw new Error('Pacote não encontrado neste espaço.')
    if (pacote.status === 'arquivado') throw new Error('Este pacote foi arquivado e não muda mais.')

    let acao: AcaoDoMestre | null = null
    if (entrada.ligada) {
      const conferida = validarAcao({ data: entrada.data, local: entrada.local })
      if ('erro' in conferida) throw new Error(conferida.erro)
      acao = conferida.acao
    }

    const mestre = { ...((pacote.mestre ?? {}) as Record<string, unknown>) }
    if (acao) mestre.acao = acao
    else delete mestre.acao
    const { error } = await supabase.from('social_packages')
      .update({ mestre }).eq('id', pacoteId).eq('workspace_id', ws)
    if (error) throw new Error('Não foi possível salvar.')
    revalidatePath(`/redes/${pacoteId}`)

    // A matéria já está no ar? Então a página "Nossas ações" é refeita agora,
    // para a marca não esperar a próxima publicação. O vínculo é o mesmo da
    // publicação: a peça do pacote, a origem ou o que o destino do site guardou.
    let contentId = (pacote.content_id as string | null) ?? (pacote.origem_tipo === 'materia' ? (pacote.origem_id as string | null) : null)
    if (!contentId) {
      const { data: destino } = await supabase
        .from('package_destinations').select('extras')
        .eq('package_id', pacoteId).eq('workspace_id', ws).eq('canal', 'site_web').maybeSingle()
      contentId = String((destino?.extras as Record<string, unknown> | null)?.contentId ?? '') || null
    }
    let noAr = false
    if (contentId) {
      const { data: peca } = await supabase
        .from('content_pieces').select('site_url')
        .eq('id', contentId).eq('workspace_id', ws).maybeSingle()
      noAr = Boolean(peca?.site_url)
    }
    if (!noAr) {
      return {
        acao,
        aviso: acao
          ? 'Salvo. A ação entra na página “Nossas ações” quando a notícia for publicada no site.'
          : 'Salvo. Esta publicação não entra na página “Nossas ações”.',
      }
    }

    try {
      const vitrine = await withFtp((client, config) => atualizarVitrine(client, config, ws))
      if (!vitrine.acoes) throw new Error(vitrine.aviso ?? 'a página não subiu')
      return { acao, aviso: acao ? 'Salvo. A página “Nossas ações” do site já mostra esta ação.' : 'Salvo. A ação saiu da página “Nossas ações” do site.' }
    } catch (causa) {
      console.error('[site] Nossas ações: a página não foi refeita:', causa instanceof Error ? causa.message : causa)
      return { acao, aviso: 'Salvo aqui, mas a página do site não foi atualizada agora. Ela se atualiza na próxima publicação, ou em Configurações › Site › regerar.' }
    }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar.') }
  }
}
