-- Portal de transparência e página de canais oficiais (docs/auditoria-publica.md §5).
--
-- Documentos: cada linha é um "lugar" no portal (o estatuto, o balanço de 2025…) e as versões
-- são os PDFs que passaram por ele. Versão publicada nunca muda nem se apaga; arquivo novo é
-- versão nova, e a trilha registra a anterior como substituída.
--
-- Parcerias: os campos que a Lei 13.019/2014 (art. 11) manda divulgar — sem nome de ninguém da
-- equipe, só função e remuneração.
--
-- Canais oficiais: cada publicação é uma versão inteira e imutável da lista.
--
-- Leitura só para a administração; escrita só pelas funções abaixo, chamadas pelo servidor
-- depois de conferir a permissão. Cada publicação entra na trilha (fluxos F16 e F17) pelos
-- ganchos no fim do arquivo, com o autor informado pelo servidor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('transparencia', 'transparencia', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------- tabelas

create table if not exists public.transparencia_documentos (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete restrict,
  categoria       text not null check (categoria in ('estatuto', 'dirigentes', 'atas', 'demonstracoes', 'parecer',
                                                     'relatorio_anual', 'campanhas', 'certidoes', 'politicas', 'outros')),
  titulo          text not null check (length(btrim(titulo)) between 3 and 200),
  descricao       text check (descricao is null or length(descricao) <= 1000),
  periodo         text check (periodo is null or length(periodo) <= 60),
  ordem           integer not null default 0,
  retirado_em     timestamptz,
  retirado_por    uuid references public.profiles (id) on delete set null,
  motivo_retirada text check (motivo_retirada is null or length(motivo_retirada) <= 600),
  criado_por      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((retirado_em is null) = (motivo_retirada is null))
);
create index if not exists transparencia_documentos_ws_idx on public.transparencia_documentos (workspace_id, categoria, ordem);

create table if not exists public.transparencia_versoes (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete restrict,
  documento_id    uuid not null references public.transparencia_documentos (id) on delete restrict,
  caminho         text not null unique,
  nome_original   text not null check (length(nome_original) between 1 and 200),
  tamanho         bigint not null check (tamanho > 0 and tamanho <= 20971520),
  sha256          text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  arquivo_publico text check (arquivo_publico is null or (arquivo_publico ~ '^https://' and length(arquivo_publico) <= 500)),
  publicado_em    timestamptz,
  publicado_por   uuid references public.profiles (id) on delete set null,
  enviado_por     uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  check ((publicado_em is null) = (arquivo_publico is null))
);
create index if not exists transparencia_versoes_doc_idx on public.transparencia_versoes (documento_id, publicado_em desc nulls first);

create table if not exists public.transparencia_parcerias (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces (id) on delete restrict,
  instrumento        text not null check (instrumento in ('termo_de_colaboracao', 'termo_de_fomento', 'acordo_de_cooperacao',
                                                          'convenio', 'contrato_de_gestao', 'outro')),
  numero             text check (numero is null or length(numero) <= 80),
  orgao              text not null check (length(btrim(orgao)) between 3 and 200),
  orgao_cnpj         text check (orgao_cnpj is null or orgao_cnpj ~ '^[0-9]{14}$'),
  objeto             text not null check (length(btrim(objeto)) between 5 and 2000),
  data_assinatura    date,
  vigencia_inicio    date,
  vigencia_fim       date,
  valor_total        numeric(14, 2) check (valor_total is null or valor_total >= 0),
  valor_liberado     numeric(14, 2) check (valor_liberado is null or valor_liberado >= 0),
  situacao_prestacao text not null default 'em_execucao'
                       check (situacao_prestacao in ('em_execucao', 'prestacao_apresentada', 'aprovada', 'aprovada_com_ressalvas', 'rejeitada')),
  prestacao_final_em date,
  -- [{funcao, remuneracao}] — função e valor, nunca nome.
  equipe             jsonb not null default '[]'::jsonb check (jsonb_typeof(equipe) = 'array' and jsonb_array_length(equipe) <= 50),
  observacao         text check (observacao is null or length(observacao) <= 1000),
  publicado_em       timestamptz,
  retirado_em        timestamptz,
  motivo_retirada    text check (motivo_retirada is null or length(motivo_retirada) <= 600),
  criado_por         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (vigencia_fim is null or vigencia_inicio is null or vigencia_fim >= vigencia_inicio),
  check ((retirado_em is null) = (motivo_retirada is null))
);
create index if not exists transparencia_parcerias_ws_idx on public.transparencia_parcerias (workspace_id, data_assinatura desc);

create table if not exists public.canais_oficiais_versoes (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete restrict,
  versao        integer not null check (versao >= 1),
  -- [{tipo, rotulo, valor, url}] conferido pela aplicação (lib/transparencia/regras.ts).
  canais        jsonb not null check (jsonb_typeof(canais) = 'array' and jsonb_array_length(canais) between 1 and 60),
  observacao    text check (observacao is null or length(observacao) <= 1000),
  publicado_em  timestamptz not null default now(),
  publicado_por uuid references public.profiles (id) on delete set null,
  unique (workspace_id, versao)
);

-- ---------------------------------------------------------------- guardas

create or replace function private.transparencia_versao_imutavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.publicado_em is not null then
      raise exception 'Versão publicada no portal não se apaga.' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if new.documento_id is distinct from old.documento_id or new.caminho is distinct from old.caminho
     or new.sha256 is distinct from old.sha256 or new.tamanho is distinct from old.tamanho
     or new.nome_original is distinct from old.nome_original or new.workspace_id is distinct from old.workspace_id then
    raise exception 'O arquivo de uma versão não se troca: envie uma versão nova.' using errcode = 'P0001';
  end if;
  if old.publicado_em is not null and (new.publicado_em is distinct from old.publicado_em
     or new.arquivo_publico is distinct from old.arquivo_publico or new.publicado_por is distinct from old.publicado_por) then
    raise exception 'Versão publicada não muda.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists transparencia_versoes_imutavel on public.transparencia_versoes;
create trigger transparencia_versoes_imutavel before update or delete on public.transparencia_versoes
  for each row execute function private.transparencia_versao_imutavel();

create or replace function private.transparencia_documento_guarda()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.transparencia_versoes v where v.documento_id = old.id and v.publicado_em is not null) then
    raise exception 'Documento com versão publicada não se apaga: retire-o do portal com um motivo.' using errcode = 'P0001';
  end if;
  return old;
