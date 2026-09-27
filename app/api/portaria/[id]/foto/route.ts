import { revalidatePath } from 'next/cache'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { obterWorkspace } from '@/lib/session'
import { erroDaFoto, lerFotoEnviada, servirFoto } from '@/lib/membro/foto-servidor'
import { fotoDaVisita } from '@/lib/portaria/regras'
import { apagarFotoDoVisitante, guardarFotoDoVisitante } from '@/lib/portaria/servidor'

/**
 * A foto do visitante (Portaria virtual). Ver, tirar e trocar: quem usa a
 * portaria (membro do Palácio, menos a equipe da Escola). A política de
 * portaria_visitas filtra a leitura, e portaria_definir_foto confere de novo.
 */

const ID = /^[0-9a-f-]{36}$/

/** A visita pela sessão da pessoa (o RLS decide se ela vê). */
async function visita(id: string) {
  if (!ID.test(id)) return { erro: erroDaFoto('Visita não encontrada.', 404) }
  // Sem redirecionar: numa rota de API, o redirect() do requireWorkspace viraria erro 500.
  const context = await obterWorkspace()
  if (!context) return { erro: erroDaFoto('Sessão expirada. Entre de novo.', 401) }
  const supabase = await createClient()
  const { data } = await supabase.from('portaria_visitas').select('id,workspace_id,foto_path,descartada_em').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!data) return { erro: erroDaFoto('Visita não encontrada.', 404) }
  return { supabase, v: data as { id: string; workspace_id: string; foto_path: string | null; descartada_em: string | null } }
}

async function definir(supabase: Awaited<ReturnType<typeof createClient>>, id: string, caminho: string | null): Promise<string | null> {
  const { data, error } = await supabase.rpc('portaria_definir_foto', { p_id: id, p_foto_path: caminho })
  if (error) throw new Error(error.code === 'P0001' && error.message ? error.message : 'Não foi possível salvar a foto.')
  return (data as string | null) ?? null
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await visita((await params).id)
  if ('erro' in r) return r.erro
  return servirFoto(fotoDaVisita(r.v.foto_path, r.v.workspace_id, r.v.id) ? r.v.foto_path : null, request)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await visita((await params).id)
  if ('erro' in r) return r.erro
  if (r.v.descartada_em) return erroDaFoto('Visita descartada.', 400)
  const bytes = await lerFotoEnviada(request)
  if (bytes instanceof NextResponse) return bytes
  let caminho: string | null = null
  try {
    caminho = await guardarFotoDoVisitante(r.v.workspace_id, r.v.id, bytes)
    const anterior = await definir(r.supabase, r.v.id, caminho)
    if (anterior && anterior !== caminho) await apagarFotoDoVisitante(anterior)
  } catch (causa) {
    // O banco recusou: o arquivo novo sai do Blob, sem foto órfã.
    await apagarFotoDoVisitante(caminho)
    return erroDaFoto(causa instanceof Error ? causa.message : 'Não foi possível salvar a foto.', 500)
  }
  revalidatePath('/portaria')
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await visita((await params).id)
  if ('erro' in r) return r.erro
  try {
    await apagarFotoDoVisitante(await definir(r.supabase, r.v.id, null))
  } catch (causa) {
    return erroDaFoto(causa instanceof Error ? causa.message : 'Não foi possível remover a foto.', 500)
  }
  revalidatePath('/portaria')
  return NextResponse.json({ ok: true })
}
