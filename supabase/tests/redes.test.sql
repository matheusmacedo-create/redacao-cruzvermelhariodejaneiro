-- Testes das redes sociais e da foto na inscrição pública
-- (supabase/migrations/20261002120000_cvrj_redes_e_foto_na_inscricao.sql).
-- Mesmas regras de supabase/tests/auditoria.test.sql: só em banco local, numa transação desfeita no fim.
--
--   psql -v ON_ERROR_STOP=1 -d redacao_local < supabase/tests/redes.test.sql

\set QUIET 1
\pset format unaligned
\pset tuples_only on
\pset pager off

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select id as ws from public.workspaces where slug = 'producao' \gset
\set gestor '00000000-0000-4000-8000-0000000000e2'
insert into auth.users (id, email) values (:'gestor', 'gestor.redes@teste.invalid');
insert into public.profiles (id, username, full_name) values (:'gestor', 'gestor.redes', 'Gil Gestor');
insert into public.workspace_members (workspace_id, user_id, role) values (:'ws', :'gestor', 'editor');
insert into public.participantes_acesso (workspace_id, user_id, nivel) values (:'ws', :'gestor', 'gerenciar');
create function pg_temp.como(p_usuario uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated', 'aal', 'aal2')::text, true)
$$;

-- ================================================================ privilégios

select ok(has_column_privilege('authenticated', 'public.participantes', 'redes', 'select'), 'as redes saem na ficha');
select ok(not has_table_privilege('anon', 'public.participantes', 'select'), 'anon não lê o cadastro');
select ok(has_function_privilege('service_role', 'public.definir_foto_na_inscricao(uuid, text)', 'execute')
          and not has_function_privilege('authenticated', 'public.definir_foto_na_inscricao(uuid, text)', 'execute')
          and not has_function_privilege('anon', 'public.definir_foto_na_inscricao(uuid, text)', 'execute'), 'a foto da inscrição: só o servidor');

-- ================================================================ a inscrição pública

select public.inscrever_participante(:'ws', jsonb_build_object('nome', 'Rede Teste', 'email', 'rede@teste.invalid', 'data_nascimento', '1990-01-01', 'consentimento', true,
  'redes', jsonb_build_object('instagram', 'https://www.instagram.com/rede.teste', 'tiktok', 'https://www.tiktok.com/@x', 'outro', '  ', 'linkedin', 'https://www.linkedin.com/in/rede-teste')),
  'ip-teste', '2026-10-v1') as c1 \gset
select is((select redes from public.participantes where id = :'c1'),
  '{"instagram": "https://www.instagram.com/rede.teste", "linkedin": "https://www.linkedin.com/in/rede-teste"}'::jsonb,
  'a inscrição guarda só as redes conhecidas e preenchidas');
select is((select redes from public.participantes where id = :'c1')->>'tiktok', null, 'chave desconhecida é ignorada');

select throws_ok(format($f$select public.inscrever_participante(%L, %L::jsonb, 'ip-teste', 'v')$f$, :'ws',
  '{"nome":"Sem Link","email":"semlink@teste.invalid","data_nascimento":"1990-01-01","consentimento":true,"redes":{"instagram":"javascript:alert(1)"}}'),
  'P0001', 'Link de rede social inválido.', 'link que não é http(s) é recusado');
select throws_ok(format($f$select public.inscrever_participante(%L, %L::jsonb, 'ip-teste', 'v')$f$, :'ws',
  '{"nome":"Sem Link","email":"semlink2@teste.invalid","data_nascimento":"1990-01-01","consentimento":true,"redes":{"instagram":"https://semponto/x"}}'),
  'P0001', 'Link de rede social inválido.', 'link sem domínio é recusado');
select throws_ok(format($f$select public.inscrever_participante(%L, %L::jsonb, 'ip-teste', 'v')$f$, :'ws',
  '{"nome":"Sem Link","email":"semlink3@teste.invalid","data_nascimento":"1990-01-01","consentimento":true,"redes":"@fulana"}'),
  'P0001', 'Redes sociais inválidas.', 'redes que não são objeto são recusadas');
select public.inscrever_participante(:'ws', '{"nome":"Sem Rede","email":"semrede@teste.invalid","data_nascimento":"1990-01-01","consentimento":true}'::jsonb, 'ip-teste', 'v') as c2 \gset
select is((select redes from public.participantes where id = :'c2'), '{}'::jsonb, 'sem redes no formulário, fica o objeto vazio');

-- ================================================================ a foto da inscrição

\set caminho_ok 'voluntarios/' :ws '/' :c1 '/5c6e0d4a-0d1f-4b2b-9c3e-7a8f9e0d1c2b.jpg'
select throws_ok(format('select public.definir_foto_na_inscricao(%L, %L)', :'c1', 'voluntarios/outro/caminho.jpg'), 'P0001', 'Foto inválida.', 'caminho fora da pasta da pessoa é recusado');
select throws_ok(format('select public.definir_foto_na_inscricao(%L, null)', :'c1'), 'P0001', 'Foto inválida.', 'sem caminho é recusado');
select lives_ok(format('select public.definir_foto_na_inscricao(%L, %L)', :'c1', :'caminho_ok'), 'a foto do candidato recém-inscrito entra');
select is((select foto_path from public.participantes where id = :'c1'), :'caminho_ok', 'o caminho ficou no cadastro');
select is((select count(*) from public.participantes_auditoria where participante_id = :'c1' and acao = 'foto_pela_inscricao'), 1::bigint, 'a foto fica na auditoria');
select is((select foto_cracha_path from public.participantes where id = :'c1'), null, 'a foto entra "aguardando" para o crachá, não aprovada');
select throws_ok(format('select public.definir_foto_na_inscricao(%L, %L)', :'c1', :'caminho_ok'), 'P0001', 'Cadastro indisponível para receber a foto.', 'quem já tem foto não recebe outra por aqui');

-- Inscrito há mais de 30 minutos: a janela fechou.
update public.participantes set created_at = now() - interval '31 minutes' where id = :'c2';
\set caminho_c2 'voluntarios/' :ws '/' :c2 '/5c6e0d4a-0d1f-4b2b-9c3e-7a8f9e0d1c2c.jpg'
select throws_ok(format('select public.definir_foto_na_inscricao(%L, %L)', :'c2', :'caminho_c2'), 'P0001', 'Cadastro indisponível para receber a foto.', 'inscrição antiga não recebe foto por aqui');

-- Cadastro feito pela equipe (ativo, origem cadastro): nunca.
insert into public.participantes (workspace_id, vinculo, nome, situacao, origem) values (:'ws', 'voluntario', 'Vera Veterana', 'ativo', 'cadastro') returning id as v1 \gset
\set caminho_v1 'voluntarios/' :ws '/' :v1 '/5c6e0d4a-0d1f-4b2b-9c3e-7a8f9e0d1c2d.jpg'
select throws_ok(format('select public.definir_foto_na_inscricao(%L, %L)', :'v1', :'caminho_v1'), 'P0001', 'Cadastro indisponível para receber a foto.', 'cadastro da equipe não recebe foto por aqui');

-- ================================================================ a equipe e o voluntário editam

select pg_temp.como(:'gestor');
select lives_ok(format('select public.salvar_participante(%L, %L, %L::jsonb)', :'ws', :'c1', '{"telefone":"21999990000"}'), 'editar sem o campo redes');
select is((select redes->>'instagram' from public.participantes where id = :'c1'), 'https://www.instagram.com/rede.teste', 'sem o campo, as redes ficam como estavam');
select lives_ok(format('select public.salvar_participante(%L, %L, %L::jsonb)', :'ws', :'c1', '{"redes":{"outro":"https://rede.teste.br/portfolio"}}'), 'a equipe troca as redes');
select is((select redes from public.participantes where id = :'c1'), '{"outro": "https://rede.teste.br/portfolio"}'::jsonb, 'as redes viraram o que a equipe mandou (o resto saiu)');
select throws_ok(format('select public.salvar_participante(%L, %L, %L::jsonb)', :'ws', :'c1', '{"redes":{"outro":"ftp://x.com/a"}}'), 'P0001', 'Link de rede social inválido.', 'a equipe também não grava link inválido');
select lives_ok(format('select public.salvar_participante(%L, %L, %L::jsonb)', :'ws', :'c1', '{"redes":{}}'), 'a equipe limpa as redes');
select is((select redes from public.participantes where id = :'c1'), '{}'::jsonb, 'limpou');
reset request.jwt.claims;

select lives_ok(format('select public.membro_atualizar_perfil(%L, %L::jsonb)', :'v1', '{"redes":{"linkedin":"https://www.linkedin.com/in/vera"},"nome":"Hacker"}'), 'o voluntário atualiza as próprias redes');
select is((select redes->>'linkedin' from public.participantes where id = :'v1'), 'https://www.linkedin.com/in/vera', 'as redes do voluntário ficaram');
select is((select nome from public.participantes where id = :'v1'), 'Vera Veterana', 'o nome continua fora do que o voluntário muda');

-- ================================================================ anonimizar limpa

update public.participantes set anonimizado_em = now() where id = :'c1';
select is((select redes from public.participantes where id = :'c1'), '{}'::jsonb, 'anonimizar limpa as redes');
select is((select foto_path from public.participantes where id = :'c1'), null, 'anonimizar continua limpando a foto');

select * from finish();
rollback;
