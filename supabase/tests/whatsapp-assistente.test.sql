-- Testes do assistente do WhatsApp (supabase/migrations/20261019010000_cvrj_whatsapp_assistente.sql). Mesmas regras de
-- supabase/tests/auditoria.test.sql: só em banco local, numa transação desfeita no fim.
--
--   psql -v ON_ERROR_STOP=1 -d redacao_local < supabase/tests/whatsapp-assistente.test.sql

\set QUIET 1
\pset format unaligned
\pset tuples_only on
\pset pager off

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select id as ws from public.workspaces where slug = 'producao' \gset
\set admin '00000000-0000-4000-8000-0000000001a1'
\set editor '00000000-0000-4000-8000-0000000001a2'
\set outro '00000000-0000-4000-8000-0000000001a3'
\set comfator '00000000-0000-4000-8000-0000000001a4'
\set escola '00000000-0000-4000-8000-0000000001a5'
\set inativo '00000000-0000-4000-8000-0000000001a6'
\set defora '00000000-0000-4000-8000-0000000001a7'
insert into auth.users (id, email) values
  (:'admin', 'admin.assist@teste.invalid'), (:'editor', 'editor.assist@teste.invalid'), (:'outro', 'outro.assist@teste.invalid'),
  (:'comfator', 'fator.assist@teste.invalid'), (:'escola', 'escola.assist@teste.invalid'), (:'inativo', 'inativo.assist@teste.invalid'),
  (:'defora', 'defora.assist@teste.invalid');
insert into public.profiles (id, username, full_name) values
  (:'admin', 'admin.assist', 'Admin do Assistente'), (:'editor', 'editor.assist', 'Editora do Assistente'), (:'outro', 'outro.assist', 'Outra Pessoa'),
  (:'comfator', 'fator.assist', 'Pessoa com Fator'), (:'escola', 'escola.assist', 'Pessoa da Escola'), (:'inativo', 'inativo.assist', 'Pessoa Inativa'),
  (:'defora', 'defora.assist', 'Pessoa de Fora');
update public.profiles set active = false where id = :'inativo';
insert into public.workspace_members (workspace_id, user_id, role) values
  (:'ws', :'admin', 'admin'), (:'ws', :'editor', 'editor'), (:'ws', :'outro', 'editor'), (:'ws', :'comfator', 'editor'),
  (:'ws', :'escola', 'escola'), (:'ws', :'inativo', 'editor');
insert into auth.mfa_factors (user_id, factor_type, status) values (:'comfator', 'totp', 'verified');

-- Zera também o claim.sub que a sessão simulada do WhatsApp deixa na transação (private.como_quem_escreveu_no_whatsapp).
create function pg_temp.como(p_usuario uuid, p_aal text default 'aal2') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated', 'aal', p_aal)::text, true),
         set_config('request.jwt.claim.sub', coalesce(p_usuario::text, ''), true)
$$;

-- ================================================================ privilégios

select ok(not has_table_privilege('authenticated', 'public.whatsapp_ia_planos', 'select')
          and not has_table_privilege('anon', 'public.whatsapp_ia_planos', 'select')
          and not has_table_privilege('authenticated', 'public.whatsapp_ia_planos', 'insert'), 'planos: ninguém lê nem escreve pela Data API');
select ok(not has_table_privilege('authenticated', 'public.whatsapp_ia_memoria', 'select')
          and not has_table_privilege('anon', 'public.whatsapp_ia_memoria', 'select')
          and not has_table_privilege('authenticated', 'public.whatsapp_ia_memoria', 'update'), 'memória: ninguém lê nem escreve pela Data API');
select ok(has_table_privilege('authenticated', 'public.whatsapp_ia_uso', 'select')
          and not has_table_privilege('authenticated', 'public.whatsapp_ia_uso', 'insert')
          and not has_table_privilege('anon', 'public.whatsapp_ia_uso', 'select'), 'uso: logado lê (o RLS filtra), ninguém escreve');
select ok(has_table_privilege('authenticated', 'public.whatsapp_ia_config', 'select')
          and not has_table_privilege('authenticated', 'public.whatsapp_ia_config', 'update')
          and not has_table_privilege('anon', 'public.whatsapp_ia_config', 'select'), 'config: logado lê (o RLS filtra), ninguém escreve');
