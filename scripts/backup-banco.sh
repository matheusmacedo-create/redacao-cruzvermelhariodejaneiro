#!/usr/bin/env bash
# Backup diário da Redação (docs/backup.md).
#
# O plano gratuito do Supabase não guarda backup: o hash encadeado da trilha pública
# detecta adulteração, mas só uma cópia fora do provedor recupera dado perdido. Este script:
#   1. gera o dump do Postgres e os segredos do Vault (sem eles, CPF, saúde e salários
#      cifrados no banco não voltam);
#   2. copia para o R2 os arquivos do Storage que ainda não estão lá — cada versão uma vez,
#      cifrada — e anota no manifesto storage.tsv onde cada um estava;
#   3. cifra tudo com age para a chave pública da diretoria e envia ao Cloudflare R2 (bucket
#      com trava: nada se apaga nem se troca por 30 dias) e, se configurado, também por FTPS
#      a uma pasta fora do site na Hostinger.
#
# Variáveis (segredos do GitHub no workflow .github/workflows/backup-banco.yml):
#   SUPABASE_DB_URL          conexão do pooler em modo sessão (Supabase → Connect → Session pooler)
#   BACKUP_AGE_DESTINATARIO  chave pública age (age1…) da diretoria; a privada nunca entra em sistema nenhum
#   R2_ACCOUNT_ID (ou R2_ENDPOINT), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_BACKUP
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   para copiar os arquivos do Storage (sem elas, só o banco)
#   BACKUP_FTP_HOST, BACKUP_FTP_USUARIO, BACKUP_FTP_SENHA, BACKUP_FTP_PASTA   destino extra, opcional
# Opcionais: BACKUP_MANTER (30, só no FTP; no R2 quem apaga é a regra do bucket),
#            BACKUP_FTP_VERIFICAR_CERTIFICADO (yes), PG_DUMP e PSQL (caminhos).
set -euo pipefail

tem() { local v; for v in "$@"; do [ -n "${!v:-}" ] || return 1; done; }
for v in SUPABASE_DB_URL BACKUP_AGE_DESTINATARIO; do
  tem "$v" || { echo "Falta a variável $v." >&2; exit 1; }
done
case "$BACKUP_AGE_DESTINATARIO" in age1*) ;; *) echo "BACKUP_AGE_DESTINATARIO precisa ser uma chave pública age (age1…)." >&2; exit 1 ;; esac

R2_ENDPOINT=${R2_ENDPOINT:-${R2_ACCOUNT_ID:+https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com}}
R2_ENDPOINT=${R2_ENDPOINT%/}
usar_r2=0; tem R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_BACKUP && usar_r2=1
usar_ftp=0; tem BACKUP_FTP_HOST BACKUP_FTP_USUARIO BACKUP_FTP_SENHA BACKUP_FTP_PASTA && usar_ftp=1
if [ $usar_r2 = 0 ] && [ $usar_ftp = 0 ]; then
  echo "Nenhum destino: configure o R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_BACKUP) ou o FTP (BACKUP_FTP_*)." >&2
  exit 1
fi
if [ $usar_ftp = 1 ]; then
  case "$BACKUP_FTP_PASTA" in *public_html*|/|"") echo "BACKUP_FTP_PASTA não pode ficar dentro do site." >&2; exit 1 ;; esac
fi
usar_storage=0; [ $usar_r2 = 1 ] && tem SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY && usar_storage=1

PG_DUMP=${PG_DUMP:-pg_dump}
PSQL=${PSQL:-psql}
MANTER=${BACKUP_MANTER:-30}
# Data e hora no nome: rodar de novo no mesmo dia cria outro arquivo (o R2 não deixa trocar o de antes).
agora=$(TZ=America/Sao_Paulo date +%Y-%m-%dT%H%M%S)
nome="redacao-${agora}.tar.age"
umask 077
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
sql() { "$PSQL" "$SUPABASE_DB_URL" -X -A -t -q -v ON_ERROR_STOP=1 "$@"; }

# As chaves vão em arquivos de configuração do curl, não na linha de comando (que aparece no ps).
codificar() { python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=sys.argv[2]))' "$1" "${2-/}"; }
if [ $usar_r2 = 1 ]; then
  printf 'user = "%s:%s"\n' "$R2_ACCESS_KEY_ID" "$R2_SECRET_ACCESS_KEY" > "$tmp/r2.cfg"
