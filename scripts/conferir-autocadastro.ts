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
  BOTOES_DE_APROVACAO, comEnderecoDoCep, dadosRedigidos, fichaDoAutocadastro, idDoBotao, lerAutocadastro, BOTOES_DE_CAIXAS, PERGUNTA_DAS_CAIXAS, ID_DO_CARGO_COORDENADOR, lerCaixaDoSetor, setorDoPedido, VALIDADE_DO_BOTAO_DE_CAIXAS_MIN, ehCoordenador, ehPedidoDeCaixas, idDoBotaoDeCaixas, lerBotaoDeCaixas, textoDaPreviaDasCaixas, textoDoResultadoDasCaixas, mensagensDaPreviaDasCaixas, mensagensDoResultadoDasCaixas, emMensagens, textoDaSenhaDaCaixa, ehPedidoDeAcompanhamento, mensagensDoAcompanhamento, podeDecidir, setorDaEntrada, textoDoLinkDoTime, lerBotaoDeAprovacao, lerCep, textoDaContaCriada, textoDaSegundaConfirmacao,
  lerEndereco, lerNascimento, lerNome, linkDoBot, perguntaDoAutocadastro, proximaEtapa, resumoParaAprovador, seguirNoAutocadastro,
  type DadosDoAutocadastro,
} from '../lib/whatsapp/autocadastro-regras'
import { CAMPOS_DA_FICHA } from '../lib/rh/ficha'
import { objetoInterativo, textoParaModelo } from '../lib/whatsapp/regras'

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

// o cargo de coordenador: o toque no botão vira "Coordenador(a) de <setor>", o texto escrito vale como escrito
{
  const base: DadosDoAutocadastro = { setores, nome: 'Ana Lima', coordenacao: 'Redação' }
  const toque = seguirNoAutocadastro(base, ID_DO_CARGO_COORDENADOR)
  igual(toque.tipo === 'avancar' ? toque.dados.cargo : null, 'Coordenador(a) de Redação', 'cargo: botão Coordenador(a)')
  const livre = seguirNoAutocadastro(base, 'Enfermeira')
  igual(livre.tipo === 'avancar' ? livre.dados.cargo : null, 'Enfermeira', 'cargo: texto livre')
  const ped = perguntaDoAutocadastro({ ...base, emailPessoal: undefined, cargo: undefined, coordenacao: 'Redação' })
  contem(ped?.texto ?? '', 'Coordenador(a)', 'cargo: a pergunta oferece o botão')
  igual(ped?.interativo?.tipo === 'botoes' && ped.interativo.botoes.every((b) => b.titulo.length <= 20 && b.id.length <= 40), true, 'cargo: botões cabem na Meta')
}

// a mensagem com a senha provisória e o passo a passo (pelo WhatsApp)
const conta = textoDaContaCriada({ nome: 'Ana Lima', email: 'ana.lima@cruzvermelhariodejaneiro.org', senha: 'Tmp#Senha-9xQ' })
contem(conta, 'ana.lima@cruzvermelhariodejaneiro.org', 'conta: e-mail')
contem(conta, 'Tmp#Senha-9xQ', 'conta: senha')
contem(conta, 'Adicionar outra conta', 'conta: passo a passo no celular')
contem(conta, 'senha nova', 'conta: manda trocar a senha')
contem(conta, 'apague esta mensagem', 'conta: manda apagar a mensagem')
sem(conta, 'grupo', 'conta: sem caixa do setor, não fala em grupo nem em caixa de setor')
sem(conta, 'caixa do setor', 'conta: sem caixa do setor, não promete caixa de setor')
contem(conta, 'Seu cadastro foi aprovado, Ana', 'conta: chama pelo primeiro nome')
igual(conta.length < 4000, true, 'conta: cabe numa mensagem do WhatsApp (4096)')
contem(textoDaSegundaConfirmacao({ nome: 'Ana Lima' }), 'WhatsApp dela', 'segunda confirmação diz que a senha vai por WhatsApp')
sem(textoDaSegundaConfirmacao({ nome: 'Ana Lima' }), 'e-mail pessoal', 'segunda confirmação não fala mais em e-mail pessoal')

