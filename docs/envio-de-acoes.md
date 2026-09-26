# Envio de ações pela equipe — benchmark, proposta e v1 (25/09/2026)

O pedido: um **link separado, que qualquer pessoa da equipe abre no celular**, para mandar o que
aconteceu numa ação (evento de rua, atendimento, curso, visita) com **fotos, vídeos, áudio,
arquivos e informações**. Tudo chega para o Matheus avaliar e virar post ou matéria.

## 0. Decisões do Matheus (25/09/2026) e o que a v1 entrega

| Pergunta (§7) | Decisão |
| --- | --- |
| Aberto ou com código? | **aberto**, com as proteções contra robô (§6) |
| Quem recebe o aviso | **só o Matheus** (tabela `envios_avaliadores`) |
| Transcrição do áudio por IA | **sim**, com botão, quando ele pedir (OpenAI, `OPENAI_TRANSCRIBE_MODEL`, padrão `gpt-4o-mini-transcribe`) |
| Avisar quem enviou quando virar matéria | **sim** |
| WhatsApp como segunda porta | **depois** |

**Onde está:**

| Parte | Arquivos |
| --- | --- |
| Tabelas e RLS | `supabase/migrations/20260928010000_cvrj_envios.sql` (`envios`, `envio_arquivos`, `envios_avaliadores`) |
| Regras puras | `lib/envios/regras.ts` (tipos aceitos, limites, leitura do formulário, chave no R2) |
| Página pública | `/enviar` — `app/enviar/page.tsx`, `components/enviar/` (formulário em 4 passos, gravador, envio com progresso e novas tentativas) |
| Rotas públicas | `POST /api/enviar` (cria e devolve os links de envio) e `POST /api/enviar/[id]` (`recebido`, `arquivos`, `concluir`, sempre com o token de quem enviou) |
| Caixa | `/envios` e `/envios/[id]` (grupo Comunicação, só para avaliador), `app/actions/envios.ts` |
| Cópia para a Biblioteca e aviso de publicação | `lib/envios/avaliacao.ts`; o aviso é chamado por `publicarMateria` na primeira publicação |

**Como funciona o caminho de um arquivo:** o navegador pede o envio (`/api/enviar`), recebe um link
assinado de 2 horas por arquivo e manda **direto ao R2** (`cvrj-acervo/entrada/envios/AAAA-MM/<envio>/…`,
até 2 GB), dois de cada vez, com até 4 tentativas. Depois de cada um, `recebido` confere no R2 que o
arquivo chegou **com o tamanho anunciado**; diferente, é apagado. No fim, `concluir` passa o envio
para "novo" e avisa quem avalia.

**"Criar matéria e posts"** cria a pauta (tipo Ação), a peça "Matéria editorial" ligada a ela e o
pacote multicanal com o relato e a transcrição como rascunho. Também copia **para a Biblioteca só
os arquivos marcados**, em fluxo, até 300 MB cada e dentro da cota de 1 GB, com o crédito "Nome/CVB-RJ".
A autorização vai para a Biblioteca como `authorized` se a pessoa declarou "todos autorizaram" ou
"não aparece ninguém de frente"; caso contrário, fica `pending`. "Só criar a pauta" não copia nada.

**Termo de imagem assinado (26/09/2026):** a etapa "Imagem" mostra o termo que as pessoas assinam, e
a tela de "Recebemos!" gera, para o envio com foto ou vídeo, um link e um QR code (`acao:
'autorizacao'`, com o token do envio). Cada pessoa das fotos vê as fotos do envio (servidas do R2
por link assinado de 5 minutos), marca os usos e assina com o dedo, no celular de quem enviou ou
no próprio. É o mesmo fluxo da Biblioteca (ARQUITETURA §7.17): um link por envio
(`imagem_coletas.envio_id`), válido por 30 dias. A tela do envio mostra quantas pessoas assinaram,
e quem avalia pode gerar o link se quem enviou não gerou. A declaração do remetente continua
decidindo o selo na cópia para a Biblioteca; as assinaturas são a prova, conferida antes de
"Marcar fotos como autorizadas".

**Aviso de publicação:** na primeira publicação da matéria no site, quem enviou e deixou e-mail
recebe o link. Quem só deixou WhatsApp gera um lembrete no sino do avaliador, e o botão "Avisar pelo
WhatsApp" do envio abre a conversa com a mensagem pronta.

**Pendências e limites da v1:**
- Arquivo que começou a subir e nunca foi confirmado fica em `entrada/envios/` sem uso: falta uma
  rotina de limpeza.
- O envio vai numa única requisição PUT por arquivo (sem multipart). Se a rede cair, o arquivo
  recomeça do zero, com até 4 tentativas.
