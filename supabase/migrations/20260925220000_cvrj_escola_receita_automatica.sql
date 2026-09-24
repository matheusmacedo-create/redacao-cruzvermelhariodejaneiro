-- Escola como empresa (3): a venda paga na Únicopag vira receita nos livros
-- da Escola, sozinha. Cada conta da Únicopag ganha uma conta no Financeiro
-- da Escola (tipo "Conta de pagamento", nome "Únicopag · <conta>"); a cada
-- leitura (cron diário ou botão), o que foi pago desde a data escolhida
-- entra como receita em "Cursos e capacitações", fonte "Recursos livres" da
-- Escola. Estorno e chargeback entram como despesa em "Estornos e
-- chargebacks", no dia em que a Únicopag marcou a devolução.
--
-- Cada lançamento automático guarda a origem (origem_ref = 'unicopag:<hash>'
-- e 'unicopag:<hash>:estorno'): lançar de novo nunca duplica, e a equipe
-- pode corrigir categoria e descrição sem que a leitura seguinte desfaça.
-- O pagamento de um lançamento automático não se desfaz na mão — se o
-- dinheiro voltou, é o estorno que registra.
--
-- Mês já fechado: a venda (ou o estorno) entra no primeiro dia aberto, com
-- a data real na observação — o fechamento não muda depois de entregue.
-- Nome do aluno não vai para o Financeiro: a descrição leva curso e forma
-- de pagamento, e o documento leva o código da transação (quem vê a Escola
-- acha o pagador por ele).

alter table public.escola_contas add column if not exists fin_conta_id uuid references public.fin_contas (id) on delete set null;
-- Vendas pagas antes desta data ficam só no painel de vendas (null: o 1º dia do mês da primeira leitura).
alter table public.escola_contas add column if not exists lancar_desde date check (lancar_desde >= '2020-01-01');
create index if not exists escola_contas_fin_conta_idx on public.escola_contas (fin_conta_id);

alter table public.fin_lancamentos add column if not exists origem_ref text check (char_length(origem_ref) <= 140);
create unique index if not exists fin_lancamentos_origem_idx on public.fin_lancamentos (workspace_id, origem_ref) where origem_ref is not null;

-- ---------------------------------------------------------------- lançar

