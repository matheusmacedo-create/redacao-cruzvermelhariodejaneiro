# Backup do banco e dos arquivos (camada 0 da trilha pública)

O projeto do Supabase da Redação está no plano gratuito, que **não guarda backup**. A trilha
pública de auditoria (docs/auditoria-publica.md) detecta adulteração — hash encadeado, lotes
ancorados no Bitcoin e em carimbo de tempo —, mas não devolve dado perdido. Quem devolve é uma
cópia fora do provedor: é este backup, guardado no Cloudflare R2 (docs/armazenamento-r2.md).

## O que faz

`.github/workflows/backup-banco.yml` roda todo dia às 03h30 (São Paulo) e chama
`scripts/backup-banco.sh`, que:

1. gera o dump do Postgres (`pg_dump` 17, formato custom) dos schemas `public`, `private`,
   `auditoria`, `auth` e `storage` — sem os dados de sessões, tokens e registros de login, que
   não servem para restaurar e são sensíveis;
2. exporta os segredos do Vault (`vault.decrypted_secrets`). **Sem eles, CPF, dados de saúde,
   documentos e salários cifrados no banco não voltam**: as chaves `participantes_chave` e
   `equipe_chave` moram lá;
3. copia os **arquivos do Storage** (PDFs de ofícios, da equipe, do portal…): cada arquivo que
   ainda não está no R2 é baixado, **cifrado com age** e enviado como
   `storage/<bucket>/<nome>@<versão>~<SHA-256>.age`. A versão é o ETag do Storage: arquivo trocado
   vira outra cópia, e a anterior continua lá. Os que já estão no R2 não são baixados de novo;
4. grava o `storage.tsv` (bucket, nome, tamanho, SHA-256 e chave no R2 de cada arquivo), o
   `resumo.json` (itens e eventos da trilha, último lote, arquivos copiados) e o `SHA256SUMS`;
5. empacota tudo num `.tar` e **cifra com age** para a chave pública da diretoria;
6. envia ao R2 como `banco/redacao-AAAA-MM-DDTHHMMSS.tar.age`, com o SHA-256 no pedido (o R2
   recusa se chegar outra coisa), e confere o tamanho lá. Se o FTP estiver configurado, manda
   também por FTPS a uma pasta **fora do `public_html`** da Hostinger, com nome provisório e
   renomeação no fim, e apaga lá os mais antigos além dos 30 mais recentes.

Se algum arquivo do Storage falhar, o banco é salvo mesmo assim e a rodada termina com erro no
GitHub, para alguém olhar. A data e a hora no nome deixam rodar de novo no mesmo dia.

## O bucket `cvrj-backups`

| Pasta | Trava (ninguém apaga nem troca, nem com a chave) | Apagado sozinho |
| --- | --- | --- |
| `banco/` | 30 dias | depois de 90 dias |
| `storage/` | 90 dias | nunca (as versões antigas ficam) |

A trava protege contra engano e contra chave vazada: nem quem tem a chave de envio apaga um
backup recente. Só a conta da Cloudflare mexe nas regras (R2 → `cvrj-backups` → Settings). Um
arquivo que precise sair dos backups por pedido do titular (LGPD) sai pela chave `storage/…`
anotada no `storage.tsv`, depois do prazo da trava.

## Configurar (uma vez)

1. **Chave age da diretoria.** Num computador de confiança, fora de qualquer sistema da filial:
   `age-keygen -o chave-da-diretoria.txt`. O arquivo tem a chave privada — imprimir e guardar em
   dois lugares físicos diferentes; ela nunca vai para a Vercel, o GitHub, o Supabase, o R2 ou
   e-mail. A linha `# public key: age1…` é a chave pública, que vai para `BACKUP_AGE_DESTINATARIO`.
2. **Token do R2 só para o backup.** Cloudflare → R2 → Manage R2 API Tokens → Create API token:
   permissão **Object Read & Write**, só no bucket `cvrj-backups`. O Access Key ID e o Secret
   Access Key aparecem uma vez: colar direto nos segredos do GitHub, sem passar por chat ou e-mail.
3. **Conexão do banco.** Supabase → Connect → **Session pooler** (o GitHub Actions não alcança o
   endereço direto, que é só IPv6 no plano gratuito). A senha é a do banco.
4. **Chave de serviço do Supabase** (a mesma `SUPABASE_SERVICE_ROLE_KEY` da Vercel), para baixar
   os arquivos do Storage.
