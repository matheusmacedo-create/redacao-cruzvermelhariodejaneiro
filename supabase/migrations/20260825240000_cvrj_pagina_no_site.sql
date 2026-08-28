-- Matéria publicada como página no site institucional.
--
-- slug é o endereço da matéria e vira nome de pasta no servidor de arquivos:
-- a página mora em <slug>/index.html, para que a URL termine em barra. Sem
-- isso o mesmo texto responderia em /slug, /slug/ e /slug/index.html, e o
-- buscador dividiria a autoridade entre três endereços.
--
-- O índice é único por espaço e parcial: duas matérias não podem disputar a
-- mesma pasta, mas as que ainda não foram publicadas ficam todas com slug nulo
-- sem colidir entre si.
--
-- site_url guarda o endereço final, e não só o slug, porque a pasta pública
-- pode mudar de lugar. Um link que já saiu nas redes precisa continuar
-- apontando para onde apontava quando saiu.
--
-- Três colunas nulas, sem default: nada do que está em execução precisa delas.

alter table public.content_pieces
  add column if not exists slug              text,
  add column if not exists site_url          text,
  add column if not exists site_published_at timestamptz;

create unique index if not exists content_pieces_workspace_slug_idx
  on public.content_pieces (workspace_id, slug)
  where slug is not null;

comment on column public.content_pieces.slug is
  'Endereço da matéria no site. Vira pasta: <slug>/index.html.';
comment on column public.content_pieces.site_url is
  'Endereço público completo, com barra no fim. Preenchido ao publicar.';
comment on column public.content_pieces.site_published_at is
  'Quando a página foi ao ar pela última vez.';
