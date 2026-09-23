-- Chaves de integração: um lugar único, dentro da Redação, para guardar as
-- chaves de ferramentas externas (Hunter.io hoje; SEMrush e outras depois) —
-- em vez de cada uma exigir uma ida à Vercel.
--
-- A chave em si NUNCA fica numa coluna de texto comum. Ela vive no Vault do
-- Supabase (pgsodium por baixo — criptografia autenticada, chave de
-- criptografia fora do alcance de quem só lê a tabela). O que esta tabela
-- guarda é a REFERÊNCIA ao segredo (vault_secret_id), não o segredo — o mesmo
-- desenho de um cofre com registro de qual gaveta é de quem, sem que o
-- registro abra a gaveta sozinho.
--
-- Três decisões deliberadas:
--
--  1. LER E ESCREVER SÓ POR FUNÇÃO. A tabela não tem política de insert,
--     update nem delete para authenticated — só select. Gravar, trocar e
--     apagar passam pelas funções abaixo, que conferem "é admin do espaço"
--     ANTES de tocar no Vault. Sem isso, RLS de linha não bastaria: dar
--     insert a um membro comum deixaria qualquer um cadastrar (ou substituir)
--     a chave de uma ferramenta paga.
--
--  2. A LEITURA DECIFRADA TAMBÉM É SÓ ADMIN. Mesmo sendo chamada de dentro de
--     uma server action (o valor nunca volta para o navegador de quem chamou
--     de um componente de servidor), a função fica exposta pelo RPC do
--     PostgREST — e por isso o mesmo padrão do resto do projeto: quem grava
--     e quem lê o segredo é o mesmo público, administrador do espaço.
--
--  3. NUNCA SUBSTITUI O AMBIENTE, SÓ ADIANTA ELE. O código que consome a
--     chave (lib/integracoes/chaves.ts) tenta o Vault primeiro e cai para a
--     variável de ambiente da Vercel se não houver nada configurado aqui —
--     quem já tinha HUNTER_API_KEY na Vercel continua funcionando sem fazer
--     nada.

create table if not exists public.integracoes_chaves (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,

  -- 'hunter', e no futuro 'semrush' etc. — o identificador que o código usa
  -- para pedir a chave certa.
  servico          text not null,

  vault_secret_id  uuid not null,

  configurada_por  uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.integracoes_chaves is
  'Referência (não o valor) das chaves de integração guardadas no Vault. Escrita e leitura decifrada só por função SECURITY DEFINER restrita a admin — ver as três notas no topo da migração.';

create unique index if not exists integracoes_chaves_servico_idx
  on public.integracoes_chaves (workspace_id, servico);

alter table public.integracoes_chaves enable row level security;

-- Qualquer membro vê QUAIS serviços estão configurados (a tela de
-- Configurações mostra "Hunter.io: configurada há 3 dias") — nunca o valor,
-- que não está nesta tabela.
create policy integracoes_chaves_select_member on public.integracoes_chaves
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

-- De propósito, sem política de insert/update/delete para authenticated: a
-- escrita só acontece dentro das funções abaixo, que rodam como o dono da
-- função (security definer) e conferem admin antes de tocar em qualquer
-- linha.

create or replace function public.definir_chave_de_integracao(p_workspace_id uuid, p_servico text, p_valor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
begin
  if (select private.workspace_role(p_workspace_id)) <> 'admin' then
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

comment on function public.definir_chave_de_integracao is
  'Grava (ou substitui) a chave de um serviço no Vault. Restrita a admin do espaço — a checagem é interna, não RLS.';

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
    and ic.servico = p_servico
    and (select private.workspace_role(p_workspace_id)) = 'admin';
$$;

comment on function public.chave_de_integracao is
  'Devolve a chave decifrada de um serviço. Restrita a admin do espaço — chamada só de código de servidor, nunca de componente de cliente.';

create or replace function public.remover_chave_de_integracao(p_workspace_id uuid, p_servico text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  if (select private.workspace_role(p_workspace_id)) <> 'admin' then
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

comment on function public.remover_chave_de_integracao is
  'Apaga a chave de um serviço (linha e segredo no Vault). Restrita a admin do espaço.';

grant execute on function public.definir_chave_de_integracao(uuid, text, text) to authenticated;
grant execute on function public.chave_de_integracao(uuid, text) to authenticated;
grant execute on function public.remover_chave_de_integracao(uuid, text) to authenticated;

drop trigger if exists integracoes_chaves_touch on public.integracoes_chaves;
create trigger integracoes_chaves_touch
  before update on public.integracoes_chaves
  for each row execute function public.touch_social_publications();
