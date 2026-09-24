'use client'

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Package, Pencil, Plus, Trash2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, inputClass } from '@/components/app/imprensa/comum'
import { entregarDoacao, receberDoacao, salvarCampanha, salvarDoador, type DadosDaEntrega, type DadosDoDoador } from '@/app/actions/doacoes'
import { BENEFICIARIOS, lerLinhasRecebidas, type LinhaRecebida } from '@/lib/patrimonio/doacoes'
import { ESTADOS } from '@/lib/patrimonio/regras'
import { UNIDADES, lerQuantidade, quantidade } from '@/lib/patrimonio/estoque'

type Opcao = { id: string; nome: string }
export type MaterialDaDoacao = { id: string; codigo: string; nome: string; unidade: string; controla_validade: boolean; eh_kit: boolean }
export type Doador = { id: string; nome: string; documento: string | null; email: string | null; telefone: string | null; observacao: string | null }
const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
/** Campo estreito numa linha com outros (o inputClass ocupa a largura toda). */
const campoCurto = inputClass.replace('w-full', 'w-24 shrink-0')
function Campo({ rotulo, ajuda, children, className }: { rotulo: string; ajuda?: string; children: React.ReactNode; className?: string }) {
  return <label className={`flex flex-col gap-1 text-sm font-medium ${className ?? ''}`}>{rotulo}{children}{ajuda && <span className="text-xs font-normal text-muted-foreground">{ajuda}</span>}</label>
}
const NOVO = '__novo'

// ---------------------------------------------------------------- doador

export function DialogoDoDoador({ doador, onSalvo, onFechar }: { doador?: Doador; onSalvo: (d: Doador) => void; onFechar: () => void }) {
  const [p, setP] = useState<DadosDoDoador>({ id: doador?.id, nome: doador?.nome ?? '', documento: doador?.documento ?? '', email: doador?.email ?? '', telefone: doador?.telefone ?? '', observacao: doador?.observacao ?? '' })
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const set = (k: keyof DadosDoDoador) => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: e.target.value })
  return (
    <Dialog titulo={doador ? 'Editar doador' : 'Novo doador'} descricao="CPF ou CNPJ saem no recibo. Pessoa ou empresa que prefere não se identificar: deixe a doação como anônima." onFechar={onFechar} podeFechar={!ocupado}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome ou razão social" className="sm:col-span-2"><input value={p.nome} onChange={set('nome')} maxLength={160} className={inputClass} autoFocus /></Campo>
        <Campo rotulo="CPF ou CNPJ"><input value={p.documento} onChange={set('documento')} inputMode="numeric" maxLength={18} className={inputClass} /></Campo>
        <Campo rotulo="Telefone"><input value={p.telefone} onChange={set('telefone')} maxLength={40} className={inputClass} /></Campo>
        <Campo rotulo="E-mail" className="sm:col-span-2"><input value={p.email} onChange={set('email')} type="email" maxLength={200} className={inputClass} /></Campo>
        <Campo rotulo="Observação" className="sm:col-span-2"><input value={p.observacao} onChange={set('observacao')} maxLength={1000} className={inputClass} /></Campo>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onFechar} disabled={ocupado}>Cancelar</Button>
          <Button disabled={ocupado || p.nome.trim().length < 2} onClick={() => iniciar(async () => {
            setErro('')
            const r = await salvarDoador(p)
            if (r.erro || !r.id) { setErro(r.erro ?? 'Não foi possível salvar.'); return }
            onSalvo({ id: r.id, nome: p.nome.trim(), documento: p.documento.replace(/\D/g, '') || null, email: p.email || null, telefone: p.telefone || null, observacao: p.observacao || null })
          })}>{ocupado && <Loader2 className="size-4 animate-spin" />}Salvar</Button>
        </div>
      </div>
    </Dialog>
  )
}

export function EditarDoador({ doador }: { doador: Doador }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button type="button" title="Editar" aria-label="Editar" onClick={() => setAberto(true)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="size-3.5" /></button>
      {aberto && <DialogoDoDoador doador={doador} onFechar={() => setAberto(false)} onSalvo={() => { setAberto(false); router.refresh() }} />}
    </>
  )
}

