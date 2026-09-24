# Trabalhar na Redação com o seu Claude Code

Guia para quem vai colaborar no código da Redação usando o próprio Claude Code:
no navegador, no VS Code (ou Cursor/Windsurf), no JetBrains, no terminal ou num
Codespace. Cada pessoa usa a **própria conta** do Claude; o repositório já traz
as regras, os atalhos e as permissões prontas, então todo mundo trabalha do
mesmo jeito.

---

## 1. O que você precisa antes

| O quê | Quem providencia | Para quê |
|---|---|---|
| Conta no GitHub adicionada ao repositório `matheusmacedo-create/redacao-cruzvermelhariodejaneiro` | O dono do repositório (GitHub → Settings → Collaborators) | Ler o código, criar branch e abrir PR |
| Conta do Claude com Claude Code (um plano que inclua o Claude Code, ou uma chave de API própria) | Você | O seu Claude Code |
| Acesso ao Supabase e à Vercel | **Só administradores** | Consultar o banco e os deploys pelo Claude (opcional) |

Ninguém precisa de senha, chave ou token de ninguém. Se alguém te pedir uma
credencial por chat, não mande.

---

## 2. Escolha onde trabalhar

Todas as opções leem as mesmas regras do repositório. Escolha a que for mais
confortável.

### a) No navegador — claude.ai/code (não instala nada)

Recomendado para começar e para quem não programa no dia a dia.

1. Entre em **claude.ai/code** e conecte a sua conta do GitHub.
2. Escolha o repositório da Redação. Se ele não aparecer, o app do Claude
   ainda não tem acesso a ele: peça ao dono do repositório para autorizar.
3. Peça o que precisa em português. A sessão já sobe com as dependências
   instaladas (o repositório tem um *hook* que roda `pnpm install` sozinho).

### b) VS Code, Cursor ou Windsurf

1. Instale a extensão **Claude Code** (`anthropic.claude-code`). Ao abrir a
   pasta do projeto, o VS Code já sugere as extensões recomendadas.
2. Clone o repositório e instale as dependências:
   ```bash
   git clone https://github.com/matheusmacedo-create/redacao-cruzvermelhariodejaneiro.git
   cd redacao-cruzvermelhariodejaneiro
   pnpm install        # pnpm, nunca npm
   ```
3. Abra o painel do Claude Code na barra lateral e faça login com a sua conta.

### c) JetBrains (WebStorm, IntelliJ…)

Instale o plugin **Claude Code** pelo Marketplace do JetBrains, clone o
repositório como acima e abra a pasta.

### d) Terminal (CLI)

Instale seguindo https://code.claude.com/docs/en/setup, clone o repositório,
rode `pnpm install` e, dentro da pasta, `claude`.

### e) GitHub Codespaces ou Dev Container

O repositório tem `.devcontainer/`: Node 22, pnpm, Claude Code e as extensões
já vêm prontos.

- **Codespaces:** no GitHub, botão **Code → Codespaces → Create codespace on
  main**.
- **VS Code local com Docker:** comando *Dev Containers: Reopen in Container*.

---

## 3. O que já vem configurado (você não precisa fazer nada)

| Arquivo | O que faz |
|---|---|
| `AGENTS.md` (lido via `CLAUDE.md`) | As regras do projeto que o Claude segue: credenciais, banco de produção, migrações, pnpm, validação, PR. Outros agentes (Cursor, Copilot) também leem. |
| `ARQUITETURA.md` | O mapa completo do sistema. O Claude consulta antes de mexer. |
| `.claude/skills/` | Atalhos: **/validar** (tipos, lint e build), **/migracao** (como mexer no banco sem quebrar produção), **/entregar** (branch, commit, PR), além das skills do Supabase. |
| `.claude/settings.json` | Libera sem perguntar os comandos seguros (`pnpm build`, `npx tsc`, `git status`…) e **bloqueia** ler `.env`, `npm install`, push forçado, push direto na `main`, `supabase db push` e `vercel env pull`. |
| `.claude/hooks/session-start.sh` | Na web, instala as dependências ao abrir a sessão. No seu computador não faz nada. |
| `.mcp.json` | Conexões opcionais: **Supabase (somente leitura)** e **Vercel**. Na primeira vez o Claude pergunta se você aprova; o login é pela sua própria conta. Quem não tem acesso ao Supabase/Vercel simplesmente não usa. |
| `.vscode/`, `.devcontainer/` | Extensões recomendadas e ambiente pronto. |

