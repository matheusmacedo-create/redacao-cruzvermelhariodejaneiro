-- Testes dos veículos, dos campos novos do contato, das listas e da importação da fase 1 da Imprensa
-- (supabase/migrations/20261110100000_cvrj_veiculos_e_listas.sql).
-- Mesmas regras de supabase/tests/auditoria.test.sql: só em banco local, numa transação desfeita no fim.
--
--   psql -v ON_ERROR_STOP=1 -d redacao_local < supabase/tests/veiculos-e-listas.test.sql

\set QUIET 1
\pset format unaligned
\pset tuples_only on
\pset pager off

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select id as ws from public.workspaces where slug = 'producao' \gset
insert into public.workspaces (name, slug, kind) values ('Outro espaço', 'outro-fase1', 'demo') returning id as ws2 \gset
\set editor   '00000000-0000-4000-8000-0000000001f1'
\set estranho '00000000-0000-4000-8000-0000000001f2'
insert into auth.users (id, email) values (:'editor', 'editor.fase1@teste.invalid'), (:'estranho', 'estranho.fase1@teste.invalid');
insert into public.profiles (id, username, full_name) values (:'editor', 'editor.fase1', 'Edu Editor'), (:'estranho', 'estranho.fase1', 'Ester de Fora');
insert into public.workspace_members (workspace_id, user_id, role) values (:'ws', :'editor', 'editor'), (:'ws2', :'estranho', 'editor');
create function pg_temp.como(p_usuario uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated', 'aal', 'aal2')::text, true)
$$;
-- Conta só os veículos que o teste criou: o banco local pode já ter algum no espaço.
select set_config('teste.veiculos_de_antes', count(*)::text, true) from public.press_veiculos where workspace_id = :'ws';
create function pg_temp.veiculos(p_ws uuid) returns integer language sql as $$
  select count(*)::int - current_setting('teste.veiculos_de_antes')::int from public.press_veiculos where workspace_id = p_ws
$$;
-- Etiquetas e editorias não têm ordem garantida: o teste compara em ordem alfabética.
create function pg_temp.em_ordem(p_itens text[]) returns text[] language sql as $$
  select coalesce(array_agg(i order by i), '{}') from unnest(p_itens) as i
$$;

-- ================================================================ privilégios

select ok(has_function_privilege('service_role', 'public.importar_contatos_de_imprensa(uuid, uuid, jsonb, text[], text, text, text)', 'execute')
          and not has_function_privilege('authenticated', 'public.importar_contatos_de_imprensa(uuid, uuid, jsonb, text[], text, text, text)', 'execute')
          and not has_function_privilege('anon', 'public.importar_contatos_de_imprensa(uuid, uuid, jsonb, text[], text, text, text)', 'execute'), 'importação nova: só o servidor');
select ok(not has_function_privilege('authenticated', 'private.press_contato_liga_veiculo()', 'execute')
          and not has_function_privilege('anon', 'private.press_contato_liga_veiculo()', 'execute')
          and not has_function_privilege('authenticated', 'private.press_veiculo_renomeia_contatos()', 'execute')
          and not has_function_privilege('anon', 'private.press_veiculo_renomeia_contatos()', 'execute'), 'as funções de gatilho não se chamam de fora');
select ok(has_table_privilege('authenticated', 'public.press_veiculos', 'select')
          and has_table_privilege('authenticated', 'public.press_listas', 'select')
          and has_table_privilege('authenticated', 'public.press_lista_contatos', 'select'), 'quem está logado lê veículos e listas');
select ok(not has_table_privilege('authenticated', 'public.press_veiculos', 'insert')
          and not has_table_privilege('authenticated', 'public.press_veiculos', 'update')
          and not has_table_privilege('authenticated', 'public.press_veiculos', 'delete')
          and not has_table_privilege('authenticated', 'public.press_listas', 'insert')
          and not has_table_privilege('authenticated', 'public.press_listas', 'update')
          and not has_table_privilege('authenticated', 'public.press_listas', 'delete')
          and not has_table_privilege('authenticated', 'public.press_lista_contatos', 'insert')
          and not has_table_privilege('authenticated', 'public.press_lista_contatos', 'update')
          and not has_table_privilege('authenticated', 'public.press_lista_contatos', 'delete'), 'ninguém logado escreve em veículos nem em listas');
select ok(not has_table_privilege('anon', 'public.press_veiculos', 'select')
          and not has_table_privilege('anon', 'public.press_listas', 'select')
          and not has_table_privilege('anon', 'public.press_lista_contatos', 'select'), 'anon não lê veículos nem listas');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.press_veiculos'::regclass, 'public.press_listas'::regclass, 'public.press_lista_contatos'::regclass)),
  'as três tabelas novas têm RLS ligado');

