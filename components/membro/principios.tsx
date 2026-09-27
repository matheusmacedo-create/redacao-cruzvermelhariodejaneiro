import Link from 'next/link'
import { ChevronRight, Landmark, Smartphone } from 'lucide-react'
import { ORIGEM_DOS_PRINCIPIOS, PRINCIPIOS, REGRA_DO_PERFIL } from '@/lib/membro/principios'
import { CabecalhoDaPagina, Secao } from './pecas'

/**
 * O bloco fixo do Início: os sete nomes, cada um com a frase curta, e o
 * caminho para o texto oficial. Neutro, sem cruz desenhada (components/membro/marca.tsx).
 */
export function PrincipiosNoInicio() {
  return (
    <Secao titulo="Nossos Princípios Fundamentais" icone={Landmark} verTodos={{ href: '/membro/principios', rotulo: 'Ler na íntegra' }} id="principios">
      <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3" data-ajuda="membro.principios">
        {PRINCIPIOS.map((p, i) => (
          <li key={p.nome} className="flex gap-3 bg-card px-4 py-3">
            <span className="mt-0.5 w-4 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground" aria-hidden="true">{i + 1}</span>
            <span className="min-w-0">
              <span className="block font-semibold">{p.nome}</span>
              <span className="block text-sm text-muted-foreground">{p.resumo}</span>
            </span>
          </li>
        ))}
      </ol>
    </Secao>
  )
}

/** A página /membro/principios: o texto oficial de cada Princípio e o uso do emblema no perfil pessoal. */
export function PaginaDosPrincipios() {
  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaPagina titulo="Princípios Fundamentais" voltar={{ href: '/membro', rotulo: 'Início' }}
        descricao="Os sete Princípios guiam tudo o que a Cruz Vermelha faz, no Brasil e no mundo, e valem para cada voluntário em cada ação." />

      <section aria-labelledby="principios-titulo" className="flex flex-col gap-3">
        <h2 id="principios-titulo" className="sr-only">Os sete Princípios</h2>
        <ol className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {PRINCIPIOS.map((p, i) => (
            <li key={p.nome} id={p.nome.toLowerCase()} className="flex gap-4 px-4 py-4 sm:px-5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums" aria-hidden="true">{i + 1}</span>
              <div className="min-w-0">
                <h3 className="font-semibold">{p.nome}</h3>
                <p className="mt-1 text-sm leading-relaxed">{p.texto}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">{ORIGEM_DOS_PRINCIPIOS} Texto do Manual de Identidade Institucional da Cruz Vermelha Brasileira.</p>
      </section>

      <Secao titulo="O emblema no seu perfil pessoal" icone={Smartphone} id="emblema">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5" data-ajuda="membro.emblema">
          <ul className="flex flex-col gap-2 text-sm">
            {REGRA_DO_PERFIL.pontos.map((t) => (
              <li key={t} className="flex gap-2"><ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span>{t}</span></li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">{REGRA_DO_PERFIL.lei}</p>
          <details className="text-sm">
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium underline-offset-4 hover:underline">Ler a regra como está no manual</summary>
            <blockquote className="mt-1 border-l-2 border-border pl-3 text-muted-foreground">{REGRA_DO_PERFIL.texto}</blockquote>
            <p className="mt-2 text-xs text-muted-foreground">Regra 9 (“O Perfil”) das 12 regras para o uso do emblema nas mídias sociais.</p>
          </details>
        </div>
      </Secao>

      <p className="text-sm text-muted-foreground">
        Dúvida sobre como aplicar um Princípio numa ação? Fale com a coordenação em <Link href="/membro/mensagens" className="font-medium text-foreground underline underline-offset-4">Mensagens</Link>.
      </p>
    </div>
  )
}
