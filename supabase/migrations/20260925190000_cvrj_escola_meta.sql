-- Escola (3): os anúncios do Meta entram sozinhos no marketing da escola.
--
-- Um admin liga a conta de anúncios (act_…) e guarda no cofre o token de
-- um usuário do sistema com ads_read (integracoes_chaves, serviço
-- 'meta_ads'). Uma vez por dia — e pelo botão — a Redação lê pela
-- Marketing API as campanhas, os anúncios com o criativo (imagem, texto,
-- link, UTM) e os números de cada anúncio (investimento, impressões,
-- cliques no link, contatos e compras = matrículas). Campanha do Meta vira
-- campanha da escola (ou se liga a uma que já existia, pelo utm_campaign
-- ou pelo nome); anúncio vira peça. O que a equipe escreveu à mão (ângulo,
-- nota, vencedora, aprendizados) não é sobrescrito.

-- ---------------------------------------------------------------- tabelas

create table if not exists public.escola_meta_contas (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  act_id              text not null check (act_id ~ '^act_[0-9]{5,25}$'),
  nome                text check (char_length(nome) <= 120),
  -- Só as campanhas cujo nome contém este texto (a conta pode ter anúncios de outras áreas).
  filtro              text check (char_length(filtro) <= 80),
  ativa               boolean not null default true,
  sincronizada_em     timestamptz,
  sincronizacao_erro  text check (char_length(sincronizacao_erro) <= 500),
  criado_por          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (workspace_id, act_id)
);

alter table public.escola_campanhas add column if not exists meta_campaign_id text check (meta_campaign_id ~ '^[0-9]{5,30}$');
create unique index if not exists escola_campanhas_meta_idx on public.escola_campanhas (workspace_id, meta_campaign_id) where meta_campaign_id is not null;

alter table public.escola_pecas
  add column if not exists origem text not null default 'manual' check (origem in ('manual', 'meta')),
  add column if not exists meta_ad_id text check (meta_ad_id ~ '^[0-9]{5,30}$'),
  add column if not exists meta_conta_id uuid references public.escola_meta_contas (id) on delete set null,
  add column if not exists meta_status text check (char_length(meta_status) <= 40);
create unique index if not exists escola_pecas_meta_idx on public.escola_pecas (workspace_id, meta_ad_id) where meta_ad_id is not null;
create index if not exists escola_pecas_meta_conta_idx on public.escola_pecas (meta_conta_id);

alter table public.escola_meta_contas enable row level security;
create policy escola_meta_contas_select on public.escola_meta_contas for select to authenticated using ((select private.nivel_marketing_escola(workspace_id)) >= 2);

-- ---------------------------------------------------------------- contas (admin)

