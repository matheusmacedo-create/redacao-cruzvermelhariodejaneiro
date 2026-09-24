-- Testes da trilha de auditoria (supabase/migrations/20260925203000_cvrj_auditoria.sql).
--
-- Rodar só num banco local com todas as migrações aplicadas, NUNCA em produção: a trilha só
-- aceita acréscimos e o teste desliga guardas para simular adulteração. Tudo corre numa
-- transação desfeita no fim. Como montar o banco local: docs/auditoria-publica.md, §10.
--
--   psql -v ON_ERROR_STOP=1 -d redacao_local < supabase/tests/auditoria.test.sql

\set QUIET 1
\pset format unaligned
\pset tuples_only on
\pset pager off

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select id as ws from public.workspaces where slug = 'producao' \gset
\set admin '00000000-0000-4000-8000-00000000000a'
\set editor '00000000-0000-4000-8000-00000000000e'

insert into auth.users (id, email) values (:'admin', 'admin@teste.invalid'), (:'editor', 'editor@teste.invalid');
insert into public.profiles (id, username, full_name) values (:'admin', 'admin.teste', 'Pessoa Admin'), (:'editor', 'editor.teste', 'Pessoa Editora');
insert into public.workspace_members (workspace_id, user_id, role) values (:'ws', :'admin', 'admin'), (:'ws', :'editor', 'editor');

create function pg_temp.como(p_usuario uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated', 'aal', 'aal2')::text, true)
$$;
create function pg_temp.sem_sessao() returns void language sql as $$
  select set_config('request.jwt.claims', '', true)
$$;
create function pg_temp.estado(p_item uuid) returns text language sql as $$
  select coalesce((select s.estado from auditoria.estado_item(p_item) s), 'vigente')
$$;
create function pg_temp.aplicar_caminho(p_folha bytea, p_caminho jsonb) returns bytea language plpgsql as $$
declare
  h bytea := p_folha;
  passo jsonb;
begin
  for passo in select * from jsonb_array_elements(p_caminho) loop
    if passo ->> 'lado' = 'direita' then h := sha256(h || decode(passo ->> 'hash', 'hex'));
    else h := sha256(decode(passo ->> 'hash', 'hex') || h); end if;
  end loop;
  return h;
end $$;
-- Refaz, fora do banco da trilha, o caminho do conteúdo até o compromisso do lote.
create function pg_temp.aplicar_prova(p jsonb) returns text language plpgsql as $$
declare
  h bytea;
begin
  h := sha256(decode(p ->> 'hash_conteudo', 'hex') || decode(p ->> 'nonce', 'hex'));
  h := pg_temp.aplicar_caminho(h, p -> 'caminho');
  if encode(h, 'hex') <> p ->> 'raiz' then return 'raiz não confere'; end if;
  return encode(sha256(h || decode(p ->> 'cabecas', 'hex') || decode(p ->> 'anterior', 'hex')), 'hex');
end $$;

-- ================================================================ privilégios

select ok(not has_schema_privilege('anon', 'auditoria', 'usage'), 'anon não usa o schema auditoria');
select ok(not has_schema_privilege('authenticated', 'auditoria', 'usage'), 'authenticated não usa o schema auditoria');
select ok(not has_schema_privilege('service_role', 'auditoria', 'usage'), 'service_role não usa o schema auditoria (só as funções)');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'auditoria\_%' and has_function_privilege('anon', p.oid, 'execute')),
          0, 'nenhuma função auditoria_* é executável por anon');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'auditoria\_%' and has_function_privilege('authenticated', p.oid, 'execute')),
          array['auditoria_item_interno', 'auditoria_painel'], 'authenticated só executa as funções que conferem admin');
select ok((select bool_and(has_function_privilege('service_role', p.oid, 'execute')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'auditoria\_%'), 'service_role executa todas as auditoria_*');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'auditoria' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
          0, 'nenhuma função interna é executável por anon ou authenticated');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'auditoria') and (p.proname like 'auditoria\_%' or n.nspname = 'auditoria')
              and p.prosecdef and not coalesce('search_path=""' = any (p.proconfig), false)),
          0, 'toda função security definer da trilha fixa search_path vazio');
select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'auditoria' and c.relkind = 'r' and not c.relrowsecurity), 0, 'RLS ligada em todas as tabelas da trilha');

set local role authenticated;
select throws_ok('select * from auditoria.itens', '42501', null, 'authenticated não lê itens');
select throws_ok('select public.auditoria_consultar(''X'')', '42501', null, 'authenticated não chama a consulta direto (só pela API)');
reset role;
set local role anon;
select throws_ok('select public.auditoria_fechar_lote(current_date - 1)', '42501', null, 'anon não fecha lote');
reset role;

-- ================================================================ utilitários

select ok((select bool_and(auditoria.gerar_codigo() ~ '^[0-9A-HJKMNP-TV-Z]{25}[048CGMRW]$') from generate_series(1, 500)),
          'código: 26 caracteres de Crockford, o último com os 2 bits finais em zero');
select is((select count(distinct c)::integer from (select auditoria.gerar_codigo() c from generate_series(1, 500)) x), 500, '500 códigos, nenhum repetido');
select is(auditoria.json_canonico('{"b":1,"a":{"d":[3,"x"],"c":null},"é":"ã\"\n"}'::jsonb),
          '{"a":{"c":null,"d":[3,"x"]},"b":1,"é":"ã\"\n"}', 'JSON canônico: chaves em ordem, sem espaços, escapes do JSON');
select is(auditoria.sha256_hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'SHA-256 de "abc"');

-- ================================================================ registro, versões e estados

