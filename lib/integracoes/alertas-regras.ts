/**
 * Os alertas de integração à administração (categoria "integracoes"), sem
 * banco nem rede — conferidos por `npx tsx scripts/conferir-whatsapp.ts`,
 * porque o alerta vai também pelo WhatsApp.
 *
 * Quando uma integração para em silêncio, o primeiro a saber é o Palácio:
 * a troca do token do Google volta "invalid_grant", o Resend recusa a chave,
 * o R2 não grava, a Anthropic recusa a chave ou o modelo do assistente do
 * WhatsApp, o Google Drive da filial expira ou enche. Antes, isso ia só ao log (e ao estado "expirada" do Google,
 * que só o "status" do WhatsApp mostrava). Agora vira um aviso curto, com o
 * que fazer, no sino, no e-mail e no WhatsApp dos administradores
 * (lib/integracoes/alertas.ts). A queda do próprio WhatsApp continua sendo
 * "sistema" (lib/whatsapp/estado.ts), que nunca vai por ele.
 *
 * Um alerta por integração a cada ALERTA_DE_INTEGRACAO_A_CADA_HORAS: o
 * episódio do Google começa na troca de "ativa" para "expirada"; o do e-mail
 * e o do armazenamento, na primeira falha, e as falhas seguintes dentro do
 * prazo são o mesmo episódio.
 */

export const INTEGRACOES_ALERTADAS = ['google_gmail', 'google_admin', 'google_oauth', 'google_drive', 'google_ads', 'resend', 'r2', 'claude'] as const
export type IntegracaoAlertada = (typeof INTEGRACOES_ALERTADAS)[number]

/** No máximo um alerta por integração neste intervalo (o mesmo dos alertas do WhatsApp). */
export const ALERTA_DE_INTEGRACAO_A_CADA_HORAS = 6

/** Chave (ou domínio) recusada, o serviço fora do ar ou limitando, ou (no assistente do WhatsApp) o modelo que não existe. */
export type MotivoDoAlerta = 'chave' | 'servico' | 'modelo'

/** O alerta sai? Só se não houve outro da mesma integração nas últimas horas (data futura não vale: activity_log aceita qualquer data). */
export function alertaDeIntegracaoSai(p: { ultimoAlertaEm: string | null; agora: Date }): boolean {
  const ultimo = p.ultimoAlertaEm ? new Date(p.ultimoAlertaEm).getTime() : NaN
  if (!Number.isFinite(ultimo) || ultimo > p.agora.getTime()) return true
  return p.agora.getTime() - ultimo >= ALERTA_DE_INTEGRACAO_A_CADA_HORAS * 3_600_000
}

/**
 * A falha do Resend merece alerta? 401/403: a chave ou o domínio do remetente recusados; 429 que fala da cota
 * ("daily/monthly quota"): o limite do plano acabou — o 429 de chamadas demais por segundo passa sozinho e não
 * alerta; 5xx ou sem resposta (status 0): o Resend fora do ar ou a rede. 400/422 são da própria mensagem (o
 * endereço, o formato): não param o envio dos outros, então não alertam.
 */
export function motivoDaFalhaDoEmail(status: number, mensagem?: string | null): MotivoDoAlerta | null {
  if (status === 401 || status === 403) return 'chave'
  if (status === 429) return /quota/i.test(mensagem ?? '') ? 'servico' : null
  if (status === 0 || status >= 500) return 'servico'
  return null
}

/**
 * A falha ao gravar no R2 merece alerta? null = sem resposta (a rede ou o tempo); 401/403: as credenciais recusadas;
 * 404: o bucket não existe (configuração); 5xx: o R2 fora do ar. O resto (o arquivo que já existe, a trava do
 * bucket) é do próprio envio.
 */
export function motivoDaFalhaDoR2(status: number | null): MotivoDoAlerta | null {
  if (status === 401 || status === 403 || status === 404) return 'chave'
  if (status === null || status === 0 || status >= 500) return 'servico'
  return null
}

export type TextoDoAlerta = { titulo: string; mensagem: string; link: string; botao: string }

