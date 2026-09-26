-- ============================================================
-- Autorização de imagem também para as fotos que chegam por /enviar.
--
-- Quem manda uma ação gera, na tela de "Recebemos!", o link (e o QR) para
-- as pessoas das fotos assinarem ali mesmo. As fotos desse link são as do
-- envio (envio_arquivos, no R2), não da Biblioteca: por isso a coleta ganha
-- envio_id e deixa de exigir file_ids.
--
-- Só acrescenta e afrouxa: o check antigo (1 a 60 fotos da Biblioteca) vira
-- "até 60". O "pelo menos uma foto" do link da Biblioteca continua no
-- servidor (lerNovaColeta); no banco ele travaria apagar um envio (o
-- envio_id vira null e o link ficaria sem nada).
-- ============================================================

alter table public.imagem_coletas
  add column if not exists envio_id uuid references public.envios (id) on delete set null;

-- Um link por envio.
create unique index if not exists imagem_coletas_envio_idx on public.imagem_coletas (envio_id) where envio_id is not null;

alter table public.imagem_coletas drop constraint if exists imagem_coletas_file_ids_check;
alter table public.imagem_coletas drop constraint if exists imagem_coletas_fotos_check;
alter table public.imagem_coletas add constraint imagem_coletas_fotos_check
  check (cardinality(file_ids) <= 60);
