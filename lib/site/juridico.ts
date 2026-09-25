import { NOME_DO_SITE, montarPaginaDoSite, escapar } from '@/lib/site/esqueleto'

/**
 * As páginas jurídicas do site: Política de Privacidade e Termos de Uso.
 *
 * O rodapé do site linka /privacidade desde o primeiro dia — e a página nunca
 * existiu: quem clicava caía num 404, num site que roda Google Analytics e
 * pixel do Facebook. A LGPD (Lei 13.709/2018) espera exatamente o contrário:
 * que quem coleta diga o que coleta, para quê, e como sair.
 *
 * O texto é dizível em voz alta de propósito. Política que precisa de
 * advogado para ler não informa ninguém — e informar é a única função dela.
 *
 * Cada fato da privacidade vem do código que coleta o dado: o checkout e as
 * doações (site/matricula-cursos-presenciais/api e site/doe/api, no
 * repositório do site), o chat (site/chat/chat.js e api/contato.php), a
 * newsletter (lib/newsletter e app/api/newsletter, aqui) e o bloco de
 * medição (lib/site/analytics.ts). Mudou o que um desses coleta, muda o texto
 * — e a data de revisão abaixo.
 *
 * Dados oficiais (os mesmos do rodapé do site):
 */
export const DADOS_DA_FILIAL = {
  nome: 'Cruz Vermelha Brasileira — Filial do Estado do Rio de Janeiro',
  cnpj: '08.560.973/0001-97',
  endereco: 'Praça da Cruz Vermelha, 10 — Centro, Rio de Janeiro/RJ, CEP 20230-130',
  email: 'contato@cruzvermelhariodejaneiro.org',
  telefone: '(21) 99992-2864',
} as const

/**
 * A data da última revisão do TEXTO das páginas jurídicas. Não é a data em
 * que a página foi regravada: regerar o site não muda a política, e "Atualizada
 * em" com a data de hoje a cada publicação diria que ela muda toda semana.
 * Mudou o texto, muda esta data.
 */
export const REVISAO_DAS_PAGINAS_JURIDICAS = new Date('2026-09-24T12:00:00-03:00')

const CSS_JURIDICO = `
.pagina-simples{max-width:var(--coluna);margin:0 auto;padding:48px 20px 72px}
.pagina-simples h1{font-size:clamp(28px,4vw,40px);line-height:1.15;letter-spacing:-.5px;margin:0 0 8px;color:var(--ink)}
.pagina-simples .atualizada{color:var(--muted);font-size:13.5px;margin:0 0 32px}
.pagina-simples h2{font-size:21px;margin:36px 0 10px;color:var(--ink)}
.pagina-simples h3{font-size:17px;margin:24px 0 6px;color:var(--ink)}
.pagina-simples p,.pagina-simples li{font-size:16.5px;line-height:1.75;color:var(--text)}
.pagina-simples ul{padding-left:22px}
.pagina-simples a{color:var(--blue)}
.bloco-dados{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:18px 22px;margin:24px 0}
.bloco-dados p{margin:4px 0;font-size:15px}
`

const dataLegivel = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(d)

function blocoDaFilial(): string {
  const f = DADOS_DA_FILIAL
  return `<div class="bloco-dados">
    <p><strong>${escapar(f.nome)}</strong></p>
    <p>CNPJ ${escapar(f.cnpj)}</p>
    <p>${escapar(f.endereco)}</p>
    <p>E-mail: <a href="mailto:${escapar(f.email)}">${escapar(f.email)}</a> · Telefone: ${escapar(f.telefone)}</p>
  </div>`
}

