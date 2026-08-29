-- Hub multicanal: pacote (mestre) e destinos (variantes).
--
-- O modelo que substitui o payload único: um pacote guarda o texto-mestre e a
-- lista de destinos; cada destino guarda a variante que a API daquele canal
-- vai receber — corpo enxugado, campos extras, mídias e horário próprios.
--
-- social_publications NÃO muda: continua recebendo uma linha por chamada
-- disparada. É ela que conta a cota do plano do Upload-Post (uma chamada com
-- várias redes = 1 publicação do plano), e é o histórico legado da tela
-- antiga. O job "vivo" de cada destino mora no próprio destino.

create table if not exists public.social_packages (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  titulo_interno  text not null default '',

  -- De onde o pacote nasceu. Só informativo: apagar a origem não apaga o
  -- pacote, por isso não há chave estrangeira.
  origem_tipo     text not null default 'livre'
                  check (origem_tipo in ('livre','materia','pauta')),
  origem_id       uuid,

  -- corpo, titulo, subtitulo, linkUrl, notas para o aprovador.
  mestre          jsonb not null default '{}'::jsonb,
  mestre_file_ids uuid[] not null default '{}',

  status          text not null default 'rascunho'
                  check (status in ('rascunho','em_aprovacao','aprovado','parcial','publicado','falhou','arquivado')),

  -- Snapshot de aprovação: a peça de conteúdo criada quando o pacote é
  -- enviado para revisão (reusa o fluxo de aprovações existente).
  content_id      uuid references public.content_pieces (id) on delete set null,

  -- Horário do pacote; destino sem horário próprio herda este.
  agendar_para    timestamptz,

  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists social_packages_workspace_idx
  on public.social_packages (workspace_id, updated_at desc);
create index if not exists social_packages_content_idx
  on public.social_packages (content_id) where content_id is not null;

create table if not exists public.package_destinations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  package_id    uuid not null references public.social_packages (id) on delete cascade,

  canal         text not null,   -- id do adapter: 'site_web', 'instagram', ...
  formato       text not null,   -- id do formato dentro do adapter

  corpo         text not null default '',
  -- firstComment, pinTitle, ctaTipo, e os campos da página do site
  -- (titulo, subtitulo, slug). O adapter dita as chaves.
  extras        jsonb not null default '{}'::jsonb,
  file_ids      uuid[] not null default '{}',
  -- {fileId: {x,y,w,h,ratio}} — caixa de recorte por mídia. O derivado é
  -- gerado na hora do disparo; aqui só a intenção.
  crops         jsonb not null default '{}'::jsonb,

  -- Editada à mão: regenerar o mestre não pode sobrescrever trabalho humano.
  descolada     boolean not null default false,

  estado        text not null default 'gerada'
                check (estado in ('gerada','em_ajuste','pronta','bloqueada','ignorada','na_fila','publicando','publicada','falhou')),

  agendar_para  timestamptz,   -- nulo herda o horário do pacote

  -- Job vivo deste destino. O rastro completo por chamada fica em
  -- social_publications, ligada por request_id.
  request_id    text,
  external_url  text,
  erro          text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists package_destinations_package_idx
  on public.package_destinations (package_id, created_at);
create index if not exists package_destinations_workspace_idx
  on public.package_destinations (workspace_id);

-- Um destino por par canal+formato dentro do pacote: dois cards "Instagram
-- Feed" no mesmo pacote seria ambiguidade, não recurso.
create unique index if not exists package_destinations_unico_idx
  on public.package_destinations (package_id, canal, formato);

alter table public.social_packages enable row level security;
alter table public.package_destinations enable row level security;

drop policy if exists social_packages_select_member on public.social_packages;
create policy social_packages_select_member on public.social_packages
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

-- Criar pacote assina a autoria, como nas publicações: o disparo em nome da
-- instituição precisa ter dono identificável.
drop policy if exists social_packages_insert_member on public.social_packages;
create policy social_packages_insert_member on public.social_packages
  for insert to authenticated
  with check (
    (select private.is_workspace_member(workspace_id))
    and created_by = (select auth.uid())
  );

drop policy if exists social_packages_update_member on public.social_packages;
create policy social_packages_update_member on public.social_packages
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));

drop policy if exists social_packages_delete_member on public.social_packages;
create policy social_packages_delete_member on public.social_packages
  for delete to authenticated
  using ((select private.is_workspace_member(workspace_id)));

drop policy if exists package_destinations_select_member on public.package_destinations;
create policy package_destinations_select_member on public.package_destinations
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

drop policy if exists package_destinations_insert_member on public.package_destinations;
create policy package_destinations_insert_member on public.package_destinations
  for insert to authenticated
  with check ((select private.is_workspace_member(workspace_id)));

drop policy if exists package_destinations_update_member on public.package_destinations;
create policy package_destinations_update_member on public.package_destinations
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));

drop policy if exists package_destinations_delete_member on public.package_destinations;
create policy package_destinations_delete_member on public.package_destinations
  for delete to authenticated
  using ((select private.is_workspace_member(workspace_id)));

-- updated_at automático, mesma função touch das publicações.
drop trigger if exists social_packages_touch on public.social_packages;
create trigger social_packages_touch
  before update on public.social_packages
  for each row execute function public.touch_social_publications();

drop trigger if exists package_destinations_touch on public.package_destinations;
create trigger package_destinations_touch
  before update on public.package_destinations
  for each row execute function public.touch_social_publications();
