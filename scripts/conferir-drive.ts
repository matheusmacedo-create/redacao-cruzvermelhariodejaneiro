/**
 * Confere o Google Drive do Palácio: `npx tsx scripts/conferir-drive.ts`. Sem banco, sem rede e sem modelo: só o que é
 * puro — os caminhos (normalizar, até 4 níveis, sem ".."), quem guarda onde (a pasta do setor; quem administra, em
 * qualquer lugar), a pasta e a descrição da cópia dos envios, o documento que se guarda pelo WhatsApp (tipo, nome,
 * tamanho), a montagem dos pedidos à API do Drive (a busca com o nome escapado, a criação da pasta, o envio em partes),
 * as falhas, os textos do WhatsApp (a legenda, a pergunta da pasta, o guardado, a linha do "status") e o passo do
 * assistente (preparar_guardar_no_drive: o preparo com uma fonte de mentira, o plano, o recibo, a redação, a
 * revalidação e um turno com o modelo roteirizado). Por fim, a migração: só acrescenta, sem "drop policy".
 * Sai com código 1 se algo estiver errado.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'
import {
  MIME_DE_PASTA, NIVEIS_DO_CAMINHO, PASTA_DOS_ENVIOS, PASTA_RAIZ, PEDACO_DO_ENVIO, TEXTO_SEM_SETOR, caminhoDoEnvio, caminhoPorExtenso, descricaoDoArquivoDoEnvio, escaparNaBusca,
  faixaDaConsulta, faixaDoPedaco, mesEmBrasilia, motivoDaFalhaDoDrive, nomeDePasta, nomeDoArquivoNoDrive, normalizarCaminho, pedidoDaConta, pedidoDeBuscarPasta,
  pedidoDeConferirPasta, pedidoDeCriarPasta, pedidoDeInicioDoEnvio, podeGuardarEm, proximoInicio, tamanhoLegivel, textoDaFalhaDoDrive, tipoDoDocumento,
} from '../lib/google/drive-regras'
import {
  TEXTO_PASTA_NA_LEGENDA, documentoDosDados, lerLegendaDeGuardar, lerPastaDaResposta, rotuloDoDocumento, textoDoGuardado, textoPedeAPasta, type DocumentoRecebido,
} from '../lib/whatsapp/drive-regras'
import { linhaDoDriveNoStatus, textoDoStatus, type StatusDoCanal } from '../lib/whatsapp/regras'
import { INTEGRACOES_ALERTADAS, textoDoAlertaDeIntegracao } from '../lib/integracoes/alertas-regras'
import {
  NOMES_DAS_FERRAMENTAS, TEXTOS_FIXOS, acoesPermitidas, linhasDoPlano, redigirPassos, textoDoPlano, textoDoRecibo, tipoDaFerramenta, validarEntrada, validarRascunho,
  type Passo, type ResultadoDaAcao,
} from '../lib/whatsapp/assistente/regras'
import { FERRAMENTAS } from '../lib/whatsapp/assistente/ferramentas'
import { TabelaDeMarcadores } from '../lib/whatsapp/assistente/marcadores'
import { criarExecutar, criarRascunho, rodarTurno, type Chamar, type CorpoDaChamada } from '../lib/whatsapp/assistente/laco'
import { criarFluxoDoPlano, repoEmMemoria } from '../lib/whatsapp/assistente/fluxo'
import { SISTEMA_DO_ASSISTENTE, montarContexto, montarParams, textoDaSituacao } from '../lib/whatsapp/assistente/prompt'
import { criarPreparador, revalidarPasso, type FonteDosPreparos } from '../lib/whatsapp/assistente/preparos'

let falhas = 0
function igual<T>(obtido: T, esperado: T, caso: string) {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) { falhas++; console.log(`FALHOU: ${caso}\n  esperado ${JSON.stringify(esperado)}\n  obtido   ${JSON.stringify(obtido)}`) }
}
const contem = (texto: string, trecho: string, caso: string) => { if (!texto.includes(trecho)) { falhas++; console.log(`FALHOU: ${caso}\n  sem "${trecho}" em ${JSON.stringify(texto)}`) } }
const naoContem = (texto: string, trecho: string | RegExp, caso: string) => {
  if (typeof trecho === 'string' ? texto.includes(trecho) : trecho.test(texto)) { falhas++; console.log(`FALHOU: ${caso}\n  com "${trecho}" em ${JSON.stringify(texto)}`) }
}
const partes = (texto: string) => { const c = normalizarCaminho(texto); return c.ok ? c.partes : `erro: ${c.erro}` }

// ---------------------------------------------------------------- o caminho

igual(partes('Financeiro/2026'), ['Financeiro', '2026'], 'caminho: dois níveis')
igual(partes('  Financeiro // 2026 / '), ['Financeiro', '2026'], 'caminho: barras extras e espaços somem')
igual(partes('Financeiro > 2026 > Notas'), ['Financeiro', '2026', 'Notas'], 'caminho: ">" também separa')
igual(partes('Financeiro\\2026'), ['Financeiro', '2026'], 'caminho: a barra invertida também separa')
igual(partes('Palácio – Arquivos/Financeiro/2026'), ['Financeiro', '2026'], 'caminho: a raiz escrita junto não é um nível')
igual(partes('palacio - arquivos/Financeiro'), ['Financeiro'], 'caminho: a raiz sem acento e com hífen também')
igual(partes('"Financeiro/2026"'), ['Financeiro', '2026'], 'caminho: aspas em volta saem')
igual(partes('Financeiro/2026.'), ['Financeiro', '2026'], 'caminho: ponto no fim do nome sai')
igual(partes('Financeiro/‮2026​'), ['Financeiro', '2026'], 'caminho: invisíveis de formatação saem')
contem(String(partes('Financeiro/../RH')), 'não pode ter "." nem ".."', 'caminho: ".." é recusado')
contem(String(partes('./Financeiro')), 'não pode ter', 'caminho: "." é recusado')
contem(String(partes('   ')), 'Diga a pasta', 'caminho: vazio')
contem(String(partes('Palácio – Arquivos')), 'Diga a pasta', 'caminho: só a raiz não é pasta')
igual(partes('A/B/C/D'), ['A', 'B', 'C', 'D'], `caminho: ${NIVEIS_DO_CAMINHO} níveis valem`)
contem(String(partes('A/B/C/D/E')), 'No máximo 4 níveis', 'caminho: 5 níveis não')
contem(String(partes(`Financeiro/${'x'.repeat(81)}`)), 'até 80 caracteres', 'caminho: nome de pasta comprido')
igual(caminhoPorExtenso(['Financeiro', '2026']), 'Palácio – Arquivos/Financeiro/2026', 'caminho: por extenso, com a raiz')

// ---------------------------------------------------------------- quem guarda onde

const daAna = { administra: false, setores: ['Comunicação', 'Financeiro'] }
igual(podeGuardarEm(['financeiro', '2026'], daAna), { ok: true, partes: ['Financeiro', '2026'] }, 'pasta: o setor dela, escrito como no Palácio')
igual(podeGuardarEm(['Comunicacao'], daAna), { ok: true, partes: ['Comunicação'] }, 'pasta: sem acento também é o setor')
const fora = podeGuardarEm(['RH', '2026'], daAna)
igual(fora.ok, false, 'pasta: outro setor não')
contem(fora.ok ? '' : fora.erro, 'Você guarda só na pasta do seu setor (Comunicação, Financeiro). Ex.: Comunicação/2026.', 'pasta: diz onde ela pode')
igual(podeGuardarEm(['RH', 'Folha'], { administra: true, setores: [] }), { ok: true, partes: ['RH', 'Folha'] }, 'pasta: quem administra, em qualquer lugar')
igual(podeGuardarEm(['Financeiro'], { administra: false, setores: [] }), { ok: false, erro: TEXTO_SEM_SETOR }, 'pasta: sem setor, não tem onde guardar')
const envios = podeGuardarEm([PASTA_DOS_ENVIOS, '2026-10'], { administra: true, setores: [] })
igual(envios.ok, false, 'pasta: a dos envios é só das cópias automáticas (nem quem administra guarda à mão)')
igual(podeGuardarEm([], { administra: true, setores: [] }).ok, false, 'pasta: sem caminho')

// ---------------------------------------------------------------- a cópia dos envios

igual(mesEmBrasilia('2026-11-01T01:30:00Z'), '2026-10', 'envio: o mês em Brasília (ainda é 31/10 lá)')
igual(caminhoDoEnvio({ concluidoEm: '2026-10-19T15:00:00Z', titulo: 'Ação de prevenção na Central do Brasil', protocolo: 'ENV-00042' }),
  [PASTA_DOS_ENVIOS, '2026-10', 'Ação de prevenção na Central do Brasil (ENV-00042)'], 'envio: Envios do WhatsApp/AAAA-MM/<título> (protocolo)')
igual(caminhoDoEnvio({ concluidoEm: '2026-10-19T15:00:00Z', titulo: 'Doação/Hemorio', protocolo: null })[2], 'Doação-Hemorio', 'envio: a barra do título não vira outro nível')
igual(caminhoDoEnvio({ concluidoEm: '2026-10-19T15:00:00Z', titulo: 'x'.repeat(200), protocolo: 'ENV-00001' })[2].length <= 80, true, 'envio: o nome da pasta cabe em 80 caracteres, com o protocolo')
igual(nomeDePasta('  ..  '), 'Sem título', 'envio: título vazio')
const descricao = descricaoDoArquivoDoEnvio({ protocolo: 'ENV-00042', titulo: 'Ação na Maré', nome: 'Ana Souza', setor: 'Comunicação', autorizacao: 'nao_sei' })
contem(descricao, 'Envio ENV-00042 — “Ação na Maré”, mandado pelo WhatsApp do Palácio por Ana Souza (Comunicação).', 'envio: a descrição diz de onde veio')
contem(descricao, 'Autorização de imagem: Não sei / não perguntei.', 'envio: a autorização de imagem na descrição')
contem(descricao, 'Confira a autorização antes de publicar.', 'envio: o aviso quando não pode publicar')
naoContem(descricaoDoArquivoDoEnvio({ protocolo: null, titulo: 'A', nome: 'B', setor: null, autorizacao: 'sim' }), 'Confira a autorização', 'envio: com autorização, sem o aviso')

// ---------------------------------------------------------------- o documento

igual(tipoDoDocumento('Relatório.PDF', 'application/octet-stream'), { rotulo: 'PDF', extensao: 'pdf' }, 'documento: pela extensão')
igual(tipoDoDocumento(null, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), { rotulo: 'planilha', extensao: 'xlsx' }, 'documento: pelo tipo')
igual(tipoDoDocumento('notas.txt', 'text/plain'), { rotulo: 'texto', extensao: 'txt' }, 'documento: texto')
igual(tipoDoDocumento('virus.exe', 'application/x-msdownload'), null, 'documento: executável não')
igual(tipoDoDocumento('fotos.zip', 'application/zip'), null, 'documento: zip não')
igual(nomeDoArquivoNoDrive('relatorio.pdf', '', 'pdf'), 'relatorio.pdf', 'nome: o que veio')
igual(nomeDoArquivoNoDrive('relatorio.pdf', 'Contrato da Light 2026', 'pdf'), 'Contrato da Light 2026.pdf', 'nome: o pedido ganha a extensão do original')
igual(nomeDoArquivoNoDrive('relatorio.pdf', 'pasta/../outro.pdf', 'pdf'), 'pasta-..-outro.pdf', 'nome: barra no nome não vira caminho')
igual(nomeDoArquivoNoDrive(null, null, 'xlsx'), 'documento.xlsx', 'nome: sem nome nenhum')
igual(nomeDoArquivoNoDrive('x'.repeat(300), '', 'pdf').length <= 120 && nomeDoArquivoNoDrive('x'.repeat(300), '', 'pdf').endsWith('.pdf'), true, 'nome: cortado em 120, com a extensão')
igual([tamanhoLegivel(2_411_725), tamanhoLegivel(180_000), tamanhoLegivel(0)], ['2,3 MB', '176 KB', ''], 'tamanho: legível')

// ---------------------------------------------------------------- os pedidos à API

const busca = pedidoDeBuscarPasta("Contas d'água \\ 2026", 'abc123')
const q = new URL(busca.url).searchParams.get('q')
igual(q, "name = 'Contas d\\'água \\\\ 2026' and mimeType = 'application/vnd.google-apps.folder' and 'abc123' in parents and trashed = false", 'API: a busca da pasta, com o apóstrofo e a barra escapados')
igual([busca.metodo, new URL(busca.url).pathname, new URL(busca.url).searchParams.get('fields')], ['GET', '/drive/v3/files', 'files(id,name,webViewLink)'], 'API: a busca pede só id, nome e link')
igual(escaparNaBusca("o'"), "o\\'", 'API: escapar o apóstrofo')
const criar = pedidoDeCriarPasta('2026', 'pai1')
igual([criar.metodo, criar.url, JSON.parse(criar.corpo ?? '{}')], ['POST', 'https://www.googleapis.com/drive/v3/files?fields=id%2CwebViewLink', { name: '2026', mimeType: MIME_DE_PASTA, parents: ['pai1'] }], 'API: criar a pasta dentro da mãe')
igual(JSON.parse(pedidoDeCriarPasta(PASTA_RAIZ, null).corpo ?? '{}'), { name: 'Palácio – Arquivos', mimeType: MIME_DE_PASTA }, 'API: a raiz nasce no Meu Drive (sem mãe)')
igual(pedidoDeConferirPasta('id 1').url, 'https://www.googleapis.com/drive/v3/files/id%201?fields=id%2Ctrashed%2CwebViewLink%2CmimeType', 'API: conferir a pasta guardada (e se está na lixeira)')
igual(pedidoDaConta().url, 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress%2CdisplayName)', 'API: a conta pelo about (sem openid)')
const inicio = pedidoDeInicioDoEnvio({ nome: 'relatorio.pdf', mime: 'application/pdf', tamanho: 20_000_000, pastaId: 'p9', descricao: 'Guardado pelo WhatsApp' })
igual([inicio.metodo, inicio.url], ['POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id%2CwebViewLink'], 'API: o envio em partes começa no upload, resumable')
igual(inicio.cabecalhos, { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/pdf', 'X-Upload-Content-Length': '20000000' }, 'API: o tipo e o tamanho nos cabeçalhos X-Upload-*')
igual(JSON.parse(inicio.corpo ?? '{}'), { name: 'relatorio.pdf', parents: ['p9'], description: 'Guardado pelo WhatsApp' }, 'API: os metadados no corpo')
igual(PEDACO_DO_ENVIO % (256 * 1024), 0, 'API: a parte é múltiplo de 256 KiB')
igual(faixaDoPedaco(0, 20_000_000), { fim: PEDACO_DO_ENVIO - 1, cabecalho: `bytes 0-${PEDACO_DO_ENVIO - 1}/20000000` }, 'API: a primeira parte')
igual(faixaDoPedaco(16_777_216, 20_000_000), { fim: 19_999_999, cabecalho: 'bytes 16777216-19999999/20000000' }, 'API: a última parte vai até o fim')
igual(faixaDoPedaco(0, 1000).cabecalho, 'bytes 0-999/1000', 'API: arquivo pequeno, uma parte só')
igual(faixaDaConsulta(1000), 'bytes */1000', 'API: a pergunta "até onde chegou?"')
igual([proximoInicio('bytes=0-8388607'), proximoInicio(null), proximoInicio('lixo')], [8_388_608, 0, 0], 'API: de onde continuar, pelo Range do 308')

