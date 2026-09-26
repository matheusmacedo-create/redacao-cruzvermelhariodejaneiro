'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { salvarPedido, type PedidoNoFormulario } from '@/app/actions/compras'
import { lerValor, totalDaLinha } from '@/lib/compras/regras'
import { reais, valorNoCampo } from '@/lib/financeiro/regras'
import { campo, Rotulo } from './comum'

type Opcao = { id: string; nome: string }
type ItemNaTela = { chave: string; id: string | null; descricao: string; especificacao: string; quantidade: string; unidade: string; valor: string; aberto: boolean }

export type PedidoInicial = {
  id: string; titulo: string; justificativa: string; setor_id: string | null; projeto_id: string | null; necessario_ate: string | null; local_entrega: string | null
  categoria_id: string | null; fonte_id: string | null
  itens: { id: string; descricao: string; especificacao: string | null; quantidade: number; unidade: string; valor_estimado_unit: number | null }[]
}

const UNIDADES = ['un', 'cx', 'pct', 'kit', 'par', 'kg', 'g', 'L', 'mL', 'm', 'm²', 'rolo', 'resma', 'serviço', 'hora', 'mês']
let seq = 0
const novoItem = (): ItemNaTela => ({ chave: `n${++seq}`, id: null, descricao: '', especificacao: '', quantidade: '1', unidade: 'un', valor: '', aberto: false })

/**
 * O pedido de compra: o que, quanto, para quê e até quando. A especificação
 * de cada item é o que vai para todos os fornecedores — igual para todos,
 * como pede o manual de compras da Cruz Vermelha. Quem é do Financeiro também
 * classifica (categoria e fonte do dinheiro).
 */
