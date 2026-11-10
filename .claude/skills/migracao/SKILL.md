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

**A migração entra em produção antes do push do código que depende dela.**
Como ela só acrescenta, convive com o código que está no ar. O contrário não
vale: código novo sem a migração quebra a tela, e isso já aconteceu mais de uma
vez (ARQUITETURA §10.7). Empurrar o branch já oferece o botão de abrir o PR, e
aqui o merge costuma vir em segundos.

**Não aplique você mesmo** a menos que o responsável peça explicitamente. O
caminho:

1. Teste num Postgres descartável (acima).
2. **Assim que a migração estiver pronta e testada, e não no fim do trabalho**,
   mostre ao responsável o arquivo e um resumo do que ele cria, e peça a
   autorização. Em sessão na nuvem o ambiente expira: quanto antes, melhor.
3. O responsável roda o arquivo no SQL Editor do Supabase, ou pede que o
   agente aplique pelo MCP do Supabase (abaixo). Só quem administra o banco
   tem a conexão com escrita (`docs/COLABORAR-COM-CLAUDE-CODE.md`). Quem não
   administra pode empurrar **só a migração** (o arquivo e o teste dela, sem o
   código que depende) num PR em rascunho, para o responsável ler e aplicar.
4. Confira com uma consulta ao `information_schema` e em
   `supabase_migrations.schema_migrations`. Pelo MCP, a versão gravada é a hora
   da aplicação, e não a do arquivo: procure pelo **nome** (`cvrj_<assunto>`).
5. Só então empurre o branch e abra o PR, com "Migração aplicada em produção"
   marcada (skill `entregar`).

Sem autorização, não empurre o código que depende dela: deixe o commit local e
diga o que ficou esperando. O check "Migração aplicada?"
(`.github/workflows/migracao-pendente.yml`) continua valendo para o PR que, por
exceção, nascer com a migração pendente: fica vermelho até a caixa ser marcada.

### Pelo MCP do Supabase

- Use `apply_migration`, com o nome do arquivo sem a versão (`cvrj_<assunto>`).
- **O MCP recebe o SQL digitado, e não o arquivo.** Para um erro de cópia não
  chegar ao banco, embrulhe o texto num bloco que confere o md5 contra o
  arquivo (`md5sum`) e só então executa:
  ```sql
  do $trava$
  declare
    v text := $sql$-- a primeira linha do arquivo começa aqui, colada na marca
  …o arquivo inteiro, sem tirar nem pôr…
  -- a última linha do arquivo
  $sql$;
  begin
    if md5(v) <> '<md5 do arquivo>' then
      raise exception 'o texto difere do arquivo: md5 %', md5(v);
    end if;
    execute v;
  end
  $trava$;
  ```
  No comando de verdade o conteúdo do arquivo vai sem o recuo deste exemplo. A
  marca de abertura (`$sql$`) fica colada no primeiro caractere do arquivo, e a
  de fechamento vem no começo da linha seguinte à última. Use marcas que não
  apareçam no arquivo. Arquivo grande: divida em partes, com o md5 de cada uma,
  para saber qual difere. Ensaie o embrulho no Postgres descartável antes.
  Não serve para o que não roda dentro de transação (`create index
  concurrently`): aí o responsável aplica pelo SQL Editor.
- **O MCP pede confirmação na tela de quem conversa com o agente** e desiste
  em poucos minutos (cerca de 4). Combine antes que a pessoa esteja na tela. Se
  o pedido expirar, nada foi aplicado: confira e peça de novo, sem contornar a
  confirmação por outra ferramenta.
