import Link from 'next/link'
import { Download, Link2, Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { linkAberto, USOS, VINCULOS } from '@/lib/imagem/regras'
import { buscarAutorizacoes, type FiltrosDaBusca } from '@/lib/imagem/consulta'
import { TabelaDeAutorizacoes } from './tabela'

export const metadata = { title: 'Autorizações de imagem' }

const data = (iso: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
const campo = 'h-10 rounded-lg border border-border bg-background px-3 text-sm'

type Coleta = { id: string; titulo: string; created_at: string; expira_em: string | null; encerrada_em: string | null; file_ids: string[]; imagem_autorizacoes: { count: number }[] }

/**
 * O banco de autorizações de imagem: os links criados (um por ação) e a busca
 * em todas as assinaturas — por nome, código, situação, uso e relação.
 */
export default async function AutorizacoesPage({ searchParams }: { searchParams: Promise<FiltrosDaBusca> }) {
  const context = await requireWorkspace()
  const filtros = await searchParams
  const supabase = await createClient()
  const buscando = Boolean(filtros.q || filtros.situacao || filtros.uso || filtros.vinculo)
  const [{ data: coletas, error }, linhas] = await Promise.all([
    supabase.from('imagem_coletas').select('id, titulo, created_at, expira_em, encerrada_em, file_ids, imagem_autorizacoes(count)')
      .eq('workspace_id', context.workspace.id).order('created_at', { ascending: false }).limit(100),
    buscarAutorizacoes(supabase, context.workspace.id, filtros, buscando ? 300 : 50).catch(() => null),
  ])
  if (error || !linhas) {
    const semMigracao = error?.code === '42P01' || error?.code === 'PGRST205'
    return (
      <div>
        <PageHeader title="Autorizações de imagem" breadcrumbs={[{ label: 'Biblioteca de mídia', href: '/biblioteca' }, { label: 'Autorizações de imagem' }]} />
        <Card className="p-6 text-sm">{semMigracao ? 'O banco ainda não tem as tabelas das autorizações (migração 20260928040000_cvrj_autorizacao_de_imagem).' : 'Não foi possível ler as autorizações agora.'}</Card>
      </div>
    )
  }
  const csv = `/api/biblioteca/autorizacoes/csv?${new URLSearchParams(Object.entries(filtros).filter(([, v]) => typeof v === 'string' && v) as [string, string][])}`
  const lista = (coletas ?? []) as unknown as Coleta[]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Autorizações de imagem"
        description="Um link por ação: quem aparece nas fotos abre no celular, vê as fotos, marca os usos e assina na tela. Tudo fica registrado aqui, com data, IP e aparelho."
        breadcrumbs={[{ label: 'Biblioteca de mídia', href: '/biblioteca' }, { label: 'Autorizações de imagem' }]}
        actions={<Button data-ajuda="autorizacoes.nova" render={<Link href="/biblioteca/autorizacoes/nova" />}><Plus className="size-4" />Pedir autorização</Button>}
      />

      <section aria-labelledby="links" data-ajuda="autorizacoes.links" className="flex flex-col gap-3">
        <h2 id="links" className="text-base font-semibold">Links ({lista.length})</h2>
        {lista.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lista.map((c) => {
              const { aberto } = linkAberto(c)
              const assinaturas = c.imagem_autorizacoes?.[0]?.count ?? 0
              return (
                <li key={c.id}>
                  <Link href={`/biblioteca/autorizacoes/${c.id}`} className="flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:bg-muted/40">
                    <span className="flex items-start gap-2 font-semibold"><Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{c.titulo}</span>
                    <span className="text-xs text-muted-foreground">{c.file_ids.length} foto(s) · criado em {data(c.created_at)}</span>
                    <span className="mt-auto flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded bg-primary/10 px-2 py-0.5 font-medium text-primary">{assinaturas} assinatura(s)</span>
                      <span className={aberto ? 'rounded bg-success/10 px-2 py-0.5 font-medium text-success' : 'rounded bg-muted px-2 py-0.5 font-medium text-muted-foreground'}>{aberto ? 'Aberto' : 'Encerrado'}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <Card className="p-6 text-sm text-muted-foreground">Nenhum link ainda. Na Biblioteca, selecione as fotos de uma ação e toque em <strong>Pedir autorização</strong>.</Card>
        )}
      </section>

      <section aria-labelledby="banco" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="banco" className="text-base font-semibold">{buscando ? `Resultado da busca (${linhas.length})` : 'Assinaturas mais recentes'}</h2>
          <Button variant="outline" size="sm" render={<a href={csv} />}><Download className="size-4" />Baixar planilha</Button>
        </div>
        <form data-ajuda="autorizacoes.busca" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Nome ou código</span>
            <Search className="absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" />
            <input name="q" defaultValue={filtros.q ?? ''} placeholder="Nome, responsável ou código IMG-…" className={`${campo} w-full pl-9`} />
          </label>
          <select name="situacao" defaultValue={filtros.situacao ?? ''} aria-label="Situação" className={campo}>
            <option value="">Todas as situações</option><option value="valida">Válidas</option><option value="revogada">Revogadas</option>
          </select>
          <select name="uso" defaultValue={filtros.uso ?? ''} aria-label="Uso autorizado" className={campo}>
            <option value="">Qualquer uso</option>
            {Object.entries(USOS).map(([k, u]) => <option key={k} value={k}>{u.rotulo}</option>)}
          </select>
          <select name="vinculo" defaultValue={filtros.vinculo ?? ''} aria-label="Relação" className={campo}>
            <option value="">Qualquer relação</option>
            {Object.entries(VINCULOS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
          </select>
          <Button type="submit" variant="secondary" className="h-10">Buscar</Button>
          {buscando && <Button variant="ghost" className="h-10" render={<Link href="/biblioteca/autorizacoes" />}>Limpar</Button>}
        </form>
        <TabelaDeAutorizacoes linhas={linhas} mostrarAcao />
      </section>
    </div>
  )
}
