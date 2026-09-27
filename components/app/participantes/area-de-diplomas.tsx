'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Award, CheckCircle2, Download, ExternalLink, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { inputClass } from '@/components/app/imprensa/comum'
import { concederDiplomas } from '@/app/actions/diplomas'
import { textoDoDiploma } from '@/lib/cursos/diploma-texto'
import { MAXIMO_POR_EMISSAO, MAXIMO_POR_PDF, semAcento } from '@/lib/participantes/diplomas'
import { CancelarDiploma } from './diplomas'

export type VoluntarioParaDiploma = { id: string; nome: string; horas: number; situacao: string; vinculo: string }
export type DiplomaNaLista = {
  id: string; participante_id: string; codigo: string; nome: string; motivo: 'horas' | 'coordenacao'; marco_horas: number | null
  texto: string | null; emitido_em: string; revogado_em: string | null; motivo_revogacao: string | null
}

const pdfDoLote = (codigos: string[]) => `/api/voluntariado/diplomas/lote?codigos=${codigos.join(',')}`
const horasLegiveis = (h: number) => `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`
const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

/**
 * Emitir o mesmo Diploma de Reconhecimento para vários voluntários de uma vez:
 * escolhe as pessoas, escreve o motivo (vai impresso) e baixa todos num PDF.
 */
