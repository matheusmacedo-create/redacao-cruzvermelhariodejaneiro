# Palácio Virtual (antiga Redação) — como este projeto funciona

Documento de entrada para quem vai mexer aqui: pessoa ou agente. Descreve o que
o sistema é, como as peças se encaixam, quais convenções valem e quais erros já
foram pagos caro. Leia inteiro antes da primeira alteração.

---

## 1. O que é

**Palácio Virtual** é o sistema interno da **Cruz Vermelha Brasileira — Rio de
Janeiro**, no ar em `palacio.cruzvermelhariodejaneiro.org` (o endereço antigo,
`redacao.cruzvermelhariodejaneiro.org`, manda as páginas para ele pelo `proxy.ts`; `/api` segue
respondendo nos dois, por causa de webhooks e do formulário do site; o domínio mora em `lib/dominio.ts`).

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
| `EVOLUTION_API_URL` `EVOLUTION_INSTANCIA` `EVOLUTION_API_KEY` | server | **segredo** (a chave), opcionais — reserva do cartão “WhatsApp (Evolution API)” de Configurações → Integrações, que é o lugar preferido; valem as três juntas (§8.5) |

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
  (app)/                  a equipe, com login (layout com menu, sino, busca e ajuda)
    dashboard/            Início (blocos que cada pessoa escolhe)
    aprovacoes/ chat/ calendario/ notificacoes/
    chamados/ oficios/ correio/ portaria/            Expediente (Pedidos de compra: financeiro/compras)
    cerebro/ pautas/ projetos/ redes/ impacto/ registro/ registrar/ conteudos/
                                                     Redação (Radar, Pautas, Projetos, Publicações, Resultados, Histórico)
    biblioteca/ envios/ acervo/                      Mídia
    direct/ newsletter/ imprensa/ mensagens/         Público
    financeiro/ patrimonio/ transparencia/ canais-oficiais/ trilha-publica/
                                                     Gestão
    pessoas/ equipe/ voluntariado/ participantes/    Pessoas (Diretório, RH, Voluntários)
    escola/                                          Escola (vendas, financeiro, marketing, configurações)
    acessos/ usuarios/ configuracoes/ perfil/ ajuda/ administração e conta
    not-found.tsx error.tsx loading.tsx
  membro/                 Área do Voluntário (sessão própria, cookie cvrj_membro)
    (area)/               início, cursos, apostilas, certificados, oportunidades,
                          avisos, mensagens, perfil, princípios, ajuda
    entrar/               código por e-mail ou WhatsApp
  páginas públicas (sem login):
    page.tsx (entrada) esqueci-senha/ redefinir-senha/ trocar-senha/ verificacao/ confirmar-email/
    visitante/            autocadastro da Portaria pelo QR
    enviar/ album/        envio de ações pela equipe e álbum do evento
    autorizacao/          autorização de uso de imagem
    cotacao/              proposta do fornecedor
    ficha/                ficha do RH preenchida pela própria pessoa
    participe/            inscrição de voluntário
    verificar/ cracha/ diploma/ certificado/          conferência de ofício, crachá e diplomas
    newsletter/ comunicados/
    not-found.tsx         endereço que não existe
  actions/                server actions (57 arquivos) — TODA escrita passa por aqui
  api/                    o que precisa ser HTTP: arquivos e PDFs, webhooks (WhatsApp,
                          Upload-Post), rotinas diárias (CRON_SECRET) e verificações públicas
components/
  app/<área>/             telas da equipe, uma pasta por área
  membro/                 Área do Voluntário
  ajuda/                  motor do tour (equipe e voluntário)
  ui/                     primitivos Base UI
lib/                      regras e acesso a dados, uma pasta por área:
  supabase/               client (navegador) · server (sessão) · admin (serviço) · paginar
  session.ts permissoes.ts navegacao.ts     quem é, o que pode, onde fica cada área
  notificacoes/ whatsapp/ correio/          sino, e-mail, WhatsApp e e-mail do setor
  editorial/ pautas/ publicacao/ site/ midia/ acervo/ envios/ imprensa/ newsletter/
  chamados/ oficios/ compras/ portaria/ financeiro/ patrimonio/ transparencia/ auditoria/
  equipe.ts rh/ participantes/ membro/ cursos/ oportunidades/ cracha/ escola/
  pdf/                    timbrado, folha, fontes (§7.30)
  analytics/ google/ integracoes/ ia/ apis-publicas/ armazenamento/
  ajuda/                  o texto de ajuda de cada área (§7.15)
