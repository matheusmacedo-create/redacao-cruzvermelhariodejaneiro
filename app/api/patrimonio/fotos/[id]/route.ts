import { revalidatePath } from 'next/cache'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { obterWorkspace } from '@/lib/session'
import { erroDaFoto, servirFoto } from '@/lib/membro/foto-servidor'
import { fotoDoBem } from '@/lib/patrimonio/fotos'
import { apagarFotoDoBem } from '@/lib/patrimonio/fotos-servidor'

/**
 * Ver e tirar uma foto do bem. Ver: quem vê o bem (a política de
 * pat_bem_fotos). Tirar: patrimonio_foto_remover confere o nível de operação.
 */

const ID = /^[0-9a-f-]{36}$/

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!ID.test(id)) return new NextResponse('Não encontrado', { status: 404 })
  const context = await obterWorkspace()
  if (!context) return new NextResponse('Sessão expirada', { status: 401 })
  const supabase = await createClient()
  const { data } = await supabase.from('pat_bem_fotos').select('path,workspace_id,bem_id').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  return servirFoto(data && fotoDoBem(data.path as string, data.workspace_id as string, data.bem_id as string) ? data.path as string : null, request)
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!ID.test(id)) return erroDaFoto('Foto não encontrada.', 404)
  const context = await obterWorkspace()
  if (!context) return erroDaFoto('Sessão expirada. Entre de novo.', 401)
  const supabase = await createClient()
  const { data: caminho, error } = await supabase.rpc('patrimonio_foto_remover', { p_id: id })
  if (error) return erroDaFoto(error.code === 'P0001' && error.message ? error.message : 'Não foi possível tirar a foto.', 400)
  await apagarFotoDoBem(caminho as string | null)
  revalidatePath('/patrimonio', 'layout')
  return NextResponse.json({ ok: true })
}
