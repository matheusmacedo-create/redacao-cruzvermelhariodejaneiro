/**
 * Confere o cadastro de colaborador pelo WhatsApp: `npx tsx scripts/conferir-colaborador.ts`.
 *
 *  - o comando (lerColaborador, lerPedido): "colaborador: Nome", "novo colaborador", "cadastrar colaborador", só de
 *    quem gerencia usuários, e o que não é cadastro;
 *  - as etapas puras (lib/whatsapp/colaborador-regras.ts): o nome, o "é esta pessoa?" (homônimo sem acesso) e o
 *    "já tem conta" (para, sem duplicar), o e-mail (formato), o WhatsApp (canônico), nenhum canal, a coordenação
 *    (número, nome, "Sem coordenação", "Usar o da ficha"), o cargo (Pular), o papel (o sugerido, administrador
 *    recusado), o pedido da ficha (só com WhatsApp), o "não" que responde e o "cancelar" que desiste, os botões, o
 *    recibo e o resumo mascarados, os dados do link (o contato só nas chaves que o banco tira) e a faxina;
 *  - o servidor (lib/whatsapp/colaborador.ts) contra um banco de mentira, sem rede: quem não gerencia usuários, a
 *    verificação em duas etapas, a conversa inteira até o link (nada criado: nenhuma conta, só o link), o e-mail em
 *    uso, quem já tem conta, a ficha reaproveitada com o contato lido dela, e a pergunta recusada antes da migração;
 *  - a confirmação no Palácio: o link lido de volta (pedidoDoLink), o usuário e o papel que dá para mudar
 *    (conferirAjustes: administrador recusado) e, contra um banco de mentira, a tela (o resumo mascarado, o usuário
 *    sugerido ainda livre), as conferências antes de gastar o link (usuário em uso, ficha já ligada, e-mail em uso,
 *    nenhum canal, quem não gerencia usuários) e a execução pelo núcleo de "Adicionar pessoas" (a conta pela sessão,
 *    a auditoria com a origem, o sino de quem pediu, o resultado mascarado e honesto sobre o convite);
 *  - o código: as regras são puras, o bot e as ações ligam o comando e a pendência, a página de confirmar nunca
 *    cai no ramo de desativar conta, o menu e o assistente ensinam o "colaborador:".
 * Sai com código 1 se algo estiver errado.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Module from 'node:module'
import {
  BOTOES_DA_FICHA, BOTOES_DE_QUEM_E, CHAVES_DO_CONTATO_NA_CONVERSA, PAPEIS_DA_CONFIRMACAO, conferirAjustes, pedidoDoLink, textoDoCadastroNaoFeito, ETAPAS_DO_CADASTRO_DE_TEXTO_LIVRE, ETAPAS_DO_CADASTRO_EM_QUE_NAO_RESPONDE, TEXTO_DO_NUMERO_EM_USO,
  dadosDoLink, dadosDoLinkRedigidos, dadosRedigidos, nomeDoColaborador, oQueDoCadastro, ordemDosPapeis, papelDoCadastro, pedidoDoCadastro, perguntaDoCadastro,
  proximaEtapa, quemTemONome, reciboDoPasso, resultadoDaBuscaNaEquipe, seguirNoCadastro, textoDeQuemJaTemConta,
  type CandidatoDaEquipe, type DadosDoCadastro, type PessoaNaBusca,
} from '../lib/whatsapp/colaborador-regras'
import { CHAVES_DE_CONTATO, conferirCadastro } from '../lib/contas/cadastro-regras'
import { LINHA_DO_CADASTRO, lerColaborador, lerPedido, textoDoMenu } from '../lib/whatsapp/regras'

let falhas = 0
function igual<T>(obtido: T, esperado: T, caso: string) {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) { falhas++; console.log(`FALHOU: ${caso}\n  esperado ${JSON.stringify(esperado)}\n  obtido   ${JSON.stringify(obtido)}`) }
}
const contem = (texto: string, trecho: string, caso: string) => { if (!String(texto).includes(trecho)) { falhas++; console.log(`FALHOU: ${caso}\n  sem "${trecho}" em ${JSON.stringify(texto)}`) } }
const naoContem = (texto: string, trecho: string, caso: string) => { if (String(texto).includes(trecho)) { falhas++; console.log(`FALHOU: ${caso}\n  com "${trecho}" em ${JSON.stringify(texto)}`) } }

const BASE = 'https://palacio.exemplo.org'
const FICHA = '00000000-0000-4000-8000-0000000000f1'
const SETORES = ['Comunicação Social', 'Voluntariado', 'Tecnologia da Informação']
const MUITOS = ['Diretoria', 'Jurídico', 'Comunicação Social', 'Tecnologia da Informação', 'Humanitário', 'Educação e Saúde', 'Primeiros Socorros', 'GRD', 'Voluntariado', 'Juventude', 'Esportes']
const inicio = (m: Partial<DadosDoCadastro> = {}): DadosDoCadastro => ({ setores: SETORES, canais: { whatsapp: true, email: true }, ...m })

// ------------------------------------------------------------------ o comando

igual(lerColaborador('colaborador: Ana Lima'), 'Ana Lima', 'comando: "colaborador:" e o nome')
igual(lerColaborador('Colaboradora: Ana Lima'), 'Ana Lima', 'comando: no feminino')
igual(lerColaborador('novo colaborador Ana Lima'), 'Ana Lima', 'comando: "novo colaborador" sem os dois-pontos')
igual(lerColaborador('cadastrar colaborador: *Ana* Lima'), 'Ana Lima', 'comando: "cadastrar colaborador", sem a formatação')
igual(lerColaborador('cadastrar uma nova colaboradora'), '', 'comando: sem o nome (o bot pergunta)')
igual(lerColaborador('colaborador'), '', 'comando: "colaborador" sozinho')
igual(lerColaborador('colaborador do mês saiu?'), null, 'comando: "colaborador" no meio de uma frase não é cadastro')
igual(lerColaborador('colaboradores da TI'), null, 'comando: "colaboradores" não é cadastro')
igual(lerPedido('colaborador: Ana Lima', { pausado: false, usuarios: true }), { comando: 'cadastrar_colaborador', resto: 'Ana Lima' }, 'comando: quem gerencia usuários')
igual(lerPedido('colaborador: Ana Lima', { pausado: false, usuarios: true, assistente: true }).comando, 'cadastrar_colaborador', 'comando: vale também com o assistente ligado')
igual(lerPedido('colaborador: Ana Lima', { pausado: false }).comando, 'desconhecido', 'comando: para os outros, não é comando')
igual(lerPedido('desativar conta: Ana Lima', { pausado: false, usuarios: true }).comando, 'desativar_conta', 'comando: o "desativar conta:" continua o mesmo')

// ------------------------------------------------------------------ o nome

igual(nomeDoColaborador('  Ana   Paula Lima '), 'Ana Paula Lima', 'nome: espaços sobrando')
igual(nomeDoColaborador('Ana'), null, 'nome: sem sobrenome não serve')
igual(nomeDoColaborador('chegou hoje, como faço?'), null, 'nome: pergunta não vira nome')
igual(nomeDoColaborador('Ana 2 Lima'), null, 'nome: com número não serve')
igual(nomeDoColaborador("Joana D'Ávila-Souza"), "Joana D'Ávila-Souza", 'nome: apóstrofo e hífen valem')

// ------------------------------------------------------------------ quem já está na equipe

const pessoas: PessoaNaBusca[] = [
  { origem: 'conta', nome: 'Bruno Costa', usuario: 'bruno.costa', acesso: 'ativo', fichaId: null, setor: 'Voluntariado', cargo: null },
  { origem: 'conta', nome: 'Carla Dias', usuario: 'carla.dias', acesso: 'desativado', fichaId: null, setor: null, cargo: null },
  { origem: 'ficha', nome: 'Ana Paula Lima', acesso: 'sem_acesso', fichaId: FICHA, setor: 'Voluntariado', cargo: 'Assistente', temEmail: true, temWhatsapp: false },
  { origem: 'lista', nome: 'Ana Lima Souza', acesso: 'sem_acesso', fichaId: null, setor: 'Juventude', cargo: null },
]
const comConta = quemTemONome(pessoas, 'bruno   COSTA')
igual([comConta.comConta.map((p) => p.usuario), comConta.semAcesso.length], [['bruno.costa'], 0], 'homônimo com conta: o nome igual (sem caixa) acha')
igual(quemTemONome(pessoas, 'Bruno Cost').comConta.length, 0, 'homônimo com conta: só o nome igual para o cadastro')
const semAcesso = quemTemONome(pessoas, 'Ana Lima')
igual(semAcesso.semAcesso.map((c) => [c.nome, c.fichaId]), [['Ana Paula Lima', FICHA], ['Ana Lima Souza', null]], 'homônimo sem acesso: ficha do RH e lista oficial, pelo começo das palavras')
const parou = resultadoDaBuscaNaEquipe(inicio({ nome: 'Bruno Costa' }), comConta, BASE)
contem('parar' in parou ? parou.parar : '', '@bruno.costa', 'já tem conta: o aviso diz o usuário')
contem('parar' in parou ? parou.parar : '', 'para não duplicar', 'já tem conta: o cadastro para')
contem(textoDeQuemJaTemConta([pessoas[1]], BASE), `${BASE}/usuarios`, 'conta desativada: o caminho para reativar')
const novo = resultadoDaBuscaNaEquipe(inicio({ nome: 'Pedro Alves' }), { comConta: [], semAcesso: [] }, BASE)
igual('dados' in novo ? [novo.dados.daEquipe, proximaEtapa(novo.dados)] : null, [null, 'email'], 'pessoa nova: sem "é esta pessoa?", vai ao e-mail')
const comCandidatos = resultadoDaBuscaNaEquipe(inicio({ nome: 'Ana Lima' }), semAcesso, BASE)
const dQuem = 'dados' in comCandidatos ? { ...comCandidatos.dados, etapa: 'quem_e' as const } : inicio()
igual(proximaEtapa(dQuem), 'quem_e', 'homônimo sem acesso: pergunta se é a pessoa')
const pQuem = perguntaDoCadastro(dQuem)
igual(pQuem?.interativo?.tipo === 'lista' ? pQuem.interativo.secoes[0].linhas.map((l) => l.id) : null, ['1', '2', 'outra pessoa'], 'é esta pessoa (várias): a lista com "Outra pessoa"')
const escolheu = seguirNoCadastro(dQuem, '1')
igual(escolheu.tipo === 'seguir' ? [escolheu.dados.nome, escolheu.dados.daEquipe?.fichaId, proximaEtapa(escolheu.dados)] : null, ['Ana Paula Lima', FICHA, 'email'], 'é esta pessoa: a ficha é reaproveitada, com o nome do RH')
const outra = seguirNoCadastro(dQuem, 'outra pessoa')
igual(outra.tipo === 'seguir' ? [outra.dados.daEquipe, outra.dados.nome] : null, [null, 'Ana Lima'], 'outra pessoa: segue como pessoa nova, com o nome escrito')
const umSo: DadosDoCadastro = { ...inicio({ nome: 'Ana Paula Lima' }), etapa: 'quem_e', candidatos: [semAcesso.semAcesso[0]] }
igual(perguntaDoCadastro(umSo)?.interativo, BOTOES_DE_QUEM_E, 'é esta pessoa (uma só): os botões')
igual(seguirNoCadastro(umSo, 'sim').tipo, 'seguir', 'é esta pessoa (uma só): "sim" escolhe')
igual(seguirNoCadastro(umSo, 'não').tipo === 'seguir' && (seguirNoCadastro(umSo, 'não') as { dados: DadosDoCadastro }).dados.daEquipe, null, 'é esta pessoa: "não" é outra pessoa, não desiste')
igual(seguirNoCadastro(umSo, 'talvez').tipo, 'repetir', 'é esta pessoa: o resto pede de novo')

// ------------------------------------------------------------------ e-mail, WhatsApp e nenhum canal

const daFicha = semAcesso.semAcesso[0] as CandidatoDaEquipe
const dEmail: DadosDoCadastro = { ...inicio({ nome: 'Ana Paula Lima', daEquipe: daFicha }), etapa: 'email' }
const pEmail = perguntaDoCadastro(dEmail)
igual(pEmail?.interativo?.tipo === 'botoes' ? pEmail.interativo.botoes.map((b) => b.titulo) : null, ['Usar o da ficha', 'Pular', 'Cancelar'], 'e-mail: com e-mail na ficha, "Usar o da ficha"')
igual(seguirNoCadastro(dEmail, 'usar o da ficha'), { tipo: 'da_ficha', campo: 'email' }, 'e-mail: "usar o da ficha" lê da ficha (o valor nunca ficou na pendência)')
const comEmail = seguirNoCadastro(dEmail, ' Ana.Lima@Gmail.com ')
igual(comEmail.tipo === 'seguir' ? [comEmail.dados.email, comEmail.conferir] : null, ['ana.lima@gmail.com', 'email'], 'e-mail: minúsculo, e o servidor confere se está em uso')
igual(seguirNoCadastro(dEmail, 'ana@'), { tipo: 'repetir', texto: 'Não entendi o e-mail. Escreva só o endereço (ex.: _ana.lima@gmail.com_), ou *pular*.', sempre: true }, 'e-mail inválido: pede de novo (tentativa clara)')
igual(seguirNoCadastro(dEmail, 'ana.lima@usuarios.cvrj.local').tipo, 'repetir', 'e-mail: o interno de login não serve')
const semEmail = seguirNoCadastro(dEmail, 'pular')
igual(semEmail.tipo === 'seguir' ? semEmail.dados.email : null, '', 'e-mail: "pular"')
const dZap: DadosDoCadastro = { ...dEmail, email: '', etapa: 'whatsapp' }
igual(perguntaDoCadastro(dZap)?.interativo, null, 'WhatsApp sem e-mail e sem celular na ficha: sem "Pular"')
const nenhum = seguirNoCadastro(dZap, 'pular')
igual(nenhum.tipo === 'repetir' ? [nenhum.sempre, nenhum.texto.startsWith('Sem e-mail e sem WhatsApp')] : null, [true, true], 'nenhum canal: não segue')
const emailNoZap = seguirNoCadastro(dZap, 'ana@exemplo.org')
igual(emailNoZap.tipo === 'seguir' ? [emailNoZap.dados.email, emailNoZap.dados.whatsapp, proximaEtapa(emailNoZap.dados)] : null, ['ana@exemplo.org', undefined, 'whatsapp'], 'sem e-mail: o endereço escrito na pergunta do WhatsApp vale, e ela volta')
const zap = seguirNoCadastro(dZap, '(21) 98765-4321')
igual(zap.tipo === 'seguir' ? [zap.dados.whatsapp, zap.conferir] : null, ['5521987654321', 'whatsapp'], 'WhatsApp: canônico, e o servidor confere se já está ligado a outra conta')
igual(seguirNoCadastro(dZap, '1234567').tipo === 'repetir' && (seguirNoCadastro(dZap, '1234567') as { sempre?: boolean }).sempre, true, 'WhatsApp inválido: pede de novo')
const dZapComEmail: DadosDoCadastro = { ...dZap, email: 'ana@exemplo.org' }
igual(seguirNoCadastro(dZapComEmail, 'não').tipo === 'seguir' && (seguirNoCadastro(dZapComEmail, 'não') as { dados: DadosDoCadastro }).dados.whatsapp, '', 'WhatsApp: com e-mail, "não" pula')
const semEnvioDeEmail = seguirNoCadastro({ ...dZapComEmail, canais: { whatsapp: true, email: false } }, 'pular')
igual(semEnvioDeEmail.tipo === 'repetir' && semEnvioDeEmail.texto.startsWith('O envio de e-mail do Palácio não está configurado'), true, 'só e-mail sem o envio configurado: pede o WhatsApp')

// ------------------------------------------------------------------ coordenação, cargo, papel e ficha

const dCoord: DadosDoCadastro = { ...dZapComEmail, whatsapp: '5521987654321', etapa: 'coordenacao' }
const pCoord = perguntaDoCadastro(dCoord)
igual(pCoord?.interativo?.tipo === 'lista' ? pCoord.interativo.secoes[0].linhas.map((l) => l.id) : null, ['1', '2', '3', 'sem coordenacao'], 'coordenação: a lista oficial e "Sem coordenação"')
const pMuitos = perguntaDoCadastro({ ...dCoord, setores: MUITOS })
igual(pMuitos?.interativo?.tipo === 'botoes' ? pMuitos.interativo.botoes.map((b) => b.titulo) : null, ['Usar o da ficha', 'Sem coordenação', 'Cancelar'], 'coordenação: com mais do que cabe na lista, o texto numerado e os botões')
contem(pMuitos?.texto ?? '', '*11* – Esportes', 'coordenação: a lista longa vai no texto')
const porNumero = seguirNoCadastro(dCoord, '2')
igual(porNumero.tipo === 'seguir' ? porNumero.dados.coordenacao : null, 'Voluntariado', 'coordenação: pelo número')
const porNome = seguirNoCadastro(dCoord, 'tecnologia')
igual(porNome.tipo === 'seguir' ? porNome.dados.coordenacao : null, 'Tecnologia da Informação', 'coordenação: pelo nome')
const semCoord = seguirNoCadastro(dCoord, 'sem coordenação')
igual(semCoord.tipo === 'seguir' ? semCoord.dados.coordenacao : null, '', 'coordenação: "Sem coordenação" vale')
const daFichaCoord = seguirNoCadastro(dCoord, 'usar o da ficha')
igual(daFichaCoord.tipo === 'seguir' ? daFichaCoord.dados.coordenacao : null, 'Voluntariado', 'coordenação: "Usar o da ficha"')
igual(seguirNoCadastro(dCoord, '9').tipo, 'repetir', 'coordenação: número fora da lista')

const dCargo: DadosDoCadastro = { ...dCoord, coordenacao: 'Voluntariado', etapa: 'cargo' }
const pCargo = seguirNoCadastro(dCargo, 'pular')
igual(pCargo.tipo === 'seguir' ? pCargo.dados.cargo : null, '', 'cargo: "pular"')
const cargoFicha = seguirNoCadastro(dCargo, 'usar o da ficha')
igual(cargoFicha.tipo === 'seguir' ? cargoFicha.dados.cargo : null, 'Assistente', 'cargo: "Usar o da ficha"')
const cargoEscrito = seguirNoCadastro(dCargo, 'Assistente *administrativo*')
igual(cargoEscrito.tipo === 'seguir' ? cargoEscrito.dados.cargo : null, 'Assistente administrativo', 'cargo: escrito, sem a formatação')

const dPapel: DadosDoCadastro = { ...dCargo, cargo: '', etapa: 'papel' }
igual(papelDoCadastro({ coordenacao: 'Comunicação Social' }), 'editor', 'papel: o sugerido pelo setor')
igual(papelDoCadastro({ coordenacao: '' }), 'colaborador', 'papel: sem coordenação, colaborador')
igual(ordemDosPapeis('editor'), ['editor', 'colaborador', 'escola'], 'papel: o sugerido primeiro, nunca administrador')
const pPapel = perguntaDoCadastro(dPapel)
igual(pPapel?.interativo?.tipo === 'botoes' ? pPapel.interativo.botoes.map((b) => [b.id, b.titulo]) : null, [['colaborador', 'Colaborador'], ['editor', 'Editor'], ['equipe da escola', 'Equipe da escola']], 'papel: os três botões')
naoContem(JSON.stringify(pPapel?.interativo), 'dmin', 'papel: administrador não é botão')
const admin = seguirNoCadastro(dPapel, 'administrador')
igual(admin.tipo === 'repetir' ? [admin.sempre, admin.texto.startsWith('Administrador só se dá pela tela')] : null, [true, true], 'papel: administrador recusado pelo WhatsApp')
const manter = seguirNoCadastro(dPapel, 'manter')
igual(manter.tipo === 'seguir' ? manter.dados.papel : null, 'colaborador', 'papel: "manter" é o sugerido')
const editor = seguirNoCadastro(dPapel, 'equipe da escola')
igual(editor.tipo === 'seguir' ? editor.dados.papel : null, 'escola', 'papel: pelo nome do botão')

const dFicha: DadosDoCadastro = { ...dPapel, papel: 'colaborador', etapa: 'ficha' }
igual(proximaEtapa(dFicha), 'ficha', 'ficha: com WhatsApp, pergunta o pedido da ficha')
igual(perguntaDoCadastro(dFicha)?.interativo, BOTOES_DA_FICHA, 'ficha: Sim/Não/Cancelar')
igual(proximaEtapa({ ...dFicha, whatsapp: '' }), 'pronto', 'ficha: sem WhatsApp, não pergunta')
igual(proximaEtapa({ ...dFicha, canais: { whatsapp: false, email: true } }), 'pronto', 'ficha: sem o WhatsApp do Palácio, não pergunta')
const pedeFicha = seguirNoCadastro(dFicha, 'pedir a ficha')
igual(pedeFicha.tipo === 'seguir' ? [pedeFicha.dados.pedirFicha, proximaEtapa(pedeFicha.dados)] : null, [true, 'pronto'], 'ficha: "Sim" e vem o resumo')
const semFicha = seguirNoCadastro(dFicha, 'não')
igual(semFicha.tipo === 'seguir' ? semFicha.dados.pedirFicha : null, false, 'ficha: "não" responde, não desiste')

// O "não" que responde e o "cancelar" que desiste (lib/whatsapp/acoes.ts, seguirPendencia).
igual([...ETAPAS_DO_CADASTRO_EM_QUE_NAO_RESPONDE].sort(), ['cargo', 'email', 'ficha', 'quem_e', 'whatsapp'], 'etapas em que "não" responde (na coordenação e no papel, "não" desiste)')
igual([...ETAPAS_DO_CADASTRO_DE_TEXTO_LIVRE].sort(), ['cargo', 'coordenacao', 'email', 'nome', 'whatsapp'], 'etapas de texto livre')
igual(seguirNoCadastro({ etapa: 'nome', ...inicio() }, 'colaborador: Ana Lima'), { tipo: 'buscar', dados: { etapa: 'nome', ...inicio(), nome: 'Ana Lima' } }, 'nome: "colaborador: Ana Lima" respondendo ao nome')
igual(seguirNoCadastro({ ...inicio(), etapa: 'nome' }, 'Ana').tipo, 'repetir', 'nome: sem sobrenome pede de novo')
igual(seguirNoCadastro({ ...inicio(), etapa: 'qualquer' as never }, 'x').tipo, 'perdido', 'etapa desconhecida: perdido')

// ------------------------------------------------------------------ recibo, resumo e o link (mascarados)

const recibo = reciboDoPasso(dZapComEmail, { ...dZapComEmail, whatsapp: '5521987654321', numeroEmUso: true }) ?? ''
contem(recibo, 'WhatsApp anotado: +55 21 9••••-4321 ✓', 'recibo: o número mascarado')
contem(recibo, TEXTO_DO_NUMERO_EM_USO, 'recibo: o aviso do número ligado a outra conta')
naoContem(recibo, '98765', 'recibo: o número inteiro não aparece')
contem(reciboDoPasso(dEmail, { ...dEmail, email: 'ana.lima@gmail.com' }) ?? '', 'a•••a@gmail.com', 'recibo: o e-mail mascarado')

const final: DadosDoCadastro = { ...dFicha, pedirFicha: true }
const pedido = pedidoDoCadastro(final)
igual(pedido, {
  nome: 'Ana Paula Lima', email: 'ana@exemplo.org', whatsapp: '5521987654321', papel: 'colaborador', coordenacao: 'Voluntariado', cargo: '', fichaId: FICHA, pedirFicha: true,
}, 'pedido: os campos de "Adicionar pessoas", com a ficha reaproveitada')
igual(pedidoDoCadastro({ ...final, daEquipe: null }).criarFicha, true, 'pedido: pessoa nova ganha a ficha do RH')
igual(pedidoDoCadastro({ ...final, whatsapp: '' }).pedirFicha, false, 'pedido: sem WhatsApp, sem o pedido da ficha')
const conferido = conferirCadastro(pedido, { setores: SETORES, canais: { whatsapp: true, email: true }, semAdmin: true })
igual(conferido.ok, true, 'pedido: passa nas regras da tela')
igual(conferirCadastro({ ...pedido, papel: 'admin' }, { setores: SETORES, canais: { whatsapp: true, email: true }, semAdmin: true }).ok, false, 'pedido: administrador recusado também no fim')
const resumo = conferido.ok ? oQueDoCadastro({ ...conferido.cadastro, usuario: 'ana.lima' }, { numeroEmUso: true }) : ''
for (const t of ['Nada foi criado ainda', '@ana.lima', 'sugerido; dá para mudar no Palácio', 'a•••a@exemplo.org', '+55 21 9••••-4321', 'Voluntariado', 'Colaborador', 'a que já existe, ligada ao acesso', 'pedido na mesma mensagem do WhatsApp', TEXTO_DO_NUMERO_EM_USO]) {
  contem(resumo, t, `resumo: ${t}`)
}
for (const t of ['ana@exemplo.org', '98765-4321', '5521987654321']) naoContem(resumo, t, `resumo: sem o contato inteiro (${t})`)
const semCoordResumo = conferirCadastro({ ...pedido, coordenacao: '', email: '', pedirFicha: false }, { setores: SETORES, canais: { whatsapp: true, email: true } })
const resumo2 = semCoordResumo.ok ? oQueDoCadastro({ ...semCoordResumo.cadastro, usuario: 'ana.lima2' }) : ''
contem(resumo2, 'Sem coordenação', 'resumo: sem coordenação')
contem(resumo2, 'Sem e-mail, o convite depende só do WhatsApp', 'resumo: sem e-mail, o aviso honesto')

const dadosLink = dadosDoLink(pedido, { usuario: 'ana.lima', numeroEmUso: true })
igual(Object.keys(dadosLink).sort(), ['cargo', 'coordenacao', 'criarFicha', 'email', 'fichaId', 'nome', 'numeroEmUso', 'papel', 'pedirFicha', 'usuario', 'whatsapp'], 'link: os dados do pedido')
igual(Object.keys(dadosDoLink({ ...pedido, email: '' }, { usuario: 'x' })).includes('email'), false, 'link: sem e-mail, nem a chave')
igual([...CHAVES_DO_CONTATO_NA_CONVERSA], [...CHAVES_DE_CONTATO], 'contato: as mesmas chaves que o banco tira')
const redigidoLink = dadosDoLinkRedigidos(dadosLink)
igual([redigidoLink.email, redigidoLink.whatsapp, redigidoLink.redigida, redigidoLink.nome], [undefined, undefined, true, 'Ana Paula Lima'], 'faxina: o link vencido perde só o contato')
igual(dadosRedigidos({ ...final, etapa: 'ficha' }), { etapa: 'ficha', redigida: true }, 'faxina: a pergunta que acabou fica só com a etapa')

// O menu de quem gerencia usuários ensina o "colaborador:", e cabe no corpo da lista.
const menu = textoDoMenu({ nome: 'Matheus', pausado: false, urlBase: BASE, admin: true, usuarios: true, portaria: true, financeiro: true, presenca: true, frota: 'operar', estoque: true, atende: true, assistente: true })
contem(menu, LINHA_DO_CADASTRO, 'menu: a linha do cadastro para quem gerencia usuários')
igual(menu.length <= 1024, true, 'menu: cabe no corpo da lista (1024)')
naoContem(textoDoMenu({ nome: 'Ana', pausado: false, urlBase: BASE }), 'colaborador:', 'menu: para os outros, sem a linha')

// ------------------------------------------------------------------ a confirmação no Palácio (regras)

{
  const pedido = pedidoDoCadastro(inicio({ nome: 'Ana Lima', email: 'ana.lima@exemplo.org', whatsapp: '5521987654321', coordenacao: 'Voluntariado', cargo: 'Assistente', papel: 'editor', pedirFicha: true }))
  const volta = pedidoDoLink(dadosDoLink(pedido, { usuario: 'ana.lima', numeroEmUso: true }))
  igual(volta, { pedido, usuario: 'ana.lima', numeroEmUso: true }, 'confirmação: o link lido de volta é o pedido gravado')
  const comFicha = pedidoDoCadastro(inicio({ nome: 'Ana Lima', email: 'a@exemplo.org', daEquipe: { nome: 'Ana Lima', fichaId: FICHA } as CandidatoDaEquipe }))
  igual([pedidoDoLink(dadosDoLink(comFicha, { usuario: 'ana.lima' })).pedido.fichaId, pedidoDoLink(dadosDoLink(comFicha, { usuario: 'ana.lima' })).pedido.criarFicha], [FICHA, undefined], 'confirmação: a ficha reaproveitada volta (sem criar outra)')
  const redigido = pedidoDoLink(dadosDoLinkRedigidos(dadosDoLink(pedido, { usuario: 'ana.lima' })))
  igual([redigido.pedido.email, redigido.pedido.whatsapp], ['', ''], 'confirmação: o link redigido não tem mais contato (o núcleo recusaria: nenhum canal)')
  igual(pedidoDoLink({ nome: 7, papel: ['admin'], criarFicha: 'sim' }).pedido, { nome: '', email: '', whatsapp: '', papel: '', coordenacao: '', cargo: '', criarFicha: false, pedirFicha: false }, 'confirmação: dados estranhos viram vazio')
}
igual(conferirAjustes(null, { usuario: 'ana.lima', papel: 'editor' }), { ok: true, usuario: 'ana.lima', papel: 'editor' }, 'ajustes: sem mudar, os do link')
igual(conferirAjustes({ usuario: ' @Ana.P ', papel: 'escola' }, { usuario: 'ana.lima', papel: 'editor' }), { ok: true, usuario: 'ana.p', papel: 'escola' }, 'ajustes: o usuário sem o @ e minúsculo')
igual(conferirAjustes({ papel: 'admin' }, { usuario: 'ana.lima', papel: 'editor' }).ok, false, 'ajustes: administrador recusado')
contem(JSON.stringify(conferirAjustes({ papel: 'admin' }, { usuario: 'ana.lima', papel: 'editor' })), 'só se dá pela tela', 'ajustes: administrador, pela tela')
igual(conferirAjustes({ papel: 'dono' }, { usuario: 'ana.lima', papel: 'editor' }), { ok: false, erro: 'Escolha um papel da lista.' }, 'ajustes: papel fora da lista')
igual(conferirAjustes({ usuario: 'a b' }, { usuario: 'ana.lima', papel: 'editor' }).ok, false, 'ajustes: usuário fora do formato')
igual(conferirAjustes(null, { usuario: 'ana.lima', papel: 'admin' }).ok, false, 'ajustes: administrador gravado no link também é recusado')
igual(PAPEIS_DA_CONFIRMACAO.map((p) => p.valor), ['colaborador', 'editor', 'escola'], 'ajustes: a lista da tela não tem administrador')
contem(textoDoCadastroNaoFeito('Ana Lima', 'e-mail inválido'), 'Não deu para cadastrar *Ana Lima*: e-mail inválido.', 'confirmação: o texto do que não saiu')

// ------------------------------------------------------------------ o código

const ler = (arquivo: string) => readFileSync(join(process.cwd(), arquivo), 'utf8')
const importsDe = (codigo: string) => [...codigo.matchAll(/^\s*import\s+(?!type\s)[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1])
igual(importsDe(ler('lib/whatsapp/colaborador-regras.ts')).filter((i) => i === 'server-only' || i.includes('supabase') || i.startsWith('node:') || i.startsWith('next/')), [], 'código: as regras do cadastro pelo WhatsApp são puras')
const bot = ler('lib/whatsapp/bot.ts')
contem(bot, "comando === 'cadastrar_colaborador'", 'código: o bot liga o comando')
contem(bot, 'usuarios: gerenciaUsuarios(pessoa)', 'código: o menu sabe quem gerencia usuários')
const acoes = ler('lib/whatsapp/acoes.ts')
contem(acoes, "if (p.tipo === 'cadastrar_colaborador') return seguirCadastro(", 'código: a pendência segue pelo cadastro')
contem(acoes, "cadastrar_colaborador: 'Pronto: ninguém foi cadastrado.'", 'código: o cancelar desiste')
contem(acoes, "if (p.tipo === 'cadastrar_colaborador') return '/pessoas/adicionar'", 'código: sem a migração, a tela "Adicionar pessoas"')
const doServidor = ler('lib/whatsapp/colaborador.ts')
contem(doServidor, "acao: 'cadastrar_colaborador'", 'código: o fim é o link de confirmar')
naoContem(doServidor, 'cadastrar(', 'código: o bot não cria conta (o núcleo só roda no Palácio)')
naoContem(doServidor, 'criarConta', 'código: o bot não cria conta')
const pagina = ler('lib/whatsapp/confirmar-no-palacio.ts')
igual((pagina.match(/c\.acao === 'cadastrar_colaborador'/g) ?? []).length >= 3, true, 'código: a página de confirmar nunca cai no ramo de desativar conta com o cadastro')
contem(pagina, 'return descreverCadastro(admin, c, quem)', 'código: a tela de confirmar descreve o cadastro')
contem(pagina, 'executarCadastro(createAdminClient(), supabase, c, quem, ajustes)', 'código: confirmar executa pela sessão de quem confirma')
contem(pagina, 'revalidarContas({ equipe: true })', 'código: depois do cadastro, as telas de contas e a Equipe')
naoContem(pagina, 'ainda não está ligada', 'código: a trava provisória saiu')
const confirmarAcao = ler('app/confirmar/[token]/acoes.ts')
igual(confirmarAcao.indexOf('lerConfirmacao(supabase') < confirmarAcao.indexOf('consumirConfirmacao(admin') && confirmarAcao.indexOf('faltaNaConferencia(supabase, c, quem, conferencia, escolha)') < confirmarAcao.indexOf('consumirConfirmacao(admin')
  && confirmarAcao.indexOf('consumirConfirmacao(admin') < confirmarAcao.indexOf('executar(supabase, c, quem, conferencia, escolha)'), true, 'código: lê o link e confere antes de gastar; executa só depois de gastar (uso único)')
contem(ler('app/confirmar/[token]/page.tsx'), 'cadastro={descricao.cadastro}', 'código: a página leva o usuário e o papel para mudar')
const doConfirmar = ler('lib/whatsapp/colaborador-confirmar.ts')
contem(doConfirmar, "cadastrar(admin, sessao, p.ambiente, p.pedido, { usuario: p.usuario, semAdmin: true, origem: 'whatsapp' })", 'código: o mesmo núcleo de "Adicionar pessoas", sem administrador')
naoContem(doConfirmar, 'console.', 'código: nada da confirmação do cadastro vai a log')
contem(ler('lib/whatsapp/portaria-regras.ts'), "tipo === 'cadastrar_colaborador'", 'código: as perguntas do cadastro não esperam na fila')
contem(ler('lib/whatsapp/fila.ts'), 'redigirCadastrosEncerrados(admin, { geral: true })', 'código: a faxina roda quando a fila anda')
contem(ler('lib/whatsapp/assistente/prompt.ts'), '*colaborador:* e o nome completo', 'código: o assistente ensina o comando')
igual((ler('lib/whatsapp/assistente/ferramentas.ts').match(/name: '/g) ?? []).length, 20, 'código: o assistente não ganhou ferramenta (o teto é 20)')

// ------------------------------------------------------------------ o servidor, contra um banco de mentira (sem rede)

// lib/whatsapp/colaborador.ts começa com import 'server-only', que só existe dentro do Next: aqui vira um arquivo vazio.
const vazio = join(tmpdir(), 'server-only-vazio.js')
writeFileSync(vazio, '')
const M = Module as unknown as { _resolveFilename: (pedido: string, ...resto: unknown[]) => string }
const resolver = M._resolveFilename
M._resolveFilename = function (pedidoDoModulo: string, ...resto: unknown[]) { return pedidoDoModulo === 'server-only' ? vazio : resolver.call(this, pedidoDoModulo, ...resto) }
// Nada sai para a rede: sem as chaves do Supabase (o WhatsApp do Palácio lê como desligado) e qualquer fetch falha alto.
for (const v of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'KAPSO_API_KEY']) delete process.env[v]
process.env.RESEND_API_KEY = 'teste-sem-rede'
process.env.NEWSLETTER_URL_BASE = BASE
globalThis.fetch = (async () => { throw new Error('rede proibida neste teste') }) as typeof fetch

type Consulta = { tabela: string; op: 'select' | 'insert' | 'update' | 'upsert' | 'delete'; valores?: unknown; filtros: [string, string, unknown][]; contar?: boolean }
type Resposta = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number }

function clienteDeMentira(responder: (c: Consulta) => Resposta, extra: Record<string, unknown> = {}) {
  const consultas: Consulta[] = []
  const from = (tabela: string) => {
    const c: Consulta = { tabela, op: 'select', filtros: [] }
    const fim = () => { consultas.push(c); return Promise.resolve({ data: null, error: null, ...responder(c) }) }
    const filtro = (op: string) => (k: string, v?: unknown, w?: unknown) => { c.filtros.push([op, k, w === undefined ? v : [v, w]]); return q }
    const q: Record<string, unknown> = {
      select: (_: string, o?: { count?: string }) => { if (o?.count) c.contar = true; return q },
      order: () => q, limit: () => q,
      insert: (v: unknown) => { c.op = 'insert'; c.valores = v; return q },
      update: (v: unknown) => { c.op = 'update'; c.valores = v; return q },
      upsert: (v: unknown) => { c.op = 'upsert'; c.valores = v; return q },
      delete: () => { c.op = 'delete'; return q },
      eq: filtro('eq'), neq: filtro('neq'), like: filtro('like'), is: filtro('is'), in: filtro('in'), or: filtro('or'), not: filtro('not'), lt: filtro('lt'), gt: filtro('gt'), gte: filtro('gte'),
      maybeSingle: fim, single: fim,
      then: (ok: (v: unknown) => unknown, falha: (e: unknown) => unknown) => fim().then(ok, falha),
    }
    return q
  }
  // As funções do banco respondem pelo `responder` (tabela "rpc:nome"); sem resposta, como se não existissem.
  const rpc = async (nome: string, args?: unknown) => {
    const c: Consulta = { tabela: `rpc:${nome}`, op: 'select', valores: args, filtros: [] }
    consultas.push(c)
    const r = responder(c)
    return Object.keys(r).length ? { data: null, error: null, ...r } : { data: null, error: { code: 'PGRST202', message: `sem ${nome}` } }
  }
  return { cliente: { from, rpc, ...extra }, consultas }
}
const filtroDe = (c: Consulta, k: string, op = 'eq') => c.filtros.find((f) => f[0] === op && f[1] === k)?.[2]

async function servidor() {
  const { comecarCadastro, seguirCadastro } = await import('../lib/whatsapp/colaborador')
  const WS = '00000000-0000-4000-8000-000000000001'
  const QUEM = { id: '00000000-0000-4000-8000-0000000000a1', nome: 'Matheus Macedo', papel: 'admin' as const }

  /** Um espaço de mentira: `fatores` (a verificação em duas etapas), `emails` em uso, `numeros` ligados, a equipe e a ficha. */
  function espaco(o: { fatores?: boolean; emails?: string[]; numeros?: string[]; contas?: { nome: string; usuario: string; active?: boolean }[]; fichas?: { id: string; nome: string; setor?: string; cargo?: string; email_trabalho?: string | null }[]; pessoais?: Record<string, { telefone_pessoal?: string; email_pessoal?: string }>; pendenciaFalha?: boolean } = {}) {
    const pendencias: Record<string, unknown>[] = []
    const links: Record<string, unknown>[] = []
    const auth = { admin: {
      mfa: { listFactors: async () => ({ data: { factors: o.fatores ? [{ status: 'verified' }] : [] }, error: null }) },
      getUserById: async () => ({ data: { user: { last_sign_in_at: '2026-10-01T00:00:00Z' } }, error: null }),
      createUser: async () => { throw new Error('o bot não pode criar conta') },
    } }
    const admin = clienteDeMentira((c) => {
      if (c.tabela === 'workspaces') return { data: { mfa_obrigatorio_para: [] } }
      if (c.tabela === 'setores') return { data: SETORES.map((nome, i) => ({ id: `s${i}`, nome, ativo: true })) }
      if (c.tabela === 'workspace_members') return { data: (o.contas ?? []).map((p, i) => ({ user_id: `u${i}`, role: 'colaborador', coordination: null, profiles: { full_name: p.nome, username: p.usuario, active: p.active ?? true } })) }
      if (c.tabela === 'equipe_membros' && c.op === 'select' && filtroDe(c, 'id')) return { data: (o.fichas ?? []).find((f) => f.id === filtroDe(c, 'id')) ?? null }
      if (c.tabela === 'equipe_membros') return { data: (o.fichas ?? []).map((f) => ({ situacao: 'ativo', cargo: null, setor: null, email_trabalho: null, nome_social: null, ...f })) }
      if (c.tabela === 'equipe_pessoais' && filtroDe(c, 'membro_id', 'in')) return { data: Object.entries(o.pessoais ?? {}).map(([membro_id, p]) => ({ membro_id, ...p })) }
      if (c.tabela === 'equipe_pessoais') return { data: (o.pessoais ?? {})[String(filtroDe(c, 'membro_id'))] ?? null }
      if (c.tabela === 'profiles' && filtroDe(c, 'email') !== undefined) return { data: (o.emails ?? []).includes(String(filtroDe(c, 'email'))) ? { id: 'y' } : null }
      if (c.tabela === 'profiles') return { data: [] }
      if (c.tabela === 'whatsapp_contas') return { data: (o.numeros ?? []).includes(String(filtroDe(c, 'numero'))) ? { user_id: 'outra' } : null }
      if (c.tabela === 'whatsapp_pendencias' && c.op === 'update' && (c.valores as { encerrada_em?: string }).encerrada_em) return { data: { id: 7 } }
      if (c.tabela === 'whatsapp_pendencias' && c.op === 'insert') { pendencias.push(c.valores as Record<string, unknown>); return o.pendenciaFalha ? { error: { code: '23514' } } : { data: { id: 7 } } }
      if (c.tabela === 'whatsapp_pendencias') return { data: [] }
      if (c.tabela === 'whatsapp_confirmacoes' && c.contar) return { count: 0 }
      if (c.tabela === 'whatsapp_confirmacoes' && c.op === 'insert') { links.push(c.valores as Record<string, unknown>); return {} }
      if (c.tabela === 'whatsapp_confirmacoes') return { data: [] }
      return {}
    }, { auth })
    return { admin: admin.cliente as never, consultas: admin.consultas, pendencias, links }
  }

  /** Uma conversa: começa com o comando e responde cada pergunta, levando os dados da pergunta anterior. */
  async function conversa(e: ReturnType<typeof espaco>, comando: string, respostas: string[]) {
    let r = await comecarCadastro(e.admin, WS, QUEM, comando, BASE)
    const saidas = [r]
    for (const texto of respostas) {
      if (!r?.pergunta) break
      r = await seguirCadastro(e.admin, WS, QUEM, { id: 7, tipo: 'cadastrar_colaborador', dados: r.pergunta.dados }, texto, BASE, true)
      saidas.push(r)
    }
    return saidas
  }

  // 1) Quem não gerencia usuários: nem é comando (null); quem usa a verificação em duas etapas vai para a tela.
  {
    const e = espaco()
    igual(await comecarCadastro(e.admin, WS, { ...QUEM, papel: 'colaborador' }, 'Ana Lima', BASE), null, 'servidor: quem não gerencia usuários')
    const duas = await comecarCadastro(espaco({ fatores: true }).admin, WS, QUEM, 'Ana Lima', BASE)
    contem(duas?.texto ?? '', 'verificação em duas etapas', 'servidor: verificação em duas etapas, a tela')
    contem(duas?.texto ?? '', `${BASE}/pessoas/adicionar`, 'servidor: verificação em duas etapas, com o link da tela')
  }

  // 2) A conversa inteira de uma pessoa nova: e-mail, WhatsApp, coordenação, cargo, papel e o link. Nada criado.
  {
    const e = espaco()
    const s = await conversa(e, 'Pedro Alves', ['pedro.alves@exemplo.org', '21 98765-4321', 'sem coordenação', 'pular', 'editor'])
    igual(s.map((r) => (r?.pergunta?.dados as DadosDoCadastro | undefined)?.etapa ?? 'fim'), ['email', 'whatsapp', 'coordenacao', 'cargo', 'papel', 'fim'], 'servidor: as etapas na ordem (sem o WhatsApp do Palácio, sem a pergunta da ficha)')
    contem(s[1]?.texto ?? '', 'E-mail anotado: p•••s@exemplo.org ✓', 'servidor: o recibo mascarado')
    const fim = s[s.length - 1]
    igual(fim?.semFila, true, 'servidor: o link sai na hora')
    contem(fim?.texto ?? '', `Confirme no Palácio: ${BASE}/confirmar/`, 'servidor: o fim é o link de confirmar')
    contem(fim?.texto ?? '', '@pedro.alves', 'servidor: o usuário sugerido no resumo')
    naoContem(fim?.texto ?? '', 'pedro.alves@exemplo.org', 'servidor: o e-mail inteiro não vai ao WhatsApp')
    const link = e.links[0] ?? {}
    igual([e.links.length, link.acao, (link.dados as Record<string, unknown>)?.email, (link.dados as Record<string, unknown>)?.whatsapp, (link.dados as Record<string, unknown>)?.papel, (link.dados as Record<string, unknown>)?.coordenacao, (link.dados as Record<string, unknown>)?.criarFicha],
      [1, 'cadastrar_colaborador', 'pedro.alves@exemplo.org', '5521987654321', 'editor', '', true], 'servidor: o link com o pedido (o contato nas chaves que o banco tira)')
    igual(/^[0-9a-f-]{36}$/.test(String(link.alvo_id)), true, 'servidor: o alvo do link é um id novo (a conta ainda não existe)')
    igual(e.consultas.some((c) => c.tabela === 'workspace_members' && c.op === 'insert') || e.consultas.some((c) => c.tabela === 'profiles' && c.op === 'insert'), false, 'servidor: nenhuma conta criada pelo bot')
    igual(e.consultas.some((c) => c.tabela === 'whatsapp_pendencias' && c.op === 'update' && (c.valores as { encerrada_em?: string }).encerrada_em), true, 'servidor: a pergunta encerra antes do link')
  }

  // 3) O e-mail em uso volta; o número ligado a outra conta é só aviso.
  {
    const e = espaco({ emails: ['pedro@exemplo.org'], numeros: ['5521987654321'] })
    const s = await conversa(e, 'Pedro Alves', ['pedro@exemplo.org'])
    igual([s[1]?.texto, s[1]?.pergunta], ['Este e-mail já está em uso por outra conta do Palácio. Escreva outro, ou *pular*.', undefined], 'servidor: e-mail em uso, pede outro (a pergunta continua a mesma)')
    const s2 = await conversa(e, 'Pedro Alves', ['pular', '21987654321'])
    contem(s2[2]?.texto ?? '', TEXTO_DO_NUMERO_EM_USO, 'servidor: número ligado a outra conta, o aviso')
    igual((s2[2]?.pergunta?.dados as DadosDoCadastro | undefined)?.numeroEmUso, true, 'servidor: o aviso vai ao resumo')
  }

  // 4) Quem já tem conta com o nome: para, sem pergunta e sem link.
  {
    const e = espaco({ contas: [{ nome: 'Bruno Costa', usuario: 'bruno.costa' }] })
    const r = await comecarCadastro(e.admin, WS, QUEM, 'Bruno Costa', BASE)
    igual([r?.pergunta, e.links.length], [undefined, 0], 'servidor: já tem conta, nada perguntado')
    contem(r?.texto ?? '', '@bruno.costa', 'servidor: já tem conta, o aviso com o usuário')
  }

  // 5) A ficha do RH reaproveitada: o "é esta pessoa?", o e-mail lido da ficha, e o link com a ficha como alvo.
  {
    const e = espaco({ fichas: [{ id: '00000000-0000-4000-8000-0000000000f1', nome: 'Ana Paula Lima', setor: 'Voluntariado', cargo: 'Assistente', email_trabalho: 'ana.lima@cruzvermelhariodejaneiro.org' }] })
    const s = await conversa(e, 'Ana Lima', ['sim', 'usar o da ficha', 'pular', 'usar o da ficha', 'usar o da ficha', 'manter'])
    igual((s[0]?.pergunta?.dados as DadosDoCadastro | undefined)?.etapa, 'quem_e', 'servidor: homônimo sem acesso, o "é esta pessoa?"')
    naoContem(JSON.stringify(s[0]?.pergunta?.dados), 'ana.lima@', 'servidor: o e-mail da ficha não fica na pendência antes da escolha')
    contem(s[2]?.texto ?? '', 'a•••a@cruzvermelhariodejaneiro.org', 'servidor: "Usar o da ficha" lê o e-mail da ficha')
    const link = e.links[0] ?? {}
    igual([link.alvo_id, (link.dados as Record<string, unknown>)?.fichaId, (link.dados as Record<string, unknown>)?.coordenacao, (link.dados as Record<string, unknown>)?.cargo, (link.dados as Record<string, unknown>)?.papel],
      ['00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000f1', 'Voluntariado', 'Assistente', 'colaborador'], 'servidor: a ficha é o alvo e vai no pedido')
  }

  // 7) A confirmação no Palácio (lib/whatsapp/colaborador-confirmar.ts): a tela, as conferências antes de gastar e a execução.
  await noPalacio()

  // 6) Antes da migração: o texto de ir à tela, que o bot manda no lugar da pergunta recusada.
  {
    const r = await comecarCadastro(espaco().admin, WS, QUEM, '', BASE)
    contem(r?.semPergunta ?? '', `ainda não está ligado. Cadastre pela tela "Adicionar pessoas": ${BASE}/pessoas/adicionar`, 'servidor: sem a migração, a tela "Adicionar pessoas"')
    igual((r?.pergunta?.dados as DadosDoCadastro | undefined)?.etapa, 'nome', 'servidor: sem o nome, pergunta o nome')
  }
}