/** O texto do alerta: curto (notificar corta em 280 letras), com o que fazer e onde. */
export function textoDoAlertaDeIntegracao(integracao: IntegracaoAlertada, p: { conta?: string | null; motivo?: MotivoDoAlerta | null } = {}): TextoDoAlerta {
  const conta = String(p.conta ?? '').trim().slice(0, 80)
  if (integracao === 'google_gmail') {
    return {
      titulo: 'A conta Google do e-mail dos setores expirou',
      mensagem: `A autorização${conta ? ` de ${conta}` : ' da conta Google'} foi revogada ou expirou: o e-mail dos setores não envia nem lê até reconectar. Abra Configurações → E-mail dos setores e toque em “Reconectar”.`,
      link: '/configuracoes/email', botao: 'Reconectar a conta Google',
    }
  }
  if (integracao === 'google_admin') {
    return {
      titulo: 'A conta de administrador do Google expirou',
      mensagem: `A autorização${conta ? ` de ${conta}` : ' da conta de administrador do Google'} foi revogada ou expirou: criar e-mails pelo link não funciona até reconectar. Abra Configurações → E-mail dos setores e toque em “Reconectar”.`,
      link: '/configuracoes/email', botao: 'Reconectar a conta de administrador',
    }
  }
  if (integracao === 'google_drive') {
    // A conexão do Drive (lib/google/drive.ts): a autorização que caiu (sem motivo, ou "chave") ou o Drive cheio ("servico").
    return p.motivo === 'servico'
      ? {
        titulo: 'O Google Drive do Palácio está sem espaço',
        mensagem: `O Drive${conta ? ` de ${conta}` : ' da conta conectada'} recusou por falta de espaço: as cópias dos envios e os documentos do WhatsApp não estão entrando. Libere espaço ou troque a conta em Configurações → E-mail dos setores.`,
        link: '/configuracoes/email', botao: 'Ver o Google Drive',
      }
      : {
        titulo: 'A conexão do Google Drive expirou',
        mensagem: `A autorização${conta ? ` de ${conta}` : ' do Google Drive'} expirou ou foi revogada: as cópias dos envios e os documentos do WhatsApp param até reconectar. Em Configurações → E-mail dos setores, toque em “Reconectar” no Google Drive.`,
        link: '/configuracoes/email', botao: 'Reconectar o Google Drive',
      }
  }
  if (integracao === 'google_ads') {
    // A conexão do Google Ads (lib/google/ads.ts): a autorização que caiu. As campanhas seguem no Google; o Palácio só deixa de mexer.
    return {
      titulo: 'A conexão do Google Ads expirou',
      mensagem: `A autorização${conta ? ` de ${conta}` : ' do Google Ads'} expirou ou foi revogada: as campanhas continuam no Google, mas o Palácio não confere nem cria nada até reconectar. Em Configurações → E-mail dos setores, toque em “Reconectar” no Google Ads.`,
      link: '/configuracoes/email', botao: 'Reconectar o Google Ads',
    }
  }
  if (integracao === 'google_oauth') {
    return {
      titulo: 'O Google recusou o cliente OAuth',
      mensagem: 'O ID ou a chave secreta do cliente OAuth do Google foram recusados: o e-mail dos setores e a criação de e-mails param. Confira o cartão “Google (cliente OAuth do Gmail)” em Configurações → Integrações.',
      link: '/configuracoes/integracoes', botao: 'Abrir as integrações',
    }
  }
  if (integracao === 'resend') {
    return p.motivo === 'chave'
      ? {
        titulo: 'O envio de e-mails parou (Resend)',
        mensagem: 'O Resend recusou a chave ou o domínio do remetente: avisos, links de senha e convites por e-mail não estão saindo. Confira RESEND_API_KEY na Vercel e o domínio verificado no painel do Resend.',
        link: '/configuracoes/integracoes', botao: 'Ver as integrações',
      }
      : {
        titulo: 'O envio de e-mails está falhando (Resend)',
        mensagem: 'O Resend não respondeu ou limitou os envios: avisos, links de senha e convites por e-mail podem não estar saindo. Veja o status e o plano no painel do Resend.',
        link: '/configuracoes/integracoes', botao: 'Ver as integrações',
      }
  }
  if (integracao === 'claude') {
    // O assistente do WhatsApp (lib/whatsapp/assistente/uso.ts): pausado, e o bot de comandos responde sozinho.
    if (p.motivo === 'chave') {
      return {
        titulo: 'O assistente do WhatsApp parou: a Anthropic recusou a chave',
        mensagem: 'A Anthropic recusou a chave do Claude: o assistente do WhatsApp ficou pausado e o bot de comandos responde sozinho. Confira ANTHROPIC_API_KEY (ou CLAUDE_API) na Vercel e os créditos no console da Anthropic.',
        link: '/configuracoes/whatsapp', botao: 'Ver o assistente',
      }
    }
    if (p.motivo === 'modelo') {
      return {
        titulo: 'O assistente do WhatsApp parou: o modelo não existe',
        mensagem: 'A Anthropic não achou o modelo do assistente do WhatsApp (ou ele não está liberado para a conta): o assistente ficou pausado e o bot de comandos responde sozinho. Confira WHATSAPP_IA_MODELO na Vercel.',
        link: '/configuracoes/whatsapp', botao: 'Ver o assistente',
      }
    }
    return {
      titulo: 'O assistente do WhatsApp está falhando',
      mensagem: 'A Anthropic não respondeu ao assistente do WhatsApp: ele pausa sozinho por alguns minutos e o bot de comandos continua respondendo. Veja o status no console da Anthropic.',
      link: '/configuracoes/whatsapp', botao: 'Ver o assistente',
    }
  }
  return p.motivo === 'chave'
    ? {
      titulo: 'O armazenamento parou de gravar (R2)',
      mensagem: 'O Cloudflare R2 recusou as credenciais ou não achou o bucket: fotos que chegam pelo WhatsApp e o espelho da trilha pública não estão sendo gravados. Confira as variáveis R2_* na Vercel e o bucket no painel da Cloudflare.',
      link: '/configuracoes/integracoes', botao: 'Ver as integrações',
    }
    : {
      titulo: 'O armazenamento está falhando (R2)',
      mensagem: 'O Cloudflare R2 não respondeu ao gravar: fotos que chegam pelo WhatsApp e o espelho da trilha pública podem não estar sendo gravados. Veja o status no painel da Cloudflare; o Palácio tenta de novo no próximo envio.',
      link: '/configuracoes/integracoes', botao: 'Ver as integrações',
    }
}