scripts/                  conferir-*.ts (um por área, npx tsx) · backup-banco.sh · restaurar-arquivos.sh
supabase/migrations/      o schema, em ordem cronológica (108 arquivos em 28/09/2026)
proxy.ts                  sessão, livro do Financeiro, Área do Voluntário
```

**Os nomes das áreas moram em `lib/navegacao.ts`, não nas rotas.** A tela
`/redes` se chama Publicações, `/impacto` é Resultados, `/correio` é E-mail do
setor, `/cerebro` é Radar de pautas, `/registro` é Histórico, `/equipe` é
Recursos humanos, `/voluntariado` é Voluntários, `/pessoas` é Diretório,
`/mensagens` é Conversas e `/newsletter` é Newsletter. Os endereços antigos
ficaram porque há links gravados em notificações e e-mails. Área nova entra
em `lib/navegacao.ts` — é o que a põe na sidebar, na busca e na aba (§10.3).
Os grupos seguem os setores (Expediente, Redação, Mídia, Público, Gestão,
Pessoas, Escola), cada área tem nome e ícone só dela, e o que é parte de
outra área entra com `dentroDe` (vira aba, com `AbasDaArea`, e não linha).
`npx tsx scripts/conferir-navegacao.ts` confere isso e o que a ajuda diz do
menu. O porquê de cada nome, o benchmark e a reorganização estão em
[`docs/NAVEGACAO.md`](docs/NAVEGACAO.md) (§5).

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
- **Login no servidor** (`entrar`, `app/actions/entrada.ts`): confere o
  bloqueio por tentativas erradas, entra com o cliente do servidor (que grava o
  cookie) e registra o acesso; a tela só recebe "entrou" ou a mensagem.
  `emailDoLogin` (`lib/contas/login.ts`, fora de `'use server'`) traduz e-mail
  confirmado para o usuário; e-mail desconhecido vira um endereço interno
  inexistente e falha igual a senha errada. O e-mail interno nunca vai ao
  navegador: antes ia, e dizia quem tem conta e qual é o usuário dela.
- **Trocar e-mail exige abrir o link no endereço novo** (a pessoa ou o admin
  pedem; nada muda antes) e o endereço antigo recebe aviso. `profiles.email`
  não está no grant de update por coluna: a Data API não troca.
- **Admin**: criação por **convite** (a pessoa define a senha pelo link),
  redefinição e reativação por **link** quando há e-mail confirmado; senha
  temporária na tela continua para quem não tem.
- **Convite pelo WhatsApp e/ou por e-mail** (`mandarConvite` em
  `app/actions/usuarios.ts`, regras em `lib/contas/convite.ts`). O link sai por
  todo canal preenchido; pelo WhatsApp vai pela fila (`categoria 'conta'`,
  silêncio de 22h às 7h, texto apagado depois do envio). O **primeiro acesso
  prova o canal que recebeu o link**, e só ele: a marca fica em
  `tokens_de_conta.email` (sem uso nos links de definir senha) — nula = só
  e-mail (os convites antigos também), `whatsapp:<n>` = só WhatsApp,
  `whatsapp+email:<n>` = os dois. Só e-mail confirma o e-mail; só WhatsApp
  confirma o número (`whatsapp_contas`); pelos dois, nada é confirmado sozinho.
  "Reenviar" lê a marca do último link e usa os mesmos canais. Em
  `/usuarios`, quem nunca entrou tem "Enviar convite de primeiro acesso"
  (`enviarConvite`): o admin escolhe o WhatsApp (sugerido do último convite ou
  do celular pessoal da ficha do RH) e/ou o e-mail salvo no perfil. O link
  nunca volta para a tela do admin — senão deixaria de provar o canal.
- **Cadastro único** (`convidarEmLote`, telas `/pessoas/adicionar` e o quadro
  "Acesso ao Palácio Virtual" da ficha em `/equipe/[id]`): uma ação cria a
  conta, liga ou cria a ficha do RH (`salvar_membro_equipe` pela sessão do
  admin; ficha nova nasce com vínculo "Outro / a definir"; e-mail do domínio
  da instituição vai para o de trabalho, o resto para o pessoal; o WhatsApp
  vira o telefone pessoal se a ficha não tiver) e, se
  pedido, põe o link de completar a ficha (`criarConviteDaFicha` com
  `porWhatsapp: false` e `numeroDoConvite`, para o lembrete) na **mesma
  mensagem** do convite. Falha na ficha não desfaz a conta: o resultado da
  linha diz o que faltou.
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

**Tudo entra leve** (`lib/midia/`; regras puras em `regras.ts`, conferidas por
`npx tsx scripts/conferir-midia.ts`):

- **Foto:** JPEG sRGB, girada pelo EXIF, **sem metadados** (o GPS sai), lado
  maior de **2048 px** — o mesmo teto do envio às redes, que então não
  recomprime. PNG com transparência de verdade continua PNG (sem perda). GIF,
  imagem animada e HEIC que o navegador não abre ficam como estão (HEIC dá
  mensagem). JPEG ou PNG que sairia maior fica como veio. **"Alta qualidade"**
  (caixa na Biblioteca): até 4096 px, e o vídeo vai como veio.
- **Vídeo:** MP4 H.264 + AAC, até 1920 px, 30 fps, ~5 Mbps, só a data nos
  metadados (a localização sai), pela `mediabunny` (WebCodecs), carregada só
  quando o arquivo é vídeo. Sem codificador H.264 no navegador, só troca o
  contêiner; vídeo que passaria de 300 MB nem começa a converter.
- **Onde:** no **navegador**, antes de subir (`preparar.ts`, chamado por
  `enviarParaBiblioteca` — o único caminho do navegador: Biblioteca, hub e
  editor de conteúdo); no **servidor** com o sharp (`otimizar-imagem.ts`) para
  o que não passa pelo navegador — imagens da IA (perfil `arte`: q88, 4:4:4,
  para o texto vermelho não borrar), capas do Cérebro e fotos dos envios — e,
  no `/api/files/register`, como rede de segurança: foto não conferida pelo
  navegador é conferida em qualquer tamanho; conferida, só acima de 1,5 MB
  (12 MB em alta). O servidor grava num caminho novo e apaga o antigo.
- **`files.otimizado_em` / `tamanho_original`:** o que já passou por um
  otimizador (mudando ou não) e o tamanho de antes. Foto com `otimizado_em`
  nulo é candidata do **"Otimizar fotos antigas"** (admin/editor), que regrava
  **no mesmo `storage_path`** — o corpo das matérias guarda
  `/api/private-blob?pathname=…` — sem guardar o original. Por isso "Alta
  qualidade" é sempre marcada no registro: o botão não pode rebaixá-la.
- **Ordem de publicação:** os inserts em `files` gravam as duas colunas; a
  migração (`20260928090000`) tem de estar aplicada antes do deploy — em
  26/09/2026 o código entrou antes e os envios à Biblioteca falharam por 14 min.

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
2. **Página** (`artigo-html.ts` sobre `esqueleto.ts`): o cabeçalho, o rodapé (com as
   políticas e “Preferências de cookies”), o bloco de medição e o chat da home; JSON-LD
   `NewsArticle` + `BreadcrumbList`; `<title>` no padrão
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
onde pararam, e no fim o índice e o sitemap. Pula a matéria editada depois da última
publicação (texto não revisado não vai ao ar sem querer).

**Chat.** As páginas usam a versão (`?v=`) que a home usa, lida da home na hora
(`chat-do-site.ts`); sem ela, saem sem o chat. **Redirecionamentos** 301 de notícias:
`REDIRECIONAMENTOS_DAS_NOTICIAS` em `cache-do-site.ts` (vazio até alguém preencher).

**Medição só com consentimento** (LGPD; Guia de Cookies da ANPD). O bloco de
`blocoDoAnalytics` (`analytics.ts`) é cópia byte a byte do da home (`site/index.html`,
de `<!-- Google tag (gtag.js) -->` a `<!-- End Meta Pixel Code -->`): Consent Mode do
Google negado por padrão, `fbq('consent', 'revoke')` antes do `init`, sem o `<noscript>`
do Pixel, e o gtag.js e o fbevents.js só são baixados quando o cookie
`cvrj_consentimento` (`v=1&e=0|1&m=0|1&t=…`, em `.cruzvermelhariodejaneiro.org`)
permite; o aviso liga a medição na hora da escolha por `window.cvrjMedicao`. A última
linha do bloco é a tag do aviso de cookies (`/consentimento/consentimento.js?v=HASH`,
cache de um ano): a versão é lida da home na mesma leitura do chat
(`prepararChatDoSite`, regex estrita) e, sem ela, o bloco sai sem o aviso — ninguém é
perguntado e só é medido quem já escolheu “sim” em outra página. Mudou o bloco na home,
copie para `analytics.ts` e confira byte a byte. O rodapé tem “Preferências de cookies”
(`data-cvrj-cookies`, que o aviso transforma em abrir as preferências). `temAnalytics`
reconhece o bloco antigo e o novo; o enxerto de Configurações (`ligarAnalyticsDoSite`)
põe o novo, com o aviso, só em página que não tem nenhum — página com o bloco antigo se
atualiza regerando (matérias, acervo, portal), não pelo enxerto.

**Políticas.** Privacidade, termos, cookies e cancelamento e reembolso (em português,
inglês e espanhol) são do repositório do site, que as gera e publica
(`scripts/gerar_politicas.py`, com o texto dos três idiomas em `site/politicas.json`).
O Palácio Virtual não as grava: saíram de “Publicar páginas do site” e da regeração, e
`privacidade`/`termos` saíram da lista de pastas que o FTP aceita na raiz.
`lib/site/juridico.ts` guarda só `DADOS_DA_FILIAL`.

**Sem convite a doar.** A doação online saiu do ar em 25/09/2026 (`/doe/` responde 503
com aviso, no repositório do site). Nada que o Palácio Virtual gera convida a doar: o
“Doe” saiu do cabeçalho, `/doe/` saiu do sitemap e das páginas que a IA pode ligar no
texto, e os formatos de melhoria não pedem mais o convite. Link para `/doacao.html` ou
`/doe/` escrito no texto de uma matéria continua saindo (para `/doe/`, que mostra o
aviso): se não deve ficar, é a matéria que se revisa.

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

**WhatsApp** (§8.5). Depois do e-mail, `notificar()` manda o mesmo aviso ao
WhatsApp de quem confirmou o número em `/perfil#whatsapp` (código de 6
dígitos; `whatsapp_contas`, fora de `profiles` para o celular não ficar
visível a todo o espaço). Sai se a pessoa não pausou, deixou o assunto ligado
(`notificacao_preferencias.whatsapp`, padrão ligado) e não está com o Palácio
aberto; no mesmo link, no máximo uma mensagem a cada 15 min
(`notifications.whatsapp_em`). Aviso com `importante: true` (o desfecho para
quem abriu o chamado: resolvido, "a equipe precisa de você", cancelado pela
equipe) passa por cima dessas duas, não da pausa, do assunto, do silêncio da
noite nem do teto diário. Quem causou o aviso nunca o recebe (`atorId`):
quem resolve o próprio chamado não ganha réplica. Regras em `decidirWhatsapp`
(`lib/whatsapp/regras.ts`). Os avisos de segurança de `avisar()` também vão ao
WhatsApp confirmado, menos se a pessoa pausou.

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
- **Pedir propostas** (`docs/compras-cotacao-automatica.md`): o Financeiro
  convida os fornecedores habituais (quem vende a categoria, em
  `fin_favorecido_categorias`, e quem já cotou compras dela) e cada um recebe
  um e-mail com um link só dele (`/cotacao/<token>`, sem login). A proposta
  entra no mapa por `compras_proposta_do_fornecedor`, que só o servidor chama
  (`/api/publico/cotacao/...`). O token não é legível pelo RLS. A rotina
  diária do Financeiro manda o lembrete da véspera e avisa quando o prazo
  acaba (`rotinaDasCotacoes`).
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
- **Álbum do evento** (`docs/envio-de-acoes.md` §9): `envio_eventos` dá a cada evento um link de
  envio (`/enviar/<codigo>`) e um álbum por link secreto (`/album/<token>`, sem login), com .zip em
  fluxo e "Esconder do álbum". Os arquivos são servidos por `/api/publico/album/...`, que confere o
  token e redireciona para um link assinado curto do R2. Os arquivos chegam com nome canônico
  (`AAAA-MM-DD-assunto-autor-NNN.ext`, `nomeCanonico`) e o celular manda uma miniatura de 640 px.
