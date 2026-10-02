# Verificação do candidato a voluntário

Como o Palácio Virtual confere **quem é** a pessoa que se inscreve no
Voluntariado antes de aprová-la, e a cada 6 meses depois disso. O que se pede,
por quê, o que é automático, o que é decisão humana, quem acessa o quê e por
quanto tempo fica guardado. Código: migração
`supabase/migrations/20261002000000_cvrj_verificacao_de_candidatos.sql`,
regras em `lib/participantes/verificacao/`, telas em
`components/app/participantes/verificacao.tsx` (coordenação) e
`app/verificacao/[token]` (candidato). Resumo técnico em ARQUITETURA §7.36.

## 1. Por que verificar

- **Lei 14.811/2024** (art. 59-A do Estatuto da Criança e do Adolescente):
  instituições sociais que atendem crianças e adolescentes e recebem recurso
  público devem exigir e manter **certidão de antecedentes criminais de todos
  os colaboradores, inclusive voluntários**, renovada **a cada 6 meses**. A
  filial atende crianças (saúde, educação, redução de riscos): a exigência vale.
- **IFRC Child Safeguarding Policy**: checagem policial nos últimos 3 anos e/ou
  duas referências para quem interage com crianças.
- **LGPD**: antecedentes são dado sensível. Bases legais: obrigação legal
  (Lei 14.811) e o termo de adesão ao voluntariado (Lei 9.608/1998). O termo
  que o candidato aceita diz a finalidade, quem acessa, o prazo de guarda, os
  direitos do titular, a leitura automatizada do documento e a transferência
  internacional (art. 33). **A decisão é sempre humana** (art. 20).

Decisão do projeto: **sem biometria facial**. Quem confere compara a foto do
crachá com a do documento a olho.

## 2. O que se pede e por quê

| Item | O que | Fonte | Automático? |
| --- | --- | --- | --- |
| **Identidade** | RG, CNH ou RNE (frente e verso, ou o PDF da CNH Digital) | O candidato envia pelo link | O Claude transcreve o impresso e compara nome, nascimento e CPF com o cadastro (o CPF só por HMAC, nunca em claro); a decisão é da coordenação |
| **Antecedentes** | Atestado da Polícia Civil do RJ (gratuito, online, vale 90 dias; "Certidão de Assentamento Criminal para Fins Civis") ou certidão da PF | O candidato emite e envia, com a data de emissão | Não (o site tem captcha). A coordenação valida o código em `certidaocacciifppcerj.detran.rj.gov.br` e marca "Conferido". Renovação em 6 meses, com aviso 15 dias antes |
| **Sanções e PEP** | CEIS, CNEP, CEAF e PEP | API de dados do Portal da Transparência (CGU), por CPF | **Sim**: "Consultar CEIS, CNEP, CEAF e PEP". Nada consta só quando as quatro bases responderam limpas; base fora do ar = "incompleto" |
| **Registro profissional** | COREN, CRM, CRP, CREFITO… quando a pessoa declara | Sites dos conselhos | Não: link + "Conferido" |
| **Referências** | Duas pessoas fora da família (nome, relação, contato) | O candidato indica; a coordenação liga | Não: "Registrar contato" (data, parecer, nota). Duas favoráveis fecham o item; uma desfavorável marca divergente |
| **Entrevista** | Presencial ou vídeo | — | Não: data e nota |

Fontes **pagas**, só documentadas, não ligadas: **Serpro Consulta CPF** (nome ×
CPF × nascimento × situação na Receita; centavos por consulta; contrato com o
CNPJ da filial), **Datavalid** (biometria facial, ~R$ 4,50), Idwall/BigDataCorp
(score opaco: ruim para a LGPD). BNMP (mandados de prisão, CNJ) exige cadastro
de quem consulta e fica como link no checklist.

## 3. Como funciona, passo a passo

1. **Pedir documentos** (ficha do candidato → "Verificação do candidato"): a
   coordenação (nível "Gerenciar") escolhe por onde mandar o link (e-mail,
   WhatsApp ou copiar). O link vale 14 dias e aceita várias visitas até a
   pessoa concluir; lembretes saem a cada 5 dias, duas vezes, trocando o token.
2. **O candidato** (`/verificacao/<token>`, celular primeiro): aceita o termo e
   confirma o CPF (cadastro sem CPF: guarda cifrado; com CPF: tem de ser o
   mesmo), manda o documento (foto reduzida no aparelho, sem EXIF), o atestado
   com a data de emissão (mais de 90 dias é recusado), o registro profissional
   e duas referências, revisa e envia. A coordenação recebe o aviso no sino.
3. **A coordenação** confere item a item. Identidade e antecedentes só por quem
   tem "Dados sensíveis" (o documento traz o CPF impresso); o resto, "Gerenciar".
   Toda abertura de arquivo, leitura, consulta e marcação fica na trilha de
   "Quem acessa".
4. **Decisão**: "Apto" exige identidade e antecedentes conferidos. "Apto com
   restrição" exige restrições da lista e motivo; sem identidade ou
   antecedentes, a restrição **"Não atua com crianças e adolescentes"** é
   obrigatória. "Não apto" exige motivo. As restrições ficam na ficha
   (`participantes.restricoes`) e no parecer.
