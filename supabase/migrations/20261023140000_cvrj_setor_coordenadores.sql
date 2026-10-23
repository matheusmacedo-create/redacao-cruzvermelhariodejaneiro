-- ============================================================
-- Coordenadores de setor autorizados a aprovar a própria equipe (23/10/2026)
--
-- Só acrescenta (ARQUITETURA §10.1). O código funciona sem esta migração: sem a
-- tabela, só quem gerencia usuários aprova o autocadastro de colaborador.
--
--  - setor_coordenadores: quem coordena um setor, pelo NÚMERO do WhatsApp (o
--    coordenador pode ainda não ter login no Palácio: ele entra pelo próprio
--    autocadastro, com o cargo "Coordenador(a)", e a aprovação de um
--    administrador o registra aqui — a partir daí aprova o cadastro da equipe
--    do SEU setor, e só dela, sem nova aprovação). `revogado_em` tira a
--    autorização sem apagar o histórico. Só o servidor lê e escreve.
-- ============================================================

create table if not exists public.setor_coordenadores (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  setor_id     uuid not null references public.setores (id) on delete cascade,
  -- Só dígitos, com o código do país (o mesmo formato de whatsapp_contas.numero).
  numero       text not null check (numero ~ '^[0-9]{10,15}$'),
  membro_id    uuid references public.equipe_membros (id) on delete set null,
  criado_por   uuid references public.profiles (id) on delete set null,
  criado_em    timestamptz not null default now(),
  revogado_em  timestamptz
);

-- Um coordenador ativo por número e setor.
create unique index if not exists setor_coordenadores_um_ativo
  on public.setor_coordenadores (setor_id, numero) where revogado_em is null;
create index if not exists setor_coordenadores_numero_idx on public.setor_coordenadores (numero) where revogado_em is null;
create index if not exists setor_coordenadores_espaco_idx on public.setor_coordenadores (workspace_id);
create index if not exists setor_coordenadores_membro_idx on public.setor_coordenadores (membro_id);
create index if not exists setor_coordenadores_criado_por_idx on public.setor_coordenadores (criado_por);

alter table public.setor_coordenadores enable row level security;
alter table public.setor_coordenadores force row level security;
revoke all on public.setor_coordenadores from anon, authenticated;

comment on table public.setor_coordenadores is
  'Quem coordena um setor, pelo número do WhatsApp: aprova o autocadastro da equipe do próprio setor. Só o servidor lê e escreve (RLS sem policy).';
