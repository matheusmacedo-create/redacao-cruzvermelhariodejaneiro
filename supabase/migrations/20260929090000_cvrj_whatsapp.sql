-- ============================================================
-- WhatsApp do Palácio Virtual (Evolution API)
--
-- Só acrescenta (ARQUITETURA §10.1). O código anterior não lê nada daqui.
--
--  - whatsapp_contas: o número de WhatsApp CONFIRMADO de cada pessoa, para
--    onde vão os avisos. Fica fora de `profiles` de propósito: o perfil é
--    visível para todo o espaço (diretório), e o celular pessoal não precisa
--    ser. Cada pessoa só lê a própria linha; escrita só pelo service role
--    (as actions), depois da confirmação por código.
--  - whatsapp_codigos: o código de 6 dígitos que confirma o número. Guarda só
--    o hash, com prazo e limite de tentativas. Ninguém lê pela Data API.
--  - whatsapp_mensagens: registro do que entrou e saiu (sem o texto das
--    mensagens recebidas: só o comando que o bot reconheceu). Serve para a
--    tela de conexão mostrar falhas e para não responder duas vezes a mesma
--    mensagem (a Evolution reentrega o webhook quando demora).
--  - notifications.whatsapp_em: quando o aviso saiu pelo WhatsApp. Como o
--    email_em, é o que segura "no mesmo link, no máximo uma mensagem a cada
--    15 minutos".
--  - notificacao_preferencias.whatsapp: categoria → true/false. Categoria
--    ausente = padrão do código (lib/whatsapp/regras.ts).
-- ============================================================

create table if not exists public.whatsapp_contas (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  -- Só dígitos, com o 55 e o nono dígito do celular (lib/whatsapp/regras.ts,
  -- numeroCanonico). É assim que o webhook reconhece quem escreveu.
  numero        text not null check (numero ~ '^[0-9]{10,15}$'),
  confirmado_em timestamptz not null default now(),
  -- A pessoa mandou "parar" (no WhatsApp ou no perfil): nada sai até voltar.
  pausado_em    timestamptz,
  atualizado_em timestamptz not null default now()
);
-- Um número, uma conta: senão o bot não saberia de quem é a mensagem.
create unique index if not exists whatsapp_contas_numero_unico on public.whatsapp_contas (numero);

alter table public.whatsapp_contas enable row level security;
revoke all on public.whatsapp_contas from anon;
revoke insert, update, delete, truncate, references, trigger on public.whatsapp_contas from authenticated;
grant select on public.whatsapp_contas to authenticated;

drop policy if exists whatsapp_contas_select_own on public.whatsapp_contas;
create policy whatsapp_contas_select_own on public.whatsapp_contas for select to authenticated
  using (user_id = (select auth.uid()));

comment on table public.whatsapp_contas is
  'Número de WhatsApp confirmado por código de cada pessoa (avisos e bot). Escrita só pelo service role, depois da confirmação.';

create table if not exists public.whatsapp_codigos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  numero      text not null check (numero ~ '^[0-9]{10,15}$'),
  codigo_hash text not null check (codigo_hash ~ '^[0-9a-f]{64}$'),
  tentativas  smallint not null default 0 check (tentativas >= 0),
  criado_em   timestamptz not null default now(),
  expira_em   timestamptz not null,
  usado_em    timestamptz
);
create index if not exists whatsapp_codigos_pendentes_idx on public.whatsapp_codigos (user_id, criado_em desc) where usado_em is null;

-- RLS ligado e nenhuma policy: a Data API não enxerga nada.
alter table public.whatsapp_codigos enable row level security;
revoke all on public.whatsapp_codigos from anon, authenticated;

create table if not exists public.whatsapp_mensagens (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  direcao       text not null check (direcao in ('entrada', 'saida')),
  -- aviso (notificar), seguranca (avisos da conta), codigo, bot, teste
  tipo          text not null check (tipo in ('aviso', 'seguranca', 'codigo', 'bot', 'teste')),
  situacao      text not null check (situacao in ('recebida', 'enviada', 'falhou', 'ignorada')),
  numero        text check (numero is null or numero ~ '^[0-9]{8,15}$'),
  user_id       uuid references public.profiles (id) on delete set null,
  -- O id da mensagem no WhatsApp: na entrada, trava a resposta duplicada.
  mensagem_id   text check (mensagem_id is null or length(mensagem_id) <= 128),
  -- Na entrada, só o comando reconhecido (avisos, lidas, parar…), nunca o texto.
  comando       text check (comando is null or length(comando) <= 40),
  notificacao_id uuid references public.notifications (id) on delete set null,
  erro          text check (erro is null or length(erro) <= 500),
  criado_em     timestamptz not null default now()
);
create unique index if not exists whatsapp_mensagens_entrada_unica
  on public.whatsapp_mensagens (workspace_id, mensagem_id) where direcao = 'entrada' and mensagem_id is not null;
create index if not exists whatsapp_mensagens_espaco_idx on public.whatsapp_mensagens (workspace_id, criado_em desc);
create index if not exists whatsapp_mensagens_numero_idx on public.whatsapp_mensagens (numero, criado_em desc);
create index if not exists whatsapp_mensagens_user_idx on public.whatsapp_mensagens (user_id);
create index if not exists whatsapp_mensagens_notificacao_idx on public.whatsapp_mensagens (notificacao_id);

-- Só a administração lê (a tela de conexão); escrita só pelo service role.
alter table public.whatsapp_mensagens enable row level security;
revoke all on public.whatsapp_mensagens from anon;
revoke insert, update, delete, truncate, references, trigger on public.whatsapp_mensagens from authenticated;
grant select on public.whatsapp_mensagens to authenticated;

drop policy if exists whatsapp_mensagens_select_admin on public.whatsapp_mensagens;
create policy whatsapp_mensagens_select_admin on public.whatsapp_mensagens for select to authenticated
  using ((select private.workspace_role(workspace_id)) = 'admin');

alter table public.notifications add column if not exists whatsapp_em timestamptz;

alter table public.notificacao_preferencias add column if not exists whatsapp jsonb not null default '{}'::jsonb;
do $$ begin
  alter table public.notificacao_preferencias add constraint notificacao_preferencias_whatsapp_objeto
    check (jsonb_typeof(whatsapp) = 'object');
exception when duplicate_object then null; end $$;
