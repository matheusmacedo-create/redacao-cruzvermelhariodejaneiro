-- A capa da matéria, para o índice de notícias poder mostrar miniatura.
--
-- Mesma razão de site_url guardar o endereço final e não só o slug: o nome do
-- arquivo da capa nasce da legenda no momento da publicação (nomeSeoDaMidia) e
-- não é derivável do texto depois. Sem guardar aqui, o índice não tem como
-- saber o nome do arquivo — era exatamente o motivo de o índice sair só de
-- texto, como o comentário de indice-noticias.ts registrava.
--
-- Guarda o endereço COMPLETO da mesma imagem que vira og:image na matéria: a
-- primeira imagem do corpo, esteja ela na capa ou no meio do texto.
alter table public.content_pieces
  add column if not exists site_cover_url text;

comment on column public.content_pieces.site_cover_url is
  'Endereço completo da capa publicada (a mesma imagem do og:image da matéria). Nulo quando a matéria não tem imagem.';
