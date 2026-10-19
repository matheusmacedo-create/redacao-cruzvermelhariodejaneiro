/**
 * Confere a validação da importação de pacote: `npx tsx scripts/conferir-importar-pacote.ts`.
 * Módulo puro, sem banco: não grava nada.
 */
import { chaveDaImportacao, legendasDaImportacao, validarImportacao } from '../lib/publicacao/importar-pacote'
import { resumoDasMudancas, validarAtualizacao } from '../lib/publicacao/atualizar-pacote'
import { modoDoArquivo } from '../lib/publicacao/modo-da-importacao'

let falhas = 0
function confere(nome: string, ok: boolean, detalhe = '') {
  if (!ok) falhas++
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}${ok ? '' : ` — ${detalhe}`}`)
}

const base = {
  versao: 1, origem: 'livre', agendarPara: null,
  mestre: { titulo: 'Título', subtitulo: 'Linha fina', corpo: 'Texto.' },
  midias: [{ ref: 'a', arquivo: 'a.jpg', tipo: 'foto', legenda: 'Legenda', credito: '', posicao: 'inicio' }],
}
const como = (o: unknown) => JSON.stringify(o)
const campos = (o: unknown) => validarImportacao(como(o)).problemas.map((p) => p.campo)

const v = validarImportacao(como(base))
confere('arquivo válido passa', !!v.pacote && v.problemas.length === 0, como(v.problemas))
confere('slug vazio nasce do título', v.pacote?.mestre.slug === 'titulo', v.pacote?.mestre.slug)
confere('JSON quebrado', validarImportacao('{').problemas[0]?.campo === 'arquivo')
confere('versão errada', campos({ ...base, versao: 2 }).includes('versao'))
confere('origem diferente de livre', campos({ ...base, origem: 'pauta' }).includes('origem'))
confere('agendarPara preenchido', campos({ ...base, agendarPara: '2026-10-20T09:00' }).includes('agendarPara'))
confere('título acima de 120 não é cortado', campos({ ...base, mestre: { ...base.mestre, titulo: 'x'.repeat(121) } }).includes('mestre.titulo'))
confere('corpo acima de 20.000', campos({ ...base, mestre: { ...base.mestre, corpo: 'x'.repeat(20_001) } }).includes('mestre.corpo'))
confere('corpo obrigatório', campos({ ...base, mestre: { titulo: 'T' } }).includes('mestre.corpo'))
confere('slug com acento', campos({ ...base, mestre: { ...base.mestre, slug: 'ação' } }).includes('mestre.slug'))
confere('mais de 10 mídias', campos({ ...base, midias: Array.from({ length: 11 }, (_, i) => ({ ref: `r${i}`, arquivo: `${i}.jpg`, tipo: 'foto' })) }).includes('midias'))
confere('ref repetida', campos({ ...base, midias: [base.midias[0], base.midias[0]] }).includes('midias[1].ref'))
confere('legenda acima de 300', campos({ ...base, midias: [{ ...base.midias[0], legenda: 'x'.repeat(301) }] }).includes('midias[0].legenda'))
confere('posição inválida', campos({ ...base, midias: [{ ...base.midias[0], posicao: 'topo' }] }).includes('midias[0].posicao'))
confere('tipo inválido', campos({ ...base, midias: [{ ...base.midias[0], tipo: 'audio' }] }).includes('midias[0].tipo'))
confere('arquivo com pasta', campos({ ...base, midias: [{ ...base.midias[0], arquivo: 'fotos/a.jpg' }] }).includes('midias[0].arquivo'))
confere('sem mídias é válido', validarImportacao(como({ ...base, midias: undefined })).problemas.length === 0)

confere('chave estável entre quebras de linha', chaveDaImportacao('a\r\nb') === chaveDaImportacao('a\nb'))
confere('chave muda com o conteúdo', chaveDaImportacao('a') !== chaveDaImportacao('b'))

const l = legendasDaImportacao(v.pacote!.midias, { a: 'id-1' })
confere('legendas chaveadas pelo id do arquivo', l['id-1']?.legenda === 'Legenda' && l['id-1']?.posicao === 'inicio', como(l))

// ------------------------------------------------------------ modo "atualizar"
const atu = {
  versao: 1, modo: 'atualizar',
  mestre: { slug: 'acao-na-central', titulo: 'Título corrigido', subtitulo: 'Linha fina nova', corpo: 'Texto corrigido.', notas: '' },
}
const camposA = (o: unknown) => validarAtualizacao(como(o)).problemas.map((p) => p.campo)

confere('modo: sem modo = criar', modoDoArquivo(como(base)) === 'criar')
confere('modo: "atualizar"', modoDoArquivo(como(atu)) === 'atualizar')
confere('modo: JSON quebrado = criar', modoDoArquivo('{') === 'criar')
confere('modo inventado segue pela criação, que recusa', modoDoArquivo(como({ ...base, modo: 'apagar' })) === 'criar' && campos({ ...base, modo: 'apagar' }).includes('modo'))
confere('criação recusa arquivo de atualização', campos({ ...base, modo: 'atualizar' }).includes('modo'))
confere('criação aceita "modo": "criar"', validarImportacao(como({ ...base, modo: 'criar' })).problemas.length === 0)

const a = validarAtualizacao(como(atu))
confere('atualização válida passa', !!a.atualizacao && a.problemas.length === 0, como(a.problemas))
confere('atualização: slug é o do arquivo', a.atualizacao?.slug === 'acao-na-central')
confere('atualização: notas vazias presentes substituem', a.atualizacao?.notas === '')
confere('atualização: sem mídias = manter', a.atualizacao?.midias.length === 0)
confere('atualização: dispensa origem e agendarPara', !camposA(atu).some((c) => c === 'origem' || c === 'agendarPara'))
confere('atualização: ignora agendarPara preenchido', camposA({ ...atu, agendarPara: '2026-10-20T09:00' }).length === 0)
confere('atualização: ignora tituloInterno longo', camposA({ ...atu, tituloInterno: 'x'.repeat(500) }).length === 0)
confere('atualização: slug obrigatório', camposA({ ...atu, mestre: { ...atu.mestre, slug: '' } }).includes('mestre.slug'))
confere('atualização: slug ausente não nasce do título', camposA({ ...atu, mestre: { titulo: 'T', corpo: 'C' } }).includes('mestre.slug'))
confere('atualização: slug com acento', camposA({ ...atu, mestre: { ...atu.mestre, slug: 'ação' } }).includes('mestre.slug'))
confere('atualização: título acima de 120', camposA({ ...atu, mestre: { ...atu.mestre, titulo: 'x'.repeat(121) } }).includes('mestre.titulo'))
confere('atualização: corpo obrigatório', camposA({ ...atu, mestre: { ...atu.mestre, corpo: '' } }).includes('mestre.corpo'))
confere('atualização: versão errada', camposA({ ...atu, versao: 2 }).includes('versao'))
confere('atualização: mais de 10 mídias', camposA({ ...atu, midias: Array.from({ length: 11 }, (_, i) => ({ ref: `r${i}`, arquivo: `${i}.jpg`, tipo: 'foto' })) }).includes('midias'))
confere('atualização: legenda acima de 300', camposA({ ...atu, midias: [{ ...base.midias[0], legenda: 'x'.repeat(301) }] }).includes('midias[0].legenda'))
confere('atualização: JSON quebrado', validarAtualizacao('{').problemas[0]?.campo === 'arquivo')
confere('atualização: recusa arquivo sem modo', validarAtualizacao(como(base)).problemas[0]?.campo === 'modo')
const semOpcionais = validarAtualizacao(como({ ...atu, mestre: { slug: 'x', titulo: 'T', corpo: 'C' } }))
confere('atualização: subtítulo e notas ausentes = manter', !!semOpcionais.atualizacao && semOpcionais.atualizacao.subtitulo === undefined && semOpcionais.atualizacao.notas === undefined, como(semOpcionais))
const comFotos = validarAtualizacao(como({ ...atu, midias: base.midias }))
confere('atualização: com mídias = substituir', comFotos.atualizacao?.midias.length === 1)

const atual = { titulo: 'Título antigo', subtitulo: 'Linha fina nova', corpo: 'Texto.', notas: 'nota', fotos: 3 }
const r = resumoDasMudancas(atual, a.atualizacao!)
confere('resumo: título muda', r.some((l) => l.startsWith('Título:')), como(r))
confere('resumo: linha fina igual não aparece', !r.some((l) => l.startsWith('Linha fina')), como(r))
confere('resumo: notas apagadas avisadas', r.includes('Notas internas: serão apagadas.'), como(r))
confere('resumo: fotos mantidas', r.includes('Fotos e legendas: ficam como estão.'), como(r))
const rf = resumoDasMudancas(atual, comFotos.atualizacao!)
confere('resumo: fotos substituídas', rf.some((l) => l.startsWith('Fotos: as 3 atuais saem')), como(rf))

if (falhas) { console.log(`\n${falhas} falha(s).`); process.exit(1) }
console.log('\nTudo certo.')
