#!/bin/bash
# Monta um banco local com todas as migrações da Redação, para rodar os testes pgTAP
# (supabase/tests/*.test.sql). Nunca aponte para produção: os testes desligam guardas da trilha.
#
# Precisa: PostgreSQL 16 ou 17 com pgcrypto e pgTAP, rodando como o usuário postgres (socket local).
# Uso:   sudo supabase/tests/montar-banco-local.sh            # cria/recria o banco redacao_local
#        DB=outro_nome sudo supabase/tests/montar-banco-local.sh
# Testes: sudo -u postgres psql -v ON_ERROR_STOP=1 -d redacao_local < supabase/tests/auditoria.test.sql
set -euo pipefail
RAIZ=$(cd "$(dirname "$0")/../.." && pwd)
DB=${DB:-redacao_local}
como_postgres() { if [ "$(id -un)" = postgres ]; then bash -c "$1"; else su postgres -c "$1"; fi; }
como_postgres "dropdb --if-exists $DB" >/dev/null 2>&1
como_postgres "createdb $DB"
printf 'alter database %s set search_path = "$user", public, extensions;\n' "$DB" | como_postgres "psql -q -d $DB"
como_postgres "psql -q -v ON_ERROR_STOP=1 -d $DB" < "$RAIZ/supabase/tests/supabase-simulado.sql" > /dev/null 2>&1
n=0
for f in $(ls "$RAIZ"/supabase/migrations/*.sql | sort); do
  if ! saida=$(como_postgres "psql -q -v ON_ERROR_STOP=1 -d $DB" < "$f" 2>&1); then
    echo "FALHOU: $(basename "$f")"; echo "$saida" | grep -E "ERROR|ERRO" | head -5; exit 1
  fi
  n=$((n + 1))
done
echo "ok: $n migrações aplicadas em $DB"
