-- Patrimônio: os bens duráveis da filial (rádios, desfibriladores, macas,
-- computadores, móveis, veículos), no modelo do Snipe-IT: cada bem tem
-- plaqueta com QR, lugar, estado, quem responde por ele, manutenções,
-- histórico e depreciação; o inventário físico confere bem a bem pelo QR.
--
-- O que é próprio da filial:
--  - Cautela (termo de responsabilidade) para funcionário OU voluntário. O
--    funcionário aceita no Redação; o voluntário, na Área do Voluntário.
--  - Bem comprado com dinheiro de convênio fica ligado à fonte (fin_fontes):
--    na prestação de contas, o financiador pergunta onde está o que comprou.
--  - Doação de bem entra pelo valor de mercado (ITG 2002) e deprecia igual.
--  - Depreciação linear por categoria (vida útil e valor residual), que o
--    Financeiro leva ao pacote do contador.
--
-- Níveis (pat_acesso; admin do espaço = 3):
--   1 ver     → bens, cautelas, manutenções e histórico
--   2 operar  → + cadastrar e editar bens, entregar e receber, manutenção,
--               conferir no inventário
--   3 gestão  → + categorias, locais, baixa de bem, concluir inventário

-- ---------------------------------------------------------------- tabelas

create table if not exists public.pat_config (
  workspace_id    uuid primary key references public.workspaces (id) on delete cascade,
  prefixo         text not null default 'CVRJ' check (prefixo ~ '^[A-Z0-9]{1,8}$'),
  proximo_numero  integer not null default 1 check (proximo_numero >= 1),
  termo_padrao    text not null default 'Declaro que recebi o bem acima em boas condições, que ele pertence à Cruz Vermelha Brasileira – Filial do Rio de Janeiro e que o usarei somente nas atividades da instituição. Comprometo-me a zelar por ele, a comunicar qualquer dano, perda ou furto assim que acontecer e a devolvê-lo quando pedido ou quando deixar a função.'
    check (char_length(termo_padrao) between 20 and 4000)
);

create table if not exists public.pat_categorias (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  nome                text not null check (char_length(nome) between 2 and 80),
  vida_util_meses     integer check (vida_util_meses is null or vida_util_meses between 1 and 1200),
  residual_pct        numeric(5,2) not null default 0 check (residual_pct between 0 and 100),
  conta_contabil      text check (char_length(conta_contabil) <= 40),
  manutencao_meses    integer check (manutencao_meses is null or manutencao_meses between 1 and 120),
  ativa               boolean not null default true,
  unique (workspace_id, nome)
);

create table if not exists public.pat_locais (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  nome          text not null check (char_length(nome) between 2 and 80),
  descricao     text check (char_length(descricao) <= 300),
  ativo         boolean not null default true,
  unique (workspace_id, nome)
);

create table if not exists public.pat_bens (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  numero             integer not null,
  plaqueta           text not null,
  plaqueta_antiga    text check (char_length(plaqueta_antiga) <= 40),
  nome               text not null check (char_length(nome) between 2 and 160),
  descricao          text check (char_length(descricao) <= 2000),
  categoria_id       uuid not null references public.pat_categorias (id) on delete restrict,
  local_id           uuid references public.pat_locais (id) on delete set null,
  marca              text check (char_length(marca) <= 80),
  modelo             text check (char_length(modelo) <= 80),
  numero_serie       text check (char_length(numero_serie) <= 80),
  situacao           text not null default 'em_uso' check (situacao in ('em_uso','reserva','em_manutencao','baixado')),
  estado             text not null default 'bom' check (estado in ('novo','bom','regular','ruim','inservivel')),
  origem             text not null default 'compra' check (origem in ('compra','doacao','comodato','outro')),
  aquisicao_em       date,
  valor              numeric(14,2) check (valor is null or valor >= 0),
  fornecedor         text check (char_length(fornecedor) <= 160),
  nota_fiscal        text check (char_length(nota_fiscal) <= 80),
  fonte_id           uuid references public.fin_fontes (id) on delete set null,
  projeto_id         uuid references public.projects (id) on delete set null,
  lancamento_id      uuid references public.fin_lancamentos (id) on delete set null,
  garantia_ate       date,
  manutencao_meses   integer check (manutencao_meses is null or manutencao_meses between 1 and 120),
  observacao         text check (char_length(observacao) <= 2000),
  baixado_em         date,
  motivo_baixa       text check (char_length(motivo_baixa) <= 600),
  destino_baixa      text check (destino_baixa in ('descarte','doacao','venda','furto_perda','sinistro','devolucao_financiador','outro')),
  criado_por         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (workspace_id, numero),
  unique (workspace_id, plaqueta),
  check ((situacao = 'baixado') = (baixado_em is not null))
);
create index if not exists pat_bens_categoria_idx on public.pat_bens (categoria_id);
create index if not exists pat_bens_local_idx on public.pat_bens (local_id);
create index if not exists pat_bens_fonte_idx on public.pat_bens (fonte_id);
create index if not exists pat_bens_projeto_idx on public.pat_bens (projeto_id);
create index if not exists pat_bens_lancamento_idx on public.pat_bens (lancamento_id);
create index if not exists pat_bens_criado_idx on public.pat_bens (criado_por);
create index if not exists pat_bens_antiga_idx on public.pat_bens (workspace_id, plaqueta_antiga) where plaqueta_antiga is not null;

