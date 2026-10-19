-- ============================================================
-- WhatsApp: quem atende chamado e a portaria (18/10/2026)
--
-- Só acrescenta (ARQUITETURA §10.1). O código funciona sem esta migração:
-- "assumir" um chamado e a lista "portaria" não dependem dela; resolver,
-- transferir e registrar visita perguntam em etapas e, antes dela, o banco
-- recusa a pergunta (o tipo novo fora do CHECK) e o bot manda a pessoa ao
-- Palácio, com o link do chamado ou da portaria.
--
--  - whatsapp_pendencias.tipo ganha "atender_chamado" (a solução, a fila, o
--    assunto e o motivo antes de resolver ou transferir, e a conferência) e
--    "registrar_visita" (o nome do visitante, para quem, o motivo e a
--    conferência). A lista é lida da restrição em vigor e só ganha o que
--    falta (o mesmo bloco de notifications_categoria_valida nas migrações do
--    Chat e da Portaria): outra migração que amplie a lista não se perde.
--  - whatsapp_portaria_registrar_entrada: a MESMA função da tela
--    (portaria_registrar_entrada), chamada pelo servidor EM NOME de quem
--    escreveu no WhatsApp. Só o service role executa; o servidor já conferiu
--    que o número é da pessoa (whatsapp_contas). As regras continuam as de
--    dentro de portaria_registrar_entrada (private.pode_portaria: membro
--    ativo, menos a equipe da Escola), e registrado_por é a pessoa.
--
--    A sessão simulada é "aal1" (private.como_quem_escreveu_no_whatsapp, da
--    migração 20260929110000): quem usa ou é obrigado a usar a verificação em
--    duas etapas NÃO registra visita pelo WhatsApp — o próprio banco recusa
--    (private.verificacao_em_dia, dentro de pode_portaria), além do servidor,
--    que confere antes (podeAgirPeloWhatsapp).
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
  -- Os dois formatos: o da criação (tipo in (...), lido como ARRAY['a'::text, ...]) e o desta reconstrução ('{a,b}'::text[]).
  if v_def ~ '''\{[a-z_,]*\}''' then
    v_lista := string_to_array(substring(v_def from '''\{([a-z_,]*)\}'''), ',');
  else
    select array_agg(distinct m[1] order by m[1]) into v_lista from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
  end if;
  if coalesce(cardinality(v_lista), 0) = 0 then
    raise exception 'Não consegui ler os tipos de whatsapp_pendencias: %', v_def;
  end if;
  if v_lista @> array['atender_chamado', 'registrar_visita']::text[] then return; end if;
  v_lista := array(select distinct x from unnest(v_lista || array['atender_chamado', 'registrar_visita']::text[]) as x order by x);
  execute format('alter table public.whatsapp_pendencias drop constraint %I', v_nome);
  execute format('alter table public.whatsapp_pendencias add constraint whatsapp_pendencias_tipo_check check (tipo = any (%L::text[]))', v_lista);
end $$;

comment on table public.whatsapp_pendencias is
  'O passo que falta numa conversa com o bot do WhatsApp (confirmar a conferência, escolher fila e assunto do chamado, resolver ou transferir um chamado, registrar uma visita). Só o servidor lê e escreve.';

-- ---------------------------------------------------------------- registrar a visita como quem escreveu

create or replace function public.whatsapp_portaria_registrar_entrada(p_user_id uuid, p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform private.como_quem_escreveu_no_whatsapp(p_user_id);
  return public.portaria_registrar_entrada(p_workspace_id, p);
end $$;

revoke all on function public.whatsapp_portaria_registrar_entrada(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.whatsapp_portaria_registrar_entrada(uuid, uuid, jsonb) to service_role;
