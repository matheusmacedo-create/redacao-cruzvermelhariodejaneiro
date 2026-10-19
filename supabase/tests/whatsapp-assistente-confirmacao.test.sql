-- Testes do plano do assistente confirmado no Palácio (supabase/migrations/20261019020000_cvrj_whatsapp_assistente_confirmacao.sql).
-- Mesmas regras de supabase/tests/auditoria.test.sql: só em banco local, numa transação desfeita no fim.
--
--   psql -v ON_ERROR_STOP=1 -d redacao_local < supabase/tests/whatsapp-assistente-confirmacao.test.sql

\set QUIET 1
\pset format unaligned
\pset tuples_only on
\pset pager off

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select id as ws from public.workspaces where slug = 'producao' \gset
\set dono '00000000-0000-4000-8000-0000000005a1'
\set outro '00000000-0000-4000-8000-0000000005a2'
\set autor '00000000-0000-4000-8000-0000000005a3'
\set plano '00000000-0000-4000-8000-0000000005b1'
\set plano2 '00000000-0000-4000-8000-0000000005b2'
insert into auth.users (id, email) values
  (:'dono', 'dono.palacio@teste.invalid'), (:'outro', 'outro.palacio@teste.invalid'), (:'autor', 'autor.palacio@teste.invalid');
insert into public.profiles (id, username, full_name) values
  (:'dono', 'dono.palacio', 'Dona do Plano'), (:'outro', 'outro.palacio', 'Outra Pessoa'), (:'autor', 'autor.palacio', 'Quem Pediu');
insert into public.workspace_members (workspace_id, user_id, role) values (:'ws', :'dono', 'editor'), (:'ws', :'outro', 'editor'), (:'ws', :'autor', 'editor');
insert into auth.mfa_factors (user_id, factor_type, status) values (:'dono', 'totp', 'verified');

create function pg_temp.como(p_usuario uuid, p_aal text default 'aal2') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated', 'aal', p_aal)::text, true),
         set_config('request.jwt.claim.sub', coalesce(p_usuario::text, ''), true)
$$;

-- ================================================================ a coluna e as restrições

select has_column('public', 'whatsapp_confirmacoes', 'plano_id', 'confirmação guarda o plano que confirma');
select col_is_fk('public', 'whatsapp_confirmacoes', 'plano_id', 'plano_id aponta para whatsapp_ia_planos');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'whatsapp_confirmacoes_plano_idx'), 'índice do plano');
select ok(not has_table_privilege('authenticated', 'public.whatsapp_confirmacoes', 'insert')
          and not has_table_privilege('authenticated', 'public.whatsapp_confirmacoes', 'update')
          and not has_table_privilege('anon', 'public.whatsapp_confirmacoes', 'select'), 'confirmações: escrita só do servidor, como antes');

set local role service_role;
insert into public.whatsapp_ia_planos (id, workspace_id, user_id, numero, papel, situacao, sensivel, passos, hash, expira_em)
  values (:'plano', :'ws', :'dono', '5521987654321', 'editor', 'no_palacio', true, '[]', repeat('a', 64), now() + interval '15 minutes');
select lives_ok(format('insert into public.whatsapp_confirmacoes (workspace_id, user_id, acao, alvo_id, plano_id, token_hash, expira_em) values (%L, %L, %L, %L, %L, %L, now() + interval ''15 minutes'')',
                :'ws', :'dono', 'plano', :'plano', :'plano', repeat('1', 64)), 'o link do plano entra (acao plano, com o plano)');
select throws_ok(format('insert into public.whatsapp_confirmacoes (workspace_id, user_id, acao, alvo_id, token_hash, expira_em) values (%L, %L, %L, %L, %L, now() + interval ''15 minutes'')',
                 :'ws', :'dono', 'plano', :'plano', repeat('2', 64)), '23514', null, 'acao plano sem plano_id é recusada');
select throws_ok(format('insert into public.whatsapp_confirmacoes (workspace_id, user_id, acao, alvo_id, plano_id, token_hash, expira_em) values (%L, %L, %L, %L, %L, %L, now() + interval ''15 minutes'')',
                 :'ws', :'dono', 'plano', :'autor', :'plano', repeat('3', 64)), '23514', null, 'o alvo do link do plano é o próprio plano');
select throws_ok(format('insert into public.whatsapp_confirmacoes (workspace_id, user_id, acao, alvo_id, plano_id, token_hash, expira_em) values (%L, %L, %L, %L, %L, %L, now() + interval ''15 minutes'')',
                 :'ws', :'dono', 'votar_aprovacao', :'plano', :'plano', repeat('4', 64)), '23514', null, 'só o link do plano leva plano_id');
