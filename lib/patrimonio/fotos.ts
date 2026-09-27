/**
 * Fotos do bem do Patrimônio: o que é puro (sem DOM, sem Blob) e vale no
 * navegador, no servidor e num script `npx tsx` (scripts/conferir-fotos-do-patrimonio.ts).
 *
 * Diferente do retrato do voluntário (quadrado de 512 px), a foto de um
 * objeto precisa mostrar o objeto inteiro e a plaqueta legível: mantém a
 * proporção e vai até 1600 px no lado maior. O navegador reduz antes de subir
 * (lib/patrimonio/preparar-foto.ts); o servidor confere o que chegou e tira
 * qualquer EXIF que tenha sobrado (sem GPS).
 */

import { farejarTipo, jpegTemMetadados } from '@/lib/midia/regras'
import { jpegSemMetadados, medidasDoJpeg } from '@/lib/membro/foto'

/** O lado maior da foto, em pixels. */
export const LADO_DA_FOTO_DO_BEM = 1600
export const QUALIDADE_DA_FOTO_DO_BEM = 0.82
/** Um JPEG de 1600 px a 0,82 fica em 200–600 KB; a folga cobre foto com muito detalhe (e fica longe dos 4,5 MB da Vercel). */
export const LIMITE_DA_FOTO_DO_BEM = 1_800_000
/** Lado menor mínimo: menos que isso não mostra o objeto. */
export const LADO_MINIMO_DA_FOTO_DO_BEM = 200
/** O banco confere o mesmo número (patrimonio_foto_adicionar). */
export const MAXIMO_DE_FOTOS_DO_BEM = 12

export type FotoDoBem = { id: string; path: string; legenda: string | null; ordem: number; created_at: string }

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const CAMINHO = new RegExp(`^patrimonio/(${UUID})/(${UUID})/(${UUID})\\.jpg$`)

/** Onde a foto mora no Blob privado. O banco confere o mesmo formato. */
export const caminhoDaFotoDoBem = (workspaceId: string, bemId: string, id: string) => `patrimonio/${workspaceId}/${bemId}/${id}.jpg`

/** O caminho é de uma foto deste bem, no formato que o servidor gera? */
export function fotoDoBem(caminho: string | null | undefined, workspaceId: string, bemId: string): boolean {
  const m = caminho ? CAMINHO.exec(caminho) : null
  return Boolean(m && m[1] === workspaceId && m[2] === bemId)
}

/** O endereço da foto, pela sessão do Palácio. O `?v=` é o nome do arquivo: o navegador pode guardar sem risco. */
export const urlDaFotoDoBem = (f: Pick<FotoDoBem, 'id' | 'path'>) => `/api/patrimonio/fotos/${f.id}?v=${CAMINHO.exec(f.path)?.[3] ?? '0'}`

/** A capa: a primeira pela ordem (e, no empate, a mais antiga). */
export function ordenarFotos<T extends Pick<FotoDoBem, 'ordem' | 'created_at'>>(fotos: T[]): T[] {
  return [...fotos].sort((a, b) => a.ordem - b.ordem || a.created_at.localeCompare(b.created_at))
}

/** O tamanho de saída: reduz para caber em `lado` no lado maior, sem aumentar foto pequena. */
export function medidasNaSaida(largura: number, altura: number, lado = LADO_DA_FOTO_DO_BEM): { largura: number; altura: number } {
  const escala = Math.min(1, lado / Math.max(largura, altura))
  return { largura: Math.max(1, Math.round(largura * escala)), altura: Math.max(1, Math.round(altura * escala)) }
}

/**
 * Confere a foto que chegou ao servidor e a devolve limpa, ou a mensagem de
 * erro. Só aceita o que a tela gera: JPEG de até 1600 px no lado maior.
 */
export function conferirFotoDoBem(b: Uint8Array): { bytes: Uint8Array } | { erro: string } {
  if (!b.length) return { erro: 'Selecione uma foto.' }
  if (b.length > LIMITE_DA_FOTO_DO_BEM) return { erro: 'A foto chegou grande demais. Tente de novo pela tela do bem.' }
  if (farejarTipo(b) !== 'jpeg') return { erro: 'A foto precisa chegar em JPEG. Tente de novo pela tela do bem.' }
  const limpa = jpegSemMetadados(b)
  if (!limpa || jpegTemMetadados(limpa)) return { erro: 'Não foi possível ler esta foto. Tente outra.' }
  const m = medidasDoJpeg(limpa)
  if (!m || Math.max(m.largura, m.altura) > LADO_DA_FOTO_DO_BEM || Math.min(m.largura, m.altura) < LADO_MINIMO_DA_FOTO_DO_BEM) {
    return { erro: `A foto precisa ter de ${LADO_MINIMO_DA_FOTO_DO_BEM} a ${LADO_DA_FOTO_DO_BEM} pixels. Tente de novo pela tela do bem.` }
  }
  return { bytes: limpa }
}
