/**
 * Confere as regras da Portaria virtual: `npx tsx scripts/conferir-portaria.ts`.
 * Sai com código 1 se algo estiver errado.
 */
import {
  crachaPendente, diaEmSaoPaulo, entrouEmOutroDia, ehTokenDaEntrada, fotoDaVisita, haQuanto, lerVisitante, linkDaEntrada, quemVisita,
  situacaoDaVisita, urlDaFotoDoVisitante, caminhoDaFotoDoVisitante, numerosDeCracha, prefixoDoCracha, folhasDeCrachas, formatoDoCracha, crachasPorFolha,
  lerRespostaDaVisita, respostaClaraDaVisita, linkDaVisita, mensagemParaVisitante, avisoParaPortaria, situacaoDaResposta,
} from '../lib/portaria/regras'

let falhas = 0
function igual<T>(obtido: T, esperado: T, caso: string) {
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) { falhas++; console.log(`FALHOU: ${caso}\n  esperado ${JSON.stringify(esperado)}\n  obtido   ${JSON.stringify(obtido)}`) }
}
const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null })

igual(situacaoDaVisita({ entrada_em: null, saida_em: null, descartada_em: null }), 'aguardando', 'autocadastro esperando')
igual(situacaoDaVisita({ entrada_em: '2026-09-27T13:00:00Z', saida_em: null, descartada_em: null }), 'dentro', 'dentro')
igual(situacaoDaVisita({ entrada_em: '2026-09-27T13:00:00Z', saida_em: '2026-09-27T14:00:00Z', descartada_em: null }), 'saiu', 'saiu')
igual(situacaoDaVisita({ entrada_em: null, saida_em: null, descartada_em: '2026-09-27T13:00:00Z' }), 'descartada', 'descartada')

igual(crachaPendente({ cracha_numero: 'V-07', cracha_devolvido_em: null, saida_em: '2026-09-27T14:00:00Z' }), true, 'saiu sem devolver')
igual(crachaPendente({ cracha_numero: 'V-07', cracha_devolvido_em: null, saida_em: null }), false, 'ainda dentro: não é pendência')
igual(crachaPendente({ cracha_numero: null, cracha_devolvido_em: null, saida_em: '2026-09-27T14:00:00Z' }), false, 'sem crachá')

// 02:30 UTC de 27/09 ainda é 26/09 em Brasília.
igual(diaEmSaoPaulo('2026-09-27T02:30:00Z'), '2026-09-26', 'dia no fuso de Brasília')
igual(entrouEmOutroDia({ entrada_em: '2026-09-26T20:00:00Z', saida_em: null }, '2026-09-27'), true, 'esqueceram a saída de ontem')
igual(entrouEmOutroDia({ entrada_em: '2026-09-27T12:00:00Z', saida_em: null }, '2026-09-27'), false, 'entrou hoje')

const agora = new Date('2026-09-27T15:00:00Z')
igual(haQuanto('2026-09-27T14:59:40Z', agora), 'agora', 'agora')
igual(haQuanto('2026-09-27T14:55:00Z', agora), 'há 5 min', 'minutos')
igual(haQuanto('2026-09-27T12:50:00Z', agora), 'há 2 h 10 min', 'horas e minutos')
igual(haQuanto('2026-09-24T15:00:00Z', agora), 'há 3 dias', 'dias')

igual(quemVisita({ visitado_texto: 'Voluntariado' }, 'Ana Lima'), 'Ana Lima · Voluntariado', 'pessoa e setor')
igual(quemVisita({ visitado_texto: 'ana lima' }, 'Ana Lima'), 'Ana Lima', 'sem repetir')
igual(quemVisita({ visitado_texto: null }, null), '', 'ninguém')

