-- Doações em espécie (Patrimônio 3/4): itens doados (alimentos, roupas,
-- ajuda humanitária) com doador e recibo na entrada, e entrega com
-- beneficiário e termo na saída — para prestar contas por campanha.
--
-- A doação não tem estoque próprio: cada item entra no Estoque (material,
-- com valor de mercado — ITG 2002) ou no Patrimônio (bem durável). A entrega
-- é uma saída do Estoque com finalidade "distribuição". Aqui ficam o
-- cabeçalho (quem doou / quem recebeu, campanha, número do documento) e as
-- linhas, ligadas aos movimentos e bens.
--
-- Mesmo acesso do Patrimônio: ver 1, operar 2 (receber, entregar, doadores),
-- gestão 3 (campanhas, cancelar documento).

-- ---------------------------------------------------------------- tabelas

create table if not exists public.doa_campanhas (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  nome          text not null check (char_length(nome) between 2 and 120),
  descricao     text check (char_length(descricao) <= 2000),
  inicio        date,
  fim           date,
  projeto_id    uuid references public.projects (id) on delete set null,
  ativa         boolean not null default true,
  criado_por    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (workspace_id, nome),
  check (fim is null or inicio is null or fim >= inicio)
);
create index if not exists doa_campanhas_projeto_idx on public.doa_campanhas (projeto_id);
create index if not exists doa_campanhas_criado_idx on public.doa_campanhas (criado_por);

create table if not exists public.doa_doadores (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  tipo          text not null default 'pf' check (tipo in ('pf','pj')),
  nome          text not null check (char_length(nome) between 2 and 160),
  -- Só dígitos: 11 (CPF) ou 14 (CNPJ).
  documento     text check (documento ~ '^([0-9]{11}|[0-9]{14})$'),
  email         text check (char_length(email) <= 200),
  telefone      text check (char_length(telefone) <= 40),
  observacao    text check (char_length(observacao) <= 1000),
  criado_por    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create unique index if not exists doa_doadores_documento_idx on public.doa_doadores (workspace_id, documento) where documento is not null;
create index if not exists doa_doadores_workspace_nome_idx on public.doa_doadores (workspace_id, nome);
create index if not exists doa_doadores_criado_idx on public.doa_doadores (criado_por);

create table if not exists public.doa_recebimentos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  ano           integer not null,
  numero        integer not null,
  codigo        text not null,
  doador_id     uuid references public.doa_doadores (id) on delete restrict,
  -- Retrato do doador no dia (o recibo não muda se o cadastro mudar). Sem doador: anônimo.
  doador_nome   text,
  doador_documento text,
  campanha_id   uuid references public.doa_campanhas (id) on delete restrict,
  data          date not null,
  local_id      uuid not null references public.pat_locais (id) on delete restrict,
  observacao    text check (char_length(observacao) <= 2000),
  valor_total   numeric(14,2) not null default 0,
  criado_por    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (workspace_id, ano, numero),
  unique (workspace_id, codigo)
);
create index if not exists doa_recebimentos_doador_idx on public.doa_recebimentos (doador_id);
create index if not exists doa_recebimentos_campanha_idx on public.doa_recebimentos (campanha_id);
create index if not exists doa_recebimentos_local_idx on public.doa_recebimentos (local_id);
create index if not exists doa_recebimentos_data_idx on public.doa_recebimentos (workspace_id, data);
create index if not exists doa_recebimentos_criado_idx on public.doa_recebimentos (criado_por);

create table if not exists public.doa_recebimento_itens (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  recebimento_id  uuid not null references public.doa_recebimentos (id) on delete cascade,
  tipo            text not null check (tipo in ('material','bem')),
  item_id         uuid references public.est_itens (id) on delete restrict,
  bem_id          uuid references public.pat_bens (id) on delete restrict,
  grupo           uuid,
  descricao       text not null,
  quantidade      numeric(14,3) not null check (quantidade > 0),
  unidade         text not null,
  valor_unitario  numeric(14,2) not null check (valor_unitario >= 0),
  valor_total     numeric(14,2) not null,
  lote            text,
  validade        date,
  check ((tipo = 'material') = (item_id is not null) and (tipo = 'bem') = (bem_id is not null))
);
create index if not exists doa_recebimento_itens_recebimento_idx on public.doa_recebimento_itens (recebimento_id);
create index if not exists doa_recebimento_itens_item_idx on public.doa_recebimento_itens (item_id);
create index if not exists doa_recebimento_itens_bem_idx on public.doa_recebimento_itens (bem_id);
create index if not exists doa_recebimento_itens_workspace_idx on public.doa_recebimento_itens (workspace_id);

