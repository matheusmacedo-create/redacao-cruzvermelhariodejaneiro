/**
 * Confere qual espaço recebe as inscrições da newsletter (lib/newsletter/espaco.ts), sem rede nem banco:
 *   npx tsx scripts/conferir-newsletter-espaco.ts
 */
import { escolherEspacoDaNewsletter } from '../lib/newsletter/espaco'

let falhas = 0
function confere(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}${ok ? '' : `\n  esperado: ${JSON.stringify(esperado)}\n  obtido:   ${JSON.stringify(obtido)}`}`)
}

const temErro = (r: { id: string } | { erro: string }) => 'erro' in r

confere('só a Produção (hoje): ela', escolherEspacoDaNewsletter([{ id: 'p', kind: 'production' }]), { id: 'p' })
confere('Produção + Demonstração: a Produção', escolherEspacoDaNewsletter([{ id: 'p', kind: 'production' }, { id: 'd', kind: 'demo' }]), { id: 'p' })
confere('Demonstração criada antes da Produção: ainda a Produção', escolherEspacoDaNewsletter([{ id: 'd', kind: 'demo' }, { id: 'p', kind: 'production' }]), { id: 'p' })
confere('nenhum espaço: erro', temErro(escolherEspacoDaNewsletter([])), true)
confere('duas Produções: erro, nunca na sorte', temErro(escolherEspacoDaNewsletter([{ id: 'a', kind: 'production' }, { id: 'b', kind: 'production' }])), true)
confere('um espaço só, sem tipo (caso antigo): ele', escolherEspacoDaNewsletter([{ id: 'x', kind: null }]), { id: 'x' })
confere('dois espaços e nenhum de Produção: erro', temErro(escolherEspacoDaNewsletter([{ id: 'd', kind: 'demo' }, { id: 'x', kind: null }])), true)
confere('só a Demonstração: ela (um espaço só)', escolherEspacoDaNewsletter([{ id: 'd', kind: 'demo' }]), { id: 'd' })

console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.')
process.exit(falhas ? 1 : 0)
