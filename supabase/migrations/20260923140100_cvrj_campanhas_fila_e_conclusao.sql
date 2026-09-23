-- Duas peças do envio das campanhas:
--
--  1. ESTADO 'na_fila'. O destinatário é gravado ANTES de a mensagem sair —
--     com o token do pixel já definido, que vai dentro dela. Se a função da
--     Vercel morrer no meio do lote, o registro mostra exatamente quem ficou
--     sem confirmação, em vez de não mostrar nada.
--
--  2. concluir_campanha(): fecha a campanha numa transação só — totais,
--     estado final, e nos contatos que receberam: mais um envio, mais um na
--     sequência sem abertura, data do último envio. Um UPDATE em conjunto no
--     lugar de centenas de idas e voltas a partir do servidor.

alter table public.press_campanha_destinatarios
  drop constraint if exists press_campanha_destinatarios_estado_check;
alter table public.press_campanha_destinatarios
  add constraint press_campanha_destinatarios_estado_check
  check (estado in ('na_fila','enviado','falhou'));

create or replace function public.concluir_campanha(p_campanha_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enviados integer;
  v_falhas integer;
  v_total integer;
begin
  select count(*) filter (where estado = 'enviado'),
         count(*) filter (where estado <> 'enviado'),
         count(*)
    into v_enviados, v_falhas, v_total
    from public.press_campanha_destinatarios
   where campanha_id = p_campanha_id;

  update public.press_contacts c
     set total_envios = c.total_envios + 1,
         -- Quem já abriu antes de a campanha fechar (o Apple Mail pré-carrega
         -- na hora da entrega) não pode ganhar +1 na sequência sem abertura.
         envios_sem_abertura = case when d.aberto_em is null then c.envios_sem_abertura + 1 else 0 end,
         ultimo_envio_em = d.enviado_em
    from public.press_campanha_destinatarios d
   where d.campanha_id = p_campanha_id
     and d.estado = 'enviado'
     and d.contato_id = c.id;

  update public.press_campanhas
     set total_enviados = v_enviados,
         total_falhas = v_falhas,
         estado = case
           when v_enviados = 0 then 'falhou'
           when v_falhas > 0 then 'parcial'
           else 'enviada'
         end,
         concluida_em = now()
   where id = p_campanha_id;
end;
$$;

comment on function public.concluir_campanha is
  'Fecha uma campanha: totais, estado e contadores de envio dos contatos. Executável só pela service_role.';

revoke all on function public.concluir_campanha(uuid) from public;
revoke execute on function public.concluir_campanha(uuid) from anon;
revoke execute on function public.concluir_campanha(uuid) from authenticated;
grant execute on function public.concluir_campanha(uuid) to service_role;
