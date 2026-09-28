// Conferência dos cartazes com QR do Voluntariado (lib/voluntariado/cartaz.ts,
// sobre lib/cartaz/copy.ts) e da copy deles (lib/voluntariado/cartaz-copy.ts).
// Rode com: npx tsx scripts/conferir-cartaz-do-voluntariado.ts
import { chamadaFinal, lerOpcoes, MAXIMO_DO_TEXTO, MAXIMO_DO_TITULO, type Chamada } from '../lib/cartaz/copy'
import { ALVOS, chamadasDoVoluntariado, CHAVE_PADRAO, ehAlvo, linkDoCartaz, PARAMETRO_DO_ALVO, type AlvoDoVoluntariado } from '../lib/voluntariado/cartaz'
import { COPY_DO_VOLUNTARIADO } from '../lib/voluntariado/cartaz-copy'

let falhas = 0
const igual = (obtido: unknown, esperado: unknown, nome: string) => {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) { falhas++; console.error(`FALHOU: ${nome}\n  esperado: ${JSON.stringify(esperado)}\n  obtido:   ${JSON.stringify(obtido)}`) }
}
const verdade = (ok: boolean, nome: string) => { if (!ok) { falhas++; console.error(`FALHOU: ${nome}`) } }

// ---------------------------------------------------------------- os alvos e para onde o QR leva
igual(Object.keys(ALVOS), ['inscricao', 'area'], 'dois alvos, a inscrição primeiro')
igual([ehAlvo('inscricao'), ehAlvo('area'), ehAlvo('todos'), ehAlvo(''), ehAlvo(undefined), ehAlvo('__proto__')], [true, true, false, false, false, false], 'ehAlvo só aceita os dois')
igual(linkDoCartaz('https://palacio.exemplo.org/', 'inscricao'), 'https://palacio.exemplo.org/participe', 'inscrição: o formulário público')
igual(linkDoCartaz('https://palacio.exemplo.org', 'area'), 'https://palacio.exemplo.org/membro', 'área: a entrada da Área do Voluntário')
for (const [k, a] of Object.entries(ALVOS)) {
  verdade(a.passos.length === 3, `${k}: três passos`)
  verdade(a.passos[0].startsWith('Aponte a câmera'), `${k}: o primeiro passo é ler o QR`)
  verdade(a.rodape.length > 20 && a.rodape.length <= 160, `${k}: rodapé com tamanho de rodapé`)
}

// ---------------------------------------------------------------- as opções da URL
const opcoes = lerOpcoes({ [PARAMETRO_DO_ALVO]: 'area', chamada: 'suas-horas' }, PARAMETRO_DO_ALVO, CHAVE_PADRAO)
igual(opcoes.alvo, 'area', 'o alvo vem do parâmetro')
igual(lerOpcoes({}, PARAMETRO_DO_ALVO, CHAVE_PADRAO).chamada, CHAVE_PADRAO, 'sem chamada, a de sempre')

// ---------------------------------------------------------------- a lista e a escolha
for (const alvo of Object.keys(ALVOS) as AlvoDoVoluntariado[]) {
  const lista = chamadasDoVoluntariado(alvo, COPY_DO_VOLUNTARIADO)
  igual(lista[0]?.chave, CHAVE_PADRAO, `${alvo}: a primeira é a de sempre`)
  verdade(lista.length >= 4, `${alvo}: pelo menos quatro chamadas`)
  igual(lista.map((c) => c.chave), Object.keys(COPY_DO_VOLUNTARIADO[alvo]), `${alvo}: a lista segue a ordem da copy`)
  igual(chamadaFinal({ alvo, chamada: 'nao-existe', titulo: '', texto: '' }, lista).chave, CHAVE_PADRAO, `${alvo}: chave desconhecida cai na de sempre`)
}
igual(chamadaFinal(opcoes, chamadasDoVoluntariado('area', COPY_DO_VOLUNTARIADO)).titulo, ['Suas horas', 'já estão lá.'], 'a chamada escolhida pela URL')
igual(chamadaFinal({ alvo: 'area', chamada: CHAVE_PADRAO, titulo: 'Bem-vindo | de volta.', texto: 'Entre com o e-mail.' }, chamadasDoVoluntariado('area', COPY_DO_VOLUNTARIADO)).titulo, ['Bem-vindo', 'de volta.'], 'título livre com | divide as duas linhas')