select * from auditoria.registrar_item(:'ws', 'materia', '11111111-1111-4111-8111-111111111111', null,
          p_titulo => 'Primeira versão', p_url => 'https://cruzvermelhariodejaneiro.org/noticias/teste/',
          p_conteudo => '{"corpo":"um","titulo":"Primeira versão"}') \gset v1_
select is(:'v1_hash_conteudo', auditoria.sha256_hex('{"corpo":"um","titulo":"Primeira versão"}'), 'hash do item público = SHA-256 do conteúdo canônico');
select is(:'v1_classe'::text, 'P', 'matéria é classe P');
select is(:'v1_fluxo'::text, 'F13', 'matéria vai para o fluxo F13');
select is(:v1_versao, 1, 'primeira versão');
select is((select count(*)::integer from auditoria.eventos where item_id = :'v1_id'), 1, 'um evento de registro');
select is((select acao || '|' || hash_arquivo || '|' || (depois ->> 'versao') from auditoria.eventos where item_id = :'v1_id'),
          'item.registrado|' || :'v1_hash_conteudo' || '|1', 'o evento de registro leva o hash do conteúdo');

select is((auditoria.registrar_item(:'ws', 'materia', '11111111-1111-4111-8111-111111111111', null,
          p_conteudo => '{"corpo":"um","titulo":"Primeira versão"}')).id::text, :'v1_id', 'mesmo conteúdo: devolve o mesmo item');
select is((select count(*)::integer from auditoria.eventos where item_id = :'v1_id'), 1, 'e não grava evento novo');

select * from auditoria.registrar_item(:'ws', 'materia', '11111111-1111-4111-8111-111111111111', null,
          p_titulo => 'Segunda versão', p_url => 'https://cruzvermelhariodejaneiro.org/noticias/teste/',
          p_conteudo => '{"corpo":"dois","titulo":"Segunda versão"}') \gset v2_
select is(:v2_versao, 2, 'conteúdo novo: versão 2');
select is(:'v2_substitui_item_id'::text, :'v1_id', 'a versão 2 aponta a que substituiu');
select is(pg_temp.estado(:'v1_id'), 'substituido', 'a versão 1 fica substituída');
select is(pg_temp.estado(:'v2_id'), 'vigente', 'a versão 2 fica vigente');

select ok(auditoria.registrar_evento_item(:'v2_id', 'item.retirado', 'retirado_do_ar'), 'retirar a versão vigente');
select ok(not auditoria.registrar_evento_item(:'v2_id', 'item.retirado', 'retirado_do_ar'), 'retirar de novo não grava nada');
select is(pg_temp.estado(:'v2_id'), 'retirado', 'versão 2 retirada');
select throws_ok(format('select auditoria.registrar_evento_item(%L, ''item.retirado'', ''porque sim'')', :'v2_id'), 'P0001', null, 'motivo fora da lista é recusado');

select * from auditoria.registrar_item(:'ws', 'materia', '11111111-1111-4111-8111-111111111111', null,
          p_titulo => 'Segunda versão', p_url => 'https://cruzvermelhariodejaneiro.org/noticias/teste/',
          p_conteudo => '{"corpo":"dois","titulo":"Segunda versão"}') \gset v3_
select is(:v3_versao, 3, 'republicar depois de retirar abre a versão 3, mesmo com o mesmo texto');
select is(pg_temp.estado(:'v2_id'), 'substituido', 'a retirada passa a substituída pela volta');

select throws_ok($$select auditoria.registrar_item('00000000-0000-0000-0000-000000000000', 'boletim', null, repeat('a', 64))$$, 'P0001', null, 'tipo desconhecido é recusado');
select throws_ok(format($$select auditoria.registrar_item(%L, 'materia', null, repeat('a', 64), p_conteudo => 'x')$$, :'ws'), 'P0001', null, 'hash que não bate com o conteúdo é recusado');
select throws_ok(format($$select auditoria.registrar_item(%L, 'oficio', null, 'xyz')$$, :'ws'), 'P0001', null, 'hash inválido é recusado');

-- ================================================================ restrições da tabela

select throws_ok(format($$insert into auditoria.itens (classe, tipo, fluxo, workspace_id, hash_conteudo, conteudo_canonico)
                          values ('V', 'oficio', 'F14', %L, repeat('a', 64), 'texto')$$, :'ws'), '23514', null, 'item não público não guarda texto');
select throws_ok(format($$insert into auditoria.itens (classe, tipo, fluxo, workspace_id, hash_conteudo, conteudo_canonico)
                          values ('P', 'materia', 'F13', %L, repeat('a', 64), 'texto')$$, :'ws'), '23514', null, 'item público com hash errado é recusado');
select throws_ok(format($$insert into auditoria.itens (classe, tipo, fluxo, workspace_id, hash_conteudo)
                          values ('P', 'oficio', 'F14', %L, repeat('a', 64))$$, :'ws'), '23514', null, 'classe tem de casar com o tipo');
select throws_ok($$insert into auditoria.eventos (fluxo, entidade_tipo, papel, acao, depois)
                   values ('F19', 'teste', 'sistema', 'auditoria.lote_fechado', '{"nome":"Fulana"}')$$, '23514', null, 'depois só aceita as chaves da lista');
select throws_ok($$insert into auditoria.eventos (fluxo, entidade_tipo, papel, acao) values ('F19', 'teste', 'dono', 'auditoria.lote_fechado')$$,
                 '23514', null, 'papel fora da lista é recusado');
select throws_ok($$insert into auditoria.eventos (fluxo, entidade_tipo, papel, acao) values ('F19', 'teste', 'sistema', 'item.apagado')$$,
                 '23514', null, 'ação fora do catálogo é recusada');

