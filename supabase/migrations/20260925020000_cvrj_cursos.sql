-- Cursos, apostilas e certificados da Área do Voluntário.
--
-- A coordenação monta os cursos no Redação (módulos, aulas com vídeo do
-- YouTube não listado e texto, apostilas em PDF, prova opcional). O
-- voluntário assiste na área do membro; ao concluir as aulas — e passar na
-- prova, quando o curso tem uma — o certificado sai sozinho, com código de
-- verificação, e entra nas formações do cadastro dele.
--
-- Escrita da equipe: direto nas tabelas, sob o nível do Voluntariado
-- (gerenciar = 2). Lado do voluntário: só funções chamadas pelo servidor
-- (service_role), com o participante da sessão.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('membro-materiais', 'membro-materiais', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cursos-capas', 'cursos-capas', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------- conteúdo

create table if not exists public.cursos (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete restrict,
  titulo         text not null check (length(trim(titulo)) between 3 and 160),
  resumo         text check (resumo is null or length(resumo) <= 300),
  descricao      text check (descricao is null or length(descricao) <= 6000),
  capa_caminho   text,
  carga_horaria  numeric(5,1) check (carga_horaria is null or (carga_horaria > 0 and carga_horaria <= 999)),
  nota_minima    integer check (nota_minima is null or nota_minima between 1 and 100),
  validade_meses integer check (validade_meses is null or validade_meses between 1 and 120),
  publicado      boolean not null default false,
  ordem          integer not null default 0,
  criado_por     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists cursos_workspace_idx on public.cursos (workspace_id, publicado, ordem);
create index if not exists cursos_criado_por_idx on public.cursos (criado_por);

create table if not exists public.curso_modulos (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  curso_id     uuid not null references public.cursos (id) on delete cascade,
  titulo       text not null check (length(trim(titulo)) between 2 and 160),
  ordem        integer not null default 0
);
create index if not exists curso_modulos_curso_idx on public.curso_modulos (curso_id, ordem);
create index if not exists curso_modulos_workspace_idx on public.curso_modulos (workspace_id);

create table if not exists public.materiais (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete restrict,
  curso_id      uuid references public.cursos (id) on delete set null,
  titulo        text not null check (length(trim(titulo)) between 2 and 200),
  descricao     text check (descricao is null or length(descricao) <= 600),
  caminho       text not null unique,
  nome_original text not null check (length(nome_original) <= 200),
  tamanho       bigint not null,
  publicado     boolean not null default true,
  criado_por    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists materiais_workspace_idx on public.materiais (workspace_id, publicado);
create index if not exists materiais_curso_idx on public.materiais (curso_id);
create index if not exists materiais_criado_por_idx on public.materiais (criado_por);

create table if not exists public.curso_aulas (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  curso_id     uuid not null references public.cursos (id) on delete cascade,
  modulo_id    uuid not null references public.curso_modulos (id) on delete cascade,
  titulo       text not null check (length(trim(titulo)) between 2 and 160),
  youtube_id   text check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  texto        text check (texto is null or length(texto) <= 20000),
  material_id  uuid references public.materiais (id) on delete set null,
  duracao_min  integer check (duracao_min is null or duracao_min between 1 and 600),
  ordem        integer not null default 0,
  check (youtube_id is not null or texto is not null or material_id is not null)
);
create index if not exists curso_aulas_curso_idx on public.curso_aulas (curso_id, ordem);
create index if not exists curso_aulas_modulo_idx on public.curso_aulas (modulo_id, ordem);
create index if not exists curso_aulas_workspace_idx on public.curso_aulas (workspace_id);
create index if not exists curso_aulas_material_idx on public.curso_aulas (material_id);

create table if not exists public.curso_questoes (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  curso_id     uuid not null references public.cursos (id) on delete cascade,
  enunciado    text not null check (length(trim(enunciado)) between 3 and 1000),
  alternativas text[] not null check (cardinality(alternativas) between 2 and 6),
  correta      integer not null check (correta >= 0),
  ordem        integer not null default 0,
  check (correta < cardinality(alternativas))
);
create index if not exists curso_questoes_curso_idx on public.curso_questoes (curso_id, ordem);
create index if not exists curso_questoes_workspace_idx on public.curso_questoes (workspace_id);

-- ---------------------------------------------------------------- percurso do voluntário

create table if not exists public.membro_aulas_concluidas (
  participante_id uuid not null references public.participantes (id) on delete cascade,
  aula_id         uuid not null references public.curso_aulas (id) on delete cascade,
  curso_id        uuid not null references public.cursos (id) on delete cascade,
  concluida_em    timestamptz not null default now(),
  primary key (participante_id, aula_id)
);
create index if not exists membro_aulas_curso_idx on public.membro_aulas_concluidas (curso_id, participante_id);
create index if not exists membro_aulas_aula_idx on public.membro_aulas_concluidas (aula_id);

create table if not exists public.membro_provas (
  id              uuid primary key default gen_random_uuid(),
  participante_id uuid not null references public.participantes (id) on delete cascade,
  curso_id        uuid not null references public.cursos (id) on delete cascade,
  respostas       integer[] not null,
  acertos         integer not null,
  total           integer not null,
  nota            integer not null,
  aprovado        boolean not null,
  created_at      timestamptz not null default now()
);
create index if not exists membro_provas_idx on public.membro_provas (participante_id, curso_id, created_at desc);
create index if not exists membro_provas_curso_idx on public.membro_provas (curso_id);

create table if not exists public.certificados (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete restrict,
  participante_id uuid not null references public.participantes (id) on delete cascade,
  curso_id        uuid references public.cursos (id) on delete set null,
  codigo          text not null unique check (codigo ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'),
  nome            text not null,
  curso_titulo    text not null,
  carga_horaria   numeric(5,1),
  nota            integer,
  emitido_em      timestamptz not null default now(),
  valido_ate      date,
  formacao_id     uuid references public.participante_formacoes (id) on delete set null,
  revogado_em     timestamptz,
  revogado_por    uuid references public.profiles (id) on delete set null,
  motivo_revogacao text check (motivo_revogacao is null or length(motivo_revogacao) <= 600)
);
create unique index if not exists certificados_um_por_curso on public.certificados (participante_id, curso_id) where revogado_em is null;
create index if not exists certificados_workspace_idx on public.certificados (workspace_id, emitido_em desc);
create index if not exists certificados_curso_idx on public.certificados (curso_id);
create index if not exists certificados_formacao_idx on public.certificados (formacao_id);
create index if not exists certificados_revogado_por_idx on public.certificados (revogado_por);

-- ---------------------------------------------------------------- acesso da equipe

alter table public.cursos enable row level security;
alter table public.curso_modulos enable row level security;
alter table public.curso_aulas enable row level security;
alter table public.curso_questoes enable row level security;
alter table public.materiais enable row level security;
alter table public.membro_aulas_concluidas enable row level security;
alter table public.membro_provas enable row level security;
alter table public.certificados enable row level security;

revoke all on public.cursos, public.curso_modulos, public.curso_aulas, public.curso_questoes, public.materiais,
  public.membro_aulas_concluidas, public.membro_provas, public.certificados from anon, authenticated;

grant select, insert, update, delete on public.cursos, public.curso_modulos, public.curso_aulas, public.curso_questoes to authenticated;
grant select, update, delete on public.materiais to authenticated;
grant select on public.membro_aulas_concluidas, public.membro_provas, public.certificados to authenticated;

do $$
declare t text;
begin
  foreach t in array array['cursos','curso_modulos','curso_aulas','curso_questoes'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select private.nivel_participantes(workspace_id)) >= 1)', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.nivel_participantes(workspace_id)) >= 2)', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.nivel_participantes(workspace_id)) >= 2) with check ((select private.nivel_participantes(workspace_id)) >= 2)', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.nivel_participantes(workspace_id)) >= 2)', t || '_delete', t);
  end loop;
