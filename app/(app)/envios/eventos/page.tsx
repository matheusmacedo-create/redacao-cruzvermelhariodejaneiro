import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Images } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Card } from '@/components/ui/card'
import { FichaDoEvento } from '@/components/app/envios/eventos'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { avaliaEnvios } from '@/lib/envios/servidor'

export const metadata = { title: 'Eventos e álbuns' }

type Linha = {
  id: string; nome: string; data_do_evento: string | null; local: string | null; album_token: string | null; envio_aberto: boolean
  envios: { id: string; envio_arquivos: { categoria: string; estado: string; oculto_no_album: boolean }[] }[]
}

/**
 * Os eventos (docs/envio-de-acoes.md §9): cada um junta num álbum os envios
 * de quem esteve lá. Só quem avalia os envios vê e cria.
 */
export default async function EventosPage() {
  const context = await requireWorkspace()
  if (!(await avaliaEnvios(context.user.id, context.workspace.id))) notFound()
  const supabase = await createClient()
  const { data, error } = await supabase.from('envio_eventos')
    .select('id, nome, data_do_evento, local, album_token, envio_aberto, envios(id, envio_arquivos(categoria, estado, oculto_no_album))')
    .eq('workspace_id', context.workspace.id).order('criado_em', { ascending: false }).limit(200)
  const eventos = (data ?? []) as unknown as Linha[]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Eventos e álbuns"
        description="Crie o evento antes de ele acontecer: quem estiver lá manda as fotos pelo link dele, e tudo cai num álbum que todo mundo vê e baixa."
        breadcrumbs={[{ label: 'Envios da equipe', href: '/envios' }, { label: 'Eventos' }]}
      />
      <Card className="p-4" data-ajuda="eventos.novo">
        <h2 className="mb-3 text-sm font-semibold">Novo evento</h2>
        <FichaDoEvento />
      </Card>
      {error ? (
        <Card className="p-6 text-sm">{error.code === '42P01' || error.code === 'PGRST205' ? 'O banco ainda não tem a tabela dos eventos (migração 20260928080000_cvrj_album_do_evento).' : 'Não foi possível ler os eventos agora.'}</Card>
      ) : !eventos.length ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum evento ainda.</Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-ajuda="eventos.lista">
          {eventos.map((ev) => {
            const arquivos = ev.envios.flatMap((e) => e.envio_arquivos).filter((a) => a.estado === 'recebido' && !a.oculto_no_album)
            const fotos = arquivos.filter((a) => a.categoria === 'foto').length
            const videos = arquivos.filter((a) => a.categoria === 'video').length
            return (
              <li key={ev.id}>
                <Link href={`/envios/eventos/${ev.id}`} className="flex h-full flex-col gap-1.5 rounded-xl border border-border bg-card p-4 hover:shadow-md">
                  <span className="flex items-center gap-2 font-semibold"><Images className="size-4 text-primary" aria-hidden="true" />{ev.nome}</span>
                  <span className="text-sm text-muted-foreground">{[ev.data_do_evento?.split('-').reverse().join('/'), ev.local].filter(Boolean).join(' · ') || 'Sem data nem local'}</span>
                  <span className="text-sm">{ev.envios.length} {ev.envios.length === 1 ? 'envio' : 'envios'} · {fotos} {fotos === 1 ? 'foto' : 'fotos'}{videos ? ` · ${videos} ${videos === 1 ? 'vídeo' : 'vídeos'}` : ''}</span>
                  <span className="mt-auto flex flex-wrap gap-1.5 pt-1 text-[11px]">
                    <span className={ev.envio_aberto ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200' : 'rounded-full bg-muted px-2 py-0.5 text-muted-foreground'}>{ev.envio_aberto ? 'recebendo fotos' : 'envio encerrado'}</span>
                    <span className={ev.album_token ? 'rounded-full bg-primary/10 px-2 py-0.5 text-primary' : 'rounded-full bg-muted px-2 py-0.5 text-muted-foreground'}>{ev.album_token ? 'álbum compartilhado' : 'álbum desligado'}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
