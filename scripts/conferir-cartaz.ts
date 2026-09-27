/**
 * Confere as opções do cartaz do /enviar (lib/envios/cartaz.ts).
 *
 *   npx tsx scripts/conferir-cartaz.ts
 */
import { CHAMADAS, FORMATOS, lerOpcoes, nomeDoArquivo, paraAUrl } from '../lib/envios/cartaz'

let falhas = 0
const conferir = (nome: string, ok: boolean, detalhe?: unknown) => {
  if (!ok) { falhas++; console.log(`FALHA: ${nome}`, detalhe ?? '') } else console.log(`ok: ${nome}`)
}

const padrao = lerOpcoes({})
conferir('padrão: A4, clássico, "Fez uma ação?"', padrao.formato === 'a4' && padrao.modelo === 'classico' && padrao.chamada === 'acao' && padrao.acao === '', padrao)
conferir('valor desconhecido volta ao padrão', lerOpcoes({ formato: 'outdoor', modelo: '__proto__', chamada: 'toString' }).formato === 'a4' && lerOpcoes({ modelo: '__proto__' }).modelo === 'classico' && lerOpcoes({ chamada: 'toString' }).chamada === 'acao')
conferir('lê da URLSearchParams', lerOpcoes(new URLSearchParams('formato=story&modelo=destaque&chamada=hoje')).formato === 'story')
conferir('primeiro valor quando repetido', lerOpcoes({ formato: ['feed', 'story'] }).formato === 'feed')
const acao = lerOpcoes({ acao: '  Plantão\n de   Verão\u0007 · Copacabana ' }).acao
conferir('nome da ação limpo', acao === 'Plantão de Verão · Copacabana', acao)
conferir('nome da ação cortado em 60', lerOpcoes({ acao: 'x'.repeat(80) }).acao.length === 60)
conferir('URL sem o que é padrão', paraAUrl(padrao) === '' && paraAUrl({ ...padrao, formato: 'story', acao: 'Maré & Cia' }) === '?formato=story&acao=Mar%C3%A9+%26+Cia')
const ida = { formato: 'quadrado', modelo: 'faixa', chamada: 'voluntario', acao: 'Campanha do Agasalho' } as const
conferir('ida e volta pela URL', JSON.stringify(lerOpcoes(new URLSearchParams(paraAUrl(ida).slice(1)))) === JSON.stringify(ida))
conferir('nome do arquivo', nomeDoArquivo(ida) === 'cartaz-cvb-rj-quadrado-faixa.png')
conferir('A4 em 210 × 297 mm a 96 dpi', Math.round(FORMATOS.a4.largura / 96 * 25.4) === 210 && Math.round(FORMATOS.a4.altura / 96 * 25.4) === 297)
conferir('toda chamada cita a Cruz Vermelha Brasileira ou a Comunicação', Object.values(CHAMADAS).every((c) => /Cruz Vermelha Brasileira|Comunicação/.test(c.titulo.join(' ') + c.texto)))

console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo ok')
process.exit(falhas ? 1 : 0)
