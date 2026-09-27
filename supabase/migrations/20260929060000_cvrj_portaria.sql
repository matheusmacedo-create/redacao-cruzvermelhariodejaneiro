-- Portaria virtual: o livro de visitantes da filial (pedido do Matheus, 27/09/2026).
-- Só acréscimos. Decisões:
--  - quem registra: a portaria (qualquer membro do Palácio, menos a equipe da
--    Escola) e o próprio visitante, pelo QR da entrada (autocadastro), que
--    fica "aguardando" até a portaria confirmar;
--  - sem documento: nome, telefone, de onde vem, quem visita e o motivo;
--  - foto na entrada (Blob privado, portaria/<workspace>/<visita>/<uuid>.jpg);
--  - crachá de visitante: o número emprestado e a devolução na saída;
--  - quem é visitado recebe aviso (categoria "portaria").
-- Toda escrita passa pelas funções abaixo; a tabela não tem política de escrita.

create table if not exists public.portaria_visitas (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete restrict,
  nome                text not null check (length(btrim(nome)) between 2 and 120),
  telefone            text check (telefone is null or length(telefone) <= 30),
  -- De onde vem: empresa, órgão, "particular".
  empresa             text check (empresa is null or length(empresa) <= 120),
  motivo              text check (motivo is null or length(motivo) <= 300),
  -- Quem é visitado: a pessoa do Palácio (recebe o aviso) e/ou o texto livre (setor, nome de quem não tem conta).
  visitado_id         uuid references public.profiles (id) on delete set null,
  visitado_texto      text check (visitado_texto is null or length(visitado_texto) <= 120),
  cracha_numero       text check (cracha_numero is null or length(cracha_numero) <= 20),
  cracha_devolvido_em timestamptz,
  foto_path           text check (foto_path is null or length(foto_path) <= 300),
  origem              text not null check (origem in ('portaria', 'autocadastro')),
  entrada_em          timestamptz,
  saida_em            timestamptz,
  descartada_em       timestamptz,
  registrado_por      uuid references public.profiles (id) on delete set null,
  confirmado_por      uuid references public.profiles (id) on delete set null,
  saida_por           uuid references public.profiles (id) on delete set null,
  -- Só do autocadastro: hash da origem, para o limite (nunca o IP).
  ip_hash             text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (origem = 'autocadastro' or entrada_em is not null),
  check (saida_em is null or (entrada_em is not null and saida_em >= entrada_em)),
  check (descartada_em is null or entrada_em is null),
  check (cracha_devolvido_em is null or cracha_numero is not null)
);
comment on table public.portaria_visitas is 'Livro de visitantes da portaria (Portaria virtual): entrada, saída, foto e crachá de visitante.';

create index if not exists portaria_visitas_entrada_idx on public.portaria_visitas (workspace_id, entrada_em desc);
create index if not exists portaria_visitas_dentro_idx on public.portaria_visitas (workspace_id) where entrada_em is not null and saida_em is null;
create index if not exists portaria_visitas_aguardando_idx on public.portaria_visitas (workspace_id, created_at) where entrada_em is null and descartada_em is null;
create index if not exists portaria_visitas_cracha_idx on public.portaria_visitas (workspace_id) where cracha_numero is not null and cracha_devolvido_em is null;
create index if not exists portaria_visitas_ip_idx on public.portaria_visitas (ip_hash, created_at) where ip_hash is not null;
create index if not exists portaria_visitas_visitado_idx on public.portaria_visitas (visitado_id);
create index if not exists portaria_visitas_registrado_por_idx on public.portaria_visitas (registrado_por);
create index if not exists portaria_visitas_confirmado_por_idx on public.portaria_visitas (confirmado_por);
create index if not exists portaria_visitas_saida_por_idx on public.portaria_visitas (saida_por);

-- O link do QR da entrada: um segredo por espaço. Trocar o segredo invalida os cartazes antigos.
create table if not exists public.portaria_config (
  workspace_id   uuid primary key references public.workspaces (id) on delete cascade,
  token          text not null check (token ~ '^[A-Za-z0-9_-]{24,64}$'),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references public.profiles (id) on delete set null
);
create index if not exists portaria_config_atualizado_por_idx on public.portaria_config (atualizado_por);