// o link do time e a autorização do coordenador
{
  const lista = ['Redação', 'Tecnologia da Informação']
  igual(lerAutocadastro('Quero me cadastrar em Tecnologia da Informação'), true, 'entrada com setor')
  igual(setorDaEntrada('Quero me cadastrar em Tecnologia da Informação', lista), 'Tecnologia da Informação', 'setor do link')
  igual(setorDaEntrada('quero me cadastrar em tecnologia da informacao', lista), 'Tecnologia da Informação', 'setor do link sem acento nem maiúscula')
  igual(setorDaEntrada('quero me cadastrar em Marte', lista), null, 'setor que não existe: a pessoa escolhe')
  igual(setorDaEntrada('quero me cadastrar', lista), null, 'sem setor')
  igual(linkDoBot('+55 21 99999-0000', 'Redação'), 'https://wa.me/5521999990000?text=quero%20me%20cadastrar%20em%20Reda%C3%A7%C3%A3o', 'link do time')
  contem(perguntaDoAutocadastro({ setores: lista, coordenacao: 'Redação' })?.texto ?? '', 'Seu setor: *Redação*', 'setor pré-escolhido aparece')
  igual(proximaEtapa({ setores: lista, coordenacao: 'Redação', nome: 'Ana Lima' }), 'cargo', 'com o setor do link, pula a pergunta da coordenação')
  contem(textoDoLinkDoTime([{ setor: 'Redação', link: 'https://wa.me/x' }]), 'https://wa.me/x', 'texto do link do time')
  contem(textoDoLinkDoTime([]), 'não coordena', 'quem não coordena não recebe link')
  igual([ehCoordenador('Coordenador(a) de TI'), ehCoordenador('Coordenadora'), ehCoordenador('Enfermeira'), ehCoordenador(undefined)], [true, true, false, false], 'ehCoordenador')
  const equipe: DadosDoAutocadastro = { coordenacao: 'Redação', cargo: 'Enfermeira' }
  const outroSetor: DadosDoAutocadastro = { coordenacao: 'Jurídico', cargo: 'Enfermeira' }
  const novoCoord: DadosDoAutocadastro = { coordenacao: 'Redação', cargo: 'Coordenador(a) de Redação' }
  const coord = { admin: false, setores: ['Redação'] }
  igual(podeDecidir(coord, equipe), true, 'coordenador aprova a equipe do próprio setor')
  igual(podeDecidir(coord, outroSetor), false, 'coordenador NÃO aprova outro setor')
  igual(podeDecidir(coord, novoCoord), true, 'coordenador aprova outro coordenador do próprio setor')
  igual(podeDecidir(coord, { coordenacao: 'Jurídico', cargo: 'Coordenador(a) de Jurídico' }), false, 'coordenador NÃO aprova coordenador de outro setor')
  contem(textoDaSegundaConfirmacao(novoCoord, false), 'não muda', 'coordenador aprovando coordenador: a caixa do setor não muda')
  sem(textoDaSegundaConfirmacao(novoCoord, false), 'se quem aprova é administrador', 'coordenador aprovando não vê o aviso da caixa de administrador')
  contem(textoDaSegundaConfirmacao(novoCoord), 'caixa própria', 'administrador aprovando coordenador: aviso da caixa')
  sem(textoDaSegundaConfirmacao(equipe, false), 'Cargo de coordenador', 'equipe comum: sem aviso de cargo')
  igual(podeDecidir({ admin: false, setores: [] }, equipe), false, 'sem setor nenhum não aprova nada')
  igual(podeDecidir({ admin: true, setores: [] }, novoCoord), true, 'administrador aprova qualquer pedido')
  igual(podeDecidir({ admin: false, setores: ['Redação'] }, { cargo: 'Enfermeira' }), false, 'pedido sem setor não é de coordenador')
  contem(resumoParaAprovador({ nome: 'Ana Lima', coordenacao: 'Redação', cargo: 'Coordenador(a) de Redação', emailPessoal: 'a@x.com', cidade: 'Rio', uf: 'RJ', emergenciaNome: 'Carlos', emergenciaParentesco: 'pai', emergenciaTelefone: '+5521988887777' }), 'caixa própria', 'resumo avisa que coordenador recebe a caixa própria do setor')
  sem(resumoParaAprovador({ nome: 'Ana Lima', coordenacao: 'Redação', cargo: 'Enfermeira', emailPessoal: 'a@x.com', cidade: 'Rio', uf: 'RJ', emergenciaNome: 'Carlos', emergenciaParentesco: 'pai', emergenciaTelefone: '+5521988887777' }), 'caixa própria', 'resumo comum não fala em caixa do setor')
  sem(resumoParaAprovador({ nome: 'Ana Lima', coordenacao: 'Redação', cargo: 'Coordenador(a) de Redação', emailPessoal: 'a@x.com', cidade: 'Rio', uf: 'RJ', emergenciaNome: 'Carlos', emergenciaParentesco: 'pai', emergenciaTelefone: '+5521988887777' }), 'grupo', 'resumo do coordenador não fala mais em grupo')
  sem(textoDaSegundaConfirmacao({ nome: 'Ana Lima', coordenacao: 'Redação', cargo: 'Coordenador(a) de Redação' }), 'grupo', 'segunda confirmação do coordenador não fala mais em grupo')
}