- **Cartaz do link** (`/envios/cartaz`): 4 formatos (A4, story, feed, quadrado), 3 modelos
  (Clássico, Destaque, Faixa), 4 chamadas e o nome da ação opcional, tudo na URL
  (`lib/envios/cartaz.ts`). O desenho é um só (`components/envios/cartaz.tsx`, só flexbox e estilo
  inline): a página mostra e imprime o A4, e `/api/envios/cartaz` gera o PNG com o `next/og`
  (fontes de `lib/pdf/fontes`, em `outputFileTracingIncludes`). Sempre com o nome completo da
  filial. Conferência: `npx tsx scripts/conferir-cartaz.ts`.

### 7.15 Ajuda (boas-vindas, tours, painel e Central)

Pesquisa, decisões, funcionamento do tour, guia de estilo e como manter:
[`docs/AJUDA.md`](docs/AJUDA.md).

- **Conteúdo:** texto e dado puro, em `lib/ajuda/conteudo/<grupo>.ts` (um
  arquivo por grupo do menu; 40 áreas) e em `lib/ajuda/membro.ts` (Área do
  Voluntário), no formato de `lib/ajuda/tipos.ts`. A chave de cada guia é o
  `href` da área em `lib/navegacao.ts`, então a ajuda some junto com a área
  para quem não pode abri-la. O mesmo conteúdo serve ao painel “?” (botão no
  topo e tecla `?`), à Central (área "Ajuda", `/ajuda`, no menu da conta — no
  celular, na gaveta do menu —, com âncora em cada tarefa e pergunta) e à
  busca ⌘K (`buscarNaAjuda`).
- **O texto não vai em toda página.** Com as 40 áreas, ele pesa cerca de
  145 KB comprimidos; no pacote de cada página, custava isso a todo mundo,
  mesmo a quem nunca abre a ajuda. Toda página leva só o índice leve
  (`lib/ajuda/indice.ts`: que área tem guia, que tela tem tour e o nome
  dela), montado no servidor por `indiceDaAjuda()` e passado como prop pelo
  layout de `(app)`. O texto
  vem por `carregarAjuda()` (`components/app/ajuda/carregar.ts`) quando
  alguém abre o painel (o miolo, `painel-conteudo.tsx`, vem junto), começa um
  tour ou busca uma dúvida. As páginas da Central são desenhadas no servidor.
  "Que tela é esta" é `ondeNaAjuda()`, no índice; `ajudaDoCaminho()` usa as
  mesmas regras. **Não importe valor de `@/lib/ajuda` em componente do
  cliente que vai em toda página** (`import type` pode), nem `lib/ajuda` a
  partir de `indice.ts`; e o que uma página da Central usa no navegador mora
  num arquivo sem `lib/ajuda` — o Turbopack liga a referência do cliente ao
  arquivo inteiro (daí `components/app/ajuda/ancora.tsx`). Nada disso dá erro
  de compilação: o pacote só engorda. Detalhes em `docs/AJUDA.md` §5.
- **Tour** (`components/ajuda/tour.tsx`): aponta para os elementos marcados
  com `data-ajuda="<área>.<coisa>"`. Sem o alvo na tela, o balão vai ao
  centro, ou o passo some (`seAusente: 'pular'`). Abaixo de 640 px, vira uma
  folha presa à borda. É um diálogo modal: foco preso, Esc fecha, as setas
  andam. O tour das boas-vindas usa o mesmo motor; o de cada tela é
  oferecido numa dica na primeira visita, e não aberto à força. A dica e o
  link `?tour=1` (o “Fazer o tour” da Central) esperam o esqueleto do
  `loading.tsx` (`data-carregando`) sair: aberto sobre ele, o tour perderia
  os passos. `loading.tsx` novo marca o esqueleto do mesmo jeito.
- **Tecla `?`:** abre e fecha o painel, menos dentro de campo de texto.
  Atalho de uma tecla precisa poder ser desligado (WCAG 2.1.4): a caixa
  “Abrir a ajuda com a tecla ?” fica na Central, no cartão “Atalhos de
  teclado”, e a escolha vale para a conta. O botão “?” continua valendo.
- **Progresso:** o que a pessoa já viu (e a tecla `?` desligada) fica em
  `user_metadata.ajuda` do Supabase Auth (`lib/ajuda/progresso.ts`), sem
  tabela e sem migração. É estado de interface e **não decide acesso**,
  porque a própria pessoa pode editar o metadata. Quem grava é
  `registrarAjuda()` (`app/actions/ajuda.ts`), que foge de propósito das
  convenções do §9:
  - grava pelo cliente admin, `auth.admin.updateUserById()` no id que
    `obterWorkspace()` acabou de conferir (nunca um id vindo do navegador).
    O `auth.updateUser()` da própria pessoa regravaria o cookie da sessão, e
    cookie gravado numa action faz o Next refazer o layout e a página abertos
    — a cada “Agora não” e a cada fim de tour. O Auth mescla o metadata chave
    a chave: só `ajuda` muda;
  - confere a sessão com `obterWorkspace({ escola: true })`, e não com
    `requireWorkspace()`, e não chama `revalidatePath()`: roda por trás,
    depois de a tela já ter mudado, e um redirecionamento ali (sessão
    vencida, senha provisória) perderia o que a pessoa estava digitando. Sem
    sessão válida, não grava; nunca lança.

  Só aceita chave de tour que existe (`ehChaveDeTour`) e guarda no máximo
  120, porque o metadata vai no token de toda requisição. “Rever as
  boas-vindas” fica no pé do painel “?” e na Central; “Recomeçar as
  boas-vindas e os tours”, só na Central (não religa a tecla `?`).
- **Área do Voluntário** (`components/membro/ajuda.tsx`): sem conta no Auth,
  o progresso fica no `localStorage`, na chave `cvrj-membro-ajuda`, que sair
  da área apaga (aparelho compartilhado); a prévia da equipe
  (`/membro/previa`) não grava. No lugar da janela, um convite de
  boas-vindas no Início; o tour de cada tela é pedido em “Tour desta tela”,
  no menu da conta (não há dica por tela nem tecla `?`); e a página
  `/membro/ajuda` fica no menu da conta e no fim do Início. O texto
  (`lib/ajuda/membro.ts`) também só é baixado quando um tour começa.
- **Conferência:** `npx tsx scripts/conferir-ajuda.ts` acusa alvo citado
  sem `data-ajuda` no código, id repetido, tela fora da área e tarefa geral
  que manda a equipe da escola ao “Criar” ou a um chamado sem o selo
  “Equipe da Redação”, e avisa sobre área sem ajuda. Tela nova ou que mudou
  atualiza a ajuda no mesmo PR (§10.3). Todo guia tem um “Na prática” (uma
  história de uso, com nomes e datas) e as tarefas trazem `exemplo`
  (`docs/AJUDA.md` §9).
- **Beta com a equipe** (`docs/AJUDA.md` §10): o botão “Beta” no topo (no
  celular, dentro do painel “?”), “O que achou desta tela?” (nota 1–5),
  “Isso ajudou?” em cada pergunta e “Pergunte à equipe” gravam em
  `ajuda_retornos` (migração `20260929010000`), com a tela e o aparelho
  (largura, navegador, sistema). RLS: cada um vê os próprios; o
  administrador vê todos em `/ajuda/retornos` (resumo por tela, respostas
  que não ajudaram, CSV em `/api/ajuda/retornos`) e responde por
  `ajuda_responder_retorno()` — a resposta vai ao sino de quem mandou e
  aparece em “Seus retornos do beta” na Central. As “Perguntas mais
  frequentes” da Central somam os votos (`ajuda_votos_das_perguntas()`, só
  contagens) e completam com `MAIS_PERGUNTADAS`. Regras puras em
  `lib/ajuda/retornos.ts` (`scripts/conferir-retornos.ts`).

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
- **Também pelo `/enviar`.** A etapa "Imagem" mostra o termo, e a tela de "Recebemos!" gera o link
  do envio (`imagem_coletas.envio_id`, um por envio, `file_ids` vazio): as fotos vêm de
  `envio_arquivos` (R2, link assinado de 5 min). Várias pessoas podem assinar no mesmo celular: o
  comprovante vai para o WhatsApp de cada uma e "Outra pessoa vai assinar" troca a página com
  `router.replace` (o comprovante anterior, com a chave de revogação, não fica no histórico).
- **Regras puras** em `lib/imagem/regras.ts` (validação, traços, aparelho, código `IMG-XXXX-XXXX`,
  documento canônico). O termo é **minuta** — revisão do Jurídico pendente.

### 7.18 Direct das redes (`/direct`)

A antiga Caixa de entrada (`/caixa-de-entrada` redireciona para cá, desde 26/09/2026). Só redes
sociais: e-mail fica em "E-mail do setor" (`/correio`), o que a equipe manda em "Envios da equipe".

- **Mensagens e comentários vêm do conector** (Upload-Post, `lib/atendimento/conector.ts`) a cada
  abertura, pela action `carregarFila`. Nada disso é guardado no banco.
