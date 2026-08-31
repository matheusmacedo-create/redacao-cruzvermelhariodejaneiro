import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { TabelaDoRegistro, type LinhaDoRegistro } from '@/components/app/registro/tabela'
import { adapter, formatoDoAdapter } from '@/lib/publicacao/canais'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Quantas linhas a tela carrega. Uma redação leva anos para passar disso. */
const LIMITE = 300

type DestinoDoRegistro = {
  id: string
  package_id: string
  canal: string
  formato: string
  estado: string
  corpo: string | null
  extras: Record<string, unknown> | null
  external_url: string | null
  erro: string | null
  request_id: string | null
  publicado_em: string | null
  updated_at: string
  social_packages: { titulo_interno: string | null; mestre: Record<string, unknown> | null } | null
}

/** O nome que a pessoa reconhece: o título da página, o do pacote, ou o texto. */
function tituloDaLinha(d: DestinoDoRegistro): string {
  const extras = (d.extras ?? {}) as Record<string, string>
  const mestre = (d.social_packages?.mestre ?? {}) as Record<string, string>
  const candidatos = [
    extras.titulo,
    d.social_packages?.titulo_interno ?? '',
    mestre.titulo,
    (d.corpo ?? '').replace(/\s+/g, ' ').trim().slice(0, 70),
  ]
  return candidatos.find((c) => c && c.trim()) || 'Sem título'
}

/**
 * O registro de tudo o que a Redação colocou no ar.
 *
 * Existe para responder três perguntas que ninguém devia ter de perseguir no
 * banco nem na memória: o que saiu, quando, e em qual endereço. Mostra também
 * o que falhou — um registro que só conta os acertos não serve para prestar
 * contas nem para achar o que ficou pelo caminho.
 */
export default async function RegistroPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()

  const { data } = await supabase
    .from('package_destinations')
    .select('id,package_id,canal,formato,estado,corpo,extras,external_url,erro,publicado_em,updated_at,request_id,social_packages(titulo_interno,mestre)')
    .eq('workspace_id', context.workspace.id)
    .in('estado', ['publicada', 'falhou'])
    .order('updated_at', { ascending: false })
    .limit(LIMITE)

  const linhas: LinhaDoRegistro[] = ((data ?? []) as unknown as DestinoDoRegistro[]).map((d): LinhaDoRegistro => {
    const canal = adapter(d.canal)
    const formato = canal ? formatoDoAdapter(canal, d.formato) : undefined
    return {
      id: d.id,
      canal: d.canal,
      canalNome: canal?.nome ?? d.canal,
      formato: formato?.rotulo ?? d.formato,
      estado: d.estado === 'publicada' ? 'publicada' : 'falhou',
      titulo: tituloDaLinha(d),
      url: d.external_url,
      erro: d.erro,
      // Publicada tem a data do carimbo; falhou tem a do último toque, que é
      // quando a tentativa aconteceu.
      quando: d.publicado_em ?? d.updated_at,
      pacoteId: d.package_id,
    }
  })
    // A ordem tem de ser a do fato, e o fato de uma falha é a tentativa. Pedir
    // isso ao banco exigiria ordenar por coalesce(publicado_em, updated_at) —
    // que o cliente não expressa —, e ordenar só por publicado_em jogaria toda
    // falha para o fim da lista, fora da linha do tempo.
    .sort((a, b) => b.quando.localeCompare(a.quando))

  // Publicada em rede sem endereço do post é envio cujo resultado ainda não
  // voltou do conector — dá para perguntar, e é isso que o botão faz.
  const temPendentes = ((data ?? []) as unknown as DestinoDoRegistro[]).some(
    (d) => d.canal !== 'site_web' && d.estado === 'publicada' && !d.external_url && Boolean(d.request_id),
  )

  return (
    <div>
      <PageHeader
        title="Registro"
        description="Tudo o que foi publicado: quando saiu, em qual canal e em qual endereço. Inclui o que falhou."
      />
      {linhas.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm font-medium">Nada publicado ainda.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Assim que um destino for ao ar, ele aparece aqui com a data e o endereço.
          </p>
        </Card>
      ) : (
        <TabelaDoRegistro linhas={linhas} temPendentes={temPendentes} />
      )}
    </div>
  )
}
