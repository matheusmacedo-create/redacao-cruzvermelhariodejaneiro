/**
 * Confere as partes puras dos vídeos da ajuda (docs/AJUDA.md §14), sem rede, navegador nem ffmpeg:
 *   npx tsx scripts/conferir-videos.ts
 *
 * - o corte da legenda em frases e em duas linhas (scripts/videos/montar.ts);
 * - a legenda WebVTT: tempos em ordem, sem sobrepor, e o texto inteiro da fala, sem perder nada;
 * - as legendas gravadas em public/tutoriais (cabeçalho e tempos);
 * - o tempo no botão e os endereços do vídeo, da capa e da legenda (lib/ajuda/videos.ts);
 * - cada roteiro (scripts/videos/roteiros.ts) aponta para uma tarefa que existe.
 * A ligação tarefa ↔ vídeo e o aviso de vídeo velho ficam em scripts/conferir-ajuda.ts.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { guiaDaArea } from '../lib/ajuda'
import { ENDERECO_DOS_VIDEOS, duracaoLegivel, todosOsVideos, videoDaAjuda } from '../lib/ajuda/videos'
import { legendaWebVtt, linhasDaLegenda, trechosDaLegenda } from './videos/montar'
import { ROTEIROS } from './videos/roteiros'

let falhas = 0
function confere(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}${ok ? '' : `\n  esperado: ${JSON.stringify(esperado)}\n  obtido:   ${JSON.stringify(obtido)}`}`)
}

const pedacos = (texto: string) => trechosDaLegenda(texto).map((t) => texto.slice(t.de, t.ate))
confere('legenda: uma frase por vez', pedacos('Abra Aprovações, no menu. A tela já abre no que espera o seu voto.'), ['Abra Aprovações, no menu.', 'A tela já abre no que espera o seu voto.'])
confere('legenda: dois-pontos também partem', pedacos('Logo abaixo, uma frase: o seu dia.'), ['Logo abaixo, uma frase:', 'o seu dia.'])
const longa = 'Em Antes de aprovar, confira, marque cada item que você conferiu antes de tocar no botão de decisão final da rodada.'
const partes = pedacos(longa)
confere('legenda: frase longa se parte em trechos de até 84 letras', partes.every((p) => p.length <= 84) && partes.length === 2, true)
confere('legenda: nada se perde no corte', partes.join(' '), longa)
confere('legenda: sem número decimal partido', pedacos('Versão 2.0 do site. Pronto.'), ['Versão 2.0 do site.', 'Pronto.'])
confere('duas linhas: curta fica numa', linhasDaLegenda('Toque em Aprovar.'), 'Toque em Aprovar.')
const duas = linhasDaLegenda('As que vencem nos próximos sete dias e o que espera a sua aprovação.').split('\n')
confere('duas linhas: longa se parte perto do meio', duas.length === 2 && Math.abs(duas[0].length - duas[1].length) <= 12, true)

const fala = (texto: string, duracao: number) => ({ fala: { texto, arquivo: 'x.mp3', duracao, letras: null }, inicio: 0 })
const vtt = legendaWebVtt([{ ...fala('Primeira frase. Segunda frase, um pouco maior.', 4), inicio: 0 }, { ...fala('Outra fala.', 1.5), inicio: 4.2 }])
const deixas = [...vtt.matchAll(/(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})\n([\s\S]*?)(?:\n\n|\n?$)/g)]
const seg = (t: string) => { const [h, m, s] = t.split(':'); return Number(h) * 3600 + Number(m) * 60 + Number(s) }
confere('WebVTT: cabeçalho', vtt.startsWith('WEBVTT\n\n'), true)
confere('WebVTT: três deixas', deixas.length, 3)
confere('WebVTT: tempos em ordem e sem sobrepor', deixas.every((d, i) => seg(d[1]) < seg(d[2]) && (i === 0 || seg(deixas[i - 1][2]) <= seg(d[1]))), true)
confere('WebVTT: o texto todo, na ordem', deixas.map((d) => d[3].replace(/\n/g, ' ')).join(' '), 'Primeira frase. Segunda frase, um pouco maior. Outra fala.')

const pasta = join(__dirname, '..', 'public', 'tutoriais')
for (const arquivo of readdirSync(pasta).filter((a) => a.endsWith('.vtt'))) {
  const texto = readFileSync(join(pasta, arquivo), 'utf8')
  const tempos = [...texto.matchAll(/(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})/g)].map((m) => [seg(m[1]), seg(m[2])])
  const emOrdem = tempos.every(([de, ate], i) => de < ate && (i === 0 || tempos[i - 1][1] <= de))
  confere(`public/tutoriais/${arquivo}: WebVTT com ${tempos.length} deixas em ordem`, texto.startsWith('WEBVTT') && tempos.length > 0 && emOrdem, true)
}

confere('tempo no botão', [45, 63, 69.8, 120, 154].map(duracaoLegivel), ['45 s', '1 min', '1 min 10 s', '2 min', '2 min 34 s'])
confere('vídeo inexistente', videoDaAjuda('nao-existe'), null)
for (const v of todosOsVideos()) {
  confere(`${v.id}: endereços`, [
    v.enderecoDoVideo === ENDERECO_DOS_VIDEOS + v.video,
    v.enderecoDaCapa === ENDERECO_DOS_VIDEOS + v.capa,
    /^\/tutoriais\/[a-z0-9-]+\.vtt\?v=[0-9a-f]{8}$/.test(v.enderecoDaLegenda),
  ], [true, true, true])
}
for (const r of ROTEIROS) {
  confere(`roteiro ${r.id}: a tarefa ${r.area}#${r.tarefa} existe`, Boolean(guiaDaArea(r.area)?.tarefas.some((t) => t.id === r.tarefa)), true)
}

console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.')
process.exit(falhas ? 1 : 0)
