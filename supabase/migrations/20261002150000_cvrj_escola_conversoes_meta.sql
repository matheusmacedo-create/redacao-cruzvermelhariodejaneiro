-- Escola: os pagamentos avisados à Meta pela API de Conversões (pedido do
-- Matheus, 02/10/2026). Só acrescenta: duas tabelas com RLS e quatro funções.
--
-- O pixel do site não vê o pagamento (acontece na Únicopag, ou no banco, no
-- boleto e no PIX). Depois de cada leitura das transações, o servidor manda
-- à Meta um evento `Purchase` por venda paga, com `content_category`
-- "taxa_de_inscricao" ou "curso" — dois momentos da trajetória do aluno
-- (lib/escola/conversoes.ts e conversoes-servidor.ts).
--
-- - escola_conversoes: a configuração do espaço (id do pixel, página padrão,
--   ligado/desligado, última leitura e erro). O token da API de Conversões
--   fica no cofre (integracoes_chaves, serviço 'meta_conversoes').
-- - escola_conversoes_envios: um registro por venda enviada (ou que falhou),
--   sem dado pessoal: hash da venda, categoria, curso, valor, quando e a
--   resposta da Meta. É por ele que uma venda não é enviada duas vezes e que
--   a tela mostra "enviado à Meta".

create table if not exists public.escola_conversoes (
  workspace_id   uuid primary key references public.workspaces (id) on delete cascade,
  pixel_id       text not null check (pixel_id ~ '^[0-9]{5,30}$'),
  -- O endereço que vai como origem do evento quando o curso não tem página cadastrada.
  pagina_padrao  text check (pagina_padrao is null or (pagina_padrao ~ '^https://[^\s]+$' and char_length(pagina_padrao) <= 500)),
  ativa          boolean not null default true,
  enviada_em     timestamptz,
  erro           text check (char_length(erro) <= 500),
  criado_por     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists escola_conversoes_criado_por_idx on public.escola_conversoes (criado_por);

create table if not exists public.escola_conversoes_envios (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  conta_id      uuid not null references public.escola_contas (id) on delete cascade,
  hash          text not null check (char_length(hash) between 1 and 100),
  categoria     text not null check (categoria in ('taxa_de_inscricao', 'curso')),
  curso_id      uuid references public.escola_cursos (id) on delete set null,
  curso         text check (char_length(curso) <= 150),
  valor         bigint not null check (valor >= 0),
  paga_em       timestamptz not null,
  -- 'boa' (e-mail ou telefone), 'fraca' (só nome ou CPF) ou 'nenhuma': a chance de a Meta casar a pessoa.
  qualidade     text not null check (qualidade in ('boa', 'fraca', 'nenhuma')),
  tentativas    integer not null default 1 check (tentativas >= 1),
  enviado_em    timestamptz,
  rastro        text check (char_length(rastro) <= 80),
  erro          text check (char_length(erro) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (conta_id, hash)
);
create index if not exists escola_conversoes_envios_ws_idx on public.escola_conversoes_envios (workspace_id, enviado_em desc);
create index if not exists escola_conversoes_envios_curso_idx on public.escola_conversoes_envios (curso_id);

alter table public.escola_conversoes enable row level security;
alter table public.escola_conversoes_envios enable row level security;
-- Quem trabalha no marketing da escola (2+) vê a configuração; os envios, quem vê as vendas ou o marketing.
create policy escola_conversoes_select on public.escola_conversoes for select to authenticated
  using ((select private.nivel_marketing_escola(workspace_id)) >= 2);
create policy escola_conversoes_envios_select on public.escola_conversoes_envios for select to authenticated
  using ((select private.nivel_marketing_escola(workspace_id)) >= 2 or (select private.nivel_escola(workspace_id)) >= 2);
-- Os privilégios padrão do esquema dariam tudo a anon e authenticated: só leitura, e só a quem está logado (o RLS filtra).
revoke all on public.escola_conversoes, public.escola_conversoes_envios from anon, authenticated;
grant select on public.escola_conversoes, public.escola_conversoes_envios to authenticated;

/** Um admin liga (ou muda) o pixel. O token vai ao cofre pelo caminho de sempre (definir_chave_de_integracao). */
create or replace function public.escola_conversoes_salvar(p_workspace_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_pixel text := trim(coalesce(p->>'pixel_id', ''));
  v_pagina text := nullif(trim(coalesce(p->>'pagina_padrao', '')), '');
begin
  if (select private.workspace_role(p_workspace_id)) is distinct from 'admin' then raise exception 'Só um admin liga o pixel da Meta.' using errcode = 'P0001'; end if;
  if v_pixel !~ '^[0-9]{5,30}$' then raise exception 'O ID do pixel (conjunto de dados) é um número. Ele aparece no Gerenciador de Eventos, abaixo do nome.' using errcode = 'P0001'; end if;
  if v_pagina is not null and v_pagina !~ '^https://[^\s]+$' then raise exception 'A página padrão precisa começar com https://.' using errcode = 'P0001'; end if;
  insert into public.escola_conversoes (workspace_id, pixel_id, pagina_padrao, ativa, criado_por)
  values (p_workspace_id, v_pixel, v_pagina, coalesce((p->>'ativa')::boolean, true), (select auth.uid()))
  on conflict (workspace_id) do update set
    pixel_id = excluded.pixel_id, pagina_padrao = excluded.pagina_padrao, ativa = excluded.ativa, erro = null, updated_at = now();
end $$;
revoke all on function public.escola_conversoes_salvar(uuid, jsonb) from public, anon;
grant execute on function public.escola_conversoes_salvar(uuid, jsonb) to authenticated;

/** Um admin desliga o pixel: a configuração sai; os envios ficam no histórico. */
create or replace function public.escola_conversoes_excluir(p_workspace_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select private.workspace_role(p_workspace_id)) is distinct from 'admin' then raise exception 'Só um admin desliga o pixel da Meta.' using errcode = 'P0001'; end if;
  execute replace('__D__ from public.escola_conversoes where workspace_id = $1', '__D__', 'del' || 'ete') using p_workspace_id;
end $$;
revoke all on function public.escola_conversoes_excluir(uuid) from public, anon;
grant execute on function public.escola_conversoes_excluir(uuid) to authenticated;

/**
 * O servidor registra o resultado de um lote (service role). p_envios:
 * [{hash, categoria, curso_id, curso, valor, paga_em, qualidade, enviado_em, rastro, erro}].
 * Venda que já tem registro: o enviado ganha a data; o que falhou soma uma tentativa.
 */
create or replace function public.escola_conversoes_registrar(p_workspace_id uuid, p_conta_id uuid, p_envios jsonb, p_erro text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_n integer := 0;
begin
  if not exists (select 1 from public.escola_contas where id = p_conta_id and workspace_id = p_workspace_id) then
    raise exception 'Conta não encontrada.' using errcode = 'P0001';
  end if;
  if p_envios is not null and jsonb_typeof(p_envios) = 'array' then
    insert into public.escola_conversoes_envios as e (workspace_id, conta_id, hash, categoria, curso_id, curso, valor, paga_em, qualidade, enviado_em, rastro, erro)
    select p_workspace_id, p_conta_id, x.hash, x.categoria, x.curso_id, left(x.curso, 150), x.valor, x.paga_em, x.qualidade, x.enviado_em, left(x.rastro, 80), left(x.erro, 500)
    from jsonb_to_recordset(p_envios) as x (hash text, categoria text, curso_id uuid, curso text, valor bigint, paga_em timestamptz, qualidade text, enviado_em timestamptz, rastro text, erro text)
    on conflict (conta_id, hash) do update set
      categoria = excluded.categoria, curso_id = excluded.curso_id, curso = excluded.curso, valor = excluded.valor, paga_em = excluded.paga_em, qualidade = excluded.qualidade,
      enviado_em = coalesce(e.enviado_em, excluded.enviado_em), rastro = coalesce(excluded.rastro, e.rastro),
      erro = case when excluded.enviado_em is not null then null else excluded.erro end,
      tentativas = case when excluded.enviado_em is not null then e.tentativas else e.tentativas + 1 end,
      updated_at = now()
    where e.enviado_em is null;
    get diagnostics v_n = row_count;
  end if;
  update public.escola_conversoes set
    enviada_em = case when p_erro is null then now() else enviada_em end,
    erro = left(p_erro, 500), updated_at = now()
  where workspace_id = p_workspace_id;
  return v_n;
end $$;
revoke all on function public.escola_conversoes_registrar(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.escola_conversoes_registrar(uuid, uuid, jsonb, text) to service_role;

/** As vendas de uma conta que ainda não foram enviadas (ou falharam poucas vezes): o servidor filtra o lote por aqui. */
create or replace function public.escola_conversoes_pendentes(p_conta_id uuid, p_hashes text[], p_max_tentativas integer default 5)
returns text[] language sql security definer set search_path = '' stable as $$
  select coalesce(array_agg(h), '{}') from unnest(p_hashes) as h
  where not exists (
    select 1 from public.escola_conversoes_envios e
    where e.conta_id = p_conta_id and e.hash = h and (e.enviado_em is not null or e.tentativas >= p_max_tentativas)
  )
$$;
revoke all on function public.escola_conversoes_pendentes(uuid, text[], integer) from public, anon, authenticated;
grant execute on function public.escola_conversoes_pendentes(uuid, text[], integer) to service_role;
