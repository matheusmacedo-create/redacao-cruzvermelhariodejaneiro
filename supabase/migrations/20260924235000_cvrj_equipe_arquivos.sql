-- Arquivos por pessoa da equipe: contrato assinado, ASO, atestados,
-- certificados, cópias de documentos, termos. O dossiê digital de cada um.
--
-- Os arquivos ficam num bucket privado, sem política nenhuma para quem está
-- logado: só o servidor (service role) lê e grava, depois de o banco conferir
-- o nível. O envio vai direto do navegador ao Storage por um link de envio
-- de uso único; o download, por um link assinado de um minuto. Toda abertura
-- e toda exclusão vão para a auditoria da Equipe.
--
-- Nível por categoria: ASO, atestado e cópia de documento pessoal pedem o
-- nível "documentos" (3) — saúde é dado sensível (LGPD, art. 11); o resto,
-- "gerenciar" (2).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('equipe-arquivos', 'equipe-arquivos', false, 20971520, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create table if not exists public.equipe_arquivos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete restrict,
  membro_id     uuid not null references public.equipe_membros (id) on delete cascade,
  categoria     text not null check (categoria in ('contrato','aso','atestado','documento','certificado','termo','outro')),
  titulo        text not null check (length(trim(titulo)) between 2 and 200),
  data_documento date,
  validade      date,
  observacao    text check (observacao is null or length(observacao) <= 600),
  caminho       text not null unique,
  nome_original text not null check (length(nome_original) <= 200),
  tipo          text not null,
  tamanho       bigint not null,
  sha256        text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  enviado_por   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  excluido_em   timestamptz,
  excluido_por  uuid references public.profiles (id) on delete set null,
  motivo_exclusao text check (motivo_exclusao is null or length(motivo_exclusao) <= 600),
  check (validade is null or data_documento is null or validade >= data_documento)
);
create index if not exists equipe_arquivos_membro_idx on public.equipe_arquivos (membro_id, created_at desc);
create index if not exists equipe_arquivos_workspace_idx on public.equipe_arquivos (workspace_id, validade) where excluido_em is null;
create index if not exists equipe_arquivos_enviado_idx on public.equipe_arquivos (enviado_por);
create index if not exists equipe_arquivos_excluido_idx on public.equipe_arquivos (excluido_por);

create or replace function private.nivel_da_categoria(p_categoria text)
returns integer language sql immutable set search_path = '' as $$
  select case when p_categoria in ('aso','atestado','documento') then 3 else 2 end
$$;
revoke all on function private.nivel_da_categoria(text) from public, anon;
grant execute on function private.nivel_da_categoria(text) to authenticated;

alter table public.equipe_arquivos enable row level security;
revoke all on public.equipe_arquivos from anon, authenticated;
-- O caminho no Storage não sai pela API.
grant select (id, workspace_id, membro_id, categoria, titulo, data_documento, validade, observacao, nome_original, tipo, tamanho,
  sha256, enviado_por, created_at, excluido_em, excluido_por, motivo_exclusao)
  on public.equipe_arquivos to authenticated;
create policy equipe_arquivos_select on public.equipe_arquivos
  for select to authenticated using ((select private.nivel_equipe(workspace_id)) >= private.nivel_da_categoria(categoria));

/**
 * Registra um arquivo que o navegador acabou de enviar ao Storage. Confere o
 * nível para a categoria, que o caminho é desta pessoa e que o objeto existe;
 * tamanho e tipo vêm do próprio Storage, não de quem chama.
 */
