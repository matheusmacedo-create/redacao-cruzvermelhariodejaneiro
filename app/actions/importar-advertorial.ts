'use server'

import { revalidatePath } from 'next/cache'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createAdminClient } from '@/lib/supabase/admin'
import { contextoDoMarketing } from '@/lib/escola/marketing-servidor'
import { linkDoBotao } from '@/lib/escola/advertoriais'
import { trocarLinksDoBotao, validarAdvertorial } from '@/lib/escola/importar-advertorial'
import { corpoComMidias } from '@/lib/publicacao/legendas'
import { legendasDaImportacao, type MidiaImportada, type Problema } from '@/lib/publicacao/importar-pacote'
import { urlBase } from '@/lib/newsletter/contexto'

/**
 * Importa um ADVERTORIAL da escola a partir de um arquivo JSON (formato em
 * lib/escola/importar-advertorial.ts), pelo mesmo botão "Importar pacote".
 *
 * Duas etapas, como na importação de pacote: conferir (valida e procura o
 * endereço já usado) → as fotos sobem do navegador para a Biblioteca como
 * `pending` → importar (cria o advertorial e preenche a matéria).
 *
 * Isto só cria RASCUNHO, pelo mesmo caminho da tela (escola_adv_criar): não
 * publica, não pede aprovação e não autoriza imagem. O que muda em relação à
 * tela é que o texto chega pronto, com as fotos no corpo e os links do curso
 * trocados pelo botão rastreado (/api/escola/ir/<peça>).
 */

const TETO_DO_ARQUIVO = 500_000

export type ConferenciaDoAdvertorial = {
  erro?: string
  problemas?: Problema[]
  /** Já existe uma matéria ou um pacote com este endereço: abrir em vez de criar outro. */
  duplicadoRota?: string
  duplicadoMotivo?: string
  midias?: MidiaImportada[]
  titulo?: string
}

const conteudoDe = (form: FormData) => String(form.get('json') ?? '')

type Cliente = Awaited<ReturnType<typeof contextoDoMarketing>>['supabase']

async function procurarEndereco(supabase: Cliente, workspaceId: string, slug: string): Promise<{ rota: string; motivo: string } | null> {
  // slug validado ([a-z0-9-]): entra no filtro sem escapar.
  const { data: materia } = await supabase
    .from('content_pieces').select('id')
    .eq('workspace_id', workspaceId).eq('slug', slug)
    .limit(1).maybeSingle()
  if (materia) return { rota: `/conteudos/${materia.id}`, motivo: 'Já existe uma matéria com este endereço (slug).' }
  const { data: pacote } = await supabase
    .from('social_packages').select('id')
    .eq('workspace_id', workspaceId).neq('status', 'arquivado')
    .eq('mestre->>slug', slug)
    .limit(1).maybeSingle()
  if (pacote) return { rota: `/redes/${pacote.id}`, motivo: 'Já existe um pacote em Publicações com este endereço (slug).' }
  return null
}

export async function conferirAdvertorial(formData: FormData): Promise<ConferenciaDoAdvertorial> {
  try {
    const { context, supabase, nivel } = await contextoDoMarketing()
    if (nivel < 2) return { erro: 'Você não tem acesso ao marketing da escola.' }
    const conteudo = conteudoDe(formData)
    if (conteudo.length > TETO_DO_ARQUIVO) return { erro: 'O arquivo JSON é grande demais.' }

    const { advertorial, problemas } = validarAdvertorial(conteudo)
    if (!advertorial) return { problemas }

    const existente = await procurarEndereco(supabase, context.workspace.id, advertorial.mestre.slug)
    if (existente) return { duplicadoRota: existente.rota, duplicadoMotivo: existente.motivo }
    return { midias: advertorial.midias, titulo: advertorial.mestre.titulo }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível conferir o arquivo.') }
  }
}

