-- Testes do cadastro de colaborador pelo WhatsApp (supabase/migrations/20261019050000_cvrj_whatsapp_cadastro_colaborador.sql):
-- a pergunta e o link novos, as listas antigas intactas, o uso único do link e o contato da pessoa nova saindo
-- dos dados quando a conversa acaba. Mesmas regras de supabase/tests/auditoria.test.sql: só em banco local, numa
-- transação desfeita no fim.
--
--   psql -v ON_ERROR_STOP=1 -d redacao_local < supabase/tests/whatsapp-cadastro-colaborador.test.sql

\set QUIET 1
\pset format unaligned
\pset tuples_only on
\pset pager off

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select id as ws from public.workspaces where slug = 'producao' \gset
\set admin '00000000-0000-4000-8000-0000000007a1'
\set outro '00000000-0000-4000-8000-0000000007a2'
\set ficha '00000000-0000-4000-8000-0000000007b1'
\set pedido '00000000-0000-4000-8000-0000000007b2'
insert into auth.users (id, email) values (:'admin', 'admin.cadastro@teste.invalid'), (:'outro', 'outro.cadastro@teste.invalid');
insert into public.profiles (id, username, full_name) values (:'admin', 'admin.cadastro', 'Quem Cadastra'), (:'outro', 'outro.cadastro', 'Outra Pessoa');
insert into public.workspace_members (workspace_id, user_id, role) values (:'ws', :'admin', 'admin'), (:'ws', :'outro', 'editor');

create function pg_temp.como(p_usuario uuid, p_aal text default 'aal2') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated', 'aal', p_aal)::text, true),
         set_config('request.jwt.claim.sub', coalesce(p_usuario::text, ''), true)
$$;
-- Os dados que o bot guarda (lib/contas/cadastro-regras.ts): o contato fica nas chaves "email" e "whatsapp".
create function pg_temp.dados() returns jsonb language sql as $$
  select jsonb_build_object('etapa', 'conferencia', 'nome', 'Ana Paula Lima', 'email', 'ana.lima@exemplo.org', 'whatsapp', '5521987654321',
                            'coordenacao', 'Voluntariado', 'cargo', 'Assistente', 'papel', 'colaborador', 'usuario', 'ana.lima', 'pedirFicha', true)
$$;

-- ================================================================ as listas: só acrescentou

select is((select count(*)::int from pg_constraint where conrelid = 'public.whatsapp_pendencias'::regclass and contype = 'c'
            and pg_get_constraintdef(oid) like '%cadastrar_colaborador%'), 1, 'pendências: uma restrição de tipo com o cadastro');
select ok((select pg_get_constraintdef(oid) from pg_constraint where conname = 'whatsapp_pendencias_tipo_check')
            ~ 'abrir_chamado.*aprovar.*atender_chamado.*cadastrar_colaborador.*envio.*financeiro.*frota_retorno.*frota_saida.*guardar_documento.*marcar_presenca.*nao_fui_eu.*registrar_visita',
          'pendências: os tipos que já valiam continuam todos na lista');
select is((select (length(pg_get_constraintdef(oid)) - length(replace(pg_get_constraintdef(oid), 'cadastrar_colaborador', ''))) / length('cadastrar_colaborador')
             from pg_constraint where conname = 'whatsapp_pendencias_tipo_check'), 1, 'pendências: o tipo novo entra uma vez só (aplicar de novo não repete)');
select ok((select pg_get_constraintdef(oid) from pg_constraint where conname = 'whatsapp_confirmacoes_acao_check')
            ~ 'cadastrar_colaborador.*decidir_compra.*decidir_despesa.*desativar_conta.*plano.*votar_aprovacao',
          'confirmações: as ações que já valiam continuam todas na lista');
select ok(exists (select 1 from pg_constraint where conname = 'whatsapp_confirmacoes_plano_coerente'), 'a restrição do plano (que também cita acao) ficou');

-- ================================================================ o trigger e a função

select ok((select not prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'private.whatsapp_cadastro_sem_contato()'::regprocedure),
          'a função do trigger: sem security definer, search_path vazio');
select ok(not has_function_privilege('authenticated', 'private.whatsapp_cadastro_sem_contato()', 'execute')
          and not has_function_privilege('anon', 'private.whatsapp_cadastro_sem_contato()', 'execute'), 'a função do trigger não é de ninguém de fora');
select ok(not has_table_privilege('authenticated', 'public.whatsapp_pendencias', 'select')
          and not has_table_privilege('authenticated', 'public.whatsapp_confirmacoes', 'insert')
          and not has_table_privilege('authenticated', 'public.whatsapp_confirmacoes', 'update')
          and not has_table_privilege('anon', 'public.whatsapp_confirmacoes', 'select'), 'pendências e confirmações: escrita só do servidor, como antes');

