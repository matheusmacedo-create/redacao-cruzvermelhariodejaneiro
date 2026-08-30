-- Registro de publicações: a data em que cada destino foi ao ar.
--
-- Até aqui a única data disponível era updated_at, que se move a cada edição,
-- a cada reprocesso e a cada consulta de status. Um registro construído sobre
-- ela responderia "quando foi publicado" com a data do último toque — e um
-- registro que erra a data não serve para prestar contas.
--
-- Aditiva, como sempre: nada é removido e nenhuma coluna existente muda.

alter table public.package_destinations
  add column if not exists publicado_em timestamptz;

comment on column public.package_destinations.publicado_em is
  'Quando este destino foi de fato publicado. Carimbada pelo gatilho abaixo; updated_at não serve para isto porque muda a cada edição.';

-- O carimbo é do banco, não do código de aplicação: publicar acontece em mais
-- de um caminho (o disparo do pacote, o reprocesso de um destino, a consulta
-- de status que confirma o agendado), e amanhã pode haver outro. Depender de
-- alguém lembrar de preencher a data em cada um deles é como o registro fica
-- furado sem ninguém perceber.
create or replace function public.carimbar_publicacao()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Só na transição para publicada, e só uma vez: republicar depois não pode
  -- reescrever a data em que a página foi ao ar pela primeira vez.
  if new.estado = 'publicada'
     and old.estado is distinct from 'publicada'
     and new.publicado_em is null then
    new.publicado_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists carimbar_publicacao on public.package_destinations;
create trigger carimbar_publicacao
  before update on public.package_destinations
  for each row execute function public.carimbar_publicacao();

-- O que já está publicado ganha a melhor data que existe hoje. É aproximada
-- para essas linhas antigas — e só para elas.
update public.package_destinations
   set publicado_em = updated_at
 where estado = 'publicada'
   and publicado_em is null;

-- O registro lê só o que saiu (ou tentou sair) e ordena pelo momento do fato.
-- Índice parcial porque rascunho e variante em ajuste nunca aparecem lá.
create index if not exists package_destinations_registro_idx
  on public.package_destinations (workspace_id, (coalesce(publicado_em, updated_at)) desc)
  where estado in ('publicada', 'falhou');