create or replace function public.registrar_arquivo_equipe(p_membro_id uuid, p_caminho text, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.equipe_membros;
  v_obj storage.objects;
  v_id uuid;
  v_cat text := p->>'categoria';
begin
  select * into v from public.equipe_membros where id = p_membro_id;
  if not found then raise exception 'Pessoa não encontrada.' using errcode = 'P0001'; end if;
  if v_cat is null or v_cat not in ('contrato','aso','atestado','documento','certificado','termo','outro') then
    raise exception 'Escolha a categoria.' using errcode = 'P0001';
  end if;
  if (select private.nivel_equipe(v.workspace_id)) < private.nivel_da_categoria(v_cat) then
    raise exception 'Você não tem acesso para guardar este tipo de arquivo.' using errcode = 'P0001';
  end if;
  if p_caminho is null or p_caminho !~ ('^' || v.workspace_id || '/' || v.id || '/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$') then
    raise exception 'Caminho inválido.' using errcode = 'P0001';
  end if;
  select * into v_obj from storage.objects where bucket_id = 'equipe-arquivos' and name = p_caminho;
  if not found then raise exception 'O arquivo não chegou ao armazenamento. Envie de novo.' using errcode = 'P0001'; end if;
  if coalesce(trim(p->>'titulo'), '') = '' then raise exception 'Dê um título ao arquivo.' using errcode = 'P0001'; end if;
  begin
    insert into public.equipe_arquivos (workspace_id, membro_id, categoria, titulo, data_documento, validade, observacao, caminho,
      nome_original, tipo, tamanho, enviado_por)
    values (v.workspace_id, v.id, v_cat, left(trim(p->>'titulo'), 200), nullif(p->>'data_documento', '')::date, nullif(p->>'validade', '')::date,
      nullif(left(trim(coalesce(p->>'observacao', '')), 600), ''), p_caminho, left(coalesce(nullif(trim(p->>'nome_original'), ''), 'arquivo'), 200),
      coalesce(v_obj.metadata->>'mimetype', 'application/octet-stream'), coalesce((v_obj.metadata->>'size')::bigint, 0), (select auth.uid()))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Este arquivo já foi registrado.' using errcode = 'P0001';
  end;
  perform private.auditar_equipe(v.workspace_id, v.id, 'enviar_arquivo', jsonb_build_object('arquivo', v_id, 'categoria', v_cat));
  return v_id;
end $$;

/** A impressão digital (SHA-256) calculada pelo servidor. Só o servidor grava, uma vez. */
create or replace function public.selar_arquivo_equipe(p_id uuid, p_sha256 text)
returns void language sql security definer set search_path = '' as $$
  update public.equipe_arquivos set sha256 = p_sha256 where id = p_id and sha256 is null
$$;

/** Confere o nível, registra a abertura e devolve onde está o arquivo, para o servidor assinar o link. */
create or replace function public.abrir_arquivo_equipe(p_id uuid)
returns table (caminho text, nome_original text, tipo text)
language plpgsql security definer set search_path = '' as $$
declare
  a public.equipe_arquivos;
begin
  select * into a from public.equipe_arquivos where id = p_id;
  if not found or a.excluido_em is not null or (select private.nivel_equipe(a.workspace_id)) < private.nivel_da_categoria(a.categoria) then
    raise exception 'Arquivo não encontrado.' using errcode = 'P0001';
  end if;
  perform private.auditar_equipe(a.workspace_id, a.membro_id, 'abrir_arquivo', jsonb_build_object('arquivo', a.id, 'categoria', a.categoria));
  return query select a.caminho, a.nome_original, a.tipo;
end $$;

/**
 * Exclui com motivo: a linha fica (quem enviou, quando, por que saiu) e o
 * servidor apaga o arquivo do Storage com o caminho devolvido aqui.
 */
create or replace function public.excluir_arquivo_equipe(p_id uuid, p_motivo text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  a public.equipe_arquivos;
begin
  select * into a from public.equipe_arquivos where id = p_id for update;
  if not found or a.excluido_em is not null or (select private.nivel_equipe(a.workspace_id)) < private.nivel_da_categoria(a.categoria) then
    raise exception 'Arquivo não encontrado.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escreva o motivo da exclusão.' using errcode = 'P0001'; end if;
  update public.equipe_arquivos set excluido_em = now(), excluido_por = (select auth.uid()), motivo_exclusao = left(trim(p_motivo), 600) where id = p_id;
  perform private.auditar_equipe(a.workspace_id, a.membro_id, 'excluir_arquivo', jsonb_build_object('arquivo', a.id, 'categoria', a.categoria, 'titulo', a.titulo));
  return a.caminho;
end $$;

revoke all on function public.registrar_arquivo_equipe(uuid, text, jsonb) from public, anon;
revoke all on function public.selar_arquivo_equipe(uuid, text) from public, anon, authenticated;
revoke all on function public.abrir_arquivo_equipe(uuid) from public, anon;
revoke all on function public.excluir_arquivo_equipe(uuid, text) from public, anon;
grant execute on function public.registrar_arquivo_equipe(uuid, text, jsonb) to authenticated;
grant execute on function public.selar_arquivo_equipe(uuid, text) to service_role;
grant execute on function public.abrir_arquivo_equipe(uuid) to authenticated;
grant execute on function public.excluir_arquivo_equipe(uuid, text) to authenticated;
