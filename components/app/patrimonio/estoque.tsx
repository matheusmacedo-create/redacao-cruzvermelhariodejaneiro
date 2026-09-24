'use client'

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, ClipboardList, Loader2, PackagePlus, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, inputClass } from '@/components/app/imprensa/comum'
import { contarNoEstoque, entradaNoEstoque, montarKits, perdaNoEstoque, saidaDoEstoque, salvarItem, transferirNoEstoque, type DadosDeEntrada } from '@/app/actions/estoque'
import { CAUSAS_DE_PERDA, FINALIDADES, ORIGENS_DE_ENTRADA, UNIDADES, lerQuantidade, planoDeSaida, quantidade, type Lote } from '@/lib/patrimonio/estoque'
import type { ItemDoEstoque } from '@/lib/patrimonio/acesso'

type R = { erro?: string }
function useAcao() {
  const router = useRouter()
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const executar = (f: () => Promise<R>, depois?: () => void) => iniciar(async () => {
    setErro('')
    const r = await f()
    if (r.erro) { setErro(r.erro); return }
    depois?.()
    router.refresh()
  })
  return { erro, ocupado, executar }
}
const Erro = ({ texto }: { texto: string }) => (texto ? <p className="text-xs text-destructive" role="alert">{texto}</p> : null)
function Campo({ rotulo, ajuda, children, largo }: { rotulo: string; ajuda?: string; children: React.ReactNode; largo?: boolean }) {
  return <label className={`flex flex-col gap-1 text-sm font-medium ${largo ? 'sm:col-span-2' : ''}`}>{rotulo}{children}{ajuda && <span className="text-xs font-normal text-muted-foreground">{ajuda}</span>}</label>
}
type Opcao = { id: string; nome: string }
export type ItemParaMovimento = { id: string; codigo: string; nome: string; unidade: string; controla_validade: boolean; eh_kit: boolean }
const dataBr = (d: string | null) => (d ? d.split('-').reverse().join('/') : 'sem validade')
const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
/** Campo estreito numa linha com outros (o inputClass ocupa a largura toda). */
const campoCurto = inputClass.replace('w-full', 'w-24 shrink-0')

// ---------------------------------------------------------------- cadastro do item

