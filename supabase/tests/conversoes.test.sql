-- Testes do aviso à Meta dos pagamentos da Escola (supabase/migrations/20261002150000_cvrj_escola_conversoes_meta.sql
-- e 20261004170000_cvrj_escola_conversoes_contas.sql, a escolha das contas que mandam).
-- Mesmas regras de supabase/tests/auditoria.test.sql: só em banco local, numa transação desfeita no fim.
--
--   psql -v ON_ERROR_STOP=1 -d redacao_local < supabase/tests/conversoes.test.sql

\set QUIET 1
\pset format unaligned
\pset tuples_only on
\pset pager off

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select id as ws from public.workspaces where slug = 'producao' \gset
\set admin '00000000-0000-4000-8000-0000000000f1'
\set editor '00000000-0000-4000-8000-0000000000f2'
insert into auth.users (id, email) values (:'admin', 'admin.conv@teste.invalid'), (:'editor', 'editor.conv@teste.invalid');
insert into public.profiles (id, username, full_name) values (:'admin', 'admin.conv', 'Ana Admin'), (:'editor', 'editor.conv', 'Edu Editor');
insert into public.workspace_members (workspace_id, user_id, role) values (:'ws', :'admin', 'admin'), (:'ws', :'editor', 'editor');
create function pg_temp.como(p_usuario uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated', 'aal', 'aal2')::text, true)
$$;
insert into public.escola_contas (workspace_id, nome) values (:'ws', 'Escola — teste') returning id as conta \gset
insert into public.escola_cursos (workspace_id, nome) values (:'ws', 'Curso de Teste das Conversões') returning id as curso \gset
select id as ws_outro from public.workspaces where slug = 'demonstracao' \gset
insert into public.escola_contas (workspace_id, nome) values (:'ws_outro', 'Escola de outro espaço — teste') returning id as conta_outra \gset

-- ================================================================ privilégios

select ok(not has_table_privilege('anon', 'public.escola_conversoes', 'select') and not has_table_privilege('anon', 'public.escola_conversoes_envios', 'select'), 'anon não lê nada');
select ok(not has_table_privilege('authenticated', 'public.escola_conversoes', 'insert') and not has_table_privilege('authenticated', 'public.escola_conversoes_envios', 'update'), 'ninguém logado escreve direto');
select ok(not has_function_privilege('authenticated', 'public.escola_conversoes_registrar(uuid, uuid, jsonb, text)', 'execute')
          and not has_function_privilege('authenticated', 'public.escola_conversoes_pendentes(uuid, text[], integer)', 'execute'), 'registrar e pendentes: só o servidor');
select ok(has_function_privilege('service_role', 'public.escola_conversoes_registrar(uuid, uuid, jsonb, text)', 'execute')
          and has_function_privilege('service_role', 'public.escola_conversoes_pendentes(uuid, text[], integer)', 'execute'), 'o servidor executa as duas');

-- ================================================================ ligar o pixel

select pg_temp.como(:'editor');
select throws_ok(format('select public.escola_conversoes_salvar(%L, %L::jsonb)', :'ws', '{"pixel_id":"1234567890"}'), 'P0001', 'Só um admin liga o pixel da Meta.', 'editor não liga');
select pg_temp.como(:'admin');
select throws_ok(format('select public.escola_conversoes_salvar(%L, %L::jsonb)', :'ws', '{"pixel_id":"act_123"}'), 'P0001',
  'O ID do pixel (conjunto de dados) é um número. Ele aparece no Gerenciador de Eventos, abaixo do nome.', 'pixel que não é número é recusado');
select throws_ok(format('select public.escola_conversoes_salvar(%L, %L::jsonb)', :'ws', '{"pixel_id":"1234567890","pagina_padrao":"http://inseguro"}'), 'P0001',
  'A página padrão precisa começar com https://.', 'página sem https é recusada');
-- As contas que mandam: nenhuma sem ser marcada, só do mesmo espaço, sem repetição.
select throws_ok(format('select public.escola_conversoes_salvar(%L, %L::jsonb)', :'ws', '{"pixel_id":"1234567890"}'), 'P0001',
  'Marque ao menos uma conta da Únicopag para enviar à Meta.', 'ligado sem conta é recusado');
select throws_ok(format('select public.escola_conversoes_salvar(%L, %L::jsonb)', :'ws', '{"pixel_id":"1234567890","contas":[]}'), 'P0001',
  'Marque ao menos uma conta da Únicopag para enviar à Meta.', 'ligado com a lista vazia é recusado');
select throws_ok(format('select public.escola_conversoes_salvar(%L, %L::jsonb)', :'ws', json_build_object('pixel_id', '1234567890', 'contas', json_build_array(:'conta_outra'))), 'P0001',
  'Conta da Únicopag não encontrada neste espaço.', 'conta de outro espaço é recusada');
select throws_ok(format('select public.escola_conversoes_salvar(%L, %L::jsonb)', :'ws', '{"pixel_id":"1234567890","contas":["não é uuid"]}'), 'P0001',
  'Conta da Únicopag inválida.', 'id que não é uuid é recusado');
select throws_ok(format('select public.escola_conversoes_salvar(%L, %L::jsonb)', :'ws', '{"pixel_id":"1234567890","contas":"x"}'), 'P0001',
  'A lista de contas da Únicopag veio num formato inválido.', 'contas que não é lista é recusado');
select is((select count(*) from public.escola_conversoes where workspace_id = :'ws'), 0::bigint, 'nada gravado nas recusas');
select lives_ok(format('select public.escola_conversoes_salvar(%L, %L::jsonb)', :'ws', json_build_object('pixel_id', ' 1234567890 ', 'pagina_padrao', 'https://escola.exemplo.org/', 'contas', json_build_array(:'conta', :'conta'))), 'admin liga o pixel com a conta certa');
select is((select pixel_id || '|' || pagina_padrao || '|' || ativa::text from public.escola_conversoes where workspace_id = :'ws'), '1234567890|https://escola.exemplo.org/|true', 'configuração gravada');
select is((select contas from public.escola_conversoes where workspace_id = :'ws'), array[:'conta'::uuid], 'a conta marcada, sem repetição');
select lives_ok(format('select public.escola_conversoes_salvar(%L, %L::jsonb)', :'ws', '{"pixel_id":"1234567890","ativa":false}'), 'admin pausa o pixel');
select is((select ativa from public.escola_conversoes where workspace_id = :'ws'), false, 'pausado');
select is((select count(*) from public.escola_conversoes where workspace_id = :'ws'), 1::bigint, 'uma configuração por espaço');
select is((select count(*) from public.escola_conversoes), 1::bigint, 'o editor (marketing 2) vê a configuração pelo RLS');
reset request.jwt.claims;

-- ================================================================ registrar envios

\set envios '[{"hash":"h1","categoria":"taxa_de_inscricao","curso_id":"' :curso '","curso":"Curso de Teste das Conversões","valor":15000,"paga_em":"2026-10-01T10:00:00Z","qualidade":"boa","enviado_em":"2026-10-02T09:00:00Z","rastro":"AbC","erro":null},{"hash":"h2","categoria":"curso","curso_id":null,"curso":"Matrícula","valor":90000,"paga_em":"2026-10-01T11:00:00Z","qualidade":"fraca","enviado_em":null,"rastro":null,"erro":"O Meta respondeu 500."}]'
select is(public.escola_conversoes_registrar(:'ws', :'conta', :'envios'::jsonb, null), 2, 'dois registros gravados');
select is((select enviado_em is not null and rastro = 'AbC' and erro is null and tentativas = 1 from public.escola_conversoes_envios where conta_id = :'conta' and hash = 'h1'), true, 'h1 enviado');
select is((select enviado_em is null and erro = 'O Meta respondeu 500.' and tentativas = 1 from public.escola_conversoes_envios where conta_id = :'conta' and hash = 'h2'), true, 'h2 falhou');
select is((select enviada_em is not null and erro is null from public.escola_conversoes where workspace_id = :'ws'), true, 'a configuração registra a última leitura sem erro');

-- Pendentes: h1 já foi; h2 falhou uma vez (volta); h3 nunca foi.
select is(public.escola_conversoes_pendentes(:'conta', array['h1','h2','h3'], 5), array['h2','h3'], 'pendentes: só o que falhou pouco e o novo');

-- Nova leitura: h2 falha de novo (tentativa 2), h1 "reenviado" não muda.
\set envios2 '[{"hash":"h1","categoria":"curso","curso_id":null,"curso":"outro","valor":1,"paga_em":"2026-10-01T10:00:00Z","qualidade":"nenhuma","enviado_em":"2026-10-02T10:00:00Z","rastro":"Zzz","erro":null},{"hash":"h2","categoria":"curso","curso_id":null,"curso":"Matrícula","valor":90000,"paga_em":"2026-10-01T11:00:00Z","qualidade":"fraca","enviado_em":null,"rastro":null,"erro":"O Meta respondeu 500."}]'
select is(public.escola_conversoes_registrar(:'ws', :'conta', :'envios2'::jsonb, 'O Meta respondeu 500.'), 1, 'só o que ainda não foi enviado muda');
select is((select rastro || '|' || categoria || '|' || valor::text from public.escola_conversoes_envios where conta_id = :'conta' and hash = 'h1'), 'AbC|taxa_de_inscricao|15000', 'o enviado não é sobrescrito');
select is((select tentativas from public.escola_conversoes_envios where conta_id = :'conta' and hash = 'h2'), 2, 'a falha soma uma tentativa');
select is((select erro from public.escola_conversoes where workspace_id = :'ws'), 'O Meta respondeu 500.', 'o erro da leitura fica na configuração');

-- Depois de 5 tentativas, desiste.
update public.escola_conversoes_envios set tentativas = 5 where conta_id = :'conta' and hash = 'h2';
select is(public.escola_conversoes_pendentes(:'conta', array['h1','h2','h3'], 5), array['h3'], 'quem falhou 5 vezes sai da fila');

-- Enfim enviado: a data entra, o erro sai.
\set envios3 '[{"hash":"h2","categoria":"curso","curso_id":null,"curso":"Matrícula","valor":90000,"paga_em":"2026-10-01T11:00:00Z","qualidade":"fraca","enviado_em":"2026-10-03T09:00:00Z","rastro":"Ok1","erro":null}]'
select is(public.escola_conversoes_registrar(:'ws', :'conta', :'envios3'::jsonb, null), 1, 'h2 enviado depois');
select is((select enviado_em is not null and erro is null and rastro = 'Ok1' from public.escola_conversoes_envios where conta_id = :'conta' and hash = 'h2'), true, 'h2 marcado como enviado, sem erro');

select throws_ok(format('select public.escola_conversoes_registrar(%L, %L, null, null)', :'ws', '00000000-0000-4000-8000-000000000099'), 'P0001', 'Conta não encontrada.', 'conta de outro espaço é recusada');

-- Sem dado pessoal no registro.
select ok(not exists (select 1 from information_schema.columns where table_name = 'escola_conversoes_envios' and column_name in ('email', 'telefone', 'cliente', 'documento', 'nome')), 'a tabela de envios não tem coluna de pessoa');

-- ================================================================ desligar

select pg_temp.como(:'editor');
select throws_ok(format('select public.escola_conversoes_excluir(%L)', :'ws'), 'P0001', 'Só um admin desliga o pixel da Meta.', 'editor não desliga');
select pg_temp.como(:'admin');
select lives_ok(format('select public.escola_conversoes_excluir(%L)', :'ws'), 'admin desliga');
select is((select count(*) from public.escola_conversoes where workspace_id = :'ws'), 0::bigint, 'configuração saiu');
select is((select count(*) from public.escola_conversoes_envios where workspace_id = :'ws'), 2::bigint, 'o histórico de envios fica');
reset request.jwt.claims;

select * from finish();
rollback;
