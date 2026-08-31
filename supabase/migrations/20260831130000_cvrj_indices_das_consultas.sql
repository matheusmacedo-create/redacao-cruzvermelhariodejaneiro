-- Índices para as consultas que as telas passaram a fazer, e para as chaves
-- estrangeiras que o Postgres não indexa sozinho.
--
-- Aditiva: nada é removido, nenhuma coluna muda. Os índices não usados que o
-- advisor aponta ficam onde estão — a base é nova e "nunca usado" ali quer
-- dizer "ainda não", não "inútil".

-- 1. Impacto e Saúde dos canais passaram a perguntar "o que saiu, e quando",
--    filtrando por estado e ordenando por publicado_em. O índice do Registro
--    não serve a esta pergunta: ele é sobre coalesce(publicado_em, updated_at).
create index if not exists package_destinations_publicado_idx
  on public.package_destinations (workspace_id, publicado_em desc)
  where estado = 'publicada';

-- 2. A lista de conversas lê as mensagens diretas mais recentes do espaço.
--    Parcial porque comentário de pauta (pauta_id preenchido) nunca aparece lá.
create index if not exists messages_diretas_idx
  on public.messages (workspace_id, created_at desc)
  where pauta_id is null;

-- 3. Chave estrangeira sem índice: a conversa de uma pessoa filtra por
--    recipient_id, e a exclusão de um perfil precisa varrer esta coluna.
create index if not exists messages_recipient_idx
  on public.messages (recipient_id)
  where recipient_id is not null;

-- 4. As demais chaves estrangeiras apontadas pelo advisor. Todas existem para
--    o mesmo motivo: sem índice, apagar um perfil ou um arquivo obriga o
--    Postgres a varrer a tabela inteira segurando o bloqueio.
create index if not exists social_packages_created_by_idx
  on public.social_packages (created_by);

create index if not exists social_publications_created_by_idx
  on public.social_publications (created_by);

create index if not exists social_publications_file_idx
  on public.social_publications (file_id)
  where file_id is not null;
