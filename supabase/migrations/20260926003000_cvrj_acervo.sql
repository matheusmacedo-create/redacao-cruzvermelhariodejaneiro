-- Acervo da filial (docs/acervo.md): o catálogo dos arquivos guardados no bucket do acervo no
-- Cloudflare R2. O arquivo mora no R2, privado; aqui ficam a ficha, a visibilidade e o que foi
-- publicado em cruzvermelhariodejaneiro.org/acervo/. As listas são as de lib/acervo/regras.ts.
--
-- Leitura: quem é do espaço (RLS). Escrita: só o servidor (chave de serviço), nas actions de
-- app/actions/acervo.ts, depois de conferir a permissão de quem pediu.

create table if not exists public.acervo_itens (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces (id) on delete cascade,
  colecao               text not null check (colecao in ('documentos', 'fotos', 'videos', 'imprensa', 'historia')),
  titulo                text not null check (char_length(btrim(titulo)) between 3 and 160),
  descricao             text check (descricao is null or char_length(descricao) <= 5000),
  -- A data do que o item registra (não a do envio), com a precisão conhecida.
  data_item             date,
  data_precisao         text not null default 'dia' check (data_precisao in ('dia', 'mes', 'ano')),
  autoria               text check (autoria is null or char_length(autoria) <= 200),
  local                 text check (local is null or char_length(local) <= 200),
  direitos              text not null default 'todos_reservados'
                        check (direitos in ('todos_reservados', 'cc_by', 'cc_by_sa', 'cc_by_nc', 'cc_by_nc_nd', 'dominio_publico')),
  credito               text check (credito is null or char_length(credito) <= 200),
  texto_alternativo     text check (texto_alternativo is null or char_length(texto_alternativo) <= 300),
  palavras_chave        text[] not null default '{}' check (cardinality(palavras_chave) <= 20),
  url_video             text check (url_video is null or url_video ~ '^https://(www\.)?(youtube\.com|youtu\.be|vimeo\.com)/'),
  -- O arquivo, no bucket do acervo.
  chave_r2              text check (chave_r2 is null or (char_length(chave_r2) between 1 and 1024
                                    and chave_r2 !~ '^/' and chave_r2 !~ '(^|/)\.\.(/|$)')),
  nome_original         text check (nome_original is null or char_length(nome_original) <= 255),
  tipo_mime             text check (tipo_mime is null or char_length(tipo_mime) <= 120),
  tamanho               bigint check (tamanho is null or tamanho >= 0),
  sha256                text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  largura               integer check (largura is null or largura > 0),
  altura                integer check (altura is null or altura > 0),
  -- Publicação no site.
  visibilidade          text not null default 'privado' check (visibilidade in ('privado', 'publico')),
  slug                  text check (slug is null or (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80 and slug <> 'pagina')),
  destaque              boolean not null default false,
  publicado_em          timestamptz,
  atualizado_no_site_em timestamptz,
  -- Os arquivos que estão no site por causa deste item (nomes em /acervo/arquivos/).
  arquivos_no_site      jsonb,
  criado_por            uuid references auth.users (id) on delete set null,
  atualizado_por        uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint acervo_publico_tem_endereco check (visibilidade = 'privado' or (slug is not null and publicado_em is not null)),
  constraint acervo_endereco_unico unique (workspace_id, colecao, slug)
);

create unique index if not exists acervo_itens_arquivo_unico on public.acervo_itens (workspace_id, chave_r2) where chave_r2 is not null;
create index if not exists acervo_itens_publicos on public.acervo_itens (workspace_id, colecao, publicado_em desc) where visibilidade = 'publico';
create index if not exists acervo_itens_recentes on public.acervo_itens (workspace_id, created_at desc);
-- As chaves estrangeiras para auth.users também indexadas (apagar uma conta não varre a tabela).
create index if not exists acervo_itens_criado_por on public.acervo_itens (criado_por);
create index if not exists acervo_itens_atualizado_por on public.acervo_itens (atualizado_por);

comment on table public.acervo_itens is
  'Catálogo do acervo (docs/acervo.md). O arquivo mora no bucket do acervo no R2; o público vai para cruzvermelhariodejaneiro.org/acervo/.';

-- Endereço público é para sempre: depois da primeira publicação, coleção e slug não mudam (links
-- de fora e o Google continuam achando o item), e a data da primeira publicação também não.
-- Item no ar não se apaga: primeiro sai do site. E a saída precisa ter terminado: com
-- arquivos_no_site preenchido, página e arquivos ainda podem estar no site (FTP que falhou), e sem a
-- ficha nada mais os tiraria de lá.
create or replace function public.acervo_guardar_item()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.visibilidade = 'publico' then
      raise exception 'Item no ar não se apaga: tire do site antes.' using errcode = 'P0001';
    end if;
    if old.arquivos_no_site is not null then
      raise exception 'A retirada do site ainda não terminou: use "Atualizar as páginas do acervo" e depois exclua.' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.publicado_em is not null then
    if new.slug is distinct from old.slug or new.colecao is distinct from old.colecao then
      raise exception 'Item que já foi ao ar mantém o endereço (coleção e slug).' using errcode = 'P0001';
    end if;
    if new.publicado_em is distinct from old.publicado_em then
      raise exception 'A data da primeira publicação não muda.' using errcode = 'P0001';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists acervo_itens_guarda on public.acervo_itens;
create trigger acervo_itens_guarda before update or delete on public.acervo_itens
  for each row execute function public.acervo_guardar_item();

alter table public.acervo_itens enable row level security;
drop policy if exists acervo_itens_leitura on public.acervo_itens;
-- O mesmo teste das outras tabelas da Redação: membro ativo, com a verificação em dia, e fora da
-- equipe da escola (que só enxerga a Escola).
create policy acervo_itens_leitura on public.acervo_itens for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

revoke all on public.acervo_itens from public, anon, authenticated;
grant select on public.acervo_itens to authenticated;
grant all on public.acervo_itens to service_role;
revoke all on function public.acervo_guardar_item() from public, anon, authenticated;
