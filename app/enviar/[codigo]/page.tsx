import type { Metadata } from 'next'
import Link from 'next/link'
import { PaginaDeEnvio } from '@/components/enviar/pagina'
import { Recado } from '@/components/membro/pecas'
import { Moldura } from '@/app/autorizacao/moldura'
import { eventoPeloCodigo } from '@/lib/envios/eventos'

// O link de envio de um evento (docs/envio-de-acoes.md §9): o mesmo formulário
// de /enviar, e tudo o que chega por aqui cai no álbum do evento.
export const metadata: Metadata = {
  title: 'Mandar fotos do evento — Cruz Vermelha RJ',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}
export const dynamic = 'force-dynamic'

export default async function EnviarParaEvento({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  const evento = await eventoPeloCodigo(codigo)
  // Evento encerrado ou link errado: explica e oferece o /enviar comum (que continua chegando à comunicação).
  if (!evento) {
    return (
      <Moldura>
        <Recado tipo="aviso" titulo="Este evento não recebe mais fotos por este link">
          <p>O link foi encerrado ou está errado. Se você ainda tem fotos para mandar, use o envio comum: a comunicação junta ao evento.</p>
          <p className="mt-3"><Link href="/enviar" className="font-semibold text-primary underline">Mandar uma ação</Link></p>
        </Recado>
      </Moldura>
    )
  }
  return (
    <PaginaDeEnvio evento={{
      codigo: evento.codigo, nome: evento.nome, data: evento.data_do_evento, local: evento.local,
      album: evento.album_token ? `/album/${evento.album_token}` : null,
    }} />
  )
}
