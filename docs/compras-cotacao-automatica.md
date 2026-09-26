# Compras — pedir propostas aos fornecedores (26/09/2026)

## O problema

Na cotação, o Financeiro pedia as propostas por fora (telefone, WhatsApp, e-mail avulso) e depois
digitava cada uma no mapa comparativo. Na lista "Para cotar", o pedido não dizia quantas
propostas já existiam, e a pergunta era "onde estão as outras cotações?". Com fornecedores
habituais, o mesmo pedido saía sempre para as mesmas pessoas, à mão.

## Decisões do Matheus (26/09)

1. O fornecedor responde por um **link sem login**, só dele. Ele preenche o preço de cada item, o
   frete, o prazo e a validade, e pode anexar o PDF. A proposta entra sozinha no mapa comparativo.
2. **Fornecedores habituais** são as duas coisas:
   - quem está marcado no cadastro como vendedor da categoria do pedido;
   - quem já mandou proposta em compras da mesma categoria.
3. Automação com **um botão e um lembrete**. "Pedir propostas" abre a lista já marcada; quem cota
   confere, define o prazo e envia. Na véspera, quem não respondeu recebe um lembrete; quando o
   prazo acaba, quem pediu é avisado.

## Como funciona

### Fornecedores habituais

`fin_favorecido_categorias` guarda o que cada fornecedor vende, em categorias de despesa. Esse
campo aparece como "O que ele vende" em Financeiro → Cadastros → Favorecidos.

A sugestão (`sugerirFornecedores`, em `lib/compras/convites.ts`) põe os fornecedores nesta ordem:
1. quem vende a categoria e já cotou;
2. quem só vende;
3. quem só já cotou, de quem cotou mais vezes para quem cotou menos;
4. o resto, em ordem alfabética.

Vêm marcados os habituais que têm e-mail e ainda não foram convidados.

### O convite

`compras_convites` guarda um convite por fornecedor e pedido, com o token do link (24 bytes
aleatórios). A função `compras_convidar` confere o nível no Financeiro, o prazo (de hoje até 60
dias), a empresa do fornecedor e o e-mail. Ela também grava o prazo em
`compras_pedidos.cotacao_prazo`, que é um só para todos: a mesma especificação e o mesmo prazo,
como pede o manual da Cruz Vermelha. Convidar de novo mantém o link.

O e-mail sai pela caixa do setor escolhida, a mesma regra de `lib/correio/enviar.ts`. É um e-mail
por fornecedor, então ninguém vê quem mais foi convidado. As respostas por e-mail chegam em
"E-mail do setor".

Sem caixa, os links ficam prontos para "Copiar link", para mandar por WhatsApp. O token **não é
legível pelo RLS**: a coluna fica fora do `grant select`. O link só sai por `linkDoConviteParaCopiar`,
depois de conferir o nível.

### A resposta do fornecedor

`/cotacao/<token>` é uma página sem login, fora do Google e sem referrer. Ela mostra:
- quem compra;
- os itens, com especificação e quantidade;
- o local de entrega, quando precisa e o prazo.

**Não mostra o valor estimado nem os outros fornecedores.**

O preço aceita "1.500" como mil e quinhentos (`lerPreco`). A tela mostra o valor interpretado e o
total enquanto a pessoa digita.

O PDF sobe direto ao Storage (`compras-arquivos`, privado) por um link de uso único
(`/api/publico/cotacao/<token>/arquivo`). O servidor confere o conteúdo antes de juntar o arquivo.

A proposta entra por `compras_proposta_do_fornecedor`, que só o `service_role` executa. A função
confere:
- se o convite está em vigor;
- se a cotação está aberta;
- se o dia ainda está dentro do prazo, pelo horário de Brasília.

Mandar de novo substitui a proposta anterior.

"Não vou cotar" chama `compras_recusa_do_fornecedor`. Cada resposta avisa no sino quem mandou os
convites, e há um aviso extra quando todos já responderam.

### A rotina diária

`rotinaDasCotacoes` roda dentro de `/api/financeiro/vencimentos`, às 8h de Brasília:
- **Véspera do prazo:** manda um lembrete, uma vez só, pela mesma caixa, a quem ainda não respondeu.
- **Prazo acabou:** avisa quem pediu as propostas, uma vez por pedido
  (`cotacao_prazo_avisado_em`), com o resumo "2 de 3 mandaram proposta · 1 não vai cotar".

### Na tela

- **No pedido:** o quadro "Pedir propostas aos fornecedores" mostra a situação de cada convite:
  - E-mail enviado
  - Abriu o link
  - Mandou a proposta
  - Não vai cotar
  - E-mail não saiu
  - Convite cancelado

  Cada convite tem "Copiar link" e "Cancelar". O histórico registra quem pediu e cada resposta; o
  fornecedor aparece como autor.
- **Na lista "Para cotar":** cada pedido mostra quantas propostas chegaram, a situação dos
  convites e o prazo.
- **Continua valendo:** "Registrar proposta" à mão, para proposta que chegou por outro caminho.

## Banco

A migração é `20260928130000_cvrj_compras_cotacao_automatica.sql` e só acrescenta:
- as tabelas `fin_favorecido_categorias` e `compras_convites`, as duas com RLS e só leitura para
  `authenticated`;
- as colunas `compras_pedidos.cotacao_prazo` e `cotacao_prazo_avisado_em`;
- as funções `compras_definir_ramos`, `compras_convidar`, `compras_cancelar_convite`,
  `compras_proposta_do_fornecedor` e `compras_recusa_do_fornecedor`.

## Conferência

- `npx tsx scripts/conferir-convites.ts` confere as regras puras.
- A migração foi ensaiada num Postgres descartável. Os casos cobertos:
  - nível;
  - prazo no passado;
  - fornecedor de outra empresa;
  - e-mail inválido;
  - o token mantido ao convidar de novo;
  - o token invisível ao RLS;
  - a função do fornecedor fechada para `authenticated`;
  - proposta sem preço;
  - arquivo que não chegou;
  - substituir a proposta;
  - recusa;
  - prazo vencido;
  - convite cancelado;
  - categorias de receita ou de outro espaço recusadas.
