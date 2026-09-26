'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileText, Loader2, PackageCheck, Receipt, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { emitirOrdem, enviarOrdem, lancarContaDaCompra, receberPedido } from '@/app/actions/compras'
import { lerValor, parcelas } from '@/lib/compras/regras'
import { reais, valorNoCampo } from '@/lib/financeiro/regras'
import { campo, Rotulo } from './comum'

type Recado = { tom: 'ok' | 'erro'; texto: string } | null
const Aviso = ({ recado }: { recado: Recado }) => recado && (
  <p className={`text-sm ${recado.tom === 'erro' ? 'text-destructive' : 'text-success'}`} role={recado.tom === 'erro' ? 'alert' : 'status'}>{recado.texto}</p>
)

/**
 * Depois da aprovação, o Financeiro transforma o pedido em ORDEM DE COMPRA
 * (o documento formal, com número próprio) e a manda ao fornecedor pelo
 * e-mail do setor, com o PDF anexo.
 */
export function OrdemDeCompra({ pedidoId, codigo, emitida, enviada, podeEmitir, podeEnviar, caixas, paraInicial, mensagemInicial }: {
  pedidoId: string
  codigo: string | null
  emitida: { por: string; em: string } | null
  enviada: { para: string; por: string; em: string } | null
  podeEmitir: boolean
  podeEnviar: boolean
  caixas: { id: string; email: string }[]
  paraInicial: string
  mensagemInicial: string
}) {
  const router = useRouter()
  const [observacao, setObservacao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [caixa, setCaixa] = useState(caixas[0]?.id ?? '')
  const [para, setPara] = useState(paraInicial)
  const [cc, setCc] = useState('')
  const [mensagem, setMensagem] = useState(mensagemInicial)
  const [recado, setRecado] = useState<Recado>(null)
  const [ocupado, iniciar] = useTransition()

  return (
    <section data-ajuda="compras.ordem" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5" aria-label="Ordem de compra" data-ordem>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Ordem de compra {codigo && <span className="font-mono text-sm text-muted-foreground">{codigo}</span>}</p>
        {codigo && (
          <Button variant="outline" size="sm" render={<a href={`/api/compras/${pedidoId}/ordem`} target="_blank" rel="noreferrer" />}>
            <FileText className="size-4" />Abrir o PDF
          </Button>
        )}
      </div>

      {!codigo && podeEmitir && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">A compra foi aprovada. Emita a ordem de compra: ela ganha número próprio e vira o pedido formal ao fornecedor, com o CNPJ para a nota fiscal.</p>
          <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} maxLength={2000} className={campo}
            placeholder="Observação para o fornecedor (opcional): horário de entrega, contato de quem recebe…" aria-label="Observação da ordem" />
          <Aviso recado={recado} />
          <Button className="self-end" size="sm" disabled={ocupado} data-emitir
            onClick={() => iniciar(async () => {
              const r = await emitirOrdem(pedidoId, observacao)
              if (r.erro) setRecado({ tom: 'erro', texto: r.erro }); else { setRecado(null); router.refresh() }
            })}>
            {ocupado ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}Emitir a ordem de compra
          </Button>
        </div>
      )}
      {!codigo && !podeEmitir && <p className="text-sm text-muted-foreground">Aprovada. O Financeiro vai emitir a ordem de compra e mandá-la ao fornecedor.</p>}

      {codigo && (
        <ul className="flex flex-col gap-1 text-sm">
          {emitida && <li>Emitida por <span className="font-medium">{emitida.por}</span> em {emitida.em}</li>}
          {enviada
            ? <li data-enviada>Enviada a <span className="font-medium">{enviada.para}</span> por {enviada.por} em {enviada.em}</li>
            : <li className="text-muted-foreground">Ainda não foi enviada ao fornecedor.</li>}
        </ul>
      )}

      {codigo && podeEnviar && !enviando && (
        <Button variant={enviada ? 'ghost' : 'default'} size="sm" className="self-start" onClick={() => { setRecado(null); setEnviando(true) }}>
          <Send className="size-4" />{enviada ? 'Enviar de novo' : 'Enviar ao fornecedor'}
        </Button>
      )}
      {codigo && podeEnviar && enviando && (
        caixas.length === 0
          ? <p className="text-sm text-muted-foreground">Você não tem uma caixa de e-mail de setor para enviar. Baixe o PDF e mande pelo seu e-mail, ou peça a alguém do setor.</p>
          : (
            <form className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3" data-enviar-ordem
              onSubmit={(e) => {
                e.preventDefault()
                iniciar(async () => {
                  const r = await enviarOrdem(pedidoId, { caixaId: caixa, para, cc, mensagem })
                  if (r.erro) setRecado({ tom: 'erro', texto: r.erro })
                  else { setRecado({ tom: 'ok', texto: `Enviada a ${r.destinatarios?.join(', ')}.` }); setEnviando(false); router.refresh() }
                })
              }}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Rotulo texto="De">
                  <select value={caixa} onChange={(e) => setCaixa(e.target.value)} className={campo}>
                    {caixas.map((c) => <option key={c.id} value={c.id}>{c.email}</option>)}
                  </select>
                </Rotulo>
                <Rotulo texto="Para" ajuda="Separe vários endereços com vírgula.">
                  <input value={para} onChange={(e) => setPara(e.target.value)} className={campo} placeholder="vendas@fornecedor.com.br" required />
                </Rotulo>
                <Rotulo texto="Cópia" className="sm:col-span-2">
                  <input value={cc} onChange={(e) => setCc(e.target.value)} className={campo} placeholder="Opcional" />
                </Rotulo>
              </div>
              <Rotulo texto="Mensagem" ajuda="A assinatura da caixa entra no fim, e o PDF da ordem vai anexo.">
                <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={9} maxLength={20000} className={campo} required />
              </Rotulo>
              <Aviso recado={recado} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setEnviando(false)}>Voltar</Button>
                <Button type="submit" size="sm" disabled={ocupado}>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Enviar com o PDF</Button>
              </div>
            </form>
          )
      )}
      {!enviando && recado?.tom === 'ok' && <Aviso recado={recado} />}
    </section>
  )
}

