-- ============================================================
-- Chamados: solicitações entre setores (TI, Manutenção e outras filas).
-- O modelo e as referências estão em docs/CHAMADOS.md.
--
-- Escrita SÓ pelo servidor (service role, nas actions de app/actions/
-- chamados.ts): a máquina de estados, a prioridade, os prazos de SLA e a
-- numeração são regras de negócio, e nenhuma delas pode ser contornada pela
-- Data API. Leitura por RLS: quem abriu vê o seu chamado; a equipe da fila
-- vê os da fila; nota interna e seus anexos, só a equipe.
--
-- Só acrescenta (ARQUITETURA §10.1).
-- ============================================================

-- ---------- filas (TI, Manutenção…) ----------
create table if not exists public.chamado_filas (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  slug             text not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  nome             text not null check (length(trim(nome)) between 2 and 60),
  descricao        text,
  prefixo          text not null check (prefixo ~ '^[A-Z]{2,6}$'),
  icone            text not null default 'ticket',
  ativa            boolean not null default true,
  ordem            integer not null default 0,
  -- Fila que atende 24h conta o SLA em horas corridas; as outras, em
  -- horário de atendimento (seg–sex, 8h–18h, Brasília).
  atendimento_24h  boolean not null default false,
  -- { "critica": {"resposta": 1, "solucao": 4}, ... } em horas. Vazio = padrão.
  sla              jsonb not null default '{}'::jsonb,
  ultimo_numero    integer not null default 0,
  criado_em        timestamptz not null default now(),
  unique (workspace_id, slug),
  unique (workspace_id, prefixo)
);

-- Quem atende cada fila. Admin do espaço atende todas sem estar aqui.
create table if not exists public.chamado_fila_membros (
  fila_id      uuid not null references public.chamado_filas (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  criado_em    timestamptz not null default now(),
  primary key (fila_id, user_id)
);
create index if not exists chamado_fila_membros_user_idx on public.chamado_fila_membros (user_id);
create index if not exists chamado_fila_membros_ws_idx on public.chamado_fila_membros (workspace_id);

-- ---------- catálogo (categorias por fila) ----------
create table if not exists public.chamado_categorias (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  fila_id      uuid not null references public.chamado_filas (id) on delete cascade,
  nome         text not null check (length(trim(nome)) between 2 and 80),
  descricao    text,
  tipo         text not null default 'solicitacao' check (tipo in ('incidente', 'solicitacao')),
  pede_local   boolean not null default false,
  ativa        boolean not null default true,
  ordem        integer not null default 0,
  criado_em    timestamptz not null default now()
);
create index if not exists chamado_categorias_fila_idx on public.chamado_categorias (fila_id);
create index if not exists chamado_categorias_ws_idx on public.chamado_categorias (workspace_id);

-- ---------- chamados ----------
create table if not exists public.chamados (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces (id) on delete cascade,
  fila_id               uuid not null references public.chamado_filas (id) on delete restrict,
  categoria_id          uuid references public.chamado_categorias (id) on delete set null,
  numero                integer not null,
  codigo                text not null,
  tipo                  text not null check (tipo in ('incidente', 'solicitacao')),
  titulo                text not null check (length(trim(titulo)) between 3 and 140),
  descricao             text not null check (length(descricao) between 1 and 10000),
  local                 text check (local is null or length(local) <= 140),
  urgencia              smallint not null check (urgencia between 1 and 3),
  impacto               smallint not null default 1 check (impacto between 1 and 3),
  prioridade            text not null check (prioridade in ('baixa', 'media', 'alta', 'critica')),
  status                text not null default 'novo'
                        check (status in ('novo','em_atendimento','aguardando_solicitante','aguardando_terceiro','resolvido','fechado','cancelado')),
  solicitante_id        uuid references public.profiles (id) on delete set null,
  setor_solicitante     text,
  responsavel_id        uuid references public.profiles (id) on delete set null,
  prazo_resposta        timestamptz,
  prazo_solucao         timestamptz,
  respondido_em         timestamptz,
  pausado_desde         timestamptz,
  -- Minutos de atendimento parados em "aguardando" (JSM: pausa do SLA). Os
  -- prazos são sempre abertura + SLA + este total, então mudar a
  -- prioridade recalcula tudo sem perder as pausas.
  minutos_pausados      integer not null default 0 check (minutos_pausados >= 0),
  resolvido_em          timestamptz,
  fechado_em            timestamptz,
  solucao               text check (solucao is null or length(solucao) <= 5000),
  avaliacao             smallint check (avaliacao between 1 and 5),
  avaliacao_comentario  text check (avaliacao_comentario is null or length(avaliacao_comentario) <= 1000),
  reaberturas           integer not null default 0,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  unique (fila_id, numero)
);
create index if not exists chamados_ws_status_idx     on public.chamados (workspace_id, status);
create index if not exists chamados_fila_status_idx   on public.chamados (fila_id, status);
create index if not exists chamados_solicitante_idx   on public.chamados (solicitante_id);
create index if not exists chamados_responsavel_idx   on public.chamados (responsavel_id);
create index if not exists chamados_categoria_idx     on public.chamados (categoria_id);
create index if not exists chamados_codigo_idx        on public.chamados (workspace_id, codigo);

-- Numeração por fila (TI-0001, TI-0002…), atômica: o UPDATE do contador
-- trava a linha da fila, e dois chamados simultâneos nunca pegam o mesmo número.
-- Transferir de fila renumera na fila de destino (o código antigo fica no
-- histórico do chamado).
create or replace function private.numerar_chamado()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  n integer;
  p text;
begin
  if tg_op = 'UPDATE' and new.fila_id = old.fila_id then return new; end if;
  update public.chamado_filas set ultimo_numero = ultimo_numero + 1
  where id = new.fila_id returning ultimo_numero, prefixo into n, p;
  if n is null then raise exception 'Fila de chamados inexistente.'; end if;
  new.numero := n;
  new.codigo := p || '-' || lpad(n::text, 4, '0');
  return new;
end;
$$;
revoke all on function private.numerar_chamado() from public, anon, authenticated;

drop trigger if exists chamados_numerar on public.chamados;
create trigger chamados_numerar before insert or update of fila_id on public.chamados
  for each row execute function private.numerar_chamado();

-- ---------- conversa e histórico ----------
create table if not exists public.chamado_interacoes (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  chamado_id   uuid not null references public.chamados (id) on delete cascade,
  autor_id     uuid references public.profiles (id) on delete set null,
  -- comentario: visível a quem abriu; nota_interna: só a equipe;
  -- evento: mudança registrada pelo sistema (status, responsável…).
  tipo         text not null check (tipo in ('comentario', 'nota_interna', 'evento')),
  texto        text check (texto is null or length(texto) <= 10000),
  dados        jsonb not null default '{}'::jsonb,
  criado_em    timestamptz not null default now()
);
create index if not exists chamado_interacoes_chamado_idx on public.chamado_interacoes (chamado_id, criado_em);
create index if not exists chamado_interacoes_autor_idx   on public.chamado_interacoes (autor_id);
create index if not exists chamado_interacoes_ws_idx      on public.chamado_interacoes (workspace_id);

create table if not exists public.chamado_anexos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  chamado_id    uuid not null references public.chamados (id) on delete cascade,
  interacao_id  uuid references public.chamado_interacoes (id) on delete set null,
  nome          text not null check (length(nome) between 1 and 200),
  content_type  text not null,
  tamanho       bigint not null check (tamanho > 0),
  storage_path  text not null unique,
  -- Anexo de nota interna: some para quem abriu, como a nota.
  interno       boolean not null default false,
  enviado_por   uuid references public.profiles (id) on delete set null,
  criado_em     timestamptz not null default now()
);
create index if not exists chamado_anexos_chamado_idx on public.chamado_anexos (chamado_id);
create index if not exists chamado_anexos_interacao_idx on public.chamado_anexos (interacao_id);
create index if not exists chamado_anexos_autor_idx on public.chamado_anexos (enviado_por);
create index if not exists chamado_anexos_ws_idx on public.chamado_anexos (workspace_id);

