# Backup do banco (camada 0 da trilha pública)

O projeto do Supabase da Redação está no plano gratuito, que **não guarda backup**. A trilha
pública de auditoria (docs/auditoria-publica.md) detecta adulteração — hash encadeado, lotes
ancorados no Bitcoin e em carimbo de tempo —, mas não devolve dado perdido. Quem devolve é uma
cópia fora do provedor: é este backup.

## O que faz

`.github/workflows/backup-banco.yml` roda todo dia às 03h30 (São Paulo) e chama
`scripts/backup-banco.sh`, que:

1. gera o dump do Postgres (`pg_dump` 17, formato custom) dos schemas `public`, `private`,
   `auditoria`, `auth` e `storage` — sem os dados de sessões, tokens e registros de login, que
   não servem para restaurar e são sensíveis;
2. exporta os segredos do Vault (`vault.decrypted_secrets`). **Sem eles, CPF, dados de saúde,
   documentos e salários cifrados no banco não voltam**: as chaves `participantes_chave` e
   `equipe_chave` moram lá;
3. grava um `resumo.json` (quantos itens e eventos a trilha tinha, último lote) e o `SHA256SUMS`;
4. empacota tudo num `.tar` e **cifra com age** para a chave pública da diretoria;
5. envia por FTPS a uma pasta **fora do `public_html`** da Hostinger, com nome provisório e
   renomeação no fim (envio interrompido nunca parece backup inteiro), confere o tamanho no
   servidor e apaga os mais antigos além dos 30 mais recentes.

Não entram: os **arquivos do Storage** (PDFs de ofícios, da equipe e do portal). O dump leva o
registro deles (`storage.objects`), não os bytes. Cópia dos arquivos é o próximo passo.

## Configurar (uma vez)

1. **Chave age da diretoria.** Num computador de confiança, fora de qualquer sistema da filial:
   `age-keygen -o chave-da-diretoria.txt`. O arquivo tem a chave privada — imprimir e guardar em
   dois lugares físicos diferentes; ela nunca vai para a Vercel, o GitHub, o Supabase ou e-mail. A
   linha `# public key: age1…` é a chave pública, que vai para o segredo `BACKUP_AGE_DESTINATARIO`.
2. **Conta de FTP só para o backup** (hPanel → Arquivos → Contas FTP), com diretório fora do site,
   por exemplo `/home/<usuário da hospedagem>/backups`. O script recusa pasta que contenha `public_html`.
3. **Conexão do banco.** Supabase → Connect → **Session pooler** (o GitHub Actions não alcança o
   endereço direto, que é só IPv6 no plano gratuito). A senha é a do banco.
4. **Segredos do repositório** (GitHub → Settings → Secrets and variables → Actions):

   | Segredo | Valor |
   | --- | --- |
   | `SUPABASE_DB_URL` | a conexão do Session pooler, com a senha |
   | `BACKUP_AGE_DESTINATARIO` | a chave pública `age1…` |
   | `BACKUP_FTP_HOST` | o servidor de FTP da Hostinger |
   | `BACKUP_FTP_USUARIO`, `BACKUP_FTP_SENHA` | a conta do passo 2 |
   | `BACKUP_FTP_PASTA` | a pasta dentro dessa conta, ex.: `redacao` |

5. **Primeira rodada à mão**: GitHub → Actions → "Backup do banco" → Run workflow. O agendamento
   só vale depois que o arquivo do workflow está na branch principal. O GitHub **desliga
   agendamentos de repositório público depois de 60 dias sem atividade** — conferir uma vez por mês
   que a rodada do dia aconteceu.

Se o certificado do FTP da Hostinger estiver vencido (já aconteceu, ver `lib/publicacao/ftp.ts`), a
rodada falha em vez de enviar sem conferir; `BACKUP_FTP_VERIFICAR_CERTIFICADO=no` no workflow é o
paliativo consciente, a desfazer quando a hospedagem renovar.

## Restaurar (e o teste de restauração)

Testado em 24/09/2026 num Postgres local: backup gerado pelo script, enviado por FTPS, baixado,
decifrado, conferido, restaurado num banco vazio e verificado — mesmos hashes da cadeia, conferência
íntegra, lote conferido.

```bash
age -d -i chave-da-diretoria.txt redacao-AAAA-MM-DD.tar.age | tar -xf -
sha256sum -c SHA256SUMS            # banco.dump, segredos-do-vault.json e resumo.json: OK
createdb redacao_restaurado
psql -d redacao_restaurado -c 'create schema extensions; create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions;'
pg_restore --no-owner --no-privileges -d redacao_restaurado banco.dump   # "schema public already exists" é esperado
psql -d redacao_restaurado -c "set search_path = public, extensions; select public.auditoria_verificar_cadeia('script') - 'fluxos';"
```

A conferência precisa dar `"ok": true` e `"lotes_ok": true`, e os compromissos dos lotes precisam
bater com os publicados em `https://cruzvermelhariodejaneiro.org/verificar/lotes/indice.json`: é
isso que prova que a cópia é a mesma trilha que foi ancorada, e não uma reescrita.

Para voltar a um projeto novo do Supabase, restaurar `public`, `private` e `auditoria` com o mesmo
comando (o `auth` e o `storage` de um projeto novo já existem e são do Supabase: os usuários voltam
pelo `auth.users` do dump com cuidado, e os segredos do Vault com `vault.create_secret`, com os
mesmos nomes). Os segredos de integração (chaves de API) também estão no arquivo; trocá-los depois de
qualquer restauração fora do ambiente de sempre.
