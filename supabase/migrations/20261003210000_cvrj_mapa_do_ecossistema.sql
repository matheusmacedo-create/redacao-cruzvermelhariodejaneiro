-- Mapa do ecossistema (docs/mapa-do-ecossistema.md): o que existe nos três sistemas da filial
-- (Palácio Virtual, site institucional e plataforma da Escola), o estado de cada parte e o que
-- falta. Nasceu do levantamento de 03/10/2026 (git dos repositórios + documentação); daqui em
-- diante vive aqui e é atualizado pela tela /mapa (marcar pendência resolvida, mudar o estado).
--
-- Só acréscimos. Duas tabelas:
--  - mapa_itens: a árvore sistema → categoria → item. O id é o caminho em slug
--    (palacio.pessoas.cracha-certificado-e-diploma), que também é o endereço na tela (#...).
--  - mapa_pendencias: cada pendência, ligada ao item pelo nome da área, com a situação
--    (pendente, parcial, feito), quem resolveu e quando.
--
-- Leitura: todo membro do espaço (private.is_workspace_member). Escrita: só pelo servidor
-- (chave de serviço), depois da checagem de permissão na server action (mapa.editar).

create table if not exists public.mapa_itens (
  id             text primary key check (id ~ '^[a-z0-9][a-z0-9.-]{0,200}$'),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  parent_id      text references public.mapa_itens (id) on delete cascade,
  tipo           text not null check (tipo in ('sistema', 'categoria', 'item')),
  sistema        text not null check (sistema in ('palacio', 'site', 'escola')),
  nome           text not null check (length(nome) between 1 and 200),
  descricao      text not null default '' check (length(descricao) <= 2000),
  -- Só o item tem estado; categoria e sistema calculam o deles a partir dos filhos.
  estado         text check (estado is null or estado in (
                   'no ar', 'feito, falta publicar ou configurar', 'em andamento',
                   'fora do ar por decisão', 'proposta (só documento)')),
  estado_detalhe text not null default '' check (length(estado_detalhe) <= 2000),
  url            text check (url is null or length(url) <= 500),
  -- As entregas registradas no levantamento: [{data, titulo, detalhe}].
  entregas       jsonb not null default '[]'::jsonb,
  ordem          integer not null default 0,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references public.profiles (id) on delete set null,
  constraint mapa_itens_estado_no_item check ((tipo = 'item') = (estado is not null))
);
comment on table public.mapa_itens is 'Árvore do mapa do ecossistema: sistema → categoria → item, com estado e entregas.';
create index if not exists mapa_itens_ws_parent_idx on public.mapa_itens (workspace_id, parent_id, ordem);

create table if not exists public.mapa_pendencias (
  id             text primary key check (id ~ '^[A-Z]{1,3}-[0-9]{1,4}$'),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  item_id        text references public.mapa_itens (id) on delete set null,
  sistema        text not null check (sistema in ('palacio', 'site', 'escola')),
  titulo         text not null check (length(titulo) between 1 and 300),
  detalhe        text not null default '' check (length(detalhe) <= 4000),
  tipo           text not null check (tipo in ('decisao', 'configuracao', 'codigo', 'terceiro', 'ideia')),
  quem           text not null default '' check (length(quem) <= 60),
  esforco        text not null default '' check (length(esforco) <= 20),
  prioridade     text not null default '' check (length(prioridade) <= 20),
  area           text not null default '' check (length(area) <= 200),
  por_que        text not null default '' check (length(por_que) <= 2000),
  bloqueia       text not null default '' check (length(bloqueia) <= 1000),
  primeiro_passo text not null default '' check (length(primeiro_passo) <= 2000),
  fonte          text not null default '' check (length(fonte) <= 500),
  o_que_falta    text not null default '' check (length(o_que_falta) <= 2000),
  situacao       text not null default 'pendente' check (situacao in ('pendente', 'parcial', 'feito')),
  -- Posição na fila de próximos passos (null = fora da fila).
  ordem_fila     integer,
  resolvida_em   timestamptz,
  resolvida_por  uuid references public.profiles (id) on delete set null,
  nota           text not null default '' check (length(nota) <= 2000),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
comment on table public.mapa_pendencias is 'Pendências do mapa do ecossistema, ligadas ao item, com a situação e quem resolveu.';
create index if not exists mapa_pendencias_ws_item_idx on public.mapa_pendencias (workspace_id, item_id);
create index if not exists mapa_pendencias_ws_situacao_idx on public.mapa_pendencias (workspace_id, situacao);

alter table public.mapa_itens enable row level security;
alter table public.mapa_pendencias enable row level security;

revoke all on public.mapa_itens, public.mapa_pendencias from anon;
revoke insert, update, delete, truncate on public.mapa_itens, public.mapa_pendencias from authenticated;
grant select on public.mapa_itens, public.mapa_pendencias to authenticated;

drop policy if exists mapa_itens_select on public.mapa_itens;
create policy mapa_itens_select on public.mapa_itens
  for select to authenticated using (private.is_workspace_member(workspace_id));

drop policy if exists mapa_pendencias_select on public.mapa_pendencias;
create policy mapa_pendencias_select on public.mapa_pendencias
  for select to authenticated using (private.is_workspace_member(workspace_id));