export async function importarAdvertorial(
  formData: FormData,
): Promise<{ erro?: string; problemas?: Problema[]; contentId?: string; aviso?: string }> {
  try {
    const { context, supabase, nivel } = await contextoDoMarketing()
    if (nivel < 2) return { erro: 'Você não tem acesso ao marketing da escola.' }
    const ws = context.workspace.id
    const conteudo = conteudoDe(formData)
    if (conteudo.length > TETO_DO_ARQUIVO) return { erro: 'O arquivo JSON é grande demais.' }

    const { advertorial, problemas } = validarAdvertorial(conteudo)
    if (!advertorial) return { problemas }
    const { mestre, midias } = advertorial

    // Corrida entre dois cliques: confere de novo, agora que vai gravar.
    const existente = await procurarEndereco(supabase, ws, mestre.slug)
    if (existente) return { erro: `${existente.motivo} Nada foi criado.` }

    // ref → id do arquivo na Biblioteca, vindo do navegador: só vale o que é
    // deste espaço e ainda existe.
    let idsPorRef: Record<string, string> = {}
    try {
      const bruto = JSON.parse(String(formData.get('arquivos') ?? '{}'))
      if (bruto && typeof bruto === 'object' && !Array.isArray(bruto)) idsPorRef = bruto as Record<string, string>
    } catch { /* mapa quebrado = nenhum arquivo; a conferência abaixo reclama */ }
    const fileIds = midias.map((m) => idsPorRef[m.ref])
    if (fileIds.some((id) => typeof id !== 'string' || !id)) {
      return { erro: 'Faltou enviar alguma das fotos para a Biblioteca. Nada foi criado.' }
    }
    const caminhos = new Map<string, string>()
    if (fileIds.length) {
      const { data: encontrados, error } = await supabase
        .from('files').select('id,storage_path')
        .eq('workspace_id', ws).neq('status', 'deleted').in('id', fileIds)
      for (const f of encontrados ?? []) caminhos.set(f.id as string, f.storage_path as string)
      if (error || caminhos.size !== new Set(fileIds).size) {
        return { erro: 'Alguma foto não foi encontrada na Biblioteca. Nada foi criado.' }
      }
    }

    const { data, error } = await supabase.rpc('escola_adv_criar', {
      p_workspace_id: ws,
      p: {
        titulo: mestre.titulo,
        destino_url: advertorial.advertorial.destinoUrl,
        angulo: advertorial.advertorial.angulo,
        campanha_id: advertorial.advertorial.campanhaId,
      },
    })
    if (error || !data) {
      throw new Error(error?.code === 'P0001' && error.message ? error.message : 'Não foi possível criar o advertorial.')
    }
    const { peca_id: pecaId, content_id: contentId } = data as { peca_id: string; content_id: string }

    // O botão rastreado só existe agora, com o id da peça.
    const botao = linkDoBotao(urlBase(), pecaId)
    const troca = trocarLinksDoBotao(mestre.corpo, advertorial.advertorial.destinoUrl, botao)
    let corpo = troca.corpo
    let aviso: string | undefined
    if (!troca.trocados) {
      corpo = `${corpo}\n\n[Quero garantir minha vaga](${botao})`
      aviso = 'O texto não tinha link para a página de matrícula: o botão foi posto no fim da matéria.'
    }
    const anexadas = midias.map((m) => ({
      id: idsPorRef[m.ref],
      url: `/api/private-blob?pathname=${encodeURIComponent(caminhos.get(idsPorRef[m.ref]) ?? '')}`,
    }))
    corpo = corpoComMidias(corpo, anexadas, legendasDaImportacao(midias, idsPorRef))

    // Como em criarAdvertorial: a matéria acabou de nascer do RPC, deste espaço.
    const { error: erroMateria } = await createAdminClient().from('content_pieces')
      .update({ body: corpo, subtitle: mestre.subtitulo || null, slug: mestre.slug, updated_at: new Date().toISOString() })
      .eq('id', contentId).eq('workspace_id', ws)
    if (erroMateria) {
      revalidatePath('/escola/marketing/advertoriais')
      return {
        contentId,
        erro: 'O advertorial foi criado, mas o texto não foi gravado (o endereço pode ter sido usado agora). Abra a matéria e cole o texto.',
      }
    }

    // As notas para quem aprova viram o primeiro comentário da matéria.
    if (mestre.notas) {
      await supabase.from('content_comments').insert({ workspace_id: ws, content_id: contentId, author_id: context.user.id, body: mestre.notas })
    }

    for (const c of ['/escola/marketing', '/escola/marketing/advertoriais', '/redes']) revalidatePath(c)
    return { contentId, ...(aviso ? { aviso } : {}) }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível importar o advertorial.') }
  }
}
