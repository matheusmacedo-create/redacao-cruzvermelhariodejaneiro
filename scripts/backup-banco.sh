#!/usr/bin/env bash
# Backup diário do banco da Redação (docs/backup.md).
#
# O plano gratuito do Supabase não guarda backup: o hash encadeado da trilha pública
# detecta adulteração, mas só uma cópia fora do provedor recupera dado perdido. Este
# script gera o dump do Postgres e os segredos do Vault (sem eles, CPF, saúde e salários
# cifrados no banco não voltam), cifra tudo com age para a chave pública da diretoria e
# envia por FTPS a uma pasta FORA do site na Hostinger, mantendo os mais recentes.
#
# Variáveis (segredos do GitHub no workflow .github/workflows/backup-banco.yml):
#   SUPABASE_DB_URL          conexão do pooler em modo sessão (Supabase → Connect → Session pooler)
#   BACKUP_AGE_DESTINATARIO  chave pública age (age1…) da diretoria; a privada nunca entra em sistema nenhum
#   BACKUP_FTP_HOST, BACKUP_FTP_USUARIO, BACKUP_FTP_SENHA
#   BACKUP_FTP_PASTA         pasta fora do public_html, ex.: backups/redacao
# Opcionais: BACKUP_MANTER (30), BACKUP_FTP_VERIFICAR_CERTIFICADO (yes), PG_DUMP e PSQL (caminhos).
set -euo pipefail

for v in SUPABASE_DB_URL BACKUP_AGE_DESTINATARIO BACKUP_FTP_HOST BACKUP_FTP_USUARIO BACKUP_FTP_SENHA BACKUP_FTP_PASTA; do
  if [ -z "${!v:-}" ]; then echo "Falta a variável $v." >&2; exit 1; fi
done
case "$BACKUP_AGE_DESTINATARIO" in age1*) ;; *) echo "BACKUP_AGE_DESTINATARIO precisa ser uma chave pública age (age1…)." >&2; exit 1 ;; esac
case "$BACKUP_FTP_PASTA" in *public_html*|/|"") echo "BACKUP_FTP_PASTA não pode ficar dentro do site." >&2; exit 1 ;; esac

PG_DUMP=${PG_DUMP:-pg_dump}
PSQL=${PSQL:-psql}
MANTER=${BACKUP_MANTER:-30}
dia=$(TZ=America/Sao_Paulo date +%Y-%m-%d)
nome="redacao-${dia}.tar.age"
umask 077
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Gerando o dump…"
# Sessões, tokens e registros de login ficam de fora: não servem para restaurar e são sensíveis.
"$PG_DUMP" "$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges \
  --schema=public --schema=private --schema=auditoria --schema=auth --schema=storage \
  --exclude-table-data='auth.sessions' --exclude-table-data='auth.refresh_tokens' \
  --exclude-table-data='auth.audit_log_entries' --exclude-table-data='auth.flow_state' \
  --exclude-table-data='auth.one_time_tokens' --exclude-table-data='auth.mfa_challenges' \
  --file="$tmp/banco.dump"
"$PSQL" "$SUPABASE_DB_URL" -X -A -t -q -v ON_ERROR_STOP=1 \
  -c "select coalesce(json_agg(json_build_object('nome', name, 'descricao', description, 'segredo', decrypted_secret) order by name), '[]') from vault.decrypted_secrets" \
  > "$tmp/segredos-do-vault.json"
"$PSQL" "$SUPABASE_DB_URL" -X -A -t -q -v ON_ERROR_STOP=1 \
  -c "select json_build_object('gerado_em', now(), 'versao', current_setting('server_version'), 'itens_da_trilha', (select count(*) from auditoria.itens), 'eventos_da_trilha', (select count(*) from auditoria.eventos), 'ultimo_lote', (select max(dia) from auditoria.lotes))" \
  > "$tmp/resumo.json"
( cd "$tmp" && sha256sum banco.dump segredos-do-vault.json resumo.json > SHA256SUMS )

echo "Cifrando…"
tar -C "$tmp" -cf - banco.dump segredos-do-vault.json resumo.json SHA256SUMS | age -r "$BACKUP_AGE_DESTINATARIO" -o "$tmp/$nome"
tamanho=$(stat -c %s "$tmp/$nome")
if [ "$tamanho" -lt 1024 ]; then echo "O arquivo cifrado ficou pequeno demais ($tamanho bytes)." >&2; exit 1; fi

echo "Enviando $nome ($tamanho bytes)…"
export LFTP_PASSWORD="$BACKUP_FTP_SENHA"
lftp_cmd() {
  lftp --env-password -u "$BACKUP_FTP_USUARIO" "ftp://$BACKUP_FTP_HOST" -e "
    set cmd:fail-exit true
    set ftp:ssl-force true
    set ftp:ssl-protect-data true
    set ssl:verify-certificate ${BACKUP_FTP_VERIFICAR_CERTIFICADO:-yes}
    set net:max-retries 2
    set net:timeout 30
    $1
    bye"
}
# Sobe com nome provisório e renomeia: um envio interrompido nunca parece backup inteiro.
lftp_cmd "mkdir -p -f $BACKUP_FTP_PASTA; cd $BACKUP_FTP_PASTA; put $tmp/$nome -o $nome.parcial; mv $nome.parcial $nome"

# Confere o tamanho no servidor e apaga os mais antigos além dos $MANTER mais recentes.
lista=$(lftp_cmd "cd $BACKUP_FTP_PASTA; cls -1 --size --block-size=1 redacao-*.tar.age")
remoto=$(printf '%s\n' "$lista" | awk -v n="$nome" '$NF == n { print $1 }')
if [ "$remoto" != "$tamanho" ]; then echo "No servidor, $nome tem '$remoto' bytes; o local tem $tamanho." >&2; exit 1; fi
antigos=$(printf '%s\n' "$lista" | awk '{ print $NF }' | grep -E '^redacao-[0-9]{4}-[0-9]{2}-[0-9]{2}\.tar\.age$' | sort | head -n -"$MANTER" || true)
if [ -n "$antigos" ]; then
  lftp_cmd "cd $BACKUP_FTP_PASTA; $(printf 'rm %s; ' $antigos)"
  echo "Apagados: $(echo $antigos | wc -w) backup(s) antigo(s)."
fi
echo "Pronto: $BACKUP_FTP_PASTA/$nome"
