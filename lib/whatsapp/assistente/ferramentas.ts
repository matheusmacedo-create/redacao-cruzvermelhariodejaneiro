import type Anthropic from '@anthropic-ai/sdk'
import { NOMES_DAS_FERRAMENTAS, type NomeDaFerramenta } from './regras'

/**
 * As ferramentas do assistente do WhatsApp, exatamente como vão no `tools` da chamada (ARQUITETURA §8.5). Módulo
 * puro — conferido por `npx tsx scripts/conferir-assistente.ts`.
 *
 * A lista é a MESMA para todo mundo e fica em ordem de nome: ela é o começo do prefixo do cache (ferramentas e
 * depois o sistema), e qualquer byte diferente invalida o cache de todos. Por isso a permissão, o nível de leitura,
 * a escrita ligada ou não e o portão de intenção são conferidos no handler (leituras.ts, laco.ts), nunca tirando
 * ferramenta da lista (sem a escrita ligada para a pessoa, os preparar_* respondem "escrita desligada").
 *
 * Regras do modo strict (e da segurança): todo objeto com additionalProperties: false e toda propriedade em
 * required; sem null nem uniões (o opcional é "" ou []); sem minLength, maximum ou pattern (tamanhos e formatos
 * ficam em validarEntrada, regras.ts). Item é sempre marcador (apr_1, pes_3), nunca uuid, número, e-mail ou URL.
 *
 * São 20, o teto: as 17 da v1 com as da onda 2 (o atendimento do chamado, o registro de visita, a decisão do
 * Financeiro, sempre no Palácio, e consultar_area no lugar de ver_status_do_whatsapp). A troca reescreveu o prefixo
 * do cache uma vez; daqui em diante ele volta a ser lido.
 */

type Ferramenta = Anthropic.Beta.BetaTool & { name: NomeDaFerramenta; strict: true }

const objeto = (properties: Record<string, unknown>) => ({
  type: 'object' as const, properties, required: Object.keys(properties), additionalProperties: false,
})

