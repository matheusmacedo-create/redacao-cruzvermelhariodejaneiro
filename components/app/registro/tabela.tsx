'use client'

import { useMemo, useState } from 'react'
import { Download, ExternalLink, Globe, Search, Share2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export type LinhaDoRegistro = {
  id: string
  canal: string
  canalNome: string
  formato: string
  estado: 'publicada' | 'falhou'
  titulo: string
  url: string | null
  erro: string | null
  /** ISO. É a data do fato: quando publicou, ou quando falhou. */
  quando: string
  pacoteId: string
}

const PERIODOS = [
  { id: '30', rotulo: 'Últimos 30 dias', dias: 30 },
  { id: '90', rotulo: 'Últimos 90 dias', dias: 90 },
  { id: 'tudo', rotulo: 'Tudo', dias: 0 },
]

const quandoLegivel = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
})

/** Uma célula de CSV: aspas dobradas e o campo inteiro entre aspas. */
function celula(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`
}

/**
 * O registro do que saiu: uma linha por destino publicado, com data e link.
 *
 * Filtra no cliente de propósito. O volume aqui é o de uma redação — dezenas
 * por mês, não milhares — e filtrar sem recarregar a página é o que faz a
 * tela servir para conferir uma coisa rápido, que é o uso real dela.
 */
export function TabelaDoRegistro({ linhas }: { linhas: LinhaDoRegistro[] }) {
  const [canal, setCanal] = useState('todos')
  const [periodo, setPeriodo] = useState('30')
  const [busca, setBusca] = useState('')

  const canais = useMemo(() => {
    const vistos = new Map<string, string>()
    for (const l of linhas) vistos.set(l.canal, l.canalNome)
    return [...vistos.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
  }, [linhas])

  const filtradas = useMemo(() => {
    const dias = PERIODOS.find((p) => p.id === periodo)?.dias ?? 0
    const corte = dias ? Date.now() - dias * 24 * 60 * 60 * 1000 : 0
    const termo = busca.trim().toLowerCase()
    return linhas.filter((l) => {
      if (canal !== 'todos' && l.canal !== canal) return false
      if (corte && new Date(l.quando).getTime() < corte) return false
      if (termo && !`${l.titulo} ${l.canalNome} ${l.url ?? ''}`.toLowerCase().includes(termo)) return false
      return true
    })
  }, [linhas, canal, periodo, busca])

  const publicadas = filtradas.filter((l) => l.estado === 'publicada').length
  const falhas = filtradas.length - publicadas

  function baixarCsv() {
    const cabecalho = ['Data', 'Canal', 'Formato', 'Título', 'Situação', 'Endereço', 'Erro']
    const corpo = filtradas.map((l) => [
      quandoLegivel.format(new Date(l.quando)),
      l.canalNome,
      l.formato,
      l.titulo,
      l.estado === 'publicada' ? 'Publicado' : 'Falhou',
      l.url ?? '',
      l.erro ?? '',
    ].map(celula).join(';'))
    // BOM na frente: sem ele o Excel em português abre o acento errado.
    const csv = `﻿${[cabecalho.map(celula).join(';'), ...corpo].join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `registro-de-publicacoes-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const rotuloSelect = 'rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por título, canal ou endereço…"
            className={`w-full pl-9 ${rotuloSelect}`}
          />
        </div>
        <select value={canal} onChange={(e) => setCanal(e.target.value)} className={rotuloSelect} aria-label="Canal">
          <option value="todos">Todos os canais</option>
          {canais.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
        </select>
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className={rotuloSelect} aria-label="Período">
          {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
        </select>
        <Button variant="outline" onClick={baixarCsv} disabled={!filtradas.length}>
          <Download className="size-4" />Baixar CSV
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtradas.length === 0
          ? 'Nenhum registro no filtro atual.'
          : <>
              <span className="font-medium text-foreground">{publicadas}</span> {publicadas === 1 ? 'publicação' : 'publicações'}
              {falhas > 0 && <> · <span className="font-medium text-destructive">{falhas}</span> {falhas === 1 ? 'falha' : 'falhas'}</>}
            </>}
      </p>

      {filtradas.length > 0 && (
        <Card className="overflow-hidden p-0">
          {/* A tabela rola sozinha no celular; a página nunca rola de lado. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quando</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Canal</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">O que saiu</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Situação</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Endereço</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0 align-top hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {quandoLegivel.format(new Date(l.quando))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs font-medium">
                        {l.canal === 'site_web' ? <Globe className="size-3.5" /> : <Share2 className="size-3.5" />}
                        {l.canalNome}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{l.formato}</span>
                    </td>
                    <td className="px-4 py-3">
                      <a href={`/redes/${l.pacoteId}`} className="font-medium hover:underline">{l.titulo}</a>
                      {l.erro && <p className="mt-0.5 text-xs text-destructive">{l.erro}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {l.estado === 'publicada' ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-500">Publicado</span>
                      ) : (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">Falhou</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {l.url ? (
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          Abrir <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        // Nem todo canal devolve endereço do post. Dizer isso é
                        // melhor do que deixar a coluna vazia e parecer erro.
                        <span className="text-xs text-muted-foreground">sem link do canal</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
