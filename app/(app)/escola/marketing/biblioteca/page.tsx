import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { inputClass, selectClass } from '@/components/app/imprensa/comum'
import { SecoesDaEscola } from '@/components/app/escola/secoes'
import { CartaoDaPeca, NovaPeca } from '@/components/app/escola/marketing'
import { contextoDoMarketing, imagensAssinadas } from '@/lib/escola/marketing-servidor'
import { CANAIS, COLUNAS_DA_PECA, TIPOS_DE_PECA, ehCanal, ehTipoDePeca, lerPecaDoBanco } from '@/lib/escola/marketing'

export const metadata = { title: 'Biblioteca de peças · Marketing da escola' }
export const dynamic = 'force-dynamic'

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Todas as peças da escola numa galeria — as nossas (com imagem, ângulo,
 * formato e números) e, numa aba à parte, as referências guardadas de
 * concorrentes e inspirações.
 */
export default async function BibliotecaDePecasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { context, supabase, nivel, nivelEscola } = await contextoDoMarketing()
  if (nivel < 2) notFound()
  const ws = context.workspace.id
  const f = await searchParams
  const aba = f.aba === 'referencias' ? 'referencias' : 'nossas'
  const tipo = ehTipoDePeca(f.tipo) ? f.tipo : ''
  const canal = ehCanal(f.canal) ? f.canal : ''
  const campanha = f.campanha && /^[0-9a-f-]{36}$/.test(f.campanha) ? f.campanha : ''
  const vencedoras = f.vencedoras === '1'
  const q = (f.q ?? '').slice(0, 80)
  let consulta = supabase.from('escola_pecas').select(COLUNAS_DA_PECA).eq('workspace_id', ws).eq('referencia', aba === 'referencias')
  if (tipo) consulta = consulta.eq('tipo', tipo)
  if (canal) consulta = consulta.eq('canal', canal)
  if (campanha && aba === 'nossas') consulta = consulta.eq('campanha_id', campanha)
  if (vencedoras && aba === 'nossas') consulta = consulta.eq('vencedora', true)
  const [{ data: ps }, { data: cs }] = await Promise.all([
    consulta.order('publicada_em', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(600),
    supabase.from('escola_campanhas').select('id,nome').eq('workspace_id', ws).order('nome'),
  ])
  const termo = semAcento(q.trim())
  const pecas = (ps ?? []).map((p) => lerPecaDoBanco(p))
    .filter((p) => !termo || semAcento([p.titulo, p.texto, p.angulo, p.formato, p.fonte, p.nota].filter(Boolean).join(' ')).includes(termo))
  const campanhas = (cs ?? []) as { id: string; nome: string }[]
  const nome = new Map(campanhas.map((c) => [c.id, c.nome]))
  const imagens = await imagensAssinadas(pecas.map((p) => p.imagem_path))
  const podeExcluir = (criador: string | null) => nivel >= 3 || criador === context.user.id

  return (
    <div className="flex flex-col gap-6">
      <SecoesDaEscola atual="/escola/marketing" financeiro={nivelEscola >= 2} />
      <PageHeader title="Biblioteca de peças" breadcrumbs={[{ label: 'Marketing da escola', href: '/escola/marketing' }, { label: 'Biblioteca' }]}
        description="Cada página, anúncio, post e e-mail que a escola já usou, com a imagem e os números — e as referências guardadas para inspirar as próximas."
        actions={aba === 'referencias' ? <NovaPeca campanhas={campanhas} referencia /> : <NovaPeca campanhas={campanhas} />} />
      <nav className="flex gap-1 border-b border-border" aria-label="Abas da biblioteca" data-ajuda="escola-marketing.abas">
        {(['nossas', 'referencias'] as const).map((a) => (
          <Link key={a} href={a === 'nossas' ? '/escola/marketing/biblioteca' : '/escola/marketing/biblioteca?aba=referencias'} aria-current={aba === a ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === a ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {a === 'nossas' ? 'Nossas peças' : 'Referências'}
          </Link>
        ))}
      </nav>
      <form className="flex flex-wrap items-end gap-2" id="filtros-biblioteca" data-ajuda="escola-marketing.filtros">
        {aba === 'referencias' && <input type="hidden" name="aba" value="referencias" />}
        <select name="tipo" defaultValue={tipo} className={selectClass} aria-label="Tipo"><option value="">Todos os tipos</option>{Object.entries(TIPOS_DE_PECA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select name="canal" defaultValue={canal} className={selectClass} aria-label="Canal"><option value="">Todos os canais</option>{Object.entries(CANAIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        {aba === 'nossas' && campanhas.length > 0 && <select name="campanha" defaultValue={campanha} className={selectClass} aria-label="Campanha"><option value="">Todas as campanhas</option>{campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>}
        {aba === 'nossas' && <label className="flex items-center gap-1.5 px-1 py-2 text-sm"><input type="checkbox" name="vencedoras" value="1" defaultChecked={vencedoras} className="size-4" />Só vencedoras</label>}
        <input name="q" defaultValue={q} placeholder="Título, texto, ângulo…" className={inputClass.replace('w-full', 'w-56')} aria-label="Buscar" />
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>
      {!pecas.length ? <Card className="p-10 text-center text-sm text-muted-foreground">{aba === 'referencias' ? 'Nenhuma referência guardada. Guarde anúncios e páginas de outros cursos que chamaram atenção.' : 'Nenhuma peça com estes filtros.'}</Card> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" id="galeria" data-ajuda="escola-marketing.galeria">
          {pecas.map((p) => <CartaoDaPeca key={p.id} p={p} imagem={p.imagem_path ? imagens[p.imagem_path] ?? null : null} campanhas={campanhas} nomeDaCampanha={p.campanha_id ? nome.get(p.campanha_id) : null} podeEditar podeExcluir={podeExcluir(p.criado_por)} />)}
        </div>
      )}
    </div>
  )
}