-- ================================================================ o contato acha ou cria o veículo

select is(pg_temp.veiculos(:'ws'), 0, 'começa sem veículo nenhum');

-- Pelo caminho da tela: a sessão do membro, com RLS.
select pg_temp.como(:'editor');
set local role authenticated;
insert into public.press_contacts (workspace_id, nome, veiculo, email, created_by)
values (:'ws', 'Ana Souza', '  O   Globo ', 'ana@globo.teste.invalid', :'editor') returning id as ana \gset
insert into public.press_contacts (workspace_id, nome, veiculo, email, created_by)
values (:'ws', 'Beto Lima', 'o globo', 'beto@globo.teste.invalid', :'editor') returning id as beto \gset
insert into public.press_contacts (workspace_id, nome, email, created_by)
values (:'ws', 'Caio Sem Veículo', 'caio@avulso.teste.invalid', :'editor') returning id as caio \gset
select is((select count(*)::int from public.press_veiculos) - current_setting('teste.veiculos_de_antes')::int, 1, 'o membro lê o veículo que o contato dele criou');
reset role;

select id as globo from public.press_veiculos where workspace_id = :'ws' and lower(nome) = 'o globo' \gset
select is((select nome from public.press_veiculos where id = :'globo'), 'O Globo', 'o veículo nasce com o nome limpo: sem espaço nas pontas nem dobrado');
select ok((select tipo = '' and relevancia = 'media' and created_by = :'editor' from public.press_veiculos where id = :'globo'),
  '… sem tipo (a classificar), com relevância média e o autor do contato');
select is((select veiculo_id from public.press_contacts where id = :'ana'), :'globo'::uuid, 'o contato fica ligado ao veículo');
select is((select veiculo from public.press_contacts where id = :'ana'), 'O Globo', '… e o texto fica com a grafia do cadastro');
select is((select veiculo_id from public.press_contacts where id = :'beto'), :'globo'::uuid, 'maiúscula e minúscula não criam outro veículo');
select is((select veiculo from public.press_contacts where id = :'beto'), 'O Globo', '… e o segundo contato também fica com a grafia do cadastro');
select is(pg_temp.veiculos(:'ws'), 1, 'dois contatos do mesmo veículo, um veículo só');
select ok((select veiculo_id is null and veiculo = '' from public.press_contacts where id = :'caio'), 'contato sem veículo fica sem ligação');
select ok((select tipo_de_contato = 'jornalista' and canal_preferido = 'email' and base_legal = 'legitimo_interesse'
                  and editorias = '{}' and praca = '' and whatsapp = '' and origem_do_dado = ''
             from public.press_contacts where id = :'ana'), 'os campos novos nascem com o padrão');

-- Trocar o texto troca a ligação (é o que o código antigo faz ao editar).
update public.press_contacts set veiculo = 'TV Rio' where id = :'beto';
select id as tvrio from public.press_veiculos where workspace_id = :'ws' and nome = 'TV Rio' \gset
select is((select veiculo_id from public.press_contacts where id = :'beto'), :'tvrio'::uuid, 'texto novo: o contato muda para o veículo novo, criado na hora');
update public.press_contacts set veiculo = '   ' where id = :'beto';
select ok((select veiculo_id is null and veiculo = '' from public.press_contacts where id = :'beto'), 'texto apagado: o contato fica sem veículo');
select is(pg_temp.veiculos(:'ws'), 2, '… e o veículo continua no cadastro');

-- Escolher o veículo pelo id: o texto acompanha.
update public.press_contacts set veiculo_id = :'tvrio' where id = :'beto';
select is((select veiculo from public.press_contacts where id = :'beto'), 'TV Rio', 'veículo escolhido pelo id: o texto acompanha');
insert into public.press_contacts (workspace_id, nome, veiculo, veiculo_id, email, created_by)
values (:'ws', 'Dani Dias', 'texto que não vale', :'globo', 'dani@globo.teste.invalid', :'editor') returning id as dani \gset
select is((select veiculo from public.press_contacts where id = :'dani'), 'O Globo', 'no cadastro com id, o id manda sobre o texto');

