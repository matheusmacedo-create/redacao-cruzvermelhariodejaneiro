-- Testes da verificação do candidato (supabase/migrations/20261002000000_cvrj_verificacao_de_candidatos.sql).
-- Mesmas regras de supabase/tests/auditoria.test.sql: só em banco local, numa transação desfeita no fim.
--
--   psql -v ON_ERROR_STOP=1 -d redacao_local < supabase/tests/verificacao.test.sql

\set QUIET 1
\pset format unaligned
\pset tuples_only on
\pset pager off

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select id as ws from public.workspaces where slug = 'producao' \gset
\set admin '00000000-0000-4000-8000-0000000000d1'
\set gestor '00000000-0000-4000-8000-0000000000d2'
\set leitor '00000000-0000-4000-8000-0000000000d3'
insert into auth.users (id, email) values (:'admin', 'admin.ver@teste.invalid'), (:'gestor', 'gestor.ver@teste.invalid'), (:'leitor', 'leitor.ver@teste.invalid');
insert into public.profiles (id, username, full_name) values (:'admin', 'admin.ver', 'Ana Admin'), (:'gestor', 'gestor.ver', 'Gil Gestor'), (:'leitor', 'leitor.ver', 'Lia Leitora');
insert into public.workspace_members (workspace_id, user_id, role) values (:'ws', :'admin', 'admin'), (:'ws', :'gestor', 'editor'), (:'ws', :'leitor', 'editor');
insert into public.participantes_acesso (workspace_id, user_id, nivel) values (:'ws', :'gestor', 'gerenciar'), (:'ws', :'leitor', 'ver');

