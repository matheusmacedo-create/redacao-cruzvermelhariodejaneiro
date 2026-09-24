-- Financeiro, parte 4: orçamento por categoria, para a saúde do caixa.
--
-- Um valor mensal por categoria e ano (o caso da filial: despesas que se
-- repetem com pouca variação). O painel compara com o realizado no mês, por
-- competência. Só a gestão define; zero ou vazio tira do orçamento.

create table if not exists public.fin_orcamentos (
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  ano             smallint not null check (ano between 2020 and 2100),
  categoria_id    uuid not null references public.fin_categorias (id) on delete cascade,
  valor_mensal    numeric(14,2) not null check (valor_mensal > 0),
  atualizado_por  uuid references public.profiles (id) on delete set null,
  updated_at      timestamptz not null default now(),
  primary key (workspace_id, ano, categoria_id)
);
create index if not exists fin_orcamentos_categoria_idx on public.fin_orcamentos (categoria_id);
create index if not exists fin_orcamentos_atualizado_idx on public.fin_orcamentos (atualizado_por);

alter table public.fin_orcamentos enable row level security;
revoke all on public.fin_orcamentos from anon, authenticated;
grant select on public.fin_orcamentos to authenticated;
create policy fin_orcamentos_select on public.fin_orcamentos for select to authenticated using ((select private.nivel_financeiro(workspace_id)) >= 1);

/** Grava o orçamento do ano de uma vez: [{categoria_id, valor_mensal}]. Vazio ou zero tira a categoria. */
create or replace function public.financeiro_salvar_orcamento(p_workspace_id uuid, p_ano integer, p_itens jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_cat uuid;
  v_valor numeric;
  v_total integer := 0;
begin
  if (select private.nivel_financeiro(p_workspace_id)) < 4 then raise exception 'Só a gestão do Financeiro define o orçamento.' using errcode = 'P0001'; end if;
  if p_ano not between 2020 and 2100 then raise exception 'Ano inválido.' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 500 then raise exception 'Orçamento inválido.' using errcode = 'P0001'; end if;
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_cat := (v_item->>'categoria_id')::uuid;
    v_valor := nullif(v_item->>'valor_mensal', '')::numeric;
    if not exists (select 1 from public.fin_categorias where id = v_cat and workspace_id = p_workspace_id) then
      raise exception 'Categoria inválida.' using errcode = 'P0001';
    end if;
    if v_valor is null or v_valor <= 0 then
      delete from public.fin_orcamentos where workspace_id = p_workspace_id and ano = p_ano and categoria_id = v_cat;
    else
      insert into public.fin_orcamentos (workspace_id, ano, categoria_id, valor_mensal, atualizado_por) values (p_workspace_id, p_ano, v_cat, round(v_valor, 2), (select auth.uid()))
      on conflict (workspace_id, ano, categoria_id) do update set valor_mensal = excluded.valor_mensal, atualizado_por = excluded.atualizado_por, updated_at = now();
      v_total := v_total + 1;
    end if;
  end loop;
  perform private.auditar_financeiro(p_workspace_id, null, 'orcamento', jsonb_build_object('ano', p_ano, 'categorias', v_total));
  return v_total;
end $$;

revoke all on function public.financeiro_salvar_orcamento(uuid, integer, jsonb) from public, anon;
grant execute on function public.financeiro_salvar_orcamento(uuid, integer, jsonb) to authenticated;