create table if not exists public.doa_entregas (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  ano                integer not null,
  numero             integer not null,
  codigo             text not null,
  campanha_id        uuid references public.doa_campanhas (id) on delete restrict,
  data               date not null,
  local_id           uuid not null references public.pat_locais (id) on delete restrict,
  beneficiario_tipo  text not null check (beneficiario_tipo in ('familia','pessoa','instituicao','abrigo','acao')),
  beneficiario_nome  text not null check (char_length(beneficiario_nome) between 2 and 160),
  beneficiario_documento text check (char_length(beneficiario_documento) <= 30),
  responsavel        text check (char_length(responsavel) <= 160),
  pessoas            integer check (pessoas is null or pessoas between 1 and 1000000),
  municipio          text check (char_length(municipio) <= 80),
  bairro             text check (char_length(bairro) <= 80),
  observacao         text check (char_length(observacao) <= 2000),
  projeto_id         uuid references public.projects (id) on delete set null,
  valor_total        numeric(14,2) not null default 0,
  criado_por         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (workspace_id, ano, numero),
  unique (workspace_id, codigo)
);
create index if not exists doa_entregas_campanha_idx on public.doa_entregas (campanha_id);
create index if not exists doa_entregas_local_idx on public.doa_entregas (local_id);
create index if not exists doa_entregas_data_idx on public.doa_entregas (workspace_id, data);
create index if not exists doa_entregas_projeto_idx on public.doa_entregas (projeto_id);
create index if not exists doa_entregas_criado_idx on public.doa_entregas (criado_por);

create table if not exists public.doa_entrega_itens (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  entrega_id    uuid not null references public.doa_entregas (id) on delete cascade,
  item_id       uuid not null references public.est_itens (id) on delete restrict,
  grupo         uuid not null,
  descricao     text not null,
  quantidade    numeric(14,3) not null check (quantidade > 0),
  unidade       text not null,
  valor         numeric(14,2) not null
);
create index if not exists doa_entrega_itens_entrega_idx on public.doa_entrega_itens (entrega_id);
create index if not exists doa_entrega_itens_item_idx on public.doa_entrega_itens (item_id);
create index if not exists doa_entrega_itens_workspace_idx on public.doa_entrega_itens (workspace_id);

-- ---------------------------------------------------------------- leitura

alter table public.doa_campanhas enable row level security;
alter table public.doa_doadores enable row level security;
alter table public.doa_recebimentos enable row level security;
alter table public.doa_recebimento_itens enable row level security;
alter table public.doa_entregas enable row level security;
alter table public.doa_entrega_itens enable row level security;

revoke all on public.doa_campanhas, public.doa_doadores, public.doa_recebimentos, public.doa_recebimento_itens, public.doa_entregas, public.doa_entrega_itens from anon, authenticated;
grant select on public.doa_campanhas, public.doa_doadores, public.doa_recebimentos, public.doa_recebimento_itens, public.doa_entregas, public.doa_entrega_itens to authenticated;

create policy doa_campanhas_select on public.doa_campanhas for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);
create policy doa_doadores_select on public.doa_doadores for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);
create policy doa_recebimentos_select on public.doa_recebimentos for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);
create policy doa_recebimento_itens_select on public.doa_recebimento_itens for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);
create policy doa_entregas_select on public.doa_entregas for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);
create policy doa_entrega_itens_select on public.doa_entrega_itens for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);

-- ---------------------------------------------------------------- escrita

