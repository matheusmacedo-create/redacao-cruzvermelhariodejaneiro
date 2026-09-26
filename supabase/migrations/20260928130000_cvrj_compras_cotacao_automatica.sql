-- Compras (4): pedir as propostas aos fornecedores habituais, sem digitar nada.
-- Só acréscimos. Decisões do Matheus (26/09/2026, docs/compras-cotacao-automatica.md):
--  - o fornecedor responde por um link só dele, sem login: preenche o preço de
--    cada item, o frete, o prazo e a validade, e pode anexar o PDF; a proposta
--    entra sozinha no mapa comparativo;
--  - "habituais" = quem está marcado como vendedor da categoria do pedido E
--    quem já mandou proposta em compras da mesma categoria;
--  - um botão ("Pedir propostas") com a lista já marcada; quem cota confere,
--    define o prazo e envia. Na véspera do prazo, quem não respondeu recebe um
--    lembrete; passado o prazo, quem pediu as propostas é avisado.
--
-- O prazo é um só para todos os fornecedores do pedido (a mesma especificação
-- e o mesmo prazo para todos, como pede o manual de compras da Cruz Vermelha).

-- ---------------------------------------------------------------- o que cada fornecedor vende

create table if not exists public.fin_favorecido_categorias (
  favorecido_id  uuid not null references public.fin_favorecidos (id) on delete cascade,
  categoria_id   uuid not null references public.fin_categorias (id) on delete cascade,
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  primary key (favorecido_id, categoria_id)
);
comment on table public.fin_favorecido_categorias is 'O que cada fornecedor vende (categorias de despesa): sugere quem convidar para cotar.';
create index if not exists fin_favorecido_categorias_cat_idx on public.fin_favorecido_categorias (categoria_id);
create index if not exists fin_favorecido_categorias_ws_idx on public.fin_favorecido_categorias (workspace_id);

alter table public.fin_favorecido_categorias enable row level security;
revoke all on public.fin_favorecido_categorias from anon;
revoke insert, update, delete, truncate, references, trigger on public.fin_favorecido_categorias from authenticated;
grant select on public.fin_favorecido_categorias to authenticated;
drop policy if exists fin_favorecido_categorias_select on public.fin_favorecido_categorias;
create policy fin_favorecido_categorias_select on public.fin_favorecido_categorias for select to authenticated
  using (exists (select 1 from public.fin_favorecidos f where f.id = favorecido_id and (select private.nivel_fin(f.workspace_id, f.entidade_id)) >= 1));

-- Troca a lista inteira do que o fornecedor vende (só categorias de despesa do espaço).
create or replace function public.compras_definir_ramos(p_favorecido_id uuid, p_categorias uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_fav public.fin_favorecidos;
begin
  select * into v_fav from public.fin_favorecidos where id = p_favorecido_id;
  if not found or (select private.nivel_fin(v_fav.workspace_id, v_fav.entidade_id)) < 2 then
    raise exception 'Fornecedor não encontrado.' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_categorias, 1), 0) > 50 then raise exception 'Marque no máximo 50 categorias.' using errcode = 'P0001'; end if;
  delete from public.fin_favorecido_categorias where favorecido_id = p_favorecido_id and not (categoria_id = any (coalesce(p_categorias, '{}')));
  insert into public.fin_favorecido_categorias (favorecido_id, categoria_id, workspace_id)
  select p_favorecido_id, c.id, v_fav.workspace_id from public.fin_categorias c
  where c.id = any (coalesce(p_categorias, '{}')) and c.workspace_id = v_fav.workspace_id and c.tipo = 'despesa'
  on conflict do nothing;
