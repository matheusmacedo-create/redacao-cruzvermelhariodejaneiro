-- Área do membro do Voluntariado: o ambiente do voluntário (cursos,
-- certificados, oportunidades, canal com a filial).
--
-- O voluntário NÃO entra pelo login da equipe (Supabase Auth). Ele tem uma
-- sessão própria: pede um código de 6 dígitos no e-mail do cadastro, troca o
-- código por uma sessão, e o navegador guarda só um token aleatório — no
-- banco fica o sha-256 dele. Assim ele nunca vira "authenticated" e nenhuma
-- política ou função da equipe, de hoje ou de amanhã, alcança um voluntário
-- por engano.
--
-- Tudo aqui é chamado só pelo servidor (service_role). O servidor valida a
-- sessão primeiro e passa adiante apenas o participante dela.

create table if not exists public.membro_codigos (
  id              uuid primary key default gen_random_uuid(),
  participante_id uuid references public.participantes (id) on delete cascade,
  email_hash      text not null,
  ip_hash         text,
  codigo_hash     text,
  expira_em       timestamptz,
  tentativas      integer not null default 0,
  usado_em        timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists membro_codigos_email_idx on public.membro_codigos (email_hash, created_at desc);
create index if not exists membro_codigos_ip_idx on public.membro_codigos (ip_hash, created_at desc);
create index if not exists membro_codigos_participante_idx on public.membro_codigos (participante_id);

create table if not exists public.membro_sessoes (
  id              uuid primary key default gen_random_uuid(),
  participante_id uuid not null references public.participantes (id) on delete cascade,
  token_hash      text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  user_agent      text,
  criada_em       timestamptz not null default now(),
  ultimo_acesso   timestamptz not null default now(),
  expira_em       timestamptz not null,
  encerrada_em    timestamptz
);
create index if not exists membro_sessoes_participante_idx on public.membro_sessoes (participante_id);

alter table public.membro_codigos enable row level security;
alter table public.membro_sessoes enable row level security;
revoke all on public.membro_codigos, public.membro_sessoes from anon, authenticated;

-- A equipe vê quando o voluntário entrou pela última vez.
alter table public.participantes add column if not exists membro_ultimo_acesso timestamptz;
grant select (membro_ultimo_acesso) on public.participantes to authenticated;

-- ---------------------------------------------------------------- código

/**
 * Pede um código. Devolve o código (para o servidor mandar por e-mail) só se
 * houver voluntário ativo com esse e-mail; senão, nada — e a tela diz a mesma
 * coisa nos dois casos, para não revelar quem tem cadastro. Limites: 5 pedidos
 * por e-mail e 15 por IP a cada hora (contam também os e-mails sem cadastro).
 */
create or replace function public.membro_pedir_codigo(p_email text, p_ip_hash text)
returns table (participante_id uuid, nome text, email text, codigo text)
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_hash text;
  v_part public.participantes;
  v_codigo text;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    raise exception 'Informe um e-mail válido.' using errcode = 'P0001';
  end if;
  v_hash := encode(extensions.digest(v_email, 'sha256'), 'hex');
  delete from public.membro_codigos where created_at < now() - interval '1 day';
  if (select count(*) from public.membro_codigos c where c.email_hash = v_hash and c.created_at > now() - interval '1 hour') >= 5
     or (p_ip_hash is not null and (select count(*) from public.membro_codigos c where c.ip_hash = p_ip_hash and c.created_at > now() - interval '1 hour') >= 15) then
    raise exception 'Muitos pedidos de código. Espere alguns minutos e tente de novo.' using errcode = 'P0001';
  end if;

  select p.* into v_part from public.participantes p
   where lower(p.email) = v_email and p.situacao = 'ativo' and p.anonimizado_em is null
   order by p.created_at desc limit 1;
  if not found then
    insert into public.membro_codigos (email_hash, ip_hash) values (v_hash, p_ip_hash);
    return;
  end if;

  -- Só o último código vale.
  update public.membro_codigos c set usado_em = now() where c.participante_id = v_part.id and c.usado_em is null;
  v_codigo := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint & 2147483647) % 1000000)::text, 6, '0');
  insert into public.membro_codigos (participante_id, email_hash, ip_hash, codigo_hash, expira_em)
  values (v_part.id, v_hash, p_ip_hash, extensions.crypt(v_codigo, extensions.gen_salt('bf', 8)), now() + interval '10 minutes');
  return query select v_part.id, coalesce(v_part.nome_social, v_part.nome), v_part.email, v_codigo;
end $$;

/**
 * Troca e-mail + código por uma sessão de 30 dias. Não lança exceção no
 * código errado — lançar desfaria a contagem de tentativas; devolve o erro.
 */