end $$;
drop trigger if exists transparencia_documentos_guarda on public.transparencia_documentos;
create trigger transparencia_documentos_guarda before delete on public.transparencia_documentos
  for each row execute function private.transparencia_documento_guarda();

create or replace function private.transparencia_parceria_guarda()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.publicado_em is not null then
    raise exception 'Parceria publicada não se apaga: retire-a do portal com um motivo.' using errcode = 'P0001';
  end if;
  return old;
end $$;
drop trigger if exists transparencia_parcerias_guarda on public.transparencia_parcerias;
create trigger transparencia_parcerias_guarda before delete on public.transparencia_parcerias
  for each row execute function private.transparencia_parceria_guarda();

create or replace function private.canais_versao_imutavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Versão publicada da página de canais oficiais não muda nem se apaga: publique outra.' using errcode = 'P0001';
end $$;
drop trigger if exists canais_oficiais_versoes_imutavel on public.canais_oficiais_versoes;
create trigger canais_oficiais_versoes_imutavel before update or delete on public.canais_oficiais_versoes
  for each row execute function private.canais_versao_imutavel();

-- ---------------------------------------------------------------- RLS: leitura da administração

alter table public.transparencia_documentos enable row level security;
alter table public.transparencia_versoes enable row level security;
alter table public.transparencia_parcerias enable row level security;
alter table public.canais_oficiais_versoes enable row level security;

