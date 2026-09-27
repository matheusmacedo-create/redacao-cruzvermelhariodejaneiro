/**
 * A versão no ar, para o pé do menu (só para quem cuida do sistema). Puro:
 * lê o que a Vercel passa no build (VERCEL_GIT_COMMIT_SHA e
 * VERCEL_GIT_COMMIT_MESSAGE) e a hora do build (PALACIO_PUBLICADO_EM,
 * next.config.mjs).
 *
 * Conferência: npx tsx scripts/conferir-versao.ts
 */

export const REPOSITORIO = 'https://github.com/matheusmacedo-create/redacao-cruzvermelhariodejaneiro'

export type Versao = {
  /** "3bb0897"; null fora da Vercel (rodando local). */
  commit: string | null
  /** O que mudou, em uma linha: o título do PR ou a primeira linha do commit. */
  titulo: string | null
  pr: number | null
  /** ISO da hora do build. */
  publicadaEm: string | null
  linkDoCommit: string | null
  linkDoPr: string | null
}

/**
 * "Merge pull request #272 from dono/ramo\n\nTítulo do PR" vira PR 272 com o
 * título; um commit direto fica com a primeira linha. Nada disso aparece cru.
 */
export function lerVersao(e: { sha?: string | null; mensagem?: string | null; publicadaEm?: string | null }): Versao {
  const commit = e.sha ? e.sha.slice(0, 7) : null
  const linhas = (e.mensagem ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const merge = linhas[0]?.match(/^Merge pull request #(\d+)\b/)
  const pr = merge ? Number(merge[1]) : null
  const bruto = merge ? (linhas[1] ?? null) : (linhas[0] ?? null)
  const titulo = bruto ? (bruto.length > 120 ? `${bruto.slice(0, 119)}…` : bruto) : null
  const data = e.publicadaEm && !Number.isNaN(Date.parse(e.publicadaEm)) ? e.publicadaEm : null
  return {
    commit,
    titulo,
    pr,
    publicadaEm: data,
    linkDoCommit: e.sha ? `${REPOSITORIO}/commit/${e.sha}` : null,
    linkDoPr: pr ? `${REPOSITORIO}/pull/${pr}` : null,
  }
}

/** "hoje, 20:24", "ontem, 09:10" ou "25/09, 14:03", no horário de Brasília. */
export function quandoFoiPublicada(iso: string, agora: Date = new Date()): string {
  const dia = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  const ontem = new Date(agora.getTime() - 86_400_000)
  if (dia(new Date(iso)) === dia(agora)) return `hoje, ${hora}`
  if (dia(new Date(iso)) === dia(ontem)) return `ontem, ${hora}`
  const data = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(new Date(iso))
  return `${data}, ${hora}`
}