// ---------------------------------------------------------------- as falhas

igual(motivoDaFalhaDoDrive(401), 'reconectar', 'falha: 401 pede reconectar')
igual(motivoDaFalhaDoDrive(403, 'insufficientPermissions'), 'reconectar', 'falha: escopo que falta pede reconectar')
igual(motivoDaFalhaDoDrive(403, 'storageQuotaExceeded'), 'cota', 'falha: Drive cheio')
igual(motivoDaFalhaDoDrive(403, 'userRateLimitExceeded'), 'limite', 'falha: chamadas demais')
igual(motivoDaFalhaDoDrive(429), 'limite', 'falha: 429')
igual(motivoDaFalhaDoDrive(404, 'appNotAuthorizedToFile'), 'sem_acesso', 'falha: o que o Palácio não criou (drive.file)')
igual(motivoDaFalhaDoDrive(404), 'nao_existe', 'falha: 404')
igual([motivoDaFalhaDoDrive(0), motivoDaFalhaDoDrive(503)], ['fora_do_ar', 'fora_do_ar'], 'falha: sem resposta ou 5xx')
igual(motivoDaFalhaDoDrive(400, 'badRequest'), 'outro', 'falha: o resto')
for (const m of ['reconectar', 'sem_acesso', 'cota', 'limite', 'nao_existe', 'fora_do_ar', 'outro'] as const) {
  const t = textoDaFalhaDoDrive(m)
  if (!t || /https?:|token|HTTP \d/i.test(t)) { falhas++; console.log(`FALHOU: falha ${m}: texto sem detalhe técnico (${t})`) }
}
contem(textoDaFalhaDoDrive('reconectar'), 'Configurações → E-mail dos setores', 'falha: reconectar diz onde')
igual(INTEGRACOES_ALERTADAS.includes('google_drive'), true, 'alerta: o Drive é uma integração alertada')
contem(textoDoAlertaDeIntegracao('google_drive', { conta: 'contato@cvb.org' }).mensagem, 'de contato@cvb.org expirou ou foi revogada', 'alerta: o Drive expirado, com a conta')
contem(textoDoAlertaDeIntegracao('google_drive', { motivo: 'servico' }).titulo, 'sem espaço', 'alerta: o Drive cheio')
igual(textoDoAlertaDeIntegracao('google_drive').link, '/configuracoes/email', 'alerta: leva às conexões Google')

