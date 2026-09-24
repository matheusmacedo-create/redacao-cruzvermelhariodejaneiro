-- Escola (4): o banco de advertoriais. Cada advertorial é uma matéria da
-- Redação (content_pieces), publicada no site como notícia pelo caminho de
-- sempre, e ao mesmo tempo uma peça do marketing da escola (escola_pecas,
-- tipo 'advertorial') — é essa ligação que guarda tudo num lugar só e junta
-- os números de cada página:
--   * visitas: um pixel da própria Redação na página (sem cookie, só conta);
--   * cliques no botão de matrícula: o botão passa por um endereço da
--     Redação que conta e segue para a página de matrícula, repassando as
--     UTMs do anúncio e marcando utm_content = o advertorial;
--   * investimento e contatos: dos anúncios do Meta cujo link aponta para a
--     página (feito na tela, pelo endereço);
--   * matrículas e receita: das transações da Únicopag com esse utm_content
--     (coluna nova em escola_transacoes).

-- ---------------------------------------------------------------- peças

alter table public.escola_pecas drop constraint if exists escola_pecas_tipo_check;
alter table public.escola_pecas add constraint escola_pecas_tipo_check
  check (tipo in ('pagina', 'advertorial', 'anuncio', 'post', 'video', 'email', 'whatsapp', 'impresso', 'outro'));
alter table public.escola_pecas
  add column if not exists content_id uuid references public.content_pieces (id) on delete set null,
  -- Para onde o botão de matrícula leva (a página de inscrição do curso).
  add column if not exists destino_url text check (destino_url ~ '^https://[^\s]+$' and char_length(destino_url) <= 800);
create unique index if not exists escola_pecas_content_idx on public.escola_pecas (content_id) where content_id is not null;

-- ---------------------------------------------------------------- utm_content na transação

alter table public.escola_transacoes add column if not exists conteudo text check (char_length(conteudo) <= 100);
create index if not exists escola_transacoes_conteudo_idx on public.escola_transacoes (workspace_id, conteudo) where conteudo is not null;

