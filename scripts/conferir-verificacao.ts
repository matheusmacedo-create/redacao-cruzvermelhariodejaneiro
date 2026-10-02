/**
 * Confere as regras puras da verificação do candidato: `npx tsx scripts/conferir-verificacao.ts`.
 *
 * - prazos do atestado (90 dias, renovação em 6 meses com fim de mês, aviso de 15 dias);
 * - comparação de nomes com acento, partícula e abreviação; máscara do número do documento;
 * - leitura das bases da CGU (vazia, com ocorrência, falha) e o resumo (nunca "nada consta" por falha);
 * - a trava da aprovação, as pendências, a régua da decisão e o chip;
 * - os formulários (referências, registro, decisão) e os textos (pedido, código do parecer, linhas do PDF).
 *
 * Sai com código 1 se algo estiver errado.
 */
import {
  atestadoAceitavel, atestadoMaisNovo, chipDaVerificacao, codigoDoParecer, compararComCadastro, compararNomes, lerDecisao, lerReferencias,
  CHAVE_DA_CGU_RECUSADA, lerChaveDaCgu, lerRegistroProfissional, lerRespostaDaCgu, linhasDoParecer, mascararNumeroDoDocumento, normalizarNome, pendencias, problemaDaDecisao,
  renovacaoDoAtestado, resumirSancoes, situacaoDaRenovacao, somarMeses, textoDoPedidoDeDocumentos, travaDaAprovacao, validadeDoAtestado,
  verificacaoCompleta, type ArquivoDoVoluntario, type Referencia, type ResultadoDaBase, type Verificacao,
} from '../lib/participantes/verificacao/regras'

let falhas = 0
function igual<T>(obtido: T, esperado: T, rotulo: string) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) { falhas++; console.error(`✗ ${rotulo}\n   esperado: ${JSON.stringify(esperado)}\n   obtido:   ${JSON.stringify(obtido)}`) }
}
const verdade = (v: boolean, rotulo: string) => igual(v, true, rotulo)

// ── Prazos ──────────────────────────────────────────────────────────────────
igual(validadeDoAtestado('2026-10-01'), '2026-12-30', 'atestado vale 90 dias')
igual(renovacaoDoAtestado('2026-10-01'), '2027-04-01', 'renovação em 6 meses')
igual(somarMeses('2026-08-31', 6), '2027-02-28', 'fim de mês: 31/08 + 6 = 28/02 (como o Postgres)')
igual(somarMeses('2027-08-31', 6), '2028-02-29', 'fim de mês em ano bissexto')
igual(somarMeses('2026-12-15', 6), '2027-06-15', 'virada do ano')
igual(atestadoAceitavel('2026-09-01', '2026-10-02'), { ok: true }, 'atestado de um mês serve')
igual(atestadoAceitavel('2026-07-04', '2026-10-02'), { ok: true }, 'atestado de exatamente 90 dias serve')
igual(atestadoAceitavel('2026-07-03', '2026-10-02').ok, false, 'atestado de 91 dias não serve')
igual(atestadoAceitavel('2026-10-03', '2026-10-02').ok, false, 'atestado do futuro não serve')
igual(atestadoAceitavel('', '2026-10-02').ok, false, 'sem data não serve')
igual(situacaoDaRenovacao('2027-04-01', '2026-10-02'), 'em_dia', 'renovação longe: em dia')
igual(situacaoDaRenovacao('2026-10-17', '2026-10-02'), 'vence_logo', 'renovação em 15 dias: vence logo')
igual(situacaoDaRenovacao('2026-10-18', '2026-10-02'), 'em_dia', 'renovação em 16 dias: ainda em dia')
igual(situacaoDaRenovacao('2026-10-01', '2026-10-02'), 'vencido', 'renovação ontem: vencido')
igual(situacaoDaRenovacao(null, '2026-10-02'), null, 'sem data: nada')

