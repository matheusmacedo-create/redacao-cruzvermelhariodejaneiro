'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, FileText, Loader2, Paperclip, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Recado } from '@/components/membro/pecas'
import { createClient as clienteDoNavegador } from '@/lib/supabase/client'
import { dataComDia, lerPreco, totalParaOFornecedor } from '@/lib/compras/convites'
import { TAMANHO_MAXIMO, ehArquivoAceito, reais } from '@/lib/financeiro/regras'
import { cn } from '@/lib/utils'

type Item = { id: string; descricao: string; especificacao: string | null; quantidade: number; unidade: string }
type Proposta = { validade: string | null; prazo_entrega: string | null; condicao_pagamento: string | null; frete: number; observacao: string | null; arquivo_nome: string | null; precos: Record<string, number | null> } | null

const campo = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 sm:text-sm'
const noCampo = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toFixed(2).replace('.', ','))
const qtd = (n: number) => String(n).replace('.', ',')

/**
 * O formulário do fornecedor: o preço unitário de cada item (em branco = não
 * fornece), o frete, as condições e, se quiser, o PDF da proposta. Mostra o
 * total enquanto digita. Mandar de novo substitui a proposta anterior, até o prazo.
 */
export function FormularioDaProposta({ token, itens, proposta, hoje, prazo, recusou = false }: {
  token: string; itens: Item[]; proposta: Proposta; hoje: string; prazo: string | null; recusou?: boolean
}) {
  const [precos, setPrecos] = useState<Record<string, string>>(() => Object.fromEntries(itens.map((i) => [i.id, noCampo(proposta?.precos[i.id])])))
  const [frete, setFrete] = useState(proposta?.frete ? noCampo(proposta.frete) : '')
  const [validade, setValidade] = useState(proposta?.validade ?? '')
  const [entrega, setEntrega] = useState(proposta?.prazo_entrega ?? '')
  const [pagamento, setPagamento] = useState(proposta?.condicao_pagamento ?? '')
  const [observacao, setObservacao] = useState(proposta?.observacao ?? '')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [pronto, setPronto] = useState<null | 'proposta' | 'recusa'>(null)
  const [recusando, setRecusando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const total = useMemo(() => totalParaOFornecedor(itens, precos, frete), [itens, precos, frete])

  if (pronto) {
    return (
      <Recado tipo="sucesso" titulo={pronto === 'proposta' ? 'Proposta enviada. Obrigado!' : 'Recebemos o seu aviso. Obrigado!'}>
        <p>{pronto === 'proposta'
          ? `Ela já está com a equipe de compras.${prazo ? ` Se precisar corrigir algo, abra este mesmo link até ${dataComDia(prazo)}.` : ''}`
          : 'Se mudar de ideia dentro do prazo, é só abrir este link de novo.'}</p>
      </Recado>
    )
  }

  const enviar = async () => {
    setErro('')
    setEnviando(true)
    try {
      let anexo: { caminho: string; nome: string; mime: string; tamanho: number } | null = null
      if (arquivo) {
        const r = await fetch(`/api/publico/cotacao/${token}/arquivo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipo: arquivo.type, tamanho: arquivo.size }) })
        const j = await r.json().catch(() => ({}))
        if (!r.ok || !j.caminho) throw new Error(j.erro ?? 'Não foi possível preparar o envio do arquivo.')
        const { error } = await clienteDoNavegador().storage.from('compras-arquivos').uploadToSignedUrl(j.caminho, j.token, arquivo, { contentType: arquivo.type })
        if (error) throw new Error('O arquivo não subiu. Confira a conexão e tente de novo.')
        anexo = { caminho: j.caminho, nome: arquivo.name, mime: arquivo.type, tamanho: arquivo.size }
      }
      const r = await fetch(`/api/publico/cotacao/${token}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          acao: 'proposta', precos: itens.map((i) => ({ item_id: i.id, valor_unitario: precos[i.id] ?? '' })), frete, validade,
          prazo_entrega: entrega, condicao_pagamento: pagamento, observacao, arquivo: anexo,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.erro ?? 'Não foi possível enviar agora. Tente de novo.')
      setPronto('proposta')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não foi possível enviar agora. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  const recusar = async () => {
    setErro('')
    setEnviando(true)
    try {
      const r = await fetch(`/api/publico/cotacao/${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao: 'recusar', motivo }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.erro ?? 'Não foi possível registrar agora.')
      setPronto('recusa')
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não foi possível registrar agora.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void enviar() }} data-formulario-da-proposta>
      {proposta && <Recado tipo="info" titulo="A sua proposta já chegou">Você pode corrigir e mandar de novo: a nova substitui a anterior.</Recado>}
      {recusou && !proposta && <Recado tipo="info" titulo="Você avisou que não vai cotar">Se mudou de ideia, preencha abaixo e envie.</Recado>}

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-label="Preços">
        <div>
          <h2 className="font-semibold">Preço de cada item</h2>
          <p className="text-sm text-muted-foreground">Informe o preço <strong>por unidade</strong>, já com impostos. Deixe em branco o que você não fornece.</p>
        </div>
        <ol className="flex flex-col divide-y divide-border">
          {itens.map((i, n) => {
            const v = lerPreco(precos[i.id])
            const invalido = Boolean(precos[i.id]?.trim()) && v === null
            return (
              <li key={i.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{n + 1}. {i.descricao}</p>
                  {i.especificacao && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{i.especificacao}</p>}
                  <p className="text-sm">Quantidade: <span className="font-medium">{qtd(i.quantidade)} {i.unidade}</span></p>
                </div>
                <label className="flex flex-col gap-1 text-sm sm:w-48">
                  <span className="font-medium">R$ por {i.unidade}</span>
                  <input inputMode="decimal" value={precos[i.id] ?? ''} onChange={(e) => setPrecos((x) => ({ ...x, [i.id]: e.target.value }))} placeholder="0,00"
                    aria-invalid={invalido || undefined} className={cn(campo, 'tabular-nums', invalido && 'border-destructive')} />
                  <span className={cn('text-xs', invalido ? 'text-destructive' : 'text-muted-foreground')}>
                    {invalido ? 'Use só números, como 1.500,00' : v !== null ? `${reais(v)} × ${qtd(i.quantidade)} = ${reais(Math.round(v * i.quantidade * 100) / 100)}` : 'não fornece'}
                  </span>
                </label>
              </li>
            )
          })}
        </ol>
        <label className="flex flex-col gap-1 text-sm sm:ml-auto sm:w-48">
          <span className="font-medium">Frete (R$)</span>
          <input inputMode="decimal" value={frete} onChange={(e) => setFrete(e.target.value)} placeholder="0,00 (sem frete)" className={cn(campo, 'tabular-nums')} />
        </label>
        <p className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">{total.cotados} de {itens.length} {itens.length === 1 ? 'item cotado' : 'itens cotados'}</span>
          <span className="text-lg font-bold tabular-nums">Total: {reais(total.total)}</span>
        </p>
      </section>

      <section className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2" aria-label="Condições">
        <h2 className="font-semibold sm:col-span-2">Condições</h2>
        <label className="flex flex-col gap-1 text-sm font-medium">Prazo de entrega
          <input value={entrega} onChange={(e) => setEntrega(e.target.value)} maxLength={120} placeholder="Ex.: 5 dias úteis" className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Condição de pagamento
          <input value={pagamento} onChange={(e) => setPagamento(e.target.value)} maxLength={120} placeholder="Ex.: boleto 28 dias" className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Proposta válida até
          <input type="date" value={validade} min={hoje} onChange={(e) => setValidade(e.target.value)} className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Proposta em PDF (opcional)
          <span className={cn(campo, 'flex cursor-pointer items-center gap-2 text-muted-foreground')}>
            <Paperclip className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{arquivo ? arquivo.name : proposta?.arquivo_nome ? `${proposta.arquivo_nome} (trocar)` : 'Escolher arquivo'}</span>
            <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              if (f && (!ehArquivoAceito(f.type) || f.size > TAMANHO_MAXIMO)) { setErro('Anexe PDF, JPG, PNG ou WEBP de até 20 MB.'); setArquivo(null); return }
              setErro(''); setArquivo(f)
            }} />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">Observação
          <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={1000} rows={3} placeholder="Marca, modelo, garantia ou o que mais for útil." className={campo} />
        </label>
      </section>

      {erro && <Recado tipo="erro">{erro}</Recado>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {!proposta && !recusando && (
          <button type="button" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => setRecusando(true)}>Não vou cotar desta vez</button>
        )}
        <Button type="submit" size="lg" disabled={enviando || total.cotados === 0} className="sm:ml-auto">
          {enviando ? <Loader2 className="size-4 animate-spin" /> : proposta ? <CheckCircle2 className="size-4" /> : <Send className="size-4" />}
          {enviando ? 'Enviando…' : proposta ? 'Enviar a proposta corrigida' : 'Enviar a proposta'}
        </Button>
      </div>

      {recusando && (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-label="Não vou cotar">
          <label className="flex flex-col gap-1 text-sm font-medium">Quer dizer o motivo? (opcional)
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} placeholder="Ex.: não trabalhamos com este item" className={campo} />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRecusando(false)}>Voltar</Button>
            <Button type="button" variant="outline" disabled={enviando} onClick={() => void recusar()}>{enviando && <Loader2 className="size-4 animate-spin" />}Avisar que não vou cotar</Button>
          </div>
        </section>
      )}

      {proposta?.arquivo_nome && !arquivo && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><FileText className="size-3.5" />Arquivo já enviado: {proposta.arquivo_nome}</p>}
    </form>
  )
}