-- Mexer em outra coluna não toca na ligação.
update public.press_contacts set notas = 'ligar de manhã', editorias = '{saúde,cidades}', praca = 'Niterói' where id = :'ana';
select ok((select veiculo_id = :'globo' and veiculo = 'O Globo' and editorias = '{saúde,cidades}' from public.press_contacts where id = :'ana'),
  'editar notas, editorias e praça não mexe no veículo');
select is(pg_temp.veiculos(:'ws'), 2, '… e não cria veículo');

-- Nome no limite: o corte em 200 não pode deixar espaço na ponta (a tabela recusaria).
insert into public.press_contacts (workspace_id, nome, veiculo, email, created_by)
values (:'ws', 'Eva Longa', repeat('a', 199) || ' bcd', 'eva@longo.teste.invalid', :'editor') returning id as eva \gset
select is((select char_length(veiculo) from public.press_contacts where id = :'eva'), 199, 'nome comprido é cortado em 200 e aparado');
delete from public.press_contacts where id = :'eva';
delete from public.press_veiculos where workspace_id = :'ws' and nome = repeat('a', 199);

-- Os limites do contato.
select throws_ok(format('update public.press_contacts set tipo_de_contato = %L where id = %L', 'fornecedor', :'ana'), '23514', null, 'tipo de contato fora da lista é recusado');
select throws_ok(format('update public.press_contacts set canal_preferido = %L where id = %L', 'fax', :'ana'), '23514', null, 'canal preferido fora da lista é recusado');
select throws_ok(format('update public.press_contacts set base_legal = %L where id = %L', 'nenhuma', :'ana'), '23514', null, 'base legal fora da lista é recusada');
select throws_ok(format('update public.press_contacts set editorias = array_fill(%L::text, array[13]) where id = %L', 'x', :'ana'), '23514', null, 'mais de 12 editorias é recusado');

-- Quem não é do espaço não cria contato, e o veículo criado pelo gatilho é desfeito junto.
select pg_temp.como(:'estranho');
set local role authenticated;
select throws_ok(format('insert into public.press_contacts (workspace_id, nome, veiculo, email, created_by) values (%L, %L, %L, %L, %L)',
  :'ws', 'Intruso', 'Veículo do Intruso', 'intruso@fora.teste.invalid', :'estranho'), '42501', null, 'quem não é do espaço não cadastra contato');
select is((select count(*)::int from public.press_veiculos), 0, 'quem não é do espaço não vê os veículos');
select throws_ok(format('insert into public.press_veiculos (workspace_id, nome) values (%L, %L)', :'ws2', 'Direto'), '42501', null, 'nem o membro escreve em veículos pela sessão');
reset role;
select is((select count(*)::int from public.press_veiculos where nome = 'Veículo do Intruso'), 0, 'o veículo do cadastro recusado não ficou no banco');

-- Veículo de outro espaço não serve.
insert into public.press_veiculos (workspace_id, nome) values (:'ws2', 'Jornal do Outro Espaço') returning id as alheio \gset
select throws_ok(format('update public.press_contacts set veiculo_id = %L where id = %L', :'alheio', :'ana'), '23503', null, 'contato não se liga a veículo de outro espaço');
insert into public.press_contacts (workspace_id, nome, veiculo, email, created_by)
values (:'ws2', 'Fabi de Lá', 'o globo', 'fabi@la.teste.invalid', :'estranho') returning id as fabi \gset
select ok((select veiculo_id is not null and veiculo_id <> :'globo' from public.press_contacts where id = :'fabi'), 'o mesmo nome em outro espaço é outro veículo');

-- ================================================================ o cadastro do veículo

select throws_ok(format('insert into public.press_veiculos (workspace_id, nome) values (%L, %L)', :'ws', 'o GLOBO'), '23505', null, 'o mesmo nome não entra duas vezes');
select throws_ok(format('insert into public.press_veiculos (workspace_id, nome) values (%L, %L)', :'ws', ' Com espaço'), '23514', null, 'nome com espaço na ponta é recusado');
select throws_ok(format('insert into public.press_veiculos (workspace_id, nome) values (%L, %L)', :'ws', 'Dois  espaços'), '23514', null, 'nome com espaço dobrado é recusado');
-- O que o gatilho trocaria por espaço não pode morar no cadastro: o contato não acharia mais o veículo.
select throws_ok(format('insert into public.press_veiculos (workspace_id, nome) values (%L, %L)', :'ws', E'Com\ttabulação'), '23514', null, 'nome com tabulação é recusado');
select throws_ok(format('insert into public.press_veiculos (workspace_id, nome) values (%L, %L)', :'ws', E'Com\nquebra'), '23514', null, 'nome com quebra de linha é recusado');
select throws_ok(format('insert into public.press_veiculos (workspace_id, nome) values (%L, %L)', :'ws', ''), '23514', null, 'nome vazio é recusado');
select throws_ok(format('update public.press_veiculos set tipo = %L where id = %L', 'blog', :'globo'), '23514', null, 'tipo de veículo fora da lista é recusado');
select throws_ok(format('update public.press_veiculos set relevancia = %L where id = %L', 'altíssima', :'globo'), '23514', null, 'relevância fora da lista é recusada');