-- Cautela: o bem sob a responsabilidade de uma pessoa (login do Redação ou voluntário).
create table if not exists public.pat_cautelas (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  bem_id              uuid not null references public.pat_bens (id) on delete cascade,
  user_id             uuid references public.profiles (id) on delete set null,
  participante_id     uuid references public.participantes (id) on delete set null,
  nome                text not null check (char_length(nome) between 1 and 160),
  entregue_em         timestamptz not null default now(),
  entregue_por        uuid references public.profiles (id) on delete set null,
  prevista_devolucao  date,
  termo               text not null check (char_length(termo) between 20 and 4000),
  termo_aceito_em     timestamptz,
  devolvido_em        timestamptz,
  recebido_por        uuid references public.profiles (id) on delete set null,
  estado_devolucao    text check (estado_devolucao in ('novo','bom','regular','ruim','inservivel')),
  observacao          text check (char_length(observacao) <= 1000),
  check ((user_id is null) <> (participante_id is null) or devolvido_em is not null)
);
create unique index if not exists pat_cautelas_ativa_idx on public.pat_cautelas (bem_id) where devolvido_em is null;
create index if not exists pat_cautelas_user_idx on public.pat_cautelas (user_id) where devolvido_em is null;
create index if not exists pat_cautelas_participante_idx on public.pat_cautelas (participante_id) where devolvido_em is null;
create index if not exists pat_cautelas_workspace_idx on public.pat_cautelas (workspace_id);
create index if not exists pat_cautelas_entregue_idx on public.pat_cautelas (entregue_por);
create index if not exists pat_cautelas_recebido_idx on public.pat_cautelas (recebido_por);

create table if not exists public.pat_manutencoes (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  bem_id          uuid not null references public.pat_bens (id) on delete cascade,
  tipo            text not null check (tipo in ('preventiva','corretiva','calibracao','inspecao')),
  descricao       text not null check (char_length(descricao) between 2 and 600),
  prevista_para   date,
  realizada_em    date,
  fornecedor      text check (char_length(fornecedor) <= 160),
  custo           numeric(14,2) check (custo is null or custo >= 0),
  lancamento_id   uuid references public.fin_lancamentos (id) on delete set null,
  registrada_por  uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  check (prevista_para is not null or realizada_em is not null)
);
create index if not exists pat_manutencoes_bem_idx on public.pat_manutencoes (bem_id, coalesce(realizada_em, prevista_para) desc);
create index if not exists pat_manutencoes_pendentes_idx on public.pat_manutencoes (workspace_id, prevista_para) where realizada_em is null;
create index if not exists pat_manutencoes_lancamento_idx on public.pat_manutencoes (lancamento_id);
create index if not exists pat_manutencoes_registrada_idx on public.pat_manutencoes (registrada_por);

create table if not exists public.pat_inventarios (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  nome            text not null check (char_length(nome) between 2 and 120),
  iniciado_por    uuid references public.profiles (id) on delete set null,
  iniciado_em     timestamptz not null default now(),
  concluido_por   uuid references public.profiles (id) on delete set null,
  concluido_em    timestamptz,
  resumo          jsonb
);
create unique index if not exists pat_inventarios_aberto_idx on public.pat_inventarios (workspace_id) where concluido_em is null;
create index if not exists pat_inventarios_iniciado_idx on public.pat_inventarios (iniciado_por);
create index if not exists pat_inventarios_concluido_idx on public.pat_inventarios (concluido_por);

create table if not exists public.pat_conferencias (
  inventario_id   uuid not null references public.pat_inventarios (id) on delete cascade,
  bem_id          uuid not null references public.pat_bens (id) on delete cascade,
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  local_id        uuid references public.pat_locais (id) on delete set null,
  estado          text check (estado in ('novo','bom','regular','ruim','inservivel')),
  observacao      text check (char_length(observacao) <= 600),
  conferido_por   uuid references public.profiles (id) on delete set null,
  conferido_em    timestamptz not null default now(),
  primary key (inventario_id, bem_id)
);
create index if not exists pat_conferencias_bem_idx on public.pat_conferencias (bem_id);
create index if not exists pat_conferencias_local_idx on public.pat_conferencias (local_id);
create index if not exists pat_conferencias_por_idx on public.pat_conferencias (conferido_por);
create index if not exists pat_conferencias_workspace_idx on public.pat_conferencias (workspace_id);