create or replace function public.escola_lancar_no_financeiro(p_conta_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.escola_contas;
  v_ent public.fin_entidades;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_desde date;
  v_conta uuid;
  v_nome text;
  v_fonte uuid;
  v_cat_receita uuid;
  v_cat_estorno uuid;
  t record;
  v_data date;
  v_real date;
  v_obs text;
  v_valor numeric(14,2);
  v_receitas integer := 0;
  v_estornos integer := 0;
begin
  select * into c from public.escola_contas where id = p_conta_id for update;
  if not found then return jsonb_build_object('receitas', 0, 'estornos', 0); end if;
  perform private.semear_financeiro(c.workspace_id);
  select * into v_ent from public.fin_entidades where workspace_id = c.workspace_id and tipo = 'escola' and ativa;
  if v_ent.id is null then return jsonb_build_object('receitas', 0, 'estornos', 0, 'aviso', 'A Escola não está ativa no Financeiro.'); end if;
  v_desde := coalesce(c.lancar_desde, date_trunc('month', v_hoje)::date);

  -- A conta da Únicopag nos livros da Escola (criada na primeira vez; reaproveitada se a conta da escola for recadastrada).
  select id into v_conta from public.fin_contas where id = c.fin_conta_id and entidade_id = v_ent.id;
  if v_conta is null then
    v_nome := left('Únicopag · ' || c.nome, 80);
    select id into v_conta from public.fin_contas where workspace_id = c.workspace_id and entidade_id = v_ent.id and nome = v_nome;
    if v_conta is null then
      if exists (select 1 from public.fin_contas where workspace_id = c.workspace_id and nome = v_nome) then
        v_nome := left('Únicopag · ' || c.nome, 71) || ' ' || left(c.id::text, 8);
      end if;
      insert into public.fin_contas (workspace_id, entidade_id, nome, tipo, banco, saldo_inicial, saldo_inicial_em)
      values (c.workspace_id, v_ent.id, v_nome, 'gateway', 'Únicopag', 0, v_desde)
      returning id into v_conta;
    end if;
  end if;
  if c.fin_conta_id is distinct from v_conta or c.lancar_desde is null then
    update public.escola_contas set fin_conta_id = v_conta, lancar_desde = v_desde where id = c.id;
  end if;

  select id into v_fonte from public.fin_fontes where entidade_id = v_ent.id and not restrita and ativa order by (nome = 'Recursos livres') desc, nome limit 1;
  select id into v_cat_receita from public.fin_categorias where workspace_id = c.workspace_id and tipo = 'receita' and ativa
    order by (nome = 'Cursos e capacitações') desc, (nome = 'Outras receitas') desc, ordem limit 1;
  insert into public.fin_categorias (workspace_id, tipo, grupo, nome, fixa, ordem)
  values (c.workspace_id, 'despesa', 'Financeiras', 'Estornos e chargebacks', false, 52)
  on conflict (workspace_id, tipo, nome) do nothing;
  select id into v_cat_estorno from public.fin_categorias where workspace_id = c.workspace_id and tipo = 'despesa' and nome = 'Estornos e chargebacks';
  if v_fonte is null or v_cat_receita is null then
    return jsonb_build_object('receitas', 0, 'estornos', 0, 'aviso', 'Falta uma fonte livre da Escola ou uma categoria de receita ativa no Financeiro.');
  end if;

  -- Vendas pagas (inclusive as que depois voltaram: a venda aconteceu, e o estorno entra à parte).
  for t in
    select x.* from public.escola_transacoes x
    where x.conta_id = c.id and x.paga_em is not null and x.valor > 0
      and x.situacao in ('pago', 'em_disputa', 'estornado', 'contestado')
      and (x.paga_em at time zone 'America/Sao_Paulo')::date >= v_desde
      and not exists (select 1 from public.fin_lancamentos l where l.workspace_id = c.workspace_id and l.origem_ref = 'unicopag:' || x.hash)
    order by x.paga_em
    limit 2000
  loop
    v_real := least((t.paga_em at time zone 'America/Sao_Paulo')::date, v_hoje);
    v_data := v_real;
    v_obs := null;
    if v_ent.fechado_ate is not null and v_data <= v_ent.fechado_ate then
      v_data := v_ent.fechado_ate + 1;
      v_obs := 'Pago em ' || to_char(v_real, 'DD/MM/YYYY') || ', num mês já fechado: lançado no primeiro dia aberto.';
    end if;
    v_valor := round(t.valor / 100.0, 2);
    insert into public.fin_lancamentos (workspace_id, tipo, descricao, valor, conta_id, categoria_id, fonte_id, competencia, vencimento, pago_em, valor_pago,
      forma, documento, observacao, aprovacao, origem_ref)
    values (c.workspace_id, 'receita',
      left('Únicopag · ' || coalesce(nullif(t.produto, ''), c.nome) || ' · '
        || case t.metodo when 'pix' then 'PIX' when 'cartao' then 'Cartão' || case when t.parcelas > 1 then ' ' || t.parcelas || 'x' else '' end when 'boleto' then 'Boleto' else 'Outro' end, 200),
      v_valor, v_conta, v_cat_receita, v_fonte, date_trunc('month', v_data)::date, v_data, v_data, v_valor,
      t.metodo, left(t.hash, 80), v_obs, 'nao_exige', 'unicopag:' || t.hash);
    v_receitas := v_receitas + 1;
  end loop;

  -- Estorno e chargeback do que já entrou como receita: despesa do mesmo valor, na mesma conta e fonte.
  for t in
    select x.hash, x.situacao, x.produto, x.metodo, x.paga_em, x.atualizada_em, l.valor, l.conta_id, l.fonte_id from public.escola_transacoes x
    join public.fin_lancamentos l on l.workspace_id = c.workspace_id and l.origem_ref = 'unicopag:' || x.hash
    where x.conta_id = c.id and x.situacao in ('estornado', 'contestado')
      and not exists (select 1 from public.fin_lancamentos r where r.workspace_id = c.workspace_id and r.origem_ref = 'unicopag:' || x.hash || ':estorno')
    order by x.atualizada_em nulls last
    limit 2000
  loop
    v_real := least(greatest(coalesce((t.atualizada_em at time zone 'America/Sao_Paulo')::date, v_hoje), (t.paga_em at time zone 'America/Sao_Paulo')::date), v_hoje);
    v_data := v_real;
    v_obs := null;
    if v_ent.fechado_ate is not null and v_data <= v_ent.fechado_ate then
      v_data := v_ent.fechado_ate + 1;
      v_obs := 'Devolvido em ' || to_char(v_real, 'DD/MM/YYYY') || ', num mês já fechado: lançado no primeiro dia aberto.';
    end if;
    insert into public.fin_lancamentos (workspace_id, tipo, descricao, valor, conta_id, categoria_id, fonte_id, competencia, vencimento, pago_em, valor_pago,
      forma, documento, observacao, aprovacao, origem_ref)
    values (c.workspace_id, 'despesa',
      left(case t.situacao when 'estornado' then 'Estorno' else 'Chargeback' end || ' Únicopag · ' || coalesce(nullif(t.produto, ''), c.nome), 200),
      t.valor, t.conta_id, v_cat_estorno, t.fonte_id, date_trunc('month', v_data)::date, v_data, v_data, t.valor,
      t.metodo, left(t.hash, 80), v_obs, 'nao_exige', 'unicopag:' || t.hash || ':estorno');
    v_estornos := v_estornos + 1;
  end loop;

  if v_receitas + v_estornos > 0 then
    perform private.auditar_financeiro(c.workspace_id, null, 'unicopag', jsonb_build_object('conta', c.nome, 'receitas', v_receitas, 'estornos', v_estornos));
  end if;
  return jsonb_build_object('receitas', v_receitas, 'estornos', v_estornos, 'conta', v_conta);
end $$;
revoke all on function public.escola_lancar_no_financeiro(uuid) from public, anon, authenticated;
grant execute on function public.escola_lancar_no_financeiro(uuid) to service_role;

-- ---------------------------------------------------------------- a data de início, no cadastro da conta

create or replace function public.escola_salvar_conta(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_nome text;
  v_url text;
  v_desde date;
begin
  v_id := nullif(p->>'id', '')::uuid;
  v_nome := regexp_replace(trim(coalesce(p->>'nome', '')), '\s+', ' ', 'g');
  v_url := nullif(trim(coalesce(p->>'sistema_url', '')), '');
  v_desde := nullif(p->>'lancar_desde', '')::date;
  if (select private.workspace_role(p_workspace_id)) is distinct from 'admin' then raise exception 'Só um admin cadastra as contas da escola.' using errcode = 'P0001'; end if;
  if char_length(v_nome) < 2 then raise exception 'Dê um nome à conta (ex.: Punção Venosa).' using errcode = 'P0001'; end if;
  if v_url is not null and v_url !~ '^https://[^\s]+$' then raise exception 'O endereço do sistema precisa começar com https://.' using errcode = 'P0001'; end if;
  if v_desde is not null and (v_desde < '2020-01-01' or v_desde > (now() at time zone 'America/Sao_Paulo')::date + 366) then
    raise exception 'A data de início dos lançamentos está fora do permitido.' using errcode = 'P0001';
  end if;
  if v_id is null then
    insert into public.escola_contas (workspace_id, nome, descricao, sistema_url, lancar_desde, criado_por)
    values (p_workspace_id, v_nome, nullif(trim(p->>'descricao'), ''), v_url, v_desde, (select auth.uid()))
    returning id into v_id;
  else
    update public.escola_contas set nome = v_nome, descricao = nullif(trim(p->>'descricao'), ''), sistema_url = v_url,
      ativa = coalesce((p->>'ativa')::boolean, ativa), lancar_desde = coalesce(v_desde, lancar_desde), updated_at = now()
    where id = v_id and workspace_id = p_workspace_id;
    if not found then raise exception 'Conta não encontrada.' using errcode = 'P0001'; end if;
  end if;
  return v_id;
exception
  when unique_violation then raise exception 'Já existe uma conta com este nome.' using errcode = 'P0001';
  when check_violation then raise exception 'Algum campo está fora do permitido (nome até 80, descrição até 300 caracteres).' using errcode = 'P0001';
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------- o automático não se desfaz na mão

create or replace function public.financeiro_desfazer_pagamento(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.fin_lancamentos;
begin
  select * into a from public.fin_lancamentos where id = p_id for update;
  if not found or (select private.nivel_financeiro(a.workspace_id)) < 2 then raise exception 'Lançamento não encontrado.' using errcode = 'P0001'; end if;
  if a.pago_em is null then return; end if;
  if a.origem_ref like 'unicopag:%' then
    raise exception 'Este lançamento veio da Únicopag e acompanha a venda. Se o dinheiro voltou, o estorno entra sozinho na próxima leitura.' using errcode = 'P0001';
  end if;
  if private.fin_fechado_conta(a.conta_id, a.pago_em) then raise exception 'Foi pago num mês já fechado e não muda mais.' using errcode = 'P0001'; end if;
  update public.fin_lancamentos set pago_em = null, valor_pago = null, atualizado_por = (select auth.uid()), updated_at = now() where id = p_id;
  perform private.auditar_financeiro(a.workspace_id, p_id, 'desfazer_pagamento', jsonb_build_object('pago_em', a.pago_em, 'valor_pago', a.valor_pago));
end $$;
