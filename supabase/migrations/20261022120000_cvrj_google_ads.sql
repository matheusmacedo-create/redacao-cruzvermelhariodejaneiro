-- ============================================================
-- Google Ads: a conexão da conta do Ad Grants da filial (22/10/2026)
--
-- Só acrescenta (ARQUITETURA §10.1). O código funciona sem esta migração:
-- sem a tabela, o cartão "7. Google Ads" em Configurações › E-mail dos
-- setores avisa que falta a migração e não mostra o botão de conectar.
-- Nada muda para quem não conectar o Google Ads.
--
--  google_ads_conexao: a conta Google que autorizou o Palácio a mexer no
--  Google Ads (escopo adwords), no padrão da google_drive_conexao
--  (20261019030000). O refresh token mora no cofre (integracoes_chaves,
--  serviço google_ads); aqui só quem, quando, o estado, as contas de anúncios
--  que a autorização alcança, a escolhida (customer_id, os 10 dígitos sem
--  traços) e a campanha criada pelo Palácio. Leitura: só administradores.
--  Escrita: só o servidor (a volta do consentimento, a escolha da conta, a
--  criação da campanha e o "Desconectar", depois de conferir
--  integracoes.configurar).
-- ============================================================

create table if not exists public.google_ads_conexao (
  workspace_id       uuid primary key references public.workspaces (id) on delete cascade,
  email_conta        text not null check (char_length(email_conta) between 1 and 200),
  estado             text not null default 'ativa' check (estado in ('ativa','expirada')),
  customer_id        text check (customer_id is null or customer_id ~ '^[0-9]{10}$'),
  contas_acessiveis  text[] not null default '{}' check (cardinality(contas_acessiveis) <= 50),
  campanha_recurso   text check (campanha_recurso is null or campanha_recurso ~ '^customers/[0-9]{10}/campaigns/[0-9]+$'),
  campanha_criada_em timestamptz,
  conectada_por      uuid references public.profiles (id) on delete set null,
  conectada_em       timestamptz not null default now()
);
comment on table public.google_ads_conexao is
  'A conta Google que autorizou o Palácio a mexer no Google Ads (escopo adwords), a conta de anúncios escolhida (o Ad Grants da filial) e a campanha criada pelo Palácio. O refresh token fica no cofre (google_ads). Separada das conexões do Gmail, de administrador e do Drive.';

alter table public.google_ads_conexao enable row level security;
alter table public.google_ads_conexao force row level security;
revoke all on table public.google_ads_conexao from anon;
revoke insert, update, delete, truncate, references, trigger on table public.google_ads_conexao from authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'google_ads_conexao' and policyname = 'google_ads_conexao_select_admin') then
    create policy google_ads_conexao_select_admin on public.google_ads_conexao
      for select to authenticated using ((select private.workspace_role(workspace_id)) = 'admin');
  end if;
end $$;
