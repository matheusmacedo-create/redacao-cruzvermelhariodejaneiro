-- Banners do Início da Área do Voluntário.
--
-- Comunicação institucional para o voluntariado (campanha do mês,
-- agradecimento, chamada para doação de sangue, foto da última ação): uma
-- imagem larga com título, uma frase e um botão opcional. A coordenação cuida
-- no Redação (Voluntariado → Banners), com período de exibição e liga/desliga.
--
-- Escrita da equipe direto na tabela, sob o nível do Voluntariado
-- (gerenciar = 2), como os avisos. O voluntário lê pelo servidor
-- (service_role). A imagem fica num bucket público (não é dado pessoal).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('membro-banners', 'membro-banners', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create table if not exists public.membro_banners (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete restrict,
  titulo         text not null check (length(trim(titulo)) between 3 and 80),
  texto          text check (texto is null or length(texto) <= 200),
  imagem_caminho text not null,
  -- Endereço do botão: uma página da própria Área do Voluntário (/membro…) ou um https://.
  link_url       text check (link_url is null or (length(link_url) <= 500 and (link_url ~ '^/membro(/|$|\?|#)' or link_url ~ '^https://'))),
  link_rotulo    text check (link_rotulo is null or length(trim(link_rotulo)) between 2 and 30),
  inicio         date,
  fim            date,
  ativo          boolean not null default true,
  ordem          integer not null default 0,
  criado_por     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (fim is null or inicio is null or fim >= inicio),
  check ((link_url is null) = (link_rotulo is null))
);
create index if not exists membro_banners_workspace_idx on public.membro_banners (workspace_id, ativo, ordem);
create index if not exists membro_banners_criado_por_idx on public.membro_banners (criado_por);

alter table public.membro_banners enable row level security;
revoke all on public.membro_banners from anon, authenticated;
grant select, insert, update, delete on public.membro_banners to authenticated;
create policy membro_banners_select on public.membro_banners for select to authenticated using ((select private.nivel_participantes(workspace_id)) >= 1);
create policy membro_banners_insert on public.membro_banners for insert to authenticated with check ((select private.nivel_participantes(workspace_id)) >= 2);
create policy membro_banners_update on public.membro_banners for update to authenticated
  using ((select private.nivel_participantes(workspace_id)) >= 2) with check ((select private.nivel_participantes(workspace_id)) >= 2);
create policy membro_banners_delete on public.membro_banners for delete to authenticated using ((select private.nivel_participantes(workspace_id)) >= 2);
