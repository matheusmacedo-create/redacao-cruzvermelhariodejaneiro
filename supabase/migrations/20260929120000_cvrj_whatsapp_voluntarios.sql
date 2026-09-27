-- ============================================================
-- WhatsApp dos voluntários: oportunidades com autorização (LGPD)
--
-- Só acrescenta (ARQUITETURA §10.1). O código anterior não usa nada daqui, e
-- sem esta migração a Área do Voluntário só não mostra o quadro do WhatsApp.
--
--  - participantes_whatsapp: o número que a pessoa confirmou pela Área do
--    Voluntário (código de 6 números enviado ao próprio WhatsApp) e a
--    autorização dela — o texto exato aceito e quando (LGPD, art. 7º, I e
--    art. 8º). Sem autorização guardada, nada sai. "sair" no WhatsApp ou o
--    botão da Área pausam; "Remover" apaga o número.
--  - oportunidades.avisada_por_whatsapp_em: a oportunidade é anunciada uma
--    vez só, na primeira publicação (despublicar e publicar de novo não
--    repete o aviso).
-- ============================================================

create table if not exists public.participantes_whatsapp (
  participante_id     uuid primary key references public.participantes (id) on delete cascade,
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  numero              text check (numero is null or numero ~ '^[0-9]{10,15}$'),
  confirmado_em       timestamptz,
  consentimento_em    timestamptz,
  consentimento_texto text check (consentimento_texto is null or char_length(consentimento_texto) <= 1000),
  pausado_em          timestamptz,
  -- A confirmação em andamento: só o hash do código, amarrado à pessoa e ao número.
  numero_pendente     text check (numero_pendente is null or numero_pendente ~ '^[0-9]{10,15}$'),
  codigo_hash         text check (codigo_hash is null or codigo_hash ~ '^[0-9a-f]{64}$'),
  codigo_expira_em    timestamptz,
  codigo_tentativas   smallint not null default 0 check (codigo_tentativas >= 0),
  -- Freio de códigos: quantos na janela que começou em codigos_desde.
  codigos_desde       timestamptz,
  codigos_na_janela   smallint not null default 0 check (codigos_na_janela >= 0),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  -- Número confirmado sempre com a autorização junto.
  check (numero is null or (confirmado_em is not null and consentimento_em is not null and consentimento_texto is not null))
);
create unique index if not exists participantes_whatsapp_numero_unico on public.participantes_whatsapp (numero) where numero is not null;
create index if not exists participantes_whatsapp_espaco_idx on public.participantes_whatsapp (workspace_id) where numero is not null and pausado_em is null;

-- RLS ligado e nenhuma policy: a Área do Voluntário fala com o banco pelo servidor.
alter table public.participantes_whatsapp enable row level security;
revoke all on public.participantes_whatsapp from anon, authenticated;

comment on table public.participantes_whatsapp is
  'Número de WhatsApp confirmado pelo voluntário e a autorização (LGPD) para receber as oportunidades por lá. Só o servidor lê e escreve.';

alter table public.oportunidades add column if not exists avisada_por_whatsapp_em timestamptz;
comment on column public.oportunidades.avisada_por_whatsapp_em is
  'Quando a oportunidade foi anunciada pelo WhatsApp aos voluntários que autorizaram (uma vez só, na primeira publicação).';