const p = lerVisitante(form({ nome: '  Maria   da Silva ', telefone: '(21) 99999-0000', visitado_id: '00000000-0000-4000-8000-00000000aa01', cracha_numero: ' V-07 ' }))
igual(p.erros, [], 'portaria: sem erros')
igual([p.dados.nome, p.dados.cracha_numero, p.dados.visitado_id], ['Maria da Silva', 'V-07', '00000000-0000-4000-8000-00000000aa01'], 'portaria: campos limpos')
igual(lerVisitante(form({ nome: 'A' })).erros, ['Escreva o nome do visitante.'], 'nome curto')
igual(lerVisitante(form({ nome: 'Ana', telefone: 'abc' })).erros, ['Telefone inválido: use só números, com DDD.'], 'telefone inválido')
igual(lerVisitante(form({ nome: 'Ana', visitado_id: 'x' })).erros, ['Pessoa visitada inválida.'], 'visitado inválido')
const pub = lerVisitante(form({ nome: 'Carlos', visitado_id: '00000000-0000-4000-8000-00000000aa01', cracha_numero: 'V-1', visitado_texto: 'Voluntariado' }), true)
igual([pub.erros, pub.dados.visitado_id, pub.dados.cracha_numero], [[], undefined, undefined], 'autocadastro não escolhe pessoa nem crachá')
igual(lerVisitante(form({ nome: 'Carlos' }), true).erros, ['Diga quem você vai visitar ou o motivo da visita.'], 'autocadastro precisa de quem ou por quê')

const ws = '7cbe994e-60db-42fa-b2da-db2429af4c45', vis = 'a0a0a0a0-0000-4000-8000-000000000001', arq = '11111111-1111-4111-8111-111111111111'
const caminho = caminhoDaFotoDoVisitante(ws, vis, arq)
igual(fotoDaVisita(caminho, ws, vis), true, 'foto desta visita')
igual(fotoDaVisita(caminho, ws, 'a0a0a0a0-0000-4000-8000-000000000002'), false, 'foto de outra visita')
igual(fotoDaVisita('voluntarios/x.jpg', ws, vis), false, 'caminho de outro lugar')
igual(urlDaFotoDoVisitante(vis, caminho), `/api/portaria/${vis}/foto?v=${arq}`, 'endereço da foto')
igual(ehTokenDaEntrada('abcdefghijklmnopqrstuvwxyz_-12'), true, 'token válido')
igual(ehTokenDaEntrada('curto'), false, 'token curto')
igual(ehTokenDaEntrada('a'.repeat(30) + '/'), false, 'token com barra')
igual(linkDaEntrada('https://palacio.exemplo/', 'T'.repeat(32)), `https://palacio.exemplo/visitante?t=${'T'.repeat(32)}`, 'link do QR')

igual(numerosDeCracha('v', 1, 3), ['V-01', 'V-02', 'V-03'], 'numeração com zero')
igual(numerosDeCracha('V', 99, 101), ['V-099', 'V-100', 'V-101'], 'largura pelo maior número')
igual(numerosDeCracha('V', null, null).length, 9, 'padrão: uma folha')
igual(numerosDeCracha('V', 5, 2), ['V-05'], 'fim antes do início: só o início')
igual(numerosDeCracha('V', 1, 500).length, 99, 'no máximo 99 por vez')
igual(prefixoDoCracha('pres'), 'PRES', 'prefixo em maiúsculas')
igual(prefixoDoCracha('<b>'), 'V', 'prefixo inválido vira V')
igual(prefixoDoCracha('Visitânte'), 'V', 'mais de 5 letras vira V')
const folhas = folhasDeCrachas(numerosDeCracha('V', 1, 10))
igual(folhas.length, 2, 'dez crachás: duas folhas')
igual(folhas[0].verso.slice(0, 3), ['V-03', 'V-02', 'V-01'], 'verso espelhado na linha')
igual(folhas[1].frente.filter(Boolean), ['V-10'], 'segunda folha com o que sobrou')
igual(folhas[1].verso.slice(0, 3), [null, null, 'V-10'], 'verso da sobra no lugar certo')
const deitados = folhasDeCrachas(numerosDeCracha('V', 1, 12, crachasPorFolha('deitado')), 'deitado')
igual(numerosDeCracha('V', null, null, crachasPorFolha('deitado')).length, 10, 'deitado: padrão de uma folha com 10')
igual(deitados.length, 2, 'deitado: doze crachás, duas folhas')
igual(deitados[0].verso.slice(0, 4), ['V-02', 'V-01', 'V-04', 'V-03'], 'deitado: verso espelhado em cada linha de 2')
igual(deitados[1].verso.slice(0, 2), ['V-12', 'V-11'], 'deitado: sobra espelhada')
igual(formatoDoCracha('empe'), 'empe', 'formato em pé')
igual(formatoDoCracha('x'), 'deitado', 'formato padrão: deitado')

