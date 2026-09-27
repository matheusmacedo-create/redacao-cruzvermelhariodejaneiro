-- Diploma de Reconhecimento (Manual de Identidade Institucional da CVB, p. 29).
-- Só acréscimos. Pedido do Matheus (27/09/2026, docs/IDENTIDADE.md §4.1):
--  - sai sozinho quando o voluntário chega a 100, 500 e 1.000 horas de
--    voluntariado registradas (participante_horas);
--  - a coordenação (nível do Voluntariado ≥ 2) também concede, com o texto do
--    reconhecimento;
--  - cada diploma tem um código (o mesmo formato dos certificados) que
--    qualquer pessoa confere em /diploma/<código>; a coordenação cancela com motivo.

create table if not exists public.diplomas (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete restrict,
  participante_id   uuid not null references public.participantes (id) on delete cascade,
  codigo            text not null unique check (codigo ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'),
  -- O nome no dia da emissão: o diploma não muda se o cadastro mudar depois.
  nome              text not null,
  motivo            text not null check (motivo in ('horas', 'coordenacao')),
  marco_horas       integer check (marco_horas is null or marco_horas in (100, 500, 1000)),
  horas             numeric(8,1),
  texto             text check (texto is null or length(texto) <= 600),
  emitido_em        timestamptz not null default now(),
  emitido_por       uuid references public.profiles (id) on delete set null,
  revogado_em       timestamptz,
  revogado_por      uuid references public.profiles (id) on delete set null,
  motivo_revogacao  text check (motivo_revogacao is null or length(motivo_revogacao) <= 600),
  check ((motivo = 'horas') = (marco_horas is not null)),
  check (motivo <> 'coordenacao' or length(trim(coalesce(texto, ''))) >= 10)
);
comment on table public.diplomas is 'Diploma de Reconhecimento do voluntário: por marco de horas (100, 500, 1.000) ou concedido pela coordenação (docs/IDENTIDADE.md).';
-- Um diploma válido por marco de horas.
create unique index if not exists diplomas_marco_unico on public.diplomas (participante_id, marco_horas) where marco_horas is not null and revogado_em is null;
create index if not exists diplomas_ws_idx on public.diplomas (workspace_id, emitido_em desc);
create index if not exists diplomas_participante_idx on public.diplomas (participante_id);
create index if not exists diplomas_emitido_por_idx on public.diplomas (emitido_por);
create index if not exists diplomas_revogado_por_idx on public.diplomas (revogado_por);

alter table public.diplomas enable row level security;
revoke all on public.diplomas from anon;
revoke all on public.diplomas from authenticated;
grant select on public.diplomas to authenticated;
-- A equipe do Voluntariado lê; o voluntário lê pelo servidor (service_role), sempre o dele.
drop policy if exists diplomas_select on public.diplomas;
create policy diplomas_select on public.diplomas for select to authenticated
  using ((select private.nivel_participantes(workspace_id)) >= 1);

-- Emite os diplomas de horas que faltam (idempotente). Devolve quantos emitiu.
create or replace function private.emitir_diplomas_de_horas(p_participante_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_part public.participantes;
  v_total numeric;
  v_marco integer;
  v_codigo text;
  v_emitidos integer := 0;
  v_ok boolean;
begin
  select * into v_part from public.participantes where id = p_participante_id;
  if not found or v_part.anonimizado_em is not null then return 0; end if;
  select coalesce(sum(horas), 0) into v_total from public.participante_horas where participante_id = p_participante_id;
  foreach v_marco in array array[100, 500, 1000] loop
    continue when v_total < v_marco;
    continue when exists (select 1 from public.diplomas where participante_id = p_participante_id and marco_horas = v_marco and revogado_em is null);
    v_ok := false;
    loop
      v_codigo := private.codigo_de_certificado();
      begin
        insert into public.diplomas (workspace_id, participante_id, codigo, nome, motivo, marco_horas, horas)
        values (v_part.workspace_id, v_part.id, v_codigo, coalesce(nullif(trim(v_part.nome_social), ''), v_part.nome), 'horas', v_marco, v_total);
        v_ok := true;
        exit;
      exception when unique_violation then
        -- Outro registro de horas emitiu o mesmo marco ao mesmo tempo: não duplica.
        exit when exists (select 1 from public.diplomas where participante_id = p_participante_id and marco_horas = v_marco and revogado_em is null);
      end;
    end loop;
    if v_ok then
      perform private.auditar_participante(v_part.workspace_id, v_part.id, 'diploma_emitido', jsonb_build_object('codigo', v_codigo, 'marco_horas', v_marco));
      v_emitidos := v_emitidos + 1;
    end if;
  end loop;
  return v_emitidos;
end $$;
revoke all on function private.emitir_diplomas_de_horas(uuid) from public, anon, authenticated;

-- A cada registro de horas (pela equipe ou pela presença numa oportunidade), confere os marcos.
create or replace function private.diplomas_depois_das_horas()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.emitir_diplomas_de_horas(new.participante_id);
  return null;
end $$;
revoke all on function private.diplomas_depois_das_horas() from public, anon, authenticated;
drop trigger if exists participante_horas_diplomas on public.participante_horas;
create trigger participante_horas_diplomas after insert on public.participante_horas
  for each row execute function private.diplomas_depois_das_horas();

-- A coordenação concede um diploma, com o texto do reconhecimento. Devolve o código.
create or replace function public.conceder_diploma(p_participante_id uuid, p_texto text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_part public.participantes;
  v_texto text := left(trim(coalesce(p_texto, '')), 600);
  v_codigo text;
begin
  select * into v_part from public.participantes where id = p_participante_id;
  if not found or (select private.nivel_participantes(v_part.workspace_id)) < 2 then
    raise exception 'Voluntário não encontrado.' using errcode = 'P0001';
  end if;
  if v_part.anonimizado_em is not null then raise exception 'Este cadastro foi anonimizado.' using errcode = 'P0001'; end if;
  if length(v_texto) < 10 then raise exception 'Escreva o motivo do reconhecimento (pelo menos 10 letras).' using errcode = 'P0001'; end if;
  loop
    v_codigo := private.codigo_de_certificado();
    begin
      insert into public.diplomas (workspace_id, participante_id, codigo, nome, motivo, texto, horas, emitido_por)
      values (v_part.workspace_id, v_part.id, v_codigo, coalesce(nullif(trim(v_part.nome_social), ''), v_part.nome), 'coordenacao', v_texto,
        (select coalesce(sum(horas), 0) from public.participante_horas where participante_id = v_part.id), (select auth.uid()));
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  perform private.auditar_participante(v_part.workspace_id, v_part.id, 'diploma_concedido', jsonb_build_object('codigo', v_codigo));
  return v_codigo;
end $$;

create or replace function public.revogar_diploma(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  d public.diplomas;
begin
  select * into d from public.diplomas where id = p_id for update;
  if not found or (select private.nivel_participantes(d.workspace_id)) < 2 or d.revogado_em is not null then
    raise exception 'Diploma não encontrado.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escreva o motivo.' using errcode = 'P0001'; end if;
  update public.diplomas set revogado_em = now(), revogado_por = (select auth.uid()), motivo_revogacao = left(trim(p_motivo), 600) where id = p_id;
  perform private.auditar_participante(d.workspace_id, d.participante_id, 'revogar_diploma', jsonb_build_object('codigo', d.codigo));
end $$;

revoke all on function public.conceder_diploma(uuid, text), public.revogar_diploma(uuid, text) from public, anon;
grant execute on function public.conceder_diploma(uuid, text), public.revogar_diploma(uuid, text) to authenticated;

-- Quem já passou dos marcos antes do diploma existir recebe os seus agora.
select private.emitir_diplomas_de_horas(p.id)
from public.participantes p
where p.anonimizado_em is null and exists (select 1 from public.participante_horas h where h.participante_id = p.id);