- **A situação é da equipe:** `direct_atendimentos` guarda, por item (`chave` = id do
  normalizador), quem respondeu por aqui ou marcou "Não precisa responder". A regra
  (pendente / respondida / resolvida / em dia; mensagem nova do público reabre a conversa) está em
  `lib/atendimento/situacao.ts`, conferida por `npx tsx scripts/conferir-direct.ts`. Escrita só
  pelas actions de `app/actions/atendimento.ts` (RLS sem escrita direta).
- **Mídia no Direct:** o endpoint de conversas do Upload-Post devolve só o campo `message`. Foto,
  áudio, vídeo e figurinha chegam vazios e aparecem como "Foto, vídeo, áudio ou figurinha", com
  "Abrir no Instagram". Se o conector passar a mandar `attachments`, `normalizar.ts` já lê a imagem.
- A pasta "E-mail e materiais" (`inbox_items`) saiu: nenhum código gravava nela e a tabela estava
  vazia. A tabela continua no banco (migração só acrescenta).

### 7.19 Ofícios: quem assina e o selo digital (`/oficios`, `/verificar/[codigo]`)

- **Quem assina assina com o cadastro da Equipe.** Na emissão, `emitir_oficio` copia de
  `equipe_membros` (pelo `user_id`, não desligado) o nome completo, o **CPF mascarado**, o cargo
  (o da tela vale mais) e o setor para `oficio_assinantes`; o canônico e o manifesto levam `cpf`
  e `setor`. Sem nome e CPF na Equipe, a emissão recusa dizendo quem falta completar, e o
  seletor mostra a pessoa como “falta nome e CPF na Equipe”. Folha, PDF e página de conferência
  mostram nome, CPF, cargo · setor. Ofícios emitidos antes (sem `cpf`) continuam iguais.
- **Selo digital da filial** (`lib/oficios/selo.ts`, tabela `oficio_selos`, um por ofício,
  imutável): quando o ofício termina de ser assinado, um texto legível com número, código de
  verificação e os dois SHA-256 é assinado com a **chave Ed25519 da filial** — a mesma da trilha
  pública (`lib/auditoria/chave.ts`, no cofre; pública em `/verificar/chave-publica.pem` do
  site). O Bitcoin prova *quando*; o selo prova *quem*. Sela no fim da assinatura (action e
  rota do gov.br), na primeira abertura do ofício e no agendador (`/api/oficios/carimbos`,
  `selarPendentes`). A página pública confere o selo a cada abertura e oferece `.txt`, `.sig` e
  `.pem` (`/api/verificar/[codigo]/selo`) para conferir com
  `openssl pkeyutl -verify -pubin -inkey … -rawin -in selo.txt -sigfile selo.sig`.
- **Selo visual** (`components/app/oficios/selo-visual.tsx`, SVG): carimbo redondo com a cruz,
  número, data e impressão digital da chave, com QR code da conferência; riscado se não
  conferir. Aparece no rodapé da folha na conferência (que é a versão para imprimir) e na
  tela interna.

### 7.20 Foto do voluntário (`/membro/perfil`, `/voluntariado/[id]`)

- `participantes.foto_path` (Blob privado, `voluntarios/<espaço>/<participante>/<uuid>.jpg`).
  O navegador recorta ao centro e reduz para 512×512 JPEG antes de subir
  (`lib/membro/preparar-foto.ts`); o servidor confere pelo conteúdo, tira EXIF/XMP/IPTC e aceita
  até 600 KB (`lib/membro/foto.ts`, `foto-servidor.ts`).
- O voluntário troca pela própria sessão (`/api/membro/foto`, RPC `membro_definir_foto`, só
  service role); a equipe vê com nível ≥ 1 e troca com ≥ 2 (`/api/voluntariado/[id]/foto`, RPC
  `definir_foto_participante`). Anonimizar ou recusar o cadastro apaga a foto.

### 7.21 Início modular (`/dashboard`)

- O Início é uma lista de blocos (`lib/inicio/blocos.ts`): abertura, esperando você, minhas pautas,
  projetos, hoje na comunicação, tempo no Rio, a equipe agora, a semana, os indicadores e todas as
  áreas. Cada bloco tem uma largura natural: toda a largura, coluna larga ou coluna estreita. Largos
  e estreitos em sequência formam as duas colunas do "Meu dia" (`faixas()`).
- Cada pessoa escolhe o que aparece e em que ordem ("Personalizar o Início"), guardado em
  `inicio_preferencias` (uma linha por pessoa e espaço, RLS só da própria). Sem linha, vale a
  `ORDEM_PADRAO`. Um bloco que surgir depois entra visível, ao lado do vizinho na ordem padrão.
- Bloco escondido não é consultado: a página só busca no banco o que vai mostrar.
- Bloco novo: acrescente em `BLOCOS` e `ORDEM_PADRAO` e em `BLOCO` na página, e marque a busca dele
  com `mostra('<id>')`.

### 7.22 Oportunidades que pedem resposta: aviso, enquete, quiz e perguntas (`/voluntariado/oportunidades`, `/membro/oportunidades/[id]`)

- **Tipos de resposta** (`aviso`, `enquete`, `quiz`; `ehDeResposta()` em `lib/oportunidades/regras.ts`):
  - não têm inscrição, vagas nem horas;
  - `inicio` é quando abre e `fim` é o prazo para responder;
  - ficam fora da agenda da equipe e das seções de inscrição do voluntário;
  - aparecem em "Para você responder" e no Início do voluntário.
- **Perguntas** (`oportunidade_perguntas`) valem em qualquer oportunidade. Numa ação, as respostas vão
  com a inscrição (`inscrever(id, respostas)` grava as respostas antes de inscrever).
  - Tipos de pergunta: escolha única, várias escolhas, sim/não e resposta curta.
  - A equipe só grava pela função `salvar_perguntas_oportunidade`, que troca a lista inteira.
  - Depois da primeira resposta, a função recusa mudar as perguntas, e um gatilho recusa mudar o tipo.
- **Respostas** (`oportunidade_respostas`, uma por pessoa):
  - só por `membro_responder_oportunidade` (service_role), que confere prazo, obrigatórias e opções e
    grava a versão limpa;
  - enquete e perguntas de ação: responder de novo troca a resposta, até o prazo;
  - quiz: corrige na hora; só acerta quem marca exatamente as certas; até 3 tentativas; aprovado, fica;
  - o gabarito (`corretas`) nunca vai ao navegador do voluntário.
- A equipe (nível ≥ 1) lê perguntas e respostas pelo RLS. A página da oportunidade mostra:
  - o resumo por pergunta e a resposta de cada pessoa;
  - no aviso, quantos confirmaram de quantos voluntários ativos;
  - a planilha em `/api/voluntariado/oportunidades/[id]/respostas`, com nível ≥ 2.
- Regras puras e estatística: `lib/oportunidades/perguntas.ts`, conferidas por
  `npx tsx scripts/conferir-perguntas.ts`.

### 7.23 Identidade: crachá virtual, certificado e diploma oficiais (`/perfil`, `/membro/perfil`, `/cracha/[codigo]`, `/diploma/[codigo]`)

Base: o Manual de Identidade Institucional da CVB. O estudo e a lista do que dá
para incrementar estão em [`docs/IDENTIDADE.md`](docs/IDENTIDADE.md). **Os contatos
do manual estão desatualizados**: os dados da filial vêm de `DADOS_DA_FILIAL`.

- **Crachá** (`lib/cracha/`). De onde vêm os dados:
  - a ficha do RH (`equipe_membros`, faixa "COLABORADOR");
  - senão, o cadastro de voluntário ligado à conta (`participantes`, "COLABORADOR VOLUNTÁRIO");
  - senão, o perfil.

  O voluntário da Área usa o próprio cadastro.
- **QR do crachá.** Leva a `/cracha/<código>`. O código é o id com HMAC
  (`CRACHA_SEGREDO`; na falta, derivado da chave de serviço). Não há tabela: o
  QR vale enquanto a pessoa estiver ativa. A página mostra nome, função, vínculo
  e foto (`/cracha/<código>/foto`, só de quem está ativo), nunca CPF, saúde ou
  contato.
- **Fator RH.** Só no crachá da própria pessoa, pela função
  `cracha_fator_rh()` (service_role, migração `20260929030000`).
- **PDFs.** O crachá sai em `/api/cracha/pdf` (equipe) e `/membro/cracha/pdf`
  (voluntário). O certificado continua em `/membro/certificados/[codigo]/pdf`,
  agora no modelo oficial.
