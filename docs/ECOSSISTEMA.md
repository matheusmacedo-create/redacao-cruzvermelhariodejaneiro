# Os outros projetos da Cruz Vermelha e como o Palácio se liga a eles

Panorama para quem (pessoa ou agente) vai mexer aqui e precisa saber o que existe
fora deste repositório: quais são os outros projetos, o que cada um faz, o que o
Palácio combina com eles e o que quebra do outro lado quando um contrato muda.

Levantado em **23/11/2026**, lendo os sete repositórios. Cada linha diz o commit
lido; o que não foi conferido está marcado. Se você mudar um contrato descrito
aqui, atualize este arquivo no mesmo PR.

> Não confunda com [`mapa-do-ecossistema.md`](./mapa-do-ecossistema.md), que é o
> guia da **tela** `/mapa` (Gestão → Mapa do ecossistema). Aquele documenta uma
> área do Palácio; este documenta os repositórios vizinhos.

## 1. Os projetos

Todos em `github.com/matheusmacedo-create/`.

| Repositório | O que é | Onde roda | Estado em 23/11/2026 | Lido em |
| --- | --- | --- | --- | --- |
| `redacao-cruzvermelhariodejaneiro` | **Este.** Palácio Virtual, o sistema interno da filial do Rio | Vercel + Supabase | No ar | `c2d4884` |
| `cruzvermelhariodejaneiro` | Site institucional do Rio: HTML estático, PHP 8.3 e MySQL; matrícula, doação, chat, ponto da sede, cadastro de voluntários | Hostinger (hospedagem compartilhada) | No ar | `d15bdc0` |
| `cerebrocruzvermelha` | Cérebro de Notícias: observa 26 contas e fontes oficiais, pontua e sugere pautas. **Não publica** | Vercel; coleta e armazenamento na Apify | No ar | `981d69e` |
| `_cruzvermelhapetropolis` | Cópia deste Palácio para a filial de Petrópolis (raiz) e o site da filial (`pagina/`) | Site na Hostinger; Palácio ainda sem deploy | Site no ar; Palácio não | `418a0a2` |
| `cruzvermelha-filiais` | Gerador compartilhado dos sites estáticos das filiais (Itaguaí e Petrópolis), em Python | Hostinger | Em uso | `ed3a8cd` |
| `cruzvermelhaitaguai` | Versão antiga, de página única, do site de Itaguaí | Hostinger | Parece superado pelo `cruzvermelha-filiais` (§4) | `baffc0e` |
| `intranet-cruzvermelhariodejaneiro` | Só documentos de escopo da intranet; nenhum código | — | Aguardando decisões da Diretoria | `4481e75` |

Fora desses sete: a **plataforma da Escola** (`escola.cursoscruzvermelha.org`,
aplicação própria com banco próprio) e o funil do curso de Punção Venosa
(`puncaovenosa-fullautomatic`). Nenhum dos dois foi lido neste levantamento.

Diferenças que pegam quem vem daqui:

- **O Cérebro usa `npm`**, não `pnpm`, não tem banco e tem testes (`npm test`).
- **O site do Rio não tem build nem deploy automático.** Merge na `main` de lá
  não publica nada; publica-se arquivo a arquivo, com um script (§2.5).
- **Em vários repositórios o branch padrão é um `claude/...`**, não a `main`
  (intranet, filiais, Itaguaí). Confira antes de abrir PR.

## 2. Palácio ↔ site do Rio

É a ligação mais larga e a que mais quebra em silêncio: os dois lados são
publicados por caminhos diferentes, em momentos diferentes.

### 2.1 O Palácio escreve no site (FTPS)

`lib/publicacao/ftp.ts` e `lib/site/publicar-materia.ts` gravam no `public_html`
do site, só em pastas de uma lista fechada: as notícias (`/noticias/`),
`/acoes/`, `/acervo/`, `/transparencia/`, `/canais-oficiais/` e os arquivos da
trilha dentro de `/verificar/`. Também regeram o `sitemap.xml` e o `robots.txt`
do site (`lib/site/sitemap.ts`). Variáveis: `FTP_HOST`, `FTP_USER`,
`FTP_PASSWORD`, `FTP_BASE_DIR`, `SITE_PUBLIC_BASE_URL`.

O repositório do site **nunca escreve nessas pastas**: `site/noticias/` e
`site/sitemap.xml` estão no `.gitignore` de lá. O `site/robots.txt` de lá tem de
ser igual ao que `lib/site/sitemap.ts` gera.

### 2.2 O Palácio copia do site

- `lib/site/analytics.ts` traz o bloco de medição (GA4 e Pixel, atrás do
  consentimento) copiado da home do site (`site/index.html`). Mudou lá, muda
  aqui, e as matérias já publicadas só mudam ao regerar.
- `lib/site/traducoes-en.json` é cópia de `traducoes/en/mapa-hreflang.json`.

### 2.3 O site chama o Palácio

| Do site | Rota daqui | Observação |
| --- | --- | --- |
| Formulários de newsletter e pedido de material (guias em PDF) | `POST /api/newsletter/inscrever` | O site ainda chama pelo endereço antigo `redacao.cruzvermelhariodejaneiro.org` (41 ocorrências em `site/` e `scripts/`). Por isso `/api` responde nos dois domínios (`proxy.ts`, `lib/dominio.ts`): não tire isso. O texto do aceite tem de ser idêntico ao de `lib/newsletter/inscricao.ts` e `materiais.ts` |
| Página `/verificar/` (conferência de documento) | `POST /api/publico/verificar` | CORS só para a origem do site |
| Aviso de ficha de voluntariado nova | `POST /api/voluntariado/fichas-do-site` | Bearer com a chave compartilhada de §2.4 |

