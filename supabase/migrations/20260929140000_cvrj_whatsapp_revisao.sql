-- ============================================================
-- WhatsApp e ficha da Equipe: correções da revisão
--
-- Só acrescenta (ARQUITETURA §10.1). As migrações 20260929110000–130000 já
-- estão na main; o que a revisão pediu no banco vem aqui, sem mexer nelas.
--
--  - LGPD: anonimizar o voluntário (anonimizar_participante) leva junto o
--    número e a autorização dele (participantes_whatsapp), o que ainda ia sair
--    para ele (whatsapp_fila) e o número no registro das mensagens.
--  - Ficha: quem foi desligado não usa mais o link, mesmo que ainda valesse
--    (o desligamento também cancela os links abertos, pelo servidor).
-- ============================================================

create or replace function private.participante_sem_whatsapp_ao_anonimizar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_numeros text[];
begin
  if new.anonimizado_em is null or old.anonimizado_em is not null then return new; end if;
  with apagados as (
    delete from public.participantes_whatsapp w where w.participante_id = new.id returning w.numero, w.numero_pendente
  )
  select array_remove(array_agg(n), null) into v_numeros
    from (select numero as n from apagados union select numero_pendente from apagados) x;
  if coalesce(cardinality(v_numeros), 0) > 0 then
    delete from public.whatsapp_fila f where f.numero = any (v_numeros) and f.user_id is null;
    update public.whatsapp_mensagens m set numero = null where m.numero = any (v_numeros) and m.user_id is null;
  end if;
  return new;
end $$;
revoke all on function private.participante_sem_whatsapp_ao_anonimizar() from public, anon, authenticated;

drop trigger if exists participante_sem_whatsapp_ao_anonimizar on public.participantes;
create trigger participante_sem_whatsapp_ao_anonimizar
  after update of anonimizado_em on public.participantes
  for each row execute function private.participante_sem_whatsapp_ao_anonimizar();

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
  -- Quem foi desligado não escreve mais na ficha, mesmo com um link que ainda valeria.
  if exists (select 1 from public.equipe_membros m where m.id = c.membro_id and m.situacao = 'desligado') then
    raise exception 'Este link não vale mais. Fale com o RH.' using errcode = 'P0001';
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