- **Fontes.** Ficam em `lib/pdf/fontes/` (SIL OFL) e são lidas do disco. Cada
  rota que as usa precisa estar em `outputFileTracingIncludes`
  (`next.config.mjs`).
- **Ficha do RH incompleta.** Sem cargo ou setor na ficha, o crachá e a
  verificação completam com o cargo do perfil e a coordenação da conta.
- **Página de verificação.** Feita para a portaria, no celular: resultado grande
  e colorido (válido, inativo, não reconhecido), relógio correndo (um print fica
  parado), foto, nome na faixa vermelha e o contato da filial.
- **Foto do crachá do voluntário** (migração `20260929050000`). Só vale a foto
  que o Voluntariado aprovou (`participantes.foto_cracha_path` igual a `foto_path`).
  - Foto trocada pela Área do Voluntário volta a aguardar e avisa quem gerencia
    o Voluntariado.
  - `avaliar_foto_do_cracha` aprova ou recusa (com motivo, que vai por e-mail),
    e recebe o caminho da foto avaliada: se ela mudou no meio, recusa.
  - A foto posta pela equipe em "Editar cadastro" já sai aprovada.
  - A fila fica na aba "Fotos do crachá" de `/voluntariado`. O crachá de
    voluntário não usa mais a foto de perfil da conta.
- **Diploma de Reconhecimento** (migração `20260929040000`, tabela `diplomas`).
  - Sai sozinho aos 100, 500 e 1.000 horas: um gatilho em `participante_horas`
    chama `private.emitir_diplomas_de_horas()`, que é idempotente.
  - A coordenação concede (`conceder_diploma`, nível 2 de participantes) e
    cancela (`revogar_diploma`).
  - O PDF (A3, `lib/cursos/diploma-pdf.ts`) sai em `/membro/diplomas/[codigo]/pdf`
    e `/api/voluntariado/diplomas/[codigo]/pdf`.
  - A verificação pública fica em `/diploma/[codigo]`.
  - **Área de Diplomas** (`/voluntariado/diplomas`): todos os diplomas da filial num lugar só.
    Emite o mesmo reconhecimento para até 100 voluntários de uma vez (`concederDiplomas`, que chama
    `conceder_diploma` por pessoa), mostra quem está a menos de 20% do próximo marco e baixa até 60
    diplomas num PDF só (`/api/voluntariado/diplomas/lote?codigos=…`, uma página A3 por diploma).
    Regras em `lib/participantes/diplomas.ts`; o texto impresso em `lib/cursos/diploma-texto.ts`.
    Conferência: `npx tsx scripts/conferir-diplomas.ts`.
  - **Quem assina** (migração `20260929150000`, `lib/cursos/assinaturas.ts`): até três assinaturas
    lado a lado (presidência e, se a filial quiser, vice-presidência e coordenação do Voluntariado),
    escolhidas em "Quem assina" na área de Diplomas (nível ≥ 2). Cada diploma novo guarda a lista do
    dia (`diplomas.assinaturas`): se a diretoria mudar, os antigos não mudam. Os emitidos antes da
    opção existir têm `assinaturas` nulo e seguem a lista atual (`assinaturasDoDiploma`). A
    verificação (código e QR) ficou menor, no rodapé, para caber as três.
- **Conferência.** `npx tsx scripts/conferir-cracha.ts [pasta]` testa as regras
  e, com pasta, grava exemplos em PDF (crachá, certificado e diploma).

### 7.24 Portaria virtual (`/portaria`, `/visitante`)

O livro de visitantes da filial (migração `20260929060000`, `lib/portaria/`).

- **Quem usa.** Todo membro do Palácio, menos a equipe da Escola:
  `private.pode_portaria`, que o RLS e todas as funções `portaria_*` conferem.
  Só administradores trocam o link do QR (`portaria_novo_link`).
- **Dados.** Sem documento: nome, telefone, de onde vem, quem visita (a pessoa
  do Palácio, que é avisada, e/ou texto livre), o motivo, a foto e o nº do
  crachá de visitante. `portaria_visitas.ip_hash` fica fora do `grant select`:
  liste as colunas (`COLUNAS_DA_VISITA`), nunca `select('*')`.
- **Autocadastro.** O QR do cartaz leva a `/visitante?t=<segredo>`
  (`portaria_config.token`). `app/api/visitante` confere:
  - o segredo;
  - a armadilha para robôs;
  - o tempo mínimo de preenchimento.

  `portaria_autocadastro` (só `service_role`) limita a 6 por hora por origem.
  A visita entra "aguardando" até a portaria confirmar ou descartar.
- **Foto.** Blob privado `portaria/<ws>/<visita>/<uuid>.jpg`, servida por
  `/api/portaria/[id]/foto` com a sessão.
- **Aviso.** Quem é visitado recebe um aviso na categoria `portaria`
  (`avisarVisitado`), `importante` (sai no WhatsApp mesmo com o Palácio aberto e
  à noite). O aviso sai também quando quem registrou é a própria pessoa visitada:
  `notificar()` nunca avisa o autor, então nesse caso o aviso vai sem `atorId`.
- **Resposta de quem é visitado** (migração `20260929160000`). Três respostas,
  `subir` (pode subir e aguardar no hall), `aguardar` (na recepção) e `recusar`
  (não pode receber agora), com recado opcional (até 280 caracteres), que podem
  mudar enquanto a visita está dentro:
  - pelo Palácio, em `/portaria/visita/[id]` (o link do aviso), pela função
    `portaria_responder` (quem é visitado ou a portaria, que registra o que
    chegou por telefone pelo botão "Resposta" da lista);
  - pelo WhatsApp, respondendo a mensagem do aviso com 1, 2 ou 3
    (`alvoDoLink` reconhece `/portaria/visita/<id>`), pela função
    `portaria_responder_whatsapp` (só `service_role`, confere que quem responde é
    o visitado). Sem citar a mensagem, só vale resposta clara
    (`respostaClaraDaVisita`) e só se houver uma única visita esperando a pessoa
    nas últimas 2 h (`visitaEsperandoResposta`). Vale mesmo com a verificação em
    duas etapas: é resposta a uma pergunta, não uma ação sobre dados.
  - Depois de responder (`aposResposta`), quem registrou e quem confirmou a
    entrada recebem o aviso com o recado, e o visitante recebe a situação no
    WhatsApp **só se autorizou** (`avisar_visitante`, marcado por ele no QR ou
    pela portaria depois de perguntar, e só com telefone). A mensagem ao
    visitante nunca leva o recado: ele é para a portaria.
  - A lista "Na filial agora" mostra a situação ao lado de cada visitante e se
    atualiza sozinha.
- **Crachá.** O crachá de visitante devolvido é marcado na saída ou depois
  (`portaria_devolver_cracha`). Quem entrou em outro dia e segue "dentro"
  aparece com alerta. Os crachás para imprimir (`/portaria/crachas`) saem deitados (86 × 54 mm,
  10 por A4, para o porta-crachá horizontal) ou em pé (54 × 86 mm, 9 por A4):
  `FORMATOS_DE_CRACHA` em `lib/portaria/regras.ts`.
- **Conferência.** `npx tsx scripts/conferir-portaria.ts`.

### 7.25 Escola: Marketing por curso (`/escola/marketing/cursos`)

Cada curso com os alunos da Únicopag e o que o marketing fez para ele
(migração `20260929070000`, `lib/escola/cursos.ts`).

- **Submenu.** O Marketing da escola tem um submenu (`SubmenuDoMarketing`):
  Cursos, Campanhas, Advertoriais e Biblioteca de peças. "Advertoriais" saiu
  das seções do topo da Escola.
- **Catálogo.** `escola_cursos` guarda nome, página do curso e se está ativo.
  A migração já cria os 7 cursos que apareciam nas vendas.
- **Campanhas e peças.** A campanha é do curso pelo nome
  (`escola_campanhas.curso`, com sugestões do catálogo), e a peça é do curso
  pela campanha. Renomear o curso renomeia as campanhas dele
  (`escola_curso_salvar`).
- **Produto da Únicopag → curso.** É uma regra pura (`destinoDoProduto`):
  - "Taxa de inscrição — X" e "X — Inscrição" contam para X;
  - produto de teste fica de fora;
  - o resto ("Curso", "Matrícula") a equipe associa ou ignora
    (`escola_produtos`, `escola_produto_classificar`).
- **Alunos sem dado pessoal.** `escola_compras_por_produto` devolve as compras
  agregadas por produto e pessoa, e a pessoa é um código (sha-256 com o espaço
  como sal). O Marketing vê alunos e interessados sem ver nome, CPF nem o
  financeiro da Escola.
  - Aluno = pessoa distinta que pagou algum produto do curso.
  - Interessado = tentou e não pagou nada do curso.
