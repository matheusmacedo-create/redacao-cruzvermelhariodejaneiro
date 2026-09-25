'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Boxes, Loader2, PackagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { darEntrada } from '@/app/actions/compras'
import { DESTINOS, type Destino } from '@/lib/compras/regras'
import { reais } from '@/lib/financeiro/regras'
import { campo, Rotulo } from './comum'

type Item = { id: string; descricao: string; unidade: string; semDestino: number; custo: number | null }
type Registro = { id: string; item_id: string; tipo: Destino; quantidade: number; detalhe: string; por: string; em: string }
type Opcoes = {
  estoque: { id: string; nome: string; unidade: string; controla_validade: boolean }[]
  locais: { id: string; nome: string }[]
  categorias: { id: string; nome: string }[]
}

const qtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

/**
 * O destino do que chegou: estoque, patrimônio ou sem entrada (serviço, uso
 * imediato). Quem opera o Patrimônio registra; o custo já vem com a parte do
 * frete, e a nota fiscal e a fonte vêm da compra.
 */
export function EntradaDoQueChegou({ pedidoId, itens, registros, opcoes, pode, concluida }: {
  pedidoId: string; itens: Item[]; registros: Registro[]; opcoes: Opcoes; pode: boolean; concluida: boolean
}) {
  const [aberto, setAberto] = useState<string | null>(null)
  const pendentes = itens.filter((i) => i.semDestino > 0)
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5" aria-label="Entrada no estoque ou patrimônio" data-entrada>
      <p className="font-medium">Entrada no estoque ou patrimônio</p>
      {registros.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {registros.map((r) => (
            <li key={r.id}>
              <span className="font-medium">{DESTINOS[r.tipo].rotulo}:</span> {r.detalhe}
              <span className="text-xs text-muted-foreground"> — {r.por}, {r.em}</span>
            </li>
          ))}
        </ul>
      )}
      {concluida
        ? <p className="text-sm text-success">Tudo o que chegou já tem destino.</p>
        : pendentes.length === 0
          ? <p className="text-sm text-muted-foreground">O que chegou até agora já tem destino. O resto entra quando chegar.</p>
          : !pode
            ? <p className="text-sm text-muted-foreground">Quem opera o Patrimônio vai dar a entrada do que chegou.</p>
            : (
              <ul className="flex flex-col gap-2">
                {pendentes.map((i) => (
                  <li key={i.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span><span className="font-medium">{i.descricao}</span> <span className="text-muted-foreground">— {qtd(i.semDestino)} {i.unidade} sem destino{i.custo !== null && ` · custo ${reais(i.custo)} / ${i.unidade} com frete`}</span></span>
                      {aberto !== i.id && <Button size="sm" variant="outline" onClick={() => setAberto(i.id)} data-dar-entrada={i.id}><PackagePlus className="size-4" />Dar entrada</Button>}
                    </div>
                    {aberto === i.id && <FormularioDeEntrada pedidoId={pedidoId} item={i} opcoes={opcoes} fechar={() => setAberto(null)} />}
                  </li>
                ))}
              </ul>
            )}
    </section>
  )
}