// ── Nomes e números ─────────────────────────────────────────────────────────
igual(normalizarNome('  JOSÉ  da Silva-Júnior '), 'jose da silva junior', 'normaliza acento, caixa e hífen')
igual(compararNomes('MARIA JOSE DA SILVA', 'Maria José da Silva'), 'confere', 'mesmo nome em caixa alta e sem acento confere')
igual(compararNomes('Maria J. da Silva', 'Maria José da Silva'), 'parecido', 'abreviação no meio: parecido')
igual(compararNomes('Maria da Silva', 'Maria José da Silva'), 'parecido', 'nome do meio a mais no cadastro: parecido')
igual(compararNomes('Maria José Souza', 'Maria José da Silva'), 'diverge', 'sobrenome diferente: diverge')
igual(compararNomes('', 'Maria'), 'nao_lido', 'documento sem nome: não lido')
igual(compararNomes('Maria', ''), 'diverge', 'cadastro sem nome: diverge')
igual(mascararNumeroDoDocumento('12.345.678-9'), '**.***.*78-9', 'RG mascarado mantém os três últimos')
igual(mascararNumeroDoDocumento('01234567890'), '********890', 'CNH mascarada')
igual(mascararNumeroDoDocumento('AB1'), '***', 'número curto some inteiro')
igual(mascararNumeroDoDocumento(null), null, 'sem número: nada')

const lido = compararComCadastro(
  { legivel: true, tipo: 'RG', nome: 'CARLA CANDIDATA', data_nascimento: '1990-05-10', cpf: '52998224725', numero: '12.345.678-9', orgao_emissor: 'DETRAN', uf: 'RJ', validade: null },
  { nome: 'Carla Candidata', data_nascimento: '1990-05-10' }, 'confere',
)
igual(lido.comparacao, { nome: 'confere', nascimento: 'confere', cpf: 'confere' }, 'documento igual ao cadastro: tudo confere')
igual(lido.divergencias, [], 'sem divergências')
igual(lido.numero, '**.***.*78-9', 'o número guardado sai mascarado')
verdade(!('cpf' in lido), 'o CPF nunca fica na leitura')
const divergente = compararComCadastro(
  { legivel: true, tipo: 'CNH', nome: 'CARLOS OUTRO', data_nascimento: '1991-01-01', cpf: null, numero: '123', orgao_emissor: null, uf: null, validade: '2020-01-01' },
  { nome: 'Carla Candidata', data_nascimento: '1990-05-10' }, 'diverge',
)
igual(divergente.comparacao, { nome: 'diverge', nascimento: 'diverge', cpf: 'diverge' }, 'documento de outra pessoa: tudo diverge')
igual(divergente.divergencias.length, 5, 'nome, nascimento, CPF, CPF ilegível e vencido')
const ilegivel = compararComCadastro({ legivel: false, tipo: null, nome: null, data_nascimento: null, cpf: null, numero: null, orgao_emissor: null, uf: null, validade: null }, { nome: 'Carla', data_nascimento: null }, 'sem_cpf')
igual(ilegivel.comparacao, { nome: 'nao_lido', nascimento: 'nao_lido', cpf: 'nao_lido' }, 'ilegível: nada lido')
igual(ilegivel.divergencias[0], 'O Claude não conseguiu ler o documento: confira manualmente.', 'e avisa para conferir à mão')

// ── CGU ─────────────────────────────────────────────────────────────────────
igual(lerRespostaDaCgu('ceis', 200, []), { situacao: 'ok', ocorrencias: 0, detalhes: [] }, 'lista vazia: nada consta')
igual(lerRespostaDaCgu('ceis', 200, [{ tipoSancao: { descricaoResumida: 'Inidoneidade' }, orgaoSancionador: { nome: 'CGU' }, dataInicioSancao: '2024-01-10', dataFimSancao: '2026-01-10' }]),
  { situacao: 'ok', ocorrencias: 1, detalhes: ['Inidoneidade · CGU · de 10/01/2024 · até 10/01/2026'] }, 'ocorrência no CEIS resumida')
