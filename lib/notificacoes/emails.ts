/**
 * Os e-mails de notificação: o aviso na hora e o resumo diário.
 * Módulo puro (só monta texto), como lib/contas/emails.ts.
 */
import { montar, type Bloco, type EmailPronto } from '@/lib/contas/emails'
import { RESUMO_MAXIMO_DE_ITENS } from './regras'

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome

const rodape = (urlBase: string) => ({
  texto: 'Você recebe estes avisos no seu e-mail de recuperação da Redação. Para escolher o que chega por e-mail:',
  rotulo: 'Gerenciar notificações',
  url: `${urlBase}/perfil#notificacoes`,
})

export function emailDeNotificacao(p: {
  urlBase: string; nome: string; titulo: string; mensagem: string; link: string | null
  citacao?: string | null; botao?: string; nota?: string
}): EmailPronto {
  const blocos: Bloco[] = [
    { tipo: 'p', texto: `Olá, ${primeiroNome(p.nome)}. ${p.mensagem}`.slice(0, 1200) },
    ...(p.citacao ? [{ tipo: 'citacao' as const, texto: p.citacao.slice(0, 1500) }] : []),
    { tipo: 'botao', rotulo: p.botao ?? 'Ver na Redação', url: `${p.urlBase}${p.link ?? '/notificacoes'}` },
    ...(p.nota ? [{ tipo: 'nota' as const, texto: p.nota }] : []),
  ]
  return montar({
    assunto: p.titulo.slice(0, 180),
    preheader: p.mensagem.slice(0, 120),
    titulo: p.titulo.slice(0, 200),
    blocos,
    rodape: rodape(p.urlBase),
  })
}

export type ItemDoResumo = { titulo: string; mensagem: string; link: string | null }

export function emailDeResumo(p: { urlBase: string; nome: string; itens: ItemDoResumo[]; total: number }): EmailPronto {
  const mostrados = p.itens.slice(0, RESUMO_MAXIMO_DE_ITENS)
  const resto = Math.max(0, p.total - mostrados.length)
  const quantos = p.total === 1 ? '1 novidade' : `${p.total} novidades`
  const blocos: Bloco[] = [
    { tipo: 'p', texto: `Olá, ${primeiroNome(p.nome)}. Você tem ${quantos} na Redação que ainda não viu:` },
    ...mostrados.map((item): Bloco => ({ tipo: 'item', titulo: item.titulo.slice(0, 200), texto: item.mensagem.slice(0, 280), url: item.link ? `${p.urlBase}${item.link}` : undefined })),
    ...(resto ? [{ tipo: 'nota' as const, texto: `E mais ${resto} ${resto === 1 ? 'aviso' : 'avisos'}.` }] : []),
    { tipo: 'botao', rotulo: 'Ver todas as notificações', url: `${p.urlBase}/notificacoes` },
  ]
  return montar({
    assunto: `Você tem ${quantos} na Redação`,
    preheader: mostrados.map((i) => i.titulo).join(' · ').slice(0, 120),
    titulo: `Seu resumo da Redação`,
    blocos,
    rodape: rodape(p.urlBase),
  })
}
