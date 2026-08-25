-- Carrossel: várias mídias numa publicação só.
--
-- file_ids guarda a ordem, que importa: o carrossel é lido da primeira para a
-- última, e a primeira é a capa que aparece no feed.
--
-- Array em vez de tabela de ligação: Postgres não põe chave estrangeira em
-- elemento de array, então perdemos a integridade referencial. É um preço
-- aceitável aqui porque o registro do que foi publicado de verdade mora em
-- `results`, com o link do post na rede; `file_ids` serve para remontar o
-- rascunho e para saber que foto ilustrou o post enquanto ela existir.
--
-- file_id, a coluna antiga de mídia única, NÃO é derrubada aqui. Derrubá-la
-- junto com a chegada de file_ids quebrou a produção: o build no ar ainda
-- escrevia nela, e todo envio passou a falhar com erro de servidor. Coluna que
-- o código em execução usa só sai numa migração posterior ao deploy que parou
-- de usá-la.

alter table public.social_publications
  add column if not exists file_ids uuid[] not null default '{}';

comment on column public.social_publications.file_id is
  'Obsoleta: substituída por file_ids. Mantida enquanto houver build antigo no ar.';