igual(lerRespostaDaCgu('peps', 200, [{ descricaoFuncao: 'Vereador', nomeOrgao: 'Câmara', dataInicioExercicio: '2021-01-01' }]).detalhes, ['Vereador · Câmara · desde 01/01/2021'], 'PEP resumido')
igual(lerRespostaDaCgu('ceaf', 200, [{}]).detalhes, ['Registro encontrado'], 'registro sem os campos conhecidos ainda conta')
igual(lerRespostaDaCgu('cnep', 500, null).situacao, 'falha', 'erro 500: falha')
igual(lerRespostaDaCgu('cnep', 401, null).erro, CHAVE_DA_CGU_RECUSADA, 'erro 401: chave')
igual(lerRespostaDaCgu('cnep', 403, null).erro, CHAVE_DA_CGU_RECUSADA, 'erro 403: chave')

// A chave da CGU como a pessoa colou.
igual(lerChaveDaCgu(' FEDCBA9876543210FEDCBA9876543210 '), 'fedcba9876543210fedcba9876543210', 'chave pura, com espaço e maiúsculas')
igual(lerChaveDaCgu('[{"key":"chave-api-dados","value":"0123456789abcdef0123456789abcdef"}]'), '0123456789abcdef0123456789abcdef', 'JSON do Portal')
igual(lerChaveDaCgu('chave-api-dados: 0123456789abcdef0123456789abcdef'), '0123456789abcdef0123456789abcdef', 'cabeçalho colado')
igual(lerChaveDaCgu('0123456789abcdef0123456789abcde'), null, '31 caracteres não é chave')
igual(lerChaveDaCgu('0123456789abcdef0123456789abcdef0'), null, '33 caracteres não é chave')
igual(lerChaveDaCgu('minha chave é xyz'), null, 'sem chave')
igual(lerChaveDaCgu(''), null, 'vazio')
igual(lerRespostaDaCgu('cnep', 200, { erro: 'x' }).situacao, 'falha', 'corpo que não é lista: falha')
const limpa: ResultadoDaBase = { situacao: 'ok', ocorrencias: 0, detalhes: [] }
const falha: ResultadoDaBase = { situacao: 'falha', ocorrencias: 0, detalhes: [], erro: 'x' }
const suja: ResultadoDaBase = { situacao: 'ok', ocorrencias: 2, detalhes: ['a', 'b'] }
igual(resumirSancoes({ ceis: limpa, cnep: limpa, ceaf: limpa, peps: limpa }).resultado, 'nada_consta', 'todas limpas: nada consta')
igual(resumirSancoes({ ceis: limpa, cnep: falha, ceaf: limpa, peps: limpa }).resultado, 'incompleto', 'uma falhou: incompleto (nunca nada consta por falha)')
igual(resumirSancoes({ ceis: limpa, cnep: falha, ceaf: suja, peps: limpa }).resultado, 'ocorrencias', 'ocorrência vence a falha')

