// Conferência das regras do cartaz com QR dos chamados (lib/chamados/cartaz.ts,
// sobre lib/cartaz/copy.ts) e da copy por setor (lib/chamados/cartaz-copy.ts).
// Rode com: npx tsx scripts/conferir-cartaz-dos-chamados.ts
import { chamadaFinal, descricaoCurta, lerOpcoes, MAXIMO_DO_TEXTO, MAXIMO_DO_TITULO, MAXIMO_DO_TITULO_MONTADO, montarChamada as montarBase, paraAUrl, tamanhoDoTitulo, type Chamada } from '../lib/cartaz/copy'
import {
  chamadasDoCartaz, CHAMADAS_DO_GERAL, CHAMADAS_GENERICAS, CHAVE_PADRAO, destinoSeguro, ehSlugDaFila, FILA_GERAL, formularioDaFila,
  linkDoCartaz, marcadoresDoCartaz, PARAMETRO_DA_FILA, TEXTO_PADRAO, type SetorDoCartaz,
} from '../lib/chamados/cartaz'
import { COPY_POR_MODELO } from '../lib/chamados/cartaz-copy'
import { artigoDoSetor, modeloDoSetor } from '../lib/chamados/setores'

let falhas = 0
const igual = (obtido: unknown, esperado: unknown, nome: string) => {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) { falhas++; console.error(`FALHOU: ${nome}\n  esperado: ${JSON.stringify(esperado)}\n  obtido:   ${JSON.stringify(obtido)}`) }
}
const verdade = (ok: boolean, nome: string) => { if (!ok) { falhas++; console.error(`FALHOU: ${nome}`) } }
const montarChamada = (chave: string, c: Chamada, setor: SetorDoCartaz | null, setores: string[] = []) => montarBase(chave, c, marcadoresDoCartaz(setor, setores))
const opcoes = (p: Record<string, string | string[] | undefined> | URLSearchParams) => lerOpcoes(p, PARAMETRO_DA_FILA, CHAVE_PADRAO)
const url = (o: { alvo: string; chamada: string; titulo: string; texto: string }) => paraAUrl(o, PARAMETRO_DA_FILA, CHAVE_PADRAO)

// ---------------------------------------------------------------- QR e rotas
igual(linkDoCartaz('https://palacio.cruzvermelhariodejaneiro.org/', 'ti'), 'https://palacio.cruzvermelhariodejaneiro.org/chamado?fila=ti', 'link do QR sem barra dobrada')
igual(linkDoCartaz('https://palacio.cruzvermelhariodejaneiro.org', null), 'https://palacio.cruzvermelhariodejaneiro.org/chamado', 'link do cartaz geral, sem fila')
igual(formularioDaFila('manutencao'), '/chamados/novo?fila=manutencao', 'formulário da fila')
igual(ehSlugDaFila('ti'), true, 'slug válido')
igual(ehSlugDaFila('TI'), false, 'maiúscula não é slug')
igual(ehSlugDaFila('a'), false, 'curto demais')
igual(ehSlugDaFila('../x'), false, 'caminho não é slug')
igual(ehSlugDaFila(null), false, 'vazio não é slug')
igual(ehSlugDaFila(FILA_GERAL), false, 'o cartaz geral nunca colide com o slug de uma fila')

igual(destinoSeguro('/chamados/novo?fila=ti'), '/chamados/novo?fila=ti', 'volta para o formulário')
igual(destinoSeguro('//exemplo.com'), null, 'recusa outro site (//)')
igual(destinoSeguro('/\\exemplo.com'), null, 'recusa outro site (/\\)')
igual(destinoSeguro('https://exemplo.com'), null, 'recusa endereço completo')
igual(destinoSeguro('javascript:alert(1)'), null, 'recusa javascript:')
igual(destinoSeguro('/'), null, 'não volta para a entrada')
igual(destinoSeguro('/?voltar=/x'), null, 'não volta para a entrada com parâmetros')
igual(destinoSeguro('/chamados\n/x'), null, 'recusa quebra de linha')
igual(destinoSeguro('/' + 'a'.repeat(400)), null, 'recusa caminho longo demais')
igual(destinoSeguro(undefined), null, 'sem parâmetro')

