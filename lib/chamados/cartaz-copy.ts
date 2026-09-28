import type { CopyPorModelo } from './cartaz'

/**
 * A copy do cartaz de chamados escrita para cada setor conhecido, pelo
 * prefixo do modelo (lib/chamados/setores.ts). Entra no seletor logo depois
 * da chamada de sempre ("Precisa de…?"), antes das genéricas.
 *
 * Saiu de um painel de redação (3 ângulos × 3 lentes: leitura a 2 m, voz da
 * casa, regras técnicas), com os melhores de cada setor revisados à mão.
 * Marcadores (lib/cartaz/copy.ts, montarChamada): {setor}, {a} {setor},
 * {descricao}, {assuntos}. Nunca o nome do setor por extenso — a fila pode
 * ser renomeada; e nada de "peça a {setor}" (pede crase). Conferido por
 * scripts/conferir-cartaz-dos-chamados.ts: tamanho, marcadores, sem nome literal.
 */
export const COPY_POR_MODELO: CopyPorModelo = {
  TI: {
    travou: { rotulo: 'Travou, caiu ou não abre?', titulo: ['Travou, caiu ou não abre?', 'Abra um chamado.'], texto: 'Computador, internet, impressora, senha ou acesso: {a} {setor} recebe o pedido registrado, com número e prazo, e você acompanha a resposta.' },
    'sem-senha': { rotulo: 'Travou, caiu ou sem senha?', titulo: ['Travou, caiu ou sem senha?', 'Abra um chamado.'], texto: 'Conte com {a} {setor}: computador, internet, e-mail, acesso, impressora e programa novo. O chamado fica registrado e tem prazo.' },
  },
  MAN: {
    quebrou: { rotulo: 'Quebrou, vazou ou apagou?', titulo: ['Quebrou, vazou ou apagou?', 'Abra um chamado.'], texto: 'Lâmpada, tomada, torneira, porta, ar-condicionado, móvel para montar ou fechadura para trocar: pelo chamado, o reparo fica registrado e com prazo.' },
    pingou: { rotulo: 'Pingou, apagou ou não fecha?', titulo: ['Pingou, apagou ou não fecha?', 'Abra um chamado.'], texto: 'Tomada, lâmpada, torneira, porta ou ar-condicionado: descreva no chamado e {a} {setor} recebe o pedido registrado, com prazo de resposta.' },
  },
  COM: {
    'arte-faltando': { rotulo: 'Ação marcada, arte faltando?', titulo: ['Ação marcada, arte faltando?', 'Abra um chamado.'], texto: 'Card, cartaz, post, foto do evento ou nota para a imprensa: peça por chamado e {a} {setor} recebe com data, registro e prazo.' },
    'arte-ou-post': { rotulo: 'Precisa de arte ou de post?', titulo: ['Precisa de arte', 'ou de post?'], texto: 'Card, cartaz, foto ou notícia: peça por chamado. Fica registrado e chega a quem faz.' },
  },
  JUR: {
    contrato: { rotulo: 'Contrato para assinar?', titulo: ['Contrato para assinar?', 'Abra um chamado.'], texto: 'Minuta, convênio, termo, procuração ou dúvida sobre um caso: {a} {setor} analisa por chamado, com registro e prazo de resposta.' },
    'termo-duvida': { rotulo: 'Contrato, termo ou dúvida?', titulo: ['Contrato, termo ou dúvida?', 'Abra um chamado.'], texto: 'Conte com {a} {setor} para revisar contrato ou convênio, preparar termo, procuração ou declaração e tirar dúvidas. Fica registrado e com prazo.' },
  },
  FIN: {
    'pagou-do-bolso': { rotulo: 'Pagou do bolso?', titulo: ['Pagou do bolso?', 'Peça o reembolso por chamado.'], texto: 'Reembolso, nota fiscal, boleto ou prestação de contas: anexe o comprovante no chamado e {a} {setor} recebe o pedido registrado, com prazo.' },
    reembolso: { rotulo: 'Reembolso ou nota para pagar?', titulo: ['Reembolso ou', 'nota para pagar?'], texto: 'Comprovante em mãos? Abra um chamado: fica registrado e {a} {setor} responde com prazo.' },
  },
  CPR: {
    acabou: { rotulo: 'Acabou o papel ou o café?', titulo: ['Acabou o papel ou o café?', 'Abra um chamado.'], texto: 'Papelaria, limpeza, copa ou cotação de serviço: peça por chamado e {a} {setor} recebe o pedido registrado, com prazo de resposta.' },
    comprar: { rotulo: 'Precisa comprar algo?', titulo: ['Precisa comprar algo?', 'Abra um chamado.'], texto: 'Cotação de produto ou serviço e material de papelaria, limpeza e copa: pelo chamado, o pedido chega a quem compra e tem prazo.' },
  },
  RH: {
    ferias: { rotulo: 'Férias, ponto ou holerite?', titulo: ['Férias, ponto ou holerite?', 'Abra um chamado.'], texto: 'Declaração de vínculo, informe de rendimentos, férias, ponto ou benefícios: {a} {setor} recebe por chamado, com registro e prazo.' },
    declaracao: { rotulo: 'Férias, holerite ou declaração?', titulo: ['Férias, holerite', 'ou declaração?'], texto: 'Documento, ponto ou benefício: abra um chamado e acompanhe a resposta, com prazo.' },
  },
  DIR: {
    oficio: { rotulo: 'Ofício sem assinatura?', titulo: ['Ofício sem assinatura?', 'Abra um chamado.'], texto: 'Assinatura, autorização, agenda ou representação em evento: peça por chamado e {a} {setor} recebe com registro, número e prazo.' },
    aval: { rotulo: 'Assinatura, agenda ou aval?', titulo: ['Assinatura, agenda ou aval?', 'Abra um chamado.'], texto: 'Ofício, contrato ou termo para assinar, reunião ou evento com {a} {setor} e autorização de ação, gasto ou uso do nome. Registrado e com prazo.' },
  },
  VOL: {
    faltam: { rotulo: 'Faltam voluntários na ação?', titulo: ['Faltam voluntários na ação?', 'Abra um chamado.'], texto: 'Voluntários para uma ação ou declaração de horas: diga quantos, quando e onde no chamado e {a} {setor} recebe o pedido registrado, com prazo.' },
    voluntarios: { rotulo: 'Precisa de voluntários?', titulo: ['Precisa de', 'voluntários?'], texto: 'Ação ou declaração de horas: abra um chamado e {a} {setor} organiza, com prazo.' },
  },
  JUV: {
    jovens: { rotulo: 'Ação com jovens?', titulo: ['Ação com jovens?', 'Conte com {a} {setor}.'], texto: 'Apoio de grupos jovens numa ação: quantas pessoas, quando e onde. Pelo chamado, o pedido chega a quem coordena e tem prazo de resposta.' },
    'na-sua-acao': { rotulo: 'Quer jovens na sua ação?', titulo: ['Quer jovens', 'na sua ação?'], texto: 'Diga quantos, quando e onde: {a} {setor} recebe o pedido registrado, com prazo.' },
  },
  PSO: {
    'sem-socorrista': { rotulo: 'Evento sem socorrista?', titulo: ['Evento sem socorrista?', 'Abra um chamado.'], texto: 'Cobertura de evento ou treinamento da equipe: informe data, local e público no chamado e {a} {setor} recebe o pedido registrado, com prazo.' },
    socorristas: { rotulo: 'Evento precisa de socorristas?', titulo: ['Evento precisa', 'de socorristas?'], texto: 'Cobertura ou treinamento: abra um chamado com data e local. Tem registro e prazo.' },
  },
  GRD: {
    emergencia: { rotulo: 'Emergência ou prevenção?', titulo: ['Emergência ou prevenção?', 'Acione {a} {setor}.'], texto: 'Enchente, deslizamento ou incêndio em andamento, e também palestra, simulado ou mapeamento de risco. O chamado chega a quem responde e tem prazo.' },
    risco: { rotulo: 'Risco à vista?', titulo: ['Risco à vista?', 'Abra um chamado.'], texto: 'Emergência, simulado ou palestra: {a} {setor} atende por chamado, com registro e prazo.' },
  },
  EDU: {
    certificado: { rotulo: 'Faltou o certificado?', titulo: ['Faltou o certificado?', 'Abra um chamado.'], texto: 'Abrir turma, inscrição, material de curso, emissão ou segunda via de certificado: {a} {setor} recebe por chamado, com registro e prazo.' },
    turma: { rotulo: 'Turma nova ou certificado?', titulo: ['Turma nova ou', 'certificado?'], texto: 'Turma, inscrição ou segunda via: peça por chamado. Fica registrado e tem prazo.' },
  },
  PSS: {
    acolhimento: { rotulo: 'Alguém precisa de acolhimento?', titulo: ['Alguém precisa', 'de acolhimento?'], texto: 'Apoio numa ação ou encaminhamento: abra um chamado e {a} {setor} responde com prazo.' },
    apoio: { rotulo: 'Alguém precisa de apoio?', titulo: ['Alguém precisa de apoio?', 'Abra um chamado.'], texto: 'Acolhimento numa emergência ou encaminhamento de pessoa ou família: descreva no chamado e {a} {setor} recebe com registro e prazo.' },
  },
  SAU: {
    acao: { rotulo: 'Ação de saúde à vista?', titulo: ['Ação de saúde à vista?', 'Chame {a} {setor}.'], texto: 'Campanha, aferição de pressão, vacinação ou palestra: {a} {setor} está à disposição. Pelo chamado, o pedido fica registrado e com prazo.' },
    vacinacao: { rotulo: 'Vacinação ou palestra?', titulo: ['Vacinação ou palestra?', 'Abra um chamado.'], texto: 'Campanha, aferição, vacinação ou palestra: informe data, local e público no chamado e {a} {setor} recebe o pedido registrado, com prazo de resposta.' },
  },
  HUM: {
    doacao: { rotulo: 'Chegou uma doação?', titulo: ['Chegou uma doação?', 'Abra um chamado.'], texto: 'Doação recebida ou oferecida, itens, pessoas ou transporte para uma ação: diga o que, quanto e onde, e {a} {setor} recebe com registro e prazo.' },
    apoio: { rotulo: 'Doação chegou?', titulo: ['Doação chegou?', 'Abra um chamado.'], texto: 'Doação ou apoio a uma ação: {a} {setor} recebe por chamado, com registro e prazo.' },
  },
  ESP: {
    jogo: { rotulo: 'Jogo ou atividade à vista?', titulo: ['Jogo ou atividade à vista?', 'Abra um chamado.'], texto: 'Atividade ou evento com data, local e público: peça por chamado e {a} {setor} recebe o pedido registrado, com prazo de resposta.' },
    evento: { rotulo: 'Evento esportivo à vista?', titulo: ['Evento esportivo', 'à vista?'], texto: 'Data, local e público: abra um chamado e {a} {setor} organiza, com prazo.' },
  },
  FRO: {
    pane: { rotulo: 'Pane, multa ou transporte?', titulo: ['Pane, multa ou transporte?', 'Abra um chamado.'], texto: 'Veículo para uma ação, pane, avaria, multa ou documento: informe data, trajeto e volumes no chamado e {a} {setor} recebe com registro e prazo.' },
    carro: { rotulo: 'Carro parou ou precisa de um?', titulo: ['Carro parou ou', 'precisa de um?'], texto: 'Transporte, pane, multa ou documento: {a} {setor} atende por chamado, com prazo.' },
  },
}