drop policy if exists transparencia_documentos_admin on public.transparencia_documentos;
create policy transparencia_documentos_admin on public.transparencia_documentos for select to authenticated
  using ((select private.workspace_role(workspace_id)) = 'admin');
drop policy if exists transparencia_versoes_admin on public.transparencia_versoes;
create policy transparencia_versoes_admin on public.transparencia_versoes for select to authenticated
  using ((select private.workspace_role(workspace_id)) = 'admin');
drop policy if exists transparencia_parcerias_admin on public.transparencia_parcerias;
create policy transparencia_parcerias_admin on public.transparencia_parcerias for select to authenticated
  using ((select private.workspace_role(workspace_id)) = 'admin');
drop policy if exists canais_oficiais_versoes_admin on public.canais_oficiais_versoes;
create policy canais_oficiais_versoes_admin on public.canais_oficiais_versoes for select to authenticated
  using ((select private.workspace_role(workspace_id)) = 'admin');

revoke insert, update, delete, truncate on public.transparencia_documentos, public.transparencia_versoes,
  public.transparencia_parcerias, public.canais_oficiais_versoes from anon, authenticated;
revoke all on public.transparencia_documentos, public.transparencia_versoes,
  public.transparencia_parcerias, public.canais_oficiais_versoes from anon;

-- ---------------------------------------------------------------- trilha (F16 e F17)