// ---------------------------------------------------------------- opções na URL (lib/cartaz/copy.ts)
igual(opcoes({}), { alvo: '', chamada: CHAVE_PADRAO, titulo: '', texto: '' }, 'sem parâmetros: os padrões')
igual(opcoes({ fila: 'ti', chamada: 'ti-travou', titulo: ' Quebrou?|Chame  a\nManutenção. ', texto: 'x\u0007y' }), { alvo: 'ti', chamada: 'ti-travou', titulo: 'Quebrou?|Chame a Manutenção.', texto: 'x y' }, 'limpa espaços, quebras e controle')
igual(opcoes({ chamada: 'Não Vale' }).chamada, CHAVE_PADRAO, 'chamada fora do formato volta ao padrão')
igual(opcoes({ chamada: ['a', 'b'] }).chamada, 'a', 'parâmetro repetido: o primeiro')
igual(opcoes({ titulo: 'x'.repeat(200) }).titulo.length, MAXIMO_DO_TITULO, 'título cortado no máximo')
igual(opcoes({ texto: 'y'.repeat(400) }).texto.length, MAXIMO_DO_TEXTO, 'frase cortada no máximo')
igual(opcoes(new URLSearchParams(`fila=${FILA_GERAL}&chamada=quem`)), { alvo: FILA_GERAL, chamada: 'quem', titulo: '', texto: '' }, 'lê URLSearchParams')
igual(url({ alvo: 'ti', chamada: CHAVE_PADRAO, titulo: '', texto: '' }), '?fila=ti', 'URL só com o que não é padrão')
igual(url({ alvo: '', chamada: CHAVE_PADRAO, titulo: '', texto: '' }), '', 'tudo padrão: sem query')
const ida = { alvo: 'manutencao', chamada: 'catalogo', titulo: 'Quebrou?|Chame.', texto: 'Uma frase, com vírgula & tal.' }
igual(opcoes(new URLSearchParams(url(ida))), ida, 'ida e volta pela URL')

// ---------------------------------------------------------------- montar a chamada
const manutencao: SetorDoCartaz = { nome: 'Manutenção', artigo: 'a', descricao: null, assuntos: ['Algo quebrou ou vazou', 'Pequena obra ou instalação'], prefixo: 'MAN' }
const juridico: SetorDoCartaz = { nome: 'Jurídico', artigo: 'o', descricao: 'Contratos e pareceres.', assuntos: [], prefixo: 'JUR' }
const semModelo: SetorDoCartaz = { nome: 'Ouvidoria', artigo: artigoDoSetor('Ouvidoria'), descricao: null, assuntos: ['A', 'B', 'C', 'D', 'E'], prefixo: null }

