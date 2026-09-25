-- Compras (2): ordem de compra, envio, recebimento e conta a pagar.
--
-- Depois de aprovado, o pedido vira ORDEM DE COMPRA (OC-AAAA-NNNN, numeração
-- própria), que o Financeiro manda ao fornecedor pelo e-mail do setor. Quando
-- o material chega, quem pediu (ou o Financeiro) registra o recebimento item a
-- item — pode ser em partes. A conta a pagar nasce da compra: valor até o
-- aprovado, categoria, fonte, projeto e fornecedor já vêm do pedido, e ela
-- entra no Financeiro já APROVADA (a compra passou pela aprovação; não pede
-- de novo). É o "três vias" dos sistemas de compra: ordem, recebimento, nota.

-- ---------------------------------------------------------------- pedido: ordem, recebimento, conta

alter table public.compras_pedidos
  add column if not exists oc_ano           smallint,
  add column if not exists oc_numero        integer check (oc_numero is null or oc_numero > 0),
  add column if not exists oc_emitida_em    timestamptz,
  add column if not exists oc_emitida_por   uuid references public.profiles (id) on delete set null,
  add column if not exists oc_observacao    text check (char_length(oc_observacao) <= 2000),
  add column if not exists oc_enviada_em    timestamptz,
  add column if not exists oc_enviada_para  text check (char_length(oc_enviada_para) <= 500),
  add column if not exists oc_enviada_por   uuid references public.profiles (id) on delete set null,
  add column if not exists recebido_em      timestamptz,
  add column if not exists lancamento_id    uuid references public.fin_lancamentos (id) on delete set null;
create unique index if not exists compras_pedidos_oc_idx on public.compras_pedidos (workspace_id, oc_ano, oc_numero) where oc_numero is not null;
create index if not exists compras_pedidos_oc_emitida_idx on public.compras_pedidos (oc_emitida_por);
create index if not exists compras_pedidos_oc_enviada_idx on public.compras_pedidos (oc_enviada_por);
create index if not exists compras_pedidos_lancamento_idx on public.compras_pedidos (lancamento_id);

alter table public.compras_pedidos drop constraint if exists compras_pedidos_estado_check;
alter table public.compras_pedidos add constraint compras_pedidos_estado_check
  check (estado in ('aberto','em_cotacao','em_aprovacao','aprovado','emitido','recebido_parcial','recebido','recusado','cancelado'));

create table if not exists public.compras_recebimentos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  pedido_id     uuid not null references public.compras_pedidos (id) on delete cascade,
  recebido_em   date not null,
  nota_fiscal   text check (char_length(nota_fiscal) <= 60),
  observacao    text check (char_length(observacao) <= 1000),
  por           uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists compras_recebimentos_pedido_idx on public.compras_recebimentos (pedido_id, recebido_em);
create index if not exists compras_recebimentos_ws_idx on public.compras_recebimentos (workspace_id);
create index if not exists compras_recebimentos_por_idx on public.compras_recebimentos (por);

create table if not exists public.compras_recebimento_itens (
  recebimento_id  uuid not null references public.compras_recebimentos (id) on delete cascade,
  item_id         uuid not null references public.compras_itens (id) on delete cascade,
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  quantidade      numeric(12,3) not null check (quantidade > 0),
  primary key (recebimento_id, item_id)
);
create index if not exists compras_recebimento_itens_item_idx on public.compras_recebimento_itens (item_id);
create index if not exists compras_recebimento_itens_ws_idx on public.compras_recebimento_itens (workspace_id);

alter table public.compras_recebimentos enable row level security;
alter table public.compras_recebimento_itens enable row level security;
revoke all on public.compras_recebimentos, public.compras_recebimento_itens from anon;
revoke insert, update, delete, truncate, references, trigger on public.compras_recebimentos, public.compras_recebimento_itens from authenticated;
grant select on public.compras_recebimentos, public.compras_recebimento_itens to authenticated;
create policy compras_recebimentos_select on public.compras_recebimentos for select to authenticated using ((select private.compras_pode_ver(pedido_id)));
create policy compras_recebimento_itens_select on public.compras_recebimento_itens for select to authenticated
  using (exists (select 1 from public.compras_recebimentos r where r.id = recebimento_id and (select private.compras_pode_ver(r.pedido_id))));

-- ---------------------------------------------------------------- ordem de compra

