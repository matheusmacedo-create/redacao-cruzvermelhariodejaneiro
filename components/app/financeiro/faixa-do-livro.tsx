import Link from 'next/link'
import { ArrowRightLeft, Building2, GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { cnpjLegivel } from '@/lib/compras/convites'
import { IDENTIDADE, noLivro, type Livro } from '@/lib/financeiro/livro'

type Empresa = { nome: string; cnpj: string | null }

/**
 * De quem são os livros desta tela, sem margem para dúvida: uma faixa com a
 * cor do livro (vermelho da filial, azul da Escola), o nome e o CNPJ, no
 * alto de todas as telas do Financeiro. O outro livro não se abre daqui por
 * troca: é outro endereço, e o link diz para onde vai.
 */
export function FaixaDoLivro({ livro, empresa, outroVisivel }: { livro: Livro; empresa: Empresa; outroVisivel: boolean }) {
  const escola = livro === 'escola'
  const Icone = escola ? GraduationCap : Building2
  const outro: Livro = escola ? 'filial' : 'escola'
  return (
    <section aria-label={IDENTIDADE[livro].titulo} data-livro={livro} data-ajuda="financeiro.livro"
      className={cn('mb-5 flex flex-col gap-3 rounded-xl border border-l-4 p-4 sm:flex-row sm:items-center sm:justify-between',
        escola ? 'border-sky-200 border-l-sky-700 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40' : 'border-primary/20 border-l-primary bg-primary/[0.04]')}>
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg text-white', escola ? 'bg-sky-700' : 'bg-primary')}>
          <Icone className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className={cn('text-[11px] font-bold uppercase tracking-wider', escola ? 'text-sky-800 dark:text-sky-300' : 'text-primary')}>{IDENTIDADE[livro].titulo}</p>
          <p className="truncate text-base font-semibold">{empresa.nome}</p>
          <p className="truncate text-xs text-muted-foreground">
            {empresa.cnpj ? `CNPJ ${cnpjLegivel(empresa.cnpj)}` : 'CNPJ não informado — complete em Cadastros → Empresa'}
            {' · '}{escola ? 'nada daqui entra nos livros da filial' : 'nada daqui entra nos livros da Escola'}
          </p>
        </div>
      </div>
      {outroVisivel && (
        <Link href={noLivro(outro, '/financeiro')} data-outro-livro
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground sm:self-auto">
          <ArrowRightLeft className="size-4" aria-hidden="true" />Ir para os {IDENTIDADE[outro].titulo.toLowerCase()}
        </Link>
      )}
    </section>
  )
}