function FormularioDeEntrada({ pedidoId, item, opcoes, fechar }: { pedidoId: string; item: Item; opcoes: Opcoes; fechar: () => void }) {
  const router = useRouter()
  const [tipo, setTipo] = useState<Destino>('estoque')
  const [quantidade, setQuantidade] = useState(qtd(item.semDestino).replace(/\./g, ''))
  const [estItem, setEstItem] = useState('')
  const [noEstoque, setNoEstoque] = useState('')
  const [local, setLocal] = useState(opcoes.locais[0]?.id ?? '')
  const [lote, setLote] = useState('')
  const [validade, setValidade] = useState('')
  const [categoria, setCategoria] = useState('')
  const [nome, setNome] = useState(item.descricao.slice(0, 160))
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const escolhido = opcoes.estoque.find((e) => e.id === estItem)

  return (
    <form className="mt-3 flex flex-col gap-3" data-form-entrada
      onSubmit={(e) => {
        e.preventDefault()
        iniciar(async () => {
          setErro('')
          const r = await darEntrada(pedidoId, item.id, {
            tipo, quantidade, observacao, est_item_id: estItem, est_quantidade: noEstoque, local_id: local, lote, validade, categoria_id: categoria, nome, marca, modelo,
          })
          if (r.erro) setErro(r.erro); else { fechar(); router.refresh() }
        })
      }}>
      <fieldset className="flex flex-wrap gap-2" aria-label="Destino">
        {(Object.keys(DESTINOS) as Destino[]).map((d) => (
          <label key={d} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${tipo === d ? 'border-primary bg-primary/5 font-medium' : 'border-border'}`}>
            <input type="radio" name={`destino-${item.id}`} value={d} checked={tipo === d} onChange={() => setTipo(d)} className="accent-primary" />{DESTINOS[d].rotulo}
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-muted-foreground">{DESTINOS[tipo].ajuda}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Rotulo texto={`Quantidade (${item.unidade})`} ajuda={`Até ${qtd(item.semDestino)}.`}>
          <input value={quantidade} onChange={(e) => setQuantidade(e.target.value)} inputMode="decimal" className={campo} required />
        </Rotulo>
        {tipo === 'estoque' && (
          <>
            <Rotulo texto="Item do estoque">
              <select value={estItem} onChange={(e) => setEstItem(e.target.value)} className={campo} required>
                <option value="">Escolha…</option>
                {opcoes.estoque.map((e) => <option key={e.id} value={e.id}>{e.nome} ({e.unidade})</option>)}
              </select>
            </Rotulo>
            <Rotulo texto={`Quantidade no estoque${escolhido ? ` (${escolhido.unidade})` : ''}`} ajuda="Se a unidade for outra (5 caixas de 100 = 500 un). Vazio: a mesma.">
              <input value={noEstoque} onChange={(e) => setNoEstoque(e.target.value)} inputMode="decimal" className={campo} placeholder={quantidade} />
            </Rotulo>
            <Rotulo texto="Local">
              <select value={local} onChange={(e) => setLocal(e.target.value)} className={campo} required>
                {opcoes.locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </Rotulo>
            <Rotulo texto="Lote"><input value={lote} onChange={(e) => setLote(e.target.value)} maxLength={60} className={campo} /></Rotulo>
            <Rotulo texto="Validade" ajuda={escolhido?.controla_validade ? 'Este item controla validade.' : undefined}>
              <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className={campo} required={escolhido?.controla_validade} />
            </Rotulo>
          </>
        )}
        {tipo === 'patrimonio' && (
          <>
            <Rotulo texto="Nome do bem"><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={160} className={campo} required /></Rotulo>
            <Rotulo texto="Categoria">
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={campo} required>
                <option value="">Escolha…</option>
                {opcoes.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Rotulo>
            <Rotulo texto="Local">
              <select value={local} onChange={(e) => setLocal(e.target.value)} className={campo}>
                <option value="">Sem local</option>
                {opcoes.locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </Rotulo>
            <Rotulo texto="Marca"><input value={marca} onChange={(e) => setMarca(e.target.value)} maxLength={80} className={campo} /></Rotulo>
            <Rotulo texto="Modelo"><input value={modelo} onChange={(e) => setModelo(e.target.value)} maxLength={80} className={campo} /></Rotulo>
          </>
        )}
        {tipo === 'consumo' && (
          <Rotulo texto="Para quê" className="sm:col-span-2">
            <input value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={600} className={campo} placeholder="Serviço prestado, usado no evento…" />
          </Rotulo>
        )}
      </div>
      {tipo === 'estoque' && !opcoes.estoque.length && (
        <p className="text-xs text-muted-foreground">Nenhum item no estoque ainda. <Link href="/patrimonio/estoque/novo" className="underline">Cadastre o item</Link> e volte aqui.</p>
      )}
      {tipo === 'estoque' && opcoes.estoque.length > 0 && (
        <p className="text-xs text-muted-foreground"><Boxes className="mr-1 inline size-3.5" />Não achou? <Link href="/patrimonio/estoque/novo" className="underline" target="_blank">Cadastre o item no estoque</Link> e recarregue.</p>
      )}
      {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={fechar}>Voltar</Button>
        <Button type="submit" size="sm" disabled={ocupado}>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <PackagePlus className="size-4" />}Registrar a entrada</Button>
      </div>
    </form>
  )
}