// ---------------------------------------------------------------- receber

type LinhaNaTela = LinhaRecebida & { chave: number }
/** Tira a chave da tela; "novo material" vai sem item_id. */
function paraEnviar(l: LinhaNaTela): LinhaRecebida {
  const { chave, ...resto } = l
  void chave
  return resto.tipo === 'material' && resto.item_id === NOVO ? { ...resto, item_id: '' } : resto
}
const materialVazio = (chave: number): LinhaNaTela => ({ chave, tipo: 'material', item_id: '', quantidade: '', valor_unitario: '', lote: '', validade: '' })
const bemVazio = (chave: number): LinhaNaTela => ({ chave, tipo: 'bem', nome: '', categoria_id: '', marca: '', modelo: '', numero_serie: '', estado: 'bom', quantidade: '1', valor_unitario: '' })

export function FormularioDeRecebimento({ doadores: iniciais, campanhas, locais, materiais, estCategorias, patCategorias, hoje, campanhaInicial }: {
  doadores: Doador[]; campanhas: Opcao[]; locais: Opcao[]; materiais: MaterialDaDoacao[]; estCategorias: Opcao[]; patCategorias: Opcao[]; hoje: string; campanhaInicial?: string
}) {
  const router = useRouter()
  const [doadores, setDoadores] = useState(iniciais)
  const [novoDoador, setNovoDoador] = useState(false)
  const [cab, setCab] = useState({ doador_id: '', campanha_id: campanhaInicial ?? '', local_id: locais[0]?.id ?? '', data: hoje, observacao: '' })
  const [linhas, setLinhas] = useState<LinhaNaTela[]>([materialVazio(1)])
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const mudar = (chave: number, m: Partial<LinhaNaTela>) => setLinhas(linhas.map((l) => (l.chave === chave ? ({ ...l, ...m } as LinhaNaTela) : l)))
  const proxima = () => Math.max(0, ...linhas.map((l) => l.chave)) + 1
  const { total } = useMemo(() => lerLinhasRecebidas(linhas), [linhas])
  const doador = doadores.find((d) => d.id === cab.doador_id)

  return (
    <div className="flex flex-col gap-5" id="form-recebimento">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Doador" ajuda={doador?.documento ? `${doador.documento.length === 14 ? 'CNPJ' : 'CPF'} no recibo` : !cab.doador_id ? 'Sem doador: o recibo sai como doação anônima.' : undefined}>
          <div className="flex gap-2">
            <select value={cab.doador_id} onChange={(e) => setCab({ ...cab, doador_id: e.target.value })} className={`${inputClass} flex-1`} aria-label="Doador">
              <option value="">Anônimo</option>{doadores.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
            <Button type="button" variant="outline" size="icon-lg" title="Novo doador" aria-label="Novo doador" onClick={() => setNovoDoador(true)}><UserPlus className="size-4" /></Button>
          </div>
        </Campo>
        <Campo rotulo="Campanha">
          <select value={cab.campanha_id} onChange={(e) => setCab({ ...cab, campanha_id: e.target.value })} className={inputClass}><option value="">Sem campanha</option>{campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
        </Campo>
        <Campo rotulo="Onde os itens ficam"><select value={cab.local_id} onChange={(e) => setCab({ ...cab, local_id: e.target.value })} className={inputClass}>{locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></Campo>
        <Campo rotulo="Data"><input type="date" value={cab.data} max={hoje} onChange={(e) => setCab({ ...cab, data: e.target.value })} className={inputClass} /></Campo>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Itens doados</h2>
        <p className="-mt-2 text-xs text-muted-foreground">Material de consumo entra no Estoque; bem durável (cadeira de rodas, geladeira, maca) entra no Patrimônio, com plaqueta. O valor é o de mercado, como pede a ITG 2002.</p>
        <ul className="flex flex-col gap-3" id="linhas-recebidas">
          {linhas.map((l, k) => (
            <li key={l.chave} className="rounded-lg border border-border p-3" data-linha={l.tipo}>
              <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>{k + 1}. {l.tipo === 'material' ? 'Material (estoque)' : 'Bem (patrimônio)'}</span>
                {linhas.length > 1 && <button type="button" aria-label="Tirar linha" onClick={() => setLinhas(linhas.filter((x) => x.chave !== l.chave))} className="rounded p-1 hover:bg-muted hover:text-destructive"><Trash2 className="size-4" /></button>}
              </div>
              {l.tipo === 'material' ? (() => {
                const m = materiais.find((x) => x.id === l.item_id)
                const novo = l.item_id === NOVO
                const un = novo ? l.novo?.unidade ?? 'un' : m?.unidade
                const validade = novo ? l.novo?.controla_validade : m?.controla_validade
                return (
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Campo rotulo="Material" className="sm:col-span-4">
                      <select value={l.item_id} onChange={(e) => mudar(l.chave, { item_id: e.target.value, ...(e.target.value === NOVO ? { novo: { nome: '', categoria_id: '', unidade: 'un', controla_validade: false } } : { novo: undefined }) })} className={inputClass}>
                        <option value="">Escolha…</option><option value={NOVO}>+ Material que ainda não está cadastrado</option>
                        {materiais.map((x) => <option key={x.id} value={x.id}>{x.codigo} · {x.nome}</option>)}
                      </select>
                    </Campo>
                    {novo && l.novo && (
                      <>
                        <Campo rotulo="Nome do material" className="sm:col-span-2"><input value={l.novo.nome} onChange={(e) => mudar(l.chave, { novo: { ...l.novo!, nome: e.target.value } })} maxLength={160} placeholder="Ex.: Cesta básica" className={inputClass} /></Campo>
                        <Campo rotulo="Categoria"><select value={l.novo.categoria_id} onChange={(e) => mudar(l.chave, { novo: { ...l.novo!, categoria_id: e.target.value } })} className={inputClass}><option value="">Escolha…</option>{estCategorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
                        <Campo rotulo="Unidade"><select value={l.novo.unidade} onChange={(e) => mudar(l.chave, { novo: { ...l.novo!, unidade: e.target.value } })} className={inputClass}>{Object.entries(UNIDADES).map(([k2, v]) => <option key={k2} value={k2}>{v}</option>)}</select></Campo>
                        <label className="flex items-center gap-2 text-sm sm:col-span-4"><input type="checkbox" checked={l.novo.controla_validade} onChange={(e) => mudar(l.chave, { novo: { ...l.novo!, controla_validade: e.target.checked } })} />Controla validade (alimento, água, remédio, curativo)</label>
                      </>
                    )}
                    <Campo rotulo={`Quantidade${un ? ` (${UNIDADES[un as keyof typeof UNIDADES] ?? un})` : ''}`}><input value={l.quantidade} onChange={(e) => mudar(l.chave, { quantidade: e.target.value })} inputMode="decimal" className={inputClass} /></Campo>
                    <Campo rotulo="Valor de mercado (cada)"><input value={l.valor_unitario} onChange={(e) => mudar(l.chave, { valor_unitario: e.target.value })} inputMode="decimal" placeholder="0,00" className={inputClass} /></Campo>
                    {validade && (
                      <>
                        <Campo rotulo="Validade"><input type="date" value={l.validade} min={cab.data} onChange={(e) => mudar(l.chave, { validade: e.target.value })} className={inputClass} /></Campo>
                        <Campo rotulo="Lote"><input value={l.lote} onChange={(e) => mudar(l.chave, { lote: e.target.value })} maxLength={60} className={inputClass} /></Campo>
                      </>
                    )}
                  </div>
                )
              })() : (
                <div className="grid gap-3 sm:grid-cols-4">
                  <Campo rotulo="Bem" className="sm:col-span-2"><input value={l.nome} onChange={(e) => mudar(l.chave, { nome: e.target.value })} maxLength={160} placeholder="Ex.: Cadeira de rodas" className={inputClass} /></Campo>
                  <Campo rotulo="Categoria" className="sm:col-span-2"><select value={l.categoria_id} onChange={(e) => mudar(l.chave, { categoria_id: e.target.value })} className={inputClass}><option value="">Escolha…</option>{patCategorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
                  <Campo rotulo="Quantidade" ajuda="Cada um ganha plaqueta."><input value={l.quantidade} onChange={(e) => mudar(l.chave, { quantidade: e.target.value })} inputMode="numeric" className={inputClass} /></Campo>
                  <Campo rotulo="Valor de mercado (cada)"><input value={l.valor_unitario} onChange={(e) => mudar(l.chave, { valor_unitario: e.target.value })} inputMode="decimal" placeholder="0,00" className={inputClass} /></Campo>
                  <Campo rotulo="Estado"><select value={l.estado} onChange={(e) => mudar(l.chave, { estado: e.target.value })} className={inputClass}>{Object.entries(ESTADOS).map(([k2, v]) => <option key={k2} value={k2}>{v}</option>)}</select></Campo>
                  <Campo rotulo="Marca"><input value={l.marca} onChange={(e) => mudar(l.chave, { marca: e.target.value })} maxLength={80} className={inputClass} /></Campo>
                  <Campo rotulo="Modelo" className="sm:col-span-2"><input value={l.modelo} onChange={(e) => mudar(l.chave, { modelo: e.target.value })} maxLength={80} className={inputClass} /></Campo>
                  {l.quantidade.trim() === '1' && <Campo rotulo="Nº de série" className="sm:col-span-2"><input value={l.numero_serie} onChange={(e) => mudar(l.chave, { numero_serie: e.target.value })} maxLength={80} className={inputClass} /></Campo>}
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setLinhas([...linhas, materialVazio(proxima())])}><Plus className="size-3.5" />Material</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setLinhas([...linhas, bemVazio(proxima())])}><Package className="size-3.5" />Bem durável</Button>
        </div>
      </div>

      <Campo rotulo="Observação (sai no recibo)"><textarea value={cab.observacao} onChange={(e) => setCab({ ...cab, observacao: e.target.value })} rows={2} maxLength={2000} className={inputClass} /></Campo>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm">Total a valor de mercado: <span className="font-semibold tabular-nums" id="total-doacao">{reais(total)}</span></p>
        <div className="flex flex-col items-end gap-2">
          {erro && <p className="max-w-xl text-right text-sm text-destructive" role="alert">{erro}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => router.back()} disabled={ocupado}>Cancelar</Button>
            <Button type="button" disabled={ocupado} id="registrar-doacao" onClick={() => iniciar(async () => {
              setErro('')
              const r = await receberDoacao({ ...cab, linhas: linhas.map(paraEnviar) })
              if (r.erro || !r.id) { setErro(r.erro ?? 'Não foi possível registrar.'); return }
              router.push(`/patrimonio/doacoes/recebidas/${r.id}`)
            })}>{ocupado && <Loader2 className="size-4 animate-spin" />}Registrar e emitir recibo</Button>
          </div>
        </div>
      </div>
      {novoDoador && <DialogoDoDoador onFechar={() => setNovoDoador(false)} onSalvo={(d) => { setDoadores([...doadores, d].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))); setCab({ ...cab, doador_id: d.id }); setNovoDoador(false) }} />}
    </div>
  )
}

// ---------------------------------------------------------------- entregar

export function FormularioDeEntrega({ campanhas, locais, materiais, disponivel, hoje, campanhaInicial }: {
  campanhas: Opcao[]; locais: Opcao[]; materiais: MaterialDaDoacao[]; hoje: string; campanhaInicial?: string
  /** Quanto dá para entregar (não vencido) de cada material em cada local: disponivel[local][item]. */
  disponivel: Record<string, Record<string, number>>
}) {
  const router = useRouter()
  const comEstoque = locais.filter((l) => Object.values(disponivel[l.id] ?? {}).some((q) => q > 0))
  const [p, setP] = useState<Omit<DadosDaEntrega, 'itens'>>({
    campanha_id: campanhaInicial ?? '', local_id: comEstoque[0]?.id ?? locais[0]?.id ?? '', data: hoje, beneficiario_tipo: 'familia', beneficiario_nome: '', beneficiario_documento: '',
    responsavel: '', pessoas: '', municipio: 'Rio de Janeiro', bairro: '', observacao: '',
  })
  const [itens, setItens] = useState<{ chave: number; item_id: string; quantidade: string }[]>([{ chave: 1, item_id: '', quantidade: '' }])
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const aqui = disponivel[p.local_id] ?? {}
  const opcoes = materiais.filter((m) => (aqui[m.id] ?? 0) > 0)
  const set = (k: keyof typeof p) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setP({ ...p, [k]: e.target.value })
  const excede = itens.some((i) => { const q = lerQuantidade(i.quantidade); return i.item_id && q !== null && !Number.isNaN(q) && q > (aqui[i.item_id] ?? 0) })
  return (
    <div className="flex flex-col gap-5" id="form-entrega">
      <fieldset className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Quem recebe</legend>
        <Campo rotulo="Tipo"><select value={p.beneficiario_tipo} onChange={set('beneficiario_tipo')} className={inputClass}>{Object.entries(BENEFICIARIOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        <Campo rotulo={p.beneficiario_tipo === 'familia' ? 'Família (sobrenome ou responsável)' : p.beneficiario_tipo === 'acao' ? 'Ação' : 'Nome'}><input value={p.beneficiario_nome} onChange={set('beneficiario_nome')} maxLength={160} className={inputClass} /></Campo>
        <Campo rotulo="Quem assina o recebimento"><input value={p.responsavel} onChange={set('responsavel')} maxLength={160} className={inputClass} /></Campo>
        <Campo rotulo="Documento (opcional)" ajuda="CPF, RG ou CNPJ de quem recebe."><input value={p.beneficiario_documento} onChange={set('beneficiario_documento')} maxLength={30} className={inputClass} /></Campo>
        <Campo rotulo="Pessoas atendidas"><input value={p.pessoas} onChange={set('pessoas')} inputMode="numeric" maxLength={7} className={inputClass} /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Município"><input value={p.municipio} onChange={set('municipio')} maxLength={80} className={inputClass} /></Campo>
          <Campo rotulo="Bairro"><input value={p.bairro} onChange={set('bairro')} maxLength={80} className={inputClass} /></Campo>
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Campanha"><select value={p.campanha_id} onChange={set('campanha_id')} className={inputClass}><option value="">Sem campanha</option>{campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
        <Campo rotulo="Sai de"><select value={p.local_id} onChange={(e) => { setP({ ...p, local_id: e.target.value }); setItens(itens.map((i) => ({ ...i, item_id: '' }))) }} className={inputClass}>{locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></Campo>
        <Campo rotulo="Data"><input type="date" value={p.data} max={hoje} onChange={set('data')} className={inputClass} /></Campo>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Itens entregues</h2>
        {!opcoes.length && <p className="text-sm text-muted-foreground">Nada em estoque neste local.</p>}
        <ul className="flex flex-col gap-2" id="linhas-entregues">
          {itens.map((i) => {
            const m = materiais.find((x) => x.id === i.item_id)
            const q = lerQuantidade(i.quantidade)
            const passou = m && q !== null && !Number.isNaN(q) && q > (aqui[m.id] ?? 0)
            return (
              <li key={i.chave} className="flex flex-wrap items-start gap-2">
                <select aria-label="Material" value={i.item_id} onChange={(e) => setItens(itens.map((x) => (x.chave === i.chave ? { ...x, item_id: e.target.value } : x)))} className={`${inputClass.replace('w-full', 'min-w-0')} flex-1 basis-56`}>
                  <option value="">Escolha…</option>{opcoes.map((x) => <option key={x.id} value={x.id}>{x.nome} (há {quantidade(aqui[x.id], x.unidade)})</option>)}
                </select>
                <input aria-label="Quantidade" value={i.quantidade} onChange={(e) => setItens(itens.map((x) => (x.chave === i.chave ? { ...x, quantidade: e.target.value } : x)))} inputMode="decimal" placeholder="Qtd." className={`${campoCurto} ${passou ? 'border-destructive' : ''}`} />
                {itens.length > 1 && <button type="button" aria-label="Tirar" onClick={() => setItens(itens.filter((x) => x.chave !== i.chave))} className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-4" /></button>}
                {passou && <span className="w-full text-xs text-destructive">Só há {quantidade(aqui[m.id] ?? 0, m.unidade)} neste local (sem contar vencidos).</span>}
              </li>
            )
          })}
        </ul>
        <div><Button type="button" size="sm" variant="outline" onClick={() => setItens([...itens, { chave: Math.max(0, ...itens.map((x) => x.chave)) + 1, item_id: '', quantidade: '' }])}><Plus className="size-3.5" />Item</Button></div>
        <p className="text-xs text-muted-foreground">Sai primeiro o que vence primeiro. Kits prontos (ex.: kit de higiene) aparecem aqui como qualquer material.</p>
      </div>
      <Campo rotulo="Observação (sai no termo)"><textarea value={p.observacao} onChange={set('observacao')} rows={2} maxLength={2000} className={inputClass} /></Campo>
      <div className="flex flex-col items-end gap-2 border-t border-border pt-4">
        {erro && <p className="max-w-xl text-right text-sm text-destructive" role="alert">{erro}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={ocupado}>Cancelar</Button>
          <Button type="button" disabled={ocupado || excede || p.beneficiario_nome.trim().length < 2 || !itens.some((i) => i.item_id && i.quantidade)} id="registrar-entrega" onClick={() => iniciar(async () => {
            setErro('')
            const r = await entregarDoacao({ ...p, itens: itens.filter((i) => i.item_id).map(({ item_id, quantidade: q }) => ({ item_id, quantidade: q })) })
            if (r.erro || !r.id) { setErro(r.erro ?? 'Não foi possível registrar.'); return }
            router.push(`/patrimonio/doacoes/entregas/${r.id}`)
          })}>{ocupado && <Loader2 className="size-4 animate-spin" />}Registrar e emitir termo</Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- campanhas

export type Campanha = { id: string; nome: string; descricao: string | null; inicio: string | null; fim: string | null; projeto_id: string | null; ativa: boolean }

export function FormularioDeCampanha({ c, projetos, onFim }: { c?: Campanha; projetos: Opcao[]; onFim: () => void }) {
  const [estado, enviar, enviando] = useActionState(salvarCampanha.bind(null, c?.id ?? null), {})
  useEffect(() => { if (estado.ok) onFim() }, [estado.ok, onFim])
  return (
    <form action={enviar} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4" id="form-campanha">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome" className="sm:col-span-2"><input name="nome" required maxLength={120} defaultValue={c?.nome} placeholder="Ex.: SOS Chuvas Petrópolis" className={inputClass} /></Campo>
        <Campo rotulo="Começa em"><input type="date" name="inicio" defaultValue={c?.inicio ?? ''} className={inputClass} /></Campo>
        <Campo rotulo="Termina em"><input type="date" name="fim" defaultValue={c?.fim ?? ''} className={inputClass} /></Campo>
        {projetos.length > 0 && <Campo rotulo="Projeto" ajuda="Entradas e entregas da campanha ficam ligadas ao projeto."><select name="projeto_id" defaultValue={c?.projeto_id ?? ''} className={inputClass}><option value="">—</option>{projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Campo>}
        {c && <Campo rotulo="Situação"><select name="ativa" defaultValue={c.ativa ? 'sim' : 'nao'} className={inputClass}><option value="sim">Recebendo doações</option><option value="nao">Encerrada</option></select></Campo>}
        <Campo rotulo="Descrição" className="sm:col-span-2"><textarea name="descricao" rows={2} maxLength={2000} defaultValue={c?.descricao ?? ''} className={inputClass} /></Campo>
      </div>
      {estado.erro && <p className="text-xs text-destructive" role="alert">{estado.erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onFim}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={enviando}>{enviando && <Loader2 className="size-3.5 animate-spin" />}Salvar</Button>
      </div>
    </form>
  )
}

export function NovaCampanha({ projetos, c }: { projetos: Opcao[]; c?: Campanha }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  if (aberto) return <FormularioDeCampanha c={c} projetos={projetos} onFim={() => { setAberto(false); router.refresh() }} />
  return c
    ? <Button size="sm" variant="outline" onClick={() => setAberto(true)}><Pencil className="size-3.5" />Editar campanha</Button>
    : <Button size="sm" variant="outline" onClick={() => setAberto(true)} id="nova-campanha"><Plus className="size-3.5" />Nova campanha</Button>
}