select ok(not has_function_privilege('authenticated', 'public.whatsapp_votar_uma_vez(uuid, uuid, text, text, text)', 'execute')
          and not has_function_privilege('anon', 'public.whatsapp_votar_uma_vez(uuid, uuid, text, text, text)', 'execute')
          and has_function_privilege('service_role', 'public.whatsapp_votar_uma_vez(uuid, uuid, text, text, text)', 'execute'), 'voto conferido em nome de alguém: só o servidor');
select ok(not has_function_privilege('authenticated', 'public.whatsapp_mensagem_direta(uuid, uuid, uuid, text)', 'execute')
          and has_function_privilege('service_role', 'public.whatsapp_mensagem_direta(uuid, uuid, uuid, text)', 'execute'), 'mensagem direta em nome de alguém: só o servidor');
select ok(not has_function_privilege('authenticated', 'public.whatsapp_ia_tomar_vez(uuid, uuid, int)', 'execute')
          and not has_function_privilege('authenticated', 'public.whatsapp_ia_gasto_desde(uuid, timestamptz, uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.whatsapp_ia_leituras_desde(uuid, timestamptz)', 'execute')
          and not has_function_privilege('authenticated', 'public.whatsapp_hash_do_conteudo(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.whatsapp_hash_do_conteudo(uuid)', 'execute'), 'trava, somas e hash: só o servidor');
select ok(has_function_privilege('authenticated', 'public.votar_conferido(uuid, text, text, text)', 'execute')
          and not has_function_privilege('anon', 'public.votar_conferido(uuid, text, text, text)', 'execute'), 'votar_conferido: pela sessão de quem está logado');
select has_column('public', 'whatsapp_mensagens', 'enviada_em', 'registro guarda a hora em que a pessoa enviou');
select has_column('public', 'whatsapp_contas', 'nome_no_whatsapp', 'conta guarda o nome de perfil visto na confirmação');
select has_column('public', 'whatsapp_contas', 'assistente_suspenso_em', 'conta guarda a suspensão do assistente');

-- ================================================================ config e uso: só a administração lê

insert into public.whatsapp_ia_config (workspace_id, modo) values (:'ws', 'piloto');
insert into public.whatsapp_ia_uso (workspace_id, user_id, desfecho, custo_usd) values (:'ws', :'editor', 'resposta', 0.02), (:'ws', :'admin', 'plano', 0.03);
select pg_temp.como(:'editor');
set local role authenticated;
select is((select count(*)::int from public.whatsapp_ia_config), 0, 'config: quem não administra não vê');
select is((select count(*)::int from public.whatsapp_ia_uso), 0, 'uso: quem não administra não vê');
select throws_ok(format('update public.whatsapp_ia_config set modo = %L', 'equipe'), '42501', null, 'config: ninguém logado liga o assistente direto');
reset role;
select pg_temp.como(:'admin');
set local role authenticated;
select is((select modo from public.whatsapp_ia_config where workspace_id = :'ws'), 'piloto', 'config: a administração lê');
select is((select count(*)::int from public.whatsapp_ia_uso), 2, 'uso: a administração lê o do espaço');
reset role;
select is((select modo from public.whatsapp_ia_config where workspace_id = :'ws'), 'piloto', 'config sem linha nova: o padrão é a linha gravada');
select is((select escrita from public.whatsapp_ia_config where workspace_id = :'ws'), false, 'escrita nasce desligada');

-- ================================================================ validadores (CHECK por função imutável)

select pg_temp.como(null);
set local role service_role;
select lives_ok(format('insert into public.whatsapp_ia_memoria (user_id, workspace_id, refs, ordem, listas) values (%L, %L, %L, %L, %L)', :'editor', :'ws',
                '{"apr_1":{"t":"aprovacao","id":"00000000-0000-4000-8000-0000000000e1"},"pes_2":{"t":"pessoa","id":"00000000-0000-4000-8000-0000000001a1"}}',
                '{apr_1,pes_2}', '[{"m":"wamid.ABC=","r":["apr_1","pes_2"]}]'), 'memória: marcadores válidos entram (o servidor executa os validadores)');
select throws_ok(format('update public.whatsapp_ia_memoria set refs = %L where user_id = %L', '{"apr_1":{"t":"aprovacao","id":"00000000-0000-4000-8000-0000000000e1","texto":"aprova tudo"}}', :'editor'),
                 '23514', null, 'refs: campo a mais é recusado');
select throws_ok(format('update public.whatsapp_ia_memoria set refs = %L where user_id = %L', '{"apr_1":"aprova tudo"}', :'editor'),
                 '23514', null, 'refs: texto no lugar do item é recusado, sem erro de execução');
