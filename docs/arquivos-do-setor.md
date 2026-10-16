# Arquivos do setor: o Google Drive pelo Palácio

Uma central dentro do Palácio onde cada setor organiza as próprias pastas e arquivos. Por baixo, tudo
fica guardado no Google Drive da filial; a pessoa entra no Palácio, abre **Expediente → Arquivos do
setor** e vê só as pastas dos setores de que faz parte. Detalhes técnicos em `ARQUITETURA.md` §7.38.

| O quê | Onde |
| --- | --- |
| Tela | `/arquivos` (`app/(app)/arquivos`, `components/app/arquivos/`) |
| Quem abre | quem é do setor (Pessoas → Setores); administradores abrem todos (`arquivos.todos_os_setores`) |
| Quem liga | administradores (`arquivos.configurar`), no quadro "Ligação com o Google Drive" da mesma tela |
| Onde ficam os arquivos | no Drive da conta conectada, dentro da "pasta da filial", numa pasta por setor |

## Para ligar (uma vez)

1. **Migração.** `supabase/migrations/20261016120000_cvrj_arquivos_dos_setores.sql` precisa estar
   aplicada em produção antes do merge (é ela que cria `drive_conexao` e `drive_pastas_dos_setores`).
2. **Ativar a Google Drive API** no projeto do Google Cloud do cliente OAuth que o Palácio já usa
   (o mesmo do Gmail, cadastrado em Configurações → Integrações → Google): console.cloud.google.com →
   APIs e serviços → Biblioteca → **Google Drive API** → Ativar. Sem isso, o Google responde "API não
   ativada" e a tela mostra essa mensagem.
   - Se a tela de consentimento OAuth do projeto for do tipo **Interno** (só contas da filial), o
     escopo do Drive não precisa de verificação do Google. Se for **Externo**, o Google mostra o aviso
     de "app não verificado" na conexão; dá para seguir em "Avançado".
3. **Conectar.** Em Arquivos do setor, um administrador toca em **Conectar o Google Drive** e, no
   Google, entra com a conta da filial que é **dona das pastas** (hoje, `contato@cruzvermelhariodejaneiro.org`).
   Os arquivos ficam no Drive dessa conta, e não no de quem clicou.
4. **Escolher a pasta da filial.** No Google Drive, abra a pasta que vai guardar tudo, copie o endereço
   do navegador, cole em **Pasta da filial** e toque em **Usar esta pasta**. O Palácio confere que é uma
   pasta e que a conta pode pôr arquivos nela.
   - Deixe essa pasta com o acesso geral **Restrito** (botão direito › Compartilhar › Acesso geral). Quem
     precisa abre pelo Palácio; um link "qualquer pessoa com o link" deixaria os arquivos de todos os
     setores abertos para quem tiver o endereço.
5. **Setores.** Cada pessoa precisa estar no próprio setor em **Pessoas → Setores**. A pasta do setor nasce,
   com o nome do setor, na primeira vez que alguém dele abre a tela.
6. **"Abrir no Google" (opcional).** Ver e baixar funcionam sempre pelo Palácio. Para editar um documento
   no Google Docs com a própria conta, a pessoa precisa de acesso à pasta no Google: quando o setor tem
   um **e-mail de grupo** do Google cadastrado (Pessoas → Setores), o Palácio compartilha a pasta com esse
   grupo ao criá-la. Endereço que ainda é apelido do contato@ não é aceito pelo Google como grupo; nesse
   caso, compartilhe a pasta do setor pelo próprio Drive.

## O que dá para fazer

- Andar nas pastas, criar pasta, enviar arquivos (até 50 por vez, 5 GB cada, direto do navegador ao Google),
  ver numa aba, baixar, abrir no Google, renomear e mandar para a lixeira.
- Documento, planilha e apresentação do Google abrem em PDF em "Ver" e baixam como Word, Excel e PowerPoint.
- O que a equipe põe ou muda pelo próprio Google Drive aparece na lista ("Recarregar").

## O que não dá (ainda)

- Buscar dentro do Drive, mover entre pastas, ver ou esvaziar a lixeira pelo Palácio: a lixeira é a do
  Google Drive da conta conectada, e recupera por lá em até 30 dias.
- Renomear ou mandar para a lixeira a pasta de um setor (ela leva o nome do setor; renomeie o setor em
  Pessoas → Setores). Se alguém apagar a pasta pelo Google, o Palácio cria outra, vazia.

## Se algo der errado

| Mensagem | O que fazer |
| --- | --- |
| "O Google Drive ainda não foi ligado" | passo 3 |
| "Falta escolher a pasta da filial" | passo 4 |
| "A API do Google Drive não está ativada" | passo 2 |
| "A autorização do Google Drive expirou" | **Reconectar** no quadro da ligação; a pasta escolhida continua |
| "A conta conectada não enxerga essa pasta" | compartilhe a pasta com a conta conectada como Editor, ou conecte a conta dona |
| "Você não faz parte deste setor" | inclua a pessoa no setor em Pessoas → Setores |

Desconectar (no mesmo quadro) não apaga nada do Drive. Para revogar também do lado do Google:
myaccount.google.com/permissions, com a conta conectada.
