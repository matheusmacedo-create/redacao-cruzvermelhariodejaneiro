# redacao-cruzvermelhariodejaneiro

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_azjMa3KcVyvOD7eNt8NCJyvb5QV4)

## Como o projeto funciona

[**ARQUITETURA.md**](./ARQUITETURA.md) explica o sistema inteiro: fluxos, banco,
integrações, convenções e as armadilhas que já custaram produção. É a leitura de
entrada para quem — pessoa ou agente — vai mexer no código.

## Configuração

O app depende de um projeto Supabase (Postgres + Auth) e do Vercel Blob para
arquivos. Sem as variáveis abaixo o build passa, mas toda página quebra na
primeira query.

```bash
cp .env.example .env.local   # depois preencha SUPABASE_SERVICE_ROLE_KEY
pnpm install
pnpm dev
```

| Variável | Onde usar | Observação |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | pública, vai no bundle |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | pública, vai no bundle |
| `SUPABASE_URL` | server | usada por `lib/supabase/admin.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | server | **segredo** — ignora RLS, nunca prefixe com `NEXT_PUBLIC_` |
| `BLOB_READ_WRITE_TOKEN` | server | Vercel Blob; sem ela os uploads em `/api/files` falham |

### Banco de dados

O schema vive em `supabase/migrations/` — 19 tabelas, RLS em todas elas e três
funções (`submit_pauta_for_approval`, `submit_content_for_approval`,
`vote_on_approval`) que as server actions chamam via `supabase.rpc`.

Para aplicar em um projeto novo:

```bash
supabase link --project-ref <ref>
supabase db push
```

### Onde o projeto mora

A redação vive no projeto Supabase `puncaovenosa-fullautomatic` (ref
`lqpnbqislaxzhqkszijg`, região `sa-east-1`), o mesmo do funil do Curso de
Punção Venosa. O projeto próprio (`RedacaoCruzVermelha-Rj`) tinha sido criado
no Canadá, região de projeto Supabase não se troca depois, e cada consulta a
partir da Vercel em São Paulo pagava ~130 ms a mais — então a redação mudou de
projeto: schema, policies, funções, usuários e dados foram levados para lá e
conferidos linha a linha. O `.env.example` já aponta para o projeto certo.

O schema `public` é dividido. As tabelas do funil (`inscricoes`, `pagamentos`,
`triagem_respostas`, `validacoes`, `webhook_entregas`, `meta_capi_entregas`,
`visitas_landing`, `meta_publico_membros`, `email_entregas`), as funções e os
tipos dele são versionados no repositório `puncaovenosa-fullautomatic`;
nenhuma migration daqui pode tocá-los. Duas regras vêm disso:

- nome novo de tabela, função, tipo ou sequence é conferido contra o que o
  funil já tem antes de virar migration — colisão quebra os dois sistemas;
- privilégio é concedido tabela a tabela, nunca `grant ... on all tables in
  schema public`: isso daria à chave publicável desta app, que está no bundle
  do navegador, acesso às inscrições dos alunos. A migration 2 fazia isso e,
  no projeto compartilhado, foi aplicada com a lista explícita das tabelas
  daqui.

No histórico do projeto as 21 migrations deste repositório aparecem como três
entradas (`cvrj_01_editorial_tables_rls_rpcs_seed`,
`cvrj_02_demo_mensagens_redes_arquivos`,
`cvrj_03_carrossel_a_pacote_vinculado_ao_sinal`), aplicadas em bloco na
mudança. Antes do primeiro `supabase db push` contra ele, marque os 21 arquivos
como aplicados (`supabase migration repair --status applied <versão> ...`),
senão a CLI tenta recriar o que já existe.

Os status são gravados em inglês (`incoming`, `production`, `draft`, ...) e
traduzidos para a interface em `lib/status-maps.ts`. `lib/data.ts` é mock da
Fase 1 e não reflete o banco.

### Primeiro acesso

Com o banco vazio, a home detecta que não há nenhum perfil e abre a tela de
configuração inicial, que cria o primeiro administrador e o vincula aos espaços
de Demonstração e Produção (inseridos pela migration de seed).

## Deploy

Todo merge em `main` dispara deploy automático na Vercel. Antes do primeiro
deploy, cadastre as cinco variáveis acima em Project Settings → Environment
Variables — o build não falha sem elas, então a falta só aparece em runtime.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.
