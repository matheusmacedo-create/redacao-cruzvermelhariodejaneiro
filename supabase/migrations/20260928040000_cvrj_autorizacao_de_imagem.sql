-- ============================================================
-- Autorização de uso de imagem pelo link.
--
-- A equipe sobe as fotos de uma ação, gera um link (e um QR code) e manda
-- para quem aparece nelas — pessoas atendidas, voluntários, colaboradores.
-- Cada pessoa abre no próprio celular, vê as fotos, lê o termo, marca os
-- usos que autoriza e assina na tela. Fica registrado quem, quando, de que
-- aparelho e endereço de internet, e o hash do texto exato que ela leu.
--
--   imagem_coletas        um link: título, as fotos, validade
--   imagem_autorizacoes   cada assinatura, com as provas
--   imagem_termo_versoes  o texto de cada versão do termo, gravado na
--                         primeira assinatura daquela versão (nunca muda)
--
-- Só acrescenta. Leitura: membros do espaço. Escrita: só pelo servidor
-- (service role) — a página pública não tem sessão, e as ações da equipe
-- conferem permissão antes de gravar.
-- ============================================================

create table if not exists public.imagem_termo_versoes (
  versao     text primary key check (char_length(versao) <= 40),
  texto      text not null check (char_length(texto) <= 20000),
  hash       text not null check (hash ~ '^[0-9a-f]{64}$'),
  criado_em  timestamptz not null default now()
);

create table if not exists public.imagem_coletas (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  titulo        text not null check (char_length(titulo) between 3 and 120),
  descricao     text not null default '' check (char_length(descricao) <= 500),
  -- O segredo do link público (/autorizacao/<token>): 32 caracteres aleatórios.
  token         text not null unique check (token ~ '^[A-Za-z0-9_-]{32,64}$'),
  file_ids      uuid[] not null default '{}' check (cardinality(file_ids) between 1 and 60),
  criado_por    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  expira_em     timestamptz,
  encerrada_em  timestamptz,
  encerrada_por uuid references public.profiles (id) on delete set null
);
create index if not exists imagem_coletas_workspace_idx on public.imagem_coletas (workspace_id, created_at desc);
create index if not exists imagem_coletas_criado_por_idx on public.imagem_coletas (criado_por);
create index if not exists imagem_coletas_encerrada_por_idx on public.imagem_coletas (encerrada_por);
create index if not exists imagem_coletas_file_ids_idx on public.imagem_coletas using gin (file_ids);

