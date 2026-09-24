-- Chat (2 e 3): arquivos e áudio, respostas em fio, reações e busca.
--
-- Arquivos: o navegador sobe direto para o bucket privado chat-arquivos
-- (link de envio de uso único, feito pelo servidor) e a mensagem registra o
-- que subiu. O banco confere o caminho (espaço/conversa/quem enviou) e lê
-- tamanho e tipo do próprio Storage, não do navegador. Abrir um arquivo passa
-- por chat_abrir_anexo, que confere quem pode ver.
--
-- Nada some: apagar a mensagem tira os arquivos da conversa, mas o registro
-- (chat_anexos) e o arquivo ficam; o administrador ainda abre.
--
-- Fio: resposta_de aponta para a mensagem principal; a principal guarda
-- quantas respostas, a última e quem respondeu (a tela atualiza ao vivo pelo
-- UPDATE dela). Reações ficam em chat_reacoes e o resumo vai para a própria
-- mensagem, pelo mesmo motivo.
--
-- Busca: sem acento e sem diferença de maiúsculas, por começo de palavra, no
-- texto e no nome dos arquivos, só no que a pessoa pode ver.

-- ---------------------------------------------------------------- bucket

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-arquivos', 'chat-arquivos', false, 52428800)
on conflict (id) do nothing;

-- ---------------------------------------------------------------- mensagens: fio, reações, arquivos, busca

alter table public.chat_mensagens
  add column if not exists resposta_de uuid references public.chat_mensagens (id) on delete cascade,
  add column if not exists respostas integer not null default 0,
  add column if not exists ultima_resposta_em timestamptz,
  add column if not exists respondentes uuid[] not null default '{}',
  -- [{"emoji": "👍", "pessoas": [uuid, ...]}], na ordem em que apareceram.
  add column if not exists reacoes jsonb not null default '[]',
  -- [{"id", "nome", "mime", "tamanho", "tipo", "duracao"}]: o que a tela mostra (o registro fica em chat_anexos).
  add column if not exists anexos jsonb not null default '[]',
  add column if not exists busca tsvector generated always as (to_tsvector('simple'::regconfig, private.chave_do_nome(corpo))) stored;

create index if not exists chat_mensagens_principais_idx on public.chat_mensagens (canal_id, created_at desc) where resposta_de is null;
create index if not exists chat_mensagens_fio_idx on public.chat_mensagens (resposta_de, created_at) where resposta_de is not null;
create index if not exists chat_mensagens_busca_idx on public.chat_mensagens using gin (busca);

alter table public.chat_versoes add column if not exists anexos jsonb;

create table if not exists public.chat_anexos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  canal_id      uuid not null references public.chat_canais (id) on delete cascade,
  mensagem_id   uuid not null references public.chat_mensagens (id) on delete cascade,
  caminho       text not null unique,
  nome          text not null check (char_length(nome) between 1 and 200),
  mime          text not null check (char_length(mime) <= 150),
  tamanho       bigint not null check (tamanho >= 0 and tamanho <= 52428800),
  tipo          text not null check (tipo in ('imagem', 'audio', 'video', 'arquivo')),
  duracao       numeric(7, 1),
  enviado_por   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists chat_anexos_mensagem_idx on public.chat_anexos (mensagem_id);
create index if not exists chat_anexos_canal_idx on public.chat_anexos (canal_id);
create index if not exists chat_anexos_workspace_idx on public.chat_anexos (workspace_id);
create index if not exists chat_anexos_enviado_por_idx on public.chat_anexos (enviado_por);

