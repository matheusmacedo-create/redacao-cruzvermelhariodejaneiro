-- Foto do crachá do voluntário: só vale depois que o Voluntariado aprova.
--
-- A foto continua uma só (participantes.foto_path, 20260928100000). O que
-- muda é o crachá e a verificação pública: usam a foto só quando o caminho
-- aprovado (foto_cracha_path) é o da foto atual. Trocar a foto pela Área do
-- Voluntário deixa a nova "aguardando" sem apagar nada; recusar guarda o
-- caminho recusado e o motivo, que o voluntário vê no perfil.
--
-- A foto que a própria equipe (nível gerenciar) põe na edição do cadastro já
-- sai aprovada: quem põe é quem aprova.
--
-- As fotos que já existem entram como "aguardando": o setor aprova na fila.

alter table public.participantes
  add column if not exists foto_cracha_path text check (foto_cracha_path is null or length(foto_cracha_path) <= 300),
  add column if not exists foto_cracha_recusada_path text check (foto_cracha_recusada_path is null or length(foto_cracha_recusada_path) <= 300),
  add column if not exists foto_cracha_motivo text check (foto_cracha_motivo is null or length(foto_cracha_motivo) <= 300),
  add column if not exists foto_cracha_avaliada_em timestamptz,
  add column if not exists foto_cracha_avaliada_por uuid references public.profiles (id) on delete set null;

create index if not exists participantes_foto_cracha_avaliada_por_idx on public.participantes (foto_cracha_avaliada_por);

-- Os grants de participantes são por coluna (20260924210000): as novas precisam dos seus.
grant select (foto_cracha_path, foto_cracha_recusada_path, foto_cracha_motivo, foto_cracha_avaliada_em, foto_cracha_avaliada_por)
  on public.participantes to authenticated;

/** O Voluntariado (nível gerenciar) aprova ou recusa a foto que viu. */
create or replace function public.avaliar_foto_do_cracha(p_id uuid, p_foto_path text, p_aprovar boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select * into v from public.participantes where id = p_id for update;
  if not found or (select private.nivel_participantes(v.workspace_id)) < 2 then
    raise exception 'Participante não encontrado.' using errcode = 'P0001';
  end if;
  if v.anonimizado_em is not null then raise exception 'Cadastro anonimizado não pode ser editado.' using errcode = 'P0001'; end if;
  if v.foto_path is null or p_foto_path is distinct from v.foto_path then
    raise exception 'A foto mudou enquanto você avaliava. Abra o cadastro de novo.' using errcode = 'P0001';
  end if;
  if not coalesce(p_aprovar, false) and (v_motivo is null or length(v_motivo) < 5) then
    raise exception 'Diga ao voluntário por que a foto foi recusada.' using errcode = 'P0001';
  end if;
  if length(coalesce(v_motivo, '')) > 300 then raise exception 'Motivo longo demais (até 300 caracteres).' using errcode = 'P0001'; end if;

  if p_aprovar then
    update public.participantes set foto_cracha_path = v.foto_path, foto_cracha_recusada_path = null, foto_cracha_motivo = null,
      foto_cracha_avaliada_em = now(), foto_cracha_avaliada_por = (select auth.uid()), updated_at = now()
    where id = v.id;
  else
    update public.participantes set foto_cracha_path = null, foto_cracha_recusada_path = v.foto_path, foto_cracha_motivo = v_motivo,
      foto_cracha_avaliada_em = now(), foto_cracha_avaliada_por = (select auth.uid()), updated_at = now()
    where id = v.id;
  end if;
  perform private.auditar_participante(v.workspace_id, v.id, 'foto_do_cracha',
    jsonb_build_object('aprovada', coalesce(p_aprovar, false), 'motivo', v_motivo));
end $$;
revoke all on function public.avaliar_foto_do_cracha(uuid, text, boolean, text) from public, anon;
grant execute on function public.avaliar_foto_do_cracha(uuid, text, boolean, text) to authenticated;

/** A equipe (nível gerenciar) troca ou tira a foto na edição do cadastro: a foto já sai aprovada para o crachá. */
create or replace function public.definir_foto_participante(p_id uuid, p_foto_path text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
begin
  select * into v from public.participantes where id = p_id for update;
  if not found or (select private.nivel_participantes(v.workspace_id)) < 2 then
    raise exception 'Participante não encontrado.' using errcode = 'P0001';
  end if;
  if v.anonimizado_em is not null then raise exception 'Cadastro anonimizado não pode ser editado.' using errcode = 'P0001'; end if;
  if not private.foto_do_participante_valida(v.workspace_id, v.id, p_foto_path) then
    raise exception 'Foto inválida.' using errcode = 'P0001';
  end if;
  update public.participantes set foto_path = p_foto_path,
    foto_cracha_path = p_foto_path, foto_cracha_recusada_path = null, foto_cracha_motivo = null,
    foto_cracha_avaliada_em = case when p_foto_path is null then null else now() end,
    foto_cracha_avaliada_por = case when p_foto_path is null then null else (select auth.uid()) end,
    updated_at = now()
  where id = v.id;
  perform private.auditar_participante(v.workspace_id, v.id, 'foto', jsonb_build_object('removida', p_foto_path is null));
  return v.foto_path;
end $$;
revoke all on function public.definir_foto_participante(uuid, text) from public, anon;
grant execute on function public.definir_foto_participante(uuid, text) to authenticated;

-- Anonimizar (LGPD) também limpa o rastro da foto do crachá.
create or replace function private.participante_sem_foto_ao_anonimizar()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.foto_path := null;
  new.foto_cracha_path := null;
  new.foto_cracha_recusada_path := null;
  new.foto_cracha_motivo := null;
  return new;
end $$;
revoke all on function private.participante_sem_foto_ao_anonimizar() from public, anon, authenticated;
