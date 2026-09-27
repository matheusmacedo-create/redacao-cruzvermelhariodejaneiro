/**
 * Os dados oficiais da filial (os mesmos do rodapé do site), usados nos
 * ofícios, nas compras, no termo de imagem, nos canais oficiais e na
 * verificação pública.
 *
 * As páginas jurídicas não moram mais aqui: a Política de Privacidade, os
 * Termos de Uso, a Política de Cookies e a de Cancelamento e reembolso, em
 * português, inglês e espanhol, são do repositório do site, que as gera e
 * publica (scripts/gerar_politicas.py, com o texto dos três idiomas em
 * site/politicas.json). O Palácio Virtual não grava mais /privacidade/ nem
 * /termos/. Mudou o que ele coleta de quem visita o site (newsletter, bloco de
 * medição), o texto muda lá.
 */
export const DADOS_DA_FILIAL = {
  nome: 'Cruz Vermelha Brasileira — Filial do Estado do Rio de Janeiro',
  cnpj: '08.560.973/0001-97',
  endereco: 'Praça da Cruz Vermelha, 10 — Centro, Rio de Janeiro/RJ, CEP 20230-130',
  email: 'contato@cruzvermelhariodejaneiro.org',
  telefone: '(21) 99992-2864',
} as const
