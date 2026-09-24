-- Financeiro: a gestão do dinheiro da filial. Não é a contabilidade oficial
-- (essa é do contador, no sistema dele); é o dia a dia — o que entra, o que
-- sai, o que vence, de que dinheiro sai e para que projeto —, organizado para
-- o fechamento do mês e para a prestação de contas.
--
-- Modelo: financeiro de gestão (Nibo, Granatum) + o que é só de entidade sem
-- fins lucrativos (ITG 2002 R1):
--  - FONTE do recurso: livre ou com restrição (convênio, termo de fomento,
--    doação carimbada). Toda entrada e saída diz de que fonte é; o saldo de
--    cada fonte é o que se pode gastar nela.
--  - PROJETO (public.projects) como centro de custo.
--  - Conta de convênio: a conta bancária pode ter uma fonte padrão.
--
-- Níveis (fin_acesso; admin do espaço = 4):
--   1 ver     → lançamentos, cadastros e anexos, sem mudar nada
--   2 lançar  → + criar, editar, pagar, anexar comprovante, favorecidos
--   3 aprovar → + aprovar despesas que pedem aprovação (nunca as próprias)
--   4 gestão  → + contas, categorias, fontes, aprovação e fechamento (contador)
--
-- Aprovação é opcional (fin_config.aprovacao_ativa, desligada): ligada,
-- despesa a partir do valor definido nasce "pendente" e só pode ser paga
-- depois de aprovada por outra pessoa.
--
-- Mês fechado (fin_config.fechado_ate): o que foi pago até essa data não
-- muda mais — nem valor, nem data, nem exclusão. Conta em aberto de
-- competência antiga continua editável: ela ainda vai ser paga.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('financeiro-anexos', 'financeiro-anexos', false, 20971520, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------- tabelas

create table if not exists public.fin_config (
  workspace_id          uuid primary key references public.workspaces (id) on delete cascade,
  aprovacao_ativa       boolean not null default false,
  aprovacao_acima       numeric(14,2) check (aprovacao_acima is null or aprovacao_acima >= 0),
  fechado_ate           date,
  reserva_minima_meses  numeric(4,1) not null default 3 check (reserva_minima_meses between 0 and 36),
  atualizado_por        uuid references public.profiles (id) on delete set null,
  updated_at            timestamptz not null default now()
);
create index if not exists fin_config_atualizado_idx on public.fin_config (atualizado_por);

create table if not exists public.fin_fontes (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  nome            text not null check (char_length(nome) between 2 and 120),
  restrita        boolean not null default false,
  projeto_id      uuid references public.projects (id) on delete set null,
  financiador     text check (char_length(financiador) <= 160),
  descricao       text check (char_length(descricao) <= 2000),
  inicio          date,
  fim             date,
  valor_previsto  numeric(14,2) check (valor_previsto is null or valor_previsto >= 0),
  ativa           boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (workspace_id, nome),
  check (fim is null or inicio is null or fim >= inicio)
);
create index if not exists fin_fontes_projeto_idx on public.fin_fontes (projeto_id);

create table if not exists public.fin_contas (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  nome              text not null check (char_length(nome) between 2 and 80),
  tipo              text not null default 'corrente' check (tipo in ('corrente','poupanca','aplicacao','caixa','cartao')),
  banco             text check (char_length(banco) <= 80),
  agencia           text check (char_length(agencia) <= 20),
  numero            text check (char_length(numero) <= 30),
  fonte_id          uuid references public.fin_fontes (id) on delete set null,
  saldo_inicial     numeric(14,2) not null default 0,
  saldo_inicial_em  date not null default current_date,
  ativa             boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (workspace_id, nome)
);
create index if not exists fin_contas_fonte_idx on public.fin_contas (fonte_id);

create table if not exists public.fin_categorias (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  tipo             text not null check (tipo in ('despesa','receita')),
  nome             text not null check (char_length(nome) between 2 and 80),
  grupo            text check (char_length(grupo) <= 60),
  codigo_contabil  text check (char_length(codigo_contabil) <= 40),
  fixa             boolean not null default false,
  ativa            boolean not null default true,
  ordem            integer not null default 0,
  unique (workspace_id, tipo, nome)
);

create table if not exists public.fin_favorecidos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  nome          text not null check (char_length(nome) between 2 and 160),
  tipo_pessoa   text not null default 'pj' check (tipo_pessoa in ('pf','pj')),
  documento     text check (documento ~ '^\d{11}$|^\d{14}$'),
  chave_pix     text check (char_length(chave_pix) <= 140),
  email         text check (char_length(email) <= 200),
  telefone      text check (char_length(telefone) <= 30),
  observacao    text check (char_length(observacao) <= 1000),
  created_at    timestamptz not null default now()
);
create unique index if not exists fin_favorecidos_documento_idx on public.fin_favorecidos (workspace_id, documento) where documento is not null;
create index if not exists fin_favorecidos_nome_idx on public.fin_favorecidos (workspace_id, nome);