-- ================================================================ a pergunta do cadastro

set local role service_role;
select lives_ok(format('insert into public.whatsapp_pendencias (workspace_id, user_id, tipo, dados, expira_em) values (%L, %L, %L, %L, now() + interval ''15 minutes'')',
                :'ws', :'admin', 'cadastrar_colaborador', pg_temp.dados()), 'a pergunta do cadastro entra');
select throws_ok(format('insert into public.whatsapp_pendencias (workspace_id, user_id, tipo, expira_em) values (%L, %L, %L, now())', :'ws', :'admin', 'cadastrar_admin'),
                 '23514', null, 'tipo fora da lista continua recusado');
select lives_ok(format('insert into public.whatsapp_pendencias (workspace_id, user_id, tipo, expira_em) values (%L, %L, %L, now())', :'ws', :'admin', 'guardar_documento'),
                'os tipos de antes continuam valendo');

select (select id from public.whatsapp_pendencias where user_id = :'admin' and tipo = 'cadastrar_colaborador') as pergunta \gset
select is((select dados ->> 'email' from public.whatsapp_pendencias where id = :'pergunta'), 'ana.lima@exemplo.org', 'aberta, a pergunta guarda o e-mail');
update public.whatsapp_pendencias set expira_em = now() + interval '15 minutes', mensagem_id = 'wamid.1' where id = :'pergunta';
select is((select dados ->> 'whatsapp' from public.whatsapp_pendencias where id = :'pergunta'), '5521987654321', 'renovar a pergunta aberta não mexe no contato');

-- Encerrar (respondida, cancelada ou trocada por outra): o contato sai na mesma gravação.
update public.whatsapp_pendencias set encerrada_em = now() where id = :'pergunta' and encerrada_em is null;
select ok((select not (dados ? 'email') and not (dados ? 'whatsapp') and (dados ->> 'redigida')::boolean from public.whatsapp_pendencias where id = :'pergunta'),
          'encerrada: sem e-mail nem WhatsApp, marcada como redigida');
select is((select dados ->> 'nome' from public.whatsapp_pendencias where id = :'pergunta'), 'Ana Paula Lima', 'o resto da pergunta fica (o nome, a etapa)');
update public.whatsapp_pendencias set dados = dados || jsonb_build_object('email', 'outra@exemplo.org') where id = :'pergunta';
select ok((select not (dados ? 'email') from public.whatsapp_pendencias where id = :'pergunta'), 'pergunta encerrada não volta a guardar contato');

-- O caminho que encerra todas as perguntas da pessoa sem olhar o tipo (guardarPendencia, o assistente) também limpa.
insert into public.whatsapp_pendencias (workspace_id, user_id, tipo, dados, expira_em) values (:'ws', :'admin', 'cadastrar_colaborador', pg_temp.dados(), now() + interval '15 minutes');
update public.whatsapp_pendencias set encerrada_em = now() where user_id = :'admin' and encerrada_em is null;
select is((select count(*)::int from public.whatsapp_pendencias where user_id = :'admin' and tipo = 'cadastrar_colaborador' and (dados ? 'email' or dados ? 'whatsapp')), 0,
          'encerradas em lote: nenhuma pergunta do cadastro com contato');

-- As outras perguntas não passam pelo trigger.
insert into public.whatsapp_pendencias (workspace_id, user_id, tipo, dados, expira_em, encerrada_em)
  values (:'ws', :'admin', 'registrar_visita', jsonb_build_object('nome', 'Visitante', 'whatsapp', 'x'), now(), now());
select ok((select dados ? 'whatsapp' and not (dados ? 'redigida') from public.whatsapp_pendencias where user_id = :'admin' and tipo = 'registrar_visita'),
          'pergunta de outro tipo encerrada fica como estava (a faxina dela é outra)');
reset role;

-- ================================================================ o link do cadastro

set local role service_role;
select lives_ok(format('insert into public.whatsapp_confirmacoes (workspace_id, user_id, acao, alvo_id, dados, token_hash, expira_em) values (%L, %L, %L, %L, %L, %L, now() + interval ''15 minutes'')',
                :'ws', :'admin', 'cadastrar_colaborador', :'pedido', pg_temp.dados(), repeat('a', 64)), 'o link do cadastro entra (o alvo é um id novo do pedido)');
select lives_ok(format('insert into public.whatsapp_confirmacoes (workspace_id, user_id, acao, alvo_id, dados, token_hash, expira_em) values (%L, %L, %L, %L, %L, %L, now() + interval ''15 minutes'')',
                :'ws', :'admin', 'cadastrar_colaborador', :'ficha', pg_temp.dados(), repeat('b', 64)), 'ou a ficha do RH reaproveitada');
