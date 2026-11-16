---
name: redigir-materia
description: Redige ou revisa matéria do site da Cruz Vermelha RJ com a voz da casa e as regras duras de fato de lib/ia/estilo.ts — a partir de postagem de rede social, envio da equipe, nota ou rascunho já existente na Redação. Use quando pedirem para "escrever", "redigir", "gerar matéria", "transformar post em matéria", "revisar o texto", "melhorar a matéria" ou "conferir se o texto está bom".
---

# Redigir e revisar matéria do site

Esta skill tem dois modos. Escolha pelo pedido:

- **Redigir**: há material de origem (postagem do Instagram, envio da equipe, nota,
  legenda, ata) e ainda não há matéria.
- **Revisar**: já existe um rascunho (texto colado ou um `content_pieces` na Redação) e
  a pessoa quer saber se está bom ou quer a versão corrigida.

Quem pede, em geral, **não é jornalista** e não vai conseguir julgar o texto sozinho.
Por isso a skill entrega o texto pronto **e** explica, em linguagem simples, o que
precisa ser conferido por uma pessoa antes de publicar.

## 0. Leia a fonte da verdade antes de escrever

A voz e as regras moram em código, não aqui:

```bash
cat lib/ia/estilo.ts          # GUIA_DE_ESTILO e REGRAS_DURAS_DE_FATO
sed -n 140,200p lib/ia/formatos.ts   # estrutura da matéria do site (título, linha fina, corpo)
```

Se o que está escrito abaixo divergir desses arquivos, **valem os arquivos**. É o mesmo
manual que o Palácio entrega à IA quando redige pauta do Cérebro; mudou lá, muda aqui.

Leia o arquivo inteiro de `estilo.ts` toda vez. As partes mais esquecidas:

- Princípios Fundamentais: sem partido, sem culpar governo, empresa ou pessoa, sem
  propaganda de governo.
- "Pessoas afetadas/atendidas", nunca "vítimas" como rótulo; "criança e adolescente",
  nunca "menor"; nada de "combate", "linha de frente", "batalha", "tropa".
- Sem superlativo, sem exclamação, sem emoji.
- O emblema não é "logotipo" nem "marca".
- Telefone só os nacionais (190, 192, 193, 199) ou os que estão no material.

## 1. Apure o material (os dois modos)

1. **Junte o material inteiro.** Postagem do Instagram: link + legenda completa. Se só
   tiver um resumo da legenda, diga isso à pessoa e peça o texto original; resumo não é
   fonte de nome, cargo, número nem data.
2. **Separe o que é fato do material** (quem, o quê, quando, onde, números, nomes,
   cargos, citações) do que seria contexto seu. Faça essa lista por escrito antes do texto.
3. **Confira se o assunto já está no ar ou em rascunho** (só leitura):
   ```sql
   select id, title, status, site_url from content_pieces
   where workspace_id = '<id do espaço Produção>'
     and (title ~* '<palavras do assunto>' or body ~* '<palavras do assunto>');
   ```
   Matéria já publicada sobre o mesmo fato: não crie outra; diga qual é. Rascunho antigo
   do mesmo fato: avise e proponha juntar.
4. **Postagem de outro perfil** (colaboração, perfil pessoal de diretor ou parceiro): a
   matéria pode citar o fato, mas a foto só entra com autorização de quem fez.

## 2. Modo Redigir

Entregue nesta ordem, em Markdown:

1. **TÍTULO**: até 60 caracteres (o `<title>` da página corta perto disso), assunto
   principal nas primeiras palavras, específico e verdadeiro. Sem caça-clique.
2. **LINHA FINA**: uma frase de 120 a 160 caracteres que complementa o título (vai no
   Google e nas redes) e diz por que importa a quem lê.
3. **CORPO**:
   - Lide no primeiro parágrafo: o fato principal, com o que o material afirma.
   - Intertítulos com `## `; parágrafos curtos; frases curtas, voz ativa.
   - Público majoritariamente 50+, lendo no celular: palavras comuns, sigla por extenso
     na primeira vez, nada de jargão.
   - Marcação aceita: `## `, `> `, `- `, `1. `, `**negrito**`, `*itálico*`, `[texto](url)`.
     Nenhuma outra (tabela, HTML, título `#`).
   - Links internos só para páginas que existem de verdade em
     `https://cruzvermelhariodejaneiro.org/` (matérias no ar pela consulta do passo 1,
     ou páginas fixas como `/cbfi/`, `/matricula-cursos-presenciais/`). Nunca invente URL.
   - Sem preço de curso no texto (regra do Ad Grants, achado C7).
   - Matéria que nasceu de postagem termina com
     `Veja a publicação no Instagram: [instagram.com/p/CODIGO](https://www.instagram.com/p/CODIGO/)`.
   - Extensão: o que o material sustenta. Material curto vira matéria curta. Não encha.
