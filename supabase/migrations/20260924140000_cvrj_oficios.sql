-- Ofícios: criados, numerados, assinados e guardados para a posteridade.
--
-- O ciclo:
--   rascunho → (emitir) → em_assinatura → (todos assinam) → assinado
--   em_assinatura | assinado → cancelado (com motivo; nada é apagado)
--
-- Ao emitir, o banco dá o número do ano (001/2026, 002/2026…), congela o
-- texto numa forma canônica (JSON) e guarda o SHA-256 dela. Quem assina
-- assina aquele hash: se o texto mudasse, o hash mudaria e a assinatura
-- seria recusada. Depois da emissão, nenhum campo do documento muda — nem
-- pela aplicação, nem por um UPDATE direto: um gatilho barra.
--
-- Quando a última pessoa assina, o banco monta o manifesto (hash do
-- documento + quem assinou e quando), calcula o hash do manifesto e abre um
-- carimbo pendente. O servidor leva esse hash — e só ele, com sal — ao
-- OpenTimestamps, que o ancora no Bitcoin. A prova (.ots) fica guardada e
-- qualquer pessoa pode conferi-la, com ou sem o Redação no ar.

-- ---------------------------------------------------------------- tabelas

create table if not exists public.oficios (
  id                     uuid primary key default gen_random_uuid(),
  -- Para a posteridade: apagar o espaço não pode levar os ofícios junto.
  workspace_id           uuid not null references public.workspaces (id) on delete restrict,
  estado                 text not null default 'rascunho'
                         check (estado in ('rascunho','em_assinatura','assinado','cancelado')),

  ano                    integer,
  numero                 integer,
  data_do_documento      date,

  setor                  text check (setor is null or length(setor) <= 120),
  local                  text not null default 'Rio de Janeiro' check (length(local) <= 120),
  destinatario_nome      text check (destinatario_nome is null or length(destinatario_nome) <= 200),
  destinatario_cargo     text check (destinatario_cargo is null or length(destinatario_cargo) <= 200),
  destinatario_orgao     text check (destinatario_orgao is null or length(destinatario_orgao) <= 200),
  destinatario_endereco  text check (destinatario_endereco is null or length(destinatario_endereco) <= 400),
  vocativo               text check (vocativo is null or length(vocativo) <= 200),
  assunto                text not null default '' check (length(assunto) <= 300),
  corpo                  text not null default '' check (length(corpo) <= 30000),
  fecho                  text not null default 'Atenciosamente,' check (length(fecho) <= 200),

  -- O que foi assinado, exatamente, e o hash disso.
  conteudo_canonico      text,
  hash_documento         text check (hash_documento is null or hash_documento ~ '^[0-9a-f]{64}$'),
  -- O que foi ancorado no Bitcoin: documento + assinaturas.
  manifesto              text,
  hash_manifesto         text check (hash_manifesto is null or hash_manifesto ~ '^[0-9a-f]{64}$'),

  -- 128 bits aleatórios: o endereço público de conferência.
  codigo_verificacao     text not null unique default replace(gen_random_uuid()::text, '-', ''),

  criado_por             uuid references public.profiles (id) on delete set null,
  emitido_por            uuid references public.profiles (id) on delete set null,
  emitido_em             timestamptz,
  assinado_em            timestamptz,
  cancelado_por          uuid references public.profiles (id) on delete set null,
  cancelado_em           timestamptz,
  motivo_cancelamento    text check (motivo_cancelamento is null or length(motivo_cancelamento) <= 600),

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  unique (workspace_id, ano, numero),
  check ((estado = 'rascunho') = (numero is null)),
  check (estado = 'rascunho' or (hash_documento is not null and conteudo_canonico is not null)),
  check (estado <> 'assinado' or hash_manifesto is not null)
);
create index if not exists oficios_workspace_estado_idx on public.oficios (workspace_id, estado, updated_at desc);
create index if not exists oficios_workspace_numero_idx on public.oficios (workspace_id, ano desc, numero desc);
create index if not exists oficios_criado_por_idx on public.oficios (criado_por);
create index if not exists oficios_emitido_por_idx on public.oficios (emitido_por);
create index if not exists oficios_cancelado_por_idx on public.oficios (cancelado_por);