// A resposta de quem é visitado (migração 20260929160000)
igual(lerRespostaDaVisita('1'), { resposta: 'subir', recado: null }, 'resposta 1: pode subir')
igual(lerRespostaDaVisita('Pode subir!'), { resposta: 'subir', recado: null }, 'pode subir, com exclamação')
igual(lerRespostaDaVisita('2 estou em reunião, 10 min'), { resposta: 'aguardar', recado: 'estou em reunião, 10 min' }, 'aguardar com recado')
igual(lerRespostaDaVisita('Aguarde: já desço'), { resposta: 'aguardar', recado: 'já desço' }, 'aguarde com dois-pontos')
igual(lerRespostaDaVisita('3 - estou fora hoje'), { resposta: 'recusar', recado: 'estou fora hoje' }, 'recusar com recado')
igual(lerRespostaDaVisita('Não posso receber agora'), { resposta: 'recusar', recado: null }, 'não posso receber agora')
igual(lerRespostaDaVisita('nao'), { resposta: 'recusar', recado: null }, 'não sem acento')
igual(lerRespostaDaVisita('12 pessoas'), null, '12 não é 1')
igual(lerRespostaDaVisita('subindo a escada'), null, '"subindo" não é "sobe"')
igual(lerRespostaDaVisita('olá'), null, 'outra conversa')
igual(respostaClaraDaVisita('sim'), null, 'sem citar, "sim" solto não vale')
igual(respostaClaraDaVisita('ok'), null, 'sem citar, "ok" solto não vale')
igual(respostaClaraDaVisita('1')?.resposta, 'subir', 'sem citar, "1" vale')
igual(respostaClaraDaVisita('não posso, estou fora')?.resposta, 'recusar', 'sem citar, "não posso" vale')
igual(linkDaVisita('a'.repeat(8)), '/portaria/visita/aaaaaaaa', 'link da visita')
const paraVisitante = mensagemParaVisitante({ visitante: 'José Pereira', quem: 'Ana Lima', setor: 'Comunicação Social', resposta: 'subir' })
igual(paraVisitante.startsWith('Olá, José! *Pode subir.* Ana Lima (Comunicação Social)'), true, 'mensagem ao visitante: pode subir, com o setor')
igual(paraVisitante.includes('Recado'), false, 'mensagem ao visitante não leva o recado (é para a portaria)')
igual(mensagemParaVisitante({ visitante: 'José', quem: '*Ana*', setor: null, resposta: 'aguardar' }).includes('*Ana*'), false, 'nome sem formatação do WhatsApp')
const aviso = avisoParaPortaria({ visitante: 'José Pereira', quemRespondeu: 'Ana Lima', resposta: 'recusar', recado: 'fora hoje', visitanteAvisado: true })
igual(aviso.titulo, 'Não pode receber agora: José Pereira', 'aviso à portaria: título')
igual(aviso.mensagem.includes('Recado: fora hoje. O visitante') && aviso.mensagem.includes('recebeu a resposta pelo WhatsApp'), true, 'aviso à portaria: recado e visitante avisado')
igual(situacaoDaResposta({ visitado_id: null, resposta: null }), 'sem_pessoa', 'sem pessoa do Palácio, sem resposta')
igual(situacaoDaResposta({ visitado_id: 'x', resposta: null }), 'esperando', 'esperando a resposta')
const autorizou = (tel: string, marca: string | null) => lerVisitante({ get: (n: string) => ({ nome: 'José', telefone: tel, motivo: 'reunião', avisar_visitante: marca } as Record<string, unknown>)[n] ?? null }, true).dados.avisar_visitante
igual(autorizou('21999991234', 'on'), true, 'autorização com telefone')
igual(autorizou('', 'on'), false, 'autorização sem telefone não vale')
igual(autorizou('21999991234', null), false, 'sem marcar, não autoriza')

if (falhas) { console.error(`\n${falhas} falha(s).`); process.exit(1) }
console.log('Portaria: tudo certo.')
