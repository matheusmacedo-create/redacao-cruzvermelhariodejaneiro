import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { categoriaDaUrl, categoriaLegivel, conversasDoMembro, dataEHora, quandoFoi, situacaoDaConversa } from '@/lib/membro/canal'
import { cn } from '@/lib/utils'
import { CaixaDeMensagens, SeloDaConversa } from '@/components/membro/canal'

export const dynamic = 'force-dynamic'

// O template do layout completa: "Mensagens · Área do Voluntário".
export const metadata: Metadata = { title: 'Mensagens' }

/**
 * O canal direto com a coordenação do Voluntariado. As sub-abas (Conversas ·
 * Avisos) vêm do layout. `?nova=<categoria>` abre a nova mensagem já com a
 * categoria (o "Pedir correção" do Perfil usa `?nova=documentos`).
 */
export default async function Mensagens({ searchParams }: { searchParams: Promise<{ nova?: string | string[] }> }) {
  const m = await exigirMembro()
  const [conversas, { nova }] = await Promise.all([conversasDoMembro(m), searchParams])
  // Um `agora` só para a lista inteira: "há 5 min" e "ontem" contam do mesmo instante.
  const agora = new Date()
  return (
    <CaixaDeMensagens categoria={categoriaDaUrl(nova)} vazia={!conversas.length}>
      <ul id="conversas" aria-label="Conversas" className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {conversas.map((c) => {
          const situacao = situacaoDaConversa(c, { naLista: true })
          const respostaNova = situacao.chave === 'nova'
          return (
            <li key={c.id}>
              {/* Contorno do foco para dentro: a lista corta o que passa da borda. */}
              <Link href={`/membro/mensagens/${c.id}`} className="flex min-h-12 items-center gap-3 px-4 py-3 hover:bg-muted/60 focus-visible:-outline-offset-2">
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={cn('min-w-0 truncate', respostaNova ? 'font-semibold' : 'font-medium')}>
                      {/* O selo "Resposta nova" é visual; o leitor de tela ouve isto antes do assunto. */}
                      {respostaNova && <span className="sr-only">Nova resposta: </span>}{c.assunto}
                    </span>
                    <time dateTime={c.atualizada_em} title={dataEHora(c.atualizada_em)} className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{quandoFoi(c.atualizada_em, agora)}</time>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span aria-hidden={respostaNova || undefined} className="inline-flex max-w-full"><SeloDaConversa {...situacao} /></span>
                    <span>{categoriaLegivel(c.categoria)}</span>
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          )
        })}
      </ul>
    </CaixaDeMensagens>
  )
}
