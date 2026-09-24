-- Participantes: o cadastro de voluntários, colaboradores, coordenadores,
-- diretoria, juventude e instrutores da filial.
--
-- Inspirado no Volunteer Data Management System da IFRC (CiviCRM), usado
-- pelas Cruzes Vermelhas da Espanha, França e Quênia: perfil, vínculo e
-- setores, formação com validade, horas de voluntariado, inscrição pública
-- com aprovação e controle fino de quem vê o quê.
--
-- LGPD:
-- - CPF e dados de saúde ficam cifrados (pgp_sym, AES-256) com uma chave
--   guardada no Vault. O CPF tem também um HMAC para achar duplicados sem
--   decifrar, e uma máscara (***.456.789-**) para a tela.
-- - Ver, gerenciar e abrir dados sensíveis são níveis distintos, dados por um
--   admin pessoa a pessoa (participantes_acesso). Admin tem tudo.
-- - Toda abertura de dado sensível, exportação e mudança de acesso fica na
--   auditoria. A exclusão a pedido do titular anonimiza o registro.
-- - Escrita só por funções; a tabela não expõe as colunas cifradas.

-- ---------------------------------------------------------------- chave

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'participantes_chave') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'participantes_chave', 'Chave de cifra dos dados sensíveis de participantes (CPF e saúde).');
  end if;
end $$;

create or replace function private.chave_participantes()
returns text language sql security definer set search_path = '' stable as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'participantes_chave' limit 1
$$;
revoke all on function private.chave_participantes() from public, anon, authenticated;

