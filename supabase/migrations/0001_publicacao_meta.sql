-- ============================================================================
-- Publicação em redes sociais (Meta: Facebook + Instagram)
-- Redação Cruz Vermelha Brasileira · Rio de Janeiro
--
-- COMO APLICAR
--   1. Abra o Supabase → SQL Editor → New query
--   2. Cole este arquivo inteiro e execute
--   3. Depois execute o bloco final (pg_cron), substituindo os dois
--      valores marcados com <<<SUBSTITUA>>>
--
-- Este script é idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers de permissão (reaproveitam workspace_members, que já existe)
-- ---------------------------------------------------------------------------

create or replace function public.social_is_member(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid()
  );
$fn$;

create or replace function public.social_is_admin(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid() and role = 'admin'
  );
$fn$;

-- ---------------------------------------------------------------------------
-- 1. Canais conectados (uma Página do Facebook ou uma conta Instagram Business)
-- ---------------------------------------------------------------------------

create table if not exists public.social_channels (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  platform            text not null check (platform in ('facebook','instagram')),
  external_id         text not null,          -- Page ID ou IG User ID
  account_name        text not null,
  username            text,                   -- @handle do Instagram
  avatar_url          text,
  facebook_page_id    text,                   -- no Instagram, a Página vinculada
  -- Token NUNCA em texto puro. Cifrado com AES-256-GCM pela aplicação.
  access_token_cipher text not null,
  token_expires_at    timestamptz,            -- null = system user token (não expira)
  status              text not null default 'active'
                        check (status in ('active','expired','revoked','error')),
  last_checked_at     timestamptz,
  last_error          text,
  connected_by        uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (workspace_id, platform, external_id)
);

create index if not exists social_channels_workspace_idx
  on public.social_channels (workspace_id, status);

-- ---------------------------------------------------------------------------
-- 2. Publicações
--    Amarrada a content_pieces para herdar a esteira de aprovação existente.
-- ---------------------------------------------------------------------------

create table if not exists public.social_posts (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  content_id      uuid references public.content_pieces(id) on delete cascade,
  pauta_id        uuid references public.pautas(id) on delete set null,
  post_type       text not null default 'feed'
                    check (post_type in ('feed','carousel','reels','story')),
  caption         text not null default '',
  first_comment   text,
  -- Sempre em UTC. O fuso é guardado só para exibir de volta ao usuário.
  scheduled_for   timestamptz,
  timezone        text not null default 'America/Sao_Paulo',
  status          text not null default 'rascunho'
                    check (status in ('rascunho','aguardando_aprovacao','aprovado',
                                      'agendado','publicando','publicado',
                                      'parcial','falhou','cancelado')),
  attempts        int  not null default 0,
  next_attempt_at timestamptz,
  last_error      text,
  created_by      uuid references public.profiles(id) on delete set null,
  approved_by     uuid references public.profiles(id) on delete set null,
  approved_at     timestamptz,
  published_by    uuid references public.profiles(id) on delete set null,
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Um post agendado obrigatoriamente tem data.
  constraint social_posts_agendado_tem_data
    check (status <> 'agendado' or scheduled_for is not null)
);

-- Índice que o worker usa a cada minuto. Parcial: só varre o que interessa.
create index if not exists social_posts_fila_idx
  on public.social_posts (scheduled_for)
  where status in ('agendado','falhou');

create index if not exists social_posts_workspace_idx
  on public.social_posts (workspace_id, status, scheduled_for);

create index if not exists social_posts_content_idx
  on public.social_posts (content_id);

-- ---------------------------------------------------------------------------
-- 3. Destinos — um mesmo post pode ir para o Instagram e o Facebook
-- ---------------------------------------------------------------------------

create table if not exists public.social_post_targets (
  id               uuid primary key default gen_random_uuid(),
  post_id          uuid not null references public.social_posts(id) on delete cascade,
  channel_id       uuid not null references public.social_channels(id) on delete restrict,
  status           text not null default 'pendente'
                     check (status in ('pendente','publicando','publicado','falhou','cancelado')),
  container_id     text,        -- container do Instagram (validade de 24h)
  external_post_id text,        -- ID do post já publicado na Meta
  permalink        text,        -- link público do post
  error            text,
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (post_id, channel_id)
);

create index if not exists social_post_targets_post_idx
  on public.social_post_targets (post_id);

-- ---------------------------------------------------------------------------
-- 4. Mídias do post (referenciam a Biblioteca que já existe)
-- ---------------------------------------------------------------------------

create table if not exists public.social_post_media (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.social_posts(id) on delete cascade,
  file_id    uuid not null references public.files(id) on delete restrict,
  position   int  not null default 0,
  role       text not null default 'media' check (role in ('media','cover')),
  alt_text   text,
  created_at timestamptz not null default now(),
  unique (post_id, position, role)
);

create index if not exists social_post_media_post_idx
  on public.social_post_media (post_id, position);

-- ---------------------------------------------------------------------------
-- 5. Histórico / auditoria (fase 1 — trilha completa)
--    Toda transição, disparo e resposta da Meta fica registrada aqui.
-- ---------------------------------------------------------------------------

