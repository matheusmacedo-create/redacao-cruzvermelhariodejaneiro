-- Oportunidades que pedem resposta: aviso para confirmar, enquete e quiz —
-- e perguntas em qualquer oportunidade (uma ação pode perguntar o tamanho
-- da camiseta na inscrição).
--
-- Só acrescenta: três valores novos no `tipo`, uma coluna que aceita nulo e
-- duas tabelas. O código no ar não conhece os tipos novos e não lê as
-- tabelas novas, então a migração pode ir antes do deploy (ARQUITETURA §10.1
-- e §10.7).
--
-- Tipos "de resposta" (aviso, enquete, quiz) não têm inscrição, vagas nem
-- horas: `inicio` é quando abre e `fim` é o prazo para responder.
-- Enquete e formulário: a pessoa muda a resposta até o prazo.
-- Quiz: até 3 tentativas; aprovado, a resposta fica.
--
-- A equipe grava perguntas só pela função (que confere tudo e recusa mudar
-- depois da primeira resposta); o voluntário responde só pela função do
-- servidor (service_role), como nas inscrições.

-- ---------------------------------------------------------------- oportunidades

alter table public.oportunidades drop constraint if exists oportunidades_tipo_check;
alter table public.oportunidades add constraint oportunidades_tipo_check
  check (tipo in ('acao','plantao','evento','formacao','outro','aviso','enquete','quiz'));

alter table public.oportunidades add column if not exists nota_minima integer
  check (nota_minima is null or nota_minima between 1 and 100);

-- Aviso, enquete e quiz não têm vaga, prazo de inscrição nem horas; nota mínima é só do quiz.
alter table public.oportunidades drop constraint if exists oportunidades_de_resposta_check;
alter table public.oportunidades add constraint oportunidades_de_resposta_check check (
  (tipo not in ('aviso','enquete','quiz') or (vagas is null and inscricoes_ate is null and horas is null))
  and (nota_minima is null or tipo = 'quiz')
);

create or replace function private.oportunidade_de_resposta(p_tipo text)
returns boolean language sql immutable set search_path = '' as $$
  select p_tipo in ('aviso','enquete','quiz')
