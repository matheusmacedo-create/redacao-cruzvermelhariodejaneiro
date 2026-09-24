# Auditoria pública — especificação (v1, 24/09/2026)

Contrato comum entre o banco, a aplicação e o site principal, conferido contra o que foi construído
e testado. Mudança de contrato muda este arquivo no mesmo commit.

## 1. Decisões do Matheus (24/09/2026)

1. **Onde:** o backend vive **no banco da Redação desde já**, num schema separado (`auditoria`),
   sem dado pessoal na trilha. A decisão **D10** do escopo da intranet (projeto novo em sa-east-1)
   fica registrada como **provisória**: esta implementação adianta a fase de auditoria do escopo, e a
   migração para outro projeto, se vier, leva o schema `auditoria` preservando ids e hashes (o
   backup da §8 e o `seq` fora do hash existem para isso).
2. **Escopo da v1:** comunicados e matérias; ofícios e certificados; página de canais oficiais;
   portal de transparência.
3. **Endereço público:** `https://cruzvermelhariodejaneiro.org/verificar/` (página no site principal,
   que consulta a Redação por trás).
4. **Lançamento oculto:** fazer tudo, mas **nada visível para o público ainda**: nenhum link na home,
   no menu, no rodapé ou em matéria; páginas com `noindex`; nada no sitemap. A abertura é uma
   decisão futura, com checklist na §9.

Benchmark que embasa o modelo: `docs/auditoria-publica-benchmark.md`.

## 2. Modelo

### 2.1 Classes de visibilidade

| Classe | O que é | Como se consulta | O que a consulta mostra |
| --- | --- | --- | --- |
| **P** — público por natureza | matérias publicadas no site, comunicados à imprensa, documentos e parcerias do portal de transparência, versões da página de canais oficiais | código, QR ou arquivo (hash no navegador) | título, data e hora, endereço público, hash, estado, provas e o texto canônico para baixar |
| **V** — verificável por quem tem o documento | ofícios assinados | código impresso (o de 32 hex do ofício ou o de 26 caracteres) ou o PDF assinado no gov.br | "confere", dia do registro, estado e provas; o documento completo continua na página própria do ofício |
| **C** — certificados | certificados de curso da Área do Voluntário | código (o `XXXX-XXXX` impresso ou o de 26 caracteres) | estado, nome, curso, carga horária e datas — o que a página `/certificado/[codigo]` já mostra |
| **I** — interno | conferência da cadeia, fechamento de lote | não têm página | nada |

Nunca aparece em consulta pública: fluxo, papel, ator, posição na cadeia, contagem por fluxo ou por
dia, motivo em texto livre, nonce, id de origem.

### 2.2 Camadas de prova

0. **Backup fora do Supabase** (o plano gratuito não tem backup): dump diário cifrado com `age`,
   fora do provedor (§8). Hash encadeado detecta adulteração; só backup recupera.
1. **Cadeia de hashes por fluxo** em `auditoria.eventos`, só de acréscimo, conferida todo dia.
2. **Lote diário**: árvore de Merkle das folhas dos itens, **hash das cabeças das cadeias** e
   compromisso encadeado ao lote anterior. O manifesto é assinado com Ed25519 e carimbado por uma
   autoridade RFC 3161 (FreeTSA); o compromisso é ancorado no Bitcoin pelo OpenTimestamps
   (reaproveitando `lib/oficios/ots.ts` e `lib/oficios/carimbo.ts`). **Cada item tem prova própria**
   (`.ots` com o caminho de Merkle), conferível no cliente oficial do OpenTimestamps sem depender da
   filial. Como o lote ancora também as cabeças das cadeias, reescrever a história de forma coerente
   ainda é pego (teste "cadeia reescrita com coerência" em `supabase/tests/auditoria.test.sql`).
3. **Terceiros** (na abertura): captura no Internet Archive das páginas públicas.
4. **Assinatura gov.br e ata notarial**: sob demanda, fora deste escopo.

## 3. Banco

Migrações (só acréscimos): `supabase/migrations/20260925203000_cvrj_auditoria.sql` (a trilha e os
ganchos de matérias, comunicados, ofícios e certificados) e `20260925203100_cvrj_transparencia.sql`
(portal e canais, §5). Testes pgTAP em `supabase/tests/`, rodados só em banco local (§10).

