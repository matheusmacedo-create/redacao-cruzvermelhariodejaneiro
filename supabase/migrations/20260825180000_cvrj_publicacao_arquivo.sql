-- Liga a publicação ao arquivo da Biblioteca que a ilustrou.
--
-- Por que não basta guardar a URL: os arquivos da Biblioteca são privados e
-- servidos por um proxy autenticado, então não existe URL pública para guardar.
-- O que vai para a rede social são os bytes, enviados na hora do post. Guardar
-- o id do arquivo é o que permite responder depois "que foto saiu nesse post".
alter table public.social_publications
  add column if not exists file_id uuid references public.files (id) on delete set null;

create index if not exists social_publications_file_idx
  on public.social_publications (file_id) where file_id is not null;