// ---------------------------------------------------------------- o WhatsApp: a legenda, a resposta, os textos

igual(lerLegendaDeGuardar('guardar em Financeiro/2026'), 'Financeiro/2026', 'legenda: "guardar em"')
igual(lerLegendaDeGuardar('Salva na pasta Financeiro > 2026.'), 'Financeiro > 2026', 'legenda: "salva na pasta", com ponto final')
igual(lerLegendaDeGuardar('por favor, guarda isso em Comunicação'), 'Comunicação', 'legenda: com "por favor" e "isso"')
igual(lerLegendaDeGuardar('coloca na pasta RH/Folha/Outubro'), 'RH/Folha/Outubro', 'legenda: "coloca na pasta"')
igual(lerLegendaDeGuardar('guarda na pasta do financeiro de 2026'), null, 'legenda: frase solta não é caminho (vai ao assistente ou à pergunta)')
igual(lerLegendaDeGuardar('relatório de outubro'), null, 'legenda: sem pedir para guardar')
igual(lerLegendaDeGuardar(''), null, 'legenda: vazia')
igual(lerPastaDaResposta('Financeiro/2026'), 'Financeiro/2026', 'resposta: o caminho sozinho')
igual(lerPastaDaResposta('na pasta Financeiro'), 'Financeiro', 'resposta: "na pasta"')
igual(lerPastaDaResposta('guardar em RH'), 'RH', 'resposta: com o verbo também')
igual(lerPastaDaResposta('não sei, pode ser qualquer uma que você achar melhor'), null, 'resposta: frase longa não é caminho')
const doc: DocumentoRecebido = { mensagemId: 'wamid.doc1', arquivo: '123456', endereco: 'https://api.kapso.ai/media/1', nome: 'relatorio.pdf', mime: 'application/pdf', tamanho: 2_411_725, tipo: 'PDF', extensao: 'pdf' }
igual(documentoDosDados(doc), doc, 'documento: lido de volta da pergunta')
igual(documentoDosDados({ ...doc, arquivo: '', endereco: '' }), null, 'documento: sem como baixar, não vale')
igual(documentoDosDados('lixo'), null, 'documento: lixo')
igual(rotuloDoDocumento(doc), '*relatorio.pdf* (PDF, 2,3 MB)', 'documento: o rótulo')
const pergunta = textoPedeAPasta({ documento: doc, setores: ['Comunicação', 'Financeiro'], administra: false })
contem(pergunta, 'Recebi *relatorio.pdf* (PDF, 2,3 MB). Em que pasta do Google Drive do Palácio eu guardo?', 'pergunta: o documento')
contem(pergunta, 'começando pelo seu setor (Comunicação, Financeiro): ex.: *Comunicação/2026*', 'pergunta: os setores dela e o exemplo')
contem(pergunta, 'Para desistir, *cancelar*. Vale por 15 minutos.', 'pergunta: como desistir')
contem(textoPedeAPasta({ documento: doc, setores: [], administra: true }), 'dentro de “Palácio – Arquivos” (ex.: *Financeiro/2026*)', 'pergunta: quem administra escolhe qualquer pasta')
contem(TEXTO_PASTA_NA_LEGENDA, '*guardar em Financeiro/2026*', 'pergunta: sem a migração, a legenda resolve')
igual(textoDoGuardado({ nome: 'relatorio.pdf', partes: ['Financeiro', '2026'], link: 'https://drive.google.com/file/d/x/view' }),
  'Guardado no Google Drive: *relatorio.pdf* em _Palácio – Arquivos/Financeiro/2026_.\n\nhttps://drive.google.com/file/d/x/view', 'guardado: onde e o link')

