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

export function emailDeBoasVindas(p: { nome: string; url: string }): EmailPronto {
  return montar({
    assunto: 'Sua inscrição de voluntário foi aprovada',
    preheader: 'Bem-vindo à Cruz Vermelha RJ. Sua Área do Voluntário já está liberada.',
    titulo: 'Bem-vindo ao Voluntariado',
    blocos: [
      { tipo: 'p', texto: `Olá, ${primeiroNome(p.nome)}. A coordenação aprovou sua inscrição: agora você faz parte do Voluntariado da Cruz Vermelha Brasileira no Rio de Janeiro.` },
      { tipo: 'p', texto: 'Na sua Área do Voluntário você encontra cursos e apostilas, certificados, as próximas ações para se inscrever e um canal direto com a coordenação.' },
      { tipo: 'botao', rotulo: 'Entrar na Área do Voluntário', url: p.url },
      { tipo: 'nota', texto: 'Não tem senha: na hora de entrar, você informa este e-mail e recebe um código.' },
    ],
  })
}

export function emailDeVagaLiberada(p: { nome: string; titulo: string; quando: string; local: string | null; url: string }): EmailPronto {
  return montar({
    assunto: `Abriu uma vaga: ${p.titulo}`,
    preheader: `Você saiu da lista de espera e está inscrito. ${p.quando}`,
    titulo: 'Você conseguiu a vaga',
    blocos: [
      { tipo: 'p', texto: `Olá, ${primeiroNome(p.nome)}. Uma vaga abriu em "${p.titulo}" e você, que estava na lista de espera, agora está inscrito.` },
      { tipo: 'destaque', texto: [p.quando, p.local].filter(Boolean).join(' · ') },
      { tipo: 'botao', rotulo: 'Ver na Área do Voluntário', url: p.url },
      { tipo: 'nota', texto: 'Não vai poder ir? Cancele pela Área do Voluntário para a vaga seguir para a próxima pessoa.' },
    ],
  })
}

export function emailDeCertificado(p: { nome: string; curso: string; codigo: string; urlPdf: string; urlVerificacao: string }): EmailPronto {
  return montar({
    assunto: `Seu certificado: ${p.curso}`,
    preheader: 'Parabéns pela conclusão! O certificado já está na sua Área do Voluntário.',
    titulo: 'Parabéns pela conclusão',
    blocos: [
      { tipo: 'p', texto: `Olá, ${primeiroNome(p.nome)}. Você concluiu "${p.curso}" e o seu certificado já está pronto — e registrado nas suas formações.` },
      { tipo: 'destaque', texto: `Código de verificação: ${p.codigo}` },
      { tipo: 'botao', rotulo: 'Baixar o certificado', url: p.urlPdf },
      { tipo: 'nota', texto: `Qualquer pessoa pode conferir a autenticidade em ${p.urlVerificacao}` },
    ],
  })
}

export function emailDeLembrete(p: { nome: string; titulo: string; quando: string; local: string | null; descricao: string | null; url: string }): EmailPronto {
  return montar({
    assunto: `Amanhã: ${p.titulo}`,
    preheader: `${p.quando}${p.local ? ` · ${p.local}` : ''}`,
    titulo: 'Lembrete: é amanhã',
    blocos: [
      { tipo: 'p', texto: `Olá, ${primeiroNome(p.nome)}. Passando para lembrar da sua inscrição em "${p.titulo}".` },
      { tipo: 'destaque', texto: [p.quando, p.local].filter(Boolean).join(' · ') },
      ...(p.descricao ? [{ tipo: 'p' as const, texto: p.descricao.length > 500 ? `${p.descricao.slice(0, 500)}…` : p.descricao }] : []),
      { tipo: 'botao', rotulo: 'Ver detalhes', url: p.url },
      { tipo: 'nota', texto: 'Imprevisto? Cancele pela Área do Voluntário para liberar a vaga.' },
    ],
  })
}

export function emailDeAvisoGeral(p: { nome: string; titulo: string; texto: string; url: string; urlSair: string }): EmailPronto {
  return montar({
    assunto: p.titulo,
    preheader: p.texto.slice(0, 120),
    titulo: p.titulo,
    blocos: [
      { tipo: 'p', texto: `Olá, ${primeiroNome(p.nome)}.` },
      ...p.texto.split(/\n{2,}/).map((t) => ({ tipo: 'p' as const, texto: t.trim() })).filter((b) => b.texto),
      { tipo: 'botao', rotulo: 'Abrir a Área do Voluntário', url: p.url },
      { tipo: 'nota', texto: `Você recebe os avisos da coordenação do Voluntariado da Cruz Vermelha RJ. Para não receber mais por e-mail: ${p.urlSair}` },
    ],
  })
}