-- ================================================================ só acréscimos

select throws_ok(format('update auditoria.itens set titulo_publico = ''outro'' where id = %L', :'v1_id'), 'P0001', null, 'item não se altera');
select throws_ok(format('delete from auditoria.itens where id = %L', :'v3_id'), 'P0001', null, 'item não se apaga');
select throws_ok(format('update auditoria.eventos set papel = ''admin'' where item_id = %L', :'v1_id'), 'P0001', null, 'evento não se altera');
select throws_ok(format('delete from auditoria.eventos where item_id = %L', :'v1_id'), 'P0001', null, 'evento não se apaga');
select throws_ok('truncate auditoria.eventos', 'P0001', null, 'eventos não se truncam');

-- ================================================================ a cadeia

select is((select count(*)::integer from (
            select e as linha, e.ordem_no_fluxo, e.hash_anterior, e.hash_linha,
                   lag(e.hash_linha) over (order by e.ordem_no_fluxo) as anterior_esperado,
                   row_number() over (order by e.ordem_no_fluxo) as n
              from auditoria.eventos e where e.fluxo = 'F13') x
           where x.ordem_no_fluxo <> x.n
              or x.hash_anterior <> coalesce(x.anterior_esperado, repeat('0', 64))
              or x.hash_linha <> auditoria.hash_do_evento(x.linha)),
          0, 'F13: ordem contínua, cada linha aponta a anterior e o hash confere');
select ok((select bool_and(e.ocorrido_em <= f.ocorrido_em) from auditoria.eventos e join auditoria.eventos f on f.fluxo = e.fluxo and f.ordem_no_fluxo = e.ordem_no_fluxo + 1),
          'a hora dos eventos nunca volta dentro de um fluxo');

select (public.auditoria_verificar_cadeia('script')) as verif \gset
select ok((:'verif'::jsonb ->> 'ok')::boolean, 'verificação da cadeia: tudo certo');
select is((select acao from auditoria.eventos where fluxo = 'F19' order by ordem_no_fluxo desc limit 1), 'auditoria.verificacao_ok', 'a verificação entra na cadeia F19');

savepoint adulteracao;
alter table auditoria.eventos disable trigger eventos_so_acrescimo;
update auditoria.eventos set depois = '{"motivo":"outro"}' where fluxo = 'F13' and ordem_no_fluxo = 2;
alter table auditoria.eventos enable trigger eventos_so_acrescimo;
select (public.auditoria_verificar_cadeia('script')) as verif_adulterada \gset
rollback to savepoint adulteracao;
select ok(not (:'verif_adulterada'::jsonb ->> 'ok')::boolean, 'evento alterado por fora: a verificação acusa');
select is((select (f ->> 'primeira_quebra_ordem')::integer from jsonb_array_elements(:'verif_adulterada'::jsonb -> 'fluxos') f where f ->> 'fluxo' = 'F13'),
          2, 'e aponta a primeira linha adulterada');

-- ================================================================ Merkle

select ok((select bool_and(pg_temp.aplicar_caminho(f.folhas[pos], auditoria.caminho_merkle(f.folhas, pos)) = auditoria.raiz_merkle(f.folhas))
             from (select n, array(select sha256(convert_to(n || ':' || k, 'UTF8')) from generate_series(1, n) k) as folhas
                     from generate_series(1, 17) n) f,
                  lateral generate_series(1, f.n) pos),
          'de 1 a 17 folhas: o caminho de cada folha leva à raiz');
select is(auditoria.raiz_merkle(array[sha256('a'::bytea)]), sha256('a'::bytea), 'uma folha: a raiz é a própria folha');
select is(auditoria.raiz_merkle(array[sha256('a'::bytea), sha256('b'::bytea), sha256('c'::bytea)]),
          sha256(sha256(sha256('a'::bytea) || sha256('b'::bytea)) || sha256('c'::bytea)), 'três folhas: a terceira sobe sem hash');
select is(auditoria.raiz_merkle('{}'::bytea[]), null::bytea, 'sem folhas, sem raiz');

-- ================================================================ lotes

select ((now() at time zone 'America/Sao_Paulo')::date) as hoje \gset
-- Itens de dias passados (inseridos direto: o registro normal usa a hora do relógio).
insert into auditoria.itens (classe, tipo, fluxo, workspace_id, hash_conteudo, conteudo_canonico, registrado_em)
select 'P', 'documento', 'F16', :'ws', auditoria.sha256_hex('{"n":' || k || '}'), '{"n":' || k || '}',
       case when k <= 2 then now() - interval '4 days' else now() - interval '2 days' end + k * interval '1 second'
  from generate_series(1, 7) k;

select throws_ok(format('select public.auditoria_fechar_lote(%L::date)', :'hoje'), 'P0001', null, 'o dia de hoje ainda não fecha');

select public.auditoria_fechar_lote(:'hoje'::date - 3) as lote1 \gset
select is((:'lote1'::jsonb ->> 'itens')::integer, 2, 'lote de 3 dias atrás: os 2 itens de 4 dias atrás');
select public.auditoria_fechar_lote(:'hoje'::date - 1) as lote2 \gset
select is((:'lote2'::jsonb ->> 'itens')::integer, 5, 'lote de ontem: os 5 itens restantes de dias passados (os de hoje ficam)');
select is(public.auditoria_fechar_lote(:'hoje'::date - 1), null, 'fechar o mesmo dia de novo não faz nada');
select is(public.auditoria_fechar_lote(:'hoje'::date - 2), null, 'dia anterior ao último lote também não');

