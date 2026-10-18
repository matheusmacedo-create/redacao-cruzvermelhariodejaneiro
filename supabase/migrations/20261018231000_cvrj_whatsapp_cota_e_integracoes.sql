-- ============================================================
-- WhatsApp: cota diária de conversas e alertas de integrações (18/10/2026)
--
-- Só acrescenta (ARQUITETURA §10.1). O código funciona sem esta migração:
-- antes dela, a função da cota não existe, a contagem volta vazia e nada
-- espera por ela (a tela de conexão e o "status" dizem que não deu para
-- contar); e o alerta de integração entra no sino como "geral" (o caminho
-- de sempre de notificar() quando o banco recusa a categoria), saindo pelo
-- e-mail e pelo WhatsApp como "integracoes".
--
--  - notifications.categoria ganha "integracoes": o alerta à administração
--    quando uma integração para (a autorização do Google expira ou o cliente
--    OAuth é recusado, o Resend recusa a chave ou sai do ar, o R2 não grava).
--    Ao contrário de "sistema" (o WhatsApp do Palácio caiu, que nunca vai
--    por ele), vai também pelo WhatsApp. A lista é lida da restrição em
--    vigor e só ganha o que falta (o mesmo bloco das migrações do Chat, da
--    Portaria e da fila).
--  - whatsapp_fila.motivo ganha "cota": o que pode esperar (avisos comuns,
--    anúncios aos voluntários, convites) e ficou para o dia seguinte porque
--    as conversas que o Palácio iniciou nas últimas 24 h chegaram perto do
--    teto da Meta (lib/whatsapp/regras.ts, COTA_DE_CONVERSAS). A lista é
--    lida da restrição em vigor, como em 20261018213700.
--  - whatsapp_cota_de_conversas: a contagem dessa cota, pela aproximação de
--    lib/whatsapp/regras.ts — números distintos que receberam saída enviada
--    nas últimas 24 h sem ter escrito ao número nas 24 h antes dela (a
--    resposta do bot fica de fora: vai sempre dentro da janela). Com um
--    número, diz também se ele está com a janela aberta (escreveu nas últimas
--    24 h) e se já foi contado: nesses casos a mensagem não abre conversa
--    nova e não espera. Só o service role executa; devolve só contagens e
--    sim/não, nunca números nem textos.
-- ============================================================

-- ---------------------------------------------------------------- a categoria "integracoes"

do $$
declare
  v_def text;
  v_lista text[];
  v_todas text[] := array['aprovacoes', 'auditoria', 'chamados', 'chat', 'equipe', 'financeiro', 'geral', 'integracoes', 'mensagens', 'oficios', 'patrimonio', 'pautas', 'portaria', 'sistema'];
begin
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'public.notifications'::regclass and c.conname = 'notifications_categoria_valida';
  if v_def is null then return; end if;
  if v_def ~ '''\{[a-z_,]*\}''' then
    v_lista := string_to_array(substring(v_def from '''\{([a-z_,]*)\}'''), ',');
  else
    select array_agg(distinct m[1] order by m[1]) into v_lista from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
  end if;
  if coalesce(cardinality(v_lista), 0) = 0 then
    raise exception 'Não consegui ler as categorias de notifications_categoria_valida: %', v_def;
  end if;
  if v_todas <@ v_lista then return; end if;
  select array_agg(distinct x order by x) into v_lista from unnest(v_lista || v_todas) as x;
  alter table public.notifications drop constraint notifications_categoria_valida;
  execute format('alter table public.notifications add constraint notifications_categoria_valida check (categoria = any (%L::text[]))', v_lista);
end $$;

-- ---------------------------------------------------------------- o motivo "cota" na fila

do $$
declare
  v_nome text;
  v_def text;
  v_lista text[];
begin
  select c.conname, pg_get_constraintdef(c.oid) into v_nome, v_def
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.conrelid = 'public.whatsapp_fila'::regclass and c.contype = 'c' and a.attname = 'motivo'
   limit 1;
  -- Sem restrição no motivo, nada a ampliar.
  if v_def is null then return; end if;
  -- Os dois formatos: o da criação (motivo in (...), lido como ARRAY['a'::text, ...]) e o da reconstrução ('{a,b}'::text[]).
  if v_def ~ '''\{[a-z_,]*\}''' then
    v_lista := string_to_array(substring(v_def from '''\{([a-z_,]*)\}'''), ',');
  else
    select array_agg(distinct m[1] order by m[1]) into v_lista from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
  end if;
  if coalesce(cardinality(v_lista), 0) = 0 then
    raise exception 'Não consegui ler os motivos de whatsapp_fila: %', v_def;
  end if;
  if v_lista @> array['cota']::text[] then return; end if;
  v_lista := array(select distinct x from unnest(v_lista || array['cota']::text[]) as x order by x);
  execute format('alter table public.whatsapp_fila drop constraint %I', v_nome);
  execute format('alter table public.whatsapp_fila add constraint whatsapp_fila_motivo_check check (motivo = any (%L::text[]))', v_lista);
end $$;

comment on table public.whatsapp_fila is
  'Mensagens do WhatsApp que ainda vão sair (silêncio 22h–7h, teto por minuto, cota diária de conversas, reenvio após queda). Só o servidor lê e escreve.';

-- ---------------------------------------------------------------- a contagem da cota

create or replace function public.whatsapp_cota_de_conversas(p_workspace_id uuid, p_numero text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with iniciadas as (
    select distinct s.numero
      from public.whatsapp_mensagens s
     where s.workspace_id = p_workspace_id
       and s.direcao = 'saida' and s.situacao = 'enviada' and s.tipo <> 'bot'
       and s.numero is not null
       and s.criado_em > now() - interval '24 hours'
       and not exists (
         select 1 from public.whatsapp_mensagens e
          where e.workspace_id = p_workspace_id and e.direcao = 'entrada' and e.numero = s.numero
            and e.criado_em <= s.criado_em and e.criado_em > s.criado_em - interval '24 hours')
  )
  select jsonb_build_object(
    'usadas', (select count(*) from iniciadas),
    'janela_aberta', p_numero is not null and exists (
      select 1 from public.whatsapp_mensagens e
       where e.workspace_id = p_workspace_id and e.direcao = 'entrada' and e.numero = p_numero
         and e.criado_em > now() - interval '24 hours'),
    'ja_contado', p_numero is not null and exists (select 1 from iniciadas i where i.numero = p_numero))
$$;

revoke all on function public.whatsapp_cota_de_conversas(uuid, text) from public, anon, authenticated;
grant execute on function public.whatsapp_cota_de_conversas(uuid, text) to service_role;

comment on function public.whatsapp_cota_de_conversas(uuid, text) is
  'Conversas que o Palácio iniciou pelo WhatsApp nas últimas 24 h (números distintos com saída enviada sem entrada nas 24 h antes) e, com um número, se ele está com a janela aberta ou já foi contado. Só o servidor chama.';
