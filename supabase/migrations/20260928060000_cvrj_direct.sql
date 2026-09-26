-- Direct das redes: a situação de cada conversa e de cada comentário, compartilhada pela equipe.
-- Só acréscimos.
--
-- As mensagens em si NÃO moram aqui: vêm do conector (Upload-Post) a cada abertura da tela. Esta
-- tabela guarda só o que a rede não sabe — que alguém da equipe respondeu por aqui, ou decidiu que
-- não precisa responder ("resolvida") —, para duas pessoas não atenderem a mesma coisa e ninguém
-- achar que outro já atendeu.
--
-- `chave` é o id estável que lib/atendimento/normalizar.ts dá a cada item
-- ("dm:instagram:<conversa>", "comentario:<rede>:<id>"). Numa conversa, `em` conta: mensagem nova
-- do público depois dele reabre a conversa (lib/atendimento/situacao.ts).

create table if not exists public.direct_atendimentos (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  chave        text not null check (length(chave) between 3 and 300),
  situacao     text not null check (situacao in ('respondida', 'resolvida')),
  por          uuid references public.profiles (id) on delete set null,
  em           timestamptz not null default now(),
  primary key (workspace_id, chave)
);
comment on table public.direct_atendimentos is 'Direct das redes: quem respondeu ou resolveu cada conversa e comentário (a mensagem vem do conector).';

alter table public.direct_atendimentos enable row level security;

revoke all on public.direct_atendimentos from anon;
revoke insert, update, delete, truncate on public.direct_atendimentos from authenticated;
grant select on public.direct_atendimentos to authenticated;

-- Todo membro vê a situação (é a mesma fila para a equipe); a escrita passa por app/actions/atendimento.ts.
drop policy if exists direct_atendimentos_select on public.direct_atendimentos;
create policy direct_atendimentos_select on public.direct_atendimentos
  for select to authenticated using ((select private.is_workspace_member(workspace_id)));

create index if not exists direct_atendimentos_por_idx on public.direct_atendimentos (por);
