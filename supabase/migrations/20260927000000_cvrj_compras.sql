-- Compras (1): pedido de compra, cotação com mapa comparativo e aprovação.
--
-- Inspiração: o manual de compras da Cruz Vermelha (IFRC) — mínimo de três
-- propostas acima de um valor, mapa comparativo aprovado antes de fechar,
-- mesma especificação para todos os fornecedores — e o ciclo do ERPNext
-- (pedido → cotação → ordem de compra → recebimento → conta a pagar).
--
-- Quem faz o quê:
--  - qualquer pessoa da Redação abre um pedido e acompanha os seus;
--  - quem tem nível "lançar" no Financeiro (da empresa do pedido) classifica,
--    registra as propostas e manda para aprovação;
--  - quem tem nível "aprovar" aprova (nunca o próprio pedido); acima do limite
--    da Diretoria, também alguém da Diretoria (outra pessoa).
--
-- Faixas (compras_config, editáveis): até limite_simples basta uma proposta;
-- acima, cotacoes_minimas; acima de limite_diretoria, também a Diretoria.
-- Menos propostas que o exigido, ou escolher uma que não é a mais barata,
-- exige justificativa escrita — fica no pedido e no histórico.
--
-- Nomes: "Orçamento" no Financeiro é a verba por categoria. O preço do
-- fornecedor é a PROPOSTA; o conjunto, a COTAÇÃO.
--
-- Escrita só pelas funções abaixo; as tabelas têm apenas leitura por RLS.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('compras-arquivos', 'compras-arquivos', false, 20971520, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------- tabelas

create table if not exists public.compras_config (
  workspace_id        uuid primary key references public.workspaces (id) on delete cascade,
  limite_simples      numeric(14,2) not null default 1000 check (limite_simples >= 0),
  limite_diretoria    numeric(14,2) not null default 10000 check (limite_diretoria >= 0),
  cotacoes_minimas    smallint not null default 3 check (cotacoes_minimas between 1 and 10),
  -- O setor cujos membros aprovam como Diretoria. Vazio: o setor chamado "Diretoria".
  diretoria_setor_id  uuid references public.setores (id) on delete set null,
  atualizado_por      uuid references public.profiles (id) on delete set null,
  updated_at          timestamptz not null default now(),
  check (limite_diretoria >= limite_simples)
);
create index if not exists compras_config_setor_idx on public.compras_config (diretoria_setor_id);

create table if not exists public.compras_pedidos (
  id                      uuid primary key default gen_random_uuid(),
  workspace_id            uuid not null references public.workspaces (id) on delete cascade,
  entidade_id             uuid not null references public.fin_entidades (id) on delete restrict,
  ano                     smallint not null,
  numero                  integer not null check (numero > 0),
  titulo                  text not null check (char_length(titulo) between 3 and 160),
  justificativa           text not null check (char_length(justificativa) between 3 and 2000),
  setor_id                uuid references public.setores (id) on delete set null,
  projeto_id              uuid references public.projects (id) on delete set null,
  necessario_ate          date,
  local_entrega           text check (char_length(local_entrega) <= 200),
  -- Classificação (o Financeiro preenche): de onde sai o dinheiro e em que categoria.
  categoria_id            uuid references public.fin_categorias (id) on delete restrict,
  fonte_id                uuid references public.fin_fontes (id) on delete restrict,
  valor_estimado          numeric(14,2) not null default 0 check (valor_estimado >= 0),
  estado                  text not null default 'aberto'
                          check (estado in ('aberto','em_cotacao','em_aprovacao','aprovado','recusado','cancelado')),
  -- A escolha e o que as faixas exigiram no momento do envio para aprovação.
  proposta_id             uuid,
  valor_aprovado          numeric(14,2) check (valor_aprovado is null or valor_aprovado >= 0),
  exige_propostas         smallint,
  exige_diretoria         boolean not null default false,
  justificativa_escolha   text check (char_length(justificativa_escolha) <= 2000),
  enviado_aprovacao_por   uuid references public.profiles (id) on delete set null,
  enviado_aprovacao_em    timestamptz,
  aprovado_fin_por        uuid references public.profiles (id) on delete set null,
  aprovado_fin_em         timestamptz,
  aprovado_dir_por        uuid references public.profiles (id) on delete set null,
  aprovado_dir_em         timestamptz,
  aprovado_em             timestamptz,
  encerrado_por           uuid references public.profiles (id) on delete set null,
  encerrado_em            timestamptz,
  motivo_encerramento     text check (char_length(motivo_encerramento) <= 1000),
  solicitante_id          uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (workspace_id, ano, numero)
);
create index if not exists compras_pedidos_ws_idx on public.compras_pedidos (workspace_id, estado, created_at desc);
create index if not exists compras_pedidos_entidade_idx on public.compras_pedidos (entidade_id);
create index if not exists compras_pedidos_solicitante_idx on public.compras_pedidos (solicitante_id);
create index if not exists compras_pedidos_setor_idx on public.compras_pedidos (setor_id);
create index if not exists compras_pedidos_projeto_idx on public.compras_pedidos (projeto_id);
create index if not exists compras_pedidos_categoria_idx on public.compras_pedidos (categoria_id);
create index if not exists compras_pedidos_fonte_idx on public.compras_pedidos (fonte_id);
create index if not exists compras_pedidos_proposta_idx on public.compras_pedidos (proposta_id);
create index if not exists compras_pedidos_env_idx on public.compras_pedidos (enviado_aprovacao_por);
create index if not exists compras_pedidos_fin_idx on public.compras_pedidos (aprovado_fin_por);
create index if not exists compras_pedidos_dir_idx on public.compras_pedidos (aprovado_dir_por);
create index if not exists compras_pedidos_enc_idx on public.compras_pedidos (encerrado_por);

create table if not exists public.compras_itens (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces (id) on delete cascade,
  pedido_id            uuid not null references public.compras_pedidos (id) on delete cascade,
  ordem                smallint not null default 1,
  descricao            text not null check (char_length(descricao) between 2 and 300),
  especificacao        text check (char_length(especificacao) <= 2000),
  quantidade           numeric(12,3) not null check (quantidade > 0),
  unidade              text not null default 'un' check (char_length(unidade) between 1 and 20),
  valor_estimado_unit  numeric(14,2) check (valor_estimado_unit is null or valor_estimado_unit >= 0)
);
create index if not exists compras_itens_pedido_idx on public.compras_itens (pedido_id, ordem);
create index if not exists compras_itens_ws_idx on public.compras_itens (workspace_id);

create table if not exists public.compras_propostas (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  pedido_id           uuid not null references public.compras_pedidos (id) on delete cascade,
  favorecido_id       uuid not null references public.fin_favorecidos (id) on delete restrict,
  recebida_em         date not null default current_date,
  validade            date,
  prazo_entrega       text check (char_length(prazo_entrega) <= 120),
  condicao_pagamento  text check (char_length(condicao_pagamento) <= 120),
  frete               numeric(14,2) not null default 0 check (frete >= 0),
  observacao          text check (char_length(observacao) <= 1000),
  arquivo_caminho     text unique,
  arquivo_nome        text check (char_length(arquivo_nome) <= 200),
  arquivo_mime        text check (char_length(arquivo_mime) <= 100),
  arquivo_tamanho     integer check (arquivo_tamanho is null or arquivo_tamanho > 0),
  criado_por          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (pedido_id, favorecido_id)
);
create index if not exists compras_propostas_ws_idx on public.compras_propostas (workspace_id);
create index if not exists compras_propostas_fav_idx on public.compras_propostas (favorecido_id);
create index if not exists compras_propostas_criado_idx on public.compras_propostas (criado_por);

alter table public.compras_pedidos drop constraint if exists compras_pedidos_proposta_fk;
alter table public.compras_pedidos add constraint compras_pedidos_proposta_fk
  foreign key (proposta_id) references public.compras_propostas (id) on delete set null;

create table if not exists public.compras_proposta_itens (
  proposta_id     uuid not null references public.compras_propostas (id) on delete cascade,
  item_id         uuid not null references public.compras_itens (id) on delete cascade,
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  -- Vazio: o fornecedor não cotou este item.
  valor_unitario  numeric(14,2) check (valor_unitario is null or valor_unitario >= 0),
  primary key (proposta_id, item_id)
);
create index if not exists compras_proposta_itens_item_idx on public.compras_proposta_itens (item_id);
create index if not exists compras_proposta_itens_ws_idx on public.compras_proposta_itens (workspace_id);

-- A trilha do pedido: quem fez o quê e quando (prestação de contas).
create table if not exists public.compras_historico (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  pedido_id     uuid not null references public.compras_pedidos (id) on delete cascade,
  acao          text not null check (char_length(acao) <= 40),
  detalhe       jsonb not null default '{}',
  por           uuid references public.profiles (id) on delete set null,
  em            timestamptz not null default now()
);
create index if not exists compras_historico_pedido_idx on public.compras_historico (pedido_id, em);
create index if not exists compras_historico_ws_idx on public.compras_historico (workspace_id);
create index if not exists compras_historico_por_idx on public.compras_historico (por);

-- ---------------------------------------------------------------- quem vê

-- Diretoria: membro do setor configurado (ou do setor chamado "Diretoria").
-- Setor sem ninguém: vale o administrador do espaço — para a aprovação nunca travar.
create or replace function private.compras_eh_diretoria(p_workspace_id uuid)
returns boolean language plpgsql security definer set search_path = '' stable as $$
declare
  v_setor uuid;
begin
  if not (select private.is_workspace_member(p_workspace_id)) then return false; end if;
  select coalesce(c.diretoria_setor_id, (select s.id from public.setores s where s.workspace_id = p_workspace_id and private.chave_do_nome(s.nome) = 'diretoria' limit 1))
    into v_setor from (select 1) x left join public.compras_config c on c.workspace_id = p_workspace_id;
  if v_setor is not null and exists (select 1 from public.setor_membros m where m.setor_id = v_setor) then
    return exists (select 1 from public.setor_membros m where m.setor_id = v_setor and m.user_id = (select auth.uid()));
  end if;
  return (select private.workspace_role(p_workspace_id)) = 'admin';
end $$;

create or replace function private.compras_pode_ver(p_pedido_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.compras_pedidos p
    where p.id = p_pedido_id and (
      (p.solicitante_id = (select auth.uid()) and (select private.is_workspace_member(p.workspace_id)))
      or (select private.nivel_fin(p.workspace_id, p.entidade_id)) >= 1
      or (p.exige_diretoria and (select private.compras_eh_diretoria(p.workspace_id)))
    )
  )
$$;

revoke all on function private.compras_eh_diretoria(uuid), private.compras_pode_ver(uuid) from public, anon;
grant execute on function private.compras_eh_diretoria(uuid), private.compras_pode_ver(uuid) to authenticated;

alter table public.compras_config enable row level security;
alter table public.compras_pedidos enable row level security;
alter table public.compras_itens enable row level security;
alter table public.compras_propostas enable row level security;
alter table public.compras_proposta_itens enable row level security;
alter table public.compras_historico enable row level security;
revoke all on public.compras_config, public.compras_pedidos, public.compras_itens, public.compras_propostas, public.compras_proposta_itens, public.compras_historico from anon;
revoke insert, update, delete, truncate, references, trigger on public.compras_config, public.compras_pedidos, public.compras_itens, public.compras_propostas, public.compras_proposta_itens, public.compras_historico from authenticated;
grant select on public.compras_config, public.compras_pedidos, public.compras_itens, public.compras_propostas, public.compras_proposta_itens, public.compras_historico to authenticated;

create policy compras_config_select on public.compras_config for select to authenticated
  using ((select private.is_workspace_member(workspace_id)) or (select private.nivel_fin_algum(workspace_id)) >= 1);
create policy compras_pedidos_select on public.compras_pedidos for select to authenticated using ((select private.compras_pode_ver(id)));
create policy compras_itens_select on public.compras_itens for select to authenticated using ((select private.compras_pode_ver(pedido_id)));
create policy compras_propostas_select on public.compras_propostas for select to authenticated using ((select private.compras_pode_ver(pedido_id)));
create policy compras_proposta_itens_select on public.compras_proposta_itens for select to authenticated
  using (exists (select 1 from public.compras_propostas p where p.id = proposta_id and (select private.compras_pode_ver(p.pedido_id))));
create policy compras_historico_select on public.compras_historico for select to authenticated using ((select private.compras_pode_ver(pedido_id)));

-- ---------------------------------------------------------------- apoio

create or replace function private.compras_registrar(p_pedido public.compras_pedidos, p_acao text, p_detalhe jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.compras_historico (workspace_id, pedido_id, acao, detalhe, por)
  values (p_pedido.workspace_id, p_pedido.id, p_acao, coalesce(p_detalhe, '{}'), (select auth.uid()))
$$;

-- As faixas do espaço (as padrão, se ninguém mexeu).
create or replace function private.compras_regras(p_workspace_id uuid)
returns table (limite_simples numeric, limite_diretoria numeric, cotacoes_minimas smallint)
language sql security definer set search_path = '' stable as $$
  select coalesce(c.limite_simples, 1000), coalesce(c.limite_diretoria, 10000), coalesce(c.cotacoes_minimas, 3::smallint)
  from (select 1) x left join public.compras_config c on c.workspace_id = p_workspace_id
$$;

-- Total de cada proposta do pedido e se ela cota todos os itens.
create or replace function private.compras_totais(p_pedido_id uuid)
returns table (proposta_id uuid, total numeric, completa boolean)
language sql security definer set search_path = '' stable as $$
  select p.id,
    coalesce((select sum(round(i.quantidade * pi.valor_unitario, 2)) from public.compras_itens i
      join public.compras_proposta_itens pi on pi.item_id = i.id and pi.proposta_id = p.id and pi.valor_unitario is not null
      where i.pedido_id = p_pedido_id), 0) + p.frete,
    (select count(*) from public.compras_itens i where i.pedido_id = p_pedido_id) > 0
      and not exists (select 1 from public.compras_itens i where i.pedido_id = p_pedido_id and not exists (
        select 1 from public.compras_proposta_itens pi where pi.item_id = i.id and pi.proposta_id = p.id and pi.valor_unitario is not null))
  from public.compras_propostas p where p.pedido_id = p_pedido_id
$$;

revoke all on function private.compras_registrar(public.compras_pedidos, text, jsonb), private.compras_regras(uuid), private.compras_totais(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- pedido

-- Cria (p_id nulo) ou altera um pedido, com os itens. Quem pediu altera enquanto
-- ninguém começou a cotar; o Financeiro (lançar) altera até mandar para aprovação.
create or replace function public.compras_salvar_pedido(p_workspace_id uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_eu uuid := (select auth.uid());
  v_ped public.compras_pedidos;
  v_ent uuid;
  v_fin integer;
  v_ano smallint := extract(year from (now() at time zone 'America/Sao_Paulo'))::smallint;
  v_num integer;
  v_id uuid;
  v_titulo text := trim(coalesce(p->>'titulo', ''));
  v_just text := trim(coalesce(p->>'justificativa', ''));
  v_setor uuid := nullif(p->>'setor_id', '')::uuid;
  v_projeto uuid := nullif(p->>'projeto_id', '')::uuid;
  v_categoria uuid := nullif(p->>'categoria_id', '')::uuid;
  v_fonte uuid := nullif(p->>'fonte_id', '')::uuid;
  v_itens jsonb := coalesce(p->'itens', '[]');
  it jsonb;
  v_ordem smallint := 0;
  v_mantidos uuid[] := '{}';
  v_item uuid;
begin
  if char_length(v_titulo) < 3 or char_length(v_titulo) > 160 then raise exception 'Dê um título ao pedido (de 3 a 160 caracteres).' using errcode = 'P0001'; end if;
  if char_length(v_just) < 3 or char_length(v_just) > 2000 then raise exception 'Diga para que é a compra.' using errcode = 'P0001'; end if;
  if jsonb_typeof(v_itens) <> 'array' or jsonb_array_length(v_itens) < 1 then raise exception 'Inclua ao menos um item.' using errcode = 'P0001'; end if;
  if jsonb_array_length(v_itens) > 60 then raise exception 'Até 60 itens por pedido; para mais, divida em pedidos.' using errcode = 'P0001'; end if;
  if v_setor is not null and not exists (select 1 from public.setores s where s.id = v_setor and s.workspace_id = p_workspace_id) then raise exception 'Setor inválido.' using errcode = 'P0001'; end if;
  if v_projeto is not null and not exists (select 1 from public.projects x where x.id = v_projeto and x.workspace_id = p_workspace_id) then raise exception 'Projeto inválido.' using errcode = 'P0001'; end if;

  if p_id is null then
    if not (select private.is_workspace_member(p_workspace_id)) then raise exception 'Só a equipe da Redação abre pedidos de compra.' using errcode = 'P0001'; end if;
    v_ent := nullif(p->>'entidade_id', '')::uuid;
    if v_ent is null then select e.id into v_ent from public.fin_entidades e where e.workspace_id = p_workspace_id and e.principal and e.ativa; end if;
    if v_ent is null or not exists (select 1 from public.fin_entidades e where e.id = v_ent and e.workspace_id = p_workspace_id and e.ativa) then
      raise exception 'O Financeiro ainda não foi configurado para receber pedidos.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.fin_entidades e where e.id = v_ent and e.principal) and (select private.nivel_fin(p_workspace_id, v_ent)) < 2 then
      raise exception 'Sem acesso a esta empresa.' using errcode = 'P0001';
    end if;
    v_fin := (select private.nivel_fin(p_workspace_id, v_ent));
    perform pg_advisory_xact_lock(hashtext('compras:' || p_workspace_id::text || ':' || v_ano));
    select coalesce(max(x.numero), 0) + 1 into v_num from public.compras_pedidos x where x.workspace_id = p_workspace_id and x.ano = v_ano;
    insert into public.compras_pedidos (workspace_id, entidade_id, ano, numero, titulo, justificativa, setor_id, projeto_id, necessario_ate, local_entrega, solicitante_id)
    values (p_workspace_id, v_ent, v_ano, v_num, v_titulo, v_just, v_setor, v_projeto, nullif(p->>'necessario_ate', '')::date,
      nullif(left(trim(coalesce(p->>'local_entrega', '')), 200), ''), v_eu)
    returning * into v_ped;
    perform private.compras_registrar(v_ped, 'criado', jsonb_build_object('numero', v_num));
  else
    select * into v_ped from public.compras_pedidos where id = p_id and workspace_id = p_workspace_id for update;
    if not found or not (select private.compras_pode_ver(p_id)) then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
    v_fin := (select private.nivel_fin(v_ped.workspace_id, v_ped.entidade_id));
    if not ((v_ped.estado = 'aberto' and (v_ped.solicitante_id = v_eu or v_fin >= 2)) or (v_ped.estado = 'em_cotacao' and v_fin >= 2)) then
      raise exception 'Este pedido não pode mais ser alterado.' using errcode = 'P0001';
    end if;
    update public.compras_pedidos set titulo = v_titulo, justificativa = v_just, setor_id = v_setor, projeto_id = v_projeto,
      necessario_ate = nullif(p->>'necessario_ate', '')::date, local_entrega = nullif(left(trim(coalesce(p->>'local_entrega', '')), 200), ''),
      updated_at = now()
    where id = p_id returning * into v_ped;
    perform private.compras_registrar(v_ped, 'alterado');
  end if;

  -- A classificação é do Financeiro; de quem não é, fica como estava.
  if v_fin >= 2 then
    if v_categoria is not null and not exists (select 1 from public.fin_categorias c where c.id = v_categoria and c.workspace_id = p_workspace_id and c.tipo = 'despesa') then
      raise exception 'Categoria inválida.' using errcode = 'P0001';
    end if;
    if v_fonte is not null and not exists (select 1 from public.fin_fontes f where f.id = v_fonte and f.workspace_id = p_workspace_id and f.entidade_id = v_ped.entidade_id) then
      raise exception 'Fonte inválida.' using errcode = 'P0001';
    end if;
    update public.compras_pedidos set categoria_id = v_categoria, fonte_id = v_fonte where id = v_ped.id;
  end if;

  for it in select value from jsonb_array_elements(v_itens) loop
    v_ordem := v_ordem + 1;
    if char_length(trim(coalesce(it->>'descricao', ''))) < 2 then raise exception 'Item %: descreva o que comprar.', v_ordem using errcode = 'P0001'; end if;
    if coalesce((it->>'quantidade')::numeric, 0) <= 0 then raise exception 'Item %: a quantidade precisa ser maior que zero.', v_ordem using errcode = 'P0001'; end if;
    if (it->>'valor_estimado_unit') is not null and (it->>'valor_estimado_unit')::numeric < 0 then raise exception 'Item %: valor inválido.', v_ordem using errcode = 'P0001'; end if;
    v_item := nullif(it->>'id', '')::uuid;
    if v_item is not null and exists (select 1 from public.compras_itens i where i.id = v_item and i.pedido_id = v_ped.id) then
      update public.compras_itens set ordem = v_ordem, descricao = left(trim(it->>'descricao'), 300), especificacao = nullif(left(trim(coalesce(it->>'especificacao', '')), 2000), ''),
        quantidade = (it->>'quantidade')::numeric, unidade = coalesce(nullif(left(trim(coalesce(it->>'unidade', '')), 20), ''), 'un'),
        valor_estimado_unit = nullif(it->>'valor_estimado_unit', '')::numeric
      where id = v_item;
    else
      insert into public.compras_itens (workspace_id, pedido_id, ordem, descricao, especificacao, quantidade, unidade, valor_estimado_unit)
      values (p_workspace_id, v_ped.id, v_ordem, left(trim(it->>'descricao'), 300), nullif(left(trim(coalesce(it->>'especificacao', '')), 2000), ''),
        (it->>'quantidade')::numeric, coalesce(nullif(left(trim(coalesce(it->>'unidade', '')), 20), ''), 'un'), nullif(it->>'valor_estimado_unit', '')::numeric)
      returning id into v_item;
    end if;
    v_mantidos := v_mantidos || v_item;
  end loop;
  delete from public.compras_itens i where i.pedido_id = v_ped.id and not (i.id = any (v_mantidos));
  update public.compras_pedidos set valor_estimado = coalesce((select sum(round(i.quantidade * i.valor_estimado_unit, 2)) from public.compras_itens i
    where i.pedido_id = v_ped.id and i.valor_estimado_unit is not null), 0) where id = v_ped.id;
  return v_ped.id;
end $$;

-- ---------------------------------------------------------------- propostas

create or replace function public.compras_salvar_proposta(p_pedido_id uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_ped public.compras_pedidos;
  v_id uuid;
  v_fav uuid := nullif(p->>'favorecido_id', '')::uuid;
  v_frete numeric := coalesce(nullif(p->>'frete', '')::numeric, 0);
  pr jsonb;
begin
  select * into v_ped from public.compras_pedidos where id = p_pedido_id for update;
  if not found or (select private.nivel_fin(v_ped.workspace_id, v_ped.entidade_id)) < 2 then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if v_ped.estado not in ('aberto', 'em_cotacao') then raise exception 'A cotação deste pedido já foi encerrada.' using errcode = 'P0001'; end if;
  if v_fav is null or not exists (select 1 from public.fin_favorecidos f where f.id = v_fav and f.workspace_id = v_ped.workspace_id and f.entidade_id = v_ped.entidade_id) then
    raise exception 'Escolha o fornecedor (cadastre-o em Financeiro → Cadastros, se ainda não existir).' using errcode = 'P0001';
  end if;
  if v_frete < 0 then raise exception 'Frete inválido.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.compras_propostas x where x.pedido_id = p_pedido_id and x.favorecido_id = v_fav and x.id is distinct from p_id) then
    raise exception 'Este fornecedor já tem proposta neste pedido — edite a que existe.' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into public.compras_propostas (workspace_id, pedido_id, favorecido_id, recebida_em, validade, prazo_entrega, condicao_pagamento, frete, observacao, criado_por)
    values (v_ped.workspace_id, p_pedido_id, v_fav, coalesce(nullif(p->>'recebida_em', '')::date, current_date), nullif(p->>'validade', '')::date,
      nullif(left(trim(coalesce(p->>'prazo_entrega', '')), 120), ''), nullif(left(trim(coalesce(p->>'condicao_pagamento', '')), 120), ''), v_frete,
      nullif(left(trim(coalesce(p->>'observacao', '')), 1000), ''), (select auth.uid()))
    returning id into v_id;
  else
    update public.compras_propostas set favorecido_id = v_fav, recebida_em = coalesce(nullif(p->>'recebida_em', '')::date, recebida_em),
      validade = nullif(p->>'validade', '')::date, prazo_entrega = nullif(left(trim(coalesce(p->>'prazo_entrega', '')), 120), ''),
      condicao_pagamento = nullif(left(trim(coalesce(p->>'condicao_pagamento', '')), 120), ''), frete = v_frete,
      observacao = nullif(left(trim(coalesce(p->>'observacao', '')), 1000), '')
    where id = p_id and pedido_id = p_pedido_id returning id into v_id;
    if v_id is null then raise exception 'Proposta não encontrada.' using errcode = 'P0001'; end if;
  end if;

  for pr in select value from jsonb_array_elements(coalesce(p->'precos', '[]')) loop
    if (pr->>'valor_unitario') is not null and (pr->>'valor_unitario')::numeric < 0 then raise exception 'Preço inválido.' using errcode = 'P0001'; end if;
    insert into public.compras_proposta_itens (proposta_id, item_id, workspace_id, valor_unitario)
    select v_id, i.id, v_ped.workspace_id, nullif(pr->>'valor_unitario', '')::numeric
    from public.compras_itens i where i.id = nullif(pr->>'item_id', '')::uuid and i.pedido_id = p_pedido_id
    on conflict (proposta_id, item_id) do update set valor_unitario = excluded.valor_unitario;
  end loop;

  if v_ped.estado = 'aberto' then update public.compras_pedidos set estado = 'em_cotacao', updated_at = now() where id = p_pedido_id; end if;
  perform private.compras_registrar(v_ped, case when p_id is null then 'proposta_incluida' else 'proposta_alterada' end,
    jsonb_build_object('proposta', v_id, 'fornecedor', (select f.nome from public.fin_favorecidos f where f.id = v_fav)));
  return v_id;
end $$;

-- Tira uma proposta; devolve o caminho do arquivo dela (o servidor apaga do Storage).
create or replace function public.compras_excluir_proposta(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_pro public.compras_propostas;
  v_ped public.compras_pedidos;
begin
  select * into v_pro from public.compras_propostas where id = p_id;
  if not found then raise exception 'Proposta não encontrada.' using errcode = 'P0001'; end if;
  select * into v_ped from public.compras_pedidos where id = v_pro.pedido_id for update;
  if (select private.nivel_fin(v_ped.workspace_id, v_ped.entidade_id)) < 2 then raise exception 'Proposta não encontrada.' using errcode = 'P0001'; end if;
  if v_ped.estado not in ('aberto', 'em_cotacao') then raise exception 'A cotação deste pedido já foi encerrada.' using errcode = 'P0001'; end if;
  delete from public.compras_propostas where id = p_id;
  perform private.compras_registrar(v_ped, 'proposta_excluida', jsonb_build_object('fornecedor', (select f.nome from public.fin_favorecidos f where f.id = v_pro.favorecido_id)));
  return v_pro.arquivo_caminho;
end $$;

-- Junta o PDF (ou foto) da proposta. O caminho foi gerado pelo servidor; confere de novo.
-- Devolve o caminho do arquivo anterior, se havia (o servidor apaga).
create or replace function public.compras_anexar_proposta(p_id uuid, p_caminho text, p jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_pro public.compras_propostas;
  v_ped public.compras_pedidos;
begin
  select * into v_pro from public.compras_propostas where id = p_id;
  if not found then raise exception 'Proposta não encontrada.' using errcode = 'P0001'; end if;
  select * into v_ped from public.compras_pedidos where id = v_pro.pedido_id;
  if (select private.nivel_fin(v_ped.workspace_id, v_ped.entidade_id)) < 2 then raise exception 'Proposta não encontrada.' using errcode = 'P0001'; end if;
  if v_ped.estado not in ('aberto', 'em_cotacao') then raise exception 'A cotação deste pedido já foi encerrada.' using errcode = 'P0001'; end if;
  if p_caminho !~ ('^' || v_ped.workspace_id::text || '/' || v_ped.id::text || '/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$') then
    raise exception 'Arquivo inválido.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'compras-arquivos' and o.name = p_caminho) then
    raise exception 'O arquivo não chegou. Envie de novo.' using errcode = 'P0001';
  end if;
  update public.compras_propostas set arquivo_caminho = p_caminho, arquivo_nome = left(coalesce(nullif(trim(p->>'nome'), ''), 'proposta'), 200),
    arquivo_mime = left(coalesce(p->>'mime', 'application/pdf'), 100), arquivo_tamanho = greatest(coalesce((p->>'tamanho')::integer, 1), 1)
  where id = p_id;
  perform private.compras_registrar(v_ped, 'proposta_anexada', jsonb_build_object('proposta', p_id));
  return v_pro.arquivo_caminho;
end $$;

-- ---------------------------------------------------------------- aprovação

-- Fecha a cotação: escolhe a proposta, confere as faixas e manda para aprovação.
create or replace function public.compras_enviar_para_aprovacao(p_pedido_id uuid, p_proposta_id uuid, p_justificativa text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ped public.compras_pedidos;
  r record;
  v_total numeric;
  v_completa boolean;
  v_completas integer;
  v_min numeric;
  v_exige smallint;
  v_dir boolean;
  v_just text := nullif(trim(coalesce(p_justificativa, '')), '');
  v_faltam integer;
  v_mais_cara boolean;
begin
  select * into v_ped from public.compras_pedidos where id = p_pedido_id for update;
  if not found or (select private.nivel_fin(v_ped.workspace_id, v_ped.entidade_id)) < 2 then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if v_ped.estado <> 'em_cotacao' then raise exception 'Só um pedido em cotação vai para aprovação.' using errcode = 'P0001'; end if;
  if v_ped.categoria_id is null or v_ped.fonte_id is null then raise exception 'Classifique o pedido (categoria e fonte do dinheiro) antes de mandar para aprovação.' using errcode = 'P0001'; end if;

  select t.total, t.completa into v_total, v_completa from private.compras_totais(p_pedido_id) t where t.proposta_id = p_proposta_id;
  if v_total is null then raise exception 'Escolha a proposta vencedora.' using errcode = 'P0001'; end if;
  if not v_completa then raise exception 'A proposta escolhida não tem preço para todos os itens.' using errcode = 'P0001'; end if;
  select count(*) filter (where t.completa), min(t.total) filter (where t.completa) into v_completas, v_min from private.compras_totais(p_pedido_id) t;

  select * into r from private.compras_regras(v_ped.workspace_id);
  v_exige := case when v_total > r.limite_simples then r.cotacoes_minimas else 1 end;
  v_dir := v_total > r.limite_diretoria;
  v_faltam := greatest(0, v_exige - v_completas);
  v_mais_cara := v_total > v_min;
  if (v_faltam > 0 or v_mais_cara) and char_length(coalesce(v_just, '')) < 15 then
    raise exception '%', case
      when v_faltam > 0 and v_mais_cara then format('Faltam %s proposta(s) e a escolhida não é a mais barata: justifique (ao menos 15 caracteres).', v_faltam)
      when v_faltam > 0 then format('Acima de R$ %s são exigidas %s propostas; faltam %s. Justifique por que não foi possível (ao menos 15 caracteres).', replace(to_char(r.limite_simples, 'FM999999990.00'), '.', ','), v_exige, v_faltam)
      else 'A proposta escolhida não é a mais barata: justifique a escolha (ao menos 15 caracteres).' end
      using errcode = 'P0001';
  end if;

  update public.compras_pedidos set estado = 'em_aprovacao', proposta_id = p_proposta_id, valor_aprovado = v_total, exige_propostas = v_exige,
    exige_diretoria = v_dir, justificativa_escolha = v_just, enviado_aprovacao_por = (select auth.uid()), enviado_aprovacao_em = now(),
    aprovado_fin_por = null, aprovado_fin_em = null, aprovado_dir_por = null, aprovado_dir_em = null, aprovado_em = null, updated_at = now()
  where id = p_pedido_id returning * into v_ped;
  perform private.compras_registrar(v_ped, 'enviado_aprovacao', jsonb_build_object('proposta', p_proposta_id, 'total', v_total, 'propostas', v_completas,
    'exigidas', v_exige, 'diretoria', v_dir, 'justificativa', v_just));
  return jsonb_build_object('total', v_total, 'diretoria', v_dir, 'exigidas', v_exige, 'propostas', v_completas);
end $$;

-- Aprova, recusa ou devolve para a cotação. p_papel: 'financeiro' ou 'diretoria'.
-- Quem pediu não decide; a mesma pessoa não aprova como Financeiro e como Diretoria.
create or replace function public.compras_decidir(p_pedido_id uuid, p_decisao text, p_motivo text, p_papel text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_eu uuid := (select auth.uid());
  v_ped public.compras_pedidos;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  select * into v_ped from public.compras_pedidos where id = p_pedido_id for update;
  if not found or not (select private.compras_pode_ver(p_pedido_id)) then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if v_ped.estado <> 'em_aprovacao' then raise exception 'Este pedido não está em aprovação.' using errcode = 'P0001'; end if;
  if p_decisao not in ('aprovar', 'recusar', 'devolver') or p_papel not in ('financeiro', 'diretoria') then raise exception 'Decisão inválida.' using errcode = 'P0001'; end if;
  if v_ped.solicitante_id = v_eu then raise exception 'Quem pediu a compra não decide sobre ela.' using errcode = 'P0001'; end if;
  if p_papel = 'financeiro' then
    if (select private.nivel_fin(v_ped.workspace_id, v_ped.entidade_id)) < 3 then raise exception 'Só quem tem nível "aprovar" no Financeiro decide aqui.' using errcode = 'P0001'; end if;
    if p_decisao = 'aprovar' and v_ped.aprovado_fin_em is not null then raise exception 'O Financeiro já aprovou.' using errcode = 'P0001'; end if;
    if p_decisao = 'aprovar' and v_ped.aprovado_dir_por = v_eu then raise exception 'Você já aprovou como Diretoria: a aprovação do Financeiro precisa ser de outra pessoa.' using errcode = 'P0001'; end if;
  else
    if not v_ped.exige_diretoria then raise exception 'Este pedido não passa pela Diretoria.' using errcode = 'P0001'; end if;
    if not (select private.compras_eh_diretoria(v_ped.workspace_id)) then raise exception 'Só a Diretoria decide aqui.' using errcode = 'P0001'; end if;
    if p_decisao = 'aprovar' and v_ped.aprovado_dir_em is not null then raise exception 'A Diretoria já aprovou.' using errcode = 'P0001'; end if;
    if p_decisao = 'aprovar' and v_ped.aprovado_fin_por = v_eu then raise exception 'Você já aprovou pelo Financeiro: a aprovação da Diretoria precisa ser de outra pessoa.' using errcode = 'P0001'; end if;
  end if;

  if p_decisao = 'aprovar' then
    if p_papel = 'financeiro' then
      update public.compras_pedidos set aprovado_fin_por = v_eu, aprovado_fin_em = now(), updated_at = now() where id = p_pedido_id returning * into v_ped;
    else
      update public.compras_pedidos set aprovado_dir_por = v_eu, aprovado_dir_em = now(), updated_at = now() where id = p_pedido_id returning * into v_ped;
    end if;
    if v_ped.aprovado_fin_em is not null and (not v_ped.exige_diretoria or v_ped.aprovado_dir_em is not null) then
      update public.compras_pedidos set estado = 'aprovado', aprovado_em = now() where id = p_pedido_id returning * into v_ped;
    end if;
    perform private.compras_registrar(v_ped, 'aprovado_' || p_papel, jsonb_build_object('observacao', v_motivo));
  else
    if char_length(coalesce(v_motivo, '')) < 5 then raise exception 'Diga o motivo (ao menos 5 caracteres).' using errcode = 'P0001'; end if;
    if p_decisao = 'recusar' then
      update public.compras_pedidos set estado = 'recusado', encerrado_por = v_eu, encerrado_em = now(), motivo_encerramento = left(v_motivo, 1000), updated_at = now()
      where id = p_pedido_id returning * into v_ped;
    else
      update public.compras_pedidos set estado = 'em_cotacao', aprovado_fin_por = null, aprovado_fin_em = null, aprovado_dir_por = null, aprovado_dir_em = null,
        updated_at = now() where id = p_pedido_id returning * into v_ped;
    end if;
    perform private.compras_registrar(v_ped, case when p_decisao = 'recusar' then 'recusado' else 'devolvido' end, jsonb_build_object('papel', p_papel, 'motivo', v_motivo));
  end if;
  return v_ped.estado;
end $$;

-- Cancela: quem pediu, até ser aprovado; o Financeiro (lançar), a qualquer momento antes de encerrado.
create or replace function public.compras_cancelar(p_pedido_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_eu uuid := (select auth.uid());
  v_ped public.compras_pedidos;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  select * into v_ped from public.compras_pedidos where id = p_pedido_id for update;
  if not found or not (select private.compras_pode_ver(p_pedido_id)) then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if v_ped.estado in ('cancelado', 'recusado') then raise exception 'Este pedido já está encerrado.' using errcode = 'P0001'; end if;
  if not ((v_ped.solicitante_id = v_eu and v_ped.estado in ('aberto', 'em_cotacao', 'em_aprovacao'))
          or (select private.nivel_fin(v_ped.workspace_id, v_ped.entidade_id)) >= 2) then
    raise exception 'Você não pode cancelar este pedido.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_motivo, '')) < 5 then raise exception 'Diga o motivo (ao menos 5 caracteres).' using errcode = 'P0001'; end if;
  update public.compras_pedidos set estado = 'cancelado', encerrado_por = v_eu, encerrado_em = now(), motivo_encerramento = left(v_motivo, 1000), updated_at = now()
  where id = p_pedido_id returning * into v_ped;
  perform private.compras_registrar(v_ped, 'cancelado', jsonb_build_object('motivo', v_motivo));
end $$;

-- As faixas e o setor da Diretoria (gestão do Financeiro).
create or replace function public.compras_salvar_regras(p_workspace_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_simples numeric := (p->>'limite_simples')::numeric;
  v_dir numeric := (p->>'limite_diretoria')::numeric;
  v_min smallint := (p->>'cotacoes_minimas')::smallint;
  v_setor uuid := nullif(p->>'diretoria_setor_id', '')::uuid;
begin
  if (select private.nivel_financeiro(p_workspace_id)) < 4 then raise exception 'Só a gestão do Financeiro muda as regras de compra.' using errcode = 'P0001'; end if;
  if v_simples is null or v_simples < 0 or v_dir is null or v_dir < v_simples then raise exception 'O limite da Diretoria precisa ser maior ou igual ao da compra simples.' using errcode = 'P0001'; end if;
  if v_min is null or v_min < 1 or v_min > 10 then raise exception 'O mínimo de propostas vai de 1 a 10.' using errcode = 'P0001'; end if;
  if v_setor is not null and not exists (select 1 from public.setores s where s.id = v_setor and s.workspace_id = p_workspace_id) then raise exception 'Setor inválido.' using errcode = 'P0001'; end if;
  insert into public.compras_config (workspace_id, limite_simples, limite_diretoria, cotacoes_minimas, diretoria_setor_id, atualizado_por, updated_at)
  values (p_workspace_id, v_simples, v_dir, v_min, v_setor, (select auth.uid()), now())
  on conflict (workspace_id) do update set limite_simples = excluded.limite_simples, limite_diretoria = excluded.limite_diretoria,
    cotacoes_minimas = excluded.cotacoes_minimas, diretoria_setor_id = excluded.diretoria_setor_id, atualizado_por = excluded.atualizado_por, updated_at = now();
end $$;

-- O papel de quem está logado em Compras (para a tela; o banco confere de novo em cada função).
create or replace function public.compras_meu_papel(p_workspace_id uuid)
returns jsonb language sql security definer set search_path = '' stable as $$
  select jsonb_build_object(
    'pede', (select private.is_workspace_member(p_workspace_id)),
    'diretoria', (select private.compras_eh_diretoria(p_workspace_id)),
    'gestao', (select private.nivel_financeiro(p_workspace_id)) >= 4)
$$;

revoke all on function public.compras_salvar_pedido(uuid, uuid, jsonb), public.compras_salvar_proposta(uuid, uuid, jsonb), public.compras_excluir_proposta(uuid),
  public.compras_anexar_proposta(uuid, text, jsonb), public.compras_enviar_para_aprovacao(uuid, uuid, text), public.compras_decidir(uuid, text, text, text),
  public.compras_cancelar(uuid, text), public.compras_salvar_regras(uuid, jsonb), public.compras_meu_papel(uuid) from public, anon;
grant execute on function public.compras_salvar_pedido(uuid, uuid, jsonb), public.compras_salvar_proposta(uuid, uuid, jsonb), public.compras_excluir_proposta(uuid),
  public.compras_anexar_proposta(uuid, text, jsonb), public.compras_enviar_para_aprovacao(uuid, uuid, text), public.compras_decidir(uuid, text, text, text),
  public.compras_cancelar(uuid, text), public.compras_salvar_regras(uuid, jsonb), public.compras_meu_papel(uuid) to authenticated;
