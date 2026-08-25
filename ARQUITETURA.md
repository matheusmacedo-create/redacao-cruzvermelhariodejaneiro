# Redação — como este projeto funciona

Documento de entrada para quem vai mexer aqui: pessoa ou agente. Descreve o que
o sistema é, como as peças se encaixam, quais convenções valem e quais erros já
foram pagos caro. Leia inteiro antes da primeira alteração.

---

## 1. O que é

**Redação** é o sistema editorial interno da **Cruz Vermelha Brasileira — Rio de
Janeiro**, no ar em `redacao.cruzvermelhariodejaneiro.org`.

Ele resolve um problema concreto: as coordenações da instituição (Humanitário,
GRD, Saúde, Voluntariado, Primeiros Socorros, Diretoria) fazem coisas o tempo
todo, e a Comunicação precisa transformar isso em conteúdo publicado — com
aprovação, porque o que sai leva o nome da instituição.

O caminho que o sistema modela é sempre o mesmo:

```
alguém registra o que aconteceu
        ↓
vira PAUTA (a ficha do assunto)
        ↓
vira CONTEÚDO (o texto/post que será publicado)
        ↓
passa por APROVAÇÃO (votação de quem participa da pauta)
        ↓
é PUBLICADO (redes sociais via Upload-Post, ou site via FTP)
```

Tudo em português na interface. Os status são gravados em inglês no banco e
traduzidos na borda — ver §9.

---

## 2. Como rodar

```bash
cp .env.example .env.local    # depois preencha os valores
pnpm install                  # pnpm, NÃO npm
pnpm dev
```

**O gerenciador é pnpm.** `npm install` aqui gera um lockfile concorrente e
quebra o build da Vercel.

O build passa sem nenhuma variável de ambiente. A falta só aparece em runtime,
na primeira query. Isso é de propósito (§10.4), mas significa que "compilou" não
prova nada sobre configuração.

### Variáveis

Nunca peça, receba ou escreva o **valor** de uma credencial no chat, em código,
em commit ou em rota de diagnóstico. Os valores vivem em Vercel → Project
Settings → Environment Variables. Aqui só existem nomes.

