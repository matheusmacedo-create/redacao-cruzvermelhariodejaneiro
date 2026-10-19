-- Testes da foto do visitante pelo WhatsApp (supabase/migrations/20261019040000_cvrj_whatsapp_portaria_foto.sql)
-- e dos campos que a entrada pelo WhatsApp já grava (telefone, empresa, crachá e a autorização do visitante).
-- Mesmas regras de supabase/tests/auditoria.test.sql: só em banco local, numa transação desfeita no fim.
--
--   psql -v ON_ERROR_STOP=1 -d redacao_local < supabase/tests/whatsapp-portaria-foto.test.sql

\set QUIET 1
\pset format unaligned
\pset tuples_only on
\pset pager off

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select id as ws from public.workspaces where slug = 'producao' \gset
\set portaria '00000000-0000-4000-8000-0000000006a1'
\set outra '00000000-0000-4000-8000-0000000006a2'
\set comfator '00000000-0000-4000-8000-0000000006a3'
\set visitado '00000000-0000-4000-8000-0000000006a4'
\set escola '00000000-0000-4000-8000-0000000006a5'
insert into auth.users (id, email) values
  (:'portaria', 'portaria.foto@teste.invalid'), (:'outra', 'outra.foto@teste.invalid'), (:'comfator', 'fator.foto@teste.invalid'),
  (:'visitado', 'visitado.foto@teste.invalid'), (:'escola', 'escola.foto@teste.invalid');
insert into public.profiles (id, username, full_name) values
  (:'portaria', 'portaria.foto', 'Pessoa da Portaria'), (:'outra', 'outra.foto', 'Outra da Portaria'), (:'comfator', 'fator.foto', 'Pessoa com Fator'),
  (:'visitado', 'visitado.foto', 'Pessoa Visitada'), (:'escola', 'escola.foto', 'Pessoa da Escola');
insert into public.workspace_members (workspace_id, user_id, role) values
  (:'ws', :'portaria', 'editor'), (:'ws', :'outra', 'editor'), (:'ws', :'comfator', 'editor'), (:'ws', :'visitado', 'editor'), (:'ws', :'escola', 'escola');
insert into auth.mfa_factors (user_id, factor_type, status) values (:'comfator', 'totp', 'verified');

-- Zera também o claim.sub que a sessão simulada do WhatsApp deixa na transação (private.como_quem_escreveu_no_whatsapp).
create function pg_temp.como(p_usuario uuid, p_aal text default 'aal2') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated', 'aal', p_aal)::text, true),
         set_config('request.jwt.claim.sub', coalesce(p_usuario::text, ''), true)
$$;
create function pg_temp.foto(p_visita uuid) returns text language sql as $$
  select 'portaria/' || v.workspace_id || '/' || v.id || '/' || gen_random_uuid() || '.jpg' from public.portaria_visitas v where v.id = p_visita
$$;

-- ================================================================ privilégios

select ok(not has_function_privilege('authenticated', 'public.whatsapp_portaria_definir_foto(uuid, uuid, text)', 'execute')
          and not has_function_privilege('anon', 'public.whatsapp_portaria_definir_foto(uuid, uuid, text)', 'execute')
          and has_function_privilege('service_role', 'public.whatsapp_portaria_definir_foto(uuid, uuid, text)', 'execute'), 'foto em nome de alguém: só o servidor');
select ok((select prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'public.whatsapp_portaria_definir_foto(uuid, uuid, text)'::regprocedure),
          'security definer com search_path vazio');

-- ================================================================ a entrada pelo WhatsApp grava os campos do mini cadastro

set local role service_role;
select public.whatsapp_portaria_registrar_entrada(:'portaria', :'ws', jsonb_build_object(
  'nome', 'José Pereira', 'telefone', '5521987654321', 'empresa', 'Empresa XYZ', 'motivo', 'entrega de documentos',
  'cracha_numero', 'V-07', 'avisar_visitante', true, 'visitado_id', :'visitado', 'visitado_texto', '')) as visita \gset
select public.whatsapp_portaria_registrar_entrada(:'portaria', :'ws', jsonb_build_object('nome', 'Sem Telefone', 'avisar_visitante', true)) as sem_tel \gset
reset role;
select pg_temp.como(null);
select is((select row(telefone, empresa, motivo, cracha_numero, avisar_visitante, visitado_id, registrado_por)::text from public.portaria_visitas where id = :'visita'),
          row('5521987654321', 'Empresa XYZ', 'entrega de documentos', 'V-07', true, :'visitado'::uuid, :'portaria'::uuid)::text,
          'telefone, empresa, motivo, crachá, autorização e visitado entram; registrado_por é quem escreveu');
