-- Métricas de campanha no formato de painel (cliques, descadastros por
-- campanha, aberturas totais) e rascunhos.
--
--  1. CLIQUE. O link da mensagem passa por /api/comunicados/clique/<token>,
--     que registra e redireciona. O destino vem do BANCO (link_url da
--     campanha), nunca da URL — senão a rota viraria redirecionador aberto
--     para qualquer site, com o domínio da Cruz Vermelha na frente.
--     Clicar também conta como abrir: quem bloqueia imagem e clica, leu.
--
--  2. DESCADASTRO POR CAMPANHA. O link de saída passa a levar também o token
--     do destinatário, para saber QUAL campanha fez a pessoa sair.
--
--  3. RASCUNHO. A campanha pode ser escrita e guardada antes de sair; os
--     destinatários são escolhidos na hora do envio.

alter table public.press_campanhas drop constraint if exists press_campanhas_estado_check;
alter table public.press_campanhas add constraint press_campanhas_estado_check
  check (estado in ('rascunho','enviando','enviada','parcial','falhou'));

alter table public.press_campanhas
  add column if not exists enviada_em             timestamptz,
  add column if not exists atualizada_em          timestamptz not null default now(),
  add column if not exists total_aberturas_brutas integer not null default 0,
  add column if not exists total_cliques          integer not null default 0,
  add column if not exists total_cliques_brutos   integer not null default 0,
  add column if not exists total_descadastros     integer not null default 0;

-- As campanhas que já saíram foram enviadas na criação.
update public.press_campanhas set enviada_em = created_at where enviada_em is null and estado <> 'rascunho';

update public.press_campanhas c
   set total_aberturas_brutas = coalesce((select sum(d.aberturas) from public.press_campanha_destinatarios d where d.campanha_id = c.id), 0);

create index if not exists press_campanhas_enviada_em_idx
  on public.press_campanhas (workspace_id, enviada_em desc);

alter table public.press_campanha_destinatarios
  add column if not exists clicado_em      timestamptz,
  add column if not exists cliques         integer not null default 0,
  add column if not exists descadastrou_em timestamptz;

create or replace function public.registrar_abertura_de_campanha(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linha public.press_campanha_destinatarios%rowtype;
begin
  update public.press_campanha_destinatarios
     set aberturas = aberturas + 1,
         aberto_em = coalesce(aberto_em, now())
   where token_abertura = p_token
  returning * into v_linha;

  if not found then
    return;
  end if;

  update public.press_campanhas
     set total_aberturas_brutas = total_aberturas_brutas + 1,
         total_aberturas = total_aberturas + (case when v_linha.aberturas = 1 then 1 else 0 end)
   where id = v_linha.campanha_id;

  if v_linha.aberturas = 1 and v_linha.contato_id is not null then
    update public.press_contacts
       set total_aberturas = total_aberturas + 1,
           envios_sem_abertura = 0,
           ultima_abertura_em = now()
     where id = v_linha.contato_id;
  end if;
end;
$$;

create or replace function public.registrar_clique_de_campanha(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linha public.press_campanha_destinatarios%rowtype;
  v_link text;
begin
  update public.press_campanha_destinatarios
     set cliques = cliques + 1,
         clicado_em = coalesce(clicado_em, now())
   where token_abertura = p_token
  returning * into v_linha;

  if not found then
    return null;
  end if;

  -- Quem clicou abriu, mesmo que a imagem do pixel nunca tenha carregado.
  if v_linha.aberto_em is null then
    perform public.registrar_abertura_de_campanha(p_token);
  end if;

  update public.press_campanhas
     set total_cliques_brutos = total_cliques_brutos + 1,
         total_cliques = total_cliques + (case when v_linha.cliques = 1 then 1 else 0 end)
   where id = v_linha.campanha_id
  returning link_url into v_link;

  return nullif(v_link, '');
end;
$$;

create or replace function public.registrar_descadastro(p_token_contato text, p_token_destinatario text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campanha uuid;
begin
  update public.press_contacts
     set descadastrado_em = now()
   where token_descadastro = p_token_contato
     and descadastrado_em is null;

  if not found or p_token_destinatario is null then
    return;
  end if;

  update public.press_campanha_destinatarios d
     set descadastrou_em = now()
    from public.press_contacts c
   where d.token_abertura = p_token_destinatario
     and d.contato_id = c.id
     and c.token_descadastro = p_token_contato
     and d.descadastrou_em is null
  returning d.campanha_id into v_campanha;

  if v_campanha is not null then
    update public.press_campanhas set total_descadastros = total_descadastros + 1 where id = v_campanha;
  end if;
end;
$$;

comment on function public.registrar_clique_de_campanha is
  'Registra o clique pelo token do destinatário e devolve o link da campanha (do banco, nunca da URL). Só service_role.';
comment on function public.registrar_descadastro is
  'Tira o contato da lista e, se vier o token do destinatário, credita o descadastro à campanha. Só service_role.';

revoke all on function public.registrar_abertura_de_campanha(text) from public;
revoke all on function public.registrar_clique_de_campanha(text) from public;
revoke all on function public.registrar_descadastro(text, text) from public;
revoke execute on function public.registrar_clique_de_campanha(text) from anon, authenticated;
revoke execute on function public.registrar_descadastro(text, text) from anon, authenticated;
revoke execute on function public.registrar_abertura_de_campanha(text) from anon, authenticated;
grant execute on function public.registrar_abertura_de_campanha(text) to service_role;
grant execute on function public.registrar_clique_de_campanha(text) to service_role;
grant execute on function public.registrar_descadastro(text, text) to service_role;