| Variável | Onde | Observação |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | pública, vai no bundle |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | pública, vai no bundle |
| `SUPABASE_URL` | server | usada por `lib/supabase/admin.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | server | **segredo** — ignora RLS |
| `BLOB_READ_WRITE_TOKEN` | server | Vercel Blob — injetada pela própria Vercel, não está no `.env.example` |
| `UPLOAD_POST_API_KEY` | server | **segredo** — publicação nas redes |
| `UPLOAD_POST_PROFILE` | server | perfil no Upload-Post (`@cruzvermelhabrasileirj`) |
| `UPLOAD_POST_FACEBOOK_PAGE_ID` | server | **obrigatória** — ver §8.1 |
| `FTP_HOST` `FTP_USER` `FTP_PASSWORD` `FTP_BASE_DIR` | server | publicação no site |
| `SITE_PUBLIC_BASE_URL` | server | opcional; sem ela o `ftp-check` não confere se a pasta é publicada |

**`NEXT_PUBLIC_` significa "vai para o navegador de todo visitante".** Um segredo
com esse prefixo está publicado, não configurado. `lib/supabase/env.ts` recusa
ativamente uma chave `sb_secret_` ou um JWT `service_role` na variável pública,
e recusa uma chave `anon` na variável de service role — porque a chave errada no
lugar errado não dá erro, dá banco aparentemente vazio.

---

## 3. Stack

- **Next.js 16** (App Router, Turbopack), **React 19**
- **Supabase** — Postgres + Auth, acesso via `@supabase/ssr`
- **Vercel** — hospedagem, Blob para arquivos, deploy automático em `main`
- **Tailwind + Base UI** (`components/ui/*`, padrão shadcn) + **lucide-react**
- **Upload-Post** — publicação nas redes sociais
- **basic-ftp** — publicação no site institucional

### Duas decisões que explicam muita coisa

**Server Actions em vez de API REST.** Quase toda escrita é uma server action em
`app/actions/*.ts`, chamada direto de um `<form action={...}>`. Só existe rota
`/api/*` quando o navegador precisa falar HTTP de verdade: upload direto para o
Blob, download autenticado, diagnósticos.

**Middleware chamado `proxy.ts`, não `middleware.ts`.** É a convenção do Next 16
neste projeto. Ele renova a sessão do Supabase a cada requisição e **nunca
lança**: sem credenciais ou com o Supabase fora do ar, ele registra no log e
deixa passar, porque um middleware que explode derruba até a página que
explicaria o problema.

---

## 4. Mapa do repositório

```
app/
  (app)/              rotas autenticadas — o grupo tem o layout com sidebar
    dashboard/  caixa-de-entrada/  registrar/  pautas/  projetos/
    conteudos/[id]/   aprovacoes/  calendario/  biblioteca/  redes/
    mensagens/  pessoas/  perfil/  configuracoes/
  actions/            server actions — TODA escrita passa por aqui
    editorial.ts      pautas, conteúdos, aprovações, calendário, projetos, perfil
    redes.ts          publicação em redes sociais
    admin.ts          reset de dados do espaço
  api/                só o que precisa ser HTTP de verdade
    bootstrap/        primeiro administrador, quando o banco está vazio
    files/            upload-token, register, download, delete
    private-blob/     proxy autenticado para arquivos privados
    redes/            redes conectadas, imagens da biblioteca
    admin/            diagnósticos (ftp-check, redes-check, ftp-descobrir)
components/
  app/                componentes de tela (sidebar, publicador-redes, emoji-picker)
  ui/                 primitivos Base UI
  auth/  admin/
lib/
  supabase/           client.ts (browser) · server.ts (SSR) · admin.ts (service role) · env.ts
  publicacao/         upload-post.ts · requisitos.ts · ftp.ts
  editorial/          publicacoes-previstas.ts
  session.ts          requireSession · requireWorkspace · requireAdmin
  storage.ts          limites, tipos MIME, caminho da Biblioteca
  status-maps.ts      tradução banco → interface
  data.ts             constantes (coordenações, canais) + mock antigo da Fase 1
supabase/migrations/  o schema, em ordem cronológica
proxy.ts              middleware de sessão
```

**`lib/data.ts` é meio verdade e meio fóssil.** As constantes do topo
(`coordenacoes`, `canaisDePublicacao`) e os tipos são usados de verdade. Os
arrays grandes (`pautas`, `people`, `contents`, `approvals`…) são mock da Fase 1
e **não refletem o banco**. Não os use como fonte.

---

## 5. Sessão, espaço e papéis

`lib/session.ts` é o portão. Três funções, em ordem de rigor:

- `requireSession()` — exige alguém logado, senão redireciona para `/`
- `requireWorkspace()` — resolve o espaço de trabalho e o papel da pessoa nele
- `requireAdmin()` — exige papel `admin`

**Toda server action e toda página autenticada começa com uma delas.** Sem isso,
não há isolamento entre espaços.

O sistema já teve seleção de espaço com cookie. Hoje é **espaço único**:
`requireWorkspace()` prefere o de `kind: 'production'` e cai no primeiro vínculo.
A estrutura multi-espaço continua no banco porque desmontá-la custaria mais do
que mantê-la.

Papéis: `admin`, `editor`, `colaborador` (em `workspace_members.role`).

### Primeiro acesso

Com o banco vazio, `/api/bootstrap` detecta que não há nenhum perfil e a home
abre a tela de instalação, que cria o primeiro administrador. Os usuários são
internos: o e-mail é sintético (`usuario@usuarios.cvrj.local`), a pessoa entra
com nome de usuário e senha.

---

## 6. Banco de dados

19 tabelas, **RLS ligado em todas**. O schema vive em `supabase/migrations/`.

```
workspaces ─┬─ workspace_members ── profiles
            ├─ projects ── pautas ─┬─ pauta_participants
            │                      ├─ pauta_links
            │                      ├─ calendar_events
            │                      ├─ messages
            │                      └─ content_pieces ─┬─ content_versions
            │                                         ├─ content_comments
            │                                         └─ approvals ── approval_voters
            ├─ files              (Biblioteca)
            ├─ social_publications (envios às redes)
            ├─ inbox_items  notifications  activity_log
```

### RLS

As policies não consultam `workspace_members` direto — chamam funções auxiliares
no schema `private`:

| Função | Responde |
| --- | --- |
| `private.is_workspace_member(uuid)` | sou membro deste espaço? |
| `private.workspace_role(uuid)` | qual meu papel aqui? |
| `private.shares_workspace(uuid)` | divido algum espaço com esta pessoa? |
| `private.pauta_workspace(uuid)` | de que espaço é esta pauta? |
| `private.content_workspace(uuid)` | de que espaço é este conteúdo? |

São `security definer` com `set search_path = ''`, o que evita recursão infinita
de policy consultando tabela que também tem policy.

### RPCs

Três funções públicas que as actions chamam por `supabase.rpc()`:

- `submit_content_for_approval(content_id)` → põe o conteúdo em `review`,
  reaproveita aprovação pendente se já houver uma, devolve o `approval_id`
- `submit_pauta_for_approval(pauta_id)`
- `vote_on_approval(...)`

**São `security invoker`, de propósito**: o RLS continua valendo dentro da
função, então ninguém aprova conteúdo de espaço do qual não participa. Se fossem
`security definer`, a função viraria um buraco na cerca.

### Cliente normal vs. cliente admin

`lib/supabase/server.ts` respeita RLS — é o padrão, use sempre.
`lib/supabase/admin.ts` usa a service role e **ignora RLS**. Só entra onde o RLS
impede uma escrita legítima (inserir votante em nome de outra pessoa, apagar em
cascata). Cada uso é uma decisão consciente, não conveniência.

---

## 7. Os fluxos

### 7.1 Registrar → pauta

`/registrar` (`registrar-form.tsx` + `createPauta`). Uma pessoa de qualquer
coordenação descreve o que aconteceu ou o que precisa. O formulário muda de
campos conforme o **tipo do registro**: Ação, Evento, História, Ideia, Material,
Sugestão, Outro.

Os campos variáveis não viram colunas — vão para `pautas.details` (jsonb). A
lista de chaves aceitas está no próprio `createPauta`.

### 7.2 Registrar → calendário editorial → aprovação

Adicionado depois, e é o atalho que a Comunicação pedia. No mesmo formulário
existe o bloco **Publicações no calendário editorial**: linhas de data, horário,
canal e assunto.

Cada linha vira **duas coisas ligadas**:

1. um `calendar_events` com `type = 'publicacao'` e `channel` preenchido;
2. um `content_pieces` em `draft`, na pauta, **com o contexto inteiro do registro
   no corpo** — descrição e cada detalhe, com rótulo em vez de nome de campo.

O evento aponta para a peça por `calendar_events.content_id`. No calendário, o
dia leva direto ao conteúdo: o Marketing abre a data, lê o contexto e aprova, sem
passar pela pauta procurando qual das peças era aquela.

A peça nasce em `draft`, **não em `review`** — o post ainda não existe, alguém
precisa escrevê-lo. Ela aparece na aba Conteúdos da pauta e pode ser escolhida
na aba Aprovações, que é o fluxo que já existia.

A leitura do formulário está em `lib/editorial/publicacoes-previstas.ts`, fora do
arquivo de server actions, **porque é lógica pura e dá para conferir sem banco**.
Esse é o padrão a seguir quando houver validação não trivial.

### 7.3 Conteúdo e aprovação

`/conteudos/[id]` edita a peça. `submitContentForApproval` chama a RPC, e
`syncApprovalVoters` monta a lista de votantes a partir dos participantes da
pauta, **excluindo** quem escreveu, quem é responsável e quem está enviando —
ninguém aprova o próprio texto.

`/aprovacoes` lista o que espera decisão; `decideApproval` registra o voto.

### 7.4 Biblioteca de arquivos

`/biblioteca`. Pública dentro do espaço: qualquer membro sobe e qualquer membro
usa. Teto de **300 MB por arquivo** (o limite do Instagram para vídeo) e 1 GB por
espaço.

O caminho do upload é incomum e tem motivo:

```
navegador ──① pede permissão──> /api/files/upload-token
navegador ──② manda os bytes──> Vercel Blob (direto, sem passar pelo servidor)
navegador ──③ registra────────> /api/files/register ──> tabela files
```

**Por que não subir pelo servidor:** a função serverless da Vercel corta o corpo
da requisição em **4,5 MB**. Um reels de 80 MB nunca chegaria.

**Por que o caminho é montado no navegador:** o SDK do Blob **não deixa o
servidor escolher o caminho** ao emitir a permissão — `onBeforeGenerateToken` só
aceita `allowedContentTypes`, `maximumSizeInBytes`, `validUntil`,
`addRandomSuffix`, `allowOverwrite`, `cacheControlMaxAge`, `ifMatch` e
`tokenPayload`. Devolver `pathname` ali **é silenciosamente ignorado** (§10.2).
Então o cliente monta via `caminhoDaBiblioteca()` e o servidor **confere o
prefixo duas vezes**: ao emitir a permissão e ao registrar.

Os arquivos são `access: 'private'`. Quem lê é `/api/private-blob`, autenticado.

Cada arquivo tem `authorization_status` — direito de uso de imagem. **Publicar
exige `authorized`**, conferido no servidor em `carregarArquivo()`.

### 7.5 Publicação nas redes sociais

Tela `/redes` (`components/app/publicador-redes.tsx`) e actions em
`app/actions/redes.ts`.

Duas listas em `lib/publicacao/upload-post.ts` definem o alcance:
`REDES_DE_TEXTO` (facebook, linkedin, x, threads, bluesky, reddit,
google_business) e `REDES_DE_FOTO` (instagram, facebook, linkedin, x, threads,
bluesky, pinterest, google_business). **O Instagram não aceita post só de texto**
— é limitação da API da Meta, não esquecimento.

**Formatos** (`FORMATOS` em `lib/publicacao/upload-post.ts`): `texto`, `feed`,
`stories`, `reels`. Cada um declara que mídia aceita e quais redes o suportam. O
formato vira parâmetro de API por rede: Instagram usa `media_type`
(`IMAGE`/`STORIES`/`REELS`), Facebook usa `facebook_media_type`
(`POSTS`/`STORIES`/`REELS`/`VIDEO`).

**Conferência antes de publicar** (`lib/publicacao/requisitos.ts`): proporção,
largura e altura mínimas, tamanho, duração e limite de caracteres, por rede e
por formato. `conferir()` avisa o que vai dar errado; `enquadrar()` decide como a
prévia mostra o arquivo — inteiro se couber na faixa aceita, cortado se não, do
jeito que o Business Suite faz. `tambemAceitam()` diz quais outras redes
aceitariam o mesmo material.

**As mídias vão como bytes, não como URL.** Os arquivos da Biblioteca são
privados; o Upload-Post busca a URL a partir do servidor dele e tomaria 403.
Então a action lê o blob privado e envia multipart.

**Carrossel**: `social_publications.file_ids` (uuid[]) guarda a ordem — a
primeira é a capa. Foto e vídeo não se misturam no mesmo carrossel.

**Enviar para aprovação antes de publicar** (`enviarPostParaAprovacao`) reusa o
fluxo de aprovação: cria um `content_pieces` com `format: 'Post para redes'`,
chama a RPC e guarda um `social_publications` em `draft` ligado a ele.
`publicarRascunho` **reconfere a aprovação no servidor** antes de entregar — a
tela não é a autoridade.

### 7.6 Publicação no site (incompleta)

`lib/publicacao/ftp.ts` fala FTPS explícito (AUTH TLS, porta 21). `caminhoSeguro()`
impede escapar do diretório base — conferido contra 12 tentativas de escape.

**Este fluxo não está terminado.** A conta FTP está presa em
`/home/u448697994/noticias`, fora de `public_html`: os arquivos sobem e a web
devolve 404. O gerador de HTML ainda não existe.

---

## 8. Integrações externas

### 8.1 Upload-Post

`https://api.upload-post.com/api`, header `Authorization: Apikey <chave>`.

**Por que existe:** publicar direto nas APIs da Meta exigiria App Review da Meta.
O Upload-Post já tem app aprovado, e o OAuth roda contra o app deles.

Endpoints usados: `/upload_text`, `/upload_photos`, `/upload` (vídeo),
`/uploadposts/me`, `/uploadposts/users`, `/uploadposts/users/generate-jwt`,
`/uploadposts/facebook/pages`, `/uploadposts/status`.

Três coisas para saber antes de mexer:

1. **`UPLOAD_POST_FACEBOOK_PAGE_ID` é obrigatória.** A conta do Facebook
   vinculada administra **22 páginas**, a maioria sem relação com a instituição.
   Sem essa variável, um post pode sair na página errada.
2. **A resposta de `/uploadposts/facebook/pages` não segue a documentação.** A
   doc diz `page_id`/`page_name`; a API devolve `id`/`name`. `normalizarPaginas()`
   aceita as duas formas. Espere isso em outros endpoints.
3. **O plano gratuito tem 2 perfis e 10 publicações/mês.** Uma chamada a
   `garantirPerfil()` num diagnóstico já queimou uma vaga criando perfil fantasma.
   **Rota de diagnóstico não cria recurso** — só lê.

### 8.2 Rotas de diagnóstico

`/api/admin/ftp-check`, `/api/admin/redes-check`, `/api/admin/ftp-descobrir`.
Existem porque adivinhar configuração de servidor alheio não funciona: elas
testam de verdade e devolvem o que encontraram.

**Regras**: nunca devolvem valor de credencial — no máximo contagem de caracteres
— e limpam chave e senha do texto de erro do servidor antes de responder.

---

## 9. Convenções

**Idioma.** Interface, mensagens de erro, comentários e mensagens de commit em
**português**. Código novo nomeia em português (`publicacoesPrevistas`,
`carregarArquivo`, `enquadrar`); código herdado da Fase 1 está em inglês
(`createPauta`, `syncApprovalVoters`) e **fica como está** — renomear em massa só
gera diff sem valor.

**Status.** Gravados em inglês (`incoming`, `production`, `draft`, `review`,
`approved`, `archived`), traduzidos na borda por `lib/status-maps.ts`. Nunca
grave português no banco.

**Escrita passa por server action.** Toda ação começa com `requireWorkspace()` ou
`requireAdmin()`, filtra por `workspace_id` em **toda** query, e termina com
`revalidatePath()` das telas afetadas.

**Confie no servidor, nunca na tela.** O formulário desabilitar um botão não é
validação. Se importa, confira de novo na action.

**Comentários explicam o porquê, não o quê.** Os que existem no código registram
decisões e armadilhas — leia antes de "simplificar" algo que parece estranho.
Costuma estar assim por um motivo que custou caro.

**Densidade.** Muitos arquivos de tela são JSX de linha única, bem largo. É o
estilo herdado; ao editar, siga o do arquivo em vez de reformatar.

**Lógica não trivial sai do arquivo de action** para um módulo puro em `lib/`,
para poder ser conferida sem subir banco. Exemplos: `publicacoes-previstas.ts`,
`requisitos.ts`, `caminhoSeguro()`.

**Não há suíte de testes.** Não existe vitest nem jest, e `pnpm lint` está
quebrado (falta `eslint.config.js` — anterior a este documento). O que existe é
`npx tsc --noEmit` e `pnpm build`, **e ambos devem passar antes de qualquer
push**. Para lógica pura, escreva um script avulso no scratchpad e rode com
`npx tsx`; foi assim que `caminhoSeguro()`, `enquadrar()` e
`publicacoesPrevistas()` foram conferidos.

---

## 10. Armadilhas já pagas

Cada uma destas quebrou a produção ou queimou um recurso. Estão aqui para não
acontecerem de novo.

### 10.1 Migração destrutiva antes do deploy — derrubou a produção

A migração do carrossel introduziu `file_ids` e **derrubou `file_id` na mesma
migração**. O build no ar ainda escrevia em `file_id`. Toda publicação e todo
pedido de aprovação passaram a falhar com erro de servidor (o React #441 que
aparecia na tela é só o embrulho genérico disso).

**A regra:** migração que **acrescenta** pode ir antes do deploy — é compatível
com o que está no ar. Coluna que o código em execução usa **só sai numa migração
posterior ao deploy que parou de usá-la**. Nunca as duas no mesmo passo.

`file_id` continua em `social_publications`, marcada como obsoleta no schema,
esperando essa migração de limpeza.

### 10.2 `onBeforeGenerateToken` não escolhe o caminho

Devolver `pathname` ali é **silenciosamente descartado**. O upload ia para um
caminho que a conferência recusava, e a Biblioteca dizia "Caminho inválido" sem
que nada no código parecesse errado. Ver §7.4 para o desenho atual.

### 10.3 Construir uma tela sem caminho até ela

O painel de publicação foi construído dentro do editor de conteúdo, que não está
na sidebar. Foi entregue como pronto e ninguém conseguia chegar nele.

**Antes de dizer que algo está no ar, percorra o caminho do usuário até a tela.**
Compilar não é entregar.

### 10.4 Diagnóstico que cria recurso

`redes-check` chamava `garantirPerfil()` e criou um perfil fantasma no
Upload-Post, consumindo a última das 2 vagas do plano gratuito. Diagnóstico lê;
não escreve.

### 10.5 Prévia falsa

A prévia de vídeo era um retângulo cinza com ícone de play. Quem estava criando o
post não tinha como saber se o arquivo tinha subido certo.

Hoje é `<video controls>` de verdade, e quando o navegador não decodifica o
formato (`.MOV` no Chrome, por exemplo) aparece um aviso dizendo explicitamente
que **a falha é da pré-visualização, não do arquivo** — para ninguém desistir de
um vídeo que publicaria sem problema.

### 10.6 Credencial em conversa

Chave de API e senhas de FTP foram coladas no chat e em capturas de tela ao longo
do projeto. Todas devem ser consideradas queimadas e rotacionadas.

**Nunca receba nem escreva o valor de uma credencial.** Peça o **nome** da
variável; o valor vai direto no painel da Vercel, pelas mãos de quem é dono dele.

---

## 11. O que ainda não existe

- **Gerador de HTML e publicação no site** — o objetivo original. Parado no
  problema da pasta FTP (§7.6).
- **Migração de limpeza do `file_id`** — depende do deploy do carrossel.
- **`eslint.config.js`** — `pnpm lint` não roda.
- **Suíte de testes** — hoje só `tsc`, `build` e scripts avulsos.
- **Plano do Upload-Post** — o gratuito dá 10 publicações/mês. O pago (~US$16/mês
  no anual) é ilimitado. Decisão da instituição, ainda não tomada.

---

## 12. Se você é um agente lendo isto

Um roteiro que evita a maioria dos erros acima:

1. **Leia antes de escrever.** O comentário que parece redundante costuma marcar
   uma armadilha. §10 inteiro nasceu de código que "parecia simples".
2. **Confira o estado real** em vez de deduzir. Foi assim que a pasta do FTP e o
   formato da resposta do Facebook foram descobertos: sondando, não supondo.
3. **`npx tsc --noEmit` e `pnpm build` antes de todo push.** Sem exceção.
4. **Para lógica pura, escreva um script e rode.** `npx tsx`, casos de borda
   inclusive. Leva minutos e pega o `2026-02-31`.
5. **Migração: só acrescente.** §10.1.
6. **Percorra o caminho do usuário** até a tela que você mexeu. §10.3.
7. **Nunca toque no valor de uma credencial.** §10.6.
8. **Relate o que aconteceu de verdade** — o que passou, o que não foi feito, o
   que ficou incerto. Um relatório otimista custa mais do que um problema
   admitido.