create table if not exists public.oficio_numeracao (
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  ano          integer not null,
  ultimo       integer not null,
  primary key (workspace_id, ano)
);

create table if not exists public.oficio_assinantes (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete restrict,
  oficio_id      uuid not null references public.oficios (id) on delete restrict,
  -- O nome e o cargo ficam copiados: o documento guarda quem assinou como
  -- era naquele dia, mesmo que o perfil mude ou saia depois.
  user_id        uuid references public.profiles (id) on delete set null,
  nome           text not null,
  cargo          text check (cargo is null or length(cargo) <= 120),
  ordem          integer not null,
  estado         text not null default 'pendente' check (estado in ('pendente','assinado','recusado')),
  assinado_em    timestamptz,
  hash_assinado  text check (hash_assinado is null or hash_assinado ~ '^[0-9a-f]{64}$'),
  ip             text,
  user_agent     text,
  motivo_recusa  text check (motivo_recusa is null or length(motivo_recusa) <= 600),
  created_at     timestamptz not null default now(),
  unique (oficio_id, user_id),
  unique (oficio_id, ordem)
);
create index if not exists oficio_assinantes_user_idx on public.oficio_assinantes (user_id, estado);
create index if not exists oficio_assinantes_workspace_idx on public.oficio_assinantes (workspace_id);

create table if not exists public.oficio_carimbos (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces (id) on delete restrict,
  oficio_id            uuid not null references public.oficios (id) on delete restrict,
  hash                 text not null check (hash ~ '^[0-9a-f]{64}$'),
  metodo               text not null default 'opentimestamps',
  rede                 text not null default 'bitcoin',
  -- pendente: ainda não foi aos calendários; enviado: está nos calendários,
  -- esperando entrar num bloco; confirmado: há um bloco do Bitcoin na prova.
  estado               text not null default 'pendente' check (estado in ('pendente','enviado','confirmado')),
  prova                text,           -- o .ots em base64
  calendarios          text[] not null default '{}',
  bloco                integer,
  raiz_merkle          text,
  enviado_em           timestamptz,
  confirmado_em        timestamptz,
  tentativas           integer not null default 0,
  ultimo_erro          text,
  proxima_tentativa_em timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (oficio_id, hash)
);
create index if not exists oficio_carimbos_fila_idx on public.oficio_carimbos (estado, proxima_tentativa_em) where estado <> 'confirmado';
create index if not exists oficio_carimbos_workspace_idx on public.oficio_carimbos (workspace_id);

-- ---------------------------------------------------------------- imutabilidade

create or replace function private.oficio_imutavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.estado <> 'rascunho' then
      raise exception 'Ofício emitido não se apaga. Cancele-o com um motivo.' using errcode = 'P0001';
    end if;
    return old;
  end if;

  -- Transições válidas.
  if new.estado is distinct from old.estado and not (
       (old.estado = 'rascunho' and new.estado = 'em_assinatura')
    or (old.estado = 'em_assinatura' and new.estado in ('assinado','cancelado'))
    or (old.estado = 'assinado' and new.estado = 'cancelado')
  ) then
    raise exception 'Mudança de estado inválida (% → %).', old.estado, new.estado using errcode = 'P0001';
  end if;

  if old.estado <> 'rascunho' and (
       new.workspace_id is distinct from old.workspace_id
    or new.ano is distinct from old.ano
    or new.numero is distinct from old.numero
    or new.data_do_documento is distinct from old.data_do_documento
    or new.setor is distinct from old.setor
    or new.local is distinct from old.local
    or new.destinatario_nome is distinct from old.destinatario_nome
    or new.destinatario_cargo is distinct from old.destinatario_cargo
    or new.destinatario_orgao is distinct from old.destinatario_orgao
    or new.destinatario_endereco is distinct from old.destinatario_endereco
    or new.vocativo is distinct from old.vocativo
    or new.assunto is distinct from old.assunto
    or new.corpo is distinct from old.corpo
    or new.fecho is distinct from old.fecho
    or new.conteudo_canonico is distinct from old.conteudo_canonico
    or new.hash_documento is distinct from old.hash_documento
    or new.codigo_verificacao is distinct from old.codigo_verificacao
    or new.emitido_em is distinct from old.emitido_em
  ) then
    raise exception 'Ofício emitido não pode ser alterado.' using errcode = 'P0001';
  end if;

  if old.hash_manifesto is not null and (
       new.manifesto is distinct from old.manifesto
    or new.hash_manifesto is distinct from old.hash_manifesto
    or new.assinado_em is distinct from old.assinado_em
  ) then
    raise exception 'As assinaturas de um ofício não podem ser alteradas.' using errcode = 'P0001';
  end if;

  if old.estado = 'cancelado' and (
       new.cancelado_em is distinct from old.cancelado_em
    or new.motivo_cancelamento is distinct from old.motivo_cancelamento
  ) then
    raise exception 'O cancelamento não pode ser alterado.' using errcode = 'P0001';
  end if;

  return new;
