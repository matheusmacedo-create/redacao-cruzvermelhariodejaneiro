-- Financeiro, parte 3: fechamento do mês.
--
-- Fechar um mês é a gestão (o contador) dizer "conferi": fin_config.fechado_ate
-- passa para o último dia dele, e o que foi pago até lá não muda mais (as
-- funções das partes 1 e 2 já respeitam essa data). Os meses fecham em
-- ordem, e só depois de acabarem. Linha de extrato do mês ainda por conciliar
-- impede o fechamento; o resto (comprovante faltando, conta em aberto,
-- diferença de saldo) é aviso, que quem fecha aceita por escrito.
--
-- Cada fechamento guarda o retrato do mês (resumo) e os avisos aceitos.
-- Reabrir só o último mês fechado, com motivo — fica no histórico.
--
-- Trabalho voluntário (ITG 2002 R1): as horas do Voluntariado vezes o valor
-- de mercado da hora (fin_config.valor_hora_voluntario) entram no resumo,
-- para o contador reconhecer como receita e despesa. O Financeiro vê só o
-- total de horas do mês — nada de quem fez.

alter table public.fin_config add column if not exists valor_hora_voluntario numeric(10,2) check (valor_hora_voluntario is null or valor_hora_voluntario >= 0);

-- O pacote do contador (zip) fica no mesmo bucket privado, fora do caminho dos anexos.
update storage.buckets set allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp','application/zip']
where id = 'financeiro-anexos';

create table if not exists public.fin_fechamentos (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  mes                date not null check (extract(day from mes) = 1),
  situacao           text not null default 'fechado' check (situacao in ('fechado','reaberto')),
  resumo             jsonb not null default '{}',
  avisos             jsonb not null default '[]',
  observacao         text check (char_length(observacao) <= 2000),
  fechado_por        uuid references public.profiles (id) on delete set null,
  fechado_em         timestamptz not null default now(),
  reaberto_por       uuid references public.profiles (id) on delete set null,
  reaberto_em        timestamptz,
  motivo_reabertura  text check (char_length(motivo_reabertura) <= 1000)
);
create unique index if not exists fin_fechamentos_mes_idx on public.fin_fechamentos (workspace_id, mes) where situacao = 'fechado';
create index if not exists fin_fechamentos_workspace_idx on public.fin_fechamentos (workspace_id, mes desc);
create index if not exists fin_fechamentos_fechado_idx on public.fin_fechamentos (fechado_por);
create index if not exists fin_fechamentos_reaberto_idx on public.fin_fechamentos (reaberto_por);

alter table public.fin_fechamentos enable row level security;
revoke all on public.fin_fechamentos from anon, authenticated;
grant select on public.fin_fechamentos to authenticated;
create policy fin_fechamentos_select on public.fin_fechamentos for select to authenticated using ((select private.nivel_financeiro(workspace_id)) >= 1);

/** Total de horas voluntárias do período (sem nomes): o Financeiro não precisa saber quem. */
create or replace function public.financeiro_horas_voluntarias(p_workspace_id uuid, p_de date, p_ate date)
returns table (horas numeric, pessoas integer, registros integer)
language plpgsql security definer set search_path = '' stable as $$
begin
  if (select private.nivel_financeiro(p_workspace_id)) < 1 then raise exception 'Você não tem acesso ao Financeiro.' using errcode = 'P0001'; end if;
  return query
    select coalesce(sum(h.horas), 0)::numeric, count(distinct h.participante_id)::integer, count(*)::integer
    from public.participante_horas h
    where h.workspace_id = p_workspace_id and h.data between p_de and p_ate;
end $$;

create or replace function public.financeiro_salvar_valor_hora(p_workspace_id uuid, p_valor numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select private.nivel_financeiro(p_workspace_id)) < 4 then raise exception 'Só a gestão do Financeiro muda o valor da hora.' using errcode = 'P0001'; end if;
  if p_valor is not null and (p_valor < 0 or p_valor > 10000) then raise exception 'Valor da hora inválido.' using errcode = 'P0001'; end if;
  insert into public.fin_config (workspace_id, valor_hora_voluntario, atualizado_por, updated_at) values (p_workspace_id, p_valor, (select auth.uid()), now())
  on conflict (workspace_id) do update set valor_hora_voluntario = excluded.valor_hora_voluntario, atualizado_por = excluded.atualizado_por, updated_at = now();
  perform private.auditar_financeiro(p_workspace_id, null, 'valor_hora_voluntario', jsonb_build_object('valor', p_valor));
end $$;

/**
 * Fecha o mês. p_mes é o 1º dia. Em ordem (o seguinte ao último fechado) e
 * só mês que já acabou. Extrato por conciliar no mês impede.
 */