create function pg_temp.como(p_usuario uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated', 'aal', 'aal2')::text, true)
$$;

-- Candidatos: um com CPF no cadastro, um sem, um para recusar.
\set cpf1 '52998224725'
insert into public.participantes (workspace_id, vinculo, nome, situacao, origem) values (:'ws', 'voluntario', 'Carla Candidata', 'candidato', 'formulario') returning id as c1 \gset
update public.participantes set
  cpf_cifrado = extensions.pgp_sym_encrypt(:'cpf1', private.chave_participantes(), 'cipher-algo=aes256'),
  cpf_hash = encode(extensions.hmac(:'cpf1', private.chave_participantes(), 'sha256'), 'hex'), cpf_mascara = '***.982.247-**'
where id = :'c1';
insert into public.participantes (workspace_id, vinculo, nome, situacao, origem) values (:'ws', 'voluntario', 'Caio Sem Cpf', 'candidato', 'formulario') returning id as c2 \gset
insert into public.participantes (workspace_id, vinculo, nome, situacao, origem) values (:'ws', 'voluntario', 'Cris Recusada', 'candidato', 'formulario') returning id as c3 \gset
insert into public.participantes (workspace_id, vinculo, nome, situacao) values (:'ws', 'voluntario', 'Vera Veterana', 'inativo') returning id as v1 \gset

-- ================================================================ privilégios

select ok(not has_table_privilege('anon', 'public.participantes_verificacoes', 'select') and not has_table_privilege('anon', 'public.participantes_arquivos', 'select')
          and not has_table_privilege('anon', 'public.participantes_referencias', 'select'), 'anon não lê nada da verificação');
select ok(not has_column_privilege('authenticated', 'public.participantes_verificacoes', 'token_hash', 'select'), 'o hash do link não sai pela API');
select ok(has_column_privilege('authenticated', 'public.participantes_verificacoes', 'itens', 'select'), 'o checklist sai (o RLS filtra)');
select ok(not has_column_privilege('authenticated', 'public.participantes_arquivos', 'caminho', 'select'), 'o caminho no Storage não sai pela API');
select ok(not has_table_privilege('authenticated', 'public.participantes_verificacoes', 'insert') and not has_table_privilege('authenticated', 'public.participantes_arquivos', 'update')
          and not has_table_privilege('authenticated', 'public.participantes_referencias', 'delete'), 'ninguém logado escreve direto');
select ok(has_column_privilege('authenticated', 'public.participantes', 'restricoes', 'select') and has_column_privilege('authenticated', 'public.participantes', 'verificado_em', 'select'), 'restrições e verificado_em saem na ficha');
select ok(not has_function_privilege('authenticated', 'public.aceitar_termo_pelo_token(text, text, text)', 'execute')
          and not has_function_privilege('authenticated', 'public.concluir_envio_pelo_token(text)', 'execute')
          and not has_function_privilege('authenticated', 'public.cpf_para_verificacao(uuid, uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.verificacao_pelo_token(text)', 'execute'), 'as funções do link e o CPF decifrado: só o servidor');
select ok(has_function_privilege('service_role', 'public.registrar_arquivo_pelo_token(text, text, jsonb)', 'execute'), 'o servidor grava pelo link');
select ok(not has_function_privilege('anon', 'public.concluir_verificacao_participante(uuid, text, text[], text)', 'execute'), 'anon não decide');
select throws_ok(format('select public.cpf_confere(%L, %L)', :'c1', '000'), 'P0001', 'Participante não encontrado.', 'cpf_confere sem sessão: recusa (a função exige nível 3)');

-- ================================================================ a coordenação abre e manda o link

select pg_temp.como(:'leitor');
set local role authenticated;
select throws_ok(format('select public.abrir_verificacao_participante(%L)', :'c1'), 'P0001', 'Participante não encontrado.', 'nível "ver" não abre verificação');
reset role;

select pg_temp.como(:'gestor');
set local role authenticated;
select lives_ok(format('select public.abrir_verificacao_participante(%L, %L, %L, 14, %L)', :'c1', 'completa', repeat('a', 64), 'carla@teste.invalid'), 'gestor abre a verificação com o link');
select throws_ok(format('select public.abrir_verificacao_participante(%L, %L)', :'c1', 'renovacao'), 'P0001', 'Candidato passa pela verificação completa.', 'renovação não vale para candidato');
select throws_ok(format('select public.abrir_verificacao_participante(%L, %L, %L)', :'c1', 'completa', 'xyz'), 'P0001', 'Link inválido.', 'hash fora do formato é recusado');
select is((select count(*)::int from public.participantes_verificacoes where participante_id = :'c1'), 1, 'abrir de novo reaproveita a mesma verificação');
select throws_ok(format('select public.mudar_situacao_participante(%L, %L)', :'c1', 'ativo'), 'P0001',
                 'Conclua a verificação do candidato antes de aprovar — ou aprove com a restrição “Não atua com crianças e adolescentes” e o motivo.', 'aprovar sem verificação concluída é recusado');
select lives_ok(format('select public.mudar_situacao_participante(%L, %L)', :'v1', 'ativo'), 'reativar quem já era voluntário não exige verificação');
select throws_ok(format('select public.registrar_item_verificacao(%L, %L, %L)', :'c1', 'identidade', '{"situacao":"conferido"}'), 'P0001',
                 'Só quem tem acesso a dados sensíveis confere identidade e antecedentes.', 'gestor (nível 2) não confere identidade');
select lives_ok(format('select public.registrar_item_verificacao(%L, %L, %L)', :'c1', 'entrevista', '{"situacao":"conferido","nota":"Boa conversa","data":"2026-10-01"}'), 'gestor registra a entrevista');
select is((select itens->'entrevista'->>'por_nome' from public.participantes_verificacoes where participante_id = :'c1'), 'Gil Gestor', 'o item guarda quem registrou');
select throws_ok(format('select public.registrar_item_verificacao(%L, %L, %L)', :'c1', 'sancoes', '{"situacao":"dispensado"}'), 'P0001', 'Escreva o motivo.', 'dispensar exige motivo');
reset role;

select is((select token_hash from public.participantes_verificacoes where participante_id = :'c1'), repeat('a', 64), 'o hash do link ficou guardado');
select is((select link_enviado_para from public.participantes_verificacoes where participante_id = :'c1'), 'carla@teste.invalid', 'e para onde foi');

-- ================================================================ o candidato, pelo link (service role)

select pg_temp.como(null);
set local role service_role;
select is((public.verificacao_pelo_token(repeat('a', 64)))->>'aberto', 'true', 'o link abre');
select is((public.verificacao_pelo_token(repeat('a', 64)))->>'nome', 'Carla', 'só o primeiro nome aparece');
select is((public.verificacao_pelo_token(repeat('a', 64)))->>'temCpf', 'true', 'a página sabe que o cadastro tem CPF');
select is(public.verificacao_pelo_token(repeat('b', 64)), null, 'link desconhecido: nada');
select throws_ok(format('select public.registrar_arquivo_pelo_token(%L, %L, %L)', repeat('a', 64), 'x', '{"categoria":"documento_identidade"}'), 'P0001', 'Aceite o termo antes de enviar documentos.', 'sem o termo, nada entra');
select throws_ok(format('select public.aceitar_termo_pelo_token(%L, %L, %L)', repeat('a', 64), '2026-10-v1', '11111111111'), 'P0001', 'CPF inválido.', 'CPF inválido é recusado');
select throws_ok(format('select public.aceitar_termo_pelo_token(%L, %L, %L)', repeat('a', 64), '2026-10-v1', '16899535009'), 'P0001', 'O CPF informado não é o do cadastro. Confira os números.', 'CPF diferente do cadastro é recusado');
select is(public.aceitar_termo_pelo_token(repeat('a', 64), '2026-10-v1', '529.982.247-25'), :'c1'::uuid, 'o CPF do cadastro abre o termo');
select is((select termo_versao from public.participantes_verificacoes where participante_id = :'c1'), '2026-10-v1', 'a versão do termo ficou guardada');
select is((select count(*)::int from public.participantes_auditoria where participante_id = :'c1' and acao = 'verificacao_termo' and user_id is null), 1, 'o aceite fica na trilha, sem usuário');

-- Arquivos: o Storage já tem o objeto (o navegador mandou direto).
\set caminho_id :ws '/' :c1 '/00000000-0000-4000-8000-00000000aa01.jpg'
\set caminho_at :ws '/' :c1 '/00000000-0000-4000-8000-00000000aa02.pdf'
\set caminho_vl :ws '/' :c1 '/00000000-0000-4000-8000-00000000aa03.pdf'
insert into storage.objects (bucket_id, name, metadata) values
  ('voluntarios-arquivos', :'caminho_id', '{"mimetype":"image/jpeg","size":12345}'),
  ('voluntarios-arquivos', :'caminho_at', '{"mimetype":"application/pdf","size":2222}'),
  ('voluntarios-arquivos', :'caminho_vl', '{"mimetype":"application/pdf","size":3333}');
select throws_ok(format('select public.registrar_arquivo_pelo_token(%L, %L, %L)', repeat('a', 64), :'ws' || '/' || :'c2' || '/00000000-0000-4000-8000-00000000aa09.jpg', '{"categoria":"documento_identidade"}'),
                 'P0001', 'Caminho inválido.', 'caminho de outra pessoa é recusado');
select throws_ok(format('select public.registrar_arquivo_pelo_token(%L, %L, %L)', repeat('a', 64), :'ws' || '/' || :'c1' || '/00000000-0000-4000-8000-00000000aa08.jpg', '{"categoria":"documento_identidade"}'),
                 'P0001', 'O arquivo não chegou ao armazenamento. Envie de novo.', 'objeto que não existe no Storage é recusado');
select public.registrar_arquivo_pelo_token(repeat('a', 64), :'caminho_id', '{"categoria":"documento_identidade","lado":"frente","nome_original":"rg.jpg"}') as arq_id \gset
select is((select tipo || ' ' || tamanho::text from public.participantes_arquivos where id = :'arq_id'), 'image/jpeg 12345', 'tipo e tamanho vêm do Storage, não de quem chama');
select is((select pelo_candidato from public.participantes_arquivos where id = :'arq_id'), true, 'marcado como enviado pelo candidato');
select throws_ok(format('select public.registrar_arquivo_pelo_token(%L, %L, %L)', repeat('a', 64), :'caminho_vl', '{"categoria":"antecedentes_pcerj"}'),
                 'P0001', 'Informe a data de emissão do atestado.', 'atestado sem data é recusado');
select throws_ok(format('select public.registrar_arquivo_pelo_token(%L, %L, %L)', repeat('a', 64), :'caminho_vl', format('{"categoria":"antecedentes_pcerj","data_documento":"%s"}', current_date - 100)),
                 'P0001', 'Este atestado foi emitido há mais de 90 dias e não vale mais. Emita um novo (é gratuito) e envie.', 'atestado de 100 dias é recusado');
select throws_ok(format('select public.registrar_arquivo_pelo_token(%L, %L, %L)', repeat('a', 64), :'caminho_vl', format('{"categoria":"antecedentes_pcerj","data_documento":"%s"}', current_date + 1)),
                 'P0001', 'A data de emissão não pode ser no futuro.', 'atestado do futuro é recusado');
select throws_ok(format('select public.concluir_envio_pelo_token(%L)', repeat('a', 64)), 'P0001', 'Falta o atestado de antecedentes.', 'sem atestado não conclui');
select public.registrar_arquivo_pelo_token(repeat('a', 64), :'caminho_at', format('{"categoria":"antecedentes_pcerj","data_documento":"%s","codigo_autenticacao":"ABC123","nome_original":"atestado.pdf"}', current_date - 10)::jsonb) as arq_at \gset
select is((select validade from public.participantes_arquivos where id = :'arq_at'), current_date + 80, 'o atestado vale 90 dias a partir da emissão');
select is((select vence_em from public.participantes_arquivos where id = :'arq_at'), ((current_date - 10) + interval '6 months')::date, 'e renova em 6 meses (Lei 14.811)');
select throws_ok(format('select public.concluir_envio_pelo_token(%L)', repeat('a', 64)), 'P0001', 'Faltam as duas referências.', 'sem referências não conclui');
select throws_ok(format('select public.guardar_dados_pelo_token(%L, %L)', repeat('a', 64), '{"referencias":[{"nome":"Só Uma","relacao":"amiga","telefone":"21999"}]}'), 'P0001', 'Indique duas ou três referências.', 'uma referência só é recusada');
select throws_ok(format('select public.guardar_dados_pelo_token(%L, %L)', repeat('a', 64), '{"referencias":[{"nome":"Sem Contato","relacao":"amiga"},{"nome":"Outra","relacao":"chefe","email":"o@x.io"}]}'), 'P0001', 'Cada referência precisa de telefone ou e-mail.', 'referência sem contato é recusada');
select lives_ok(format('select public.guardar_dados_pelo_token(%L, %L)', repeat('a', 64),
  '{"registro_profissional":{"tem":true,"conselho":"COREN","numero":"123456","uf":"rj"},"referencias":[{"nome":"Rita Ref","relacao":"ex-chefe","telefone":"21 99999-0001"},{"nome":"Rui Ref","relacao":"professor","email":"Rui@Teste.Invalid"}]}'),
  'duas referências e o registro profissional entram');
select is((select count(*)::int from public.participantes_referencias where participante_id = :'c1' and informado_pelo_candidato), 2, 'duas referências do candidato');
select is((select email from public.participantes_referencias where participante_id = :'c1' and nome = 'Rui Ref'), 'rui@teste.invalid', 'e-mail em minúsculas');
select is((select registro_profissional->>'uf' from public.participantes_verificacoes where participante_id = :'c1'), 'RJ', 'UF em maiúsculas');
select lives_ok(format('select public.guardar_dados_pelo_token(%L, %L)', repeat('a', 64), '{"referencias":[{"nome":"Rita Ref","relacao":"ex-chefe","telefone":"21 99999-0001"},{"nome":"Rui Ref","relacao":"professor","email":"rui@teste.invalid"},{"nome":"Rô Ref","relacao":"vizinha","telefone":"21 98888"}]}'), 'mandar de novo substitui');
select is((select count(*)::int from public.participantes_referencias where participante_id = :'c1'), 3, 'agora são três, sem duplicar');
select is((public.verificacao_pelo_token(repeat('a', 64)))->'arquivos'->1->>'categoria', 'antecedentes_pcerj', 'a página lista o que já foi enviado');
select is((select public.excluir_arquivo_pelo_token(repeat('a', 64), :'arq_id')), :'caminho_id', 'o candidato tira o próprio arquivo e o servidor recebe o caminho');
select throws_ok(format('select public.concluir_envio_pelo_token(%L)', repeat('a', 64)), 'P0001', 'Falta o documento com foto.', 'tirou a identidade: não conclui');
\set caminho_id2 :ws '/' :c1 '/00000000-0000-4000-8000-00000000aa04.jpg'
insert into storage.objects (bucket_id, name, metadata) values ('voluntarios-arquivos', :'caminho_id2', '{"mimetype":"image/jpeg","size":999}');
select public.registrar_arquivo_pelo_token(repeat('a', 64), :'caminho_id2', '{"categoria":"documento_identidade","lado":"unico","nome_original":"cnh.jpg"}') as arq_id2 \gset
select is((select nome from public.concluir_envio_pelo_token(repeat('a', 64))), 'Carla Candidata', 'o candidato conclui o envio');
select is((select estado || ' ' || (link_expira_em <= now())::text from public.participantes_verificacoes where participante_id = :'c1'), 'enviada true', 'estado "enviada" e link vencido na hora');
select throws_ok(format('select public.concluir_envio_pelo_token(%L)', repeat('a', 64)), 'P0001', 'Este link venceu ou já foi usado. Peça um novo à coordenação do Voluntariado.', 'o link não vale mais');
select is((public.verificacao_pelo_token(repeat('a', 64)))->>'aberto', 'false', 'e a página diz que ele não vale mais (não é 404)');

-- Cadastro sem CPF: o candidato informa, e ele fica cifrado.
reset role;
select pg_temp.como(:'admin');
set local role authenticated;
select lives_ok(format('select public.abrir_verificacao_participante(%L, %L, %L)', :'c2', 'completa', repeat('c', 64)), 'admin abre o link do segundo candidato');
reset role;
select pg_temp.como(null);
set local role service_role;
select throws_ok(format('select public.aceitar_termo_pelo_token(%L, %L, %L)', repeat('c', 64), '2026-10-v1', :'cpf1'), 'P0001', 'Já existe um cadastro com este CPF. Fale com a coordenação do Voluntariado.', 'CPF de outro cadastro é recusado');
select lives_ok(format('select public.aceitar_termo_pelo_token(%L, %L, %L)', repeat('c', 64), '2026-10-v1', '168.995.350-09'), 'CPF novo entra');
select is((select cpf_mascara from public.participantes where id = :'c2'), '***.995.350-**', 'e fica guardado com máscara');
select is((select public.cpf_para_verificacao(:'c2', :'gestor')), '16899535009', 'o servidor decifra o CPF para a CGU a pedido do gestor');
select is((select count(*)::int from public.participantes_auditoria where participante_id = :'c2' and acao = 'consulta_externa' and user_id = :'gestor'), 1, 'e a consulta fica na trilha com o nome do gestor');
select throws_ok(format('select public.cpf_para_verificacao(%L, %L)', :'c2', :'leitor'), 'P0001', 'Sem acesso para consultar.', 'nível "ver" não consulta');
reset role;
select is((select cpf_hash = encode(extensions.hmac('16899535009', private.chave_participantes(), 'sha256'), 'hex') from public.participantes where id = :'c2'), true, 'com o HMAC certo');

-- ================================================================ a coordenação confere

select pg_temp.como(:'gestor');
set local role authenticated;
select is((select count(*)::int from public.participantes_arquivos where participante_id = :'c1'), 0, 'gestor (nível 2) não vê os documentos de identidade e antecedentes');
select throws_ok(format('select * from public.abrir_arquivo_participante(%L)', :'arq_at'), 'P0001', 'Arquivo não encontrado.', 'nem abre');
select is((select count(*)::int from public.participantes_referencias where participante_id = :'c1'), 3, 'mas vê as referências');
select is((select estado from public.participantes_verificacoes where participante_id = :'c1'), 'enviada', 'e a verificação');
select public.salvar_referencia_participante(:'c1', '{"nome":"Rua Coordenação","relacao":"colega","telefone":"21 97777"}') as ref4 \gset
select lives_ok(format('select public.registrar_contato_de_referencia(%L, %L)', :'ref4', '{"parecer":"favoravel","nota":"Elogiou"}'), 'gestor registra o contato');
select is((select itens->'referencias'->>'situacao' from public.participantes_verificacoes where participante_id = :'c1'), null, 'uma favorável ainda não fecha o item');
select registrar as r2 from (select public.registrar_contato_de_referencia(id, '{"parecer":"favoravel"}') as registrar from public.participantes_referencias where participante_id = :'c1' and nome = 'Rita Ref') s \gset
select is((select itens->'referencias'->>'situacao' from public.participantes_verificacoes where participante_id = :'c1'), 'conferido', 'duas favoráveis fecham o item');
select lives_ok(format('select public.registrar_consulta_de_sancoes(%L, %L)', :'c1', '{"resultado":"nada_consta","bases":{"ceis":{"ocorrencias":0},"cnep":{"ocorrencias":0},"ceaf":{"ocorrencias":0},"peps":{"ocorrencias":0}}}'), 'gestor registra a consulta à CGU');
select is((select itens->'sancoes'->>'situacao' from public.participantes_verificacoes where participante_id = :'c1'), 'conferido', 'nada consta fecha o item');
select throws_ok(format('select public.concluir_verificacao_participante(%L, %L)', :'c1', 'apto'), 'P0001',
                 'Para "apto", identidade e antecedentes precisam estar conferidos. Se faltar algum, aprove com restrição e o motivo.', 'apto sem identidade e antecedentes é recusado');
select throws_ok(format('select public.concluir_verificacao_participante(%L, %L, %L, %L)', :'c1', 'apto_com_restricao', '{sem_valores}', 'Faltou conferir o documento ainda'), 'P0001',
                 'Sem identidade e antecedentes conferidos, a restrição "Não atua com crianças e adolescentes" é obrigatória (Lei 14.811/2024).', 'com restrição sem a de crianças é recusado');
select throws_ok(format('select public.concluir_verificacao_participante(%L, %L, %L, %L)', :'c1', 'apto_com_restricao', '{sem_criancas_adolescentes,voar}', 'Faltou conferir o documento ainda'), 'P0001', 'Restrição desconhecida.', 'restrição fora da lista é recusada');
select throws_ok(format('select public.concluir_verificacao_participante(%L, %L, %L, %L)', :'c1', 'nao_apto', '{}', 'curto'), 'P0001', 'Escreva o motivo (ao menos 10 caracteres).', 'não apto exige motivo');
reset role;

select pg_temp.como(:'admin');
set local role authenticated;
select is((select count(*)::int from public.participantes_arquivos where participante_id = :'c1' and excluido_em is null), 2, 'admin (nível 3) vê os documentos');
select is((select nome_original from public.abrir_arquivo_participante(:'arq_at')), 'atestado.pdf', 'e abre o atestado');
select is((select count(*)::int from public.participantes_auditoria where participante_id = :'c1' and acao = 'abrir_arquivo' and user_id = :'admin'), 1, 'a abertura fica na trilha');
select throws_ok(format('select public.registrar_leitura_do_documento(%L, %L)', :'c1', '{"nome":"CARLA","cpf":"52998224725"}'), 'P0001', 'A leitura não pode guardar o CPF.', 'a leitura do documento nunca guarda o CPF');
select lives_ok(format('select public.registrar_leitura_do_documento(%L, %L)', :'c1', '{"legivel":true,"tipo":"RG","nome":"CARLA CANDIDATA","numero":"**.***.*89-1","comparacao":{"nome":"confere","nascimento":"nao_lido","cpf":"confere"},"divergencias":[]}'), 'a leitura saneada entra');
select is((select public.cpf_confere(:'c1', '529.982.247-25')), 'confere', 'cpf_confere: o do cadastro confere');
select is((select public.cpf_confere(:'c1', '16899535009')), 'diverge', 'cpf_confere: outro diverge');
select lives_ok(format('select public.registrar_item_verificacao(%L, %L, %L)', :'c1', 'identidade', '{"situacao":"conferido","nota":"RG confere com a foto do crachá"}'), 'admin confere a identidade');
reset role;
update public.participantes_arquivos set data_documento = current_date - 95, validade = current_date - 5 where id = :'arq_at';
select pg_temp.como(:'admin');
set local role authenticated;
select throws_ok(format('select public.registrar_item_verificacao(%L, %L, %L)', :'c1', 'antecedentes', '{"situacao":"conferido"}'), 'P0001',
                 'Para marcar como conferido, guarde um atestado emitido nos últimos 90 dias.', 'atestado velho não fecha o item');
reset role;
update public.participantes_arquivos set data_documento = current_date - 10, validade = current_date + 80 where id = :'arq_at';
select pg_temp.como(:'admin');
set local role authenticated;
select lives_ok(format('select public.registrar_item_verificacao(%L, %L, %L)', :'c1', 'antecedentes', '{"situacao":"conferido","codigo":"XYZ789"}'), 'com atestado recente, fecha');
select is((select itens->'antecedentes'->>'renovar_ate' from public.participantes_verificacoes where participante_id = :'c1'), (((current_date - 10) + interval '6 months')::date)::text, 'o item guarda a data de renovação');
select is((select itens->'antecedentes'->>'codigo' from public.participantes_verificacoes where participante_id = :'c1'), 'XYZ789', 'e o código informado na conferência');
select lives_ok(format('select public.concluir_verificacao_participante(%L, %L, %L, %L)', :'c1', 'apto', '{sem_valores}', null), 'agora "apto" passa');
select is((select estado || ' ' || parecer || ' ' || cardinality(restricoes)::text from public.participantes_verificacoes where participante_id = :'c1'), 'concluida apto 0', 'concluída, apto, sem restrição (as marcadas são ignoradas)');
select is((select verificado_em is not null and restricoes = '{}' from public.participantes where id = :'c1'), true, 'a pessoa ficou verificada, sem restrição');
select lives_ok(format('select public.mudar_situacao_participante(%L, %L)', :'c1', 'ativo'), 'e a aprovação passa');
select is((select situacao from public.participantes where id = :'c1'), 'ativo', 'ativa');
select lives_ok(format('select public.auditar_parecer_verificacao(%L)', :'c1'), 'o parecer em PDF fica na trilha');
select is((select count(*)::int from public.participantes_auditoria where participante_id = :'c1' and acao = 'parecer_pdf'), 1, 'registrado');

-- Aprovar com restrição direto da lista (sem checklist).
select throws_ok(format('select public.aprovar_candidato_com_restricao(%L, %L, %L)', :'c2', '{sem_valores}', 'Precisamos dela amanhã na campanha'), 'P0001',
                 'Sem identidade e antecedentes conferidos, a restrição "Não atua com crianças e adolescentes" é obrigatória (Lei 14.811/2024).', 'da lista, sem a restrição de crianças, recusa');
select lives_ok(format('select public.aprovar_candidato_com_restricao(%L, %L, %L)', :'c2', '{sem_criancas_adolescentes,sem_valores}', 'Precisamos dela amanhã na campanha; documentos depois'), 'com a restrição, aprova');
select is((select situacao || ' ' || array_to_string(restricoes, ',') from public.participantes where id = :'c2'), 'ativo sem_criancas_adolescentes,sem_valores', 'ativa, com as restrições na ficha');
select is((select parecer from public.participantes_verificacoes where participante_id = :'c2' and estado = 'concluida'), 'apto_com_restricao', 'a verificação ficou concluída com restrição');
select is((select count(*)::int from public.participantes_verificacoes where participante_id = :'c2' and estado in ('aberta','enviada')), 0, 'nada em andamento sobrou');
select lives_ok(format('select public.abrir_verificacao_participante(%L, %L, %L)', :'c2', 'renovacao', repeat('e', 64)), 'depois, a renovação do atestado abre para quem é ativo');

-- ================================================================ anonimizar e recusar limpam tudo

select lives_ok(format('select public.anonimizar_participante(%L, %L)', :'c1', 'Pediu pela LGPD'), 'anonimizar');
select is((select count(*)::int from public.participantes_referencias where participante_id = :'c1'), 0, 'as referências somem');
select is((select documento_lido is null and sancoes is null and registro_profissional is null and itens = '{}'::jsonb and parecer = 'apto' from public.participantes_verificacoes where participante_id = :'c1'), true, 'a verificação fica só com o parecer');
select is((select count(*)::int from public.participantes_arquivos where participante_id = :'c1' and (excluido_em is null or nome_original <> 'arquivo' or codigo_autenticacao is not null)), 0, 'os arquivos ficam excluídos e sem nome');
select is((select restricoes from public.participantes where id = :'c1'), '{}'::text[], 'restrições zeradas');

select lives_ok(format('select public.abrir_verificacao_participante(%L, %L, %L)', :'c3', 'completa', repeat('f', 64)), 'abre a verificação da terceira');
select lives_ok(format('select public.recusar_candidato(%L)', :'c3'), 'recusar a inscrição');
select is((select count(*)::int from public.participantes_verificacoes where participante_id = :'c3'), 0, 'a verificação vai junto (cascade)');
reset role;

select * from finish();
rollback;
