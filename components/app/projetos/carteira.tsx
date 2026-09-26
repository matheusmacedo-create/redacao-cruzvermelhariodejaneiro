'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { privateAvatarUrl } from '@/lib/avatar-url'
import { criarProjeto } from '@/app/actions/projetos'
import { diasEntre, haQuanto, passouDoPrazo, type SituacaoNaTela } from '@/lib/projetos/cronograma'
import { BarraDeProgresso, campo, dataCurta, PillDaSituacao, type PessoaDoProjeto } from './comum'

export type ProjetoNaCarteira = {
  id: string
  nome: string
  situacao: SituacaoNaTela
  concluido: boolean
  progresso: { feitas: number; total: number; pct: number }
  responsavelId: string | null
  inicio: string | null
  fim: string | null
  ultimaAtualizacao: string | null
}

const ABAS = [
  { id: 'ativos', rotulo: 'Em andamento' },
  { id: 'concluidos', rotulo: 'Concluídos' },
  { id: 'todos', rotulo: 'Todos' },
] as const

/** Ordem de atenção: o que está pior aparece primeiro. */
const PESO: Record<SituacaoNaTela, number> = { atrasado: 0, em_risco: 1, sem_atualizacao: 2, no_prazo: 3, concluido: 4 }

/**
 * A carteira de projetos, como o portfólio do Asana: uma linha por projeto
 * com situação, progresso, responsável, prazo e quando foi a última
 * atualização — para ver de uma vez o que está saindo do trilho.
 */
export function Carteira({ projetos, pessoas, hoje }: { projetos: ProjetoNaCarteira[]; pessoas: PessoaDoProjeto[]; hoje: string }) {
  const [aba, setAba] = useState<(typeof ABAS)[number]['id']>('ativos')
  const [busca, setBusca] = useState('')
  const [novo, setNovo] = useState(false)
  const pessoaPorId = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas])

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return projetos
      .filter((p) => (aba === 'ativos' ? !p.concluido : aba === 'concluidos' ? p.concluido : true))
      .filter((p) => !termo || p.nome.toLowerCase().includes(termo))
      .sort((a, b) => PESO[a.situacao] - PESO[b.situacao] || (a.fim ?? '9999').localeCompare(b.fim ?? '9999') || a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [projetos, aba, busca])

  const contagem = {
    ativos: projetos.filter((p) => !p.concluido).length,
    concluidos: projetos.filter((p) => p.concluido).length,
    todos: projetos.length,
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div data-ajuda="projetos.abas" className="flex overflow-hidden rounded-lg border border-border" role="tablist">
          {ABAS.map((a) => (
            <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}
              className={`border-r border-border px-3 py-1.5 text-sm last:border-r-0 ${aba === a.id ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
              {a.rotulo} <span className="text-xs tabular-nums">({contagem[a.id]})</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar projeto" aria-label="Buscar projeto" className={`w-full pl-9 ${campo}`} />
        </div>
        <Button data-ajuda="projetos.novo" onClick={() => setNovo(true)}><Plus className="size-4" />Novo projeto</Button>
      </div>

      <Card data-ajuda="projetos.lista" className="overflow-hidden p-0">
        {!lista.length ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            {projetos.length ? 'Nenhum projeto neste filtro.' : 'Nenhum projeto ainda. Crie o primeiro para organizar pautas, datas e marcos de uma campanha ou evento.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5">Projeto</th>
                  <th className="px-3 py-2.5">Situação</th>
                  <th className="px-3 py-2.5">Progresso</th>
                  <th className="px-3 py-2.5">Responsável</th>
                  <th className="px-3 py-2.5">Prazo final</th>
                  <th className="px-3 py-2.5">Última atualização</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => {
                  const r = p.responsavelId ? pessoaPorId.get(p.responsavelId) : undefined
                  const vencido = passouDoPrazo(p.fim, hoje, p.concluido)
                  // Projeto em andamento sem atualização há mais de duas semanas: ninguém sabe como está.
                  const desatualizado = !p.concluido && (!p.ultimaAtualizacao || diasEntre(p.ultimaAtualizacao.slice(0, 10), hoje) > 14)
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="max-w-80 px-4 py-3">
                        <Link href={`/projetos/${p.id}`} className="block truncate font-medium hover:text-primary hover:underline">{p.nome}</Link>
                        <span className="text-xs tabular-nums text-muted-foreground">{p.progresso.feitas} de {p.progresso.total} pautas prontas</span>
                      </td>
                      <td className="px-3 py-3"><PillDaSituacao situacao={p.situacao} /></td>
                      <td className="px-3 py-3"><BarraDeProgresso pct={p.progresso.pct} rotulo={`Progresso de ${p.nome}`} /></td>
                      <td className="px-3 py-3">
                        {r ? (
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            <Avatar size="xs" initials={r.iniciais} color={r.cor ?? undefined} src={privateAvatarUrl(r.avatar)} />{r.nome}
                          </span>
                        ) : <span className="text-xs text-muted-foreground">Sem responsável</span>}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-3 tabular-nums ${vencido ? 'font-semibold text-destructive' : ''}`}>
                        {vencido && <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" aria-label="Prazo vencido" />}
                        {dataCurta(p.fim, hoje)}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-3 text-xs ${desatualizado ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}
                        title={desatualizado ? 'Sem atualização de status há mais de 14 dias' : undefined}>
                        {p.ultimaAtualizacao ? haQuanto(p.ultimaAtualizacao, hoje) : 'nunca'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {novo && <NovoProjeto pessoas={pessoas} aoFechar={() => setNovo(false)} />}
    </div>
  )
}

function NovoProjeto({ pessoas, aoFechar }: { pessoas: PessoaDoProjeto[]; aoFechar: () => void }) {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [erro, setErro] = useState('')
  const [criando, criar] = useTransition()

  function enviar() {
    setErro('')
    criar(async () => {
      const f = new FormData()
      f.set('nome', nome); f.set('descricao', descricao); f.set('inicio', inicio); f.set('fim', fim); f.set('responsavel', responsavel)
      const r = await criarProjeto(f)
      if (r.erro || !r.id) { setErro(r.erro ?? 'Não foi possível criar.'); return }
      router.push(`/projetos/${r.id}`)
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/45 p-4 py-10"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !criando) aoFechar() }} role="dialog" aria-modal="true" aria-labelledby="novo-projeto-titulo">
      <Card className="w-full max-w-lg p-0 shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="novo-projeto-titulo" className="font-semibold">Novo projeto</h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
        </header>
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">Nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Ex.: Doação de Sangue — Novembro" className={campo} autoFocus />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">Objetivo
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} placeholder="O que este projeto precisa alcançar" className={campo} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Início
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={campo} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Prazo final
            <input type="date" value={fim} min={inicio || undefined} onChange={(e) => setFim(e.target.value)} className={campo} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">Responsável
            <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={campo}>
              <option value="">Eu mesmo</option>
              {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
        </div>
        {erro && <p className="px-5 text-xs text-destructive">{erro}</p>}
        <div className="flex justify-end gap-2 px-5 py-4">
          <Button variant="outline" onClick={aoFechar} disabled={criando}>Cancelar</Button>
          <Button onClick={enviar} disabled={criando || nome.trim().length < 3}>{criando && <Loader2 className="size-4 animate-spin" />}Criar projeto</Button>
        </div>
      </Card>
    </div>,
    document.body,
  )
}