-- Renomear no cadastro renomeia nos contatos.
update public.press_veiculos set nome = 'Jornal O Globo', tipo = 'impresso', praca = 'Rio de Janeiro (capital)', relevancia = 'alta' where id = :'globo';
select is((select array_agg(veiculo order by nome) from public.press_contacts where veiculo_id = :'globo'),
  array['Jornal O Globo', 'Jornal O Globo'], 'renomear o veículo renomeia o texto dos contatos dele');
select is((select count(*)::int from public.press_contacts where veiculo_id = :'globo'), 2, '… sem desligar ninguém');
select is(pg_temp.veiculos(:'ws'), 2, '… e sem criar veículo');
select ok((select updated_at >= created_at from public.press_veiculos where id = :'globo'), 'a edição carimba updated_at');
select throws_ok(format('update public.press_veiculos set nome = %L where id = %L', 'tv rio', :'globo'), '23505', null, 'renomear para o nome de outro veículo é recusado');

-- Apagar: só sem contato.
select throws_ok(format('delete from public.press_veiculos where id = %L', :'globo'), '23503', null, 'veículo com contato não é apagado');

-- Juntar: os contatos mudam de veículo pelo id, o texto acompanha, e o que ficou vazio pode sair.
update public.press_contacts set veiculo_id = :'globo' where workspace_id = :'ws' and veiculo_id = :'tvrio';
select is((select veiculo from public.press_contacts where id = :'beto'), 'Jornal O Globo', 'juntar: o contato do veículo que some fica com o nome do que fica');
select lives_ok(format('delete from public.press_veiculos where id = %L', :'tvrio'), 'veículo sem contato pode ser apagado');
select is(pg_temp.veiculos(:'ws'), 1, 'depois de juntar, sobra um veículo');

-- ================================================================ o que já existia (seção 6 da migração)

alter table public.press_contacts disable trigger press_contacts_liga_veiculo;
insert into public.press_contacts (workspace_id, nome, veiculo, email, created_by) values
  (:'ws', 'Gil Antigo',  'Rádio Antiga', 'gil@antiga.teste.invalid',  :'editor'),
  (:'ws', 'Hugo Antigo', 'rádio antiga', 'hugo@antiga.teste.invalid', :'editor'),
  (:'ws', 'Iris Antiga', '',             'iris@antiga.teste.invalid', :'editor');
alter table public.press_contacts enable trigger press_contacts_liga_veiculo;
-- Como se tivessem sido alterados pela última vez no mês passado.
alter table public.press_contacts disable trigger press_contacts_touch;
update public.press_contacts set updated_at = now() - interval '30 days' where workspace_id = :'ws' and lower(email) like '%@antiga.teste.invalid';
alter table public.press_contacts enable trigger press_contacts_touch;
select is((select count(*)::int from public.press_contacts where workspace_id = :'ws' and veiculo_id is null and btrim(veiculo) <> ''), 2, 'dois contatos como os de antes da migração: texto sem ligação');
-- O bloco da seção 6, como está na migração.
do $$
begin
  alter table public.press_contacts disable trigger press_contacts_touch;
  update public.press_contacts
     set veiculo = veiculo
   where veiculo_id is null and btrim(veiculo) <> '';
  alter table public.press_contacts enable trigger press_contacts_touch;
end $$;
select is((select count(*)::int from public.press_contacts where workspace_id = :'ws' and veiculo_id is null and btrim(veiculo) <> ''), 0, 'o comando da migração liga todos');
select is((select count(*)::int from public.press_contacts where workspace_id = :'ws' and lower(email) like '%@antiga.teste.invalid' and updated_at < now() - interval '29 days'), 3,
  '… sem carimbar a "última alteração" de ninguém');
