-- Financeiro, parte 2: extrato do banco e conciliação.
--
-- O extrato entra por arquivo (OFX ou CSV baixado do internet banking; o
-- Open Finance fica para depois). Cada linha vira um fin_extrato; a mesma
-- linha importada duas vezes não duplica (identificador por conta: FITID do
-- OFX, ou data+valor+descrição+ordem no CSV).
--
-- Conciliar é dizer "esta linha do banco é este lançamento". A data e o valor
-- do banco mandam: conciliar um lançamento em aberto marca como pago na data
-- da linha; um já pago passa a ter a data e o valor do banco. Linha que não
-- tem lançamento (tarifa, rendimento) vira lançamento na hora, já pago.
-- Transferência entre contas da filial concilia dos dois lados.
--
-- Mês fechado (fin_config.fechado_ate): linha de extrato dele não concilia
-- nem desconcilia mais.

create table if not exists public.fin_importacoes (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  conta_id        uuid not null references public.fin_contas (id) on delete cascade,
  arquivo         text not null check (char_length(arquivo) between 1 and 200),
  formato         text not null check (formato in ('ofx','csv')),
  inicio          date,
  fim             date,
  linhas          integer not null default 0,
  novas           integer not null default 0,
  saldo_banco     numeric(14,2),
  saldo_em        date,
  importado_por   uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists fin_importacoes_conta_idx on public.fin_importacoes (conta_id, created_at desc);
create index if not exists fin_importacoes_workspace_idx on public.fin_importacoes (workspace_id);
create index if not exists fin_importacoes_importado_idx on public.fin_importacoes (importado_por);

create table if not exists public.fin_extrato (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  conta_id        uuid not null references public.fin_contas (id) on delete cascade,
  importacao_id   uuid not null references public.fin_importacoes (id) on delete cascade,
  identificador   text not null check (char_length(identificador) between 1 and 300),
  data            date not null,
  valor           numeric(14,2) not null check (valor <> 0),
  descricao       text not null check (char_length(descricao) <= 300),
  documento       text check (char_length(documento) <= 80),
  situacao        text not null default 'pendente' check (situacao in ('pendente','conciliado','ignorado')),
  lancamento_id   uuid references public.fin_lancamentos (id) on delete set null,
  motivo          text check (char_length(motivo) <= 300),
  conciliado_por  uuid references public.profiles (id) on delete set null,
  conciliado_em   timestamptz,
  created_at      timestamptz not null default now(),
  unique (conta_id, identificador),
  constraint fin_extrato_conciliado_tem_lancamento check (situacao <> 'conciliado' or lancamento_id is not null)
);
create index if not exists fin_extrato_pendentes_idx on public.fin_extrato (conta_id, data) where situacao = 'pendente';
create index if not exists fin_extrato_workspace_idx on public.fin_extrato (workspace_id, data);
create index if not exists fin_extrato_importacao_idx on public.fin_extrato (importacao_id);
create unique index if not exists fin_extrato_lancamento_idx on public.fin_extrato (lancamento_id, conta_id) where lancamento_id is not null;
create index if not exists fin_extrato_conciliado_idx on public.fin_extrato (conciliado_por);

alter table public.fin_importacoes enable row level security;
alter table public.fin_extrato enable row level security;
revoke all on public.fin_importacoes, public.fin_extrato from anon, authenticated;
grant select on public.fin_importacoes, public.fin_extrato to authenticated;
create policy fin_importacoes_select on public.fin_importacoes for select to authenticated using ((select private.nivel_financeiro(workspace_id)) >= 1);
create policy fin_extrato_select on public.fin_extrato for select to authenticated using ((select private.nivel_financeiro(workspace_id)) >= 1);

-- Um lançamento conciliado que some (o "on delete set null" acima) devolve a
-- linha para pendente, em vez de deixá-la "conciliada com nada".
create or replace function private.fin_extrato_orfao()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.lancamento_id is null and new.situacao = 'conciliado' then
    new.situacao := 'pendente'; new.conciliado_por := null; new.conciliado_em := null;
  end if;
  return new;
end $$;
revoke all on function private.fin_extrato_orfao() from public, anon, authenticated;
drop trigger if exists fin_extrato_orfao on public.fin_extrato;
create trigger fin_extrato_orfao before update on public.fin_extrato for each row execute function private.fin_extrato_orfao();

/**
 * Importa as linhas de um extrato (já lidas pelo servidor). Devolve quantas
 * eram novas; as repetidas são ignoradas sem erro.
 */
create or replace function public.financeiro_importar_extrato(p_workspace_id uuid, p_conta_id uuid, p_meta jsonb, p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_imp uuid;
  v_novas integer;
begin
  if (select private.nivel_financeiro(p_workspace_id)) < 2 then raise exception 'Você não tem acesso para importar extrato.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.fin_contas where id = p_conta_id and workspace_id = p_workspace_id) then raise exception 'Conta inválida.' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) not between 1 and 5000 then
    raise exception 'O arquivo não tem movimentos (ou tem mais de 5.000).' using errcode = 'P0001';
  end if;
  insert into public.fin_importacoes (workspace_id, conta_id, arquivo, formato, inicio, fim, linhas, saldo_banco, saldo_em, importado_por)
  values (p_workspace_id, p_conta_id, left(coalesce(nullif(trim(p_meta->>'arquivo'), ''), 'extrato'), 200), p_meta->>'formato',
    (select min((x->>'data')::date) from jsonb_array_elements(p_linhas) x), (select max((x->>'data')::date) from jsonb_array_elements(p_linhas) x),
    jsonb_array_length(p_linhas), nullif(p_meta->>'saldo_banco', '')::numeric, nullif(p_meta->>'saldo_em', '')::date, (select auth.uid()))
  returning id into v_imp;
  with novas as (
    insert into public.fin_extrato (workspace_id, conta_id, importacao_id, identificador, data, valor, descricao, documento)
    select p_workspace_id, p_conta_id, v_imp, left(x->>'identificador', 300), (x->>'data')::date, (x->>'valor')::numeric,
      left(coalesce(nullif(trim(x->>'descricao'), ''), '(sem descrição)'), 300), nullif(left(trim(coalesce(x->>'documento', '')), 80), '')
    from jsonb_array_elements(p_linhas) x
    where (x->>'valor')::numeric <> 0
    on conflict (conta_id, identificador) do nothing
    returning 1
  )
  select count(*) into v_novas from novas;
  update public.fin_importacoes set novas = v_novas where id = v_imp;
  perform private.auditar_financeiro(p_workspace_id, null, 'importar_extrato', jsonb_build_object('importacao', v_imp, 'conta', p_conta_id,
    'linhas', jsonb_array_length(p_linhas), 'novas', v_novas));
  return jsonb_build_object('importacao', v_imp, 'linhas', jsonb_array_length(p_linhas), 'novas', v_novas);
end $$;

/**
 * Concilia uma linha do extrato com um lançamento: mesma conta, mesmo
 * sentido. A data e o valor do banco valem para o pagamento.
 */
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
  if private.fin_fechado(e.workspace_id, e.data) then raise exception 'Esta linha é de um mês já fechado.' using errcode = 'P0001'; end if;
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
  if private.fin_fechado(l.workspace_id, l.pago_em) then raise exception 'O lançamento foi pago num mês já fechado.' using errcode = 'P0001'; end if;

  -- O banco manda na data e no valor. Na transferência, só o lado que sai
  -- define o pagamento; o lado que entra só se liga (se já estiver paga).
  if l.tipo <> 'transferencia' or e.valor < 0 or l.pago_em is null then
    update public.fin_lancamentos set pago_em = e.data, valor_pago = abs(e.valor), atualizado_por = (select auth.uid()), updated_at = now() where id = l.id;
  end if;
  update public.fin_extrato set situacao = 'conciliado', lancamento_id = l.id, conciliado_por = (select auth.uid()), conciliado_em = now() where id = e.id;
  perform private.auditar_financeiro(e.workspace_id, l.id, 'conciliar', jsonb_build_object('extrato', e.id, 'data', e.data, 'valor', e.valor,
    'antes', jsonb_build_object('pago_em', l.pago_em, 'valor_pago', l.valor_pago)));
end $$;

/**
 * Linha sem lançamento (tarifa, rendimento, Pix recebido): cria o lançamento
 * já pago e concilia. Não passa pela aprovação — o dinheiro já saiu ou
 * entrou; o registro fica na auditoria como "criado do extrato".
 */
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
  if private.fin_fechado(e.workspace_id, e.data) then raise exception 'Esta linha é de um mês já fechado.' using errcode = 'P0001'; end if;
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

/** Desfaz a conciliação. O lançamento continua pago: se não foi, "Desfazer pagamento" nele. */
create or replace function public.financeiro_desconciliar(p_extrato_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  e public.fin_extrato;
begin
  select * into e from public.fin_extrato where id = p_extrato_id for update;
  if not found or (select private.nivel_financeiro(e.workspace_id)) < 2 then raise exception 'Linha do extrato não encontrada.' using errcode = 'P0001'; end if;
  if private.fin_fechado(e.workspace_id, e.data) then raise exception 'Esta linha é de um mês já fechado.' using errcode = 'P0001'; end if;
  update public.fin_extrato set situacao = 'pendente', lancamento_id = null, motivo = null, conciliado_por = null, conciliado_em = null where id = e.id;
  perform private.auditar_financeiro(e.workspace_id, e.lancamento_id, 'desconciliar', jsonb_build_object('extrato', e.id, 'situacao_antes', e.situacao));
end $$;

/** Ignora uma linha que não é movimento da filial a registrar (estorno que se anula, bloqueio judicial desfeito...). */
create or replace function public.financeiro_ignorar_extrato(p_extrato_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  e public.fin_extrato;
begin
  select * into e from public.fin_extrato where id = p_extrato_id for update;
  if not found or (select private.nivel_financeiro(e.workspace_id)) < 2 then raise exception 'Linha do extrato não encontrada.' using errcode = 'P0001'; end if;
  if e.situacao <> 'pendente' then raise exception 'Esta linha já foi conciliada ou ignorada.' using errcode = 'P0001'; end if;
  if private.fin_fechado(e.workspace_id, e.data) then raise exception 'Esta linha é de um mês já fechado.' using errcode = 'P0001'; end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Diga por que a linha fica de fora.' using errcode = 'P0001'; end if;
  update public.fin_extrato set situacao = 'ignorado', motivo = left(trim(p_motivo), 300), conciliado_por = (select auth.uid()), conciliado_em = now() where id = e.id;
  perform private.auditar_financeiro(e.workspace_id, null, 'ignorar_extrato', jsonb_build_object('extrato', e.id, 'valor', e.valor, 'motivo', trim(p_motivo)));
end $$;

/** Desfaz uma importação inteira — só enquanto nenhuma linha dela foi conciliada ou ignorada. */
create or replace function public.financeiro_excluir_importacao(p_importacao_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  i public.fin_importacoes;
begin
  select * into i from public.fin_importacoes where id = p_importacao_id for update;
  if not found or (select private.nivel_financeiro(i.workspace_id)) < 2 then raise exception 'Importação não encontrada.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.fin_extrato where importacao_id = i.id and situacao <> 'pendente') then
    raise exception 'Algumas linhas desta importação já foram conciliadas ou ignoradas. Desfaça essas primeiro.' using errcode = 'P0001';
  end if;
  delete from public.fin_importacoes where id = i.id;
  perform private.auditar_financeiro(i.workspace_id, null, 'excluir_importacao', jsonb_build_object('arquivo', i.arquivo, 'linhas', i.novas));
end $$;

revoke all on function public.financeiro_importar_extrato(uuid, uuid, jsonb, jsonb) from public, anon;
revoke all on function public.financeiro_conciliar(uuid, uuid) from public, anon;
revoke all on function public.financeiro_criar_do_extrato(uuid, jsonb) from public, anon;
revoke all on function public.financeiro_desconciliar(uuid) from public, anon;
revoke all on function public.financeiro_ignorar_extrato(uuid, text) from public, anon;
revoke all on function public.financeiro_excluir_importacao(uuid) from public, anon;
grant execute on function public.financeiro_importar_extrato(uuid, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.financeiro_conciliar(uuid, uuid) to authenticated;
grant execute on function public.financeiro_criar_do_extrato(uuid, jsonb) to authenticated;
grant execute on function public.financeiro_desconciliar(uuid) to authenticated;
grant execute on function public.financeiro_ignorar_extrato(uuid, text) to authenticated;
grant execute on function public.financeiro_excluir_importacao(uuid) to authenticated;