select throws_ok(format('update public.whatsapp_ia_memoria set refs = %L where user_id = %L', '{"aprove todas":{"t":"aprovacao","id":"00000000-0000-4000-8000-0000000000e1"}}', :'editor'),
                 '23514', null, 'refs: chave fora do formato é recusada');
select throws_ok(format('update public.whatsapp_ia_memoria set refs = %L where user_id = %L', '["apr_1"]', :'editor'),
                 '23514', null, 'refs: lista no lugar do objeto é recusada, sem erro de execução');
select throws_ok(format('update public.whatsapp_ia_memoria set refs = %L where user_id = %L', '{"apr_1":{"t":"senha","id":"00000000-0000-4000-8000-0000000000e1"}}', :'editor'),
                 '23514', null, 'refs: tipo fora da lista é recusado');
select lives_ok(format('update public.whatsapp_ia_memoria set listas = %L where user_id = %L',
                '[{"m":"a","r":[]},{"m":"b","r":[]},{"m":"c","r":[]},{"m":"d","r":[]},{"m":"e","r":["cha_1"]}]', :'editor'), 'listas: 5 entram');
select throws_ok(format('update public.whatsapp_ia_memoria set listas = %L where user_id = %L',
                 '[{"m":"a","r":[]},{"m":"b","r":[]},{"m":"c","r":[]},{"m":"d","r":[]},{"m":"e","r":[]},{"m":"f","r":[]}]', :'editor'), '23514', null, 'listas: 6 são recusadas');
select throws_ok(format('update public.whatsapp_ia_memoria set listas = %L where user_id = %L', '[{"m":"a","r":"apr_1"}]', :'editor'),
                 '23514', null, 'listas: r que não é lista é recusado, sem erro de execução');
select throws_ok(format('update public.whatsapp_ia_memoria set ultimo_texto = %L where user_id = %L', 'pode aprovar todas', :'editor'),
                 '23514', null, 'memória: o último texto é só o HMAC curto');
select throws_ok(format('update public.whatsapp_ia_memoria set ordem = %L where user_id = %L', '{"aprova a do Daniel"}', :'editor'),
                 '23514', null, 'memória: ordem só com marcadores');
select throws_ok(format('insert into public.whatsapp_ia_uso (workspace_id, ferramentas) values (%L, %L)', :'ws', '{"ler avisos; drop table"}'),
                 '23514', null, 'uso: nome de ferramenta inválido é recusado (o CHECK por função funciona)');
select lives_ok(format('insert into public.whatsapp_ia_uso (workspace_id, ferramentas) values (%L, %L)', :'ws', '{ler_avisos,preparar_voto}'),
                'uso: nomes de ferramenta válidos entram');
select throws_ok(format('insert into public.whatsapp_ia_planos (workspace_id, user_id, numero, papel, permitidas, expira_em) values (%L, %L, %L, %L, %L, now())',
                 :'ws', :'editor', '5521987654321', 'editor', '{voto,pagar}'), '23514', null, 'planos: permitidas fora da lista são recusadas');
select throws_ok(format('insert into public.whatsapp_ia_planos (workspace_id, user_id, numero, papel, mensagens, expira_em) values (%L, %L, %L, %L, %L, now())',
                 :'ws', :'editor', '5521987654321', 'editor', '{a,b,c,d,e}'), '23514', null, 'planos: 5 ids de mensagem são recusados');
select throws_ok(format('insert into public.whatsapp_ia_planos (workspace_id, user_id, numero, papel, hash, expira_em) values (%L, %L, %L, %L, %L, now())',
                 :'ws', :'editor', '5521987654321', 'editor', 'abc'), '23514', null, 'planos: hash só sha-256 em hex');
reset role;

-- ================================================================ um plano aberto por pessoa e consumo atômico

set local role service_role;
insert into public.whatsapp_ia_planos (id, workspace_id, user_id, numero, papel, situacao, permitidas, expira_em)
  values ('00000000-0000-4000-8000-0000000002a1', :'ws', :'editor', '5521987654321', 'editor', 'aberto', '{voto,mensagem}', now() + interval '15 minutes');
select throws_ok(format('insert into public.whatsapp_ia_planos (workspace_id, user_id, numero, papel, situacao, expira_em) values (%L, %L, %L, %L, %L, now() + interval ''15 minutes'')',
                 :'ws', :'editor', '5521987654321', 'editor', 'pergunta'), '23505', null, 'uma pergunta não abre junto de um plano aberto');