select ok((select tgenabled = 'O' from pg_trigger where tgname = 'press_contacts_touch' and tgrelid = 'public.press_contacts'::regclass), '… e o carimbo volta a funcionar');
update public.press_contacts set notas = 'mexida de verdade' where workspace_id = :'ws' and lower(email) = 'gil@antiga.teste.invalid';
select ok((select updated_at > now() - interval '1 minute' from public.press_contacts where workspace_id = :'ws' and lower(email) = 'gil@antiga.teste.invalid'), 'depois dela, uma alteração de verdade carimba de novo');
select is((select count(distinct veiculo_id)::int from public.press_contacts where workspace_id = :'ws' and lower(veiculo) = 'rádio antiga'), 1, '… os dois no mesmo veículo');
select is(pg_temp.veiculos(:'ws'), 2, '… criando um veículo só');
update public.press_contacts set veiculo = veiculo where veiculo_id is null and btrim(veiculo) <> '';
select is(pg_temp.veiculos(:'ws'), 2, 'rodar de novo não muda nada');

-- ================================================================ a importação antiga continua valendo

select inseridos as ant_ins, atualizados as ant_atu from public.importar_contatos(:'ws', :'editor',
  '[{"email":"joca@portal.teste.invalid","nome":"Joca","veiculo":"Portal Fluminense"}]'::jsonb, array['lista-antiga']) \gset
select ok(:ant_ins = 1 and :ant_atu = 0, 'a importação antiga ainda grava');
select ok((select veiculo_id is not null from public.press_contacts where lower(email) = 'joca@portal.teste.invalid'), '… e o contato dela também ganha o veículo');

-- ================================================================ a importação nova

-- A Ana já existe: tem veículo, editorias e praça. O Caio existe com tudo vazio.
update public.press_contacts set descadastrado_em = now(), tags = '{antiga}' where id = :'caio';
select tipo as tipo_antes from public.press_veiculos where id = :'globo' \gset
select pg_temp.veiculos(:'ws') as antes \gset

select inseridos as ins, atualizados as atu from public.importar_contatos_de_imprensa(:'ws', :'editor', '[
  {"email":"ANA@globo.teste.invalid","nome":"Outro Nome","veiculo":"Globo (nome da planilha)","cargo":"Editora","telefone":"(21) 90000-0001","praca":"Baixada Fluminense","editorias":["política"],"tipo_de_veiculo":"portal"},
  {"email":"caio@avulso.teste.invalid","nome":"Caio da Planilha","veiculo":"Rádio Nova","cargo":"Repórter","telefone":"(21) 90000-0002","praca":"Região Serrana","editorias":["Saúde"," saúde ","Cidades"],"tipo_de_veiculo":"radio"},
  {"email":"lia@tv.teste.invalid","nome":"Lia Lopes","veiculo":"TV Serra","cargo":"Produtora","telefone":"","praca":"Região Serrana","editorias":["Geral"],"tipo_de_veiculo":"tv"},
  {"email":"LIA@tv.teste.invalid","nome":"Lia repetida","veiculo":"TV Serra","tipo_de_veiculo":"tv"},
  {"email":"mel@tv.teste.invalid","nome":"Mel Melo","veiculo":"tv serra","editorias":"não é lista","tipo_de_veiculo":"emissora"},
  {"email":"sem-arroba","nome":"Sem e-mail","veiculo":"Veículo que não pode nascer"},
  {"email":"nei@jornal.teste.invalid","nome":"Nei Nunes","veiculo":"Jornal O Globo","tipo_de_veiculo":"tv"}
]'::jsonb, array['mailing-2026'], 'jornalista', 'Planilha antiga da Comunicação', 'legitimo_interesse') \gset

select is(:ins, 3, 'três e-mails novos entram (o repetido e o sem arroba, não)');
select is(:atu, 2, 'dois já existiam');

-- Quem já existia: só o que estava vazio é preenchido.
select ok((select nome = 'Ana Souza' and veiculo = 'Jornal O Globo' and veiculo_id = :'globo' and praca = 'Niterói' and editorias = '{saúde,cidades}'
             from public.press_contacts where id = :'ana'), 'quem já tinha nome, veículo, praça e editorias fica como estava');
select ok((select cargo = 'Editora' and telefone = '(21) 90000-0001' and origem_do_dado = 'Planilha antiga da Comunicação' and tags = '{mailing-2026}'
                  and base_legal = 'legitimo_interesse'
             from public.press_contacts where id = :'ana'), '… e ganha o que estava vazio: cargo, telefone, origem e a etiqueta');
