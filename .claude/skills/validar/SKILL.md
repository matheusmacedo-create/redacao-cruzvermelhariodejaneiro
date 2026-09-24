---
name: validar
description: Confere o código antes de um push na Redação — checagem de tipos, eslint nos arquivos alterados e build de produção. Use antes de todo commit/push, quando pedirem para "validar", "conferir se compila" ou "rodar os testes".
---

# Validar antes do push

Não há suíte de testes neste projeto. O que prova que o código está de pé é
isto, nesta ordem, e **tudo precisa passar** antes de qualquer push:

1. **Tipos**
   ```bash
   npx tsc --noEmit
   ```
2. **Lint só do que você mudou** (o `pnpm lint` completo acusa erros antigos
   que não são seus):
   ```bash
   npx eslint $(git diff --name-only origin/main...HEAD -- '*.ts' '*.tsx'; git diff --name-only -- '*.ts' '*.tsx'; git ls-files --others --exclude-standard -- '*.ts' '*.tsx')
   ```
3. **Build de produção**
   ```bash
   pnpm build
   ```
   Se reclamar de tipos de rotas que não existem mais: `rm -rf .next` e rode de novo.

4. **Lógica pura nova** (regras, cálculos, datas, textos de e-mail): escreva um
   script avulso fora do repositório e rode com `npx tsx --tsconfig tsconfig.json <arquivo>`,
   com casos de borda. Não commite o script.

5. **Migração nova**: siga a skill `migracao` (inclui testar num Postgres
   descartável quando houver RLS).

Relate o resultado de cada passo. Se algo falhou e você não corrigiu, diga
qual comando, a saída, e por que parou — não empurre código vermelho.