-- Quem usa a portaria: membro ativo do espaço, menos a equipe da Escola (que só vê a Escola).
create or replace function private.pode_portaria(p_workspace_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select (select private.is_workspace_member(p_workspace_id)) and coalesce((select private.workspace_role(p_workspace_id)), '') <> 'escola'
$$;
revoke all on function private.pode_portaria(uuid) from public, anon;
grant execute on function private.pode_portaria(uuid) to authenticated;

alter table public.portaria_visitas enable row level security;
alter table public.portaria_config enable row level security;
revoke all on public.portaria_visitas, public.portaria_config from anon, authenticated;
-- O ip_hash fica de fora: só o banco usa.
grant select (id, workspace_id, nome, telefone, empresa, motivo, visitado_id, visitado_texto, cracha_numero, cracha_devolvido_em, foto_path,
  origem, entrada_em, saida_em, descartada_em, registrado_por, confirmado_por, saida_por, created_at, updated_at) on public.portaria_visitas to authenticated;
grant select on public.portaria_config to authenticated;

drop policy if exists portaria_visitas_select on public.portaria_visitas;
create policy portaria_visitas_select on public.portaria_visitas for select to authenticated
  using ((select private.pode_portaria(workspace_id)));
drop policy if exists portaria_config_select on public.portaria_config;
create policy portaria_config_select on public.portaria_config for select to authenticated
  using ((select private.pode_portaria(workspace_id)));

-- Lê e confere os campos do visitante (comuns à portaria e ao autocadastro).
create or replace function private.portaria_campo(p jsonb, p_chave text, p_max integer)
returns text language sql immutable set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(coalesce(p ->> p_chave, ''), '\s+', ' ', 'g')), p_max), '')
$$;
revoke all on function private.portaria_campo(jsonb, text, integer) from public, anon, authenticated;

-- O visitado precisa ser membro deste espaço (não se avisa gente de fora).
create or replace function private.portaria_visitado(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' stable as $$
declare
  v uuid;
begin
  if coalesce(p ->> 'visitado_id', '') = '' then return null; end if;
  begin v := (p ->> 'visitado_id')::uuid; exception when others then raise exception 'Pessoa visitada inválida.' using errcode = 'P0001'; end;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = v) then
    raise exception 'Pessoa visitada inválida.' using errcode = 'P0001';
  end if;
  return v;
end $$;
revoke all on function private.portaria_visitado(uuid, jsonb) from public, anon, authenticated;

