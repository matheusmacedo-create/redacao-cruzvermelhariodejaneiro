-- Escola (1): a parte administrativa da Escola de Educação e Saúde dentro da
-- Redação — as contas da Únicopag por onde a escola recebe (matrícula e
-- curso, PIX e cartão) e o dinheiro que passa por elas. Aluno, turma e
-- ficha continuam no sistema da escola; aqui entra só o que é de gestão.
--
-- A chave de API de cada conta vive no Vault (integracoes_chaves, serviço
-- 'unicopag:<id da conta>'), gravada só por admin. As transações são uma
-- cópia lida da Únicopag (sincronização diária e pelo botão): a fonte da
-- verdade continua sendo ela, e a cópia existe para somar por mês, por
-- curso e por forma de pagamento sem esperar a API a cada tela.
--
-- Dado do aluno: da transação guardamos o nome do pagador e o CPF
-- mascarado (***.456.789-**) — o bastante para conferir um pagamento, sem
-- duplicar aqui a ficha que mora no sistema da escola.

-- ---------------------------------------------------------------- tabelas

create table if not exists public.escola_contas (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  nome                text not null check (char_length(nome) between 2 and 80),
  descricao           text check (char_length(descricao) <= 300),
  -- Onde fica o sistema da escola que usa esta conta (secretaria, alunos, turmas).
  sistema_url         text check (sistema_url ~ '^https://[^\s]+$' and char_length(sistema_url) <= 300),
  ativa               boolean not null default true,
  -- Os 4 últimos caracteres da chave, para reconhecer qual está guardada (nunca a chave).
  chave_final         text check (char_length(chave_final) <= 8),
  chave_em            timestamptz,
  sincronizada_em     timestamptz,
  sincronizacao_erro  text check (char_length(sincronizacao_erro) <= 500),
  -- Saldo lido da Únicopag, em centavos.
  saldo_disponivel    bigint,
  saldo_a_liberar     bigint,
  saldo_lido_em       timestamptz,
  criado_por          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists escola_contas_nome_idx on public.escola_contas (workspace_id, lower(nome));

create table if not exists public.escola_transacoes (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  conta_id        uuid not null references public.escola_contas (id) on delete cascade,
  hash            text not null check (char_length(hash) between 1 and 100),
  metodo          text not null check (metodo in ('pix', 'cartao', 'boleto', 'outro')),
  -- O status como a Únicopag escreve (paid, waiting_payment, refunded...).
  status          text not null check (char_length(status) <= 40),
  situacao        text not null check (situacao in ('pago', 'pendente', 'recusado', 'cancelado', 'estornado', 'em_disputa', 'contestado')),
  valor           bigint not null check (valor >= 0),
  parcelas        smallint check (parcelas between 1 and 24),
  cliente         text check (char_length(cliente) <= 200),
  documento       text check (char_length(documento) <= 20),
  produto         text check (char_length(produto) <= 300),
  origem          text check (char_length(origem) <= 100),
  criada_em       timestamptz not null,
  paga_em         timestamptz,
  atualizada_em   timestamptz,
  sincronizada_em timestamptz not null default now(),
  unique (conta_id, hash)
);
create index if not exists escola_transacoes_ws_criada_idx on public.escola_transacoes (workspace_id, criada_em desc);
create index if not exists escola_transacoes_ws_paga_idx on public.escola_transacoes (workspace_id, paga_em) where paga_em is not null;

-- ---------------------------------------------------------------- acesso

-- Quem vê a Escola: admin (3, configura as contas), quem tem acesso ao
-- Financeiro e quem é do setor Educação e Saúde (2, vê e atualiza).
create or replace function private.nivel_escola(p_workspace_id uuid)
returns integer language sql security definer set search_path = '' stable as $$
  select case
    when not (select private.is_workspace_member(p_workspace_id)) then 0
    when (select private.workspace_role(p_workspace_id)) = 'admin' then 3
    when (select private.nivel_financeiro(p_workspace_id)) >= 1 then 2
    when exists (
      select 1 from public.workspace_members m
      where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid()) and private.chave_do_nome(m.coordination) = 'educacao e saude'
    ) or exists (
      select 1 from public.setor_membros sm join public.setores s on s.id = sm.setor_id
      where sm.workspace_id = p_workspace_id and sm.user_id = (select auth.uid()) and private.chave_do_nome(s.nome) = 'educacao e saude'
    ) then 2
    else 0
  end
$$;
revoke all on function private.nivel_escola(uuid) from public, anon;
grant execute on function private.nivel_escola(uuid) to authenticated;

alter table public.escola_contas enable row level security;
alter table public.escola_transacoes enable row level security;
create policy escola_contas_select on public.escola_contas for select to authenticated using ((select private.nivel_escola(workspace_id)) >= 2);
create policy escola_transacoes_select on public.escola_transacoes for select to authenticated using ((select private.nivel_escola(workspace_id)) >= 2);
-- Sem insert/update/delete para authenticated: as contas mudam pelas funções
-- abaixo (só admin) e as transações só pela sincronização (service_role).

-- ---------------------------------------------------------------- escrita (admin)

