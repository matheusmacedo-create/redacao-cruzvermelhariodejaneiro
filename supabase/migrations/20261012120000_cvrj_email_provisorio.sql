-- E-mail provisório e etiqueta por caixa (12/10/2026). Só acrescenta.
--
-- 1. caixas_de_email ganha a etiqueta do Gmail que também leva à caixa: um
--    filtro do Gmail etiqueta (ex.: "Voluntariado") e a caixa do setor mostra,
--    além do que vai para o endereço dela, as conversas com a etiqueta. Os
--    setores são apelidos de uma conta só (contato@), então encaminhar de um
--    para o outro não funciona: a etiqueta é o "encaminhamento".
--    O id confere cada mensagem; o nome entra na busca do Gmail (label:nome).
--
-- 2. email_acessos: quem entra no app de e-mail provisório
--    (email.cruzvermelhariodejaneiro.org, rota /email) e em quais caixas. É o
--    caminho para a equipe usar o e-mail do setor antes de o Palácio abrir
--    para todos: conta só com usuário e senha (perfil, sem vínculo com o
--    espaço, então o Palácio continua fechado para ela). O responsável de cada
--    caixa dá e tira acesso e gera senha provisória; a escolha do responsável
--    é de um administrador. Escrita só pelo servidor (service role), depois
--    das conferências em app/actions/email-provisorio.ts.

alter table public.caixas_de_email add column if not exists rotulo_gmail_id text;
alter table public.caixas_de_email add column if not exists rotulo_gmail_nome text;
comment on column public.caixas_de_email.rotulo_gmail_id is
  'Etiqueta do Gmail que também leva à caixa (o id, que confere cada mensagem). Nulo: só o endereço.';
comment on column public.caixas_de_email.rotulo_gmail_nome is
  'O nome da mesma etiqueta, que entra na busca do Gmail (label:nome-com-hifens).';

create table if not exists public.email_acessos (
  caixa_id      uuid not null references public.caixas_de_email (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  responsavel   boolean not null default false,
  criado_por    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (caixa_id, user_id)
);
create index if not exists email_acessos_user_idx on public.email_acessos (user_id);
create index if not exists email_acessos_workspace_idx on public.email_acessos (workspace_id);
comment on table public.email_acessos is
  'Quem entra no app de e-mail provisório (/email) e em quais caixas. responsavel: dá e tira acesso à caixa e gera senha provisória.';

alter table public.email_acessos enable row level security;
alter table public.email_acessos force row level security;
revoke all on table public.email_acessos from anon;

-- Leitura: a própria pessoa vê os acessos dela; administrador do espaço vê todos.
drop policy if exists email_acessos_select on public.email_acessos;
create policy email_acessos_select on public.email_acessos
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.workspace_role(workspace_id)) = 'admin');
