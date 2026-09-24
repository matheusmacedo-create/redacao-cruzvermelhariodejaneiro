<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Redação CVB-RJ — regras para qualquer agente (Claude Code, Cursor, Copilot…)

Este arquivo é lido automaticamente pelo Claude Code de cada colaborador
(`CLAUDE.md` importa este arquivo) e por outros agentes que seguem o padrão
`AGENTS.md`. O bloco acima é do Next.js; **o texto daqui para baixo é nosso** e o
`next dev` não mexe nele.

**Antes de escrever código, leia [`ARQUITETURA.md`](./ARQUITETURA.md)**: fluxos,
banco, integrações, convenções (§9), armadilhas já pagas (§10) e o roteiro para
agentes (§12). Como conectar o seu Claude Code está em
[`docs/COLABORAR-COM-CLAUDE-CODE.md`](./docs/COLABORAR-COM-CLAUDE-CODE.md).

## O projeto em uma linha

Next.js 16 (App Router, `proxy.ts`, server actions) + React 19 + Supabase (Auth,
Postgres com RLS) + Vercel (deploy, Blob, crons) + Resend. Gerenciador: **pnpm**.

## Regras que não se negociam

1. **Credenciais: só nomes, nunca valores.** Não peça, não cole, não escreva
   chave, senha ou token em chat, código, commit, log ou rota de diagnóstico.
   Não leia `.env.local`. Os valores vivem na Vercel.
2. **O banco é um só, e é produção.** Não existe banco de desenvolvimento: um
   `.env.local` com a chave de serviço aponta para os dados reais. Não rode SQL
   de escrita, `supabase db push` nem scripts que gravem dados sem o
   responsável pedir explicitamente.
3. **Migração só acrescenta.** Arquivo novo em `supabase/migrations/`, com
   versão maior que a última (`ls supabase/migrations | tail -1`). Coluna ou
   tabela só sai num deploy posterior, depois que o código parou de usá-la.
   Toda tabela nova tem RLS. Detalhes: skill `migracao`.
4. **pnpm, nunca npm.** `npm install` cria um lockfile concorrente e quebra o
   build da Vercel.
5. **Antes de todo push:** `npx tsc --noEmit`, eslint nos arquivos alterados e
   `pnpm build` (se o `.next` estiver com tipos velhos: `rm -rf .next`).
   Skill `validar` faz tudo isso.
6. **Nunca direto na `main`.** Trabalhe num branch, abra PR, confira o preview
   da Vercel. Todo merge na `main` publica em produção na hora.
7. **Relate o que aconteceu de verdade**: o que passou, o que falhou, o que não
   foi testado.

## Convenções

- Interface, mensagens de erro, comentários e commits em **português**. Código
  novo nomeia em português; código antigo em inglês fica como está.
- Toda escrita passa por server action que começa com `requireWorkspace()` /
  `requirePermissao()`, filtra por `workspace_id` e confere de novo no servidor.
- Lógica não trivial vai para um módulo puro em `lib/`, conferido com um
  script `npx tsx` (não há suíte de testes).
- Siga o estilo do arquivo que está editando; não reformate o que não mudou.
- Avisos a pessoas passam por `notificar()` (`lib/notificacoes/servidor.ts`).
