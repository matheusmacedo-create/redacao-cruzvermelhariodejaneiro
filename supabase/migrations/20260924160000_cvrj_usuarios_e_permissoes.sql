-- ============================================================
-- Usuários e permissões: conta desativada perde o acesso de verdade,
-- colunas sensíveis fora do alcance da própria pessoa, o espaço nunca fica
-- sem administrador e toda mudança de acesso deixa rastro.
--
-- Só acrescenta (ARQUITETURA §10.1): nada do que o build no ar usa sai daqui.
-- ============================================================

-- ---------- profiles: troca obrigatória e data da desativação ----------
alter table public.profiles
  add column if not exists trocar_senha  boolean not null default false,
  add column if not exists desativado_em timestamptz;

comment on column public.profiles.trocar_senha is
  'Senha definida pelo administrador (criação ou redefinição): a pessoa troca no próximo acesso antes de usar o sistema.';

-- A pessoa edita o próprio perfil, mas só o que é dela de fato. Antes, a
-- policy profiles_update_self deixava qualquer um reativar a própria conta
-- (active = true), trocar o username ou se livrar da troca obrigatória de
-- senha direto pela Data API. Privilégio por coluna fecha isso no banco; o
-- service role (as actions de administração) continua com acesso total.
revoke insert, update, delete on public.profiles from authenticated, anon;
grant update (full_name, job_title, initials, color, avatar_path, updated_at) on public.profiles to authenticated;

-- workspace_members: um admin muda papel e coordenação, nunca "move" um
-- vínculo de pessoa ou de espaço.
revoke update on public.workspace_members from authenticated, anon;
grant update (role, coordination) on public.workspace_members to authenticated;

-- ============================================================
-- Conta desativada = sem acesso, mesmo com token ainda válido.
--
-- O access token do Supabase vale até 1 hora depois de emitido; desativar
-- só no Auth deixaria essa janela aberta. Os helpers de RLS passam a exigir
-- perfil ativo de quem pergunta, e como TODAS as policies passam por eles, a
-- conta desativada deixa de ver e de escrever qualquer coisa na hora.
-- Mesma assinatura: as policies existentes não precisam ser recriadas.
-- ============================================================
create or replace function private.is_workspace_member(p_workspace_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1
    from public.workspace_members m
    join public.profiles p on p.id = m.user_id
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and p.active
  );
$$;

create or replace function private.workspace_role(p_workspace_id uuid)
returns text language sql security definer set search_path = '' stable as $$
  select m.role
  from public.workspace_members m
  join public.profiles p on p.id = m.user_id
  where m.workspace_id = p_workspace_id
    and m.user_id = (select auth.uid())
    and p.active
  limit 1;
$$;

-- Quem pergunta precisa estar ativo; quem é perguntado, não: o nome de quem
-- saiu continua aparecendo no histórico das pautas e aprovações.
create or replace function private.shares_workspace(p_user_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1
    from public.workspace_members me
    join public.profiles eu on eu.id = me.user_id and eu.active
    join public.workspace_members other on other.workspace_id = me.workspace_id
    where me.user_id = (select auth.uid())
      and other.user_id = p_user_id
  );
$$;

-- ============================================================
-- O espaço nunca fica sem administrador ativo.
--
-- Rebaixar, remover ou desativar o último admin trancaria todo mundo fora
-- da tela de Usuários, sem volta pela interface. A action já confere; o
-- gatilho é a cerca de verdade, e também pega a Data API direta.
-- ============================================================
create or replace function private.garantir_admin_no_espaco()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role <> 'admin' then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and new.role = 'admin' and new.workspace_id = old.workspace_id then return new; end if;

  -- Cascata de um espaço ou de uma conta apagados: não há o que proteger.
  if not exists (select 1 from public.workspaces w where w.id = old.workspace_id)
     or not exists (select 1 from public.profiles p where p.id = old.user_id) then
    return coalesce(new, old);
  end if;

  -- Serializa por espaço: dois admins rebaixando um ao outro ao mesmo tempo
  -- passariam os dois pela conferência abaixo sem esta trava.
  perform 1 from public.workspaces w where w.id = old.workspace_id for update;

  if not exists (
    select 1 from public.workspace_members m
    join public.profiles p on p.id = m.user_id
    where m.workspace_id = old.workspace_id and m.role = 'admin' and p.active and m.id <> old.id
  ) then
    raise exception 'O espaço precisa de pelo menos um administrador ativo.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists workspace_members_garante_admin on public.workspace_members;
create trigger workspace_members_garante_admin
  before update or delete on public.workspace_members
  for each row execute function private.garantir_admin_no_espaco();

