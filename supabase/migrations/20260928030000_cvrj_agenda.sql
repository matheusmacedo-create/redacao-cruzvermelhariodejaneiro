-- Agenda do Palácio Virtual (docs/calendario-inteligente.md). Só acréscimos.
--
-- A agenda junta, como camadas, datas que já existem no sistema (pautas, pacotes, voluntariado,
-- escola, doações, financeiro, frota, chamados, parcerias, aniversários) — sem copiá-las. O que é
-- novo mora aqui:
--  - datas_comemorativas: a lista curada (Cruz Vermelha, ONU, calendário da saúde), editável pela
--    comunicação, com a antecedência para começar a produzir;
--  - agenda_preferencias: por pessoa, as camadas desligadas (como os calendários do Google), o
--    resumo semanal por e-mail (só para quem ativar) e o link secreto de assinatura (ICS).
-- Feriados não têm tabela: são calculados em lib/agenda/datas.ts (Páscoa e móveis inclusos).

create table if not exists public.datas_comemorativas (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  nome             text not null check (length(trim(nome)) between 3 and 140),
  descricao        text check (descricao is null or length(descricao) <= 600),
  categoria        text not null default 'institucional'
                     check (categoria in ('cruz_vermelha', 'humanitaria', 'saude', 'voluntariado', 'institucional')),
  -- Regra: dia fixo (mes + dia), n-ésimo dia da semana do mês (mes + semana + dia_da_semana; semana -1 = último)
  -- ou o mês inteiro (mes; campanhas como Setembro Amarelo).
  regra            text not null check (regra in ('fixa', 'nesimo_dia_semana', 'mes')),
  mes              smallint not null check (mes between 1 and 12),
  dia              smallint check (dia is null or dia between 1 and 31),
  semana           smallint check (semana is null or semana in (-1, 1, 2, 3, 4, 5)),
  dia_da_semana    smallint check (dia_da_semana is null or dia_da_semana between 0 and 6),
  antecedencia_dias smallint not null default 21 check (antecedencia_dias between 0 and 120),
  ativa            boolean not null default true,
  criado_por       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (
    (regra = 'fixa' and dia is not null) or
    (regra = 'nesimo_dia_semana' and semana is not null and dia_da_semana is not null) or
    (regra = 'mes')
  )
);
comment on table public.datas_comemorativas is 'Datas que viram pauta na agenda (docs/calendario-inteligente.md §3.3).';
create index if not exists datas_comemorativas_ws_idx on public.datas_comemorativas (workspace_id, mes) where ativa;
create unique index if not exists datas_comemorativas_nome_idx on public.datas_comemorativas (workspace_id, lower(nome));

create table if not exists public.agenda_preferencias (
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  camadas_ocultas  text[] not null default '{}',
  resumo_semanal   boolean not null default false,
  ics_token_hash   text unique check (ics_token_hash is null or length(ics_token_hash) = 64),
  ics_camadas      text[] not null default '{}',
  ics_criado_em    timestamptz,
  updated_at       timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
comment on table public.agenda_preferencias is 'Camadas desligadas, resumo semanal e link de assinatura (ICS) de cada pessoa.';

alter table public.datas_comemorativas enable row level security;
alter table public.agenda_preferencias enable row level security;

revoke all on public.datas_comemorativas, public.agenda_preferencias from anon;
revoke insert, update, delete, truncate on public.datas_comemorativas, public.agenda_preferencias from authenticated;
grant select on public.datas_comemorativas, public.agenda_preferencias to authenticated;

-- As datas comemorativas são do espaço: todo membro lê (a escrita passa pela ação, com permissão).
drop policy if exists datas_comemorativas_select on public.datas_comemorativas;
create policy datas_comemorativas_select on public.datas_comemorativas
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));

-- Preferências: cada pessoa só a própria linha.
drop policy if exists agenda_preferencias_select on public.agenda_preferencias;
create policy agenda_preferencias_select on public.agenda_preferencias
  for select to authenticated using (user_id = (select auth.uid()));

-- Índices para as camadas lerem só a janela visível.
create index if not exists pautas_prazo_idx on public.pautas (workspace_id, due_date) where due_date is not null;
create index if not exists package_destinations_agenda_idx on public.package_destinations (workspace_id, agendar_para) where agendar_para is not null;
create index if not exists oportunidades_inicio_idx on public.oportunidades (workspace_id, inicio);
create index if not exists fin_lancamentos_vencimento_agenda_idx on public.fin_lancamentos (workspace_id, vencimento) where pago_em is null;
create index if not exists frota_documentos_vencimento_idx on public.frota_documentos (workspace_id, vencimento) where vencimento is not null;

-- A lista inicial: datas gerais, sem nenhuma data própria da filial (essas a comunicação acrescenta).
insert into public.datas_comemorativas (workspace_id, nome, descricao, categoria, regra, mes, dia, semana, dia_da_semana, antecedencia_dias)
select w.id, d.nome, d.descricao, d.categoria, d.regra, d.mes, d.dia, d.semana, d.dia_da_semana, d.antecedencia
  from public.workspaces w
 cross join (values
  ('Dia Mundial da Cruz Vermelha e do Crescente Vermelho', 'Aniversário de Henry Dunant, fundador do Movimento.', 'cruz_vermelha', 'fixa', 5, 8, null::smallint, null::smallint, 30),
  ('Dia Mundial dos Primeiros Socorros', 'Segundo sábado de setembro (Federação Internacional da Cruz Vermelha).', 'cruz_vermelha', 'nesimo_dia_semana', 9, null, 2, 6, 30),
  ('Aniversário da Cruz Vermelha Brasileira', 'Fundada em 5 de dezembro de 1908.', 'cruz_vermelha', 'fixa', 12, 5, null, null, 30),
  ('Dia Internacional do Voluntário', 'ONU, 5 de dezembro.', 'voluntariado', 'fixa', 12, 5, null, null, 21),
  ('Dia Nacional do Voluntariado', '28 de agosto.', 'voluntariado', 'fixa', 8, 28, null, null, 21),
  ('Dia Mundial Humanitário', 'ONU, 19 de agosto.', 'humanitaria', 'fixa', 8, 19, null, null, 21),
  ('Dia Mundial do Doador de Sangue', 'OMS, 14 de junho.', 'saude', 'fixa', 6, 14, null, null, 21),
  ('Dia Mundial da Saúde', 'OMS, 7 de abril.', 'saude', 'fixa', 4, 7, null, null, 21),
  ('Janeiro Branco', 'Saúde mental.', 'saude', 'mes', 1, null, null, null, 21),
  ('Maio Amarelo', 'Segurança no trânsito.', 'saude', 'mes', 5, null, null, null, 21),
  ('Junho Vermelho', 'Doação de sangue.', 'saude', 'mes', 6, null, null, null, 21),
  ('Setembro Amarelo', 'Prevenção do suicídio.', 'saude', 'mes', 9, null, null, null, 21),
  ('Outubro Rosa', 'Prevenção do câncer de mama.', 'saude', 'mes', 10, null, null, null, 21),
  ('Novembro Azul', 'Saúde do homem e prevenção do câncer de próstata.', 'saude', 'mes', 11, null, null, null, 21),
  ('Dezembro Vermelho', 'Prevenção do HIV/Aids.', 'saude', 'mes', 12, null, null, null, 21)
 ) as d(nome, descricao, categoria, regra, mes, dia, semana, dia_da_semana, antecedencia)
 where w.kind = 'production'
on conflict do nothing;
