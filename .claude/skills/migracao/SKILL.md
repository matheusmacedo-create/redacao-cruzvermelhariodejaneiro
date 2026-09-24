---
name: migracao
description: Como criar uma migração do Supabase na Redação sem quebrar produção — versão do arquivo, só acrescentar, RLS obrigatório e como testar. Use ao criar/alterar tabela, coluna, índice, política RLS, função ou trigger.
---

# Migração do banco (Supabase)

Existe **um único banco, e ele é o de produção** (projeto `wlbbfkudeibalkaqphpo`).
Não há ambiente de desenvolvimento separado. Por isso:

## Regras

1. **Arquivo novo** em `supabase/migrations/`, nome `AAAAMMDDHHMMSS_cvrj_<assunto>.sql`,
   com versão **maior** que a última:
   ```bash
   ls supabase/migrations | tail -1
   ```
   Outro colaborador pode ter criado uma migração enquanto você trabalhava:
   confira de novo depois de trazer a `main` (`git fetch origin main`). Versão
   repetida quebra a aplicação.
2. **Só acrescente.** `add column if not exists`, `create table if not exists`,
   `create index if not exists`. Nada de `drop`/`rename` de coluna que o código
   no ar ainda usa: o código publicado continua rodando até o deploy novo, e a
   migração entra antes. Remoção vai num PR posterior, depois que ninguém usa.
3. **Toda tabela nova tem RLS** (`enable row level security`), com `revoke`
   para `anon` e políticas explícitas. Escrita normalmente passa pela server
   action com o service role, depois da checagem de permissão.
   Use os helpers existentes (`private.is_workspace_member`, `private.workspace_role`)
   em vez de reinventar.
4. **Idempotente**: rodar duas vezes não pode falhar (`if not exists`,
   `drop policy if exists` antes de `create policy`,
   `do $$ ... exception when duplicate_object then null; end $$`).
5. Leia a skill `supabase-postgres-best-practices` para tipos, índices e RLS.

## Testar antes de subir

Quando a migração mexe em RLS ou permissões, prove num Postgres descartável:
suba um Postgres 16 local, crie os papéis `anon`/`authenticated`/`service_role`
e um `auth.uid()` de mentira, aplique **todas** as migrações em ordem e rode
consultas com `set local role authenticated` + `request.jwt.claim.sub` para cada
papel. Erros de extensões que só existem no Supabase (vault, pg_net) podem ser
ignorados; os da sua migração, não.

## Aplicar em produção

**Não aplique você mesmo** a menos que o responsável peça explicitamente. O
caminho normal: a migração vai no PR, alguém com acesso de administrador ao
Supabase aplica (MCP do Supabase ou painel) antes ou junto do merge, e confere
com uma consulta ao `information_schema`.