/**
 * O que chegou, item a item (pode chegar em partes). Quem pediu registra —
 * é quem recebe no setor — ou o Financeiro. A nota fiscal fica anotada.
 */
export function Recebimento({ pedidoId, itens, hoje }: {
  pedidoId: string
  itens: { id: string; descricao: string; unidade: string; pedido: number; falta: number }[]
  hoje: string
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [data, setData] = useState(hoje)
  const [nota, setNota] = useState('')
  const [observacao, setObservacao] = useState('')
  const [qtd, setQtd] = useState<Record<string, string>>(() => Object.fromEntries(itens.map((i) => [i.id, valorQtd(i.falta)])))
  const [recado, setRecado] = useState<Recado>(null)
  const [ocupado, iniciar] = useTransition()
  if (!aberto) {
    return <Button size="sm" className="self-start" onClick={() => setAberto(true)} data-abrir-recebimento><PackageCheck className="size-4" />Registrar o que chegou</Button>
  }
  return (
    <form className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3" data-recebimento
      onSubmit={(e) => {
        e.preventDefault()
        iniciar(async () => {
          const r = await receberPedido(pedidoId, { recebido_em: data, nota_fiscal: nota, observacao, itens: itens.map((i) => ({ item_id: i.id, quantidade: qtd[i.id] ?? '' })) })
          if (r.erro) setRecado({ tom: 'erro', texto: r.erro })
          else { setRecado(null); setAberto(false); router.refresh() }
        })
      }}>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-medium">Item</th><th className="py-1 text-right font-medium">Falta</th><th className="w-32 py-1 text-right font-medium">Chegou agora</th></tr></thead>
        <tbody>
          {itens.map((i) => (
            <tr key={i.id} className="border-t border-border">
              <td className="py-1.5 pr-2">{i.descricao}</td>
              <td className="py-1.5 text-right tabular-nums text-muted-foreground">{valorQtd(i.falta)} {i.unidade}</td>
              <td className="py-1.5 pl-2">
                <input value={qtd[i.id] ?? ''} onChange={(e) => setQtd({ ...qtd, [i.id]: e.target.value })} inputMode="decimal" disabled={i.falta <= 0}
                  className={`${campo} text-right`} aria-label={`Quantidade recebida de ${i.descricao}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid gap-3 sm:grid-cols-3">
        <Rotulo texto="Chegou em"><input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} className={campo} required /></Rotulo>
        <Rotulo texto="Nota fiscal"><input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={60} className={campo} placeholder="Número da NF" /></Rotulo>
        <Rotulo texto="Observação"><input value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={1000} className={campo} placeholder="Avaria, falta…" /></Rotulo>
      </div>
      <Aviso recado={recado} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>Voltar</Button>
        <Button type="submit" size="sm" disabled={ocupado}>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}Registrar recebimento</Button>
      </div>
    </form>
  )
}

const valorQtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3, useGrouping: false })

/**
 * A conta a pagar nasce da compra: fornecedor, categoria, fonte e projeto já
 * vêm do pedido; o valor pode ser menor que o aprovado (desconto), nunca
 * maior. Entra no Financeiro já aprovada.
 */
export function ContaAPagar({ pedidoId, contas, aprovado, hoje, lancamento }: {
  pedidoId: string
  contas: { id: string; nome: string }[]
  aprovado: number
  hoje: string
  lancamento: { id: string; descricao: string } | null
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [conta, setConta] = useState(contas[0]?.id ?? '')
  const [vencimento, setVencimento] = useState('')
  const [valor, setValor] = useState(valorNoCampo(aprovado))
  const [n, setN] = useState('1')
  const [documento, setDocumento] = useState('')
  const [recado, setRecado] = useState<Recado>(null)
  const [ocupado, iniciar] = useTransition()

  if (lancamento) {
    return (
      <p className="text-sm" data-conta-lancada>
        <Receipt className="mr-1 inline size-4 text-success" />Conta a pagar lançada no Financeiro:{' '}
        <Link href={`/financeiro/${lancamento.id}`} className="font-medium underline underline-offset-2">{lancamento.descricao}</Link>
      </p>
    )
  }
  if (!aberto) return <Button variant="outline" size="sm" className="self-start" onClick={() => setAberto(true)} data-abrir-conta><Receipt className="size-4" />Lançar a conta a pagar</Button>
  if (!contas.length) return <p className="text-sm text-muted-foreground">Cadastre uma conta bancária desta empresa em Financeiro → Cadastros para lançar a conta a pagar.</p>

  const total = lerValor(valor) ?? 0
  const quantas = Math.min(12, Math.max(1, Number(n) || 1))
  const partes = total > 0 ? parcelas(total, quantas) : []
  return (
    <form className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3" data-conta
      onSubmit={(e) => {
        e.preventDefault()
        iniciar(async () => {
          const r = await lancarContaDaCompra(pedidoId, { conta_id: conta, vencimento, valor, parcelas: n, documento })
          if (r.erro) setRecado({ tom: 'erro', texto: r.erro }); else { setRecado(null); setAberto(false); router.refresh() }
        })
      }}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Rotulo texto="Sai da conta">
          <select value={conta} onChange={(e) => setConta(e.target.value)} className={campo}>
            {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Rotulo>
        <Rotulo texto="Vence em" ajuda="Com parcelas, as seguintes vencem mês a mês."><input type="date" value={vencimento} min={hoje} onChange={(e) => setVencimento(e.target.value)} className={campo} required /></Rotulo>
        <Rotulo texto="Valor (R$)" ajuda={`Até o aprovado: ${reais(aprovado)}.`}><input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className={campo} required /></Rotulo>
        <Rotulo texto="Parcelas"><input type="number" min={1} max={12} value={n} onChange={(e) => setN(e.target.value)} className={campo} /></Rotulo>
        <Rotulo texto="Documento" ajuda="Número da nota fiscal ou boleto."><input value={documento} onChange={(e) => setDocumento(e.target.value)} maxLength={80} className={campo} /></Rotulo>
      </div>
      {quantas > 1 && partes.length > 0 && <p className="text-xs text-muted-foreground">{quantas} parcelas de {reais(partes[0])}{partes[quantas - 1] !== partes[0] && ` (a última de ${reais(partes[quantas - 1])})`}.</p>}
      {total > aprovado && <p className="text-xs text-destructive">Passa do aprovado. Para pagar mais, a compra precisa de nova aprovação.</p>}
      <Aviso recado={recado} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>Voltar</Button>
        <Button type="submit" size="sm" disabled={ocupado || total <= 0 || total > aprovado}>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <Receipt className="size-4" />}Lançar no Financeiro</Button>
      </div>
    </form>
  )
}