export function FormularioDoPedido({ inicial, setores, projetos, classificar, categorias, fontes, setorPadrao, empresa }: {
  inicial?: PedidoInicial
  setores: Opcao[]
  projetos: Opcao[]
  classificar: boolean
  categorias: Opcao[]
  fontes: Opcao[]
  setorPadrao?: string | null
  /** Pedido novo: a empresa das listas acima (fontes são de cada empresa). O pedido é aberto nela. */
  empresa?: { id: string; nome: string; varias: boolean } | null
}) {
  const router = useRouter()
  const [titulo, setTitulo] = useState(inicial?.titulo ?? '')
  const [justificativa, setJustificativa] = useState(inicial?.justificativa ?? '')
  const [setor, setSetor] = useState(inicial?.setor_id ?? setorPadrao ?? '')
  const [projeto, setProjeto] = useState(inicial?.projeto_id ?? '')
  const [ate, setAte] = useState(inicial?.necessario_ate ?? '')
  const [local, setLocal] = useState(inicial?.local_entrega ?? '')
  const [categoria, setCategoria] = useState(inicial?.categoria_id ?? '')
  const [fonte, setFonte] = useState(inicial?.fonte_id ?? '')
  const [itens, setItens] = useState<ItemNaTela[]>(() => inicial?.itens.length
    ? inicial.itens.map((i) => ({ chave: i.id, id: i.id, descricao: i.descricao, especificacao: i.especificacao ?? '', quantidade: String(i.quantidade).replace('.', ','), unidade: i.unidade, valor: valorNoCampo(i.valor_estimado_unit), aberto: Boolean(i.especificacao) }))
    : [novoItem()])
  const [erro, setErro] = useState('')
  const [salvando, iniciar] = useTransition()

  const mudar = (chave: string, parte: Partial<ItemNaTela>) => setItens((l) => l.map((i) => (i.chave === chave ? { ...i, ...parte } : i)))
  const estimado = itens.reduce((s, i) => {
    const q = lerValor(i.quantidade); const v = lerValor(i.valor)
    return s + (q && v ? totalDaLinha(q, v) : 0)
  }, 0)

  const salvar = (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    const dados: PedidoNoFormulario = {
      entidade_id: inicial ? undefined : empresa?.id ?? null,
      titulo, justificativa, setor_id: setor || null, projeto_id: projeto || null, necessario_ate: ate || null, local_entrega: local,
      categoria_id: classificar ? categoria || null : undefined, fonte_id: classificar ? fonte || null : undefined,
      itens: itens.filter((i) => i.descricao.trim()).map((i) => ({ id: i.id, descricao: i.descricao, especificacao: i.especificacao, quantidade: i.quantidade, unidade: i.unidade, valor_estimado_unit: i.valor })),
    }
    if (!dados.itens.length) { setErro('Inclua ao menos um item.'); return }
    iniciar(async () => {
      const r = await salvarPedido(inicial?.id ?? null, dados)
      if (r.erro || !r.id) { setErro(r.erro ?? 'Não foi possível salvar.'); return }
      router.push(`/financeiro/compras/${r.id}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-5" data-formulario-do-pedido>
      <section data-ajuda="compras.dados" className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        <Rotulo texto="O que você precisa comprar" className="sm:col-span-2">
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required minLength={3} maxLength={160} placeholder="Ex.: Kits de primeiros socorros para o curso de outubro" className={campo} />
        </Rotulo>
        <Rotulo texto="Para quê" className="sm:col-span-2" ajuda="O motivo da compra fica no processo e na prestação de contas.">
          <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} required minLength={3} maxLength={2000} rows={3} className={campo} />
        </Rotulo>
        <Rotulo texto="Setor que pede">
          <select value={setor} onChange={(e) => setSetor(e.target.value)} className={campo}>
            <option value="">—</option>{setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </Rotulo>
        <Rotulo texto="Projeto (se for de um)">
          <select value={projeto} onChange={(e) => setProjeto(e.target.value)} className={campo}>
            <option value="">—</option>{projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Rotulo>
        <Rotulo texto="Precisa até">
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={campo} />
        </Rotulo>
        <Rotulo texto="Onde entregar">
          <input value={local} onChange={(e) => setLocal(e.target.value)} maxLength={200} placeholder="Ex.: Sede, Rua ..." className={campo} />
        </Rotulo>
        {classificar && (
          <>
            {!inicial && empresa?.varias && (
              <p className="text-xs text-muted-foreground sm:col-span-2" data-empresa-do-pedido>
                Pedido da empresa <span className="font-medium text-foreground">{empresa.nome}</span> — a aberta no Financeiro. Para pedir por outra, troque a empresa no Financeiro antes.
              </p>
            )}
            <Rotulo texto="Categoria (Financeiro)" ajuda="Obrigatória para mandar para aprovação.">
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={campo}>
                <option value="">—</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Rotulo>
            <Rotulo texto="Fonte do dinheiro (Financeiro)" ajuda="Recursos livres, convênio, termo de fomento…">
              <select value={fonte} onChange={(e) => setFonte(e.target.value)} className={campo}>
                <option value="">—</option>{fontes.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </Rotulo>
          </>
        )}
      </section>

      <section data-ajuda="compras.itens" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5" aria-label="Itens">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="font-medium">Itens</p>
            <p className="text-xs text-muted-foreground">A especificação é o que todos os fornecedores recebem, igual para todos. O valor estimado é opcional.</p>
          </div>
          {estimado > 0 && <p className="text-sm text-muted-foreground">Estimado: <span className="font-medium text-foreground tabular-nums">{reais(estimado)}</span></p>}
        </div>
        <datalist id="unidades-de-compra">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
        <ol className="flex flex-col gap-3">
          {itens.map((i, n) => (
            <li key={i.chave} className="rounded-lg border border-border p-3" data-item>
              <div className="grid gap-2 sm:grid-cols-[1fr_6rem_6rem_8rem_auto] sm:items-end">
                <Rotulo texto={`Item ${n + 1}`}>
                  <input value={i.descricao} onChange={(e) => mudar(i.chave, { descricao: e.target.value })} maxLength={300} placeholder="Descrição" className={campo} aria-label={`Descrição do item ${n + 1}`} />
                </Rotulo>
                <Rotulo texto="Qtde.">
                  <input value={i.quantidade} onChange={(e) => mudar(i.chave, { quantidade: e.target.value })} inputMode="decimal" className={campo} aria-label={`Quantidade do item ${n + 1}`} />
                </Rotulo>
                <Rotulo texto="Unidade">
                  <input value={i.unidade} onChange={(e) => mudar(i.chave, { unidade: e.target.value })} list="unidades-de-compra" maxLength={20} className={campo} aria-label={`Unidade do item ${n + 1}`} />
                </Rotulo>
                <Rotulo texto="Valor unit. estimado">
                  <input value={i.valor} onChange={(e) => mudar(i.chave, { valor: e.target.value })} inputMode="decimal" placeholder="R$" className={campo} aria-label={`Valor estimado do item ${n + 1}`} />
                </Rotulo>
                <div className="flex gap-1">
                  <Button type="button" size="icon" variant="ghost" onClick={() => mudar(i.chave, { aberto: !i.aberto })} aria-label={i.aberto ? 'Esconder especificação' : 'Escrever especificação'} title="Especificação">
                    {i.aberto ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </Button>
                  <Button type="button" size="icon" variant="ghost" disabled={itens.length === 1} onClick={() => setItens((l) => l.filter((x) => x.chave !== i.chave))} aria-label={`Tirar o item ${n + 1}`}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              {i.aberto && (
                <textarea value={i.especificacao} onChange={(e) => mudar(i.chave, { especificacao: e.target.value })} maxLength={2000} rows={2}
                  placeholder="Especificação: tamanho, marca de referência (ou similar), cor, norma técnica…" className={`${campo} mt-2`} aria-label={`Especificação do item ${n + 1}`} />
              )}
            </li>
          ))}
        </ol>
        <Button type="button" variant="outline" size="sm" className="self-start" disabled={itens.length >= 60} onClick={() => setItens((l) => [...l, novoItem()])}><Plus className="size-4" />Outro item</Button>
      </section>

      {erro && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
        <Button data-ajuda="compras.enviar" type="submit" disabled={salvando}>{salvando && <Loader2 className="size-4 animate-spin" />}{inicial ? 'Salvar alterações' : 'Enviar pedido'}</Button>
      </div>
    </form>
  )
}
