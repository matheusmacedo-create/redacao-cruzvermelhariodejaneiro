-- Testes do portal de transparência e dos canais oficiais
-- (supabase/migrations/20260925201000_cvrj_transparencia.sql). Mesmas regras de
-- supabase/tests/auditoria.test.sql: só em banco local, numa transação desfeita no fim.
--
--   psql -v ON_ERROR_STOP=1 -d redacao_local < supabase/tests/transparencia.test.sql

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
\set editor '00000000-0000-4000-8000-0000000000e1'
insert into auth.users (id, email) values (:'admin', 'admin.t@teste.invalid'), (:'editor', 'editor.t@teste.invalid');
insert into public.profiles (id, username, full_name) values (:'admin', 'admin.transp', 'Pessoa Admin'), (:'editor', 'editor.transp', 'Pessoa Editora');
insert into public.workspace_members (workspace_id, user_id, role) values (:'ws', :'admin', 'admin'), (:'ws', :'editor', 'editor');

create function pg_temp.como(p_usuario uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated', 'aal', 'aal2')::text, true)
$$;
create function pg_temp.estado(p_item uuid) returns text language sql as $$
  select coalesce((select s.estado from auditoria.estado_item(p_item) s), 'vigente')
$$;
-- Um "arquivo" no Storage, como o navegador deixaria depois do envio.
create function pg_temp.arquivo(p_ws uuid, p_doc uuid) returns text language plpgsql as $$
declare
  c text := p_ws || '/' || p_doc || '/' || gen_random_uuid() || '.pdf';
begin
  insert into storage.objects (bucket_id, name, metadata) values ('transparencia', c, '{"mimetype":"application/pdf","size":1234}');
  return c;
end $$;

-- ================================================================ privilégios

select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like 'transparencia\_%' or p.proname like 'canais\_%' or p.proname = 'auditoria_codigos_das_origens')
              and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
          0, 'as funções do portal só são chamadas pelo servidor');
select ok(not has_table_privilege('authenticated', 'public.transparencia_documentos', 'insert'), 'ninguém logado escreve direto nas tabelas');
select ok(not has_table_privilege('anon', 'public.transparencia_versoes', 'select'), 'anon não lê as tabelas');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'auditoria' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
          0, 'as funções novas da trilha continuam fechadas');

-- ================================================================ documentos

select public.transparencia_salvar_documento(:'ws', null, '{"categoria":"demonstracoes","titulo":"Balanço patrimonial","periodo":"2025"}', :'admin') as doc \gset
select public.transparencia_registrar_versao(:'doc', pg_temp.arquivo(:'ws', :'doc'), 'balanco-2025.pdf', 1234, repeat('a', 64), :'admin') as v1 \gset
select is((select count(*)::integer from auditoria.itens where referencia_id = :'doc'), 0, 'versão enviada, ainda não publicada: fora da trilha');
select throws_ok(format('select public.transparencia_registrar_versao(%L, %L, ''x.pdf'', 1, repeat(''b'', 64), %L)', :'doc', 'outro/caminho.pdf', :'admin'),
                 'P0001', null, 'caminho de outro lugar é recusado');
select throws_ok(format('select public.transparencia_registrar_versao(%L, %L, ''x.pdf'', 1, repeat(''b'', 64), %L)', :'doc',
                        :'ws' || '/' || :'doc' || '/' || gen_random_uuid() || '.pdf', :'admin'),
                 'P0001', null, 'arquivo que não chegou ao Storage é recusado');

select public.transparencia_publicar_versao(:'v1', 'https://cruzvermelhariodejaneiro.org/transparencia/arquivos/balanco-patrimonial-aaaaaaaaaaaa.pdf', :'admin');
select i.* from auditoria.itens i where i.tipo = 'documento' and i.referencia_id = :'doc' \gset d1_
select is(:'d1_hash_arquivo'::text, repeat('a', 64), 'documento publicado entra na trilha com o SHA-256 do PDF');
select is(:'d1_classe'::text, 'P', 'documento do portal é público');
select ok((:'d1_conteudo_canonico'::jsonb -> 'arquivo' ->> 'sha256') = repeat('a', 64), 'o conteúdo canônico inclui o arquivo');
select is((select ator_id::text || '|' || papel from auditoria.eventos where item_id = :'d1_id'), :'admin' || '|admin',
          'o autor informado pelo servidor fica na trilha');
