-- Fichas de voluntariado do site na Redação (27/10/2026).
--
-- O cadastro de voluntários do site (cruzvermelhariodejaneiro.org/voluntariado/cadastro/) grava as fichas no
-- banco do site (MySQL, Hostinger). A Redação passa a buscá-las pela API do site
-- (/matricula-cursos-presenciais/api/redacao-voluntarios.php, lib/voluntariado/fichas-do-site.ts) e cada uma vira
-- uma "Inscrição pendente" (situacao 'candidato', origem 'importacao'). Aprovar aqui avisa o site, que aceita a
-- ficha, cria o cadastro no ponto da sede e devolve o código de aprovação (QR conferido em /conferir/).
--
-- Só acrescenta: três colunas em participantes, uma tabela de controle da sincronização e funções restritas ao
-- servidor (service_role). Nada muda para o formulário público da Redação.

-- 1. A ligação de cada participante com a ficha do site.
alter table public.participantes add column if not exists site_protocolo text;
alter table public.participantes add column if not exists site_codigo_aprovacao text;
alter table public.participantes add column if not exists site_aprovacao_em timestamptz;
do $$ begin
  alter table public.participantes add constraint participantes_site_protocolo_formato
    check (site_protocolo is null or site_protocolo ~ '^VOL-[0-9]{6}-[0-9]{4,}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.participantes add constraint participantes_site_codigo_formato
    check (site_codigo_aprovacao is null or site_codigo_aprovacao ~ '^[A-HJ-NP-Z2-9]{8}$');
exception when duplicate_object then null; end $$;
-- Uma ficha do site vira um participante só: é isto que deixa a importação repetível sem duplicar.
create unique index if not exists participantes_site_protocolo_unico
  on public.participantes (workspace_id, site_protocolo) where site_protocolo is not null;
grant select (site_protocolo, site_codigo_aprovacao, site_aprovacao_em) on public.participantes to authenticated;

-- 2. Até onde a importação já leu (o id da última ficha do site) e como foi a última rodada.
--    Só o servidor lê e grava: RLS forçada, sem política nenhuma.
create table if not exists public.site_fichas_sincronizacao (
  workspace_id     uuid primary key references public.workspaces (id) on delete cascade,
  ultimo_id        integer not null default 0 check (ultimo_id >= 0),
  importadas       integer not null default 0 check (importadas >= 0),
  ultima_execucao  timestamptz,
  ultimo_erro      text check (ultimo_erro is null or char_length(ultimo_erro) <= 500),
  updated_at       timestamptz not null default now()
);
alter table public.site_fichas_sincronizacao enable row level security;
alter table public.site_fichas_sincronizacao force row level security;
revoke all on public.site_fichas_sincronizacao from public, anon, authenticated;

-- 3. Importa uma ficha. Repetir devolve o mesmo participante. Se a pessoa já existe na Redação com o mesmo
--    e-mail (inscreveu-se pelos dois formulários), a ficha do site é ligada a ela em vez de criar outra; se o
--    conflito for de CPF, devolve null e a rotina conta como "já existia".
create or replace function public.importar_ficha_do_site(
  p_workspace_id uuid, p_protocolo text, p jsonb, p_consentimento_em timestamptz, p_versao_termo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if p_protocolo is null or p_protocolo !~ '^VOL-[0-9]{6}-[0-9]{4,}$' then
    raise exception 'Protocolo da ficha inválido.' using errcode = 'P0001';
  end if;
  select id into v_id from public.participantes where workspace_id = p_workspace_id and site_protocolo = p_protocolo;
  if v_id is not null then return v_id; end if;
  if coalesce(trim(p->>'nome'), '') = '' then
    raise exception 'Ficha sem nome.' using errcode = 'P0001';
  end if;

  if coalesce(trim(p->>'email'), '') <> '' then
    update public.participantes set site_protocolo = p_protocolo, updated_at = now()
     where workspace_id = p_workspace_id and lower(email) = lower(trim(p->>'email')) and site_protocolo is null
    returning id into v_id;
    if v_id is not null then
      insert into public.participantes_auditoria (workspace_id, participante_id, user_id, acao, detalhe)
      values (p_workspace_id, v_id, null, 'ficha_do_site_ligada', jsonb_build_object('protocolo', p_protocolo));
      return v_id;
    end if;
  end if;

  begin
    insert into public.participantes (workspace_id, nome, vinculo, situacao, origem, consentimento_em, consentimento_versao, site_protocolo)
    values (p_workspace_id, trim(p->>'nome'), 'voluntario', 'candidato', 'importacao',
            coalesce(p_consentimento_em, now()), left(coalesce(p_versao_termo, ''), 40), p_protocolo)
    returning id into v_id;
    perform private.aplicar_campos_participante(v_id, p - 'vinculo' - 'consentimento');
  exception when unique_violation then
    return null;
  end;
  insert into public.participantes_auditoria (workspace_id, participante_id, user_id, acao, detalhe)
  values (p_workspace_id, v_id, null, 'importacao_do_site', jsonb_build_object('protocolo', p_protocolo));
  return v_id;
end $$;
revoke all on function public.importar_ficha_do_site(uuid, text, jsonb, timestamptz, text) from public, anon, authenticated;
grant execute on function public.importar_ficha_do_site(uuid, text, jsonb, timestamptz, text) to service_role;

-- 4. A selfie da ficha do site vira a foto do cadastro (e entra em "Fotos do crachá" para aprovação), como a foto
--    da inscrição pública: só candidato importado, ainda sem foto, e o caminho da pasta deste participante.
create or replace function public.definir_foto_da_ficha_do_site(p_participante_id uuid, p_foto_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
begin
  select * into v from public.participantes where id = p_participante_id for update;
  if not found or v.origem <> 'importacao' or v.site_protocolo is null or v.situacao <> 'candidato'
     or v.anonimizado_em is not null or v.foto_path is not null then
    raise exception 'Cadastro indisponível para receber a foto.' using errcode = 'P0001';
  end if;
  if p_foto_path is null or not private.foto_do_participante_valida(v.workspace_id, v.id, p_foto_path) then
    raise exception 'Foto inválida.' using errcode = 'P0001';
  end if;
  update public.participantes set foto_path = p_foto_path, updated_at = now() where id = v.id;
  insert into public.participantes_auditoria (workspace_id, participante_id, acao, detalhe)
  values (v.workspace_id, v.id, 'foto_da_ficha_do_site', '{}');
end $$;
revoke all on function public.definir_foto_da_ficha_do_site(uuid, text) from public, anon, authenticated;
grant execute on function public.definir_foto_da_ficha_do_site(uuid, text) to service_role;

-- 5. O CPF para o site, na aprovação: o site exige CPF para criar o cadastro no ponto da sede, e a ficha pode ter
--    chegado sem. Só o servidor, depois de conferir que quem aprova tem nível de gerenciar; fica na auditoria.
create or replace function public.cpf_para_o_site(p_participante_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
begin
  select * into v from public.participantes where id = p_participante_id;
  if not found or v.site_protocolo is null or v.cpf_cifrado is null then return null; end if;
  insert into public.participantes_auditoria (workspace_id, participante_id, acao, detalhe)
  values (v.workspace_id, v.id, 'cpf_enviado_ao_site', jsonb_build_object('protocolo', v.site_protocolo));
  return extensions.pgp_sym_decrypt(v.cpf_cifrado, private.chave_participantes());
end $$;
revoke all on function public.cpf_para_o_site(uuid) from public, anon, authenticated;
grant execute on function public.cpf_para_o_site(uuid) to service_role;

-- 6. O código de aprovação que o site devolveu.
create or replace function public.registrar_aprovacao_do_site(p_participante_id uuid, p_codigo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
begin
  if p_codigo is null or p_codigo !~ '^[A-HJ-NP-Z2-9]{8}$' then
    raise exception 'Código de aprovação inválido.' using errcode = 'P0001';
  end if;
  select * into v from public.participantes where id = p_participante_id for update;
  if not found or v.site_protocolo is null then
    raise exception 'Este cadastro não veio do site.' using errcode = 'P0001';
  end if;
  update public.participantes set site_codigo_aprovacao = p_codigo, site_aprovacao_em = coalesce(site_aprovacao_em, now()), updated_at = now()
   where id = v.id;
  insert into public.participantes_auditoria (workspace_id, participante_id, acao, detalhe)
  values (v.workspace_id, v.id, 'aprovacao_no_site', jsonb_build_object('protocolo', v.site_protocolo));
end $$;
revoke all on function public.registrar_aprovacao_do_site(uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_aprovacao_do_site(uuid, text) to service_role;
