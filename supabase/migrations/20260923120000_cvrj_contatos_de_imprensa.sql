-- Contatos de imprensa: o banco que centraliza jornalistas e veículos, hoje
-- espalhados em planilhas e em ferramentas separadas (Hunter.io, SEMrush).
--
-- Esta primeira versão cobre só o pedido concreto: encontrar, verificar e
-- guardar contato de imprensa num lugar só. Duas decisões deliberadas:
--
--  1. NASCE SEM ENVIO DE RELEASE. Guardar contato e disparar e-mail em massa
--     são responsabilidades diferentes — a segunda tem regra de reputação de
--     remetente própria (como a newsletter já tem, com Resend). Esta tabela
--     não presume que o disparo vai usar o mesmo caminho.
--
--  2. email_status É NOSSO, NÃO O DA HUNTER. A Hunter devolve seis valores
--     (valid, invalid, accept_all, webmail, disposable, unknown) — mais
--     granularidade do que a tela precisa para decidir "dá para mandar ou
--     não". Aqui entra em três baldes que a Hunter já usou como campo
--     "result" antes de aposentá-lo: valido (valid), invalido (invalid) e
--     arriscado (todo o resto — accept_all, webmail, disposable, unknown).
--     Quem quiser o valor fino da Hunter, ele mora em activity_log.

create table if not exists public.press_contacts (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,

  nome          text not null default '',
  veiculo       text not null default '',   -- o jornal, portal, TV, rádio…
  cargo         text not null default '',   -- "Repórter de Cidades", "Editor"
  dominio       text not null default '',   -- domínio do veículo, para buscar/reagrupar

  email         text,
  check (email is null or position('@' in email) > 1),

  -- Ponto único que a tela usa para decidir "dá para contar com este e-mail".
  -- Ver nota (2) acima sobre a origem desta simplificação.
  email_status  text not null default 'nao_verificado'
                check (email_status in ('nao_verificado','valido','arriscado','invalido')),
  -- Confiança 0–100: da Hunter (Domain Search/Email Finder) quando veio de
  -- lá; em contato manual, fica nulo — não é um "talvez 50%" inventado.
  confianca     smallint check (confianca is null or confianca between 0 and 100),
  verificado_em timestamptz,

  telefone      text not null default '',
  tags          text[] not null default '{}',   -- 'saude', 'emergencia', 'tv'…
  notas         text not null default '',

  fonte         text not null default 'manual'
                check (fonte in ('manual','hunter_dominio','hunter_email_finder')),

  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.press_contacts is
  'Contatos de imprensa (jornalistas, veículos) centralizados na Redação. Não dispara e-mail — só guarda e qualifica o contato.';
comment on column public.press_contacts.email_status is
  'Balde nosso, não o da Hunter: valido/invalido/arriscado/nao_verificado. O detalhe fino da resposta da Hunter fica em activity_log.';

-- Mesmo contato não entra duas vezes no espaço — nem vindo de uma busca
-- repetida, nem digitado à mão de novo por engano.
create unique index if not exists press_contacts_email_idx
  on public.press_contacts (workspace_id, lower(email))
  where email is not null;

create index if not exists press_contacts_workspace_idx
  on public.press_contacts (workspace_id, created_at desc);
create index if not exists press_contacts_dominio_idx
  on public.press_contacts (workspace_id, dominio)
  where dominio <> '';

alter table public.press_contacts enable row level security;

create policy press_contacts_select_member on public.press_contacts
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create policy press_contacts_insert_member on public.press_contacts
  for insert to authenticated
  with check (
    (select private.is_workspace_member(workspace_id))
    and created_by = (select auth.uid())
  );

create policy press_contacts_update_member on public.press_contacts
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));

-- Espelha o padrão de projects/pautas/content_pieces: admin do espaço, ou
-- quem cadastrou o contato.
create policy press_contacts_delete_owner on public.press_contacts
  for delete to authenticated
  using (
    (select private.is_workspace_member(workspace_id))
    and ((select private.workspace_role(workspace_id)) = 'admin' or created_by = (select auth.uid()))
  );

-- updated_at automático, a mesma função genérica já usada por outras tabelas.
drop trigger if exists press_contacts_touch on public.press_contacts;
create trigger press_contacts_touch
  before update on public.press_contacts
  for each row execute function public.touch_social_publications();
