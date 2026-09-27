import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * A logo oficial da filial (public/images/logo-cvrj.png), lida do disco uma
 * vez por instância. Entra no pacote da Vercel por `outputFileTracingIncludes`
 * (next.config.mjs). Sem o arquivo, null: a peça sai sem a imagem.
 */
let logo: Promise<Uint8Array | null> | null = null
export function logoOficial(): Promise<Uint8Array | null> {
  logo ??= readFile(join(process.cwd(), 'public', 'images', 'logo-cvrj.png')).then((b) => new Uint8Array(b), () => null)
  return logo
}

/** Largura ÷ altura da logo (1844 × 752 px). */
export const PROPORCAO_DA_LOGO = 1844 / 752