/** /privacidade/ — o que o site coleta, por quê, e como a pessoa manda nisso. */
export function paginaDePrivacidade(agora: Date = new Date(), chat?: string): string {
  const email = escapar(DADOS_DA_FILIAL.email)
  const corpo = `<main class="pagina-simples">
      <h1>Política de Privacidade</h1>
      <p class="atualizada">Atualizada em ${dataLegivel(REVISAO_DAS_PAGINAS_JURIDICAS)}.</p>

      <p>Esta política explica, em linguagem direta, quais dados pessoais este site trata, para que servem, com
      quem são compartilhados e como você exerce os seus direitos. Ela vale para
      <strong>cruzvermelhariodejaneiro.org</strong> e suas páginas, e segue a Lei Geral de Proteção de Dados
      (Lei nº 13.709/2018 — LGPD).</p>

      <p>A responsável pelos dados (controladora) é a filial abaixo. Para qualquer assunto de privacidade,
      escreva para <a href="mailto:${email}">${email}</a>.</p>

      ${blocoDaFilial()}

      <h2>O que coletamos, e para quê</h2>

      <h3>Matrícula em cursos presenciais</h3>
      <p>Na página de matrícula você informa nome completo, CPF, e-mail e telefone, escolhe o curso e paga a
      inscrição por PIX ou cartão. Usamos esses dados para registrar a inscrição, emitir a cobrança, enviar o
      comprovante por e-mail e para a secretaria entrar em contato, também por e-mail, para confirmar turma e
      horário.</p>
      <p>O pagamento é processado pela ÚnicoPag, a empresa de pagamentos que recebe nome, CPF, e-mail e telefone
      para gerar a cobrança. Os dados do cartão só passam pelo nosso servidor a caminho da ÚnicoPag, no momento
      do pagamento, e não são gravados: guardamos só a bandeira e os quatro últimos dígitos, que aparecem no
      comprovante.</p>
      <p>Com o pagamento confirmado, nome, CPF, e-mail e telefone seguem também para a plataforma da escola
      (escola.cursoscruzvermelha.org), quando a ligação com ela está ativa, para criar a sua matrícula e o seu
      acesso ao curso.</p>

      <h3>Doações</h3>
      <p>Na página de doação você informa nome completo, CPF, e-mail e telefone, escolhe o valor e paga por PIX
      ou cartão. São os dados de identificação que a ÚnicoPag, que processa o pagamento, exige para emitir a
      cobrança, e os que usamos para enviar o comprovante da doação por e-mail. Os dados do cartão também só
      passam pelo nosso servidor a caminho da ÚnicoPag e não são gravados (ficam só a bandeira e os quatro
      últimos dígitos).</p>
      <p>Quem marca a doação como anônima não tem o nome em agradecimentos públicos, redes sociais nem listas de
      doadores. Os dados continuam sendo pedidos, porque a cobrança e o comprovante dependem deles, e ficam só com
      a equipe que cuida das doações.</p>

      <h3>Chat “Fale com a gente”</h3>
      <p>O chat, no canto das páginas, pergunta o assunto, o curso (quando o assunto é matrícula, curso ou
      pagamento), o seu nome, o seu e-mail, um telefone (opcional) e a sua mensagem, e registra a página de onde
      você escreveu. A mensagem vai para a equipe por e-mail, você recebe uma cópia com o número de protocolo, e
      a resposta chega por e-mail. Esses dados servem só para responder ao seu contato.</p>

      <h3>Newsletter</h3>
      <p>Se você se inscreve na newsletter pela página inicial, guardamos o nome e o e-mail que você informou e o
      registro do seu consentimento: o texto que você aceitou, a data, o endereço IP e a identificação do
      navegador usados na inscrição. A inscrição só vale depois que você a confirma pelo link enviado ao seu
      e-mail (o link vale por 72 horas). Usamos o endereço só para enviar notícias, campanhas e informações sobre
      cursos, como diz o aceite.</p>
      <p>Todo envio traz um link para sair da lista, que funciona em um clique. Ao sair, você deixa de receber e
      guardamos apenas o registro de que saiu, para não ser inscrito de novo por engano. Se você pedir a
      exclusão, o registro é apagado.</p>

      <h3>Navegação: Google Analytics e Pixel da Meta</h3>
      <p>Usamos o Google Analytics para contar as visitas e saber quais páginas são lidas, e o Pixel da Meta
      (Facebook e Instagram) para medir o alcance das nossas campanhas de divulgação. As duas ferramentas usam
      cookies e identificadores no seu navegador e recebem dados da visita, como a página aberta. O Google
      Analytics está configurado para tratar como uma visita só a passagem deste site para a plataforma da escola
      (escola.cursoscruzvermelha.org). As políticas das duas empresas estão em
      <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">policies.google.com/privacy</a> e
      <a href="https://www.facebook.com/privacy/policy" target="_blank" rel="noopener">facebook.com/privacy/policy</a>.</p>
      <p>No chat, na matrícula e na doação, registramos nessas ferramentas etapas como abrir o chat, começar a
      inscrição ou concluir o pagamento, com o assunto ou o curso e o valor — nunca o nome, o CPF, o e-mail, o
      telefone ou a mensagem.</p>

      <h3>Registros de segurança e de origem</h3>
      <p>Quando você envia a matrícula, a doação ou uma mensagem pelo chat, registramos o endereço IP de onde o
      envio partiu e, se você chegou por um anúncio ou link de campanha, a origem indicada no endereço da página
      (os parâmetros utm, fbclid e gclid). O IP serve para limitar tentativas repetidas e proteger os formulários
      contra robôs; a origem, para sabermos de onde vêm as inscrições, as doações e os contatos.</p>

      <h3>Voluntariado</h3>
      <p>O cadastro de voluntários é feito no formulário do voluntariado indicado no site, que fica no serviço
      Spotform (form.spotform.com.br), e a equipe do voluntariado usa os dados informados para entrar em
      contato. O único WhatsApp da filial é o dessa equipe, (21) 97036-0264, usado só para assuntos de
      voluntariado. Os demais contatos são pelo chat e pelo e-mail.</p>

      <h2>Com quem os dados são compartilhados</h2>
      <ul>
        <li><strong>ÚnicoPag</strong>, que processa os pagamentos da matrícula e das doações: nome, CPF, e-mail e
        telefone e, no pagamento com cartão, os dados do cartão.</li>
        <li><strong>Plataforma da escola</strong> (escola.cursoscruzvermelha.org), na matrícula paga: nome, CPF,
        e-mail e telefone, para criar a matrícula e o acesso ao curso.</li>
        <li><strong>Spotform</strong>, onde fica o formulário de cadastro do voluntariado.</li>
        <li><strong>Google e Meta</strong>, pelas ferramentas de medição descritas acima.</li>
        <li><strong>Envio de e-mails</strong>: a newsletter sai pelo serviço de envio Resend; comprovantes e
        protocolos do chat também, ou, na falta dele, pelo servidor que hospeda o site.</li>
      </ul>
      <p>Não vendemos dados pessoais, a ninguém, em hipótese alguma.</p>

      <h2>O que não fazemos</h2>
      <ul>
        <li>Não pedimos dados sensíveis (como saúde, religião ou origem racial) em nenhum formulário do site.</li>
        <li>Não enviamos a newsletter a quem não confirmou a inscrição, e todo consentimento pode ser retirado.</li>
        <li>Não gravamos os dados do cartão.</li>
      </ul>

      <h2>Cookies e armazenamento no navegador</h2>
      <p>Os cookies deste site são os das ferramentas de medição citadas acima. Você pode bloqueá-los nas
      configurações do seu navegador — o site continua funcionando normalmente sem eles.</p>
      <p>O chat guarda o andamento da conversa, e as páginas de matrícula e de doação guardam a origem da visita,
      no armazenamento da sessão do navegador, que se apaga quando a aba é fechada. A página de matrícula guarda
      ainda uma marca no navegador para não contar duas vezes o mesmo pagamento nas estatísticas.</p>

      <h2>Seus direitos (art. 18 da LGPD)</h2>
      <p>Você pode pedir, a qualquer momento: a confirmação de que tratamos seus dados; o acesso a eles; a
      correção de dados incompletos, inexatos ou desatualizados; a anonimização, o bloqueio ou a eliminação de
      dados desnecessários ou excessivos; a portabilidade; a informação sobre com quem compartilhamos seus dados;
      e a revogação do consentimento, com a eliminação dos dados tratados com base nele. Basta escrever para
      <a href="mailto:${email}">${email}</a> — respondemos pelo mesmo canal. Dados ligados a pagamentos podem
      precisar ser guardados para cumprir obrigações legais mesmo depois de um pedido de exclusão. Você também
      pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).</p>

      <h2>Guarda e segurança</h2>
      <p>Os dados dos formulários ficam em sistemas com acesso restrito à equipe da filial responsável por cada
      assunto. As estatísticas de navegação ficam nas plataformas do Google e da Meta, sob as políticas delas.
      Guardamos os dados pelo tempo necessário para as finalidades desta política — responder ao contato, cumprir
      a inscrição ou a doação, enviar a newsletter enquanto você quiser recebê-la — e para cumprir obrigações
      legais.</p>

      <h2>Mudanças nesta política</h2>
      <p>Se esta política mudar, a data no topo muda junto. Mudança relevante no tratamento da newsletter é
      avisada por e-mail aos inscritos.</p>
    </main>`

  return montarPaginaDoSite({
    titulo: 'Política de Privacidade',
    // "Política de Privacidade | ..." passaria de 60 caracteres e perderia a assinatura.
    assuntoDaAba: 'Privacidade',
    descricao: `O que o site da ${NOME_DO_SITE} coleta na matrícula, na doação, no chat e na newsletter, para quê, e seus direitos pela LGPD.`,
    caminho: '/privacidade/',
    corpo,
    cssExtra: CSS_JURIDICO,
    agora,
    chat,
  })
}

