import { montar, type EmailPronto } from '@/lib/contas/emails'

/**
 * Os e-mails da área do membro. Puro: só monta o texto.
 */

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome

export function emailDoCodigo(p: { nome: string; codigo: string; minutos: number; url: string }): EmailPronto {
  return montar({
    assunto: `${p.codigo} é o seu código de acesso`,
    preheader: `Use o código ${p.codigo} para entrar na Área do Voluntário.`,
    titulo: 'Seu código de acesso',
    blocos: [
      { tipo: 'p', texto: `Olá, ${primeiroNome(p.nome)}. Use este código para entrar na Área do Voluntário da Cruz Vermelha RJ:` },
      { tipo: 'destaque', texto: p.codigo },
      { tipo: 'p', texto: `Ele vale por ${p.minutos} minutos e só uma vez.` },
      { tipo: 'nota', texto: `Não pediu? Pode ignorar este e-mail: sem o código ninguém entra. Endereço da área: ${p.url}` },
    ],
  })
}

export function emailDeConvite(p: { nome: string; url: string; convidadoPor: string }): EmailPronto {
  return montar({
    assunto: 'Sua Área do Voluntário na Cruz Vermelha RJ',
    preheader: 'Cursos, certificados, oportunidades e um canal direto com a filial.',
    titulo: 'Bem-vindo à Área do Voluntário',
    blocos: [
      { tipo: 'p', texto: `Olá, ${primeiroNome(p.nome)}. ${p.convidadoPor} liberou a sua Área do Voluntário: um espaço só seu, com seus certificados, suas horas, cursos e oportunidades para atuar com a gente.` },
      { tipo: 'botao', rotulo: 'Entrar na Área do Voluntário', url: p.url },
      { tipo: 'p', texto: 'Não tem senha: na hora de entrar, você informa este e-mail e recebe um código.' },
      { tipo: 'nota', texto: 'Se você não é voluntário da Cruz Vermelha Brasileira no Rio de Janeiro, ignore esta mensagem.' },
    ],
  })
}
