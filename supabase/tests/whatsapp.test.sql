-- Testes do WhatsApp (supabase/migrations/20260929090000_cvrj_whatsapp.sql). Mesmas regras de
-- supabase/tests/auditoria.test.sql: só em banco local, numa transação desfeita no fim.
--
--   psql -v ON_ERROR_STOP=1 -d redacao_local < supabase/tests/whatsapp.test.sql

\set QUIET 1
\pset format unaligned
\pset tuples_only on
\pset pager off

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select id as ws from public.workspaces where slug = 'producao' \gset
\set admin '00000000-0000-4000-8000-0000000000a1'
\set editor '00000000-0000-4000-8000-0000000000a2'
\set outro '00000000-0000-4000-8000-0000000000a3'
insert into auth.users (id, email) values (:'admin', 'admin.whats@teste.invalid'), (:'editor', 'editor.whats@teste.invalid'), (:'outro', 'outro.whats@teste.invalid');
insert into public.profiles (id, username, full_name) values (:'admin', 'admin.whats', 'Pessoa Admin'), (:'editor', 'editor.whats', 'Pessoa Editora'), (:'outro', 'outro.whats', 'Outra Pessoa');
insert into public.workspace_members (workspace_id, user_id, role) values (:'ws', :'admin', 'admin'), (:'ws', :'editor', 'editor'), (:'ws', :'outro', 'editor');

