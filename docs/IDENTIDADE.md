# Identidade institucional no Palácio Virtual

Base: **Manual de Identidade Institucional da Cruz Vermelha Brasileira**
(Departamento Nacional de Comunicação Social, out/2016, 52 páginas), enviado
pelo Matheus em 27/09/2026.

> **Os contatos do manual estão desatualizados** (endereços, telefones, site,
> CNPJ do Órgão Central). Nunca os copie. Os dados da filial moram em
> `DADOS_DA_FILIAL` (`lib/site/juridico.ts`). Do manual vale o **desenho**: as
> regras do emblema, a cor, a tipografia e os modelos das peças.

## 1. O que o manual define

| Tema | Regra | Página |
| --- | --- | --- |
| Emblema | Cinco quadrados iguais; o módulo "X" é o lado de um quadrado. | 12 |
| Logotipo | Emblema + "Cruz Vermelha Brasileira" em Franklin Gothic Demi Cond; área de proteção de 1X. | 13–14 |
| Cor | Vermelho CMYK 0/100/100/0 · RGB 227/34/25 · Pantone 485. | 15 |
| Tipografia | Franklin Gothic **Demi Cond** (logotipo, títulos), **Book** (texto, nome da filial), Book Italic (legenda). | 16 |
| Aplicação | Só as três variações de cor; nunca preto e branco em digital; mínimo de 7 mm; sobre foto ou cor, o logo vai numa **caixa branca** com corredor de 1X. | 17–20 |
| Filiais | O nome da filial (Franklin Book, maiúsculas, ~3/4 do módulo) só na **papelaria**; nas outras peças, só o logotipo da CVB. | 21 |
| Outras marcas | Com FICV, CICV e outras Sociedades Nacionais: composição hierárquica e **autorização expressa**. | 22 |
| Papelaria | Timbrado A4 com margens de 17 e 14 mm, logo com 17 mm, "Reconhecida como Utilidade Pública Internacional – Decreto nº 9.620, de 13/06/1912" no alto à direita (Book 8), setor em Demi Cond 18 e rodapé em Book 8. Envelopes e cartão pessoal (90 × 50 mm). | 24–27 |
| Crachá funcional | Frente: logo, foto, faixa vermelha com o nome, função, órgão e CNPJ. Verso: nome, CPF, admissão, fator RH, "COLABORADOR VOLUNTÁRIO" (para quem não tem vínculo empregatício), "válido em todo o território nacional", decreto, endereço e o texto de credenciamento. | 28 |
| Diploma e certificado | Diploma de Reconhecimento (A3) e Certificado (A4 paisagem): moldura marrom, título em caligrafia, nome em itálico, assinatura da presidência. | 29 |
| Bandeira, banner, slides | Modelos de capa, conteúdo e encerramento. | 30–32 |
| Trajes, uniformes, veículos | Onde e em que tamanho vai o emblema; colete com bolso transparente para o crachá. | 33–42 |
| Mídias sociais | 12 regras: legalidade, uma página por filial, respeito, honestidade, reciprocidade, consequência (análise prévia), debate, regularidade (texto com começo, meio e fim), perfil (pessoa física não usa o emblema, fora de campanhas), texto técnico e com fonte, grupos, segurança. | 47–48 |
| Princípios Fundamentais | Humanidade, Imparcialidade, Neutralidade, Independência, Voluntariado, Unidade, Universalidade. | 52 |

## 2. O que já está no app

- **Cor:** `--primary` é `rgb(227 34 25)`, o vermelho do manual.
- **Tipografia:** o app usa **Libre Franklin**, a Franklin Gothic redesenhada e livre.
- **Logo:** `public/images/logo-cvrj.png` é a composição oficial da filial (p. 21). A Área do Voluntário proíbe cruz desenhada, recortada ou em marca-d'água (`components/membro/marca.tsx`), o que está de acordo com o uso indicativo (p. 47).

## 3. Feito em 27/09/2026

1. **Crachá virtual** (p. 28), no perfil dos colaboradores (`/perfil`) e dos
   voluntários (`/membro/perfil`), com PDF de frente e verso no tamanho de
   crachá (54 × 85,6 mm) e QR para `/cracha/<código>`. A verificação diz se a
   pessoa está ativa e mostra a foto, sem CPF, saúde ou contato. O fator RH
   aparece só no crachá da própria pessoa (migração `20260929030000`). Código
   em `lib/cracha/`, peça em `components/cracha/cracha.tsx`.
2. **Certificado no modelo oficial** (p. 29): `lib/cursos/certificado-pdf.ts`,
   com o código e o QR de verificação que já existiam. A assinatura é
   tipográfica: o nome da presidência (`lib/equipe.ts`) em caligrafia, como
   no modelo.
3. **Fontes da identidade para PDF** (`lib/pdf/fontes/`, SIL OFL):
   - Libre Franklin, equivalente à Franklin Gothic Book;
   - Barlow Condensed, equivalente à Demi Cond;
   - Great Vibes, para a caligrafia do certificado.

   `lib/pdf/fontes.ts` embute as fontes. `lib/pdf/desenho.ts` reúne QR vetorial, quebra de linha e foto recortada.
4. **Diploma de Reconhecimento** (p. 29, A3): `lib/cursos/diploma-pdf.ts`.
   - Sai sozinho aos 100, 500 e 1.000 horas de voluntariado.
   - A coordenação também concede, no cadastro do voluntário.
   - Tem código e QR de verificação pública (`/diploma/<código>`).
   - Aparece em “Certificados”, na Área do Voluntário.
