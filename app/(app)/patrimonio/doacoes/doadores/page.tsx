import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { EditarDoador } from '@/components/app/patrimonio/doacoes'
import { contextoDoPatrimonio } from '@/lib/patrimonio/acesso'
import { documentoFormatado } from '@/lib/patrimonio/doacoes'

export const metadata = { title: 'Doadores' }
export const dynamic = 'force-dynamic'

const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBr = (d: string) => d.split('-').reverse().join('/')

/** Quem doa itens: quanto já doou e quando foi a última vez (para agradecer e voltar a pedir). */
export default async function DoadoresPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 1) notFound()
  const ws = context.workspace.id
  const [{ data: doadores }, { data: recebidas }] = await Promise.all([
    supabase.from('doa_doadores').select('id,tipo,nome,documento,email,telefone,observacao').eq('workspace_id', ws).order('nome').limit(5000),
    supabase.from('doa_recebimentos').select('doador_id,data,valor_total').eq('workspace_id', ws).not('doador_id', 'is', null).limit(50000),
  ])
  const total = new Map<string, { valor: number; vezes: number; ultima: string }>()
  for (const r of recebidas ?? []) {
    const t = total.get(r.doador_id as string) ?? { valor: 0, vezes: 0, ultima: '' }
    t.valor += Number(r.valor_total); t.vezes++; if ((r.data as string) > t.ultima) t.ultima = r.data as string
    total.set(r.doador_id as string, t)
  }
  const termo = (sp.q ?? '').trim().toLowerCase()
  const digitos = termo.replace(/\D/g, '')
  const lista = (doadores ?? []).filter((d) => !termo || (d.nome as string).toLowerCase().includes(termo) || (digitos.length >= 3 && ((d.documento as string | null) ?? '').includes(digitos)) || ((d.email as string | null) ?? '').includes(termo))
    .sort((a, b) => (total.get(b.id as string)?.valor ?? 0) - (total.get(a.id as string)?.valor ?? 0))
  return (
    <div className="flex flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio/doacoes" nivel={nivel} />
      <PageHeader title="Doadores" description="Pessoas e empresas que doaram itens. O cadastro é feito ao receber a doação." />
      <form className="flex gap-2" role="search">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input name="q" defaultValue={sp.q ?? ''} placeholder="Nome, CPF/CNPJ ou e-mail" aria-label="Buscar" className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm" />
        </div>
        <Button type="submit" variant="outline">Buscar</Button>
      </form>
      <Card className="overflow-hidden p-0">
        {!lista.length ? <p className="p-10 text-center text-sm text-muted-foreground">{(doadores ?? []).length ? 'Ninguém com esta busca.' : <>Nenhum doador ainda. Cadastre ao <Link href="/patrimonio/doacoes/receber" className="text-primary hover:underline">receber uma doação</Link>.</>}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm" id="doadores">
              <thead><tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5">Doador</th><th className="px-3 py-2.5">Contato</th><th className="px-3 py-2.5 text-right">Doações</th><th className="px-3 py-2.5 text-right">Total doado</th><th className="w-10 px-3 py-2.5" />
              </tr></thead>
              <tbody>
                {lista.map((d) => {
                  const t = total.get(d.id as string)
                  return (
                    <tr key={d.id as string} className="border-b border-border last:border-0">
                      <td className="px-3 py-3">{d.nome as string}<span className="block text-xs text-muted-foreground">{d.tipo === 'pj' ? 'Empresa' : 'Pessoa'}{d.documento ? ` · ${documentoFormatado(d.documento as string)}` : ''}</span></td>
                      <td className="px-3 py-3 text-xs">{[d.email, d.telefone].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="px-3 py-3 text-right text-xs tabular-nums">{t ? `${t.vezes} · última ${dataBr(t.ultima)}` : '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{reais(t?.valor ?? 0)}</td>
                      <td className="px-3 py-3">{nivel >= 2 && <EditarDoador doador={{ id: d.id as string, nome: d.nome as string, documento: d.documento as string | null, email: d.email as string | null, telefone: d.telefone as string | null, observacao: d.observacao as string | null }} />}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
