-- Foto de perfil do voluntário.
--
-- Só acrescenta: uma coluna que aceita nulo, duas funções novas e um gatilho.
-- O código no ar não lê nem grava foto_path, então a migração pode ir antes
-- do deploy (ARQUITETURA.md §10.1 e §10.7).
--
-- A foto mora no Blob privado (voluntarios/<workspace>/<participante>/<uuid>.jpg);
-- aqui fica só o caminho. Quem grava:
-- - o próprio voluntário, pela Área do Voluntário: membro_definir_foto, só
--   para o servidor (service_role), que antes conferiu a sessão do membro —
--   o mesmo desenho de membro_atualizar_perfil;
-- - a equipe com nível "gerenciar" do Voluntariado: definir_foto_participante.
-- As duas devolvem o caminho anterior, para o servidor apagar o arquivo velho.

alter table public.participantes add column if not exists foto_path text
  check (foto_path is null or length(foto_path) <= 300);

-- A equipe lê a coluna pela API (ficha e prévia), como as demais: os grants de
-- participantes são por coluna (20260924210000), então a nova precisa do seu.
grant select (foto_path) on public.participantes to authenticated;

-- O caminho tem de ser da pasta deste participante, no formato que o servidor gera.
create or replace function private.foto_do_participante_valida(p_workspace_id uuid, p_participante_id uuid, p_caminho text)
returns boolean language sql immutable set search_path = '' as $$
  select p_caminho is null or p_caminho ~ ('^voluntarios/' || p_workspace_id::text || '/' || p_participante_id::text || '/[0-9a-f-]{36}\.jpg$')
$$;
revoke all on function private.foto_do_participante_valida(uuid, uuid, text) from public, anon, authenticated;

/** O voluntário troca (ou tira, com null) a própria foto. Devolve o caminho anterior. */
create or replace function public.membro_definir_foto(p_participante_id uuid, p_foto_path text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
begin
  select * into v from public.participantes where id = p_participante_id and situacao = 'ativo' and anonimizado_em is null for update;
  if not found then raise exception 'Cadastro indisponível.' using errcode = 'P0001'; end if;
  if not private.foto_do_participante_valida(v.workspace_id, v.id, p_foto_path) then
    raise exception 'Foto inválida.' using errcode = 'P0001';
  end if;
  update public.participantes set foto_path = p_foto_path, updated_at = now() where id = v.id;
  insert into public.participantes_auditoria (workspace_id, participante_id, acao, detalhe)
  values (v.workspace_id, v.id, 'foto_pela_area_do_membro', jsonb_build_object('removida', p_foto_path is null));
  return v.foto_path;
end $$;
revoke all on function public.membro_definir_foto(uuid, text) from public, anon, authenticated;
grant execute on function public.membro_definir_foto(uuid, text) to service_role;

/** A equipe (nível gerenciar) troca ou tira a foto na edição do cadastro. Devolve o caminho anterior. */
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
  update public.participantes set foto_path = p_foto_path, updated_at = now() where id = v.id;
  perform private.auditar_participante(v.workspace_id, v.id, 'foto', jsonb_build_object('removida', p_foto_path is null));
  return v.foto_path;
end $$;
revoke all on function public.definir_foto_participante(uuid, text) from public, anon;
grant execute on function public.definir_foto_participante(uuid, text) to authenticated;

-- Anonimizar (LGPD) tira a foto junto com os demais dados pessoais, sem
-- precisar reescrever anonimizar_participante. O arquivo no Blob é apagado
-- pelo servidor (app/actions/participantes.ts), que leu o caminho antes.
create or replace function private.participante_sem_foto_ao_anonimizar()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.foto_path := null;
  return new;
end $$;
revoke all on function private.participante_sem_foto_ao_anonimizar() from public, anon, authenticated;

drop trigger if exists participantes_sem_foto_ao_anonimizar on public.participantes;
create trigger participantes_sem_foto_ao_anonimizar
  before update of anonimizado_em on public.participantes
  for each row when (new.anonimizado_em is not null and old.anonimizado_em is null)
  execute function private.participante_sem_foto_ao_anonimizar();
