-- Imprensa, fase 1 (10/11/2026): veículos, o que cada contato cobre e listas salvas.
--
-- Até aqui o contato guardava o veículo como texto solto e a única forma de
-- separar gente era a etiqueta da importação. Não dava para responder "quem
-- cobre saúde nas rádios da Baixada?" nem guardar essa resposta para o próximo
-- envio. Cinco peças, só acréscimos:
--
--  1. VEÍCULOS. press_veiculos é o cadastro do veículo (ou do órgão, empresa ou
--     ONG, quando o contato não é de imprensa): tipo, praça, relevância. O
--     contato continua com o nome do veículo em texto, que é o que as telas e o
--     código antigo leem, e ganha veiculo_id. Quem mantém os dois de acordo é o
--     banco (gatilhos da seção 3), e não cada tela.
--
--  2. O QUE O CONTATO COBRE. Editorias, praça, tipo de contato (jornalista,
--     influenciador, parceiro, autoridade) e canal preferido. É o que permite
--     mandar só para quem cobre o assunto.
--
--  3. DE ONDE VEIO O DADO. origem_do_dado e base_legal por contato: uma das
--     condições para tratar o e-mail do jornalista por legítimo interesse é
--     saber dizer de onde ele veio (LGPD).
--
--  4. LISTAS. press_listas guarda uma seleção com nome: 'fixa' (as pessoas
--     escolhidas, em press_lista_contatos) ou 'filtro' (o critério, e entra
--     sozinho quem for cadastrado depois). A marca "plantão" separa as listas
--     de emergência. A campanha passa a guardar para qual lista saiu.
--
--  5. IMPORTAÇÃO. importar_contatos_de_imprensa lê também editoria, praça e
--     tipo de veículo da planilha. A antiga importar_contatos fica como está,
--     para o código que ainda estiver no ar; sai numa migração posterior.

-- 1. Veículos ----------------------------------------------------------------

create table if not exists public.press_veiculos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,

  -- Um espaço só entre as palavras e nenhum nas pontas (tabulação e quebra de
  -- linha também não): é assim que o gatilho da seção 3 limpa o texto do
  -- contato antes de procurar o veículo, e é pelo nome, sem diferenciar
  -- maiúscula, que ele acha.
  nome          text not null
                check (nome <> '' and nome = btrim(regexp_replace(nome, '\s+', ' ', 'g')) and char_length(nome) <= 200),
  -- '' é "ainda não classificado": o veículo criado sozinho, a partir do
  -- texto de um contato, nasce assim. 'organizacao' é o que não é imprensa.
  tipo          text not null default ''
                check (tipo in ('','tv','radio','impresso','portal','agencia','podcast','comunitario','outro','organizacao')),
  praca         text not null default '' check (char_length(praca) <= 120),
  dominio       text not null default '' check (char_length(dominio) <= 200),
  relevancia    text not null default 'media' check (relevancia in ('alta','media','baixa')),
  notas         text not null default '' check (char_length(notas) <= 4000),

  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Alvo das chaves compostas: contato e veículo sempre do mesmo espaço.
  unique (workspace_id, id)
);

comment on table public.press_veiculos is
  'Veículos de imprensa (e órgãos, empresas e ONGs dos contatos que não são imprensa). Escrita só pelo servidor; o contato cria o veículo sozinho pelo gatilho press_contacts_liga_veiculo.';
comment on column public.press_veiculos.tipo is
  'tv, radio, impresso, portal, agencia, podcast, comunitario, outro, organizacao (não é imprensa). Vazio: ainda não classificado.';

-- O mesmo veículo não entra duas vezes no espaço.
create unique index if not exists press_veiculos_nome_idx
  on public.press_veiculos (workspace_id, lower(nome));
create index if not exists press_veiculos_created_by_idx
  on public.press_veiculos (created_by);

alter table public.press_veiculos enable row level security;
-- Quem está logado só lê (o RLS filtra pelo espaço); gravar é do servidor.
revoke all on public.press_veiculos from anon, authenticated;
grant select on public.press_veiculos to authenticated;

drop policy if exists press_veiculos_select_member on public.press_veiculos;
create policy press_veiculos_select_member on public.press_veiculos
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

drop trigger if exists press_veiculos_touch on public.press_veiculos;
create trigger press_veiculos_touch
  before update on public.press_veiculos
  for each row execute function public.touch_social_publications();