fi
r2() { curl -sS --retry 3 --retry-all-errors --connect-timeout 20 --max-time 900 -K "$tmp/r2.cfg" --aws-sigv4 "aws:amz:auto:s3" "$@" < /dev/null; }
r2_url() { printf '%s/%s/%s' "$R2_ENDPOINT" "$R2_BUCKET_BACKUP" "$(codificar "$1")"; }
# Envia com o SHA-256 do arquivo no pedido: o R2 recusa se chegar outra coisa.
r2_enviar() {
  local sha codigo
  sha=$(sha256sum "$1" | cut -d' ' -f1)
  codigo=$(r2 -o "$tmp/r2-resposta.xml" -w '%{http_code}' -H "x-amz-content-sha256: $sha" -H "content-type: $3" --upload-file "$1" "$(r2_url "$2")")
  if [ "$codigo" != 200 ]; then
    echo "O R2 recusou $2 (HTTP $codigo $(grep -o '<Code>[^<]*' "$tmp/r2-resposta.xml" 2>/dev/null | head -1 | cut -c7-))." >&2
    return 1
  fi
}
r2_tamanho() { r2 -o /dev/null -I -w '%{http_code} %header{content-length}' "$(r2_url "$1")"; }
# Todas as chaves sob um prefixo, uma por linha, no arquivo dado.
r2_listar() {
  local token="" pagina="$tmp/r2-lista.xml"
  : > "$2"
  while :; do
    r2 -o "$pagina" "$R2_ENDPOINT/$R2_BUCKET_BACKUP?list-type=2&max-keys=${R2_LISTA_POR_PAGINA:-1000}&prefix=$(codificar "$1" '')${token:+&continuation-token=$(codificar "$token" '')}"
    if ! grep -q '<ListBucketResult' "$pagina"; then
      echo "A listagem do R2 falhou ($(grep -o '<Code>[^<]*' "$pagina" | head -1 | cut -c7-))." >&2
      return 1
    fi
    token=$(python3 - "$pagina" "$2" <<'PY'
import html, re, sys
x = open(sys.argv[1], encoding='utf-8').read()
with open(sys.argv[2], 'a', encoding='utf-8') as saida:
    for k in re.findall(r'<Key>(.*?)</Key>', x, re.S):
        saida.write(html.unescape(k) + '\n')
m = re.search(r'<NextContinuationToken>(.*?)</NextContinuationToken>', x, re.S)
if re.search(r'<IsTruncated>true</IsTruncated>', x) and m:
    print(html.unescape(m.group(1)))
PY
)
    [ -n "$token" ] || break
  done
}

echo "Gerando o dump…"
# Sessões, tokens e registros de login ficam de fora: não servem para restaurar e são sensíveis.
"$PG_DUMP" "$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges \
  --schema=public --schema=private --schema=auditoria --schema=auth --schema=storage \
  --exclude-table-data='auth.sessions' --exclude-table-data='auth.refresh_tokens' \
  --exclude-table-data='auth.audit_log_entries' --exclude-table-data='auth.flow_state' \
  --exclude-table-data='auth.one_time_tokens' --exclude-table-data='auth.mfa_challenges' \
  --file="$tmp/banco.dump"
sql -c "select coalesce(json_agg(json_build_object('nome', name, 'descricao', description, 'segredo', decrypted_secret) order by name), '[]') from vault.decrypted_secrets" \
  > "$tmp/segredos-do-vault.json"

