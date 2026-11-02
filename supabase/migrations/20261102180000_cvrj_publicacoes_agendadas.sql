-- Publicação agendada do pacote com página no site (02/11/2026).
--
-- Até aqui o "Agendar prontos" valia só para as redes e a newsletter (o
-- conector e o Resend guardam o horário); a página do site subia na hora,
-- porque quem a publica é o próprio Palácio e a Vercel do plano Hobby só
-- aceita cron diário. Agora o pacote com o site na rodada espera numa fila,
-- e o relógio do banco (pg_cron) chama /api/publicacao/agendadas quando um
-- pedido vence. A rota publica um pacote por chamada, pelo mesmo caminho do
-- "Publicar prontos", em nome de quem agendou.
--
-- Só acrescenta: uma tabela, uma função restrita ao servidor, a extensão
-- pg_cron e um job. O segredo da chamada (o mesmo CRON_SECRET da Vercel) é
-- lido do cofre, com o nome 'cron_secret'; sem ele, o job não chama nada.

-- 1. A fila.
create table if not exists public.publicacoes_agendadas (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  package_id    uuid not null references public.social_packages (id) on delete cascade,
  quando        timestamptz not null,
  agendado_por  uuid references public.profiles (id) on delete set null,
  -- Destinos em "gerada"/"em_ajuste" que a pessoa pediu para levar junto
  -- (o `incluir` do publicarPacote); os "pronta" vão sempre.
  incluir       uuid[] not null default '{}',
  estado        text not null default 'agendada'
                check (estado in ('agendada','publicando','feita','falhou','cancelada')),
  erro          text check (erro is null or char_length(erro) <= 500),
  criado_em     timestamptz not null default now(),
  iniciado_em   timestamptz,
  executado_em  timestamptz
);

-- Um pedido vivo por pacote: agendar de novo troca o horário, não duplica.
create unique index if not exists publicacoes_agendadas_viva_idx
  on public.publicacoes_agendadas (package_id) where estado in ('agendada','publicando');
create index if not exists publicacoes_agendadas_vencidas_idx
  on public.publicacoes_agendadas (quando) where estado = 'agendada';

alter table public.publicacoes_agendadas enable row level security;
revoke all on public.publicacoes_agendadas from anon;

drop policy if exists publicacoes_agendadas_select on public.publicacoes_agendadas;
create policy publicacoes_agendadas_select on public.publicacoes_agendadas
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

-- Agendar assina a autoria: é em nome desta pessoa que o pacote sai.
drop policy if exists publicacoes_agendadas_insert on public.publicacoes_agendadas;
create policy publicacoes_agendadas_insert on public.publicacoes_agendadas
  for insert to authenticated
  with check (
    (select private.is_workspace_member(workspace_id))
    and agendado_por = (select auth.uid())
    and estado = 'agendada'
  );

-- Pela tela, só se troca o horário ou se cancela o que ainda espera; o resto
-- (publicando, feita, falhou) é escrito pela rota, com o service role.
drop policy if exists publicacoes_agendadas_update on public.publicacoes_agendadas;
create policy publicacoes_agendadas_update on public.publicacoes_agendadas
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)) and estado = 'agendada')
  with check ((select private.is_workspace_member(workspace_id)) and estado in ('agendada','cancelada'));

-- 2. Reserva o próximo pedido vencido, um por chamada. `skip locked` é o que
--    impede duas chamadas seguidas (o job roda a cada minuto e a publicação
--    pode passar disso) de publicarem o mesmo pacote. Antes, quem ficou
--    "publicando" por mais de 10 minutos vira falha: a função da Vercel morre
--    aos 60 s, então ninguém mais vai fechar aquele pedido.
create or replace function public.reservar_publicacao_agendada()
returns setof public.publicacoes_agendadas
language plpgsql security definer set search_path = '' as $$
begin
  update public.publicacoes_agendadas
     set estado = 'falhou', executado_em = now(),
         erro = 'A publicação começou e não terminou. Confira o site antes de publicar de novo.'
   where estado = 'publicando' and iniciado_em < now() - interval '10 minutes';

  return query
  update public.publicacoes_agendadas p
     set estado = 'publicando', iniciado_em = now()
   where p.id = (
     select id from public.publicacoes_agendadas
      where estado = 'agendada' and quando <= now()
      order by quando
      limit 1
      for update skip locked)
  returning p.*;
end $$;
revoke all on function public.reservar_publicacao_agendada() from public, anon, authenticated;
grant execute on function public.reservar_publicacao_agendada() to service_role;

-- 3. O relógio. A cada minuto, e só quando há pedido vencido (ou preso), chama
--    a rota com o segredo do cofre. Sem o segredo 'cron_secret', não chama.
create extension if not exists pg_cron;

select cron.schedule(
  'publicar-agendadas',
  '* * * * *',
  $job$
  select net.http_get(
    url := 'https://palacio.cruzvermelhariodejaneiro.org/api/publicacao/agendadas',
    headers := jsonb_build_object('Authorization', 'Bearer ' || s.decrypted_secret),
    timeout_milliseconds := 60000
  )
    from vault.decrypted_secrets s
   where s.name = 'cron_secret'
     and exists (
       select 1 from public.publicacoes_agendadas a
        where (a.estado = 'agendada' and a.quando <= now())
           or (a.estado = 'publicando' and a.iniciado_em < now() - interval '10 minutes'))
  $job$
);
