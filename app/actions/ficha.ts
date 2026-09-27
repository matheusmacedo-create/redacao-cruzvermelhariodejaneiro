'use server'

import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { DOCUMENTOS } from '@/lib/rh/regras'
import { lerFicha } from '@/lib/rh/ficha'
import { avisarQuemPediuAFicha, hashDoConvite } from '@/lib/rh/convites'

/**
 * A página pública /ficha/<token>: a pessoa manda os próprios dados. Sem
 * login — quem autoriza é o token (uso único, 7 dias), conferido pela função
 * do banco, que também decide o que pode ser gravado (nunca banco, cargo ou
 * salário) e registra na auditoria que foi a própria pessoa.
 */
export async function enviarFicha(token: string, formData: FormData): Promise<{ erro?: string; ok?: boolean }> {
  try {
    if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) throw new Error('Este link não vale. Peça um novo ao RH.')
    const dados = lerFicha(Object.fromEntries(formData.entries()), DOCUMENTOS.map((d) => d.campo))
    if (!Object.keys(dados).length) throw new Error('Preencha ao menos um campo.')
    const { error } = await createAdminClient().rpc('equipe_preencher_pelo_convite', { p_token_hash: hashDoConvite(token), p: dados })
    if (error) throw new Error(error.code === 'P0001' && error.message ? error.message : 'Não foi possível guardar agora. Tente de novo em instantes.')
    after(() => avisarQuemPediuAFicha(token))
    return { ok: true }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível guardar agora.') }
  }
}
