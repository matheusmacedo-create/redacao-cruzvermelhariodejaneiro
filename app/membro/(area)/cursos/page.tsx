import type { Metadata } from 'next'
import Link from 'next/link'
import { Award, BookOpen, GraduationCap, PlayCircle } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { apostilasDoMembro, catalogoDoMembro } from '@/lib/membro/cursos'
import { etapaDoCurso, type EtapaDoCurso } from '@/lib/membro/inicio'
import { GradeDeCursos } from '@/components/membro/cursos'
import { CabecalhoDaPagina, EstadoVazio, Secao } from '@/components/membro/pecas'
import { botaoSecundario } from '@/components/membro/marca'

export const dynamic = 'force-dynamic'

// O template do layout completa: "Cursos · Área do Voluntário".
export const metadata: Metadata = { title: 'Cursos' }

/**
 * O catálogo em três grupos: o que a pessoa já começou (prova pendente
 * primeiro — é o que está mais perto de virar certificado), o que ainda não
 * começou e o que já concluiu. Agrupa pela mesma regra do Início
 * (`etapaDoCurso`). As sub-abas (Cursos · Apostilas · Certificados) vêm do
 * layout.
 */
export default async function Cursos() {
  const m = await exigirMembro()
  const cursos = await catalogoDoMembro(m)
  // Só no catálogo vazio: aponta para as apostilas apenas se houver alguma.
  const temApostilas = !cursos.length && (await apostilasDoMembro(m)).length > 0
  const de = (e: EtapaDoCurso) => cursos.filter((c) => etapaDoCurso(c) === e)
  const continuar = [...de('prova'), ...de('andamento')]
  const novos = de('novo')
  const concluidos = de('concluido')
  // O formato do cartão vale para a página toda: sem nenhuma capa, cartões horizontais (sem blocos cinza vazios).
  const comCapa = cursos.some((c) => c.capa)
  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaPagina titulo="Cursos" descricao="Formação da Cruz Vermelha RJ para voluntários. Concluiu, o certificado sai na hora." />
      {!cursos.length && (
        <EstadoVazio icone={GraduationCap} titulo="Os cursos estão sendo preparados."
          texto={temApostilas ? 'Assim que a coordenação publicar, eles aparecem aqui. Enquanto isso, as apostilas já estão disponíveis.' : 'Assim que a coordenação publicar, eles aparecem aqui.'}
          acao={temApostilas ? <Link href="/membro/apostilas" className={botaoSecundario}><BookOpen className="size-4" aria-hidden="true" />Ver apostilas</Link> : undefined} />
      )}
      {continuar.length > 0 && (
        <Secao titulo="Continuar" icone={PlayCircle} id="continuar"><GradeDeCursos cursos={continuar} vertical={comCapa} /></Secao>
      )}
      {novos.length > 0 && (
        <Secao titulo={continuar.length || concluidos.length ? 'Outros cursos' : 'Cursos disponíveis'} icone={GraduationCap} id="outros"><GradeDeCursos cursos={novos} vertical={comCapa} /></Secao>
      )}
      {concluidos.length > 0 && (
        <Secao titulo="Concluídos" icone={Award} id="concluidos" verTodos={{ href: '/membro/certificados', rotulo: 'Ver certificados' }}><GradeDeCursos cursos={concluidos} vertical={comCapa} /></Secao>
      )}
    </div>
  )
}
