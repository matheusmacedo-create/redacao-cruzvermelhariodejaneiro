-- Fundação do envio de e-mail (09/11/2026): fila, hora marcada e o que o
-- provedor conta depois que a mensagem sai.
--
-- Até aqui a campanha de imprensa saía inteira dentro da server action (60 s,
-- teto de 1.000 destinatários), não tinha hora marcada, e o Palácio só sabia
-- que o Resend ACEITOU a mensagem: endereço que devolveu continuava "enviado"
-- e válido na tela, e recebia a campanha seguinte. Quatro peças, só acréscimos:
--
--  1. SUPRESSÃO. email_supressoes espelha a lista de supressão do Resend, que
--     vale para a conta inteira: endereço que devolveu em definitivo ou
--     denunciou spam não recebe mais nada. Apagar o contato e importar de novo
--     não o traz de volta; tirar o endereço da lista no painel do Resend, sim.
--
--  2. O QUE O PROVEDOR CONTA. O destinatário guarda o id da mensagem no
--     Resend; o webhook (/api/webhooks/resend) acha a linha por ele.
--     registrar_evento_de_email grava tudo numa transação: a linha da
--     campanha, o contato, o inscrito da newsletter e a supressão.
--
--  3. FILA. enfileirar_campanha grava a campanha e os destinatários de uma vez
--     (ou tudo entra, ou nada). reservar_lote_de_campanha entrega um lote por
--     chamada, com um trabalhador por vez no banco inteiro.
--
--  4. HORA MARCADA. A campanha ganha o estado 'agendada'. O relógio do banco
--     (pg_cron) chama /api/comunicados/fila a cada minuto, só quando há o que
--     enviar — o mesmo desenho de publicacoes_agendadas, com o mesmo segredo
--     'cron_secret' do cofre.

-- 1. Supressão ---------------------------------------------------------------

create table if not exists public.email_supressoes (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  -- Guardado em minúsculas pela função que grava.
  email         text not null check (position('@' in email) > 1),
  -- devolucao: o servidor de quem recebe recusou em definitivo.
  -- denuncia: a pessoa marcou a mensagem como spam.
  -- supressao: o Resend já não enviava para o endereço (estava na lista dele
  --   antes deste espelho existir, ou foi posto lá à mão).
  motivo        text not null check (motivo in ('devolucao','denuncia','supressao')),
  origem        text not null default 'imprensa' check (origem in ('imprensa','newsletter')),
  detalhe       text not null default '' check (char_length(detalhe) <= 500),
  criado_em     timestamptz not null default now()
);

comment on table public.email_supressoes is
  'Espelho da lista de supressão do Resend: endereços que não recebem mais envio em volume. Escrita só pelo servidor (webhook).';

create unique index if not exists email_supressoes_email_idx
  on public.email_supressoes (workspace_id, lower(email));

alter table public.email_supressoes enable row level security;
-- Quem está logado só lê (o RLS filtra pelo espaço); gravar é do servidor.
revoke all on public.email_supressoes from anon, authenticated;
grant select on public.email_supressoes to authenticated;

drop policy if exists email_supressoes_select_member on public.email_supressoes;
create policy email_supressoes_select_member on public.email_supressoes
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

-- 2. Colunas e estados novos -------------------------------------------------

alter table public.press_contacts
  add column if not exists devolvido_em        timestamptz,
  add column if not exists motivo_da_devolucao text not null default '';

alter table public.press_campanha_destinatarios
  add column if not exists resend_id           text,
  add column if not exists reservado_em        timestamptz,
  add column if not exists entregue_em         timestamptz,
  add column if not exists devolvido_em        timestamptz,
  add column if not exists motivo_da_devolucao text,
  add column if not exists denunciou_em        timestamptz;

create index if not exists press_campanha_destinatarios_resend_idx
  on public.press_campanha_destinatarios (resend_id) where resend_id is not null;
