-- ============================================================
-- WhatsApp: agir pelo bot (responder, votar, abrir chamado)
--
-- Só acrescenta (ARQUITETURA §10.1). O código anterior não usa nada daqui, e
-- o bot novo funciona sem esta migração: sem ela, responde que a ação não está
-- disponível e manda o link do Palácio.
--
--  - whatsapp_pendencias: o passo que falta numa conversa com o bot — a
--    confirmação da conferência antes de aprovar, e a fila, o assunto, o
--    local e a urgência de um chamado aberto por lá. Vale 15 minutos.
--  - whatsapp_chat_enviar / whatsapp_votar: as funções do Chat e da
--    aprovação, chamadas pelo servidor EM NOME de quem escreveu no WhatsApp.
--    Só o service role executa; o servidor já conferiu que o número é da
--    pessoa (whatsapp_contas). As regras continuam as de dentro de
--    chat_enviar e vote_on_approval: quem não pode lá não pode aqui.
--
--    A sessão simulada é "aal1" (sem o código do app autenticador): quem é
--    obrigado a usar a verificação em duas etapas, ou a ativou, NÃO age pelo
--    WhatsApp — o próprio banco recusa (private.verificacao_em_dia), além do
--    servidor, que confere antes.
-- ============================================================

create table if not exists public.whatsapp_pendencias (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  tipo         text not null check (tipo in ('aprovar', 'abrir_chamado')),
  dados        jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object' and pg_column_size(dados) <= 8000),
  -- A mensagem do bot que fez a pergunta: responder citando ela resolve esta pendência.
  mensagem_id  text check (mensagem_id is null or char_length(mensagem_id) <= 128),
  criado_em    timestamptz not null default now(),
  expira_em    timestamptz not null,
  encerrada_em timestamptz
);
create index if not exists whatsapp_pendencias_abertas_idx on public.whatsapp_pendencias (user_id, criado_em desc) where encerrada_em is null;
create index if not exists whatsapp_pendencias_mensagem_idx on public.whatsapp_pendencias (mensagem_id) where mensagem_id is not null;
create index if not exists whatsapp_pendencias_espaco_idx on public.whatsapp_pendencias (workspace_id);

-- RLS ligado e nenhuma policy: só o service role (o servidor) lê e escreve.
alter table public.whatsapp_pendencias enable row level security;
revoke all on public.whatsapp_pendencias from anon, authenticated;

comment on table public.whatsapp_pendencias is
  'O passo que falta numa conversa com o bot do WhatsApp (confirmar a conferência, escolher fila e assunto do chamado). Só o servidor lê e escreve.';

-- A "sessão" de quem escreveu no WhatsApp, só até o fim desta transação.
create or replace function private.como_quem_escreveu_no_whatsapp(p_user_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  if p_user_id is null then
    raise exception 'Pessoa não informada.' using errcode = 'P0001';
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end $$;

revoke all on function private.como_quem_escreveu_no_whatsapp(uuid) from public, anon, authenticated;

create or replace function public.whatsapp_chat_enviar(p_user_id uuid, p_canal_id uuid, p_corpo text, p_resposta_de uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.como_quem_escreveu_no_whatsapp(p_user_id);
  return public.chat_enviar(p_canal_id, p_corpo, '{}'::uuid[], false, p_resposta_de, '[]'::jsonb);
end $$;

create or replace function public.whatsapp_votar(p_user_id uuid, p_approval_id uuid, p_decision text, p_comment text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_workspace_id uuid;
begin
  perform private.como_quem_escreveu_no_whatsapp(p_user_id);
  select a.workspace_id into v_workspace_id from public.approvals a where a.id = p_approval_id and a.status = 'pending';
  -- vote_on_approval roda como quem a chama (aqui, o dono): sem esta conferência,
  -- quem perdeu o acesso ao espaço ainda votaria pelo convite antigo.
  if v_workspace_id is null or not (select private.is_workspace_member(v_workspace_id)) then
    raise exception 'Aprovação não encontrada ou já encerrada.' using errcode = 'P0001';
  end if;
  return public.vote_on_approval(p_approval_id, p_decision, p_comment);
end $$;

revoke all on function public.whatsapp_chat_enviar(uuid, uuid, text, uuid), public.whatsapp_votar(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.whatsapp_chat_enviar(uuid, uuid, text, uuid), public.whatsapp_votar(uuid, uuid, text, text) to service_role;
