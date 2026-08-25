-- Carrossel: várias mídias numa publicação só.
--
-- file_id virou file_ids porque a ordem importa — o carrossel é lido da
-- primeira para a última, e a primeira é a capa que aparece no feed.
--
-- Array em vez de tabela de ligação: Postgres não põe chave estrangeira em
-- elemento de array, então perdemos a integridade referencial. É um preço
-- aceitável aqui porque o registro do que foi publicado de verdade mora em
-- `results`, com o link do post na rede; `file_ids` serve para remontar o
-- rascunho e para saber que foto ilustrou o post enquanto ela existir.
--
-- A tabela está vazia, então não há dado a migrar.

alter table public.social_publications drop column if exists file_id;

alter table public.social_publications
  add column if not exists file_ids uuid[] not null default '{}';
