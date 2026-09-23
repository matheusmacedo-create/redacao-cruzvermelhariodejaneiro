'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Link2, Loader2, Mail, Plus, RefreshCw, Trash2, Unlink, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  configurarCaixa, criarSetor, definirMembros, desconectarGoogle, excluirSetor, sincronizarCaixasAgora,
} from '@/app/actions/correio'

export type SetorNaTela = { id: string; nome: string; membros: string[] }
export type PessoaNaTela = { id: string; nome: string }
export type CaixaNaTela = {
  id: string
  email: string
  nome: string
  assinatura: string
  setorId: string | null
  ativa: boolean
  noGmail: boolean
  principal: boolean
}
export type ConexaoNaTela = { email: string; estado: 'ativa' | 'expirada'; sincronizadaEm: string | null } | null

const campo = 'rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

/**
 * Configuração do correio dos setores (só administradores).
 *
 * Três passos, na ordem em que a tela os mostra: conectar a conta do Google
 * dona dos aliases; criar os setores e dizer quem é de cada um; dizer de que
 * setor é cada endereço e ativá-lo. Endereço novo chega inativo — ninguém
 * envia por ele até esta tela decidir de quem ele é.
 */
export function CorreioDosSetores({ conexao, clienteConfigurado, setores, pessoas, caixas, aviso }: {
  conexao: ConexaoNaTela
  clienteConfigurado: boolean
  setores: SetorNaTela[]
  pessoas: PessoaNaTela[]
  caixas: CaixaNaTela[]
  aviso: { tom: 'ok' | 'erro'; texto: string } | null
}) {
  const router = useRouter()
  const [recado, setRecado] = useState(aviso)
  const [ocupado, rodar] = useTransition()

  const executar = (acao: () => Promise<{ erro?: string; recado?: string }>) => rodar(async () => {
    const r = await acao()
    setRecado(r.erro ? { tom: 'erro', texto: r.erro } : r.recado ? { tom: 'ok', texto: r.recado } : null)
    router.refresh()
  })

  return (
    <div id="correio" className="mt-8 flex scroll-mt-6 flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Correio dos setores</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada setor envia só pelo próprio endereço (alias do Gmail) e com a assinatura exata configurada no Gmail.
          A conta do Google fica guardada no cofre: ninguém dos setores recebe senha nem acesso à caixa.
        </p>
      </div>

      {recado && (
        <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${recado.tom === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-500'}`}>
          {recado.tom === 'erro' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
          {recado.texto}
        </p>
      )}

      <Card className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium">1. Conta do Google</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {!clienteConfigurado
                ? 'Primeiro, cole o ID e a chave secreta do cliente OAuth do Google em Integrações (acima).'
                : !conexao
                  ? 'Conecte a conta do Workspace que tem os aliases dos setores.'
                  : conexao.estado === 'expirada'
                    ? `A autorização de ${conexao.email} expirou ou foi revogada. Reconecte para voltar a enviar.`
                    : `Conectada: ${conexao.email}${conexao.sincronizadaEm ? ` · endereços sincronizados em ${quando.format(new Date(conexao.sincronizadaEm))}` : ''}.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {clienteConfigurado && (
              <Button render={<a href="/api/google/conectar" />} variant={conexao?.estado === 'ativa' ? 'outline' : 'default'}>
                <Link2 className="size-4" />{conexao ? 'Reconectar' : 'Conectar conta Google'}
              </Button>
            )}
            {conexao && (
              <>
                <Button variant="outline" disabled={ocupado} onClick={() => executar(sincronizarCaixasAgora)}>
                  {ocupado ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}Sincronizar endereços
                </Button>
                <Button variant="ghost" className="text-destructive" disabled={ocupado}
                  onClick={() => { if (confirm('Desconectar a conta Google? Nenhum setor conseguirá enviar até reconectar.')) executar(desconectarGoogle) }}>
                  <Unlink className="size-4" />Desconectar
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      <Setores setores={setores} pessoas={pessoas} ocupado={ocupado} executar={executar} />
      <Caixas caixas={caixas} setores={setores} ocupado={ocupado} executar={executar} conectada={Boolean(conexao)} />
    </div>
  )
}

function Setores({ setores, pessoas, ocupado, executar }: {
  setores: SetorNaTela[]
  pessoas: PessoaNaTela[]
  ocupado: boolean
  executar: (a: () => Promise<{ erro?: string; recado?: string }>) => void
}) {
  const [nome, setNome] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const nomeDe = new Map(pessoas.map((p) => [p.id, p.nome]))

  return (
    <Card className="flex flex-col gap-3 p-5">
      <p className="font-medium">2. Setores e quem é de cada um</p>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(); f.set('nome', nome)
        executar(async () => { const r = await criarSetor(f); if (!r.erro) setNome(''); return r })
      }}>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do setor (ex.: Cursos, Voluntariado)" aria-label="Nome do setor" className={`min-w-56 flex-1 ${campo}`} />
        <Button type="submit" variant="outline" disabled={ocupado || nome.trim().length < 2}><Plus className="size-4" />Criar setor</Button>
      </form>

      {setores.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum setor ainda.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {setores.map((s) => (
            <li key={s.id} className="p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{s.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.membros.length ? s.membros.map((id) => nomeDe.get(id) ?? '—').join(', ') : 'Sem membros — ninguém envia por este setor.'}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => { setEditando(editando === s.id ? null : s.id); setMarcados(new Set(s.membros)) }}>
                    <Users className="size-4" />Membros
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={ocupado} aria-label={`Apagar setor ${s.nome}`}
                    onClick={() => { if (confirm(`Apagar o setor "${s.nome}"? As caixas dele ficam sem setor e desativadas.`)) { const f = new FormData(); f.set('id', s.id); executar(() => excluirSetor(f)) } }}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              {editando === s.id && (
                <div className="mt-3 rounded-lg bg-muted/40 p-3">
                  <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
                    {pessoas.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="size-4" checked={marcados.has(p.id)} onChange={() => setMarcados((atual) => {
                          const novo = new Set(atual); if (novo.has(p.id)) novo.delete(p.id); else novo.add(p.id); return novo
                        })} />
                        {p.nome}
                      </label>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
                    <Button size="sm" disabled={ocupado} onClick={() => {
                      const f = new FormData(); f.set('setorId', s.id); f.set('ids', JSON.stringify([...marcados]))
                      executar(async () => { const r = await definirMembros(f); if (!r.erro) setEditando(null); return r })
                    }}>Salvar membros</Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Caixas({ caixas, setores, ocupado, executar, conectada }: {
  caixas: CaixaNaTela[]
  setores: SetorNaTela[]
  ocupado: boolean
  executar: (a: () => Promise<{ erro?: string; recado?: string }>) => void
  conectada: boolean
}) {
  const [vendo, setVendo] = useState<string | null>(null)
  const salvar = (c: CaixaNaTela, setorId: string | null, ativa: boolean) => {
    const f = new FormData()
    f.set('id', c.id); f.set('setorId', setorId ?? ''); f.set('ativa', String(ativa))
    executar(() => configurarCaixa(f))
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <p className="font-medium">3. Endereços (aliases do Gmail)</p>
      {!caixas.length ? (
        <p className="text-sm text-muted-foreground">
          {conectada ? 'Nenhum endereço ainda. Use "Sincronizar endereços".' : 'Os endereços aparecem aqui depois de conectar a conta Google.'}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {caixas.map((c) => (
            <li key={c.id} className="p-3">
              <div className="flex flex-wrap items-center gap-3">
                <Mail className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.email}{c.principal && <span className="ml-2 text-xs font-normal text-muted-foreground">(endereço principal da conta)</span>}</p>
                  <p className="text-xs text-muted-foreground">
                    Sai como “{c.nome || c.email}”
                    {!c.noGmail && <span className="text-destructive"> · não está mais no Gmail — não envia</span>}
                    {!c.assinatura && c.noGmail && <span> · sem assinatura no Gmail</span>}
                  </p>
                </div>
                <select value={c.setorId ?? ''} disabled={ocupado} aria-label={`Setor de ${c.email}`}
                  onChange={(e) => salvar(c, e.target.value || null, e.target.value ? c.ativa : false)} className={campo}>
                  <option value="">Sem setor</option>
                  {setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4" checked={c.ativa} disabled={ocupado || !c.setorId || !c.noGmail}
                    onChange={(e) => salvar(c, c.setorId, e.target.checked)} />
                  Ativa
                </label>
                {c.assinatura && (
                  <Button size="sm" variant="ghost" onClick={() => setVendo(vendo === c.id ? null : c.id)}>
                    {vendo === c.id ? 'Fechar' : 'Assinatura'}
                  </Button>
                )}
              </div>
              {vendo === c.id && (
                // sandbox vazio: a assinatura vem do Gmail e é mostrada como
                // está, mas num quadro sem script e sem acesso a esta página.
                <iframe title={`Assinatura de ${c.email}`} sandbox="" srcDoc={c.assinatura}
                  className="mt-3 h-40 w-full rounded-lg border border-border bg-white" />
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Para mudar a assinatura, altere no Gmail (Configurações → Contas → Enviar e-mail como) e clique em “Sincronizar endereços”.
        A Redação não deixa ninguém editar assinatura na hora de enviar.
      </p>
    </Card>
  )
}