// ── Trava, pendências, decisão, chip ────────────────────────────────────────
const base: Verificacao = {
  id: '0a1b2c3d-0000-4000-8000-000000000000', escopo: 'completa', estado: 'enviada', link_expira_em: null, link_enviado_para: 'carla@x.io', termo_aceito_em: '2026-10-01T10:00:00Z',
  enviado_em: '2026-10-01T11:00:00Z', itens: {}, documento_lido: null, sancoes: null, registro_profissional: { tem: false, conselho: null, numero: null, uf: null },
  parecer: null, restricoes: [], motivo: null, decidido_por: null, decidido_em: null, created_at: '2026-10-01T09:00:00Z',
}
igual(travaDaAprovacao(null).travada, true, 'sem verificação: travado')
igual(travaDaAprovacao(base).travada, true, 'enviada: travado')
igual(travaDaAprovacao({ estado: 'concluida', parecer: 'apto' }).travada, false, 'apto: destrava')
igual(travaDaAprovacao({ estado: 'concluida', parecer: 'apto_com_restricao' }).travada, false, 'apto com restrição: destrava')
igual(travaDaAprovacao({ estado: 'concluida', parecer: 'nao_apto' }).travada, true, 'não apto: travado')
igual(verificacaoCompleta({ escopo: 'completa', itens: { identidade: { situacao: 'conferido' } } }), false, 'só identidade: incompleta')
igual(verificacaoCompleta({ escopo: 'completa', itens: { identidade: { situacao: 'conferido' }, antecedentes: { situacao: 'conferido' } } }), true, 'os dois: completa')
igual(verificacaoCompleta({ escopo: 'renovacao', itens: { antecedentes: { situacao: 'conferido' } } }), true, 'renovação: só antecedentes')

const arq = (categoria: ArquivoDoVoluntario['categoria'], data: string | null, extra: Partial<ArquivoDoVoluntario> = {}): ArquivoDoVoluntario => ({
  id: `${categoria}-${data}`, categoria, lado: null, data_documento: data, validade: data ? validadeDoAtestado(data) : null, vence_em: data ? renovacaoDoAtestado(data) : null,
  codigo_autenticacao: null, observacao: null, nome_original: 'x.pdf', tipo: 'application/pdf', tamanho: 1, sha256: null, pelo_candidato: true, enviado_por: null,
  created_at: '2026-10-01T10:00:00Z', excluido_em: null, motivo_exclusao: null, ...extra,
})
const ref = (nome: string, parecer: Referencia['parecer'] = null): Referencia => ({ id: nome, nome, relacao: 'chefe', telefone: '21', email: null, informado_pelo_candidato: true, contatado_em: parecer ? '2026-10-01' : null, contatado_por_nome: null, parecer, nota: null })
igual(pendencias(null, [], [], '2026-10-02'), ['Abra a verificação e peça os documentos ao candidato.'], 'sem verificação: abrir')
const p1 = pendencias(base, [], [], '2026-10-02')
verdade(p1.includes('Falta o documento com foto.') && p1.includes('Falta o atestado de antecedentes.') && p1.includes('Faltam referências (0 de 2).'), 'nada enviado: faltam documento, atestado e referências')
const comTudo: Verificacao = { ...base, itens: { identidade: { situacao: 'conferido' }, antecedentes: { situacao: 'conferido' }, sancoes: { situacao: 'conferido' }, entrevista: { situacao: 'conferido' } } }
igual(pendencias(comTudo, [arq('documento_identidade', null), arq('antecedentes_pcerj', '2026-09-20')], [ref('A', 'favoravel'), ref('B', 'favoravel')], '2026-10-02'), [], 'tudo conferido: sem pendências')
igual(pendencias(comTudo, [arq('documento_identidade', null), arq('antecedentes_pcerj', '2026-05-20')], [ref('A', 'favoravel'), ref('B', 'favoravel')], '2026-10-02'), ['O atestado guardado passou de 90 dias: peça um novo.'], 'atestado velho vira pendência')
igual(pendencias({ ...comTudo, documento_lido: { ...ilegivel, comparacao: { nome: 'diverge', nascimento: 'confere', cpf: 'confere' } } }, [arq('documento_identidade', null), arq('antecedentes_pcerj', '2026-09-20')], [ref('A', 'favoravel'), ref('B', 'favoravel')], '2026-10-02'),
  ['A leitura do documento apontou divergência com o cadastro.'], 'divergência na leitura vira pendência')
igual(atestadoMaisNovo([arq('antecedentes_pcerj', '2026-08-01'), arq('antecedentes_pf', '2026-09-15'), arq('antecedentes_pcerj', '2026-09-30', { excluido_em: '2026-10-01' })])?.data_documento, '2026-09-15', 'o atestado mais novo ignora o excluído')

