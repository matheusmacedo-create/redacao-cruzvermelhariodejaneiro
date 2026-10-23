-- ============================================================
-- Autocadastro de colaborador pelo WhatsApp (23/10/2026)
--
-- Só acrescenta (ARQUITETURA §10.1). O código funciona sem esta migração: sem
-- a tabela, o bot trata "quero me cadastrar" como qualquer mensagem de quem
-- não tem conta (a apresentação de sempre).
--
--  - colaborador_autocadastros: o pedido de quem ainda não tem conta e se
--    cadastra pela conversa (nome, coordenação, ficha, foto, ciência), até a
--    aprovação de quem gerencia usuários. Um aberto por número. Os dados
--    pessoais vivem só em `dados` (e a foto no Blob privado, em foto_path) e
--    saem quando o pedido acaba (trigger abaixo). Só o servidor lê e escreve.
--  - whatsapp_autocadastro_criar_ficha: depois da aprovação, cria a ficha do
--    RH (equipe_membros + equipe_pessoais) a partir do pedido e um convite de
--    ficha de uso imediato, para o servidor gravar os dados pessoais pela
--    MESMA função da página pública (equipe_preencher_pelo_convite: cifra,
--    validação de e-mail, UF e data, auditoria). Só o service role executa.
--  - equipe_membros.foto_cadastro_path: a foto de rosto mandada no cadastro,
--    no Blob privado (crachá e ficha leem dali em etapa posterior).
-- ============================================================

alter table public.equipe_membros add column if not exists foto_cadastro_path text
  check (foto_cadastro_path is null or length(foto_cadastro_path) <= 300);

create table if not exists public.colaborador_autocadastros (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  -- Só dígitos, com o código do país (o mesmo formato de whatsapp_contas.numero).
  numero        text not null check (numero ~ '^[0-9]{10,15}$'),
  status        text not null default 'em_andamento'
                check (status in ('em_andamento', 'aguardando', 'aprovando', 'aprovado', 'recusado', 'cancelado', 'expirado', 'falhou')),
  dados         jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object' and pg_column_size(dados) <= 8000),
  -- A mensagem do bot que fez a última pergunta (responder citando continua a conversa).
  mensagem_id   text check (mensagem_id is null or char_length(mensagem_id) <= 128),
  foto_path     text check (foto_path is null or length(foto_path) <= 300),
  membro_id     uuid references public.equipe_membros (id) on delete set null,
  decidido_por  uuid references public.profiles (id) on delete set null,
  decidido_em   timestamptz,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  expira_em     timestamptz not null default now() + interval '7 days'
);

-- Um pedido aberto por número e espaço.
create unique index if not exists colaborador_autocadastros_um_aberto
  on public.colaborador_autocadastros (workspace_id, numero) where status in ('em_andamento', 'aguardando', 'aprovando');
create index if not exists colaborador_autocadastros_espaco_idx on public.colaborador_autocadastros (workspace_id, criado_em desc);
create index if not exists colaborador_autocadastros_membro_idx on public.colaborador_autocadastros (membro_id);
create index if not exists colaborador_autocadastros_decidido_por_idx on public.colaborador_autocadastros (decidido_por);

alter table public.colaborador_autocadastros enable row level security;
alter table public.colaborador_autocadastros force row level security;
revoke all on public.colaborador_autocadastros from anon, authenticated;

comment on table public.colaborador_autocadastros is
  'Pedido de cadastro de colaborador feito pela própria pessoa no WhatsApp, até a aprovação. Dados pessoais só enquanto o pedido está aberto. Só o servidor lê e escreve (RLS sem policy).';

-- ---------------------------------------------------------------- os dados pessoais saem quando o pedido acaba

