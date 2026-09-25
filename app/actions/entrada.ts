'use server'

import { cookies, headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { resolverLogin } from '@/app/actions/contas'
import { dadosDaRequisicao } from '@/lib/acessos/agente'
import { lerSinais, mensagemDeBloqueio } from '@/lib/acessos/regras'
import {
  COOKIE_DO_APARELHO, OPCOES_DO_COOKIE_DO_APARELHO, conferirBloqueio, registrarEntradaDaEquipe, registrarEvento,
  registrarFalhaDaEquipe, registrarVerificacaoDaEquipe,
} from '@/lib/acessos/servidor'

/**
 * As duas conferências em volta do login da equipe (docs/registro-de-acessos.md §5.1).
 *
 * O login em si continua no navegador, como sempre foi: se algo aqui falhar,
 * a pessoa entra do mesmo jeito. O que muda:
 *  - ANTES da senha, o servidor confere o bloqueio por tentativas erradas e
 *    traduz o e-mail para o usuário da conta (o que resolverLogin já fazia);
 *  - DEPOIS, registra o resultado. A entrada certa é conferida pelo cookie da
 *    sessão — não basta o navegador dizer "entrei".
 */

const requisicao = async () => {
  const h = await headers()
  return dadosDaRequisicao((nome) => h.get(nome))
}

export async function prepararEntrada(identificadorBruto: string): Promise<{ email: string; bloqueado?: string }> {
  const identificador = String(identificadorBruto ?? '').trim().toLowerCase().slice(0, 254)
  const email = await resolverLogin(identificador)
  if (!identificador) return { email }
  const r = await requisicao()
  const bloqueio = await conferirBloqueio(identificador, r.ip)
  if (bloqueio.bloqueado) {
    await registrarEvento({ evento: 'entrada_bloqueada', tipoDeConta: 'equipe', identificador, requisicao: r, motivo: `Bloqueio até ${bloqueio.liberaEm.toISOString()}` })
    return { email, bloqueado: mensagemDeBloqueio(bloqueio) }
  }
  return { email }
}

export async function concluirEntrada(identificadorBruto: string, ok: boolean, motivo: string, sinaisBrutos: string): Promise<void> {
  try {
    const identificador = String(identificadorBruto ?? '').trim().toLowerCase().slice(0, 254)
    const r = await requisicao()
    const sinais = lerSinais(sinaisBrutos)
    if (ok) {
      const { data: { user } } = await (await createClient()).auth.getUser()
      if (user) {
        const jar = await cookies()
        const { novoCookie } = await registrarEntradaDaEquipe({ userId: user.id, requisicao: r, sinais, cookieAtual: jar.get(COOKIE_DO_APARELHO)?.value ?? null })
        if (novoCookie) jar.set(COOKIE_DO_APARELHO, novoCookie, OPCOES_DO_COOKIE_DO_APARELHO)
        return
      }
      // O navegador disse que entrou, mas a sessão não chegou aqui: não conta como entrada.
    }
    if (identificador) await registrarFalhaDaEquipe(identificador, String(motivo ?? '').slice(0, 120) || 'Senha errada', r, sinais)
  } catch (causa) {
    console.error('[acessos] conclusão da entrada:', causa instanceof Error ? causa.message : causa)
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