- Precisa das variáveis do R2 do acervo na Vercel (`R2_BUCKET_ACERVO` e as chaves), as mesmas da
  tela Acervo. Sem elas, envio só de texto funciona e o de arquivos avisa que está fora do ar.

---

## Benchmark e proposta (o que embasou a v1)

## 1. O que a solução precisa fazer

Quem envia está na rua, no celular, com pressa e às vezes com sinal ruim. Então:

1. **Sem login e sem app:** abre um link ou lê um QR code e manda.
2. **Arquivo grande:** vídeo de celular tem de 100 MB a 1 GB. Limite de 10 MB não serve.
3. **Tudo de uma vez:** várias fotos, vídeos, áudios, PDFs e o texto, num envio só.
4. **Áudio gravado na hora**, para quem não quer digitar ("conta pra gente em 1 minuto").
5. **Rede ruim:** barra de progresso, e se cair não perde o que já foi.
6. **Pouca pergunta:** o essencial em uma tela por vez, e o resto opcional.
7. **Chega no fluxo de trabalho:** vira pauta na Redação, e não um e-mail ou uma pasta solta.
8. **Autorização de imagem:** quem envia declara se as pessoas nas fotos autorizaram (menores de
   idade sobretudo). A Redação só publica foto `authorized` (ARQUITETURA §7.4).
9. **Dados com a filial (LGPD):** rosto, voz e local de atendidos não devem morar em serviço de
   terceiro sem necessidade.
10. **Custo por envio perto de zero:** uma ação de rua pode gerar 50 envios num dia.

## 2. Benchmark

| Solução | Sem login | Tamanho por arquivo | Grava áudio na hora | Campos e texto | Chega como pauta | Custo | Observação |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Google Forms** | **não**: o campo de arquivo exige conta Google [1] | até 10 GB, mas contra a cota do Drive | não | sim | não (planilha + Drive) | grátis | a exigência de login mata o caso de uso |
| **Typeform** | sim | **10 MB, sem como aumentar** [2] | não (só o VideoAsk, da mesma empresa) | sim, uma pergunta por tela (ótimo no celular) | não | pago | o limite de 10 MB barra vídeo |
| **Tally** | sim | **10 MB no grátis**, sem limite no Pro [3] | não (sobe arquivo de áudio, não grava) | sim | não | grátis / Pro pago | o melhor formulário grátis, mas o limite barra vídeo |
| **Jotform** | sim | cota de **100 MB no total** no grátis, e 100 envios/mês [4] | **sim**, widget de gravação de voz (até 3 min) [5] | sim, completo | não | grátis limitado / pago | o mais completo em campos; a cota do grátis acaba em um evento |
| **Fillout** | sim | varia por plano [6] | não confirmado | sim, 1.000 respostas/mês no grátis | não | grátis / pago | alternativa ao Tally |
| **Dropbox – File Request** | **sim**, sem conta Dropbox [7] | **2 GB** (grátis), 50 GB (pago) | não | **não** (só nome e arquivo) | não (pasta) | grátis até a cota | ótimo para arquivo grande, sem nenhuma informação da ação |
| **WeTransfer – Request files** | **não**: quem envia precisa de conta grátis [8] | cota de 3 GB/30 dias no grátis | não | não | não | pago para uso sério | mais atrito do que o Dropbox |
| **VideoAsk** (Typeform) | sim | — | **sim**: vídeo, áudio e texto gravados no navegador [9] | poucos passos | não | 20 min/mês grátis; US$24–40/mês | a melhor experiência de "grave e mande"; cobra por minuto |
| **Kululu** (álbum de evento por QR code) | **sim**, QR code, sem app [10] | fotos e vídeos | não | só mensagem | não (álbum) | grátis até 50 envios; US$39–99 por evento | ótimo para foto de evento; é por evento, não contínuo |
| **Bynder / Brandfolder** (DAM, "external uploader") | **sim**, link sem login, com **sala de espera para aprovar** [11] | grande | não | metadados | não (fica no DAM) | caro (plataforma corporativa) | o modelo de moderação certo, no preço errado |
| **WhatsApp** (número da comunicação; *tiplines* como o Check, da Meedan [12]) | sim, é o app que todos já usam | 2 GB por mídia (limite do WhatsApp) | **sim**, áudio é o natural | texto livre, sem estrutura | não (sem integração: um celular recebendo tudo) | grátis no manual; a API oficial cobra por conversa | o menor atrito para quem envia, e o pior para organizar |

Fontes ao fim (§8).

### O que vale copiar de cada um

- **QR code impresso no crachá ou no cartaz da ação** (Kululu): ninguém precisa decorar link.
- **Gravar áudio e vídeo no próprio navegador** (VideoAsk, Jotform): "aperte e conte o que
  aconteceu".