### 3.1 Schema e privilégios

- `create schema auditoria`, sem `usage` para `anon`, `authenticated` nem `service_role`; fora da
  Data API. RLS ligada em todas as tabelas, sem política: só as funções leem e escrevem.
- Funções internas em `auditoria.*`: sem `execute` para ninguém além do dono; os gatilhos das
  tabelas de origem são `security definer`.
- Funções em `public` desta trilha: `revoke` de `public, anon, authenticated` e `grant execute` a
  `service_role` — exceto `auditoria_painel` e `auditoria_item_interno`, que conferem admin por dentro
  e são de `authenticated`. Todas `security definer` com `search_path = ''` (testado).

### 3.2 Tabelas

**`auditoria.fluxos`**: F01–F12 do escopo da intranet, reservados e inativos; em uso:

| Código | nome_interno | Itens |
| --- | --- | --- |
| F13 | `publicacao.site` | matérias no site (P) |
| F14 | `oficio` | ofícios (V) |
| F15 | `certificado` | certificados (C) |
| F16 | `transparencia` | documentos e parcerias do portal (P) |
| F17 | `canais_oficiais` | versões da lista de canais (P) |
| F18 | `imprensa` | comunicados à imprensa (P) |
| F19 | `auditoria.lotes` | conferências e lotes (I) |

**`auditoria.itens`** (imutável: UPDATE, DELETE e TRUNCATE levantam erro): `id`; `codigo` (26
caracteres de Crockford, último em `0 4 8 C G M R W`); `codigo_externo` (ofício 32 hex ou certificado
`XXXX-XXXX`, único); `classe` e `fluxo` (conferidos contra o `tipo`); `tipo` (`materia`,
`comunicado`, `oficio`, `certificado`, `documento`, `parceria`, `canais`); `workspace_id`;
`referencia_id` (origem, sem chave estrangeira); `versao`; `hash_conteudo`; `hash_arquivo` (SHA-256 do
arquivo que a pessoa tem, quando não é o próprio conteúdo: PDF do portal, PDF assinado no gov.br);
`nonce` (16 bytes); `titulo_publico`, `url_publica` (só `https://`) e `conteudo_canonico` (só classe
P, e aí `hash_conteudo = sha256(conteudo_canonico)` é CHECK); `substitui_item_id`; `registrado_em`
(`clock_timestamp()`).

**`auditoria.eventos`** (imutável): `seq` (só chave), `fluxo`, `ordem_no_fluxo` (única por fluxo),
`ocorrido_em`, `workspace_id`, `item_id`, `entidade_tipo`, `entidade_id`, `ator_id` (sem chave
estrangeira), `papel` (`admin`, `editor`, `colaborador`, `sistema`), `acao` (catálogo fechado:
`item.registrado`, `item.substituido`, `item.revogado`, `item.retirado`,
`auditoria.verificacao_ok`, `auditoria.verificacao_falhou`, `auditoria.lote_fechado`), `depois`
(objeto com chaves `estado`, `versao`, `tipo`, `classe`, `motivo`, `itens`, valores escalares, até
500 caracteres), `hash_arquivo`, `hash_anterior`, `hash_linha`. Motivos: `erro_material`,
`decisao_administrativa`, `pedido_do_titular`, `retirado_do_ar`, `outro` (o texto livre fica na origem).

Encadeamento (gatilho BEFORE INSERT): `pg_advisory_xact_lock(hashtext('auditoria:fluxo:' || fluxo))`,
ordem = última + 1, `hash_anterior` = `hash_linha` da última (ou 64 zeros), `ocorrido_em =
clock_timestamp()` (monótono dentro do fluxo) e

```
hash_linha = sha256(concat_ws('|', ordem_no_fluxo, ocorrido_em em UTC 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"',
  workspace_id|'', fluxo, item_id|'', entidade_tipo, entidade_id|'', ator_id|'', papel, acao,
  depois::text|'', hash_arquivo|'', hash_anterior))
```

`seq` fica fora (restaurar um dump não quebra a cadeia — testado na §8); campo nulo vira `''`.

**`auditoria.verificacoes`**: uma linha por conferência (`executado_em`, `origem`, `ok`, `eventos`,
`fluxos` jsonb com o resultado de cada fluxo, `lotes`, `lotes_ok`, `primeiro_lote_com_falha`,
`duracao_ms`).

