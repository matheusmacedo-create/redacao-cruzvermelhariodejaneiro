-- pg_net: chamadas HTTP de dentro do banco.
--
-- Primeiro uso: cadastrar na Meta (pela Kapso) os modelos de WhatsApp de
-- Utilidade, com a chave lida do cofre (chave_de_integracao) DENTRO do banco —
-- quem roda o SQL nunca vê o valor, igual ao servidor. As respostas ficam em
-- net._http_response por algumas horas e não guardam a chave (só o corpo e o
-- status do que a Kapso devolveu).
--
-- Só acrescenta: nenhuma tabela, função ou política muda. A extensão fica no
-- schema próprio dela (net), sem permissão para anon nem authenticated.

create extension if not exists pg_net;
