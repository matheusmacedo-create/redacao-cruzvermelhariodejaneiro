-- Diretório e setores (refatoração): os setores deixam de ser uma lista fixa
-- no código e viram cadastro do espaço (nome, descrição, responsável,
-- e-mail, ordem, ativo), editado pelo admin. As grafias soltas da
-- coordenação ("Comunicação", "Comunicacao Social") passam a apontar para o
-- setor certo. O Diretório lê a equipe inteira — contas da Redação e fichas
-- da Equipe sem conta — por uma função que só devolve o que é de contato.

-- ---------------------------------------------------------------- setores

alter table public.setores
  add column if not exists descricao text check (char_length(descricao) <= 300),
  add column if not exists responsavel_id uuid references public.profiles (id) on delete set null,
  add column if not exists email text check (char_length(email) <= 200),
  add column if not exists ordem integer not null default 100 check (ordem between 0 and 10000),
  add column if not exists ativo boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists setores_nome_unico_idx on public.setores (workspace_id, lower(nome));
create index if not exists setores_responsavel_idx on public.setores (responsavel_id);

-- "Comunicação Social" = "comunicacao social": sem acento, caixa ou espaço extra.
create or replace function private.chave_do_nome(p text)
returns text language sql immutable set search_path = '' as $$
  select lower(translate(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g'),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))
$$;
revoke all on function private.chave_do_nome(text) from public, anon;
grant execute on function private.chave_do_nome(text) to authenticated;

-- Os setores oficiais da filial (os mesmos que viviam em lib/equipe.ts).
create or replace function private.semear_setores(p_workspace_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.setores (workspace_id, nome, descricao, ordem)
  select p_workspace_id, s.nome, s.descricao, s.ordem
  from (values
    ('Diretoria', 'Presidência, vice-presidência e diretoria financeira da filial.', 10),
    ('Jurídico', 'Contratos, convênios e a conformidade dos atos da filial.', 20),
    ('Comunicação Social', 'Canais oficiais, site, redes e relacionamento com a imprensa.', 30),
    ('Tecnologia da Informação', 'Sistemas, site e infraestrutura digital da filial.', 40),
    ('Humanitário', 'Ações de assistência e apoio às comunidades do estado.', 50),
    ('Educação e Saúde', 'A Escola de Educação e Saúde CVB-RJ e os cursos presenciais na sede.', 60),
    ('Primeiros Socorros', 'Formação em primeiros socorros e cobertura de eventos e ações.', 70),
    ('GRD', 'Gestão de Riscos de Desastres: preparação e resposta a emergências.', 80),
    ('Voluntariado', 'Cadastro, formação inicial e acompanhamento dos voluntários.', 90),
    ('Juventude', 'Frentes conduzidas por jovens voluntários da filial.', 100),
    ('Psicologia / Serviço Social', 'Apoio psicossocial nas ações e às equipes.', 110),
    ('Esportes', 'Atividades esportivas e de integração com a comunidade.', 120)
  ) as s (nome, descricao, ordem)
  on conflict (workspace_id, lower(nome)) do nothing;
  -- Setor que já existia (criado pelo Correio) ganha descrição e ordem.
  update public.setores t set descricao = coalesce(t.descricao, s.descricao), ordem = case when t.ordem = 100 then s.ordem else t.ordem end
  from (values
    ('Diretoria', 'Presidência, vice-presidência e diretoria financeira da filial.', 10),
    ('Comunicação Social', 'Canais oficiais, site, redes e relacionamento com a imprensa.', 30)
  ) as s (nome, descricao, ordem)
  where t.workspace_id = p_workspace_id and lower(t.nome) = lower(s.nome);
end $$;
revoke all on function private.semear_setores(uuid) from public, anon, authenticated;

-- Aponta um texto de setor para o nome do cadastro (sem acento/caixa). "Comunicação" sozinho = Comunicação Social.
create or replace function private.setor_canonico(p_workspace_id uuid, p_texto text)
returns text language sql security definer set search_path = '' stable as $$
  select coalesce(
    (select s.nome from public.setores s where s.workspace_id = p_workspace_id and private.chave_do_nome(s.nome) = private.chave_do_nome(p_texto) limit 1),
    (select s.nome from public.setores s where s.workspace_id = p_workspace_id and private.chave_do_nome(p_texto) = 'comunicacao' and private.chave_do_nome(s.nome) = 'comunicacao social' limit 1),
    nullif(trim(coalesce(p_texto, '')), '')
  )
$$;
revoke all on function private.setor_canonico(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- escrita

-- Cria ou muda um setor (só admin). Renomear leva o nome novo a quem já
-- estava nele: contas, fichas da Equipe, voluntários e pautas.
create or replace function public.setor_salvar(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_antigo public.setores;
  v_nome text;
  v_resp uuid;
begin
  v_id := nullif(p->>'id', '')::uuid;
  v_resp := nullif(p->>'responsavel_id', '')::uuid;
  v_nome := regexp_replace(trim(coalesce(p->>'nome', '')), '\s+', ' ', 'g');
  if (select private.workspace_role(p_workspace_id)) is distinct from 'admin' then raise exception 'Só um admin mexe nos setores.' using errcode = 'P0001'; end if;
  if char_length(v_nome) < 2 then raise exception 'Dê um nome ao setor.' using errcode = 'P0001'; end if;
  if v_resp is not null and not exists (select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = v_resp) then
    raise exception 'O responsável precisa ter acesso à Redação.' using errcode = 'P0001';
  end if;
  if v_id is null then
    insert into public.setores (workspace_id, nome, descricao, responsavel_id, email, ordem)
    values (p_workspace_id, v_nome, nullif(trim(p->>'descricao'), ''), v_resp, nullif(lower(trim(p->>'email')), ''), coalesce(nullif(p->>'ordem', '')::integer, 100))
    returning id into v_id;
  else
    select * into v_antigo from public.setores where id = v_id and workspace_id = p_workspace_id for update;
    if not found then raise exception 'Setor não encontrado.' using errcode = 'P0001'; end if;
    update public.setores set nome = v_nome, descricao = nullif(trim(p->>'descricao'), ''), responsavel_id = v_resp, email = nullif(lower(trim(p->>'email')), ''),
      ordem = coalesce(nullif(p->>'ordem', '')::integer, ordem), ativo = coalesce((p->>'ativo')::boolean, ativo), updated_at = now()
    where id = v_id;
    if v_antigo.nome <> v_nome then
      update public.workspace_members set coordination = v_nome where workspace_id = p_workspace_id and coordination = v_antigo.nome;
      update public.equipe_membros set setor = v_nome where workspace_id = p_workspace_id and setor = v_antigo.nome;
      update public.participantes set setores = array_replace(setores, v_antigo.nome, v_nome) where workspace_id = p_workspace_id and v_antigo.nome = any (setores);
      if to_regclass('public.pautas') is not null then
        execute 'update public.pautas set coordination = $1 where workspace_id = $2 and coordination = $3' using v_nome, p_workspace_id, v_antigo.nome;
      end if;
    end if;
  end if;
  return v_id;
exception
  when unique_violation then raise exception 'Já existe um setor com este nome.' using errcode = 'P0001';
  when check_violation then raise exception 'Algum campo está fora do permitido (nome até 80, descrição até 300 caracteres).' using errcode = 'P0001';
  when invalid_text_representation then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
end $$;
revoke all on function public.setor_salvar(uuid, jsonb) from public, anon;
grant execute on function public.setor_salvar(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------- leitura

-- O Diretório: quem tem conta (com o estado do acesso) e quem está na
-- Equipe sem conta. Só dados de contato — nada da ficha de RH além de
-- cargo, setor, e-mail e telefone de trabalho e gestor.
create or replace function public.diretorio(p_workspace_id uuid)
returns table (
  tipo text, user_id uuid, ficha_id uuid, nome text, cargo text, setor text, email text, telefone text, avatar_path text, iniciais text, cor text,
  papel text, acesso text, gestor text, visto_em timestamptz, criado_em timestamptz
)
language plpgsql security definer set search_path = '' stable as $$
declare
  v_admin boolean;
begin
  if not (select private.is_workspace_member(p_workspace_id)) then raise exception 'Você não é deste espaço.' using errcode = 'P0001'; end if;
  v_admin := (select private.workspace_role(p_workspace_id)) = 'admin';
  return query
    select 'conta'::text, p.id, e.id, coalesce(nullif(e.nome_social, ''), p.full_name), coalesce(nullif(e.cargo, ''), nullif(p.job_title, '')), coalesce(nullif(m.coordination, ''), nullif(e.setor, '')),
      coalesce(nullif(e.email_trabalho, ''), p.email), nullif(e.telefone_trabalho, ''), p.avatar_path, p.initials, p.color, m.role,
      case when not p.active then 'desativado' when u.last_sign_in_at is null then 'convite' else 'ativo' end,
      g.nome, case when v_admin then p.visto_em end, m.created_at
    from public.workspace_members m
    join public.profiles p on p.id = m.user_id
    left join auth.users u on u.id = p.id
    left join public.equipe_membros e on e.user_id = p.id and e.workspace_id = m.workspace_id
    left join public.equipe_membros g on g.id = e.gestor_id
    where m.workspace_id = p_workspace_id
    union all
    select 'ficha'::text, null::uuid, e.id, coalesce(nullif(e.nome_social, ''), e.nome), nullif(e.cargo, ''), nullif(e.setor, ''), nullif(e.email_trabalho, ''), nullif(e.telefone_trabalho, ''),
      null::text, null::text, null::text, null::text, 'sem_acesso'::text, g.nome, null::timestamptz, e.created_at
    from public.equipe_membros e
    left join public.equipe_membros g on g.id = e.gestor_id
    where e.workspace_id = p_workspace_id and e.user_id is null and e.situacao <> 'desligado';
end $$;
revoke all on function public.diretorio(uuid) from public, anon;
grant execute on function public.diretorio(uuid) to authenticated;

-- ---------------------------------------------------------------- dados

-- Grafias soltas passam a ser o nome do cadastro, e quem é de um setor passa a ver a caixa dele no Correio.
create or replace function private.normalizar_setores(w uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.workspace_members set coordination = private.setor_canonico(w, coordination)
  where workspace_id = w and coordination is distinct from private.setor_canonico(w, coordination);
  update public.equipe_membros set setor = private.setor_canonico(w, setor)
  where workspace_id = w and setor is distinct from private.setor_canonico(w, setor);
  if to_regclass('public.pautas') is not null then
    execute 'update public.pautas set coordination = private.setor_canonico($1, coordination) where workspace_id = $1 and coordination is distinct from private.setor_canonico($1, coordination)' using w;
  end if;
  insert into public.setor_membros (setor_id, user_id, workspace_id)
  select s.id, m.user_id, w from public.workspace_members m join public.setores s on s.workspace_id = w and s.nome = m.coordination
  where m.workspace_id = w
  on conflict do nothing;
end $$;
revoke all on function private.normalizar_setores(uuid) from public, anon, authenticated;

do $$
declare w uuid;
begin
  for w in select id from public.workspaces loop
    perform private.semear_setores(w);
    perform private.normalizar_setores(w);
  end loop;
end $$;
