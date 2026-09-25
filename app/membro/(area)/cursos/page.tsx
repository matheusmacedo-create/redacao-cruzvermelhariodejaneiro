import type { Metadata } from 'next'
import Link from 'next/link'
import { Award, BookOpen, GraduationCap, PlayCircle } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { catalogoDoMembro } from '@/lib/membro/cursos'
import { GradeDeCursos, etapaNoCatalogo } from '@/components/membro/cursos'
import { CabecalhoDaPagina, EstadoVazio, Secao } from '@/components/membro/pecas'
import { botaoSecundario } from '@/components/membro/marca'

export const dynamic = 'force-dynamic'

// O template do layout completa: "Cursos · Área do Voluntário".
export const metadata: Metadata = { title: 'Cursos' }

/**
 * O catálogo em três grupos: o que a pessoa já começou (prova pendente
 * primeiro — é o que está mais perto de virar certificado), o que ainda não
 * começou e o que já concluiu. As sub-abas (Cursos · Apostilas ·
 * Certificados) vêm do layout.
 */
export default async function Cursos() {
  const m = await exigirMembro()
  const cursos = await catalogoDoMembro(m)
  const de = (e: ReturnType<typeof etapaNoCatalogo>) => cursos.filter((c) => etapaNoCatalogo(c) === e)
  const continuar = [...de('prova'), ...de('andamento')]
  const novos = de('novo')
  const concluidos = de('concluido')
  return (
    <div className="flex flex-col gap-8">
      <CabecalhoDaPagina titulo="Cursos" descricao="Formação da Cruz Vermelha RJ para voluntários. Concluiu, o certificado sai na hora." />
      {!cursos.length && (
        <EstadoVazio icone={GraduationCap} titulo="Os cursos estão sendo preparados." texto="Assim que a coordenação publicar, eles aparecem aqui. Enquanto isso, as apostilas já estão disponíveis."
          acao={<Link href="/membro/apostilas" className={botaoSecundario}><BookOpen className="size-4" aria-hidden="true" />Ver apostilas</Link>} />
      )}
      {continuar.length > 0 && (
        <Secao titulo="Continuar" icone={PlayCircle} id="continuar"><GradeDeCursos cursos={continuar} /></Secao>
      )}
      {novos.length > 0 && (
        <Secao titulo={continuar.length || concluidos.length ? 'Outros cursos' : 'Cursos disponíveis'} icone={GraduationCap} id="outros"><GradeDeCursos cursos={novos} /></Secao>
      )}
      {concluidos.length > 0 && (
        <Secao titulo="Concluídos" icone={Award} id="concluidos" verTodos={{ href: '/membro/certificados', rotulo: 'Ver certificados' }}><GradeDeCursos cursos={concluidos} /></Secao>
      )}
    </div>
  )
}
