'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Eye, Loader2, Plus, Trash2, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, inputClass } from '@/components/app/imprensa/comum'
import {
  definirAcessoDaEquipe, excluirRemuneracao, mudarSituacaoDoMembro, registrarRemuneracao, trazerDaListaDeSetores, verDadosRestritos, verRemuneracoes,
  type Remuneracao,
} from '@/app/actions/equipe'
import { BANCO, DOCUMENTOS, MOTIVOS, NIVEIS, moeda, vigente, type NomeDoNivel } from '@/lib/rh/regras'

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
const DATA = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' })

export function TrazerLista({ faltam }: { faltam: number }) {
  const { erro, ocupado, executar } = useAcao()
  const [feito, setFeito] = useState<number | null>(null)
  if (!faltam && feito === null) return null
  return (
    <span className="flex flex-col items-end gap-1">
      <Button variant="outline" disabled={ocupado} onClick={() => executar(async () => {
        const r = await trazerDaListaDeSetores()
        if (!r.erro) setFeito(r.criados ?? 0)
        return r
      })}>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}Trazer {faltam} da lista de setores</Button>
      {feito !== null && <span className="text-xs text-muted-foreground">{feito} fichas criadas. Complete vínculo e admissão de cada uma.</span>}
      <Erro texto={erro} />
    </span>
  )
}

/** Quem acessa a Equipe, e em que nível. Só admin define. */
export function NivelDeAcesso({ userId, nivel, ehAdmin }: { userId: string; nivel: NomeDoNivel | null; ehAdmin: boolean }) {
  const { erro, ocupado, executar } = useAcao()
  if (ehAdmin) return <span className="text-xs text-muted-foreground">Tudo (admin)</span>
  return (
    <span className="flex flex-col items-end gap-1">
      <select aria-label="Nível de acesso" defaultValue={nivel ?? ''} disabled={ocupado} className={`${inputClass} !w-52 py-1.5`}
        onChange={(e) => executar(() => definirAcessoDaEquipe(userId, (e.target.value || null) as NomeDoNivel | null))}>
        <option value="">Sem acesso</option>
        {Object.entries(NIVEIS).map(([k, n]) => <option key={k} value={k}>{n.rotulo}</option>)}
      </select>
      <Erro texto={erro} />
    </span>
  )
}

/** Documentos ou banco, abertos sob demanda. Cada abertura vai para a auditoria. */
export function VerRestritos({ id, tipo, guardado }: { id: string; tipo: 'documentos' | 'banco'; guardado: boolean }) {
  const [dados, setDados] = useState<Record<string, string> | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const campos = tipo === 'documentos' ? DOCUMENTOS : BANCO
  if (!guardado) return <p className="text-sm text-muted-foreground">{tipo === 'documentos' ? 'Nenhum documento guardado.' : 'Nenhum dado bancário guardado.'} Use Editar ficha para incluir.</p>
  if (!dados) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="outline" size="sm" className="self-start" disabled={ocupado} onClick={() => iniciar(async () => {
          const r = await verDadosRestritos(id)
          if (r.erro) setErro(r.erro)
          else setDados((tipo === 'documentos' ? r.documentos : r.banco) ?? {})
        })}>{ocupado ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}{tipo === 'documentos' ? 'Ver documentos' : 'Ver dados bancários'}</Button>
        <p className="text-xs text-muted-foreground">A abertura fica registrada com o seu nome.</p>
        <Erro texto={erro} />
      </div>
    )
  }
  const preenchidos = campos.filter(({ campo }) => dados[campo])
  if (!preenchidos.length) return <p className="text-sm text-muted-foreground">Nada guardado.</p>
  return (
    <dl className="grid grid-cols-[11rem_1fr] gap-x-3 gap-y-1.5 text-sm">
      {preenchidos.map(({ campo, rotulo }) => [
        <dt key={`t${campo}`} className="text-muted-foreground">{rotulo}</dt>, <dd key={`d${campo}`} className="break-all font-mono">{dados[campo]}</dd>,
      ])}
    </dl>
  )
}

