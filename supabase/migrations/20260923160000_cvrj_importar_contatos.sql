-- Importação em massa para o banco de contatos.
--
-- Os contatos chegam de vários lugares (planilhas, exportações de outras
-- ferramentas) e passam por aqui em lotes. Três regras:
--
--  1. NUNCA DUPLICA. O mesmo e-mail (sem diferenciar maiúscula) não entra duas
--     vezes no espaço — é o índice press_contacts_email_idx que decide, não a
--     aplicação.
--
--  2. REIMPORTAR SOMA A ETIQUETA. Quem já está no banco e aparece de novo numa
--     lista nova ganha a etiqueta dessa lista. É o que permite segmentar "veio
--     da lista X" mesmo para quem já existia. Nome, organização e cargo só são
--     preenchidos se estavam vazios: o que alguém corrigiu à mão não é
--     sobrescrito por uma planilha.
--
--  3. NÃO RESSUSCITA QUEM SAIU. A importação não mexe em descadastrado_em nem
--     no histórico de leitura. Quem pediu para sair continua fora, ainda que
--     venha em dez planilhas.
--
-- Executável só pela service_role: a server action confere o espaço antes.

create or replace function public.importar_contatos(
  p_workspace_id uuid,
  p_autor uuid,
  p_linhas jsonb,
  p_tags text[]
)
returns table (inseridos integer, atualizados integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with entrada as (
    select distinct on (lower(trim(l->>'email')))
      lower(trim(l->>'email'))                  as email,
      left(coalesce(trim(l->>'nome'), ''), 200)     as nome,
      left(coalesce(trim(l->>'veiculo'), ''), 200)  as veiculo,
      left(coalesce(trim(l->>'cargo'), ''), 200)    as cargo,
      left(coalesce(trim(l->>'telefone'), ''), 60)  as telefone,
      lower(split_part(trim(l->>'email'), '@', 2))  as dominio
    from jsonb_array_elements(p_linhas) as l
    where position('@' in coalesce(l->>'email', '')) > 1
  ),
  gravados as (
    insert into public.press_contacts as c
      (workspace_id, nome, veiculo, cargo, dominio, email, telefone, tags, fonte, created_by)
    select p_workspace_id, e.nome, e.veiculo, e.cargo, e.dominio, e.email, e.telefone,
           coalesce(p_tags, '{}'), 'importado', p_autor
      from entrada e
    on conflict (workspace_id, lower(email)) where email is not null
    do update set
      tags     = array(select distinct t from unnest(c.tags || excluded.tags) as t where t <> ''),
      nome     = case when c.nome = '' then excluded.nome else c.nome end,
      veiculo  = case when c.veiculo = '' then excluded.veiculo else c.veiculo end,
      cargo    = case when c.cargo = '' then excluded.cargo else c.cargo end,
      telefone = case when c.telefone = '' then excluded.telefone else c.telefone end
    returning (xmax = 0) as novo
  )
  select count(*) filter (where novo)::integer, count(*) filter (where not novo)::integer
    from gravados;
end;
$$;

comment on function public.importar_contatos is
  'Importa um lote de contatos: não duplica e-mail, soma etiquetas em quem já existe, não mexe em descadastro nem em histórico. Só service_role.';

revoke all on function public.importar_contatos(uuid, uuid, jsonb, text[]) from public;
revoke execute on function public.importar_contatos(uuid, uuid, jsonb, text[]) from anon;
revoke execute on function public.importar_contatos(uuid, uuid, jsonb, text[]) from authenticated;
grant execute on function public.importar_contatos(uuid, uuid, jsonb, text[]) to service_role;

-- A tela filtra por etiqueta (a lista de origem); com milhares de contatos,
-- o índice GIN evita varrer a tabela inteira.
create index if not exists press_contacts_tags_idx
  on public.press_contacts using gin (tags);
