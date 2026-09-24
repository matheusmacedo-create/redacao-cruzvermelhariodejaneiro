#!/usr/bin/env bash
# Traz de volta os arquivos do Storage guardados no R2 pelo backup (docs/backup.md).
#
# Uso: scripts/restaurar-arquivos.sh storage.tsv pasta-de-destino
#   storage.tsv          o manifesto que vem dentro do backup do banco (depois de decifrado)
#   AGE_IDENTIDADE       arquivo com a chave privada age da diretoria
#   R2_ACCOUNT_ID (ou R2_ENDPOINT), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_BACKUP
#
# Baixa cada arquivo, decifra, confere o SHA-256 e grava em <destino>/<bucket>/<nome>. Só lê
# do R2: nada é apagado nem alterado lá. Para devolver ao Supabase, suba a pasta de cada
# bucket pelo painel (Storage → bucket → Upload) ou com a CLI do Supabase.
set -euo pipefail

[ $# -eq 2 ] || { echo "Uso: $0 storage.tsv pasta-de-destino" >&2; exit 1; }
manifesto=$1
destino=$2
R2_ENDPOINT=${R2_ENDPOINT:-${R2_ACCOUNT_ID:+https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com}}
R2_ENDPOINT=${R2_ENDPOINT%/}
for v in AGE_IDENTIDADE R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_BACKUP; do
  [ -n "${!v:-}" ] || { echo "Falta a variável $v." >&2; exit 1; }
done
[ -r "$manifesto" ] || { echo "Não consigo ler $manifesto." >&2; exit 1; }
[ -r "$AGE_IDENTIDADE" ] || { echo "Não consigo ler a chave em $AGE_IDENTIDADE." >&2; exit 1; }

umask 077
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
printf 'user = "%s:%s"\n' "$R2_ACCESS_KEY_ID" "$R2_SECRET_ACCESS_KEY" > "$tmp/r2.cfg"
codificar() { python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe="/"))' "$1"; }

total=0; restaurados=0; erros=0
while IFS=$'\t' read -r -u 3 bucket nome _tamanho sha chave _atualizado; do
  [ "$bucket" = bucket ] && continue # cabeçalho
  total=$((total + 1))
  case "/$bucket/$nome/" in
    */../*|*/./*|//*) echo "Nome recusado (caminho estranho): $bucket/$nome" >&2; erros=$((erros + 1)); continue ;;
  esac
  if ! curl -sS --fail --retry 3 --retry-all-errors --connect-timeout 20 --max-time 900 -K "$tmp/r2.cfg" --aws-sigv4 "aws:amz:auto:s3" \
         -o "$tmp/arquivo.age" "$R2_ENDPOINT/$R2_BUCKET_BACKUP/$(codificar "$chave")" < /dev/null; then
    echo "Não achei no R2: $chave" >&2; erros=$((erros + 1)); continue
  fi
  if ! age -d -i "$AGE_IDENTIDADE" -o "$tmp/arquivo" "$tmp/arquivo.age"; then
    echo "Não consegui decifrar $chave (a chave é a certa?)." >&2; erros=$((erros + 1)); continue
  fi
  if [ "$(sha256sum "$tmp/arquivo" | cut -d' ' -f1)" != "$sha" ]; then
    echo "SHA-256 diferente do manifesto: $bucket/$nome" >&2; erros=$((erros + 1)); continue
  fi
  mkdir -p "$destino/$bucket/$(dirname "$nome")"
  mv "$tmp/arquivo" "$destino/$bucket/$nome"
  restaurados=$((restaurados + 1))
done 3< "$manifesto"

echo "Restaurados $restaurados de $total arquivo(s) em $destino ($erros com erro)."
[ "$erros" -eq 0 ]