5. **Trava**: `mudar_situacao_participante` só aprova (candidato → ativo) com a
   última verificação concluída como apto ou apto com restrição. Da lista,
   "Aprovar com restrição" abre a verificação, conclui com a restrição e aprova
   na hora, para o caso de a pessoa ser necessária antes dos documentos.
6. **Parecer em PDF** (`/api/voluntariado/[id]/verificacao/pdf`): o checklist
   com quem conferiu e quando, a decisão e as restrições, no timbrado. Documento
   interno com dados pessoais: vai para a pasta do voluntário, nunca para o site.
7. **Renovação**: a rotina diária avisa a coordenação 15 dias antes e no dia
   seguinte ao vencimento dos 6 meses; "Pedir documentos" com "Só o atestado"
   abre uma verificação de renovação.

## 4. Chave da CGU (gratuita)

1. Entre em <https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email>
   com a conta gov.br da filial (nível prata ou ouro).
2. A chave chega por e-mail. Cole em Configurações → Integrações → "Portal da
   Transparência (CGU — sanções e PEP)". Reserva: `PORTAL_TRANSPARENCIA_KEY`.
3. Limite: 90 consultas por minuto (cada verificação usa 4).

Sem a chave, o botão não aparece e a coordenação dispensa o item com o motivo.

## 5. Quem acessa o quê

| Nível | Pode |
| --- | --- |
| Ver a lista (1) | Nada da verificação (vê só o selo de restrição na ficha) |
| Gerenciar (2) | Pedir documentos, ver o checklist, consultar a CGU, registrar referências, registro profissional, entrevista, decidir, gerar o parecer, anexar e abrir comprovante e registro profissional |
| Dados sensíveis (3) | Tudo acima, mais abrir documento com foto e atestado, ler o documento com o Claude e marcar identidade e antecedentes |

Os arquivos ficam no bucket privado `voluntarios-arquivos`, sem política para
quem está logado: só o servidor abre, depois de o banco conferir o nível e
registrar a abertura (link assinado de 1 minuto). O hash do link e o caminho no
Storage nunca saem pela API.

## 6. Retenção e direitos

- Inscrição **recusada**: cadastro e documentos apagados na hora.
- **Anonimização** (LGPD): referências apagadas; leitura, sanções, registro e
  motivo zerados; arquivos marcados como excluídos e apagados do Storage. Fica
  só o parecer, sem identificar ninguém.
- **Prazo de guarda** declarado no termo: enquanto a pessoa for voluntária e por
  5 anos depois, para comprovar o cumprimento da lei. *(Prazo proposto; a
  confirmar com quem responde pela LGPD e a Diretoria antes da primeira
  verificação real.)*
- Pedidos de acesso, correção ou eliminação: pelo e-mail do Voluntariado,
  tratados na ficha ("Apagar dados (LGPD)").

## 7. Leitura automatizada (Claude)

- Só os arquivos de "documento com foto" (até 3) vão para a Anthropic, como
  imagem JPEG reduzida (≤ 2000 px, sem EXIF) ou PDF (≤ 10 MB).
- O modelo transcreve os campos impressos num JSON fixo. Instrução: não
  descrever a pessoa nem o rosto, não opinar sobre autenticidade, não completar
  o que não estiver legível.
- O que fica guardado (`participantes_verificacoes.documento_lido`): tipo, nome,
  nascimento, número **mascarado**, órgão, UF, validade e a comparação com o
  cadastro. **O CPF transcrito nunca é guardado**: vira só "confere/diverge"
  por HMAC (`cpf_confere`).
- Sem chave da Anthropic, o botão some e a coordenação compara à mão.
- *(A frase do termo sobre não uso para treinamento segue a política de dados
  da API da Anthropic; confirmar a redação com quem responde pela LGPD.)*

## 8. Como ligar o Serpro depois

1. Contratar "Consulta CPF" na Loja Serpro com o CNPJ da filial; guardar
   consumer key e secret.
2. Em `lib/integracoes/chaves.ts`, descomentar a entrada `serpro` (já escrita).
3. Criar `lib/participantes/verificacao/serpro.ts` com `consultarCpf(credenciais,
   cpf)` → nome, nascimento e situação cadastral; comparar com o cadastro como
   em `compararComCadastro`.
4. Na action `lerDocumentoDoCandidato` (ou numa nova), gravar o resultado em
   `documento_lido.receita` e mostrar na tabela de comparação.
5. Atualizar o termo (versão nova em `VERIFICACAO_TERMO_VERSAO`) citando a
   consulta à Receita.

## 9. Testes

- `npx tsx scripts/conferir-verificacao.ts`: prazos, nomes, CGU, trava, decisão,
  chip, formulários e textos.
- `supabase/tests/verificacao.test.sql` (pgTAP, banco local): privilégios,
  link, termo e CPF, arquivos, referências, níveis, trava, decisão,
  anonimização e recusa.
