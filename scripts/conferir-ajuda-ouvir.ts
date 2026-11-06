/**
 * Confere o "Ouvir" da ajuda (docs/AJUDA.md §12), sem rede nem banco:
 *   npx tsx scripts/conferir-ajuda-ouvir.ts
 *
 * - o texto falado de tarefa, pergunta, balão e área (pontuação, passos numerados, parágrafos emendados);
 * - o código do texto (24 dígitos hexadecimais, estável, diferente para textos diferentes);
 * - o conjunto dos textos que a rota aceita: nenhum acima do teto, nenhum vazio, e o tamanho total (o gasto máximo
 *   de voz da ajuda inteira, gravada uma vez);
 * - o índice pelo código acha cada texto e recusa um texto que não é da ajuda.
 */
import { codigoDoTexto, ehCodigoDoTexto, textoDaArea, textoDaPergunta, textoDaTarefa, textoDoPassoDoTour, TETO_DO_TEXTO_FALADO } from '../lib/ajuda/ouvir'
import { indiceDosTextos, textosQueSePodemOuvir } from '../lib/ajuda/ouvir-textos'

let falhas = 0
function confere(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}${ok ? '' : `\n  esperado: ${JSON.stringify(esperado)}\n  obtido:   ${JSON.stringify(obtido)}`}`)
}

async function main() {
  confere('tarefa: título, passos numerados e dica, com ponto final',
    textoDaTarefa({ id: 'x', titulo: 'Criar uma pauta', passos: ['Abra Pautas', 'Toque em "Nova pauta".'], dica: 'Dá para criar pelo ⌘K' }),
    'Criar uma pauta. Passo 1: Abra Pautas. Passo 2: Toque em "Nova pauta". Dica: Dá para criar pelo ⌘K.')
  confere('tarefa: o exemplo fica de fora',
    textoDaTarefa({ id: 'x', titulo: 'A', passos: ['B'], exemplo: 'Uma história longa' }).includes('história'), false)
  confere('pergunta: parágrafos emendados e espaços normalizados',
    textoDaPergunta({ id: 'p', pergunta: 'Quem vê?', resposta: 'Todos   veem.\n\nSó admin apaga' }), 'Quem vê? Todos veem. Só admin apaga.')
  confere('balão do tour', textoDoPassoDoTour({ titulo: 'O menu', texto: 'Fica à esquerda' }), 'O menu. Fica à esquerda.')
  confere('área com "quem usa"', textoDaArea('Serve para X.', 'Todos'), 'Serve para X. Quem usa: Todos.')
  confere('área sem "quem usa"', textoDaArea('Serve para X', null), 'Serve para X.')

  const c1 = await codigoDoTexto('Olá')
  confere('código: 24 dígitos hexadecimais', ehCodigoDoTexto(c1), true)
  confere('código: estável', await codigoDoTexto('Olá'), c1)
  confere('código: muda com o texto', (await codigoDoTexto('Olá.')) !== c1, true)
  confere('código inválido recusado', [ehCodigoDoTexto('xyz'), ehCodigoDoTexto(c1.toUpperCase()), ehCodigoDoTexto(null)], [false, false, false])

  const textos = textosQueSePodemOuvir()
  const total = textos.reduce((s, t) => s + t.length, 0)
  const maior = textos.reduce((m, t) => (t.length > m.length ? t : m), '')
  confere('nenhum texto vazio', textos.filter((t) => !t.trim()).length, 0)
  confere(`nenhum texto acima do teto (${TETO_DO_TEXTO_FALADO})`, textos.filter((t) => t.length > TETO_DO_TEXTO_FALADO).length, 0)
  console.log(`     ${textos.length} textos, ${total.toLocaleString('pt-BR')} caracteres no total; o maior tem ${maior.length} ("${maior.slice(0, 60)}…")`)

  const indice = await indiceDosTextos()
  confere('índice: um código por texto (sem colisão)', indice.size, textos.length)
  confere('índice: acha o texto pelo código', indice.get(await codigoDoTexto(textos[0])), textos[0])
  confere('índice: acha o último também', indice.get(await codigoDoTexto(textos[textos.length - 1])), textos[textos.length - 1])
  confere('índice: recusa texto que não é da ajuda', indice.get(await codigoDoTexto('Leia este texto qualquer em voz alta')) ?? null, null)

  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.')
  process.exit(falhas ? 1 : 0)
}

main()