- **Onde pôr esforço.** `sinalDoCurso` escreve uma frase por curso:
  - remarketing, quando há 10 ou mais interessados, ou 3 ou mais com conversão abaixo de 50%;
  - curso parado, sem alunos nem nada criado;
  - curso que vende sem campanha no ar.
- **Conferência.** `npx tsx scripts/conferir-cursos-escola.ts`, com os nomes de
  produto reais.

### 7.26 Configurações (`/configuracoes`)

Uma tela por assunto, com o submenu (`SubmenuDasConfiguracoes`) no layout de
`app/(app)/configuracoes/`:

- **Visão geral** (`/configuracoes`): a conta da pessoa, os atalhos para o
  ajuste de cada área e, para administradores, a situação de cada seção do
  espaço.
- **E-mail dos setores** (`/configuracoes/email`): a conta Google, quem
  envia por cada setor e os endereços. Os redirecionamentos do Google
  (`/api/google/conectar` e `/api/google/retorno`) voltam para cá.
- **Integrações** (`/configuracoes/integracoes`): as chaves do cofre, o
  botão das redes (Upload-Post, que volta para cá) e o estado das chaves
  que ficam na Vercel (só ligada ou desligada, nunca o valor).
- **Site** (`/configuracoes/site`) e **Zona de risco**
  (`/configuracoes/zona-de-risco`).

Os ajustes de cada área continuam dentro da área (`/chamados/configurar`,
`/financeiro/cadastros`, `/patrimonio/cadastros`, `/escola/configuracoes`).
A lista de setores (criar, renomear, desativar) é a de `/pessoas/setores`.
As subpáginas chamam `exigirAdministracao()` (`lib/configuracoes/servidor.ts`),
que manda quem não é administrador para a visão geral. As ações revalidam com
`revalidatePath('/configuracoes', 'layout')`, que alcança todas as subpáginas.

### 7.27 Patrimônio: fotos do bem (`pat_bem_fotos`)

Até 12 fotos por bem, em `patrimonio/<workspace>/<bem>/<id>.jpg` no Blob
privado. O navegador reduz para até 1600 px no lado maior, sem recorte
(`lib/patrimonio/preparar-foto.ts`). A rota `POST /api/patrimonio/fotos`
confere o arquivo (`conferirFotoDoBem`: JPEG de 200 a 1600 px, sem EXIF),
grava no Blob e registra com `patrimonio_foto_adicionar`. Se o banco recusar,
o arquivo sai do Blob.

`GET` e `DELETE /api/patrimonio/fotos/[id]` servem e apagam a foto. A capa é
a primeira pela `ordem`; `patrimonio_foto_capa` põe uma foto na frente.

- Ver as fotos: quem vê o bem.
- Pôr e apagar: nível "Operar".
- Bem baixado não muda.

No cadastro de um bem novo, as fotos escolhidas sobem logo depois que o banco
devolve o id. Conferência: `npx tsx scripts/conferir-fotos-do-patrimonio.ts`.

### 7.28 Financeiro: um endereço por livro (`/financeiro`, `/escola/financeiro`)

A filial e a Escola são empresas à parte (`fin_entidades`), cada uma com CNPJ,
contas, lançamentos, conciliação e fechamento próprios. O livro aberto vem do
endereço, nunca de um cookie:

- `/financeiro/...` → livros da filial;
- `/escola/financeiro/...` → livros da Escola.

O `proxy.ts` reescreve `/escola/financeiro/x` para as mesmas telas de
`/financeiro/x` e grava o livro no cabeçalho `x-cvrj-livro-financeiro`. O
proxy sempre sobrescreve esse cabeçalho, e fora do Financeiro o apaga.
`contextoDoFinanceiro()` (com `cache`) lê o livro e escolhe a empresa. As
server actions fazem POST para o endereço da tela e herdam o mesmo livro.

Nas rotas de API, o livro vem em `?livro=` (o pacote do contador) e o proxy
confere do mesmo jeito.

- **Links**: o código escreve `/financeiro/...` e passa por `noLivro(livro, …)`
  (`lib/financeiro/livro.ts`); no cliente, `useNoLivro()`
  (`components/app/financeiro/livro.tsx`, com o provedor no layout).
- **Endereço antigo**: um lançamento ou pedido aberto pelo endereço do outro
  livro (link antigo, aviso, calendário) redireciona para o livro da empresa
  dele.
- **Tela**: o layout mostra a `FaixaDoLivro` (vermelha na filial, azul na
  Escola, com nome e CNPJ) e, na Escola, as seções da Escola no alto.
- **Equipe da escola**: nunca abre os livros da filial.
- **Por quê**: antes o cookie `fin_empresa` guardava a empresa aberta, e duas
  abas trocavam os livros uma da outra sem aviso.
- **Conferência**: `npx tsx scripts/conferir-livros-do-financeiro.ts`.

### 7.29 E-mail do setor: caixa de entrada (`/correio`)

`/correio` funciona como um cliente de e-mail: caixas e pastas (entrada,
enviados, todas), lista de conversas, leitura, responder, responder a todos,
encaminhar, não lida e arquivar. O "Registro do Palácio" (`emails_enviados`)
continua sendo o registro do que saiu por aqui, com quem enviou.

Tudo é lido do Gmail na hora (`lib/correio/caixa-de-entrada.ts`); o conteúdo
dos e-mails não fica no banco.

**Permissão.** Exige o escopo `gmail.modify`: ler e mexer em rótulos, nunca
apagar de vez. Uma conexão feita antes dele continua enviando; a tela mostra
o aviso `semLeitura` até um administrador reconectar.

**Quem vê o quê** (`lib/correio/leitura.ts`):
- As caixas visíveis são as mesmas por onde a pessoa pode enviar
  (`caixasQuePodeUsar`).
- A busca no Gmail sai presa ao endereço (`consultaDaPasta`). O texto da
  pessoa entra limpo, sem parênteses, chaves, aspas ou OR/AND
  (`limparBusca`), e sempre em AND.
- Cada mensagem ainda passa por `envolveOEndereco` (De, Para, Cc,
  Delivered-To) antes de aparecer, ao abrir uma conversa, nas ações e no
  anexo. Um id de conversa de outro setor abre vazio.

**Leitura na tela.** O e-mail aparece num `iframe` sandbox sem script, e
`documentoDeLeitura` ainda tira scripts, `on*` e `javascript:`, põe uma CSP
e troca `cid:` pelo endereço do anexo.

**Anexos.** `/api/correio/anexo` acha o anexo pelo `partId` (o id de anexo
do Gmail muda a cada leitura). Só imagem comum e PDF abrem no navegador; o
resto baixa.

**Respostas.** Saem com `threadId`, `In-Reply-To` e `References`, e a
original vai citada depois da assinatura (`comCitacao`).

**Testes.** `npx tsx scripts/conferir-caixa-de-entrada.ts`. Fora de produção,
`GOOGLE_API_TESTE` aponta as chamadas do Google para um servidor de teste.

### 7.30 Papel timbrado (`lib/pdf/timbrado.ts`)

O modelo da p. 24 do Manual de Identidade Institucional, desenhado por
`desenharTimbrado()`:
- **No alto:** a cruz da logo, o setor que emite centrado logo abaixo (Franklin
  Demi Cond 18) e, à direita, "Reconhecida como Utilidade Pública Internacional -
  Decreto nº 9.620, de 13/06/1912".
- **No pé:** o nome nas três línguas, o CNPJ, o endereço, o telefone e o e-mail da
  filial (`linhasDoRodape`, de `DADOS_DA_FILIAL`, porque os contatos do manual
  estão desatualizados).
- **Margens de 14 mm.** A cruz em marca d'água saiu: não está no modelo.

Onde é usado:
- **Ofício:** o PDF e a folha na tela. O hash, o endereço de conferência e o
  número da página ficam logo acima do rodapé da filial.
- **Folhas de `lib/pdf/folha.ts`:** o recibo e o termo de entrega de doação
  (Patrimônio), a ordem de compra e o relatório de compras e contratações
  (Compras).

As fontes entram com nome fixo (`customName` em `lib/pdf/fontes.ts`): o mesmo
ofício continua gerando o mesmo arquivo, byte a byte, e o hash não muda.
Conferência: `npx tsx scripts/conferir-timbrado.ts`.

### 7.31 Resultados: o site pelo Google Analytics (`/impacto`, "O site")

A propriedade GA4 do site (`ID_DA_PROPRIEDADE`, em `lib/site/analytics.ts`) é
lida pela Data API com uma conta de serviço só de leitura
(`lib/analytics/servidor.ts`, regras puras em `lib/analytics/relatorio.ts`).

