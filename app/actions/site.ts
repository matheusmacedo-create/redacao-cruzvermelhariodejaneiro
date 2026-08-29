'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { publicarMateria, type ResultadoDoSite } from '@/lib/site/publicar-materia'

const texto = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

export type { ResultadoDoSite }

/**
 * Publica uma matéria como página no site. Casca fina: o trabalho de verdade
 * mora em lib/site/publicar-materia.ts, compartilhado com o job do hub.
 */
export async function publicarArtigoNoSite(formData: FormData): Promise<ResultadoDoSite> {
  const context = await requireWorkspace()
  const contentId = texto(formData, 'contentId')
  if (!contentId) return { erro: 'Conteúdo não informado.' }

  const resultado = await publicarMateria({
    workspaceId: context.workspace.id,
    userId: context.user.id,
    contentId,
    titulo: texto(formData, 'title'),
    subtitulo: texto(formData, 'subtitle'),
    corpo: texto(formData, 'body'),
  })

  if (!resultado.erro) revalidatePath(`/conteudos/${contentId}`)
  return resultado
}