export const FERRAMENTAS: readonly Ferramenta[] = [
  {
    name: 'buscar_ajuda', strict: true,
    description: 'Busca trechos da Central de ajuda do Palácio, só nas áreas que esta pessoa abre. Chame quando a pessoa perguntar como fazer algo no Palácio ("como troco a senha?", "onde vejo os ofícios?"). O sistema acrescenta os links à sua resposta.',
    input_schema: objeto({ pergunta: { type: 'string', description: 'A dúvida em poucas palavras (até 300 caracteres).' } }),
  },
  {
    name: 'buscar_pessoa', strict: true,
    description: 'Procura colegas ativos do espaço pelo nome e devolve marcadores pes_ com nome, @usuário e setor. Chame quando a pessoa citar alguém pelo nome e o marcador dessa pessoa ainda não estiver no contexto.',
    input_schema: objeto({ nome: { type: 'string', description: 'Nome ou parte do nome (3 a 60 caracteres).' } }),
  },
  {
    name: 'consultar_area', strict: true,
    description: 'Consulta uma área do Palácio que esta pessoa abre: financeiro (despesas e compras que esperam a decisão dela, com marcadores des_ e com_), frota (veículos agora), estoque (saldo de um material: diga o material em busca), portaria (visitas de hoje) ou whatsapp (a saúde do canal, só para quem administra). Sem valores, telefones nem endereços.',
    input_schema: objeto({
      area: { type: 'string', enum: ['financeiro', 'frota', 'estoque', 'portaria', 'whatsapp'] },
      busca: { type: 'string', description: 'O material, no estoque (2 a 80 caracteres); "" nas outras áreas.' },
    }),
  },
  {
    name: 'ler_agenda', strict: true,
    description: 'Lista os itens da agenda da pessoa num intervalo de até 14 dias, com as camadas que ela deixou ligadas. Chame quando ela perguntar o que tem marcado (hoje, amanhã, semana que vem).',
    input_schema: objeto({ de: { type: 'string', format: 'date' }, ate: { type: 'string', format: 'date' } }),
  },
  {
    name: 'ler_aprovacoes', strict: true,
    description: 'Lista as aprovações editoriais abertas que esperam o voto da pessoa, ou as que ela pediu. Chame quando ela perguntar o que tem para aprovar, ou antes de preparar votos em aprovações que não estão no contexto.',
    input_schema: objeto({ situacao: { type: 'string', enum: ['esperando_meu_voto', 'que_eu_pedi'] } }),
  },
  {
    name: 'ler_avisos', strict: true,
    description: 'Lista os avisos do sino da pessoa, mais novos primeiro. Chame quando ela perguntar se tem algo pendente ou o que chegou.',
    input_schema: objeto({ so_nao_lidos: { type: 'boolean' } }),
  },
  {
    name: 'ler_chamados', strict: true,
    description: 'Lista chamados: os que a pessoa abriu, os que estão com ela, ou os das filas que ela atende. Chame quando ela perguntar por chamados ou antes de agir num chamado que não está no contexto.',
    input_schema: objeto({
      escopo: { type: 'string', enum: ['abri', 'comigo', 'minhas_filas'] },
      situacao: { type: 'string', enum: ['abertos', 'encerrados_7_dias'] },
      busca: { type: 'string', description: 'Palavras do título; "" para todos.' },
    }),
  },
  {
    name: 'ler_filas_de_chamado', strict: true,
    description: 'Lista as filas que recebem chamados e os assuntos de cada uma (e se o assunto pede local). Chame antes de preparar_chamado.',
    input_schema: objeto({}),
  },
  {
    name: 'perguntar', strict: true,
    description: 'Faz uma pergunta curta à pessoa quando falta algo sem o qual a ação não faz sentido (qual de duas pessoas, qual chamado, quais aprovações). Termina a sua vez: o sistema mostra as opções e o resumo do pedido. Use só marcadores do contexto ou de resultados.',
    input_schema: objeto({
      pergunta: { type: 'string', description: 'Até 120 caracteres, ex.: "Qual Ana?"' },
      opcoes: { type: 'array', items: { type: 'string' }, description: 'De 2 a 10 marcadores.' },
      pedido_em_aberto: { type: 'string', description: 'Resumo fiel do que a pessoa pediu, para continuar depois da resposta (até 300 caracteres, sem dados pessoais). A pessoa vê este resumo.' },
    }),
  },
  {
    name: 'preparar_atendimento_do_chamado', strict: true,
    description: 'Prepara, para quem atende a fila do chamado, assumir (fica com a pessoa), resolver (a nota é a solução que quem abriu vai ler) ou transferir para outra fila (fila e assunto de ler_filas_de_chamado; a nota é o motivo). Não faz: acrescenta um passo ao plano.',
    input_schema: objeto({
      chamado: { type: 'string' },
      acao: { type: 'string', enum: ['assumir', 'resolver', 'transferir'] },
      fila: { type: 'string', description: 'Marcador fil_ da fila de destino, só para transferir; "" nas outras.' },
      assunto: { type: 'string', description: 'Marcador ass_ do assunto na fila de destino, só para transferir; "" nas outras.' },
      nota: { type: 'string', description: 'A solução (resolver) ou o motivo (transferir), nas palavras da pessoa, sem links; "" para assumir.' },
    }),
  },
  {
    name: 'preparar_chamado', strict: true,
    description: 'Prepara a abertura de um chamado em nome da pessoa. Não abre: acrescenta um passo ao plano que ela vai confirmar. Chame quando ela relatar um problema para a equipe de apoio resolver.',
    input_schema: objeto({
      fila: { type: 'string' },
      assunto: { type: 'string' },
      relato: { type: 'string', description: 'O problema, nas palavras dela (5 a 4.000 caracteres).' },
      local: { type: 'string', description: 'Sala, andar ou setor; "" se o assunto não pede.' },
      urgencia: { type: 'integer', enum: [1, 2, 3] },
    }),
  },
  {
    name: 'preparar_comentario_no_chamado', strict: true,
    description: 'Prepara um comentário num chamado em que a pessoa é solicitante ou equipe. Não envia: acrescenta um passo ao plano.',
    input_schema: objeto({ chamado: { type: 'string' }, texto: { type: 'string', description: '2 a 4.000 caracteres, sem links.' } }),
  },
  {
    name: 'preparar_decisao_financeira', strict: true,
    description: 'Prepara aprovar ou recusar uma despesa (des_) ou uma compra (com_) de consultar_area financeiro, que espera a decisão desta pessoa. Não decide: acrescenta um passo ao plano, e a decisão termina sempre no Palácio, com a sessão dela.',
    input_schema: objeto({
      item: { type: 'string' },
      decisao: { type: 'string', enum: ['aprovar', 'recusar'] },
      motivo: { type: 'string', description: 'Obrigatório para recusar (quem pediu recebe), nas palavras dela; "" para aprovar.' },
    }),
  },
  {
    name: 'preparar_marcar_avisos_lidos', strict: true,
    description: 'Prepara marcar avisos do sino como lidos (todos ou os indicados). Não marca: acrescenta um passo ao plano.',
    input_schema: objeto({
      escopo: { type: 'string', enum: ['todos', 'estes'] },
      avisos: { type: 'array', items: { type: 'string' }, description: 'Marcadores avi_ quando escopo = estes; [] quando todos.' },
    }),
  },
  {
    name: 'preparar_mensagem_direta', strict: true,
    description: 'Prepara uma mensagem direta do Palácio, em nome da pessoa, para um colega. Chega no sino dele e, se ele recebe avisos pelo WhatsApp, por lá. Não envia: acrescenta um passo ao plano. Use também quando ela pedir para "mandar no WhatsApp" de alguém.',
    input_schema: objeto({
      para: { type: 'string' },
      texto: { type: 'string', description: 'Primeira pessoa, curto e cordial, 1 a 1.000 caracteres, sem links e sem pedir senha ou código.' },
    }),
  },
  {
    name: 'preparar_registro_de_visita', strict: true,
    description: 'Prepara, para quem cuida da portaria, registrar a entrada de um visitante para uma pessoa do Palácio (marcador pes_), que recebe o aviso e responde à portaria. Não registra: acrescenta um passo ao plano.',
    input_schema: objeto({
      visitante: { type: 'string', description: 'Nome do visitante (2 a 120 caracteres).' },
      empresa: { type: 'string', description: 'De onde ele vem; "" se a pessoa não disse.' },
      visitado: { type: 'string' },
      motivo: { type: 'string', description: 'Até 300 caracteres; "" se a pessoa não disse.' },
    }),
  },
  {
    name: 'preparar_resposta_a_visita', strict: true,
    description: 'Prepara a resposta da pessoa à portaria sobre uma visita para ela. Não responde: acrescenta um passo ao plano.',
    input_schema: objeto({
      visita: { type: 'string' },
      resposta: { type: 'string', enum: ['subir', 'aguardar', 'recusar'] },
      recado: { type: 'string', description: 'Até 200 caracteres; "" sem recado.' },
    }),
  },
  {
    name: 'preparar_voto', strict: true,
    description: 'Prepara o voto da pessoa numa aprovação editorial do contexto ou de ler_aprovacoes: aprovar ou pedir ajustes. Não vota: acrescenta um passo ao plano.',
    input_schema: objeto({
      aprovacao: { type: 'string' },
      decisao: { type: 'string', enum: ['aprovar', 'pedir_ajustes'] },
      nota: { type: 'string', description: 'Obrigatória para pedir ajustes (o que mudar, nas palavras dela); "" para aprovar.' },
    }),
  },
  {
    name: 'ver_aprovacao', strict: true,
    description: 'Detalha uma aprovação: título, quem pediu, votos, o voto da pessoa e a conferência do setor (e um trecho do texto, quando a pessoa pode vê-lo por aqui). Chame quando ela perguntar do que se trata ou como está uma aprovação.',
    input_schema: objeto({ aprovacao: { type: 'string' } }),
  },
  {
    name: 'ver_chamado', strict: true,
    description: 'Detalha um chamado do contexto ou de ler_chamados: situação, fila, prazos e as últimas interações. Aceita só o marcador cha_.',
    input_schema: objeto({ chamado: { type: 'string' } }),
  },
]

/** Os nomes na ordem da lista (a mesma de NOMES_DAS_FERRAMENTAS, em regras.ts: o script confere). */
export const NOMES_NA_LISTA: readonly string[] = FERRAMENTAS.map((f) => f.name)

/** O teto do script: a lista nunca passa de LIMITES.ferramentas, nem foge da lista fechada. */
export const ferramentasConferem = (): boolean =>
  NOMES_NA_LISTA.length === NOMES_DAS_FERRAMENTAS.length && NOMES_NA_LISTA.every((n, i) => n === NOMES_DAS_FERRAMENTAS[i])
