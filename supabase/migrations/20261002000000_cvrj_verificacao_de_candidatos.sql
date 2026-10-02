-- ============================================================
-- Voluntariado: verificação do candidato (identidade, antecedentes,
-- sanções, referências) antes da aprovação — ARQUITETURA §7.36
--
-- Só acrescenta (ARQUITETURA §10.1). O código anterior não usa nada daqui, a
-- não ser mudar_situacao_participante, recriada com a mesma assinatura: o
-- ramo candidato → ativo passa a exigir uma verificação concluída (apto ou
-- apto com restrição). Os outros ramos não mudam.
--
--  - participantes.restricoes / verificado_em: o que vale depois da decisão.
--  - participantes_verificacoes: uma por candidato em andamento. Guarda o
--    hash do link pessoal (14 dias; o lembrete troca o token), o aceite do
--    termo, o checklist (itens), o que o Claude leu do documento (sem o CPF),
--    o resultado das consultas da CGU, o registro profissional declarado e a
--    decisão (apto / apto com restrição / não apto).
--  - participantes_arquivos: documento com foto, atestado de antecedentes,
--    comprovante, registro profissional. Bucket privado; só o servidor lê e
--    grava, depois de o banco conferir o nível. Identidade e antecedentes
--    pedem o nível "dados sensíveis" (3): o documento traz o CPF impresso.
--  - participantes_referencias: as pessoas que o candidato indica e o que a
--    coordenação apurou com elas.
--  - Funções do link (service role): o candidato aceita o termo, manda os
--    arquivos, as referências e o registro profissional, e conclui o envio
--    (o link vence na hora; o hash fica para a página dizer "não vale mais").
--  - Funções da coordenação (authenticated, nível conferido dentro): abrir a
--    verificação e o link, registrar cada item, a leitura do documento, as
--    sanções, os arquivos, as referências e a decisão.
--  - Gatilho de anonimização: apaga referências, zera o que a verificação
--    guarda e marca os arquivos como excluídos (o servidor apaga do Storage).
--
-- Base legal: Lei 14.811/2024 (art. 59-A do ECA — certidão de antecedentes
-- de todos os colaboradores, inclusive voluntários, renovada a cada 6 meses),
-- IFRC Child Safeguarding Policy e LGPD (dado sensível: finalidade, acesso
-- restrito, decisão humana — art. 20).
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voluntarios-arquivos', 'voluntarios-arquivos', false, 20971520, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------- participantes

alter table public.participantes add column if not exists restricoes text[] not null default '{}';
alter table public.participantes add column if not exists verificado_em timestamptz;
grant select (restricoes, verificado_em) on public.participantes to authenticated;
comment on column public.participantes.restricoes is 'Restrições de atuação decididas na verificação (lib/participantes/verificacao/regras.ts, RESTRICOES). Vazio = sem restrição.';
comment on column public.participantes.verificado_em is 'Quando a última verificação foi concluída.';

-- ---------------------------------------------------------------- verificações

