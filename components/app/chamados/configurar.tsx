'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { PRIORIDADES, ROTULO_DA_PRIORIDADE, SLA_PADRAO, type Sla } from '@/lib/chamados/regras'
import { definirEquipeDaFila, salvarCategoria, salvarFila } from '@/app/actions/chamados'
import { campo } from './comum'

export type FilaNaConfiguracao = {
  id: string; nome: string; prefixo: string; descricao: string | null; ativa: boolean; atendimento24h: boolean; sla: Sla
  membros: string[]; categorias: { id: string; nome: string; descricao: string | null; tipo: 'incidente' | 'solicitacao'; pedeLocal: boolean; ativa: boolean }[]
  abertos: number
}
type Aviso = { tom: 'ok' | 'erro'; texto: string } | null
type Resultado = { erro?: string; recado?: string }

function Recado({ aviso }: { aviso: Aviso }) {
  if (!aviso) return null
  return <p role={aviso.tom === 'erro' ? 'alert' : 'status'} className={cn('rounded-lg px-3 py-2 text-sm', aviso.tom === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>{aviso.texto}</p>
}

function useAcao() {
  const router = useRouter()
  const [aviso, setAviso] = useState<Aviso>(null)
  const [ocupado, rodar] = useTransition()
  const executar = (acao: (f: FormData) => Promise<Resultado>, form: FormData, depois?: () => void) => {
    setAviso(null)
    rodar(async () => {
      const r = await acao(form)
      setAviso(r.erro ? { tom: 'erro', texto: r.erro } : { tom: 'ok', texto: r.recado ?? 'Salvo.' })
      if (!r.erro) { depois?.(); router.refresh() }
    })
  }
  return { aviso, ocupado, executar }
}

export function ConfigurarChamados({ filas, pessoas }: { filas: FilaNaConfiguracao[]; pessoas: { id: string; nome: string; papel: string }[] }) {
  const [aberta, setAberta] = useState<string | null>(filas[0]?.id ?? null)
  const [criando, setCriando] = useState(false)
  return (
    <div data-ajuda="chamados.filas" className="flex flex-col gap-4">
      {filas.map((f) => (
        <Card key={f.id} className="overflow-hidden">
          <button type="button" onClick={() => setAberta(aberta === f.id ? null : f.id)} aria-expanded={aberta === f.id} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-muted/40">
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">{f.prefixo}</span>
            <span className="flex-1 font-medium">{f.nome}{!f.ativa && <span className="ml-2 text-xs font-normal text-muted-foreground">(desativada)</span>}</span>
            <span className="text-xs text-muted-foreground">{f.membros.length} {f.membros.length === 1 ? 'atendente' : 'atendentes'} · {f.categorias.filter((c) => c.ativa).length} assuntos · {f.abertos} em aberto</span>
            <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', aberta === f.id && 'rotate-180')} />
          </button>
          {aberta === f.id && (
            <div className="flex flex-col gap-6 border-t border-border bg-muted/20 p-5">
              <FormularioDaFila fila={f} />
              <Equipe fila={f} pessoas={pessoas} />
              <Categorias fila={f} />
            </div>
          )}
        </Card>
      ))}
      {criando ? <Card className="p-5"><FormularioDaFila aoConcluir={() => setCriando(false)} /></Card>
        : <Button data-ajuda="chamados.nova-fila" variant="outline" size="lg" className="self-start" onClick={() => setCriando(true)}><Plus className="size-4" />Nova fila</Button>}
    </div>
  )
}

function FormularioDaFila({ fila, aoConcluir }: { fila?: FilaNaConfiguracao; aoConcluir?: () => void }) {
  const { aviso, ocupado, executar } = useAcao()
  const sla = fila?.sla ?? SLA_PADRAO
  function enviar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    form.set('atendimento24h', form.get('atendimento24h') ? '1' : '0')
    form.set('ativa', form.get('ativa') ? '1' : '0')
    executar(salvarFila, form, aoConcluir)
  }
  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{fila ? 'Fila' : 'Nova fila'}</h3>
      {fila && <input type="hidden" name="id" value={fila.id} />}
      <div className="grid gap-3 md:grid-cols-[1fr_120px]">
        <label className="flex flex-col gap-1.5 text-sm font-medium">Nome<input name="nome" defaultValue={fila?.nome} required maxLength={60} className={campo} placeholder="Ex.: Compras" /></label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Prefixo<input name="prefixo" defaultValue={fila?.prefixo} required maxLength={6} pattern="[A-Za-z]{2,6}" className={cn(campo, 'uppercase')} placeholder="COM" /></label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">O que esta equipe atende<input name="descricao" defaultValue={fila?.descricao ?? ''} maxLength={300} className={campo} /></label>
      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="ativa" defaultChecked={fila?.ativa ?? true} />Recebendo chamados</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="atendimento24h" defaultChecked={fila?.atendimento24h ?? false} />Atende 24h (prazos em horas corridas)</label>
      </div>
      <div data-ajuda="chamados.sla" className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="pb-2 font-medium">Prioridade</th><th className="pb-2 font-medium">1ª resposta (horas)</th><th className="pb-2 font-medium">Solução (horas)</th></tr></thead>
          <tbody>{[...PRIORIDADES].reverse().map((p) => (
            <tr key={p} className="border-t border-border">
              <td className="py-2">{ROTULO_DA_PRIORIDADE[p]}</td>
              <td className="py-2 pr-3"><input type="number" name={`sla_${p}_resposta`} defaultValue={sla[p].resposta} min={0.25} step={0.25} max={2000} required className={cn(campo, 'w-28')} /></td>
              <td className="py-2"><input type="number" name={`sla_${p}_solucao`} defaultValue={sla[p].solucao} min={0.25} step={0.25} max={2000} required className={cn(campo, 'w-28')} /></td>
            </tr>
          ))}</tbody>
        </table>
        <p className="mt-2 text-xs text-muted-foreground">Horas de atendimento (seg–sex, 8h–18h) — ou corridas, se a fila atende 24h. Mudar o SLA vale para os chamados novos.</p>
      </div>
      <Recado aviso={aviso} />
      <div className="flex justify-end gap-2">
        {aoConcluir && !fila && <Button type="button" variant="ghost" onClick={aoConcluir}>Cancelar</Button>}
        <Button type="submit" disabled={ocupado}>{ocupado && <Loader2 className="size-4 animate-spin" />}{fila ? 'Salvar fila' : 'Criar fila'}</Button>
      </div>
    </form>
  )
}

