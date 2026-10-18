'use server'

import { requireWorkspace } from '@/lib/session'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createClient } from '@/lib/supabase/server'
import { corrigirPacotePorImportacao, situacaoDaPaginaDoSite } from '@/app/actions/pacotes'
import { legendasDaImportacao, type MidiaImportada, type Problema } from '@/lib/publicacao/importar-pacote'
import { resumoDasMudancas, validarAtualizacao } from '@/lib/publicacao/atualizar-pacote'

/**
 * Importação no modo "atualizar": corrige por JSON a matéria de um pacote que
 * já existe, achado pelo `mestre.slug` (formato em
 * lib/publicacao/atualizar-pacote.ts).
 *
 * As mesmas duas etapas da criação (app/actions/importar-pacote.ts), porque
 * as fotos só sobem depois de se saber que o arquivo vale e que o pacote
 * existe:
 *   1. conferirAtualizacao — valida, acha o pacote e diz o que vai mudar;
 *   2. aplicarAtualizacao — com as fotos já na Biblioteca, corrige e, se a
 *      página está no ar, republica no mesmo endereço.
 *
 * Correção não volta para aprovação (decisão da Comunicação, 10/2026).
 * Aprovação pendente ou pedindo ajustes bloqueia, como no botão "Atualizar a
 * página no site". As fotos novas entram como `pending`, como na criação.
 */

const TETO_DO_ARQUIVO = 500_000

export type ResultadoDaConferenciaDeAtualizacao = {
  erro?: string
  problemas?: Problema[]
  pacoteId?: string
  /** O título que está no pacote hoje. */
  tituloAtual?: string
  publicada?: boolean
  endereco?: string
  /** O destino do site tem texto próprio: a correção chega ao pacote, não à página. */
  descolada?: boolean
  mudancas?: string[]
  /** As mídias a subir, na ordem do arquivo (vazia = manter as atuais). */
  midias?: MidiaImportada[]
}

const conteudoDe = (form: FormData) => String(form.get('json') ?? '')

/** O pacote (não arquivado) deste espaço com este endereço. Nenhum ou mais de um é erro. */
async function acharPacotePeloSlug(workspaceId: string, slug: string) {
  const supabase = await createClient()
  // O slug foi validado ([a-z0-9-]): entra no filtro sem escapar.
  const { data, error } = await supabase
    .from('social_packages')
    .select('id,titulo_interno,mestre,mestre_file_ids')
    .eq('workspace_id', workspaceId)
    .neq('status', 'arquivado')
    .eq('mestre->>slug', slug)
    .limit(2)
  if (error) throw new Error('Não foi possível procurar a matéria.')
  if (!data?.length) {
    throw new Error(`Nenhum pacote em Publicações tem o endereço “${slug}”. Confira o slug; para criar uma matéria nova, tire o "modo": "atualizar". Nada foi alterado.`)
  }
  if (data.length > 1) {
    throw new Error(`Há mais de um pacote com o endereço “${slug}”. Arquive o que sobra antes de atualizar. Nada foi alterado.`)
  }
  return data[0]
}

export async function conferirAtualizacao(formData: FormData): Promise<ResultadoDaConferenciaDeAtualizacao> {
  try {
    const context = await requireWorkspace()
    const conteudo = conteudoDe(formData)
    if (conteudo.length > TETO_DO_ARQUIVO) return { erro: 'O arquivo JSON é grande demais.' }

    const { atualizacao, problemas } = validarAtualizacao(conteudo)
    if (!atualizacao) return { problemas }

    const pacote = await acharPacotePeloSlug(context.workspace.id, atualizacao.slug)
    const situacao = await situacaoDaPaginaDoSite(pacote.id)
    if (situacao.erro) return { erro: situacao.erro }
    // Barra aqui, antes de as fotos subirem à toa.
    if (situacao.bloqueio) return { erro: `${situacao.bloqueio} Nada foi alterado.` }

    const m = (pacote.mestre ?? {}) as Record<string, unknown>
    const s = (v: unknown) => (typeof v === 'string' ? v : '')
    return {
      pacoteId: pacote.id,
      tituloAtual: s(m.titulo) || pacote.titulo_interno || '',
      publicada: situacao.publicada,
      ...(situacao.endereco ? { endereco: situacao.endereco } : {}),
      descolada: situacao.descolada,
      mudancas: resumoDasMudancas(
        { titulo: s(m.titulo), subtitulo: s(m.subtitulo), corpo: s(m.corpo), notas: s(m.notas), fotos: (pacote.mestre_file_ids ?? []).length },
        atualizacao,
      ),
      midias: atualizacao.midias,
    }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível conferir o arquivo.') }
  }
}

export async function aplicarAtualizacao(
  formData: FormData,
): Promise<{ erro?: string; problemas?: Problema[]; id?: string; republicada?: boolean; endereco?: string; aviso?: string }> {
  try {
    const context = await requireWorkspace()
    const conteudo = conteudoDe(formData)
    if (conteudo.length > TETO_DO_ARQUIVO) return { erro: 'O arquivo JSON é grande demais.' }

    const { atualizacao, problemas } = validarAtualizacao(conteudo)
    if (!atualizacao) return { problemas }

    // Confere de novo: entre a conferência e aqui o pacote pode ter sido arquivado.
    const pacote = await acharPacotePeloSlug(context.workspace.id, atualizacao.slug)
    // A tela confirmou um pacote; se o endereço agora leva a outro, não grava.
    const confirmado = String(formData.get('pacoteId') ?? '')
    if (confirmado && confirmado !== pacote.id) {
      return { erro: 'O pacote com este endereço mudou desde a conferência. Importe o arquivo de novo. Nada foi alterado.' }
    }

    let midias: { fileIds: string[]; legendas: ReturnType<typeof legendasDaImportacao> } | undefined
    if (atualizacao.midias.length) {
      // ref → id do arquivo na Biblioteca, vindo do navegador; corrigirPacotePorImportacao
      // confere que cada um é deste espaço e ainda existe.
      let idsPorRef: Record<string, string> = {}
      try {
        const bruto = JSON.parse(String(formData.get('arquivos') ?? '{}'))
        if (bruto && typeof bruto === 'object' && !Array.isArray(bruto)) idsPorRef = bruto as Record<string, string>
      } catch { /* mapa quebrado = nenhum arquivo; a conferência abaixo reclama */ }
      const fileIds = atualizacao.midias.map((m) => idsPorRef[m.ref])
      if (fileIds.some((id) => typeof id !== 'string' || !id)) {
        return { erro: 'Faltou enviar alguma das fotos para a Biblioteca. Nada foi alterado.' }
      }
      midias = { fileIds, legendas: legendasDaImportacao(atualizacao.midias, idsPorRef) }
    }

    const r = await corrigirPacotePorImportacao(pacote.id, {
      titulo: atualizacao.titulo,
      corpo: atualizacao.corpo,
      ...(atualizacao.subtitulo !== undefined ? { subtitulo: atualizacao.subtitulo } : {}),
      ...(atualizacao.notas !== undefined ? { notas: atualizacao.notas } : {}),
      ...(midias ? { midias } : {}),
    })
    return r
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível atualizar a matéria.') }
  }
}
