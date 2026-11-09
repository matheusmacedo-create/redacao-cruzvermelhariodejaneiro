-- Testes da fila de campanhas, da supressão e dos eventos do Resend
-- (supabase/migrations/20261109120000_cvrj_envio_em_fila.sql).
-- Mesmas regras de supabase/tests/auditoria.test.sql: só em banco local, numa transação desfeita no fim.
--
--   psql -v ON_ERROR_STOP=1 -d redacao_local < supabase/tests/fila-de-campanhas.test.sql

\set QUIET 1
\pset format unaligned
\pset tuples_only on
\pset pager off

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select id as ws from public.workspaces where slug = 'producao' \gset
\set editor   '00000000-0000-4000-8000-0000000000f1'
\set estranho '00000000-0000-4000-8000-0000000000f2'
insert into auth.users (id, email) values (:'editor', 'editor.fila@teste.invalid'), (:'estranho', 'estranho.fila@teste.invalid');
insert into public.profiles (id, username, full_name) values (:'editor', 'editor.fila', 'Edu Editor'), (:'estranho', 'estranho.fila', 'Ester de Fora');
insert into public.workspace_members (workspace_id, user_id, role) values (:'ws', :'editor', 'editor');
create function pg_temp.como(p_usuario uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated', 'aal', 'aal2')::text, true)
$$;

\set ana  '00000000-0000-4000-8000-00000000c001'
\set beto '00000000-0000-4000-8000-00000000c002'
\set caio '00000000-0000-4000-8000-00000000c003'
\set dani '00000000-0000-4000-8000-00000000c004'
\set eva  '00000000-0000-4000-8000-00000000c005'
\set fabi '00000000-0000-4000-8000-00000000c006'
\set gil  '00000000-0000-4000-8000-00000000c007'
\set hugo '00000000-0000-4000-8000-00000000c008'
\set iris '00000000-0000-4000-8000-00000000c009'
\set joca '00000000-0000-4000-8000-00000000c010'
\set lia  '00000000-0000-4000-8000-00000000c011'
\set mel  '00000000-0000-4000-8000-00000000c012'
insert into public.press_contacts (id, workspace_id, nome, email, email_status, descadastrado_em, created_by) values
  (:'ana',  :'ws', 'Ana Souza',      'ana@jornal.teste.invalid',     'valido',         null,  :'editor'),
  (:'beto', :'ws', 'Beto Lima',      'Beto@TV.teste.invalid',        'nao_verificado', null,  :'editor'),
  (:'caio', :'ws', 'Caio Sem Email', null,                           'nao_verificado', null,  :'editor'),
  (:'dani', :'ws', 'Dani Devolvida', 'dani@morto.teste.invalid',     'invalido',       null,  :'editor'),
  (:'eva',  :'ws', 'Eva Saiu',       'eva@saiu.teste.invalid',       'valido',         now(), :'editor'),
  (:'fabi', :'ws', 'Fabi Rádio',     'fabi@radio.teste.invalid',     'valido',         null,  :'editor'),
  (:'gil',  :'ws', 'Gil Suprimido',  'Gil@Suprimido.teste.invalid',  'valido',         null,  :'editor'),
  (:'hugo', :'ws', 'Hugo Portal',    'hugo@portal.teste.invalid',    'valido',         null,  :'editor'),
  (:'iris', :'ws', 'Iris Agência',   'iris@agencia.teste.invalid',   'valido',         null,  :'editor'),
  (:'joca', :'ws', 'Joca Revista',   'joca@revista.teste.invalid',   'valido',         null,  :'editor'),
  (:'lia',  :'ws', 'Lia Podcast',    'lia@podcast.teste.invalid',    'valido',         null,  :'editor'),
  (:'mel',  :'ws', 'Mel Blog',       'mel@blog.teste.invalid',       'valido',         null,  :'editor');
-- A supressão guarda em minúsculas; o contato do Gil está com maiúsculas.
insert into public.email_supressoes (workspace_id, email, motivo) values (:'ws', 'gil@suprimido.teste.invalid', 'devolucao');
-- A fila anda por ordem de chegada; todos chegam no mesmo instante, então o teste fixa a ordem.
create function pg_temp.em_ordem(p_campanha uuid, p_nomes text[]) returns void language sql as $$
  update public.press_campanha_destinatarios d
     set created_at = now() - interval '1 hour' + (o.n * interval '1 second')
    from unnest(p_nomes) with ordinality as o(nome, n)
   where d.campanha_id = p_campanha and d.nome = o.nome
$$;

-- ================================================================ privilégios

select ok(has_function_privilege('service_role', 'public.enfileirar_campanha(uuid, uuid, uuid, text, text, text, text, uuid[], timestamptz)', 'execute')
          and not has_function_privilege('authenticated', 'public.enfileirar_campanha(uuid, uuid, uuid, text, text, text, text, uuid[], timestamptz)', 'execute')
          and not has_function_privilege('anon', 'public.enfileirar_campanha(uuid, uuid, uuid, text, text, text, text, uuid[], timestamptz)', 'execute'), 'pôr na fila: só o servidor');
select ok(has_function_privilege('service_role', 'public.reservar_lote_de_campanha(uuid, integer)', 'execute')
          and not has_function_privilege('authenticated', 'public.reservar_lote_de_campanha(uuid, integer)', 'execute')
          and not has_function_privilege('anon', 'public.reservar_lote_de_campanha(uuid, integer)', 'execute'), 'reservar lote: só o servidor');
select ok(has_function_privilege('service_role', 'public.confirmar_lote_de_campanha(uuid[], text[])', 'execute')
          and not has_function_privilege('authenticated', 'public.confirmar_lote_de_campanha(uuid[], text[])', 'execute')
          and not has_function_privilege('anon', 'public.confirmar_lote_de_campanha(uuid[], text[])', 'execute'), 'confirmar lote: só o servidor');
select ok(has_function_privilege('service_role', 'public.concluir_campanhas_terminadas()', 'execute')
          and not has_function_privilege('authenticated', 'public.concluir_campanhas_terminadas()', 'execute')
          and not has_function_privilege('anon', 'public.concluir_campanhas_terminadas()', 'execute'), 'fechar campanhas: só o servidor');
select ok(has_function_privilege('service_role', 'public.concluir_campanha(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.concluir_campanha(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.concluir_campanha(uuid)', 'execute'), 'fechar uma campanha: só o servidor');
select ok(has_function_privilege('service_role', 'public.registrar_evento_de_email(text, text, text, text)', 'execute')
          and not has_function_privilege('authenticated', 'public.registrar_evento_de_email(text, text, text, text)', 'execute')
          and not has_function_privilege('anon', 'public.registrar_evento_de_email(text, text, text, text)', 'execute'), 'evento do Resend: só o servidor');

select ok(has_table_privilege('authenticated', 'public.email_supressoes', 'select'), 'quem está logado lê a supressão (o RLS filtra)');
select ok(not has_table_privilege('authenticated', 'public.email_supressoes', 'insert')
          and not has_table_privilege('authenticated', 'public.email_supressoes', 'update')
          and not has_table_privilege('authenticated', 'public.email_supressoes', 'delete'), 'ninguém logado escreve na supressão');
select ok(not has_table_privilege('anon', 'public.email_supressoes', 'select'), 'anon não lê a supressão');

select pg_temp.como(:'editor');
set local role authenticated;
select is((select count(*)::int from public.email_supressoes), 1, 'membro do espaço vê a supressão');
reset role;
select pg_temp.como(:'estranho');
set local role authenticated;
select is((select count(*)::int from public.email_supressoes), 0, 'quem não é do espaço não vê a supressão');
reset role;

-- ================================================================ pôr na fila

select is((select count(*)::int from public.enfileirar_campanha(:'ws', :'editor', null, 'Só quem não pode', 'Texto da mensagem.', '', '',
  array[:'caio', :'dani', :'eva', :'gil']::uuid[], null)), 0, 'sem ninguém que possa receber, não devolve campanha');
select is((select count(*)::int from public.press_campanhas where assunto = 'Só quem não pode'), 0, '… e não grava nada');

select id_da_campanha as c1, total as t1 from public.enfileirar_campanha(:'ws', :'editor', null, 'Release 1', 'Olá, {nome}!', 'https://exemplo.invalid/r1', 'Leia',
  array[:'ana', :'beto', :'caio', :'dani', :'eva', :'fabi', :'gil']::uuid[], null) \gset
select is(:t1, 3, 'sem e-mail, inválido, quem saiu e quem está na supressão ficam de fora');
select is((select estado from public.press_campanhas where id = :'c1'), 'enviando', 'sem hora marcada, a campanha já está em envio');
select ok((select em_fila and enviada_em is not null and agendada_para is null and total_destinatarios = 3 and enviada_por = :'editor'
             from public.press_campanhas where id = :'c1'), 'entra marcada para a fila, com o total e o autor');
select is((select array_agg(nome order by nome) from public.press_campanha_destinatarios where campanha_id = :'c1' and estado = 'na_fila'),
  array['Ana Souza', 'Beto Lima', 'Fabi Rádio'], 'os três que podem receber estão na fila');
select pg_temp.em_ordem(:'c1', array['Ana Souza', 'Beto Lima', 'Fabi Rádio']);

-- Rascunho que vira campanha, e só uma vez.
insert into public.press_campanhas (workspace_id, assunto, corpo, estado, enviada_por) values (:'ws', 'Rascunho', 'Texto', 'rascunho', :'editor')
returning id as r1 \gset
-- Sobra de um agendamento cancelado: não pode ir junto com a lista nova.
insert into public.press_campanha_destinatarios (campanha_id, workspace_id, contato_id, email, nome, estado) values (:'r1', :'ws', :'mel', 'mel@blog.teste.invalid', 'Mel Blog', 'na_fila');
select id_da_campanha as r1_saida from public.enfileirar_campanha(:'ws', :'editor', :'r1', 'Rascunho pronto', 'Texto final da mensagem.', '', '', array[:'lia']::uuid[], null) \gset
select is(:'r1_saida'::uuid, :'r1'::uuid, 'o rascunho vira a própria campanha, sem cópia');
select is((select assunto from public.press_campanhas where id = :'r1'), 'Rascunho pronto', '… com o texto da hora do envio');
select is((select array_agg(nome) from public.press_campanha_destinatarios where campanha_id = :'r1'), array['Lia Podcast'], '… e só com a lista nova de destinatários');
select throws_ok(format('select * from public.enfileirar_campanha(%L, %L, %L, %L, %L, %L, %L, %L::uuid[], null)', :'ws', :'editor', :'r1', 'De novo', 'Texto da mensagem.', '', '', array[:'ana']),
  'P0001', 'rascunho_indisponivel', 'a campanha que já saiu não sai de novo');
-- Tira esta do caminho, sem mexer nos contadores: os testes da fila acompanham a Release 1.
delete from public.press_campanha_destinatarios where campanha_id = :'r1';
update public.press_campanhas set estado = 'falhou' where id = :'r1';

-- ================================================================ a fila

\set trab_a '00000000-0000-4000-8000-0000000000a1'
\set trab_b '00000000-0000-4000-8000-0000000000b1'

-- Campanha antiga que morreu no meio (em_fila = false): a fila nunca a retoma.
insert into public.press_campanhas (workspace_id, assunto, corpo, estado, enviada_por, enviada_em) values (:'ws', 'Antiga', 'Texto', 'enviando', :'editor', now() - interval '20 days')
returning id as antiga \gset
insert into public.press_campanha_destinatarios (campanha_id, workspace_id, contato_id, email, nome, estado) values (:'antiga', :'ws', :'ana', 'ana@jornal.teste.invalid', 'Ana Souza', 'na_fila');

create temp table lote1 on commit drop as select * from public.reservar_lote_de_campanha(:'trab_a', 2);
select is((select array_agg(nome order by nome) from lote1), array['Ana Souza', 'Beto Lima'], 'o lote vem do tamanho pedido, por ordem de chegada');
select ok((select bool_and(campanha_id = :'c1' and estado = 'enviando' and reservado_em is not null) from lote1), 'o lote é da campanha da fila, e sai reservado');
select is((select estado from public.press_campanha_destinatarios where campanha_id = :'antiga'), 'na_fila', 'a campanha antiga pela metade fica como estava');
select is(public.concluir_campanhas_terminadas(), 0, '… e também não é fechada pela fila');
select ok((select trabalhador = :'trab_a' and trabalhando_ate > now() from public.press_campanhas where id = :'c1'), 'o trabalhador toma a vez');

select is((select count(*)::int from public.reservar_lote_de_campanha(:'trab_b', 100)), 0, 'outro trabalhador não entra enquanto a vez é de alguém');
select is((select count(*)::int from public.press_campanha_destinatarios where campanha_id = :'c1' and estado = 'na_fila'), 1, '… e não reserva ninguém');

create temp table lote2 on commit drop as select * from public.reservar_lote_de_campanha(:'trab_a', 2);
select is((select array_agg(nome) from lote2), array['Fabi Rádio'], 'o mesmo trabalhador segue com o que resta');

-- O Resend aceitou o primeiro lote; o segundo falhou.
select public.confirmar_lote_de_campanha(
  array[(select id from lote1 where nome = 'Ana Souza'), (select id from lote1 where nome = 'Beto Lima')], array['re_ana', 're_beto']);
select is((select array_agg(resend_id order by nome) from public.press_campanha_destinatarios where campanha_id = :'c1' and estado = 'enviado' and enviado_em is not null),
  array['re_ana', 're_beto'], 'lote confirmado: enviado, cada um com o id da sua mensagem');
select is(public.concluir_campanhas_terminadas(), 0, 'com gente ainda reservada, a campanha não fecha');
update public.press_campanha_destinatarios set estado = 'falhou', erro = 'O provedor recusou.' where id = (select id from lote2);

select is(public.concluir_campanhas_terminadas(), 1, 'fila vazia: a campanha fecha');
select ok((select estado = 'parcial' and total_enviados = 2 and total_falhas = 1 and concluida_em is not null and trabalhador is null and trabalhando_ate is null
             from public.press_campanhas where id = :'c1'), 'fecha como parcial, com os totais, e solta a vez');
select is((select array_agg(total_envios order by nome) from public.press_contacts where id in (:'ana', :'beto', :'fabi')), array[1, 1, 0], 'quem recebeu ganha +1 envio; quem falhou, não');
select is(public.concluir_campanhas_terminadas(), 0, 'fechar de novo não fecha nada');
select is((select array_agg(total_envios order by nome) from public.press_contacts where id in (:'ana', :'beto', :'fabi')), array[1, 1, 0], '… e não soma duas vezes');

-- ================================================================ hora marcada

select id_da_campanha as c2 from public.enfileirar_campanha(:'ws', :'editor', null, 'Release agendado', 'Texto da mensagem.', '', '',
  array[:'hugo', :'iris', :'joca', :'lia']::uuid[], now() + interval '1 day') \gset
select pg_temp.em_ordem(:'c2', array['Hugo Portal', 'Iris Agência', 'Joca Revista', 'Lia Podcast']);
select ok((select estado = 'agendada' and em_fila and enviada_em is null and agendada_para > now() from public.press_campanhas where id = :'c2'), 'com hora marcada, espera como agendada');
select is((select count(*)::int from public.reservar_lote_de_campanha(:'trab_a', 100)), 0, 'antes da hora, nada sai');
select is((select estado from public.press_campanhas where id = :'c2'), 'agendada', '… e a campanha segue agendada');

-- Enquanto espera: a Iris sai da lista e o Joca entra na supressão.
update public.press_contacts set descadastrado_em = now() where id = :'iris';
insert into public.email_supressoes (workspace_id, email, motivo) values (:'ws', 'joca@revista.teste.invalid', 'denuncia');
update public.press_campanhas set agendada_para = now() - interval '1 minute' where id = :'c2';

create temp table lote3 on commit drop as select * from public.reservar_lote_de_campanha(:'trab_a', 100);
select ok((select estado = 'enviando' and enviada_em is not null from public.press_campanhas where id = :'c2'), 'chegou a hora: a campanha passa a envio');
select is((select array_agg(nome order by nome) from lote3), array['Hugo Portal', 'Lia Podcast'], 'só quem ainda pode receber sai');
select is((select array_agg(nome order by nome) from public.press_campanha_destinatarios where campanha_id = :'c2' and estado = 'de_fora'),
  array['Iris Agência', 'Joca Revista'], 'quem saiu ou foi suprimido durante a espera fica de fora');
select public.confirmar_lote_de_campanha(
  array[(select id from lote3 where nome = 'Hugo Portal'), (select id from lote3 where nome = 'Lia Podcast')], array['re_hugo', 're_lia']);
select is(public.concluir_campanhas_terminadas(), 1, 'a agendada fecha');
select ok((select estado = 'enviada' and total_enviados = 2 and total_falhas = 0 from public.press_campanhas where id = :'c2'), 'quem ficou de fora não conta como falha');

-- Contato apagado depois de a campanha ser montada: sem ele não há link de saída, então não recebe.
\set nilo '00000000-0000-4000-8000-00000000c013'
insert into public.press_contacts (id, workspace_id, nome, email, email_status, created_by) values (:'nilo', :'ws', 'Nilo Apagado', 'nilo@some.teste.invalid', 'valido', :'editor');
select id_da_campanha as c5 from public.enfileirar_campanha(:'ws', :'editor', null, 'Release 5', 'Texto da mensagem.', '', '', array[:'nilo']::uuid[], null) \gset
delete from public.press_contacts where id = :'nilo';
select is((select count(*)::int from public.reservar_lote_de_campanha(:'trab_a', 100)), 0, 'contato apagado antes do envio não recebe');
select ok((select estado = 'de_fora' and contato_id is null from public.press_campanha_destinatarios where campanha_id = :'c5'), '… e a linha fica como "de fora", com o registro de que estava na lista');
select is(public.concluir_campanhas_terminadas(), 1, 'a campanha sem ninguém para receber fecha');
select is((select estado from public.press_campanhas where id = :'c5'), 'falhou', '… como falhou, porque nada saiu');

-- Reserva que ninguém confirmou: depois de 10 minutos vira falha, e não reenvia.
select id_da_campanha as c3 from public.enfileirar_campanha(:'ws', :'editor', null, 'Release 3', 'Texto da mensagem.', '', '', array[:'fabi']::uuid[], null) \gset
create temp table lote4 on commit drop as select * from public.reservar_lote_de_campanha(:'trab_a', 100);
select is((select count(*)::int from lote4), 1, 'a terceira campanha reserva o seu lote');
update public.press_campanha_destinatarios set reservado_em = now() - interval '11 minutes' where campanha_id = :'c3';
update public.press_campanhas set trabalhando_ate = now() - interval '9 minutes' where id = :'c3';
select is((select count(*)::int from public.reservar_lote_de_campanha(:'trab_b', 100)), 0, 'reserva vencida não volta para a fila');
select is((select estado from public.press_campanha_destinatarios where campanha_id = :'c3'), 'falhou', '… vira falha, com o aviso de que pode ter saído');
select is(public.concluir_campanhas_terminadas(), 1, 'e a campanha fecha');
select is((select estado from public.press_campanhas where id = :'c3'), 'falhou', 'sem nenhum enviado, fecha como falhou');

-- ================================================================ o que o Resend conta

insert into public.newsletter_inscritos (workspace_id, email, nome, estado, confirmado_em) values
  (:'ws', 'ana@jornal.teste.invalid', 'Ana Souza', 'confirmado', now()),
  (:'ws', 'leitor@casa.teste.invalid', 'Leitor Fiel', 'confirmado', now()),
  (:'ws', 'novo@casa.teste.invalid', 'Ainda Pendente', 'pendente', null);

select is(public.registrar_evento_de_email('re_ana', '', 'qualquer', ''), 'ignorado', 'tipo desconhecido é ignorado');
select is(public.registrar_evento_de_email('re_nao_existe', 'ninguem@lugar.teste.invalid', 'devolucao', ''), 'desconhecido', 'endereço que não está em lista nenhuma não grava nada');
select is((select count(*)::int from public.email_supressoes where email = 'ninguem@lugar.teste.invalid'), 0, '… nem supressão');

-- Entrega.
select is(public.registrar_evento_de_email('re_hugo', 'hugo@portal.teste.invalid', 'entregue', ''), 'campanha', 'a entrega acha a linha pelo id da mensagem');
select public.registrar_evento_de_email('re_hugo', 'hugo@portal.teste.invalid', 'entregue', '') \g /dev/null
select ok((select d.entregue_em is not null and c.total_entregues = 1
             from public.press_campanha_destinatarios d join public.press_campanhas c on c.id = d.campanha_id where d.resend_id = 're_hugo'), 'entrega repetida conta uma vez');
select is((select email_status from public.press_contacts where id = :'hugo'), 'valido', 'entrega não mexe no contato');

-- Devolução definitiva: a linha, a campanha, o contato, a newsletter e a supressão.
select is(public.registrar_evento_de_email('re_ana', 'Ana@Jornal.teste.invalid', 'devolucao', 'General: caixa inexistente'), 'campanha+contato+newsletter', 'a devolução bate em tudo o que tem o endereço');
select is(public.registrar_evento_de_email('re_ana', 'ana@jornal.teste.invalid', 'devolucao', 'General: caixa inexistente'), 'campanha+contato+newsletter', 'o mesmo evento de novo devolve a mesma resposta');
select ok((select d.devolvido_em is not null and d.motivo_da_devolucao = 'General: caixa inexistente' and d.estado = 'enviado' and c.total_devolucoes = 1 and c.total_enviados = 2
             from public.press_campanha_destinatarios d join public.press_campanhas c on c.id = d.campanha_id where d.resend_id = 're_ana'), '… e conta uma vez só');
select ok((select email_status = 'invalido' and devolvido_em is not null and motivo_da_devolucao = 'General: caixa inexistente' from public.press_contacts where id = :'ana'),
  'o contato fica inválido, com a data e o motivo');
select is((select estado from public.newsletter_inscritos where email = 'ana@jornal.teste.invalid'), 'invalido', 'o inscrito da newsletter com o mesmo endereço fica inválido');
select is((select array_agg(motivo || '/' || origem) from public.email_supressoes where workspace_id = :'ws' and email = 'ana@jornal.teste.invalid'), array['devolucao/imprensa'],
  'e o endereço entra na supressão, uma vez só');
select is((select count(*)::int from public.enfileirar_campanha(:'ws', :'editor', null, 'Depois da devolução', 'Texto da mensagem.', '', '', array[:'ana']::uuid[], null)), 0,
  'quem devolveu não entra na campanha seguinte');

-- Devolução de mensagem que não é de campanha (newsletter): só pelo endereço.
select is(public.registrar_evento_de_email('re_da_newsletter', 'novo@casa.teste.invalid', 'devolucao', 'NoEmail'), 'newsletter', 'devolução da newsletter acha o inscrito pelo endereço');
select is((select estado from public.newsletter_inscritos where email = 'novo@casa.teste.invalid'), 'invalido', 'o pendente que devolveu fica inválido');
select is((select origem from public.email_supressoes where email = 'novo@casa.teste.invalid'), 'newsletter', 'a supressão guarda de onde veio');

-- Denúncia de spam: sai das listas.
select is(public.registrar_evento_de_email('', 'leitor@casa.teste.invalid', 'denuncia', 'Marcou como spam.'), 'newsletter', 'a denúncia tira o inscrito da newsletter');
select ok((select estado = 'descadastrado' and descadastrado_em is not null from public.newsletter_inscritos where email = 'leitor@casa.teste.invalid'), 'quem denuncia fica como descadastrado');
select is(public.registrar_evento_de_email('re_hugo', '', 'denuncia', 'Marcou como spam.'), 'campanha+contato', 'sem endereço no evento, vale o da linha da campanha');
select ok((select descadastrado_em is not null and email_status = 'valido' from public.press_contacts where id = :'hugo'), 'o contato que denunciou sai da lista (o endereço continua válido)');
select ok((select d.denunciou_em is not null and c.total_denuncias = 1
             from public.press_campanha_destinatarios d join public.press_campanhas c on c.id = d.campanha_id where d.resend_id = 're_hugo'), 'a campanha conta a denúncia');
select is((select motivo from public.email_supressoes where email = 'hugo@portal.teste.invalid'), 'denuncia', 'e a supressão guarda o motivo');

-- O Resend aceitou e não enviou porque o endereço estava na lista de supressão dele.
select is(public.registrar_evento_de_email('re_beto', '', 'suprimido', 'Na lista de supressão do Resend.'), 'campanha+contato', 'supressão do Resend acha a linha e o contato');
select ok((select estado = 'de_fora' and erro = 'Na lista de supressão do Resend.' from public.press_campanha_destinatarios where resend_id = 're_beto'), 'a linha deixa de constar como enviada');
select ok((select estado = 'parcial' and total_enviados = 1 and total_falhas = 1 from public.press_campanhas where id = :'c1'), 'a campanha fechada desconta o envio que não saiu, sem virar falha a mais');
select ok((select total_envios = 0 and envios_sem_abertura = 0 from public.press_contacts where id = :'beto'), 'e o contato perde o +1 daquele envio');
select is((select email_status from public.press_contacts where id = :'beto'), 'invalido', 'endereço suprimido deixa de valer');
select is((select motivo from public.email_supressoes where email = 'beto@tv.teste.invalid'), 'supressao', 'e entra na supressão em minúsculas, com o motivo certo');
select public.registrar_evento_de_email('re_beto', '', 'suprimido', 'Na lista de supressão do Resend.') \g /dev/null
select ok((select total_enviados = 1 from public.press_campanhas where id = :'c1'), 'evento repetido não desconta de novo');

-- O Resend aceitou e depois não conseguiu enviar (cota do plano): o endereço não tem culpa.
select is(public.registrar_evento_de_email('re_lia', '', 'falha', 'reached_daily_quota'), 'campanha', 'falha de envio acha a linha');
select ok((select estado = 'falhou' and erro = 'reached_daily_quota' from public.press_campanha_destinatarios where resend_id = 're_lia'), 'a linha vira falha, com o motivo do Resend');
select ok((select estado = 'parcial' and total_enviados = 1 and total_falhas = 1 from public.press_campanhas where id = :'c2'), 'a campanha que estava enviada passa a parcial');
select ok((select email_status = 'valido' and total_envios = 0 from public.press_contacts where id = :'lia'), 'o contato segue válido e perde o +1');
select is((select count(*)::int from public.email_supressoes where email = 'lia@podcast.teste.invalid'), 0, 'falha de envio não põe ninguém na supressão');

select id_da_campanha as c4 from public.enfileirar_campanha(:'ws', :'editor', null, 'Release 4', 'Texto da mensagem.', '', '', array[:'mel']::uuid[], null) \gset
create temp table lote5 on commit drop as select * from public.reservar_lote_de_campanha(:'trab_a', 100);
select public.confirmar_lote_de_campanha((select array_agg(id) from lote5), array['re_mel']) \g /dev/null
select public.concluir_campanhas_terminadas() \g /dev/null
select is((select estado from public.press_campanhas where id = :'c4'), 'enviada', 'a campanha de uma pessoa só fecha como enviada');
select public.registrar_evento_de_email('re_mel', '', 'falha', 'reached_daily_quota') \g /dev/null
select ok((select estado = 'falhou' and total_enviados = 0 and total_falhas = 1 from public.press_campanhas where id = :'c4'), 'sem mais nenhum enviado, a campanha passa a falhou');

-- O Resend avisa antes de o lote ser confirmado: a linha ainda está a caminho, sem o id da mensagem.
\set olga '00000000-0000-4000-8000-00000000c014'
\set pepe '00000000-0000-4000-8000-00000000c015'
insert into public.press_contacts (id, workspace_id, nome, email, email_status, created_by) values
  (:'olga', :'ws', 'Olga Rápida', 'olga@rapida.teste.invalid', 'valido', :'editor'),
  (:'pepe', :'ws', 'Pepe Barrado', 'pepe@barrado.teste.invalid', 'valido', :'editor');
select id_da_campanha as c6 from public.enfileirar_campanha(:'ws', :'editor', null, 'Release 6', 'Texto da mensagem.', '', '', array[:'olga', :'pepe']::uuid[], null) \gset
create temp table lote6 on commit drop as select * from public.reservar_lote_de_campanha(:'trab_a', 100);
select is(public.registrar_evento_de_email('re_olga', 'olga@rapida.teste.invalid', 'entregue', ''), 'campanha', 'evento antes da confirmação acha a linha a caminho, pelo endereço');
select ok((select resend_id = 're_olga' and entregue_em is not null and estado = 'enviando' from public.press_campanha_destinatarios where campanha_id = :'c6' and nome = 'Olga Rápida'),
  '… grava a entrega e já guarda o id da mensagem');
select is(public.registrar_evento_de_email('re_pepe', 'pepe@barrado.teste.invalid', 'suprimido', 'Na lista de supressão do Resend.'), 'campanha+contato', 'supressão antes da confirmação também acha a linha');
select public.confirmar_lote_de_campanha(
  array[(select id from lote6 where nome = 'Olga Rápida'), (select id from lote6 where nome = 'Pepe Barrado')], array['re_olga', 're_pepe']) \g /dev/null
select is((select array_agg(estado order by nome) from public.press_campanha_destinatarios where campanha_id = :'c6'), array['enviado', 'de_fora'],
  'a confirmação do lote não devolve a "enviado" quem o Resend barrou');
select public.concluir_campanhas_terminadas() \g /dev/null
select ok((select estado = 'enviada' and total_enviados = 1 and total_falhas = 0 and total_entregues = 1 from public.press_campanhas where id = :'c6'), 'e a campanha fecha com a conta certa');
select is((select total_envios from public.press_contacts where id = :'pepe'), 0, 'quem foi barrado não ganha +1 envio');
select is(public.registrar_evento_de_email('re_outra_mensagem', 'olga@rapida.teste.invalid', 'entregue', ''), 'desconhecido', 'depois de confirmada, outra mensagem para o mesmo endereço não se confunde com a da campanha');

-- Tirar o endereço da lista do Resend libera de novo. Quem denunciou segue fora.
select is(public.registrar_evento_de_email('', 'ana@jornal.teste.invalid', 'liberado', ''), 'liberado', 'liberação reconhecida');
select is((select count(*)::int from public.email_supressoes where email = 'ana@jornal.teste.invalid'), 0, 'o endereço sai da supressão');
select ok((select email_status = 'nao_verificado' and devolvido_em is null and motivo_da_devolucao = '' from public.press_contacts where id = :'ana'), 'o contato volta a poder receber');
select is((select estado from public.newsletter_inscritos where email = 'ana@jornal.teste.invalid'), 'confirmado', 'o inscrito que já tinha confirmado volta a confirmado');
select public.registrar_evento_de_email('', 'novo@casa.teste.invalid', 'liberado', '') \g /dev/null
select is((select estado from public.newsletter_inscritos where email = 'novo@casa.teste.invalid'), 'pendente', 'quem nunca confirmou volta a pendente');
select public.registrar_evento_de_email('', 'leitor@casa.teste.invalid', 'liberado', '') \g /dev/null
select is((select estado from public.newsletter_inscritos where email = 'leitor@casa.teste.invalid'), 'descadastrado', 'quem denunciou não volta sozinho');
select public.registrar_evento_de_email('', 'hugo@portal.teste.invalid', 'liberado', '') \g /dev/null
select ok((select descadastrado_em is not null from public.press_contacts where id = :'hugo'), 'nem o contato de imprensa que denunciou');
select is((select count(*)::int from public.enfileirar_campanha(:'ws', :'editor', null, 'Depois de liberar', 'Texto da mensagem.', '', '', array[:'ana', :'hugo']::uuid[], null)), 1,
  'depois de liberado, o endereço que devolveu entra na campanha de novo');
select is((select array_agg(nome) from public.press_campanha_destinatarios d join public.press_campanhas c on c.id = d.campanha_id where c.assunto = 'Depois de liberar'), array['Ana Souza'],
  '… e quem denunciou continua fora');

-- ================================================================ o relógio

select is((select count(*)::int from cron.job where jobname = 'enviar-campanhas'), 1, 'o relógio das campanhas está agendado, uma vez');

select * from finish();
rollback;