-- 2. O contato: veículo, o que cobre e de onde veio ---------------------------

alter table public.press_contacts
  add column if not exists veiculo_id      uuid,
  -- Em minúsculas, como as etiquetas. Quem normaliza é a aplicação
  -- (lib/imprensa/vocabulario.ts).
  add column if not exists editorias       text[] not null default '{}',
  -- Vazia: vale a praça do veículo.
  add column if not exists praca           text not null default '',
  add column if not exists tipo_de_contato text not null default 'jornalista',
  add column if not exists canal_preferido text not null default 'email',
  -- Só quando é outro número, diferente do telefone.
  add column if not exists whatsapp        text not null default '',
  add column if not exists origem_do_dado  text not null default '',
  add column if not exists base_legal      text not null default 'legitimo_interesse';

alter table public.press_contacts drop constraint if exists press_contacts_tipo_de_contato_check;
alter table public.press_contacts add constraint press_contacts_tipo_de_contato_check
  check (tipo_de_contato in ('jornalista','influenciador','parceiro','autoridade','outro'));
alter table public.press_contacts drop constraint if exists press_contacts_canal_preferido_check;
alter table public.press_contacts add constraint press_contacts_canal_preferido_check
  check (canal_preferido in ('email','whatsapp','telefone'));
alter table public.press_contacts drop constraint if exists press_contacts_base_legal_check;
alter table public.press_contacts add constraint press_contacts_base_legal_check
  check (base_legal in ('legitimo_interesse','consentimento'));
alter table public.press_contacts drop constraint if exists press_contacts_fase1_tamanhos_check;
alter table public.press_contacts add constraint press_contacts_fase1_tamanhos_check
  check (cardinality(editorias) <= 12 and char_length(praca) <= 120
         and char_length(whatsapp) <= 60 and char_length(origem_do_dado) <= 200);

comment on column public.press_contacts.veiculo_id is
  'O veículo do cadastro (press_veiculos). Anda junto com o texto de "veiculo": ver o gatilho press_contacts_liga_veiculo.';
comment on column public.press_contacts.origem_do_dado is
  'De onde veio o contato, em palavras de gente: "expediente do veículo", "pediu para receber". Complementa "fonte", que diz só o caminho técnico.';
comment on column public.press_contacts.base_legal is
  'LGPD: legitimo_interesse (o padrão do mailing de imprensa) ou consentimento (a pessoa pediu para receber).';

-- Alvo da chave composta de press_lista_contatos.
create unique index if not exists press_contacts_espaco_e_id_idx
  on public.press_contacts (workspace_id, id);

-- Sem "on delete": apagar um veículo que ainda tem contato é recusado. O
-- caminho é juntar a outro veículo ou trocar o veículo dos contatos antes.
do $$
begin
  alter table public.press_contacts add constraint press_contacts_veiculo_fk
    foreign key (workspace_id, veiculo_id) references public.press_veiculos (workspace_id, id);
exception when duplicate_object then null;
end $$;

create index if not exists press_contacts_veiculo_idx
  on public.press_contacts (workspace_id, veiculo_id)
  where veiculo_id is not null;

-- 3. Texto e cadastro do veículo sempre de acordo -----------------------------
--
-- Todo caminho que grava contato (cadastro à mão, Hunter.io, importação, e o
-- código antigo que ainda estiver no ar) escreve o veículo em texto. O gatilho
-- acha o veículo por esse texto, sem diferenciar maiúscula, e cria o que não
-- existe. Quando quem grava escolhe o veiculo_id (juntar veículos), é o texto
-- que acompanha. "security definer" porque o membro grava o contato com a
-- própria sessão, e press_veiculos só aceita escrita do servidor; se a política
-- de press_contacts recusar a linha, o comando inteiro é desfeito, e o veículo
-- criado aqui vai junto.

create or replace function private.press_contato_liga_veiculo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_nome     text;
  v_no_banco text;
  v_id       uuid;
