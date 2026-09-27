-- ============================================================
-- Equipe (RH): a própria pessoa completa a ficha por um link pessoal
--
-- Só acrescenta (ARQUITETURA §10.1). O código anterior não usa nada daqui.
--
--  - equipe_convites: o link de uso único que o RH manda (pelo WhatsApp, ou
--    copiando) para a pessoa completar os dados pessoais e, se o RH liberar,
--    os documentos. Guarda só o hash do token; vale 7 dias; um aberto por
--    pessoa. O lembrete troca o token (o link antigo para de valer).
--  - equipe_preencher_pelo_convite: grava o que a pessoa mandou, só com o
--    service role (a página pública chama pelo servidor). Nunca mexe em
--    cargo, vínculo, salário ou banco — conta bancária pelo link abriria a
--    porta para desviar o pagamento de alguém. Campo vazio não apaga o que
--    já existe, e os documentos se juntam aos que o RH já tinha (cifrados,
--    como no salvar_membro_equipe). Fica na auditoria como "pela pessoa".
-- ============================================================

create table if not exists public.equipe_convites (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  membro_id         uuid not null references public.equipe_membros (id) on delete cascade,
  token_hash        text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Para onde foi (o lembrete vai para o mesmo número); null = o RH copiou o link.
  numero            text check (numero is null or numero ~ '^[0-9]{10,15}$'),
  inclui_documentos boolean not null default false,
  criado_por        uuid references public.profiles (id) on delete set null,
  criado_em         timestamptz not null default now(),
  expira_em         timestamptz not null,
  usado_em          timestamptz,
  cancelado_em      timestamptz,
  lembrado_em       timestamptz,
  lembretes         smallint not null default 0 check (lembretes between 0 and 5)
);
create unique index if not exists equipe_convites_um_aberto on public.equipe_convites (membro_id) where usado_em is null and cancelado_em is null;
create index if not exists equipe_convites_espaco_idx on public.equipe_convites (workspace_id, criado_em desc);
create index if not exists equipe_convites_criado_por_idx on public.equipe_convites (criado_por);

alter table public.equipe_convites enable row level security;
revoke all on public.equipe_convites from anon, authenticated;

comment on table public.equipe_convites is
  'Link de uso único para a pessoa completar a própria ficha da Equipe (dados pessoais e, se liberado, documentos). Só o hash do token. Só o servidor lê e escreve.';