create or replace function public.escola_meta_salvar_conta(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_act text;
begin
  v_id := nullif(p->>'id', '')::uuid;
  v_act := lower(regexp_replace(trim(coalesce(p->>'act_id', '')), '\s', '', 'g'));
  if v_act ~ '^[0-9]+$' then v_act := 'act_' || v_act; end if;
  if (select private.workspace_role(p_workspace_id)) is distinct from 'admin' then raise exception 'Só um admin liga a conta de anúncios.' using errcode = 'P0001'; end if;
  if v_act !~ '^act_[0-9]{5,25}$' then raise exception 'O ID da conta de anúncios é um número (ex.: act_1234567890).' using errcode = 'P0001'; end if;
  if v_id is null then
    insert into public.escola_meta_contas (workspace_id, act_id, nome, filtro, criado_por)
    values (p_workspace_id, v_act, nullif(trim(p->>'nome'), ''), nullif(trim(p->>'filtro'), ''), (select auth.uid()))
    returning id into v_id;
  else
    update public.escola_meta_contas set act_id = v_act, nome = coalesce(nullif(trim(p->>'nome'), ''), nome), filtro = nullif(trim(p->>'filtro'), ''),
      ativa = coalesce((p->>'ativa')::boolean, ativa)
    where id = v_id and workspace_id = p_workspace_id;
    if not found then raise exception 'Conta não encontrada.' using errcode = 'P0001'; end if;
  end if;
  return v_id;
exception
  when unique_violation then raise exception 'Esta conta de anúncios já está ligada.' using errcode = 'P0001';
  when check_violation then raise exception 'Algum campo está fora do permitido (filtro até 80 caracteres).' using errcode = 'P0001';
  when invalid_text_representation then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
end $$;
revoke all on function public.escola_meta_salvar_conta(uuid, jsonb) from public, anon;
grant execute on function public.escola_meta_salvar_conta(uuid, jsonb) to authenticated;

-- Desliga a conta: as peças e campanhas já lidas ficam (viram histórico).
create or replace function public.escola_meta_excluir_conta(p_workspace_id uuid, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select private.workspace_role(p_workspace_id)) is distinct from 'admin' then raise exception 'Só um admin desliga a conta de anúncios.' using errcode = 'P0001'; end if;
  delete from public.escola_meta_contas where id = p_id and workspace_id = p_workspace_id;
  if not found then raise exception 'Conta não encontrada.' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.escola_meta_excluir_conta(uuid, uuid) from public, anon;
grant execute on function public.escola_meta_excluir_conta(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- sincronização (servidor)

-- Grava o que a leitura do Meta trouxe. Só service_role.
--   p_campanhas: [{meta_id, nome, status, inicio, fim, orcamento, utm}]
--   p_anuncios:  [{meta_id, campanha_meta_id, titulo, texto, url, tipo, formato, status, meta_status, publicada_em, encerrada_em,
--                  investimento, impressoes, cliques, leads, matriculas}]
create or replace function public.escola_meta_gravar(p_conta_id uuid, p_campanhas jsonb, p_anuncios jsonb, p_erro text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid;
  c record;
  a record;
  v_id uuid;
  v_nome text;
  v_utm text;
  v_novas int := 0;
  v_ligadas int := 0;
  v_anuncios_novos int := 0;
  v_anuncios int := 0;
  v_novo boolean;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select workspace_id into v_ws from public.escola_meta_contas where id = p_conta_id for update;
  if v_ws is null then raise exception 'Conta não encontrada.' using errcode = 'P0001'; end if;

  if p_erro is not null then
    update public.escola_meta_contas set sincronizacao_erro = left(p_erro, 500) where id = p_conta_id;
    return jsonb_build_object('erro', true);
  end if;

  for c in select * from jsonb_to_recordset(coalesce(p_campanhas, '[]')) as x (meta_id text, nome text, status text, inicio date, fim date, orcamento numeric, utm text) loop
    v_utm := nullif(lower(c.utm), '');
    if v_utm is not null and v_utm !~ '^[a-z0-9][a-z0-9._-]{1,99}$' then v_utm := null; end if;
    select id into v_id from public.escola_campanhas where workspace_id = v_ws and meta_campaign_id = c.meta_id;
    if v_id is null then
      -- Campanha que a equipe já tinha criado à mão: liga pelo utm_campaign ou pelo nome.
      select id into v_id from public.escola_campanhas
      where workspace_id = v_ws and meta_campaign_id is null and ((v_utm is not null and utm_campaign = v_utm) or lower(nome) = lower(c.nome))
      order by (utm_campaign = v_utm) desc nulls last limit 1;
      if v_id is not null then
        update public.escola_campanhas set meta_campaign_id = c.meta_id, utm_campaign = coalesce(utm_campaign, v_utm), updated_at = now() where id = v_id;
        v_ligadas := v_ligadas + 1;
      end if;
    end if;
    if v_id is null then
      v_nome := left(c.nome, 120);
      if exists (select 1 from public.escola_campanhas where workspace_id = v_ws and lower(nome) = lower(v_nome)) then
        v_nome := left(c.nome, 100) || ' (Meta ' || right(c.meta_id, 6) || ')';
      end if;
      if v_utm is not null and exists (select 1 from public.escola_campanhas where workspace_id = v_ws and utm_campaign = v_utm) then v_utm := null; end if;
      insert into public.escola_campanhas (workspace_id, nome, objetivo, status, inicio, fim, orcamento, utm_campaign, meta_campaign_id, resumo)
      values (v_ws, v_nome, 'matriculas', c.status, c.inicio, case when c.fim >= c.inicio or c.inicio is null then c.fim end, c.orcamento, v_utm, c.meta_id, 'Campanha lida do Meta Ads.');
      v_novas := v_novas + 1;
    else
      update public.escola_campanhas set status = c.status, inicio = coalesce(inicio, c.inicio),
        fim = case when c.fim is not null and (coalesce(inicio, c.inicio) is null or c.fim >= coalesce(inicio, c.inicio)) then c.fim else fim end,
        orcamento = coalesce(c.orcamento, orcamento), updated_at = now()
      where id = v_id;
    end if;
  end loop;

  for a in select * from jsonb_to_recordset(coalesce(p_anuncios, '[]')) as x (meta_id text, campanha_meta_id text, titulo text, texto text, url text, tipo text, formato text, status text, meta_status text,
    publicada_em date, encerrada_em date, investimento numeric, impressoes bigint, cliques bigint, leads integer, matriculas integer) loop
    insert into public.escola_pecas as p (workspace_id, campanha_id, origem, meta_ad_id, meta_conta_id, meta_status, tipo, canal, titulo, texto, url, formato, status, publicada_em, encerrada_em,
      investimento, impressoes, cliques, leads, matriculas, resultado_em)
    values (v_ws, (select id from public.escola_campanhas where workspace_id = v_ws and meta_campaign_id = a.campanha_meta_id), 'meta', a.meta_id, p_conta_id, a.meta_status,
      a.tipo, 'meta_ads', a.titulo, left(a.texto, 5000), a.url, left(a.formato, 60), a.status, a.publicada_em,
      case when a.encerrada_em >= a.publicada_em or a.publicada_em is null then a.encerrada_em end,
      a.investimento, a.impressoes, a.cliques, a.leads, a.matriculas, v_hoje)
    on conflict (workspace_id, meta_ad_id) where meta_ad_id is not null do update set
      campanha_id = coalesce(p.campanha_id, excluded.campanha_id), meta_conta_id = excluded.meta_conta_id, meta_status = excluded.meta_status, origem = 'meta',
      status = excluded.status, texto = coalesce(p.texto, excluded.texto), url = coalesce(p.url, excluded.url), formato = coalesce(p.formato, excluded.formato),
      publicada_em = coalesce(p.publicada_em, excluded.publicada_em),
      encerrada_em = case when excluded.encerrada_em is not null and excluded.encerrada_em >= coalesce(p.publicada_em, excluded.encerrada_em) then excluded.encerrada_em else p.encerrada_em end,
      investimento = excluded.investimento, impressoes = excluded.impressoes, cliques = excluded.cliques, leads = excluded.leads, matriculas = excluded.matriculas,
      resultado_em = excluded.resultado_em, updated_at = now()
    returning (xmax = 0) into v_novo;
    v_anuncios := v_anuncios + 1;
    if v_novo then v_anuncios_novos := v_anuncios_novos + 1; end if;
  end loop;

  update public.escola_meta_contas set sincronizada_em = now(), sincronizacao_erro = null where id = p_conta_id;
  return jsonb_build_object('campanhas_novas', v_novas, 'campanhas_ligadas', v_ligadas, 'anuncios', v_anuncios, 'anuncios_novos', v_anuncios_novos);
exception
  when check_violation then raise exception 'Um dado do Meta ficou fora do permitido (%).', left(sqlerrm, 200) using errcode = 'P0001';
end $$;
revoke all on function public.escola_meta_gravar(uuid, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.escola_meta_gravar(uuid, jsonb, jsonb, text) to service_role;

-- A imagem baixada do Meta (o link do Meta expira): só service_role, só peça sem imagem.
create or replace function public.escola_meta_imagem(p_peca_id uuid, p_caminho text)
returns void language sql security definer set search_path = '' as $$
  update public.escola_pecas set imagem_path = p_caminho
  where id = p_peca_id and imagem_path is null and p_caminho ~ ('^' || workspace_id::text || '/' || id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')
$$;
revoke all on function public.escola_meta_imagem(uuid, text) from public, anon, authenticated;
grant execute on function public.escola_meta_imagem(uuid, text) to service_role;

-- ---------------------------------------------------------------- edição à mão de peça do Meta

-- Peça que veio do Meta: os números são do Meta (a edição não mexe neles);
-- título, ângulo, formato, nota, vencedora e campanha continuam da equipe.
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
    update public.escola_pecas set campanha_id = case when referencia then null else v_campanha end, fonte = nullif(trim(p->>'fonte'), ''),
      tipo = case when origem = 'meta' then tipo else p->>'tipo' end, canal = case when origem = 'meta' then canal else p->>'canal' end,
      titulo = v_titulo, url = v_url, texto = nullif(trim(p->>'texto'), ''), angulo = nullif(trim(p->>'angulo'), ''), formato = nullif(trim(p->>'formato'), ''),
      status = case when origem = 'meta' then status else coalesce(nullif(p->>'status', ''), status) end,
      publicada_em = case when origem = 'meta' then publicada_em else nullif(p->>'publicada_em', '')::date end,
      encerrada_em = case when origem = 'meta' then encerrada_em else nullif(p->>'encerrada_em', '')::date end,
      investimento = case when referencia then null when origem = 'meta' then investimento else nullif(replace(p->>'investimento', ',', '.'), '')::numeric end,
      impressoes = case when origem = 'meta' then impressoes else nullif(p->>'impressoes', '')::bigint end,
      cliques = case when origem = 'meta' then cliques else nullif(p->>'cliques', '')::bigint end,
      leads = case when referencia then null when origem = 'meta' then leads else nullif(p->>'leads', '')::integer end,
      matriculas = case when referencia then null when origem = 'meta' then matriculas else nullif(p->>'matriculas', '')::integer end,
      resultado_em = case when origem = 'meta' then resultado_em else nullif(p->>'resultado_em', '')::date end,
      vencedora = coalesce((p->>'vencedora')::boolean, vencedora), nota = nullif(trim(p->>'nota'), ''), updated_at = now()
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
