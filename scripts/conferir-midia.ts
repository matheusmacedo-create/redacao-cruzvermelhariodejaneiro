/**
 * Confere as regras de mídia da Biblioteca (lib/midia/regras.ts) contra
 * arquivos de verdade gerados com o sharp: `npx tsx scripts/conferir-midia.ts`.
 *
 * - o tipo é reconhecido pelo conteúdo (JPEG, PNG, GIF, WebP, HEIC, AVIF, MOV, MP4);
 * - JPEG com EXIF/GPS é detectado; sem, não;
 * - PNG com e sem alfa, APNG; WebP com alfa e animado;
 * - redução sem aumentar, medidas pares para vídeo;
 * - quando converter um vídeo, e o texto da economia.
 *
 * Sai com código 1 se algo estiver errado.
 */
import sharp from 'sharp'
import {
  FOTO, VIDEO, caber, decidirVideo, farejarTipo, jpegTemExif, pngInfo, tamanhoLegivel, textoDaEconomia, trocarExtensao, webpInfo,
} from '../lib/midia/regras'

let falhas = 0
function ok(nome: string, condicao: boolean, detalhe?: unknown) {
  if (condicao) console.log(`✓ ${nome}`)
  else { falhas++; console.log(`✗ ${nome}`, detalhe ?? '') }
}

const cor = (alfa = 1) => ({ create: { width: 64, height: 48, channels: 4 as const, background: { r: 200, g: 20, b: 20, alpha: alfa } } })
const bytes = (b: Buffer) => new Uint8Array(b)
const ftyp = (marca: string) => {
  const b = Buffer.alloc(32)
  b.writeUInt32BE(32, 0); b.write('ftyp', 4, 'ascii'); b.write(marca, 8, 'ascii'); b.write('mif1heic', 16, 'ascii')
  return bytes(b)
}