// "caixas dos setores": o comando, o botão (validade e impressão do plano), a prévia e o resultado
{
  for (const t of ['caixas dos setores', 'criar caixas dos setores', 'criar as caixas dos setores', 'apelidos', 'apelidos dos setores']) igual(ehPedidoDeCaixas(t), true, `caixas: "${t}" abre a prévia`)
  for (const t of ['caixa do setor', 'caixas', 'quero criar as caixas dos setores', 'apelido', 'caixas dos setores agora']) igual(ehPedidoDeCaixas(t), false, `caixas: "${t}" não abre a prévia`)
  const agora = Date.parse('2026-10-23T22:00:00Z')
  const sim = idDoBotaoDeCaixas('sim', 'a1b2c3d4e5f6', agora)
  igual(sim.length <= 40, true, 'caixas: o id cabe no limite da Meta')
  igual(lerBotaoDeCaixas(sim, agora), { acao: 'sim', vencido: false, assinatura: 'a1b2c3d4e5f6' }, 'caixas: o botão recém-criado vale e traz a impressão do plano')
  igual(lerBotaoDeCaixas(sim, agora + (VALIDADE_DO_BOTAO_DE_CAIXAS_MIN - 1) * 60_000)?.vencido, false, 'caixas: ainda vale perto do fim do prazo')
  igual(lerBotaoDeCaixas(sim, agora + (VALIDADE_DO_BOTAO_DE_CAIXAS_MIN + 2) * 60_000)?.vencido, true, 'caixas: botão velho NÃO cria nada')
  igual(lerBotaoDeCaixas(sim, agora - 10 * 60_000)?.vencido, true, 'caixas: id com hora do futuro não vale')
  igual(lerBotaoDeCaixas(idDoBotaoDeCaixas('nao', 'a1b2c3d4e5f6', agora), agora)?.acao, 'nao', 'caixas: o botão Não é lido')
  igual(lerBotaoDeCaixas('caixas dos setores'), null, 'caixas: texto solto não é botão')
  igual(lerBotaoDeCaixas('cx:s:'), null, 'caixas: id incompleto não é botão')
  igual(lerBotaoDeCaixas(`cx:s:${sim.split(':')[2]}`), null, 'caixas: id sem a impressão do plano não é botão (não dá para confirmar sem ela)')
  igual(lerBotaoDeCaixas('ap:s:abcd'), null, 'caixas: o botão antigo de apelidos já não faz nada')
  igual(lerBotaoDeCaixas(`${sim.split(':').slice(0, 3).join(':')}:1z141z3`), null, 'caixas: o botão do formato antigo (impressão curta em base 36) já não vale')
  igual(lerBotaoDeCaixas(`${sim.split(':').slice(0, 3).join(':')}:zzzzzzzzzzzz`), null, 'caixas: impressão que não é hexadecimal não vale')
  igual((BOTOES_DE_CAIXAS('a1b2c3d4e5f6', agora) as { botoes: { titulo: string }[] }).botoes.every((b) => b.titulo.length <= 20), true, 'caixas: títulos cabem na Meta')

  const plano = [
    { nome: 'Atendimento', endereco: 'contato@x.org', estado: 'caixa_real' as const },
    { nome: 'TI', endereco: 'ti@x.org', estado: 'apelido' as const, dono: 'contato@x.org' },
    { nome: 'Esportes', endereco: 'esportes@x.org', estado: 'livre' as const },
    { nome: 'Ouvidoria', endereco: 'ouvidoria@x.org', estado: 'grupo' as const },
  ]
  const previa = textoDaPreviaDasCaixas(plano, new Set(['ti@x.org']))
  contem(previa, 'caixa própria* de 2 setores', 'caixas: a prévia conta os setores a criar')
  contem(previa, 'TI: ti@x.org', 'caixas: a prévia lista o endereço')
  contem(previa, 'hoje apelido de contato@x.org', 'caixas: a prévia diz que o apelido é apagado e de quem era')
  contem(previa, 'Esportes: esportes@x.org', 'caixas: a prévia lista também o que está livre')
  contem(previa, 'já tem coordenador(a): recebe a senha agora', 'caixas: a prévia marca o setor que já tem coordenação')
  contem(previa, 'Já têm caixa (não mexo): Atendimento', 'caixas: a prévia diz o que fica como está (caixa real)')
  contem(previa, 'grupo do Google (não mexo): Ouvidoria', 'caixas: a prévia diz o que fica como está (grupo)')
  contem(previa, 'sem dono', 'caixas: a prévia explica que a caixa fica sem dono até a coordenação ser aprovada')
  contem(previa, '/correio', 'caixas: a prévia avisa que o Correio do Palácio deixa de ver o setor')
  contem(previa, 'apelido volta ao lugar', 'caixas: a prévia diz que o apelido volta se a caixa não nascer')
  sem(previa, 'Ouvidoria: ouvidoria@x.org', 'caixas: o grupo não aparece na lista do que será criado')
  contem(textoDaPreviaDasCaixas(plano, new Set(['ti@x.org'])), 'ninguém abre', 'caixas: a prévia avisa que o e-mail de setor sem coordenador cai numa caixa que ninguém abre')
  sem(textoDaPreviaDasCaixas(plano, new Set(['ti@x.org', 'esportes@x.org'])), 'ninguém abre', 'caixas: com todos os setores já com coordenador não há o aviso')
  sem(previa, 'Confirma?', 'caixas: a pergunta não fica na prévia (sem botão, não haveria como responder)')
  contem(textoDaPreviaDasCaixas([{ nome: 'A', endereco: 'a@x.org', estado: 'caixa_real' }]), 'Nenhum setor precisa de caixa nova', 'caixas: nada a criar')
  // com os 15 setores de verdade e nomes longos a prévia passa de 1024 caracteres: a pergunta tem de ir em mensagem própria, com os botões
  const quinze = Array.from({ length: 15 }, (_, i) => ({ nome: `Setor número ${i + 1} de teste longo`, endereco: `setor${i + 1}.cruzvermelha@cruzvermelhariodejaneiro.org`, estado: 'apelido' as const, dono: 'contato@cruzvermelhariodejaneiro.org' }))
  const previaQuinze = textoDaPreviaDasCaixas(quinze)
  igual(previaQuinze.length > 1024, true, 'caixas: (premissa) a prévia de 15 setores passa do limite de 1024 dos botões')
  igual(previaQuinze.length < 4000, true, 'caixas: a prévia de 15 setores cabe numa mensagem de texto')
  igual(objetoInterativo(PERGUNTA_DAS_CAIXAS, BOTOES_DE_CAIXAS('a1b2c3d4e5f6')) !== null, true, 'caixas: a pergunta curta mantém os botões')
  // nomes bem mais longos que os reais: a prévia e o resultado nunca passam de uma mensagem do WhatsApp (4096) e o alerta não é cortado
  const longos = Array.from({ length: 15 }, (_, i) => ({ nome: `Coordenação de Atendimento Humanitário e Apoio Psicossocial ${i + 1}`, endereco: `atendimento.humanitario.psicossocial${i + 1}@cruzvermelhariodejaneiro.org`, estado: 'apelido' as const, dono: 'contato@cruzvermelhariodejaneiro.org' }))
  const msgsPrevia = mensagensDaPreviaDasCaixas(longos)
  igual(msgsPrevia.every((m) => m.length <= 3500), true, 'caixas: cada mensagem da prévia cabe (até 3500) mesmo com nomes enormes')
  contem(msgsPrevia[msgsPrevia.length - 1], 'O que muda', 'caixas: o "O que muda" fica na última mensagem, junto da pergunta')
  const falhas15 = longos.map((x) => ({ nome: x.nome, endereco: x.endereco, resultado: 'falhou' as const, apelidoApagado: true, apelidoDevolvido: false, motivo: 'Internal error '.repeat(30) }))
  const msgsRes = mensagensDoResultadoDasCaixas(falhas15)
  igual(msgsRes.length > 1 && msgsRes.every((m) => m.length <= 3500), true, 'caixas: 15 falhas com apelido não devolvido viram várias mensagens, nenhuma passa do limite')
  igual(msgsRes.join('\n\n').split('NÃO voltou').length - 1, 15, 'caixas: nenhum alerta "NÃO voltou" se perde ao dividir')
  igual(mensagensDoResultadoDasCaixas([{ nome: 'A', endereco: 'a@x.org', resultado: 'criada', entrega: 'enviada' }, { nome: 'B', endereco: 'b@x.org', resultado: 'falhou', motivo: 'x' }])[0].startsWith('❌'), true, 'caixas: o que deu errado vem PRIMEIRO no resultado')
  igual(emMensagens(['a'.repeat(100), 'b'.repeat(100)], 150), ['a'.repeat(100), 'b'.repeat(100)], 'emMensagens: dois blocos que não cabem juntos vão em mensagens separadas')
  igual(emMensagens(['a'.repeat(50), 'b'.repeat(50)], 150), [`${'a'.repeat(50)}\n\n${'b'.repeat(50)}`], 'emMensagens: blocos que cabem juntos ficam juntos')
  igual(emMensagens([Array.from({ length: 10 }, (_, k) => `linha ${k} ${'x'.repeat(40)}`).join('\n')], 150).every((m) => m.length <= 150), true, 'emMensagens: um bloco maior que o limite é partido por linhas')
  igual(mensagensDaPreviaDasCaixas([]).length, 1, 'caixas: sem setor nenhum a prévia diz isso (não "tudo certo")')
  contem(mensagensDaPreviaDasCaixas([])[0], 'nenhum setor com endereço', 'caixas: sem setor com endereço não é "todos têm caixa"')

  const res = textoDoResultadoDasCaixas([
    { nome: 'TI', endereco: 'ti@x.org', resultado: 'criada', apelidoApagado: true, entrega: 'sem_coordenador' },
    { nome: 'Esportes', endereco: 'esportes@x.org', resultado: 'criada', entrega: 'enviada' },
    { nome: 'Jurídico', endereco: 'j@x.org', resultado: 'criada', entrega: 'na_fila' },
    { nome: 'Juventude', endereco: 'jv@x.org', resultado: 'criada', entrega: 'falhou' },
    { nome: 'GRD', endereco: 'g@x.org', resultado: 'falhou', motivo: 'erro 500', apelidoApagado: true, apelidoDevolvido: true },
    { nome: 'Parcerias', endereco: 'p@x.org', resultado: 'falhou', motivo: 'erro 500', apelidoApagado: true, apelidoDevolvido: false },
    { nome: 'Voluntariado', endereco: 'v@x.org', resultado: 'adiada' },
    { nome: 'Atendimento', endereco: 'contato@x.org', resultado: 'ja_existe' },
  ])
  contem(res, 'Caixas criadas (4)', 'caixas: o resultado conta as criadas')
  contem(res, 'TI: ti@x.org — sem dono, aguardando a coordenação', 'caixas: sem coordenador fica sem dono')
  contem(res, 'Esportes: esportes@x.org — senha enviada à coordenação', 'caixas: senha enviada à coordenação')
  contem(res, 'senha na fila do WhatsApp', 'caixas: na fila não é dito como enviada')
  contem(res, 'a senha NÃO chegou à coordenação', 'caixas: senha que não chegou é dita')
  contem(res, 'Não consegui (2)', 'caixas: o resultado conta as falhas')
  contem(res, 'o apelido voltou ao lugar', 'caixas: diz quando o apelido voltou')
  contem(res, 'o apelido foi apagado e NÃO voltou', 'caixas: diz quando o apelido NÃO voltou')
  contem(res, 'Voluntariado', 'caixas: lista o que não deu tempo')
  const res2 = textoDoResultadoDasCaixas([
    { nome: 'TI', endereco: 'ti@x.org', resultado: 'criada', entrega: 'sem_coordenador', registro: 'falhou' },
    { nome: 'GRD', endereco: 'g@x.org', resultado: 'falhou', incerto: true, motivo: 'o Google não respondeu ao apagar o apelido' },
    { nome: 'Jurídico', endereco: 'j@x.org', resultado: 'adiada', motivo: 'parei: o Google recusou a criação (Not Authorized) e o mesmo vale para os outros setores' },
  ])
  contem(res2, 'NÃO ficou registrada', 'caixas: caixa criada sem registro no banco é dita, nunca em silêncio')
  contem(res2, 'confira este endereço no Admin do Google', 'caixas: estado incerto manda conferir o endereço antes de tentar de novo')
  contem(res2, 'parei: o Google recusou a criação', 'caixas: o adiado diz por que o lote parou')
  contem(textoDoResultadoDasCaixas([{ nome: 'TI', endereco: 'ti@x.org', resultado: 'criada', entrega: 'falhou' }]), 'caixa do setor: <nome>', 'caixas: senha que não chegou manda reenviar pelo comando de um setor')
  contem(res, 'Já tinham caixa (1): Atendimento', 'caixas: lista o que já tinha caixa')
  contem(res, 'a caixa é entregue a ela, com senha nova', 'caixas: o próximo passo é a aprovação da coordenação (nada à mão)')
  sem(res, 'Senha#', 'caixas: o resultado nunca leva senha')
  const senhaDaCaixa = textoDaSenhaDaCaixa({ setor: 'TI', email: 'ti@x.org', senha: 'Setor#Senha-7' })
  contem(senhaDaCaixa, 'ti@x.org', 'caixas: a mensagem da senha traz o endereço')
  contem(senhaDaCaixa, 'Setor#Senha-7', 'caixas: a mensagem da senha traz a senha')
  contem(senhaDaCaixa, 'apague esta mensagem', 'caixas: a mensagem da senha manda apagá-la')
}

