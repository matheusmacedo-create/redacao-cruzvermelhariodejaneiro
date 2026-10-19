-- ============================================================
-- WhatsApp: cadastro de colaborador confirmado no Palácio (19/10/2026)
--
-- Só acrescenta (ARQUITETURA §10.1), depois de 20261018223000 (as
-- confirmações da onda 2) e de 20261019020000 (o plano do assistente, que
-- reconstruiu a restrição de acao). O código funciona sem esta migração:
-- antes dela, o banco recusa a pergunta e o link novos (fora dos CHECKs), e o
-- bot responde que o cadastro é pela tela "Adicionar pessoas", com o link.
--
--  - whatsapp_pendencias.tipo ganha "cadastrar_colaborador": as etapas da
--    conversa "colaborador: Nome" (o nome, o e-mail, o WhatsApp da pessoa, a
--    coordenação, o cargo, o papel, o pedido da ficha do RH e a conferência).
--    A lista é lida da restrição em vigor e só ganha o que falta (o mesmo
--    bloco de 20261018233000 e 20261019030000).
--  - whatsapp_confirmacoes.acao ganha "cadastrar_colaborador": a conta só
--    nasce confirmada no Palácio (app/confirmar/[token]), pela sessão de quem
--    pediu e pelo MESMO núcleo de "Adicionar pessoas" (lib/contas/cadastro.ts).
--    A conta ainda não existe: o alvo é a ficha do RH reaproveitada ou um id
--    novo, só do pedido. A lista é lida da restrição em vigor (só a de uma
--    coluna: whatsapp_confirmacoes_plano_coerente também cita acao) e só ganha
--    o que falta, como em 20261019020000.
--  - private.whatsapp_cadastro_sem_contato: o e-mail e o WhatsApp da pessoa
--    nova vivem só nos dados da pergunta e do link. Quando a pergunta se
--    encerra (respondida, cancelada ou trocada por outra — inclusive pelos
--    caminhos que encerram todas as perguntas da pessoa sem olhar o tipo) ou
--    o link é usado (ou substituído por um mais novo), eles saem na MESMA
--    gravação, e os dados ficam marcados "redigida". Quem executa já leu o
--    pedido antes de gastar o link. O que vence sem ser encerrado é redigido
--    pelo servidor (a faxina, como a das visitas da portaria).
--
-- Nada de policy nova: whatsapp_pendencias continua só do servidor, e a
-- leitura do dono em whatsapp_confirmacoes (whatsapp_confirmacoes_select_dono)
-- vale para o link do cadastro.
-- ============================================================

-- ---------------------------------------------------------------- o tipo novo de pergunta e a ação nova do link

do $$
declare
  v_nome text;
  v_def text;
  v_lista text[];
  v_novos text[] := array['cadastrar_colaborador'];