create table if not exists public.pat_historico (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  bem_id        uuid references public.pat_bens (id) on delete cascade,
  user_id       uuid references public.profiles (id) on delete set null,
  acao          text not null,
  detalhe       jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists pat_historico_bem_idx on public.pat_historico (bem_id, created_at desc);
create index if not exists pat_historico_workspace_idx on public.pat_historico (workspace_id, created_at desc);
create index if not exists pat_historico_user_idx on public.pat_historico (user_id);

create table if not exists public.pat_acesso (
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  nivel          text not null check (nivel in ('ver','operar','gestao')),
  concedido_por  uuid references public.profiles (id) on delete set null,
  concedido_em   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists pat_acesso_user_idx on public.pat_acesso (user_id);
create index if not exists pat_acesso_concedido_idx on public.pat_acesso (concedido_por);

-- ---------------------------------------------------------------- nível e histórico

create or replace function private.nivel_patrimonio(p_workspace_id uuid)
returns integer language sql security definer set search_path = '' stable as $$
  select case
    when not (select private.is_workspace_member(p_workspace_id)) then 0
    when (select private.workspace_role(p_workspace_id)) = 'admin' then 3
    else coalesce((
      select case a.nivel when 'gestao' then 3 when 'operar' then 2 else 1 end
      from public.pat_acesso a where a.workspace_id = p_workspace_id and a.user_id = (select auth.uid())
    ), 0)
  end
$$;
revoke all on function private.nivel_patrimonio(uuid) from public, anon;
grant execute on function private.nivel_patrimonio(uuid) to authenticated;

create or replace function private.pat_registrar(p_workspace_id uuid, p_bem_id uuid, p_acao text, p_detalhe jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.pat_historico (workspace_id, bem_id, user_id, acao, detalhe)
  values (p_workspace_id, p_bem_id, (select auth.uid()), p_acao, coalesce(p_detalhe, '{}'::jsonb))
$$;
revoke all on function private.pat_registrar(uuid, uuid, text, jsonb) from public, anon, authenticated;

/** O bem está com esta pessoa agora? (para ela ver o próprio bem sem ter nível no Patrimônio). */
create or replace function private.pat_esta_comigo(p_bem_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (select 1 from public.pat_cautelas c where c.bem_id = p_bem_id and c.devolvido_em is null and c.user_id = (select auth.uid()))
$$;
revoke all on function private.pat_esta_comigo(uuid) from public, anon;
grant execute on function private.pat_esta_comigo(uuid) to authenticated;

-- ---------------------------------------------------------------- leitura

alter table public.pat_config enable row level security;
alter table public.pat_categorias enable row level security;
alter table public.pat_locais enable row level security;
alter table public.pat_bens enable row level security;
alter table public.pat_cautelas enable row level security;
alter table public.pat_manutencoes enable row level security;
alter table public.pat_inventarios enable row level security;
alter table public.pat_conferencias enable row level security;
alter table public.pat_historico enable row level security;
alter table public.pat_acesso enable row level security;

revoke all on public.pat_config, public.pat_categorias, public.pat_locais, public.pat_bens, public.pat_cautelas, public.pat_manutencoes,
  public.pat_inventarios, public.pat_conferencias, public.pat_historico, public.pat_acesso from anon, authenticated;
grant select on public.pat_config, public.pat_categorias, public.pat_locais, public.pat_bens, public.pat_cautelas, public.pat_manutencoes,
  public.pat_inventarios, public.pat_conferencias, public.pat_historico, public.pat_acesso to authenticated;

create policy pat_config_select on public.pat_config for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);
create policy pat_categorias_select on public.pat_categorias for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);
create policy pat_locais_select on public.pat_locais for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);
create policy pat_bens_select on public.pat_bens for select to authenticated
  using ((select private.nivel_patrimonio(workspace_id)) >= 1 or private.pat_esta_comigo(id));
create policy pat_cautelas_select on public.pat_cautelas for select to authenticated
  using ((select private.nivel_patrimonio(workspace_id)) >= 1 or user_id = (select auth.uid()));
create policy pat_manutencoes_select on public.pat_manutencoes for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);
create policy pat_inventarios_select on public.pat_inventarios for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);
create policy pat_conferencias_select on public.pat_conferencias for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);
create policy pat_historico_select on public.pat_historico for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);
create policy pat_acesso_select on public.pat_acesso for select to authenticated
  using (user_id = (select auth.uid()) or (select private.workspace_role(workspace_id)) = 'admin');

-- ---------------------------------------------------------------- categorias e local iniciais