igual(montarChamada('precisa', CHAMADAS_GENERICAS.precisa, manutencao), { chave: 'precisa', rotulo: 'Precisa de…?', titulo: ['Precisa', 'da Manutenção?'], texto: TEXTO_PADRAO }, 'de sempre: sem descrição, o texto padrão')
igual(montarChamada('precisa', CHAMADAS_GENERICAS.precisa, juridico), { chave: 'precisa', rotulo: 'Precisa de…?', titulo: ['Precisa', 'do Jurídico?'], texto: 'Contratos e pareceres.' }, 'de sempre: com descrição, a descrição; {de} contrai o artigo')
igual(montarChamada('precisa', CHAMADAS_GENERICAS.precisa, { ...manutencao, nome: 'Compras', artigo: 'o setor de' })?.titulo, ['Precisa', 'do setor de Compras?'], '{de} com "o setor de"')
igual(montarChamada('precisa', CHAMADAS_GENERICAS.precisa, { ...manutencao, artigo: '' })?.titulo, ['Precisa', 'de Manutenção?'], '{de} sem artigo')
const longa = 'Elétrica, hidráulica e ar-condicionado da sede. ' + 'Também cuida de mobiliário, pintura, chaves e pequenas obras, sempre com um orçamento antes e a aprovação da direção quando o valor passa do combinado. '.repeat(2)
igual(montarChamada('precisa', CHAMADAS_GENERICAS.precisa, { ...manutencao, descricao: longa })?.texto, 'Elétrica, hidráulica e ar-condicionado da sede.', 'descrição comprida: só a primeira frase')
igual(descricaoCurta('x'.repeat(200) + '. Curta.', 160, 'padrão'), 'padrão', 'primeira frase comprida demais: o texto padrão')
igual(descricaoCurta('  Uma frase que cabe   ', 160, 'padrão'), 'Uma frase que cabe', 'descrição que cabe vai inteira')
igual(montarBase('x', { rotulo: 'x', titulo: ['Parada cardíaca:', 'saiba agir.'], texto: 't' }, { valores: {} })?.titulo[1], 'saiba agir.', 'depois de dois-pontos a frase continua minúscula')
igual(montarBase('x', { rotulo: 'x', titulo: ['Pediu?', 'abra.'], texto: 't' }, { valores: {} })?.titulo[1], 'Abra.', 'depois de ponto de interrogação começa frase')
igual(montarBase('x', { rotulo: 'x', titulo: ['{a} {setor} atende', 'por chamado.'], texto: '{a} {setor} recebe.' }, marcadoresDoCartaz(manutencao, [])), { chave: 'x', rotulo: 'x', titulo: ['A Manutenção atende', 'por chamado.'], texto: 'A Manutenção recebe.' }, '{a} {setor} no começo ganha maiúscula')
igual(montarChamada('direto', CHAMADAS_GENERICAS.direto, manutencao)?.titulo, ['Fale com', 'a Manutenção.'], 'segunda parte que continua a frase fica minúscula')
igual(montarChamada('direto', CHAMADAS_GENERICAS.direto, { ...manutencao, artigo: '' })?.titulo, ['Fale com', 'Manutenção.'], 'artigo vazio: só o nome, sem espaço dobrado')
igual(montarChamada('catalogo', CHAMADAS_GENERICAS.catalogo, juridico), null, '{assuntos} sem assuntos: a chamada some')
igual(montarChamada('catalogo', CHAMADAS_GENERICAS.catalogo, semModelo)?.texto, 'Atende: A · B · C · D. Abra um chamado e acompanhe a resposta.', '{assuntos}: até 4, separados por ponto')
igual(montarChamada('catalogo', CHAMADAS_GENERICAS.catalogo, semModelo)?.titulo, ['Ouvidoria atende', 'por chamado.'], 'setor sem modelo também monta')
igual(montarChamada('precisa', CHAMADAS_DO_GERAL.precisa, null, ['TI', 'Manutenção', 'Jurídico', 'Financeiro', 'Compras', 'RH']), { chave: 'precisa', rotulo: 'Precisa de outro setor?', titulo: ['Precisa de', 'outro setor?'], texto: 'Abra um chamado: TI, Manutenção, Jurídico, Financeiro, Compras e outros. Você escolhe o setor, e ele responde pelo Palácio, com prazo.' }, 'geral: até 5 setores, "e outros" quando corta')
igual(montarChamada('precisa', CHAMADAS_DO_GERAL.precisa, null, ['TI', 'Manutenção'])?.texto, 'Abra um chamado: TI, Manutenção. Você escolhe o setor, e ele responde pelo Palácio, com prazo.', 'geral: sem "e outros" quando cabem todos')
igual(montarChamada('precisa', CHAMADAS_DO_GERAL.precisa, null, []), null, 'geral sem setores: a chamada some')
igual(montarChamada('direto', CHAMADAS_GENERICAS.direto, null), null, 'chamada de setor no cartaz geral: some')
igual(montarBase('x', { rotulo: 'x', titulo: ['Oi {nada}', ''], texto: 'texto' }, { valores: {} })?.titulo[0], 'Oi {nada}', 'marcador desconhecido fica (a conferência acusa)')

// ---------------------------------------------------------------- a lista do seletor e a chamada final
const listaMan = chamadasDoCartaz(manutencao, ['Manutenção'], COPY_POR_MODELO)
igual(listaMan[0]?.chave, CHAVE_PADRAO, 'a de sempre vem primeiro')
verdade(listaMan.length >= Object.keys(CHAMADAS_GENERICAS).length, 'as genéricas estão todas na lista (com assuntos)')
igual(new Set(listaMan.map((c) => c.chave)).size, listaMan.length, 'chaves únicas na lista')
igual(chamadasDoCartaz(juridico, [], COPY_POR_MODELO).some((c) => c.chave === 'catalogo'), false, 'sem assuntos, o catálogo não entra')
igual(chamadasDoCartaz(null, ['TI'], COPY_POR_MODELO).map((c) => c.chave), Object.keys(CHAMADAS_DO_GERAL), 'cartaz geral: as chamadas do geral')
igual(chamadasDoCartaz(null, [], COPY_POR_MODELO).length, Object.keys(CHAMADAS_DO_GERAL).length - 1, 'cartaz geral sem setores: só as que não listam setores')