create table if not exists public.fin_lancamentos (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  tipo              text not null check (tipo in ('despesa','receita','transferencia')),
  descricao         text not null check (char_length(descricao) between 2 and 200),
  valor             numeric(14,2) not null check (valor > 0),
  conta_id          uuid not null references public.fin_contas (id) on delete restrict,
  conta_destino_id  uuid references public.fin_contas (id) on delete restrict,
  categoria_id      uuid references public.fin_categorias (id) on delete restrict,
  fonte_id          uuid not null references public.fin_fontes (id) on delete restrict,
  projeto_id        uuid references public.projects (id) on delete set null,
  favorecido_id     uuid references public.fin_favorecidos (id) on delete set null,
  competencia       date not null,
  vencimento        date not null,
  pago_em           date,
  valor_pago        numeric(14,2) check (valor_pago is null or valor_pago > 0),
  forma             text check (forma in ('pix','boleto','transferencia','cartao','dinheiro','debito','cheque','outro')),
  documento         text check (char_length(documento) <= 80),
  observacao        text check (char_length(observacao) <= 2000),
  grupo_id          uuid,
  parcela           smallint check (parcela is null or parcela >= 1),
  parcelas          smallint check (parcelas is null or parcelas between 1 and 120),
  recorrente        boolean not null default false,
  aprovacao         text not null default 'nao_exige' check (aprovacao in ('nao_exige','pendente','aprovada','recusada')),
  aprovado_por      uuid references public.profiles (id) on delete set null,
  aprovado_em       timestamptz,
  motivo_recusa     text check (char_length(motivo_recusa) <= 600),
  criado_por        uuid references public.profiles (id) on delete set null,
  atualizado_por    uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check ((tipo = 'transferencia') = (conta_destino_id is not null)),
  check (conta_destino_id is null or conta_destino_id <> conta_id),
  check (tipo = 'transferencia' or categoria_id is not null),
  check ((pago_em is null) = (valor_pago is null))
);
create index if not exists fin_lancamentos_vencimento_idx on public.fin_lancamentos (workspace_id, vencimento);
create index if not exists fin_lancamentos_pago_idx on public.fin_lancamentos (workspace_id, pago_em);
create index if not exists fin_lancamentos_grupo_idx on public.fin_lancamentos (grupo_id) where grupo_id is not null;
create index if not exists fin_lancamentos_conta_idx on public.fin_lancamentos (conta_id);
create index if not exists fin_lancamentos_destino_idx on public.fin_lancamentos (conta_destino_id);
create index if not exists fin_lancamentos_categoria_idx on public.fin_lancamentos (categoria_id);
create index if not exists fin_lancamentos_fonte_idx on public.fin_lancamentos (fonte_id);
create index if not exists fin_lancamentos_projeto_idx on public.fin_lancamentos (projeto_id);
create index if not exists fin_lancamentos_favorecido_idx on public.fin_lancamentos (favorecido_id);
create index if not exists fin_lancamentos_criado_idx on public.fin_lancamentos (criado_por);
create index if not exists fin_lancamentos_atualizado_idx on public.fin_lancamentos (atualizado_por);
create index if not exists fin_lancamentos_aprovado_idx on public.fin_lancamentos (aprovado_por);
create index if not exists fin_lancamentos_pendentes_idx on public.fin_lancamentos (workspace_id) where aprovacao = 'pendente';