4. **PARA CONFERIR**: um item por linha, só o que pede checagem de verdade (ação da
   filial, nomes, cargos, datas, números, direito de imagem, se vale como notícia).

### Os acréscimos de contexto

`estilo.ts` manda marcar entre ⟦ ⟧ todo contexto que não está no material.
**Atenção:** a publicação de matéria no **site** (`lib/site/publicar-materia.ts`) **não**
barra ⟦ ⟧; só a publicação nas redes barra (`lib/publicacao/variantes.ts`). Então:

- Na **versão que você mostra à pessoa** (chat ou arquivo), marque os acréscimos com ⟦ ⟧,
  para ela ver o que é apuração e o que é contexto.
- No **texto que vai para o banco**, tire os colchetes e liste cada acréscimo, com a
  frase entre aspas, no comentário PARA CONFERIR (passo 4). Se não der para justificar o
  acréscimo, apague a frase em vez de listá-la.

### O erro mais comum (aconteceu em 16/11/2026)

Afirmar que a filial agiu, ou descrever o que os voluntários fazem, sem o material
dizer. "A formação faz parte do esforço da filial de preparar voluntários" e "voluntários
que atuam em ações de saúde e emergências" pareciam inofensivas e não estavam na
legenda. Regra dura 4: se o material não diz, a matéria não diz.

## 3. Modo Revisar

1. Leia o rascunho (do banco, só leitura, ou colado).
2. Leia o material de origem, se houver (o link do Instagram costuma estar no fim).
3. Entregue um **relatório em linguagem simples**, um item por problema, nesta ordem de
   gravidade:
   1. **Fato sem fonte**: dado, nome, cargo, ação da filial que o material não traz.
   2. **Princípios e vocabulário** de `estilo.ts`.
   3. **Estrutura**: título (até 60), linha fina (120 a 160), lide, intertítulos, links
      que não existem, marcação fora da lista.
   4. **Clareza** para leitor 50+ no celular.
   Para cada item: o trecho, o problema em uma frase e a correção proposta.
4. Termine com o **veredito**: "pode publicar depois de conferir X", "precisa de nova
   apuração" ou "não vale como matéria" (e por quê).
5. Entregue a **versão corrigida inteira** logo depois, pronta para colar.

## 4. Gravar na Redação (só com pedido explícito)

O banco é um só e é produção (`AGENTS.md`, regra 2). Grave **apenas** quando a pessoa
pedir com todas as letras ("cria como rascunho", "pode salvar").

Matéria do site é uma linha em `content_pieces` do espaço Produção:

| coluna | valor |
|---|---|
| `workspace_id` | o do espaço "Produção" (`select id from workspaces where name = 'Produção'`) |
| `title` / `subtitle` / `body` | título, linha fina e corpo em Markdown |
| `format` | `'Matéria editorial'` (ou `'Advertorial'` para conteúdo de venda de curso) |
| `status` | `'draft'` |
| `responsible_id`, `created_by` | o usuário de quem pediu, conferido em `workspace_members` |
| `slug`, `site_url`, `site_published_at` | **não preencha**. Slug sem `site_url` marca matéria *arquivada* (`app/actions/site.ts`) e some da lista. O slug nasce na publicação. |

O PARA CONFERIR vai como comentário interno, para não ir ao ar junto com o texto:
`content_comments (workspace_id, content_id, author_id, body)`, com o corpo começando por
`PARA CONFERIR antes de publicar (rascunho gerado pelo Claude a partir de <fonte>):`.

Para **corrigir** rascunho existente, atualize `title`, `subtitle`, `body` e `updated_at`
da mesma linha (filtrando por `id` **e** `workspace_id`) e só se ela ainda não estiver
no ar (`site_url is null`). Matéria no ar não se edita por aqui: a edição a marca como
"editada depois da publicação" e a regeração passa a pulá-la (ARQUITETURA §7.6). Diga à
pessoa para editar pelo Palácio.

Fotos: não grave `![…]` no corpo. A foto entra pela Biblioteca, com autorização de
imagem; aponte isso no PARA CONFERIR.

## 5. Relate

Ao terminar, diga à pessoa: quantos rascunhos criou ou corrigiu, o endereço de cada um
no Palácio (`/conteudos/<id>`), o que ficou de fora e por quê, e os pontos de conferência
mais importantes. Nada foi publicado no site; publicar é decisão humana, pelo Palácio.