begin
  -- Fora de ordem (sem a tabela das confirmações), a aplicação falha: não pode ficar registrada como aplicada sem
  -- ter feito nada.
  if to_regclass('public.whatsapp_pendencias') is null then
    raise exception 'whatsapp_pendencias ausente: aplique antes 20260929110000 (as ações pelo WhatsApp).';
  end if;
  if to_regclass('public.whatsapp_confirmacoes') is null then
    raise exception 'whatsapp_confirmacoes ausente: aplique antes 20261018223000 (as confirmações da onda 2).';
  end if;

  -- whatsapp_pendencias.tipo
  select c.conname, pg_get_constraintdef(c.oid) into v_nome, v_def
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.conrelid = 'public.whatsapp_pendencias'::regclass and c.contype = 'c' and a.attname = 'tipo'
     and cardinality(c.conkey) = 1
   limit 1;
  -- Sem restrição no tipo, nada a ampliar.
  if v_def is not null then
    -- Os dois formatos: o da criação (tipo in (...), lido como ARRAY['a'::text, ...]) e o da reconstrução ('{a,b}'::text[]).
    if v_def ~ '''\{[a-z_,]*\}''' then
      v_lista := string_to_array(substring(v_def from '''\{([a-z_,]*)\}'''), ',');
    else
      select array_agg(distinct m[1] order by m[1]) into v_lista from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
    end if;
    if coalesce(cardinality(v_lista), 0) = 0 then
      raise exception 'Não consegui ler os tipos de whatsapp_pendencias: %', v_def;
    end if;
    if not v_lista @> v_novos then
      v_lista := array(select distinct x from unnest(v_lista || v_novos) as x order by x);
      execute format('alter table public.whatsapp_pendencias drop constraint %I', v_nome);
      execute format('alter table public.whatsapp_pendencias add constraint whatsapp_pendencias_tipo_check check (tipo = any (%L::text[]))', v_lista);
    end if;
  end if;

  -- whatsapp_confirmacoes.acao (só a restrição de uma coluna: a do plano também cita acao)
  v_nome := null;
  v_def := null;
  v_lista := null;
  select c.conname, pg_get_constraintdef(c.oid) into v_nome, v_def
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.conrelid = 'public.whatsapp_confirmacoes'::regclass and c.contype = 'c' and a.attname = 'acao'
     and cardinality(c.conkey) = 1
   limit 1;
  if v_def is not null then
    if v_def ~ '''\{[a-z_,]*\}''' then
      v_lista := string_to_array(substring(v_def from '''\{([a-z_,]*)\}'''), ',');
    else
      select array_agg(distinct m[1] order by m[1]) into v_lista from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
    end if;
    if coalesce(cardinality(v_lista), 0) = 0 then
      raise exception 'Não consegui ler as ações de whatsapp_confirmacoes: %', v_def;
    end if;
    if not v_lista @> v_novos then
      v_lista := array(select distinct x from unnest(v_lista || v_novos) as x order by x);
      execute format('alter table public.whatsapp_confirmacoes drop constraint %I', v_nome);
      execute format('alter table public.whatsapp_confirmacoes add constraint whatsapp_confirmacoes_acao_check check (acao = any (%L::text[]))', v_lista);
    end if;
  end if;
end $$;

comment on table public.whatsapp_pendencias is
  'O passo que falta numa conversa com o bot do WhatsApp (confirmar a conferência, escolher fila e assunto do chamado, resolver ou transferir um chamado, registrar uma visita, a lista das decisões do Financeiro, a conferência do "Não fui eu", a chamada de uma ação, a saída e o retorno de um veículo, a pasta do Drive de um documento, o cadastro de um colaborador). Só o servidor lê e escreve.';
comment on table public.whatsapp_confirmacoes is
  'Pedidos sensíveis feitos pelo WhatsApp (decidir despesa ou compra, votar com a verificação em duas etapas, desativar conta, o plano do assistente, cadastrar um colaborador) que só acontecem confirmados no Palácio, pelo link de uso único (15 min, só o hash do código). A pessoa lê só os dela; escrita só pelo servidor.';

-- ---------------------------------------------------------------- o contato da pessoa nova sai quando a conversa acaba

-- Só mexe na linha que está sendo gravada (NEW): roda com o papel de quem grava (o service role), sem security
-- definer. search_path vazio, como as vizinhas.
create or replace function private.whatsapp_cadastro_sem_contato()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- As chaves são as de lib/contas/cadastro-regras.ts (CHAVES_DE_CONTATO): mudou lá, muda aqui.
  new.dados := (coalesce(new.dados, '{}'::jsonb) - 'email' - 'whatsapp') || jsonb_build_object('redigida', true);
  return new;
end $$;
revoke all on function private.whatsapp_cadastro_sem_contato() from public, anon, authenticated;

comment on function private.whatsapp_cadastro_sem_contato() is
  'Tira o e-mail e o WhatsApp da pessoa nova dos dados do cadastro de colaborador pelo WhatsApp (a pergunta encerrada ou o link usado) e marca os dados como redigidos.';

-- create or replace trigger: idempotente sem drop. O WHEN restringe ao cadastro já encerrado (ou ao link já usado):
-- as outras perguntas e os outros links não passam pela função.
create or replace trigger whatsapp_pendencias_cadastro_sem_contato
  before insert or update on public.whatsapp_pendencias
  for each row when (new.tipo = 'cadastrar_colaborador' and new.encerrada_em is not null)
  execute function private.whatsapp_cadastro_sem_contato();

create or replace trigger whatsapp_confirmacoes_cadastro_sem_contato
  before insert or update on public.whatsapp_confirmacoes
  for each row when (new.acao = 'cadastrar_colaborador' and new.usado_em is not null)
  execute function private.whatsapp_cadastro_sem_contato();
