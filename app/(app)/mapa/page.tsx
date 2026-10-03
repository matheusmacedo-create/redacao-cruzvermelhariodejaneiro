import { PageHeader } from '@/components/app/page-header'
import { MapaDoEcossistema } from '@/components/app/mapa/mapa-do-ecossistema'
import { carregarMapa } from '@/lib/mapa/dados'
import { montarArvore, percentualNoAr } from '@/lib/mapa/modelo'
import { tituloDaArea } from '@/lib/navegacao'
import { pode } from '@/lib/permissoes'
import { requireWorkspace } from '@/lib/session'

export const metadata = { title: tituloDaArea('/mapa') }
export const dynamic = 'force-dynamic'

/**
 * O mapa do ecossistema: Palácio Virtual, site e plataforma da Escola numa
 * só árvore, com o estado de cada parte e as pendências que faltam. Os dados
 * vêm das tabelas `mapa_itens` e `mapa_pendencias`; marcar uma pendência ou
 * mudar um estado grava lá e a tela se refaz (docs/mapa-do-ecossistema.md).
 */
export default async function MapaPage() {
  const context = await requireWorkspace()
  const dados = await carregarMapa(context.workspace.id)
  const { raiz, orfaos } = montarArvore(dados.itens, dados.pendencias)
  const podeEditar = pode(context.role, 'mapa.editar')
  const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
  const descricao = raiz.total
    ? `${raiz.total} recursos em ${raiz.children.length} sistemas · ${percentualNoAr(raiz)}% no ar · ${raiz.pend} pendências abertas e ${raiz.feitas} resolvidas${dados.atualizadoEm ? ` · atualizado em ${dataCurta(dados.atualizadoEm)}` : ''}.`
    : 'O mapa ainda não tem dados neste espaço. Aplique a migração com a semente inicial para preenchê-lo.'
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Mapa do ecossistema" description={descricao} />
      {orfaos.length > 0 && (
        <p className="rounded-lg border border-warning/50 bg-warning/5 px-3 py-2 text-sm text-muted-foreground" role="status">
          {orfaos.length} {orfaos.length === 1 ? 'item ficou' : 'itens ficaram'} fora do mapa por não ter área conhecida: {orfaos.join(', ')}.
        </p>
      )}
      <MapaDoEcossistema itens={dados.itens} pendencias={dados.pendencias} podeEditar={podeEditar} />
    </div>
  )
}
