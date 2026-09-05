'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createClient } from '@/lib/supabase/server'
import { desfazerRecusa, enviarAceite, enviarRecusa, lerPauta } from '@/lib/cerebro/cliente'
import { MOTIVOS_RECUSA, type MotivoRecusa, type PautaDoCerebro } from '@/lib/cerebro/contrato'
import { trazerCapa } from '@/lib/cerebro/midia'
import { capaPodeIrParaPeca, mestreDaPauta, planejarDestinos, type PecasProntas } from '@/lib/cerebro/mestre'
import { orientacaoDaPauta, type OrientacaoDoCerebro } from '@/lib/cerebro/orientacao'
import { redigirDaPauta } from '@/lib/cerebro/redator'
import { claudeConfigurado, semChaveDoClaude } from '@/lib/ia/anthropic'
import { temErro, validarVariante } from '@/lib/publicacao/variantes'

/**
 * Traz uma sugestão do Cérebro para o hub de publicações.
 *
 * O Cérebro observa as contas oficiais e decide o que merece virar pauta;
 * ele não publica. Isto é a fronteira: a sugestão vira um pacote em rascunho
 * com o mestre no formato da matéria e um destino já gerado para cada canal
 * que o plano liberou. Nada é enviado — o trabalho segue em /redes/[id], com
 * decisão humana.
 *
 * Dois jeitos de escrever o mestre. Com `rascunho=ia`, o redator escreve a
 * matéria, a legenda e os stories com a voz da casa e sob as travas do sinal
 * — e entrega a lista do que conferir. Sem IA (ou quando ela falha), vale a
 * montagem heurística de sempre: a legenda da fonte reorganizada. Em ambos
 * os casos a orientação do Cérebro fica no mestre como dado, para o hub
 * mostrar aberto o que não pode.
 *
 * A capa vem junto, para a Biblioteca. Sem ela a pessoa decidiria no escuro
 * sobre um post que não viu. Aparecer não é poder publicar: material da
 * filial entra como `pending` e material de terceiro como `internal`, e o
 * disparo barra tudo que não esteja `authorized`.
 */