begin
  -- O veículo escolhido manda, e o texto acompanha o nome do cadastro.
  if new.veiculo_id is not null and (tg_op = 'INSERT' or new.veiculo_id is distinct from old.veiculo_id) then
    select v.nome into v_nome
      from public.press_veiculos v
     where v.id = new.veiculo_id and v.workspace_id = new.workspace_id;
    -- Não achou: a chave estrangeira recusa logo adiante.
    if found then new.veiculo := v_nome; end if;
    return new;
  end if;

  -- Sem veículo escolhido, o texto manda.
  v_nome := btrim(left(regexp_replace(btrim(coalesce(new.veiculo, '')), '\s+', ' ', 'g'), 200));
  if v_nome = '' then
    new.veiculo := '';
    new.veiculo_id := null;
    return new;
  end if;

  select v.id, v.nome into v_id, v_no_banco
    from public.press_veiculos v
   where v.workspace_id = new.workspace_id and lower(v.nome) = lower(v_nome);

  if v_id is null then
    insert into public.press_veiculos (workspace_id, nome, created_by)
    values (new.workspace_id, v_nome, new.created_by)
    on conflict (workspace_id, lower(nome)) do nothing
    returning id, nome into v_id, v_no_banco;

    -- Outro pedido criou o mesmo veículo no mesmo instante.
    if v_id is null then
      select v.id, v.nome into v_id, v_no_banco
        from public.press_veiculos v
       where v.workspace_id = new.workspace_id and lower(v.nome) = lower(v_nome);
    end if;
  end if;

  -- O texto fica com a grafia do cadastro ("o globo" vira "O Globo").
  new.veiculo_id := v_id;
  new.veiculo := coalesce(v_no_banco, v_nome);
  return new;
end $$;
revoke all on function private.press_contato_liga_veiculo() from public, anon, authenticated;

create or replace trigger press_contacts_liga_veiculo
  before insert or update of veiculo, veiculo_id on public.press_contacts
  for each row execute function private.press_contato_liga_veiculo();

-- Renomear o veículo no cadastro renomeia o texto em todos os contatos dele.
create or replace function private.press_veiculo_renomeia_contatos()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.press_contacts c
     set veiculo = new.nome
   where c.workspace_id = new.workspace_id
     and c.veiculo_id = new.id
     and c.veiculo is distinct from new.nome;
  return null;
end $$;
revoke all on function private.press_veiculo_renomeia_contatos() from public, anon, authenticated;

create or replace trigger press_veiculos_renomeia_contatos
  after update of nome on public.press_veiculos
  for each row when (new.nome is distinct from old.nome)
  execute function private.press_veiculo_renomeia_contatos();

-- 4. Listas ------------------------------------------------------------------

create table if not exists public.press_listas (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,

  nome          text not null check (nome <> '' and nome = btrim(nome) and char_length(nome) <= 120),
  descricao     text not null default '' check (char_length(descricao) <= 500),
  -- fixa: só quem foi posto na lista (press_lista_contatos).
  -- filtro: quem atende ao critério na hora do uso; contato novo entra sozinho.
  tipo          text not null default 'fixa' check (tipo in ('fixa','filtro')),
  -- O critério da lista 'filtro', como a tela o monta (lib/imprensa/listas.ts):
  -- editorias, pracas, tiposDeVeiculo, tiposDeContato, etiquetas, relevancias.
  criterio      jsonb not null default '{}'::jsonb
                check (jsonb_typeof(criterio) = 'object' and char_length(criterio::text) <= 4000),
  -- Lista de emergência: aparece primeiro e é a que se usa numa crise.
  plantao       boolean not null default false,

  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (workspace_id, id)
);

comment on table public.press_listas is
  'Listas salvas de contatos de imprensa: fixas (membros em press_lista_contatos) ou por filtro (critério). Escrita só pelo servidor.';

create unique index if not exists press_listas_nome_idx
  on public.press_listas (workspace_id, lower(nome));
create index if not exists press_listas_created_by_idx
  on public.press_listas (created_by);

drop trigger if exists press_listas_touch on public.press_listas;
create trigger press_listas_touch
  before update on public.press_listas
  for each row execute function public.touch_social_publications();

create table if not exists public.press_lista_contatos (
  lista_id        uuid not null,
  contato_id      uuid not null,
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  adicionado_por  uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),

  primary key (lista_id, contato_id),
  -- Lista e contato do mesmo espaço; apagar um dos dois tira a linha.
  foreign key (workspace_id, lista_id) references public.press_listas (workspace_id, id) on delete cascade,
  foreign key (workspace_id, contato_id) references public.press_contacts (workspace_id, id) on delete cascade
);

comment on table public.press_lista_contatos is
  'Quem está em cada lista fixa de press_listas. Escrita só pelo servidor.';

create index if not exists press_lista_contatos_contato_idx
  on public.press_lista_contatos (contato_id);
