/**
 * Confere a validação da importação de pacote: `npx tsx scripts/conferir-importar-pacote.ts`.
 * Módulo puro, sem banco: não grava nada.
 */
import { chaveDaImportacao, legendasDaImportacao, validarImportacao } from '../lib/publicacao/importar-pacote'

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

if (falhas) { console.log(`\n${falhas} falha(s).`); process.exit(1) }
console.log('\nTudo certo.')
