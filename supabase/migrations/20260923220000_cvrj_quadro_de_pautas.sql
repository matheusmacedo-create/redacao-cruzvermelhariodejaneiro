-- Quadro de pautas no estilo Trello: ordem dos cartões dentro da coluna e
-- checklist por pauta.
--
--  1. POSIÇÃO FRACIONÁRIA. Arrastar um cartão entre dois outros grava a média
--     das posições vizinhas — uma escrita só, sem renumerar a coluna inteira.
--     Menor posição fica em cima.
--
--  2. CHECKLIST É DA PAUTA, e segue a mesma regra de edição dela: qualquer
--     membro do espaço marca e acrescenta itens; apagar item, também (item de
--     checklist não é registro que precise de dono).

alter table public.pautas add column if not exists posicao double precision;

-- Ordem inicial = a que o quadro já mostrava (mais recente em cima).
with ordem as (
  select id, row_number() over (partition by workspace_id, status order by created_at desc) as n
  from public.pautas
)
update public.pautas p set posicao = o.n * 1024 from ordem o where o.id = p.id and p.posicao is null;

create index if not exists pautas_quadro_idx on public.pautas (workspace_id, status, posicao);

create table if not exists public.pauta_checklist (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  pauta_id     uuid not null references public.pautas (id) on delete cascade,
  texto        text not null check (length(trim(texto)) between 1 and 300),
  feito        boolean not null default false,
  posicao      double precision not null default 0,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists pauta_checklist_pauta_idx on public.pauta_checklist (pauta_id, posicao);
create index if not exists pauta_checklist_workspace_idx on public.pauta_checklist (workspace_id);
create index if not exists pauta_checklist_created_by_idx on public.pauta_checklist (created_by);

alter table public.pauta_checklist enable row level security;

create policy pauta_checklist_select_member on public.pauta_checklist
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));

create policy pauta_checklist_insert_member on public.pauta_checklist
  for insert to authenticated with check (
    (select private.is_workspace_member(workspace_id))
    and (select private.pauta_workspace(pauta_id)) = workspace_id
    and created_by = (select auth.uid())
  );

create policy pauta_checklist_update_member on public.pauta_checklist
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));

create policy pauta_checklist_delete_member on public.pauta_checklist
  for delete to authenticated using ((select private.is_workspace_member(workspace_id)));
