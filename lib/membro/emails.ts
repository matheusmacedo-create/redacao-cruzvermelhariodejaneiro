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

export function emailDeInscricao(p: { nome: string; titulo: string; quando: string; local: string | null; espera: boolean; url: string }): EmailPronto {
  return montar({
    assunto: p.espera ? `Lista de espera: ${p.titulo}` : `Inscrição confirmada: ${p.titulo}`,
    preheader: `${p.quando}${p.local ? ` · ${p.local}` : ''}`,
    titulo: p.espera ? 'Você está na lista de espera' : 'Inscrição confirmada',
    blocos: [
      { tipo: 'p', texto: p.espera
        ? `Olá, ${primeiroNome(p.nome)}. As vagas de "${p.titulo}" estão preenchidas e você entrou na lista de espera. Se alguém cancelar, você sobe automaticamente — confira na Área do Voluntário.`
        : `Olá, ${primeiroNome(p.nome)}. Sua inscrição em "${p.titulo}" está confirmada. Obrigado por estar com a gente!` },
      { tipo: 'destaque', texto: [p.quando, p.local].filter(Boolean).join(' · ') },
      { tipo: 'botao', rotulo: 'Ver na Área do Voluntário', url: p.url },
      { tipo: 'nota', texto: 'Não vai poder ir? Cancele pela Área do Voluntário para liberar a vaga para outra pessoa.' },
    ],
  })
}

export function emailDeCancelamento(p: { nome: string; titulo: string; quando: string; motivo: string; url: string }): EmailPronto {
  return montar({
    assunto: `Cancelada: ${p.titulo}`,
    preheader: `A atividade de ${p.quando} foi cancelada.`,
    titulo: 'Atividade cancelada',
    blocos: [
      { tipo: 'p', texto: `Olá, ${primeiroNome(p.nome)}. A coordenação cancelou "${p.titulo}" (${p.quando}), em que você estava inscrito.` },
      { tipo: 'destaque', texto: p.motivo },
      { tipo: 'botao', rotulo: 'Ver outras oportunidades', url: p.url },
    ],
  })
}

export function emailDeResposta(p: { nome: string; assunto: string; resposta: string; respondidoPor: string; url: string }): EmailPronto {
  return montar({
    assunto: `Resposta: ${p.assunto}`,
    preheader: p.resposta.slice(0, 120),
    titulo: 'A coordenação respondeu',
    blocos: [
      { tipo: 'p', texto: `Olá, ${primeiroNome(p.nome)}. ${p.respondidoPor} respondeu à sua mensagem "${p.assunto}":` },
      { tipo: 'destaque', texto: p.resposta.length > 600 ? `${p.resposta.slice(0, 600)}…` : p.resposta },
      { tipo: 'botao', rotulo: 'Ver a conversa', url: p.url },
      { tipo: 'nota', texto: 'Para responder, use a Área do Voluntário — respostas a este e-mail não chegam à conversa.' },
    ],
  })
}
