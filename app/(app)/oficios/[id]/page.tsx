import Link from 'next/link'
import { notFound } from 'next/navigation'
import { after } from 'next/server'
import { ChevronLeft } from 'lucide-react'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { createClient } from '@/lib/supabase/server'
import { urlBase } from '@/lib/newsletter/contexto'
import { processarFila } from '@/lib/oficios/carimbo'
import { ESTADOS, ehEstado, lerCanonico, tituloDoOficio, type EstadoDoOficio } from '@/lib/oficios/documento'
import { EditorDeOficio, type PessoaQueAssina } from '@/components/app/oficios/editor'
import { FolhaDoOficio } from '@/components/app/oficios/documento'
import { PainelDoOficio, type AssinanteNoPainel, type CarimboNoPainel } from '@/components/app/oficios/painel'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export default async function OficioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const context = await requireWorkspace()
  const supabase = await createClient()

  const [{ data: o }, { data: assinantes }, { data: carimbos }] = await Promise.all([
    supabase.from('oficios').select('*').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle(),
    supabase.from('oficio_assinantes').select('user_id,nome,cargo,ordem,estado,assinado_em,motivo_recusa').eq('oficio_id', id).order('ordem'),
    supabase.from('oficio_carimbos').select('estado,bloco,enviado_em,confirmado_em,ultimo_erro,calendarios').eq('oficio_id', id).order('created_at', { ascending: false }).limit(1),
  ])
  if (!o || !ehEstado(o.estado)) notFound()

  const voltar = (
    <Link href="/oficios" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Ofícios</Link>
  )

  if (o.estado === 'rascunho') {
    const { data: membros } = await supabase.from('workspace_members').select('user_id,profiles(full_name,job_title,active)').eq('workspace_id', context.workspace.id)
    const pessoas: PessoaQueAssina[] = (membros ?? []).flatMap((m) => {
      const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string; job_title?: string | null; active?: boolean } | null
      return p && p.active !== false ? [{ id: m.user_id as string, nome: p.full_name || 'Colaborador', cargo: p.job_title ?? null }] : []
    })
    const podeEditar = o.criado_por === context.user.id || pode(context.role, 'oficios.gerenciar_de_outros')
    return (
      <div className="flex flex-col gap-4">
        {voltar}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Novo ofício</h1>
          <p className="text-sm text-muted-foreground">Rascunho: ainda sem número. O número do ano vem na emissão, quando o texto é congelado para assinatura.</p>
        </div>
        <EditorDeOficio
          rascunho={{ ...o, emitente: context.workspace.name }}
          pessoas={pessoas}
          eu={context.user.id}
          podeEditar={podeEditar}
        />
      </div>
    )
  }

  const doc = lerCanonico(o.conteudo_canonico)
  if (!doc) notFound()
  const carimbo = carimbos?.[0]

  // Quem abre o ofício também empurra a fila: o carimbo avança mesmo sem o
  // agendador. A fila só pega o carimbo quando chegou a hora dele.
  if (carimbo && carimbo.estado !== 'confirmado') {
    after(async () => { await processarFila(1, id).catch(() => undefined) })
  }

  const lista: AssinanteNoPainel[] = (assinantes ?? []).map((a) => ({
    userId: a.user_id, nome: a.nome, cargo: a.cargo, estado: a.estado, assinadoEm: a.assinado_em, motivo: a.motivo_recusa,
  }))
  const carimboNoPainel: CarimboNoPainel = carimbo
    ? { estado: carimbo.estado, bloco: carimbo.bloco, enviadoEm: carimbo.enviado_em, confirmadoEm: carimbo.confirmado_em, ultimoErro: carimbo.ultimo_erro, calendarios: carimbo.calendarios ?? [] }
    : null
  const urlPublica = `${urlBase()}/verificar/${o.codigo_verificacao}`

  return (
    <div className="flex flex-col gap-4">
      {voltar}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{tituloDoOficio(doc.numero, doc.setor)}</h1>
        <span className="text-sm text-muted-foreground">{ESTADOS[o.estado as EstadoDoOficio].rotulo}</span>
      </div>
      <p className="-mt-2 text-sm text-muted-foreground">{doc.assunto}</p>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <FolhaDoOficio
          doc={doc}
          marcaDagua={o.estado === 'cancelado' ? 'Cancelado' : undefined}
          assinaturas={lista.map((a, i) => ({ ordem: i + 1, nome: a.nome, cargo: a.cargo, estado: a.estado, assinadoEm: a.assinadoEm }))}
          rodape={<>Conferência: <span className="break-all">{urlPublica}</span></>}
        />
        <PainelDoOficio
          id={o.id}
          estado={o.estado as 'em_assinatura' | 'assinado' | 'cancelado'}
          hashDocumento={o.hash_documento}
          hashManifesto={o.hash_manifesto}
          codigo={o.codigo_verificacao}
          urlPublica={urlPublica}
          eu={context.user.id}
          podeCancelar={o.criado_por === context.user.id || pode(context.role, 'oficios.gerenciar_de_outros')}
          assinantes={lista}
          carimbo={carimboNoPainel}
          motivoCancelamento={o.motivo_cancelamento}
        />
      </div>
    </div>
  )
}
