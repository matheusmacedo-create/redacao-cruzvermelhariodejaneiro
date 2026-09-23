-- Corrige duas falhas apontadas pelo advisor de segurança logo após a
-- migração anterior:
--
--  1. NULL NÃO DISPARAVA O ERRO. `role <> 'admin'` com role NULL (quem não é
--     membro do espaço — inclusive anon) avalia para NULL, e `IF NULL THEN` o
--     PL/pgSQL trata como falso: a função seguia em vez de recusar. Trocado
--     por `IS DISTINCT FROM`.
--
--  2. EXECUTE PÚBLICO DEMAIS. Função nova em public ganha EXECUTE de PUBLIC
--     por padrão; anon aparecia podendo chamar as três. Revoga de public e
--     anon; fica só authenticated (a checagem interna barra quem não é admin).

create or replace function public.definir_chave_de_integracao(p_workspace_id uuid, p_servico text, p_valor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
begin
  if (select private.workspace_role(p_workspace_id)) is distinct from 'admin' then
    raise exception 'Só administradores do espaço podem configurar chaves de integração.';
  end if;
  if p_servico is null or length(trim(p_servico)) = 0 then
    raise exception 'Informe o serviço.';
  end if;
  if p_valor is null or length(trim(p_valor)) = 0 then
    raise exception 'Informe o valor da chave.';
  end if;

  select vault_secret_id into v_existing
  from public.integracoes_chaves
  where workspace_id = p_workspace_id and servico = p_servico;

  if v_existing is not null then
    perform vault.update_secret(v_existing, trim(p_valor));
    update public.integracoes_chaves
      set updated_at = now(), configurada_por = (select auth.uid())
      where workspace_id = p_workspace_id and servico = p_servico;
  else
    insert into public.integracoes_chaves (workspace_id, servico, vault_secret_id, configurada_por)
    values (
      p_workspace_id,
      p_servico,
      vault.create_secret(trim(p_valor), p_workspace_id::text || ':' || p_servico || ':' || gen_random_uuid()::text),
      (select auth.uid())
    );
  end if;
end;
$$;

create or replace function public.remover_chave_de_integracao(p_workspace_id uuid, p_servico text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  if (select private.workspace_role(p_workspace_id)) is distinct from 'admin' then
    raise exception 'Só administradores do espaço podem remover chaves de integração.';
  end if;

  select vault_secret_id into v_secret_id
  from public.integracoes_chaves
  where workspace_id = p_workspace_id and servico = p_servico;

  if v_secret_id is null then
    return;
  end if;

  delete from public.integracoes_chaves where workspace_id = p_workspace_id and servico = p_servico;
  delete from vault.secrets where id = v_secret_id;
end;
$$;

revoke all on function public.definir_chave_de_integracao(uuid, text, text) from public;
revoke all on function public.chave_de_integracao(uuid, text) from public;
revoke all on function public.remover_chave_de_integracao(uuid, text) from public;

revoke execute on function public.definir_chave_de_integracao(uuid, text, text) from anon;
revoke execute on function public.chave_de_integracao(uuid, text) from anon;
revoke execute on function public.remover_chave_de_integracao(uuid, text) from anon;

grant execute on function public.definir_chave_de_integracao(uuid, text, text) to authenticated;
grant execute on function public.chave_de_integracao(uuid, text) to authenticated;
grant execute on function public.remover_chave_de_integracao(uuid, text) to authenticated;