// ---------------------------------------------------------------- o "status"

igual(linhaDoDriveNoStatus({ estado: 'ativa', conta: 'contato@cvb.org', pastaRaiz: true }), '*Google Drive:* conectado (contato@cvb.org) · pasta “Palácio – Arquivos” criada', 'status: conectado')
contem(linhaDoDriveNoStatus({ estado: 'ativa', conta: 'contato@cvb.org', pastaRaiz: false }), 'nasce no primeiro arquivo', 'status: conectado sem a pasta ainda')
contem(linhaDoDriveNoStatus({ estado: 'expirada', conta: 'contato@cvb.org', pastaRaiz: true }), '*Google Drive:* expirado (contato@cvb.org) – a autorização caiu; reconecte', 'status: expirado')
contem(linhaDoDriveNoStatus('sem_conexao'), '*Google Drive:* sem conexão', 'status: sem conexão')
igual(linhaDoDriveNoStatus(null), '*Google Drive:* não deu para ler agora', 'status: não deu para ler')
const statusBase: StatusDoCanal = { conexao: { estado: 'conectado', erro: null }, webhook: 'ligado', fila: null, falhas: null, semChave: [], googleExpiradas: [], conversas: 3, rotina: null, urlBase: 'https://p' }
naoContem(textoDoStatus(statusBase), 'Google Drive', 'status: sem o campo, a linha não sai (o de sempre)')
contem(textoDoStatus({ ...statusBase, drive: 'sem_conexao' }), '*Contas Google:* em dia\n*Google Drive:* sem conexão', 'status: a linha do Drive logo depois das contas Google')

