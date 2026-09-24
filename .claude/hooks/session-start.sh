#!/bin/bash
# Prepara a sessão do Claude Code na web (claude.ai/code): instala as
# dependências com pnpm para que tsc, eslint e o build funcionem logo de
# cara. No computador de cada pessoa não faz nada — lá quem instala é você.
# Não lê nem grava credencial nenhuma.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# pnpm, nunca npm: npm cria um lockfile concorrente e quebra o build da Vercel.
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || npm install -g pnpm@10 >/dev/null 2>&1
fi

# --frozen-lockfile: instala exatamente o que está no pnpm-lock.yaml, sem
# reescrevê-lo. O store do pnpm fica no cache do contêiner entre sessões.
pnpm install --frozen-lockfile --prefer-offline
