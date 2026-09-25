-- Trilha de auditoria pública.
--
-- Especificação: docs/auditoria-publica.md. Em resumo:
--   * schema "auditoria", fora da Data API, lido e escrito só por funções security definer;
--   * itens verificáveis (matérias no site, comunicados à imprensa, ofícios, certificados,
--     documentos e parcerias da transparência, canais oficiais), cada um com um código de
--     26 caracteres (128 bits, base32 de Crockford);
--   * eventos encadeados por hash em cada fluxo, só de acréscimo;
--   * lote diário: árvore de Merkle das folhas dos itens, hash das cabeças das cadeias e
--     compromisso encadeado ao lote anterior; a aplicação assina o manifesto (Ed25519) e
--     carimba o compromisso (OpenTimestamps e RFC 3161);
--   * ganchos nas tabelas de origem, que registram sem nunca derrubar a operação principal.
--
-- A trilha não guarda nome, e-mail, CPF, IP nem texto livre de pessoa. O ator de cada evento é
-- o id interno da conta (pseudônimo, nunca exposto); o nome de quem recebeu um certificado só
-- entra no hash do certificado, e a consulta pública o lê da tabela de origem.

create schema if not exists auditoria;
revoke all on schema auditoria from public, anon, authenticated, service_role;
comment on schema auditoria is 'Trilha de auditoria pública (docs/auditoria-publica.md). Só acréscimos; acesso por funções.';

-- ---------------------------------------------------------------- utilitários

create or replace function auditoria.sha256_hex(p text)
returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex')
$$;

