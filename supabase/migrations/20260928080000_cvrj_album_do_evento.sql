-- Álbum do evento: as fotos e vídeos de todos que mandaram de uma mesma ação, num lugar só.
-- Só acréscimos. Decisões do Matheus (26/09/2026, docs/envio-de-acoes.md §9):
--  - quem vê: quem tiver o link secreto do álbum, sem login (fora do Google e do site);
--  - as fotos entram na hora; quem avalia esconde o que não deve ficar;
--  - baixa uma a uma ou tudo num .zip;
--  - só quem avalia os envios cria o evento.
--
-- O evento tem dois links:
--  - o de ENVIO (/enviar/<codigo>): quem manda por ele já cai no evento;
--  - o do ÁLBUM (/album/<album_token>): quem tem vê e baixa. Nulo = desligado.
-- Os arquivos continuam onde já estavam (R2, entrada/envios/); nada é copiado.

create table if not exists public.envio_eventos (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  nome           text not null check (length(trim(nome)) between 3 and 140),
  data_do_evento date check (data_do_evento is null or data_do_evento >= '2000-01-01'),
  local          text check (local is null or length(local) <= 300),
  codigo         text not null unique check (codigo ~ '^[a-z0-9]{10}$'),
  album_token    text unique check (album_token is null or album_token ~ '^[A-Za-z0-9_-]{32}$'),
  envio_aberto   boolean not null default true,
  criado_por     uuid references public.profiles (id) on delete set null,
  criado_em      timestamptz not null default now()
);
comment on table public.envio_eventos is 'Eventos que juntam os envios da equipe num álbum (link de envio e link secreto do álbum).';
create index if not exists envio_eventos_ws_idx on public.envio_eventos (workspace_id, criado_em desc);

alter table public.envios add column if not exists evento_id uuid references public.envio_eventos (id) on delete set null;
create index if not exists envios_evento_idx on public.envios (evento_id) where evento_id is not null;

-- Esconder do álbum não apaga nem tira do envio: só deixa de aparecer para quem tem o link.
alter table public.envio_arquivos add column if not exists oculto_no_album boolean not null default false;
-- Miniatura (JPEG de até 640 px) gerada no celular de quem enviou: o álbum carrega leve.
alter table public.envio_arquivos add column if not exists miniatura text
  check (miniatura is null or (miniatura like 'entrada/envios/%' and length(miniatura) <= 420));

alter table public.envio_eventos enable row level security;
revoke all on public.envio_eventos from anon;
revoke insert, update, delete, truncate on public.envio_eventos from authenticated;
grant select on public.envio_eventos to authenticated;

-- Como os envios: só quem avalia vê (o álbum público passa pela rota, com o token).
drop policy if exists envio_eventos_select on public.envio_eventos;
create policy envio_eventos_select on public.envio_eventos
  for select to authenticated using (exists (
    select 1 from public.envios_avaliadores a
     where a.workspace_id = envio_eventos.workspace_id and a.user_id = (select auth.uid())));