/** Histórico de remuneração, aberto sob demanda, com a vigente em destaque. */
export function Remuneracoes({ id, hoje }: { id: string; hoje: string }) {
  const [historico, setHistorico] = useState<Remuneracao[] | null>(null)
  const [novo, setNovo] = useState(false)
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const carregar = () => iniciar(async () => {
    setErro('')
    const r = await verRemuneracoes(id)
    if (r.erro) setErro(r.erro)
    else setHistorico(r.historico ?? [])
  })
  const agir = (f: () => Promise<R>) => iniciar(async () => {
    setErro('')
    const r = await f()
    if (r.erro) { setErro(r.erro); return }
    setNovo(false)
    const h = await verRemuneracoes(id)
    if (h.erro) setErro(h.erro)
    else setHistorico(h.historico ?? [])
  })

  if (!historico) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="outline" size="sm" className="self-start" disabled={ocupado} onClick={carregar}>{ocupado ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}Ver remuneração</Button>
        <p className="text-xs text-muted-foreground">Os valores ficam cifrados. A abertura fica registrada com o seu nome.</p>
        <Erro texto={erro} />
      </div>
    )
  }
  const atual = vigente(historico, hoje)
  const totalBeneficios = (r: Remuneracao) => r.beneficios.reduce((s, b) => s + (b.valor ?? 0), 0)
  return (
    <div className="flex flex-col gap-4">
      {atual ? (
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground">Em vigor desde {DATA(atual.vigencia)}</p>
          <p className="text-2xl font-bold tabular-nums">{moeda(atual.salario)}</p>
          {atual.beneficios.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {atual.beneficios.map((b) => (b.valor !== null ? `${b.nome} ${moeda(b.valor)}` : b.nome)).join(' · ')}
              {totalBeneficios(atual) > 0 ? ` — benefícios somam ${moeda(totalBeneficios(atual))}` : ''}
            </p>
          )}
        </div>
      ) : <p className="text-sm text-muted-foreground">Nenhuma remuneração em vigor registrada.</p>}

      {historico.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {historico.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="font-medium tabular-nums">{moeda(r.salario)}</span>
                <span className="text-muted-foreground"> · {MOTIVOS[r.motivo as keyof typeof MOTIVOS] ?? r.motivo} · a partir de {DATA(r.vigencia)}{r.vigencia > hoje ? ' (futura)' : ''}</span>
                {r.observacao && <span className="block text-xs text-muted-foreground">{r.observacao}</span>}
              </span>
              <button type="button" aria-label="Excluir registro" title="Excluir registro (lançado por engano)" disabled={ocupado}
                onClick={() => { if (confirm('Excluir este registro de remuneração?')) agir(() => excluirRemuneracao(id, r.id)) }}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"><Trash2 className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}

      {novo ? (
        <form className="flex flex-col gap-2 rounded-lg border border-border p-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); agir(() => registrarRemuneracao(id, f)) }}>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Vigência<input name="vigencia" type="date" required defaultValue={hoje} className={inputClass} /></label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Motivo
              <select name="motivo" defaultValue={historico.length ? 'reajuste' : 'admissao'} className={inputClass}>
                {Object.entries(MOTIVOS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Salário base (R$)<input name="salario" required inputMode="decimal" placeholder="3.500,00" className={inputClass} /></label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Benefícios — um por linha, com valor se houver
            <textarea name="beneficios" rows={3} placeholder={'Vale-refeição: 600,00\nVale-transporte: 220,00\nPlano de saúde'} className={inputClass} />
          </label>
          <input name="observacao" maxLength={600} placeholder="Observação (opcional)" aria-label="Observação" className={inputClass} />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setNovo(false)} disabled={ocupado}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={ocupado}>{ocupado && <Loader2 className="size-3.5 animate-spin" />}Registrar</Button>
          </div>
        </form>
      ) : <Button size="sm" variant="outline" className="self-start" onClick={() => setNovo(true)}><Plus className="size-3.5" />Registrar remuneração</Button>}
      <Erro texto={erro} />
    </div>
  )
}

export function AcoesDeSituacao({ id, situacao, hoje }: { id: string; situacao: string; hoje: string }) {
  const { erro, ocupado, executar, setErro } = useAcao()
  const [dialogo, setDialogo] = useState<'ativo' | 'afastado' | 'desligado' | null>(null)
  const [motivo, setMotivo] = useState('')
  const [data, setData] = useState(hoje)
  const fechar = () => { if (!ocupado) { setDialogo(null); setMotivo(''); setErro('') } }
  const TITULO = { ativo: situacao === 'desligado' ? 'Reativar' : 'Registrar retorno', afastado: 'Registrar afastamento', desligado: 'Desligar' } as const
  return (
    <div className="flex flex-col gap-2" data-ajuda="rh.situacao">
      <div className="flex flex-wrap gap-2">
        {situacao === 'ativo' && <Button size="sm" variant="outline" onClick={() => setDialogo('afastado')}>Registrar afastamento</Button>}
        {situacao !== 'ativo' && <Button size="sm" variant="outline" onClick={() => setDialogo('ativo')}>{TITULO.ativo}</Button>}
        {situacao !== 'desligado' && <Button size="sm" variant="ghost" onClick={() => setDialogo('desligado')}><UserX className="size-3.5" />Desligar</Button>}
      </div>
      {!dialogo && <Erro texto={erro} />}
      {dialogo && (
        <Dialog titulo={TITULO[dialogo]} onFechar={fechar} podeFechar={!ocupado}
          descricao={dialogo === 'desligado' ? 'A ficha fica guardada, marcada como desligada, com a data e o motivo. Entra no histórico.' : 'Entra no histórico da pessoa com a data abaixo.'}>
          <form className="flex flex-col gap-3 px-6 py-5" onSubmit={(e) => {
            e.preventDefault()
            executar(() => mudarSituacaoDoMembro(id, dialogo, data, motivo), () => { setDialogo(null); setMotivo('') })
          }}>
            <label className="flex flex-col gap-1 text-sm font-medium">Data<input id="e-sit-data" type="date" value={data} onChange={(e) => setData(e.target.value)} required className={inputClass} /></label>
            <label className="flex flex-col gap-1 text-sm font-medium">{dialogo === 'desligado' ? 'Motivo' : 'Observação (opcional)'}
              <textarea id="e-sit-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={600} className={inputClass} />
            </label>
            <Erro texto={erro} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={fechar} disabled={ocupado}>Voltar</Button>
              <Button type="submit" variant={dialogo === 'desligado' ? 'destructive' : 'default'} disabled={ocupado || (dialogo === 'desligado' && motivo.trim().length < 3)}>
                {ocupado && <Loader2 className="size-4 animate-spin" />}{TITULO[dialogo]}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}
