-- Escola como empresa (4): acesso separado. A equipe da escola entra na
-- Redação com um papel próprio ("escola") e só enxerga a Escola: vendas,
-- marketing, advertoriais, contas e — se um admin liberar — os livros da
-- Escola no Financeiro. Nada do resto da Redação (pautas, pessoas, RH,
-- patrimônio, os livros da filial) chega a ela, nem pelas telas nem pela API.
--
-- Como:
--  - private.is_workspace_member deixa de valer para o papel "escola": todo
--    o RLS e as funções da Redação passam a negar, sem mexer em cada uma.
--    Quem mora na Escola (nivel_escola, nivel_marketing_escola) reconhece o
--    papel à parte.
--  - O acesso ao Financeiro passa a ser por empresa: fin_acesso.entidade_id
--    (vazio = todas as empresas). private.nivel_fin(espaço, empresa) é o
--    nível numa empresa; private.nivel_financeiro continua sendo o de todas
--    (categorias, regras, valor da hora). A equipe da escola só pode ter
--    acesso aos livros da Escola.
--  - Contas, fontes, favorecidos, lançamentos, extrato, anexos, orçamento e
--    fechamento são lidos e mexidos pelo nível na empresa deles. Os
--    favorecidos passam a ser de cada empresa (fornecedor da escola não
--    aparece para a filial e vice-versa); categorias continuam comuns.

-- ---------------------------------------------------------------- o papel

alter table public.workspace_members drop constraint if exists workspace_members_role_check;
alter table public.workspace_members add constraint workspace_members_role_check check (role in ('admin', 'editor', 'colaborador', 'escola'));

-- Membro da Redação: ativo, com a verificação em dia — e não da equipe da escola.
create or replace function private.is_workspace_member(p_workspace_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1
    from public.workspace_members m
    join public.profiles p on p.id = m.user_id
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role <> 'escola'
      and p.active
      and private.verificacao_em_dia(m.workspace_id, m.role)
  );
$$;

-- Quem é da equipe da escola não vê o diretório da Redação (só o próprio perfil).
create or replace function private.shares_workspace(p_user_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1
    from public.workspace_members me
    join public.profiles eu on eu.id = me.user_id and eu.active
    join public.workspace_members other on other.workspace_id = me.workspace_id
    where me.user_id = (select auth.uid())
      and me.role <> 'escola'
      and other.user_id = p_user_id
      and private.verificacao_em_dia(me.workspace_id, me.role)
  );
$$;

-- ---------------------------------------------------------------- nível no Financeiro, por empresa

alter table public.fin_acesso add column if not exists entidade_id uuid references public.fin_entidades (id) on delete cascade;
create index if not exists fin_acesso_entidade_idx on public.fin_acesso (entidade_id);

create or replace function private.fin_nivel_numero(p_nivel text)
returns integer language sql immutable set search_path = '' as $$
  select case p_nivel when 'gestao' then 4 when 'aprovar' then 3 when 'lancar' then 2 when 'ver' then 1 else 0 end
$$;

-- O nível numa empresa: admin tem tudo; membro da Redação, o acesso de todas
-- as empresas ou o daquela; a equipe da escola, só o acesso aos livros da Escola.
create or replace function private.nivel_fin(p_workspace_id uuid, p_entidade_id uuid)
returns integer language sql security definer set search_path = '' stable as $$
  select case
    when (select private.workspace_role(p_workspace_id)) = 'admin' then 4
    when (select private.workspace_role(p_workspace_id)) = 'escola' then coalesce((
      select private.fin_nivel_numero(a.nivel) from public.fin_acesso a
      join public.fin_entidades e on e.id = a.entidade_id and e.workspace_id = p_workspace_id and e.tipo = 'escola'
      where a.workspace_id = p_workspace_id and a.user_id = (select auth.uid()) and a.entidade_id = p_entidade_id
    ), 0)
    when not (select private.is_workspace_member(p_workspace_id)) then 0
    else coalesce((
      select private.fin_nivel_numero(a.nivel) from public.fin_acesso a
      where a.workspace_id = p_workspace_id and a.user_id = (select auth.uid()) and (a.entidade_id is null or a.entidade_id = p_entidade_id)
    ), 0)
  end
$$;

-- O de todas as empresas (categorias, regras, valor da hora, quem acessa).
create or replace function private.nivel_financeiro(p_workspace_id uuid)
returns integer language sql security definer set search_path = '' stable as $$
  select case
    when not (select private.is_workspace_member(p_workspace_id)) then 0
    when (select private.workspace_role(p_workspace_id)) = 'admin' then 4
    else coalesce((
      select private.fin_nivel_numero(a.nivel) from public.fin_acesso a
      where a.workspace_id = p_workspace_id and a.user_id = (select auth.uid()) and a.entidade_id is null
    ), 0)
  end
$$;

-- O maior nível em alguma empresa (entrar no Financeiro, ver categorias e regras).
create or replace function private.nivel_fin_algum(p_workspace_id uuid)
returns integer language sql security definer set search_path = '' stable as $$
  select case
    when (select private.workspace_role(p_workspace_id)) = 'admin' then 4
    when (select private.workspace_role(p_workspace_id)) = 'escola' then coalesce((
      select private.fin_nivel_numero(a.nivel) from public.fin_acesso a
      join public.fin_entidades e on e.id = a.entidade_id and e.tipo = 'escola'
      where a.workspace_id = p_workspace_id and a.user_id = (select auth.uid())
    ), 0)
    when not (select private.is_workspace_member(p_workspace_id)) then 0
    else coalesce((select private.fin_nivel_numero(a.nivel) from public.fin_acesso a where a.workspace_id = p_workspace_id and a.user_id = (select auth.uid())), 0)
  end
$$;

create or replace function private.nivel_fin_principal(p_workspace_id uuid)
returns integer language sql security definer set search_path = '' stable as $$
  select private.nivel_fin(p_workspace_id, (select e.id from public.fin_entidades e where e.workspace_id = p_workspace_id and e.principal))
$$;

create or replace function private.nivel_fin_conta(p_conta_id uuid)
returns integer language sql security definer set search_path = '' stable as $$
  select coalesce((select private.nivel_fin(c.workspace_id, c.entidade_id) from public.fin_contas c where c.id = p_conta_id), 0)
$$;

create or replace function private.nivel_fin_lancamento(p_lancamento_id uuid)
returns integer language sql security definer set search_path = '' stable as $$
  select coalesce((select private.nivel_fin(l.workspace_id, l.entidade_id) from public.fin_lancamentos l where l.id = p_lancamento_id), 0)
$$;

revoke all on function private.fin_nivel_numero(text), private.nivel_fin(uuid, uuid), private.nivel_financeiro(uuid), private.nivel_fin_algum(uuid),
  private.nivel_fin_principal(uuid), private.nivel_fin_conta(uuid), private.nivel_fin_lancamento(uuid) from public, anon;
grant execute on function private.fin_nivel_numero(text), private.nivel_fin(uuid, uuid), private.nivel_financeiro(uuid), private.nivel_fin_algum(uuid),
  private.nivel_fin_principal(uuid), private.nivel_fin_conta(uuid), private.nivel_fin_lancamento(uuid) to authenticated;

-- ---------------------------------------------------------------- a Escola reconhece a equipe dela

create or replace function private.nivel_escola(p_workspace_id uuid)
returns integer language sql security definer set search_path = '' stable as $$
  select case
    when (select private.workspace_role(p_workspace_id)) = 'escola' then 2
    when not (select private.is_workspace_member(p_workspace_id)) then 0
    when (select private.workspace_role(p_workspace_id)) = 'admin' then 3
    when (select private.nivel_fin(p_workspace_id, (select e.id from public.fin_entidades e where e.workspace_id = p_workspace_id and e.tipo = 'escola'))) >= 1 then 2
    when exists (
      select 1 from public.workspace_members m
      where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid()) and private.chave_do_nome(m.coordination) = 'educacao e saude'
    ) or exists (
      select 1 from public.setor_membros sm join public.setores s on s.id = sm.setor_id
      where sm.workspace_id = p_workspace_id and sm.user_id = (select auth.uid()) and private.chave_do_nome(s.nome) = 'educacao e saude'
    ) then 2
    else 0
  end
$$;

create or replace function private.nivel_marketing_escola(p_workspace_id uuid)
returns integer language sql security definer set search_path = '' stable as $$
  select case
    when (select private.workspace_role(p_workspace_id)) = 'escola' then 2
    when not (select private.is_workspace_member(p_workspace_id)) then 0
    when (select private.workspace_role(p_workspace_id)) = 'admin' then 3
    when (select private.nivel_escola(p_workspace_id)) >= 2 then 2
    when (select private.workspace_role(p_workspace_id)) = 'editor' then 2
    when exists (
      select 1 from public.workspace_members m
      where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid()) and private.chave_do_nome(m.coordination) = 'comunicacao social'
    ) or exists (
      select 1 from public.setor_membros sm join public.setores s on s.id = sm.setor_id
      where sm.workspace_id = p_workspace_id and sm.user_id = (select auth.uid()) and private.chave_do_nome(s.nome) = 'comunicacao social'
    ) then 2
    else 0
  end