-- O evento que chega antes de o lote ser confirmado acha a linha pelo
-- endereço, entre as que estão a caminho (poucas, e por poucos segundos).
create index if not exists press_campanha_destinatarios_a_caminho_idx
  on public.press_campanha_destinatarios (lower(email)) where estado = 'enviando';
-- A fila lê "os próximos na_fila desta campanha" a cada lote.
create index if not exists press_campanha_destinatarios_fila_idx
  on public.press_campanha_destinatarios (campanha_id, created_at, id) where estado = 'na_fila';

-- enviando: reservado por um trabalhador, a caminho do Resend.
-- de_fora: não recebeu porque não podia (saiu da lista, endereço deixou de
--   valer ou está na supressão). Não é falha de envio.
alter table public.press_campanha_destinatarios
  drop constraint if exists press_campanha_destinatarios_estado_check;
alter table public.press_campanha_destinatarios
  add constraint press_campanha_destinatarios_estado_check
  check (estado in ('na_fila','enviando','enviado','falhou','de_fora'));

alter table public.press_campanhas
  add column if not exists agendada_para    timestamptz,
  -- Só a campanha criada por enfileirar_campanha entra na fila. Sem esta
  -- marca, o relógio retomaria campanha antiga que morreu no meio ('enviando'
  -- com gente 'na_fila') e mandaria hoje um release de semanas atrás.
  add column if not exists em_fila          boolean not null default false,
  add column if not exists trabalhador      uuid,
  add column if not exists trabalhando_ate  timestamptz,
  add column if not exists total_entregues  integer not null default 0,
  add column if not exists total_devolucoes integer not null default 0,
  add column if not exists total_denuncias  integer not null default 0;

alter table public.press_campanhas drop constraint if exists press_campanhas_estado_check;
alter table public.press_campanhas add constraint press_campanhas_estado_check
  check (estado in ('rascunho','agendada','enviando','enviada','parcial','falhou'));

create index if not exists press_campanhas_na_fila_idx
  on public.press_campanhas (estado, agendada_para) where em_fila and estado in ('agendada','enviando');

-- 3. O que o provedor conta --------------------------------------------------

