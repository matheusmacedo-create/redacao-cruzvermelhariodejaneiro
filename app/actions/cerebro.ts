'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createClient } from '@/lib/supabase/server'
import { lerPauta } from '@/lib/cerebro/cliente'
import { trazerCapa } from '@/lib/cerebro/midia'
import { capaPodeIrParaPeca, mestreDaPauta, planejarDestinos } from '@/lib/cerebro/mestre'

/**
 * Traz uma sugestão do Cérebro para o hub de publicações.
 *
 * O Cérebro observa as contas oficiais e decide o que merece virar pauta;
 * ele não publica. Isto é a fronteira: a sugestão vira um pacote em rascunho
 * com o mestre escrito no formato da matéria e um destino já gerado para cada
 * canal viável — site, feed, stories e, quando o sinal é vídeo, reels. As
 * peças nascem da mesma `gerarVariante` do hub, então tudo que a tela sabe
 * fazer (regerar, contar, validar) funciona nelas. Nada é enviado — o
 * trabalho segue em /redes/[id], com decisão humana.
 *
 * A capa vem junto, para a Biblioteca. Sem ela a pessoa decidiria no escuro
 * sobre um post que não viu. Aparecer não é poder publicar: material da
 * filial entra como `pending` e material de terceiro como `internal`, e o
 * disparo barra tudo que não esteja `authorized`.
 */
export async function importarDoCerebro(
  formData: FormData,
): Promise<{ erro?: string; id?: string; abrirEm?: string }> {
  try {
    const sinalId = String(formData.get('sinalId') ?? '').trim()
    if (!sinalId) throw new Error('Faltou o identificador do sinal.')

    const context = await requireWorkspace()
    const supabase = await createClient()

    const pauta = await lerPauta(sinalId)
    if (!pauta) throw new Error('Não foi possível ler esta pauta no Cérebro. Tente de novo em instantes.')

    // Um sinal já importado não vira dois pacotes: quem clica duas vezes
    // quer o pacote, não uma cópia.
    const { data: existente } = await supabase
      .from('social_packages')
      .select('id')
      .eq('workspace_id', context.workspace.id)
      .eq('mestre->>cerebroId', sinalId)
      .neq('status', 'arquivado')
      .maybeSingle()
    if (existente) {
      revalidatePath('/redes')
      return { id: existente.id }
    }

    // A capa entra antes do pacote: assim ela já nasce anexada, em vez de
    // depender de um update que pode falhar depois.
    const capa = pauta.midia
      ? await trazerCapa(supabase, {
          midia: pauta.midia,
          workspaceId: context.workspace.id,
          usuarioId: context.user.id,
          sinalId: pauta.id,
        })
      : { fileId: null as string | null, motivo: undefined as string | undefined }

    const mestre = mestreDaPauta(pauta, capa.motivo)

    const { data: pacote, error } = await supabase
      .from('social_packages')
      .insert({
        workspace_id: context.workspace.id,
        titulo_interno: mestre.titulo.slice(0, 180),
        origem_tipo: 'pauta',
        mestre: {
          ...mestre,
          // Identificador do sinal: deixa reencontrar a origem e impede
          // importar o mesmo sinal duas vezes.
          cerebroId: pauta.id,
          cerebroUrl: pauta.urlNoCerebro ?? '',
          ...(pauta.midia
            ? { cerebroMidiaUrl: pauta.midia.url, cerebroMidiaCredito: pauta.midia.credito }
            : {}),
        },
        mestre_file_ids: capa.fileId ? [capa.fileId] : [],
        created_by: context.user.id,
      })
      .select('id')
      .single()
    if (error || !pacote) throw new Error('Não foi possível criar o pacote a partir desta pauta.')

    // Cada destino nasce com a peça pronta. A capa só viaja para a peça
    // quando é material que a filial pode usar; a de terceiro fica na
    // Biblioteca como referência, e o destino nasce `bloqueada` pedindo a
    // mídia certa — o erro aparece agora, não na hora de publicar.
    const capaNaPeca = capaPodeIrParaPeca(pauta.midia) && capa.fileId ? [capa.fileId] : []
    const destinos = planejarDestinos(pauta, {
      corpo: mestre.corpo,
      titulo: mestre.titulo,
      subtitulo: mestre.subtitulo,
      linkUrl: mestre.linkUrl,
      fileIds: capaNaPeca,
    }).map((d) => ({
      workspace_id: context.workspace.id,
      package_id: pacote.id,
      ...d,
    }))

    if (destinos.length > 0) {
      const { error: erroDestinos } = await supabase.from('package_destinations').insert(destinos)
      // O pacote já existe e é editável à mão: falhar aqui não justifica
      // desfazer o que deu certo, mas a pessoa precisa saber.
      if (erroDestinos) {
        revalidatePath('/redes')
        return { id: pacote.id, erro: 'O pacote foi criado, mas os destinos não. Adicione-os pelo pacote.' }
      }
    }

    revalidatePath('/redes')
    // Abre no Site, não no mestre: a matéria é o ponto de partida, e dela as
    // outras redes saem por variante. O mestre é o texto canônico, não a peça.
    const temSite = destinos.some((d) => d.canal === 'site_web')
    return { id: pacote.id, abrirEm: temSite ? 'site_web' : destinos[0]?.canal }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível importar esta pauta.') }
  }
}
