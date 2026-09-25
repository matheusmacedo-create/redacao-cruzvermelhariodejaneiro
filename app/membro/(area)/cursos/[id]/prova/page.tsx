import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { exigirMembro } from '@/lib/membro/sessao'
import { cursoDoMembro, liberacaoLegivel, questoesDaProva } from '@/lib/membro/cursos'
import { Prova } from '@/components/membro/prova'
import { CabecalhoDaPagina } from '@/components/membro/pecas'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await cursoDoMembro(await exigirMembro(), (await params).id)
  if (!d || !d.temProva) notFound()
  return { title: `Prova final: ${d.curso.titulo}` }
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/**
 * A prova final. Largura de leitura (`max-w-2xl`) alinhada à esquerda, para
 * o título não pular de lugar. As regras e as tentativas que restam vêm no
 * topo, antes das questões — não só depois de a pessoa responder tudo.
 */
export default async function ProvaDoCurso({ params }: Props) {
  const { id } = await params
  const m = await exigirMembro()
  const d = await cursoDoMembro(m, id)
  if (!d || !d.temProva) notFound()
  // Na visualização, a equipe confere a prova sem precisar concluir as aulas.
  // Com certificado não redireciona: a ação da prova revalida esta página logo
  // depois da aprovação, e o redirecionamento engoliria o "Aprovado!".
  if (!m.previa && !d.certificado && !d.progresso.concluido) redirect(`/membro/cursos/${id}`)
  const certificado = m.previa ? null : d.certificado
  const questoes = certificado ? [] : await questoesDaProva(id)
  const t = d.tentativas
  // A equipe, na visualização, não gasta tentativa: o envio é recusado antes do banco.
  const restantes = m.previa ? t.limite : t.restantes
  const minima = d.curso.nota_minima ?? 0

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <CabecalhoDaPagina voltar={{ href: `/membro/cursos/${id}`, rotulo: d.curso.titulo }} titulo="Prova final"
        descricao={`${plural(d.questoes, 'questão', 'questões')} · nota mínima ${minima} · até ${t.limite} tentativas a cada 24 horas.`}>
        {d.ultimaProva && !certificado && (
          <p className="text-sm text-muted-foreground">
            Última tentativa: nota {d.ultimaProva.nota} (mínimo {minima})
            {t.usadas > 0 && restantes > 0 && ` · ${restantes === 1 ? 'resta 1 tentativa' : `restam ${restantes} tentativas`}`}
          </p>
        )}
      </CabecalhoDaPagina>
      <Prova cursoId={id} questoes={questoes} minima={minima} certificado={certificado}
        tentativas={{
          limite: t.limite, restantes,
          libera: !m.previa && t.liberaEm ? liberacaoLegivel(t.liberaEm) : null,
          liberaSeEsgotar: !m.previa && t.liberaEmSeEsgotar ? liberacaoLegivel(t.liberaEmSeEsgotar) : null,
        }} />
    </div>
  )
}
