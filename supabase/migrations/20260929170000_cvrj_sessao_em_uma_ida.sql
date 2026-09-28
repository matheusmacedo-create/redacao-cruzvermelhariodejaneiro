-- A sessão em uma ida ao banco. Só acréscimos.
--
-- Toda página fazia, em sequência: getUser (Auth) → profiles + workspace_members
-- → o nível de acesso da área (fin_acesso, pat_acesso…) → os dados da tela. E o
-- layout, em toda página, somava notificações, aprovações pendentes, o painel do
-- chat, as pessoas, quem lê os acessos e quem avalia envios. Cada seta é uma
-- ida ao banco (~30 ms de Washington ao Canadá, mais o Auth).
--
-- Esta função devolve, numa chamada só, tudo o que a sessão e o layout precisam;
-- o servidor a chama em paralelo com o getUser (lib/session.ts). Sem ela (a
-- migração ainda não aplicada), o código volta às leituras de antes.
--
-- security definer, com cada subconsulta filtrada por auth.uid(): devolve só o
-- que é da própria pessoa, ou o que ela já enxergava pelo RLS (as empresas do
-- Financeiro pela mesma regra da política, private.nivel_fin; as pessoas do
-- chat pela mesma regra de lib/chat/servidor.ts). Nada de nenhum outro usuário.
create or replace function public.palacio_sessao()
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare
  v_uid uuid := (select auth.uid());
  v_ws uuid;
  v_role text;
begin
  if v_uid is null then return null; end if;

  -- O espaço: a Produção, senão o primeiro vínculo (obterWorkspaceSemVerificacao).
  select m.workspace_id, m.role into v_ws, v_role
    from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
   where m.user_id = v_uid
   order by (w.kind = 'production') desc, m.created_at
   limit 1;

  return jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'memberships', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'role', m.role, 'coordination', m.coordination,
        'workspaces', jsonb_build_object('id', w.id, 'name', w.name, 'slug', w.slug, 'kind', w.kind, 'mfa_obrigatorio_para', w.mfa_obrigatorio_para)
      ) order by m.created_at), '[]'::jsonb)
      from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
      where m.user_id = v_uid),
    'workspace_id', v_ws,
    -- Os níveis por área, pessoa a pessoa (null = sem acesso concedido).
    'acessos', jsonb_build_object(
      'financeiro', (select jsonb_build_object('nivel', a.nivel, 'entidade_id', a.entidade_id) from public.fin_acesso a where a.workspace_id = v_ws and a.user_id = v_uid),
      'patrimonio', (select a.nivel from public.pat_acesso a where a.workspace_id = v_ws and a.user_id = v_uid),
      'participantes', (select a.nivel from public.participantes_acesso a where a.workspace_id = v_ws and a.user_id = v_uid),
      'equipe', (select a.nivel from public.equipe_acesso a where a.workspace_id = v_ws and a.user_id = v_uid)),
    'leitor_de_acessos', exists (select 1 from public.acessos_leitores l where l.workspace_id = v_ws and l.user_id = v_uid),
    'avaliador_de_envios', exists (select 1 from public.envios_avaliadores e where e.workspace_id = v_ws and e.user_id = v_uid),
    'escola_tem_entidade', exists (select 1 from public.fin_entidades e where e.workspace_id = v_ws and e.tipo = 'escola'),
    -- As empresas do Financeiro que esta pessoa enxerga: a mesma regra da política fin_entidades_select.
    'entidades', (
      select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'razao_social', e.razao_social, 'cnpj', e.cnpj, 'tipo', e.tipo, 'principal', e.principal, 'fechado_ate', e.fechado_ate) order by e.ordem), '[]'::jsonb)
      from public.fin_entidades e
      where e.workspace_id = v_ws and e.ativa and (select private.nivel_fin(e.workspace_id, e.id)) >= 1),
    -- O sino: as 10 mais recentes e quantas faltam ler.
    'notificacoes', (
      select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'message', n.message, 'link', n.link, 'read_at', n.read_at, 'created_at', n.created_at) order by n.created_at desc), '[]'::jsonb)
      from (select * from public.notifications x where x.workspace_id = v_ws and x.user_id = v_uid order by x.created_at desc limit 10) n),
    'nao_lidas', (select count(*) from public.notifications n where n.workspace_id = v_ws and n.user_id = v_uid and n.read_at is null),
    -- O número ao lado de Aprovações: o que espera o voto desta pessoa.
    'aprovacoes_pendentes', (
      select count(*) from public.approval_voters v join public.approvals a on a.id = v.approval_id
      where v.workspace_id = v_ws and v.user_id = v_uid and v.decision = 'pending' and a.status = 'pending'),
    -- O painel do chat (a mesma função que o layout chamava à parte).
    'chat', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.chat_painel(v_ws) c),
    -- As pessoas do chat: todas para a equipe; para a Escola, só quem divide um canal com ela.
    'pessoas', (
      select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id,
        'profiles', jsonb_build_object('full_name', p.full_name, 'username', p.username, 'initials', p.initials, 'color', p.color, 'avatar_path', p.avatar_path, 'active', p.active))), '[]'::jsonb)
      from public.workspace_members m join public.profiles p on p.id = m.user_id
      where m.workspace_id = v_ws
        and (v_role is distinct from 'escola' or m.user_id = v_uid
             or m.user_id in (select cm2.user_id from public.chat_membros cm join public.chat_membros cm2 on cm2.canal_id = cm.canal_id
                              where cm.workspace_id = v_ws and cm.user_id = v_uid))),
    -- A arrumação do Início desta pessoa.
    'inicio', (select i.blocos from public.inicio_preferencias i where i.workspace_id = v_ws and i.user_id = v_uid)
  );
end $$;

revoke all on function public.palacio_sessao() from public, anon;
grant execute on function public.palacio_sessao() to authenticated;
comment on function public.palacio_sessao() is 'Tudo o que a sessão e o layout precisam, numa ida só (lib/session.ts). Só dados da própria pessoa.';