igual(chamadaFinal({ alvo: 'x', chamada: 'nao-existe', titulo: '', texto: '' }, listaMan).chave, CHAVE_PADRAO, 'chave desconhecida: a primeira da lista')
// O artigo pelo nome: o modelo casa por várias chaves, e a palavra vale mais que ele.
for (const [nome, artigo] of [['Manutenção', 'a'], ['Tecnologia da Informação', 'a'], ['TI', 'a'], ['Jurídico', 'o'], ['Compras', 'o setor de'], ['Recursos Humanos', 'o setor de'],
  ['Departamento Pessoal', 'o'], ['Almoxarifado', 'o'], ['Suprimentos', 'o setor de'], ['Serviços Gerais', 'o setor de'], ['Assistência Humanitária', 'a'], ['Humanitário', 'o setor'], ['Doações', 'o setor de'],
  ['Primeiros Socorros', 'a equipe de'], ['Saúde', 'a equipe de'], ['Ensino', 'o'], ['Escola', 'a'], ['GRD', 'a'], ['Juventude', 'a'], ['Ouvidoria', 'a'], ['Secretaria Executiva', 'a'], ['Logística', 'a'], ['Frota', 'a']] as const) {
  igual(artigoDoSetor(nome), artigo, `artigo de "${nome}"`)
}
igual([tamanhoDoTitulo(['Precisa de', 'TI?']), tamanhoDoTitulo(['Precisa de', 'Comunicação Social por chamado.']), tamanhoDoTitulo(['Inscrições abertas:', 'Cuidador de Idosos (Curso Livre).'])], ['grande', 'medio', 'pequeno'], 'o título encolhe com o tamanho')
igual(chamadaFinal({ alvo: 'x', chamada: CHAVE_PADRAO, titulo: 'Quebrou?|Chame a Manutenção.', texto: '' }, listaMan).titulo, ['Quebrou?', 'Chame a Manutenção.'], 'título livre com | separa a parte vermelha')
igual(chamadaFinal({ alvo: 'x', chamada: CHAVE_PADRAO, titulo: 'Só uma linha', texto: 'Minha frase.' }, listaMan), { ...listaMan[0], titulo: ['Só uma linha', ''], texto: 'Minha frase.' }, 'título sem | e frase livre')