$$;
revoke all on function private.oportunidade_de_resposta(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- perguntas

create table if not exists public.oportunidade_perguntas (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete restrict,
  oportunidade_id uuid not null references public.oportunidades (id) on delete cascade,
  ordem           integer not null default 0 check (ordem between 0 and 999),
  enunciado       text not null check (length(trim(enunciado)) between 3 and 500),
  -- texto: resposta curta; unica: uma alternativa; multipla: uma ou mais; sim_nao: Sim (0) ou Não (1).
  tipo            text not null check (tipo in ('texto','unica','multipla','sim_nao')),
  alternativas    text[] not null default '{}',
  obrigatoria     boolean not null default true,
  -- Quiz: os índices certos (a partir de 0). Nulo: a pergunta não conta nota.
  corretas        integer[],
  created_at      timestamptz not null default now(),
  check ((tipo in ('unica','multipla') and cardinality(alternativas) between 2 and 10)
      or (tipo in ('texto','sim_nao') and cardinality(alternativas) = 0)),
  check (corretas is null or tipo <> 'texto')
);
create index if not exists oportunidade_perguntas_oportunidade_idx on public.oportunidade_perguntas (oportunidade_id, ordem);
create index if not exists oportunidade_perguntas_workspace_idx on public.oportunidade_perguntas (workspace_id);

-- ---------------------------------------------------------------- respostas

create table if not exists public.oportunidade_respostas (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete restrict,
  oportunidade_id uuid not null references public.oportunidades (id) on delete cascade,
  participante_id uuid not null references public.participantes (id) on delete cascade,
  -- [{ "p": pergunta, "t": "texto" } | { "p": pergunta, "e": [índices] }], já conferido pela função.
  respostas       jsonb not null default '[]'::jsonb check (jsonb_typeof(respostas) = 'array' and pg_column_size(respostas) <= 65536),
  acertos         integer check (acertos is null or acertos >= 0),
  total           integer check (total is null or total >= 0),
  nota            integer check (nota is null or nota between 0 and 100),
  aprovado        boolean,
  tentativas      integer not null default 1 check (tentativas between 1 and 3),
  created_at      timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (oportunidade_id, participante_id)
);
create index if not exists oportunidade_respostas_participante_idx on public.oportunidade_respostas (participante_id);
create index if not exists oportunidade_respostas_workspace_idx on public.oportunidade_respostas (workspace_id);

alter table public.oportunidade_perguntas enable row level security;
alter table public.oportunidade_respostas enable row level security;
revoke all on public.oportunidade_perguntas, public.oportunidade_respostas from anon, authenticated;
grant select on public.oportunidade_perguntas, public.oportunidade_respostas to authenticated;

drop policy if exists oportunidade_perguntas_select on public.oportunidade_perguntas;
create policy oportunidade_perguntas_select on public.oportunidade_perguntas for select to authenticated
  using ((select private.nivel_participantes(workspace_id)) >= 1);
drop policy if exists oportunidade_respostas_select on public.oportunidade_respostas;
create policy oportunidade_respostas_select on public.oportunidade_respostas for select to authenticated
  using ((select private.nivel_participantes(workspace_id)) >= 1);

-- Com resposta gravada, o tipo não muda: uma enquete que virasse quiz daria
-- nota a quem respondeu sem gabarito, e um quiz que virasse ação perderia o sentido da nota.
create or replace function private.oportunidade_tipo_travado()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo is distinct from old.tipo and exists (select 1 from public.oportunidade_respostas r where r.oportunidade_id = old.id) then
    raise exception 'Já há respostas: o tipo não muda mais.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.oportunidade_tipo_travado() from public, anon, authenticated;
drop trigger if exists oportunidades_tipo_travado on public.oportunidades;
create trigger oportunidades_tipo_travado before update of tipo on public.oportunidades
  for each row execute function private.oportunidade_tipo_travado();

-- ---------------------------------------------------------------- equipe: as perguntas

/**
 * Troca as perguntas de uma oportunidade (a lista inteira, na ordem). Recusa
 * depois da primeira resposta: mudar a pergunta embaralharia o que já foi
 * respondido. p_perguntas: [{ enunciado, tipo, alternativas?, obrigatoria?, corretas? }].
 */
create or replace function public.salvar_perguntas_oportunidade(p_oportunidade_id uuid, p_perguntas jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  o public.oportunidades;
  q jsonb;
  v_ordem integer := 0;
  v_tipo text;
  v_enunciado text;
  v_alts text[];
  v_corretas integer[];
  v_limite integer;
  v_c integer;
  v_contam integer := 0;
begin
  select * into o from public.oportunidades where id = p_oportunidade_id for update;
  if not found or (select private.nivel_participantes(o.workspace_id)) < 2 then
    raise exception 'Oportunidade não encontrada.' using errcode = 'P0001';
  end if;
  if o.cancelada_em is not null then raise exception 'Esta oportunidade foi cancelada.' using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(p_perguntas, '[]'::jsonb)) <> 'array' then raise exception 'Perguntas inválidas.' using errcode = 'P0001'; end if;
  if jsonb_array_length(coalesce(p_perguntas, '[]'::jsonb)) > 50 then raise exception 'No máximo 50 perguntas.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.oportunidade_respostas r where r.oportunidade_id = o.id) then
    raise exception 'Já há respostas: as perguntas não mudam mais. Se precisar, crie outra.' using errcode = 'P0001';
  end if;

  delete from public.oportunidade_perguntas where oportunidade_id = o.id;
  for q in select * from jsonb_array_elements(coalesce(p_perguntas, '[]'::jsonb)) loop
    v_ordem := v_ordem + 1;
    v_tipo := q->>'tipo';
    v_enunciado := trim(coalesce(q->>'enunciado', ''));
    if v_tipo is null or v_tipo not in ('texto','unica','multipla','sim_nao') then
      raise exception 'Pergunta %: tipo inválido.', v_ordem using errcode = 'P0001';
    end if;
    if length(v_enunciado) < 3 or length(v_enunciado) > 500 then
      raise exception 'Pergunta %: escreva o enunciado (de 3 a 500 letras).', v_ordem using errcode = 'P0001';
    end if;
    v_alts := '{}';
    if v_tipo in ('unica','multipla') then
      if jsonb_typeof(q->'alternativas') <> 'array' then raise exception 'Pergunta %: faltam as alternativas.', v_ordem using errcode = 'P0001'; end if;
      select coalesce(array_agg(trim(a) order by n), '{}') into v_alts
        from jsonb_array_elements_text(q->'alternativas') with ordinality as x(a, n) where trim(a) <> '';
      if cardinality(v_alts) < 2 or cardinality(v_alts) > 10 then
        raise exception 'Pergunta %: de 2 a 10 alternativas.', v_ordem using errcode = 'P0001';
      end if;
      if exists (select 1 from unnest(v_alts) a where length(a) > 200) then
        raise exception 'Pergunta %: alternativa com mais de 200 letras.', v_ordem using errcode = 'P0001';
      end if;
    end if;
    v_limite := case v_tipo when 'sim_nao' then 2 else cardinality(v_alts) end;

    v_corretas := null;
    if o.tipo = 'quiz' and v_tipo <> 'texto' then
      if jsonb_typeof(q->'corretas') <> 'array' then
        raise exception 'Pergunta %: marque a resposta certa.', v_ordem using errcode = 'P0001';
      end if;
      select coalesce(array_agg(distinct c::integer order by c::integer), '{}') into v_corretas
        from jsonb_array_elements_text(q->'corretas') c where c ~ '^\d{1,2}$';
      if cardinality(v_corretas) = 0 then raise exception 'Pergunta %: marque a resposta certa.', v_ordem using errcode = 'P0001'; end if;
      foreach v_c in array v_corretas loop
        if v_c >= v_limite then raise exception 'Pergunta %: resposta certa inválida.', v_ordem using errcode = 'P0001'; end if;
      end loop;
      if v_tipo in ('unica','sim_nao') and cardinality(v_corretas) <> 1 then
        raise exception 'Pergunta %: só uma resposta certa.', v_ordem using errcode = 'P0001';
      end if;
      v_contam := v_contam + 1;
    end if;

    insert into public.oportunidade_perguntas (workspace_id, oportunidade_id, ordem, enunciado, tipo, alternativas, obrigatoria, corretas)
    values (o.workspace_id, o.id, v_ordem, v_enunciado, v_tipo, v_alts, coalesce((q->>'obrigatoria')::boolean, true), v_corretas);
  end loop;

  if o.tipo = 'quiz' and v_contam = 0 then
    raise exception 'O quiz precisa de pelo menos uma pergunta com resposta certa.' using errcode = 'P0001';
  end if;
  if o.tipo = 'enquete' and v_ordem = 0 then
    raise exception 'A enquete precisa de pelo menos uma pergunta.' using errcode = 'P0001';
  end if;
  return v_ordem;
end $$;
revoke all on function public.salvar_perguntas_oportunidade(uuid, jsonb) from public, anon;
grant execute on function public.salvar_perguntas_oportunidade(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------- voluntário: responder

/**
 * O voluntário responde (ou confirma o aviso). Confere cada resposta contra
 * as perguntas, grava a versão limpa e, no quiz, corrige.
 * - aviso, enquete, quiz: entre `inicio` e `fim` (o prazo);
 * - ação, plantão…: antes de as inscrições encerrarem (as respostas vão com a inscrição).
 * Enquete e formulário: responder de novo troca a resposta. Quiz: até 3
 * tentativas; aprovado, não muda mais.
 */
create or replace function public.membro_responder_oportunidade(p_participante_id uuid, p_oportunidade_id uuid, p_respostas jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_part public.participantes;
  o public.oportunidades;
  v_atual public.oportunidade_respostas;
  q public.oportunidade_perguntas;
  v_resp jsonb;
  v_limpa jsonb := '[]'::jsonb;
  v_texto text;
  v_escolhas integer[];
  v_limite integer;
  v_acertos integer := 0;
  v_total integer := 0;
  v_nota integer;
  v_aprovado boolean;
  v_minima integer;
  v_tentativas integer;
begin
  select * into v_part from public.participantes where id = p_participante_id and situacao = 'ativo' and anonimizado_em is null;
  if not found then raise exception 'Cadastro indisponível.' using errcode = 'P0001'; end if;
  select * into o from public.oportunidades where id = p_oportunidade_id and workspace_id = v_part.workspace_id and publicado;
  if not found then raise exception 'Oportunidade não encontrada.' using errcode = 'P0001'; end if;
  if o.cancelada_em is not null then raise exception 'Esta oportunidade foi cancelada.' using errcode = 'P0001'; end if;
  if private.oportunidade_de_resposta(o.tipo) then
    if now() < o.inicio then raise exception 'Ainda não abriu para respostas.' using errcode = 'P0001'; end if;
    if now() > o.fim then raise exception 'O prazo para responder terminou.' using errcode = 'P0001'; end if;
  else
    if now() >= coalesce(o.inscricoes_ate, o.inicio) then raise exception 'As inscrições já encerraram.' using errcode = 'P0001'; end if;
  end if;
  if jsonb_typeof(coalesce(p_respostas, '[]'::jsonb)) <> 'array' or pg_column_size(p_respostas) > 65536 then
    raise exception 'Respostas inválidas.' using errcode = 'P0001';
  end if;

  -- Uma resposta por pessoa: a linha travada evita duas tentativas do quiz ao mesmo tempo.
  select * into v_atual from public.oportunidade_respostas where oportunidade_id = o.id and participante_id = v_part.id for update;
  if found and o.tipo = 'quiz' then
    if v_atual.aprovado then
      return jsonb_build_object('situacao', 'ja_aprovado', 'nota', v_atual.nota, 'acertos', v_atual.acertos, 'total', v_atual.total,
        'aprovado', true, 'tentativas', v_atual.tentativas, 'minima', coalesce(o.nota_minima, 70));
    end if;
    if v_atual.tentativas >= 3 then raise exception 'Você já usou as 3 tentativas deste quiz.' using errcode = 'P0001'; end if;
  end if;

  for q in select * from public.oportunidade_perguntas where oportunidade_id = o.id order by ordem, id loop
    select e into v_resp from jsonb_array_elements(coalesce(p_respostas, '[]'::jsonb)) e where e->>'p' = q.id::text limit 1;
    v_limite := case q.tipo when 'sim_nao' then 2 else cardinality(q.alternativas) end;
    if q.tipo = 'texto' then
      v_texto := left(trim(coalesce(v_resp->>'t', '')), 1000);
      if v_texto = '' then
        if q.obrigatoria then raise exception 'Responda: %', q.enunciado using errcode = 'P0001'; end if;
        continue;
      end if;
      v_limpa := v_limpa || jsonb_build_array(jsonb_build_object('p', q.id, 't', v_texto));
    else
      v_escolhas := null;
      if jsonb_typeof(v_resp->'e') = 'array' then
        select array_agg(distinct x::integer order by x::integer) into v_escolhas
          from jsonb_array_elements_text(v_resp->'e') x where x ~ '^\d{1,2}$';
      end if;
      if v_escolhas is null or cardinality(v_escolhas) = 0 then
        if q.obrigatoria then raise exception 'Responda: %', q.enunciado using errcode = 'P0001'; end if;
        v_escolhas := null;
      else
        if exists (select 1 from unnest(v_escolhas) x where x >= v_limite) then
          raise exception 'Resposta inválida em: %', q.enunciado using errcode = 'P0001';
        end if;
        if q.tipo in ('unica','sim_nao') and cardinality(v_escolhas) <> 1 then
          raise exception 'Escolha só uma opção em: %', q.enunciado using errcode = 'P0001';
        end if;
        v_limpa := v_limpa || jsonb_build_array(jsonb_build_object('p', q.id, 'e', to_jsonb(v_escolhas)));
      end if;
      if o.tipo = 'quiz' and q.corretas is not null then
        v_total := v_total + 1;
        if v_escolhas is not null and v_escolhas = (select array_agg(c order by c) from unnest(q.corretas) c) then
          v_acertos := v_acertos + 1;
        end if;
      end if;
    end if;
  end loop;

  if o.tipo = 'quiz' then
    v_minima := coalesce(o.nota_minima, 70);
    v_nota := case when v_total > 0 then round(100.0 * v_acertos / v_total) else 100 end;
    v_aprovado := v_nota >= v_minima;
  end if;
  v_tentativas := case when v_atual.id is not null and o.tipo = 'quiz' then v_atual.tentativas + 1 else 1 end;

  insert into public.oportunidade_respostas (workspace_id, oportunidade_id, participante_id, respostas, acertos, total, nota, aprovado, tentativas)
  values (o.workspace_id, o.id, v_part.id, v_limpa,
    case when o.tipo = 'quiz' then v_acertos end, case when o.tipo = 'quiz' then v_total end, v_nota, v_aprovado, v_tentativas)
  on conflict (oportunidade_id, participante_id) do update set
    respostas = excluded.respostas, acertos = excluded.acertos, total = excluded.total, nota = excluded.nota,
    aprovado = excluded.aprovado, tentativas = excluded.tentativas, atualizado_em = now();

  return jsonb_build_object('situacao', 'respondido', 'nota', v_nota, 'acertos', case when o.tipo = 'quiz' then v_acertos end,
    'total', case when o.tipo = 'quiz' then v_total end, 'aprovado', v_aprovado, 'tentativas', v_tentativas, 'minima', v_minima);
end $$;
revoke all on function public.membro_responder_oportunidade(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.membro_responder_oportunidade(uuid, uuid, jsonb) to service_role;
