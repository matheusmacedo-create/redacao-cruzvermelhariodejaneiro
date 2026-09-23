-- Projetos no modelo do Asana: datas, responsável, situação com histórico de
-- atualizações, marcos e linha do tempo das pautas.
--
--  1. SITUAÇÃO VEM DE UMA ATUALIZAÇÃO ESCRITA. "Em risco" sem explicação não
--     ajuda ninguém; por isso a situação do projeto só muda publicando uma
--     atualização (project_updates), que fica no histórico. A coluna
--     projects.situacao guarda a mais recente, para a carteira não precisar
--     procurar a última atualização de cada projeto.
--
--  2. A PAUTA GANHA DATA DE INÍCIO. O prazo (due_date) já existia e continua
--     sendo o fim; com o início, a pauta vira uma barra na linha do tempo.
--
--  3. MARCOS SÃO DATAS DO PROJETO, não pautas: lançamento, dia do evento,
--     balanço. Não têm etapa nem responsável — só data e "cumprido".

alter table public.projects
  add column if not exists inicio          date,
  add column if not exists fim             date,
  add column if not exists responsavel_id  uuid references public.profiles (id) on delete set null,
  add column if not exists situacao        text check (situacao in ('no_prazo','em_risco','atrasado')),
  add column if not exists situacao_em     timestamptz,
  add column if not exists concluido_em    timestamptz;

alter table public.projects drop constraint if exists projects_datas_check;
alter table public.projects add constraint projects_datas_check check (inicio is null or fim is null or inicio <= fim);

create index if not exists projects_responsavel_idx on public.projects (responsavel_id);

alter table public.pautas add column if not exists data_inicio date;

create or replace function private.project_workspace(p_project_id uuid)
returns uuid language sql security definer set search_path = '' stable as $$
  select p.workspace_id from public.projects p where p.id = p_project_id;
$$;

create table if not exists public.project_updates (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,
  situacao     text not null check (situacao in ('no_prazo','em_risco','atrasado')),
  texto        text not null check (length(trim(texto)) between 3 and 4000),
  autor_id     uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists project_updates_projeto_idx on public.project_updates (project_id, created_at desc);
create index if not exists project_updates_workspace_idx on public.project_updates (workspace_id);
create index if not exists project_updates_autor_idx on public.project_updates (autor_id);

create table if not exists public.project_marcos (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,
  titulo       text not null check (length(trim(titulo)) between 1 and 120),
  data         date not null,
  feito        boolean not null default false,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists project_marcos_projeto_idx on public.project_marcos (project_id, data);
create index if not exists project_marcos_workspace_idx on public.project_marcos (workspace_id);
create index if not exists project_marcos_created_by_idx on public.project_marcos (created_by);

alter table public.project_updates enable row level security;
alter table public.project_marcos enable row level security;

create policy project_updates_select_member on public.project_updates
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy project_updates_insert_member on public.project_updates
  for insert to authenticated with check (
    (select private.is_workspace_member(workspace_id))
    and (select private.project_workspace(project_id)) = workspace_id
    and autor_id = (select auth.uid())
  );
-- Atualização é registro: só quem escreveu, ou um admin, apaga.
create policy project_updates_delete_autor on public.project_updates
  for delete to authenticated using (
    (select private.is_workspace_member(workspace_id))
    and ((select private.workspace_role(workspace_id)) = 'admin' or autor_id = (select auth.uid()))
  );

create policy project_marcos_select_member on public.project_marcos
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy project_marcos_insert_member on public.project_marcos
  for insert to authenticated with check (
    (select private.is_workspace_member(workspace_id))
    and (select private.project_workspace(project_id)) = workspace_id
    and created_by = (select auth.uid())
  );
create policy project_marcos_update_member on public.project_marcos
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy project_marcos_delete_member on public.project_marcos
  for delete to authenticated using ((select private.is_workspace_member(workspace_id)));
