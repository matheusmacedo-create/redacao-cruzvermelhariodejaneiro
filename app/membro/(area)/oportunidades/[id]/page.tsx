import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { exigirMembro } from '@/lib/membro/sessao'
import { oportunidadeParaResponder, prazoLegivel } from '@/lib/membro/oportunidades'
import { NOTA_MINIMA_PADRAO } from '@/lib/oportunidades/perguntas'
import { TIPOS, ehDeResposta, ehTipo, estado, estadoDoPedido, quando } from '@/lib/oportunidades/regras'
import { createAdminClient } from '@/lib/supabase/admin'
import { CabecalhoDaPagina, Recado } from '@/components/membro/pecas'
import { FormularioDeResposta } from '@/components/membro/responder'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await oportunidadeParaResponder(await exigirMembro(), (await params).id)
  return { title: d?.oportunidade.titulo ?? 'Oportunidade' }
}

/**
 * Um aviso para confirmar, uma enquete, um quiz — ou as perguntas de uma
 * ação para se inscrever. Ação sem pergunta não tem página: a inscrição é
 * no próprio cartão.
 */
export default async function ResponderOportunidade({ params }: Props) {
  const { id } = await params
  const m = await exigirMembro()
  const d = await oportunidadeParaResponder(m, id)
  if (!d) notFound()
  const { oportunidade: o, perguntas, resposta, inscricao } = d
  const pedido = ehDeResposta(o.tipo)
  if (!pedido && !perguntas.length) redirect(`/membro/oportunidades#o-${o.id}`)
  const agora = new Date()
  const inscrito = inscricao === 'inscrito' || inscricao === 'espera'

  let aberto: boolean
  let participar: 'vaga' | 'espera' | null = null
  if (pedido) aberto = estadoDoPedido(o, agora) === 'aberto'
  else {
    const { count } = await createAdminClient().from('oportunidade_inscricoes').select('id', { count: 'exact', head: true })
      .eq('oportunidade_id', o.id).in('situacao', ['inscrito', 'presente', 'ausente'])
    const e = estado(o, count ?? 0, agora)
    aberto = e === 'aberta' || e === 'lotada'
    if (!inscrito) participar = e === 'aberta' ? 'vaga' : e === 'lotada' ? 'espera' : null
  }
  const respondidoEm = resposta ? prazoLegivel(resposta.atualizado_em, agora) : null
  const tipo = ehTipo(o.tipo) ? TIPOS[o.tipo].rotulo : 'Oportunidade'

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoDaPagina titulo={o.titulo} sobretitulo={tipo} voltar={{ href: '/membro/oportunidades', rotulo: 'Oportunidades' }}
        descricao={pedido ? `Responda até ${prazoLegivel(o.fim, agora)}` : [quando(o.inicio, o.fim), o.local].filter(Boolean).join(' · ')} />
      {o.cancelada_em && <Recado tipo="erro" titulo="Cancelada pela coordenação.">{o.motivo_cancelamento && <p>{o.motivo_cancelamento}</p>}</Recado>}
      {o.descricao && <p className="max-w-prose whitespace-pre-line text-base wrap-break-word">{o.descricao}</p>}
      {!o.cancelada_em && (
        <FormularioDeResposta id={o.id} modo={pedido ? (o.tipo as 'aviso' | 'enquete' | 'quiz') : 'inscricao'} perguntas={perguntas}
          anteriores={resposta?.respostas ?? null} aberto={aberto} inscrito={inscrito} participar={participar} respondidoEm={respondidoEm}
          quiz={o.tipo === 'quiz' && resposta ? { nota: resposta.nota, acertos: resposta.acertos, total: resposta.total, aprovado: resposta.aprovado, tentativas: resposta.tentativas, minima: o.nota_minima ?? NOTA_MINIMA_PADRAO } : null} />
      )}
    </div>
  )
}
