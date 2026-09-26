/**
 * Foto de perfil do voluntário: o que é puro (sem DOM, sem Blob) e vale no
 * navegador, no servidor e num script `npx tsx`.
 *
 * A foto é reduzida no navegador antes de subir (lib/membro/preparar-foto.ts):
 * foto de celular passa dos 4,5 MB que o corpo de uma função da Vercel aceita.
 * O servidor confere o que chegou (JPEG pelo conteúdo, no tamanho de um
 * retrato de 512×512) e tira qualquer EXIF/XMP que tenha sobrado (sem GPS).
 */

import { farejarTipo, jpegTemMetadados } from '@/lib/midia/regras'

/** Lado do retrato quadrado, em pixels. */
export const LADO_DA_FOTO = 512
export const QUALIDADE_DA_FOTO = 0.85
/** Um JPEG de 512×512 a 0,85 fica em 40–150 KB; a folga cobre foto com muito detalhe. */
export const LIMITE_DA_FOTO = 600 * 1024

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const CAMINHO = new RegExp(`^voluntarios/(${UUID})/(${UUID})/(${UUID})\\.jpg$`)

/** Onde a foto mora no Blob privado. O banco confere o mesmo formato (membro_definir_foto). */
export const caminhoDaFoto = (workspaceId: string, participanteId: string, id: string) => `voluntarios/${workspaceId}/${participanteId}/${id}.jpg`

/** O caminho é de uma foto deste participante, no formato que o servidor gera? */
export function fotoDoParticipante(caminho: string | null | undefined, workspaceId: string, participanteId: string): boolean {
  const m = caminho ? CAMINHO.exec(caminho) : null
  return Boolean(m && m[1] === workspaceId && m[2] === participanteId)
}

/**
 * O `?v=` dos endereços da foto: muda a cada troca (é o nome do arquivo), e o
 * navegador pode guardar a imagem sem risco de mostrar a antiga.
 */
const versao = (caminho: string) => CAMINHO.exec(caminho)?.[3] ?? '0'

/** A foto do próprio voluntário, pela sessão da Área do Voluntário. */
export const urlDaFotoDoMembro = (caminho: string | null | undefined) => (caminho ? `/api/membro/foto?v=${versao(caminho)}` : null)

/** A foto na ficha da equipe, pela sessão do Palácio Virtual. */
export const urlDaFotoNaEquipe = (participanteId: string, caminho: string | null | undefined) =>
  (caminho ? `/api/voluntariado/${participanteId}/foto?v=${versao(caminho)}` : null)

/** O maior quadrado centrado na imagem: é o recorte do retrato. */
export function recorteQuadrado(largura: number, altura: number): { x: number; y: number; lado: number } {
  const lado = Math.min(largura, altura)
  return { x: Math.floor((largura - lado) / 2), y: Math.floor((altura - lado) / 2), lado }
}

/**
 * Largura e altura de um JPEG, lidas do marcador SOF. Null se não achar
 * (arquivo truncado ou que não é JPEG).
 */
export function medidasDoJpeg(b: Uint8Array): { largura: number; altura: number } | null {
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null
    const marcador = b[i + 1]
    // Preenchimento entre marcadores.
    if (marcador === 0xff) { i++; continue }
    const tamanho = (b[i + 2] << 8) | b[i + 3]
    // SOF0–SOF15, menos DHT (C4), JPG (C8) e DAC (CC).
    if (marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc) {
      return { altura: (b[i + 5] << 8) | b[i + 6], largura: (b[i + 7] << 8) | b[i + 8] }
    }
    // Início dos dados da imagem sem ter achado o SOF.
    if (marcador === 0xda) return null
    i += 2 + tamanho
  }
  return null
}

/**
 * Tira do JPEG os blocos que podem levar localização ou dados pessoais (APP1:
 * EXIF e XMP; APP13: IPTC), antes do início da imagem. O canvas do navegador
 * já não os escreve na maioria dos casos; isto é a garantia do servidor, sem
 * recusar a foto de um navegador que ponha um EXIF mínimo. O perfil de cor
 * (APP2) fica. Devolve null se o arquivo não tiver a estrutura de um JPEG.
 */
export function jpegSemMetadados(b: Uint8Array): Uint8Array | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  const partes: Uint8Array[] = [b.subarray(0, 2)]
  let i = 2
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null
    const marcador = b[i + 1]
    if (marcador === 0xff) { partes.push(b.subarray(i, i + 1)); i++; continue }
    // Início dos dados da imagem: daqui em diante vai como está.
    if (marcador === 0xda) { partes.push(b.subarray(i)); break }
    const fim = i + 2 + ((b[i + 2] << 8) | b[i + 3])
    if (fim > b.length) return null
    if (marcador !== 0xe1 && marcador !== 0xed) partes.push(b.subarray(i, fim))
    i = fim
  }
  if (i + 4 > b.length) return null
  const saida = new Uint8Array(partes.reduce((s, p) => s + p.length, 0))
  let pos = 0
  for (const p of partes) { saida.set(p, pos); pos += p.length }
  return saida
}

/**
 * Confere a foto que chegou ao servidor e a devolve limpa, ou a mensagem de
 * erro. Só aceita o que a tela gera: JPEG quadrado de até 512 px. Quem mandar
 * outra coisa (pulando a tela) recebe um "não".
 */
export function conferirFoto(b: Uint8Array): { bytes: Uint8Array } | { erro: string } {
  if (!b.length) return { erro: 'Selecione uma foto.' }
  if (b.length > LIMITE_DA_FOTO) return { erro: 'A foto chegou grande demais. Tente de novo pela tela do perfil.' }
  if (farejarTipo(b) !== 'jpeg') return { erro: 'A foto precisa chegar em JPEG. Tente de novo pela tela do perfil.' }
  const limpa = jpegSemMetadados(b)
  if (!limpa || jpegTemMetadados(limpa)) return { erro: 'Não foi possível ler esta foto. Tente de novo pela tela do perfil.' }
  const m = medidasDoJpeg(limpa)
  if (!m || m.largura !== m.altura || m.largura < 64 || m.largura > LADO_DA_FOTO) return { erro: 'A foto precisa ser quadrada, de até 512 pixels. Tente de novo pela tela do perfil.' }
  return { bytes: limpa }
}
