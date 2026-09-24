-- Canal direto e mural de avisos da Área do Voluntário.
--
-- Conversas: o voluntário abre um assunto, a coordenação responde de dentro
-- do Redação (Voluntariado → Mensagens). Cada conversa é de um voluntário só;
-- quem gerencia o Voluntariado vê todas. O voluntário escreve pelo servidor
-- (service_role, com o participante da sessão); a equipe, por função com o
-- nível conferido.
--
-- Avisos: recados da coordenação para todos os voluntários ativos, com
-- "novo" até a pessoa ver.

create table if not exists public.membro_conversas (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces (id) on delete restrict,
  participante_id      uuid not null references public.participantes (id) on delete cascade,
  assunto              text not null check (length(trim(assunto)) between 3 and 160),
  categoria            text not null default 'duvida' check (categoria in ('duvida','disponibilidade','sugestao','documentos','outro')),
  situacao             text not null default 'aberta' check (situacao in ('aberta','respondida','encerrada')),
  created_at           timestamptz not null default now(),
  atualizada_em        timestamptz not null default now(),
  lida_pelo_membro_em  timestamptz,
  lida_pela_equipe_em  timestamptz
);
create index if not exists membro_conversas_participante_idx on public.membro_conversas (participante_id, atualizada_em desc);
create index if not exists membro_conversas_workspace_idx on public.membro_conversas (workspace_id, situacao, atualizada_em desc);

create table if not exists public.membro_mensagens (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete restrict,
  conversa_id   uuid not null references public.membro_conversas (id) on delete cascade,
  autor         text not null check (autor in ('membro','equipe')),
  autor_user_id uuid references public.profiles (id) on delete set null,
  texto         text not null check (length(trim(texto)) between 1 and 4000),
  created_at    timestamptz not null default now(),
  check ((autor = 'equipe') = (autor_user_id is not null))
);
create index if not exists membro_mensagens_conversa_idx on public.membro_mensagens (conversa_id, created_at);
create index if not exists membro_mensagens_workspace_idx on public.membro_mensagens (workspace_id);
create index if not exists membro_mensagens_autor_idx on public.membro_mensagens (autor_user_id);

create table if not exists public.membro_avisos (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  titulo       text not null check (length(trim(titulo)) between 3 and 160),
  texto        text not null check (length(trim(texto)) between 3 and 6000),
  fixado       boolean not null default false,
  expira_em    date,
  criado_por   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists membro_avisos_workspace_idx on public.membro_avisos (workspace_id, created_at desc);
create index if not exists membro_avisos_criado_por_idx on public.membro_avisos (criado_por);

create table if not exists public.membro_avisos_vistos (
  participante_id uuid not null references public.participantes (id) on delete cascade,
  aviso_id        uuid not null references public.membro_avisos (id) on delete cascade,
  visto_em        timestamptz not null default now(),
  primary key (participante_id, aviso_id)
);
create index if not exists membro_avisos_vistos_aviso_idx on public.membro_avisos_vistos (aviso_id);

alter table public.membro_conversas enable row level security;
alter table public.membro_mensagens enable row level security;
alter table public.membro_avisos enable row level security;
alter table public.membro_avisos_vistos enable row level security;
revoke all on public.membro_conversas, public.membro_mensagens, public.membro_avisos, public.membro_avisos_vistos from anon, authenticated;

-- Conversas podem ter dado pessoal: só quem gerencia o Voluntariado lê.
grant select on public.membro_conversas, public.membro_mensagens to authenticated;
create policy membro_conversas_select on public.membro_conversas for select to authenticated using ((select private.nivel_participantes(workspace_id)) >= 2);
create policy membro_mensagens_select on public.membro_mensagens for select to authenticated using ((select private.nivel_participantes(workspace_id)) >= 2);

grant select, insert, update, delete on public.membro_avisos to authenticated;
create policy membro_avisos_select on public.membro_avisos for select to authenticated using ((select private.nivel_participantes(workspace_id)) >= 1);
create policy membro_avisos_insert on public.membro_avisos for insert to authenticated with check ((select private.nivel_participantes(workspace_id)) >= 2);
create policy membro_avisos_update on public.membro_avisos for update to authenticated
  using ((select private.nivel_participantes(workspace_id)) >= 2) with check ((select private.nivel_participantes(workspace_id)) >= 2);
create policy membro_avisos_delete on public.membro_avisos for delete to authenticated using ((select private.nivel_participantes(workspace_id)) >= 2);

-- ---------------------------------------------------------------- voluntário

/** Limite contra abuso: 15 mensagens por hora por voluntário. */
create or replace function private.membro_pode_escrever(p_participante_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.membro_mensagens m join public.membro_conversas c on c.id = m.conversa_id
      where c.participante_id = p_participante_id and m.autor = 'membro' and m.created_at > now() - interval '1 hour') >= 15 then
    raise exception 'Muitas mensagens em pouco tempo. Aguarde um pouco e tente de novo.' using errcode = 'P0001';
  end if;
end $$;
revoke all on function private.membro_pode_escrever(uuid) from public, anon, authenticated;

create or replace function public.membro_abrir_conversa(p_participante_id uuid, p_assunto text, p_categoria text, p_texto text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_part public.participantes;
  v_id uuid;
begin
  select * into v_part from public.participantes where id = p_participante_id and situacao = 'ativo' and anonimizado_em is null;
  if not found then raise exception 'Cadastro indisponível.' using errcode = 'P0001'; end if;
  perform private.membro_pode_escrever(v_part.id);
  if length(trim(coalesce(p_assunto, ''))) < 3 then raise exception 'Escreva o assunto.' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_texto, ''))) < 1 then raise exception 'Escreva a mensagem.' using errcode = 'P0001'; end if;
  insert into public.membro_conversas (workspace_id, participante_id, assunto, categoria, lida_pelo_membro_em)
  values (v_part.workspace_id, v_part.id, left(trim(p_assunto), 160),
    case when p_categoria in ('duvida','disponibilidade','sugestao','documentos','outro') then p_categoria else 'outro' end, now())
  returning id into v_id;
  insert into public.membro_mensagens (workspace_id, conversa_id, autor, texto) values (v_part.workspace_id, v_id, 'membro', left(trim(p_texto), 4000));
  return v_id;