// ---------------------------------------------------------------- o assistente: a ferramenta, o portão e o plano

igual(NOMES_DAS_FERRAMENTAS.length, 20, 'ferramenta: o teto de 20 continua')
igual(NOMES_DAS_FERRAMENTAS.includes('preparar_guardar_no_drive'), true, 'ferramenta: preparar_guardar_no_drive na lista')
igual((NOMES_DAS_FERRAMENTAS as readonly string[]).includes('ler_filas_de_chamado'), false, 'ferramenta: ler_filas_de_chamado virou a área filas_de_chamado')
igual(FERRAMENTAS.find((f) => f.name === 'preparar_guardar_no_drive')?.input_schema.required, ['pasta', 'nome'], 'ferramenta: strict, com os dois campos obrigatórios')
contem(JSON.stringify(FERRAMENTAS.find((f) => f.name === 'consultar_area')?.input_schema), 'filas_de_chamado', 'ferramenta: consultar_area tem a área das filas')
igual(tipoDaFerramenta('preparar_guardar_no_drive'), 'drive', 'portão: o tipo da ferramenta')
igual(acoesPermitidas('guarda esse pdf na pasta do financeiro de 2026').includes('drive'), true, 'portão: "guarda na pasta" liga o drive')
igual(acoesPermitidas('salva isso no drive').includes('drive'), true, 'portão: "salva no drive"')
igual(acoesPermitidas('aprova a matéria do Daniel').includes('drive'), false, 'portão: aprovar não liga o drive')
igual(validarEntrada('preparar_guardar_no_drive', { pasta: 'Financeiro/2026', nome: '' }).ok, true, 'entrada: pasta e nome vazio')
igual(validarEntrada('preparar_guardar_no_drive', { pasta: '', nome: '' }).ok, false, 'entrada: pasta vazia')
igual(validarEntrada('preparar_guardar_no_drive', { pasta: 'Financeiro', nome: 'x'.repeat(121) }).ok, false, 'entrada: nome comprido')
contem(SISTEMA_DO_ASSISTENTE, 'preparar_guardar_no_drive', 'prompt: o sistema ensina a guardar no Drive')
naoContem(SISTEMA_DO_ASSISTENTE, 'ler_filas_de_chamado', 'prompt: o sistema não cita a ferramenta que saiu')

const PASSO: Passo = {
  acao: 'guardar_no_drive', nome: 'relatorio.pdf', tipo: 'PDF', tamanho: 2_411_725, mime: 'application/pdf', extensao: 'pdf',
  mensagemId: 'wamid.doc1', arquivo: '123456', endereco: 'https://api.kapso.ai/media/1', partes: ['Financeiro', '2026'], isento: false,
}
contem(linhasDoPlano([PASSO]).join('\n'), '*1.* Guardar no Google Drive o documento *relatorio.pdf* (PDF, 2,3 MB) em _Palácio – Arquivos/Financeiro/2026_', 'plano: o passo do Drive')
contem(textoDoPlano({ passos: [PASSO] }).texto, 'Responda *confirmo* para fazer, ou *cancelar*.', 'plano: confirmado como os outros')
igual(validarRascunho([PASSO]).ok, true, 'plano: valida')
const recibo = textoDoRecibo({ passos: [PASSO], resultados: [{ n: 1, ok: true, codigo: 'feito', link: 'https://drive.google.com/file/d/x/view' }], urlBase: 'https://p' })
igual(recibo, 'Feito:\n✓ Documento guardado no Google Drive em _Financeiro/2026_ — https://drive.google.com/file/d/x/view', 'recibo: a pasta e o link do arquivo, sem o nome')
const redigido = redigirPassos([PASSO]).passos[0]
igual(redigido.acao === 'guardar_no_drive' && [redigido.nome.startsWith('h:'), redigido.arquivo, redigido.endereco, redigido.partes], [true, '', null, ['Financeiro', '2026']], 'redação: o nome vira hash e o arquivo some; a pasta fica')

