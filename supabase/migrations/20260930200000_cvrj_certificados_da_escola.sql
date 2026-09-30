-- Certificados da Escola (cursos presenciais) na mesma tabela dos certificados do voluntariado.
-- Pedido do Matheus (30/09/2026): o certificado impresso pela secretaria da escola leva o código
-- XXXX-XXXX e o QR, é conferido na mesma página (/certificado/<código>) e entra na trilha de
-- auditoria como qualquer certificado (o gancho certificados_trilha_emissao já faz isso no insert).
--
-- Só acréscimos:
--  - participante_id deixa de ser obrigatório: o aluno da escola não é voluntário. Uma regra nova
--    exige o participante em todo certificado do voluntariado, então nada muda para eles;
--  - origem ('voluntariado' | 'escola'), matrícula e turma da escola (ids do sistema da escola);
--  - escola_emitir_certificado: só o servidor (service_role) chama, pela rota
--    /api/escola/certificados. Idempotente pela matrícula: pedir de novo devolve o mesmo código.

alter table public.certificados alter column participante_id drop not null;

alter table public.certificados add column if not exists origem text not null default 'voluntariado';
alter table public.certificados add column if not exists escola_matricula_id text;
alter table public.certificados add column if not exists escola_turma_id text;
comment on column public.certificados.origem is 'voluntariado (Área do Voluntário) ou escola (curso presencial, emitido pela secretaria da escola).';
comment on column public.certificados.escola_matricula_id is 'Id da matrícula no sistema da escola (um certificado por matrícula).';

do $$ begin
  alter table public.certificados add constraint certificados_origem_valida check (origem in ('voluntariado', 'escola'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.certificados add constraint certificados_participante_do_voluntariado
    check (origem = 'escola' or participante_id is not null);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.certificados add constraint certificados_matricula_da_escola
    check (origem <> 'escola' or (escola_matricula_id is not null and escola_matricula_id ~ '^[A-Za-z0-9_-]{1,64}$'));
exception when duplicate_object then null; end $$;

create unique index if not exists certificados_escola_matricula_unica
  on public.certificados (escola_matricula_id) where escola_matricula_id is not null;

-- Emite o certificado de uma matrícula da escola (ou devolve o que já existe). Devolve o código.
create or replace function public.escola_emitir_certificado(
  p_workspace_id uuid,
  p_matricula_id text,
  p_turma_id text,
  p_nome text,
  p_curso text,
  p_carga_horaria numeric,
  p_emitido_em timestamptz
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_nome text := left(trim(coalesce(p_nome, '')), 200);
  v_curso text := left(trim(coalesce(p_curso, '')), 200);
  v_codigo text;
begin
  if p_matricula_id is null or p_matricula_id !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'Matrícula inválida.' using errcode = 'P0001';
  end if;
  if length(v_nome) < 3 or length(v_curso) < 3 then
    raise exception 'Informe o nome do aluno e o curso.' using errcode = 'P0001';
  end if;
  if p_carga_horaria is not null and (p_carga_horaria <= 0 or p_carga_horaria > 9999) then
    raise exception 'Carga horária inválida.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    raise exception 'Espaço não encontrado.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('escola:certificado:' || p_matricula_id));
  select c.codigo into v_codigo from public.certificados c where c.escola_matricula_id = p_matricula_id;
  if v_codigo is not null then return v_codigo; end if;

  loop
    v_codigo := private.codigo_de_certificado();
    begin
      insert into public.certificados (workspace_id, participante_id, codigo, nome, curso_titulo, carga_horaria,
                                       emitido_em, origem, escola_matricula_id, escola_turma_id)
      values (p_workspace_id, null, v_codigo, v_nome, v_curso, p_carga_horaria,
              coalesce(p_emitido_em, now()), 'escola', p_matricula_id, left(nullif(trim(coalesce(p_turma_id, '')), ''), 64));
      return v_codigo;
    exception when unique_violation then
      -- Código repetido: sorteia outro. Matrícula já emitida (corrida): devolve a que ficou.
      select c.codigo into v_codigo from public.certificados c where c.escola_matricula_id = p_matricula_id;
      if v_codigo is not null then return v_codigo; end if;
    end;
  end loop;
end $$;

revoke all on function public.escola_emitir_certificado(uuid, text, text, text, text, numeric, timestamptz) from public, anon, authenticated;
grant execute on function public.escola_emitir_certificado(uuid, text, text, text, text, numeric, timestamptz) to service_role;