-- Um evento do Resend, gravado de uma vez. p_tipo:
--   entregue   o servidor de quem recebe aceitou a mensagem.
--   devolucao  recusa DEFINITIVA: o endereço deixa de valer em todo lugar. A
--              temporária (caixa cheia, servidor fora do ar) nem chega aqui:
--              aquela mensagem pode não ter chegado, mas o endereço existe.
--   denuncia   marcou como spam: sai das listas, como se tivesse pedido.
--   suprimido  o Resend não enviou porque o endereço já estava na lista de
--              supressão dele: a mensagem não saiu e o endereço deixa de valer.
--   falha      o Resend aceitou o pedido e depois não conseguiu enviar (cota
--              do plano, por exemplo): a mensagem não saiu; o endereço segue.
--   liberado   alguém tirou o endereço da lista de supressão no Resend: volta
--              a poder receber. Quem denunciou continua fora (saída é permanente).
--
-- A linha da campanha é achada pelo id da mensagem; contato e inscrito, pelo
-- endereço. Repetir o mesmo evento não conta duas vezes. Devolve onde bateu:
-- 'campanha', 'contato' e 'newsletter' juntos por '+', ou 'desconhecido'.
create or replace function public.registrar_evento_de_email(
  p_resend_id text,
  p_email text,
  p_tipo text,
  p_detalhe text default ''
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email   text := lower(trim(coalesce(p_email, '')));
  v_detalhe text := left(coalesce(p_detalhe, ''), 500);
  v_linha   public.press_campanha_destinatarios%rowtype;
  v_fechada boolean := false;
  v_motivo  text;
  v_onde    text[] := '{}';
  v_n       integer;
begin
  if p_tipo not in ('entregue','devolucao','denuncia','suprimido','falha','liberado') then
    return 'ignorado';
  end if;

  -- (a) A linha da campanha.
  if coalesce(p_resend_id, '') <> '' and p_tipo <> 'liberado' then
    select * into v_linha from public.press_campanha_destinatarios
     where resend_id = p_resend_id limit 1 for update;
  end if;

  -- O Resend pode avisar antes de confirmar_lote_de_campanha gravar o id da
  -- mensagem. Nesse intervalo a linha está 'enviando', sem id: é ela, se o
  -- endereço for o mesmo. O id fica gravado para os eventos seguintes.
  if v_linha.id is null and coalesce(p_resend_id, '') <> '' and v_email <> '' and p_tipo <> 'liberado' then
    select * into v_linha from public.press_campanha_destinatarios
     where estado = 'enviando' and resend_id is null and lower(email) = v_email
     order by reservado_em desc limit 1 for update;
    if v_linha.id is not null then
      update public.press_campanha_destinatarios set resend_id = p_resend_id where id = v_linha.id;
    end if;
  end if;

  if v_linha.id is not null then
    v_onde := v_onde || 'campanha'::text;
    if v_email = '' then v_email := lower(v_linha.email); end if;
    select c.estado in ('enviada','parcial','falhou') into v_fechada
      from public.press_campanhas c where c.id = v_linha.campanha_id;

    if p_tipo = 'entregue' and v_linha.entregue_em is null then
      update public.press_campanha_destinatarios set entregue_em = now() where id = v_linha.id;
      update public.press_campanhas set total_entregues = total_entregues + 1 where id = v_linha.campanha_id;

    elsif p_tipo = 'devolucao' and v_linha.devolvido_em is null then
      update public.press_campanha_destinatarios
         set devolvido_em = now(), motivo_da_devolucao = v_detalhe where id = v_linha.id;
      update public.press_campanhas set total_devolucoes = total_devolucoes + 1 where id = v_linha.campanha_id;

    elsif p_tipo = 'denuncia' and v_linha.denunciou_em is null then
      update public.press_campanha_destinatarios set denunciou_em = now() where id = v_linha.id;
      update public.press_campanhas set total_denuncias = total_denuncias + 1 where id = v_linha.campanha_id;

    elsif p_tipo in ('suprimido','falha') and v_linha.estado in ('enviado','enviando') then
      -- A mensagem constava como enviada (ou a caminho) e não saiu. A linha
      -- que ainda estava a caminho não volta a 'enviado': a confirmação do
      -- lote só mexe em quem continua 'enviando'.
      update public.press_campanha_destinatarios
         set estado = case when p_tipo = 'suprimido' then 'de_fora' else 'falhou' end,
             erro = v_detalhe
       where id = v_linha.id;
      -- Campanha já fechada: os totais e o +1 do contato foram somados com a
      -- linha como 'enviado'. Em envio, concluir_campanha ainda vai contar.
      if v_fechada then
        update public.press_campanhas c
           set total_enviados = greatest(c.total_enviados - 1, 0),
               total_falhas = c.total_falhas + (case when p_tipo = 'falha' then 1 else 0 end),
               estado = case
                 when c.total_enviados <= 1 then 'falhou'
                 when p_tipo = 'falha' then 'parcial'
                 else c.estado
               end
         where c.id = v_linha.campanha_id;
        if v_linha.contato_id is not null then
          update public.press_contacts
             set total_envios = greatest(total_envios - 1, 0),
                 envios_sem_abertura = greatest(envios_sem_abertura - 1, 0)
           where id = v_linha.contato_id;
        end if;
      end if;
    end if;
  end if;

  -- (b) O endereço. Entrega e falha de envio não dizem nada sobre ele.
  if v_email = '' or p_tipo in ('entregue','falha') then
    return case when cardinality(v_onde) = 0 then 'desconhecido' else array_to_string(v_onde, '+') end;
  end if;

  if p_tipo = 'liberado' then
    delete from public.email_supressoes where lower(email) = v_email;
    update public.press_contacts
       set email_status = 'nao_verificado', devolvido_em = null, motivo_da_devolucao = ''
     where lower(email) = v_email and devolvido_em is not null;
    update public.newsletter_inscritos
       set estado = case when confirmado_em is not null then 'confirmado' else 'pendente' end
     where lower(email) = v_email and estado = 'invalido';
    return 'liberado';
  end if;

  v_motivo := case p_tipo when 'devolucao' then 'devolucao' when 'denuncia' then 'denuncia' else 'supressao' end;

  -- Contatos de imprensa com este endereço.
  if p_tipo = 'denuncia' then
    update public.press_contacts
       set descadastrado_em = coalesce(descadastrado_em, now())
     where lower(email) = v_email;
  else
    update public.press_contacts
       set email_status = 'invalido',
           devolvido_em = coalesce(devolvido_em, now()),
           motivo_da_devolucao = v_detalhe
     where lower(email) = v_email;
  end if;
  get diagnostics v_n = row_count;
  if v_n > 0 then v_onde := v_onde || 'contato'::text; end if;

  insert into public.email_supressoes (workspace_id, email, motivo, origem, detalhe)
  select w.workspace_id, v_email, v_motivo, 'imprensa', v_detalhe
    from (
      select c.workspace_id from public.press_contacts c where lower(c.email) = v_email
      union
      -- O contato pode ter sido apagado depois do envio: a campanha diz o espaço.
      select v_linha.workspace_id where v_linha.id is not null
    ) w
  on conflict (workspace_id, lower(email)) do nothing;

  -- Inscritos da newsletter com este endereço.
  with mexidos as (
    update public.newsletter_inscritos
       set estado = case when p_tipo = 'denuncia' then 'descadastrado' else 'invalido' end,
           descadastrado_em = case when p_tipo = 'denuncia' then coalesce(descadastrado_em, now()) else descadastrado_em end
     where lower(email) = v_email and estado in ('pendente','confirmado')
    returning workspace_id
  )
  insert into public.email_supressoes (workspace_id, email, motivo, origem, detalhe)
  select distinct m.workspace_id, v_email, v_motivo, 'newsletter', v_detalhe from mexidos m
  on conflict (workspace_id, lower(email)) do nothing;
  -- "Onde bateu" é quem tem o endereço, tenha o evento mudado algo ou não:
  -- repetir o mesmo evento devolve a mesma resposta.
  if exists (select 1 from public.newsletter_inscritos where lower(email) = v_email) then
    v_onde := v_onde || 'newsletter'::text;
  end if;

  return case when cardinality(v_onde) = 0 then 'desconhecido' else array_to_string(v_onde, '+') end;
end;
$$;

comment on function public.registrar_evento_de_email is
  'Grava um evento do Resend (entrega, devolução, denúncia, supressão, falha, liberação): linha da campanha, contato, inscrito da newsletter e supressão. Só service_role.';

revoke all on function public.registrar_evento_de_email(text, text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_evento_de_email(text, text, text, text) to service_role;

-- 4. Fila --------------------------------------------------------------------

-- Fecha uma campanha: totais, estado, e os contadores de envio dos contatos.
-- Mesma função de 20260923140100, com uma diferença: quem ficou 'de_fora' não
-- conta como falha de envio.
create or replace function public.concluir_campanha(p_campanha_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enviados integer;
  v_falhas integer;
begin
  select count(*) filter (where estado = 'enviado'),
         count(*) filter (where estado not in ('enviado','de_fora'))
    into v_enviados, v_falhas
    from public.press_campanha_destinatarios
   where campanha_id = p_campanha_id;

  update public.press_contacts c
     set total_envios = c.total_envios + 1,
         -- Quem já abriu antes de a campanha fechar (o Apple Mail pré-carrega
         -- na hora da entrega) não pode ganhar +1 na sequência sem abertura.
         envios_sem_abertura = case when d.aberto_em is null then c.envios_sem_abertura + 1 else 0 end,
         ultimo_envio_em = d.enviado_em
    from public.press_campanha_destinatarios d
   where d.campanha_id = p_campanha_id
     and d.estado = 'enviado'
     and d.contato_id = c.id;

  update public.press_campanhas
     set total_enviados = v_enviados,
         total_falhas = v_falhas,
         estado = case
           when v_enviados = 0 then 'falhou'
           when v_falhas > 0 then 'parcial'
           else 'enviada'
         end,
         concluida_em = now()
   where id = p_campanha_id;
end;
$$;

revoke all on function public.concluir_campanha(uuid) from public, anon, authenticated;
grant execute on function public.concluir_campanha(uuid) to service_role;

-- Põe uma campanha na fila: a campanha e todos os destinatários entram na
-- mesma transação. O relógio nunca enxerga campanha pela metade, e uma função
-- da Vercel que morre no meio não deixa "agendada" sem ninguém para receber.
--
-- Quem pode receber é decidido AQUI, com o dado do banco e não com a seleção
-- da tela: tem e-mail, não saiu da lista, não está inválido e não está na
-- supressão. É a mesma regra de motivoDeFora (lib/imprensa/campanha.ts).
--
-- p_rascunho_id: o rascunho que vira a campanha (null = campanha nova).
-- p_agendar_para: quando sai (null = agora).
-- Sem ninguém para receber, não grava nada e não devolve linha.
create or replace function public.enfileirar_campanha(
  p_workspace_id uuid,
  p_autor uuid,
  p_rascunho_id uuid,
  p_assunto text,
  p_corpo text,
  p_link_url text,
  p_link_rotulo text,
  p_contatos uuid[],
  p_agendar_para timestamptz default null
)
returns table (id_da_campanha uuid, total integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_total integer;
  v_agora timestamptz := now();
begin
  select count(*) into v_total
    from public.press_contacts c
   where c.workspace_id = p_workspace_id
     and c.id = any(p_contatos)
     and c.email is not null and position('@' in c.email) > 1
     and c.descadastrado_em is null
     and c.email_status <> 'invalido'
     and not exists (select 1 from public.email_supressoes s
                      where s.workspace_id = c.workspace_id and lower(s.email) = lower(c.email));
  if v_total = 0 then
    return;
  end if;

  if p_rascunho_id is not null then
    -- O filtro por estado impede reenviar a campanha que já saiu (dois
    -- cliques rápidos, duas abas abertas).
    update public.press_campanhas
       set assunto = p_assunto, corpo = p_corpo,
           link_url = coalesce(p_link_url, ''), link_rotulo = coalesce(p_link_rotulo, ''),
           estado = case when p_agendar_para is null then 'enviando' else 'agendada' end,
           agendada_para = p_agendar_para,
           enviada_em = case when p_agendar_para is null then v_agora else null end,
           total_destinatarios = v_total,
           enviada_por = p_autor,
           atualizada_em = v_agora,
           em_fila = true
     where id = p_rascunho_id and workspace_id = p_workspace_id and estado = 'rascunho'
    returning id into v_id;
    if v_id is null then
      raise exception 'rascunho_indisponivel';
    end if;
    -- Rascunho não tem destinatário; se sobrou algum de um agendamento
    -- cancelado, sai antes de a lista nova entrar.
    delete from public.press_campanha_destinatarios d where d.campanha_id = v_id;
  else
    insert into public.press_campanhas (
      workspace_id, assunto, corpo, link_url, link_rotulo, estado, agendada_para,
      enviada_em, total_destinatarios, enviada_por, atualizada_em, em_fila)
    values (
      p_workspace_id, p_assunto, p_corpo, coalesce(p_link_url, ''), coalesce(p_link_rotulo, ''),
      case when p_agendar_para is null then 'enviando' else 'agendada' end, p_agendar_para,
      case when p_agendar_para is null then v_agora else null end, v_total, p_autor, v_agora, true)
    returning id into v_id;
  end if;

  insert into public.press_campanha_destinatarios (campanha_id, workspace_id, contato_id, email, nome, estado)
  select v_id, p_workspace_id, c.id, c.email, coalesce(c.nome, ''), 'na_fila'
    from public.press_contacts c
   where c.workspace_id = p_workspace_id
     and c.id = any(p_contatos)
     and c.email is not null and position('@' in c.email) > 1
     and c.descadastrado_em is null
     and c.email_status <> 'invalido'
     and not exists (select 1 from public.email_supressoes s
                      where s.workspace_id = c.workspace_id and lower(s.email) = lower(c.email));

  return query select v_id, v_total;
end;
$$;

comment on function public.enfileirar_campanha is
  'Grava a campanha (nova ou de um rascunho) e os destinatários que podem receber, numa transação, já na fila. Só service_role.';

revoke all on function public.enfileirar_campanha(uuid, uuid, uuid, text, text, text, text, uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.enfileirar_campanha(uuid, uuid, uuid, text, text, text, text, uuid[], timestamptz) to service_role;

-- Reserva o próximo lote para um trabalhador. Um trabalhador por vez no banco
-- inteiro (a vez dele vale 2 minutos, renovados a cada lote): dois enviando ao
-- mesmo tempo estouram o limite de chamadas do Resend. Antes de reservar:
--   - quem ficou 'enviando' por mais de 10 minutos vira falha. A função da
--     Vercel morreu no meio e não dá para saber se a mensagem saiu: reenviar
--     arriscaria o mesmo release duas vezes na caixa do jornalista.
--   - a campanha agendada cuja hora chegou passa a 'enviando'.
--   - quem deixou de poder receber depois que a campanha foi montada (a
--     agendada pode esperar dias) fica 'de_fora': saiu da lista, o endereço
--     deixou de valer, entrou na supressão ou o contato foi apagado.
create or replace function public.reservar_lote_de_campanha(
  p_trabalhador uuid,
  p_tamanho integer default 100
)
returns setof public.press_campanha_destinatarios
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campanha uuid;
begin
  -- Uma chamada por vez: conferir "há outro trabalhando?" e tomar a vez
  -- precisam acontecer juntos.
  perform pg_advisory_xact_lock(7426110901);

  -- Só enfileirar_campanha e esta função gravam 'enviando' no destinatário,
  -- sempre com reservado_em.
  update public.press_campanha_destinatarios
     set estado = 'falhou',
         erro = 'O envio começou e não foi confirmado. A mensagem pode ter saído: confira antes de reenviar.'
   where estado = 'enviando' and reservado_em < now() - interval '10 minutes';

  update public.press_campanhas
     set estado = 'enviando', enviada_em = now(), atualizada_em = now()
   where estado = 'agendada' and em_fila and agendada_para <= now();

  if exists (
    select 1 from public.press_campanhas
     where estado = 'enviando' and em_fila
       and trabalhando_ate > now() and trabalhador is distinct from p_trabalhador
  ) then
    return;
  end if;

  select c.id into v_campanha
    from public.press_campanhas c
   where c.estado = 'enviando' and c.em_fila
     and exists (select 1 from public.press_campanha_destinatarios d
                  where d.campanha_id = c.id and d.estado = 'na_fila')
   order by c.enviada_em nulls first, c.id
   limit 1;

  if v_campanha is null then
    return;
  end if;

  update public.press_campanha_destinatarios d
     set estado = 'de_fora',
         erro = 'Ficou de fora: saiu da lista, foi removido ou o endereço deixou de valer depois que a campanha foi montada.'
   where d.campanha_id = v_campanha and d.estado = 'na_fila'
     and (d.contato_id is null  -- o contato foi apagado: sem ele não há link de saída
       or exists (select 1 from public.press_contacts c
                   where c.id = d.contato_id
                     and (c.descadastrado_em is not null or c.email_status = 'invalido'))
       or exists (select 1 from public.email_supressoes s
                   where s.workspace_id = d.workspace_id and lower(s.email) = lower(d.email)));

  update public.press_campanhas
     set trabalhador = p_trabalhador, trabalhando_ate = now() + interval '2 minutes'
   where id = v_campanha;

  return query
  update public.press_campanha_destinatarios d
     set estado = 'enviando', reservado_em = now()
   where d.id in (
     select f.id from public.press_campanha_destinatarios f
      where f.campanha_id = v_campanha and f.estado = 'na_fila'
      order by f.created_at, f.id
      limit greatest(1, least(coalesce(p_tamanho, 100), 100)))
  returning d.*;
end;
$$;

comment on function public.reservar_lote_de_campanha is
  'Entrega ao trabalhador o próximo lote de destinatários na fila (um trabalhador por vez). Só service_role.';

revoke all on function public.reservar_lote_de_campanha(uuid, integer) from public, anon, authenticated;
grant execute on function public.reservar_lote_de_campanha(uuid, integer) to service_role;

-- Confirma um lote que o Resend aceitou: cada destinatário vira 'enviado' e
-- guarda o id da mensagem (é por ele que o webhook acha a linha depois). Um
-- UPDATE só, no lugar de cem idas e voltas. Os dois vetores andam juntos.
create or replace function public.confirmar_lote_de_campanha(p_ids uuid[], p_resend_ids text[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.press_campanha_destinatarios d
     set estado = 'enviado', enviado_em = now(), resend_id = nullif(l.resend_id, '')
    from unnest(p_ids, p_resend_ids) as l(id, resend_id)
   where d.id = l.id and d.estado = 'enviando';
$$;

comment on function public.confirmar_lote_de_campanha is
  'Marca um lote como enviado e guarda o id de cada mensagem no Resend. Só service_role.';

revoke all on function public.confirmar_lote_de_campanha(uuid[], text[]) from public, anon, authenticated;
grant execute on function public.confirmar_lote_de_campanha(uuid[], text[]) to service_role;

-- Fecha as campanhas da fila que não têm mais ninguém esperando nem reservado.
-- A trava na linha da campanha garante que concluir_campanha (que soma +1 nos
-- contadores de cada contato) rode uma vez só. Devolve quantas fechou.
create or replace function public.concluir_campanhas_terminadas()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_fechadas integer := 0;
begin
  for v_id in
    select c.id from public.press_campanhas c
     where c.estado = 'enviando' and c.em_fila
       and not exists (select 1 from public.press_campanha_destinatarios d
                        where d.campanha_id = c.id and d.estado in ('na_fila','enviando'))
     for update skip locked
  loop
    perform public.concluir_campanha(v_id);
    update public.press_campanhas set trabalhador = null, trabalhando_ate = null where id = v_id;
    v_fechadas := v_fechadas + 1;
  end loop;
  return v_fechadas;
end;
$$;

comment on function public.concluir_campanhas_terminadas is
  'Fecha (totais, estado, contadores dos contatos) as campanhas cuja fila esvaziou. Só service_role.';

revoke all on function public.concluir_campanhas_terminadas() from public, anon, authenticated;
grant execute on function public.concluir_campanhas_terminadas() to service_role;

-- 5. O relógio ---------------------------------------------------------------

-- A cada minuto, e só quando há campanha com hora vencida ou campanha em envio
-- sem ninguém trabalhando nela. Sem o segredo 'cron_secret' no cofre, não
-- chama nada. cron.schedule com o mesmo nome substitui o job: rodar de novo
-- não duplica.
create extension if not exists pg_cron;

select cron.schedule(
  'enviar-campanhas',
  '* * * * *',
  $job$
  select net.http_get(
    url := 'https://palacio.cruzvermelhariodejaneiro.org/api/comunicados/fila',
    headers := jsonb_build_object('Authorization', 'Bearer ' || s.decrypted_secret),
    timeout_milliseconds := 60000
  )
    from vault.decrypted_secrets s
   where s.name = 'cron_secret'
     and exists (
       select 1 from public.press_campanhas c
        where c.em_fila
          and ((c.estado = 'agendada' and c.agendada_para <= now())
            or (c.estado = 'enviando' and (c.trabalhando_ate is null or c.trabalhando_ate < now()))))
  $job$
);