select throws_ok(format('insert into public.whatsapp_ia_planos (workspace_id, user_id, numero, papel, situacao, expira_em) values (%L, %L, %L, %L, %L, now() + interval ''15 minutes'')',
                 :'ws', :'editor', '5521987654321', 'editor', 'em_revisao'), '23505', null, 'nem um segundo plano em revisão');
select lives_ok(format('insert into public.whatsapp_ia_planos (workspace_id, user_id, numero, papel, situacao, expira_em) values (%L, %L, %L, %L, %L, now())',
                :'ws', :'editor', '5521987654321', 'editor', 'executado'), 'planos encerrados não contam no índice');
with u as (update public.whatsapp_ia_planos set situacao = 'executando' where id = '00000000-0000-4000-8000-0000000002a1' and situacao = 'aberto' and expira_em > now() returning 1)
select is((select count(*)::int from u), 1, 'o primeiro "confirmo" consome o plano');
with u as (update public.whatsapp_ia_planos set situacao = 'executando' where id = '00000000-0000-4000-8000-0000000002a1' and situacao = 'aberto' and expira_em > now() returning 1)
select is((select count(*)::int from u), 0, 'o segundo não acha mais o plano aberto');
reset role;

-- ================================================================ a vez de cada pessoa

set local role service_role;
select is(public.whatsapp_ia_tomar_vez(:'outro', :'ws', 60), true, 'a vez: a primeira mensagem toma');
select is(public.whatsapp_ia_tomar_vez(:'outro', :'ws', 60), false, 'a vez: a segunda espera');
reset role;
update public.whatsapp_ia_memoria set ocupado_ate = now() - interval '1 second' where user_id = :'outro';
set local role service_role;
select is(public.whatsapp_ia_tomar_vez(:'outro', :'ws', 60), true, 'a vez: passou o prazo, toma de novo');
reset role;

-- ================================================================ o hash do conteúdo

insert into public.content_pieces (id, workspace_id, title, subtitle, body, status) values
  ('00000000-0000-4000-8000-0000000003d1', :'ws', 'Campanha de doação', 'Outubro', 'Texto da matéria.', 'review'),
  ('00000000-0000-4000-8000-0000000003d2', :'ws', 'Balanço da ação', null, 'Outro texto.', 'review'),
  ('00000000-0000-4000-8000-0000000003d3', :'ws', 'Matéria de dois votantes', null, 'Corpo.', 'review');
set local role service_role;
select is(public.whatsapp_hash_do_conteudo('00000000-0000-4000-8000-0000000003d1'), public.whatsapp_hash_do_conteudo('00000000-0000-4000-8000-0000000003d1'), 'hash: estável');
select ok(public.whatsapp_hash_do_conteudo('00000000-0000-4000-8000-0000000003d1') ~ '^[0-9a-f]{64}$', 'hash: sha-256 em hex');
select public.whatsapp_hash_do_conteudo('00000000-0000-4000-8000-0000000003d1') as hash1 \gset
reset role;
update public.content_pieces set title = 'Campanha de doação!' where id = '00000000-0000-4000-8000-0000000003d1';
select isnt(public.whatsapp_hash_do_conteudo('00000000-0000-4000-8000-0000000003d1'), :'hash1', 'hash: muda com o título');
update public.content_pieces set title = 'Campanha de doação', subtitle = 'Novembro' where id = '00000000-0000-4000-8000-0000000003d1';
select isnt(public.whatsapp_hash_do_conteudo('00000000-0000-4000-8000-0000000003d1'), :'hash1', 'hash: muda com o subtítulo');
update public.content_pieces set subtitle = 'Outubro', body = 'Texto da matéria trocado.' where id = '00000000-0000-4000-8000-0000000003d1';
select isnt(public.whatsapp_hash_do_conteudo('00000000-0000-4000-8000-0000000003d1'), :'hash1', 'hash: muda com o corpo');
update public.content_pieces set body = 'Texto da matéria.' where id = '00000000-0000-4000-8000-0000000003d1';
select is(public.whatsapp_hash_do_conteudo('00000000-0000-4000-8000-0000000003d1'), :'hash1', 'hash: o mesmo conteúdo dá o mesmo hash');

-- ================================================================ whatsapp_votar_uma_vez

insert into public.approvals (id, workspace_id, content_id, requested_by) values
  ('00000000-0000-4000-8000-0000000003e1', :'ws', '00000000-0000-4000-8000-0000000003d1', :'admin'),
  ('00000000-0000-4000-8000-0000000003e2', :'ws', '00000000-0000-4000-8000-0000000003d2', :'admin'),
  ('00000000-0000-4000-8000-0000000003e3', :'ws', '00000000-0000-4000-8000-0000000003d3', :'admin');
