import type { Metadata } from 'next'
import { after } from 'next/server'
import { Moldura } from '@/app/autorizacao/moldura'
import { Recado } from '@/components/membro/pecas'
import { FormularioDaProposta } from '@/components/cotacao/formulario'
import { conviteDoToken, marcarVisto } from '@/lib/compras/convites-servidor'
import { dataComDia } from '@/lib/compras/convites'
import { dataCurta } from '@/lib/financeiro/regras'

// O link do fornecedor (docs/compras-cotacao-automatica.md): sem login, fora do Google.
export const metadata: Metadata = {
  title: 'Pedido de proposta — Cruz Vermelha RJ',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}
export const dynamic = 'force-dynamic'

const hojeEmSaoPaulo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const cnpjLegivel = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')

export default async function PaginaDaCotacao({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const aberto = await conviteDoToken(token)
  if (!aberto) {
    return (
      <Moldura>
        <Recado tipo="aviso" titulo="Este link não está valendo">
          <p>Confira se o endereço foi copiado inteiro. Se o problema continuar, responda o e-mail em que recebeu o pedido de proposta.</p>
        </Recado>
      </Moldura>
    )
  }
  const { pedido, comprador, fornecedor, itens, proposta, convite, fechado } = aberto
  if (!convite.visto_em) after(() => marcarVisto(convite.id))

  return (
    <Moldura>
      <div className="flex flex-col gap-1">
        <p className="font-mono text-xs text-muted-foreground">Pedido de proposta {pedido.codigo}</p>
        <h1 className="text-2xl font-bold leading-tight">{pedido.titulo}</h1>
        <p className="text-sm text-muted-foreground">
          Para <span className="font-medium text-foreground">{fornecedor}</span>, de {comprador.nome}{comprador.cnpj ? ` (CNPJ ${cnpjLegivel(comprador.cnpj)})` : ''}.
        </p>
      </div>

      <section className="grid gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-3" aria-label="Condições do pedido">
        <Dado rotulo="Prazo para a proposta">{pedido.cotacao_prazo ? dataComDia(pedido.cotacao_prazo) : 'sem prazo definido'}</Dado>
        <Dado rotulo="Entrega em">{pedido.local_entrega ?? 'a combinar'}</Dado>
        <Dado rotulo="Precisamos até">{pedido.necessario_ate ? dataCurta(pedido.necessario_ate) : 'a combinar'}</Dado>
      </section>

      {fechado ? (
        <Recado tipo={convite.respondido_em ? 'sucesso' : 'aviso'} titulo={
          fechado === 'cancelado' ? 'Este convite foi cancelado'
            : fechado === 'encerrado' ? 'Esta cotação já foi encerrada'
            : 'O prazo para a proposta acabou'
        }>
          <p>{convite.respondido_em ? 'A sua proposta chegou e está sendo analisada. Obrigado!' : 'Obrigado pelo interesse. Se quiser participar de outra vez, responda o e-mail do pedido.'}</p>
        </Recado>
      ) : convite.recusado_em ? (
        <FormularioDaProposta token={token} itens={itens} proposta={proposta} hoje={hojeEmSaoPaulo()} prazo={pedido.cotacao_prazo} recusou />
      ) : (
        <FormularioDaProposta token={token} itens={itens} proposta={proposta} hoje={hojeEmSaoPaulo()} prazo={pedido.cotacao_prazo} />
      )}

      <p className="text-xs text-muted-foreground">
        Este link é só seu: não repasse. Os valores que você informa aqui são vistos apenas pela equipe de compras de {comprador.nome}.
      </p>
    </Moldura>
  )
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
      <p className="mt-0.5 font-medium">{children}</p>
    </div>
  )
}
