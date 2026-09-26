-- Início modular: cada pessoa escolhe os blocos do Início e a ordem deles.
-- Só acréscimos. Pedido do Matheus (26/09/2026): "o usuário escolhe o que
-- aparece e na posição que aparece". Os blocos e a arrumação padrão moram em
-- lib/inicio/blocos.ts; aqui fica só a escolha de cada um. Sem linha, vale a padrão.

create table if not exists public.inicio_preferencias (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  -- [{ "id": "pautas", "visivel": true }, …], na ordem da tela.
  blocos        jsonb not null default '[]' check (jsonb_typeof(blocos) = 'array' and jsonb_array_length(blocos) <= 50),
  updated_at    timestamptz not null default now(),
  primary key (user_id, workspace_id)
);
comment on table public.inicio_preferencias is 'A arrumação do Início de cada pessoa: quais blocos aparecem e em que ordem (lib/inicio/blocos.ts).';
create index if not exists inicio_preferencias_ws_idx on public.inicio_preferencias (workspace_id);

alter table public.inicio_preferencias enable row level security;
revoke all on public.inicio_preferencias from anon;
revoke all on public.inicio_preferencias from authenticated;
grant select, insert, update, delete on public.inicio_preferencias to authenticated;

-- Cada um só vê e muda a própria arrumação, no espaço de que faz parte.
drop policy if exists inicio_preferencias_select on public.inicio_preferencias;
create policy inicio_preferencias_select on public.inicio_preferencias for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists inicio_preferencias_insert on public.inicio_preferencias;
create policy inicio_preferencias_insert on public.inicio_preferencias for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)));
drop policy if exists inicio_preferencias_update on public.inicio_preferencias;
create policy inicio_preferencias_update on public.inicio_preferencias for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)));
drop policy if exists inicio_preferencias_delete on public.inicio_preferencias;
create policy inicio_preferencias_delete on public.inicio_preferencias for delete to authenticated
  using (user_id = (select auth.uid()));