-- JSON com as chaves em ordem (bytes), sem espaços, recursivo. É o "conteúdo canônico" dos itens.
create or replace function auditoria.json_canonico(p jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v text;
begin
  if p is null then return null; end if;
  case jsonb_typeof(p)
    when 'object' then
      select '{' || coalesce(string_agg(to_jsonb(e.chave)::text || ':' || auditoria.json_canonico(e.valor), ',' order by e.chave collate "C"), '') || '}'
        into v from jsonb_each(p) as e(chave, valor);
    when 'array' then
      select '[' || coalesce(string_agg(auditoria.json_canonico(a.valor), ',' order by a.pos), '') || ']'
        into v from jsonb_array_elements(p) with ordinality as a(valor, pos);
    else
      v := p::text;
  end case;
  return v;
end $$;

-- 16 bytes aleatórios em base32 de Crockford: 26 caracteres, os 2 últimos bits em zero
-- (por isso o último caractere é sempre um de 0 4 8 C G M R W).
create or replace function auditoria.gerar_codigo()
returns text language plpgsql volatile set search_path = '' as $$
declare
  v_bits bit varying := ('x' || encode(extensions.gen_random_bytes(16), 'hex'))::bit(128) || B'00';
  v_alfabeto constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_codigo text := '';
begin
  for i in 0..25 loop
    v_codigo := v_codigo || substr(v_alfabeto, substring(v_bits from i * 5 + 1 for 5)::bit(5)::integer + 1, 1);
  end loop;
  return v_codigo;
end $$;

create or replace function auditoria.classe_do_tipo(p_tipo text)
returns text language sql immutable set search_path = '' as $$
  select case p_tipo
    when 'oficio' then 'V'
    when 'certificado' then 'C'
    when 'materia' then 'P' when 'comunicado' then 'P' when 'documento' then 'P' when 'parceria' then 'P' when 'canais' then 'P'
  end
$$;

create or replace function auditoria.fluxo_do_tipo(p_tipo text)
returns text language sql immutable set search_path = '' as $$
  select case p_tipo
    when 'materia' then 'F13' when 'oficio' then 'F14' when 'certificado' then 'F15'
    when 'documento' then 'F16' when 'parceria' then 'F16' when 'canais' then 'F17' when 'comunicado' then 'F18'
  end
$$;

-- "depois" de um evento: objeto pequeno, chaves de uma lista fechada, valores escalares.
create or replace function auditoria.depois_valido(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and length(p::text) <= 500
    and not exists (
      select 1 from jsonb_each(p) as e(chave, valor)
      where e.chave not in ('estado', 'versao', 'tipo', 'classe', 'motivo', 'itens')
         or jsonb_typeof(e.valor) not in ('string', 'number', 'boolean')
    )
  )
$$;

-- ---------------------------------------------------------------- fluxos

create table if not exists auditoria.fluxos (
  codigo        text primary key check (codigo ~ '^F[0-9]{2}$'),
  nome_interno  text not null unique,
  descricao     text not null,
  dado_sensivel boolean not null default false,
  ativo         boolean not null default true
);

-- F01 a F12 são do escopo da intranet (numeração reservada, inativos aqui).
insert into auditoria.fluxos (codigo, nome_interno, descricao, dado_sensivel, ativo) values
  ('F01', 'autorizacao.documento',   'Reservado (intranet): trâmite de documento com etapas encadeadas e homologação.', false, false),
  ('F02', 'autorizacao.leve',        'Reservado (intranet): trâmite leve sem arquivo.', false, false),
  ('F03', 'assinatura',              'Reservado (intranet): aceite interno, assinatura gov.br e conferência do validador do ITI.', false, false),
  ('F04', 'documento.versao',        'Reservado (intranet): versão, publicação, download e eliminação na biblioteca.', false, false),
  ('F05', 'mural.publicacao',        'Reservado (intranet): publicação, aprovação e confirmação de leitura no mural.', false, false),
  ('F06', 'imagem.autorizacao',      'Reservado (intranet): concessão, revogação e uso publicado de autorização de imagem.', false, false),
  ('F07', 'identidade.cadastro',     'Reservado (intranet): identidade, vínculo, papel, delegação, convite e consentimento.', false, false),
  ('F08', 'saude.ficha',             'Reservado (intranet): dados de saúde de voluntário; nunca aparece em página pública.', true, false),
  ('F09', 'editorial',               'Reservado (intranet): ponte do activity_log da Redação.', false, false),
  ('F10', 'lgpd.titular',            'Reservado (intranet): exportação, anonimização e pedidos do titular.', false, false),
  ('F11', 'contato.diretorio',       'Reservado (intranet): consulta e exportação do diretório de contato.', false, false),
  ('F12', 'mural.relatorio_nominal', 'Reservado (intranet): exportação nominal do relatório de leitura do mural.', false, false),
  ('F13', 'publicacao.site',         'Matérias publicadas no site pela Redação.', false, true),
  ('F14', 'oficio',                  'Ofícios assinados e cancelados.', false, true),
  ('F15', 'certificado',             'Certificados de curso emitidos, revogados e retirados.', false, true),
  ('F16', 'transparencia',           'Documentos e parcerias do portal de transparência.', false, true),
  ('F17', 'canais_oficiais',         'Versões da página de canais oficiais.', false, true),
  ('F18', 'imprensa',                'Comunicados enviados à imprensa.', false, true),
  ('F19', 'auditoria.lotes',         'Verificação diária da cadeia e fechamento dos lotes.', false, true)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------- itens

create table if not exists auditoria.itens (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique default auditoria.gerar_codigo()
                      check (codigo ~ '^[0-9A-HJKMNP-TV-Z]{25}[048CGMRW]$'),
  -- Código já impresso num documento que existia antes da trilha: ofício (32 hex) ou certificado (XXXX-XXXX).
  codigo_externo    text unique
                      check (codigo_externo is null or codigo_externo ~ '^([0-9a-f]{32}|[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4})$'),
  classe            text not null check (classe in ('P', 'V', 'C')),
  tipo              text not null check (tipo in ('materia', 'comunicado', 'oficio', 'certificado', 'documento', 'parceria', 'canais')),
  fluxo             text not null references auditoria.fluxos (codigo) on delete restrict,
  workspace_id      uuid not null references public.workspaces (id) on delete restrict,
  -- Linha de origem. Sem chave estrangeira: a origem pode ser apagada, o item fica.
  referencia_id     uuid,
  versao            integer not null default 1 check (versao >= 1),
  hash_conteudo     text not null check (hash_conteudo ~ '^[0-9a-f]{64}$'),
  -- SHA-256 do arquivo que a pessoa tem na mão, quando não é o próprio conteúdo canônico
  -- (PDF do portal, PDF assinado no gov.br). O conteúdo canônico ou o manifesto o incluem.
  hash_arquivo      text check (hash_arquivo is null or hash_arquivo ~ '^[0-9a-f]{64}$'),
  nonce             bytea not null default extensions.gen_random_bytes(16) check (octet_length(nonce) = 16),
  titulo_publico    text check (titulo_publico is null or length(titulo_publico) <= 300),
  url_publica       text check (url_publica is null or (url_publica ~ '^https://' and length(url_publica) <= 500)),
  conteudo_canonico text check (conteudo_canonico is null or length(conteudo_canonico) <= 200000),
  substitui_item_id uuid references auditoria.itens (id) on delete restrict,
  registrado_em     timestamptz not null default clock_timestamp(),
  constraint itens_classe_do_tipo check (classe = auditoria.classe_do_tipo(tipo)),
  constraint itens_fluxo_do_tipo check (fluxo = auditoria.fluxo_do_tipo(tipo)),
  constraint itens_so_publico_tem_texto check (classe = 'P' or (titulo_publico is null and url_publica is null and conteudo_canonico is null)),
  constraint itens_publico_confere check (classe <> 'P' or (conteudo_canonico is not null and hash_conteudo = auditoria.sha256_hex(conteudo_canonico)))
);
create index if not exists itens_hash_conteudo_idx on auditoria.itens (hash_conteudo);
create index if not exists itens_hash_arquivo_idx on auditoria.itens (hash_arquivo) where hash_arquivo is not null;
create index if not exists itens_referencia_idx on auditoria.itens (tipo, referencia_id, versao desc);
create index if not exists itens_substitui_idx on auditoria.itens (substitui_item_id) where substitui_item_id is not null;
create index if not exists itens_registrado_idx on auditoria.itens (registrado_em);
create index if not exists itens_workspace_idx on auditoria.itens (workspace_id, registrado_em desc);

-- ---------------------------------------------------------------- eventos (a cadeia)

create table if not exists auditoria.eventos (
  seq            bigint generated always as identity primary key,
  fluxo          text not null references auditoria.fluxos (codigo) on delete restrict,
  ordem_no_fluxo bigint not null,
  ocorrido_em    timestamptz not null,
  workspace_id   uuid references public.workspaces (id) on delete restrict,
  item_id        uuid references auditoria.itens (id) on delete restrict,
  entidade_tipo  text not null check (entidade_tipo ~ '^[a-z_]{2,40}$'),
  entidade_id    uuid,
  -- Sem chave estrangeira: sobrevive à anonimização da conta.
  ator_id        uuid,
  papel          text not null check (papel in ('admin', 'editor', 'colaborador', 'sistema')),
  acao           text not null check (acao in (
                   'item.registrado', 'item.substituido', 'item.revogado', 'item.retirado',
                   'auditoria.verificacao_ok', 'auditoria.verificacao_falhou', 'auditoria.lote_fechado')),
  depois         jsonb check (auditoria.depois_valido(depois)),
  hash_arquivo   text check (hash_arquivo is null or hash_arquivo ~ '^[0-9a-f]{64}$'),
  hash_anterior  text not null check (hash_anterior ~ '^[0-9a-f]{64}$'),
  hash_linha     text not null check (hash_linha ~ '^[0-9a-f]{64}$'),
  unique (fluxo, ordem_no_fluxo)
);
create index if not exists eventos_item_idx on auditoria.eventos (item_id, ordem_no_fluxo desc) where item_id is not null;
create index if not exists eventos_workspace_idx on auditoria.eventos (workspace_id) where workspace_id is not null;

-- O hash de uma linha. "seq" fica de fora (restaurar um dump não pode quebrar a cadeia) e todo
-- campo anulável passa por coalesce (concat_ws pula nulos e deslocaria os campos).
create or replace function auditoria.hash_do_evento(e auditoria.eventos)
returns text language sql stable set search_path = '' as $$
  select encode(sha256(convert_to(concat_ws('|',
    e.ordem_no_fluxo::text,
    to_char(e.ocorrido_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    coalesce(e.workspace_id::text, ''), e.fluxo, coalesce(e.item_id::text, ''),
    e.entidade_tipo, coalesce(e.entidade_id::text, ''), coalesce(e.ator_id::text, ''),
    e.papel, e.acao, coalesce(e.depois::text, ''), coalesce(e.hash_arquivo, ''),
    e.hash_anterior), 'UTF8')), 'hex')
$$;

create or replace function auditoria.encadear_evento()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_ordem bigint;
  v_anterior text;
begin
  -- Uma fila por fluxo: quem chega depois espera e lê a ponta já gravada.
  perform pg_advisory_xact_lock(hashtext('auditoria:fluxo:' || new.fluxo));
  select e.ordem_no_fluxo, e.hash_linha into v_ordem, v_anterior
    from auditoria.eventos e where e.fluxo = new.fluxo
   order by e.ordem_no_fluxo desc limit 1;
  new.ordem_no_fluxo := coalesce(v_ordem, 0) + 1;
  new.hash_anterior := coalesce(v_anterior, repeat('0', 64));
  new.ocorrido_em := clock_timestamp();
  new.hash_linha := auditoria.hash_do_evento(new);
  return new;
end $$;

drop trigger if exists eventos_encadear on auditoria.eventos;
create trigger eventos_encadear before insert on auditoria.eventos
  for each row execute function auditoria.encadear_evento();

-- ---------------------------------------------------------------- verificações, lotes, limites, falhas

create table if not exists auditoria.verificacoes (
  id                      bigint generated always as identity primary key,
  executado_em            timestamptz not null default clock_timestamp(),
  origem                  text not null check (origem in ('cron', 'manual', 'script')),
  ok                      boolean not null,
  eventos                 integer not null,
  fluxos                  jsonb not null,
  lotes                   integer not null,
  lotes_ok                boolean not null,
  primeiro_lote_com_falha date,
  duracao_ms              integer not null
);

create table if not exists auditoria.lotes (
  dia                  date primary key,
  fechado_em           timestamptz not null default clock_timestamp(),
  itens                integer not null check (itens >= 0),
  raiz                 text not null check (raiz ~ '^[0-9a-f]{64}$'),
  cabecas              text not null check (cabecas ~ '^[0-9a-f]{64}$'),
  -- Ponta de cada cadeia no fechamento (interno: não vai ao manifesto público).
  cabecas_detalhe      jsonb not null,
  compromisso_anterior text not null check (compromisso_anterior ~ '^[0-9a-f]{64}$'),
  compromisso          text not null unique check (compromisso ~ '^[0-9a-f]{64}$'),
  manifesto            text not null,
  hash_manifesto       text not null check (hash_manifesto ~ '^[0-9a-f]{64}$'),
  assinatura           text check (assinatura is null or assinatura ~ '^[A-Za-z0-9+/]{86}==$'),
  chave_id             text check (chave_id is null or chave_id ~ '^[0-9a-f]{16}$'),
  assinado_em          timestamptz,
  ots                  bytea,
  ots_estado           text not null default 'pendente' check (ots_estado in ('pendente', 'enviado', 'confirmado')),
  ots_enviado_em       timestamptz,
  bloco                integer,
  ots_confirmado_em    timestamptz,
  tsr                  bytea,
  tsr_em               timestamptz,
  publicado_em         timestamptz,
  tentativas           integer not null default 0,
  ultimo_erro          text check (ultimo_erro is null or length(ultimo_erro) <= 500),
  proxima_tentativa_em timestamptz,
  constraint lotes_assinatura_inteira check ((assinatura is null) = (chave_id is null) and (assinatura is null) = (assinado_em is null)),
  constraint lotes_tsr_inteiro check ((tsr is null) = (tsr_em is null)),
  constraint lotes_ots_enviado check (ots_estado = 'pendente' or (ots is not null and ots_enviado_em is not null)),
  constraint lotes_ots_confirmado check (ots_estado <> 'confirmado' or (bloco is not null and ots_confirmado_em is not null))
);

create table if not exists auditoria.lote_itens (
  dia     date not null references auditoria.lotes (dia) on delete restrict,
  posicao integer not null check (posicao >= 1),
  item_id uuid not null unique references auditoria.itens (id) on delete restrict,
  folha   text not null check (folha ~ '^[0-9a-f]{64}$'),
  primary key (dia, posicao)
);

-- Contador da consulta pública (fora da trilha, pode ser limpo). A chave é um HMAC de IP e rota
-- calculado na aplicação com segredo fora do banco.
create table if not exists auditoria.consultas_limite (
  chave    text not null check (chave ~ '^[0-9a-f]{64}$'),
  janela   timestamptz not null,
  contagem integer not null default 0,
  primary key (chave, janela)
);

-- O que os ganchos não conseguiram registrar. O cron diário tenta de novo e reporta.
create table if not exists auditoria.falhas (
  id            bigint generated always as identity primary key,
  ocorrido_em   timestamptz not null default clock_timestamp(),
  origem        text not null check (length(origem) <= 80),
  referencia_id uuid,
  erro          text not null check (length(erro) <= 500)
);

-- ---------------------------------------------------------------- só acréscimos

create or replace function auditoria.proibir_mudanca()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'A trilha de auditoria só aceita acréscimos (% em %).', tg_op, tg_table_name using errcode = 'P0001';
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['itens', 'eventos', 'verificacoes', 'lote_itens'] loop
    execute format('drop trigger if exists %1$s_so_acrescimo on auditoria.%1$s', t);
    execute format('create trigger %1$s_so_acrescimo before update or delete on auditoria.%1$s for each row execute function auditoria.proibir_mudanca()', t);
    execute format('drop trigger if exists %1$s_sem_truncate on auditoria.%1$s', t);
    execute format('create trigger %1$s_sem_truncate before truncate on auditoria.%1$s for each statement execute function auditoria.proibir_mudanca()', t);
  end loop;
end $$;

-- Lote: o conteúdo nunca muda; assinatura e carimbo RFC 3161 só passam de vazio a preenchido; o
-- .ots só evolui até a confirmação no Bitcoin; controle de fila e publicação mudam à vontade.
create or replace function auditoria.guardar_lote()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception 'Lote fechado não se apaga.' using errcode = 'P0001';
  end if;
  if new.dia is distinct from old.dia or new.fechado_em is distinct from old.fechado_em or new.itens is distinct from old.itens
     or new.raiz is distinct from old.raiz or new.cabecas is distinct from old.cabecas or new.cabecas_detalhe is distinct from old.cabecas_detalhe
     or new.compromisso_anterior is distinct from old.compromisso_anterior or new.compromisso is distinct from old.compromisso
     or new.manifesto is distinct from old.manifesto or new.hash_manifesto is distinct from old.hash_manifesto then
    raise exception 'O conteúdo de um lote fechado não muda.' using errcode = 'P0001';
  end if;
  if old.assinatura is not null and (new.assinatura is distinct from old.assinatura or new.chave_id is distinct from old.chave_id
     or new.assinado_em is distinct from old.assinado_em) then
    raise exception 'O lote já foi assinado.' using errcode = 'P0001';
  end if;
  if old.tsr is not null and (new.tsr is distinct from old.tsr or new.tsr_em is distinct from old.tsr_em) then
    raise exception 'O lote já tem carimbo de tempo.' using errcode = 'P0001';
  end if;
  if old.ots_estado = 'confirmado' and (new.ots is distinct from old.ots or new.ots_estado is distinct from old.ots_estado
     or new.bloco is distinct from old.bloco or new.ots_confirmado_em is distinct from old.ots_confirmado_em) then
    raise exception 'O carimbo no Bitcoin já foi confirmado.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists lotes_guarda on auditoria.lotes;
create trigger lotes_guarda before update or delete on auditoria.lotes
  for each row execute function auditoria.guardar_lote();
drop trigger if exists lotes_sem_truncate on auditoria.lotes;
create trigger lotes_sem_truncate before truncate on auditoria.lotes
  for each statement execute function auditoria.proibir_mudanca();

alter table auditoria.fluxos enable row level security;
alter table auditoria.itens enable row level security;
alter table auditoria.eventos enable row level security;
alter table auditoria.verificacoes enable row level security;
alter table auditoria.lotes enable row level security;
alter table auditoria.lote_itens enable row level security;
alter table auditoria.consultas_limite enable row level security;
alter table auditoria.falhas enable row level security;

-- ---------------------------------------------------------------- estado e registro

-- vigente, substituido, revogado ou retirado: o evento de item mais recente decide.
create or replace function auditoria.estado_item(p_item uuid)
returns table (estado text, em timestamptz) language sql stable set search_path = '' as $$
  select case e.acao
           when 'item.substituido' then 'substituido'
           when 'item.revogado' then 'revogado'
           when 'item.retirado' then 'retirado'
           else 'vigente'
         end,
         e.ocorrido_em
    from auditoria.eventos e
   where e.item_id = p_item
     and e.acao in ('item.registrado', 'item.substituido', 'item.revogado', 'item.retirado')
   order by e.ordem_no_fluxo desc
   limit 1
$$;

-- Quem age: a sessão, ou — em ação do servidor com a chave de serviço, que não tem sessão — a
-- conta que a função pública informou em auditoria.ator (set_config local à transação).
create or replace function auditoria.ator_atual()
returns uuid language sql stable set search_path = '' as $$
  select coalesce((select auth.uid()), nullif(current_setting('auditoria.ator', true), '')::uuid)
$$;

-- Papel de quem age no espaço, sem a exigência de verificação em duas etapas (aqui é registro,
-- não autorização). Sem ninguém, ou fora do espaço, é o sistema.
create or replace function auditoria.papel_atual(p_workspace uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((
    select m.role from public.workspace_members m
     where m.workspace_id = p_workspace and m.user_id = auditoria.ator_atual()
     limit 1), 'sistema')
$$;

-- Registra um item (e o evento "item.registrado") ou devolve o que já existe:
--   * mesmo conteúdo do item vigente da mesma origem: devolve o existente, nada é gravado;
--   * origem revogada: devolve o revogado (revogação é final);
--   * item público com conteúdo novo, ou que tinha sido retirado: nova versão, e o anterior
--     recebe "item.substituido";
--   * ofício ou certificado com outro conteúdo: erro (não deveria acontecer; vira falha).
create or replace function auditoria.registrar_item(
  p_workspace uuid,
  p_tipo text,
  p_referencia uuid,
  p_hash text,
  p_titulo text default null,
  p_url text default null,
  p_conteudo text default null,
  p_codigo_externo text default null,
  p_hash_arquivo text default null,
  p_ator uuid default null,
  p_papel text default 'sistema'
) returns auditoria.itens language plpgsql security definer set search_path = '' as $$
declare
  v_classe text := auditoria.classe_do_tipo(p_tipo);
  v_hash text := lower(p_hash);
  v_ultimo auditoria.itens;
  v_estado text;
  v_novo auditoria.itens;
begin
  if v_classe is null then
    raise exception 'Tipo de item desconhecido: %.', p_tipo using errcode = 'P0001';
  end if;
  if v_classe = 'P' then
    if p_conteudo is null then
      raise exception 'Item público precisa do conteúdo canônico.' using errcode = 'P0001';
    end if;
    v_hash := auditoria.sha256_hex(p_conteudo);
    if p_hash is not null and lower(p_hash) <> v_hash then
      raise exception 'O hash informado não corresponde ao conteúdo.' using errcode = 'P0001';
    end if;
  end if;
  if v_hash is null or v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Hash inválido.' using errcode = 'P0001';
  end if;

  if p_referencia is not null then
    perform pg_advisory_xact_lock(hashtext('auditoria:item:' || p_tipo || ':' || p_referencia::text));
    select * into v_ultimo from auditoria.itens i
     where i.tipo = p_tipo and i.referencia_id = p_referencia
     order by i.versao desc limit 1;
    if v_ultimo.id is not null then
      v_estado := coalesce((select s.estado from auditoria.estado_item(v_ultimo.id) s), 'vigente');
      if v_estado = 'revogado' then return v_ultimo; end if;
      if v_estado = 'vigente' and v_ultimo.hash_conteudo = v_hash then return v_ultimo; end if;
      if v_classe <> 'P' then
        raise exception 'Documento já registrado na trilha com outro conteúdo (%).', v_ultimo.codigo using errcode = 'P0001';
      end if;
    end if;
  end if;

  insert into auditoria.itens (codigo_externo, classe, tipo, fluxo, workspace_id, referencia_id, versao, hash_conteudo,
                               hash_arquivo, titulo_publico, url_publica, conteudo_canonico, substitui_item_id)
  values (nullif(p_codigo_externo, ''), v_classe, p_tipo, auditoria.fluxo_do_tipo(p_tipo), p_workspace, p_referencia,
          coalesce(v_ultimo.versao, 0) + 1, v_hash, lower(nullif(p_hash_arquivo, '')),
          case when v_classe = 'P' then left(nullif(btrim(p_titulo), ''), 300) end,
          case when v_classe = 'P' and p_url ~ '^https://' and length(p_url) <= 500 then p_url end,
          case when v_classe = 'P' then p_conteudo end,
          v_ultimo.id)
  returning * into v_novo;

  insert into auditoria.eventos (fluxo, workspace_id, item_id, entidade_tipo, entidade_id, ator_id, papel, acao, depois, hash_arquivo)
  values (v_novo.fluxo, v_novo.workspace_id, v_novo.id, v_novo.tipo, v_novo.referencia_id, p_ator, coalesce(p_papel, 'sistema'),
          'item.registrado', jsonb_build_object('classe', v_novo.classe, 'tipo', v_novo.tipo, 'versao', v_novo.versao), v_novo.hash_conteudo);

  if v_ultimo.id is not null then
    insert into auditoria.eventos (fluxo, workspace_id, item_id, entidade_tipo, entidade_id, ator_id, papel, acao, depois)
    values (v_ultimo.fluxo, v_ultimo.workspace_id, v_ultimo.id, v_ultimo.tipo, v_ultimo.referencia_id, p_ator, coalesce(p_papel, 'sistema'),
            'item.substituido', jsonb_build_object('motivo', 'substituicao', 'versao', v_novo.versao));
  end if;
  return v_novo;
end $$;

-- Revoga ou retira um item vigente. Devolve false (sem gravar) se ele já não estava vigente.
create or replace function auditoria.registrar_evento_item(
  p_item uuid,
  p_acao text,
  p_motivo text,
  p_ator uuid default null,
  p_papel text default 'sistema'
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v auditoria.itens;
begin
  if p_acao not in ('item.revogado', 'item.retirado') then
    raise exception 'Ação inválida: %.', p_acao using errcode = 'P0001';
  end if;
  if p_motivo not in ('erro_material', 'decisao_administrativa', 'pedido_do_titular', 'retirado_do_ar', 'outro') then
    raise exception 'Motivo inválido: %.', p_motivo using errcode = 'P0001';
  end if;
  select * into v from auditoria.itens where id = p_item;
  if v.id is null then
    raise exception 'Item não encontrado.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('auditoria:item:' || v.tipo || ':' || coalesce(v.referencia_id, v.id)::text));
  if coalesce((select s.estado from auditoria.estado_item(v.id) s), 'vigente') <> 'vigente' then
    return false;
  end if;
  insert into auditoria.eventos (fluxo, workspace_id, item_id, entidade_tipo, entidade_id, ator_id, papel, acao, depois)
  values (v.fluxo, v.workspace_id, v.id, v.tipo, v.referencia_id, p_ator, coalesce(p_papel, 'sistema'), p_acao,
          jsonb_build_object('motivo', p_motivo));
  return true;
end $$;

-- Item mais recente de uma origem.
create or replace function auditoria.ultimo_item(p_tipo text, p_referencia uuid)
returns auditoria.itens language sql stable set search_path = '' as $$
  select * from auditoria.itens i where i.tipo = p_tipo and i.referencia_id = p_referencia order by i.versao desc limit 1
$$;

-- ---------------------------------------------------------------- Merkle

-- Pares sha256(esquerda || direita) a cada nível; o nó ímpar do fim sobe sem hash.
create or replace function auditoria.raiz_merkle(p_folhas bytea[])
returns bytea language plpgsql immutable set search_path = '' as $$
declare
  v_nivel bytea[] := p_folhas;
  v_prox bytea[];
  v_n integer;
  i integer;
begin
  if coalesce(array_length(v_nivel, 1), 0) = 0 then return null; end if;
  while array_length(v_nivel, 1) > 1 loop
    v_n := array_length(v_nivel, 1);
    v_prox := '{}';
    i := 1;
    while i <= v_n loop
      if i < v_n then
        v_prox := array_append(v_prox, sha256(v_nivel[i] || v_nivel[i + 1]));
      else
        v_prox := array_append(v_prox, v_nivel[i]);
      end if;
      i := i + 2;
    end loop;
    v_nivel := v_prox;
  end loop;
  return v_nivel[1];
end $$;

-- Caminho da folha p_posicao (1 = primeira) até a raiz: lista de {lado, hash}; nível em que o
-- nó sobe sozinho não entra.
create or replace function auditoria.caminho_merkle(p_folhas bytea[], p_posicao integer)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_nivel bytea[] := p_folhas;
  v_prox bytea[];
  v_pos integer := p_posicao;
  v_caminho jsonb := '[]';
  v_n integer;
  i integer;
begin
  if p_posicao < 1 or p_posicao > coalesce(array_length(p_folhas, 1), 0) then return null; end if;
  while array_length(v_nivel, 1) > 1 loop
    v_n := array_length(v_nivel, 1);
    if v_pos % 2 = 1 then
      if v_pos < v_n then
        v_caminho := v_caminho || jsonb_build_array(jsonb_build_object('lado', 'direita', 'hash', encode(v_nivel[v_pos + 1], 'hex')));
      end if;
    else
      v_caminho := v_caminho || jsonb_build_array(jsonb_build_object('lado', 'esquerda', 'hash', encode(v_nivel[v_pos - 1], 'hex')));
    end if;
    v_prox := '{}';
    i := 1;
    while i <= v_n loop
      if i < v_n then
        v_prox := array_append(v_prox, sha256(v_nivel[i] || v_nivel[i + 1]));
      else
        v_prox := array_append(v_prox, v_nivel[i]);
      end if;
      i := i + 2;
    end loop;
    v_nivel := v_prox;
    v_pos := (v_pos + 1) / 2;
  end loop;
  return v_caminho;
end $$;

create or replace function auditoria.folha(p_hash_conteudo text, p_nonce bytea)
returns bytea language sql immutable set search_path = '' as $$
  select sha256(decode(p_hash_conteudo, 'hex') || p_nonce)
$$;

create or replace function auditoria.hash_das_cabecas(p jsonb)
returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(coalesce(string_agg(
           (c ->> 'fluxo') || ':' || (c ->> 'ordem') || ':' || (c ->> 'hash'), E'\n' order by (c ->> 'fluxo') collate "C"), ''), 'UTF8')), 'hex')
    from jsonb_array_elements(p) c
$$;

create or replace function auditoria.manifesto_do_lote(p_dia date, p_raiz text, p_cabecas text, p_anterior text, p_compromisso text)
returns text language sql immutable set search_path = '' as $$
  select format('{"anterior":"%s","cabecas":"%s","compromisso":"%s","dia":"%s","origem":"cruzvermelhariodejaneiro.org","raiz":"%s","versao":1}',
                p_anterior, p_cabecas, p_compromisso, to_char(p_dia, 'YYYY-MM-DD'), p_raiz)
$$;

create or replace function auditoria.compromisso(p_raiz text, p_cabecas text, p_anterior text)
returns text language sql immutable set search_path = '' as $$
  select encode(sha256(decode(p_raiz, 'hex') || decode(p_cabecas, 'hex') || decode(p_anterior, 'hex')), 'hex')
$$;

-- ---------------------------------------------------------------- consulta pública

-- Aceita o código de 26 caracteres (com ou sem hífens e espaços; O vira 0, I e L viram 1), o do
-- ofício (32 hex) e o do certificado (XXXX-XXXX).
create or replace function auditoria.item_por_codigo(p_codigo text)
returns auditoria.itens language plpgsql stable set search_path = '' as $$
declare
  v text := upper(regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g'));
  r auditoria.itens;
begin
  if length(v) > 64 then return r; end if;
  if v ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$' then
    select * into r from auditoria.itens where codigo_externo = v;
  elsif v ~ '^[0-9A-F]{32}$' then
    select * into r from auditoria.itens where codigo_externo = lower(v);
  else
    v := translate(replace(v, '-', ''), 'OIL', '011');
    if v ~ '^[0-9A-HJKMNP-TV-Z]{25}[048CGMRW]$' then
      select * into r from auditoria.itens where codigo = v;
    end if;
  end if;
  return r;
end $$;

-- A projeção pública de um item (docs/auditoria-publica.md §3.4). Nunca expõe fluxo, ator,
-- papel, posição na cadeia, contagens nem motivo em texto livre.
create or replace function auditoria.projecao(p_item auditoria.itens)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_estado text;
  v_estado_em timestamptz;
  v_sucessor auditoria.itens;
  v_lote auditoria.lotes;
  v_verificacao auditoria.verificacoes;
  v_certificado public.certificados;
  v_publico boolean := p_item.classe = 'P';
  v_res jsonb;
begin
  select s.estado, s.em into v_estado, v_estado_em from auditoria.estado_item(p_item.id) s;
  v_estado := coalesce(v_estado, 'vigente');
  if v_estado = 'substituido' then
    select * into v_sucessor from auditoria.itens where substitui_item_id = p_item.id order by versao desc limit 1;
  end if;
  select * into v_lote from auditoria.lotes l where l.dia = (select li.dia from auditoria.lote_itens li where li.item_id = p_item.id);
  select * into v_verificacao from auditoria.verificacoes order by id desc limit 1;

  v_res := jsonb_build_object(
    'encontrado', true,
    'codigo', p_item.codigo,
    'classe', p_item.classe,
    'tipo', p_item.tipo,
    'versao', p_item.versao,
    'hash', p_item.hash_conteudo,
    'hash_arquivo', p_item.hash_arquivo,
    'registrado_em', case when v_publico then to_jsonb(p_item.registrado_em)
                          else to_jsonb(to_char(p_item.registrado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')) end,
    'estado', v_estado,
    'estado_em', case when v_estado = 'vigente' then null
                      when v_publico then to_jsonb(v_estado_em)
                      else to_jsonb(to_char(v_estado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')) end,
    'substituido_por', case when v_sucessor.id is not null
                            then jsonb_build_object('codigo', v_sucessor.codigo, 'url', v_sucessor.url_publica, 'versao', v_sucessor.versao) end,
    'titulo', p_item.titulo_publico,
    'url', p_item.url_publica,
    'certificado', null,
    'lote', case when v_lote.dia is not null then jsonb_build_object(
              'dia', v_lote.dia,
              'compromisso', v_lote.compromisso,
              'assinado', v_lote.assinatura is not null,
              'chave_id', v_lote.chave_id,
              'ots', v_lote.ots is not null,
              'bitcoin', jsonb_build_object('confirmado', v_lote.ots_estado = 'confirmado', 'bloco', v_lote.bloco),
              'tsa', v_lote.tsr is not null) end,
    'cadeia', case when v_verificacao.id is not null
                   then jsonb_build_object('integra', v_verificacao.ok, 'verificada_em', v_verificacao.executado_em) end
  );

  if p_item.classe = 'C' and p_item.referencia_id is not null and v_estado <> 'retirado' then
    select * into v_certificado from public.certificados where id = p_item.referencia_id;
    if v_certificado.id is not null then
      v_res := v_res || jsonb_build_object('certificado', jsonb_build_object(
        'nome', v_certificado.nome,
        'curso', v_certificado.curso_titulo,
        'carga_horaria', trim_scale(v_certificado.carga_horaria),
        'emitido_em', to_char(v_certificado.emitido_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
        'valido_ate', to_char(v_certificado.valido_ate, 'YYYY-MM-DD')));
    end if;
  end if;
  return v_res;
end $$;

create or replace function public.auditoria_consultar(p_codigo text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v auditoria.itens;
begin
  v := auditoria.item_por_codigo(p_codigo);
  if v.id is null then return jsonb_build_object('encontrado', false); end if;
  return auditoria.projecao(v);
end $$;

-- Pelo SHA-256 do arquivo ou do conteúdo: o registro mais recente com aquele hash, e a data do
-- primeiro registro.
create or replace function public.auditoria_consultar_hash(p_hash text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_hash text := lower(btrim(coalesce(p_hash, '')));
  v auditoria.itens;
  v_primeiro timestamptz;
begin
  if v_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('encontrado', false); end if;
  select * into v from auditoria.itens i
   where i.hash_conteudo = v_hash or i.hash_arquivo = v_hash
   order by i.registrado_em desc limit 1;
  if v.id is null then return jsonb_build_object('encontrado', false); end if;
  select min(i.registrado_em) into v_primeiro from auditoria.itens i where i.hash_conteudo = v_hash or i.hash_arquivo = v_hash;
  return auditoria.projecao(v) || jsonb_build_object('primeiro_registro_em',
    case when v.classe = 'P' then to_jsonb(v_primeiro)
         else to_jsonb(to_char(v_primeiro at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')) end);
end $$;

-- Texto canônico de um item público (para baixar e conferir o hash).
create or replace function public.auditoria_conteudo(p_codigo text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v auditoria.itens;
begin
  v := auditoria.item_por_codigo(p_codigo);
  if v.id is null or v.classe <> 'P' then return null; end if;
  return v.conteudo_canonico;
end $$;

-- O que a aplicação precisa para montar o .ots do item: operações do hash do conteúdo até o
-- compromisso do lote, e o .ots do lote. Nulo se o item ainda não entrou em lote.
create or replace function public.auditoria_dados_prova(p_codigo text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v auditoria.itens;
  v_lote auditoria.lotes;
  v_dia date;
  v_posicao integer;
  v_folhas bytea[];
begin
  v := auditoria.item_por_codigo(p_codigo);
  if v.id is null then return null; end if;
  select li.dia, li.posicao into v_dia, v_posicao from auditoria.lote_itens li where li.item_id = v.id;
  if v_dia is null then return null; end if;
  select * into v_lote from auditoria.lotes l where l.dia = v_dia;
  select array_agg(decode(li.folha, 'hex') order by li.posicao) into v_folhas from auditoria.lote_itens li where li.dia = v_lote.dia;
  return jsonb_build_object(
    'codigo', v.codigo,
    'classe', v.classe,
    'hash_conteudo', v.hash_conteudo,
    'nonce', encode(v.nonce, 'hex'),
    'folha', encode(auditoria.folha(v.hash_conteudo, v.nonce), 'hex'),
    'caminho', auditoria.caminho_merkle(v_folhas, v_posicao),
    'raiz', v_lote.raiz,
    'cabecas', v_lote.cabecas,
    'anterior', v_lote.compromisso_anterior,
    'compromisso', v_lote.compromisso,
    'dia', v_lote.dia,
    'ots', replace(encode(v_lote.ots, 'base64'), E'\n', ''),
    'ots_estado', v_lote.ots_estado,
    'bloco', v_lote.bloco);
end $$;

-- Limite de consultas por hora e chave. Devolve se a consulta pode seguir.
create or replace function public.auditoria_permitir(p_chave text, p_limite integer)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  v_janela timestamptz := date_trunc('hour', clock_timestamp());
  v_contagem integer;
begin
  if p_chave is null or p_chave !~ '^[0-9a-f]{64}$' then
    raise exception 'Chave inválida.' using errcode = 'P0001';
  end if;
  insert into auditoria.consultas_limite (chave, janela, contagem) values (p_chave, v_janela, 1)
  on conflict (chave, janela) do update set contagem = auditoria.consultas_limite.contagem + 1
  returning contagem into v_contagem;
  if random() < 0.02 then
    delete from auditoria.consultas_limite where janela < v_janela - interval '1 day';
  end if;
  return v_contagem <= p_limite;
end $$;

-- ---------------------------------------------------------------- registro pela aplicação

create or replace function public.auditoria_registrar_item(
  p_workspace_id uuid,
  p_tipo text,
  p_referencia_id uuid,
  p_hash text default null,
  p_titulo text default null,
  p_url text default null,
  p_conteudo text default null,
  p_codigo_externo text default null,
  p_hash_arquivo text default null,
  p_ator_id uuid default null
) returns table (id uuid, codigo text, versao integer) language plpgsql security definer set search_path = '' as $$
declare
  v auditoria.itens;
begin
  v := auditoria.registrar_item(p_workspace_id, p_tipo, p_referencia_id, p_hash, p_titulo, p_url, p_conteudo,
                                p_codigo_externo, p_hash_arquivo, p_ator_id,
                                case when p_ator_id is null then 'sistema' else
                                  coalesce((select m.role from public.workspace_members m
                                             where m.workspace_id = p_workspace_id and m.user_id = p_ator_id limit 1), 'sistema') end);
  return query select v.id, v.codigo, v.versao;
end $$;

create or replace function public.auditoria_registrar_evento_item(
  p_codigo text,
  p_acao text,
  p_motivo text,
  p_ator_id uuid default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v auditoria.itens;
begin
  v := auditoria.item_por_codigo(p_codigo);
  if v.id is null then
    raise exception 'Item não encontrado.' using errcode = 'P0001';
  end if;
  return auditoria.registrar_evento_item(v.id, p_acao, p_motivo, p_ator_id,
    case when p_ator_id is null then 'sistema' else
      coalesce((select m.role from public.workspace_members m
                 where m.workspace_id = v.workspace_id and m.user_id = p_ator_id limit 1), 'sistema') end);
end $$;

-- ---------------------------------------------------------------- conteúdo canônico das origens

create or replace function auditoria.conteudo_materia(p public.content_pieces)
returns text language sql stable set search_path = '' as $$
  select auditoria.json_canonico(jsonb_build_object(
    'corpo', coalesce(p.body, ''),
    'subtitulo', nullif(btrim(coalesce(p.subtitle, '')), ''),
    'titulo', p.title,
    'url', p.site_url))
$$;

create or replace function auditoria.conteudo_certificado(c public.certificados)
returns text language sql stable set search_path = '' as $$
  select auditoria.json_canonico(jsonb_build_object(
    'carga_horaria', trim_scale(c.carga_horaria),
    'codigo', c.codigo,
    'curso', c.curso_titulo,
    'emitido_em', to_char(c.emitido_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'nome', c.nome,
    'valido_ate', to_char(c.valido_ate, 'YYYY-MM-DD')))
$$;

create or replace function auditoria.conteudo_comunicado(c public.press_campanhas)
returns text language sql stable set search_path = '' as $$
  select auditoria.json_canonico(jsonb_build_object(
    'assunto', c.assunto,
    'corpo', c.corpo,
    'enviado_em', to_char(coalesce(c.enviada_em, c.concluida_em, c.created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'link_rotulo', nullif(btrim(c.link_rotulo), ''),
    'link_url', nullif(btrim(c.link_url), '')))
$$;

-- ---------------------------------------------------------------- ganchos nas origens
--
-- AFTER, por linha. A falha de registro vira linha em auditoria.falhas e a operação principal
-- segue; public.auditoria_sincronizar() (cron diário) registra o que faltou.

create or replace function auditoria.gancho_oficio()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_item auditoria.itens;
  v_ator uuid := auditoria.ator_atual();
begin
  begin
    if new.estado = 'assinado' then
      perform auditoria.registrar_item(new.workspace_id, 'oficio', new.id, new.hash_manifesto,
        p_codigo_externo => new.codigo_verificacao,
        p_hash_arquivo => case when new.modo_assinatura = 'govbr' then new.pdf_atual_sha256 end,
        p_ator => v_ator, p_papel => auditoria.papel_atual(new.workspace_id));
    elsif new.estado = 'cancelado' then
      v_item := auditoria.ultimo_item('oficio', new.id);
      if v_item.id is not null then
        perform auditoria.registrar_evento_item(v_item.id, 'item.revogado', 'decisao_administrativa', v_ator, auditoria.papel_atual(new.workspace_id));
      end if;
    end if;
  exception when others then
    insert into auditoria.falhas (origem, referencia_id, erro) values ('gancho_oficio', new.id, left(sqlerrm, 500));
  end;
  return null;
end $$;

drop trigger if exists oficios_trilha on public.oficios;
create trigger oficios_trilha after update of estado on public.oficios
  for each row when (old.estado is distinct from new.estado and new.estado in ('assinado', 'cancelado'))
  execute function auditoria.gancho_oficio();

create or replace function auditoria.gancho_certificado()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_item auditoria.itens;
  v_ator uuid := auditoria.ator_atual();
  v_id uuid := coalesce(new.id, old.id);
  v_ws uuid := coalesce(new.workspace_id, old.workspace_id);
begin
  begin
    if tg_op = 'INSERT' then
      v_item := auditoria.registrar_item(new.workspace_id, 'certificado', new.id,
        auditoria.sha256_hex(auditoria.conteudo_certificado(new)),
        p_codigo_externo => new.codigo, p_ator => v_ator, p_papel => auditoria.papel_atual(new.workspace_id));
      if new.revogado_em is not null then
        perform auditoria.registrar_evento_item(v_item.id, 'item.revogado', 'decisao_administrativa', v_ator, auditoria.papel_atual(new.workspace_id));
      end if;
    else
      v_item := auditoria.ultimo_item('certificado', v_id);
      if v_item.id is not null then
        if tg_op = 'UPDATE' then
          perform auditoria.registrar_evento_item(v_item.id, 'item.revogado', 'decisao_administrativa', v_ator, auditoria.papel_atual(v_ws));
        else
          perform auditoria.registrar_evento_item(v_item.id, 'item.retirado', 'outro', v_ator, auditoria.papel_atual(v_ws));
        end if;
      end if;
    end if;
  exception when others then
    insert into auditoria.falhas (origem, referencia_id, erro) values ('gancho_certificado', v_id, left(sqlerrm, 500));
  end;
  return null;
end $$;

drop trigger if exists certificados_trilha_emissao on public.certificados;
create trigger certificados_trilha_emissao after insert on public.certificados
  for each row execute function auditoria.gancho_certificado();
drop trigger if exists certificados_trilha_revogacao on public.certificados;
create trigger certificados_trilha_revogacao after update of revogado_em on public.certificados
  for each row when (old.revogado_em is null and new.revogado_em is not null)
  execute function auditoria.gancho_certificado();
drop trigger if exists certificados_trilha_exclusao on public.certificados;
create trigger certificados_trilha_exclusao after delete on public.certificados
  for each row execute function auditoria.gancho_certificado();

create or replace function auditoria.gancho_materia()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_item auditoria.itens;
  v_ator uuid := auditoria.ator_atual();
begin
  begin
    if new.site_url is not null and new.site_published_at is not null then
      perform auditoria.registrar_item(new.workspace_id, 'materia', new.id, null,
        p_titulo => new.title, p_url => new.site_url, p_conteudo => auditoria.conteudo_materia(new),
        p_ator => v_ator, p_papel => auditoria.papel_atual(new.workspace_id));
    elsif old.site_url is not null and new.site_url is null then
      v_item := auditoria.ultimo_item('materia', new.id);
      if v_item.id is not null then
        perform auditoria.registrar_evento_item(v_item.id, 'item.retirado', 'retirado_do_ar', v_ator, auditoria.papel_atual(new.workspace_id));
      end if;
    end if;
  exception when others then
    insert into auditoria.falhas (origem, referencia_id, erro) values ('gancho_materia', new.id, left(sqlerrm, 500));
  end;
  return null;
end $$;

drop trigger if exists content_pieces_trilha on public.content_pieces;
create trigger content_pieces_trilha after update of site_url, site_published_at on public.content_pieces
  for each row when (old.site_url is distinct from new.site_url or old.site_published_at is distinct from new.site_published_at)
  execute function auditoria.gancho_materia();

create or replace function auditoria.gancho_comunicado()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform auditoria.registrar_item(new.workspace_id, 'comunicado', new.id, null,
      p_titulo => new.assunto, p_url => nullif(btrim(new.link_url), ''), p_conteudo => auditoria.conteudo_comunicado(new),
      p_ator => coalesce(auditoria.ator_atual(), new.enviada_por),
      p_papel => case when auditoria.ator_atual() is null and new.enviada_por is not null
                      then coalesce((select m.role from public.workspace_members m
                                      where m.workspace_id = new.workspace_id and m.user_id = new.enviada_por limit 1), 'sistema')
                      else auditoria.papel_atual(new.workspace_id) end);
  exception when others then
    insert into auditoria.falhas (origem, referencia_id, erro) values ('gancho_comunicado', new.id, left(sqlerrm, 500));
  end;
  return null;
end $$;

drop trigger if exists press_campanhas_trilha on public.press_campanhas;
create trigger press_campanhas_trilha after update of estado on public.press_campanhas
  for each row when (new.estado in ('enviada', 'parcial') and old.estado not in ('enviada', 'parcial'))
  execute function auditoria.gancho_comunicado();

-- ---------------------------------------------------------------- sincronização (rede de segurança)

-- O portal de transparência e os canais oficiais têm a sua parte da sincronização; a migração
-- deles (20260925203100_cvrj_transparencia.sql) substitui esta função. Só se cria a vazia se
-- ainda não existir, para esta migração, reaplicada, não apagar a do portal.
do $$
begin
  if to_regprocedure('auditoria.sincronizar_portal()') is null then
    create function auditoria.sincronizar_portal()
    returns jsonb language sql stable set search_path = '' as $f$ select '{}'::jsonb $f$;
  end if;
end $$;

-- Registra o que os ganchos não registraram, inclusive o que já existia antes da trilha. Um
-- item registrado aqui tem a data do registro, não a da publicação original. Matéria só entra se
-- o texto não mudou desde a publicação (updated_at igual a site_published_at, como a Redação grava).
create or replace function public.auditoria_sincronizar()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r record;
  ro public.oficios;
  rc public.certificados;
  rp public.content_pieces;
  rm public.press_campanhas;
  v_item auditoria.itens;
  v_antes integer;
  v_oficios integer := 0;
  v_certificados integer := 0;
  v_materias integer := 0;
  v_comunicados integer := 0;
  v_falhas integer := 0;
  v_portal jsonb;
begin
  for ro in select o.* from public.oficios o
            where o.estado in ('assinado', 'cancelado') and o.hash_manifesto is not null
              and not exists (select 1 from auditoria.itens i where i.tipo = 'oficio' and i.referencia_id = o.id) loop
    begin
      v_item := auditoria.registrar_item(ro.workspace_id, 'oficio', ro.id, ro.hash_manifesto,
        p_codigo_externo => ro.codigo_verificacao,
        p_hash_arquivo => case when ro.modo_assinatura = 'govbr' then ro.pdf_atual_sha256 end);
      if ro.estado = 'cancelado' then
        perform auditoria.registrar_evento_item(v_item.id, 'item.revogado', 'decisao_administrativa');
      end if;
      v_oficios := v_oficios + 1;
    exception when others then
      insert into auditoria.falhas (origem, referencia_id, erro) values ('sincronizar_oficio', ro.id, left(sqlerrm, 500));
      v_falhas := v_falhas + 1;
    end;
  end loop;

  for rc in select c.* from public.certificados c
            where not exists (select 1 from auditoria.itens i where i.tipo = 'certificado' and i.referencia_id = c.id) loop
    begin
      v_item := auditoria.registrar_item(rc.workspace_id, 'certificado', rc.id,
        auditoria.sha256_hex(auditoria.conteudo_certificado(rc)), p_codigo_externo => rc.codigo);
      if rc.revogado_em is not null then
        perform auditoria.registrar_evento_item(v_item.id, 'item.revogado', 'decisao_administrativa');
      end if;
      v_certificados := v_certificados + 1;
    exception when others then
      insert into auditoria.falhas (origem, referencia_id, erro) values ('sincronizar_certificado', rc.id, left(sqlerrm, 500));
      v_falhas := v_falhas + 1;
    end;
  end loop;

  -- Revogação que o gancho perdeu.
  for r in select c.id, i.id as item_id from public.certificados c
             join lateral (select * from auditoria.ultimo_item('certificado', c.id)) i on i.id is not null
            where c.revogado_em is not null
              and coalesce((select s.estado from auditoria.estado_item(i.id) s), 'vigente') = 'vigente' loop
    perform auditoria.registrar_evento_item(r.item_id, 'item.revogado', 'decisao_administrativa');
  end loop;
  for r in select o.id, i.id as item_id from public.oficios o
             join lateral (select * from auditoria.ultimo_item('oficio', o.id)) i on i.id is not null
            where o.estado = 'cancelado'
              and coalesce((select s.estado from auditoria.estado_item(i.id) s), 'vigente') = 'vigente' loop
    perform auditoria.registrar_evento_item(r.item_id, 'item.revogado', 'decisao_administrativa');
  end loop;

  for rp in select p.* from public.content_pieces p
            where p.site_url is not null and p.site_published_at is not null and p.updated_at = p.site_published_at loop
    begin
      select count(*) into v_antes from auditoria.itens i where i.tipo = 'materia' and i.referencia_id = rp.id;
      perform auditoria.registrar_item(rp.workspace_id, 'materia', rp.id, null,
        p_titulo => rp.title, p_url => rp.site_url, p_conteudo => auditoria.conteudo_materia(rp));
      if (select count(*) from auditoria.itens i where i.tipo = 'materia' and i.referencia_id = rp.id) > v_antes then
        v_materias := v_materias + 1;
      end if;
    exception when others then
      insert into auditoria.falhas (origem, referencia_id, erro) values ('sincronizar_materia', rp.id, left(sqlerrm, 500));
      v_falhas := v_falhas + 1;
    end;
  end loop;

  -- Matéria que saiu do ar sem o gancho registrar.
  for r in select p.id, i.id as item_id from public.content_pieces p
             join lateral (select * from auditoria.ultimo_item('materia', p.id)) i on i.id is not null
            where p.site_url is null
              and coalesce((select s.estado from auditoria.estado_item(i.id) s), 'vigente') = 'vigente' loop
    perform auditoria.registrar_evento_item(r.item_id, 'item.retirado', 'retirado_do_ar');
  end loop;

  for rm in select c.* from public.press_campanhas c
            where c.estado in ('enviada', 'parcial')
              and not exists (select 1 from auditoria.itens i where i.tipo = 'comunicado' and i.referencia_id = c.id) loop
    begin
      perform auditoria.registrar_item(rm.workspace_id, 'comunicado', rm.id, null,
        p_titulo => rm.assunto, p_url => nullif(btrim(rm.link_url), ''), p_conteudo => auditoria.conteudo_comunicado(rm));
      v_comunicados := v_comunicados + 1;
    exception when others then
      insert into auditoria.falhas (origem, referencia_id, erro) values ('sincronizar_comunicado', rm.id, left(sqlerrm, 500));
      v_falhas := v_falhas + 1;
    end;
  end loop;

  v_portal := auditoria.sincronizar_portal();
  return v_portal - 'falhas' || jsonb_build_object('oficios', v_oficios, 'certificados', v_certificados, 'materias', v_materias,
                            'comunicados', v_comunicados, 'falhas', v_falhas + coalesce((v_portal ->> 'falhas')::integer, 0),
                            'falhas_24h', (select count(*) from auditoria.falhas f where f.ocorrido_em > clock_timestamp() - interval '24 hours'));
end $$;

-- ---------------------------------------------------------------- verificação diária

create or replace function public.auditoria_verificar_cadeia(p_origem text default 'cron')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_inicio timestamptz := clock_timestamp();
  v_fluxos jsonb := '[]';
  v_total integer := 0;
  v_ok boolean := true;
  f record;
  e auditoria.eventos;
  v_anterior text;
  v_ordem bigint;
  v_n integer;
  v_quebra bigint;
  l auditoria.lotes;
  v_lotes integer := 0;
  v_lotes_ok boolean := true;
  v_primeiro_lote date;
  v_compromisso_anterior text := repeat('0', 64);
  v_folhas bytea[];
  v_folhas_conferem boolean;
  v_contagem integer;
  v_max_posicao integer;
  v_lote_ok boolean;
begin
  if p_origem not in ('cron', 'manual', 'script') then
    raise exception 'Origem inválida.' using errcode = 'P0001';
  end if;
  -- Não corre junto com o fechamento de lote.
  perform pg_advisory_xact_lock(hashtext('auditoria:lotes'));

  for f in select distinct ev.fluxo from auditoria.eventos ev order by 1 loop
    v_anterior := repeat('0', 64);
    v_ordem := 0;
    v_n := 0;
    v_quebra := null;
    for e in select * from auditoria.eventos ev where ev.fluxo = f.fluxo order by ev.ordem_no_fluxo loop
      v_n := v_n + 1;
      if v_quebra is null and (e.ordem_no_fluxo <> v_ordem + 1 or e.hash_anterior <> v_anterior or e.hash_linha <> auditoria.hash_do_evento(e)) then
        v_quebra := e.ordem_no_fluxo;
      end if;
      v_ordem := e.ordem_no_fluxo;
      v_anterior := e.hash_linha;
    end loop;
    v_total := v_total + v_n;
    v_fluxos := v_fluxos || jsonb_build_array(jsonb_build_object(
      'fluxo', f.fluxo, 'eventos', v_n, 'ordem_final', v_ordem, 'ok', v_quebra is null, 'primeira_quebra_ordem', v_quebra));
    if v_quebra is not null then v_ok := false; end if;
  end loop;

  for l in select * from auditoria.lotes order by dia loop
    v_lotes := v_lotes + 1;
    select coalesce(array_agg(auditoria.folha(i.hash_conteudo, i.nonce) order by li.posicao), '{}'),
           coalesce(bool_and(li.folha = encode(auditoria.folha(i.hash_conteudo, i.nonce), 'hex')), true),
           count(*), coalesce(max(li.posicao), 0)
      into v_folhas, v_folhas_conferem, v_contagem, v_max_posicao
      from auditoria.lote_itens li join auditoria.itens i on i.id = li.item_id
     where li.dia = l.dia;
    v_lote_ok := v_folhas_conferem
      and v_contagem = l.itens and v_max_posicao = l.itens
      and coalesce(encode(auditoria.raiz_merkle(v_folhas), 'hex'), repeat('0', 64)) = l.raiz
      and l.compromisso_anterior = v_compromisso_anterior
      and l.cabecas = auditoria.hash_das_cabecas(l.cabecas_detalhe)
      and l.compromisso = auditoria.compromisso(l.raiz, l.cabecas, l.compromisso_anterior)
      and l.manifesto = auditoria.manifesto_do_lote(l.dia, l.raiz, l.cabecas, l.compromisso_anterior, l.compromisso)
      and l.hash_manifesto = auditoria.sha256_hex(l.manifesto)
      and not exists (
        select 1 from jsonb_array_elements(l.cabecas_detalhe) c
         where not exists (select 1 from auditoria.eventos ev
                            where ev.fluxo = c ->> 'fluxo' and ev.ordem_no_fluxo = (c ->> 'ordem')::bigint and ev.hash_linha = c ->> 'hash'));
    if not v_lote_ok then
      v_lotes_ok := false;
      v_primeiro_lote := coalesce(v_primeiro_lote, l.dia);
    end if;
    v_compromisso_anterior := l.compromisso;
  end loop;

  insert into auditoria.verificacoes (origem, ok, eventos, fluxos, lotes, lotes_ok, primeiro_lote_com_falha, duracao_ms)
  values (p_origem, v_ok and v_lotes_ok, v_total, v_fluxos, v_lotes, v_lotes_ok, v_primeiro_lote,
          (extract(epoch from clock_timestamp() - v_inicio) * 1000)::integer);
  insert into auditoria.eventos (fluxo, entidade_tipo, papel, acao, depois)
  values ('F19', 'verificacao', 'sistema',
          case when v_ok and v_lotes_ok then 'auditoria.verificacao_ok' else 'auditoria.verificacao_falhou' end,
          jsonb_build_object('estado', case when v_ok and v_lotes_ok then 'ok' else 'falhou' end));
  return jsonb_build_object('ok', v_ok and v_lotes_ok, 'eventos', v_total, 'fluxos', v_fluxos,
                            'lotes', v_lotes, 'lotes_ok', v_lotes_ok, 'primeiro_lote_com_falha', v_primeiro_lote);
end $$;

-- ---------------------------------------------------------------- lote diário

-- Fecha o lote do dia p_dia (dia de São Paulo) com todos os itens registrados antes da meia-noite
-- seguinte que ainda não estão em lote. Sem itens, a raiz é 64 zeros: o lote ainda ancora as
-- cabeças das cadeias. Devolve nulo se o dia já foi fechado (o cron pode repetir).
create or replace function public.auditoria_fechar_lote(p_dia date)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ate timestamptz := ((p_dia + 1)::timestamp at time zone 'America/Sao_Paulo');
  v_ultimo auditoria.lotes;
  v_ids uuid[];
  v_folhas bytea[];
  v_raiz text;
  v_detalhe jsonb;
  v_cabecas text;
  v_anterior text;
  v_compromisso text;
  v_manifesto text;
  v_lote auditoria.lotes;
begin
  if p_dia is null then
    raise exception 'Informe o dia.' using errcode = 'P0001';
  end if;
  if v_ate > clock_timestamp() then
    raise exception 'O dia % ainda não terminou.', p_dia using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('auditoria:lotes'));
  select * into v_ultimo from auditoria.lotes order by dia desc limit 1;
  if v_ultimo.dia is not null and v_ultimo.dia >= p_dia then
    return null;
  end if;

  select coalesce(array_agg(i.id order by i.registrado_em, i.id), '{}'),
         coalesce(array_agg(auditoria.folha(i.hash_conteudo, i.nonce) order by i.registrado_em, i.id), '{}')
    into v_ids, v_folhas
    from auditoria.itens i
   where i.registrado_em < v_ate
     and not exists (select 1 from auditoria.lote_itens li where li.item_id = i.id);

  v_raiz := coalesce(encode(auditoria.raiz_merkle(v_folhas), 'hex'), repeat('0', 64));
  select coalesce(jsonb_agg(jsonb_build_object('fluxo', c.fluxo, 'ordem', c.ordem_no_fluxo, 'hash', c.hash_linha) order by c.fluxo collate "C"), '[]'::jsonb)
    into v_detalhe
    from (select distinct on (ev.fluxo) ev.fluxo, ev.ordem_no_fluxo, ev.hash_linha
            from auditoria.eventos ev order by ev.fluxo, ev.ordem_no_fluxo desc) c;
  v_cabecas := auditoria.hash_das_cabecas(v_detalhe);
  v_anterior := coalesce(v_ultimo.compromisso, repeat('0', 64));
  v_compromisso := auditoria.compromisso(v_raiz, v_cabecas, v_anterior);
  v_manifesto := auditoria.manifesto_do_lote(p_dia, v_raiz, v_cabecas, v_anterior, v_compromisso);

  insert into auditoria.lotes (dia, itens, raiz, cabecas, cabecas_detalhe, compromisso_anterior, compromisso, manifesto, hash_manifesto)
  values (p_dia, coalesce(array_length(v_ids, 1), 0), v_raiz, v_cabecas, v_detalhe, v_anterior, v_compromisso, v_manifesto,
          auditoria.sha256_hex(v_manifesto))
  returning * into v_lote;

  insert into auditoria.lote_itens (dia, posicao, item_id, folha)
  select p_dia, u.pos::integer, u.id, encode(v_folhas[u.pos], 'hex')
    from unnest(v_ids) with ordinality as u(id, pos);

  insert into auditoria.eventos (fluxo, entidade_tipo, papel, acao, depois, hash_arquivo)
  values ('F19', 'lote', 'sistema', 'auditoria.lote_fechado', jsonb_build_object('itens', v_lote.itens), v_compromisso);

  return jsonb_build_object('dia', v_lote.dia, 'itens', v_lote.itens, 'compromisso', v_lote.compromisso,
                            'manifesto', v_lote.manifesto, 'hash_manifesto', v_lote.hash_manifesto);
end $$;

create or replace function public.auditoria_assinar_lote(p_dia date, p_assinatura text, p_chave_id text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  update auditoria.lotes set assinatura = p_assinatura, chave_id = p_chave_id, assinado_em = clock_timestamp()
   where dia = p_dia and assinatura is null;
  return found;
end $$;

-- p_ots em base64. Sem p_ots, só registra a tentativa (erro e próxima vez).
create or replace function public.auditoria_gravar_ots(
  p_dia date,
  p_ots text,
  p_estado text,
  p_bloco integer default null,
  p_erro text default null,
  p_proxima timestamptz default null
) returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_estado is not null and p_estado not in ('enviado', 'confirmado') then
    raise exception 'Estado inválido.' using errcode = 'P0001';
  end if;
  update auditoria.lotes
     set ots = coalesce(decode(p_ots, 'base64'), ots),
         ots_estado = coalesce(p_estado, ots_estado),
         ots_enviado_em = case when p_estado = 'enviado' then clock_timestamp()
                               when p_estado = 'confirmado' then coalesce(ots_enviado_em, clock_timestamp())
                               else ots_enviado_em end,
         bloco = case when p_estado = 'confirmado' then p_bloco else bloco end,
         ots_confirmado_em = case when p_estado = 'confirmado' then clock_timestamp() else ots_confirmado_em end,
         tentativas = case when p_erro is not null then tentativas + 1 else tentativas end,
         ultimo_erro = left(p_erro, 500),
         proxima_tentativa_em = p_proxima
   where dia = p_dia and ots_estado <> 'confirmado'
     -- Um envio só: se duas rodadas mandarem o mesmo lote ao mesmo tempo, vale a primeira.
     and (p_estado is distinct from 'enviado' or ots_estado = 'pendente');
  return found;
end $$;

create or replace function public.auditoria_gravar_tsr(p_dia date, p_tsr text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  update auditoria.lotes set tsr = decode(p_tsr, 'base64'), tsr_em = clock_timestamp() where dia = p_dia and tsr is null;
  return found;
end $$;

create or replace function public.auditoria_registrar_erro_lote(p_dia date, p_erro text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  update auditoria.lotes set tentativas = tentativas + 1, ultimo_erro = left(p_erro, 500) where dia = p_dia;
end $$;

create or replace function public.auditoria_marcar_publicado(p_dia date)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  update auditoria.lotes set publicado_em = clock_timestamp(), ultimo_erro = null where dia = p_dia;
  return found;
end $$;

-- Lotes com trabalho pendente (assinar, carimbar, atualizar o .ots, publicar), do mais antigo.
create or replace function public.auditoria_lotes_pendentes(p_limite integer default 8)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x.dia), '[]'::jsonb)
    from (
      select l.dia, l.itens, l.compromisso, l.manifesto, l.hash_manifesto, l.assinatura, l.chave_id,
             replace(encode(l.ots, 'base64'), E'\n', '') as ots, l.ots_estado, l.bloco,
             replace(encode(l.tsr, 'base64'), E'\n', '') as tsr, l.tentativas,
             l.assinatura is null as precisa_assinar,
             l.tsr is null as precisa_tsr,
             l.ots_estado = 'pendente' as precisa_ots,
             l.ots_estado = 'enviado' and coalesce(l.proxima_tentativa_em, '-infinity'::timestamptz) <= clock_timestamp() as precisa_atualizar_ots,
             l.publicado_em is null or l.publicado_em < greatest(l.assinado_em, l.tsr_em, l.ots_enviado_em, l.ots_confirmado_em) as precisa_publicar
        from auditoria.lotes l
       where l.assinatura is null or l.tsr is null or l.ots_estado = 'pendente'
          or (l.ots_estado = 'enviado' and coalesce(l.proxima_tentativa_em, '-infinity'::timestamptz) <= clock_timestamp())
          or l.publicado_em is null or l.publicado_em < greatest(l.assinado_em, l.tsr_em, l.ots_enviado_em, l.ots_confirmado_em)
       order by l.dia
       limit greatest(1, least(coalesce(p_limite, 8), 50))
    ) x
$$;

-- Índice público dos lotes (verificar/lotes/indice.json).
create or replace function public.auditoria_indice_lotes()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('dia', l.dia, 'compromisso', l.compromisso, 'bloco', l.bloco, 'chave_id', l.chave_id,
                                               'tsa', l.tsr is not null) order by l.dia desc), '[]'::jsonb)
    from auditoria.lotes l
$$;

-- ---------------------------------------------------------------- visão interna (administração)

create or replace function public.auditoria_painel(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select private.workspace_role(p_workspace_id)) is distinct from 'admin' then
    raise exception 'Só a administração vê a trilha.' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'verificacao', (select jsonb_build_object('executado_em', v.executado_em, 'ok', v.ok, 'eventos', v.eventos, 'fluxos', v.fluxos,
                                              'lotes', v.lotes, 'lotes_ok', v.lotes_ok, 'primeiro_lote_com_falha', v.primeiro_lote_com_falha,
                                              'duracao_ms', v.duracao_ms)
                      from auditoria.verificacoes v order by v.id desc limit 1),
    'lotes', (select coalesce(jsonb_agg(x order by x.dia desc), '[]'::jsonb) from (
                select l.dia, l.fechado_em, l.itens, l.compromisso, l.assinatura is not null as assinado, l.chave_id,
                       l.ots_estado, l.bloco, l.tsr is not null as tsa, l.publicado_em, l.tentativas, l.ultimo_erro
                  from auditoria.lotes l order by l.dia desc limit 30) x),
    'falhas', (select coalesce(jsonb_agg(x order by x.id desc), '[]'::jsonb) from (
                 select f.id, f.ocorrido_em, f.origem, f.referencia_id, f.erro
                   from auditoria.falhas f where f.ocorrido_em > clock_timestamp() - interval '30 days'
                  order by f.id desc limit 30) x),
    'totais', (select coalesce(jsonb_object_agg(t.tipo, t.n), '{}'::jsonb) from (
                 select i.tipo, count(*) as n from auditoria.itens i where i.workspace_id = p_workspace_id group by i.tipo) t),
    'pendentes_de_lote', (select count(*) from auditoria.itens i
                           where i.workspace_id = p_workspace_id
                             and not exists (select 1 from auditoria.lote_itens li where li.item_id = i.id)),
    'recentes', (select coalesce(jsonb_agg(x order by x.registrado_em desc), '[]'::jsonb) from (
                   select i.codigo, i.tipo, i.classe, i.versao, i.titulo_publico, i.url_publica, i.referencia_id, i.registrado_em,
                          coalesce((select s.estado from auditoria.estado_item(i.id) s), 'vigente') as estado,
                          (select li.dia from auditoria.lote_itens li where li.item_id = i.id) as lote
                     from auditoria.itens i where i.workspace_id = p_workspace_id
                    order by i.registrado_em desc limit 40) x)
  );
end $$;

-- Um item com a sua história (eventos), para a administração. Aceita os mesmos códigos da consulta.
create or replace function public.auditoria_item_interno(p_workspace_id uuid, p_codigo text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v auditoria.itens;
begin
  if (select private.workspace_role(p_workspace_id)) is distinct from 'admin' then
    raise exception 'Só a administração vê a trilha.' using errcode = 'P0001';
  end if;
  v := auditoria.item_por_codigo(p_codigo);
  if v.id is null or v.workspace_id <> p_workspace_id then return jsonb_build_object('encontrado', false); end if;
  return auditoria.projecao(v) || jsonb_build_object(
    'referencia_id', v.referencia_id,
    'codigo_externo', v.codigo_externo,
    'fluxo', v.fluxo,
    'eventos', (select coalesce(jsonb_agg(jsonb_build_object('acao', e.acao, 'ocorrido_em', e.ocorrido_em, 'papel', e.papel,
                                                             'ordem', e.ordem_no_fluxo, 'depois', e.depois, 'hash', e.hash_linha)
                                          order by e.ordem_no_fluxo), '[]'::jsonb)
                  from auditoria.eventos e where e.item_id = v.id));
end $$;

-- ---------------------------------------------------------------- avisos

-- Falha na conferência diária, num registro ou num lote vira aviso para a administração
-- (categoria própria, com preferência de e-mail como as outras). A lista é lida da restrição
-- em vigor e só ganha "auditoria": outra migração aplicada antes desta pode ter acrescentado
-- categorias, e reescrever a lista inteira as apagaria.
do $$
declare
  v_def text;
  v_lista text[];
begin
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'public.notifications'::regclass and c.conname = 'notifications_categoria_valida';
  if v_def is null then return; end if;
  -- Dois formatos: ARRAY['a'::text, 'b'::text] (lista escrita à mão) ou '{a,b}'::text[] (o que
  -- fica depois de uma migração regravar a lista, como a do chat). Lista vazia aqui apagaria as
  -- outras categorias: melhor parar.
  if v_def ~ '''\{[a-z_,]*\}''' then
    v_lista := string_to_array(substring(v_def from '''\{([a-z_,]*)\}'''), ',');
  else
    select array_agg(distinct m[1] order by m[1]) into v_lista from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
  end if;
  if coalesce(cardinality(v_lista), 0) = 0 then
    raise exception 'Não consegui ler as categorias de notifications_categoria_valida: %', v_def;
  end if;
  if 'auditoria' = any (v_lista) then return; end if;
  v_lista := v_lista || array['auditoria'];
  alter table public.notifications drop constraint notifications_categoria_valida;
  execute format('alter table public.notifications add constraint notifications_categoria_valida check (categoria = any (%L::text[]))', v_lista);
end $$;

-- ---------------------------------------------------------------- privilégios

revoke all on all tables in schema auditoria from public, anon, authenticated, service_role;
revoke all on all sequences in schema auditoria from public, anon, authenticated, service_role;
revoke all on all functions in schema auditoria from public, anon, authenticated, service_role;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.auditoria_consultar(text)',
    'public.auditoria_consultar_hash(text)',
    'public.auditoria_conteudo(text)',
    'public.auditoria_dados_prova(text)',
    'public.auditoria_permitir(text, integer)',
    'public.auditoria_registrar_item(uuid, text, uuid, text, text, text, text, text, text, uuid)',
    'public.auditoria_registrar_evento_item(text, text, text, uuid)',
    'public.auditoria_sincronizar()',
    'public.auditoria_verificar_cadeia(text)',
    'public.auditoria_fechar_lote(date)',
    'public.auditoria_assinar_lote(date, text, text)',
    'public.auditoria_gravar_ots(date, text, text, integer, text, timestamptz)',
    'public.auditoria_gravar_tsr(date, text)',
    'public.auditoria_registrar_erro_lote(date, text)',
    'public.auditoria_marcar_publicado(date)',
    'public.auditoria_lotes_pendentes(integer)',
    'public.auditoria_indice_lotes()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array[
    'public.auditoria_painel(uuid)',
    'public.auditoria_item_interno(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
