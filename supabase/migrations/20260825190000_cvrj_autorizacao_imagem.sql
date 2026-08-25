-- Autorização de uso de imagem.
--
-- A coluna existia desde o começo e nunca saiu de 'pending': nada no código
-- escrevia outro valor. Uma instituição que fotografa atendimento, voluntariado
-- e beneficiários precisa saber quais imagens podem sair daqui — e precisa
-- saber antes de publicar, não depois.
--
-- 'pending'    quem enviou ainda não informou
-- 'authorized' há autorização de uso de imagem; pode ir para redes e site
-- 'internal'   uso interno apenas; nunca sai do sistema

alter table public.files alter column authorization_status set default 'pending';

update public.files set authorization_status = 'pending' where authorization_status is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'files_authorization_status_check'
  ) then
    alter table public.files
      add constraint files_authorization_status_check
      check (authorization_status in ('pending','authorized','internal'));
  end if;
end $$;

-- O publicador filtra por este valor a cada listagem.
create index if not exists files_authorization_idx
  on public.files (workspace_id, authorization_status)
  where status <> 'deleted';