// ---------------------------------------------------------------- as regras da copy
// O de inscrição fala com quem não é voluntário: não pode supor login nem área. O da área fala com quem já é.
const SO_DA_AREA = /área do voluntário|certificad|suas horas|plantõ|avisos da coordenação/i
function conferirChamada(alvo: string, chave: string, c: Chamada) {
  const onde = `${alvo}/${chave}`
  verdade(/^[a-z0-9-]{1,40}$/.test(chave), `${onde}: chave é slug`)
  const inteiro = [c.titulo[0], c.titulo[1], c.texto].join(' ')
  verdade(!/\{[a-z]+\}/.test(inteiro), `${onde}: sem marcadores (nada aqui depende de cadastro)`)
  verdade((inteiro.match(/!/g) ?? []).length <= 1, `${onde}: no máximo uma exclamação`)
  verdade(c.rotulo.length > 0 && c.rotulo.length <= 48, `${onde}: rótulo curto`)
  verdade(c.titulo[0].length > 0 && c.titulo[1].length > 0, `${onde}: as duas linhas do título`)
  verdade(`${c.titulo[0]} ${c.titulo[1]}`.length <= MAXIMO_DO_TITULO, `${onde}: título até ${MAXIMO_DO_TITULO} (${`${c.titulo[0]} ${c.titulo[1]}`.length})`)
  verdade(/[.?!]$/.test(c.titulo[1]), `${onde}: a segunda linha fecha a frase`)
  verdade(c.texto.length >= 20 && c.texto.length <= MAXIMO_DO_TEXTO, `${onde}: texto entre 20 e ${MAXIMO_DO_TEXTO} (${c.texto.length})`)
  verdade(!/R\$|\d{1,2}\/\d{1,2}|\d+ ?h\b/.test(inteiro), `${onde}: sem valor, data nem carga horária`)
  verdade(!/remunera|salári|bolsa/i.test(inteiro) || /sem remuneração/i.test(inteiro), `${onde}: voluntariado não promete remuneração`)
  if (alvo === 'inscricao') verdade(!SO_DA_AREA.test(inteiro), `${onde}: o cartaz de inscrição não fala da área nem de horas`)
}
for (const [alvo, copy] of Object.entries(COPY_DO_VOLUNTARIADO)) {
  const chaves = Object.keys(copy)
  igual(chaves[0], CHAVE_PADRAO, `${alvo}: a primeira chave é "${CHAVE_PADRAO}"`)
  igual(new Set(chaves).size, chaves.length, `${alvo}: chaves únicas`)
  for (const [chave, c] of Object.entries(copy)) conferirChamada(alvo, chave, c)
}
const inscricao = COPY_DO_VOLUNTARIADO.inscricao
verdade(Object.values(inscricao).some((c) => /voluntári/i.test(`${c.titulo[0]} ${c.titulo[1]}`)), 'inscrição: pelo menos um título diz "voluntário"')
verdade(Object.values(COPY_DO_VOLUNTARIADO.area).some((c) => /área/i.test(`${c.titulo[0]} ${c.titulo[1]} ${c.texto}`)), 'área: pelo menos uma chamada diz "área"')

if (falhas) { console.error(`\n${falhas} falha(s).`); process.exit(1) }
console.log(`Cartaz do voluntariado: tudo certo (${Object.keys(inscricao).length} de inscrição, ${Object.keys(COPY_DO_VOLUNTARIADO.area).length} da área).`)