// ---------------------------------------------------------------- toda a copy, em todos os setores
const CANONICOS: Record<string, string> = {
  TI: 'Tecnologia da Informação', MAN: 'Manutenção', COM: 'Comunicação Social', JUR: 'Jurídico', FIN: 'Financeiro', CPR: 'Compras', RH: 'Recursos Humanos',
  DIR: 'Diretoria', VOL: 'Voluntariado', JUV: 'Juventude', PSO: 'Primeiros Socorros', GRD: 'GRD', EDU: 'Educação e Saúde', PSS: 'Psicologia / Serviço Social',
  SAU: 'Saúde', HUM: 'Humanitário', ESP: 'Esportes', FRO: 'Frota',
}
// Os nomes inteiros e as palavras que só são nome de setor ("saúde", "educação", "informação" são substantivos comuns que a copy pode usar).
const nomesLiterais = [...Object.values(CANONICOS).filter((n) => n !== 'Saúde'), 'Manutenção', 'Jurídico', 'Financeiro', 'Compras', 'Diretoria', 'Voluntariado', 'Juventude', 'Frota', 'Esportes', 'Humanitário', 'GRD', 'TI', 'RH', 'Comunicação', 'Psicologia']
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function conferirChamada(onde: string, chave: string, c: Chamada, setor: SetorDoCartaz | null, setores: string[]) {
  verdade(/^[a-z0-9-]{1,40}$/.test(chave), `${onde}/${chave}: chave é slug`)
  const modelo = [c.titulo[0], c.titulo[1], c.texto].join(' ')
  verdade(!/\{(?!setor\}|a\}|de\}|descricao\}|assuntos\}|setores\})/.test(modelo), `${onde}/${chave}: só marcadores conhecidos`)
  verdade(!/whatsapp/i.test(modelo), `${onde}/${chave}: não promete WhatsApp (só quem ligou o número recebe)`)
  for (const n of nomesLiterais) verdade(!new RegExp(`(^|[^\\p{L}])${escapar(n)}(?![\\p{L}])`, 'iu').test(modelo), `${onde}/${chave}: nome de setor por extenso ("${n}")`)
  verdade((modelo.match(/!/g) ?? []).length <= 1, `${onde}/${chave}: no máximo um "!"`)
  const pronta = montarChamada(chave, c, setor, setores)
  if (!pronta) return
  verdade(!/[{}]/.test([...pronta.titulo, pronta.texto].join(' ')), `${onde}/${chave}: sem marcador sobrando`)
  const titulo = `${pronta.titulo[0]} ${pronta.titulo[1]}`.trim()
  verdade(titulo.length <= MAXIMO_DO_TITULO_MONTADO, `${onde}/${chave}: título cabe (${titulo.length} > ${MAXIMO_DO_TITULO_MONTADO}): "${titulo}"`)
  verdade(pronta.texto.length <= MAXIMO_DO_TEXTO, `${onde}/${chave}: frase cabe (${pronta.texto.length} > ${MAXIMO_DO_TEXTO})`)
  verdade(pronta.texto.length >= 20, `${onde}/${chave}: frase curta demais`)
}
const assuntosDe = (nome: string) => (modeloDoSetor(nome)?.assuntos ?? []).map((a) => a.nome)
const OUTROS_NOMES: Record<string, string[]> = {
  TI: ['TI', 'Informática'], MAN: ['Infraestrutura', 'Zeladoria'], COM: ['Comunicação', 'Marketing'], JUR: ['Assessoria Jurídica'], FIN: ['Tesouraria', 'Contabilidade'],
  CPR: ['Almoxarifado', 'Suprimentos'], RH: ['Departamento Pessoal', 'RH'], DIR: ['Presidência', 'Secretaria Executiva'], JUV: ['Juventude Cruz Vermelha'], PSO: ['Ambulância'],
  GRD: ['Defesa Civil', 'Emergências'], EDU: ['Escola'], PSS: ['Serviço Social'], SAU: ['Enfermagem'], HUM: ['Assistência Humanitária', 'Doações'], ESP: ['Esporte'], FRO: ['Transporte', 'Logística'],
}
let copiasPorModelo = 0
for (const [prefixo, chamadas] of Object.entries(COPY_POR_MODELO)) {
  const nome = CANONICOS[prefixo]
  verdade(Boolean(nome), `copy para prefixo desconhecido: ${prefixo}`)
  if (!nome) continue
  igual(modeloDoSetor(nome)?.prefixo, prefixo, `${prefixo}: o nome canônico casa com o modelo`)
  // O nome canônico e os outros nomes que caem no mesmo modelo (a copy tem que caber e soar bem com todos).
  for (const n of [nome, ...(OUTROS_NOMES[prefixo] ?? [])]) {
    igual(modeloDoSetor(n)?.prefixo, prefixo, `${prefixo}: "${n}" casa com o modelo`)
    const setor: SetorDoCartaz = { nome: n, artigo: artigoDoSetor(n), descricao: null, assuntos: assuntosDe(n), prefixo }
    for (const [chave, c] of Object.entries(chamadas)) { if (n === nome) copiasPorModelo++; conferirChamada(`${prefixo}@${n}`, chave, c, setor, []) }
  }
  verdade(!Object.keys(chamadas).some((k) => k in CHAMADAS_GENERICAS), `${prefixo}: chave não repete uma genérica`)
}
for (const [chave, c] of Object.entries(CHAMADAS_GENERICAS)) {
  for (const nome of [...Object.values(CANONICOS), ...Object.values(OUTROS_NOMES).flat(), 'Ouvidoria', 'Serviços Gerais']) {
    conferirChamada(`generica@${nome}`, chave, c, { nome, artigo: artigoDoSetor(nome), descricao: null, assuntos: assuntosDe(nome).length ? assuntosDe(nome) : ['Pedido ao setor', 'Informação ou dúvida'], prefixo: modeloDoSetor(nome)?.prefixo ?? null }, [])
  }
}
for (const [chave, c] of Object.entries(CHAMADAS_DO_GERAL)) conferirChamada('geral', chave, c, null, ['Tecnologia da Informação', 'Manutenção', 'Comunicação Social', 'Jurídico', 'Financeiro'])

if (falhas) { console.error(`\n${falhas} falha(s).`); process.exit(1) }
console.log(`Cartaz dos chamados: tudo certo (${Object.keys(CHAMADAS_GENERICAS).length} genéricas, ${Object.keys(CHAMADAS_DO_GERAL).length} do geral, ${copiasPorModelo} por setor em ${Object.keys(COPY_POR_MODELO).length} modelos).`)
