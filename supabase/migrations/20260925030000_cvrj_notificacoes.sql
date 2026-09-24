-- ============================================================
-- Notificações: categoria, e-mail e preferências por pessoa
--
-- Só acrescenta. O código anterior continua funcionando: as colunas novas
-- têm padrão, e a tabela de preferências é lida só pelo código novo.
--
--  - notifications.categoria: de que assunto é o aviso (aprovações,
--    mensagens, pautas, chamados, ofícios). É o que a pessoa escolhe
--    receber por e-mail na hora, no resumo diário ou nunca.
--  - notifications.ator_id: quem causou o aviso (para o nome e a foto).
--  - notifications.email_em: quando o aviso saiu por e-mail (na hora ou
--    no resumo). Nulo = ainda não saiu; é o que o resumo diário procura.
--  - profiles.visto_em: última vez que a pessoa estava com a Redação
--    aberta. Quem está usando o sistema agora não recebe e-mail do que já
--    está vendo no sino — como fazem as redes sociais.
--  - notificacao_preferencias: uma linha por pessoa, categoria → modo.
-- ============================================================

alter table public.notifications add column if not exists categoria text not null default 'geral';
alter table public.notifications add column if not exists ator_id uuid references public.profiles (id) on delete set null;
alter table public.notifications add column if not exists email_em timestamptz;

do $$ begin
  alter table public.notifications add constraint notifications_categoria_valida
    check (categoria in ('geral','aprovacoes','mensagens','pautas','chamados','oficios'));
exception when duplicate_object then null; end $$;

-- O sino conta as não lidas de uma pessoa; o resumo procura as não lidas
-- que ainda não saíram por e-mail.
create index if not exists notifications_nao_lidas_idx
  on public.notifications (user_id, workspace_id, created_at desc) where read_at is null;
create index if not exists notifications_ator_id_idx on public.notifications (ator_id);

alter table public.profiles add column if not exists visto_em timestamptz;

-- Quem recebe o aviso só marca como lido. Título, texto e link vêm do
-- servidor: ninguém reescreve o link do próprio aviso (ele vai para o
-- e-mail de resumo).
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

create table if not exists public.notificacao_preferencias (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  -- {"chamados": "imediato", "mensagens": "resumo", "pautas": "nunca", ...}
  -- Categoria ausente = padrão do código (imediato).
  modos         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  check (jsonb_typeof(modos) = 'object')
);

alter table public.notificacao_preferencias enable row level security;
revoke all on public.notificacao_preferencias from anon;
revoke insert, update, delete, truncate, references, trigger on public.notificacao_preferencias from authenticated;

drop policy if exists notificacao_preferencias_select_own on public.notificacao_preferencias;
create policy notificacao_preferencias_select_own on public.notificacao_preferencias for select to authenticated
  using (user_id = (select auth.uid()));