igual(problemaDaDecisao('apto', [], '', true), null, 'apto com tudo conferido: pode')
verdade(problemaDaDecisao('apto', [], '', false)!.startsWith('Para “apto”'), 'apto sem conferir: não pode')
igual(problemaDaDecisao('apto_com_restricao', [], 'Motivo longo o bastante', false), 'Marque ao menos uma restrição.', 'com restrição sem marcar nenhuma')
verdade(problemaDaDecisao('apto_com_restricao', ['sem_valores'], 'Motivo longo o bastante', false)!.includes('obrigatória'), 'sem conferir, exige a de crianças')
igual(problemaDaDecisao('apto_com_restricao', ['sem_valores'], 'Motivo longo o bastante', true), null, 'tudo conferido, qualquer restrição serve')
igual(problemaDaDecisao('apto_com_restricao', ['sem_criancas_adolescentes'], 'curto', false), 'Escreva o motivo da restrição (ao menos 10 caracteres).', 'motivo curto')
igual(problemaDaDecisao('nao_apto', [], 'Referência desfavorável e documento vencido', false), null, 'não apto com motivo: pode')
igual(problemaDaDecisao('nao_apto', [], '', true), 'Escreva o motivo (ao menos 10 caracteres).', 'não apto sem motivo')

igual(chipDaVerificacao(null, '2026-10-02'), { rotulo: 'Sem verificação', tom: 'neutro' }, 'chip sem verificação')
igual(chipDaVerificacao(base, '2026-10-02'), { rotulo: 'Documentos recebidos', tom: 'atencao' }, 'chip enviada')
igual(chipDaVerificacao({ ...base, estado: 'aberta', link_expira_em: '2026-10-10T00:00:00Z', termo_aceito_em: null }, '2026-10-02'), { rotulo: 'Aguardando documentos', tom: 'neutro' }, 'chip aberta')
igual(chipDaVerificacao({ ...base, estado: 'aberta', link_expira_em: '2026-10-10T00:00:00Z' }, '2026-10-02'), { rotulo: 'Candidato enviando', tom: 'atencao' }, 'chip aberta com termo aceito')
igual(chipDaVerificacao({ ...base, estado: 'aberta', link_expira_em: '2026-09-10T00:00:00Z', termo_aceito_em: null }, '2026-10-02'), { rotulo: 'Link vencido', tom: 'erro' }, 'chip link vencido')
igual(chipDaVerificacao({ ...base, estado: 'concluida', parecer: 'apto_com_restricao', restricoes: ['sem_valores'] }, '2026-10-02'), { rotulo: 'Apto com restrição (1)', tom: 'atencao' }, 'chip com restrição')
igual(chipDaVerificacao({ ...base, estado: 'concluida', parecer: 'nao_apto' }, '2026-10-02'), { rotulo: 'Não apto', tom: 'erro' }, 'chip não apto')

// ── Formulários ─────────────────────────────────────────────────────────────
igual(lerReferencias({ ref_1_nome: 'Rita', ref_1_relacao: 'chefe', ref_1_telefone: '21 9', ref_2_nome: 'Rui', ref_2_relacao: 'professor', ref_2_email: 'RUI@X.IO' }),
  { referencias: [{ nome: 'Rita', relacao: 'chefe', telefone: '21 9', email: null }, { nome: 'Rui', relacao: 'professor', telefone: null, email: 'rui@x.io' }], erros: [] }, 'duas referências lidas')