5. **Segredos do repositório** (GitHub → Settings → Secrets and variables → Actions):

   | Segredo | Valor |
   | --- | --- |
   | `SUPABASE_DB_URL` | a conexão do Session pooler, com a senha |
   | `BACKUP_AGE_DESTINATARIO` | a chave pública `age1…` |
   | `R2_ACCOUNT_ID` | o ID da conta da Cloudflare (R2 → Overview, à direita) |
   | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | o token do passo 2 |
   | `R2_BUCKET_BACKUP` | `cvrj-backups` |
   | `SUPABASE_URL` | `https://<projeto>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | a chave do passo 4 |
   | `BACKUP_FTP_HOST`, `BACKUP_FTP_USUARIO`, `BACKUP_FTP_SENHA`, `BACKUP_FTP_PASTA` | opcionais: segundo destino, uma conta de FTP com pasta fora do site |

6. **Primeira rodada à mão**: GitHub → Actions → "Backup do banco" → Run workflow. O agendamento
   só vale depois que o arquivo do workflow está na branch principal. O GitHub **desliga
   agendamentos de repositório público depois de 60 dias sem atividade** — conferir uma vez por mês
   que a rodada do dia aconteceu (no R2, o arquivo de hoje em `cvrj-backups/banco/`).

Com o FTP configurado e o certificado da Hostinger vencido (já aconteceu, ver
`lib/publicacao/ftp.ts`), a rodada falha em vez de enviar sem conferir;
`BACKUP_FTP_VERIFICAR_CERTIFICADO=no` no workflow é o paliativo consciente.

## Restaurar

Baixar o backup: painel da Cloudflare → R2 → `cvrj-backups` → `banco/` → o arquivo do dia →
Download (ou qualquer cliente S3, como o Cyberduck, com um token de leitura).

```bash
age -d -i chave-da-diretoria.txt redacao-AAAA-MM-DDTHHMMSS.tar.age | tar -xf -
sha256sum -c SHA256SUMS            # banco.dump, segredos-do-vault.json, storage.tsv e resumo.json: OK
createdb redacao_restaurado
psql -d redacao_restaurado -c 'create schema extensions; create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions;'
pg_restore --no-owner --no-privileges -d redacao_restaurado banco.dump   # "schema public already exists" é esperado
psql -d redacao_restaurado -c "set search_path = public, extensions; select public.auditoria_verificar_cadeia('script') - 'fluxos';"
```

A conferência precisa dar `"ok": true` e `"lotes_ok": true`, e os compromissos dos lotes precisam
bater com os publicados em `https://cruzvermelhariodejaneiro.org/verificar/lotes/indice.json` (ou no
espelho `verificar/lotes/indice.json` do bucket `cvrj-trilha`): é isso que prova que a cópia é a
mesma trilha que foi ancorada, e não uma reescrita.

**Os arquivos do Storage** voltam com `scripts/restaurar-arquivos.sh`, que lê o `storage.tsv`,
baixa cada arquivo do R2, decifra, confere o SHA-256 e grava em `<destino>/<bucket>/<nome>` (só lê
do R2; nada é apagado lá):

```bash
AGE_IDENTIDADE=chave-da-diretoria.txt R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… \
R2_BUCKET_BACKUP=cvrj-backups scripts/restaurar-arquivos.sh storage.tsv arquivos/
```

Depois, subir a pasta de cada bucket ao Supabase (Storage → bucket → Upload, ou a CLI).

Para voltar a um projeto novo do Supabase, restaurar `public`, `private` e `auditoria` com o mesmo
comando (o `auth` e o `storage` de um projeto novo já existem e são do Supabase: os usuários voltam
pelo `auth.users` do dump com cuidado, e os segredos do Vault com `vault.create_secret`, com os
mesmos nomes). Os segredos de integração (chaves de API) também estão no arquivo; trocá-los depois de
qualquer restauração fora do ambiente de sempre.

## Testes

- 24/09/2026, FTP: backup gerado pelo script, enviado por FTPS, baixado, decifrado, conferido,
  restaurado num banco vazio e verificado — mesmos hashes da cadeia, conferência íntegra, lote
  conferido.
- 24/09/2026, R2 (bucket de testes `cvrj-testes`, banco local e um Storage simulado): 1ª rodada
  copiou os 3 arquivos (acento, espaço e parênteses no nome incluídos) e o backup; 2ª não reenviou
  nada, com a listagem paginada de 1 em 1; 3ª mandou só a versão nova do arquivo trocado; 4ª, com
  um arquivo sumido do Storage, salvou o banco e terminou com erro. O backup baixado do R2 decifrou,
  o `SHA256SUMS` conferiu, o dump restaurou e `restaurar-arquivos.sh` trouxe os 3 arquivos idênticos
  aos originais. A trava foi testada à parte: substituir e apagar dentro do prazo dão HTTP 409
  `ObjectLockedByBucketPolicy`.
