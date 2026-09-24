-- Escola (2): o marketing da escola — tudo o que já foi feito e criado para
-- vender os cursos, empilhado com o tempo, com o resultado de cada coisa.
--
-- Espelha três ferramentas de mercado:
--  * HubSpot (Campanhas): a campanha junta as peças (página de venda,
--    anúncio, post, e-mail, WhatsApp) com datas, orçamento e UTM, e o
--    relatório soma o que elas trouxeram;
--  * Motion (biblioteca de criativos): cada peça com imagem, ângulo,
--    formato, números (investimento, impressões, cliques, leads,
--    matrículas) e a marca de "vencedora";
--  * Foreplay / Biblioteca de Anúncios do Meta (swipe file): referências de
--    concorrentes e inspirações, guardadas junto, mas separadas das nossas.
--
-- A receita de cada campanha vem sozinha da Únicopag: a transação traz o
-- utm_campaign da venda (coluna nova em escola_transacoes) e a campanha
-- guarda o seu. Quem vê o marketing vê só a soma por campanha, nunca a
-- transação (que tem nome de pagador).

-- ---------------------------------------------------------------- utm_campaign na transação

alter table public.escola_transacoes add column if not exists campanha text check (char_length(campanha) <= 100);
create index if not exists escola_transacoes_campanha_idx on public.escola_transacoes (workspace_id, campanha) where campanha is not null;

