-- ============================================================
-- Google Drive: a conexão da filial, a cópia dos envios e os documentos
-- guardados pelo WhatsApp (19/10/2026)
--
-- Só acrescenta (ARQUITETURA §10.1). O código funciona sem esta migração:
-- sem a tabela da conexão, o Drive conta como "sem conexão" — o botão
-- "Conectar Google Drive" avisa que falta a migração, os envios do WhatsApp
-- não são copiados e o documento mandado ao WhatsApp recebe a resposta de
-- sempre. Nada muda para quem não conectar o Drive.
--
--  1. google_drive_conexao: a conta Google que autorizou o Palácio a guardar
--     arquivos no Drive dela (hoje a do contato@), no padrão da
--     google_admin_conexao (20261015170000). Escopo único: drive.file — o
--     Palácio só enxerga o que ele mesmo criou. O refresh token mora no
--     cofre (integracoes_chaves, serviço google_drive); aqui só quem, quando,
--     o estado e a pasta raiz "Palácio – Arquivos" (id e link). Leitura: só
--     administradores. Escrita: só o servidor (a volta do consentimento e o
--     "Desconectar", depois de conferir integracoes.configurar).
--  2. envios.drive_pasta_link e envios.drive_copia_em: a cópia automática do
--     envio que chegou pelo WhatsApp para "Palácio – Arquivos/Envios do
--     WhatsApp/AAAA-MM/<título>". drive_copia_em é a vez de quem copia (outra
--     cópia só começa 15 minutos depois, se a primeira caiu no meio); o link
--     da pasta só é gravado quando todos os arquivos chegaram.
--     envio_arquivos.drive_arquivo_id marca cada arquivo já copiado: a
--     retomada (a rotina diária) não duplica nada.
--  3. whatsapp_pendencias.tipo ganha "guardar_documento" (o documento que
--     chegou ao WhatsApp esperando a pasta do Drive). A lista é lida da
--     restrição em vigor e só ganha o que falta (o bloco de 20261018233000).
--  4. private.whatsapp_permitidas_validas aceita "drive" (o pedido de
--     guardar no Drive, no portão de intenção do assistente, guardado na
--     pergunta e no plano). A função é a mesma de 20261019010000, com um valor
--     a mais na lista: o que valia continua valendo.
-- ============================================================

-- ---------------------------------------------------------------- 1. a conexão do Drive

create table if not exists public.google_drive_conexao (
  workspace_id    uuid primary key references public.workspaces (id) on delete cascade,
  email_conta     text not null check (char_length(email_conta) between 1 and 200),
  estado          text not null default 'ativa' check (estado in ('ativa','expirada')),
  pasta_raiz_id   text check (pasta_raiz_id is null or pasta_raiz_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  pasta_raiz_link text check (pasta_raiz_link is null or (char_length(pasta_raiz_link) <= 500 and pasta_raiz_link like 'https://%')),
  conectada_por   uuid references public.profiles (id) on delete set null,
  conectada_em    timestamptz not null default now()
);
comment on table public.google_drive_conexao is
  'A conta Google que autorizou o Palácio a guardar arquivos no Drive (escopo drive.file: só o que o Palácio criou), com a pasta raiz "Palácio – Arquivos". O refresh token fica no cofre (google_drive). Separada das conexões do Gmail e de administrador.';

alter table public.google_drive_conexao enable row level security;
alter table public.google_drive_conexao force row level security;
revoke all on table public.google_drive_conexao from anon;
revoke insert, update, delete, truncate, references, trigger on table public.google_drive_conexao from authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'google_drive_conexao' and policyname = 'google_drive_conexao_select_admin') then
    create policy google_drive_conexao_select_admin on public.google_drive_conexao
      for select to authenticated using ((select private.workspace_role(workspace_id)) = 'admin');
  end if;
end $$;

-- ---------------------------------------------------------------- 2. a cópia dos envios

