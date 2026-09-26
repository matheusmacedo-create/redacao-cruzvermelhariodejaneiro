# Palácio Virtual (antiga Redação) — como este projeto funciona

Documento de entrada para quem vai mexer aqui: pessoa ou agente. Descreve o que
o sistema é, como as peças se encaixam, quais convenções valem e quais erros já
foram pagos caro. Leia inteiro antes da primeira alteração.

---

## 1. O que é

**Palácio Virtual** é o sistema interno da **Cruz Vermelha Brasileira — Rio de
Janeiro**, no ar em `redacao.cruzvermelhariodejaneiro.org`.

> **Nome.** Até 26/09/2026 o produto se chamava **Redação**. Nas telas, e-mails e PDFs o nome
> agora é **Palácio Virtual** (com artigo masculino: "o Palácio Virtual", "no Palácio Virtual").
> O domínio, o repositório, as variáveis, as tabelas e os nomes no código continuam com
> `redacao`, e os comentários e documentos antigos ainda dizem "Redação": é o mesmo sistema.
> Texto novo para a tela usa "Palácio Virtual".

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
| `CRON_SECRET` | server | **segredo** — a Vercel manda nos crons de `vercel.json`; sem ela as rotas de cron ficam fechadas |
| `AUDITORIA_CHAVE_PRIVADA` | server | **segredo** — Ed25519 (PKCS#8 PEM) que assina os lotes da trilha pública; sem ela os lotes ficam sem assinatura até ela chegar (§7.9) |
| `AUDITORIA_SEGREDO` | server | **segredo**, opcional — HMAC do limite da consulta pública; na falta, derivado da chave de serviço |
| `AUDITORIA_ABERTA` | server | `1` só na abertura da trilha: tira o `noindex` das páginas de transparência e canais oficiais |
| `AUDITORIA_TSA_URL` | server | opcional — autoridade de carimbo de tempo RFC 3161 (padrão: FreeTSA) |
| `R2_ACCOUNT_ID` `R2_ACCESS_KEY_ID` `R2_SECRET_ACCESS_KEY` | server | **segredo** — token do Cloudflare R2 só com leitura e escrita de objetos nos buckets da trilha e do acervo; sem elas, o espelho da trilha e o acervo ficam desligados (§7.9, §7.10, `docs/armazenamento-r2.md`) |
| `R2_BUCKET_TRILHA` | server | bucket do espelho da trilha (`cvrj-trilha`) |
| `GOOGLE_SAFE_BROWSING_KEY` | server | opcional — reserva da chave do Safe Browsing (o lugar preferido é Configurações → Integrações); sem ela, os links não são conferidos (§8.4) |
| `R2_BUCKET_ACERVO` | server | bucket do acervo (`cvrj-acervo`); sem ela, a tela Acervo avisa que falta configurar (§7.10) |

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
    mensagens/  pessoas/  perfil/  configuracoes/  acervo/
  actions/            server actions — TODA escrita passa por aqui
    editorial.ts      pautas, conteúdos, aprovações, calendário, projetos, perfil
    redes.ts          publicação em redes sociais
    admin.ts          reset de dados do espaço
    usuarios.ts       criar, editar, redefinir senha, desativar/reativar
    acervo.ts         envio ao R2, ficha, publicação no site (§7.10)
    ajuda.ts          o que cada pessoa já viu da ajuda (§7.15)
  api/                só o que precisa ser HTTP de verdade
    bootstrap/        primeiro administrador, quando o banco está vazio
    files/            upload-token, register, download, delete
    private-blob/     proxy autenticado para arquivos privados
    redes/            redes conectadas, imagens da biblioteca
    admin/            diagnósticos (ftp-check, redes-check, ftp-descobrir)
components/
  app/                componentes de tela (sidebar, publicador-redes, emoji-picker)
    ajuda/            provedor, painel “?”, boas-vindas e dica do tour no shell (§7.15)
  ajuda/              o motor do tour, da Redação e da Área do Voluntário (§7.15)
  ui/                 primitivos Base UI
  auth/  admin/
lib/
  supabase/           client.ts (browser) · server.ts (SSR) · admin.ts (service role) · env.ts
  publicacao/         upload-post.ts · requisitos.ts · ftp.ts
  armazenamento/      r2.ts (cliente do Cloudflare R2, SigV4 sem SDK)
  acervo/             regras · dados · paginas (HTML público) · publicacao · imagens · video
  editorial/          publicacoes-previstas.ts
  ajuda/              tipos · index (registro) · progresso · posicao · membro ·
                      conteudo/<grupo>.ts, o texto de cada área (§7.15)
  session.ts          requireSession · requireWorkspace · requireAdmin · requirePermissao
  permissoes.ts       quem pode o quê (catálogo único de permissões)
  navegacao.ts        nomes, grupos e ícones das áreas (sidebar, topo, busca ⌘K, aba)
  equipe.ts           setores e pessoas da filial
  storage.ts          limites, tipos MIME, caminho da Biblioteca
  status-maps.ts      tradução banco → interface
  data.ts             constantes (coordenações, canais) + mock antigo da Fase 1
scripts/              conferir-ajuda.ts (npx tsx, §7.15) · backup-banco.sh ·
                      restaurar-arquivos.sh (docs/backup.md)
supabase/migrations/  o schema, em ordem cronológica
proxy.ts              middleware de sessão
```

**Os nomes das áreas moram em `lib/navegacao.ts`, não nas rotas.** A tela
`/redes` se chama Publicações, `/impacto` é Resultados, `/correio` é E-mail do
setor, `/cerebro` é Radar de pautas, `/registro` é Histórico, `/equipe` é
Recursos humanos, `/voluntariado` é Voluntários, `/pessoas` é Diretório,
`/mensagens` é Conversas e `/newsletter` é Newsletter. Os endereços antigos
ficaram porque há links gravados em notificações e e-mails. Área nova entra
em `lib/navegacao.ts` — é o que a põe na sidebar, na busca e na aba (§10.3).
O porquê de cada nome e o benchmark estão em
[`docs/NAVEGACAO.md`](docs/NAVEGACAO.md).

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

### Usuários e permissões

**O que cada papel pode mora em um lugar só: `lib/permissoes.ts`.** Action não
compara `context.role === 'admin'`; pergunta `pode(context.role, 'x')` ou abre
com `requirePermissao('x')`. A tela `/usuarios` desenha a matriz a partir da
mesma tabela — o que ela mostra é o que o servidor aplica. Permissão nova entra
na tabela primeiro. Papel desconhecido não pode nada (falha fechada).

O que todo membro ativo faz (registrar, escrever, comentar, votar quando
convidado, subir arquivo) não está na tabela: é o piso, garantido pelo RLS.

`/usuarios` (só admin) cria login, muda papel e coordenação, redefine senha e
desativa/reativa. As actions estão em `app/actions/usuarios.ts`. Regras:

- **Senha criada por admin é provisória.** `profiles.trocar_senha` faz
  `requireWorkspace()` mandar para `/trocar-senha` (fora do grupo `(app)`, para
  não dar laço). A temporária é gerada no servidor e aparece uma vez na tela;
  não é guardada nem vai para log.
- **Política de senha única** em `lib/usuarios/senha.ts` (instalação, admin e a
  própria pessoa). Trocar a própria senha pede a atual e derruba as outras
  sessões.
- **Desativar, não apagar.** Apagar levaria junto (cascata) o histórico da
  pessoa. Desativada: `profiles.active = false`, ban no Auth, sessões apagadas
  (`encerrar_sessoes_do_usuario`, só service role). E, mais importante, os
  helpers `private.is_workspace_member`/`workspace_role`/`shares_workspace`
  exigem perfil ativo — o token que ainda vale por até 1 hora não enxerga nada.
- **Ninguém muda o próprio papel nem se desativa**, e o banco recusa deixar o
  espaço sem admin ativo (gatilhos `garantir_admin_*`, também contra a Data API).
- **A pessoa não mexe no que não é dela**: privilégio por coluna em `profiles`
  (só nome, cargo, iniciais, cor, foto) e em `workspace_members` (só papel e
  coordenação, e só admin via RLS).
- **Auditoria à prova do próprio usuário**: `auditoria_de_acesso` não aceita
  insert pela Data API. Mudança de vínculo é registrada por gatilho (com o
  autor, porque a action faz pelo cliente do admin); o resto, pela action.

**Verificação em duas etapas (app autenticador, TOTP)**, pelo MFA do próprio
Supabase Auth. Qualquer pessoa ativa em Meu perfil → Segurança; o admin pode
torná-la obrigatória por papel em `/usuarios` (`workspaces.mfa_obrigatorio_para`,
nasce vazio = opcional para todos). Regras:

- **Quem tem o app cadastrado sempre digita o código**, obrigatório ou não —
  senão cadastrar não protegeria nada. A regra está em
  `lib/usuarios/verificacao.ts` (para o app saber para onde mandar) e em
  `private.verificacao_em_dia` (para o banco negar). Mudar uma exige mudar a outra.
- **O banco é a cerca**: os helpers de RLS exigem sessão `aal2` de quem tem o
  app ou é de papel obrigado. Uma sessão só com senha continua lendo o próprio
  vínculo e o próprio espaço (policies `*_self`/`*_vinculo`), e nada mais — é o
  que deixa o app levar a pessoa a `/verificacao` em vez de "sem acesso".
- `obterWorkspace()` devolve null para quem deve o código (rotas de API usam o
  service role depois dela). `/trocar-senha`, `/verificacao` e a home usam
  `obterWorkspaceSemVerificacao()`. Ordem: senha provisória → código → app.
- Cadastrar, confirmar e remover o próprio app é feito no navegador direto com
  o Auth: o segredo do QR Code não passa pelo servidor. O servidor só registra
  na auditoria, conferindo no Auth quantos aparelhos existem de fato.
- **Não há códigos de recuperação** no Supabase. Quem perde o celular pede a um
  admin, que remove o app da conta em `/usuarios` (as sessões caem junto). Por
  isso o perfil sugere cadastrar um segundo aparelho.

**Conta por e-mail** (convite, senha, avisos). O login continua por usuário
(o e-mail do Auth é o interno `usuario@usuarios.cvrj.local`); cada perfil ganha
um **e-mail de contato** (`profiles.email`), que só vale **confirmado**
(`email_confirmado_em`). Tudo sai pelo Resend (`enviarEmailDeConta`, remetente
`CONTA_REMETENTE`), com modelos em `lib/contas/emails.ts` (puro) e a mecânica em
`lib/contas/servidor.ts`. Regras:

- **Links de uso único, nunca senha por e-mail.** `tokens_de_conta` guarda só o
  sha-256 do código; consumir é um UPDATE condicional (dois cliques não usam o
  mesmo link). Emitir um link novo invalida os pendentes da mesma finalidade;
  trocar a senha invalida todos os de senha. Validades em `VALIDADE_MIN`.
- **Abrir o link não consome.** `/redefinir-senha` e `/confirmar-email` só
  leem no GET; consome o POST do formulário — robô de segurança corporativo
  abre todo link de e-mail antes da pessoa. As páginas mandam `no-referrer`.
- **"Esqueci minha senha" (`/esqueci-senha`) não revela contas**: resposta
  igual para tudo, só envia para e-mail confirmado, limite de 5 pedidos por IP
  a cada 15 min (`pedidos_de_recuperacao`, hash do IP) e 3 links por pessoa por
  hora. Redefinir a senha **não** desliga a verificação em duas etapas.
- **Login por e-mail**: `resolverLogin` traduz e-mail confirmado para o usuário;
  e-mail desconhecido vira um endereço interno inexistente e falha igual a
  senha errada.
- **Trocar e-mail exige abrir o link no endereço novo** (a pessoa ou o admin
  pedem; nada muda antes) e o endereço antigo recebe aviso. `profiles.email`
  não está no grant de update por coluna: a Data API não troca.
- **Admin**: criação por **convite** (a pessoa define a senha pelo link, que
  também confirma o e-mail), redefinição e reativação por **link** quando há
  e-mail confirmado; senha temporária na tela continua para quem não tem.
- **Avisos de segurança** (`avisar`) em senha alterada, 2FA ativada/removida,
  papel alterado, conta desativada/reativada e e-mail trocado. São
  best-effort: nunca desfazem a ação; a falha vai para o log.
- **Perdi o celular** (`/verificacao`): avisa os admins por e-mail, 1 vez por
  hora. Não remove nada sozinho — senão a 2ª etapa valeria o mesmo que a senha.

A equipe oficial e os setores ficam em `lib/equipe.ts`. É a fonte do campo
Coordenação e da lista "da equipe, ainda sem acesso" em `/usuarios` — estar lá
não cria conta. Mudar a coordenação de alguém sincroniza o `setor_membros` do
setor de mesmo nome no Correio.

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

`/aprovacoes` é uma fila por setor: abre em "Esperando meu voto", marca cada
rodada com o setor da pauta (`pautas.coordination`), o prazo do setor e o
atraso. Na hora de votar aparece a conferência do setor (e a do setor de quem
vota); **aprovar exige a lista inteira marcada, conferida de novo em
`decideApproval`**, e o que foi conferido vai no comentário do voto. Perfis,
prazos e listas em `lib/aprovacoes/setores.ts`; regras da fila em
`lib/aprovacoes/fila.ts` (puros). Benchmark e fontes em
[`docs/APROVACOES.md`](docs/APROVACOES.md). Setor novo sem perfil usa o
padrão. Mudar uma lista é mudar esse arquivo — peça ao setor para validar.

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

### 7.6 Publicação no site

`lib/publicacao/ftp.ts` fala FTPS explícito (AUTH TLS, porta 21). `caminhoSeguro()`
impede escapar do diretório base — conferido contra 12 tentativas de escape. Se a
página sobe e o site devolve 404, a pasta da conta FTP não é `public_html/noticias`:
confira em `/api/admin/ftp-check`.

`publicarMateria` (`lib/site/publicar-materia.ts`), em ordem:

1. **Mídias da Biblioteca** (`imagens-da-materia.ts`): foto vira JPEG de até 1600 px
   (mozjpeg, q82) — o arquivo canônico — mais WebP 480/960/1600, girada pelo EXIF e
   sem metadados; GIF e SVG passam direto. Mesmo conteúdo, mesmo nome (subir de novo
   sobrescreve, não duplica). Mídia apagada sai da página e fica no aviso.
2. **Página** (`artigo-html.ts` sobre `esqueleto.ts`): o cabeçalho, o rodapé, o GA4, o
   Pixel e o chat da home; JSON-LD `NewsArticle` + `BreadcrumbList`; `<title>` no padrão
   "Assunto | Cruz Vermelha Brasileira Rio de Janeiro" (até 60 caracteres). Link para
   arquivo interno vira texto; links antigos do site (`/cursos.html`, `/doacao.html`…)
   viram os endereços atuais (`LINKS_ANTIGOS_DO_SITE`).
3. **Guardas** (`guarda-da-pagina.ts`): a página é recusada, com mensagem, se levaria
   endereço interno (`/api/private-blob`, Blob, workspace, localhost), Markdown que não
   virou HTML (`![`, `**`, `](`) ou o domínio antigo.
4. **Subida** por FTPS e, depois, índice, sitemap e `.htaccess` (`vitrine.ts`).

**Datas.** `site_published_at` é a primeira publicação e não muda mais; o
`dateModified` e o `lastmod` do sitemap são a última edição do texto (`updated_at`,
nunca antes da publicação). Republicar não mexe em nenhuma das duas — por isso a nova
versão entra na trilha pela RPC `auditoria_registrar_item` (§7.9), não pelo gancho.

**Regerar tudo** (Configurações → site, só admin; `regerarPaginasDasNoticias`): refaz
todas as matérias no ar com o modelo atual, em rodadas de até 40 s que continuam de
onde pararam, e no fim privacidade, termos, índice e sitemap. Pula a matéria editada
depois da última publicação (texto não revisado não vai ao ar sem querer).

**Chat.** As páginas usam a versão (`?v=`) que a home usa, lida da home na hora
(`chat-do-site.ts`); sem ela, saem sem o chat. **Redirecionamentos** 301 de notícias:
`REDIRECIONAMENTOS_DAS_NOTICIAS` em `cache-do-site.ts` (vazio até alguém preencher).

---

### 7.7 Chamados (TI, Manutenção e outras filas)

`/chamados`. Pedidos entre setores, no modelo descrito em
[`docs/CHAMADOS.md`](docs/CHAMADOS.md) (benchmark de Jira Service Management,
GLPI, Freshservice e Zendesk). Peças:

- **Regras puras** em `lib/chamados/regras.ts`: status e transições por papel
  (equipe × quem abriu), prioridade pela matriz urgência × impacto, SLA em
  horário de atendimento (seg–sex 8h–18h, UTC−3 fixo) com pausa em
  "aguardando", e `efeitosDaMudanca` (o que cada troca de status faz no
  relógio). Conferidas por script — mudou regra, rode de novo.
- **Escrita só pelo servidor** (`app/actions/chamados.ts`, service role): o
  banco não aceita insert/update dessas tabelas pela Data API. Cada action
  descobre o papel da pessoa no chamado (`papeisNoChamado`) antes de agir.
  **Leitura por RLS** (`private.atende_fila`, `ve_chamado`): quem abriu vê o
  seu; a equipe da fila (e admin) vê os da fila; nota interna e anexo interno,
  só a equipe.
- **Numeração por fila** (`TI-0042`) por gatilho, atômica; transferir de fila
  renumera no destino (o código antigo fica no histórico).
- **Prazos** são sempre `abertura + SLA + minutos_pausados`: mudar impacto ou
  transferir recalcula sem perder as pausas.
- **Anexos** sobem direto ao Blob (`/api/chamados/anexos/upload-token`, prefixo
  `workspaces/<id>/chamados/`); a action confere com `head()` o tamanho e o
  tipo gravados. Download por `/api/chamados/anexos/[id]`, autorizado pelo RLS.
- **Avisos** (`avisarSobreChamado`): sino + e-mail de recuperação confirmado;
  nunca para quem fez a ação.
- **Rotina diária** (`/api/chamados/rotina`, `vercel.json`, `CRON_SECRET`):
  fecha resolvidos há mais de 5 dias.
- Configuração (filas, equipe, catálogo, SLA) em `/chamados/configurar`,
  permissão `chamados.configurar`.

### 7.8 Notificações (sino e e-mail)

Todo aviso passa por `notificar()` (`lib/notificacoes/servidor.ts`); ninguém
mais insere em `notifications` direto. Ela grava no sino e, conforme a
preferência da pessoa, manda e-mail para o **e-mail de recuperação
confirmado** (`profiles.email` + `email_confirmado_em`). Nunca avisa quem fez
a ação e nunca lança. O e-mail sai em `after()`, sem atrasar a resposta.

Quando o e-mail sai (`decidirEmail` em `lib/notificacoes/regras.ts`, puro):

- preferência por assunto (`notificacao_preferencias.modos`): **Na hora**,
  **Resumo diário** ou **Só no sino**. O padrão é "na hora". Os assuntos são
  aprovações, mensagens, pautas e conteúdos, chamados e ofícios;
- quem abriu a Redação há menos de 3 min (`profiles.visto_em`, atualizado
  pelo layout e pelo sino) não recebe e-mail na hora;
- no mesmo link, no máximo um e-mail a cada 15 min;
- o que não saiu na hora e continua não lido vai no **resumo diário**
  (`/api/notificacoes/resumo`, cron 11h30 UTC, protegido por `CRON_SECRET`).
  `notifications.email_em` marca o que já saiu, para nada ir duas vezes.

Avisos de segurança da conta (senha, 2FA, e-mail trocado) não passam por aqui
e saem sempre (`avisar()` em `lib/contas/servidor.ts`).

O sino (`components/app/sino.tsx`) mostra a contagem real de não lidas, e não
só as 10 carregadas. Ele marca como lido ao clicar, ao abrir a página do link
e com "Marcar todas". Como o layout não é refeito a cada navegação, o sino
busca `/api/notificacoes` a cada 60 s com a aba visível, ao voltar para a aba
e ao ser aberto. Tudo fica em `/notificacoes`, e as preferências ficam em
`/perfil#notificacoes`. O `authenticated` só pode atualizar `read_at`: o
título e o link vêm sempre do servidor.

Eventos que avisam hoje:

| Evento | Quem recebe |
|---|---|
| Pedido de aprovação (editorial e pacotes de redes) | Quem foi convidado a votar |
| Voto ou pedido de ajustes numa aprovação | Quem pediu a aprovação |
| Mensagem direta | O destinatário |
| Mensagem na conversa de uma pauta | O responsável e os participantes |
| Pessoa adicionada a uma pauta | Essa pessoa |
| Novo responsável por um cartão do quadro | O novo responsável |
| Comentário num conteúdo | Quem criou o conteúdo e quem já comentou nele |
| Chamados (abertura, resposta, situação, atribuição) | Veja 7.7 |
| Ofício emitido | Os assinantes |
| Ofício assinado | Quem criou o ofício; na última assinatura, todos |
| Ofício recusado | Quem criou o ofício |
| Ofício cancelado | Os assinantes |

Para um evento novo, chame `notificar()` depois de salvar, com uma das
categorias. Se precisar de outra categoria, acrescente-a em `CATEGORIAS` e no
`check` de `notifications.categoria`.

### 7.9 Trilha pública, portal de transparência e canais oficiais

Especificação: `docs/auditoria-publica.md` (o modelo) e `docs/auditoria-publica-benchmark.md` (de
onde ele veio). **Ativo em produção desde 25/09/2026, em lançamento oculto**: tudo funciona, nada é linkado nem indexado até a abertura
(checklist na §9 da especificação).

- **Banco**: schema `auditoria`, fora da Data API. Itens verificáveis (matérias no site,
  comunicados, ofícios, certificados, documentos e parcerias do portal, versões dos canais) com
  código de 26 caracteres; eventos encadeados por hash em cada fluxo; lote diário com Merkle,
  cabeças das cadeias e compromisso encadeado. Entram pelos **gatilhos nas tabelas de origem**
  (nada na aplicação precisa lembrar de registrar) e por `auditoria_sincronizar()`, a rede de
  segurança diária. Falha de registro nunca derruba a operação principal: vira linha em
  `auditoria.falhas` e aviso à administração.
- **Chave de assinatura** (`lib/auditoria/chave.ts`): a variável `AUDITORIA_CHAVE_PRIVADA` da
  Vercel, se existir; senão a do cofre (Vault, serviço `auditoria_trilha`), gerada pelo botão da tela
  Trilha pública — nasce no servidor, vai direto ao cofre, só a impressão digital volta. Não se troca
  pela tela.
- **Rotinas** (`vercel.json`): `/api/auditoria/diaria` (confere a cadeia, fecha, assina, carimba na
  FreeTSA e no OpenTimestamps, publica em `/verificar/lotes/` no site) e `/api/auditoria/provas`
  (confirmação no Bitcoin). Lógica em `lib/auditoria/rotina.ts`.
- **Consulta pública**: `/api/publico/verificar` (+ `/prova`, `/conteudo`), com CORS só para o
  site, limite por hora com HMAC do IP e fora do `proxy`. Consumida pela página
  `cruzvermelhariodejaneiro.org/verificar/`, que é do repositório do site.
- **Telas** (só admin): `/trilha-publica` (conferência, lotes, falhas, busca por código),
  `/transparencia` (documentos com versões imutáveis e parcerias da Lei 13.019/2014) e
  `/canais-oficiais` (versões da lista). O portal e os canais geram as páginas públicas com o
  esqueleto do site (`lib/transparencia/paginas.ts`), `noindex` enquanto `AUDITORIA_ABERTA` não for `1`.
- **Testes**: pgTAP em `supabase/tests/` sobre um Postgres local (`montar-banco-local.sh`); nunca em
  produção — a trilha só aceita acréscimo.
- **Espelho no Cloudflare R2** (`lib/auditoria/espelho.ts`): as rotinas copiam os arquivos dos lotes
  para o bucket `cvrj-trilha` — `verificar/` igual ao site e `registro/`, com trava permanente, em
  que cada arquivo entra uma vez; conteúdo diferente no registro vira alerta, nunca substituição.
- **Backup**: `docs/backup.md` (workflow diário: banco e arquivos do Storage cifrados com age, no
  bucket `cvrj-backups` do R2, com trava). O R2 também guarda o acervo da filial
  (`docs/armazenamento-r2.md`).

### 7.10 Acervo

Especificação: `docs/acervo.md`. Os arquivos ficam no bucket `cvrj-acervo` do R2; a ficha fica em
`acervo_itens`; o público fica em `cruzvermelhariodejaneiro.org/acervo/`.

- **Envio**: o navegador manda o arquivo direto ao R2 por link assinado de uso único
  (`prepararEnvioAoAcervo`), sem passar pela Vercel; o bucket tem CORS só para a origem da Redação.
  O arquivo cai em `entrada/redacao/` e vai para `<coleção>/<ano>/` (com trava de 30 dias) ao ser
  guardado ou publicado.
- **Banco**: `acervo_itens`, lida pela equipe do espaço (RLS) e escrita só pelas ações do
  servidor. O gatilho `acervo_guardar_item` torna coleção e endereço permanentes depois da primeira
  publicação e recusa apagar item público.
- **Publicação** (`lib/acervo/publicacao.ts`): gera as versões WebP sem metadados (sharp) ou copia o
  PDF, e grava por FTP a página do item, as coleções (24 por página), a apresentação, o `.htaccess`
  do acervo, o `sitemap.xml` e o `robots.txt`. O FTP só escreve nos caminhos de `ARQUIVO_DO_ACERVO`
  (`lib/publicacao/ftp.ts`).
- **Permissões**: `acervo.ver` (admin, editor, colaborador) navega e baixa; `acervo.gerenciar`
  (admin, editor) envia, cataloga, publica e exclui.
- **Testes**: `supabase/tests/acervo.test.sql` (pgTAP).

### 7.11 Perfil de cada pessoa (`/pessoas/[id]`)

É a página de cada pessoa, no jeito de uma rede social. Tem capa, foto,
apresentação, pronomes, disponibilidade, "pode ajudar com", métricas e
contatos. Chega-se a ela pelo nome ou pela foto no Diretório, e pelo link em
Meu perfil. **Só a própria pessoa edita** (`/pessoas/[id]/editar`), nem
administrador.

- **Dados:** `perfil_social`, uma linha por pessoa. A escrita passa por
  `salvarPerfilSocial` (service role, sempre o `user.id` da sessão). O RLS só
  deixa ler o próprio perfil.
- **Contatos** são institucionais ou pessoais. Cada um tem visibilidade
  `equipe`, `setor` ou `admins`, e o pessoal nasce `admins`. Quem aplica a
  visibilidade é `carregarPerfil` (`lib/pessoas/perfil-servidor.ts`), no
  servidor: o que o leitor não pode ver nem chega ao navegador. O e-mail e o
  telefone de trabalho da ficha da Equipe e o e-mail do setor entram sozinhos
  como institucionais. Regras e validação estão em `lib/pessoas/perfil.ts`,
  módulo puro.
- **Métricas:** `metricas_da_pessoa()` calcula sobre os últimos 90 dias, em
  tempo corrido, com mediana:
  - tempo de resposta no chat, em diretas (a primeira mensagem de cada vez que
    a outra pessoa puxa assunto) e em menções nos canais;
  - tempo para decidir aprovações;
  - primeira resposta e nota nos chamados;
  - pautas em andamento e conteúdos criados.

  Quem desliga "mostrar métricas" recebe `null` para os outros; ela mesma e
  os administradores continuam vendo. O selo "Costuma responder em X" só
  aparece com pelo menos 3 respostas.
- "Visto em" e o ponto de online só aparecem para a própria pessoa e para
  administradores, a mesma regra do Diretório.

### 7.12 Compras (`/financeiro/compras`)

O caminho segue o manual de compras da Cruz Vermelha (IFRC): pedido → cotação
→ aprovação → ordem de compra → recebimento → conta a pagar.

- **Quem faz o quê:**
  - qualquer pessoa da Redação pede;
  - o Financeiro com nível "lançar" cota, emite e envia a ordem, e lança a
    conta;
  - o nível "aprovar" aprova, e a Diretoria também aprova acima do limite;
  - quem pediu (ou o Financeiro) registra o que chegou.

  As regras moram nas funções `compras_*` do banco, e `lib/compras/regras.ts`
  é o espelho puro para a tela.
- **Ordem de compra:** tem numeração própria (`OC-AAAA-NNNN`, só as compras
  aprovadas). O PDF é montado na hora (`lib/compras/ordem-pdf.ts`, sobre
  `lib/pdf/folha.ts`) e sai por um e-mail de setor com anexo. A regra de envio
  é a mesma do E-mail do setor, em `lib/correio/enviar.ts`.
- **Recebimento:** pode chegar em partes (`compras_recebimentos` e
  `compras_recebimento_itens`), e ninguém recebe mais do que pediu.
- **Conta a pagar:** vira lançamentos de despesa já aprovados, em até 12
  parcelas, com os centavos que sobram na última. O `origem_ref` fica como
  `compras:<pedido>:<n>`, e o valor não passa do aprovado.
- **Cancelamento:** depois que algo chegou ou a conta foi lançada, a compra
  não se cancela mais.
- **Entrada no Estoque ou no Patrimônio:** quem opera o Patrimônio dá o
  destino do que chegou (`compras_dar_entrada`, registro em
  `compras_destinos`). Esse grupo vê as compras a partir da ordem emitida.
  - Estoque: entra por `estoque_entrada`, e a unidade pode ser outra (5 caixas
    = 500 un).
  - Patrimônio: um bem por unidade, por `patrimonio_salvar_bem`.
  - Sem entrada: serviço ou consumo imediato.

  O custo é o preço com a parte do frete, rateado pelo valor dos itens, e
  nunca entra mais do que chegou.
- **Fracionamento:** `fracionamento()` em `lib/compras/regras.ts` soma as
  compras da mesma categoria ou do mesmo fornecedor dos últimos 90 dias. Se a
  soma cai numa faixa mais exigente, quem cota e quem aprova veem o alerta. É
  só aviso, não bloqueio.
- **Transparência:** `/api/compras/relatorio?mes=AAAA-MM&empresa=…` gera o
  relatório público do mês em PDF, com todas as propostas e a justificativa.
  Fornecedor pessoa física sai sem identificação. Para publicar, envie o PDF
  em Transparência → Documentos, na seção "Outros documentos".

### 7.13 Registro de acessos (`/acessos`)

Quem entrou, quando, de onde e com qual aparelho. A especificação e as decisões estão em
`docs/registro-de-acessos.md`. Em resumo:

- **Tabelas:** `acessos_eventos` (cada entrada, tentativa errada, bloqueio, 2 etapas e saída),
  `acessos_aparelhos` (cookie `cvrj_aparelho` em hash, assinatura e impressão digital) e
  `acessos_leitores` (quem vê). Escrita só pelo servidor, com a chave de serviço; leitura só para
  leitor, conferida no RLS.
- **Captura:** `app/actions/entrada.ts` envolve o login da equipe (bloqueio antes, registro depois),
  `components/auth/verificacao.tsx` avisa a 2ª etapa, `app/auth/signout` registra a saída e
  `app/actions/membro.ts` registra os voluntários (sem fingerprint).
- **Regras puras** em `lib/acessos/agente.ts` (cabeçalhos da Vercel, navegador e sistema) e
  `lib/acessos/regras.ts` (bloqueio, sinais de risco, leitura dos sinais do navegador).
- **Regra de ouro:** nada do registro pode impedir alguém de entrar. A exceção é o bloqueio por
  tentativas, que é deliberado.
- Toda consulta à tela grava `acessos.consultados` em `activity_log`.

### 7.14 Envio de ações pela equipe (`/enviar` → `/envios`)

Link público, sem login, para a equipe mandar o que aconteceu numa ação: relato, áudio gravado na
hora, fotos, vídeos e documentos, até 2 GB por arquivo. O benchmark, as decisões e o caminho completo
estão em `docs/envio-de-acoes.md`. Em resumo:

- Os arquivos vão do navegador **direto ao R2** (`cvrj-acervo/entrada/envios/`), fora da cota da
  Biblioteca. O banco só guarda a ficha (`envios`, `envio_arquivos`).
- O link é aberto. As proteções são as de `/participe` (campo escondido, tempo mínimo), mais um
  limite por origem (10 envios/hora e 5 GB/dia) e a conferência do tamanho de cada arquivo no R2.
- Só quem está em `envios_avaliadores` vê a caixa. "Criar matéria e posts" gera pauta, peça e pacote
  e copia para a Biblioteca só o que foi marcado.
- Quem enviou é avisado na primeira publicação da matéria (`avisarQuemEnviou`, chamado de
  `publicarMateria`).

### 7.15 Ajuda (boas-vindas, tours, painel e Central)

Pesquisa, decisões, funcionamento do tour, guia de estilo e como manter:
[`docs/AJUDA.md`](docs/AJUDA.md).

- **Conteúdo:** texto e dado puro, em `lib/ajuda/conteudo/<grupo>.ts` (um
  arquivo por grupo do menu) e em `lib/ajuda/membro.ts` (Área do Voluntário),
  no formato de `lib/ajuda/tipos.ts`. A chave de cada guia é o `href` da área
  em `lib/navegacao.ts`, então a ajuda some junto com a área para quem não
  pode abri-la. O mesmo conteúdo serve ao painel “?” (botão no topo e tecla
  `?`), à Central (área "Ajuda", `/ajuda`, no pé da sidebar, com âncora em
  cada tarefa e pergunta) e à busca ⌘K (`buscarNaAjuda`).
- **Tour** (`components/ajuda/tour.tsx`): aponta para os elementos marcados
  com `data-ajuda="<área>.<coisa>"`. Sem o alvo na tela, o balão vai ao
  centro, ou o passo some (`seAusente: 'pular'`). Abaixo de 640 px, vira uma
  folha presa à borda. É um diálogo modal: foco preso, Esc fecha, as setas
  andam. O tour das boas-vindas usa o mesmo motor; o de cada tela é
  oferecido numa dica na primeira visita, e não aberto à força.
- **Progresso:** o que a pessoa já viu fica em `user_metadata.ajuda` do
  Supabase Auth (`lib/ajuda/progresso.ts`), sem tabela e sem migração. É
  estado de interface e **não decide acesso**, porque a própria pessoa pode
  editar o metadata. Quem grava é `registrarAjuda()` (`app/actions/ajuda.ts`):
  só aceita chave de tour que existe (`ehChaveDeTour`), porque o metadata vai
  no token de toda requisição, e nunca lança. A Área do Voluntário não usa o
  Supabase Auth: lá fica no `localStorage`.
- **Conferência:** `npx tsx scripts/conferir-ajuda.ts` acusa alvo citado
  sem `data-ajuda` no código, id repetido e tela fora da área, e avisa sobre
  área sem ajuda. Tela nova ou que mudou atualiza a ajuda no mesmo PR
  (§10.3).

### 7.16 Agenda (`/calendario`)

Benchmark, decisões e o que foi entregue: [`docs/calendario-inteligente.md`](docs/calendario-inteligente.md) §0.

- **Camadas, não cópias.** Cada área com data (pautas, publicações, voluntariado, escola, doações,
  financeiro, frota, chamados, parcerias, aniversários, datas comemorativas e feriados) é lida na
  hora, só na janela visível, por `lib/agenda/fontes.ts`. `calendar_events` continua sendo a tabela
  dos agendamentos avulsos e das publicações previstas (§7.2).
- **Na tela, o RLS decide:** as fontes usam o cliente da pessoa. `camadasDisponiveis` só esconde
  do painel as camadas das áreas a que ela não tem acesso.
- **Sem sessão, confere de novo:** o link de assinatura (`/api/agenda/ics/[token]`) e o resumo
  semanal (`/api/agenda/resumo`, segunda 9h43 UTC) usam o cliente de serviço. Por isso passam
  `semSessao: true` (o Financeiro só entra para quem vê os livros de todas as empresas), e o ICS
  só leva as camadas marcadas `ics: true` em `lib/agenda/camadas.ts`. O token do ICS só existe na
  tela de quem o gerou; o banco guarda o SHA-256.
- **Preferências por pessoa** em `agenda_preferencias`: camadas desligadas, resumo semanal e o
  link. Nem esta tabela nem `datas_comemorativas` aceitam escrita direta (RLS). Tudo passa por
  `app/actions/agenda.ts`.
- **Regras puras** em `lib/agenda/{datas,regras,ics,visao}.ts`: feriados calculados (Páscoa de
  Meeus; a camada soma o que a BrasilAPI da §8.4 trouxer a mais), datas comemorativas, alertas e
  o arquivo RFC 5545. Conferência:
  `npx tsx scripts/conferir-agenda.ts`.

### 7.17 Autorização de uso de imagem por link (`/biblioteca/autorizacoes` → `/autorizacao/[token]`)

- **Fluxo.** Na Biblioteca, a equipe seleciona as fotos de uma ação e gera um link
  (`imagem_coletas`: título, `file_ids`, token de 43 caracteres, validade opcional). Quem aparece
  nas fotos abre o link no celular, sem login: vê as fotos (servidas por
  `/api/publico/autorizacao/[token]/foto/[fileId]`, que confere se a foto é da coleta), lê o termo,
  marca os usos e assina com o dedo num `<canvas>`. A página da ação mostra QR, WhatsApp, quem
  assinou e o botão que passa as fotos a `authorization_status = 'authorized'`.
- **O que prova a assinatura** (`imagem_autorizacoes`): os traços da assinatura (coordenadas 0–1000,
  sem imagem), IP, User-Agent, o aparelho descrito (`descreverAparelho`; o modelo do Android vem de
  `navigator.userAgentData.getHighEntropyValues`), data e hora, a versão do termo e o SHA-256 do
  texto dele, e o SHA-256 do documento canônico (tudo o que foi preenchido e registrado). O texto
  de cada versão do termo fica em `imagem_termo_versoes` na primeira assinatura e não muda
  (trigger). **Mudou o texto do termo, mude `TERMO_VERSAO`** em `lib/imagem/termo.ts`.
  Não há selfie de propósito: rosto para identificar é dado biométrico (sensível na LGPD).
- **Imutável.** Trigger `private.imagem_autorizacao_imutavel`: não apaga, não altera o assinado e
  só aceita uma revogação (campos `revogada_*`). Revoga quem assinou, pelo comprovante
  (`/autorizacao/comprovante/[codigo]?c=`; o banco guarda só o SHA-256 da chave), ou a equipe,
  com motivo. Quem criou o link recebe aviso (`notificar`, categoria `aprovacoes`).
- **Escrita só pelo servidor.** As três tabelas têm RLS de leitura para membros do espaço e nenhuma
  escrita para `authenticated`/`anon`: a página pública grava por `lib/imagem/servidor.ts` (cliente
  de serviço, limite de 60 assinaturas por IP por hora e 500 por link), a equipe por
  `app/actions/autorizacoes-de-imagem.ts`. Busca e planilha: `lib/imagem/consulta.ts` e
  `/api/biblioteca/autorizacoes/csv`.
- **Regras puras** em `lib/imagem/regras.ts` (validação, traços, aparelho, código `IMG-XXXX-XXXX`,
  documento canônico). O termo é **minuta** — revisão do Jurídico pendente.

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

### 8.2 Cérebro

O Cérebro ([cerebrocruzvermelha](https://github.com/matheusmacedo-create/cerebrocruzvermelha),
`https://cerebrocruzvermelha.vercel.app`) observa uma lista fechada de contas
oficiais do Rio, entende cada sinal por seis perguntas e decide o que merece
virar pauta. **Ele não publica** — essa separação é o projeto inteiro dele, e a
Redação é o lado humano dela.

A integração tem três pontas, todas tolerantes a falha (Cérebro fora do ar
nunca derruba tela daqui):

1. **Leitura** (`lib/cerebro/cliente.ts` → `GET /api/pauta` de lá). A tela
   **Cérebro** (`/cerebro`) mostra tudo com raciocínio, notas, plano por canal
   e travas; o painel de Publicações resume as seis primeiras. Cache de 5
   minutos na tag `cerebro`. O contrato está espelhado em
   `lib/cerebro/contrato.ts` — o original versionado vive no repositório dele.
2. **Importação** (`app/actions/cerebro.ts`). Uma sugestão vira pacote do hub
   em rascunho, de dois jeitos. **Rascunhar com IA** (`lib/cerebro/redator.ts`):
   o Claude redige título, linha fina, matéria, legenda de feed e três stories
   com a voz da casa (`lib/ia/estilo.ts`) e sob as travas do sinal — só com o
   que está no material, acréscimos entre ⟦ ⟧ e uma lista PARA CONFERIR. **Sem
   IA** (`lib/cerebro/mestre.ts`): a legenda da fonte reorganizada em matéria,
   como sempre foi. Nos dois casos só nascem os destinos que o plano do Cérebro
   liberou (`usar: true`), a capa vai à Biblioteca (`pending` se material da
   Casa, `internal` se de terceiro — `authorization_status` continua mandando
   no disparo) e a orientação inteira do Cérebro — o que não pode, o plano, o
   que conferir — fica em `mestre.cerebro` como dado (`lib/cerebro/orientacao.ts`),
   que o hub mostra aberto no editor e entrega aos prompts de melhoria. O
   vínculo mora em `social_packages.cerebro_sinal_id`, com índice único contra
   duplicata; a tela `/cerebro` marca o que já virou pacote.
3. **Devolução.** Recusar com motivo grava no Cérebro (`POST /api/feedback` de
   lá) e pesa nas próximas leituras dele. O "sim" também volta pela mesma rota:
   `pautado` ao importar e `publicado` quando um destino vai ao ar
   (`recalcularStatusDoPacote`, depois da resposta) — é o que tira da atenção
   dele o que a Casa já cobriu. E `GET /api/cerebro/contexto` (daqui) entrega
   a ele os títulos publicados nos últimos 60 dias e as atividades Ação/Evento
   do Registrar — é o que alimenta as notas de ineditismo e de ação real do
   motor. Só títulos saem por ali, nunca corpo, contato ou história;
   `CEREBRO_CONTEXTO_TOKEN` fecha a rota se preciso.

Variáveis: `CEREBRO_URL`, `CEREBRO_TOKEN` (o mesmo valor do `PAUTA_TOKEN` do
Cérebro — com ele configurado lá, todo o contrato exige Bearer),
`CEREBRO_CONTEXTO_TOKEN` — todas opcionais, documentadas no `.env.example`.

### 8.3 Rotas de diagnóstico

`/api/admin/ftp-check`, `/api/admin/redes-check`, `/api/admin/ftp-descobrir`.
Existem porque adivinhar configuração de servidor alheio não funciona: elas
testam de verdade e devolvem o que encontraram.

**Regras**: nunca devolvem valor de credencial — no máximo contagem de caracteres
— e limpam chave e senha do texto de erro do servidor antes de responder.

---

### 8.4 APIs públicas (CEP, CNPJ, feriados, tempo, FIPE, BC, mapa, senhas, links)

Tudo passa por `lib/apis-publicas/`. `regras.ts` é puro: valida a entrada e
lê a resposta, e dá para conferir com tsx. `servidor.ts` faz a rede: prazo
curto, **nunca lança** e guarda no cache de dados do Next. A regra é que a API
externa ajuda, mas não é dependência: fora do ar, a tela segue no modo manual.
As telas consultam pelas actions de `app/actions/apis-publicas.ts`, e só quem
está logado pode usá-las (Redação ou Área do Membro), para o servidor não
virar repetidor grátis.

| API | Onde entra | Chave |
|---|---|---|
| BrasilAPI CEP, com ViaCEP de reserva | `EnderecoPeloCep` nos cadastros de participantes, Equipe e Área do Membro: preenche logradouro, bairro, cidade e UF | não |
| IBGE, municípios do RJ | Sugestão e grafia oficial no campo cidade | não |
| BrasilAPI CNPJ | `DadosPeloCnpj` em favorecidos e empresa (Financeiro) e no órgão da parceria (Transparência): preenche só campos vazios e avisa quando o CNPJ não está ATIVO | não |
| BrasilAPI feriados, mais São Sebastião e São Jorge | Calendário e **prazos dos chamados** (`somarMinutosUteis`/`minutosUteisEntre` recebem o conjunto de feriados) | não |
| Open-Meteo | `TempoNoRio` no painel: 7 dias na sede, com alertas de chuva ≥ 25/50 mm, rajada ≥ 60/75 km/h e calor ≥ 38/40 °C | não (uso não comercial) |
| Pwned Passwords (HIBP) | `problemaDeSenhaVazada` nas quatro telas em que alguém escolhe senha. Por anonimato por faixa, só os 5 primeiros caracteres do SHA-1 saem daqui. Se a API cair, a senha passa | não |
| Google Safe Browsing | `problemaDeLinkPerigoso` antes de publicar matéria no site e de enviar a newsletter: bloqueia link marcado. Sem chave, não confere | **sim**, `google_safe_browsing` em Configurações → Integrações (ou `GOOGLE_SAFE_BROWSING_KEY`) |
| Banco Central (PTAX e IPCA, SGS 433) | `IndicadoresDoBc` em Financeiro → Saúde do caixa: dólar, euro, IPCA de 12 meses e calculadora de correção (do primeiro ao último mês, inclusive) | não |
| Tabela FIPE (parallelum) | `ValorFipe` na página do veículo. O valor é consultado de novo no servidor e gravado por `frota_registrar_fipe` (nível 3 do Patrimônio) | não |
| Nominatim / OpenStreetMap | `MapaDoLocal` em pautas com local e nas oportunidades de voluntariado. Cache de 30 dias, respeitando a política de 1 consulta por segundo | não |

Limites que valem conhecer:
- a BrasilAPI de CEP tem entradas "inventadas" em sua base aberta (99999-999
  existe lá);
- a FIPE gratuita tem cota diária;
- o Nominatim exige identificação (User-Agent) e cache.

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
Compilar não é entregar. Tela nova com endereço próprio precisa de uma linha
em `lib/navegacao.ts`; sem ela, não aparece na sidebar nem na busca. E
precisa de ajuda: o guia da área em `lib/ajuda/conteudo/`, os `data-ajuda`
que o tour cita e `npx tsx scripts/conferir-ajuda.ts` passando (§7.15).

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

- **Suíte de testes das páginas do site** — a conferência (render com exemplos,
  `validar_jsonld.py` do repositório do site, capturas) ainda é manual (§7.6).
- **Migração de limpeza do `file_id`** — depende do deploy do carrossel.
- **`eslint.config.js`** — `pnpm lint` não roda.
- **Suíte de testes** — hoje só `tsc`, `build` e scripts avulsos.
- **Registro de acessos, fase 2** — sessões abertas, "visto por último", encerrar sessão e
  retenção (`docs/registro-de-acessos.md` §0).
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
7. **Atualize a ajuda junto com a tela.** Botão renomeado na tela e não na
   ajuda manda a pessoa procurar o que não existe. Guia em
   `lib/ajuda/conteudo/`, `data-ajuda` e `npx tsx scripts/conferir-ajuda.ts`.
   §7.15 e `docs/AJUDA.md` §4–5.
8. **Nunca toque no valor de uma credencial.** §10.6.
9. **Relate o que aconteceu de verdade** — o que passou, o que não foi feito, o
   que ficou incerto. Um relatório otimista custa mais do que um problema
   admitido.