export function EmitirDiplomas({ voluntarios }: { voluntarios: VoluntarioParaDiploma[] }) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [soAtivos, setSoAtivos] = useState(true)
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set())
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [feito, setFeito] = useState<{ codigos: string[]; falhas: { nome: string; erro: string }[] } | null>(null)
  const [ocupado, iniciar] = useTransition()

  const visiveis = useMemo(() => {
    const termo = semAcento(busca.trim())
    return voluntarios.filter((v) => (!soAtivos || v.situacao === 'ativo') && (!termo || semAcento(v.nome).includes(termo)))
  }, [voluntarios, busca, soAtivos])
  const nomes = useMemo(() => new Map(voluntarios.map((v) => [v.id, v.nome])), [voluntarios])
  const todosVisiveis = visiveis.length > 0 && visiveis.every((v) => escolhidos.has(v.id))

  const alternar = (id: string) => setEscolhidos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const alternarVisiveis = () => setEscolhidos((s) => {
    const n = new Set(s)
    for (const v of visiveis) { if (todosVisiveis) n.delete(v.id); else n.add(v.id) }
    return n
  })

  const emitir = () => iniciar(async () => {
    setErro(''); setFeito(null)
    const r = await concederDiplomas([...escolhidos], motivo)
    if (r.erro) { setErro(r.erro); return }
    setFeito({ codigos: r.codigos ?? [], falhas: (r.falhas ?? []).map((f) => ({ nome: nomes.get(f.id) ?? 'Voluntário', erro: f.erro })) })
    setEscolhidos(new Set(r.falhas?.map((f) => f.id) ?? []))
    if (!r.falhas?.length) setMotivo('')
    router.refresh()
  })

  const excesso = escolhidos.size > MAXIMO_POR_EMISSAO
  return (
    <Card className="flex flex-col gap-4 p-5" data-ajuda="diplomas.emitir">
      <div>
        <h2 className="flex items-center gap-2 font-semibold"><Award className="size-4 text-primary" />Emitir diplomas</h2>
        <p className="mt-1 text-sm text-muted-foreground">Escolha os voluntários e escreva o motivo: cada um recebe o seu diploma no modelo oficial, com código de verificação, e ele aparece na Área do Voluntário.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar voluntário" aria-label="Buscar voluntário" className={`${inputClass} pl-9`} />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={soAtivos} onChange={(e) => setSoAtivos(e.target.checked)} />Só ativos</label>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <button type="button" onClick={alternarVisiveis} disabled={!visiveis.length} className="font-medium text-primary hover:underline disabled:opacity-50">
              {todosVisiveis ? 'Desmarcar os da lista' : `Marcar os ${visiveis.length} da lista`}
            </button>
            <span className={excesso ? 'font-medium text-destructive' : ''}>{escolhidos.size} escolhido{escolhidos.size === 1 ? '' : 's'}{excesso ? ` (máximo ${MAXIMO_POR_EMISSAO})` : ''}</span>
          </div>
          <ul className="max-h-80 overflow-y-auto rounded-lg border border-border">
            {visiveis.map((v) => (
              <li key={v.id} className="border-b border-border last:border-0">
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
                  <input type="checkbox" checked={escolhidos.has(v.id)} onChange={() => alternar(v.id)} />
                  <span className="min-w-0 flex-1 truncate">{v.nome}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{horasLegiveis(v.horas)}</span>
                </label>
              </li>
            ))}
            {!visiveis.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Ninguém nesta busca.</li>}
          </ul>
        </div>

        <form className="flex min-w-0 flex-col gap-3" onSubmit={(e) => { e.preventDefault(); emitir() }}>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Motivo do reconhecimento
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={10} maxLength={600} rows={5} className={`${inputClass} h-auto py-2`}
              placeholder="Ex.: pela dedicação na resposta às enchentes da Região Serrana, em março de 2026" data-ajuda="diplomas.motivo" />
          </label>
          <p className="rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">No diploma:</span> “Nome do voluntário, {textoDoDiploma({ motivo: 'coordenacao', marcoHoras: null, texto: motivo.trim() || 'o motivo' })}”
          </p>
          {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
          <Button type="submit" disabled={ocupado || !escolhidos.size || excesso || motivo.trim().length < 10} className="self-start">
            {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Award className="size-4" />}
            {ocupado ? 'Emitindo…' : `Emitir ${escolhidos.size || ''} diploma${escolhidos.size === 1 ? '' : 's'}`}
          </Button>
          {feito && (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm" role="status">
              {feito.codigos.length > 0 && (
                <p className="flex flex-wrap items-center gap-2">
                  <CheckCircle2 className="size-4 text-success" />
                  {feito.codigos.length} diploma{feito.codigos.length === 1 ? ' emitido' : 's emitidos'}.
                  {feito.codigos.length <= MAXIMO_POR_PDF && (
                    <a href={pdfDoLote(feito.codigos)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><Download className="size-3.5" />Baixar {feito.codigos.length === 1 ? 'o PDF' : 'todos em um PDF'}</a>
                  )}
                </p>
              )}
              {feito.falhas.map((f, i) => <p key={i} className="text-destructive">{f.nome}: {f.erro}</p>)}
            </div>
          )}
        </form>
      </div>
    </Card>
  )
}

/** Os diplomas emitidos: marcar vários e baixar num PDF só, abrir cada um, conferir e cancelar. */
export function ListaDeDiplomas({ diplomas, podeCancelar }: { diplomas: DiplomaNaLista[]; podeCancelar: boolean }) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const validos = diplomas.filter((d) => !d.revogado_em)
  const todos = validos.length > 0 && validos.slice(0, MAXIMO_POR_PDF).every((d) => marcados.has(d.codigo))
  const alternar = (c: string) => setMarcados((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else if (n.size < MAXIMO_POR_PDF) n.add(c); return n })
  const lista = [...marcados]

  if (!diplomas.length) return <Card className="p-10 text-center text-sm text-muted-foreground">Nenhum diploma neste filtro.</Card>
  return (
    <Card className="overflow-hidden p-0" data-ajuda="diplomas.lista">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-sm">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={todos} disabled={!validos.length} onChange={() => setMarcados(todos ? new Set() : new Set(validos.slice(0, MAXIMO_POR_PDF).map((d) => d.codigo)))} />
          {todos ? 'Desmarcar' : `Marcar ${Math.min(validos.length, MAXIMO_POR_PDF)} válidos`}
        </label>
        {lista.length > 0
          ? <Button size="sm" render={<a href={pdfDoLote(lista)} target="_blank" rel="noopener" />}><Download className="size-3.5" />Baixar {lista.length} em um PDF</Button>
          : <span className="text-xs text-muted-foreground">Marque para baixar vários num PDF só (até {MAXIMO_POR_PDF}).</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead><tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="w-10 px-4 py-2.5"><span className="sr-only">Marcar</span></th><th className="px-3 py-2.5">Voluntário</th><th className="px-3 py-2.5">Reconhecimento</th><th className="px-3 py-2.5">Emitido</th><th className="px-3 py-2.5">Código</th><th className="px-3 py-2.5 text-right">Ações</th>
          </tr></thead>
          <tbody>
            {diplomas.map((d) => (
              <tr key={d.id} className={`border-b border-border last:border-0 ${d.revogado_em ? 'text-muted-foreground' : 'hover:bg-muted/30'}`}>
                <td className="px-4 py-3">{!d.revogado_em && <input type="checkbox" aria-label={`Marcar o diploma de ${d.nome}`} checked={marcados.has(d.codigo)} onChange={() => alternar(d.codigo)} />}</td>
                <td className="max-w-56 px-3 py-3"><Link href={`/voluntariado/${d.participante_id}#diplomas`} className="block truncate font-medium hover:text-primary hover:underline">{d.nome}</Link></td>
                <td className="max-w-80 px-3 py-3 text-xs">
                  <span className="font-medium">{d.motivo === 'horas' ? `${d.marco_horas?.toLocaleString('pt-BR')} horas` : 'Concedido pela coordenação'}</span>
                  {d.texto && <span className="block truncate text-muted-foreground" title={d.texto}>{d.texto}</span>}
                  {d.revogado_em && <span className="block text-destructive">Cancelado em {dataCurta(d.revogado_em)}{d.motivo_revogacao ? `: ${d.motivo_revogacao}` : ''}</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs">{dataCurta(d.emitido_em)}</td>
                <td className="px-3 py-3 font-mono text-xs">{d.codigo}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <a href={`/api/voluntariado/diplomas/${d.codigo}/pdf`} target="_blank" rel="noopener" className="rounded px-1.5 py-1 text-xs font-medium text-primary hover:underline">PDF</a>
                    <a href={`/diploma/${d.codigo}`} target="_blank" rel="noopener" aria-label={`Verificação pública do diploma ${d.codigo}`} title="Verificação pública" className="rounded p-1 text-muted-foreground hover:bg-muted"><ExternalLink className="size-3.5" /></a>
                    {podeCancelar && !d.revogado_em && <CancelarDiploma id={d.id} participanteId={d.participante_id} codigo={d.codigo} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
