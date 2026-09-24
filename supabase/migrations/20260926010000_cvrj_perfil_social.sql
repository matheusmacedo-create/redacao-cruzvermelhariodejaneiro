-- ============================================================
-- Perfil social: a página de cada pessoa da Redação, no jeito de uma rede
-- social — apresentação, habilidades, contatos e as métricas de como ela
-- responde à equipe.
--
-- Só acrescenta. O que a pessoa escreve fica em perfil_social, uma linha por
-- pessoa, e só ela grava (pela server action, com o service role, depois de
-- conferir que é o próprio perfil). A leitura de perfis alheios é feita pelo
-- servidor, que aplica a visibilidade de cada contato:
--   'equipe'  → qualquer pessoa da Redação;
--   'setor'   → só quem é do mesmo setor;
--   'admins'  → só administradores.
-- Por isso o RLS aqui só deixa ler o próprio perfil: contato pessoal com
-- visibilidade restrita não pode vazar por uma consulta direta à API.
--
-- As métricas saem de metricas_da_pessoa(), que calcula na hora a partir do
-- que já existe (chat, aprovações, chamados, pautas, conteúdos). Quem desliga
-- "mostrar métricas" continua vendo as próprias; administradores também.
-- ============================================================

create table if not exists public.perfil_social (
  user_id           uuid primary key references public.profiles (id) on delete cascade,
  bio               text not null default '' check (char_length(bio) <= 600),
  pronomes          text not null default '' check (char_length(pronomes) <= 30),
  capa              text not null default 'vermelho'
                    check (capa in ('vermelho', 'grafite', 'azul', 'verde', 'ambar', 'roxo')),
  disponibilidade   text not null default '' check (char_length(disponibilidade) <= 160),
  habilidades       text[] not null default '{}' check (cardinality(habilidades) <= 15),
  -- [{"tipo":"institucional"|"pessoal","canal":"email"|..., "valor":"...", "rotulo":"...", "visibilidade":"equipe"|"setor"|"admins"}]
  contatos          jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(contatos) = 'array' and jsonb_array_length(contatos) <= 20),
  mostrar_metricas  boolean not null default true,
  atualizado_em     timestamptz not null default now()
);

alter table public.perfil_social enable row level security;
revoke all on public.perfil_social from anon;
revoke insert, update, delete, truncate, references, trigger on public.perfil_social from authenticated;

drop policy if exists perfil_social_select_own on public.perfil_social;
create policy perfil_social_select_own on public.perfil_social for select to authenticated
  using (user_id = (select auth.uid()));

-- Índices de apoio às métricas (as tabelas já têm índice por autor/responsável;
-- falta o de quem foi convidado a votar, por pessoa e data).
create index if not exists approval_voters_user_created_idx on public.approval_voters (user_id, created_at desc);

-- ---------------------------------------------------------------- métricas

-- As métricas de uma pessoa nos últimos p_dias (padrão 90).
--
--  chat: mensagens diretas que ela recebeu (a primeira de cada vez que a
--        outra pessoa puxou assunto) e menções em canais; quantas ela
--        respondeu e a mediana do tempo até responder, em minutos.
--  aprovacoes: pedidos de voto recebidos, quantos decididos e a mediana do
--        tempo até decidir, em minutos.
--  chamados: chamados sob responsabilidade dela, quantos resolvidos, a
--        mediana da primeira resposta em minutos e a nota média recebida.
--  producao: pautas sob responsabilidade dela em andamento, conteúdos que
--        criou e mensagens que mandou no chat no período.
--
-- Devolve null se a pessoa escondeu as métricas e quem pergunta não é ela
-- nem administrador.
create or replace function public.metricas_da_pessoa(p_workspace_id uuid, p_user_id uuid, p_dias integer default 90)
returns jsonb
language plpgsql security definer set search_path = '' stable as $$
declare
  v_desde timestamptz;
  v_papel text;
  v_mostrar boolean;
  v_chat jsonb;
  v_aprov jsonb;
  v_cham jsonb;
  v_prod jsonb;