$$;

CREATE OR REPLACE FUNCTION private.fin_conferir(p_workspace_id uuid, l public.fin_lancamentos)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cfg public.fin_config;
begin
  -- Só se lança em conta de empresa em que a pessoa pode lançar.
  if not exists (select 1 from public.fin_contas where id = l.conta_id and workspace_id = p_workspace_id) or (select private.nivel_fin_conta(l.conta_id)) < 2 then
    raise exception 'Conta inválida.' using errcode = 'P0001';
  end if;
  if l.conta_destino_id is not null and (not exists (select 1 from public.fin_contas where id = l.conta_destino_id and workspace_id = p_workspace_id) or (select private.nivel_fin_conta(l.conta_destino_id)) < 2) then
    raise exception 'Conta de destino inválida.' using errcode = 'P0001';
  end if;
  if l.categoria_id is not null and not exists (select 1 from public.fin_categorias where id = l.categoria_id and workspace_id = p_workspace_id and tipo = l.tipo) then
    raise exception 'Categoria inválida para este tipo de lançamento.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.fin_fontes where id = l.fonte_id and workspace_id = p_workspace_id) then
    raise exception 'Fonte inválida.' using errcode = 'P0001';
  end if;
  if l.projeto_id is not null and not exists (select 1 from public.projects where id = l.projeto_id and workspace_id = p_workspace_id) then
    raise exception 'Projeto inválido.' using errcode = 'P0001';
  end if;
  if l.favorecido_id is not null and not exists (select 1 from public.fin_favorecidos f join public.fin_contas c on c.id = l.conta_id where f.id = l.favorecido_id and f.workspace_id = p_workspace_id and f.entidade_id = c.entidade_id) then
    raise exception 'Favorecido inválido.' using errcode = 'P0001';
  end if;
  select * into cfg from public.fin_config where workspace_id = p_workspace_id;
  if l.tipo = 'despesa' and coalesce(cfg.aprovacao_ativa, false) and l.valor >= coalesce(cfg.aprovacao_acima, 0) then return 'pendente'; end if;
  return 'nao_exige';
end $function$;

