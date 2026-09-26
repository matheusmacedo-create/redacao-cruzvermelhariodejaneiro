'use server'

import { obterWorkspace } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { ehControleDoNext } from '@/lib/erro-de-acao'
import { ehChaveDeTour } from '@/lib/ajuda'
import { comAtalho, comBoasVindas, comTourVisto, lerProgresso, progressoZerado, type Progresso } from '@/lib/ajuda/progresso'

export type EventoDaAjuda = { tipo: 'boas-vindas' } | { tipo: 'tour'; chave: string } | { tipo: 'recomecar' } | { tipo: 'atalho'; ligado: boolean }

/**
 * Guarda o que a pessoa já viu da ajuda (lib/ajuda/progresso.ts): as
 * boas-vindas, os tours de cada tela, o recomeço do zero — e se a tecla "?"
 * está ligada.
 *
 * A tela já mudou antes de chamar (otimista); isto só registra para valer em
 * outro aparelho e no próximo acesso. Por isso nunca lança nem redireciona:
 * uma falha aqui só faz a dica aparecer de novo, e não pode virar erro na
 * frente de ninguém. Daí obterWorkspace, e não requireWorkspace: com a
 * sessão vencida (ou com a senha provisória, ou a verificação pendente), o
 * requireWorkspace redirecionaria no meio do trabalho — a action roda por
 * trás, ao fechar um tour ou tocar "Agora não" — e o que estava sendo
 * digitado na página se perderia. Sem sessão válida, não grava; a próxima
 * ação de verdade da página leva ao login.
 *
 * O servidor recalcula a partir do que está gravado e só aceita chave de tour
 * que existe no conteúdo: o metadata vai no token de toda requisição e não
 * pode crescer com lixo mandado pelo navegador.
 */
export async function registrarAjuda(evento: EventoDaAjuda): Promise<{ ok: boolean }> {
  try {
    const context = await obterWorkspace({ escola: true })
    // A senha provisória vem antes de tudo (requireWorkspace manda para /trocar-senha): nada a guardar ainda.
    if (!context || context.profile?.trocar_senha) return { ok: false }
    const atual = lerProgresso(context.user.user_metadata?.ajuda)
    const novo = proximo(atual, evento)
    if (!novo) return { ok: false }
    if (mesmo(atual, novo)) return { ok: true }
    // Pelo cliente admin, para o id que o obterWorkspace acabou de conferir
    // (nunca um id vindo do navegador). O cliente da própria pessoa
    // (auth.updateUser) regravaria o cookie da sessão, e cookie gravado numa
    // action faz o Next refazer no servidor o layout e a página abertos — a
    // cada "Agora não" e a cada tour. O Auth mescla o user_metadata chave a
    // chave: só "ajuda" muda, o resto (nome, usuário) fica.
    const { error } = await createAdminClient().auth.admin.updateUserById(context.user.id, { user_metadata: { ajuda: novo } })
    if (error) {
      console.error('[ajuda] não foi possível guardar o progresso:', error.code ?? error.status ?? 'erro do Auth')
      return { ok: false }
    }
    return { ok: true }
  } catch (causa) {
    if (ehControleDoNext(causa)) throw causa
    console.error('[ajuda] falha ao registrar:', causa instanceof Error ? causa.message : 'erro desconhecido')
    return { ok: false }
  }
}

/** O progresso depois do evento, ou null se o evento não vale (formato estranho, chave desconhecida). */
function proximo(atual: Progresso, evento: unknown): Progresso | null {
  if (!evento || typeof evento !== 'object') return null
  const { tipo, chave, ligado } = evento as { tipo?: unknown; chave?: unknown; ligado?: unknown }
  if (tipo === 'boas-vindas') return comBoasVindas(atual, new Date().toISOString())
  // Recomeçar é dos tours: a tecla "?" desligada continua desligada.
  if (tipo === 'recomecar') return comAtalho(progressoZerado(), !atual.semAtalho)
  if (tipo === 'atalho' && typeof ligado === 'boolean') return comAtalho(atual, ligado)
  if (tipo === 'tour' && typeof chave === 'string' && chave.length <= 120 && ehChaveDeTour(chave)) return comTourVisto(atual, chave)
  return null
}

function mesmo(a: Progresso, b: Progresso): boolean {
  return a.boasVindas === b.boasVindas && Boolean(a.semAtalho) === Boolean(b.semAtalho)
    && a.vistos.length === b.vistos.length && a.vistos.every((v, i) => v === b.vistos[i])
}
