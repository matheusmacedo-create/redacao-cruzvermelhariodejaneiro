/**
 * Confere as regras do autocadastro de colaborador pelo WhatsApp: `npx tsx scripts/conferir-autocadastro.ts`.
 *
 *  - a entrada (lerAutocadastro, linkDoBot);
 *  - cada resposta (nome, coordenação, e-mail, nascimento, CEP, endereço, número, emergência) e o que é recusado;
 *  - a conversa inteira até o resumo, com a consulta do CEP achando e não achando;
 *  - o "pular", o "cancelar" e a foto que só vale como imagem;
 *  - os botões de aprovação (ida e volta do id), a segunda confirmação, o resumo mascarado;
 *  - a ficha do RH (mesmos campos de CAMPOS_DA_FICHA) e a redação dos dados pessoais.
 * Sai com código 1 se algo estiver errado.
 */
import {
  BOTOES_DE_APROVACAO, comEnderecoDoCep, dadosRedigidos, fichaDoAutocadastro, idDoBotao, lerAutocadastro, lerBotaoDeAprovacao, lerCep,
  lerEndereco, lerNascimento, lerNome, linkDoBot, perguntaDoAutocadastro, proximaEtapa, resumoParaAprovador, seguirNoAutocadastro,
  type DadosDoAutocadastro,
} from '../lib/whatsapp/autocadastro-regras'
import { CAMPOS_DA_FICHA } from '../lib/rh/ficha'

let falhas = 0
function igual<T>(obtido: T, esperado: T, caso: string) {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) { falhas++; console.log(`FALHOU: ${caso}\n  esperado ${JSON.stringify(esperado)}\n  obtido   ${JSON.stringify(obtido)}`) }
}
const contem = (texto: string, trecho: string, caso: string) => { if (!String(texto).includes(trecho)) { falhas++; console.log(`FALHOU: ${caso}\n  sem "${trecho}" em ${JSON.stringify(texto)}`) } }
const sem = (texto: string, trecho: string, caso: string) => { if (String(texto).includes(trecho)) { falhas++; console.log(`FALHOU: ${caso}\n  com "${trecho}" em ${JSON.stringify(texto)}`) } }

// a entrada
igual(lerAutocadastro('Quero me cadastrar'), true, 'entrada: a frase do link')
igual(lerAutocadastro('me cadastrar'), true, 'entrada: me cadastrar')
igual(lerAutocadastro('cadastro'), false, 'entrada: palavra solta não abre')
igual(lerAutocadastro('oi, tudo bem?'), false, 'entrada: conversa comum não abre cadastro')
igual(linkDoBot('+55 21 99999-0000'), 'https://wa.me/5521999990000?text=quero%20me%20cadastrar', 'link do bot')

// as leituras
igual(lerNome('Ana Lima'), 'Ana Lima', 'nome ok')
igual(lerNome('Ana'), null, 'nome sem sobrenome')
igual(lerNome('Ana 2 Lima'), null, 'nome com número')
igual(lerNascimento('25/03/1990', new Date('2026-10-23T12:00:00Z')), '1990-03-25', 'nascimento ok')
igual(lerNascimento('31/02/1990'), null, 'nascimento inexistente')
igual(lerNascimento('25/03/2020', new Date('2026-10-23T12:00:00Z')), null, 'nascimento: menor de 14')
igual(lerNascimento('25031990', new Date('2026-10-23T12:00:00Z')), '1990-03-25', 'nascimento sem barras')
igual(lerCep('20230024'), '20230-024', 'cep sem hífen')
igual(lerCep('2023'), null, 'cep curto')
igual(lerEndereco('Rua das Flores, Centro, Rio de Janeiro/RJ'), { logradouro: 'Rua das Flores', bairro: 'Centro', cidade: 'Rio de Janeiro', uf: 'RJ' }, 'endereço escrito')
igual(lerEndereco('Rua das Flores'), null, 'endereço incompleto')

// a conversa inteira
const setores = ['Expediente', 'Redação', 'Mídia']
let d: DadosDoAutocadastro = { setores }
igual(proximaEtapa(d), 'nome', 'começa pelo nome')
contem(perguntaDoAutocadastro(d)!.texto, 'nome completo', 'pergunta do nome')