function Equipe({ fila, pessoas }: { fila: FilaNaConfiguracao; pessoas: { id: string; nome: string; papel: string }[] }) {
  const { aviso, ocupado, executar } = useAcao()
  const [marcados, setMarcados] = useState<string[]>(fila.membros)
  const mudou = marcados.length !== fila.membros.length || marcados.some((m) => !fila.membros.includes(m))
  return (
    <div data-ajuda="chamados.equipe" className="flex flex-col gap-3">
      <div><h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Quem atende</h3><p className="text-xs text-muted-foreground">Recebem os chamados novos desta fila (no sino e por e-mail) e podem responder, atribuir, resolver e transferir. Administradores atendem todas as filas mesmo sem estar aqui.</p></div>
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {pessoas.map((p) => (
          <label key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted/50">
            <input type="checkbox" checked={marcados.includes(p.id)} onChange={(e) => setMarcados(e.target.checked ? [...marcados, p.id] : marcados.filter((m) => m !== p.id))} />
            {p.nome}{p.papel === 'admin' && <span className="text-xs text-muted-foreground">(admin)</span>}
          </label>
        ))}
      </div>
      <Recado aviso={aviso} />
      <div className="flex justify-end"><Button size="sm" disabled={!mudou || ocupado} onClick={() => { const f = new FormData(); f.set('filaId', fila.id); marcados.forEach((m) => f.append('membros', m)); executar(definirEquipeDaFila, f) }}>{ocupado && <Loader2 className="size-3.5 animate-spin" />}Salvar equipe</Button></div>
    </div>
  )
}

function Categorias({ fila }: { fila: FilaNaConfiguracao }) {
  const [editando, setEditando] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-3">
      <div><h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Assuntos (catálogo)</h3><p className="text-xs text-muted-foreground">O que aparece para quem abre o chamado. Incidente é algo que parou; solicitação é algo novo que se pede.</p></div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {fila.categorias.map((c) => (
          <li key={c.id} className="px-3 py-2">
            {editando === c.id ? <FormularioDaCategoria filaId={fila.id} categoria={c} aoConcluir={() => setEditando(null)} /> : (
              <button type="button" onClick={() => setEditando(c.id)} className="flex w-full items-center gap-3 text-left text-sm">
                <span className={cn('flex-1', !c.ativa && 'text-muted-foreground line-through')}>{c.nome}</span>
                <span className="text-xs text-muted-foreground">{c.tipo === 'incidente' ? 'Incidente' : 'Solicitação'}{c.pedeLocal ? ' · pede local' : ''}</span>
              </button>
            )}
          </li>
        ))}
        <li className="px-3 py-2">{editando === 'novo' ? <FormularioDaCategoria filaId={fila.id} aoConcluir={() => setEditando(null)} /> : <button type="button" onClick={() => setEditando('novo')} className="inline-flex items-center gap-1 text-sm text-primary"><Plus className="size-3.5" />Novo assunto</button>}</li>
      </ul>
    </div>
  )
}

function FormularioDaCategoria({ filaId, categoria, aoConcluir }: { filaId: string; categoria?: FilaNaConfiguracao['categorias'][number]; aoConcluir: () => void }) {
  const { aviso, ocupado, executar } = useAcao()
  function enviar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    form.set('filaId', filaId)
    if (categoria) form.set('id', categoria.id)
    form.set('pedeLocal', form.get('pedeLocal') ? '1' : '0')
    form.set('ativa', form.get('ativa') ? '1' : '0')
    executar(salvarCategoria, form, aoConcluir)
  }
  return (
    <form onSubmit={enviar} className="flex flex-col gap-2 py-1">
      <div className="grid gap-2 md:grid-cols-2">
        <input name="nome" defaultValue={categoria?.nome} required maxLength={80} className={campo} placeholder="Nome do assunto" autoFocus />
        <input name="descricao" defaultValue={categoria?.descricao ?? ''} maxLength={200} className={campo} placeholder="Exemplos, para quem abre (opcional)" />
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <select name="tipo" defaultValue={categoria?.tipo ?? 'solicitacao'} className={cn(campo, 'w-auto')}><option value="incidente">Incidente</option><option value="solicitacao">Solicitação</option></select>
        <label className="flex items-center gap-2"><input type="checkbox" name="pedeLocal" defaultChecked={categoria?.pedeLocal ?? false} />Pede local</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="ativa" defaultChecked={categoria?.ativa ?? true} />Ativo</label>
        <span className="ml-auto flex gap-2"><Button type="button" variant="ghost" size="sm" onClick={aoConcluir}>Cancelar</Button><Button type="submit" size="sm" disabled={ocupado}>{ocupado && <Loader2 className="size-3.5 animate-spin" />}Salvar</Button></span>
      </div>
      <Recado aviso={aviso} />
    </form>
  )
}