create or replace function public.escola_salvar_conta(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_nome text;
  v_url text;
begin
  v_id := nullif(p->>'id', '')::uuid;
  v_nome := regexp_replace(trim(coalesce(p->>'nome', '')), '\s+', ' ', 'g');
  v_url := nullif(trim(coalesce(p->>'sistema_url', '')), '');
  if (select private.workspace_role(p_workspace_id)) is distinct from 'admin' then raise exception 'Só um admin cadastra as contas da escola.' using errcode = 'P0001'; end if;
  if char_length(v_nome) < 2 then raise exception 'Dê um nome à conta (ex.: Punção Venosa).' using errcode = 'P0001'; end if;
  if v_url is not null and v_url !~ '^https://[^\s]+$' then raise exception 'O endereço do sistema precisa começar com https://.' using errcode = 'P0001'; end if;
  if v_id is null then
    insert into public.escola_contas (workspace_id, nome, descricao, sistema_url, criado_por)
    values (p_workspace_id, v_nome, nullif(trim(p->>'descricao'), ''), v_url, (select auth.uid()))
    returning id into v_id;
  else
    update public.escola_contas set nome = v_nome, descricao = nullif(trim(p->>'descricao'), ''), sistema_url = v_url,
      ativa = coalesce((p->>'ativa')::boolean, ativa), updated_at = now()
    where id = v_id and workspace_id = p_workspace_id;
    if not found then raise exception 'Conta não encontrada.' using errcode = 'P0001'; end if;
  end if;
  return v_id;
exception
  when unique_violation then raise exception 'Já existe uma conta com este nome.' using errcode = 'P0001';
  when check_violation then raise exception 'Algum campo está fora do permitido (nome até 80, descrição até 300 caracteres).' using errcode = 'P0001';
  when invalid_text_representation then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
end $$;
revoke all on function public.escola_salvar_conta(uuid, jsonb) from public, anon;
grant execute on function public.escola_salvar_conta(uuid, jsonb) to authenticated;

-- Tira a conta (e a cópia das transações dela) e apaga a chave do cofre.
-- Na Únicopag nada muda: é só a Redação que deixa de ler.
create or replace function public.escola_excluir_conta(p_workspace_id uuid, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_segredo uuid;
begin
  if (select private.workspace_role(p_workspace_id)) is distinct from 'admin' then raise exception 'Só um admin tira uma conta da escola.' using errcode = 'P0001'; end if;
  delete from public.escola_contas where id = p_id and workspace_id = p_workspace_id;
  if not found then raise exception 'Conta não encontrada.' using errcode = 'P0001'; end if;
  delete from public.integracoes_chaves where workspace_id = p_workspace_id and servico = 'unicopag:' || p_id::text
  returning vault_secret_id into v_segredo;
  if v_segredo is not null then delete from vault.secrets where id = v_segredo; end if;
end $$;
revoke all on function public.escola_excluir_conta(uuid, uuid) from public, anon;
grant execute on function public.escola_excluir_conta(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- sincronização (servidor)

-- Grava o que a sincronização leu: as transações (novas ou com status
-- mudado) e o saldo. Só a service_role chama — o servidor confere antes
-- quem pediu (ou é o cron, com CRON_SECRET).
create or replace function public.escola_gravar_sincronizacao(p_conta_id uuid, p_transacoes jsonb, p_saldo jsonb, p_erro text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid;
  v_n integer := 0;
begin
  select workspace_id into v_ws from public.escola_contas where id = p_conta_id for update;
  if v_ws is null then raise exception 'Conta não encontrada.' using errcode = 'P0001'; end if;

  if p_transacoes is not null and jsonb_typeof(p_transacoes) = 'array' then
    insert into public.escola_transacoes as t (workspace_id, conta_id, hash, metodo, status, situacao, valor, parcelas, cliente, documento, produto, origem, criada_em, paga_em, atualizada_em, sincronizada_em)
    select v_ws, p_conta_id, x.hash, x.metodo, x.status, x.situacao, x.valor, x.parcelas, left(x.cliente, 200), left(x.documento, 20), left(x.produto, 300), left(x.origem, 100),
      x.criada_em, x.paga_em, x.atualizada_em, now()
    from jsonb_to_recordset(p_transacoes) as x (hash text, metodo text, status text, situacao text, valor bigint, parcelas smallint, cliente text, documento text, produto text, origem text,
      criada_em timestamptz, paga_em timestamptz, atualizada_em timestamptz)
    on conflict (conta_id, hash) do update set
      metodo = excluded.metodo, status = excluded.status, situacao = excluded.situacao, valor = excluded.valor, parcelas = excluded.parcelas,
      cliente = excluded.cliente, documento = excluded.documento, produto = excluded.produto, origem = excluded.origem,
      paga_em = excluded.paga_em, atualizada_em = excluded.atualizada_em, sincronizada_em = now()
    where (t.status, t.valor, t.paga_em, t.produto, t.cliente) is distinct from (excluded.status, excluded.valor, excluded.paga_em, excluded.produto, excluded.cliente);
    get diagnostics v_n = row_count;
  end if;

  update public.escola_contas set
    sincronizada_em = case when p_erro is null then now() else sincronizada_em end,
    sincronizacao_erro = left(p_erro, 500),
    saldo_disponivel = coalesce((p_saldo->>'disponivel')::bigint, saldo_disponivel),
    saldo_a_liberar = coalesce((p_saldo->>'a_liberar')::bigint, saldo_a_liberar),
    saldo_lido_em = case when p_saldo ? 'disponivel' then now() else saldo_lido_em end
  where id = p_conta_id;
  return v_n;
end $$;
revoke all on function public.escola_gravar_sincronizacao(uuid, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.escola_gravar_sincronizacao(uuid, jsonb, jsonb, text) to service_role;

-- A chave foi guardada (ou tirada) no cofre: marca os 4 últimos caracteres na conta. Só service_role.
create or replace function public.escola_marcar_chave(p_conta_id uuid, p_final text)
returns void language sql security definer set search_path = '' as $$
  update public.escola_contas set chave_final = nullif(left(p_final, 8), ''), chave_em = case when nullif(p_final, '') is null then null else now() end,
    sincronizacao_erro = null, updated_at = now()
  where id = p_conta_id
$$;
revoke all on function public.escola_marcar_chave(uuid, text) from public, anon, authenticated;
grant execute on function public.escola_marcar_chave(uuid, text) to service_role;
