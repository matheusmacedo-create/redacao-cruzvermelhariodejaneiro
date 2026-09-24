-- Frota (Patrimônio 4/4): veículos (ligados ao bem no Patrimônio), condutores
-- com CNH (e curso de veículo de emergência para ambulância — CTB art.
-- 145-A), diário de bordo (saída e retorno com km), abastecimentos, planos
-- de manutenção por km e por tempo, serviços e documentos com vencimento
-- (CRLV, seguro, IPVA…). Modelo inspirado no Fleetio.
--
-- Mesmo acesso do Patrimônio: ver 1, operar 2 (viagens, abastecimentos,
-- serviços, documentos), gestão 3 (veículos, condutores, planos).

-- ---------------------------------------------------------------- tabelas

create table if not exists public.frota_veiculos (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  bem_id            uuid references public.pat_bens (id) on delete set null,
  placa             text not null check (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  apelido           text check (char_length(apelido) <= 60),
  tipo              text not null default 'carro' check (tipo in ('ambulancia','carro','van','caminhonete','caminhao','moto','barco','outro')),
  marca             text check (char_length(marca) <= 60),
  modelo            text check (char_length(modelo) <= 80),
  ano_fabricacao    integer check (ano_fabricacao between 1950 and 2100),
  ano_modelo        integer check (ano_modelo between 1950 and 2101),
  cor               text check (char_length(cor) <= 30),
  renavam           text check (renavam ~ '^[0-9]{9,11}$'),
  chassi            text check (char_length(chassi) <= 17),
  combustivel       text not null default 'flex' check (combustivel in ('flex','gasolina','etanol','diesel','gnv','eletrico')),
  tanque_litros     numeric(6,1) check (tanque_litros > 0 and tanque_litros <= 2000),
  km_atual          integer not null default 0 check (km_atual >= 0),
  local_id          uuid references public.pat_locais (id) on delete set null,
  situacao          text not null default 'ativo' check (situacao in ('ativo','manutencao','inativo')),
  observacao        text check (char_length(observacao) <= 2000),
  criado_por        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (workspace_id, placa)
);
create unique index if not exists frota_veiculos_bem_idx on public.frota_veiculos (bem_id) where bem_id is not null;
create index if not exists frota_veiculos_local_idx on public.frota_veiculos (local_id);
create index if not exists frota_veiculos_criado_idx on public.frota_veiculos (criado_por);

create table if not exists public.frota_condutores (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  user_id           uuid references public.profiles (id) on delete set null,
  participante_id   uuid references public.participantes (id) on delete set null,
  nome              text not null check (char_length(nome) between 2 and 160),
  cnh_numero        text check (cnh_numero ~ '^[0-9]{9,11}$'),
  cnh_categoria     text not null check (cnh_categoria in ('A','B','AB','C','AC','D','AD','E','AE')),
  cnh_validade      date not null,
  -- Curso para condutor de veículo de emergência (obrigatório para dirigir ambulância).
  emergencia_validade date,
  telefone          text check (char_length(telefone) <= 40),
  ativo             boolean not null default true,
  criado_por        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now()
);
create unique index if not exists frota_condutores_user_idx on public.frota_condutores (workspace_id, user_id) where user_id is not null;
create unique index if not exists frota_condutores_participante_idx on public.frota_condutores (workspace_id, participante_id) where participante_id is not null;
create index if not exists frota_condutores_workspace_idx on public.frota_condutores (workspace_id, nome);
create index if not exists frota_condutores_user_fk_idx on public.frota_condutores (user_id);
create index if not exists frota_condutores_participante_fk_idx on public.frota_condutores (participante_id);
create index if not exists frota_condutores_criado_idx on public.frota_condutores (criado_por);

-- Diário de bordo: uma viagem aberta por veículo.
create table if not exists public.frota_usos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  veiculo_id    uuid not null references public.frota_veiculos (id) on delete cascade,
  condutor_id   uuid not null references public.frota_condutores (id) on delete restrict,
  finalidade    text not null check (finalidade in ('atendimento','evento','transporte_doacoes','administrativo','treinamento','manutencao','outro')),
  destino       text not null check (char_length(destino) between 2 and 200),
  saida_em      timestamptz not null default now(),
  km_saida      integer not null check (km_saida >= 0),
  retorno_em    timestamptz,
  km_retorno    integer,
  observacao    text check (char_length(observacao) <= 1000),
  projeto_id    uuid references public.projects (id) on delete set null,
  registrado_por uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  check (km_retorno is null or km_retorno >= km_saida),
  check ((retorno_em is null) = (km_retorno is null))
);
create unique index if not exists frota_usos_aberto_idx on public.frota_usos (veiculo_id) where retorno_em is null;
create index if not exists frota_usos_veiculo_idx on public.frota_usos (veiculo_id, saida_em desc);
create index if not exists frota_usos_condutor_idx on public.frota_usos (condutor_id);
create index if not exists frota_usos_workspace_idx on public.frota_usos (workspace_id, saida_em);
create index if not exists frota_usos_projeto_idx on public.frota_usos (projeto_id);
create index if not exists frota_usos_registrado_idx on public.frota_usos (registrado_por);