export function FormularioDoItem({ categorias, itens, i, componentes: iniciais, podeArquivar }: {
  categorias: Opcao[]; itens: ItemParaMovimento[]; i?: ItemDoEstoque; componentes?: { item_id: string; quantidade: number }[]; podeArquivar?: boolean
}) {
  const router = useRouter()
  const [estado, enviar, enviando] = useActionState(salvarItem.bind(null, i?.id ?? null), {})
  useEffect(() => { if (estado.id) router.push(`/patrimonio/estoque/${estado.id}`) }, [estado.id, router])
  const [ehKit, setEhKit] = useState(i?.eh_kit ?? false)
  const [validade, setValidade] = useState(i?.controla_validade ?? false)
  const [comp, setComp] = useState<{ item_id: string; quantidade: string }[]>((iniciais ?? []).map((c) => ({ item_id: c.item_id, quantidade: String(c.quantidade).replace('.', ',') })))
  const candidatos = itens.filter((x) => !x.eh_kit && x.id !== i?.id)
  return (
    <form action={enviar} className="flex flex-col gap-5" id="form-item">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome do material" largo><input name="nome" required minLength={2} maxLength={160} defaultValue={i?.nome} placeholder="Ex.: Luva de procedimento M (caixa com 100)" className={inputClass} /></Campo>
        <Campo rotulo="Categoria">
          <select name="categoria_id" required defaultValue={i?.categoria_id ?? ''} className={inputClass}><option value="" disabled>Escolha…</option>{categorias.map((k) => <option key={k.id} value={k.id}>{k.nome}</option>)}</select>
        </Campo>
        <Campo rotulo="Unidade" ajuda="Como se conta: por unidade, caixa, pacote, litro…">
          <select name="unidade" defaultValue={i?.unidade ?? 'un'} className={inputClass}>{Object.entries(UNIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Campo>
        <Campo rotulo="Estoque mínimo" ajuda="Somando todos os locais. Abaixo disso, quem opera o estoque recebe aviso. 0 = sem mínimo.">
          <input name="estoque_minimo" inputMode="decimal" defaultValue={i ? String(i.estoque_minimo).replace('.', ',') : '0'} className={inputClass} />
        </Campo>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2 font-medium"><input type="checkbox" name="controla_validade" value="sim" checked={validade} onChange={(e) => setValidade(e.target.checked)} />Controla lote e validade</label>
          {validade && (
            <Campo rotulo="Avisar quantos dias antes de vencer"><input name="aviso_validade_dias" inputMode="numeric" maxLength={3} defaultValue={i?.aviso_validade_dias ?? 60} className={inputClass} /></Campo>
          )}
          <span className="text-xs text-muted-foreground">Medicamentos, curativos, alimentos e água: sempre. A saída segue o que vence primeiro.</span>
        </div>
        <Campo rotulo="Descrição" largo><textarea name="descricao" rows={2} maxLength={2000} defaultValue={i?.descricao ?? ''} className={inputClass} /></Campo>
        {i && podeArquivar && (
          <Campo rotulo="Situação" ajuda="Arquivado some das listas de entrada e saída; só com saldo zerado.">
            <select name="ativo" defaultValue={i.ativo ? 'sim' : 'nao'} className={inputClass}><option value="sim">Em uso</option><option value="nao">Arquivado</option></select>
          </Campo>
        )}
      </div>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Kit</legend>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="eh_kit" value="sim" checked={ehKit} onChange={(e) => setEhKit(e.target.checked)} />Este item é um kit montado com outros materiais (ex.: kit de higiene, kit de primeiros socorros)</label>
        {ehKit && (
          <>
            <input type="hidden" name="componentes" value={JSON.stringify(comp.filter((c) => c.item_id))} />
            <ul className="flex flex-col gap-2" id="componentes">
              {comp.map((c, k) => {
                const it = candidatos.find((x) => x.id === c.item_id)
                return (
                  <li key={k} className="flex items-center gap-2">
                    <select aria-label="Componente" value={c.item_id} onChange={(e) => setComp(comp.map((x, j) => (j === k ? { ...x, item_id: e.target.value } : x)))} className={`${inputClass.replace('w-full', 'min-w-0')} flex-1`}>
                      <option value="">Escolha o material…</option>{candidatos.map((x) => <option key={x.id} value={x.id}>{x.codigo} · {x.nome}</option>)}
                    </select>
                    <input aria-label="Quantidade por kit" inputMode="decimal" value={c.quantidade} onChange={(e) => setComp(comp.map((x, j) => (j === k ? { ...x, quantidade: e.target.value } : x)))} className={campoCurto} />
                    <span className="w-14 text-xs text-muted-foreground">{it ? UNIDADES[it.unidade as keyof typeof UNIDADES] ?? it.unidade : ''}</span>
                    <button type="button" aria-label="Tirar" onClick={() => setComp(comp.filter((_, j) => j !== k))} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-4" /></button>
                  </li>
                )
              })}
            </ul>
            <div><Button type="button" size="sm" variant="outline" onClick={() => setComp([...comp, { item_id: '', quantidade: '1' }])}><Plus className="size-3.5" />Componente</Button></div>
            <p className="text-xs text-muted-foreground">Quantidade de cada material em <em>um</em> kit. Ao montar, o Redação tira os componentes do estoque (o que vence primeiro) e põe os kits prontos.</p>
          </>
        )}
      </fieldset>
      {estado.erro && <p className="text-sm text-destructive" role="alert">{estado.erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" disabled={enviando}>{enviando && <Loader2 className="size-4 animate-spin" />}{i ? 'Salvar' : 'Cadastrar material'}</Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------- entrada

export function NovaEntrada({ itens, locais, fontes, projetos, hoje, itemFixo }: {
  itens: ItemParaMovimento[]; locais: Opcao[]; fontes: Opcao[]; projetos: Opcao[]; hoje: string; itemFixo?: string
}) {
  const vazio: DadosDeEntrada = { item_id: itemFixo ?? '', local_id: locais[0]?.id ?? '', quantidade: '', custo_unitario: '', origem: 'compra', lote: '', validade: '', data: hoje, detalhe: '', documento: '', fonte_id: '', projeto_id: '' }
  const [aberto, setAberto] = useState(false)
  const [p, setP] = useState(vazio)
  const { erro, ocupado, executar } = useAcao()
  const item = itens.find((x) => x.id === p.item_id)
  const q = lerQuantidade(p.quantidade)
  const u = lerQuantidade(p.custo_unitario)
  const total = q && u && !Number.isNaN(q) && !Number.isNaN(u) ? q * u : null
  const set = (k: keyof DadosDeEntrada) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setP({ ...p, [k]: e.target.value })
  return (
    <>
      <Button onClick={() => { setP(vazio); setAberto(true) }} id="botao-entrada"><ArrowDownToLine className="size-4" />Entrada</Button>
      {aberto && (
        <Dialog titulo="Entrada no estoque" largura="max-w-2xl" descricao="Compra, doação ou outra entrada. Doação entra pelo valor de mercado (ITG 2002)." onFechar={() => setAberto(false)} podeFechar={!ocupado}>
          <div className="grid gap-3 sm:grid-cols-2">
            {!itemFixo && (
              <Campo rotulo="Material" largo>
                <select value={p.item_id} onChange={set('item_id')} className={inputClass}><option value="">Escolha…</option>{itens.map((x) => <option key={x.id} value={x.id}>{x.codigo} · {x.nome}</option>)}</select>
              </Campo>
            )}
            <Campo rotulo="Origem"><select value={p.origem} onChange={set('origem')} className={inputClass}>{Object.entries(ORIGENS_DE_ENTRADA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
            <Campo rotulo="Para onde"><select value={p.local_id} onChange={set('local_id')} className={inputClass}>{locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></Campo>
            <Campo rotulo={`Quantidade${item ? ` (${UNIDADES[item.unidade as keyof typeof UNIDADES] ?? item.unidade})` : ''}`}><input value={p.quantidade} onChange={set('quantidade')} inputMode="decimal" className={inputClass} /></Campo>
            <Campo rotulo={p.origem === 'doacao' ? 'Valor de mercado de cada um' : 'Valor de cada um'} ajuda={total !== null ? `Total: ${reais(total)}` : p.origem === 'outro' ? 'Vazio: usa o custo médio atual.' : undefined}>
              <input value={p.custo_unitario} onChange={set('custo_unitario')} inputMode="decimal" placeholder="0,00" className={inputClass} />
            </Campo>
            {(item?.controla_validade || p.lote || p.validade) && (
              <>
                <Campo rotulo="Lote"><input value={p.lote} onChange={set('lote')} maxLength={60} className={inputClass} /></Campo>
                <Campo rotulo={`Validade${item?.controla_validade ? '' : ' (opcional)'}`}><input type="date" value={p.validade} min={p.data} onChange={set('validade')} className={inputClass} /></Campo>
              </>
            )}
            <Campo rotulo={p.origem === 'doacao' ? 'Doador' : p.origem === 'compra' ? 'Fornecedor' : 'De onde veio'}><input value={p.detalhe} onChange={set('detalhe')} maxLength={600} className={inputClass} /></Campo>
            <Campo rotulo="Nota fiscal / documento"><input value={p.documento} onChange={set('documento')} maxLength={80} className={inputClass} /></Campo>
            <Campo rotulo="Data"><input type="date" value={p.data} max={hoje} onChange={set('data')} className={inputClass} /></Campo>
            {fontes.length > 0 && p.origem === 'compra' && (
              <Campo rotulo="Comprado com"><select value={p.fonte_id} onChange={set('fonte_id')} className={inputClass}><option value="">—</option>{fontes.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></Campo>
            )}
            {projetos.length > 0 && (
              <Campo rotulo="Projeto"><select value={p.projeto_id} onChange={set('projeto_id')} className={inputClass}><option value="">—</option>{projetos.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></Campo>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <Erro texto={erro} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAberto(false)} disabled={ocupado}>Cancelar</Button>
              <Button disabled={ocupado || !p.item_id || !p.quantidade} onClick={() => executar(() => entradaNoEstoque(p), () => setAberto(false))}>{ocupado && <Loader2 className="size-4 animate-spin" />}Registrar entrada</Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  )
}

// ---------------------------------------------------------------- saída

export function NovaSaida({ itens, locais, projetos, lotes, hoje, itemFixo }: {
  itens: ItemParaMovimento[]; locais: Opcao[]; projetos: Opcao[]; lotes: (Lote & { item_id: string })[]; hoje: string; itemFixo?: string
}) {
  const vazio = { item_id: itemFixo ?? '', local_id: '', quantidade: '', finalidade: 'atendimento', detalhe: '', projeto_id: '', data: hoje }
  const [aberto, setAberto] = useState(false)
  const [p, setP] = useState(vazio)
  const { erro, ocupado, executar } = useAcao()
  const item = itens.find((x) => x.id === p.item_id)
  const doItem = useMemo(() => lotes.filter((l) => l.item_id === p.item_id), [lotes, p.item_id])
  // Só os locais onde o item tem saldo; o primeiro já vem escolhido.
  const ondeTem = locais.filter((l) => doItem.some((x) => x.local_id === l.id && x.quantidade > 0))
  const local = ondeTem.some((l) => l.id === p.local_id) ? p.local_id : ondeTem[0]?.id ?? ''
  const q = lerQuantidade(p.quantidade)
  const plano = q && !Number.isNaN(q) && local ? planoDeSaida(doItem, local, q, p.data) : null
  const set = (k: keyof typeof vazio) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setP({ ...p, [k]: e.target.value })
  return (
    <>
      <Button variant="outline" onClick={() => { setP(vazio); setAberto(true) }} id="botao-saida"><ArrowUpFromLine className="size-4" />Saída</Button>
      {aberto && (
        <Dialog titulo="Saída do estoque" largura="max-w-2xl" descricao="Sai primeiro o que vence primeiro (FEFO). Material vencido não sai: registre a perda." onFechar={() => setAberto(false)} podeFechar={!ocupado}>
          <div className="grid gap-3 sm:grid-cols-2">
            {!itemFixo && (
              <Campo rotulo="Material" largo>
                <select value={p.item_id} onChange={(e) => setP({ ...p, item_id: e.target.value, local_id: '' })} className={inputClass}>
                  <option value="">Escolha…</option>{itens.filter((x) => lotes.some((l) => l.item_id === x.id && l.quantidade > 0)).map((x) => <option key={x.id} value={x.id}>{x.codigo} · {x.nome}</option>)}
                </select>
              </Campo>
            )}
            <Campo rotulo="De onde">
              <select value={local} onChange={set('local_id')} className={inputClass} disabled={!ondeTem.length}>
                {!ondeTem.length && <option value="">Sem saldo</option>}
                {ondeTem.map((l) => <option key={l.id} value={l.id}>{l.nome} ({quantidade(doItem.filter((x) => x.local_id === l.id && (!x.validade || x.validade >= p.data)).reduce((s, x) => s + x.quantidade, 0), item?.unidade)} para sair)</option>)}
              </select>
            </Campo>
            <Campo rotulo={`Quantidade${item ? ` (${UNIDADES[item.unidade as keyof typeof UNIDADES] ?? item.unidade})` : ''}`}><input value={p.quantidade} onChange={set('quantidade')} inputMode="decimal" className={inputClass} /></Campo>
            <Campo rotulo="Para quê"><select value={p.finalidade} onChange={set('finalidade')} className={inputClass}>{Object.entries(FINALIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
            <Campo rotulo="Data"><input type="date" value={p.data} max={hoje} onChange={set('data')} className={inputClass} /></Campo>
            <Campo rotulo="Para quem / onde" largo><input value={p.detalhe} onChange={set('detalhe')} maxLength={600} placeholder="Ex.: Posto médico do Maracanã, abrigo da Rocinha" className={inputClass} /></Campo>
            {projetos.length > 0 && (
              <Campo rotulo="Projeto"><select value={p.projeto_id} onChange={set('projeto_id')} className={inputClass}><option value="">—</option>{projetos.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></Campo>
            )}
          </div>
          {plano && (
            <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs" id="plano-fefo">
              {plano.lotes.length > 0 && <p>Vai sair: {plano.lotes.map((l) => `${quantidade(l.tirar, item?.unidade)} ${l.lote ? `do lote ${l.lote}` : ''} (${dataBr(l.validade)})`).join(' + ')}.</p>}
              {plano.falta > 0 && <p className="mt-1 font-medium text-destructive">Faltam {quantidade(plano.falta, item?.unidade)} neste local.</p>}
              {plano.vencido > 0 && <p className="mt-1 text-warning-foreground">Há {quantidade(plano.vencido, item?.unidade)} vencidos aqui: registre a perda deles.</p>}
            </div>
          )}
          <div className="mt-3 flex flex-col gap-2">
            <Erro texto={erro} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAberto(false)} disabled={ocupado}>Cancelar</Button>
              <Button disabled={ocupado || !p.item_id || !local || !p.quantidade || Boolean(plano?.falta)} onClick={() => executar(() => saidaDoEstoque({ ...p, local_id: local }), () => setAberto(false))}>
                {ocupado && <Loader2 className="size-4 animate-spin" />}Registrar saída
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  )
}

// ---------------------------------------------------------------- ações no lote

export function AcoesDoLote({ itemId, lote, locais, unidade, vencido }: { itemId: string; lote: Lote; locais: Opcao[]; unidade: string; vencido: boolean }) {
  const [aberto, setAberto] = useState<'transferir' | 'contar' | 'perda' | null>(null)
  const [p, setP] = useState({ local_id: '', quantidade: '', detalhe: '', causa: 'vencido' })
  const { erro, ocupado, executar } = useAcao()
  const abrir = (a: NonNullable<typeof aberto>) => { setP({ local_id: locais.find((l) => l.id !== lote.local_id)?.id ?? '', quantidade: a === 'contar' ? String(lote.quantidade).replace('.', ',') : a === 'perda' && vencido ? String(lote.quantidade).replace('.', ',') : '', detalhe: '', causa: vencido ? 'vencido' : 'avariado' }); setAberto(a) }
  const fechar = () => setAberto(null)
  const contada = lerQuantidade(p.quantidade)
  const dif = aberto === 'contar' && contada !== null && !Number.isNaN(contada) ? Math.round((contada - lote.quantidade) * 1000) / 1000 : 0
  const titulo = `${lote.lote ? `Lote ${lote.lote}` : 'Sem lote'} · ${dataBr(lote.validade)} · ${quantidade(lote.quantidade, unidade)}`
  const botao = 'rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground'
  return (
    <div className="flex justify-end gap-0.5">
      {!vencido && locais.length > 1 && <button type="button" title="Transferir" aria-label="Transferir" className={botao} onClick={() => abrir('transferir')}><ArrowRightLeft className="size-4" /></button>}
      <button type="button" title="Contar" aria-label="Contar" className={botao} onClick={() => abrir('contar')}><ClipboardList className="size-4" /></button>
      <button type="button" title="Registrar perda" aria-label="Registrar perda" className={`${botao} ${vencido ? 'text-destructive' : ''}`} onClick={() => abrir('perda')}><TriangleAlert className="size-4" /></button>
      {aberto && (
        <Dialog titulo={aberto === 'transferir' ? 'Transferir' : aberto === 'contar' ? 'Contagem' : 'Perda'} descricao={titulo} onFechar={fechar} podeFechar={!ocupado}>
          <div className="flex flex-col gap-3 text-left">
            {aberto === 'transferir' && (
              <Campo rotulo="Para onde"><select value={p.local_id} onChange={(e) => setP({ ...p, local_id: e.target.value })} className={inputClass}>{locais.filter((l) => l.id !== lote.local_id).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></Campo>
            )}
            {aberto === 'perda' && (
              <Campo rotulo="O que aconteceu"><select value={p.causa} onChange={(e) => setP({ ...p, causa: e.target.value })} className={inputClass}>{Object.entries(CAUSAS_DE_PERDA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
            )}
            <Campo rotulo={aberto === 'contar' ? 'Quanto há de fato' : 'Quantidade'} ajuda={aberto === 'contar' && dif !== 0 ? `Diferença: ${dif > 0 ? '+' : ''}${quantidade(dif, unidade)}` : undefined}>
              <input value={p.quantidade} onChange={(e) => setP({ ...p, quantidade: e.target.value })} inputMode="decimal" className={inputClass} autoFocus />
            </Campo>
            <Campo rotulo={aberto === 'contar' ? 'O que pode ter acontecido' : 'Observação'}>
              <input value={p.detalhe} onChange={(e) => setP({ ...p, detalhe: e.target.value })} maxLength={600} placeholder={aberto === 'contar' ? 'Obrigatório se a contagem der diferente' : ''} className={inputClass} />
            </Campo>
            <Erro texto={erro} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={fechar} disabled={ocupado}>Cancelar</Button>
              <Button disabled={ocupado || !p.quantidade} variant={aberto === 'perda' ? 'destructive' : 'default'}
                onClick={() => executar(() => (aberto === 'transferir' ? transferirNoEstoque(itemId, { saldo_id: lote.id, ...p }) : aberto === 'contar' ? contarNoEstoque(itemId, { saldo_id: lote.id, ...p }) : perdaNoEstoque(itemId, { saldo_id: lote.id, ...p })), fechar)}>
                {ocupado && <Loader2 className="size-4 animate-spin" />}{aberto === 'transferir' ? 'Transferir' : aberto === 'contar' ? 'Registrar contagem' : 'Registrar perda'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- kits

export function MontarKits({ kitId, locais, possiveis }: { kitId: string; locais: Opcao[]; possiveis: Record<string, number> }) {
  const [aberto, setAberto] = useState(false)
  const melhor = locais.slice().sort((a, b) => (possiveis[b.id] ?? 0) - (possiveis[a.id] ?? 0))[0]?.id ?? ''
  const [p, setP] = useState({ local_id: melhor, quantidade: '' })
  const { erro, ocupado, executar } = useAcao()
  const max = possiveis[p.local_id] ?? 0
  return (
    <>
      <Button onClick={() => { setP({ local_id: melhor, quantidade: '' }); setAberto(true) }} id="botao-montar"><PackagePlus className="size-4" />Montar kits</Button>
      {aberto && (
        <Dialog titulo="Montar kits" descricao="Tira os componentes do estoque (o que vence primeiro) e põe os kits prontos no mesmo local. O kit vence quando vence o primeiro componente." onFechar={() => setAberto(false)} podeFechar={!ocupado}>
          <div className="flex flex-col gap-3">
            <Campo rotulo="Onde"><select value={p.local_id} onChange={(e) => setP({ ...p, local_id: e.target.value })} className={inputClass}>{locais.map((l) => <option key={l.id} value={l.id}>{l.nome} — dá para {possiveis[l.id] ?? 0}</option>)}</select></Campo>
            <Campo rotulo="Quantos kits" ajuda={`Com o que há neste local, dá para montar até ${max}.`}><input value={p.quantidade} onChange={(e) => setP({ ...p, quantidade: e.target.value })} inputMode="numeric" className={inputClass} /></Campo>
            <Erro texto={erro} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAberto(false)} disabled={ocupado}>Cancelar</Button>
              <Button disabled={ocupado || !p.quantidade || !max} onClick={() => executar(() => montarKits(kitId, p), () => setAberto(false))}>{ocupado && <Loader2 className="size-4 animate-spin" />}Montar</Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  )
}