select is((select avisar_visitante from public.portaria_visitas where id = :'sem_tel'), false, 'autorização sem telefone não vale');

-- ================================================================ a foto, como quem escreveu

select pg_temp.foto(:'visita') as caminho1 \gset
select pg_temp.foto(:'visita') as caminho2 \gset
set local role service_role;
select is(public.whatsapp_portaria_definir_foto(:'portaria', :'visita', :'caminho1'), null::text, 'a primeira foto entra (sem caminho anterior)');
select is(public.whatsapp_portaria_definir_foto(:'portaria', :'visita', :'caminho2'), :'caminho1', 'a troca devolve o caminho anterior (o servidor apaga o arquivo)');
reset role;
select pg_temp.como(null);
select is((select foto_path from public.portaria_visitas where id = :'visita'), :'caminho2', 'a visita aponta para a foto nova');

set local role service_role;
select throws_ok(format('select public.whatsapp_portaria_definir_foto(%L, %L, null)', :'portaria', :'visita'), 'P0001', 'Foto inválida.', 'pelo WhatsApp não se tira a foto (só pela tela)');
select throws_ok(format('select public.whatsapp_portaria_definir_foto(%L, %L, %L)', :'portaria', :'visita', 'portaria/x/y/z.jpg'), 'P0001', 'Foto inválida.', 'caminho fora do formato');
select throws_ok(format('select public.whatsapp_portaria_definir_foto(%L, %L, %L)', :'portaria', :'visita', pg_temp.foto(:'sem_tel')), 'P0001', 'Foto inválida.', 'caminho de outra visita');
select throws_ok(format('select public.whatsapp_portaria_definir_foto(%L, %L, %L)', :'outra', :'visita', pg_temp.foto(:'visita')), 'P0001', 'Visita não encontrada.',
                 'outra pessoa da portaria não põe foto na visita que não registrou');
select throws_ok(format('select public.whatsapp_portaria_definir_foto(%L, %L, %L)', :'portaria', '00000000-0000-4000-8000-0000000006ff', pg_temp.foto(:'visita')), 'P0001', 'Visita não encontrada.',
                 'visita que não existe');
select throws_ok(format('select public.whatsapp_portaria_definir_foto(null, %L, %L)', :'visita', pg_temp.foto(:'visita')), 'P0001', 'Pessoa não informada.', 'sem a pessoa, nada');
reset role;
select pg_temp.como(null);

-- ================================================================ as regras da tela continuam valendo (portaria_definir_foto)

-- Quem usa a verificação em duas etapas registra pela tela (aal2), mas pelo WhatsApp (aal1) não põe foto.
select pg_temp.como(:'comfator', 'aal2');
set local role authenticated;
select public.portaria_registrar_entrada(:'ws', jsonb_build_object('nome', 'Visita da Tela')) as da_tela \gset
reset role;
select pg_temp.como(null);
set local role service_role;
select throws_ok(format('select public.whatsapp_portaria_definir_foto(%L, %L, %L)', :'comfator', :'da_tela', pg_temp.foto(:'da_tela')), 'P0001', 'Visita não encontrada.',
                 'sessão aal1 de quem usa a verificação em duas etapas não põe foto pelo WhatsApp');
reset role;
select pg_temp.como(null);

-- Autocadastro descartado por quem é da portaria: a visita descartada não recebe foto.
set local role service_role;
select public.portaria_autocadastro(:'ws', (select token from public.portaria_config where workspace_id = :'ws'), jsonb_build_object('nome', 'Pelo QR', 'motivo', 'reunião'), 'hash-de-teste') as do_qr \gset
reset role;
select pg_temp.como(:'portaria');
set local role authenticated;
select public.portaria_descartar(:'do_qr');
reset role;
select pg_temp.como(null);
set local role service_role;
select throws_ok(format('select public.whatsapp_portaria_definir_foto(%L, %L, %L)', :'portaria', :'do_qr', pg_temp.foto(:'do_qr')), 'P0001', 'Visita descartada.', 'visita descartada não recebe foto');
reset role;
select pg_temp.como(null);

-- A equipe da Escola não tem a portaria: nem a visita que um dia confirmou recebe foto dela pelo WhatsApp.
update public.portaria_visitas set confirmado_por = :'escola' where id = :'sem_tel';
set local role service_role;
select throws_ok(format('select public.whatsapp_portaria_definir_foto(%L, %L, %L)', :'escola', :'sem_tel', pg_temp.foto(:'sem_tel')), 'P0001', 'Visita não encontrada.', 'equipe da Escola: sem portaria, sem foto');
reset role;
select pg_temp.como(null);

select * from finish();
rollback;
