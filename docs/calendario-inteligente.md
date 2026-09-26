# Calendário inteligente — benchmark e proposta (26/09/2026)

O pedido: refazer o calendário do Palácio Virtual "o mais inteligente possível", com uma
pesquisa de mercado e soluções que integrem e façam sentido para o nosso ecossistema. Nada disto
está construído: este arquivo é o benchmark e a proposta a aprovar antes do código. As decisões
estão na §8.

## 1. O que existe hoje

`/calendario` é uma grade do mês (no celular, uma lista) com uma tabela só, `calendar_events`:
publicação, prazo ou atividade, com data, hora opcional e o link para a pauta ou a peça. Tem um
botão "Agendar". Não mostra mais nada do sistema.

Só que o Palácio Virtual tem **datas em mais de 20 lugares**, e nenhuma aparece no calendário:

| Área | O que tem data |
| --- | --- |
| Planejamento | pautas (início e prazo), marcos de projeto, peças de conteúdo |
| Publicações | pacotes e destinos agendados (`agendar_para`), newsletter, matérias publicadas |
| Voluntariado | oportunidades (início e fim), horas, aniversários dos voluntários |
| Escola | campanhas, peças e advertoriais (período no ar) |
| Doações | campanhas (início e fim), entregas e recebimentos |
| Financeiro | vencimentos de contas a pagar e receber, fechamento do mês |
| Patrimônio e frota | manutenções, vencimento de documentos dos veículos, revisões |
| Chamados | prazos de resposta e de solução |
| Transparência | vigência e prestação de contas das parcerias |
| Ofícios e compras | data dos ofícios, prazos de aprovação e entrega das compras |
| Equipe | aniversários, férias (quando existir) |
| Envios da equipe | data de cada ação enviada |

**O calendário novo não precisa de dados novos: precisa juntar os que já existem**, e em cima
disso sugerir, alertar e sincronizar.

## 2. Benchmark

| Ferramenta | Tipo | O melhor dela | IA | O que copiar |
| --- | --- | --- | --- | --- |
| **CoSchedule** | calendário de marketing | calendários separados para social, conteúdo e agência, num lugar só | assistente que sugere posts, escreve rascunho e escolhe horário [1] | camadas de calendário (social, conteúdo, campanhas) |
| **Planable** | aprovação de conteúdo | calendário com o que está agendado, em rascunho e aguardando aprovação; arrastar para reagendar; rótulos por campanha | — | **estado de aprovação no próprio calendário** e arrastar e soltar [2][3] |
| **Loomly** | planejamento social | filtros por campanha, aprovador, status, canal e rótulo; ver lacunas no plano | ideias de post e dicas por rede [3][4] | **lacunas e dias lotados à vista**; filtros combinados |
| **Sprout Social** | social para equipes grandes | calendário de publicação para alto volume | **ViralPost**: melhor horário por perfil, com 16 semanas de engajamento, em faixas de 5 minutos, na hora de agendar [5][6] | sugestão de horário **dentro** do agendamento, com dados do próprio perfil |
| **Buffer** | agendamento | filas com horários prontos por rede | estudo de melhores horários por rede [7] | horários-padrão por rede enquanto não há dado próprio |
| **Desk-Net / Kordiam** | planejamento de redação jornalística | pautas agrupadas por tema numa linha do tempo; tarefas com aceite ou recusa; escalas [8][9] | — | **linha do tempo por tema/campanha** e atribuição com aceite |
| **Motion / Reclaim.ai** | calendário pessoal com IA | encaixam tarefas e prazos nos horários livres; Reclaim trabalha **dentro** do Google Agenda [10] | agendamento automático por prioridade e prazo | a IA **propõe** e a pessoa aceita, sem substituir o calendário de ninguém |
| **Google Agenda** | calendário pessoal | onde a equipe já vive | — | ser **fonte e destino**: assinatura (ICS) e, depois, sincronização [11][12] |

