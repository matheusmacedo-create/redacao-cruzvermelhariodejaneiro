-- Arquivos do setor (16/10/2026). Só acrescenta.
--
-- Uma central dentro do Palácio onde cada setor organiza as próprias pastas
-- e arquivos, guardados no Google Drive da filial. O Drive é o armazenamento;
-- quem vê o quê é o Palácio que decide (lib/arquivos/servidor.ts): a pessoa
-- abre a pasta dos setores de que faz parte (setor_membros), e quem tem
-- arquivos.todos_os_setores abre todas.
--
-- 1. drive_conexao: a conta Google que autorizou o Palácio a ler e escrever
--    no Drive (escopo drive) e a pasta raiz escolhida, de onde saem as
--    pastas dos setores. É uma terceira conexão, separada da do Gmail
--    (google_conexao) e da de administrador (google_admin_conexao): quem
--    guarda os arquivos não precisa ser administradora do Workspace. O
--    refresh token mora no cofre (integracoes_chaves, serviço google_drive);
--    aqui só quem, quando e onde.
-- 2. drive_pastas_dos_setores: a pasta de cada setor dentro da raiz,
--    lembrada pelo id (renomear no Drive não quebra nada). Criada na
--    primeira vez que alguém do setor abre a área. compartilhada_com guarda
--    o endereço do setor com que a pasta foi compartilhada no Google, para
--    "Abrir no Google" funcionar com a conta da própria pessoa.
--
-- Escrita só pelo servidor (service role), depois das conferências em
-- app/actions/arquivos-do-setor.ts. Leitura: a conexão, só administradores; a pasta,
-- administradores e quem é do setor.

create table if not exists public.drive_conexao (
  workspace_id   uuid primary key references public.workspaces (id) on delete cascade,
  email_conta    text not null,
  estado         text not null default 'ativa' check (estado in ('ativa','expirada')),
  raiz_id        text check (raiz_id is null or raiz_id ~ '^[A-Za-z0-9_-]{10,100}$'),
  raiz_nome      text check (raiz_nome is null or char_length(raiz_nome) <= 300),
  conectada_por  uuid references public.profiles (id) on delete set null,
  conectada_em   timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.drive_conexao is
  'A conta Google que guarda os Arquivos do setor (escopo drive) e a pasta raiz de onde saem as pastas dos setores. Separada das conexões do Gmail e de administrador.';

create table if not exists public.drive_pastas_dos_setores (
  setor_id           uuid primary key references public.setores (id) on delete cascade,
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  pasta_id           text not null check (pasta_id ~ '^[A-Za-z0-9_-]{10,100}$'),
  raiz_id            text not null,
  compartilhada_com  text,
  criada_por         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists drive_pastas_dos_setores_workspace_idx on public.drive_pastas_dos_setores (workspace_id);
comment on table public.drive_pastas_dos_setores is
  'A pasta de cada setor no Google Drive, dentro da raiz de drive_conexao. raiz_id é a raiz em que ela foi criada: trocar a raiz cria pastas novas, sem mexer nas antigas.';

alter table public.drive_conexao enable row level security;
alter table public.drive_conexao force row level security;
alter table public.drive_pastas_dos_setores enable row level security;
alter table public.drive_pastas_dos_setores force row level security;
revoke all on table public.drive_conexao from anon;
revoke all on table public.drive_pastas_dos_setores from anon;
revoke insert, update, delete, truncate on table public.drive_conexao from authenticated;
revoke insert, update, delete, truncate on table public.drive_pastas_dos_setores from authenticated;

drop policy if exists drive_conexao_select_admin on public.drive_conexao;
create policy drive_conexao_select_admin on public.drive_conexao
  for select to authenticated using ((select private.workspace_role(workspace_id)) = 'admin');
drop policy if exists drive_pastas_dos_setores_select on public.drive_pastas_dos_setores;
create policy drive_pastas_dos_setores_select on public.drive_pastas_dos_setores
  for select to authenticated using (
    (select private.workspace_role(workspace_id)) = 'admin'
    or ((select private.is_workspace_member(workspace_id)) and (select private.is_setor_member(setor_id)))
  );