---

## 4. O dia a dia

1. **Traga a `main` atualizada** e crie um branch seu:
   ```bash
   git switch main && git pull
   git switch -c seunome/o-que-vai-fazer
   ```
   (Na web isso é automático: cada sessão já trabalha num branch próprio.)
2. **Peça ao Claude** o que precisa. Ele segue as regras do `AGENTS.md`.
3. **Valide:** `/validar` (ou peça "valide antes de subir").
4. **Entregue:** `/entregar` — commit em português, push do branch e PR.
5. **Confira o preview:** a Vercel comenta no PR com um link. Percorra a tela
   que mudou. Atenção: o preview usa os **dados reais** e não envia e-mail.
6. **Revisão e merge:** quem revisa faz o merge. Todo merge na `main` publica
   em produção na hora.

Dois colaboradores mexendo no mesmo lugar: quem abrir o PR depois traz a
`main` (`git fetch origin main && git merge origin/main`) e resolve o conflito
antes do merge. Migração nova: confira de novo a versão do arquivo depois de
trazer a `main` — dois arquivos com a mesma versão quebram o banco.

---

## 5. Rodar o sistema no seu computador (opcional)

Só é preciso para quem vai ver a tela funcionando localmente; para a maioria
das mudanças, o **preview do PR basta**.

A Redação tem **um único banco, o de produção**. Rodar `pnpm dev` com a chave
de serviço significa mexer nos dados reais da Cruz Vermelha. Por isso:

- a chave de serviço (`SUPABASE_SERVICE_ROLE_KEY`) e as outras credenciais
  **só vão para administradores**, entregues pessoalmente pelo responsável —
  nunca por chat, e-mail ou commit;
- quem recebe cria `.env.local` a partir de `.env.example`
  (`cp .env.example .env.local`) e preenche **à mão**. O arquivo nunca é
  commitado (`.gitignore` já cuida) e o Claude está proibido de lê-lo;
- sem a chave, `pnpm build` passa, mas as telas quebram na primeira consulta:
  é esperado.

---

## 6. Regras de segurança (resumo)

- Credencial nenhuma em chat, código, commit, print ou mensagem. Vazou? Avise
  o responsável para trocar a chave.
- Nada de SQL de escrita, `supabase db push` ou scripts que gravem dados sem o
  responsável pedir. As conexões MCP compartilhadas são somente leitura.
- Nada de push direto na `main`: sempre branch + PR.
- Na dúvida, pergunte antes. É mais barato do que desfazer em produção.

### Para administradores: Supabase com escrita

O `.mcp.json` compartilhado é somente leitura. Quem administra o banco e
precisa aplicar migrações pelo Claude cria uma conexão **local** com o mesmo
nome, que tem prioridade sobre a do projeto e só vale na sua máquina:

```bash
claude mcp add --scope local --transport http supabase \
  "https://mcp.supabase.com/mcp?project_ref=wlbbfkudeibalkaqphpo&features=docs%2Cdatabase%2Cdebugging%2Cdevelopment"
```

---

## 7. Problemas comuns

| Sintoma | Causa e saída |
|---|---|
| O repositório não aparece no claude.ai/code | Sua conta do GitHub não é colaboradora, ou o app do Claude não foi autorizado no repositório. Fale com o dono. |
| `ERR_PNPM_OUTDATED_LOCKFILE` | Alguém mudou o `package.json` sem o lockfile. Rode `pnpm install` e commite o `pnpm-lock.yaml`. |
| O build reclama de tipos de uma rota que não existe | `rm -rf .next` e rode de novo. |
| O Claude pede permissão para algo bloqueado | É de propósito (veja a seção 3). Se for mesmo necessário, faça você, conscientemente, ou fale com o responsável. |
| O servidor MCP do Supabase/Vercel não conecta | Faça o login por `/mcp` no Claude Code. Sem acesso ao projeto no Supabase/Vercel, ele não vai funcionar — e não precisa. |
