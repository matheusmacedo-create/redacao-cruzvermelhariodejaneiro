import { CalendarHeart } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { oportunidadesDoMembro } from '@/lib/membro/oportunidades'
import { CartaoDeOportunidade } from '@/components/membro/oportunidades'

export const dynamic = 'force-dynamic'

/** Ações, plantões e eventos: próximas primeiro, depois o que já passou. */
export default async function Oportunidades() {
  const m = await exigirMembro()
  const lista = await oportunidadesDoMembro(m)
  const agora = new Date().toISOString()
  const proximas = lista.filter((o) => o.fim > agora)
  const minhas = proximas.filter((o) => o.minha === 'inscrito' || o.minha === 'espera')
  const outras = proximas.filter((o) => !minhas.includes(o))
  const passadas = lista.filter((o) => o.fim <= agora && o.minha && o.minha !== 'cancelado').reverse()
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Oportunidades</h1>
        <p className="text-sm text-neutral-600">Ações, plantões e eventos em que você pode atuar. Inscreva-se; com a presença confirmada, as horas entram no seu cadastro.</p>
      </div>
      {minhas.length > 0 && (
        <section className="flex flex-col gap-3" id="minhas">
          <h2 className="font-semibold">Minhas inscrições</h2>
          {minhas.map((o) => <CartaoDeOportunidade key={o.id} o={o} agora={agora} />)}
        </section>
      )}
      <section className="flex flex-col gap-3" id="proximas">
        {minhas.length > 0 && <h2 className="font-semibold">Outras oportunidades</h2>}
        {outras.map((o) => <CartaoDeOportunidade key={o.id} o={o} agora={agora} />)}
        {!outras.length && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
            <CalendarHeart className="size-8 text-neutral-400" />
            <p className="font-medium">{minhas.length ? 'Nenhuma outra oportunidade aberta agora.' : 'Nenhuma oportunidade aberta agora.'}</p>
            <p className="text-sm text-neutral-500">Assim que a coordenação publicar uma ação, ela aparece aqui.</p>
          </div>
        )}
      </section>
      {passadas.length > 0 && (
        <section className="flex flex-col gap-3" id="historico">
          <h2 className="font-semibold">Onde você já esteve</h2>
          {passadas.map((o) => <CartaoDeOportunidade key={o.id} o={o} agora={agora} />)}
        </section>
      )}
    </div>
  )
}