/** A portaria registra a entrada de quem chegou. Devolve o id da visita. */
create or replace function public.portaria_registrar_entrada(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_nome text := private.portaria_campo(p, 'nome', 120);
begin
  if not (select private.pode_portaria(p_workspace_id)) then raise exception 'Sem acesso à portaria.' using errcode = 'P0001'; end if;
  if v_nome is null or length(v_nome) < 2 then raise exception 'Escreva o nome do visitante.' using errcode = 'P0001'; end if;
  insert into public.portaria_visitas (workspace_id, nome, telefone, empresa, motivo, visitado_id, visitado_texto, cracha_numero, origem, entrada_em, registrado_por)
  values (p_workspace_id, v_nome, private.portaria_campo(p, 'telefone', 30), private.portaria_campo(p, 'empresa', 120), private.portaria_campo(p, 'motivo', 300),
    private.portaria_visitado(p_workspace_id, p), private.portaria_campo(p, 'visitado_texto', 120), private.portaria_campo(p, 'cracha_numero', 20),
    'portaria', now(), (select auth.uid()))
  returning id into v_id;
  return v_id;
end $$;

/** Confirma a entrada de quem se cadastrou pelo QR (a portaria pode corrigir e completar os dados). */
create or replace function public.portaria_confirmar(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.portaria_visitas;
  v_nome text := private.portaria_campo(p, 'nome', 120);
begin
  select * into v from public.portaria_visitas where id = p_id for update;
  if not found or not (select private.pode_portaria(v.workspace_id)) then raise exception 'Visita não encontrada.' using errcode = 'P0001'; end if;
  if v.entrada_em is not null or v.descartada_em is not null then raise exception 'Esta visita já foi confirmada ou descartada.' using errcode = 'P0001'; end if;
  if v_nome is null or length(v_nome) < 2 then raise exception 'Escreva o nome do visitante.' using errcode = 'P0001'; end if;
  update public.portaria_visitas set nome = v_nome, telefone = private.portaria_campo(p, 'telefone', 30), empresa = private.portaria_campo(p, 'empresa', 120),
    motivo = private.portaria_campo(p, 'motivo', 300), visitado_id = private.portaria_visitado(v.workspace_id, p),
    visitado_texto = private.portaria_campo(p, 'visitado_texto', 120), cracha_numero = private.portaria_campo(p, 'cracha_numero', 20),
    entrada_em = now(), confirmado_por = (select auth.uid()), updated_at = now()
  where id = v.id;
end $$;

/** Descarta um autocadastro que não virou entrada (desistiu, repetido, brincadeira). */
create or replace function public.portaria_descartar(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.portaria_visitas;
begin
  select * into v from public.portaria_visitas where id = p_id for update;
  if not found or not (select private.pode_portaria(v.workspace_id)) then raise exception 'Visita não encontrada.' using errcode = 'P0001'; end if;
  if v.entrada_em is not null or v.descartada_em is not null then raise exception 'Esta visita já foi confirmada ou descartada.' using errcode = 'P0001'; end if;
  update public.portaria_visitas set descartada_em = now(), confirmado_por = (select auth.uid()), updated_at = now() where id = v.id;
end $$;

/** Registra a saída; `p_cracha_devolvido` diz se o crachá de visitante voltou. */
create or replace function public.portaria_registrar_saida(p_id uuid, p_cracha_devolvido boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.portaria_visitas;
begin
  select * into v from public.portaria_visitas where id = p_id for update;
  if not found or not (select private.pode_portaria(v.workspace_id)) then raise exception 'Visita não encontrada.' using errcode = 'P0001'; end if;
  if v.entrada_em is null then raise exception 'A entrada ainda não foi confirmada.' using errcode = 'P0001'; end if;
  if v.saida_em is not null then raise exception 'A saída já foi registrada.' using errcode = 'P0001'; end if;
  update public.portaria_visitas set saida_em = now(), saida_por = (select auth.uid()), updated_at = now(),
    cracha_devolvido_em = case when v.cracha_numero is not null and coalesce(p_cracha_devolvido, false) then now() else cracha_devolvido_em end
  where id = v.id;
end $$;

/** O crachá de visitante voltou depois da saída. */
create or replace function public.portaria_devolver_cracha(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.portaria_visitas;
begin
  select * into v from public.portaria_visitas where id = p_id for update;
  if not found or not (select private.pode_portaria(v.workspace_id)) then raise exception 'Visita não encontrada.' using errcode = 'P0001'; end if;
  if v.cracha_numero is null or v.cracha_devolvido_em is not null then raise exception 'Não há crachá pendente nesta visita.' using errcode = 'P0001'; end if;
  update public.portaria_visitas set cracha_devolvido_em = now(), updated_at = now() where id = v.id;
end $$;

/** A foto do visitante (ou null para tirar). Devolve o caminho anterior, para o servidor apagar o arquivo. */
create or replace function public.portaria_definir_foto(p_id uuid, p_foto_path text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v public.portaria_visitas;
begin
  select * into v from public.portaria_visitas where id = p_id for update;
  if not found or not (select private.pode_portaria(v.workspace_id)) then raise exception 'Visita não encontrada.' using errcode = 'P0001'; end if;
  if v.descartada_em is not null then raise exception 'Visita descartada.' using errcode = 'P0001'; end if;
  if p_foto_path is not null and p_foto_path !~ ('^portaria/' || v.workspace_id::text || '/' || v.id::text || '/[0-9a-f-]{36}\.jpg$') then
    raise exception 'Foto inválida.' using errcode = 'P0001';
  end if;
  update public.portaria_visitas set foto_path = p_foto_path, updated_at = now() where id = v.id;
  return v.foto_path;
end $$;

/** Um segredo novo para o QR da entrada (os cartazes antigos param de valer). Só administradores. */
create or replace function public.portaria_novo_link(p_workspace_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_token text := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
begin
  if not (select private.pode_portaria(p_workspace_id)) or (select private.workspace_role(p_workspace_id)) <> 'admin' then
    raise exception 'Só administradores trocam o link da entrada.' using errcode = 'P0001';
  end if;
  insert into public.portaria_config (workspace_id, token, atualizado_em, atualizado_por) values (p_workspace_id, v_token, now(), (select auth.uid()))
  on conflict (workspace_id) do update set token = excluded.token, atualizado_em = now(), atualizado_por = excluded.atualizado_por;
  return v_token;
end $$;

/**
 * O autocadastro pelo QR (só o servidor chama, com a chave de serviço): confere
 * o segredo do cartaz e o limite de 6 por hora por origem. Entra como
 * "aguardando" até a portaria confirmar.
 */
create or replace function public.portaria_autocadastro(p_workspace_id uuid, p_token text, p jsonb, p_ip_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_nome text := private.portaria_campo(p, 'nome', 120);
begin
  if p_token is null or not exists (select 1 from public.portaria_config c where c.workspace_id = p_workspace_id and c.token = p_token) then
    raise exception 'Este QR não vale mais. Peça ajuda na portaria.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.portaria_visitas where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 6 then
    raise exception 'Muitos cadastros daqui em pouco tempo. Fale com a portaria.' using errcode = 'P0001';
  end if;
  if v_nome is null or length(v_nome) < 2 then raise exception 'Escreva o seu nome.' using errcode = 'P0001'; end if;
  insert into public.portaria_visitas (workspace_id, nome, telefone, empresa, motivo, visitado_texto, origem, ip_hash)
  values (p_workspace_id, v_nome, private.portaria_campo(p, 'telefone', 30), private.portaria_campo(p, 'empresa', 120), private.portaria_campo(p, 'motivo', 300),
    private.portaria_campo(p, 'visitado_texto', 120), 'autocadastro', left(p_ip_hash, 128))
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.portaria_registrar_entrada(uuid, jsonb), public.portaria_confirmar(uuid, jsonb), public.portaria_descartar(uuid),
  public.portaria_registrar_saida(uuid, boolean), public.portaria_devolver_cracha(uuid), public.portaria_definir_foto(uuid, text),
  public.portaria_novo_link(uuid), public.portaria_autocadastro(uuid, text, jsonb, text) from public, anon;
grant execute on function public.portaria_registrar_entrada(uuid, jsonb), public.portaria_confirmar(uuid, jsonb), public.portaria_descartar(uuid),
  public.portaria_registrar_saida(uuid, boolean), public.portaria_devolver_cracha(uuid), public.portaria_definir_foto(uuid, text),
  public.portaria_novo_link(uuid) to authenticated;
revoke all on function public.portaria_autocadastro(uuid, text, jsonb, text) from authenticated;
grant execute on function public.portaria_autocadastro(uuid, text, jsonb, text) to service_role;

-- O segredo inicial do QR, um por espaço.
insert into public.portaria_config (workspace_id, token)
select w.id, translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_') from public.workspaces w
on conflict (workspace_id) do nothing;

-- Aviso "portaria" (quem é visitado): a categoria entra na lista das notificações.
-- A lista é lida da restrição em vigor e só ganha "portaria" (o mesmo bloco da
-- migração da auditoria, que lê os dois formatos e para se não conseguir ler).
do $$
declare
  v_def text;
  v_lista text[];
begin
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'public.notifications'::regclass and c.conname = 'notifications_categoria_valida';
  if v_def is null then return; end if;
  if v_def ~ '''\{[a-z_,]*\}''' then
    v_lista := string_to_array(substring(v_def from '''\{([a-z_,]*)\}'''), ',');
  else
    select array_agg(distinct m[1] order by m[1]) into v_lista from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
  end if;
  if coalesce(cardinality(v_lista), 0) = 0 then
    raise exception 'Não consegui ler as categorias de notifications_categoria_valida: %', v_def;
  end if;
  if 'portaria' = any (v_lista) then return; end if;
  v_lista := v_lista || array['portaria'];
  alter table public.notifications drop constraint notifications_categoria_valida;
  execute format('alter table public.notifications add constraint notifications_categoria_valida check (categoria = any (%L::text[]))', v_lista);
end $$;
