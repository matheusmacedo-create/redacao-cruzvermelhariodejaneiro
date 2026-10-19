-- ============================================================
-- WhatsApp: a fundação do assistente (Claude) do Palácio (19/10/2026)
--
-- Só acrescenta (ARQUITETURA §10.1). O código funciona sem esta migração:
-- sem whatsapp_ia_config, o assistente fica indisponível e o bot responde
-- como sempre; sem as colunas novas, o registro e a confirmação do número
-- gravam como antes (lib/whatsapp/servidor.ts e confirmacao.ts tentam de
-- novo sem elas); sem as tabelas do plano, a faxina não faz nada.
--
--  - whatsapp_mensagens.enviada_em: a hora em que a pessoa enviou (o
--    timestamp da Meta). É ela que ordena o "confirmo" e as correções: a
--    confirmação por texto só vale escrita DEPOIS de o plano chegar.
--  - whatsapp_contas.nome_no_whatsapp / assistente_suspenso_em: o nome de
--    perfil visto na confirmação do número. Mudou, o assistente para naquele
--    número até a pessoa confirmar o número de novo (número reciclado).
--  - whatsapp_ia_config: o interruptor por espaço, sem deploy. Sem linha =
--    desligado. Só a administração lê; só o servidor escreve.
--  - whatsapp_ia_planos: o plano (ou a pergunta) que a pessoa confirma. Os
--    textos de ação (mensagem, nota, relato, recado, local, pedido em aberto)
--    ficam só enquanto o plano está aberto: são redigidos na hora em toda
--    saída de "aberto" (lib/whatsapp/assistente/faxina.ts). Só o servidor.
--  - whatsapp_ia_memoria: a memória curta, só marcador → (tipo, uuid), a
--    ordem da última lista, a trava por pessoa e o HMAC do último texto. O
--    CHECK recusa qualquer outra coisa (o Palácio não guarda a conversa).
--  - whatsapp_ia_uso: uma linha por turno, atualizada a cada chamada ao
--    modelo; só números, nomes de ferramenta e o desfecho, nunca texto.
--  - whatsapp_votar_uma_vez / votar_conferido: o voto conferido no banco,
--    na mesma transação: trava a rodada e a linha do votante, recusa voto
--    repetido (WA001), matéria mudada depois do plano (WA002, pelo sha-256
--    de título ‖ subtítulo ‖ corpo) e rodada encerrada (WA003). O primeiro é
--    do servidor (sessão simulada aal1, como whatsapp_votar: quem usa a
--    verificação em duas etapas cai no 42501); o segundo, da sessão real.
--  - whatsapp_mensagem_direta: a mensagem direta em nome de quem escreveu
--    no WhatsApp, com as regras da tela conferidas no banco.
--
-- Os validadores dos arrays e dos jsonb são funções imutáveis: o CHECK do
-- Postgres não aceita subconsulta. Policies criadas só se ainda não existem
-- (idempotente sem drop policy).
-- ============================================================

-- ---------------------------------------------------------------- colunas novas em tabelas da onda 1

alter table public.whatsapp_mensagens add column if not exists enviada_em timestamptz;
create index if not exists whatsapp_mensagens_entrada_enviada_idx
  on public.whatsapp_mensagens (user_id, enviada_em desc) where direcao = 'entrada' and enviada_em is not null;

alter table public.whatsapp_contas add column if not exists nome_no_whatsapp text
  check (nome_no_whatsapp is null or char_length(nome_no_whatsapp) <= 80);
alter table public.whatsapp_contas add column if not exists assistente_suspenso_em timestamptz;

-- ---------------------------------------------------------------- validadores (CHECK não aceita subconsulta)

