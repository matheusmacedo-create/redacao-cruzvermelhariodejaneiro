-- Equipe: gestão da equipe contratada da filial (funcionários, coordenadores,
-- administrativo, diretoria). Separada do Voluntariado, com dados e acessos
-- próprios. Folha de pagamento, eSocial e ponto ficam fora de propósito:
-- são da contabilidade e de sistemas homologados.
--
-- Modelo: ficha em camadas (Factorial/BambooHR), histórico de movimentações
-- (Convenia), remuneração com vigência (Personio).
--
-- Camadas e níveis (equipe_acesso; admin = 4):
--   1 ver         → equipe_membros: nome, cargo, setor, vínculo, gestor, contato de trabalho
--   2 gerenciar   → + equipe_pessoais (endereço, nascimento, emergência) e editar
--   3 documentos  → + abrir CPF, RG, PIS, CTPS, título, CNH (cifrados)
--   4 remuneração → + salários, benefícios e dados bancários (cifrados)
-- Toda abertura de dado cifrado e toda mudança de acesso vão para a auditoria.

-- O Voluntariado passa a ser só voluntariado. `not valid`: o que já existe
-- com outro vínculo fica como está (nada é apagado nem trocado por aqui);
-- todo cadastro novo ou editado passa pela regra nova.
alter table public.participantes drop constraint if exists participantes_vinculo_check;
alter table public.participantes add constraint participantes_vinculo_check check (vinculo in ('voluntario','jovem','instrutor')) not valid;

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
  if p ? 'vinculo' and (p->>'vinculo') not in ('voluntario','jovem','instrutor') then
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

-- ---------------------------------------------------------------- chave

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'equipe_chave') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'equipe_chave', 'Chave de cifra dos documentos, salários e dados bancários da equipe.');
  end if;
end $$;

create or replace function private.chave_equipe()
returns text language sql security definer set search_path = '' stable as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'equipe_chave' limit 1
$$;
revoke all on function private.chave_equipe() from public, anon, authenticated;

-- ---------------------------------------------------------------- tabelas

