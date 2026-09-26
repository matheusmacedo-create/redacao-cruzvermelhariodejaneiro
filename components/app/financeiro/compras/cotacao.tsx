'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, FileText, Loader2, Paperclip, Pencil, Plus, Trash2, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient as clienteDoNavegador } from '@/lib/supabase/client'
import {
  enviarParaAprovacao, excluirProposta, prepararArquivoDaProposta, registrarArquivoDaProposta, salvarProposta,
} from '@/app/actions/compras'
import { conferirEscolha, mapaComparativo, totalDaLinha, type ItemDoPedido, type Proposta, type RegrasDeCompra } from '@/lib/compras/regras'
import { dataCurta, reais, valorNoCampo } from '@/lib/financeiro/regras'
import { cn } from '@/lib/utils'
import { campo, Rotulo } from './comum'

export type PropostaNaTela = Proposta & {
  recebida_em: string; validade: string | null; prazo_entrega: string | null; condicao_pagamento: string | null; observacao: string | null
  arquivo_nome: string | null; tem_arquivo: boolean; fornecedor: string
}

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

/**
 * A cotação: as propostas lado a lado (o mapa comparativo), com o menor
 * preço de cada item destacado e a proposta completa mais barata marcada.
 * Quem cota registra as propostas, escolhe a vencedora e manda para
 * aprovação; os demais veem o mesmo mapa, só para ler.
 */
