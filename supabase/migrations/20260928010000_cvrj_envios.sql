-- Envio de ações pela equipe (docs/envio-de-acoes.md): o link público /enviar, onde qualquer
-- pessoa da equipe manda o que aconteceu numa ação — texto, áudio gravado na hora, fotos, vídeos e
-- documentos — e a caixa "Envios da equipe", onde quem avalia transforma o envio em pauta e matéria.
--
-- Só acréscimos. Os arquivos NÃO ficam no banco nem na Biblioteca: vão direto do navegador ao R2
-- (bucket do acervo, pasta entrada/envios/), fora da cota de 1 GB da Biblioteca. Só o que for
-- escolhido na avaliação é copiado para a Biblioteca.
--
-- O link é aberto (decisão do Matheus, 25/09/2026), então o banco não recebe nada direto do
-- público: tudo passa pelas rotas /api/enviar com a chave de serviço, depois das proteções contra
-- robô e dos limites por origem. Ler é só para quem está em envios_avaliadores (hoje, só o Matheus).

create sequence if not exists public.envios_numero_seq;

create table if not exists public.envios (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null references public.workspaces (id) on delete cascade,
  numero                 bigint not null default nextval('public.envios_numero_seq') unique,
  protocolo              text generated always as ('ENV-' || lpad(numero::text, 5, '0')) stored,
  criado_em              timestamptz not null default now(),
  concluido_em           timestamptz,
  estado                 text not null default 'recebendo'
                           check (estado in ('recebendo', 'novo', 'em_avaliacao', 'virou_pauta', 'arquivado')),
  nome                   text not null check (length(trim(nome)) between 2 and 120),
  setor                  text check (setor is null or length(setor) <= 120),
  whatsapp               text check (whatsapp is null or length(whatsapp) <= 40),
  email                  text check (email is null or (length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  titulo                 text not null check (length(trim(titulo)) between 3 and 200),
  data_da_acao           date check (data_da_acao is null or data_da_acao >= '2000-01-01'),
  local                  text check (local is null or length(local) <= 300),
  latitude               double precision check (latitude is null or latitude between -90 and 90),
  longitude              double precision check (longitude is null or longitude between -180 and 180),
  pessoas_atendidas      integer check (pessoas_atendidas is null or pessoas_atendidas between 0 and 1000000),
  parceiros              text check (parceiros is null or length(parceiros) <= 500),
  relato                 text check (relato is null or length(relato) <= 20000),
  autorizacao_imagem     text not null check (autorizacao_imagem in ('sim', 'nao_sei', 'menores', 'sem_pessoas')),
  avisar_quando_publicar boolean not null default true,
  token_hash             text not null check (length(token_hash) = 64),
  ip_hash                text not null check (length(ip_hash) = 64),
  user_agent             text check (user_agent is null or length(user_agent) <= 400),
  pauta_id               uuid references public.pautas (id) on delete set null,
  pacote_id              uuid references public.social_packages (id) on delete set null,
  avaliado_por           uuid references public.profiles (id) on delete set null,
  avaliado_em            timestamptz,
  transcricao            text check (transcricao is null or length(transcricao) <= 60000),
  transcricao_em         timestamptz,
  avisado_em             timestamptz,
  notas                  text check (notas is null or length(notas) <= 4000)
);
comment on table public.envios is 'Ações enviadas pela equipe pelo link público /enviar (docs/envio-de-acoes.md).';
create index if not exists envios_caixa_idx on public.envios (workspace_id, estado, criado_em desc);
create index if not exists envios_origem_idx on public.envios (ip_hash, criado_em desc);
create index if not exists envios_pauta_idx on public.envios (pauta_id) where pauta_id is not null;

create table if not exists public.envio_arquivos (
  id              uuid primary key default gen_random_uuid(),
  envio_id        uuid not null references public.envios (id) on delete cascade,
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  chave           text not null unique check (chave like 'entrada/envios/%' and length(chave) <= 400),
  nome            text not null check (length(nome) between 1 and 255),
  tipo_mime       text check (tipo_mime is null or length(tipo_mime) <= 120),
  tamanho         bigint not null check (tamanho > 0 and tamanho <= 2147483648),
  categoria       text not null check (categoria in ('foto', 'video', 'audio', 'documento')),
  gravado_na_hora boolean not null default false,
  estado          text not null default 'enviando' check (estado in ('enviando', 'recebido')),
  criado_em       timestamptz not null default now(),
  recebido_em     timestamptz,
  file_id         uuid references public.files (id) on delete set null
);
comment on table public.envio_arquivos is 'Arquivos de cada envio, no R2 (bucket do acervo, entrada/envios/).';
create index if not exists envio_arquivos_envio_idx on public.envio_arquivos (envio_id, criado_em);

create table if not exists public.envios_avaliadores (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  criado_em    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
comment on table public.envios_avaliadores is 'Quem recebe e avalia os envios da equipe (decisão de 25/09/2026: só o Matheus).';

alter table public.envios enable row level security;
alter table public.envio_arquivos enable row level security;
alter table public.envios_avaliadores enable row level security;

revoke all on public.envios, public.envio_arquivos, public.envios_avaliadores from anon;
revoke insert, update, delete, truncate on public.envios, public.envio_arquivos, public.envios_avaliadores from authenticated;
grant select on public.envios, public.envio_arquivos, public.envios_avaliadores to authenticated;
revoke all on sequence public.envios_numero_seq from anon, authenticated;

drop policy if exists envios_avaliadores_select on public.envios_avaliadores;
create policy envios_avaliadores_select on public.envios_avaliadores
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists envios_select on public.envios;
create policy envios_select on public.envios
  for select to authenticated using (exists (
    select 1 from public.envios_avaliadores a
     where a.workspace_id = envios.workspace_id and a.user_id = (select auth.uid())));

drop policy if exists envio_arquivos_select on public.envio_arquivos;
create policy envio_arquivos_select on public.envio_arquivos
  for select to authenticated using (exists (
    select 1 from public.envios_avaliadores a
     where a.workspace_id = envio_arquivos.workspace_id and a.user_id = (select auth.uid())));

-- Quem avalia, decidido em 25/09/2026. Onde o usuário não existe (banco local), não insere nada.
insert into public.envios_avaliadores (workspace_id, user_id)
select w.id, p.id
  from public.workspaces w
  join public.workspace_members m on m.workspace_id = w.id
  join public.profiles p on p.id = m.user_id
 where p.username = 'matheus.macedo' and m.role = 'admin'
on conflict do nothing;
