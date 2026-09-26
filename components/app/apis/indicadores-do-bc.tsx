import { Card } from '@/components/ui/card'
import { ipcaMensal, ptax } from '@/lib/apis-publicas/servidor'
import { acumulado } from '@/lib/apis-publicas/regras'
import { CorrecaoPeloIpca } from './correcao-pelo-ipca'

const brl = (n: number, casas = 4) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
const quando = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  return m ? `${m[3]}/${m[2]}` : ''
}

/**
 * Câmbio (PTAX de fechamento) e inflação (IPCA) do Banco Central, para
 * converter doação ou convênio em moeda estrangeira e atualizar valores de
 * prestação de contas. Sem o BC, some sem quebrar a página.
 */
export async function IndicadoresDoBc() {
  const hoje = new Date()
  const desde = new Date(hoje.getFullYear() - 1, hoje.getMonth() - 1, 1)
  const inicio = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, '0')}`
  const [usd, eur, serie] = await Promise.all([ptax('USD'), ptax('EUR'), ipcaMensal(inicio)])
  if (!usd && !eur && !serie.length) return null
  const ultimos12 = serie.slice(-12)
  const ipca12 = ultimos12.length === 12 ? acumulado(ultimos12.map((p) => p.valor)) : null
  const ultimoMes = serie.at(-1)
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Câmbio e inflação</h2>
        <span className="text-xs text-muted-foreground">Fonte: Banco Central (PTAX de fechamento e IPCA/IBGE)</span>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {usd && <div className="rounded-lg border border-border p-3"><dt className="text-xs text-muted-foreground">Dólar (PTAX {quando(usd.quando)})</dt><dd className="text-lg font-bold tabular-nums">R$ {brl(usd.venda)}</dd></div>}
        {eur && <div className="rounded-lg border border-border p-3"><dt className="text-xs text-muted-foreground">Euro (PTAX {quando(eur.quando)})</dt><dd className="text-lg font-bold tabular-nums">R$ {brl(eur.venda)}</dd></div>}
        {ipca12 != null && <div className="rounded-lg border border-border p-3"><dt className="text-xs text-muted-foreground">IPCA 12 meses</dt><dd className="text-lg font-bold tabular-nums">{brl(ipca12, 2)}%</dd></div>}
        {ultimoMes && <div className="rounded-lg border border-border p-3"><dt className="text-xs text-muted-foreground">IPCA de {ultimoMes.data.slice(5, 7)}/{ultimoMes.data.slice(0, 4)}</dt><dd className="text-lg font-bold tabular-nums">{brl(ultimoMes.valor, 2)}%</dd></div>}
      </dl>
      <CorrecaoPeloIpca />
    </Card>
  )
}