5. **Foto do crachá do voluntário com aprovação do Voluntariado** (migração
   `20260929050000`). A fila de aprovação fica em Voluntários → “Fotos do crachá”.
6. **Verificação do crachá refeita para a portaria**: resultado grande e
   colorido, relógio correndo e foto grande.
7. **Cartaz do link de envios** (`/envios/cartaz`) na identidade: títulos em
   Barlow Condensed (Demi Cond), texto em Libre Franklin, o vermelho do
   manual e o nome completo da filial em toda peça. No modelo "Destaque" (fundo
   vermelho), a logo e o QR vão em caixa branca (pp. 17–20). Formatos A4,
   story, feed e quadrado, em PNG.

## 4. O que dá para incrementar (proposta, por prioridade)

### Rápido e visível

1. ~~Diploma de Reconhecimento~~: feito (item 4 da seção 3).
2. **Papel timbrado no padrão (p. 24).** Hoje os ofícios e as folhas (recibos
   e termos do Patrimônio, relatório de Compras) usam Times e Helvetica, com
   margens próprias. A proposta é alinhar ao manual:
   - margens de 17 e 14 mm;
   - a linha "Reconhecida como Utilidade Pública Internacional – Decreto nº 9.620, de 13/06/1912" no alto à direita;
   - o setor em Demi Cond;
   - o rodapé com os dados atuais da filial;
   - as fontes de `lib/pdf/fontes.ts`.
3. **Cartão pessoal digital (p. 27).** Um cartão de visita de 90 × 50 mm, com
   QR de vCard, para cada pessoa da equipe, gerado a partir do Diretório. Serve
   para imprimir ou mandar por WhatsApp.
4. **Assinatura de e-mail no padrão.** No "E-mail do setor", gerar a
   assinatura de cada pessoa ou setor com logo, nome, setor e contato atual,
   em vez de depender da assinatura montada à mão no Gmail.

### Comunicação e redes (o coração do Palácio)

5. **As 12 regras de mídias sociais (p. 48) no fluxo de publicação.** Um
   lembrete no pacote, antes de mandar para aprovação, com os itens que dá
   para conferir:
   - o texto tem começo, meio e fim?
   - cita a fonte?
   - usa linguagem técnica e impessoal?
   - envolve a marca de outra instituição do Movimento? Se sim, precisa de autorização (p. 22).

   A regra da "Consequência", que pede análise prévia, já é o que Aprovações faz.
6. **Guia de marca dentro do app.** Uma página "Identidade" na Central de
   ajuda, com a cor, as fontes, o logo para baixar (versões permitidas), as
   regras de aplicação (caixa branca sobre foto, mínimo de 7 mm, nada de preto
   e branco em digital) e o que é proibido. Assim quem produz arte não precisa
   do PDF de 14 MB.
7. **Modelos de slides (p. 32).** Capa, conteúdo e encerramento para as apresentações da filial, prontos para baixar.

### Voluntariado e formação

8. **Os 7 Princípios Fundamentais (p. 52).**
   - Um bloco fixo na Área do Voluntário.
   - Um curso curto, "Princípios e uso do emblema", como formação de entrada,
     com certificado. Ele usaria o motor de cursos existente.
   - A regra 9 das mídias sociais (quem é da filial não usa o emblema no
     perfil pessoal, fora de campanhas), explicada no termo e na ajuda do voluntário.
9. **Uniformes e coletes (pp. 33–38).** Pedido e entrega de colete e uniforme
   pelo Estoque (kits por tamanho), com o registro de quem está com o quê. O
   colete tem bolso transparente para o crachá, que agora sai impresso do app.

### Patrimônio e transparência

10. **Veículos (pp. 40–42).** Um item "identificação visual conforme o
    manual" na ficha do veículo da Frota, com foto.
11. **Uso do emblema, na página pública.** Nos Canais oficiais, as leis do
    anexo (Lei 3.960/1961 e Decreto 2.380/1910) e o caminho para denunciar uso
    indevido do nome e do emblema, contra golpes.

### Decisão pendente

- **Logo com "Rio de Janeiro" fora da papelaria.** O manual pede que o nome da
  filial apareça só na papelaria. O app, a Área do Voluntário e o site usam a
  composição com "RIO DE JANEIRO" em tudo. Para uma ferramenta interna da
  filial isso faz sentido, mas nas peças de redes sociais a regra do manual
  vale. Manter como está ou separar por tipo de peça? É decisão da Comunicação.

## 5. Como manter

- **Crachá e certificado:** `npx tsx scripts/conferir-cracha.ts [pasta]`
  confere as regras do crachá. Com uma pasta, grava ali um crachá e um
  certificado de exemplo em PDF, para olhar antes de mudar o desenho.
- **Fontes novas:** entram em `lib/pdf/fontes/`, com a licença ao lado, e em
  `ARQUIVOS` (`lib/pdf/fontes.ts`). Rota nova que gera PDF com elas vai para
  `outputFileTracingIncludes` (`next.config.mjs`); sem isso, a Vercel não
  leva o arquivo e o PDF sai com a fonte padrão.
- **Dados da filial:** só `DADOS_DA_FILIAL`. Nunca os contatos do manual.
