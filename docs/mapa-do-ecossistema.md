# Mapa do ecossistema

A tela `/mapa` (menu Gestão → Mapa do ecossistema) desenha, numa só árvore, o
que a filial tem no digital: o **Palácio Virtual**, o **site institucional**
(cruzvermelhariodejaneiro.org) e a **plataforma da Escola** (secretaria,
matrículas e certificados). Cada parte tem um estado, uma lista de entregas e
as pendências que faltam para ela funcionar de ponta a ponta. Quem tem a
permissão `mapa.editar` marca pendências como resolvidas e muda estados; o mapa
se refaz na hora para todo mundo. Resumo técnico em ARQUITETURA §7.37.

## 1. Por que existe

O levantamento de outubro de 2026 (relatório e mapa mental publicados como
artefatos) respondia "o que já fizemos e o que falta?", mas era um retrato
parado: cada pendência resolvida exigia regerar o documento. Esta tela guarda
o mesmo conteúdo no banco e deixa a equipe atualizar o estado no lugar em que
ele é consultado.

## 2. O modelo

Duas tabelas, ambas por `workspace_id`, com RLS de membro do espaço para ler
e escrita só pelo servidor (`service_role`, depois da checagem de permissão):

| Tabela | O que guarda |
| --- | --- |
| `mapa_itens` | Um nó da árvore. `tipo` é `sistema`, `categoria` ou `item`; `parent_id` liga ao pai (sistema não tem pai). Só `item` tem `estado` (um CHECK garante). `entregas` é um `jsonb` com `{data, titulo, detalhe?}`; `url` é o link para abrir a parte; `ordem` ordena os irmãos. |
| `mapa_pendencias` | Uma pendência do levantamento (`R-01`, `S-02`, `E-05`…). `item_id` liga a um item (ou é nulo e a pendência fica no sistema). `situacao` é `pendente`, `parcial` ou `feito`; `ordem_fila` é a posição na fila de próximos passos; `resolvida_em`/`resolvida_por` e `nota` registram a resolução. Os demais campos (`tipo`, `quem`, `esforco`, `prioridade`, `por_que`, `bloqueia`, `primeiro_passo`, `fonte`, `o_que_falta`) são o texto do levantamento. |

Os cinco estados e o nome técnico que a tela usa:

| Estado (banco) | Na tela | Cor |
| --- | --- | --- |
| `no ar` | No ar | verde |
| `feito, falta publicar ou configurar` | Feito, falta ligar | âmbar |
| `em andamento` | Em andamento | azul |
| `fora do ar por decisão` | Fora do ar por decisão | roxo |
| `proposta (só documento)` | Só proposta | cinza |

**Nada é gravado em dobro.** Contagens por estado, total de recursos,
percentual no ar, pendências abertas e resolvidas e a data da última entrega
são calculados em `lib/mapa/modelo.ts` (`montarArvore`) a cada leitura. Item
cujo `parent_id` não existe fica fora da árvore e a página avisa.

Os ids são caminhos legíveis (`palacio.pessoas.voluntariado`), gerados pela
`slugDoMapa` a partir dos nomes do levantamento. Item novo entra por migração
(ou por quem tem acesso ao banco), com `id`, `parent_id`, `tipo`, `sistema`,
`nome`, `estado` (se for item) e `ordem`.

## 3. A tela

- **Visão geral** (`#`): um cartão por sistema (total, barra do que está no
  ar, composição por estado, pendências abertas) e o painel "Saúde do
  ecossistema" com os totais, o próximo passo da fila e as áreas com mais
  pendências.
- **Foco** (`#palacio`, `#palacio.pessoas`): um nível por clique. Até 8
  filhos em roda; de 9 a 20 em duas colunas; mais de 20 em quatro. A trilha
  (Início › Palácio › Pessoas) e "← Voltar" subem. Esc também.
- **Item** (`#palacio.pessoas.voluntariado`): abre o painel lateral com
  estado, sistema, área, caminho, descrição, "o que falta para ligar",
  pendências ligadas (caixa para marcar, se puder editar), resolvidas,
  integrações com os outros sistemas, entregas e links.
- **Lista**: os mesmos filhos em cartões, ordenáveis por nome, pendências,
  quantidade, progresso ou estado. No celular começa em lista.
- **Filtros**: estado, sistema e "só com pendência". Os ativos aparecem com
  um × e "Limpar filtros". Ficam no `localStorage` (`mapa-eco:*`), como o modo
  e o zoom.
- **Busca** (Ctrl K): nome, descrição e caminho de qualquer nó.
- **Mais ⋯ → Visualização completa**: as três árvores inteiras; de longe só
  áreas, de perto itens e nomes (três níveis de detalhe pelo zoom).
- **Acessibilidade**: nós são `role="button"` com `aria-label`, Enter/Espaço
  abrem, foco visível, `prefers-reduced-motion` desliga as animações, tooltips
  também no foco de teclado.

O motor (`lib/mapa/ui.ts`) é DOM direto dentro da moldura que o componente
React (`components/app/mapa/mapa-do-ecossistema.tsx`) desenha uma vez. O
React cuida dos dados: chama a action, faz `router.refresh()` e entrega as
linhas novas por `atualizar(dados)`; o motor redesenha mantendo o foco e o
painel abertos. O estilo (`components/app/mapa/mapa.css`) começa em
`.mapa-eco` e usa os tokens do tema; o escuro é a classe `.dark`.

## 4. Quem pode o quê

| Papel | Vê | Marca pendência / muda estado |
| --- | --- | --- |
| admin, editor | sim | sim (`mapa.editar`) |
| colaborador | sim | não (o painel diz qual permissão falta) |
| escola | não (a equipe da Escola só entra na área da Escola) | não |

As actions (`app/actions/mapa.ts`) fazem `requireWorkspace()`, conferem
`pode(role, 'mapa.editar')`, validam o id e o valor por lista fechada e gravam
com o cliente admin filtrando por `workspace_id`. Marcar como `feito` grava
`resolvida_em` e `resolvida_por`; voltar para `pendente` limpa os dois.

## 5. A semente

`20261003210100_cvrj_mapa_do_ecossistema_semente.sql` insere, no espaço de
slug `producao`, os 119 itens e as 134 pendências do levantamento (`on conflict
do nothing`: rodar de novo não duplica nem desfaz marcações). Foi gerada a
partir do `dados.json` do relatório; 91 pendências já saem ligadas a um item
pelo nome da área, as outras ficam no sistema. `S-01` (hreflang do inglês) já
nasce `feito`, porque foi resolvida no PR #294.

## 6. Conferir

```bash
npx tsx scripts/conferir-mapa.ts      # modelo puro + ids e referências da semente
npx tsx scripts/conferir-ajuda.ts     # o guia em lib/ajuda/conteudo/financeiro.ts e os data-ajuda
npx tsx scripts/conferir-navegacao.ts
```

## 7. O que ainda não tem

- Cadastro de item ou pendência pela tela (hoje só por migração).
- Histórico de quem marcou o quê (há `resolvida_por`, mas sem linha do tempo).
- Aviso por `notificar()` quando uma pendência da fila é resolvida.