create table if not exists public.imagem_autorizacoes (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null references public.workspaces (id) on delete cascade,
  coleta_id              uuid not null references public.imagem_coletas (id) on delete restrict,
  -- Código do comprovante (IMG-XXXX-XXXX), para achar e conferir.
  codigo                 text not null unique check (codigo ~ '^IMG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'),
  nome                   text not null check (char_length(nome) between 3 and 200),
  vinculo                text not null check (vinculo in ('atendido','voluntario','colaborador','participante','outro')),
  contato                text check (char_length(contato) <= 200),
  menor                  boolean not null default false,
  responsavel_nome       text check (char_length(responsavel_nome) <= 200),
  responsavel_parentesco text check (char_length(responsavel_parentesco) <= 60),
  usos                   text[] not null check (cardinality(usos) between 1 and 10),
  -- Traços da assinatura desenhada: [[[x,y],...],...], coordenadas de 0 a 1000.
  assinatura             jsonb not null check (jsonb_typeof(assinatura) = 'array' and pg_column_size(assinatura) <= 120000),
  -- As fotos do link no momento da assinatura (o link pode ganhar fotos depois).
  file_ids               uuid[] not null default '{}',
  -- Provas.
  termo_versao           text not null references public.imagem_termo_versoes (versao),
  termo_hash             text not null check (termo_hash ~ '^[0-9a-f]{64}$'),
  documento_hash         text not null check (documento_hash ~ '^[0-9a-f]{64}$'),
  ip                     text check (char_length(ip) <= 64),
  user_agent             text check (char_length(user_agent) <= 500),
  aparelho               text not null check (char_length(aparelho) <= 200),
  aparelho_detalhes      jsonb not null default '{}'::jsonb check (jsonb_typeof(aparelho_detalhes) = 'object' and pg_column_size(aparelho_detalhes) <= 4000),
  assinado_em            timestamptz not null default now(),
  -- Segredo do link do comprovante (só o hash): permite à pessoa revogar sozinha.
  revogar_token_hash     text not null check (revogar_token_hash ~ '^[0-9a-f]{64}$'),
  revogada_em            timestamptz,
  revogada_por           text check (revogada_por in ('titular', 'equipe')),
  revogada_por_usuario   uuid references public.profiles (id) on delete set null,
  revogacao_motivo       text check (char_length(revogacao_motivo) <= 500),
  check (not menor or (responsavel_nome is not null and responsavel_parentesco is not null)),
  check ((revogada_em is null) = (revogada_por is null))
);
create index if not exists imagem_autorizacoes_coleta_idx on public.imagem_autorizacoes (coleta_id, assinado_em desc);
create index if not exists imagem_autorizacoes_workspace_idx on public.imagem_autorizacoes (workspace_id, assinado_em desc);
create index if not exists imagem_autorizacoes_nome_idx on public.imagem_autorizacoes (workspace_id, lower(nome));
create index if not exists imagem_autorizacoes_versao_idx on public.imagem_autorizacoes (termo_versao);
create index if not exists imagem_autorizacoes_revogada_por_idx on public.imagem_autorizacoes (revogada_por_usuario);
create index if not exists imagem_autorizacoes_file_ids_idx on public.imagem_autorizacoes using gin (file_ids);
-- Limite por origem (várias pessoas assinam do mesmo celular numa ação; robô não passa de 60 por hora).
create index if not exists imagem_autorizacoes_ip_idx on public.imagem_autorizacoes (coleta_id, ip, assinado_em desc);

-- A assinatura é prova: o que foi assinado não muda. Só a revogação pode
-- ser registrada depois (e só uma vez).
create or replace function private.imagem_autorizacao_imutavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Autorização de imagem não se apaga: revogue.' using errcode = 'P0001';
  end if;
  if old.revogada_em is not null then
    raise exception 'Esta autorização já foi revogada.' using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - array['revogada_em','revogada_por','revogada_por_usuario','revogacao_motivo'])
     is distinct from (to_jsonb(old) - array['revogada_em','revogada_por','revogada_por_usuario','revogacao_motivo']) then
    raise exception 'O que foi assinado não pode ser alterado.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists imagem_autorizacoes_imutavel on public.imagem_autorizacoes;
create trigger imagem_autorizacoes_imutavel before update or delete on public.imagem_autorizacoes
  for each row execute function private.imagem_autorizacao_imutavel();

create or replace function private.imagem_termo_imutavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'O texto de uma versão do termo não muda: crie uma versão nova.' using errcode = 'P0001';
end $$;
drop trigger if exists imagem_termo_versoes_imutavel on public.imagem_termo_versoes;
create trigger imagem_termo_versoes_imutavel before update or delete on public.imagem_termo_versoes
  for each row execute function private.imagem_termo_imutavel();

-- ---------------------------------------------------------------- RLS

alter table public.imagem_termo_versoes enable row level security;
alter table public.imagem_coletas enable row level security;
alter table public.imagem_autorizacoes enable row level security;

revoke all on public.imagem_termo_versoes, public.imagem_coletas, public.imagem_autorizacoes from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.imagem_termo_versoes, public.imagem_coletas, public.imagem_autorizacoes from authenticated;

drop policy if exists imagem_termo_versoes_select on public.imagem_termo_versoes;
create policy imagem_termo_versoes_select on public.imagem_termo_versoes for select to authenticated using (true);

drop policy if exists imagem_coletas_select on public.imagem_coletas;
create policy imagem_coletas_select on public.imagem_coletas for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

drop policy if exists imagem_autorizacoes_select on public.imagem_autorizacoes;
create policy imagem_autorizacoes_select on public.imagem_autorizacoes for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
