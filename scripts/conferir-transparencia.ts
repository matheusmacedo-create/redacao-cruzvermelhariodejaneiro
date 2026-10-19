/** Renderização local do portal; não consulta banco nem publica arquivos. Rode com tsx. */
import assert from 'node:assert/strict'
import { paginaDaTransparencia, type DocumentoNoPortal } from '../lib/transparencia/paginas'

const documento: DocumentoNoPortal = {
  id: 'teste', categoria: 'demonstracoes', titulo: 'Balanço <exemplo>', descricao: null, periodo: '2025',
  atual: { nome: 'balanco.pdf', tamanho: 1024, sha256: 'a'.repeat(64), url: '/transparencia/arquivos/balanco.pdf', publicadoEm: '2026-10-19T12:00:00Z', codigo: null },
  anteriores: [],
}

for (const documentos of [[], [documento]]) {
  const html = paginaDaTransparencia({ documentos, parcerias: [], agora: new Date('2026-10-19T12:00:00Z'), indexar: true })
  assert.match(html, /67\.733\.551\/0001-35/, 'identifica a empresa que vende os cursos')
  assert.match(html, /href="\/quem-somos\/#como-nos-financiamos"/, 'permite conferir o destino das receitas')
  assert.match(html, /href="\/pedido-de-documentos\/"/, 'oferece contato para documentos não publicados')
  assert.match(html, /não substituem a análise do conteúdo/, 'não apresenta a trilha como auditoria contábil')
  assert.doesNotMatch(html, /Nenhuma parceria em vigor/, 'ausência de cadastro não comprova ausência de parceria')
  if (documentos.length) {
    assert.match(html, /Não há parcerias publicadas neste portal/)
    assert.match(html, /Balanço &lt;exemplo&gt;/, 'títulos são escapados')
    assert.match(html, /href="\/transparencia\/arquivos\/balanco.pdf"/, 'mantém acesso ao documento')
  }
}
console.log('Portal: renderização com e sem documentos validada, sem banco ou publicação.')