function dizer(texto: string): string {
  const p = seguirNoAutocadastro(d, texto)
  if (p.tipo === 'avancar') { d = p.dados; return 'avancou' }
  if (p.tipo === 'consultar_cep') { d = p.dados; return 'cep' }
  return p.tipo
}
igual(dizer('Ana'), 'repetir', 'nome inválido repete')
igual(dizer('Ana Lima'), 'avancou', 'nome')
contem(perguntaDoAutocadastro(d)!.texto, '2. Redação', 'lista de coordenações')
igual(dizer('9'), 'repetir', 'coordenação fora da lista')
igual(dizer('2'), 'avancou', 'coordenação pelo número')
igual(d.coordenacao, 'Redação', 'coordenação escolhida')
igual(dizer('pular'), 'avancou', 'cargo pulado')
igual(d.cargo, '', 'cargo vazio mas respondido')
igual(dizer('ana@cruzvermelhariodejaneiro.org'), 'repetir', 'e-mail institucional recusado como pessoal')
igual(dizer('ana.lima@gmail.com'), 'avancou', 'e-mail pessoal')
igual(dizer('25/03/1990'), 'avancou', 'nascimento')
igual(dizer('20230024'), 'cep', 'cep pede consulta')
d = comEnderecoDoCep(d, { logradouro: 'Rua Salvador de Sá', bairro: 'Centro', cidade: 'Rio de Janeiro', uf: 'rj' })
igual(proximaEtapa(d), 'numero', 'CEP achado pula o endereço')
contem(perguntaDoAutocadastro(d)!.texto, 'Rua Salvador de Sá', 'mostra o endereço achado')
igual(dizer('120'), 'avancou', 'número')
igual(dizer('apto 3'), 'avancou', 'complemento')
igual(dizer('Carlos Lima'), 'avancou', 'emergência: nome')
igual(dizer('pai'), 'avancou', 'emergência: parentesco')
igual(dizer('123'), 'repetir', 'emergência: telefone inválido')
igual(dizer('(21) 98888-7777'), 'avancou', 'emergência: telefone')
igual(proximaEtapa(d), 'foto', 'pede a foto')
igual(dizer('aqui está'), 'repetir', 'texto não vale como foto')
d = { ...d, fotoMidia: 'midia-1' }
igual(proximaEtapa(d), 'ciencia', 'pede a ciência')
igual(dizer('talvez'), 'repetir', 'ciência exige confirmo')
igual(dizer('confirmo'), 'avancou', 'ciência')
igual(proximaEtapa(d), 'pronto', 'pronto')
igual(perguntaDoAutocadastro(d), null, 'sem pergunta quando pronto')

// CEP não achado → pede o endereço
let e: DadosDoAutocadastro = { ...d, logradouro: undefined, bairro: undefined, cidade: undefined, uf: undefined, ciente: false }
e = comEnderecoDoCep(e, null)
igual(proximaEtapa(e), 'endereco', 'CEP não achado pede o endereço')

// cancelar em qualquer etapa
igual(seguirNoAutocadastro({ setores }, 'cancelar').tipo, 'cancelar', 'cancelar')

// aprovação
const id = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d'
igual(lerBotaoDeAprovacao(idDoBotao('aprovar', id)), { acao: 'aprovar', id: id.replace(/-/g, '') }, 'id do botão ida e volta')
igual(lerBotaoDeAprovacao('cad:aprovar:xyz'), null, 'id inválido')
igual(lerBotaoDeAprovacao('aprovar'), null, 'texto solto não aprova')
for (const b of (BOTOES_DE_APROVACAO(id) as { botoes: { id: string; titulo: string }[] }).botoes) igual(b.id.length <= 40 && b.titulo.length <= 20, true, `botão cabe na Meta: ${b.titulo}`)
const resumo = resumoParaAprovador(d)
contem(resumo, 'Ana Lima', 'resumo: nome')
contem(resumo, 'a•••@gmail.com', 'resumo: e-mail mascarado')
sem(resumo, 'ana.lima@gmail.com', 'resumo: sem o e-mail inteiro')
sem(resumo, '98888', 'resumo: sem o telefone inteiro')
sem(resumo, 'Rua Salvador', 'resumo: sem a rua')
contem(resumo, 'ana.lima@…', 'resumo: e-mail institucional previsto')

// destino dos dados
const ficha = fichaDoAutocadastro(d, '+5521977776666')
const campos = new Set<string>(CAMPOS_DA_FICHA.map((c) => c.campo))
igual(Object.keys(ficha).every((k) => campos.has(k)), true, 'ficha só com campos conhecidos')
igual(ficha.data_nascimento, '1990-03-25', 'ficha: nascimento')
igual(ficha.complemento, 'apto 3', 'ficha: complemento')
const red = dadosRedigidos(d)
igual(red.redigida, true, 'redigida marcada')
igual(JSON.stringify(red).includes('Ana') || JSON.stringify(red).includes('gmail') || JSON.stringify(red).includes('midia-1'), false, 'nada pessoal depois de redigir')

console.log(falhas ? `${falhas} falha(s).` : 'Tudo certo.')
process.exit(falhas ? 1 : 0)
