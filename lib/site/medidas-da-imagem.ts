/**
 * Largura e altura de uma imagem a partir dos primeiros bytes do arquivo
 * (JPEG, PNG, GIF e WebP), sem decodificar a imagem.
 *
 * Serve ao índice de notícias: o og:image dele é a capa da matéria mais nova,
 * e o banco guarda só o endereço dela. Os primeiros KB do arquivo publicado
 * dizem as medidas — o JPEG que a Redação gera não tem metadados antes do
 * cabeçalho, e o PNG as traz nos primeiros 24 bytes.
 */
export function medidasDoCabecalho(b: Uint8Array): { largura: number; altura: number } | null {
  const u16be = (i: number) => (b[i] << 8) | b[i + 1]
  const u16le = (i: number) => b[i] | (b[i + 1] << 8)
  const u24le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)
  const u32be = (i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]
  const texto = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n))
  const valido = (largura: number, altura: number) => (largura > 0 && altura > 0 && largura < 65536 && altura < 65536 ? { largura, altura } : null)

  // PNG: assinatura e o IHDR logo em seguida.
  if (b.length >= 24 && b[0] === 0x89 && texto(1, 3) === 'PNG' && texto(12, 4) === 'IHDR') return valido(u32be(16), u32be(20))
  // GIF87a / GIF89a.
  if (b.length >= 10 && texto(0, 3) === 'GIF') return valido(u16le(6), u16le(8))
  // WebP: RIFF…WEBP e um dos três tipos de bloco.
  if (b.length >= 30 && texto(0, 4) === 'RIFF' && texto(8, 4) === 'WEBP') {
    const bloco = texto(12, 4)
    if (bloco === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return valido(u16le(26) & 0x3fff, u16le(28) & 0x3fff)
    if (bloco === 'VP8L' && b[20] === 0x2f) {
      const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0
      return valido((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1)
    }
    if (bloco === 'VP8X') return valido(u24le(24) + 1, u24le(27) + 1)
    return null
  }
  // JPEG: percorre os segmentos até o SOF (início do quadro), que traz as medidas.
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null
      const marcador = b[i + 1]
      if (marcador === 0xff) { i++; continue }
      if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) { i += 2; continue }
      const sof = marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc
      if (sof) return valido(u16be(i + 7), u16be(i + 5))
      if (marcador === 0xda || marcador === 0xd9) return null
      i += 2 + u16be(i + 2)
    }
  }
  return null
}
