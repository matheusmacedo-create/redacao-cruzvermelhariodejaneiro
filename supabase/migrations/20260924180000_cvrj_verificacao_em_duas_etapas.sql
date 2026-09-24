-- ============================================================
-- Verificação em duas etapas (TOTP: Google Authenticator, Authy etc.)
--
-- Opcional para todo mundo; o administrador pode passar a EXIGIR para um ou
-- mais papéis (workspaces.mfa_obrigatorio_para). Nasce vazio: ninguém é
-- obrigado até alguém ligar.
--
-- A regra mora nos helpers de RLS, como a de conta desativada: quem cadastrou
-- o código (ou é de um papel que o exige) e está numa sessão só com senha
-- (aal1) não enxerga nem escreve nada. A tela /verificacao é conforto; o
-- banco é a cerca. Sem isso, bastaria a senha para chamar a Data API direto.
--
-- Só acrescenta (ARQUITETURA §10.1). Seguro antes do deploy: aplicada
-- quando ninguém tinha fator cadastrado e a lista de papéis nasce vazia.
-- ============================================================

alter table public.workspaces
  add column if not exists mfa_obrigatorio_para text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workspaces_mfa_obrigatorio_para_papeis') then
    alter table public.workspaces add constraint workspaces_mfa_obrigatorio_para_papeis
      check (mfa_obrigatorio_para <@ array['admin','editor','colaborador']::text[]);
  end if;
end $$;

comment on column public.workspaces.mfa_obrigatorio_para is
  'Papéis que só acessam o espaço depois de confirmar o código do app autenticador. Vazio = opcional para todos.';

-- A sessão de quem pergunta cumpre a verificação que lhe cabe?
--  - aal2 (senha + código nesta sessão): sempre cumpre;
--  - aal1: só cumpre se a pessoa não tem fator verificado E o papel dela
--    neste espaço não está na lista de obrigatórios.
create or replace function private.verificacao_em_dia(p_workspace_id uuid, p_papel text)
returns boolean language sql security definer set search_path = '' stable as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    or (
      not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid()) and f.status = 'verified'
      )
      and not exists (
        select 1 from public.workspaces w
        where w.id = p_workspace_id and p_papel = any (w.mfa_obrigatorio_para)
      )
    );
$$;

revoke all on function private.verificacao_em_dia(uuid, text) from public, anon;
grant execute on function private.verificacao_em_dia(uuid, text) to authenticated;

-- Mesma assinatura e mesma regra de antes (vínculo + perfil ativo), mais a
-- verificação. As policies existentes não precisam ser recriadas.
create or replace function private.is_workspace_member(p_workspace_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1
    from public.workspace_members m
    join public.profiles p on p.id = m.user_id
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and p.active
      and private.verificacao_em_dia(m.workspace_id, m.role)
  );
$$;

create or replace function private.workspace_role(p_workspace_id uuid)
returns text language sql security definer set search_path = '' stable as $$
  select m.role
  from public.workspace_members m
  join public.profiles p on p.id = m.user_id
  where m.workspace_id = p_workspace_id
    and m.user_id = (select auth.uid())
    and p.active
    and private.verificacao_em_dia(m.workspace_id, m.role)
  limit 1;
$$;

create or replace function private.shares_workspace(p_user_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1
    from public.workspace_members me
    join public.profiles eu on eu.id = me.user_id and eu.active
    join public.workspace_members other on other.workspace_id = me.workspace_id
    where me.user_id = (select auth.uid())
      and other.user_id = p_user_id
      and private.verificacao_em_dia(me.workspace_id, me.role)
  );
$$;

-- ============================================================
-- O próprio vínculo continua legível numa sessão aal1.
--
-- Sem isto, quem ainda precisa digitar o código não conseguiria nem saber a
-- que espaço pertence nem se o papel dele exige verificação — e o app não
-- teria como levá-lo à tela /verificacao (cairia em "sem acesso"). Só a
-- própria linha e o próprio espaço; nenhum dado de trabalho.
-- ============================================================
drop policy if exists workspace_members_select_self on public.workspace_members;
create policy workspace_members_select_self on public.workspace_members
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists workspaces_select_vinculo on public.workspaces;
create policy workspaces_select_vinculo on public.workspaces
  for select to authenticated
  using (exists (
    select 1 from public.workspace_members m
    where m.workspace_id = workspaces.id and m.user_id = (select auth.uid())
  ));

-- A lista de papéis obrigatórios só muda pelo service role (action de admin,
-- com auditoria). Nenhum papel da Data API edita workspaces.
revoke insert, update, delete on public.workspaces from authenticated, anon;