select lives_ok(format('insert into public.whatsapp_confirmacoes (workspace_id, user_id, acao, alvo_id, token_hash, expira_em) values (%L, %L, %L, %L, %L, now() + interval ''15 minutes'')',
                :'ws', :'dono', 'decidir_despesa', :'autor', repeat('5', 64)), 'as ações da onda 2 continuam valendo');
select throws_ok(format('insert into public.whatsapp_confirmacoes (workspace_id, user_id, acao, alvo_id, token_hash, expira_em) values (%L, %L, %L, %L, %L, now() + interval ''15 minutes'')',
                 :'ws', :'dono', 'pagar', :'autor', repeat('6', 64)), '23514', null, 'ação fora da lista continua recusada');
reset role;

-- ================================================================ só o dono lê o link do plano

select pg_temp.como(:'dono');
set local role authenticated;
select is((select count(*)::int from public.whatsapp_confirmacoes where plano_id = :'plano'), 1, 'o dono lê o link do plano dele');
reset role;
select pg_temp.como(:'outro');
set local role authenticated;
select is((select count(*)::int from public.whatsapp_confirmacoes where plano_id = :'plano'), 0, 'outra pessoa logada não vê o link');
reset role;
select pg_temp.como(null);

-- ================================================================ a transição atômica (dois cliques, uma execução)

set local role service_role;
with u as (update public.whatsapp_ia_planos set situacao = 'executando' where id = :'plano' and situacao = 'no_palacio' and expira_em > now() returning 1)
select is((select count(*)::int from u), 1, 'o primeiro clique leva o plano a executando');
with u as (update public.whatsapp_ia_planos set situacao = 'executando' where id = :'plano' and situacao = 'no_palacio' and expira_em > now() returning 1)
select is((select count(*)::int from u), 0, 'o segundo clique não acha mais o plano esperando o Palácio');
insert into public.whatsapp_ia_planos (id, workspace_id, user_id, numero, papel, situacao, sensivel, passos, hash, expira_em)
  values (:'plano2', :'ws', :'dono', '5521987654321', 'editor', 'no_palacio', true, '[]', repeat('b', 64), now() - interval '1 minute');
with u as (update public.whatsapp_ia_planos set situacao = 'executando' where id = :'plano2' and situacao = 'no_palacio' and expira_em > now() returning 1)
select is((select count(*)::int from u), 0, 'o plano vencido no Palácio não executa');

-- Apagar o plano (a rotina apaga os antigos) apaga o link dele.
delete from public.whatsapp_ia_planos where id = :'plano';
select is((select count(*)::int from public.whatsapp_confirmacoes where alvo_id = :'plano'), 0, 'sem o plano, sem o link');
reset role;

-- ================================================================ o voto pela sessão confere o conteúdo do plano

insert into public.content_pieces (id, workspace_id, title, subtitle, body, status)
  values ('00000000-0000-4000-8000-0000000005d1', :'ws', 'Balanço da ação', '', 'Texto do plano.', 'review');
insert into public.approvals (id, workspace_id, content_id, requested_by) values ('00000000-0000-4000-8000-0000000005e1', :'ws', '00000000-0000-4000-8000-0000000005d1', :'autor');
insert into public.approval_voters (workspace_id, approval_id, user_id) values (:'ws', '00000000-0000-4000-8000-0000000005e1', :'dono');
select public.whatsapp_hash_do_conteudo('00000000-0000-4000-8000-0000000005d1') as hash_do_plano \gset
-- A matéria muda entre o plano e o clique (reenviada para aprovação com outro texto).
update public.content_pieces set body = 'Texto trocado depois do plano.' where id = '00000000-0000-4000-8000-0000000005d1';
select pg_temp.como(:'dono', 'aal2');
set local role authenticated;
select throws_ok(format('select public.votar_conferido(%L, %L, %L, %L)', '00000000-0000-4000-8000-0000000005e1', 'approved', '', :'hash_do_plano'),
                 'WA002', 'A matéria mudou depois do plano.', 'matéria alterada entre o plano e o clique: WA002');
reset role;
select is((select decision from public.approval_voters where approval_id = '00000000-0000-4000-8000-0000000005e1' and user_id = :'dono'), 'pending', 'e o voto continua pendente');
select public.whatsapp_hash_do_conteudo('00000000-0000-4000-8000-0000000005d1') as hash_de_agora \gset
select pg_temp.como(:'dono', 'aal1');
set local role authenticated;
select throws_ok(format('select public.votar_conferido(%L, %L, %L, %L)', '00000000-0000-4000-8000-0000000005e1', 'approved', '', :'hash_de_agora'),
                 '42501', null, 'sessão aal1 de quem usa a verificação em duas etapas não vota pela página');
reset role;
select pg_temp.como(null);

select * from finish();
rollback;