select is(public.auditoria_consultar_hash(repeat('a', 64)) ->> 'tipo', 'documento', 'quem tem o PDF encontra o registro pelo arquivo');

select throws_ok(format('update public.transparencia_versoes set sha256 = repeat(''c'', 64) where id = %L', :'v1'), 'P0001', null, 'arquivo de versão não se troca');
select throws_ok(format('update public.transparencia_versoes set arquivo_publico = ''https://x'' where id = %L', :'v1'), 'P0001', null, 'versão publicada não muda');
select throws_ok(format('delete from public.transparencia_versoes where id = %L', :'v1'), 'P0001', null, 'versão publicada não se apaga');
select throws_ok(format('delete from public.transparencia_documentos where id = %L', :'doc'), 'P0001', null, 'documento com versão publicada não se apaga');

select public.transparencia_registrar_versao(:'doc', pg_temp.arquivo(:'ws', :'doc'), 'balanco-2025-retificado.pdf', 2345, repeat('b', 64), :'admin') as v2 \gset
select throws_ok(format('select public.transparencia_registrar_versao(%L, %L, ''x.pdf'', 1, repeat(''b'', 64), %L)', :'doc', pg_temp.arquivo(:'ws', :'doc'), :'admin'),
                 'P0001', null, 'o mesmo arquivo duas vezes no mesmo documento é recusado');
select public.transparencia_publicar_versao(:'v2', 'https://cruzvermelhariodejaneiro.org/transparencia/arquivos/balanco-patrimonial-bbbbbbbbbbbb.pdf', :'admin');
select is((select max(versao) from auditoria.itens where referencia_id = :'doc'), 2, 'arquivo novo: versão 2 na trilha');
select is(pg_temp.estado(:'d1_id'), 'substituido', 'e a primeira fica substituída');

select public.transparencia_salvar_documento(:'ws', :'doc', '{"categoria":"demonstracoes","titulo":"Balanço patrimonial retificado","periodo":"2025"}', :'admin') \gset ignorar_
select is((select max(versao) from auditoria.itens where referencia_id = :'doc'), 3, 'título editado depois de publicado: versão 3');
select is((select titulo_publico from auditoria.itens where referencia_id = :'doc' order by versao desc limit 1), 'Balanço patrimonial retificado', 'com o título novo');

select throws_ok(format('select public.transparencia_retirar_documento(%L, ''x'', %L)', :'doc', :'admin'), 'P0001', null, 'retirar exige motivo');
select public.transparencia_retirar_documento(:'doc', 'Publicado por engano no portal.', :'admin');
select is(pg_temp.estado((select id from auditoria.itens where referencia_id = :'doc' order by versao desc limit 1)), 'retirado', 'documento retirado do portal');
select is((select depois ->> 'motivo' from auditoria.eventos e join auditoria.itens i on i.id = e.item_id
            where i.referencia_id = :'doc' and e.acao = 'item.retirado'), 'retirado_do_ar', 'o motivo em texto fica na ficha; na trilha, o código');

select is(public.transparencia_marcar_removidos(:'doc'), 2, 'os 2 PDFs publicados do documento retirado saem do site');
select is(public.transparencia_marcar_removidos(:'doc'), 0, 'marcar de novo não muda nada');
select throws_ok(format('update public.transparencia_versoes set removido_do_site_em = null where id = %L', :'v1'), 'P0001', null, 'a remoção registrada não se desfaz');
select public.transparencia_registrar_versao(:'doc', pg_temp.arquivo(:'ws', :'doc'), 'balanco-2025-v3.pdf', 3456, repeat('d', 64), :'admin') as v3 \gset
select public.transparencia_publicar_versao(:'v3', 'https://cruzvermelhariodejaneiro.org/transparencia/arquivos/balanco-patrimonial-dddddddddddd.pdf', :'admin');
select is((select retirado_em from public.transparencia_documentos where id = :'doc'), null, 'publicar versão nova devolve o documento ao portal');
select is(pg_temp.estado((select id from auditoria.itens where referencia_id = :'doc' order by versao desc limit 1)), 'vigente', 'e a trilha registra a volta');

