/**
 * Confere as regras dos livros do Financeiro (lib/financeiro/livro.ts).
 * Rode com: npx tsx scripts/conferir-livros-do-financeiro.ts
 */
import { caminhoInterno, livroDaEmpresa, livroDoCaminho, noLivro } from '../lib/financeiro/livro'

let falhas = 0
function confere(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}${ok ? '' : ` — obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`)
}

// Qual livro cada endereço abre.
confere('/financeiro é a filial', livroDoCaminho('/financeiro'), 'filial')
confere('/financeiro/conciliacao é a filial', livroDoCaminho('/financeiro/conciliacao'), 'filial')
confere('/escola/financeiro é a Escola', livroDoCaminho('/escola/financeiro'), 'escola')
confere('/escola/financeiro/abc/editar é a Escola', livroDoCaminho('/escola/financeiro/abc/editar'), 'escola')
confere('/financeiros não é do Financeiro', livroDoCaminho('/financeiros'), null)
confere('/escola/financeiro-velho não é do Financeiro', livroDoCaminho('/escola/financeiro-velho'), null)
confere('/escola não é do Financeiro', livroDoCaminho('/escola'), null)
confere('/escola/vendas não é do Financeiro', livroDoCaminho('/escola/vendas'), null)

// O endereço interno (o que o proxy reescreve).
confere('interno da Escola', caminhoInterno('/escola/financeiro/fechamento'), '/financeiro/fechamento')
confere('interno da raiz da Escola', caminhoInterno('/escola/financeiro'), '/financeiro')
confere('interno da filial é ele mesmo', caminhoInterno('/financeiro/novo'), '/financeiro/novo')
confere('fora do Financeiro não muda', caminhoInterno('/escola/vendas'), '/escola/vendas')

// Os links levados ao livro certo.
confere('filial não muda', noLivro('filial', '/financeiro/novo?tipo=receita'), '/financeiro/novo?tipo=receita')
confere('Escola: raiz', noLivro('escola', '/financeiro'), '/escola/financeiro')
confere('Escola: com consulta', noLivro('escola', '/financeiro?aba=mes'), '/escola/financeiro?aba=mes')
confere('Escola: subpágina', noLivro('escola', '/financeiro/compras/123'), '/escola/financeiro/compras/123')
confere('Escola: âncora', noLivro('escola', '/financeiro#x'), '/escola/financeiro#x')
confere('Escola: link de fora passa igual', noLivro('escola', '/pautas'), '/pautas')
confere('Escola: /financeiros passa igual', noLivro('escola', '/financeiros'), '/financeiros')
confere('Escola: já na Escola não dobra', noLivro('escola', '/escola/financeiro/novo'), '/escola/financeiro/novo')

// A empresa decide o livro.
confere('empresa escola', livroDaEmpresa('escola'), 'escola')
confere('empresa filial', livroDaEmpresa('filial'), 'filial')
confere('empresa outra fica na filial', livroDaEmpresa('outra'), 'filial')

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.')
process.exit(falhas ? 1 : 0)
