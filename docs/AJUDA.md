# Ajuda da ferramenta — pesquisa, modelo adotado e como manter

A Redação tem perto de 40 áreas em dez grupos, de pautas a patrimônio, e
cada papel vê uma parte delas. Até aqui não havia ajuda dentro da
ferramenta: nada explicava para que servia uma tela, o que um status queria
dizer ou por que um botão não aparecia. Este documento registra o que foi
pesquisado sobre ajuda dentro do produto, o que foi adotado e por quê, como
o tour funciona, as regras para escrever a ajuda e como mantê-la quando a
tela muda.

A ajuda tem cinco partes, todas lidas do mesmo conteúdo (`lib/ajuda`):

1. **Boas-vindas** curtas e opcionais no primeiro acesso.
2. **Tour de cada tela**, oferecido (não imposto) na primeira visita.
3. **Painel “?”** com o passo a passo e as perguntas frequentes da área aberta e,
   no fim, **“Achei um erro”**, que leva o erro ao Claude para a correção (§17).
4. **Central de ajuda** em `/ajuda`, com busca, link direto para cada resposta e o
   **glossário** das palavras do Palácio Virtual (`/ajuda/glossario`, §15).
   Antes de tudo, o **guia para começar** (`/comecar`, aberto, sem login, §16),
   para quem ainda não tem acesso ou usa pouco o computador.
5. O mesmo, mais enxuto, na **Área do Voluntário** (`/membro`): convite de
   boas-vindas, tours e a página `/membro/ajuda`.

O texto da ajuda não vai no pacote de toda página: cada página leva só um
índice leve, e o texto é baixado quando alguém abre o painel, um tour ou
busca uma dúvida (§2, "O texto vem quando alguém pede").

## 1. O que foi pesquisado

Pesquisa feita em set/2026 nas páginas de ajuda, documentação e notas de
versão de cada ferramenta, e nos textos originais da pesquisa de usabilidade
e das normas de acessibilidade. Algumas páginas não abriram: a central do
ClickUp (403), o artigo de atalhos da Asana e o de boas práticas de tours da
Intercom e as páginas do Padrão Digital de Governo (gov.br/ds) carregaram
sem o texto; a lei no Planalto deu 503; o post do blog da Omie hoje mostra
outro texto. Nesses casos valeu o trecho da página nos resultados de busca,
marcado com *(busca)* na tabela. Do lado do governo, ficou a lei de
linguagem simples, lida na notícia do Senado. Nenhuma tela foi vista em
captura.

### 1.1 Ferramentas de trabalho