end $$;

drop trigger if exists oficios_imutavel on public.oficios;
create trigger oficios_imutavel before update or delete on public.oficios
  for each row execute function private.oficio_imutavel();

create or replace function private.oficio_assinante_imutavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Assinatura de ofício não se apaga.' using errcode = 'P0001';
  end if;
  if old.estado <> 'pendente' and (
       new.estado is distinct from old.estado
    or new.assinado_em is distinct from old.assinado_em
    or new.hash_assinado is distinct from old.hash_assinado
    or new.nome is distinct from old.nome
    or new.cargo is distinct from old.cargo
    or new.ordem is distinct from old.ordem
    or new.oficio_id is distinct from old.oficio_id
    or new.ip is distinct from old.ip
    or new.user_agent is distinct from old.user_agent
    or new.motivo_recusa is distinct from old.motivo_recusa
    -- user_id pode virar nulo (perfil removido); o nome copiado fica.
    or (new.user_id is distinct from old.user_id and new.user_id is not null)
  ) then
    raise exception 'Assinatura registrada não pode ser alterada.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists oficio_assinantes_imutavel on public.oficio_assinantes;
create trigger oficio_assinantes_imutavel before update or delete on public.oficio_assinantes
  for each row execute function private.oficio_assinante_imutavel();

create or replace function private.oficio_carimbo_imutavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Carimbo de ofício não se apaga.' using errcode = 'P0001';
  end if;
  if new.hash is distinct from old.hash or new.oficio_id is distinct from old.oficio_id then
    raise exception 'O hash carimbado não pode mudar.' using errcode = 'P0001';
  end if;
  if old.estado = 'confirmado' and (new.estado <> 'confirmado' or new.prova is distinct from old.prova or new.bloco is distinct from old.bloco) then
    raise exception 'Carimbo confirmado não pode ser alterado.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists oficio_carimbos_imutavel on public.oficio_carimbos;
create trigger oficio_carimbos_imutavel before update or delete on public.oficio_carimbos
  for each row execute function private.oficio_carimbo_imutavel();

-- ---------------------------------------------------------------- acesso

alter table public.oficios enable row level security;
alter table public.oficio_numeracao enable row level security;
alter table public.oficio_assinantes enable row level security;
alter table public.oficio_carimbos enable row level security;

-- Escrita direta só no rascunho, e só nos campos do texto. Número, hash,
-- estado e assinaturas passam pelas funções abaixo.
revoke all on public.oficios, public.oficio_numeracao, public.oficio_assinantes, public.oficio_carimbos from anon;
revoke insert, update, delete, truncate, references, trigger on public.oficios from authenticated;
revoke all on public.oficio_numeracao from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.oficio_assinantes, public.oficio_carimbos from authenticated;

grant insert (workspace_id, criado_por, setor, local, destinatario_nome, destinatario_cargo, destinatario_orgao,
              destinatario_endereco, vocativo, assunto, corpo, fecho)
  on public.oficios to authenticated;
