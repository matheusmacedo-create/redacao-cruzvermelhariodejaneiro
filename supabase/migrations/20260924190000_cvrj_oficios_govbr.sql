-- Ofícios assinados pelo gov.br.
--
-- A API de assinatura do gov.br só atende órgãos públicos. Por isso a
-- assinatura acontece no assinador do gov.br (assinador.iti.br) e o Redação
-- entra antes e depois: gera o PDF do ofício, recebe de volta o PDF
-- assinado, confere a assinatura e guarda o arquivo.
--
-- O ofício escolhe na emissão como vai ser assinado: 'senha' (a senha do
-- Redação, como antes) ou 'govbr'. No gov.br, cada pessoa assina o PDF da
-- vez — o original ou o que já tem as assinaturas anteriores — e a nova
-- versão só é aceita se a anterior estiver, byte a byte, no começo dela.
-- O manifesto carimbado no Bitcoin passa a incluir o hash do PDF final e
-- os dados do certificado de cada assinatura.

alter table public.oficios
  add column if not exists modo_assinatura text not null default 'senha' check (modo_assinatura in ('senha','govbr')),
  add column if not exists pdf_original_sha256 text check (pdf_original_sha256 is null or pdf_original_sha256 ~ '^[0-9a-f]{64}$'),
  add column if not exists pdf_original_tamanho integer,
  add column if not exists pdf_atual_path text,
  add column if not exists pdf_atual_sha256 text check (pdf_atual_sha256 is null or pdf_atual_sha256 ~ '^[0-9a-f]{64}$'),
  add column if not exists pdf_versao integer not null default 0;

alter table public.oficio_assinantes
  add column if not exists metodo text check (metodo is null or metodo in ('senha','govbr')),
  add column if not exists certificado jsonb,
  add column if not exists pdf_sha256 text check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$');