### 2.4 O Palácio chama o site: fichas de voluntariado

`lib/voluntariado/fichas-do-site.ts` lê e decide as fichas que o site guarda no
MySQL dele, por `api/redacao-voluntarios.php` (em
`site/matricula-cursos-presenciais/api/` de lá). A chave é a mesma dos dois
lados: aqui, `site_voluntarios` no cofre (`lib/integracoes/chaves.ts`), com
`SITE_VOLUNTARIOS_TOKEN` de reserva; lá, `REDACAO_TOKEN` em
`api/config-redacao.php`, fora do Git. Detalhes em ARQUITETURA §7.38.

### 2.5 Antes de mexer em qualquer coisa de §2.1 a §2.4

O site é publicado com `scripts/publicar_hostinger.sh`, por quem tem a credencial
temporária da Hostinger, depois de comparar com o que está no ar. **A `main` de
lá não é o que está no ar**, e o deploy daqui acontece a cada merge. Mudança de
contrato pede os dois lados combinados: primeiro o lado que aceita o formato
novo e o antigo, depois o outro.

O site não tem `AGENTS.md`. As regras dele estão no `README.md` de lá (um diário
de 394 KB: procure pelo título da seção) e, em resumo, no `CLAUDE.md` da raiz.

## 3. Palácio ↔ Cérebro

- **O Palácio lê** `GET /api/pauta` e **devolve** `POST /api/feedback` (recusa
  com motivo, `pautado`, `publicado`). Cliente em `lib/cerebro/cliente.ts`;
  contrato espelhado em `lib/cerebro/contrato.ts`. Variáveis: `CEREBRO_URL`
  (padrão `https://cerebrocruzvermelha.vercel.app`) e `CEREBRO_TOKEN`, que tem
  de ter o mesmo valor do `PAUTA_TOKEN` de lá.
- **O Cérebro lê** `GET /api/cerebro/contexto` daqui: só títulos do que foi
  publicado e das atividades Ação e Evento, janela de 60 dias. A chave é
  `CEREBRO_CONTEXTO_TOKEN` aqui e `REDACAO_CONTEXTO_TOKEN` lá.
- **A trava que não pode se perder:** `midia.podePublicar === false` no contrato
  quer dizer que aquela mídia veio só para a triagem e não entra na peça.
- **Versão do contrato:** sai de `src/core/contrato.ts` de lá. Campo novo e
  opcional sobe a menor; mudança de sentido sobe a maior, e o Palácio deve
  recusar a maior que não conhece.

Documento do outro lado: `docs/INTEGRACAO-REDACAO.md` no repositório do Cérebro.

## 4. Filiais: Petrópolis e Itaguaí

Não há integração com este Palácio. O que importa saber:

- **`_cruzvermelhapetropolis` é uma cópia deste repositório**, tirada em
  21/10/2026 e atualizada até 30/10/2026, com banco Supabase próprio. Em
  21/11/2026 este repositório estava 112 commits e 3 migrações à frente
  (`20261102180000`, `20261109120000`, `20261110100000`). Correção feita aqui
  não chega lá sozinha.
- **Armadilha conferida em 23/11/2026:** três arquivos de Petrópolis ainda
  apontam para o banco de produção **do Rio**:
  `.claude/skills/migracao/SKILL.md`, `docs/COLABORAR-COM-CLAUDE-CODE.md` e
  `.env.example`. O banco certo de lá é o do `.mcp.json` daquele repositório.
  Trabalhando em Petrópolis, não siga essas três referências.
- **Os sites das filiais** saem do `cruzvermelha-filiais`: `scripts/gerar.py`
  junta `nucleo/` com `filiais/<slug>/` e produz `dist/<slug>/`. Regra de lá:
  ao mexer no núcleo, Petrópolis tem de continuar com 0 arquivos diferentes.
- **Itaguaí tem duas fontes.** Em 23/11/2026 o site no ar respondia em
  `/quem-somos/`, página que só existe na versão do `cruzvermelha-filiais`; o
  repositório `cruzvermelhaitaguai` (último commit em 18/10/2026) parece ser a
  versão anterior. Confirme qual é a fonte antes de editar.

## 5. Intranet

Só escopo. O anexo `docs/anexos/02a-modelo-de-dados.sql` de lá foi escrito para
aplicar **sobre o banco deste Palácio**, e `docs/auditoria-publica.md` daqui
reserva fluxos "do escopo da intranet", inativos. O mapa de sistemas de lá
(`docs/01-mapa-do-ecossistema.md`) é de 01/09/2026 e descreve como lacunas
áreas que o Palácio já tem (voluntariado, RH, financeiro, portaria, escola).

## 6. O que não foi conferido

- A plataforma da Escola e o `puncaovenosa-fullautomatic` não foram lidos.
- Dos três repositórios grandes (este, o site do Rio e Petrópolis), a leitura
  foi por documentação e amostra de código, não arquivo a arquivo. As rotas,
  os arquivos e os nomes de variáveis citados em §2 e §3 foram conferidos um a
  um nos dois repositórios do Rio.
- Se a migração de Petrópolis está toda aplicada no banco de lá.