| Referência | Como ajuda dentro do produto | O que tiramos |
| --- | --- | --- |
| **Linear** | A entrada ensina o **⌘K** antes de a pessoa criar qualquer coisa; depois, uma lista curta de tarefas reais. **`?`** abre a ajuda de atalhos, que tem busca; "Help & Feedback" fica no pé da sidebar. | A busca ⌘K é o caminho que a pessoa já usa: a ajuda entra nela. O atalho `?`. |
| **Notion** | A página "Getting Started" é uma lista de tarefas feitas dentro do próprio produto ("aprender fazendo"). O **"?" no canto de baixo** abre ajuda e atalhos. | Ajuda sempre no mesmo lugar, a um clique. |
| **Asana** | A lista de atalhos abre com **⌘/ ou Ctrl+/** — um atalho com tecla modificadora *(busca)*. | Atalho com modificador não atrapalha quem dita texto (ver WCAG 2.1.4 abaixo). |
| **Slack** | O ícone de **ponto de interrogação** (no topo do app, no pé no navegador) leva à central e ao material de ensino. O Slackbot responde dúvidas com artigos da central *(busca)*. | O “?” como símbolo que todo mundo reconhece. |
| **ClickUp** | "Get help" no canto de baixo, central de ajuda e cursos (ClickUp University) *(busca)*. | — |
| **HubSpot** | O ícone de ajuda no topo abre um painel com o campo **"Ask a question"**: a resposta aparece ali mesmo, com "See related results" e "Contact us". | Responder dentro da tela, sem mandar a pessoa para outro site. |
| **Pipefy** | O guia de entrada explica o **modelo** antes de pedir que se construa algo (Pipe, Fase, Card): "quando o modelo mental está claro, tudo o que vem depois acontece muito mais rápido". | O "para que serve" de cada área vem antes do passo a passo. |
| **RD Station** | "Primeiros passos" como curso, central de ajuda com artigos e implantação acompanhada por gente *(busca)*. | — (a implantação humana é outro serviço). |
| **Conta Azul** | Menu **Ajuda › Central de Ajuda** no topo. Na busca: "Copie e cole as mensagens de erro exibidas no ERP na busca para localizar o passo a passo adequado". "Primeiros Passos" em missões, com barra de progresso salva e a opção de "pausar e retomar quando quiser". | Pôr o texto das mensagens de erro nos termos de busca. O progresso é guardado e dá para parar no meio. |
| **Omie** | Central de ajuda "disponível dentro de cada módulo", num botão flutuante; tutoriais guiados para operações simples; os fluxos de entrada só nos primeiros 30 dias *(busca)*. | Ajuda por módulo, não uma central genérica. |
| **Governo federal** (Lei 15.263/2025, Política Nacional de Linguagem Simples) | Frases curtas e em ordem direta, palavras comuns, evitar palavras estrangeiras e imprecisas, listas e tabelas, testar com o público. Pede também que não se usem "novas formas de flexão de gênero e de número". | O guia de estilo (§4). A linguagem neutra daqui usa palavras que já existem ("a pessoa", "quem", "equipe"), sem flexões novas. A Cruz Vermelha não é órgão público; a lei vale como referência. |
| **GitHub** | **`?`** abre a lista de atalhos da página. Nas configurações de acessibilidade dá para **desligar os atalhos de uma tecla só**, mantendo os com modificador. | Como cumprir a WCAG 2.1.4 com o atalho `?` (§2). |

### 1.2 Ferramentas de tour e de central de ajuda

| Referência | O que ensina |
| --- | --- |
| **Appcues** | Tours de 3 a 5 passos; "sempre ofereça pular e deixe o tour acessível de novo"; separar por papel (quem chega vê o básico). |
| **Chameleon** (relatório de 2022) | Tours de 3 passos têm 72% de conclusão; os de 7 passos, 16%. |
| **Intercom Product Tours** | Tour curto, de apontar e avançar. Tarefa longa, ou que acontece fora do produto, vai para artigo, não para tour. Tour que depende de um elemento (um projeto já criado) só para quem tem o elemento. Tour pode ser aberto a partir de um link no artigo de ajuda *(busca)*. |
| **Pendo** (Resource Center) | Um menu de ajuda dentro do produto que mostra conteúdo **conforme a página** e o perfil de quem vê; tem a lista de guias que a própria pessoa abre e uma lista de tarefas com progresso. |
| **Userpilot** | Central dentro do produto, filtrada pela página e pelo perfil, para não obrigar a pessoa a trocar de aba *(busca)*. |
| **driver.js** | Licença MIT, cerca de 5 kB, sem dependências, controlável por teclado. A documentação não descreve papel de diálogo, nome acessível nem comportamento próprio no celular (só inverte o lado do balão quando não cabe). |
| **Shepherd** | Licença dupla: AGPL-3.0 e comercial — "Commercial license required for commercial products and revenue-generating companies". |
| **Intro.js** | Licença dupla: GNU AGPLv3 ou comercial. |

### 1.3 Pesquisa de usabilidade e acessibilidade

| Referência | O que ensina |
| --- | --- |
| **NN/g — Onboarding Tutorials vs. Contextual Help** | Tutorial de entrada é pulado, esquecido e não melhora o desempenho. Melhor a **ajuda "puxada" (pull revelation)**, que aparece quando a pessoa precisa, do que a **"empurrada" (push)**, que aparece sem ninguém pedir. "Make it easy to dismiss (and recall) the help content". |
| **NN/g — Mobile Tutorials** (estudo) | Sucesso nas tarefas de 91% com tutorial e 94% sem. Quem viu o tutorial achou as tarefas **mais difíceis** (4,92 contra 5,49 numa escala de 7). |
| **NN/g — Mobile-App Onboarding** | Evitar a sequência de cartões; se houver, "Pular" bem visível, poucos cartões, um assunto por cartão. Entrada "breve, opcional e só com o mínimo". |
| **NN/g — Instructional Overlays and Coach Marks** | Um balão explica **uma** interação; a memória de curto prazo guarda pouco e por uns 20 segundos *(busca)*. |
| **NN/g — Heurística 10 (Help and Documentation)** | Ajuda com busca, fácil de varrer, organizada por assunto e **orientada a tarefas**, com passos concretos. Não ficar só no óbvio: quem abre a ajuda precisa de verdade. |
| **WAI-ARIA APG — Dialog (Modal)** | Tab e Shift+Tab presos no diálogo, Esc fecha, o foco entra ao abrir (pode ser num elemento estático com `tabindex="-1"`) e volta para onde estava ao fechar; `role="dialog"`, `aria-modal`, `aria-labelledby` e, quando cabe, `aria-describedby`. |
| **WCAG 2.2 — 2.4.11 Foco não escondido** | O elemento com foco não pode ficar todo coberto. Um modal bem feito cumpre, porque recebe o foco ao abrir. |
| **WCAG 2.2 — 2.5.8 Tamanho do alvo** | Alvos de toque de pelo menos 24×24 px (2.5.5, o nível mais alto, pede 44×44). |
| **WCAG 2.2 — 2.1.4 Atalhos de uma tecla** | Atalho de um caractere precisa poder ser desligado, remapeado ou valer só com o componente em foco. O texto cita o **`?`** como exemplo: conta mesmo exigindo Shift. Protege quem dita texto e quem esbarra nas teclas. |

### 1.4 As cinco lições

1. **Tutorial imposto não ensina.** A pessoa pula, esquece, e ainda sai
   achando a ferramenta mais difícil (NN/g). As boas-vindas são curtas e
   opcionais; o grosso da ajuda é puxado por quem precisa, na hora e na tela
   em que precisa.
2. **Tour curto e escolhido pela pessoa.** A conclusão cai de 72% para 16%
   entre 3 e 7 passos (Chameleon). Todo tour tem "pular" e pode ser aberto de
   novo (Appcues). Tarefa longa vira passo a passo escrito, não tour
   (Intercom).
3. **A ajuda mora onde a pessoa está.** Um “?” fixo que abre a ajuda **da
   tela aberta** (Slack, HubSpot, Notion, Linear; por módulo na Omie; por
   página no Pendo e no Userpilot), mais uma central com busca, sem sair da
   ferramenta.
4. **Escrever para a tarefa, com as palavras da tela.** Passos concretos com
   o nome exato do botão, perguntas reais, busca que acha pelo sinônimo e
   pela mensagem de erro (NN/g heurística 10, Conta Azul). Linguagem simples:
   frase curta, ordem direta, palavra comum (Lei 15.263/2025).
5. **Acessível desde o começo.** O balão é um diálogo modal (foco, Esc,
   retorno do foco), funciona no celular e não esconde o que está em foco
   (APG, WCAG 2.4.11 e 2.5.8). E o atalho `?`, por ser de uma tecla, precisa
   poder ser desligado (WCAG 2.1.4, como no GitHub).

## 2. O modelo adotado

```
primeiro acesso     boas-vindas: curtas, opcionais, uma vez ────────┐
primeira visita     dica que oferece o tour da tela (sem forçar)    │  o que a pessoa já viu:
a qualquer hora     painel “?” da área aberta (botão ou tecla ?) ───┤  user_metadata.ajuda
                    Central /ajuda: tudo, com busca e âncoras       │  (voluntário: localStorage)
                    busca ⌘K: acha perguntas e tarefas ─────────────┘

em toda página      só o índice leve (que tela tem tour e o nome dela);
                    o texto vem quando alguém abre o painel, um tour ou busca
```

### Boas-vindas curtas e opcionais no primeiro acesso

Uma janela de boas-vindas, com o nome da pessoa, que oferece um tour de
poucos passos: “Fazer o tour (1 min)” — a janela conta uns 8 s por balão — ou
“Agora não”. O tour mostra **onde as coisas ficam** (o menu, a busca ⌘K, o
sino, o “?” e o menu da conta; para a equipe da Redação, também “Aprovações”
e o “Criar”), não como fazer cada tarefa. Há três: `BOAS_VINDAS` (Redação),
`BOAS_VINDAS_ESCOLA` (quem é só da equipe da escola, que vê só a Escola — ver
`gruposDaEquipeDaEscola` em `lib/navegacao.ts`) e `BOAS_VINDAS_DO_MEMBRO`
(Área do Voluntário, que recebe um convite no lugar da janela — ver "Na Área
do Voluntário"). Qualquer saída da janela (o tour, “Agora não”, o X, o Esc, o
clique fora) conta como vista: ela não volta a cada login. O foco entra na
própria janela, e não no X: um Enter por reflexo não fecha as boas-vindas
para sempre.

**Rever e recomeçar.** “Rever as boas-vindas” abre a janela de novo sem
apagar nada; fica no pé do painel “?” e na Central, no cartão “Boas-vindas e
tours” de “Mais ajuda”. Ao lado dele, e só ali, “Recomeçar as
boas-vindas e os tours” zera o progresso: a janela abre na hora e cada tela
volta a oferecer o tour. Quem ainda não viu as boas-vindas também tem o “Ver
agora” nos “Primeiros passos” do painel. Pedida de dentro do painel, a janela
espera o painel terminar de fechar, para o foco não se perder.

**Por quê:** a pesquisa é unânime contra o tutorial longo e obrigatório, mas
admite uma entrada "breve, opcional e só com o mínimo" (NN/g). O mínimo aqui
é saber que existe o “?” — o resto a pessoa puxa quando precisar.

### Tour de cada tela oferecido, não imposto

Na primeira visita à tela principal de uma área (ou a uma tela interna com
tour próprio, como a página de uma pauta), a tela **oferece** o tour numa
dica discreta no canto (“Primeira vez em Pautas?”, com “Agora não” e “Fazer o
tour”); ele não abre sozinho. A dica não é modal e não pega o foco: o leitor
de tela a anuncia (`role="status"`) sem interromper. Ela só aparece depois
das boas-vindas — e não na mesma tela em que elas acabaram de fechar —, 1 s
depois de a página chegar (com o esqueleto do `loading.tsx`, marcado com
`data-carregando`, ainda na tela, ela espera), e nunca por cima de outra
coisa aberta (a busca, o menu do celular, o painel, um tour). Concluir o
tour, fechá-lo no X ou no Esc, ou tocar “Agora não” marca o tour como visto;
sair da tela no meio do tour, não.

Para ver de novo: o painel “?” tem “Fazer o tour desta tela”, que abre ali
mesmo. Numa tela interna sem tour próprio, ele oferece “Fazer o tour de
<área>”, um link para a raiz da área com `?tour=1`; o “Fazer o tour” da
página da área na Central é o mesmo tipo de link. Com `?tour=1`, a tela
espera o esqueleto do `loading.tsx` sair (até 10 s) e algum elemento que o
tour aponta aparecer (até 2,5 s), abre o tour e tira o parâmetro do
endereço, para recarregar a página não repetir. Quem ainda não viu as
boas-vindas vê as boas-vindas primeiro.

Enquanto o texto do tour baixa, o botão da dica diz “Carregando…”. Se não
baixar (a conexão caiu), o mesmo canto avisa “Não deu para carregar o tour.”,
com “Tentar de novo”: sem isso, “Fazer o tour” parecia não fazer nada.

Que tela é esta, e que tour vale nela, é decidido por `ondeNaAjuda()`
(`lib/ajuda/indice.ts`), só com o índice leve; `ajudaDoCaminho()`
(`lib/ajuda/index.ts`) segue as mesmas regras quando o texto chega. Na raiz
da área, o tour da área; numa tela interna listada em `telas`, o tour dela
(endereço fixo vence endereço com `[id]`); em qualquer outra tela interna,
**nenhum** — o tour da lista apontaria para o que não está lá.

**Por quê:** a pessoa decide a hora ("on their terms", na recomendação que
a Appcues cita), e um tour que dispara sozinho em cada tela nova vira o
"push" que a NN/g desaconselha.

### Painel “?” contextual em toda tela, com atalho `?`

O botão “?” do topo abre, numa gaveta à direita (tela cheia no celular), a
ajuda **da área aberta**, uma coisa de cada vez (a ordem e as medidas estão
no §11): a área numa frase (a primeira do "para que serve"; o resto e o
"quem usa" atrás de “Ler mais”), “Fazer o tour desta tela”, o “Na prática”
recolhido, e as abas **“Como fazer”** (as tarefas em passos numerados) e
**“Dúvidas”** (as perguntas frequentes), com seis itens à vista e o resto
atrás de “Mostrar as outras N” — tudo recolhido, em `<details>` — e o link
“Ver tudo sobre <área> na Central de ajuda”. No alto, a busca em toda a
ajuda. Enquanto a pessoa não cumpre os três, os “Primeiros passos” aparecem
em cima: ver as boas-vindas, confirmar o e-mail de recuperação e pôr uma
foto no perfil. Numa tela sem guia, o painel mostra a ajuda geral, um tópico
recolhido por vez (conta e acesso, como se achar, ajuda e suporte). No fim,
um único lugar para falar com a equipe: “Não achou? Conte para a equipe”
(§10). No pé: “Central de ajuda”, “Rever as boas-vindas” e “Algo não
funciona? Abra um chamado para a TI” — para a equipe da escola, que não abre
chamados, “Falar com a equipe no Chat”.

A tecla `?` abre e fecha o painel de qualquer tela, menos quando o foco está
num campo de texto (ali o `?` é para ser digitado), com Ctrl, ⌘ ou Alt
apertados, com o tour ou as boas-vindas abertos, com um tour a caminho (o
texto baixando, a página chegando) ou com outro diálogo na frente. Como pede
a WCAG 2.1.4, a pessoa pode desligar a tecla: na Central, no cartão “Atalhos
de teclado”, caixa “Abrir a ajuda com a tecla ?”. A escolha fica na conta
(`semAtalho`, em `user_metadata.ajuda`) e vale em qualquer aparelho; o botão
“?” do topo continua valendo (e deixa de anunciar “(?)” no nome), e
recomeçar os tours não religa a tecla.

**Por quê:** é o padrão de Slack, HubSpot, Notion e Linear, e é a "pull
revelation" da NN/g: a ajuda certa, na tela certa, só quando pedida.

### Central de ajuda em `/ajuda`, com busca e âncoras

A Central é a área "Ajuda" do grupo “Conta e administração” (`lib/navegacao.ts`). No
computador, ela fica no menu da conta (a foto, no alto), junto de “Meu
perfil” e “Configurações” — do grupo, o pé da sidebar mostra só
“Configurações”; no celular, na gaveta do menu, no grupo “Conta e administração”. Também se chega pelo
link “Central de ajuda” do pé do painel “?” e pela busca ⌘K. A equipe da
escola também vê.

Em `/ajuda`, nesta ordem: a busca; “Comece por aqui”, com o guia para
começar e os vídeos de começo (§16); as “Perguntas mais frequentes” (§10); a
“Ajuda por área”, com as áreas que a pessoa pode abrir e que têm guia,
agrupadas como no menu (`guiasVisiveis()`) — é o que mais se procura, por
isso vem antes; “Mais ajuda” (até 08/11/2026, “Comece por aqui”), com quatro
cartões (boas-vindas e tours, glossário, atalhos de teclado com a caixa da
tecla `?`, e como pedir ajuda); a “Ajuda
geral” (`topicosGerais()`: conta e acesso, como se achar, ajuda e suporte),
um tópico recolhido por vez — o link para uma resposta abre o tópico dela;
e “Seus retornos do beta”. Cada
área tem a sua página em `/ajuda/<endereço da área>` — `/ajuda/pautas`,
`/ajuda/escola/vendas` —, com “Abrir <área>”, “Fazer o tour”, o passo a
passo, as perguntas, as telas internas com tour e as áreas que andam junto.
A página de uma área que a pessoa não abre (pelo mesmo corte do menu,
`gruposDaPessoa()`) mostra “Esta ajuda não está disponível.”, em português
(`app/(app)/ajuda/[...area]/not-found.tsx`), com o caminho de volta.

Cada tarefa e cada pergunta tem âncora pelo seu `id`
(`/ajuda/pautas#criar-pauta`), para mandar o link numa conversa. Ao chegar,
`AncoraDaAjuda` (`components/app/ajuda/ancora.tsx`) rola até a resposta,
acende o cartão e dá o foco a ele — também quando se chega pelo painel ou
pelo ⌘K, que navegam sem recarregar e não acendem o `:target` do CSS.

As páginas da Central são desenhadas no servidor. Só a busca delas baixa o
texto para o navegador, e só quando alguém vai buscar.

**Por quê:** heurística 10 da NN/g (busca, organização por assunto) e o que
fazem Conta Azul e HubSpot. O link direto evita "procura lá na ajuda".

### Busca da ajuda no ⌘K

A busca rápida que já navega entre as áreas também acha perguntas e tarefas
(`buscarNaAjuda()`), numa seção "Ajuda" depois das áreas e das ações, com
até cinco respostas. O texto baixa na primeira letra digitada, e as respostas
aparecem quando ele chega. A regra: sem acento e sem caixa, palavras de uma
letra ignoradas e todas as outras presentes; o título casando vem antes do
texto; no empate, os tópicos gerais vêm antes das áreas ("senha" é quase
sempre a da própria pessoa) e depois vale a ordem do menu. A mesma pergunta
escrita em dois lugares aparece uma vez só. O resultado leva à resposta na
Central. A busca do painel e a da Central usam a mesma função.

**Por quê:** a pessoa já usa o ⌘K (`docs/NAVEGACAO.md`), e o Linear ensina o
⌘K antes de tudo justamente por ser a porta de entrada de todo o resto.

### A ajuda segue o menu

A chave de cada guia é o `href` da área em `lib/navegacao.ts` — a mesma
fonte do menu, da busca e das migalhas. `ajudaDoCaminho()`, `guiasVisiveis()`
e `buscarNaAjuda()` recebem os grupos **já filtrados** pelo papel da pessoa:
quem não pode abrir uma área não vê a ajuda dela no painel, na Central nem na
busca. A equipe da escola também não recebe as tarefas gerais marcadas com
`quem: 'Equipe da Redação'` (`SO_DA_REDACAO`, em `lib/ajuda/index.ts`), que
mandam usar o “Criar” ou abrir chamado: ela não tem nenhum dos dois.

**Esconder não é proteger.** O texto de **todas** as áreas vai ao navegador
num arquivo só, quando alguém abre o painel, um tour ou busca, e o selo
`quem` ("Só administradores") é só um aviso. Quem barra é o servidor
(`requirePermissao()`, RLS). Por isso a ajuda nunca traz dado sensível (§4).

### O texto vem quando alguém pede

Toda página da Redação leva só um **índice leve** (`lib/ajuda/indice.ts`):
que área tem guia, que tela tem tour, o nome de cada tela e quantos balões
têm as boas-vindas. Ele é montado no servidor a partir do conteúdo
(`indiceDaAjuda()`, em `lib/ajuda/index.ts`) e chega ao navegador como prop
do layout (`app/(app)/layout.tsx`). Basta para a dica de primeira visita, o
`?tour=1`, o rótulo do balão e o tempo prometido nas boas-vindas.

O texto (`lib/ajuda`, com as 40 áreas: cerca de 145 KB comprimidos) é
baixado por `carregarAjuda()` (`components/app/ajuda/carregar.ts`) quando
alguém:

- abre o painel “?” — a moldura (`painel.tsx`) está em toda página, e o miolo
  (`painel-conteudo.tsx`) vem junto com o texto na primeira abertura; enquanto
  isso, “Carregando a ajuda…”, e “Tentar de novo” se a conexão falhar;
- começa um tour (pela dica, pelas boas-vindas, pelo `?tour=1`);
- busca uma dúvida no ⌘K ou na Central.

Uma vez baixado, vale para o resto da visita (e o navegador guarda o
arquivo). Para a espera não aparecer, o download começa antes do clique: com
o mouse ou o foco no “?” (`adiantarPainel()`), com a dica ou as boas-vindas
na tela e ao entrar no campo de busca da Central (`adiantarAjuda()`). O que
chega depois de a pessoa mudar de tela é descartado: o tour seria o da tela
anterior.

**Por quê:** no pacote de toda página, o texto custava cerca de 140 KB
comprimidos em cada página da Redação, inclusive para quem nunca abre a
ajuda. Separado, custa só a quem pede, uma vez por visita. As regras de "que
tela é esta" moram só no índice, e `ajudaDoCaminho()` usa as mesmas: o índice
e o texto não têm como discordar. Como manter isso está no §5.

### O que a pessoa já viu fica na conta, não numa tabela

`lib/ajuda/progresso.ts`: `{ boasVindas: data ou null, vistos: [chaves],
semAtalho?: true }`, em `user_metadata.ajuda` do Supabase Auth. A chave de um
tour é o `href` da área (`/pautas`) ou o caminho da tela (`/pautas/[id]`).

Quem grava é `registrarAjuda()` (`app/actions/ajuda.ts`), com quatro
eventos: boas-vindas vistas, tour visto, recomeçar (que mantém a tecla `?`
como estava) e ligar ou desligar a tecla `?`. A tela muda na hora e a
gravação vai por trás. O layout entrega o progresso só na montagem; depois,
a verdade é o estado do provedor (`components/app/ajuda/ajuda.tsx`): adotar o
valor do servidor a cada resposta traria de volta um valor velho no meio de
duas escolhas seguidas.

A action:

- confere a sessão com `obterWorkspace({ escola: true })`, e não com
  `requireWorkspace()`. Ela roda por trás (ao fechar um tour, ao tocar “Agora
  não”), e um redirecionamento ali (sessão vencida, senha provisória,
  verificação pendente) perderia o que a pessoa estava digitando. Sem sessão
  válida, ou com a senha provisória, não grava;
- recalcula a partir do que está gravado, só aceita chave de tour que existe
  (`ehChaveDeTour()`) e não grava nada se nada mudou;
- grava pelo cliente admin — `auth.admin.updateUserById()` no id que o
  `obterWorkspace` acabou de conferir, nunca um id vindo do navegador. O Auth
  mescla o `user_metadata` chave a chave: só `ajuda` muda; nome e usuário
  ficam;
- nunca lança, não redireciona e não chama `revalidatePath()`: uma falha só
  faz a dica aparecer de novo num próximo acesso.

**Por que pelo admin:** o `auth.updateUser()` do cliente da própria pessoa
regravaria o cookie da sessão, e cookie gravado numa action faz o Next
refazer no servidor o layout e a página abertos — a cada “Agora não” e a cada
fim de tour. O layout lê o progresso do `getUser()` (`lib/session.ts`), que
vem fresco do Auth, então o próximo acesso já vê o que foi gravado.

**Por que no metadata:** é estado de interface da própria pessoa. Não pede
migração (o banco é um só e é produção — `AGENTS.md`), vale em qualquer
aparelho e **não decide acesso a nada**. Como o `user_metadata` pode ser
editado pela própria pessoa, `lerProgresso()` desconfia de tudo o que lê.
Como o metadata viaja dentro do token de sessão em toda requisição, a lista
tem teto de 120 chaves.

### Na Área do Voluntário

A Área do Voluntário (`/membro`) tem sessão própria, fora do Supabase Auth, e
ajuda própria no mesmo formato: `lib/ajuda/membro.ts` (as boas-vindas, o
guia de cada um dos cinco destinos, com as telas internas, e os tópicos
gerais). O provedor é `components/membro/ajuda.tsx`, que o layout
`app/membro/(area)/layout.tsx` põe em volta do cabeçalho e do conteúdo. O
motor do tour é o mesmo.

- **Convite, não janela.** No Início (`/membro`), 1 s depois de chegar, quem
  ainda não viu as boas-vindas recebe um cartão no canto (no celular, acima
  da barra de baixo): “Boas-vindas, <nome>!”, “Quer um tour de 1 minuto pela
  área?”, com “Agora não” e “Fazer o tour”. Não é modal nem pega o foco, e as
  duas escolhas contam como vistas. Não aparece por cima de um `?tour=1` que
  esteja esperando a página.
- **Tour pedido, não oferecido.** Não há dica de primeira visita por tela nem
  tecla `?`. O tour da tela aberta está no menu da conta (as iniciais, no
  alto), em “Tour desta tela”, que só aparece nas telas com tour; e a página
  de Ajuda tem “Fazer o tour” em cada destino e “Tour de <tela>” nas telas
  internas de endereço fixo, com `?tour=1`. Pedir qualquer tour conta as
  boas-vindas como vistas: quem pediu já achou a ajuda.
- **A página de Ajuda** (`/membro/ajuda`,
  `components/membro/central-de-ajuda.tsx`) não é um sexto destino:
  chega-se pelo item “Ajuda” do menu da conta e pelo link “Ajuda: passo a
  passo e perguntas frequentes”, no fim do Início. Tem “Primeira vez por
  aqui?” com “Refazer o tour de boas-vindas” (que roda ali mesmo), uma seção
  por destino, os tópicos gerais (entrar e sair, e-mails, tours e ajuda), a
  busca (`buscarNaAjudaDoMembro()`) e “Falar com a coordenação”. Cada tarefa
  e pergunta tem âncora pelo `id` (`/membro/ajuda#lista-de-espera`), que abre
  a resposta ao chegar — e, como tudo fica numa página só, o `id` precisa ser
  único na página inteira.
- **Texto sob demanda.** Em toda página, o layout manda só a lista das telas
  com tour (`CAMINHOS_COM_TOUR`, montada no servidor a partir do mesmo
  texto). O texto (cerca de 16 KB comprimidos — o voluntário costuma estar no
  4G) é baixado quando um tour começa; abrir o menu da conta numa tela com
  tour, ou ver o convite, já adianta o download. A página de Ajuda importa o
  texto direto: ela é a ajuda.
- **Progresso no aparelho.** O mesmo formato de `lib/ajuda/progresso.ts`, no
  `localStorage`, na chave `cvrj-membro-ajuda`. Sair da área apaga a chave
  (`esquecerAoSair()`, em `components/membro/conta.tsx`, junto com o último
  e-mail usado): num aparelho compartilhado, quem entra depois ganha o
  convite. Limpar o navegador ou trocar de celular também traz o convite de
  volta — aceitável para algo que se fecha com um toque. Sem armazenamento
  (aba anônima, bloqueio), a área funciona igual e só não lembra. Na
  visualização da equipe (`/membro/previa`), o convite não abre sozinho e
  nada é gravado.

**Por quê:** sem conta no Auth, não há `user_metadata` onde guardar; e, como
o progresso não decide acesso a nada, o aparelho basta.

### Motor próprio em vez de biblioteca

| Opção | Por que não |
| --- | --- |
| Shepherd, Intro.js | AGPL ou licença comercial paga — a Shepherd exige a comercial de "revenue-generating companies". |
| Appcues, Userpilot, Pendo, Intercom | Serviços pagos, com script de terceiro em toda página e o uso das pessoas medido fora de casa. Não cabe numa ferramenta interna com dados de pessoas. |
| driver.js | A mais próxima (MIT, leve, sem dependências). Mas a documentação não descreve diálogo acessível nem comportamento no celular, e o visual seria o dela. |

O motor daqui (`components/ajuda/tour.tsx`, com a posição num módulo puro
em `lib/ajuda/posicao.ts`, cerca de 380 linhas somadas) dá:

- o **visual do sistema** — tokens do tema, modo escuro, o `Button` de
  `components/ui`;
- o **celular** como caso de primeira classe: abaixo de 640 px o balão vira
  uma folha presa à borda;
- **acessibilidade** no padrão do APG, conferível no código;
- as **regras nossas**: alvo ausente vai ao centro, passo opcional some antes
  de contar "2 de 5";
- **zero dependência** nova, e a matemática da posição conferível com `npx tsx`.

## 3. Como o motor do tour funciona

`<Tour passos rotulo aoTerminar focoDeVolta />` — montado é aberto; quem
abre desmonta no `aoTerminar(fim)`, com `fim` igual a `'concluido'` ou
`'pulado'` (Esc, o X "Fechar o tour"). `rotulo` aparece acima do título
("Tour · Pautas", "Boas-vindas"). `focoDeVolta` diz para onde o foco vai ao
fechar quando não dá para voltar aonde ele estava (ver "Teclado e leitor de
tela", abaixo): na Redação, o “?” do topo; na Área do Voluntário, o conteúdo
(`#conteudo`).

- **Alvo.** Cada passo aponta para um elemento marcado com
  `data-ajuda="<alvo>"`. `acharAlvo()` pega o primeiro que está **de fato na
  tela**: ignora o que está dentro de `[inert]`, `[aria-hidden="true"]` ou
  `[hidden]`, o que tem `visibility: hidden`, o que não tem tamanho e o que
  está fora da tela na horizontal (a gaveta do menu fechada no celular) — a
  não ser que esteja numa faixa que rola de lado (as abas no celular): aí o
  tour rola a faixa até ele.
- **Alvo ausente vai ao centro.** Passo sem `alvo`, ou com o alvo fora da
  tela, aparece no meio, com o fundo todo escurecido. Por isso o texto de
  todo passo precisa se sustentar sozinho.
- **`seAusente: 'pular'`.** O passo some se o alvo não estiver na tela. A
  triagem acontece **uma vez, quando o tour abre**, para a contagem "2 de 5"
  ser a verdadeira. Por isso quem abre o tour espera a página chegar: a dica
  de primeira visita e o `?tour=1` esperam o esqueleto do `loading.tsx`
  (`data-carregando`) sair, e o `?tour=1` espera ainda algum alvo aparecer
  (§2). Se todos os passos sumirem, o tour termina na hora, como concluído.
- **Rolagem.** Se o alvo não está entre 64 px do topo e 16 px do fim da tela,
  ou está fora dela de lado, a página rola até ele: para o meio da tela; com
  o começo no alto, se o alvo não cabe na altura da tela (a prova inteira, o
  formulário do perfil — centralizado, mostrava o meio dele e escondia o que
  o passo descreve); ou só de lado, se na altura ele já cabe. O balão acompanha a rolagem suave (quadro a
  quadro por quase 1 s), qualquer rolagem depois, o redimensionar da janela e
  a mudança de tamanho do próprio alvo. Se o React troca o elemento no meio
  do passo (a lista recarregou, chegou algo pelo tempo real), o motor procura
  o alvo de novo.
- **Posição** (`posicionarBalao()`). Com 640 px ou mais: o lado pedido no
  passo (`lado`), senão o primeiro que couber na ordem embaixo, em cima,
  direita, esquerda; se nenhum couber, folha presa à borda. **Abaixo de
  640 px**: sempre folha, com até 480 px e respeitando a área segura do
  celular. A folha fica embaixo, ou em cima quando o meio da parte visível do
  alvo passa de 55% da altura da tela; o alvo que passa do fim da tela conta
  pelo começo, e a folha só sobe se couber acima dele. Só o balão ancorado é
  medido antes de pintar: medir também a folha, de outra largura, fazia a
  escolha do lado alternar sem fim.
- **Destaque.** O alvo fica iluminado, com uma folga de 6 px e cortado pela
  borda da tela; o resto escurece.
- **A página não recebe clique** enquanto o tour está aberto, e o ⌘K não abre
  a busca. O tour não é para ser feito clicando junto: um clique fora do
  lugar navegaria e deixaria o balão apontando para o nada.
- **Teclado e leitor de tela.** O balão é `role="dialog"` com `aria-modal`,
  título em `aria-labelledby` e texto em `aria-describedby`. A cada passo o
  foco vai para o próprio balão, e o leitor lê o passo novo; o motor confere
  de novo no quadro seguinte, porque o diálogo que fechou para dar lugar ao
  tour (o painel, as boas-vindas) devolve o foco depois. Tab e Shift+Tab
  ficam presos nos botões do balão; **Esc** fecha; **→** e **←** avançam e
  voltam; **Enter** com o foco no balão avança. Ao fechar, o foco volta para
  onde estava; se isso saiu da tela (o botão da dica) ou era a página toda
  (o tour veio de um link ou de um diálogo que já fechou), vai para o
  `focoDeVolta`.
- **Movimento e toque.** Sem animação para quem pediu menos movimento
  (`prefers-reduced-motion`). Os botões têm 44 px de altura no celular e
  36 px no computador, e o X tem 44×44 px no celular e 36×36 px no
  computador — acima dos 24 px da WCAG 2.5.8.
- Embaixo, só o "2 de 5" em texto. As bolinhas de progresso saíram: no balão
  de 344 px, elas, o "Voltar" e o "Próximo" não cabiam juntos.

## 4. Guia de estilo do conteúdo

Vale para todo texto de ajuda: tour, tarefas, perguntas, boas-vindas.

**Voz**

- Português do Brasil, "você", frases curtas e em ordem direta, tom de
  colega experiente.
- Sem jargão técnico: nada de RLS, server action, Supabase, cookie, token,
  R2, cron, API — a não ser que a própria tela use a palavra.
- Linguagem neutra com palavras que já existem: "Boas-vindas" (nunca
  "Bem-vindo"), "a pessoa", "quem", "equipe". Evite "o usuário" e
  "inscrito/inscrita" quando der ("quem se inscreveu").
- Explique o porquê quando ajuda a acertar: "a numeração do ofício recomeça
  a cada ano".

**Nomes da tela**

- Botões, abas, campos e status **exatamente** como aparecem na tela,
  inclusive maiúsculas, entre aspas curvas: “Nova pauta”. Confira no JSX o
  texto real — não o que você lembra.

**Verdade acima de tudo**

- Cada frase tem apoio no código: o componente, a action, a regra em `lib/`,
  as permissões em `lib/permissoes.ts`. Não invente prazo, limite, e-mail,
  telefone, regra nem botão.
- Na dúvida, deixe de fora e pergunte a quem cuida da área. Ajuda errada é
  pior do que ajuda nenhuma: a pessoa segue o passo e se perde.
- Nada de dado sensível: nome de pessoa, valor, endereço interno, senha. O
  texto vai para o navegador (§2).

**Tour**

- De 3 a 7 passos. Título com até uns 40 caracteres; texto de 1 ou 2 frases,
  até uns 220 caracteres. Um passo, uma ideia.
- O primeiro passo pode ser sem alvo: a visão geral da tela.
- O texto funciona mesmo se o balão cair no meio da tela: nada de "clique
  aqui"; prefira "O botão “Nova pauta” …".
- O que só aparece às vezes (botão só de admin, lista que pode estar vazia):
  `seAusente: 'pular'`, ou texto que funcione no centro.

**Como fazer (tarefas)**

- As tarefas reais do dia a dia na área, com título no infinitivo ("Criar
  uma pauta").
- De 3 a 8 passos; cada passo é uma ação com o nome do botão ou do campo.
- Quando só alguns papéis podem, diga em `quem` ("Só administradores").
- `dica` para o cuidado ou o atalho que evita erro.

**Perguntas frequentes**

- As dúvidas reais: "por que não consigo…", "o que significa o status X",
  "quem vê isso", "dá para desfazer?".
- Resposta direta, de 1 a 4 frases; parágrafos separados por linha em branco
  (`\n\n`).
- `termos` com sinônimos e nomes antigos que alguém usaria na busca. Se a
  dúvida nasce de uma mensagem de erro, ponha o texto da mensagem nos
  `termos`: quem colar o erro na busca acha a resposta.

**Ajuda geral e a equipe da escola**

- A ajuda geral (`conteudo/geral.ts`) também vale para a equipe da escola,
  que não tem o “Criar” nem abre chamados. Tarefa geral que manda usar um dos
  dois leva `quem: 'Equipe da Redação'` (`SO_DA_REDACAO`) e some para ela.
  Pergunta geral que cita um dos dois diz também o caminho da escola (o
  Chat). O script de conferência cobra as duas coisas (§5).

**Ids**

- Minúsculas com hífen, únicos dentro da área. Viram âncora na Central
  (`/ajuda/pautas#criar-pauta`) e podem estar em links já enviados: não
  troque o `id` de uma pergunta que já existe.

## 5. Como pôr ajuda numa área nova (ou atualizar quando a tela muda)

A ajuda muda **no mesmo PR** que muda a tela.

1. **A área existe em `lib/navegacao.ts`** (ARQUITETURA.md §10.3). O `href`
   de lá é a chave da ajuda.
2. **Escreva o guia** no arquivo do grupo em `lib/ajuda/conteudo/` (o mesmo
   corte do menu: `planejamento.ts`, `financeiro.ts`…), no formato de
   `lib/ajuda/tipos.ts`: `href`, `paraQueServe`, `quemUsa`, `tour`, `telas`,
   `tarefas`, `perguntas`, `relacionadas`. Boas-vindas e tópicos gerais
   ficam em `conteudo/geral.ts`; a Área do Voluntário, em `lib/ajuda/membro.ts`.
   Grupo novo no menu = arquivo novo em `conteudo/`, somado a `GUIAS` em
   `lib/ajuda/index.ts`. O índice leve (`indiceDaAjuda()`) e a lista de telas
   com tour do voluntário (`CAMINHOS_COM_TOUR`) se montam sozinhos a partir
   do conteúdo: não há segunda lista a manter.
3. **Tela interna com tour próprio** entra em `telas`, com o caminho no
   formato de rota do Next (`/pautas/[id]`, `/financeiro/compras/novo`). Ela
   precisa morar dentro do endereço da área (ou numa das moradas de
   `lib/navegacao.ts`, como `/conteudos` em Pautas).
4. **Marque os alvos** com `data-ajuda="<prefixo>.<coisa>"`, minúsculas e
   hífen (`pautas.quadro`, `pautas.nova`). O prefixo é o da área; a moldura
   comum a todas as telas (topo, menu) usa `shell.` (`shell.ajuda`,
   `shell.criar`). Regras:
   - valor sempre literal: `data-ajuda="pautas.quadro"`;
   - marcação condicional com aspas simples dentro das chaves —
     `data-ajuda={primeiro ? 'pautas.cartao' : undefined}` — que é o que o
     script de conferência reconhece; nunca monte o valor com template string;
   - num elemento com caixa visível (`div`, `section`, `button`, `a`,
     `header`, `form`, `ul`…). Componente só se repassa props ao DOM
     (`components/ui/button.tsx` repassa; o Trigger do Base UI também).
     Nunca num invólucro com `display: contents`, que não tem tamanho;
   - prefira contêineres estáveis e sempre desenhados (a barra de filtros,
     o quadro, o botão principal) a itens de lista que podem não existir;
   - na tela, mude **só** o atributo: nada de comportamento, estilo, texto ou
     formatação.
5. **Rode a conferência:** `npx tsx scripts/conferir-ajuda.ts`. Sai com
   código 1 se houver erro.
   - **Erro:** alvo citado num tour sem `data-ajuda` em `app/` ou
     `components/`; ajuda de área que não existe no menu; duas ajudas para a
     mesma área; `id` repetido ou fora do padrão; tela fora da área;
     `relacionadas` apontando para área inexistente; `id` repetido nos
     tópicos gerais; tarefa geral que cita o “Criar” ou chamado sem
     `quem: 'Equipe da Redação'` (§4); `id` repetido ou fora do padrão na
     ajuda do voluntário (lá a Central é uma página só, então o `id` vale para
     a página inteira); no glossário (§15), `id` repetido ou fora do padrão,
     área que não existe no menu, `veja` para um termo que não existe,
     definição sem ponto final e termo que a busca pelo nome não traz primeiro.
   - **Aviso:** área sem ajuda; área sem perguntas; tela sem tour; tour com
     menos de 2 ou mais de 8 passos; pergunta geral que cita o “Criar” ou
     chamado sem dizer o caminho da escola; `data-ajuda` marcado sem uso (ok
     se for de propósito).

   O script confere que o alvo existe em **algum** arquivo, não que está na
   tela certa nem que o texto bate com a tela. Isso é o passo seguinte.
6. **Percorra de verdade:** abra a tela, rode o tour no computador e numa
   janela estreita (menos de 640 px, com o menu fechado), e confira que cada
   balão cai onde deveria e que cada nome entre aspas é o da tela.

**O texto fica fora do pacote de toda página** (§2, "O texto vem quando
alguém pede"). Um import no lugar errado o traz de volta sem erro nenhum de
compilação:

- componente do cliente que vai em toda página da Redação (o shell, o
  provedor, a dica, as boas-vindas, a moldura do painel) não importa valor de
  `@/lib/ajuda` nem de `lib/ajuda/conteudo/`. Use o índice (`useAjuda().onde`)
  ou `carregarAjuda()`. `import type` pode, e os módulos pequenos também
  (`indice`, `progresso`, `posicao`, `tipos`);
- `lib/ajuda/indice.ts` não importa `lib/ajuda`: é ele que vai ao navegador;
- o que uma página da Central usa no navegador mora num arquivo sem nada de
  `lib/ajuda`. O Turbopack liga a referência do cliente ao arquivo inteiro,
  não ao export: foi por isso que `AncoraDaAjuda` saiu de `central.tsx` para
  `ancora.tsx` (em `central.tsx`, cada `/ajuda/<área>` baixava o texto todo);
- na Área do Voluntário, vale o mesmo para `lib/ajuda/membro.ts`: fora da
  página de Ajuda, só `import type` e o `import()` de
  `components/membro/ajuda.tsx`.

Para conferir: `grep -rn "@/lib/ajuda'" app components`. Valor de
`@/lib/ajuda` só pode aparecer em arquivo do servidor (o layout, as páginas
da Central, a action), no `import()` de `carregar.ts` e em
`painel-conteudo.tsx`, que já é baixado sob demanda.

**Quando a tela muda:**

- **botão ou aba renomeados** — procure o nome antigo em `lib/ajuda/`
  (`grep -rn "Nome antigo" lib/ajuda`) e troque em tudo;
- **elemento removido** — se o `data-ajuda` sumiu de todos os arquivos, o
  script acusa o alvo sem elemento; mova o atributo ou reescreva o passo;
- **elemento movido** — o script não percebe: rode o tour e confira que o
  balão ainda aponta para o lugar certo;
- **regra mudou** (permissão, prazo, status novo) — atualize a tarefa e a
  pergunta que a citam;
- **área nova** — guia novo, mesmo que curto: o script avisa "área sem
  ajuda";
- **palavra nova** (um status, uma sigla, um nome próprio da tela, como
  "plaqueta" ou "competência") — um termo no glossário (§15), com a área em
  `areas`;
- **esqueleto de carregamento novo** — um `loading.tsx` dentro de
  `app/(app)` ou `app/membro/(area)` marca o esqueleto com `data-carregando`,
  como os que já existem: é o que a dica e o `?tour=1` esperam sair antes de
  abrir o tour.

## 6. O que ficou de fora

- **Trilha de entrada com barra de progresso** (as missões da Conta Azul, o
  Getting Started do Notion, o checklist do Pendo e do Linear). Na Redação
  quem cria a conta é o administrador, e o trabalho é a rotina de cada área,
  não uma configuração inicial. Uma lista de "tours por fazer" seria o push
  que a pesquisa desaconselha. O que existe é pequeno e puxado: os “Primeiros
  passos” do painel “?”, com três coisas da conta (ver as boas-vindas,
  confirmar o e-mail de recuperação, pôr uma foto) e o “1 de 3”, que somem
  quando as três estão feitas.
- **Medir os tours** (conclusão, onde a pessoa desiste), como fazem Chameleon
  e Appcues. A Redação só tem o Analytics e o Speed Insights da Vercel, que
  contam visitas de página, sem eventos por tela ou por pessoa. Se um dia
  fizer falta, dá para começar pelos eventos do próprio Analytics.
- **Vídeo e imagem na ajuda.** (O áudio entrou em 06/11/2026, §12; os vídeos são a próxima fase do mesmo projeto.) Só texto por enquanto: imagem e vídeo ficam
  velhos quando a tela muda, sem ninguém perceber; o texto, o script confere
  ao menos em parte.
- **Tour em que se clica no elemento de verdade.** O nosso bloqueia a página
  de propósito (§3).
- **Dicas soltas ("i") ao lado de campos e avisos de novidade.**
- **Assistente com IA na ajuda** (Slackbot, Userpilot).

**Pendências a conferir**

- **Leitor de tela.** O motor segue o APG no código, mas não foi testado com
  NVDA nem VoiceOver.
- **Alvo empurrado sem rolagem.** Passado o primeiro segundo, o balão só se
  move com rolagem, janela redimensionada ou alvo que muda de tamanho. Se algo
  carregar acima do alvo e empurrá-lo sem nada disso, o destaque fica no
  lugar antigo até a próxima rolagem.
- **Tour que não baixa, no voluntário.** Sem sinal, o tour pedido na Área do
  Voluntário (convite, “Tour desta tela”, `?tour=1`) simplesmente não abre,
  sem aviso. Na Redação, o canto da dica avisa e oferece “Tentar de novo”.
- **Tours vistos sem uso, no voluntário.** A área grava os tours concluídos
  (`vistos`), mas nada os lê: lá não há dica de primeira visita por tela.
  Falta decidir se ela vale a pena ali, ou se é melhor parar de gravar.
- **Um arquivo só para o texto da Redação.** O primeiro painel, tour ou busca
  da visita baixa as 40 áreas de uma vez (cerca de 145 KB comprimidos). Se o
  conteúdo crescer muito, dá para dividir por grupo do menu.

## 7. Onde isso mora

- `lib/ajuda/tipos.ts` — o formato: `GuiaDaArea`, `PassoDoTour`, `Tarefa`,
  `Pergunta`, `TelaDaArea`, `TopicoGeral`.
- `lib/ajuda/indice.ts` — o índice leve, que vai ao navegador em toda
  página: `IndiceDaAjuda`, `ondeNaAjuda()` (que tela é esta e que tour vale),
  `casarCaminho()`, `rotuloDoTour()`, `hrefDaAjuda()`. Não importa `lib/ajuda`.
- `lib/ajuda/index.ts` — o registro, com o texto: `GUIAS`, `guiaDaArea()`,
  `indiceDaAjuda()`, `ajudaDoCaminho()`, `guiasVisiveis()`,
  `topicosGerais()`, `buscarNaAjuda()`, `ehChaveDeTour()`, `SO_DA_REDACAO`,
  `alvosCitados()`.
- `lib/ajuda/conteudo/<grupo>.ts` — o conteúdo de cada grupo do menu;
  `conteudo/geral.ts` — boas-vindas e tópicos gerais.
- `lib/ajuda/membro.ts` — a Área do Voluntário: `BOAS_VINDAS_DO_MEMBRO`,
  `GUIAS_DO_MEMBRO`, `TOPICOS_DO_MEMBRO`, `tourDoMembro()`,
  `buscarNaAjudaDoMembro()`.
- `lib/ajuda/texto.ts` — `resumoEDetalhe()`: a primeira frase do "para que
  serve" para o painel (§11). Puro.
- `lib/ajuda/glossario.ts` — o glossário (§15): `GLOSSARIO`, `termosDaArea()`,
  `termoDoGlossario()`, `letraDoTermo()`. Puro. `glossarioVisivel()` (o corte
  pelo menu) mora em `lib/ajuda/index.ts`; `hrefDoGlossario()` e
  `ROTULO_DO_ACHADO`, no índice leve.
- `lib/ajuda/progresso.ts` — o que a pessoa já viu e a tecla `?`.
- `lib/ajuda/posicao.ts` — onde o balão fica (puro).
- `components/ajuda/tour.tsx` — o motor do tour (Redação e voluntário).
- `components/app/ajuda/` — na Redação:
  - `ajuda.tsx`: o provedor (boas-vindas, dica de primeira visita, tecla `?`,
    `?tour=1`, o tour aberto) e `useFocoAoFecharDialogo`;
  - `carregar.ts`: `carregarAjuda()` e `adiantarAjuda()`, que baixam o texto;
  - `painel.tsx`: a moldura do painel “?”, em toda página;
    `painel-conteudo.tsx`: o miolo, baixado na primeira abertura;
  - `boas-vindas.tsx` e `dica.tsx`: a janela de boas-vindas; a dica de
    primeira visita e o aviso de tour que não baixou;
  - `central.tsx`: as partes da Central que rodam no navegador (a busca, os
    botões de boas-vindas, a caixa da tecla `?`); `ancora.tsx`: a
    `AncoraDaAjuda`, à parte de propósito (§5);
  - `blocos.tsx`: as peças de texto comuns ao painel e à Central.
- `app/(app)/layout.tsx` — monta o provedor com o progresso, o índice e os
  dados do "Primeiros passos"; `app/(app)/ajuda/` — a Central (`page.tsx`,
  `[...area]/page.tsx`, `[...area]/not-found.tsx`, `glossario/page.tsx` e
  `grupos-da-pessoa.ts`, o corte do menu).
- `app/actions/ajuda.ts` — `registrarAjuda()`, que grava o progresso.
- `lib/navegacao.ts` — a área "Ajuda" (`/ajuda`), no grupo “Conta e administração”.
- `components/membro/ajuda.tsx` — o provedor do voluntário (convite, tours,
  `?tour=1`, `localStorage`); `central-de-ajuda.tsx` — a página
  `/membro/ajuda`; `conta.tsx` — o menu da conta (“Ajuda”, “Tour desta tela”)
  e o `esquecerAoSair()`; `app/membro/(area)/layout.tsx` — o provedor e a
  lista das telas com tour; `app/membro/(area)/ajuda/page.tsx` — a rota.
- `app/(app)/loading.tsx` e `app/membro/(area)/loading.tsx` — o esqueleto
  com `data-carregando`, que a dica e o `?tour=1` esperam sair.
- `scripts/conferir-ajuda.ts` — a conferência do conteúdo contra o código.

## 8. Fontes

Ferramentas de trabalho:
[Linear — Keyboard shortcuts help](https://linear.app/changelog/2021-03-25-keyboard-shortcuts-help) ·
[Linear — entrada, tela a tela (Supademo)](https://supademo.com/user-flow-examples/linear) ·
[Notion — entrada leve (Appcues GoodUX)](https://goodux.appcues.com/blog/notions-lightweight-onboarding) ·
[Notion — Using slash commands](https://www.notion.com/help/guides/using-slash-commands) ·
[Asana — Keyboard shortcuts](https://help.asana.com/s/article/keyboard-shortcuts?language=en_US) ·
[Slack — quick start guide](https://slack.com/help/articles/360059928654-How-to-use-Slack--your-quick-start-guide) ·
[ClickUp — support resources](https://help.clickup.com/hc/en-us/articles/16251448728727-ClickUp-support-resources) ·
[HubSpot — Get help with HubSpot](https://knowledge.hubspot.com/help-and-resources/get-help-with-hubspot) ·
[Pipefy — Por onde começar](https://community.pipefy.com/primeiros-passos-175/por-onde-comecar-no-pipefy-um-guia-para-novos-usuarios-5140) ·
[RD Station — serviços](https://www.rdstation.com/planos/marketing/servicos/) ·
[Conta Azul — Primeiros passos](https://ajuda.contaazul.com/hc/pt-br/articles/4413113957261-Primeiros-passos-na-Conta-Azul) ·
[Conta Azul — Central de Ajuda: boas práticas](https://ajuda.contaazul.com/hc/pt-br/articles/13361604744205-Central-de-Ajuda-Boas-pr%C3%A1ticas) ·
[Omie — atualizações de maio (blog)](https://www.omie.com.br/blog/todo-mes-melhorias-pra-voce-fique-por-dentro-das-atualizacoes-omie-de-maio/) ·
[Padrão Digital de Governo](https://www.gov.br/ds/home) ·
[Senado — linguagem simples obrigatória](https://www12.senado.leg.br/noticias/materias/2025/11/17/linguagem-simples-em-mensagens-de-orgaos-publicos-agora-e-obrigatoria) ·
[Lei 15.263/2025 (Planalto)](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15263.htm) ·
[GitHub — Keyboard shortcuts](https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts)

Tours e centrais de ajuda:
[Appcues — Product tours guide](https://www.appcues.com/blog/product-tours-walkthroughs-ultimate-guide) ·
[Chameleon — Benchmark Report 2022](https://www.chameleon.io/benchmark-report-2022) ·
[Intercom — Best practices for Product Tours](https://www.intercom.com/help/en/articles/3095688-best-practices-for-using-product-tours) ·
[Pendo — Overview of the Resource Center](https://support.pendo.io/hc/en-us/articles/360031866712-Overview-of-the-Resource-Center) ·
[Userpilot — In-app help](https://userpilot.com/blog/in-app-help/) ·
[driver.js](https://github.com/kamranahmedse/driver.js) ·
[driver.js — configuração](https://driverjs.com/docs/configuration) ·
[Shepherd](https://github.com/shipshapecode/shepherd) ·
[Intro.js — licença](https://introjs.com/docs/getting-started/license)

Usabilidade e acessibilidade:
[NN/g — Onboarding Tutorials vs. Contextual Help](https://www.nngroup.com/articles/onboarding-tutorials/) ·
[NN/g — Mobile Tutorials](https://www.nngroup.com/articles/mobile-tutorials/) ·
[NN/g — Mobile-App Onboarding](https://www.nngroup.com/articles/mobile-app-onboarding/) ·
[NN/g — Instructional Overlays and Coach Marks](https://www.nngroup.com/articles/mobile-instructional-overlay/) ·
[NN/g — Help and Documentation](https://www.nngroup.com/articles/help-and-documentation/) ·
[WAI-ARIA APG — Dialog (Modal)](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) ·
[WCAG 2.2 — 2.4.11 Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) ·
[WCAG 2.2 — 2.5.8 Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) ·
[WCAG 2.2 — 2.1.4 Character Key Shortcuts](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html)

## 9. Na prática e exemplos (26/09/2026)

Pedido do Matheus depois de um dia de muitas mudanças: "acrescente exemplos, mostre para o
usuário como imaginamos a ferramenta funcionando". É a lição do Pipefy (§1.1): o modelo mental vem
antes do passo a passo.

- **Na prática** (`GuiaDaArea.naPratica`): toda área conta, em 3 a 7 momentos, um caso concreto de
  ponta a ponta, com nomes e números plausíveis ("A Ana pede 10 resmas de papel…"). No painel "?"
  ele fica recolhido, logo abaixo do "para que serve"; na Central, aberto, antes do passo a passo.
  O `conferir-ajuda` acusa área sem "Na prática".
- **Exemplo** (`Tarefa.exemplo`): nas tarefas principais, um caso que mostra a tarefa acontecendo.
  Não repete os passos. Entra na busca.
- **Como imaginamos o Palácio funcionando** (tópico geral): quatro jornadas que atravessam as
  áreas (ação de rua → notícia; necessidade → compra; inscrição → certificado; dinheiro →
  fechamento).
- **Estilo**: os nomes das pessoas nos exemplos são fictícios e aparecem sem pronome. Botões e
  campos com o nome exato da tela. Aspas tipográficas, porque o texto vai entre aspas simples.

## 10. O beta com a equipe (26/09/2026)

"Preciso de tudo o mais completo possível nesse atendimento beta aos nossos colaboradores para
conseguir melhorar a aplicação o mais rápido possível." O retorno é **puxado** e fica sempre à
mão, sem janela que interrompe o trabalho (NN/g, §1.3).

Onde a pessoa conta (um formulário só, em dois lugares — §11):

- **"Beta", no topo** (tablet e computador) e **"Não achou? Conte para a equipe", no fim do
  painel "?"** (qualquer aparelho; no celular é o único, porque o topo não tem espaço). É o
  mesmo formulário (`FormularioDoBeta`, em `components/app/ajuda/beta.tsx`): erro, ideia,
  dúvida ou elogio, com a nota da tela opcional ("E esta tela, de modo geral?", cinco notas de
  "Muito ruim" a "Ótima"). No painel ele começa em "Tenho uma dúvida", porque é de lá que se
  chega sem resposta, e não tem o erro, que ganhou a entrada dele logo acima, "Achei um erro"
  (§17). A dúvida vira resposta nova na ajuda para a próxima pessoa.
- **"Isso ajudou?"**, em cada pergunta frequente, no painel e na Central. Cada pessoa tem um voto
  por pergunta, e votar de novo troca o voto. Quem vota "Não" pode contar o que faltou.

Até 28/09/2026 o painel tinha três formulários parecidos enfileirados — o Beta (no celular), "O
que achou desta tela?" e "Pergunte à equipe" —, e ninguém sabia qual usar. Os tipos de retorno
(`tela`, `duvida`…) e a caixa de retornos não mudaram.

Junto vai o contexto, para reproduzir (`lerContexto`, em `lib/ajuda/retornos.ts`):
- a tela;
- o tamanho da janela;
- se é celular e se é tela de toque;
- o nome do navegador e do sistema;
- o idioma e o tema;
- no erro, as últimas mensagens de erro da aba, o código do erro e a versão no ar (§17).

Nunca vai o conteúdo da tela.

O que volta para a pessoa:

- **"Perguntas mais frequentes"**, no alto da Central. Primeiro aparecem as mais votadas como
  úteis (`ajuda_votos_das_perguntas`, só contagens, nunca quem votou). A lista é completada com
  `MAIS_PERGUNTADAS` (`lib/ajuda/index.ts`), as dúvidas mais comuns do começo do beta.
- **"Seus retornos do beta"**, no fim da Central: o que a pessoa mandou, a situação e a resposta.
  A resposta também chega no sino.

A administração cuida dos retornos em `/ajuda/retornos` (só administradores):
- **números**: esperando resposta, nota média, opiniões e quantas pessoas participaram;
- **telas da pior para a melhor avaliação**;
- **respostas da ajuda que não ajudaram**, com o que faltou;
- **a lista** com filtros por situação, tipo e tela, onde se responde e se muda a situação;
- **a planilha** (CSV, `/api/ajuda/retornos`).

Problema, dúvida, sugestão, nota 1–2 e "não ajudou" com texto avisam os administradores na hora.
Esses avisos usam a categoria "Chamados", a mais próxima de atendimento, sem criar uma categoria
nova de notificação.

Banco: `ajuda_retornos` (migração `20260929010000`), com RLS:
- quem manda vê os próprios retornos;
- o administrador vê todos;
- só se insere em nome próprio, como "novo";
- só o próprio voto pode ser apagado, para trocar.

A resposta passa por `ajuda_responder_retorno`, que confere se quem responde é administrador.
Conferência: `npx tsx scripts/conferir-retornos.ts`.

## 11. A arrumação: uma coisa de cada vez (28/09/2026)

"Vamos acumulando várias ideias e acabou ficando uma bagunça absurda." Em
três semanas a ajuda cresceu para 43 áreas, 328 passos a passo e 541
perguntas, e o painel "?" virou uma rolagem só: o "para que serve" de até
500 caracteres, o "quem usa", o "Na prática", o tour, até 20 tarefas, até
23 perguntas, "O que achou desta tela?", "Pergunte à equipe" e, no celular,
o Beta em cima de tudo — nove blocos antes do pé. Configurações tinha um tour
de 15 balões. O conteúdo continua sendo o valor da ajuda; o que mudou foi a
**ordem** e a **medida** de cada coisa.

**O painel mostra uma coisa de cada vez** (`painel-conteudo.tsx`):

1. A busca.
2. "Primeiros passos", só enquanto faltam.
3. A área **numa frase**: a primeira do "para que serve"
   (`resumoEDetalhe()`, em `lib/ajuda/texto.ts`: a primeira frase, puxando
   a seguinte se for muito curta, até uns 220 caracteres). O resto e o "quem
   usa" ficam atrás de “Ler mais sobre <área>”. A Central continua mostrando
   o texto inteiro.
4. “Fazer o tour desta tela” e o “Na prática” recolhido.
5. **“Como fazer” e “Dúvidas” em abas**, uma lista de cada vez, com seis
   itens à vista e “Mostrar as outras N” para o resto (`A_VISTA`). Com só um
   dos dois, vira uma seção comum. As abas seguem o padrão de tabs (setas
   trocam a aba).
6. “Ver tudo sobre <área> na Central de ajuda”.
7. **Um único lugar para falar com a equipe**: “Não achou? Conte para a
   equipe”, recolhido, com o mesmo formulário do Beta (§10).

Numa tela sem guia, a ajuda geral vem um tópico recolhido por vez, com o
título e o resumo à vista. Na Central, a mesma coisa: a "Ajuda geral" (44
itens abertos, antes) virou cinco tópicos recolhidos, e a `AncoraDaAjuda`
abre o tópico da resposta pedida por link (`/ajuda#esqueci-a-senha`). A
"Ajuda por área" subiu para antes de "Comece por aqui": é o que mais se
procura.

**A medida de cada coisa**, cobrada por `scripts/conferir-ajuda.ts` (avisos,
não erros: o que passa vira rolagem sem fim no painel):

| O quê | Até | Por quê |
| --- | --- | --- |
| "Para que serve" | 400 caracteres; a primeira frase, 260 | O painel mostra só a primeira frase. O que passa cabe numa pergunta. |
| "Quem usa" | 400 caracteres | O mesmo. Regras de aviso e de nível têm pergunta própria. |
| Tour de área | 3 a 7 balões (aviso acima de 8) | Chameleon: 72% concluem 3 passos, 16% concluem 7 (§1.2). |
| Tour de tela interna | 2 ou mais balões | Um balão só não é tour; vira texto. |
| Tarefas por área | 15 | Acima disso há tarefas que são a mesma tela (junte) ou uma pergunta (mova). |
| Perguntas por área | 20 | Junte as parecidas: "de onde vêm as horas" e "de onde vem a formação" viraram uma. |
| Resposta | 900 caracteres | Divida em duas perguntas: "o que dá para fazer pelo WhatsApp" virou três. |

O que foi feito no dia: o tour de Configurações (15 balões) virou 7 na
visão geral e um tour por tela do submenu (`telas`: E-mail dos setores,
Integrações, Site); o do Início, 9 → 8; Voluntários, 20 tarefas → 15 e 23
perguntas → 20; as respostas de 1.540 e 906 caracteres, em três e duas; e as
introduções acima da medida, encurtadas ou com a primeira frase separada.

**Regras para o que vier** (além do §4):

- Toda ideia nova de retorno entra no formulário que existe, não num bloco
  novo no painel.
- Tarefa nova numa área com 15: antes, veja se alguma já cobre a mesma tela.
- O painel não ganha seção nova. Se algo precisa aparecer em toda tela,
  entra numa das sete peças acima, ou na Central.


## 12. Ouvir a ajuda (06/11/2026)

"Quero fazer todo o suporte por áudio também." Pedido do Matheus depois da página da coordenação do voluntariado
(no site), onde cada passo do tutorial tem "Ouvir". É a Fase 1 do projeto "Tutoriais do Palácio" (vídeos curtos,
suporte por áudio e trilhas); o escopo aprovado está no artifact "Tutoriais do Palácio". O §6 deixou vídeo e IA de
fora; o áudio entra porque não envelhece calado: ele nasce do texto, e texto novo grava áudio novo sozinho.

**Onde aparece.** O botão "Ouvir" (`components/ajuda/ouvir.tsx`) fica:

- em cada tarefa e cada pergunta, no painel "?" (recolhidas) e na Central (abertas) — `blocos.tsx`;
- no "para que serve" da área, no painel e na página da área na Central ("Ouvir sobre <área>");
- em cada balão do tour, ao lado do "2 de 7" (só o ícone, por causa da largura do balão).

**O que se ouve** (`lib/ajuda/ouvir.ts`, puro): tarefa = título, "Passo 1: …" e a dica (o exemplo fica de fora:
é uma história, e está na tela); pergunta = pergunta e resposta; balão = título e texto; área = "para que serve" e
"quem usa". Cada parte ganha ponto final, para a voz pausar.

**De onde vem o áudio.** O botão calcula o **código do texto** (SHA-256, 24 dígitos) e pede
`/api/ajuda/ouvir?c=<código>`. A rota (só para quem está logado no Palácio):

1. confere que o código é de um texto da ajuda (`lib/ajuda/ouvir-textos.ts` monta todos; `ouvir-servidor.ts` guarda
   o índice): ninguém usa a rota para gravar um texto qualquer;
2. procura `ajuda/ouvir/<nomeDoAudio>.mp3` no Blob privado (o nome muda com o texto, a voz e o modelo);
3. se não houver, grava com a ElevenLabs (`vozDaAjuda`: a voz de Configurações › Voz, modelo
   `eleven_flash_v2_5`, `MODELO_DA_AJUDA`), guarda e entrega. A pessoa vê "Preparando o áudio…" enquanto isso.

Pelo código e não pelo id, porque os ids se repetem entre áreas (24 em 06/11/2026); o mesmo texto em dois lugares
usa um áudio só. Não há interruptor próprio: o "Ouvir" usa a voz sempre que ela está escolhida e a chave está no
cofre. O gasto máximo é a ajuda inteira gravada uma vez: **1.816 textos, ~571 mil caracteres** em 06/11/2026; na
prática, só o que alguém ouvir. Texto editado grava de novo na próxima vez que alguém ouvir; o MP3 antigo fica no
Blob sem uso (dá para limpar a pasta `ajuda/ouvir/` de tempos em tempos sem perder nada: o que for pedido grava de novo).

**Sem a voz.** Sem voz configurada, com a ElevenLabs fora ou sem crédito, ou na Área do Voluntário (a rota pede a
sessão do Palácio), a rota não entrega e o botão lê o mesmo texto com a voz do aparelho (`speechSynthesis`,
pt-BR). Um áudio por vez: tocar outro "Ouvir" para o anterior; o balão seguinte do tour também.

**Conferência:** `npx tsx scripts/conferir-ajuda-ouvir.ts` (texto falado, código, índice, nenhum texto acima de
6.000 caracteres e o total).

**Próximos passos do projeto:** a Área do Voluntário ouvir com a voz da filial (a rota aceitar a sessão do
voluntário), a assistente de voz no painel "?" ("Perguntar falando"), os vídeos curtos por tarefa e o WhatsApp
respondendo dúvidas de uso com áudio e vídeo.

## 13. O espaço de Demonstração (07/11/2026)

Os vídeos dos tutoriais (o projeto do §12) são gravados num espaço à parte, `kind: 'demo'`, chamado "Demonstração":
pessoas e trabalho inventados, para nenhum vídeo mostrar dado de alguém. Ninguém da equipe é membro, e a Produção não
vê nada dele: o RLS separa por espaço, e uma pessoa fictícia só aparece para quem divide um espaço com ela.

**Quem está lá.**

- A conta de gravação: usuário `gravacao`, que aparece na tela como "Ana Ribeiro" ("Bom dia, Ana."), editora da
  Comunicação Social. É o papel da maior parte da equipe, então o vídeo mostra o que quase todo mundo vê. A senha não
  fica no repositório; fica com quem grava.
- Cinco colegas fictícios, usuários `demo.*`: Helena Duarte (a administradora do espaço), Rafael Monteiro, Beatriz
  Lacerda, Tiago Furtado e Camila Rezende. Não têm senha, e-mail nem WhatsApp, e a conta deles está bloqueada no
  Auth: ninguém entra com eles, e nenhum aviso do Palácio sai para fora.

**O que tem lá** (`scripts/demonstracao/semear.sql`): os 12 setores e os canais do chat, como na Produção; 3 projetos;
13 pautas pelas colunas do quadro (5 da Ana: uma atrasada, uma que vence hoje e as outras nos próximos dias); 7
conteúdos; 5 rodadas de aprovação, 2 delas esperando o voto da Ana (na do mutirão de saúde, o voto dela fecha a
rodada); a agenda da semana; avisos no sino; o que a equipe fez e os indicadores do Início.

**Recomeçar depois de gravar.** O mesmo script. Rodado de novo, apaga só o que está no espaço de Demonstração
(pautas, conteúdos, aprovações, agenda, etiquetas, projetos, avisos e histórico) e grava tudo outra vez, com as datas
contadas a partir do dia. Pessoas, setores e chat ficam. É SQL de escrita no banco, que é a produção: só quando o
responsável pedir, inteiro, no editor SQL do Supabase. O script para sem mudar nada se o espaço "demonstracao" não for
`kind: 'demo'`, se faltar a conta de gravação ou se ela estiver em outro espaço.

**O que não se grava na Demonstração**, e por isso não está no script: publicação agendada (o pg_cron publica de
verdade), ofício, certificado, transparência, campanha de imprensa e endereço da matéria no site. A trilha pública
(`auditoria`) registra esses atos para sempre e ainda não sabe pular o espaço de Demonstração; o vídeo dessas áreas
espera essa mudança, que é uma migração. Financeiro e Patrimônio também não estão semeados
(`private.semear_financeiro` e `semear_patrimonio` usam os dados reais da filial): o vídeo dessas áreas semeia antes,
com dados fictícios.

**Na tela da gravação.** A faixa "Você ainda não tem um e-mail de recuperação" não aparece na Demonstração
(`app/(app)/layout.tsx`): a conta de gravação fica sem e-mail de propósito, para nenhum aviso do Palácio sair para
fora. A dica "Primeira vez em …? Fazer o tour" aparece em cada tela até a Ana fazer ou dispensar o tour; quem grava
dispensa antes ("Agora não"), a menos que o vídeo seja sobre o tour. As datas contam a partir do dia em que o script
rodou: rode-o no dia da gravação. Abrir uma aprovação marca como lido o aviso dela no sino; o script devolve.

**Código novo:** sem sessão, "o espaço da filial" é o de Produção, escolhido pelo tipo (ARQUITETURA §5).

## 14. Vídeos da ajuda (07/11/2026)

A Fase 1 do projeto "Tutoriais do Palácio": um vídeo curto por tarefa (de 30 a 90 segundos), gravado por script no
espaço de Demonstração (§13), com a voz da filial ("Sarah", modelo de narração `eleven_v4`) e legenda. O vídeo mostra a
tarefa da ajuda escrita acontecendo na tela de verdade; o texto continua sendo a referência.

**Onde aparece.** O botão "Ver o vídeo · 1 min" fica ao lado do "Ouvir" em cada tarefa que tem vídeo, no painel "?" e
na Central (`components/ajuda/video.tsx`). Abre ali mesmo, num `<dialog>`, com a legenda ligada. Um som por vez: o vídeo
começar para o "Ouvir" que estava tocando, e um "Ouvir" novo pausa o vídeo.

**Onde ficam os arquivos.**

- O catálogo, `lib/ajuda/videos.json`, é escrito pelo gravador. A tarefa aponta para o vídeo pelo campo `video` (`lib/ajuda/tipos.ts`).
- A legenda fica em `public/tutoriais/<id>.vtt`, na mesma origem do Palácio: o navegador não carrega legenda de outra origem sem CORS.
- O MP4 e a capa ficam no site da filial, em `https://cruzvermelhariodejaneiro.org/assets/tutoriais/palacio/`. A pasta é pública, mas fica fora dos buscadores e sem listagem (o `.htaccess` dela), e os nomes levam a versão. Fica no site porque os buckets do R2 são privados e a chave deles mora na Vercel; a mídia pública da filial já sai pelo site (o acervo publica lá). Mudar de lugar é trocar `ENDERECO_DOS_VIDEOS`.

**Gravar ou regravar.**

```
NODE_USE_ENV_PROXY=1 npx tsx scripts/videos/gravar.ts <id> [--celular] [--ensaio] [--credenciais=arquivo.env]
```

1. A voz de cada fala vem primeiro e fica guardada em `.videos/voz`: o mesmo texto não gasta crédito de novo.
2. O robô entra como a conta de gravação. Se ela não estiver no espaço de Demonstração, o gravador para sem gravar nada.
3. O robô faz a tarefa com um cursor desenhado, o clique visível e um contorno vermelho no que a voz explica, esperando cada fala terminar. Ele dispensa a dica "Primeira vez em…?" só no navegador dele, sem mudar nada da conta.
4. O ffmpeg monta o MP4 (1920×1080, H.264), a capa (o cartão de abertura) e a legenda, cortada pelo tempo de cada letra que a ElevenLabs devolve.

Sem `--ensaio`, o gravador escreve o catálogo e a legenda. Depois, falta subir o MP4 e a capa de `.videos/saida` ao site: no repositório do site, use `scripts/publicar_hostinger.sh` com `RAIZ` numa pasta que tenha `assets/tutoriais/palacio/`. Com `--ensaio`, os passos marcados `final` (votar, criar) não acontecem, e sai só `.videos/saida/<id>.ensaio.mp4`, para conferir o ritmo.

O gravador precisa de:

- o Playwright com o Chromium, fora do projeto, para não pesar no build da Vercel (o gravador o acha pelo `NODE_PATH`);
- `ffmpeg` e `ffprobe` no `PATH`;
- `ELEVENLABS_API_KEY`. No ambiente de nuvem do Claude Code, o proxy põe a chave sozinho, e o `NODE_USE_ENV_PROXY=1` faz o Node passar por ele;
- `GRAVACAO_USUARIO` e `GRAVACAO_SENHA`, a conta de gravação.

Vídeo que muda dado consome o espaço. O de aprovar vota na rodada do mutirão, e o de criar pauta cria a pauta da praia. Antes de regravar, rode `scripts/demonstracao/semear.sql` (§13).

**O roteiro** (`scripts/videos/roteiros.ts`) é a tarefa contada em voz, com os mesmos passos e os mesmos nomes de botão, e as ações do robô em cada passo. Os alvos usam os `data-ajuda` do tour sempre que existem.

**Quando o vídeo envelhece.** O catálogo guarda a impressão do passo a passo no dia da gravação: o código do texto, o mesmo do "Ouvir". Quando o texto da tarefa muda, o `npx tsx scripts/conferir-ajuda.ts` avisa qual vídeo regravar. Ele também acusa vídeo sem tarefa, tarefa apontando para vídeo que não existe e legenda faltando. O `npx tsx scripts/conferir-videos.ts` confere as partes puras: o corte da legenda, a legenda WebVTT, o tempo no botão e os endereços.

**A versão de celular (07/11/2026).** Cada vídeo tem também a versão em pé (1080×1920), gravada com `--celular` pelo
mesmo roteiro, numa tela de 390×693. No lugar da seta do mouse, aparece o círculo do dedo, só no toque. O menu abre pela
gaveta (`r.menu`), e a fala que cita o caminho usa a `falaNoCelular` do passo ("abra o menu e toque em…"). No catálogo,
ela fica no campo `celular` do mesmo vídeo, com a legenda `<id>.celular.vtt` e os arquivos `<id>-celular-<versão>.mp4` e
`.jpg`. A de computador precisa existir antes, e regravar uma versão não apaga a outra. No Palácio, quem abre "Ver o
vídeo" numa tela de até 767 px (a mesma linha em que o menu vira gaveta) vê a versão de celular, quando ela existe; o
player ajusta a altura à tela. Recomece o espaço (§13) antes de gravar as versões que mudam dado, como na de computador.

**O piloto:**

| Vídeo | Computador (06/11/2026) | Celular (07/11/2026) |
| --- | --- | --- |
| "Ver o que precisa de você hoje" (Início) | 70 s | 71 s |
| "Criar uma pauta completa" (Pautas) | 64 s | 64 s |
| "Aprovar um conteúdo" (Aprovações) | 63 s | 63 s |

Próximos passos: a seção "Vídeos" na Central, a primeira trilha e a medição simples (vídeo aberto e assistido até o fim).
Os dois primeiros saíram em 08/11/2026, em "Comece por aqui" e no guia para começar (§16); falta a medição.

## 15. O glossário (07/11/2026)

Quem chega ao Palácio Virtual encontra palavras que a tela usa como se todo mundo soubesse: "pauta", "rodada de
aprovação", "competência", "plaqueta", "fonte com destino". A ajuda explicava cada uma onde ela aparecia, numa
pergunta perdida entre outras vinte. O glossário junta essas palavras num lugar só, cada uma em uma a três frases.

**O conteúdo** mora em `lib/ajuda/glossario.ts`. Cada termo tem:

- `id`: a âncora (`/ajuda/glossario#pauta`). Não troque o de um termo que já existe: é link guardado;
- `termo`: como a palavra aparece na tela. Um complemento entre parênteses separa os sentidos ("Fio (no Chat)",
  "Fila (de chamados)");
- `definicao`: o que é e para que serve, até 420 caracteres, no tom do §4. Sem aula: o detalhe fica nas perguntas da
  área;
- `areas`: os `href` das áreas em que a palavra aparece. É o que põe o termo na aba "Palavras" do painel "?" da área e
  decide quem o vê. A primeira é a casa do termo: na aba "Palavras" dela, ele vem antes dos que só passam por lá
  (Patrimônio abre em "Plaqueta", e não em "Fechamento do mês");
- `termos`: outros jeitos de dizer, para a busca ("tag", "2FA", "PC"). Ponha também o nome curto de um termo
  comprido ("rodada", "estorno"): é o que faz a busca pelo nome achá-lo;
- `veja`: os ids de termos que ajudam a entender este.

A aba mostra seis termos e esconde o resto, como as outras: a ordem do arquivo é a ordem da aba (depois da casa),
então o que mais importa para entender a área vem antes ("Pauta" antes de "Checklist"). A página e a busca usam a
ordem alfabética.

Cada definição tem apoio no código ou na ajuda da própria área, como o resto (§4). Na dúvida, a palavra fica de fora.
O primeiro texto teve 56 termos, conferidos um a um contra o código e as respostas das áreas; quatro definições
mudaram na conferência (o mês fechado que a gestão reabre, a venda que cai no primeiro dia aberto, "Em disputa" e
"Contestado", que são situações diferentes, e o rótulo "Livre" da fonte).

**Onde aparece:**

- na Central: a página `/ajuda/glossario`, em ordem alfabética, com o índice das letras, o "Ouvir" de cada termo, as
  áreas em que ele aparece (só as que a pessoa abre, com link para a ajuda delas) e o "Veja também". O cartão
  "Glossário", em "Mais ajuda" (antes, "Comece por aqui"), leva a ela;
- no painel "?": a aba "Palavras", ao lado de "Como fazer" e "Dúvidas", com os termos da área aberta (seis à vista,
  como as outras abas), e o link "Glossário" no pé;
- na busca (painel, Central e ⌘K): os termos entram por último, com uma exceção. Quando a busca é o nome do termo
  ("pauta", "o que é competência", "o que são etiquetas", "2FA"), ele vem antes de tudo: as palavras de pergunta
  ("o que é", "quer dizer", "significa") e o "s" do plural não contam (`buscaEhOTermo`, em `lib/ajuda/index.ts`). O
  resultado aparece como "O que quer dizer · Glossário";
- no "Ouvir": o termo e a definição (`textoDoTermo`) entram no conjunto fechado de textos que a rota do áudio aceita.

**Quem vê o quê.** Aparecem só os termos de alguma área que a pessoa abre, e os que não são de área nenhuma, como
"Tour" (`glossarioVisivel()`). É a mesma regra da Central: a equipe da escola vê os 19 termos das áreas dela
(Únicopag, UTM, competência…) e não vê "rodada de aprovação".

**A conferência** (`scripts/conferir-ajuda.ts`) acusa `id` repetido ou fora do padrão, área que não existe no menu,
`veja` para um termo que não existe (ou para ele mesmo) e definição sem ponto final; avisa da definição acima de 420
caracteres. Ela também busca cada termo pelo nome e por "o que é" + o nome, e acusa o que não vem em primeiro lugar.

**A auditoria do mesmo dia.** Toda a aplicação foi conferida tela a tela (135 telas). As 46 áreas do menu têm guia (a
própria Ajuda não precisa de um); 45 têm tour na tela principal, e o Chat tem o dele na conversa (`/chat/[id]`),
porque `/chat` só redireciona. 72 telas internas têm tour próprio. Das 15 telas internas sem tour, 6 só redirecionam
(`/mensagens`, `/participantes`, `/escola/contas`…), e as outras 9 — os formulários de edição de Financeiro e
Patrimônio, a Zona de risco das Configurações e as telas de detalhe de Doações — mostram no painel "?" a ajuda da área,
que já explica o que se faz nelas. Cursos, a única área sem perguntas, ganhou quatro.

## 16. O guia para começar e os vídeos de começo (08/11/2026)

A ajuda tinha muito texto e três vídeos, mas nenhuma porta de entrada: os vídeos ficavam dentro de três passos a passos,
e quem ainda não tinha acesso não via nada, porque a Central exige login. Boa parte da equipe da filial tem mais de 60
anos e usa pouco o computador. O guia para começar é essa porta.

**Onde fica.** `/comecar`, uma página aberta, sem login (`app/comecar/page.tsx`, fora do grupo `(app)`: sem menu nem
topo). Chegam até ela:

- a tela de entrada, pelo cartão "Primeira vez aqui?";
- a Central de ajuda, em "Comece por aqui", que agora vem logo depois da busca, com o guia e os três vídeos em ordem
  (a parte de baixo, com boas-vindas, glossário, atalhos e como pedir ajuda, passou a se chamar "Mais ajuda");
- a janela de boas-vindas, pelo "Prefere ir com calma?" (sair por ali conta como boas-vindas vistas);
- os "Primeiros passos" do painel "?", pelo item "Ver o guia para começar". Ele fica marcado quando a pessoa abre o
  guia (`progresso.guia`, no `user_metadata`, como as boas-vindas; sem migração). O guia fica fora do provedor da
  ajuda, então também deixa uma marca no aparelho (`GUIA_VISTO_NO_APARELHO`, no localStorage), que o provedor lê ao
  montar: vale para quem abriu o guia antes de entrar e para quem volta ao Palácio com o layout tirado do cache do
  navegador (o `staleTimes`), com o progresso de antes. "Recomeçar" tira a marca. Quem já tinha feito os três passos
  antigos vê a caixa de novo, com o quarto item, até abrir o guia.

**Como é.** Uma coisa de cada vez, frases curtas, letra de 18 a 20 px, botões de 56 px, "Ouvir" em cada parte e
"Imprimir este guia" (a versão impressa mostra as duas respostas de cada pergunta e troca o botão do WhatsApp por um
QR). Sem login, o "Ouvir" usa a voz do aparelho: a rota do áudio da filial só atende quem está logado. As partes:

1. o que é o Palácio Virtual (a da Escola, para a equipe da escola);
2. "Você já tem o e-mail da Cruz Vermelha?" — se não, "Pedir pelo WhatsApp" abre a conversa com o WhatsApp do
   Palácio com a frase do autocadastro pronta ("quero me cadastrar", `lib/whatsapp/autocadastro-regras.ts`). O robô
   pergunta uma coisa por vez, a coordenação do setor aprova com um toque, e o e-mail e a senha provisória chegam no
   próprio WhatsApp. O botão passa por `/comecar/whatsapp`, que lê o número do robô na hora (e guarda por 10 minutos):
   é esse endereço fixo que vai no QR. Sem o WhatsApp ligado, o guia volta com um aviso;
3. "Você já entra no Palácio?" — se não, o convite da administração, com o link para criar a senha (72 horas);
4. como entrar, com o endereço e o "Esqueci minha senha";
5. a tela, parte por parte, com o mesmo ícone da tela de verdade ao lado de cada parte;
6. o que dá para fazer, dito do jeito de quem precisa ("Quero ver o que precisa de mim hoje"), com "Abrir" e, quando
   há, o passo a passo da área, separado por setor (abaixo). Com login, só o que a pessoa abre;
7. os vídeos de começo, que abrem ali mesmo (desde o guia por setor, três para a Comunicação e dois para os outros);
8. se você travar.

**Por setor (08/11/2026, no mesmo dia).** A primeira versão mostrava o Palácio inteiro a todo mundo: "pauta", por
exemplo, só interessa à Comunicação Social. Agora o guia pergunta "Qual é o seu setor?" (os 12 setores oficiais,
`lib/equipe.ts`), e o setor vai no endereço: `/comecar?setor=juridico` é o link que a coordenação manda ao setor. Com
login e sem setor no endereço, vale a coordenação da pessoa (`workspace_members.coordination`). O setor muda:

- "O que dá para fazer", em dois grupos: "Do seu setor" e "O que todo mundo usa" (Início, Chat, avisos, contar uma
  ação para a Comunicação, chamados, agenda, compras, ofícios, Diretório e perfil);
- as aprovações, que entram em "Do seu setor" com o prazo e um item da conferência dele (`perfilDoSetor`, o mesmo da
  tela de Aprovações: "Nos pedidos do seu setor, o prazo é de 4 horas", na GRD);
- os vídeos: "Criar uma pauta completa" é só da Comunicação Social (`VIDEOS_PARA_COMECAR`); sem setor, ficam os de
  todos. A Central de ajuda segue a coordenação de quem está logado;
- a frase do WhatsApp: "quero me cadastrar em Jurídico", que o robô já entende (`setorDaEntrada`).

Só entra em "Do seu setor" o que o código liga ao setor (`COISAS_DO_SETOR`):

| Setor | Do seu setor, além das aprovações |
| --- | --- |
| Comunicação Social | quadro de Pautas, Publicações, Biblioteca de mídia, Envios da equipe |
| Tecnologia da Informação | atender os chamados da TI, dar acesso ao Palácio |
| Jurídico | atender os chamados do Jurídico (o modelo de fila dele) |
| Diretoria | aprovar as compras acima do limite dela, assinar ofícios |
| Educação e Saúde | a Escola e os cursos |
| Voluntariado | voluntários, mensagens dos voluntários, livro de ponto |
| Juventude | os voluntários do vínculo "Juventude" |
| Humanitário, Primeiros Socorros, GRD, Psicologia / Serviço Social, Esportes | só as aprovações do setor |

Para pôr algo novo num setor, acrescente em `COISAS_DO_SETOR`, com a área e uma frase com apoio no código; um item
de todos que não faz sentido para um setor leva `foraDe` (a Comunicação não "conta uma ação para a Comunicação").

**Duas travas ficaram de propósito.** O pedido foi um começo "sem senha e o máximo sem segurança", por ser uma equipe
da terceira idade. O guia não pede senha nem formulário, mas mantém a aprovação da coordenação para o e-mail e o
convite da administração para o Palácio. Sem elas, qualquer pessoa com o link teria um e-mail
@cruzvermelhariodejaneiro.org, que fala em nome da Cruz Vermelha, ou entraria num sistema com CPF, saúde e documentos
(LGPD). Cada trava é um toque de outra pessoa. Se for preciso tirar mais atrito, o próximo passo seria entrar pelo
WhatsApp, sem senha, num trabalho à parte, com revisão de segurança.

**O conteúdo** mora em `lib/ajuda/comecar.ts`, com o mesmo cuidado do resto (§4): cada frase tem apoio no código. O que
a equipe da escola não tem (o Início, o "Criar", os chamados) leva `soDaRedacao` e some para ela. Os vídeos de começo
são `VIDEOS_PARA_COMECAR`, na ordem; o cartão de cada um é `components/ajuda/cartao-do-video.tsx`, que usa o
`gatilho` do `VerOVideo`.

**Na mesma conferência**, a pergunta do robô sobre o e-mail pessoal dizia que a senha provisória chegava nele; desde
23/10/2026 ela vai pelo WhatsApp, e o e-mail é a reserva. A pergunta agora diz isso.

**A conferência** (`scripts/conferir-ajuda.ts`) acusa vídeo de começo que não está no catálogo, "Quero…" de área que não
existe no menu (ou repetido na mesma lista), passo a passo citado que não existe e setor que não é um dos oficiais.

## 17. "Achei um erro": o aviso que chega ao Claude (09/11/2026)

"Crie também uma área onde, se alguém achar um erro, sobe diretamente para você e se corrige." O aviso usa o caminho
do beta (§10): é um retorno do tipo `problema`, sem tabela nova nem migração.

**Onde a pessoa avisa:**

- **"Achei um erro", no fim do painel "?"**, acima de "Conte para a equipe", em qualquer aparelho
  (`components/app/ajuda/achei-um-erro.tsx`). Um campo só, "O que aconteceu?", e "Enviar". "Conte para a equipe"
  ficou com dúvida, ideia e elogio, para o painel não ter dois lugares para o mesmo erro;
- **na tela de erro** ("Algo deu errado ao carregar esta página", `app/(app)/error.tsx`): "Avisar sobre este erro",
  com um toque. Escrever o que estava fazendo é opcional;
- **no "Beta" do topo**, onde a opção "Algo deu errado" passou a se chamar "Achei um erro". Vai para o mesmo lugar.

**O que vai junto** (`lerContexto`, em `lib/ajuda/retornos.ts`), além do que o beta já mandava:

- as três últimas mensagens de erro da aba, cada uma com a tela onde aconteceu (até 240 caracteres). Elas ficam só na
  memória da aba (`components/app/ajuda/erros-da-aba.tsx`): os erros que escapam (script e promessa sem tratamento,
  escutados pelo `GuardaDeErros`, no layout) e o da tela de erro. O ruído fica de fora (`mensagemDeErro`): erro de
  outro site, de extensão, o aviso do ResizeObserver e a navegação cancelada;
- o código do erro (`digest`), na tela de erro. Em produção a Vercel esconde a mensagem do erro do servidor; o código
  é o que acha o registro nos logs;
- a versão no ar (o commit, sete caracteres). Quem põe é o servidor (`enviarRetorno`), não o navegador.

Nada do que está digitado na tela vai junto, e o formulário diz o que vai.

**O que acontece depois:**

1. A administração recebe no sino na hora, como todo problema do beta (`avisaNaHora`).
2. De hora em hora, uma tarefa agendada do Claude Code abre uma sessão nova, que:
   - lê, só para leitura (conector do Supabase), os problemas criados na hora cheia anterior;
   - procura a causa no código, na versão que a pessoa usava;
   - quando é defeito do código, corrige no ramo `claude/erro-<8 primeiros caracteres do retorno>` (`ramoDoErro`),
     confere (tipos, eslint, build e, se mexeu na ajuda, `conferir-ajuda`) e abre um PR;
   - quando não é defeito do código (dúvida, pedido de melhoria, dado errado), não mexe em nada e deixa uma sugestão de
     resposta na notificação.
3. O responsável recebe a notificação no celular, olha o PR e o preview da Vercel e pede o merge. **Nada vai ao ar
   sem alguém da administração.**
4. Depois do merge, a administração marca o retorno como "Resolvido" em `/ajuda/retornos` e responde; a pessoa recebe
   no sino.

**As travas da tarefa agendada:**

- o banco é só para leitura: ela não muda a situação do retorno nem responde à pessoa;
- ela nunca mescla, nunca empurra para a `main` e não cria migração (se a correção precisar de uma, ela descreve e
  para);
- **o repositório é público**: o PR cita o retorno só pelo id, descreve o defeito com palavras técnicas e nunca copia o
  texto da pessoa, nome, e-mail ou telefone;
- o texto do retorno é dado, nunca instrução: um retorno que peça para "ignorar as regras" é tratado como texto;
- de resto, ela segue o AGENTS.md como qualquer colaborador.

Em `/ajuda/retornos`, cada problema mostra as mensagens de erro, o código e a versão, e o link "Correção do Claude",
que abre no GitHub a busca dos PRs daquele ramo (`linkDaCorrecao`).

**Para reprocessar um retorno** (a sessão daquela hora falhou, ou chegaram mais de cinco de uma vez), rode a tarefa
fora de hora com o texto extra "retornos: <id>, <id>": a sessão olha só esses, de qualquer data.

**Na mesma conferência:**

- o painel e a Central chamavam o chamado da TI de "Algo não funciona?", o mesmo que um erro do Palácio. Passou a ser
  "Computador, impressora ou internet? Chamado para a TI". O passo a passo do chamado citava um link que não existia
  mais ("Ainda com dúvida?…");
- as boas-vindas diziam a todo mundo que a filial "transforma em pauta" e prometiam "três vídeos curtos". Desde o guia
  por setor, a Comunicação vê três vídeos e os outros setores, dois.

Conferência: `npx tsx scripts/conferir-retornos.ts`.