create table if not exists public.social_post_events (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  post_id      uuid references public.social_posts(id) on delete cascade,
  channel_id   uuid references public.social_channels(id) on delete set null,
  actor_id     uuid references public.profiles(id) on delete set null,
  event        text not null,   -- criado, agendado, publicando, publicado, falhou...
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists social_post_events_post_idx
  on public.social_post_events (post_id, created_at desc);

create index if not exists social_post_events_workspace_idx
  on public.social_post_events (workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. Contador de publicações (limite da Meta: 50 posts / 24h por conta IG)
-- ---------------------------------------------------------------------------

create or replace function public.social_publicacoes_24h(p_channel_id uuid)
returns int language sql stable security definer set search_path = public as $fn$
  select count(*)::int
  from social_post_targets
  where channel_id = p_channel_id
    and status = 'publicado'
    and published_at > now() - interval '24 hours';
$fn$;

-- ---------------------------------------------------------------------------
-- 7. updated_at automático
-- ---------------------------------------------------------------------------

create or replace function public.social_touch_updated_at()
returns trigger language plpgsql as $fn$
begin new.updated_at = now(); return new; end;
$fn$;

do $do$
declare t text;
begin
  foreach t in array array['social_channels','social_posts','social_post_targets'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format(
      'create trigger %I_touch before update on public.%I
       for each row execute function public.social_touch_updated_at()', t, t);
  end loop;
end $do$;

-- ---------------------------------------------------------------------------
-- 8. RLS
--    Leitura: qualquer membro do espaço.
--    Escrita: apenas admin (hoje, só o Matheus publica).
--    O worker usa a service role key, que ignora RLS por definição.
-- ---------------------------------------------------------------------------

alter table public.social_channels     enable row level security;
alter table public.social_posts        enable row level security;
alter table public.social_post_targets enable row level security;
alter table public.social_post_media   enable row level security;
alter table public.social_post_events  enable row level security;

-- social_channels
drop policy if exists social_channels_read  on public.social_channels;
drop policy if exists social_channels_write on public.social_channels;
create policy social_channels_read on public.social_channels
  for select using (public.social_is_member(workspace_id));
create policy social_channels_write on public.social_channels
  for all using (public.social_is_admin(workspace_id))
          with check (public.social_is_admin(workspace_id));

-- social_posts
drop policy if exists social_posts_read  on public.social_posts;
drop policy if exists social_posts_write on public.social_posts;
create policy social_posts_read on public.social_posts
  for select using (public.social_is_member(workspace_id));
create policy social_posts_write on public.social_posts
  for all using (public.social_is_admin(workspace_id))
          with check (public.social_is_admin(workspace_id));

-- tabelas filhas: herdam a permissão do post pai
drop policy if exists social_post_targets_read  on public.social_post_targets;
drop policy if exists social_post_targets_write on public.social_post_targets;
create policy social_post_targets_read on public.social_post_targets
  for select using (exists (
    select 1 from public.social_posts p
    where p.id = post_id and public.social_is_member(p.workspace_id)));
create policy social_post_targets_write on public.social_post_targets
  for all using (exists (
    select 1 from public.social_posts p
    where p.id = post_id and public.social_is_admin(p.workspace_id)))
  with check (exists (
    select 1 from public.social_posts p
    where p.id = post_id and public.social_is_admin(p.workspace_id)));

drop policy if exists social_post_media_read  on public.social_post_media;
drop policy if exists social_post_media_write on public.social_post_media;
create policy social_post_media_read on public.social_post_media
  for select using (exists (
    select 1 from public.social_posts p
    where p.id = post_id and public.social_is_member(p.workspace_id)));
create policy social_post_media_write on public.social_post_media
  for all using (exists (
    select 1 from public.social_posts p
    where p.id = post_id and public.social_is_admin(p.workspace_id)))
  with check (exists (
    select 1 from public.social_posts p
    where p.id = post_id and public.social_is_admin(p.workspace_id)));

-- histórico: leitura para membros, escrita só pela aplicação (service role)
drop policy if exists social_post_events_read on public.social_post_events;
create policy social_post_events_read on public.social_post_events
  for select using (public.social_is_member(workspace_id));

-- ---------------------------------------------------------------------------
-- 9. Nenhum token cifrado pode vazar para o cliente.
--    Revoga a coluna do token para os papéis do PostgREST.
-- ---------------------------------------------------------------------------

revoke all (access_token_cipher) on public.social_channels from anon, authenticated;

-- ============================================================================
-- 10. AGENDADOR (pg_cron) — execute este bloco DEPOIS de publicar a aplicação
--
--     Substitua:
--       <<<SUBSTITUA_URL>>>     pela URL do site (ex.: https://redacao.cvrj.org.br)
--       <<<SUBSTITUA_SEGREDO>>> pelo mesmo valor de SOCIAL_WORKER_SECRET
--                               configurado nas variáveis de ambiente da Vercel
-- ============================================================================

-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.unschedule('social-worker')
--   where exists (select 1 from cron.job where jobname = 'social-worker');
--
-- select cron.schedule('social-worker', '* * * * *', $cron$
--   select net.http_post(
--     url     := '<<<SUBSTITUA_URL>>>/api/social/worker',
--     headers := jsonb_build_object(
--                  'Content-Type',   'application/json',
--                  'x-worker-secret','<<<SUBSTITUA_SEGREDO>>>'),
--     body    := '{}'::jsonb,
--     timeout_milliseconds := 55000
--   );
-- $cron$);