create index if not exists press_lista_contatos_workspace_idx
  on public.press_lista_contatos (workspace_id);
create index if not exists press_lista_contatos_adicionado_por_idx
  on public.press_lista_contatos (adicionado_por);

alter table public.press_listas enable row level security;
alter table public.press_lista_contatos enable row level security;
revoke all on public.press_listas from anon, authenticated;
revoke all on public.press_lista_contatos from anon, authenticated;
grant select on public.press_listas to authenticated;
grant select on public.press_lista_contatos to authenticated;

drop policy if exists press_listas_select_member on public.press_listas;
create policy press_listas_select_member on public.press_listas
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

drop policy if exists press_lista_contatos_select_member on public.press_lista_contatos;
create policy press_lista_contatos_select_member on public.press_lista_contatos
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

-- A campanha guarda para qual lista saiu. Apagar a lista não apaga a campanha.
alter table public.press_campanhas
  add column if not exists lista_id uuid;

do $$
begin
  alter table public.press_campanhas add constraint press_campanhas_lista_fk
    foreign key (workspace_id, lista_id) references public.press_listas (workspace_id, id)
    on delete set null (lista_id);
exception when duplicate_object then null;
end $$;

create index if not exists press_campanhas_lista_idx
  on public.press_campanhas (lista_id)
  where lista_id is not null;

-- 5. Importação ---------------------------------------------------------------
--
-- As três regras da importar_contatos continuam: nunca duplica o e-mail,
-- reimportar soma a etiqueta e só preenche o que estava vazio, e não ressuscita
-- quem saiu. O que muda:
--
--  - Lê editorias, praça e tipo de veículo de cada linha, e recebe o tipo de
--    contato, a origem do dado e a base legal da importação inteira. O tipo de
--    contato vale só para quem é novo; a origem (e a base legal, que anda com
--    ela) preenche também quem já existia sem origem.
--  - Quem já existe é atualizado num passo e quem é novo entra em outro. Com
--    "insert ... on conflict do update" o gatilho do veículo rodaria também
--    para a linha recusada, e criaria um veículo que ninguém usa.
--  - O tipo de veículo da planilha classifica o veículo que ainda não tem tipo.
--
-- Executável só pela service_role: a server action confere o espaço antes.

