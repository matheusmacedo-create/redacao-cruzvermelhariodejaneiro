/**
 * Os e-mails de conta da Redação: convite, link de senha, confirmação de
 * e-mail e avisos de segurança.
 *
 * Módulo puro (só monta texto), para dar para conferir sem enviar nada.
 * Tabela e estilo em linha pelo mesmo motivo dos modelos da newsletter
 * (lib/newsletter/modelo.ts): cliente de e-mail não é navegador. Toda
 * mensagem leva versão em texto puro.
 *
 * Duas regras de segurança que valem para todos:
 *  - Nenhum e-mail leva senha. Nem a temporária: link de uso único, sim;
 *    senha em caixa de entrada fica lá para sempre.
 *  - Todo aviso diz o que fazer se não foi você. Aviso sem saída só assusta.
 */

const VERMELHO = '#cc0000'
const TINTA = '#1a202c'
const SUAVE = '#718096'
const LINHA = '#e2e8f0'
const LOGO = 'https://cruzvermelhariodejaneiro.org/assets/logo-cvb-rj.png'

export type EmailPronto = { assunto: string; html: string; texto: string }

/**
 * Normaliza e confere um endereço de contato. Devolve null se não serve —
 * inclusive o e-mail interno de login (@usuarios.cvrj.local), que não entrega.
 */
export function emailValido(valor: string): string | null {
  const email = valor.trim().toLowerCase()
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null
  if (email.endsWith('@usuarios.cvrj.local')) return null
  return email
}

const escapar = (valor: string) =>
  valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome

const quando = (data: Date) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(data)

export type Bloco =
  | { tipo: 'p'; texto: string }
  | { tipo: 'botao'; rotulo: string; url: string }
  | { tipo: 'destaque'; texto: string }
  | { tipo: 'nota'; texto: string }
  | { tipo: 'item'; titulo: string; texto: string; url?: string }
  | { tipo: 'citacao'; texto: string }

/**
 * `rodape`, quando vem, entra no fim do e-mail — é onde as notificações
 * põem o link para a pessoa escolher o que recebe.
 */
