-- Os cursos da Escola no Marketing (pedido do Matheus, 27/09/2026): cada curso
-- com o que foi criado para ele e quantos alunos tem, pela Únicopag.
-- Só acréscimos.
--
--  - escola_cursos: o catálogo (nome, página do curso, ativo). As campanhas
--    continuam guardando o curso pelo nome (escola_campanhas.curso), e a tela
--    junta pela chave do nome; renomear um curso renomeia as campanhas dele.
--  - escola_produtos: o que a equipe decidiu sobre um produto da Únicopag que
--    não bate sozinho com um curso ("Curso", "Matrícula") — associar a um
--    curso ou ignorar. O resto é regra pura (lib/escola/cursos.ts): "Taxa de
--    inscrição — X" e "X — Inscrição" contam para o curso X; produto de
--    teste fica de fora.
--  - escola_compras_por_produto: quem comprou o quê, agregado por produto e
--    por pessoa, sem nome nem CPF (a pessoa vira um código). O Marketing vê
--    alunos e interessados sem ver o financeiro da Escola.

create table if not exists public.escola_cursos (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  nome         text not null check (char_length(btrim(nome)) between 2 and 120),
  ativo        boolean not null default true,
  -- A página do curso (a de venda ou de inscrição).
  pagina_url   text check (pagina_url ~ '^https://[^\s]+$' and char_length(pagina_url) <= 500),
  descricao    text check (char_length(descricao) <= 500),
  criado_por   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists escola_cursos_nome_idx on public.escola_cursos (workspace_id, private.chave_do_nome(nome));
create index if not exists escola_cursos_criado_por_idx on public.escola_cursos (criado_por);

create table if not exists public.escola_produtos (
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  -- O nome do produto como vem da Únicopag (escola_transacoes.produto).
  produto        text not null check (char_length(produto) between 1 and 300),
  curso_id       uuid references public.escola_cursos (id) on delete cascade,
  ignorado       boolean not null default false,
  atualizado_por uuid references public.profiles (id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  primary key (workspace_id, produto),
  check ((curso_id is not null) <> ignorado)
);
create index if not exists escola_produtos_curso_idx on public.escola_produtos (curso_id);
create index if not exists escola_produtos_atualizado_por_idx on public.escola_produtos (atualizado_por);

alter table public.escola_cursos enable row level security;
alter table public.escola_produtos enable row level security;
revoke all on public.escola_cursos, public.escola_produtos from anon, authenticated;
grant select on public.escola_cursos, public.escola_produtos to authenticated;
drop policy if exists escola_cursos_select on public.escola_cursos;
create policy escola_cursos_select on public.escola_cursos for select to authenticated
  using ((select private.nivel_marketing_escola(workspace_id)) >= 2);
drop policy if exists escola_produtos_select on public.escola_produtos;
create policy escola_produtos_select on public.escola_produtos for select to authenticated
  using ((select private.nivel_marketing_escola(workspace_id)) >= 2);

/** Cria ou edita um curso. Renomear leva junto o nome gravado nas campanhas dele. Devolve o id. */
create or replace function public.escola_curso_salvar(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_nome text := regexp_replace(btrim(coalesce(p->>'nome', '')), '\s+', ' ', 'g');
  v_url text := nullif(btrim(coalesce(p->>'pagina_url', '')), '');
  v_antigo text;
begin
  if (select private.nivel_marketing_escola(p_workspace_id)) < 2 then raise exception 'Você não tem acesso ao marketing da escola.' using errcode = 'P0001'; end if;
  if char_length(v_nome) < 2 then raise exception 'Escreva o nome do curso.' using errcode = 'P0001'; end if;
  if v_url is not null and v_url !~ '^https://[^\s]+$' then raise exception 'A página do curso precisa começar com https://.' using errcode = 'P0001'; end if;
  if v_id is null then
    insert into public.escola_cursos (workspace_id, nome, ativo, pagina_url, descricao, criado_por)
    values (p_workspace_id, v_nome, coalesce((p->>'ativo')::boolean, true), v_url, nullif(btrim(coalesce(p->>'descricao', '')), ''), (select auth.uid()))
    returning id into v_id;
  else
    select nome into v_antigo from public.escola_cursos where id = v_id and workspace_id = p_workspace_id for update;
    if not found then raise exception 'Curso não encontrado.' using errcode = 'P0001'; end if;
    update public.escola_cursos set nome = v_nome, ativo = coalesce((p->>'ativo')::boolean, ativo), pagina_url = v_url,
      descricao = nullif(btrim(coalesce(p->>'descricao', '')), ''), updated_at = now()
    where id = v_id;
    if private.chave_do_nome(v_antigo) <> private.chave_do_nome(v_nome) then
      update public.escola_campanhas set curso = v_nome, updated_at = now()
      where workspace_id = p_workspace_id and private.chave_do_nome(curso) = private.chave_do_nome(v_antigo);
    end if;
  end if;
  return v_id;
exception
  when unique_violation then raise exception 'Já existe um curso com este nome.' using errcode = 'P0001';
  when check_violation then raise exception 'Algum campo passou do tamanho permitido.' using errcode = 'P0001';
end $$;

/** O que fazer com um produto da Únicopag: associar a um curso, ignorar ou voltar à regra automática (nada). */
create or replace function public.escola_produto_classificar(p_workspace_id uuid, p_produto text, p_curso_id uuid, p_ignorar boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select private.nivel_marketing_escola(p_workspace_id)) < 2 then raise exception 'Você não tem acesso ao marketing da escola.' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_produto), '') = '' or char_length(p_produto) > 300 then raise exception 'Produto inválido.' using errcode = 'P0001'; end if;
  if p_curso_id is not null and not exists (select 1 from public.escola_cursos where id = p_curso_id and workspace_id = p_workspace_id) then
    raise exception 'Curso não encontrado.' using errcode = 'P0001';
  end if;
  if p_curso_id is null and not coalesce(p_ignorar, false) then
    delete from public.escola_produtos where workspace_id = p_workspace_id and produto = p_produto;
    return;
  end if;
  insert into public.escola_produtos (workspace_id, produto, curso_id, ignorado, atualizado_por, atualizado_em)
  values (p_workspace_id, p_produto, p_curso_id, p_curso_id is null, (select auth.uid()), now())
  on conflict (workspace_id, produto) do update set curso_id = excluded.curso_id, ignorado = excluded.ignorado,
    atualizado_por = excluded.atualizado_por, atualizado_em = now();
end $$;

/**
 * Quem comprou o quê, por produto e por pessoa, para o Marketing contar alunos
 * sem ver dados pessoais: a pessoa é um código (sha-256 do documento mascarado
 * ou do nome, com o espaço como sal), nunca o nome ou o CPF.
 */
create or replace function public.escola_compras_por_produto(p_workspace_id uuid)
returns table (produto text, pessoa text, pagou boolean, recebido bigint, pagamentos bigint, primeira_paga timestamptz, ultima timestamptz)
language sql security definer set search_path = '' stable as $$
  select coalesce(t.produto, ''),
    left(encode(extensions.digest(p_workspace_id::text || ':' || coalesce(nullif(t.documento, ''), lower(btrim(t.cliente)), t.hash), 'sha256'), 'hex'), 20),
    bool_or(t.situacao in ('pago', 'em_disputa')),
    coalesce(sum(t.valor) filter (where t.situacao in ('pago', 'em_disputa')), 0)::bigint,
    count(*) filter (where t.situacao in ('pago', 'em_disputa'))::bigint,
    min(coalesce(t.paga_em, t.criada_em)) filter (where t.situacao in ('pago', 'em_disputa')),
    max(t.criada_em)
  from public.escola_transacoes t
  where t.workspace_id = p_workspace_id and (select private.nivel_marketing_escola(p_workspace_id)) >= 2
  group by 1, 2
$$;

revoke all on function public.escola_curso_salvar(uuid, jsonb), public.escola_produto_classificar(uuid, text, uuid, boolean), public.escola_compras_por_produto(uuid) from public, anon;
grant execute on function public.escola_curso_salvar(uuid, jsonb), public.escola_produto_classificar(uuid, text, uuid, boolean), public.escola_compras_por_produto(uuid) to authenticated;

-- Os cursos que já aparecem nas vendas da Únicopag (27/09/2026). A equipe completa a página de cada um.
insert into public.escola_cursos (workspace_id, nome)
select w.id, c.nome
from public.workspaces w
cross join (values
  ('Primeiros Socorros Básico'),
  ('Primeiros Socorros Lei Lucas - Ambientes com Crianças'),
  ('Punção Venosa'),
  ('Bombeiro Civil'),
  ('Cuidador de Idosos (Curso Livre)'),
  ('Suporte Básico de Vida'),
  ('Micropigmentação Labial')
) as c (nome)
where w.kind = 'production'
on conflict (workspace_id, private.chave_do_nome(nome)) do nothing;
