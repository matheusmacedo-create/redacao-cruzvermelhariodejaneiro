-- Quem assina o Diploma de Reconhecimento. Só acréscimos.
-- Pedido do Matheus (27/09/2026): além da presidência, a vice-presidência e a
-- coordenação do Voluntariado podem assinar (até três no diploma).
--  - a filial escolhe a lista na área de Diplomas (coordenação do Voluntariado, nível ≥ 2);
--  - cada diploma novo guarda a lista do dia em que foi emitido (diplomas.assinaturas):
--    se a diretoria mudar, os diplomas antigos continuam com quem assinava;
--  - os emitidos antes disto ficam com assinaturas nulas e seguem a lista atual
--    da filial (lib/cursos/assinaturas.ts, assinaturasDoDiploma).

create table if not exists public.diplomas_config (
  workspace_id   uuid primary key references public.workspaces (id) on delete cascade,
  -- [{ "nome": "...", "cargo": "..." }], de 1 a 3, na ordem do diploma.
  assinaturas    jsonb not null check (jsonb_typeof(assinaturas) = 'array' and jsonb_array_length(assinaturas) between 1 and 3),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references public.profiles (id) on delete set null
);
comment on table public.diplomas_config is 'Quem assina os Diplomas de Reconhecimento da filial (até três). Copiado para cada diploma na emissão.';
create index if not exists diplomas_config_atualizado_por_idx on public.diplomas_config (atualizado_por);

alter table public.diplomas_config enable row level security;
revoke all on public.diplomas_config from anon, authenticated;
grant select on public.diplomas_config to authenticated;
-- A equipe do Voluntariado lê (é o que o PDF mostra); só a função abaixo grava.
drop policy if exists diplomas_config_select on public.diplomas_config;
create policy diplomas_config_select on public.diplomas_config for select to authenticated
  using ((select private.nivel_participantes(workspace_id)) >= 1);

alter table public.diplomas add column if not exists assinaturas jsonb
  check (assinaturas is null or (jsonb_typeof(assinaturas) = 'array' and jsonb_array_length(assinaturas) between 1 and 3));
comment on column public.diplomas.assinaturas is 'Quem assinava na emissão (cópia de diplomas_config). Nulo nos diplomas de antes: seguem a lista atual.';

-- Cada diploma novo leva a lista da filial daquele dia (os de horas saem por gatilho; os da coordenação, por conceder_diploma).
create or replace function private.diplomas_com_assinaturas()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.assinaturas is null then
    select c.assinaturas into new.assinaturas from public.diplomas_config c where c.workspace_id = new.workspace_id;
  end if;
  return new;
end $$;
revoke all on function private.diplomas_com_assinaturas() from public, anon, authenticated;
drop trigger if exists diplomas_assinaturas on public.diplomas;
create trigger diplomas_assinaturas before insert on public.diplomas
  for each row execute function private.diplomas_com_assinaturas();

-- A coordenação define a lista. Confere o nível e o formato; devolve a lista gravada.
create or replace function public.definir_assinaturas_do_diploma(p_workspace_id uuid, p_assinaturas jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_nome text;
  v_cargo text;
  v_lista jsonb := '[]'::jsonb;
begin
  if (select private.nivel_participantes(p_workspace_id)) < 2 then
    raise exception 'Só quem gerencia o Voluntariado escolhe quem assina os diplomas.' using errcode = 'P0001';
  end if;
  if p_assinaturas is null or jsonb_typeof(p_assinaturas) <> 'array' or jsonb_array_length(p_assinaturas) not between 1 and 3 then
    raise exception 'O diploma leva de uma a três assinaturas.' using errcode = 'P0001';
  end if;
  for v_item in select value from jsonb_array_elements(p_assinaturas) loop
    v_nome := regexp_replace(trim(coalesce(v_item ->> 'nome', '')), '\s+', ' ', 'g');
    v_cargo := regexp_replace(trim(coalesce(v_item ->> 'cargo', '')), '\s+', ' ', 'g');
    if length(v_nome) not between 3 and 80 then
      raise exception 'Escreva o nome de quem assina (de 3 a 80 letras).' using errcode = 'P0001';
    end if;
    if length(v_cargo) not between 2 and 60 then
      raise exception 'Escreva o cargo de % (de 2 a 60 letras).', v_nome using errcode = 'P0001';
    end if;
    v_lista := v_lista || jsonb_build_array(jsonb_build_object('nome', v_nome, 'cargo', v_cargo));
  end loop;
  insert into public.diplomas_config (workspace_id, assinaturas, atualizado_em, atualizado_por)
  values (p_workspace_id, v_lista, now(), (select auth.uid()))
  on conflict (workspace_id) do update set assinaturas = excluded.assinaturas, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por;
  return v_lista;
end $$;
revoke all on function public.definir_assinaturas_do_diploma(uuid, jsonb) from public, anon;
grant execute on function public.definir_assinaturas_do_diploma(uuid, jsonb) to authenticated;
