'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createClient } from '@/lib/supabase/server'
import { garantirBaseNoSite } from '@/app/actions/pacotes'
import {
  chaveDaImportacao, legendasDaImportacao, validarImportacao,
  type MidiaImportada, type Problema,
} from '@/lib/publicacao/importar-pacote'

/**
 * Importa um pacote do Site a partir de um arquivo JSON (formato em
 * lib/publicacao/importar-pacote.ts).
 *
 * Duas etapas, porque as fotos só devem subir para a Biblioteca depois de o
 * arquivo estar válido e de se saber que não é repetido:
 *   1. conferirImportacao — valida e procura um pacote que já seja este;
 *   2. importarPacote — com as fotos já na Biblioteca, cria o rascunho.
 *
 * Isto só cria RASCUNHO. Não publica, não agenda, não pede aprovação e não
 * autoriza imagem: as fotos entram como `pending` e quem autoriza é uma
 * pessoa, na Biblioteca. Publicar continua conferindo a aprovação no servidor.
 *
 * Não há índice único contra duplicata (exigiria migração): a chave vai no
 * mestre e a conferência é feita aqui, nas duas etapas.
 */

const TETO_DO_ARQUIVO = 500_000

export type ResultadoDaConferencia = {
  erro?: string
  problemas?: Problema[]
  /** Já existe um pacote (não arquivado) que é este arquivo ou tem este endereço. */
  duplicadoId?: string
  duplicadoMotivo?: string
  /** As mídias a subir, na ordem do arquivo. */
  midias?: MidiaImportada[]
  titulo?: string
}

const conteudoDe = (form: FormData) => String(form.get('json') ?? '')

async function procurarDuplicado(
  workspaceId: string, chave: string, slug: string,
): Promise<{ id: string; motivo: string } | null> {
  const supabase = await createClient()
  // chave e slug são [a-z0-9-] (validados / hex): entram no filtro sem escapar.
  const { data } = await supabase
    .from('social_packages')
    .select('id,mestre')
    .eq('workspace_id', workspaceId)
    .neq('status', 'arquivado')
    .or(slug ? `mestre->>importacaoChave.eq.${chave},mestre->>slug.eq.${slug}` : `mestre->>importacaoChave.eq.${chave}`)
    .limit(5)
  if (!data?.length) return null
  const mesmoArquivo = data.find((p) => (p.mestre as Record<string, unknown> | null)?.importacaoChave === chave)
  if (mesmoArquivo) return { id: mesmoArquivo.id, motivo: 'Este arquivo já foi importado.' }
  return { id: data[0].id, motivo: 'Já existe um pacote com este endereço (slug).' }
}

export async function conferirImportacao(formData: FormData): Promise<ResultadoDaConferencia> {
  try {
    const context = await requireWorkspace()
    const conteudo = conteudoDe(formData)
    if (conteudo.length > TETO_DO_ARQUIVO) return { erro: 'O arquivo JSON é grande demais.' }

    const { pacote, problemas } = validarImportacao(conteudo)
    if (!pacote) return { problemas }

    const duplicado = await procurarDuplicado(context.workspace.id, chaveDaImportacao(conteudo), pacote.mestre.slug)
    return {
      midias: pacote.midias,
      titulo: pacote.mestre.titulo,
      ...(duplicado ? { duplicadoId: duplicado.id, duplicadoMotivo: duplicado.motivo } : {}),
    }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível conferir o arquivo.') }
  }
}

export async function importarPacote(
  formData: FormData,
): Promise<{ erro?: string; problemas?: Problema[]; id?: string; jaExistia?: boolean }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const conteudo = conteudoDe(formData)
    if (conteudo.length > TETO_DO_ARQUIVO) return { erro: 'O arquivo JSON é grande demais.' }

    const { pacote, problemas } = validarImportacao(conteudo)
    if (!pacote) return { problemas }

    // Corrida entre dois cliques: confere de novo, agora que vai gravar.
    const chave = chaveDaImportacao(conteudo)
    const duplicado = await procurarDuplicado(context.workspace.id, chave, pacote.mestre.slug)
    if (duplicado) return { id: duplicado.id, jaExistia: true }

    // ref → id do arquivo na Biblioteca, vindo do navegador: só vale o que é
    // deste espaço e ainda existe.
    let idsPorRef: Record<string, string> = {}
    try {
      const bruto = JSON.parse(String(formData.get('arquivos') ?? '{}'))
      if (bruto && typeof bruto === 'object' && !Array.isArray(bruto)) idsPorRef = bruto as Record<string, string>
    } catch { /* mapa quebrado = nenhum arquivo; a conferência abaixo reclama */ }

    const fileIds = pacote.midias.map((m) => idsPorRef[m.ref])
    if (fileIds.some((id) => typeof id !== 'string' || !id)) {
      return { erro: 'Faltou enviar alguma das fotos para a Biblioteca. Nada foi criado.' }
    }
    if (fileIds.length) {
      const { data: encontrados, error: erroArquivos } = await supabase
        .from('files').select('id')
        .eq('workspace_id', context.workspace.id).neq('status', 'deleted').in('id', fileIds)
      if (erroArquivos || (encontrados?.length ?? 0) !== new Set(fileIds).size) {
        return { erro: 'Alguma foto não foi encontrada na Biblioteca. Nada foi criado.' }
      }
    }

    const { data, error } = await supabase
      .from('social_packages')
      .insert({
        workspace_id: context.workspace.id,
        titulo_interno: pacote.tituloInterno,
        origem_tipo: 'livre',
        mestre: {
          ...pacote.mestre,
          legendas: legendasDaImportacao(pacote.midias, idsPorRef),
          importacaoChave: chave,
        },
        mestre_file_ids: fileIds,
        created_by: context.user.id,
      })
      .select('id')
      .single()
    if (error || !data) throw new Error('Não foi possível criar o pacote.')

    // Todo pacote nasce com a sua página no site (como em criarPacote).
    await garantirBaseNoSite(data.id, context.workspace.id)

    revalidatePath('/redes')
    return { id: data.id }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível importar o pacote.') }
  }
}