create table if not exists public.frota_abastecimentos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  veiculo_id    uuid not null references public.frota_veiculos (id) on delete cascade,
  data          date not null,
  km            integer not null check (km >= 0),
  litros        numeric(8,2) not null check (litros > 0),
  valor         numeric(12,2) not null check (valor >= 0),
  combustivel   text not null check (combustivel in ('gasolina','etanol','diesel','gnv','eletrico')),
  tanque_cheio  boolean not null default true,
  posto         text check (char_length(posto) <= 120),
  condutor_id   uuid references public.frota_condutores (id) on delete set null,
  lancamento_id uuid references public.fin_lancamentos (id) on delete set null,
  registrado_por uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists frota_abastecimentos_veiculo_idx on public.frota_abastecimentos (veiculo_id, km);
create index if not exists frota_abastecimentos_workspace_idx on public.frota_abastecimentos (workspace_id, data);
create index if not exists frota_abastecimentos_condutor_idx on public.frota_abastecimentos (condutor_id);
create index if not exists frota_abastecimentos_lancamento_idx on public.frota_abastecimentos (lancamento_id);
create index if not exists frota_abastecimentos_registrado_idx on public.frota_abastecimentos (registrado_por);

-- Plano de manutenção: o que repete (troca de óleo a cada 10.000 km ou 6 meses).
create table if not exists public.frota_planos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  veiculo_id    uuid not null references public.frota_veiculos (id) on delete cascade,
  nome          text not null check (char_length(nome) between 2 and 120),
  a_cada_km     integer check (a_cada_km between 100 and 500000),
  a_cada_meses  integer check (a_cada_meses between 1 and 120),
  ultima_km     integer check (ultima_km >= 0),
  ultima_data   date,
  ativo         boolean not null default true,
  check (a_cada_km is not null or a_cada_meses is not null),
  unique (veiculo_id, nome)
);
create index if not exists frota_planos_workspace_idx on public.frota_planos (workspace_id);

create table if not exists public.frota_servicos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  veiculo_id    uuid not null references public.frota_veiculos (id) on delete cascade,
  plano_id      uuid references public.frota_planos (id) on delete set null,
  tipo          text not null check (tipo in ('preventiva','corretiva','pneus','funilaria','vistoria','outro')),
  descricao     text not null check (char_length(descricao) between 2 and 600),
  data          date not null,
  km            integer check (km >= 0),
  custo         numeric(12,2) check (custo >= 0),
  fornecedor    text check (char_length(fornecedor) <= 160),
  lancamento_id uuid references public.fin_lancamentos (id) on delete set null,
  registrado_por uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists frota_servicos_veiculo_idx on public.frota_servicos (veiculo_id, data desc);
create index if not exists frota_servicos_plano_idx on public.frota_servicos (plano_id);
create index if not exists frota_servicos_workspace_idx on public.frota_servicos (workspace_id, data);
create index if not exists frota_servicos_lancamento_idx on public.frota_servicos (lancamento_id);
create index if not exists frota_servicos_registrado_idx on public.frota_servicos (registrado_por);

create table if not exists public.frota_documentos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  veiculo_id    uuid not null references public.frota_veiculos (id) on delete cascade,
  tipo          text not null check (tipo in ('crlv','licenciamento','ipva','seguro','dpvat','vistoria','tacografo','outro')),
  descricao     text check (char_length(descricao) <= 200),
  numero        text check (char_length(numero) <= 60),
  vencimento    date,
  valor         numeric(12,2) check (valor >= 0),
  observacao    text check (char_length(observacao) <= 600),
  registrado_por uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists frota_documentos_veiculo_idx on public.frota_documentos (veiculo_id, vencimento);
create index if not exists frota_documentos_workspace_idx on public.frota_documentos (workspace_id, vencimento);
create index if not exists frota_documentos_registrado_idx on public.frota_documentos (registrado_por);

