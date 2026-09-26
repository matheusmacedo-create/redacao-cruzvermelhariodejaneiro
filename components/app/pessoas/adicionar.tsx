'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, MailWarning, Plus, RotateCw, Search, Send, Trash2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { inputClass } from '@/components/app/imprensa/comum'
import { cancelarConvite, convidarEmLote, reenviarConvite, type ResultadoDoConvite } from '@/app/actions/usuarios'
import { PAPEIS, PAPEL, type Papel } from '@/lib/permissoes'
import { chaveDoNome } from '@/lib/equipe'
import { nomeExibido } from '@/lib/pessoas/diretorio'
import { cn } from '@/lib/utils'

export type Candidato = { chave: string; nome: string; cargo: string | null; setor: string | null; email: string | null; fichaId: string | null; papel: Papel }
export type Pendente = { userId: string; nome: string; email: string | null; setor: string | null; criadoEm: string | null }
type Linha = { chave: string; nome: string; email: string; papel: Papel; coordenacao: string; cargo: string; fichaId: string | null; nova: boolean }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const quando = (t: string | null) => (t ? new Date(t).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '')

export function AdicionarPessoas({ candidatos, pendentes, setores, envioConfigurado, inicial }: {
  candidatos: Candidato[]; pendentes: Pendente[]; setores: string[]; envioConfigurado: boolean; inicial?: string
}) {
  const router = useRouter()
  const paraLinha = (c: Candidato): Linha => ({ chave: c.chave, nome: nomeExibido(c.nome), email: c.email ?? '', papel: c.papel, coordenacao: c.setor && setores.includes(c.setor) ? c.setor : '', cargo: c.cargo ?? '', fichaId: c.fichaId, nova: false })
  const [linhas, setLinhas] = useState<Linha[]>(() => candidatos.filter((c) => inicial && chaveDoNome(c.nome) === chaveDoNome(inicial)).map(paraLinha))
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<ResultadoDoConvite[] | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const escolhidos = new Set(linhas.map((l) => l.chave))
  const visiveis = useMemo(() => candidatos.filter((c) => !q || chaveDoNome(`${c.nome} ${c.cargo ?? ''} ${c.setor ?? ''}`).includes(chaveDoNome(q))), [candidatos, q])
  const alternar = (c: Candidato) => setLinhas(escolhidos.has(c.chave) ? linhas.filter((l) => l.chave !== c.chave) : [...linhas, paraLinha(c)])
  const mudar = (chave: string, m: Partial<Linha>) => setLinhas(linhas.map((l) => (l.chave === chave ? { ...l, ...m } : l)))
  const problemas = linhas.map((l) => (l.nome.trim().split(/\s+/).length < 2 ? 'nome e sobrenome' : !EMAIL.test(l.email.trim()) ? 'e-mail' : !l.coordenacao ? 'setor' : null))
  const pronto = linhas.length > 0 && problemas.every((p) => !p) && envioConfigurado

  return (
    <div className="flex flex-col gap-8">
      {!envioConfigurado && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <MailWarning className="mt-0.5 size-4 shrink-0" />
          <span>O envio de e-mail não está configurado (falta a variável <code className="font-mono">RESEND_API_KEY</code> na Vercel), então convites não saem. Enquanto isso, dê acesso com senha temporária em <Link href="/usuarios" className="font-medium text-primary hover:underline">Usuários</Link>.</span>
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="flex flex-col gap-3 p-4" id="candidatos" data-ajuda="diretorio.candidatos">
          <div>
            <h2 className="font-semibold">1. Quem vai receber acesso</h2>
            <p className="text-xs text-muted-foreground">Da equipe, ainda sem login (fichas da Equipe e a lista oficial dos setores).</p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" aria-label="Buscar na equipe" className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm" />
          </div>
          <ul className="flex max-h-[28rem] flex-col gap-1 overflow-y-auto">
            {visiveis.map((c) => (
              <li key={c.chave}>
                <label className={cn('flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-muted/60', escolhidos.has(c.chave) && 'bg-primary/5')}>
                  <input type="checkbox" checked={escolhidos.has(c.chave)} onChange={() => alternar(c)} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block font-medium">{nomeExibido(c.nome)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{[c.cargo, c.setor].filter(Boolean).join(' · ') || 'Sem cargo e setor'}</span>
                  </span>
                </label>
              </li>
            ))}
            {!visiveis.length && <li className="px-2 py-3 text-sm text-muted-foreground">{candidatos.length ? 'Ninguém com essa busca.' : 'Todos da equipe já têm acesso.'}</li>}
          </ul>
          <Button variant="outline" size="sm" onClick={() => setLinhas([...linhas, { chave: `nova-${Date.now()}`, nome: '', email: '', papel: 'colaborador', coordenacao: '', cargo: '', fichaId: null, nova: true }])} id="outra-pessoa">
            <Plus className="size-3.5" />Outra pessoa (fora da lista)
          </Button>
        </Card>

        <Card className="flex flex-col gap-3 p-4" id="convites" data-ajuda="diretorio.convites">
          <div>
            <h2 className="font-semibold">2. Confira e envie</h2>
            <p className="text-xs text-muted-foreground">Cada pessoa recebe um e-mail com o usuário e um link para criar a própria senha (vale 72 horas). O papel define o que ela pode fazer — na dúvida, <strong>colaborador</strong>; dá para mudar depois.</p>
          </div>
          {!linhas.length ? <p className="rounded-lg bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">Marque pessoas à esquerda ou adicione alguém de fora da lista.</p> : (
            <ul className="flex flex-col gap-3">
              {linhas.map((l, i) => (
                <li key={l.chave} className="rounded-lg border border-border p-3" data-convite={l.nome || 'nova'}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-xs font-medium">Nome completo<input value={l.nome} onChange={(e) => mudar(l.chave, { nome: e.target.value })} readOnly={!l.nova} maxLength={120} className={cn(inputClass, !l.nova && 'bg-muted/40')} /></label>
                    <label className="flex flex-col gap-1 text-xs font-medium">E-mail<input type="email" value={l.email} onChange={(e) => mudar(l.chave, { email: e.target.value })} maxLength={200} placeholder="nome@exemplo.org" className={inputClass} /></label>
                    <label className="flex flex-col gap-1 text-xs font-medium">Setor
                      <select value={l.coordenacao} onChange={(e) => mudar(l.chave, { coordenacao: e.target.value })} className={inputClass}><option value="">Escolha…</option>{setores.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium">Papel
                      <select value={l.papel} onChange={(e) => mudar(l.chave, { papel: e.target.value as Papel })} className={inputClass}>{PAPEIS.map((p) => <option key={p} value={p}>{PAPEL[p].rotulo}</option>)}</select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium sm:col-span-2">Cargo (opcional)<input value={l.cargo} onChange={(e) => mudar(l.chave, { cargo: e.target.value })} maxLength={120} className={inputClass} /></label>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <span className={problemas[i] ? 'text-warning-foreground' : 'text-muted-foreground'}>{problemas[i] ? `Falta: ${problemas[i]}` : PAPEL[l.papel].descricao}</span>
                    <button type="button" aria-label={`Tirar ${l.nome || 'pessoa'}`} onClick={() => setLinhas(linhas.filter((x) => x.chave !== l.chave))} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-4" /></button>
                  </div>
                  {l.papel === 'admin' && <p className="mt-1 text-xs text-warning-foreground">Admin controla pessoas, acessos e integrações. Use só para quem vai administrar o sistema.</p>}
                </li>
              ))}
            </ul>
          )}
          {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
          <div className="flex justify-end">
            <Button disabled={!pronto || ocupado} id="enviar-convites" data-ajuda="diretorio.enviar" onClick={() => iniciar(async () => {
              setErro(''); setResultados(null)
              const r = await convidarEmLote(linhas.map((l) => ({ nome: l.nome.trim(), email: l.email.trim(), papel: l.papel, coordenacao: l.coordenacao, cargo: l.cargo.trim(), fichaId: l.fichaId ?? undefined })))
              if (r.erro) { setErro(r.erro); return }
              setResultados(r.resultados ?? [])
              const ok = new Set((r.resultados ?? []).filter((x) => x.ok).map((x) => chaveDoNome(x.nome)))
              setLinhas(linhas.filter((l) => !ok.has(chaveDoNome(l.nome))))
              router.refresh()
            })}>
              {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Enviar {linhas.length > 1 ? `${linhas.length} convites` : 'convite'}
            </Button>
          </div>
          {resultados && (
            <ul className="flex flex-col gap-1.5 rounded-lg bg-muted/40 p-3 text-sm" id="resultados" role="status">
              {resultados.map((r) => (
                <li key={r.nome} className="flex items-start gap-2">{r.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />}<span><strong>{r.nome}</strong>: {r.mensagem}</span></li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <Pendentes pendentes={pendentes} envioConfigurado={envioConfigurado} />
    </div>
  )
}

function Pendentes({ pendentes, envioConfigurado }: { pendentes: Pendente[]; envioConfigurado: boolean }) {
  const router = useRouter()
  const [recado, setRecado] = useState<{ texto: string; erro: boolean } | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [, iniciar] = useTransition()
  const agir = (userId: string, f: (id: string) => Promise<{ erro?: string; recado?: string }>) => iniciar(async () => {
    setOcupado(userId); setRecado(null)
    const r = await f(userId)
    setOcupado(null)
    setRecado(r.erro ? { texto: r.erro, erro: true } : { texto: r.recado ?? 'Feito.', erro: false })
    router.refresh()
  })
  return (
    <section className="flex flex-col gap-3" id="pendentes" data-ajuda="diretorio.pendentes">
      <div>
        <h2 className="font-semibold">Convites pendentes · {pendentes.length}</h2>
        <p className="text-sm text-muted-foreground">Quem tem conta mas ainda não fez o primeiro acesso. Reenviar gera um link novo (o anterior deixa de valer); cancelar desativa a conta.</p>
      </div>
      {recado && <p className={cn('rounded-lg px-3 py-2 text-sm', recado.erro ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')} role="status">{recado.texto}</p>}
      <Card className="divide-y divide-border">
        {!pendentes.length && <p className="px-5 py-4 text-sm text-muted-foreground">Nenhum convite pendente.</p>}
        {pendentes.map((p) => (
          <div key={p.userId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" data-pendente={nomeExibido(p.nome)}>
            <div className="min-w-0 text-sm">
              <p className="font-medium">{nomeExibido(p.nome)}</p>
              <p className="text-xs text-muted-foreground">{[p.email ?? 'sem e-mail', p.setor, p.criadoEm ? `conta criada em ${quando(p.criadoEm)}` : null].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={!envioConfigurado || !p.email || ocupado === p.userId} title={!p.email ? 'Sem e-mail: cadastre em Usuários' : undefined} onClick={() => agir(p.userId, reenviarConvite)}>
                {ocupado === p.userId ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}Reenviar
              </Button>
              <Button size="sm" variant="ghost" disabled={ocupado === p.userId} onClick={() => { if (window.confirm(`Cancelar o convite de ${nomeExibido(p.nome)}? O link deixa de valer e a conta fica desativada.`)) agir(p.userId, cancelarConvite) }}>Cancelar</Button>
            </div>
          </div>
        ))}
      </Card>
    </section>
  )
}