// ---------------------------------------------------------------- o preparo (fonte de mentira)

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const EU = id(900)
const ESPACO = id(901)
type Mundo = { documento: DocumentoRecebido | null; conectado: boolean; administra: boolean; setores: string[] }
const mundoNovo = (): Mundo => ({ documento: doc, conectado: true, administra: false, setores: ['Comunicação', 'Financeiro'] })
function fonteDe(m: Mundo): FonteDosPreparos {
  return {
    rodada: async () => ({ ok: false, codigo: 'encerrada', texto: 'Esta rodada já foi encerrada.' }), hashDoConteudo: async () => null, pessoa: async () => null, chamado: async () => null,
    assunto: async () => null, visitaEsperando: async () => null, avisosSemLer: async () => 0, mensagensDeHoje: async () => 0, canal: async () => null,
    chamadoParaAtender: async () => null, temPortaria: async () => true, decisao: async () => null,
    documentoParaGuardar: async () => m.documento,
    quemGuarda: async () => ({ conectado: m.conectado, administra: m.administra, setores: m.setores }),
  }
}
function preparadorDe(o: { podeAgir?: boolean; mundo?: Mundo; documentoEmRevisao?: DocumentoRecebido | null } = {}) {
  const rascunho = criarRascunho()
  const mundo = o.mundo ?? mundoNovo()
  const p = criarPreparador({
    fonte: fonteDe(mundo), tabela: TabelaDeMarcadores.de(null), rascunho, pessoaId: EU, podeAgir: o.podeAgir ?? true, noPalacio: true, escrita: true, recente: true,
    base: 'https://p', mensagensDia: 10, documentoEmRevisao: o.documentoEmRevisao,
  })
  return { ...p, rascunho, mundo }
}

async function conferirPreparo() {
  {
    const r = await preparadorDe().preparar('preparar_guardar_no_drive', { pasta: 'financeiro/2026', nome: '' })
    igual(r.ok && r.passo, { ...PASSO }, 'preparo: o documento que espera, na pasta do setor dela (escrita como no Palácio)')
  }
  {
    const r = await preparadorDe().preparar('preparar_guardar_no_drive', { pasta: 'Financeiro', nome: 'Contrato da Light' })
    igual(r.ok && r.passo.acao === 'guardar_no_drive' && r.passo.nome, 'Contrato da Light.pdf', 'preparo: o nome pedido, com a extensão')
  }
  {
    const r = await preparadorDe().preparar('preparar_guardar_no_drive', { pasta: 'RH/2026', nome: '' })
    igual(r.ok ? 'passou' : [r.oQue, r.motivo], ['guardar o documento no Drive', 'você guarda só na pasta do seu setor (Comunicação, Financeiro). Ex.: Comunicação/2026.'], 'preparo: a pasta de outro setor fica de fora, com o motivo')
  }
  {
    const m = mundoNovo()
    m.administra = true
    const r = await preparadorDe({ mundo: m }).preparar('preparar_guardar_no_drive', { pasta: 'RH/2026', nome: '' })
    igual(r.ok && r.passo.acao === 'guardar_no_drive' && r.passo.partes, ['RH', '2026'], 'preparo: quem administra guarda em qualquer pasta')
  }
  {
    const r = await preparadorDe({ podeAgir: false }).preparar('preparar_guardar_no_drive', { pasta: 'Financeiro', nome: '' })
    igual(r.ok ? 'passou' : r.motivo, 'sua conta usa a verificação em duas etapas; guarde direto no Google Drive', 'preparo: com a verificação em duas etapas, fica de fora')
  }
  {
    const m = mundoNovo()
    m.documento = null
    const r = await preparadorDe({ mundo: m }).preparar('preparar_guardar_no_drive', { pasta: 'Financeiro', nome: '' })
    igual(r.ok ? 'passou' : r.motivo, 'nenhum documento esperando a pasta; mande o documento por aqui', 'preparo: sem documento esperando')
    const revisao = await preparadorDe({ mundo: m, documentoEmRevisao: doc }).preparar('preparar_guardar_no_drive', { pasta: 'Financeiro/2025', nome: '' })
    igual(revisao.ok && revisao.passo.acao === 'guardar_no_drive' && [revisao.passo.mensagemId, revisao.passo.partes], ['wamid.doc1', ['Financeiro', '2025']], 'preparo: na correção, o documento vem do plano em revisão')
  }
  {
    const m = mundoNovo()
    m.conectado = false
    const r = await preparadorDe({ mundo: m }).preparar('preparar_guardar_no_drive', { pasta: 'Financeiro', nome: '' })
    igual(r.ok ? 'passou' : r.motivo, 'o Google Drive do Palácio não está conectado', 'preparo: sem o Drive conectado')
  }
  {
    const r = await preparadorDe().preparar('preparar_guardar_no_drive', { pasta: 'Financeiro/../RH', nome: '' })
    igual(r.ok, false, 'preparo: ".." não passa')
  }
  {
    const p = preparadorDe()
    const um = await p.preparar('preparar_guardar_no_drive', { pasta: 'Financeiro', nome: '' })
    if (um.ok) p.rascunho.acrescentar(um.passo, 'drive')
    const dois = await p.preparar('preparar_guardar_no_drive', { pasta: 'Comunicação', nome: '' })
    igual(dois.ok ? 'passou' : dois.erro, 'Já há um documento para guardar no plano: um por vez.', 'preparo: um documento por plano')
  }
  // A revalidação no "confirmo": o Drive ainda conectado e a pasta ainda do setor dela.
  igual((await revalidarPasso(PASSO, fonteDe(mundoNovo()), EU)).ok, true, 'revalidar: confere')
  const semSetor = mundoNovo()
  semSetor.setores = ['Comunicação']
  const r1 = await revalidarPasso(PASSO, fonteDe(semSetor), EU)
  igual([r1.ok, r1.codigo], [false, 'sem_permissao'], 'revalidar: saiu do setor depois do plano → nada feito')
  const desligado = mundoNovo()
  desligado.conectado = false
  igual((await revalidarPasso(PASSO, fonteDe(desligado), EU)).codigo, 'indisponivel', 'revalidar: o Drive desconectado depois do plano')
}