- **O que mostra:**
  - pessoas, visitas, páginas vistas e tempo de leitura, contra o período anterior;
  - pessoas por dia, com tabela;
  - origens, aparelhos e cidades;
  - páginas mais vistas, com link para a pauta quando a matéria saiu pelo Palácio.
- **Período:** 7, 28 ou 90 dias, até ontem.
- **Cache:** uma leitura por período a cada 30 minutos, em memória. Os números mudam
  devagar, e a cota da API é por projeto.
- **Chave:** a chave JSON da conta de serviço é colada em Configurações →
  Integrações. O cofre guarda só o e-mail da conta e a chave privada.
- **Mensagens na tela:** sem a chave, a seção mostra o passo a passo; com a chave
  e sem acesso à propriedade, o aviso diz o e-mail a autorizar.
- **Conferência:** `npx tsx scripts/conferir-analytics.ts`.

### 7.32 Princípios Fundamentais na Área do Voluntário (`/membro/principios`)

Os sete Princípios do Movimento (texto oficial, Manual p. 52) ficam num bloco
fixo no fim do Início da Área e na página própria, também no menu da conta. A
página traz a regra do emblema no perfil pessoal (p. 48, regra 9). O texto está
em `lib/membro/principios.ts`; o componente, em `components/membro/principios.tsx`.

### 7.33 Página não encontrada

As telas chamam `notFound()` para registro apagado, fora do acesso ou link
antigo:
- dentro do Palácio, isso cai em `app/(app)/not-found.tsx`, com o menu e o
  caminho de volta (Início e Central de ajuda);
- endereço sem rota nenhuma cai em `app/not-found.tsx`, que também serve a quem
  não entrou (visitante, voluntário, fornecedor), com as duas portas: o Palácio e
  a Área do Voluntário;
- a Área do Voluntário e a Ajuda têm as suas (`app/membro/(area)/not-found.tsx`,
  `app/(app)/ajuda/[...area]/not-found.tsx`).

Sem esses arquivos, o Next mostra o 404 padrão, em inglês e sem saída.

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

### 8.5 WhatsApp (Evolution API)

O número do Palácio no WhatsApp, por uma [Evolution API](https://github.com/EvolutionAPI/evolution-api)
(v2, Baileys) hospedada pela filial. Configuração no cofre (cartão “WhatsApp (Evolution API)”:
endereço, instância e chave); conexão, recebimento e teste em `/configuracoes/whatsapp` (só admin).

- **Código:** `lib/whatsapp/regras.ts` (puro: número canônico, textos, leitura do webhook, comandos
  do bot — `npx tsx scripts/conferir-whatsapp.ts`), `servidor.ts` (cliente da Evolution, nunca
  lança, tira chave e URL do texto de erro), `bot.ts` (respostas), `app/actions/whatsapp.ts` e
  `app/api/webhooks/whatsapp`.
- **Contrato conferido no código da v2.3.7** (a documentação nova erra o `/webhook/set`): cabeçalho
  `apikey` (a global ou o token da instância; só `/instance/create` exige a global); corpo do
  `/webhook/set` **aninhado** em `webhook` e com `events` sempre (sem ele, a Evolution quebra);
  o texto recebido vem em `message.conversation`; com endereço anônimo (`@lid`), o número vem em
  `remoteJidAlt`.
- **Tempo do envio:** logo depois de conectar pelo QR code, a Evolution sincroniza o histórico e
  cada envio pode passar de 15 s. O envio espera até 40 s; sem confirmação nesse prazo, a mensagem
  pode ter saído mesmo assim (`semResposta`), e a confirmação do número abre o campo do código.
- **Número canônico:** só dígitos, com 55 e o nono dígito do celular. O WhatsApp ainda identifica
  muitos celulares antigos sem o nono dígito; é pela forma canônica que o bot reconhece quem escreveu.
- **Webhook:** a Evolution não assina as entregas. O botão “Ligar o recebimento de mensagens”
  configura a URL (`/api/webhooks/whatsapp?w=<espaço>`) com um cabeçalho `x-palacio-whatsapp`
  derivado da chave (HMAC); sem ele, 401. **Não configure a URL à mão no painel da Evolution** — vai
  sem o cabeçalho. Trocou a chave, ligue de novo. Só `MESSAGES_UPSERT` e `CONNECTION_UPDATE`.
- **Reentrega:** a Evolution tenta até 10 vezes (menos em 400/401/403/404/422). A rota responde na
  hora e atende depois (`after`); `whatsapp_mensagens` tem trava por id da mensagem, então nada é
  respondido duas vezes. O registro guarda só o comando reconhecido, nunca o texto recebido.
- **Bot:** equipe com número confirmado: `1` avisos sem abrir, `2` marcar como lidos, `3`/`parar`/`voltar`
  pausa ou retoma, `4` agenda de hoje e amanhã (camadas ligadas, mesmo crivo do resumo semanal),
  `5` chamados abertos (que a pessoa abriu ou estão com ela), `6` aprovações esperando o voto dela,
  `ajuda <dúvida>` (busca na Central de ajuda, só nas áreas que ela abre; o Claude resume os trechos
  achados com esforço baixo, e sem chave vão os trechos). Número desconhecido recebe uma
  apresentação, no máximo uma vez por dia. Teto de 10 respostas a cada 10 min por número (um robô
  do outro lado não vira conversa infinita).
- **Ações pelo bot** (`lib/whatsapp/acoes.ts`): responder citando o aviso manda o texto para onde o
  link do aviso aponta (`alvoDoLink`: chamado, Chat, mensagem direta, aprovação) — a mensagem de
  saída guarda o id do WhatsApp e o `notificacao_id`. Na aprovação, `aprovar` manda a conferência
  do setor e só vota depois de `confirmo`; `ajustes: …` vota na hora. `chamado: …` abre chamado
  perguntando equipe, assunto, local (se pedir) e urgência. As perguntas em aberto ficam em
  `whatsapp_pendencias` (15 min). Tudo passa pelas mesmas regras da tela: `lib/chamados/nucleo.ts`,
  `lib/chat/avisos.ts`, `lib/aprovacoes/avisos.ts`, `lib/mensagens/avisos.ts`, e o Chat e o voto
  pelas funções `whatsapp_chat_enviar` / `whatsapp_votar` (só service role), que chamam
  `chat_enviar` e `vote_on_approval` como a pessoa, numa sessão simulada **aal1**. Por isso quem
  usa (ou é obrigado a usar) a verificação em duas etapas só consulta e abre chamado pelo WhatsApp
  (abrir chamado ficou liberado em 27/09/2026: só cria o pedido no nome de quem escreveu):
  responder, votar e mandar fotos, o servidor recusa antes (`podeAgirPeloWhatsapp`), e o banco
  recusa de novo no Chat e no voto.
- **Fotos e vídeos viram envio** (`lib/whatsapp/envio.ts`, regras em `envio-regras.ts`): mídia de
  quem é da equipe (e pode agir pelo WhatsApp) abre um envio `recebendo` e uma pendência `envio` (índice único: uma aberta por
  pessoa, então fotos em entregas paralelas caem no mesmo). Cada arquivo é baixado pela Evolution
  (`/chat/getBase64FromMediaMessage`, até 64 MB — o webhook não traz o arquivo) e gravado no R2 com
  o nome canônico, já `recebido`; a legenda vai para o relato. `pronto` → título → autorização de
  imagem → conclui como o botão do link (`avisarAvaliadores`, link de assinatura quando cabe). Sem
  resposta por 30 min, fecha sozinho com o título provisório e `nao_sei` (webhook, rotina diária e
  a próxima foto da pessoa). Áudio e documento soltos não abrem envio. O limite por origem é o do
  link (`conferirLimites`), com a origem `whatsapp:<pessoa>`.
- **Voluntários** (`lib/whatsapp/voluntarios.ts`, tabela `participantes_whatsapp`): o voluntário
  confirma o número na Área do Voluntário (código ao próprio WhatsApp) marcando a autorização, cujo
  texto e data ficam guardados (LGPD; `VERSAO_DO_CONSENTIMENTO`). A primeira publicação de uma
  oportunidade (`oportunidades.avisada_por_whatsapp_em`, marca atômica) põe na fila uma mensagem
  por voluntário ativo que autorizou e não saiu, com o controle de volume de sempre; antes de sair,
  a fila desiste se a pessoa saiu ou a oportunidade fechou. Anonimizar o voluntário (LGPD) apaga o
  número, a autorização e a fila dele, e tira o número do registro. O bot reconhece o número do voluntário:
  `1` oportunidades abertas, `2` inscrições, `sair`/`voltar`. Não há envio a quem não autorizou.
- **Ficha da Equipe pela própria pessoa** (`lib/rh/convites.ts`, regras em `lib/rh/ficha.ts`, página
  pública `/ficha/[token]`, tabela `equipe_convites`): o RH (nível ≥2; documentos, ≥3) gera um link
  de uso único (7 dias, só o hash do token no banco, um aberto por pessoa) e manda pelo WhatsApp —
  o número confirmado no Palácio, senão o telefone pessoal da ficha. A gravação é da função
  `equipe_preencher_pelo_convite` (só service role): dados pessoais e, se liberado, documentos
  (somados aos que já havia, cifrados); **nunca banco, cargo ou salário**; campo vazio não apaga;
  auditoria "pela própria pessoa"; desligado não usa mais o link. Nunca vai para o telefone de
  trabalho, e o link só volta ao RH em "Só gerar o link"; na fila, o texto com o token é apagado
  depois do envio. A página não mostra valores guardados. Quem pediu é avisado na
  categoria `equipe`. A rotina diária lembra (2 dias, no máximo 2 vezes) trocando o token.
- **Fila, silêncio e volume** (`lib/whatsapp/fila.ts`, tabela `whatsapp_fila`): toda mensagem sai por
  `entregar()`. Aviso comum entre 22h e 7h (São Paulo) espera e sai às 7h (portaria, segurança da
  conta, código, bot e teste saem na hora). No máximo 12 mensagens por minuto no espaço, 3 s entre
  uma e outra, e 40 avisos por pessoa em 24 h. Falha por servidor fora (rede, 5xx, chave, instância)
  volta para a fila com espera de 5 min a 12 h; tempo esgotado não é repetido (pode ter saído). A
  fila anda quando a Evolution avisa que reconectou (webhook), a cada aviso novo, na rotina diária
  `/api/whatsapp/rotina` (10h05 UTC, `CRON_SECRET`) e pelo botão “Enviar a fila agora”. Antes de
  sair, desiste se o aviso já foi lido ou a pessoa pausou ou tirou o número. Batido o teto do minuto,
  a rodada espera a janela abrir (dentro do orçamento), e o anúncio aos voluntários vai depois de
  resposta do bot, segurança e avisos da equipe. Só controle de volume:
  **não há variação de texto nem “digitando” para despistar o WhatsApp**.
- **Alerta de queda** (`lib/whatsapp/estado.ts`, tabela `whatsapp_estado`): quando a conexão cai
  (connection.update, envio que falhou por servidor fora ou a rotina diária), os administradores
  recebem “O WhatsApp do Palácio caiu” no sino e no e-mail (categoria `sistema`, que nunca vai pelo
  WhatsApp), no máximo a cada 6 h; e “voltou” quando reconecta.
- **Endereço do servidor:** o cartão de Integrações completa o `https://` e recusa endereço local
  (localhost, 192.168…, 172.16–31…): a Vercel não alcança o computador de ninguém.
- **Resposta à portaria:** a visita é um alvo de resposta como chamado e aprovação (§7.24):
  `responderAoAviso` desvia para `responderVisita` antes da conferência da verificação em duas
  etapas, e `atenderMensagem` aceita "1", "2" ou "3" sem citar quando só uma visita espera a pessoa.
- **Baileys é não oficial:** o WhatsApp pode bloquear número que pareça spam. Por isso só mandamos para
  quem confirmou o número, com teto por link. Use um chip só do Palácio.

## 9. Convenções

**Marca.** O emblema (a cruz) é **sempre vermelho sobre fundo branco** — nunca
vazado em branco sobre vermelho, nunca como marca d'água, nunca recortado. Faixa
de destaque com a marca é branca com filete vermelho; o vermelho da marca é
`--primary` (`rgb(227 34 25)`). A logo oficial é `public/images/logo-cvrj.png`.
O vermelho da marca é acento (logo, botão principal, item ativo, filetes), não
sinal de problema: erro e atraso usam `--destructive` (`rgb(185 28 28)`, mais
escuro), sempre com ícone ou texto junto. Não use `primary` para alerta nem
`destructive` para marca.

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

**Não há suíte de testes.** Não existe vitest nem jest. O que existe é
`npx tsc --noEmit`, `pnpm lint` (eslint no repositório inteiro,
`eslint.config.mjs`) e `pnpm build`, **e os três devem passar antes de qualquer
push**, além dos `scripts/conferir-*.ts` da área que você mexeu. Para lógica pura, escreva um script avulso no scratchpad e rode com
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

### 10.7 Código que grava coluna nova no ar antes da migração

Em 26/09/2026 o PR da Biblioteca leve foi mesclado com a migração
`20260928090000_cvrj_biblioteca_otimizacao` ainda não aplicada. Os inserts em
`files` passaram a mandar `otimizado_em` e `tamanho_original`; o PostgREST
recusa coluna que não existe (mesmo com valor nulo), o registro falhava e o
arquivo recém-enviado era apagado. **Todo envio à Biblioteca falhou por 14
minutos**, até a migração ser aplicada.

**A regra (a mesma de §10.1, do outro lado):** migração que acrescenta vai
**antes** do merge. Quem mescla confere na lista de migrações do Supabase
(`supabase_migrations.schema_migrations`) que a do PR já está lá.

**De novo em 26/09/2026:** o PR #241 (aviso, enquete e quiz nas
oportunidades) foi mesclado com a migração `20260929020000` pendente, apesar
do aviso no topo da descrição. As telas passaram a ler `nota_minima`, que não
existia: criar oportunidade falhava e a lista do voluntário podia vir vazia,
até a migração ser aplicada minutos depois. O #238 entrou na mesma noite com a
sua migração (`20260929010000_cvrj_ajuda_retornos`) também pendente. Aviso em
texto não bastou; por isso a trava virou mecânica:

