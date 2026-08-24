-- A área de Demonstração foi descontinuada: o sistema passa a operar com um
-- único espaço, sem tela de seleção. A remoção só ocorre se o espaço estiver
-- vazio, para que um engano aqui nunca apague conteúdo real — as tabelas têm
-- on delete cascade a partir de workspaces.
do $$
declare
  v_demo uuid;
  v_itens integer;
begin
  select id into v_demo from public.workspaces where kind = 'demo';
  if v_demo is null then
    raise notice 'Nenhum espaço de demonstração encontrado; nada a fazer.';
    return;
  end if;

  select
    (select count(*) from public.pautas          where workspace_id = v_demo) +
    (select count(*) from public.content_pieces  where workspace_id = v_demo) +
    (select count(*) from public.projects        where workspace_id = v_demo) +
    (select count(*) from public.inbox_items     where workspace_id = v_demo) +
    (select count(*) from public.calendar_events where workspace_id = v_demo) +
    (select count(*) from public.files           where workspace_id = v_demo) +
    (select count(*) from public.messages        where workspace_id = v_demo) +
    (select count(*) from public.approvals       where workspace_id = v_demo)
  into v_itens;

  if v_itens > 0 then
    raise exception 'O espaço de demonstração tem % registros. Nada foi apagado.', v_itens;
  end if;

  -- Garante que ninguém perca acesso: todo membro do demo precisa estar na produção.
  insert into public.workspace_members (workspace_id, user_id, role, coordination)
  select p.id, d.user_id, d.role, d.coordination
  from public.workspace_members d
  cross join (select id from public.workspaces where kind = 'production') p
  where d.workspace_id = v_demo
  on conflict (workspace_id, user_id) do nothing;

  delete from public.workspaces where id = v_demo;
end $$;
