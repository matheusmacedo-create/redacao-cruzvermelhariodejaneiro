---
name: entregar
description: Fecha um trabalho na Redação — branch, commit em português, validação, push e pull request com descrição. Use quando pedirem para "subir", "commitar", "abrir PR", "mandar para revisão" ou "fazer deploy".
---

# Entregar uma mudança

Todo merge na `main` publica em produção automaticamente (Vercel). Por isso
ninguém — pessoa ou agente — faz push direto na `main`.

1. **Branch**: se estiver na `main`, crie um branch descritivo
   (`git switch -c <seu-nome>/<assunto>`). Traga a `main` antes de começar:
   `git fetch origin main && git merge origin/main`.
2. **Valide** com a skill `validar`. Não siga com nada vermelho.
3. **Commit em português**, título curto dizendo o que muda para quem usa;
   corpo com o porquê e o que foi conferido. Não inclua arquivos `.env*`,
   `.next/`, scripts avulsos de teste ou `tsconfig.tsbuildinfo`.
4. **Push** do branch: `git push -u origin <branch>`.
5. **Pull request** para a `main` com:
   - o que muda e por quê;
   - migração nova, se houver, e a caixa "Migração aplicada em produção"
     (já está no modelo do PR). **Com migração, abra o PR como rascunho**;
     ele só fica pronto para revisão depois de a migração ser aplicada e
     conferida (skill `migracao`) e a caixa marcada. O check "Migração
     aplicada?" fica vermelho enquanto a caixa estiver vazia;
   - variáveis de ambiente novas (só os **nomes**);
   - como foi validado e **o que não foi testado**.
6. **Preview**: a Vercel comenta no PR com o link do preview. Percorra a tela
   que mudou por lá. O preview usa o banco de produção e **não envia e-mail**
   (a chave do Resend só existe em produção).
7. O merge fica com quem revisa. Depois do merge, confira que o deploy de
   produção subiu.