- PR com migração nasce **rascunho** (skill `entregar`);
- o modelo do PR (`.github/pull_request_template.md`) traz a caixa
  "Migração aplicada em produção", marcada só depois de aplicar e conferir;
- o check **"Migração aplicada?"** (`.github/workflows/migracao-pendente.yml`)
  fica vermelho em todo PR que acrescenta arquivo em `supabase/migrations/`
  enquanto a caixa estiver vazia. Para ele **impedir** o merge (e não só
  avisar), ligue-o como obrigatório na proteção da `main` (GitHub → Settings →
  Branches → Require status checks).

**E de novo em 27/09/2026**, com a trava já no lugar mas ainda não obrigatória:
quatro vezes o código chegou à produção minutos antes da sua migração. Os logs
do Supabase mostram 404 em `portaria_visitas` e `portaria_config` (16h26), em
`whatsapp_fila` (21h08) e em `whatsapp_pendencias` (21h34–21h36), e o #271
(resposta da portaria) foi mesclado 30 segundos antes da migração. Nada se
perdeu porque as telas novas só liam, mas a lição continua: **enquanto o check
não for obrigatório na proteção da `main`, ele só avisa.**

### 10.8 Consulta que "traz tudo" e traz só mil linhas

A API do Supabase devolve **no máximo 1000 linhas por pedido**, e
`.limit(50000)` não muda isso: o resto some sem erro. Já fez um curso com prova
parecer sem prova (`lib/membro/cursos.ts`), e a varredura de 09/2026 achou o
mesmo desenho no saldo das contas, na Saúde e no fechamento do mês do
Financeiro, nos totais de doações e no estoque — somas que ficariam erradas,
caladas, a partir do milésimo lançamento.

**A regra:** consulta cujas linhas vão ser **somadas ou contadas** passa por
`todasAsLinhas()` (`lib/supabase/paginar.ts`, com `.order('id').range(de, ate)`),
ou vira uma contagem (`count: 'exact', head: true`) ou uma soma no SQL. Listas
para a tela podem ter teto, desde que a tela diga que cortou.

## 11. O que ainda não existe

- **Suíte de testes das páginas do site** — a conferência (render com exemplos,
  `validar_jsonld.py` do repositório do site, capturas) ainda é manual (§7.6).
- **Migração de limpeza do `file_id`** — depende do deploy do carrossel.
- **Suíte de testes** — hoje só `tsc`, `build` e scripts avulsos.
- **Check "Migração aplicada?" obrigatório** — hoje ele só avisa (§10.7); falta
  ligar em GitHub → Settings → Branches.
- **Proteção contra senhas vazadas** no Supabase Auth (HaveIBeenPwned), apontada
  pelo verificador de segurança do Supabase: um interruptor no painel (Auth →
  Providers → Email), fora do código.
- **Retenção dos registros** — `notifications`, `whatsapp_mensagens`,
  `whatsapp_fila` e o registro de acessos crescem sem limpeza. Com o volume de
  hoje (centenas de linhas) não pesa; vale uma rotina de limpeza antes de passar
  de dezenas de milhares.
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