Fontes na §9.

### O que o benchmark ensina

1. **Camadas, não um calendário só.** Todas as ferramentas separam social, conteúdo, campanhas e
   prazos, com filtro e cor. O que importa é ligar e desligar camadas.
2. **O estado no calendário.** Rascunho, aguardando aprovação, aprovado e publicado aparecem no
   próprio item (Planable, Loomly). O calendário vira o painel do trabalho.
3. **Lacunas e excessos à vista.** Semana sem post no Instagram ou três posts no mesmo dia (Loomly).
4. **Horário sugerido no momento de agendar**, com dados do próprio perfil (Sprout ViralPost), e
   referência de mercado enquanto não há dados (Buffer).
5. **A IA propõe, a pessoa decide** (Reclaim, CoSchedule): nada entra no calendário sem aceite.
6. **Linha do tempo de campanhas** (Desk-Net): o que dura semanas (campanha de doação, Setembro
   Amarelo, vigência de parceria) é barra, não ponto.
7. **Não brigar com o Google Agenda.** A equipe usa o Google. O calendário precisa aparecer lá,
   não competir com ele.

### Por que não usar uma ferramenta pronta

Nenhuma delas enxerga as pautas, os pacotes, o voluntariado, o financeiro ou a frota do Palácio
Virtual. Todas cobram por usuário (CoSchedule, Planable, Loomly e Sprout, de dezenas a centenas de
dólares por mês) e manteriam uma segunda cópia do planejamento. **Recomendação: construir no
Palácio Virtual**, copiando as ideias acima, e integrar com o Google Agenda por padrão aberto
(ICS).

## 3. Proposta: a Agenda do Palácio Virtual

### 3.1 Uma agenda, várias camadas

Cada área vira uma **fonte** que devolve os itens dela para o período visto: um módulo em
`lib/agenda/fontes/`, **sem copiar dados para uma tabela nova**. A leitura usa o cliente da
própria pessoa, então o RLS decide quem vê o quê (o financeiro só aparece para quem tem acesso ao
financeiro, e assim por diante).

| Camada | De onde vem | Clique leva a |
| --- | --- | --- |
| Publicações | `calendar_events` (publicação), destinos de pacote agendados, newsletter | o pacote ou a peça |
| Pautas e projetos | prazo e início das pautas, marcos de projeto | a pauta ou o projeto |
| Voluntariado | oportunidades (início e fim), aniversários dos voluntários | a oportunidade |
| Escola | campanhas e advertoriais no ar | a campanha |
| Doações | campanhas, entregas previstas | a campanha |
| Financeiro | vencimentos, fechamento do mês | o lançamento |
| Frota e patrimônio | documentos vencendo, revisões, manutenções | o veículo ou o bem |
| Chamados | prazos de resposta e de solução em risco | o chamado |
| Institucional | vigência e prestação de contas das parcerias, ofícios | a parceria ou o ofício |
| Equipe | aniversários da equipe | a ficha da pessoa |
| **Datas comemorativas** | tabela nova e curada (§3.3) | criar pauta a partir da data |
| **Feriados** | nacionais pela BrasilAPI [13], estaduais e municipais do RJ cadastrados | — |

### 3.2 Visões

- **Mês**: a grade de hoje, com cor por camada, o estado de cada publicação e "+3" quando lota.
- **Semana**: horas do dia, para ver publicações e eventos com horário.
- **Lista**: próximos 30 dias, agrupados por dia; é a visão do celular.
- **Linha do tempo**: barras para o que dura (campanhas, meses temáticos, vigências, oportunidades
  de vários dias), agrupadas por setor ou campanha, como no Desk-Net.
- **Filtros**: camadas, setor, canal, pessoa responsável, estado e **"só o que é meu"**.
- **Arrastar para reagendar**, só no que o calendário pode mudar com segurança: evento manual,
  pauta, destino de pacote ainda não publicado. Vencimento de conta e prazo de chamado são
  informação, não se arrastam.

