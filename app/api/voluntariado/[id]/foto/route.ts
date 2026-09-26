import { revalidatePath } from 'next/cache'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { nivelDeParticipantesSemRedirecionar } from '@/lib/participantes/acesso'
import { apagarFoto, erroDaFoto, lerFotoEnviada, servirFoto, trocarFoto } from '@/lib/membro/foto-servidor'
import { fotoDoParticipante } from '@/lib/membro/foto'

/**
 * A foto do voluntário na ficha da equipe. Ver: quem vê a ficha (nível "ver"
 * do Voluntariado; a política de participantes filtra). Trocar e tirar: nível
 * "gerenciar", conferido de novo no banco (definir_foto_participante).
 */

const ID = /^[0-9a-f-]{36}$/

async function definir(id: string, caminho: string | null): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('definir_foto_participante', { p_id: id, p_foto_path: caminho })
  if (error) throw new Error(error.code === 'P0001' && error.message ? error.message : 'Não foi possível salvar a foto.')
  return (data as string | null) ?? null
}

function revalidar(id: string) {
  revalidatePath('/voluntariado')
  revalidatePath(`/voluntariado/${id}`)
}

/** Quem pode trocar: sessão da equipe, nível gerenciar, participante deste espaço. */
async function podeTrocar(id: string) {
  if (!ID.test(id)) return { erro: erroDaFoto('Cadastro não encontrado.', 404) }
  // Sem redirecionar: numa rota de API, o redirect() do requireWorkspace viraria erro 500.
  const equipe = await nivelDeParticipantesSemRedirecionar()
  if (!equipe) return { erro: erroDaFoto('Sessão expirada. Entre de novo.', 401) }
  if (equipe.nivel < 2) return { erro: erroDaFoto('Você não tem acesso para editar participantes.', 403) }
  const supabase = await createClient()
  const { data } = await supabase.from('participantes').select('id,anonimizado_em').eq('id', id).eq('workspace_id', equipe.workspaceId).maybeSingle()
  if (!data || data.anonimizado_em) return { erro: erroDaFoto('Cadastro não encontrado.', 404) }
  return { workspaceId: equipe.workspaceId }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const equipe = await nivelDeParticipantesSemRedirecionar()
  if (!equipe) return new NextResponse('Sessão expirada', { status: 401 })
  if (!ID.test(id) || equipe.nivel < 1) return new NextResponse('Não encontrado', { status: 404 })
  // Cliente da sessão: a política participantes_select_nivel também só deixa ler a quem vê o Voluntariado.
  const supabase = await createClient()
  const { data } = await supabase.from('participantes').select('foto_path').eq('id', id).eq('workspace_id', equipe.workspaceId).maybeSingle()
  const caminho = data?.foto_path as string | null | undefined
  return servirFoto(fotoDoParticipante(caminho, equipe.workspaceId, id) ? caminho : null, request)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await podeTrocar(id)
  if (r.erro) return r.erro
  const bytes = await lerFotoEnviada(request)
  if (bytes instanceof NextResponse) return bytes
  try {
    await trocarFoto({ workspaceId: r.workspaceId, participanteId: id, bytes, definir: (caminho) => definir(id, caminho) })
  } catch (causa) {
    return erroDaFoto(causa instanceof Error ? causa.message : 'Não foi possível salvar a foto.', 500)
  }
  revalidar(id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await podeTrocar(id)
  if (r.erro) return r.erro
  try {
    await apagarFoto(await definir(id, null))
  } catch (causa) {
    return erroDaFoto(causa instanceof Error ? causa.message : 'Não foi possível remover a foto.', 500)
  }
  revalidar(id)
  return NextResponse.json({ ok: true })
}
