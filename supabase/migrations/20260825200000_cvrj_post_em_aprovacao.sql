-- Post de rede social parado esperando aprovação.
--
-- O fluxo de aprovação do sistema é ancorado em content_pieces: é lá que
-- moram as votações, os comentários e a tela de Aprovações. Em vez de
-- duplicar tudo isso para posts, um post enviado para aprovação vira um
-- content_piece de formato "Post para redes" e entra na mesma fila.
--
-- A linha aqui guarda o que a tela montou — redes, formato, mídia,
-- agendamento — e aponta para esse content_piece pelo content_id que já
-- existia. Quando a aprovação sai, publicar é um clique sobre esta linha.

alter table public.social_publications drop constraint if exists social_publications_status_check;

alter table public.social_publications
  add constraint social_publications_status_check
  check (status in ('draft','pending','queued','processing','in_progress','completed','failed'));

-- A tela de Redes lista os rascunhos do espaço primeiro; sem índice isso
-- viraria varredura à medida que o histórico cresce.
create index if not exists social_publications_draft_idx
  on public.social_publications (workspace_id, created_at desc)
  where status = 'draft';