select l.* from auditoria.lotes l where dia = :'hoje'::date - 3 \gset l1_
select l.* from auditoria.lotes l where dia = :'hoje'::date - 1 \gset l2_
select is(:'l1_compromisso_anterior', repeat('0', 64), 'o primeiro lote encadeia em 64 zeros');
select is(:'l2_compromisso_anterior'::text, :'l1_compromisso', 'o segundo lote encadeia no primeiro');
select is(:'l2_raiz', (
  with f as (select array_agg(decode(li.folha, 'hex') order by li.posicao) a from auditoria.lote_itens li where li.dia = :'hoje'::date - 1)
  select encode(sha256(sha256(sha256(a[1] || a[2]) || sha256(a[3] || a[4])) || a[5]), 'hex') from f),
  'raiz de 5 folhas conferida à mão');
select ok((select bool_and(li.folha = encode(sha256(decode(i.hash_conteudo, 'hex') || i.nonce), 'hex'))
             from auditoria.lote_itens li join auditoria.itens i on i.id = li.item_id), 'folha = SHA-256(hash do conteúdo || nonce)');
select ok((select array_agg(i.registrado_em order by li.posicao) = array_agg(i.registrado_em order by i.registrado_em, i.id)
             from auditoria.lote_itens li join auditoria.itens i on i.id = li.item_id where li.dia = :'hoje'::date - 1),
          'as folhas seguem a ordem de registro');
select is(:'l2_compromisso', encode(sha256(decode(:'l2_raiz', 'hex') || decode(:'l2_cabecas', 'hex') || decode(:'l2_compromisso_anterior', 'hex')), 'hex'),
          'compromisso = SHA-256(raiz || cabeças || anterior)');
select is(:'l2_manifesto', format('{"anterior":"%s","cabecas":"%s","compromisso":"%s","dia":"%s","origem":"cruzvermelhariodejaneiro.org","raiz":"%s","versao":1}',
                                  :'l2_compromisso_anterior', :'l2_cabecas', :'l2_compromisso', to_char(:'hoje'::date - 1, 'YYYY-MM-DD'), :'l2_raiz'),
          'manifesto no formato publicado');
select is(:'l2_hash_manifesto', auditoria.sha256_hex(:'l2_manifesto'), 'hash do manifesto');
select ok((select bool_and(exists (select 1 from auditoria.eventos e where e.fluxo = c ->> 'fluxo' and e.ordem_no_fluxo = (c ->> 'ordem')::bigint
                                                                    and e.hash_linha = c ->> 'hash'))
             from jsonb_array_elements(:'l2_cabecas_detalhe'::jsonb) c), 'as cabeças guardadas existem na cadeia');
select is((select count(*)::integer from auditoria.eventos where fluxo = 'F19' and acao = 'auditoria.lote_fechado'), 2, 'cada lote vira evento na F19');

select ok((select bool_and(pg_temp.aplicar_prova(public.auditoria_dados_prova(i.codigo)) = l.compromisso)
             from auditoria.lote_itens li join auditoria.itens i on i.id = li.item_id join auditoria.lotes l on l.dia = li.dia),
          'para cada item em lote, a prova leva do conteúdo ao compromisso do lote');
select is(public.auditoria_dados_prova(:'v3_codigo'), null, 'item de hoje ainda não tem prova');
select is((select public.auditoria_dados_prova(i.codigo) ->> 'classe' from auditoria.lote_itens li join auditoria.itens i on i.id = li.item_id limit 1), 'P',
          'os dados da prova dizem a classe (define o nome do arquivo)');

select is((public.auditoria_verificar_cadeia('script') ->> 'lotes_ok')::boolean, true, 'verificação confere os lotes');

savepoint adulteracao_lote;
alter table auditoria.itens disable trigger itens_so_acrescimo;
update auditoria.itens set nonce = extensions.gen_random_bytes(16)
 where id = (select item_id from auditoria.lote_itens where dia = :'hoje'::date - 1 and posicao = 3);
alter table auditoria.itens enable trigger itens_so_acrescimo;
select public.auditoria_verificar_cadeia('script') as verif_lote \gset
rollback to savepoint adulteracao_lote;
select ok(not (:'verif_lote'::jsonb ->> 'lotes_ok')::boolean, 'item de lote alterado por fora: a verificação acusa');
select is(:'verif_lote'::jsonb ->> 'primeiro_lote_com_falha', to_char(:'hoje'::date - 1, 'YYYY-MM-DD'), 'e aponta o lote');

-- Quem reescreve a cadeia inteira de forma coerente passa na conferência linha a linha, mas não
-- nas cabeças que o lote já ancorou.
savepoint reescrita;
alter table auditoria.eventos disable trigger eventos_so_acrescimo;
update auditoria.eventos set depois = '{"motivo":"outro"}' where fluxo = 'F13' and ordem_no_fluxo = 2;
do $$
declare
  e auditoria.eventos;
  v_anterior text;
begin
  select hash_linha into v_anterior from auditoria.eventos where fluxo = 'F13' and ordem_no_fluxo = 1;
  for e in select * from auditoria.eventos where fluxo = 'F13' and ordem_no_fluxo >= 2 order by ordem_no_fluxo loop
    e.hash_anterior := v_anterior;
    e.hash_linha := auditoria.hash_do_evento(e);
    update auditoria.eventos set hash_anterior = e.hash_anterior, hash_linha = e.hash_linha where seq = e.seq;
    v_anterior := e.hash_linha;
  end loop;
