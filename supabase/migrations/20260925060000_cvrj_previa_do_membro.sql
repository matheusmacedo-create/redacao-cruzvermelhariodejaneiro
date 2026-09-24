-- Modo de visualização da Área do Voluntário: quem gerencia o Voluntariado
-- pode ver a área como um voluntário específico (para dar suporte). Só leitura
-- — nada é gravado em nome dele —, mas cada visualização fica registrada na
-- auditoria do cadastro, como qualquer outra abertura de dados.

create or replace function public.auditar_previa_membro(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.participantes;
begin
  select * into v from public.participantes where id = p_id;
  if not found or v.anonimizado_em is not null or (select private.nivel_participantes(v.workspace_id)) < 2 then
    raise exception 'Cadastro não encontrado.' using errcode = 'P0001';
  end if;
  perform private.auditar_participante(v.workspace_id, v.id, 'ver_como_voluntario', '{}');
end $$;
revoke all on function public.auditar_previa_membro(uuid) from public, anon;
grant execute on function public.auditar_previa_membro(uuid) to authenticated;