end $$;

/** O voluntário responde numa conversa dele. Encerrada, reabre. */
create or replace function public.membro_responder(p_participante_id uuid, p_conversa_id uuid, p_texto text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.membro_conversas;
begin
  select * into c from public.membro_conversas where id = p_conversa_id and participante_id = p_participante_id for update;
  if not found then raise exception 'Conversa não encontrada.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.participantes where id = p_participante_id and situacao = 'ativo' and anonimizado_em is null) then
    raise exception 'Cadastro indisponível.' using errcode = 'P0001';
  end if;
  perform private.membro_pode_escrever(p_participante_id);
  if length(trim(coalesce(p_texto, ''))) < 1 then raise exception 'Escreva a mensagem.' using errcode = 'P0001'; end if;
  insert into public.membro_mensagens (workspace_id, conversa_id, autor, texto) values (c.workspace_id, c.id, 'membro', left(trim(p_texto), 4000));
  update public.membro_conversas set situacao = 'aberta', atualizada_em = now(), lida_pelo_membro_em = now(), lida_pela_equipe_em = null where id = c.id;
end $$;

create or replace function public.membro_ler_conversa(p_participante_id uuid, p_conversa_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.membro_conversas set lida_pelo_membro_em = now() where id = p_conversa_id and participante_id = p_participante_id
$$;

create or replace function public.membro_ver_avisos(p_participante_id uuid, p_avisos uuid[])
returns void language sql security definer set search_path = '' as $$
  insert into public.membro_avisos_vistos (participante_id, aviso_id)
  select p_participante_id, a.id from public.membro_avisos a join public.participantes p on p.workspace_id = a.workspace_id
   where p.id = p_participante_id and a.id = any (p_avisos)
  on conflict do nothing
$$;

-- ---------------------------------------------------------------- equipe

create or replace function public.equipe_responder_membro(p_conversa_id uuid, p_texto text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.membro_conversas;
begin
  select * into c from public.membro_conversas where id = p_conversa_id for update;
  if not found or (select private.nivel_participantes(c.workspace_id)) < 2 then raise exception 'Conversa não encontrada.' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_texto, ''))) < 1 then raise exception 'Escreva a resposta.' using errcode = 'P0001'; end if;
  insert into public.membro_mensagens (workspace_id, conversa_id, autor, autor_user_id, texto) values (c.workspace_id, c.id, 'equipe', (select auth.uid()), left(trim(p_texto), 4000));
  update public.membro_conversas set situacao = 'respondida', atualizada_em = now(), lida_pela_equipe_em = now(), lida_pelo_membro_em = null where id = c.id;
end $$;

create or replace function public.equipe_marcar_conversa(p_conversa_id uuid, p_acao text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.membro_conversas;
begin
  select * into c from public.membro_conversas where id = p_conversa_id for update;
  if not found or (select private.nivel_participantes(c.workspace_id)) < 2 then raise exception 'Conversa não encontrada.' using errcode = 'P0001'; end if;
  if p_acao = 'lida' then update public.membro_conversas set lida_pela_equipe_em = now() where id = c.id;
  elsif p_acao = 'encerrar' then update public.membro_conversas set situacao = 'encerrada', lida_pela_equipe_em = now() where id = c.id;
  elsif p_acao = 'reabrir' then update public.membro_conversas set situacao = 'aberta' where id = c.id;
  else raise exception 'Ação inválida.' using errcode = 'P0001';
  end if;
end $$;

revoke all on function public.membro_abrir_conversa(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.membro_responder(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.membro_ler_conversa(uuid, uuid) from public, anon, authenticated;
revoke all on function public.membro_ver_avisos(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.equipe_responder_membro(uuid, text) from public, anon;
revoke all on function public.equipe_marcar_conversa(uuid, text) from public, anon;
grant execute on function public.membro_abrir_conversa(uuid, text, text, text) to service_role;
grant execute on function public.membro_responder(uuid, uuid, text) to service_role;
grant execute on function public.membro_ler_conversa(uuid, uuid) to service_role;
grant execute on function public.membro_ver_avisos(uuid, uuid[]) to service_role;
grant execute on function public.equipe_responder_membro(uuid, text) to authenticated;
grant execute on function public.equipe_marcar_conversa(uuid, text) to authenticated;

/** Quantos voluntários viram cada aviso (a equipe vê só o número, não quem). */
create or replace function public.contar_avisos_vistos(p_avisos uuid[])
returns table (aviso_id uuid, vistos bigint) language sql stable security definer set search_path = '' as $$
  select a.id, count(v.participante_id)
  from public.membro_avisos a left join public.membro_avisos_vistos v on v.aviso_id = a.id
  where a.id = any (p_avisos) and (select private.nivel_participantes(a.workspace_id)) >= 2
  group by a.id
$$;
revoke all on function public.contar_avisos_vistos(uuid[]) from public, anon;
grant execute on function public.contar_avisos_vistos(uuid[]) to authenticated;
