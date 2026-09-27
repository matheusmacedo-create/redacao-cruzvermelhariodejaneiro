-- Crachá virtual (Manual de Identidade Institucional da CVB, p. 28): o verso
-- traz o "Fator RH". Só acréscimos. Decisão do Matheus (27/09/2026): o tipo
-- sanguíneo aparece SÓ no crachá da própria pessoa, nunca na verificação
-- pública do QR.
--
-- O tipo sanguíneo do voluntário fica cifrado em participantes.saude_cifrada;
-- dados_sensiveis_participante() só abre para quem cuida do cadastro (nível 3).
-- Esta função devolve apenas o tipo sanguíneo e só para o servidor
-- (service_role): quem chama já conferiu que o participante é a pessoa da
-- sessão (a Área do Voluntário ou o user_id da conta do Palácio). As
-- restrições de saúde e o CPF inteiro continuam fechados.

create or replace function public.cracha_fator_rh(p_participante_id uuid)
returns text language sql security definer set search_path = '' stable as $$
  select case when p.saude_cifrada is null then null
    else extensions.pgp_sym_decrypt(p.saude_cifrada, private.chave_participantes())::jsonb->>'tipo_sanguineo' end
  from public.participantes p
  where p.id = p_participante_id and p.anonimizado_em is null
$$;
revoke all on function public.cracha_fator_rh(uuid) from public, anon, authenticated;
grant execute on function public.cracha_fator_rh(uuid) to service_role;
