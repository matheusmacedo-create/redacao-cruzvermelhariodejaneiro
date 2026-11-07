import Link from 'next/link'
import { CircleHelp } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { AncoraDaAjuda } from '@/components/app/ajuda/ancora'
import { TermoAberto } from '@/components/app/ajuda/blocos'
import { glossarioVisivel, letraDoTermo, termoDoGlossario, type Termo } from '@/lib/ajuda'
import { requireWorkspace } from '@/lib/session'
import { gruposDaPessoa } from '../grupos-da-pessoa'

export const metadata = { title: 'Glossário' }

/**
 * O glossário (docs/AJUDA.md §15): as palavras do Palácio Virtual em ordem alfabética, com âncora
 * (/ajuda/glossario#pauta), porque é para cá que a busca, o ⌘K e a aba "Palavras" do painel "?" apontam. Rota
 * estática: vence o /ajuda/[...area]. Aparecem só os termos de áreas que a pessoa abre (e os que não são de área
 * nenhuma), e o "Aparece em" leva só a essas áreas.
 */
export default async function GlossarioPage() {
  const context = await requireWorkspace({ escola: true })
  const grupos = await gruposDaPessoa(context)
  const areas = new Map(grupos.flatMap((g) => g.areas.map((a) => [a.href, a.rotulo] as const)))
  const termos = glossarioVisivel(grupos)
  const visiveis = new Set(termos.map((t) => t.id))
  const porLetra = new Map<string, Termo[]>()
  for (const t of termos) porLetra.set(letraDoTermo(t), [...(porLetra.get(letraDoTermo(t)) ?? []), t])

  return (
    <div className="mx-auto max-w-3xl">
      <AncoraDaAjuda />
      <PageHeader
        title="Glossário"
        description="As palavras do Palácio Virtual que nem todo mundo conhece, de “pauta” a “plaqueta”, explicadas em poucas frases. A busca da ajuda (e o ⌘K) também acha: escreva “o que é pauta”."
        breadcrumbs={[{ label: 'Central de ajuda', href: '/ajuda' }, { label: 'Glossário' }]}
      />

      <nav aria-label="Letras do glossário" className="-mt-2 mb-8 flex flex-wrap gap-1.5">
        {[...porLetra.keys()].map((letra) => (
          <a key={letra} href={`#letra-${letra.toLowerCase()}`} className="inline-flex size-11 items-center justify-center rounded-lg border border-border text-sm font-semibold hover:bg-muted sm:size-9">{letra}</a>
        ))}
      </nav>

      <div className="flex flex-col gap-10">
        {[...porLetra].map(([letra, lista]) => (
          <section key={letra} id={`letra-${letra.toLowerCase()}`} aria-labelledby={`titulo-letra-${letra.toLowerCase()}`} className="scroll-mt-6">
            <h2 id={`titulo-letra-${letra.toLowerCase()}`} className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/[0.08] text-primary" aria-hidden="true">{letra}</span>
              <span className="sr-only">Letra {letra}</span>
            </h2>
            <div className="flex flex-col gap-3">
              {lista.map((t) => (
                <TermoAberto
                  key={t.id}
                  termo={t}
                  areas={t.areas.flatMap((href) => (areas.has(href) ? [{ href, rotulo: areas.get(href)! }] : []))}
                  veja={(t.veja ?? []).flatMap((id) => {
                    const outro = visiveis.has(id) ? termoDoGlossario(id) : null
                    return outro ? [{ id: outro.id, termo: outro.termo }] : []
                  })}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-12 flex items-start gap-2 border-t border-border pt-6 text-sm text-muted-foreground">
        <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>Faltou uma palavra? Conte para a equipe pelo botão “?”, no fim da ajuda de qualquer tela, ou volte à <Link href="/ajuda" className="font-medium text-primary hover:underline">Central de ajuda</Link>.</span>
      </p>
    </div>
  )
}