create table if not exists public.equipe_membros (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete restrict,
  user_id             uuid references public.profiles (id) on delete set null,
  situacao            text not null default 'ativo' check (situacao in ('ativo','afastado','desligado')),
  nome                text not null check (length(trim(nome)) between 2 and 200),
  nome_social         text check (nome_social is null or length(nome_social) <= 200),
  email_trabalho      text check (email_trabalho is null or (length(email_trabalho) <= 254 and email_trabalho ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  telefone_trabalho   text check (telefone_trabalho is null or length(telefone_trabalho) <= 40),

  vinculo             text not null default 'clt' check (vinculo in ('clt','estagio','pj','temporario','cedido','estatutario','outro')),
  cargo               text check (cargo is null or length(cargo) <= 120),
  setor               text check (setor is null or length(setor) <= 120),
  gestor_id           uuid references public.equipe_membros (id) on delete set null,
  admissao            date,
  jornada_semanal     numeric(4,1) check (jornada_semanal is null or (jornada_semanal > 0 and jornada_semanal <= 60)),
  horario             text check (horario is null or length(horario) <= 120),
  local_trabalho      text check (local_trabalho is null or length(local_trabalho) <= 120),
  desligamento        date,
  motivo_desligamento text check (motivo_desligamento is null or length(motivo_desligamento) <= 600),

  documentos_cifrados bytea,
  tem_documentos      boolean not null default false,
  cpf_hash            text,
  cpf_mascara         text,
  banco_cifrado       bytea,
  tem_banco           boolean not null default false,

  observacoes         text check (observacoes is null or length(observacoes) <= 4000),
  criado_por          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (gestor_id is null or gestor_id <> id)
);
create unique index if not exists equipe_membros_cpf_unico on public.equipe_membros (workspace_id, cpf_hash) where cpf_hash is not null;
create unique index if not exists equipe_membros_usuario_unico on public.equipe_membros (workspace_id, user_id) where user_id is not null;
create index if not exists equipe_membros_workspace_idx on public.equipe_membros (workspace_id, situacao, setor);
create index if not exists equipe_membros_gestor_idx on public.equipe_membros (gestor_id);
create index if not exists equipe_membros_user_idx on public.equipe_membros (user_id);
create index if not exists equipe_membros_criado_por_idx on public.equipe_membros (criado_por);

create table if not exists public.equipe_pessoais (
  membro_id             uuid primary key references public.equipe_membros (id) on delete cascade,
  workspace_id          uuid not null references public.workspaces (id) on delete restrict,
  email_pessoal         text check (email_pessoal is null or (length(email_pessoal) <= 254 and email_pessoal ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  telefone_pessoal      text check (telefone_pessoal is null or length(telefone_pessoal) <= 40),
  data_nascimento       date check (data_nascimento is null or data_nascimento >= '1900-01-01'),
  cep                   text check (cep is null or length(cep) <= 12),
  logradouro            text check (logradouro is null or length(logradouro) <= 200),
  numero                text check (numero is null or length(numero) <= 20),
  complemento           text check (complemento is null or length(complemento) <= 120),
  bairro                text check (bairro is null or length(bairro) <= 120),
  cidade                text check (cidade is null or length(cidade) <= 120),
  uf                    text check (uf is null or uf ~ '^[A-Z]{2}$'),
  emergencia_nome       text check (emergencia_nome is null or length(emergencia_nome) <= 200),
  emergencia_telefone   text check (emergencia_telefone is null or length(emergencia_telefone) <= 40),
  emergencia_parentesco text check (emergencia_parentesco is null or length(emergencia_parentesco) <= 60),
  updated_at            timestamptz not null default now()
);
create index if not exists equipe_pessoais_workspace_idx on public.equipe_pessoais (workspace_id);

create table if not exists public.equipe_movimentacoes (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete restrict,
  membro_id      uuid not null references public.equipe_membros (id) on delete cascade,
  vigencia       date not null,
  tipo           text not null check (tipo in ('admissao','cargo','setor','gestor','vinculo','jornada','afastamento','retorno','desligamento','reativacao')),
  de             text,
  para           text,
  observacao     text check (observacao is null or length(observacao) <= 600),
  registrado_por uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists equipe_movimentacoes_membro_idx on public.equipe_movimentacoes (membro_id, vigencia desc);
create index if not exists equipe_movimentacoes_workspace_idx on public.equipe_movimentacoes (workspace_id);
create index if not exists equipe_movimentacoes_registrado_idx on public.equipe_movimentacoes (registrado_por);

create table if not exists public.equipe_remuneracoes (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete restrict,
  membro_id      uuid not null references public.equipe_membros (id) on delete cascade,
  vigencia       date not null,
  motivo         text not null check (motivo in ('admissao','reajuste','promocao','dissidio','ajuste','outro')),
  dados_cifrados bytea not null,
  registrado_por uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists equipe_remuneracoes_membro_idx on public.equipe_remuneracoes (membro_id, vigencia desc);
create index if not exists equipe_remuneracoes_workspace_idx on public.equipe_remuneracoes (workspace_id);
create index if not exists equipe_remuneracoes_registrado_idx on public.equipe_remuneracoes (registrado_por);

create table if not exists public.equipe_acesso (
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  nivel         text not null check (nivel in ('ver','gerenciar','documentos','remuneracao')),
  concedido_por uuid references public.profiles (id) on delete set null,
  concedido_em  timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists equipe_acesso_user_idx on public.equipe_acesso (user_id);
create index if not exists equipe_acesso_concedido_idx on public.equipe_acesso (concedido_por);

create table if not exists public.equipe_auditoria (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  membro_id    uuid references public.equipe_membros (id) on delete set null,
  user_id      uuid references public.profiles (id) on delete set null,
  acao         text not null,
  detalhe      jsonb not null default '{}',
  created_at   timestamptz not null default now()
);
create index if not exists equipe_auditoria_workspace_idx on public.equipe_auditoria (workspace_id, created_at desc);
create index if not exists equipe_auditoria_membro_idx on public.equipe_auditoria (membro_id);
create index if not exists equipe_auditoria_user_idx on public.equipe_auditoria (user_id);

-- ---------------------------------------------------------------- nível e auditoria

create or replace function private.nivel_equipe(p_workspace_id uuid)
returns integer language sql security definer set search_path = '' stable as $$
  select case
    when not (select private.is_workspace_member(p_workspace_id)) then 0
    when (select private.workspace_role(p_workspace_id)) = 'admin' then 4
    else coalesce((
      select case a.nivel when 'remuneracao' then 4 when 'documentos' then 3 when 'gerenciar' then 2 else 1 end
      from public.equipe_acesso a
      where a.workspace_id = p_workspace_id and a.user_id = (select auth.uid())
    ), 0)
  end
$$;
revoke all on function private.nivel_equipe(uuid) from public, anon;
grant execute on function private.nivel_equipe(uuid) to authenticated;

create or replace function private.auditar_equipe(p_workspace_id uuid, p_membro_id uuid, p_acao text, p_detalhe jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.equipe_auditoria (workspace_id, membro_id, user_id, acao, detalhe)
  values (p_workspace_id, p_membro_id, (select auth.uid()), p_acao, coalesce(p_detalhe, '{}'::jsonb))
$$;
revoke all on function private.auditar_equipe(uuid, uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- acesso às tabelas

alter table public.equipe_membros enable row level security;
alter table public.equipe_pessoais enable row level security;
alter table public.equipe_movimentacoes enable row level security;
alter table public.equipe_remuneracoes enable row level security;
alter table public.equipe_acesso enable row level security;
alter table public.equipe_auditoria enable row level security;

revoke all on public.equipe_membros, public.equipe_pessoais, public.equipe_movimentacoes, public.equipe_remuneracoes,
  public.equipe_acesso, public.equipe_auditoria from anon, authenticated;

grant select (id, workspace_id, user_id, situacao, nome, nome_social, email_trabalho, telefone_trabalho, vinculo, cargo, setor,
  gestor_id, admissao, jornada_semanal, horario, local_trabalho, desligamento, motivo_desligamento, tem_documentos, cpf_mascara,
  tem_banco, observacoes, criado_por, created_at, updated_at)
  on public.equipe_membros to authenticated;
grant select on public.equipe_pessoais, public.equipe_movimentacoes, public.equipe_acesso, public.equipe_auditoria to authenticated;

create policy equipe_membros_select on public.equipe_membros
  for select to authenticated using ((select private.nivel_equipe(workspace_id)) >= 1);
create policy equipe_pessoais_select on public.equipe_pessoais
  for select to authenticated using ((select private.nivel_equipe(workspace_id)) >= 2);
create policy equipe_movimentacoes_select on public.equipe_movimentacoes
  for select to authenticated using ((select private.nivel_equipe(workspace_id)) >= 2);
create policy equipe_acesso_select on public.equipe_acesso
  for select to authenticated using (user_id = (select auth.uid()) or (select private.nivel_equipe(workspace_id)) >= 4);
create policy equipe_auditoria_select on public.equipe_auditoria
  for select to authenticated using ((select private.workspace_role(workspace_id)) = 'admin');
-- equipe_remuneracoes: sem política de leitura; só pela função, com auditoria.

-- ---------------------------------------------------------------- escrita

create or replace function private.movimentar(p_membro public.equipe_membros, p_tipo text, p_de text, p_para text, p_vigencia date, p_obs text)
returns void language sql security definer set search_path = '' as $$
  insert into public.equipe_movimentacoes (workspace_id, membro_id, vigencia, tipo, de, para, observacao, registrado_por)
  values (p_membro.workspace_id, p_membro.id, p_vigencia, p_tipo, p_de, p_para, nullif(left(trim(coalesce(p_obs, '')), 600), ''), (select auth.uid()))
$$;
revoke all on function private.movimentar(public.equipe_membros, text, text, text, date, text) from public, anon, authenticated;

create or replace function private.cpf_de_documentos(p jsonb)
returns text language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(coalesce(p->>'cpf', ''), '\D', '', 'g'), '')
$$;

/**
 * Cadastra ou atualiza uma pessoa da equipe. Só mexe no que vier em p.
 * Mudança de cargo, setor, gestor, vínculo ou jornada vira movimentação,
 * com a vigência informada (p.vigencia) ou hoje.
 */
create or replace function public.salvar_membro_equipe(p_workspace_id uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_nivel integer := (select private.nivel_equipe(p_workspace_id));
  v_chave text := private.chave_equipe();
  v_id uuid := p_id;
  v_antes public.equipe_membros;
  v_depois public.equipe_membros;
  v_vig date := coalesce(nullif(p->>'vigencia', '')::date, (now() at time zone 'America/Sao_Paulo')::date);
  v_obs text := p->>'observacao_da_mudanca';
  v_cpf text;
  v_docs jsonb;
  v_gestor uuid;
  k text;
  txt constant text[] := array['nome','nome_social','telefone_trabalho','cargo','setor','horario','local_trabalho','observacoes'];
  pes constant text[] := array['telefone_pessoal','cep','logradouro','numero','complemento','bairro','cidade','emergencia_nome','emergencia_telefone','emergencia_parentesco'];
begin
  if v_nivel < 2 then raise exception 'Você não tem acesso para editar a equipe.' using errcode = 'P0001'; end if;
  if v_chave is null then raise exception 'Chave de cifra indisponível.' using errcode = 'P0001'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Dados inválidos.' using errcode = 'P0001'; end if;
  if p ? 'vinculo' and (p->>'vinculo') not in ('clt','estagio','pj','temporario','cedido','estatutario','outro') then
    raise exception 'Vínculo inválido.' using errcode = 'P0001';
  end if;
  if p ? 'documentos' and v_nivel < 3 then
    raise exception 'Só quem tem acesso a documentos altera os documentos.' using errcode = 'P0001';
  end if;
  if p ? 'banco' and v_nivel < 4 then
    raise exception 'Só quem tem acesso a remuneração e banco altera os dados bancários.' using errcode = 'P0001';
  end if;

  begin
    if v_id is null then
      if coalesce(trim(p->>'nome'), '') = '' then raise exception 'Informe o nome.' using errcode = 'P0001'; end if;
      insert into public.equipe_membros (workspace_id, nome, vinculo, criado_por)
      values (p_workspace_id, trim(p->>'nome'), coalesce(nullif(p->>'vinculo', ''), 'clt'), (select auth.uid()))
      returning * into v_antes;
      v_id := v_antes.id;
      insert into public.equipe_pessoais (membro_id, workspace_id) values (v_id, p_workspace_id);
    else
      select * into v_antes from public.equipe_membros where id = v_id and workspace_id = p_workspace_id for update;
      if not found then raise exception 'Pessoa não encontrada.' using errcode = 'P0001'; end if;
      insert into public.equipe_pessoais (membro_id, workspace_id) values (v_id, p_workspace_id) on conflict do nothing;
    end if;

    foreach k in array txt loop
      if p ? k then
        execute format('update public.equipe_membros set %I = $1 where id = $2', k) using nullif(left(trim(coalesce(p->>k, '')), 4000), ''), v_id;
      end if;
    end loop;
    if p ? 'email_trabalho' then update public.equipe_membros set email_trabalho = nullif(lower(trim(p->>'email_trabalho')), '') where id = v_id; end if;
    if p ? 'vinculo' then update public.equipe_membros set vinculo = p->>'vinculo' where id = v_id; end if;
    if p ? 'admissao' then update public.equipe_membros set admissao = nullif(p->>'admissao', '')::date where id = v_id; end if;
    if p ? 'jornada_semanal' then update public.equipe_membros set jornada_semanal = nullif(p->>'jornada_semanal', '')::numeric where id = v_id; end if;
    if p ? 'user_id' then
      if nullif(p->>'user_id', '') is not null and not exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = (p->>'user_id')::uuid) then
        raise exception 'O login escolhido não é deste espaço.' using errcode = 'P0001';
      end if;
      update public.equipe_membros set user_id = nullif(p->>'user_id', '')::uuid where id = v_id;
    end if;
    if p ? 'gestor_id' then
      v_gestor := nullif(p->>'gestor_id', '')::uuid;
      if v_gestor is not null then
        if not exists (select 1 from public.equipe_membros g where g.id = v_gestor and g.workspace_id = p_workspace_id) then
          raise exception 'Gestor não encontrado.' using errcode = 'P0001';
        end if;
        -- Sem ciclo: o gestor escolhido não pode estar abaixo desta pessoa.
        if exists (
          with recursive acima(id) as (
            select v_gestor
            union
            select m.gestor_id from public.equipe_membros m join acima a on m.id = a.id where m.gestor_id is not null
          ) select 1 from acima where id = v_id
        ) then
          raise exception 'Esse gestor fica abaixo desta pessoa no organograma.' using errcode = 'P0001';
        end if;
      end if;
      update public.equipe_membros set gestor_id = v_gestor where id = v_id;
    end if;

    foreach k in array pes loop
      if p ? k then
        execute format('update public.equipe_pessoais set %I = $1 where membro_id = $2', k) using nullif(left(trim(coalesce(p->>k, '')), 400), ''), v_id;
      end if;
    end loop;
    if p ? 'email_pessoal' then update public.equipe_pessoais set email_pessoal = nullif(lower(trim(p->>'email_pessoal')), '') where membro_id = v_id; end if;
    if p ? 'uf' then update public.equipe_pessoais set uf = nullif(upper(trim(p->>'uf')), '') where membro_id = v_id; end if;
    if p ? 'data_nascimento' then update public.equipe_pessoais set data_nascimento = nullif(p->>'data_nascimento', '')::date where membro_id = v_id; end if;
    update public.equipe_pessoais set updated_at = now() where membro_id = v_id;

    -- Documentos: objeto inteiro substitui o anterior; chaves vazias somem.
    if p ? 'documentos' then
      if jsonb_typeof(p->'documentos') <> 'object' then raise exception 'Documentos inválidos.' using errcode = 'P0001'; end if;
      v_docs := jsonb_strip_nulls((select coalesce(jsonb_object_agg(key, nullif(left(trim(value), 60), '')), '{}') from jsonb_each_text(p->'documentos')));
      v_cpf := private.cpf_de_documentos(v_docs);
      if v_cpf is not null and not private.cpf_valido(v_cpf) then raise exception 'CPF inválido.' using errcode = 'P0001'; end if;
      if v_cpf is not null then v_docs := v_docs || jsonb_build_object('cpf', v_cpf); end if;
      update public.equipe_membros set
        documentos_cifrados = case when v_docs = '{}'::jsonb then null else extensions.pgp_sym_encrypt(v_docs::text, v_chave, 'cipher-algo=aes256') end,
        tem_documentos = v_docs <> '{}'::jsonb,
        cpf_hash = case when v_cpf is null then null else encode(extensions.hmac(v_cpf, v_chave, 'sha256'), 'hex') end,
        cpf_mascara = case when v_cpf is null then null else '***.' || substr(v_cpf, 4, 3) || '.' || substr(v_cpf, 7, 3) || '-**' end
      where id = v_id;
    end if;
    if p ? 'banco' then
      if jsonb_typeof(p->'banco') <> 'object' then raise exception 'Dados bancários inválidos.' using errcode = 'P0001'; end if;
      v_docs := jsonb_strip_nulls((select coalesce(jsonb_object_agg(key, nullif(left(trim(value), 80), '')), '{}') from jsonb_each_text(p->'banco')));
      update public.equipe_membros set
        banco_cifrado = case when v_docs = '{}'::jsonb then null else extensions.pgp_sym_encrypt(v_docs::text, v_chave, 'cipher-algo=aes256') end,
        tem_banco = v_docs <> '{}'::jsonb
      where id = v_id;
    end if;
    update public.equipe_membros set updated_at = now() where id = v_id;
  exception when unique_violation then
    raise exception '%', case when sqlerrm like '%cpf_unico%' then 'Já existe uma pessoa na equipe com este mesmo CPF.'
      else 'Este login já está ligado a outra pessoa da equipe.' end using errcode = 'P0001';
  end;

  select * into v_depois from public.equipe_membros where id = v_id;
  if p_id is null then
    perform private.movimentar(v_depois, 'admissao', null,
      concat_ws(' · ', v_depois.cargo, v_depois.setor, v_depois.vinculo), coalesce(v_depois.admissao, v_vig), v_obs);
    perform private.auditar_equipe(p_workspace_id, v_id, 'criar', '{}');
  else
    if v_depois.cargo is distinct from v_antes.cargo then perform private.movimentar(v_depois, 'cargo', v_antes.cargo, v_depois.cargo, v_vig, v_obs); end if;
    if v_depois.setor is distinct from v_antes.setor then perform private.movimentar(v_depois, 'setor', v_antes.setor, v_depois.setor, v_vig, v_obs); end if;
    if v_depois.vinculo is distinct from v_antes.vinculo then perform private.movimentar(v_depois, 'vinculo', v_antes.vinculo, v_depois.vinculo, v_vig, v_obs); end if;
    if v_depois.jornada_semanal is distinct from v_antes.jornada_semanal then
      perform private.movimentar(v_depois, 'jornada', v_antes.jornada_semanal::text, v_depois.jornada_semanal::text, v_vig, v_obs);
    end if;
    if v_depois.gestor_id is distinct from v_antes.gestor_id then
      perform private.movimentar(v_depois, 'gestor',
        (select nome from public.equipe_membros where id = v_antes.gestor_id), (select nome from public.equipe_membros where id = v_depois.gestor_id), v_vig, v_obs);
    end if;
    perform private.auditar_equipe(p_workspace_id, v_id, 'editar',
      jsonb_build_object('campos', (select coalesce(jsonb_agg(k2), '[]') from jsonb_object_keys(p) k2)));
  end if;
  return v_id;
end $$;

create or replace function public.mudar_situacao_membro_equipe(p_id uuid, p_situacao text, p_data date, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.equipe_membros;
  v_data date := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);
begin
  select * into v from public.equipe_membros where id = p_id for update;
  if not found or (select private.nivel_equipe(v.workspace_id)) < 2 then raise exception 'Pessoa não encontrada.' using errcode = 'P0001'; end if;
  if p_situacao not in ('ativo','afastado','desligado') or p_situacao = v.situacao then raise exception 'Situação inválida.' using errcode = 'P0001'; end if;
  if p_situacao = 'desligado' and length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escreva o motivo do desligamento.' using errcode = 'P0001'; end if;
  update public.equipe_membros set situacao = p_situacao,
    desligamento = case when p_situacao = 'desligado' then v_data else null end,
    motivo_desligamento = case when p_situacao = 'desligado' then left(trim(p_motivo), 600) else null end,
    updated_at = now()
  where id = p_id;
  perform private.movimentar(v,
    case when p_situacao = 'desligado' then 'desligamento' when p_situacao = 'afastado' then 'afastamento'
         when v.situacao = 'desligado' then 'reativacao' else 'retorno' end,
    v.situacao, p_situacao, v_data, p_motivo);
  perform private.auditar_equipe(v.workspace_id, p_id, 'situacao', jsonb_build_object('de', v.situacao, 'para', p_situacao));
end $$;

/** Documentos (nível 3) e banco (nível 4) decifrados. Cada chamada é auditada. */
create or replace function public.dados_restritos_membro_equipe(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.equipe_membros;
  v_nivel integer;
  v_chave text := private.chave_equipe();
  v_out jsonb := '{}';
begin
  select * into v from public.equipe_membros where id = p_id;
  if not found then raise exception 'Pessoa não encontrada.' using errcode = 'P0001'; end if;
  v_nivel := (select private.nivel_equipe(v.workspace_id));
  if v_nivel < 3 then raise exception 'Você não tem acesso aos documentos da equipe.' using errcode = 'P0001'; end if;
  if v.documentos_cifrados is not null then
    v_out := v_out || jsonb_build_object('documentos', extensions.pgp_sym_decrypt(v.documentos_cifrados, v_chave)::jsonb);
  end if;
  if v_nivel >= 4 and v.banco_cifrado is not null then
    v_out := v_out || jsonb_build_object('banco', extensions.pgp_sym_decrypt(v.banco_cifrado, v_chave)::jsonb);
  end if;
  perform private.auditar_equipe(v.workspace_id, p_id, case when v_nivel >= 4 then 'ver_documentos_e_banco' else 'ver_documentos' end, '{}');
  return v_out;
end $$;

create or replace function public.registrar_remuneracao_equipe(p_id uuid, p_vigencia date, p_motivo text, p_salario numeric, p_beneficios jsonb, p_observacao text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.equipe_membros;
begin
  select * into v from public.equipe_membros where id = p_id;
  if not found or (select private.nivel_equipe(v.workspace_id)) < 4 then
    raise exception 'Você não tem acesso a remuneração.' using errcode = 'P0001';
  end if;
  if p_vigencia is null then raise exception 'Informe a data de vigência.' using errcode = 'P0001'; end if;
  if p_motivo not in ('admissao','reajuste','promocao','dissidio','ajuste','outro') then raise exception 'Motivo inválido.' using errcode = 'P0001'; end if;
  if p_salario is null or p_salario < 0 or p_salario > 1000000 then raise exception 'Valor inválido.' using errcode = 'P0001'; end if;
  if p_beneficios is not null and jsonb_typeof(p_beneficios) <> 'array' then raise exception 'Benefícios inválidos.' using errcode = 'P0001'; end if;
  insert into public.equipe_remuneracoes (workspace_id, membro_id, vigencia, motivo, dados_cifrados, registrado_por)
  values (v.workspace_id, p_id, p_vigencia, p_motivo,
    extensions.pgp_sym_encrypt(jsonb_build_object('salario', p_salario, 'beneficios', coalesce(p_beneficios, '[]'::jsonb), 'observacao', nullif(left(trim(coalesce(p_observacao, '')), 600), ''))::text,
      private.chave_equipe(), 'cipher-algo=aes256'),
    (select auth.uid()));
  perform private.auditar_equipe(v.workspace_id, p_id, 'registrar_remuneracao', jsonb_build_object('vigencia', p_vigencia, 'motivo', p_motivo));
end $$;

create or replace function public.remuneracoes_do_membro_equipe(p_id uuid)
returns table (id uuid, vigencia date, motivo text, salario numeric, beneficios jsonb, observacao text, registrado_por uuid, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v public.equipe_membros;
  v_chave text := private.chave_equipe();
begin
  select * into v from public.equipe_membros m where m.id = p_id;
  if not found or (select private.nivel_equipe(v.workspace_id)) < 4 then
    raise exception 'Você não tem acesso a remuneração.' using errcode = 'P0001';
  end if;
  perform private.auditar_equipe(v.workspace_id, p_id, 'ver_remuneracao', '{}');
  return query
    select r.id, r.vigencia, r.motivo,
      (d->>'salario')::numeric, coalesce(d->'beneficios', '[]'::jsonb), d->>'observacao', r.registrado_por, r.created_at
    from public.equipe_remuneracoes r,
      lateral (select extensions.pgp_sym_decrypt(r.dados_cifrados, v_chave)::jsonb as d) x
    where r.membro_id = p_id
    order by r.vigencia desc, r.created_at desc;
end $$;

create or replace function public.excluir_remuneracao_equipe(p_remuneracao_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.equipe_remuneracoes;
begin
  select * into r from public.equipe_remuneracoes where id = p_remuneracao_id;
  if not found or (select private.nivel_equipe(r.workspace_id)) < 4 then raise exception 'Registro não encontrado.' using errcode = 'P0001'; end if;
  delete from public.equipe_remuneracoes where id = p_remuneracao_id;
  perform private.auditar_equipe(r.workspace_id, r.membro_id, 'excluir_remuneracao', jsonb_build_object('vigencia', r.vigencia));
end $$;

create or replace function public.definir_acesso_equipe(p_workspace_id uuid, p_user_id uuid, p_nivel text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select private.workspace_role(p_workspace_id)) is distinct from 'admin' then
    raise exception 'Só um admin define quem acessa a Equipe.' using errcode = 'P0001';
  end if;
  if p_nivel is not null and p_nivel not in ('ver','gerenciar','documentos','remuneracao') then raise exception 'Nível inválido.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = p_user_id) then
    raise exception 'A pessoa precisa ser do espaço.' using errcode = 'P0001';
  end if;
  if p_nivel is null then
    delete from public.equipe_acesso where workspace_id = p_workspace_id and user_id = p_user_id;
  else
    insert into public.equipe_acesso (workspace_id, user_id, nivel, concedido_por) values (p_workspace_id, p_user_id, p_nivel, (select auth.uid()))
    on conflict (workspace_id, user_id) do update set nivel = excluded.nivel, concedido_por = excluded.concedido_por, concedido_em = now();
  end if;
  perform private.auditar_equipe(p_workspace_id, null, 'acesso', jsonb_build_object('usuario', p_user_id, 'nivel', p_nivel));
end $$;

create or replace function public.auditar_exportacao_equipe(p_workspace_id uuid, p_quantidade integer, p_filtros jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select private.nivel_equipe(p_workspace_id)) < 2 then raise exception 'Você não tem acesso para exportar.' using errcode = 'P0001'; end if;
  perform private.auditar_equipe(p_workspace_id, null, 'exportar', jsonb_build_object('quantidade', p_quantidade, 'filtros', coalesce(p_filtros, '{}'::jsonb)));
end $$;

revoke all on function private.cpf_de_documentos(jsonb) from public, anon, authenticated;
revoke all on function public.salvar_membro_equipe(uuid, uuid, jsonb) from public, anon;
revoke all on function public.mudar_situacao_membro_equipe(uuid, text, date, text) from public, anon;
revoke all on function public.dados_restritos_membro_equipe(uuid) from public, anon;
revoke all on function public.registrar_remuneracao_equipe(uuid, date, text, numeric, jsonb, text) from public, anon;
revoke all on function public.remuneracoes_do_membro_equipe(uuid) from public, anon;
revoke all on function public.excluir_remuneracao_equipe(uuid) from public, anon;
revoke all on function public.definir_acesso_equipe(uuid, uuid, text) from public, anon;
revoke all on function public.auditar_exportacao_equipe(uuid, integer, jsonb) from public, anon;
grant execute on function public.salvar_membro_equipe(uuid, uuid, jsonb) to authenticated;
grant execute on function public.mudar_situacao_membro_equipe(uuid, text, date, text) to authenticated;
grant execute on function public.dados_restritos_membro_equipe(uuid) to authenticated;
grant execute on function public.registrar_remuneracao_equipe(uuid, date, text, numeric, jsonb, text) to authenticated;
grant execute on function public.remuneracoes_do_membro_equipe(uuid) to authenticated;
grant execute on function public.excluir_remuneracao_equipe(uuid) to authenticated;
grant execute on function public.definir_acesso_equipe(uuid, uuid, text) to authenticated;
grant execute on function public.auditar_exportacao_equipe(uuid, integer, jsonb) to authenticated;