end $$;
alter table auditoria.eventos enable trigger eventos_so_acrescimo;
select public.auditoria_verificar_cadeia('script') as verif_reescrita \gset
rollback to savepoint reescrita;
select ok((select bool_and((f ->> 'ok')::boolean) from jsonb_array_elements(:'verif_reescrita'::jsonb -> 'fluxos') f),
          'cadeia reescrita com coerência passa linha a linha');
select ok(not (:'verif_reescrita'::jsonb ->> 'lotes_ok')::boolean, 'mas as cabeças ancoradas no lote acusam a reescrita');

-- Assinatura, carimbos e publicação.
select ok(public.auditoria_assinar_lote(:'hoje'::date - 1, repeat('A', 86) || '==', '0123456789abcdef'), 'assinar o lote');
select ok(not public.auditoria_assinar_lote(:'hoje'::date - 1, repeat('B', 86) || '==', '0123456789abcdef'), 'segunda assinatura não entra');
select is(public.auditoria_consultar((select i.codigo from auditoria.lote_itens li join auditoria.itens i on i.id = li.item_id
                                       where li.dia = :'hoje'::date - 1 limit 1)) -> 'lote' ->> 'ots', 'false', 'antes do OpenTimestamps, o lote diz que ainda não tem prova');
select throws_ok(format('update auditoria.lotes set assinatura = %L where dia = %L', repeat('C', 86) || '==', :'hoje'::date - 1), 'P0001', null, 'assinatura não se troca por fora');
select throws_ok(format('update auditoria.lotes set manifesto = ''{}'' where dia = %L', :'hoje'::date - 1), 'P0001', null, 'manifesto não muda');
select throws_ok(format('delete from auditoria.lotes where dia = %L', :'hoje'::date - 1), 'P0001', null, 'lote não se apaga');
select ok(public.auditoria_gravar_ots(:'hoje'::date - 1, encode('prova-pendente'::bytea, 'base64'), 'enviado'), 'gravar o .ots enviado');
select ok(not public.auditoria_gravar_ots(:'hoje'::date - 1, encode('outra-rodada'::bytea, 'base64'), 'enviado'), 'segundo envio do mesmo lote não entra');
select is((select convert_from(ots, 'UTF8') from auditoria.lotes where dia = :'hoje'::date - 1), 'prova-pendente', 'fica a prova do primeiro envio');
select ok(public.auditoria_gravar_ots(:'hoje'::date - 1, null, null, null, 'calendário fora do ar', now() + interval '6 hours'), 'registrar tentativa sem progresso');
select is((select ots_estado || '|' || tentativas || '|' || ultimo_erro from auditoria.lotes where dia = :'hoje'::date - 1),
          'enviado|1|calendário fora do ar', 'a tentativa fica registrada');
select ok(public.auditoria_gravar_ots(:'hoje'::date - 1, encode('prova-confirmada'::bytea, 'base64'), 'confirmado', 900000), 'confirmar no Bitcoin');
select ok(not public.auditoria_gravar_ots(:'hoje'::date - 1, encode('outra'::bytea, 'base64'), 'confirmado', 1), 'confirmado não muda mais');
select throws_ok(format('update auditoria.lotes set bloco = 1 where dia = %L', :'hoje'::date - 1), 'P0001', null, 'bloco confirmado não se troca por fora');
select ok(public.auditoria_gravar_tsr(:'hoje'::date - 1, encode('carimbo-rfc3161'::bytea, 'base64')), 'gravar o carimbo RFC 3161');
select ok(not public.auditoria_gravar_tsr(:'hoje'::date - 1, encode('outro'::bytea, 'base64')), 'carimbo RFC 3161 não se troca');
select ok((select bool_or((x ->> 'dia')::date = :'hoje'::date - 1 and (x ->> 'precisa_publicar')::boolean)
             from jsonb_array_elements(public.auditoria_lotes_pendentes(10)) x), 'lote pronto aparece para publicar');
select ok(public.auditoria_marcar_publicado(:'hoje'::date - 1), 'marcar publicado');
select ok(not exists (select 1 from jsonb_array_elements(public.auditoria_lotes_pendentes(10)) x where (x ->> 'dia')::date = :'hoje'::date - 1),
          'lote assinado, carimbado, confirmado e publicado sai da fila');
select is(jsonb_array_length(public.auditoria_indice_lotes()), 2, 'índice público com os 2 lotes');

-- Espelho no R2 (lib/auditoria/espelho.ts).
select is(jsonb_array_length(public.auditoria_lotes_para_espelhar(10)), 2, 'espelho: os 2 lotes ainda não copiados');
select x ->> 'versao' as versao_espelho from jsonb_array_elements(public.auditoria_lotes_para_espelhar(10)) x
 where (x ->> 'dia')::date = :'hoje'::date - 1 \gset
select is(:'versao_espelho'::timestamptz,
          (select greatest(fechado_em, assinado_em, tsr_em, ots_enviado_em, ots_confirmado_em) from auditoria.lotes where dia = :'hoje'::date - 1),
          'a versão do espelho é a última mudança nos arquivos do lote');
select ok(public.auditoria_marcar_espelhado(:'hoje'::date - 1, :'versao_espelho'::timestamptz), 'marcar espelhado com a versão lida');
select ok(not exists (select 1 from jsonb_array_elements(public.auditoria_lotes_para_espelhar(10)) x where (x ->> 'dia')::date = :'hoje'::date - 1),
          'lote espelhado sai da fila do espelho');
select ok(not public.auditoria_marcar_espelhado(:'hoje'::date - 1, :'versao_espelho'::timestamptz - interval '1 hour'), 'versão mais velha não desfaz a marca');
select x ->> 'versao' as versao_lote1 from jsonb_array_elements(public.auditoria_lotes_para_espelhar(10)) x
 where (x ->> 'dia')::date = :'hoje'::date - 3 \gset
