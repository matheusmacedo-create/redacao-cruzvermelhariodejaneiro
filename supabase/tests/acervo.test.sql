-- Testes do catálogo do acervo (supabase/migrations/20260926003000_cvrj_acervo.sql). Mesmas regras
-- de supabase/tests/auditoria.test.sql: só em banco local, numa transação desfeita no fim.
--
--   psql -v ON_ERROR_STOP=1 -d redacao_local < supabase/tests/acervo.test.sql

\set QUIET 1
\pset format unaligned
\pset tuples_only on
\pset pager off

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select id as ws from public.workspaces where slug = 'producao' \gset
\set editor '00000000-0000-4000-8000-0000000000e7'
\set fora '00000000-0000-4000-8000-0000000000f7'
\set escola '00000000-0000-4000-8000-0000000000e8'
\set inativo '00000000-0000-4000-8000-0000000000e9'
insert into auth.users (id, email) values (:'editor', 'editor.acervo@teste.invalid'), (:'fora', 'fora.acervo@teste.invalid'),
  (:'escola', 'escola.acervo@teste.invalid'), (:'inativo', 'inativo.acervo@teste.invalid');
insert into public.profiles (id, username, full_name) values (:'editor', 'editor.acervo', 'Pessoa Editora'), (:'fora', 'fora.acervo', 'Pessoa de Fora'),
  (:'escola', 'escola.acervo', 'Pessoa da Escola'), (:'inativo', 'inativo.acervo', 'Pessoa Desligada');
update public.profiles set active = false where id = :'inativo';
insert into public.workspace_members (workspace_id, user_id, role) values (:'ws', :'editor', 'editor'), (:'ws', :'escola', 'escola'), (:'ws', :'inativo', 'colaborador');

create function pg_temp.como(p_usuario uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated', 'aal', 'aal2')::text, true)
$$;

-- ================================================================ privilégios

select ok(has_table_privilege('authenticated', 'public.acervo_itens', 'select'), 'quem está logado lê (o RLS filtra)');
select ok(not has_table_privilege('authenticated', 'public.acervo_itens', 'insert')
          and not has_table_privilege('authenticated', 'public.acervo_itens', 'update')
          and not has_table_privilege('authenticated', 'public.acervo_itens', 'delete'), 'ninguém logado escreve direto');
select ok(not has_table_privilege('anon', 'public.acervo_itens', 'select'), 'anon não lê o catálogo');

-- ================================================================ ficha

insert into public.acervo_itens (workspace_id, colecao, titulo, chave_r2, tipo_mime, tamanho)
values (:'ws', 'fotos', 'Curso de primeiros socorros na sede', 'entrada/redacao/a/foto.jpg', 'image/jpeg', 1000)
returning id as foto \gset
select is((select visibilidade from public.acervo_itens where id = :'foto'), 'privado', 'entra privado');
select throws_ok(format('insert into public.acervo_itens (workspace_id, colecao, titulo) values (%L, %L, %L)', :'ws', 'quadros', 'Coleção que não existe'),
                 '23514', null, 'coleção fora da lista é recusada');
select throws_ok(format('insert into public.acervo_itens (workspace_id, colecao, titulo, slug) values (%L, %L, %L, %L)', :'ws', 'fotos', 'Página', 'pagina'),
                 '23514', null, '"pagina" não serve de endereço (é a paginação)');
select throws_ok(format('insert into public.acervo_itens (workspace_id, colecao, titulo, chave_r2) values (%L, %L, %L, %L)', :'ws', 'fotos', 'Fuga', '../fora.jpg'),
                 '23514', null, 'chave com .. é recusada');
select throws_ok(format('insert into public.acervo_itens (workspace_id, colecao, titulo, chave_r2) values (%L, %L, %L, %L)', :'ws', 'documentos', 'Outra ficha', 'entrada/redacao/a/foto.jpg'),
                 '23505', null, 'o mesmo arquivo não entra duas vezes no catálogo');
select throws_ok(format('update public.acervo_itens set visibilidade = %L where id = %L', 'publico', :'foto'),
                 '23514', null, 'público precisa de endereço e data de publicação');

-- ================================================================ leitura (RLS)

select pg_temp.como(:'editor');
set local role authenticated;
select is((select count(*)::integer from public.acervo_itens where id = :'foto'), 1, 'quem é do espaço vê o item privado');
reset role;
select pg_temp.como(:'fora');
set local role authenticated;
select is((select count(*)::integer from public.acervo_itens), 0, 'quem não é do espaço não vê nada');
reset role;
select pg_temp.como(:'escola');
set local role authenticated;
select is((select count(*)::integer from public.acervo_itens), 0, 'a equipe da escola não vê o acervo (só enxerga a Escola)');
reset role;
select pg_temp.como(:'inativo');
set local role authenticated;
select is((select count(*)::integer from public.acervo_itens), 0, 'perfil desativado não vê nada');
reset role;

-- ================================================================ endereço permanente

update public.acervo_itens set visibilidade = 'publico', slug = 'curso-de-primeiros-socorros-na-sede', publicado_em = now() where id = :'foto';
select is((select slug from public.acervo_itens where id = :'foto'), 'curso-de-primeiros-socorros-na-sede', 'publicado, com endereço');
select throws_ok(format('update public.acervo_itens set slug = %L where id = %L', 'outro-endereco', :'foto'), 'P0001', null, 'o slug não muda depois de ir ao ar');
select throws_ok(format('update public.acervo_itens set colecao = %L where id = %L', 'historia', :'foto'), 'P0001', null, 'a coleção não muda depois de ir ao ar');
select throws_ok(format('update public.acervo_itens set publicado_em = now() + interval ''1 day'' where id = %L', :'foto'), 'P0001', null, 'a data da primeira publicação não muda');
select lives_ok(format('update public.acervo_itens set titulo = %L, descricao = %L where id = %L', 'Curso de primeiros socorros', 'Turma de sábado.', :'foto'),
                'a ficha continua editável');
select throws_ok(format('delete from public.acervo_itens where id = %L', :'foto'), 'P0001', null, 'item no ar não se apaga');
insert into public.acervo_itens (workspace_id, colecao, titulo, visibilidade, slug, publicado_em)
values (:'ws', 'documentos', 'Outro com o mesmo endereço', 'publico', 'curso-de-primeiros-socorros-na-sede', now());
select pass('o mesmo slug vale em outra coleção');
select throws_ok(format('insert into public.acervo_itens (workspace_id, colecao, titulo, visibilidade, slug, publicado_em) values (%L, %L, %L, %L, %L, now())',
                        :'ws', 'fotos', 'Repetido', 'publico', 'curso-de-primeiros-socorros-na-sede'),
                 '23505', null, 'endereço repetido na mesma coleção é recusado');
update public.acervo_itens set visibilidade = 'privado' where id = :'foto';
select is((select slug from public.acervo_itens where id = :'foto'), 'curso-de-primeiros-socorros-na-sede', 'fora do site, guarda o endereço para voltar igual');
select lives_ok(format('delete from public.acervo_itens where id = %L', :'foto'), 'privado pode ser apagado do catálogo');

select * from finish();
rollback;