/** A confirmação no Palácio, contra um banco de mentira (sem rede: o e-mail falha, o WhatsApp do Palácio está desligado). */
async function noPalacio() {
  const { descreverCadastro, executarCadastro, faltaNoCadastro } = await import('../lib/whatsapp/colaborador-confirmar')
  const WS = '00000000-0000-4000-8000-000000000001'
  const NOVO = '00000000-0000-4000-8000-0000000000c1'
  const NOVA_FICHA = '00000000-0000-4000-8000-0000000000f9'
  const QUEM = { userId: '00000000-0000-4000-8000-0000000000a1', workspaceId: WS, papel: 'admin' as const, nome: 'Matheus Macedo' }
  const link = (m: Partial<DadosDoCadastro> = {}, usuario = 'pedro.alves') => ({
    id: '00000000-0000-4000-8000-0000000000d1', workspaceId: WS, userId: QUEM.userId, acao: 'cadastrar_colaborador' as const, alvoId: '00000000-0000-4000-8000-0000000000d2',
    dados: dadosDoLink(pedidoDoCadastro(inicio({ nome: 'Pedro Alves', email: 'pedro.alves@exemplo.org', coordenacao: 'Voluntariado', cargo: 'Assistente', papel: 'editor', ...m })), { usuario }),
    criadoEm: '2026-10-19T12:00:00Z', expiraEm: '2099-01-01T00:00:00Z', usadoEm: null, resultado: null,
  })

  function palacio(o: { usados?: string[]; emails?: string[]; fichaLigada?: boolean } = {}) {
    const criados: unknown[] = []
    const auth = { admin: {
      createUser: async (d: unknown) => { criados.push(d); return { data: { user: { id: NOVO } }, error: null } },
      deleteUser: async () => ({ data: null, error: null }),
    } }
    const admin = clienteDeMentira((c) => {
      if (c.tabela === 'workspaces') return { data: { mfa_obrigatorio_para: [] } }
      if (c.tabela === 'setores') return { data: SETORES.map((nome, i) => ({ id: `s${i}`, nome, ativo: true })) }
      if (c.tabela === 'profiles' && c.op === 'select' && filtroDe(c, 'username') !== undefined) return { data: (o.usados ?? []).includes(String(filtroDe(c, 'username'))) ? { id: 'x' } : null }
      if (c.tabela === 'profiles' && c.op === 'select' && filtroDe(c, 'email') !== undefined) return { data: (o.emails ?? []).includes(String(filtroDe(c, 'email'))) ? { id: 'y' } : null }
      if (c.tabela === 'profiles' && c.op === 'select' && filtroDe(c, 'username', 'like') !== undefined) return { data: (o.usados ?? []).map((username) => ({ username })) }
      if (c.tabela === 'profiles' && c.op === 'select') return { data: [] }
      if (c.tabela === 'equipe_membros') return { data: { id: FICHA, user_id: o.fichaLigada ? 'outro' : null } }
      if (c.tabela === 'equipe_pessoais') return { data: { telefone_pessoal: '' } }
      return {}
    }, { auth })
    const sessao = clienteDeMentira((c) => (c.tabela === 'rpc:salvar_membro_equipe' ? { data: NOVA_FICHA } : {}))
    return { admin: admin.cliente as never, sessao: sessao.cliente as never, consultas: admin.consultas, daSessao: sessao.consultas, criados }
  }

  // A tela: o resumo mascarado, sem usuário e papel nas linhas (vão nos campos), administrador fora da lista.
  {
    const e = palacio()
    const d = await descreverCadastro(e.admin, link(), QUEM)
    if ('erro' in d) { falhas++; console.log('FALHOU: palácio: a tela deu erro', d.erro) } else {
      igual([d.titulo, d.botao, d.link, d.cadastro?.usuario, d.cadastro?.papel], ['Cadastrar Pedro Alves', 'Confirmar o cadastro', '/pessoas/adicionar', 'pedro.alves', 'editor'], 'palácio: a tela do cadastro')
      contem(JSON.stringify(d.linhas), 'p•••s@exemplo.org', 'palácio: o e-mail mascarado na tela')
      naoContem(JSON.stringify(d), 'pedro.alves@exemplo.org', 'palácio: o e-mail inteiro não aparece')
      igual(d.linhas.some((l) => l.rotulo === 'Usuário' || l.rotulo === 'Papel'), false, 'palácio: o usuário e o papel vão nos campos para mudar')
      contem(JSON.stringify(d.linhas), 'Voluntariado', 'palácio: a coordenação no resumo')
      igual(d.cadastro?.papeis.some((p) => p.valor === 'admin'), false, 'palácio: administrador fora da lista')
    }
    const tomado = await descreverCadastro(palacio({ usados: ['pedro.alves'] }).admin, link(), QUEM)
    igual('erro' in tomado ? tomado.erro : tomado.cadastro?.usuario, 'pedro.alves2', 'palácio: o usuário sugerido tomado no meio-tempo, o próximo livre')
    const semCoordenacao = await descreverCadastro(palacio().admin, link({ coordenacao: '' }), QUEM)
    contem(JSON.stringify(semCoordenacao), 'Sem coordenação', 'palácio: "Sem coordenação" vale')
    const naoGerencia = await descreverCadastro(palacio().admin, link(), { ...QUEM, papel: 'colaborador' })
    igual('erro' in naoGerencia ? naoGerencia.erro : null, 'Cadastrar colaboradores é só de quem gerencia os usuários.', 'palácio: quem não gerencia usuários não confirma')
  }

  // Antes de gastar o link: o que não serve volta (e nada é criado).
  {
    const e = palacio({ usados: ['pedro.alves'] })
    igual(await faltaNoCadastro(e.admin, link(), QUEM, { usuario: 'pedro.alves', papel: 'editor' }), 'O usuário @pedro.alves já existe. Escolha outro.', 'antes: usuário em uso')
    igual(await faltaNoCadastro(e.admin, link(), QUEM, { usuario: 'pedro.a', papel: 'editor' }), null, 'antes: outro usuário, livre, passa')
    contem(await faltaNoCadastro(e.admin, link(), QUEM, { usuario: 'pedro.a', papel: 'admin' }) ?? '', 'administrador só se dá pela tela', 'antes: administrador recusado')
    contem(await faltaNoCadastro(palacio({ fichaLigada: true }).admin, link({ daEquipe: { nome: 'Pedro Alves', fichaId: FICHA } as CandidatoDaEquipe }), QUEM, null) ?? '', 'ganhou acesso ao Palácio no meio-tempo', 'antes: a ficha já ganhou login')
    contem(await faltaNoCadastro(palacio({ emails: ['pedro.alves@exemplo.org'] }).admin, link(), QUEM, null) ?? '', 'já está em uso por outra conta', 'antes: e-mail em uso')
    // Só WhatsApp, com o WhatsApp do Palácio desligado: nenhum canal para o convite.
    contem(await faltaNoCadastro(palacio().admin, link({ email: undefined, whatsapp: '5521987654321' }), QUEM, null) ?? '', 'o WhatsApp do Palácio não está ligado: informe o e-mail', 'antes: nenhum canal ligado')
    igual(e.criados.length, 0, 'antes: nada criado')
  }

  // A execução pelo núcleo: a conta pela sessão, a auditoria com a origem, o sino de quem pediu e o resultado mascarado.
  {
    const e = palacio()
    const r = await executarCadastro(e.admin, e.sessao, link({ daEquipe: { nome: 'Pedro Alves', fichaId: FICHA } as CandidatoDaEquipe }), QUEM, { usuario: 'pedro.a', papel: 'colaborador' })
    igual(r.ok, true, 'execução: a conta nasceu')
    contem(r.mensagem, 'Conta de *Pedro Alves* criada, usuário *@pedro.a*', 'execução: o usuário escolhido na tela')
    contem(r.mensagem, 'o e-mail (p•••s@exemplo.org) não saiu', 'execução: o e-mail que falhou, dito com honestidade (mascarado)')
    contem(r.mensagem, 'O convite NÃO saiu', 'execução: sem convite, o caminho para reenviar')
    naoContem(r.mensagem, 'pedro.alves@exemplo.org', 'execução: o e-mail inteiro não vai ao resultado')
    const vinculo = e.daSessao.find((c) => c.tabela === 'workspace_members' && c.op === 'insert')?.valores as Record<string, unknown> | undefined
    igual([vinculo?.role, vinculo?.coordination], ['colaborador', 'Voluntariado'], 'execução: o vínculo pela sessão, com o papel escolhido')
    igual(e.consultas.some((c) => c.tabela === 'workspace_members'), false, 'execução: o vínculo nunca pelo service role')
    igual((e.daSessao.find((c) => c.tabela === 'rpc:salvar_membro_equipe')?.valores as { p_id?: string } | undefined)?.p_id, FICHA, 'execução: a ficha do RH reaproveitada ganha o login')
    const auditoria = e.consultas.find((c) => c.tabela === 'auditoria_de_acesso')?.valores as { acao?: string; detalhes?: Record<string, unknown> } | undefined
    igual([auditoria?.acao, auditoria?.detalhes?.origem, auditoria?.detalhes?.usuario], ['usuario_criado', 'whatsapp', 'pedro.a'], 'execução: a auditoria de sempre, com a origem')
    const sino = e.consultas.find((c) => c.tabela === 'notifications' && c.op === 'insert')?.valores as Record<string, unknown>[] | undefined
    igual([sino?.[0]?.user_id, sino?.[0]?.title], [QUEM.userId, 'Conta de Pedro Alves criada pelo WhatsApp do Palácio'], 'execução: o sino de quem pediu')
    naoContem(String(sino?.[0]?.message), '*', 'execução: o sino sem a marcação do WhatsApp')
    naoContem(String(sino?.[0]?.message), 'pedro.alves@exemplo.org', 'execução: o sino sem o e-mail inteiro')
    const semCanal = palacio()
    const r2 = await executarCadastro(semCanal.admin, semCanal.sessao, link({ email: undefined, whatsapp: '5521987654321' }), QUEM, null)
    igual([r2.ok, semCanal.criados.length], [false, 0], 'execução: sem canal, nada é criado')
    const comAdmin = palacio()
    const r3 = await executarCadastro(comAdmin.admin, comAdmin.sessao, link({ papel: 'admin' }), QUEM, null)
    igual([r3.ok, comAdmin.criados.length], [false, 0], 'execução: administrador no link, nada é criado')
  }
}

servidor().catch((causa) => { falhas++; console.log('FALHOU: o servidor lançou', causa) }).finally(() => {
  if (falhas) { console.log(`\n${falhas} falha(s).`); process.exit(1) }
  console.log('Cadastro de colaborador pelo WhatsApp: tudo certo.')
})