-- ---------------------------------------------------------------- leitura

alter table public.frota_veiculos enable row level security;
alter table public.frota_condutores enable row level security;
alter table public.frota_usos enable row level security;
alter table public.frota_abastecimentos enable row level security;
alter table public.frota_planos enable row level security;
alter table public.frota_servicos enable row level security;
alter table public.frota_documentos enable row level security;

revoke all on public.frota_veiculos, public.frota_condutores, public.frota_usos, public.frota_abastecimentos, public.frota_planos, public.frota_servicos, public.frota_documentos from anon, authenticated;
grant select on public.frota_veiculos, public.frota_condutores, public.frota_usos, public.frota_abastecimentos, public.frota_planos, public.frota_servicos, public.frota_documentos to authenticated;

create policy frota_veiculos_select on public.frota_veiculos for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);
create policy frota_condutores_select on public.frota_condutores for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1 or user_id = (select auth.uid()));
create policy frota_usos_select on public.frota_usos for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);
create policy frota_abastecimentos_select on public.frota_abastecimentos for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);
create policy frota_planos_select on public.frota_planos for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);
create policy frota_servicos_select on public.frota_servicos for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);
create policy frota_documentos_select on public.frota_documentos for select to authenticated using ((select private.nivel_patrimonio(workspace_id)) >= 1);

-- ---------------------------------------------------------------- núcleo

-- O veículo do espaço (travado), para quem tem o nível pedido.
create or replace function private.frota_veiculo(p_workspace_id uuid, p_veiculo uuid, p_nivel integer)
returns public.frota_veiculos language plpgsql security definer set search_path = '' as $$
declare
  v public.frota_veiculos;
begin
  if (select private.nivel_patrimonio(p_workspace_id)) < p_nivel then raise exception 'Você não tem acesso para isso na Frota.' using errcode = 'P0001'; end if;
  select * into v from public.frota_veiculos where id = p_veiculo and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Veículo não encontrado.' using errcode = 'P0001'; end if;
  return v;
end $$;
revoke all on function private.frota_veiculo(uuid, uuid, integer) from public, anon, authenticated;

