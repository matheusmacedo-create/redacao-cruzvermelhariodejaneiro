-- Espelho da trilha pública no Cloudflare R2 (lib/auditoria/espelho.ts; docs/auditoria-publica.md §4,
-- docs/armazenamento-r2.md). Só acréscimos sobre 20260925203000_cvrj_auditoria.sql: a versão dos
-- arquivos de cada lote que já está no espelho, a fila do espelho e o painel mostrando a cópia.

alter table auditoria.lotes add column if not exists espelhado_em timestamptz;
comment on column auditoria.lotes.espelhado_em is
  'Versão dos arquivos do lote que já está no espelho do R2 (a última mudança copiada).';

-- Lotes cujos arquivos mudaram desde a última cópia. A versão é o instante da última mudança;
-- marcar com ela (e não com o relógio) faz uma mudança que chegue no meio da cópia voltar para a fila.
create or replace function public.auditoria_lotes_para_espelhar(p_limite integer default 8)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x.dia), '[]'::jsonb)
    from (
      select l.dia, greatest(l.fechado_em, l.assinado_em, l.tsr_em, l.ots_enviado_em, l.ots_confirmado_em) as versao,
             l.manifesto, l.assinatura, l.chave_id,
             replace(encode(l.ots, 'base64'), E'\n', '') as ots, l.ots_estado, l.bloco,
             replace(encode(l.tsr, 'base64'), E'\n', '') as tsr
        from auditoria.lotes l
       where l.espelhado_em is null
          or l.espelhado_em < greatest(l.fechado_em, l.assinado_em, l.tsr_em, l.ots_enviado_em, l.ots_confirmado_em)
       order by l.dia
       limit greatest(1, least(coalesce(p_limite, 8), 50))
    ) x
$$;

create or replace function public.auditoria_marcar_espelhado(p_dia date, p_versao timestamptz)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  update auditoria.lotes set espelhado_em = p_versao
   where dia = p_dia and p_versao is not null and (espelhado_em is null or espelhado_em < p_versao);
  return found;
end $$;

-- O painel da administração passa a mostrar a última cópia no espelho de cada lote.
create or replace function public.auditoria_painel(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select private.workspace_role(p_workspace_id)) is distinct from 'admin' then
    raise exception 'Só a administração vê a trilha.' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'verificacao', (select jsonb_build_object('executado_em', v.executado_em, 'ok', v.ok, 'eventos', v.eventos, 'fluxos', v.fluxos,
                                              'lotes', v.lotes, 'lotes_ok', v.lotes_ok, 'primeiro_lote_com_falha', v.primeiro_lote_com_falha,
                                              'duracao_ms', v.duracao_ms)
                      from auditoria.verificacoes v order by v.id desc limit 1),
    'lotes', (select coalesce(jsonb_agg(x order by x.dia desc), '[]'::jsonb) from (
                select l.dia, l.fechado_em, l.itens, l.compromisso, l.assinatura is not null as assinado, l.chave_id,
                       l.ots_estado, l.bloco, l.tsr is not null as tsa, l.publicado_em, l.espelhado_em, l.tentativas, l.ultimo_erro
                  from auditoria.lotes l order by l.dia desc limit 30) x),
    'falhas', (select coalesce(jsonb_agg(x order by x.id desc), '[]'::jsonb) from (
                 select f.id, f.ocorrido_em, f.origem, f.referencia_id, f.erro
                   from auditoria.falhas f where f.ocorrido_em > clock_timestamp() - interval '30 days'
                  order by f.id desc limit 30) x),
    'totais', (select coalesce(jsonb_object_agg(t.tipo, t.n), '{}'::jsonb) from (
                 select i.tipo, count(*) as n from auditoria.itens i where i.workspace_id = p_workspace_id group by i.tipo) t),
    'pendentes_de_lote', (select count(*) from auditoria.itens i
                           where i.workspace_id = p_workspace_id
                             and not exists (select 1 from auditoria.lote_itens li where li.item_id = i.id)),
    'recentes', (select coalesce(jsonb_agg(x order by x.registrado_em desc), '[]'::jsonb) from (
                   select i.codigo, i.tipo, i.classe, i.versao, i.titulo_publico, i.url_publica, i.referencia_id, i.registrado_em,
                          coalesce((select s.estado from auditoria.estado_item(i.id) s), 'vigente') as estado,
                          (select li.dia from auditoria.lote_itens li where li.item_id = i.id) as lote
                     from auditoria.itens i where i.workspace_id = p_workspace_id
                    order by i.registrado_em desc limit 40) x)
  );
end $$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.auditoria_lotes_para_espelhar(integer)',
    'public.auditoria_marcar_espelhado(date, timestamptz)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
