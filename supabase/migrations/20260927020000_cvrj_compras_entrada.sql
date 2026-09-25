-- Compras (3): o que chegou entra no Estoque ou no Patrimônio.
--
-- Depois do recebimento, quem opera o Patrimônio dá o destino de cada item:
-- ESTOQUE (material de consumo: entra pelo estoque_entrada, com lote, validade
-- e local), PATRIMÔNIO (bem durável: um bem por unidade, pelo
-- patrimonio_salvar_bem, com plaqueta) ou CONSUMO (serviço ou uso imediato,
-- sem entrada). O custo que entra é o preço da proposta escolhida com a parte
-- do frete (rateado pelo valor dos itens), a nota fiscal e a fonte vêm da
-- compra. Ninguém dá entrada em mais do que chegou.
--
-- Quem opera o Patrimônio passa a ver as compras a partir da ordem emitida:
-- é quem vai receber o material.

alter table public.compras_pedidos add column if not exists entrada_concluida_em timestamptz;

create table if not exists public.compras_destinos (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  pedido_id       uuid not null references public.compras_pedidos (id) on delete cascade,
  item_id         uuid not null references public.compras_itens (id) on delete cascade,
  tipo            text not null check (tipo in ('estoque', 'patrimonio', 'consumo')),
  quantidade      numeric(12,3) not null check (quantidade > 0),
  custo_unitario  numeric(14,4) check (custo_unitario is null or custo_unitario >= 0),
  est_item_id     uuid references public.est_itens (id) on delete set null,
  est_quantidade  numeric(14,3) check (est_quantidade is null or est_quantidade > 0),
  est_grupo       uuid,
  bens            uuid[] not null default '{}',
  observacao      text check (char_length(observacao) <= 600),
  por             uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists compras_destinos_pedido_idx on public.compras_destinos (pedido_id);
create index if not exists compras_destinos_item_idx on public.compras_destinos (item_id);
create index if not exists compras_destinos_ws_idx on public.compras_destinos (workspace_id);
create index if not exists compras_destinos_est_item_idx on public.compras_destinos (est_item_id);
create index if not exists compras_destinos_por_idx on public.compras_destinos (por);

-- ---------------------------------------------------------------- quem vê

create or replace function private.compras_pode_ver(p_pedido_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.compras_pedidos p
    where p.id = p_pedido_id and (
      (p.solicitante_id = (select auth.uid()) and (select private.is_workspace_member(p.workspace_id)))
      or (select private.nivel_fin(p.workspace_id, p.entidade_id)) >= 1
      or (p.exige_diretoria and (select private.compras_eh_diretoria(p.workspace_id)))
      or (p.estado in ('emitido', 'recebido_parcial', 'recebido') and (select private.nivel_patrimonio(p.workspace_id)) >= 2)
    )
  )
$$;

alter table public.compras_destinos enable row level security;
revoke all on public.compras_destinos from anon;
revoke insert, update, delete, truncate, references, trigger on public.compras_destinos from authenticated;
grant select on public.compras_destinos to authenticated;
create policy compras_destinos_select on public.compras_destinos for select to authenticated using ((select private.compras_pode_ver(pedido_id)));

create or replace function public.compras_meu_papel(p_workspace_id uuid)
returns jsonb language sql security definer set search_path = '' stable as $$
  select jsonb_build_object(
    'pede', (select private.is_workspace_member(p_workspace_id)),
    'diretoria', (select private.compras_eh_diretoria(p_workspace_id)),
    'gestao', (select private.nivel_financeiro(p_workspace_id)) >= 4,
    'patrimonio', (select private.nivel_patrimonio(p_workspace_id)) >= 2)
$$;

-- ---------------------------------------------------------------- custo e entrada

-- O custo de uma unidade do item: o preço da proposta escolhida mais a parte do frete,
-- rateado pelo valor dos itens (o frete integra o custo de aquisição).
create or replace function private.compras_custo_unitario(p_item_id uuid)
returns numeric language sql security definer set search_path = '' stable as $$
  with p as (
    select pr.id, pr.frete from public.compras_itens i
    join public.compras_pedidos ped on ped.id = i.pedido_id
    join public.compras_propostas pr on pr.id = ped.proposta_id
    where i.id = p_item_id
  ), sub as (
    select coalesce(sum(round(i.quantidade * pi.valor_unitario, 2)), 0) as total
    from p join public.compras_proposta_itens pi on pi.proposta_id = p.id
    join public.compras_itens i on i.id = pi.item_id
    where pi.valor_unitario is not null
  )
  select round(pi.valor_unitario * case when sub.total > 0 then (sub.total + p.frete) / sub.total else 1 end, 4)
  from p cross join sub join public.compras_proposta_itens pi on pi.proposta_id = p.id and pi.item_id = p_item_id
$$;
revoke all on function private.compras_custo_unitario(uuid) from public, anon, authenticated;

-- Dá o destino de parte (ou de tudo) do que chegou de um item.
create or replace function public.compras_dar_entrada(p_item_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_item public.compras_itens;
  v_ped public.compras_pedidos;
  v_tipo text := p->>'tipo';
  v_qtd numeric;
  v_est_qtd numeric;
  v_recebido numeric;
  v_destinado numeric;
  v_custo numeric;
  v_data date;
  v_nf text;
  v_codigo text;
  v_fornecedor text;
  v_est public.est_itens;
  v_grupo uuid;
  v_bens uuid[] := '{}';
  v_id uuid;
  v_obs text := nullif(left(trim(coalesce(p->>'observacao', '')), 600), '');
  i integer;
begin
  select * into v_item from public.compras_itens where id = p_item_id;
  if not found then raise exception 'Item não encontrado.' using errcode = 'P0001'; end if;
  select * into v_ped from public.compras_pedidos where id = v_item.pedido_id for update;
  if (select private.nivel_patrimonio(v_ped.workspace_id)) < 2 then
    raise exception 'Quem dá entrada no estoque ou no patrimônio é quem opera o Patrimônio.' using errcode = 'P0001';
  end if;
  if v_ped.estado not in ('recebido_parcial', 'recebido') then raise exception 'Só dá para dar entrada no que já chegou.' using errcode = 'P0001'; end if;
  if v_tipo is null or v_tipo not in ('estoque', 'patrimonio', 'consumo') then raise exception 'Escolha o destino.' using errcode = 'P0001'; end if;
  v_qtd := nullif(p->>'quantidade', '')::numeric;
  if v_qtd is null or v_qtd <= 0 then raise exception 'Informe a quantidade.' using errcode = 'P0001'; end if;

  select coalesce(sum(ri.quantidade), 0) into v_recebido from public.compras_recebimento_itens ri where ri.item_id = v_item.id;
  select coalesce(sum(d.quantidade), 0) into v_destinado from public.compras_destinos d where d.item_id = v_item.id;
  if v_destinado + v_qtd > v_recebido then
    raise exception '"%": chegou %, já tem destino %, cabe no máximo %.', v_item.descricao, v_recebido, v_destinado, v_recebido - v_destinado using errcode = 'P0001';
  end if;

  v_custo := private.compras_custo_unitario(v_item.id);
  select max(r.recebido_em), left(string_agg(distinct r.nota_fiscal, ', '), 80) into v_data, v_nf from public.compras_recebimentos r where r.pedido_id = v_ped.id;
  v_codigo := format('OC-%s-%s', v_ped.oc_ano, lpad(v_ped.oc_numero::text, 4, '0'));
  select f.nome into v_fornecedor from public.compras_propostas pr join public.fin_favorecidos f on f.id = pr.favorecido_id where pr.id = v_ped.proposta_id;

  if v_tipo = 'estoque' then
    select * into v_est from public.est_itens where id = nullif(p->>'est_item_id', '')::uuid and workspace_id = v_ped.workspace_id;
    if not found then raise exception 'Escolha o item do estoque (ou cadastre antes).' using errcode = 'P0001'; end if;
    if v_est.eh_kit then raise exception 'Kit não entra por compra: dê entrada nos itens dele.' using errcode = 'P0001'; end if;
    -- A unidade do estoque pode ser outra (5 caixas de 100 = 500 un): o custo acompanha.
    v_est_qtd := coalesce(nullif(p->>'est_quantidade', '')::numeric, v_qtd);
    if v_est_qtd <= 0 then raise exception 'Informe a quantidade no estoque.' using errcode = 'P0001'; end if;
    v_grupo := public.estoque_entrada(v_ped.workspace_id, jsonb_build_object(
      'item_id', v_est.id, 'quantidade', v_est_qtd, 'custo_unitario', round(coalesce(v_custo, 0) * v_qtd / v_est_qtd, 4), 'origem', 'compra',
      'data', coalesce(nullif(p->>'data', ''), v_data::text), 'local_id', p->>'local_id', 'lote', p->>'lote', 'validade', p->>'validade',
      'documento', coalesce(v_nf, v_codigo), 'detalhe', left(format('Compra %s — %s', v_codigo, v_item.descricao), 600),
      'fonte_id', v_ped.fonte_id, 'projeto_id', v_ped.projeto_id, 'lancamento_id', v_ped.lancamento_id));
  elsif v_tipo = 'patrimonio' then
    if v_qtd <> trunc(v_qtd) or v_qtd > 50 then raise exception 'Bens entram um a um: quantidade inteira, até 50 por vez.' using errcode = 'P0001'; end if;
    if nullif(p->>'categoria_id', '') is null then raise exception 'Escolha a categoria do bem.' using errcode = 'P0001'; end if;
    for i in 1..v_qtd::integer loop
      v_bens := v_bens || public.patrimonio_salvar_bem(v_ped.workspace_id, null, jsonb_build_object(
        'nome', coalesce(nullif(left(trim(coalesce(p->>'nome', '')), 160), ''), left(v_item.descricao, 160)),
        'descricao', left(v_item.especificacao, 2000), 'categoria_id', p->>'categoria_id', 'local_id', p->>'local_id',
        'marca', left(p->>'marca', 80), 'modelo', left(p->>'modelo', 80), 'estado', 'novo', 'origem', 'compra',
        'aquisicao_em', coalesce(nullif(p->>'data', ''), v_data::text), 'valor', round(coalesce(v_custo, 0), 2), 'fornecedor', left(v_fornecedor, 160),
        'nota_fiscal', coalesce(v_nf, v_codigo), 'fonte_id', v_ped.fonte_id, 'projeto_id', v_ped.projeto_id, 'lancamento_id', v_ped.lancamento_id,
        'observacao', format('Compra %s (pedido PC-%s-%s).', v_codigo, v_ped.ano, lpad(v_ped.numero::text, 4, '0'))));
    end loop;
  else
    v_obs := coalesce(v_obs, 'Sem entrada: serviço ou consumo imediato.');
  end if;

  insert into public.compras_destinos (workspace_id, pedido_id, item_id, tipo, quantidade, custo_unitario, est_item_id, est_quantidade, est_grupo, bens, observacao, por)
  values (v_ped.workspace_id, v_ped.id, v_item.id, v_tipo, v_qtd, v_custo, v_est.id, v_est_qtd, v_grupo, v_bens, v_obs, (select auth.uid()))
  returning id into v_id;

  -- Tudo chegou e tudo tem destino: a compra sai da fila do Patrimônio.
  if v_ped.estado = 'recebido' and not exists (
    select 1 from public.compras_itens it where it.pedido_id = v_ped.id
      and it.quantidade > coalesce((select sum(d.quantidade) from public.compras_destinos d where d.item_id = it.id), 0))
  then
    update public.compras_pedidos set entrada_concluida_em = now(), updated_at = now() where id = v_ped.id returning * into v_ped;
  end if;
  perform private.compras_registrar(v_ped, 'entrada_' || v_tipo, jsonb_build_object('item', v_item.descricao, 'quantidade', v_qtd, 'bens', cardinality(v_bens)));
  return v_id;
exception
  when invalid_text_representation or invalid_datetime_format then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
end $$;

revoke all on function public.compras_dar_entrada(uuid, jsonb) from public, anon;
grant execute on function public.compras_dar_entrada(uuid, jsonb) to authenticated;
