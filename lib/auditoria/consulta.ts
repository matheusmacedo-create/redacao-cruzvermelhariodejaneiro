import 'server-only'

import { createHash, createHmac } from 'node:crypto'
import { ORIGEM_DO_SITE } from '@/lib/site/sitemap'
import type { CodigoLido } from './catalogo'

/**
 * O que as rotas públicas de verificação têm em comum: CORS só para o site,
 * limite por hora sem guardar IP e os endereços de prova de cada resposta.
 * A página que consome isto é https://cruzvermelhariodejaneiro.org/verificar/
 * (repositório do site); o contrato está em docs/auditoria-publica.md §4.
 */

export const LIMITE_POR_HORA = { consulta: 30, arquivo: 60 } as const

/** O endereço do site, tirado de SITE_PUBLIC_BASE_URL (a pasta das matérias) quando existe. */
export function origemDoSite(): string {
  const base = process.env.SITE_PUBLIC_BASE_URL?.trim()
  try { if (base) return new URL(base).origin } catch { /* fica o padrão */ }
  return ORIGEM_DO_SITE
}

function origensPermitidas(): Set<string> {
  const u = new URL(origemDoSite())
  const semWww = u.hostname.replace(/^www\./, '')
  return new Set([`${u.protocol}//${semWww}`, `${u.protocol}//www.${semWww}`, ORIGEM_DO_SITE])
}

export function cabecalhos(request: Request): Record<string, string> {
  const h: Record<string, string> = {
    Vary: 'Origin',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  }
  const origem = request.headers.get('origin')
  if (origem && origensPermitidas().has(origem)) {
    h['Access-Control-Allow-Origin'] = origem
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    h['Access-Control-Allow-Headers'] = 'Content-Type'
    h['Access-Control-Expose-Headers'] = 'Content-Disposition, Retry-After'
    h['Access-Control-Max-Age'] = '600'
  }
  return h
}

/**
 * Chave do limite: HMAC de rota e IP com um segredo que não está no banco
 * (AUDITORIA_SEGREDO; na falta, derivado da chave de serviço). SHA-256 puro de
 * IP se desfaz por força bruta — são só 4 bilhões de IPv4.
 */
export function chaveDoLimite(request: Request, rota: keyof typeof LIMITE_POR_HORA): string {
  const segredo = process.env.AUDITORIA_SEGREDO?.trim()
    || createHash('sha256').update(`trilha-publica:limite:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`).digest('hex')
  const ip = request.headers.get('x-real-ip')?.trim() || (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'desconhecido'
  return createHmac('sha256', segredo).update(`${rota}|${ip}`).digest('hex')
}

/** Segundos até a janela do limite virar (as janelas são horas cheias). */
export const segundosAteAProximaHora = () => 3600 - Math.floor((Date.now() / 1000) % 3600)

type Projecao = { encontrado: boolean; codigo?: string; classe?: string; lote?: { dia: string; ots?: boolean } | null } & Record<string, unknown>

/** A resposta pública com os endereços de prova e, para quem digitou o código do próprio documento, a página dele. */
export function comLinks(p: Projecao, lido: CodigoLido | null, origemDaApi: string) {
  if (!p.encontrado || !p.codigo) return { encontrado: false }
  const lote = p.lote ?? null
  return {
    ...p,
    links: {
      prova: lote?.ots ? `${origemDaApi}/api/publico/verificar/${p.codigo}/prova` : null,
      conteudo: p.classe === 'P' ? `${origemDaApi}/api/publico/verificar/${p.codigo}/conteudo` : null,
      manifesto: lote ? `${origemDoSite()}/verificar/lotes/${lote.dia}/manifesto.json` : null,
      pagina_propria: lido?.tipo === 'oficio' ? `${origemDaApi}/verificar/${lido.codigo}`
        : lido?.tipo === 'certificado' ? `${origemDaApi}/certificado/${lido.codigo}` : null,
    },
  }
}
