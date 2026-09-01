import { montarPaginaDoSite, escapar } from '@/lib/site/esqueleto'

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
 * Dados oficiais (os mesmos do rodapé do site):
 */
export const DADOS_DA_FILIAL = {
  nome: 'Cruz Vermelha Brasileira — Filial do Estado do Rio de Janeiro',
  cnpj: '08.560.973/0001-97',
  endereco: 'Praça Cruz Vermelha, 10 — Centro, Rio de Janeiro/RJ, CEP 20230-130',
  email: 'contato@cruzvermelhariodejaneiro.org',
  telefone: '(21) 99992-2864',
} as const

const CSS_JURIDICO = `
.pagina-simples{max-width:var(--coluna);margin:0 auto;padding:48px 20px 72px}
.pagina-simples h1{font-size:clamp(28px,4vw,40px);line-height:1.15;letter-spacing:-.5px;margin:0 0 8px;color:var(--ink)}
.pagina-simples .atualizada{color:var(--muted);font-size:13.5px;margin:0 0 32px}
.pagina-simples h2{font-size:21px;margin:36px 0 10px;color:var(--ink)}
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
export function paginaDePrivacidade(agora: Date = new Date()): string {
  const corpo = `<main class="pagina-simples">
      <h1>Política de Privacidade</h1>
      <p class="atualizada">Atualizada em ${dataLegivel(agora)}.</p>

      <p>Esta política explica, em linguagem direta, o que este site coleta sobre você, para que serve e o que
      você pode fazer a respeito. Ela vale para <strong>cruzvermelhariodejaneiro.org</strong> e suas páginas,
      e segue a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).</p>

      ${blocoDaFilial()}

      <h2>O que coletamos, e por quê</h2>
      <ul>
        <li><strong>Estatísticas de navegação.</strong> Usamos o Google Analytics para saber quantas pessoas
        visitam as páginas, de onde vêm e o que leem. Esses dados chegam a nós de forma agregada — vemos
        números, não pessoas. O Google pode usar cookies para isso; a política dele está em
        <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">policies.google.com/privacy</a>.</li>
        <li><strong>Medição de campanhas.</strong> Usamos o pixel da Meta (Facebook) para saber se nossas
        campanhas de divulgação alcançam quem se interessa pelo nosso trabalho. A política da Meta está em
        <a href="https://www.facebook.com/privacy/policy" target="_blank" rel="noopener">facebook.com/privacy/policy</a>.</li>
        <li><strong>Newsletter.</strong> Se você se inscrever, guardamos o e-mail e o nome que você mesmo
        informou, com a data e o registro do seu consentimento. Usamos só para enviar as nossas notícias —
        nunca vendemos nem cedemos a lista. A inscrição exige confirmação pelo próprio e-mail, e todo envio
        traz um link de descadastro que funciona em um clique.</li>
        <li><strong>Contato.</strong> Se você escreve para o nosso e-mail ou WhatsApp, usamos o que você
        enviou para responder — e para nada além disso.</li>
      </ul>

      <h2>O que não fazemos</h2>
      <ul>
        <li>Não vendemos dados pessoais, a ninguém, em hipótese alguma.</li>
        <li>Não enviamos e-mail sem consentimento, e todo consentimento pode ser retirado.</li>
        <li>Não pedimos dados sensíveis pelo site.</li>
      </ul>

      <h2>Cookies</h2>
      <p>Os cookies deste site são os das ferramentas de medição citadas acima. Você pode bloqueá-los nas
      configurações do seu navegador — o site continua funcionando normalmente sem eles.</p>

      <h2>Seus direitos (art. 18 da LGPD)</h2>
      <p>Você pode pedir, a qualquer momento: confirmação de que tratamos seus dados, acesso a eles,
      correção, anonimização ou exclusão, e a revogação de qualquer consentimento. Basta escrever para
      <a href="mailto:${escapar(DADOS_DA_FILIAL.email)}">${escapar(DADOS_DA_FILIAL.email)}</a> — respondemos
      pelo mesmo canal, sem burocracia. No caso da newsletter, a exclusão apaga o registro de verdade, não
      apenas o marca.</p>

      <h2>Guarda e segurança</h2>
      <p>Os dados da newsletter ficam em servidores com acesso restrito à equipe de comunicação da filial.
      Estatísticas de navegação ficam nas plataformas do Google e da Meta, sob as políticas delas.
      Guardamos os dados apenas enquanto servem à finalidade desta política.</p>

      <h2>Mudanças nesta política</h2>
      <p>Se esta política mudar, a data no topo muda junto. Alteração relevante no tratamento da newsletter
      é avisada por e-mail aos inscritos.</p>
    </main>`

  return montarPaginaDoSite({
    titulo: 'Política de Privacidade',
    descricao: 'O que o site da Cruz Vermelha Brasileira — Rio de Janeiro coleta, para quê, e como exercer seus direitos pela LGPD.',
    caminho: '/privacidade/',
    corpo,
    cssExtra: CSS_JURIDICO,
    agora,
  })
}

/** /termos/ — as regras de uso do site e o que o conteúdo dele pode e não pode. */
export function paginaDeTermos(agora: Date = new Date()): string {
  const corpo = `<main class="pagina-simples">
      <h1>Termos de Uso</h1>
      <p class="atualizada">Atualizados em ${dataLegivel(agora)}.</p>

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
    descricao: 'Regras de uso do site da Cruz Vermelha Brasileira — Rio de Janeiro: conteúdo, emblema, doações e responsabilidade.',
    caminho: '/termos/',
    corpo,
    cssExtra: CSS_JURIDICO,
    agora,
  })
}
