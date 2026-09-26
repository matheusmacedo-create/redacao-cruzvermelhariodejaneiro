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
3. **Painel “?”** com o passo a passo e as perguntas frequentes da área aberta.
4. **Central de ajuda** em `/ajuda`, com busca e link direto para cada resposta.
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
tours” de “Comece por aqui”. Ao lado dele, e só ali, “Recomeçar as
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
ajuda **da área aberta**: para que serve, quem usa, “Fazer o tour desta
tela”, o “Passo a passo” (as tarefas em passos numerados) e as “Perguntas
frequentes” — recolhidos, em `<details>` — e o link “Ver tudo sobre <área> na
Central de ajuda”. No alto, a busca em toda a ajuda. Enquanto a pessoa não
cumpre os três, os “Primeiros passos” aparecem em cima: ver as boas-vindas,
confirmar o e-mail de recuperação e pôr uma foto no perfil. Numa tela sem
guia, o painel mostra a ajuda geral (conta e acesso, como se achar, ajuda e
suporte). No pé: “Central de ajuda”, “Rever as boas-vindas” e “Ainda com
dúvida? Abra um chamado para a TI” — para a equipe da escola, que não abre
chamados, “Ainda com dúvida? Pergunte no Chat”.

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

A Central é a área "Ajuda" do grupo Administração (`lib/navegacao.ts`). No
computador, ela fica no menu da conta (a foto, no alto), junto de “Meu
perfil” e “Configurações” — do grupo, o pé da sidebar mostra só
“Configurações”; no celular, na gaveta do menu, no grupo Administração. Também se chega pelo
link “Central de ajuda” do pé do painel “?” e pela busca ⌘K. A equipe da
escola também vê.

Em `/ajuda`: a busca; “Comece por aqui”, com três cartões (boas-vindas e
tours, atalhos de teclado com a caixa da tecla `?`, e como pedir ajuda); a
“Ajuda por área”, com as áreas que a pessoa pode abrir e que têm guia,
agrupadas como no menu (`guiasVisiveis()`); e a “Ajuda geral”
(`topicosGerais()`: conta e acesso, como se achar, ajuda e suporte). Cada
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

O texto (`lib/ajuda`, com as 38 áreas: cerca de 140 KB comprimidos) é
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
     a página inteira).
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
- **Vídeo e imagem na ajuda.** Só texto por enquanto: imagem e vídeo ficam
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
  da visita baixa as 38 áreas de uma vez (cerca de 140 KB comprimidos). Se o
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
  `[...area]/page.tsx`, `[...area]/not-found.tsx` e `grupos-da-pessoa.ts`, o
  corte do menu).
- `app/actions/ajuda.ts` — `registrarAjuda()`, que grava o progresso.
- `lib/navegacao.ts` — a área "Ajuda" (`/ajuda`), no grupo Administração.
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
