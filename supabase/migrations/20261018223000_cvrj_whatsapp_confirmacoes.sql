-- ============================================================
-- WhatsApp: confirmar no Palácio, decisões do Financeiro e "Não fui eu" (18/10/2026)
--
-- Só acrescenta (ARQUITETURA §10.1). O código funciona sem esta migração:
-- antes dela, o pedido sensível feito pelo WhatsApp (aprovar uma despesa ou
-- uma compra, o voto de quem usa a verificação em duas etapas, desativar uma
-- conta) responde com o link da tela de sempre, a lista do "financeiro" sai
-- com os links de cada item, e o "Não fui eu" orienta a trocar a senha e
-- falar com a administração.
--
--  - whatsapp_confirmacoes: o que alguém pediu pelo WhatsApp e só acontece
--    depois de confirmado DENTRO do Palácio (app/confirmar/[token]), com a
--    sessão normal e a mesma verificação das telas. O link é de uso único,
--    vale 15 minutos e é amarrado à pessoa: no banco vai só o sha-256 do
--    código (o link aparece uma vez, no WhatsApp de quem pediu). A tela lê
--    pela sessão da própria pessoa (a policy só deixa o dono ler) e a
--    gravação (usado_em, resultado) é do servidor (service role), depois de
--    executar a ação pela MESMA função da tela.
--  - whatsapp_pendencias.tipo ganha "financeiro" (a lista numerada das
--    despesas e compras esperando a decisão da pessoa: "aprovar 2" e
--    "recusar 2: motivo" acham o item por ela) e "nao_fui_eu" (a conferência
--    antes de encerrar as sessões da conta). A lista é lida da restrição em
--    vigor e só ganha o que falta, como em 20261018213700.
-- ============================================================

-- ---------------------------------------------------------------- os tipos novos de pergunta

do $$
declare
  v_nome text;
  v_def text;
  v_lista text[];
begin
  select c.conname, pg_get_constraintdef(c.oid) into v_nome, v_def
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.conrelid = 'public.whatsapp_pendencias'::regclass and c.contype = 'c' and a.attname = 'tipo'
   limit 1;
  -- Sem restrição no tipo, nada a ampliar.
  if v_def is null then return; end if;
  -- Os dois formatos: o da criação (tipo in (...), lido como ARRAY['a'::text, ...]) e o da reconstrução ('{a,b}'::text[]).
  if v_def ~ '''\{[a-z_,]*\}''' then
    v_lista := string_to_array(substring(v_def from '''\{([a-z_,]*)\}'''), ',');
  else
    select array_agg(distinct m[1] order by m[1]) into v_lista from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
  end if;
  if coalesce(cardinality(v_lista), 0) = 0 then
    raise exception 'Não consegui ler os tipos de whatsapp_pendencias: %', v_def;
  end if;
  if v_lista @> array['financeiro', 'nao_fui_eu']::text[] then return; end if;
  v_lista := array(select distinct x from unnest(v_lista || array['financeiro', 'nao_fui_eu']::text[]) as x order by x);
  execute format('alter table public.whatsapp_pendencias drop constraint %I', v_nome);
  execute format('alter table public.whatsapp_pendencias add constraint whatsapp_pendencias_tipo_check check (tipo = any (%L::text[]))', v_lista);
end $$;

-- A conferência do "Não fui eu" é achada pelo número (pode vir do número antigo da conta, que já não é dela em whatsapp_contas).
create index if not exists whatsapp_pendencias_protecao_idx on public.whatsapp_pendencias ((dados ->> 'numero'), criado_em desc)
  where tipo = 'nao_fui_eu';

comment on table public.whatsapp_pendencias is
  'O passo que falta numa conversa com o bot do WhatsApp (confirmar a conferência, escolher fila e assunto do chamado, resolver ou transferir um chamado, registrar uma visita, a lista das decisões do Financeiro, a conferência do "Não fui eu"). Só o servidor lê e escreve.';

-- ---------------------------------------------------------------- confirmar no Palácio

create table if not exists public.whatsapp_confirmacoes (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Quem pediu pelo WhatsApp: só esta pessoa, logada no Palácio, confirma.
  user_id      uuid not null references public.profiles (id) on delete cascade,
  -- decidir_despesa (Financeiro), decidir_compra (Compras), votar_aprovacao (o voto de quem usa a
  -- verificação em duas etapas) e desativar_conta (a administração).
  acao         text not null check (acao in ('decidir_despesa', 'decidir_compra', 'votar_aprovacao', 'desativar_conta')),
  -- O lançamento, o pedido de compra, a rodada de aprovação ou a conta.
  alvo_id      uuid not null,
  -- A decisão e o motivo (aprovar ou recusar, a etapa da compra, a nota do ajuste). Nada de segredo aqui.
  dados        jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object' and pg_column_size(dados) <= 4000),
  -- O sha-256 do código do link (lib/whatsapp/confirmacoes.ts). O código em si nunca é gravado.
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  criado_em    timestamptz not null default now(),
  expira_em    timestamptz not null,
  -- Uso único: a gravação de usado_em é condicional (só uma confirmação passa).
  usado_em     timestamptz,
  -- O que aconteceu ao confirmar (ou "substituída" por um link mais novo do mesmo pedido).
  resultado    text check (resultado is null or char_length(resultado) <= 500)
);
create index if not exists whatsapp_confirmacoes_pessoa_idx on public.whatsapp_confirmacoes (user_id, criado_em desc);
create index if not exists whatsapp_confirmacoes_espaco_idx on public.whatsapp_confirmacoes (workspace_id, criado_em desc);

-- A pessoa lê só as dela (a tela de confirmar usa a sessão de quem abriu o link); escrita só pelo service role.
alter table public.whatsapp_confirmacoes enable row level security;
revoke all on public.whatsapp_confirmacoes from anon;
revoke insert, update, delete, truncate, references, trigger on public.whatsapp_confirmacoes from authenticated;
grant select on public.whatsapp_confirmacoes to authenticated;

-- Criada só se ainda não existe: idempotente sem precisar de drop policy.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'whatsapp_confirmacoes' and policyname = 'whatsapp_confirmacoes_select_dono') then
    create policy whatsapp_confirmacoes_select_dono on public.whatsapp_confirmacoes for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;

comment on table public.whatsapp_confirmacoes is
  'Pedidos sensíveis feitos pelo WhatsApp (decidir despesa ou compra, votar com a verificação em duas etapas, desativar conta) que só acontecem confirmados no Palácio, pelo link de uso único (15 min, só o hash do código). A pessoa lê só os dela; escrita só pelo servidor.';
