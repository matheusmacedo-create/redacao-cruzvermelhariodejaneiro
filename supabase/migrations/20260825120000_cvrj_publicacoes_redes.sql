-- Registro das publicações enviadas às redes sociais pelo Upload-Post.
--
-- Por que guardar em vez de só disparar: o envio é assíncrono. A API responde
-- na hora com um request_id e só depois diz o que aconteceu em cada rede. Sem
-- uma linha nossa, esse identificador se perde e ninguém consegue responder
-- "a matéria saiu no Instagram?" sem abrir o painel de terceiros.

create table if not exists public.social_publications (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  content_id     uuid references public.content_pieces (id) on delete set null,

  networks       text[] not null,
  body           text not null,
  link_url       text,
  image_url      text,

  -- Nulo publica agora; preenchido, o Upload-Post agenda e devolve job_id.
  scheduled_for  timestamptz,

  request_id     text,
  job_id         text,
  -- Nosso identificador, ecoado de volta pela API. Deixa reencontrar a
  -- publicação sem depender do texto, que é editável do lado de lá.
  external_id    text,

  status         text not null default 'pending'
                 check (status in ('pending','queued','processing','in_progress','completed','failed')),
  -- Resultado por rede, como a API devolve: sucesso, mensagem e link do post.
  results        jsonb not null default '[]'::jsonb,
  error          text,

  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists social_publications_workspace_idx
  on public.social_publications (workspace_id, created_at desc);
create index if not exists social_publications_content_idx
  on public.social_publications (content_id, created_at desc);

-- Consultar status é buscar por request_id ou job_id; ambos são únicos por
-- envio e o índice parcial evita indexar as linhas onde eles são nulos.
create index if not exists social_publications_request_idx
  on public.social_publications (request_id) where request_id is not null;
create index if not exists social_publications_job_idx
  on public.social_publications (job_id) where job_id is not null;

alter table public.social_publications enable row level security;

-- Quem é do espaço vê o histórico: saber o que já foi publicado é justamente o
-- que evita a mesma matéria sair duas vezes na página da instituição.
drop policy if exists social_publications_select_member on public.social_publications;
create policy social_publications_select_member on public.social_publications
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

-- Inserir exige ser do espaço e assinar a própria autoria: publicar em nome da
-- Cruz Vermelha é ato institucional e precisa ter dono identificável.
drop policy if exists social_publications_insert_member on public.social_publications;
create policy social_publications_insert_member on public.social_publications
  for insert to authenticated
  with check (
    (select private.is_workspace_member(workspace_id))
    and created_by = (select auth.uid())
  );

-- Atualizar serve só para gravar o retorno da API no registro já criado.
drop policy if exists social_publications_update_member on public.social_publications;
create policy social_publications_update_member on public.social_publications
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));

create or replace function public.touch_social_publications()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists social_publications_touch on public.social_publications;
create trigger social_publications_touch
  before update on public.social_publications
  for each row execute function public.touch_social_publications();
