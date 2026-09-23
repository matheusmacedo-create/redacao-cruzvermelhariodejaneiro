-- Campanhas de e-mail a partir do banco de contatos (Imprensa).
--
-- O banco deixa de ser só de jornalistas: qualquer contato relevante entra, e
-- dele sai disparo com registro de quem abriu — para, com o tempo, ir tirando
-- quem não lê. Quatro decisões:
--
--  1. TUDO FICA REGISTRADO E VISÍVEL. Cada campanha guarda assunto, texto,
--     quem enviou, quando, para quem e o resultado de cada destinatário. Todo
--     membro do espaço lê; é o histórico que a equipe consulta para saber o
--     que já foi enviado e a quem.
--
--  2. ESCRITA SÓ PELO SERVIDOR. Como na newsletter: sem política de escrita
--     para authenticated nas tabelas de campanha. Quem grava é a server
--     action (depois de conferir o espaço e o papel em código) e a rota
--     pública do pixel de abertura, que não tem sessão.
--
--  3. SAÍDA DA LISTA É DIREITO E É PERMANENTE. Cada contato ganha um token de
--     descadastro que não expira. Quem sai não recebe mais nenhuma campanha —
--     o envio filtra no servidor, não na tela.
--
--  4. ABERTURA É ESTIMATIVA. O pixel conta quem carregou a imagem. O Apple
--     Mail pré-carrega tudo (abre sem a pessoa abrir) e clientes com imagem
--     bloqueada nunca contam. Serve para achar quem NUNCA abre ao longo de
--     vários envios, não para afirmar que alguém leu uma mensagem.

alter table public.press_contacts
  add column if not exists token_descadastro   text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  add column if not exists descadastrado_em    timestamptz,
  add column if not exists ultimo_envio_em     timestamptz,
  add column if not exists ultima_abertura_em  timestamptz,
  -- Quantas campanhas seguidas a pessoa recebeu sem abrir. Zera na abertura.
  -- É o número que responde "essa pessoa lê o que mandamos?".
  add column if not exists envios_sem_abertura integer not null default 0,
  add column if not exists total_envios        integer not null default 0,
  add column if not exists total_aberturas     integer not null default 0;

comment on column public.press_contacts.envios_sem_abertura is
  'Campanhas seguidas recebidas sem abertura registrada. Zera quando abre. Estimativa: ver nota 4 da migração de campanhas.';

create unique index if not exists press_contacts_descadastro_idx
  on public.press_contacts (token_descadastro);

alter table public.press_contacts drop constraint if exists press_contacts_fonte_check;
alter table public.press_contacts add constraint press_contacts_fonte_check
  check (fonte in ('manual','hunter_dominio','hunter_email_finder','importado'));

comment on table public.press_contacts is
  'Banco de contatos (imprensa e demais contatos relevantes). Guarda, qualifica e recebe campanhas — ver cvrj_campanhas_de_imprensa.';

create table if not exists public.press_campanhas (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,

  assunto             text not null,
  corpo               text not null,
  link_url            text not null default '',
  link_rotulo         text not null default '',

  estado              text not null default 'enviando'
                      check (estado in ('enviando','enviada','parcial','falhou')),
  total_destinatarios integer not null default 0,
  total_enviados      integer not null default 0,
  total_falhas        integer not null default 0,
  -- Destinatários distintos com abertura registrada — não soma de aberturas.
  total_aberturas     integer not null default 0,

  enviada_por         uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  concluida_em        timestamptz
);

comment on table public.press_campanhas is
  'Campanhas enviadas a partir do banco de contatos. Histórico visível a todo o espaço; escrita só pelo servidor.';

create index if not exists press_campanhas_workspace_idx
  on public.press_campanhas (workspace_id, created_at desc);
create index if not exists press_campanhas_enviada_por_idx
  on public.press_campanhas (enviada_por);

create table if not exists public.press_campanha_destinatarios (
  id            uuid primary key default gen_random_uuid(),
  campanha_id   uuid not null references public.press_campanhas (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  -- set null: apagar o contato não pode apagar o registro de que a
  -- mensagem saiu para aquele endereço.
  contato_id    uuid references public.press_contacts (id) on delete set null,
  email         text not null,
  nome          text not null default '',

  estado        text not null check (estado in ('enviado','falhou')),
  erro          text,
  enviado_em    timestamptz,

  -- O token do pixel é próprio, e não o id da linha: o endereço do pixel sai
  -- em todo e-mail, e o id é o que as telas usam.
  token_abertura text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  aberto_em     timestamptz,
  aberturas     integer not null default 0,

  created_at    timestamptz not null default now()
);

comment on table public.press_campanha_destinatarios is
  'Um destinatário de uma campanha: se saiu, e se (e quando) abriu. Escrita só pelo servidor.';

create unique index if not exists press_campanha_destinatarios_token_idx
  on public.press_campanha_destinatarios (token_abertura);
create index if not exists press_campanha_destinatarios_campanha_idx
  on public.press_campanha_destinatarios (campanha_id);
create index if not exists press_campanha_destinatarios_contato_idx
  on public.press_campanha_destinatarios (contato_id);
create index if not exists press_campanha_destinatarios_workspace_idx
  on public.press_campanha_destinatarios (workspace_id);

alter table public.press_campanhas enable row level security;
alter table public.press_campanha_destinatarios enable row level security;

create policy press_campanhas_select_member on public.press_campanhas
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create policy press_campanha_destinatarios_select_member on public.press_campanha_destinatarios
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

-- A abertura, registrada de uma vez: linha do destinatário, contagem da
-- campanha (só na PRIMEIRA abertura daquele destinatário) e o contato (zera
-- a sequência sem abertura). Função para que a rota pública faça tudo numa
-- transação, sem três idas e voltas — e sem ler nada que devolva ao público.
create or replace function public.registrar_abertura_de_campanha(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linha public.press_campanha_destinatarios%rowtype;
begin
  update public.press_campanha_destinatarios
     set aberturas = aberturas + 1,
         aberto_em = coalesce(aberto_em, now())
   where token_abertura = p_token
  returning * into v_linha;

  if not found then
    return;
  end if;

  if v_linha.aberturas = 1 then
    update public.press_campanhas
       set total_aberturas = total_aberturas + 1
     where id = v_linha.campanha_id;

    if v_linha.contato_id is not null then
      update public.press_contacts
         set total_aberturas = total_aberturas + 1,
             envios_sem_abertura = 0,
             ultima_abertura_em = now()
       where id = v_linha.contato_id;
    end if;
  end if;
end;
$$;

comment on function public.registrar_abertura_de_campanha is
  'Registra a abertura de uma campanha pelo token do pixel. Executável só pela service_role (rota pública do pixel).';

revoke all on function public.registrar_abertura_de_campanha(text) from public;
revoke execute on function public.registrar_abertura_de_campanha(text) from anon;
revoke execute on function public.registrar_abertura_de_campanha(text) from authenticated;
grant execute on function public.registrar_abertura_de_campanha(text) to service_role;