-- Arquivos dos ofícios: privados, só o servidor lê e grava.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('oficios', 'oficios', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------- imutabilidade

create or replace function private.oficio_imutavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.estado <> 'rascunho' then
      raise exception 'Ofício emitido não se apaga. Cancele-o com um motivo.' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if new.estado is distinct from old.estado and not (
       (old.estado = 'rascunho' and new.estado = 'em_assinatura')
    or (old.estado = 'em_assinatura' and new.estado in ('assinado','cancelado'))
    or (old.estado = 'assinado' and new.estado = 'cancelado')
  ) then
    raise exception 'Mudança de estado inválida (% → %).', old.estado, new.estado using errcode = 'P0001';
  end if;

  if old.estado <> 'rascunho' and (
       new.workspace_id is distinct from old.workspace_id
    or new.ano is distinct from old.ano
    or new.numero is distinct from old.numero
    or new.data_do_documento is distinct from old.data_do_documento
    or new.setor is distinct from old.setor
    or new.local is distinct from old.local
    or new.destinatario_nome is distinct from old.destinatario_nome
    or new.destinatario_cargo is distinct from old.destinatario_cargo
    or new.destinatario_orgao is distinct from old.destinatario_orgao
    or new.destinatario_endereco is distinct from old.destinatario_endereco
    or new.vocativo is distinct from old.vocativo
    or new.assunto is distinct from old.assunto
    or new.corpo is distinct from old.corpo
    or new.fecho is distinct from old.fecho
    or new.conteudo_canonico is distinct from old.conteudo_canonico
    or new.hash_documento is distinct from old.hash_documento
    or new.codigo_verificacao is distinct from old.codigo_verificacao
    or new.emitido_em is distinct from old.emitido_em
    or new.modo_assinatura is distinct from old.modo_assinatura
  ) then
    raise exception 'Ofício emitido não pode ser alterado.' using errcode = 'P0001';
  end if;

  -- O PDF original, uma vez registrado, é para sempre.
  if old.pdf_original_sha256 is not null and (
       new.pdf_original_sha256 is distinct from old.pdf_original_sha256
    or new.pdf_original_tamanho is distinct from old.pdf_original_tamanho
  ) then
    raise exception 'O PDF original do ofício não pode ser trocado.' using errcode = 'P0001';
  end if;
  -- A versão atual só avança enquanto o ofício está em assinatura.
  if old.pdf_atual_sha256 is not null and old.estado <> 'em_assinatura' and (
       new.pdf_atual_sha256 is distinct from old.pdf_atual_sha256
    or new.pdf_atual_path is distinct from old.pdf_atual_path
    or new.pdf_versao is distinct from old.pdf_versao
  ) then
    raise exception 'O PDF assinado não pode ser trocado.' using errcode = 'P0001';
  end if;

  if old.hash_manifesto is not null and (
       new.manifesto is distinct from old.manifesto
    or new.hash_manifesto is distinct from old.hash_manifesto
    or new.assinado_em is distinct from old.assinado_em
  ) then
    raise exception 'As assinaturas de um ofício não podem ser alteradas.' using errcode = 'P0001';
  end if;

  if old.estado = 'cancelado' and (
       new.cancelado_em is distinct from old.cancelado_em
    or new.motivo_cancelamento is distinct from old.motivo_cancelamento
  ) then
    raise exception 'O cancelamento não pode ser alterado.' using errcode = 'P0001';
  end if;

  return new;
end $$;

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

-- ---------------------------------------------------------------- conclusão

-- Quando não falta ninguém: monta o manifesto, calcula o hash e abre o
-- carimbo no Bitcoin. Chamada de dentro das funções de assinatura.
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
                       'ordem', a.ordem, 'nome', a.nome, 'cargo', a.cargo, 'usuario', a.user_id,
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

-- ---------------------------------------------------------------- emissão

drop function if exists public.emitir_oficio(uuid, jsonb);
create or replace function public.emitir_oficio(p_oficio_id uuid, p_assinantes jsonb, p_modo text default 'senha')
returns text language plpgsql security definer set search_path = '' as $$
declare
  v public.oficios;
  v_qtd integer;
  v_ano integer;
  v_num integer;
  v_data date;
  v_canon text;
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

  v_ano := extract(year from (now() at time zone 'America/Sao_Paulo'))::integer;
  v_data := (now() at time zone 'America/Sao_Paulo')::date;
  insert into public.oficio_numeracao as n (workspace_id, ano, ultimo) values (v.workspace_id, v_ano, 1)
    on conflict (workspace_id, ano) do update set ultimo = n.ultimo + 1
    returning ultimo into v_num;

  insert into public.oficio_assinantes (workspace_id, oficio_id, user_id, nome, cargo, ordem)
  select v.workspace_id, v.id, p.id, p.full_name, nullif(trim(coalesce(nullif(trim(x.e->>'cargo'), ''), p.job_title, '')), ''), x.o::integer
  from jsonb_array_elements(p_assinantes) with ordinality as x(e, o)
  join public.profiles p on p.id = (x.e->>'user_id')::uuid;

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
    'assinantes', (select jsonb_agg(jsonb_build_object('ordem', a.ordem, 'nome', a.nome, 'cargo', a.cargo, 'usuario', a.user_id) order by a.ordem)
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

-- ---------------------------------------------------------------- assinar com senha

create or replace function public.assinar_oficio(p_oficio_id uuid, p_hash text, p_ip text, p_user_agent text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v public.oficios;
begin
  select * into v from public.oficios where id = p_oficio_id for update;
  if not found or not (select private.is_workspace_member(v.workspace_id)) then
    raise exception 'Ofício não encontrado.' using errcode = 'P0001';
  end if;
  if v.estado <> 'em_assinatura' then
    raise exception 'Este ofício não está aguardando assinatura.' using errcode = 'P0001';
  end if;
  if v.modo_assinatura <> 'senha' then
    raise exception 'Este ofício é assinado pelo gov.br: baixe o PDF, assine no gov.br e envie o arquivo assinado.' using errcode = 'P0001';
  end if;
  if p_hash is distinct from v.hash_documento then
    raise exception 'O documento que você viu não é o que está registrado. Recarregue a página e confira antes de assinar.' using errcode = 'P0001';
  end if;

  update public.oficio_assinantes
     set estado = 'assinado', metodo = 'senha', assinado_em = now(), hash_assinado = v.hash_documento,
         ip = left(p_ip, 64), user_agent = left(p_user_agent, 300)
   where oficio_id = v.id and user_id = (select auth.uid()) and estado = 'pendente';
  if not found then
    raise exception 'Você não está entre quem assina este ofício, ou já assinou.' using errcode = 'P0001';
  end if;

  return private.concluir_oficio(v.id);
end $$;

-- ---------------------------------------------------------------- PDF e gov.br (só o servidor)

create or replace function public.registrar_pdf_original(p_oficio_id uuid, p_sha256 text, p_tamanho integer, p_path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.oficios
     set pdf_original_sha256 = p_sha256, pdf_original_tamanho = p_tamanho,
         pdf_atual_sha256 = p_sha256, pdf_atual_path = p_path, pdf_versao = 0
   where id = p_oficio_id and estado <> 'rascunho' and pdf_original_sha256 is null;
end $$;

create or replace function public.registrar_assinatura_govbr(
  p_oficio_id uuid, p_user_id uuid, p_pdf_anterior_sha256 text, p_pdf_sha256 text, p_pdf_path text,
  p_certificado jsonb, p_ip text, p_user_agent text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v public.oficios;
begin
  select * into v from public.oficios where id = p_oficio_id for update;
  if not found then
    raise exception 'Ofício não encontrado.' using errcode = 'P0001';
  end if;
  if v.estado <> 'em_assinatura' then
    raise exception 'Este ofício não está aguardando assinatura.' using errcode = 'P0001';
  end if;
  if v.modo_assinatura <> 'govbr' then
    raise exception 'Este ofício é assinado com a senha do Redação.' using errcode = 'P0001';
  end if;
  if v.pdf_atual_sha256 is distinct from p_pdf_anterior_sha256 then
    raise exception 'Outra pessoa enviou uma assinatura enquanto você assinava. Baixe o PDF de novo, assine e envie.' using errcode = 'P0001';
  end if;

  update public.oficio_assinantes
     set estado = 'assinado', metodo = 'govbr', assinado_em = now(), hash_assinado = v.hash_documento,
         certificado = p_certificado, pdf_sha256 = p_pdf_sha256,
         ip = left(p_ip, 64), user_agent = left(p_user_agent, 300)
   where oficio_id = v.id and user_id = p_user_id and estado = 'pendente';
  if not found then
    raise exception 'Você não está entre quem assina este ofício, ou já assinou.' using errcode = 'P0001';
  end if;

  update public.oficios set pdf_atual_sha256 = p_pdf_sha256, pdf_atual_path = p_pdf_path, pdf_versao = v.pdf_versao + 1, updated_at = now()
   where id = v.id;

  return private.concluir_oficio(v.id);
end $$;

revoke all on function public.emitir_oficio(uuid, jsonb, text) from public, anon;
grant execute on function public.emitir_oficio(uuid, jsonb, text) to authenticated;
revoke all on function public.registrar_pdf_original(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.registrar_assinatura_govbr(uuid, uuid, text, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.registrar_pdf_original(uuid, text, integer, text) to service_role;
grant execute on function public.registrar_assinatura_govbr(uuid, uuid, text, text, text, jsonb, text, text) to service_role;