-- O conteúdo canônico do documento no portal: os dados da ficha e o arquivo da versão publicada
-- (a informada, ou a publicada por último).
create or replace function auditoria.registrar_documento(p_documento uuid, p_versao uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  d public.transparencia_documentos;
  v public.transparencia_versoes;
begin
  select * into d from public.transparencia_documentos where id = p_documento;
  if d.id is null or d.retirado_em is not null then return; end if;
  select * into v from public.transparencia_versoes
   where documento_id = d.id and publicado_em is not null and (p_versao is null or id = p_versao)
   order by publicado_em desc, id desc limit 1;
  if v.id is null then return; end if;
  perform auditoria.registrar_item(d.workspace_id, 'documento', d.id, null,
    p_titulo => d.titulo,
    p_url => v.arquivo_publico,
    p_conteudo => auditoria.json_canonico(jsonb_build_object(
      'arquivo', jsonb_build_object('nome', v.nome_original, 'sha256', v.sha256, 'tamanho', v.tamanho, 'url', v.arquivo_publico),
      'categoria', d.categoria,
      'descricao', d.descricao,
      'periodo', d.periodo,
      'titulo', d.titulo)),
    p_hash_arquivo => v.sha256,
    p_ator => auditoria.ator_atual(),
    p_papel => auditoria.papel_atual(d.workspace_id));
end $$;

create or replace function auditoria.gancho_versao_transparencia()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform auditoria.registrar_documento(new.documento_id, new.id);
  exception when others then
    insert into auditoria.falhas (origem, referencia_id, erro) values ('gancho_transparencia', new.documento_id, left(sqlerrm, 500));
  end;
  return null;
end $$;
drop trigger if exists transparencia_versoes_trilha on public.transparencia_versoes;
create trigger transparencia_versoes_trilha after update of publicado_em on public.transparencia_versoes
  for each row when (old.publicado_em is null and new.publicado_em is not null)
  execute function auditoria.gancho_versao_transparencia();

create or replace function auditoria.gancho_documento_transparencia()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_item auditoria.itens;
begin
  begin
    if new.retirado_em is not null and old.retirado_em is null then
      v_item := auditoria.ultimo_item('documento', new.id);
      if v_item.id is not null then
        perform auditoria.registrar_evento_item(v_item.id, 'item.retirado', 'retirado_do_ar', auditoria.ator_atual(), auditoria.papel_atual(new.workspace_id));
      end if;
    else
      -- Ficha editada (título, descrição, período, categoria) ou documento de volta ao portal.
      perform auditoria.registrar_documento(new.id);
    end if;
  exception when others then
    insert into auditoria.falhas (origem, referencia_id, erro) values ('gancho_transparencia', new.id, left(sqlerrm, 500));
  end;
  return null;
end $$;
drop trigger if exists transparencia_documentos_trilha on public.transparencia_documentos;
create trigger transparencia_documentos_trilha after update of titulo, descricao, periodo, categoria, retirado_em on public.transparencia_documentos
  for each row when (old.titulo is distinct from new.titulo or old.descricao is distinct from new.descricao
                     or old.periodo is distinct from new.periodo or old.categoria is distinct from new.categoria
                     or old.retirado_em is distinct from new.retirado_em)
  execute function auditoria.gancho_documento_transparencia();

create or replace function auditoria.conteudo_parceria(p public.transparencia_parcerias)
returns text language sql stable set search_path = '' as $$
  select auditoria.json_canonico(jsonb_build_object(
    'data_assinatura', to_char(p.data_assinatura, 'YYYY-MM-DD'),
    'equipe', p.equipe,
    'instrumento', p.instrumento,
    'numero', p.numero,
    'objeto', p.objeto,
    'observacao', p.observacao,
    'orgao', p.orgao,
    'orgao_cnpj', p.orgao_cnpj,
    'prestacao_final_em', to_char(p.prestacao_final_em, 'YYYY-MM-DD'),
    'situacao_prestacao', p.situacao_prestacao,
    'valor_liberado', p.valor_liberado::text,
    'valor_total', p.valor_total::text,
    'vigencia_fim', to_char(p.vigencia_fim, 'YYYY-MM-DD'),
    'vigencia_inicio', to_char(p.vigencia_inicio, 'YYYY-MM-DD')))
$$;

create or replace function auditoria.registrar_parceria(p public.transparencia_parcerias)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform auditoria.registrar_item(p.workspace_id, 'parceria', p.id, null,
    p_titulo => left(p.orgao || ' — ' || p.objeto, 300),
    p_url => 'https://cruzvermelhariodejaneiro.org/transparencia/#parcerias',
    p_conteudo => auditoria.conteudo_parceria(p),
    p_ator => auditoria.ator_atual(),
    p_papel => auditoria.papel_atual(p.workspace_id));
end $$;

create or replace function auditoria.gancho_parceria()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_item auditoria.itens;
begin
  begin
    if new.publicado_em is null then return null; end if;
    if new.retirado_em is not null then
      if old.retirado_em is null then
        v_item := auditoria.ultimo_item('parceria', new.id);
        if v_item.id is not null then
          perform auditoria.registrar_evento_item(v_item.id, 'item.retirado', 'retirado_do_ar', auditoria.ator_atual(), auditoria.papel_atual(new.workspace_id));
        end if;
      end if;
      return null;
    end if;
    perform auditoria.registrar_parceria(new);
  exception when others then
    insert into auditoria.falhas (origem, referencia_id, erro) values ('gancho_parceria', new.id, left(sqlerrm, 500));
  end;
  return null;
end $$;
drop trigger if exists transparencia_parcerias_trilha on public.transparencia_parcerias;
create trigger transparencia_parcerias_trilha after insert or update on public.transparencia_parcerias
  for each row execute function auditoria.gancho_parceria();

-- Uma lista por espaço: a origem é o próprio espaço, e cada publicação substitui a anterior.
create or replace function auditoria.registrar_canais(c public.canais_oficiais_versoes)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform auditoria.registrar_item(c.workspace_id, 'canais', c.workspace_id, null,
    p_titulo => 'Canais oficiais — versão ' || c.versao,
    p_url => 'https://cruzvermelhariodejaneiro.org/canais-oficiais/',
    p_conteudo => auditoria.json_canonico(jsonb_build_object('canais', c.canais, 'observacao', c.observacao, 'versao', c.versao)),
    p_ator => coalesce(auditoria.ator_atual(), c.publicado_por),
    p_papel => auditoria.papel_atual(c.workspace_id));
end $$;

create or replace function auditoria.gancho_canais()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform auditoria.registrar_canais(new);
  exception when others then
    insert into auditoria.falhas (origem, referencia_id, erro) values ('gancho_canais', new.id, left(sqlerrm, 500));
  end;
  return null;
end $$;
drop trigger if exists canais_oficiais_versoes_trilha on public.canais_oficiais_versoes;
create trigger canais_oficiais_versoes_trilha after insert on public.canais_oficiais_versoes
  for each row execute function auditoria.gancho_canais();

-- A parte do portal na sincronização diária (public.auditoria_sincronizar): registra o que os
-- ganchos perderam. Tudo idempotente: o que já está registrado com o mesmo conteúdo fica como está.
create or replace function auditoria.sincronizar_portal()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  r record;
  rp public.transparencia_parcerias;
  rc public.canais_oficiais_versoes;
  v_antes integer;
  v_documentos integer := 0;
  v_parcerias integer := 0;
  v_canais integer := 0;
  v_falhas integer := 0;
begin
  for r in select d.id from public.transparencia_documentos d
            where d.retirado_em is null
              and exists (select 1 from public.transparencia_versoes v where v.documento_id = d.id and v.publicado_em is not null) loop
    begin
      select count(*) into v_antes from auditoria.itens i where i.tipo = 'documento' and i.referencia_id = r.id;
      perform auditoria.registrar_documento(r.id);
      if (select count(*) from auditoria.itens i where i.tipo = 'documento' and i.referencia_id = r.id) > v_antes then v_documentos := v_documentos + 1; end if;
    exception when others then
      insert into auditoria.falhas (origem, referencia_id, erro) values ('sincronizar_documento', r.id, left(sqlerrm, 500));
      v_falhas := v_falhas + 1;
    end;
  end loop;

  for rp in select p.* from public.transparencia_parcerias p where p.publicado_em is not null and p.retirado_em is null loop
    begin
      select count(*) into v_antes from auditoria.itens i where i.tipo = 'parceria' and i.referencia_id = rp.id;
      perform auditoria.registrar_parceria(rp);
      if (select count(*) from auditoria.itens i where i.tipo = 'parceria' and i.referencia_id = rp.id) > v_antes then v_parcerias := v_parcerias + 1; end if;
    exception when others then
      insert into auditoria.falhas (origem, referencia_id, erro) values ('sincronizar_parceria', rp.id, left(sqlerrm, 500));
      v_falhas := v_falhas + 1;
    end;
  end loop;

  for rc in select distinct on (c.workspace_id) c.* from public.canais_oficiais_versoes c order by c.workspace_id, c.versao desc loop
    begin
      select count(*) into v_antes from auditoria.itens i where i.tipo = 'canais' and i.referencia_id = rc.workspace_id;
      perform auditoria.registrar_canais(rc);
      if (select count(*) from auditoria.itens i where i.tipo = 'canais' and i.referencia_id = rc.workspace_id) > v_antes then v_canais := v_canais + 1; end if;
    exception when others then
      insert into auditoria.falhas (origem, referencia_id, erro) values ('sincronizar_canais', rc.id, left(sqlerrm, 500));
      v_falhas := v_falhas + 1;
    end;
  end loop;

  -- Retirada que o gancho perdeu.
  for r in select i.id as item_id from public.transparencia_documentos d
             join lateral (select * from auditoria.ultimo_item('documento', d.id)) i on i.id is not null
            where d.retirado_em is not null and coalesce((select s.estado from auditoria.estado_item(i.id) s), 'vigente') = 'vigente'
           union all
           select i.id from public.transparencia_parcerias p
             join lateral (select * from auditoria.ultimo_item('parceria', p.id)) i on i.id is not null
            where p.retirado_em is not null and coalesce((select s.estado from auditoria.estado_item(i.id) s), 'vigente') = 'vigente' loop
    perform auditoria.registrar_evento_item(r.item_id, 'item.retirado', 'retirado_do_ar');
  end loop;

  return jsonb_build_object('documentos', v_documentos, 'parcerias', v_parcerias, 'canais', v_canais, 'falhas', v_falhas);
end $$;

revoke all on all functions in schema auditoria from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- funções do servidor
--
-- Só a chave de serviço chama; a action confere a permissão antes e informa quem agiu.

create or replace function public.transparencia_salvar_documento(p_workspace_id uuid, p_id uuid, p jsonb, p_ator uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform set_config('auditoria.ator', coalesce(p_ator::text, ''), true);
  if p_id is null then
    insert into public.transparencia_documentos (workspace_id, categoria, titulo, descricao, periodo, ordem, criado_por)
    values (p_workspace_id, p ->> 'categoria', btrim(p ->> 'titulo'), nullif(btrim(coalesce(p ->> 'descricao', '')), ''),
            nullif(btrim(coalesce(p ->> 'periodo', '')), ''), coalesce((p ->> 'ordem')::integer, 0), p_ator)
    returning id into v_id;
  else
    update public.transparencia_documentos
       set categoria = p ->> 'categoria', titulo = btrim(p ->> 'titulo'), descricao = nullif(btrim(coalesce(p ->> 'descricao', '')), ''),
           periodo = nullif(btrim(coalesce(p ->> 'periodo', '')), ''), ordem = coalesce((p ->> 'ordem')::integer, ordem), updated_at = now()
     where id = p_id and workspace_id = p_workspace_id
    returning id into v_id;
    if v_id is null then raise exception 'Documento não encontrado.' using errcode = 'P0001'; end if;
  end if;
  return v_id;
end $$;

-- Registra o PDF já enviado ao Storage (o servidor leu os bytes e calculou o SHA-256).
create or replace function public.transparencia_registrar_versao(p_documento_id uuid, p_caminho text, p_nome text, p_tamanho bigint, p_sha256 text, p_ator uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  d public.transparencia_documentos;
  v_id uuid;
begin
  select * into d from public.transparencia_documentos where id = p_documento_id;
  if d.id is null then raise exception 'Documento não encontrado.' using errcode = 'P0001'; end if;
  if p_caminho is null or p_caminho !~ ('^' || d.workspace_id::text || '/' || d.id::text || '/[0-9a-f-]{36}\.pdf$') then
    raise exception 'Caminho inválido.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'transparencia' and o.name = p_caminho) then
    raise exception 'O arquivo não chegou ao armazenamento. Envie de novo.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.transparencia_versoes v where v.documento_id = d.id and v.sha256 = lower(p_sha256)) then
    raise exception 'Este mesmo arquivo já foi enviado para este documento.' using errcode = 'P0001';
  end if;
  insert into public.transparencia_versoes (workspace_id, documento_id, caminho, nome_original, tamanho, sha256, enviado_por)
  values (d.workspace_id, d.id, p_caminho, left(coalesce(nullif(btrim(p_nome), ''), 'documento.pdf'), 200), p_tamanho, lower(p_sha256), p_ator)
  returning id into v_id;
  return v_id;
end $$;

-- Marca a versão como publicada (o arquivo já está no site): a trilha registra aqui.
create or replace function public.transparencia_publicar_versao(p_versao_id uuid, p_arquivo_publico text, p_ator uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform set_config('auditoria.ator', coalesce(p_ator::text, ''), true);
  update public.transparencia_versoes set arquivo_publico = p_arquivo_publico, publicado_em = clock_timestamp(), publicado_por = p_ator
   where id = p_versao_id and publicado_em is null;
  if not found then raise exception 'Versão não encontrada ou já publicada.' using errcode = 'P0001'; end if;
  update public.transparencia_documentos d set retirado_em = null, retirado_por = null, motivo_retirada = null, updated_at = now()
    from public.transparencia_versoes v
   where v.id = p_versao_id and d.id = v.documento_id and d.retirado_em is not null;
end $$;

create or replace function public.transparencia_descartar_versao(p_versao_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from public.transparencia_versoes where id = p_versao_id and publicado_em is null;
  if not found then raise exception 'Só versão ainda não publicada pode ser descartada.' using errcode = 'P0001'; end if;
end $$;

create or replace function public.transparencia_retirar_documento(p_documento_id uuid, p_motivo text, p_ator uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Escreva o motivo (é o registro de por que saiu).' using errcode = 'P0001'; end if;
  perform set_config('auditoria.ator', coalesce(p_ator::text, ''), true);
  update public.transparencia_documentos set retirado_em = now(), retirado_por = p_ator, motivo_retirada = left(btrim(p_motivo), 600), updated_at = now()
   where id = p_documento_id and retirado_em is null;
  if not found then raise exception 'Documento não encontrado ou já retirado.' using errcode = 'P0001'; end if;
end $$;

create or replace function public.transparencia_salvar_parceria(p_workspace_id uuid, p_id uuid, p jsonb, p_ator uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform set_config('auditoria.ator', coalesce(p_ator::text, ''), true);
  if p_id is null then
    insert into public.transparencia_parcerias (workspace_id, instrumento, numero, orgao, orgao_cnpj, objeto, data_assinatura, vigencia_inicio,
      vigencia_fim, valor_total, valor_liberado, situacao_prestacao, prestacao_final_em, equipe, observacao, criado_por)
    values (p_workspace_id, p ->> 'instrumento', nullif(btrim(coalesce(p ->> 'numero', '')), ''), btrim(p ->> 'orgao'),
            nullif(p ->> 'orgao_cnpj', ''), btrim(p ->> 'objeto'), nullif(p ->> 'data_assinatura', '')::date, nullif(p ->> 'vigencia_inicio', '')::date,
            nullif(p ->> 'vigencia_fim', '')::date, nullif(p ->> 'valor_total', '')::numeric, nullif(p ->> 'valor_liberado', '')::numeric,
            coalesce(p ->> 'situacao_prestacao', 'em_execucao'), nullif(p ->> 'prestacao_final_em', '')::date, coalesce(p -> 'equipe', '[]'::jsonb),
            nullif(btrim(coalesce(p ->> 'observacao', '')), ''), p_ator)
    returning id into v_id;
  else
    update public.transparencia_parcerias
       set instrumento = p ->> 'instrumento', numero = nullif(btrim(coalesce(p ->> 'numero', '')), ''), orgao = btrim(p ->> 'orgao'),
           orgao_cnpj = nullif(p ->> 'orgao_cnpj', ''), objeto = btrim(p ->> 'objeto'), data_assinatura = nullif(p ->> 'data_assinatura', '')::date,
           vigencia_inicio = nullif(p ->> 'vigencia_inicio', '')::date, vigencia_fim = nullif(p ->> 'vigencia_fim', '')::date,
           valor_total = nullif(p ->> 'valor_total', '')::numeric, valor_liberado = nullif(p ->> 'valor_liberado', '')::numeric,
           situacao_prestacao = coalesce(p ->> 'situacao_prestacao', situacao_prestacao), prestacao_final_em = nullif(p ->> 'prestacao_final_em', '')::date,
           equipe = coalesce(p -> 'equipe', '[]'::jsonb), observacao = nullif(btrim(coalesce(p ->> 'observacao', '')), ''), updated_at = now()
     where id = p_id and workspace_id = p_workspace_id and retirado_em is null
    returning id into v_id;
    if v_id is null then raise exception 'Parceria não encontrada ou retirada do portal.' using errcode = 'P0001'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.transparencia_publicar_parceria(p_id uuid, p_ator uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform set_config('auditoria.ator', coalesce(p_ator::text, ''), true);
  update public.transparencia_parcerias set publicado_em = now(), updated_at = now() where id = p_id and publicado_em is null and retirado_em is null;
  if not found then raise exception 'Parceria não encontrada ou já publicada.' using errcode = 'P0001'; end if;
end $$;

create or replace function public.transparencia_retirar_parceria(p_id uuid, p_motivo text, p_ator uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Escreva o motivo (é o registro de por que saiu).' using errcode = 'P0001'; end if;
  perform set_config('auditoria.ator', coalesce(p_ator::text, ''), true);
  update public.transparencia_parcerias set retirado_em = now(), motivo_retirada = left(btrim(p_motivo), 600), updated_at = now()
   where id = p_id and retirado_em is null;
  if not found then raise exception 'Parceria não encontrada ou já retirada.' using errcode = 'P0001'; end if;
end $$;

create or replace function public.transparencia_excluir_rascunho(p_documento_id uuid, p_parceria_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_documento_id is not null then
    delete from public.transparencia_versoes where documento_id = p_documento_id and publicado_em is null;
    delete from public.transparencia_documentos where id = p_documento_id;
  end if;
  if p_parceria_id is not null then
    delete from public.transparencia_parcerias where id = p_parceria_id;
  end if;
end $$;

create or replace function public.canais_publicar_versao(p_workspace_id uuid, p_canais jsonb, p_observacao text, p_ator uuid)
returns table (id uuid, versao integer) language plpgsql volatile security definer set search_path = '' as $$
declare
  v_versao integer;
begin
  perform pg_advisory_xact_lock(hashtext('canais_oficiais:' || p_workspace_id::text));
  perform set_config('auditoria.ator', coalesce(p_ator::text, ''), true);
  select coalesce(max(c.versao), 0) + 1 into v_versao from public.canais_oficiais_versoes c where c.workspace_id = p_workspace_id;
  return query
    insert into public.canais_oficiais_versoes (workspace_id, versao, canais, observacao, publicado_por)
    values (p_workspace_id, v_versao, p_canais, nullif(btrim(coalesce(p_observacao, '')), ''), p_ator)
    returning canais_oficiais_versoes.id, canais_oficiais_versoes.versao;
end $$;

-- Códigos da trilha das origens, para as páginas públicas mostrarem o selo de verificação.
create or replace function public.auditoria_codigos_das_origens(p_tipo text, p_referencias uuid[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('referencia_id', i.referencia_id, 'versao', i.versao, 'codigo', i.codigo,
                                               'hash', i.hash_conteudo, 'hash_arquivo', i.hash_arquivo, 'registrado_em', i.registrado_em)
                            order by i.referencia_id, i.versao), '[]'::jsonb)
    from auditoria.itens i
   where i.tipo = p_tipo and i.referencia_id = any (p_referencias)
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.transparencia_salvar_documento(uuid, uuid, jsonb, uuid)',
    'public.transparencia_registrar_versao(uuid, text, text, bigint, text, uuid)',
    'public.transparencia_publicar_versao(uuid, text, uuid)',
    'public.transparencia_descartar_versao(uuid)',
    'public.transparencia_retirar_documento(uuid, text, uuid)',
    'public.transparencia_salvar_parceria(uuid, uuid, jsonb, uuid)',
    'public.transparencia_publicar_parceria(uuid, uuid)',
    'public.transparencia_retirar_parceria(uuid, text, uuid)',
    'public.transparencia_excluir_rascunho(uuid, uuid)',
    'public.canais_publicar_versao(uuid, jsonb, text, uuid)',
    'public.auditoria_codigos_das_origens(text, uuid[])'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
