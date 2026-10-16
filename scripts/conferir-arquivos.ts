/**
 * Confere as regras puras dos Arquivos do setor (lib/arquivos/regras.ts).
 * Rode com: npx tsx scripts/conferir-arquivos.ts
 *
 * - o id da pasta sai de todos os formatos de link do Drive e de nenhum outro site;
 * - o nome de pasta ou arquivo recusa vazio, longo e caractere de controle;
 * - a consulta escapa aspa e barra;
 * - caminhoAte só aceita item DENTRO da pasta do setor: de outro setor, na
 *   lixeira, em ciclo ou fundo demais é recusado — é a cerca de toda action;
 * - exportação, nome para baixar e Content-Disposition.
 */
import {
  caminhoAte, disposicao, idDaPastaNoLink, naConsulta, nomeParaBaixar, ordenarItens, PASTA, problemaDoNome, saidaPara, tamanhoLegivel, tipoDoItem,
} from '../lib/arquivos/regras'

const erros: string[] = []
const igual = (rotulo: string, obtido: unknown, esperado: unknown) => {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) erros.push(`${rotulo}: veio ${JSON.stringify(obtido)}, esperava ${JSON.stringify(esperado)}`)
}

// ---------------------------------------------------------------- links
const ID = '1iUktHGjMocQWMMEHIu7Q1dcllzY9j9Ea'
igual('link comum', idDaPastaNoLink(`https://drive.google.com/drive/folders/${ID}`), ID)
igual('link com usp', idDaPastaNoLink(`https://drive.google.com/drive/folders/${ID}?usp=sharing`), ID)
igual('link com conta', idDaPastaNoLink(`https://drive.google.com/drive/u/1/folders/${ID}`), ID)
igual('link antigo ?id=', idDaPastaNoLink(`https://drive.google.com/open?id=${ID}`), ID)
igual('id puro com espaço', idDaPastaNoLink(`  ${ID} `), ID)
igual('outro site', idDaPastaNoLink(`https://exemplo.com/drive/folders/${ID}`), null)
igual('domínio parecido', idDaPastaNoLink(`https://drive.google.com.exemplo.com/drive/folders/${ID}`), null)
igual('lixo', idDaPastaNoLink('pasta da secretaria'), null)
igual('link de arquivo do Docs sem pasta', idDaPastaNoLink('https://docs.google.com/document/d/abc/edit'), null)

// ---------------------------------------------------------------- nomes
igual('nome vazio', problemaDoNome('   '), 'Dê um nome.')
igual('nome ok', problemaDoNome('Relatórios 2026'), null)
igual('nome longo', problemaDoNome('a'.repeat(201)), 'O nome pode ter até 200 letras.')
igual('nome com controle', problemaDoNome('a\u0007b') !== null, true)
igual('nome ponto-ponto', problemaDoNome('..') !== null, true)

// ---------------------------------------------------------------- consulta
igual('aspa e barra', naConsulta("d'Ávila\\x"), "d\\'Ávila\\\\x")

