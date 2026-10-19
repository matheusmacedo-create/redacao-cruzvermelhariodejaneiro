/**
 * Confere a validação da importação de advertorial: `npx tsx scripts/conferir-importar-advertorial.ts`.
 * Módulo puro, sem banco: não grava nada.
 */
import { trocarLinksDoBotao, validarAdvertorial } from '../lib/escola/importar-advertorial'

let falhas = 0
function confere(nome: string, ok: boolean, detalhe = '') {
  if (!ok) falhas++
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}${ok ? '' : ` — ${detalhe}`}`)
}

const DESTINO = 'https://escola.cursoscruzvermelha.org/cursos/socorrista/'
const base = {
  versao: 1, origem: 'livre', agendarPara: null, tipo: 'advertorial',
  advertorial: { destinoUrl: DESTINO, angulo: 'Primeiro emprego' },
  mestre: { titulo: 'Título', subtitulo: 'Linha fina', slug: 'titulo-do-advertorial', corpo: `Texto.\n\n[Quero garantir minha vaga](${DESTINO})` },
  midias: [{ ref: 'capa', arquivo: 'capa.jpg', tipo: 'foto', legenda: 'Legenda', credito: '', posicao: 'inicio' }],
}
const como = (o: unknown) => JSON.stringify(o)
const campos = (o: unknown) => validarAdvertorial(como(o)).problemas.map((p) => p.campo)

const v = validarAdvertorial(como(base))
confere('arquivo válido passa', !!v.advertorial && v.problemas.length === 0, como(v.problemas))
confere('destino lido', v.advertorial?.advertorial.destinoUrl === DESTINO)
confere('tipo errado', campos({ ...base, tipo: 'materia' }).includes('tipo'))
confere('sem bloco advertorial', campos({ ...base, advertorial: undefined }).includes('advertorial'))
confere('destino sem https', campos({ ...base, advertorial: { destinoUrl: 'http://x.org' } }).includes('advertorial.destinoUrl'))
confere('ângulo acima de 60', campos({ ...base, advertorial: { destinoUrl: DESTINO, angulo: 'x'.repeat(61) } }).includes('advertorial.angulo'))
confere('campanha que não é uuid', campos({ ...base, advertorial: { destinoUrl: DESTINO, campanhaId: 'abc' } }).includes('advertorial.campanhaId'))
confere('slug obrigatório', campos({ ...base, mestre: { ...base.mestre, slug: '' } }).includes('mestre.slug'))
confere('regras da matéria valem (título > 120)', campos({ ...base, mestre: { ...base.mestre, titulo: 'x'.repeat(121) } }).includes('mestre.titulo'))

const BOTAO = 'https://palacio.exemplo.org/api/escola/ir/123'
const t1 = trocarLinksDoBotao(`a [Vaga](${DESTINO}) b [Outra](https://escola.cursoscruzvermelha.org/cursos/socorrista) c [Fonte](https://gov.br/x)`, DESTINO, BOTAO)
confere('troca o link do destino, com e sem barra no fim', t1.trocados === 2 && t1.corpo.split(BOTAO).length === 3, t1.corpo)
confere('não troca link de fonte', t1.corpo.includes('(https://gov.br/x)'))
const t2 = trocarLinksDoBotao('[Quero garantir minha vaga]({{botao}})', DESTINO, BOTAO)
confere('marcador {{botao}}', t2.trocados === 1 && t2.corpo === `[Quero garantir minha vaga](${BOTAO})`, t2.corpo)
confere('sem link nenhum: zero trocas', trocarLinksDoBotao('Só texto.', DESTINO, BOTAO).trocados === 0)

console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.')
process.exit(falhas ? 1 : 0)