### 3.3 A parte inteligente

**Sem IA, com regras** (barato, previsível, roda todo dia):

1. **Datas comemorativas viram pauta na hora certa.** Uma tabela curada com as datas que importam
   para a filial, cada uma com a antecedência para começar a produzir:
   - da Cruz Vermelha e humanitárias: Dia Mundial da Cruz Vermelha e do Crescente Vermelho
     (8/mai), Dia Mundial dos Primeiros Socorros (2º sábado de setembro), Dia Mundial Humanitário
     (19/ago), Dia Internacional do Voluntário e aniversário da Cruz Vermelha Brasileira (5/dez),
     Dia Mundial do Doador de Sangue (14/jun), Dia Nacional do Voluntariado (28/ago) [14][15];
   - o calendário da saúde do Ministério da Saúde: meses temáticos (Janeiro Branco, Maio Amarelo,
     Junho Vermelho, Setembro Amarelo, Outubro Rosa, Novembro Azul…) e dias mundiais [16];
   - as datas próprias da filial, cadastradas pela comunicação.

   Exemplo: "Faltam 21 dias para o Dia Mundial dos Primeiros Socorros, e não há pauta ligada.
   Criar pauta?". Um clique cria a pauta já com a data e o contexto.
2. **Lacunas e excessos:** "Semana que vem não tem nenhum post no Instagram" e "Terça tem 3 posts
   no Facebook em 2 horas".
3. **Conflitos e riscos:**
   - publicação agendada ainda sem aprovação a 48 h de sair;
   - pauta com prazo depois da data de publicação;
   - post com foto de autorização pendente;
   - oportunidade de voluntariado sem divulgação a 10 dias;
   - ação marcada em feriado;
   - documento de veículo vencendo com viagem marcada.
4. **Resumo da semana:** toda segunda de manhã, cada pessoa recebe no sino e por e-mail (pelo
   `notificar()`) o que tem na semana, os riscos e as datas comemorativas que se aproximam.

**Com IA** (Claude ou GPT, que o Palácio Virtual já usa; sempre com aceite):

5. **"Planejar o mês":** a IA lê as pautas abertas, as datas comemorativas, as campanhas ativas,
   os envios da equipe ainda sem uso e o que foi publicado nos últimos meses. Ela devolve uma
   proposta de calendário: o que publicar, em que rede, em que dia e com que gancho. Cada item tem
   "aceitar" (vira pauta ou evento), "editar" e "descartar". É o modelo do Reclaim: a IA propõe,
   ninguém perde o controle.
6. **Horário sugerido ao agendar:** começa com os horários de referência por rede (Buffer e
   Sprout) [5][7]. Quando o Palácio Virtual passar a guardar as métricas de cada post, vira o
   modelo do ViralPost com os nossos dados: engajamento das últimas 16 semanas, por rede e dia
   da semana.

### 3.4 Integrações

- **Assinar no Google Agenda, Apple ou Outlook (ICS):** cada pessoa tem um link secreto e pessoal
  (`/api/agenda/ics/<token>`) com as camadas que escolheu. Ela assina uma vez e a agenda aparece
  no celular.
  - É o padrão aberto (RFC 5545), não precisa de login do Google nem de reconectar a conta.
  - Limite honesto: o Google Agenda atualiza assinaturas **a cada 8 a 24 horas** [12]; o Apple
    Calendar, de hora em hora. Para "o que vem aí" basta; para mudança de última hora, vale o
    aviso do Palácio Virtual.
  - O link pode ser revogado e trocado a qualquer momento, e só a pessoa o vê.
- **Sincronização de duas vias com o Google Agenda (fase posterior):** API do Google com
  notificações por webhook, token de sincronização incremental e uma rotina de reserva. As
  notificações do Google não são garantidas [11]. Exige cada pessoa conectar a própria conta
  Google com o escopo de agenda. Só vale se o ICS não bastar.
