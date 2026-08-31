-- Newsletter: a lista de quem pediu para receber notícias.
--
-- Existe porque o site institucional já promete "Receba novidades da Cruz
-- Vermelha RJ" num formulário com action="#" — que recarrega a página, limpa
-- os campos e descarta o endereço. Quem se inscreveu acredita estar inscrito.
--
-- Três decisões que estão no formato da tabela, não no código:
--
--  1. CONFIRMAÇÃO EM DUAS ETAPAS. Um endereço só entra na lista depois de a
--     pessoa clicar no link que chega na caixa dela. Sem isso, qualquer um
--     inscreve o e-mail de terceiros, e um robô enche a lista de endereços
--     inventados — que viram devolução, que viram reputação ruim, que viram
--     a newsletter inteira na caixa de spam.
--
--  2. O CONSENTIMENTO É GRAVADO, não presumido. A LGPD pede que a instituição
--     consiga PROVAR o aceite (art. 8º, §2º). Guardar só o e-mail deixa a
--     Cruz Vermelha sem resposta se alguém reclamar. Ficam registrados o
--     texto exato que a pessoa aceitou, quando, de qual IP e de qual origem.
--
--  3. O TOKEN DE DESCADASTRO NÃO EXPIRA. O link "sair da lista" vai em todo
--     e-mail e precisa funcionar daqui a dois anos, com um clique e sem
--     login. Token de confirmação expira; o de saída, nunca.
--
-- Escrita só pela service role (a rota pública de inscrição). Não há política
-- para anon de propósito: uma política de insert para o público abriria a
-- porta para tentar ler a lista, e lista de e-mail vazada é incidente.

create table if not exists public.newsletter_inscritos (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,

  -- Guardado já normalizado (minúsculo, sem espaços) pela aplicação. O índice
  -- único abaixo usa lower() mesmo assim: defesa em profundidade contra um
  -- caminho de escrita futuro que esqueça de normalizar.
  email         text not null check (position('@' in email) > 1),
  nome          text not null default '',

  -- pendente: pediu, ainda não confirmou — NÃO recebe nada além do convite.
  -- confirmado: clicou no link; é o único estado que recebe newsletter.
  -- descadastrado: pediu para sair. A linha fica, para não reinscrever alguém
  --   que já disse não e para provar quando saiu.
  -- invalido: o provedor devolveu como inexistente. Insistir em endereço
  --   morto é o que derruba a reputação de quem envia.
  estado        text not null default 'pendente'
                check (estado in ('pendente','confirmado','descadastrado','invalido')),

  -- Some quando a confirmação acontece: token usado é token que não serve
  -- mais, e o que não é guardado não vaza.
  token_confirmacao          text,
  token_confirmacao_expira_em timestamptz,

  -- Permanente, e único no banco inteiro: é a chave do link de saída.
  token_descadastro text not null default encode(gen_random_bytes(24), 'hex'),

  confirmado_em    timestamptz,
  descadastrado_em timestamptz,

  -- De onde veio a inscrição, para saber o que funciona.
  origem        text not null default 'home'
                check (origem in ('home','materia','pagina','importado','manual')),

  -- O registro do consentimento (item 2 acima).
  consentimento_texto  text not null default '',
  consentimento_ip     inet,
  consentimento_agente text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.newsletter_inscritos is
  'Lista da newsletter, com confirmação em duas etapas e registro de consentimento (LGPD art. 8º, §2º). Escrita pela service role; nunca por anon.';
comment on column public.newsletter_inscritos.token_descadastro is
  'Permanente de propósito: o link de saída vai em todo e-mail e precisa funcionar sem login, para sempre.';
comment on column public.newsletter_inscritos.consentimento_texto is
  'O texto exato que a pessoa aceitou. Sem isto a instituição não consegue provar o consentimento se for questionada.';

-- Um endereço por espaço, sem depender de a aplicação lembrar de normalizar.
create unique index if not exists newsletter_inscritos_email_idx
  on public.newsletter_inscritos (workspace_id, lower(email));

-- O link de saída resolve por este token; único porque ele é a identidade.
create unique index if not exists newsletter_inscritos_descadastro_idx
  on public.newsletter_inscritos (token_descadastro);

-- Parcial: só as linhas que ainda esperam confirmação são procuradas por token.
create index if not exists newsletter_inscritos_confirmacao_idx
  on public.newsletter_inscritos (token_confirmacao)
  where token_confirmacao is not null;

-- A consulta do disparo é sempre "os confirmados deste espaço". Índice parcial
-- porque pendente, descadastrado e inválido nunca entram numa remessa — e a
-- tendência é eles serem a maioria das linhas com o tempo.
create index if not exists newsletter_inscritos_envio_idx
  on public.newsletter_inscritos (workspace_id, created_at desc)
  where estado = 'confirmado';

create or replace function public.touch_newsletter_inscritos()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists newsletter_inscritos_touch on public.newsletter_inscritos;
create trigger newsletter_inscritos_touch
  before update on public.newsletter_inscritos
  for each row execute function public.touch_newsletter_inscritos();

alter table public.newsletter_inscritos enable row level security;

-- Membros do espaço leem a lista (a tela de gestão). Escrita e remoção ficam
-- com a service role: a inscrição vem de fora, sem sessão, e apagar linha de
-- consentimento apagaria justamente a prova que a LGPD pede que se guarde.
create policy newsletter_inscritos_select_member on public.newsletter_inscritos
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