select is((select count(*)::int from public.press_veiculos where workspace_id = :'ws' and nome = 'Globo (nome da planilha)'), 0,
  'o veículo da planilha de quem já tinha veículo não é criado à toa');
select ok((select nome = 'Caio Sem Veículo' and veiculo = 'Rádio Nova' and veiculo_id is not null and praca = 'Região Serrana'
                  and pg_temp.em_ordem(editorias) = '{cidades,saúde}' and descadastrado_em is not null and tipo_de_contato = 'jornalista'
             from public.press_contacts where id = :'caio'),
  'quem estava vazio é completado; editorias em minúsculas e sem repetição; quem saiu continua fora');
select is((select pg_temp.em_ordem(tags) from public.press_contacts where id = :'caio'), array['antiga', 'mailing-2026'], '… e as etiquetas se somam');

-- Quem é novo.
select ok((select nome = 'Lia Lopes' and fonte = 'importado' and created_by = :'editor' and praca = 'Região Serrana' and editorias = '{geral}'
                  and tipo_de_contato = 'jornalista' and origem_do_dado = 'Planilha antiga da Comunicação' and base_legal = 'legitimo_interesse'
                  and dominio = 'tv.teste.invalid' and tags = '{mailing-2026}'
             from public.press_contacts where lower(email) = 'lia@tv.teste.invalid'), 'o contato novo entra com editoria, praça, tipo, origem e base legal');
select is((select count(*)::int from public.press_contacts where workspace_id = :'ws' and lower(email) = 'lia@tv.teste.invalid'), 1, 'o e-mail repetido na planilha entra uma vez só');
select ok((select editorias = '{}' from public.press_contacts where lower(email) = 'mel@tv.teste.invalid'), 'editorias que não vêm como lista são ignoradas');
select is((select count(distinct veiculo_id)::int from public.press_contacts where workspace_id = :'ws' and lower(email) in ('lia@tv.teste.invalid', 'mel@tv.teste.invalid')), 1,
  'os dois da TV Serra ficam no mesmo veículo');
select is((select count(*)::int from public.press_veiculos where workspace_id = :'ws' and nome = 'Veículo que não pode nascer'), 0, 'linha sem e-mail não cria veículo');
select is(pg_temp.veiculos(:'ws'), :antes + 2, 'a importação cria só os veículos que faltavam: Rádio Nova e TV Serra');

-- O tipo de veículo da planilha.
select is((select tipo from public.press_veiculos where workspace_id = :'ws' and nome = 'TV Serra'), 'tv', 'o veículo novo ganha o tipo da planilha');
select is((select tipo from public.press_veiculos where workspace_id = :'ws' and nome = 'Rádio Nova'), 'radio', '… o da rádio também');
select is((select tipo from public.press_veiculos where id = :'globo'), :'tipo_antes', 'veículo já classificado não é reclassificado pela planilha');

-- Tipo, origem e base da importação inteira.
select inseridos as ins2 from public.importar_contatos_de_imprensa(:'ws', :'editor',
  '[{"email":"olga@ong.teste.invalid","nome":"Olga","veiculo":"ONG Parceira","tipo_de_veiculo":"organizacao"}]'::jsonb, null, 'parceiro', '  Pediu para receber  ', 'consentimento') \gset
select ok((select tipo_de_contato = 'parceiro' and base_legal = 'consentimento' and origem_do_dado = 'Pediu para receber' and tags = '{}'
             from public.press_contacts where lower(email) = 'olga@ong.teste.invalid'), 'tipo de contato, base legal e origem valem para a importação inteira');
select is((select tipo from public.press_veiculos where workspace_id = :'ws' and nome = 'ONG Parceira'), 'organizacao', 'o que não é imprensa entra como organização');
select inseridos as ins3 from public.importar_contatos_de_imprensa(:'ws', :'editor',
  '[{"email":"paulo@x.teste.invalid","nome":"Paulo"}]'::jsonb, array['x'], 'astronauta', null, 'qualquer') \gset
select ok((select tipo_de_contato = 'jornalista' and base_legal = 'legitimo_interesse' and origem_do_dado = '' and veiculo_id is null
             from public.press_contacts where lower(email) = 'paulo@x.teste.invalid'), 'valor desconhecido cai no padrão, sem recusar a importação');