create or replace function private.garantir_admin_ao_desativar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  espaco uuid;
begin
  if not (old.active and not new.active) then return new; end if;
  for espaco in
    select m.workspace_id from public.workspace_members m where m.user_id = new.id and m.role = 'admin'
  loop
    perform 1 from public.workspaces w where w.id = espaco for update;
    if not exists (
      select 1 from public.workspace_members m
      join public.profiles p on p.id = m.user_id
      where m.workspace_id = espaco and m.role = 'admin' and p.active and m.user_id <> new.id
    ) then
      raise exception 'O espaço precisa de pelo menos um administrador ativo.' using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists profiles_garante_admin on public.profiles;
create trigger profiles_garante_admin
  before update of active on public.profiles
  for each row execute function private.garantir_admin_ao_desativar();

-- ============================================================
-- Auditoria de acesso
--
-- Separada do activity_log de propósito: lá qualquer membro insere (é o
-- diário do trabalho). Aqui ninguém insere pela Data API — só o service
-- role, das actions de administração, e o gatilho abaixo. Um registro de
-- permissões que o próprio usuário consegue forjar não prova nada.
-- ============================================================
create table if not exists public.auditoria_de_acesso (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  ator_id      uuid references public.profiles (id) on delete set null,
  alvo_id      uuid references public.profiles (id) on delete set null,
  acao         text not null check (length(acao) between 3 and 60),
  detalhes     jsonb not null default '{}'::jsonb,
  criado_em    timestamptz not null default now()
);
create index if not exists auditoria_de_acesso_espaco_idx on public.auditoria_de_acesso (workspace_id, criado_em desc);
create index if not exists auditoria_de_acesso_ator_idx   on public.auditoria_de_acesso (ator_id);
create index if not exists auditoria_de_acesso_alvo_idx   on public.auditoria_de_acesso (alvo_id);

alter table public.auditoria_de_acesso enable row level security;

drop policy if exists auditoria_de_acesso_select_admin on public.auditoria_de_acesso;
create policy auditoria_de_acesso_select_admin on public.auditoria_de_acesso
  for select to authenticated
  using ((select private.workspace_role(workspace_id)) = 'admin');

revoke insert, update, delete on public.auditoria_de_acesso from authenticated, anon;
grant select on public.auditoria_de_acesso to authenticated;

-- Toda mudança de vínculo fica registrada, venha de onde vier. auth.uid() é
-- quem fez (nulo quando foi o service role — a action então registra o autor).
create or replace function private.auditar_vinculo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ator uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.auditoria_de_acesso (workspace_id, ator_id, alvo_id, acao, detalhes)
    values (new.workspace_id, ator, new.user_id, 'vinculo_criado', jsonb_build_object('papel', new.role, 'coordenacao', new.coordination));
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      insert into public.auditoria_de_acesso (workspace_id, ator_id, alvo_id, acao, detalhes)
      values (new.workspace_id, ator, new.user_id, 'papel_alterado', jsonb_build_object('de', old.role, 'para', new.role));
    end if;
    if new.coordination is distinct from old.coordination then
      insert into public.auditoria_de_acesso (workspace_id, ator_id, alvo_id, acao, detalhes)
      values (new.workspace_id, ator, new.user_id, 'coordenacao_alterada', jsonb_build_object('de', old.coordination, 'para', new.coordination));
    end if;
  elsif tg_op = 'DELETE' then
    if exists (select 1 from public.workspaces w where w.id = old.workspace_id) then
      insert into public.auditoria_de_acesso (workspace_id, ator_id, alvo_id, acao, detalhes)
      values (old.workspace_id, ator,
              case when exists (select 1 from public.profiles p where p.id = old.user_id) then old.user_id end,
              'vinculo_removido', jsonb_build_object('papel', old.role));
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists workspace_members_auditoria on public.workspace_members;
create trigger workspace_members_auditoria
  after insert or update or delete on public.workspace_members
  for each row execute function private.auditar_vinculo();

-- Os helpers novos são internos: nenhum papel da Data API os chama direto.
revoke all on function private.garantir_admin_no_espaco()  from public, anon, authenticated;
revoke all on function private.garantir_admin_ao_desativar() from public, anon, authenticated;
revoke all on function private.auditar_vinculo()           from public, anon, authenticated;

-- ============================================================
-- Encerrar as sessões de alguém (desativação, redefinição de senha).
--
-- Trocar a senha no Auth não derruba quem já está logado com a antiga: o
-- refresh token continua renovando. Apagar as sessões invalida os refresh
-- tokens na hora (cascata em auth.refresh_tokens). Só o service role chama.
-- ============================================================
create or replace function public.encerrar_sessoes_do_usuario(p_user_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.encerrar_sessoes_do_usuario(uuid) from public, anon, authenticated;
grant execute on function public.encerrar_sessoes_do_usuario(uuid) to service_role;