select ok(public.auditoria_marcar_espelhado(:'hoje'::date - 3, :'versao_lote1'::timestamptz), 'o outro lote também espelhado');
select is(jsonb_array_length(public.auditoria_lotes_para_espelhar(10)), 0, 'fila do espelho vazia');
savepoint espelho;
select public.auditoria_assinar_lote(:'hoje'::date - 3, repeat('D', 86) || '==', '0123456789abcdef') as espelho_assinou \gset
select exists (select 1 from jsonb_array_elements(public.auditoria_lotes_para_espelhar(10)) x
                where (x ->> 'dia')::date = :'hoje'::date - 3 and x ->> 'assinatura' is not null) as espelho_volta \gset
rollback to savepoint espelho;
select ok(:'espelho_assinou'::boolean and :'espelho_volta'::boolean, 'arquivo novo no lote (a assinatura que chegou depois) o devolve à fila do espelho');
select lives_ok(format('update auditoria.lotes set espelhado_em = clock_timestamp() where dia = %L', :'hoje'::date - 1), 'a guarda do lote deixa gravar a marca do espelho');

-- ================================================================ consulta pública

select public.auditoria_consultar(:'v3_codigo') as c3 \gset
select is(:'c3'::jsonb ->> 'estado', 'vigente', 'consulta: vigente');
select is(:'c3'::jsonb ->> 'titulo', 'Segunda versão', 'título público do registro');
select ok((:'c3'::jsonb -> 'lote') = 'null'::jsonb, 'item de hoje: prova em confirmação');
select ok(not (:'c3'::jsonb ?| array['fluxo', 'ator_id', 'papel', 'ordem_no_fluxo', 'referencia_id', 'workspace_id', 'nonce', 'conteudo_canonico']),
          'a projeção pública não expõe fluxo, ator, papel, posição, origem nem nonce');
select is(public.auditoria_consultar(:'v1_codigo') ->> 'estado', 'substituido', 'versão antiga: substituída');
select is(public.auditoria_consultar(:'v1_codigo') -> 'substituido_por' ->> 'codigo', :'v2_codigo', 'e aponta a sucessora');
select is(public.auditoria_consultar(lower(regexp_replace(:'v3_codigo', '(.{5})', '\1-', 'g'))) ->> 'codigo', :'v3_codigo',
          'código em minúsculas e com hífens também serve');
select is(public.auditoria_consultar(' ' || replace(:'v3_codigo', '0', 'O') || ' ') ->> 'codigo', :'v3_codigo', 'O no lugar de 0 também serve');
select is(public.auditoria_consultar('ZZZZZZZZZZZZZZZZZZZZZZZZZ0'), '{"encontrado": false}'::jsonb, 'código inexistente');
select is(public.auditoria_consultar(repeat('x', 5000)), '{"encontrado": false}'::jsonb, 'entrada absurda');
select is(public.auditoria_consultar_hash(:'v3_hash_conteudo') ->> 'codigo', :'v3_codigo', 'por hash: o registro mais recente');
select is((public.auditoria_consultar_hash(:'v3_hash_conteudo') ->> 'primeiro_registro_em')::timestamptz, :'v2_registrado_em'::timestamptz,
          'e a data do primeiro registro daquele conteúdo');
select is(public.auditoria_consultar_hash('nada'), '{"encontrado": false}'::jsonb, 'hash inválido');
select is(public.auditoria_conteudo(:'v1_codigo'), '{"corpo":"um","titulo":"Primeira versão"}', 'texto canônico do item público');
select ok((select bool_and((public.auditoria_consultar(i.codigo) -> 'lote' ->> 'compromisso') = l.compromisso)
             from auditoria.lote_itens li join auditoria.itens i on i.id = li.item_id join auditoria.lotes l on l.dia = li.dia),
          'item em lote mostra o compromisso do lote');
select is(public.auditoria_consultar((select i.codigo from auditoria.lote_itens li join auditoria.itens i on i.id = li.item_id
                                       where li.dia = :'hoje'::date - 1 limit 1)) -> 'lote' -> 'bitcoin', '{"bloco": 900000, "confirmado": true}'::jsonb,
          'e o bloco do Bitcoin quando confirmado');

-- ================================================================ ganchos: ofícios

select pg_temp.como(:'admin');
insert into public.oficios (workspace_id, criado_por, assunto, corpo) values (:'ws', :'admin', 'Pedido de apoio', 'Texto') returning id as of1, codigo_verificacao as of1_codigo \gset
update public.oficios set estado = 'em_assinatura', ano = 2026, numero = 901, hash_documento = repeat('b', 64), conteudo_canonico = 'x', emitido_em = now()
 where id = :'of1';