CREATE OR REPLACE FUNCTION public.escola_adv_criar(p_workspace_id uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_titulo text;
  v_destino text;
  v_campanha uuid;
  v_conteudo uuid;
  v_peca uuid;
begin
  v_titulo := regexp_replace(trim(coalesce(p->>'titulo', '')), '\s+', ' ', 'g');
  v_destino := nullif(trim(coalesce(p->>'destino_url', '')), '');
  v_campanha := nullif(p->>'campanha_id', '')::uuid;
  if (select private.nivel_marketing_escola(p_workspace_id)) < 2 then raise exception 'Você não tem acesso ao marketing da escola.' using errcode = 'P0001'; end if;
  -- O texto nasce no editor de conteúdo da Redação, que a equipe da escola não abre: quem escreve é a Comunicação.
  if not (select private.is_workspace_member(p_workspace_id)) then raise exception 'O advertorial é escrito no editor da Redação: peça à Comunicação para criar.' using errcode = 'P0001'; end if;
  if char_length(v_titulo) < 5 then raise exception 'Dê um título ao advertorial (a manchete da matéria).' using errcode = 'P0001'; end if;
  if char_length(v_titulo) > 160 then raise exception 'A manchete pode ter até 160 caracteres.' using errcode = 'P0001'; end if;
  if v_destino is null or v_destino !~ '^https://[^\s]+$' then raise exception 'Informe para onde o botão de matrícula leva (endereço com https://).' using errcode = 'P0001'; end if;
  if v_campanha is not null and not exists (select 1 from public.escola_campanhas where id = v_campanha and workspace_id = p_workspace_id) then raise exception 'Campanha inválida.' using errcode = 'P0001'; end if;
  insert into public.content_pieces (workspace_id, title, body, format, status, responsible_id, created_by)
  values (p_workspace_id, v_titulo, coalesce(nullif(p->>'corpo', ''), ''), 'Advertorial', 'draft', (select auth.uid()), (select auth.uid()))
  returning id into v_conteudo;
  insert into public.escola_pecas (workspace_id, campanha_id, tipo, canal, titulo, angulo, formato, status, destino_url, content_id, criado_por)
  values (p_workspace_id, v_campanha, 'advertorial', 'site', left(v_titulo, 160), nullif(trim(p->>'angulo'), ''), 'Advertorial (notícia)', 'rascunho', v_destino, v_conteudo, (select auth.uid()))
  returning id into v_peca;
  return jsonb_build_object('peca_id', v_peca, 'content_id', v_conteudo);
exception
  when check_violation then raise exception 'Algum campo está fora do permitido (ângulo até 60 caracteres, endereço até 800).' using errcode = 'P0001';
  when invalid_text_representation then raise exception 'Algum campo está em formato inválido.' using errcode = 'P0001';
end $function$;


-- ---------------------------------------------------------------- favorecidos de cada empresa

alter table public.fin_favorecidos add column if not exists entidade_id uuid references public.fin_entidades (id) on delete restrict;
update public.fin_favorecidos f set entidade_id = e.id from public.fin_entidades e where e.workspace_id = f.workspace_id and e.principal and f.entidade_id is null;
alter table public.fin_favorecidos alter column entidade_id set not null;
drop index if exists public.fin_favorecidos_documento_idx;
create unique index if not exists fin_favorecidos_documento_idx on public.fin_favorecidos (workspace_id, entidade_id, documento) where documento is not null;
create index if not exists fin_favorecidos_entidade_idx on public.fin_favorecidos (entidade_id, nome);

-- A empresa do lançamento é a da conta; transferência, fonte e favorecido, da mesma empresa.
create or replace function private.fin_lancamento_da_empresa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_ent uuid;
begin
  select entidade_id into v_ent from public.fin_contas where id = new.conta_id;
  new.entidade_id := v_ent;
  if new.conta_destino_id is not null and (select entidade_id from public.fin_contas where id = new.conta_destino_id) is distinct from v_ent then
    raise exception 'Transferência só entre contas da mesma empresa. Entre a filial e a escola, lance uma despesa numa e a receita na outra.' using errcode = 'P0001';
  end if;
  if (select entidade_id from public.fin_fontes where id = new.fonte_id) is distinct from v_ent then
    raise exception 'A fonte de recurso é de outra empresa: escolha uma fonte da mesma empresa da conta.' using errcode = 'P0001';
  end if;
  if new.favorecido_id is not null and (select entidade_id from public.fin_favorecidos where id = new.favorecido_id) is distinct from v_ent then
    raise exception 'O favorecido é de outra empresa: cadastre-o nos livros desta empresa.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.fin_lancamento_da_empresa() from public, anon, authenticated;
drop trigger if exists fin_lancamentos_empresa on public.fin_lancamentos;
create trigger fin_lancamentos_empresa before insert or update of conta_id, conta_destino_id, fonte_id, favorecido_id on public.fin_lancamentos
  for each row execute function private.fin_lancamento_da_empresa();

-- ---------------------------------------------------------------- leitura por empresa

drop policy if exists fin_entidades_select on public.fin_entidades;
create policy fin_entidades_select on public.fin_entidades for select to authenticated using ((select private.nivel_fin(workspace_id, id)) >= 1);
drop policy if exists fin_contas_select on public.fin_contas;
create policy fin_contas_select on public.fin_contas for select to authenticated using ((select private.nivel_fin(workspace_id, entidade_id)) >= 1);
drop policy if exists fin_fontes_select on public.fin_fontes;
create policy fin_fontes_select on public.fin_fontes for select to authenticated using ((select private.nivel_fin(workspace_id, entidade_id)) >= 1);
drop policy if exists fin_favorecidos_select on public.fin_favorecidos;
create policy fin_favorecidos_select on public.fin_favorecidos for select to authenticated using ((select private.nivel_fin(workspace_id, entidade_id)) >= 1);
drop policy if exists fin_lancamentos_select on public.fin_lancamentos;
create policy fin_lancamentos_select on public.fin_lancamentos for select to authenticated using ((select private.nivel_fin(workspace_id, entidade_id)) >= 1);
drop policy if exists fin_orcamentos_select on public.fin_orcamentos;
create policy fin_orcamentos_select on public.fin_orcamentos for select to authenticated using ((select private.nivel_fin(workspace_id, entidade_id)) >= 1);
drop policy if exists fin_fechamentos_select on public.fin_fechamentos;
create policy fin_fechamentos_select on public.fin_fechamentos for select to authenticated using ((select private.nivel_fin(workspace_id, entidade_id)) >= 1);
drop policy if exists fin_extrato_select on public.fin_extrato;
create policy fin_extrato_select on public.fin_extrato for select to authenticated using ((select private.nivel_fin_conta(conta_id)) >= 1);
drop policy if exists fin_importacoes_select on public.fin_importacoes;
create policy fin_importacoes_select on public.fin_importacoes for select to authenticated using ((select private.nivel_fin_conta(conta_id)) >= 1);
drop policy if exists fin_anexos_select on public.fin_anexos;
create policy fin_anexos_select on public.fin_anexos for select to authenticated using ((select private.nivel_fin_lancamento(lancamento_id)) >= 1);
drop policy if exists fin_categorias_select on public.fin_categorias;
create policy fin_categorias_select on public.fin_categorias for select to authenticated using ((select private.nivel_fin_algum(workspace_id)) >= 1);
drop policy if exists fin_config_select on public.fin_config;
create policy fin_config_select on public.fin_config for select to authenticated using ((select private.nivel_fin_algum(workspace_id)) >= 1);
drop policy if exists fin_auditoria_select on public.fin_auditoria;
create policy fin_auditoria_select on public.fin_auditoria for select to authenticated
  using ((select private.nivel_financeiro(workspace_id)) >= 4 or (lancamento_id is not null and (select private.nivel_fin_lancamento(lancamento_id)) >= 4));

-- ---------------------------------------------------------------- quem acessa, e de qual empresa

drop function if exists public.definir_acesso_financeiro(uuid, uuid, text);
create or replace function public.definir_acesso_financeiro(p_workspace_id uuid, p_user_id uuid, p_nivel text, p_entidade_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_papel text;
  v_escola uuid;
  v_ent uuid := p_entidade_id;
begin
  if (select private.workspace_role(p_workspace_id)) is distinct from 'admin' then
    raise exception 'Só um admin define quem acessa o Financeiro.' using errcode = 'P0001';
  end if;
  if p_nivel is not null and p_nivel not in ('ver','lancar','aprovar','gestao') then raise exception 'Nível inválido.' using errcode = 'P0001'; end if;
  select m.role into v_papel from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = p_user_id;
  if v_papel is null then raise exception 'A pessoa precisa ser do espaço.' using errcode = 'P0001'; end if;
  if v_ent is not null and not exists (select 1 from public.fin_entidades e where e.id = v_ent and e.workspace_id = p_workspace_id) then
    raise exception 'Empresa inválida.' using errcode = 'P0001';
  end if;
  -- A equipe da escola só acessa os livros da Escola.
  if v_papel = 'escola' then
    select e.id into v_escola from public.fin_entidades e where e.workspace_id = p_workspace_id and e.tipo = 'escola';
    if v_ent is null then v_ent := v_escola;
    elsif v_ent is distinct from v_escola then raise exception 'A equipe da escola só acessa os livros da Escola.' using errcode = 'P0001';
    end if;
  end if;
  if p_nivel is null then
    delete from public.fin_acesso where workspace_id = p_workspace_id and user_id = p_user_id;
  else
    insert into public.fin_acesso (workspace_id, user_id, nivel, entidade_id, concedido_por) values (p_workspace_id, p_user_id, p_nivel, v_ent, (select auth.uid()))
    on conflict (workspace_id, user_id) do update set nivel = excluded.nivel, entidade_id = excluded.entidade_id, concedido_por = excluded.concedido_por, concedido_em = now();
  end if;
  perform private.auditar_financeiro(p_workspace_id, null, 'acesso', jsonb_build_object('usuario', p_user_id, 'nivel', p_nivel, 'empresa', v_ent));
end $$;
revoke all on function public.definir_acesso_financeiro(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.definir_acesso_financeiro(uuid, uuid, text, uuid) to authenticated;

-- Quem já tinha acesso e virou equipe da escola perde o que não é da Escola.
create or replace function private.acesso_da_equipe_da_escola()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'escola' then
    delete from public.fin_acesso a where a.workspace_id = new.workspace_id and a.user_id = new.user_id
      and not exists (select 1 from public.fin_entidades e where e.id = a.entidade_id and e.tipo = 'escola');
  end if;
  return new;
end $$;
revoke all on function private.acesso_da_equipe_da_escola() from public, anon, authenticated;
drop trigger if exists workspace_members_acesso_escola on public.workspace_members;
create trigger workspace_members_acesso_escola after insert or update of role on public.workspace_members
  for each row execute function private.acesso_da_equipe_da_escola();

-- O pacote do contador é de uma empresa: baixa quem é da gestão dela.
drop function if exists public.financeiro_auditar_pacote(uuid, date, integer);
create or replace function public.financeiro_auditar_pacote(p_workspace_id uuid, p_mes date, p_arquivos integer, p_entidade_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_ent uuid := private.fin_entidade(p_workspace_id, p_entidade_id::text);
begin
  if v_ent is null or (select private.nivel_fin(p_workspace_id, v_ent)) < 4 then raise exception 'Só a gestão do Financeiro baixa o pacote do mês.' using errcode = 'P0001'; end if;
  perform private.auditar_financeiro(p_workspace_id, null, 'pacote_do_mes', jsonb_build_object('mes', p_mes, 'arquivos', p_arquivos, 'empresa', v_ent));
end $$;
revoke all on function public.financeiro_auditar_pacote(uuid, date, integer, uuid) from public, anon;
grant execute on function public.financeiro_auditar_pacote(uuid, date, integer, uuid) to authenticated;

-- ---------------------------------------------------------------- as funções, pelo nível na empresa

CREATE OR REPLACE FUNCTION public.abrir_anexo_financeiro(p_id uuid)
 RETURNS TABLE(caminho text, nome_original text, mime text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  x public.fin_anexos;
begin
  select * into x from public.fin_anexos where id = p_id;
  if not found or (select private.nivel_fin_lancamento(x.lancamento_id)) < 1 then raise exception 'Arquivo não encontrado.' using errcode = 'P0001'; end if;
  return query select x.caminho, x.nome_original, x.mime;
end $function$;

CREATE OR REPLACE FUNCTION public.excluir_anexo_financeiro(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  x public.fin_anexos;
  a public.fin_lancamentos;
begin
  select * into x from public.fin_anexos where id = p_id;
  if not found or (select private.nivel_fin_lancamento(x.lancamento_id)) < 2 then raise exception 'Arquivo não encontrado.' using errcode = 'P0001'; end if;
  select * into a from public.fin_lancamentos where id = x.lancamento_id;
  if private.fin_fechado_conta(a.conta_id, a.pago_em) then raise exception 'Mês fechado: o comprovante faz parte do fechamento e não sai mais.' using errcode = 'P0001'; end if;
  delete from public.fin_anexos where id = p_id;
  perform private.auditar_financeiro(x.workspace_id, x.lancamento_id, 'excluir_anexo', jsonb_build_object('nome', x.nome_original, 'sha256', x.sha256));
  return x.caminho;
end $function$;

CREATE OR REPLACE FUNCTION public.registrar_anexo_financeiro(p_lancamento_id uuid, p_caminho text, p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.fin_lancamentos;
  v_id uuid;
begin
  select * into a from public.fin_lancamentos where id = p_lancamento_id;
  if not found or (select private.nivel_fin(a.workspace_id, a.entidade_id)) < 2 then raise exception 'Lançamento não encontrado.' using errcode = 'P0001'; end if;
  if private.fin_fechado_conta(a.conta_id, a.pago_em) and coalesce(p->>'tipo_doc', '') <> 'comprovante' then
    raise exception 'Mês fechado: só dá para juntar comprovante.' using errcode = 'P0001';
  end if;
  -- O caminho foi gerado pelo servidor para este lançamento; confere de novo.
  if p_caminho !~ ('^' || a.workspace_id::text || '/' || a.id::text || '/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$') then
    raise exception 'Arquivo inválido.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'financeiro-anexos' and o.name = p_caminho) then
    raise exception 'O arquivo não chegou. Envie de novo.' using errcode = 'P0001';
  end if;
  insert into public.fin_anexos (workspace_id, lancamento_id, caminho, nome_original, tipo_doc, mime, tamanho, enviado_por)
  values (a.workspace_id, a.id, p_caminho, left(coalesce(nullif(trim(p->>'nome_original'), ''), 'arquivo'), 200), coalesce(p->>'tipo_doc', 'outro'),
    coalesce(p->>'mime', 'application/octet-stream'), greatest(coalesce((p->>'tamanho')::integer, 1), 1), (select auth.uid()))
  returning id into v_id;
  perform private.auditar_financeiro(a.workspace_id, a.id, 'anexar', jsonb_build_object('anexo', v_id, 'tipo_doc', p->>'tipo_doc'));
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_atualizar_lancamento(p_id uuid, p jsonb, p_escopo text DEFAULT 'este'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.fin_lancamentos;
  n public.fin_lancamentos;
  alvo public.fin_lancamentos;
  v_aprovacao text;
  v_total integer := 0;
begin
  select * into a from public.fin_lancamentos where id = p_id for update;
  if not found or (select private.nivel_fin(a.workspace_id, a.entidade_id)) < 2 then raise exception 'Lançamento não encontrado.' using errcode = 'P0001'; end if;
  if private.fin_fechado_conta(a.conta_id, a.pago_em) then raise exception 'Este lançamento foi pago num mês já fechado e não muda mais.' using errcode = 'P0001'; end if;
  n := private.fin_do_json(a.workspace_id, p || jsonb_build_object('tipo', a.tipo));
  for alvo in
    select * from public.fin_lancamentos x
    where x.id = p_id
       or (p_escopo = 'futuros' and a.grupo_id is not null and x.grupo_id = a.grupo_id and x.vencimento > a.vencimento and x.pago_em is null)
    order by x.vencimento
  loop
    alvo.descricao := n.descricao; alvo.valor := n.valor; alvo.conta_id := n.conta_id; alvo.conta_destino_id := n.conta_destino_id;
    alvo.categoria_id := n.categoria_id; alvo.fonte_id := n.fonte_id; alvo.projeto_id := n.projeto_id; alvo.favorecido_id := n.favorecido_id;
    alvo.forma := n.forma; alvo.observacao := n.observacao;
    if alvo.id = p_id then
      alvo.competencia := n.competencia; alvo.vencimento := n.vencimento; alvo.documento := n.documento;
    end if;
    v_aprovacao := private.fin_conferir(alvo.workspace_id, alvo);
    -- A aprovação só é revista quando o valor muda (ou quando uma recusada
    -- é corrigida, que volta para a fila). Corrigir a descrição de algo já
    -- aprovado ou já pago não pede aprovação de novo.
    if alvo.valor <> (select x.valor from public.fin_lancamentos x where x.id = alvo.id) or alvo.aprovacao in ('recusada', 'pendente') then
      if v_aprovacao = 'pendente' and alvo.pago_em is not null then
        raise exception 'Este valor pede aprovação, e a despesa já está paga. Desfaça o pagamento primeiro.' using errcode = 'P0001';
      end if;
      alvo.aprovacao := v_aprovacao;
      alvo.aprovado_por := null; alvo.aprovado_em := null; alvo.motivo_recusa := null;
    end if;
    update public.fin_lancamentos set descricao = alvo.descricao, valor = alvo.valor, conta_id = alvo.conta_id, conta_destino_id = alvo.conta_destino_id,
      categoria_id = alvo.categoria_id, fonte_id = alvo.fonte_id, projeto_id = alvo.projeto_id, favorecido_id = alvo.favorecido_id, forma = alvo.forma,
      observacao = alvo.observacao, competencia = alvo.competencia, vencimento = alvo.vencimento, documento = alvo.documento,
      aprovacao = alvo.aprovacao, aprovado_por = alvo.aprovado_por, aprovado_em = alvo.aprovado_em, motivo_recusa = alvo.motivo_recusa,
      atualizado_por = (select auth.uid()), updated_at = now()
    where id = alvo.id;
    v_total := v_total + 1;
  end loop;
  perform private.auditar_financeiro(a.workspace_id, p_id, 'editar', jsonb_build_object('escopo', p_escopo, 'quantidade', v_total,
    'valor_antes', a.valor, 'valor_depois', n.valor));
  return v_total;
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_decidir(p_id uuid, p_aprovar boolean, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.fin_lancamentos;
begin
  select * into a from public.fin_lancamentos where id = p_id for update;
  if not found or (select private.nivel_fin(a.workspace_id, a.entidade_id)) < 1 then raise exception 'Lançamento não encontrado.' using errcode = 'P0001'; end if;
  if (select private.nivel_fin(a.workspace_id, a.entidade_id)) < 3 then raise exception 'Você não tem acesso para aprovar despesas.' using errcode = 'P0001'; end if;
  if a.aprovacao <> 'pendente' then raise exception 'Esta despesa não está esperando aprovação.' using errcode = 'P0001'; end if;
  if a.criado_por = (select auth.uid()) then raise exception 'Quem lançou a despesa não pode aprová-la. Peça a outra pessoa com acesso de aprovação.' using errcode = 'P0001'; end if;
  if not p_aprovar and char_length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Diga o motivo da recusa.' using errcode = 'P0001'; end if;
  update public.fin_lancamentos set aprovacao = case when p_aprovar then 'aprovada' else 'recusada' end, aprovado_por = (select auth.uid()), aprovado_em = now(),
    motivo_recusa = case when p_aprovar then null else left(trim(p_motivo), 600) end, updated_at = now()
  where id = p_id;
  perform private.auditar_financeiro(a.workspace_id, p_id, case when p_aprovar then 'aprovar' else 'recusar' end,
    jsonb_build_object('valor', a.valor, 'motivo', nullif(trim(coalesce(p_motivo, '')), '')));
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_desfazer_pagamento(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.fin_lancamentos;
begin
  select * into a from public.fin_lancamentos where id = p_id for update;
  if not found or (select private.nivel_fin(a.workspace_id, a.entidade_id)) < 2 then raise exception 'Lançamento não encontrado.' using errcode = 'P0001'; end if;
  if a.pago_em is null then return; end if;
  if a.origem_ref like 'unicopag:%' then
    raise exception 'Este lançamento veio da Únicopag e acompanha a venda. Se o dinheiro voltou, o estorno entra sozinho na próxima leitura.' using errcode = 'P0001';
  end if;
  if private.fin_fechado_conta(a.conta_id, a.pago_em) then raise exception 'Foi pago num mês já fechado e não muda mais.' using errcode = 'P0001'; end if;
  update public.fin_lancamentos set pago_em = null, valor_pago = null, atualizado_por = (select auth.uid()), updated_at = now() where id = p_id;
  perform private.auditar_financeiro(a.workspace_id, p_id, 'desfazer_pagamento', jsonb_build_object('pago_em', a.pago_em, 'valor_pago', a.valor_pago));
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_excluir_lancamento(p_id uuid, p_escopo text DEFAULT 'este'::text)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.fin_lancamentos;
  v_ids uuid[];
  v_caminhos text[];
begin
  select * into a from public.fin_lancamentos where id = p_id for update;
  if not found or (select private.nivel_fin(a.workspace_id, a.entidade_id)) < 2 then raise exception 'Lançamento não encontrado.' using errcode = 'P0001'; end if;
  if a.pago_em is not null then raise exception 'Já foi pago. Desfaça o pagamento antes de excluir.' using errcode = 'P0001'; end if;
  select array_agg(x.id) into v_ids from public.fin_lancamentos x
  where x.id = p_id or (p_escopo = 'futuros' and a.grupo_id is not null and x.grupo_id = a.grupo_id and x.vencimento > a.vencimento and x.pago_em is null);
  select coalesce(array_agg(caminho), '{}') into v_caminhos from public.fin_anexos where lancamento_id = any (v_ids);
  perform private.auditar_financeiro(a.workspace_id, null, 'excluir', jsonb_build_object('id', p_id, 'descricao', a.descricao, 'valor', a.valor,
    'vencimento', a.vencimento, 'quantidade', array_length(v_ids, 1)));
  delete from public.fin_lancamentos where id = any (v_ids);
  return v_caminhos;
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_pagar(p_id uuid, p_pago_em date, p_valor_pago numeric DEFAULT NULL::numeric, p_conta_id uuid DEFAULT NULL::uuid, p_forma text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.fin_lancamentos;
begin
  select * into a from public.fin_lancamentos where id = p_id for update;
  if not found or (select private.nivel_fin(a.workspace_id, a.entidade_id)) < 2 then raise exception 'Lançamento não encontrado.' using errcode = 'P0001'; end if;
  if a.aprovacao = 'pendente' then raise exception 'Esta despesa ainda espera aprovação.' using errcode = 'P0001'; end if;
  if a.aprovacao = 'recusada' then raise exception 'Esta despesa foi recusada e não pode ser paga.' using errcode = 'P0001'; end if;
  if p_pago_em is null or p_pago_em > current_date + 1 then raise exception 'Informe a data em que foi pago (não pode ser no futuro).' using errcode = 'P0001'; end if;
  if private.fin_fechado_conta(a.conta_id, a.pago_em) or private.fin_fechado_conta(coalesce(p_conta_id, a.conta_id), p_pago_em) then
    raise exception 'A data do pagamento está num mês já fechado.' using errcode = 'P0001';
  end if;
  if p_conta_id is not null and (not exists (select 1 from public.fin_contas where id = p_conta_id and workspace_id = a.workspace_id) or (select private.nivel_fin_conta(p_conta_id)) < 2) then
    raise exception 'Conta inválida.' using errcode = 'P0001';
  end if;
  if p_conta_id is not null and p_conta_id = a.conta_destino_id then raise exception 'A conta de origem e a de destino são a mesma.' using errcode = 'P0001'; end if;
  update public.fin_lancamentos set pago_em = p_pago_em, valor_pago = coalesce(p_valor_pago, a.valor), conta_id = coalesce(p_conta_id, a.conta_id),
    forma = coalesce(nullif(p_forma, ''), a.forma), atualizado_por = (select auth.uid()), updated_at = now()
  where id = p_id;
  perform private.auditar_financeiro(a.workspace_id, p_id, 'pagar', jsonb_build_object('pago_em', p_pago_em, 'valor_pago', coalesce(p_valor_pago, a.valor)));
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_conciliar(p_extrato_id uuid, p_lancamento_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e public.fin_extrato;
  l public.fin_lancamentos;
  v_sentido_ok boolean;
begin
  select * into e from public.fin_extrato where id = p_extrato_id for update;
  if not found or (select private.nivel_fin_conta(e.conta_id)) < 2 then raise exception 'Linha do extrato não encontrada.' using errcode = 'P0001'; end if;
  if e.situacao <> 'pendente' then raise exception 'Esta linha já foi conciliada ou ignorada.' using errcode = 'P0001'; end if;
  if private.fin_fechado_conta(e.conta_id, e.data) then raise exception 'Esta linha é de um mês já fechado.' using errcode = 'P0001'; end if;
  select * into l from public.fin_lancamentos where id = p_lancamento_id and workspace_id = e.workspace_id for update;
  if not found then raise exception 'Lançamento não encontrado.' using errcode = 'P0001'; end if;
  v_sentido_ok := case
    when l.tipo = 'despesa' then e.valor < 0 and l.conta_id = e.conta_id
    when l.tipo = 'receita' then e.valor > 0 and l.conta_id = e.conta_id
    else (e.valor < 0 and l.conta_id = e.conta_id) or (e.valor > 0 and l.conta_destino_id = e.conta_id)
  end;
  if not v_sentido_ok then raise exception 'A linha e o lançamento não combinam: confira a conta e se é entrada ou saída.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.fin_extrato x where x.lancamento_id = l.id and x.conta_id = e.conta_id) then
    raise exception 'Este lançamento já está conciliado com outra linha desta conta.' using errcode = 'P0001';
  end if;
  if l.aprovacao = 'pendente' then raise exception 'Este lançamento ainda espera aprovação.' using errcode = 'P0001'; end if;
  if l.aprovacao = 'recusada' then raise exception 'Este lançamento foi recusado.' using errcode = 'P0001'; end if;
  if private.fin_fechado_conta(l.conta_id, l.pago_em) then raise exception 'O lançamento foi pago num mês já fechado.' using errcode = 'P0001'; end if;

  -- O banco manda na data e no valor. Na transferência, só o lado que sai
  -- define o pagamento; o lado que entra só se liga (se já estiver paga).
  if l.tipo <> 'transferencia' or e.valor < 0 or l.pago_em is null then
    update public.fin_lancamentos set pago_em = e.data, valor_pago = abs(e.valor), atualizado_por = (select auth.uid()), updated_at = now() where id = l.id;
  end if;
  update public.fin_extrato set situacao = 'conciliado', lancamento_id = l.id, conciliado_por = (select auth.uid()), conciliado_em = now() where id = e.id;
  perform private.auditar_financeiro(e.workspace_id, l.id, 'conciliar', jsonb_build_object('extrato', e.id, 'data', e.data, 'valor', e.valor,
    'antes', jsonb_build_object('pago_em', l.pago_em, 'valor_pago', l.valor_pago)));
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_criar_do_extrato(p_extrato_id uuid, p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e public.fin_extrato;
  l public.fin_lancamentos;
  v_id uuid;
begin
  select * into e from public.fin_extrato where id = p_extrato_id for update;
  if not found or (select private.nivel_fin_conta(e.conta_id)) < 2 then raise exception 'Linha do extrato não encontrada.' using errcode = 'P0001'; end if;
  if e.situacao <> 'pendente' then raise exception 'Esta linha já foi conciliada ou ignorada.' using errcode = 'P0001'; end if;
  if private.fin_fechado_conta(e.conta_id, e.data) then raise exception 'Esta linha é de um mês já fechado.' using errcode = 'P0001'; end if;
  l := private.fin_do_json(e.workspace_id, p || jsonb_build_object(
    'tipo', case when e.valor < 0 then 'despesa' else 'receita' end, 'valor', abs(e.valor), 'conta_id', e.conta_id,
    'competencia', date_trunc('month', e.data)::date, 'vencimento', e.data, 'pago_em', e.data, 'valor_pago', abs(e.valor),
    'descricao', coalesce(nullif(trim(p->>'descricao'), ''), e.descricao), 'documento', coalesce(nullif(p->>'documento', ''), e.documento)));
  perform private.fin_conferir(e.workspace_id, l);
  insert into public.fin_lancamentos (workspace_id, tipo, descricao, valor, conta_id, categoria_id, fonte_id, projeto_id, favorecido_id,
    competencia, vencimento, pago_em, valor_pago, forma, documento, observacao, aprovacao, criado_por, atualizado_por)
  values (e.workspace_id, l.tipo, l.descricao, l.valor, l.conta_id, l.categoria_id, l.fonte_id, l.projeto_id, l.favorecido_id,
    l.competencia, l.vencimento, l.pago_em, l.valor_pago, l.forma, l.documento, l.observacao, 'nao_exige', (select auth.uid()), (select auth.uid()))
  returning id into v_id;
  update public.fin_extrato set situacao = 'conciliado', lancamento_id = v_id, conciliado_por = (select auth.uid()), conciliado_em = now() where id = e.id;
  perform private.auditar_financeiro(e.workspace_id, v_id, 'criar_do_extrato', jsonb_build_object('extrato', e.id, 'data', e.data, 'valor', e.valor));
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_desconciliar(p_extrato_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e public.fin_extrato;
begin
  select * into e from public.fin_extrato where id = p_extrato_id for update;
  if not found or (select private.nivel_fin_conta(e.conta_id)) < 2 then raise exception 'Linha do extrato não encontrada.' using errcode = 'P0001'; end if;
  if private.fin_fechado_conta(e.conta_id, e.data) then raise exception 'Esta linha é de um mês já fechado.' using errcode = 'P0001'; end if;
  update public.fin_extrato set situacao = 'pendente', lancamento_id = null, motivo = null, conciliado_por = null, conciliado_em = null where id = e.id;
  perform private.auditar_financeiro(e.workspace_id, e.lancamento_id, 'desconciliar', jsonb_build_object('extrato', e.id, 'situacao_antes', e.situacao));
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_ignorar_extrato(p_extrato_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e public.fin_extrato;
begin
  select * into e from public.fin_extrato where id = p_extrato_id for update;
  if not found or (select private.nivel_fin_conta(e.conta_id)) < 2 then raise exception 'Linha do extrato não encontrada.' using errcode = 'P0001'; end if;
  if e.situacao <> 'pendente' then raise exception 'Esta linha já foi conciliada ou ignorada.' using errcode = 'P0001'; end if;
  if private.fin_fechado_conta(e.conta_id, e.data) then raise exception 'Esta linha é de um mês já fechado.' using errcode = 'P0001'; end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Diga por que a linha fica de fora.' using errcode = 'P0001'; end if;
  update public.fin_extrato set situacao = 'ignorado', motivo = left(trim(p_motivo), 300), conciliado_por = (select auth.uid()), conciliado_em = now() where id = e.id;
  perform private.auditar_financeiro(e.workspace_id, null, 'ignorar_extrato', jsonb_build_object('extrato', e.id, 'valor', e.valor, 'motivo', trim(p_motivo)));
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_excluir_importacao(p_importacao_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  i public.fin_importacoes;
begin
  select * into i from public.fin_importacoes where id = p_importacao_id for update;
  if not found or (select private.nivel_fin_conta(i.conta_id)) < 2 then raise exception 'Importação não encontrada.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.fin_extrato where importacao_id = i.id and situacao <> 'pendente') then
    raise exception 'Algumas linhas desta importação já foram conciliadas ou ignoradas. Desfaça essas primeiro.' using errcode = 'P0001';
  end if;
  delete from public.fin_importacoes where id = i.id;
  perform private.auditar_financeiro(i.workspace_id, null, 'excluir_importacao', jsonb_build_object('arquivo', i.arquivo, 'linhas', i.novas));
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_importar_extrato(p_workspace_id uuid, p_conta_id uuid, p_meta jsonb, p_linhas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_imp uuid;
  v_novas integer;
begin
  if (select private.nivel_fin_conta(p_conta_id)) < 2 then raise exception 'Você não tem acesso para importar extrato.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.fin_contas where id = p_conta_id and workspace_id = p_workspace_id) then raise exception 'Conta inválida.' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) not between 1 and 5000 then
    raise exception 'O arquivo não tem movimentos (ou tem mais de 5.000).' using errcode = 'P0001';
  end if;
  insert into public.fin_importacoes (workspace_id, conta_id, arquivo, formato, inicio, fim, linhas, saldo_banco, saldo_em, importado_por)
  values (p_workspace_id, p_conta_id, left(coalesce(nullif(trim(p_meta->>'arquivo'), ''), 'extrato'), 200), p_meta->>'formato',
    (select min((x->>'data')::date) from jsonb_array_elements(p_linhas) x), (select max((x->>'data')::date) from jsonb_array_elements(p_linhas) x),
    jsonb_array_length(p_linhas), nullif(p_meta->>'saldo_banco', '')::numeric, nullif(p_meta->>'saldo_em', '')::date, (select auth.uid()))
  returning id into v_imp;
  with novas as (
    insert into public.fin_extrato (workspace_id, conta_id, importacao_id, identificador, data, valor, descricao, documento)
    select p_workspace_id, p_conta_id, v_imp, left(x->>'identificador', 300), (x->>'data')::date, (x->>'valor')::numeric,
      left(coalesce(nullif(trim(x->>'descricao'), ''), '(sem descrição)'), 300), nullif(left(trim(coalesce(x->>'documento', '')), 80), '')
    from jsonb_array_elements(p_linhas) x
    where (x->>'valor')::numeric <> 0
    on conflict (conta_id, identificador) do nothing
    returning 1
  )
  select count(*) into v_novas from novas;
  update public.fin_importacoes set novas = v_novas where id = v_imp;
  perform private.auditar_financeiro(p_workspace_id, null, 'importar_extrato', jsonb_build_object('importacao', v_imp, 'conta', p_conta_id,
    'linhas', jsonb_array_length(p_linhas), 'novas', v_novas));
  return jsonb_build_object('importacao', v_imp, 'linhas', jsonb_array_length(p_linhas), 'novas', v_novas);
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_bens_para_depreciacao(p_workspace_id uuid)
 RETURNS TABLE(id uuid, plaqueta text, nome text, categoria text, conta_contabil text, origem text, aquisicao_em date, valor numeric, vida_util_meses integer, residual_pct numeric, baixado_em date, fonte_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select private.nivel_fin_principal(p_workspace_id)) < 1 then raise exception 'Você não tem acesso ao Financeiro.' using errcode = 'P0001'; end if;
  return query
    select b.id, b.plaqueta, b.nome, c.nome, c.conta_contabil, b.origem, b.aquisicao_em, b.valor, c.vida_util_meses, c.residual_pct, b.baixado_em, b.fonte_id
    from public.pat_bens b join public.pat_categorias c on c.id = b.categoria_id
    where b.workspace_id = p_workspace_id and b.valor is not null and b.aquisicao_em is not null and b.origem <> 'comodato'
    order by b.numero;
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_doacoes_do_periodo(p_workspace_id uuid, p_inicio date, p_fim date)
 RETURNS TABLE(codigo text, data date, doador text, documento text, campanha text, tipo text, descricao text, quantidade numeric, unidade text, valor_unitario numeric, valor_total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select private.nivel_fin_principal(p_workspace_id)) < 1 then raise exception 'Você não tem acesso ao Financeiro.' using errcode = 'P0001'; end if;
  return query
    select r.codigo, r.data, r.doador_nome, r.doador_documento, c.nome, it.tipo, it.descricao, it.quantidade, it.unidade, it.valor_unitario, it.valor_total
    from public.doa_recebimentos r
    join public.doa_recebimento_itens it on it.recebimento_id = r.id
    left join public.doa_campanhas c on c.id = r.campanha_id
    where r.workspace_id = p_workspace_id and r.data between p_inicio and p_fim
    order by r.data, r.numero, it.descricao;
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_estoque_do_mes(p_workspace_id uuid, p_inicio date, p_fim date)
 RETURNS TABLE(item_id uuid, codigo text, nome text, categoria text, conta_contabil text, unidade text, qtd_inicio numeric, valor_inicio numeric, compras numeric, doacoes numeric, outras_entradas numeric, consumo numeric, perdas numeric, ajustes numeric, kits numeric, qtd_fim numeric, valor_fim numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select private.nivel_fin_principal(p_workspace_id)) < 1 then raise exception 'Você não tem acesso ao Financeiro.' using errcode = 'P0001'; end if;
  return query
    select i.id, i.codigo, i.nome, c.nome, c.conta_contabil, i.unidade,
      coalesce(sum(m.quantidade) filter (where m.data < p_inicio), 0),
      coalesce(sum(m.valor) filter (where m.data < p_inicio), 0),
      coalesce(sum(m.valor) filter (where m.data between p_inicio and p_fim and m.tipo = 'entrada' and m.origem = 'compra'), 0),
      coalesce(sum(m.valor) filter (where m.data between p_inicio and p_fim and m.tipo = 'entrada' and m.origem = 'doacao'), 0),
      coalesce(sum(m.valor) filter (where m.data between p_inicio and p_fim and m.tipo = 'entrada' and m.origem = 'outro'), 0),
      coalesce(-sum(m.valor) filter (where m.data between p_inicio and p_fim and m.tipo = 'saida'), 0),
      coalesce(-sum(m.valor) filter (where m.data between p_inicio and p_fim and m.tipo = 'perda'), 0),
      coalesce(sum(m.valor) filter (where m.data between p_inicio and p_fim and m.tipo = 'ajuste'), 0),
      coalesce(sum(m.valor) filter (where m.data between p_inicio and p_fim and m.tipo = 'montagem'), 0),
      coalesce(sum(m.quantidade) filter (where m.data <= p_fim), 0),
      coalesce(sum(m.valor) filter (where m.data <= p_fim), 0)
    from public.est_itens i
    join public.est_categorias c on c.id = i.categoria_id
    join public.est_movimentos m on m.item_id = i.id and m.data <= p_fim
    where i.workspace_id = p_workspace_id
    group by i.id, i.codigo, i.nome, c.nome, c.conta_contabil, i.unidade, i.numero
    order by i.numero;
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_horas_voluntarias(p_workspace_id uuid, p_de date, p_ate date)
 RETURNS TABLE(horas numeric, pessoas integer, registros integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select private.nivel_fin_principal(p_workspace_id)) < 1 then raise exception 'Você não tem acesso ao Financeiro.' using errcode = 'P0001'; end if;
  return query
    select coalesce(sum(h.horas), 0)::numeric, count(distinct h.participante_id)::integer, count(*)::integer
    from public.participante_horas h
    where h.workspace_id = p_workspace_id and h.data between p_de and p_ate;
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_preparar(p_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select private.nivel_fin_algum(p_workspace_id)) < 1 then raise exception 'Você não tem acesso ao Financeiro.' using errcode = 'P0001'; end if;
  perform private.semear_financeiro(p_workspace_id);
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_salvar_entidade(p_workspace_id uuid, p_id uuid, p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_nome text;
  v_cnpj text;
begin
  v_nome := regexp_replace(trim(coalesce(p->>'nome', '')), '\s+', ' ', 'g');
  v_cnpj := nullif(regexp_replace(coalesce(p->>'cnpj', ''), '\D', '', 'g'), '');
  if (select private.nivel_fin(p_workspace_id, p_id)) < 4 then raise exception 'Só a gestão do Financeiro muda os dados da empresa.' using errcode = 'P0001'; end if;
  if char_length(v_nome) < 2 then raise exception 'Dê um nome à empresa.' using errcode = 'P0001'; end if;
  if v_cnpj is not null and v_cnpj !~ '^\d{14}$' then raise exception 'O CNPJ tem 14 dígitos.' using errcode = 'P0001'; end if;
  update public.fin_entidades set nome = v_nome, razao_social = nullif(trim(p->>'razao_social'), ''), cnpj = v_cnpj
  where id = p_id and workspace_id = p_workspace_id;
  if not found then raise exception 'Empresa não encontrada.' using errcode = 'P0001'; end if;
  perform private.auditar_financeiro(p_workspace_id, null, 'empresa', jsonb_build_object('id', p_id, 'nome', v_nome));
exception
  when unique_violation then raise exception 'Já existe uma empresa com este nome ou CNPJ.' using errcode = 'P0001';
  when check_violation then raise exception 'Algum campo está fora do permitido (razão social até 200 caracteres).' using errcode = 'P0001';
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_criar_lancamentos(p_workspace_id uuid, p_itens jsonb)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ids uuid[] := '{}';
  v_grupo uuid := case when jsonb_array_length(p_itens) > 1 then gen_random_uuid() end;
  v_item jsonb;
  l public.fin_lancamentos;
  v_aprovacao text;
begin
  if (select private.nivel_fin_algum(p_workspace_id)) < 2 then raise exception 'Você não tem acesso para lançar.' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) not between 1 and 120 then raise exception 'Lançamento inválido.' using errcode = 'P0001'; end if;
  for v_item in select * from jsonb_array_elements(p_itens) loop
    l := private.fin_do_json(p_workspace_id, v_item);
    v_aprovacao := private.fin_conferir(p_workspace_id, l);
    if l.pago_em is not null and v_aprovacao = 'pendente' then
      raise exception 'Esta despesa precisa de aprovação antes de ser marcada como paga.' using errcode = 'P0001';
    end if;
    if private.fin_fechado_conta(l.conta_id, l.pago_em) then raise exception 'A data do pagamento está num mês já fechado.' using errcode = 'P0001'; end if;
    insert into public.fin_lancamentos (workspace_id, tipo, descricao, valor, conta_id, conta_destino_id, categoria_id, fonte_id, projeto_id, favorecido_id,
      competencia, vencimento, pago_em, valor_pago, forma, documento, observacao, grupo_id, parcela, parcelas, recorrente, aprovacao, criado_por, atualizado_por)
    values (p_workspace_id, l.tipo, l.descricao, l.valor, l.conta_id, l.conta_destino_id, l.categoria_id, l.fonte_id, l.projeto_id, l.favorecido_id,
      l.competencia, l.vencimento, l.pago_em, l.valor_pago, l.forma, l.documento, l.observacao, v_grupo, l.parcela, l.parcelas, l.recorrente, v_aprovacao,
      (select auth.uid()), (select auth.uid()))
    returning id into l.id;
    v_ids := v_ids || l.id;
  end loop;
  perform private.auditar_financeiro(p_workspace_id, v_ids[1], 'criar', jsonb_build_object('quantidade', array_length(v_ids, 1), 'grupo', v_grupo));
  return v_ids;
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_fechar_mes(p_workspace_id uuid, p_mes date, p_resumo jsonb, p_avisos jsonb, p_observacao text, p_entidade_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fim date := (p_mes + interval '1 month' - interval '1 day')::date;
  v_ent public.fin_entidades;
  v_pendentes integer;
begin
  if (select private.nivel_fin_algum(p_workspace_id)) < 4 then raise exception 'Só a gestão do Financeiro fecha o mês.' using errcode = 'P0001'; end if;
  if p_mes is null or extract(day from p_mes) <> 1 then raise exception 'Mês inválido.' using errcode = 'P0001'; end if;
  if v_fim >= current_date then raise exception 'O mês ainda não acabou.' using errcode = 'P0001'; end if;
  select * into v_ent from public.fin_entidades where id = private.fin_entidade(p_workspace_id, p_entidade_id::text) for update;
  if v_ent.id is null then raise exception 'Empresa não encontrada.' using errcode = 'P0001'; end if;
  if (select private.nivel_fin(p_workspace_id, v_ent.id)) < 4 then raise exception 'Só a gestão do Financeiro desta empresa fecha o mês.' using errcode = 'P0001'; end if;
  if v_ent.fechado_ate is not null and p_mes <> v_ent.fechado_ate + 1 then
    raise exception 'Os meses fecham em ordem: o próximo é %.', to_char(v_ent.fechado_ate + 1, 'MM/YYYY') using errcode = 'P0001';
  end if;
  select count(*) into v_pendentes from public.fin_extrato x join public.fin_contas c on c.id = x.conta_id
  where x.workspace_id = p_workspace_id and c.entidade_id = v_ent.id and x.situacao = 'pendente' and x.data between p_mes and v_fim;
  if v_pendentes > 0 then raise exception 'Ainda há % % do extrato para conciliar neste mês.', v_pendentes, case when v_pendentes = 1 then 'linha' else 'linhas' end using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(p_avisos, '[]'::jsonb)) <> 'array' then raise exception 'Avisos inválidos.' using errcode = 'P0001'; end if;
  if jsonb_array_length(coalesce(p_avisos, '[]'::jsonb)) > 0 and char_length(trim(coalesce(p_observacao, ''))) < 5 then
    raise exception 'Há avisos no mês: escreva uma observação explicando por que fecha assim.' using errcode = 'P0001';
  end if;
  update public.fin_entidades set fechado_ate = v_fim where id = v_ent.id;
  -- A principal continua espelhada em fin_config (compatibilidade).
  if v_ent.principal then
    insert into public.fin_config (workspace_id, fechado_ate, atualizado_por, updated_at) values (p_workspace_id, v_fim, (select auth.uid()), now())
    on conflict (workspace_id) do update set fechado_ate = excluded.fechado_ate, atualizado_por = excluded.atualizado_por, updated_at = now();
  end if;
  insert into public.fin_fechamentos (workspace_id, entidade_id, mes, resumo, avisos, observacao, fechado_por)
  values (p_workspace_id, v_ent.id, p_mes, coalesce(p_resumo, '{}'::jsonb), coalesce(p_avisos, '[]'::jsonb), nullif(left(trim(coalesce(p_observacao, '')), 2000), ''), (select auth.uid()));
  perform private.auditar_financeiro(p_workspace_id, null, 'fechar_mes', jsonb_build_object('mes', p_mes, 'empresa', v_ent.nome, 'avisos', jsonb_array_length(coalesce(p_avisos, '[]'::jsonb))));
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_reabrir_mes(p_workspace_id uuid, p_motivo text, p_entidade_id uuid DEFAULT NULL::uuid)
 RETURNS date
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ent public.fin_entidades;
  v_mes date;
  v_anterior date;
  v_novo date;
begin
  if (select private.nivel_fin_algum(p_workspace_id)) < 4 then raise exception 'Só a gestão do Financeiro reabre o mês.' using errcode = 'P0001'; end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'Diga por que o mês precisa ser reaberto.' using errcode = 'P0001'; end if;
  select * into v_ent from public.fin_entidades where id = private.fin_entidade(p_workspace_id, p_entidade_id::text) for update;
  if v_ent.id is not null and (select private.nivel_fin(p_workspace_id, v_ent.id)) < 4 then raise exception 'Só a gestão do Financeiro desta empresa reabre o mês.' using errcode = 'P0001'; end if;
  if v_ent.id is null or v_ent.fechado_ate is null then raise exception 'Não há mês fechado.' using errcode = 'P0001'; end if;
  v_mes := date_trunc('month', v_ent.fechado_ate)::date;
  v_anterior := v_mes - 1;
  update public.fin_fechamentos set situacao = 'reaberto', reaberto_por = (select auth.uid()), reaberto_em = now(), motivo_reabertura = left(trim(p_motivo), 1000)
  where entidade_id = v_ent.id and mes = v_mes and situacao = 'fechado';
  v_novo := case when exists (select 1 from public.fin_fechamentos f where f.entidade_id = v_ent.id and f.mes = date_trunc('month', v_anterior)::date and f.situacao = 'fechado') then v_anterior end;
  update public.fin_entidades set fechado_ate = v_novo where id = v_ent.id;
  if v_ent.principal then
    update public.fin_config set fechado_ate = v_novo, atualizado_por = (select auth.uid()), updated_at = now() where workspace_id = p_workspace_id;
  end if;
  perform private.auditar_financeiro(p_workspace_id, null, 'reabrir_mes', jsonb_build_object('mes', v_mes, 'empresa', v_ent.nome, 'motivo', trim(p_motivo)));
  return v_mes;
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_salvar_orcamento(p_workspace_id uuid, p_ano integer, p_itens jsonb, p_entidade_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item jsonb;
  v_cat uuid;
  v_valor numeric;
  v_total integer := 0;
  v_ent uuid;
begin
  if (select private.nivel_fin_algum(p_workspace_id)) < 4 then raise exception 'Só a gestão do Financeiro define o orçamento.' using errcode = 'P0001'; end if;
  if p_ano not between 2020 and 2100 then raise exception 'Ano inválido.' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 500 then raise exception 'Orçamento inválido.' using errcode = 'P0001'; end if;
  v_ent := private.fin_entidade(p_workspace_id, p_entidade_id::text);
  if (select private.nivel_fin(p_workspace_id, v_ent)) < 4 then raise exception 'Só a gestão do Financeiro desta empresa define o orçamento.' using errcode = 'P0001'; end if;
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_cat := (v_item->>'categoria_id')::uuid;
    v_valor := nullif(v_item->>'valor_mensal', '')::numeric;
    if not exists (select 1 from public.fin_categorias where id = v_cat and workspace_id = p_workspace_id) then
      raise exception 'Categoria inválida.' using errcode = 'P0001';
    end if;
    if v_valor is null or v_valor <= 0 then
      delete from public.fin_orcamentos where workspace_id = p_workspace_id and entidade_id = v_ent and ano = p_ano and categoria_id = v_cat;
    else
      insert into public.fin_orcamentos (workspace_id, entidade_id, ano, categoria_id, valor_mensal, atualizado_por) values (p_workspace_id, v_ent, p_ano, v_cat, round(v_valor, 2), (select auth.uid()))
      on conflict (workspace_id, entidade_id, ano, categoria_id) do update set valor_mensal = excluded.valor_mensal, atualizado_por = excluded.atualizado_por, updated_at = now();
      v_total := v_total + 1;
    end if;
  end loop;
  perform private.auditar_financeiro(p_workspace_id, null, 'orcamento', jsonb_build_object('ano', p_ano, 'categorias', v_total, 'empresa', v_ent));
  return v_total;
end $function$;

CREATE OR REPLACE FUNCTION public.financeiro_salvar_cadastro(p_workspace_id uuid, p_tabela text, p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_fonte uuid;
  v_projeto uuid;
  v_ent uuid;
begin
  -- A empresa do cadastro: a de um que já existe (não muda) ou a pedida (senão, a principal). Categoria é comum a todas.
  v_ent := case p_tabela
    when 'conta' then coalesce((select c.entidade_id from public.fin_contas c where c.id = v_id and c.workspace_id = p_workspace_id), private.fin_entidade(p_workspace_id, p->>'entidade_id'))
    when 'fonte' then coalesce((select f.entidade_id from public.fin_fontes f where f.id = v_id and f.workspace_id = p_workspace_id), private.fin_entidade(p_workspace_id, p->>'entidade_id'))
    when 'favorecido' then coalesce((select f.entidade_id from public.fin_favorecidos f where f.id = v_id and f.workspace_id = p_workspace_id), private.fin_entidade(p_workspace_id, p->>'entidade_id'))
  end;
  if p_tabela = 'favorecido' then
    if (select private.nivel_fin(p_workspace_id, v_ent)) < 2 then raise exception 'Você não tem acesso para cadastrar favorecidos.' using errcode = 'P0001'; end if;
  elsif p_tabela = 'categoria' then
    if (select private.nivel_financeiro(p_workspace_id)) < 4 then raise exception 'Só a gestão do Financeiro (de todas as empresas) mexe nas categorias.' using errcode = 'P0001'; end if;
  elsif (select private.nivel_fin(p_workspace_id, v_ent)) < 4 then
    raise exception 'Só a gestão do Financeiro mexe em contas, fontes e categorias.' using errcode = 'P0001';
  end if;

  if p_tabela = 'conta' then
    v_fonte := nullif(p->>'fonte_id', '')::uuid;
    if v_fonte is not null and not exists (select 1 from public.fin_fontes where id = v_fonte and workspace_id = p_workspace_id and entidade_id = v_ent) then
      raise exception 'Fonte inválida (tem de ser da mesma empresa da conta).' using errcode = 'P0001';
    end if;
    if v_id is null then
      insert into public.fin_contas (workspace_id, entidade_id, nome, tipo, banco, agencia, numero, fonte_id, saldo_inicial, saldo_inicial_em)
      values (p_workspace_id, v_ent, trim(p->>'nome'), coalesce(p->>'tipo', 'corrente'), nullif(trim(p->>'banco'), ''), nullif(trim(p->>'agencia'), ''),
        nullif(trim(p->>'numero'), ''), v_fonte, coalesce((p->>'saldo_inicial')::numeric, 0), coalesce((p->>'saldo_inicial_em')::date, current_date))
      returning id into v_id;
    else
      -- O saldo inicial muda o saldo de todo mês depois dele: não mexe em mês fechado.
      if exists (select 1 from public.fin_contas c where c.id = v_id and c.workspace_id = p_workspace_id
          and (c.saldo_inicial is distinct from coalesce((p->>'saldo_inicial')::numeric, 0) or c.saldo_inicial_em is distinct from (p->>'saldo_inicial_em')::date)
          and (private.fin_fechado_conta(c.id, c.saldo_inicial_em) or private.fin_fechado_conta(c.id, (p->>'saldo_inicial_em')::date))) then
        raise exception 'O saldo inicial está num mês fechado.' using errcode = 'P0001';
      end if;
      update public.fin_contas set nome = trim(p->>'nome'), tipo = coalesce(p->>'tipo', tipo), banco = nullif(trim(p->>'banco'), ''),
        agencia = nullif(trim(p->>'agencia'), ''), numero = nullif(trim(p->>'numero'), ''), fonte_id = v_fonte,
        saldo_inicial = coalesce((p->>'saldo_inicial')::numeric, 0), saldo_inicial_em = coalesce((p->>'saldo_inicial_em')::date, saldo_inicial_em),
        ativa = coalesce((p->>'ativa')::boolean, ativa)
      where id = v_id and workspace_id = p_workspace_id;
      if not found then raise exception 'Conta não encontrada.' using errcode = 'P0001'; end if;
    end if;
  elsif p_tabela = 'fonte' then
    v_projeto := nullif(p->>'projeto_id', '')::uuid;
    if v_projeto is not null and not exists (select 1 from public.projects where id = v_projeto and workspace_id = p_workspace_id) then
      raise exception 'Projeto inválido.' using errcode = 'P0001';
    end if;
    if v_id is null then
      insert into public.fin_fontes (workspace_id, entidade_id, nome, restrita, projeto_id, financiador, descricao, inicio, fim, valor_previsto)
      values (p_workspace_id, v_ent, trim(p->>'nome'), coalesce((p->>'restrita')::boolean, true), v_projeto, nullif(trim(p->>'financiador'), ''),
        nullif(trim(p->>'descricao'), ''), nullif(p->>'inicio', '')::date, nullif(p->>'fim', '')::date, nullif(p->>'valor_previsto', '')::numeric)
      returning id into v_id;
    else
      update public.fin_fontes set nome = trim(p->>'nome'), restrita = coalesce((p->>'restrita')::boolean, restrita), projeto_id = v_projeto,
        financiador = nullif(trim(p->>'financiador'), ''), descricao = nullif(trim(p->>'descricao'), ''), inicio = nullif(p->>'inicio', '')::date,
        fim = nullif(p->>'fim', '')::date, valor_previsto = nullif(p->>'valor_previsto', '')::numeric, ativa = coalesce((p->>'ativa')::boolean, ativa)
      where id = v_id and workspace_id = p_workspace_id;
      if not found then raise exception 'Fonte não encontrada.' using errcode = 'P0001'; end if;
    end if;
  elsif p_tabela = 'categoria' then
    if v_id is null then
      insert into public.fin_categorias (workspace_id, tipo, nome, grupo, codigo_contabil, fixa, ordem)
      values (p_workspace_id, p->>'tipo', trim(p->>'nome'), nullif(trim(p->>'grupo'), ''), nullif(trim(p->>'codigo_contabil'), ''),
        coalesce((p->>'fixa')::boolean, false), coalesce((p->>'ordem')::integer, 100))
      returning id into v_id;
    else
      -- O tipo não muda: os lançamentos já feitos dependem dele.
      update public.fin_categorias set nome = trim(p->>'nome'), grupo = nullif(trim(p->>'grupo'), ''), codigo_contabil = nullif(trim(p->>'codigo_contabil'), ''),
        fixa = coalesce((p->>'fixa')::boolean, fixa), ativa = coalesce((p->>'ativa')::boolean, ativa)
      where id = v_id and workspace_id = p_workspace_id;
      if not found then raise exception 'Categoria não encontrada.' using errcode = 'P0001'; end if;
    end if;
  elsif p_tabela = 'favorecido' then
    if v_id is null then
      insert into public.fin_favorecidos (workspace_id, entidade_id, nome, tipo_pessoa, documento, chave_pix, email, telefone, observacao)
      values (p_workspace_id, v_ent, trim(p->>'nome'), coalesce(p->>'tipo_pessoa', 'pj'), nullif(regexp_replace(coalesce(p->>'documento', ''), '\D', '', 'g'), ''),
        nullif(trim(p->>'chave_pix'), ''), nullif(trim(p->>'email'), ''), nullif(trim(p->>'telefone'), ''), nullif(trim(p->>'observacao'), ''))
      returning id into v_id;
    else
      update public.fin_favorecidos set nome = trim(p->>'nome'), tipo_pessoa = coalesce(p->>'tipo_pessoa', tipo_pessoa),
        documento = nullif(regexp_replace(coalesce(p->>'documento', ''), '\D', '', 'g'), ''), chave_pix = nullif(trim(p->>'chave_pix'), ''),
        email = nullif(trim(p->>'email'), ''), telefone = nullif(trim(p->>'telefone'), ''), observacao = nullif(trim(p->>'observacao'), '')
      where id = v_id and workspace_id = p_workspace_id;
      if not found then raise exception 'Favorecido não encontrado.' using errcode = 'P0001'; end if;
    end if;
  else
    raise exception 'Cadastro inválido.' using errcode = 'P0001';
  end if;
  perform private.auditar_financeiro(p_workspace_id, null, 'cadastro', jsonb_build_object('tabela', p_tabela, 'id', v_id, 'novo', p->>'id' is null or p->>'id' = ''));
  return v_id;
exception
  when unique_violation then
    raise exception '%', case p_tabela when 'favorecido' then 'Já existe um favorecido com este CPF/CNPJ.' else 'Já existe um cadastro com este nome.' end using errcode = 'P0001';
end $function$;
