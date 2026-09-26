-- ============================================================
-- Ofícios: quem assina assina com os dados do cadastro da Equipe.
--
-- Pedido de 26/09/2026: "a assinatura precisa ser o nome de cadastro de
-- quem está fazendo a assinatura com os dados completos". O nome vinha da
-- conta (profiles.full_name, que cada um escreve como quer). Agora vem de
-- equipe_membros: nome completo, CPF mascarado (***.456.789-**), cargo e
-- setor, copiados para oficio_assinantes na emissão — o documento guarda
-- quem assinou como era naquele dia.
--
-- Quem não tem nome e CPF na Equipe não pode ser escolhido: a emissão
-- recusa dizendo quem falta completar.
--
-- Só acrescenta colunas; as três funções são recriadas com a mesma
-- assinatura (o código no ar continua chamando igual). Ofícios já emitidos
-- não mudam.
-- ============================================================

alter table public.oficio_assinantes add column if not exists cpf_mascara text check (cpf_mascara is null or length(cpf_mascara) <= 20);
alter table public.oficio_assinantes add column if not exists setor text check (setor is null or length(setor) <= 120);

-- A emissão lê equipe_membros pelo usuário.
create index if not exists equipe_membros_ws_usuario_idx on public.equipe_membros (workspace_id, user_id) where user_id is not null;

create or replace function private.oficio_assinante_imutavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Assinatura de ofício não se apaga.' using errcode = 'P0001';
  end if;
  if old.estado <> 'pendente' and (
       new.estado is distinct from old.estado
    or new.assinado_em is distinct from old.assinado_em
    or new.hash_assinado is distinct from old.hash_assinado
    or new.nome is distinct from old.nome
    or new.cargo is distinct from old.cargo
    or new.cpf_mascara is distinct from old.cpf_mascara
    or new.setor is distinct from old.setor
    or new.ordem is distinct from old.ordem
    or new.oficio_id is distinct from old.oficio_id
    or new.ip is distinct from old.ip
    or new.user_agent is distinct from old.user_agent
    or new.motivo_recusa is distinct from old.motivo_recusa
    or new.metodo is distinct from old.metodo
    or new.certificado is distinct from old.certificado
    or new.pdf_sha256 is distinct from old.pdf_sha256
    or (new.user_id is distinct from old.user_id and new.user_id is not null)
  ) then
    raise exception 'Assinatura registrada não pode ser alterada.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function private.concluir_oficio(p_oficio_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v public.oficios;
  v_manifesto text;
  v_hash text;