insert into public.approval_voters (workspace_id, approval_id, user_id) values
  (:'ws', '00000000-0000-4000-8000-0000000003e1', :'editor'), (:'ws', '00000000-0000-4000-8000-0000000003e1', :'outro'),
  (:'ws', '00000000-0000-4000-8000-0000000003e2', :'editor'), (:'ws', '00000000-0000-4000-8000-0000000003e2', :'comfator'),
  (:'ws', '00000000-0000-4000-8000-0000000003e3', :'editor'), (:'ws', '00000000-0000-4000-8000-0000000003e3', :'outro');
select public.whatsapp_hash_do_conteudo('00000000-0000-4000-8000-0000000003d2') as hash2 \gset
select public.whatsapp_hash_do_conteudo('00000000-0000-4000-8000-0000000003d3') as hash3 \gset

set local role service_role;
select throws_ok(format('select public.whatsapp_votar_uma_vez(%L, %L, %L, %L, %L)', :'editor', '00000000-0000-4000-8000-0000000003e1', 'approved', '', repeat('0', 64)),
                 'WA002', 'A matéria mudou depois do plano.', 'hash diferente: WA002');
reset role;
select is((select decision from public.approval_voters where approval_id = '00000000-0000-4000-8000-0000000003e1' and user_id = :'editor'), 'pending', 'e o voto continua pendente');
set local role service_role;
select is(public.whatsapp_votar_uma_vez(:'editor', '00000000-0000-4000-8000-0000000003e1', 'approved', 'Conferido pelo WhatsApp (teste).', :'hash1'), 'pending',
          'caso feliz: o voto entra (a rodada espera o outro votante)');
select throws_ok(format('select public.whatsapp_votar_uma_vez(%L, %L, %L, %L, %L)', :'editor', '00000000-0000-4000-8000-0000000003e1', 'changes_requested', 'mudar tudo', :'hash1'),
                 'WA001', 'Você já votou nesta rodada.', 'a segunda chamada: WA001');
reset role;
select is((select decision from public.approval_voters where approval_id = '00000000-0000-4000-8000-0000000003e1' and user_id = :'editor'), 'approved', 'e não sobrescreve o voto');

-- O voto dado na tela entre o plano e o "confirmo".
update public.approval_voters set decision = 'changes_requested', decided_at = now() where approval_id = '00000000-0000-4000-8000-0000000003e3' and user_id = :'editor';
set local role service_role;
select throws_ok(format('select public.whatsapp_votar_uma_vez(%L, %L, %L, %L, %L)', :'editor', '00000000-0000-4000-8000-0000000003e3', 'approved', '', :'hash3'),
                 'WA001', null, 'voto prévio pela tela: WA001');
reset role;
select is((select decision from public.approval_voters where approval_id = '00000000-0000-4000-8000-0000000003e3' and user_id = :'editor'), 'changes_requested', 'o voto da tela fica');

set local role service_role;
select throws_ok(format('select public.whatsapp_votar_uma_vez(%L, %L, %L, %L, %L)', :'comfator', '00000000-0000-4000-8000-0000000003e2', 'approved', '', :'hash2'),
                 '42501', null, 'quem tem a verificação em duas etapas: 42501 (vota pelo Palácio)');
select throws_ok(format('select public.whatsapp_votar_uma_vez(%L, %L, %L, %L, %L)', :'defora', '00000000-0000-4000-8000-0000000003e2', 'approved', '', :'hash2'),
                 '42501', null, 'quem não é do espaço: 42501');
select is(public.whatsapp_votar_uma_vez(:'editor', '00000000-0000-4000-8000-0000000003e2', 'changes_requested', 'Falta a foto de capa.', :'hash2'), 'changes_requested',
          'pedir ajustes encerra a rodada');
select throws_ok(format('select public.whatsapp_votar_uma_vez(%L, %L, %L, %L, %L)', :'comfator', '00000000-0000-4000-8000-0000000003e2', 'approved', '', :'hash2'),
                 'WA003', 'Esta rodada já foi encerrada.', 'rodada encerrada: WA003');
reset role;

-- ================================================================ votar_conferido (pela sessão real)

