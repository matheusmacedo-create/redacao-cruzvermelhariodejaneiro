-- ============================================================
-- Helpers (SECURITY DEFINER: quebram a recursão de RLS em workspace_members)
-- Cada um só responde sobre o próprio auth.uid(), nunca sobre terceiros.
-- ============================================================
create or replace function private.is_workspace_member(p_workspace_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.workspace_role(p_workspace_id uuid)
returns text language sql security definer set search_path = '' stable as $$
  select m.role from public.workspace_members m
  where m.workspace_id = p_workspace_id
    and m.user_id = (select auth.uid())
  limit 1;
$$;

create or replace function private.shares_workspace(p_user_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1
    from public.workspace_members me
    join public.workspace_members other on other.workspace_id = me.workspace_id
    where me.user_id = (select auth.uid())
      and other.user_id = p_user_id
  );
$$;

create or replace function private.pauta_workspace(p_pauta_id uuid)
returns uuid language sql security definer set search_path = '' stable as $$
  select p.workspace_id from public.pautas p where p.id = p_pauta_id;
$$;

create or replace function private.content_workspace(p_content_id uuid)
returns uuid language sql security definer set search_path = '' stable as $$
  select c.workspace_id from public.content_pieces c where c.id = p_content_id;
$$;

revoke all on function private.is_workspace_member(uuid) from public, anon;
revoke all on function private.workspace_role(uuid)      from public, anon;
revoke all on function private.shares_workspace(uuid)    from public, anon;
revoke all on function private.pauta_workspace(uuid)     from public, anon;
revoke all on function private.content_workspace(uuid)   from public, anon;

grant usage on schema private to authenticated;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.workspace_role(uuid)      to authenticated;
grant execute on function private.shares_workspace(uuid)    to authenticated;
grant execute on function private.pauta_workspace(uuid)     to authenticated;
grant execute on function private.content_workspace(uuid)   to authenticated;

-- ============================================================
-- RLS ligado em todas as tabelas
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'workspaces','profiles','workspace_members','projects','pautas',
    'pauta_participants','pauta_links','content_pieces','content_versions',
    'content_comments','approvals','approval_voters','calendar_events',
    'inbox_items','messages','files','notifications','activity_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ============================================================
-- Padrão: membros do espaço leem, inserem e atualizam
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'projects','pautas','pauta_links','content_pieces','content_comments',
    'approvals','calendar_events','inbox_items','messages','files','activity_log'
  ] loop
    execute format($f$
      create policy %1$I on public.%2$I for select to authenticated
      using ((select private.is_workspace_member(workspace_id)))
    $f$, t || '_select_member', t);
    execute format($f$
      create policy %1$I on public.%2$I for insert to authenticated
      with check ((select private.is_workspace_member(workspace_id)))
    $f$, t || '_insert_member', t);
    execute format($f$
      create policy %1$I on public.%2$I for update to authenticated
      using ((select private.is_workspace_member(workspace_id)))
      with check ((select private.is_workspace_member(workspace_id)))
    $f$, t || '_update_member', t);
  end loop;
end $$;

-- ============================================================
-- workspaces / workspace_members / profiles
-- ============================================================
create policy workspaces_select_member on public.workspaces for select to authenticated
  using ((select private.is_workspace_member(id)));

create policy workspace_members_select_member on public.workspace_members for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy workspace_members_insert_admin on public.workspace_members for insert to authenticated
  with check ((select private.workspace_role(workspace_id)) = 'admin');
create policy workspace_members_update_admin on public.workspace_members for update to authenticated
  using ((select private.workspace_role(workspace_id)) = 'admin')
  with check ((select private.workspace_role(workspace_id)) = 'admin');
create policy workspace_members_delete_admin on public.workspace_members for delete to authenticated
  using ((select private.workspace_role(workspace_id)) = 'admin');

create policy profiles_select_shared on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.shares_workspace(id)));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ============================================================
-- Tabelas sem workspace_id: espaço herdado do pai
-- ============================================================
create policy pauta_participants_select_member on public.pauta_participants for select to authenticated
  using ((select private.is_workspace_member((select private.pauta_workspace(pauta_id)))));
create policy pauta_participants_insert_member on public.pauta_participants for insert to authenticated
  with check ((select private.is_workspace_member((select private.pauta_workspace(pauta_id)))));
create policy pauta_participants_delete_member on public.pauta_participants for delete to authenticated
  using ((select private.is_workspace_member((select private.pauta_workspace(pauta_id)))));

create policy content_versions_select_member on public.content_versions for select to authenticated
  using ((select private.is_workspace_member((select private.content_workspace(content_id)))));
create policy content_versions_insert_member on public.content_versions for insert to authenticated
  with check ((select private.is_workspace_member((select private.content_workspace(content_id)))));

-- ============================================================
-- approval_voters: todos os membros leem (a tela de revisão mostra o placar),
-- mas cada pessoa só altera o próprio voto.
-- ============================================================
create policy approval_voters_select_member on public.approval_voters for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy approval_voters_insert_member on public.approval_voters for insert to authenticated
  with check ((select private.is_workspace_member(workspace_id)));
create policy approval_voters_update_self on public.approval_voters for update to authenticated
  using (user_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)))
  with check (user_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)));

-- ============================================================
-- notifications: só o destinatário
-- ============================================================
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ============================================================
-- DELETE: admin do espaço, ou quem criou a linha
-- (espelha a checagem que as server actions já fazem)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['projects','pautas','pauta_links','content_pieces','calendar_events','inbox_items'] loop
    execute format($f$
      create policy %1$I on public.%2$I for delete to authenticated
      using (
        (select private.is_workspace_member(workspace_id))
        and ((select private.workspace_role(workspace_id)) = 'admin' or created_by = (select auth.uid()))
      )
    $f$, t || '_delete_owner', t);
  end loop;

  foreach t in array array['messages','content_comments'] loop
    execute format($f$
      create policy %1$I on public.%2$I for delete to authenticated
      using (
        (select private.is_workspace_member(workspace_id))
        and ((select private.workspace_role(workspace_id)) = 'admin' or author_id = (select auth.uid()))
      )
    $f$, t || '_delete_author', t);
  end loop;
end $$;

create policy files_delete_owner on public.files for delete to authenticated
  using (
    (select private.is_workspace_member(workspace_id))
    and ((select private.workspace_role(workspace_id)) in ('admin','editor') or uploaded_by = (select auth.uid()))
  );

create policy approvals_delete_admin on public.approvals for delete to authenticated
  using ((select private.workspace_role(workspace_id)) = 'admin');
create policy approval_voters_delete_admin on public.approval_voters for delete to authenticated
  using ((select private.workspace_role(workspace_id)) = 'admin');
create policy activity_log_delete_admin on public.activity_log for delete to authenticated
  using ((select private.workspace_role(workspace_id)) = 'admin');

-- ============================================================
-- Data API: expõe as tabelas para o papel authenticated.
-- anon não recebe nada — o app inteiro exige login.
-- ============================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
