/**
 * Confere a leitura da versão no ar (lib/versao.ts).
 *
 *   npx tsx scripts/conferir-versao.ts
 */
import { lerVersao, quandoFoiPublicada } from '../lib/versao'

let falhas = 0
const conferir = (nome: string, ok: boolean, detalhe?: unknown) => {
  if (!ok) { falhas++; console.log(`FALHA: ${nome}`, detalhe ?? '') } else console.log(`ok: ${nome}`)
}

const merge = lerVersao({ sha: '3bb0897aa11', mensagem: 'Merge pull request #272 from matheusmacedo-create/claude/supabase-project-connection\n\nChamados: fila por setor', publicadaEm: '2026-09-27T23:24:42Z' })
conferir('merge vira PR com o título', merge.pr === 272 && merge.titulo === 'Chamados: fila por setor' && merge.commit === '3bb0897', merge)
conferir('links do PR e do commit', merge.linkDoPr?.endsWith('/pull/272') === true && merge.linkDoCommit?.endsWith('/commit/3bb0897aa11') === true)
const direto = lerVersao({ sha: 'abc1234', mensagem: 'Corrige o login\n\nDetalhes' })
conferir('commit direto: primeira linha, sem PR', direto.pr === null && direto.titulo === 'Corrige o login' && direto.linkDoPr === null)
const semTitulo = lerVersao({ sha: 'abc1234', mensagem: 'Merge pull request #9 from a/b' })
conferir('merge sem título: sem título', semTitulo.pr === 9 && semTitulo.titulo === null)
const local = lerVersao({})
conferir('local: tudo nulo', local.commit === null && local.titulo === null && local.publicadaEm === null)
conferir('data inválida some', lerVersao({ publicadaEm: 'x' }).publicadaEm === null)
conferir('título longo é cortado', (lerVersao({ mensagem: 'a'.repeat(200) }).titulo ?? '').length === 120)

const agora = new Date('2026-09-27T23:30:00Z') // 20:30 em Brasília
conferir('hoje', quandoFoiPublicada('2026-09-27T23:24:42Z', agora) === 'hoje, 20:24', quandoFoiPublicada('2026-09-27T23:24:42Z', agora))
conferir('ontem', quandoFoiPublicada('2026-09-26T12:10:00Z', agora) === 'ontem, 09:10', quandoFoiPublicada('2026-09-26T12:10:00Z', agora))
conferir('antes', quandoFoiPublicada('2026-09-25T17:03:00Z', agora) === '25/09, 14:03', quandoFoiPublicada('2026-09-25T17:03:00Z', agora))
conferir('dia pelo horário de Brasília, não UTC', quandoFoiPublicada('2026-09-27T02:00:00Z', agora) === 'ontem, 23:00')

console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo ok')
process.exit(falhas ? 1 : 0)