insert into public.content_pieces (id, workspace_id, title, status) values ('00000000-0000-4000-8000-0000000003d4', :'ws', 'Matéria da sessão', 'review');
insert into public.approvals (id, workspace_id, content_id, requested_by) values ('00000000-0000-4000-8000-0000000003e4', :'ws', '00000000-0000-4000-8000-0000000003d4', :'admin');
insert into public.approval_voters (workspace_id, approval_id, user_id) values (:'ws', '00000000-0000-4000-8000-0000000003e4', :'comfator');
select public.whatsapp_hash_do_conteudo('00000000-0000-4000-8000-0000000003d4') as hash4 \gset
select pg_temp.como(:'comfator', 'aal1');
set local role authenticated;
select throws_ok(format('select public.votar_conferido(%L, %L, %L, %L)', '00000000-0000-4000-8000-0000000003e4', 'approved', '', :'hash4'),
                 '42501', null, 'votar_conferido: sessão aal1 de quem tem fator verificado é recusada');
reset role;
select pg_temp.como(:'comfator', 'aal2');
set local role authenticated;
select is(public.votar_conferido('00000000-0000-4000-8000-0000000003e4', 'approved', 'Conferido no Palácio (teste).', :'hash4'), 'approved', 'votar_conferido: com aal2, o voto entra');
reset role;
select is((select decision from public.approval_voters where approval_id = '00000000-0000-4000-8000-0000000003e4' and user_id = :'comfator'), 'approved', 'com o nome de quem estava na sessão');
select pg_temp.como(null);

-- ================================================================ whatsapp_mensagem_direta

set local role service_role;
select throws_ok(format('select public.whatsapp_mensagem_direta(%L, %L, %L, %L)', :'editor', :'ws', :'defora', 'Oi'), 'P0001', 'Essa pessoa não está mais no espaço.', 'mensagem: destinatário de fora é recusado');
select throws_ok(format('select public.whatsapp_mensagem_direta(%L, %L, %L, %L)', :'editor', :'ws', :'inativo', 'Oi'), 'P0001', 'Essa pessoa não está mais no espaço.', 'mensagem: destinatário inativo é recusado');
select throws_ok(format('select public.whatsapp_mensagem_direta(%L, %L, %L, %L)', :'editor', :'ws', :'editor', 'Oi'), 'P0001', null, 'mensagem: para a própria pessoa é recusada');
select throws_ok(format('select public.whatsapp_mensagem_direta(%L, %L, %L, %L)', :'escola', :'ws', :'editor', 'Oi'), '42501', null, 'mensagem: papel escola é recusado');
select throws_ok(format('select public.whatsapp_mensagem_direta(%L, %L, %L, %L)', :'comfator', :'ws', :'editor', 'Oi'), '42501', null, 'mensagem: quem tem fator verificado é recusado');
select throws_ok(format('select public.whatsapp_mensagem_direta(%L, %L, %L, %L)', :'editor', :'ws', :'outro', '   '), 'P0001', null, 'mensagem: corpo vazio é recusado');
select throws_ok(format('select public.whatsapp_mensagem_direta(%L, %L, %L, %L)', :'editor', :'ws', :'outro', repeat('a', 2001)), 'P0001', null, 'mensagem: 2.001 caracteres são recusados');
select is((public.whatsapp_mensagem_direta(:'editor', :'ws', :'outro', 'Aprovei as duas matérias.') ->> 'nova')::boolean, true, 'mensagem: o caso feliz é nova');
select is((public.whatsapp_mensagem_direta(:'editor', :'ws', :'outro', 'Aprovei as duas matérias.') ->> 'nova')::boolean, false, 'mensagem: a mesma em 10 s não repete');
reset role;
select is((select count(*)::int from public.messages where author_id = :'editor' and recipient_id = :'outro' and body = 'Aprovei as duas matérias.'), 1, 'mensagem: uma linha só, com o nome de quem escreveu');

-- ================================================================ as somas

set local role service_role;
select is(public.whatsapp_ia_gasto_desde(:'ws', now() - interval '1 day'), 0.05::numeric, 'gasto do espaço desde a meia-noite');
select is(public.whatsapp_ia_gasto_desde(:'ws', now() - interval '1 day', :'editor'), 0.02::numeric, 'gasto de uma pessoa (o teto dela vale só para ela)');
select is(public.whatsapp_ia_gasto_desde(:'ws', now() + interval '1 day'), 0::numeric, 'sem uso no período: zero');
select is(public.whatsapp_ia_leituras_desde(:'editor', now() - interval '1 day'), 0, 'leituras de detalhe: zero sem uso');
reset role;

select * from finish();
rollback;