end $$;
revoke all on function public.compras_definir_ramos(uuid, uuid[]) from public, anon;
grant execute on function public.compras_definir_ramos(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------- prazo da cotação

alter table public.compras_pedidos add column if not exists cotacao_prazo date;
-- Quando quem pediu as propostas foi avisado de que o prazo acabou (a rotina diária avisa uma vez).
alter table public.compras_pedidos add column if not exists cotacao_prazo_avisado_em timestamptz;

-- ---------------------------------------------------------------- convites

create table if not exists public.compras_convites (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  pedido_id      uuid not null references public.compras_pedidos (id) on delete cascade,
  favorecido_id  uuid not null references public.fin_favorecidos (id) on delete restrict,
  email          text not null check (char_length(email) <= 200 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  -- O link do fornecedor (/cotacao/<token>). Nunca sai para a tela: só no e-mail e no "Copiar link".
  token          text not null unique check (token ~ '^[A-Za-z0-9_-]{32}$'),
  caixa_id       uuid references public.caixas_de_email (id) on delete set null,
  enviado_em     timestamptz,
  enviado_por    uuid references public.profiles (id) on delete set null,
  envio_erro     text check (char_length(envio_erro) <= 500),
  lembrete_em    timestamptz,
  visto_em       timestamptz,
  respondido_em  timestamptz,
  recusado_em    timestamptz,
  motivo_recusa  text check (char_length(motivo_recusa) <= 500),
  cancelado_em   timestamptz,
  proposta_id    uuid references public.compras_propostas (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (pedido_id, favorecido_id)
);
comment on table public.compras_convites is 'Pedido de proposta a um fornecedor: o link sem login por onde ele responde (docs/compras-cotacao-automatica.md).';
create index if not exists compras_convites_ws_idx on public.compras_convites (workspace_id);
create index if not exists compras_convites_fav_idx on public.compras_convites (favorecido_id);
create index if not exists compras_convites_proposta_idx on public.compras_convites (proposta_id);
create index if not exists compras_convites_caixa_idx on public.compras_convites (caixa_id);
create index if not exists compras_convites_por_idx on public.compras_convites (enviado_por);
-- A rotina diária procura os convites em aberto.
create index if not exists compras_convites_abertos_idx on public.compras_convites (pedido_id)
  where respondido_em is null and recusado_em is null and cancelado_em is null;

alter table public.compras_convites enable row level security;
revoke all on public.compras_convites from anon;
revoke all on public.compras_convites from authenticated;
-- Todas as colunas menos o token: quem lê o pedido vê a situação dos convites, não o link.
grant select (id, workspace_id, pedido_id, favorecido_id, email, caixa_id, enviado_em, enviado_por, envio_erro, lembrete_em, visto_em,
  respondido_em, recusado_em, motivo_recusa, cancelado_em, proposta_id, created_at) on public.compras_convites to authenticated;
drop policy if exists compras_convites_select on public.compras_convites;
create policy compras_convites_select on public.compras_convites for select to authenticated
  using (exists (select 1 from public.compras_pedidos p where p.id = pedido_id and (select private.nivel_fin(p.workspace_id, p.entidade_id)) >= 1));

-- Hoje em Brasília (o prazo é uma data local).
create or replace function private.compras_hoje()
returns date language sql stable set search_path = '' as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;
revoke all on function private.compras_hoje() from public, anon;
grant execute on function private.compras_hoje() to authenticated, service_role;

-- Cria (ou renova) os convites do pedido e define o prazo. Os tokens vêm do
-- servidor (aleatórios, 24 bytes); um convite que já existe mantém o dele.
-- Devolve os convites a enviar: id, favorecido, nome, e-mail e token.
create or replace function public.compras_convidar(p_pedido_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ped public.compras_pedidos;
  v_prazo date := nullif(p->>'prazo', '')::date;
  v_caixa uuid := nullif(p->>'caixa_id', '')::uuid;
  v_hoje date := (select private.compras_hoje());
  c jsonb;
  v_fav public.fin_favorecidos;
  v_email text;
  v_saida jsonb := '[]';
  v_linha public.compras_convites;
begin
  select * into v_ped from public.compras_pedidos where id = p_pedido_id for update;
  if not found or (select private.nivel_fin(v_ped.workspace_id, v_ped.entidade_id)) < 2 then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if v_ped.estado not in ('aberto', 'em_cotacao') then raise exception 'A cotação deste pedido já foi encerrada.' using errcode = 'P0001'; end if;
  if v_prazo is null or v_prazo < v_hoje then raise exception 'Escolha um prazo de hoje em diante.' using errcode = 'P0001'; end if;
  if v_prazo > v_hoje + 60 then raise exception 'O prazo pode ser de até 60 dias.' using errcode = 'P0001'; end if;
  if v_caixa is not null and not exists (select 1 from public.caixas_de_email x where x.id = v_caixa and x.workspace_id = v_ped.workspace_id) then
    raise exception 'Caixa de e-mail inválida.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p->'convites', '[]')) = 0 then raise exception 'Marque ao menos um fornecedor.' using errcode = 'P0001'; end if;
  if jsonb_array_length(coalesce(p->'convites', '[]')) > 20 then raise exception 'No máximo 20 fornecedores por vez.' using errcode = 'P0001'; end if;

  for c in select value from jsonb_array_elements(p->'convites') loop
    select * into v_fav from public.fin_favorecidos f
      where f.id = nullif(c->>'favorecido_id', '')::uuid and f.workspace_id = v_ped.workspace_id and f.entidade_id = v_ped.entidade_id;
    if not found then raise exception 'Algum fornecedor não é desta empresa.' using errcode = 'P0001'; end if;
    v_email := lower(trim(coalesce(c->>'email', '')));
    if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(v_email) > 200 then
      raise exception 'E-mail inválido para %.', v_fav.nome using errcode = 'P0001';
    end if;
    if coalesce(c->>'token', '') !~ '^[A-Za-z0-9_-]{32}$' then raise exception 'Convite inválido.' using errcode = 'P0001'; end if;

    insert into public.compras_convites (workspace_id, pedido_id, favorecido_id, email, token, caixa_id)
    values (v_ped.workspace_id, p_pedido_id, v_fav.id, v_email, c->>'token', v_caixa)
    on conflict (pedido_id, favorecido_id) do update set
      email = excluded.email, caixa_id = excluded.caixa_id, cancelado_em = null, envio_erro = null, lembrete_em = null,
      -- Quem tinha recusado pode mudar de ideia com o novo convite.
      recusado_em = null, motivo_recusa = null
    returning * into v_linha;
    -- O e-mail do cadastro fica atualizado para a próxima vez.
    if v_fav.email is distinct from v_email then update public.fin_favorecidos set email = v_email where id = v_fav.id; end if;
    v_saida := v_saida || jsonb_build_object('id', v_linha.id, 'favorecido_id', v_fav.id, 'nome', v_fav.nome, 'email', v_linha.email, 'token', v_linha.token);
  end loop;

  update public.compras_pedidos set cotacao_prazo = v_prazo, cotacao_prazo_avisado_em = null,
    estado = case when estado = 'aberto' then 'em_cotacao' else estado end, updated_at = now()
  where id = p_pedido_id;
  perform private.compras_registrar(v_ped, 'propostas_pedidas', jsonb_build_object('quantos', jsonb_array_length(v_saida), 'prazo', v_prazo));
  return v_saida;
end $$;

-- Tira um convite (o link para de abrir). A proposta que já chegou fica.
create or replace function public.compras_cancelar_convite(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_con public.compras_convites;
  v_ped public.compras_pedidos;
begin
  select * into v_con from public.compras_convites where id = p_id;
  if not found then raise exception 'Convite não encontrado.' using errcode = 'P0001'; end if;
  select * into v_ped from public.compras_pedidos where id = v_con.pedido_id;
  if (select private.nivel_fin(v_ped.workspace_id, v_ped.entidade_id)) < 2 then raise exception 'Convite não encontrado.' using errcode = 'P0001'; end if;
  update public.compras_convites set cancelado_em = now() where id = p_id;
  perform private.compras_registrar(v_ped, 'convite_cancelado', jsonb_build_object('fornecedor', (select f.nome from public.fin_favorecidos f where f.id = v_con.favorecido_id)));
end $$;

revoke all on function public.compras_convidar(uuid, jsonb), public.compras_cancelar_convite(uuid) from public, anon;
grant execute on function public.compras_convidar(uuid, jsonb), public.compras_cancelar_convite(uuid) to authenticated;

-- ---------------------------------------------------------------- o lado do fornecedor (só o servidor chama)

-- A proposta que o fornecedor mandou pelo link. Vale até o fim do dia do prazo
-- e enquanto a cotação estiver aberta; mandar de novo substitui a anterior.
-- p: { validade, prazo_entrega, condicao_pagamento, frete, observacao, precos: [{item_id, valor_unitario}],
--      arquivo?: {caminho, nome, mime, tamanho} }
-- Devolve { proposta_id, arquivo_antigo, todos_responderam }.
create or replace function public.compras_proposta_do_fornecedor(p_token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_con public.compras_convites;
  v_ped public.compras_pedidos;
  v_id uuid;
  v_antigo text;
  v_frete numeric := coalesce(nullif(p->>'frete', '')::numeric, 0);
  v_validade date := nullif(p->>'validade', '')::date;
  pr jsonb;
  v_caminho text := nullif(p->'arquivo'->>'caminho', '');
  v_abertos integer;
begin
  select * into v_con from public.compras_convites where token = p_token for update;
  if not found or v_con.cancelado_em is not null then raise exception 'Este link não está mais valendo.' using errcode = 'P0001'; end if;
  select * into v_ped from public.compras_pedidos where id = v_con.pedido_id for update;
  if v_ped.estado not in ('aberto', 'em_cotacao') then raise exception 'Esta cotação já foi encerrada. Obrigado!' using errcode = 'P0001'; end if;
  if v_ped.cotacao_prazo is not null and (select private.compras_hoje()) > v_ped.cotacao_prazo then
    raise exception 'O prazo para mandar a proposta acabou.' using errcode = 'P0001';
  end if;
  if v_frete < 0 then raise exception 'Frete inválido.' using errcode = 'P0001'; end if;
  if v_validade is not null and v_validade < (select private.compras_hoje()) then raise exception 'A validade da proposta já passou.' using errcode = 'P0001'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(p->'precos', '[]')) x where nullif(x->>'valor_unitario', '') is not null) then
    raise exception 'Informe o preço de ao menos um item.' using errcode = 'P0001';
  end if;

  select id, arquivo_caminho into v_id, v_antigo from public.compras_propostas where pedido_id = v_ped.id and favorecido_id = v_con.favorecido_id;
  if v_id is null then
    insert into public.compras_propostas (workspace_id, pedido_id, favorecido_id, recebida_em, validade, prazo_entrega, condicao_pagamento, frete, observacao, criado_por)
    values (v_ped.workspace_id, v_ped.id, v_con.favorecido_id, (select private.compras_hoje()), v_validade,
      nullif(left(trim(coalesce(p->>'prazo_entrega', '')), 120), ''), nullif(left(trim(coalesce(p->>'condicao_pagamento', '')), 120), ''), v_frete,
      nullif(left(trim(coalesce(p->>'observacao', '')), 1000), ''), null)
    returning id into v_id;
  else
    update public.compras_propostas set recebida_em = (select private.compras_hoje()), validade = v_validade,
      prazo_entrega = nullif(left(trim(coalesce(p->>'prazo_entrega', '')), 120), ''),
      condicao_pagamento = nullif(left(trim(coalesce(p->>'condicao_pagamento', '')), 120), ''), frete = v_frete,
      observacao = nullif(left(trim(coalesce(p->>'observacao', '')), 1000), '')
    where id = v_id;
  end if;

  for pr in select value from jsonb_array_elements(coalesce(p->'precos', '[]')) loop
    if nullif(pr->>'valor_unitario', '') is not null and (pr->>'valor_unitario')::numeric < 0 then raise exception 'Preço inválido.' using errcode = 'P0001'; end if;
    insert into public.compras_proposta_itens (proposta_id, item_id, workspace_id, valor_unitario)
    select v_id, i.id, v_ped.workspace_id, nullif(pr->>'valor_unitario', '')::numeric
    from public.compras_itens i where i.id = nullif(pr->>'item_id', '')::uuid and i.pedido_id = v_ped.id
    on conflict (proposta_id, item_id) do update set valor_unitario = excluded.valor_unitario;
  end loop;

  if v_caminho is not null then
    if v_caminho !~ ('^' || v_ped.workspace_id::text || '/' || v_ped.id::text || '/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$') then
      raise exception 'Arquivo inválido.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'compras-arquivos' and o.name = v_caminho) then
      raise exception 'O arquivo não chegou. Envie de novo.' using errcode = 'P0001';
    end if;
    update public.compras_propostas set arquivo_caminho = v_caminho,
      arquivo_nome = left(coalesce(nullif(trim(p->'arquivo'->>'nome'), ''), 'proposta'), 200),
      arquivo_mime = left(coalesce(p->'arquivo'->>'mime', 'application/pdf'), 100),
      arquivo_tamanho = greatest(coalesce((p->'arquivo'->>'tamanho')::integer, 1), 1)
    where id = v_id;
  else
    v_antigo := null;
  end if;

  update public.compras_convites set respondido_em = now(), recusado_em = null, motivo_recusa = null, proposta_id = v_id, visto_em = coalesce(visto_em, now())
  where id = v_con.id;
  if v_ped.estado = 'aberto' then update public.compras_pedidos set estado = 'em_cotacao', updated_at = now() where id = v_ped.id; end if;
  perform private.compras_registrar(v_ped, 'proposta_do_fornecedor',
    jsonb_build_object('proposta', v_id, 'fornecedor', (select f.nome from public.fin_favorecidos f where f.id = v_con.favorecido_id), 'total', (select t.total from private.compras_totais(v_ped.id) t where t.proposta_id = v_id)));

  select count(*) into v_abertos from public.compras_convites c
  where c.pedido_id = v_ped.id and c.respondido_em is null and c.recusado_em is null and c.cancelado_em is null;
  return jsonb_build_object('proposta_id', v_id, 'arquivo_antigo', v_antigo, 'todos_responderam', v_abertos = 0);
end $$;

-- O fornecedor avisa que não vai cotar desta vez.
create or replace function public.compras_recusa_do_fornecedor(p_token text, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_con public.compras_convites;
  v_ped public.compras_pedidos;
  v_abertos integer;
begin
  select * into v_con from public.compras_convites where token = p_token for update;
  if not found or v_con.cancelado_em is not null then raise exception 'Este link não está mais valendo.' using errcode = 'P0001'; end if;
  select * into v_ped from public.compras_pedidos where id = v_con.pedido_id;
  if v_ped.estado not in ('aberto', 'em_cotacao') then raise exception 'Esta cotação já foi encerrada. Obrigado!' using errcode = 'P0001'; end if;
  if v_con.respondido_em is not null then raise exception 'Sua proposta já chegou. Para desistir, fale com o Financeiro.' using errcode = 'P0001'; end if;
  update public.compras_convites set recusado_em = now(), motivo_recusa = nullif(left(trim(coalesce(p_motivo, '')), 500), ''), visto_em = coalesce(visto_em, now())
  where id = v_con.id;
  perform private.compras_registrar(v_ped, 'convite_recusado',
    jsonb_build_object('fornecedor', (select f.nome from public.fin_favorecidos f where f.id = v_con.favorecido_id), 'motivo', nullif(left(trim(coalesce(p_motivo, '')), 500), '')));
  select count(*) into v_abertos from public.compras_convites c
  where c.pedido_id = v_ped.id and c.respondido_em is null and c.recusado_em is null and c.cancelado_em is null;
  return jsonb_build_object('todos_responderam', v_abertos = 0);
end $$;

revoke all on function public.compras_proposta_do_fornecedor(text, jsonb), public.compras_recusa_do_fornecedor(text, text) from public, anon, authenticated;
grant execute on function public.compras_proposta_do_fornecedor(text, jsonb), public.compras_recusa_do_fornecedor(text, text) to service_role;
