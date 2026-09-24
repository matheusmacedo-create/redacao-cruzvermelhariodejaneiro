# Benchmark — trilha verificável e transparência (24/09/2026)

A pergunta: como organizações publicam registros que **qualquer pessoa confere sem depender da
própria organização**, e o que disso serve a uma filial de ONG com orçamento zero para
infraestrutura. O modelo resultante está em `docs/auditoria-publica.md`.

## 1. O que existe, por família

### Âncoras de tempo (prova de existência)

- **OpenTimestamps** — padrão aberto e gratuito: calendários públicos agregam hashes numa árvore de
  Merkle e gravam a raiz numa transação do Bitcoin; a prova (`.ots`) se confere com o cliente oficial
  ou em opentimestamps.org. A Redação já usa nos ofícios (`lib/oficios/ots.ts`).
- **Carimbo do tempo RFC 3161** — uma autoridade assina "este hash existia neste horário". Dá o
  horário na hora (o Bitcoin leva horas), mas depende de confiar na autoridade. No Brasil, as ACTs
  da ICP-Brasil dão validade jurídica e são pagas; a FreeTSA é gratuita e sem vínculo ICP-Brasil.
- **Serviços comerciais de ancoragem** (OriginStamp, Woleet e similares) — cobram por volume para
  fazer, em essência, o que o OpenTimestamps faz de graça.

### Logs transparentes (só de acréscimo, verificáveis)

- **Certificate Transparency** (RFC 6962 e 9162) — o modelo conceitual: log em árvore de Merkle,
  "cabeça" da árvore assinada periodicamente, prova de inclusão para cada registro e prova de que o
  log só cresceu. **Sigstore Rekor** faz o mesmo para assinaturas de software (checkpoints assinados);
  **Trillian** é a infraestrutura genérica por trás de logs assim.
- **Bancos "ledger"** gerenciados (Azure Confidential Ledger, immudb; o Amazon QLDB foi descontinuado
  pela AWS em 2025) — resolvem o mesmo problema dentro do fornecedor, com custo e dependência. A lição
  do QLDB é o risco de a prova morar só no fornecedor.

### Páginas públicas de verificação

- **Verificador do ITI** (validar.iti.gov.br) — a pessoa solta o PDF e confere a assinatura: é a
  "porta do arquivo" da nossa página.
- **Selo digital dos cartórios** e **diploma digital** — código impresso, consulta pública por
  código: o gesto que o público brasileiro já conhece.
- **Certificados**: Open Badges/Credly e Blockcerts — verificação por link ou código, com a
  instituição emissora identificada.

### Transparência do terceiro setor

- **Lei 13.019/2014 (MROSC), art. 11** — divulgar as parcerias com o poder público (data,
  instrumento, órgão, objeto, valores, situação da prestação de contas e remuneração da equipe paga
  com a parceria); **Decreto 8.726/2016, art. 80** — manter até 180 dias depois da prestação de
  contas final.
- **Boas práticas de transparência de OSCs** (selos e guias do setor, relatórios de federações
  humanitárias) — estatuto, diretoria, demonstrações contábeis com parecer, relatório anual,
  políticas de integridade: são as seções do portal.

### Canais oficiais contra golpe

Bancos e órgãos públicos mantêm uma página única de "canais oficiais" para desmentir perfis e números
falsos. O que falta nelas é a garantia de que a própria lista não foi trocada — daí registrar cada
versão na trilha.

## 2. O que cada decisão copia

| Decisão | De onde vem | Por quê |
| --- | --- | --- |
| Cadeia de hash por fluxo, só de acréscimo | logs de auditoria clássicos; escopo da intranet | detecta linha alterada ou apagada |
| Lote diário em árvore de Merkle com prova por item | Certificate Transparency; OpenTimestamps | um carimbo por dia cobre todos os itens, e cada item se confere sozinho |
| Cabeças das cadeias dentro do compromisso | "tree head" do CT | pega até quem reescreve a cadeia inteira de forma coerente |
| Manifesto diário assinado (Ed25519) | tree head assinado; checkpoints do Rekor | a filial assume, com a sua chave, o estado de cada dia |
| OpenTimestamps + RFC 3161 no mesmo lote | dupla âncora | Bitcoin sem confiança em ninguém; TSA com horário imediato |
| Código de 128 bits, consulta por posse | selo digital; diploma digital | sem enumeração, sem busca por nome |
| Classes P, V, C e I | minimização da LGPD | o público vê o que já é público; o resto, só quem tem o documento |
| Página de verificação que aceita o arquivo | verificador do ITI | o hash é calculado no navegador, o arquivo não sai do aparelho |
| Portal com versões imutáveis e hash de cada PDF | MROSC e boas práticas | documento publicado não é trocado em silêncio |
| Backup cifrado fora do provedor | regra 3-2-1 | a trilha prova, mas só o backup recupera |

Custo recorrente: zero (FreeTSA, calendários do OpenTimestamps, a hospedagem e o banco que já
existem, minutos gratuitos do GitHub Actions).

## 3. O que ficou de fora, e quando reconsiderar

- **Carimbo ICP-Brasil (ACT paga)** — reconsiderar para documento que precise de validade jurídica
  do horário (editais, atas de eleição).
- **Blockchain própria, tokens, NFT** — custo e complexidade sem ganho sobre a âncora pública.
- **Ledger gerenciado** — dependência de fornecedor; a trilha fica no Postgres que já existe e as
  provas ficam com quem quiser guardá-las.
- **Busca pública por nome** — exporia pessoas; a consulta é sempre por código ou por arquivo.