igual(lerReferencias({ ref_1_nome: 'Rita', ref_1_relacao: 'chefe', ref_1_telefone: '21 9' }).erros, ['Indique duas referências fora da família (ex.: chefe, professor, colega).'], 'uma só: erro')
igual(lerReferencias({ ref_1_nome: 'Rita', ref_1_relacao: 'chefe' , ref_2_nome: 'Rui', ref_2_relacao: 'prof', ref_2_email: 'x' }).erros, ['Referência 1: informe telefone ou e-mail.', 'Referência 2: o e-mail não parece certo.'], 'sem contato e e-mail errado')
igual(lerReferencias({}, 0), { referencias: [], erros: [] }, 'nenhuma, sem mínimo: nada')
igual(lerRegistroProfissional({ registro_tem: 'sim', registro_conselho: 'coren', registro_numero: '123', registro_uf: 'rj' }), { registro: { tem: true, conselho: 'COREN', numero: '123', uf: 'RJ' }, erros: [] }, 'registro lido em maiúsculas')
igual(lerRegistroProfissional({ registro_tem: 'sim' }).erros, ['Informe o conselho e o número do registro.'], 'tem mas não informou')
igual(lerRegistroProfissional({ registro_tem: 'nao', registro_conselho: 'x' }).registro.tem, false, 'não tem: limpa o resto')
igual(lerDecisao({ parecer: 'apto_com_restricao', restricoes: 'sem_valores,voar,sem_valores', motivo: ' m ' }), { parecer: 'apto_com_restricao', restricoes: ['sem_valores'], motivo: 'm', erros: [] }, 'decisão lida, restrição desconhecida fora, sem repetir')
igual(lerDecisao({ parecer: 'x' }).erros, ['Escolha o parecer.'], 'parecer inválido')

// ── Textos ──────────────────────────────────────────────────────────────────
const pedido = textoDoPedidoDeDocumentos({ nome: 'Carla Candidata', url: 'https://p/verificacao/abc' })
verdade(pedido.startsWith('Olá, Carla!') && pedido.includes('https://p/verificacao/abc') && pedido.includes('14 dias'), 'pedido com primeiro nome, link e prazo')
verdade(textoDoPedidoDeDocumentos({ nome: 'Carla', url: 'u', lembrete: true }).startsWith('Carla, faltam'), 'lembrete')
verdade(textoDoPedidoDeDocumentos({ nome: 'Carla', url: 'u', renovacao: true }).includes('renovar o seu atestado'), 'renovação')
igual(codigoDoParecer('0a1b2c3d-0000-4000-8000-000000000000', '2026-10-02T12:00:00Z'), 'VER-2026-0A1B2C', 'código do parecer')
const linhas = linhasDoParecer({ ...comTudo, sancoes: { resultado: 'nada_consta', bases: { ceis: limpa, cnep: limpa, ceaf: limpa, peps: limpa } } }, [arq('documento_identidade', null), arq('antecedentes_pcerj', '2026-09-20', { codigo_autenticacao: 'ABC' })], [ref('A', 'favoravel'), ref('B', 'favoravel')])
igual(linhas.map((l) => l[0]), ['Identidade', 'Antecedentes criminais', 'Sanções e pessoa exposta', 'Registro profissional', 'Referências', 'Entrevista'], 'as seis linhas do parecer')
verdade(linhas[1][2].includes('emitido em 20/09/2026') && linhas[1][2].includes('válido até 19/12/2026') && linhas[1][2].includes('renovar até 20/03/2027') && linhas[1][2].includes('Código ABC'), 'linha do atestado com as datas e o código')
verdade(linhas[2][2].startsWith('CEIS: nada consta · CNEP: nada consta'), 'linha das sanções por base')
igual(linhas[3][1], 'Não se aplica', 'sem registro profissional: não se aplica')
verdade(linhas[4][2].includes('A (chefe): Favorável em 01/10/2026'), 'linha das referências')
igual(linhasDoParecer({ ...base, escopo: 'renovacao' }, [], []).length, 1, 'renovação: só a linha do atestado')

console.log(falhas ? `${falhas} falha(s).` : 'Verificação do candidato: tudo certo.')
if (falhas) process.exit(1)
