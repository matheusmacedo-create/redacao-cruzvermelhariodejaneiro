-- ============================================================
-- WhatsApp: presença das ações e diário de bordo da frota (18/10/2026)
--
-- Só acrescenta (ARQUITETURA §10.1). O código funciona sem esta migração:
-- as consultas ("veículos", "estoque <material>", a Escola no "status") não
-- dependem dela; a chamada da ação ("presença") e a saída e o retorno de
-- veículo ("saída", "retorno") perguntam em etapas e, antes dela, o banco
-- recusa a pergunta (o tipo novo fora do CHECK) e o bot manda a pessoa ao
-- Palácio, com o link da ação ou do veículo.
--
--  - whatsapp_pendencias.tipo ganha "marcar_presenca" (a ação, a chamada e a
--    conferência), "frota_saida" (o veículo, quem dirige, o hodômetro, a
--    finalidade, o destino e a conferência) e "frota_retorno" (o veículo, o
--    hodômetro, as ocorrências e a conferência). A lista é lida da restrição
--    em vigor e só ganha o que falta (o mesmo bloco de 20261018213700 e
--    20261018223000): outra migração que amplie a lista não se perde.
--  - whatsapp_registrar_presenca, whatsapp_frota_sair e
--    whatsapp_frota_retornar: as MESMAS funções da tela (registrar_presenca,
--    frota_sair e frota_retornar), chamadas pelo servidor EM NOME de quem
--    escreveu no WhatsApp. Só o service role executa; o servidor já conferiu
--    que o número é da pessoa (whatsapp_contas). As regras continuam as de
--    dentro de cada uma: o nível do Voluntariado (private.nivel_participantes
--    ≥ 2) para a presença; o do Patrimônio (private.nivel_patrimonio ≥ 2), a
--    CNH, o curso de emergência, o km e a viagem aberta para a frota. Quem
--    marcou e quem registrou ficam sendo a pessoa (presenca_por,
--    registrado_por).
--
--    A sessão simulada é "aal1" (private.como_quem_escreveu_no_whatsapp, da
--    migração 20260929110000): quem usa ou é obrigado a usar a verificação em
--    duas etapas NÃO marca presença nem registra viagem pelo WhatsApp — o
--    próprio banco recusa (private.is_workspace_member confere a verificação,
--    e os dois níveis passam por ele), além do servidor, que confere antes
--    (podeAgirPeloWhatsapp).
-- ============================================================

-- ---------------------------------------------------------------- os tipos novos de pergunta

do $$
declare
  v_nome text;
  v_def text;
  v_lista text[];
  v_novos text[] := array['frota_retorno', 'frota_saida', 'marcar_presenca'];
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
  if v_lista @> v_novos then return; end if;
  v_lista := array(select distinct x from unnest(v_lista || v_novos) as x order by x);
  execute format('alter table public.whatsapp_pendencias drop constraint %I', v_nome);
  execute format('alter table public.whatsapp_pendencias add constraint whatsapp_pendencias_tipo_check check (tipo = any (%L::text[]))', v_lista);
end $$;

comment on table public.whatsapp_pendencias is
  'O passo que falta numa conversa com o bot do WhatsApp (confirmar a conferência, escolher fila e assunto do chamado, resolver ou transferir um chamado, registrar uma visita, a lista das decisões do Financeiro, a conferência do "Não fui eu", a chamada de uma ação, a saída e o retorno de um veículo). Só o servidor lê e escreve.';

-- ---------------------------------------------------------------- a presença como quem escreveu

create or replace function public.whatsapp_registrar_presenca(p_user_id uuid, p_workspace_id uuid, p_inscricao_id uuid, p_presente boolean, p_horas numeric default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.como_quem_escreveu_no_whatsapp(p_user_id);
  -- A inscrição é deste espaço (o servidor só manda as da lista que mostrou; o banco confere de novo).
  if not exists (select 1 from public.oportunidade_inscricoes i where i.id = p_inscricao_id and i.workspace_id = p_workspace_id) then
    raise exception 'Inscrição não encontrada.' using errcode = 'P0001';
  end if;
  perform public.registrar_presenca(p_inscricao_id, p_presente, p_horas);
end $$;

revoke all on function public.whatsapp_registrar_presenca(uuid, uuid, uuid, boolean, numeric) from public, anon, authenticated;
grant execute on function public.whatsapp_registrar_presenca(uuid, uuid, uuid, boolean, numeric) to service_role;

-- ---------------------------------------------------------------- a saída e o retorno como quem escreveu

create or replace function public.whatsapp_frota_sair(p_user_id uuid, p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform private.como_quem_escreveu_no_whatsapp(p_user_id);
  return public.frota_sair(p_workspace_id, p);
end $$;

create or replace function public.whatsapp_frota_retornar(p_user_id uuid, p_workspace_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.como_quem_escreveu_no_whatsapp(p_user_id);
  return public.frota_retornar(p_workspace_id, p);
end $$;

revoke all on function public.whatsapp_frota_sair(uuid, uuid, jsonb), public.whatsapp_frota_retornar(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.whatsapp_frota_sair(uuid, uuid, jsonb), public.whatsapp_frota_retornar(uuid, uuid, jsonb) to service_role;