create or replace function public.escola_gravar_sincronizacao(p_conta_id uuid, p_transacoes jsonb, p_saldo jsonb, p_erro text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid;
  v_n integer := 0;
begin
  select workspace_id into v_ws from public.escola_contas where id = p_conta_id for update;
  if v_ws is null then raise exception 'Conta não encontrada.' using errcode = 'P0001'; end if;

  if p_transacoes is not null and jsonb_typeof(p_transacoes) = 'array' then
    insert into public.escola_transacoes as t (workspace_id, conta_id, hash, metodo, status, situacao, valor, parcelas, cliente, documento, produto, origem, campanha, conteudo, criada_em, paga_em, atualizada_em, sincronizada_em)
    select v_ws, p_conta_id, x.hash, x.metodo, x.status, x.situacao, x.valor, x.parcelas, left(x.cliente, 200), left(x.documento, 20), left(x.produto, 300), left(x.origem, 100), left(lower(x.campanha), 100), left(lower(x.conteudo), 100),
      x.criada_em, x.paga_em, x.atualizada_em, now()
    from jsonb_to_recordset(p_transacoes) as x (hash text, metodo text, status text, situacao text, valor bigint, parcelas smallint, cliente text, documento text, produto text, origem text, campanha text, conteudo text,
      criada_em timestamptz, paga_em timestamptz, atualizada_em timestamptz)
    on conflict (conta_id, hash) do update set
      metodo = excluded.metodo, status = excluded.status, situacao = excluded.situacao, valor = excluded.valor, parcelas = excluded.parcelas,
      cliente = excluded.cliente, documento = excluded.documento, produto = excluded.produto, origem = excluded.origem, campanha = excluded.campanha, conteudo = excluded.conteudo,
      paga_em = excluded.paga_em, atualizada_em = excluded.atualizada_em, sincronizada_em = now()
    where (t.status, t.valor, t.paga_em, t.produto, t.cliente, t.campanha, t.conteudo) is distinct from (excluded.status, excluded.valor, excluded.paga_em, excluded.produto, excluded.cliente, excluded.campanha, excluded.conteudo);
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

-- ---------------------------------------------------------------- visitas e cliques

create table if not exists public.escola_adv_metricas (
  peca_id       uuid not null references public.escola_pecas (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  dia           date not null,
  visitas       integer not null default 0 check (visitas >= 0),
  cliques       integer not null default 0 check (cliques >= 0),
  primary key (peca_id, dia)
);
create index if not exists escola_adv_metricas_ws_idx on public.escola_adv_metricas (workspace_id, dia);
alter table public.escola_adv_metricas enable row level security;
create policy escola_adv_metricas_select on public.escola_adv_metricas for select to authenticated using ((select private.nivel_marketing_escola(workspace_id)) >= 2);

-- Conta uma visita ou um clique (rota pública da Redação, via service_role).
-- Devolve o destino do botão (com o que for preciso para a UTM) — nunca um
-- endereço vindo de quem chamou.
create or replace function public.escola_adv_contar(p_peca_id uuid, p_tipo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v record;
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select p.workspace_id, p.destino_url, cp.slug, c.utm_campaign into v
  from public.escola_pecas p
  left join public.content_pieces cp on cp.id = p.content_id
  left join public.escola_campanhas c on c.id = p.campanha_id
  where p.id = p_peca_id and p.tipo = 'advertorial';
  if not found then return null; end if;
  if p_tipo not in ('visita', 'clique') then return null; end if;
  insert into public.escola_adv_metricas as m (peca_id, workspace_id, dia, visitas, cliques)
  values (p_peca_id, v.workspace_id, v_dia, case when p_tipo = 'visita' then 1 else 0 end, case when p_tipo = 'clique' then 1 else 0 end)
  on conflict (peca_id, dia) do update set visitas = m.visitas + excluded.visitas, cliques = m.cliques + excluded.cliques;
  return jsonb_build_object('destino', v.destino_url, 'slug', v.slug, 'utm_campaign', v.utm_campaign);
end $$;
revoke all on function public.escola_adv_contar(uuid, text) from public, anon, authenticated;
grant execute on function public.escola_adv_contar(uuid, text) to service_role;

-- ---------------------------------------------------------------- criar (marketing)

-- Cria o advertorial: a matéria em rascunho (para escrever no editor de
-- sempre) e a peça ligada a ela, numa ida só.
create or replace function public.escola_adv_criar(p_workspace_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_titulo text;
  v_destino text;
  v_campanha uuid;
  v_conteudo uuid;
  v_peca uuid;
begin
  v_titulo := regexp_replace(trim(coalesce(p->>'titulo', '')), '\s+', ' ', 'g');
  v_destino := nullif(trim(coalesce(p->>'destino_url', '')), '');
  v_campanha := nullif(p->>'campanha_id', '')::uuid;
  if (select private.nivel_marketing_escola(p_workspace_id)) < 2 then raise exception 'Você não tem acesso ao marketing da escola.' using errcode = 'P0001'; end if;
  if char_length(v_titulo) < 5 then raise exception 'Dê um título ao advertorial (a manchete da matéria).' using errcode = 'P0001'; end if;
  if char_length(v_titulo) > 160 then raise exception 'A manchete pode ter até 160 caracteres.' using errcode = 'P0001'; end if;
  if v_destino is null or v_destino !~ '^https://[^\s]+$' then raise exception 'Informe para onde o botão de matrícula leva (endereço com https://).' using errcode = 'P0001'; end if;
  if v_campanha is not null and not exists (select 1 from public.escola_campanhas where id = v_campanha and workspace_id = p_workspace_id) then raise exception 'Campanha inválida.' using errcode = 'P0001'; end if;
  insert into public.content_pieces (workspace_id, title, body, format, status, responsible_id, created_by)
  values (p_workspace_id, v_titulo, coalesce(nullif(p->>'corpo', ''), ''), 'Advertorial', 'draft', (select auth.uid()), (select auth.uid()))
  returning id into v_conteudo;
  insert into public.escola_pecas (workspace_id, campanha_id, tipo, canal, titulo, angulo, formato, status, destino_url, content_id, criado_por)
  values (p_workspace_id, v_campanha, 'advertorial', 'site', left(v_titulo, 160), nullif(trim(p->>'angulo'), ''), 'Advertorial (notícia)', 'rascunho', v_destino, v_conteudo, (select auth.uid()))
  returning id into v_peca;
  return jsonb_build_object('peca_id', v_peca, 'content_id', v_conteudo);
exception
  when check_violation then raise exception 'Algum campo está fora do permitido (ângulo até 60 caracteres, endereço até 800).' using errcode = 'P0001';
  when invalid_text_representation then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
end $$;
revoke all on function public.escola_adv_criar(uuid, jsonb) from public, anon;
grant execute on function public.escola_adv_criar(uuid, jsonb) to authenticated;

-- Muda campanha, ângulo e destino do botão de um advertorial.
create or replace function public.escola_adv_salvar(p_workspace_id uuid, p_peca_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_destino text;
  v_campanha uuid;
begin
  v_destino := nullif(trim(coalesce(p->>'destino_url', '')), '');
  v_campanha := nullif(p->>'campanha_id', '')::uuid;
  if (select private.nivel_marketing_escola(p_workspace_id)) < 2 then raise exception 'Você não tem acesso ao marketing da escola.' using errcode = 'P0001'; end if;
  if v_destino is null or v_destino !~ '^https://[^\s]+$' then raise exception 'Informe para onde o botão de matrícula leva (endereço com https://).' using errcode = 'P0001'; end if;
  if v_campanha is not null and not exists (select 1 from public.escola_campanhas where id = v_campanha and workspace_id = p_workspace_id) then raise exception 'Campanha inválida.' using errcode = 'P0001'; end if;
  update public.escola_pecas set campanha_id = v_campanha, destino_url = v_destino, angulo = nullif(trim(p->>'angulo'), ''),
    status = coalesce(nullif(p->>'status', ''), status), vencedora = coalesce((p->>'vencedora')::boolean, vencedora), nota = nullif(trim(p->>'nota'), ''), updated_at = now()
  where id = p_peca_id and workspace_id = p_workspace_id and tipo = 'advertorial';
  if not found then raise exception 'Advertorial não encontrado.' using errcode = 'P0001'; end if;
exception
  when check_violation then raise exception 'Algum campo está fora do permitido.' using errcode = 'P0001';
  when invalid_text_representation then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
end $$;
revoke all on function public.escola_adv_salvar(uuid, uuid, jsonb) from public, anon;
grant execute on function public.escola_adv_salvar(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------- leitura

-- A matéria de cada advertorial (título, endereço, publicação, capa) para
-- quem vê o marketing — mesmo quem não teria acesso à pauta dela.
create or replace function public.escola_advertoriais(p_workspace_id uuid)
returns table (peca_id uuid, content_id uuid, titulo text, subtitulo text, slug text, site_url text, capa text, publicada_em timestamptz, status_materia text, atualizada_em timestamptz)
language sql security definer set search_path = '' stable as $$
  select p.id, cp.id, cp.title, cp.subtitle, cp.slug, cp.site_url, cp.site_cover_url, cp.site_published_at, cp.status, cp.updated_at
  from public.escola_pecas p
  join public.content_pieces cp on cp.id = p.content_id
  where p.workspace_id = p_workspace_id and p.tipo = 'advertorial'
    and (select private.nivel_marketing_escola(p_workspace_id)) >= 2
$$;
revoke all on function public.escola_advertoriais(uuid) from public, anon;
grant execute on function public.escola_advertoriais(uuid) to authenticated;

-- O que cada utm_content trouxe na Únicopag (só somas).
create or replace function public.escola_receita_por_conteudo(p_workspace_id uuid)
returns table (conteudo text, recebido bigint, pagamentos bigint)
language sql security definer set search_path = '' stable as $$
  select t.conteudo, sum(t.valor)::bigint, count(*)::bigint
  from public.escola_transacoes t
  where t.workspace_id = p_workspace_id and t.conteudo is not null and t.situacao in ('pago', 'em_disputa') and t.paga_em is not null
    and (select private.nivel_marketing_escola(p_workspace_id)) >= 2
  group by t.conteudo
$$;
revoke all on function public.escola_receita_por_conteudo(uuid) from public, anon;
grant execute on function public.escola_receita_por_conteudo(uuid) to authenticated;
