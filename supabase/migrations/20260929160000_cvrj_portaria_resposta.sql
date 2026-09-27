-- Portaria: quem é visitado responde se a visita pode subir. Só acréscimos.
-- Pedido do Matheus (27/09/2026). Na filial, a portaria pergunta o que a
-- pessoa quer; ela sobe ao hall e espera o setor atender. Agora:
--  - quem é visitado recebe o aviso (sino e WhatsApp) e responde, pelo Palácio
--    ou respondendo a mensagem do WhatsApp, com uma de três respostas:
--    "subir" (pode subir e aguardar no hall), "aguardar" (aguarde na recepção)
--    ou "recusar" (não pode receber agora), com um recado opcional;
--  - dá para mudar a resposta enquanto a visita está dentro ("aguarde" e,
--    depois, "pode subir");
--  - a portaria (quem registrou) é avisada, e o visitante recebe a resposta
--    no WhatsApp se autorizou na entrada (avisar_visitante);
--  - a portaria também pode registrar a resposta que recebeu por telefone.

alter table public.portaria_visitas
  add column if not exists resposta         text check (resposta is null or resposta in ('subir', 'aguardar', 'recusar')),
  add column if not exists resposta_recado  text check (resposta_recado is null or length(resposta_recado) <= 280),
  add column if not exists resposta_em      timestamptz,
  add column if not exists resposta_por     uuid references public.profiles (id) on delete set null,
  add column if not exists resposta_canal   text check (resposta_canal is null or resposta_canal in ('palacio', 'whatsapp')),
  -- O visitante autorizou receber no WhatsApp (neste telefone) a resposta de quem vai visitar.
  add column if not exists avisar_visitante boolean not null default false;

comment on column public.portaria_visitas.resposta is 'Resposta de quem é visitado: subir (pode subir e aguardar no hall), aguardar (na recepção) ou recusar.';
comment on column public.portaria_visitas.avisar_visitante is 'O visitante autorizou receber a resposta pelo WhatsApp, no telefone informado.';

create index if not exists portaria_visitas_resposta_por_idx on public.portaria_visitas (resposta_por);
-- A resposta sem citar a mensagem: a visita de hoje, ainda dentro, que espera quem é visitado.
create index if not exists portaria_visitas_visitado_dentro_idx on public.portaria_visitas (visitado_id, entrada_em desc)
  where saida_em is null and descartada_em is null and visitado_id is not null;

grant select (resposta, resposta_recado, resposta_em, resposta_por, resposta_canal, avisar_visitante) on public.portaria_visitas to authenticated;