/** /termos/ — as regras de uso do site e o que o conteúdo dele pode e não pode. */
export function paginaDeTermos(agora: Date = new Date(), chat?: string): string {
  const corpo = `<main class="pagina-simples">
      <h1>Termos de Uso</h1>
      <p class="atualizada">Atualizados em ${dataLegivel(REVISAO_DAS_PAGINAS_JURIDICAS)}.</p>

      <p>Este site é mantido pela filial fluminense da Cruz Vermelha Brasileira para informar sobre o seu
      trabalho humanitário, cursos e campanhas. Ao usá-lo, você concorda com o que está descrito aqui.</p>

      ${blocoDaFilial()}

      <h2>Uso do conteúdo</h2>
      <p>Os textos e notícias publicados aqui podem ser compartilhados e citados livremente, com crédito e
      link para a página original. Fotos podem retratar pessoas atendidas e voluntários: não as reutilize
      fora do contexto original sem nossa autorização por escrito.</p>

      <h2>O emblema da cruz vermelha</h2>
      <p>A cruz vermelha sobre fundo branco é um emblema protegido pelas Convenções de Genebra e pela
      legislação brasileira. Seu uso é reservado — não pode ser reproduzido em outros sites, materiais ou
      produtos sem autorização, mesmo sem fim comercial.</p>

      <h2>Doações e cursos</h2>
      <p>Doações e inscrições em cursos acontecem em páginas próprias, indicadas a partir deste site, com
      seus canais oficiais de atendimento. Desconfie de qualquer cobrança em nome da Cruz Vermelha feita
      fora dos canais oficiais — e nos avise pelo e-mail acima.</p>

      <h2>Responsabilidade</h2>
      <p>Trabalhamos para manter as informações corretas e atualizadas, mas elas têm caráter informativo.
      Links para sites de terceiros são oferecidos de boa-fé; o conteúdo deles é responsabilidade de quem
      os mantém.</p>

      <h2>Privacidade</h2>
      <p>O tratamento de dados pessoais neste site está descrito na
      <a href="/privacidade/">Política de Privacidade</a>.</p>

      <h2>Foro</h2>
      <p>Estes termos seguem a lei brasileira. Fica eleito o foro da comarca da Capital do Estado do Rio de
      Janeiro para questões relacionadas a eles.</p>
    </main>`

  return montarPaginaDoSite({
    titulo: 'Termos de Uso',
    descricao: `Regras de uso do site da ${NOME_DO_SITE}: conteúdo, emblema da cruz vermelha, doações, cursos e responsabilidade.`,
    caminho: '/termos/',
    corpo,
    cssExtra: CSS_JURIDICO,
    agora,
    chat,
  })
}