create table if not exists public.participantes_verificacoes (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces (id) on delete cascade,
  participante_id       uuid not null references public.participantes (id) on delete cascade,
  escopo                text not null default 'completa' check (escopo in ('completa','renovacao')),
  estado                text not null default 'aberta' check (estado in ('aberta','enviada','concluida','cancelada')),
  -- O link pessoal do candidato: só o hash do token; o servidor manda o link.
  token_hash            text unique check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  link_expira_em        timestamptz,
  -- Para onde o link foi (e-mail ou número mascarado); null = a coordenação copiou.
  link_enviado_para     text check (link_enviado_para is null or length(link_enviado_para) <= 254),
  lembrado_em           timestamptz,
  lembretes             smallint not null default 0 check (lembretes between 0 and 5),
  termo_versao          text check (termo_versao is null or length(termo_versao) <= 20),
  termo_aceito_em       timestamptz,
  enviado_em            timestamptz,
  -- Checklist: {identidade|antecedentes|sancoes|registro_profissional|referencias|entrevista:
  --   {situacao: pendente|conferido|divergente|dispensado, por, por_nome, em, nota, …}}
  itens                 jsonb not null default '{}'::jsonb check (jsonb_typeof(itens) = 'object'),
  -- O que o Claude leu do documento, já sem o CPF e com o número mascarado, e a comparação com o cadastro.
  documento_lido        jsonb check (documento_lido is null or jsonb_typeof(documento_lido) = 'object'),
  -- Consultas à CGU (CEIS, CNEP, CEAF, PEP): só o resumo saneado, nunca a resposta bruta.
  sancoes               jsonb check (sancoes is null or jsonb_typeof(sancoes) = 'object'),
  -- O que o candidato declarou: {tem, conselho, numero, uf}.
  registro_profissional jsonb check (registro_profissional is null or jsonb_typeof(registro_profissional) = 'object'),
  parecer               text check (parecer is null or parecer in ('apto','apto_com_restricao','nao_apto')),
  restricoes            text[] not null default '{}',
  motivo                text check (motivo is null or length(motivo) <= 1200),
  decidido_por          uuid references public.profiles (id) on delete set null,
  decidido_em           timestamptz,
  aberta_por            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
-- Uma verificação em andamento por pessoa.
create unique index if not exists participantes_verificacoes_em_andamento on public.participantes_verificacoes (participante_id) where estado in ('aberta','enviada');
create index if not exists participantes_verificacoes_participante_idx on public.participantes_verificacoes (participante_id, created_at desc);
create index if not exists participantes_verificacoes_workspace_idx on public.participantes_verificacoes (workspace_id, estado);
create index if not exists participantes_verificacoes_lembrete_idx on public.participantes_verificacoes (link_expira_em) where token_hash is not null and estado = 'aberta';
create index if not exists participantes_verificacoes_decidido_idx on public.participantes_verificacoes (decidido_por);
create index if not exists participantes_verificacoes_aberta_idx on public.participantes_verificacoes (aberta_por);

comment on table public.participantes_verificacoes is
  'Verificação do candidato a voluntário: link pessoal, termo, checklist, leitura do documento, sanções e decisão. Escrita só por função.';

-- ---------------------------------------------------------------- arquivos

create table if not exists public.participantes_arquivos (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete restrict,
  participante_id     uuid not null references public.participantes (id) on delete cascade,
  verificacao_id      uuid references public.participantes_verificacoes (id) on delete set null,
  categoria           text not null check (categoria in ('documento_identidade','antecedentes_pcerj','antecedentes_pf','comprovante_residencia','registro_profissional','outro')),
  lado                text check (lado is null or lado in ('frente','verso','unico')),
  -- "Emitido em" do atestado; validade (90 dias) e renovação (6 meses, Lei 14.811) saem dele.
  data_documento      date,
  validade            date,
  vence_em            date,
  codigo_autenticacao text check (codigo_autenticacao is null or length(codigo_autenticacao) <= 80),
  observacao          text check (observacao is null or length(observacao) <= 600),
  caminho             text not null unique,
  nome_original       text not null check (length(nome_original) <= 200),
  tipo                text not null,
  tamanho             bigint not null,
  sha256              text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  pelo_candidato      boolean not null default false,
  enviado_por         uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  excluido_em         timestamptz,
  excluido_por        uuid references public.profiles (id) on delete set null,
  motivo_exclusao     text check (motivo_exclusao is null or length(motivo_exclusao) <= 600),
  check (validade is null or data_documento is null or validade >= data_documento)
);
create index if not exists participantes_arquivos_participante_idx on public.participantes_arquivos (participante_id, created_at desc);
create index if not exists participantes_arquivos_verificacao_idx on public.participantes_arquivos (verificacao_id);
create index if not exists participantes_arquivos_vence_idx on public.participantes_arquivos (workspace_id, vence_em) where excluido_em is null and vence_em is not null;
create index if not exists participantes_arquivos_enviado_idx on public.participantes_arquivos (enviado_por);
create index if not exists participantes_arquivos_excluido_idx on public.participantes_arquivos (excluido_por);

comment on table public.participantes_arquivos is
  'Documentos da verificação do voluntário (identidade, antecedentes, comprovante, registro profissional). Bucket privado voluntarios-arquivos; só o servidor abre.';

-- ---------------------------------------------------------------- referências

create table if not exists public.participantes_referencias (
  id                       uuid primary key default gen_random_uuid(),
  workspace_id             uuid not null references public.workspaces (id) on delete cascade,
  participante_id          uuid not null references public.participantes (id) on delete cascade,
  verificacao_id           uuid references public.participantes_verificacoes (id) on delete set null,
  nome                     text not null check (length(trim(nome)) between 2 and 120),
  relacao                  text not null check (length(trim(relacao)) between 2 and 120),
  telefone                 text check (telefone is null or length(telefone) <= 30),
  email                    text check (email is null or (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254)),
  informado_pelo_candidato boolean not null default false,
  contatado_em             date,
  contatado_por            uuid references public.profiles (id) on delete set null,
  contatado_por_nome       text check (contatado_por_nome is null or length(contatado_por_nome) <= 120),
  parecer                  text check (parecer is null or parecer in ('favoravel','desfavoravel','nao_localizada')),
  nota                     text check (nota is null or length(nota) <= 600),
  created_at               timestamptz not null default now(),
  check (telefone is not null or email is not null)
);
create index if not exists participantes_referencias_participante_idx on public.participantes_referencias (participante_id, created_at);
create index if not exists participantes_referencias_verificacao_idx on public.participantes_referencias (verificacao_id);
create index if not exists participantes_referencias_contatado_idx on public.participantes_referencias (contatado_por);

comment on table public.participantes_referencias is
  'Referências do candidato a voluntário (duas pessoas fora da família) e o que a coordenação apurou com elas.';

-- ---------------------------------------------------------------- ajudantes

/** Nível pedido para cada categoria de arquivo: identidade e antecedentes trazem o CPF impresso → 3; o resto, 2. */
create or replace function private.nivel_da_categoria_voluntario(p_categoria text)
returns integer language sql immutable set search_path = '' as $$
  select case when p_categoria in ('documento_identidade','antecedentes_pcerj','antecedentes_pf') then 3 else 2 end
$$;
revoke all on function private.nivel_da_categoria_voluntario(text) from public, anon;
grant execute on function private.nivel_da_categoria_voluntario(text) to authenticated;

/** O nome de quem está logado, para o checklist e o parecer dizerem "por Fulana". */
create or replace function private.nome_de_quem_esta_logado()
returns text language sql security definer set search_path = '' stable as $$
  select coalesce(nullif(trim(p.full_name), ''), 'Equipe') from public.profiles p where p.id = (select auth.uid())
$$;
revoke all on function private.nome_de_quem_esta_logado() from public, anon, authenticated;

/** A verificação em andamento (aberta ou enviada) desta pessoa; null se não há. */
create or replace function private.verificacao_em_andamento(p_participante_id uuid)
returns public.participantes_verificacoes language sql security definer set search_path = '' stable as $$
  select v from public.participantes_verificacoes v where v.participante_id = p_participante_id and v.estado in ('aberta','enviada') limit 1
$$;
revoke all on function private.verificacao_em_andamento(uuid) from public, anon, authenticated;

/** O item do checklist está "conferido"? */
create or replace function private.item_conferido(p_itens jsonb, p_item text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_itens->p_item->>'situacao', '') = 'conferido'
$$;
revoke all on function private.item_conferido(jsonb, text) from public, anon, authenticated;

/**
 * Confere e grava um arquivo já enviado ao Storage, pela coordenação ou pelo
 * candidato. O caminho tem de ser desta pessoa e o objeto tem de existir;
 * tipo e tamanho vêm do próprio Storage. Atestado de antecedentes exige
 * "emitido em" (nem futuro, nem com mais de 90 dias) e ganha validade (90
 * dias) e data de renovação (6 meses, Lei 14.811).
 */
create or replace function private.guardar_arquivo_participante(p_participante public.participantes, p_verificacao_id uuid, p_caminho text, p jsonb, p_pelo_candidato boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_obj storage.objects;
  v_id uuid;
  v_cat text := p->>'categoria';
  v_lado text := nullif(p->>'lado', '');
  v_data date;
  v_codigo text := nullif(left(trim(coalesce(p->>'codigo_autenticacao', '')), 80), '');
begin
  if v_cat is null or v_cat not in ('documento_identidade','antecedentes_pcerj','antecedentes_pf','comprovante_residencia','registro_profissional','outro') then
    raise exception 'Escolha o tipo do documento.' using errcode = 'P0001';
  end if;
  if v_lado is not null and v_lado not in ('frente','verso','unico') then raise exception 'Lado inválido.' using errcode = 'P0001'; end if;
  if p_caminho is null or p_caminho !~ ('^' || p_participante.workspace_id || '/' || p_participante.id || '/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$') then
    raise exception 'Caminho inválido.' using errcode = 'P0001';
  end if;
  select * into v_obj from storage.objects where bucket_id = 'voluntarios-arquivos' and name = p_caminho;
  if not found then raise exception 'O arquivo não chegou ao armazenamento. Envie de novo.' using errcode = 'P0001'; end if;
  if nullif(p->>'data_documento', '') is not null then
    if p->>'data_documento' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Data inválida.' using errcode = 'P0001'; end if;
    v_data := (p->>'data_documento')::date;
    if v_data > current_date then raise exception 'A data de emissão não pode ser no futuro.' using errcode = 'P0001'; end if;
  end if;
  if v_cat in ('antecedentes_pcerj','antecedentes_pf') then
    if v_data is null then raise exception 'Informe a data de emissão do atestado.' using errcode = 'P0001'; end if;
    if v_data < current_date - 90 then
      raise exception 'Este atestado foi emitido há mais de 90 dias e não vale mais. Emita um novo (é gratuito) e envie.' using errcode = 'P0001';
    end if;
  end if;
  if (select count(*) from public.participantes_arquivos a where a.participante_id = p_participante.id and a.excluido_em is null) >= 20 then
    raise exception 'Esta pessoa já tem 20 arquivos guardados. Exclua algum antes de enviar outro.' using errcode = 'P0001';
  end if;
  begin
    insert into public.participantes_arquivos (workspace_id, participante_id, verificacao_id, categoria, lado, data_documento, validade, vence_em,
      codigo_autenticacao, observacao, caminho, nome_original, tipo, tamanho, pelo_candidato, enviado_por)
    values (p_participante.workspace_id, p_participante.id, p_verificacao_id, v_cat, v_lado, v_data,
      case when v_cat in ('antecedentes_pcerj','antecedentes_pf') then v_data + 90 else nullif(p->>'validade', '')::date end,
      case when v_cat in ('antecedentes_pcerj','antecedentes_pf') then (v_data + interval '6 months')::date else null end,
      v_codigo, nullif(left(trim(coalesce(p->>'observacao', '')), 600), ''), p_caminho,
      left(coalesce(nullif(trim(p->>'nome_original'), ''), 'arquivo'), 200),
      coalesce(v_obj.metadata->>'mimetype', 'application/octet-stream'), coalesce((v_obj.metadata->>'size')::bigint, 0),
      p_pelo_candidato, case when p_pelo_candidato then null else (select auth.uid()) end)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Este arquivo já foi registrado.' using errcode = 'P0001';
  end;
  insert into public.participantes_auditoria (workspace_id, participante_id, user_id, acao, detalhe)
  values (p_participante.workspace_id, p_participante.id, case when p_pelo_candidato then null else (select auth.uid()) end, 'enviar_arquivo',
    jsonb_build_object('arquivo', v_id, 'categoria', v_cat, 'pela_pessoa', p_pelo_candidato));
  return v_id;
end $$;
revoke all on function private.guardar_arquivo_participante(public.participantes, uuid, text, jsonb, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------- acesso às tabelas

alter table public.participantes_verificacoes enable row level security;
alter table public.participantes_arquivos enable row level security;
alter table public.participantes_referencias enable row level security;
revoke all on public.participantes_verificacoes, public.participantes_arquivos, public.participantes_referencias from anon, authenticated;

-- O hash do link nunca sai pela API.
grant select (id, workspace_id, participante_id, escopo, estado, link_expira_em, link_enviado_para, lembrado_em, lembretes, termo_versao, termo_aceito_em,
  enviado_em, itens, documento_lido, sancoes, registro_profissional, parecer, restricoes, motivo, decidido_por, decidido_em, aberta_por, created_at, updated_at)
  on public.participantes_verificacoes to authenticated;
create policy participantes_verificacoes_select on public.participantes_verificacoes
  for select to authenticated using ((select private.nivel_participantes(workspace_id)) >= 2);

-- O caminho no Storage não sai pela API.
grant select (id, workspace_id, participante_id, verificacao_id, categoria, lado, data_documento, validade, vence_em, codigo_autenticacao, observacao,
  nome_original, tipo, tamanho, sha256, pelo_candidato, enviado_por, created_at, excluido_em, excluido_por, motivo_exclusao)
  on public.participantes_arquivos to authenticated;
create policy participantes_arquivos_select on public.participantes_arquivos
  for select to authenticated using ((select private.nivel_participantes(workspace_id)) >= private.nivel_da_categoria_voluntario(categoria));

grant select on public.participantes_referencias to authenticated;
create policy participantes_referencias_select on public.participantes_referencias
  for select to authenticated using ((select private.nivel_participantes(workspace_id)) >= 2);

-- ================================================================ coordenação

/**
 * Abre (ou reaproveita) a verificação em andamento e, se vier o hash, gera o
 * link do candidato: 14 dias, um link aberto por vez (o novo mata o antigo).
 * Escopo "renovacao" é só o atestado novo de quem já é voluntário.
 */
create or replace function public.abrir_verificacao_participante(p_participante_id uuid, p_escopo text default 'completa', p_token_hash text default null, p_dias integer default 14, p_enviado_para text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
  x public.participantes_verificacoes;
  v_id uuid;
begin
  select * into v from public.participantes where id = p_participante_id for update;
  if not found or (select private.nivel_participantes(v.workspace_id)) < 2 then raise exception 'Participante não encontrado.' using errcode = 'P0001'; end if;
  if v.anonimizado_em is not null then raise exception 'Cadastro anonimizado.' using errcode = 'P0001'; end if;
  if v.situacao = 'desligado' then raise exception 'Esta pessoa foi desligada.' using errcode = 'P0001'; end if;
  if p_escopo not in ('completa','renovacao') then raise exception 'Escopo inválido.' using errcode = 'P0001'; end if;
  if p_escopo = 'renovacao' and v.situacao = 'candidato' then raise exception 'Candidato passa pela verificação completa.' using errcode = 'P0001'; end if;
  if p_token_hash is not null and p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Link inválido.' using errcode = 'P0001'; end if;
  if p_dias is null or p_dias not between 1 and 30 then raise exception 'Prazo inválido.' using errcode = 'P0001'; end if;

  x := private.verificacao_em_andamento(v.id);
  if x.id is null then
    insert into public.participantes_verificacoes (workspace_id, participante_id, escopo, aberta_por)
    values (v.workspace_id, v.id, p_escopo, (select auth.uid())) returning id into v_id;
    perform private.auditar_participante(v.workspace_id, v.id, 'verificacao_abrir', jsonb_build_object('verificacao', v_id, 'escopo', p_escopo));
  else
    v_id := x.id;
  end if;
  if p_token_hash is not null then
    update public.participantes_verificacoes set
      token_hash = p_token_hash, link_expira_em = now() + make_interval(days => p_dias), link_enviado_para = left(p_enviado_para, 254),
      lembrado_em = null, lembretes = 0, estado = 'aberta', updated_at = now()
    where id = v_id;
    perform private.auditar_participante(v.workspace_id, v.id, 'verificacao_link', jsonb_build_object('verificacao', v_id, 'para', left(p_enviado_para, 254)));
  end if;
  return v_id;
end $$;

/**
 * Um item do checklist: pendente, conferido, divergente ou dispensado (com o
 * motivo na nota). Identidade e antecedentes só por quem abre o documento
 * (nível 3). "Antecedentes conferido" exige um atestado guardado e emitido
 * nos últimos 90 dias: a validade e a renovação saem dele.
 */
create or replace function public.registrar_item_verificacao(p_participante_id uuid, p_item text, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
  x public.participantes_verificacoes;
  a public.participantes_arquivos;
  v_situacao text := p->>'situacao';
  v_nota text := nullif(left(trim(coalesce(p->>'nota', '')), 600), '');
  v_dado jsonb;
begin
  select * into v from public.participantes where id = p_participante_id;
  if not found or (select private.nivel_participantes(v.workspace_id)) < 2 then raise exception 'Participante não encontrado.' using errcode = 'P0001'; end if;
  if p_item not in ('identidade','antecedentes','sancoes','registro_profissional','referencias','entrevista') then raise exception 'Item inválido.' using errcode = 'P0001'; end if;
  if p_item in ('identidade','antecedentes') and (select private.nivel_participantes(v.workspace_id)) < 3 then
    raise exception 'Só quem tem acesso a dados sensíveis confere identidade e antecedentes.' using errcode = 'P0001';
  end if;
  if v_situacao is null or v_situacao not in ('pendente','conferido','divergente','dispensado') then raise exception 'Situação inválida.' using errcode = 'P0001'; end if;
  if v_situacao in ('divergente','dispensado') and length(coalesce(v_nota, '')) < 3 then raise exception 'Escreva o motivo.' using errcode = 'P0001'; end if;
  x := private.verificacao_em_andamento(v.id);
  if x.id is null then raise exception 'Abra a verificação antes de registrar os itens.' using errcode = 'P0001'; end if;

  v_dado := jsonb_build_object('situacao', v_situacao, 'nota', v_nota, 'por', (select auth.uid()), 'por_nome', private.nome_de_quem_esta_logado(), 'em', now());
  if p_item = 'antecedentes' and v_situacao = 'conferido' then
    select * into a from public.participantes_arquivos
      where participante_id = v.id and excluido_em is null and categoria in ('antecedentes_pcerj','antecedentes_pf') and data_documento >= current_date - 90
      order by data_documento desc, created_at desc limit 1;
    if not found then raise exception 'Para marcar como conferido, guarde um atestado emitido nos últimos 90 dias.' using errcode = 'P0001'; end if;
    v_dado := v_dado || jsonb_build_object('arquivo', a.id, 'emitido_em', a.data_documento, 'vale_ate', a.validade, 'renovar_ate', a.vence_em,
      'codigo', coalesce(nullif(left(trim(coalesce(p->>'codigo', '')), 80), ''), a.codigo_autenticacao));
    if nullif(left(trim(coalesce(p->>'codigo', '')), 80), '') is not null and a.codigo_autenticacao is null then
      update public.participantes_arquivos set codigo_autenticacao = left(trim(p->>'codigo'), 80) where id = a.id;
    end if;
  end if;
  if p_item = 'entrevista' and nullif(p->>'data', '') is not null then
    if p->>'data' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Data inválida.' using errcode = 'P0001'; end if;
    v_dado := v_dado || jsonb_build_object('data', p->>'data');
  end if;
  update public.participantes_verificacoes set itens = itens || jsonb_build_object(p_item, v_dado), updated_at = now() where id = x.id;
  perform private.auditar_participante(v.workspace_id, v.id, 'verificacao_item', jsonb_build_object('verificacao', x.id, 'item', p_item, 'situacao', v_situacao));
end $$;

/** O que o Claude leu do documento, já saneado pelo servidor (sem o CPF, número mascarado) e comparado com o cadastro. Nível 3. */
create or replace function public.registrar_leitura_do_documento(p_participante_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
  x public.participantes_verificacoes;
begin
  select * into v from public.participantes where id = p_participante_id;
  if not found or (select private.nivel_participantes(v.workspace_id)) < 3 then raise exception 'Participante não encontrado.' using errcode = 'P0001'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Leitura inválida.' using errcode = 'P0001'; end if;
  if p ? 'cpf' then raise exception 'A leitura não pode guardar o CPF.' using errcode = 'P0001'; end if;
  x := private.verificacao_em_andamento(v.id);
  if x.id is null then raise exception 'Abra a verificação antes.' using errcode = 'P0001'; end if;
  update public.participantes_verificacoes set documento_lido = p || jsonb_build_object('em', now(), 'por_nome', private.nome_de_quem_esta_logado()), updated_at = now() where id = x.id;
  perform private.auditar_participante(v.workspace_id, v.id, 'verificacao_leitura', jsonb_build_object('verificacao', x.id, 'resultado', coalesce(p->'comparacao', '{}'::jsonb)));
end $$;

/**
 * O resumo das consultas à CGU. "Nada consta" em todas → item conferido;
 * alguma ocorrência → divergente (a coordenação lê e decide); alguma base
 * fora do ar → pendente (nunca "nada consta" por falha).
 */
create or replace function public.registrar_consulta_de_sancoes(p_participante_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
  x public.participantes_verificacoes;
  v_resultado text := p->>'resultado';
  v_situacao text;
begin
  select * into v from public.participantes where id = p_participante_id;
  if not found or (select private.nivel_participantes(v.workspace_id)) < 2 then raise exception 'Participante não encontrado.' using errcode = 'P0001'; end if;
  if v_resultado is null or v_resultado not in ('nada_consta','ocorrencias','incompleto') then raise exception 'Resultado inválido.' using errcode = 'P0001'; end if;
  x := private.verificacao_em_andamento(v.id);
  if x.id is null then raise exception 'Abra a verificação antes.' using errcode = 'P0001'; end if;
  v_situacao := case v_resultado when 'nada_consta' then 'conferido' when 'ocorrencias' then 'divergente' else 'pendente' end;
  update public.participantes_verificacoes set
    sancoes = p || jsonb_build_object('em', now(), 'por_nome', private.nome_de_quem_esta_logado()),
    itens = itens || jsonb_build_object('sancoes', jsonb_build_object('situacao', v_situacao, 'por', (select auth.uid()), 'por_nome', private.nome_de_quem_esta_logado(), 'em', now(),
      'nota', case v_resultado when 'nada_consta' then 'Nada consta no CEIS, CNEP, CEAF e PEP.' when 'ocorrencias' then 'Há ocorrência em alguma base: leia o resultado.' else 'Alguma base não respondeu: consulte de novo.' end)),
    updated_at = now()
  where id = x.id;
  perform private.auditar_participante(v.workspace_id, v.id, 'verificacao_sancoes', jsonb_build_object('verificacao', x.id, 'resultado', v_resultado));
end $$;

/** A coordenação guarda um arquivo que recebeu por outro caminho (a pessoa trouxe em mãos, mandou por e-mail). */
create or replace function public.registrar_arquivo_participante(p_participante_id uuid, p_caminho text, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
  x public.participantes_verificacoes;
begin
  select * into v from public.participantes where id = p_participante_id;
  if not found or (select private.nivel_participantes(v.workspace_id)) < 2 then raise exception 'Participante não encontrado.' using errcode = 'P0001'; end if;
  if v.anonimizado_em is not null then raise exception 'Cadastro anonimizado.' using errcode = 'P0001'; end if;
  if (select private.nivel_participantes(v.workspace_id)) < private.nivel_da_categoria_voluntario(coalesce(p->>'categoria', '')) then
    raise exception 'Você não tem acesso para guardar este tipo de documento.' using errcode = 'P0001';
  end if;
  x := private.verificacao_em_andamento(v.id);
  return private.guardar_arquivo_participante(v, x.id, p_caminho, p, false);
end $$;

/** A impressão digital (SHA-256) calculada pelo servidor. Só o servidor grava, uma vez. */
create or replace function public.selar_arquivo_participante(p_id uuid, p_sha256 text)
returns void language sql security definer set search_path = '' as $$
  update public.participantes_arquivos set sha256 = p_sha256 where id = p_id and sha256 is null and p_sha256 ~ '^[0-9a-f]{64}$'
$$;

/** Confere o nível, registra a abertura e devolve onde está o arquivo, para o servidor assinar o link. */
create or replace function public.abrir_arquivo_participante(p_id uuid)
returns table (caminho text, nome_original text, tipo text)
language plpgsql security definer set search_path = '' as $$
declare
  a public.participantes_arquivos;
begin
  select * into a from public.participantes_arquivos where id = p_id;
  if not found or a.excluido_em is not null or (select private.nivel_participantes(a.workspace_id)) < private.nivel_da_categoria_voluntario(a.categoria) then
    raise exception 'Arquivo não encontrado.' using errcode = 'P0001';
  end if;
  perform private.auditar_participante(a.workspace_id, a.participante_id, 'abrir_arquivo', jsonb_build_object('arquivo', a.id, 'categoria', a.categoria));
  return query select a.caminho, a.nome_original, a.tipo;
end $$;

/** Exclui com motivo: a linha fica (quem enviou, quando, por que saiu) e o servidor apaga o arquivo do Storage com o caminho devolvido. */
create or replace function public.excluir_arquivo_participante(p_id uuid, p_motivo text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  a public.participantes_arquivos;
begin
  select * into a from public.participantes_arquivos where id = p_id for update;
  if not found or a.excluido_em is not null or (select private.nivel_participantes(a.workspace_id)) < private.nivel_da_categoria_voluntario(a.categoria) then
    raise exception 'Arquivo não encontrado.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escreva o motivo da exclusão.' using errcode = 'P0001'; end if;
  update public.participantes_arquivos set excluido_em = now(), excluido_por = (select auth.uid()), motivo_exclusao = left(trim(p_motivo), 600) where id = p_id;
  perform private.auditar_participante(a.workspace_id, a.participante_id, 'excluir_arquivo', jsonb_build_object('arquivo', a.id, 'categoria', a.categoria));
  return a.caminho;
end $$;

/** Uma referência registrada pela coordenação (o candidato manda as dele pelo link). */
create or replace function public.salvar_referencia_participante(p_participante_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
  x public.participantes_verificacoes;
  v_id uuid;
begin
  select * into v from public.participantes where id = p_participante_id;
  if not found or (select private.nivel_participantes(v.workspace_id)) < 2 then raise exception 'Participante não encontrado.' using errcode = 'P0001'; end if;
  if v.anonimizado_em is not null then raise exception 'Cadastro anonimizado.' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p->>'nome', ''))) < 2 or length(trim(coalesce(p->>'relacao', ''))) < 2 then raise exception 'Informe o nome e a relação com o candidato.' using errcode = 'P0001'; end if;
  if nullif(trim(coalesce(p->>'telefone', '')), '') is null and nullif(trim(coalesce(p->>'email', '')), '') is null then raise exception 'Informe telefone ou e-mail.' using errcode = 'P0001'; end if;
  x := private.verificacao_em_andamento(v.id);
  begin
    insert into public.participantes_referencias (workspace_id, participante_id, verificacao_id, nome, relacao, telefone, email, informado_pelo_candidato)
    values (v.workspace_id, v.id, x.id, left(trim(p->>'nome'), 120), left(trim(p->>'relacao'), 120), nullif(left(trim(coalesce(p->>'telefone', '')), 30), ''),
      nullif(lower(trim(coalesce(p->>'email', ''))), ''), false)
    returning id into v_id;
  exception when check_violation then
    raise exception 'Confira o e-mail e o tamanho dos campos.' using errcode = 'P0001';
  end;
  perform private.auditar_participante(v.workspace_id, v.id, 'referencia', jsonb_build_object('referencia', v_id, 'acao', 'criar'));
  return v_id;
end $$;

/** O que a coordenação apurou com a referência: quando falou, parecer e nota. */
create or replace function public.registrar_contato_de_referencia(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.participantes_referencias;
  x public.participantes_verificacoes;
  v_parecer text := p->>'parecer';
  v_data date;
  v_total integer;
  v_feitas integer;
begin
  select * into r from public.participantes_referencias where id = p_id for update;
  if not found or (select private.nivel_participantes(r.workspace_id)) < 2 then raise exception 'Referência não encontrada.' using errcode = 'P0001'; end if;
  if v_parecer is null or v_parecer not in ('favoravel','desfavoravel','nao_localizada') then raise exception 'Escolha o parecer.' using errcode = 'P0001'; end if;
  v_data := coalesce(nullif(p->>'contatado_em', '')::date, current_date);
  if v_data > current_date then raise exception 'A data não pode ser no futuro.' using errcode = 'P0001'; end if;
  update public.participantes_referencias set
    contatado_em = v_data, contatado_por = (select auth.uid()), contatado_por_nome = private.nome_de_quem_esta_logado(),
    parecer = v_parecer, nota = nullif(left(trim(coalesce(p->>'nota', '')), 600), '')
  where id = p_id;
  -- Duas favoráveis fecham o item sozinhas; qualquer desfavorável marca divergente.
  x := private.verificacao_em_andamento(r.participante_id);
  if x.id is not null then
    select count(*), count(*) filter (where parecer = 'favoravel') into v_total, v_feitas from public.participantes_referencias where participante_id = r.participante_id;
    if exists (select 1 from public.participantes_referencias where participante_id = r.participante_id and parecer = 'desfavoravel') then
      update public.participantes_verificacoes set itens = itens || jsonb_build_object('referencias', jsonb_build_object('situacao', 'divergente', 'por', (select auth.uid()), 'por_nome', private.nome_de_quem_esta_logado(), 'em', now(), 'nota', 'Há referência desfavorável.')), updated_at = now() where id = x.id;
    elsif v_feitas >= 2 then
      update public.participantes_verificacoes set itens = itens || jsonb_build_object('referencias', jsonb_build_object('situacao', 'conferido', 'por', (select auth.uid()), 'por_nome', private.nome_de_quem_esta_logado(), 'em', now(), 'nota', v_feitas || ' referências favoráveis.')), updated_at = now() where id = x.id;
    end if;
  end if;
  perform private.auditar_participante(r.workspace_id, r.participante_id, 'referencia', jsonb_build_object('referencia', r.id, 'acao', 'contato', 'parecer', v_parecer));
end $$;

create or replace function public.remover_referencia_participante(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.participantes_referencias;
begin
  select * into r from public.participantes_referencias where id = p_id;
  if not found or (select private.nivel_participantes(r.workspace_id)) < 2 then raise exception 'Referência não encontrada.' using errcode = 'P0001'; end if;
  delete from public.participantes_referencias where id = p_id;
  perform private.auditar_participante(r.workspace_id, r.participante_id, 'referencia', jsonb_build_object('referencia', r.id, 'acao', 'remover'));
end $$;

/**
 * A decisão. Apto exige identidade e antecedentes conferidos. Apto com
 * restrição exige restrições da lista e motivo; se faltar identidade ou
 * antecedentes, a restrição "não atua com crianças e adolescentes" é
 * obrigatória (Lei 14.811). Não apto exige motivo. Grava na pessoa o que vale
 * dali em diante e fecha o link.
 */
create or replace function public.concluir_verificacao_participante(p_participante_id uuid, p_parecer text, p_restricoes text[] default '{}', p_motivo text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
  x public.participantes_verificacoes;
  v_restricoes text[] := coalesce(p_restricoes, '{}');
  v_motivo text := nullif(left(trim(coalesce(p_motivo, '')), 1200), '');
  v_completa boolean;
  permitidas constant text[] := array['sem_criancas_adolescentes','sem_acao_externa_sem_supervisao','sem_valores','sem_dados_de_assistidos'];
begin
  select * into v from public.participantes where id = p_participante_id for update;
  if not found or (select private.nivel_participantes(v.workspace_id)) < 2 then raise exception 'Participante não encontrado.' using errcode = 'P0001'; end if;
  if v.anonimizado_em is not null then raise exception 'Cadastro anonimizado.' using errcode = 'P0001'; end if;
  if p_parecer not in ('apto','apto_com_restricao','nao_apto') then raise exception 'Parecer inválido.' using errcode = 'P0001'; end if;
  x := private.verificacao_em_andamento(v.id);
  if x.id is null then raise exception 'Abra a verificação antes de decidir.' using errcode = 'P0001'; end if;
  v_completa := private.item_conferido(x.itens, 'identidade') and private.item_conferido(x.itens, 'antecedentes');
  if x.escopo = 'renovacao' then v_completa := private.item_conferido(x.itens, 'antecedentes'); end if;

  if p_parecer = 'apto' then
    if not v_completa then
      raise exception 'Para "apto", identidade e antecedentes precisam estar conferidos. Se faltar algum, aprove com restrição e o motivo.' using errcode = 'P0001';
    end if;
    v_restricoes := '{}';
  elsif p_parecer = 'apto_com_restricao' then
    if cardinality(v_restricoes) = 0 then raise exception 'Marque ao menos uma restrição.' using errcode = 'P0001'; end if;
    if not (v_restricoes <@ permitidas) then raise exception 'Restrição desconhecida.' using errcode = 'P0001'; end if;
    if not v_completa and not ('sem_criancas_adolescentes' = any (v_restricoes)) then
      raise exception 'Sem identidade e antecedentes conferidos, a restrição "Não atua com crianças e adolescentes" é obrigatória (Lei 14.811/2024).' using errcode = 'P0001';
    end if;
    if length(coalesce(v_motivo, '')) < 10 then raise exception 'Escreva o motivo da restrição (ao menos 10 caracteres).' using errcode = 'P0001'; end if;
  else
    if length(coalesce(v_motivo, '')) < 10 then raise exception 'Escreva o motivo (ao menos 10 caracteres).' using errcode = 'P0001'; end if;
    v_restricoes := '{}';
  end if;

  update public.participantes_verificacoes set
    estado = 'concluida', parecer = p_parecer, restricoes = v_restricoes, motivo = v_motivo,
    decidido_por = (select auth.uid()), decidido_em = now(), link_expira_em = case when token_hash is null then null else now() end, updated_at = now()
  where id = x.id;
  if p_parecer <> 'nao_apto' then
    update public.participantes set restricoes = v_restricoes, verificado_em = now(), updated_at = now() where id = v.id;
  end if;
  perform private.auditar_participante(v.workspace_id, v.id, 'verificacao_concluir', jsonb_build_object('verificacao', x.id, 'parecer', p_parecer, 'restricoes', to_jsonb(v_restricoes), 'completa', v_completa));
  return x.id;
end $$;

/**
 * "Aprovar com restrição" direto da lista, sem passar pelo checklist: abre a
 * verificação se não houver, conclui como apto com restrição e aprova a
 * inscrição. As regras da decisão valem iguais (a restrição de crianças e
 * adolescentes é obrigatória quando nada foi conferido).
 */
create or replace function public.aprovar_candidato_com_restricao(p_participante_id uuid, p_restricoes text[], p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
begin
  select * into v from public.participantes where id = p_participante_id;
  if not found or (select private.nivel_participantes(v.workspace_id)) < 2 then raise exception 'Participante não encontrado.' using errcode = 'P0001'; end if;
  if v.situacao <> 'candidato' then raise exception 'Só uma inscrição pendente é aprovada assim.' using errcode = 'P0001'; end if;
  perform public.abrir_verificacao_participante(v.id, 'completa');
  perform public.concluir_verificacao_participante(v.id, 'apto_com_restricao', p_restricoes, p_motivo);
  perform public.mudar_situacao_participante(v.id, 'ativo');
end $$;

/** O parecer em PDF foi gerado: fica na trilha quem o abriu. */
create or replace function public.auditar_parecer_verificacao(p_participante_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
begin
  select * into v from public.participantes where id = p_participante_id;
  if not found or (select private.nivel_participantes(v.workspace_id)) < 2 then raise exception 'Participante não encontrado.' using errcode = 'P0001'; end if;
  perform private.auditar_participante(v.workspace_id, v.id, 'parecer_pdf', '{}'::jsonb);
end $$;

/** Confere, sem decifrar, se um CPF é o do cadastro: 'sem_cpf', 'confere' ou 'diverge'. Nível 3 (quem lê o documento). */
create or replace function public.cpf_confere(p_participante_id uuid, p_cpf text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
begin
  select * into v from public.participantes where id = p_participante_id;
  if not found or (select private.nivel_participantes(v.workspace_id)) < 3 then raise exception 'Participante não encontrado.' using errcode = 'P0001'; end if;
  if v.cpf_hash is null then return 'sem_cpf'; end if;
  if v_cpf = '' then return 'diverge'; end if;
  return case when v.cpf_hash = encode(extensions.hmac(v_cpf, private.chave_participantes(), 'sha256'), 'hex') then 'confere' else 'diverge' end;
end $$;

-- ================================================================ a situação

-- Recriada com a mesma assinatura: só o ramo candidato → ativo muda. Ele passa a exigir
-- a última verificação concluída como apto ou apto com restrição.
create or replace function public.mudar_situacao_participante(p_id uuid, p_situacao text, p_motivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
  v_parecer text;
begin
  select * into v from public.participantes where id = p_id for update;
  if not found or (select private.nivel_participantes(v.workspace_id)) < 2 then
    raise exception 'Participante não encontrado.' using errcode = 'P0001';
  end if;
  if v.anonimizado_em is not null then raise exception 'Cadastro anonimizado.' using errcode = 'P0001'; end if;
  if p_situacao not in ('ativo','inativo','desligado') then raise exception 'Situação inválida.' using errcode = 'P0001'; end if;
  if p_situacao = 'desligado' and length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escreva o motivo do desligamento.' using errcode = 'P0001';
  end if;
  if v.situacao = 'candidato' and p_situacao = 'ativo' then
    select parecer into v_parecer from public.participantes_verificacoes
      where participante_id = p_id and estado = 'concluida' order by decidido_em desc nulls last limit 1;
    if v_parecer is null or v_parecer not in ('apto','apto_com_restricao') then
      raise exception 'Conclua a verificação do candidato antes de aprovar — ou aprove com a restrição “Não atua com crianças e adolescentes” e o motivo.' using errcode = 'P0001';
    end if;
  end if;
  update public.participantes set
    situacao = p_situacao,
    aprovado_por = case when v.situacao = 'candidato' and p_situacao = 'ativo' then (select auth.uid()) else aprovado_por end,
    aprovado_em = case when v.situacao = 'candidato' and p_situacao = 'ativo' then now() else aprovado_em end,
    desligado_em = case when p_situacao = 'desligado' then now() else null end,
    motivo_desligamento = case when p_situacao = 'desligado' then left(trim(p_motivo), 600) else null end,
    updated_at = now()
  where id = p_id;
  perform private.auditar_participante(v.workspace_id, p_id,
    case when v.situacao = 'candidato' and p_situacao = 'ativo' then 'aprovar' else 'situacao' end,
    jsonb_build_object('de', v.situacao, 'para', p_situacao));
end $$;

-- ================================================================ o link do candidato (service role)

/** A verificação que o link abre, enquanto ele vale. */
create or replace function private.verificacao_do_token(p_token_hash text)
returns public.participantes_verificacoes language plpgsql security definer set search_path = '' as $$
declare
  x public.participantes_verificacoes;
begin
  select * into x from public.participantes_verificacoes where token_hash = p_token_hash and estado = 'aberta' for update;
  if not found or x.link_expira_em is null or x.link_expira_em <= now() then
    raise exception 'Este link venceu ou já foi usado. Peça um novo à coordenação do Voluntariado.' using errcode = 'P0001';
  end if;
  return x;
end $$;
revoke all on function private.verificacao_do_token(text) from public, anon, authenticated;

/**
 * O candidato aceitou o termo e confirmou o CPF. Cadastro sem CPF: guarda o
 * informado (cifrado, como no salvar_participante). Cadastro com CPF: o
 * informado tem de ser o mesmo — é a primeira prova de que quem abriu o
 * link é quem se inscreveu.
 */
create or replace function public.aceitar_termo_pelo_token(p_token_hash text, p_versao text, p_cpf text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  x public.participantes_verificacoes;
  v public.participantes;
  v_chave text := private.chave_participantes();
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
begin
  x := private.verificacao_do_token(p_token_hash);
  select * into v from public.participantes where id = x.participante_id for update;
  if not found or v.anonimizado_em is not null then raise exception 'Cadastro não encontrado.' using errcode = 'P0001'; end if;
  if coalesce(p_versao, '') !~ '^[0-9]{4}-[0-9]{2}-v[0-9]+$' then raise exception 'Versão do termo inválida.' using errcode = 'P0001'; end if;
  if not private.cpf_valido(v_cpf) then raise exception 'CPF inválido.' using errcode = 'P0001'; end if;
  if v_chave is null then raise exception 'Chave de cifra indisponível.' using errcode = 'P0001'; end if;
  if v.cpf_hash is null then
    begin
      update public.participantes set
        cpf_cifrado = extensions.pgp_sym_encrypt(v_cpf, v_chave, 'cipher-algo=aes256'),
        cpf_hash = encode(extensions.hmac(v_cpf, v_chave, 'sha256'), 'hex'),
        cpf_mascara = '***.' || substr(v_cpf, 4, 3) || '.' || substr(v_cpf, 7, 3) || '-**',
        updated_at = now()
      where id = v.id;
    exception when unique_violation then
      raise exception 'Já existe um cadastro com este CPF. Fale com a coordenação do Voluntariado.' using errcode = 'P0001';
    end;
  elsif v.cpf_hash <> encode(extensions.hmac(v_cpf, v_chave, 'sha256'), 'hex') then
    raise exception 'O CPF informado não é o do cadastro. Confira os números.' using errcode = 'P0001';
  end if;
  update public.participantes_verificacoes set termo_versao = p_versao, termo_aceito_em = coalesce(termo_aceito_em, now()), updated_at = now() where id = x.id;
  insert into public.participantes_auditoria (workspace_id, participante_id, user_id, acao, detalhe)
  values (x.workspace_id, x.participante_id, null, 'verificacao_termo', jsonb_build_object('verificacao', x.id, 'versao', p_versao, 'cpf_guardado', v.cpf_hash is null));
  return x.participante_id;
end $$;

/** O candidato mandou um arquivo (até 10 por verificação). Exige o termo aceito. */
create or replace function public.registrar_arquivo_pelo_token(p_token_hash text, p_caminho text, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  x public.participantes_verificacoes;
  v public.participantes;
begin
  x := private.verificacao_do_token(p_token_hash);
  if x.termo_aceito_em is null then raise exception 'Aceite o termo antes de enviar documentos.' using errcode = 'P0001'; end if;
  select * into v from public.participantes where id = x.participante_id;
  if not found or v.anonimizado_em is not null then raise exception 'Cadastro não encontrado.' using errcode = 'P0001'; end if;
  if (select count(*) from public.participantes_arquivos a where a.verificacao_id = x.id and a.pelo_candidato and a.excluido_em is null) >= 10 then
    raise exception 'Você já enviou 10 arquivos. Remova algum para enviar outro.' using errcode = 'P0001';
  end if;
  return private.guardar_arquivo_participante(v, x.id, p_caminho, p, true);
end $$;

/** O candidato tirou um arquivo que ele mesmo mandou, antes de concluir. Devolve o caminho para o servidor apagar. */
create or replace function public.excluir_arquivo_pelo_token(p_token_hash text, p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  x public.participantes_verificacoes;
  a public.participantes_arquivos;
begin
  x := private.verificacao_do_token(p_token_hash);
  select * into a from public.participantes_arquivos where id = p_id and verificacao_id = x.id and pelo_candidato and excluido_em is null for update;
  if not found then raise exception 'Arquivo não encontrado.' using errcode = 'P0001'; end if;
  update public.participantes_arquivos set excluido_em = now(), motivo_exclusao = 'Removido pelo candidato antes do envio.' where id = a.id;
  insert into public.participantes_auditoria (workspace_id, participante_id, user_id, acao, detalhe)
  values (x.workspace_id, x.participante_id, null, 'excluir_arquivo', jsonb_build_object('arquivo', a.id, 'categoria', a.categoria, 'pela_pessoa', true));
  return a.caminho;
end $$;

/**
 * Referências e registro profissional, pelo link. As referências do
 * candidato substituem as que ele mesmo tinha mandado antes (nunca as da
 * coordenação, nem as já contatadas).
 */
create or replace function public.guardar_dados_pelo_token(p_token_hash text, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  x public.participantes_verificacoes;
  r jsonb;
  v_n integer := 0;
begin
  x := private.verificacao_do_token(p_token_hash);
  if x.termo_aceito_em is null then raise exception 'Aceite o termo antes.' using errcode = 'P0001'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Dados inválidos.' using errcode = 'P0001'; end if;

  if p ? 'registro_profissional' then
    if jsonb_typeof(p->'registro_profissional') <> 'object' then raise exception 'Registro profissional inválido.' using errcode = 'P0001'; end if;
    update public.participantes_verificacoes set registro_profissional = jsonb_build_object(
      'tem', coalesce((p->'registro_profissional'->>'tem')::boolean, false),
      'conselho', nullif(left(trim(coalesce(p->'registro_profissional'->>'conselho', '')), 40), ''),
      'numero', nullif(left(trim(coalesce(p->'registro_profissional'->>'numero', '')), 40), ''),
      'uf', nullif(upper(left(trim(coalesce(p->'registro_profissional'->>'uf', '')), 2)), '')
    ), updated_at = now() where id = x.id;
  end if;

  if p ? 'referencias' then
    if jsonb_typeof(p->'referencias') <> 'array' or jsonb_array_length(p->'referencias') not between 2 and 3 then
      raise exception 'Indique duas ou três referências.' using errcode = 'P0001';
    end if;
    delete from public.participantes_referencias where verificacao_id = x.id and informado_pelo_candidato and contatado_em is null;
    for r in select * from jsonb_array_elements(p->'referencias') loop
      if length(trim(coalesce(r->>'nome', ''))) < 2 or length(trim(coalesce(r->>'relacao', ''))) < 2 then raise exception 'Cada referência precisa de nome e de qual é a relação com você.' using errcode = 'P0001'; end if;
      if nullif(trim(coalesce(r->>'telefone', '')), '') is null and nullif(trim(coalesce(r->>'email', '')), '') is null then raise exception 'Cada referência precisa de telefone ou e-mail.' using errcode = 'P0001'; end if;
      begin
        insert into public.participantes_referencias (workspace_id, participante_id, verificacao_id, nome, relacao, telefone, email, informado_pelo_candidato)
        values (x.workspace_id, x.participante_id, x.id, left(trim(r->>'nome'), 120), left(trim(r->>'relacao'), 120), nullif(left(trim(coalesce(r->>'telefone', '')), 30), ''),
          nullif(lower(trim(coalesce(r->>'email', ''))), ''), true);
      exception when check_violation then
        raise exception 'Confira o e-mail das referências.' using errcode = 'P0001';
      end;
      v_n := v_n + 1;
    end loop;
  end if;
  update public.participantes_verificacoes set updated_at = now() where id = x.id;
end $$;

/**
 * O candidato concluiu: precisa do documento com foto e do atestado (só do
 * atestado, na renovação) e de duas referências (não na renovação). O link
 * morre; a verificação passa a "enviada" e a coordenação é avisada pelo
 * servidor com o que esta função devolve.
 */
create or replace function public.concluir_envio_pelo_token(p_token_hash text)
returns table (participante_id uuid, workspace_id uuid, nome text, verificacao_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  x public.participantes_verificacoes;
  v public.participantes;
  v_identidade integer;
  v_antecedentes integer;
  v_referencias integer;
begin
  x := private.verificacao_do_token(p_token_hash);
  if x.termo_aceito_em is null then raise exception 'Aceite o termo antes.' using errcode = 'P0001'; end if;
  select * into v from public.participantes where id = x.participante_id;
  if not found or v.anonimizado_em is not null then raise exception 'Cadastro não encontrado.' using errcode = 'P0001'; end if;
  select count(*) filter (where categoria = 'documento_identidade'), count(*) filter (where categoria in ('antecedentes_pcerj','antecedentes_pf'))
    into v_identidade, v_antecedentes
    from public.participantes_arquivos a where a.participante_id = v.id and a.excluido_em is null;
  select count(*) into v_referencias from public.participantes_referencias r where r.participante_id = v.id;
  if v_antecedentes = 0 then raise exception 'Falta o atestado de antecedentes.' using errcode = 'P0001'; end if;
  if x.escopo = 'completa' then
    if v_identidade = 0 then raise exception 'Falta o documento com foto.' using errcode = 'P0001'; end if;
    if v_referencias < 2 then raise exception 'Faltam as duas referências.' using errcode = 'P0001'; end if;
  end if;
  -- O hash fica (o link usado mostra "não vale mais" em vez de "página não encontrada"); o vencimento é agora.
  update public.participantes_verificacoes set estado = 'enviada', enviado_em = now(), link_expira_em = now(), updated_at = now() where id = x.id;
  insert into public.participantes_auditoria (workspace_id, participante_id, user_id, acao, detalhe)
  values (x.workspace_id, x.participante_id, null, 'verificacao_enviada', jsonb_build_object('verificacao', x.id, 'arquivos', v_identidade + v_antecedentes, 'referencias', v_referencias));
  return query select v.id, v.workspace_id, coalesce(v.nome_social, v.nome), x.id;
end $$;

/** O que a página pública mostra, pelo hash: quem é (primeiro nome), escopo, se o termo foi aceito, se o cadastro tem CPF e o que já foi enviado. */
create or replace function public.verificacao_pelo_token(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  x public.participantes_verificacoes;
  v public.participantes;
begin
  select * into x from public.participantes_verificacoes where token_hash = p_token_hash;
  if not found then return null; end if;
  if x.estado <> 'aberta' or x.link_expira_em is null or x.link_expira_em <= now() then return jsonb_build_object('aberto', false); end if;
  select * into v from public.participantes where id = x.participante_id;
  if not found or v.anonimizado_em is not null or v.situacao = 'desligado' then return jsonb_build_object('aberto', false); end if;
  return jsonb_build_object(
    'aberto', true, 'participanteId', v.id, 'workspaceId', v.workspace_id, 'escopo', x.escopo, 'nome', split_part(trim(coalesce(v.nome_social, v.nome)), ' ', 1),
    'termoAceito', x.termo_aceito_em is not null, 'temCpf', v.cpf_hash is not null, 'expiraEm', x.link_expira_em,
    'registroProfissional', x.registro_profissional,
    'arquivos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'categoria', a.categoria, 'lado', a.lado, 'nome', a.nome_original, 'tamanho', a.tamanho, 'dataDocumento', a.data_documento) order by a.created_at)
      from public.participantes_arquivos a where a.verificacao_id = x.id and a.pelo_candidato and a.excluido_em is null), '[]'::jsonb),
    'referencias', coalesce((select jsonb_agg(jsonb_build_object('nome', r.nome, 'relacao', r.relacao, 'telefone', r.telefone, 'email', r.email) order by r.created_at)
      from public.participantes_referencias r where r.verificacao_id = x.id and r.informado_pelo_candidato), '[]'::jsonb)
  );
end $$;

/** O CPF decifrado, só para a consulta às bases da CGU, pelo servidor, a pedido de alguém com nível para isso. Fica na trilha. */
create or replace function public.cpf_para_verificacao(p_participante_id uuid, p_user_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
  v_chave text := private.chave_participantes();
  v_nivel integer;
begin
  select * into v from public.participantes where id = p_participante_id;
  if not found then raise exception 'Participante não encontrado.' using errcode = 'P0001'; end if;
  -- Mesma régua de private.nivel_participantes, para o usuário informado (a sessão aqui é o servidor).
  select case
    when exists (select 1 from public.workspace_members m where m.workspace_id = v.workspace_id and m.user_id = p_user_id and m.role = 'admin') then 3
    else coalesce((select case a.nivel when 'sensiveis' then 3 when 'gerenciar' then 2 else 1 end from public.participantes_acesso a where a.workspace_id = v.workspace_id and a.user_id = p_user_id), 0)
  end into v_nivel;
  if v_nivel < 2 then raise exception 'Sem acesso para consultar.' using errcode = 'P0001'; end if;
  if v.cpf_cifrado is null then return null; end if;
  if v_chave is null then raise exception 'Chave de cifra indisponível.' using errcode = 'P0001'; end if;
  insert into public.participantes_auditoria (workspace_id, participante_id, user_id, acao, detalhe)
  values (v.workspace_id, v.id, p_user_id, 'consulta_externa', jsonb_build_object('bases', 'CGU'));
  return extensions.pgp_sym_decrypt(v.cpf_cifrado, v_chave);
end $$;

-- ---------------------------------------------------------------- permissões das funções

revoke all on function public.abrir_verificacao_participante(uuid, text, text, integer, text) from public, anon;
revoke all on function public.registrar_item_verificacao(uuid, text, jsonb) from public, anon;
revoke all on function public.registrar_leitura_do_documento(uuid, jsonb) from public, anon;
revoke all on function public.registrar_consulta_de_sancoes(uuid, jsonb) from public, anon;
revoke all on function public.registrar_arquivo_participante(uuid, text, jsonb) from public, anon;
revoke all on function public.abrir_arquivo_participante(uuid) from public, anon;
revoke all on function public.excluir_arquivo_participante(uuid, text) from public, anon;
revoke all on function public.salvar_referencia_participante(uuid, jsonb) from public, anon;
revoke all on function public.registrar_contato_de_referencia(uuid, jsonb) from public, anon;
revoke all on function public.remover_referencia_participante(uuid) from public, anon;
revoke all on function public.concluir_verificacao_participante(uuid, text, text[], text) from public, anon;
revoke all on function public.aprovar_candidato_com_restricao(uuid, text[], text) from public, anon;
revoke all on function public.auditar_parecer_verificacao(uuid) from public, anon;
revoke all on function public.cpf_confere(uuid, text) from public, anon;
grant execute on function public.abrir_verificacao_participante(uuid, text, text, integer, text) to authenticated;
grant execute on function public.registrar_item_verificacao(uuid, text, jsonb) to authenticated;
grant execute on function public.registrar_leitura_do_documento(uuid, jsonb) to authenticated;
grant execute on function public.registrar_consulta_de_sancoes(uuid, jsonb) to authenticated;
grant execute on function public.registrar_arquivo_participante(uuid, text, jsonb) to authenticated;
grant execute on function public.abrir_arquivo_participante(uuid) to authenticated;
grant execute on function public.excluir_arquivo_participante(uuid, text) to authenticated;
grant execute on function public.salvar_referencia_participante(uuid, jsonb) to authenticated;
grant execute on function public.registrar_contato_de_referencia(uuid, jsonb) to authenticated;
grant execute on function public.remover_referencia_participante(uuid) to authenticated;
grant execute on function public.concluir_verificacao_participante(uuid, text, text[], text) to authenticated;
grant execute on function public.aprovar_candidato_com_restricao(uuid, text[], text) to authenticated;
grant execute on function public.auditar_parecer_verificacao(uuid) to authenticated;
grant execute on function public.cpf_confere(uuid, text) to authenticated;

revoke all on function public.selar_arquivo_participante(uuid, text) from public, anon, authenticated;
revoke all on function public.aceitar_termo_pelo_token(text, text, text) from public, anon, authenticated;
revoke all on function public.registrar_arquivo_pelo_token(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.excluir_arquivo_pelo_token(text, uuid) from public, anon, authenticated;
revoke all on function public.guardar_dados_pelo_token(text, jsonb) from public, anon, authenticated;
revoke all on function public.concluir_envio_pelo_token(text) from public, anon, authenticated;
revoke all on function public.verificacao_pelo_token(text) from public, anon, authenticated;
revoke all on function public.cpf_para_verificacao(uuid, uuid) from public, anon, authenticated;
grant execute on function public.selar_arquivo_participante(uuid, text) to service_role;
grant execute on function public.aceitar_termo_pelo_token(text, text, text) to service_role;
grant execute on function public.registrar_arquivo_pelo_token(text, text, jsonb) to service_role;
grant execute on function public.excluir_arquivo_pelo_token(text, uuid) to service_role;
grant execute on function public.guardar_dados_pelo_token(text, jsonb) to service_role;
grant execute on function public.concluir_envio_pelo_token(text) to service_role;
grant execute on function public.verificacao_pelo_token(text) to service_role;
grant execute on function public.cpf_para_verificacao(uuid, uuid) to service_role;

-- ================================================================ anonimização

-- Molde: participantes_sem_foto_ao_anonimizar (20260928100000). Referências somem; a
-- verificação perde link, leitura, sanções, registro e motivo (fica o parecer, sem
-- identificar ninguém); os arquivos ficam marcados como excluídos — o servidor apaga a
-- pasta do Storage (lib/participantes/verificacao/arquivos.ts).
create or replace function private.participante_sem_verificacao_ao_anonimizar()
returns trigger language plpgsql set search_path = '' as $$
begin
  delete from public.participantes_referencias where participante_id = new.id;
  update public.participantes_verificacoes set
    token_hash = null, link_expira_em = null, link_enviado_para = null, documento_lido = null, sancoes = null, registro_profissional = null,
    motivo = null, itens = '{}'::jsonb, estado = case when estado in ('aberta','enviada') then 'cancelada' else estado end, updated_at = now()
  where participante_id = new.id;
  update public.participantes_arquivos set
    excluido_em = coalesce(excluido_em, now()), motivo_exclusao = coalesce(motivo_exclusao, 'Dados apagados a pedido do titular (LGPD).'),
    nome_original = 'arquivo', codigo_autenticacao = null, observacao = null
  where participante_id = new.id;
  new.restricoes := '{}';
  return new;
end $$;
drop trigger if exists participantes_sem_verificacao_ao_anonimizar on public.participantes;
create trigger participantes_sem_verificacao_ao_anonimizar
  before update of anonimizado_em on public.participantes
  for each row when (new.anonimizado_em is not null and old.anonimizado_em is null)
  execute function private.participante_sem_verificacao_ao_anonimizar();