async function main() {
  const jpegComGps = await sharp(cor()).jpeg().withExif({ IFD0: { Make: 'Teste', Orientation: '6' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '22/1 54/1 0/1' } }).toBuffer()
  const jpegLimpo = await sharp(cor()).jpeg().toBuffer()
  const pngOpaco = await sharp(cor()).removeAlpha().png().toBuffer()
  const pngAlfa = await sharp(cor(0.5)).png().toBuffer()
  const webpAlfa = await sharp(cor(0.5)).webp({ lossless: true }).toBuffer()
  // Cabeçalho VP8X com a flag de animação (bit 1): o sharp daqui não gera WebP animado.
  const webpAnimado = Buffer.alloc(32)
  webpAnimado.write('RIFF', 0, 'ascii'); webpAnimado.writeUInt32LE(24, 4); webpAnimado.write('WEBPVP8X', 8, 'ascii'); webpAnimado.writeUInt32LE(10, 16); webpAnimado[20] = 0x02
  const gif = await sharp(cor()).gif().toBuffer()

  ok('JPEG reconhecido', farejarTipo(bytes(jpegLimpo)) === 'jpeg')
  ok('PNG reconhecido', farejarTipo(bytes(pngAlfa)) === 'png')
  ok('GIF reconhecido', farejarTipo(bytes(gif)) === 'gif')
  ok('WebP reconhecido', farejarTipo(bytes(webpAlfa)) === 'webp')
  ok('HEIC reconhecido', farejarTipo(ftyp('heic')) === 'heic' && farejarTipo(ftyp('mif1')) === 'heic')
  ok('AVIF reconhecido', farejarTipo(ftyp('avif')) === 'avif')
  ok('MOV e MP4 reconhecidos', farejarTipo(ftyp('qt  ')) === 'mov' && farejarTipo(ftyp('isom')) === 'mp4' && farejarTipo(ftyp('mp42')) === 'mp4')
  ok('lixo e arquivo curto', farejarTipo(new Uint8Array([1, 2, 3])) === 'outro' && farejarTipo(bytes(Buffer.from('%PDF-1.7 teste...'))) === 'outro')

  ok('JPEG com EXIF/GPS detectado', jpegTemExif(bytes(jpegComGps)))
  ok('JPEG sem EXIF', !jpegTemExif(bytes(jpegLimpo)))

  ok('PNG opaco sem alfa', !pngInfo(bytes(pngOpaco)).podeTerAlfa)
  ok('PNG RGBA pode ter alfa', pngInfo(bytes(pngAlfa)).podeTerAlfa && !pngInfo(bytes(pngAlfa)).animado)
  ok('WebP com alfa', webpInfo(bytes(webpAlfa)).podeTerAlfa)
  ok('WebP animado', webpInfo(bytes(webpAnimado)).animado, webpInfo(bytes(webpAnimado)))
  ok('WebP simples não é animado', !webpInfo(bytes(await sharp(cor()).webp().toBuffer())).animado)
  // APNG: o bloco acTL antes do primeiro IDAT.
  const apng = Buffer.concat([pngOpaco.subarray(0, 33), Buffer.from([0, 0, 0, 8]), Buffer.from('acTL'), Buffer.alloc(12), pngOpaco.subarray(33)])
  ok('APNG detectado', pngInfo(bytes(apng)).animado && !pngInfo(bytes(pngOpaco)).animado)

  ok('caber reduz 4032×3024 → 2048×1536', JSON.stringify(caber(4032, 3024, 2048)) === JSON.stringify({ largura: 2048, altura: 1536, reduziu: true }))
  ok('caber não aumenta', JSON.stringify(caber(800, 600, 2048)) === JSON.stringify({ largura: 800, altura: 600, reduziu: false }))
  ok('caber retrato', caber(3024, 4032, 2048).altura === 2048 && caber(3024, 4032, 2048).largura === 1536)
  const par = caber(3841, 2161, 1920, true)
  ok('vídeo: medidas pares', par.largura % 2 === 0 && par.altura % 2 === 0 && par.largura === 1920, par)
  ok('vídeo: pequeno ímpar vira par', caber(641, 361, 1920, true).largura === 642)

  ok('trocar extensão', trocarExtensao('IMG_2043.HEIC', '.jpg') === 'IMG_2043.jpg' && trocarExtensao('arte', '.jpg') === 'arte.jpg' && trocarExtensao('a.b.png', '.jpg') === 'a.b.jpg')
  ok('trocar extensão sem base', trocarExtensao('.png', '.jpg') === 'arquivo.jpg')

  const iphone4k = decidirVideo({ largura: 2160, altura: 3840, codec: 'hevc', fps: 60, bitrate: 45e6 })
  ok('4K HEVC 60fps do iPhone converte', iphone4k.converter && iphone4k.altura === 1920 && iphone4k.largura === 1080 && iphone4k.fps === 30, iphone4k)
  const jaBom = decidirVideo({ largura: 1080, altura: 1920, codec: 'avc', fps: 30, bitrate: 4e6 })
  ok('1080p H.264 30fps não converte', !jaBom.converter && jaBom.fps === null, jaBom)
  ok('29,97 fps não conta como alto', !decidirVideo({ largura: 1280, altura: 720, codec: 'avc', fps: 29.97, bitrate: 3e6 }).converter)
  ok('bitrate alto converte', decidirVideo({ largura: 1920, altura: 1080, codec: 'avc', fps: 30, bitrate: VIDEO.bitrate * 2 }).converter)

  ok('tamanho legível', tamanhoLegivel(12_400_000) === '11,8 MB' && tamanhoLegivel(900) === '900 B' && tamanhoLegivel(500_000) === '488 KB')
  ok('economia', textoDaEconomia(12_400_000, 1_150_000) === '11,8 MB → 1,1 MB (−91%)', textoDaEconomia(12_400_000, 1_150_000))
  ok('sem economia, sem texto', textoDaEconomia(1000, 990) === null && textoDaEconomia(0, 0) === null)
  ok('perfis coerentes', FOTO.padrao.lado < FOTO.alta.lado && FOTO.padrao.qualidade < FOTO.alta.qualidade)

  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo')
  process.exit(falhas ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
