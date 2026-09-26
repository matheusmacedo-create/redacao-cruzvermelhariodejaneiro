-- ============================================================
-- Ofícios: selo digital da filial.
--
-- Quando o ofício termina de ser assinado, a Redação sela o manifesto de
-- assinaturas com a chave Ed25519 da própria filial — a mesma da trilha
-- pública (lib/auditoria/chave.ts; impressão digital publicada em
-- /verificar/chave-publica.pem). O Bitcoin (OpenTimestamps) prova QUANDO o
-- manifesto existia; o selo prova QUEM o emitiu: a Cruz Vermelha RJ.
--
--   oficio_selos  um selo por ofício: a mensagem selada (texto legível com
--                 número, código de verificação e os dois SHA-256), a
--                 assinatura, a chave pública e a impressão digital dela.
--
-- Só acrescenta. Leitura: membros do espaço (a página pública lê com a chave
-- de serviço). Escrita: só o servidor, uma vez; o selo não muda nem se apaga.
-- ============================================================

create table if not exists public.oficio_selos (
  oficio_id      uuid primary key references public.oficios (id) on delete restrict,
  workspace_id   uuid not null references public.workspaces (id) on delete restrict,
  versao         text not null check (versao ~ '^selo-cvbrj/[0-9]+$'),
  chave_id       text not null check (chave_id ~ '^[0-9a-f]{16}$'),
  chave_publica  text not null check (length(chave_publica) <= 400),
  mensagem       text not null check (length(mensagem) <= 4000),
  assinatura     text not null check (length(assinatura) <= 200),
  selado_em      timestamptz not null default now()
);
create index if not exists oficio_selos_workspace_idx on public.oficio_selos (workspace_id);

create or replace function private.oficio_selo_imutavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'O selo de um ofício não muda nem se apaga.' using errcode = 'P0001';
end $$;
drop trigger if exists oficio_selos_imutavel on public.oficio_selos;
create trigger oficio_selos_imutavel before update or delete on public.oficio_selos
  for each row execute function private.oficio_selo_imutavel();

alter table public.oficio_selos enable row level security;
revoke all on public.oficio_selos from anon;
revoke insert, update, delete, truncate, references, trigger on public.oficio_selos from authenticated;
drop policy if exists oficio_selos_select on public.oficio_selos;
create policy oficio_selos_select on public.oficio_selos for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