**`auditoria.lotes`**: `dia` (São Paulo), `itens`, `raiz`, `cabecas`, `cabecas_detalhe` (ponta de
cada cadeia no fechamento; interno), `compromisso_anterior`, `compromisso`, `manifesto`,
`hash_manifesto`; assinatura (`assinatura`, `chave_id`, `assinado_em`) e carimbo RFC 3161 (`tsr`,
`tsr_em`) só passam de vazio a preenchido; OpenTimestamps (`ots`, `ots_estado` pendente → enviado →
confirmado, `ots_enviado_em`, `bloco`, `ots_confirmado_em`) só evolui até a confirmação; fila e
publicação (`tentativas`, `ultimo_erro`, `proxima_tentativa_em`, `publicado_em`) mudam à vontade.

**`auditoria.lote_itens`** (imutável), **`auditoria.consultas_limite`** (HMAC de rota e IP por hora;
fora da trilha) e **`auditoria.falhas`** (o que um gancho não conseguiu registrar).

### 3.3 Formatos canônicos

- **Código:** 16 bytes aleatórios em base32 de Crockford (26 caracteres). A consulta tira espaços e
  hífens e troca `O`→`0`, `I`/`L`→`1`.
- **Folha:** `sha256(bytes(hash_conteudo) || nonce)`.
- **Raiz:** folhas na ordem `(registrado_em, id)`; pares `sha256(esq || dir)`; nó ímpar sobe sem hash;
  sem itens, 64 zeros.
- **Cabeças:** `sha256` das linhas `fluxo:ordem:hash_linha` (a última de cada fluxo), em ordem de
  fluxo, separadas por `\n`.
- **Compromisso:** `sha256(raiz || cabecas || anterior)` (bytes; o primeiro lote usa 32 bytes zero).
- **Manifesto** (texto exato, é o que se assina e se carimba):
  `{"anterior":"…","cabecas":"…","compromisso":"…","dia":"AAAA-MM-DD","origem":"cruzvermelhariodejaneiro.org","raiz":"…","versao":1}`
- **Assinatura:** Ed25519 sobre os bytes do manifesto; `chave_id` = 16 primeiros hex do SHA-256 da
  chave pública bruta.
- **RFC 3161:** `messageImprint` = SHA-256 do manifesto (confere com `openssl ts -verify -data
  manifesto.json`).
- **OpenTimestamps do lote:** o `.ots` de `compromisso.bin` (96 bytes: raiz ‖ cabeças ‖ anterior),
  cujo SHA-256 é o compromisso.
- **Prova de um item** (`.ots` sob demanda): do `hash_conteudo`: `append(nonce)`, `sha256`, o caminho
  (`append(irmão)` ou `prepend(irmão)` + `sha256` a cada nível), `append(cabeças ‖ anterior)`,
  `sha256`, e daí a árvore do lote. Conferida no cliente oficial (`ots verify`).
- **Conteúdo canônico:** JSON com chaves em ordem, sem espaços (`auditoria.json_canonico`):
  - matéria `{corpo, subtitulo, titulo, url}` (sem data: republicar o mesmo texto não abre versão);
  - comunicado `{assunto, corpo, enviado_em, link_rotulo, link_url}`;
  - certificado `{carga_horaria, codigo, curso, emitido_em, nome, valido_ate}` (só o hash vai à
    trilha; a consulta lê os dados da tabela de origem);
  - ofício: o `hash_manifesto` do próprio ofício (que já inclui o hash do PDF do gov.br);
  - documento do portal `{arquivo: {nome, sha256, tamanho, url}, categoria, descricao, periodo, titulo}`;
  - parceria: os campos da Lei 13.019/2014 com valores em texto de duas casas;
  - canais `{canais, observacao, versao}`.

### 3.4 Funções

Internas: `gerar_codigo`, `json_canonico`, `sha256_hex`, `hash_do_evento`, `registrar_item`
(idempotente; versão nova para conteúdo novo de item público; revogado é final; ofício e certificado
com outro conteúdo é erro), `registrar_evento_item` (revoga ou retira item vigente), `estado_item`,
`ultimo_item`, `ator_atual` (a sessão, ou a conta informada pelo servidor em `auditoria.ator`),
`papel_atual`, `raiz_merkle`, `caminho_merkle`, `item_por_codigo`, `projecao`, os gatilhos e os
geradores de conteúdo canônico.

