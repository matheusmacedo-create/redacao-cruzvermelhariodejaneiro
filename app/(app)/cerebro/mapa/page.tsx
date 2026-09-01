import Link from 'next/link'
import { ExternalLink, LayoutGrid } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { GrafoDoCerebro } from '@/components/app/cerebro/grafo'
import { requireWorkspace } from '@/lib/session'
import { lerGrafo } from '@/lib/cerebro/grafo'
import { urlDoCerebro } from '@/lib/cerebro/cliente'

export const dynamic = 'force-dynamic'

/**
 * O Mapa do Cérebro — as ligações, como no grafo do Obsidian.
 *
 * Os cinco eixos são os polos; em volta deles, as contas observadas, os
 * sinais que produziram, as datas do calendário com as propostas penduradas
 * — e a camada da Redação: o que virou pacote e onde foi publicado. É o
 * repertório inteiro numa tela: o que o Cérebro sabe e o que a equipe já
 * fez com isso.
 */
export default async function MapaPage() {
  const context = await requireWorkspace()
  const { nos, arestas, origem, geradoEm, erro } = await lerGrafo(context.workspace.id)

  const quando = geradoEm
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(geradoEm))
    : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Cérebro · Mapa"
        description={`Todas as ligações: eixos, fontes, sinais, calendário e o que já virou pacote.${
          quando ? ` Atualizado ${quando}.` : ''
        }${origem === 'seed' ? ' Atenção: acervo semente, não dado vivo.' : ''}`}
        actions={
          <div className="flex items-center gap-3">
            <Link
              href="/cerebro"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <LayoutGrid className="size-3.5" />
              Ver em cartões
            </Link>
            <a
              href={urlDoCerebro()}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Abrir o Cérebro
              <ExternalLink className="size-3.5" />
            </a>
          </div>
        }
      />

      {erro ? (
        <Card className="border-dashed p-6 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Cérebro indisponível.</span> {erro} O resto
          da Redação não é afetado — tente de novo em instantes.
        </Card>
      ) : nos.length === 0 ? (
        <Card className="border-dashed p-6 text-sm text-muted-foreground">
          O mapa está vazio — o Cérebro ainda não devolveu nós. Tente de novo em instantes.
        </Card>
      ) : (
        // O grafo precisa de altura real dentro do layout rolável do app.
        <div className="h-[calc(100dvh-220px)] min-h-[420px]">
          <GrafoDoCerebro nos={nos} arestas={arestas} />
        </div>
      )}
    </div>
  )
}