export function Cotacao({ pedidoId, itens, propostas, fornecedores, regras, podeCotar, escolhida: escolhidaInicial, justificativa: justificativaInicial, emCotacao }: {
  pedidoId: string
  itens: ItemDoPedido[]
  propostas: PropostaNaTela[]
  fornecedores: { id: string; nome: string }[]
  regras: RegrasDeCompra
  podeCotar: boolean
  escolhida: string | null
  justificativa: string | null
  emCotacao: boolean
}) {
  const router = useRouter()
  const [editando, setEditando] = useState<string | 'nova' | null>(null)
  const [escolhida, setEscolhida] = useState<string | null>(escolhidaInicial)
  const [justificativa, setJustificativa] = useState(justificativaInicial ?? '')
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const mapa = useMemo(() => mapaComparativo(itens, propostas), [itens, propostas])
  const conferencia = useMemo(() => conferirEscolha(itens, propostas, escolhida, regras), [itens, propostas, escolhida, regras])
  const livres = fornecedores.filter((f) => !propostas.some((p) => p.favorecido_id === f.id))

  const agir = (fn: () => Promise<{ erro?: string }>, depois?: () => void) => iniciar(async () => {
    setErro('')
    const r = await fn()
    if (r.erro) setErro(r.erro); else { depois?.(); router.refresh() }
  })

  return (
    <section data-ajuda="compras.cotacao" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5" aria-label="Cotação" data-cotacao>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">Cotação — mapa comparativo</p>
          <p className="text-xs text-muted-foreground">
            {propostas.length ? `${mapa.completas} de ${propostas.length} ${propostas.length === 1 ? 'proposta cota' : 'propostas cotam'} todos os itens.` : 'Nenhuma proposta ainda.'}
            {' '}Menor preço de cada item em verde; <Trophy className="inline size-3 text-warning-foreground" /> a proposta completa mais barata.
          </p>
        </div>
        {podeCotar && emCotacao && editando === null && (
          <Button size="sm" onClick={() => setEditando('nova')} disabled={!livres.length} title={!livres.length ? 'Cadastre o fornecedor em Financeiro → Cadastros' : undefined}>
            <Plus className="size-4" />Registrar proposta
          </Button>
        )}
      </div>

      {editando !== null && (
        <FormularioDaProposta pedidoId={pedidoId} itens={itens} proposta={editando === 'nova' ? null : propostas.find((p) => p.id === editando) ?? null}
          fornecedores={editando === 'nova' ? livres : fornecedores.filter((f) => f.id === propostas.find((p) => p.id === editando)?.favorecido_id || livres.includes(f))}
          onFim={() => { setEditando(null); router.refresh() }} />
      )}

      {propostas.length > 0 && (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[36rem] border-collapse text-sm" data-mapa>
            <thead>
              <tr className="border-b border-border text-left align-bottom">
                <th className="py-2 pr-3 font-medium text-muted-foreground">Item</th>
                {propostas.map((p) => {
                  const t = mapa.totais.get(p.id)
                  return (
                    <th key={p.id} className={cn('min-w-40 px-2 py-2 font-medium', escolhida === p.id && 'bg-primary/5')}>
                      <span className="flex items-center gap-1">{mapa.maisBarata === p.id && <Trophy className="size-3.5 shrink-0 text-warning-foreground" aria-label="Mais barata" />}<span className="truncate">{p.fornecedor}</span></span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        recebida {dataCurta(p.recebida_em)}{p.validade && ` · válida até ${dataCurta(p.validade)}`}{!t?.completa && ' · incompleta'}
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.id} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3">
                    <p className="font-medium">{i.descricao}</p>
                    <p className="text-xs text-muted-foreground">{String(i.quantidade).replace('.', ',')} {i.unidade}</p>
                  </td>
                  {propostas.map((p) => {
                    const u = p.precos.find((x) => x.item_id === i.id)?.valor_unitario ?? null
                    const menor = mapa.menorPorItem.get(i.id)?.propostas.includes(p.id)
                    return (
                      <td key={p.id} className={cn('px-2 py-2 tabular-nums', escolhida === p.id && 'bg-primary/5')}>
                        {u === null ? <span className="text-xs text-muted-foreground">não cotou</span> : (
                          <>
                            <span className={cn(menor && 'font-semibold text-success')}>{reais(totalDaLinha(i.quantidade, u))}</span>
                            <span className="block text-xs text-muted-foreground">{reais(u)} / {i.unidade}</span>
                          </>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr className="border-b border-border/60 text-xs text-muted-foreground">
                <td className="py-2 pr-3">Frete</td>
                {propostas.map((p) => <td key={p.id} className={cn('px-2 py-2 tabular-nums', escolhida === p.id && 'bg-primary/5')}>{p.frete ? reais(p.frete) : '—'}</td>)}
              </tr>
              <tr className="font-semibold">
                <td className="py-2 pr-3">Total</td>
                {propostas.map((p) => <td key={p.id} className={cn('px-2 py-2 tabular-nums', escolhida === p.id && 'bg-primary/5')} data-total>{reais(mapa.totais.get(p.id)?.total ?? 0)}</td>)}
              </tr>
              <tr className="align-top text-xs text-muted-foreground">
                <td className="py-2 pr-3">Condições</td>
                {propostas.map((p) => (
                  <td key={p.id} className={cn('px-2 py-2', escolhida === p.id && 'bg-primary/5')}>
                    {p.prazo_entrega && <span className="block">Entrega: {p.prazo_entrega}</span>}
                    {p.condicao_pagamento && <span className="block">Pagamento: {p.condicao_pagamento}</span>}
                    {p.observacao && <span className="block">{p.observacao}</span>}
                    {p.tem_arquivo
                      ? <a href={`/api/compras/propostas/${p.id}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-primary underline"><FileText className="size-3.5" />{p.arquivo_nome ?? 'Proposta'}</a>
                      : <span className="mt-1 block text-warning-foreground">sem o documento da proposta</span>}
                    {podeCotar && emCotacao && (
                      <span className="mt-2 flex flex-wrap gap-1">
                        <EnviarArquivo pedidoId={pedidoId} propostaId={p.id} temArquivo={p.tem_arquivo} onErro={setErro} />
                        <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditando(p.id)} aria-label={`Editar a proposta de ${p.fornecedor}`}><Pencil className="size-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="size-7" disabled={ocupado} aria-label={`Excluir a proposta de ${p.fornecedor}`}
                          onClick={() => { if (confirm(`Excluir a proposta de ${p.fornecedor}?`)) agir(() => excluirProposta(pedidoId, p.id), () => { if (escolhida === p.id) setEscolhida(null) }) }}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </span>
                    )}
                  </td>
                ))}
              </tr>
              {podeCotar && emCotacao && (
                <tr>
                  <td className="py-2 pr-3 text-xs font-medium">Vencedora</td>
                  {propostas.map((p) => (
                    <td key={p.id} className={cn('px-2 py-2', escolhida === p.id && 'bg-primary/5')}>
                      <label className="flex items-center gap-1.5 text-xs">
                        <input type="radio" name="vencedora" className="size-4" checked={escolhida === p.id} disabled={!mapa.totais.get(p.id)?.completa} onChange={() => setEscolhida(p.id)} />
                        {mapa.totais.get(p.id)?.completa ? 'Escolher' : 'Incompleta'}
                      </label>
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {podeCotar && emCotacao && propostas.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4" data-envio>
          {escolhida && !conferencia.erro ? (
            <p className="text-sm">
              Escolhida: <span className="font-semibold">{propostas.find((p) => p.id === escolhida)?.fornecedor}</span> — <span className="font-semibold tabular-nums">{reais(conferencia.total)}</span>.{' '}
              {conferencia.exige.faixa === 'simples' ? 'Até o limite da compra simples: basta uma proposta.'
                : `Acima de ${reais(regras.limite_simples)}: ${conferencia.exige.propostas} propostas.`}
              {conferencia.exige.diretoria && ` Acima de ${reais(regras.limite_diretoria)}: também a Diretoria aprova.`}
            </p>
          ) : <p className="text-sm text-muted-foreground">{conferencia.erro ?? 'Escolha a proposta vencedora.'}</p>}
          {escolhida && !conferencia.erro && conferencia.precisaJustificar && (
            <p className="flex items-start gap-2 text-sm text-warning-foreground" role="status">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {[conferencia.faltamPropostas > 0 && `Faltam ${conferencia.faltamPropostas} proposta(s) completa(s) para o mínimo.`, conferencia.naoEhAMaisBarata && 'A escolhida não é a mais barata.'].filter(Boolean).join(' ')} Justifique abaixo (fica no processo).
            </p>
          )}
          <Rotulo texto={conferencia.precisaJustificar ? 'Justificativa (obrigatória)' : 'Observação sobre a escolha (opcional)'}>
            <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={2} maxLength={2000} className={campo}
              placeholder={conferencia.precisaJustificar ? 'Ex.: só dois fornecedores atendem o prazo do curso; a mais barata não entrega a tempo.' : ''} />
          </Rotulo>
          <Button className="self-end" disabled={ocupado || !escolhida || Boolean(conferencia.erro) || (conferencia.precisaJustificar && justificativa.trim().length < 15)}
            onClick={() => agir(() => enviarParaAprovacao(pedidoId, escolhida!, justificativa))}>
            {ocupado ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Mandar para aprovação
          </Button>
        </div>
      )}
      {erro && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{erro}</p>}
    </section>
  )
}

function FormularioDaProposta({ pedidoId, itens, proposta, fornecedores, onFim }: {
  pedidoId: string; itens: ItemDoPedido[]; proposta: PropostaNaTela | null; fornecedores: { id: string; nome: string }[]; onFim: () => void
}) {
  const [fornecedor, setFornecedor] = useState(proposta?.favorecido_id ?? fornecedores[0]?.id ?? '')
  const [recebida, setRecebida] = useState(proposta?.recebida_em ?? hoje())
  const [validade, setValidade] = useState(proposta?.validade ?? '')
  const [prazo, setPrazo] = useState(proposta?.prazo_entrega ?? '')
  const [condicao, setCondicao] = useState(proposta?.condicao_pagamento ?? '')
  const [frete, setFrete] = useState(valorNoCampo(proposta?.frete || null))
  const [observacao, setObservacao] = useState(proposta?.observacao ?? '')
  const [precos, setPrecos] = useState<Record<string, string>>(() => Object.fromEntries(itens.map((i) => [i.id, valorNoCampo(proposta?.precos.find((x) => x.item_id === i.id)?.valor_unitario ?? null)])))
  const [erro, setErro] = useState('')
  const [salvando, iniciar] = useTransition()
  return (
    <form className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4" data-formulario-da-proposta
      onSubmit={(e) => {
        e.preventDefault()
        iniciar(async () => {
          const r = await salvarProposta(pedidoId, proposta?.id ?? null, {
            favorecido_id: fornecedor, recebida_em: recebida, validade, prazo_entrega: prazo, condicao_pagamento: condicao, frete, observacao,
            precos: itens.map((i) => ({ item_id: i.id, valor_unitario: precos[i.id] ?? '' })),
          })
          if (r.erro) setErro(r.erro); else onFim()
        })
      }}>
      <p className="text-sm font-medium">{proposta ? `Proposta de ${proposta.fornecedor}` : 'Nova proposta'}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Rotulo texto="Fornecedor" ajuda="Não está na lista? Cadastre em Financeiro → Cadastros → Favorecidos.">
          <select value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} required className={campo}>
            {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </Rotulo>
        <Rotulo texto="Recebida em"><input type="date" value={recebida} onChange={(e) => setRecebida(e.target.value)} required className={campo} /></Rotulo>
        <Rotulo texto="Válida até"><input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className={campo} /></Rotulo>
        <Rotulo texto="Prazo de entrega"><input value={prazo} onChange={(e) => setPrazo(e.target.value)} maxLength={120} placeholder="Ex.: 5 dias úteis" className={campo} /></Rotulo>
        <Rotulo texto="Condição de pagamento"><input value={condicao} onChange={(e) => setCondicao(e.target.value)} maxLength={120} placeholder="Ex.: boleto 28 dias" className={campo} /></Rotulo>
        <Rotulo texto="Frete (R$)"><input value={frete} onChange={(e) => setFrete(e.target.value)} inputMode="decimal" placeholder="0,00" className={campo} /></Rotulo>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">Preço unitário de cada item (vazio: não cotou)</p>
        {itens.map((i) => (
          <label key={i.id} className="grid items-center gap-2 text-sm sm:grid-cols-[1fr_10rem]">
            <span>{i.descricao} <span className="text-xs text-muted-foreground">({String(i.quantidade).replace('.', ',')} {i.unidade})</span></span>
            <input value={precos[i.id] ?? ''} onChange={(e) => setPrecos((p) => ({ ...p, [i.id]: e.target.value }))} inputMode="decimal" placeholder="R$ por unidade" className={campo} aria-label={`Preço unitário de ${i.descricao}`} />
          </label>
        ))}
      </div>
      <Rotulo texto="Observação"><input value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={1000} className={campo} /></Rotulo>
      {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onFim}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={salvando || !fornecedor}>{salvando && <Loader2 className="size-3.5 animate-spin" />}Salvar proposta</Button>
      </div>
    </form>
  )
}

/** O documento da proposta (PDF ou foto): direto ao Storage, depois o servidor confere o conteúdo. */
function EnviarArquivo({ pedidoId, propostaId, temArquivo, onErro }: { pedidoId: string; propostaId: string; temArquivo: boolean; onErro: (e: string) => void }) {
  const router = useRouter()
  const seletor = useRef<HTMLInputElement>(null)
  const [enviando, iniciar] = useTransition()
  const enviar = (arquivo: File) => iniciar(async () => {
    onErro('')
    const r = await prepararArquivoDaProposta(propostaId, arquivo.type, arquivo.size)
    if (r.erro || !r.caminho || !r.token) { onErro(r.erro ?? 'Não foi possível preparar o envio.'); return }
    const { error } = await clienteDoNavegador().storage.from('compras-arquivos').uploadToSignedUrl(r.caminho, r.token, arquivo, { contentType: arquivo.type })
    if (error) { onErro('O arquivo não subiu. Confira a conexão e tente de novo.'); return }
    const g = await registrarArquivoDaProposta(pedidoId, propostaId, r.caminho, { nome: arquivo.name, mime: arquivo.type, tamanho: arquivo.size })
    if (g.erro) onErro(g.erro); else router.refresh()
  })
  return (
    <>
      <input ref={seletor} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = '' }} />
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={enviando} onClick={() => seletor.current?.click()}>
        {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}{temArquivo ? 'Trocar documento' : 'Anexar documento'}
      </Button>
    </>
  )
}
