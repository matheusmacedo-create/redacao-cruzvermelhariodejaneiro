import { ExternalLink, MapPin } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { localizar } from '@/lib/apis-publicas/servidor'
import { urlDoMapa } from '@/lib/apis-publicas/regras'

/**
 * O local de uma ação no mapa (OpenStreetMap, endereço localizado pelo
 * Nominatim). Endereço vago ("sede", "a combinar") não é achado e o cartão
 * simplesmente não aparece — melhor nada do que um pino no lugar errado.
 */
export async function MapaDoLocal({ endereco, titulo = 'Onde é' }: { endereco: string | null | undefined; titulo?: string }) {
  const texto = String(endereco ?? '').trim()
  if (texto.length < 6) return null
  const ponto = await localizar(texto)
  if (!ponto) return null
  const { embutido, link } = urlDoMapa(ponto)
  const rota = `https://www.google.com/maps/dir/?api=1&destination=${ponto.lat},${ponto.lng}`
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><MapPin className="size-4 text-primary" />{titulo}</h2>
        <div className="flex gap-3 text-xs">
          <a href={rota} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Como chegar<ExternalLink className="size-3" /></a>
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:underline">Mapa maior<ExternalLink className="size-3" /></a>
        </div>
      </div>
      <iframe title={`Mapa: ${texto}`} src={embutido} loading="lazy" className="h-64 w-full border-t border-border" referrerPolicy="no-referrer" />
      <p className="px-4 py-2 text-[11px] text-muted-foreground">
        {texto} · localizado como “{ponto.nome.split(',').slice(0, 3).join(',')}” · © colaboradores do <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap</a>
      </p>
    </Card>
  )
}