Públicas (`service_role`, salvo indicação):

| Função | Uso |
| --- | --- |
| `auditoria_consultar(codigo)` / `auditoria_consultar_hash(hash)` | projeção pública; por hash, o registro mais recente e `primeiro_registro_em` |
| `auditoria_conteudo(codigo)` | texto canônico de item público |
| `auditoria_dados_prova(codigo)` | operações do item até o compromisso e o `.ots` do lote |
| `auditoria_permitir(chave, limite)` | limite por hora |
| `auditoria_registrar_item(...)`, `auditoria_registrar_evento_item(...)` | registro pela aplicação |
| `auditoria_sincronizar()` | registra o que os ganchos perderam e o que já existia antes da trilha (matéria só se `updated_at = site_published_at`); devolve contagens e `falhas_24h` |
| `auditoria_verificar_cadeia(origem)` | confere cada fluxo e cada lote (folhas, raiz, cabeças contra a cadeia, compromisso, manifesto) e grava o resultado |
| `auditoria_fechar_lote(dia)` | fecha o dia de São Paulo (recusa dia não terminado; repetir não faz nada) |
| `auditoria_assinar_lote`, `auditoria_gravar_ots`, `auditoria_gravar_tsr`, `auditoria_registrar_erro_lote`, `auditoria_marcar_publicado`, `auditoria_lotes_pendentes`, `auditoria_indice_lotes` | a fila dos lotes |
| `auditoria_codigos_das_origens(tipo, ids)` | códigos para as páginas do portal |
| `auditoria_painel(workspace)`, `auditoria_item_interno(workspace, codigo)` | `authenticated`, só admin |

Projeção pública: `encontrado, codigo, classe, tipo, versao, hash, hash_arquivo, registrado_em`
(classe P: data e hora; V e C: só o dia), `estado` (`vigente`, `substituido`, `revogado`, `retirado`),
`estado_em`, `substituido_por {codigo, url, versao}`, `titulo`, `url`, `certificado {nome, curso,
carga_horaria, emitido_em, valido_ate}`, `lote {dia, compromisso, assinado, chave_id, ots, bitcoin
{confirmado, bloco}, tsa}` (nulo enquanto o item espera o lote do dia) e `cadeia {integra,
verificada_em}` (a última conferência).

### 3.5 Ganchos nas origens

AFTER, por linha; falha vira linha em `auditoria.falhas` e a operação principal segue.

| Origem | Quando | Registro |
| --- | --- | --- |
| `oficios` | vira `assinado` | V, `codigo_externo` = código de verificação, `hash_arquivo` = PDF final (gov.br) |
| `oficios` | vira `cancelado` | `item.revogado` |
| `certificados` | INSERT / `revogado_em` preenchido / DELETE | C / `item.revogado` / `item.retirado` |
| `content_pieces` | `site_url` e `site_published_at` preenchidos ou mudados / `site_url` limpo | P / `item.retirado` |
| `press_campanhas` | vira `enviada` ou `parcial` | P (ator: quem mandou enviar) |
| portal e canais | ver §5 | P |

## 4. Aplicação (Redação)

- `lib/auditoria/`: `catalogo.ts` (espelho das listas e rótulos, leitura de código), `assinatura.ts`
  (Ed25519), `tsa.ts` (RFC 3161 com `pkijs`), `prova.ts` (o `.ots` do item), `consulta.ts` (CORS,
  limite, links) e `rotina.ts` (as rotinas dos crons).
- **API pública** (fora do `proxy`, sem sessão):
  - `POST /api/publico/verificar` com `{"codigo"}` ou `{"hash"}` → projeção + `links {prova,
    conteudo, manifesto, pagina_propria}` + `consultado_em`; 400 `entrada_invalida`; 429 `limite`
    (30 por hora por IP, com `Retry-After`); 503 `indisponivel`. CORS só para o site (com e sem `www`).
  - `GET /api/publico/verificar/[codigo]/prova` → `<codigo>.json.ots` (P) ou `<codigo>.ots`; 404
    `sem_prova`, 409 `prova_em_preparo`.
  - `GET /api/publico/verificar/[codigo]/conteudo` → `<codigo>.json`, byte a byte o registrado.
  - `pagina_propria` só aparece para quem digitou o código do próprio documento (ofício ou
    certificado).