end $$;
create policy materiais_select on public.materiais for select to authenticated using ((select private.nivel_participantes(workspace_id)) >= 1);
create policy materiais_update on public.materiais for update to authenticated
  using ((select private.nivel_participantes(workspace_id)) >= 2) with check ((select private.nivel_participantes(workspace_id)) >= 2);
create policy materiais_delete on public.materiais for delete to authenticated using ((select private.nivel_participantes(workspace_id)) >= 2);
create policy membro_aulas_select on public.membro_aulas_concluidas for select to authenticated
  using (exists (select 1 from public.cursos c where c.id = curso_id and (select private.nivel_participantes(c.workspace_id)) >= 1));
create policy membro_provas_select on public.membro_provas for select to authenticated
  using (exists (select 1 from public.cursos c where c.id = curso_id and (select private.nivel_participantes(c.workspace_id)) >= 1));
create policy certificados_select on public.certificados for select to authenticated using ((select private.nivel_participantes(workspace_id)) >= 1);

-- Coerência: módulo, aula e questão ficam no espaço e no curso de quem é dono.
create or replace function private.curso_coerente()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid;
begin
  select workspace_id into v_ws from public.cursos where id = new.curso_id;
  if v_ws is null or v_ws <> new.workspace_id then raise exception 'Curso de outro espaço.' using errcode = 'P0001'; end if;
  if tg_table_name = 'curso_aulas' then
    if not exists (select 1 from public.curso_modulos m where m.id = new.modulo_id and m.curso_id = new.curso_id) then
      raise exception 'Módulo de outro curso.' using errcode = 'P0001';
    end if;
    if new.material_id is not null and not exists (select 1 from public.materiais x where x.id = new.material_id and x.workspace_id = new.workspace_id) then
      raise exception 'Apostila de outro espaço.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger curso_modulos_coerente before insert or update on public.curso_modulos for each row execute function private.curso_coerente();
