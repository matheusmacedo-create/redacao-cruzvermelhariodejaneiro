-- Quadro de pautas, segunda etapa: etiquetas coloridas, arquivar pelo quadro
-- e atualização ao vivo.
--
--  1. ETIQUETAS são do espaço (compartilhadas por todas as pautas), com nome
--     obrigatório: a cor nunca é a única informação. As cores são uma paleta
--     fechada, escolhida para texto branco passar de 4,5:1 de contraste.
--
--  2. ARQUIVAR guarda de qual etapa a pauta saiu (arquivada_de), para que
--     "restaurar" a devolva ao mesmo lugar, como no Trello.
--
--  3. AO VIVO: pautas e etiquetas entram na publicação do Realtime. O quadro
--     escuta só a tabela de pautas (filtrada pelo espaço) e a de etiquetas;
--     mudanças de etiqueta e de checklist num cartão tocam o updated_at da
--     pauta, e é esse UPDATE que avisa quem está olhando o quadro. Assim não
--     há evento de DELETE sem filtro circulando entre espaços.

create table if not exists public.etiquetas (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  nome         text not null check (length(trim(nome)) between 1 and 40),
  cor          text not null check (cor in ('verde','lima','amarelo','laranja','vermelho','rosa','roxo','azul','ceu','cinza')),
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index if not exists etiquetas_nome_idx on public.etiquetas (workspace_id, lower(nome));
create index if not exists etiquetas_created_by_idx on public.etiquetas (created_by);

create table if not exists public.pauta_etiquetas (
  pauta_id     uuid not null references public.pautas (id) on delete cascade,
  etiqueta_id  uuid not null references public.etiquetas (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (pauta_id, etiqueta_id)
);
create index if not exists pauta_etiquetas_etiqueta_idx on public.pauta_etiquetas (etiqueta_id);
create index if not exists pauta_etiquetas_workspace_idx on public.pauta_etiquetas (workspace_id);

alter table public.pautas add column if not exists arquivada_de text;

alter table public.etiquetas enable row level security;
alter table public.pauta_etiquetas enable row level security;

create policy etiquetas_select_member on public.etiquetas
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy etiquetas_insert_member on public.etiquetas
  for insert to authenticated with check (
    (select private.is_workspace_member(workspace_id)) and created_by = (select auth.uid())
  );
create policy etiquetas_update_member on public.etiquetas
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy etiquetas_delete_member on public.etiquetas
  for delete to authenticated using ((select private.is_workspace_member(workspace_id)));

create policy pauta_etiquetas_select_member on public.pauta_etiquetas
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
-- Pauta e etiqueta precisam ser do MESMO espaço da linha: sem isto, alguém
-- poderia pendurar a etiqueta de um espaço na pauta de outro.
create policy pauta_etiquetas_insert_member on public.pauta_etiquetas
  for insert to authenticated with check (
    (select private.is_workspace_member(workspace_id))
    and (select private.pauta_workspace(pauta_id)) = workspace_id
    and exists (select 1 from public.etiquetas e where e.id = etiqueta_id and e.workspace_id = pauta_etiquetas.workspace_id)
  );
create policy pauta_etiquetas_delete_member on public.pauta_etiquetas
  for delete to authenticated using ((select private.is_workspace_member(workspace_id)));

alter publication supabase_realtime add table public.pautas, public.etiquetas;
