import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { CartaoDetalhado } from '@/components/app/cerebro/cartao-detalhado'
import { requireWorkspace } from '@/lib/session'
import { lerPautas, urlDoCerebro } from '@/lib/cerebro/cliente'
import { cn } from '@/lib/utils'

/**
 * O Cérebro, dentro da Redação.
 *
 * O Cérebro observa as contas oficiais do Rio, entende cada sinal por seis
 * perguntas e decide o que merece atenção. Ele não publica — esta tela é onde
 * a decisão humana acontece: importar a sugestão para o hub de Publicações ou
 * recusá-la com o motivo, que volta para o Cérebro e pesa nas próximas
 * leituras. O painel de Publicações mostra as seis primeiras; aqui está tudo.
 */

const FILTROS: { modo: string | null; rotulo: string; explica: string }[] = [
  { modo: null, rotulo: 'Sugestões', explica: 'O que pede ação: agir agora, produzir e agendar.' },
  { modo: 'agir_agora', rotulo: 'Agir agora', explica: 'Ruptura em curso. Cada hora custa relevância.' },
  { modo: 'produzir', rotulo: 'Produzir', explica: 'Pauta boa sem urgência de minutos.' },
  { modo: 'agendar', rotulo: 'Agendar', explica: 'Tem data certa. Entra no calendário.' },
  { modo: 'avaliar', rotulo: 'Avaliar', explica: 'Quase passou do corte. Um olho humano decide.' },
  { modo: 'monitorar', rotulo: 'Monitorar', explica: 'Informa a equipe; não vira peça por ora.' },
]

export default async function CerebroPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string }>
}) {
  const { modo } = await searchParams
  await requireWorkspace()

  const filtro = FILTROS.find((f) => f.modo === (modo || null)) ?? FILTROS[0]
  const { pautas, origem, geradoEm, erro } = await lerPautas(60, filtro.modo ?? undefined)

  const quando = geradoEm
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(geradoEm))
    : null

  return (
    <div>
      <PageHeader
        title="Cérebro"
        description="Leitura das contas oficiais do Rio: fato, raciocínio, plano por canal e o que não pode. O Cérebro recomenda; quem produz e publica é a Redação."
        actions={
          <a
            href={urlDoCerebro()}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Abrir o Cérebro
            <ExternalLink className="size-3.5" />
          </a>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f.rotulo}
            href={f.modo ? `/cerebro?modo=${f.modo}` : '/cerebro'}
            title={f.explica}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium',
              f.rotulo === filtro.rotulo
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {f.rotulo}
          </Link>
        ))}
        <Link
          href="/cerebro/mapa"
          className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted"
          title="Todas as ligações num grafo: eixos, fontes, sinais, calendário e pacotes."
        >
          ✳ Mapa
        </Link>
        {quando && (
          <span className="ml-auto text-xs text-muted-foreground">
            Atualizado {quando}
            {origem === 'seed' && ' · acervo semente, não dado vivo'}
          </span>
        )}
      </div>

      {erro ? (
        <Card className="border-dashed p-6 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Cérebro indisponível.</span> {erro} O resto da
          Redação não é afetado — tente de novo em instantes.
        </Card>
      ) : pautas.length === 0 ? (
        <Card className="border-dashed p-6 text-sm text-muted-foreground">
          Nada em <span className="font-medium text-foreground">{filtro.rotulo}</span> agora.{' '}
          {filtro.explica} Quando a leitura das fontes trouxer algo, aparece aqui.
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {pautas.map((p) => (
            <CartaoDetalhado key={p.id} pauta={p} />
          ))}
        </div>
      )}
    </div>
  )
}
