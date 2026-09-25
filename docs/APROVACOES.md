# Aprovações por setor — benchmark e modelo adotado

A tela antiga listava todas as rodadas iguais, sem dizer de que setor era cada
peça, sem prazo e sem critério: aprovar era um clique. Este documento registra
o que foi comparado e o que foi adotado.

## 1. O que foi comparado

Páginas de ajuda de Planable, Sprout, Ziflow e Asana bloquearam a leitura
(403); para elas valeram os trechos da documentação oficial nos resultados de
busca. CICV, IFRC e Jira foram lidos na íntegra.

| Referência | O que aproveitamos |
| --- | --- |
| **Planable** | Aprovação em níveis com nome (ex.: "Jurídico"); a peça aparece como vai ser publicada. |
| **Filestage** | Prazo por etapa; "Aprovar" × "Solicitar alterações"; lembrete só do que está perto do prazo. |
| **Ziflow** | Etapas em sequência ou em paralelo; gatilhos por prazo (SLA); permissão por revisor. |
| **Sprout / Hootsuite** | Fluxo escolhido no envio; na Hootsuite, post não aprovado até a hora agendada expira. |
| **Loomly** | "Guards": a peça não muda de estado sem a ação de quem é obrigatório. |
| **Asana** | Três decisões com cores; aprendizado do fórum: pedir ajustes não pode contar como concluído. |
| **Jira Service Management** | Aprovadores por tipo de pedido; aprovação como passo do fluxo. |
| **Contentful / GatherContent** | Prazo por passo; "urgente" antes de vencer e "atrasado" depois. |
| **CICV / IFRC** | Consentimento informado e registrado; dignidade (nada de retratar como indefeso); menores e vítimas nunca identificáveis; "na dúvida, não publique"; emblema protegido. |

## 2. O modelo adotado

- **Fila que abre no que depende de mim**: abas *Esperando meu voto* (padrão),
  *Do meu setor*, *Pedidas por mim* e *Todas*; filtros de situação e de setor
  da pauta. Números no topo (esperando meu voto, atrasadas, do meu setor,
  em aberto).
- **Setor em tudo**: selo e faixa com a cor do setor da pauta.
- **Prazo por setor** e ordem por urgência: atrasadas primeiro, depois as que
  vencem antes. GRD tem 4 h (alerta de emergência); Comunicação, TI e Esportes
  24 h; Jurídico, Juventude e Psicologia 72 h; os demais 48 h.
- **Conferência antes de aprovar** ("guard" do Loomly): a lista do setor da
  pauta, mais a do setor de quem vota quando é outro (o Jurídico vendo uma peça
  da GRD confere as duas). Aprovar exige tudo marcado — conferido no servidor —
  e o que foi conferido vai junto do voto. Pedir ajustes não exige a lista
  (exige o comentário, como antes).
- As listas estão em `lib/aprovacoes/setores.ts`, com base nas diretrizes do
  CICV/IFRC, no ECA (art. 17), no Código de Ética do psicólogo e nos números da
  Defesa Civil RJ (199, 193, 192, SMS 40199). **Cada setor deve validar a
  própria lista**; mudar é editar o arquivo.

## 3. O que ficou para depois

Não houve mudança no banco nesta etapa (a conferência fica registrada no
comentário do voto). Ficaram para uma próxima rodada, se fizerem falta:
etapas em sequência (setor → Comunicação → Jurídico/Diretoria quando a peça
pede), lembrete diário do que está perto de vencer e escalonamento
automático do que atrasa.

## 4. Fontes

icrc.org/en/article/ethical-content-gathering-public-communications ·
IFRC photo guidelines (rcrc-resilience-southeastasia.org) · guia CICV/IFRC/OCHA de redes sociais ·
help.planable.io (multi-level approvals) · help.filestage.io · ziflow.com/routing-and-automation ·
support.sproutsocial.com (approval workflows) · help.hootsuite.com (set up approvals) ·
loomly.com/blog/custom-workflow · help.asana.com (feedback and approvals) ·
support.atlassian.com (JSM approval stage) · contentful.com/help/workflows ·
help.gathercontent.com (due dates) · ECA art. 17 · Código de Ética do psicólogo (CFP) ·
defesacivil.rj.gov.br (alertas por SMS)