create or replace function public.doacao_salvar_campanha(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_projeto uuid;
begin
  v_id := nullif(p->>'id', '')::uuid;
  v_projeto := nullif(p->>'projeto_id', '')::uuid;
  if (select private.nivel_patrimonio(p_workspace_id)) < 3 then raise exception 'Só a gestão do Patrimônio cria e muda campanhas.' using errcode = 'P0001'; end if;
  if v_projeto is not null and not exists (select 1 from public.projects where id = v_projeto and workspace_id = p_workspace_id) then raise exception 'Projeto inválido.' using errcode = 'P0001'; end if;
  if v_id is null then
    insert into public.doa_campanhas (workspace_id, nome, descricao, inicio, fim, projeto_id, criado_por)
    values (p_workspace_id, trim(p->>'nome'), nullif(trim(p->>'descricao'), ''), nullif(p->>'inicio', '')::date, nullif(p->>'fim', '')::date, v_projeto, (select auth.uid()))
    returning id into v_id;
  else
    update public.doa_campanhas set nome = trim(p->>'nome'), descricao = nullif(trim(p->>'descricao'), ''), inicio = nullif(p->>'inicio', '')::date,
      fim = nullif(p->>'fim', '')::date, projeto_id = v_projeto, ativa = coalesce((p->>'ativa')::boolean, ativa)
    where id = v_id and workspace_id = p_workspace_id;
    if not found then raise exception 'Campanha não encontrada.' using errcode = 'P0001'; end if;
  end if;
  perform private.pat_registrar(p_workspace_id, null, 'doacao_campanha', jsonb_build_object('campanha', v_id, 'nome', trim(p->>'nome')));
  return v_id;
exception
  when unique_violation then raise exception 'Já existe uma campanha com este nome.' using errcode = 'P0001';
  when check_violation then raise exception 'Confira as datas (o fim não pode ser antes do início) e o nome.' using errcode = 'P0001';
  when invalid_text_representation or invalid_datetime_format then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
end $$;

create or replace function public.doacao_salvar_doador(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_doc text;
begin
  v_id := nullif(p->>'id', '')::uuid;
  v_doc := nullif(regexp_replace(coalesce(p->>'documento', ''), '\D', '', 'g'), '');
  if (select private.nivel_patrimonio(p_workspace_id)) < 2 then raise exception 'Você não tem acesso para cadastrar doadores.' using errcode = 'P0001'; end if;
  if v_doc is not null and char_length(v_doc) not in (11, 14) then raise exception 'CPF tem 11 dígitos e CNPJ, 14.' using errcode = 'P0001'; end if;
  if v_id is null then
    insert into public.doa_doadores (workspace_id, tipo, nome, documento, email, telefone, observacao, criado_por)
    values (p_workspace_id, case when char_length(v_doc) = 14 then 'pj' else coalesce(nullif(p->>'tipo', ''), 'pf') end, trim(p->>'nome'), v_doc,
      nullif(lower(trim(p->>'email')), ''), nullif(trim(p->>'telefone'), ''), nullif(trim(p->>'observacao'), ''), (select auth.uid()))
    returning id into v_id;
  else
    update public.doa_doadores set tipo = case when char_length(v_doc) = 14 then 'pj' else coalesce(nullif(p->>'tipo', ''), tipo) end, nome = trim(p->>'nome'), documento = v_doc,
      email = nullif(lower(trim(p->>'email')), ''), telefone = nullif(trim(p->>'telefone'), ''), observacao = nullif(trim(p->>'observacao'), '')
    where id = v_id and workspace_id = p_workspace_id;
    if not found then raise exception 'Doador não encontrado.' using errcode = 'P0001'; end if;
  end if;
  return v_id;
exception
  when unique_violation then raise exception 'Já há um doador com este CPF/CNPJ.' using errcode = 'P0001';
  when check_violation then raise exception 'Algum campo está fora do permitido.' using errcode = 'P0001';
end $$;

-- O próximo número do ano (DOA-2026-0001 / ENT-2026-0001). Trava a config do espaço para não repetir.
create or replace function private.doa_proximo(p_workspace_id uuid, p_tabela text, p_ano integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v integer;
begin
  insert into public.pat_config (workspace_id) values (p_workspace_id) on conflict (workspace_id) do nothing;
  perform 1 from public.pat_config where workspace_id = p_workspace_id for update;
  if p_tabela = 'recebimento' then
    select coalesce(max(numero), 0) + 1 into v from public.doa_recebimentos where workspace_id = p_workspace_id and ano = p_ano;
  else
    select coalesce(max(numero), 0) + 1 into v from public.doa_entregas where workspace_id = p_workspace_id and ano = p_ano;
  end if;
  return v;
end $$;
revoke all on function private.doa_proximo(uuid, text, integer) from public, anon, authenticated;

-- Recebe uma doação: cada linha vira entrada no Estoque (material, pelo
-- valor de mercado) ou bem no Patrimônio. Linha de material pode trazer um
-- material novo ({novo: {nome, categoria_id, unidade, controla_validade}}).
create or replace function public.doacao_receber(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_data date;
  v_local uuid;
  v_doador public.doa_doadores;
  v_campanha uuid;
  v_ano integer;
  v_num integer;
  v_codigo text;
  v_nome text;
  l jsonb;
  v_item uuid;
  v_bem uuid;
  v_grupo uuid;
  v_qtd numeric;
  v_unit numeric;
  v_total numeric := 0;
  v_un text;
  v_desc text;
  k integer;
begin
  v_data := coalesce(nullif(p->>'data', '')::date, current_date);
  v_local := nullif(p->>'local_id', '')::uuid;
  v_campanha := nullif(p->>'campanha_id', '')::uuid;
  if (select private.nivel_patrimonio(p_workspace_id)) < 2 then raise exception 'Você não tem acesso para registrar doações.' using errcode = 'P0001'; end if;
  perform private.est_local_ok(p_workspace_id, v_local);
  perform private.est_conferir_data(p_workspace_id, v_data);
  if nullif(p->>'doador_id', '') is not null then
    select * into v_doador from public.doa_doadores where id = (p->>'doador_id')::uuid and workspace_id = p_workspace_id;
    if not found then raise exception 'Doador não encontrado.' using errcode = 'P0001'; end if;
  end if;
  if v_campanha is not null and not exists (select 1 from public.doa_campanhas where id = v_campanha and workspace_id = p_workspace_id and ativa) then
    raise exception 'Campanha inválida ou encerrada.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p->'itens') is distinct from 'array' or jsonb_array_length(p->'itens') = 0 then raise exception 'Inclua ao menos um item doado.' using errcode = 'P0001'; end if;
  if jsonb_array_length(p->'itens') > 200 then raise exception 'No máximo 200 itens por recibo.' using errcode = 'P0001'; end if;

  v_ano := extract(year from v_data)::integer;
  v_num := private.doa_proximo(p_workspace_id, 'recebimento', v_ano);
  v_codigo := format('DOA-%s-%s', v_ano, lpad(v_num::text, 4, '0'));
  v_nome := coalesce(v_doador.nome, 'Doador anônimo');
  insert into public.doa_recebimentos (workspace_id, ano, numero, codigo, doador_id, doador_nome, doador_documento, campanha_id, data, local_id, observacao, criado_por)
  values (p_workspace_id, v_ano, v_num, v_codigo, v_doador.id, v_nome, v_doador.documento, v_campanha, v_data, v_local, nullif(left(trim(coalesce(p->>'observacao', '')), 2000), ''), (select auth.uid()))
  returning id into v_id;

  for l in select * from jsonb_array_elements(p->'itens') loop
    v_qtd := (l->>'quantidade')::numeric;
    v_unit := nullif(l->>'valor_unitario', '')::numeric;
    if v_unit is null or v_unit < 0 then raise exception 'Informe o valor de mercado de cada item (ITG 2002).' using errcode = 'P0001'; end if;
    if l->>'tipo' = 'bem' then
      -- Cada unidade vira um bem, com plaqueta própria.
      v_qtd := coalesce(v_qtd, 1);
      if v_qtd < 1 or v_qtd > 50 or v_qtd <> trunc(v_qtd) then raise exception 'Bens: de 1 a 50 unidades por linha (cada uma ganha plaqueta).' using errcode = 'P0001'; end if;
      for k in 1..v_qtd::integer loop
        v_bem := public.patrimonio_salvar_bem(p_workspace_id, null, jsonb_build_object(
          'nome', l->>'nome', 'categoria_id', l->>'categoria_id', 'local_id', v_local, 'marca', l->>'marca', 'modelo', l->>'modelo',
          'numero_serie', case when v_qtd = 1 then l->>'numero_serie' end,
          'estado', coalesce(nullif(l->>'estado', ''), 'bom'), 'origem', 'doacao', 'aquisicao_em', v_data, 'valor', v_unit, 'fornecedor', v_nome, 'nota_fiscal', v_codigo,
          'projeto_id', (select projeto_id from public.doa_campanhas where id = v_campanha)));
        select plaqueta || ' ' || nome into v_desc from public.pat_bens where id = v_bem;
        insert into public.doa_recebimento_itens (workspace_id, recebimento_id, tipo, bem_id, descricao, quantidade, unidade, valor_unitario, valor_total)
        values (p_workspace_id, v_id, 'bem', v_bem, v_desc, 1, 'un', v_unit, v_unit);
        v_total := v_total + v_unit;
      end loop;
    elsif l->>'tipo' = 'material' then
      if v_qtd is null or v_qtd <= 0 then raise exception 'Informe a quantidade de cada material.' using errcode = 'P0001'; end if;
      v_item := nullif(l->>'item_id', '')::uuid;
      if v_item is null and jsonb_typeof(l->'novo') = 'object' then
        v_item := public.estoque_salvar_item(p_workspace_id, null, l->'novo');
      end if;
      if v_item is null then raise exception 'Escolha o material de cada linha.' using errcode = 'P0001'; end if;
      v_grupo := public.estoque_entrada(p_workspace_id, jsonb_build_object(
        'item_id', v_item, 'local_id', v_local, 'quantidade', v_qtd, 'custo_unitario', v_unit, 'origem', 'doacao', 'lote', l->>'lote', 'validade', l->>'validade',
        'data', v_data, 'detalhe', format('%s: %s', v_codigo, v_nome), 'documento', v_codigo,
        'projeto_id', (select projeto_id from public.doa_campanhas where id = v_campanha)));
      select nome, unidade into v_desc, v_un from public.est_itens where id = v_item;
      insert into public.doa_recebimento_itens (workspace_id, recebimento_id, tipo, item_id, grupo, descricao, quantidade, unidade, valor_unitario, valor_total, lote, validade)
      values (p_workspace_id, v_id, 'material', v_item, v_grupo, v_desc, v_qtd, v_un, v_unit, round(v_qtd * v_unit, 2), nullif(trim(coalesce(l->>'lote', '')), ''), nullif(l->>'validade', '')::date);
      v_total := v_total + round(v_qtd * v_unit, 2);
    else
      raise exception 'Tipo de item inválido.' using errcode = 'P0001';
    end if;
  end loop;
  update public.doa_recebimentos set valor_total = v_total where id = v_id;
  perform private.pat_registrar(p_workspace_id, null, 'doacao_recebida', jsonb_build_object('recebimento', v_id, 'codigo', v_codigo, 'valor', v_total));
  return v_id;
exception
  when invalid_text_representation or invalid_datetime_format then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
end $$;

-- Entrega a um beneficiário: cada linha é uma saída do Estoque (FEFO) com
-- finalidade "distribuição". Devolve o id e os itens que ficaram abaixo do mínimo.
create or replace function public.doacao_entregar(p_workspace_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_data date;
  v_local uuid;
  v_campanha uuid;
  v_projeto uuid;
  v_ano integer;
  v_num integer;
  v_codigo text;
  v_benef text;
  l jsonb;
  r jsonb;
  v_item uuid;
  v_qtd numeric;
  v_valor numeric;
  v_total numeric := 0;
  v_baixos jsonb := '[]'::jsonb;
begin
  v_data := coalesce(nullif(p->>'data', '')::date, current_date);
  v_local := nullif(p->>'local_id', '')::uuid;
  v_campanha := nullif(p->>'campanha_id', '')::uuid;
  v_projeto := nullif(p->>'projeto_id', '')::uuid;
  v_benef := trim(coalesce(p->>'beneficiario_nome', ''));
  if (select private.nivel_patrimonio(p_workspace_id)) < 2 then raise exception 'Você não tem acesso para registrar entregas.' using errcode = 'P0001'; end if;
  perform private.est_local_ok(p_workspace_id, v_local);
  perform private.est_conferir_data(p_workspace_id, v_data);
  if char_length(v_benef) < 2 then raise exception 'Diga quem recebeu.' using errcode = 'P0001'; end if;
  if v_campanha is not null and not exists (select 1 from public.doa_campanhas where id = v_campanha and workspace_id = p_workspace_id) then raise exception 'Campanha inválida.' using errcode = 'P0001'; end if;
  if v_projeto is null and v_campanha is not null then select projeto_id into v_projeto from public.doa_campanhas where id = v_campanha; end if;
  if jsonb_typeof(p->'itens') is distinct from 'array' or jsonb_array_length(p->'itens') = 0 then raise exception 'Inclua ao menos um item entregue.' using errcode = 'P0001'; end if;
  if jsonb_array_length(p->'itens') > 200 then raise exception 'No máximo 200 itens por termo.' using errcode = 'P0001'; end if;

  v_ano := extract(year from v_data)::integer;
  v_num := private.doa_proximo(p_workspace_id, 'entrega', v_ano);
  v_codigo := format('ENT-%s-%s', v_ano, lpad(v_num::text, 4, '0'));
  insert into public.doa_entregas (workspace_id, ano, numero, codigo, campanha_id, data, local_id, beneficiario_tipo, beneficiario_nome, beneficiario_documento, responsavel,
    pessoas, municipio, bairro, observacao, projeto_id, criado_por)
  values (p_workspace_id, v_ano, v_num, v_codigo, v_campanha, v_data, v_local, coalesce(nullif(p->>'beneficiario_tipo', ''), 'familia'), v_benef,
    nullif(trim(coalesce(p->>'beneficiario_documento', '')), ''), nullif(trim(coalesce(p->>'responsavel', '')), ''), nullif(p->>'pessoas', '')::integer,
    nullif(trim(coalesce(p->>'municipio', '')), ''), nullif(trim(coalesce(p->>'bairro', '')), ''), nullif(left(trim(coalesce(p->>'observacao', '')), 2000), ''), v_projeto, (select auth.uid()))
  returning id into v_id;

  for l in select * from jsonb_array_elements(p->'itens') loop
    v_item := (l->>'item_id')::uuid;
    v_qtd := (l->>'quantidade')::numeric;
    r := public.estoque_saida(p_workspace_id, jsonb_build_object('item_id', v_item, 'local_id', v_local, 'quantidade', v_qtd, 'finalidade', 'distribuicao',
      'detalhe', format('%s: %s', v_codigo, v_benef), 'projeto_id', v_projeto, 'data', v_data));
    select -coalesce(sum(valor), 0) into v_valor from public.est_movimentos where grupo = (r->>'grupo')::uuid;
    insert into public.doa_entrega_itens (workspace_id, entrega_id, item_id, grupo, descricao, quantidade, unidade, valor)
    select p_workspace_id, v_id, i.id, (r->>'grupo')::uuid, i.nome, v_qtd, i.unidade, v_valor from public.est_itens i where i.id = v_item;
    v_total := v_total + v_valor;
    if (r->>'cruzou_minimo')::boolean then v_baixos := v_baixos || jsonb_build_array(jsonb_build_object('item_id', v_item, 'saldo', r->'saldo', 'minimo', r->'minimo')); end if;
  end loop;
  update public.doa_entregas set valor_total = v_total where id = v_id;
  perform private.pat_registrar(p_workspace_id, null, 'doacao_entregue', jsonb_build_object('entrega', v_id, 'codigo', v_codigo, 'valor', v_total));
  return jsonb_build_object('id', v_id, 'codigo', v_codigo, 'abaixo_do_minimo', v_baixos);
exception
  when invalid_text_representation or invalid_datetime_format then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
  when check_violation then raise exception 'Algum campo está fora do permitido (tipo de beneficiário, número de pessoas).' using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------- Financeiro

-- As doações recebidas no período, linha a linha, para o pacote do contador
-- (receita de doação em espécie pelo valor de mercado, com o doador).
create or replace function public.financeiro_doacoes_do_periodo(p_workspace_id uuid, p_inicio date, p_fim date)
returns table (codigo text, data date, doador text, documento text, campanha text, tipo text, descricao text, quantidade numeric, unidade text,
  valor_unitario numeric, valor_total numeric)
language plpgsql security definer set search_path = '' stable as $$
begin
  if (select private.nivel_financeiro(p_workspace_id)) < 1 then raise exception 'Você não tem acesso ao Financeiro.' using errcode = 'P0001'; end if;
  return query
    select r.codigo, r.data, r.doador_nome, r.doador_documento, c.nome, it.tipo, it.descricao, it.quantidade, it.unidade, it.valor_unitario, it.valor_total
    from public.doa_recebimentos r
    join public.doa_recebimento_itens it on it.recebimento_id = r.id
    left join public.doa_campanhas c on c.id = r.campanha_id
    where r.workspace_id = p_workspace_id and r.data between p_inicio and p_fim
    order by r.data, r.numero, it.descricao;
end $$;

-- ---------------------------------------------------------------- permissões

revoke all on function public.doacao_salvar_campanha(uuid, jsonb) from public, anon;
revoke all on function public.doacao_salvar_doador(uuid, jsonb) from public, anon;
revoke all on function public.doacao_receber(uuid, jsonb) from public, anon;
revoke all on function public.doacao_entregar(uuid, jsonb) from public, anon;
revoke all on function public.financeiro_doacoes_do_periodo(uuid, date, date) from public, anon;
grant execute on function public.doacao_salvar_campanha(uuid, jsonb) to authenticated;
grant execute on function public.doacao_salvar_doador(uuid, jsonb) to authenticated;
grant execute on function public.doacao_receber(uuid, jsonb) to authenticated;
grant execute on function public.doacao_entregar(uuid, jsonb) to authenticated;
grant execute on function public.financeiro_doacoes_do_periodo(uuid, date, date) to authenticated;
