import { revalidatePath } from 'next/cache'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NINGUEM, sessaoDoMembro } from '@/lib/membro/sessao'
import { apagarFoto, erroDaFoto, lerFotoEnviada, servirFoto, trocarFoto } from '@/lib/membro/foto-servidor'
import { fotoDoParticipante } from '@/lib/membro/foto'

/**
 * A foto de perfil do voluntário, pela sessão da Área do Voluntário: ele vê,
 * troca e tira a própria foto — sempre a do participante da sessão, nunca um
 * id vindo do navegador. Na visualização da equipe, só vê.
 */

async function membroQueEscreve() {
  const m = await sessaoDoMembro()
  if (!m) return { erro: erroDaFoto('Sua sessão acabou. Entre de novo.', 401) }
  if (m.previa) return { erro: erroDaFoto('Você está no modo de visualização: nada é gravado em nome do voluntário.', 403) }
  return { m }
}

/** O caminho que o banco devolve na RPC (a foto anterior), ou erro com a mensagem do banco. */
async function definir(participanteId: string, caminho: string | null): Promise<string | null> {
  const { data, error } = await createAdminClient().rpc('membro_definir_foto', { p_participante_id: participanteId, p_foto_path: caminho })
  if (error) throw new Error(error.code === 'P0001' && error.message ? error.message : 'Não foi possível salvar a foto.')
  return (data as string | null) ?? null
}

export async function GET(request: NextRequest) {
  const m = await sessaoDoMembro()
  if (!m) return new NextResponse('Sessão expirada', { status: 401 })
  if (m.participanteId === NINGUEM) return new NextResponse('Não encontrado', { status: 404 })
  const { data } = await createAdminClient().from('participantes').select('foto_path').eq('id', m.participanteId).maybeSingle()
  const caminho = data?.foto_path as string | null | undefined
  return servirFoto(fotoDoParticipante(caminho, m.workspaceId, m.participanteId) ? caminho : null, request)
}

export async function POST(request: NextRequest) {
  const { m, erro } = await membroQueEscreve()
  if (erro) return erro
  const bytes = await lerFotoEnviada(request)
  if (bytes instanceof NextResponse) return bytes
  try {
    await trocarFoto({ workspaceId: m.workspaceId, participanteId: m.participanteId, bytes, definir: (caminho) => definir(m.participanteId, caminho) })
  } catch (causa) {
    return erroDaFoto(causa instanceof Error ? causa.message : 'Não foi possível salvar a foto.', 500)
  }
  revalidatePath('/membro', 'layout')
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const { m, erro } = await membroQueEscreve()
  if (erro) return erro
  try {
    await apagarFoto(await definir(m.participanteId, null))
  } catch (causa) {
    return erroDaFoto(causa instanceof Error ? causa.message : 'Não foi possível remover a foto.', 500)
  }
  revalidatePath('/membro', 'layout')
  return NextResponse.json({ ok: true })
}
