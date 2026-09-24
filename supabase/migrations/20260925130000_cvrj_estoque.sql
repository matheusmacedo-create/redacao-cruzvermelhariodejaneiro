-- Estoque de materiais (Patrimônio 2/4): itens de consumo com saldo por
-- local, lote e validade; entradas (compra, doação a valor justo), saídas
-- FEFO (o que vence primeiro sai primeiro), transferência, contagem, perda e
-- kits montados a partir dos componentes. Valor pelo custo médio ponderado,
-- e o movimento do mês vai para o fechamento do Financeiro.
--
-- Mesmo acesso do Patrimônio (pat_acesso): ver 1, operar 2, gestão 3.

-- ---------------------------------------------------------------- tabelas

alter table public.pat_config add column if not exists proximo_material integer not null default 1 check (proximo_material >= 1);

create table if not exists public.est_categorias (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  nome          text not null check (char_length(nome) between 2 and 80),
  conta_contabil text check (char_length(conta_contabil) <= 40),
  ativa         boolean not null default true,
  unique (workspace_id, nome)
);

create table if not exists public.est_itens (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces (id) on delete cascade,
  numero               integer not null,
  codigo               text not null,
  nome                 text not null check (char_length(nome) between 2 and 160),
  descricao            text check (char_length(descricao) <= 2000),
  categoria_id         uuid not null references public.est_categorias (id) on delete restrict,
  unidade              text not null default 'un' check (unidade in ('un','cx','pct','par','kg','g','L','mL','m','rolo','frasco','ampola','kit','fardo','cartela','tubo','dose','galao')),
  estoque_minimo       numeric(14,3) not null default 0 check (estoque_minimo >= 0),
  controla_validade    boolean not null default false,
  aviso_validade_dias  integer not null default 60 check (aviso_validade_dias between 1 and 365),
  eh_kit               boolean not null default false,
  -- Mantidos só pelas funções abaixo: quanto há (todos os locais) e quanto vale.
  saldo                numeric(14,3) not null default 0 check (saldo >= 0),
  valor_estoque        numeric(14,2) not null default 0 check (valor_estoque >= 0),
  ativo                boolean not null default true,
  criado_por           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (workspace_id, numero),
  unique (workspace_id, codigo)
);
create index if not exists est_itens_categoria_idx on public.est_itens (categoria_id);
create index if not exists est_itens_criado_idx on public.est_itens (criado_por);

create table if not exists public.est_composicao (
  kit_id         uuid not null references public.est_itens (id) on delete cascade,
  componente_id  uuid not null references public.est_itens (id) on delete restrict,
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  quantidade     numeric(14,3) not null check (quantidade > 0),
  primary key (kit_id, componente_id),
  check (kit_id <> componente_id)
);
create index if not exists est_composicao_componente_idx on public.est_composicao (componente_id);
create index if not exists est_composicao_workspace_idx on public.est_composicao (workspace_id);

-- O saldo de um item num local, por lote e validade (sem lote: lote = '').
create table if not exists public.est_saldos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  item_id       uuid not null references public.est_itens (id) on delete cascade,
  local_id      uuid not null references public.pat_locais (id) on delete restrict,
  lote          text not null default '' check (char_length(lote) <= 60),
  validade      date,
  quantidade    numeric(14,3) not null default 0 check (quantidade >= 0),
  updated_at    timestamptz not null default now(),
  unique nulls not distinct (item_id, local_id, lote, validade)
);
create index if not exists est_saldos_local_idx on public.est_saldos (local_id);
create index if not exists est_saldos_workspace_idx on public.est_saldos (workspace_id);
create index if not exists est_saldos_workspace_validade_idx on public.est_saldos (workspace_id, validade) where quantidade > 0;

