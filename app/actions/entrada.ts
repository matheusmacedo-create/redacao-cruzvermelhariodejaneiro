'use server'

import { cookies, headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { emailDoLogin } from '@/lib/contas/login'
import { dadosDaRequisicao } from '@/lib/acessos/agente'
import { lerSinais, mensagemDeBloqueio } from '@/lib/acessos/regras'
import {
  COOKIE_DO_APARELHO, OPCOES_DO_COOKIE_DO_APARELHO, conferirBloqueio, registrarEntradaDaEquipe, registrarEvento,
  registrarFalhaDaEquipe, registrarVerificacaoDaEquipe,
} from '@/lib/acessos/servidor'

/**
 * O login da equipe, inteiro no servidor (docs/registro-de-acessos.md §5.1).
 *
 * Antes, a senha ia do navegador direto ao Supabase, e o servidor só entrava
 * antes (bloqueio) e depois (registro), a pedido da tela. Isso deixava três
 * furos: a tela recebia o e-mail interno da conta (quem tem conta e qual é o
 * usuário), o bloqueio por tentativas erradas valia só para quem usasse a
 * tela, e qualquer um podia registrar "senha errada" em nome de outra conta
 * — e bloqueá-la. Aqui a ordem é fixa: confere o bloqueio, entra com o
 * cliente do servidor (que grava o cookie da sessão), registra o resultado.
 * O navegador só recebe "entrou" ou a mensagem de erro.
 */

const requisicao = async () => {
  const h = await headers()
  return dadosDaRequisicao((nome) => h.get(nome))
}

const SENHA_ERRADA = 'Usuário ou senha inválidos.'

export async function entrar(identificadorBruto: string, senhaBruta: string, sinaisBrutos: string): Promise<{ erro?: string }> {
  const identificador = String(identificadorBruto ?? '').trim().toLowerCase().slice(0, 254)
  const senha = String(senhaBruta ?? '')
  if (!identificador || !senha || senha.length > 200) return { erro: SENHA_ERRADA }
  try {
    const r = await requisicao()
    const sinais = lerSinais(sinaisBrutos)

    const bloqueio = await conferirBloqueio(identificador, r.ip)
    if (bloqueio.bloqueado) {
      await registrarEvento({ evento: 'entrada_bloqueada', tipoDeConta: 'equipe', identificador, requisicao: r, motivo: `Bloqueio até ${bloqueio.liberaEm.toISOString()}` })
      return { erro: mensagemDeBloqueio(bloqueio) }
    }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email: await emailDoLogin(identificador), password: senha })
    if (error || !data.user) {
      const desativada = error?.code === 'user_banned'
      await registrarFalhaDaEquipe(identificador, desativada ? 'Conta desativada' : 'Senha errada', r, sinais)
      return { erro: desativada ? 'Esta conta está desativada. Fale com um administrador.' : SENHA_ERRADA }
    }

    try {
      const jar = await cookies()
      const { novoCookie } = await registrarEntradaDaEquipe({ userId: data.user.id, requisicao: r, sinais, cookieAtual: jar.get(COOKIE_DO_APARELHO)?.value ?? null })
      if (novoCookie) jar.set(COOKIE_DO_APARELHO, novoCookie, OPCOES_DO_COOKIE_DO_APARELHO)
    } catch (causa) {
      // O registro nunca impede a entrada: a senha já foi conferida.
      console.error('[acessos] registro da entrada:', causa instanceof Error ? causa.message : causa)
    }
    return {}
  } catch (causa) {
    console.error('[acessos] entrada:', causa instanceof Error ? causa.message : causa)
    return { erro: 'Não foi possível entrar agora. Tente de novo em instantes.' }
  }
}

/** Depois do código do app autenticador (segunda etapa). */
export async function registrarVerificacao(ok: boolean): Promise<void> {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser()
    if (!user) return
    await registrarVerificacaoDaEquipe(user.id, ok, await requisicao(), (await cookies()).get(COOKIE_DO_APARELHO)?.value ?? null)
  } catch (causa) {
    console.error('[acessos] verificação:', causa instanceof Error ? causa.message : causa)
  }
}