/** Vidas úteis da tabela da Receita (IN RFB 1.700/2017, anexo III), como ponto de partida para o contador ajustar. */
create or replace function private.semear_patrimonio(p_workspace_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pat_config (workspace_id) values (p_workspace_id) on conflict (workspace_id) do nothing;
  insert into public.pat_locais (workspace_id, nome, descricao) values (p_workspace_id, 'Sede', 'Sede da filial') on conflict (workspace_id, nome) do nothing;
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

create or replace function public.patrimonio_preparar(p_workspace_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select private.nivel_patrimonio(p_workspace_id)) < 1 then raise exception 'Você não tem acesso ao Patrimônio.' using errcode = 'P0001'; end if;
  perform private.semear_patrimonio(p_workspace_id);
end $$;

-- ---------------------------------------------------------------- cadastros

create or replace function public.patrimonio_salvar_cadastro(p_workspace_id uuid, p_tabela text, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
begin
  if (select private.nivel_patrimonio(p_workspace_id)) < 3 then raise exception 'Só a gestão do Patrimônio mexe em categorias e locais.' using errcode = 'P0001'; end if;
  if p_tabela = 'categoria' then
    if v_id is null then
      insert into public.pat_categorias (workspace_id, nome, vida_util_meses, residual_pct, conta_contabil, manutencao_meses)
      values (p_workspace_id, trim(p->>'nome'), nullif(p->>'vida_util_meses', '')::integer, coalesce(nullif(p->>'residual_pct', '')::numeric, 0),
        nullif(trim(p->>'conta_contabil'), ''), nullif(p->>'manutencao_meses', '')::integer)
      returning id into v_id;
    else
      update public.pat_categorias set nome = trim(p->>'nome'), vida_util_meses = nullif(p->>'vida_util_meses', '')::integer,
        residual_pct = coalesce(nullif(p->>'residual_pct', '')::numeric, 0), conta_contabil = nullif(trim(p->>'conta_contabil'), ''),
        manutencao_meses = nullif(p->>'manutencao_meses', '')::integer, ativa = coalesce((p->>'ativa')::boolean, ativa)
      where id = v_id and workspace_id = p_workspace_id;
      if not found then raise exception 'Categoria não encontrada.' using errcode = 'P0001'; end if;
    end if;
  elsif p_tabela = 'local' then
    if v_id is null then
      insert into public.pat_locais (workspace_id, nome, descricao) values (p_workspace_id, trim(p->>'nome'), nullif(trim(p->>'descricao'), '')) returning id into v_id;
    else
      update public.pat_locais set nome = trim(p->>'nome'), descricao = nullif(trim(p->>'descricao'), ''), ativo = coalesce((p->>'ativo')::boolean, ativo)
      where id = v_id and workspace_id = p_workspace_id;
      if not found then raise exception 'Local não encontrado.' using errcode = 'P0001'; end if;
    end if;
  elsif p_tabela = 'config' then
    update public.pat_config set prefixo = upper(trim(p->>'prefixo')), termo_padrao = trim(p->>'termo_padrao') where workspace_id = p_workspace_id;
    v_id := null;
  else
    raise exception 'Cadastro inválido.' using errcode = 'P0001';
  end if;
  perform private.pat_registrar(p_workspace_id, null, 'cadastro', jsonb_build_object('tabela', p_tabela, 'id', v_id));
  return v_id;
exception
  when unique_violation then raise exception 'Já existe um cadastro com este nome.' using errcode = 'P0001';
  when check_violation then raise exception 'Algum campo está fora do permitido (prefixo: só letras maiúsculas e números, até 8).' using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------- bens

/** Cadastra (numera e gera a plaqueta) ou edita um bem. */
create or replace function public.patrimonio_salvar_bem(p_workspace_id uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_cfg public.pat_config;
  v_atual public.pat_bens;
  v_cat uuid := (p->>'categoria_id')::uuid;
  v_local uuid := nullif(p->>'local_id', '')::uuid;
  v_fonte uuid := nullif(p->>'fonte_id', '')::uuid;
  v_projeto uuid := nullif(p->>'projeto_id', '')::uuid;
  v_lanc uuid := nullif(p->>'lancamento_id', '')::uuid;
begin
  if (select private.nivel_patrimonio(p_workspace_id)) < 2 then raise exception 'Você não tem acesso para cadastrar bens.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.pat_categorias where id = v_cat and workspace_id = p_workspace_id) then raise exception 'Escolha a categoria.' using errcode = 'P0001'; end if;
  if v_local is not null and not exists (select 1 from public.pat_locais where id = v_local and workspace_id = p_workspace_id) then raise exception 'Local inválido.' using errcode = 'P0001'; end if;
  if v_fonte is not null and not exists (select 1 from public.fin_fontes where id = v_fonte and workspace_id = p_workspace_id) then raise exception 'Fonte inválida.' using errcode = 'P0001'; end if;
  if v_projeto is not null and not exists (select 1 from public.projects where id = v_projeto and workspace_id = p_workspace_id) then raise exception 'Projeto inválido.' using errcode = 'P0001'; end if;
  if v_lanc is not null and not exists (select 1 from public.fin_lancamentos where id = v_lanc and workspace_id = p_workspace_id) then raise exception 'Lançamento inválido.' using errcode = 'P0001'; end if;
  if coalesce(p->>'situacao', 'em_uso') = 'baixado' then raise exception 'A baixa tem ação própria, com motivo.' using errcode = 'P0001'; end if;

  if v_id is null then
    insert into public.pat_config (workspace_id) values (p_workspace_id) on conflict (workspace_id) do nothing;
    select * into v_cfg from public.pat_config where workspace_id = p_workspace_id for update;
    insert into public.pat_bens (workspace_id, numero, plaqueta, plaqueta_antiga, nome, descricao, categoria_id, local_id, marca, modelo, numero_serie,
      situacao, estado, origem, aquisicao_em, valor, fornecedor, nota_fiscal, fonte_id, projeto_id, lancamento_id, garantia_ate, manutencao_meses, observacao, criado_por)
    values (p_workspace_id, v_cfg.proximo_numero, v_cfg.prefixo || '-' || lpad(v_cfg.proximo_numero::text, 5, '0'), nullif(trim(p->>'plaqueta_antiga'), ''),
      trim(p->>'nome'), nullif(trim(p->>'descricao'), ''), v_cat, v_local, nullif(trim(p->>'marca'), ''), nullif(trim(p->>'modelo'), ''), nullif(trim(p->>'numero_serie'), ''),
      coalesce(nullif(p->>'situacao', ''), 'em_uso'), coalesce(nullif(p->>'estado', ''), 'bom'), coalesce(nullif(p->>'origem', ''), 'compra'),
      nullif(p->>'aquisicao_em', '')::date, nullif(p->>'valor', '')::numeric, nullif(trim(p->>'fornecedor'), ''), nullif(trim(p->>'nota_fiscal'), ''),
      v_fonte, v_projeto, v_lanc, nullif(p->>'garantia_ate', '')::date, nullif(p->>'manutencao_meses', '')::integer, nullif(trim(p->>'observacao'), ''), (select auth.uid()))
    returning id into v_id;
    update public.pat_config set proximo_numero = proximo_numero + 1 where workspace_id = p_workspace_id;
    perform private.pat_registrar(p_workspace_id, v_id, 'cadastrar', jsonb_build_object('nome', trim(p->>'nome')));
  else
    select * into v_atual from public.pat_bens where id = v_id and workspace_id = p_workspace_id for update;
    if not found then raise exception 'Bem não encontrado.' using errcode = 'P0001'; end if;
    if v_atual.situacao = 'baixado' then raise exception 'Este bem foi baixado e não muda mais.' using errcode = 'P0001'; end if;
    update public.pat_bens set plaqueta_antiga = nullif(trim(p->>'plaqueta_antiga'), ''), nome = trim(p->>'nome'), descricao = nullif(trim(p->>'descricao'), ''),
      categoria_id = v_cat, local_id = v_local, marca = nullif(trim(p->>'marca'), ''), modelo = nullif(trim(p->>'modelo'), ''), numero_serie = nullif(trim(p->>'numero_serie'), ''),
      situacao = coalesce(nullif(p->>'situacao', ''), situacao), estado = coalesce(nullif(p->>'estado', ''), estado), origem = coalesce(nullif(p->>'origem', ''), origem),
      aquisicao_em = nullif(p->>'aquisicao_em', '')::date, valor = nullif(p->>'valor', '')::numeric, fornecedor = nullif(trim(p->>'fornecedor'), ''),
      nota_fiscal = nullif(trim(p->>'nota_fiscal'), ''), fonte_id = v_fonte, projeto_id = v_projeto, lancamento_id = v_lanc,
      garantia_ate = nullif(p->>'garantia_ate', '')::date, manutencao_meses = nullif(p->>'manutencao_meses', '')::integer, observacao = nullif(trim(p->>'observacao'), ''),
      updated_at = now()
    where id = v_id;
    perform private.pat_registrar(p_workspace_id, v_id, 'editar', jsonb_strip_nulls(jsonb_build_object(
      'local', case when v_atual.local_id is distinct from v_local then jsonb_build_object('de', v_atual.local_id, 'para', v_local) end,
      'estado', case when v_atual.estado is distinct from p->>'estado' then jsonb_build_object('de', v_atual.estado, 'para', p->>'estado') end,
      'situacao', case when v_atual.situacao is distinct from p->>'situacao' then jsonb_build_object('de', v_atual.situacao, 'para', p->>'situacao') end,
      'valor', case when v_atual.valor is distinct from nullif(p->>'valor', '')::numeric then jsonb_build_object('de', v_atual.valor, 'para', nullif(p->>'valor', '')::numeric) end)));
  end if;
  return v_id;
end $$;

/** Entrega o bem a um login do Redação (p.user_id) ou a um voluntário (p.participante_id), com termo. */
create or replace function public.patrimonio_entregar(p_bem_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  b public.pat_bens;
  v_user uuid := nullif(p->>'user_id', '')::uuid;
  v_part uuid := nullif(p->>'participante_id', '')::uuid;
  v_nome text;
  v_termo text;
  v_id uuid;
begin
  select * into b from public.pat_bens where id = p_bem_id for update;
  if not found or (select private.nivel_patrimonio(b.workspace_id)) < 2 then raise exception 'Bem não encontrado.' using errcode = 'P0001'; end if;
  if b.situacao = 'baixado' then raise exception 'Bem baixado não pode ser entregue.' using errcode = 'P0001'; end if;
  if (v_user is null) = (v_part is null) then raise exception 'Escolha uma pessoa da equipe ou um voluntário.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.pat_cautelas where bem_id = b.id and devolvido_em is null) then raise exception 'O bem já está com alguém. Registre a devolução antes.' using errcode = 'P0001'; end if;
  if v_user is not null then
    select pr.full_name into v_nome from public.workspace_members m join public.profiles pr on pr.id = m.user_id where m.workspace_id = b.workspace_id and m.user_id = v_user;
    if v_nome is null then raise exception 'A pessoa precisa ser do espaço.' using errcode = 'P0001'; end if;
  else
    select coalesce(pa.nome_social, pa.nome) into v_nome from public.participantes pa
    where pa.id = v_part and pa.workspace_id = b.workspace_id and pa.situacao = 'ativo' and pa.anonimizado_em is null;
    if v_nome is null then raise exception 'Só voluntário ativo pode receber bem.' using errcode = 'P0001'; end if;
  end if;
  v_termo := coalesce(nullif(trim(p->>'termo'), ''), (select termo_padrao from public.pat_config where workspace_id = b.workspace_id),
    'Declaro que recebi o bem acima e me responsabilizo por ele.');
  insert into public.pat_cautelas (workspace_id, bem_id, user_id, participante_id, nome, entregue_por, prevista_devolucao, termo, observacao)
  values (b.workspace_id, b.id, v_user, v_part, v_nome, (select auth.uid()), nullif(p->>'prevista_devolucao', '')::date, left(v_termo, 4000), nullif(left(trim(coalesce(p->>'observacao', '')), 1000), ''))
  returning id into v_id;
  update public.pat_bens set situacao = 'em_uso', updated_at = now() where id = b.id;
  perform private.pat_registrar(b.workspace_id, b.id, 'entregar', jsonb_build_object('para', v_nome, 'voluntario', v_part is not null, 'cautela', v_id));
  return v_id;
end $$;

create or replace function public.patrimonio_devolver(p_cautela_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.pat_cautelas;
  v_local uuid := nullif(p->>'local_id', '')::uuid;
begin
  select * into c from public.pat_cautelas where id = p_cautela_id for update;
  if not found or (select private.nivel_patrimonio(c.workspace_id)) < 2 then raise exception 'Cautela não encontrada.' using errcode = 'P0001'; end if;
  if c.devolvido_em is not null then raise exception 'Este bem já foi devolvido.' using errcode = 'P0001'; end if;
  if v_local is not null and not exists (select 1 from public.pat_locais where id = v_local and workspace_id = c.workspace_id) then raise exception 'Local inválido.' using errcode = 'P0001'; end if;
  update public.pat_cautelas set devolvido_em = now(), recebido_por = (select auth.uid()), estado_devolucao = coalesce(nullif(p->>'estado', ''), 'bom'),
    observacao = coalesce(nullif(left(trim(coalesce(p->>'observacao', '')), 1000), ''), observacao)
  where id = c.id;
  update public.pat_bens set estado = coalesce(nullif(p->>'estado', ''), estado), local_id = coalesce(v_local, local_id),
    situacao = case when situacao = 'em_uso' then 'reserva' else situacao end, updated_at = now()
  where id = c.bem_id;
  perform private.pat_registrar(c.workspace_id, c.bem_id, 'devolver', jsonb_build_object('de', c.nome, 'estado', coalesce(nullif(p->>'estado', ''), 'bom')));
end $$;

/** A própria pessoa (login do Redação) aceita o termo do que está com ela. */
create or replace function public.patrimonio_aceitar_termo(p_cautela_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.pat_cautelas;
begin
  select * into c from public.pat_cautelas where id = p_cautela_id for update;
  if not found or c.user_id is distinct from (select auth.uid()) or c.devolvido_em is not null then raise exception 'Termo não encontrado.' using errcode = 'P0001'; end if;
  if c.termo_aceito_em is not null then return; end if;
  update public.pat_cautelas set termo_aceito_em = now() where id = c.id;
  perform private.pat_registrar(c.workspace_id, c.bem_id, 'aceitar_termo', jsonb_build_object('por', c.nome));
end $$;

/** Área do Voluntário (só pelo servidor, com a sessão do voluntário): os bens com ele. */
create or replace function public.patrimonio_do_voluntario(p_participante_id uuid)
returns table (cautela_id uuid, plaqueta text, nome text, marca text, modelo text, numero_serie text, entregue_em timestamptz, prevista_devolucao date, termo text, termo_aceito_em timestamptz)
language sql security definer set search_path = '' stable as $$
  select c.id, b.plaqueta, b.nome, b.marca, b.modelo, b.numero_serie, c.entregue_em, c.prevista_devolucao, c.termo, c.termo_aceito_em
  from public.pat_cautelas c join public.pat_bens b on b.id = c.bem_id
  where c.participante_id = p_participante_id and c.devolvido_em is null
  order by c.entregue_em desc
$$;

create or replace function public.patrimonio_voluntario_aceitar(p_participante_id uuid, p_cautela_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  c public.pat_cautelas;
begin
  select * into c from public.pat_cautelas where id = p_cautela_id and participante_id = p_participante_id and devolvido_em is null for update;
  if not found then return false; end if;
  if c.termo_aceito_em is null then
    update public.pat_cautelas set termo_aceito_em = now() where id = c.id;
    insert into public.pat_historico (workspace_id, bem_id, user_id, acao, detalhe) values (c.workspace_id, c.bem_id, null, 'aceitar_termo', jsonb_build_object('por', c.nome, 'voluntario', true));
  end if;
  return true;
end $$;

/** Manutenção: registra (prevista ou feita). Feita num bem com periodicidade, agenda a próxima preventiva. */
create or replace function public.patrimonio_manutencao(p_bem_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  b public.pat_bens;
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_feita date := nullif(p->>'realizada_em', '')::date;
  v_meses integer;
  v_lanc uuid := nullif(p->>'lancamento_id', '')::uuid;
begin
  select * into b from public.pat_bens where id = p_bem_id;
  if not found or (select private.nivel_patrimonio(b.workspace_id)) < 2 then raise exception 'Bem não encontrado.' using errcode = 'P0001'; end if;
  if v_lanc is not null and not exists (select 1 from public.fin_lancamentos where id = v_lanc and workspace_id = b.workspace_id) then raise exception 'Lançamento inválido.' using errcode = 'P0001'; end if;
  if v_feita is not null and v_feita > current_date + 1 then raise exception 'A data de realização não pode ser no futuro.' using errcode = 'P0001'; end if;
  if v_id is null then
    insert into public.pat_manutencoes (workspace_id, bem_id, tipo, descricao, prevista_para, realizada_em, fornecedor, custo, lancamento_id, registrada_por)
    values (b.workspace_id, b.id, p->>'tipo', trim(p->>'descricao'), nullif(p->>'prevista_para', '')::date, v_feita, nullif(trim(p->>'fornecedor'), ''),
      nullif(p->>'custo', '')::numeric, v_lanc, (select auth.uid()))
    returning id into v_id;
  else
    update public.pat_manutencoes set tipo = p->>'tipo', descricao = trim(p->>'descricao'), prevista_para = nullif(p->>'prevista_para', '')::date, realizada_em = v_feita,
      fornecedor = nullif(trim(p->>'fornecedor'), ''), custo = nullif(p->>'custo', '')::numeric, lancamento_id = v_lanc
    where id = v_id and bem_id = b.id;
    if not found then raise exception 'Manutenção não encontrada.' using errcode = 'P0001'; end if;
  end if;
  v_meses := coalesce(b.manutencao_meses, (select manutencao_meses from public.pat_categorias where id = b.categoria_id));
  if v_feita is not null and p->>'tipo' in ('preventiva','calibracao','inspecao') and v_meses is not null
     and not exists (select 1 from public.pat_manutencoes m where m.bem_id = b.id and m.realizada_em is null and m.tipo = p->>'tipo') then
    insert into public.pat_manutencoes (workspace_id, bem_id, tipo, descricao, prevista_para, registrada_por)
    values (b.workspace_id, b.id, p->>'tipo', trim(p->>'descricao'), (v_feita + make_interval(months => v_meses))::date, (select auth.uid()));
  end if;
  perform private.pat_registrar(b.workspace_id, b.id, case when v_feita is null then 'agendar_manutencao' else 'manutencao' end,
    jsonb_build_object('tipo', p->>'tipo', 'descricao', trim(p->>'descricao'), 'custo', nullif(p->>'custo', '')::numeric));
  return v_id;
end $$;

create or replace function public.patrimonio_excluir_manutencao(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  m public.pat_manutencoes;
begin
  select * into m from public.pat_manutencoes where id = p_id;
  if not found or (select private.nivel_patrimonio(m.workspace_id)) < 2 then raise exception 'Manutenção não encontrada.' using errcode = 'P0001'; end if;
  if m.realizada_em is not null then raise exception 'Manutenção feita fica no histórico.' using errcode = 'P0001'; end if;
  delete from public.pat_manutencoes where id = p_id;
  perform private.pat_registrar(m.workspace_id, m.bem_id, 'cancelar_manutencao', jsonb_build_object('descricao', m.descricao));
end $$;

/** Baixa: o bem sai do patrimônio (descarte, doação, venda, furto...). Não se desfaz. */
create or replace function public.patrimonio_baixar(p_bem_id uuid, p_destino text, p_motivo text, p_data date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  b public.pat_bens;
begin
  select * into b from public.pat_bens where id = p_bem_id for update;
  if not found or (select private.nivel_patrimonio(b.workspace_id)) < 1 then raise exception 'Bem não encontrado.' using errcode = 'P0001'; end if;
  if (select private.nivel_patrimonio(b.workspace_id)) < 3 then raise exception 'Só a gestão do Patrimônio dá baixa em bem.' using errcode = 'P0001'; end if;
  if b.situacao = 'baixado' then raise exception 'Este bem já foi baixado.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.pat_cautelas where bem_id = b.id and devolvido_em is null) then raise exception 'O bem ainda está com alguém: registre a devolução antes.' using errcode = 'P0001'; end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'Descreva o motivo da baixa.' using errcode = 'P0001'; end if;
  if p_data is null or p_data > current_date then raise exception 'Data da baixa inválida.' using errcode = 'P0001'; end if;
  update public.pat_bens set situacao = 'baixado', baixado_em = p_data, destino_baixa = p_destino, motivo_baixa = left(trim(p_motivo), 600), updated_at = now() where id = b.id;
  delete from public.pat_manutencoes where bem_id = b.id and realizada_em is null;
  perform private.pat_registrar(b.workspace_id, b.id, 'baixar', jsonb_build_object('destino', p_destino, 'motivo', trim(p_motivo), 'data', p_data));
exception
  when check_violation then raise exception 'Escolha o destino da baixa.' using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------- inventário físico

create or replace function public.patrimonio_iniciar_inventario(p_workspace_id uuid, p_nome text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if (select private.nivel_patrimonio(p_workspace_id)) < 3 then raise exception 'Só a gestão do Patrimônio abre um inventário.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.pat_inventarios where workspace_id = p_workspace_id and concluido_em is null) then raise exception 'Já há um inventário aberto.' using errcode = 'P0001'; end if;
  insert into public.pat_inventarios (workspace_id, nome, iniciado_por) values (p_workspace_id, left(trim(p_nome), 120), (select auth.uid())) returning id into v_id;
  perform private.pat_registrar(p_workspace_id, null, 'iniciar_inventario', jsonb_build_object('inventario', v_id, 'nome', trim(p_nome)));
  return v_id;
end $$;

/** Confere um bem no inventário aberto. Achado em outro lugar ou noutro estado, o bem é atualizado. */
create or replace function public.patrimonio_conferir(p_bem_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  b public.pat_bens;
  v_inv uuid;
  v_local uuid := nullif(p->>'local_id', '')::uuid;
  v_estado text := nullif(p->>'estado', '');
begin
  select * into b from public.pat_bens where id = p_bem_id for update;
  if not found or (select private.nivel_patrimonio(b.workspace_id)) < 2 then raise exception 'Bem não encontrado.' using errcode = 'P0001'; end if;
  if b.situacao = 'baixado' then raise exception 'Este bem foi baixado.' using errcode = 'P0001'; end if;
  select id into v_inv from public.pat_inventarios where workspace_id = b.workspace_id and concluido_em is null;
  if v_inv is null then raise exception 'Não há inventário aberto.' using errcode = 'P0001'; end if;
  if v_local is not null and not exists (select 1 from public.pat_locais where id = v_local and workspace_id = b.workspace_id) then raise exception 'Local inválido.' using errcode = 'P0001'; end if;
  insert into public.pat_conferencias (inventario_id, bem_id, workspace_id, local_id, estado, observacao, conferido_por)
  values (v_inv, b.id, b.workspace_id, coalesce(v_local, b.local_id), coalesce(v_estado, b.estado), nullif(left(trim(coalesce(p->>'observacao', '')), 600), ''), (select auth.uid()))
  on conflict (inventario_id, bem_id) do update set local_id = excluded.local_id, estado = excluded.estado, observacao = excluded.observacao,
    conferido_por = excluded.conferido_por, conferido_em = now();
  if (v_local is not null and v_local is distinct from b.local_id) or (v_estado is not null and v_estado <> b.estado) then
    update public.pat_bens set local_id = coalesce(v_local, local_id), estado = coalesce(v_estado, estado), updated_at = now() where id = b.id;
  end if;
  perform private.pat_registrar(b.workspace_id, b.id, 'conferir', jsonb_strip_nulls(jsonb_build_object('inventario', v_inv,
    'mudou_local', case when v_local is distinct from b.local_id and v_local is not null then true end,
    'mudou_estado', case when v_estado is distinct from b.estado and v_estado is not null then v_estado end)));
end $$;

create or replace function public.patrimonio_concluir_inventario(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.pat_inventarios;
  v_resumo jsonb;
begin
  if (select private.nivel_patrimonio(p_workspace_id)) < 3 then raise exception 'Só a gestão do Patrimônio conclui o inventário.' using errcode = 'P0001'; end if;
  select * into v_inv from public.pat_inventarios where workspace_id = p_workspace_id and concluido_em is null for update;
  if not found then raise exception 'Não há inventário aberto.' using errcode = 'P0001'; end if;
  select jsonb_build_object(
    'bens', count(*),
    'conferidos', count(*) filter (where c.bem_id is not null),
    'nao_encontrados', coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'plaqueta', b.plaqueta, 'nome', b.nome)) filter (where c.bem_id is null), '[]'::jsonb))
  into v_resumo
  from public.pat_bens b left join public.pat_conferencias c on c.bem_id = b.id and c.inventario_id = v_inv.id
  where b.workspace_id = p_workspace_id and b.situacao <> 'baixado' and b.created_at <= v_inv.iniciado_em + interval '1 day';
  update public.pat_inventarios set concluido_em = now(), concluido_por = (select auth.uid()), resumo = v_resumo where id = v_inv.id;
  perform private.pat_registrar(p_workspace_id, null, 'concluir_inventario', jsonb_build_object('inventario', v_inv.id, 'conferidos', v_resumo->'conferidos', 'bens', v_resumo->'bens'));
  return v_resumo;
end $$;

create or replace function public.patrimonio_definir_acesso(p_workspace_id uuid, p_user_id uuid, p_nivel text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select private.workspace_role(p_workspace_id)) is distinct from 'admin' then raise exception 'Só um admin define quem acessa o Patrimônio.' using errcode = 'P0001'; end if;
  if p_nivel is not null and p_nivel not in ('ver','operar','gestao') then raise exception 'Nível inválido.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = p_user_id) then raise exception 'A pessoa precisa ser do espaço.' using errcode = 'P0001'; end if;
  if p_nivel is null then
    delete from public.pat_acesso where workspace_id = p_workspace_id and user_id = p_user_id;
  else
    insert into public.pat_acesso (workspace_id, user_id, nivel, concedido_por) values (p_workspace_id, p_user_id, p_nivel, (select auth.uid()))
    on conflict (workspace_id, user_id) do update set nivel = excluded.nivel, concedido_por = excluded.concedido_por, concedido_em = now();
  end if;
  perform private.pat_registrar(p_workspace_id, null, 'acesso', jsonb_build_object('usuario', p_user_id, 'nivel', p_nivel));
end $$;

/** Para o fechamento do Financeiro: os bens com valor, sem dados de pessoas. */
create or replace function public.financeiro_bens_para_depreciacao(p_workspace_id uuid)
returns table (id uuid, plaqueta text, nome text, categoria text, conta_contabil text, origem text, aquisicao_em date, valor numeric,
  vida_util_meses integer, residual_pct numeric, baixado_em date, fonte_id uuid)
language plpgsql security definer set search_path = '' stable as $$
begin
  if (select private.nivel_financeiro(p_workspace_id)) < 1 then raise exception 'Você não tem acesso ao Financeiro.' using errcode = 'P0001'; end if;
  return query
    select b.id, b.plaqueta, b.nome, c.nome, c.conta_contabil, b.origem, b.aquisicao_em, b.valor, c.vida_util_meses, c.residual_pct, b.baixado_em, b.fonte_id
    from public.pat_bens b join public.pat_categorias c on c.id = b.categoria_id
    where b.workspace_id = p_workspace_id and b.valor is not null and b.aquisicao_em is not null and b.origem <> 'comodato'
    order by b.numero;
end $$;

-- ---------------------------------------------------------------- permissões

revoke all on function public.patrimonio_preparar(uuid) from public, anon;
revoke all on function public.patrimonio_salvar_cadastro(uuid, text, jsonb) from public, anon;
revoke all on function public.patrimonio_salvar_bem(uuid, uuid, jsonb) from public, anon;
revoke all on function public.patrimonio_entregar(uuid, jsonb) from public, anon;
revoke all on function public.patrimonio_devolver(uuid, jsonb) from public, anon;
revoke all on function public.patrimonio_aceitar_termo(uuid) from public, anon;
revoke all on function public.patrimonio_do_voluntario(uuid) from public, anon, authenticated;
revoke all on function public.patrimonio_voluntario_aceitar(uuid, uuid) from public, anon, authenticated;
revoke all on function public.patrimonio_manutencao(uuid, jsonb) from public, anon;
revoke all on function public.patrimonio_excluir_manutencao(uuid) from public, anon;
revoke all on function public.patrimonio_baixar(uuid, text, text, date) from public, anon;
revoke all on function public.patrimonio_iniciar_inventario(uuid, text) from public, anon;
revoke all on function public.patrimonio_conferir(uuid, jsonb) from public, anon;
revoke all on function public.patrimonio_concluir_inventario(uuid) from public, anon;
revoke all on function public.patrimonio_definir_acesso(uuid, uuid, text) from public, anon;
revoke all on function public.financeiro_bens_para_depreciacao(uuid) from public, anon;
grant execute on function public.patrimonio_preparar(uuid) to authenticated;
grant execute on function public.patrimonio_salvar_cadastro(uuid, text, jsonb) to authenticated;
grant execute on function public.patrimonio_salvar_bem(uuid, uuid, jsonb) to authenticated;
grant execute on function public.patrimonio_entregar(uuid, jsonb) to authenticated;
grant execute on function public.patrimonio_devolver(uuid, jsonb) to authenticated;
grant execute on function public.patrimonio_aceitar_termo(uuid) to authenticated;
grant execute on function public.patrimonio_do_voluntario(uuid) to service_role;
grant execute on function public.patrimonio_voluntario_aceitar(uuid, uuid) to service_role;
grant execute on function public.patrimonio_manutencao(uuid, jsonb) to authenticated;
grant execute on function public.patrimonio_excluir_manutencao(uuid) to authenticated;
grant execute on function public.patrimonio_baixar(uuid, text, text, date) to authenticated;
grant execute on function public.patrimonio_iniciar_inventario(uuid, text) to authenticated;
grant execute on function public.patrimonio_conferir(uuid, jsonb) to authenticated;
grant execute on function public.patrimonio_concluir_inventario(uuid) to authenticated;
grant execute on function public.patrimonio_definir_acesso(uuid, uuid, text) to authenticated;
grant execute on function public.financeiro_bens_para_depreciacao(uuid) to authenticated;

-- Assunto novo no sino: bem entregue a você, termo para aceitar, manutenção vencendo.
alter table public.notifications drop constraint if exists notifications_categoria_valida;
alter table public.notifications add constraint notifications_categoria_valida
  check (categoria in ('geral','aprovacoes','mensagens','pautas','chamados','oficios','financeiro','patrimonio'));

do $$
declare w uuid;
begin
  for w in select id from public.workspaces loop perform private.semear_patrimonio(w); end loop;
end $$;