export async function importarDoCerebro(
  formData: FormData,
): Promise<{ erro?: string; id?: string; abrirEm?: string; aviso?: string }> {
  try {
    const sinalId = String(formData.get('sinalId') ?? '').trim()
    // O mesmo formato que o Cérebro usa nos ids — e o que garante que o id
    // pode entrar num filtro composto sem escapar nada.
    if (!/^[a-zA-Z0-9_-]{4,64}$/.test(sinalId)) throw new Error('Faltou o identificador do sinal.')
    const comIa = String(formData.get('rascunho') ?? '') === 'ia'

    const context = await requireWorkspace()
    const supabase = await createClient()

    const pauta = await lerPauta(sinalId)
    if (!pauta) throw new Error('Não foi possível ler esta pauta no Cérebro. Tente de novo em instantes.')
    // O id do chefe vem da resposta do Cérebro e entra num filtro composto:
    // vale a mesma régua do id que veio da tela, não a confiança no serviço.
    if (!/^[a-zA-Z0-9_-]{4,64}$/.test(pauta.id)) throw new Error('O Cérebro devolveu um identificador inválido.')

    // Um sinal já importado não vira dois pacotes: quem clica duas vezes quer
    // o pacote, não uma cópia. O vínculo mora na coluna cerebro_sinal_id —
    // dentro do mestre ele já foi apagado por uma gravação integral, e o
    // mesmo sinal virou dois pacotes no mesmo dia; a chave no jsonb segue
    // valendo para os pacotes de antes da coluna. O id pedido pode ser o de
    // um boletim recolhido: o Cérebro devolve o chefe, e os dois ids valem.
    const idsDoSinal = [...new Set([sinalId, pauta.id])]
    const { data: existente } = await supabase
      .from('social_packages')
      .select('id,mestre_file_ids,cerebro_sinal_id')
      .eq('workspace_id', context.workspace.id)
      .or(idsDoSinal.flatMap((id) => [`cerebro_sinal_id.eq.${id}`, `mestre->>cerebroId.eq.${id}`]).join(','))
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
      return { id: existente.id, abrirEm: 'site_web', aviso: 'Este sinal já tinha um pacote aberto — é ele que foi aberto.' }
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

    const heuristico = mestreDaPauta(pauta, capa.motivo)
    let mestre = heuristico
    let orientacao: OrientacaoDoCerebro
    let pecas: PecasProntas = {}
    let aviso: string | undefined

    if (comIa && claudeConfigurado()) {
      try {
        const rascunho = await redigirDaPauta(pauta, { jaPublicado: await titulosRecentes(supabase, context.workspace.id) })
        mestre = {
          ...heuristico,
          titulo: rascunho.titulo,
          subtitulo: rascunho.linhaFina,
          corpo: rascunho.corpo,
          notas: notasDoRascunho(pauta, rascunho.paraConferir, capa.motivo),
        }
        pecas = { feed: rascunho.legendaFeed, stories: rascunho.stories.map((s, i) => `${i + 1}. ${s}`).join('\n') }
        orientacao = orientacaoDaPauta(pauta, {
          texto: 'ia',
          paraConferir: rascunho.paraConferir,
          capaFalhou: capa.motivo,
          pecas: { legendaFeed: rascunho.legendaFeed, stories: rascunho.stories },
        })
      } catch (causa) {
        // A IA é melhoria, não pré-requisito: sem ela o pacote nasce do jeito
        // de sempre, e a pessoa sabe que nasceu assim.
        const motivo = semChaveDoClaude(mensagemDoErro(causa, 'a IA não respondeu'))
        console.error('[cerebro] redator falhou; importação heurística:', motivo)
        aviso = `O rascunho pela IA não saiu (${motivo}). O pacote foi montado a partir da legenda da fonte.`
        orientacao = orientacaoDaPauta(pauta, { texto: 'legenda', capaFalhou: capa.motivo })
      }
    } else {
      if (comIa) aviso = 'O Claude não está configurado; o pacote foi montado a partir da legenda da fonte.'
      orientacao = orientacaoDaPauta(pauta, { texto: 'legenda', capaFalhou: capa.motivo })
    }

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
          // A orientação inteira, como dado: é o que o hub mostra aberto.
          cerebro: orientacao,
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
          .eq('workspace_id', context.workspace.id).eq('cerebro_sinal_id', pauta.id)
          .neq('status', 'arquivado').limit(1).maybeSingle()
        if (vencedor) { revalidatePath('/redes'); return { id: vencedor.id, abrirEm: 'site_web' } }
      }
      throw new Error('Não foi possível criar o pacote a partir desta pauta.')
    }

    // Cada destino liberado pelo plano nasce com a peça pronta. A capa só
    // viaja para a peça quando é material que a filial pode usar; a de
    // terceiro fica na Biblioteca como referência, e o destino nasce
    // `bloqueada` pedindo a mídia certa — o erro aparece agora, não na hora
    // de publicar.
    const capaNaPeca = capaPodeIrParaPeca(pauta.midia) && capa.fileId ? [capa.fileId] : []
    const destinos = planejarDestinos(pauta, {
      corpo: mestre.corpo,
      titulo: mestre.titulo,
      subtitulo: mestre.subtitulo,
      linkUrl: mestre.linkUrl,
      fileIds: capaNaPeca,
    }, pecas).map((d) => ({
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

    // O "sim" volta ao Cérebro: o sinal está em pauta. Falha aqui não trava
    // nada — o laço é melhoria, não pré-requisito.
    await enviarAceite(pauta.id, 'pautado', { pacoteId: pacote.id })
    updateTag('cerebro')
    revalidatePath('/redes')
    revalidatePath('/cerebro')
    // Abre na notícia: é a base do pacote, e as redes saem dela por variante.
    // Quando esta importação não criou a página do site, ela é criada ao abrir
    // o pacote — todo pacote tem a sua.
    return { id: pacote.id, abrirEm: 'site_web', ...(aviso ? { aviso } : {}) }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível importar esta pauta.') }
  }
}

/**
 * Recusa uma sugestão, com o motivo — o laço de volta do contrato.
 *
 * A recusa é gravada no Cérebro, não aqui: é lá que ela pesa nas próximas
 * leituras, e é assim que a sugestão some para a equipe inteira em todas as
 * telas, e não só para quem clicou.
 */
export async function recusarSugestao(
  formData: FormData,
): Promise<{ erro?: string; ok?: boolean }> {
  try {
    const sinalId = String(formData.get('sinalId') ?? '').trim()
    if (!/^[a-zA-Z0-9_-]{4,64}$/.test(sinalId)) throw new Error('Faltou o identificador do sinal.')
    const motivo = String(formData.get('motivo') ?? '') as MotivoRecusa
    if (!(motivo in MOTIVOS_RECUSA)) throw new Error('Escolha um dos motivos.')

    // Só quem tem sessão num espaço recusa: a ação fala em nome da equipe.
    await requireWorkspace()

    const r = await enviarRecusa(sinalId, motivo)
    if (r.erro) throw new Error(r.erro)

    // As leituras do Cérebro ficam 5 minutos em cache; uma recusa precisa
    // sumir da tela agora, senão parece que o clique não valeu — updateTag
    // expira na hora, em vez de servir o cartão recusado mais uma vez.
    updateTag('cerebro')
    revalidatePath('/cerebro')
    revalidatePath('/redes')
    return { ok: true }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível recusar esta sugestão.') }
  }
}

/**
 * Sincroniza a leitura do Cérebro agora.
 *
 * A tela guarda a resposta do Cérebro por 5 minutos (tag `cerebro`) para
 * não bater nele a cada render. Quem quer o retrato de agora clica — o
 * cache expira na hora e a próxima leitura vem fresca. Não dispara coleta
 * na Apify: sincronizar é reler, não recoletar.
 */
export async function sincronizarCerebro(): Promise<{ erro?: string }> {
  try {
    await requireWorkspace()
    updateTag('cerebro')
    revalidatePath('/cerebro')
    revalidatePath('/redes')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível sincronizar agora.') }
  }
}

/** Desfaz uma recusa feita há pouco. Errar o clique não pode custar a pauta. */
export async function desfazerRecusaDaSugestao(
  formData: FormData,
): Promise<{ erro?: string; ok?: boolean }> {
  try {
    const sinalId = String(formData.get('sinalId') ?? '').trim()
    if (!/^[a-zA-Z0-9_-]{4,64}$/.test(sinalId)) throw new Error('Faltou o identificador do sinal.')
    await requireWorkspace()

    const r = await desfazerRecusa(sinalId)
    if (r.erro) throw new Error(r.erro)

    updateTag('cerebro')
    revalidatePath('/cerebro')
    revalidatePath('/redes')
    return { ok: true }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível desfazer a recusa.') }
  }
}

/**
 * O que a Casa publicou há pouco, para o redator não repetir gancho. Os
 * títulos internos bastam — é o mesmo dado que a rota de contexto entrega ao
 * Cérebro, só que sem sair de casa.
 */
async function titulosRecentes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
): Promise<string[]> {
  const desde = new Date(Date.now() - 60 * 86_400_000).toISOString()
  const { data } = await supabase
    .from('social_packages')
    .select('titulo_interno')
    .eq('workspace_id', workspaceId)
    .in('status', ['publicado', 'parcial'])
    .gte('updated_at', desde)
    .order('updated_at', { ascending: false })
    .limit(12)
  return (data ?? []).map((p) => p.titulo_interno).filter((t): t is string => Boolean(t))
}