-- refs: { "apr_1": { "t": "aprovacao", "id": "<uuid>" }, … } — só marcador, tipo e uuid. O case garante a
-- ordem: jsonb_object_keys num valor que não é objeto daria erro em vez de recusa.
create or replace function private.whatsapp_refs_validas(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when p is null or jsonb_typeof(p) <> 'object' then false
    when (select count(*) from jsonb_object_keys(p)) > 60 then false
    else not exists (
      select 1 from jsonb_each(p) e
       where case
         when e.key !~ '^[a-z]{3}_[0-9]{1,3}$' then true
         when jsonb_typeof(e.value) <> 'object' then true
         when (select count(*) from jsonb_object_keys(e.value)) <> 2 then true
         when jsonb_typeof(e.value -> 't') is distinct from 'string' or jsonb_typeof(e.value -> 'id') is distinct from 'string' then true
         when (e.value ->> 't') not in ('aprovacao', 'chamado', 'pessoa', 'aviso', 'visita', 'fila', 'assunto',
                                        'despesa', 'compra', 'veiculo', 'item', 'oficio') then true
         else (e.value ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       end)
  end
$$;

create or replace function private.whatsapp_marcadores_validos(p text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(cardinality(p), 0) <= 10 and not exists (select 1 from unnest(p) x where x is null or x !~ '^[a-z]{3}_[0-9]{1,3}$')
$$;

-- listas: [{ "m": "<id da mensagem>", "r": ["apr_1", …] }, …] — até 5, cada uma com até 10 marcadores.
create or replace function private.whatsapp_listas_validas(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when p is null or jsonb_typeof(p) <> 'array' then false
    when jsonb_array_length(p) > 5 then false
    else not exists (
      select 1 from jsonb_array_elements(p) x
       where case
         when jsonb_typeof(x) <> 'object' then true
         when (select count(*) from jsonb_object_keys(x)) <> 2 then true
         when jsonb_typeof(x -> 'm') is distinct from 'string' then true
         when (x ->> 'm') !~ '^[A-Za-z0-9._:=+/-]{1,128}$' then true
         when jsonb_typeof(x -> 'r') is distinct from 'array' then true
         when jsonb_array_length(x -> 'r') > 10 then true
         else exists (
           select 1 from jsonb_array_elements(x -> 'r') r
            where case when jsonb_typeof(r) <> 'string' then true else (r #>> '{}') !~ '^[a-z]{3}_[0-9]{1,3}$' end)
       end)
  end
$$;

create or replace function private.whatsapp_ids_de_mensagem_validos(p text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(cardinality(p), 0) <= 4 and not exists (select 1 from unnest(p) x where x is null or x !~ '^[A-Za-z0-9._:=+/-]{1,128}$')
$$;

create or replace function private.whatsapp_permitidas_validas(p text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(cardinality(p), 0) <= 12 and not exists (
    select 1 from unnest(p) x
     where x is null or x not in ('voto', 'mensagem', 'comentario', 'lidos', 'chamado', 'visita', 'chat',
                                  'atendimento', 'registro_visita', 'financeiro'))
$$;

create or replace function private.whatsapp_nomes_validos(p text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(cardinality(p), 0) <= 24 and not exists (select 1 from unnest(p) x where x is null or x !~ '^[a-z_]{3,40}$')
$$;

-- O CHECK roda com o papel de quem grava: o servidor (service role) precisa enxergar o esquema e executar os
-- validadores. Ninguém logado grava nestas tabelas.
revoke all on function private.whatsapp_refs_validas(jsonb), private.whatsapp_marcadores_validos(text[]), private.whatsapp_listas_validas(jsonb),
  private.whatsapp_ids_de_mensagem_validos(text[]), private.whatsapp_permitidas_validas(text[]), private.whatsapp_nomes_validos(text[])
  from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.whatsapp_refs_validas(jsonb), private.whatsapp_marcadores_validos(text[]), private.whatsapp_listas_validas(jsonb),
  private.whatsapp_ids_de_mensagem_validos(text[]), private.whatsapp_permitidas_validas(text[]), private.whatsapp_nomes_validos(text[])
  to service_role;

-- ---------------------------------------------------------------- o interruptor e os tetos por espaço

create table if not exists public.whatsapp_ia_config (
  workspace_id         uuid primary key references public.workspaces (id) on delete cascade,
  -- desligado: o bot de hoje. piloto: só as pessoas de `piloto`. admins: quem administra. equipe: todos (menos a escola).
  modo                 text not null default 'desligado' check (modo in ('desligado', 'piloto', 'admins', 'equipe')),
  piloto               uuid[] not null default '{}' check (cardinality(piloto) <= 50),
  -- Os preparar_* só montam plano com a escrita ligada.
  escrita              boolean not null default false,
  teto_usd_dia         numeric(8,2) not null default 10 check (teto_usd_dia >= 0),
  teto_usd_pessoa_dia  numeric(6,2) not null default 1 check (teto_usd_pessoa_dia >= 0),
  turnos_pessoa_hora   smallint not null default 20 check (turnos_pessoa_hora between 0 and 200),
  turnos_pessoa_dia    smallint not null default 60 check (turnos_pessoa_dia between 0 and 1000),
  leituras_detalhe_dia smallint not null default 40 check (leituras_detalhe_dia between 0 and 500),
  mensagens_dia        smallint not null default 10 check (mensagens_dia between 0 and 50),
  -- O disjuntor: 3 falhas seguidas em 10 min pausam o assistente por 10 min (chave e modelo, até alguém arrumar).
  falhas_seguidas      smallint not null default 0,
  pausada_ate          timestamptz,
  motivo_pausa         text check (motivo_pausa is null or char_length(motivo_pausa) <= 200),
  atualizado_por       uuid references public.profiles (id) on delete set null,
  atualizado_em        timestamptz not null default now()
);
alter table public.whatsapp_ia_config enable row level security;
revoke all on public.whatsapp_ia_config from anon;
revoke insert, update, delete, truncate, references, trigger on public.whatsapp_ia_config from authenticated;
grant select on public.whatsapp_ia_config to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'whatsapp_ia_config' and policyname = 'whatsapp_ia_config_select_admin') then
    create policy whatsapp_ia_config_select_admin on public.whatsapp_ia_config for select to authenticated
      using ((select private.workspace_role(workspace_id)) = 'admin');
  end if;
end $$;

-- ---------------------------------------------------------------- planos e perguntas

create table if not exists public.whatsapp_ia_planos (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  -- O plano fica preso à pessoa, ao número e ao papel de quando foi feito: a confirmação confere os três de novo.
  numero           text not null check (numero ~ '^[0-9]{10,15}$'),
  papel            text not null check (papel in ('admin', 'editor', 'colaborador', 'escola')),
  situacao         text not null default 'aberto' check (situacao in
                     ('pergunta', 'aberto', 'em_revisao', 'no_palacio', 'executando', 'executado', 'parcial', 'falhou',
                      'cancelado', 'substituido', 'vencido')),
  passos           jsonb not null default '[]'::jsonb
                     check (jsonb_typeof(passos) = 'array' and jsonb_array_length(passos) <= 8 and pg_column_size(passos) <= 24000),
  opcoes           text[] not null default '{}' check (private.whatsapp_marcadores_validos(opcoes)),
  permitidas       text[] not null default '{}' check (private.whatsapp_permitidas_validas(permitidas)),
  pedido_em_aberto text check (pedido_em_aberto is null or char_length(pedido_em_aberto) <= 300),
  -- sha-256 de { v, userId, workspaceId, passos } (lib/whatsapp/assistente/regras.ts, hashDoPlano).
  hash             text check (hash is null or hash ~ '^[0-9a-f]{64}$'),
  sensivel         boolean not null default false,
  -- As mensagens do WhatsApp que mostraram o plano (o plano e os lembretes): citar uma delas é citar o plano.
  mensagens        text[] not null default '{}' check (private.whatsapp_ids_de_mensagem_validos(mensagens)),
  entregue_em      timestamptz,
  resultado        jsonb not null default '[]'::jsonb check (jsonb_typeof(resultado) = 'array' and pg_column_size(resultado) <= 4000),
  redigido_em      timestamptz,
  criado_em        timestamptz not null default now(),
  expira_em        timestamptz not null,
  atualizado_em    timestamptz not null default now()
);
-- Um plano ou pergunta aberta por pessoa.
create unique index if not exists whatsapp_ia_planos_um_aberto on public.whatsapp_ia_planos (user_id)
  where situacao in ('pergunta', 'aberto', 'em_revisao');
create index if not exists whatsapp_ia_planos_pessoa_idx on public.whatsapp_ia_planos (user_id, criado_em desc);
create index if not exists whatsapp_ia_planos_faxina_idx on public.whatsapp_ia_planos (situacao, expira_em) where redigido_em is null;
create index if not exists whatsapp_ia_planos_espaco_idx on public.whatsapp_ia_planos (workspace_id, criado_em desc);
-- RLS ligado e nenhuma policy: só o service role (o servidor) lê e escreve.
alter table public.whatsapp_ia_planos enable row level security;
revoke all on public.whatsapp_ia_planos from anon, authenticated;

-- ---------------------------------------------------------------- memória curta: só marcadores

create table if not exists public.whatsapp_ia_memoria (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  refs            jsonb not null default '{}'::jsonb check (private.whatsapp_refs_validas(refs) and pg_column_size(refs) <= 8000),
  ordem           text[] not null default '{}' check (private.whatsapp_marcadores_validos(ordem)),
  listas          jsonb not null default '[]'::jsonb check (private.whatsapp_listas_validas(listas) and pg_column_size(listas) <= 4000),
  proximo         smallint not null default 1 check (proximo between 1 and 999),
  -- HMAC-SHA256 do último texto, cortado em 16 hex (a chave nunca vem ao banco): só para "já respondi isso".
  ultimo_texto    text check (ultimo_texto is null or ultimo_texto ~ '^[0-9a-f]{16}$'),
  ultimo_texto_em timestamptz,
  ocupado_ate     timestamptz,
  expira_em       timestamptz not null default now() + interval '30 minutes',
  atualizado_em   timestamptz not null default now()
);
alter table public.whatsapp_ia_memoria enable row level security;
revoke all on public.whatsapp_ia_memoria from anon, authenticated;

-- ---------------------------------------------------------------- uso: uma linha por turno, só números e nomes

create table if not exists public.whatsapp_ia_uso (
  id               bigint generated always as identity primary key,
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  user_id          uuid references public.profiles (id) on delete set null,
  criado_em        timestamptz not null default now(),
  desfecho         text not null default 'andamento' check (desfecho in
                     ('andamento', 'resposta', 'plano', 'pergunta', 'confirmado', 'recusa', 'erro', 'prazo', 'teto', 'cota', 'ocupado', 'repetida')),
  modelo           text check (modelo is null or char_length(modelo) <= 60),
  recuo            boolean not null default false,
  chamadas         smallint not null default 0 check (chamadas between 0 and 10),
  ferramentas      text[] not null default '{}' check (private.whatsapp_nomes_validos(ferramentas)),
  leituras_detalhe smallint not null default 0 check (leituras_detalhe between 0 and 50),
  entrada          integer not null default 0,
  cache_escrita    integer not null default 0,
  cache_lida       integer not null default 0,
  saida            integer not null default 0,
  custo_usd        numeric(10,5) not null default 0,
  ms               integer,
  stop_reason      text check (stop_reason is null or char_length(stop_reason) <= 30),
  categoria_recusa text check (categoria_recusa is null or char_length(categoria_recusa) <= 40),
  -- A classe do erro (RateLimitError, NotFoundError…); nunca texto da pessoa.
  erro             text check (erro is null or char_length(erro) <= 120),
  plano_id         uuid references public.whatsapp_ia_planos (id) on delete set null
);
create index if not exists whatsapp_ia_uso_pessoa_idx on public.whatsapp_ia_uso (user_id, criado_em desc);
create index if not exists whatsapp_ia_uso_espaco_idx on public.whatsapp_ia_uso (workspace_id, criado_em desc);
create index if not exists whatsapp_ia_uso_plano_idx on public.whatsapp_ia_uso (plano_id) where plano_id is not null;
alter table public.whatsapp_ia_uso enable row level security;
revoke all on public.whatsapp_ia_uso from anon;
revoke insert, update, delete, truncate, references, trigger on public.whatsapp_ia_uso from authenticated;
grant select on public.whatsapp_ia_uso to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'whatsapp_ia_uso' and policyname = 'whatsapp_ia_uso_select_admin') then
    create policy whatsapp_ia_uso_select_admin on public.whatsapp_ia_uso for select to authenticated
      using ((select private.workspace_role(workspace_id)) = 'admin');
  end if;
end $$;

-- ---------------------------------------------------------------- somas no SQL (ARQUITETURA §10.8)

create or replace function public.whatsapp_ia_gasto_desde(p_workspace_id uuid, p_desde timestamptz, p_user_id uuid default null)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(u.custo_usd), 0) from public.whatsapp_ia_uso u
   where u.workspace_id = p_workspace_id and u.criado_em >= p_desde and (p_user_id is null or u.user_id = p_user_id)
$$;
revoke all on function public.whatsapp_ia_gasto_desde(uuid, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_ia_gasto_desde(uuid, timestamptz, uuid) to service_role;

create or replace function public.whatsapp_ia_leituras_desde(p_user_id uuid, p_desde timestamptz)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(u.leituras_detalhe), 0)::int from public.whatsapp_ia_uso u where u.user_id = p_user_id and u.criado_em >= p_desde
$$;
revoke all on function public.whatsapp_ia_leituras_desde(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.whatsapp_ia_leituras_desde(uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------- a vez de cada pessoa (uma mensagem por vez no assistente)

create or replace function public.whatsapp_ia_tomar_vez(p_user_id uuid, p_workspace_id uuid, p_segundos int)
returns boolean language sql security definer set search_path = '' as $$
  with t as (
    insert into public.whatsapp_ia_memoria as m (user_id, workspace_id, ocupado_ate)
    values (p_user_id, p_workspace_id, now() + make_interval(secs => least(greatest(coalesce(p_segundos, 60), 5), 120)))
    on conflict (user_id) do update set ocupado_ate = excluded.ocupado_ate, atualizado_em = now()
      where m.ocupado_ate is null or m.ocupado_ate < now()
    returning 1)
  select exists (select 1 from t)
$$;
revoke all on function public.whatsapp_ia_tomar_vez(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.whatsapp_ia_tomar_vez(uuid, uuid, int) to service_role;

-- ---------------------------------------------------------------- o sha-256 do conteúdo de uma matéria

-- A versão (content_pieces.version) não serve de trava: reenviar para aprovação troca o texto sem mexer nela.
create or replace function private.whatsapp_hash_do_conteudo(p_content_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select encode(extensions.digest(convert_to(
           coalesce(c.title, '') || chr(31) || coalesce(c.subtitle, '') || chr(31) || coalesce(c.body, ''), 'UTF8'), 'sha256'), 'hex')
    from public.content_pieces c where c.id = p_content_id
$$;
revoke all on function private.whatsapp_hash_do_conteudo(uuid) from public, anon, authenticated;

create or replace function public.whatsapp_hash_do_conteudo(p_content_id uuid) returns text
language sql stable security definer set search_path = '' as $$ select private.whatsapp_hash_do_conteudo(p_content_id) $$;
revoke all on function public.whatsapp_hash_do_conteudo(uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_hash_do_conteudo(uuid) to service_role;

-- ---------------------------------------------------------------- o voto conferido

-- Trava a rodada e a linha do votante, e só então vota (vote_on_approval atualiza sem olhar a decisão anterior:
-- sem esta conferência, o voto do WhatsApp sobrescreveria o voto dado na tela).
create or replace function private.voto_conferido(p_approval_id uuid, p_decision text, p_comment text, p_hash_conteudo text)
returns text language plpgsql set search_path = '' as $$
declare
  v_workspace_id uuid;
  v_content_id uuid;
  v_decisao text;
begin
  select a.workspace_id, a.content_id into v_workspace_id, v_content_id
    from public.approvals a where a.id = p_approval_id and a.status = 'pending' for update;
  if v_workspace_id is null then
    raise exception 'Esta rodada já foi encerrada.' using errcode = 'WA003';
  end if;
  if not (select private.is_workspace_member(v_workspace_id)) then
    raise exception 'Sua conta usa a verificação em duas etapas ou perdeu o acesso: vote pelo Palácio.' using errcode = '42501';
  end if;
  select v.decision into v_decisao from public.approval_voters v
   where v.approval_id = p_approval_id and v.user_id = (select auth.uid()) for update;
  if v_decisao is null then
    raise exception 'Você não está entre as pessoas convidadas para aprovar este conteúdo.' using errcode = '42501';
  end if;
  if v_decisao <> 'pending' then
    raise exception 'Você já votou nesta rodada.' using errcode = 'WA001';
  end if;
  if p_hash_conteudo is null or p_hash_conteudo is distinct from private.whatsapp_hash_do_conteudo(v_content_id) then
    raise exception 'A matéria mudou depois do plano.' using errcode = 'WA002';
  end if;
  return public.vote_on_approval(p_approval_id, p_decision, p_comment);
end $$;
revoke all on function private.voto_conferido(uuid, text, text, text) from public, anon, authenticated;

-- Pelo WhatsApp (sessão simulada aal1: quem tem a verificação em duas etapas cai no 42501).
create or replace function public.whatsapp_votar_uma_vez(p_user_id uuid, p_approval_id uuid, p_decision text, p_comment text, p_hash_conteudo text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform private.como_quem_escreveu_no_whatsapp(p_user_id);
  return private.voto_conferido(p_approval_id, p_decision, p_comment, p_hash_conteudo);
end $$;
revoke all on function public.whatsapp_votar_uma_vez(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.whatsapp_votar_uma_vez(uuid, uuid, text, text, text) to service_role;

-- Pela sessão real (a página de confirmar no Palácio): vale o nível da sessão.
create or replace function public.votar_conferido(p_approval_id uuid, p_decision text, p_comment text, p_hash_conteudo text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sessão ausente.' using errcode = '42501';
  end if;
  return private.voto_conferido(p_approval_id, p_decision, p_comment, p_hash_conteudo);
end $$;
revoke all on function public.votar_conferido(uuid, text, text, text) from public, anon;
grant execute on function public.votar_conferido(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------- a mensagem direta em nome de quem escreveu no WhatsApp

create or replace function public.whatsapp_mensagem_direta(p_user_id uuid, p_workspace_id uuid, p_para uuid, p_corpo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_corpo text := btrim(coalesce(p_corpo, ''));
  v_id uuid;
begin
  perform private.como_quem_escreveu_no_whatsapp(p_user_id);
  -- Ativo, não escola e com a verificação em dia: a mesma régua da tela (is_workspace_member).
  if not private.is_workspace_member(p_workspace_id) then
    raise exception 'Sua conta usa a verificação em duas etapas ou não pode mandar mensagem por aqui: use o Palácio.' using errcode = '42501';
  end if;
  if p_para is null or p_para = p_user_id or not exists (
       select 1 from public.workspace_members m join public.profiles p on p.id = m.user_id
        where m.workspace_id = p_workspace_id and m.user_id = p_para and p.active) then
    raise exception 'Essa pessoa não está mais no espaço.' using errcode = 'P0001';
  end if;
  if char_length(v_corpo) < 1 or char_length(v_corpo) > 2000 then
    raise exception 'A mensagem pode ter até 2.000 caracteres.' using errcode = 'P0001';
  end if;
  -- A mesma trava da tela (sendDirectMessage): a mesma mensagem em 10 s é a mesma mensagem.
  select x.id into v_id from public.messages x
   where x.workspace_id = p_workspace_id and x.pauta_id is null and x.author_id = p_user_id and x.recipient_id = p_para
     and x.body = v_corpo and x.created_at > now() - interval '10 seconds'
   limit 1;
  if v_id is not null then
    return jsonb_build_object('id', v_id, 'nova', false);
  end if;
  insert into public.messages (workspace_id, pauta_id, author_id, recipient_id, body)
  values (p_workspace_id, null, p_user_id, p_para, v_corpo) returning id into v_id;
  return jsonb_build_object('id', v_id, 'nova', true);
end $$;
revoke all on function public.whatsapp_mensagem_direta(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.whatsapp_mensagem_direta(uuid, uuid, uuid, text) to service_role;

comment on table public.whatsapp_ia_config is
  'O interruptor do assistente do WhatsApp por espaço (modo, piloto, escrita, tetos e o disjuntor). Sem linha = desligado. A administração lê; só o servidor escreve.';
comment on table public.whatsapp_ia_planos is
  'Planos e perguntas do assistente do WhatsApp. Textos de ação redigidos ao sair de aberto. Só o servidor.';
comment on table public.whatsapp_ia_memoria is
  'Memória curta do assistente: só marcadores (tipo + id), a ordem da última lista, a trava e o HMAC do último texto. O CHECK recusa texto.';
comment on table public.whatsapp_ia_uso is
  'Uso do assistente do WhatsApp: uma linha por turno, só números, nomes de ferramenta e o desfecho. A administração lê; só o servidor escreve.';
