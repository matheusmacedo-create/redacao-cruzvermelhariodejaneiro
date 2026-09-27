/**
 * Confere o crachá virtual, o certificado e o diploma oficiais (docs/IDENTIDADE.md).
 * Rode com: npx tsx scripts/conferir-cracha.ts [pasta]
 * Com uma pasta, grava ali um crachá, um certificado e um diploma de exemplo em PDF.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { codigoDoCracha, faixaDoVinculo, fatorRhPorExtenso, lerCodigoDoCracha, mesAno, nomeDeDestaque } from '../lib/cracha/regras'
import { gerarPdfDoCracha } from '../lib/cracha/pdf'
import { gerarPdfDoCertificado } from '../lib/cursos/certificado-pdf'
import { gerarPdfDoDiploma, textoDoDiploma } from '../lib/cursos/diploma-pdf'
import { logoOficial } from '../lib/pdf/logo'

let falhas = 0
function igual<T>(obtido: T, esperado: T, caso: string) {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) { falhas++; console.log(`FALHOU: ${caso}\n  esperado ${JSON.stringify(esperado)}\n  obtido   ${JSON.stringify(obtido)}`) }
}

const id = '3f2b8c1e-9a4d-4e6f-8b21-7c5d0e9f1a23'
const segredo = 'segredo-de-teste'
const codigo = codigoDoCracha('voluntario', id, segredo)
igual(lerCodigoDoCracha(codigo, segredo), { origem: 'voluntario', id }, 'código lido de volta')
igual(lerCodigoDoCracha(codigo, 'outro-segredo'), null, 'segredo errado não abre')
igual(lerCodigoDoCracha(codigo.replace(/^v/, 'e'), segredo), null, 'trocar a origem invalida a assinatura')
igual(lerCodigoDoCracha(`${codigo.slice(0, -1)}${codigo.endsWith('A') ? 'B' : 'A'}`, segredo), null, 'assinatura adulterada')
igual(lerCodigoDoCracha('qualquer-coisa', segredo), null, 'lixo')
igual(/^[evc][A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{16}$/.test(codigo), true, 'formato do código (cabe no QR e na URL)')
igual(codigoDoCracha('equipe', id, segredo) === codigo, false, 'origem diferente, código diferente')

igual(nomeDeDestaque('Maria Eduarda da Silva Neves'), 'Maria Neves', 'primeiro e último nome, sem partícula')
igual(nomeDeDestaque('Ana'), 'Ana', 'nome só')
igual(nomeDeDestaque('João dos Santos'), 'João Santos', 'partícula no meio')
igual(nomeDeDestaque('Maria Clara Silva', 'Clara Silva'), 'Clara Silva', 'nome social manda')
igual(nomeDeDestaque('Bartholomeu Maximiliano Wanderley Albuquerque-Vasconcellos'), 'Bartholomeu', 'longo demais: só o primeiro')
igual(mesAno('2024-03-15'), '03/2024', 'mês/ano de data')
igual(mesAno('2025-11-02T13:00:00Z'), '11/2025', 'mês/ano de ISO')
igual(mesAno(null), null, 'sem data')
igual(fatorRhPorExtenso('A+'), 'A POSITIVO', 'A+')
igual(fatorRhPorExtenso('ab-'), 'AB NEGATIVO', 'ab-')
igual(fatorRhPorExtenso('O POSITIVO'), 'O POSITIVO', 'por extenso')
igual(fatorRhPorExtenso('não sei'), null, 'desconhecido')
igual(faixaDoVinculo('voluntario'), 'COLABORADOR VOLUNTÁRIO', 'faixa do voluntário (manual p. 28)')
igual(faixaDoVinculo('equipe'), 'COLABORADOR', 'faixa da equipe')
igual(textoDoDiploma({ motivo: 'horas', marcoHoras: 1000, texto: null }).startsWith('em reconhecimento às 1.000 horas'), true, 'diploma de horas')
igual(textoDoDiploma({ motivo: 'coordenacao', marcoHoras: null, texto: 'Pela dedicação nas enchentes de 2026.' }), 'em agradecimento aos relevantes serviços prestados à Cruz Vermelha Brasileira: pela dedicação nas enchentes de 2026.', 'diploma da coordenação')

async function exemplos(pasta: string) {
  const logo = await logoOficial()
  if (!logo) { falhas++; console.log('FALHOU: logo oficial não foi lida do disco') }
  writeFileSync(join(pasta, 'cracha-exemplo.pdf'), await gerarPdfDoCracha({
    origem: 'voluntario', nomeDeDestaque: 'Maria Neves', nomeCompleto: 'Maria Eduarda da Silva Neves', funcao: 'Socorrista', setor: 'Gestão de Riscos e Desastres',
    faixa: faixaDoVinculo('voluntario'), cpf: '***.456.789-**', desde: '03/2024', fatorRh: 'O POSITIVO', urlDeVerificacao: `https://palacio.cruzvermelhariodejaneiro.org/cracha/${codigo}`,
    foto: null, logo,
  }))
  writeFileSync(join(pasta, 'certificado-exemplo.pdf'), await gerarPdfDoCertificado({
    nome: 'Maria Eduarda da Silva Neves', curso: 'Primeiros Socorros para Voluntários', cargaHoraria: 20, nota: 92, emitidoEm: '2026-09-27T15:00:00Z',
    validoAte: '2028-09-27', codigo: 'ABCD-2345', urlDeVerificacao: 'https://palacio.cruzvermelhariodejaneiro.org/certificado/ABCD-2345', logo,
  }))
  writeFileSync(join(pasta, 'diploma-exemplo.pdf'), await gerarPdfDoDiploma({
    nome: 'Maria Eduarda da Silva Neves', motivo: 'horas', marcoHoras: 500, texto: null, emitidoEm: '2026-09-27T15:00:00Z',
    codigo: 'WXYZ-6789', urlDeVerificacao: 'https://palacio.cruzvermelhariodejaneiro.org/diploma/WXYZ-6789', logo,
  }))
  console.log(`Exemplos gravados em ${pasta}`)
}

const pasta = process.argv[2]
;(pasta ? exemplos(pasta) : Promise.resolve()).then(() => {
  console.log(falhas ? `${falhas} falha(s).` : 'Crachá, certificado e diploma: tudo certo.')
  if (falhas) process.exit(1)
})
