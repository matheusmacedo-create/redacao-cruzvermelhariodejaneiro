import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FileText } from 'lucide-react'
import { CabecalhoDaPagina, Recado } from '@/components/membro/pecas'
import { FormularioDeAutorizacao } from '@/components/autorizacao/formulario'
import { coletaPeloToken } from '@/lib/imagem/servidor'
import { PARAGRAFOS_DO_TERMO, TERMO_VERSAO, TITULO_DO_TERMO } from '@/lib/imagem/termo'
import { Moldura } from '../moldura'

// Página pública, sem login: o link (e o QR code) que a equipe manda a quem
// aparece nas fotos. Fora do Google e sem mandar o endereço (com o token) adiante.
export const metadata: Metadata = {
  title: 'Autorização de uso de imagem — Cruz Vermelha RJ',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}
export const dynamic = 'force-dynamic'

export default async function Autorizacao({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const coleta = await coletaPeloToken(token)
  if (!coleta) notFound()
  const base = `/api/publico/autorizacao/${encodeURIComponent(token)}/foto`
  return (
    <Moldura>
      <CabecalhoDaPagina
        sobretitulo="Autorização de uso de imagem"
        titulo={coleta.titulo}
        descricao={coleta.descricao || 'Você aparece nestas fotos. Para a Cruz Vermelha poder divulgá-las, precisamos da sua autorização — leva um minuto.'}
      />
      {!coleta.aberta ? (
        <Recado tipo="aviso" titulo="Este link não aceita mais assinaturas">{coleta.motivo}</Recado>
      ) : (
        <>
          <section aria-labelledby="fotos" className="flex flex-col gap-3">
            <h2 id="fotos" className="text-base font-semibold">As fotos ({coleta.fotos.length})</h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {coleta.fotos.map((f) => (
                <li key={f.id} className="overflow-hidden rounded-lg border border-border bg-card">
                  {f.imagem ? (
                    <a href={`${base}/${f.id}`} target="_blank" rel="noreferrer" className="block">
                      <img src={`${base}/${f.id}`} alt={`Foto ${f.nome}`} loading="lazy" className="aspect-square w-full object-cover" />
                    </a>
                  ) : (
                    <div className="flex aspect-square flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted-foreground">
                      <FileText className="size-6" aria-hidden="true" /><span className="line-clamp-2 break-all">{f.nome}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Toque numa foto para ver maior.</p>
          </section>

          <section aria-labelledby="termo" className="flex flex-col gap-2">
            <h2 id="termo" className="text-base font-semibold">{TITULO_DO_TERMO}</h2>
            <div className="max-h-72 overflow-y-auto rounded-xl border border-border bg-card p-4 text-sm leading-relaxed" tabIndex={0}>
              {PARAGRAFOS_DO_TERMO.map((p, i) => <p key={i} className="mb-3 last:mb-0">{i + 1}. {p}</p>)}
              <p className="mt-3 text-xs text-muted-foreground">Versão {TERMO_VERSAO}</p>
            </div>
          </section>

          <div className="relative rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <FormularioDeAutorizacao token={token} />
          </div>
        </>
      )}
    </Moldura>
  )
}