-- A base legal anda com a origem: quem já existia sem origem e entra numa planilha de quem pediu para receber fica com consentimento.
select inseridos as ins5, atualizados as atu5 from public.importar_contatos_de_imprensa(:'ws', :'editor',
  '[{"email":"paulo@x.teste.invalid","nome":"Paulo"},{"email":"olga@ong.teste.invalid","nome":"Olga"}]'::jsonb, null, 'jornalista', 'Pediu para receber', 'consentimento') \gset
select ok(:ins5 = 0 and :atu5 = 2, 'os dois já existiam');
select ok((select origem_do_dado = 'Pediu para receber' and base_legal = 'consentimento' from public.press_contacts where lower(email) = 'paulo@x.teste.invalid'),
  'quem não tinha origem ganha a origem e a base legal dela, juntas');
-- A Olga já tinha origem e base; outra planilha, com origem que não é pedido, não troca nenhuma das duas.
select inseridos as ins6 from public.importar_contatos_de_imprensa(:'ws', :'editor',
  '[{"email":"olga@ong.teste.invalid","nome":"Olga"},{"email":"paulo@x.teste.invalid","nome":"Paulo"}]'::jsonb, null, 'jornalista', 'Lista de terceiros', 'legitimo_interesse') \gset
select ok((select bool_and(origem_do_dado = 'Pediu para receber' and base_legal = 'consentimento') from public.press_contacts
            where lower(email) in ('olga@ong.teste.invalid', 'paulo@x.teste.invalid')), 'quem já tinha origem fica com a origem e a base legal que tinha');
-- Importação sem origem (o código antigo) não mexe na base legal de ninguém.
update public.press_contacts set origem_do_dado = '', base_legal = 'consentimento' where lower(email) = 'paulo@x.teste.invalid';
select inseridos as ins7 from public.importar_contatos_de_imprensa(:'ws', :'editor', '[{"email":"paulo@x.teste.invalid"}]'::jsonb, null, 'jornalista', '', 'legitimo_interesse') \gset
select ok((select origem_do_dado = '' and base_legal = 'consentimento' from public.press_contacts where lower(email) = 'paulo@x.teste.invalid'), 'importação sem origem não troca a base legal');

-- Reimportar não duplica nem mexe em quem saiu.
select inseridos as ins4, atualizados as atu4 from public.importar_contatos_de_imprensa(:'ws', :'editor',
  '[{"email":"lia@tv.teste.invalid","nome":"Lia de novo","editorias":["esportes"]}]'::jsonb, array['segunda'], 'autoridade', 'Outra origem', 'consentimento') \gset
select ok(:ins4 = 0 and :atu4 = 1, 'reimportar atualiza, não duplica');
select ok((select nome = 'Lia Lopes' and editorias = '{geral}' and tipo_de_contato = 'jornalista' and base_legal = 'legitimo_interesse'
                  and origem_do_dado = 'Planilha antiga da Comunicação' and pg_temp.em_ordem(tags) = '{mailing-2026,segunda}'
             from public.press_contacts where lower(email) = 'lia@tv.teste.invalid'), '… sem trocar tipo, base legal, origem nem editorias de quem já estava');

-- ================================================================ listas

insert into public.press_listas (workspace_id, nome, descricao, tipo, plantao, created_by)
values (:'ws', 'Plantão', 'Chefias de reportagem', 'fixa', true, :'editor') returning id as lplantao \gset
insert into public.press_listas (workspace_id, nome, tipo, criterio, created_by)
values (:'ws', 'Saúde na Serra', 'filtro', '{"editorias":["saúde"],"pracas":["Região Serrana"]}', :'editor') returning id as lfiltro \gset
insert into public.press_listas (workspace_id, nome) values (:'ws2', 'Lista de Lá') returning id as lalheia \gset
insert into public.press_lista_contatos (lista_id, contato_id, workspace_id, adicionado_por) values
  (:'lplantao', :'ana', :'ws', :'editor'), (:'lplantao', :'beto', :'ws', :'editor'), (:'lplantao', :'dani', :'ws', :'editor');