// ---------------------------------------------------------------- tipos e saída
igual('pasta', tipoDoItem(PASTA), 'pasta')
igual('docs', tipoDoItem('application/vnd.google-apps.document'), 'documento')
igual('xlsx', tipoDoItem('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'planilha')
igual('jpeg', tipoDoItem('image/jpeg'), 'imagem')
igual('desconhecido', tipoDoItem('application/x-coisa'), 'outro')
igual('pdf baixa como arquivo', saidaPara('application/pdf', 'baixar'), { tipo: 'arquivo' })
igual('docs para ver', saidaPara('application/vnd.google-apps.document', 'ver'), { tipo: 'exportar', mime: 'application/pdf', extensao: 'pdf' })
igual('planilha para baixar', saidaPara('application/vnd.google-apps.spreadsheet', 'baixar').tipo === 'exportar' && (saidaPara('application/vnd.google-apps.spreadsheet', 'baixar') as { extensao: string }).extensao, 'xlsx')
igual('formulário não exporta', saidaPara('application/vnd.google-apps.form', 'baixar'), { tipo: 'nenhuma' })
igual('nome com extensão', nomeParaBaixar('Ata de 12/10', 'docx'), 'Ata de 12_10.docx')
igual('extensão já presente', nomeParaBaixar('planilha.xlsx', 'xlsx'), 'planilha.xlsx')
igual('disposição', disposicao('attachment', 'Ação.pdf'), `attachment; filename="Acao.pdf"; filename*=UTF-8''A%C3%A7%C3%A3o.pdf`)
igual('tamanho', tamanhoLegivel(1536), '1,5 KB')
igual('ordem: pastas primeiro, números naturais', ordenarItens([
  { nome: 'Foto 10', mime: 'image/jpeg' }, { nome: 'Foto 2', mime: 'image/jpeg' }, { nome: 'Zebra', mime: PASTA }, { nome: 'arquivo', mime: 'text/plain' },
]).map((i) => i.nome), ['Zebra', 'arquivo', 'Foto 2', 'Foto 10'])

// ---------------------------------------------------------------- a cerca: caminhoAte
type No = { id: string; nome: string; pais: string[]; naLixeira?: boolean }
const arvore: Record<string, No> = {
  raiz: { id: 'raiz', nome: 'Filial', pais: [] },
  setorA: { id: 'setorA', nome: 'Secretaria (renomeada no Google)', pais: ['raiz'] },
  setorB: { id: 'setorB', nome: 'Diretoria', pais: ['raiz'] },
  atas: { id: 'atas', nome: 'Atas', pais: ['setorA'] },
  ata: { id: 'ata', nome: 'Ata.pdf', pais: ['atas'] },
  segredo: { id: 'segredo', nome: 'Folha.xlsx', pais: ['setorB'] },
  lixo: { id: 'lixo', nome: 'Velho', pais: ['setorA'], naLixeira: true },
  dentroDoLixo: { id: 'dentroDoLixo', nome: 'x', pais: ['lixo'] },
  cicloA: { id: 'cicloA', nome: 'a', pais: ['cicloB'] },
  cicloB: { id: 'cicloB', nome: 'b', pais: ['cicloA'] },
  doisPais: { id: 'doisPais', nome: 'Compartilhado', pais: ['setorB', 'atas'] },
}
let fundo = 'setorA'
for (let n = 0; n < 40; n += 1) { arvore[`f${n}`] = { id: `f${n}`, nome: `f${n}`, pais: [fundo] }; fundo = `f${n}` }
const obter = async (id: string) => arvore[id] ?? null

async function cerca() {
  igual('a própria pasta do setor', (await caminhoAte('setorA', 'setorA', obter))?.map((d) => d.id), ['setorA'])
  igual('arquivo dentro', (await caminhoAte('ata', 'setorA', obter))?.map((d) => d.id), ['setorA', 'atas', 'ata'])
  igual('arquivo de outro setor', await caminhoAte('segredo', 'setorA', obter), null)
  igual('a raiz não é do setor', await caminhoAte('raiz', 'setorA', obter), null)
  igual('pasta irmã', await caminhoAte('setorB', 'setorA', obter), null)
  igual('na lixeira', await caminhoAte('lixo', 'setorA', obter), null)
  igual('dentro de pasta na lixeira', await caminhoAte('dentroDoLixo', 'setorA', obter), null)
  igual('id que não existe', await caminhoAte('naoExiste', 'setorA', obter), null)
  igual('ciclo não trava', await caminhoAte('cicloA', 'setorA', obter), null)
  igual('dois pais, um deles no setor', (await caminhoAte('doisPais', 'setorA', obter))?.map((d) => d.id), ['setorA', 'atas', 'doisPais'])
  igual('fundo demais é recusado', await caminhoAte('f39', 'setorA', obter), null)
  igual('fundo dentro do limite', (await caminhoAte('f20', 'setorA', obter))?.length, 22)
}

cerca().then(() => {
  if (erros.length) {
    console.error(`✖ ${erros.length} problema(s):\n${erros.map((e) => `  - ${e}`).join('\n')}`)
    process.exit(1)
  }
  console.log('✔ regras dos Arquivos do setor conferidas')
})