-- Emite a ordem de compra de um pedido aprovado (Financeiro, lançar).
create or replace function public.compras_emitir_ordem(p_pedido_id uuid, p_observacao text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_ped public.compras_pedidos;
  v_ano smallint := extract(year from (now() at time zone 'America/Sao_Paulo'))::smallint;
  v_num integer;
begin
  select * into v_ped from public.compras_pedidos where id = p_pedido_id for update;
  if not found or (select private.nivel_fin(v_ped.workspace_id, v_ped.entidade_id)) < 2 then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if v_ped.estado <> 'aprovado' then raise exception 'Só um pedido aprovado vira ordem de compra.' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('compras_oc:' || v_ped.workspace_id::text || ':' || v_ano));
  select coalesce(max(x.oc_numero), 0) + 1 into v_num from public.compras_pedidos x where x.workspace_id = v_ped.workspace_id and x.oc_ano = v_ano;
  update public.compras_pedidos set estado = 'emitido', oc_ano = v_ano, oc_numero = v_num, oc_emitida_em = now(), oc_emitida_por = (select auth.uid()),
    oc_observacao = nullif(left(trim(coalesce(p_observacao, '')), 2000), ''), updated_at = now()
  where id = p_pedido_id returning * into v_ped;
  perform private.compras_registrar(v_ped, 'ordem_emitida', jsonb_build_object('ordem', format('OC-%s-%s', v_ano, lpad(v_num::text, 4, '0'))));
  return format('OC-%s-%s', v_ano, lpad(v_num::text, 4, '0'));
end $$;