-- Quilometragem nova: não volta (salvo correção pela gestão, no cadastro) e não dá salto absurdo.
create or replace function private.frota_km(v public.frota_veiculos, p_km integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_km is null then return; end if;
  if p_km < 0 then raise exception 'Quilometragem inválida.' using errcode = 'P0001'; end if;
  if p_km > v.km_atual + 20000 then raise exception 'Quilometragem % km acima da atual (% km): confira o hodômetro.', p_km - v.km_atual, v.km_atual using errcode = 'P0001'; end if;
  if p_km > v.km_atual then update public.frota_veiculos set km_atual = p_km, updated_at = now() where id = v.id; end if;
end $$;
revoke all on function private.frota_km(public.frota_veiculos, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------- escrita

create or replace function public.frota_salvar_veiculo(p_workspace_id uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_bem uuid;
  v_local uuid;
  v_placa text;
begin
  v_bem := nullif(p->>'bem_id', '')::uuid;
  v_local := nullif(p->>'local_id', '')::uuid;
  v_placa := upper(regexp_replace(coalesce(p->>'placa', ''), '[^A-Za-z0-9]', '', 'g'));
  if (select private.nivel_patrimonio(p_workspace_id)) < 3 then raise exception 'Só a gestão do Patrimônio cadastra veículos.' using errcode = 'P0001'; end if;
  if v_placa !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then raise exception 'Placa inválida (ex.: ABC1D23 ou ABC1234).' using errcode = 'P0001'; end if;
  if v_bem is not null and not exists (select 1 from public.pat_bens where id = v_bem and workspace_id = p_workspace_id and situacao <> 'baixado') then raise exception 'Bem do patrimônio inválido.' using errcode = 'P0001'; end if;
  if v_local is not null and not exists (select 1 from public.pat_locais where id = v_local and workspace_id = p_workspace_id) then raise exception 'Local inválido.' using errcode = 'P0001'; end if;
  if v_id is null then
    insert into public.frota_veiculos (workspace_id, bem_id, placa, apelido, tipo, marca, modelo, ano_fabricacao, ano_modelo, cor, renavam, chassi, combustivel, tanque_litros,
      km_atual, local_id, situacao, observacao, criado_por)
    values (p_workspace_id, v_bem, v_placa, nullif(trim(p->>'apelido'), ''), coalesce(nullif(p->>'tipo', ''), 'carro'), nullif(trim(p->>'marca'), ''), nullif(trim(p->>'modelo'), ''),
      nullif(p->>'ano_fabricacao', '')::integer, nullif(p->>'ano_modelo', '')::integer, nullif(trim(p->>'cor'), ''), nullif(regexp_replace(coalesce(p->>'renavam', ''), '\D', '', 'g'), ''),
      nullif(upper(trim(p->>'chassi')), ''), coalesce(nullif(p->>'combustivel', ''), 'flex'), nullif(p->>'tanque_litros', '')::numeric, coalesce(nullif(p->>'km_atual', '')::integer, 0),
      v_local, coalesce(nullif(p->>'situacao', ''), 'ativo'), nullif(trim(p->>'observacao'), ''), (select auth.uid()))
    returning id into v_id;
  else
    update public.frota_veiculos set bem_id = v_bem, placa = v_placa, apelido = nullif(trim(p->>'apelido'), ''), tipo = coalesce(nullif(p->>'tipo', ''), tipo),
      marca = nullif(trim(p->>'marca'), ''), modelo = nullif(trim(p->>'modelo'), ''), ano_fabricacao = nullif(p->>'ano_fabricacao', '')::integer,
      ano_modelo = nullif(p->>'ano_modelo', '')::integer, cor = nullif(trim(p->>'cor'), ''), renavam = nullif(regexp_replace(coalesce(p->>'renavam', ''), '\D', '', 'g'), ''),
      chassi = nullif(upper(trim(p->>'chassi')), ''), combustivel = coalesce(nullif(p->>'combustivel', ''), combustivel), tanque_litros = nullif(p->>'tanque_litros', '')::numeric,
      km_atual = coalesce(nullif(p->>'km_atual', '')::integer, km_atual), local_id = v_local, situacao = coalesce(nullif(p->>'situacao', ''), situacao),
      observacao = nullif(trim(p->>'observacao'), ''), updated_at = now()
    where id = v_id and workspace_id = p_workspace_id;
    if not found then raise exception 'Veículo não encontrado.' using errcode = 'P0001'; end if;
  end if;
  perform private.pat_registrar(p_workspace_id, v_bem, 'frota_veiculo', jsonb_build_object('veiculo', v_id, 'placa', v_placa));
  return v_id;
exception
  when unique_violation then raise exception 'Já há um veículo com esta placa (ou este bem já é outro veículo).' using errcode = 'P0001';
  when check_violation then raise exception 'Algum campo está fora do permitido (ano, RENAVAM com 9 a 11 dígitos, tanque).' using errcode = 'P0001';
  when invalid_text_representation then raise exception 'Algum número está em formato inválido.' using errcode = 'P0001';
end $$;

create or replace function public.frota_salvar_condutor(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_user uuid;
  v_part uuid;
  v_nome text;
begin
  v_id := nullif(p->>'id', '')::uuid;
  v_user := nullif(p->>'user_id', '')::uuid;
  v_part := nullif(p->>'participante_id', '')::uuid;
  if (select private.nivel_patrimonio(p_workspace_id)) < 3 then raise exception 'Só a gestão do Patrimônio cadastra condutores.' using errcode = 'P0001'; end if;
  if v_user is not null and v_part is not null then raise exception 'Escolha equipe ou voluntário, não os dois.' using errcode = 'P0001'; end if;
  v_nome := trim(coalesce(p->>'nome', ''));
  if v_user is not null then
    select pr.full_name into v_nome from public.workspace_members m join public.profiles pr on pr.id = m.user_id where m.workspace_id = p_workspace_id and m.user_id = v_user;
    if v_nome is null then raise exception 'A pessoa precisa ser do espaço.' using errcode = 'P0001'; end if;
  elsif v_part is not null then
    select coalesce(pa.nome_social, pa.nome) into v_nome from public.participantes pa where pa.id = v_part and pa.workspace_id = p_workspace_id and pa.anonimizado_em is null;
    if v_nome is null then raise exception 'Voluntário não encontrado.' using errcode = 'P0001'; end if;
  end if;
  if char_length(v_nome) < 2 then raise exception 'Informe o nome do condutor.' using errcode = 'P0001'; end if;
  if nullif(p->>'cnh_validade', '') is null then raise exception 'Informe a validade da CNH.' using errcode = 'P0001'; end if;
  if v_id is null then
    insert into public.frota_condutores (workspace_id, user_id, participante_id, nome, cnh_numero, cnh_categoria, cnh_validade, emergencia_validade, telefone, criado_por)
    values (p_workspace_id, v_user, v_part, v_nome, nullif(regexp_replace(coalesce(p->>'cnh_numero', ''), '\D', '', 'g'), ''), upper(p->>'cnh_categoria'), (p->>'cnh_validade')::date,
      nullif(p->>'emergencia_validade', '')::date, nullif(trim(p->>'telefone'), ''), (select auth.uid()))
    returning id into v_id;
  else
    update public.frota_condutores set user_id = v_user, participante_id = v_part, nome = v_nome, cnh_numero = nullif(regexp_replace(coalesce(p->>'cnh_numero', ''), '\D', '', 'g'), ''),
      cnh_categoria = upper(p->>'cnh_categoria'), cnh_validade = (p->>'cnh_validade')::date, emergencia_validade = nullif(p->>'emergencia_validade', '')::date,
      telefone = nullif(trim(p->>'telefone'), ''), ativo = coalesce((p->>'ativo')::boolean, ativo)
    where id = v_id and workspace_id = p_workspace_id;
    if not found then raise exception 'Condutor não encontrado.' using errcode = 'P0001'; end if;
  end if;
  return v_id;
exception
  when unique_violation then raise exception 'Esta pessoa já é condutora.' using errcode = 'P0001';
  when check_violation or not_null_violation then raise exception 'Confira a CNH (número com 9 a 11 dígitos e categoria).' using errcode = 'P0001';
  when invalid_text_representation or invalid_datetime_format then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
end $$;

-- Saída do veículo (abre a viagem no diário de bordo).
create or replace function public.frota_sair(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.frota_veiculos;
  c public.frota_condutores;
  v_km integer;
  v_em timestamptz;
  v_projeto uuid;
  v_id uuid;
begin
  v_km := (p->>'km_saida')::integer;
  v_em := coalesce(nullif(p->>'saida_em', '')::timestamptz, now());
  v_projeto := nullif(p->>'projeto_id', '')::uuid;
  v := private.frota_veiculo(p_workspace_id, (p->>'veiculo_id')::uuid, 2);
  if v.situacao <> 'ativo' then raise exception 'Este veículo está %: não pode sair.', case v.situacao when 'manutencao' then 'em manutenção' else 'inativo' end using errcode = 'P0001'; end if;
  if exists (select 1 from public.frota_usos where veiculo_id = v.id and retorno_em is null) then raise exception 'O veículo já está em uso: registre o retorno antes.' using errcode = 'P0001'; end if;
  select * into c from public.frota_condutores where id = (p->>'condutor_id')::uuid and workspace_id = p_workspace_id;
  if not found or not c.ativo then raise exception 'Escolha um condutor ativo.' using errcode = 'P0001'; end if;
  if c.cnh_validade < v_em::date then raise exception 'A CNH de % venceu em %.', c.nome, to_char(c.cnh_validade, 'DD/MM/YYYY') using errcode = 'P0001'; end if;
  if v.tipo = 'ambulancia' and (c.emergencia_validade is null or c.emergencia_validade < v_em::date) then
    raise exception '% não tem o curso de condutor de veículo de emergência válido (exigido para ambulância).', c.nome using errcode = 'P0001';
  end if;
  if v.tipo in ('caminhao') and c.cnh_categoria not in ('C','AC','D','AD','E','AE') then raise exception 'Caminhão pede CNH C ou superior.' using errcode = 'P0001'; end if;
  if v.tipo in ('ambulancia','van') and c.cnh_categoria not in ('B','AB','C','AC','D','AD','E','AE') then raise exception 'Este veículo pede CNH B ou superior.' using errcode = 'P0001'; end if;
  if v.tipo = 'moto' and c.cnh_categoria not in ('A','AB','AC','AD','AE') then raise exception 'Moto pede CNH A.' using errcode = 'P0001'; end if;
  if v.tipo in ('carro','caminhonete') and c.cnh_categoria = 'A' then raise exception 'Carro pede CNH B ou superior.' using errcode = 'P0001'; end if;
  if v_km is null then raise exception 'Informe o km do hodômetro na saída.' using errcode = 'P0001'; end if;
  if v_km < v.km_atual then raise exception 'O hodômetro não pode marcar menos que o último registro (% km).', v.km_atual using errcode = 'P0001'; end if;
  if v_projeto is not null and not exists (select 1 from public.projects where id = v_projeto and workspace_id = p_workspace_id) then raise exception 'Projeto inválido.' using errcode = 'P0001'; end if;
  if char_length(trim(coalesce(p->>'destino', ''))) < 2 then raise exception 'Diga para onde vai.' using errcode = 'P0001'; end if;
  perform private.frota_km(v, v_km);
  insert into public.frota_usos (workspace_id, veiculo_id, condutor_id, finalidade, destino, saida_em, km_saida, projeto_id, registrado_por)
  values (p_workspace_id, v.id, c.id, coalesce(nullif(p->>'finalidade', ''), 'outro'), left(trim(p->>'destino'), 200), v_em, v_km, v_projeto, (select auth.uid()))
  returning id into v_id;
  return v_id;
exception
  when invalid_text_representation or invalid_datetime_format then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
  when check_violation then raise exception 'Escolha a finalidade da viagem.' using errcode = 'P0001';
end $$;

-- Retorno (fecha a viagem). Devolve o km rodado e os planos de manutenção que venceram por km.
create or replace function public.frota_retornar(p_workspace_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u public.frota_usos;
  v public.frota_veiculos;
  v_km integer;
  v_em timestamptz;
  v_vencidos jsonb;
begin
  v_km := (p->>'km_retorno')::integer;
  v_em := coalesce(nullif(p->>'retorno_em', '')::timestamptz, now());
  select * into u from public.frota_usos where id = (p->>'uso_id')::uuid and workspace_id = p_workspace_id and retorno_em is null;
  if not found then raise exception 'Viagem não encontrada (ou já encerrada).' using errcode = 'P0001'; end if;
  v := private.frota_veiculo(p_workspace_id, u.veiculo_id, 2);
  if v_km is null or v_km < u.km_saida then raise exception 'O km de retorno não pode ser menor que o de saída (% km).', u.km_saida using errcode = 'P0001'; end if;
  if v_em < u.saida_em then raise exception 'O retorno não pode ser antes da saída.' using errcode = 'P0001'; end if;
  perform private.frota_km(v, v_km);
  update public.frota_usos set retorno_em = v_em, km_retorno = v_km, observacao = nullif(left(trim(coalesce(p->>'observacao', '')), 1000), '') where id = u.id;
  select coalesce(jsonb_agg(jsonb_build_object('nome', pl.nome, 'km', pl.ultima_km + pl.a_cada_km)), '[]'::jsonb) into v_vencidos
  from public.frota_planos pl
  where pl.veiculo_id = v.id and pl.ativo and pl.a_cada_km is not null and pl.ultima_km is not null
    and pl.ultima_km + pl.a_cada_km <= v_km and pl.ultima_km + pl.a_cada_km > u.km_saida;
  return jsonb_build_object('km_rodado', v_km - u.km_saida, 'planos_vencidos', v_vencidos);
exception
  when invalid_text_representation or invalid_datetime_format then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
end $$;

create or replace function public.frota_abastecer(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.frota_veiculos;
  v_km integer;
  v_data date;
  v_cond uuid;
  v_lanc uuid;
  v_id uuid;
begin
  v_km := (p->>'km')::integer;
  v_data := coalesce(nullif(p->>'data', '')::date, current_date);
  v_cond := nullif(p->>'condutor_id', '')::uuid;
  v_lanc := nullif(p->>'lancamento_id', '')::uuid;
  v := private.frota_veiculo(p_workspace_id, (p->>'veiculo_id')::uuid, 2);
  if v_data > current_date + 1 then raise exception 'Data no futuro.' using errcode = 'P0001'; end if;
  if v_km is null then raise exception 'Informe o km do hodômetro.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.frota_abastecimentos a where a.veiculo_id = v.id and ((a.data < v_data and a.km > v_km) or (a.data > v_data and a.km < v_km))) then
    raise exception 'O km não bate com os abastecimentos de outras datas: confira o hodômetro e a data.' using errcode = 'P0001';
  end if;
  if v_cond is not null and not exists (select 1 from public.frota_condutores where id = v_cond and workspace_id = p_workspace_id) then raise exception 'Condutor inválido.' using errcode = 'P0001'; end if;
  if v_lanc is not null and not exists (select 1 from public.fin_lancamentos where id = v_lanc and workspace_id = p_workspace_id) then raise exception 'Lançamento inválido.' using errcode = 'P0001'; end if;
  if v.tanque_litros is not null and (p->>'litros')::numeric > v.tanque_litros * 1.1 then raise exception 'Mais litros que o tanque comporta (% L).', v.tanque_litros using errcode = 'P0001'; end if;
  perform private.frota_km(v, v_km);
  insert into public.frota_abastecimentos (workspace_id, veiculo_id, data, km, litros, valor, combustivel, tanque_cheio, posto, condutor_id, lancamento_id, registrado_por)
  values (p_workspace_id, v.id, v_data, v_km, (p->>'litros')::numeric, (p->>'valor')::numeric,
    coalesce(nullif(p->>'combustivel', ''), case v.combustivel when 'flex' then 'gasolina' else v.combustivel end), coalesce((p->>'tanque_cheio')::boolean, true),
    nullif(trim(p->>'posto'), ''), v_cond, v_lanc, (select auth.uid()))
  returning id into v_id;
  return v_id;
exception
  when invalid_text_representation or invalid_datetime_format then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
  when check_violation or not_null_violation then raise exception 'Confira litros (maior que zero), valor e combustível.' using errcode = 'P0001';
end $$;

create or replace function public.frota_salvar_plano(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.frota_veiculos;
  v_id uuid;
begin
  v_id := nullif(p->>'id', '')::uuid;
  v := private.frota_veiculo(p_workspace_id, (p->>'veiculo_id')::uuid, 3);
  if v_id is null then
    insert into public.frota_planos (workspace_id, veiculo_id, nome, a_cada_km, a_cada_meses, ultima_km, ultima_data)
    values (p_workspace_id, v.id, trim(p->>'nome'), nullif(p->>'a_cada_km', '')::integer, nullif(p->>'a_cada_meses', '')::integer, nullif(p->>'ultima_km', '')::integer, nullif(p->>'ultima_data', '')::date)
    returning id into v_id;
  else
    update public.frota_planos set nome = trim(p->>'nome'), a_cada_km = nullif(p->>'a_cada_km', '')::integer, a_cada_meses = nullif(p->>'a_cada_meses', '')::integer,
      ultima_km = nullif(p->>'ultima_km', '')::integer, ultima_data = nullif(p->>'ultima_data', '')::date, ativo = coalesce((p->>'ativo')::boolean, ativo)
    where id = v_id and veiculo_id = v.id;
    if not found then raise exception 'Plano não encontrado.' using errcode = 'P0001'; end if;
  end if;
  return v_id;
exception
  when unique_violation then raise exception 'Este veículo já tem um plano com este nome.' using errcode = 'P0001';
  when check_violation then raise exception 'Diga a cada quantos km (100 a 500.000) ou meses (1 a 120).' using errcode = 'P0001';
  when invalid_text_representation or invalid_datetime_format then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
end $$;

-- Serviço feito. Se for de um plano, o plano passa a contar daqui.
create or replace function public.frota_servico(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.frota_veiculos;
  v_plano uuid;
  v_km integer;
  v_data date;
  v_lanc uuid;
  v_id uuid;
begin
  v_plano := nullif(p->>'plano_id', '')::uuid;
  v_km := nullif(p->>'km', '')::integer;
  v_data := coalesce(nullif(p->>'data', '')::date, current_date);
  v_lanc := nullif(p->>'lancamento_id', '')::uuid;
  v := private.frota_veiculo(p_workspace_id, (p->>'veiculo_id')::uuid, 2);
  if v_data > current_date + 1 then raise exception 'Data no futuro.' using errcode = 'P0001'; end if;
  if v_plano is not null and not exists (select 1 from public.frota_planos where id = v_plano and veiculo_id = v.id) then raise exception 'Plano inválido.' using errcode = 'P0001'; end if;
  if v_plano is not null and v_km is null and exists (select 1 from public.frota_planos where id = v_plano and a_cada_km is not null) then raise exception 'Este plano conta por km: informe o hodômetro.' using errcode = 'P0001'; end if;
  if v_lanc is not null and not exists (select 1 from public.fin_lancamentos where id = v_lanc and workspace_id = p_workspace_id) then raise exception 'Lançamento inválido.' using errcode = 'P0001'; end if;
  perform private.frota_km(v, v_km);
  insert into public.frota_servicos (workspace_id, veiculo_id, plano_id, tipo, descricao, data, km, custo, fornecedor, lancamento_id, registrado_por)
  values (p_workspace_id, v.id, v_plano, coalesce(nullif(p->>'tipo', ''), 'preventiva'), trim(p->>'descricao'), v_data, v_km, nullif(p->>'custo', '')::numeric,
    nullif(trim(p->>'fornecedor'), ''), v_lanc, (select auth.uid()))
  returning id into v_id;
  if v_plano is not null then
    update public.frota_planos set ultima_km = coalesce(v_km, ultima_km), ultima_data = v_data
    where id = v_plano and (ultima_data is null or ultima_data <= v_data);
  end if;
  return v_id;
exception
  when invalid_text_representation or invalid_datetime_format then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
  when check_violation then raise exception 'Confira o tipo e a descrição do serviço.' using errcode = 'P0001';
end $$;

create or replace function public.frota_salvar_documento(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.frota_veiculos;
  v_id uuid;
begin
  v_id := nullif(p->>'id', '')::uuid;
  v := private.frota_veiculo(p_workspace_id, (p->>'veiculo_id')::uuid, 2);
  if v_id is null then
    insert into public.frota_documentos (workspace_id, veiculo_id, tipo, descricao, numero, vencimento, valor, observacao, registrado_por)
    values (p_workspace_id, v.id, p->>'tipo', nullif(trim(p->>'descricao'), ''), nullif(trim(p->>'numero'), ''), nullif(p->>'vencimento', '')::date,
      nullif(p->>'valor', '')::numeric, nullif(trim(p->>'observacao'), ''), (select auth.uid()))
    returning id into v_id;
  else
    update public.frota_documentos set tipo = p->>'tipo', descricao = nullif(trim(p->>'descricao'), ''), numero = nullif(trim(p->>'numero'), ''),
      vencimento = nullif(p->>'vencimento', '')::date, valor = nullif(p->>'valor', '')::numeric, observacao = nullif(trim(p->>'observacao'), '')
    where id = v_id and veiculo_id = v.id;
    if not found then raise exception 'Documento não encontrado.' using errcode = 'P0001'; end if;
  end if;
  return v_id;
exception
  when check_violation or not_null_violation then raise exception 'Escolha o tipo do documento.' using errcode = 'P0001';
  when invalid_text_representation or invalid_datetime_format then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
end $$;

create or replace function public.frota_excluir(p_workspace_id uuid, p_tabela text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select private.nivel_patrimonio(p_workspace_id)) < 3 then raise exception 'Só a gestão do Patrimônio exclui registros da Frota.' using errcode = 'P0001'; end if;
  if p_tabela = 'documento' then delete from public.frota_documentos where id = p_id and workspace_id = p_workspace_id;
  elsif p_tabela = 'plano' then delete from public.frota_planos where id = p_id and workspace_id = p_workspace_id;
  elsif p_tabela = 'abastecimento' then delete from public.frota_abastecimentos where id = p_id and workspace_id = p_workspace_id;
  elsif p_tabela = 'servico' then delete from public.frota_servicos where id = p_id and workspace_id = p_workspace_id;
  else raise exception 'Registro inválido.' using errcode = 'P0001';
  end if;
  if not found then raise exception 'Registro não encontrado.' using errcode = 'P0001'; end if;
end $$;

-- ---------------------------------------------------------------- permissões

revoke all on function public.frota_salvar_veiculo(uuid, uuid, jsonb) from public, anon;
revoke all on function public.frota_salvar_condutor(uuid, jsonb) from public, anon;
revoke all on function public.frota_sair(uuid, jsonb) from public, anon;
revoke all on function public.frota_retornar(uuid, jsonb) from public, anon;
revoke all on function public.frota_abastecer(uuid, jsonb) from public, anon;
revoke all on function public.frota_salvar_plano(uuid, jsonb) from public, anon;
revoke all on function public.frota_servico(uuid, jsonb) from public, anon;
revoke all on function public.frota_salvar_documento(uuid, jsonb) from public, anon;
revoke all on function public.frota_excluir(uuid, text, uuid) from public, anon;
grant execute on function public.frota_salvar_veiculo(uuid, uuid, jsonb) to authenticated;
grant execute on function public.frota_salvar_condutor(uuid, jsonb) to authenticated;
grant execute on function public.frota_sair(uuid, jsonb) to authenticated;
grant execute on function public.frota_retornar(uuid, jsonb) to authenticated;
grant execute on function public.frota_abastecer(uuid, jsonb) to authenticated;
grant execute on function public.frota_salvar_plano(uuid, jsonb) to authenticated;
grant execute on function public.frota_servico(uuid, jsonb) to authenticated;
grant execute on function public.frota_salvar_documento(uuid, jsonb) to authenticated;
grant execute on function public.frota_excluir(uuid, text, uuid) to authenticated;
