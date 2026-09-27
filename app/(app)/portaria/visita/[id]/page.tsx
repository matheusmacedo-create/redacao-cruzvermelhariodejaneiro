import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Building2, Clock, DoorOpen, LogOut, MessageSquareText } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { Retrato } from '@/components/membro/foto'
import { ResponderVisita, SeloDaResposta } from '@/components/app/portaria/resposta'
import { requireWorkspace } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { ehEquipeDaEscola } from '@/lib/permissoes'
import { COLUNAS_DA_VISITA, haQuanto, hora, situacaoDaVisita, urlDaFotoDoVisitante, type Visita } from '@/lib/portaria/regras'

export const metadata = { title: 'Visita na portaria' }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * A visita que chegou para você (o link do aviso da portaria): quem é, de onde
 * vem e o motivo, e os três botões da resposta. Abre para quem é visitado
 * (também a equipe da Escola, que recebe visita) e para a portaria.
 */
export default async function VisitaNaPortaria({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const context = await requireWorkspace({ escola: true })
  const admin = createAdminClient()
  const { data } = await admin.from('portaria_visitas').select(COLUNAS_DA_VISITA).eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  const v = data as Visita | null
  const daPortaria = !ehEquipeDaEscola(context.role)
  // A foto passa pela rota da portaria, que é só da equipe da portaria: quem é da Escola vê as iniciais.
  if (!v || (v.visitado_id !== context.user.id && !daPortaria)) notFound()
  const [{ data: visitado }, { data: autor }] = await Promise.all([
    v.visitado_id ? admin.from('profiles').select('full_name').eq('id', v.visitado_id).maybeSingle() : Promise.resolve({ data: null }),
    v.resposta_por ? admin.from('profiles').select('full_name').eq('id', v.resposta_por).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const situacao = situacaoDaVisita(v)
  const souEu = v.visitado_id === context.user.id
  const nomeDoVisitado = (visitado?.full_name as string | null)?.trim() || null

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title={souEu ? `${v.nome} chegou para falar com você` : `Visita de ${v.nome}`}
        description={souEu ? 'Diga à portaria o que fazer. A resposta chega na hora para quem está na recepção.' : `Visita para ${nomeDoVisitado ?? v.visitado_texto ?? 'a filial'}.`}
        actions={daPortaria ? <Button variant="outline" render={<Link href="/portaria" />}><ArrowLeft className="size-4" />Portaria</Button> : undefined} />

      <Card className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <Retrato url={daPortaria ? urlDaFotoDoVisitante(v.id, v.foto_path) : null} nome={v.nome} className="size-16 text-lg" alt={v.foto_path ? `Foto de ${v.nome}` : ''} />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">{v.nome}</p>
            <ul className="mt-1 flex flex-col gap-1 text-sm text-muted-foreground">
              {v.empresa && <li className="flex items-center gap-1.5"><Building2 className="size-4 shrink-0" aria-hidden="true" />{v.empresa}</li>}
              {v.motivo && <li className="flex items-center gap-1.5"><MessageSquareText className="size-4 shrink-0" aria-hidden="true" />{v.motivo}</li>}
              {v.entrada_em && <li className="flex items-center gap-1.5"><Clock className="size-4 shrink-0" aria-hidden="true" />Chegou às {hora(v.entrada_em)} ({haQuanto(v.entrada_em)})</li>}
            </ul>
            {v.visitado_id && situacao === 'dentro' && (
              <SeloDaResposta resposta={v.resposta} quem={souEu ? 'você' : nomeDoVisitado} recado={v.resposta_recado}
                quando={v.resposta_em ? `${hora(v.resposta_em)}${autor?.full_name && v.resposta_por !== context.user.id ? ` por ${autor.full_name}` : ''}` : null} pelo={v.resposta_canal} />
            )}
          </div>
        </div>

        {situacao === 'dentro' && v.visitado_id ? (
          <ResponderVisita id={v.id} atual={v.resposta} nomeDoVisitante={v.nome} />
        ) : situacao === 'saiu' ? (
          <p className="flex items-center gap-2 rounded-lg bg-muted/50 px-4 py-3 text-sm"><LogOut className="size-4" aria-hidden="true" />{v.nome} já saiu da filial{v.saida_em ? ` às ${hora(v.saida_em)}` : ''}.</p>
        ) : (
          <p className="flex items-center gap-2 rounded-lg bg-muted/50 px-4 py-3 text-sm"><DoorOpen className="size-4" aria-hidden="true" />Esta visita não está mais na portaria.</p>
        )}
      </Card>
    </div>
  )
}