create trigger curso_aulas_coerente before insert or update on public.curso_aulas for each row execute function private.curso_coerente();
create trigger curso_questoes_coerente before insert or update on public.curso_questoes for each row execute function private.curso_coerente();

/** Apostila enviada: o banco confere o nível, o caminho e que o arquivo chegou. */
create or replace function public.registrar_material(p_workspace_id uuid, p_caminho text, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_obj storage.objects;
  v_id uuid;
begin
  if (select private.nivel_participantes(p_workspace_id)) < 2 then raise exception 'Você não tem acesso para enviar apostilas.' using errcode = 'P0001'; end if;
  if p_caminho is null or p_caminho !~ ('^' || p_workspace_id || '/[0-9a-f-]{36}\.pdf$') then raise exception 'Caminho inválido.' using errcode = 'P0001'; end if;
  select * into v_obj from storage.objects where bucket_id = 'membro-materiais' and name = p_caminho;
  if not found then raise exception 'O arquivo não chegou ao armazenamento. Envie de novo.' using errcode = 'P0001'; end if;
  if nullif(p->>'curso_id', '') is not null and not exists (select 1 from public.cursos c where c.id = (p->>'curso_id')::uuid and c.workspace_id = p_workspace_id) then
    raise exception 'Curso não encontrado.' using errcode = 'P0001';
  end if;
  insert into public.materiais (workspace_id, curso_id, titulo, descricao, caminho, nome_original, tamanho, criado_por)
  values (p_workspace_id, nullif(p->>'curso_id', '')::uuid, left(trim(coalesce(p->>'titulo', '')), 200), nullif(left(trim(coalesce(p->>'descricao', '')), 600), ''),
    p_caminho, left(coalesce(nullif(trim(p->>'nome_original'), ''), 'apostila.pdf'), 200), coalesce((v_obj.metadata->>'size')::bigint, 0), (select auth.uid()))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.revogar_certificado(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.certificados;
begin
  select * into c from public.certificados where id = p_id for update;
  if not found or (select private.nivel_participantes(c.workspace_id)) < 2 or c.revogado_em is not null then
    raise exception 'Certificado não encontrado.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escreva o motivo.' using errcode = 'P0001'; end if;
  update public.certificados set revogado_em = now(), revogado_por = (select auth.uid()), motivo_revogacao = left(trim(p_motivo), 600) where id = p_id;
  delete from public.participante_formacoes where id = c.formacao_id;
  perform private.auditar_participante(c.workspace_id, c.participante_id, 'revogar_certificado', jsonb_build_object('codigo', c.codigo, 'curso', c.curso_titulo));
end $$;

-- ---------------------------------------------------------------- lado do voluntário

/** Código legível, sem letras que se confundem (I, O, 0, 1): ABCD-2345. */
create or replace function private.codigo_de_certificado()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(8);
  s text := '';
  i int;
begin
  for i in 0..7 loop
    s := s || substr(alfabeto, (get_byte(b, i) % 32) + 1, 1);
    if i = 3 then s := s || '-'; end if;
  end loop;
  return s;
end $$;

/** Emite (uma vez) o certificado do curso e registra a formação no cadastro. */
create or replace function private.emitir_certificado(p_participante_id uuid, p_curso_id uuid, p_nota integer)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_part public.participantes;
  v_curso public.cursos;
  v_codigo text;
  v_formacao uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_validade date;
begin
  select codigo into v_codigo from public.certificados where participante_id = p_participante_id and curso_id = p_curso_id and revogado_em is null;
  if found then return v_codigo; end if;
  select * into v_part from public.participantes where id = p_participante_id;
  select * into v_curso from public.cursos where id = p_curso_id;
  v_validade := case when v_curso.validade_meses is null then null else (v_hoje + make_interval(months => v_curso.validade_meses))::date end;
  insert into public.participante_formacoes (workspace_id, participante_id, titulo, instituicao, concluido_em, valido_ate)
  values (v_part.workspace_id, v_part.id, left(v_curso.titulo, 200), 'Cruz Vermelha Brasileira – RJ (Área do Voluntário)', v_hoje, v_validade)
  returning id into v_formacao;
  loop
    v_codigo := private.codigo_de_certificado();
    begin
      insert into public.certificados (workspace_id, participante_id, curso_id, codigo, nome, curso_titulo, carga_horaria, nota, valido_ate, formacao_id)
      values (v_part.workspace_id, v_part.id, v_curso.id, v_codigo, v_part.nome, v_curso.titulo, v_curso.carga_horaria, p_nota, v_validade, v_formacao);
      exit;
    exception when unique_violation then
      if exists (select 1 from public.certificados where participante_id = p_participante_id and curso_id = p_curso_id and revogado_em is null) then
        delete from public.participante_formacoes where id = v_formacao;
        select codigo into v_codigo from public.certificados where participante_id = p_participante_id and curso_id = p_curso_id and revogado_em is null;
        return v_codigo;
      end if;
    end;
  end loop;
  insert into public.participantes_auditoria (workspace_id, participante_id, acao, detalhe)
  values (v_part.workspace_id, v_part.id, 'certificado_emitido', jsonb_build_object('codigo', v_codigo, 'curso', v_curso.titulo));
  return v_codigo;
end $$;
revoke all on function private.emitir_certificado(uuid, uuid, integer) from public, anon, authenticated;

create or replace function private.curso_do_membro(p_participante_id uuid, p_curso_id uuid)
returns public.cursos language plpgsql stable security definer set search_path = '' as $$
declare
  v_curso public.cursos;
begin
  select c.* into v_curso from public.cursos c join public.participantes p on p.workspace_id = c.workspace_id
   where c.id = p_curso_id and c.publicado and p.id = p_participante_id and p.situacao = 'ativo' and p.anonimizado_em is null;
  if not found then raise exception 'Curso não encontrado.' using errcode = 'P0001'; end if;
  return v_curso;
end $$;
revoke all on function private.curso_do_membro(uuid, uuid) from public, anon, authenticated;

/**
 * Marca a aula como vista. Se era a última e o curso não tem prova, emite o
 * certificado. Devolve o que mudou.
 */
create or replace function public.membro_concluir_aula(p_participante_id uuid, p_aula_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_aula public.curso_aulas;
  v_curso public.cursos;
  v_faltam integer;
  v_tem_prova boolean;
  v_codigo text;
begin
  select * into v_aula from public.curso_aulas where id = p_aula_id;
  if not found then raise exception 'Aula não encontrada.' using errcode = 'P0001'; end if;
  v_curso := private.curso_do_membro(p_participante_id, v_aula.curso_id);
  insert into public.membro_aulas_concluidas (participante_id, aula_id, curso_id) values (p_participante_id, p_aula_id, v_curso.id)
  on conflict do nothing;
  select count(*) into v_faltam from public.curso_aulas a
   where a.curso_id = v_curso.id and not exists (select 1 from public.membro_aulas_concluidas m where m.aula_id = a.id and m.participante_id = p_participante_id);
  v_tem_prova := v_curso.nota_minima is not null and exists (select 1 from public.curso_questoes q where q.curso_id = v_curso.id);
  if v_faltam = 0 and not v_tem_prova then v_codigo := private.emitir_certificado(p_participante_id, v_curso.id, null); end if;
  return jsonb_build_object('faltam', v_faltam, 'prova', v_faltam = 0 and v_tem_prova, 'certificado', v_codigo);
end $$;

/**
 * Corrige a prova. Só depois de todas as aulas; até 3 tentativas a cada 24 h.
 * Aprovado, emite o certificado. As respostas certas nunca saem daqui.
 */
create or replace function public.membro_responder_prova(p_participante_id uuid, p_curso_id uuid, p_respostas integer[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_curso public.cursos;
  v_corretas integer[];
  v_total integer;
  v_acertos integer := 0;
  v_nota integer;
  v_aprovado boolean;
  v_codigo text;
  i integer;
begin
  v_curso := private.curso_do_membro(p_participante_id, p_curso_id);
  if v_curso.nota_minima is null then raise exception 'Este curso não tem prova.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.curso_aulas a where a.curso_id = v_curso.id
             and not exists (select 1 from public.membro_aulas_concluidas m where m.aula_id = a.id and m.participante_id = p_participante_id)) then
    raise exception 'Conclua todas as aulas antes da prova.' using errcode = 'P0001';
  end if;
  select codigo into v_codigo from public.certificados where participante_id = p_participante_id and curso_id = v_curso.id and revogado_em is null;
  if found then return jsonb_build_object('aprovado', true, 'certificado', v_codigo, 'ja_aprovado', true); end if;
  if (select count(*) from public.membro_provas where participante_id = p_participante_id and curso_id = v_curso.id and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'Você já fez 3 tentativas nas últimas 24 horas. Revise as aulas e tente amanhã.' using errcode = 'P0001';
  end if;
  select array_agg(correta order by ordem, id) into v_corretas from public.curso_questoes where curso_id = v_curso.id;
  v_total := coalesce(cardinality(v_corretas), 0);
  if v_total = 0 then raise exception 'Este curso não tem prova.' using errcode = 'P0001'; end if;
  if p_respostas is null or cardinality(p_respostas) <> v_total then raise exception 'Responda todas as questões.' using errcode = 'P0001'; end if;
  for i in 1..v_total loop
    if p_respostas[i] = v_corretas[i] then v_acertos := v_acertos + 1; end if;
  end loop;
  v_nota := round(100.0 * v_acertos / v_total);
  v_aprovado := v_nota >= v_curso.nota_minima;
  insert into public.membro_provas (participante_id, curso_id, respostas, acertos, total, nota, aprovado)
  values (p_participante_id, v_curso.id, p_respostas, v_acertos, v_total, v_nota, v_aprovado);
  if v_aprovado then v_codigo := private.emitir_certificado(p_participante_id, v_curso.id, v_nota); end if;
  return jsonb_build_object('aprovado', v_aprovado, 'nota', v_nota, 'acertos', v_acertos, 'total', v_total, 'minima', v_curso.nota_minima, 'certificado', v_codigo);
end $$;

revoke all on function public.registrar_material(uuid, text, jsonb) from public, anon;
revoke all on function public.revogar_certificado(uuid, text) from public, anon;
revoke all on function public.membro_concluir_aula(uuid, uuid) from public, anon, authenticated;
revoke all on function public.membro_responder_prova(uuid, uuid, integer[]) from public, anon, authenticated;
revoke all on function private.codigo_de_certificado() from public, anon, authenticated;
revoke all on function private.curso_coerente() from public, anon, authenticated;
grant execute on function public.registrar_material(uuid, text, jsonb) to authenticated;
grant execute on function public.revogar_certificado(uuid, text) to authenticated;
grant execute on function public.membro_concluir_aula(uuid, uuid) to service_role;
grant execute on function public.membro_responder_prova(uuid, uuid, integer[]) to service_role;