// ---------------------------------------------------------------- um turno com o modelo roteirizado, e o "confirmo"

type Bloco = Record<string, unknown>
const respostaDoModelo = (content: Bloco[], stop = 'tool_use') => ({
  id: 'msg_teste', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason: stop, stop_details: null, container: null, context_management: null,
  usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null, iterations: null },
}) as unknown as Anthropic.Beta.BetaMessage

async function conferirTurno() {
  const frase = 'guarda na pasta do financeiro, em 2026'
  const p = preparadorDe()
  const corpos: CorpoDaChamada[] = []
  const chamar: Chamar = async (corpo) => {
    corpos.push(JSON.parse(JSON.stringify(corpo)) as CorpoDaChamada)
    return respostaDoModelo([{ type: 'tool_use', id: 't1', name: 'preparar_guardar_no_drive', input: { pasta: 'Financeiro/2026', nome: '' } }])
  }
  const { contexto, mensagem } = montarContexto({
    avisos: [], pessoas: [], ultimaLista: [], planoEmRevisao: null, pergunta: null, citada: null, mensagem: frase,
    documento: { nome: doc.nome, tipo: doc.tipo, tamanho: tamanhoLegivel(doc.tamanho), setores: ['Comunicação', 'Financeiro'], administra: false },
  })
  contem(contexto, 'Documento esperando a pasta do Drive: “relatorio.pdf” (PDF, 2,3 MB) · ela guarda em: Comunicação, Financeiro', 'turno: o documento no contexto, escrito pelo código')
  const desfecho = await rodarTurno({
    chamar, relogio: () => 1_000_000, params: montarParams({ modelo: 'claude-opus-5-5', esforco: 'low', ttl: '1h' }), rascunho: p.rascunho, prazo: 1_120_000,
    inicial: [
      { role: 'user', content: [{ type: 'text', text: contexto }, { type: 'text', text: mensagem }] },
      { role: 'system', content: textoDaSituacao({ agora: new Date('2026-10-19T15:00:00Z'), papel: 'editor', nivel: 'amplo', podeAgir: true, confirmacaoNoPalacio: true, escrita: true }) },
    ],
    uso: { somar: () => undefined },
    executar: criarExecutar({
      handlers: { ler: async () => ({ ok: true, conteudo: '{}' }), preparar: p.preparar, perguntar: async () => ({ ok: false, erro: 'não' }) },
      permitidas: acoesPermitidas(frase), quantidade: null, rascunho: p.rascunho,
    }),
  })
  igual([desfecho.tipo, corpos.length, p.rascunho.passos.map((x) => x.acao)], ['plano', 1, ['guardar_no_drive']], 'turno: UMA chamada, o plano de guardar (terminal)')
  igual(corpos[0].tools?.length, 20, 'turno: as 20 ferramentas vão na chamada')
  naoContem(JSON.stringify(corpos[0]), '"thinking"', 'turno: sem o parâmetro thinking')

  // Sem pedir para guardar, o portão barra (o documento no contexto não basta).
  const p2 = preparadorDe()
  const semPedir = await rodarTurno({
    chamar: async () => respostaDoModelo([{ type: 'tool_use', id: 't9', name: 'preparar_guardar_no_drive', input: { pasta: 'Financeiro', nome: '' } }]), relogio: () => 1_000_000,
    params: montarParams({ modelo: 'claude-opus-5-5', esforco: 'low', ttl: '1h' }), rascunho: p2.rascunho, prazo: 1_120_000,
    inicial: [{ role: 'user', content: [{ type: 'text', text: contexto }, { type: 'text', text: '<mensagem>que horas é a reunião?</mensagem>' }] }],
    uso: { somar: () => undefined },
    executar: criarExecutar({
      handlers: { ler: async () => ({ ok: true, conteudo: '{}' }), preparar: p2.preparar, perguntar: async () => ({ ok: false, erro: 'não' }) },
      permitidas: acoesPermitidas('que horas é a reunião?'), quantidade: null, rascunho: p2.rascunho,
    }),
  })
  igual([semPedir.tipo === 'plano', p2.rascunho.passos.length], [false, 0], `turno: sem pedir, nada entra no plano (${TEXTOS_FIXOS.nao_pediu})`)

  // O plano guardado, entregue e confirmado: o executor de mentira guarda e devolve o link.
  let agora = Date.parse('2026-10-19T15:00:00Z')
  const repo = repoEmMemoria(() => agora)
  const fluxo = criarFluxoDoPlano(repo, () => agora, async (ms) => { agora += ms })
  const guardado = await fluxo.guardar({ workspaceId: ESPACO, userId: EU, numero: '5521987654321', papel: 'editor', tipo: 'plano', passos: p.rascunho.passos, opcoes: [], permitidas: ['drive'], pedidoEmAberto: null, sensivel: false })
  if (!guardado) { falhas++; console.log('FALHOU: turno: o plano não foi guardado'); return }
  agora += 1_000
  await fluxo.marcarEntrega(guardado.id, 'wamid.plano')
  const feitos: string[] = []
  const executar = async (x: Passo): Promise<ResultadoDaAcao> => {
    feitos.push(x.acao === 'guardar_no_drive' ? `${x.mensagemId}:${x.partes.join('/')}` : x.acao)
    return { ok: true, codigo: 'feito', texto: 'Documento guardado no Google Drive.', link: 'https://drive.google.com/file/d/abc/view' }
  }
  agora += 20_000
  const r = await fluxo.confirmar({
    plano: (await repo.buscar(guardado.id))!, pessoaId: EU, mensagem: { id: 'wamid.confirmo', enviadaEm: agora }, urlBase: 'https://p',
    conferirIdentidade: async () => null, revalidar: (x) => revalidarPasso(x, fonteDe(mundoNovo()), EU), executar,
  })
  igual([r.tipo, feitos], ['executado', ['wamid.doc1:Financeiro/2026']], 'confirmo: guarda uma vez, na pasta do plano')
  contem('texto' in r ? r.texto : '', '✓ Documento guardado no Google Drive em _Financeiro/2026_ — https://drive.google.com/file/d/abc/view', 'confirmo: o recibo com o link do arquivo')
  const depois = JSON.stringify((await repo.buscar(guardado.id))?.passos)
  naoContem(depois, 'relatorio.pdf', 'confirmo: o nome do documento some do plano na hora')
  naoContem(depois, 'api.kapso.ai', 'confirmo: e o endereço para baixá-lo também')
}

