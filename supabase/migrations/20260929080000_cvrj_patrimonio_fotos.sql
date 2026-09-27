-- Patrimônio: fotos do bem.
--
-- Cada bem tem até 12 fotos (JPEG no Vercel Blob privado, em
-- patrimonio/<workspace>/<bem>/<id>.jpg). A primeira pela ordem é a capa,
-- que aparece na lista. Vê quem vê o bem (nível 1 ou o bem está com a
-- pessoa); põe, tira e troca a capa quem opera o Patrimônio (nível 2), e
-- nunca num bem baixado. O arquivo é gravado antes pela rota
-- /api/patrimonio/fotos, que confere a sessão; o banco confere de novo o
-- nível e o formato do caminho.
--
-- Só acrescenta: tabela nova, com RLS, e três funções.

create table if not exists public.pat_bem_fotos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  bem_id        uuid not null references public.pat_bens (id) on delete cascade,
  path          text not null unique,
  legenda       text check (char_length(legenda) <= 120),
  ordem         integer not null default 0,
  criado_por    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists pat_bem_fotos_bem_idx on public.pat_bem_fotos (bem_id, ordem, created_at);
create index if not exists pat_bem_fotos_workspace_idx on public.pat_bem_fotos (workspace_id);
create index if not exists pat_bem_fotos_criado_idx on public.pat_bem_fotos (criado_por);

alter table public.pat_bem_fotos enable row level security;
revoke all on public.pat_bem_fotos from anon, authenticated;
grant select on public.pat_bem_fotos to authenticated;

drop policy if exists pat_bem_fotos_select on public.pat_bem_fotos;
create policy pat_bem_fotos_select on public.pat_bem_fotos for select to authenticated
  using ((select private.nivel_patrimonio(workspace_id)) >= 1 or private.pat_esta_comigo(bem_id));

/** Registra a foto já gravada no Blob. Devolve o id. */
create or replace function public.patrimonio_foto_adicionar(p_bem_id uuid, p_path text, p_legenda text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  b public.pat_bens;
  v_id uuid;
begin
  select * into b from public.pat_bens where id = p_bem_id for update;
  if not found or (select private.nivel_patrimonio(b.workspace_id)) < 2 then raise exception 'Bem não encontrado.' using errcode = 'P0001'; end if;
  if b.situacao = 'baixado' then raise exception 'Este bem foi baixado e não muda mais.' using errcode = 'P0001'; end if;
  if p_path is null or p_path !~ ('^patrimonio/' || b.workspace_id::text || '/' || b.id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$') then
    raise exception 'Foto inválida.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.pat_bem_fotos where bem_id = b.id) >= 12 then
    raise exception 'Este bem já tem 12 fotos. Tire uma antes de pôr outra.' using errcode = 'P0001';
  end if;
  insert into public.pat_bem_fotos (workspace_id, bem_id, path, legenda, ordem, criado_por)
  values (b.workspace_id, b.id, p_path, nullif(trim(left(coalesce(p_legenda, ''), 120)), ''),
    coalesce((select max(ordem) + 1 from public.pat_bem_fotos where bem_id = b.id), 0), (select auth.uid()))
  returning id into v_id;
  perform private.pat_registrar(b.workspace_id, b.id, 'foto_adicionar', '{}'::jsonb);
  return v_id;
end $$;

/** Tira a foto do bem. Devolve o caminho, para a rota apagar o arquivo do Blob. */
create or replace function public.patrimonio_foto_remover(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  f public.pat_bem_fotos;
  v_situacao text;
begin
  select * into f from public.pat_bem_fotos where id = p_id for update;
  if not found or (select private.nivel_patrimonio(f.workspace_id)) < 2 then raise exception 'Foto não encontrada.' using errcode = 'P0001'; end if;
  select situacao into v_situacao from public.pat_bens where id = f.bem_id;
  if v_situacao = 'baixado' then raise exception 'Este bem foi baixado e não muda mais.' using errcode = 'P0001'; end if;
  delete from public.pat_bem_fotos where id = f.id;
  perform private.pat_registrar(f.workspace_id, f.bem_id, 'foto_remover', '{}'::jsonb);
  return f.path;
end $$;

/** Põe a foto na frente: ela vira a capa do bem. */
create or replace function public.patrimonio_foto_capa(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  f public.pat_bem_fotos;
  v_situacao text;
begin
  select * into f from public.pat_bem_fotos where id = p_id for update;
  if not found or (select private.nivel_patrimonio(f.workspace_id)) < 2 then raise exception 'Foto não encontrada.' using errcode = 'P0001'; end if;
  select situacao into v_situacao from public.pat_bens where id = f.bem_id;
  if v_situacao = 'baixado' then raise exception 'Este bem foi baixado e não muda mais.' using errcode = 'P0001'; end if;
  update public.pat_bem_fotos set ordem = (select min(ordem) - 1 from public.pat_bem_fotos where bem_id = f.bem_id) where id = f.id;
end $$;

revoke all on function public.patrimonio_foto_adicionar(uuid, text, text) from public, anon;
revoke all on function public.patrimonio_foto_remover(uuid) from public, anon;
revoke all on function public.patrimonio_foto_capa(uuid) from public, anon;
grant execute on function public.patrimonio_foto_adicionar(uuid, text, text) to authenticated;
grant execute on function public.patrimonio_foto_remover(uuid) to authenticated;
grant execute on function public.patrimonio_foto_capa(uuid) to authenticated;

notify pgrst, 'reload schema';
