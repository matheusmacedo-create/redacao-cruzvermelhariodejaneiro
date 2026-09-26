/**
 * Banners do Início da Área do Voluntário — as regras, sem banco. Conferidas
 * com `npx tsx` (scripts/conferir-banners.ts).
 *
 * Um banner está no ar quando está ligado e hoje cai dentro do período (as
 * duas pontas contam; sem início ou sem fim, o lado fica aberto). A ordem é a
 * que a coordenação deu (menor primeiro); no empate, o mais novo na frente.
 */

export type PeriodoDoBanner = { ativo: boolean; inicio: string | null; fim: string | null }

export const TIPOS_DE_IMAGEM = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const
export const TAMANHO_MAXIMO = 5 * 1024 * 1024
/** Quantos banners giram no Início, no máximo: mais que isso ninguém chega a ver. */
export const MAXIMO_NO_AR = 5

export function bannerNoAr(b: PeriodoDoBanner, hoje: string): boolean {
  return b.ativo && (!b.inicio || b.inicio <= hoje) && (!b.fim || b.fim >= hoje)
}

/** Para a equipe: por que o banner aparece ou não, em poucas palavras. */
export function situacaoDoBanner(b: PeriodoDoBanner, hoje: string): 'no_ar' | 'desligado' | 'agendado' | 'encerrado' {
  if (!b.ativo) return 'desligado'
  if (b.inicio && b.inicio > hoje) return 'agendado'
  if (b.fim && b.fim < hoje) return 'encerrado'
  return 'no_ar'
}

export function ordenarBanners<B extends { ordem: number; created_at: string }>(lista: B[]): B[] {
  return [...lista].sort((a, b) => a.ordem - b.ordem || b.created_at.localeCompare(a.created_at))
}

/**
 * O endereço do botão, conferido: uma página da própria Área do Voluntário
 * (/membro…) ou um https://. Vazio vira null (banner sem botão). Qualquer
 * outra coisa (http://, javascript:, //outro-site) é recusada — o banco
 * confere a mesma regra.
 */
export function lerLink(bruto: string): { url: string | null; erro?: string } {
  const url = bruto.trim()
  if (!url) return { url: null }
  if (url.length > 500) return { url: null, erro: 'O endereço do botão é longo demais.' }
  if (/^\/membro(\/|$|\?|#)/.test(url)) return { url }
  if (/^https:\/\/[^\s/]+\.[^\s]+$/.test(url)) {
    try { new URL(url); return { url } } catch { /* cai no erro abaixo */ }
  }
  return { url: null, erro: 'O botão precisa levar a uma página da Área do Voluntário (/membro/…) ou a um endereço https://.' }
}

/** O caminho da imagem é o que o servidor preparou para este espaço — nada de apontar para arquivo de outro. */
export function caminhoValido(caminho: string, workspaceId: string): boolean {
  return new RegExp(`^${workspaceId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(caminho)
}
