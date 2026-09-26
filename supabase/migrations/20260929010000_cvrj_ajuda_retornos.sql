-- Beta com a equipe: o retorno de cada colaborador sobre as telas e a ajuda.
-- Só acréscimos. Pedido do Matheus (26/09/2026): "atendimento beta aos nossos
-- colaboradores para conseguir melhorar a aplicação o mais rápido possível".
--
-- Um retorno é uma de cinco coisas (docs/AJUDA.md §10):
--  - tela:      "O que achou desta tela?" — nota de 1 a 5 e, se quiser, um comentário;
--  - pergunta:  "Isso ajudou?" numa pergunta da ajuda (sim ou não, e o que faltou);
--  - duvida:    "Pergunte à equipe" — a dúvida que a ajuda não respondeu;
--  - problema / sugestao / elogio: o "Beta" do topo, em qualquer tela.
-- Junto vai o contexto que ajuda a reproduzir: a tela, o tamanho da janela, se
-- é celular, o navegador. Quem manda vê os próprios (e a resposta); os
-- administradores veem todos, respondem e marcam a situação.

create table if not exists public.ajuda_retornos (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  autor_id        uuid references public.profiles (id) on delete set null,
  tipo            text not null check (tipo in ('tela', 'pergunta', 'duvida', 'problema', 'sugestao', 'elogio')),
  caminho         text not null check (char_length(caminho) between 1 and 300 and caminho like '/%'),
  area            text check (char_length(area) <= 120),
  pergunta_id     text check (char_length(pergunta_id) <= 120),
  nota            smallint check (nota between 1 and 5),
  util            boolean,
  texto           text check (char_length(texto) <= 4000),
  contexto        jsonb not null default '{}' check (jsonb_typeof(contexto) = 'object' and pg_column_size(contexto) <= 4000),
  estado          text not null default 'novo' check (estado in ('novo', 'em_analise', 'resolvido', 'arquivado')),
  resposta        text check (char_length(resposta) <= 2000),
  respondido_por  uuid references public.profiles (id) on delete set null,
  respondido_em   timestamptz,
  created_at      timestamptz not null default now(),
  check (tipo <> 'tela' or nota is not null),
  check (tipo <> 'pergunta' or (util is not null and pergunta_id is not null)),
  check (tipo not in ('duvida', 'problema', 'sugestao') or char_length(trim(coalesce(texto, ''))) >= 3)
);
comment on table public.ajuda_retornos is 'Beta: opinião sobre as telas, voto nas perguntas da ajuda, dúvidas, problemas e sugestões da equipe (docs/AJUDA.md §10).';
create index if not exists ajuda_retornos_ws_idx on public.ajuda_retornos (workspace_id, created_at desc);
create index if not exists ajuda_retornos_estado_idx on public.ajuda_retornos (workspace_id, estado) where estado in ('novo', 'em_analise');
create index if not exists ajuda_retornos_pergunta_idx on public.ajuda_retornos (workspace_id, pergunta_id) where tipo = 'pergunta';
create index if not exists ajuda_retornos_autor_idx on public.ajuda_retornos (autor_id);
create index if not exists ajuda_retornos_respondido_idx on public.ajuda_retornos (respondido_por);

alter table public.ajuda_retornos enable row level security;
revoke all on public.ajuda_retornos from anon;
revoke all on public.ajuda_retornos from authenticated;
grant select, insert, delete on public.ajuda_retornos to authenticated;

-- Quem mandou vê o que mandou (e a resposta); o administrador do espaço vê tudo.
drop policy if exists ajuda_retornos_select on public.ajuda_retornos;
create policy ajuda_retornos_select on public.ajuda_retornos for select to authenticated
  using (autor_id = (select auth.uid()) or (select private.workspace_role(workspace_id)) = 'admin');

-- Cada um manda em nome próprio, no espaço de que faz parte, sempre como "novo" e sem resposta.
drop policy if exists ajuda_retornos_insert on public.ajuda_retornos;
create policy ajuda_retornos_insert on public.ajuda_retornos for insert to authenticated
  with check (
    autor_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id))
    and estado = 'novo' and resposta is null and respondido_por is null and respondido_em is null
  );

-- Só o próprio voto numa pergunta sai (para trocar "sim" por "não"); o resto fica como histórico.
drop policy if exists ajuda_retornos_delete on public.ajuda_retornos;
create policy ajuda_retornos_delete on public.ajuda_retornos for delete to authenticated
  using (autor_id = (select auth.uid()) and tipo = 'pergunta');

-- O administrador responde e muda a situação. A resposta vira aviso para quem mandou (no servidor).
create or replace function public.ajuda_responder_retorno(p_id uuid, p_estado text, p_resposta text)
returns public.ajuda_retornos language plpgsql security definer set search_path = '' as $$
declare
  v public.ajuda_retornos;
  v_resposta text := nullif(left(trim(coalesce(p_resposta, '')), 2000), '');
begin
  select * into v from public.ajuda_retornos where id = p_id for update;
  if not found or (select private.workspace_role(v.workspace_id)) is distinct from 'admin' then
    raise exception 'Retorno não encontrado.' using errcode = 'P0001';
  end if;
  if p_estado not in ('novo', 'em_analise', 'resolvido', 'arquivado') then raise exception 'Situação inválida.' using errcode = 'P0001'; end if;
  update public.ajuda_retornos set estado = p_estado,
    resposta = coalesce(v_resposta, resposta),
    respondido_por = case when v_resposta is not null then (select auth.uid()) else respondido_por end,
    respondido_em = case when v_resposta is not null then now() else respondido_em end
  where id = p_id returning * into v;
  return v;
end $$;
revoke all on function public.ajuda_responder_retorno(uuid, text, text) from public, anon;
grant execute on function public.ajuda_responder_retorno(uuid, text, text) to authenticated;

-- As perguntas que mais ajudaram (e as que menos), para a Central mostrar as mais úteis a todos.
-- Só contagens: ninguém vê o voto dos outros. Um voto por pessoa (o mais recente).
create or replace function public.ajuda_votos_das_perguntas(p_workspace_id uuid, p_dias integer default 120)
returns table (area text, pergunta_id text, sim bigint, nao bigint)
language sql security definer set search_path = '' stable as $$
  select x.area, x.pergunta_id, count(*) filter (where x.util), count(*) filter (where not x.util)
  from (
    select distinct on (r.autor_id, r.pergunta_id) r.area, r.pergunta_id, r.util
    from public.ajuda_retornos r
    where r.workspace_id = p_workspace_id and r.tipo = 'pergunta' and r.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_dias, 120), 730)))
    order by r.autor_id, r.pergunta_id, r.created_at desc
  ) x
  where (select private.is_workspace_member(p_workspace_id))
  group by x.area, x.pergunta_id
$$;
revoke all on function public.ajuda_votos_das_perguntas(uuid, integer) from public, anon;
grant execute on function public.ajuda_votos_das_perguntas(uuid, integer) to authenticated;