arquivos=0; novos=0; erros=0
printf 'bucket\tnome\ttamanho\tsha256\tchave_no_r2\tatualizado_em\n' > "$tmp/storage.tsv"
if [ $usar_storage = 1 ]; then
  echo "Copiando os arquivos do Storage…"
  printf 'header = "apikey: %s"\nheader = "Authorization: Bearer %s"\n' "$SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_SERVICE_ROLE_KEY" > "$tmp/storage.cfg"
  estranhos=$(sql -c "select count(*) from storage.objects where name ~ '[[:cntrl:]]'")
  if [ "$estranhos" != 0 ]; then
    echo "$estranhos arquivo(s) do Storage com caractere de controle no nome ficaram de fora." >&2
    erros=$((erros + estranhos))
  fi
  # Uma linha por arquivo: bucket, nome, tamanho, versão (o ETag do Storage, ou a data) e data.
  sql -F $'\t' -c "
    select o.bucket_id, o.name, coalesce(nullif(o.metadata ->> 'size', ''), '0'),
           coalesce(nullif(regexp_replace(coalesce(o.metadata ->> 'eTag', ''), '[^0-9A-Za-z-]', '', 'g'), ''),
                    'u' || extract(epoch from coalesce(o.updated_at, o.created_at, now()))::bigint),
           to_char(coalesce(o.updated_at, o.created_at, now()) at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')
      from storage.objects o
     where o.name is not null and o.name !~ '(^|/)\\.emptyFolderPlaceholder$' and o.name !~ '[[:cntrl:]]'
     order by o.bucket_id, o.name" > "$tmp/objetos.tsv"
  r2_listar "storage/" "$tmp/no-r2.txt"
  while IFS=$'\t' read -r -u 3 bucket objeto tamanho versao atualizado; do
    arquivos=$((arquivos + 1))
    # Cada versão vai uma vez: a chave no R2 é storage/<bucket>/<nome>@<versão>~<SHA-256>.age.
    base="storage/$bucket/$objeto@$versao~"
    chave=$(B="$base" awk 'BEGIN { b = ENVIRON["B"] } index($0, b) == 1 && substr($0, length(b) + 1) ~ /^[0-9a-f]+\.age$/ && length($0) == length(b) + 68 { print; exit }' "$tmp/no-r2.txt")
    if [ -n "$chave" ]; then
      sha=${chave: -68:64}
    else
      if ! curl -sS --fail --retry 3 --retry-all-errors --connect-timeout 20 --max-time 900 -K "$tmp/storage.cfg" \
             -o "$tmp/arquivo" "${SUPABASE_URL%/}/storage/v1/object/authenticated/$(codificar "$bucket")/$(codificar "$objeto")" < /dev/null; then
        echo "Não consegui baixar $bucket/$objeto do Storage." >&2
        erros=$((erros + 1)); continue
      fi
      sha=$(sha256sum "$tmp/arquivo" | cut -d' ' -f1)
      tamanho=$(stat -c %s "$tmp/arquivo")
      chave="$base$sha.age"
      age -r "$BACKUP_AGE_DESTINATARIO" -o "$tmp/arquivo.age" "$tmp/arquivo"
      if ! r2_enviar "$tmp/arquivo.age" "$chave" application/octet-stream; then erros=$((erros + 1)); continue; fi
      printf '%s\n' "$chave" >> "$tmp/no-r2.txt"
      novos=$((novos + 1))
      rm -f "$tmp/arquivo" "$tmp/arquivo.age"
    fi
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$bucket" "$objeto" "$tamanho" "$sha" "$chave" "$atualizado" >> "$tmp/storage.tsv"
  done 3< "$tmp/objetos.tsv"
  echo "Storage: $arquivos arquivo(s), $novos enviado(s) agora, $erros com erro."
else
  echo "Sem R2 ou sem SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY: os arquivos do Storage ficam fora desta rodada."
fi

if [ $usar_storage = 1 ]; then storage_json="json_build_object('arquivos', $arquivos, 'enviados_agora', $novos, 'erros', $erros)"; else storage_json=null; fi
sql -c "select json_build_object('gerado_em', now(), 'versao', current_setting('server_version'), 'itens_da_trilha', (select count(*) from auditoria.itens), 'eventos_da_trilha', (select count(*) from auditoria.eventos), 'ultimo_lote', (select max(dia) from auditoria.lotes), 'arquivos_do_storage', $storage_json)" \
  > "$tmp/resumo.json"
( cd "$tmp" && sha256sum banco.dump segredos-do-vault.json storage.tsv resumo.json > SHA256SUMS )

echo "Cifrando…"
tar -C "$tmp" -cf - banco.dump segredos-do-vault.json storage.tsv resumo.json SHA256SUMS | age -r "$BACKUP_AGE_DESTINATARIO" -o "$tmp/$nome"
tamanho=$(stat -c %s "$tmp/$nome")
if [ "$tamanho" -lt 1024 ]; then echo "O arquivo cifrado ficou pequeno demais ($tamanho bytes)." >&2; exit 1; fi

if [ $usar_r2 = 1 ]; then
  echo "Enviando $nome ($tamanho bytes) ao R2…"
  r2_enviar "$tmp/$nome" "banco/$nome" application/octet-stream
  conferido=$(r2_tamanho "banco/$nome")
  if [ "$conferido" != "200 $tamanho" ]; then echo "No R2, banco/$nome respondeu '$conferido'; o local tem $tamanho bytes." >&2; exit 1; fi
  echo "Pronto no R2: $R2_BUCKET_BACKUP/banco/$nome"
fi

if [ $usar_ftp = 1 ]; then
  echo "Enviando $nome por FTPS…"
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
  antigos=$(printf '%s\n' "$lista" | awk '{ print $NF }' | grep -E '^redacao-[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{6})?\.tar\.age$' | sort | head -n -"$MANTER" || true)
  if [ -n "$antigos" ]; then
    lftp_cmd "cd $BACKUP_FTP_PASTA; $(printf 'rm %s; ' $antigos)"
    echo "Apagados no FTP: $(echo $antigos | wc -w) backup(s) antigo(s)."
  fi
  echo "Pronto no FTP: $BACKUP_FTP_PASTA/$nome"
fi

if [ "$erros" -gt 0 ]; then
  echo "O banco foi salvo, mas $erros arquivo(s) do Storage não foram copiados: a rodada termina com erro para alguém olhar." >&2
  exit 1
fi
