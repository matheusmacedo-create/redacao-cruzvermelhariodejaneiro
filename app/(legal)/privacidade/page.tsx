import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Privacidade — Redação Cruz Vermelha Brasileira Rio de Janeiro',
  description:
    'Como a Redação da Cruz Vermelha Brasileira — Rio de Janeiro trata dados pessoais e dados obtidos das plataformas da Meta.',
}

const ATUALIZADO_EM = '18 de agosto de 2026'

export default function PrivacidadePage() {
  return (
    <>
      <h1>Política de Privacidade</h1>
      <p className="!mt-2 !text-xs !text-muted-foreground">Última atualização: {ATUALIZADO_EM}</p>

      <h2>1. Quem somos</h2>
      <p>
        A <strong>Redação — Central de Comunicação</strong> é um sistema interno de uso restrito da Cruz Vermelha
        Brasileira — Filial do Estado do Rio de Janeiro (&ldquo;Cruz Vermelha RJ&rdquo;, &ldquo;nós&rdquo;), inscrita
        no CNPJ nº <strong>[PREENCHER CNPJ]</strong>, com sede em <strong>[PREENCHER ENDEREÇO COMPLETO]</strong>.
      </p>
      <p>
        O sistema serve à equipe de Comunicação para receber demandas, produzir conteúdo, submetê-lo a aprovação e
        publicá-lo nos canais oficiais da instituição. Ele <strong>não é aberto ao público</strong>: o acesso depende
        de cadastro feito por um administrador.
      </p>
      <p>
        Esta Política explica quais dados pessoais tratamos, com que finalidade e por quanto tempo, em conformidade
        com a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais — LGPD).
      </p>

      <h2>2. Quais dados tratamos</h2>

      <h3>2.1. Dados de quem usa o sistema</h3>
      <p>São dados de colaboradores, voluntários e prestadores autorizados a acessar a plataforma:</p>
      <ul>
        <li>nome completo, nome de usuário e cargo ou função;</li>
        <li>senha, armazenada apenas em forma cifrada e irreversível;</li>
        <li>foto de perfil, quando a pessoa opta por enviá-la;</li>
        <li>coordenação ou área à qual está vinculada;</li>
        <li>registros de atividade dentro do sistema — o que foi criado, editado, aprovado e publicado, com data,
          hora e autoria.</li>
      </ul>

      <h3>2.2. Conteúdo produzido pela equipe</h3>
      <p>
        Textos, pautas, imagens, vídeos, áudios e documentos enviados à Biblioteca do sistema. Esse material pode
        conter dados pessoais de terceiros — por exemplo, a imagem e o depoimento de uma pessoa atendida em uma ação
        humanitária. Nesses casos, a obtenção do consentimento ou de outra base legal adequada é responsabilidade da
        equipe que produz o conteúdo, e o sistema mantém o registro de autorização de uso de cada arquivo.
      </p>

      <h3>2.3. Dados obtidos das plataformas da Meta</h3>
      <p>
        Quando um administrador conecta uma conta do Facebook ou do Instagram, recebemos da Meta e armazenamos:
      </p>
      <ul>
        <li>o identificador e o nome da Página do Facebook;</li>
        <li>o identificador, o nome de usuário e a foto de perfil da conta do Instagram vinculada;</li>
        <li>um token de acesso que autoriza a publicação em nome dessas contas.</li>
      </ul>
      <p>
        O token é armazenado <strong>sempre em forma cifrada</strong> (AES-256-GCM), com a chave mantida separada do
        banco de dados. Nenhuma pessoa, inclusive a equipe técnica, tem acesso ao token em texto legível pela
        interface do sistema.
      </p>
      <p>
        <strong>Não coletamos</strong> dados pessoais de seguidores, de pessoas que curtem ou comentam publicações,
        nem mensagens privadas. O acesso concedido é usado exclusivamente para publicar conteúdo produzido pela
        própria instituição.
      </p>

      <h2>3. Para que usamos os dados</h2>
      <table>
        <thead>
          <tr>
            <th>Finalidade</th>
            <th>Base legal (LGPD)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Autenticar o acesso e controlar permissões</td>
            <td>Execução de contrato e legítimo interesse (art. 7º, V e IX)</td>
          </tr>
          <tr>
            <td>Registrar autoria, aprovações e histórico de publicação</td>
            <td>Legítimo interesse em auditoria e prestação de contas (art. 7º, IX)</td>
          </tr>
          <tr>
            <td>Publicar conteúdo institucional no Facebook e no Instagram</td>
            <td>Legítimo interesse na comunicação institucional (art. 7º, IX)</td>
          </tr>
          <tr>
            <td>Guardar arquivos de mídia usados nas publicações</td>
            <td>Legítimo interesse e, quando houver imagem de pessoa, consentimento (art. 7º, I e IX)</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>Não usamos dados pessoais para publicidade comportamental, venda a terceiros ou qualquer forma de
        monetização.</strong>
      </p>

      <h2>4. Com quem compartilhamos</h2>
      <p>Compartilhamos dados apenas com fornecedores necessários à operação do sistema:</p>
      <ul>
        <li><strong>Meta Platforms</strong> — recebe o conteúdo (legenda e mídia) que a equipe decide publicar, e
          apenas no momento da publicação;</li>
        <li><strong>Vercel</strong> — hospedagem da aplicação e armazenamento dos arquivos;</li>
        <li><strong>Supabase</strong> — banco de dados e autenticação.</li>
      </ul>
      <p>
        Esses fornecedores podem processar dados fora do Brasil. Nesses casos, a transferência internacional observa
        as garantias previstas nos arts. 33 e seguintes da LGPD. Não compartilhamos dados com nenhum outro terceiro,
        salvo por obrigação legal ou ordem de autoridade competente.
      </p>

      <h2>5. Como protegemos</h2>
      <ul>
        <li>acesso restrito a pessoas cadastradas, com controle por perfil de permissão;</li>
        <li>senhas armazenadas com algoritmo de hash irreversível;</li>
        <li>tokens de acesso às redes sociais cifrados em repouso;</li>
        <li>arquivos da Biblioteca mantidos em armazenamento privado, servidos apenas a usuários autenticados;</li>
        <li>quando um arquivo precisa ser entregue às plataformas da Meta para publicação, geramos um endereço
          temporário e assinado, que expira automaticamente;</li>
        <li>tráfego sempre cifrado (HTTPS) e isolamento entre os ambientes de demonstração e de produção.</li>
      </ul>

      <h2>6. Por quanto tempo guardamos</h2>
      <ul>
        <li><strong>Dados de acesso:</strong> enquanto durar o vínculo da pessoa com a instituição. Encerrado o
          vínculo, a conta é desativada e os dados são eliminados em até 90 dias, preservado o registro mínimo de
          autoria previsto no item seguinte.</li>
        <li><strong>Histórico de aprovações e publicações:</strong> mantido por 5 anos, por interesse de prestação de
          contas institucional.</li>
        <li><strong>Tokens das redes sociais:</strong> eliminados imediatamente ao desconectar o canal.</li>
        <li><strong>Arquivos da Biblioteca:</strong> até que a equipe os exclua, ou conforme prazo de autorização de
          uso de imagem.</li>
      </ul>

      <h2>7. Seus direitos</h2>
      <p>
        A LGPD garante a você o direito de confirmar a existência de tratamento, acessar seus dados, corrigi-los,
        solicitar anonimização, bloqueio ou eliminação de dados desnecessários, obter portabilidade, revogar
        consentimento e ser informado sobre compartilhamentos.
      </p>
      <p>
        Para exercer qualquer um desses direitos, escreva para <strong>[PREENCHER E-MAIL DO ENCARREGADO/DPO]</strong>.
        Respondemos em até 15 dias. Para excluir dados obtidos por meio da sua conta da Meta, veja as instruções em{' '}
        <a href="/exclusao-de-dados">Exclusão de dados</a>.
      </p>

      <h2>8. Encarregado pelo tratamento de dados</h2>
      <p>
        <strong>[PREENCHER NOME DO ENCARREGADO]</strong>
        <br />
        E-mail: <strong>[PREENCHER E-MAIL]</strong>
      </p>

      <h2>9. Alterações desta Política</h2>
      <p>
        Podemos atualizar este documento para refletir mudanças no sistema ou na legislação. A data de última
        atualização, no topo da página, sempre indica a versão vigente. Alterações relevantes são comunicadas às
        pessoas usuárias dentro da própria plataforma.
      </p>
    </>
  )
}