export function montar(opcoes: { assunto: string; preheader: string; titulo: string; blocos: Bloco[]; rodape?: { texto: string; rotulo: string; url: string } }): EmailPronto {
  const miolo = opcoes.blocos.map((b) => {
    if (b.tipo === 'p') return `<p style="margin:0 0 16px;">${escapar(b.texto)}</p>`
    if (b.tipo === 'destaque') return `<p style="margin:0 0 16px;padding:12px 16px;background:#f7f8fa;border-left:3px solid ${VERMELHO};font-family:Consolas,Menlo,monospace;font-size:15px;">${escapar(b.texto)}</p>`
    if (b.tipo === 'citacao') return `<p style="margin:0 0 16px;padding:12px 16px;background:#f7f8fa;border-left:3px solid ${VERMELHO};white-space:pre-line;">${escapar(b.texto)}</p>`
    if (b.tipo === 'item') {
      const titulo = b.url ? `<a href="${escapar(b.url)}" style="color:${TINTA};font-weight:bold;text-decoration:none;">${escapar(b.titulo)}</a>` : `<strong>${escapar(b.titulo)}</strong>`
      return `<p style="margin:0 0 12px;padding:10px 14px;border:1px solid ${LINHA};border-radius:6px;font-size:15px;">${titulo}<br><span style="color:${SUAVE};font-size:14px;">${escapar(b.texto)}</span></p>`
    }
    if (b.tipo === 'nota') return `<p style="margin:0 0 16px;color:${SUAVE};font-size:14px;">${escapar(b.texto)}</p>`
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;"><tr><td style="background:${VERMELHO};border-radius:6px;">
<a href="${escapar(b.url)}" style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${escapar(b.rotulo)}</a>
</td></tr></table>
<p style="margin:0 0 16px;color:${SUAVE};font-size:13px;">Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all;color:${TINTA};">${escapar(b.url)}</span></p>`
  }).join('\n')

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapar(opcoes.assunto)}</title></head>
<body style="margin:0;padding:0;background:#f7f8fa;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapar(opcoes.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f8fa;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid ${LINHA};border-radius:8px;">
<tr><td style="padding:28px 32px 0;border-top:4px solid ${VERMELHO};border-radius:8px 8px 0 0;"><img src="${LOGO}" width="120" alt="Cruz Vermelha Brasileira — Rio de Janeiro" style="height:auto;display:block;border:0;"></td></tr>
<tr><td style="padding:24px 32px 8px;font-family:Arial,Helvetica,sans-serif;color:${TINTA};font-size:16px;line-height:1.6;">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${TINTA};">${escapar(opcoes.titulo)}</h1>
${miolo}
</td></tr>
<tr><td style="padding:20px 32px 28px;border-top:1px solid ${LINHA};font-family:Arial,Helvetica,sans-serif;color:${SUAVE};font-size:12px;line-height:1.6;">
${opcoes.rodape ? `${escapar(opcoes.rodape.texto)} <a href="${escapar(opcoes.rodape.url)}" style="color:${SUAVE};text-decoration:underline;">${escapar(opcoes.rodape.rotulo)}</a><br><br>` : ''}Mensagem automática do Palácio Virtual — sistema interno da Cruz Vermelha Brasileira, filial do Rio de Janeiro. A equipe nunca pede sua senha nem o código do app autenticador, por e-mail ou por telefone.
</td></tr></table></td></tr></table></body></html>`

  const texto = [
    opcoes.titulo, '',
    ...opcoes.blocos.flatMap((b) => b.tipo === 'botao' ? [`${b.rotulo}: ${b.url}`, '']
      : b.tipo === 'item' ? [`• ${b.titulo}`, `  ${b.texto}`, ...(b.url ? [`  ${b.url}`] : []), '']
      : [b.texto, '']),
    '—',
    ...(opcoes.rodape ? [`${opcoes.rodape.texto} ${opcoes.rodape.rotulo}: ${opcoes.rodape.url}`, ''] : []),
    'Mensagem automática do Palácio Virtual — Cruz Vermelha Brasileira, filial do Rio de Janeiro.',
    'A equipe nunca pede sua senha nem o código do app autenticador.',
  ].join('\n')

  return { assunto: opcoes.assunto, html, texto }
}

const SE_NAO_FOI_VOCE = 'Se não foi você, redefina sua senha pela tela de login ("Esqueci minha senha") e avise um administrador do Palácio Virtual.'

// ------------------------------------------------------------------ convite

export function emailDeConvite(p: { nome: string; usuario: string; url: string; horas: number; convidadoPor: string }): EmailPronto {
  return montar({
    assunto: 'Seu acesso ao Palácio Virtual da Cruz Vermelha RJ',
    preheader: 'Defina sua senha para começar a usar o Palácio Virtual.',
    titulo: `Boas-vindas ao Palácio Virtual, ${primeiroNome(p.nome)}`,
    blocos: [
      { tipo: 'p', texto: `${p.convidadoPor} criou o seu acesso ao Palácio Virtual, o sistema de comunicação da Cruz Vermelha Brasileira no Rio de Janeiro. Seu usuário para entrar é:` },
      { tipo: 'destaque', texto: p.usuario },
      { tipo: 'p', texto: 'Para começar, escolha a sua senha:' },
      { tipo: 'botao', rotulo: 'Definir minha senha', url: p.url },
      { tipo: 'nota', texto: `O link vale por ${p.horas} horas e funciona uma vez só. Se expirar, peça outro a um administrador, ou use "Esqueci minha senha" na tela de login.` },
      { tipo: 'nota', texto: 'Não esperava este convite? Pode ignorar esta mensagem: sem a senha definida, ninguém entra.' },
    ],
  })
}

// ------------------------------------------------------------------ link de senha

export function emailDeRedefinicao(p: { nome: string; usuario: string; url: string; minutos: number; pedidoPor: 'pessoa' | 'admin'; adminNome?: string }): EmailPronto {
  const validade = p.minutos >= 120 ? `${Math.round(p.minutos / 60)} horas` : `${p.minutos} minutos`
  return montar({
    assunto: 'Redefinição de senha do Palácio Virtual',
    preheader: 'Link para escolher uma nova senha.',
    titulo: 'Redefinir sua senha',
    blocos: [
      { tipo: 'p', texto: p.pedidoPor === 'admin'
        ? `Olá, ${primeiroNome(p.nome)}. ${p.adminNome ?? 'Um administrador'} pediu uma nova senha para o seu acesso ao Palácio Virtual (usuário ${p.usuario}).`
        : `Olá, ${primeiroNome(p.nome)}. Recebemos um pedido para redefinir a senha do seu acesso ao Palácio Virtual (usuário ${p.usuario}).` },
      { tipo: 'botao', rotulo: 'Escolher nova senha', url: p.url },
      { tipo: 'nota', texto: `O link vale por ${validade} e funciona uma vez só. Sua senha atual continua valendo até você escolher a nova. Se você usa verificação em duas etapas, ela continua ativa.` },
      { tipo: 'nota', texto: p.pedidoPor === 'pessoa' ? 'Não foi você? Ignore esta mensagem: sem abrir o link, nada muda. Se receber outras sem ter pedido, avise um administrador.' : 'Não esperava? Fale com um administrador antes de usar o link.' },
    ],
  })
}

// ------------------------------------------------------------------ confirmar e-mail

export function emailDeConfirmacao(p: { nome: string; email: string; url: string; horas: number }): EmailPronto {
  return montar({
    assunto: 'Confirme seu e-mail no Palácio Virtual',
    preheader: 'Confirme o endereço que vai receber os avisos da sua conta.',
    titulo: 'Confirme seu e-mail',
    blocos: [
      { tipo: 'p', texto: `Olá, ${primeiroNome(p.nome)}. Este endereço (${p.email}) foi indicado para receber os avisos da sua conta no Palácio Virtual: links de senha e alertas de segurança.` },
      { tipo: 'botao', rotulo: 'Confirmar este e-mail', url: p.url },
      { tipo: 'nota', texto: `O link vale por ${p.horas} horas. Enquanto não confirmar, os avisos continuam indo para o endereço anterior (se houver).` },
      { tipo: 'nota', texto: 'Não reconhece este pedido? Ignore esta mensagem: sem a confirmação, nada muda.' },
    ],
  })
}

// ------------------------------------------------------------------ avisos de segurança

export type AvisoDeSeguranca =
  | { tipo: 'senha_alterada'; como: 'propria' | 'link' | 'admin'; adminNome?: string }
  | { tipo: 'verificacao_ativada' }
  | { tipo: 'verificacao_removida'; porAdmin?: string }
  | { tipo: 'conta_desativada'; adminNome: string }
  | { tipo: 'conta_reativada'; adminNome: string }
  | { tipo: 'papel_alterado'; de: string; para: string; adminNome: string }
  | { tipo: 'email_alterado'; novo: string }

export function emailDeAviso(p: { nome: string; quando: Date; aviso: AvisoDeSeguranca; urlDeLogin: string }): EmailPronto {
  const a = p.aviso
  const ola = `Olá, ${primeiroNome(p.nome)}.`
  const data = `Em ${quando(p.quando)}.`
  const casos: Record<AvisoDeSeguranca['tipo'], () => { assunto: string; titulo: string; blocos: Bloco[] }> = {
    senha_alterada: () => {
      const s = a as Extract<AvisoDeSeguranca, { tipo: 'senha_alterada' }>
      return {
        assunto: 'Sua senha do Palácio Virtual foi alterada',
        titulo: 'Senha alterada',
        blocos: [
          { tipo: 'p', texto: `${ola} A senha do seu acesso ao Palácio Virtual foi alterada${s.como === 'admin' ? ` por ${s.adminNome ?? 'um administrador'}` : s.como === 'link' ? ' pelo link enviado por e-mail' : ''}. ${data}` },
          { tipo: 'p', texto: 'Por segurança, as sessões abertas em outros aparelhos foram encerradas.' },
          { tipo: 'nota', texto: SE_NAO_FOI_VOCE },
        ],
      }
    },
    verificacao_ativada: () => ({
      assunto: 'Verificação em duas etapas ativada no Palácio Virtual',
      titulo: 'Verificação em duas etapas ativada',
      blocos: [
        { tipo: 'p', texto: `${ola} Um app autenticador foi cadastrado na sua conta. A partir de agora, o login pede o código de 6 dígitos do app além da senha. ${data}` },
        { tipo: 'nota', texto: SE_NAO_FOI_VOCE },
      ],
    }),
    verificacao_removida: () => {
      const s = a as Extract<AvisoDeSeguranca, { tipo: 'verificacao_removida' }>
      return {
        assunto: 'Verificação em duas etapas removida no Palácio Virtual',
        titulo: 'Verificação em duas etapas removida',
        blocos: [
          { tipo: 'p', texto: `${ola} ${s.porAdmin ? `${s.porAdmin} removeu o app autenticador da sua conta — o que se faz quando alguém perde ou troca de celular.` : 'Um app autenticador foi removido da sua conta.'} ${data}` },
          { tipo: 'p', texto: 'Para voltar a proteger a conta, cadastre o app de novo em Meu perfil → Verificação em duas etapas.' },
          { tipo: 'botao', rotulo: 'Abrir o Palácio Virtual', url: p.urlDeLogin },
          { tipo: 'nota', texto: SE_NAO_FOI_VOCE },
        ],
      }
    },
    conta_desativada: () => ({
      assunto: 'Seu acesso ao Palácio Virtual foi desativado',
      titulo: 'Acesso desativado',
      blocos: [
        { tipo: 'p', texto: `${ola} ${(a as { adminNome: string }).adminNome} desativou o seu acesso ao Palácio Virtual. As sessões abertas foram encerradas e o login deixa de funcionar. ${data}` },
        { tipo: 'nota', texto: 'Se isso não era esperado, fale com a coordenação de Comunicação.' },
      ],
    }),
    conta_reativada: () => ({
      assunto: 'Seu acesso ao Palácio Virtual foi reativado',
      titulo: 'Acesso reativado',
      blocos: [
        { tipo: 'p', texto: `${ola} ${(a as { adminNome: string }).adminNome} reativou o seu acesso ao Palácio Virtual. ${data}` },
        { tipo: 'p', texto: 'Você vai receber em seguida um link para escolher uma senha nova, ou o administrador vai passar uma senha temporária pessoalmente.' },
      ],
    }),
    papel_alterado: () => {
      const s = a as Extract<AvisoDeSeguranca, { tipo: 'papel_alterado' }>
      return {
        assunto: 'Seu papel no Palácio Virtual mudou',
        titulo: 'Seu acesso mudou',
        blocos: [
          { tipo: 'p', texto: `${ola} ${s.adminNome} mudou o seu papel no Palácio Virtual de ${s.de} para ${s.para}. O que você pode fazer no sistema mudou junto. ${data}` },
          { tipo: 'nota', texto: 'Dúvidas sobre o que cada papel pode fazer? Fale com um administrador.' },
        ],
      }
    },
    email_alterado: () => ({
      assunto: 'O e-mail da sua conta no Palácio Virtual foi alterado',
      titulo: 'E-mail da conta alterado',
      blocos: [
        { tipo: 'p', texto: `${ola} Os avisos da sua conta no Palácio Virtual passam a ir para ${(a as { novo: string }).novo}. Esta é a última mensagem enviada a este endereço. ${data}` },
        { tipo: 'nota', texto: SE_NAO_FOI_VOCE },
      ],
    }),
  }
  const c = casos[a.tipo]()
  return montar({ assunto: c.assunto, preheader: c.titulo, titulo: c.titulo, blocos: c.blocos })
}

// ------------------------------------------------------------------ pedido de ajuda (2FA)

export function emailDePedidoDeAjuda(p: { adminNome: string; pessoaNome: string; usuario: string; urlDeUsuarios: string }): EmailPronto {
  return montar({
    assunto: `${p.pessoaNome} pediu ajuda com a verificação em duas etapas`,
    preheader: 'Perdeu ou trocou de celular e não consegue entrar.',
    titulo: 'Pedido de ajuda para entrar',
    blocos: [
      { tipo: 'p', texto: `Olá, ${primeiroNome(p.adminNome)}. ${p.pessoaNome} (usuário ${p.usuario}) informou na tela de login que perdeu ou trocou de celular e não consegue gerar o código da verificação em duas etapas.` },
      { tipo: 'p', texto: 'Antes de remover a verificação, confirme com a pessoa por outro canal (pessoalmente ou por telefone) que foi ela mesma que pediu: quem tem só a senha consegue apertar este botão.' },
      { tipo: 'botao', rotulo: 'Abrir Usuários e permissões', url: p.urlDeUsuarios },
    ],
  })
}
