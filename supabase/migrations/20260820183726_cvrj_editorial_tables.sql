-- ============================================================
-- CVRJ Redação — schema base
-- ============================================================
create schema if not exists private;

-- ---------- workspaces ----------
create table public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  kind       text not null check (kind in ('demo','production')),
  created_at timestamptz not null default now()
);

-- ---------- profiles ----------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null unique check (username ~ '^[a-z0-9._-]{3,40}$'),
  full_name   text not null,
  job_title   text,
  initials    text,
  color       text,
  avatar_path text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- workspace_members ----------
create table public.workspace_members (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         text not null check (role in ('admin','editor','colaborador')),
  coordination text,
  created_at   timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index workspace_members_workspace_id_idx on public.workspace_members (workspace_id);
create index workspace_members_user_id_idx      on public.workspace_members (user_id);

-- ---------- projects ----------
create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  description  text,
  status       text not null default 'active',
  color        text not null default 'blue',
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index projects_workspace_id_idx on public.projects (workspace_id);
create index projects_created_by_idx   on public.projects (created_by);

-- ---------- pautas ----------
create table public.pautas (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete set null,
  title        text not null,
  description  text,
  details      jsonb not null default '{}'::jsonb,
  status       text not null default 'incoming'
               check (status in ('incoming','collection','production','review','approval','approved','archived')),
  priority     text not null default 'medium'
               check (priority in ('low','medium','high','critical')),
  coordination text,
  due_date     date,
  owner_id     uuid references public.profiles (id) on delete set null,
  created_by   uuid references public.profiles (id) on delete set null,
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index pautas_workspace_id_idx on public.pautas (workspace_id);
create index pautas_project_id_idx   on public.pautas (project_id);
create index pautas_owner_id_idx     on public.pautas (owner_id);
create index pautas_created_by_idx   on public.pautas (created_by);
create index pautas_workspace_status_idx on public.pautas (workspace_id, status);

-- ---------- pauta_participants ----------
create table public.pauta_participants (
  id         uuid primary key default gen_random_uuid(),
  pauta_id   uuid not null references public.pautas (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (pauta_id, user_id)
);
create index pauta_participants_pauta_id_idx on public.pauta_participants (pauta_id);
create index pauta_participants_user_id_idx  on public.pauta_participants (user_id);

-- ---------- pauta_links ----------
create table public.pauta_links (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  pauta_id     uuid not null references public.pautas (id) on delete cascade,
  title        text not null,
  url          text not null,
  category     text,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index pauta_links_workspace_id_idx on public.pauta_links (workspace_id);
create index pauta_links_pauta_id_idx     on public.pauta_links (pauta_id);
create index pauta_links_created_by_idx   on public.pauta_links (created_by);

-- ---------- content_pieces ----------
create table public.content_pieces (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  pauta_id       uuid references public.pautas (id) on delete cascade,
  title          text not null,
  subtitle       text,
  body           text,
  format         text,
  status         text not null default 'draft'
                 check (status in ('draft','production','review','approved','archived')),
  version        integer not null default 1,
  responsible_id uuid references public.profiles (id) on delete set null,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index content_pieces_workspace_id_idx   on public.content_pieces (workspace_id);
create index content_pieces_pauta_id_idx       on public.content_pieces (pauta_id);
create index content_pieces_responsible_id_idx on public.content_pieces (responsible_id);
create index content_pieces_created_by_idx     on public.content_pieces (created_by);

-- ---------- content_versions ----------
create table public.content_versions (
  id         uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_pieces (id) on delete cascade,
  version    integer not null,
  title      text,
  body       text,
  author_id  uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index content_versions_content_id_idx on public.content_versions (content_id);
create index content_versions_author_id_idx  on public.content_versions (author_id);

-- ---------- content_comments ----------
create table public.content_comments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  content_id   uuid not null references public.content_pieces (id) on delete cascade,
  author_id    uuid references public.profiles (id) on delete set null,
  body         text not null,
  created_at   timestamptz not null default now()
);
create index content_comments_workspace_id_idx on public.content_comments (workspace_id);
create index content_comments_content_id_idx   on public.content_comments (content_id);
create index content_comments_author_id_idx    on public.content_comments (author_id);

-- ---------- approvals ----------
create table public.approvals (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  content_id   uuid not null references public.content_pieces (id) on delete cascade,
  requested_by uuid references public.profiles (id) on delete set null,
  status       text not null default 'pending'
               check (status in ('pending','approved','changes_requested')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index approvals_workspace_id_idx on public.approvals (workspace_id);
create index approvals_content_id_idx   on public.approvals (content_id);
create index approvals_requested_by_idx on public.approvals (requested_by);

-- ---------- approval_voters ----------
create table public.approval_voters (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  approval_id  uuid not null references public.approvals (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  decision     text not null default 'pending'
               check (decision in ('pending','approved','changes_requested')),
  comment      text,
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (approval_id, user_id)
);
create index approval_voters_workspace_id_idx on public.approval_voters (workspace_id);
create index approval_voters_approval_id_idx  on public.approval_voters (approval_id);
create index approval_voters_user_id_idx      on public.approval_voters (user_id);

-- ---------- calendar_events ----------
create table public.calendar_events (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  pauta_id     uuid references public.pautas (id) on delete cascade,
  title        text not null,
  event_date   date not null,
  event_time   time,
  type         text,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index calendar_events_workspace_id_idx on public.calendar_events (workspace_id);
create index calendar_events_pauta_id_idx     on public.calendar_events (pauta_id);
create index calendar_events_created_by_idx   on public.calendar_events (created_by);
create index calendar_events_workspace_date_idx on public.calendar_events (workspace_id, event_date);

-- ---------- inbox_items ----------
create table public.inbox_items (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  type         text,
  title        text not null,
  summary      text,
  sender_name  text,
  coordination text,
  priority     text not null default 'medium'
               check (priority in ('low','medium','high','critical')),
  status       text not null default 'new'
               check (status in ('new','archived','converted')),
  received_at  timestamptz not null default now(),
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index inbox_items_workspace_id_idx on public.inbox_items (workspace_id);
create index inbox_items_created_by_idx   on public.inbox_items (created_by);
create index inbox_items_workspace_status_idx on public.inbox_items (workspace_id, status);

-- ---------- messages ----------
create table public.messages (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  pauta_id     uuid not null references public.pautas (id) on delete cascade,
  author_id    uuid references public.profiles (id) on delete set null,
  body         text not null,
  created_at   timestamptz not null default now()
);
create index messages_workspace_id_idx on public.messages (workspace_id);
create index messages_pauta_id_idx     on public.messages (pauta_id);
create index messages_author_id_idx    on public.messages (author_id);

-- ---------- files ----------
create table public.files (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces (id) on delete cascade,
  name                 text not null,
  original_name        text,
  file_type            text,
  content_type         text,
  storage_path         text,
  size_bytes           bigint not null default 0,
  status               text not null default 'available',
  authorization_status text not null default 'pending',
  tags                 text[] not null default '{}',
  uploaded_by          uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now()
);
create index files_workspace_id_idx on public.files (workspace_id);
create index files_uploaded_by_idx  on public.files (uploaded_by);
create index files_storage_path_idx on public.files (workspace_id, storage_path);

-- ---------- notifications ----------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  title        text not null,
  message      text,
  link         text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_workspace_id_idx on public.notifications (workspace_id);
create index notifications_user_id_idx      on public.notifications (workspace_id, user_id);

-- ---------- activity_log ----------
create table public.activity_log (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  action       text not null,
  entity_type  text not null,
  entity_id    uuid,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index activity_log_workspace_id_idx on public.activity_log (workspace_id);
create index activity_log_actor_id_idx     on public.activity_log (actor_id);
create index activity_log_entity_idx       on public.activity_log (workspace_id, entity_type, entity_id);