-- Grava a resposta (comum ao Palácio e ao WhatsApp). Quem chama já conferiu quem pode.
create or replace function private.portaria_gravar_resposta(p_id uuid, p_user_id uuid, p_resposta text, p_recado text, p_canal text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.portaria_visitas;
  v_recado text := nullif(left(btrim(regexp_replace(coalesce(p_recado, ''), '\s+', ' ', 'g')), 280), '');
begin
  if p_resposta is null or p_resposta not in ('subir', 'aguardar', 'recusar') then
    raise exception 'Resposta inválida: pode subir, aguarde na recepção ou não posso receber agora.' using errcode = 'P0001';
  end if;
  select * into v from public.portaria_visitas where id = p_id for update;
  if not found then raise exception 'Visita não encontrada.' using errcode = 'P0001'; end if;
  if v.entrada_em is null or v.descartada_em is not null then raise exception 'Esta visita ainda não teve a entrada confirmada.' using errcode = 'P0001'; end if;
  if v.saida_em is not null then raise exception 'Esta visita já saiu da filial.' using errcode = 'P0001'; end if;
  update public.portaria_visitas
     set resposta = p_resposta, resposta_recado = v_recado, resposta_em = now(), resposta_por = p_user_id, resposta_canal = p_canal, updated_at = now()
   where id = v.id;
end $$;
revoke all on function private.portaria_gravar_resposta(uuid, uuid, text, text, text) from public, anon, authenticated;

-- Pelo Palácio: quem é visitado, ou a portaria (a resposta que chegou por telefone).
create or replace function public.portaria_responder(p_id uuid, p_resposta text, p_recado text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.portaria_visitas;
begin
  select * into v from public.portaria_visitas where id = p_id;
  if not found or not ((select auth.uid()) = v.visitado_id or (select private.pode_portaria(v.workspace_id))) then
    raise exception 'Visita não encontrada.' using errcode = 'P0001';
  end if;
  perform private.portaria_gravar_resposta(p_id, (select auth.uid()), p_resposta, p_recado, 'palacio');
end $$;

-- Pelo WhatsApp (só o servidor, com a chave de serviço): só quem é visitado, pelo número confirmado.
create or replace function public.portaria_responder_whatsapp(p_user_id uuid, p_id uuid, p_resposta text, p_recado text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.portaria_visitas;
begin
  select * into v from public.portaria_visitas where id = p_id;
  if not found or p_user_id is null or v.visitado_id is distinct from p_user_id then
    raise exception 'Esta visita não é para você.' using errcode = 'P0001';
  end if;
  perform private.portaria_gravar_resposta(p_id, p_user_id, p_resposta, p_recado, 'whatsapp');
end $$;

revoke all on function public.portaria_responder(uuid, text, text), public.portaria_responder_whatsapp(uuid, uuid, text, text) from public, anon;
grant execute on function public.portaria_responder(uuid, text, text) to authenticated;
revoke all on function public.portaria_responder_whatsapp(uuid, uuid, text, text) from authenticated;
grant execute on function public.portaria_responder_whatsapp(uuid, uuid, text, text) to service_role;

-- A autorização do visitante entra pelos mesmos formulários (a chave "avisar_visitante" do jsonb).
-- Mesmas funções da migração 20260929060000, com esse campo a mais; sem a chave, fica falso como antes.
create or replace function public.portaria_registrar_entrada(p_workspace_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_nome text := private.portaria_campo(p, 'nome', 120);
begin
  if not (select private.pode_portaria(p_workspace_id)) then raise exception 'Sem acesso à portaria.' using errcode = 'P0001'; end if;
  if v_nome is null or length(v_nome) < 2 then raise exception 'Escreva o nome do visitante.' using errcode = 'P0001'; end if;
  insert into public.portaria_visitas (workspace_id, nome, telefone, empresa, motivo, visitado_id, visitado_texto, cracha_numero, origem, entrada_em, registrado_por, avisar_visitante)
  values (p_workspace_id, v_nome, private.portaria_campo(p, 'telefone', 30), private.portaria_campo(p, 'empresa', 120), private.portaria_campo(p, 'motivo', 300),
    private.portaria_visitado(p_workspace_id, p), private.portaria_campo(p, 'visitado_texto', 120), private.portaria_campo(p, 'cracha_numero', 20),
    'portaria', now(), (select auth.uid()),
    coalesce(p ->> 'avisar_visitante', '') = 'true' and private.portaria_campo(p, 'telefone', 30) is not null)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.portaria_confirmar(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.portaria_visitas;
  v_nome text := private.portaria_campo(p, 'nome', 120);
begin
  select * into v from public.portaria_visitas where id = p_id for update;
  if not found or not (select private.pode_portaria(v.workspace_id)) then raise exception 'Visita não encontrada.' using errcode = 'P0001'; end if;
  if v.entrada_em is not null or v.descartada_em is not null then raise exception 'Esta visita já foi confirmada ou descartada.' using errcode = 'P0001'; end if;
  if v_nome is null or length(v_nome) < 2 then raise exception 'Escreva o nome do visitante.' using errcode = 'P0001'; end if;
  update public.portaria_visitas set nome = v_nome, telefone = private.portaria_campo(p, 'telefone', 30), empresa = private.portaria_campo(p, 'empresa', 120),
    motivo = private.portaria_campo(p, 'motivo', 300), visitado_id = private.portaria_visitado(v.workspace_id, p),
    visitado_texto = private.portaria_campo(p, 'visitado_texto', 120), cracha_numero = private.portaria_campo(p, 'cracha_numero', 20),
    -- A autorização dada pelo próprio visitante no QR vale; a portaria também pode marcar (com o visitante na frente).
    avisar_visitante = (v.avisar_visitante or coalesce(p ->> 'avisar_visitante', '') = 'true') and private.portaria_campo(p, 'telefone', 30) is not null,
    entrada_em = now(), confirmado_por = (select auth.uid()), updated_at = now()
  where id = v.id;
end $$;

create or replace function public.portaria_autocadastro(p_workspace_id uuid, p_token text, p jsonb, p_ip_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_nome text := private.portaria_campo(p, 'nome', 120);
begin
  if p_token is null or not exists (select 1 from public.portaria_config c where c.workspace_id = p_workspace_id and c.token = p_token) then
    raise exception 'Este QR não vale mais. Peça ajuda na portaria.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.portaria_visitas where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 6 then
    raise exception 'Muitos cadastros daqui em pouco tempo. Fale com a portaria.' using errcode = 'P0001';
  end if;
  if v_nome is null or length(v_nome) < 2 then raise exception 'Escreva o seu nome.' using errcode = 'P0001'; end if;
  insert into public.portaria_visitas (workspace_id, nome, telefone, empresa, motivo, visitado_texto, origem, ip_hash, avisar_visitante)
  values (p_workspace_id, v_nome, private.portaria_campo(p, 'telefone', 30), private.portaria_campo(p, 'empresa', 120), private.portaria_campo(p, 'motivo', 300),
    private.portaria_campo(p, 'visitado_texto', 120), 'autocadastro', left(p_ip_hash, 128),
    coalesce(p ->> 'avisar_visitante', '') = 'true' and private.portaria_campo(p, 'telefone', 30) is not null)
  returning id into v_id;
  return v_id;
end $$;