create or replace function public.membro_entrar(p_email text, p_codigo text, p_token_hash text, p_user_agent text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_hash text := encode(extensions.digest(lower(trim(coalesce(p_email, ''))), 'sha256'), 'hex');
  c public.membro_codigos;
  v_part public.participantes;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Sessão inválida.' using errcode = 'P0001'; end if;
  select * into c from public.membro_codigos x
   where x.email_hash = v_hash and x.codigo_hash is not null and x.usado_em is null and x.expira_em > now()
   order by x.created_at desc limit 1 for update;
  if not found then return jsonb_build_object('erro', 'Código vencido ou já usado. Peça um novo.'); end if;
  if c.tentativas >= 5 then
    update public.membro_codigos set usado_em = now() where id = c.id;
    return jsonb_build_object('erro', 'Tentativas esgotadas. Peça um novo código.');
  end if;
  if coalesce(p_codigo, '') !~ '^\d{6}$' or extensions.crypt(p_codigo, c.codigo_hash) <> c.codigo_hash then
    update public.membro_codigos set tentativas = tentativas + 1 where id = c.id;
    return jsonb_build_object('erro', case when c.tentativas + 1 >= 5 then 'Código incorreto. Tentativas esgotadas; peça um novo.'
      else format('Código incorreto. Restam %s tentativas.', 5 - c.tentativas - 1) end);
  end if;

  select * into v_part from public.participantes p where p.id = c.participante_id and p.situacao = 'ativo' and p.anonimizado_em is null;
  if not found then return jsonb_build_object('erro', 'Cadastro indisponível. Fale com a coordenação do Voluntariado.'); end if;
  update public.membro_codigos set usado_em = now() where id = c.id;
  delete from public.membro_sessoes where expira_em < now() - interval '90 days';
  insert into public.membro_sessoes (participante_id, token_hash, user_agent, expira_em)
  values (v_part.id, p_token_hash, left(p_user_agent, 300), now() + interval '30 days');
  update public.participantes set membro_ultimo_acesso = now() where id = v_part.id;
  insert into public.participantes_auditoria (workspace_id, participante_id, acao, detalhe)
  values (v_part.workspace_id, v_part.id, 'entrou_na_area_do_membro', '{}');
  return jsonb_build_object('participante_id', v_part.id);
end $$;

/**
 * A sessão do token, se valer. Renova por mais 30 dias a cada uso (gravando
 * no máximo uma vez por hora). Voluntário desligado ou anonimizado perde a
 * sessão na hora.
 */
create or replace function public.membro_sessao(p_token_hash text)
returns table (participante_id uuid, workspace_id uuid, nome text, email text)
language plpgsql security definer set search_path = '' as $$
declare
  s public.membro_sessoes;
  v_part public.participantes;
begin
  select * into s from public.membro_sessoes x where x.token_hash = p_token_hash and x.encerrada_em is null and x.expira_em > now();
  if not found then return; end if;
  select * into v_part from public.participantes p where p.id = s.participante_id and p.situacao = 'ativo' and p.anonimizado_em is null;
  if not found then
    update public.membro_sessoes set encerrada_em = now() where id = s.id;
    return;
  end if;
  if s.ultimo_acesso < now() - interval '1 hour' then
    update public.membro_sessoes set ultimo_acesso = now(), expira_em = now() + interval '30 days' where id = s.id;
    update public.participantes set membro_ultimo_acesso = now() where id = v_part.id;
  end if;
  return query select v_part.id, v_part.workspace_id, coalesce(v_part.nome_social, v_part.nome), v_part.email;
end $$;

create or replace function public.membro_sair(p_token_hash text)
returns void language sql security definer set search_path = '' as $$
  update public.membro_sessoes set encerrada_em = now() where token_hash = p_token_hash and encerrada_em is null
$$;

/**
 * O voluntário atualiza o próprio perfil. Só contato, endereço, emergência e
 * perfil de voluntariado; nome civil, CPF, e-mail (o login), vínculo, saúde e
 * setores ficam com a coordenação.
 */
create or replace function public.membro_atualizar_perfil(p_participante_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_part public.participantes;
  v_filtrado jsonb;
  permitidos constant text[] := array['nome_social','telefone','cep','logradouro','numero','complemento','bairro','cidade','uf',
    'emergencia_nome','emergencia_telefone','emergencia_parentesco','habilidades','idiomas','disponibilidade'];
begin
  select * into v_part from public.participantes where id = p_participante_id and situacao = 'ativo' and anonimizado_em is null for update;
  if not found then raise exception 'Cadastro indisponível.' using errcode = 'P0001'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Dados inválidos.' using errcode = 'P0001'; end if;
  select coalesce(jsonb_object_agg(key, value), '{}') into v_filtrado from jsonb_each(p) where key = any (permitidos);
  perform private.aplicar_campos_participante(v_part.id, v_filtrado);
  insert into public.participantes_auditoria (workspace_id, participante_id, acao, detalhe)
  values (v_part.workspace_id, v_part.id, 'editar_pela_area_do_membro',
    jsonb_build_object('campos', (select coalesce(jsonb_agg(k), '[]') from jsonb_object_keys(v_filtrado) k)));
end $$;

revoke all on function public.membro_pedir_codigo(text, text) from public, anon, authenticated;
revoke all on function public.membro_entrar(text, text, text, text) from public, anon, authenticated;
revoke all on function public.membro_sessao(text) from public, anon, authenticated;
revoke all on function public.membro_sair(text) from public, anon, authenticated;
revoke all on function public.membro_atualizar_perfil(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.membro_pedir_codigo(text, text) to service_role;
grant execute on function public.membro_entrar(text, text, text, text) to service_role;
grant execute on function public.membro_sessao(text) to service_role;
grant execute on function public.membro_sair(text) to service_role;
grant execute on function public.membro_atualizar_perfil(uuid, jsonb) to service_role;

/** A equipe registra que convidou o voluntário (o e-mail sai pelo servidor). */
create or replace function public.auditar_convite_area_do_membro(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
begin
  select * into v from public.participantes where id = p_id;
  if not found or (select private.nivel_participantes(v.workspace_id)) < 2 then raise exception 'Cadastro não encontrado.' using errcode = 'P0001'; end if;
  perform private.auditar_participante(v.workspace_id, v.id, 'convite_area_do_membro', '{}');
end $$;
revoke all on function public.auditar_convite_area_do_membro(uuid) from public, anon;
grant execute on function public.auditar_convite_area_do_membro(uuid) to authenticated;
