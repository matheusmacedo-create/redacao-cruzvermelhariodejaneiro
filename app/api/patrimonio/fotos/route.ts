import { revalidatePath } from 'next/cache'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { obterWorkspace } from '@/lib/session'
import { erroDaFoto } from '@/lib/membro/foto-servidor'
import { LIMITE_DA_FOTO_DO_BEM, conferirFotoDoBem } from '@/lib/patrimonio/fotos'
import { apagarFotoDoBem, guardarFotoDoBem } from '@/lib/patrimonio/fotos-servidor'

/**
 * Põe uma foto no bem do Patrimônio. O bem é lido pela sessão da pessoa (o
 * RLS decide se ela o vê); patrimonio_foto_adicionar confere o nível de
 * operação, o bem baixado, o limite de fotos e o formato do caminho.
 */

const ID = /^[0-9a-f-]{36}$/

export async function POST(request: NextRequest) {
  // Sem redirecionar: numa rota de API, o redirect() do requireWorkspace viraria erro 500.
  const context = await obterWorkspace()
  if (!context) return erroDaFoto('Sessão expirada. Entre de novo.', 401)
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return erroDaFoto('Não foi possível ler a foto enviada.', 400)
  }
  const bemId = formData.get('bem')
  const file = formData.get('foto')
  if (typeof bemId !== 'string' || !ID.test(bemId)) return erroDaFoto('Bem não encontrado.', 404)
  if (!(file instanceof File)) return erroDaFoto('Selecione uma foto.', 400)
  if (file.size > LIMITE_DA_FOTO_DO_BEM) return erroDaFoto('A foto chegou grande demais. Tente de novo pela tela do bem.', 400)
  const conferida = conferirFotoDoBem(new Uint8Array(await file.arrayBuffer()))
  if ('erro' in conferida) return erroDaFoto(conferida.erro, 400)

  const supabase = await createClient()
  const { data: bem } = await supabase.from('pat_bens').select('id,workspace_id').eq('id', bemId).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!bem) return erroDaFoto('Bem não encontrado.', 404)

  let caminho: string | null = null
  try {
    caminho = await guardarFotoDoBem(bem.workspace_id as string, bem.id as string, conferida.bytes)
    const { error } = await supabase.rpc('patrimonio_foto_adicionar', { p_bem_id: bem.id, p_path: caminho })
    if (error) throw new Error(error.code === 'P0001' && error.message ? error.message : 'Não foi possível salvar a foto.')
  } catch (causa) {
    // O banco recusou: o arquivo novo sai do Blob, sem foto órfã.
    await apagarFotoDoBem(caminho)
    return erroDaFoto(causa instanceof Error ? causa.message : 'Não foi possível salvar a foto.', 400)
  }
  revalidatePath('/patrimonio', 'layout')
  return NextResponse.json({ ok: true })
}
