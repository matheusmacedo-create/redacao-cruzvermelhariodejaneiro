-- Escola: quais contas da Únicopag mandam as vendas pagas à Meta (04/10/2026).
-- Só acrescenta: uma coluna em escola_conversoes e a nova versão de
-- escola_conversoes_salvar, que agora recebe e confere a lista.
--
-- O espaço tem duas contas da Únicopag: a das vendas da plataforma da escola
-- (o pixel não vê o pagamento, então o servidor avisa a Meta) e a do checkout
-- do site (matrícula), que o site já manda à Meta pelo pixel e pela própria
-- API de Conversões, e só com o consentimento de marketing da pessoa. Mandar
-- de novo daqui contaria a compra duas vezes e mandaria dados de quem disse
-- "não". Por isso a escolha é explícita e a falha é fechada: nenhuma conta
-- manda sem ter sido marcada (lib/escola/conversoes-servidor.ts).

alter table public.escola_conversoes add column if not exists contas uuid[] not null default '{}';
comment on column public.escola_conversoes.contas is
  'As contas da Únicopag cujas vendas pagas vão à Meta; nenhuma por padrão — a conta do checkout do site fica de fora porque o site já manda, com o consentimento.';
-- O CPF deixou de ir à Meta (os Termos das Ferramentas de Negócios proíbem número de documento): a qualidade agora é só e-mail, telefone e nome.
comment on column public.escola_conversoes_envios.qualidade is
  'A chance de a Meta casar a pessoa: boa (e-mail ou telefone), fraca (só nome) ou nenhuma. O CPF não vai à Meta.';

/**
 * Um admin liga (ou muda) o pixel. O token vai ao cofre pelo caminho de sempre (definir_chave_de_integracao).
 * p.contas: os ids das contas da Únicopag do espaço que mandam as vendas (ausente = nenhuma). Ligado, ao menos uma.
 */
create or replace function public.escola_conversoes_salvar(p_workspace_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_pixel text := trim(coalesce(p->>'pixel_id', ''));
  v_pagina text := nullif(trim(coalesce(p->>'pagina_padrao', '')), '');
  v_ativa boolean := coalesce((p->>'ativa')::boolean, true);
  v_lista jsonb := coalesce(p->'contas', '[]'::jsonb);
  v_contas uuid[] := '{}';
  v_item jsonb;
  v_id uuid;
begin
  if (select private.workspace_role(p_workspace_id)) is distinct from 'admin' then raise exception 'Só um admin liga o pixel da Meta.' using errcode = 'P0001'; end if;
  if v_pixel !~ '^[0-9]{5,30}$' then raise exception 'O ID do pixel (conjunto de dados) é um número. Ele aparece no Gerenciador de Eventos, abaixo do nome.' using errcode = 'P0001'; end if;
  if v_pagina is not null and v_pagina !~ '^https://[^\s]+$' then raise exception 'A página padrão precisa começar com https://.' using errcode = 'P0001'; end if;
  if jsonb_typeof(v_lista) = 'null' then v_lista := '[]'::jsonb; end if;
  if jsonb_typeof(v_lista) <> 'array' then raise exception 'A lista de contas da Únicopag veio num formato inválido.' using errcode = 'P0001'; end if;
  for v_item in select value from jsonb_array_elements(v_lista) loop
    if jsonb_typeof(v_item) <> 'string' or (v_item #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Conta da Únicopag inválida.' using errcode = 'P0001';
    end if;
    v_id := (v_item #>> '{}')::uuid;
    if not exists (select 1 from public.escola_contas where id = v_id and workspace_id = p_workspace_id) then
      raise exception 'Conta da Únicopag não encontrada neste espaço.' using errcode = 'P0001';
    end if;
    if not (v_id = any (v_contas)) then v_contas := v_contas || v_id; end if;
  end loop;
  if v_ativa and cardinality(v_contas) = 0 then raise exception 'Marque ao menos uma conta da Únicopag para enviar à Meta.' using errcode = 'P0001'; end if;
  insert into public.escola_conversoes (workspace_id, pixel_id, pagina_padrao, ativa, contas, criado_por)
  values (p_workspace_id, v_pixel, v_pagina, v_ativa, v_contas, (select auth.uid()))
  on conflict (workspace_id) do update set
    pixel_id = excluded.pixel_id, pagina_padrao = excluded.pagina_padrao, ativa = excluded.ativa, contas = excluded.contas, erro = null, updated_at = now();
end $$;
revoke all on function public.escola_conversoes_salvar(uuid, jsonb) from public, anon;
grant execute on function public.escola_conversoes_salvar(uuid, jsonb) to authenticated;
