-- O vínculo do pacote com o sinal do Cérebro morava dentro do jsonb `mestre`
-- (chave cerebroId), onde qualquer gravação integral do mestre o apagava — e
-- apagou: o mesmo sinal virou dois pacotes no mesmo dia, um deles órfão. Em
-- coluna própria, o vínculo fica fora do alcance do autosave; o índice único
-- fecha a porta da duplicata no próprio banco.

alter table public.social_packages
  add column if not exists cerebro_sinal_id text;

update public.social_packages
   set cerebro_sinal_id = mestre->>'cerebroId'
 where cerebro_sinal_id is null
   and coalesce(mestre->>'cerebroId', '') <> '';

-- Parcial: pacote arquivado libera o sinal para uma nova importação.
create unique index if not exists social_packages_um_pacote_por_sinal
  on public.social_packages (workspace_id, cerebro_sinal_id)
  where cerebro_sinal_id is not null and status <> 'arquivado';
