import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { PageHeader } from '@/components/app/page-header'
import { Card } from '@/components/ui/card'
import { FichaDoEvento, FotosDoEvento, LinkDoEvento } from '@/components/app/envios/eventos'
import { requireWorkspace } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import { urlAssinada } from '@/lib/armazenamento/r2'
import { armazenamento, avaliaEnvios } from '@/lib/envios/servidor'
import { arquivosDoEvento } from '@/lib/envios/eventos'
import { resumoDoAlbum } from '@/lib/envios/album'
import { ESTADOS_DO_ENVIO, type EstadoDoEnvio } from '@/lib/envios/regras'

export const metadata = { title: 'Evento' }

const qrDe = (url: string) => QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 480, color: { dark: '#1a1a1a', light: '#ffffff' } })

export default async function EventoPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireWorkspace()
  const ws = context.workspace.id
  if (!(await avaliaEnvios(context.user.id, ws))) notFound()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()

  // Quem avalia é conferido acima; o cliente de serviço lê as chaves do R2 para as miniaturas.
  const admin = createAdminClient()
  const { data: ev } = await admin.from('envio_eventos').select('id, nome, data_do_evento, local, codigo, album_token, envio_aberto').eq('id', id).eq('workspace_id', ws).maybeSingle()
  if (!ev) notFound()
  const [arquivos, { data: envios }, { data: chaves }] = await Promise.all([
    arquivosDoEvento(admin, ev.id),
    admin.from('envios').select('id, protocolo, nome, titulo, estado, criado_em').eq('evento_id', ev.id).order('criado_em'),
    admin.from('envio_arquivos').select('id, chave, miniatura, envios!inner(evento_id)').eq('envios.evento_id', ev.id),
  ])
  const r2 = armazenamento()
  const chaveDe = new Map(((chaves ?? []) as { id: string; chave: string; miniatura: string | null }[]).map((c) => [c.id, c.miniatura ?? c.chave]))

  const base = urlBase()
  const linkDeEnvio = `${base}/enviar/${ev.codigo}`
  const linkDoAlbum = ev.album_token ? `${base}/album/${ev.album_token}` : null
  const [qrEnvio, qrAlbum] = await Promise.all([qrDe(linkDeEnvio), linkDoAlbum ? qrDe(linkDoAlbum) : Promise.resolve(null)])
  const visiveis = arquivos.filter((a) => !a.oculto)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={ev.nome}
        description={`${resumoDoAlbum(visiveis)} no álbum${arquivos.length > visiveis.length ? ` (${arquivos.length - visiveis.length} escondida${arquivos.length - visiveis.length === 1 ? '' : 's'})` : ''}.`}
        breadcrumbs={[{ label: 'Envios da equipe', href: '/envios' }, { label: 'Eventos', href: '/envios/eventos' }, { label: ev.nome }]}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <div data-ajuda="eventos.link-de-envio">
          <LinkDoEvento
            eventoId={ev.id} aoAlternar="envio" ligado={ev.envio_aberto}
            titulo="Link de envio do evento" url={linkDeEnvio} qr={qrEnvio} arquivoDoQr="qr-enviar-fotos-do-evento.png"
            descricao="Mande no grupo de quem vai estar no evento, ou imprima o QR. Quem manda por aqui cai direto neste álbum, sem login."
            rotuloLigar="Reabrir o envio" rotuloDesligar="Encerrar o envio"
            avisoAoDesligar="Encerrar o link de envio? Quem abrir depois vê um aviso e pode mandar pelo envio comum."
          />
        </div>
        <div data-ajuda="eventos.link-do-album">
          <LinkDoEvento
            eventoId={ev.id} aoAlternar="album" ligado={Boolean(ev.album_token)}
            titulo="Link do álbum" url={linkDoAlbum} qr={qrAlbum} arquivoDoQr="qr-album-do-evento.png"
            descricao="Quem tem este link vê todas as fotos e baixa, uma a uma ou tudo num .zip — sem login e fora do Google. Quem mandou pelo link do evento também vê o álbum no fim do envio."
            rotuloLigar="Ligar o álbum (link novo)" rotuloDesligar="Desligar o álbum"
            avisoAoDesligar="Desligar o álbum? O link atual para de funcionar na hora. Se religar, o link será outro."
          />
        </div>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Fotos e vídeos</h2>
        <FotosDoEvento fotos={arquivos.map((a) => ({
          id: a.id, categoria: a.categoria, autor: a.autor, envioId: a.envioId, oculto: a.oculto,
          miniatura: r2 && chaveDe.get(a.id) ? urlAssinada(r2.config, r2.bucket, chaveDe.get(a.id)!, 'GET', 3600) : '',
        }))} />
      </Card>

      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Envios deste evento</h2>
          {envios?.length ? (
            <ul className="divide-y divide-border">
              {(envios as { id: string; protocolo: string; nome: string; titulo: string; estado: EstadoDoEnvio }[]).map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                  <Link href={`/envios/${e.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{e.titulo}</Link>
                  <span className="shrink-0 text-muted-foreground">{e.nome} · {e.protocolo} · {ESTADOS_DO_ENVIO[e.estado]}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Nenhum envio ainda. Envios que chegaram pelo link comum podem ser juntados a este evento na tela de cada um.</p>}
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Ficha do evento</h2>
          <FichaDoEvento id={ev.id} estreita inicial={{ nome: ev.nome, data: ev.data_do_evento, local: ev.local }} />
        </Card>
      </div>
    </div>
  )
}
