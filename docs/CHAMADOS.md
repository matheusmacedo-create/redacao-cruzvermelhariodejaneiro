# Chamados — benchmark e modelo adotado

Sistema de solicitações entre setores da filial, começando por **TI** e
**Manutenção**. Este documento registra o que foi comparado, o que foi
aproveitado de cada referência e por quê.

## 1. O que foi comparado

| Referência | O que faz melhor | O que não serve para nós |
| --- | --- | --- |
| **Jira Service Management** (Atlassian) | Portal com *tipos de pedido* (catálogo), filas por equipe, comentário público × nota interna, status "Aguardando cliente" que **pausa o SLA** — faz parte do fluxo padrão. | Configuração pesada (workflows, esquemas, campos). Pensado para equipes grandes de TI. |
| **GLPI** (código aberto, muito usado em órgãos públicos no Brasil) | Prioridade calculada pela **matriz urgência × impacto** (urgência dada por quem pede, impacto pela equipe na triagem), SLA em dois prazos — **primeira resposta (TTO)** e **solução (TTR)** —, categorias e localização. | Interface datada, densa; ITIL completo (problemas, mudanças, ativos) é mais do que a filial precisa agora. |
| **Freshservice** (Freshworks) | *Enterprise Service Management*: o mesmo modelo de TI replicado para **Facilities/Manutenção**, RH etc., cada área com seu catálogo; **fechamento automático** do resolvido depois de alguns dias; pesquisa de satisfação. | Pago por atendente; sem necessidade de CMDB/ativos agora. |
| **Zendesk** | Conversa clara em linha do tempo, macros, pesquisa de satisfação (CSAT) ao resolver. | Feito para atendimento a cliente externo, não para pedidos entre setores. |
| **ServiceNow** | Referência de ITIL completo e de SLA em horário comercial. | Porte e custo de grande corporação. |
| **Linear** | Velocidade: poucas telas, estados claros, ninguém precisa de treinamento. | É gestão de desenvolvimento, não de atendimento. |

## 2. O modelo adotado

Um **ESM enxuto** (como o Freshservice), com o **fluxo e a pausa de SLA do
Jira Service Management**, a **matriz de prioridade e os dois prazos do
GLPI**, a **satisfação do Zendesk** e a **simplicidade do Linear**.

### Filas e catálogo
- **Filas** (TI, Manutenção; o admin cria outras): cada uma com prefixo
  (`TI-0042`, `MAN-0007`), equipe de **atendentes**, expediente e SLA.
- **Categorias** por fila (o "catálogo"): cada uma diz se é *incidente*
  (algo parou) ou *solicitação* (preciso de algo) e se pede **local**
  (sala/andar — essencial para Manutenção).

### Prioridade (GLPI)
- **Urgência** vem de quem abre, em linguagem simples: *consigo esperar* /
  *atrapalha meu trabalho* / *parou tudo*.
- **Impacto** é da equipe, na triagem: *uma pessoa* / *um setor* / *a filial*.
- **Prioridade = matriz 3×3** → Baixa, Média, Alta, Crítica.

### SLA (GLPI + JSM)
- Dois prazos por prioridade: **primeira resposta** e **solução**.
- Contados em **horário de atendimento** (seg–sex, 8h–18h, horário de
  Brasília) — ou 24h, se a fila estiver marcada assim.
- **Pausa** enquanto o chamado está *aguardando o solicitante* ou *aguardando
  terceiro* (fornecedor, peça): o tempo parado não conta contra a equipe.
- Mudar o impacto recalcula a prioridade e os prazos.

### Fluxo (JSM + Freshservice)

```
Novo → Em atendimento ⇄ Aguardando solicitante / Aguardando terceiro
                     → Resolvido → Fechado (confirmado, ou automático em 5 dias)
                          ↑ reaberto pelo solicitante (dentro de 5 dias)
Novo/Em atendimento → Cancelado
```

- Resolver **exige descrever a solução** (regra de fechamento do Freshservice).
- Quem abriu **confirma** (e avalia de 1 a 5) ou **reabre** dizendo o que falta.

### Conversa (JSM + Zendesk)
- **Comentário** (visível a quem abriu) × **nota interna** (só a equipe).
- **Anexos** (foto do defeito, print do erro, PDF).
- Linha do tempo com cada mudança: quem, o quê, quando.

### Avisos
- No sino da Redação e por **e-mail** (para o e-mail de recuperação confirmado):
  chamado novo para a equipe da fila; atribuição para o responsável; resposta,
  pedido de informação e solução para quem abriu; resposta e reabertura para o
  responsável.

### Indicadores
- Abertos por fila e por status, atrasados (SLA estourado), tempo médio de
  primeira resposta e de solução, **CSAT** (média das avaliações), categorias
  com mais chamados — base para decidir onde investir.

## 3. Segurança e permissões

- **Todo membro ativo abre chamados** e vê os seus.
- **Atendentes** veem e trabalham os chamados das suas filas; **admins** veem
  todos e configuram filas, equipes, categorias e SLA.
- **Escrita só pelo servidor**: nenhuma tabela de chamados aceita
  insert/update pela Data API — a máquina de estados, os prazos e a numeração
  moram nas actions. **Leitura por RLS**: quem abriu vê o seu chamado; a nota
  interna e seus anexos, só a equipe da fila.
- Os helpers de RLS herdam as regras de conta desativada e de verificação em
  duas etapas.

## 4. Fora do escopo por enquanto (próximos passos possíveis)

- Base de conhecimento / respostas prontas (macros).
- Inventário de equipamentos (CMDB) ligado ao chamado.
- Chamados recorrentes (manutenção preventiva).
- Abertura por e-mail (encaminhar para um endereço e virar chamado).

## Fontes

- Atlassian — [Set up SLA conditions (Jira Service Management Cloud)](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-conditions/) e [Understanding why an SLA is paused](https://support.atlassian.com/jira/kb/understanding-why-an-sla-is-paused-in-a-jira-service-management-ticket/)
- GLPI — [Matrix of calculus for priority](https://help.glpi-project.org/documentation/modules/assistance/prioritymatrix), [Manage tickets](https://help.glpi-project.org/documentation/modules/assistance/tickets/ticketmanagement) e [Setting up Service levels (SLA)](https://help.glpi-project.org/tutorials/helpdesk/service_levels)
- Freshservice — [Ticket closure rules](https://support.freshservice.com/support/solutions/articles/50000000120-enabling-ticket-closure-rules-for-incidents-and-service-requests), [Custom ticket statuses](https://support.freshservice.com/support/solutions/articles/155560--understanding-custom-ticket-statuses) e [Freshservice for Facilities](https://freshservice.com/solutions/enterprise-service-management/facilities)