-- Rascunho: sem versão publicada, apaga-se.
select public.transparencia_salvar_documento(:'ws', null, '{"categoria":"atas","titulo":"Ata de teste"}', :'admin') as rasc \gset
select public.transparencia_registrar_versao(:'rasc', pg_temp.arquivo(:'ws', :'rasc'), 'ata.pdf', 100, repeat('e', 64), :'admin') as vrasc \gset
select lives_ok(format('select public.transparencia_excluir_rascunho(%L, null)', :'rasc'), 'rascunho se apaga');
select throws_ok(format('select public.transparencia_marcar_removidos(%L)', :'doc'), 'P0001', null, 'documento no ar não perde os arquivos');

-- ================================================================ parcerias

select public.transparencia_salvar_parceria(:'ws', null, '{"instrumento":"termo_de_colaboracao","numero":"12/2026","orgao":"Secretaria Municipal de Saúde","orgao_cnpj":"12345678000199","objeto":"Capacitação de agentes em primeiros socorros","data_assinatura":"2026-03-01","valor_total":"150000.00","valor_liberado":"50000","equipe":[{"funcao":"Instrutor","remuneracao":"3500.00"}]}', :'admin') as parc \gset
select is((select count(*)::integer from auditoria.itens where referencia_id = :'parc'), 0, 'parceria em rascunho: fora da trilha');
select public.transparencia_publicar_parceria(:'parc', :'admin');
select i.* from auditoria.itens i where i.tipo = 'parceria' and i.referencia_id = :'parc' \gset p1_
select ok(:'p1_conteudo_canonico'::jsonb ->> 'valor_total' = '150000.00' and :'p1_conteudo_canonico'::jsonb ->> 'valor_liberado' = '50000.00',
          'valores com duas casas no conteúdo canônico');
select ok(not (:'p1_conteudo_canonico'::text ~* 'nome'), 'equipe só com função e remuneração, sem nome');
select public.transparencia_salvar_parceria(:'ws', :'parc', '{"instrumento":"termo_de_colaboracao","numero":"12/2026","orgao":"Secretaria Municipal de Saúde","orgao_cnpj":"12345678000199","objeto":"Capacitação de agentes em primeiros socorros","data_assinatura":"2026-03-01","valor_total":"150000.00","valor_liberado":"100000","situacao_prestacao":"prestacao_apresentada","equipe":[{"funcao":"Instrutor","remuneracao":"3500.00"}]}', :'admin') \gset ignorar_
select is((select max(versao) from auditoria.itens where referencia_id = :'parc'), 2, 'parceria atualizada: versão 2');
select throws_ok(format('delete from public.transparencia_parcerias where id = %L', :'parc'), 'P0001', null, 'parceria publicada não se apaga');
select public.transparencia_retirar_parceria(:'parc', 'Parceria encerrada e prazo de exibição cumprido.', :'admin');
select is(pg_temp.estado((select id from auditoria.itens where referencia_id = :'parc' order by versao desc limit 1)), 'retirado', 'parceria retirada');
select throws_ok(format($$select public.transparencia_salvar_parceria(%L, %L, '{"instrumento":"outro","orgao":"Órgão","objeto":"Objeto qualquer"}', %L)$$, :'ws', :'parc', :'admin'),
                 'P0001', null, 'parceria retirada não se edita');

-- ================================================================ canais oficiais

select * from public.canais_publicar_versao(:'ws', '[{"tipo":"site","rotulo":"Site","valor":"cruzvermelhariodejaneiro.org","url":"https://cruzvermelhariodejaneiro.org/"}]', null, :'admin') \gset c1_
select is(:c1_versao, 1, 'primeira versão dos canais');
select * from public.canais_publicar_versao(:'ws', '[{"tipo":"site","rotulo":"Site","valor":"cruzvermelhariodejaneiro.org","url":"https://cruzvermelhariodejaneiro.org/"},{"tipo":"email","rotulo":"E-mail","valor":"contato@cruzvermelhariodejaneiro.org"}]', 'Lista revista pela diretoria.', :'admin') \gset c2_
select is(:c2_versao, 2, 'segunda versão');
select is((select count(*)::integer from auditoria.itens where tipo = 'canais' and referencia_id = :'ws'), 2, 'cada versão entra na trilha');
select is(pg_temp.estado((select id from auditoria.itens where tipo = 'canais' and versao = 1)), 'substituido', 'a versão anterior fica substituída');
select throws_ok(format('update public.canais_oficiais_versoes set observacao = ''x'' where id = %L', :'c1_id'), 'P0001', null, 'versão de canais não muda');
select throws_ok(format('delete from public.canais_oficiais_versoes where id = %L', :'c2_id'), 'P0001', null, 'versão de canais não se apaga');

