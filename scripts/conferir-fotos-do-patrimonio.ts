/**
 * Confere as regras das fotos do bem (lib/patrimonio/fotos.ts).
 * Rode com: npx tsx scripts/conferir-fotos-do-patrimonio.ts
 */
import sharp from 'sharp'
import {
  LADO_DA_FOTO_DO_BEM, caminhoDaFotoDoBem, conferirFotoDoBem, fotoDoBem, medidasNaSaida, ordenarFotos, urlDaFotoDoBem,
} from '../lib/patrimonio/fotos'

let falhas = 0
function confere(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}${ok ? '' : ` — obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`)
}

const WS = '7cbe994e-60db-42fa-b2da-db2429af4c45', BEM = 'b1b1b1b1-0000-4000-8000-000000000001', OUTRO = 'b1b1b1b1-0000-4000-8000-000000000002'
const ID = 'c2c2c2c2-0000-4000-8000-000000000003'

// Tamanho de saída: reduz o lado maior a 1600, mantém a proporção, não aumenta.
confere('foto de celular 4032×3024', medidasNaSaida(4032, 3024), { largura: 1600, altura: 1200 })
confere('foto em pé 3024×4032', medidasNaSaida(3024, 4032), { largura: 1200, altura: 1600 })
confere('foto pequena não aumenta', medidasNaSaida(800, 600), { largura: 800, altura: 600 })
confere('panorâmica 8000×1000', medidasNaSaida(8000, 1000), { largura: 1600, altura: 200 })

// Caminho e endereço.
const caminho = caminhoDaFotoDoBem(WS, BEM, ID)
confere('caminho', caminho, `patrimonio/${WS}/${BEM}/${ID}.jpg`)
confere('caminho é deste bem', fotoDoBem(caminho, WS, BEM), true)
confere('caminho não é de outro bem', fotoDoBem(caminho, WS, OUTRO), false)
confere('caminho de voluntário não passa', fotoDoBem(`voluntarios/${WS}/${BEM}/${ID}.jpg`, WS, BEM), false)
confere('caminho com ../ não passa', fotoDoBem(`patrimonio/${WS}/${BEM}/../${ID}.jpg`, WS, BEM), false)
confere('endereço com versão', urlDaFotoDoBem({ id: 'x1', path: caminho }), `/api/patrimonio/fotos/x1?v=${ID}`)

// Capa: menor ordem; no empate, a mais antiga.
confere('capa pela ordem', ordenarFotos([
  { id: 'a', ordem: 1, created_at: '2026-09-01' }, { id: 'b', ordem: -1, created_at: '2026-09-03' }, { id: 'c', ordem: 1, created_at: '2026-08-01' },
]).map((f) => f.id), ['b', 'c', 'a'])

async function arquivos() {
  // O que o servidor aceita: JPEG de 200 a 1600 px, sem EXIF.
  const jpeg = (l: number, a: number, exif = false) => {
    let img = sharp({ create: { width: l, height: a, channels: 3, background: { r: 200, g: 30, b: 30 } } }).jpeg({ quality: 80 })
    if (exif) img = img.withMetadata({ exif: { IFD0: { Copyright: 'teste' } } })
    return img.toBuffer().then((b) => new Uint8Array(b))
  }
  const aceita = (r: ReturnType<typeof conferirFotoDoBem>) => ('bytes' in r ? 'aceita' : r.erro)
  confere('1600×1200 aceita', aceita(conferirFotoDoBem(await jpeg(1600, 1200))), 'aceita')
  confere('1200×1600 aceita', aceita(conferirFotoDoBem(await jpeg(1200, 1600))), 'aceita')
  confere('1601 px recusa', aceita(conferirFotoDoBem(await jpeg(LADO_DA_FOTO_DO_BEM + 1, 900))).startsWith('A foto precisa ter'), true)
  confere('150 px recusa', aceita(conferirFotoDoBem(await jpeg(600, 150))).startsWith('A foto precisa ter'), true)
  const comExif = await jpeg(800, 600, true)
  const limpa = conferirFotoDoBem(comExif)
  confere('EXIF sai, a foto fica', 'bytes' in limpa && limpa.bytes.length < comExif.length, true)
  const png = new Uint8Array(await sharp({ create: { width: 400, height: 400, channels: 3, background: '#fff' } }).png().toBuffer())
  confere('PNG recusa', aceita(conferirFotoDoBem(png)), 'A foto precisa chegar em JPEG. Tente de novo pela tela do bem.')
  confere('vazio recusa', aceita(conferirFotoDoBem(new Uint8Array())), 'Selecione uma foto.')
}

arquivos().then(() => {
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.')
  process.exit(falhas ? 1 : 0)
})
