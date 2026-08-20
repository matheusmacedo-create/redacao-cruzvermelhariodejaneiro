-- ============================================================
-- RPCs do fluxo de aprovação.
-- SECURITY INVOKER de propósito: o RLS continua valendo dentro da função,
-- então ninguém consegue aprovar conteúdo de um espaço do qual não participa.
-- ============================================================

create or replace function public.submit_content_for_approval(p_content_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_approval_id  uuid;
begin
  select c.workspace_id into v_workspace_id
  from public.content_pieces c
  where c.id = p_content_id;

  if v_workspace_id is null then
    raise exception 'Conteúdo não encontrado ou sem permissão.' using errcode = 'P0002';
  end if;

  update public.content_pieces
     set status = 'review', updated_at = now()
   where id = p_content_id;

  -- Reaproveita uma aprovação ainda aberta em vez de abrir outra em paralelo.
  select a.id into v_approval_id
  from public.approvals a
  where a.content_id = p_content_id
    and a.status = 'pending'
  order by a.created_at desc
  limit 1;

  if v_approval_id is null then
    insert into public.approvals (workspace_id, content_id, requested_by, status)
    values (v_workspace_id, p_content_id, (select auth.uid()), 'pending')
    returning id into v_approval_id;
  end if;

  return v_approval_id;
end;
$$;

create or replace function public.submit_pauta_for_approval(p_pauta_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_title        text;
  v_description  text;
  v_content_id   uuid;
begin
  select p.workspace_id, p.title, p.description
    into v_workspace_id, v_title, v_description
  from public.pautas p
  where p.id = p_pauta_id;

  if v_workspace_id is null then
    raise exception 'Pauta não encontrada ou sem permissão.' using errcode = 'P0002';
  end if;

  -- Usa o conteúdo mais recente da pauta; se ela ainda não tem nenhum, cria um.
  select c.id into v_content_id
  from public.content_pieces c
  where c.pauta_id = p_pauta_id
    and c.status <> 'archived'
  order by c.updated_at desc
  limit 1;

  if v_content_id is null then
    insert into public.content_pieces
      (workspace_id, pauta_id, title, body, format, status, responsible_id, created_by)
    values
      (v_workspace_id, p_pauta_id, v_title, coalesce(v_description, ''), 'Conteúdo',
       'review', (select auth.uid()), (select auth.uid()))
    returning id into v_content_id;
  end if;

  update public.pautas
     set status = 'approval', updated_at = now()
   where id = p_pauta_id;

  return public.submit_content_for_approval(v_content_id);
end;
$$;

create or replace function public.vote_on_approval(
  p_approval_id uuid,
  p_decision    text,
  p_comment     text default null
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_content_id   uuid;
  v_pending      integer;
  v_rejected     integer;
  v_status       text;
begin
  if p_decision not in ('approved','changes_requested') then
    raise exception 'Decisão inválida: %', p_decision using errcode = '22023';
  end if;

  select a.workspace_id, a.content_id into v_workspace_id, v_content_id
  from public.approvals a
  where a.id = p_approval_id;

  if v_workspace_id is null then
    raise exception 'Aprovação não encontrada ou sem permissão.' using errcode = 'P0002';
  end if;

  insert into public.approval_voters
    (workspace_id, approval_id, user_id, decision, comment, decided_at)
  values
    (v_workspace_id, p_approval_id, (select auth.uid()), p_decision, p_comment, now())
  on conflict (approval_id, user_id) do update
    set decision   = excluded.decision,
        comment    = excluded.comment,
        decided_at = excluded.decided_at;

  select count(*) filter (where v.decision = 'pending'),
         count(*) filter (where v.decision = 'changes_requested')
    into v_pending, v_rejected
  from public.approval_voters v
  where v.approval_id = p_approval_id;

  -- Um pedido de ajuste basta para devolver o conteúdo à produção.
  if v_rejected > 0 then
    v_status := 'changes_requested';
  elsif v_pending = 0 then
    v_status := 'approved';
  else
    v_status := 'pending';
  end if;

  update public.approvals
     set status = v_status, updated_at = now()
   where id = p_approval_id;

  if v_status = 'approved' then
    update public.content_pieces set status = 'approved', updated_at = now() where id = v_content_id;
    update public.pautas set status = 'approved', updated_at = now()
     where id = (select c.pauta_id from public.content_pieces c where c.id = v_content_id)
       and status = 'approval';
  elsif v_status = 'changes_requested' then
    update public.content_pieces set status = 'production', updated_at = now() where id = v_content_id;
    update public.pautas set status = 'production', updated_at = now()
     where id = (select c.pauta_id from public.content_pieces c where c.id = v_content_id)
       and status = 'approval';
  end if;

  return v_status;
end;
$$;

revoke all on function public.submit_content_for_approval(uuid) from public, anon;
revoke all on function public.submit_pauta_for_approval(uuid)   from public, anon;
revoke all on function public.vote_on_approval(uuid, text, text) from public, anon;

grant execute on function public.submit_content_for_approval(uuid)  to authenticated;
grant execute on function public.submit_pauta_for_approval(uuid)    to authenticated;
grant execute on function public.vote_on_approval(uuid, text, text) to authenticated;