select throws_ok(format('insert into public.whatsapp_confirmacoes (workspace_id, user_id, acao, alvo_id, token_hash, expira_em) values (%L, %L, %L, %L, %L, now() + interval ''15 minutes'')',
                 :'ws', :'admin', 'cadastrar_admin', :'pedido', repeat('c', 64)), '23514', null, 'ação fora da lista continua recusada');
select throws_ok(format('insert into public.whatsapp_confirmacoes (workspace_id, user_id, acao, alvo_id, plano_id, token_hash, expira_em) values (%L, %L, %L, %L, %L, %L, now() + interval ''15 minutes'')',
                 :'ws', :'admin', 'cadastrar_colaborador', :'pedido', :'pedido', repeat('d', 64)), '23514', null, 'o link do cadastro não leva plano');
select lives_ok(format('insert into public.whatsapp_confirmacoes (workspace_id, user_id, acao, alvo_id, dados, token_hash, expira_em) values (%L, %L, %L, %L, %L, %L, now() + interval ''15 minutes'')',
                :'ws', :'admin', 'desativar_conta', :'outro', jsonb_build_object('nome', 'Outra Pessoa', 'email', 'nao.e.contato@exemplo.org'), repeat('e', 64)),
                'as ações da onda 2 continuam valendo');
reset role;

-- Só o dono lê o link (a página de confirmar usa a sessão de quem abriu).
select pg_temp.como(:'admin');
set local role authenticated;
select is((select dados ->> 'email' from public.whatsapp_confirmacoes where token_hash = repeat('a', 64)), 'ana.lima@exemplo.org', 'o dono lê o link aberto, com o contato');
reset role;
select pg_temp.como(:'outro');
set local role authenticated;
select is((select count(*)::int from public.whatsapp_confirmacoes where acao = 'cadastrar_colaborador'), 0, 'outra pessoa logada não vê o link do cadastro');
reset role;
select pg_temp.como(null);

-- Uso único (consumirConfirmacao): dois cliques, uma conta. E, ao gastar, o contato sai na mesma gravação.
set local role service_role;
with u as (update public.whatsapp_confirmacoes set usado_em = now()
            where token_hash = repeat('a', 64) and user_id = :'admin' and usado_em is null and expira_em > now() returning dados)
select ok((select not (dados ? 'email') and not (dados ? 'whatsapp') and dados ->> 'usuario' = 'ana.lima' from u), 'o primeiro clique gasta o link e já volta sem o contato');
with u as (update public.whatsapp_confirmacoes set usado_em = now()
            where token_hash = repeat('a', 64) and user_id = :'admin' and usado_em is null and expira_em > now() returning 1)
select is((select count(*)::int from u), 0, 'o segundo clique não acha o link (nada a executar de novo)');
update public.whatsapp_confirmacoes set resultado = 'Feito: conta de Ana Paula Lima criada (usuário @ana.lima).' where token_hash = repeat('a', 64);
select ok((select (dados ->> 'redigida')::boolean and resultado like 'Feito:%' from public.whatsapp_confirmacoes where token_hash = repeat('a', 64)),
          'o resultado gravado depois não traz o contato de volta');

-- Substituído por um link mais novo do mesmo pedido (criarConfirmacao): também sai.
update public.whatsapp_confirmacoes set usado_em = now(), resultado = 'Substituída por um link mais novo.' where token_hash = repeat('b', 64) and usado_em is null;
select ok((select not (dados ? 'email') and not (dados ? 'whatsapp') from public.whatsapp_confirmacoes where token_hash = repeat('b', 64)), 'link substituído: sem o contato');

-- Vencido sem uso: fica para a faxina do servidor (nada some sozinho no banco).
insert into public.whatsapp_confirmacoes (workspace_id, user_id, acao, alvo_id, dados, token_hash, expira_em, criado_em)
  values (:'ws', :'admin', 'cadastrar_colaborador', gen_random_uuid(), pg_temp.dados(), repeat('f', 64), now() - interval '1 minute', now() - interval '16 minutes');
select ok((select dados ? 'email' from public.whatsapp_confirmacoes where token_hash = repeat('f', 64)), 'vencido sem uso: a faxina do servidor é que redige');

-- Os outros links não passam pelo trigger.
update public.whatsapp_confirmacoes set usado_em = now() where token_hash = repeat('e', 64);
select ok((select dados ? 'email' and not (dados ? 'redigida') from public.whatsapp_confirmacoes where token_hash = repeat('e', 64)), 'link de outra ação usado fica como estava');
reset role;

select * from finish();
rollback;
