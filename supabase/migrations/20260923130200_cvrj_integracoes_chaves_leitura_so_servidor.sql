-- A leitura decifrada passa a ser SÓ do servidor (service_role).
--
-- Antes: authenticated podia chamar chave_de_integracao, com checagem interna
-- de admin. Dois problemas: (1) um admin conseguia ler a chave em texto puro
-- pelo console do navegador, via RPC; (2) editor e colaborador não conseguiam
-- usar a Hunter quando a chave estava no cofre, porque a leitura era só de
-- admin.
--
-- Agora ninguém com sessão de navegador lê o valor — nem admin. Quem lê é o
-- código de servidor, com a service role, DEPOIS de conferir em código que
-- quem pediu é membro do espaço (requireWorkspace). Gravar e remover
-- continuam restritos a admin.

create or replace function public.chave_de_integracao(p_workspace_id uuid, p_servico text)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select ds.decrypted_secret
  from public.integracoes_chaves ic
  join vault.decrypted_secrets ds on ds.id = ic.vault_secret_id
  where ic.workspace_id = p_workspace_id
    and ic.servico = p_servico;
$$;

comment on function public.chave_de_integracao is
  'Devolve a chave decifrada de um serviço. Executável SÓ pela service_role: o servidor confere a participação no espaço antes de chamar.';

revoke all on function public.chave_de_integracao(uuid, text) from public;
revoke execute on function public.chave_de_integracao(uuid, text) from anon;
revoke execute on function public.chave_de_integracao(uuid, text) from authenticated;
grant execute on function public.chave_de_integracao(uuid, text) to service_role;
