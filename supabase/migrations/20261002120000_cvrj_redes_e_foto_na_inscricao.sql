-- Foto e redes sociais na inscrição pública (/participe).
--
-- Só acrescenta: uma coluna com padrão, uma função nova, um gatilho e duas
-- funções recriadas com a mesma assinatura. O código no ar não lê nem grava
-- `redes`, e `inscrever_participante` ignora chave que não conhece: a migração
-- pode ir antes do deploy (ARQUITETURA.md §10.1 e §10.7).
--
-- - participantes.redes: um link https por rede (instagram, linkedin, facebook,
--   outro), gravado por private.aplicar_campos_participante como os demais
--   campos — logo vale para a inscrição pública, a edição pela equipe
--   (salvar_participante) e o perfil na Área do Voluntário
--   (membro_atualizar_perfil, que ganha 'redes' na lista do que o voluntário
--   pode mudar).
-- - definir_foto_na_inscricao: o servidor (service_role) grava a foto que o
--   candidato mandou junto com a inscrição. membro_definir_foto exige situação
--   "ativo" e definir_foto_participante exige a sessão de quem gerencia; esta
--   só aceita o candidato recém-inscrito pelo formulário e ainda sem foto. A
--   foto entra como "aguardando" para o crachá (20260929050000): quem gerencia
--   aprova na fila de fotos.
-- - Anonimizar limpa as redes, como já limpa a foto.

alter table public.participantes add column if not exists redes jsonb not null default '{}'
  check (jsonb_typeof(redes) = 'object');

-- Os grants de participantes são por coluna (20260924210000): a nova precisa do seu.
grant select (redes) on public.participantes to authenticated;

