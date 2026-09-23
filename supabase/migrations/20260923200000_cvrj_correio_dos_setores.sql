-- Correio dos setores: cada setor envia só pelo SEU endereço (alias do Gmail)
-- e com a SUA assinatura, mesmo que todos os endereços pertençam à mesma
-- conta do Google Workspace.
--
-- Como a separação é garantida:
--
--  1. A CONTA DO GOOGLE É UMA SÓ, E NINGUÉM DOS SETORES TOCA NELA. A Redação
--     guarda a autorização (refresh token) no cofre (Vault), lida só pelo
--     servidor. Ninguém recebe senha da conta nem acesso à caixa inteira.
--
--  2. O REMETENTE E A ASSINATURA VÊM DO BANCO, NUNCA DA TELA. Quem escreve
--     escolhe uma "caixa" pelo id; o servidor confere se a pessoa é do setor
--     dono daquela caixa, e monta o From e a assinatura a partir da linha da
--     caixa. Não há campo "de" editável nem assinatura editável por quem envia.
--
--  3. AS CAIXAS SÃO OS ALIASES REAIS DO GMAIL. Elas nascem da sincronização
--     com a lista "enviar como" da conta (sendAs), com a assinatura que está
--     configurada lá. Endereço que o Gmail não reconhece como alias não vira
--     caixa — o Gmail trocaria o remetente sem avisar.
--
--  4. TODO ENVIO FICA REGISTRADO, e o registro de um setor só é visível ao
--     próprio setor e aos administradores.
--
-- Escrita pelo servidor (service role), depois de conferir papel e setor em
-- código. As políticas abaixo são só de leitura.

create table if not exists public.setores (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  nome          text not null check (length(trim(nome)) between 2 and 80),
  created_at    timestamptz not null default now()
);
create unique index if not exists setores_nome_idx on public.setores (workspace_id, lower(nome));

create table if not exists public.setor_membros (
  setor_id      uuid not null references public.setores (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (setor_id, user_id)
);
create index if not exists setor_membros_user_idx on public.setor_membros (user_id);
create index if not exists setor_membros_workspace_idx on public.setor_membros (workspace_id);

create table if not exists public.google_conexao (
  workspace_id   uuid primary key references public.workspaces (id) on delete cascade,
  email_conta    text not null,
  estado         text not null default 'ativa' check (estado in ('ativa','expirada')),
  conectada_por  uuid references public.profiles (id) on delete set null,
  conectada_em   timestamptz not null default now(),
  sincronizada_em timestamptz
);

create table if not exists public.caixas_de_email (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  setor_id         uuid references public.setores (id) on delete set null,
  email            text not null check (position('@' in email) > 1),
  nome_exibicao    text not null default '',
  -- A assinatura como está no Gmail (HTML). Só a sincronização a escreve.
  assinatura_html  text not null default '',
  responder_para   text not null default '',
  principal        boolean not null default false,
  -- false quando o alias sumiu do Gmail ou deixou de estar verificado.
  no_gmail         boolean not null default true,
  ativa            boolean not null default true,
  sincronizada_em  timestamptz,
  created_at       timestamptz not null default now()
);
create unique index if not exists caixas_de_email_email_idx on public.caixas_de_email (workspace_id, lower(email));
create index if not exists caixas_de_email_setor_idx on public.caixas_de_email (setor_id);

create table if not exists public.emails_enviados (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  caixa_id          uuid references public.caixas_de_email (id) on delete set null,
  setor_id          uuid references public.setores (id) on delete set null,
  autor_id          uuid references public.profiles (id) on delete set null,
  de                text not null,
  para              text[] not null default '{}',
  cc                text[] not null default '{}',
  assunto           text not null default '',
  corpo             text not null default '',
  estado            text not null check (estado in ('enviado','falhou')),
  erro              text,
  gmail_message_id  text,
  gmail_thread_id   text,
  created_at        timestamptz not null default now()
);
create index if not exists emails_enviados_setor_idx on public.emails_enviados (workspace_id, setor_id, created_at desc);
create index if not exists emails_enviados_caixa_idx on public.emails_enviados (caixa_id);
create index if not exists emails_enviados_autor_idx on public.emails_enviados (autor_id);

-- Quem é do setor — só responde sobre o próprio auth.uid().
create or replace function private.is_setor_member(p_setor_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.setor_membros m
    where m.setor_id = p_setor_id and m.user_id = (select auth.uid())
  );
$$;

alter table public.setores enable row level security;
alter table public.setor_membros enable row level security;
alter table public.google_conexao enable row level security;
alter table public.caixas_de_email enable row level security;
alter table public.emails_enviados enable row level security;

create policy setores_select_member on public.setores
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));

create policy setor_membros_select_member on public.setor_membros
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));

create policy google_conexao_select_member on public.google_conexao
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));

create policy caixas_de_email_select_member on public.caixas_de_email
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));

-- O que um setor enviou é do setor: visível a quem é dele e aos admins.
create policy emails_enviados_select_setor on public.emails_enviados
  for select to authenticated using (
    (select private.is_workspace_member(workspace_id))
    and (
      (select private.workspace_role(workspace_id)) = 'admin'
      or (setor_id is not null and (select private.is_setor_member(setor_id)))
    )
  );