create or replace function public.equipe_preencher_pelo_convite(p_token_hash text, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  c public.equipe_convites;
  v_chave text := private.chave_equipe();
  v_atuais jsonb;
  v_docs jsonb;
  v_cpf text;
  v_campos jsonb := '[]'::jsonb;
  k text;
  v text;
  pes constant text[] := array['telefone_pessoal','cep','logradouro','numero','complemento','bairro','cidade','emergencia_nome','emergencia_telefone','emergencia_parentesco'];
  docs constant text[] := array['cpf','rg','rg_orgao','pis','ctps','titulo_eleitor','cnh','reservista'];
begin
  select * into c from public.equipe_convites where token_hash = p_token_hash for update;
  if not found or c.usado_em is not null or c.cancelado_em is not null or c.expira_em <= now() then
    raise exception 'Este link venceu ou já foi usado. Peça um novo ao RH.' using errcode = 'P0001';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Dados inválidos.' using errcode = 'P0001'; end if;
  if v_chave is null then raise exception 'Chave de cifra indisponível.' using errcode = 'P0001'; end if;

  begin
    insert into public.equipe_pessoais (membro_id, workspace_id) values (c.membro_id, c.workspace_id) on conflict do nothing;

    -- Só o que veio preenchido: campo vazio não apaga o que o RH já tinha.
    foreach k in array pes loop
      v := nullif(left(trim(coalesce(p->>k, '')), 400), '');
      if v is not null then
        execute format('update public.equipe_pessoais set %I = $1 where membro_id = $2', k) using v, c.membro_id;
        v_campos := v_campos || to_jsonb(k);
      end if;
    end loop;
    v := nullif(lower(trim(coalesce(p->>'email_pessoal', ''))), '');
    if v is not null then
      if v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v) > 254 then raise exception 'O e-mail não parece certo.' using errcode = 'P0001'; end if;
      update public.equipe_pessoais set email_pessoal = v where membro_id = c.membro_id;
      v_campos := v_campos || to_jsonb('email_pessoal'::text);
    end if;
    v := nullif(upper(trim(coalesce(p->>'uf', ''))), '');
    if v is not null then
      if v !~ '^[A-Z]{2}$' then raise exception 'UF inválida.' using errcode = 'P0001'; end if;
      update public.equipe_pessoais set uf = v where membro_id = c.membro_id;
      v_campos := v_campos || to_jsonb('uf'::text);
    end if;
    v := nullif(trim(coalesce(p->>'data_nascimento', '')), '');
    if v is not null then
      if v !~ '^\d{4}-\d{2}-\d{2}$' or v::date > current_date or v::date < date '1900-01-01' then
        raise exception 'Data de nascimento inválida.' using errcode = 'P0001';
      end if;
      update public.equipe_pessoais set data_nascimento = v::date where membro_id = c.membro_id;
      v_campos := v_campos || to_jsonb('data_nascimento'::text);
    end if;
    update public.equipe_pessoais set updated_at = now() where membro_id = c.membro_id;

    -- Documentos: só se o RH liberou neste link; somam aos que já existiam.
    if c.inclui_documentos and jsonb_typeof(p->'documentos') = 'object' then
      v_docs := '{}'::jsonb;
      foreach k in array docs loop
        v := nullif(left(trim(coalesce(p->'documentos'->>k, '')), 60), '');
        if v is not null then v_docs := v_docs || jsonb_build_object(k, v); end if;
      end loop;
      if v_docs <> '{}'::jsonb then
        select coalesce(extensions.pgp_sym_decrypt(m.documentos_cifrados, v_chave)::jsonb, '{}'::jsonb) into v_atuais
          from public.equipe_membros m where m.id = c.membro_id;
        v_docs := coalesce(v_atuais, '{}'::jsonb) || v_docs;
        v_cpf := private.cpf_de_documentos(v_docs);
        if v_cpf is not null and not private.cpf_valido(v_cpf) then raise exception 'CPF inválido.' using errcode = 'P0001'; end if;
        if v_cpf is not null then v_docs := v_docs || jsonb_build_object('cpf', v_cpf); end if;
        update public.equipe_membros set
          documentos_cifrados = extensions.pgp_sym_encrypt(v_docs::text, v_chave, 'cipher-algo=aes256'),
          tem_documentos = true,
          cpf_hash = case when v_cpf is null then cpf_hash else encode(extensions.hmac(v_cpf, v_chave, 'sha256'), 'hex') end,
          cpf_mascara = case when v_cpf is null then cpf_mascara else '***.' || substr(v_cpf, 4, 3) || '.' || substr(v_cpf, 7, 3) || '-**' end
        where id = c.membro_id;
        v_campos := v_campos || to_jsonb('documentos'::text);
      end if;
    end if;
    update public.equipe_membros set updated_at = now() where id = c.membro_id;
  exception when unique_violation then
    raise exception 'Já existe uma pessoa na equipe com este mesmo CPF. Fale com o RH.' using errcode = 'P0001';
  end;

  if jsonb_array_length(v_campos) = 0 then raise exception 'Preencha ao menos um campo.' using errcode = 'P0001'; end if;
  update public.equipe_convites set usado_em = now() where id = c.id;
  insert into public.equipe_auditoria (workspace_id, membro_id, user_id, acao, detalhe)
  values (c.workspace_id, c.membro_id, null, 'editar', jsonb_build_object('campos', v_campos, 'pela_pessoa', true, 'convite', c.id));
  return c.membro_id;
end $$;

revoke all on function public.equipe_preencher_pelo_convite(text, jsonb) from public, anon, authenticated;
grant execute on function public.equipe_preencher_pelo_convite(text, jsonb) to service_role;

-- Categoria "equipe" nas notificações ("Fulano completou a ficha", para quem
-- pediu). Mesmo jeito da migração da fila: lê a lista atual e junta com todas
-- as que o código conhece (lib/notificacoes/regras.ts), sem perder nenhuma.
do $$
declare
  v_def text;
  v_lista text[];
  v_todas text[] := array['aprovacoes', 'auditoria', 'chamados', 'chat', 'equipe', 'financeiro', 'geral', 'mensagens', 'oficios', 'patrimonio', 'pautas', 'portaria', 'sistema'];
begin
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'public.notifications'::regclass and c.conname = 'notifications_categoria_valida';
  if v_def is null then return; end if;
  if v_def ~ '''\{[a-z_,]*\}''' then
    v_lista := string_to_array(substring(v_def from '''\{([a-z_,]*)\}'''), ',');
  else
    select array_agg(distinct m[1] order by m[1]) into v_lista from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
  end if;
  if coalesce(cardinality(v_lista), 0) = 0 then
    raise exception 'Não consegui ler as categorias de notifications_categoria_valida: %', v_def;
  end if;
  if v_todas <@ v_lista then return; end if;
  select array_agg(distinct x order by x) into v_lista from unnest(v_lista || v_todas) as x;
  alter table public.notifications drop constraint notifications_categoria_valida;
  execute format('alter table public.notifications add constraint notifications_categoria_valida check (categoria = any (%L::text[]))', v_lista);
end $$;