begin
  select * into v from public.oficios where id = p_oficio_id for update;
  if v.estado <> 'em_assinatura' then return false; end if;
  if exists (select 1 from public.oficio_assinantes where oficio_id = v.id and estado <> 'assinado') then
    return false;
  end if;

  v_manifesto := jsonb_strip_nulls(jsonb_build_object(
    'formato', 'manifesto-de-assinaturas/1',
    'numero', private.codigo_do_oficio(v.numero, v.ano),
    'documento_sha256', v.hash_documento,
    'codigo_de_verificacao', v.codigo_verificacao,
    'modo_de_assinatura', v.modo_assinatura,
    'pdf_final_sha256', case when v.modo_assinatura = 'govbr' then v.pdf_atual_sha256 end,
    'assinaturas', (select jsonb_agg(jsonb_build_object(
                       'ordem', a.ordem, 'nome', a.nome, 'cpf', a.cpf_mascara, 'cargo', a.cargo, 'setor', a.setor, 'usuario', a.user_id,
                       'metodo', a.metodo,
                       'assinado_em', to_char(a.assinado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
                       'documento_sha256', a.hash_assinado,
                       'pdf_sha256', a.pdf_sha256,
                       'certificado', a.certificado) order by a.ordem)
                    from public.oficio_assinantes a where a.oficio_id = v.id)
  ))::text;
  v_hash := encode(extensions.digest(convert_to(v_manifesto, 'UTF8'), 'sha256'), 'hex');

  update public.oficios set estado = 'assinado', assinado_em = now(), manifesto = v_manifesto, hash_manifesto = v_hash, updated_at = now()
   where id = v.id;
  insert into public.oficio_carimbos (workspace_id, oficio_id, hash) values (v.workspace_id, v.id, v_hash)
    on conflict (oficio_id, hash) do nothing;
  return true;
end $$;
revoke all on function private.concluir_oficio(uuid) from public, anon, authenticated;

create or replace function public.emitir_oficio(p_oficio_id uuid, p_assinantes jsonb, p_modo text default 'senha')
returns text language plpgsql security definer set search_path = '' as $$
declare
  v public.oficios;
  v_qtd integer;
  v_ano integer;
  v_num integer;
  v_data date;
  v_canon text;
  v_faltam text;
begin
  if p_modo is null or p_modo not in ('senha', 'govbr') then
    raise exception 'Escolha como o ofício vai ser assinado.' using errcode = 'P0001';
  end if;
  select * into v from public.oficios where id = p_oficio_id for update;
  if not found or not (select private.is_workspace_member(v.workspace_id)) then
    raise exception 'Ofício não encontrado.' using errcode = 'P0001';
  end if;
  if v.criado_por is distinct from (select auth.uid()) and (select private.workspace_role(v.workspace_id)) is distinct from 'admin' then
    raise exception 'Só quem criou o ofício, ou um admin, pode emiti-lo.' using errcode = 'P0001';
  end if;
  if v.estado <> 'rascunho' then
    raise exception 'Este ofício já foi emitido.' using errcode = 'P0001';
  end if;
  if length(trim(v.assunto)) < 3 then
    raise exception 'Escreva o assunto antes de emitir.' using errcode = 'P0001';
  end if;
  if length(trim(v.corpo)) < 10 then
    raise exception 'Escreva o texto do ofício antes de emitir.' using errcode = 'P0001';
  end if;
  if coalesce(trim(v.destinatario_nome), '') = '' and coalesce(trim(v.destinatario_orgao), '') = '' then
    raise exception 'Informe a quem o ofício se dirige.' using errcode = 'P0001';
  end if;

  if p_assinantes is null or jsonb_typeof(p_assinantes) <> 'array' then
    raise exception 'Escolha quem assina.' using errcode = 'P0001';
  end if;
  v_qtd := jsonb_array_length(p_assinantes);
  if v_qtd < 1 or v_qtd > 10 then
    raise exception 'Escolha de 1 a 10 pessoas para assinar.' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_assinantes) e
             where coalesce(e->>'user_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                or length(coalesce(e->>'cargo', '')) > 120) then
    raise exception 'Lista de quem assina inválida.' using errcode = 'P0001';
  end if;
  if (select count(distinct e->>'user_id') from jsonb_array_elements(p_assinantes) e) <> v_qtd then
    raise exception 'A mesma pessoa aparece duas vezes na lista de quem assina.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_assinantes) e
    where not exists (
      select 1 from public.workspace_members m join public.profiles p on p.id = m.user_id
      where m.workspace_id = v.workspace_id and m.user_id = (e->>'user_id')::uuid and p.active
    )
  ) then
    raise exception 'Quem assina precisa ser membro ativo deste espaço.' using errcode = 'P0001';
  end if;

  -- Quem assina assina com o nome do cadastro da Equipe, com o CPF: a folha
  -- e o manifesto levam os dados de quem é de fato, não o apelido da conta.
  select string_agg(coalesce(p.full_name, 'alguém sem nome'), ', ' order by p.full_name) into v_faltam
  from jsonb_array_elements(p_assinantes) e
  join public.profiles p on p.id = (e->>'user_id')::uuid
  where not exists (
    select 1 from public.equipe_membros q
    where q.workspace_id = v.workspace_id and q.user_id = p.id and q.situacao <> 'desligado'
      and length(trim(q.nome)) >= 2 and q.cpf_mascara is not null
  );
  if v_faltam is not null then
    raise exception 'Para assinar, a pessoa precisa ter nome completo e CPF no cadastro da Equipe. Falta completar: %.', v_faltam using errcode = 'P0001';
  end if;

  v_ano := extract(year from (now() at time zone 'America/Sao_Paulo'))::integer;
  v_data := (now() at time zone 'America/Sao_Paulo')::date;
  insert into public.oficio_numeracao as n (workspace_id, ano, ultimo) values (v.workspace_id, v_ano, 1)
    on conflict (workspace_id, ano) do update set ultimo = n.ultimo + 1
    returning ultimo into v_num;

  insert into public.oficio_assinantes (workspace_id, oficio_id, user_id, nome, cpf_mascara, cargo, setor, ordem)
  select v.workspace_id, v.id, p.id, trim(q.nome), q.cpf_mascara,
         nullif(trim(coalesce(nullif(trim(x.e->>'cargo'), ''), q.cargo, p.job_title, '')), ''),
         nullif(trim(coalesce(q.setor, '')), ''), x.o::integer
  from jsonb_array_elements(p_assinantes) with ordinality as x(e, o)
  join public.profiles p on p.id = (x.e->>'user_id')::uuid
  join lateral (
    select q.nome, q.cpf_mascara, q.cargo, q.setor from public.equipe_membros q
    where q.workspace_id = v.workspace_id and q.user_id = p.id and q.situacao <> 'desligado'
    order by q.updated_at desc nulls last limit 1
  ) q on true;

  v_canon := jsonb_build_object(
    'formato', 'oficio/1',
    'emitente', (select w.name from public.workspaces w where w.id = v.workspace_id),
    'numero', private.codigo_do_oficio(v_num, v_ano),
    'data', v_data,
    'local', v.local,
    'setor', v.setor,
    'destinatario', jsonb_build_object('nome', v.destinatario_nome, 'cargo', v.destinatario_cargo, 'orgao', v.destinatario_orgao, 'endereco', v.destinatario_endereco),
    'vocativo', v.vocativo,
    'assunto', v.assunto,
    'corpo', v.corpo,
    'fecho', v.fecho,
    'assinatura', p_modo,
    'assinantes', (select jsonb_agg(jsonb_build_object('ordem', a.ordem, 'nome', a.nome, 'cpf', a.cpf_mascara, 'cargo', a.cargo, 'setor', a.setor, 'usuario', a.user_id) order by a.ordem)
                   from public.oficio_assinantes a where a.oficio_id = v.id)
  )::text;

  update public.oficios set
    estado = 'em_assinatura', ano = v_ano, numero = v_num, data_do_documento = v_data,
    modo_assinatura = p_modo,
    conteudo_canonico = v_canon,
    hash_documento = encode(extensions.digest(convert_to(v_canon, 'UTF8'), 'sha256'), 'hex'),
    emitido_por = (select auth.uid()), emitido_em = now(), updated_at = now()
  where id = v.id;

  return private.codigo_do_oficio(v_num, v_ano);
end $$;