create table if not exists public.chat_reacoes (
  mensagem_id   uuid not null references public.chat_mensagens (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  emoji         text not null check (char_length(emoji) between 1 and 16 and emoji !~ '[[:alnum:][:space:]<>&"''\\]'),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  canal_id      uuid not null references public.chat_canais (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (mensagem_id, user_id, emoji)
);
create index if not exists chat_reacoes_user_idx on public.chat_reacoes (user_id);
create index if not exists chat_reacoes_workspace_idx on public.chat_reacoes (workspace_id);
create index if not exists chat_reacoes_canal_idx on public.chat_reacoes (canal_id);

alter table public.chat_anexos enable row level security;
alter table public.chat_reacoes enable row level security;
revoke all on public.chat_anexos, public.chat_reacoes from anon;
revoke insert, update, delete, truncate, references, trigger on public.chat_anexos, public.chat_reacoes from authenticated;
grant select on public.chat_anexos, public.chat_reacoes to authenticated;
-- O registro dos arquivos é da administração; a tela lê o resumo na mensagem.
create policy chat_anexos_select on public.chat_anexos for select to authenticated using ((select private.workspace_role(workspace_id)) = 'admin');
create policy chat_reacoes_select on public.chat_reacoes for select to authenticated using ((select private.chat_pode_ver(canal_id)));

-- ---------------------------------------------------------------- enviar (com fio e arquivos)

drop function if exists public.chat_enviar(uuid, text, uuid[], boolean);

create or replace function public.chat_enviar(p_canal_id uuid, p_corpo text, p_mencoes uuid[] default '{}', p_todos boolean default false,
  p_resposta_de uuid default null, p_anexos jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.chat_canais;
  pai public.chat_mensagens;
  v_eu uuid := (select auth.uid());
  v_corpo text := trim(coalesce(p_corpo, ''));
  v_anexos jsonb := coalesce(p_anexos, '[]');
  v_lista jsonb := '[]';
  v_registros jsonb := '[]';
  v_mencoes uuid[];
  v_id uuid;
  v_em timestamptz;
  a jsonb;
  v_caminho text;
  v_meta jsonb;
  v_mime text;
  v_tipo text;
  v_duracao numeric;
  v_item jsonb;
begin
  select * into c from public.chat_canais where id = p_canal_id;
  if not found or not (select private.chat_pode_ver(p_canal_id)) then raise exception 'Conversa não encontrada.' using errcode = 'P0001'; end if;
  if c.arquivado then raise exception 'Este canal foi arquivado: dá para ler, não para escrever.' using errcode = 'P0001'; end if;
  if jsonb_typeof(v_anexos) <> 'array' then raise exception 'Arquivos inválidos.' using errcode = 'P0001'; end if;
  if jsonb_array_length(v_anexos) > 10 then raise exception 'Até 10 arquivos por mensagem.' using errcode = 'P0001'; end if;
  if char_length(v_corpo) < 1 and jsonb_array_length(v_anexos) = 0 then raise exception 'Escreva a mensagem.' using errcode = 'P0001'; end if;
  if char_length(v_corpo) > 8000 then raise exception 'A mensagem pode ter até 8.000 caracteres.' using errcode = 'P0001'; end if;

  if p_resposta_de is not null then
    select * into pai from public.chat_mensagens where id = p_resposta_de and canal_id = p_canal_id for update;
    if not found or pai.resposta_de is not null then raise exception 'Mensagem não encontrada.' using errcode = 'P0001'; end if;
    if pai.apagada_em is not null then raise exception 'Esta mensagem foi apagada.' using errcode = 'P0001'; end if;
  end if;

  -- Cada arquivo: subiu mesmo, pela própria pessoa, para esta conversa. Tamanho e tipo vêm do Storage.
  for a in select value from jsonb_array_elements(v_anexos) loop
    v_caminho := a->>'caminho';
    if v_caminho is null or split_part(v_caminho, '/', 1) <> c.workspace_id::text or split_part(v_caminho, '/', 2) <> p_canal_id::text
       or split_part(v_caminho, '/', 3) <> v_eu::text or split_part(v_caminho, '/', 4) = '' or split_part(v_caminho, '/', 5) <> '' then
      raise exception 'Arquivo inválido.' using errcode = 'P0001';
    end if;
    select o.metadata into v_meta from storage.objects o where o.bucket_id = 'chat-arquivos' and o.name = v_caminho;
    if not found then raise exception 'Um dos arquivos não terminou de subir. Tente de novo.' using errcode = 'P0001'; end if;
    if exists (select 1 from public.chat_anexos x where x.caminho = v_caminho) then raise exception 'Arquivo já enviado.' using errcode = 'P0001'; end if;
    v_mime := left(lower(split_part(coalesce(nullif(v_meta->>'mimetype', ''), 'application/octet-stream'), ';', 1)), 150);
    v_tipo := case when v_mime like 'image/%' then 'imagem' when v_mime like 'audio/%' then 'audio' when v_mime like 'video/%' then 'video' else 'arquivo' end;
    v_duracao := case when v_tipo in ('audio', 'video') and (a->>'duracao') ~ '^[0-9]{1,5}(\.[0-9]+)?$' then least(round((a->>'duracao')::numeric, 1), 36000) end;
    v_item := jsonb_build_object(
      'id', gen_random_uuid(), 'nome', left(coalesce(nullif(trim(a->>'nome'), ''), 'arquivo'), 200), 'mime', v_mime,
      'tamanho', coalesce((v_meta->>'size')::bigint, 0), 'tipo', v_tipo, 'duracao', v_duracao);
    v_lista := v_lista || jsonb_build_array(v_item);
    v_registros := v_registros || jsonb_build_array(v_item || jsonb_build_object('caminho', v_caminho));
  end loop;

  if not (select private.chat_membro(p_canal_id)) then
    insert into public.chat_membros (canal_id, user_id, workspace_id) values (p_canal_id, v_eu, c.workspace_id) on conflict do nothing;
  end if;
  -- Só vale menção a quem está na conversa.
  select coalesce(array_agg(distinct m.user_id), '{}') into v_mencoes from public.chat_membros m
  where m.canal_id = p_canal_id and m.user_id = any (coalesce(p_mencoes, '{}')) and m.user_id <> v_eu;

  insert into public.chat_mensagens (workspace_id, canal_id, autor_id, corpo, mencoes, menciona_todos, resposta_de, anexos)
  values (c.workspace_id, p_canal_id, v_eu, v_corpo, v_mencoes, coalesce(p_todos, false) and c.tipo = 'canal', p_resposta_de, v_lista)
  returning id, created_at into v_id, v_em;

  insert into public.chat_anexos (id, workspace_id, canal_id, mensagem_id, caminho, nome, mime, tamanho, tipo, duracao, enviado_por)
  select (r->>'id')::uuid, c.workspace_id, p_canal_id, v_id, r->>'caminho', r->>'nome', r->>'mime', (r->>'tamanho')::bigint, r->>'tipo',
    nullif(r->>'duracao', '')::numeric, v_eu
  from jsonb_array_elements(v_registros) r;

  if p_resposta_de is not null then
    update public.chat_mensagens set respostas = respostas + 1, ultima_resposta_em = v_em,
      respondentes = case when v_eu = any (respondentes) then respondentes else (array_append(respondentes, v_eu))[1:10] end
    where id = p_resposta_de;
  end if;
  update public.chat_canais set ultima_mensagem_em = v_em where id = p_canal_id;
  update public.chat_membros set lido_ate = v_em where canal_id = p_canal_id and user_id = v_eu;
  return jsonb_build_object('id', v_id, 'created_at', v_em, 'mencoes', to_jsonb(v_mencoes));
end $$;

-- Mensagem só com arquivo pode ficar sem texto ao editar.
create or replace function public.chat_editar(p_id uuid, p_corpo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  m public.chat_mensagens;
  v_corpo text := trim(coalesce(p_corpo, ''));
begin
  select * into m from public.chat_mensagens where id = p_id for update;
  if not found or not (select private.chat_pode_ver(m.canal_id)) then raise exception 'Mensagem não encontrada.' using errcode = 'P0001'; end if;
  if m.autor_id is distinct from (select auth.uid()) then raise exception 'Só quem escreveu edita a mensagem.' using errcode = 'P0001'; end if;
  if m.apagada_em is not null then raise exception 'Esta mensagem foi apagada.' using errcode = 'P0001'; end if;
  if (char_length(v_corpo) < 1 and jsonb_array_length(m.anexos) = 0) or char_length(v_corpo) > 8000 then
    raise exception 'A mensagem precisa ter entre 1 e 8.000 caracteres.' using errcode = 'P0001';
  end if;
  if v_corpo = m.corpo then return; end if;
  insert into public.chat_versoes (workspace_id, mensagem_id, acao, corpo, por) values (m.workspace_id, m.id, 'edicao', m.corpo, (select auth.uid()));
  update public.chat_mensagens set corpo = v_corpo, editada_em = now() where id = p_id;
end $$;

-- Apagar tira texto, arquivos e reações da conversa; o original (e o registro dos arquivos) fica guardado.
create or replace function public.chat_apagar(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  m public.chat_mensagens;
begin
  select * into m from public.chat_mensagens where id = p_id for update;
  if not found or not (select private.chat_pode_ver(m.canal_id)) then raise exception 'Mensagem não encontrada.' using errcode = 'P0001'; end if;
  if m.autor_id is distinct from (select auth.uid()) and (select private.workspace_role(m.workspace_id)) is distinct from 'admin' then
    raise exception 'Só quem escreveu (ou um administrador) apaga a mensagem.' using errcode = 'P0001';
  end if;
  if m.apagada_em is not null then return; end if;
  insert into public.chat_versoes (workspace_id, mensagem_id, acao, corpo, por, anexos)
  values (m.workspace_id, m.id, 'apagada', m.corpo, (select auth.uid()), nullif(m.anexos, '[]'::jsonb));
  update public.chat_mensagens set corpo = '', mencoes = '{}', menciona_todos = false, anexos = '[]', reacoes = '[]',
    apagada_em = now(), apagada_por = (select auth.uid()) where id = p_id;
end $$;

-- Abrir um arquivo: quem vê a conversa (se a mensagem não foi apagada) ou o administrador.
create or replace function public.chat_abrir_anexo(p_id uuid)
returns table (caminho text, nome text, mime text)
language sql security definer set search_path = '' stable as $$
  select a.caminho, a.nome, a.mime
  from public.chat_anexos a join public.chat_mensagens m on m.id = a.mensagem_id
  where a.id = p_id
    and (((select private.chat_pode_ver(a.canal_id)) and m.apagada_em is null)
      or (select private.workspace_role(a.workspace_id)) = 'admin')
$$;

-- ---------------------------------------------------------------- reações

-- Liga e desliga a reação de quem está logado. Num canal aberto, reagir faz entrar (como escrever).
create or replace function public.chat_reagir(p_id uuid, p_emoji text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.chat_mensagens;
  v_eu uuid := (select auth.uid());
  v_emoji text := trim(coalesce(p_emoji, ''));
  v_reacoes jsonb;
begin
  select * into m from public.chat_mensagens where id = p_id for update;
  if not found or not (select private.chat_pode_ver(m.canal_id)) then raise exception 'Mensagem não encontrada.' using errcode = 'P0001'; end if;
  if m.apagada_em is not null then raise exception 'Esta mensagem foi apagada.' using errcode = 'P0001'; end if;
  if char_length(v_emoji) < 1 or char_length(v_emoji) > 16 or v_emoji ~ '[[:alnum:][:space:]<>&"''\\]' then
    raise exception 'Reação inválida.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.chat_canais c where c.id = m.canal_id and c.arquivado) then
    raise exception 'Este canal foi arquivado: dá para ler, não para reagir.' using errcode = 'P0001';
  end if;
  if not (select private.chat_membro(m.canal_id)) then
    insert into public.chat_membros (canal_id, user_id, workspace_id) values (m.canal_id, v_eu, m.workspace_id) on conflict do nothing;
  end if;
  if exists (select 1 from public.chat_reacoes r where r.mensagem_id = p_id and r.user_id = v_eu and r.emoji = v_emoji) then
    delete from public.chat_reacoes r where r.mensagem_id = p_id and r.user_id = v_eu and r.emoji = v_emoji;
  else
    if (select count(distinct r.emoji) from public.chat_reacoes r where r.mensagem_id = p_id and r.emoji <> v_emoji) >= 20 then
      raise exception 'Esta mensagem já tem reações demais.' using errcode = 'P0001';
    end if;
    insert into public.chat_reacoes (mensagem_id, user_id, emoji, workspace_id, canal_id) values (p_id, v_eu, v_emoji, m.workspace_id, m.canal_id);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('emoji', x.emoji, 'pessoas', x.pessoas) order by x.primeira), '[]') into v_reacoes
  from (
    select r.emoji, jsonb_agg(r.user_id order by r.created_at) pessoas, min(r.created_at) primeira
    from public.chat_reacoes r where r.mensagem_id = p_id group by r.emoji
  ) x;
  update public.chat_mensagens set reacoes = v_reacoes where id = p_id;
  return v_reacoes;
end $$;

-- ---------------------------------------------------------------- lista, contador e resumo: respostas em fio não contam como "não lidas"

create or replace function public.chat_painel(p_workspace_id uuid)
returns table (id uuid, tipo text, nome text, descricao text, privado boolean, geral boolean, setor_id uuid, arquivado boolean,
  membro boolean, avisar text, nao_lidas integer, mencoes integer, ultima_mensagem_em timestamptz, pessoas uuid[])
language sql security definer set search_path = '' stable as $$
  select c.id, c.tipo, c.nome, c.descricao, c.privado, c.geral, c.setor_id, c.arquivado,
    m.user_id is not null, coalesce(m.avisar, 'mencoes'),
    coalesce((select count(*)::integer from public.chat_mensagens x
      where m.user_id is not null and x.canal_id = c.id and x.created_at > m.lido_ate and x.autor_id is distinct from (select auth.uid())
        and x.apagada_em is null and x.resposta_de is null), 0),
    coalesce((select count(*)::integer from public.chat_mensagens x
      where m.user_id is not null and x.canal_id = c.id and x.created_at > m.lido_ate and x.autor_id is distinct from (select auth.uid()) and x.apagada_em is null
        and ((select auth.uid()) = any (x.mencoes) or x.menciona_todos)), 0),
    c.ultima_mensagem_em,
    case when c.tipo = 'direta' then (select array_agg(o.user_id) from public.chat_membros o where o.canal_id = c.id and o.user_id <> (select auth.uid())) end
  from public.chat_canais c
  left join public.chat_membros m on m.canal_id = c.id and m.user_id = (select auth.uid())
  where c.workspace_id = p_workspace_id and (select private.chat_do_espaco(p_workspace_id))
    and (m.user_id is not null or (c.tipo = 'canal' and not c.privado and not c.arquivado and (select private.is_workspace_member(p_workspace_id))))
  order by c.geral desc, c.ultima_mensagem_em desc nulls last
$$;

create or replace function public.chat_resumo_do_dia()
returns table (user_id uuid, workspace_id uuid, canal_id uuid, nome text, novas integer)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with contas as (
    select m.user_id, m.workspace_id, m.canal_id, c.nome, count(x.id)::integer novas
    from public.chat_membros m
    join public.chat_canais c on c.id = m.canal_id and c.tipo = 'canal' and not c.arquivado
    join public.chat_mensagens x on x.canal_id = m.canal_id and x.apagada_em is null and x.resposta_de is null and x.autor_id is distinct from m.user_id
      and x.created_at > greatest(m.lido_ate, coalesce(m.resumo_ate, m.lido_ate), now() - interval '3 days')
    where m.avisar <> 'nada'
    group by m.user_id, m.workspace_id, m.canal_id, c.nome
  ), marcadas as (
    update public.chat_membros m set resumo_ate = now() from contas k where m.canal_id = k.canal_id and m.user_id = k.user_id returning 1
  )
  select k.user_id, k.workspace_id, k.canal_id, k.nome, k.novas from contas k where (select count(*) from marcadas) >= 0;
end $$;

-- ---------------------------------------------------------------- busca

-- Procura no que a pessoa pode ver: texto (por começo de palavra, sem acento) e nome de arquivo.
-- Filtros: uma conversa, uma pessoa, só menções a mim, só com arquivo. Sem texto, valem os filtros.
create or replace function public.chat_buscar(p_workspace_id uuid, p_texto text, p_canal_id uuid default null, p_autor_id uuid default null,
  p_so_mencoes boolean default false, p_com_arquivos boolean default false, p_limite integer default 40)
returns table (id uuid, canal_id uuid, autor_id uuid, corpo text, created_at timestamptz, resposta_de uuid, anexos jsonb,
  canal_tipo text, canal_nome text, pessoas uuid[])
language plpgsql security definer set search_path = '' stable as $$
declare
  v_eu uuid := (select auth.uid());
  v_termo text := trim(regexp_replace(private.chave_do_nome(left(coalesce(p_texto, ''), 200)), '[^a-z0-9 ]+', ' ', 'g'));
  v_txt text;
  v_q tsquery;
begin
  if not (select private.chat_do_espaco(p_workspace_id)) then raise exception 'Sem acesso ao chat.' using errcode = 'P0001'; end if;
  select string_agg(p || ':*', ' & ') into v_txt from regexp_split_to_table(v_termo, '\s+') p where p <> '';
  if v_txt is null and not coalesce(p_so_mencoes, false) and not coalesce(p_com_arquivos, false) and p_autor_id is null then return; end if;
  if v_txt is not null then v_q := to_tsquery('simple', v_txt); end if;
  return query
  select x.id, x.canal_id, x.autor_id, x.corpo, x.created_at, x.resposta_de, x.anexos, c.tipo, c.nome,
    case when c.tipo = 'direta' then (select array_agg(o.user_id) from public.chat_membros o where o.canal_id = c.id and o.user_id <> v_eu) end
  from public.chat_mensagens x
  join public.chat_canais c on c.id = x.canal_id
  left join public.chat_membros m on m.canal_id = c.id and m.user_id = v_eu
  where x.workspace_id = p_workspace_id and c.workspace_id = p_workspace_id and x.apagada_em is null
    and (m.user_id is not null or (c.tipo = 'canal' and not c.privado and (select private.is_workspace_member(p_workspace_id))))
    and (p_canal_id is null or x.canal_id = p_canal_id)
    and (p_autor_id is null or x.autor_id = p_autor_id)
    and (not coalesce(p_so_mencoes, false) or v_eu = any (x.mencoes) or (x.menciona_todos and m.user_id is not null))
    and (not coalesce(p_com_arquivos, false) or jsonb_array_length(x.anexos) > 0)
    and (v_q is null or x.busca @@ v_q
      or exists (select 1 from jsonb_array_elements(x.anexos) a where strpos(private.chave_do_nome(a->>'nome'), v_termo) > 0))
  order by x.created_at desc
  limit least(greatest(coalesce(p_limite, 40), 1), 100);
end $$;

revoke all on function public.chat_enviar(uuid, text, uuid[], boolean, uuid, jsonb), public.chat_abrir_anexo(uuid), public.chat_reagir(uuid, text),
  public.chat_buscar(uuid, text, uuid, uuid, boolean, boolean, integer) from public, anon;
grant execute on function public.chat_enviar(uuid, text, uuid[], boolean, uuid, jsonb), public.chat_abrir_anexo(uuid), public.chat_reagir(uuid, text),
  public.chat_buscar(uuid, text, uuid, uuid, boolean, boolean, integer) to authenticated;
