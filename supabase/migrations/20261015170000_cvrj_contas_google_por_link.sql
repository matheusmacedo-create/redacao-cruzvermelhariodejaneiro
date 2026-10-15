-- Contas do Google criadas pelo link (15/10/2026). Só acrescenta.
--
-- A filial ganhou o Google Workspace for Nonprofits e cada pessoa passa a
-- ter a própria conta (nome.sobrenome@), com o endereço do setor como grupo
-- do Google. Para não criar conta por conta no Admin do Google, um
-- administrador gera um link; quem abre o link preenche nome, e-mail
-- desejado, setor, celular e e-mail pessoal, e o Palácio cria a conta na
-- API de Diretório do Google na hora, com senha provisória que o Google
-- obriga a trocar no primeiro acesso.
--
-- 1. google_admin_conexao: a conta de ADMINISTRADOR do Workspace que
--    autorizou o Palácio a criar usuários e pôr em grupos (escopos
--    admin.directory.*). É outra conexão, separada da do Gmail
--    (google_conexao): a do Gmail é a conta dona dos apelidos (contato@) e
--    não precisa ser administradora; esta precisa. O refresh token mora no
--    cofre (integracoes_chaves, serviço google_admin); aqui só quem e quando.
-- 2. google_convites: os links. No banco vai só o sha-256 do código; o link
--    em si aparece uma vez, para quem gerou. Pode ser de um setor (quem abre
--    já cai no setor) ou de qualquer setor (a pessoa escolhe). Vence, tem
--    limite de usos e pode ser revogado.
-- 3. google_contas: cada conta criada pelo link, para a tela de
--    acompanhamento e para o limite por IP (hash com sal, como em
--    pedidos_de_recuperacao). Senha nunca é gravada.
--
-- Escrita só pelo servidor (service role), depois das conferências em
-- app/actions/google-contas.ts. Leitura: só administradores.

create table if not exists public.google_admin_conexao (
  workspace_id   uuid primary key references public.workspaces (id) on delete cascade,
  email_conta    text not null,
  estado         text not null default 'ativa' check (estado in ('ativa','expirada')),
  conectada_por  uuid references public.profiles (id) on delete set null,
  conectada_em   timestamptz not null default now()
);
comment on table public.google_admin_conexao is
  'A conta de administrador do Google Workspace que autorizou o Palácio a criar usuários e pôr em grupos (API de Diretório). Separada da conexão do Gmail.';

create table if not exists public.google_convites (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  token_hash    text not null unique,
  setor_id      uuid references public.setores (id) on delete set null,
  rotulo        text not null default '',
  criado_por    uuid references public.profiles (id) on delete set null,
  expira_em     timestamptz not null,
  max_usos      integer not null default 30 check (max_usos between 1 and 500),
  usos          integer not null default 0 check (usos >= 0),
  revogado_em   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists google_convites_workspace_idx on public.google_convites (workspace_id, created_at desc);
comment on table public.google_convites is
  'Links para a pessoa criar a própria conta do Google. Só o hash do código fica aqui; setor_id nulo = a pessoa escolhe o setor.';

create table if not exists public.google_contas (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  convite_id    uuid references public.google_convites (id) on delete set null,
  email         text not null check (position('@' in email) > 1),
  nome          text not null,
  setor_id      uuid references public.setores (id) on delete set null,
  grupo_email   text,
  grupo_ok      boolean not null default false,
  google_id     text,
  ip_hash       text not null,
  created_at    timestamptz not null default now()
);
create index if not exists google_contas_workspace_idx on public.google_contas (workspace_id, created_at desc);
create index if not exists google_contas_ip_idx on public.google_contas (ip_hash, created_at desc);
comment on table public.google_contas is
  'Contas do Google criadas pelo link: quem, quando, por qual convite e se entrou no grupo do setor. grupo_ok falso = o endereço do setor ainda é apelido, não grupo.';

alter table public.google_admin_conexao enable row level security;
alter table public.google_admin_conexao force row level security;
alter table public.google_convites enable row level security;
alter table public.google_convites force row level security;
alter table public.google_contas enable row level security;
alter table public.google_contas force row level security;
revoke all on table public.google_admin_conexao from anon;
revoke all on table public.google_convites from anon;
revoke all on table public.google_contas from anon;

drop policy if exists google_admin_conexao_select_admin on public.google_admin_conexao;
create policy google_admin_conexao_select_admin on public.google_admin_conexao
  for select to authenticated using ((select private.workspace_role(workspace_id)) = 'admin');
drop policy if exists google_convites_select_admin on public.google_convites;
create policy google_convites_select_admin on public.google_convites
  for select to authenticated using ((select private.workspace_role(workspace_id)) = 'admin');
drop policy if exists google_contas_select_admin on public.google_contas;
create policy google_contas_select_admin on public.google_contas
  for select to authenticated using ((select private.workspace_role(workspace_id)) = 'admin');
