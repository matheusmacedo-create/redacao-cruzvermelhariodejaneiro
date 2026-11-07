-- O espaço de Demonstração (docs/AJUDA.md §13): cria, ou recria, os dados fictícios das gravações dos tutoriais.
--
-- O banco é um só, e é produção (AGENTS.md): rode só quando o responsável pedir, inteiro, no editor SQL do
-- Supabase (é um bloco só: ou tudo acontece, ou nada). Tudo acontece dentro do espaço "demonstracao"
-- (kind = 'demo'). O script para sem mudar nada se esse espaço existir e não for de Demonstração, se faltar a
-- conta de gravação ou se ela estiver em outro espaço.
--
-- Rodar de novo é o "recomeçar" depois de uma gravação: apaga as pautas, os conteúdos, as aprovações, a agenda,
-- as etiquetas, os projetos, os avisos e o histórico do espaço de Demonstração e grava tudo outra vez, com as
-- datas contadas a partir de hoje. As pessoas, os setores e os canais do chat ficam.
--
-- Nunca entra aqui (e não se grava vídeo disso na Demonstração antes de a trilha pública saber pular o espaço):
-- publicação agendada (o pg_cron publica de verdade), ofício, certificado, transparência, campanha de imprensa,
-- endereço da matéria no site (content_pieces.site_url). A trilha pública registra esses atos para sempre.
--
-- As cinco pessoas fictícias não têm e-mail, WhatsApp nem senha, e a conta delas está bloqueada no Auth: nenhum
-- aviso do Palácio sai para fora, e ninguém entra com elas. A conta de gravação (usuário "gravacao", a "Ana
-- Ribeiro" da tela) é criada à parte: a senha não fica no repositório.

do $semear$
declare
  ws uuid;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  segunda date;
  agora timestamptz := now();

  ana uuid;
  helena constant uuid := 'de30de30-0000-4000-a000-000000000001';
  rafael constant uuid := 'de30de30-0000-4000-a000-000000000002';
  beatriz constant uuid := 'de30de30-0000-4000-a000-000000000003';
  tiago constant uuid := 'de30de30-0000-4000-a000-000000000004';
  camila constant uuid := 'de30de30-0000-4000-a000-000000000005';

  prj_fim uuid; prj_vol uuid; prj_ver uuid;
  p_balanco uuid; p_sangue uuid; p_video uuid; p_release uuid; p_newsletter uuid; p_mutirao uuid; p_chamada uuid;
  p_resgate uuid; p_parceria uuid; p_brigada uuid; p_agenda uuid; p_depoimento uuid; p_agasalho uuid;
  c_sangue uuid; c_mutirao uuid; c_chamada uuid; c_parceria uuid; c_brigada uuid; c_agasalho uuid; c_depoimento uuid;
  a_mutirao uuid; a_chamada uuid; a_parceria uuid; a_brigada uuid; a_agasalho uuid;
  e_urgente uuid; e_redes uuid; e_imprensa uuid; e_video uuid;

  -- O que a tela da aprovação grava junto do voto (lib/aprovacoes/setores.ts, registroDaConferencia).
  conferido_com constant text := 'Conferido (Comunicação Social): Ortografia, títulos e legendas revisados; legenda diz quem, o quê, onde e quando; Tom de voz, manual de marca e emblema sem distorção; Sem sensacionalismo nem exploração do sofrimento; conteúdo de IA está rotulado; Links, @menções, hashtags e texto alternativo das imagens conferidos.';
begin
  segunda := hoje - (extract(isodow from hoje)::int - 1);

  -- 1. O espaço e a conta de gravação ------------------------------------------------------------------------
  select id into ana from public.profiles where username = 'gravacao';
  if ana is null then
    raise exception 'Falta a conta de gravação (usuário "gravacao"): crie-a antes (docs/AJUDA.md §13). Nada foi feito.';
  end if;

  select id into ws from public.workspaces where slug = 'demonstracao';
  if ws is null then
    insert into public.workspaces (name, slug, kind) values ('Demonstração', 'demonstracao', 'demo') returning id into ws;
  elsif (select kind from public.workspaces where id = ws) <> 'demo' then
    raise exception 'O espaço "demonstracao" existe e não é de Demonstração. Nada foi feito.';
  end if;

  if exists (select 1 from public.workspace_members where user_id = ana and workspace_id <> ws) then
    raise exception 'A conta de gravação está em outro espaço além da Demonstração: tire-a de lá antes. Nada foi feito.';
  end if;

  -- O nome que aparece na tela ("Bom dia, Ana."). O usuário de entrada continua "gravacao".
  update public.profiles
     set full_name = 'Ana Ribeiro', initials = 'AR', job_title = 'Assessora de Comunicação (conta de demonstração)', active = true
   where id = ana;
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', 'Ana Ribeiro')
   where id = ana;

  -- 2. As pessoas fictícias: sem senha, sem e-mail de verdade, bloqueadas -------------------------------------
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change,
                          banned_until, is_sso_user, is_anonymous)
  select '00000000-0000-0000-0000-000000000000', p.id, 'authenticated', 'authenticated', p.usuario || '@usuarios.cvrj.local', '',
         '{"provider":"email","providers":["email"]}'::jsonb,
         jsonb_build_object('username', p.usuario, 'full_name', p.nome, 'demonstracao', true),
         agora, agora, '', '', '', '', '2999-01-01 00:00:00+00', false, false
    from (values
      (helena, 'demo.helena', 'Helena Duarte'),
      (rafael, 'demo.rafael', 'Rafael Monteiro'),
      (beatriz, 'demo.beatriz', 'Beatriz Lacerda'),
      (tiago, 'demo.tiago', 'Tiago Furtado'),
      (camila, 'demo.camila', 'Camila Rezende')
    ) as p (id, usuario, nome)
  on conflict (id) do nothing;

  insert into public.profiles (id, username, full_name, job_title, initials, trocar_senha)
  values
    (helena, 'demo.helena', 'Helena Duarte', 'Coordenadora de Comunicação', 'HD', false),
    (rafael, 'demo.rafael', 'Rafael Monteiro', 'Repórter e redator', 'RM', false),
    (beatriz, 'demo.beatriz', 'Beatriz Lacerda', 'Coordenadora de Voluntariado', 'BL', false),
    (tiago, 'demo.tiago', 'Tiago Furtado', 'Analista de Gestão de Riscos', 'TF', false),
    (camila, 'demo.camila', 'Camila Rezende', 'Assessora jurídica', 'CR', false)
  on conflict (id) do update
    set full_name = excluded.full_name, job_title = excluded.job_title, initials = excluded.initials, active = true;

  -- Helena é a administradora do espaço (todo espaço precisa de uma, private.garantir_admin_no_espaco).
  -- A Ana é editora, como a maior parte da equipe: o vídeo mostra o que quase todo mundo vê.
  insert into public.workspace_members (workspace_id, user_id, role, coordination)
  values
    (ws, helena, 'admin', 'Comunicação Social'),
    (ws, ana, 'editor', 'Comunicação Social'),
    (ws, rafael, 'editor', 'Comunicação Social'),
    (ws, beatriz, 'colaborador', 'Voluntariado'),
    (ws, tiago, 'editor', 'GRD'),
    (ws, camila, 'editor', 'Jurídico')
  on conflict (workspace_id, user_id) do update
    set role = excluded.role, coordination = excluded.coordination
    where workspace_members.role is distinct from excluded.role
       or workspace_members.coordination is distinct from excluded.coordination;

  -- 3. Setores e chat, como na Produção --------------------------------------------------------------------
  perform private.semear_setores(ws);
  insert into public.setor_membros (setor_id, user_id, workspace_id)
  select s.id, m.user_id, ws
    from (values
      (helena, 'Comunicação Social'), (ana, 'Comunicação Social'), (rafael, 'Comunicação Social'),
      (beatriz, 'Voluntariado'), (tiago, 'GRD'), (camila, 'Jurídico')
    ) as m (user_id, setor)
    join public.setores s on s.workspace_id = ws and lower(s.nome) = lower(m.setor)
  on conflict do nothing;
  update public.setores s set responsavel_id = r.user_id
    from (values (helena, 'Comunicação Social'), (beatriz, 'Voluntariado'), (tiago, 'GRD'), (camila, 'Jurídico')) as r (user_id, setor)
   where s.workspace_id = ws and lower(s.nome) = lower(r.setor) and s.responsavel_id is distinct from r.user_id;
  perform private.chat_semear(ws);

  -- 4. Recomeço: o que uma gravação anterior deixou, só neste espaço ---------------------------------------
  delete from public.notifications where workspace_id = ws;
  delete from public.activity_log where workspace_id = ws;
  delete from public.calendar_events where workspace_id = ws;
  -- Apagar a pauta leva, em cascata, os conteúdos, as aprovações, os votos, a lista de tarefas, as etiquetas
  -- da pauta e os participantes.
  delete from public.pautas where workspace_id = ws;
  delete from public.content_pieces where workspace_id = ws;
  delete from public.project_updates where workspace_id = ws;
  delete from public.projects where workspace_id = ws;
  delete from public.etiquetas where workspace_id = ws;
  delete from public.inicio_preferencias where workspace_id = ws;

  -- 5. Projetos ----------------------------------------------------------------------------------------------
  insert into public.projects (workspace_id, name, description, inicio, fim, responsavel_id, situacao, situacao_em, created_by, created_at, updated_at)
  values (ws, 'Campanha de fim de ano', 'Doações de Natal e a mensagem de fim de ano da filial nas redes, no site e na imprensa.',
          hoje - 20, hoje + 50, helena, 'no_prazo', agora - interval '3 days', helena, agora - interval '20 days', agora - interval '3 days')
  returning id into prj_fim;
  insert into public.projects (workspace_id, name, description, inicio, fim, responsavel_id, situacao, situacao_em, created_by, created_at, updated_at)
  values (ws, 'Semana do Voluntariado', 'Chamada de novos voluntários, histórias de quem já ajuda e a cerimônia de boas-vindas.',
          hoje - 15, hoje + 12, beatriz, 'em_risco', agora - interval '1 day', beatriz, agora - interval '15 days', agora - interval '1 day')
  returning id into prj_vol;
  insert into public.projects (workspace_id, name, description, inicio, fim, responsavel_id, situacao, situacao_em, created_by, created_at, updated_at)
  values (ws, 'Plano de verão: chuvas e enchentes', 'Orientações à população e preparação das equipes para a temporada de chuvas.',
          hoje - 12, hoje + 70, tiago, 'no_prazo', agora - interval '2 days', tiago, agora - interval '12 days', agora - interval '2 days')
  returning id into prj_ver;

  insert into public.project_updates (workspace_id, project_id, situacao, texto, autor_id, created_at) values
    (ws, prj_vol, 'em_risco', 'Ainda faltam as fotos dos voluntários e a confirmação do auditório. Se não chegarem até sexta, a cerimônia muda de data.', beatriz, agora - interval '1 day'),
    (ws, prj_ver, 'no_prazo', 'Roteiro das orientações fechado com a GRD; a gravação com a equipe de resgate está marcada para esta semana.', tiago, agora - interval '2 days'),
    (ws, prj_fim, 'no_prazo', 'Peças das redes aprovadas e o texto do site em revisão. Próximo passo: a lista de imprensa.', helena, agora - interval '3 days');

  -- 6. Etiquetas ---------------------------------------------------------------------------------------------
  insert into public.etiquetas (workspace_id, nome, cor, created_by) values (ws, 'Urgente', 'vermelho', helena) returning id into e_urgente;
  insert into public.etiquetas (workspace_id, nome, cor, created_by) values (ws, 'Redes sociais', 'azul', helena) returning id into e_redes;
  insert into public.etiquetas (workspace_id, nome, cor, created_by) values (ws, 'Imprensa', 'roxo', helena) returning id into e_imprensa;
  insert into public.etiquetas (workspace_id, nome, cor, created_by) values (ws, 'Vídeo', 'laranja', helena) returning id into e_video;

  -- 7. Pautas ------------------------------------------------------------------------------------------------
  -- As da Ana (o bloco "Minhas pautas" do Início): uma atrasada, uma que vence hoje e as próximas.
  insert into public.pautas (workspace_id, project_id, title, description, details, status, priority, coordination, due_date, data_inicio, owner_id, created_by, tags, created_at, updated_at)
  values (ws, null, 'Balanço do curso de primeiros socorros', 'Matéria para o site com os números da última turma e o depoimento de uma aluna.',
          '{"local": "Sede da filial", "participantsCount": "24"}', 'production', 'high', 'Comunicação Social', hoje - 2, hoje - 9, ana, rafael, '{Ação}',
          agora - interval '9 days', agora - interval '4 days')
  returning id into p_balanco;
  insert into public.pautas (workspace_id, project_id, title, description, details, status, priority, coordination, due_date, data_inicio, owner_id, created_by, tags, created_at, updated_at)
  values (ws, prj_fim, 'Convite para a doação de sangue', 'Post e story chamando para a coleta de sangue na sede, com os horários e o que levar.',
          '{"local": "Sede da filial", "schedule": "Das 9h às 16h"}', 'production', 'medium', 'Comunicação Social', hoje, hoje - 5, ana, helena, '{Evento}',
          agora - interval '6 days', agora - interval '1 day')
  returning id into p_sangue;
  insert into public.pautas (workspace_id, project_id, title, description, details, status, priority, coordination, due_date, owner_id, created_by, tags, created_at, updated_at)
  values (ws, prj_vol, 'Vídeo curto: como se tornar voluntário', 'Roteiro de um minuto com o passo a passo da inscrição, para o Instagram e o WhatsApp.',
          '{"ideaGoal": "Explicar a inscrição em menos de um minuto."}', 'collection', 'medium', 'Voluntariado', hoje + 3, ana, beatriz, '{Ideia}',
          agora - interval '5 days', agora - interval '2 days')
  returning id into p_video;
  insert into public.pautas (workspace_id, project_id, title, description, details, status, priority, coordination, due_date, owner_id, created_by, tags, created_at, updated_at)
  values (ws, prj_ver, 'Release do plano de verão contra enchentes', 'Texto para a imprensa com as orientações de preparação e os contatos da filial.',
          '{"materialType": "Texto"}', 'incoming', 'high', 'GRD', hoje + 6, ana, tiago, '{Material}',
          agora - interval '1 day', agora - interval '1 day')
  returning id into p_release;
  insert into public.pautas (workspace_id, project_id, title, description, details, status, priority, coordination, due_date, owner_id, created_by, tags, created_at, updated_at)
  values (ws, null, 'Newsletter do mês', 'As principais ações do mês, a agenda e a chamada de doação.',
          '{}', 'production', 'low', 'Comunicação Social', hoje + 10, ana, helena, '{Outro}',
          agora - interval '8 days', agora - interval '3 days')
  returning id into p_newsletter;

  -- A da aprovação do vídeo: a Helena já aprovou, o voto da Ana fecha a rodada.
  insert into public.pautas (workspace_id, project_id, title, description, details, status, priority, coordination, due_date, owner_id, created_by, tags, created_at, updated_at)
  values (ws, null, 'Galeria do mutirão de saúde', 'Fotos e legenda do mutirão de aferição de pressão e glicemia na sede.',
          '{"local": "Sede da filial", "volunteersCount": "18"}', 'approval', 'high', 'Comunicação Social', hoje + 1, rafael, rafael, '{Ação}',
          agora - interval '3 days', agora - interval '20 hours')
  returning id into p_mutirao;
  insert into public.pautas (workspace_id, project_id, title, description, details, status, priority, coordination, due_date, owner_id, created_by, tags, created_at, updated_at)
  values (ws, prj_vol, 'Chamada para a Semana do Voluntariado', 'Card e texto convidando novos voluntários, com os requisitos e o link de inscrição.',
          '{}', 'approval', 'medium', 'Voluntariado', hoje + 2, beatriz, beatriz, '{Evento}',
          agora - interval '4 days', agora - interval '2 hours')
  returning id into p_chamada;

  -- As dos colegas, espalhadas pelas colunas do quadro.
  insert into public.pautas (workspace_id, project_id, title, description, details, status, priority, coordination, due_date, owner_id, created_by, tags, created_at, updated_at)
  values (ws, prj_ver, 'Entrevista com a equipe de resgate', 'Perfil da equipe de busca e salvamento para o site e o YouTube.',
          '{"story": "Como a equipe se prepara para a temporada de chuvas.", "contact": "Coordenação da GRD"}', 'production', 'medium', 'GRD', hoje + 4, tiago, tiago, '{História}',
          agora - interval '7 days', agora - interval '5 hours')
  returning id into p_resgate;
  insert into public.pautas (workspace_id, project_id, title, description, details, status, priority, coordination, due_date, owner_id, created_by, tags, created_at, updated_at)
  values (ws, null, 'Nota sobre a parceria com escolas da rede pública', 'Nota institucional sobre as oficinas de prevenção nas escolas.',
          '{"materialType": "Texto"}', 'production', 'medium', 'Jurídico', hoje + 5, camila, camila, '{Material}',
          agora - interval '6 days', agora - interval '2 days')
  returning id into p_parceria;
  insert into public.pautas (workspace_id, project_id, title, description, details, status, priority, coordination, due_date, owner_id, created_by, tags, created_at, updated_at)
  values (ws, null, 'Depoimento de uma doadora de sangue', 'Uma doadora antiga conta por que volta à sede a cada três meses.',
          '{"story": "Doadora há dez anos, chama amigos para cada coleta."}', 'review', 'medium', 'Comunicação Social', hoje + 2, rafael, rafael, '{História}',
          agora - interval '5 days', agora - interval '1 day')
  returning id into p_depoimento;
  insert into public.pautas (workspace_id, project_id, title, description, details, status, priority, coordination, due_date, owner_id, created_by, tags, created_at, updated_at)
  values (ws, null, 'Agenda da semana nas redes', 'Story fixo com as atividades da semana na sede.',
          '{"notes": "Toda segunda-feira, até as 10h."}', 'incoming', 'low', 'Comunicação Social', null, helena, helena, '{Sugestão}',
          agora - interval '2 days', agora - interval '2 days')
  returning id into p_agenda;
  insert into public.pautas (workspace_id, project_id, title, description, details, status, priority, coordination, due_date, owner_id, created_by, tags, created_at, updated_at)
  values (ws, null, 'Cobertura do treinamento de brigadistas', 'Fotos e texto do treinamento de brigada de incêndio com empresas parceiras.',
          '{"local": "Sede da filial"}', 'approved', 'medium', 'Primeiros Socorros', hoje - 1, rafael, rafael, '{Ação}',
          agora - interval '6 days', agora - interval '3 days')
  returning id into p_brigada;
  insert into public.pautas (workspace_id, project_id, title, description, details, status, priority, coordination, due_date, owner_id, created_by, tags, created_at, updated_at)
  values (ws, null, 'Balanço da campanha do agasalho', 'Quantas peças chegaram, para onde foram e o agradecimento a quem doou.',
          '{}', 'approved', 'medium', 'Humanitário', hoje - 14, rafael, helena, '{Ação}',
          agora - interval '20 days', agora - interval '15 days')
  returning id into p_agasalho;

  insert into public.pauta_etiquetas (pauta_id, etiqueta_id, workspace_id) values
    (p_balanco, e_urgente, ws), (p_sangue, e_redes, ws), (p_video, e_video, ws), (p_video, e_redes, ws),
    (p_release, e_imprensa, ws), (p_mutirao, e_redes, ws), (p_chamada, e_redes, ws), (p_resgate, e_video, ws);

  insert into public.pauta_participants (pauta_id, user_id) values
    (p_mutirao, ana), (p_mutirao, helena), (p_sangue, rafael), (p_video, beatriz), (p_resgate, rafael);

  insert into public.pauta_checklist (workspace_id, pauta_id, texto, feito, posicao, created_by) values
    (ws, p_balanco, 'Entrevistar a instrutora da turma', true, 1, ana),
    (ws, p_balanco, 'Pedir os números à Escola', true, 2, ana),
    (ws, p_balanco, 'Escolher três fotos com autorização de imagem', false, 3, ana),
    (ws, p_balanco, 'Escrever o texto e pedir a aprovação', false, 4, ana);

  -- 8. Conteúdos (nunca com site_url nem site_published_at: a trilha pública registraria) -----------------
  insert into public.content_pieces (workspace_id, pauta_id, title, subtitle, body, format, status, responsible_id, created_by, created_at, updated_at)
  values (ws, p_sangue, 'Convite para a doação de sangue', null,
          E'Doar sangue leva menos de uma hora e pode salvar até quatro vidas. A coleta é na sede, das 9h às 16h.\n\nLeve um documento com foto e venha alimentado.',
          'Instagram', 'draft', ana, helena, agora - interval '6 days', agora - interval '1 day')
  returning id into c_sangue;
  insert into public.content_pieces (workspace_id, pauta_id, title, subtitle, body, format, status, responsible_id, created_by, created_at, updated_at)
  values (ws, p_mutirao, 'Mutirão de saúde na sede', 'Voluntários fazem aferição de pressão e glicemia',
          E'Neste fim de semana, 18 voluntários atenderam moradores na sede, com aferição de pressão arterial, teste de glicemia e orientação sobre alimentação.\n\nLegenda: Saúde também se cuida em comunidade. Obrigado a cada voluntário que fez o mutirão acontecer! #CruzVermelhaRJ #Voluntariado\n\nTexto alternativo: voluntária de colete vermelho mede a pressão de um senhor sentado.',
          'Instagram', 'review', rafael, rafael, agora - interval '3 days', agora - interval '20 hours')
  returning id into c_mutirao;
  insert into public.content_pieces (workspace_id, pauta_id, title, subtitle, body, format, status, responsible_id, created_by, created_at, updated_at)
  values (ws, p_chamada, 'Seja voluntário da Cruz Vermelha', 'Inscrições abertas para a Semana do Voluntariado',
          E'Quer ajudar? A Semana do Voluntariado recebe pessoas a partir de 18 anos, sem experiência. A formação inicial é gratuita e acontece na sede.\n\nInscrição: cruzvermelhariodejaneiro.org/voluntariado\n\nTexto alternativo: grupo de voluntários de colete vermelho sorrindo em frente à sede.',
          'Instagram', 'review', beatriz, beatriz, agora - interval '4 days', agora - interval '2 hours')
  returning id into c_chamada;
  insert into public.content_pieces (workspace_id, pauta_id, title, subtitle, body, format, status, responsible_id, created_by, created_at, updated_at)
  values (ws, p_parceria, 'Oficinas de prevenção chegam às escolas', null,
          E'A filial leva oficinas de prevenção de acidentes e primeiros socorros a escolas da rede pública.\n\n(Rascunho: falta o nome da parceria como está no termo e a data de início.)',
          'Facebook', 'production', camila, camila, agora - interval '6 days', agora - interval '2 days')
  returning id into c_parceria;
  insert into public.content_pieces (workspace_id, pauta_id, title, subtitle, body, format, status, responsible_id, created_by, created_at, updated_at)
  values (ws, p_depoimento, 'Dez anos doando sangue', null,
          E'"Eu chamo os amigos para cada coleta." Uma doadora conta por que volta à sede a cada três meses.',
          'Instagram', 'draft', rafael, rafael, agora - interval '5 days', agora - interval '1 day')
  returning id into c_depoimento;
  insert into public.content_pieces (workspace_id, pauta_id, title, subtitle, body, format, status, responsible_id, created_by, created_at, updated_at)
  values (ws, p_brigada, 'Treinamento de brigadistas', null,
          E'Funcionários de empresas parceiras passaram o dia na sede aprendendo a agir num princípio de incêndio.',
          'Instagram', 'approved', rafael, rafael, agora - interval '6 days', agora - interval '3 days')
  returning id into c_brigada;
  insert into public.content_pieces (workspace_id, pauta_id, title, subtitle, body, format, status, responsible_id, created_by, created_at, updated_at)
  values (ws, p_agasalho, 'Campanha do agasalho: obrigado!', null,
          E'As doações chegaram a abrigos e famílias atendidas pela filial. Obrigado a quem doou.',
          'Instagram', 'approved', rafael, helena, agora - interval '20 days', agora - interval '15 days')
  returning id into c_agasalho;

  -- 9. Aprovações --------------------------------------------------------------------------------------------
  -- Esperando o voto da Ana: a do mutirão (o voto dela fecha a rodada) e a da Semana do Voluntariado.
  insert into public.approvals (workspace_id, content_id, requested_by, status, created_at, updated_at)
  values (ws, c_mutirao, rafael, 'pending', agora - interval '20 hours', agora - interval '3 hours') returning id into a_mutirao;
  insert into public.approval_voters (workspace_id, approval_id, user_id, decision, comment, decided_at, created_at) values
    (ws, a_mutirao, helena, 'approved', E'Fotos boas e legenda clara.\n\n' || conferido_com, agora - interval '3 hours', agora - interval '20 hours'),
    (ws, a_mutirao, ana, 'pending', null, null, agora - interval '20 hours');

  insert into public.approvals (workspace_id, content_id, requested_by, status, created_at, updated_at)
  values (ws, c_chamada, beatriz, 'pending', agora - interval '2 hours', agora - interval '2 hours') returning id into a_chamada;
  insert into public.approval_voters (workspace_id, approval_id, user_id, decision, created_at) values
    (ws, a_chamada, ana, 'pending', agora - interval '2 hours'),
    (ws, a_chamada, helena, 'pending', agora - interval '2 hours');

  -- Uma com ajustes pedidos e duas aprovadas (o histórico e os indicadores do Início).
  insert into public.approvals (workspace_id, content_id, requested_by, status, created_at, updated_at)
  values (ws, c_parceria, camila, 'changes_requested', agora - interval '3 days', agora - interval '2 days') returning id into a_parceria;
  insert into public.approval_voters (workspace_id, approval_id, user_id, decision, comment, decided_at, created_at) values
    (ws, a_parceria, helena, 'changes_requested', 'Falta o nome da parceria como está no termo assinado e a data de início das oficinas.', agora - interval '2 days', agora - interval '3 days');

  insert into public.approvals (workspace_id, content_id, requested_by, status, created_at, updated_at)
  values (ws, c_brigada, rafael, 'approved', agora - interval '4 days', agora - interval '3 days') returning id into a_brigada;
  insert into public.approval_voters (workspace_id, approval_id, user_id, decision, comment, decided_at, created_at) values
    (ws, a_brigada, ana, 'approved', conferido_com, agora - interval '3 days 2 hours', agora - interval '4 days'),
    (ws, a_brigada, helena, 'approved', conferido_com, agora - interval '3 days', agora - interval '4 days');

  insert into public.approvals (workspace_id, content_id, requested_by, status, created_at, updated_at)
  values (ws, c_agasalho, rafael, 'approved', agora - interval '16 days', agora - interval '15 days') returning id into a_agasalho;
  insert into public.approval_voters (workspace_id, approval_id, user_id, decision, comment, decided_at, created_at) values
    (ws, a_agasalho, helena, 'approved', conferido_com, agora - interval '15 days', agora - interval '16 days');

  -- 10. Agenda: a semana de hoje (publicações só de hoje em diante; atividades em qualquer dia) -----------------
  insert into public.calendar_events (workspace_id, pauta_id, content_id, title, event_date, event_time, type, channel, created_by) values
    (ws, null, null, 'Reunião de pauta da Comunicação', segunda, '09:30', 'atividade', null, helena),
    (ws, p_sangue, null, 'Coleta de sangue na sede', hoje, '09:00', 'atividade', null, helena),
    (ws, p_sangue, c_sangue, 'Convite para a doação de sangue', hoje, '10:00', 'publicacao', 'Instagram', helena),
    (ws, p_mutirao, c_mutirao, 'Mutirão de saúde na sede', hoje + 1, '18:00', 'publicacao', 'Instagram', rafael),
    (ws, p_chamada, c_chamada, 'Seja voluntário da Cruz Vermelha', hoje + 2, '12:00', 'publicacao', 'Instagram', beatriz),
    (ws, p_resgate, null, 'Gravação com a equipe de resgate', greatest(hoje, segunda + 3), '14:00', 'atividade', null, tiago),
    (ws, p_newsletter, null, 'Newsletter do mês', hoje + 10, '08:00', 'publicacao', 'Outro', helena);

  -- 11. Avisos da Ana (o sino) ---------------------------------------------------------------------------------
  insert into public.notifications (workspace_id, user_id, title, message, link, categoria, ator_id, created_at, read_at) values
    (ws, ana, 'Beatriz Lacerda pediu sua aprovação', 'Beatriz Lacerda enviou "Seja voluntário da Cruz Vermelha" e precisa do seu voto.',
      '/aprovacoes/' || a_chamada, 'aprovacoes', beatriz, agora - interval '2 hours', null),
    (ws, ana, 'Rafael Monteiro pediu sua aprovação', 'Rafael Monteiro enviou "Mutirão de saúde na sede" e precisa do seu voto.',
      '/aprovacoes/' || a_mutirao, 'aprovacoes', rafael, agora - interval '20 hours', null),
    (ws, ana, 'Tiago Furtado passou "Release do plano de verão contra enchentes" para você', 'Você é o responsável. Prazo: ' || to_char(hoje + 6, 'DD/MM/YYYY') || '.',
      '/pautas/' || p_release, 'pautas', tiago, agora - interval '1 day', null),
    (ws, ana, 'Helena Duarte adicionou você a uma pauta', 'Galeria do mutirão de saúde',
      '/pautas/' || p_mutirao, 'pautas', helena, agora - interval '3 days', agora - interval '2 days');

  -- 12. O que a equipe fez (o bloco "Equipe" e os indicadores do Início) ----------------------------------------
  insert into public.activity_log (workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at) values
    (ws, helena, 'created', 'project', prj_fim, jsonb_build_object('name', 'Campanha de fim de ano'), agora - interval '20 days'),
    (ws, helena, 'created', 'pauta', p_agasalho, jsonb_build_object('title', 'Balanço da campanha do agasalho'), agora - interval '20 days'),
    (ws, helena, 'status_changed', 'pauta', p_agasalho, jsonb_build_object('title', 'Balanço da campanha do agasalho', 'status', 'approved'), agora - interval '15 days'),
    (ws, beatriz, 'created', 'project', prj_vol, jsonb_build_object('name', 'Semana do Voluntariado'), agora - interval '15 days'),
    (ws, tiago, 'created', 'project', prj_ver, jsonb_build_object('name', 'Plano de verão: chuvas e enchentes'), agora - interval '12 days'),
    (ws, rafael, 'created', 'pauta', p_balanco, jsonb_build_object('title', 'Balanço do curso de primeiros socorros'), agora - interval '9 days'),
    (ws, tiago, 'created', 'pauta', p_resgate, jsonb_build_object('title', 'Entrevista com a equipe de resgate'), agora - interval '7 days'),
    (ws, rafael, 'created', 'pauta', p_brigada, jsonb_build_object('title', 'Cobertura do treinamento de brigadistas'), agora - interval '6 days'),
    (ws, ana, 'status_changed', 'pauta', p_balanco, jsonb_build_object('title', 'Balanço do curso de primeiros socorros', 'status', 'production'), agora - interval '4 days'),
    (ws, helena, 'status_changed', 'pauta', p_brigada, jsonb_build_object('title', 'Cobertura do treinamento de brigadistas', 'status', 'approved'), agora - interval '3 days'),
    (ws, helena, 'created', 'pauta', p_agenda, jsonb_build_object('title', 'Agenda da semana nas redes'), agora - interval '2 days'),
    (ws, tiago, 'created', 'pauta', p_release, jsonb_build_object('title', 'Release do plano de verão contra enchentes'), agora - interval '1 day'),
    (ws, rafael, 'status_changed', 'pauta', p_mutirao, jsonb_build_object('title', 'Galeria do mutirão de saúde', 'status', 'approval'), agora - interval '20 hours'),
    (ws, tiago, 'message_sent', 'pauta', p_resgate, jsonb_build_object('title', 'Entrevista com a equipe de resgate'), agora - interval '5 hours'),
    (ws, beatriz, 'status_changed', 'pauta', p_chamada, jsonb_build_object('title', 'Chamada para a Semana do Voluntariado', 'status', 'approval'), agora - interval '2 hours');

  raise notice 'Espaço de Demonstração pronto (%): 6 pessoas, 3 projetos, 13 pautas, 2 aprovações esperando a Ana.', ws;
end
$semear$;
