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
| `UPLOAD_POST_PROFILE` | server | perfil no Upload-Post (`@cruzvermelhabrasileirarj`) |
| `UPLOAD_POST_FACEBOOK_PAGE_ID` | server | **obrigatória** — ver §8.1 |
| `FTP_HOST` `FTP_USER` `FTP_PASSWORD` `FTP_BASE_DIR` | server | publicação no site |
| `SITE_PUBLIC_BASE_URL` | server | opcional; sem ela o `ftp-check` não confere se a pasta é publicada |
| `CRON_SECRET` | server | **segredo** — a Vercel manda nos crons de `vercel.json`; sem ela as rotas de cron ficam fechadas |
| `META_CONVERSOES_TOKEN` | server | **segredo**, reserva do cofre — token da API de Conversões do pixel da Escola (§8.6); sem ele, o envio tenta `META_ADS_TOKEN` |
| `AUDITORIA_CHAVE_PRIVADA` | server | **segredo** — Ed25519 (PKCS#8 PEM) que assina os lotes da trilha pública; sem ela os lotes ficam sem assinatura até ela chegar (§7.9) |
| `AUDITORIA_SEGREDO` | server | **segredo**, opcional — HMAC do limite da consulta pública; na falta, derivado da chave de serviço |
| `AUDITORIA_ABERTA` | server | `1` só na abertura da trilha: tira o `noindex` das páginas de transparência e canais oficiais |
| `AUDITORIA_TSA_URL` | server | opcional — autoridade de carimbo de tempo RFC 3161 (padrão: FreeTSA) |
| `R2_ACCOUNT_ID` `R2_ACCESS_KEY_ID` `R2_SECRET_ACCESS_KEY` | server | **segredo** — token do Cloudflare R2 só com leitura e escrita de objetos nos buckets da trilha e do acervo; sem elas, o espelho da trilha e o acervo ficam desligados (§7.9, §7.10, `docs/armazenamento-r2.md`) |
| `R2_BUCKET_TRILHA` | server | bucket do espelho da trilha (`cvrj-trilha`) |
| `GOOGLE_SAFE_BROWSING_KEY` | server | opcional — reserva da chave do Safe Browsing (o lugar preferido é Configurações → Integrações); sem ela, os links não são conferidos (§8.4) |
| `GOOGLE_ADS_REFRESH` | server | **segredo**, opcional — reserva da autorização do Google Ads (o lugar é o cofre, pelo botão "Conectar Google Ads"; §7.29d) |
| `GOOGLE_ADS_OAUTH` | server | **segredo**, opcional — reserva do cliente OAuth próprio do Google Ads (`google_ads_oauth` em Configurações → Integrações), para quando o projeto do cliente do Gmail não tem acesso à API do Ads; vazio, o Ads usa o do Gmail (§7.29d) |
| `GOOGLE_ADS_CUSTOMER_ID` | server | opcional — a conta de anúncios (o Ad Grants, 10 dígitos) que a conexão usa quando a conta Google alcança mais de uma; também se escolhe no cartão (§7.29d) |
| `PORTAL_TRANSPARENCIA_KEY` | server | opcional — reserva da chave gratuita da CGU para a verificação do candidato (§7.36); `PORTAL_TRANSPARENCIA_URL` só em testes |
| `R2_BUCKET_ACERVO` | server | bucket do acervo (`cvrj-acervo`); sem ela, a tela Acervo avisa que falta configurar (§7.10) |
| `KAPSO_WHATSAPP` | server | **segredo**, opcional — reserva do cartão “WhatsApp (Kapso — API oficial)” de Configurações → Integrações, que é o lugar preferido; JSON com `chave`, `numeroId` e, opcionais, `modelo`, `modeloCodigo`, `modeloSeguranca` e `wabaId` (§8.5) |

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
    financeiro/ patrimonio/ transparencia/ canais-oficiais/ trilha-publica/ mapa/
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
    verificacao/[token]   documentos da verificação do candidato (§7.36)
    confirmar/[token]     confirmar no Palácio o que foi pedido pelo WhatsApp (com sessão; §8.5)
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
- **Convite pelo WhatsApp e/ou por e-mail** (`mandarConvite` no núcleo do
  cadastro, `lib/contas/cadastro.ts`; regras em `lib/contas/convite.ts`). O link sai por
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
- **O núcleo do cadastro (19/10/2026)** (`lib/contas/cadastro.ts`, com as
  regras puras em `lib/contas/cadastro-regras.ts` — `npx tsx
  scripts/conferir-cadastro.ts`): `cadastrar` é o cadastro de UMA pessoa —
  confere o pedido (as mensagens de sempre da tela), cria a conta em modo
  convite (`criarConta`: Auth e perfil pelo service role, o vínculo com o
  espaço pela sessão de quem está logado), liga ou cria a ficha do RH, põe o
  pedido da ficha no convite, manda o convite (`mandarConvite`) e audita
  `usuario_criado`. `convidarEmLote` passa cada pessoa por ele, e "Novo
  usuário" em `/usuarios` (`criarUsuario`) usa `criarConta` e `mandarConvite`
  dele. É o mesmo caminho que cria a conta pedida pelo WhatsApp e
  confirmada no Palácio (§8.5, "Cadastro de colaborador pelo WhatsApp";
  `lib/whatsapp/colaborador-confirmar.ts`): `cadastrar` aceita o usuário
  escolhido na confirmação (`usuario`), recusa o papel de administrador
  (`semAdmin`) e marca a origem na auditoria (`origem: 'whatsapp'` em
  `usuario_criado`). A conversa no WhatsApp (`lib/whatsapp/colaborador.ts`)
  só junta o pedido e manda o link: não cria conta.
- **Avisos de segurança** (`avisar`) em senha alterada, 2FA ativada/removida,
  papel alterado, conta desativada/reativada, e-mail trocado, WhatsApp trocado
  ou removido e entrada bloqueada por tentativas erradas. Vão ao e-mail
  confirmado e ao WhatsApp confirmado (`avisarPorWhatsapp`, tipo `seguranca`)
  **mesmo com os avisos pausados** — pausar vale para os avisos comuns, como
  promete `textoDeSeguranca`. `avisar(admin, userId, aviso, { email, whatsapp })`
  manda para outro endereço ou número (o endereço antigo, quando o e-mail muda)
  ou, com `whatsapp: null`, só ao e-mail. São best-effort: nunca desfazem a
  ação; a falha vai para o log.
- **“Não fui eu” (18/10/2026):** no WhatsApp, o aviso de algo que a própria
  pessoa faria (`ofereceNaoFuiEu` em `lib/contas/emails.ts`: senha trocada por
  ela ou pelo link, verificação mexida por ela, e-mail trocado, entrada
  bloqueada; mais o acesso novo e o recado ao número antigo) termina com
  “Responda NÃO FUI EU se não foi você” e, dentro da janela, o botão. A
  resposta encerra todas as sessões (`encerrarSessoesDaConta`), cancela os
  links de conta e os códigos do WhatsApp pendentes (`revogarLinksDaConta`),
  avisa a administração e a pessoa e audita `nao_fui_eu` — sem trocar a senha
  nem desativar. Detalhes em §8.5.
- **WhatsApp da conta (18/10/2026):** confirmar outro número
  (`confirmarNumeroDaEquipe`, pela tela ou pelo bot; e o convite só pelo
  WhatsApp) ou tirar o número (Meu perfil, ou o admin em `/usuarios` com
  “Remover WhatsApp”, `removerWhatsappDoUsuario`) avisa
  (`avisarTrocaDeWhatsapp`, números mascarados) só o e-mail confirmado com o
  aviso completo. O número ANTIGO pode já ser de outra pessoa (é o caso da
  remoção pelo admin), então recebe só um recado sem nome, sem quem fez e sem
  “sua conta” (`AVISO_AO_NUMERO_ANTIGO`, tipo `seguranca`, com o “Não fui eu”:
  é por ele que a pessoa derruba quem trocou o número dela) — e, na remoção
  pelo admin, nada. **Desativar libera o número**: cancela o que esperava na fila
  para a pessoa (`desistiu`, menos os avisos de segurança) e o convite de acesso
  que ainda não saiu (entra sem `user_id`; é achado pelo número da marca do
  último convite, `lerMarcaDoConvite`, e o texto com o link é apagado), manda o
  aviso de conta desativada e só então apaga a linha de `whatsapp_contas` e
  invalida os códigos — o número pode ser confirmado em outra conta; reativada,
  a pessoa confirma de novo. **Cancelar o convite** faz o mesmo (o convite
  aberto só pelo WhatsApp já confirmou o número sem abrir sessão, e a conta
  segue “sem primeiro acesso”). O link avulso da ficha do RH na fila fica: é do
  RH, não da conta. `/usuarios` mostra o número mascarado (o inteiro não vai ao
  navegador). Auditoria em `auditoria_de_acesso`: `whatsapp_confirmado` (com
  `anterior` na troca), `whatsapp_removido`, `whatsapp_removido_pelo_admin` e,
  em `usuario_desativado` e `convite_cancelado`, `whatsapp_liberado` e
  `whatsapp_fila_cancelada`.
- **Perdi o celular** (`/verificacao`): avisa os admins por e-mail, 1 vez por
  hora. Não remove nada sozinho — senão a 2ª etapa valeria o mesmo que a senha.
- **`/verificacao?voltar=`** (18/10/2026): depois do código, volta para o
  caminho pedido (`destinoSeguro`, o mesmo da entrada). É o que leva de volta à
  confirmação no Palácio de um pedido feito pelo WhatsApp (`/confirmar/[token]`,
  §8.5) quem entrou pelo link e ainda devia o código.

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
`decideApproval`**, e o que foi conferido vai no comentário do voto. O voto em
si é `votarNaRodada` (`lib/aprovacoes/voto.ts`), a mesma função da confirmação
no Palácio do voto pedido pelo WhatsApp por quem usa a verificação em duas
etapas (§8.5). Perfis,
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
Google negado por padrão, sem o `<noscript>` do Pixel e **sem `fbq('consent', 'revoke')`
antes do `init`** (de 27/09 a 02/10 essa linha travou o Pixel: com o fbevents.js baixado
só depois do “Aceitar todos”, o `grant` ficava atrás na fila e nada saía), e o gtag.js e
o fbevents.js só são baixados quando o cookie
`cvrj_consentimento` (`v=1&e=0|1&m=0|1&t=…`, em `.cruzvermelhariodejaneiro.org`)
permite; o aviso liga a medição na hora da escolha por `window.cvrjMedicao`. Com
marketing, o PageView leva um `eventID` e o mesmo id vai ao servidor do site
(`/matricula-cursos-presenciais/api/medicao.php`), que o repassa à Meta pela API de
Conversões; a Meta junta os dois (só nos endereços de cruzvermelhariodejaneiro.org). A última
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

**Inglês (hreflang).** As matérias traduzidas vivem no repositório do site
(`/en/news/`, geradas por `scripts/gerar_ingles.py`, que grava
`traducoes/en/mapa-hreflang.json`). `lib/site/traducoes-en.json` é uma cópia desse mapa
e `lib/site/traducoes.ts` (`alternativasDaPagina`) devolve as três linhas de hreflang
(pt-BR, en, x-default no português) para a matéria que tem par e para `/noticias/` ↔
`/en/news/`; matéria sem par não declara nada. Tradução nova no site: copie o mapa de
novo e clique em “Regerar”. `npx tsx scripts/conferir-traducoes.ts` confere o mapa.

**O Palácio não entra na busca.** `app/robots.ts` proíbe tudo e `next.config.mjs` manda
`X-Robots-Tag: noindex, nofollow` em toda resposta (03/10/2026). As páginas públicas
(crachá, diploma, verificação, inscrição) chegam por link e QR, não pelo Google; o
domínio antigo redireciona e herda o mesmo.

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
  O que cada escrita faz mora em `lib/chamados/nucleo.ts` (`criarChamado`,
  `comentarNoChamado`, `mudarStatusNoChamado`, `atribuirNoChamado`,
  `transferirNoChamado`): as actions e o bot do WhatsApp chamam as mesmas
  funções, com as mesmas conferências, o mesmo evento e os mesmos avisos
  (o WhatsApp marca o evento com `canal: 'whatsapp'`).
- **Pelo WhatsApp (18/10/2026):** quem abre chamado (`chamado:`) e responde
  citando o aviso; quem atende a fila também **assume**, **resolve** (com a
  solução) e **transfere**, pelo comando com o código (`resolver TI-0042:
  troquei o toner`) ou respondendo ao aviso; resolver e transferir pedem
  `confirmo`. O `5` de quem atende traz também os abertos da fila. §8.5,
  "Quem atende chamado pelo WhatsApp".
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
- **Cartaz com QR por setor** (`/chamados/cartaz?fila=…`, grupo `(impressao)`,
  A4 em pé, como os da Portaria e dos Envios): o QR leva a `/chamado?fila=<slug>`
  (`app/chamado/route.ts`), que abre `/chamados/novo?fila=…` com a sessão ou
  manda para `/?voltar=…` sem ela. A entrada (`app/page.tsx` e `LoginForm`) volta
  para lá depois de entrar; `destinoSeguro` (`lib/chamados/cartaz.ts`) só aceita
  caminho do próprio Palácio (nunca `//outro-site`). Botão "Cartaz com QR" em
  Chamados e, na configuração, em cada fila. Conferência:
  `npx tsx scripts/conferir-cartaz-dos-chamados.ts`.
- **A copy dos cartazes** é escolhida na hora de imprimir e fica na URL
  (`lib/cartaz/copy.ts`: chamada, título e frase livres, marcadores como
  `{setor}`; barra `components/cartaz/barra-de-opcoes.tsx`). O mesmo
  esquema serve ao cartaz de matrícula dos cursos (`/escola/cartaz?curso=…`,
  `lib/escola/cartaz.ts`, o QR leva à página do curso ou à matrícula no site)
  e aos do Voluntariado (`/voluntariado/cartaz?para=inscricao|area`,
  `lib/voluntariado/cartaz.ts`, o QR leva a `/participe` ou `/membro`). A copy
  escrita para cada setor, curso e alvo vive nos `*-copy.ts` ao lado; cada
  cartaz tem o seu `scripts/conferir-cartaz-*.ts`.

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
dígitos, §8.5; `whatsapp_contas`, fora de `profiles` para o celular não ficar
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

Duas categorias são só da administração: `sistema` (o WhatsApp do Palácio
caiu, voltou ou parou de receber; nunca vai pelo WhatsApp) e `integracoes`
(18/10/2026: a conta Google expirou, o Resend ou o R2 falharam — vai também
pelo WhatsApp; §8.5, "Alertas de integrações").

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
- **Pelo WhatsApp (18/10/2026):** quem é a vez vê as compras em aprovação no
  “financeiro” do bot e pede “aprovar 3” / “recusar 3: motivo”; sai o link de
  confirmar no Palácio, e “Confirmar” chama o mesmo `decidirPedido` da tela
  (§8.5, “Decisões do Financeiro e de Compras”).
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
- **A própria pessoa é avisada** no e-mail e no WhatsApp confirmados (este mesmo pausado): entrada de
  aparelho ou país novo (`avisarAPessoa`: aparelho, local aproximado e hora, nunca o IP) e conta
  bloqueada por tentativas (`avisarBloqueioAPessoa` → `avisar` com `conta_bloqueada`: local e hora,
  sem os números do bloqueio; só conta ativa e no máximo um a cada `AVISO_DE_BLOQUEIO_A_CADA_HORAS`,
  com a linha `conta_bloqueada_por_tentativas` de `auditoria_de_acesso` como marca, sem migração).
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
- **Cópia no Google Drive** (§7.29c): o envio que chegou pelo WhatsApp, ao fechar, é copiado do R2 para
  "Palácio – Arquivos/Envios do WhatsApp/AAAA-MM/<título> (ENV-…)"; a ficha mostra "Cópia no Google Drive"
  quando todos os arquivos chegaram (`envios.drive_pasta_link`, lido à parte para a tela não depender da migração).
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
  (`docs/AJUDA.md` §9). O painel “?” mostra uma coisa de cada vez — a área
  numa frase, o tour, as abas “Como fazer” e “Dúvidas” com seis itens à
  vista, um formulário só de retorno — e o script avisa do que passa da
  medida (introdução, tarefas e perguntas por área, tamanho de resposta,
  `docs/AJUDA.md` §11).
- **Beta com a equipe** (`docs/AJUDA.md` §10): o botão “Beta” no topo e
  “Conte para a equipe”, no fim do painel “?” (o mesmo formulário: problema,
  ideia, dúvida ou elogio, com a nota da tela), e “Isso ajudou?” em cada
  pergunta gravam em
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
- **O pedido de assinatura pelo WhatsApp (18/10/2026):** o aviso “pediu sua assinatura” (categoria
  `oficios`) sai também pelo WhatsApp de quem confirmou o número, como os avisos comuns, com o link do
  ofício. Assinar e recusar continuam só no Palácio (senha ou gov.br): a resposta que cita o aviso só
  devolve o link (§8.5, “As outras áreas pelo WhatsApp”).
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
- **Na inscrição pública** (`/participe`, `20261002120000`) a foto é opcional: o navegador prepara
  do mesmo jeito, ela sobe no mesmo `FormData` da inscrição e `app/api/participe/route.ts` grava
  no Blob depois de `inscrever_participante`, pela RPC `definir_foto_na_inscricao` (service role;
  só candidato vindo do formulário, sem foto, inscrito há menos de 30 min). Entra "aguardando" na
  fila de fotos do crachá. Se o Blob falhar, a inscrição fica sem foto e a pessoa não vê erro.
- **Redes sociais** (`participantes.redes`, jsonb `{instagram, linkedin, facebook, outro}`, um
  link https por rede): a pessoa informa na inscrição, no perfil da Área do Voluntário
  (`membro_atualizar_perfil`) ou a equipe na edição; `normalizarRede` (`lib/participantes/regras.ts`)
  transforma `@usuário` e links sem `https://` no endereço e recusa domínio de outra rede; o banco
  confere de novo em `private.aplicar_campos_participante`. A ficha mostra como link externo
  (`rel="noopener noreferrer nofollow"`). Anonimizar limpa.

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
  Desde 19/10/2026 (etapa 3), no WhatsApp vai a **ficha da visita** no lugar do
  aviso comum (abaixo, "Ficha e resposta pelo WhatsApp"); o sino e o e-mail não mudam.
- **Resposta de quem é visitado** (migração `20260929160000`). Três respostas,
  `subir` (pode subir e aguardar no hall), `aguardar` (na recepção) e `recusar`
  (não pode receber agora), com recado opcional (até 280 caracteres), que podem
  mudar enquanto a visita está dentro:
  - pelo Palácio, em `/portaria/visita/[id]` (o link do aviso), pela função
    `portaria_responder` (quem é visitado ou a portaria, que registra o que
    chegou por telefone pelo botão "Resposta" da lista);
  - pelo WhatsApp, respondendo a mensagem do aviso (ou da ficha) com 1, 2 ou 3
    (`alvoDoLink` reconhece `/portaria/visita/<id>`) ou tocando nos botões
    "Pode subir", "Aguarde na recepção" e "Não pode agora" — os da ficha (ids
    `ficha:<n>:<visita>`, etapa 3) ou, no aviso que esperou na fila, os de
    `interativoDoAviso` (ids `1`, `2` e `3`; §8.5) —, pela função
    `portaria_responder_whatsapp` (só `service_role`, confere que quem responde é
    o visitado). Sem citar a mensagem, só vale resposta clara
    (`respostaClaraDaVisita`) e só se houver uma única visita esperando a pessoa
    nas últimas 2 h (`visitaEsperandoResposta`). Vale mesmo com a verificação em
    duas etapas: é resposta a uma pergunta, não uma ação sobre dados.
  - Depois de responder (`aposResposta`), quem registrou e quem confirmou a
    entrada recebem o aviso com o recado, e o visitante recebe a situação no
    WhatsApp **só se autorizou** (`avisar_visitante`, marcado por ele no QR ou
    pela portaria depois de perguntar, e só com telefone). A mensagem ao
    visitante nunca leva o recado: ele é para a portaria. Desde a etapa 3, ela
    sai só pelo modelo aprovado (abaixo); sem ele, não sai, e o aviso da
    portaria diz "O visitante não pôde ser avisado pelo WhatsApp: dê a resposta
    a ele" (`visitanteSemAviso`, antes do recado: o sino corta em 280 letras).
  - A lista "Na filial agora" mostra a situação ao lado de cada visitante e se
    atualiza sozinha.
- **Pelo WhatsApp (18/10/2026)** (`lib/whatsapp/portaria.ts`; §8.5, "A portaria
  pelo WhatsApp"): `portaria` lista as visitas abertas do dia (nome, para quem,
  hora e situação; nada de telefone, empresa, motivo, recado ou foto), e
  `visitante:` registra a chegada em etapas pela mesma `portaria_registrar_entrada`,
  chamada como a pessoa (`whatsapp_portaria_registrar_entrada`, migração
  `20261018213700`), e pelo mesmo `avisarVisitado`. Documento fica na tela.
- **Registro completo pelo WhatsApp (19/10/2026, etapa 2):** as etapas são as
  do cadastro do QR (`lib/whatsapp/portaria-regras.ts`, puro): nome → para quem
  → telefone → (com telefone e pessoa avisada) a autorização do visitante →
  de onde vem → motivo → crachá → foto → conferência → `confirmo`. Tudo depois
  de "para quem" é opcional, com os botões Pular, Registrar já (o resto em
  branco, direto à conferência) e Cancelar. A **autorização** é explícita: a
  portaria pergunta ao visitante e toca em Sim ou Não; só o Sim grava
  `avisar_visitante` (e com o setor, sem quem responda, nem se pergunta). O
  telefone vai ao livro formatado (`numeroCanonico` → `formatarNumero`). A
  **foto** chega como imagem em qualquer etapa, ou abre o registro (a legenda
  `visitante: Nome`, só com os dois-pontos); na chegada só o tipo é conferido
  (JPEG, PNG ou WebP; HEIC recusado com a orientação de usar a câmera) e o id
  da mídia fica na pendência. Depois do `confirmo`, com a visita criada e **antes** do aviso, a
  foto é baixada da Kapso, normalizada (`lib/portaria/foto-servidor.ts`: só o
  que o conteúdo confirma ser foto, teto de 120 MP na entrada, girada pelo
  EXIF, no máximo 1024 px, JPEG 80 sem metadados), gravada no Blob privado e
  registrada por `whatsapp_portaria_definir_foto(p_user_id, p_id, p_foto_path)`
  (migração `20261019040000`: a mesma `portaria_definir_foto` da tela, como a
  pessoa, sessão aal1, só `service_role`; só põe foto — tirar é pela tela — e
  só na visita que a própria pessoa registrou ou confirmou; devolve o caminho
  anterior). Se o banco recusar ou a função não existir, o arquivo sai do Blob
  e a resposta diz que a foto não entrou (tirar pela tela); a entrada vale do
  mesmo jeito. **LGPD:** nada do visitante vai a `whatsapp_mensagens` (só o
  comando, `visita_foto` na imagem) nem aos logs (só a etapa que falhou); a
  pendência que acaba (registrada, cancelada, vencida) é redigida — fica só a
  etapa (`redigirRegistrosEncerrados`, no começo e no fim de cada registro).
  Testes em `scripts/conferir-portaria.ts` e
  `supabase/tests/whatsapp-portaria-foto.test.sql`.
- **Ficha e resposta pelo WhatsApp (19/10/2026, etapa 3):** sem migração nova.
  - **A ficha** (`avisarVisitado` → `mandarFicha`, em `lib/portaria/servidor.ts`;
    regras puras em `lib/whatsapp/portaria-regras.ts`): quem receberia o aviso no
    WhatsApp (`quemRecebeNoWhatsapp`, a mesma conta do `notificar`: número
    confirmado, sem pausa, assunto ligado, conta ativa, teto do dia) recebe, no
    lugar dele, a ficha — e o `notificar` pula o WhatsApp dessa pessoa
    (`Aviso.semWhatsapp`), sem mensagem repetida; se a conta não pôde ser lida,
    vai o aviso de sempre. A ficha sai em `after()` pela `entregar` de sempre
    (volume, reenvio; registrada com o id do aviso do sino, para a resposta que
    a cita voltar à visita): dentro da janela de 24 h, botões com a foto no
    cabeçalho (`interativoDaFicha`; corpo `textoDaFicha`, até 1024: visitante e
    empresa, motivo, chegada e quem registrou, a dica do 1/2/3 e o link — nunca
    telefone nem crachá); fora dela, `modeloDaFichaForaDaJanela`: o modelo
    aprovado da visita (`portaria_visita_v2`, depois `portaria_visita`; os de
    foto só com ela; só APPROVED + UTILITY), com o mesmo id em cada resposta
    rápida, ou, sem nenhum, o aviso de antes pelo modelo dos avisos do cofre.
    A foto sobe à Meta (`subirMidia`) só quando pode aparecer
    (`sobeAFotoDaFicha`: janela aberta pela `whatsapp_cota_de_conversas`, ou sem
    saber, ou com modelo de foto aprovado) e é apagada de lá
    `ESPERA_PARA_APAGAR_A_FOTO_MS` (20 s) depois do envio, por melhor esforço
    (a Meta guarda 30 dias se a função acabar antes). A Kapso guarda cópia da
    mídia recebida e da enviada na conversa do número, e o Palácio não a apaga:
    num pedido de exclusão, a administração apaga a conversa no painel da Kapso
    (a ajuda diz isso). Na tela, a foto sobe depois
    do registro: o formulário manda `foto_a_seguir`, e a ficha espera por ela
    até `ESPERA_DA_FOTO_MS` (20 s; a página tem `maxDuration` 60).
  - **Os botões** "Pode subir", "Aguarde na recepção" e "Não pode agora" têm o id
    `ficha:<1|2|3>:<uuid sem hífens>` (40 caracteres, o teto do id interativo;
    o mesmo é o payload da resposta rápida do modelo). O bot lê o toque antes do
    aviso citado, da pergunta aberta e do assistente (`lerBotaoDaFicha`, só com
    `toque`; registro `ficha_da_visita`) e responde por `responderPelaFicha`: o
    id diz **qual** visita, nunca quem pode — só quem é visitado nela
    (`podeResponderPelaFicha`; e o banco de novo, `portaria_responder_whatsapp`).
    A resposta rápida que voltasse sem o payload traz o título, que vale pela
    ficha citada (sem recado: "Aguarde na recepção" não deixa "na recepção").
  - **A resposta ao visitante** (`avisarOVisitante`): o visitante nunca escreveu
    ao número, então só o modelo (`portaria_resposta_visitante_v2`, depois
    `portaria_resposta_visitante`; {{1}} quem e o setor, {{2}} a situação —
    `parametrosParaVisitante`), sem fila. O registro em `whatsapp_mensagens` vai
    **sem o número** do visitante (LGPD; a cota diária deixa de contar essas
    conversas) e com os dígitos longos tirados do erro.
  - Testes: `scripts/conferir-portaria.ts` (ids, título, quem responde, o texto
    no máximo, o interativo, a escolha do modelo, o recuo, o toque no webhook,
    a resposta ao visitante) e `scripts/conferir-whatsapp.ts` (a ficha de
    verdade contra a Kapso de mentira: dentro e fora da janela, o de foto e o
    recuo para o cofre).
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
- **Pagamentos como conversões na Meta.** Cada venda paga vira um `Purchase`
  na API de Conversões, com `content_category` "taxa_de_inscricao" ou "curso"
  (§8.6).

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
  que ficam na Vercel (só ligada ou desligada, nunca o valor). É o destino
  dos alertas de integração do cliente OAuth, do Resend e do R2 (§8.5); os
  da conta Google vão para E-mail dos setores.
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
- **Aprovar despesa pelo WhatsApp (18/10/2026)**: o “financeiro” do bot lista
  as despesas esperando aprovação de quem aprova; “aprovar 2” vira o link de
  confirmar no Palácio (`/confirmar/[token]`, fora dos livros: sem cabeçalho de
  livro, `decidirAprovacao` vale pela empresa do lançamento, como numa rota de
  API). Pagar, conciliar e fechar o mês não têm caminho pelo WhatsApp (§8.5).

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

**Cota do Gmail (28/09/2026).** A cota de leitura ("Total Query Cost",
15.000 unidades por minuto **por usuário**) é da conta Google conectada — uma
só para a filial —, e cada abertura da tela custava ~300 unidades (o contador
de cada caixa, 5; a lista, 10 + 25 conversas a 10 cada), repetidas a cada
conversa aberta (o `router.refresh()` de marcar como lida). Numa manhã com a
equipe toda na caixa, o Google respondeu `403 Quota exceeded … Units per
minute per user`. O que foi feito:
- as leituras (`conversasDaPasta`, `naoLidasPorCaixa`, `abrirConversa`) ficam
  na memória do servidor por 60 s (`lembrar()`, que também compartilha uma
  leitura em andamento entre quem pede ao mesmo tempo); marcar lida/não
  lida, arquivar, enviar e o botão "Atualizar" (`atualizarCorreio`) chamam
  `esquecerLeituras(ws)`. É um Map na memória do processo, e não o
  `unstable_cache` do Next: comporta-se igual em dev e na Vercel e se
  confere com um log. É memória de cada instância: outra instância pode
  mostrar a bolinha de não lida por até um minuto depois de alguém marcar;
- `emLotes` desceu de 8 para 4 em paralelo (a cota por segundo é uma média
  móvel de 250 unidades; uma conversa custa 10);
- `gmail()` tenta de novo duas vezes (0,7 s e 1,8 s) em 429 e em 403 de cota,
  e só então mostra `COTA_ESTOURADA`, em português; cota não marca a conexão
  como "reconectar";
- os `<Link>` da caixa têm `prefetch={false}`: são variações da mesma tela
  dinâmica, e cada uma lida no servidor custaria cota.

**Testes.** `npx tsx scripts/conferir-caixa-de-entrada.ts`. Fora de produção,
`GOOGLE_API_TESTE` aponta as chamadas do Google para um servidor de teste.

**Etiqueta = caixa (12/10/2026).** Os endereços dos setores são apelidos da
mesma conta (contato@): encaminhar de um para o outro não funciona (o Gmail
trata como mensagem para si mesmo). O que leva um e-mail de outro endereço à
caixa de um setor é uma etiqueta do Gmail:
- `caixas_de_email.rotulo_gmail_id`/`rotulo_gmail_nome` (migração
  `20261012120000`): a etiqueta ligada à caixa. O nome entra na busca
  (`termoDaEtiqueta`: minúsculas, espaço e "/" viram hífen, acento fica; o id
  NÃO funciona na busca, conferido na conta) em OR com o endereço, na entrada
  e em "Todas"; "Enviados" ignora a etiqueta;
- `mensagensDaCaixa` (a trava): conversa com a etiqueta em qualquer mensagem
  aparece inteira, inclusive a resposta dada por contato@; sem ela, vale
  `envolveOEndereco`. O anexo (`lib/correio/anexo.ts`) confere pela conversa;
- os filtros que põem a etiqueta são criados no próprio Gmail, por
  Configurações › E-mail dos setores › "4. O que chega a cada caixa"
  (`app/actions/correio.ts`: `definirEtiquetaDaCaixa`, `criarFiltroDaCaixa`,
  `apagarFiltroDaCaixa`; puro em `lib/correio/filtros.ts`). Usa o escopo
  `gmail.settings.basic`, que a conexão já tinha (lista "enviar como"), e
  `gmail.modify` para criar etiqueta e etiquetar o que já existe (até 500).
  A tela só apaga filtro que põe a etiqueta daquela caixa.

### 7.29a E-mail provisório (`/email`, email.cruzvermelhariodejaneiro.org, 12/10/2026)

A mesma caixa de `/correio` para a equipe usar o e-mail do setor antes de o
Palácio abrir para todos, sem passar cada acesso por um administrador.
- **Endereço**: mesmo deploy; o domínio `email.` (lib/dominio.ts →
  `inicioDoEmail`) manda a raiz para `/email`. O domínio precisa estar na
  Vercel e no DNS.
- **Contas**: usuário e senha, criadas pelo responsável da caixa
  (`criarContaDoEmail`) com senha provisória mostrada uma vez e
  `trocar_senha` ligado: o primeiro acesso cai em `/email/trocar-senha`.
  Conta só do e-mail tem perfil e NÃO tem `workspace_members`: o Palácio
  segue fechado para ela (`obterWorkspace` devolve null; `/` manda para
  `/email`). O login é o mesmo (`entrar`, com bloqueio e registro).
- **Quem vê o quê** (`lib/email-provisorio/sessao.ts`): as caixas de
  `email_acessos` + as do setor no Palácio (`caixasQuePodeUsar`) para quem
  tem conta lá. Membro do Palácio no app passa pela troca de senha e pela
  verificação em duas etapas do Palácio. Quem tem `correio.configurar` vê
  todas e escolhe os responsáveis.
- **Responsável** (`email_acessos.responsavel`): dá e tira acesso à caixa e
  gera senha provisória — só para conta que é só do e-mail; senha de quem
  entra no Palácio é cuidada no Palácio. Tirar um responsável é só de quem
  configura o correio. Tudo em `app/actions/email-provisorio.ts`, que confere
  de novo a caixa e o papel; `activity_log` registra cada mudança.
- **Tela**: `CaixaDoCorreio` recebe um `ambiente` (endereços, actions e
  textos); a do Palácio é o padrão. Envio por `enviarPelaCaixaLiberada`, com o
  mesmo `emails_enviados` ("Registro de envios", lido pelo admin client
  filtrado pelos endereços da pessoa). Anexo em `/api/email/anexo`.
- **Cara de "o Gmail do setor" (15/10/2026)**: o cabeçalho
  (`components/email-provisorio/cabecalho.tsx`) mostra o endereço da caixa
  aberta em destaque, com o setor e o nome da pessoa embaixo; a marca diz só
  "E-mail dos setores" — a palavra "provisório" fica na documentação e no
  código, nunca na tela de quem usa; o "Escrever" é grande e vermelho no alto
  da coluna (`escreverEmDestaque` no `ambiente`); a entrada pede só usuário e
  senha (`usuario` em `LoginForm` troca o rótulo "Usuário ou e-mail", que não
  faz sentido para conta só do e-mail).
- **Liberar o setor de uma vez** (`liberarSetorDoEmail`): em Equipe das
  caixas, uma lista de nomes (um por linha, "Nome; usuario" para escolher o
  usuário, até 30) vira uma conta por linha, cada uma com a própria senha
  provisória, e a tela mostra o quadro de cada pessoa com "Copiar" (o recado
  pronto para o WhatsApp) e "Copiar todos". Linha com problema volta com o
  erro ao lado do nome, sem derrubar as outras. Quem configura o correio pode
  marcar a primeira pessoa criada como responsável — é o caminho para abrir
  um setor que ainda não tem ninguém no e-mail, sem passar pelo Palácio.
- **Quando o Palácio abrir para todos**: a conta é a mesma (usuário e
  perfil); basta o vínculo com o espaço. `email_acessos` pode sair depois, em
  migração própria, quando ninguém mais usar `/email`.

### 7.29b Contas do Google pelo link (`/email/criar/[token]`, 15/10/2026)

A filial ganhou o Google Workspace for Nonprofits (até 2.000 usuários, sem
custo) e o rumo é cada pessoa ter a própria conta do Google
(nome.sobrenome@), com o endereço do setor como **grupo** do Google (Caixa
colaborativa), nunca conta com senha compartilhada: o grupo guarda o
histórico e o registro de quem fez o quê é por pessoa. O app provisório de
7.29a vira ponte até isso estar montado. Para não criar conta por conta no
Admin do Google, um administrador gera um link e a pessoa cria a própria.
- **Conexão de administrador** (`google_admin_conexao` + chave `google_admin`
  no cofre; `/api/google/conectar-admin`, mesma volta `/api/google/retorno`
  com `state` começando em `admin.`): outra conexão, separada da do Gmail.
  A do Gmail é a conta dona dos apelidos (contato@), que não precisa — e não
  deve — ser administradora; esta precisa ser superadministradora do
  Workspace. Escopos mínimos: `admin.directory.user` e
  `admin.directory.group.member` (`lib/google/diretorio.ts`).
- **Links** (`google_convites`): só o sha-256 do código fica no banco; o link
  aparece uma vez para quem gerou. Pode fixar um setor ou deixar a pessoa
  escolher. Vence (1 a 30 dias), tem limite de usos (1 a 500) e pode ser
  revogado. Gerar e cancelar exigem `correio.configurar`.
- **A página do link** é pública (quem abre ainda não tem conta nenhuma) e
  mora no app de e-mail (`app/email/criar/[token]`), aberta em
  email.cruzvermelhariodejaneiro.org. Pede nome e sobrenome (o Google exige
  os dois), e-mail desejado (sugerido do nome: `usuarioSugeridoDoGoogle`),
  setor, celular (E.164) e e-mail pessoal de fora do domínio, os dois para a
  recuperação de senha do próprio Google. `criarContaPeloConvite`
  (`app/actions/google-contas.ts`) confere o link de novo, recusa endereço
  que é caixa de setor ou já existe no Google (409), cria com
  `changePasswordAtNextLogin` e tenta pôr no grupo do setor (`setores.email`).
  Grupo que ainda é apelido devolve 404: a conta nasce mesmo assim e
  `google_contas.grupo_ok` fica falso, com aviso na tela de acompanhamento.
  A senha provisória aparece uma vez e não é gravada.
- **Um e-mail só, com tudo** (`lib/google/contas-emails.ts`, puro;
  `emailDeContaDoGoogle` pela Resend via `enviarComSeguranca`): o e-mail
  pessoal, obrigatório no formulário, recebe o endereço novo, a senha
  provisória e o passo a passo. É a **exceção assumida (15/10/2026)** à regra
  "nenhum e-mail leva senha" de `lib/contas/emails.ts`: para a conta do
  Google não há link de uso único, a senha é provisória e o Google obriga a
  troca no primeiro acesso, e um canal só é mais simples de explicar à
  equipe (a versão em dois canais, senha por WhatsApp, existiu por um commit
  e foi descartada por decisão do responsável). A tela depois do envio é um
  aviso ("mandamos para x@gmail.com"); a senha só aparece nela quando o
  e-mail não saiu, para a pessoa nunca ficar sem ela. A action só devolve a
  senha ao navegador nesse caso.
- **Cercas** (`lib/google/contas-regras.ts`, puro): `CONTAS_POR_IP_POR_HORA`
  (6) por hash de IP com sal (`hashDoIp`, o mesmo de
  `pedidos_de_recuperacao`), usos do link, vencimento, revogação.
- **Acompanhamento**: bloco "5. Criar e-mails pelo link" em Configurações ›
  E-mail dos setores (`components/admin/contas-google.tsx`): conexão, gerar
  link, links vivos e contas criadas. Tudo vai ao `activity_log`
  (`google_convite_criado`, `google_convite_revogado`, `google_conta_criada`
  sem ator, `google_admin_conectado`/`_desconectado`).

### 7.29c Google Drive da filial (`lib/google/drive.ts`, 19/10/2026)

Uma pasta só, "Palácio – Arquivos", no Drive da conta Google da filial (hoje a do
contato@, a mesma do Gmail e da conta de administrador), onde o Palácio guarda a
cópia dos envios que chegam pelo WhatsApp e os documentos que a equipe guarda por
lá (§8.5). Sem o Drive conectado (ou sem a migração), nada muda. O Palácio não grava
permissão nenhuma: o que ele cria nasce privado da conta conectada, e a administração
compartilha "Palácio – Arquivos" com a equipe no Google Drive (o que nasce dentro herda o
acesso) — sem isso, o link que o WhatsApp devolve e o da ficha do envio só abrem para
essa conta. A ajuda ("Conectar o Google Drive da filial") e o cartão dizem isso.
- **Conexão própria, no padrão da de administrador** (`google_drive_conexao` +
  chave `google_drive` no cofre, oculta em `SERVICOS`; `/api/google/conectar-drive`,
  mesma volta `/api/google/retorno` com `state` começando em `drive.`). Escopo
  ÚNICO: `drive.file` — o Palácio só enxerga o que ele mesmo criou (a raiz, as
  subpastas e os arquivos que mandou), e a autorização pede `include_granted_scopes=false`
  (`urlDeAutorizacao(…, { somenteEstes: true })`): mesmo na conta do Gmail, o token do
  Drive não carrega os escopos do Gmail. Sem openid, a conta vem do `about` do Drive
  com o token da volta (`trocarCodigo` devolve também o `accessToken`). A volta já
  garante a pasta raiz e guarda o id e o link. Sem a tabela (migração pendente), a
  volta tira a chave do cofre e avisa.
- **O cartão "6. Google Drive"** em Configurações › E-mail dos setores
  (`components/admin/drive-google.tsx`): situação (ativa/expirada), conta, link da
  pasta raiz, "Conectar Google Drive"/"Reconectar" e "Desconectar"
  (`app/actions/google-drive.ts`, `integracoes.configurar` conferido na action; tira a
  chave e a linha, os arquivos ficam). Não se revoga em myaccount.google.com: lá a
  revogação derruba todas as conexões do mesmo cliente OAuth.
- **`lib/google/drive.ts` (nunca lança):** token renovado como as outras conexões (cache
  por instância); `invalid_grant`, 401 de novo depois do token novo e o escopo que falta
  marcam `expirada` — só a troca de `ativa` para `expirada` dispara o alerta
  `google_drive` (categoria `integracoes`, um a cada 6 h); o Drive cheio
  (`storageQuotaExceeded`) também alerta. `garantirPastaRaiz` (a guardada, se ainda
  existe e não está na lixeira; senão a que o Palácio já criou no Meu Drive; senão uma
  nova), `garantirPasta` (cada nível achado ou criado; duas cópias ao mesmo tempo não
  criam a mesma pasta duas vezes na instância), `enviarAoDrive` (envio em partes,
  `uploadType=resumable`, 8 MB por vez até 64 MB, retomado pelo `Range` do 308 depois de
  queda ou 5xx; sessão vencida recomeça uma vez), `copiarDoR2ParaODrive` (os bytes já
  guardados no R2) e `contaDoDrive`.
- **Regras puras** (`lib/google/drive-regras.ts`, conferidas por
  `npx tsx scripts/conferir-drive.ts`): `normalizarCaminho` (sem "." nem "..", sem barras
  extras, "/" ou ">" entre os níveis, até 4 níveis de até 80 caracteres; a raiz escrita
  junto não conta), `podeGuardarEm` (cada pessoa só sob a pasta de um setor dela — o nome
  do setor no Palácio, sem diferença de acento ou caixa; quem administra, em qualquer
  lugar; "Envios do WhatsApp" é só das cópias), `caminhoDoEnvio`
  ("Envios do WhatsApp/AAAA-MM/<título> (ENV-…)", o mês em Brasília),
  `descricaoDoArquivoDoEnvio` (de onde veio, quem mandou, a autorização de imagem),
  `tipoDoDocumento`, `nomeDoArquivoNoDrive`, os pedidos à API (a busca com o nome
  escapado, a criação, o começo do envio em partes, as faixas) e as falhas
  (`motivoDaFalhaDoDrive`, `textoDaFalhaDoDrive`).
- **Migração** `20261019030000_cvrj_google_drive.sql` (só acrescenta, a aplicar):
  `google_drive_conexao` (RLS forçado, leitura só de administradores, policy criada só
  se não existe), `envios.drive_pasta_link` e `drive_copia_em`,
  `envio_arquivos.drive_arquivo_id`, o tipo `guardar_documento` em
  `whatsapp_pendencias` e "drive" em `private.whatsapp_permitidas_validas`.

### 7.29d Google Ads da filial (`lib/google/ads.ts`, 22/10/2026)

A conta do **Google Ad Grants** (a verba que o Google doa a organizações sem fins
lucrativos, em dólar) onde rodam as campanhas de pesquisa que levam ao site da
filial. O Palácio não liga anúncio: ele confere e cria, **pausada**, a campanha
institucional do plano, e quem ativa é uma pessoa, no painel do Google, depois de
revisar. Sem o Ads conectado (ou sem a migração), nada muda.
- **Conexão própria, no padrão da do Drive** (`google_ads_conexao` + chave
  `google_ads` no cofre, oculta em `SERVICOS`; `/api/google/conectar-ads`, mesma
  volta `/api/google/retorno` com `state` começando em `ads.`). Escopos: `adwords`
  mais `openid`/`userinfo.email` (o do Ads não traz quem autorizou), com
  `somenteEstes`. A volta lista as contas de anúncios que a autorização alcança
  (`customers:listAccessibleCustomers`) e escolhe a única, ou a de
  `GOOGLE_ADS_CUSTOMER_ID` se a alcança; com mais de uma, o cartão pede a escolha
  (`escolherContaDoAds`, conferida contra a lista). A reconexão da mesma conta
  mantém a escolha e a campanha já criada.
- **Cliente OAuth próprio (opcional).** O acesso à API é do projeto do Google Cloud
  dono do cliente OAuth. O "My First Project" do cliente do Gmail teve o Explorer negado
  duas vezes (22/10/2026), e trocar o cliente geral derrubaria Gmail, Drive e conta de
  administrador. Por isso `clienteDoAds` lê `google_ads_oauth` (Integrações; reserva
  `GOOGLE_ADS_OAUTH`) e só na falta dele usa o do Gmail; a conexão (`conectar-ads`), a
  volta (`trocarCodigo(…, cliente)`) e a renovação do token usam o mesmo cliente. A
  autorização vale só para o cliente que a gerou: trocar o cliente pede "Reconectar". O
  cartão diz qual cliente está em uso.
- **Sem developer token.** O Google o aposentou em 9/9/2026: o nível de acesso
  (Test → Explorer → Basic) é do projeto do Google Cloud dono do cliente OAuth, e se
  pede em "Google Ads API → Visão geral" do console. Com Test, a API só fala com
  contas de teste e a lista de contas vem vazia — o cartão diz isso. O cabeçalho
  `developer-token` não é enviado (é ignorado hoje e será recusado).
- **O cartão "7. Google Ads"** em Configurações › E-mail dos setores
  (`components/admin/ads-google.tsx`): situação, conta Google, contas de anúncios
  alcançadas e a escolhida, e um bloco por plano (uma campanha por página de
  destino) com o resumo, "Conferir no Google" (o pedido com `validateOnly`: o Google
  confere limites, políticas e segmentação sem gravar) e "Criar campanha (pausada)",
  além de "Desconectar" (`app/actions/google-ads.ts`, `integracoes.configurar`
  conferido em cada action; o id do plano vem do botão). Criada, o bloco mostra a
  data e o link no painel. O registro de cada campanha mora em `activity_log`
  (`google_ads_campanha_criada`, com plano, nome, campanha e conta), sem migração:
  a coluna `campanha_recurso` da conexão guardava uma só e deixou de ser usada.
- **`lib/google/ads.ts` (nunca lança):** token renovado como as outras conexões;
  `invalid_grant` e 401 marcam `expirada` — só a troca de `ativa` para `expirada`
  dispara o alerta `google_ads`. `lerConta` (moeda, fuso, se é de administrador),
  `listarCampanhas`, `campanhasRegistradas` (por plano, da conta em uso) e
  `criarCampanha(plano)` — que, achando campanha com o mesmo nome, só a
  registra se o Palácio ainda não a tinha e ela está pausada, como a criação a deixa
  (a resposta da criação se perdeu; o pedido é uma transação, então ela entrou
  inteira), e recusa nos outros casos; o registro que não pode ser lido (null) trava a
  criação e o cartão avisa; confere a constante
  do local por GAQL (existe, `ENABLED`, com o nome canônico do plano) e manda **um
  pedido só** (`googleAds:mutate`, `partialFailure: false`): ou tudo entra ou nada
  entra. A volta do consentimento distingue "não deu para listar as contas" (null:
  mantém a lista e a escolha de antes) de "lista vazia". O registro é por conta de
  anúncios: trocar de conta mostra só as campanhas criadas na nova.
- **Regras puras** (`lib/google/ads-regras.ts`, sem import nenhum, conferidas por
  `npx tsx scripts/conferir-google-ads.ts`): `PLANOS_DO_GRANTS`, uma campanha por
  página de destino com US$ 5 por dia cada (23/10/2026: o guia "Primeiros socorros:
  o que fazer nas emergências mais comuns", com os grupos Convulsão, Queimadura e
  Emergências comuns, e o "Lei Lucas na prática", com Lei Lucas: o que é e Lei Lucas:
  escolas e creches; palavras de dúvida em correspondência de frase, dois anúncios
  por grupo com até 10 títulos e 4 descrições, seis sitelinks (outros guias, voluntariado
  e /doe/, só "por PIX": o cartão está desligado na /doe/); negativas de animais,
  material de estudo, sangramento que não é ferimento e queimadura de sol; cidade do
  Rio de Janeiro, "Maximizar cliques" com teto de US$ 2 só para começar — a política
  pede lance por conversão quando a conta tiver conversões; UTMs `grants-guia-…` no
  `finalUrlSuffix`). Os textos só prometem o que a página entrega: os guias ajudam a
  reconhecer e a pedir ajuda, as manobras se aprendem com prática.
  `planoPorId`, `problemasDoPlano` (30 letras por título, 90 por
  descrição, 15 por caminho, mínimos do anúncio responsivo, telefone no texto do
  anúncio, sitelink que repete texto de anúncio, negativa repetida, anúncio fora da
  página da campanha e as regras do Grants: dois grupos, dois anúncios por grupo, dois
  sitelinks, nada de palavra única, palavra que a
  negativa derrubaria), `operacoesDaCampanha` (ids temporários negativos, tudo
  `PAUSED`, só a pesquisa do Google, `PRESENCE` na geografia,
  `containsEuPoliticalAdvertising` declarado, operações **agrupadas por tipo**, pai
  antes de filho), `motivoDaFalhaDoAds` (a leitura de `error.details[].errors[]` da
  API: reconectar, acesso do projeto — `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` —,
  conta, pedido, serviço).
- **Armadilhas já pagas na revisão (22/10/2026):**
  - **Sem critério de idioma.** Desde set/2026 a API recusa `LanguageInfo` em campanha
    de pesquisa (`ContextError.OPERATION_NOT_PERMITTED_FOR_CONTEXT`), e com
    `partialFailure: false` uma recusa derruba o pedido inteiro.
  - **A cidade é constante fixa**, `geoTargetConstants/1001655`, conferida pelo nome
    canônico: "Rio de Janeiro" como City no Brasil são duas constantes (1001655 e
    9198038), e a consulta por nome não diz qual vem primeiro.
  - **Telefone não vai no texto do anúncio** (política editorial); vai em extensão de
    chamada. Sitelink não repete título de anúncio (política de Repetição).
  - **Negativa não casa variante**: com e sem acento são duas, plural também. "vaga"
    não é negativa: bloquearia "vagas de voluntariado".
- **Os cursos pagos ficam fora** de propósito: a política de site do Ad Grants
  aceita venda só quando não é o foco e a página de matrícula é de venda. Vender
  curso por anúncio é com conta paga comum, em reais, se um dia houver.
- **Conversões** vêm do GA4 do site (`purchase` na doação, `generate_lead` no
  cadastro de voluntário), importadas no painel depois de vincular a propriedade à
  conta — a vinculação é manual, com o login do Google. Com conversão medida, o lance
  pode passar a "Maximizar conversões".
- **Migração** `20261022135046_cvrj_google_ads.sql` (só acrescenta, a aplicar):
  `google_ads_conexao` (RLS forçado, leitura só de administradores, policy criada só
  se não existe).

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

### 7.34 Velocidade: cache e service worker (28/09/2026)

Relato de lentidão. Medições: o Palácio roda em `iad1` (Washington), perto do
banco (`ca-central-1`); cada tela custa de 150 a 300 ms no servidor; toda tela
baixava ~1,76 MB de JavaScript (sem compressão); e o menu e o "voltar" iam ao
servidor a cada clique. O que foi feito:

- **Cache de telas no navegador** (`experimental.staleTimes.dynamic: 30` em
  `next.config.mjs`): voltar a uma tela visitada há menos de 30 s não vai ao
  servidor. Salvar (as actions chamam `revalidatePath`) e `router.refresh()`
  limpam esse cache, então o que a própria pessoa muda aparece na hora; o que
  outra pessoa mudou pode levar até 30 s para aparecer ao voltar à tela.
- **Avatares e mídias da Biblioteca** (`/api/private-blob`): eram
  `private, no-cache` e voltavam ao servidor (que confere a sessão) a cada tela,
  um pedido por avatar. Agora o avatar é `private, max-age=604800, immutable` (o
  nome muda a cada troca de foto) e o arquivo da Biblioteca, `private,
  max-age=3600`. As outras fotos (voluntário, portaria, bem) já eram de um dia.
- **Imagens fixas** (`/images/*`): um dia de cache e uma semana de
  `stale-while-revalidate` (o padrão da Vercel era conferir a cada tela).
- **Service worker** (`public/sw.js`, registrado por
  `components/app/service-worker.tsx`, só na versão publicada): guarda os
  arquivos do build (`/_next/static`, cache primeiro, no máximo 300) e as
  imagens fixas (mostra o guardado e atualiza por trás), e mostra
  `public/offline.html` quando a navegação cai sem internet. **Nunca guarda
  página, dado de tela (RSC), `/api` ou foto privada**: são de cada pessoa. O
  `proxy.ts` não roda para `sw.js` e `offline.html`. Mudou a lógica do worker?
  Troque `VERSAO` (os caches antigos são apagados no `activate`). Para desligar,
  publique um `sw.js` que chame `self.registration.unregister()`.
- **Portaria** (`AtualizarSozinho`): o recarregamento de 30 s pula a vez quando
  há um campo em foco ou uma janela aberta — ele redesenha a tela inteira e
  engasgava a digitação na recepção.
- **Texto da Ajuda** (~145 KB comprimidos): o download antecipado, quando a dica
  do tour aparece, espera o navegador ficar ocioso (`requestIdleCallback`), para
  não disputar a rede com a própria tela.
- **Fotos em listas** (avatares, retratos, grades de mídia): `loading="lazy"`.

Não mudou (e por quê): a região da Vercel (em `gru1`, cada consulta ao banco no
Canadá custaria ~120 ms), e as páginas continuam dinâmicas (são de cada pessoa).

### 7.35 A sessão em uma ida ao banco (`palacio_sessao`, 28/09/2026)

Medido com o banco a 30 ms (a distância real de Washington ao Canadá): toda
tela precisava de 2 idas em sequência só para começar (Auth → perfil e vínculo),
uma terceira nas áreas com nível de acesso (Financeiro, Patrimônio, Voluntários,
RH) e só então os dados da tela; e o layout somava, em toda página, notificações
(2), aprovações, painel do chat, pessoas, leitor de acessos e avaliador de
envios. Voluntários chegava a 6 idas encadeadas.

- **`public.palacio_sessao()`** (migração `20260929170000`): perfil, vínculos,
  níveis de acesso das quatro áreas, empresas do Financeiro (pela mesma regra da
  política, `private.nivel_fin`), leitor de acessos, avaliador de envios, o
  sino (10 recentes e não lidas), aprovações pendentes, o painel do chat
  (`chat_painel`), as pessoas do chat (mesma regra de `pessoasDoChat`) e a
  arrumação do Início, num JSON só. `security definer` com cada subconsulta
  filtrada por `auth.uid()`: só devolve o que é da própria pessoa ou o que ela
  já enxergava. `anon` não executa.
- **`getSessionContext`** (`lib/session.ts`): sem cookie de sessão, nada de
  rede. Com ele, três coisas em paralelo: `getUser()` (a checagem forte, que
  continua decidindo se há sessão), o RPC e o nível da sessão (local). O pacote
  lido por `lib/sessao/pacote.ts` vai em `context.pacote`; **sem ele** (a
  migração ainda não aplicada, ou erro), as duas leituras de antes entram no
  lugar. É a regra de §10.7 aplicada: o código sobrevive ao banco de ontem.
- **Quem lê o pacote:** o layout de `(app)` (todas as consultas dele), os
  contextos de acesso (`contextoDoFinanceiro`, `contextoDeParticipantes`,
  `contextoDoPatrimonio`, `contextoDaEquipe`, `nivelDeParticipantesSemRedirecionar`),
  o Início (`inicio_preferencias`) e a página do Chat. Cada um com o mesmo
  recuo para a leitura antiga.
- **Páginas achatadas** (sequências que viraram um `Promise.all`): Meu perfil
  (4 rodadas → 1), Voluntários (4 → 1), Financeiro e Patrimônio (cadastros
  junto com os dados), Chamados (feriados junto com o banco), Portaria (quem
  pode ser visitado junto com as visitas da aba) e Compras (nomes, setores e
  andamento das cotações numa rodada só).
- **Chat ao vivo** (`components/app/chat/ao-vivo.tsx`): o cliente do Supabase do
  navegador (~225 KB) entra por `import()` dentro do efeito, depois que a
  página está de pé; era o único uso dele no pacote de toda tela.
- **Como medir:** o Supabase de mentira do scratchpad aceita `LATENCIA_MS` e
  assina os tokens em ES256 (como a produção), então o `getClaims()` do proxy
  confere localmente e cada "onda" de consultas aparece no tempo da página.
  Conferência do parser: `npx tsx scripts/conferir-sessao.ts`.

### 7.36 Verificação do candidato a voluntário (`/voluntariado/[id]#verificacao`, `/verificacao/[token]`, 02/10/2026)

O que havia: a inscrição pública caía em "Inscrições pendentes" e a coordenação
aprovava com um toque, sem conferir nada. A Lei 14.811/2024 (art. 59-A do ECA)
exige certidão de antecedentes de todo colaborador, inclusive voluntário, de
instituição que atende crianças e adolescentes, renovada a cada 6 meses. Guia
completo em `docs/verificacao-de-voluntarios.md`.

- **Banco** (`20261002000000`): `participantes.restricoes`/`verificado_em`;
  `participantes_verificacoes` (uma em andamento por pessoa; hash do link, termo,
  checklist `itens`, `documento_lido`, `sancoes`, `registro_profissional`,
  decisão); `participantes_arquivos` (bucket privado `voluntarios-arquivos`,
  espelho de `equipe_arquivos`; identidade e antecedentes pedem nível 3);
  `participantes_referencias`. Funções da coordenação (`authenticated`, nível
  conferido dentro, auditoria em cada uma) e do link (`service_role`:
  `aceitar_termo_pelo_token`, `registrar_arquivo_pelo_token`,
  `guardar_dados_pelo_token`, `concluir_envio_pelo_token`, `verificacao_pelo_token`,
  `cpf_para_verificacao`). **`mudar_situacao_participante` recriada**: candidato →
  ativo exige a última verificação concluída como apto ou apto com restrição.
  Gatilho de anonimização limpa tudo. Testes: `supabase/tests/verificacao.test.sql`.
- **Regras puras** em `lib/participantes/verificacao/regras.ts` (vocabulário,
  prazos — atestado 90 dias, renovação 6 meses com fim de mês, aviso 15 dias —,
  comparação de nomes, máscara do número, leitura das bases da CGU, trava,
  pendências, régua da decisão, chip, formulários, textos, linhas do parecer),
  conferidas em `scripts/conferir-verificacao.ts`.
- **Link do candidato** (`link.ts`, `app/actions/verificacao-publica.ts`,
  `components/verificacao/formulario.tsx`): sha256 do token com prefixo, 14 dias,
  várias visitas até concluir (diferente da ficha do RH), lembrete a cada 5 dias
  (2×) trocando o token, por e-mail ou WhatsApp. Passos: termo + CPF (cadastro
  sem CPF guarda cifrado; com CPF, tem de bater por HMAC) → documento (reduzido
  no aparelho, sem EXIF) → atestado com data → registro → referências → revisar.
  Até 20 aceites por hora por IP (`participantes_inscricoes_tentativas`).
- **Coordenação** (`app/actions/verificacao-do-candidato.ts`,
  `components/app/participantes/verificacao.tsx`): pedir documentos, checklist
  item a item, "Ler o documento com o Claude" (`documento.ts`: `pedirJsonAoClaude`
  com `anexos`, esquema fixo, sharp ≤ 2000 px; o CPF transcrito vira só
  `cpf_confere` e morre), "Consultar CEIS, CNEP, CEAF e PEP" (`cgu.ts`, chave
  `portal_transparencia`; nunca "nada consta" por falha), referências,
  decisão com trava parcial, "Aprovar com restrição" na lista e no quadro
  Situação, parecer em PDF (`parecer.ts`, `/api/voluntariado/[id]/verificacao/pdf`),
  arquivos por `/api/voluntariado/[id]/arquivos/[arquivoId]` (link assinado de
  1 minuto). Recusar e anonimizar apagam a pasta do Storage.
- **Rotina diária** (`/api/membro/lembretes`): `lembrarCandidatos` e
  `avisarRenovacoesDeAntecedentes` (15 dias antes e no dia seguinte), categoria
  `aprovacoes`.
- **Decisões**: sem biometria facial; CPF nunca em claro fora do banco (só
  HMAC e a consulta à CGU, auditada); leitura automatizada e transferência
  internacional declaradas no termo (`VERIFICACAO_TERMO_VERSAO`); decisão
  humana; nível 1 não vê a verificação (só o selo de restrição). Serpro fica
  preparado (entrada comentada em `chaves.ts`), não ligado.

### 7.37 Mapa do ecossistema (`/mapa`, 03/10/2026)

O levantamento de outubro ("o que já temos, o que falta ligar") deixou de ser
um documento parado e virou uma área do Palácio: Palácio Virtual, site e
plataforma da Escola numa só árvore, com estado por item e as pendências de
cada parte. Guia completo em `docs/mapa-do-ecossistema.md`.

- **Banco** (`20261003210000`): `mapa_itens` (nó da árvore; `tipo`
  sistema/categoria/item, `parent_id`, `estado` só em item — CHECK —,
  `entregas` jsonb, `url`, `ordem`) e `mapa_pendencias` (`R-01`…; `item_id`
  opcional, `situacao` pendente/parcial/feito, `ordem_fila`, `resolvida_em/por`,
  `nota`, mais o texto do levantamento). RLS de membro para ler; escrita só
  pelo servidor. A semente (`20261003210100`) insere os 119 itens e 134
  pendências no espaço `producao` com `on conflict do nothing`.
- **Modelo puro** em `lib/mapa/modelo.ts`: `montarArvore` calcula contagens
  por estado, total, percentual no ar, pendências abertas/feitas e última
  entrega a cada leitura (nada gravado em dobro); `filaDeProximos`, `caminho`,
  `slugDoMapa`. Conferido em `scripts/conferir-mapa.ts`, que também valida
  ids e referências da semente.
- **Tela**: `app/(app)/mapa/page.tsx` lê com `carregarMapa` (sessão do usuário,
  RLS) e entrega ao componente `components/app/mapa/mapa-do-ecossistema.tsx`,
  que desenha a moldura e monta o motor `lib/mapa/ui.ts` (DOM/SVG direto:
  visão geral com cartões e saúde, foco um nível por clique, lista, filtros,
  busca Ctrl K, painel lateral, minimap, visualização completa com três
  níveis de detalhe; endereço no `#`, preferências em `localStorage`
  `mapa-eco:*`). Estilo em `components/app/mapa/mapa.css`, tudo sob `.mapa-eco`.
- **Escrita**: `app/actions/mapa.ts` (`marcarPendenciaDoMapa`,
  `mudarEstadoDoItemDoMapa`) com `requireWorkspace()` + `pode(role,
  'mapa.editar')` (admin e editor), validação por lista fechada, admin client
  filtrado por `workspace_id`, `revalidatePath('/mapa')`. O componente faz
  `router.refresh()` e o motor redesenha com `atualizar` sem perder o foco.
- **Decisões**: motor em DOM direto em vez de React Flow (dezenas de nós
  redesenhados e animados a cada clique; o React cuida só dos dados); item
  novo entra por migração, não pela tela; a equipe da Escola não vê o mapa
  (regra geral do papel `escola`).

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
| Portal da Transparência (CGU) | `consultarCgu` na verificação do candidato (§7.36): CEIS, CNEP, CEAF e PEP por CPF, 4 chamadas em paralelo, 8 s, nunca lança; base fora do ar = "incompleto". Fora de `lib/apis-publicas` porque exige chave | **sim**, gratuita: `portal_transparencia` em Configurações → Integrações (ou `PORTAL_TRANSPARENCIA_KEY`); 90/min |
| Banco Central (PTAX e IPCA, SGS 433) | `IndicadoresDoBc` em Financeiro → Saúde do caixa: dólar, euro, IPCA de 12 meses e calculadora de correção (do primeiro ao último mês, inclusive) | não |
| Tabela FIPE (parallelum) | `ValorFipe` na página do veículo. O valor é consultado de novo no servidor e gravado por `frota_registrar_fipe` (nível 3 do Patrimônio) | não |
| Nominatim / OpenStreetMap | `MapaDoLocal` em pautas com local e nas oportunidades de voluntariado. Cache de 30 dias, respeitando a política de 1 consulta por segundo | não |

Limites que valem conhecer:
- a BrasilAPI de CEP tem entradas "inventadas" em sua base aberta (99999-999
  existe lá);
- a FIPE gratuita tem cota diária;
- o Nominatim exige identificação (User-Agent) e cache.

### 8.5 WhatsApp (Kapso)

O número do Palácio no WhatsApp, pela [Kapso](https://docs.kapso.ai) (API oficial da Meta, número
gerenciado pela Kapso). Configuração no cofre (cartão “WhatsApp (Kapso — API oficial)”: chave
`X-API-Key`, Phone number ID e, opcionais, os nomes dos modelos aprovados — avisos, código e segurança — e o ID da conta,
o WABA); conferência da conexão,
recebimento e teste em `/configuracoes/whatsapp` (só admin). A Evolution API, usada até outubro de
2026, saiu do código.

- **Código:** `lib/whatsapp/regras.ts` (puro: número canônico, textos, leitura do webhook, comandos
  do bot — `npx tsx scripts/conferir-whatsapp.ts`), `kapso.ts` (cliente da Kapso, nunca lança, tira
  a chave do texto de erro), `servidor.ts` (o que o resto do Palácio chama), `bot.ts` (respostas),
  `acoes.ts` (o que o bot faz em nome de quem escreveu), `atendimento.ts` (quem atende chamado),
  `portaria.ts` (as visitas do dia e registrar quem chegou, com a foto), `portaria-regras.ts` (puro: as etapas do
  registro e a ficha de quem é visitado — `npx tsx scripts/conferir-portaria.ts`), `modelos.ts` (puro: o catálogo dos modelos da Meta
  por situação, a escolha do aprovado e a montagem — veja “Portaria pelo WhatsApp com foto”),
  `financeiro.ts` (as decisões do Financeiro e de Compras), `presenca.ts` (a chamada da ação de hoje),
  `frota.ts` (a frota agora e o diário de bordo), `estoque.ts` (o saldo de um material),
  `confirmacoes.ts` (o link de confirmar no Palácio),
  `confirmar-no-palacio.ts` (a tela do link: o que vai ser feito e a execução), `protecao.ts` (o “Não fui eu”),
  `admin.ts` (os comandos da administração), `colaborador.ts` (o cadastro de colaborador em etapas, até o link),
  `colaborador-regras.ts` (puro: as etapas e o resumo — `npx tsx scripts/conferir-colaborador.ts`),
  `colaborador-faxina.ts` (o contato da pessoa nova que venceu sai do banco), `colaborador-confirmar.ts` (a
  confirmação do cadastro no Palácio, pelo núcleo de "Adicionar pessoas"), `estado.ts` (estado da conexão e alertas da rotina),
  `confirmacao.ts` (a gravação da confirmação do número, a mesma para a tela e o bot),
  `app/actions/whatsapp.ts`, `app/api/webhooks/whatsapp` e `app/confirmar/[token]`.
- **Confirmação do número (18/10/2026):** dois caminhos, nos mesmos limites (3 códigos a cada 30 min,
  10 min de validade, 5 tentativas). O **padrão é o código de ida**: “Gerar código” mostra na tela um código
  de 6 dígitos e o botão “Abrir o WhatsApp” (`https://wa.me/<número do Palácio>?text=Confirmar meu WhatsApp no
  Palácio: 123456`; o número vem de `perfilConectado`, e sem ele a tela mostra só o código e a instrução). A
  pessoa manda do próprio número; `atenderMensagem`, antes de tudo, acha o código na mensagem
  (`codigoNaMensagem`: um grupo só de 6 dígitos, sem outro número junto; se o número já está em
  `whatsapp_contas`, só a leitura estrita `soOCodigo` — a mensagem que é só o código ou exatamente a
  mensagem pronta —, para “chamado: patrimônio 123456 sem toner” seguir para o chamado) e, havendo código
  em aberto para o número canônico (`codigosPendentesDoNumero`), confere o hash e confirma pela mesma função do caminho de
  digitar (`confirmarNumeroDaEquipe` / `confirmarNumeroDoVoluntario`: consome o código de forma atômica, grava
  `whatsapp_contas` ou `participantes_whatsapp`, 23505 = número de outra conta, auditoria `whatsapp_confirmado`
  com `caminho`). Responde por lá (confirmado, com a linha do menu; código errado conta tentativa em cada
  código em aberto do número). A tela pergunta a cada 4 s (`conferirConfirmacaoDoWhatsapp` /
  `conferirConfirmacaoDoVoluntario`, só leitura) até confirmar ou o código deixar de valer. Como quem escreve é
  a pessoa, não depende da janela de 24 h nem de modelo. A **alternativa** (“Prefiro receber o código pelo
  WhatsApp”) é a de antes: o Palácio manda o código e a pessoa digita — só chega dentro da janela ou pelo modelo
  de Autenticação (`mandar` com `tipo: 'codigo'` e o próprio `codigo`). O código novo toma o lugar do de ida
  antes do envio: se não sai, a action devolve `codigoTrocado` e a tela volta ao formulário do número (onde está
  o “Gerar código”), em vez de seguir mostrando um código que não vale mais.
  Não há coluna que diga o sentido: o hash leva um sal por sentido (`whatsapp-ida:` × `whatsapp:`, o de volta
  no formato antigo), então o código da tela nunca serve para digitar e o que chegou no número nunca confirma
  mandado ao bot (o bot responde que ele é para digitar, sem contar tentativa).
- **Contrato (docs.kapso.ai, outubro de 2026):** envio pelo proxy da Meta
  (`https://api.kapso.ai/meta/whatsapp/v24.0/{phone_number_id}/messages`, formato da Cloud API);
  mídia recebida por `GET /{media_id}?phone_number_id=…`, que devolve um `download_url` de 4 minutos;
  mídia enviada por `POST /{phone_number_id}/media` (multipart, JPEG ou PNG até 5 MB), que devolve o id, e
  apagada por `DELETE /{media_id}?phone_number_id=…`; a lista dos modelos da conta por
  `GET /{WABA}/message_templates?fields=name,status,category,language&status=APPROVED&category=UTILITY&language=pt_BR&limit=100`
  (até 100 por página; a Kapso documenta só `paging.cursors`, e na prática `next` só vem quando há outra página);
  webhook por número em `https://api.kapso.ai/platform/v1/whatsapp/phone_numbers/{id}/webhooks`.
- **Conexão pela plataforma, não pelo proxy:** no número gerenciado pela Kapso, as leituras pelo proxy da Meta
  (`GET /{phone_number_id}`, templates) voltam 401 da Meta (190, "Cannot parse access token") mesmo com a chave
  certa — o envio funciona. Estado, número e nome vêm de `GET /platform/v1/whatsapp/phone_numbers/{id}` (`status`
  CONNECTED). A mídia tenta o proxy e, se falhar, o `kapso.media_url` do webhook (só `api.kapso.ai`, com a chave).
- **Saúde:** CONNECTED não garante a ligação com a Meta. A conferência da conexão consulta também
  `GET …/phone_numbers/{id}/health` (limitado a um a cada 5 min; sem resposta, vale o status) e mostra "erro" com o
  motivo quando o envio ou o acesso ao número falham (`problemaNaSaude`). O 190 da Meta repassado pela Kapso vira
  "reconecte o número no painel da Kapso", não "chave errada".
- **Nono dígito:** a Kapso confere a janela de 24 h pelo número exato da conversa, e o WhatsApp ainda identifica
  muitos celulares antigos sem o 9 (554898032197). O Palácio guarda e manda com o 9; se a Kapso disser "fora da
  janela", o envio tenta de novo sem o 9 (`numeroSemNonoDigito`) antes de recorrer ao modelo.
- **Janela de 24 h e modelos por finalidade (18/10/2026):** texto livre só para quem escreveu ao número nas
  últimas 24 h. Fora dela a Kapso recusa (422, "outside the 24-hour window"; na Meta, 131047) e o envio recai
  no modelo aprovado da **finalidade**, que é o tipo do registro (`mandar`/`entregar` passam `tipo` como
  `finalidade` a `enviarTexto(config, numero, texto, { finalidade, codigo })`). Os objetos `template` saem de
  `modeloParaEnviar` (puro, em `regras.ts`): **aviso** e **teste** → `modelo` (o id antigo do cofre), com o texto
  achatado na variável `{{1}}` (sem quebras de linha, até 1000 caracteres); **codigo** → `modeloCodigo`, da
  categoria AUTHENTICATION da Meta (a que a Meta exige para códigos): texto fixo da Meta, `components` = corpo
  com o código e botão `url` de índice `0` com o código (botão de copiar), `pt_BR` — sem ele, o código não sai
  fora da janela, nunca pelo modelo dos avisos (e o cartão recusa o mesmo nome nos dois); **seguranca** →
  `modeloSeguranca` ou, vazio, `modelo` (o cartão recusa nele o nome do de Autenticação, que só leva o
  código); **bot** → nunca por modelo (inclusive as boas-vindas depois de
  confirmar pelo código digitado). Sem o modelo, a falha fica registrada com o motivo e não é reenviada. Recusa
  do modelo (132000–132016, 132068, 132069, ou 400/404/422 da Kapso que fala de template) vira texto legível
  (`problemaDoModelo`), motivo `outro`: sem reenvio e sem alerta de queda (o 404 do modelo não vira "número não
  achado"). `/configuracoes/whatsapp` mostra quais modelos estão no cofre e o que acontece sem cada um.
- **Número canônico:** só dígitos, com 55 e o nono dígito do celular. O WhatsApp ainda identifica
  muitos celulares antigos sem o nono dígito; é pela forma canônica que o bot reconhece quem escreveu.
- **Webhook:** o botão “Ligar o recebimento de mensagens” cria (ou acerta) na Kapso o webhook do
  número para `/api/webhooks/whatsapp?w=<espaço>&p=kapso`, só com `whatsapp.message.received`, e uma
  `secret_key` derivada da chave (HMAC). Cada entrega vem assinada: HMAC-SHA256 do corpo cru em
  `X-Webhook-Signature`; sem a assinatura certa, 401. **Não cadastre a URL à mão no painel da
  Kapso** — vai sem a senha. Trocou a chave, ligue de novo. O payload é o v2, avulso ou em lote.
- **Reentrega:** a Kapso tenta mais duas vezes se não receber 200 em 10 s. A rota responde na hora e
  atende depois (`after`); `whatsapp_mensagens` tem trava por id da mensagem, então nada é
  respondido duas vezes. O registro guarda só o comando reconhecido, nunca o texto recebido.
- **Bot:** equipe com número confirmado: `1` avisos sem abrir, `2` marcar como lidos, `3`/`parar`/`voltar`
  pausa ou retoma, `4` agenda de hoje e amanhã (camadas ligadas, mesmo crivo do resumo semanal),
  `5` chamados abertos (que a pessoa abriu ou estão com ela e, para quem atende uma fila, os abertos da
  fila — veja “Quem atende chamado”), `6` aprovações esperando o voto dela, `portaria` as visitas abertas
  do dia (veja “A portaria pelo WhatsApp”), `financeiro` o que espera a decisão dela (veja “Decisões do
  Financeiro e de Compras”), `presença` a chamada da ação de hoje, `veículos` a frota agora, `saída` /
  `retorno` o diário de bordo e `estoque <material>` o saldo (veja “As outras áreas pelo WhatsApp”),
  `ajuda <dúvida>` (busca na Central de ajuda, só nas áreas que ela abre; o Claude resume os trechos
  achados com esforço baixo, e sem chave vão os trechos). O menu vai também como lista (“Botões e
  listas”, abaixo); digitar o número continua valendo. As boas-vindas depois de confirmar pelo código
  digitado trazem o mesmo menu, com as áreas da pessoa (`quemNoMenu`, o cálculo do bot). Número
  desconhecido recebe uma apresentação, no máximo uma vez por dia. Teto de 10 respostas a cada 10 min por
  número (um robô do outro lado não vira conversa infinita).
- **Botões e listas (18/10/2026):** dentro da janela de 24 h, a resposta do bot e o aviso da visita na
  portaria podem levar botões de resposta ou uma lista (`type: "interactive"` da Cloud API, pelo mesmo
  proxy da Kapso). O vocabulário é `Interativo` (`regras.ts`); `objetoInterativo` (puro, testado) monta o
  objeto da Meta cortando títulos (botão 20, linha 24, seção 24, botão da lista 20) e descrições (72) com
  “…”, sem a formatação do WhatsApp, e devolve null — vai só o texto — quando algo não cabe sem perda:
  corpo vazio ou acima de 1024, mais de 3 botões ou 10 linhas, id vazio, acima de 40 ou repetido (o id
  nunca é cortado: cortado, seria outro comando), título repetido entre botões, mais de uma seção sem
  título. **O id de cada botão ou linha é exatamente o texto que o comando digitado aceita**: o toque chega
  como `interactive.button_reply.id` / `list_reply.id` (`lerMensagemDaKapso` já os lia como o texto; agora
  marca `toque`) e segue por `lerPedido`, `lerDecisao`, `lerEscolha`, `ehConfirmacao`, `ehPular`,
  `lerRespostaDaVisita` sem caminho novo. O corpo é o texto inteiro, que continua dizendo o que digitar.
  Onde há: o **menu** (lista “Ver as opções”: `1`, `2`, `parar` ou `voltar` (a linha do 3 leva a palavra do
  rótulo, não o `3` que alterna pelo estado da hora: o toque numa lista antiga nunca faz o contrário do que a
  linha diz), `4`–`6`, depois `portaria`, `financeiro`, `presenca` e
  `veiculos` para quem tem a área — nessa ordem, enquanto cabem — e, para quem administra, `status` e `fila`,
  numa seção “Da administração” — no máximo 10 linhas, o teto da Meta; `interativoDoMenu`, das mesmas opções
  de `textoDoMenu`; a área que não cabe na lista continua no corpo, e o corpo cabe sempre nos 1024: com áreas
  demais, as linhas delas viram uma só, `linhaCurtaDasAreas`); a
  **conferência do voto** e as de resolver, transferir e registrar visita (`confirmo` / `cancelar`,
  `BOTOES_DA_CONFERENCIA`); as escolhas de equipe e assunto da transferência e de pessoa da visita (lista,
  `interativoDaEscolha`), e o motivo da visita (`pular` / `cancelar`, `BOTOES_DOS_DETALHES`); a ação, o
  veículo, quem dirige e a finalidade (lista), a chamada (`todos` / `cancelar`, `BOTOES_DA_CHAMADA`), o
  hodômetro da saída (`mesmo` / `cancelar`, `botoesDoHodometro`) e as ocorrências do retorno
  (`BOTOES_DOS_DETALHES`); os passos do **chamado** — equipe, assunto e
  urgência em lista (`interativoDaEscolha`: `1`…`n` com o nome e o detalhe, mais a linha `cancelar` quando
  cabe; a urgência é lista, não botões, porque “Atrapalha meu trabalho” passa dos 20 caracteres e a ajuda
  de cada uma vai na descrição) e os detalhes com `pular` / `cancelar` (`BOTOES_DOS_DETALHES`); e o
  **aviso da visita** (`interativoDoAviso`: `1`, `2`, `3`, com o rótulo de `RESPOSTAS` quando cabe em 20,
  senão o curto). No envio (`enviarTextoKapso`), o interativo vai antes, com a mesma segunda tentativa sem
  o nono dígito; recusado pelo formato (motivo `outro`, ou `numero` — a Meta dá “não entregue” a WhatsApp
  antigo demais para botões), vai o mesmo texto (`interativoCaiNoTexto`); fora da janela, segue direto para
  o modelo da finalidade, sem botão (o texto cairia igual); sem confirmação a tempo, não repete. `mandar`,
  `entregar` e `registrar` seguem iguais (`interativo` é opcional; o registro é o de sempre). A fila guarda
  só o texto: o que espera nela sai sem botões, menos o aviso da visita, que `enviarAgora` remonta pelo
  link. **O toque nunca cai na pergunta mais nova:** a Meta manda a mensagem tocada (`context.id`), então o
  bot só usa a pendência daquela mensagem (`estrita`); na lista do menu (a saída é registrada com
  `whatsapp_mensagens.comando = 'menu'`, `citouOMenu`), vale o comando, e o atalho da portaria sem citar
  não roda (o “1” do menu são os avisos); em qualquer outra mensagem que não é a pergunta aberta (a lista
  de equipes de um chamado que já passou dessa etapa, a conferência respondida), responde que a pergunta
  não vale mais — o “2” dela não escolhe o assunto nem marca os avisos como lidos. Por isso só leva botões
  a mensagem com pergunta guardada (`Resposta.interativo` só vale com `pergunta`) e o menu. O aviso de
  segurança que ensina o “NÃO FUI EU” leva o botão dele, remontado pelo texto (veja “Não fui eu”). Sem migração.
- **Comandos da administração (18/10/2026)** (`lib/whatsapp/admin.ts`): para quem tem
  `integracoes.configurar` (a permissão de `/configuracoes/whatsapp`) e número confirmado, `lerPedido`
  reconhece `status` (ou `diagnóstico`, `saúde`) e `fila` (ou `fila agora`, `enviar fila`) — só como a
  mensagem inteira, para "fila" numa frase não rodar nada; para os outros, seguem o caminho de sempre e dão
  `desconhecido` (e `respostaDaAdministracao` confere a permissão de novo). O menu ganha a linha deles só
  para quem administra. `status` só lê, em paralelo: `situacaoDaConexao` (com o exame de saúde),
  `situacaoDoWebhook`, `resumoDaFila`, `cotaDeConversas` (as conversas iniciadas em 24 h, `textoDaCota`),
  as falhas de saída das últimas 24 h em `whatsapp_mensagens` agrupadas
  por motivo (`tipoDaFalha`/`resumoDasFalhas`, pelo começo do texto de erro que `kapso.ts` grava; o que não é
  conhecido agrupa pelo próprio erro, cortado), `situacaoDasChaves` (só os nomes sem chave, nunca valores),
  `google_conexao`/`google_admin_conexao` com estado `expirada`, o Google Drive (`driveNoStatus`: conectado com a
  pasta raiz, expirado ou sem conexão — §7.29c), a última sincronização de cada conta ativa da
  Escola (`escola_contas` e `escola_meta_contas`: `sincronizada_em` e `sincronizacao_erro`, o texto que
  `lib/escola` grava, sem chave nem dado de aluno; `situacaoDaSincronizacao`: o erro manda, depois nunca leu,
  mais de 30 h sem leitura certa — a rotina é diária — ou em dia; uma linha quando está tudo em dia, até 4
  contas com problema; sem conta ativa, a linha não sai) e a última execução da rotina; a resposta sai
  de `textoDoStatus` (puro). `fila` roda `processarFila` (90 s, 20 itens) e responde com `textoDaRodadaDaFila`,
  o mesmo texto do botão “Enviar a fila agora”. `fila` não age em nome de ninguém (qualquer mensagem ao número
  já faz a fila andar), então vale também com verificação em duas etapas. O registro é o de sempre
  (`whatsapp_mensagens.comando` = `status`/`fila`).
- **Ações pelo bot** (`lib/whatsapp/acoes.ts`): responder citando o aviso manda o texto para onde o
  link do aviso aponta (`alvoDoLink`: chamado, Chat, mensagem direta, aprovação; o aviso de um ofício
  só devolve o link — veja “As outras áreas pelo WhatsApp”) — a mensagem de
  saída guarda o id do WhatsApp e o `notificacao_id`. Na aprovação, `aprovar` manda a conferência
  do setor e só vota depois de `confirmo` (ou do botão “Confirmo”); `ajustes: …` vota na hora. `chamado: …` abre chamado
  perguntando equipe, assunto, local (se pedir), urgência e, por fim, detalhes opcionais
  (`pular` ou `não` abre só com o relato; `cancelar` desiste) — equipe, assunto e urgência também em lista,
  e os detalhes com os botões “Pular” e “Cancelar” (veja “Botões e listas”). As perguntas em aberto ficam em
  `whatsapp_pendencias` (15 min). Sem citar, a pergunta aberta só leva o que parece resposta a ela (a escolha,
  `confirmo`/`cancelar`, o que não é comando e, na de texto livre — `esperaTextoLivre`: o local e os detalhes
  do chamado, o nome e o motivo da visita, o veículo e o destino da viagem —, três palavras ou mais ou o nome
  de setor que também é comando de área, `COMANDOS_DE_AREA`: “Financeiro”, “Portaria”, “Chamada”,
  “Veículos”, “Estoque central”); `menu`, `avisos` e cia. seguem valendo, e `cancelar` desiste. Tudo passa
  pelas mesmas regras da tela: `lib/chamados/nucleo.ts`, `lib/chat/avisos.ts`, `lib/aprovacoes/avisos.ts`,
  `lib/mensagens/avisos.ts`, e o Chat e o voto pelas funções `whatsapp_chat_enviar` / `whatsapp_votar` (só
  service role), que chamam `chat_enviar` e `vote_on_approval` como a pessoa, numa sessão simulada **aal1**.
  Por isso quem
  usa (ou é obrigado a usar) a verificação em duas etapas só consulta, abre chamado e responde à
  portaria pelo WhatsApp (abrir chamado ficou liberado em 27/09/2026: só cria o pedido no nome de
  quem escreveu): responder, votar, atender chamado, registrar visita, marcar presença, registrar saída e
  retorno de veículo e mandar fotos, o servidor recusa antes (`podeAgirPeloWhatsapp`), e o banco recusa de
  novo no Chat, no voto, no registro da visita, na presença e na viagem. Não há exceção para quem atende chamado. O voto dessa pessoa (`aprovar` / `ajustes: …`
  respondendo o aviso) vira o link de confirmar no Palácio (`votarPeloPalacio`; veja “Confirmar no
  Palácio”).
- **Quem atende chamado pelo WhatsApp (18/10/2026)** (`lib/whatsapp/atendimento.ts`): quem atende a
  fila do chamado (`filasQueAtendo`/`papeisNoChamado`: a equipe da fila e quem tem `chamados.ver_todos`)
  age pelo comando com o código — `assumir TI-0042`, `resolver TI-0042: troquei o toner`, `transferir
  TI-0042 para Manutenção: motivo` (`lerAtendimento` e `lerTransferencia`, puros; o código digitado
  `ti-42` vira `TI-0042`; sem código, não é comando; pergunta, como “Resolvido?”, nunca é) — ou respondendo
  ao aviso do chamado, só na forma que não deixa dúvida (`lerAtendimentoNoAviso`: `assumo`, `resolvido…`,
  `resolver:` com os dois-pontos — “resolver amanhã” é conversa —, `transferir para …`; ali um “código” que
  não é o do aviso faz parte do texto, e o resto continua indo ao chamado como mensagem). Tudo passa pelas funções da tela
  em `lib/chamados/nucleo.ts`, com `canal: 'whatsapp'` no evento: **assumir** é o “Atender” (novo → em
  atendimento, que faz da pessoa a responsável se não havia) e, se o chamado estava com outra pessoa ou
  já andava, o responsável da triagem (`atribuirNoChamado`); vai direto. **Resolver** pede a solução (5+
  letras, como a tela) e a conferência; **transferir** acha a equipe pelo nome ou prefixo
  (`acharPeloNome`; senão, a lista das outras filas ativas), pergunta o assunto (se houver mais de um) e
  o motivo, e termina na conferência. Respondendo ao aviso, a conferência de “resolvido” lembra que podia
  ser só uma mensagem. As etapas ficam em `whatsapp_pendencias` (tipo `atender_chamado`, migração
  `20261018213700`); o chamado é relido a cada passo e a pergunta acaba se ele sair da fila da pessoa.
  Quem só abriu o chamado recebe a orientação de responder o aviso; quem não tem papel nele, “não
  achei”. O `5` de quem atende traz, depois dos dele, os abertos da fila que não estão com ele (sem
  responsável primeiro, depois a prioridade e o mais antigo; até 5) e a dica dos comandos
  (`DICA_DO_ATENDIMENTO`); o menu diz isso no `5`.
- **A portaria pelo WhatsApp (18/10/2026)** (`lib/whatsapp/portaria.ts`): para quem tem a portaria (a
  regra da tela e de `private.pode_portaria`: membro do Palácio, menos a equipe da Escola; para os
  outros, as palavras caem no menu), `portaria` (ou `quem está aqui`, `visitas`, `visitantes`, só como a
  mensagem inteira) lista as visitas abertas de hoje — entrou hoje e não saiu, ou chegou pelo QR e falta
  confirmar —, da mais recente para a mais antiga, até 10, só com o nome do visitante, para quem
  (`quemVisita`), a hora e a situação (`situacaoDaVisitaNaLista`); é consulta, vale com a verificação em
  duas etapas. `visitante: <nome>` (ou `registrar visita`) registra a chegada em etapas: o nome (se não
  veio), para quem (`acharPeloNome` em `pessoasParaVisitar`, a equipe ativa; uma pessoa segue, até 9 viram
  a lista para escolher, mais do que isso pede mais do nome; `setor: …` grava em `visitado_texto`, sem
  aviso), as opcionais do cadastro do QR (desde 19/10/2026: telefone, autorização do visitante, de onde vem,
  motivo, crachá e foto — veja “Portaria pelo WhatsApp com foto — o registro”) e a conferência. O registro é a
  mesma `portaria_registrar_entrada` da tela,
  chamada como a pessoa por `whatsapp_portaria_registrar_entrada` (só service role, sessão aal1: o banco
  confere de novo a portaria e a verificação, e `registrado_por` é a pessoa), e o aviso é o mesmo
  `avisarVisitado` — quem é visitado recebe a ficha (desde a etapa 3) e responde pelos botões ou com 1, 2 ou 3,
  e quem registrou recebe a resposta.
  Documento fica na tela. As etapas usam `whatsapp_pendencias` (tipo `registrar_visita`).
- **Confirmar no Palácio (18/10/2026)** (`lib/whatsapp/confirmacoes.ts`, tela `app/confirmar/[token]`,
  tabela `whatsapp_confirmacoes`, migração `20261018223000`): o que é sensível e foi pedido pelo WhatsApp
  não acontece no bot — decidir uma despesa (`decidir_despesa`) ou uma compra (`decidir_compra`), o voto
  de quem usa a verificação em duas etapas (`votar_aprovacao`), o “desativar conta:” de quem gerencia
  usuários (`desativar_conta`) e o cadastro de colaborador (`cadastrar_colaborador`, migração `20261019050000`).
  O bot responde com “Confirme no Palácio: <link>”
  (`textoDoLinkDeConfirmacao`). O link: código de 32 bytes (base64url), no banco só o sha-256 com prefixo
  próprio (`hashDaConfirmacao`); vale 15 min (`CONFIRMACAO_VALE_MIN`); uso único (`consumirConfirmacao`,
  UPDATE condicional: dois cliques, só um passa); amarrado a quem pediu (a tela lê pela sessão, e a
  policy de `whatsapp_confirmacoes` só deixa o dono ler — o link de outra pessoa é “não vale para a sua
  conta”); um pedido novo para a mesma ação e alvo invalida o anterior; até 20 links por pessoa por hora.
  A resposta com o link que esperou na fila (teto do minuto, falha com reenvio) tem o texto apagado de
  `whatsapp_fila` depois do envio ou da desistência, como o convite.
  A página fica fora do grupo `(app)`, como `/verificacao`: sem sessão, vai à entrada com `?voltar=`; com
  o código do app pendente, a `/verificacao?voltar=` (o mesmo portão de `requireWorkspace`, a mesma
  verificação das telas); a equipe da Escola não abre voto nem desativação. Mostra o que vai ser feito
  lido AGORA (`descrever`, pela sessão: despesa já decidida, rodada encerrada, conta já desativada viram
  “não dá para confirmar”), e “Confirmar” (`confirmarNoPalacio`) gasta o link e executa pela MESMA função
  da tela (`executar`): `decidirAprovacao`, `decidirPedido`, `votarNaRodada` (a conferência do setor é
  marcada na própria tela e conferida antes de gastar o link), `desativarUsuario` e, no cadastro de
  colaborador, `cadastrar` do núcleo de "Adicionar pessoas" (§8.5). Grava `usado_em` e
  `resultado`, deixa `whatsapp_confirmado` (ou `whatsapp_confirmacao_recusada`) em `activity_log` e
  responde pelo WhatsApp (tipo `bot`). Pagar, conciliar, fechar o mês, assinar ofício, mudar papel,
  remover a verificação em duas etapas, mexer em chaves e recuperar senha não têm caminho pelo WhatsApp.
- **Decisões do Financeiro e de Compras (18/10/2026)** (`lib/whatsapp/financeiro.ts`): `financeiro` (ou
  `despesas`, `compras`, `pendências financeiras`…, só como a mensagem inteira; quem não decide cai no
  menu) lista, numerado, o que espera a decisão da pessoa — até 8, com valor, descrição e fornecedor e
  quem pediu (`textoDasDecisoes`). Quem decide é quem a tela deixa, lido sem sessão como o banco lê
  (`private.nivel_fin`: admin tudo; a equipe da Escola, só o acesso aos livros da Escola; os outros, o de
  todas as empresas ou o daquela): despesa pendente com nível ≥ 3 e que a pessoa não lançou; compra em
  aprovação na vez do Financeiro (nível ≥ 3, não aprovou pela Diretoria) ou da Diretoria (`pessoasDaDiretoria`,
  não aprovou pelo Financeiro), nunca quem pediu. A lista fica em `whatsapp_pendencias` (tipo
  `financeiro`, só os ids e a vez); `aprovar 2` / `recusar 2: motivo` (`lerDecisaoFinanceira`; recusa com
  5+ letras; na compra, o texto depois do aprovar vai como observação) relê o item — se mudou, “não espera
  mais a sua decisão” — e vira o link de confirmar. O número sozinho ensina o comando (não vira o `2`
  dos avisos lidos). Vale com a verificação em duas etapas: daqui só sai o link. O menu ganha a linha e a
  linha da lista `financeiro` para quem decide (`QuemNoMenu.financeiro`; a lista chega às 10 linhas da
  Meta com tudo).
- **Desativar conta pelo WhatsApp (18/10/2026)** (`pedirDesativacao`, em `lib/whatsapp/admin.ts`): para
  quem tem `usuarios.gerenciar`, `desativar conta: <nome ou usuário>` (`lerDesativarConta`; para os
  outros, “desativar” continua pausando os avisos) acha a pessoa ativa (`acharPeloNome`, com o usuário
  como apelido; a própria pessoa fica de fora) e responde com o link; mais de uma, a lista com os
  usuários. A desativação é a da tela, ao confirmar.
- **Cadastro de colaborador pelo WhatsApp (19/10/2026)** (`lib/whatsapp/colaborador.ts`, regras puras em
  `lib/whatsapp/colaborador-regras.ts` — `npx tsx scripts/conferir-colaborador.ts`): para quem tem
  `usuarios.gerenciar` e o número confirmado — inclusive com a verificação em duas etapas (decisão do dono,
  19/10/2026: a conversa não cria nada, e o link de confirmar exige a sessão com a verificação em dia),
  `colaborador: <nome>` (também “novo colaborador”, “cadastrar colaborador”; `lerColaborador` — “colaborador”
  sozinho no começo só com os dois-pontos; para os outros, não é comando; sem o nome, o bot pergunta) é a semântica
  de “Adicionar pessoas” para UMA pessoa, em etapas guardadas em `whatsapp_pendencias` (tipo
  `cadastrar_colaborador`): o nome (nome e sobrenome, sem número nem pergunta) → a busca na equipe (o Diretório
  montado pelo serviço com `montarDiretorio`: as contas do espaço, as fichas do RH sem login e a lista oficial;
  `quemTemONome`) — quem JÁ tem conta com o nome igual para o cadastro, sem duplicar (com o caminho do convite
  pendente ou da reativação); quem está sem acesso com o nome (igual ou pelo começo das palavras, até 9) vira o
  “é esta pessoa?” (botões com uma, lista com “Outra pessoa” com várias), e a escolhida reaproveita a ficha e o
  nome do RH → e-mail (`emailValido`; o em uso por outra conta volta, como na tela) → WhatsApp (`numeroCanonico`;
  ligado a outra conta é só aviso, que vai ao recibo e ao resumo) — um dos dois, porque o convite precisa de um
  canal (sem e-mail, o endereço escrito na pergunta do WhatsApp vale; só e-mail sem o Resend, pede o WhatsApp) —
  → coordenação (a lista oficial `nomesDosSetores`, pelo número ou pelo nome; como lista do WhatsApp quando cabe,
  senão numerada no texto com os botões; “Sem coordenação” vale) → cargo → papel (o sugerido pela coordenação,
  `papelSugerido` com `semAdmin`; três botões; administrador recusado: só pela tela) → com WhatsApp, o pedido da
  ficha do RH no convite. Da ficha escolhida, “Usar o da ficha” pega o e-mail, o celular, a coordenação e o cargo:
  o e-mail e o celular são lidos dela na hora (`contatoDaFicha`), nunca guardados antes da escolha. “Pular” e
  “Cancelar” onde cabe; o “não” responde (outra pessoa, sem e-mail, sem WhatsApp, sem cargo, não pedir a ficha)
  nas etapas de `ETAPAS_DO_CADASTRO_EM_QUE_NAO_RESPONDE`. As perguntas nunca esperam na fila (`perguntaSemFila`).
  O bot NÃO cria nada: no fim, a pergunta encerra (só uma entrega passa), o pedido passa por `conferirCadastro`
  (os canais ligados agora, `semAdmin`), o usuário sugerido sai de `usuarioLivre` (como a tela gera) e vai o
  resumo mascarado (`oQueDoCadastro`: `linhasDoCadastro`, `mascararEmail`, `mascararNumero`) com o link de
  confirmar (`whatsapp_confirmacoes`, ação `cadastrar_colaborador`, 15 min, uso único; os dados levam o pedido de
  “Adicionar pessoas”, o usuário sugerido e o contato nas chaves `email` e `whatsapp`; o alvo é a ficha
  reaproveitada ou um id novo, porque a conta ainda não existe), que sai na hora (`Resposta.semFila`). Sem a
  migração `20261019050000`, o banco recusa a pergunta e o bot responde que o cadastro é pela tela “Adicionar
  pessoas”, com o link.
  A confirmação (`lib/whatsapp/colaborador-confirmar.ts`, ramo próprio de `descrever`, `faltaNaConferencia` e
  `executar` em `confirmar-no-palacio.ts` — nunca cai no de desativar conta): a página exige a sessão de quem pediu,
  a verificação das telas e, aqui, `usuarios.gerenciar` (a equipe da Escola não abre). `descreverCadastro` lê o
  pedido do link (`pedidoDoLink`) e confere AGORA com `conferirCadastro` (os canais ligados agora, a lista
  oficial, `semAdmin`), a ficha do RH ainda sem login e o e-mail ainda livre; mostra o resumo mascarado
  (`linhasDoCadastro`) e dois campos, o usuário (o sugerido, ou o próximo livre se foi tomado) e o papel (só os de
  `PAPEIS_DA_CONFIRMACAO`, sem administrador) — o resto muda só pela tela “Adicionar pessoas”. “Confirmar o
  cadastro” confere de novo com o usuário e o papel escolhidos (`faltaNoCadastro`, `conferirAjustes`; usuário em
  uso volta sem gastar o link), gasta o link (`consumirConfirmacao`: dois cliques, uma conta) e executa
  `cadastrar(admin, sessao, ambiente, pedido, { usuario, semAdmin: true, origem: 'whatsapp' })` pela sessão de
  quem confirma, depois `revalidarContas({ equipe: true })`. Os dados vêm de `c`, lido antes de gastar (ao gastar,
  o gatilho tira o contato da linha). O resultado (`textoDoResultadoDoCadastro`: a conta, o usuário, por onde o
  convite foi — o WhatsApp a quem nunca escreveu ao Palácio pode ficar na fila ou falhar, e sem e-mail a
  recomendação de cadastrá-lo; tudo mascarado) vai à tela, ao histórico da confirmação, ao `activity_log`, ao
  WhatsApp de quem pediu (`avisarResultadoPeloWhatsapp`) e ao sino (`notificar`, categoria `equipe`, sem WhatsApp
  repetido). O convite segue o caminho de sempre (`mandarConvite`/`entregar`): nenhum modelo novo da Meta.
  Privacidade: o e-mail e o WhatsApp da pessoa nova vivem só nos dados da pergunta e do link. O gatilho
  `private.whatsapp_cadastro_sem_contato` (migração `20261019050000`) tira as chaves `email` e `whatsapp`
  (`CHAVES_DE_CONTATO`) quando a pergunta se encerra (por qualquer caminho, inclusive os que encerram todas as
  perguntas da pessoa) e quando o link é usado ou substituído; o que vence sem encerrar sai pela faxina
  (`redigirCadastrosEncerrados`, `lib/whatsapp/colaborador-faxina.ts`: a pergunta fica só com a etapa, o link
  vencido perde o contato), no começo e no fim de cada cadastro e quando a fila anda (no máximo a cada 30 s). Nos
  textos, só mascarado; nada disso vai a `whatsapp_mensagens` (só o comando) nem a log. O menu de quem gerencia
  usuários ganha a linha `LINHA_DO_CADASTRO` (só no corpo: pede texto). O assistente não tem ferramenta para isso
  (o teto é 20): o prompt manda ensinar o `colaborador:` e o nome. Teste do banco:
  `supabase/tests/whatsapp-cadastro-colaborador.test.sql`.
- **Autocadastro de colaborador pelo WhatsApp (23/10/2026)** (`lib/whatsapp/autocadastro.ts`, regras puras em
  `lib/whatsapp/autocadastro-regras.ts` — `npx tsx scripts/conferir-autocadastro.ts`; migração
  `20261023120000`): quem ainda NÃO tem conta manda `quero me cadastrar` (o link `wa.me/<bot>?text=…`, de
  `linkDoBot`, vai onde quiserem — a conversa é sempre privada, o bot não lê grupo) e o bot conduz, só por
  mensagem: nome → coordenação (lista oficial) → cargo → e-mail pessoal → nascimento → CEP (BrasilAPI/ViaCEP; a rua
  só é perguntada se o CEP não achar) → número → complemento → contato de emergência → **foto do rosto** (a imagem
  vai já ao Blob privado `equipe-cadastro/…`, pois a mídia da Meta não dura até a aprovação) → ciência (LGPD).
  O estado vive em `colaborador_autocadastros` (um aberto por número; vence em 7 dias; no máximo 3 pedidos por
  número em 24 h e 30 por hora no espaço; RLS forçada, sem policy). Dados pessoais e foto saem quando o pedido
  acaba (`private.autocadastro_sem_dados_pessoais`; chaves = `CHAVES_PESSOAIS`, mudou lá, muda no gatilho).
  **Aprovação (decisão do responsável, 23/10/2026 — contraria o "só no link do Palácio" do cadastro pelo
  `colaborador:`):** quem tem `usuarios.gerenciar` e número confirmado recebe o resumo mascarado com a foto e os
  botões Aprovar/Recusar (ou escreve `cadastros`); "Aprovar" pede um segundo toque ("Sim, criar") e o primeiro a
  tocar trava o pedido (`aprovando`). Os ids dos botões são `cad:<a|r|s|v>:<uuid sem hífens>` (38 caracteres; o teto
  da Meta é 40). Depois: a ficha do RH (`whatsapp_autocadastro_criar_ficha`, só service role, mais
  `equipe_preencher_pelo_convite` — a mesma função da página pública, que cifra e valida), a conta do Google
  (`nome.sobrenome@`, com 2, 3… se ocupado) e o aviso à pessoa. A senha provisória vai ao **WhatsApp da pessoa**, com o passo
  a passo (`textoDaContaCriada`; decisão do responsável em 23/10/2026, que reverte a de 15/10: o e-mail pessoal só
  recebe se o WhatsApp falhar). Sai uma vez, nunca é gravada (categoria `conta`: o texto some da fila depois do envio)
  e o Google obriga a trocá-la no primeiro acesso. Pedido preso em `aprovando` por mais de 10 min volta a `aguardando`
  (`soltarPedidosPresos`).
  **Acompanhamento:** todo aprovador (`usuarios.gerenciar` com número confirmado) recebe a cada pedido novo e a cada
  desfecho (aprovado, recusado, falha com o motivo), menos quem acabou de agir; só nome e resultado, nunca dado pessoal
  (`avisarAcompanhamento`). O cargo oferece o botão "Coordenador(a)", que vira "Coordenador(a) de <setor>". O endereço do
  setor (`setores.email`) só recebe a pessoa se já for **grupo** do Google; hoje eles são apelidos do Gmail (a conta nasce
  e o aviso diz que ela não entrou no grupo). Criar o grupo no lugar do apelido muda a entrega do setor: é decisão à parte.
  **Coordenador de setor (23/10/2026, migração `20261023140000`, tabela `setor_coordenadores`):** quem coordena um setor
  é guardado **pelo número do WhatsApp** (pode ainda não ter login no Palácio). Entra por conta própria: no
  autocadastro escolhe o cargo "Coordenador(a)" (`ehCoordenador`), um **administrador** aprova (o resumo avisa que a
  pessoa vira gerente do grupo e passa a aprovar a equipe) e `executarCriacao` o registra. Daí em diante ele recebe e
  aprova — com os mesmos dois toques — **só o cadastro da equipe do próprio setor** (`podeDecidir`: nunca outro setor,
  nunca outro coordenador; o cargo de coordenador é só de administrador). `atorDeAprovacao` junta as duas fontes
  (administrador pela conta, coordenador pelo número); a ficha, a conta e a auditoria seguem o mesmo caminho, com
  `aprovado_por` em `activity_log`. O comando `link do time` devolve, a quem coordena, o `wa.me` com o setor já
  escolhido (`quero me cadastrar em <setor>`: a pessoa pula a pergunta da coordenação). Sem a migração, só o
  administrador aprova. Revogar: `revogado_em` (sem tela ainda).
  **Endereço do setor como grupo do Google (23/10/2026, `lib/google/grupos-regras.ts` — `npx tsx
  scripts/conferir-grupos.ts`, contra um Google de mentira):** os endereços dos setores eram APELIDOS de uma caixa
  (contato@); apelido e grupo não convivem com o mesmo endereço. Quando um **administrador** aprova um cadastro num setor
  cujo endereço ainda é apelido, `converterEmGrupo` tira o apelido, cria o grupo e o **libera para receber de fora**
  (`whoCanPostMessage: ANYONE_CAN_POST`, `alt=json` — sem isso o endereço público do setor deixaria de receber), e põe a
  caixa antiga como membro (o e-mail segue chegando onde chegava). Qualquer falha desfaz o que já foi feito (apaga o grupo,
  devolve o apelido). Caixa real (o endereço é o principal de um usuário, como contato@) nunca se converte; grupo que já
  existe não se mexe. A confirmação do administrador mostra o que vai mudar (`avisoDaConversao`). Coordenador aprovando
  NÃO converte (só administrador): se o endereço ainda é apelido, a conta nasce, a pessoa não entra no grupo e os
  administradores são avisados. Quem entra como coordenador(a) é **gerente** do grupo (`MANAGER`), os demais **membros**;
  membro que vira coordenador é promovido e dono/gerente nunca é rebaixado. A conversão exige duas permissões novas da
  conexão de administrador — `admin.directory.group` e `apps.groups.settings` (e a API Groups Settings ligada no projeto
  do Google Cloud): reconectar o administrador depois do deploy. Efeito colateral conhecido: o envio pelo Palácio "como
  ti@" (send-as no Gmail da caixa dona do apelido) pode precisar ser reverificado.
  **Diagnóstico do 403 (23/10/2026):** o Google responde "Not Authorized to access this resource/api" tanto quando o
  token não recebeu as permissões (a tela de consentimento deixa desmarcar) quanto quando a conta não tem o privilégio de
  Grupos no Admin do Google. `dicaDeAcessoNegado` (lib/google/diretorio.ts) consulta o `tokeninfo` e diz qual: lista o que
  FALTA no token ou, se está completo, aponta a conta/os Controles de API. O comando `grupos` (só administrador, só
  leitura; `situacaoDosGrupos`) mostra esse diagnóstico e, para cada setor, se o endereço é grupo, apelido de quem, caixa
  real ou inexistente.
  O comando também roda uma **sonda** (`sondarAcesso`): lê uma página de usuários e uma de grupos. Se usuários vai e grupos
  não, o problema é o serviço *Grupos para empresas* desativado na organização (Admin Console → Apps → Google Workspace),
  não o token nem a conta.
  **O 403 que travou a primeira troca (23/10/2026):** com o endereço de um APELIDO, o Google responde 403 ("Not Authorized
  to access this resource/api") a `groups.get` — não 404. A sonda provou: ler usuários ✅, ler grupos ✅, só o `groups.get`
  do apelido caía. Por isso `consultarEndereco` pergunta primeiro pelo USUÁRIO (o apelido aparece, `primaryEmail`
  diferente) e só depois pelo grupo, e o coordenador (que não converte) usa `colocarSeForGrupo`: apelido nunca recebe
  chamada de grupo. Logo depois de tirar o apelido o Google ainda pode responder 409 à criação do grupo: tenta de novo
  (6×, com espera) e, se nunca libera, devolve o apelido. Falha na ficha ou no Google devolve o pedido a `aguardando` (a ficha criada é
  reaproveitada); depois que a conta do Google existe, o que falhar vira aviso, nunca desfaz. Ainda NÃO cria
  login do Palácio (isso segue por `colaborador:` / "Adicionar pessoas") e a foto fica em
  `equipe_membros.foto_cadastro_path` (o crachá e a ficha ainda não a leem). Sem a migração, "quero me cadastrar"
  cai na apresentação de sempre.
- **“Não fui eu” (18/10/2026)** (`lib/whatsapp/protecao.ts`): o aviso de segurança de algo que a própria
  pessoa faria (`ofereceNaoFuiEu`: acesso de aparelho ou país novo, entrada bloqueada, senha trocada por
  ela ou pelo link, verificação mexida por ela, e-mail trocado, e `AVISO_AO_NUMERO_ANTIGO`) leva
  `LINHA_DO_NAO_FUI_EU` (“Responda NÃO FUI EU se não foi você…”). A entrega (`enviarAgora`) reconhece o
  aviso pelo texto — também o que esperou na fila — e põe o botão “Não fui eu” (`BOTAO_DO_NAO_FUI_EU`, id
  `nao fui eu`, só dentro da janela) e a marca `nao_fui_eu` em `whatsapp_mensagens.comando`. A resposta
  (`ehNaoFuiEu`: “não fui eu”, “não foi eu”, “não reconheço”…, ou o toque) é tratada logo depois do código
  de ida, **pelo número**: acha o aviso marcado que saiu para ele, citado (até 7 dias) ou, sem citar, o mais
  novo das últimas 24 h — citando outra mensagem (o aviso do Chat, de um chamado), segue o caminho de sempre
  (`responderAoAviso`) —, e a conta é a `user_id` dele — vale do número antigo, que já não está em
  `whatsapp_contas`, e mesmo com a verificação em duas etapas (é proteção, não ação em nome da pessoa); não
  vale se o número foi confirmado em outra conta depois. Cada aviso protege uma vez só, e do número que já
  não é da conta uma proteção a cada 24 h basta (`jaProtegida`, pela auditoria `nao_fui_eu`, que guarda o
  id do aviso): quem ficou com o número antigo não derruba as sessões e os links de senha da pessoa a cada
  rodada; a resposta é `TEXTO_NAO_FUI_EU_JA_FEITO`. Do número antigo, a conferência nova só encerra a
  anterior do mesmo número, não as perguntas que a pessoa tem abertas pelo número de agora. Antes, a
  conferência (`textoDaConferenciaDoNaoFuiEu`, botões Confirmo/Cancelar), em `whatsapp_pendencias` tipo
  `nao_fui_eu` com o número em `dados`: só esse número a responde (`pendenciaAberta` nunca a devolve, e uma
  pergunta nova não a encerra), e o “confirmo” sem citar só vale se ela é a pergunta mais nova da pessoa.
  Confirmado, `protegerConta`: `encerrarSessoesDaConta` (`encerrar_sessoes_do_usuario`), `revogarLinksDaConta`
  (todos os `tokens_de_conta` pendentes — senha, convite, confirmação de e-mail — e os `whatsapp_codigos` em
  aberto), auditoria `nao_fui_eu` (número mascarado, se era o da conta, o aviso, quantas sessões e links),
  sino, e-mail e WhatsApp conforme as preferências (categoria `auditoria`, a dos alertas de acesso) para os
  administradores e quem lê o registro de acessos, e o e-mail `sessoes_encerradas` à pessoa. Não troca a
  senha nem desativa: a resposta manda trocar a senha.
  Sem aviso recente, quem é da equipe ouve o que fazer; número desconhecido segue para a apresentação.
- **As outras áreas pelo WhatsApp (18/10/2026)**: cada uma só onde a função da tela já existe e com a
  permissão da tela dela, lida sem sessão como o banco lê; para quem não tem, as palavras caem no menu, e o
  menu só mostra a linha (e a opção da lista) a quem tem (`QuemNoMenu.presenca`, `frota`, `estoque`).
  - **Presença das ações do Voluntariado** (`lib/whatsapp/presenca.ts`): quem coordena as oportunidades
    (`private.nivel_participantes` ≥ 2, a permissão de `marcarPresenca`: admin tudo, os outros
    `participantes_acesso`; a equipe da Escola não abre o Voluntariado) manda `presença` (ou `chamada`,
    `marcar presença`, só como a mensagem inteira). Vêm as ações de hoje com a presença liberada — já
    começaram e acabam hoje ou depois, sem as de resposta (aviso, enquete, quiz) nem as canceladas; mais de
    uma, a lista para escolher (até 9) — e a chamada: os inscritos (`inscrito`, `presente`, `ausente`) por
    nome, numerados, com o que já foi marcado, até 40 (mais do que isso, pela tela; telefone e e-mail não
    vêm). A resposta é lida por `lerMarcacaoDePresenca` (puro): “1 3 4”, “1 a 5”, `todos`, “todos menos 3”
    (o 3 fica com falta), “faltas 2 6”; o que não dá para ler sem chutar é pedido de novo. Depois da
    conferência, cada um passa pela MESMA `registrar_presenca` da tela, como a pessoa, por
    `whatsapp_registrar_presenca` (só service role, sessão aal1; confere que a inscrição é do espaço), com
    `p_horas` nulo — as horas da oportunidade ou a duração, como o campo da tela vem preenchido; ação de
    mais de 24 h vai para a tela. Uma recusa (ação que não começou, inscrição que mudou) não para as outras
    e sai na resposta com o motivo do banco. A pergunta guarda os números escolhidos, não os ids, para
    caber nos 8000 bytes de `whatsapp_pendencias.dados`.
  - **Frota** (`lib/whatsapp/frota.ts`): quem vê a Frota (`private.nivel_patrimonio` ≥ 1, `pat_acesso`;
    a equipe da Escola não) manda `veículos` (ou `frota`, `carros`, `veículos disponíveis`…): os
    disponíveis com o hodômetro, os em viagem (condutor, destino, desde quando) e os em manutenção ou fora
    de uso (`textoDaFrota`); é consulta, vale com a verificação em duas etapas. Quem opera (nível ≥ 2, a
    permissão dos botões “Saída” e “Retorno”) registra o diário de bordo: `saída ABC1D23` / `sair com a van`
    e `retorno ABC1D23` / `volta da ambulância 1` / `voltei com…` (`lerViagem`, só para quem opera —
    `lerPedido({ frota })`, e o bot só lê o nível quando a mensagem `pareceViagem`; para os outros, “sair
    com…” pausa e “volta…” retoma os avisos como sempre, e “volta a receber” nunca é retorno). A saída
    pergunta o veículo (`acharVeiculo`: a placa com ou sem hífen, o fim dela, o apelido, o tipo, a marca e
    o modelo; sem ele, a lista dos disponíveis), quem dirige (só os condutores ativos sem `impedimento`
    para aquele veículo hoje — a mesma regra da tela —, quem escreveu primeiro), o hodômetro (`mesmo`
    mantém o último; menos que ele ou mais de 20.000 km acima é pedido de novo, como o banco recusaria), a
    finalidade e o destino; o retorno, o veículo em viagem (um só vai direto), o hodômetro na chegada e as
    ocorrências (`pular`). Tudo termina na conferência e grava pelo MESMO caminho do botão: a conferência
    de `pedidoDeSaida` / `pedidoDeRetorno` (`lib/patrimonio/frota.ts`, que `app/actions/frota.ts` passou a
    usar) e `frota_sair` / `frota_retornar`, como a pessoa, por `whatsapp_frota_sair` /
    `whatsapp_frota_retornar` (só service role, aal1: o banco confere de novo o nível, a CNH, o curso de
    emergência, o km e a viagem aberta; `registrado_por` é a pessoa). Manutenção vencida por km na volta
    avisa quem opera pelo mesmo `avisarManutencaoVencida` (`lib/patrimonio/frota-servidor.ts`) do botão.
    Projeto da viagem, abastecimento, serviço e documento ficam na tela.
  - **Estoque** (`lib/whatsapp/estoque.ts`): quem vê o Estoque (nível ≥ 1 no Patrimônio) manda
    `estoque <material>` (`lerEstoque`; `estoque` sozinho ensina): `acharNoEstoque` (puro) acha pelo código
    ou por palavras do nome (o plural acha o singular) entre os ativos, e a resposta traz o saldo, o mínimo
    (zerado, abaixo), onde está (os lotes com saldo, por local), a validade mais próxima e o vencido que
    espera a baixa — um material em detalhe, vários em lista (até 5), com o link da busca. Só leitura; vale
    com a verificação em duas etapas. As doações em espécie entram no mesmo estoque. O valor do estoque não
    vem.
  - **Ofícios**: o pedido de assinatura já é um aviso (`avisarSobreOficio`, categoria `oficios`, link
    `/oficios/<id>`) e já ia pelo WhatsApp como os comuns, com o link. `alvoDoLink` agora reconhece o
    ofício só para a resposta citando o aviso dizer que assinar (ou recusar) é no Palácio, com a senha ou
    pelo gov.br (`textoDoOficioPeloWhatsapp`), e `dicaDeResposta` não ensina a responder. Nada se assina
    pelo WhatsApp.
- **Antes da migração `20261018233000`:** o CHECK de `whatsapp_pendencias.tipo` não aceita
  `marcar_presenca`, `frota_saida` e `frota_retorno`, e as funções `whatsapp_registrar_presenca`,
  `whatsapp_frota_sair` e `whatsapp_frota_retornar` não existem: a pergunta não se guarda e o bot responde
  com o link da ação ou do veículo (`ondeNoPalacio`; a escolha da ação, com a lista e o link das
  oportunidades). As consultas (`veículos`, `estoque`, a Escola no `status`) e a resposta ao aviso do
  ofício não dependem dela. A migração lê a lista em vigor e só acrescenta.
- **Antes da migração `20261018223000`:** `whatsapp_confirmacoes` não existe e o CHECK de
  `whatsapp_pendencias.tipo` não aceita `financeiro` nem `nao_fui_eu`: o pedido sensível responde com o
  link da tela de sempre (o voto, com o texto da verificação em duas etapas), a lista do `financeiro` sai
  com o link de cada item (`Resposta.semPergunta`) e o “Não fui eu” orienta a trocar a senha e falar com a
  administração (`TEXTO_NAO_FUI_EU_INDISPONIVEL`). A marca e a linha do “Não fui eu” nos avisos não
  dependem dela.
- **Antes da migração `20261018213700`:** o CHECK de `whatsapp_pendencias.tipo` não aceita os tipos
  novos, `guardarPendencia` falha e o bot responde “Isto ainda não está ligado…” com o link do lugar
  certo (`ondeNoPalacio`: o chamado ou a portaria). Assumir e a lista `portaria` não dependem dela. A
  migração lê a lista em vigor e só acrescenta (como `notifications_categoria_valida`).
- **Fotos e vídeos viram envio** (`lib/whatsapp/envio.ts`, regras em `envio-regras.ts`): mídia de
  quem é da equipe (e pode agir pelo WhatsApp) abre um envio `recebendo` e uma pendência `envio` (índice único: uma aberta por
  pessoa, então fotos em entregas paralelas caem no mesmo). Cada arquivo é baixado pela Kapso
  (pelo id da mídia, até 64 MB — o webhook não traz o arquivo) e gravado no R2 com
  o nome canônico, já `recebido`; a legenda vai para o relato. `pronto` → título → autorização de
  imagem → conclui como o botão do link (`avisarAvaliadores`, link de assinatura quando cabe). Sem
  resposta por 30 min, fecha sozinho com o título provisório e `nao_sei` (webhook, rotina diária e
  a próxima foto da pessoa). Áudio e documento soltos não abrem envio. O limite por origem é o do
  link (`conferirLimites`), com a origem `whatsapp:<pessoa>`. Com o Google Drive conectado (§7.29c), o envio
  concluído é copiado para o Drive depois da resposta (`agendarCopiaDoEnvio`: `after`, e na hora fora de uma
  requisição): só a conclusão que virou o estado agenda; a vez de quem copia (`drive_copia_em`, retomável depois de
  15 min) e a marca de cada arquivo (`drive_arquivo_id`) não deixam duplicar; o link da pasta só é gravado no fim; a
  rotina diária retoma os dos últimos 7 dias (`copiarEnviosPendentes`, 5 por vez).
- **Documentos para o Google Drive (19/10/2026)** (`lib/whatsapp/drive.ts`, regras em `drive-regras.ts`): com o Drive
  conectado, o DOCUMENTO de quem é da equipe (PDF, planilha, texto, apresentação — foto e vídeo continuam virando
  envio; documento com envio aberto e sem a legenda de pasta continua entrando no envio) vai para o Drive. Antes do
  registro, `destinoDoDocumento` decide (o comando no registro: `drive_guardar`, `drive_perguntar` ou `ia`): a
  legenda "guardar em Financeiro/2026" (`lerLegendaDeGuardar`: verbo de guardar + caminho com barra ou de até 3
  palavras) guarda na hora; sem legenda (ou sem o assistente), o bot pergunta a pasta (pendência
  `guardar_documento`, 15 min, `textoPedeAPasta`; sem a migração, a resposta ensina a legenda); a legenda com outras
  palavras vai ao assistente, que lê o documento no contexto e prepara `preparar_guardar_no_drive`. As cercas de
  sempre: a equipe da Escola fica de fora, quem usa a verificação em duas etapas também (`podeAgirPeloWhatsapp`),
  tipo e 64 MB. A resposta à pergunta (`seguirGuardarDocumento`): o caminho, com ou sem o verbo; o que não tem cara
  de caminho, com o assistente, vai a ele (`paraPendencia` falso); "cancelar" desiste; a pendência encerrada de forma
  atômica guarda uma vez só. `guardarDocumento` baixa da Kapso na hora (nada fica no R2 esperando), garante as pastas
  (`podeGuardarEm`: o setor da pessoa — `setor_membros` e a coordenação que bate com um setor — ou qualquer lugar para
  quem administra), manda ao Drive, deixa `drive_documento_guardado` no `activity_log` e responde com o link. O
  "status" de quem administra ganha a linha do Drive (conectado com a pasta raiz, expirado ou sem conexão;
  `linhaDoDriveNoStatus`).
- **Voluntários** (`lib/whatsapp/voluntarios.ts`, tabela `participantes_whatsapp`): o voluntário
  confirma o número na Área do Voluntário (os mesmos dois caminhos de Meu perfil) marcando a autorização, cujo
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
  uma e outra, e 40 avisos por pessoa em 24 h. Falha por Kapso fora (rede, 5xx, chave, número)
  volta para a fila com espera de 5 min a 12 h; tempo esgotado não é repetido (pode ter saído). A
  fila anda quando chega mensagem (webhook), a cada aviso novo, na rotina diária
  `/api/whatsapp/rotina` (10h05 UTC, `CRON_SECRET`) e pelo botão “Enviar a fila agora”. Antes de
  sair, desiste se o aviso já foi lido ou a pessoa pausou ou tirou o número — menos o aviso de
  segurança da conta, que vai ao número a que foi endereçado, pausado ou não (o recado da troca ou
  remoção vai justamente ao número antigo; §5, “WhatsApp da conta”), a não ser que, enquanto
  esperava, o número tenha sido confirmado em outra conta (`whatsapp_contas` de outro `user_id`;
  `participantes_whatsapp` não conta: a mesma pessoa pode ser voluntária). Batido o teto do minuto,
  a rodada espera a janela abrir (dentro do orçamento), e o anúncio aos voluntários vai depois de
  resposta do bot, segurança e avisos da equipe. Só controle de volume:
  **não há variação de texto nem “digitando” para despistar o WhatsApp**.
- **Cota diária de conversas (18/10/2026)** (`fila.ts`, regras em `regras.ts`): a Meta limita quantas
  pessoas diferentes o número procura em 24 h (janela móvel) fora da janela de atendimento — o número
  está no TIER_250 (`COTA_DE_CONVERSAS = { teto: 250, reserva: 30 }`; subiu na Meta, suba a constante).
  `cotaDeConversas` chama `whatsapp_cota_de_conversas` (security definer, só service role): números
  distintos com saída `enviada` nas últimas 24 h, sem `tipo` `bot`, sem entrada do mesmo número nas 24 h
  antes da saída (a aproximação: o Palácio não sabe se a Kapso mandou texto livre ou modelo); com um
  número, diz também se ele está com a janela aberta (entrada nas últimas 24 h) ou já foi contado.
  `prioridadeNaCota` (puro): alta para segurança, código, bot, teste e os avisos `portaria`, `auditoria` e
  `integracoes`; baixa para o resto dos avisos (os comuns, `voluntariado`, os convites `conta` e `equipe`, o
  pedido de documentos). `esperaPelaCota`: só a baixa, com a cota em `limiteDaCota()` (220) ou mais, para
  número com a janela fechada e ainda não contado. `entregar()` confere depois do silêncio (uma chamada,
  só para a baixa) e põe na fila com motivo `cota` e `enviar_apos` = `fimDaEsperaDaCota` (24 h depois — a
  janela da Meta é móvel —, ou as 7h se cair no silêncio); `processarFila()` lê a cota uma vez por espaço
  e rodada, soma por cima a cada envio e, no limite, confere cada número (o que traz a conta certa) antes
  de devolver o item com motivo `cota`. Os recados de convite e de pedido de documentos dizem "amanhã"
  (`TEXTO_DA_ESPERA_DA_COTA`). A tela de conexão mostra "Conversas que o Palácio iniciou nas últimas 24
  horas: N de 250" (alvo `whatsapp.cota`) e a fila por motivo, com o da cota; o `status` traz a linha
  "Conversas iniciadas em 24 h".
- **Alertas de integrações (18/10/2026)** (`lib/integracoes/alertas.ts`, regras e textos em
  `lib/integracoes/alertas-regras.ts`, conferidos em `scripts/conferir-whatsapp.ts`): categoria
  `integracoes`, no sino, no e-mail e no WhatsApp dos administradores (`categoriaVaiPorWhatsapp` só barra
  `sistema`; a queda do próprio WhatsApp continua `sistema`). Disparam: `tokenDeAcesso` (Gmail) e
  `tokenDeAdmin` (Diretório) quando a autorização passa de `ativa` a `expirada` (o `update` agora filtra
  `estado = 'ativa'` e devolve a linha: só a troca alerta, com a conta) e quando o Google recusa o cliente
  OAuth (`CLIENTE_RECUSADO`); o Google Drive (`lib/google/drive.ts`, alerta `google_drive`, §7.29c) do mesmo
  jeito, e também quando o Drive da conta enche (`storageQuotaExceeded`, motivo `servico`); `chamar()` do Resend em 401/403 (chave ou domínio), 429 da cota do plano
  (o de chamadas por segundo, não), 5xx e sem resposta (`motivoDaFalhaDoEmail`; a falta da chave não
  alerta — já aparece em Integrações e Usuários); e
  `enviarObjeto()` do R2 sem resposta, em 401/403/404 e 5xx (`motivoDaFalhaDoR2`; cobre as fotos do WhatsApp
  e o espelho da trilha). O Resend e o R2 são da hospedagem: o alerta vai ao espaço de produção. Um por
  integração a cada 6 h (`alertaDeIntegracaoSai`), sem migração: o marco `integracao_alertada` em
  `activity_log` (`entity_type` `integracao`, `metadata.servico`), gravado antes do aviso, com a mesma
  ressalva dos marcos da rotina (data futura não vale; um membro ainda consegue calar por 6 h). A mesma
  instância só reconfere a cada 10 min: o alerta manda e-mail pelo Resend, e a falha dele não vira outro
  alerta. As outras integrações do cofre (Meta Ads, Conversões, Analytics, Safe Browsing, Portal da
  Transparência, Hunter) já mostram o erro a quem usa ou gravam no banco e ficaram de fora.
- **Antes da migração `20261018231000`:** a função da cota não existe, `cotaDeConversas` devolve null e
  nada espera pela cota (a tela e o `status` dizem que não deu para contar); o CHECK de
  `whatsapp_fila.motivo` não aceita `cota` (nunca chega a ser pedido); e o alerta de integração entra no
  sino como `geral` (o caminho de sempre de `notificar()` quando o banco recusa a categoria), saindo pelo
  e-mail e pelo WhatsApp como `integracoes`. A migração lê as listas em vigor e só acrescenta.
- **Alerta de queda** (`lib/whatsapp/estado.ts`, tabela `whatsapp_estado`): quando a conexão cai
  (connection.update, envio que falhou por servidor fora ou a rotina diária), os administradores
  recebem “O WhatsApp do Palácio caiu” no sino e no e-mail (categoria `sistema`, que nunca vai pelo
  WhatsApp), no máximo a cada 6 h; e “voltou” quando reconecta.
- **Rotina: recebimento e modelos (18/10/2026):** `/api/whatsapp/rotina` também confere o webhook
  (`situacaoDoWebhook`): `desligado` ou `outro_endereco` alertam “O WhatsApp do Palácio parou de receber
  mensagens” (`conferirWebhook`; `desconhecido` não conta — é a Kapso sem responder, e a queda tem o alerta
  dela). E conta as falhas das últimas 24 h por “fora da janela” sem modelo ou recusa do modelo
  (`falhasSemModelo`, que lê o erro e o tipo do registro: a resposta do bot fora da janela — as
  boas-vindas depois de confirmar pelo código digitado — nunca vai por modelo, então não conta; no
  `status` ela sai à parte, “Resposta do bot fora da janela de 24 h (não usa modelo)”, sem a dica dos
  modelos): a partir de 5 (`FALHAS_SEM_MODELO_PARA_ALERTAR`), “Mensagens do WhatsApp sem modelo
  aprovado” (`conferirFalhasSemModelo`). Os dois vão como o de queda (sino e e-mail, categoria `sistema`) e
  seguem `decidirAlerta` (puro): uma vez por episódio, nunca de novo antes de 6 h. Sem migração, a memória fica
  em `activity_log` (`entity_type` `integracao`, sem ator): `whatsapp_webhook_alertado` abre o episódio, e
  `whatsapp_webhook_voltou` (a rotina viu ligado; avisa “voltou a receber mensagens”) ou
  `whatsapp_webhook_ligado` (o botão da tela, que já gravava isso) fecham; `whatsapp_modelos_alertado` /
  `whatsapp_modelos_em_dia` (fecha sem aviso). No fim, a rotina grava `whatsapp_rotina` por espaço conferido
  (estado, webhook e a contagem; é a “Rotina diária” do `status`). `activity_log` aceita inserção de qualquer
  membro (RLS), com a data que ele quiser: a leitura dos marcos e da última rotina ignora data futura
  (`created_at <= agora`), senão uma linha “para 2099” calaria o alerta para sempre. Um membro ainda abre um
  episódio com a data de agora, até o próximo “resolvido”; a memória definitiva vai para `whatsapp_estado`
  (só service role) numa migração futura. O painel não mostra essas linhas
  (`fraseDaAtividade` devolve null). A frequência do cron não mudou (uma vez por dia).
- **Assistente do Palácio no WhatsApp — fundação (19/10/2026, etapa 1 de 4, sem modelo e DESLIGADO):** o número
  vai entender linguagem natural (o Claude) e preparar ações que a pessoa confirma. Nesta etapa só a base, sem
  mudança visível: sem configuração, o bot responde exatamente como antes (o `bot.ts` ainda não chama o assistente).
  - **Desenho:** nenhuma frase do modelo, nenhum texto de terceiro e nenhum dado guardado basta para escrever. O
    modelo não terá ferramenta que escreva — `preparar_*` só acrescenta um passo a um plano; o código escreve o
    plano exato a partir do banco (`textoDoPlano`, pessoas sempre `Nome (@usuário · Setor)` e ⚠ de homônimo, o
    texto que sai inteiro e citado com `> `), e só executa depois do *confirmo* escrito DEPOIS da entrega do plano
    (pela hora da Meta, `MensagemRecebida.enviadaEm`) ou do botão com o hash. "sim" e "ok" não confirmam. O
    modelo só aponta para itens que o código mostrou (marcadores `apr_1`, `pes_3`; texto de terceiro com `[ ]`
    vira `⟦ ⟧` e nunca imita um marcador). Um `preparar_*` só vale se a mensagem DA PRÓPRIA PESSOA pediu aquele
    tipo de ação (`acoesPermitidas`, por radicais, nunca pelo contexto). Quem usa a verificação em duas etapas lê
    só o que é dele; as escritas não isentas dele terminam no Palácio (etapa 4).
  - **Código (pasta `lib/whatsapp/assistente/`):** `regras.ts` (puro: rotas, resposta ao plano, portão,
    quantidade, `pareceInstrucao`, saneamento, validação das ferramentas, plano, hash, recibo, redação, custo,
    tetos, confiança do número, recuo da API), `marcadores.ts` (puro), `fluxo.ts` (puro com repositório injetado:
    guardar, entregar, revisão e rearme, cancelar, substituir, confirmar com assentamento de 3 s, "mensagem no
    meio", consumo atômico, hash, revalidação de todos os passos e execução que para no primeiro `ok: false`),
    `faxina.ts` (`redigirVencidos`: vence, redige, solta os presos em "executando" e fecha o uso sem desfecho; roda
    no início de `processarFila`, no máximo a cada 30 s por instância, e em `guardarPendencia`; não importa
    `fila.ts`) e `uso.ts` (`disponibilidadeDoAssistente`: configuração, modo, chave, disjuntor, papel ≠ escola,
    `confiancaDoNumero` — confirmado há menos de 180 dias ou login há menos de 60, e a troca do nome de perfil
    do WhatsApp suspende o assistente no número até reconfirmar). Conferido por
    `npx tsx scripts/conferir-assistente.ts` (sem banco, sem rede, sem modelo; inclui a corrida "tira a segunda" ×
    "confirmo" no repositório em memória).
  - **Fora da pasta:** `lib/whatsapp/consultas.ts` (os dados de avisos, aprovações pendentes e pedidas, chamados,
    agenda e `pessoaDoEspaco`; o bot só formata); `acoes.ts` (`votar`, `gravarRespostaDaVisita` e `enviarNoChat`
    devolvem `ResultadoDaAcao` — `{ ok, codigo, texto }` —; `votar` com `extra` usa `whatsapp_votar_uma_vez`, e
    `guardarPendencia` substitui o plano aberto do assistente); `lib/mensagens/enviar.ts`
    (`enviarMensagemDireta` pela `whatsapp_mensagem_direta`; o aviso diz "pelo WhatsApp do Palácio");
    `fila.ts` (`entregar(…, { semFila })`: a resposta do assistente nunca espera na fila; o texto da categoria
    `assistente` some da fila depois do envio); `servidor.ts` (`registrar` grava `enviada_em`);
    `confirmacao.ts` (a confirmação grava o nome de perfil visto e zera a suspensão); `regras.ts`
    (`semInvisiveis` — NFKC e sem `\p{Cf}`, guardando º, ª e … — nas comparações e nos nomes do assistente;
    `limpo` tira só os invisíveis que enganam, sem NFKC: o emoji composto, a bandeira e o m² dos avisos ficam;
    `lerPedido` com `assistente`: os comandos que escrevem só pela frase exata, consultas em até 3 palavras, o menu
    só com saudação pura, "chamado" só com os dois-pontos; `textoDoMenu` com a linha "Ou escreva do seu jeito");
    `lib/ia/anthropic.ts` (`modeloDoAssistente` = `WHATSAPP_IA_MODELO` ou `claude-opus-5-5`, `esforcoDoAssistente` =
    `WHATSAPP_IA_ESFORCO` ou `low`, `ttlDoCacheDoAssistente` = `WHATSAPP_IA_CACHE_TTL` ou `1h`,
    `clienteDoClaude`, `traduzirErro` com a variável certa no 404).
  - **Migração `20261019010000` (só acrescenta):** `whatsapp_mensagens.enviada_em`;
    `whatsapp_contas.nome_no_whatsapp` e `assistente_suspenso_em`; `whatsapp_ia_config` (o interruptor por
    espaço: modo `desligado`/`piloto`/`admins`/`equipe`, `escrita`, tetos e o disjuntor; sem linha = desligado; só
    a administração lê); `whatsapp_ia_planos` (um aberto por pessoa, índice único; só o servidor); `whatsapp_ia_memoria`
    (só marcador → tipo e uuid, a ordem da última lista, a trava e o HMAC do último texto; o CHECK recusa texto);
    `whatsapp_ia_uso` (uma linha por turno, só números e nomes); as somas `whatsapp_ia_gasto_desde` e
    `whatsapp_ia_leituras_desde`; a trava `whatsapp_ia_tomar_vez`; `whatsapp_hash_do_conteudo` (sha-256 de
    título ‖ subtítulo ‖ corpo — a versão da matéria não serve de trava); `whatsapp_votar_uma_vez` (servidor,
    aal1) e `votar_conferido` (sessão), que travam a rodada e a linha e recusam voto repetido (WA001), matéria
    mudada (WA002) e rodada encerrada (WA003); e `whatsapp_mensagem_direta`. Os validadores de array e jsonb são
    funções imutáveis em `private` (o CHECK não aceita subconsulta), executáveis pelo service role (o CHECK roda
    com o papel de quem grava). Testes em `supabase/tests/whatsapp-assistente.test.sql`. Antes dela, o código
    degrada: sem a configuração o assistente fica indisponível; o registro e a confirmação gravam sem as colunas
    novas; a faxina não faz nada.
  - **Ligar:** pelo cartão "Assistente" de Configurações → WhatsApp (abaixo, etapa 2), começando pelo piloto;
    `escrita` só vale depois da etapa 3. O "Não fui eu" no recibo e a confirmação no Palácio do plano sensível
    são da etapa 4.
- **Assistente do Palácio no WhatsApp — leitura com IA (19/10/2026, etapa 2 de 4, piloto, DESLIGADO por padrão):**
  com o assistente ligado para a pessoa (`whatsapp_ia_config`: modo `piloto`/`admins`/`equipe`, sem deploy), o que
  o bot de comandos não entende vai ao Claude, que consulta o Palácio com as permissões dela e responde por lá. Sem
  a configuração (ou sem a chave da Anthropic, ou com a pausa do disjuntor), o bot é exatamente o de antes.
  - **O turno** (`lib/whatsapp/assistente/index.ts`, `responderComAssistente`): revisão do plano aberto antes de
    qualquer espera (rearmado no `finally`, com o lembrete; pronto para a etapa 3); cotas (turnos da pessoa por hora
    e por dia, US$ da pessoa e do espaço desde a meia-noite de Brasília, somados no SQL; aviso único aos
    administradores aos 80% e aos 100% do teto do espaço); a vez da pessoa (`whatsapp_ia_tomar_vez`, espera de 1 em
    1 s até 15 s); texto repetido em 10 min sem modelo (HMAC do texto normalizado com a chave do service role); o
    contexto relido no banco (avisos das últimas 24 h classificados pelo estado — "pedida por" sempre de
    `requested_by` —, a citada, a última lista ou a lista citada, a pergunta aberta com a escolha); o portão de
    intenção só da mensagem; o laço; o desfecho; a memória (só marcadores e o HMAC) e o registro (sem texto).
  - **A chamada** (`claude.ts` e `prompt.ts`, `montarParams`): `client.beta.messages.create` com o modelo
    `WHATSAPP_IA_MODELO` (padrão `claude-opus-5-5`), `output_config.effort` = `WHATSAPP_IA_ESFORCO` (padrão `low`),
    SEM `thinking` (no Opus 5.5, `disabled` dá 400), `tool_choice` `auto` (any/tool dão 400) com as 17 ferramentas
    `strict: true` (`ferramentas.ts`, em ordem de nome, iguais para todos), o ponto de cache no fim das ferramentas e
    no fim do sistema (TTL `WHATSAPP_IA_CACHE_TTL`, padrão `1h`) e o automático de 5 min para a cauda,
    `fallbacks: 'default'` com o beta `server-side-fallback-2026-07-01`. O sistema (`SISTEMA_DO_ASSISTENTE`) é
    congelado: sem data, nome, papel ou modo; a situação (data, papel, nível, escrita) vai numa mensagem
    `role: "system"` depois do turno do usuário — o modelo que recusar isso com BadRequestError ganha uma repetição
    com a situação em `<situacao>` no turno do usuário, e a instância passa a usar esse formato. Cliente com
    `maxRetries: 0`: a repetição é nossa e única (529, 5xx, conexão, tempo, se sobram 12 s). Erros pelas classes do
    SDK.
  - **O laço** (`laco.ts`, puro, com o cliente injetado): até 4 chamadas, prazo de 40 s (menos no fim do lote: a rota
    dá 240 s ao lote e cada turno termina 20 s antes; com menos de 15 s nem começa), `refusal` e `max_tokens` antes de
    qualquer ferramenta, só os blocos depois do último `fallback` valem (e o que vem antes volta sem raciocínio nem
    tool_use), só blocos `text` na resposta final; leituras em paralelo (8 s cada, 8 por turno), `perguntar` terminal,
    `preparar_*` em ordem pelo portão e pela quantidade (terminal quando todos passam); "disse que fez" sem plano
    ganha um aviso e, se insistir, o texto fixo. Nesta etapa os `preparar_*` respondem "escrita desligada" (ou o
    texto do número antigo), mesmo com `escrita` ligada no cartão (`ESCRITA_NO_AR = false`).
  - **As leituras** (`leituras.ts`), nos níveis da especificação: `amplo` = pode agir pelo WhatsApp (sem 2FA) e
    número de confiança recente; os outros, `pessoal` — avisos próprios, chamados que abriu ou que estão com ela
    (sem nota interna), aprovações em que vota ou que pediu sem o texto da matéria, agenda e ajuda; filas, notas
    internas, trecho da matéria, busca de colegas e o status do canal respondem "Isso só pelo Palácio.". As de
    detalhe (`ver_aprovacao`, `ver_chamado`, `buscar_pessoa`) contam no teto diário (`leituras_detalhe_dia`). Saída
    em JSON compacto (até 10 itens e 3.000 caracteres), texto de terceiros por `dadoDeTerceiro`, itens só por
    marcador, nunca telefone, e-mail, valor nem URL; os links entram na resposta pelo código
    (`posProcessarResposta`).
  - **O bot** (`bot.ts`): a disponibilidade logo depois de achar a pessoa; `lerPedido` com `assistente`;
    `planoAberto` e `lerRespostaAoPlano` (a janela de 2 min depois do plano não passa por cima da pergunta aberta do
    bot nem da visita esperando); a rota (`rotaDaMensagem`) vai para o registro (`whatsapp_mensagens.comando` = `ia`,
    `ia_escolha`, `ia_obrigado`…); "cancelar" com pergunta aberta, a escolha "2", os textos fixos, "valeu" e
    "esquece" sem modelo; aviso citado com cara de pedido ("do que se trata?") vai ao assistente; o plano de um
    passo do Chat fica para a etapa 3 (sem a escrita, a resposta citando o canal sai como sempre); as listas de
    "avisos" e "aprovações" entram na memória curta; o menu ganha a linha "Ou escreva do seu jeito".
  - **Cotas, registro e disjuntor** (`uso.ts`): uma linha de `whatsapp_ia_uso` por turno, gravada a cada chamada
    (tokens, cache, custo por iteração do recuo, modelo, nomes das ferramentas, leituras de detalhe, ms, desfecho,
    classe do erro — nunca texto); 3 falhas de fora (ou 400 que se repetem: `ERROS_DO_DISJUNTOR`) em 10 min pausam
    10 min; chave recusada, cobrança recusada (402, sem crédito: `BillingError`, o SDK não tem classe própria) ou
    modelo inexistente pausam 30 min e avisam a administração (sino e e-mail, uma vez por dia — conferido pelos
    próprios avisos).
  - **Configurações → WhatsApp, cartão "Assistente"** (`components/admin/whatsapp-assistente.tsx`, só para quem tem
    `integracoes.configurar`; as actions começam com `requirePermissao`): modo, piloto (pessoas da equipe, até 50),
    escrita, os tetos e os números de hoje (conversas, gasto, % com cache, recusas, erros); "Retomar agora" tira a
    pausa. Grava em `whatsapp_ia_config` e no `activity_log` (`whatsapp_assistente_configurado`).
  - **Rotina diária** (`rotina.ts`): apaga memória vencida há mais de 1 dia, planos com mais de 90 dias e uso com
    mais de 13 meses; passa a faxina; e avisa a administração (uma vez por dia cada) de cache quase não lido, recusas
    acima de 5%, P95 acima de 20 s, pessoas no teto e números parados pela troca do nome de perfil. A rota do webhook
    roda a faxina (`redigirVencidos`, 50) depois de cada lote.
  - **Testes:** `npx tsx scripts/conferir-assistente.ts` ganhou as ferramentas (strict, campos, sem propriedade
    proibida, JSON estável), o sistema e os parâmetros (sem data, sem `thinking`, `auto`, beta, cache igual para
    todos), o contexto, o cartão, a rotina e o laço com um modelo roteirizado (preparo terminal em UMA chamada,
    leitura e texto, falha no preparo, portão, quantidade, recusa, teto, recuo, prazo, 4 chamadas, 9 leituras,
    "disse que fez", `perguntar`). `scripts/avaliar-assistente.ts --gastar` roda os casos de leitura contra a API de
    verdade (com teto de US$ e a segunda rodada exigindo cache lido) — manual, nunca no CI.
  - **Sem migração nova:** usa a da etapa 1 (`20261019010000`). Sem ela, o assistente fica indisponível e o cartão
    diz que falta aplicá-la.
- **Assistente do Palácio no WhatsApp — escrita confirmada (19/10/2026, etapa 3 de 4, DESLIGADA por padrão):** com
  o assistente ligado para a pessoa E a caixa "Deixar o assistente preparar ações para a pessoa confirmar"
  (`whatsapp_ia_config.escrita`) marcada no cartão, os `preparar_*` deixam de responder "escrita desligada" e o
  pedido vira um plano exato, que só é feito com o *confirmo*. Sem a caixa (o padrão), tudo fica como na etapa 2.
  - **Preparos** (`preparos.ts`, puro, com a fonte dos dados injetada — `fonteDoSupabase` em `executores.ts`): depois
    da validação e do portão de intenção (laço), cada preparo resolve o marcador no tipo certo, confere a permissão e
    o estado no banco (rodada aberta e sem o voto da pessoa, destinatário ativo e diferente dela, chamado com papel e
    aberto, fila e assunto ativos e o local quando o assunto pede, a visita que espera a resposta, avisos sem ler) e
    os limites (3 votos e um por aprovação, uma mensagem por destinatário e 3 destinatários, as mensagens diretas
    do dia em `mensagens_dia`, 8 passos), guarda o hash do conteúdo da matéria (`whatsapp_hash_do_conteudo`; sem a
    função, o voto é pelo Palácio) e devolve o `Passo` com as pessoas do quadro (`@usuário`, ⚠ de homônimo). Quem
    usa a verificação em duas etapas: voto, mensagem e comentário ficam de fora, com o link do Palácio no "Ficou de
    fora" do plano ou na resposta em texto (com a confirmação no Palácio, etapa 4, entram no plano sensível); abrir chamado, responder à portaria e marcar lidos valem
    (isentos). O erro vai ao modelo; o motivo, à pessoa ("Ficou de fora: … — …").
  - **O plano** (`index.ts` e `plano.ts`): o texto do modelo é descartado; `validarRascunho`, `guardarPlano` (hash,
    15 min; substitui e redige o que estava aberto, inclusive o plano em revisão, e encerra a pergunta do bot) e o
    `textoDoPlano` sem fila — não saiu, cancelado e redigido, e o aviso curto vai pela fila normal. O plano sensível
    não nasce nesta etapa.
  - **A confirmação** (`bot.ts` → `confirmarPlano`, com a vez da pessoa): só "confirmo" escrito depois da entrega
    (pela hora da Meta) ou citando o plano; "sim", "ok", "pode" recebem a orientação fixa, sem modelo. O fluxo
    (`fluxo.ts`) assenta 3 s, recusa se chegou outra mensagem ao assistente no meio, consome o plano de forma
    atômica, confere o hash e a pessoa, e `conferirIdentidade` refaz no banco: o número do plano e desta mensagem,
    sem suspensão; a escrita ainda ligada; a pessoa ativa com o mesmo papel; a verificação em duas etapas (lida de
    novo); o número recente; e as cotas do dia (20 planos executados, `LIMITES.planosDia`, e as mensagens diretas,
    contadas nos planos executados de hoje com o passo ok — `contarAcoesDoDia`). Depois `revalidarPasso` para TODOS
    os passos (as mesmas conferências do preparo com leituras novas; a matéria mudada não recebe voto) e só então
    `executarPasso`, em ordem, parando no primeiro `ok: false`: `votar` com `extra` (`whatsapp_votar_uma_vez`, com o
    hash, e a conferência declarada no comentário), `enviarMensagemDireta` (`whatsapp_mensagem_direta`; o aviso diz
    "pelo WhatsApp do Palácio"), `comentarNoChamado`, `criarChamado`, `gravarRespostaDaVisita`, `enviarNoChat` e o
    update dos avisos da própria pessoa. Os textos de ação são redigidos na hora; o recibo (o que foi feito, com os
    links, e onde parou — sem os textos) pode esperar na fila, categoria `assistente`. O uso fica com o desfecho
    `confirmado`, custo zero e o plano.
  - **Trilha:** o voto, no `activity_log` de sempre com `{ canal: 'whatsapp', via: 'assistente', plano_id }`; os
    outros passos, com `action` `whatsapp_assistente_<passo>` e o mesmo `metadata` (o painel não mostra essas linhas).
  - **O plano do Chat** (`guardarPlanoDoChat`, sem modelo): a resposta citando o aviso de um canal do Chat, sem cara
    de pedido ao assistente (`pareceInstrucao` falso), vira um plano de um passo com o texto da pessoa inteiro e
    citado; com a verificação em duas etapas, ou sem a escrita, a resposta segue o caminho de sempre.
  - **O `status`** ganhou a linha do assistente (`assistenteNoStatus` em `uso.ts`, `linhaDoAssistenteNoStatus` em
    `regras.ts`): o modo, se prepara ações, a pausa e os números de hoje (conversas, gasto e teto, cache, recusas,
    pessoas no teto de consultas). Sem a configuração do assistente, a linha não sai.
  - **Testes:** `npx tsx scripts/conferir-assistente-escrita.ts` (novo; sem banco, rede nem modelo): cada preparo com
    uma fonte de mentira (escrita desligada, número antigo, verificação em duas etapas com o link, limites, estados),
    a revalidação (matéria mudada, voto pela tela no meio, destinatário desativado, visita respondida, canal
    arquivado), o caso do dono de ponta a ponta com o modelo roteirizado (UMA chamada, plano de 3 passos escrito pelo
    código, "sim"/"ok" e o "confirmo" antes da entrega não fazem nada, o "confirmo" executa os três em ordem, o
    segundo não executa de novo, o texto some na hora; a matéria mudada não recebe voto; a cota de planos; a mesma
    frase com 2FA dá os links) e os casos do roteiro §12.3 que dependem do código (2, 3, 4, 5–6, 9, 10, 11, 13–17, 19,
    21, 22, 23, 26, 27, 30 e o plano do Chat). `scripts/avaliar-assistente.ts --gastar` ganhou os casos de escrita
    contra a API de verdade (manual).
  - **Sem migração nova:** usa a da etapa 1 (`20261019010000`).
- **Assistente do Palácio no WhatsApp — integração com a onda 2 (19/10/2026, etapa 4 de 4, DESLIGADA por padrão):**
  o plano sensível termina no Palácio, os planos e as perguntas ganham botões e listas, o recibo ganha o "Não fui
  eu", e as ferramentas cobrem o atendimento do chamado, a portaria, o Financeiro e as áreas. Sem a configuração do
  assistente, nada disso existe (o bot é o de antes, inclusive com áudio); sem a migração B, o plano sensível não
  nasce (como na etapa 3).
  - **As 20 ferramentas (o teto):** as 17 da v1, `preparar_atendimento_do_chamado` (assumir, resolver com a solução,
    transferir com a fila, o assunto e o motivo — só a equipe da fila; `assumirChamado`, `mudarStatusNoChamado` e
    `transferirNoChamado`, as funções da tela), `preparar_registro_de_visita` (visitante, empresa, a pessoa visitada
    `pes_`, motivo — `gravarEntrada`, a mesma `portaria_registrar_entrada`; avisa quem é visitado),
    `preparar_decisao_financeira` (item `des_`/`com_`, aprovar ou recusar com motivo — SEMPRE no Palácio) e
    `consultar_area` no lugar de `ver_status_do_whatsapp` (financeiro, com os marcadores e sem valores; frota;
    estoque com a busca; portaria; whatsapp, só para quem administra — só no nível amplo, conta como leitura de
    detalhe). Os tipos do portão (`atendimento`, `registro_visita`, `financeiro` só com aprovar/recusar junto de
    despesa ou compra NA mensagem) estavam prontos desde a etapa 1. A troca reescreveu o prefixo do cache uma vez.
  - **O plano sensível vai ao Palácio** (§5.7): `sensivel` = a decisão do Financeiro (sempre) ou um passo não isento
    de quem não pode agir pelo WhatsApp. Com a confirmação no Palácio disponível (`confirmacaoNoPalacioDisponivel`
    em `uso.ts`: a coluna `plano_id` existe; conferido a cada 10 min por instância), o preparo de quem usa a
    verificação em duas etapas entra no rascunho em vez de ficar de fora, e `buscar_pessoa` abre no nível pessoal
    (até 3 resultados). O plano mostra a linha do Palácio (a da verificação em duas etapas ou a do Financeiro). No
    *confirmo*, `fluxo.confirmar` leva o plano a `no_palacio` com o prazo do link (15 min contados dali) e
    `confirmarPlano` cria a confirmação (`criarConfirmacao`, ação `plano`, alvo = o plano) e manda o link
    (`textoDoLinkNoPalacio`, sem fila, categoria `conta`). Sem a migração ou com links demais na hora, o plano falha e
    é redigido.
  - **`/confirmar/[token]`, ramo "plano"** (`lib/whatsapp/assistente/palacio.ts`, só importado pela página): o mesmo
    portão das telas (requireWorkspace: aal2 para quem usa a verificação em duas etapas); o plano lido pelo serviço e
    conferido (dono, espaço, `no_palacio`, prazo, hash); os passos em HTML pela mesma função do texto do WhatsApp
    (`linhasDoPlano` → `blocosDaTela`) e a conferência do setor dos votos "aprovado" como caixas para marcar
    (`conferenciaDoPlano`). O "Confirmar" (`confirmarNoPalacio` → `executarPlanoNoPalacio`) confere a conferência
    antes de tudo e o fluxo (`executarNoPalacio`) COMEÇA pela transição atômica `no_palacio → executando` — dois
    cliques ou duas abas executam uma vez; o link só marca o uso depois. Confere a pessoa, o papel, a escrita do
    assistente e as cotas do dia (`conferirNaSessao`), revalida todos os passos e executa pela sessão
    (`executarPasso` com o canal `sessao`): o voto por `votar_conferido` (o hash do conteúdo vale aqui também: matéria
    mudada entre o plano e o clique, `WA002`), a mensagem por `enviarMensagemDireta({ via: 'sessao' })`, o Chat por
    `chat_enviar`, a portaria por `portaria_registrar_entrada`, o chamado pelas funções da tela; a decisão do
    Financeiro pela MESMA função do link do comando "financeiro" (`executar` de `confirmar-no-palacio.ts`:
    `decidirAprovacao`, `decidirPedido`). O recibo aparece na tela, fica no resultado da confirmação e vai ao
    WhatsApp. `descrever` e `executar` da onda 2 recusam a ação `plano` antes de cair no ramo de desativar conta.
  - **`sendDirectMessage`** (`app/actions/editorial.ts`) passou a usar `enviarMensagemDireta({ via: 'sessao' })`, a
    mesma função do plano no Palácio (as regras da tela continuam: destinatário do espaço, 10 s sem repetir).
  - **Botões e listas:** o plano sai com Confirmar e Cancelar (`interativoDoPlano`, ids `plano:<id curto>:<hash8>:sim|
    nao`: o botão de um plano antigo ou com o hash velho dá "não vale mais"); a pergunta, com a lista das opções
    (`interativoDaPergunta`, ids `esc:<id curto>:<marcador>`; o número digitado continua valendo). Acima de 1.024
    caracteres, o texto sai sozinho e os botões vêm numa segunda mensagem curta (`mensagensComInterativo`,
    `entregarComInterativo`); as duas entram em `whatsapp_ia_planos.mensagens`. O toque no botão não espera o
    assentamento de 3 s (é do *confirmo* por texto). O plano do Chat também sai com os botões.
  - **"Não fui eu" no recibo:** o recibo do plano confirmado pelo WhatsApp termina com a linha do "Não fui eu" e sai
    como aviso de segurança (botão e marca no registro, `fila.ts`), então a resposta a ele protege a conta
    (`protecao.ts`). Protegida a conta, o assistente também para no número dela (`assistente_suspenso_em`, até
    reconfirmar o número) e o plano aberto ou esperando o Palácio é cancelado. O recibo da página não leva a linha.
  - **Áudio** (só com a transcrição que a Kapso manda: `message.kapso.transcript.text` → `MensagemRecebida.
    transcricao`): com o assistente disponível e sem envio de fotos aberto, o áudio segue como a transcrição, sempre
    ao assistente (`rotaDaMensagem` com `audio`): nada de comando fixo, pergunta do bot, resposta direta a aviso ou à
    portaria, plano do Chat; o "confirmo" ou "sim" falado recebe "Áudio não confirma plano" (`ia_audio_nao_confirma`).
    A resposta começa pelo eco "_Entendi do áudio:_ “…”" (`textoDoEcoDoAudio`). Sem o assistente, o áudio é o de antes.
  - **Alertas de integração:** chave recusada, falta de crédito (402) ou modelo inexistente pausam o assistente e
    viram o alerta `claude` (`lib/integracoes/alertas.ts`, categoria `integracoes`, um a cada 6 h, também pelo WhatsApp).
  - **Cota:** a da onda 2 é a das conversas que a Meta deixa o número começar (fora da janela); as respostas do
    assistente são respostas do bot dentro da janela e não entram nela — não houve o que unificar.
  - **Cartão:** a linha "Confirmação no Palácio" diz se a migração B foi aplicada; o texto das ações lista o que o
    assistente prepara agora.
  - **Migração B** (`20261019020000_cvrj_whatsapp_assistente_confirmacao.sql`, só acrescenta): `plano_id` em
    `whatsapp_confirmacoes` (FK para o plano, `on delete cascade`, índice), a ação `plano` na restrição de `acao`
    (lida da que está em vigor) e `whatsapp_confirmacoes_plano_coerente` (acao `plano` ⇔ `plano_id`, alvo = o plano).
    Testes em `supabase/tests/whatsapp-assistente-confirmacao.test.sql`.
  - **Guardar no Google Drive (19/10/2026, etapa 5):** `preparar_guardar_no_drive` (`pasta`, `nome` — o documento é o
    que espera a pasta: a pergunta `guardar_documento`, ou, na correção, o do plano em revisão) entrou no lugar de
    `ler_filas_de_chamado`, que virou a área `filas_de_chamado` de `consultar_area` (em qualquer nível, sem contar como
    detalhe) — continuam 20, o teto; o prefixo do cache foi reescrito uma vez. Tipo `drive` no portão
    (`guard|salv|arquiv|drive|pasta…` na mensagem dela; o banco aceita "drive" depois da migração `20261019030000`;
    antes, o plano é guardado sem ele). O contexto mostra "Documento esperando a pasta do Drive" com os setores onde
    ela guarda. O preparo confere o Drive conectado, o caminho (`normalizarCaminho`) e a pasta do setor
    (`podeGuardarEm`), recusa quem usa a verificação em duas etapas e um documento por plano; o passo
    (`guardar_no_drive`) leva o nome final, o caminho e o que baixa o arquivo. A revalidação refaz o Drive e a pasta;
    o executor é o mesmo `guardarDocumento` (nos dois canais), o recibo traz a pasta e o link do arquivo, e a redação
    apaga o nome e o id da mídia. Testes em `scripts/conferir-drive.ts`.
  - **Testes:** `npx tsx scripts/conferir-assistente-palacio.ts` (novo; sem banco, rede nem modelo): as 20
    ferramentas, as entradas novas, o portão, a sensibilidade, o texto do plano (valor, motivo citado, a linha do
    Palácio), a redação, o recibo com e sem o "Não fui eu", botões e listas (hash velho e plano antigo recusados,
    a divisão acima de 1.024), o áudio (o "confirmo" falado não confirma), a página (blocos e conferência), o fluxo
    no Palácio (dois cliques executam uma vez; matéria mudada não recebe voto; plano vencido, de outra pessoa ou com
    o assistente desligado não executa; "cancelar" alcança o plano no Palácio), os preparos novos e a revalidação
    deles, e os imports (o executor do WhatsApp não puxa o Financeiro; a rota não puxa `palacio.ts`).
- **Assistente do Palácio no WhatsApp — correções da revisão (19/10/2026):**
  - **"aprova a 2" com o assistente:** a decisão do Financeiro só é comando com a lista do "financeiro" aberta, de
    quem decide (`comandoDaRota`; `bot.ts` lê a lista uma vez); sem ela, o "2" é o da última lista da memória curta
    ("avisos", "aprovações") e a mensagem vai ao assistente.
  - **O plano que espera o Palácio** (`no_palacio`): `abertoPara` o devolve (`PlanoAberto.noPalacio`) quando não há
    plano aberto, e citar as mensagens dele é citar o plano. "cancelar" (sem citar, citando ou o botão Cancelar dele)
    o cancela; "confirmo" (ou o botão Confirmar) responde o texto fixo que manda ao link. Como as outras respostas ao
    plano que já saiu, sem citar ele cede a vez à pergunta mais nova do bot.
  - **"Não fui eu" × plano:** o "confirmo" ou "cancelar" sem citar só vai à conferência do "Não fui eu" se não há
    pergunta mais nova da pessoa — agora contando o plano ou a pergunta do assistente (`whatsapp_ia_planos`).
  - **A revisão que termina em texto do modelo:** o texto sai sozinho (sem o lembrete) e o código manda o plano em
    revisão de novo, com os botões, numa mensagem própria; só ela rearma o plano (`mensagensDaRevisao` em `fluxo.ts`;
    `rearmar` aceita as duas mensagens). "Tirei a segunda", "troquei", "acrescentei"… sem `preparar_*` caem no
    "Nada foi feito" (`afirmaQueFez`).
  - **Nomes:** `nomeMostrado` tira "(", ")", "@" e "·" do full_name no rótulo, no plano e no "pedida por" (o nome
    não imita o `@usuário` que o código põe depois); o ⚠ de homônimo compara o esqueleto do nome (o que vem antes do
    primeiro "(", "@" ou "·": `esqueletoDoNome`, `temHomonimo` em `regras.ts`); o rótulo da pessoa e os nomes de fila,
    assunto e visitante vão ao modelo como dado de terceiro (`</contexto>` num nome fica inerte).
  - **`consultar_area('whatsapp')`:** os e-mails das contas Google saem como "e-mail oculto" (`textoDeArea`, agora em
    `regras.ts`).
  - **Marcar todos como lidos:** o passo guarda `ate` (a hora do preparo) e o executor marca só os avisos criados até
    ela: o aviso que chega entre o plano e o *confirmo* continua sem ler.
  - **Textos:** "confirme o número de novo" passou a dizer como (em Meu perfil → WhatsApp, "Trocar número" e o mesmo
    número); a ajuda cita "Confirmar e fazer tudo" (ou "Confirmar e fazer"); o cartão do Drive, a ajuda e o §11 pedem
    para compartilhar "Palácio – Arquivos" com a equipe (o que o Palácio cria nasce privado da conta conectada).
  - **Migração B** falha (em vez de terminar sem efeito) se vier antes da `20261019010000`.
  - **Testes:** `scripts/conferir-assistente.ts` ganhou os casos ("aprova a 2" sem lista, o plano no Palácio pela rota,
    a revisão que termina em texto, o nome com tags e com "(@outro · Setor)", o e-mail no status);
    `scripts/conferir-whatsapp.ts`, o aviso com emoji composto e m².
- **Portaria pelo WhatsApp com foto — fundação (19/10/2026, etapa 1):** a base para registrar o visitante com
  foto pelo WhatsApp e mandar a ficha a quem é visitado (pedido do Matheus). Nada muda para quem usa ainda:
  - **Modelos por situação** (`lib/whatsapp/modelos.ts`, puro, `scripts/conferir-whatsapp.ts`): o catálogo dos
    modelos que o Palácio cadastrou na Meta, com corpo, variáveis e botões copiados letra por letra
    (`CATALOGO_DOS_MODELOS`): a visita (`portaria_visita_foto_v2`, `portaria_visita_foto` — com cabeçalho de
    imagem, que a Meta ainda não aceitou cadastrar —, `portaria_visita_v2`, `portaria_visita`; 3 variáveis e
    os botões “Pode subir”, “Aguarde na recepção” e “Não pode agora”) e a resposta ao visitante
    (`portaria_resposta_visitante_v2`, `portaria_resposta_visitante`; 2 variáveis). `modeloDaSituacao` usa o
    primeiro da lista que está **APPROVED, UTILITY e pt_BR** (`modeloUtilAprovado`: nunca MARKETING nem
    AUTHENTICATION; o de imagem só com a foto) e monta o objeto `template` (`montarModelo`): cabeçalho de imagem
    pelo id da mídia, variáveis sem quebra de linha, tabulação ou 4 espaços seguidos (erro 132018), vazias
    viram “—”, cortadas para o corpo preenchido caber em 1024, e o payload de cada botão de resposta rápida (o
    que volta no webhook como o toque). Sem nenhum aprovado, null: quem chama segue pelo caminho de antes. Em
    19/10/2026 todos ainda estavam PENDING.
  - **A situação na Meta** (`modelosDaMetaKapso`, em `kapso.ts`): a lista pelo WABA, só os aprovados, de Utilidade
    e em pt_BR (`status=APPROVED&category=UTILITY&language=pt_BR`, os filtros que a Kapso documenta; o código confere
    de novo), página a página (até 5; a seguinte pelo `paging.next` ou, como a Kapso documenta só os cursores, pela
    página cheia; cursor em Base64),
    guardada em memória por 10 min (`cacheDosModelos`; quem pede junto espera a mesma leitura); a falha vale
    “nenhum aprovado” por 1 min. O WABA vem do número (`wabaDoNumeroKapso`: o mesmo
    `GET /platform/v1/whatsapp/phone_numbers/{id}`, campo `business_account_id` ou variações — `wabaDoNumero`,
    puro), guardado por 6 h; se a Kapso não diz, vale o campo opcional “ID da conta do WhatsApp Business —
    WABA” do cartão da Kapso (`wabaId`). Conferido em produção em 19/10/2026: a plataforma devolve o WABA em
    `business_account_id`, e a lista pelo WABA no proxy volta 200 (inclusive com `status=APPROVED&category=UTILITY&
    language=pt_BR`; a página traz `paging.cursors.after` e só traz `next` quando há outra). O cartão e a ajuda
    ainda recomendam preencher o WABA, por garantia; nenhuma tela mostra ainda o WABA usado nem a situação lida
    (próximo passo: mostrá-los no `status` do bot ou em Configurações → WhatsApp). Se a leitura algum dia voltar
    401 como o `GET` do número (acima), a lista vem vazia e nada muda.
  - **Envio** (`kapso.ts`, fachada em `servidor.ts`): `subirMidia` (multipart, devolve o id), `apagarMidia`
    (melhor esforço), `enviarModelo` (o modelo montado, com qualquer componente; não depende da janela),
    `modeloAprovado` (o da situação, já montado). `Interativo` de botões ganhou `imagem` (o id da mídia vira o
    cabeçalho); recusado, tenta de novo sem a imagem antes de cair no texto. `OpcoesDoEnvio.modeloForaDaJanela`
    troca o modelo da finalidade pelo da situação, pedido só quando a janela está fechada; sem ele, a falha
    volta com `foraDaJanela` (e o modelo dos avisos não é usado). O `Envio` que saiu por modelo diz qual
    (`modelo`). Conferido contra uma Kapso de mentira (o `fetch` trocado em `scripts/conferir-whatsapp.ts`, sem
    rede): o formulário do upload, o DELETE, o nono dígito antes do modelo, a página seguinte da lista, o cache.
  - **Próximo passo:** os outros recuos de modelo (avisos, segurança, aprovações…) continuam pelo modelo do
    cofre; catalogar os demais modelos cadastrados (`palacio_*`) em `modelos.ts`, por situação, e trocar o
    recuo genérico pelo da situação.
- **Portaria pelo WhatsApp com foto — o registro (19/10/2026, etapa 2):** o `visitante:` virou o cadastro do QR
  (§7.24). As etapas são puras (`lib/whatsapp/portaria-regras.ts`, `scripts/conferir-portaria.ts`): `proximaEtapa`
  (a ordem: nome, para quem, telefone, autorização — só com telefone e pessoa avisada —, de onde vem, motivo,
  crachá, foto, conferência), `perguntaDaVisita` (a pergunta e os botões), `seguirNoRegistro` (a resposta vira
  `seguir`, `buscar`, `confirmar`, `repetir` — com `sempre` no telefone com cara de telefone, que não cai no menu
  — ou `perdido`) e `resultadoDaBusca`; o servidor (`portaria.ts`) só busca a equipe, guarda a pendência e grava.
  - **Botões e palavras:** as opcionais levam Pular (`pular`, `ehPularNaVisita`, que aceita também “não tem”,
    “sem telefone”…), Registrar já (`registrar ja`, `ehRegistrarJa`: “pronto” e “só isso” também fecham) e
    Cancelar; a autorização, Sim e Não (ids `aceita` e `nao aceita`, lidos por `lerConsentimento` — “ok” solto não
    autoriza); a foto, Sem foto e Cancelar. Nessas etapas o “não” responde em vez de desistir
    (`ETAPAS_EM_QUE_NAO_RESPONDE`, em `seguirPendencia`), e as de texto livre (`ETAPAS_DE_TEXTO_LIVRE`) aceitam até
    nome de setor que é comando. A conferência (`textoDaConferenciaDaVisita`, com os campos novos opcionais) mostra
    só o que foi dito e, sem foto, lembra que dá para mandar antes do `confirmo`; o maior caso cabe no corpo de 1024.
  - **A imagem no bot** (`bot.ts`): antes do envio de fotos e do Drive, `destinoDaImagem` decide — com o registro
    aberto (`registrar_visita`, a citada ou a mais nova desse tipo, mesmo com um envio aberto), a imagem é a foto
    dele (`foto`); com a legenda `visitante: Nome` de quem tem a portaria (e sem registro aberto, ou aberto para
    outro nome), abre um registro com ela (`comecar`) — só com os dois-pontos (`lerLegendaDeVisita`): “Nova visita
    do governador ao hospital” é legenda de foto para a comunicação e vai ao envio de fotos —; o resto (vídeo,
    imagem citando aviso, quem não tem a portaria) segue como sempre. `receberFotoDaVisita` confere o tipo
    (`fotoRecebida`), grava o id da mídia na pendência na hora, com o prazo renovado (vale com o teto de respostas
    batido); na pergunta da foto, vem a seguinte com “Foto recebida ✓” (ou “Foto trocada ✓”: vale a última); nas
    outras, só o recibo (“Siga respondendo a pergunta acima”, ou o “Confirmo” da conferência acima), sem mexer no
    `mensagem_id` da pendência (`fotoMantemAPergunta`): os botões da pergunta que saiu continuam valendo — mandá-la
    de novo os invalidaria. O registro marca `visita_foto`. No meio do registro, `visitante: Maria` nas perguntas
    de texto livre não vira a empresa nem o motivo do visitante em curso: sem citar, abre o registro novo; citando,
    a pergunta se repete. As perguntas do registro nunca esperam na fila (`perguntaSemFila`): levam o telefone do
    visitante, e `whatsapp_fila.texto` o guardaria sem prazo.
  - **Depois do `confirmo`:** `gravarEntrada` passa telefone (formatado), empresa, motivo, `cracha_numero`,
    `avisar_visitante` e o visitado à mesma `portaria_registrar_entrada`; com a visita criada, `guardarFotoDaConversa`
    baixa, normaliza, grava e registra a foto (acima e §7.24) **antes** de `avisarVisitado`. A resposta
    (`textoDaEntradaRegistrada`) diz a hora, quem foi avisado, a autorização e se a foto entrou. Sem a migração
    `20261019040000`, a foto não entra (o arquivo sai do Blob) e a entrada vale. O assistente não muda: o
    `preparar_registro_de_visita` já tinha `empresa`; telefone, autorização e foto ficam no fluxo guiado.
  - **Etapa 3 (feita, abaixo):** a ficha para quem é visitado e a resposta ao visitante pelos modelos.
- **Portaria pelo WhatsApp com foto — a ficha e a resposta (19/10/2026, etapa 3):** §7.24, "Ficha e resposta pelo
  WhatsApp", tem o desenho. O que mudou no WhatsApp em si:
  - `notificar` devolve as linhas gravadas no sino (`LinhaDoSino[]`) e aceita `semWhatsapp` (quem recebe a
    mensagem por outro caminho); a decisão de quem recebe no WhatsApp saiu para `quemRecebeNoWhatsapp`
    (exportada, a mesma para o aviso comum e a ficha).
  - `Mensagem.modeloForaDaJanela` (`fila.ts`): a `entregar` passa o modelo da situação ao envio; o que espera na
    fila não o guarda e sai como o aviso de antes (os botões 1, 2 e 3 pelo link, o modelo do cofre).
  - `bot.ts` lê o toque na ficha antes do aviso citado, da pergunta e do assistente (`fichaTocada`);
    `responderVisita` (o caminho do aviso citado) recusa o botão de outra visita e lê o título do botão sem recado.
  - O assistente (`preparar_registro_de_visita`, o prompt e o texto do plano) manda o telefone, a autorização e a
    foto para o registro guiado (`visitante:` e o nome); a ferramenta já tinha `empresa`.
  - **Próximo passo:** os outros recuos de modelo (avisos, segurança, aprovações…) continuam pelo modelo do cofre
    (catalogar os `palacio_*` em `modelos.ts`, como na etapa 1); e conferir em produção, quando os modelos da
    portaria forem aprovados, o primeiro envio por modelo (a leitura da lista pelo WABA já volta 200).
- **Endereço do servidor:** o cartão de Integrações completa o `https://` e recusa endereço local
  (localhost, 192.168…, 172.16–31…): a Vercel não alcança o computador de ninguém.
- **Resposta à portaria:** a visita é um alvo de resposta como chamado e aprovação (§7.24):
  `responderAoAviso` desvia para `responderVisita` antes da conferência da verificação em duas
  etapas, e `atenderMensagem` aceita "1", "2" ou "3" sem citar quando só uma visita espera a pessoa
  (digitado; o toque numa lista não). Os botões “Pode subir”, “Aguarde na recepção” e “Não pode agora”
  vêm na ficha (ids `ficha:<n>:<visita>`, lidos antes de tudo e só para quem é visitado:
  `responderPelaFicha`) ou, no aviso que esperou na fila, com os ids 1, 2 e 3, que citam o aviso e seguem
  o mesmo caminho do número digitado.
- **Baileys é não oficial:** o WhatsApp pode bloquear número que pareça spam. Por isso só mandamos para
  quem confirmou o número, com teto por link. Use um chip só do Palácio.

### 8.6 API de Conversões da Meta: os pagamentos da Escola (02/10/2026)

O pixel do site não vê o pagamento (ele acontece na página da Únicopag, ou
no banco, no boleto e no PIX). Por isso é o servidor que avisa a Meta, pela
API de Conversões, depois de cada leitura das transações
(`sincronizarConta` → `enviarConversoes`, `lib/escola/conversoes-servidor.ts`).
Regras puras em `lib/escola/conversoes.ts` (`scripts/conferir-conversoes-escola.ts`);
banco em `20261002150000` e `20261004170000` (`supabase/tests/conversoes.test.sql`).

- **Quais contas mandam (04/10/2026).** `escola_conversoes.contas` (uuid[],
  vazio por padrão) lista as contas da Únicopag cujas vendas vão à Meta; a
  tela tem uma caixa por conta e `escola_conversoes_salvar` recusa id que não
  seja uuid ou não seja do espaço, e recusa ligar sem nenhuma marcada. **Falha
  fechada:** `enviarConversoes` só manda se a conta lida estiver na lista; se a
  leitura da configuração der erro (a coluna ainda não existe, por exemplo),
  não manda nada. Por quê: o espaço tem duas contas. A "CVB" recebe as vendas
  da plataforma da escola (escola.cursoscruzvermelha.org, "Taxa de inscrição —
  X"), que o pixel não vê — essa manda. A "Matricula automatica" recebe o
  checkout do site (`/matricula-cursos-presenciais/`, "X — Inscrição…"), e o
  site já manda esse `Purchase` pelo pixel (eventID `c.<hash do token>`) e pela
  API de Conversões dele, **só com o consentimento de marketing da pessoa**
  (é o que o aviso de cookies do site promete). Mandar daqui contaria a compra
  duas vezes (`unicopag:<hash>` é outro event_id) e mandaria dados de quem disse
  "não" — essa fica desmarcada. Na tela, id de conta apagada que sobrou em
  `contas` não conta como conta que manda (e de fato não manda).
- **Só ligue o pixel depois do merge desse código (04/10/2026).** O preview usa o
  banco de produção, e o código antigo da produção (`enviarConversoes` sem
  `contas`) manda as vendas de **todas** as contas, com o CPF, assim que
  `ativa` = true. Sem a migração `20261004170000`, a tela esconde o formulário e
  `ligarConversoes` recusa ("Aplique a migração 20261004170000 antes de ligar o
  pixel…"), porque a `escola_conversoes_salvar` antiga ignoraria as contas e
  gravaria ligado. Com a migração aplicada e o PR ainda aberto, o código novo
  não tem como impedir: a regra é de quem liga — aplicar a migração, mesclar,
  esperar o deploy da `main` e só então ligar.
- **Dois momentos, um evento.** Tudo sai como `Purchase` (a Meta otimiza por
  valor nesse evento), com `content_category` = `taxa_de_inscricao` quando o
  produto é "Taxa de inscrição — X" ou "X — Inscrição…", e `curso` no resto
  (`categoriaDoProduto`, mesma regra de nome de `cursoNoProduto`). No
  Gerenciador de Eventos a escola cria duas conversões personalizadas sobre
  esse parâmetro e cada campanha otimiza pela etapa que quiser.
- **O evento.** `event_id = unicopag:<hash>` (reenviar nunca duplica),
  `event_time` = `paga_em`, `action_source` `website` com a página do curso
  (`escola_cursos.pagina_url`) ou a página padrão da configuração — sem
  página, `other`. `custom_data`: `currency` BRL, `value`, `content_name`
  (curso), `content_ids` (produto), `order_id`.
- **A pessoa.** A Únicopag manda nome, e-mail, telefone e CPF na transação
  (`TransacaoLida.pessoa`). Eles ficam só na memória do servidor:
  `semPessoa()` tira antes de `escola_gravar_sincronizacao`, e vão à Meta já
  normalizados e com SHA-256 (`normalizarPessoa`: e-mail em minúsculas,
  telefone só dígitos com 55, nome sem acento). **O CPF não vai** (desde
  04/10/2026; antes ia como `external_id`): os Termos das Ferramentas de
  Negócios da Meta proíbem número de documento, e o site já decidiu o mesmo.
  `qualidadeDoEvento` diz se havia e-mail ou telefone (boa), só nome (fraca)
  ou nada; a mensagem da leitura avisa quando a Meta pode não casar.
  A documentação pública da Únicopag não diz o nome do campo do telefone:
  `lerTransacao` aceita `phone`, `phone_number`, `cellphone`, `mobile` e
  `telefone`. **Conferir numa transação real** e, se for outro, acrescentar.
- **O que não vai.** Venda de conta não marcada, venda não paga (estorno e
  chargeback incluídos), sem valor, produto de teste, produto ignorado pela
  equipe e venda paga há mais de 7 dias (a Meta não aceita). Logo, ao ligar o pixel, o histórico não
  é enviado.
- **Registro.** `escola_conversoes` (uma por espaço: pixel, página padrão,
  contas que mandam, ligado, último aviso, erro) e `escola_conversoes_envios`
  (uma linha por venda: categoria, curso, valor, qualidade, tentativas, enviado_em, rastro
  `fbtrace_id`, erro) — sem dado pessoal. `escola_conversoes_pendentes`
  filtra o lote (já enviado ou 5 falhas → fora); `escola_conversoes_registrar`
  grava o resultado sem sobrescrever o que já foi. A tela de transações mostra
  a coluna "Meta".
- **Token.** Serviço `meta_conversoes` no cofre (Gerenciador de Eventos →
  Configurações → API de Conversões → gerar token); na falta, o token do
  `meta_ads` (um usuário do sistema com acesso ao pixel também envia). Ligar
  testa `GET /{pixel}?fields=id,name`; "Enviar evento de teste" manda um
  `Purchase` de R$ 1,00 com `test_event_code`.
- **Cadência.** O cron diário das 9h lê tudo; um segundo cron
  (`/api/escola/sincronizar?so=unicopag`, 12h23 UTC) lê só a Únicopag. Ele nasceu
  de hora em hora (02/10), mas **o plano Hobby da Vercel só aceita cron diário**: com
  `23 * * * *` em `vercel.json`, todo deploy do projeto falhou de 02/10 a 03/10
  ("Hobby accounts are limited to daily cron jobs") e a produção ficou parada no
  commit anterior ao PR #292. Em 03/10 voltou a diário. Para o evento chegar perto
  do pagamento de novo, é preciso o plano Pro (decisão da instituição) e aí basta
  trocar a linha para `23 * * * *`; enquanto isso, o botão "Atualizar agora" na visão
  geral da Escola faz a leitura na hora.
- **Tempo da leitura (04/10).** A função na Vercel tem 60 s (plano Hobby) e a Únicopag às vezes demora:
  o "Atualizar agora" chegou a girar sem fim porque a leitura foi cortada antes de gravar. Agora as
  contas leem em paralelo (`sincronizarEspaco`), o botão lê só os últimos 30 dias (`leituraDoBotao`)
  e tanto ele quanto o cron têm um prazo de 40 s para pedir páginas: estourou, a leitura para, grava o
  que já leu e a mensagem avisa que foi parcial. A primeira carga de uma conta nova não tem prazo, para
  o histórico não ficar com buraco. `escola_gravar_sincronizacao` só insere ou atualiza, nunca apaga:
  ler menos não tira nada do banco. Conferido por `scripts/conferir-leitura-unicopag.ts`.
- **LGPD.** Dado pessoal com hash ainda é dado pessoal: a base legal
  (legítimo interesse na medição de anúncios, ou consentimento) e o aviso na
  página de inscrição são da escola. Decisão do Matheus (02/10): `Purchase`
  com categoria, e não dois eventos personalizados.
- **Teste local.** `META_GRAPH_URL` e `UNICOPAG_URL` apontam os dois clientes
  para servidores de mentira.

## 9. Convenções

**Marca.** O emblema (a cruz) é **sempre vermelho sobre fundo branco** — nunca
vazado em branco sobre vermelho, nunca como marca d'água, nunca recortado. Faixa
de destaque com a marca é branca com filete vermelho; o vermelho da marca é
`--primary` (`rgb(227 34 25)`). A logo oficial é `public/images/logo-cvrj.png`.
O vermelho da marca é acento (logo, botão principal, item ativo, filetes), não
sinal de problema: erro e atraso usam `--destructive` (`rgb(185 28 28)`, mais
escuro), sempre com ícone ou texto junto. Não use `primary` para alerta nem
`destructive` para marca.

**Modo escuro.** A escolha (claro, escuro ou automático) fica no cookie `tema`;
o `<html>` ganha a classe `dark` por um script no `<head>`, antes da primeira
pintura (`lib/tema.ts`, `components/tema.tsx`). Escreva cores pelos tokens
(`bg-card`, `text-muted-foreground`, `text-warning-foreground`…): eles trocam
sozinhos. As escalas fixas do Tailwind (`bg-amber-50`, `text-emerald-700`)
trocam de ponta no escuro (50↔950, 100↔900, 200↔800, 300↔700): um selo claro
com texto escuro vira selo escuro com texto claro sem `dark:` nenhum. **Não**
escreva `dark:text-amber-300` ao lado de `text-amber-700` (a troca já faz
isso, e a classe `dark:` seria invertida também); `dark:` só com tokens
(`dark:bg-muted`) e só onde o claro usa cor fixa em hex ou `bg-white`. Papel é
papel: a folha do ofício, os crachás e os cartazes levam a classe `papel` e
continuam claros; `/verificar`, `/cracha` e as páginas de impressão são sempre
claras (`CAMINHOS_SEMPRE_CLAROS`). Prévias de site, newsletter e e-mail em
`<iframe>` ficam `bg-white` de propósito. Conferência:
`npx tsx scripts/conferir-tema.ts`.

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
- **Serpro na verificação do candidato** (§7.36) — Consulta CPF (nome × CPF ×
  nascimento × situação na Receita) e Datavalid são pagos e exigem contrato com
  o CNPJ da filial; a entrada em `lib/integracoes/chaves.ts` está escrita e
  comentada. Roteiro em `docs/verificacao-de-voluntarios.md` §8.
- **Varredura de órfãos no Storage** — se uma action morrer entre o registro no
  banco e o `remove`, o objeto fica no bucket (`equipe-arquivos`,
  `voluntarios-arquivos`); uma rotina que compare `storage.objects` com as
  tabelas resolve.
- **Assistente do WhatsApp, implantação** (§8.5) — as quatro etapas estão no código, desligadas por padrão
  (liga-se pelo cartão em Configurações → WhatsApp; as ações, pela caixa "preparar ações"). Falta aplicar,
  nesta ordem, `20261019010000` (o assistente), `20261019020000` (a confirmação do plano no Palácio, que depende
  da anterior e falha se vier antes dela) e `20261019030000` (o Google Drive), e seguir a ordem: piloto com
  escrita; depois do "Não fui eu" visto funcionando, `modo='admins'` com escrita; uma semana sem incidente,
  `modo='equipe'`. A conferir no piloto: se `conversation.contact_name` da Kapso é o nome de perfil do WhatsApp (o
  payload v2 também traz `business_scoped_user_id`, que poderia substituir o nome); se a transcrição do áudio chega
  mesmo no payload; rodar `scripts/avaliar-assistente.ts --gastar` antes de ligar as ações. No Google Drive da conta
  conectada, compartilhar "Palácio – Arquivos" com a equipe (o que o Palácio cria nasce privado da conta: sem isso,
  os links do WhatsApp e da ficha do envio não abrem para ninguém mais).
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