- **Uma pergunta por tela, botão grande** (Typeform, Tally): funciona com uma mão, na rua.
- **Arquivo grande direto para o armazenamento, com progresso** (Dropbox, WeTransfer).
- **Sala de espera: tudo chega como pendente e alguém aprova** (Bynder, Brandfolder).
- **A familiaridade do WhatsApp:** a tela deve parecer tão simples quanto mandar um áudio.

### Conclusão do benchmark

**Nenhuma ferramenta pronta atende tudo.** As que aceitam vídeo grande (Dropbox) não colhem as
informações da ação. As que colhem informação (Typeform, Tally, Jotform) travam em 10–100 MB ou
cobram por envio. As que gravam áudio (VideoAsk) cobram por minuto. E **nenhuma entrega o envio
como pauta na Redação**: todas terminam numa planilha, numa pasta ou num e-mail que alguém
precisa copiar à mão, que é justamente o trabalho que a Redação existe para eliminar.

## 3. Recomendação: "Mandar uma ação", dentro da Redação

Um link público próprio, **`redacao.cruzvermelhariodejaneiro.org/enviar`**, com QR code para
imprimir, que junta o melhor do benchmark e aproveita o que a Redação já tem:

| Peça que já existe | Como entra aqui |
| --- | --- |
| Upload direto do navegador ao **R2** por link assinado, até 2 GB por arquivo (tela Acervo, `lib/armazenamento/r2.ts`, bucket `cvrj-acervo`, pasta `entrada/`) | os arquivos do envio vão para `cvrj-acervo/entrada/envios/AAAA-MM/…` — **fora da cota de 1 GB da Biblioteca**, e o R2 não cobra saída |
| Formulário público com proteção contra robô (`/participe`: campo escondido, tempo mínimo, limite por origem) | o mesmo padrão, mais um limite de envios e de bytes por IP |
| **Pautas** e o fluxo Registrar (ARQUITETURA §7.1) | o envio aprovado vira pauta do tipo **Ação** ou **Evento**, com os detalhes preenchidos |
| **Biblioteca** com autorização de imagem | só as fotos escolhidas na aprovação são copiadas para a Biblioteca, com a autorização declarada |
| `notificar()` | sino e e-mail para quem avalia, a cada envio |
| Pacote multicanal (hub) | da pauta, "criar pacote" gera a matéria e os posts |

### Custo

Zero por envio. O R2 dá 10 GB grátis por mês e não cobra transferência de saída. Acima disso,
cerca de US$ 0,015 por GB/mês. Um evento com 5 GB de vídeo custa uns R$ 0,40 por mês guardado.

## 4. Como fica para quem envia (celular, 1 a 3 minutos)

1. **Quem é você** — nome, coordenação/setor e WhatsApp. O aparelho lembra da próxima vez.
2. **O que aconteceu** — título curto ("Ação de prevenção na Central do Brasil"), data (hoje por
   padrão), local (com botão **"usar minha localização"**), e, se quiser, quantas pessoas foram
   atendidas e quais parceiros estavam.
3. **Conte do seu jeito** — escrever **ou apertar e gravar um áudio** (até 5 minutos). Os dois
   valem.
4. **Fotos, vídeos e arquivos** — escolher da galeria ou tirar na hora, vários de uma vez, cada um
   com a sua barra de progresso. Se a rede cair, tenta de novo sozinho, e o que subiu não se
   perde. Até 2 GB por arquivo.
5. **Imagem das pessoas** — "As pessoas que aparecem autorizaram o uso da imagem?" com as opções
   *sim, todas* · *não sei / não perguntei* · *tem criança ou adolescente*. Vai para cada foto e
   decide se ela pode ser publicada.
6. **Enviar** — tela de "Recebemos! Protocolo ENV-2026-0147", com a opção **"mandar mais
   arquivos para este envio"** pelo mesmo link, por 24 horas.

A tela segue a identidade da Cruz Vermelha, funciona com uma mão e não pede nada além do
essencial. Quem quer mandar só três fotos e uma frase termina em 30 segundos.

## 5. Como chega para quem avalia

- **Sino e e-mail:** "Nova ação enviada por Ana (Socorro): Prevenção na Central — 12 fotos, 2
  vídeos, 1 áudio".
- **Nova área "Envios da equipe"** (grupo Comunicação), uma caixa de entrada com os estados
  *novo · em avaliação · virou pauta · arquivado*:
  - galeria das fotos e vídeos, player do áudio e o texto;
  - mapa do local e quem mandou, com botão de **WhatsApp** para pedir mais informação;
  - **Transcrever o áudio** com IA (opcional, §7), já que a Redação usa Claude e GPT;
  - **"Virar pauta"**: cria a pauta com título, data, local, texto e transcrição, e copia para a
    Biblioteca só as fotos e vídeos escolhidos, com a autorização declarada. Dali segue o fluxo de
    sempre (pacote, matéria, redes);
  - **"Arquivar"**: some da caixa, e os arquivos continuam no R2 (acervo).