select is((select count(*)::integer from auditoria.itens where referencia_id = :'of1'), 0, 'ofício em assinatura ainda não entra');
update public.oficios set estado = 'assinado', assinado_em = now(), manifesto = '{}', hash_manifesto = repeat('c', 64) where id = :'of1';
select i.* from auditoria.itens i where i.tipo = 'oficio' and i.referencia_id = :'of1' \gset of1_i_
select is(:'of1_i_codigo_externo'::text, :'of1_codigo', 'ofício assinado entra com o código já impresso');
select is(:'of1_i_hash_conteudo', repeat('c', 64), 'o hash é o do manifesto de assinaturas');
select is(:'of1_i_classe'::text, 'V', 'ofício é classe V');
select is((select ator_id::text || '|' || papel from auditoria.eventos where item_id = :'of1_i_id'), :'admin' || '|admin', 'quem assinou fica como ator, com o papel');
select public.auditoria_consultar(upper(:'of1_codigo')) as cof \gset
select is(:'cof'::jsonb ->> 'classe', 'V', 'consulta pelo código do ofício');
select ok(:'cof'::jsonb ->> 'registrado_em' ~ '^\d{4}-\d{2}-\d{2}$', 'classe V mostra só o dia do registro');
select ok((:'cof'::jsonb -> 'titulo') = 'null'::jsonb and (:'cof'::jsonb -> 'url') = 'null'::jsonb, 'classe V não mostra título nem endereço');
update public.oficios set estado = 'cancelado', cancelado_por = :'admin', cancelado_em = now(), motivo_cancelamento = 'Erro de destinatário' where id = :'of1';
select is(public.auditoria_consultar(:'of1_codigo') ->> 'estado', 'revogado', 'ofício cancelado: revogado');
select is((select depois ->> 'motivo' from auditoria.eventos where item_id = :'of1_i_id' and acao = 'item.revogado'), 'decisao_administrativa',
          'o motivo vai como código; o texto livre fica no ofício');

insert into public.oficios (workspace_id, criado_por, assunto, corpo, modo_assinatura) values (:'ws', :'admin', 'Convênio', 'Texto', 'govbr') returning id as of2 \gset
update public.oficios set estado = 'em_assinatura', ano = 2026, numero = 902, hash_documento = repeat('b', 64), conteudo_canonico = 'x', emitido_em = now(),
       pdf_original_sha256 = repeat('e', 64), pdf_atual_sha256 = repeat('d', 64) where id = :'of2';
update public.oficios set estado = 'assinado', assinado_em = now(), manifesto = '{}', hash_manifesto = repeat('9', 64) where id = :'of2';
select is(public.auditoria_consultar_hash(repeat('d', 64)) ->> 'tipo', 'oficio', 'ofício do gov.br: o PDF assinado é encontrado pelo hash do arquivo');

-- ================================================================ ganchos: certificados

insert into public.participantes (workspace_id, vinculo, nome) values (:'ws', 'voluntario', 'Pessoa de Teste') returning id as part \gset
insert into public.certificados (workspace_id, participante_id, codigo, nome, curso_titulo, carga_horaria, emitido_em)
values (:'ws', :'part', 'ABCD-EFGH', 'Pessoa de Teste', 'Primeiros Socorros', 8.0, '2026-09-20 12:00:00+00') returning id as cert1 \gset
select is((select hash_conteudo from auditoria.itens where referencia_id = :'cert1'),
          auditoria.sha256_hex('{"carga_horaria":8,"codigo":"ABCD-EFGH","curso":"Primeiros Socorros","emitido_em":"2026-09-20T12:00:00Z","nome":"Pessoa de Teste","valido_ate":null}'),
          'certificado: hash do JSON canônico');
select public.auditoria_consultar('abcd-efgh') as ccert \gset
select is(:'ccert'::jsonb -> 'certificado' ->> 'nome', 'Pessoa de Teste', 'consulta pelo código impresso mostra o certificado');
select is(:'ccert'::jsonb -> 'certificado' ->> 'carga_horaria', '8', 'carga horária sem casas vazias');
select is(:'ccert'::jsonb ->> 'classe', 'C', 'certificado é classe C');
update public.certificados set revogado_em = now(), revogado_por = :'admin', motivo_revogacao = 'Emitido por engano' where id = :'cert1';
select is(public.auditoria_consultar('ABCD-EFGH') ->> 'estado', 'revogado', 'certificado revogado');
insert into public.certificados (workspace_id, participante_id, codigo, nome, curso_titulo) values (:'ws', :'part', 'JKMN-PQRS', 'Pessoa de Teste', 'Suporte Básico de Vida')
returning id as cert2 \gset
delete from public.certificados where id = :'cert2';
select is(public.auditoria_consultar('JKMN-PQRS') ->> 'estado', 'retirado', 'certificado apagado: retirado');
select ok((public.auditoria_consultar('JKMN-PQRS') -> 'certificado') = 'null'::jsonb, 'e os dados da pessoa não aparecem mais');

-- Falha no registro não derruba a emissão.
insert into auditoria.itens (classe, tipo, fluxo, workspace_id, hash_conteudo, codigo_externo)
values ('C', 'certificado', 'F15', :'ws', repeat('7', 64), 'WXYZ-2345');
select lives_ok(format($$insert into public.certificados (workspace_id, participante_id, codigo, nome, curso_titulo) values (%L, %L, 'WXYZ-2345', 'Outra Pessoa', 'Curso')$$,
                       :'ws', :'part'), 'emissão segue mesmo com a trilha recusando');
select is((select origem from auditoria.falhas order by id desc limit 1), 'gancho_certificado', 'e a falha fica registrada');

-- ================================================================ ganchos: matérias (com a sessão e a RLS de verdade)

insert into public.content_pieces (workspace_id, title, subtitle, body, created_by) values (:'ws', 'Campanha de inverno', null, 'Corpo da matéria', :'admin')
returning id as mat \gset
select pg_temp.como(:'editor');
set local role authenticated;
update public.content_pieces set site_url = 'https://cruzvermelhariodejaneiro.org/noticias/campanha-de-inverno/', slug = 'campanha-de-inverno',
       site_published_at = '2026-09-24 10:00:00+00', updated_at = '2026-09-24 10:00:00+00' where id = :'mat';
