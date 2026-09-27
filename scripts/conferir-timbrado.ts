/**
 * Confere o papel timbrado (lib/pdf/timbrado.ts) nos documentos da filial:
 * o ofício sai igual byte a byte em duas gerações, e cada documento traz o
 * decreto, o rodapé da filial e as fontes da identidade.
 *
 *   npx tsx scripts/conferir-timbrado.ts            # só confere
 *   npx tsx scripts/conferir-timbrado.ts <pasta>    # e grava os exemplos em PDF
 */
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { gerarPdfDoOficio } from '../lib/oficios/pdf'
import { reciboDeDoacao, termoDeEntrega } from '../lib/patrimonio/documentos'
import { ordemDeCompra } from '../lib/compras/ordem-pdf'
import { LINHAS_DO_DECRETO, linhasDoRodape, NOME_DA_FILIAL } from '../lib/pdf/timbrado-texto'

let falhas = 0
const conferir = (nome: string, ok: boolean, detalhe?: unknown) => {
  if (!ok) { falhas++; console.log(`FALHA: ${nome}`, detalhe ?? '') } else console.log(`ok: ${nome}`)
}
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const fontes = async (b: Uint8Array) => {
  const d = await PDFDocument.load(b)
  return [...new Set(d.context.enumerateIndirectObjects().map(([, o]) => String((o as { get?: (k: unknown) => unknown }).get?.(d.context.obj('BaseFont')) ?? '')).filter(Boolean))].sort()
}

const corpo = Array.from({ length: 14 }, (_v, i) => `Parágrafo ${i + 1}: a Cruz Vermelha Brasileira – Filial do Estado do Rio de Janeiro solicita a cessão do espaço para a campanha de vacinação, com atendimento gratuito à população, respeitando os Princípios Fundamentais de Humanidade, Imparcialidade e Neutralidade.`).join('\n\n')

async function main() {
  conferir('filial tirada do nome completo', NOME_DA_FILIAL === 'Filial do Estado do Rio de Janeiro', NOME_DA_FILIAL)
  conferir('decreto em três linhas', LINHAS_DO_DECRETO.join(' ') === 'Reconhecida como Utilidade Pública Internacional - Decreto nº 9.620, de 13/06/1912')
  conferir('rodapé com quatro linhas e o site', linhasDoRodape().length === 4 && linhasDoRodape()[3].includes('cruzvermelhariodejaneiro.org'))

  const dados = {
    doc: {
      emitente: 'CVB-RJ', numero: '12/2026', data: '2026-09-27', local: 'Rio de Janeiro', setor: 'Presidência',
      destinatario: { nome: 'Ilma. Sra. Maria da Silva', cargo: 'Diretora', orgao: 'Secretaria Municipal de Saúde', endereco: 'Rua Afonso Cavalcanti, 455\nCidade Nova, Rio de Janeiro/RJ' },
      vocativo: 'Senhora Diretora,', assunto: 'Cessão de espaço para campanha de vacinação', corpo, fecho: 'Atenciosamente,',
      assinantes: [
        { ordem: 1, nome: 'Luiz Carlos dos Santos', cpf: '***.456.789-**', cargo: 'Presidente', setor: 'Diretoria' },
        { ordem: 2, nome: 'Antonio Pedregal', cpf: null, cargo: 'Vice-Presidente', setor: 'Diretoria' },
      ],
    },
    hashDocumento: 'a'.repeat(64), codigoVerificacao: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', urlBase: 'https://palacio.cruzvermelhariodejaneiro.org',
    emitidoEm: '2026-09-27T15:00:00Z', modo: 'govbr' as const,
  }
  const um = await gerarPdfDoOficio(dados)
  const dois = await gerarPdfDoOficio(dados)
  conferir('ofício sai igual byte a byte em duas gerações', sha(um) === sha(dois))
  const nomes = await fontes(um)
  conferir('ofício com as fontes da identidade (nome fixo, sem sufixo sorteado)', nomes.some((n) => n.includes('LibreFranklin_400Regular')) && nomes.some((n) => n.includes('BarlowCondensed')) && !nomes.some((n) => /Times|Helvetica/.test(n)), nomes)
  conferir('ofício longo continua na página seguinte', (await PDFDocument.load(um)).getPageCount() >= 2)

  const recibo = await reciboDeDoacao({
    codigo: 'DOA-2026-0042', data: '2026-09-20', doador: 'Mercado Bom Preço Ltda.', documento: '12345678000190', campanha: 'Campanha do agasalho', observacao: null,
    recebidoPor: 'Elisabete Souza', geradoEm: '27/09/2026 15:00',
    itens: Array.from({ length: 40 }, (_v, i) => ({ descricao: `Cobertor casal ${i + 1}`, quantidade: 10, unidade: 'un', valor_unitario: 45.5, valor_total: 455 })),
  })
  conferir('recibo com as fontes da identidade', (await fontes(recibo)).some((n) => n.includes('LibreFranklin')))
  conferir('recibo de 40 itens em mais de uma página', (await PDFDocument.load(recibo)).getPageCount() >= 2)
  const termo = await termoDeEntrega({
    codigo: 'ENT-2026-0007', data: '2026-09-21', beneficiario: 'Associação de Moradores do Morro da Providência', tipo: 'instituição', documento: null, responsavel: 'José Pereira', pessoas: 120,
    municipio: 'Rio de Janeiro', bairro: 'Gamboa', campanha: 'Campanha do agasalho', observacao: null, entreguePor: 'Elisabete Souza', geradoEm: '27/09/2026 15:00',
    itens: [{ descricao: 'Cobertor casal', quantidade: 60, unidade: 'un' }, { descricao: 'Cesta básica', quantidade: 30, unidade: 'un' }],
  })
  const ordem = await ordemDeCompra({
    codigo: 'OC-2026-0003', pedido: 'PC-2026-0011', emitidaEm: '2026-09-22', geradoEm: '27/09/2026 15:00',
    comprador: { nome: 'Cruz Vermelha Brasileira — Filial do Estado do Rio de Janeiro', cnpj: '08560973000197', endereco: 'Praça da Cruz Vermelha, 10 — Centro' },
    fornecedor: { nome: 'Papelaria Centro Ltda.', documento: '11222333000144', email: 'vendas@papelaria.com', telefone: '(21) 3333-4444' },
    itens: [{ descricao: 'Papel A4', especificacao: '75 g/m², 500 folhas', quantidade: 10, unidade: 'resma', valor_unitario: 28.9 }],
    frete: 15, total: 304, prazoEntrega: '5 dias úteis', condicaoPagamento: 'Boleto 28 dias', localEntrega: 'Sede', necessarioAte: '2026-10-05',
    observacao: null, emitidaPor: 'Matheus Macedo', aprovadaPor: 'Luiz Carlos dos Santos',
  })

  const pasta = process.argv[2]
  if (pasta) {
    for (const [nome, b] of [['oficio', um], ['recibo', recibo], ['termo', termo], ['ordem', ordem]] as const) writeFileSync(join(pasta, `timbrado-${nome}.pdf`), b)
    console.log(`Exemplos gravados em ${pasta}`)
  }
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTimbrado: tudo certo.')
  process.exit(falhas ? 1 : 0)
}
main()