- **Crons** (`vercel.json`, `Bearer CRON_SECRET`):
  - `/api/auditoria/diaria` (08h UTC): sincroniza, confere a cadeia, fecha o lote de ontem, assina,
    carimba (FreeTSA e calendários do OpenTimestamps) e publica.
  - `/api/auditoria/provas` (14h UTC): pergunta aos calendários se o lote já entrou num bloco
    (confirma pela raiz de Merkle do bloco num explorador) e republica o `.ots`.
  - Falha na conferência, falha de registro ou erro de lote vira aviso à administração por
    `notificar()` (categoria `auditoria`, "Trilha pública", com preferência de e-mail; link para
    `/trilha-publica`).
- **Arquivos no site** (FTP, `enviarArquivoDeVerificacao`, lista fechada de nomes):
  `verificar/chave-publica.pem`, `verificar/chaves/<chave_id>.pem` (cópia permanente por chave),
  `verificar/lotes/indice.json` e `verificar/lotes/AAAA-MM-DD/{manifesto.json, manifesto.json.sig
  (64 bytes), manifesto.json.tsr, compromisso.bin, compromisso.bin.ots}`. A Redação nunca escreve a
  página `verificar/index.html` nem o `.htaccess` dela (são do repositório do site).
- **Área interna "Trilha pública"** (`/trilha-publica`, permissão `trilha.ver`, só admin): última
  conferência, lotes e provas, falhas, itens recentes, busca por código com a história do item, e os
  botões de conferir, sincronizar e fechar o lote agora.
- **Variáveis novas:** `AUDITORIA_CHAVE_PRIVADA` (Ed25519 PKCS#8 PEM; sem ela, os lotes ficam sem
  assinatura até ela chegar), `AUDITORIA_SEGREDO` (HMAC do limite; na falta, derivado da chave de
  serviço), `AUDITORIA_ABERTA` (`1` na abertura) e `AUDITORIA_TSA_URL` (opcional; padrão FreeTSA).

Testado de ponta a ponta em 24/09/2026 com PostgREST e FTPS locais: rotina diária (sincronização,
conferência, lote, assinatura, FreeTSA e calendários reais), arquivos publicados conferidos com
`openssl pkeyutl`, `openssl ts -verify` e `ots verify`, consulta, prova, conteúdo, CORS, limite e
idempotência.

## 5. Transparência e canais oficiais

Migração `20260925203100_cvrj_transparencia.sql`:

- `transparencia_documentos` (o lugar no portal: categoria, título, descrição, período, ordem,
  retirada com motivo) e `transparencia_versoes` (os PDFs: caminho no bucket privado
  `transparencia`, nome, tamanho, SHA-256 calculado pelo servidor, endereço público, publicação).
  Versão publicada não muda nem se apaga; arquivo novo é versão nova, e a trilha registra a anterior
  como substituída. Ficha editada depois de publicada também abre versão na trilha.
- `transparencia_parcerias`: os campos do art. 11 da Lei 13.019/2014 (instrumento, número, órgão e
  CNPJ, objeto, datas, valores total e liberado, situação da prestação de contas) e a equipe paga com
  a parceria **só com função e remuneração**.
- `canais_oficiais_versoes`: cada publicação é a lista inteira, imutável; a trilha usa o próprio
  espaço como origem, então cada versão substitui a anterior.
- Leitura: só admin (RLS). Escrita: funções `transparencia_*` e `canais_publicar_versao`, só da
  chave de serviço, chamadas pelas actions (`app/actions/transparencia.ts`) depois de
  `requirePermissao('transparencia.gerenciar')`, informando quem agiu (a trilha registra o autor).
  Antes das funções que recebem só o id, a action confere que o registro é do espaço da pessoa.
- Telas `/transparencia` e `/canais-oficiais` (só admin). O PDF vai do navegador ao Storage por link
  de uso único; o servidor confere que é PDF, calcula o SHA-256 e, ao publicar, sobe para
  `transparencia/arquivos/<título>-<12 hex do SHA-256>.pdf` e regera a página.