create table if not exists public.est_movimentos (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  item_id        uuid not null references public.est_itens (id) on delete restrict,
  saldo_id       uuid not null references public.est_saldos (id) on delete restrict,
  local_id       uuid not null references public.pat_locais (id) on delete restrict,
  data           date not null,
  tipo           text not null check (tipo in ('entrada','saida','transferencia','ajuste','perda','montagem')),
  -- Com sinal: positivo entra, negativo sai. O valor segue o custo médio.
  quantidade     numeric(14,3) not null check (quantidade <> 0),
  valor          numeric(14,2) not null,
  origem         text check (origem in ('compra','doacao','outro')),
  finalidade     text check (finalidade in ('atendimento','distribuicao','uso_interno','evento','treinamento','outro')),
  causa          text check (causa in ('vencido','avariado','extravio','contagem','outro')),
  detalhe        text check (char_length(detalhe) <= 600),
  documento      text check (char_length(documento) <= 80),
  projeto_id     uuid references public.projects (id) on delete set null,
  fonte_id       uuid references public.fin_fontes (id) on delete set null,
  lancamento_id  uuid references public.fin_lancamentos (id) on delete set null,
  -- Movimentos da mesma operação (saída de vários lotes, transferência, montagem).
  grupo          uuid not null,
  criado_por     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists est_movimentos_item_idx on public.est_movimentos (item_id, data desc, created_at desc);
create index if not exists est_movimentos_workspace_data_idx on public.est_movimentos (workspace_id, data);
create index if not exists est_movimentos_saldo_idx on public.est_movimentos (saldo_id);
create index if not exists est_movimentos_local_idx on public.est_movimentos (local_id);
create index if not exists est_movimentos_grupo_idx on public.est_movimentos (grupo);
create index if not exists est_movimentos_projeto_idx on public.est_movimentos (projeto_id);
create index if not exists est_movimentos_fonte_idx on public.est_movimentos (fonte_id);
create index if not exists est_movimentos_lancamento_idx on public.est_movimentos (lancamento_id);
create index if not exists est_movimentos_criado_idx on public.est_movimentos (criado_por);

-- ---------------------------------------------------------------- leitura

alter table public.est_categorias enable row level security;
alter table public.est_itens enable row level security;
alter table public.est_composicao enable row level security;
alter table public.est_saldos enable row level security;
alter table public.est_movimentos enable row level security;

revoke all on public.est_categorias, public.est_itens, public.est_composicao, public.est_saldos, public.est_movimentos from anon, authenticated;
grant select on public.est_categorias, public.est_itens, public.est_composicao, public.est_saldos, public.est_movimentos to authenticated;

create policy est_categorias_select on public.est_categorias for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);
create policy est_itens_select on public.est_itens for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);
create policy est_composicao_select on public.est_composicao for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);
create policy est_saldos_select on public.est_saldos for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);
create policy est_movimentos_select on public.est_movimentos for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);

-- ---------------------------------------------------------------- sementes

