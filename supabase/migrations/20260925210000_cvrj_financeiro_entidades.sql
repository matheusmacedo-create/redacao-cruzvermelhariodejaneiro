-- Financeiro (5): empresas. A Escola de Educação e Saúde é uma empresa à
-- parte dentro da filial — CNPJ, conta bancária, receita e contabilidade
-- próprias —, e a gestão dela roda na Redação. O Financeiro passa a ter
-- empresas (fin_entidades): a principal (a filial, com tudo o que já existia)
-- e a Escola. Cada empresa tem as suas contas, fontes de recurso,
-- lançamentos, orçamento e fechamento do mês (fechado_ate próprio); as
-- categorias e os favorecidos continuam comuns.
--
-- A empresa de um lançamento é a da conta dele — um gatilho grava e confere
-- (transferência só entre contas da mesma empresa, fonte da mesma empresa).
-- O mês fechado passa a ser o da empresa da conta: private.fin_fechado_conta
-- substitui private.fin_fechado nas funções que conferem lançamento ou
-- extrato (fin_fechado continua valendo para a principal — o Estoque usa).

-- ---------------------------------------------------------------- empresas

create table if not exists public.fin_entidades (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  nome          text not null check (char_length(nome) between 2 and 80),
  razao_social  text check (char_length(razao_social) <= 200),
  cnpj          text check (cnpj ~ '^\d{14}$'),
  tipo          text not null default 'outra' check (tipo in ('filial', 'escola', 'outra')),
  principal     boolean not null default false,
  fechado_ate   date,
  ordem         integer not null default 100,
  ativa         boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index if not exists fin_entidades_nome_idx on public.fin_entidades (workspace_id, lower(nome));
create unique index if not exists fin_entidades_principal_idx on public.fin_entidades (workspace_id) where principal;
create unique index if not exists fin_entidades_escola_idx on public.fin_entidades (workspace_id) where tipo = 'escola';
create unique index if not exists fin_entidades_cnpj_idx on public.fin_entidades (workspace_id, cnpj) where cnpj is not null;
alter table public.fin_entidades enable row level security;
create policy fin_entidades_select on public.fin_entidades for select to authenticated using ((select private.nivel_financeiro(workspace_id)) >= 1);

-- A filial (principal, com tudo o que já existia) e a Escola. Idempotente.
create or replace function private.semear_entidades(p_workspace_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.fin_entidades where workspace_id = p_workspace_id and principal) then
    insert into public.fin_entidades (workspace_id, nome, razao_social, cnpj, tipo, principal, fechado_ate, ordem)
    values (p_workspace_id, 'Filial Rio de Janeiro', 'Cruz Vermelha Brasileira — Filial do Estado do Rio de Janeiro', '08560973000197', 'filial', true,
      (select c.fechado_ate from public.fin_config c where c.workspace_id = p_workspace_id), 10)
    on conflict do nothing;
  end if;
  if not exists (select 1 from public.fin_entidades where workspace_id = p_workspace_id and tipo = 'escola') then
    insert into public.fin_entidades (workspace_id, nome, tipo, ordem)
    values (p_workspace_id, 'Escola de Educação e Saúde', 'escola', 20)
    on conflict do nothing;
  end if;
end $$;
revoke all on function private.semear_entidades(uuid) from public, anon, authenticated;

-- A empresa pedida (id em texto, de um formulário), se for do espaço; senão, a principal.
create or replace function private.fin_entidade(p_workspace_id uuid, p_pedida text)
returns uuid language sql security definer set search_path = '' stable as $$
  select coalesce(
    (select e.id from public.fin_entidades e where e.workspace_id = p_workspace_id and e.id::text = p_pedida and e.ativa),
    (select e.id from public.fin_entidades e where e.workspace_id = p_workspace_id and e.principal)
  )
$$;
revoke all on function private.fin_entidade(uuid, text) from public, anon, authenticated;

do $$
declare w uuid;
begin
  for w in select id from public.workspaces loop perform private.semear_entidades(w); end loop;
end $$;

-- ---------------------------------------------------------------- empresa em cada cadastro

alter table public.fin_contas drop constraint if exists fin_contas_tipo_check;
alter table public.fin_contas add constraint fin_contas_tipo_check check (tipo in ('corrente','poupanca','aplicacao','caixa','cartao','gateway'));
alter table public.fin_contas add column if not exists entidade_id uuid references public.fin_entidades (id) on delete restrict;
update public.fin_contas c set entidade_id = e.id from public.fin_entidades e where e.workspace_id = c.workspace_id and e.principal and c.entidade_id is null;
alter table public.fin_contas alter column entidade_id set not null;
create index if not exists fin_contas_entidade_idx on public.fin_contas (entidade_id);

alter table public.fin_fontes add column if not exists entidade_id uuid references public.fin_entidades (id) on delete restrict;
update public.fin_fontes f set entidade_id = e.id from public.fin_entidades e where e.workspace_id = f.workspace_id and e.principal and f.entidade_id is null;
alter table public.fin_fontes alter column entidade_id set not null;
-- "Recursos livres" existe em cada empresa: o nome é único dentro da empresa.
alter table public.fin_fontes drop constraint if exists fin_fontes_workspace_id_nome_key;
create unique index if not exists fin_fontes_nome_idx on public.fin_fontes (workspace_id, entidade_id, nome);
create index if not exists fin_fontes_entidade_idx on public.fin_fontes (entidade_id);

alter table public.fin_lancamentos add column if not exists entidade_id uuid references public.fin_entidades (id) on delete restrict;
update public.fin_lancamentos l set entidade_id = c.entidade_id from public.fin_contas c where c.id = l.conta_id and l.entidade_id is null;
alter table public.fin_lancamentos alter column entidade_id set not null;
create index if not exists fin_lancamentos_entidade_idx on public.fin_lancamentos (entidade_id, vencimento);

alter table public.fin_orcamentos add column if not exists entidade_id uuid references public.fin_entidades (id) on delete cascade;
update public.fin_orcamentos o set entidade_id = e.id from public.fin_entidades e where e.workspace_id = o.workspace_id and e.principal and o.entidade_id is null;
alter table public.fin_orcamentos alter column entidade_id set not null;
alter table public.fin_orcamentos drop constraint if exists fin_orcamentos_pkey;
alter table public.fin_orcamentos add primary key (workspace_id, entidade_id, ano, categoria_id);

alter table public.fin_fechamentos add column if not exists entidade_id uuid references public.fin_entidades (id) on delete cascade;
update public.fin_fechamentos f set entidade_id = e.id from public.fin_entidades e where e.workspace_id = f.workspace_id and e.principal and f.entidade_id is null;
alter table public.fin_fechamentos alter column entidade_id set not null;
drop index if exists public.fin_fechamentos_mes_idx;
create unique index if not exists fin_fechamentos_mes_idx on public.fin_fechamentos (entidade_id, mes) where situacao = 'fechado';

-- A empresa do lançamento é a da conta; transferência e fonte, da mesma empresa.
create or replace function private.fin_lancamento_da_empresa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_ent uuid;
begin
  select entidade_id into v_ent from public.fin_contas where id = new.conta_id;
  new.entidade_id := v_ent;
  if new.conta_destino_id is not null and (select entidade_id from public.fin_contas where id = new.conta_destino_id) is distinct from v_ent then
    raise exception 'Transferência só entre contas da mesma empresa. Entre a filial e a escola, lance uma despesa numa e a receita na outra.' using errcode = 'P0001';
  end if;
  if (select entidade_id from public.fin_fontes where id = new.fonte_id) is distinct from v_ent then
    raise exception 'A fonte de recurso é de outra empresa: escolha uma fonte da mesma empresa da conta.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.fin_lancamento_da_empresa() from public, anon, authenticated;
drop trigger if exists fin_lancamentos_empresa on public.fin_lancamentos;
create trigger fin_lancamentos_empresa before insert or update of conta_id, conta_destino_id, fonte_id on public.fin_lancamentos
  for each row execute function private.fin_lancamento_da_empresa();

-- ---------------------------------------------------------------- mês fechado por empresa

-- O mês da empresa desta conta já foi fechado até esta data?
create or replace function private.fin_fechado_conta(p_conta_id uuid, p_data date)
returns boolean language sql security definer set search_path = '' stable as $$
  select p_data is not null and coalesce((
    select e.fechado_ate >= p_data from public.fin_contas c join public.fin_entidades e on e.id = c.entidade_id where c.id = p_conta_id
  ), false)
$$;
revoke all on function private.fin_fechado_conta(uuid, date) from public, anon, authenticated;

-- A principal (a filial) — é o que o Estoque confere.
create or replace function private.fin_fechado(p_workspace_id uuid, p_data date)
returns boolean language sql security definer set search_path = '' stable as $$
  select p_data is not null and coalesce((select e.fechado_ate >= p_data from public.fin_entidades e where e.workspace_id = p_workspace_id and e.principal), false)
$$;
revoke all on function private.fin_fechado(uuid, date) from public, anon, authenticated;

-- fin_config.fechado_ate continua sendo o da principal: quem ainda grava lá
-- (caminho antigo) move o fechamento da filial junto.
create or replace function private.fin_config_espelha_principal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.fin_entidades set fechado_ate = new.fechado_ate
  where workspace_id = new.workspace_id and principal and fechado_ate is distinct from new.fechado_ate;
  return new;
end $$;
revoke all on function private.fin_config_espelha_principal() from public, anon, authenticated;
drop trigger if exists fin_config_fechado on public.fin_config;
create trigger fin_config_fechado after insert or update of fechado_ate on public.fin_config
  for each row execute function private.fin_config_espelha_principal();

create or replace function private.semear_financeiro(p_workspace_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.semear_entidades(p_workspace_id);
  insert into public.fin_fontes (workspace_id, entidade_id, nome, restrita, descricao)
  select p_workspace_id, e.id, 'Recursos livres', false, 'Dinheiro sem destino obrigatório: doações livres, cursos, eventos, rendimentos.'
  from public.fin_entidades e where e.workspace_id = p_workspace_id
  on conflict (workspace_id, entidade_id, nome) do nothing;
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

-- "Recursos livres" da Escola, para quem já tinha o Financeiro preparado.
do $$
declare w uuid;
begin
  for w in select distinct workspace_id from public.fin_config loop
    insert into public.fin_fontes (workspace_id, entidade_id, nome, restrita, descricao)
    select w, e.id, 'Recursos livres', false, 'Dinheiro sem destino obrigatório: doações livres, cursos, eventos, rendimentos.'
    from public.fin_entidades e where e.workspace_id = w
    on conflict (workspace_id, entidade_id, nome) do nothing;
  end loop;
end $$;

-- ---------------------------------------------------------------- funções com o mês fechado da empresa da conta

create or replace function public.excluir_anexo_financeiro(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  x public.fin_anexos;
  a public.fin_lancamentos;
begin
  select * into x from public.fin_anexos where id = p_id;
  if not found or (select private.nivel_financeiro(x.workspace_id)) < 2 then raise exception 'Arquivo não encontrado.' using errcode = 'P0001'; end if;
  select * into a from public.fin_lancamentos where id = x.lancamento_id;
  if private.fin_fechado_conta(a.conta_id, a.pago_em) then raise exception 'Mês fechado: o comprovante faz parte do fechamento e não sai mais.' using errcode = 'P0001'; end if;
  delete from public.fin_anexos where id = p_id;
  perform private.auditar_financeiro(x.workspace_id, x.lancamento_id, 'excluir_anexo', jsonb_build_object('nome', x.nome_original, 'sha256', x.sha256));
  return x.caminho;
end $$;

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
  if private.fin_fechado_conta(a.conta_id, a.pago_em) then raise exception 'Este lançamento foi pago num mês já fechado e não muda mais.' using errcode = 'P0001'; end if;
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

create or replace function public.financeiro_conciliar(p_extrato_id uuid, p_lancamento_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  e public.fin_extrato;
  l public.fin_lancamentos;
  v_sentido_ok boolean;
begin
  select * into e from public.fin_extrato where id = p_extrato_id for update;
  if not found or (select private.nivel_financeiro(e.workspace_id)) < 2 then raise exception 'Linha do extrato não encontrada.' using errcode = 'P0001'; end if;
  if e.situacao <> 'pendente' then raise exception 'Esta linha já foi conciliada ou ignorada.' using errcode = 'P0001'; end if;
  if private.fin_fechado_conta(e.conta_id, e.data) then raise exception 'Esta linha é de um mês já fechado.' using errcode = 'P0001'; end if;
  select * into l from public.fin_lancamentos where id = p_lancamento_id and workspace_id = e.workspace_id for update;
  if not found then raise exception 'Lançamento não encontrado.' using errcode = 'P0001'; end if;
  v_sentido_ok := case
    when l.tipo = 'despesa' then e.valor < 0 and l.conta_id = e.conta_id
    when l.tipo = 'receita' then e.valor > 0 and l.conta_id = e.conta_id
    else (e.valor < 0 and l.conta_id = e.conta_id) or (e.valor > 0 and l.conta_destino_id = e.conta_id)
  end;
  if not v_sentido_ok then raise exception 'A linha e o lançamento não combinam: confira a conta e se é entrada ou saída.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.fin_extrato x where x.lancamento_id = l.id and x.conta_id = e.conta_id) then
    raise exception 'Este lançamento já está conciliado com outra linha desta conta.' using errcode = 'P0001';
  end if;
  if l.aprovacao = 'pendente' then raise exception 'Este lançamento ainda espera aprovação.' using errcode = 'P0001'; end if;
  if l.aprovacao = 'recusada' then raise exception 'Este lançamento foi recusado.' using errcode = 'P0001'; end if;
  if private.fin_fechado_conta(l.conta_id, l.pago_em) then raise exception 'O lançamento foi pago num mês já fechado.' using errcode = 'P0001'; end if;

  -- O banco manda na data e no valor. Na transferência, só o lado que sai
  -- define o pagamento; o lado que entra só se liga (se já estiver paga).
  if l.tipo <> 'transferencia' or e.valor < 0 or l.pago_em is null then
    update public.fin_lancamentos set pago_em = e.data, valor_pago = abs(e.valor), atualizado_por = (select auth.uid()), updated_at = now() where id = l.id;
  end if;
  update public.fin_extrato set situacao = 'conciliado', lancamento_id = l.id, conciliado_por = (select auth.uid()), conciliado_em = now() where id = e.id;
  perform private.auditar_financeiro(e.workspace_id, l.id, 'conciliar', jsonb_build_object('extrato', e.id, 'data', e.data, 'valor', e.valor,
    'antes', jsonb_build_object('pago_em', l.pago_em, 'valor_pago', l.valor_pago)));
end $$;

create or replace function public.financeiro_criar_do_extrato(p_extrato_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  e public.fin_extrato;
  l public.fin_lancamentos;
  v_id uuid;
begin
  select * into e from public.fin_extrato where id = p_extrato_id for update;
  if not found or (select private.nivel_financeiro(e.workspace_id)) < 2 then raise exception 'Linha do extrato não encontrada.' using errcode = 'P0001'; end if;
  if e.situacao <> 'pendente' then raise exception 'Esta linha já foi conciliada ou ignorada.' using errcode = 'P0001'; end if;
  if private.fin_fechado_conta(e.conta_id, e.data) then raise exception 'Esta linha é de um mês já fechado.' using errcode = 'P0001'; end if;
  l := private.fin_do_json(e.workspace_id, p || jsonb_build_object(
    'tipo', case when e.valor < 0 then 'despesa' else 'receita' end, 'valor', abs(e.valor), 'conta_id', e.conta_id,
    'competencia', date_trunc('month', e.data)::date, 'vencimento', e.data, 'pago_em', e.data, 'valor_pago', abs(e.valor),
    'descricao', coalesce(nullif(trim(p->>'descricao'), ''), e.descricao), 'documento', coalesce(nullif(p->>'documento', ''), e.documento)));
  perform private.fin_conferir(e.workspace_id, l);
  insert into public.fin_lancamentos (workspace_id, tipo, descricao, valor, conta_id, categoria_id, fonte_id, projeto_id, favorecido_id,
    competencia, vencimento, pago_em, valor_pago, forma, documento, observacao, aprovacao, criado_por, atualizado_por)
  values (e.workspace_id, l.tipo, l.descricao, l.valor, l.conta_id, l.categoria_id, l.fonte_id, l.projeto_id, l.favorecido_id,
    l.competencia, l.vencimento, l.pago_em, l.valor_pago, l.forma, l.documento, l.observacao, 'nao_exige', (select auth.uid()), (select auth.uid()))
  returning id into v_id;
  update public.fin_extrato set situacao = 'conciliado', lancamento_id = v_id, conciliado_por = (select auth.uid()), conciliado_em = now() where id = e.id;
  perform private.auditar_financeiro(e.workspace_id, v_id, 'criar_do_extrato', jsonb_build_object('extrato', e.id, 'data', e.data, 'valor', e.valor));
  return v_id;
end $$;

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
    if private.fin_fechado_conta(l.conta_id, l.pago_em) then raise exception 'A data do pagamento está num mês já fechado.' using errcode = 'P0001'; end if;
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

create or replace function public.financeiro_desconciliar(p_extrato_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  e public.fin_extrato;
begin
  select * into e from public.fin_extrato where id = p_extrato_id for update;
  if not found or (select private.nivel_financeiro(e.workspace_id)) < 2 then raise exception 'Linha do extrato não encontrada.' using errcode = 'P0001'; end if;
  if private.fin_fechado_conta(e.conta_id, e.data) then raise exception 'Esta linha é de um mês já fechado.' using errcode = 'P0001'; end if;
  update public.fin_extrato set situacao = 'pendente', lancamento_id = null, motivo = null, conciliado_por = null, conciliado_em = null where id = e.id;
  perform private.auditar_financeiro(e.workspace_id, e.lancamento_id, 'desconciliar', jsonb_build_object('extrato', e.id, 'situacao_antes', e.situacao));
end $$;

create or replace function public.financeiro_desfazer_pagamento(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.fin_lancamentos;
begin
  select * into a from public.fin_lancamentos where id = p_id for update;
  if not found or (select private.nivel_financeiro(a.workspace_id)) < 2 then raise exception 'Lançamento não encontrado.' using errcode = 'P0001'; end if;
  if a.pago_em is null then return; end if;
  if private.fin_fechado_conta(a.conta_id, a.pago_em) then raise exception 'Foi pago num mês já fechado e não muda mais.' using errcode = 'P0001'; end if;
  update public.fin_lancamentos set pago_em = null, valor_pago = null, atualizado_por = (select auth.uid()), updated_at = now() where id = p_id;
  perform private.auditar_financeiro(a.workspace_id, p_id, 'desfazer_pagamento', jsonb_build_object('pago_em', a.pago_em, 'valor_pago', a.valor_pago));
end $$;

create or replace function public.financeiro_ignorar_extrato(p_extrato_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  e public.fin_extrato;
begin
  select * into e from public.fin_extrato where id = p_extrato_id for update;
  if not found or (select private.nivel_financeiro(e.workspace_id)) < 2 then raise exception 'Linha do extrato não encontrada.' using errcode = 'P0001'; end if;
  if e.situacao <> 'pendente' then raise exception 'Esta linha já foi conciliada ou ignorada.' using errcode = 'P0001'; end if;
  if private.fin_fechado_conta(e.conta_id, e.data) then raise exception 'Esta linha é de um mês já fechado.' using errcode = 'P0001'; end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Diga por que a linha fica de fora.' using errcode = 'P0001'; end if;
  update public.fin_extrato set situacao = 'ignorado', motivo = left(trim(p_motivo), 300), conciliado_por = (select auth.uid()), conciliado_em = now() where id = e.id;
  perform private.auditar_financeiro(e.workspace_id, null, 'ignorar_extrato', jsonb_build_object('extrato', e.id, 'valor', e.valor, 'motivo', trim(p_motivo)));
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
  if private.fin_fechado_conta(a.conta_id, a.pago_em) or private.fin_fechado_conta(coalesce(p_conta_id, a.conta_id), p_pago_em) then
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

create or replace function public.registrar_anexo_financeiro(p_lancamento_id uuid, p_caminho text, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  a public.fin_lancamentos;
  v_id uuid;
begin
  select * into a from public.fin_lancamentos where id = p_lancamento_id;
  if not found or (select private.nivel_financeiro(a.workspace_id)) < 2 then raise exception 'Lançamento não encontrado.' using errcode = 'P0001'; end if;
  if private.fin_fechado_conta(a.conta_id, a.pago_em) and coalesce(p->>'tipo_doc', '') <> 'comprovante' then
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

create or replace function public.financeiro_salvar_cadastro(p_workspace_id uuid, p_tabela text, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_nivel integer := (select private.nivel_financeiro(p_workspace_id));
  v_fonte uuid;
  v_projeto uuid;
  v_ent uuid;
begin
  if p_tabela = 'favorecido' then
    if v_nivel < 2 then raise exception 'Você não tem acesso para cadastrar favorecidos.' using errcode = 'P0001'; end if;
  elsif v_nivel < 4 then
    raise exception 'Só a gestão do Financeiro mexe em contas, fontes e categorias.' using errcode = 'P0001';
  end if;

  if p_tabela = 'conta' then
    v_fonte := nullif(p->>'fonte_id', '')::uuid;
    -- Conta nova nasce na empresa pedida (ou na principal); a de uma conta existente não muda.
    v_ent := coalesce((select c.entidade_id from public.fin_contas c where c.id = v_id and c.workspace_id = p_workspace_id), private.fin_entidade(p_workspace_id, p->>'entidade_id'));
    if v_fonte is not null and not exists (select 1 from public.fin_fontes where id = v_fonte and workspace_id = p_workspace_id and entidade_id = v_ent) then
      raise exception 'Fonte inválida (tem de ser da mesma empresa da conta).' using errcode = 'P0001';
    end if;
    if v_id is null then
      insert into public.fin_contas (workspace_id, entidade_id, nome, tipo, banco, agencia, numero, fonte_id, saldo_inicial, saldo_inicial_em)
      values (p_workspace_id, v_ent, trim(p->>'nome'), coalesce(p->>'tipo', 'corrente'), nullif(trim(p->>'banco'), ''), nullif(trim(p->>'agencia'), ''),
        nullif(trim(p->>'numero'), ''), v_fonte, coalesce((p->>'saldo_inicial')::numeric, 0), coalesce((p->>'saldo_inicial_em')::date, current_date))
      returning id into v_id;
    else
      -- O saldo inicial muda o saldo de todo mês depois dele: não mexe em mês fechado.
      if exists (select 1 from public.fin_contas c where c.id = v_id and c.workspace_id = p_workspace_id
          and (c.saldo_inicial is distinct from coalesce((p->>'saldo_inicial')::numeric, 0) or c.saldo_inicial_em is distinct from (p->>'saldo_inicial_em')::date)
          and (private.fin_fechado_conta(c.id, c.saldo_inicial_em) or private.fin_fechado_conta(c.id, (p->>'saldo_inicial_em')::date))) then
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
      insert into public.fin_fontes (workspace_id, entidade_id, nome, restrita, projeto_id, financiador, descricao, inicio, fim, valor_previsto)
      values (p_workspace_id, private.fin_entidade(p_workspace_id, p->>'entidade_id'), trim(p->>'nome'), coalesce((p->>'restrita')::boolean, true), v_projeto, nullif(trim(p->>'financiador'), ''),
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
-- ---------------------------------------------------------------- fechar e reabrir o mês de uma empresa

drop function if exists public.financeiro_fechar_mes(uuid, date, jsonb, jsonb, text);
create or replace function public.financeiro_fechar_mes(p_workspace_id uuid, p_mes date, p_resumo jsonb, p_avisos jsonb, p_observacao text, p_entidade_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_fim date := (p_mes + interval '1 month' - interval '1 day')::date;
  v_ent public.fin_entidades;
  v_pendentes integer;
begin
  if (select private.nivel_financeiro(p_workspace_id)) < 4 then raise exception 'Só a gestão do Financeiro fecha o mês.' using errcode = 'P0001'; end if;
  if p_mes is null or extract(day from p_mes) <> 1 then raise exception 'Mês inválido.' using errcode = 'P0001'; end if;
  if v_fim >= current_date then raise exception 'O mês ainda não acabou.' using errcode = 'P0001'; end if;
  select * into v_ent from public.fin_entidades where id = private.fin_entidade(p_workspace_id, p_entidade_id::text) for update;
  if v_ent.id is null then raise exception 'Empresa não encontrada.' using errcode = 'P0001'; end if;
  if v_ent.fechado_ate is not null and p_mes <> v_ent.fechado_ate + 1 then
    raise exception 'Os meses fecham em ordem: o próximo é %.', to_char(v_ent.fechado_ate + 1, 'MM/YYYY') using errcode = 'P0001';
  end if;
  select count(*) into v_pendentes from public.fin_extrato x join public.fin_contas c on c.id = x.conta_id
  where x.workspace_id = p_workspace_id and c.entidade_id = v_ent.id and x.situacao = 'pendente' and x.data between p_mes and v_fim;
  if v_pendentes > 0 then raise exception 'Ainda há % % do extrato para conciliar neste mês.', v_pendentes, case when v_pendentes = 1 then 'linha' else 'linhas' end using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(p_avisos, '[]'::jsonb)) <> 'array' then raise exception 'Avisos inválidos.' using errcode = 'P0001'; end if;
  if jsonb_array_length(coalesce(p_avisos, '[]'::jsonb)) > 0 and char_length(trim(coalesce(p_observacao, ''))) < 5 then
    raise exception 'Há avisos no mês: escreva uma observação explicando por que fecha assim.' using errcode = 'P0001';
  end if;
  update public.fin_entidades set fechado_ate = v_fim where id = v_ent.id;
  -- A principal continua espelhada em fin_config (compatibilidade).
  if v_ent.principal then
    insert into public.fin_config (workspace_id, fechado_ate, atualizado_por, updated_at) values (p_workspace_id, v_fim, (select auth.uid()), now())
    on conflict (workspace_id) do update set fechado_ate = excluded.fechado_ate, atualizado_por = excluded.atualizado_por, updated_at = now();
  end if;
  insert into public.fin_fechamentos (workspace_id, entidade_id, mes, resumo, avisos, observacao, fechado_por)
  values (p_workspace_id, v_ent.id, p_mes, coalesce(p_resumo, '{}'::jsonb), coalesce(p_avisos, '[]'::jsonb), nullif(left(trim(coalesce(p_observacao, '')), 2000), ''), (select auth.uid()));
  perform private.auditar_financeiro(p_workspace_id, null, 'fechar_mes', jsonb_build_object('mes', p_mes, 'empresa', v_ent.nome, 'avisos', jsonb_array_length(coalesce(p_avisos, '[]'::jsonb))));
end $$;
revoke all on function public.financeiro_fechar_mes(uuid, date, jsonb, jsonb, text, uuid) from public, anon;
grant execute on function public.financeiro_fechar_mes(uuid, date, jsonb, jsonb, text, uuid) to authenticated;

drop function if exists public.financeiro_reabrir_mes(uuid, text);
create or replace function public.financeiro_reabrir_mes(p_workspace_id uuid, p_motivo text, p_entidade_id uuid default null)
returns date language plpgsql security definer set search_path = '' as $$
declare
  v_ent public.fin_entidades;
  v_mes date;
  v_anterior date;
  v_novo date;
begin
  if (select private.nivel_financeiro(p_workspace_id)) < 4 then raise exception 'Só a gestão do Financeiro reabre o mês.' using errcode = 'P0001'; end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'Diga por que o mês precisa ser reaberto.' using errcode = 'P0001'; end if;
  select * into v_ent from public.fin_entidades where id = private.fin_entidade(p_workspace_id, p_entidade_id::text) for update;
  if v_ent.id is null or v_ent.fechado_ate is null then raise exception 'Não há mês fechado.' using errcode = 'P0001'; end if;
  v_mes := date_trunc('month', v_ent.fechado_ate)::date;
  v_anterior := v_mes - 1;
  update public.fin_fechamentos set situacao = 'reaberto', reaberto_por = (select auth.uid()), reaberto_em = now(), motivo_reabertura = left(trim(p_motivo), 1000)
  where entidade_id = v_ent.id and mes = v_mes and situacao = 'fechado';
  v_novo := case when exists (select 1 from public.fin_fechamentos f where f.entidade_id = v_ent.id and f.mes = date_trunc('month', v_anterior)::date and f.situacao = 'fechado') then v_anterior end;
  update public.fin_entidades set fechado_ate = v_novo where id = v_ent.id;
  if v_ent.principal then
    update public.fin_config set fechado_ate = v_novo, atualizado_por = (select auth.uid()), updated_at = now() where workspace_id = p_workspace_id;
  end if;
  perform private.auditar_financeiro(p_workspace_id, null, 'reabrir_mes', jsonb_build_object('mes', v_mes, 'empresa', v_ent.nome, 'motivo', trim(p_motivo)));
  return v_mes;
end $$;
revoke all on function public.financeiro_reabrir_mes(uuid, text, uuid) from public, anon;
grant execute on function public.financeiro_reabrir_mes(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------- orçamento por empresa

drop function if exists public.financeiro_salvar_orcamento(uuid, integer, jsonb);
create or replace function public.financeiro_salvar_orcamento(p_workspace_id uuid, p_ano integer, p_itens jsonb, p_entidade_id uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_cat uuid;
  v_valor numeric;
  v_total integer := 0;
  v_ent uuid;
begin
  if (select private.nivel_financeiro(p_workspace_id)) < 4 then raise exception 'Só a gestão do Financeiro define o orçamento.' using errcode = 'P0001'; end if;
  if p_ano not between 2020 and 2100 then raise exception 'Ano inválido.' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 500 then raise exception 'Orçamento inválido.' using errcode = 'P0001'; end if;
  v_ent := private.fin_entidade(p_workspace_id, p_entidade_id::text);
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_cat := (v_item->>'categoria_id')::uuid;
    v_valor := nullif(v_item->>'valor_mensal', '')::numeric;
    if not exists (select 1 from public.fin_categorias where id = v_cat and workspace_id = p_workspace_id) then
      raise exception 'Categoria inválida.' using errcode = 'P0001';
    end if;
    if v_valor is null or v_valor <= 0 then
      delete from public.fin_orcamentos where workspace_id = p_workspace_id and entidade_id = v_ent and ano = p_ano and categoria_id = v_cat;
    else
      insert into public.fin_orcamentos (workspace_id, entidade_id, ano, categoria_id, valor_mensal, atualizado_por) values (p_workspace_id, v_ent, p_ano, v_cat, round(v_valor, 2), (select auth.uid()))
      on conflict (workspace_id, entidade_id, ano, categoria_id) do update set valor_mensal = excluded.valor_mensal, atualizado_por = excluded.atualizado_por, updated_at = now();
      v_total := v_total + 1;
    end if;
  end loop;
  perform private.auditar_financeiro(p_workspace_id, null, 'orcamento', jsonb_build_object('ano', p_ano, 'categorias', v_total, 'empresa', v_ent));
  return v_total;
end $$;
revoke all on function public.financeiro_salvar_orcamento(uuid, integer, jsonb, uuid) from public, anon;
grant execute on function public.financeiro_salvar_orcamento(uuid, integer, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------- dados da empresa

create or replace function public.financeiro_salvar_entidade(p_workspace_id uuid, p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_nome text;
  v_cnpj text;
begin
  v_nome := regexp_replace(trim(coalesce(p->>'nome', '')), '\s+', ' ', 'g');
  v_cnpj := nullif(regexp_replace(coalesce(p->>'cnpj', ''), '\D', '', 'g'), '');
  if (select private.nivel_financeiro(p_workspace_id)) < 4 then raise exception 'Só a gestão do Financeiro muda os dados da empresa.' using errcode = 'P0001'; end if;
  if char_length(v_nome) < 2 then raise exception 'Dê um nome à empresa.' using errcode = 'P0001'; end if;
  if v_cnpj is not null and v_cnpj !~ '^\d{14}$' then raise exception 'O CNPJ tem 14 dígitos.' using errcode = 'P0001'; end if;
  update public.fin_entidades set nome = v_nome, razao_social = nullif(trim(p->>'razao_social'), ''), cnpj = v_cnpj
  where id = p_id and workspace_id = p_workspace_id;
  if not found then raise exception 'Empresa não encontrada.' using errcode = 'P0001'; end if;
  perform private.auditar_financeiro(p_workspace_id, null, 'empresa', jsonb_build_object('id', p_id, 'nome', v_nome));
exception
  when unique_violation then raise exception 'Já existe uma empresa com este nome ou CNPJ.' using errcode = 'P0001';
  when check_violation then raise exception 'Algum campo está fora do permitido (razão social até 200 caracteres).' using errcode = 'P0001';
end $$;
revoke all on function public.financeiro_salvar_entidade(uuid, uuid, jsonb) from public, anon;
grant execute on function public.financeiro_salvar_entidade(uuid, uuid, jsonb) to authenticated;