// a caixa própria do setor na mensagem de boas-vindas e o comando
{
  const caixa = { nome: 'Comunicação Social', email: 'comunicacao@x.org', senha: 'Setor#Senha-7' }
  const com = textoDaContaCriada({ nome: 'Ana Lima', email: 'ana.lima@x.org', senha: 'Pessoal#1', caixaDoSetor: caixa })
  contem(com, 'comunicacao@x.org', 'boas-vindas: endereço da caixa do setor')
  contem(com, 'Setor#Senha-7', 'boas-vindas: senha da caixa do setor')
  contem(com, 'Pessoal#1', 'boas-vindas: senha pessoal continua')
  contem(com, 'Cada caixa é uma conta separada', 'boas-vindas: explica que são duas contas')
  contem(com, '6. Pronto', 'boas-vindas: a numeração acompanha a caixa do setor')
  igual(com.length < 4000, true, 'boas-vindas: duas caixas ainda cabem numa mensagem do WhatsApp')
  // fora da janela de 24 h o texto vai por modelo da Meta, que corta em 1000: perde-se o fim do passo a passo, nunca o aviso nem as senhas
  // com nomes e endereços do tamanho dos reais (o setor de nome mais longo, uma pessoa de nome composto), para o corte acontecer de verdade
  const longa = textoDaContaCriada({
    nome: 'Maria Fernanda Albuquerque de Souza', email: 'maria.albuquerque@cruzvermelhariodejaneiro.org', senha: 'Tmp#Senha-9xQkLm2',
    caixaDoSetor: { nome: 'Psicologia / Serviço Social', email: 'psicologia@cruzvermelhariodejaneiro.org', senha: 'Tmp#Senha-7abCdEf1' },
  })
  igual(textoParaModelo(longa).length, 1000, 'boas-vindas: (premissa) o texto com duas caixas passa do corte de 1000 do modelo')
  const pelaModelo = textoParaModelo(longa)
  contem(pelaModelo, 'Tmp#Senha-9xQkLm2', 'boas-vindas: a senha pessoal sobrevive ao corte do modelo')
  contem(pelaModelo, 'Tmp#Senha-7abCdEf1', 'boas-vindas: a senha da caixa do setor sobrevive ao corte do modelo')
  contem(pelaModelo, 'nem por ligação', 'boas-vindas: o aviso de apagar a mensagem sobrevive inteiro ao corte do modelo')
  igual(lerCaixaDoSetor('Caixa do setor: Comunicação Social'), 'comunicacao social', 'comando: lê o setor')
  igual(lerCaixaDoSetor('caixa do setor educacao e saude'), null, 'comando: sem dois-pontos não cria conta')
  igual(lerCaixaDoSetor('caixa do setor de comunicação está recebendo e-mail?'), null, 'comando: pergunta solta não vira criação de conta')
  igual(lerCaixaDoSetor('caixa do setor:'), null, 'comando: sem nome não é comando')
  igual(lerCaixaDoSetor('  CAIXA  DO  SETOR :  Educação e Saúde  '), 'educacao e saude', 'comando: espaços e caixa alta não atrapalham')
  igual(lerCaixaDoSetor('caixa'), null, 'comando: só a palavra não é comando')
  igual(lerCaixaDoSetor('quero a caixa do setor'), null, 'comando: frase solta não é comando')
  const lista = ['Comunicação Social', 'Educação e Saúde', 'Esportes', 'Psicologia / Serviço Social']
  igual(setorDoPedido('comunicacao social', lista), 'Comunicação Social', 'comando: setor exato')
  igual(setorDoPedido('psicologia', lista), null, 'comando: pedaço do nome não escolhe setor (cria conta de verdade)')
  igual(setorDoPedido(lerCaixaDoSetor('caixa do setor: Psicologia / Serviço Social') ?? '', lista), 'Psicologia / Serviço Social', 'comando: o nome inteiro, com a barra, acha o setor')
  igual(setorDoPedido('e', lista), null, 'comando: começo ambíguo não escolhe')
  igual(setorDoPedido('marte', lista), null, 'comando: setor que não existe')
}