reset role;
select i.* from auditoria.itens i where i.tipo = 'materia' and i.referencia_id = :'mat' \gset mat1_
select is(:'mat1_conteudo_canonico'::text, '{"corpo":"Corpo da matéria","subtitulo":null,"titulo":"Campanha de inverno","url":"https://cruzvermelhariodejaneiro.org/noticias/campanha-de-inverno/"}',
          'matéria publicada: conteúdo canônico');
select is(:'mat1_url_publica'::text, 'https://cruzvermelhariodejaneiro.org/noticias/campanha-de-inverno/', 'com o endereço público');
select is((select papel from auditoria.eventos where item_id = :'mat1_id'), 'editor', 'publicada por quem tem papel de editor, pela RLS normal');
update public.content_pieces set site_published_at = '2026-09-24 11:00:00+00', updated_at = '2026-09-24 11:00:00+00' where id = :'mat';
select is((select count(*)::integer from auditoria.itens where referencia_id = :'mat'), 1, 'republicar o mesmo texto não abre versão');
update public.content_pieces set body = 'Corpo corrigido', site_published_at = '2026-09-24 12:00:00+00', updated_at = '2026-09-24 12:00:00+00' where id = :'mat';
select is((select max(versao) from auditoria.itens where referencia_id = :'mat'), 2, 'republicar texto corrigido abre a versão 2');
update public.content_pieces set site_url = null, site_published_at = null where id = :'mat';
select is(public.auditoria_consultar((select codigo from auditoria.itens where referencia_id = :'mat' and versao = 2)) ->> 'estado', 'retirado',
          'tirar do ar: retirada');

-- ================================================================ ganchos: comunicados

insert into public.press_campanhas (workspace_id, assunto, corpo, estado, enviada_por, enviada_em)
values (:'ws', 'Nota à imprensa', 'Texto da nota', 'enviando', :'admin', '2026-09-24 09:00:00+00') returning id as camp \gset
select pg_temp.sem_sessao();
update public.press_campanhas set estado = 'enviada', concluida_em = now() where id = :'camp';
select is((select conteudo_canonico from auditoria.itens where referencia_id = :'camp'),
          '{"assunto":"Nota à imprensa","corpo":"Texto da nota","enviado_em":"2026-09-24T09:00:00Z","link_rotulo":null,"link_url":null}',
          'comunicado enviado: conteúdo canônico');
select is((select ator_id::text || '|' || papel from auditoria.eventos e join auditoria.itens i on i.id = e.item_id where i.referencia_id = :'camp'),
          :'admin' || '|admin', 'sem sessão (fila do servidor), o ator é quem mandou enviar');

-- ================================================================ sincronização

alter table public.certificados disable trigger certificados_trilha_emissao;
insert into public.certificados (workspace_id, participante_id, codigo, nome, curso_titulo) values (:'ws', :'part', 'TUVW-XYZ2', 'Pessoa de Teste', 'Curso antigo');
alter table public.certificados enable trigger certificados_trilha_emissao;
alter table public.content_pieces disable trigger content_pieces_trilha;
insert into public.content_pieces (workspace_id, title, body, site_url, site_published_at, updated_at)
values (:'ws', 'Antiga no ar', 'Texto', 'https://cruzvermelhariodejaneiro.org/noticias/antiga/', '2026-09-01 10:00:00+00', '2026-09-01 10:00:00+00'),
       (:'ws', 'Editada depois', 'Texto novo', 'https://cruzvermelhariodejaneiro.org/noticias/editada/', '2026-09-01 10:00:00+00', '2026-09-05 10:00:00+00');
alter table public.content_pieces enable trigger content_pieces_trilha;
select public.auditoria_sincronizar() as sinc \gset
select is((:'sinc'::jsonb ->> 'certificados')::integer, 1, 'sincronizar registra o certificado que o gancho não viu');
select is((:'sinc'::jsonb ->> 'materias')::integer, 1, 'e a matéria no ar sem edição depois da publicação');
select ok(not exists (select 1 from auditoria.itens where titulo_publico = 'Editada depois'), 'matéria editada depois de publicada não é registrada no escuro');
select is((:'sinc'::jsonb ->> 'falhas')::integer, 1, 'o certificado com código em conflito continua como falha');
select is((:'sinc'::jsonb ->> 'falhas_24h')::integer, 2, 'e as falhas das últimas 24 horas vão no resumo (gancho + sincronização)');
select is((public.auditoria_sincronizar() ->> 'materias')::integer, 0, 'sincronizar de novo não registra nada');

-- ================================================================ limite de consultas

select ok(public.auditoria_permitir(repeat('a', 64), 2), '1ª consulta');
select ok(public.auditoria_permitir(repeat('a', 64), 2), '2ª consulta');
select ok(not public.auditoria_permitir(repeat('a', 64), 2), '3ª consulta passa do limite');
select ok(public.auditoria_permitir(repeat('b', 64), 2), 'outra chave tem a sua cota');
select throws_ok($$select public.auditoria_permitir('192.168.0.1', 2)$$, 'P0001', null, 'IP em claro é recusado como chave');

-- ================================================================ visão da administração

select pg_temp.como(:'admin');
select ok(public.auditoria_painel(:'ws') ?& array['verificacao', 'lotes', 'falhas', 'totais', 'recentes', 'pendentes_de_lote'], 'painel para a administração');
select is(public.auditoria_item_interno(:'ws', :'of1_codigo') -> 'eventos' -> 1 ->> 'acao', 'item.revogado', 'história do item para a administração');
select pg_temp.como(:'editor');
select throws_ok(format('select public.auditoria_painel(%L)', :'ws'), 'P0001', null, 'quem não é admin não vê o painel');

select * from finish();
rollback;
