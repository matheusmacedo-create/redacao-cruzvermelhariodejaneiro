# Acervo da filial

O acervo guarda no Cloudflare R2 (bucket `cvrj-acervo`, docs/armazenamento-r2.md) tudo o que vale
guardar da filial: documentos, fotos, vídeos, recortes de imprensa e a história. A Redação é onde
a equipe envia, cataloga e decide o que vai a público. O que for público aparece em
**cruzvermelhariodejaneiro.org/acervo/**.

| Parte | Endereço | Quem acessa |
| --- | --- | --- |
| privada | tela **Acervo** da Redação (`/acervo`) | ver e baixar: `acervo.ver` (admin, editor, colaborador); enviar, catalogar, publicar e excluir: `acervo.gerenciar` (admin, editor) |
| pública | `cruzvermelhariodejaneiro.org/acervo/`, com as coleções e uma página por item | qualquer pessoa e a busca |
| porta da equipe | `cruzvermelhariodejaneiro.org/acervo/equipe/` | 302 para a tela da Redação; `Disallow` no `robots.txt` |

Tudo nasce privado. Um item só vai ao site quando alguém com `acervo.gerenciar` publica, e a
ficha precisa estar completa para isso.

## O caminho de um arquivo

1. **Envio.** A tela pede à Redação links de uso único (1 hora, `prepararEnvioAoAcervo`) e o
   navegador manda o arquivo direto ao R2, sem passar pela Vercel (que não aceita corpo grande), em
   `entrada/redacao/AAAA-MM/<8 letras>-<nome>`. Limite: 2 GB por arquivo. Depois do envio,
   `registrarNoAcervo` confere que o arquivo chegou e cria a ficha, com tamanho, tipo e SHA-256
   (até 200 MB). O que entrou no bucket por fora (painel da Cloudflare, Cyberduck, rclone) é
   catalogado na navegação por pastas, com "Catalogar" (`catalogarArquivoDoBucket`).
2. **Ficha.** Título, coleção, descrição, data (ano, mês ou dia, com a precisão guardada), autoria,
   local, direitos (todos reservados, quatro licenças Creative Commons 4.0 ou domínio público),
   crédito, texto alternativo, até 20 palavras-chave e, para vídeo, o link do YouTube ou do Vimeo.
3. **Guardar na coleção.** Copia de `entrada/` para `<coleção>/<ano>/<8 letras>-<nome>`, confere o
   tamanho e apaga o da entrada. Nas pastas das coleções vale a trava de 30 dias do bucket: o
   arquivo não se apaga nem se troca, venha o pedido de quem vier. Publicar faz esse passo sozinho.
4. **Publicar no site.** Confere a ficha (abaixo), prepara os arquivos públicos, grava a página do
   item, as páginas da coleção, a apresentação `/acervo/`, o `.htaccess` do acervo, o
   `sitemap.xml` e o `robots.txt`, tudo por FTP numa sessão só. A partir daí o endereço do item é
   permanente.
5. **Tirar do site.** O banco volta para privado primeiro; depois saem a página e os arquivos
   públicos do item, e a apresentação e as coleções são refeitas. O original continua no R2.
6. **Excluir a ficha.** Só de item privado, e com a retirada do site terminada. Se o arquivo ainda está em `entrada/`, sai junto; se
   já está numa coleção, fica lá (a trava não deixa apagar antes de 30 dias).

### O que a ficha precisa para ir ao site

`faltaParaPublicar` (lib/acervo/regras.ts) lista o que falta, e a tela mostra a lista:

- descrição com pelo menos 40 caracteres (é o que a busca mostra);
- texto alternativo com pelo menos 10 caracteres, se for imagem;
- autoria ou crédito, salvo domínio público;
- para vídeo, o link do YouTube ou do Vimeo: o arquivo de vídeo fica só no acervo;
- de resto, imagem ou PDF (até 60 MB). Áudio, planilha, `.zip` e afins ficam só no acervo interno.
- foto em HEIC (o padrão do iPhone) não vai: o sharp da Vercel não lê HEIC. Exportar como JPEG e
  enviar de novo; o HEIC continua guardado no acervo.

### O que vai para o site, e o que não vai

- **Imagem**: nunca o original. Até 120 MB de entrada; saem três larguras em WebP (480, 960 e
  1600, nunca maiores que o original), com a rotação corrigida e **sem metadados** (a localização
  gravada pela câmera não vaza). O original, com EXIF, fica no R2.
- **PDF**: copiado como está, depois de conferir que começa com `%PDF-`.
- **Vídeo**: não é hospedado. A página mostra a miniatura e só carrega o player
  (`youtube-nocookie.com` ou Vimeo) no clique: a página abre leve e o player não roda sem pedido.
- Os nomes públicos levam o endereço do item e 12 letras do SHA-256
  (`/acervo/arquivos/<endereço>-<hash>-960.webp`): trocar o arquivo muda o nome, e o cache de um
  ano (`immutable`) nunca serve a versão velha.

## Endereço permanente

O endereço é `/acervo/<coleção>/<endereço>/`, gerado do título na primeira publicação (sem repetir
dentro da coleção). O banco (gatilho `acervo_guardar_item`) não deixa mudar coleção, endereço nem
data da primeira publicação depois disso, e recusa apagar item público. Mudar o título depois não
quebra link nenhum: só a página muda. Motivo: um acervo vale pelo link que outros sites, trabalhos
e reportagens fazem para ele.

## Busca (SEO)

O que cada página leva, gerado em `lib/acervo/paginas.ts` sobre o esqueleto do site
(`lib/site/esqueleto.ts`):

- `title`, descrição, canonical, `robots: index, follow, max-image-preview:large`, Open Graph e
  cartão grande do X (a foto do item; PDF e vídeo sem miniatura usam
  `/assets/otim/og-acervo.jpg`, gerada no repositório do site);
- dados estruturados: `CollectionPage` + `Collection` na apresentação; `CollectionPage` +
  `ItemList` em cada coleção (24 itens por página, título com "página N de M" a partir da
  segunda, `rel="prev"`/`"next"`); `ItemPage` em cada item com `ImageObject` (licença, crédito,
  autoria e aviso de direitos, que o Google Imagens mostra como "Detalhes da licença"),
  `VideoObject` ou `DigitalDocument`; `BreadcrumbList` em todas. A organização e o site vão com
  nome e logo em toda citação (`noDaOrganizacao()`/`noDoSite()` do esqueleto), porque o validador
  do site e o Google não seguem um `@id` definido em outra página;
- `hreflang` pt-BR, en, es e x-default na apresentação, casando com `/en/archive/` e
  `/es/acervo/` do repositório do site (o catálogo é em português, a língua do material);
- `sitemap.xml` com a apresentação, as páginas das coleções e os itens, cada um com a data de
  atualização e a maior imagem (extensão de imagem do Google);
- PDF com o cabeçalho `Link: <página do item>; rel="canonical"` (no `.htaccess`): a busca junta o
  PDF e a página em vez de indexar o PDF solto;
- "Como citar" em cada item, no formato da ABNT, para quem usa o material em trabalhos.

## Configuração

| O quê | Onde |
| --- | --- |
| migração `20260926003000_cvrj_acervo.sql` (tabela `acervo_itens`, gatilho, RLS) | Supabase |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (as mesmas do espelho da trilha) e `R2_BUCKET_ACERVO=cvrj-acervo` | Vercel da Redação |
| FTP do site (as mesmas variáveis da publicação de notícias) | Vercel da Redação |
| CORS do bucket: `PUT`, `GET` e `HEAD` só de `https://redacao.cruzvermelhariodejaneiro.org` (e `http://localhost:3000`) | Cloudflare → R2 → `cvrj-acervo` → Settings → CORS |

O token da Vercel precisa de **Object Read & Write** em `cvrj-trilha` e `cvrj-acervo`. Sem
`R2_BUCKET_ACERVO` a tela abre e avisa que o acervo não está configurado.

A tabela só é lida pela equipe do workspace (RLS com `private.is_workspace_member`, que deixa de fora a equipe da escola, perfil desativado e verificação em duas etapas vencida) e só é escrita
pelas ações do servidor, com a chave de serviço, depois de conferir a permissão.

## Operação

- **"Atualizar as páginas do acervo"** refaz tudo o que está no site a partir do banco, em lotes
  que continuam de onde pararam. Usar depois de mudar o modelo das páginas ou quando uma
  publicação avisou que as páginas não foram refeitas (FTP instável). Também limpa do site o que
  ficou de um item que já é privado.
- As páginas do acervo são estáticas: nenhuma consulta ao banco quando alguém visita, e o site
  continua no ar se a Redação ou o Supabase caírem.
- O FTP só grava dentro de `/acervo/`, em caminhos de uma lista fechada (`ARQUIVO_DO_ACERVO` em
  lib/publicacao/ftp.ts), e só remove pasta vazia, nunca de forma recursiva.
- Dado pessoal (CPF, laudo, documento de aluno ou voluntário) não entra no acervo sem motivo, e
  nunca vai ao site. Foto em que apareça criança só vai ao site com autorização dos responsáveis.

## Testes

- `supabase/tests/acervo.test.sql` (pgTAP): privilégios, regras da tabela, RLS, endereço
  permanente, proteção contra apagar item público e unicidade.
- Testado de ponta a ponta em 24/09/2026 com banco local, FTP local e o R2 de verdade: foto, PDF e
  vídeo do YouTube publicados, tirados do site e publicados de novo no mesmo endereço, e as páginas
  regeradas do zero; as páginas geradas passaram no validador de SEO e nas capturas de tela em
  computador e celular.