/**
 * As notas de um pacote redigido pela IA: curtas, porque a orientação do
 * Cérebro agora vive estruturada no mestre e o hub a mostra aberta. O que
 * fica aqui é o que quem aprova precisa ler antes de tudo.
 */
function notasDoRascunho(p: PautaDoCerebro, paraConferir: string[], capaFalhou?: string): string {
  const notas = [
    `Rascunho redigido pela IA a partir do sinal do Cérebro (nota ${p.decisao.nota}/100 · ${p.decisao.modoRotulo}). É ponto de partida: leia, corrija e confira antes de marcar como pronta.`,
    '',
    'PARA CONFERIR',
    ...paraConferir.map((x) => `· ${x}`),
  ]
  if (capaFalhou) notas.push('', `A capa não pôde ser trazida (${capaFalhou}). Veja no link da fonte.`)
  notas.push('', `Fonte: ${p.fato.fonte} — ${p.fato.url}`)
  return notas.join('\n')
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
  // a filial pode usar, só em destino que ainda não saiu e está sem mídia.
  // "Descolada" protege o TEXTO escrito à parte, não a ausência de foto — a
  // legenda que a IA redigiu nasce descolada e ficaria bloqueada para sempre.
  // O estado é reavaliado com a foto no lugar: sem isso o semáforo continua
  // vermelho no banco até alguém tocar no destino.
  if (!capaPodeIrParaPeca(pauta.midia)) return
  const { data: destinos } = await supabase
    .from('package_destinations')
    .select('id,canal,formato,corpo,extras,file_ids,estado')
    .eq('package_id', existente.id).eq('workspace_id', workspaceId)
  for (const d of destinos ?? []) {
    if (['publicada', 'publicando', 'na_fila', 'ignorada'].includes(d.estado)) continue
    if ((d.file_ids ?? []).length > 0) continue
    const fileIds = [capa.fileId]
    const avisos = validarVariante(
      { corpo: d.corpo ?? '', extras: (d.extras ?? {}) as Record<string, string>, fileIds },
      d.canal,
      d.formato,
    )
    await supabase.from('package_destinations')
      .update({ file_ids: fileIds, ...(d.estado === 'bloqueada' && !temErro(avisos) ? { estado: 'gerada', erro: null } : {}) })
      .eq('id', d.id).eq('workspace_id', workspaceId)
  }
}
