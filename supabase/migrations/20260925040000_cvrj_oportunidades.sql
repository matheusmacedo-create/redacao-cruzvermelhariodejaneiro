-- Oportunidades da Área do Voluntário: ações, plantões, eventos e formações
-- presenciais em que o voluntário se inscreve. A coordenação publica, vê os
-- inscritos, confirma presença — e a presença vira horas no cadastro.
--
-- Vagas: com limite, quem chega depois entra na lista de espera e sobe
-- sozinho quando alguém cancela. A inscrição trava a linha da oportunidade,
-- então duas pessoas não pegam a mesma última vaga.

create table if not exists public.oportunidades (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete restrict,
  titulo          text not null check (length(trim(titulo)) between 3 and 160),
  tipo            text not null default 'acao' check (tipo in ('acao','plantao','evento','formacao','outro')),
  descricao       text check (descricao is null or length(descricao) <= 6000),
  local           text check (local is null or length(local) <= 300),
  inicio          timestamptz not null,
  fim             timestamptz not null,
  vagas           integer check (vagas is null or vagas between 1 and 10000),
  inscricoes_ate  timestamptz,
  horas           numeric(4,1) check (horas is null or (horas > 0 and horas <= 24)),
  publicado       boolean not null default false,
  cancelada_em    timestamptz,
  motivo_cancelamento text check (motivo_cancelamento is null or length(motivo_cancelamento) <= 600),
  criado_por      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (fim > inicio),
  check (inscricoes_ate is null or inscricoes_ate <= inicio)
);
create index if not exists oportunidades_workspace_idx on public.oportunidades (workspace_id, inicio);
create index if not exists oportunidades_criado_por_idx on public.oportunidades (criado_por);

create table if not exists public.oportunidade_inscricoes (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete restrict,
  oportunidade_id uuid not null references public.oportunidades (id) on delete cascade,
  participante_id uuid not null references public.participantes (id) on delete cascade,
  situacao        text not null default 'inscrito' check (situacao in ('inscrito','espera','cancelado','presente','ausente')),
  created_at      timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  presenca_por    uuid references public.profiles (id) on delete set null,
  horas_id        uuid references public.participante_horas (id) on delete set null,
  unique (oportunidade_id, participante_id)
);
create index if not exists oportunidade_inscricoes_participante_idx on public.oportunidade_inscricoes (participante_id);
create index if not exists oportunidade_inscricoes_workspace_idx on public.oportunidade_inscricoes (workspace_id);
create index if not exists oportunidade_inscricoes_presenca_idx on public.oportunidade_inscricoes (presenca_por);
create index if not exists oportunidade_inscricoes_horas_idx on public.oportunidade_inscricoes (horas_id);

alter table public.oportunidades enable row level security;
alter table public.oportunidade_inscricoes enable row level security;
revoke all on public.oportunidades, public.oportunidade_inscricoes from anon, authenticated;
grant select, insert, update, delete on public.oportunidades to authenticated;
grant select on public.oportunidade_inscricoes to authenticated;

create policy oportunidades_select on public.oportunidades for select to authenticated using ((select private.nivel_participantes(workspace_id)) >= 1);
create policy oportunidades_insert on public.oportunidades for insert to authenticated with check ((select private.nivel_participantes(workspace_id)) >= 2);
create policy oportunidades_update on public.oportunidades for update to authenticated
  using ((select private.nivel_participantes(workspace_id)) >= 2) with check ((select private.nivel_participantes(workspace_id)) >= 2);
create policy oportunidades_delete on public.oportunidades for delete to authenticated using ((select private.nivel_participantes(workspace_id)) >= 2);
create policy oportunidade_inscricoes_select on public.oportunidade_inscricoes for select to authenticated using ((select private.nivel_participantes(workspace_id)) >= 1);

-- ---------------------------------------------------------------- vagas

