import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Termos de Uso — Redação Cruz Vermelha Brasileira Rio de Janeiro',
  description:
    'Condições de uso do sistema interno de gestão de conteúdo da Cruz Vermelha Brasileira — Rio de Janeiro.',
}

const ATUALIZADO_EM = '18 de agosto de 2026'

export default function TermosPage() {
  return (
    <>
      <h1>Termos de Uso</h1>
      <p className="!mt-2 !text-xs !text-muted-foreground">Última atualização: {ATUALIZADO_EM}</p>

      <h2>1. Objeto</h2>
      <p>
        Estes Termos regem o uso da <strong>Redação — Central de Comunicação</strong>, sistema interno da Cruz
        Vermelha Brasileira — Filial do Estado do Rio de Janeiro, destinado ao planejamento, produção, aprovação e
        publicação de conteúdo institucional.
      </p>
      <p>
        O acesso é <strong>restrito e nominal</strong>, concedido por um administrador a colaboradores, voluntários e
        prestadores de serviço autorizados. Não há cadastro aberto ao público.
      </p>

      <h2>2. Conta de acesso</h2>
      <ul>
        <li>A conta é pessoal e intransferível. Compartilhar credenciais é proibido.</li>
        <li>Você é responsável por tudo o que for feito com a sua conta.</li>
        <li>Suspeitando de acesso indevido, avise imediatamente um administrador.</li>
        <li>O acesso é encerrado quando cessa o vínculo com a instituição.</li>
      </ul>

      <h2>3. Perfis de permissão</h2>
      <ul>
        <li><strong>Colaborador</strong> — cria e edita conteúdo, envia para aprovação.</li>
        <li><strong>Editor</strong> — além do anterior, revisa e organiza o trabalho da equipe.</li>
        <li><strong>Administrador</strong> — gerencia pessoas, conecta canais de redes sociais e é o único perfil
          autorizado a agendar e disparar publicações.</li>
      </ul>

      <h2>4. Conteúdo e responsabilidades</h2>
      <p>Ao enviar ou produzir conteúdo na plataforma, você declara que:</p>
      <ul>
        <li>detém os direitos necessários sobre textos, imagens, vídeos e áudios, ou possui autorização expressa de
          quem os detém;</li>
        <li>obteve autorização de uso de imagem e voz das pessoas retratadas, especialmente em ações humanitárias,
          atendimentos de saúde e situações de vulnerabilidade;</li>
        <li>o material respeita a dignidade das pessoas retratadas e não as expõe de forma vexatória;</li>
        <li>o conteúdo observa os <strong>sete Princípios Fundamentais do Movimento Internacional da Cruz Vermelha e
          do Crescente Vermelho</strong> — humanidade, imparcialidade, neutralidade, independência, voluntariado,
          unidade e universalidade;</li>
        <li>o uso do emblema da cruz vermelha segue as regras de proteção previstas nas Convenções de Genebra e no
          manual de identidade institucional.</li>
      </ul>
      <p>
        A responsabilidade pelo conteúdo publicado é de quem o produz e de quem o aprova, não da ferramenta.
      </p>

      <h2>5. Publicação em redes sociais</h2>
      <p>
        A plataforma permite publicar e agendar conteúdo no Facebook e no Instagram oficiais da instituição. Sobre
        essa função:
      </p>
      <ul>
        <li>somente conteúdo <strong>previamente aprovado</strong> pode ser publicado ou agendado;</li>
        <li>a autorização é concedida pelo administrador da Página no Meta Business e pode ser revogada a qualquer
          momento, tanto na plataforma quanto diretamente nas configurações da Meta;</li>
        <li>o uso dessa função também se sujeita às políticas da Meta, incluindo os Termos de Serviço e as Diretrizes
          da Comunidade do Facebook e do Instagram;</li>
        <li>uma publicação já enviada às plataformas da Meta não pode ser desfeita pela Redação — a remoção precisa
          ser feita diretamente na rede social;</li>
        <li>agendamentos podem falhar por motivos fora do nosso controle, como indisponibilidade da Meta, expiração
          de autorização ou recusa do arquivo. A plataforma registra e avisa, mas não garante a publicação.</li>
      </ul>

      <h2>6. Uso proibido</h2>
      <p>É vedado usar a plataforma para:</p>
      <ul>
        <li>publicar conteúdo político-partidário, religioso proselitista ou que comprometa a neutralidade e a
          imparcialidade do Movimento;</li>
        <li>divulgar dados pessoais sensíveis de pessoas atendidas sem base legal adequada;</li>
        <li>publicar conteúdo falso, discriminatório, difamatório ou que viole direitos de terceiros;</li>
        <li>fins comerciais alheios à instituição;</li>
        <li>tentar acessar áreas, dados ou contas além das suas permissões.</li>
      </ul>

      <h2>7. Propriedade intelectual</h2>
      <p>
        O sistema, sua identidade visual e seu código pertencem à Cruz Vermelha RJ ou a seus licenciantes. O conteúdo
        produzido na plataforma no exercício das funções institucionais pertence à Cruz Vermelha RJ, preservados os
        direitos morais de autoria.
      </p>
      <p>
        O emblema da cruz vermelha é protegido pelas Convenções de Genebra e pela legislação brasileira. Seu uso fora
        das hipóteses autorizadas é vedado e sujeito às sanções cabíveis.
      </p>

      <h2>8. Disponibilidade</h2>
      <p>
        Trabalhamos para manter o sistema disponível, mas não garantimos funcionamento ininterrupto. Pode haver
        indisponibilidade por manutenção, atualização ou falha de fornecedores externos. Recomenda-se manter cópia
        dos materiais originais fora da plataforma.
      </p>

      <h2>9. Suspensão de acesso</h2>
      <p>
        O acesso pode ser suspenso ou encerrado, a qualquer momento e sem aviso prévio, em caso de descumprimento
        destes Termos, encerramento do vínculo institucional ou risco à segurança da informação.
      </p>

      <h2>10. Privacidade</h2>
      <p>
        O tratamento de dados pessoais é descrito na <a href="/privacidade">Política de Privacidade</a>, que integra
        estes Termos. Para excluir dados, consulte <a href="/exclusao-de-dados">Exclusão de dados</a>.
      </p>

      <h2>11. Alterações</h2>
      <p>
        Estes Termos podem ser atualizados. A data no topo indica a versão vigente, e mudanças relevantes são
        comunicadas dentro da plataforma. Continuar usando o sistema após a atualização significa concordar com a
        nova versão.
      </p>

      <h2>12. Foro</h2>
      <p>
        Aplica-se a legislação brasileira. Fica eleito o foro da Comarca da Capital do Estado do Rio de Janeiro para
        dirimir controvérsias decorrentes destes Termos.
      </p>

      <h2>13. Contato</h2>
      <p>
        Dúvidas sobre estes Termos: <strong>[PREENCHER E-MAIL DE CONTATO]</strong>
      </p>
    </>
  )
}