create or replace function private.semear_patrimonio(p_workspace_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pat_config (workspace_id) values (p_workspace_id) on conflict (workspace_id) do nothing;
  insert into public.pat_locais (workspace_id, nome, descricao) values (p_workspace_id, 'Sede', 'Sede da filial') on conflict (workspace_id, nome) do nothing;
  if not exists (select 1 from public.est_categorias where workspace_id = p_workspace_id) then
    insert into public.est_categorias (workspace_id, nome)
    select p_workspace_id, c.nome
    from (values
      ('Primeiros socorros e curativos'), ('Medicamentos'), ('EPI (luvas, máscaras, aventais)'), ('Higiene pessoal'), ('Limpeza'),
      ('Alimentos'), ('Água'), ('Kits humanitários'), ('Roupas e cobertores'), ('Uniformes e identificação'), ('Material de escritório'), ('Outros materiais')
    ) as c (nome);
  end if;
  if exists (select 1 from public.pat_categorias where workspace_id = p_workspace_id) then return; end if;
  insert into public.pat_categorias (workspace_id, nome, vida_util_meses, manutencao_meses)
  select p_workspace_id, c.nome, c.vida, c.manut
  from (values
    ('Equipamentos médicos e de resgate', 120, 12),
    ('Desfibriladores (DEA)', 120, 6),
    ('Rádios e comunicação', 60, null),
    ('Computadores e periféricos', 60, null),
    ('Celulares e tablets', 60, null),
    ('Móveis e utensílios', 120, null),
    ('Máquinas e equipamentos', 120, 12),
    ('Eletrodomésticos', 120, null),
    ('Tendas, barracas e estruturas', 60, null),
    ('Ferramentas', 60, null),
    ('Veículos', 60, 6),
    ('Extintores e segurança', 120, 12),
    ('Outros bens', 120, null)
  ) as c (nome, vida, manut);
end $$;
revoke all on function private.semear_patrimonio(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- núcleo

-- A data do movimento: não no futuro e não num mês já fechado no Financeiro.
create or replace function private.est_conferir_data(p_workspace_id uuid, p_data date)
returns void language plpgsql security definer set search_path = '' stable as $$
begin
  if p_data is null or p_data > current_date + 1 then raise exception 'Data inválida.' using errcode = 'P0001'; end if;
  if p_data < current_date - 366 then raise exception 'Data muito antiga.' using errcode = 'P0001'; end if;
  if private.fin_fechado(p_workspace_id, p_data) then
    raise exception 'Esta data está num mês já fechado no Financeiro.' using errcode = 'P0001';
  end if;
end $$;
revoke all on function private.est_conferir_data(uuid, date) from public, anon, authenticated;

-- Põe quantidade num saldo (cria o lote se preciso) e registra o movimento.
create or replace function private.est_somar(p_workspace_id uuid, p_item uuid, p_local uuid, p_lote text, p_validade date, p_qtd numeric, p_valor numeric,
  p_data date, p_tipo text, p_grupo uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_saldo uuid;
begin
  insert into public.est_saldos (workspace_id, item_id, local_id, lote, validade, quantidade)
  values (p_workspace_id, p_item, p_local, coalesce(p_lote, ''), p_validade, p_qtd)
  on conflict (item_id, local_id, lote, validade) do update set quantidade = public.est_saldos.quantidade + excluded.quantidade, updated_at = now()
  returning id into v_saldo;
  update public.est_itens set saldo = saldo + p_qtd, valor_estoque = valor_estoque + p_valor, updated_at = now() where id = p_item;
  insert into public.est_movimentos (workspace_id, item_id, saldo_id, local_id, data, tipo, quantidade, valor, origem, finalidade, causa, detalhe, documento,
    projeto_id, fonte_id, lancamento_id, grupo, criado_por)
  values (p_workspace_id, p_item, v_saldo, p_local, p_data, p_tipo, p_qtd, p_valor, nullif(p->>'origem', ''), nullif(p->>'finalidade', ''), nullif(p->>'causa', ''),
    nullif(left(trim(coalesce(p->>'detalhe', '')), 600), ''), nullif(left(trim(coalesce(p->>'documento', '')), 80), ''),
    nullif(p->>'projeto_id', '')::uuid, nullif(p->>'fonte_id', '')::uuid, nullif(p->>'lancamento_id', '')::uuid, p_grupo, (select auth.uid()));
  return v_saldo;
end $$;
revoke all on function private.est_somar(uuid, uuid, uuid, text, date, numeric, numeric, date, text, uuid, jsonb) from public, anon, authenticated;

-- Tira de um saldo pelo custo médio do item (tirando tudo, leva o valor
-- inteiro: sem sobra de centavos). Devolve o valor tirado (positivo).
create or replace function private.est_tirar(p_saldo uuid, p_qtd numeric, p_data date, p_tipo text, p_grupo uuid, p jsonb)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  s public.est_saldos;
  i public.est_itens;
  v_valor numeric;
begin
  select * into s from public.est_saldos where id = p_saldo for update;
  if s.quantidade < p_qtd then raise exception 'Não há tudo isso neste lote (há %).', trim(to_char(s.quantidade, 'FM999999990.###')) using errcode = 'P0001'; end if;
  select * into i from public.est_itens where id = s.item_id;
  v_valor := case when p_qtd >= i.saldo then i.valor_estoque else least(i.valor_estoque, round(p_qtd * i.valor_estoque / nullif(i.saldo, 0), 2)) end;
  update public.est_saldos set quantidade = quantidade - p_qtd, updated_at = now() where id = s.id;
  update public.est_itens set saldo = saldo - p_qtd, valor_estoque = valor_estoque - coalesce(v_valor, 0), updated_at = now() where id = i.id;
  insert into public.est_movimentos (workspace_id, item_id, saldo_id, local_id, data, tipo, quantidade, valor, origem, finalidade, causa, detalhe, documento,
    projeto_id, fonte_id, lancamento_id, grupo, criado_por)
  values (s.workspace_id, s.item_id, s.id, s.local_id, p_data, p_tipo, -p_qtd, -coalesce(v_valor, 0), nullif(p->>'origem', ''), nullif(p->>'finalidade', ''), nullif(p->>'causa', ''),
    nullif(left(trim(coalesce(p->>'detalhe', '')), 600), ''), nullif(left(trim(coalesce(p->>'documento', '')), 80), ''),
    nullif(p->>'projeto_id', '')::uuid, nullif(p->>'fonte_id', '')::uuid, nullif(p->>'lancamento_id', '')::uuid, p_grupo, (select auth.uid()));
  return coalesce(v_valor, 0);
end $$;
revoke all on function private.est_tirar(uuid, numeric, date, text, uuid, jsonb) from public, anon, authenticated;

-- Tira do item num local seguindo FEFO: primeiro o que vence antes; o que não
-- tem validade, por último; vencido não sai (isso é perda).
create or replace function private.est_consumir(p_workspace_id uuid, p_item uuid, p_local uuid, p_qtd numeric, p_data date, p_tipo text, p_grupo uuid, p jsonb,
  out o_valor numeric, out o_validade date)
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_falta numeric := p_qtd;
  v_parte numeric;
  v_vencido numeric;
  v_nome text;
  v_un text;
begin
  o_valor := 0;
  for r in
    select s.id, s.quantidade, s.validade from public.est_saldos s
    where s.item_id = p_item and s.local_id = p_local and s.quantidade > 0 and (s.validade is null or s.validade >= p_data)
    order by s.validade nulls last, s.lote, s.id
  loop
    exit when v_falta <= 0;
    v_parte := least(v_falta, r.quantidade);
    o_valor := o_valor + private.est_tirar(r.id, v_parte, p_data, p_tipo, p_grupo, p);
    if r.validade is not null and (o_validade is null or r.validade < o_validade) then o_validade := r.validade; end if;
    v_falta := v_falta - v_parte;
  end loop;
  if v_falta > 0 then
    select nome, unidade into v_nome, v_un from public.est_itens where id = p_item;
    select coalesce(sum(quantidade), 0) into v_vencido from public.est_saldos where item_id = p_item and local_id = p_local and quantidade > 0 and validade < p_data;
    raise exception 'Não há % suficiente neste local: faltam % %.%', v_nome, trim(to_char(v_falta, 'FM999999990.###')), v_un,
      case when v_vencido > 0 then format(' Há %s %s vencidos: registre a perda deles.', trim(to_char(v_vencido, 'FM999999990.###')), v_un) else '' end
      using errcode = 'P0001';
  end if;
end $$;
revoke all on function private.est_consumir(uuid, uuid, uuid, numeric, date, text, uuid, jsonb) from public, anon, authenticated;

-- Confere o que vem de fora (projeto, fonte, lançamento) e devolve só o que vale.
create or replace function private.est_extra(p_workspace_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare
  v_projeto uuid := nullif(p->>'projeto_id', '')::uuid;
  v_fonte uuid := nullif(p->>'fonte_id', '')::uuid;
  v_lanc uuid := nullif(p->>'lancamento_id', '')::uuid;
begin
  if v_projeto is not null and not exists (select 1 from public.projects where id = v_projeto and workspace_id = p_workspace_id) then raise exception 'Projeto inválido.' using errcode = 'P0001'; end if;
  if v_fonte is not null and not exists (select 1 from public.fin_fontes where id = v_fonte and workspace_id = p_workspace_id) then raise exception 'Fonte inválida.' using errcode = 'P0001'; end if;
  if v_lanc is not null and not exists (select 1 from public.fin_lancamentos where id = v_lanc and workspace_id = p_workspace_id) then raise exception 'Lançamento inválido.' using errcode = 'P0001'; end if;
  return jsonb_build_object('detalhe', p->>'detalhe', 'documento', p->>'documento', 'projeto_id', v_projeto, 'fonte_id', v_fonte, 'lancamento_id', v_lanc,
    'origem', p->>'origem', 'finalidade', p->>'finalidade', 'causa', p->>'causa');
end $$;
revoke all on function private.est_extra(uuid, jsonb) from public, anon, authenticated;

create or replace function private.est_local_ok(p_workspace_id uuid, p_local uuid)
returns void language plpgsql security definer set search_path = '' stable as $$
begin
  if p_local is null or not exists (select 1 from public.pat_locais where id = p_local and workspace_id = p_workspace_id) then
    raise exception 'Escolha o local.' using errcode = 'P0001';
  end if;
end $$;
revoke all on function private.est_local_ok(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- escrita

create or replace function public.estoque_salvar_categoria(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  v_id := nullif(p->>'id', '')::uuid;
  if (select private.nivel_patrimonio(p_workspace_id)) < 3 then raise exception 'Só a gestão do Patrimônio mexe nas categorias.' using errcode = 'P0001'; end if;
  if v_id is null then
    insert into public.est_categorias (workspace_id, nome, conta_contabil) values (p_workspace_id, trim(p->>'nome'), nullif(trim(p->>'conta_contabil'), '')) returning id into v_id;
  else
    update public.est_categorias set nome = trim(p->>'nome'), conta_contabil = nullif(trim(p->>'conta_contabil'), ''), ativa = coalesce((p->>'ativa')::boolean, ativa)
    where id = v_id and workspace_id = p_workspace_id;
    if not found then raise exception 'Categoria não encontrada.' using errcode = 'P0001'; end if;
  end if;
  perform private.pat_registrar(p_workspace_id, null, 'cadastro', jsonb_build_object('tabela', 'categoria_estoque', 'id', v_id));
  return v_id;
exception
  when unique_violation then raise exception 'Já existe uma categoria com este nome.' using errcode = 'P0001';
  when check_violation then raise exception 'Algum campo está fora do permitido.' using errcode = 'P0001';
end $$;

create or replace function public.estoque_salvar_item(p_workspace_id uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_nivel integer := (select private.nivel_patrimonio(p_workspace_id));
  v_atual public.est_itens;
  v_num integer;
  v_cat uuid;
  v_kit boolean;
  c jsonb;
begin
  v_cat := nullif(p->>'categoria_id', '')::uuid;
  v_kit := coalesce((p->>'eh_kit')::boolean, false);
  if v_nivel < 2 then raise exception 'Você não tem acesso para cadastrar itens.' using errcode = 'P0001'; end if;
  if v_cat is null or not exists (select 1 from public.est_categorias where id = v_cat and workspace_id = p_workspace_id) then raise exception 'Escolha a categoria.' using errcode = 'P0001'; end if;
  if v_id is null then
    insert into public.pat_config (workspace_id) values (p_workspace_id) on conflict (workspace_id) do nothing;
    select proximo_material into v_num from public.pat_config where workspace_id = p_workspace_id for update;
    insert into public.est_itens (workspace_id, numero, codigo, nome, descricao, categoria_id, unidade, estoque_minimo, controla_validade, aviso_validade_dias, eh_kit, criado_por)
    values (p_workspace_id, v_num, 'MAT-' || lpad(v_num::text, 5, '0'), trim(p->>'nome'), nullif(trim(p->>'descricao'), ''), v_cat, coalesce(nullif(p->>'unidade', ''), 'un'),
      coalesce(nullif(p->>'estoque_minimo', '')::numeric, 0), coalesce((p->>'controla_validade')::boolean, false), coalesce(nullif(p->>'aviso_validade_dias', '')::integer, 60),
      v_kit, (select auth.uid()))
    returning id into v_id;
    update public.pat_config set proximo_material = proximo_material + 1 where workspace_id = p_workspace_id;
    perform private.pat_registrar(p_workspace_id, null, 'estoque_item', jsonb_build_object('item', v_id, 'nome', trim(p->>'nome'), 'acao', 'cadastrar'));
  else
    select * into v_atual from public.est_itens where id = v_id and workspace_id = p_workspace_id for update;
    if not found then raise exception 'Item não encontrado.' using errcode = 'P0001'; end if;
    if coalesce((p->>'ativo')::boolean, true) = false and v_atual.ativo and v_nivel < 3 then raise exception 'Só a gestão arquiva itens.' using errcode = 'P0001'; end if;
    if coalesce((p->>'ativo')::boolean, true) = false and v_atual.saldo > 0 then raise exception 'Ainda há saldo deste item: zere o estoque antes de arquivar.' using errcode = 'P0001'; end if;
    if v_kit and exists (select 1 from public.est_composicao where componente_id = v_id) then raise exception 'Este item é componente de um kit e não pode virar kit.' using errcode = 'P0001'; end if;
    update public.est_itens set nome = trim(p->>'nome'), descricao = nullif(trim(p->>'descricao'), ''), categoria_id = v_cat, unidade = coalesce(nullif(p->>'unidade', ''), unidade),
      estoque_minimo = coalesce(nullif(p->>'estoque_minimo', '')::numeric, 0), controla_validade = coalesce((p->>'controla_validade')::boolean, controla_validade),
      aviso_validade_dias = coalesce(nullif(p->>'aviso_validade_dias', '')::integer, aviso_validade_dias), eh_kit = v_kit,
      ativo = coalesce((p->>'ativo')::boolean, ativo), updated_at = now()
    where id = v_id;
    perform private.pat_registrar(p_workspace_id, null, 'estoque_item', jsonb_build_object('item', v_id, 'nome', trim(p->>'nome'), 'acao', 'editar'));
  end if;

  delete from public.est_composicao where kit_id = v_id;
  if v_kit then
    if jsonb_typeof(p->'componentes') is distinct from 'array' or jsonb_array_length(p->'componentes') = 0 then
      raise exception 'Diga o que vai em cada kit.' using errcode = 'P0001';
    end if;
    for c in select * from jsonb_array_elements(p->'componentes') loop
      if not exists (select 1 from public.est_itens where id = (c->>'item_id')::uuid and workspace_id = p_workspace_id and not eh_kit) then
        raise exception 'Componente inválido (um kit não entra em outro kit).' using errcode = 'P0001';
      end if;
      insert into public.est_composicao (kit_id, componente_id, workspace_id, quantidade) values (v_id, (c->>'item_id')::uuid, p_workspace_id, (c->>'quantidade')::numeric)
      on conflict (kit_id, componente_id) do update set quantidade = public.est_composicao.quantidade + excluded.quantidade;
    end loop;
  end if;
  return v_id;
exception
  when check_violation then raise exception 'Algum campo está fora do permitido (quantidades positivas, aviso de validade de 1 a 365 dias).' using errcode = 'P0001';
  when invalid_text_representation then raise exception 'Algum número está em formato inválido.' using errcode = 'P0001';
end $$;

create or replace function public.estoque_entrada(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  i public.est_itens;
  v_grupo uuid := gen_random_uuid();
  v_qtd numeric;
  v_custo numeric;
  v_origem text := coalesce(nullif(p->>'origem', ''), 'compra');
  v_validade date;
  v_data date;
  v_local uuid;
  v_extra jsonb;
begin
  v_qtd := (p->>'quantidade')::numeric;
  v_custo := nullif(p->>'custo_unitario', '')::numeric;
  v_validade := nullif(p->>'validade', '')::date;
  v_data := coalesce(nullif(p->>'data', '')::date, current_date);
  v_local := nullif(p->>'local_id', '')::uuid;
  if (select private.nivel_patrimonio(p_workspace_id)) < 2 then raise exception 'Você não tem acesso para movimentar o estoque.' using errcode = 'P0001'; end if;
  select * into i from public.est_itens where id = (p->>'item_id')::uuid and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Item não encontrado.' using errcode = 'P0001'; end if;
  if not i.ativo then raise exception 'Item arquivado.' using errcode = 'P0001'; end if;
  perform private.est_local_ok(p_workspace_id, v_local);
  perform private.est_conferir_data(p_workspace_id, v_data);
  if v_qtd is null or v_qtd <= 0 then raise exception 'Informe a quantidade.' using errcode = 'P0001'; end if;
  if v_origem not in ('compra','doacao','outro') then raise exception 'Origem inválida.' using errcode = 'P0001'; end if;
  if v_origem in ('compra','doacao') and v_custo is null then
    raise exception '%', case when v_origem = 'doacao' then 'Doação entra pelo valor de mercado (ITG 2002): informe o valor unitário.' else 'Informe quanto custou cada unidade.' end using errcode = 'P0001';
  end if;
  if v_custo is not null and v_custo < 0 then raise exception 'Valor inválido.' using errcode = 'P0001'; end if;
  if i.controla_validade and v_validade is null then raise exception 'Este item controla validade: informe a data.' using errcode = 'P0001'; end if;
  if v_validade is not null and v_validade < v_data then raise exception 'Material vencido não entra no estoque.' using errcode = 'P0001'; end if;
  v_extra := private.est_extra(p_workspace_id, p) || jsonb_build_object('origem', v_origem, 'finalidade', null, 'causa', null);
  perform private.est_somar(p_workspace_id, i.id, v_local, left(trim(coalesce(p->>'lote', '')), 60), v_validade, v_qtd,
    round(v_qtd * coalesce(v_custo, case when i.saldo > 0 then i.valor_estoque / i.saldo else 0 end), 2), v_data, 'entrada', v_grupo, v_extra);
  return v_grupo;
exception
  when invalid_text_representation or invalid_datetime_format then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
end $$;

-- Saída para uso: FEFO no local (ou um lote escolhido). Devolve o saldo do
-- item e se ele acabou de ficar abaixo do mínimo (quem chama avisa).
create or replace function public.estoque_saida(p_workspace_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  i public.est_itens;
  v_grupo uuid := gen_random_uuid();
  v_qtd numeric;
  v_data date;
  v_local uuid;
  v_saldo uuid;
  v_antes numeric;
  v_extra jsonb;
  s public.est_saldos;
begin
  v_qtd := (p->>'quantidade')::numeric;
  v_data := coalesce(nullif(p->>'data', '')::date, current_date);
  v_local := nullif(p->>'local_id', '')::uuid;
  v_saldo := nullif(p->>'saldo_id', '')::uuid;
  if (select private.nivel_patrimonio(p_workspace_id)) < 2 then raise exception 'Você não tem acesso para movimentar o estoque.' using errcode = 'P0001'; end if;
  select * into i from public.est_itens where id = (p->>'item_id')::uuid and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Item não encontrado.' using errcode = 'P0001'; end if;
  perform private.est_conferir_data(p_workspace_id, v_data);
  if v_qtd is null or v_qtd <= 0 then raise exception 'Informe a quantidade.' using errcode = 'P0001'; end if;
  if coalesce(p->>'finalidade', '') not in ('atendimento','distribuicao','uso_interno','evento','treinamento','outro') then raise exception 'Diga para que foi.' using errcode = 'P0001'; end if;
  v_extra := private.est_extra(p_workspace_id, p) || jsonb_build_object('origem', null, 'causa', null, 'fonte_id', null, 'lancamento_id', null);
  v_antes := i.saldo;
  if v_saldo is not null then
    select * into s from public.est_saldos where id = v_saldo and item_id = i.id;
    if not found then raise exception 'Lote não encontrado.' using errcode = 'P0001'; end if;
    if s.validade is not null and s.validade < v_data then raise exception 'Este lote está vencido: registre a perda.' using errcode = 'P0001'; end if;
    perform private.est_tirar(s.id, v_qtd, v_data, 'saida', v_grupo, v_extra);
  else
    perform private.est_local_ok(p_workspace_id, v_local);
    perform private.est_consumir(p_workspace_id, i.id, v_local, v_qtd, v_data, 'saida', v_grupo, v_extra);
  end if;
  return jsonb_build_object('grupo', v_grupo, 'saldo', v_antes - v_qtd, 'minimo', i.estoque_minimo,
    'cruzou_minimo', i.estoque_minimo > 0 and v_antes >= i.estoque_minimo and v_antes - v_qtd < i.estoque_minimo);
exception
  when invalid_text_representation or invalid_datetime_format then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
end $$;

create or replace function public.estoque_transferir(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s public.est_saldos;
  v_grupo uuid := gen_random_uuid();
  v_qtd numeric;
  v_destino uuid;
  v_data date;
  v_valor numeric;
  v_extra jsonb;
begin
  v_qtd := (p->>'quantidade')::numeric;
  v_destino := nullif(p->>'local_id', '')::uuid;
  v_data := coalesce(nullif(p->>'data', '')::date, current_date);
  if (select private.nivel_patrimonio(p_workspace_id)) < 2 then raise exception 'Você não tem acesso para movimentar o estoque.' using errcode = 'P0001'; end if;
  select * into s from public.est_saldos where id = (p->>'saldo_id')::uuid and workspace_id = p_workspace_id;
  if not found then raise exception 'Lote não encontrado.' using errcode = 'P0001'; end if;
  perform 1 from public.est_itens where id = s.item_id for update;
  perform private.est_local_ok(p_workspace_id, v_destino);
  if v_destino = s.local_id then raise exception 'Escolha outro local.' using errcode = 'P0001'; end if;
  perform private.est_conferir_data(p_workspace_id, v_data);
  if v_qtd is null or v_qtd <= 0 then raise exception 'Informe a quantidade.' using errcode = 'P0001'; end if;
  v_extra := jsonb_build_object('detalhe', p->>'detalhe');
  v_valor := private.est_tirar(s.id, v_qtd, v_data, 'transferencia', v_grupo, v_extra);
  perform private.est_somar(p_workspace_id, s.item_id, v_destino, s.lote, s.validade, v_qtd, v_valor, v_data, 'transferencia', v_grupo, v_extra);
  return v_grupo;
exception
  when invalid_text_representation or invalid_datetime_format then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
end $$;

-- Contagem: informa quanto há de fato no lote; a diferença vira ajuste.
create or replace function public.estoque_contar(p_workspace_id uuid, p jsonb)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  s public.est_saldos;
  i public.est_itens;
  v_contada numeric;
  v_dif numeric;
  v_grupo uuid := gen_random_uuid();
  v_data date := current_date;
  v_extra jsonb := jsonb_build_object('causa', 'contagem', 'detalhe', p->>'detalhe');
begin
  v_contada := (p->>'quantidade')::numeric;
  if (select private.nivel_patrimonio(p_workspace_id)) < 2 then raise exception 'Você não tem acesso para movimentar o estoque.' using errcode = 'P0001'; end if;
  select * into s from public.est_saldos where id = (p->>'saldo_id')::uuid and workspace_id = p_workspace_id;
  if not found then raise exception 'Lote não encontrado.' using errcode = 'P0001'; end if;
  select * into i from public.est_itens where id = s.item_id for update;
  perform private.est_conferir_data(p_workspace_id, v_data);
  if v_contada is null or v_contada < 0 then raise exception 'Informe quanto foi contado.' using errcode = 'P0001'; end if;
  select quantidade into v_dif from public.est_saldos where id = s.id;
  v_dif := v_contada - v_dif;
  if v_dif = 0 then return 0; end if;
  if char_length(trim(coalesce(p->>'detalhe', ''))) < 3 then raise exception 'A contagem deu diferente: diga o que pode ter acontecido.' using errcode = 'P0001'; end if;
  if v_dif > 0 then
    perform private.est_somar(p_workspace_id, i.id, s.local_id, s.lote, s.validade, v_dif, round(v_dif * case when i.saldo > 0 then i.valor_estoque / i.saldo else 0 end, 2),
      v_data, 'ajuste', v_grupo, v_extra);
  else
    perform private.est_tirar(s.id, -v_dif, v_data, 'ajuste', v_grupo, v_extra);
  end if;
  return v_dif;
exception
  when invalid_text_representation then raise exception 'Quantidade inválida.' using errcode = 'P0001';
end $$;

create or replace function public.estoque_perda(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s public.est_saldos;
  v_qtd numeric;
  v_grupo uuid := gen_random_uuid();
  v_data date;
begin
  v_qtd := (p->>'quantidade')::numeric;
  v_data := coalesce(nullif(p->>'data', '')::date, current_date);
  if (select private.nivel_patrimonio(p_workspace_id)) < 2 then raise exception 'Você não tem acesso para movimentar o estoque.' using errcode = 'P0001'; end if;
  select * into s from public.est_saldos where id = (p->>'saldo_id')::uuid and workspace_id = p_workspace_id;
  if not found then raise exception 'Lote não encontrado.' using errcode = 'P0001'; end if;
  perform 1 from public.est_itens where id = s.item_id for update;
  perform private.est_conferir_data(p_workspace_id, v_data);
  if v_qtd is null or v_qtd <= 0 then raise exception 'Informe a quantidade.' using errcode = 'P0001'; end if;
  if coalesce(p->>'causa', '') not in ('vencido','avariado','extravio','outro') then raise exception 'Diga o que aconteceu.' using errcode = 'P0001'; end if;
  perform private.est_tirar(s.id, v_qtd, v_data, 'perda', v_grupo, jsonb_build_object('causa', p->>'causa', 'detalhe', p->>'detalhe'));
  return v_grupo;
exception
  when invalid_text_representation or invalid_datetime_format then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
end $$;

-- Montar kits: tira os componentes (FEFO) do local e põe os kits prontos no
-- mesmo local. O kit vale o que os componentes valiam e vence quando vence o
-- primeiro componente.
create or replace function public.estoque_montar_kit(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  k public.est_itens;
  c record;
  r record;
  v_n numeric;
  v_local uuid;
  v_data date;
  v_grupo uuid := gen_random_uuid();
  v_valor numeric := 0;
  v_validade date;
  v_extra jsonb;
begin
  v_n := (p->>'quantidade')::numeric;
  v_local := nullif(p->>'local_id', '')::uuid;
  v_data := coalesce(nullif(p->>'data', '')::date, current_date);
  if (select private.nivel_patrimonio(p_workspace_id)) < 2 then raise exception 'Você não tem acesso para movimentar o estoque.' using errcode = 'P0001'; end if;
  select * into k from public.est_itens where id = (p->>'kit_id')::uuid and workspace_id = p_workspace_id and eh_kit for update;
  if not found then raise exception 'Kit não encontrado.' using errcode = 'P0001'; end if;
  if not k.ativo then raise exception 'Kit arquivado.' using errcode = 'P0001'; end if;
  perform private.est_local_ok(p_workspace_id, v_local);
  perform private.est_conferir_data(p_workspace_id, v_data);
  if v_n is null or v_n <= 0 or v_n <> trunc(v_n) then raise exception 'Informe quantos kits (número inteiro).' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.est_composicao where kit_id = k.id) then raise exception 'O kit não tem componentes.' using errcode = 'P0001'; end if;
  v_extra := jsonb_build_object('detalhe', coalesce(nullif(trim(p->>'detalhe'), ''), format('Montagem de %s × %s', trim(to_char(v_n, 'FM999999990')), k.nome)));
  for c in select componente_id, quantidade from public.est_composicao where kit_id = k.id order by componente_id loop
    perform 1 from public.est_itens where id = c.componente_id for update;
    select * into r from private.est_consumir(p_workspace_id, c.componente_id, v_local, c.quantidade * v_n, v_data, 'montagem', v_grupo, v_extra);
    v_valor := v_valor + r.o_valor;
    if r.o_validade is not null and (v_validade is null or r.o_validade < v_validade) then v_validade := r.o_validade; end if;
  end loop;
  perform private.est_somar(p_workspace_id, k.id, v_local, '', v_validade, v_n, v_valor, v_data, 'montagem', v_grupo, v_extra);
  return v_grupo;
exception
  when invalid_text_representation or invalid_datetime_format then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------- Financeiro

-- O estoque no mês, item a item, para o fechamento (valor pelo custo médio).
create or replace function public.financeiro_estoque_do_mes(p_workspace_id uuid, p_inicio date, p_fim date)
returns table (item_id uuid, codigo text, nome text, categoria text, conta_contabil text, unidade text,
  qtd_inicio numeric, valor_inicio numeric, compras numeric, doacoes numeric, outras_entradas numeric, consumo numeric, perdas numeric, ajustes numeric,
  kits numeric, qtd_fim numeric, valor_fim numeric)
language plpgsql security definer set search_path = '' stable as $$
begin
  if (select private.nivel_financeiro(p_workspace_id)) < 1 then raise exception 'Você não tem acesso ao Financeiro.' using errcode = 'P0001'; end if;
  return query
    select i.id, i.codigo, i.nome, c.nome, c.conta_contabil, i.unidade,
      coalesce(sum(m.quantidade) filter (where m.data < p_inicio), 0),
      coalesce(sum(m.valor) filter (where m.data < p_inicio), 0),
      coalesce(sum(m.valor) filter (where m.data between p_inicio and p_fim and m.tipo = 'entrada' and m.origem = 'compra'), 0),
      coalesce(sum(m.valor) filter (where m.data between p_inicio and p_fim and m.tipo = 'entrada' and m.origem = 'doacao'), 0),
      coalesce(sum(m.valor) filter (where m.data between p_inicio and p_fim and m.tipo = 'entrada' and m.origem = 'outro'), 0),
      coalesce(-sum(m.valor) filter (where m.data between p_inicio and p_fim and m.tipo = 'saida'), 0),
      coalesce(-sum(m.valor) filter (where m.data between p_inicio and p_fim and m.tipo = 'perda'), 0),
      coalesce(sum(m.valor) filter (where m.data between p_inicio and p_fim and m.tipo = 'ajuste'), 0),
      coalesce(sum(m.valor) filter (where m.data between p_inicio and p_fim and m.tipo = 'montagem'), 0),
      coalesce(sum(m.quantidade) filter (where m.data <= p_fim), 0),
      coalesce(sum(m.valor) filter (where m.data <= p_fim), 0)
    from public.est_itens i
    join public.est_categorias c on c.id = i.categoria_id
    join public.est_movimentos m on m.item_id = i.id and m.data <= p_fim
    where i.workspace_id = p_workspace_id
    group by i.id, i.codigo, i.nome, c.nome, c.conta_contabil, i.unidade, i.numero
    order by i.numero;
end $$;

-- ---------------------------------------------------------------- permissões

revoke all on function public.estoque_salvar_categoria(uuid, jsonb) from public, anon;
revoke all on function public.estoque_salvar_item(uuid, uuid, jsonb) from public, anon;
revoke all on function public.estoque_entrada(uuid, jsonb) from public, anon;
revoke all on function public.estoque_saida(uuid, jsonb) from public, anon;
revoke all on function public.estoque_transferir(uuid, jsonb) from public, anon;
revoke all on function public.estoque_contar(uuid, jsonb) from public, anon;
revoke all on function public.estoque_perda(uuid, jsonb) from public, anon;
revoke all on function public.estoque_montar_kit(uuid, jsonb) from public, anon;
revoke all on function public.financeiro_estoque_do_mes(uuid, date, date) from public, anon;
grant execute on function public.estoque_salvar_categoria(uuid, jsonb) to authenticated;
grant execute on function public.estoque_salvar_item(uuid, uuid, jsonb) to authenticated;
grant execute on function public.estoque_entrada(uuid, jsonb) to authenticated;
grant execute on function public.estoque_saida(uuid, jsonb) to authenticated;
grant execute on function public.estoque_transferir(uuid, jsonb) to authenticated;
grant execute on function public.estoque_contar(uuid, jsonb) to authenticated;
grant execute on function public.estoque_perda(uuid, jsonb) to authenticated;
grant execute on function public.estoque_montar_kit(uuid, jsonb) to authenticated;
grant execute on function public.financeiro_estoque_do_mes(uuid, date, date) to authenticated;

do $$
declare w uuid;
begin
  for w in select id from public.workspaces loop perform private.semear_patrimonio(w); end loop;
end $$;