-- ============================================================
-- RLS
-- ============================================================

-- Atendo esta fila? (membro da fila, ou admin do espaço). Passa por
-- is_workspace_member: conta desativada e 2FA pendente não atendem nada.
create or replace function private.atende_fila(p_fila_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.chamado_filas f
    where f.id = p_fila_id
      and private.is_workspace_member(f.workspace_id)
      and (
        private.workspace_role(f.workspace_id) = 'admin'
        or exists (select 1 from public.chamado_fila_membros m where m.fila_id = f.id and m.user_id = (select auth.uid()))
      )
  );
$$;

-- Vejo este chamado? (abri, ou atendo a fila dele)
create or replace function private.ve_chamado(p_chamado_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.chamados c
    where c.id = p_chamado_id
      and private.is_workspace_member(c.workspace_id)
      and (c.solicitante_id = (select auth.uid()) or private.atende_fila(c.fila_id))
  );
$$;

create or replace function private.atende_chamado(p_chamado_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (select 1 from public.chamados c where c.id = p_chamado_id and private.atende_fila(c.fila_id));
$$;

revoke all on function private.atende_fila(uuid)    from public, anon;
revoke all on function private.ve_chamado(uuid)     from public, anon;
revoke all on function private.atende_chamado(uuid) from public, anon;
grant execute on function private.atende_fila(uuid)    to authenticated;
grant execute on function private.ve_chamado(uuid)     to authenticated;
grant execute on function private.atende_chamado(uuid) to authenticated;

alter table public.chamado_filas        enable row level security;
alter table public.chamado_fila_membros enable row level security;
alter table public.chamado_categorias   enable row level security;
alter table public.chamados             enable row level security;
alter table public.chamado_interacoes   enable row level security;
alter table public.chamado_anexos       enable row level security;

drop policy if exists chamado_filas_select on public.chamado_filas;
create policy chamado_filas_select on public.chamado_filas for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

drop policy if exists chamado_fila_membros_select on public.chamado_fila_membros;
create policy chamado_fila_membros_select on public.chamado_fila_membros for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

drop policy if exists chamado_categorias_select on public.chamado_categorias;
create policy chamado_categorias_select on public.chamado_categorias for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

drop policy if exists chamados_select on public.chamados;
create policy chamados_select on public.chamados for select to authenticated
  using (
    (select private.is_workspace_member(workspace_id))
    and (solicitante_id = (select auth.uid()) or private.atende_fila(fila_id))
  );

drop policy if exists chamado_interacoes_select on public.chamado_interacoes;
create policy chamado_interacoes_select on public.chamado_interacoes for select to authenticated
  using (private.ve_chamado(chamado_id) and (tipo <> 'nota_interna' or private.atende_chamado(chamado_id)));

drop policy if exists chamado_anexos_select on public.chamado_anexos;
create policy chamado_anexos_select on public.chamado_anexos for select to authenticated
  using (private.ve_chamado(chamado_id) and (not interno or private.atende_chamado(chamado_id)));

-- Escrita só pelo service role.
revoke insert, update, delete, truncate on public.chamado_filas, public.chamado_fila_membros, public.chamado_categorias,
  public.chamados, public.chamado_interacoes, public.chamado_anexos from anon, authenticated;
revoke all on public.chamado_filas, public.chamado_fila_membros, public.chamado_categorias,
  public.chamados, public.chamado_interacoes, public.chamado_anexos from anon;
grant select on public.chamado_filas, public.chamado_fila_membros, public.chamado_categorias,
  public.chamados, public.chamado_interacoes, public.chamado_anexos to authenticated;

-- ============================================================
-- Filas e catálogo iniciais (o admin edita em /chamados/configurar)
-- ============================================================
do $$
declare
  w record;
  ti uuid;
  man uuid;
begin
  for w in select id from public.workspaces loop
    insert into public.chamado_filas (workspace_id, slug, nome, descricao, prefixo, icone, ordem)
    values (w.id, 'ti', 'Tecnologia da Informação', 'Computadores, internet, e-mail, acessos, impressoras e sistemas.', 'TI', 'monitor', 1)
    on conflict (workspace_id, slug) do nothing;
    insert into public.chamado_filas (workspace_id, slug, nome, descricao, prefixo, icone, ordem)
    values (w.id, 'manutencao', 'Manutenção', 'Elétrica, hidráulica, ar-condicionado, mobiliário e reparos na sede.', 'MAN', 'wrench', 2)
    on conflict (workspace_id, slug) do nothing;

    select id into ti  from public.chamado_filas where workspace_id = w.id and slug = 'ti';
    select id into man from public.chamado_filas where workspace_id = w.id and slug = 'manutencao';

    if not exists (select 1 from public.chamado_categorias where fila_id = ti) then
      insert into public.chamado_categorias (workspace_id, fila_id, nome, descricao, tipo, pede_local, ordem) values
        (w.id, ti, 'Computador ou notebook', 'Não liga, travando, lento, tela, teclado.', 'incidente', false, 1),
        (w.id, ti, 'Internet ou Wi-Fi', 'Sem conexão, lenta ou caindo.', 'incidente', true, 2),
        (w.id, ti, 'E-mail e acessos', 'Criar conta, senha bloqueada, permissão em pasta ou sistema.', 'solicitacao', false, 3),
        (w.id, ti, 'Impressora ou scanner', 'Não imprime, papel preso, toner.', 'incidente', true, 4),
        (w.id, ti, 'Instalar programa', 'Instalação ou atualização de software.', 'solicitacao', false, 5),
        (w.id, ti, 'Equipamento novo', 'Computador, periférico, celular ou linha.', 'solicitacao', false, 6),
        (w.id, ti, 'Sistemas e site', 'Redação, site institucional e demais sistemas.', 'incidente', false, 7),
        (w.id, ti, 'Outro assunto de TI', null, 'solicitacao', false, 99);
    end if;

    if not exists (select 1 from public.chamado_categorias where fila_id = man) then
      insert into public.chamado_categorias (workspace_id, fila_id, nome, descricao, tipo, pede_local, ordem) values
        (w.id, man, 'Elétrica', 'Tomada, lâmpada, disjuntor, falta de energia.', 'incidente', true, 1),
        (w.id, man, 'Hidráulica', 'Vazamento, entupimento, falta de água.', 'incidente', true, 2),
        (w.id, man, 'Ar-condicionado', 'Não gela, pinga, barulho, limpeza.', 'incidente', true, 3),
        (w.id, man, 'Mobiliário', 'Cadeira, mesa, armário, montagem.', 'solicitacao', true, 4),
        (w.id, man, 'Portas, chaves e fechaduras', 'Cópia de chave, fechadura emperrada.', 'solicitacao', true, 5),
        (w.id, man, 'Limpeza e conservação', 'Limpeza extra, pintura, pequenos reparos.', 'solicitacao', true, 6),
        (w.id, man, 'Outro assunto de manutenção', null, 'solicitacao', true, 99);
    end if;
  end loop;
end $$;