/** Sobe da lista de espera, por ordem de chegada, enquanto houver vaga. */
create or replace function private.promover_espera(p_oportunidade_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  o public.oportunidades;
  v_ocupadas integer;
  v_proximo uuid;
begin
  select * into o from public.oportunidades where id = p_oportunidade_id;
  if o.vagas is null then
    update public.oportunidade_inscricoes set situacao = 'inscrito', atualizado_em = now() where oportunidade_id = o.id and situacao = 'espera';
    return;
  end if;
  loop
    select count(*) into v_ocupadas from public.oportunidade_inscricoes where oportunidade_id = o.id and situacao in ('inscrito','presente','ausente');
    exit when v_ocupadas >= o.vagas;
    select id into v_proximo from public.oportunidade_inscricoes where oportunidade_id = o.id and situacao = 'espera' order by created_at, id limit 1;
    exit when v_proximo is null;
    update public.oportunidade_inscricoes set situacao = 'inscrito', atualizado_em = now() where id = v_proximo;
  end loop;
end $$;
revoke all on function private.promover_espera(uuid) from public, anon, authenticated;

-- A equipe aumentou as vagas (ou tirou o limite): a lista de espera anda.
create or replace function private.oportunidade_vagas_mudaram()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.vagas is distinct from old.vagas then perform private.promover_espera(new.id); end if;
  return new;
end $$;
create trigger oportunidades_vagas after update of vagas on public.oportunidades for each row execute function private.oportunidade_vagas_mudaram();
revoke all on function private.oportunidade_vagas_mudaram() from public, anon, authenticated;

-- ---------------------------------------------------------------- lado do voluntário

create or replace function public.membro_inscrever(p_participante_id uuid, p_oportunidade_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_part public.participantes;
  o public.oportunidades;
  v_ocupadas integer;
  v_atual public.oportunidade_inscricoes;
  v_situacao text;
begin
  select * into v_part from public.participantes where id = p_participante_id and situacao = 'ativo' and anonimizado_em is null;
  if not found then raise exception 'Cadastro indisponível.' using errcode = 'P0001'; end if;
  select * into o from public.oportunidades where id = p_oportunidade_id and workspace_id = v_part.workspace_id and publicado for update;
  if not found then raise exception 'Oportunidade não encontrada.' using errcode = 'P0001'; end if;
  if o.cancelada_em is not null then raise exception 'Esta oportunidade foi cancelada.' using errcode = 'P0001'; end if;
  if now() >= coalesce(o.inscricoes_ate, o.inicio) then raise exception 'As inscrições já encerraram.' using errcode = 'P0001'; end if;
  select * into v_atual from public.oportunidade_inscricoes where oportunidade_id = o.id and participante_id = v_part.id;
  if found and v_atual.situacao in ('inscrito','espera') then return jsonb_build_object('situacao', v_atual.situacao); end if;
  select count(*) into v_ocupadas from public.oportunidade_inscricoes where oportunidade_id = o.id and situacao in ('inscrito','presente','ausente');
  v_situacao := case when o.vagas is null or v_ocupadas < o.vagas then 'inscrito' else 'espera' end;
  insert into public.oportunidade_inscricoes (workspace_id, oportunidade_id, participante_id, situacao)
  values (o.workspace_id, o.id, v_part.id, v_situacao)
  on conflict (oportunidade_id, participante_id) do update set situacao = excluded.situacao, created_at = now(), atualizado_em = now();
  return jsonb_build_object('situacao', v_situacao);
end $$;

create or replace function public.membro_cancelar_inscricao(p_participante_id uuid, p_oportunidade_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  o public.oportunidades;
  v_atual public.oportunidade_inscricoes;
begin
  select * into o from public.oportunidades where id = p_oportunidade_id for update;
  if not found then raise exception 'Oportunidade não encontrada.' using errcode = 'P0001'; end if;
  select * into v_atual from public.oportunidade_inscricoes where oportunidade_id = o.id and participante_id = p_participante_id;
  if not found or v_atual.situacao not in ('inscrito','espera') then raise exception 'Você não está inscrito.' using errcode = 'P0001'; end if;
  if now() >= o.inicio then raise exception 'A atividade já começou; fale com a coordenação.' using errcode = 'P0001'; end if;
  update public.oportunidade_inscricoes set situacao = 'cancelado', atualizado_em = now() where id = v_atual.id;
  perform private.promover_espera(o.id);
end $$;

-- ---------------------------------------------------------------- lado da equipe

/**
 * Presença: marca presente (e lança as horas no cadastro) ou ausente (e tira
 * as horas lançadas antes, se houver). Horas: as da oportunidade ou as
 * informadas.
 */
create or replace function public.registrar_presenca(p_inscricao_id uuid, p_presente boolean, p_horas numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare
  i public.oportunidade_inscricoes;
  o public.oportunidades;
  v_horas numeric;
  v_horas_id uuid;
begin
  select * into i from public.oportunidade_inscricoes where id = p_inscricao_id for update;
  if not found or (select private.nivel_participantes(i.workspace_id)) < 2 then raise exception 'Inscrição não encontrada.' using errcode = 'P0001'; end if;
  select * into o from public.oportunidades where id = i.oportunidade_id;
  if i.situacao not in ('inscrito','presente','ausente') then raise exception 'Só quem está inscrito tem presença.' using errcode = 'P0001'; end if;
  if now() < o.inicio then raise exception 'A presença é registrada a partir do início da atividade.' using errcode = 'P0001'; end if;
  if i.horas_id is not null then delete from public.participante_horas where id = i.horas_id; end if;
  if p_presente then
    v_horas := coalesce(p_horas, o.horas, round(extract(epoch from (o.fim - o.inicio)) / 3600.0 * 4) / 4);
    if v_horas <= 0 or v_horas > 24 then raise exception 'Informe de 0,25 a 24 horas.' using errcode = 'P0001'; end if;
    insert into public.participante_horas (workspace_id, participante_id, data, horas, atividade, registrado_por)
    values (i.workspace_id, i.participante_id, (o.inicio at time zone 'America/Sao_Paulo')::date, v_horas, left(o.titulo, 200), (select auth.uid()))
    returning id into v_horas_id;
  end if;
  update public.oportunidade_inscricoes set situacao = case when p_presente then 'presente' else 'ausente' end,
    horas_id = v_horas_id, presenca_por = (select auth.uid()), atualizado_em = now()
  where id = i.id;
end $$;

revoke all on function public.membro_inscrever(uuid, uuid) from public, anon, authenticated;
revoke all on function public.membro_cancelar_inscricao(uuid, uuid) from public, anon, authenticated;
revoke all on function public.registrar_presenca(uuid, boolean, numeric) from public, anon;
grant execute on function public.membro_inscrever(uuid, uuid) to service_role;
grant execute on function public.membro_cancelar_inscricao(uuid, uuid) to service_role;
grant execute on function public.registrar_presenca(uuid, boolean, numeric) to authenticated;