create table if not exists public.fin_anexos (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  lancamento_id  uuid not null references public.fin_lancamentos (id) on delete cascade,
  caminho        text not null unique,
  nome_original  text not null check (char_length(nome_original) between 1 and 200),
  tipo_doc       text not null check (tipo_doc in ('nota','comprovante','boleto','recibo','contrato','outro')),
  mime           text not null,
  tamanho        integer not null check (tamanho > 0),
  sha256         text,
  enviado_por    uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists fin_anexos_lancamento_idx on public.fin_anexos (lancamento_id);
create index if not exists fin_anexos_workspace_idx on public.fin_anexos (workspace_id);
create index if not exists fin_anexos_enviado_idx on public.fin_anexos (enviado_por);

create table if not exists public.fin_acesso (
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  nivel          text not null check (nivel in ('ver','lancar','aprovar','gestao')),
  concedido_por  uuid references public.profiles (id) on delete set null,
  concedido_em   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists fin_acesso_user_idx on public.fin_acesso (user_id);
create index if not exists fin_acesso_concedido_idx on public.fin_acesso (concedido_por);

create table if not exists public.fin_auditoria (
  id             bigint generated always as identity primary key,
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  lancamento_id  uuid references public.fin_lancamentos (id) on delete set null,
  user_id        uuid references public.profiles (id) on delete set null,
  acao           text not null,
  detalhe        jsonb not null default '{}',
  created_at     timestamptz not null default now()
);
create index if not exists fin_auditoria_workspace_idx on public.fin_auditoria (workspace_id, created_at desc);
create index if not exists fin_auditoria_lancamento_idx on public.fin_auditoria (lancamento_id);
create index if not exists fin_auditoria_user_idx on public.fin_auditoria (user_id);

-- ---------------------------------------------------------------- nível e auditoria

create or replace function private.nivel_financeiro(p_workspace_id uuid)
returns integer language sql security definer set search_path = '' stable as $$
  select case
    when not (select private.is_workspace_member(p_workspace_id)) then 0
    when (select private.workspace_role(p_workspace_id)) = 'admin' then 4
    else coalesce((
      select case a.nivel when 'gestao' then 4 when 'aprovar' then 3 when 'lancar' then 2 else 1 end
      from public.fin_acesso a
      where a.workspace_id = p_workspace_id and a.user_id = (select auth.uid())
    ), 0)
  end
$$;
revoke all on function private.nivel_financeiro(uuid) from public, anon;
grant execute on function private.nivel_financeiro(uuid) to authenticated;

create or replace function private.auditar_financeiro(p_workspace_id uuid, p_lancamento_id uuid, p_acao text, p_detalhe jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.fin_auditoria (workspace_id, lancamento_id, user_id, acao, detalhe)
  values (p_workspace_id, p_lancamento_id, (select auth.uid()), p_acao, coalesce(p_detalhe, '{}'::jsonb))
$$;
revoke all on function private.auditar_financeiro(uuid, uuid, text, jsonb) from public, anon, authenticated;

/** O mês fechado alcança esta data? */
create or replace function private.fin_fechado(p_workspace_id uuid, p_data date)
returns boolean language sql security definer set search_path = '' stable as $$
  select p_data is not null and coalesce((select c.fechado_ate >= p_data from public.fin_config c where c.workspace_id = p_workspace_id), false)
$$;
revoke all on function private.fin_fechado(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------- leitura

alter table public.fin_config enable row level security;
alter table public.fin_fontes enable row level security;
alter table public.fin_contas enable row level security;
alter table public.fin_categorias enable row level security;
alter table public.fin_favorecidos enable row level security;
alter table public.fin_lancamentos enable row level security;
alter table public.fin_anexos enable row level security;
alter table public.fin_acesso enable row level security;
alter table public.fin_auditoria enable row level security;

revoke all on public.fin_config, public.fin_fontes, public.fin_contas, public.fin_categorias, public.fin_favorecidos,
  public.fin_lancamentos, public.fin_anexos, public.fin_acesso, public.fin_auditoria from anon, authenticated;
grant select on public.fin_config, public.fin_fontes, public.fin_contas, public.fin_categorias, public.fin_favorecidos,
  public.fin_lancamentos, public.fin_anexos, public.fin_acesso, public.fin_auditoria to authenticated;

create policy fin_config_select on public.fin_config for select to authenticated using ((select private.nivel_financeiro(workspace_id)) >= 1);
create policy fin_fontes_select on public.fin_fontes for select to authenticated using ((select private.nivel_financeiro(workspace_id)) >= 1);
create policy fin_contas_select on public.fin_contas for select to authenticated using ((select private.nivel_financeiro(workspace_id)) >= 1);
create policy fin_categorias_select on public.fin_categorias for select to authenticated using ((select private.nivel_financeiro(workspace_id)) >= 1);
create policy fin_favorecidos_select on public.fin_favorecidos for select to authenticated using ((select private.nivel_financeiro(workspace_id)) >= 1);
create policy fin_lancamentos_select on public.fin_lancamentos for select to authenticated using ((select private.nivel_financeiro(workspace_id)) >= 1);
create policy fin_anexos_select on public.fin_anexos for select to authenticated using ((select private.nivel_financeiro(workspace_id)) >= 1);
create policy fin_acesso_select on public.fin_acesso for select to authenticated
  using (user_id = (select auth.uid()) or (select private.workspace_role(workspace_id)) = 'admin');
create policy fin_auditoria_select on public.fin_auditoria for select to authenticated using ((select private.nivel_financeiro(workspace_id)) >= 4);

-- ---------------------------------------------------------------- categorias e fonte iniciais

/** Categorias de uma entidade sem fins lucrativos e a fonte "Recursos livres". Idempotente. */
create or replace function private.semear_financeiro(p_workspace_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.fin_fontes (workspace_id, nome, restrita, descricao)
  values (p_workspace_id, 'Recursos livres', false, 'Dinheiro sem destino obrigatório: doações livres, cursos, eventos, rendimentos.')
  on conflict (workspace_id, nome) do nothing;
  insert into public.fin_config (workspace_id) values (p_workspace_id) on conflict (workspace_id) do nothing;
  if exists (select 1 from public.fin_categorias where workspace_id = p_workspace_id) then return; end if;
  insert into public.fin_categorias (workspace_id, tipo, grupo, nome, fixa, ordem)
  select p_workspace_id, c.tipo, c.grupo, c.nome, c.fixa, c.ordem
  from (values
    ('receita', 'Doações', 'Doações de pessoas', false, 10),
    ('receita', 'Doações', 'Doações de empresas', false, 11),
    ('receita', 'Doações', 'Doações em campanhas', false, 12),
    ('receita', 'Parcerias', 'Convênios e termos de fomento', false, 20),
    ('receita', 'Parcerias', 'Patrocínios', false, 21),
    ('receita', 'Atividades próprias', 'Cursos e capacitações', false, 30),
    ('receita', 'Atividades próprias', 'Eventos e coberturas', false, 31),
    ('receita', 'Atividades próprias', 'Contribuições de associados', false, 32),
    ('receita', 'Financeiras', 'Rendimentos de aplicação', false, 40),
    ('receita', 'Outras', 'Outras receitas', false, 90),
    ('despesa', 'Pessoal', 'Salários', true, 10),
    ('despesa', 'Pessoal', 'Encargos (INSS, FGTS)', true, 11),
    ('despesa', 'Pessoal', 'Benefícios', true, 12),
    ('despesa', 'Pessoal', 'Rescisões e férias', false, 13),
    ('despesa', 'Ocupação', 'Aluguel e condomínio', true, 20),
    ('despesa', 'Ocupação', 'Energia, água e gás', true, 21),
    ('despesa', 'Ocupação', 'Telefone e internet', true, 22),
    ('despesa', 'Ocupação', 'Manutenção e limpeza', false, 23),
    ('despesa', 'Operação', 'Material de primeiros socorros', false, 30),
    ('despesa', 'Operação', 'Material de escritório', false, 31),
    ('despesa', 'Operação', 'Transporte e combustível', false, 32),
    ('despesa', 'Operação', 'Alimentação', false, 33),
    ('despesa', 'Operação', 'Uniformes e equipamentos', false, 34),
    ('despesa', 'Serviços', 'Contabilidade e jurídico', true, 40),
    ('despesa', 'Serviços', 'Serviços de terceiros', false, 41),
    ('despesa', 'Serviços', 'Tecnologia e software', true, 42),
    ('despesa', 'Serviços', 'Comunicação e gráfica', false, 43),
    ('despesa', 'Financeiras', 'Tarifas bancárias', true, 50),
    ('despesa', 'Financeiras', 'Impostos e taxas', false, 51),
    ('despesa', 'Projetos', 'Eventos e ações', false, 60),
    ('despesa', 'Projetos', 'Ajuda humanitária', false, 61),
    ('despesa', 'Outras', 'Outras despesas', false, 90)
  ) as c (tipo, grupo, nome, fixa, ordem);
end $$;
revoke all on function private.semear_financeiro(uuid) from public, anon, authenticated;

create or replace function public.financeiro_preparar(p_workspace_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select private.nivel_financeiro(p_workspace_id)) < 1 then raise exception 'Você não tem acesso ao Financeiro.' using errcode = 'P0001'; end if;
  perform private.semear_financeiro(p_workspace_id);
end $$;

-- ---------------------------------------------------------------- cadastros

/** Contas, fontes e categorias: só gestão. p.id nulo cria. */
create or replace function public.financeiro_salvar_cadastro(p_workspace_id uuid, p_tabela text, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_nivel integer := (select private.nivel_financeiro(p_workspace_id));
  v_fonte uuid;
  v_projeto uuid;
begin
  if p_tabela = 'favorecido' then
    if v_nivel < 2 then raise exception 'Você não tem acesso para cadastrar favorecidos.' using errcode = 'P0001'; end if;
  elsif v_nivel < 4 then
    raise exception 'Só a gestão do Financeiro mexe em contas, fontes e categorias.' using errcode = 'P0001';
  end if;

  if p_tabela = 'conta' then
    v_fonte := nullif(p->>'fonte_id', '')::uuid;
    if v_fonte is not null and not exists (select 1 from public.fin_fontes where id = v_fonte and workspace_id = p_workspace_id) then
      raise exception 'Fonte inválida.' using errcode = 'P0001';
    end if;
    if v_id is null then
      insert into public.fin_contas (workspace_id, nome, tipo, banco, agencia, numero, fonte_id, saldo_inicial, saldo_inicial_em)
      values (p_workspace_id, trim(p->>'nome'), coalesce(p->>'tipo', 'corrente'), nullif(trim(p->>'banco'), ''), nullif(trim(p->>'agencia'), ''),
        nullif(trim(p->>'numero'), ''), v_fonte, coalesce((p->>'saldo_inicial')::numeric, 0), coalesce((p->>'saldo_inicial_em')::date, current_date))
      returning id into v_id;
    else
      -- O saldo inicial muda o saldo de todo mês depois dele: não mexe em mês fechado.
      if exists (select 1 from public.fin_contas c where c.id = v_id and c.workspace_id = p_workspace_id
          and (c.saldo_inicial is distinct from coalesce((p->>'saldo_inicial')::numeric, 0) or c.saldo_inicial_em is distinct from (p->>'saldo_inicial_em')::date)
          and (private.fin_fechado(p_workspace_id, c.saldo_inicial_em) or private.fin_fechado(p_workspace_id, (p->>'saldo_inicial_em')::date))) then
        raise exception 'O saldo inicial está num mês fechado.' using errcode = 'P0001';
      end if;
      update public.fin_contas set nome = trim(p->>'nome'), tipo = coalesce(p->>'tipo', tipo), banco = nullif(trim(p->>'banco'), ''),
        agencia = nullif(trim(p->>'agencia'), ''), numero = nullif(trim(p->>'numero'), ''), fonte_id = v_fonte,
        saldo_inicial = coalesce((p->>'saldo_inicial')::numeric, 0), saldo_inicial_em = coalesce((p->>'saldo_inicial_em')::date, saldo_inicial_em),
        ativa = coalesce((p->>'ativa')::boolean, ativa)
      where id = v_id and workspace_id = p_workspace_id;
      if not found then raise exception 'Conta não encontrada.' using errcode = 'P0001'; end if;
    end if;
  elsif p_tabela = 'fonte' then
    v_projeto := nullif(p->>'projeto_id', '')::uuid;
    if v_projeto is not null and not exists (select 1 from public.projects where id = v_projeto and workspace_id = p_workspace_id) then
      raise exception 'Projeto inválido.' using errcode = 'P0001';
    end if;
    if v_id is null then
      insert into public.fin_fontes (workspace_id, nome, restrita, projeto_id, financiador, descricao, inicio, fim, valor_previsto)
      values (p_workspace_id, trim(p->>'nome'), coalesce((p->>'restrita')::boolean, true), v_projeto, nullif(trim(p->>'financiador'), ''),
        nullif(trim(p->>'descricao'), ''), nullif(p->>'inicio', '')::date, nullif(p->>'fim', '')::date, nullif(p->>'valor_previsto', '')::numeric)
      returning id into v_id;
    else
      update public.fin_fontes set nome = trim(p->>'nome'), restrita = coalesce((p->>'restrita')::boolean, restrita), projeto_id = v_projeto,
        financiador = nullif(trim(p->>'financiador'), ''), descricao = nullif(trim(p->>'descricao'), ''), inicio = nullif(p->>'inicio', '')::date,
        fim = nullif(p->>'fim', '')::date, valor_previsto = nullif(p->>'valor_previsto', '')::numeric, ativa = coalesce((p->>'ativa')::boolean, ativa)
      where id = v_id and workspace_id = p_workspace_id;
      if not found then raise exception 'Fonte não encontrada.' using errcode = 'P0001'; end if;
    end if;
  elsif p_tabela = 'categoria' then
    if v_id is null then
      insert into public.fin_categorias (workspace_id, tipo, nome, grupo, codigo_contabil, fixa, ordem)
      values (p_workspace_id, p->>'tipo', trim(p->>'nome'), nullif(trim(p->>'grupo'), ''), nullif(trim(p->>'codigo_contabil'), ''),
        coalesce((p->>'fixa')::boolean, false), coalesce((p->>'ordem')::integer, 100))
      returning id into v_id;
    else
      -- O tipo não muda: os lançamentos já feitos dependem dele.
      update public.fin_categorias set nome = trim(p->>'nome'), grupo = nullif(trim(p->>'grupo'), ''), codigo_contabil = nullif(trim(p->>'codigo_contabil'), ''),
        fixa = coalesce((p->>'fixa')::boolean, fixa), ativa = coalesce((p->>'ativa')::boolean, ativa)
      where id = v_id and workspace_id = p_workspace_id;
      if not found then raise exception 'Categoria não encontrada.' using errcode = 'P0001'; end if;
    end if;
  elsif p_tabela = 'favorecido' then
    if v_id is null then
      insert into public.fin_favorecidos (workspace_id, nome, tipo_pessoa, documento, chave_pix, email, telefone, observacao)
      values (p_workspace_id, trim(p->>'nome'), coalesce(p->>'tipo_pessoa', 'pj'), nullif(regexp_replace(coalesce(p->>'documento', ''), '\D', '', 'g'), ''),
        nullif(trim(p->>'chave_pix'), ''), nullif(trim(p->>'email'), ''), nullif(trim(p->>'telefone'), ''), nullif(trim(p->>'observacao'), ''))
      returning id into v_id;
    else
      update public.fin_favorecidos set nome = trim(p->>'nome'), tipo_pessoa = coalesce(p->>'tipo_pessoa', tipo_pessoa),
        documento = nullif(regexp_replace(coalesce(p->>'documento', ''), '\D', '', 'g'), ''), chave_pix = nullif(trim(p->>'chave_pix'), ''),
        email = nullif(trim(p->>'email'), ''), telefone = nullif(trim(p->>'telefone'), ''), observacao = nullif(trim(p->>'observacao'), '')
      where id = v_id and workspace_id = p_workspace_id;
      if not found then raise exception 'Favorecido não encontrado.' using errcode = 'P0001'; end if;
    end if;
  else
    raise exception 'Cadastro inválido.' using errcode = 'P0001';
  end if;
  perform private.auditar_financeiro(p_workspace_id, null, 'cadastro', jsonb_build_object('tabela', p_tabela, 'id', v_id, 'novo', p->>'id' is null or p->>'id' = ''));
  return v_id;
exception
  when unique_violation then
    raise exception '%', case p_tabela when 'favorecido' then 'Já existe um favorecido com este CPF/CNPJ.' else 'Já existe um cadastro com este nome.' end using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------- lançamentos

/** Confere um lançamento contra os cadastros do espaço e devolve se pede aprovação. */
create or replace function private.fin_conferir(p_workspace_id uuid, l public.fin_lancamentos)
returns text language plpgsql security definer set search_path = '' stable as $$
declare
  cfg public.fin_config;
begin
  if not exists (select 1 from public.fin_contas where id = l.conta_id and workspace_id = p_workspace_id) then
    raise exception 'Conta inválida.' using errcode = 'P0001';
  end if;
  if l.conta_destino_id is not null and not exists (select 1 from public.fin_contas where id = l.conta_destino_id and workspace_id = p_workspace_id) then
    raise exception 'Conta de destino inválida.' using errcode = 'P0001';
  end if;
  if l.categoria_id is not null and not exists (select 1 from public.fin_categorias where id = l.categoria_id and workspace_id = p_workspace_id and tipo = l.tipo) then
    raise exception 'Categoria inválida para este tipo de lançamento.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.fin_fontes where id = l.fonte_id and workspace_id = p_workspace_id) then
    raise exception 'Fonte inválida.' using errcode = 'P0001';
  end if;
  if l.projeto_id is not null and not exists (select 1 from public.projects where id = l.projeto_id and workspace_id = p_workspace_id) then
    raise exception 'Projeto inválido.' using errcode = 'P0001';
  end if;
  if l.favorecido_id is not null and not exists (select 1 from public.fin_favorecidos where id = l.favorecido_id and workspace_id = p_workspace_id) then
    raise exception 'Favorecido inválido.' using errcode = 'P0001';
  end if;
  select * into cfg from public.fin_config where workspace_id = p_workspace_id;
  if l.tipo = 'despesa' and coalesce(cfg.aprovacao_ativa, false) and l.valor >= coalesce(cfg.aprovacao_acima, 0) then return 'pendente'; end if;
  return 'nao_exige';
end $$;
revoke all on function private.fin_conferir(uuid, public.fin_lancamentos) from public, anon, authenticated;

/** Um lançamento a partir do jsonb, sem gravar. */
create or replace function private.fin_do_json(p_workspace_id uuid, p jsonb)
returns public.fin_lancamentos language plpgsql security definer set search_path = '' immutable as $$
declare
  l public.fin_lancamentos;
begin
  l.workspace_id := p_workspace_id;
  l.tipo := p->>'tipo';
  l.descricao := left(trim(coalesce(p->>'descricao', '')), 200);
  l.valor := (p->>'valor')::numeric;
  l.conta_id := (p->>'conta_id')::uuid;
  l.conta_destino_id := nullif(p->>'conta_destino_id', '')::uuid;
  l.categoria_id := nullif(p->>'categoria_id', '')::uuid;
  l.fonte_id := (p->>'fonte_id')::uuid;
  l.projeto_id := nullif(p->>'projeto_id', '')::uuid;
  l.favorecido_id := nullif(p->>'favorecido_id', '')::uuid;
  l.competencia := (p->>'competencia')::date;
  l.vencimento := (p->>'vencimento')::date;
  l.pago_em := nullif(p->>'pago_em', '')::date;
  l.valor_pago := case when l.pago_em is null then null else coalesce(nullif(p->>'valor_pago', '')::numeric, l.valor) end;
  l.forma := nullif(p->>'forma', '');
  l.documento := nullif(left(trim(coalesce(p->>'documento', '')), 80), '');
  l.observacao := nullif(left(trim(coalesce(p->>'observacao', '')), 2000), '');
  l.parcela := nullif(p->>'parcela', '')::smallint;
  l.parcelas := nullif(p->>'parcelas', '')::smallint;
  l.recorrente := coalesce((p->>'recorrente')::boolean, false);
  return l;
end $$;
revoke all on function private.fin_do_json(uuid, jsonb) from public, anon, authenticated;

/**
 * Cria um ou mais lançamentos (parcelas e recorrência chegam prontas da
 * tela, uma por item) numa transação só. Mais de um item: mesmo grupo.
 */
create or replace function public.financeiro_criar_lancamentos(p_workspace_id uuid, p_itens jsonb)
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[] := '{}';
  v_grupo uuid := case when jsonb_array_length(p_itens) > 1 then gen_random_uuid() end;
  v_item jsonb;
  l public.fin_lancamentos;
  v_aprovacao text;
begin
  if (select private.nivel_financeiro(p_workspace_id)) < 2 then raise exception 'Você não tem acesso para lançar.' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) not between 1 and 120 then raise exception 'Lançamento inválido.' using errcode = 'P0001'; end if;
  for v_item in select * from jsonb_array_elements(p_itens) loop
    l := private.fin_do_json(p_workspace_id, v_item);
    v_aprovacao := private.fin_conferir(p_workspace_id, l);
    if l.pago_em is not null and v_aprovacao = 'pendente' then
      raise exception 'Esta despesa precisa de aprovação antes de ser marcada como paga.' using errcode = 'P0001';
    end if;
    if private.fin_fechado(p_workspace_id, l.pago_em) then raise exception 'A data do pagamento está num mês já fechado.' using errcode = 'P0001'; end if;
    insert into public.fin_lancamentos (workspace_id, tipo, descricao, valor, conta_id, conta_destino_id, categoria_id, fonte_id, projeto_id, favorecido_id,
      competencia, vencimento, pago_em, valor_pago, forma, documento, observacao, grupo_id, parcela, parcelas, recorrente, aprovacao, criado_por, atualizado_por)
    values (p_workspace_id, l.tipo, l.descricao, l.valor, l.conta_id, l.conta_destino_id, l.categoria_id, l.fonte_id, l.projeto_id, l.favorecido_id,
      l.competencia, l.vencimento, l.pago_em, l.valor_pago, l.forma, l.documento, l.observacao, v_grupo, l.parcela, l.parcelas, l.recorrente, v_aprovacao,
      (select auth.uid()), (select auth.uid()))
    returning id into l.id;
    v_ids := v_ids || l.id;
  end loop;
  perform private.auditar_financeiro(p_workspace_id, v_ids[1], 'criar', jsonb_build_object('quantidade', array_length(v_ids, 1), 'grupo', v_grupo));
  return v_ids;
end $$;

/**
 * Edita um lançamento. Escopo 'futuros': o mesmo vale para as próximas
 * parcelas ou recorrências ainda em aberto (menos datas, que são de cada
 * uma). Mudar o valor de uma despesa volta a pedir aprovação, se for o caso.
 */
create or replace function public.financeiro_atualizar_lancamento(p_id uuid, p jsonb, p_escopo text default 'este')
returns integer language plpgsql security definer set search_path = '' as $$
declare
  a public.fin_lancamentos;
  n public.fin_lancamentos;
  alvo public.fin_lancamentos;
  v_aprovacao text;
  v_total integer := 0;
begin
  select * into a from public.fin_lancamentos where id = p_id for update;
  if not found or (select private.nivel_financeiro(a.workspace_id)) < 2 then raise exception 'Lançamento não encontrado.' using errcode = 'P0001'; end if;
  if private.fin_fechado(a.workspace_id, a.pago_em) then raise exception 'Este lançamento foi pago num mês já fechado e não muda mais.' using errcode = 'P0001'; end if;
  n := private.fin_do_json(a.workspace_id, p || jsonb_build_object('tipo', a.tipo));
  for alvo in
    select * from public.fin_lancamentos x
    where x.id = p_id
       or (p_escopo = 'futuros' and a.grupo_id is not null and x.grupo_id = a.grupo_id and x.vencimento > a.vencimento and x.pago_em is null)
    order by x.vencimento
  loop
    alvo.descricao := n.descricao; alvo.valor := n.valor; alvo.conta_id := n.conta_id; alvo.conta_destino_id := n.conta_destino_id;
    alvo.categoria_id := n.categoria_id; alvo.fonte_id := n.fonte_id; alvo.projeto_id := n.projeto_id; alvo.favorecido_id := n.favorecido_id;
    alvo.forma := n.forma; alvo.observacao := n.observacao;
    if alvo.id = p_id then
      alvo.competencia := n.competencia; alvo.vencimento := n.vencimento; alvo.documento := n.documento;
    end if;
    v_aprovacao := private.fin_conferir(alvo.workspace_id, alvo);
    -- A aprovação só é revista quando o valor muda (ou quando uma recusada
    -- é corrigida, que volta para a fila). Corrigir a descrição de algo já
    -- aprovado ou já pago não pede aprovação de novo.
    if alvo.valor <> (select x.valor from public.fin_lancamentos x where x.id = alvo.id) or alvo.aprovacao in ('recusada', 'pendente') then
      if v_aprovacao = 'pendente' and alvo.pago_em is not null then
        raise exception 'Este valor pede aprovação, e a despesa já está paga. Desfaça o pagamento primeiro.' using errcode = 'P0001';
      end if;
      alvo.aprovacao := v_aprovacao;
      alvo.aprovado_por := null; alvo.aprovado_em := null; alvo.motivo_recusa := null;
    end if;
    update public.fin_lancamentos set descricao = alvo.descricao, valor = alvo.valor, conta_id = alvo.conta_id, conta_destino_id = alvo.conta_destino_id,
      categoria_id = alvo.categoria_id, fonte_id = alvo.fonte_id, projeto_id = alvo.projeto_id, favorecido_id = alvo.favorecido_id, forma = alvo.forma,
      observacao = alvo.observacao, competencia = alvo.competencia, vencimento = alvo.vencimento, documento = alvo.documento,
      aprovacao = alvo.aprovacao, aprovado_por = alvo.aprovado_por, aprovado_em = alvo.aprovado_em, motivo_recusa = alvo.motivo_recusa,
      atualizado_por = (select auth.uid()), updated_at = now()
    where id = alvo.id;
    v_total := v_total + 1;
  end loop;
  perform private.auditar_financeiro(a.workspace_id, p_id, 'editar', jsonb_build_object('escopo', p_escopo, 'quantidade', v_total,
    'valor_antes', a.valor, 'valor_depois', n.valor));
  return v_total;
end $$;

create or replace function public.financeiro_pagar(p_id uuid, p_pago_em date, p_valor_pago numeric default null, p_conta_id uuid default null, p_forma text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.fin_lancamentos;
begin
  select * into a from public.fin_lancamentos where id = p_id for update;
  if not found or (select private.nivel_financeiro(a.workspace_id)) < 2 then raise exception 'Lançamento não encontrado.' using errcode = 'P0001'; end if;
  if a.aprovacao = 'pendente' then raise exception 'Esta despesa ainda espera aprovação.' using errcode = 'P0001'; end if;
  if a.aprovacao = 'recusada' then raise exception 'Esta despesa foi recusada e não pode ser paga.' using errcode = 'P0001'; end if;
  if p_pago_em is null or p_pago_em > current_date + 1 then raise exception 'Informe a data em que foi pago (não pode ser no futuro).' using errcode = 'P0001'; end if;
  if private.fin_fechado(a.workspace_id, a.pago_em) or private.fin_fechado(a.workspace_id, p_pago_em) then
    raise exception 'A data do pagamento está num mês já fechado.' using errcode = 'P0001';
  end if;
  if p_conta_id is not null and not exists (select 1 from public.fin_contas where id = p_conta_id and workspace_id = a.workspace_id) then
    raise exception 'Conta inválida.' using errcode = 'P0001';
  end if;
  if p_conta_id is not null and p_conta_id = a.conta_destino_id then raise exception 'A conta de origem e a de destino são a mesma.' using errcode = 'P0001'; end if;
  update public.fin_lancamentos set pago_em = p_pago_em, valor_pago = coalesce(p_valor_pago, a.valor), conta_id = coalesce(p_conta_id, a.conta_id),
    forma = coalesce(nullif(p_forma, ''), a.forma), atualizado_por = (select auth.uid()), updated_at = now()
  where id = p_id;
  perform private.auditar_financeiro(a.workspace_id, p_id, 'pagar', jsonb_build_object('pago_em', p_pago_em, 'valor_pago', coalesce(p_valor_pago, a.valor)));
end $$;

create or replace function public.financeiro_desfazer_pagamento(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.fin_lancamentos;
begin
  select * into a from public.fin_lancamentos where id = p_id for update;
  if not found or (select private.nivel_financeiro(a.workspace_id)) < 2 then raise exception 'Lançamento não encontrado.' using errcode = 'P0001'; end if;
  if a.pago_em is null then return; end if;
  if private.fin_fechado(a.workspace_id, a.pago_em) then raise exception 'Foi pago num mês já fechado e não muda mais.' using errcode = 'P0001'; end if;
  update public.fin_lancamentos set pago_em = null, valor_pago = null, atualizado_por = (select auth.uid()), updated_at = now() where id = p_id;
  perform private.auditar_financeiro(a.workspace_id, p_id, 'desfazer_pagamento', jsonb_build_object('pago_em', a.pago_em, 'valor_pago', a.valor_pago));
end $$;

/** Exclui o que ainda não foi pago. Devolve os anexos, para o servidor apagar do Storage. */
create or replace function public.financeiro_excluir_lancamento(p_id uuid, p_escopo text default 'este')
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  a public.fin_lancamentos;
  v_ids uuid[];
  v_caminhos text[];
begin
  select * into a from public.fin_lancamentos where id = p_id for update;
  if not found or (select private.nivel_financeiro(a.workspace_id)) < 2 then raise exception 'Lançamento não encontrado.' using errcode = 'P0001'; end if;
  if a.pago_em is not null then raise exception 'Já foi pago. Desfaça o pagamento antes de excluir.' using errcode = 'P0001'; end if;
  select array_agg(x.id) into v_ids from public.fin_lancamentos x
  where x.id = p_id or (p_escopo = 'futuros' and a.grupo_id is not null and x.grupo_id = a.grupo_id and x.vencimento > a.vencimento and x.pago_em is null);
  select coalesce(array_agg(caminho), '{}') into v_caminhos from public.fin_anexos where lancamento_id = any (v_ids);
  perform private.auditar_financeiro(a.workspace_id, null, 'excluir', jsonb_build_object('id', p_id, 'descricao', a.descricao, 'valor', a.valor,
    'vencimento', a.vencimento, 'quantidade', array_length(v_ids, 1)));
  delete from public.fin_lancamentos where id = any (v_ids);
  return v_caminhos;
end $$;

/** Aprova ou recusa. Quem lançou nunca decide a própria despesa. */
create or replace function public.financeiro_decidir(p_id uuid, p_aprovar boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.fin_lancamentos;
begin
  select * into a from public.fin_lancamentos where id = p_id for update;
  if not found or (select private.nivel_financeiro(a.workspace_id)) < 1 then raise exception 'Lançamento não encontrado.' using errcode = 'P0001'; end if;
  if (select private.nivel_financeiro(a.workspace_id)) < 3 then raise exception 'Você não tem acesso para aprovar despesas.' using errcode = 'P0001'; end if;
  if a.aprovacao <> 'pendente' then raise exception 'Esta despesa não está esperando aprovação.' using errcode = 'P0001'; end if;
  if a.criado_por = (select auth.uid()) then raise exception 'Quem lançou a despesa não pode aprová-la. Peça a outra pessoa com acesso de aprovação.' using errcode = 'P0001'; end if;
  if not p_aprovar and char_length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Diga o motivo da recusa.' using errcode = 'P0001'; end if;
  update public.fin_lancamentos set aprovacao = case when p_aprovar then 'aprovada' else 'recusada' end, aprovado_por = (select auth.uid()), aprovado_em = now(),
    motivo_recusa = case when p_aprovar then null else left(trim(p_motivo), 600) end, updated_at = now()
  where id = p_id;
  perform private.auditar_financeiro(a.workspace_id, p_id, case when p_aprovar then 'aprovar' else 'recusar' end,
    jsonb_build_object('valor', a.valor, 'motivo', nullif(trim(coalesce(p_motivo, '')), '')));
end $$;

create or replace function public.financeiro_salvar_config(p_workspace_id uuid, p_aprovacao_ativa boolean, p_aprovacao_acima numeric, p_reserva_minima_meses numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select private.nivel_financeiro(p_workspace_id)) < 4 then raise exception 'Só a gestão do Financeiro muda estas regras.' using errcode = 'P0001'; end if;
  if p_aprovacao_ativa and p_aprovacao_acima is null then raise exception 'Informe a partir de que valor a despesa pede aprovação.' using errcode = 'P0001'; end if;
  insert into public.fin_config (workspace_id, aprovacao_ativa, aprovacao_acima, reserva_minima_meses, atualizado_por, updated_at)
  values (p_workspace_id, p_aprovacao_ativa, p_aprovacao_acima, coalesce(p_reserva_minima_meses, 3), (select auth.uid()), now())
  on conflict (workspace_id) do update set aprovacao_ativa = excluded.aprovacao_ativa, aprovacao_acima = excluded.aprovacao_acima,
    reserva_minima_meses = excluded.reserva_minima_meses, atualizado_por = excluded.atualizado_por, updated_at = now();
  perform private.auditar_financeiro(p_workspace_id, null, 'regras', jsonb_build_object('aprovacao_ativa', p_aprovacao_ativa, 'aprovacao_acima', p_aprovacao_acima,
    'reserva_minima_meses', p_reserva_minima_meses));
end $$;

create or replace function public.definir_acesso_financeiro(p_workspace_id uuid, p_user_id uuid, p_nivel text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select private.workspace_role(p_workspace_id)) is distinct from 'admin' then
    raise exception 'Só um admin define quem acessa o Financeiro.' using errcode = 'P0001';
  end if;
  if p_nivel is not null and p_nivel not in ('ver','lancar','aprovar','gestao') then raise exception 'Nível inválido.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = p_user_id) then
    raise exception 'A pessoa precisa ser do espaço.' using errcode = 'P0001';
  end if;
  if p_nivel is null then
    delete from public.fin_acesso where workspace_id = p_workspace_id and user_id = p_user_id;
  else
    insert into public.fin_acesso (workspace_id, user_id, nivel, concedido_por) values (p_workspace_id, p_user_id, p_nivel, (select auth.uid()))
    on conflict (workspace_id, user_id) do update set nivel = excluded.nivel, concedido_por = excluded.concedido_por, concedido_em = now();
  end if;
  perform private.auditar_financeiro(p_workspace_id, null, 'acesso', jsonb_build_object('usuario', p_user_id, 'nivel', p_nivel));
end $$;

-- ---------------------------------------------------------------- anexos

create or replace function public.registrar_anexo_financeiro(p_lancamento_id uuid, p_caminho text, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  a public.fin_lancamentos;
  v_id uuid;
begin
  select * into a from public.fin_lancamentos where id = p_lancamento_id;
  if not found or (select private.nivel_financeiro(a.workspace_id)) < 2 then raise exception 'Lançamento não encontrado.' using errcode = 'P0001'; end if;
  if private.fin_fechado(a.workspace_id, a.pago_em) and coalesce(p->>'tipo_doc', '') <> 'comprovante' then
    raise exception 'Mês fechado: só dá para juntar comprovante.' using errcode = 'P0001';
  end if;
  -- O caminho foi gerado pelo servidor para este lançamento; confere de novo.
  if p_caminho !~ ('^' || a.workspace_id::text || '/' || a.id::text || '/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$') then
    raise exception 'Arquivo inválido.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'financeiro-anexos' and o.name = p_caminho) then
    raise exception 'O arquivo não chegou. Envie de novo.' using errcode = 'P0001';
  end if;
  insert into public.fin_anexos (workspace_id, lancamento_id, caminho, nome_original, tipo_doc, mime, tamanho, enviado_por)
  values (a.workspace_id, a.id, p_caminho, left(coalesce(nullif(trim(p->>'nome_original'), ''), 'arquivo'), 200), coalesce(p->>'tipo_doc', 'outro'),
    coalesce(p->>'mime', 'application/octet-stream'), greatest(coalesce((p->>'tamanho')::integer, 1), 1), (select auth.uid()))
  returning id into v_id;
  perform private.auditar_financeiro(a.workspace_id, a.id, 'anexar', jsonb_build_object('anexo', v_id, 'tipo_doc', p->>'tipo_doc'));
  return v_id;
end $$;

create or replace function public.selar_anexo_financeiro(p_id uuid, p_sha256 text)
returns void language sql security definer set search_path = '' as $$
  update public.fin_anexos set sha256 = p_sha256 where id = p_id and sha256 is null
$$;

create or replace function public.abrir_anexo_financeiro(p_id uuid)
returns table (caminho text, nome_original text, mime text)
language plpgsql security definer set search_path = '' as $$
declare
  x public.fin_anexos;
begin
  select * into x from public.fin_anexos where id = p_id;
  if not found or (select private.nivel_financeiro(x.workspace_id)) < 1 then raise exception 'Arquivo não encontrado.' using errcode = 'P0001'; end if;
  return query select x.caminho, x.nome_original, x.mime;
end $$;

create or replace function public.excluir_anexo_financeiro(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  x public.fin_anexos;
  a public.fin_lancamentos;
begin
  select * into x from public.fin_anexos where id = p_id;
  if not found or (select private.nivel_financeiro(x.workspace_id)) < 2 then raise exception 'Arquivo não encontrado.' using errcode = 'P0001'; end if;
  select * into a from public.fin_lancamentos where id = x.lancamento_id;
  if private.fin_fechado(a.workspace_id, a.pago_em) then raise exception 'Mês fechado: o comprovante faz parte do fechamento e não sai mais.' using errcode = 'P0001'; end if;
  delete from public.fin_anexos where id = p_id;
  perform private.auditar_financeiro(x.workspace_id, x.lancamento_id, 'excluir_anexo', jsonb_build_object('nome', x.nome_original, 'sha256', x.sha256));
  return x.caminho;
end $$;

-- ---------------------------------------------------------------- permissões das funções

revoke all on function public.financeiro_preparar(uuid) from public, anon;
revoke all on function public.financeiro_salvar_cadastro(uuid, text, jsonb) from public, anon;
revoke all on function public.financeiro_criar_lancamentos(uuid, jsonb) from public, anon;
revoke all on function public.financeiro_atualizar_lancamento(uuid, jsonb, text) from public, anon;
revoke all on function public.financeiro_pagar(uuid, date, numeric, uuid, text) from public, anon;
revoke all on function public.financeiro_desfazer_pagamento(uuid) from public, anon;
revoke all on function public.financeiro_excluir_lancamento(uuid, text) from public, anon;
revoke all on function public.financeiro_decidir(uuid, boolean, text) from public, anon;
revoke all on function public.financeiro_salvar_config(uuid, boolean, numeric, numeric) from public, anon;
revoke all on function public.definir_acesso_financeiro(uuid, uuid, text) from public, anon;
revoke all on function public.registrar_anexo_financeiro(uuid, text, jsonb) from public, anon;
revoke all on function public.selar_anexo_financeiro(uuid, text) from public, anon, authenticated;
revoke all on function public.abrir_anexo_financeiro(uuid) from public, anon;
revoke all on function public.excluir_anexo_financeiro(uuid) from public, anon;
grant execute on function public.financeiro_preparar(uuid) to authenticated;
grant execute on function public.financeiro_salvar_cadastro(uuid, text, jsonb) to authenticated;
grant execute on function public.financeiro_criar_lancamentos(uuid, jsonb) to authenticated;
grant execute on function public.financeiro_atualizar_lancamento(uuid, jsonb, text) to authenticated;
grant execute on function public.financeiro_pagar(uuid, date, numeric, uuid, text) to authenticated;
grant execute on function public.financeiro_desfazer_pagamento(uuid) to authenticated;
grant execute on function public.financeiro_excluir_lancamento(uuid, text) to authenticated;
grant execute on function public.financeiro_decidir(uuid, boolean, text) to authenticated;
grant execute on function public.financeiro_salvar_config(uuid, boolean, numeric, numeric) to authenticated;
grant execute on function public.definir_acesso_financeiro(uuid, uuid, text) to authenticated;
grant execute on function public.registrar_anexo_financeiro(uuid, text, jsonb) to authenticated;
grant execute on function public.selar_anexo_financeiro(uuid, text) to service_role;
grant execute on function public.abrir_anexo_financeiro(uuid) to authenticated;
grant execute on function public.excluir_anexo_financeiro(uuid) to authenticated;

-- ---------------------------------------------------------------- notificações

-- Assunto novo no sino e nas preferências de e-mail: contas vencendo e o fechamento.
alter table public.notifications drop constraint if exists notifications_categoria_valida;
alter table public.notifications add constraint notifications_categoria_valida
  check (categoria in ('geral','aprovacoes','mensagens','pautas','chamados','oficios','financeiro'));

-- Os espaços que já existem começam com as categorias e a fonte livre.
do $$
declare w uuid;
begin
  for w in select id from public.workspaces loop perform private.semear_financeiro(w); end loop;
end $$;