export function emailDeBemEntregue(p: { nome: string; bem: string; plaqueta: string; url: string }): EmailPronto {
  return montar({
    assunto: `Termo de responsabilidade: ${p.bem}`,
    preheader: 'Um bem da filial foi entregue a você. Confira e aceite o termo.',
    titulo: 'Um bem da filial está com você',
    blocos: [
      { tipo: 'p', texto: `Olá, ${primeiroNome(p.nome)}. A coordenação registrou a entrega de ${p.bem} (patrimônio ${p.plaqueta}) sob a sua responsabilidade.` },
      { tipo: 'p', texto: 'Confira os dados e aceite o termo de responsabilidade na sua Área do Voluntário. Se não recebeu este bem, responda a coordenação pelo canal direto.' },
      { tipo: 'botao', rotulo: 'Ver e aceitar o termo', url: p.url },
    ],
  })
}

export function emailDaFotoDoCracha(p: { nome: string; aprovada: boolean; motivo: string | null; url: string }): EmailPronto {
  return p.aprovada
    ? montar({
      assunto: 'Sua foto do crachá foi aprovada',
      preheader: 'Seu crachá virtual já está com a foto.',
      titulo: 'Foto aprovada',
      blocos: [
        { tipo: 'p', texto: `Olá, ${primeiroNome(p.nome)}. O Voluntariado aprovou a sua foto: ela já está no seu crachá virtual e na verificação do QR.` },
        { tipo: 'botao', rotulo: 'Ver meu crachá', url: p.url },
      ],
    })
    : montar({
      assunto: 'Envie outra foto para o seu crachá',
      preheader: 'O Voluntariado não aprovou a foto enviada.',
      titulo: 'Foto não aprovada',
      blocos: [
        { tipo: 'p', texto: `Olá, ${primeiroNome(p.nome)}. O Voluntariado não aprovou a foto que você enviou para o crachá${p.motivo ? `: “${p.motivo.replace(/[.!]+$/, '')}”.` : '.'}` },
        { tipo: 'p', texto: 'Envie uma foto de rosto, de frente, com boa luz e sem óculos escuros. Enquanto isso, o crachá sai sem foto.' },
        { tipo: 'botao', rotulo: 'Enviar outra foto', url: p.url },
      ],
    })
}


export function emailDoPedidoDeDocumentos(p: { nome: string; url: string; renovacao?: boolean; lembrete?: boolean; dias: number }): EmailPronto {
  const oQue = p.renovacao
    ? 'Você emite o atestado de antecedentes (gratuito, na hora, no site da Polícia Civil) e envia pelo link.'
    : 'Leva uns 10 minutos: foto do seu documento com foto, atestado de antecedentes (gratuito, emitido na hora no site da Polícia Civil) e o contato de duas pessoas que possam falar de você.'
  return montar({
    assunto: p.lembrete ? 'Faltam os seus documentos para a verificação' : p.renovacao ? 'Renove o seu atestado de antecedentes' : 'Confirme quem você é para seguir com a inscrição',
    preheader: p.renovacao ? 'A lei pede um atestado novo a cada 6 meses.' : 'Documento com foto, atestado de antecedentes e duas referências.',
    titulo: p.lembrete ? 'Faltam os seus documentos' : p.renovacao ? 'Atestado de antecedentes' : 'Verificação do candidato',
    blocos: [
      { tipo: 'p', texto: p.lembrete
        ? `Olá, ${primeiroNome(p.nome)}. Ainda faltam os seus documentos para a verificação na Cruz Vermelha RJ. ${oQue}`
        : `Olá, ${primeiroNome(p.nome)}. Para seguir com a sua ${p.renovacao ? 'atuação' : 'inscrição'} como voluntário(a) da Cruz Vermelha RJ, precisamos ${p.renovacao ? 'renovar o seu atestado de antecedentes' : 'confirmar quem você é'}. ${oQue}` },
      { tipo: 'botao', rotulo: p.renovacao ? 'Enviar o atestado' : 'Enviar meus documentos', url: p.url },
      { tipo: 'p', texto: `O link é pessoal e vale ${p.dias} dias. Você pode parar e voltar: o que já enviou fica guardado.` },
      { tipo: 'nota', texto: 'A Cruz Vermelha nunca pede senha nem dados de banco por link. Os documentos ficam cifrados, só a coordenação do Voluntariado abre, e cada abertura fica registrada.' },
    ],
  })
}