// "acompanhamento": o andamento do cadastro por setor
{
  for (const t of ['acompanhamento', 'andamento', 'quem falta', 'quem ja se cadastrou']) igual(ehPedidoDeAcompanhamento(t), true, `acompanhamento: "${t}" abre o andamento`)
  for (const t of ['cadastros', 'acompanhar', 'quem falta cadastrar hoje']) igual(ehPedidoDeAcompanhamento(t), false, `acompanhamento: "${t}" não abre`)
  const base = { aguardando: 0, pessoas: 0, comEmail: 0 }
  const msgs = mensagensDoAcompanhamento([
    { setor: 'Comunicação Social', coordenacao: 'cadastrada', caixa: 'entregue', pessoas: 5, comEmail: 4, aguardando: 1 },
    { setor: 'Jurídico', coordenacao: 'nenhuma', caixa: 'sem_dono', ...base },
    { setor: 'Esportes', coordenacao: 'aguardando', caixa: 'sem_dono', ...base, aguardando: 1 },
    { setor: 'Atendimento', coordenacao: 'cadastrada', caixa: 'nao_nossa', ...base },
  ]).join('\n\n')
  contem(msgs, 'Coordenações cadastradas: *2 de 4* (+1 aguardando aprovação)', 'acompanhamento: o resumo conta as coordenações')
  contem(msgs, 'Pessoas com e-mail institucional: *4 de 5*', 'acompanhamento: o resumo conta as pessoas com e-mail')
  contem(msgs, 'Pedidos esperando aprovação: *2*', 'acompanhamento: o resumo conta os pedidos esperando')
  contem(msgs, '❌ *Ainda sem coordenação cadastrada (1):*\n• Jurídico', 'acompanhamento: o que falta vem listado')
  contem(msgs, 'Comunicação Social* — caixa do setor ✅ entregue · pessoas com e-mail 4/5 · 1 aguardando aprovação', 'acompanhamento: linha do setor com coordenação')
  contem(msgs, 'Atendimento* — caixa do setor ➖ já existia', 'acompanhamento: o contato@ aparece como já existente')
  igual(msgs.indexOf('Ainda sem coordenação') < msgs.indexOf('Coordenação cadastrada'), true, 'acompanhamento: o que falta vem antes do que está pronto')
  const quinze = Array.from({ length: 15 }, (_, i) => ({ setor: `Coordenação de Atendimento Humanitário e Apoio ${i + 1}`, coordenacao: 'cadastrada' as const, caixa: 'sem_dono' as const, pessoas: 20, comEmail: 7, aguardando: 3 }))
  igual(mensagensDoAcompanhamento(quinze).every((m) => m.length <= 3500), true, 'acompanhamento: nenhuma mensagem passa do limite')
  igual(mensagensDoAcompanhamento([])[0], 'Não achei nenhum setor para acompanhar.', 'acompanhamento: sem setor, diz isso')
}

console.log(falhas ? `${falhas} falha(s).` : 'Tudo certo.')
process.exit(falhas ? 1 : 0)
