-- Chat (1): o bate-papo da equipe, no jeito do Slack. Canais (o #geral com
-- todo mundo, um por setor com quem é do setor, e os que a equipe criar,
-- abertos ou privados) e mensagens diretas (de duas até nove pessoas).
--
-- Nada some: editar guarda a versão anterior e apagar tira o texto da tela,
-- mas o original fica em chat_versoes, que só administrador lê.
--
-- Quem vê o quê:
--  - canal aberto: qualquer membro da Redação (lê e entra quando quiser);
--  - canal privado, setor e mensagem direta: só quem é membro;
--  - a equipe da escola só vê os canais para que foi chamada e as diretas.
--
-- Escrita só pelas funções abaixo (o banco confere quem pode); as tabelas
-- têm apenas política de leitura. As mensagens vão para o Realtime: a tela
-- recebe na hora, e o RLS decide quem recebe o quê.

-- ---------------------------------------------------------------- tabelas

create table if not exists public.chat_canais (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  tipo                text not null check (tipo in ('canal', 'direta')),
  nome                text check (nome ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  descricao           text not null default '' check (char_length(descricao) <= 300),
  privado             boolean not null default false,
  geral               boolean not null default false,
  setor_id            uuid references public.setores (id) on delete set null,
  -- Direta: os ids dos participantes em ordem, separados por vírgula (acha a conversa já existente).
  chave               text,
  criado_por          uuid references public.profiles (id) on delete set null,
  arquivado           boolean not null default false,
  ultima_mensagem_em  timestamptz,
  created_at          timestamptz not null default now(),
  check ((tipo = 'canal') = (nome is not null)),
  check ((tipo = 'direta') = (chave is not null))
);
create unique index if not exists chat_canais_nome_idx on public.chat_canais (workspace_id, nome) where tipo = 'canal';
create unique index if not exists chat_canais_geral_idx on public.chat_canais (workspace_id) where geral;
create unique index if not exists chat_canais_setor_idx on public.chat_canais (workspace_id, setor_id) where setor_id is not null;
create unique index if not exists chat_canais_chave_idx on public.chat_canais (workspace_id, chave) where tipo = 'direta';
create index if not exists chat_canais_criado_por_idx on public.chat_canais (criado_por);
create index if not exists chat_canais_setor_fk_idx on public.chat_canais (setor_id);

create table if not exists public.chat_membros (
  canal_id      uuid not null references public.chat_canais (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  -- Entrou sozinho (#geral, canal do setor): sai sozinho quando deixa o setor.
  automatico    boolean not null default false,
  -- O que vira aviso: toda mensagem, só menções (padrão nos canais) ou nada.
  avisar        text not null default 'mencoes' check (avisar in ('tudo', 'mencoes', 'nada')),
  lido_ate      timestamptz not null default now(),
  -- Até onde o resumo diário já contou (para não repetir as mesmas mensagens).
  resumo_ate    timestamptz,
  entrou_em     timestamptz not null default now(),
  primary key (canal_id, user_id)
);
create index if not exists chat_membros_user_idx on public.chat_membros (user_id);
create index if not exists chat_membros_workspace_idx on public.chat_membros (workspace_id);

create table if not exists public.chat_mensagens (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  canal_id        uuid not null references public.chat_canais (id) on delete cascade,
  autor_id        uuid references public.profiles (id) on delete set null,
  corpo           text not null default '' check (char_length(corpo) <= 8000),
  mencoes         uuid[] not null default '{}',
  menciona_todos  boolean not null default false,
  editada_em      timestamptz,
  apagada_em      timestamptz,
  apagada_por     uuid references public.profiles (id) on delete set null,
  -- De onde veio uma mensagem trazida de outro lugar (ex.: 'messages:<id>', as conversas diretas antigas).
  origem_ref      text unique,
  created_at      timestamptz not null default now()
);
create index if not exists chat_mensagens_canal_idx on public.chat_mensagens (canal_id, created_at desc);
create index if not exists chat_mensagens_workspace_idx on public.chat_mensagens (workspace_id, created_at desc);
create index if not exists chat_mensagens_autor_idx on public.chat_mensagens (autor_id);
create index if not exists chat_mensagens_apagada_por_idx on public.chat_mensagens (apagada_por);

-- Toda edição e todo apagamento guardam o texto de antes. Só administrador lê.
create table if not exists public.chat_versoes (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  mensagem_id   uuid not null references public.chat_mensagens (id) on delete cascade,
  acao          text not null check (acao in ('edicao', 'apagada')),
  corpo         text not null,
  por           uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists chat_versoes_mensagem_idx on public.chat_versoes (mensagem_id);
create index if not exists chat_versoes_workspace_idx on public.chat_versoes (workspace_id);
create index if not exists chat_versoes_por_idx on public.chat_versoes (por);

-- ---------------------------------------------------------------- quem vê

-- Pessoa do espaço que usa o chat: membro da Redação ou equipe da escola (ativos, verificação em dia).
create or replace function private.chat_do_espaco(p_workspace_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select (select private.is_workspace_member(p_workspace_id)) or coalesce((select private.workspace_role(p_workspace_id)) = 'escola', false)
$$;

create or replace function private.chat_membro(p_canal_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.chat_membros m join public.chat_canais c on c.id = m.canal_id
    where m.canal_id = p_canal_id and m.user_id = (select auth.uid()) and (select private.chat_do_espaco(c.workspace_id))
  )
$$;

create or replace function private.chat_pode_ver(p_canal_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select (select private.chat_membro(p_canal_id)) or exists (
    select 1 from public.chat_canais c
    where c.id = p_canal_id and c.tipo = 'canal' and not c.privado and (select private.is_workspace_member(c.workspace_id))
  )
$$;

revoke all on function private.chat_do_espaco(uuid), private.chat_membro(uuid), private.chat_pode_ver(uuid) from public, anon;
grant execute on function private.chat_do_espaco(uuid), private.chat_membro(uuid), private.chat_pode_ver(uuid) to authenticated;

alter table public.chat_canais enable row level security;
alter table public.chat_membros enable row level security;
alter table public.chat_mensagens enable row level security;
alter table public.chat_versoes enable row level security;
revoke all on public.chat_canais, public.chat_membros, public.chat_mensagens, public.chat_versoes from anon;
revoke insert, update, delete, truncate, references, trigger on public.chat_canais, public.chat_membros, public.chat_mensagens, public.chat_versoes from authenticated;
grant select on public.chat_canais, public.chat_membros, public.chat_mensagens, public.chat_versoes to authenticated;

create policy chat_canais_select on public.chat_canais for select to authenticated using ((select private.chat_pode_ver(id)));
create policy chat_membros_select on public.chat_membros for select to authenticated using ((select private.chat_pode_ver(canal_id)));
create policy chat_mensagens_select on public.chat_mensagens for select to authenticated using ((select private.chat_pode_ver(canal_id)));
create policy chat_versoes_select on public.chat_versoes for select to authenticated using ((select private.workspace_role(workspace_id)) = 'admin');

-- ---------------------------------------------------------------- canais que se fazem sozinhos

-- "Psicologia / Serviço Social" → "psicologia-servico-social".
create or replace function private.chat_slug(p text)
returns text language sql immutable set search_path = '' as $$
  select left(trim(both '-' from regexp_replace(private.chave_do_nome(p), '[^a-z0-9]+', '-', 'g')), 40)
$$;

-- O #geral, um canal por setor e quem é de cada um. Idempotente.
create or replace function private.chat_semear(p_workspace_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_geral uuid;
  s record;
  v_nome text;
  v_canal uuid;
begin
  insert into public.chat_canais (workspace_id, tipo, nome, descricao, geral)
  values (p_workspace_id, 'canal', 'geral', 'Avisos e conversa de toda a equipe.', true)
  on conflict do nothing;
  select id into v_geral from public.chat_canais where workspace_id = p_workspace_id and geral;
  insert into public.chat_membros (canal_id, user_id, workspace_id, automatico)
  select v_geral, m.user_id, p_workspace_id, true from public.workspace_members m
  where m.workspace_id = p_workspace_id and m.role <> 'escola'
  on conflict do nothing;

  for s in select id, nome from public.setores where workspace_id = p_workspace_id loop
    select id into v_canal from public.chat_canais where workspace_id = p_workspace_id and setor_id = s.id;
    if v_canal is null then
      v_nome := private.chat_slug(s.nome);
      if char_length(v_nome) < 2 or exists (select 1 from public.chat_canais where workspace_id = p_workspace_id and tipo = 'canal' and nome = v_nome) then
        v_nome := left(v_nome, 31) || '-' || left(replace(s.id::text, '-', ''), 8);
      end if;
      insert into public.chat_canais (workspace_id, tipo, nome, descricao, privado, setor_id)
      values (p_workspace_id, 'canal', v_nome, 'Canal do setor ' || s.nome || '.', true, s.id)
      returning id into v_canal;
    end if;
    insert into public.chat_membros (canal_id, user_id, workspace_id, automatico)
    select v_canal, sm.user_id, p_workspace_id, true from public.setor_membros sm where sm.setor_id = s.id
    on conflict do nothing;
  end loop;
end $$;
revoke all on function private.chat_slug(text), private.chat_semear(uuid) from public, anon, authenticated;

-- Membro novo da Redação entra no #geral; quem vira equipe da escola sai dele; quem sai do espaço sai de tudo.
create or replace function private.chat_membro_do_espaco()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.chat_membros where workspace_id = old.workspace_id and user_id = old.user_id;
    return old;
  end if;
  if new.role = 'escola' then
    delete from public.chat_membros m using public.chat_canais c
    where c.id = m.canal_id and c.geral and m.workspace_id = new.workspace_id and m.user_id = new.user_id;
  else
    insert into public.chat_membros (canal_id, user_id, workspace_id, automatico)
    select c.id, new.user_id, new.workspace_id, true from public.chat_canais c where c.workspace_id = new.workspace_id and c.geral
    on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function private.chat_membro_do_espaco() from public, anon, authenticated;
drop trigger if exists chat_membro_do_espaco on public.workspace_members;
create trigger chat_membro_do_espaco after insert or update of role or delete on public.workspace_members
  for each row execute function private.chat_membro_do_espaco();

-- Quem entra num setor entra no canal dele; quem sai, sai (se tinha entrado sozinho).
create or replace function private.chat_membro_do_setor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.chat_membros m using public.chat_canais c
    where c.id = m.canal_id and c.setor_id = old.setor_id and m.user_id = old.user_id and m.automatico;
    return old;
  end if;
  insert into public.chat_membros (canal_id, user_id, workspace_id, automatico)
  select c.id, new.user_id, new.workspace_id, true from public.chat_canais c where c.setor_id = new.setor_id
  on conflict do nothing;
  return new;
end $$;
revoke all on function private.chat_membro_do_setor() from public, anon, authenticated;
drop trigger if exists chat_membro_do_setor on public.setor_membros;
create trigger chat_membro_do_setor after insert or delete on public.setor_membros
  for each row execute function private.chat_membro_do_setor();

-- Setor novo ganha o canal dele.
create or replace function private.chat_setor_novo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.chat_semear(new.workspace_id);
  return new;
end $$;
revoke all on function private.chat_setor_novo() from public, anon, authenticated;
drop trigger if exists chat_setor_novo on public.setores;
create trigger chat_setor_novo after insert on public.setores
  for each row execute function private.chat_setor_novo();

-- ---------------------------------------------------------------- escrever

create or replace function public.chat_preparar(p_workspace_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.chat_do_espaco(p_workspace_id)) then raise exception 'Sem acesso ao chat.' using errcode = 'P0001'; end if;
  perform private.chat_semear(p_workspace_id);
end $$;

-- Envia. Num canal aberto, quem não é membro entra ao escrever (como no Slack).
create or replace function public.chat_enviar(p_canal_id uuid, p_corpo text, p_mencoes uuid[] default '{}', p_todos boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.chat_canais;
  v_corpo text := trim(coalesce(p_corpo, ''));
  v_mencoes uuid[];
  v_id uuid;
  v_em timestamptz;
begin
  select * into c from public.chat_canais where id = p_canal_id;
  if not found or not (select private.chat_pode_ver(p_canal_id)) then raise exception 'Conversa não encontrada.' using errcode = 'P0001'; end if;
  if c.arquivado then raise exception 'Este canal foi arquivado: dá para ler, não para escrever.' using errcode = 'P0001'; end if;
  if char_length(v_corpo) < 1 then raise exception 'Escreva a mensagem.' using errcode = 'P0001'; end if;
  if char_length(v_corpo) > 8000 then raise exception 'A mensagem pode ter até 8.000 caracteres.' using errcode = 'P0001'; end if;
  if not (select private.chat_membro(p_canal_id)) then
    insert into public.chat_membros (canal_id, user_id, workspace_id) values (p_canal_id, (select auth.uid()), c.workspace_id) on conflict do nothing;
  end if;
  -- Só vale menção a quem está na conversa.
  select coalesce(array_agg(distinct m.user_id), '{}') into v_mencoes from public.chat_membros m
  where m.canal_id = p_canal_id and m.user_id = any (coalesce(p_mencoes, '{}')) and m.user_id <> (select auth.uid());
  insert into public.chat_mensagens (workspace_id, canal_id, autor_id, corpo, mencoes, menciona_todos)
  values (c.workspace_id, p_canal_id, (select auth.uid()), v_corpo, v_mencoes, coalesce(p_todos, false) and c.tipo = 'canal')
  returning id, created_at into v_id, v_em;
  update public.chat_canais set ultima_mensagem_em = v_em where id = p_canal_id;
  update public.chat_membros set lido_ate = v_em where canal_id = p_canal_id and user_id = (select auth.uid());
  return jsonb_build_object('id', v_id, 'created_at', v_em, 'mencoes', to_jsonb(v_mencoes));
end $$;

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
  if char_length(v_corpo) < 1 or char_length(v_corpo) > 8000 then raise exception 'A mensagem precisa ter entre 1 e 8.000 caracteres.' using errcode = 'P0001'; end if;
  if v_corpo = m.corpo then return; end if;
  insert into public.chat_versoes (workspace_id, mensagem_id, acao, corpo, por) values (m.workspace_id, m.id, 'edicao', m.corpo, (select auth.uid()));
  update public.chat_mensagens set corpo = v_corpo, editada_em = now() where id = p_id;
end $$;

-- Apagar tira o texto da conversa; o original fica guardado em chat_versoes.
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
  insert into public.chat_versoes (workspace_id, mensagem_id, acao, corpo, por) values (m.workspace_id, m.id, 'apagada', m.corpo, (select auth.uid()));
  update public.chat_mensagens set corpo = '', mencoes = '{}', menciona_todos = false, apagada_em = now(), apagada_por = (select auth.uid()) where id = p_id;
end $$;

create or replace function public.chat_criar_canal(p_workspace_id uuid, p_nome text, p_descricao text, p_privado boolean, p_membros uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_nome text := private.chat_slug(p_nome);
  v_id uuid;
begin
  if not (select private.is_workspace_member(p_workspace_id)) then raise exception 'Só a equipe da Redação cria canais.' using errcode = 'P0001'; end if;
  if char_length(v_nome) < 2 then raise exception 'Dê um nome ao canal (letras e números).' using errcode = 'P0001'; end if;
  if exists (select 1 from public.chat_canais where workspace_id = p_workspace_id and tipo = 'canal' and nome = v_nome) then
    raise exception 'Já existe um canal #%.', v_nome using errcode = 'P0001';
  end if;
  insert into public.chat_canais (workspace_id, tipo, nome, descricao, privado, criado_por)
  values (p_workspace_id, 'canal', v_nome, left(trim(coalesce(p_descricao, '')), 300), coalesce(p_privado, false), (select auth.uid()))
  returning id into v_id;
  insert into public.chat_membros (canal_id, user_id, workspace_id)
  select v_id, u, p_workspace_id from (select (select auth.uid()) u union select unnest(coalesce(p_membros, '{}'))) x
  where exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = x.u)
  on conflict do nothing;
  return v_id;
end $$;

-- A conversa direta com estas pessoas (a que já existe, ou uma nova).
create or replace function public.chat_abrir_direta(p_workspace_id uuid, p_pessoas uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_eu uuid := (select auth.uid());
  v_todos uuid[];
  v_chave text;
  v_id uuid;
begin
  if not (select private.chat_do_espaco(p_workspace_id)) then raise exception 'Sem acesso ao chat.' using errcode = 'P0001'; end if;
  select array_agg(distinct u order by u) into v_todos from unnest(coalesce(p_pessoas, '{}') || v_eu) u;
  if array_length(v_todos, 1) < 2 then raise exception 'Escolha com quem conversar.' using errcode = 'P0001'; end if;
  if array_length(v_todos, 1) > 9 then raise exception 'Conversa direta vai até 9 pessoas; para mais, crie um canal.' using errcode = 'P0001'; end if;
  if (select count(*) from public.workspace_members m join public.profiles p on p.id = m.user_id
      where m.workspace_id = p_workspace_id and m.user_id = any (v_todos) and p.active) <> array_length(v_todos, 1) then
    raise exception 'Alguém da lista não é do espaço.' using errcode = 'P0001';
  end if;
  v_chave := array_to_string(v_todos, ',');
  select id into v_id from public.chat_canais where workspace_id = p_workspace_id and tipo = 'direta' and chave = v_chave;
  if v_id is null then
    insert into public.chat_canais (workspace_id, tipo, chave, privado, criado_por) values (p_workspace_id, 'direta', v_chave, true, v_eu)
    on conflict do nothing returning id into v_id;
    if v_id is null then select id into v_id from public.chat_canais where workspace_id = p_workspace_id and tipo = 'direta' and chave = v_chave; end if;
    -- Em conversa direta, toda mensagem é aviso.
    insert into public.chat_membros (canal_id, user_id, workspace_id, avisar) select v_id, u, p_workspace_id, 'tudo' from unnest(v_todos) u on conflict do nothing;
  end if;
  return v_id;
end $$;

create or replace function public.chat_entrar(p_canal_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.chat_canais;
begin
  select * into c from public.chat_canais where id = p_canal_id;
  if not found or c.tipo <> 'canal' or c.privado or not (select private.is_workspace_member(c.workspace_id)) then
    raise exception 'Canal não encontrado.' using errcode = 'P0001';
  end if;
  insert into public.chat_membros (canal_id, user_id, workspace_id) values (p_canal_id, (select auth.uid()), c.workspace_id) on conflict do nothing;
end $$;

create or replace function public.chat_sair(p_canal_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.chat_canais;
begin
  select * into c from public.chat_canais where id = p_canal_id;
  if not found or not (select private.chat_membro(p_canal_id)) then raise exception 'Você não está nesta conversa.' using errcode = 'P0001'; end if;
  if c.geral then raise exception 'Todo mundo fica no #geral (dá para silenciar).' using errcode = 'P0001'; end if;
  if c.setor_id is not null and exists (select 1 from public.setor_membros sm where sm.setor_id = c.setor_id and sm.user_id = (select auth.uid())) then
    raise exception 'Você é do setor: o canal dele acompanha (dá para silenciar).' using errcode = 'P0001';
  end if;
  delete from public.chat_membros where canal_id = p_canal_id and user_id = (select auth.uid());
end $$;

-- Chamar pessoas para um canal (quem já está nele chama). A equipe da escola também pode ser chamada.
create or replace function public.chat_adicionar(p_canal_id uuid, p_pessoas uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  c public.chat_canais;
  v_total integer;
begin
  select * into c from public.chat_canais where id = p_canal_id;
  if not found or c.tipo <> 'canal' or not (select private.chat_pode_ver(p_canal_id)) then raise exception 'Canal não encontrado.' using errcode = 'P0001'; end if;
  if not (select private.is_workspace_member(c.workspace_id)) then raise exception 'Só a equipe da Redação chama pessoas para um canal.' using errcode = 'P0001'; end if;
  with novos as (
    insert into public.chat_membros (canal_id, user_id, workspace_id)
    select p_canal_id, m.user_id, c.workspace_id from public.workspace_members m
    where m.workspace_id = c.workspace_id and m.user_id = any (coalesce(p_pessoas, '{}'))
    on conflict do nothing returning 1
  ) select count(*) into v_total from novos;
  return v_total;
end $$;

-- Tirar alguém de um canal: quem criou o canal ou um administrador.
create or replace function public.chat_remover(p_canal_id uuid, p_pessoa uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.chat_canais;
begin
  select * into c from public.chat_canais where id = p_canal_id;
  if not found or c.tipo <> 'canal' or c.geral then raise exception 'Canal não encontrado.' using errcode = 'P0001'; end if;
  if c.criado_por is distinct from (select auth.uid()) and (select private.workspace_role(c.workspace_id)) is distinct from 'admin' then
    raise exception 'Só quem criou o canal (ou um administrador) tira pessoas.' using errcode = 'P0001';
  end if;
  delete from public.chat_membros where canal_id = p_canal_id and user_id = p_pessoa;
end $$;

create or replace function public.chat_editar_canal(p_canal_id uuid, p_descricao text, p_arquivado boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.chat_canais;
begin
  select * into c from public.chat_canais where id = p_canal_id;
  if not found or c.tipo <> 'canal' then raise exception 'Canal não encontrado.' using errcode = 'P0001'; end if;
  if c.criado_por is distinct from (select auth.uid()) and (select private.workspace_role(c.workspace_id)) is distinct from 'admin' then
    raise exception 'Só quem criou o canal (ou um administrador) muda a descrição ou arquiva.' using errcode = 'P0001';
  end if;
  if c.geral and coalesce(p_arquivado, false) then raise exception 'O #geral não se arquiva.' using errcode = 'P0001'; end if;
  update public.chat_canais set descricao = left(trim(coalesce(p_descricao, descricao)), 300), arquivado = coalesce(p_arquivado, arquivado) where id = p_canal_id;
end $$;

create or replace function public.chat_ler(p_canal_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.chat_membros set lido_ate = greatest(lido_ate, now()) where canal_id = p_canal_id and user_id = (select auth.uid())
$$;

create or replace function public.chat_avisos(p_canal_id uuid, p_avisar text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_avisar not in ('tudo', 'mencoes', 'nada') then raise exception 'Opção inválida.' using errcode = 'P0001'; end if;
  update public.chat_membros set avisar = p_avisar where canal_id = p_canal_id and user_id = (select auth.uid());
  if not found then raise exception 'Você não está nesta conversa.' using errcode = 'P0001'; end if;
end $$;

-- ---------------------------------------------------------------- ler: a lista da lateral e o contador

-- As conversas de quem está logado (e os canais abertos em que ainda não entrou), com o que falta ler.
create or replace function public.chat_painel(p_workspace_id uuid)
returns table (id uuid, tipo text, nome text, descricao text, privado boolean, geral boolean, setor_id uuid, arquivado boolean,
  membro boolean, avisar text, nao_lidas integer, mencoes integer, ultima_mensagem_em timestamptz, pessoas uuid[])
language sql security definer set search_path = '' stable as $$
  select c.id, c.tipo, c.nome, c.descricao, c.privado, c.geral, c.setor_id, c.arquivado,
    m.user_id is not null, coalesce(m.avisar, 'mencoes'),
    coalesce((select count(*)::integer from public.chat_mensagens x
      where m.user_id is not null and x.canal_id = c.id and x.created_at > m.lido_ate and x.autor_id is distinct from (select auth.uid()) and x.apagada_em is null), 0),
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

-- O número ao lado de "Chat" no menu: diretas não lidas, menções e canais em "toda mensagem".
create or replace function public.chat_nao_lidas(p_workspace_id uuid)
returns integer language sql security definer set search_path = '' stable as $$
  select coalesce(sum(case when p.tipo = 'direta' or p.avisar = 'tudo' then p.nao_lidas else p.mencoes end), 0)::integer
  from public.chat_painel(p_workspace_id) p where p.membro and p.avisar <> 'nada'
$$;

-- O resumo diário: por pessoa, quantas mensagens novas em cada canal desde a última leitura ou o último resumo.
-- Marca até onde contou, para o dia seguinte não repetir. Só a service role chama (o cron).
create or replace function public.chat_resumo_do_dia()
returns table (user_id uuid, workspace_id uuid, canal_id uuid, nome text, novas integer)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with contas as (
    select m.user_id, m.workspace_id, m.canal_id, c.nome, count(x.id)::integer novas
    from public.chat_membros m
    join public.chat_canais c on c.id = m.canal_id and c.tipo = 'canal' and not c.arquivado
    join public.chat_mensagens x on x.canal_id = m.canal_id and x.apagada_em is null and x.autor_id is distinct from m.user_id
      and x.created_at > greatest(m.lido_ate, coalesce(m.resumo_ate, m.lido_ate), now() - interval '3 days')
    where m.avisar <> 'nada'
    group by m.user_id, m.workspace_id, m.canal_id, c.nome
  ), marcadas as (
    update public.chat_membros m set resumo_ate = now() from contas k where m.canal_id = k.canal_id and m.user_id = k.user_id returning 1
  )
  select k.user_id, k.workspace_id, k.canal_id, k.nome, k.novas from contas k where (select count(*) from marcadas) >= 0;
end $$;

revoke all on function public.chat_preparar(uuid), public.chat_enviar(uuid, text, uuid[], boolean), public.chat_editar(uuid, text), public.chat_apagar(uuid),
  public.chat_criar_canal(uuid, text, text, boolean, uuid[]), public.chat_abrir_direta(uuid, uuid[]), public.chat_entrar(uuid), public.chat_sair(uuid),
  public.chat_adicionar(uuid, uuid[]), public.chat_remover(uuid, uuid), public.chat_editar_canal(uuid, text, boolean), public.chat_ler(uuid),
  public.chat_avisos(uuid, text), public.chat_painel(uuid), public.chat_nao_lidas(uuid), public.chat_resumo_do_dia() from public, anon;
grant execute on function public.chat_preparar(uuid), public.chat_enviar(uuid, text, uuid[], boolean), public.chat_editar(uuid, text), public.chat_apagar(uuid),
  public.chat_criar_canal(uuid, text, text, boolean, uuid[]), public.chat_abrir_direta(uuid, uuid[]), public.chat_entrar(uuid), public.chat_sair(uuid),
  public.chat_adicionar(uuid, uuid[]), public.chat_remover(uuid, uuid), public.chat_editar_canal(uuid, text, boolean), public.chat_ler(uuid),
  public.chat_avisos(uuid, text), public.chat_painel(uuid), public.chat_nao_lidas(uuid) to authenticated;
revoke all on function public.chat_resumo_do_dia() from authenticated;
grant execute on function public.chat_resumo_do_dia() to service_role;

-- ---------------------------------------------------------------- aviso "chat" e tempo real

do $$
declare
  v_def text;
  v_lista text[];
begin
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'public.notifications'::regclass and c.conname = 'notifications_categoria_valida';
  if v_def is null then return; end if;
  select array_agg(distinct m[1] order by m[1]) into v_lista from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
  if 'chat' = any (v_lista) then return; end if;
  v_lista := v_lista || array['chat'];
  alter table public.notifications drop constraint notifications_categoria_valida;
  execute format('alter table public.notifications add constraint notifications_categoria_valida check (categoria = any (%L::text[]))', v_lista);
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_mensagens') then
    alter publication supabase_realtime add table public.chat_mensagens;
  end if;
end $$;

-- ---------------------------------------------------------------- começar: canais e as conversas diretas antigas

do $$
declare
  w uuid;
  r record;
  v_canal uuid;
  v_chave text;
begin
  for w in select id from public.workspaces loop perform private.chat_semear(w); end loop;

  -- As conversas diretas de "Conversas" viram mensagens diretas do chat, com data e autor.
  for r in select x.* from public.messages x where x.recipient_id is not null and x.author_id is not null order by x.created_at loop
    v_chave := array_to_string(array(select u from unnest(array[r.author_id, r.recipient_id]) u group by u order by u), ',');
    select id into v_canal from public.chat_canais where workspace_id = r.workspace_id and tipo = 'direta' and chave = v_chave;
    if v_canal is null then
      insert into public.chat_canais (workspace_id, tipo, chave, privado, criado_por) values (r.workspace_id, 'direta', v_chave, true, r.author_id)
      returning id into v_canal;
      insert into public.chat_membros (canal_id, user_id, workspace_id, avisar, lido_ate)
      select v_canal, u, r.workspace_id, 'tudo', now() from unnest(string_to_array(v_chave, ',')::uuid[]) u
      where exists (select 1 from public.profiles p where p.id = u)
      on conflict do nothing;
    end if;
    insert into public.chat_mensagens (workspace_id, canal_id, autor_id, corpo, origem_ref, created_at)
    values (r.workspace_id, v_canal, r.author_id, left(r.body, 8000), 'messages:' || r.id, r.created_at)
    on conflict (origem_ref) do nothing;
    update public.chat_canais set ultima_mensagem_em = greatest(coalesce(ultima_mensagem_em, r.created_at), r.created_at) where id = v_canal;
  end loop;
end $$;
