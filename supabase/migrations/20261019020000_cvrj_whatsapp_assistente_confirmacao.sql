-- ============================================================
-- WhatsApp: o plano do assistente confirmado no Palácio (19/10/2026)
--
-- Só acrescenta (ARQUITETURA §10.1), depois de 20261018223000 (a tabela das
-- confirmações, onda 2) e de 20261019010000 (os planos do assistente). O
-- código funciona sem esta migração: sem a coluna plano_id, o assistente
-- trata a confirmação no Palácio como indisponível — o plano de quem usa a
-- verificação em duas etapas fica de fora com o link da tela (como antes) e a
-- decisão de despesa ou compra pelo assistente não nasce.
--
--  - whatsapp_confirmacoes.plano_id: o plano do assistente que o link
--    confirma (app/confirmar/[token], ramo "plano"). O plano INTEIRO vai ao
--    Palácio quando algum passo é sensível: o voto, a mensagem ou o
--    comentário de quem usa a verificação em duas etapas, e a decisão de
--    despesa ou compra (sempre). Lá, com a sessão e o nível das telas, a
--    página mostra os passos (a mesma função do texto do WhatsApp) e executa
--    pela sessão; a execução começa pela transição atômica do plano
--    (no_palacio → executando), então dois cliques não executam duas vezes.
--  - whatsapp_confirmacoes.acao ganha "plano" (a lista é lida da restrição
--    em vigor e só ganha o que falta, como em 20261018223000), e uma
--    restrição amarra as duas: acao = 'plano' ⇔ plano_id preenchido, com o
--    alvo igual ao plano.
--
-- Apagar o plano (a rotina apaga os de mais de 90 dias) apaga o link dele.
-- Nada de policy nova: a de leitura do dono (whatsapp_confirmacoes_select_dono)
-- vale para o link do plano, e a escrita continua só do servidor.
-- ============================================================

do $$
declare
  v_nome text;
  v_def text;
  v_lista text[];
begin
  -- As duas tabelas existem? Sem alguma delas (migração anterior ainda não aplicada), nada a fazer.
  if to_regclass('public.whatsapp_confirmacoes') is null or to_regclass('public.whatsapp_ia_planos') is null then
    raise notice 'whatsapp_confirmacoes ou whatsapp_ia_planos ausente: nada a fazer.';
    return;
  end if;

  -- O plano que o link confirma.
  alter table public.whatsapp_confirmacoes add column if not exists plano_id uuid references public.whatsapp_ia_planos (id) on delete cascade;
  create index if not exists whatsapp_confirmacoes_plano_idx on public.whatsapp_confirmacoes (plano_id) where plano_id is not null;

  -- A ação "plano" na restrição de acao (lida da que está em vigor; só acrescenta).
  select c.conname, pg_get_constraintdef(c.oid) into v_nome, v_def
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.conrelid = 'public.whatsapp_confirmacoes'::regclass and c.contype = 'c' and a.attname = 'acao'
     and cardinality(c.conkey) = 1
   limit 1;
  if v_def is not null then
    -- Os dois formatos: o da criação (acao in (...), lido como ARRAY['a'::text, ...]) e o da reconstrução ('{a,b}'::text[]).
    if v_def ~ '''\{[a-z_,]*\}''' then
      v_lista := string_to_array(substring(v_def from '''\{([a-z_,]*)\}'''), ',');
    else
      select array_agg(distinct m[1] order by m[1]) into v_lista from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
    end if;
    if coalesce(cardinality(v_lista), 0) = 0 then
      raise exception 'Não consegui ler as ações de whatsapp_confirmacoes: %', v_def;
    end if;
    if not v_lista @> array['plano']::text[] then
      v_lista := array(select distinct x from unnest(v_lista || array['plano']::text[]) as x order by x);
      execute format('alter table public.whatsapp_confirmacoes drop constraint %I', v_nome);
      execute format('alter table public.whatsapp_confirmacoes add constraint whatsapp_confirmacoes_acao_check check (acao = any (%L::text[]))', v_lista);
    end if;
  end if;

  -- O link do plano aponta para o plano (e só ele tem plano_id).
  if not exists (select 1 from pg_constraint where conrelid = 'public.whatsapp_confirmacoes'::regclass and conname = 'whatsapp_confirmacoes_plano_coerente') then
    alter table public.whatsapp_confirmacoes add constraint whatsapp_confirmacoes_plano_coerente
      check (case when acao = 'plano' then plano_id is not null and alvo_id = plano_id else plano_id is null end);
  end if;

  comment on column public.whatsapp_confirmacoes.plano_id is
    'O plano do assistente do WhatsApp que este link confirma (acao = plano; o alvo é o próprio plano). Só o servidor grava.';
  comment on table public.whatsapp_confirmacoes is
    'Pedidos sensíveis feitos pelo WhatsApp (decidir despesa ou compra, votar com a verificação em duas etapas, desativar conta, o plano do assistente) que só acontecem confirmados no Palácio, pelo link de uso único (15 min, só o hash do código). A pessoa lê só os dela; escrita só pelo servidor.';
end $$;
