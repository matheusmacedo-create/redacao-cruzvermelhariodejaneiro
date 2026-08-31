'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createClient } from '@/lib/supabase/server'
import { lerPauta } from '@/lib/cerebro/cliente'
import type { PautaDoCerebro } from '@/lib/cerebro/contrato'
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
    // O mesmo formato que o Cérebro usa nos ids — e o que garante que o id
    // pode entrar num filtro composto sem escapar nada.
    if (!/^[a-zA-Z0-9_-]{4,64}$/.test(sinalId)) throw new Error('Faltou o identificador do sinal.')

    const context = await requireWorkspace()
    const supabase = await createClient()

    const pauta = await lerPauta(sinalId)
    if (!pauta) throw new Error('Não foi possível ler esta pauta no Cérebro. Tente de novo em instantes.')

    // Um sinal já importado não vira dois pacotes: quem clica duas vezes quer
    // o pacote, não uma cópia. O vínculo mora na coluna cerebro_sinal_id —
    // dentro do mestre ele já foi apagado por uma gravação integral, e o
    // mesmo sinal virou dois pacotes no mesmo dia; a chave no jsonb segue
    // valendo para os pacotes de antes da coluna.
    const { data: existente } = await supabase
      .from('social_packages')
      .select('id,mestre_file_ids,cerebro_sinal_id')
      .eq('workspace_id', context.workspace.id)
      .or(`cerebro_sinal_id.eq.${sinalId},mestre->>cerebroId.eq.${sinalId}`)
      .neq('status', 'arquivado')
      .limit(1)
      .maybeSingle()
    if (existente) {
      // Reimportar COMPLETA o pacote em vez de só devolvê-lo: a capa pode não
      // ter existido na primeira vez (o Cérebro ainda não tinha a mídia
      // daquele sinal no ar), e clicar de novo é o gesto natural de buscá-la.
      await completarPacoteExistente(supabase, context.workspace.id, context.user.id, pauta, {
        id: existente.id,
        fileIds: (existente.mestre_file_ids ?? []) as string[],
        sinalGravado: (existente.cerebro_sinal_id ?? '') as string,
      })
      revalidatePath('/redes')
      return { id: existente.id, abrirEm: 'site_web' }
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
        // O vínculo com o sinal, em coluna própria: o autosave do mestre não
        // alcança, e o índice único barra a duplicata no banco.
        cerebro_sinal_id: pauta.id,
        mestre: {
          ...mestre,
          // Identificador do sinal também no mestre, para reencontrar a
          // origem a partir do texto.
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
    if (error || !pacote) {
      // Corrida entre dois cliques: o índice único segurou a cópia; o pacote
      // que venceu a corrida é o que a pessoa quer abrir.
      if (error?.code === '23505') {
        const { data: vencedor } = await supabase
          .from('social_packages').select('id')
          .eq('workspace_id', context.workspace.id).eq('cerebro_sinal_id', sinalId)
          .neq('status', 'arquivado').limit(1).maybeSingle()
        if (vencedor) { revalidatePath('/redes'); return { id: vencedor.id, abrirEm: 'site_web' } }
      }
      throw new Error('Não foi possível criar o pacote a partir desta pauta.')
    }

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
    // Abre na notícia: é a base do pacote, e as redes saem dela por variante.
    // Quando esta importação não criou a página do site, ela é criada ao abrir
    // o pacote — todo pacote tem a sua.
    return { id: pacote.id, abrirEm: 'site_web' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível importar esta pauta.') }
  }
}

/**
 * O que uma reimportação conserta num pacote que já existe.
 *
 * Duas coisas, e só elas: o vínculo com o sinal (regrava a coluna quando um
 * pacote antigo ainda não a tem) e a capa que faltou — trazida agora e
 * anexada ao mestre e aos destinos que seguem o mestre e estão sem mídia.
 * Texto não é tocado: pode haver trabalho humano ali, e completar não é
 * sobrescrever.
 */
async function completarPacoteExistente(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  usuarioId: string,
  pauta: PautaDoCerebro,
  existente: { id: string; fileIds: string[]; sinalGravado: string },
): Promise<void> {
  if (!existente.sinalGravado) {
    await supabase.from('social_packages')
      .update({ cerebro_sinal_id: pauta.id })
      .eq('id', existente.id).eq('workspace_id', workspaceId)
  }

  if (!pauta.midia || existente.fileIds.length > 0) return

  const capa = await trazerCapa(supabase, {
    midia: pauta.midia,
    workspaceId,
    usuarioId,
    sinalId: pauta.id,
  })
  if (!capa.fileId) return

  await supabase.from('social_packages')
    .update({ mestre_file_ids: [capa.fileId] })
    .eq('id', existente.id).eq('workspace_id', workspaceId)

  // A capa entra nas peças pelas mesmas regras da importação: só material que
  // a filial pode usar, só em destino que ainda acompanha o mestre, ainda não
  // saiu e está sem mídia.
  if (!capaPodeIrParaPeca(pauta.midia)) return
  const { data: destinos } = await supabase
    .from('package_destinations')
    .select('id,file_ids,descolada,estado')
    .eq('package_id', existente.id).eq('workspace_id', workspaceId)
  for (const d of destinos ?? []) {
    if (d.descolada) continue
    if (['publicada', 'publicando', 'na_fila'].includes(d.estado)) continue
    if ((d.file_ids ?? []).length > 0) continue
    await supabase.from('package_destinations')
      .update({ file_ids: [capa.fileId] })
      .eq('id', d.id).eq('workspace_id', workspaceId)
  }
}
