-- Registro de acessos (docs/registro-de-acessos.md): quem entrou, quando, de onde e com qual
-- aparelho — na Redação (equipe, inclusive a da escola) e na Área do Voluntário.
--
-- Só acréscimos. Três tabelas:
--  - acessos_leitores: quem pode ver o registro. Decisão do Matheus (25/09/2026): só ele.
--  - acessos_aparelhos: cada aparelho reconhecido de cada conta da equipe (cookie + assinatura +
--    impressão digital do navegador). Voluntários não têm aparelho registrado: sem fingerprint.
--  - acessos_eventos: cada entrada, tentativa errada, bloqueio, verificação em duas etapas e saída.
--
-- Escrita só pelo servidor (chave de serviço, depois das conferências da aplicação); leitura só
-- por quem está em acessos_leitores. Ninguém atualiza nem apaga evento pela aplicação.
-- Retenção: por decisão do Matheus, por enquanto guarda tudo (sem rotina de limpeza).

create table if not exists public.acessos_leitores (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  criado_em    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
comment on table public.acessos_leitores is 'Quem pode ver o registro de acessos (docs/registro-de-acessos.md).';

create table if not exists public.acessos_aparelhos (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  tipo_de_conta  text not null check (tipo_de_conta in ('equipe', 'voluntario')),
  conta_id       uuid not null,
  cookie_hash    text not null check (length(cookie_hash) = 64),
  assinatura     text check (assinatura is null or length(assinatura) = 64),
  impressao      text check (impressao is null or length(impressao) = 64),
  rotulo         text not null default '' check (length(rotulo) <= 200),
  primeiro_em    timestamptz not null default now(),
  ultimo_em      timestamptz not null default now(),
  ultimo_ip      inet,
  ultima_cidade  text check (ultima_cidade is null or length(ultima_cidade) <= 200),
  unique (tipo_de_conta, conta_id, cookie_hash)
);
comment on table public.acessos_aparelhos is 'Aparelhos reconhecidos de cada conta: cookie (hash), assinatura e impressão digital do navegador.';
create index if not exists acessos_aparelhos_conta_idx on public.acessos_aparelhos (conta_id, ultimo_em desc);

create table if not exists public.acessos_eventos (
  id                 bigint generated always as identity primary key,
  ocorrido_em        timestamptz not null default now(),
  workspace_id       uuid references public.workspaces (id) on delete cascade,
  evento             text not null check (evento in (
                       'entrada', 'entrada_falhou', 'entrada_bloqueada', 'mfa_ok', 'mfa_falhou',
                       'codigo_pedido', 'saida')),
  tipo_de_conta      text not null check (tipo_de_conta in ('equipe', 'voluntario')),
  conta_id           uuid,
  identificador_hash text check (identificador_hash is null or length(identificador_hash) = 64),
  ip                 inet,
  pais               text check (pais is null or length(pais) <= 8),
  estado             text check (estado is null or length(estado) <= 16),
  cidade             text check (cidade is null or length(cidade) <= 200),
  latitude           double precision,
  longitude          double precision,
  fuso               text check (fuso is null or length(fuso) <= 64),
  user_agent         text check (user_agent is null or length(user_agent) <= 400),
  navegador          text check (navegador is null or length(navegador) <= 60),
  sistema            text check (sistema is null or length(sistema) <= 60),
  dispositivo        text check (dispositivo is null or dispositivo in ('computador', 'celular', 'tablet')),
  aparelho_id        uuid references public.acessos_aparelhos (id) on delete set null,
  sinais             jsonb not null default '{}'::jsonb,
  impressao          text check (impressao is null or length(impressao) = 64),
  sinais_de_risco    text[] not null default '{}',
  motivo             text check (motivo is null or length(motivo) <= 200)
);
comment on table public.acessos_eventos is 'Cada entrada, tentativa, bloqueio, verificação e saída, com local aproximado e aparelho.';
create index if not exists acessos_eventos_ws_idx on public.acessos_eventos (workspace_id, ocorrido_em desc);
create index if not exists acessos_eventos_conta_idx on public.acessos_eventos (conta_id, ocorrido_em desc);
create index if not exists acessos_eventos_identificador_idx on public.acessos_eventos (identificador_hash, ocorrido_em desc) where identificador_hash is not null;
create index if not exists acessos_eventos_ip_idx on public.acessos_eventos (ip, ocorrido_em desc) where ip is not null;
create index if not exists acessos_eventos_aparelho_idx on public.acessos_eventos (aparelho_id) where aparelho_id is not null;

alter table public.acessos_leitores enable row level security;
alter table public.acessos_aparelhos enable row level security;
alter table public.acessos_eventos enable row level security;

revoke all on public.acessos_leitores, public.acessos_aparelhos, public.acessos_eventos from anon;
revoke insert, update, delete, truncate on public.acessos_leitores, public.acessos_aparelhos, public.acessos_eventos from authenticated;
grant select on public.acessos_leitores, public.acessos_aparelhos, public.acessos_eventos to authenticated;

-- Quem lê enxerga a própria linha de leitor (é o que as outras políticas consultam).
drop policy if exists acessos_leitores_select on public.acessos_leitores;
create policy acessos_leitores_select on public.acessos_leitores
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists acessos_aparelhos_select on public.acessos_aparelhos;
create policy acessos_aparelhos_select on public.acessos_aparelhos
  for select to authenticated using (exists (
    select 1 from public.acessos_leitores l
     where l.workspace_id = acessos_aparelhos.workspace_id and l.user_id = (select auth.uid())));

drop policy if exists acessos_eventos_select on public.acessos_eventos;
create policy acessos_eventos_select on public.acessos_eventos
  for select to authenticated using (exists (
    select 1 from public.acessos_leitores l
     where l.workspace_id = acessos_eventos.workspace_id and l.user_id = (select auth.uid())));

-- O leitor decidido em 25/09/2026. Onde o usuário não existe (banco local), não insere nada.
insert into public.acessos_leitores (workspace_id, user_id)
select w.id, p.id
  from public.workspaces w
  join public.workspace_members m on m.workspace_id = w.id
  join public.profiles p on p.id = m.user_id
 where p.username = 'matheus.macedo' and m.role = 'admin'
on conflict do nothing;
