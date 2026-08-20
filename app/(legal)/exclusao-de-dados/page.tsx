import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Exclusão de dados — Redação Cruz Vermelha Brasileira Rio de Janeiro',
  description:
    'Como solicitar a exclusão de dados obtidos por meio das plataformas da Meta ou dos dados de acesso à Redação.',
}

/**
 * Instruções de exclusão de dados.
 *
 * A Meta exige esta URL no cadastro do app (campo "Data Deletion Instructions")
 * e a equipe de análise a acessa durante o App Review.
 */

const ATUALIZADO_EM = '18 de agosto de 2026'

export default function ExclusaoDeDadosPage() {
  return (
    <>
      <h1>Exclusão de dados</h1>
      <p className="!mt-2 !text-xs !text-muted-foreground">Última atualização: {ATUALIZADO_EM}</p>

      <p>
        Esta página explica como excluir os dados tratados pela <strong>Redação — Central de Comunicação</strong>,
        sistema interno da Cruz Vermelha Brasileira — Filial do Estado do Rio de Janeiro.
      </p>

      <h2>1. Dados obtidos do Facebook e do Instagram</h2>
      <p>
        Quando um administrador conecta uma Página do Facebook ou uma conta do Instagram, guardamos apenas o
        identificador da conta, seu nome de exibição, sua foto de perfil e um token de acesso cifrado que autoriza a
        publicação. <strong>Não coletamos dados de seguidores, curtidas, comentários ou mensagens.</strong>
      </p>

      <h3>Opção A — pela própria plataforma (imediato)</h3>
      <ol>
        <li>Entre na Redação com um perfil de administrador.</li>
        <li>Vá em <strong>Configurações → Canais de publicação</strong>.</li>
        <li>Clique em <strong>Desconectar</strong> no canal desejado e confirme.</li>
      </ol>
      <p>
        A desconexão apaga <strong>imediatamente e de forma definitiva</strong> o token de acesso e os dados da conta
        guardados por nós. Não fica cópia de backup do token.
      </p>

      <h3>Opção B — pelas configurações da Meta</h3>
      <ol>
        <li>No Facebook, acesse <strong>Configurações e privacidade → Configurações → Aplicativos e sites</strong>.</li>
        <li>Localize o aplicativo <strong>Redação Cruz Vermelha RJ</strong>.</li>
        <li>Escolha <strong>Remover</strong>.</li>
      </ol>
      <p>
        Isso revoga a autorização junto à Meta. Para apagar também o registro guardado por nós, use a Opção A ou
        escreva para o endereço do item 3.
      </p>

      <h3>Opção C — por solicitação</h3>
      <p>
        Escreva para <strong>[PREENCHER E-MAIL DO ENCARREGADO/DPO]</strong> com o assunto{' '}
        <strong>&ldquo;Exclusão de dados — Meta&rdquo;</strong>, informando o nome da Página ou o @ da conta do
        Instagram. Excluímos em até <strong>30 dias</strong> e confirmamos por e-mail.
      </p>

      <h2>2. Dados da sua conta de acesso</h2>
      <p>
        Se você é ou foi colaborador, voluntário ou prestador com acesso ao sistema e quer excluir seus dados
        pessoais (nome, usuário, cargo, foto de perfil), escreva para{' '}
        <strong>[PREENCHER E-MAIL DO ENCARREGADO/DPO]</strong> com o assunto{' '}
        <strong>&ldquo;Exclusão de dados — conta de acesso&rdquo;</strong>.
      </p>
      <p>
        Atendemos em até 15 dias, conforme a Lei nº 13.709/2018 (LGPD).
      </p>

      <h3>O que permanece após a exclusão</h3>
      <p>
        Por dever de prestação de contas institucional, mantemos o registro mínimo de autoria e de aprovação dos
        conteúdos publicados — quem criou, quem aprovou e quando. Esse registro é reduzido ao essencial e preservado
        pelo prazo descrito na <a href="/privacidade">Política de Privacidade</a>. O conteúdo institucional produzido
        no exercício da função permanece pertencendo à instituição.
      </p>

      <h2>3. Contato</h2>
      <p>
        Encarregado pelo tratamento de dados pessoais (DPO)
        <br />
        <strong>[PREENCHER NOME]</strong>
        <br />
        E-mail: <strong>[PREENCHER E-MAIL]</strong>
      </p>
      <p>
        Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD) em{' '}
        <a href="https://www.gov.br/anpd" target="_blank" rel="noreferrer">
          gov.br/anpd
        </a>
        .
      </p>
    </>
  )
}