-- Só mexe na linha que está sendo gravada. As chaves são as de CHAVES_PESSOAIS (lib/whatsapp/autocadastro-regras.ts):
-- mudou lá, muda aqui. Fica a etapa e a marca "redigida".
create or replace function private.autocadastro_sem_dados_pessoais()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.dados := (coalesce(new.dados, '{}'::jsonb)
    - 'nome' - 'emailPessoal' - 'nascimento' - 'cep' - 'logradouro' - 'bairro' - 'cidade' - 'uf' - 'numero' - 'complemento'
    - 'emergenciaNome' - 'emergenciaParentesco' - 'emergenciaTelefone' - 'fotoMidia' - 'fotoEndereco' - 'cargo')
    || jsonb_build_object('redigida', true);
  new.foto_path := null;
  return new;
end $$;
revoke all on function private.autocadastro_sem_dados_pessoais() from public, anon, authenticated;

create or replace trigger colaborador_autocadastros_sem_dados
  before insert or update on public.colaborador_autocadastros
  for each row when (new.status in ('aprovado', 'recusado', 'cancelado', 'expirado'))
  execute function private.autocadastro_sem_dados_pessoais();

create or replace function private.autocadastro_toque()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end $$;
revoke all on function private.autocadastro_toque() from public, anon, authenticated;

create or replace trigger colaborador_autocadastros_toque
  before update on public.colaborador_autocadastros
  for each row execute function private.autocadastro_toque();

-- ---------------------------------------------------------------- a ficha, depois da aprovação

-- O servidor chama com o pedido em "aprovando" (travado pelo "Sim, criar" de quem aprovou). Cria a ficha e um convite
-- de uso imediato (1 h); o servidor então grava os dados pessoais por equipe_preencher_pelo_convite com o mesmo token.
-- Retorna o id da ficha. Idempotente: se o pedido já tem ficha, devolve a mesma.
create or replace function public.whatsapp_autocadastro_criar_ficha(p_autocadastro_id uuid, p_token_hash text, p_aprovador uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  a public.colaborador_autocadastros;
  v_membro uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Token inválido.' using errcode = 'P0001'; end if;
  select * into a from public.colaborador_autocadastros where id = p_autocadastro_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if a.status <> 'aprovando' then raise exception 'O pedido não está em aprovação.' using errcode = 'P0001'; end if;

  if a.membro_id is null then
    if coalesce(trim(a.dados->>'nome'), '') = '' then raise exception 'O pedido não tem nome.' using errcode = 'P0001'; end if;
    insert into public.equipe_membros (workspace_id, nome, vinculo, cargo, setor, foto_cadastro_path, criado_por)
    values (
      a.workspace_id, left(trim(a.dados->>'nome'), 200), 'outro',
      nullif(left(trim(coalesce(a.dados->>'cargo', '')), 120), ''),
      nullif(left(trim(coalesce(a.dados->>'coordenacao', '')), 120), ''),
      a.foto_path, p_aprovador
    ) returning id into v_membro;
    insert into public.equipe_pessoais (membro_id, workspace_id) values (v_membro, a.workspace_id);
    update public.colaborador_autocadastros set membro_id = v_membro where id = a.id;
    insert into public.equipe_auditoria (workspace_id, membro_id, user_id, acao, detalhe)
    values (a.workspace_id, v_membro, p_aprovador, 'criar', jsonb_build_object('origem', 'autocadastro_whatsapp', 'autocadastro', a.id));
  else
    v_membro := a.membro_id;
  end if;

  -- Um convite aberto por pessoa: o novo cancela o anterior.
  update public.equipe_convites set cancelado_em = now() where membro_id = v_membro and usado_em is null and cancelado_em is null;
  insert into public.equipe_convites (workspace_id, membro_id, token_hash, numero, inclui_documentos, criado_por, expira_em)
  values (a.workspace_id, v_membro, p_token_hash, a.numero, false, p_aprovador, now() + interval '1 hour');
  return v_membro;
end $$;

revoke all on function public.whatsapp_autocadastro_criar_ficha(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_autocadastro_criar_ficha(uuid, text, uuid) to service_role;
