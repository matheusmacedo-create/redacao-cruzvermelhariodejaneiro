-- ============================================================
-- WhatsApp: fila de envio, estado da conexão e a categoria "sistema"
--
-- Só acrescenta (ARQUITETURA §10.1). O código anterior não lê nada daqui, e o
-- código novo funciona sem esta migração (envia direto, como antes).
--
--  - whatsapp_fila: o que ainda vai sair pelo WhatsApp — avisos que esperam o
--    fim do horário de silêncio (22h–7h), que passaram do teto por minuto ou
--    que falharam porque o servidor da Evolution estava fora (reenvio com
--    espera crescente). Guarda o texto da mensagem: ninguém lê pela Data API;
--    a tela de conexão mostra só contagens, lidas pelo servidor.
--  - whatsapp_estado: o último estado conhecido da conexão por espaço, para
--    avisar a administração uma vez quando cai e uma vez quando volta.
--  - notifications.categoria ganha "sistema" (o alerta de queda, que vai para
--    o sino e o e-mail dos administradores, nunca pelo WhatsApp).
-- ============================================================

create table if not exists public.whatsapp_fila (
  id             bigint generated always as identity primary key,
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  user_id        uuid references public.profiles (id) on delete cascade,
  numero         text not null check (numero ~ '^[0-9]{10,15}$'),
  texto          text not null check (char_length(texto) between 1 and 4000),
  tipo           text not null check (tipo in ('aviso', 'seguranca', 'bot', 'teste')),
  categoria      text check (categoria is null or char_length(categoria) <= 40),
  -- O link do aviso: não deixa o mesmo aviso entrar duas vezes na fila da mesma pessoa.
  link           text check (link is null or char_length(link) <= 500),
  notificacao_id uuid references public.notifications (id) on delete set null,
  -- silencio: espera as 7h; volume: passou do teto por minuto; falha: reenvio.
  motivo         text not null check (motivo in ('silencio', 'volume', 'falha')),
  enviar_apos    timestamptz not null default now(),
  tentativas     smallint not null default 0 check (tentativas >= 0),
  situacao       text not null default 'pendente' check (situacao in ('pendente', 'processando', 'enviada', 'desistiu')),
  ultimo_erro    text check (ultimo_erro is null or char_length(ultimo_erro) <= 500),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists whatsapp_fila_a_enviar_idx on public.whatsapp_fila (enviar_apos) where situacao = 'pendente';
create index if not exists whatsapp_fila_espaco_idx on public.whatsapp_fila (workspace_id, situacao);
create index if not exists whatsapp_fila_pessoa_link_idx on public.whatsapp_fila (user_id, link) where situacao = 'pendente';
create index if not exists whatsapp_fila_processando_idx on public.whatsapp_fila (atualizado_em) where situacao = 'processando';
create index if not exists whatsapp_fila_notificacao_idx on public.whatsapp_fila (notificacao_id);

-- RLS ligado e nenhuma policy: só o service role (o servidor) lê e escreve.
alter table public.whatsapp_fila enable row level security;
revoke all on public.whatsapp_fila from anon, authenticated;

comment on table public.whatsapp_fila is
  'Mensagens do WhatsApp que ainda vão sair (silêncio 22h–7h, teto por minuto, reenvio após queda). Só o servidor lê e escreve.';

create table if not exists public.whatsapp_estado (
  workspace_id  uuid primary key references public.workspaces (id) on delete cascade,
  estado        text not null check (estado in ('conectado', 'conectando', 'desconectado', 'sem_instancia', 'erro')),
  desde         timestamptz not null default now(),
  -- Quando a administração foi avisada da queda (nulo depois do "voltou").
  alertado_em   timestamptz,
  verificado_em timestamptz not null default now()
);

alter table public.whatsapp_estado enable row level security;
revoke all on public.whatsapp_estado from anon, authenticated;

-- Categoria "sistema" nas notificações (mesmo jeito das migrações anteriores:
-- lê a lista atual do check e acrescenta, sem perder nenhuma).
do $$
declare
  v_def text;
  v_lista text[];
begin
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'public.notifications'::regclass and c.conname = 'notifications_categoria_valida';
  if v_def is null then return; end if;
  if v_def ~ '''\{[a-z_,]*\}''' then
    v_lista := string_to_array(substring(v_def from '''\{([a-z_,]*)\}'''), ',');
  else
    select array_agg(distinct m[1] order by m[1]) into v_lista from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
  end if;
  if coalesce(cardinality(v_lista), 0) = 0 then
    raise exception 'Não consegui ler as categorias de notifications_categoria_valida: %', v_def;
  end if;
  if 'sistema' = any (v_lista) then return; end if;
  v_lista := v_lista || array['sistema'];
  alter table public.notifications drop constraint notifications_categoria_valida;
  execute format('alter table public.notifications add constraint notifications_categoria_valida check (categoria = any (%L::text[]))', v_lista);
end $$;