create function pg_temp.como(p_usuario uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated', 'aal', 'aal2')::text, true)
$$;

-- ================================================================ privilégios

select ok(has_table_privilege('authenticated', 'public.whatsapp_contas', 'select'), 'contas: quem está logado lê (o RLS filtra)');
select ok(not has_table_privilege('authenticated', 'public.whatsapp_contas', 'insert')
          and not has_table_privilege('authenticated', 'public.whatsapp_contas', 'update')
          and not has_table_privilege('authenticated', 'public.whatsapp_contas', 'delete'), 'contas: ninguém logado escreve direto (só a confirmação por código)');
select ok(not has_table_privilege('anon', 'public.whatsapp_contas', 'select'), 'contas: anon não lê');
select ok(not has_table_privilege('authenticated', 'public.whatsapp_codigos', 'select')
          and not has_table_privilege('anon', 'public.whatsapp_codigos', 'select'), 'códigos: ninguém lê pela Data API');
select ok(has_table_privilege('authenticated', 'public.whatsapp_mensagens', 'select')
          and not has_table_privilege('authenticated', 'public.whatsapp_mensagens', 'insert'), 'registro: lê (o RLS filtra), não escreve');
select ok(not has_table_privilege('anon', 'public.whatsapp_mensagens', 'select'), 'registro: anon não lê');

-- ================================================================ formato e unicidade

insert into public.whatsapp_contas (user_id, numero) values (:'editor', '5521987654321'), (:'admin', '5521912345678');
select throws_ok(format('insert into public.whatsapp_contas (user_id, numero) values (%L, %L)', :'outro', '5521987654321'),
                 '23505', null, 'um número, uma conta');
select throws_ok(format('insert into public.whatsapp_contas (user_id, numero) values (%L, %L)', :'outro', '+55 21 98765-0000'),
                 '23514', null, 'número só com dígitos');
select throws_ok(format('insert into public.whatsapp_codigos (user_id, numero, codigo_hash, expira_em) values (%L, %L, %L, now())', :'outro', '5521900000000', '123456'),
                 '23514', null, 'código guarda só o hash');

insert into public.whatsapp_mensagens (workspace_id, direcao, tipo, situacao, numero, mensagem_id) values (:'ws', 'entrada', 'bot', 'recebida', '5521987654321', 'ABC');
select throws_ok(format('insert into public.whatsapp_mensagens (workspace_id, direcao, tipo, situacao, numero, mensagem_id) values (%L, %L, %L, %L, %L, %L)', :'ws', 'entrada', 'bot', 'recebida', '5521987654321', 'ABC'),
                 '23505', null, 'a mesma mensagem recebida não entra duas vezes (reentrega do webhook)');
select lives_ok(format('insert into public.whatsapp_mensagens (workspace_id, direcao, tipo, situacao, numero, mensagem_id) values (%L, %L, %L, %L, %L, %L)', :'ws', 'saida', 'bot', 'enviada', '5521987654321', 'ABC'),
                'na saída, o mesmo id não trava');
select throws_ok(format('insert into public.whatsapp_mensagens (workspace_id, direcao, tipo, situacao) values (%L, %L, %L, %L)', :'ws', 'saida', 'spam', 'enviada'),
                 '23514', null, 'tipo fora da lista é recusado');

select is((select whatsapp from public.notificacao_preferencias where false), null, 'coluna de preferências existe');
insert into public.notificacao_preferencias (user_id) values (:'outro');
select is((select whatsapp from public.notificacao_preferencias where user_id = :'outro'), '{}'::jsonb, 'preferência nasce vazia (padrão do código)');
select throws_ok(format('update public.notificacao_preferencias set whatsapp = %L where user_id = %L', '[]', :'outro'),
                 '23514', null, 'preferência é um objeto');
select has_column('public', 'notifications', 'whatsapp_em', 'notifications.whatsapp_em existe');

-- ================================================================ leitura (RLS)

select pg_temp.como(:'editor');
set local role authenticated;
select is((select count(*)::int from public.whatsapp_contas), 1, 'editor vê só a própria conta de WhatsApp');
select is((select numero from public.whatsapp_contas), '5521987654321', 'e é a dele');
select is((select count(*)::int from public.whatsapp_mensagens), 0, 'editor não lê o registro');
select throws_ok(format('update public.whatsapp_contas set pausado_em = now() where user_id = %L', :'editor'), '42501', null, 'editor não muda a conta direto');
reset role;

select pg_temp.como(:'admin');
set local role authenticated;
select is((select count(*)::int from public.whatsapp_contas), 1, 'admin também só vê a própria conta (o celular dos outros não aparece)');
select is((select count(*)::int from public.whatsapp_mensagens), 2, 'admin lê o registro do espaço');
reset role;

select pg_temp.como(:'outro');
set local role authenticated;
select is((select count(*)::int from public.whatsapp_contas), 0, 'quem não confirmou não vê nada');
reset role;

-- ================================================================ fila e estado (20260929100000)

select ok(not has_table_privilege('authenticated', 'public.whatsapp_fila', 'select')
          and not has_table_privilege('anon', 'public.whatsapp_fila', 'select'), 'fila: ninguém lê pela Data API (guarda o texto)');
select ok(not has_table_privilege('authenticated', 'public.whatsapp_estado', 'select'), 'estado: só o servidor');
select lives_ok(format('insert into public.whatsapp_fila (workspace_id, user_id, numero, texto, tipo, motivo, link) values (%L, %L, %L, %L, %L, %L, %L)',
                :'ws', :'editor', '5521987654321', 'Aviso', 'aviso', 'silencio', '/chamados/1'), 'aviso entra na fila');
select throws_ok(format('insert into public.whatsapp_fila (workspace_id, numero, texto, tipo, motivo) values (%L, %L, %L, %L, %L)', :'ws', '5521987654321', 'x', 'aviso', 'porque_sim'),
                 '23514', null, 'motivo fora da lista é recusado');
select throws_ok(format('insert into public.whatsapp_fila (workspace_id, numero, texto, tipo, motivo) values (%L, %L, %L, %L, %L)', :'ws', '5521987654321', 'x', 'codigo', 'falha'),
                 '23514', null, 'código de confirmação não entra na fila (vence em 10 min)');
select lives_ok(format('insert into public.notifications (workspace_id, user_id, title, message, categoria) values (%L, %L, %L, %L, %L)', :'ws', :'admin', 'WhatsApp caiu', 'x', 'sistema'),
                'categoria "sistema" aceita nas notificações');
select lives_ok(format('insert into public.notifications (workspace_id, user_id, title, message, categoria) values (%L, %L, %L, %L, %L)', :'ws', :'admin', 'Chamado', 'x', 'chamados'),
                'as categorias antigas continuam aceitas');

select * from finish();
rollback;
