/**
 * O e-mail do resumo semanal da Agenda: a semana que começa, dia a dia, e o
 * que pede atenção. Só vai para quem ligou o resumo (decisão do Matheus,
 * 26/09/2026). Módulo puro, como lib/notificacoes/emails.ts.
 */
import { montar, type Bloco, type EmailPronto } from '@/lib/contas/emails'
import { CAMADAS, type ItemDaAgenda } from './camadas'
import type { Alerta } from './regras'
import { rotuloDoDia } from './datas'

export const MAXIMO_DE_ITENS_NO_RESUMO = 30
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome

export function emailDoResumoSemanal(p: {
  urlBase: string; nome: string; de: string; ate: string; itens: ItemDaAgenda[]; alertas: Alerta[]
}): EmailPronto {
  // Mês temático e campanha longa já começada não são "desta semana": só entram no dia em que começam.
  const daSemana = p.itens.filter((i) => i.dia >= p.de && i.dia <= p.ate)
  const mostrados = daSemana.slice(0, MAXIMO_DE_ITENS_NO_RESUMO)
  const resto = daSemana.length - mostrados.length
  const quantos = daSemana.length === 1 ? '1 compromisso' : `${daSemana.length} compromissos`
  const urgentes = p.alertas.filter((a) => a.nivel !== 'info').slice(0, 8)
  const blocos: Bloco[] = [
    { tipo: 'p', texto: `Bom dia, ${primeiroNome(p.nome)}. De ${rotuloDoDia(p.de)} a ${rotuloDoDia(p.ate)}, a sua agenda tem ${daSemana.length ? quantos : 'nada marcado'}.` },
    ...(urgentes.length ? [{ tipo: 'destaque' as const, texto: `Pede atenção: ${urgentes.map((a) => a.titulo).join('; ')}.`.slice(0, 900) }] : []),
    ...mostrados.map((i): Bloco => ({
      tipo: 'item',
      titulo: `${rotuloDoDia(i.dia)}${i.hora ? ` · ${i.hora}` : ''} — ${i.titulo}`.slice(0, 200),
      texto: [CAMADAS[i.camada].nome, i.canal, i.detalhe].filter(Boolean).join(' · ').slice(0, 280),
      url: i.href ? `${p.urlBase}${i.href}` : undefined,
    })),
    ...(resto > 0 ? [{ tipo: 'nota' as const, texto: `E mais ${resto} na agenda.` }] : []),
    { tipo: 'botao', rotulo: 'Abrir a agenda', url: `${p.urlBase}/calendario` },
  ]
  return montar({
    assunto: `Sua semana no Palácio Virtual: ${daSemana.length ? quantos : 'agenda livre'}`,
    preheader: mostrados.slice(0, 4).map((i) => i.titulo).join(' · ').slice(0, 120) || 'Nada marcado para esta semana.',
    titulo: 'A sua semana',
    blocos,
    rodape: {
      texto: 'Você recebe este resumo porque ligou o resumo semanal na Agenda. Para desligar:',
      rotulo: 'Configurar a agenda',
      url: `${p.urlBase}/calendario?config=1`,
    },
  })
}
