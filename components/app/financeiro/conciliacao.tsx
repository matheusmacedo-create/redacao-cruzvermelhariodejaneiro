'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CheckCheck, EyeOff, FileUp, Link2, Loader2, Plus, Trash2, Undo2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/app/imprensa/comum'
import { conciliar, conciliarSugestoes, criarDoExtrato, desconciliar, excluirImportacao, ignorarLinha, importarExtrato } from '@/app/actions/financeiro'
import { decodificar, lerExtrato, type Extrato } from '@/lib/financeiro/extrato'
import { dataCurta, reais } from '@/lib/financeiro/regras'

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
  return { erro, ocupado, executar, setErro }
}
const Erro = ({ texto }: { texto: string }) => (texto ? <p className="text-xs text-destructive" role="alert">{texto}</p> : null)

/**
 * Lê o arquivo no navegador, mostra o que achou e só então importa. Assim um
 * CSV de outro banco ou de outra conta aparece antes de entrar.
 */
export function ImportarExtrato({ contaId, contaNome }: { contaId: string; contaNome: string }) {
  const { erro, ocupado, executar, setErro } = useAcao()
  const [arquivo, setArquivo] = useState('')
  const [lido, setLido] = useState<Extrato | null>(null)
  const [feito, setFeito] = useState('')

  const ler = async (f: File) => {
    setErro(''); setFeito(''); setLido(null)
    if (f.size > 10 * 1024 * 1024) { setErro('O arquivo passa de 10 MB. Exporte um período menor.'); return }
    const texto = decodificar(new Uint8Array(await f.arrayBuffer()))
    const e = lerExtrato(f.name, texto)
    setArquivo(f.name)
    if (!e.linhas.length) { setErro(e.avisos[0] ?? 'Não achei movimentos neste arquivo.'); return }
    setLido(e)
  }
  const datas = lido ? lido.linhas.map((l) => l.data).sort() : []
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4" id="importar-extrato" data-ajuda="financeiro.importar-extrato">
      <div className="flex flex-wrap items-center gap-3">
        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 ${ocupado ? 'pointer-events-none opacity-60' : ''}`}>
          <FileUp className="size-4" />Escolher extrato (OFX ou CSV)
          <input type="file" accept=".ofx,.qfx,.csv,.txt,application/x-ofx,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) ler(f) }} />
        </label>
        <span className="text-xs text-muted-foreground">No internet banking: Extrato → Exportar → OFX (Money/Quicken). CSV também serve.</span>
      </div>
      {lido && (
        <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3 text-sm" id="previa-extrato">
          <p><span className="font-medium">{arquivo}</span>: {lido.linhas.length} movimentos de {dataCurta(datas[0])} a {dataCurta(datas[datas.length - 1])}
            {' · '}entradas {reais(lido.linhas.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0))}, saídas {reais(-lido.linhas.filter((l) => l.valor < 0).reduce((s, l) => s + l.valor, 0))}
            {lido.saldo !== null && lido.saldoEm ? ` · saldo no banco ${reais(lido.saldo)} em ${dataCurta(lido.saldoEm)}` : ''}</p>
          {lido.conta && <p className="text-xs text-muted-foreground">Conta no arquivo: {lido.conta}. Confira se é a {contaNome}.</p>}
          {lido.avisos.map((a) => <p key={a} className="text-xs text-warning-foreground">{a}</p>)}
          <div className="flex gap-2">
            <Button size="sm" disabled={ocupado} onClick={() => executar(async () => {
              const r = await importarExtrato(contaId, { arquivo, formato: lido.formato, saldo: lido.saldo, saldoEm: lido.saldoEm }, lido.linhas)
              if (!r.erro) setFeito(`${r.novas} ${r.novas === 1 ? 'movimento novo' : 'movimentos novos'}${r.linhas! > r.novas! ? ` (${r.linhas! - r.novas!} já estavam importados)` : ''}.`)
              return r
            }, () => setLido(null))}>{ocupado && <Loader2 className="size-3.5 animate-spin" />}Importar em {contaNome}</Button>
            <Button size="sm" variant="ghost" onClick={() => setLido(null)}>Cancelar</Button>
          </div>
        </div>
      )}
      {feito && <p className="text-sm text-success" role="status">Importado: {feito}</p>}
      <Erro texto={erro} />
    </div>
  )
}

export function ConciliarSugestoes({ pares }: { pares: { extrato: string; lancamento: string }[] }) {
  const { erro, ocupado, executar } = useAcao()
  if (!pares.length) return null
  return (
    <span className="flex flex-col items-start gap-1">
      <Button disabled={ocupado} onClick={() => executar(() => conciliarSugestoes(pares))} id="conciliar-sugestoes" data-ajuda="financeiro.conciliar-sugestoes">
        {ocupado ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}{pares.length === 1 ? 'Conciliar a sugestão' : `Conciliar as ${pares.length} sugestões`}
      </Button>
      <Erro texto={erro} />
    </span>
  )
}

export type Opcao = { id: string; rotulo: string }
export type CandidatoNaTela = { id: string; rotulo: string; mesmoValor: boolean }

/** Uma linha pendente do extrato e o que dá para fazer com ela. */
export function LinhaPendente({ linha, sugestao, candidatos, categorias, fontes, favorecidos, projetos, padrao, podeMexer }: {
  linha: { id: string; data: string; valor: number; descricao: string; documento: string | null }
  sugestao: CandidatoNaTela | null; candidatos: CandidatoNaTela[]
  categorias: (Opcao & { tipo: string })[]; fontes: Opcao[]; favorecidos: Opcao[]; projetos: Opcao[]
  padrao: { categoria_id: string; fonte_id: string; favorecido_id: string }; podeMexer: boolean
}) {
  const { erro, ocupado, executar } = useAcao()
  const [modo, setModo] = useState<'' | 'escolher' | 'criar' | 'ignorar'>('')
  const [escolhido, setEscolhido] = useState(candidatos[0]?.id ?? '')
  const [novo, setNovo] = useState({ descricao: linha.descricao.slice(0, 190), categoria_id: padrao.categoria_id, fonte_id: padrao.fonte_id, favorecido_id: padrao.favorecido_id, projeto_id: '' })
  const [motivo, setMotivo] = useState('')
  const tipo = linha.valor < 0 ? 'despesa' : 'receita'
  return (
    <li className="flex flex-col gap-2 px-4 py-3" data-extrato={linha.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{linha.descricao}</p>
          <p className="text-xs text-muted-foreground">{dataCurta(linha.data)}{linha.documento ? ` · doc. ${linha.documento}` : ''}</p>
        </div>
        <span className={`whitespace-nowrap text-sm font-semibold tabular-nums ${linha.valor > 0 ? 'text-success' : ''}`}>{linha.valor > 0 ? '+' : '−'}{reais(Math.abs(linha.valor))}</span>
      </div>
      {podeMexer && (
        <div className="flex flex-wrap items-center gap-2">
          {sugestao && (
            <Button size="sm" disabled={ocupado} onClick={() => executar(() => conciliar(linha.id, sugestao.id))} title="Mesmo valor e data próxima">
              <Wand2 className="size-3.5" />É {sugestao.rotulo}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setModo(modo === 'escolher' ? '' : 'escolher')} disabled={!candidatos.length} title={candidatos.length ? '' : 'Nenhum lançamento desta conta com o mesmo sentido perto desta data'}>
            <Link2 className="size-3.5" />{sugestao ? 'Outro lançamento' : 'Escolher lançamento'}</Button>
          <Button size="sm" variant="outline" onClick={() => setModo(modo === 'criar' ? '' : 'criar')}><Plus className="size-3.5" />Criar lançamento</Button>
          <Button size="sm" variant="ghost" onClick={() => setModo(modo === 'ignorar' ? '' : 'ignorar')}><EyeOff className="size-3.5" />Ignorar</Button>
        </div>
      )}
      {modo === 'escolher' && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={escolhido} onChange={(e) => setEscolhido(e.target.value)} aria-label="Lançamento" className={`${inputClass} !w-auto min-w-64 flex-1`}>
            {candidatos.map((c) => <option key={c.id} value={c.id}>{c.mesmoValor ? '● ' : ''}{c.rotulo}</option>)}
          </select>
          <Button size="sm" disabled={ocupado || !escolhido} onClick={() => executar(() => conciliar(linha.id, escolhido))}><Check className="size-3.5" />Conciliar</Button>
        </div>
      )}
      {modo === 'criar' && (
        <div className="grid gap-2 rounded-lg bg-muted/40 p-3 sm:grid-cols-2">
          <input value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} aria-label="Descrição" className={`${inputClass} sm:col-span-2`} />
          <select value={novo.categoria_id} onChange={(e) => setNovo({ ...novo, categoria_id: e.target.value })} aria-label="Categoria" className={inputClass}>
            <option value="">Categoria…</option>{categorias.filter((c) => c.tipo === tipo).map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
          </select>
          <select value={novo.fonte_id} onChange={(e) => setNovo({ ...novo, fonte_id: e.target.value })} aria-label="Fonte" className={inputClass}>
            {fontes.map((f) => <option key={f.id} value={f.id}>{f.rotulo}</option>)}
          </select>
          <select value={novo.favorecido_id} onChange={(e) => setNovo({ ...novo, favorecido_id: e.target.value })} aria-label="Favorecido" className={inputClass}>
            <option value="">{tipo === 'receita' ? 'Quem pagou (opcional)' : 'Favorecido (opcional)'}</option>{favorecidos.map((f) => <option key={f.id} value={f.id}>{f.rotulo}</option>)}
          </select>
          <select value={novo.projeto_id} onChange={(e) => setNovo({ ...novo, projeto_id: e.target.value })} aria-label="Projeto" className={inputClass}>
            <option value="">Sem projeto</option>{projetos.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
          </select>
          <div className="sm:col-span-2"><Button size="sm" disabled={ocupado} onClick={() => executar(() => criarDoExtrato(linha.id, novo))}>{ocupado && <Loader2 className="size-3.5 animate-spin" />}Criar {tipo} já {tipo === 'receita' ? 'recebida' : 'paga'} e conciliar</Button></div>
        </div>
      )}
      {modo === 'ignorar' && (
        <div className="flex flex-wrap items-center gap-2">
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Por quê? Ex.: estorno que se anulou no mesmo dia" aria-label="Motivo" className={`${inputClass} flex-1`} />
          <Button size="sm" variant="outline" disabled={ocupado} onClick={() => executar(() => ignorarLinha(linha.id, motivo))}>Ignorar</Button>
        </div>
      )}
      <Erro texto={erro} />
    </li>
  )
}

export function Desconciliar({ id }: { id: string }) {
  const { erro, ocupado, executar } = useAcao()
  return (
    <span className="flex flex-col items-end gap-1">
      <button type="button" disabled={ocupado} onClick={() => executar(() => desconciliar(id))} title="Desfazer" aria-label="Desfazer"
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Undo2 className="size-3.5" /></button>
      <Erro texto={erro} />
    </span>
  )
}

export function ExcluirImportacao({ id }: { id: string }) {
  const { erro, ocupado, executar } = useAcao()
  return (
    <span className="flex flex-col items-end gap-1">
      <button type="button" disabled={ocupado} onClick={() => { if (confirm('Excluir esta importação e as linhas dela?')) executar(() => excluirImportacao(id)) }} title="Excluir importação" aria-label="Excluir importação"
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-3.5" /></button>
      <Erro texto={erro} />
    </span>
  )
}
