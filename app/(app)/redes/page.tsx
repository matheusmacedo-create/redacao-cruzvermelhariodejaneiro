import Link from 'next/link'
import { Globe, Pencil } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Card } from '@/components/ui/card'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { adapter } from '@/lib/publicacao/canais'
import { NovoPacoteBotao } from '@/components/app/hub/novo-pacote'
import { PainelDoCerebro } from '@/components/app/cerebro/painel'

export const dynamic = 'force-dynamic'

const STATUS_ROTULO: Record<string, { texto: string; classe: string }> = {
  rascunho: { texto: 'Rascunho', classe: 'bg-muted text-muted-foreground' },
  em_aprovacao: { texto: 'Em aprovação', classe: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  aprovado: { texto: 'Aprovado', classe: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-500' },
  parcial: { texto: 'Parcialmente publicado', classe: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  publicado: { texto: 'Publicado', classe: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-500' },
  falhou: { texto: 'Falhou', classe: 'bg-destructive/10 text-destructive' },
  arquivado: { texto: 'Arquivado', classe: 'bg-muted text-muted-foreground' },
}

/**
 * A porta do hub multicanal: a lista de pacotes.
 *
 * Um pacote é um conteúdo com N destinos — site, Instagram, Facebook, X… —
 * cada um com sua variante. O trabalho acontece dentro dele, em /redes/[id].
 */
export default async function RedesPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()

  const { data: pacotes } = await supabase
    .from('social_packages')
    .select('id,titulo_interno,status,updated_at,mestre')
    .eq('workspace_id', context.workspace.id)
    .neq('status', 'arquivado')
    .order('updated_at', { ascending: false })
    .limit(40)

  const ids = (pacotes ?? []).map((p) => p.id)
  const { data: destinos } = ids.length
    ? await supabase
        .from('package_destinations')
        .select('package_id,canal,estado')
        .in('package_id', ids)
    : { data: [] as { package_id: string; canal: string; estado: string }[] }

  const porPacote = new Map<string, { canal: string; estado: string }[]>()
  for (const d of destinos ?? []) {
    porPacote.set(d.package_id, [...(porPacote.get(d.package_id) ?? []), d])
  }

  const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

  // Histórico da tela anterior: continua legível, ninguém perde rastro.
  const { data: legado } = await supabase
    .from('social_publications')
    .select('id,networks,body,status,created_at')
    .eq('workspace_id', context.workspace.id)
    .order('created_at', { ascending: false })
    .limit(8)

  return (
    <div>
      <PageHeader
        title="Redes Sociais"
        description="Escreva uma vez, ajuste por canal e publique no site e em todas as contas oficiais."
        actions={<NovoPacoteBotao />}
      />

      {/* O Cérebro vem antes dos pacotes: é de onde eles podem nascer. */}
      <PainelDoCerebro />

      {(pacotes ?? []).length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm font-medium">Nenhum pacote ainda.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Comece por uma matéria, uma pauta ou um texto livre. Depois escolha os destinos — o site é um deles.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {(pacotes ?? []).map((p) => {
            const st = STATUS_ROTULO[p.status] ?? STATUS_ROTULO.rascunho
            const dests = porPacote.get(p.id) ?? []
            const m = (p.mestre ?? {}) as Record<string, string>
            const nome = p.titulo_interno || m.titulo || (m.corpo ? m.corpo.slice(0, 60) : 'Pacote sem título')
            return (
              <Link key={p.id} href={`/redes/${p.id}`}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/40">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{nome}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {dests.length
                        ? dests.map((d, i) => (
                            <span key={i} className="inline-flex items-center gap-0.5">
                              {d.canal === 'site_web' && <Globe className="size-3" />}
                              {adapter(d.canal)?.nome ?? d.canal}
                              {i < dests.length - 1 && ' ·'}
                            </span>
                          ))
                        : 'Sem destinos ainda'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.classe}`}>{st.texto}</span>
                    <span className="text-xs text-muted-foreground">{quando.format(new Date(p.updated_at))}</span>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      {(legado ?? []).length > 0 && (
        <div className="mt-8">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Pencil className="size-3.5" />Envios da tela anterior
          </h2>
          <Card className="divide-y divide-border">
            {(legado ?? []).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                <span className="min-w-0 truncate">{e.body?.slice(0, 70) || '(sem texto)'}</span>
                <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                  {(e.networks ?? []).join(', ')} · {e.status} · {quando.format(new Date(e.created_at))}
                </span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  )
}