create or replace function public.importar_contatos_de_imprensa(
  p_workspace_id    uuid,
  p_autor           uuid,
  p_linhas          jsonb,
  p_tags            text[],
  p_tipo_de_contato text,
  p_origem          text,
  p_base_legal      text
)
returns table (inseridos integer, atualizados integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo        text := case when p_tipo_de_contato in ('jornalista','influenciador','parceiro','autoridade','outro')
                             then p_tipo_de_contato else 'jornalista' end;
  v_base        text := case when p_base_legal = 'consentimento' then 'consentimento' else 'legitimo_interesse' end;
  v_origem      text := left(btrim(coalesce(p_origem, '')), 200);
  v_tags        text[] := coalesce(p_tags, '{}');
  v_inseridos   integer;
  v_atualizados integer;
begin
  with entrada as materialized (
    select distinct on (lower(btrim(l->>'email')))
      lower(btrim(l->>'email'))                          as email,
      left(coalesce(btrim(l->>'nome'), ''), 200)         as nome,
      left(coalesce(btrim(l->>'veiculo'), ''), 200)      as veiculo,
      left(coalesce(btrim(l->>'cargo'), ''), 200)        as cargo,
      left(coalesce(btrim(l->>'telefone'), ''), 60)      as telefone,
      left(coalesce(btrim(l->>'praca'), ''), 120)        as praca,
      coalesce((
        select (array_agg(distinct x.e))[1:12]
          from (
            select left(lower(btrim(t)), 60) as e
              from jsonb_array_elements_text(
                     case when jsonb_typeof(l->'editorias') = 'array' then l->'editorias' else '[]'::jsonb end) as t
          ) x
         where x.e <> ''
      ), '{}'::text[])                                   as editorias,
      lower(split_part(btrim(l->>'email'), '@', 2))      as dominio
    from jsonb_array_elements(p_linhas) as l
    where position('@' in coalesce(l->>'email', '')) > 1
    order by lower(btrim(l->>'email'))
  ),
  atual as (
    update public.press_contacts c set
      tags           = array(select distinct t from unnest(c.tags || v_tags) as t where t <> ''),
      nome           = case when c.nome = '' then e.nome else c.nome end,
      veiculo        = case when c.veiculo = '' then e.veiculo else c.veiculo end,
      cargo          = case when c.cargo = '' then e.cargo else c.cargo end,
      telefone       = case when c.telefone = '' then e.telefone else c.telefone end,
      praca          = case when c.praca = '' then e.praca else c.praca end,
      editorias      = case when cardinality(c.editorias) = 0 then e.editorias else c.editorias end,
      origem_do_dado = case when c.origem_do_dado = '' then v_origem else c.origem_do_dado end,
      -- A base legal sai da origem: muda junto, e só quando a origem é preenchida agora.
      base_legal     = case when c.origem_do_dado = '' and v_origem <> '' then v_base else c.base_legal end
    from entrada e
    where c.workspace_id = p_workspace_id and lower(c.email) = e.email
    returning 1
  ),
  novos as (
    insert into public.press_contacts
      (workspace_id, nome, veiculo, cargo, dominio, email, telefone, tags, fonte, created_by,
       praca, editorias, tipo_de_contato, origem_do_dado, base_legal)
    select p_workspace_id, e.nome, e.veiculo, e.cargo, e.dominio, e.email, e.telefone, v_tags, 'importado', p_autor,
           e.praca, e.editorias, v_tipo, v_origem, v_base
      from entrada e
     where not exists (
       select 1 from public.press_contacts c
        where c.workspace_id = p_workspace_id and lower(c.email) = e.email)
    on conflict (workspace_id, lower(email)) where email is not null do nothing
    returning 1
  )
  select (select count(*) from novos)::integer, (select count(*) from atual)::integer
    into v_inseridos, v_atualizados;

  -- O tipo de veículo da planilha vale para o veículo que ainda não tem tipo:
  -- o que alguém classificou à mão não é sobrescrito por uma planilha.
  update public.press_veiculos v
     set tipo = t.tipo
    from (
      select distinct on (lower(s.nome)) lower(s.nome) as chave, s.tipo
        from (
          select btrim(left(regexp_replace(btrim(coalesce(l->>'veiculo', '')), '\s+', ' ', 'g'), 200)) as nome,
                 coalesce(l->>'tipo_de_veiculo', '') as tipo
            from jsonb_array_elements(p_linhas) as l
        ) s
       where s.nome <> ''
         and s.tipo in ('tv','radio','impresso','portal','agencia','podcast','comunitario','outro','organizacao')
       order by lower(s.nome), s.tipo
    ) t
   where v.workspace_id = p_workspace_id and lower(v.nome) = t.chave and v.tipo = '';

  return query select v_inseridos, v_atualizados;
end;
$$;

comment on function public.importar_contatos_de_imprensa is
  'Importa um lote de contatos com editoria, praça e tipo de veículo: não duplica e-mail, soma etiquetas em quem já existe, não mexe em descadastro nem em histórico. Só service_role.';

revoke all on function public.importar_contatos_de_imprensa(uuid, uuid, jsonb, text[], text, text, text) from public;
revoke execute on function public.importar_contatos_de_imprensa(uuid, uuid, jsonb, text[], text, text, text) from anon;
revoke execute on function public.importar_contatos_de_imprensa(uuid, uuid, jsonb, text[], text, text, text) from authenticated;
grant execute on function public.importar_contatos_de_imprensa(uuid, uuid, jsonb, text[], text, text, text) to service_role;

-- 6. O que já existe ----------------------------------------------------------
--
-- Cada contato que já tem veículo em texto ganha o veículo do cadastro: o
-- gatilho da seção 3 acha ou cria. Rodar de novo não muda nada.
--
-- updated_at é a "última alteração" que a ficha do contato mostra, e quem
-- alterou aqui foi a migração, não uma pessoa: o gatilho do carimbo fica
-- desligado só durante este comando. Tudo num bloco: ou os três passos
-- acontecem, ou nenhum, e ninguém grava na tabela com o carimbo desligado.

do $$
begin
  alter table public.press_contacts disable trigger press_contacts_touch;
  update public.press_contacts
     set veiculo = veiculo
   where veiculo_id is null and btrim(veiculo) <> '';
  alter table public.press_contacts enable trigger press_contacts_touch;
end $$;

-- A API do banco relê as tabelas e a função nova.
notify pgrst, 'reload schema';
