-- ============================================================
-- Voz da instituição: ElevenLabs nas matérias e no WhatsApp (23/10/2026)
--
-- Só acrescenta (ARQUITETURA §10.1). O código funciona sem esta migração:
-- sem a tabela, a tela Configurações › Voz avisa que falta a migração, a
-- matéria sai sem o "Ouça esta matéria" e o assistente do WhatsApp responde
-- só por texto, como antes.
--
--  voz_config: uma linha por espaço. A voz escolhida na ElevenLabs (o id e o
--  nome, para a tela), o modelo e os dois interruptores, desligados por
--  padrão: `materias` (narrar a matéria ao publicar no site) e `whatsapp`
--  (o assistente responde também em áudio a quem mandou áudio). A chave da
--  ElevenLabs mora no cofre (integracoes_chaves, serviço elevenlabs), nunca
--  aqui. Leitura: só administradores. Escrita: só o servidor, depois de
--  conferir integracoes.configurar (app/actions/voz.ts).
-- ============================================================

create table if not exists public.voz_config (
  workspace_id   uuid primary key references public.workspaces (id) on delete cascade,
  voz_id         text check (voz_id is null or voz_id ~ '^[A-Za-z0-9]{8,40}$'),
  voz_nome       text check (voz_nome is null or char_length(voz_nome) between 1 and 120),
  modelo         text not null default 'eleven_v4' check (modelo ~ '^[a-z0-9_]{3,40}$'),
  materias       boolean not null default false,
  whatsapp       boolean not null default false,
  atualizado_por uuid references public.profiles (id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  -- Ligar qualquer um dos dois exige a voz escolhida.
  constraint voz_config_ligada_com_voz check ((not materias and not whatsapp) or voz_id is not null)
);
comment on table public.voz_config is
  'A voz da instituição na ElevenLabs (id, nome, modelo) e onde ela fala: narração das matérias do site e resposta em áudio do assistente do WhatsApp a quem mandou áudio. A chave fica no cofre (elevenlabs).';

alter table public.voz_config enable row level security;
alter table public.voz_config force row level security;
revoke all on table public.voz_config from anon;
revoke insert, update, delete, truncate, references, trigger on table public.voz_config from authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'voz_config' and policyname = 'voz_config_select_admin') then
    create policy voz_config_select_admin on public.voz_config
      for select to authenticated using ((select private.workspace_role(workspace_id)) = 'admin');
  end if;
end $$;
