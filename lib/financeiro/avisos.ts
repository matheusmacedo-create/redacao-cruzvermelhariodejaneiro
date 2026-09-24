import { reais, somar } from './regras'

/** "2026-09-24" + 3 dias. */
export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * O texto do aviso diário de contas: o que venceu, o que vence hoje e o que
 * vence nos próximos dias. Nada para dizer: null (ninguém é avisado).
 */
export function avisoDeVencimentos(contas: { valor: number; vencimento: string }[], hoje: string): { titulo: string; mensagem: string } | null {
  const atrasadas = contas.filter((c) => c.vencimento < hoje)
  const hojeV = contas.filter((c) => c.vencimento === hoje)
  const logo = contas.filter((c) => c.vencimento > hoje && c.vencimento <= somarDias(hoje, 3))
  if (!atrasadas.length && !hojeV.length && !logo.length) return null
  const parte = (lista: typeof contas, um: string, varios: string) => `${lista.length} ${lista.length === 1 ? um : varios} (${reais(somar(lista.map((c) => c.valor)))})`
  const partes = [
    hojeV.length ? parte(hojeV, 'vence hoje', 'vencem hoje') : null,
    atrasadas.length ? parte(atrasadas, 'atrasada', 'atrasadas') : null,
    logo.length ? parte(logo, 'vence nos próximos 3 dias', 'vencem nos próximos 3 dias') : null,
  ].filter(Boolean)
  const titulo = hojeV.length ? (hojeV.length === 1 ? '1 conta vence hoje' : `${hojeV.length} contas vencem hoje`)
    : atrasadas.length ? (atrasadas.length === 1 ? '1 conta atrasada' : `${atrasadas.length} contas atrasadas`)
      : 'Contas vencendo nos próximos dias'
  return { titulo, mensagem: `Contas a pagar: ${partes.join(' · ')}.` }
}
