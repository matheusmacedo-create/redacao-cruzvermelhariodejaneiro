-- ============================================================
-- Portaria pelo WhatsApp: a foto do visitante (19/10/2026)
--
-- Só acrescenta (ARQUITETURA §10.1). O código funciona sem esta migração:
-- sem a função, a foto mandada ao WhatsApp no registro da visita não entra
-- (o arquivo sai do Blob e a resposta manda tirar a foto pela tela da
-- portaria); a entrada é registrada do mesmo jeito.
--
--  - whatsapp_portaria_definir_foto: a MESMA função da tela
--    (portaria_definir_foto), chamada pelo servidor EM NOME de quem escreveu
--    no WhatsApp, depois do "confirmo", com a visita já criada e a foto já no
--    Blob privado (portaria/<espaço>/<visita>/<uuid>.jpg). Só o service role
--    executa; o servidor já conferiu que o número é da pessoa
--    (whatsapp_contas). As regras continuam as de dentro de
--    portaria_definir_foto (private.pode_portaria, o formato do caminho, a
--    visita não descartada), e a sessão simulada é "aal1"
--    (private.como_quem_escreveu_no_whatsapp, da migração 20260929110000):
--    quem usa ou é obrigado a usar a verificação em duas etapas não põe foto
--    pelo WhatsApp, como não registra a visita.
--
--    A mais, pelo WhatsApp: só põe foto (tirar é pela tela) e só na visita
--    que a própria pessoa registrou ou confirmou — o servidor passa o id da
--    visita que acabou de criar, e um id trocado não alcança a visita de
--    outra pessoa da portaria.
--
-- O telefone, a empresa, o crachá e a autorização do visitante
-- (avisar_visitante, só com telefone) já passam por
-- whatsapp_portaria_registrar_entrada → portaria_registrar_entrada (migrações
-- 20261018213700 e 20260929160000): nada a mudar ali.
-- ============================================================

create or replace function public.whatsapp_portaria_definir_foto(p_user_id uuid, p_id uuid, p_foto_path text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v public.portaria_visitas;
begin
  perform private.como_quem_escreveu_no_whatsapp(p_user_id);
  if p_foto_path is null then raise exception 'Foto inválida.' using errcode = 'P0001'; end if;
  select * into v from public.portaria_visitas where id = p_id;
  if not found or (v.registrado_por is distinct from p_user_id and v.confirmado_por is distinct from p_user_id) then
    raise exception 'Visita não encontrada.' using errcode = 'P0001';
  end if;
  return public.portaria_definir_foto(p_id, p_foto_path);
end $$;

comment on function public.whatsapp_portaria_definir_foto(uuid, uuid, text) is
  'A foto do visitante mandada ao WhatsApp, como quem escreveu (portaria_definir_foto, sessão aal1): só pôr, e só na visita que a pessoa registrou ou confirmou. Devolve o caminho anterior. Só o servidor.';

revoke all on function public.whatsapp_portaria_definir_foto(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.whatsapp_portaria_definir_foto(uuid, uuid, text) to service_role;
