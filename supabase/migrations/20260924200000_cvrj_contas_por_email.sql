-- ============================================================
-- Conta por e-mail: e-mail de contato confirmado, links de uso único
-- (convite, redefinição de senha, confirmação de e-mail) e limite de pedidos
-- de "esqueci minha senha".
--
-- O login continua por usuário: o e-mail do Auth segue sendo o interno
-- (usuario@usuarios.cvrj.local). O e-mail daqui é só para onde vão os avisos
-- e os links — por isso mora no perfil, e só vale depois de confirmado.
--
-- Só acrescenta (ARQUITETURA §10.1).
-- ============================================================

alter table public.profiles
  add column if not exists email               text,
  add column if not exists email_confirmado_em timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_email_formato') then
    alter table public.profiles add constraint profiles_email_formato
      check (email is null or (length(email) <= 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));
  end if;
end $$;

-- Um endereço, uma conta: senão o "esqueci minha senha" por e-mail não teria
-- como saber de quem é o pedido.
create unique index if not exists profiles_email_unico on public.profiles (lower(email)) where email is not null;

comment on column public.profiles.email is
  'E-mail de contato: recebe links de senha e avisos de segurança. Só muda por confirmação (link enviado ao novo endereço). Não é o e-mail do login.';

-- O e-mail NÃO entra no grant de update por coluna de 20260924160000: a
-- própria pessoa não troca direto pela Data API, só pelo fluxo de confirmação
-- (service role). Senão bastaria uma sessão roubada para desviar os links de
-- senha para outro endereço.

-- ============================================================
-- Links de uso único
--
-- Guarda só o HASH (sha-256) do código que vai no link: quem lê o banco não
-- consegue usar um link pendente. Consumir é um UPDATE condicional
-- (usado_em is null and expira_em > now()), então dois cliques simultâneos
-- não usam o mesmo link duas vezes.
-- ============================================================
create table if not exists public.tokens_de_conta (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  finalidade   text not null check (finalidade in ('definir_senha', 'redefinir_senha', 'confirmar_email')),
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  email        text,
  criado_por   uuid references public.profiles (id) on delete set null,
  criado_em    timestamptz not null default now(),
  expira_em    timestamptz not null,
  usado_em     timestamptz
);
create index if not exists tokens_de_conta_pendentes_idx on public.tokens_de_conta (user_id, finalidade) where usado_em is null;
create index if not exists tokens_de_conta_criado_por_idx on public.tokens_de_conta (criado_por);

-- Pedidos de "esqueci minha senha", por origem (hash do IP, nunca o IP).
-- Serve só para frear quem tenta disparar e-mail em massa pela tela pública.
create table if not exists public.pedidos_de_recuperacao (
  id        bigint generated always as identity primary key,
  ip_hash   text not null,
  criado_em timestamptz not null default now()
);
create index if not exists pedidos_de_recuperacao_ip_idx on public.pedidos_de_recuperacao (ip_hash, criado_em desc);

-- Só o service role (as actions) lê e escreve. RLS ligado e nenhuma policy:
-- a Data API não enxerga nada, mesmo que o grant voltasse por engano.
alter table public.tokens_de_conta enable row level security;
alter table public.pedidos_de_recuperacao enable row level security;
revoke all on public.tokens_de_conta from anon, authenticated;
revoke all on public.pedidos_de_recuperacao from anon, authenticated;