- **Quem enviou é avisado** (WhatsApp ou e-mail, se deixou) quando a ação vira matéria, com o
  link. É o que faz a equipe continuar mandando.

## 6. Segurança e abuso

- Link público, mas **sem nada a ler**: quem tem o link só envia, nunca vê o que outros mandaram.
- Contra robô: campo escondido, tempo mínimo e limite por IP (ex.: 10 envios/hora e 5 GB/dia),
  como em `/participe`.
- Tipos aceitos: imagem, vídeo, áudio, PDF e documentos do Office. Executável e arquivo compactado
  (zip) ficam de fora.
- Os arquivos entram em `entrada/envios/` como **pendentes** e nada é publicado sem passar pela
  avaliação (é a "sala de espera" do Bynder).
- **LGPD:** aviso curto na tela (o que se coleta e para quê). Os dados ficam no banco da Redação e
  no R2 da filial, sem serviço de terceiros.
- **Opção:** um código simples por coordenação ("SOCORRO26") para o link não ficar totalmente
  aberto. Na §7.

## 7. Decisões do Matheus

1. **Aberto ou com código?** Link totalmente aberto (qualquer um com o link envia) ou com um
   código simples por coordenação? *Recomendado: aberto, com as proteções da §6. Se aparecer lixo,
   liga o código.*
2. **Quem recebe o aviso:** só você, ou você e mais alguém da comunicação?
3. **Transcrição automática do áudio com IA:** sim ou não? *Recomendado: sim, com botão, só
   quando você pedir.*
4. **Avisar quem enviou quando virar matéria:** sim ou não? *Recomendado: sim.*
5. **WhatsApp como segunda porta** (fase 2): um número da comunicação cujas mensagens caem na
   mesma caixa pela API oficial do WhatsApp, que cobra por conversa. *Recomendado: primeiro o link;
   o WhatsApp só se a equipe não aderir.*

## 8. Fontes do benchmark (consultadas em 25/09/2026)

1. Google Forms exige login para arquivo — [Jotform](https://www.jotform.com/google-forms/google-form-file-upload-without-sign-in/), [FORMLOVA](https://formlova.com/en/blog/google-forms-file-upload-without-login-en)
2. Typeform, 10 MB por arquivo — [Help Center Typeform](https://help.typeform.com/hc/en-us/articles/360051567012-File-Upload-question)
3. Tally, 10 MB no grátis — [Tally](https://tally.so/help/file-uploads), [preços](https://tally.so/pricing)
4. Jotform, limites do grátis — [Jotform](https://www.jotform.com/help/408-understanding-your-account-usage-and-limits/), [preços](https://www.jotform.com/pricing/)
5. Jotform, gravador de voz — [widget](https://www.jotform.com/widgets/voice-recorder), [limite de tempo](https://www.jotform.com/answers/334733-how-can-i-limit-the-recording-time-by-using-the-voice-recorder-widget)
6. Fillout, envio de arquivos — [Help Center Fillout](https://www.fillout.com/help/file-upload)
7. Dropbox File Request, 2 GB / 50 GB — [Dropbox Help](https://help.dropbox.com/sync/upload-limitations), [guia](https://contentsnare.com/dropbox-file-request/)
8. WeTransfer, pedir arquivos exige conta — [WeTransfer Support](https://help.wetransfer.com/hc/en-us/articles/19674802507410-Request-files), [recursos](https://wetransfer.com/resources/request-files)
9. VideoAsk, planos — [VideoAsk](https://www.videoask.com/pricing), [Capterra](https://www.capterra.com/p/239248/videoask/)
10. Kululu, QR code e preços — [Kululu](https://www.kululu.com/), [análise de preços](https://blog.joinmymoment.com/kululu-pricing/)
11. Bynder, envio externo sem login e sala de espera — [Bynder Support](https://support.bynder.com/hc/en-us/articles/360013931459-Upload-Assets-As-An-External-User-External-Uploader); Brandfolder — [Brandfolder](https://brandfolder.com/resources/external-partner-collaboration/)
12. WhatsApp *tiplines* em redações — [Meedan](https://meedan.com/programs/whatsapp-3pfc), [Poynter](https://www.poynter.org/reporting-editing/2019/here-comes-a-tool-approved-by-whatsapp-to-automate-the-distribution-of-fact-checks/)
- Limites de upload do Vercel Blob (contexto da cota da Biblioteca) — [Vercel](https://vercel.com/docs/vercel-blob/client-upload)