create or replace function private.aplicar_campos_participante(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_chave text := private.chave_participantes();
  v_cpf text;
  v_tipo text;
  v_restricoes text;
  v_redes jsonb;
  txt constant text[] := array['funcao','nome','nome_social','telefone','cep','logradouro','numero','complemento','bairro','cidade',
    'emergencia_nome','emergencia_telefone','emergencia_parentesco','responsavel_nome','responsavel_telefone','observacoes'];
  arr constant text[] := array['setores','habilidades','idiomas','disponibilidade'];
  k text;
begin
  if v_chave is null then raise exception 'Chave de cifra indisponível.' using errcode = 'P0001'; end if;
  foreach k in array txt loop
    if p ? k then
      execute format('update public.participantes set %I = $1 where id = $2', k)
        using nullif(left(trim(coalesce(p->>k, '')), 4000), ''), p_id;
    end if;
  end loop;
  foreach k in array arr loop
    if p ? k then
      if jsonb_typeof(p->k) <> 'array' then raise exception 'Campo % inválido.', k using errcode = 'P0001'; end if;
      execute format('update public.participantes set %I = $1 where id = $2', k)
        using (select coalesce(array_agg(distinct left(trim(x), 80)) filter (where trim(x) <> ''), '{}') from jsonb_array_elements_text(p->k) x), p_id;
    end if;
  end loop;
  if p ? 'email' then
    update public.participantes set email = nullif(lower(trim(p->>'email')), '') where id = p_id;
  end if;
  if p ? 'uf' then
    update public.participantes set uf = nullif(upper(trim(p->>'uf')), '') where id = p_id;
  end if;
  if p ? 'data_nascimento' then
    if nullif(p->>'data_nascimento', '') is not null and (p->>'data_nascimento')::date > (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'Data de nascimento no futuro.' using errcode = 'P0001';
    end if;
    update public.participantes set data_nascimento = nullif(p->>'data_nascimento', '')::date where id = p_id;
  end if;
  if p ? 'vinculo' then
    update public.participantes set vinculo = p->>'vinculo' where id = p_id;
  end if;
  if p ? 'cpf' then
    v_cpf := regexp_replace(coalesce(p->>'cpf', ''), '\D', '', 'g');
    if v_cpf = '' then
      update public.participantes set cpf_cifrado = null, cpf_hash = null, cpf_mascara = null where id = p_id;
    else
      if not private.cpf_valido(v_cpf) then raise exception 'CPF inválido.' using errcode = 'P0001'; end if;
      update public.participantes set
        cpf_cifrado = extensions.pgp_sym_encrypt(v_cpf, v_chave, 'cipher-algo=aes256'),
        cpf_hash = encode(extensions.hmac(v_cpf, v_chave, 'sha256'), 'hex'),
        cpf_mascara = '***.' || substr(v_cpf, 4, 3) || '.' || substr(v_cpf, 7, 3) || '-**'
      where id = p_id;
    end if;
  end if;
  if p ? 'tipo_sanguineo' or p ? 'restricoes_saude' then
    v_tipo := nullif(trim(coalesce(p->>'tipo_sanguineo', '')), '');
    v_restricoes := nullif(left(trim(coalesce(p->>'restricoes_saude', '')), 2000), '');
    if v_tipo is not null and v_tipo not in ('A+','A-','B+','B-','AB+','AB-','O+','O-') then
      raise exception 'Tipo sanguíneo inválido.' using errcode = 'P0001';
    end if;
    if v_tipo is null and v_restricoes is null then
      update public.participantes set saude_cifrada = null, tem_dados_de_saude = false where id = p_id;
    else
      update public.participantes set
        saude_cifrada = extensions.pgp_sym_encrypt(jsonb_build_object('tipo_sanguineo', v_tipo, 'restricoes', v_restricoes)::text, v_chave, 'cipher-algo=aes256'),
        tem_dados_de_saude = true
      where id = p_id;
    end if;
  end if;
  -- Redes sociais: só as chaves conhecidas, cada uma um link http(s) de até 300 caracteres
  -- (o servidor já normalizou o que a pessoa digitou — lib/participantes/regras.ts, normalizarRede).
  if p ? 'redes' then
    if jsonb_typeof(p->'redes') <> 'object' then raise exception 'Redes sociais inválidas.' using errcode = 'P0001'; end if;
    select coalesce(jsonb_object_agg(e.k, left(trim(e.v), 300)), '{}') into v_redes
      from jsonb_each_text(p->'redes') as e(k, v)
      where e.k in ('instagram', 'linkedin', 'facebook', 'outro') and trim(coalesce(e.v, '')) <> '';
    if exists (select 1 from jsonb_each_text(v_redes) as e(k, v) where e.v !~ '^https?://[^[:space:]]+\.[^[:space:]]+$') then
      raise exception 'Link de rede social inválido.' using errcode = 'P0001';
    end if;
    update public.participantes set redes = v_redes where id = p_id;
  end if;
  update public.participantes set updated_at = now() where id = p_id;
end $$;
revoke all on function private.aplicar_campos_participante(uuid, jsonb) from public, anon, authenticated;

/** O voluntário atualiza as próprias redes no perfil, como os demais campos de contato. */
create or replace function public.membro_atualizar_perfil(p_participante_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_part public.participantes;
  v_filtrado jsonb;
  permitidos constant text[] := array['nome_social','telefone','cep','logradouro','numero','complemento','bairro','cidade','uf',
    'emergencia_nome','emergencia_telefone','emergencia_parentesco','habilidades','idiomas','disponibilidade','redes'];
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
revoke all on function public.membro_atualizar_perfil(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.membro_atualizar_perfil(uuid, jsonb) to service_role;

/**
 * A foto enviada junto com a inscrição pública. Só para o servidor, logo depois
 * de inscrever_participante: candidato vindo do formulário, sem foto e inscrito
 * há menos de 30 minutos. O caminho tem de ser da pasta deste participante.
 */
create or replace function public.definir_foto_na_inscricao(p_participante_id uuid, p_foto_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
begin
  select * into v from public.participantes where id = p_participante_id for update;
  if not found or v.origem <> 'formulario' or v.situacao <> 'candidato' or v.anonimizado_em is not null
     or v.foto_path is not null or v.created_at < now() - interval '30 minutes' then
    raise exception 'Cadastro indisponível para receber a foto.' using errcode = 'P0001';
  end if;
  if p_foto_path is null or not private.foto_do_participante_valida(v.workspace_id, v.id, p_foto_path) then
    raise exception 'Foto inválida.' using errcode = 'P0001';
  end if;
  update public.participantes set foto_path = p_foto_path, updated_at = now() where id = v.id;
  insert into public.participantes_auditoria (workspace_id, participante_id, acao, detalhe)
  values (v.workspace_id, v.id, 'foto_pela_inscricao', '{}');
end $$;
revoke all on function public.definir_foto_na_inscricao(uuid, text) from public, anon, authenticated;
grant execute on function public.definir_foto_na_inscricao(uuid, text) to service_role;

-- Anonimizar limpa as redes (molde: participantes_sem_foto_ao_anonimizar, 20260928100000).
create or replace function private.participante_sem_redes_ao_anonimizar()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.redes := '{}';
  return new;
end $$;
revoke all on function private.participante_sem_redes_ao_anonimizar() from public, anon, authenticated;

-- Sem `drop trigger`: o conector que aplica a migração em produção trava em
-- comando destrutivo, e o gatilho é novo.
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'participantes_sem_redes_ao_anonimizar' and tgrelid = 'public.participantes'::regclass) then
    create trigger participantes_sem_redes_ao_anonimizar
      before update of anonimizado_em on public.participantes
      for each row when (new.anonimizado_em is not null and old.anonimizado_em is null)
      execute function private.participante_sem_redes_ao_anonimizar();
  end if;
end $$;