grant update (setor, local, destinatario_nome, destinatario_cargo, destinatario_orgao, destinatario_endereco,
              vocativo, assunto, corpo, fecho, updated_at)
  on public.oficios to authenticated;
grant delete on public.oficios to authenticated;

create policy oficios_select_member on public.oficios
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy oficios_insert_member on public.oficios
  for insert to authenticated with check (
    (select private.is_workspace_member(workspace_id)) and criado_por = (select auth.uid()) and estado = 'rascunho'
  );
create policy oficios_update_rascunho on public.oficios
  for update to authenticated
  using (
    estado = 'rascunho' and (select private.is_workspace_member(workspace_id))
    and (criado_por = (select auth.uid()) or (select private.workspace_role(workspace_id)) = 'admin')
  )
  with check (estado = 'rascunho');
create policy oficios_delete_rascunho on public.oficios
  for delete to authenticated using (
    estado = 'rascunho' and (select private.is_workspace_member(workspace_id))
    and (criado_por = (select auth.uid()) or (select private.workspace_role(workspace_id)) = 'admin')
  );

create policy oficio_assinantes_select_member on public.oficio_assinantes
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy oficio_carimbos_select_member on public.oficio_carimbos
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));

-- ---------------------------------------------------------------- funções

create or replace function private.codigo_do_oficio(p_numero integer, p_ano integer)
returns text language sql immutable set search_path = '' as $$
  select lpad(p_numero::text, 3, '0') || '/' || p_ano::text
$$;

create or replace function public.emitir_oficio(p_oficio_id uuid, p_assinantes jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v public.oficios;
  v_qtd integer;
  v_ano integer;
  v_num integer;
  v_data date;
  v_canon text;
begin
  select * into v from public.oficios where id = p_oficio_id for update;
  if not found or not (select private.is_workspace_member(v.workspace_id)) then
    raise exception 'Ofício não encontrado.' using errcode = 'P0001';
  end if;
  if v.criado_por is distinct from (select auth.uid()) and (select private.workspace_role(v.workspace_id)) is distinct from 'admin' then
    raise exception 'Só quem criou o ofício, ou um admin, pode emiti-lo.' using errcode = 'P0001';
  end if;
  if v.estado <> 'rascunho' then
    raise exception 'Este ofício já foi emitido.' using errcode = 'P0001';
  end if;
  if length(trim(v.assunto)) < 3 then
    raise exception 'Escreva o assunto antes de emitir.' using errcode = 'P0001';
  end if;
  if length(trim(v.corpo)) < 10 then
    raise exception 'Escreva o texto do ofício antes de emitir.' using errcode = 'P0001';
  end if;
  if coalesce(trim(v.destinatario_nome), '') = '' and coalesce(trim(v.destinatario_orgao), '') = '' then
    raise exception 'Informe a quem o ofício se dirige.' using errcode = 'P0001';
  end if;

  if p_assinantes is null or jsonb_typeof(p_assinantes) <> 'array' then
    raise exception 'Escolha quem assina.' using errcode = 'P0001';
  end if;
  v_qtd := jsonb_array_length(p_assinantes);
  if v_qtd < 1 or v_qtd > 10 then
    raise exception 'Escolha de 1 a 10 pessoas para assinar.' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_assinantes) e
             where coalesce(e->>'user_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                or length(coalesce(e->>'cargo', '')) > 120) then
    raise exception 'Lista de quem assina inválida.' using errcode = 'P0001';
  end if;
  if (select count(distinct e->>'user_id') from jsonb_array_elements(p_assinantes) e) <> v_qtd then
    raise exception 'A mesma pessoa aparece duas vezes na lista de quem assina.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_assinantes) e
    where not exists (
      select 1 from public.workspace_members m join public.profiles p on p.id = m.user_id
      where m.workspace_id = v.workspace_id and m.user_id = (e->>'user_id')::uuid and p.active
    )
  ) then
    raise exception 'Quem assina precisa ser membro ativo deste espaço.' using errcode = 'P0001';
  end if;

  v_ano := extract(year from (now() at time zone 'America/Sao_Paulo'))::integer;
  v_data := (now() at time zone 'America/Sao_Paulo')::date;
  insert into public.oficio_numeracao as n (workspace_id, ano, ultimo) values (v.workspace_id, v_ano, 1)
    on conflict (workspace_id, ano) do update set ultimo = n.ultimo + 1
    returning ultimo into v_num;

  insert into public.oficio_assinantes (workspace_id, oficio_id, user_id, nome, cargo, ordem)
  select v.workspace_id, v.id, p.id, p.full_name, nullif(trim(coalesce(nullif(trim(x.e->>'cargo'), ''), p.job_title, '')), ''), x.o::integer
  from jsonb_array_elements(p_assinantes) with ordinality as x(e, o)
  join public.profiles p on p.id = (x.e->>'user_id')::uuid;

  v_canon := jsonb_build_object(
    'formato', 'oficio/1',
    'emitente', (select w.name from public.workspaces w where w.id = v.workspace_id),
    'numero', private.codigo_do_oficio(v_num, v_ano),
    'data', v_data,
    'local', v.local,
    'setor', v.setor,
    'destinatario', jsonb_build_object('nome', v.destinatario_nome, 'cargo', v.destinatario_cargo, 'orgao', v.destinatario_orgao, 'endereco', v.destinatario_endereco),
    'vocativo', v.vocativo,
    'assunto', v.assunto,
    'corpo', v.corpo,
    'fecho', v.fecho,
    'assinantes', (select jsonb_agg(jsonb_build_object('ordem', a.ordem, 'nome', a.nome, 'cargo', a.cargo, 'usuario', a.user_id) order by a.ordem)
                   from public.oficio_assinantes a where a.oficio_id = v.id)
  )::text;

  update public.oficios set
    estado = 'em_assinatura', ano = v_ano, numero = v_num, data_do_documento = v_data,
    conteudo_canonico = v_canon,
    hash_documento = encode(extensions.digest(convert_to(v_canon, 'UTF8'), 'sha256'), 'hex'),
    emitido_por = (select auth.uid()), emitido_em = now(), updated_at = now()
  where id = v.id;

  return private.codigo_do_oficio(v_num, v_ano);
