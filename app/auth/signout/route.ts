import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { dadosDaRequisicao } from '@/lib/acessos/agente'
import { registrarEvento } from '@/lib/acessos/servidor'

export async function POST(request: Request) {
  const supabase = await createClient()
  // A saída entra no registro de acessos antes de a sessão acabar (depois não há mais quem).
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await registrarEvento({
      evento: 'saida', tipoDeConta: 'equipe', contaId: user.id,
      requisicao: dadosDaRequisicao((nome) => request.headers.get(nome)),
    })
  }
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/', request.url), 303)
}
