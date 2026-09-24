'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink, KeyRound, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/app/imprensa/comum'
import { excluirContaDaEscola, removerChaveDaEscola, salvarContaDaEscola } from '@/app/actions/escola'
import { reaisDeCentavos } from '@/lib/escola/painel'
import type { ContaDaEscola } from '@/lib/escola/servidor'

const diaCurto = (d: string) => d.split('-').reverse().join('/')
const primeiroDoMes = () => `${new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)}-01`

const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null)

function Campo({ rotulo, ajuda, children, className }: { rotulo: string; ajuda?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <label className={`flex flex-col gap-1 text-sm font-medium ${className ?? ''}`}>{rotulo}{children}{ajuda && <span className="text-xs font-normal text-muted-foreground">{ajuda}</span>}</label>
}

function Formulario({ c, onFim }: { c: ContaDaEscola | null; onFim: () => void }) {
  const [estado, enviar, enviando] = useActionState(salvarContaDaEscola.bind(null, c?.id ?? null), {})
  useEffect(() => { if (estado.ok && !estado.erro) onFim() }, [estado.ok, estado.erro, onFim])
  return (
    <form action={enviar} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4" data-conta-form autoComplete="off">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome da conta" ajuda="Como a equipe chama: o curso ou a finalidade da conta."><input name="nome" required maxLength={80} defaultValue={c?.nome} placeholder="Punção Venosa" className={inputClass} /></Campo>
        <Campo rotulo="Endereço do sistema da escola" ajuda="Onde ficam alunos, turmas e a secretaria desta conta (abre em outra aba).">
          <input name="sistema_url" type="url" maxLength={300} defaultValue={c?.sistema_url ?? ''} placeholder="https://…/secretaria" className={inputClass} />
        </Campo>
        <Campo rotulo="Descrição" className="sm:col-span-2"><input name="descricao" maxLength={300} defaultValue={c?.descricao ?? ''} placeholder="Ex.: matrícula e curso presencial de 8h, PIX e cartão" className={inputClass} /></Campo>
        <Campo rotulo={c?.chave_final ? 'Trocar a chave de API' : 'Chave de API da Únicopag'} className="sm:col-span-2"
          ajuda={<>No painel da Únicopag desta conta, em Integrações → API. A chave é testada antes de guardar, vai direto para o cofre e nunca mais aparece aqui (só os 4 últimos caracteres). {c?.chave_final ? 'Deixe em branco para manter a atual.' : ''}</>}>
          <input name="chave" type="password" maxLength={300} autoComplete="new-password" spellCheck={false} placeholder={c?.chave_final ? `•••• ${c.chave_final} (guardada)` : 'Cole a chave aqui'} className={`${inputClass} font-mono`} />
        </Campo>
        <Campo rotulo="Lançar no Financeiro da escola a partir de"
          ajuda="Cada venda paga desde esta data entra sozinha como receita nos livros da Escola (e o estorno, como despesa). O que foi pago antes fica só no painel de vendas.">
          <input name="lancar_desde" type="date" required min="2020-01-01" defaultValue={c?.lancar_desde ?? primeiroDoMes()} className={inputClass} />
        </Campo>
        {c && (
          <Campo rotulo="Situação" ajuda="Conta pausada não é mais lida; o que já foi lido continua no painel.">
            <select name="ativa" defaultValue={c.ativa ? 'sim' : 'nao'} className={inputClass}><option value="sim">Ativa</option><option value="nao">Pausada</option></select>
          </Campo>
        )}
      </div>
      {estado.erro && <p className="text-xs text-destructive" role="alert">{estado.erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onFim}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={enviando}>{enviando && <Loader2 className="size-3.5 animate-spin" />}{enviando ? 'Conferindo…' : 'Salvar'}</Button>
      </div>
    </form>
  )
}

export function ContasDaEscola({ contas, ehAdmin }: { contas: ContaDaEscola[]; ehAdmin: boolean }) {
  const router = useRouter()
  const [editando, setEditando] = useState<string | null>(contas.length || !ehAdmin ? null : 'novo')
  const [recado, setRecado] = useState<{ erro?: string; recado?: string }>({})
  const [pendente, iniciar] = useTransition()
  const fim = () => { setEditando(null); router.refresh() }
  const agir = (fn: () => Promise<{ erro?: string; recado?: string }>, pergunta: string) => {
    if (!window.confirm(pergunta)) return
    iniciar(async () => { setRecado(await fn()); router.refresh() })
  }
  return (
    <div className="flex flex-col gap-3" id="contas-escola">
      {ehAdmin && (editando === 'novo' ? <Formulario c={null} onFim={fim} /> : <div><Button size="sm" variant="outline" onClick={() => setEditando('novo')} id="nova-conta"><Plus className="size-3.5" />Nova conta</Button></div>)}
      {(recado.erro || recado.recado) && <p className={`text-sm ${recado.erro ? 'text-destructive' : 'text-muted-foreground'}`} role="status">{recado.erro ?? recado.recado}</p>}
      {!contas.length && editando !== 'novo' && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhuma conta da Únicopag cadastrada ainda.{ehAdmin ? '' : ' Peça a um admin.'}</p>}
      <ul className="flex flex-col gap-3">
        {contas.map((c) => (
          <li key={c.id} className="rounded-lg border border-border p-4" data-conta={c.nome}>
            {editando === c.id ? <Formulario c={c} onFim={fim} /> : (
              <div className="flex flex-col gap-2">
                <div className="flex items-start gap-3">
                  <div className={`min-w-0 flex-1 ${c.ativa ? '' : 'opacity-60'}`}>
                    <p className="font-medium">{c.nome}{!c.ativa && <span className="ml-2 text-xs font-normal text-muted-foreground">(pausada)</span>}</p>
                    {c.descricao && <p className="text-sm text-muted-foreground">{c.descricao}</p>}
                  </div>
                  {ehAdmin && <button type="button" title="Editar" aria-label={`Editar ${c.nome}`} onClick={() => setEditando(c.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="size-3.5" /></button>}
                </div>
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div className="flex gap-2"><dt className="text-muted-foreground">Chave</dt><dd className="flex items-center gap-1">{c.chave_final ? <><KeyRound className="size-3.5 text-success" />•••• {c.chave_final} <span className="text-xs text-muted-foreground">desde {quando(c.chave_em)}</span></> : <span className="text-warning-foreground">sem chave</span>}</dd></div>
                  <div className="flex gap-2"><dt className="text-muted-foreground">Lida em</dt><dd>{quando(c.sincronizada_em) ?? 'nunca'}</dd></div>
                  <div className="flex gap-2"><dt className="text-muted-foreground">Saldo</dt><dd className="tabular-nums">{c.saldo_disponivel === null ? '—' : `${reaisDeCentavos(c.saldo_disponivel)} disponível · ${reaisDeCentavos(c.saldo_a_liberar ?? 0)} a liberar`}</dd></div>
                  <div className="flex gap-2"><dt className="text-muted-foreground">Financeiro</dt><dd>{c.fin_conta_id
                    ? <Link href="/escola/financeiro" className="text-primary hover:underline">vendas lançadas desde {diaCurto(c.lancar_desde ?? '')}</Link>
                    : <span className="text-muted-foreground">vendas desde {diaCurto(c.lancar_desde ?? primeiroDoMes())} entram na próxima leitura</span>}</dd></div>
                  {c.sistema_url && <div className="flex gap-2"><dt className="text-muted-foreground">Sistema</dt><dd className="min-w-0"><a href={c.sistema_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><span className="truncate">{c.sistema_url.replace(/^https:\/\//, '')}</span><ExternalLink className="size-3 shrink-0" /></a></dd></div>}
                </dl>
                {c.sincronizacao_erro && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">Última leitura falhou: {c.sincronizacao_erro}</p>}
                {ehAdmin && (
                  <div className="flex flex-wrap justify-end gap-2">
                    {c.chave_final && <Button size="sm" variant="ghost" disabled={pendente} onClick={() => agir(() => removerChaveDaEscola(c.id), `Tirar a chave da conta ${c.nome} do cofre? A Redação deixa de ler esta conta até uma chave nova ser guardada.`)}>Tirar a chave</Button>}
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={pendente} onClick={() => agir(() => excluirContaDaEscola(c.id), `Tirar a conta ${c.nome} da Redação? A chave e a cópia das transações somem daqui; os lançamentos já feitos no Financeiro da escola continuam, e na Únicopag nada muda.`)}><Trash2 className="size-3.5" />Tirar conta</Button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