create or replace function public.escola_gravar_sincronizacao(p_conta_id uuid, p_transacoes jsonb, p_saldo jsonb, p_erro text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid;
  v_n integer := 0;
begin
  select workspace_id into v_ws from public.escola_contas where id = p_conta_id for update;
  if v_ws is null then raise exception 'Conta não encontrada.' using errcode = 'P0001'; end if;

  if p_transacoes is not null and jsonb_typeof(p_transacoes) = 'array' then
    insert into public.escola_transacoes as t (workspace_id, conta_id, hash, metodo, status, situacao, valor, parcelas, cliente, documento, produto, origem, campanha, criada_em, paga_em, atualizada_em, sincronizada_em)
    select v_ws, p_conta_id, x.hash, x.metodo, x.status, x.situacao, x.valor, x.parcelas, left(x.cliente, 200), left(x.documento, 20), left(x.produto, 300), left(x.origem, 100), left(lower(x.campanha), 100),
      x.criada_em, x.paga_em, x.atualizada_em, now()
    from jsonb_to_recordset(p_transacoes) as x (hash text, metodo text, status text, situacao text, valor bigint, parcelas smallint, cliente text, documento text, produto text, origem text, campanha text,
      criada_em timestamptz, paga_em timestamptz, atualizada_em timestamptz)
    on conflict (conta_id, hash) do update set
      metodo = excluded.metodo, status = excluded.status, situacao = excluded.situacao, valor = excluded.valor, parcelas = excluded.parcelas,
      cliente = excluded.cliente, documento = excluded.documento, produto = excluded.produto, origem = excluded.origem, campanha = excluded.campanha,
      paga_em = excluded.paga_em, atualizada_em = excluded.atualizada_em, sincronizada_em = now()
    where (t.status, t.valor, t.paga_em, t.produto, t.cliente, t.campanha) is distinct from (excluded.status, excluded.valor, excluded.paga_em, excluded.produto, excluded.cliente, excluded.campanha);
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

-- ---------------------------------------------------------------- imagens

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('escola-marketing', 'escola-marketing', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------- tabelas

create table if not exists public.escola_campanhas (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  nome          text not null check (char_length(nome) between 2 and 120),
  conta_id      uuid references public.escola_contas (id) on delete set null,
  curso         text check (char_length(curso) <= 120),
  objetivo      text not null default 'matriculas' check (objetivo in ('matriculas', 'leads', 'marca', 'reativacao', 'evento', 'outro')),
  status        text not null default 'planejada' check (status in ('planejada', 'no_ar', 'encerrada')),
  inicio        date,
  fim           date check (fim is null or inicio is null or fim >= inicio),
  orcamento     numeric(12,2) check (orcamento >= 0),
  -- O utm_campaign dos links desta campanha: é por ele que a venda da Únicopag chega aqui.
  utm_campaign  text check (utm_campaign ~ '^[a-z0-9][a-z0-9._-]{1,99}$'),
  resumo        text check (char_length(resumo) <= 1000),
  aprendizados  text check (char_length(aprendizados) <= 4000),
  criado_por    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists escola_campanhas_nome_idx on public.escola_campanhas (workspace_id, lower(nome));
create unique index if not exists escola_campanhas_utm_idx on public.escola_campanhas (workspace_id, utm_campaign) where utm_campaign is not null;
create index if not exists escola_campanhas_conta_idx on public.escola_campanhas (conta_id);

create table if not exists public.escola_pecas (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  campanha_id    uuid references public.escola_campanhas (id) on delete set null,
  -- Referência (de concorrente ou inspiração), não uma peça nossa.
  referencia     boolean not null default false,
  fonte          text check (char_length(fonte) <= 120),
  tipo           text not null check (tipo in ('pagina', 'anuncio', 'post', 'video', 'email', 'whatsapp', 'impresso', 'outro')),
  canal          text not null check (canal in ('meta_ads', 'google_ads', 'tiktok_ads', 'instagram', 'facebook', 'tiktok', 'youtube', 'whatsapp', 'email', 'site', 'impresso', 'outro')),
  titulo         text not null check (char_length(titulo) between 2 and 160),
  url            text check (url ~ '^https?://[^\s]+$' and char_length(url) <= 500),
  texto          text check (char_length(texto) <= 5000),
  angulo         text check (char_length(angulo) <= 60),
  formato        text check (char_length(formato) <= 60),
  status         text not null default 'rascunho' check (status in ('rascunho', 'no_ar', 'pausada', 'encerrada')),
  publicada_em   date,
  encerrada_em   date check (encerrada_em is null or publicada_em is null or encerrada_em >= publicada_em),
  imagem_path    text check (char_length(imagem_path) <= 300),
  investimento   numeric(12,2) check (investimento >= 0),
  impressoes     bigint check (impressoes >= 0),
  cliques        bigint check (cliques >= 0),
  leads          integer check (leads >= 0),
  matriculas     integer check (matriculas >= 0),
  resultado_em   date,
  vencedora      boolean not null default false,
  nota           text check (char_length(nota) <= 2000),
  criado_por     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (not referencia or (investimento is null and leads is null and matriculas is null))
);
create index if not exists escola_pecas_ws_idx on public.escola_pecas (workspace_id, publicada_em desc nulls last);
create index if not exists escola_pecas_campanha_idx on public.escola_pecas (campanha_id);

-- ---------------------------------------------------------------- acesso

-- Quem trabalha o marketing da escola: quem vê a Escola (nível 2+), os
-- editores e admins da Redação e quem é da Comunicação Social.
create or replace function private.nivel_marketing_escola(p_workspace_id uuid)
returns integer language sql security definer set search_path = '' stable as $$
  select case
    when not (select private.is_workspace_member(p_workspace_id)) then 0
    when (select private.workspace_role(p_workspace_id)) = 'admin' then 3
    when (select private.nivel_escola(p_workspace_id)) >= 2 then 2
    when (select private.workspace_role(p_workspace_id)) = 'editor' then 2
    when exists (
      select 1 from public.workspace_members m
      where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid()) and private.chave_do_nome(m.coordination) = 'comunicacao social'
    ) or exists (
      select 1 from public.setor_membros sm join public.setores s on s.id = sm.setor_id
      where sm.workspace_id = p_workspace_id and sm.user_id = (select auth.uid()) and private.chave_do_nome(s.nome) = 'comunicacao social'
    ) then 2
    else 0
  end
$$;
revoke all on function private.nivel_marketing_escola(uuid) from public, anon;
grant execute on function private.nivel_marketing_escola(uuid) to authenticated;

alter table public.escola_campanhas enable row level security;
alter table public.escola_pecas enable row level security;
create policy escola_campanhas_select on public.escola_campanhas for select to authenticated using ((select private.nivel_marketing_escola(workspace_id)) >= 2);
create policy escola_pecas_select on public.escola_pecas for select to authenticated using ((select private.nivel_marketing_escola(workspace_id)) >= 2);

-- Imagens: sem política no Storage — o servidor confere o nível e entrega
-- links assinados (1 h); o envio também é por link assinado emitido lá.

-- ---------------------------------------------------------------- escrita

create or replace function public.escola_mkt_salvar_campanha(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_conta uuid;
  v_nome text;
  v_utm text;
  v_status text;
  v_orc numeric;
  v_inicio date;
  v_fim date;
begin
  v_id := nullif(p->>'id', '')::uuid;
  v_conta := nullif(p->>'conta_id', '')::uuid;
  v_nome := regexp_replace(trim(coalesce(p->>'nome', '')), '\s+', ' ', 'g');
  v_utm := nullif(lower(trim(coalesce(p->>'utm_campaign', ''))), '');
  v_status := coalesce(nullif(p->>'status', ''), 'planejada');
  v_orc := nullif(replace(p->>'orcamento', ',', '.'), '')::numeric;
  v_inicio := nullif(p->>'inicio', '')::date;
  v_fim := nullif(p->>'fim', '')::date;
  if (select private.nivel_marketing_escola(p_workspace_id)) < 2 then raise exception 'Você não tem acesso ao marketing da escola.' using errcode = 'P0001'; end if;
  if char_length(v_nome) < 2 then raise exception 'Dê um nome à campanha.' using errcode = 'P0001'; end if;
  if v_utm is not null and v_utm !~ '^[a-z0-9][a-z0-9._-]{1,99}$' then raise exception 'O utm_campaign aceita só letras minúsculas, números, ponto, hífen e sublinhado (ex.: puncao-out26).' using errcode = 'P0001'; end if;
  if v_conta is not null and not exists (select 1 from public.escola_contas where id = v_conta and workspace_id = p_workspace_id) then raise exception 'Conta inválida.' using errcode = 'P0001'; end if;
  if v_fim is not null and v_inicio is not null and v_fim < v_inicio then raise exception 'O fim vem antes do início.' using errcode = 'P0001'; end if;
  if v_id is null then
    insert into public.escola_campanhas (workspace_id, nome, conta_id, curso, objetivo, status, inicio, fim, orcamento, utm_campaign, resumo, aprendizados, criado_por)
    values (p_workspace_id, v_nome, v_conta, nullif(trim(p->>'curso'), ''), coalesce(nullif(p->>'objetivo', ''), 'matriculas'), v_status, v_inicio, v_fim, v_orc, v_utm,
      nullif(trim(p->>'resumo'), ''), nullif(trim(p->>'aprendizados'), ''), (select auth.uid()))
    returning id into v_id;
  else
    update public.escola_campanhas set nome = v_nome, conta_id = v_conta, curso = nullif(trim(p->>'curso'), ''), objetivo = coalesce(nullif(p->>'objetivo', ''), objetivo),
      status = v_status, inicio = v_inicio, fim = v_fim, orcamento = v_orc, utm_campaign = v_utm, resumo = nullif(trim(p->>'resumo'), ''),
      aprendizados = nullif(trim(p->>'aprendizados'), ''), updated_at = now()
    where id = v_id and workspace_id = p_workspace_id;
    if not found then raise exception 'Campanha não encontrada.' using errcode = 'P0001'; end if;
  end if;
  return v_id;
exception
  when unique_violation then raise exception 'Já existe uma campanha com este nome ou este utm_campaign.' using errcode = 'P0001';
  when check_violation then raise exception 'Algum campo está fora do permitido (objetivo, situação ou tamanho do texto).' using errcode = 'P0001';
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
end $$;
revoke all on function public.escola_mkt_salvar_campanha(uuid, jsonb) from public, anon;
grant execute on function public.escola_mkt_salvar_campanha(uuid, jsonb) to authenticated;

create or replace function public.escola_mkt_salvar_peca(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_campanha uuid;
  v_ref boolean;
  v_titulo text;
  v_url text;
begin
  v_id := nullif(p->>'id', '')::uuid;
  v_campanha := nullif(p->>'campanha_id', '')::uuid;
  v_ref := coalesce((p->>'referencia')::boolean, false);
  v_titulo := regexp_replace(trim(coalesce(p->>'titulo', '')), '\s+', ' ', 'g');
  v_url := nullif(trim(coalesce(p->>'url', '')), '');
  if (select private.nivel_marketing_escola(p_workspace_id)) < 2 then raise exception 'Você não tem acesso ao marketing da escola.' using errcode = 'P0001'; end if;
  if char_length(v_titulo) < 2 then raise exception 'Dê um título à peça.' using errcode = 'P0001'; end if;
  if v_url is not null and v_url !~ '^https?://[^\s]+$' then raise exception 'O link precisa começar com http:// ou https://.' using errcode = 'P0001'; end if;
  if v_campanha is not null and not exists (select 1 from public.escola_campanhas where id = v_campanha and workspace_id = p_workspace_id) then raise exception 'Campanha inválida.' using errcode = 'P0001'; end if;
  if v_id is null then
    insert into public.escola_pecas (workspace_id, campanha_id, referencia, fonte, tipo, canal, titulo, url, texto, angulo, formato, status, publicada_em, encerrada_em,
      investimento, impressoes, cliques, leads, matriculas, resultado_em, vencedora, nota, criado_por)
    values (p_workspace_id, case when v_ref then null else v_campanha end, v_ref, nullif(trim(p->>'fonte'), ''), p->>'tipo', p->>'canal', v_titulo, v_url, nullif(trim(p->>'texto'), ''),
      nullif(trim(p->>'angulo'), ''), nullif(trim(p->>'formato'), ''), coalesce(nullif(p->>'status', ''), case when v_ref then 'no_ar' else 'rascunho' end),
      nullif(p->>'publicada_em', '')::date, nullif(p->>'encerrada_em', '')::date,
      case when v_ref then null else nullif(replace(p->>'investimento', ',', '.'), '')::numeric end, nullif(p->>'impressoes', '')::bigint, nullif(p->>'cliques', '')::bigint,
      case when v_ref then null else nullif(p->>'leads', '')::integer end, case when v_ref then null else nullif(p->>'matriculas', '')::integer end,
      nullif(p->>'resultado_em', '')::date, coalesce((p->>'vencedora')::boolean, false), nullif(trim(p->>'nota'), ''), (select auth.uid()))
    returning id into v_id;
  else
    update public.escola_pecas set campanha_id = case when referencia then null else v_campanha end, fonte = nullif(trim(p->>'fonte'), ''), tipo = p->>'tipo', canal = p->>'canal',
      titulo = v_titulo, url = v_url, texto = nullif(trim(p->>'texto'), ''), angulo = nullif(trim(p->>'angulo'), ''), formato = nullif(trim(p->>'formato'), ''),
      status = coalesce(nullif(p->>'status', ''), status), publicada_em = nullif(p->>'publicada_em', '')::date, encerrada_em = nullif(p->>'encerrada_em', '')::date,
      investimento = case when referencia then null else nullif(replace(p->>'investimento', ',', '.'), '')::numeric end,
      impressoes = nullif(p->>'impressoes', '')::bigint, cliques = nullif(p->>'cliques', '')::bigint,
      leads = case when referencia then null else nullif(p->>'leads', '')::integer end, matriculas = case when referencia then null else nullif(p->>'matriculas', '')::integer end,
      resultado_em = nullif(p->>'resultado_em', '')::date, vencedora = coalesce((p->>'vencedora')::boolean, vencedora), nota = nullif(trim(p->>'nota'), ''), updated_at = now()
    where id = v_id and workspace_id = p_workspace_id;
    if not found then raise exception 'Peça não encontrada.' using errcode = 'P0001'; end if;
  end if;
  return v_id;
exception
  when not_null_violation then raise exception 'Escolha o tipo e o canal da peça.' using errcode = 'P0001';
  when check_violation then raise exception 'Algum campo está fora do permitido (tipo, canal, situação, datas, números ou tamanho do texto).' using errcode = 'P0001';
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
end $$;
revoke all on function public.escola_mkt_salvar_peca(uuid, jsonb) from public, anon;
grant execute on function public.escola_mkt_salvar_peca(uuid, jsonb) to authenticated;

-- Liga (ou troca) a imagem da peça. Devolve o caminho antigo, para o servidor apagar do Storage.
create or replace function public.escola_mkt_imagem(p_workspace_id uuid, p_peca_id uuid, p_caminho text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_antigo text;
begin
  if (select private.nivel_marketing_escola(p_workspace_id)) < 2 then raise exception 'Você não tem acesso ao marketing da escola.' using errcode = 'P0001'; end if;
  if p_caminho is not null and p_caminho !~ ('^' || p_workspace_id::text || '/' || p_peca_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
    raise exception 'Caminho de imagem inválido.' using errcode = 'P0001';
  end if;
  select imagem_path into v_antigo from public.escola_pecas where id = p_peca_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Peça não encontrada.' using errcode = 'P0001'; end if;
  update public.escola_pecas set imagem_path = p_caminho, updated_at = now() where id = p_peca_id;
  return v_antigo;
end $$;
revoke all on function public.escola_mkt_imagem(uuid, uuid, text) from public, anon;
grant execute on function public.escola_mkt_imagem(uuid, uuid, text) to authenticated;

-- Exclui campanha (as peças ficam, soltas) ou peça. Só admin ou quem criou. Devolve os caminhos de imagem a apagar.
create or replace function public.escola_mkt_excluir(p_workspace_id uuid, p_tipo text, p_id uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  v_dono uuid;
  v_img text;
begin
  if (select private.nivel_marketing_escola(p_workspace_id)) < 2 then raise exception 'Você não tem acesso ao marketing da escola.' using errcode = 'P0001'; end if;
  if p_tipo = 'campanha' then
    select criado_por into v_dono from public.escola_campanhas where id = p_id and workspace_id = p_workspace_id;
  elsif p_tipo = 'peca' then
    select criado_por, imagem_path into v_dono, v_img from public.escola_pecas where id = p_id and workspace_id = p_workspace_id;
  else
    raise exception 'Tipo inválido.' using errcode = 'P0001';
  end if;
  if not found then raise exception 'Não encontrado.' using errcode = 'P0001'; end if;
  if (select private.workspace_role(p_workspace_id)) is distinct from 'admin' and v_dono is distinct from (select auth.uid()) then
    raise exception 'Só quem criou ou um admin exclui.' using errcode = 'P0001';
  end if;
  if p_tipo = 'campanha' then delete from public.escola_campanhas where id = p_id;
  else delete from public.escola_pecas where id = p_id;
  end if;
  return array_remove(array[v_img], null);
end $$;
revoke all on function public.escola_mkt_excluir(uuid, text, uuid) from public, anon;
grant execute on function public.escola_mkt_excluir(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------- leitura

-- O que cada utm_campaign trouxe na Únicopag (só somas: quem vê o marketing
-- não precisa ver a transação). Recebido = pago e em disputa, pelo dia do pagamento.
create or replace function public.escola_receita_por_campanha(p_workspace_id uuid)
returns table (campanha text, recebido bigint, pagamentos bigint, primeira date, ultima date)
language sql security definer set search_path = '' stable as $$
  select t.campanha, sum(t.valor)::bigint, count(*)::bigint,
    min((t.paga_em at time zone 'America/Sao_Paulo')::date), max((t.paga_em at time zone 'America/Sao_Paulo')::date)
  from public.escola_transacoes t
  where t.workspace_id = p_workspace_id and t.campanha is not null and t.situacao in ('pago', 'em_disputa') and t.paga_em is not null
    and (select private.nivel_marketing_escola(p_workspace_id)) >= 2
  group by t.campanha
$$;
revoke all on function public.escola_receita_por_campanha(uuid) from public, anon;
grant execute on function public.escola_receita_por_campanha(uuid) to authenticated;