- Retirar um documento (com motivo) apaga do site os PDFs de todas as versões dele e regera a
  página; `transparencia_marcar_removidos` grava `removido_do_site_em` nas versões (uma vez só: a
  guarda não deixa desfazer). O arquivo continua no bucket privado e a trilha continua respondendo
  pelo código (estado "retirado"). Se o site não responder, o banco não marca, e o cartão do
  documento mostra o aviso com o botão "Apagar os PDFs do site" para tentar de novo.
  Se o documento voltar ao portal (versão nova publicada depois da retirada), as versões cujo PDF
  saiu do site aparecem com o SHA-256 e sem link.
- A página de canais usa o registro da trilha da própria versão publicada:
  `auditoria_codigos_das_origens` devolve `versao_origem` (o número da versão da lista gravado no
  conteúdo canônico), então o código mostrado é sempre o daquela lista.
- Páginas públicas geradas (`lib/transparencia/paginas.ts`) com o esqueleto do site:
  `transparencia/index.html` e `canais-oficiais/index.html`, cada documento, parceria e versão com
  SHA-256 e código de verificação. Enquanto `AUDITORIA_ABERTA` não for `1`: `noindex` na página e
  `X-Robots-Tag` no `.htaccess` da pasta (vale também para os PDFs), fora do sitemap e sem link.

## 6. Site principal (repositório `cruzvermelhariodejaneiro`)

`site/verificar/index.html` (gerado por `scripts/gerar_verificar.py`), com `noindex` na meta e em
`site/verificar/.htaccess` (`X-Robots-Tag` na pasta inteira, lotes incluídos), fora do sitemap, sem
link em página nenhuma e sem script de terceiros (é uma URL de capacidade). Três portas de entrada:
código digitado, `?c=<codigo>` (QR) e arquivo solto na página (SHA-256 calculado no navegador; o
arquivo não sobe). Estados: confere, prova em confirmação, substituído, revogado, retirado, não
encontrado ("isso não prova falsificação…"), limite e indisponível. Downloads de prova, texto
canônico e manifesto; relatório para imprimir; instruções para conferir sem a filial. A URL da API é
fixa em produção (só `localhost` aceita troca, para teste).

## 7. O que nunca fazer

Alimentar a trilha a partir do `activity_log` (editável e forjável); gravar dado pessoal em
`eventos` (nome, e-mail, CPF, IP em claro ou hash puro de IP, texto livre); dar grant de UPDATE,
DELETE ou TRUNCATE em tabela da trilha; expor o schema `auditoria` na Data API; rodar teste em
produção; publicar só o `.ots` do lote sem a prova por item; oferecer busca por nome; citar canais
antigos na página de canais oficiais; aceitar troca da URL da API na página pública.

## 8. Backup (camada 0)

`docs/backup.md`: dump diário cifrado com `age` (inclui os segredos do Vault, sem os quais os dados
cifrados não voltam), enviado por FTPS a uma pasta fora do site, 30 mais recentes. Restauração
testada: mesmos hashes da cadeia e conferência íntegra no banco restaurado.

## 9. Checklist de abertura (quando o Matheus decidir)

1. `AUDITORIA_ABERTA=1` na Vercel; em `/transparencia` e `/canais-oficiais`, "Atualizar a página no
   site" (a página e o `.htaccess` saem sem `noindex`).
2. No site: tirar o `noindex` de `site/verificar/` (meta e `.htaccess`), incluir as páginas no
   sitemap e no menu/rodapé, e `/transparencia/` e `/canais-oficiais/` em `paginasFixas()`
   (`lib/site/sitemap.ts`).
3. Publicar a impressão digital da chave (`chave_id`) na página de canais oficiais (já sai lá quando a
   chave está configurada) e num PDF assinado via gov.br pela presidência.
4. Ligar a captura no Internet Archive das páginas públicas.
5. Selo "Confira a autenticidade" nas matérias, comunicados e certificados.

## 10. Testar localmente

Nunca em produção. Com PostgreSQL 16 ou 17, pgcrypto e pgTAP:

```bash
sudo supabase/tests/montar-banco-local.sh     # 61 migrações sobre a simulação do Supabase
sudo -u postgres psql -v ON_ERROR_STOP=1 -d redacao_local < supabase/tests/auditoria.test.sql       # 159 testes
sudo -u postgres psql -v ON_ERROR_STOP=1 -d redacao_local < supabase/tests/transparencia.test.sql   # 55 testes
```