// ---------------------------------------------------------------- o código e a migração

const ler = (arquivo: string) => readFileSync(join(process.cwd(), arquivo), 'utf8')
const importsDe = (codigo: string) => [...codigo.matchAll(/^\s*import\s+(?!type\s)[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1])
igual(importsDe(ler('lib/google/drive-regras.ts')).filter((i) => i === 'server-only' || i.includes('supabase') || i.startsWith('node:') || i === 'next/server'), [], 'código: drive-regras.ts é puro')
igual(importsDe(ler('lib/whatsapp/drive-regras.ts')).filter((i) => i === 'server-only' || i.includes('supabase') || i.startsWith('node:')), [], 'código: as regras do WhatsApp para o Drive são puras')
contem(ler('lib/google/drive.ts'), "import 'server-only'", 'código: o Drive é só do servidor')
contem(ler('lib/google/drive.ts'), "ESCOPOS_DRIVE = ['https://www.googleapis.com/auth/drive.file']", 'código: escopo único, drive.file')
contem(ler('app/api/google/conectar-drive/route.ts'), "requirePermissao('integracoes.configurar')", 'código: conectar o Drive exige quem configura as integrações')
contem(ler('app/api/google/conectar-drive/route.ts'), '{ somenteEstes: true }', 'código: a autorização do Drive não soma os escopos do Gmail')
contem(ler('app/actions/google-drive.ts'), "requirePermissao('integracoes.configurar')", 'código: desconectar confere a permissão na action')
contem(ler('lib/integracoes/chaves.ts'), "google_drive: { nome: 'Autorização do Google Drive', variavel: 'GOOGLE_DRIVE_REFRESH', painel: '', oculto: true }", 'código: a chave do Drive é oculta (fora da tela de Integrações)')
contem(ler('lib/whatsapp/envio.ts'), 'await agendarCopiaDoEnvio(admin, virou.id as string)', 'código: só a conclusão que virou o estado agenda a cópia')

const migracao = ler('supabase/migrations/20261019030000_cvrj_google_drive.sql')
naoContem(migracao.toLowerCase(), 'drop policy', 'migração: sem drop policy')
naoContem(migracao.toLowerCase(), /drop\s+table|drop\s+column|truncate\s/, 'migração: só acrescenta')
contem(migracao, 'create table if not exists public.google_drive_conexao', 'migração: a tabela da conexão, idempotente')
contem(migracao, 'alter table public.google_drive_conexao force row level security', 'migração: RLS forçado')
contem(migracao, "policyname = 'google_drive_conexao_select_admin'", 'migração: a policy só se não existe')
contem(migracao, "(select private.workspace_role(workspace_id)) = 'admin'", 'migração: leitura só de administradores')
contem(migracao, 'add column if not exists drive_pasta_link', 'migração: o link da pasta no envio')
contem(migracao, 'add column if not exists drive_arquivo_id', 'migração: a marca de cada arquivo copiado')
contem(migracao, "v_novos text[] := array['guardar_documento']", 'migração: o tipo novo de pergunta')
contem(migracao, "'atendimento', 'registro_visita', 'financeiro', 'drive'", 'migração: "drive" no portão do assistente')
contem(migracao, "language sql immutable set search_path = ''", 'migração: o validador com search_path vazio')

conferirPreparo().then(conferirTurno).then(() => {
  if (falhas) { console.log(`\n${falhas} falha(s).`); process.exit(1) }
  console.log('Google Drive: tudo certo.')
}).catch((causa) => { console.log('FALHOU: lançou', causa); process.exit(1) })