alter table public.envios add column if not exists drive_pasta_link text
  check (drive_pasta_link is null or (char_length(drive_pasta_link) <= 500 and drive_pasta_link like 'https://%'));
alter table public.envios add column if not exists drive_copia_em timestamptz;
alter table public.envio_arquivos add column if not exists drive_arquivo_id text
  check (drive_arquivo_id is null or drive_arquivo_id ~ '^[A-Za-z0-9_-]{10,200}$');

-- A retomada da rotina diária: os envios do WhatsApp concluídos sem a cópia terminada.
create index if not exists envios_drive_pendente_idx on public.envios (concluido_em)
  where drive_pasta_link is null and concluido_em is not null and user_agent = 'WhatsApp (bot do Palácio Virtual)';

comment on column public.envios.drive_pasta_link is
  'A pasta do envio no Google Drive (Palácio – Arquivos/Envios do WhatsApp/AAAA-MM/<título>), gravada quando todos os arquivos foram copiados. Só o servidor grava.';
comment on column public.envios.drive_copia_em is
  'Quando a cópia para o Drive começou (a vez de quem copia; outra só depois de 15 minutos).';
comment on column public.envio_arquivos.drive_arquivo_id is
  'O arquivo já copiado para o Google Drive (o id lá): a retomada não copia de novo.';

-- ---------------------------------------------------------------- 3. o tipo novo de pergunta

do $$
declare
  v_nome text;
  v_def text;
  v_lista text[];
  v_novos text[] := array['guardar_documento'];
begin
  if to_regclass('public.whatsapp_pendencias') is null then
    raise notice 'whatsapp_pendencias ausente: nada a ampliar.';
    return;
  end if;
  select c.conname, pg_get_constraintdef(c.oid) into v_nome, v_def
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.conrelid = 'public.whatsapp_pendencias'::regclass and c.contype = 'c' and a.attname = 'tipo'
   limit 1;
  -- Sem restrição no tipo, nada a ampliar.
  if v_def is null then return; end if;
  -- Os dois formatos: o da criação (tipo in (...), lido como ARRAY['a'::text, ...]) e o da reconstrução ('{a,b}'::text[]).
  if v_def ~ '''\{[a-z_,]*\}''' then
    v_lista := string_to_array(substring(v_def from '''\{([a-z_,]*)\}'''), ',');
  else
    select array_agg(distinct m[1] order by m[1]) into v_lista from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
  end if;
  if coalesce(cardinality(v_lista), 0) = 0 then
    raise exception 'Não consegui ler os tipos de whatsapp_pendencias: %', v_def;
  end if;
  if v_lista @> v_novos then return; end if;
  v_lista := array(select distinct x from unnest(v_lista || v_novos) as x order by x);
  execute format('alter table public.whatsapp_pendencias drop constraint %I', v_nome);
  execute format('alter table public.whatsapp_pendencias add constraint whatsapp_pendencias_tipo_check check (tipo = any (%L::text[]))', v_lista);

  comment on table public.whatsapp_pendencias is
    'O passo que falta numa conversa com o bot do WhatsApp (confirmar a conferência, escolher fila e assunto do chamado, resolver ou transferir um chamado, registrar uma visita, a lista das decisões do Financeiro, a conferência do "Não fui eu", a chamada de uma ação, a saída e o retorno de um veículo, a pasta do Drive de um documento). Só o servidor lê e escreve.';
end $$;

-- ---------------------------------------------------------------- 4. "drive" no portão do assistente

create or replace function private.whatsapp_permitidas_validas(p text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(cardinality(p), 0) <= 12 and not exists (
    select 1 from unnest(p) x
     where x is null or x not in ('voto', 'mensagem', 'comentario', 'lidos', 'chamado', 'visita', 'chat',
                                  'atendimento', 'registro_visita', 'financeiro', 'drive'))
$$;
revoke all on function private.whatsapp_permitidas_validas(text[]) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.whatsapp_permitidas_validas(text[]) to service_role;