-- ================================================================ sincronização do portal

alter table public.transparencia_versoes disable trigger transparencia_versoes_trilha;
alter table public.transparencia_parcerias disable trigger transparencia_parcerias_trilha;
alter table public.canais_oficiais_versoes disable trigger canais_oficiais_versoes_trilha;
select public.transparencia_salvar_documento(:'ws', null, '{"categoria":"politicas","titulo":"Código de conduta"}', :'admin') as doc_sem \gset
select public.transparencia_registrar_versao(:'doc_sem', pg_temp.arquivo(:'ws', :'doc_sem'), 'conduta.pdf', 500, repeat('f', 64), :'admin') as v_sem \gset
select public.transparencia_publicar_versao(:'v_sem', 'https://cruzvermelhariodejaneiro.org/transparencia/arquivos/codigo-de-conduta-ffffffffffff.pdf', :'admin') \gset ignorar_
select public.transparencia_salvar_parceria(:'ws', null, '{"instrumento":"termo_de_fomento","orgao":"Fundação de Teste","objeto":"Projeto de voluntariado"}', :'admin') as parc_sem \gset
select public.transparencia_publicar_parceria(:'parc_sem', :'admin') \gset ignorar_
select * from public.canais_publicar_versao(:'ws', '[{"tipo":"telefone","rotulo":"Telefone","valor":"(21) 0000-0000"}]', null, :'admin') \gset c3_
alter table public.transparencia_versoes enable trigger transparencia_versoes_trilha;
alter table public.transparencia_parcerias enable trigger transparencia_parcerias_trilha;
alter table public.canais_oficiais_versoes enable trigger canais_oficiais_versoes_trilha;
select is((select count(*)::integer from auditoria.itens where referencia_id in (:'doc_sem', :'parc_sem')), 0, 'com os ganchos desligados, nada foi registrado');
select public.auditoria_sincronizar() as sinc \gset
select is((:'sinc'::jsonb ->> 'documentos')::integer, 1, 'a sincronização registra o documento que faltou');
select is((:'sinc'::jsonb ->> 'parcerias')::integer, 1, 'e a parceria');
select is((:'sinc'::jsonb ->> 'canais')::integer, 1, 'e a versão nova dos canais');
select is((select titulo_publico from auditoria.itens where tipo = 'canais' order by versao desc limit 1), 'Canais oficiais — versão 3', 'a versão certa dos canais');
select is((public.auditoria_sincronizar() ->> 'documentos')::integer, 0, 'sincronizar de novo não registra nada');

-- ================================================================ leitura e códigos

select is(jsonb_array_length(public.auditoria_codigos_das_origens('documento', array[:'doc'::uuid])), 4, 'códigos das 4 versões do documento na trilha');
select is((select array_agg((c ->> 'versao_origem')::integer order by (c ->> 'versao')::integer)
             from jsonb_array_elements(public.auditoria_codigos_das_origens('canais', array[:'ws'::uuid])) c), array[1, 2, 3],
          'cada registro dos canais diz de que versão da lista ele é');

select pg_temp.como(:'admin');
set local role authenticated;
select is((select count(*)::integer from public.transparencia_documentos where id = :'doc'), 1, 'a administração lê os documentos');
reset role;
select pg_temp.como(:'editor');
set local role authenticated;
select is((select count(*)::integer from public.transparencia_documentos), 0, 'quem não é admin não vê nada');
select throws_ok(format('update public.transparencia_documentos set titulo = ''x'' where id = %L', :'doc'), '42501', null, 'e não escreve');
reset role;

select * from finish();
rollback;
