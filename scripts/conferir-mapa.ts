/**
 * Confere o modelo puro do mapa do ecossistema (lib/mapa/modelo.ts).
 * Rode com: npx tsx scripts/conferir-mapa.ts
 *
 * - a árvore se monta a partir de linhas no formato do banco;
 * - as contagens, o progresso e as pendências abertas/feitas batem;
 * - item sem pai conhecido vai para `orfaos`, pendência sem item cai no sistema;
 * - a semente em supabase/migrations tem ids únicos e todo `parent_id`/`item_id` existe.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ESTADOS, SITUACAO_DO_ESTADO, caminho, filaDeProximos, montarArvore, percentualNoAr, slugDoMapa, type ItemDoMapa, type PendenciaDoMapa } from '../lib/mapa/modelo'

let falhas = 0
const ok = (cond: boolean, msg: string) => { if (!cond) { falhas++; console.error('✗', msg) } else console.log('✓', msg) }

const item = (id: string, tipo: ItemDoMapa['tipo'], parent: string | null, estado: ItemDoMapa['estado'] = null, extra: Partial<ItemDoMapa> = {}): ItemDoMapa => ({
  id, parent_id: parent, tipo, sistema: 'palacio', nome: id, descricao: '', estado, estado_detalhe: '', url: null, entregas: [], ordem: 0, ...extra,
})
const pend = (id: string, item_id: string | null, situacao: PendenciaDoMapa['situacao'] = 'pendente', ordem_fila: number | null = null): PendenciaDoMapa => ({
  id, item_id, sistema: 'palacio', titulo: id, detalhe: '', tipo: 'codigo', quem: '', esforco: '', prioridade: 'agora', area: '', por_que: '', bloqueia: '', primeiro_passo: '', fonte: '', o_que_falta: '', situacao, ordem_fila, resolvida_em: null, nota: '',
})

const itens = [
  item('palacio', 'sistema', null),
  item('palacio.pessoas', 'categoria', 'palacio'),
  item('palacio.pessoas.a', 'item', 'palacio.pessoas', 'no ar', { entregas: [{ data: '2026-09-28', titulo: 'x' }, { data: '2026-10-01', titulo: 'y' }] }),
  item('palacio.pessoas.b', 'item', 'palacio.pessoas', 'feito, falta publicar ou configurar'),
  item('palacio.pessoas.c', 'item', 'palacio.pessoas', 'proposta (só documento)'),
  item('palacio.perdido', 'item', 'palacio.nao-existe', 'no ar'),
]
const pendencias = [pend('R-01', 'palacio.pessoas.b', 'pendente', 2), pend('R-02', 'palacio.pessoas.b', 'feito', 1), pend('R-03', null, 'parcial', 3), pend('R-04', 'palacio.pessoas.a', 'pendente', null)]
const { raiz, porId, orfaos } = montarArvore(itens, pendencias)

ok(raiz.children.length === 1 && raiz.children[0].id === 'palacio', 'o sistema pendura na raiz')
ok(orfaos.length === 1 && orfaos[0] === 'palacio.perdido', 'item com pai desconhecido vai para orfaos')
const pessoas = porId.get('palacio.pessoas')!
ok(pessoas.total === 3 && pessoas.counts.live === 1 && pessoas.counts.pending === 1 && pessoas.counts.idea === 1, 'contagens por estado na categoria')
ok(percentualNoAr(pessoas) === 33, 'percentual no ar arredonda (1 de 3 = 33)')
ok(pessoas.pend === 2 && pessoas.feitas === 1, 'pendências abertas e feitas somam pela árvore (R-01, R-04 abertas; R-02 feita)')
ok(porId.get('palacio')!.pend === 3, 'pendência sem item cai no sistema e conta como aberta (R-03)')
ok(porId.get('palacio')!.pendencias.some((p) => p.id === 'R-03'), 'a pendência sem item fica listada no nó do sistema')
ok(raiz.updatedAt === '2026-10-01', 'a última entrega sobe até a raiz')
ok(caminho(porId.get('palacio.pessoas.b')!, porId).map((n) => n.id).join('>') === 'inicio>palacio>palacio.pessoas>palacio.pessoas.b', 'caminho da raiz ao item')
ok(filaDeProximos(pendencias).map((p) => p.id).join(',') === 'R-01,R-03', 'a fila ignora feitas e sem posição, em ordem')
ok(slugDoMapa('Núcleo de Voluntários — RJ') === 'nucleo-de-voluntarios-rj', 'slug sem acento nem símbolo')
ok(ESTADOS.every((e) => SITUACAO_DO_ESTADO[e]), 'todo estado tem situação técnica')

// A semente: ids únicos, pais e itens referenciados existem.
const dir = join(__dirname, '..', 'supabase', 'migrations')
const semente = readdirSync(dir).find((f) => f.includes('mapa_do_ecossistema_semente'))
if (semente) {
  const sql = readFileSync(join(dir, semente), 'utf8')
  const ids = [...sql.matchAll(/^\s*\('([a-z0-9.-]+)',\s*(?:'([a-z0-9.-]+)'|null),\s*'(sistema|categoria|item)'/gm)].map((m) => ({ id: m[1], parent: m[2] ?? null, tipo: m[3] }))
  const set = new Set(ids.map((i) => i.id))
  ok(ids.length > 0 && set.size === ids.length, `semente: ${ids.length} itens com ids únicos`)
  const semPai = ids.filter((i) => i.tipo !== 'sistema' && (!i.parent || !set.has(i.parent)))
  ok(semPai.length === 0, `semente: todo item e categoria aponta para um pai existente${semPai.length ? ' (faltam: ' + semPai.map((i) => i.id).join(', ') + ')' : ''}`)
  const refs = [...sql.matchAll(/^\s*\('([A-Z]{1,3}-\d{1,4})',\s*(?:'([a-z0-9.-]+)'|null)/gm)].map((m) => ({ id: m[1], item: m[2] ?? null }))
  const refSet = new Set(refs.map((r) => r.id))
  ok(refs.length > 0 && refSet.size === refs.length, `semente: ${refs.length} pendências com ids únicos`)
  const soltas = refs.filter((r) => r.item && !set.has(r.item))
  ok(soltas.length === 0, `semente: toda pendência ligada aponta para um item existente${soltas.length ? ' (' + soltas.map((r) => r.id).join(', ') + ')' : ''}`)
} else console.log('· semente não encontrada em supabase/migrations; pulando a conferência dela')

if (falhas) { console.error(`\n${falhas} falha(s).`); process.exit(1) }
console.log('\nTudo certo.')