begin
  if not (select private.is_workspace_member(p_workspace_id)) then
    raise exception 'Você não é deste espaço.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id) then
    raise exception 'Pessoa não encontrada neste espaço.' using errcode = 'P0001';
  end if;

  v_papel := (select private.workspace_role(p_workspace_id));
  v_mostrar := coalesce((select s.mostrar_metricas from public.perfil_social s where s.user_id = p_user_id), true);
  if not v_mostrar and p_user_id <> (select auth.uid()) and v_papel is distinct from 'admin' then
    return null;
  end if;

  v_desde := now() - make_interval(days => greatest(1, least(coalesce(p_dias, 90), 365)));

  -- chat
  with recebidas as (
    select m.canal_id, m.created_at
    from public.chat_mensagens m
    join public.chat_canais c on c.id = m.canal_id
    join public.chat_membros cm on cm.canal_id = m.canal_id and cm.user_id = p_user_id
    where m.workspace_id = p_workspace_id
      and m.created_at >= v_desde
      and m.apagada_em is null
      and m.autor_id is not null
      and m.autor_id <> p_user_id
      and (
        (c.tipo = 'canal' and p_user_id = any (m.mencoes))
        or (c.tipo = 'direta' and coalesce((
              select a.autor_id from public.chat_mensagens a
              where a.canal_id = m.canal_id and a.created_at < m.created_at
              order by a.created_at desc limit 1
            ), p_user_id) = p_user_id)
      )
  ), com_resposta as (
    select r.created_at,
      (select min(x.created_at) from public.chat_mensagens x
        where x.canal_id = r.canal_id and x.autor_id = p_user_id and x.created_at > r.created_at) as respondida_em
    from recebidas r
  )
  select jsonb_build_object(
    'recebidas', count(*),
    'respondidas', count(respondida_em),
    'mediana_min', round((percentile_cont(0.5) within group (order by extract(epoch from (respondida_em - created_at)) / 60)
                   filter (where respondida_em is not null))::numeric, 1),
    'enviadas', (select count(*) from public.chat_mensagens e
                 where e.workspace_id = p_workspace_id and e.autor_id = p_user_id and e.created_at >= v_desde and e.apagada_em is null)
  ) into v_chat
  from com_resposta;

  -- aprovações
  select jsonb_build_object(
    'pedidos', count(*),
    'decididos', count(v.decided_at),
    'mediana_min', round((percentile_cont(0.5) within group (order by extract(epoch from (v.decided_at - v.created_at)) / 60)
                   filter (where v.decided_at is not null))::numeric, 1)
  ) into v_aprov
  from public.approval_voters v
  where v.workspace_id = p_workspace_id and v.user_id = p_user_id and v.created_at >= v_desde;

  -- chamados (quem atende)
  select jsonb_build_object(
    'atendidos', count(*),
    'resolvidos', count(*) filter (where c.status in ('resolvido', 'fechado')),
    'primeira_resposta_mediana_min', round((percentile_cont(0.5) within group (order by extract(epoch from (c.respondido_em - c.criado_em)) / 60)
                   filter (where c.respondido_em is not null))::numeric, 1),
    'nota_media', round(avg(c.avaliacao)::numeric, 1),
    'avaliacoes', count(c.avaliacao)
  ) into v_cham
  from public.chamados c
  where c.workspace_id = p_workspace_id and c.responsavel_id = p_user_id and c.criado_em >= v_desde;

  -- produção
  select jsonb_build_object(
    'pautas_em_andamento', (select count(*) from public.pautas p
                            where p.workspace_id = p_workspace_id and p.owner_id = p_user_id and p.status not in ('approved', 'archived')),
    'conteudos_criados', (select count(*) from public.content_pieces c
                          where c.workspace_id = p_workspace_id and c.created_by = p_user_id and c.created_at >= v_desde)
  ) into v_prod;

  return jsonb_build_object(
    'dias', greatest(1, least(coalesce(p_dias, 90), 365)),
    'chat', v_chat,
    'aprovacoes', v_aprov,
    'chamados', v_cham,
    'producao', v_prod
  );
end;
$$;
revoke all on function public.metricas_da_pessoa(uuid, uuid, integer) from public, anon;
grant execute on function public.metricas_da_pessoa(uuid, uuid, integer) to authenticated;
