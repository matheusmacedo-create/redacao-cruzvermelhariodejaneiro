-- Nome do remetente de cada caixa de setor, definido na Redação.
--
-- O nome que vinha do Gmail ("Enviar e-mail como") é, por padrão, o próprio
-- endereço ("comunicacao"). Os aliases de um domínio só podem ter o nome
-- trocado pela API com conta de serviço de domínio; então a Redação guarda o
-- seu, e ele vale em tudo que sai por ela. Vazio: usa o nome do Gmail.

alter table public.caixas_de_email
  add column if not exists nome_remetente text not null default ''
    check (char_length(nome_remetente) <= 80 and nome_remetente !~ '[<>"\r\n]');
