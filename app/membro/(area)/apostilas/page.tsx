import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, FileText, GraduationCap } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { agruparApostilas, apostilasDoMembro } from '@/lib/membro/cursos'
import { CabecalhoDaPagina, EstadoVazio, LinkExterno, Recado, Secao } from '@/components/membro/pecas'
import { botaoSecundario } from '@/components/membro/marca'

export const dynamic = 'force-dynamic'

// O template do layout completa: "Apostilas · Área do Voluntário".
export const metadata: Metadata = { title: 'Apostilas' }

const tamanho = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`)

/**
 * As apostilas publicadas. Cada uma abre o PDF em nova aba (pela rota que
 * confere a sessão); se o arquivo falhar, a rota volta para cá com
 * `?erro=indisponivel` e o recado explica, em vez de uma página em branco.
 */
export default async function Apostilas({ searchParams }: { searchParams: Promise<{ erro?: string | string[] }> }) {
  const m = await exigirMembro()
  const [lista, { erro }] = await Promise.all([apostilasDoMembro(m), searchParams])
  const grupos = agruparApostilas(lista)
  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaPagina titulo="Apostilas" descricao="Materiais de estudo e consulta da Cruz Vermelha RJ." />
      {erro === 'indisponivel' && (
        <Recado tipo="erro" acao={<Link href="/membro/mensagens?nova=outro" className={botaoSecundario}>Avisar a coordenação</Link>}>
          Não foi possível abrir essa apostila agora. Tente de novo ou avise a coordenação.
        </Recado>
      )}
      {grupos.length ? grupos.map((g) => (
        <Secao key={g.cursoId ?? 'gerais'} titulo={g.titulo} icone={g.cursoId ? GraduationCap : BookOpen} id={g.cursoId ? `apostilas-${g.cursoId}` : 'apostilas-gerais'}
          verTodos={g.cursoId ? { href: `/membro/cursos/${g.cursoId}`, rotulo: 'Ver curso' } : undefined}>
          <ul className="grid gap-3 sm:grid-cols-2">
            {g.itens.map((a) => (
              <li key={a.id} className="min-w-0">
                <LinkExterno href={`/membro/apostilas/${a.id}`} className="flex h-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-foreground transition-colors hover:border-foreground/20">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"><FileText className="size-5 text-muted-foreground" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium wrap-break-word">{a.titulo}</span>
                    {a.descricao && <span className="mt-0.5 block text-sm text-muted-foreground">{a.descricao}</span>}
                    <span className="mt-1 block text-xs font-medium text-muted-foreground">Abrir PDF · {tamanho(a.tamanho)}</span>
                  </span>
                </LinkExterno>
              </li>
            ))}
          </ul>
        </Secao>
      )) : (
        <EstadoVazio icone={FileText} titulo="Nenhuma apostila publicada ainda." texto="Quando a coordenação publicar materiais de estudo, eles aparecem aqui."
          acao={<Link href="/membro/cursos" className={botaoSecundario}><GraduationCap className="size-4" aria-hidden="true" />Ver cursos</Link>} />
      )}
    </div>
  )
}