- **"Adicionar à minha agenda"** nas oportunidades da Área do Voluntário: o voluntário que se
  inscreve baixa o evento (.ics) ou abre direto no Google Agenda.
- **Feriados:** BrasilAPI para os nacionais (calcula Carnaval e Páscoa) [13], guardados no banco
  para não depender dela na hora de abrir a tela. Os feriados do estado e da cidade do Rio (como
  São Jorge, 23/abr, e São Sebastião, 20/jan) ficam cadastrados à mão.

### 3.5 Componente de tela

**FullCalendar** (núcleo MIT: mês, semana, dia e lista, com arrastar e soltar) [17]. É o mais
maduro e funciona com React. A linha do tempo por recurso é paga no FullCalendar, então a linha do
tempo de campanhas (§3.2) é feita à mão, com barras simples, como já existe no cronograma dos
projetos. Alternativa: react-big-calendar (MIT, mais simples, menos visões) [17].

## 4. Modelo de dados

Só acréscimos:

- **`calendar_events`** ganha:
  - `termina_em` (data/hora de fim) e `dia_inteiro`;
  - `recorrencia` (RRULE, para "toda segunda reunião de pauta");
  - `responsavel_id`, `setor`, `local` e `origem` (`manual`, `ia`, `data_comemorativa`,
    `envio`).
- **`datas_comemorativas`**:
  - a regra: dia fixo, n-ésimo dia da semana do mês ou mês inteiro;
  - nome, tema, antecedência em dias e se está ativa;
  - por espaço, com uma lista inicial já cadastrada e editável pela comunicação.
- **`feriados`**: data, nome e âmbito (nacional, estadual, municipal), preenchidos pela BrasilAPI
  e à mão.
- **`agenda_assinaturas`**: o hash do token ICS de cada pessoa, as camadas escolhidas e a data de
  revogação.

Todas as tabelas novas com RLS, como sempre.

## 5. Fases

| Fase | Entrega |
| --- | --- |
| **1. Agenda unificada** | fontes das camadas (§3.1), visões mês, semana e lista, filtros e "só o meu", cores e estado das publicações, feriados nacionais |
| **2. Inteligência por regras** | datas comemorativas com "criar pauta", lacunas, excessos, conflitos e riscos, resumo da semana |
| **3. Integrações** | link ICS pessoal, "adicionar à agenda" no voluntariado, arrastar para reagendar |
| **4. IA** | "Planejar o mês" com aceite item a item; horário sugerido (referência de mercado) |
| 5. (opcional) | linha do tempo de campanhas; sincronização de duas vias com o Google; melhor horário com métricas próprias |

Cada fase segue o de sempre:
- migração só com acréscimos, ensaiada no banco local;
- lógica pura em `lib/agenda/`, conferida com `npx tsx`: regras de data comemorativa, lacunas,
  conflitos e montagem do ICS;
- `tsc`, eslint e build antes do push.

## 6. O que fica de fora de propósito

- Reservar sala e recursos, e agendamento externo tipo Calendly: não é o problema de hoje.
- Substituir o Google Agenda de cada pessoa: a agenda do Palácio Virtual aparece nele, não
  compete com ele.

## 7. Riscos

- **Excesso de informação:** 12 camadas ligadas viram ruído. Por isso o padrão é mostrar as
  camadas do papel da pessoa (comunicação vê publicações e pautas; financeiro vê vencimentos), e o
  resto fica a um clique.
- **Desempenho:** várias fontes por período. Cada fonte lê só a janela visível, com índice por
  data (os que faltarem entram na migração).
- **Datas comemorativas erradas ou datadas:** a lista inicial precisa de revisão da comunicação
  antes de ir ao ar.

## 8. Decisões do Matheus

1. **Construir no Palácio Virtual** (recomendado), ou assinar uma ferramenta pronta?
2. **Camadas da fase 1:** todas da §3.1, ou começar por publicações, pautas, voluntariado e
   datas comemorativas?