-- Registra que a ordem foi mandada ao fornecedor (o servidor envia pelo e-mail do setor e chama isto).
create or replace function public.compras_registrar_envio(p_pedido_id uuid, p_para text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_ped public.compras_pedidos;
begin
  select * into v_ped from public.compras_pedidos where id = p_pedido_id for update;
  if not found or (select private.nivel_fin(v_ped.workspace_id, v_ped.entidade_id)) < 2 then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if v_ped.oc_numero is null then raise exception 'Emita a ordem de compra antes de enviar.' using errcode = 'P0001'; end if;
  update public.compras_pedidos set oc_enviada_em = now(), oc_enviada_para = left(coalesce(p_para, ''), 500), oc_enviada_por = (select auth.uid()), updated_at = now()
  where id = p_pedido_id returning * into v_ped;
  perform private.compras_registrar(v_ped, 'ordem_enviada', jsonb_build_object('para', left(coalesce(p_para, ''), 500)));
end $$;

-- ---------------------------------------------------------------- recebimento

-- O que chegou (pode ser parte). Quem pediu registra — é quem recebe no setor — ou o Financeiro.
create or replace function public.compras_receber(p_pedido_id uuid, p jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_eu uuid := (select auth.uid());
  v_ped public.compras_pedidos;
  v_rec uuid;
  it jsonb;
  v_item public.compras_itens;
  v_qtd numeric;
  v_ja numeric;
  v_algum boolean := false;
begin
  select * into v_ped from public.compras_pedidos where id = p_pedido_id for update;
  if not found or not (select private.compras_pode_ver(p_pedido_id)) then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if v_ped.solicitante_id is distinct from v_eu and (select private.nivel_fin(v_ped.workspace_id, v_ped.entidade_id)) < 2 then
    raise exception 'Quem registra o recebimento é quem pediu ou o Financeiro.' using errcode = 'P0001';
  end if;
  if v_ped.estado not in ('emitido', 'recebido_parcial') then raise exception 'Só dá para receber depois de emitida a ordem de compra.' using errcode = 'P0001'; end if;
  if nullif(p->>'recebido_em', '') is null or (p->>'recebido_em')::date > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Informe a data em que chegou (não pode ser no futuro).' using errcode = 'P0001';
  end if;

  insert into public.compras_recebimentos (workspace_id, pedido_id, recebido_em, nota_fiscal, observacao, por)
  values (v_ped.workspace_id, p_pedido_id, (p->>'recebido_em')::date, nullif(left(trim(coalesce(p->>'nota_fiscal', '')), 60), ''),
    nullif(left(trim(coalesce(p->>'observacao', '')), 1000), ''), v_eu)
  returning id into v_rec;

  for it in select value from jsonb_array_elements(coalesce(p->'itens', '[]')) loop
    v_qtd := nullif(it->>'quantidade', '')::numeric;
    if v_qtd is null or v_qtd = 0 then continue; end if;
    select * into v_item from public.compras_itens where id = nullif(it->>'item_id', '')::uuid and pedido_id = p_pedido_id;
    if not found then raise exception 'Item inválido.' using errcode = 'P0001'; end if;
    if v_qtd < 0 then raise exception 'Quantidade inválida em "%".', v_item.descricao using errcode = 'P0001'; end if;
    select coalesce(sum(ri.quantidade), 0) into v_ja from public.compras_recebimento_itens ri
      join public.compras_recebimentos r on r.id = ri.recebimento_id where ri.item_id = v_item.id and r.pedido_id = p_pedido_id;
    if v_ja + v_qtd > v_item.quantidade then
      raise exception '"%": pedido %, já recebido %, não cabe mais %.', v_item.descricao, v_item.quantidade, v_ja, v_qtd using errcode = 'P0001';
    end if;
    insert into public.compras_recebimento_itens (recebimento_id, item_id, workspace_id, quantidade) values (v_rec, v_item.id, v_ped.workspace_id, v_qtd);
    v_algum := true;
  end loop;
  if not v_algum then raise exception 'Informe a quantidade de ao menos um item.' using errcode = 'P0001'; end if;

  -- Tudo chegou? Então recebido; senão, recebido em parte.
  if not exists (
    select 1 from public.compras_itens i where i.pedido_id = p_pedido_id and i.quantidade > coalesce((
      select sum(ri.quantidade) from public.compras_recebimento_itens ri join public.compras_recebimentos r on r.id = ri.recebimento_id
      where ri.item_id = i.id and r.pedido_id = p_pedido_id), 0))
  then
    update public.compras_pedidos set estado = 'recebido', recebido_em = now(), updated_at = now() where id = p_pedido_id returning * into v_ped;
  else
    update public.compras_pedidos set estado = 'recebido_parcial', updated_at = now() where id = p_pedido_id returning * into v_ped;
  end if;
  perform private.compras_registrar(v_ped, 'recebido', jsonb_build_object('recebimento', v_rec, 'nota_fiscal', p->>'nota_fiscal', 'completo', v_ped.estado = 'recebido'));
  return v_ped.estado;
end $$;

-- ---------------------------------------------------------------- conta a pagar

-- A conta a pagar da compra, no Financeiro: valor até o aprovado, em até 12 parcelas
-- mensais. Nasce aprovada (a compra já foi aprovada) e com a origem marcada.
create or replace function public.compras_lancar_conta(p_pedido_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_ped public.compras_pedidos;
  v_fav uuid;
  v_conta uuid := nullif(p->>'conta_id', '')::uuid;
  v_venc date := nullif(p->>'vencimento', '')::date;
  v_comp date := coalesce(nullif(p->>'competencia', '')::date, (now() at time zone 'America/Sao_Paulo')::date);
  v_valor numeric := coalesce(nullif(p->>'valor', '')::numeric, 0);
  v_n integer := coalesce(nullif(p->>'parcelas', '')::integer, 1);
  v_grupo uuid;
  v_base numeric;
  v_parcela numeric;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_codigo text;
  i integer;
begin
  select * into v_ped from public.compras_pedidos where id = p_pedido_id for update;
  if not found or (select private.nivel_fin(v_ped.workspace_id, v_ped.entidade_id)) < 2 then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if v_ped.estado not in ('emitido', 'recebido_parcial', 'recebido') then raise exception 'A conta a pagar sai da ordem de compra emitida.' using errcode = 'P0001'; end if;
  if v_ped.lancamento_id is not null then raise exception 'A conta a pagar desta compra já foi lançada.' using errcode = 'P0001'; end if;
  if v_conta is null or not exists (select 1 from public.fin_contas c where c.id = v_conta and c.workspace_id = v_ped.workspace_id and c.entidade_id = v_ped.entidade_id and c.ativa) then
    raise exception 'Escolha a conta de onde sai o pagamento.' using errcode = 'P0001';
  end if;
  if v_venc is null then raise exception 'Informe o vencimento.' using errcode = 'P0001'; end if;
  if v_valor <= 0 then v_valor := v_ped.valor_aprovado; end if;
  if v_valor > v_ped.valor_aprovado then
    raise exception 'O valor (R$ %) passa do aprovado (R$ %). Para pagar mais, a compra precisa de nova aprovação.',
      replace(to_char(v_valor, 'FM999999990.00'), '.', ','), replace(to_char(v_ped.valor_aprovado, 'FM999999990.00'), '.', ',') using errcode = 'P0001';
  end if;
  if v_n < 1 or v_n > 12 then raise exception 'De 1 a 12 parcelas.' using errcode = 'P0001'; end if;
  select pr.favorecido_id into v_fav from public.compras_propostas pr where pr.id = v_ped.proposta_id;

  v_codigo := format('OC-%s-%s', v_ped.oc_ano, lpad(v_ped.oc_numero::text, 4, '0'));
  v_grupo := case when v_n > 1 then gen_random_uuid() end;
  v_base := floor(v_valor * 100 / v_n) / 100;
  for i in 1..v_n loop
    v_parcela := case when i = v_n then v_valor - v_base * (v_n - 1) else v_base end;
    insert into public.fin_lancamentos (workspace_id, tipo, descricao, valor, conta_id, categoria_id, fonte_id, projeto_id, favorecido_id,
      competencia, vencimento, documento, observacao, grupo_id, parcela, parcelas, recorrente, aprovacao, aprovado_por, aprovado_em,
      criado_por, atualizado_por, origem_ref)
    values (v_ped.workspace_id, 'despesa', left(v_codigo || ' · ' || v_ped.titulo || case when v_n > 1 then format(' (%s/%s)', i, v_n) else '' end, 200),
      v_parcela, v_conta, v_ped.categoria_id, v_ped.fonte_id, v_ped.projeto_id, v_fav,
      v_comp, (v_venc + make_interval(months => i - 1))::date, nullif(left(trim(coalesce(p->>'documento', '')), 80), ''),
      left(format('Compra %s (pedido PC-%s-%s), aprovada em %s.', v_codigo, v_ped.ano, lpad(v_ped.numero::text, 4, '0'),
        to_char(v_ped.aprovado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')), 2000),
      v_grupo, case when v_n > 1 then i end, case when v_n > 1 then v_n end, false, 'aprovada', v_ped.aprovado_fin_por, v_ped.aprovado_em,
      (select auth.uid()), (select auth.uid()), format('compras:%s:%s', v_ped.id, i))
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;
  perform private.auditar_financeiro(v_ped.workspace_id, v_ids[1], 'criar', jsonb_build_object('origem', 'compras', 'ordem', v_codigo, 'parcelas', v_n, 'valor', v_valor));
  update public.compras_pedidos set lancamento_id = v_ids[1], updated_at = now() where id = p_pedido_id returning * into v_ped;
  perform private.compras_registrar(v_ped, 'conta_lancada', jsonb_build_object('lancamento', v_ids[1], 'total', v_valor, 'parcelas', v_n));
  return v_ids[1];
end $$;

-- Cancelar agora também vale para a compra aprovada ou com ordem emitida (o Financeiro),
-- desde que nada tenha chegado nem a conta tenha sido lançada.
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
  if v_ped.estado in ('recebido_parcial', 'recebido') or v_ped.lancamento_id is not null then
    raise exception 'Já chegou material ou a conta foi lançada: não dá mais para cancelar a compra.' using errcode = 'P0001';
  end if;
  if not ((v_ped.solicitante_id = v_eu and v_ped.estado in ('aberto', 'em_cotacao', 'em_aprovacao'))
          or (select private.nivel_fin(v_ped.workspace_id, v_ped.entidade_id)) >= 2) then
    raise exception 'Você não pode cancelar este pedido.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_motivo, '')) < 5 then raise exception 'Diga o motivo (ao menos 5 caracteres).' using errcode = 'P0001'; end if;
  update public.compras_pedidos set estado = 'cancelado', encerrado_por = v_eu, encerrado_em = now(), motivo_encerramento = left(v_motivo, 1000), updated_at = now()
  where id = p_pedido_id returning * into v_ped;
  perform private.compras_registrar(v_ped, 'cancelado', jsonb_build_object('motivo', v_motivo));
end $$;

revoke all on function public.compras_emitir_ordem(uuid, text), public.compras_registrar_envio(uuid, text), public.compras_receber(uuid, jsonb),
  public.compras_lancar_conta(uuid, jsonb), public.compras_cancelar(uuid, text) from public, anon;
grant execute on function public.compras_emitir_ordem(uuid, text), public.compras_registrar_envio(uuid, text), public.compras_receber(uuid, jsonb),
  public.compras_lancar_conta(uuid, jsonb), public.compras_cancelar(uuid, text) to authenticated;
