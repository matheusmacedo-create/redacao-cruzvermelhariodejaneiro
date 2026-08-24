-- Mensagens diretas entre pessoas do espaço.
--
-- Até aqui, "Enviar aviso" só criava uma notificação: o texto aparecia no sino
-- e desaparecia dali. Nada era guardado, e a tela de Mensagens só sabia listar
-- conversas nascidas de uma aprovação.
--
-- A tabela messages passa a servir aos dois casos:
--   pauta_id preenchido  -> mensagem na pauta (comportamento antigo, intacto)
--   recipient_id preenchido -> conversa direta entre duas pessoas

alter table public.messages
  alter column pauta_id drop not null;

alter table public.messages
  add column if not exists recipient_id uuid references public.profiles (id) on delete cascade;

-- Uma mensagem pertence a uma pauta OU a uma conversa direta, nunca às duas.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'messages_destino_unico') then
    alter table public.messages
      add constraint messages_destino_unico check (
        (pauta_id is not null and recipient_id is null)
        or (pauta_id is null and recipient_id is not null)
      );
  end if;
end $$;

create index if not exists messages_recipient_id_idx on public.messages (workspace_id, recipient_id);
create index if not exists messages_direct_thread_idx on public.messages (workspace_id, author_id, recipient_id)
  where pauta_id is null;

-- ============================================================
-- RLS: conversa direta é privada, mesmo para admin
-- ============================================================
-- A política antiga liberava toda mensagem do espaço para qualquer membro.
-- Isso serve para mensagens de pauta (que são de equipe), mas não pode valer
-- para conversa direta: só quem escreveu e quem recebeu enxerga.
drop policy if exists messages_select_member on public.messages;
create policy messages_select_member on public.messages for select to authenticated
  using (
    (select private.is_workspace_member(workspace_id))
    and (
      recipient_id is null
      or recipient_id = (select auth.uid())
      or author_id = (select auth.uid())
    )
  );

-- Ninguém escreve conversa direta em nome de outra pessoa.
drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member on public.messages for insert to authenticated
  with check (
    (select private.is_workspace_member(workspace_id))
    and (recipient_id is null or author_id = (select auth.uid()))
  );
