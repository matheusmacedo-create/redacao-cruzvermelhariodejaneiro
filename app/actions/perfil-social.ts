'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { ehCapa, lerHabilidades, LIMITES, normalizarContato, type Contato } from '@/lib/pessoas/perfil'

export type DadosDoPerfilSocial = {
  bio: string
  pronomes: string
  capa: string
  disponibilidade: string
  habilidades: string[]
  contatos: Partial<Record<keyof Contato, string>>[]
  mostrarMetricas: boolean
}

/**
 * Grava o perfil social de QUEM ESTÁ LOGADO. Não recebe id de pessoa:
 * ninguém edita o perfil de outra pessoa, nem administrador — é a
 * apresentação dela, com os contatos que ela escolheu mostrar.
 */
export async function salvarPerfilSocial(dados: DadosDoPerfilSocial): Promise<{ erro?: string; erros?: Record<number, string> }> {
  try {
    const context = await requireWorkspace()
    const contatos: Contato[] = []
    const erros: Record<number, string> = {}
    for (const [i, c] of (Array.isArray(dados?.contatos) ? dados.contatos : []).slice(0, LIMITES.contatos).entries()) {
      // Linha deixada em branco na tela não é erro: só não entra.
      if (!String(c?.valor ?? '').trim()) continue
      const r = normalizarContato(c ?? {})
      if (r.erro) erros[i] = r.erro
      else if (r.contato) contatos.push(r.contato)
    }
    if (Object.keys(erros).length) return { erro: 'Confira os contatos marcados.', erros }

    const bio = String(dados?.bio ?? '').trim()
    if (bio.length > LIMITES.bio) throw new Error(`A apresentação passa de ${LIMITES.bio} caracteres.`)

    const { error } = await createAdminClient().from('perfil_social').upsert({
      user_id: context.user.id,
      bio,
      pronomes: String(dados?.pronomes ?? '').trim().slice(0, LIMITES.pronomes),
      capa: ehCapa(dados?.capa) ? dados.capa : 'vermelho',
      disponibilidade: String(dados?.disponibilidade ?? '').replace(/\s+/g, ' ').trim().slice(0, LIMITES.disponibilidade),
      habilidades: lerHabilidades(Array.isArray(dados?.habilidades) ? dados.habilidades : []),
      contatos,
      mostrar_metricas: dados?.mostrarMetricas !== false,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    if (error) throw new Error('Não foi possível salvar o perfil.')

    revalidatePath(`/pessoas/${context.user.id}`)
    revalidatePath('/pessoas')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o perfil.') }
  }
}