create or replace function private.cpf_valido(p_cpf text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  d text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  s int; r int; i int;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::int then return false; end if;
  s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = substr(d, 11, 1)::int;
end $$;

-- ---------------------------------------------------------------- tabelas

create table if not exists public.participantes (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null references public.workspaces (id) on delete restrict,
  situacao               text not null default 'ativo' check (situacao in ('candidato','ativo','inativo','desligado')),
  vinculo                text not null check (vinculo in ('voluntario','colaborador','coordenador','diretoria','jovem','instrutor')),
  setores                text[] not null default '{}',
  funcao                 text check (funcao is null or length(funcao) <= 120),

  nome                   text not null check (length(trim(nome)) between 2 and 200),
  nome_social            text check (nome_social is null or length(nome_social) <= 200),
  email                  text check (email is null or (length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  telefone               text check (telefone is null or length(telefone) <= 40),
  data_nascimento        date check (data_nascimento is null or data_nascimento >= '1900-01-01'),

  cpf_cifrado            bytea,
  cpf_hash               text,
  cpf_mascara            text,

  cep                    text check (cep is null or length(cep) <= 12),
  logradouro             text check (logradouro is null or length(logradouro) <= 200),
  numero                 text check (numero is null or length(numero) <= 20),
  complemento            text check (complemento is null or length(complemento) <= 120),
  bairro                 text check (bairro is null or length(bairro) <= 120),
  cidade                 text check (cidade is null or length(cidade) <= 120),
  uf                     text check (uf is null or uf ~ '^[A-Z]{2}$'),

  emergencia_nome        text check (emergencia_nome is null or length(emergencia_nome) <= 200),
  emergencia_telefone    text check (emergencia_telefone is null or length(emergencia_telefone) <= 40),
  emergencia_parentesco  text check (emergencia_parentesco is null or length(emergencia_parentesco) <= 60),

  saude_cifrada          bytea,
  tem_dados_de_saude     boolean not null default false,

  responsavel_nome       text check (responsavel_nome is null or length(responsavel_nome) <= 200),
  responsavel_telefone   text check (responsavel_telefone is null or length(responsavel_telefone) <= 40),

  habilidades            text[] not null default '{}',
  idiomas                text[] not null default '{}',
  disponibilidade        text[] not null default '{}',
  observacoes            text check (observacoes is null or length(observacoes) <= 4000),

  origem                 text not null default 'cadastro' check (origem in ('cadastro','formulario','importacao')),
  consentimento_em       timestamptz,
  consentimento_versao   text,

  user_id                uuid references public.profiles (id) on delete set null,
  criado_por             uuid references public.profiles (id) on delete set null,
  aprovado_por           uuid references public.profiles (id) on delete set null,
  aprovado_em            timestamptz,
  desligado_em           timestamptz,
  motivo_desligamento    text check (motivo_desligamento is null or length(motivo_desligamento) <= 600),
  anonimizado_em         timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create unique index if not exists participantes_email_unico on public.participantes (workspace_id, lower(email)) where email is not null;
create unique index if not exists participantes_cpf_unico on public.participantes (workspace_id, cpf_hash) where cpf_hash is not null;
create index if not exists participantes_workspace_situacao_idx on public.participantes (workspace_id, situacao, vinculo);
create index if not exists participantes_setores_idx on public.participantes using gin (setores);
create index if not exists participantes_user_idx on public.participantes (user_id);
create index if not exists participantes_criado_por_idx on public.participantes (criado_por);
create index if not exists participantes_aprovado_por_idx on public.participantes (aprovado_por);

create table if not exists public.participante_formacoes (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete restrict,
  participante_id uuid not null references public.participantes (id) on delete cascade,
  titulo          text not null check (length(trim(titulo)) between 2 and 200),
  instituicao     text check (instituicao is null or length(instituicao) <= 200),
  concluido_em    date,
  valido_ate      date,
  registrado_por  uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  check (valido_ate is null or concluido_em is null or valido_ate >= concluido_em)
);
create index if not exists participante_formacoes_participante_idx on public.participante_formacoes (participante_id);
create index if not exists participante_formacoes_workspace_idx on public.participante_formacoes (workspace_id, valido_ate);
create index if not exists participante_formacoes_registrado_idx on public.participante_formacoes (registrado_por);

create table if not exists public.participante_horas (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete restrict,
  participante_id uuid not null references public.participantes (id) on delete cascade,
  data            date not null,
  horas           numeric(5,2) not null check (horas > 0 and horas <= 24),
  atividade       text not null check (length(trim(atividade)) between 2 and 200),
  registrado_por  uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists participante_horas_participante_idx on public.participante_horas (participante_id, data desc);
create index if not exists participante_horas_workspace_idx on public.participante_horas (workspace_id, data);
create index if not exists participante_horas_registrado_idx on public.participante_horas (registrado_por);

create table if not exists public.participantes_acesso (
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  nivel         text not null check (nivel in ('ver','gerenciar','sensiveis')),
  concedido_por uuid references public.profiles (id) on delete set null,
  concedido_em  timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists participantes_acesso_user_idx on public.participantes_acesso (user_id);
create index if not exists participantes_acesso_concedido_idx on public.participantes_acesso (concedido_por);

create table if not exists public.participantes_auditoria (
  id              bigint generated always as identity primary key,
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  participante_id uuid references public.participantes (id) on delete set null,
  user_id         uuid references public.profiles (id) on delete set null,
  acao            text not null,
  detalhe         jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
create index if not exists participantes_auditoria_workspace_idx on public.participantes_auditoria (workspace_id, created_at desc);
create index if not exists participantes_auditoria_participante_idx on public.participantes_auditoria (participante_id);
create index if not exists participantes_auditoria_user_idx on public.participantes_auditoria (user_id);

-- Limite de inscrições públicas por origem (hash do IP, nunca o IP).
create table if not exists public.participantes_inscricoes_tentativas (
  ip_hash   text not null,
  criado_em timestamptz not null default now()
);
create index if not exists participantes_inscricoes_tentativas_idx on public.participantes_inscricoes_tentativas (ip_hash, criado_em);

-- ---------------------------------------------------------------- nível de acesso

-- 0 nada, 1 ver, 2 gerenciar, 3 dados sensíveis. Admin é 3. Exige ser
-- membro ativo (e a verificação em duas etapas, quando cabível), via
-- is_workspace_member.
create or replace function private.nivel_participantes(p_workspace_id uuid)
returns integer language sql security definer set search_path = '' stable as $$
  select case
    when not (select private.is_workspace_member(p_workspace_id)) then 0
    when (select private.workspace_role(p_workspace_id)) = 'admin' then 3
    else coalesce((
      select case a.nivel when 'sensiveis' then 3 when 'gerenciar' then 2 else 1 end
      from public.participantes_acesso a
      where a.workspace_id = p_workspace_id and a.user_id = (select auth.uid())
    ), 0)
  end
$$;
revoke all on function private.nivel_participantes(uuid) from public, anon;
grant execute on function private.nivel_participantes(uuid) to authenticated;

create or replace function private.auditar_participante(p_workspace_id uuid, p_participante_id uuid, p_acao text, p_detalhe jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.participantes_auditoria (workspace_id, participante_id, user_id, acao, detalhe)
  values (p_workspace_id, p_participante_id, (select auth.uid()), p_acao, coalesce(p_detalhe, '{}'::jsonb))
$$;
revoke all on function private.auditar_participante(uuid, uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- acesso às tabelas

alter table public.participantes enable row level security;
alter table public.participante_formacoes enable row level security;
alter table public.participante_horas enable row level security;
alter table public.participantes_acesso enable row level security;
alter table public.participantes_auditoria enable row level security;
alter table public.participantes_inscricoes_tentativas enable row level security;

revoke all on public.participantes, public.participante_formacoes, public.participante_horas,
  public.participantes_acesso, public.participantes_auditoria, public.participantes_inscricoes_tentativas from anon;
revoke all on public.participantes, public.participantes_acesso, public.participantes_auditoria,
  public.participantes_inscricoes_tentativas from authenticated;

-- As colunas cifradas e o HMAC do CPF nunca saem pela API.
grant select (id, workspace_id, situacao, vinculo, setores, funcao, nome, nome_social, email, telefone, data_nascimento,
  cpf_mascara, cep, logradouro, numero, complemento, bairro, cidade, uf, emergencia_nome, emergencia_telefone,
  emergencia_parentesco, tem_dados_de_saude, responsavel_nome, responsavel_telefone, habilidades, idiomas, disponibilidade,
  observacoes, origem, consentimento_em, consentimento_versao, user_id, criado_por, aprovado_por, aprovado_em,
  desligado_em, motivo_desligamento, anonimizado_em, created_at, updated_at)
  on public.participantes to authenticated;
grant select on public.participantes_acesso, public.participantes_auditoria to authenticated;

create policy participantes_select_nivel on public.participantes
  for select to authenticated using ((select private.nivel_participantes(workspace_id)) >= 1);

revoke update, truncate, references, trigger on public.participante_formacoes, public.participante_horas from authenticated;
grant select, insert, delete on public.participante_formacoes, public.participante_horas to authenticated;
create policy participante_formacoes_select on public.participante_formacoes
  for select to authenticated using ((select private.nivel_participantes(workspace_id)) >= 1);
create policy participante_formacoes_insert on public.participante_formacoes
  for insert to authenticated with check (
    (select private.nivel_participantes(workspace_id)) >= 2 and registrado_por = (select auth.uid())
    and exists (select 1 from public.participantes p where p.id = participante_id and p.workspace_id = participante_formacoes.workspace_id and p.anonimizado_em is null)
  );
create policy participante_formacoes_delete on public.participante_formacoes
  for delete to authenticated using ((select private.nivel_participantes(workspace_id)) >= 2);
create policy participante_horas_select on public.participante_horas
  for select to authenticated using ((select private.nivel_participantes(workspace_id)) >= 1);
create policy participante_horas_insert on public.participante_horas
  for insert to authenticated with check (
    (select private.nivel_participantes(workspace_id)) >= 2 and registrado_por = (select auth.uid())
    and exists (select 1 from public.participantes p where p.id = participante_id and p.workspace_id = participante_horas.workspace_id and p.anonimizado_em is null)
  );
create policy participante_horas_delete on public.participante_horas
  for delete to authenticated using ((select private.nivel_participantes(workspace_id)) >= 2);

create policy participantes_acesso_select on public.participantes_acesso
  for select to authenticated using (
    user_id = (select auth.uid()) or (select private.nivel_participantes(workspace_id)) >= 3
  );
create policy participantes_auditoria_select on public.participantes_auditoria
  for select to authenticated using ((select private.workspace_role(workspace_id)) = 'admin');

-- ---------------------------------------------------------------- escrita

-- Aplica os campos de p (jsonb) a um participante. Só mexe no que vier em p.
-- CPF e saúde: presentes em p → cifra (vazio apaga); ausentes → mantém.
create or replace function private.aplicar_campos_participante(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_chave text := private.chave_participantes();
  v_cpf text;
  v_tipo text;
  v_restricoes text;
  txt constant text[] := array['funcao','nome','nome_social','telefone','cep','logradouro','numero','complemento','bairro','cidade',
    'emergencia_nome','emergencia_telefone','emergencia_parentesco','responsavel_nome','responsavel_telefone','observacoes'];
  arr constant text[] := array['setores','habilidades','idiomas','disponibilidade'];
  k text;
begin
  if v_chave is null then raise exception 'Chave de cifra indisponível.' using errcode = 'P0001'; end if;
  foreach k in array txt loop
    if p ? k then
      execute format('update public.participantes set %I = $1 where id = $2', k)
        using nullif(left(trim(coalesce(p->>k, '')), 4000), ''), p_id;
    end if;
  end loop;
  foreach k in array arr loop
    if p ? k then
      if jsonb_typeof(p->k) <> 'array' then raise exception 'Campo % inválido.', k using errcode = 'P0001'; end if;
      execute format('update public.participantes set %I = $1 where id = $2', k)
        using (select coalesce(array_agg(distinct left(trim(x), 80)) filter (where trim(x) <> ''), '{}') from jsonb_array_elements_text(p->k) x), p_id;
    end if;
  end loop;
  if p ? 'email' then
    update public.participantes set email = nullif(lower(trim(p->>'email')), '') where id = p_id;
  end if;
  if p ? 'uf' then
    update public.participantes set uf = nullif(upper(trim(p->>'uf')), '') where id = p_id;
  end if;
  if p ? 'data_nascimento' then
    if nullif(p->>'data_nascimento', '') is not null and (p->>'data_nascimento')::date > (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'Data de nascimento no futuro.' using errcode = 'P0001';
    end if;
    update public.participantes set data_nascimento = nullif(p->>'data_nascimento', '')::date where id = p_id;
  end if;
  if p ? 'vinculo' then
    update public.participantes set vinculo = p->>'vinculo' where id = p_id;
  end if;
  if p ? 'cpf' then
    v_cpf := regexp_replace(coalesce(p->>'cpf', ''), '\D', '', 'g');
    if v_cpf = '' then
      update public.participantes set cpf_cifrado = null, cpf_hash = null, cpf_mascara = null where id = p_id;
    else
      if not private.cpf_valido(v_cpf) then raise exception 'CPF inválido.' using errcode = 'P0001'; end if;
      update public.participantes set
        cpf_cifrado = extensions.pgp_sym_encrypt(v_cpf, v_chave, 'cipher-algo=aes256'),
        cpf_hash = encode(extensions.hmac(v_cpf, v_chave, 'sha256'), 'hex'),
        cpf_mascara = '***.' || substr(v_cpf, 4, 3) || '.' || substr(v_cpf, 7, 3) || '-**'
      where id = p_id;
    end if;
  end if;
  if p ? 'tipo_sanguineo' or p ? 'restricoes_saude' then
    v_tipo := nullif(trim(coalesce(p->>'tipo_sanguineo', '')), '');
    v_restricoes := nullif(left(trim(coalesce(p->>'restricoes_saude', '')), 2000), '');
    if v_tipo is not null and v_tipo not in ('A+','A-','B+','B-','AB+','AB-','O+','O-') then
      raise exception 'Tipo sanguíneo inválido.' using errcode = 'P0001';
    end if;
    if v_tipo is null and v_restricoes is null then
      update public.participantes set saude_cifrada = null, tem_dados_de_saude = false where id = p_id;
    else
      update public.participantes set
        saude_cifrada = extensions.pgp_sym_encrypt(jsonb_build_object('tipo_sanguineo', v_tipo, 'restricoes', v_restricoes)::text, v_chave, 'cipher-algo=aes256'),
        tem_dados_de_saude = true
      where id = p_id;
    end if;
  end if;
  update public.participantes set updated_at = now() where id = p_id;
end $$;
revoke all on function private.aplicar_campos_participante(uuid, jsonb) from public, anon, authenticated;

create or replace function private.traduzir_duplicado(p_erro text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_erro like '%participantes_email_unico%' then 'Já existe um cadastro com este e-mail.'
    when p_erro like '%participantes_cpf_unico%' then 'Já existe um cadastro com este CPF.'
    else 'Cadastro duplicado.'
  end
$$;

create or replace function public.salvar_participante(p_workspace_id uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_atual public.participantes;
begin
  if (select private.nivel_participantes(p_workspace_id)) < 2 then
    raise exception 'Você não tem acesso para editar participantes.' using errcode = 'P0001';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Dados inválidos.' using errcode = 'P0001'; end if;
  if p ? 'vinculo' and (p->>'vinculo') not in ('voluntario','colaborador','coordenador','diretoria','jovem','instrutor') then
    raise exception 'Vínculo inválido.' using errcode = 'P0001';
  end if;
  begin
    if v_id is null then
      if coalesce(trim(p->>'nome'), '') = '' then raise exception 'Informe o nome.' using errcode = 'P0001'; end if;
      insert into public.participantes (workspace_id, nome, vinculo, situacao, origem, criado_por, aprovado_por, aprovado_em)
      values (p_workspace_id, trim(p->>'nome'), coalesce(p->>'vinculo', 'voluntario'), 'ativo', 'cadastro', (select auth.uid()), (select auth.uid()), now())
      returning id into v_id;
      perform private.aplicar_campos_participante(v_id, p);
      perform private.auditar_participante(p_workspace_id, v_id, 'criar', '{}');
    else
      select * into v_atual from public.participantes where id = v_id and workspace_id = p_workspace_id for update;
      if not found then raise exception 'Participante não encontrado.' using errcode = 'P0001'; end if;
      if v_atual.anonimizado_em is not null then raise exception 'Cadastro anonimizado não pode ser editado.' using errcode = 'P0001'; end if;
      perform private.aplicar_campos_participante(v_id, p);
      perform private.auditar_participante(p_workspace_id, v_id, 'editar',
        jsonb_build_object('campos', (select coalesce(jsonb_agg(k), '[]') from jsonb_object_keys(p) k)));
    end if;
  exception when unique_violation then
    raise exception '%', private.traduzir_duplicado(sqlerrm) using errcode = 'P0001';
  end;
  return v_id;
end $$;

create or replace function public.mudar_situacao_participante(p_id uuid, p_situacao text, p_motivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
begin
  select * into v from public.participantes where id = p_id for update;
  if not found or (select private.nivel_participantes(v.workspace_id)) < 2 then
    raise exception 'Participante não encontrado.' using errcode = 'P0001';
  end if;
  if v.anonimizado_em is not null then raise exception 'Cadastro anonimizado.' using errcode = 'P0001'; end if;
  if p_situacao not in ('ativo','inativo','desligado') then raise exception 'Situação inválida.' using errcode = 'P0001'; end if;
  if p_situacao = 'desligado' and length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escreva o motivo do desligamento.' using errcode = 'P0001';
  end if;
  update public.participantes set
    situacao = p_situacao,
    aprovado_por = case when v.situacao = 'candidato' and p_situacao = 'ativo' then (select auth.uid()) else aprovado_por end,
    aprovado_em = case when v.situacao = 'candidato' and p_situacao = 'ativo' then now() else aprovado_em end,
    desligado_em = case when p_situacao = 'desligado' then now() else null end,
    motivo_desligamento = case when p_situacao = 'desligado' then left(trim(p_motivo), 600) else null end,
    updated_at = now()
  where id = p_id;
  perform private.auditar_participante(v.workspace_id, p_id,
    case when v.situacao = 'candidato' and p_situacao = 'ativo' then 'aprovar' else 'situacao' end,
    jsonb_build_object('de', v.situacao, 'para', p_situacao));
end $$;

-- Candidato recusado: não vira cadastro. Apaga (nunca foi participante).
create or replace function public.recusar_candidato(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
begin
  select * into v from public.participantes where id = p_id for update;
  if not found or (select private.nivel_participantes(v.workspace_id)) < 2 then
    raise exception 'Participante não encontrado.' using errcode = 'P0001';
  end if;
  if v.situacao <> 'candidato' then raise exception 'Só uma inscrição pendente pode ser recusada.' using errcode = 'P0001'; end if;
  perform private.auditar_participante(v.workspace_id, null, 'recusar_inscricao', jsonb_build_object('origem', v.origem));
  delete from public.participantes where id = p_id;
end $$;

create or replace function public.dados_sensiveis_participante(p_id uuid)
returns table (cpf text, tipo_sanguineo text, restricoes_saude text)
language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
  v_chave text := private.chave_participantes();
  v_saude jsonb;
begin
  select * into v from public.participantes where id = p_id;
  if not found or (select private.nivel_participantes(v.workspace_id)) < 3 then
    raise exception 'Você não tem acesso aos dados sensíveis.' using errcode = 'P0001';
  end if;
  perform private.auditar_participante(v.workspace_id, p_id, 'ver_sensiveis', '{}');
  v_saude := case when v.saude_cifrada is null then null else extensions.pgp_sym_decrypt(v.saude_cifrada, v_chave)::jsonb end;
  return query select
    case when v.cpf_cifrado is null then null else extensions.pgp_sym_decrypt(v.cpf_cifrado, v_chave) end,
    v_saude->>'tipo_sanguineo',
    v_saude->>'restricoes';
end $$;

-- Pedido do titular (LGPD art. 18): apaga os dados pessoais e mantém só o
-- que é estatística (vínculo, setores, horas), sem identificar ninguém.
create or replace function public.anonimizar_participante(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
begin
  select * into v from public.participantes where id = p_id for update;
  if not found or (select private.nivel_participantes(v.workspace_id)) < 3 then
    raise exception 'Você não tem acesso para anonimizar.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escreva o motivo.' using errcode = 'P0001'; end if;
  update public.participantes set
    nome = 'Participante anonimizado', nome_social = null, email = null, telefone = null, data_nascimento = null,
    cpf_cifrado = null, cpf_hash = null, cpf_mascara = null,
    cep = null, logradouro = null, numero = null, complemento = null, bairro = null, cidade = null, uf = null,
    emergencia_nome = null, emergencia_telefone = null, emergencia_parentesco = null,
    saude_cifrada = null, tem_dados_de_saude = false, responsavel_nome = null, responsavel_telefone = null,
    habilidades = '{}', idiomas = '{}', disponibilidade = '{}', observacoes = null, funcao = null, user_id = null,
    situacao = 'desligado', desligado_em = coalesce(desligado_em, now()), motivo_desligamento = 'Dados apagados a pedido do titular.',
    anonimizado_em = now(), updated_at = now()
  where id = p_id;
  delete from public.participante_formacoes where participante_id = p_id;
  update public.participante_horas set atividade = 'Atividade' where participante_id = p_id;
  perform private.auditar_participante(v.workspace_id, p_id, 'anonimizar', jsonb_build_object('motivo', left(trim(p_motivo), 300)));
end $$;

create or replace function public.definir_acesso_participantes(p_workspace_id uuid, p_user_id uuid, p_nivel text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select private.workspace_role(p_workspace_id)) is distinct from 'admin' then
    raise exception 'Só um admin define quem acessa o cadastro de participantes.' using errcode = 'P0001';
  end if;
  if p_nivel is not null and p_nivel not in ('ver','gerenciar','sensiveis') then
    raise exception 'Nível inválido.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = p_user_id) then
    raise exception 'A pessoa precisa ser do espaço.' using errcode = 'P0001';
  end if;
  if p_nivel is null then
    delete from public.participantes_acesso where workspace_id = p_workspace_id and user_id = p_user_id;
  else
    insert into public.participantes_acesso (workspace_id, user_id, nivel, concedido_por)
    values (p_workspace_id, p_user_id, p_nivel, (select auth.uid()))
    on conflict (workspace_id, user_id) do update set nivel = excluded.nivel, concedido_por = excluded.concedido_por, concedido_em = now();
  end if;
  perform private.auditar_participante(p_workspace_id, null, 'acesso', jsonb_build_object('usuario', p_user_id, 'nivel', p_nivel));
end $$;

create or replace function public.auditar_exportacao_participantes(p_workspace_id uuid, p_quantidade integer, p_filtros jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select private.nivel_participantes(p_workspace_id)) < 2 then
    raise exception 'Você não tem acesso para exportar.' using errcode = 'P0001';
  end if;
  perform private.auditar_participante(p_workspace_id, null, 'exportar', jsonb_build_object('quantidade', p_quantidade, 'filtros', coalesce(p_filtros, '{}'::jsonb)));
end $$;

-- Inscrição pelo formulário público. Só o servidor chama (service role),
-- depois de conferir o formulário; aqui ficam o limite por origem, o aceite
-- da LGPD e a regra do responsável para menores de 18.
create or replace function public.inscrever_participante(p_workspace_id uuid, p jsonb, p_ip_hash text, p_versao_termo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_nasc date;
begin
  if (select count(*) from public.participantes_inscricoes_tentativas t
      where t.ip_hash = p_ip_hash and t.criado_em > now() - interval '1 hour') >= 5 then
    raise exception 'Muitas inscrições seguidas deste endereço. Tente de novo mais tarde.' using errcode = 'P0001';
  end if;
  insert into public.participantes_inscricoes_tentativas (ip_hash) values (p_ip_hash);
  delete from public.participantes_inscricoes_tentativas where criado_em < now() - interval '1 day';

  if coalesce((p->>'consentimento')::boolean, false) is not true then
    raise exception 'É preciso aceitar o termo de tratamento de dados.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p->>'nome'), '') = '' or coalesce(trim(p->>'email'), '') = '' then
    raise exception 'Informe nome e e-mail.' using errcode = 'P0001';
  end if;
  v_nasc := nullif(p->>'data_nascimento', '')::date;
  if v_nasc is null then raise exception 'Informe a data de nascimento.' using errcode = 'P0001'; end if;
  if v_nasc > (now() at time zone 'America/Sao_Paulo')::date - interval '18 years'
     and (coalesce(trim(p->>'responsavel_nome'), '') = '' or coalesce(trim(p->>'responsavel_telefone'), '') = '') then
    raise exception 'Para menores de 18 anos, informe o nome e o telefone do responsável.' using errcode = 'P0001';
  end if;

  begin
    insert into public.participantes (workspace_id, nome, vinculo, situacao, origem, consentimento_em, consentimento_versao)
    values (p_workspace_id, trim(p->>'nome'),
            case when p->>'vinculo' in ('voluntario','jovem') then p->>'vinculo' else 'voluntario' end,
            'candidato', 'formulario', now(), left(coalesce(p_versao_termo, ''), 40))
    returning id into v_id;
    perform private.aplicar_campos_participante(v_id, p - 'vinculo' - 'consentimento');
  exception when unique_violation then
    raise exception 'Já recebemos uma inscrição com estes dados. A coordenação do Voluntariado vai entrar em contato.' using errcode = 'P0001';
  end;
  insert into public.participantes_auditoria (workspace_id, participante_id, user_id, acao, detalhe)
  values (p_workspace_id, v_id, null, 'inscricao_publica', '{}');
  return v_id;
end $$;

revoke all on function public.salvar_participante(uuid, uuid, jsonb) from public, anon;
revoke all on function public.mudar_situacao_participante(uuid, text, text) from public, anon;
revoke all on function public.recusar_candidato(uuid) from public, anon;
revoke all on function public.dados_sensiveis_participante(uuid) from public, anon;
revoke all on function public.anonimizar_participante(uuid, text) from public, anon;
revoke all on function public.definir_acesso_participantes(uuid, uuid, text) from public, anon;
revoke all on function public.auditar_exportacao_participantes(uuid, integer, jsonb) from public, anon;
revoke all on function public.inscrever_participante(uuid, jsonb, text, text) from public, anon, authenticated;
revoke all on function private.cpf_valido(text) from public, anon;
revoke all on function private.traduzir_duplicado(text) from public, anon, authenticated;
grant execute on function public.salvar_participante(uuid, uuid, jsonb) to authenticated;
grant execute on function public.mudar_situacao_participante(uuid, text, text) to authenticated;
grant execute on function public.recusar_candidato(uuid) to authenticated;
grant execute on function public.dados_sensiveis_participante(uuid) to authenticated;
grant execute on function public.anonimizar_participante(uuid, text) to authenticated;
grant execute on function public.definir_acesso_participantes(uuid, uuid, text) to authenticated;
grant execute on function public.auditar_exportacao_participantes(uuid, integer, jsonb) to authenticated;
grant execute on function public.inscrever_participante(uuid, jsonb, text, text) to service_role;