create or replace function public.financeiro_fechar_mes(p_workspace_id uuid, p_mes date, p_resumo jsonb, p_avisos jsonb, p_observacao text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_fim date := (p_mes + interval '1 month' - interval '1 day')::date;
  v_fechado date;
  v_pendentes integer;
begin
  if (select private.nivel_financeiro(p_workspace_id)) < 4 then raise exception 'Só a gestão do Financeiro fecha o mês.' using errcode = 'P0001'; end if;
  if p_mes is null or extract(day from p_mes) <> 1 then raise exception 'Mês inválido.' using errcode = 'P0001'; end if;
  if v_fim >= current_date then raise exception 'O mês ainda não acabou.' using errcode = 'P0001'; end if;
  select fechado_ate into v_fechado from public.fin_config where workspace_id = p_workspace_id for update;
  if v_fechado is not null and p_mes <> v_fechado + 1 then
    raise exception 'Os meses fecham em ordem: o próximo é %.', to_char(v_fechado + 1, 'MM/YYYY') using errcode = 'P0001';
  end if;
  select count(*) into v_pendentes from public.fin_extrato where workspace_id = p_workspace_id and situacao = 'pendente' and data between p_mes and v_fim;
  if v_pendentes > 0 then raise exception 'Ainda há % % do extrato para conciliar neste mês.', v_pendentes, case when v_pendentes = 1 then 'linha' else 'linhas' end using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(p_avisos, '[]'::jsonb)) <> 'array' then raise exception 'Avisos inválidos.' using errcode = 'P0001'; end if;
  if jsonb_array_length(coalesce(p_avisos, '[]'::jsonb)) > 0 and char_length(trim(coalesce(p_observacao, ''))) < 5 then
    raise exception 'Há avisos no mês: escreva uma observação explicando por que fecha assim.' using errcode = 'P0001';
  end if;
  insert into public.fin_config (workspace_id, fechado_ate, atualizado_por, updated_at) values (p_workspace_id, v_fim, (select auth.uid()), now())
  on conflict (workspace_id) do update set fechado_ate = excluded.fechado_ate, atualizado_por = excluded.atualizado_por, updated_at = now();
  insert into public.fin_fechamentos (workspace_id, mes, resumo, avisos, observacao, fechado_por)
  values (p_workspace_id, p_mes, coalesce(p_resumo, '{}'::jsonb), coalesce(p_avisos, '[]'::jsonb), nullif(left(trim(coalesce(p_observacao, '')), 2000), ''), (select auth.uid()));
  perform private.auditar_financeiro(p_workspace_id, null, 'fechar_mes', jsonb_build_object('mes', p_mes, 'avisos', jsonb_array_length(coalesce(p_avisos, '[]'::jsonb))));
end $$;

/** Reabre o último mês fechado (só ele), com motivo. */
create or replace function public.financeiro_reabrir_mes(p_workspace_id uuid, p_motivo text)
returns date language plpgsql security definer set search_path = '' as $$
declare
  v_fechado date;
  v_mes date;
  v_anterior date;
begin
  if (select private.nivel_financeiro(p_workspace_id)) < 4 then raise exception 'Só a gestão do Financeiro reabre o mês.' using errcode = 'P0001'; end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'Diga por que o mês precisa ser reaberto.' using errcode = 'P0001'; end if;
  select fechado_ate into v_fechado from public.fin_config where workspace_id = p_workspace_id for update;
  if v_fechado is null then raise exception 'Não há mês fechado.' using errcode = 'P0001'; end if;
  v_mes := date_trunc('month', v_fechado)::date;
  v_anterior := v_mes - 1;
  update public.fin_fechamentos set situacao = 'reaberto', reaberto_por = (select auth.uid()), reaberto_em = now(), motivo_reabertura = left(trim(p_motivo), 1000)
  where workspace_id = p_workspace_id and mes = v_mes and situacao = 'fechado';
  update public.fin_config set fechado_ate = case
      when exists (select 1 from public.fin_fechamentos f where f.workspace_id = p_workspace_id and f.mes = date_trunc('month', v_anterior)::date and f.situacao = 'fechado') then v_anterior
      else null end,
    atualizado_por = (select auth.uid()), updated_at = now()
  where workspace_id = p_workspace_id;
  perform private.auditar_financeiro(p_workspace_id, null, 'reabrir_mes', jsonb_build_object('mes', v_mes, 'motivo', trim(p_motivo)));
  return v_mes;
end $$;

/** O pacote do contador: registra quem baixou e de que mês. */
create or replace function public.financeiro_auditar_pacote(p_workspace_id uuid, p_mes date, p_arquivos integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select private.nivel_financeiro(p_workspace_id)) < 4 then raise exception 'Só a gestão do Financeiro baixa o pacote do mês.' using errcode = 'P0001'; end if;
  perform private.auditar_financeiro(p_workspace_id, null, 'pacote_do_mes', jsonb_build_object('mes', p_mes, 'arquivos', p_arquivos));
end $$;

revoke all on function public.financeiro_horas_voluntarias(uuid, date, date) from public, anon;
revoke all on function public.financeiro_salvar_valor_hora(uuid, numeric) from public, anon;
revoke all on function public.financeiro_fechar_mes(uuid, date, jsonb, jsonb, text) from public, anon;
revoke all on function public.financeiro_reabrir_mes(uuid, text) from public, anon;
revoke all on function public.financeiro_auditar_pacote(uuid, date, integer) from public, anon;
grant execute on function public.financeiro_horas_voluntarias(uuid, date, date) to authenticated;
grant execute on function public.financeiro_salvar_valor_hora(uuid, numeric) to authenticated;
grant execute on function public.financeiro_fechar_mes(uuid, date, jsonb, jsonb, text) to authenticated;
grant execute on function public.financeiro_reabrir_mes(uuid, text) to authenticated;
grant execute on function public.financeiro_auditar_pacote(uuid, date, integer) to authenticated;