select throws_ok(format('insert into public.press_listas (workspace_id, nome) values (%L, %L)', :'ws', 'PLANTÃO'), '23505', null, 'o mesmo nome de lista não entra duas vezes');
select throws_ok(format('insert into public.press_listas (workspace_id, nome) values (%L, %L)', :'ws', ' '), '23514', null, 'lista sem nome é recusada');
select throws_ok(format('insert into public.press_listas (workspace_id, nome, tipo) values (%L, %L, %L)', :'ws', 'Tipo errado', 'dinamica'), '23514', null, 'tipo de lista fora da lista é recusado');
select throws_ok(format('insert into public.press_listas (workspace_id, nome, criterio) values (%L, %L, %L)', :'ws', 'Critério errado', '[1,2]'), '23514', null, 'critério que não é objeto é recusado');
select throws_ok(format('insert into public.press_lista_contatos (lista_id, contato_id, workspace_id) values (%L, %L, %L)', :'lplantao', :'ana', :'ws'), '23505', null, 'a mesma pessoa não entra duas vezes na lista');
select throws_ok(format('insert into public.press_lista_contatos (lista_id, contato_id, workspace_id) values (%L, %L, %L)', :'lplantao', :'fabi', :'ws'), '23503', null, 'contato de outro espaço não entra na lista');
select throws_ok(format('insert into public.press_lista_contatos (lista_id, contato_id, workspace_id) values (%L, %L, %L)', :'lalheia', :'ana', :'ws'), '23503', null, 'lista de outro espaço não recebe contato daqui');
select throws_ok(format('insert into public.press_lista_contatos (lista_id, contato_id, workspace_id) values (%L, %L, %L)', :'lalheia', :'ana', :'ws2'), '23503', null, '… nem trocando o espaço da linha');

-- Quem lê.
select pg_temp.como(:'editor');
set local role authenticated;
select is((select count(*)::int from public.press_listas), 2, 'membro vê as listas do espaço dele');
select is((select count(*)::int from public.press_lista_contatos), 3, '… e quem está nelas');
select throws_ok(format('insert into public.press_listas (workspace_id, nome) values (%L, %L)', :'ws', 'Pela sessão'), '42501', null, 'membro não escreve em listas pela sessão');
select throws_ok(format('delete from public.press_lista_contatos where lista_id = %L', :'lplantao'), '42501', null, '… nem tira gente da lista');
reset role;
select pg_temp.como(:'estranho');
set local role authenticated;
select is((select count(*)::int from public.press_listas where workspace_id = :'ws'), 0, 'quem não é do espaço não vê as listas');
select is((select count(*)::int from public.press_lista_contatos where workspace_id = :'ws'), 0, '… nem quem está nelas');
reset role;

-- Apagar o contato tira da lista; apagar a lista leva os membros e solta a campanha.
delete from public.press_contacts where id = :'dani';
select is((select count(*)::int from public.press_lista_contatos where lista_id = :'lplantao'), 2, 'apagar o contato tira da lista');
insert into public.press_campanhas (workspace_id, assunto, corpo, estado, enviada_por, lista_id)
values (:'ws', 'Para o plantão', 'Texto', 'rascunho', :'editor', :'lplantao') returning id as camp \gset
select throws_ok(format('update public.press_campanhas set lista_id = %L where id = %L', :'lalheia', :'camp'), '23503', null, 'a campanha não aponta para lista de outro espaço');
delete from public.press_listas where id = :'lplantao';
select is((select count(*)::int from public.press_lista_contatos where lista_id = :'lplantao'), 0, 'apagar a lista leva os membros');
select ok((select lista_id is null and workspace_id = :'ws' from public.press_campanhas where id = :'camp'), '… e a campanha fica, só sem a lista');
select is((select count(*)::int from public.press_contacts where id in (:'ana', :'beto')), 2, '… e os contatos também ficam');

-- ================================================================ apagar o espaço inteiro

-- Contato ligado a veículo, lista com membro e campanha com lista: a ordem em que o banco apaga não pode travar.
insert into public.press_lista_contatos (lista_id, contato_id, workspace_id) values (:'lalheia', :'fabi', :'ws2');
insert into public.press_campanhas (workspace_id, assunto, corpo, estado, lista_id) values (:'ws2', 'De lá', 'Texto', 'rascunho', :'lalheia');
delete from public.workspace_members where workspace_id = :'ws2';
select lives_ok(format('delete from public.workspaces where id = %L', :'ws2'), 'apagar o espaço leva contatos, veículos e listas sem travar');
select is((select count(*)::int from public.press_veiculos where workspace_id = :'ws2') + (select count(*)::int from public.press_listas where workspace_id = :'ws2')
        + (select count(*)::int from public.press_contacts where workspace_id = :'ws2'), 0, '… e não sobra nada dele');

select * from finish();
rollback;
