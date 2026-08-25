-- Publicação de calendário criada já no registro da pauta.
--
-- Quem registra uma atividade quase sempre já sabe quando ela precisa virar
-- post. Antes esse "quando" só existia na cabeça de quem pediu, e a
-- Comunicação descobria depois, no contato. Agora o registro pode nascer com
-- as publicações previstas, e cada publicação prevista nasce ligada a um
-- conteúdo — que é o que o Marketing abre para aprovar.
--
-- content_id é o atalho: da data no calendário direto para a peça que precisa
-- de aprovação, sem passar pela pauta e procurar qual das peças é aquela.
-- ON DELETE SET NULL porque apagar o conteúdo não deve apagar a data: o
-- compromisso com a data continua de pé mesmo que a peça seja refeita.
--
-- channel guarda a rede/veículo previsto. Fica no evento, e não só no formato
-- do conteúdo, para o calendário conseguir mostrar "Instagram · 14h" sem ter
-- que carregar a peça inteira de cada dia do mês.
--
-- As duas colunas entram como nulas e sem default: nenhum código em execução
-- precisa delas para continuar gravando eventos como sempre gravou.

alter table public.calendar_events
  add column if not exists content_id uuid references public.content_pieces (id) on delete set null,
  add column if not exists channel    text;

create index if not exists calendar_events_content_id_idx on public.calendar_events (content_id);

comment on column public.calendar_events.content_id is
  'Peça de conteúdo que esta data publica. Preenchida quando a publicação nasce no registro da pauta.';
comment on column public.calendar_events.channel is
  'Rede ou veículo previsto para a publicação (Instagram, Site, WhatsApp...).';