end $$;

create or replace function public.assinar_oficio(p_oficio_id uuid, p_hash text, p_ip text, p_user_agent text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v public.oficios;
  v_manifesto text;
  v_hash text;
begin
  select * into v from public.oficios where id = p_oficio_id for update;
  if not found or not (select private.is_workspace_member(v.workspace_id)) then
    raise exception 'Ofício não encontrado.' using errcode = 'P0001';
  end if;
  if v.estado <> 'em_assinatura' then
    raise exception 'Este ofício não está aguardando assinatura.' using errcode = 'P0001';
  end if;
  if p_hash is distinct from v.hash_documento then
    raise exception 'O documento que você viu não é o que está registrado. Recarregue a página e confira antes de assinar.' using errcode = 'P0001';
  end if;

  update public.oficio_assinantes
     set estado = 'assinado', assinado_em = now(), hash_assinado = v.hash_documento,
         ip = left(p_ip, 64), user_agent = left(p_user_agent, 300)
   where oficio_id = v.id and user_id = (select auth.uid()) and estado = 'pendente';
  if not found then
    raise exception 'Você não está entre quem assina este ofício, ou já assinou.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.oficio_assinantes where oficio_id = v.id and estado <> 'assinado') then
    return false;
  end if;

  v_manifesto := jsonb_build_object(
    'formato', 'manifesto-de-assinaturas/1',
    'numero', private.codigo_do_oficio(v.numero, v.ano),
    'documento_sha256', v.hash_documento,
    'codigo_de_verificacao', v.codigo_verificacao,
    'assinaturas', (select jsonb_agg(jsonb_build_object(
                       'ordem', a.ordem, 'nome', a.nome, 'cargo', a.cargo, 'usuario', a.user_id,
                       'assinado_em', to_char(a.assinado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
                       'documento_sha256', a.hash_assinado) order by a.ordem)
                    from public.oficio_assinantes a where a.oficio_id = v.id)
  )::text;
  v_hash := encode(extensions.digest(convert_to(v_manifesto, 'UTF8'), 'sha256'), 'hex');

  update public.oficios set estado = 'assinado', assinado_em = now(), manifesto = v_manifesto, hash_manifesto = v_hash, updated_at = now()
   where id = v.id;
  insert into public.oficio_carimbos (workspace_id, oficio_id, hash) values (v.workspace_id, v.id, v_hash)
    on conflict (oficio_id, hash) do nothing;
  return true;
end $$;

create or replace function public.recusar_assinatura_de_oficio(p_oficio_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.oficios;
  v_nome text;
begin
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Explique em poucas palavras por que não vai assinar.' using errcode = 'P0001';
  end if;
  select * into v from public.oficios where id = p_oficio_id for update;
  if not found or not (select private.is_workspace_member(v.workspace_id)) then
    raise exception 'Ofício não encontrado.' using errcode = 'P0001';
  end if;
  if v.estado <> 'em_assinatura' then
    raise exception 'Este ofício não está aguardando assinatura.' using errcode = 'P0001';
  end if;
  update public.oficio_assinantes set estado = 'recusado', motivo_recusa = left(trim(p_motivo), 600), assinado_em = now()
   where oficio_id = v.id and user_id = (select auth.uid()) and estado = 'pendente'
  returning nome into v_nome;
  if not found then
    raise exception 'Você não está entre quem assina este ofício, ou já decidiu.' using errcode = 'P0001';
  end if;
  -- Número emitido não volta para rascunho: o ofício fica cancelado, com o
  -- motivo, e um novo pode ser feito a partir dele.
  update public.oficios set estado = 'cancelado', cancelado_por = (select auth.uid()), cancelado_em = now(),
         motivo_cancelamento = left('Assinatura recusada por ' || v_nome || ': ' || trim(p_motivo), 600), updated_at = now()
   where id = v.id;
end $$;

create or replace function public.cancelar_oficio(p_oficio_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.oficios;
begin
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escreva o motivo do cancelamento.' using errcode = 'P0001';
  end if;
  select * into v from public.oficios where id = p_oficio_id for update;
  if not found or not (select private.is_workspace_member(v.workspace_id)) then
    raise exception 'Ofício não encontrado.' using errcode = 'P0001';
  end if;
  if v.criado_por is distinct from (select auth.uid()) and (select private.workspace_role(v.workspace_id)) is distinct from 'admin' then
    raise exception 'Só quem criou o ofício, ou um admin, pode cancelá-lo.' using errcode = 'P0001';
  end if;
  if v.estado not in ('em_assinatura', 'assinado') then
    raise exception 'Só um ofício emitido pode ser cancelado. Rascunho se apaga.' using errcode = 'P0001';
  end if;
  update public.oficios set estado = 'cancelado', cancelado_por = (select auth.uid()), cancelado_em = now(),
         motivo_cancelamento = left(trim(p_motivo), 600), updated_at = now()
   where id = v.id;
end $$;

revoke all on function public.emitir_oficio(uuid, jsonb) from public, anon;
revoke all on function public.assinar_oficio(uuid, text, text, text) from public, anon;
revoke all on function public.recusar_assinatura_de_oficio(uuid, text) from public, anon;
revoke all on function public.cancelar_oficio(uuid, text) from public, anon;
revoke all on function private.codigo_do_oficio(integer, integer) from public, anon;
grant execute on function public.emitir_oficio(uuid, jsonb) to authenticated;
grant execute on function public.assinar_oficio(uuid, text, text, text) to authenticated;
grant execute on function public.recusar_assinatura_de_oficio(uuid, text) to authenticated;
grant execute on function public.cancelar_oficio(uuid, text) to authenticated;
grant execute on function private.codigo_do_oficio(integer, integer) to authenticated;

comment on table public.oficios is 'Ofícios do espaço. Depois de emitido, o texto é imutável (gatilho oficios_imutavel) e o hash_documento é o que se assina.';
comment on table public.oficio_carimbos is 'Âncoras no Bitcoin via OpenTimestamps do hash do manifesto de assinaturas. A prova .ots fica em base64.';