3. **Resumo da semana** por e-mail toda segunda: para todos, ou só para quem ativar?
4. **"Planejar o mês" com IA:** Claude (recomendado, o mesmo das matérias) ou GPT?
5. **Integração com o Google:** começar pelo link ICS (recomendado), ou já a sincronização de
   duas vias?
6. **Datas da filial:** quais datas próprias entram na lista inicial (fundação da filial,
   aniversário do Palácio da Cruz Vermelha, campanhas fixas do ano)?

## 9. Fontes (consultadas em 26/09/2026)

1. CoSchedule — [Planable: alternativas ao CoSchedule](https://planable.io/blog/coschedule-alternatives/); [Startuptalky: ferramentas de calendário com IA](https://startuptalky.com/ai-content-calendar-planning-tools/)
2. Planable — [produto](https://planable.io/product/); [ferramentas de calendário de conteúdo](https://planable.io/blog/content-calendar-tools/)
3. Planable e Loomly — [ferramentas de agendamento comparadas](https://planable.io/blog/schedule-social-media-posts/); [Loomly: gestão de campanhas](https://www.loomly.com/features/campaign-management)
4. Loomly — [calendário e biblioteca](https://www.loomly.com/features/content-calendar-library); [planejamento de posts](https://www.loomly.com/features/post-planning-scheduling)
5. Sprout Social ViralPost — [recurso](https://sproutsocial.com/features/viralpost/); [melhores horários 2026](https://sproutsocial.com/insights/best-times-to-post-on-social-media/)
6. Sprout Social — [Optimal Send Times](https://support.sproutsocial.com/hc/en-us/articles/360042762271-Optimal-Send-Times); [ferramentas de agendamento](https://sproutsocial.com/insights/social-media-scheduling-tools/)
7. Buffer — [melhor horário por rede em 2026](https://buffer.com/resources/best-time-to-post-social-media/)
8. Desk-Net — [ferramenta de calendário editorial](https://desk-net.com/info/editorial-calendar-tool); [software de calendário editorial](https://desk-net.com/info/editorial-calendar)
9. Kordiam — [planejamento de conteúdo em redações](https://kordiam.io/newsroom-content-planning)
10. Motion e Reclaim — [comparativo 2026](https://guptadeepak.com/tools/top-5-ai-scheduling-calendar-tools-2026/); [Reclaim vs. Motion](https://reclaim.ai/compare/motion-alternative)
11. Google Calendar API — [notificações push](https://developers.google.com/workspace/calendar/api/guides/push); [como a sincronização funciona](https://syncdate.app/blog/how-calendar-sync-works)
12. Atualização de assinaturas ICS — [Google Calendar ICS refresh](https://www.usecarly.com/blog/google-calendar-ics-refresh-rate/); [Google e Apple](https://calfeed.ai/learn/ics-refresh-rate-apple-google)
13. BrasilAPI — [documentação](https://brasilapi.com.br/docs) (feriados: `/api/feriados/v1/{ano}`)
14. Cruz Vermelha — [IFRC: Dia Mundial da Cruz Vermelha e do Crescente Vermelho](https://www.ifrc.org/get-involved/campaign-us/world-red-cross-and-red-crescent-day); [Dia Mundial dos Primeiros Socorros](https://healinghospital.co.in/blogs/world-first-aid-day/)
15. ONU — [Dia Mundial Humanitário](https://www.un.org/en/observances/world-humanitarian-day); [Dia Internacional do Voluntário](https://www.un.org/en/observances/volunteer-day)
16. Ministério da Saúde — [Calendário da Saúde](https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/c/calendario/saude)
17. Componentes — [LogRocket: bibliotecas de agenda para React](https://blog.logrocket.com/best-react-scheduler-component-libraries/); [Builder.io: calendários React 2026](https://www.builder.io/blog/best-react-calendar-component-ai)
