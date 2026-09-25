import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarCheck, CalendarDays, History } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { agruparOportunidades, cartaoDaOportunidade, oportunidadesDoMembro, type OportunidadeDoMembro } from '@/lib/membro/oportunidades'
import { CartaoDeOportunidade, ListaDeOportunidades } from '@/components/membro/oportunidades'
import { CabecalhoDaPagina, EstadoVazio, Secao } from '@/components/membro/pecas'
import { botaoSecundario } from '@/components/membro/marca'

export const dynamic = 'force-dynamic'

// O template do layout completa: "Oportunidades · Área do Voluntário".
export const metadata: Metadata = { title: 'Oportunidades' }

/** Ações, plantões e eventos: as minhas, as abertas e o que já passou. */
export default async function Oportunidades() {
  const m = await exigirMembro()
  const lista = await oportunidadesDoMembro(m)
  // Um `agora` só para a página inteira: seção e cartão nunca discordam sobre o que já começou.
  const agora = new Date()
  const { minhas, abertas, passadas } = agruparOportunidades(lista, agora)
  const cartoes = (l: OportunidadeDoMembro[]) => l.map((o) => <CartaoDeOportunidade key={o.id} c={cartaoDaOportunidade(o, agora)} />)
  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaPagina titulo="Oportunidades" descricao="Ações, plantões e eventos da filial. Com a presença confirmada, as horas entram no seu cadastro." />
      <ListaDeOportunidades visiveis={[...minhas, ...abertas, ...passadas].map((o) => o.id)}>
        {minhas.length > 0 && (
          <Secao titulo="Minhas inscrições" icone={CalendarCheck} id="minhas">{cartoes(minhas)}</Secao>
        )}
        <Secao titulo="Abertas para inscrição" icone={CalendarDays} id="proximas">
          {abertas.length ? cartoes(abertas) : (
            <EstadoVazio icone={CalendarDays} titulo={minhas.length ? 'Nenhuma outra oportunidade aberta agora' : 'Nenhuma oportunidade aberta agora'}
              texto="Assim que a coordenação publicar uma ação, um plantão ou um evento, ele aparece aqui. Enquanto isso, dá para avançar na sua formação."
              acao={<Link href="/membro/cursos" className={botaoSecundario}>Ver cursos</Link>} />
          )}
        </Secao>
        {passadas.length > 0 && (
          <Secao titulo="Onde você já esteve" icone={History} id="historico">{cartoes(passadas)}</Secao>
        )}
      </ListaDeOportunidades>
    </div>
  )
}
