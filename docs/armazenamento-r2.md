# Cloudflare R2: backups, espelho da trilha e acervo

A filial usa o Cloudflare R2 (armazenamento de objetos compatível com S3) desde 24/09/2026 para
três coisas: o **backup** do banco e dos arquivos, o **espelho** da trilha pública de auditoria e o
**acervo** — a biblioteca de tudo o que vale guardar para o futuro. Todos os buckets são
privados; nada é público até alguém decidir abrir.

| Bucket | Para quê | Trava (ninguém apaga nem troca) | Apagado sozinho | Quem escreve |
| --- | --- | --- | --- | --- |
| `cvrj-backups` | backup diário do banco e dos arquivos do Storage, cifrados com age (docs/backup.md) | `banco/` 30 dias; `storage/` 90 dias | `banco/` com 90 dias | GitHub Actions |
| `cvrj-trilha` | espelho da trilha pública (docs/auditoria-publica.md §4) | `registro/` para sempre | nunca | Redação (crons da trilha) |
| `cvrj-acervo` | biblioteca e acervo da filial (docs/acervo.md) | as pastas do acervo, 30 dias; `entrada/` sem trava | nunca | a Redação (tela Acervo), pessoas e o script de cópia do site |
| `cvrj-testes` | testes | `trava/` 1 dia | tudo, com 2 dias | quem estiver testando |

O bucket `cruzvermelha`, criado no painel antes deste trabalho, não foi mexido.

## A trava

Um objeto sob uma regra de trava não pode ser apagado nem substituído até o prazo acabar: o R2
responde HTTP 409 `ObjectLockedByBucketPolicy`, venha o pedido de quem vier. Isso protege contra
engano e contra chave vazada. As regras só mudam pela conta da Cloudflare (R2 → bucket → Settings →
Bucket lock rules). Tirar a trava de `registro/` do bucket da trilha é uma das coisas que nunca se
fazem (docs/auditoria-publica.md §7).

## Tokens: um por uso, cada um só no seu bucket

O token criado em 24/09/2026 para montar tudo tem acesso de administrador a todos os buckets e
passou pelo chat. Depois de configurar, criar um token por uso (Cloudflare → R2 → Manage R2 API
Tokens → Create API token → **Object Read & Write** → **Apply to specific buckets only**) e
**revogar o de 24/09**:

| Token | Bucket | Vai para |
| --- | --- | --- |
| backup | `cvrj-backups` | segredos do GitHub da Redação: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_BACKUP=cvrj-backups` (e `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) |
| Redação | `cvrj-trilha` e `cvrj-acervo` | Vercel da Redação: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_TRILHA=cvrj-trilha`, `R2_BUCKET_ACERVO=cvrj-acervo` |
| acervo | `cvrj-acervo` | quem envia arquivos ao acervo por fora da Redação (Cyberduck, rclone) e o script de cópia do site |

O Access Key ID e o Secret Access Key aparecem uma vez: colar direto no destino, sem passar por
chat ou e-mail. `R2_ACCOUNT_ID` é o ID da conta (R2 → Overview, à direita); `R2_ENDPOINT` só é
preciso para bucket com jurisdição (UE).

## O acervo

A tela **Acervo** da Redação é o caminho normal: envia do navegador direto para o bucket, cataloga
e publica em `cruzvermelhariodejaneiro.org/acervo/` o que for público (docs/acervo.md). Para o
navegador enviar direto, o bucket tem uma regra de CORS (Settings → CORS policy) que libera `PUT`,
`GET` e `HEAD` só para `https://palacio.cruzvermelhariodejaneiro.org`, `https://redacao.cruzvermelhariodejaneiro.org` (o antigo, enquanto redirecionar) e `http://localhost:3000`;
sem ela o envio pela tela falha.

O `LEIA-ME.txt` na raiz do bucket e um `_sobre-esta-pasta.txt` em cada pasta explicam o que vai
onde:

- `entrada/` — caixa de entrada, sem trava: o que ainda não foi organizado;
- `documentos/`, `fotos/`, `videos/`, `imprensa/`, `historia/` — o acervo, por assunto e por ano,
  com a data na frente do nome;
- `site/` — cópias do site no ar, uma pasta por dia, com `MANIFESTO.sha256` e `SOBRE.txt`. A
  primeira, de 24/09/2026 (145 arquivos, 21,7 MB), já está lá; as próximas saem de
  `scripts/copiar_site_para_o_acervo.sh`, no repositório do site;
- `redacao/` — exportações da Redação (matérias e peças publicadas).

A tela da Redação envia para `entrada/redacao/AAAA-MM/` e, ao guardar ou publicar um item, move o
arquivo para `<coleção>/<ano>/`. O que chegar por fora (painel, Cyberduck, rclone) aparece na
navegação por pastas da tela e ganha ficha com "Catalogar".

Nas pastas do acervo, nada se apaga nem se troca por 30 dias depois do envio: na dúvida, enviar
para `entrada/`. Dado pessoal (CPF, laudo, documento de aluno ou voluntário) não entra sem motivo:
o lugar dele é a Redação, com permissão de acesso.

Como enviar:

- **Painel**: Cloudflare → R2 → `cvrj-acervo` → a pasta → Upload.
- **Cyberduck** (Windows e Mac, gratuito), para arrastar pastas inteiras: nova conexão "Amazon S3",
  servidor `<ID da conta>.r2.cloudflarestorage.com`, com o Access Key e o Secret do token do acervo.
- **rclone**, para volumes grandes (por exemplo, uma pasta inteira do Google Drive):
  `rclone copy "drive:Fotos da filial" "r2:cvrj-acervo/fotos/"`, com um remoto do tipo S3 →
  Cloudflare.

## Custo

O R2 cobra o espaço ocupado (com uma faixa gratuita mensal, hoje de 10 GB) e as operações, e não
cobra o download. Conferir os valores do dia em `https://developers.cloudflare.com/r2/pricing/`.
Backups do banco (cerca de 1 MB cifrado hoje) e a trilha (poucos KB por dia) cabem folgados na
faixa gratuita; o acervo é o que vai crescer, sobretudo com vídeo.

## No código

- `lib/armazenamento/r2.ts`: cliente mínimo, com a assinatura AWS SigV4 feita ali (sem SDK) —
  enviar (com `soSeNaoExistir`, que manda `If-None-Match: *` e trata o 409 da trava como "já
  existe"), consultar (o ETag fraco `W/"…"` que o R2 devolve para texto é normalizado), ler,
  apagar e listar; links assinados de envio e de download (`urlAssinada`, com o nome do arquivo
  no download), cópia dentro do bucket (`copiarObjeto`, que consulta antes porque o R2 ignora
  `If-None-Match` na cópia), listagem por pasta e SHA-256 lido em fluxo. Usado pelo espelho da
  trilha (`lib/auditoria/espelho.ts`) e pelo acervo (`lib/acervo/`, `app/actions/acervo.ts`).
- `scripts/backup-banco.sh` e `scripts/restaurar-arquivos.sh`: `curl --aws-sigv4`, com o SHA-256 do
  arquivo no pedido — o R2 recusa (`XAmzContentSHA256Mismatch`) se chegar outra coisa.

Testado em 24/09/2026 contra o R2 de verdade: o cliente (envio, consulta, leitura, listagem,
nomes com acento e espaço, `If-None-Match`, trava), o espelho da trilha, o backup em quatro
rodadas com restauração completa e a cópia do site conferida arquivo por arquivo pelo manifesto.

## Próximos passos propostos

- ~~Tela "Biblioteca" na Redação~~: feita em 24/09/2026 como a tela **Acervo** (docs/acervo.md).
- **Arquivos novos da Redação no R2**, em vez do Storage do Supabase (o plano gratuito do Supabase
  tem 1 GB; no R2 o download não é cobrado).
- **Cópia do site por agendamento** (mensal) e exportação das matérias publicadas para `redacao/`.
