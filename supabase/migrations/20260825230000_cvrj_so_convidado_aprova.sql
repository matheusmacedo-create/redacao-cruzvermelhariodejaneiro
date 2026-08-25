-- Só quem foi convidado aprova.
--
-- vote_on_approval inseria a linha do votante na hora do voto, sem conferir se
-- aquela pessoa tinha sido convidada. Qualquer membro do espaço podia decidir
-- qualquer aprovação; o que segurava era a tela desabilitar o botão, e tela não
-- é autoridade — a chamada RPC está a um fetch de distância.
--
-- Pior em combinação com a aprovação sem votante nenhum: o cálculo do status
-- lê "0 pendentes" como "todo mundo aprovou". Um único voto não solicitado
-- fechava a rodada como aprovada, e o conteúdo saía em nome da instituição.
--
-- Agora o voto exige uma linha pré-existente em approval_voters, criada por
-- quem pediu a aprovação. Sem convite, a função recusa.

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
  v_total        integer;
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

  -- O convite é a autorização. Quem não tem linha aqui não vota.
  update public.approval_voters
     set decision   = p_decision,
         comment    = p_comment,
         decided_at = now()
   where approval_id = p_approval_id
     and user_id     = (select auth.uid());

  if not found then
    raise exception 'Você não está entre as pessoas convidadas para aprovar este conteúdo.'
      using errcode = '42501';
  end if;

  select count(*),
         count(*) filter (where v.decision = 'pending'),
         count(*) filter (where v.decision = 'changes_requested')
    into v_total, v_pending, v_rejected
  from public.approval_voters v
  where v.approval_id = p_approval_id;

  -- Um pedido de ajuste basta para devolver o conteúdo à produção.
  if v_rejected > 0 then
    v_status := 'changes_requested';
  elsif v_total > 0 and v_pending = 0 then
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

revoke all on function public.vote_on_approval(uuid, text, text) from public, anon;
grant execute on function public.vote_on_approval(uuid, text, text) to authenticated;

-- A policy antiga deixava qualquer membro inserir qualquer linha de votante —
-- inclusive convidar a si mesmo para uma aprovação alheia. Convite é escrito
-- pelo servidor, com a chave de serviço, na hora em que quem pede escolhe as
-- pessoas. Pelo cliente, no máximo a própria linha.
drop policy if exists approval_voters_insert_member on public.approval_voters;
create policy approval_voters_insert_self on public.approval_voters for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.is_workspace_member(workspace_id))
  );
