-- Comunicação da Área do Voluntário por e-mail.
--
--  - Avisos da coordenação podem sair também por e-mail. Como é envio para
--    todos, cada voluntário pode sair da lista em um clique (exigência do
--    Gmail e do Yahoo para envio em volume): participantes.avisos_por_email.
--    O link de saída leva um HMAC do id com a chave do cadastro — não dá para
--    tirar outra pessoa da lista adivinhando o id.
--  - Lembrete na véspera de cada atividade: oportunidade_inscricoes.lembrete_em
--    marca o que já saiu, para a rotina diária não repetir.
--  - membro_avisos.enviado_por_email_em / enviados: o registro do disparo.

alter table public.participantes add column if not exists avisos_por_email boolean not null default true;
grant select (avisos_por_email) on public.participantes to authenticated;

alter table public.oportunidade_inscricoes add column if not exists lembrete_em timestamptz;
create index if not exists oportunidade_inscricoes_lembrete_idx on public.oportunidade_inscricoes (oportunidade_id) where situacao = 'inscrito' and lembrete_em is null;

alter table public.membro_avisos add column if not exists enviado_por_email_em timestamptz;
alter table public.membro_avisos add column if not exists enviados integer;

create or replace function public.membro_token_de_saida(p_participante_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select encode(extensions.hmac(p_participante_id::text || ':avisos', private.chave_participantes(), 'sha256'), 'hex')
$$;

/** Sai (ou volta) da lista de avisos por e-mail. Pelo link: confere o token. */
create or replace function public.membro_preferir_avisos(p_participante_id uuid, p_receber boolean, p_token text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
begin
  if p_token is not null and p_token <> public.membro_token_de_saida(p_participante_id) then return false; end if;
  update public.participantes set avisos_por_email = p_receber, updated_at = now() where id = p_participante_id and anonimizado_em is null returning * into v;
  if not found then return false; end if;
  insert into public.participantes_auditoria (workspace_id, participante_id, acao, detalhe)
  values (v.workspace_id, v.id, 'preferencia_avisos_por_email', jsonb_build_object('receber', p_receber, 'pelo_link', p_token is not null));
  return true;
end $$;

revoke all on function public.membro_token_de_saida(uuid) from public, anon, authenticated;
revoke all on function public.membro_preferir_avisos(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.membro_token_de_saida(uuid) to service_role;
grant execute on function public.membro_preferir_avisos(uuid, boolean, text) to service_role;

/** Quem recebe um aviso por e-mail: ativos, com e-mail, que não saíram da lista — com o token de saída de cada um. */
create or replace function public.membro_destinatarios_de_aviso(p_workspace_id uuid)
returns table (participante_id uuid, nome text, email text, token text)
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(p.nome_social, p.nome), p.email, public.membro_token_de_saida(p.id)
  from public.participantes p
  where p.workspace_id = p_workspace_id and p.situacao = 'ativo' and p.anonimizado_em is null and p.email is not null and p.avisos_por_email
  order by p.nome
$$;
revoke all on function public.membro_destinatarios_de_aviso(uuid) from public, anon, authenticated;
grant execute on function public.membro_destinatarios_de_aviso(uuid) to service_role;
