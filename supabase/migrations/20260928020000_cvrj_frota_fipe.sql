-- ============================================================
-- Frota: valor de referência da Tabela FIPE em cada veículo.
--
-- Só acrescenta colunas e uma função. A consulta à FIPE é feita pela tela
-- (lib/apis-publicas); aqui fica o resultado que a gestão decidiu guardar:
-- o código FIPE, a descrição que a tabela deu ao veículo, o valor, o mês de
-- referência e quando foi consultado. Serve de base para seguro, doação,
-- baixa patrimonial e prestação de contas.
-- ============================================================

alter table public.frota_veiculos
  add column if not exists fipe_codigo       text check (fipe_codigo is null or char_length(fipe_codigo) <= 20),
  add column if not exists fipe_descricao    text check (fipe_descricao is null or char_length(fipe_descricao) <= 250),
  add column if not exists fipe_valor        numeric(12,2) check (fipe_valor is null or fipe_valor >= 0),
  add column if not exists fipe_referencia   text check (fipe_referencia is null or char_length(fipe_referencia) <= 40),
  add column if not exists fipe_consultado_em timestamptz;

-- Grava (ou limpa, com p vazio) o valor FIPE de um veículo. Mesma regra de
-- quem edita o veículo: gestão do Patrimônio (nível 3).
create or replace function public.frota_registrar_fipe(p_workspace_id uuid, p_veiculo_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select private.nivel_patrimonio(p_workspace_id)) < 3 then
    raise exception 'Só a gestão do Patrimônio registra o valor FIPE.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.frota_veiculos where id = p_veiculo_id and workspace_id = p_workspace_id) then
    raise exception 'Veículo não encontrado.' using errcode = 'P0001';
  end if;
  update public.frota_veiculos set
    fipe_codigo = nullif(trim(p->>'codigo'), ''),
    fipe_descricao = nullif(trim(p->>'descricao'), ''),
    fipe_valor = nullif(p->>'valor', '')::numeric,
    fipe_referencia = nullif(trim(p->>'referencia'), ''),
    fipe_consultado_em = case when nullif(p->>'valor', '') is null then null else now() end,
    updated_at = now()
  where id = p_veiculo_id and workspace_id = p_workspace_id;
exception
  when check_violation then raise exception 'Algum dado da FIPE está fora do permitido.' using errcode = 'P0001';
  when invalid_text_representation then raise exception 'Valor FIPE inválido.' using errcode = 'P0001';
end $$;
revoke all on function public.frota_registrar_fipe(uuid, uuid, jsonb) from public, anon;
grant execute on function public.frota_registrar_fipe(uuid, uuid, jsonb) to authenticated;
