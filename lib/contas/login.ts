import 'server-only'

import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { emailValido } from '@/lib/contas/emails'

/**
 * Traduz o que a pessoa digitou no login para o e-mail interno do Auth.
 *
 * Usuário vira `usuario@usuarios.cvrj.local` direto. E-mail é procurado entre
 * os CONFIRMADOS; se não existir, devolve um endereço interno que não existe
 * (derivado do que foi digitado), e o login falha com a mesma mensagem de
 * senha errada.
 *
 * Mora aqui, e não num arquivo 'use server': função exportada de lá vira
 * endpoint público, e esta resposta diz quem tem conta e qual é o usuário
 * dela. Só a action de entrar (app/actions/entrada.ts) chama, e o resultado
 * nunca volta ao navegador.
 */
export async function emailDoLogin(identificador: string): Promise<string> {
  const valor = String(identificador ?? '').trim().toLowerCase().slice(0, 254)
  if (!valor.includes('@')) return emailInterno(valor)
  const falso = `x${createHash('sha256').update(valor).digest('hex').slice(0, 24)}@usuarios.cvrj.local`
  const email = emailValido(valor)
  if (!email) return falso
  try {
    const { data } = await createAdminClient().from('profiles').select('username')
      .eq('email', email).not('email_confirmado_em', 'is', null).eq('active', true).maybeSingle()
    return data?.username ? emailInterno(data.username) : falso
  } catch {
    return falso
  }
}

const emailInterno = (usuario: string) => `${usuario}@usuarios.cvrj.local`
