'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import {
  Building2, Check, Download, Loader2, Pencil, Plus, Search, ShieldCheck, Trash2, UserSearch, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  adicionarContatosDaBusca, atualizarContato, buscarContatosPorDominio, criarContatoManual,
  encontrarEEcadastrarContato, excluirContato, verificarEmailDoContato,
  type CandidatoDeContato, type ContatoDeImprensa,
} from '@/app/actions/imprensa'
import { comoBalde } from '@/lib/imprensa/email-status'

const inputClass = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

const STATUS_INFO: Record<ContatoDeImprensa['emailStatus'], { rotulo: string; classe: string }> = {
  nao_verificado: { rotulo: 'Não verificado', classe: 'bg-secondary text-secondary-foreground' },
  valido: { rotulo: 'Válido', classe: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-500' },
  arriscado: { rotulo: 'Arriscado', classe: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  invalido: { rotulo: 'Inválido', classe: 'bg-destructive/10 text-destructive' },
}

function BadgeDeStatus({ status }: { status: ContatoDeImprensa['emailStatus'] }) {
  const s = STATUS_INFO[status]
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${s.classe}`}>{s.rotulo}</span>
}

/** Uma célula de CSV: aspas dobradas e o campo inteiro entre aspas. */
function celula(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`
}

/**
 * Imprensa: o banco de contatos de jornalistas e veículos.
 *
 * Três caminhos para um contato entrar aqui: digitado à mão, encontrado por
 * domínio (a Hunter devolve todo mundo que ela já viu naquele veículo) ou
 * encontrado por nome (quando já se sabe QUEM procurar, só falta o e-mail).
 * Filtra no cliente de propósito — mesmo espírito do Registro: o volume aqui
 * é de uma redação, não de uma agência.
 */
export function PainelDeImprensa({ contatos, hunterDisponivel }: {
  contatos: ContatoDeImprensa[]
  hunterDisponivel: boolean
}) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [dialogNovo, setDialogNovo] = useState<'fechado' | 'criar' | ContatoDeImprensa>('fechado')
  const [dialogBusca, setDialogBusca] = useState(false)
  const [dialogFinder, setDialogFinder] = useState(false)

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return contatos.filter((c) => {
      if (filtroStatus !== 'todos' && c.emailStatus !== filtroStatus) return false
      if (!termo) return true
      const alvo = `${c.nome} ${c.veiculo} ${c.cargo} ${c.email ?? ''} ${c.dominio} ${c.tags.join(' ')}`.toLowerCase()
      return alvo.includes(termo)
    })
  }, [contatos, busca, filtroStatus])

  function baixarCsv() {
    const cabecalho = ['Nome', 'Veículo', 'Cargo', 'E-mail', 'Situação', 'Confiança', 'Telefone', 'Tags', 'Notas']
    const corpo = filtrados.map((c) => [
      c.nome, c.veiculo, c.cargo, c.email ?? '', STATUS_INFO[c.emailStatus].rotulo,
      c.confianca !== null ? `${c.confianca}%` : '', c.telefone, c.tags.join(', '), c.notas,
    ].map(celula).join(';'))
    // BOM na frente: sem ele o Excel em português abre o acento errado.
    const csv = `﻿${[cabecalho.map(celula).join(';'), ...corpo].join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `contatos-de-imprensa-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      {!hunterDisponivel && (
        <Card className="border-dashed p-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Busca automática desligada.</span> Cadastre HUNTER_API_KEY nas
          variáveis de ambiente da Vercel e republique para encontrar e verificar contatos pela Hunter.io. O cadastro
          manual continua funcionando normalmente.
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, veículo, e-mail…"
            className={`w-full pl-9 ${inputClass}`}
          />
        </div>
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className={inputClass + ' w-auto'} aria-label="Situação do e-mail">
          <option value="todos">Toda situação</option>
          <option value="valido">Válido</option>
          <option value="arriscado">Arriscado</option>
          <option value="invalido">Inválido</option>
          <option value="nao_verificado">Não verificado</option>
        </select>
        {hunterDisponivel && (
          <>
            <Button variant="outline" onClick={() => setDialogBusca(true)}><Building2 className="size-4" />Buscar por domínio</Button>
            <Button variant="outline" onClick={() => setDialogFinder(true)}><UserSearch className="size-4" />Encontrar e-mail</Button>
          </>
        )}
        <Button variant="outline" onClick={() => setDialogNovo('criar')}><Plus className="size-4" />Novo contato</Button>
        <Button variant="outline" onClick={baixarCsv} disabled={!filtrados.length}><Download className="size-4" />Baixar CSV</Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtrados.length === 0
          ? contatos.length === 0
            ? 'Nenhum contato ainda. Busque por domínio, por nome, ou cadastre um à mão.'
            : 'Nenhum contato no filtro atual.'
          : <><span className="font-medium text-foreground">{filtrados.length}</span> {filtrados.length === 1 ? 'contato' : 'contatos'}</>}
      </p>

      {filtrados.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Veículo</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">E-mail</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Telefone</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <LinhaDoContato key={c.id} contato={c} hunterDisponivel={hunterDisponivel} onEditar={() => setDialogNovo(c)} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {dialogNovo !== 'fechado' && (
        <DialogNovoContato
          editando={dialogNovo === 'criar' ? null : dialogNovo}
          onFechar={() => setDialogNovo('fechado')}
          onSalvo={() => { setDialogNovo('fechado'); router.refresh() }}
        />
      )}
      {dialogBusca && <DialogBuscarDominio onFechar={() => setDialogBusca(false)} onAdicionados={() => router.refresh()} />}
      {dialogFinder && (
        <DialogEncontrarEmail
          onFechar={() => setDialogFinder(false)}
          onEncontrado={() => { setDialogFinder(false); router.refresh() }}
        />
      )}
    </div>
  )
}

function LinhaDoContato({ contato, hunterDisponivel, onEditar }: {
  contato: ContatoDeImprensa
  hunterDisponivel: boolean
  onEditar: () => void
}) {
  const router = useRouter()
  const [ocupado, rodar] = useTransition()
  const [erro, setErro] = useState('')

  function verificar() {
    setErro('')
    rodar(async () => {
      const form = new FormData()
      form.set('id', contato.id)
      const r = await verificarEmailDoContato(form)
      if (r.erro) { setErro(r.erro); return }
      router.refresh()
    })
  }

  function excluir() {
    if (!confirm(`Remover ${contato.nome || contato.email || 'este contato'} da lista?`)) return
    setErro('')
    rodar(async () => {
      const form = new FormData()
      form.set('id', contato.id)
      const r = await excluirContato(form)
      if (r.erro) { setErro(r.erro); return }
      router.refresh()
    })
  }

  return (
    <tr className="border-b border-border align-top last:border-0 hover:bg-muted/30">
      <td className="px-4 py-3">
        <p className="font-medium">{contato.nome || <span className="text-muted-foreground">(sem nome)</span>}</p>
        {contato.cargo && <p className="text-xs text-muted-foreground">{contato.cargo}</p>}
        {erro && <p className="mt-1 text-xs text-destructive">{erro}</p>}
      </td>
      <td className="px-4 py-3">
        <p>{contato.veiculo || '—'}</p>
        {contato.dominio && <p className="text-xs text-muted-foreground">{contato.dominio}</p>}
      </td>
      <td className="px-4 py-3">
        {contato.email
          ? (
            <div className="flex flex-col gap-1">
              <a href={`mailto:${contato.email}`} className="text-primary hover:underline">{contato.email}</a>
              <span className="flex items-center gap-1.5">
                <BadgeDeStatus status={contato.emailStatus} />
                {contato.confianca !== null && <span className="text-[11px] text-muted-foreground">{contato.confianca}%</span>}
              </span>
            </div>
          )
          : <span className="text-xs text-muted-foreground">sem e-mail</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-3">{contato.telefone || '—'}</td>
      <td className="px-4 py-3">
        {contato.tags.length
          ? <span className="flex flex-wrap gap-1">{contato.tags.map((t) => <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t}</span>)}</span>
          : '—'}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          {hunterDisponivel && contato.email && (
            <button type="button" onClick={verificar} disabled={ocupado} title="Verificar e-mail com a Hunter.io"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40">
              {ocupado ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            </button>
          )}
          <button type="button" onClick={onEditar} title="Editar" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <Pencil className="size-4" />
          </button>
          <button type="button" onClick={excluir} disabled={ocupado} title="Remover" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40">
            <Trash2 className="size-4" />
          </button>
        </div>
      </td>
    </tr>
  )
}

/** A moldura repetida dos três diálogos: fundo, Escape, título e botão de fechar. */
function Dialog({ titulo, descricao, largura = 'max-w-lg', onFechar, podeFechar = true, children }: {
  titulo: string
  descricao?: string
  largura?: string
  onFechar: () => void
  podeFechar?: boolean
  children: React.ReactNode
}) {
  useEffect(() => {
    function noEscape(e: KeyboardEvent) { if (e.key === 'Escape' && podeFechar) onFechar() }
    document.addEventListener('keydown', noEscape)
    return () => document.removeEventListener('keydown', noEscape)
  }, [onFechar, podeFechar])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/45 p-4 py-8"
      onMouseDown={(e) => { if (e.target === e.currentTarget && podeFechar) onFechar() }}
      role="dialog"
      aria-modal="true"
    >
      <Card className={`w-full ${largura} overflow-hidden p-0 shadow-2xl`}>
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{titulo}</h2>
            {descricao && <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>}
          </div>
          <button type="button" onClick={onFechar} disabled={!podeFechar} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40">
            <X className="size-4" />
          </button>
        </header>
        <div className="flex flex-col gap-4 px-6 py-5">{children}</div>
      </Card>
    </div>,
    document.body,
  )
}

function DialogNovoContato({ editando, onFechar, onSalvo }: {
  editando: ContatoDeImprensa | null
  onFechar: () => void
  onSalvo: () => void
}) {
  const [nome, setNome] = useState(editando?.nome ?? '')
  const [veiculo, setVeiculo] = useState(editando?.veiculo ?? '')
  const [cargo, setCargo] = useState(editando?.cargo ?? '')
  const [dominio, setDominio] = useState(editando?.dominio ?? '')
  const [email, setEmail] = useState(editando?.email ?? '')
  const [telefone, setTelefone] = useState(editando?.telefone ?? '')
  const [tags, setTags] = useState(editando?.tags.join(', ') ?? '')
  const [notas, setNotas] = useState(editando?.notas ?? '')
  const [erro, setErro] = useState('')
  const [salvando, salvar] = useTransition()

  function enviar() {
    setErro('')
    salvar(async () => {
      const form = new FormData()
      if (editando) form.set('id', editando.id)
      form.set('nome', nome)
      form.set('veiculo', veiculo)
      form.set('cargo', cargo)
      form.set('dominio', dominio)
      form.set('email', email)
      form.set('telefone', telefone)
      form.set('tags', tags)
      form.set('notas', notas)
      const r = editando ? await atualizarContato(form) : await criarContatoManual(form)
      if (r.erro) { setErro(r.erro); return }
      onSalvo()
    })
  }

  return (
    <Dialog titulo={editando ? 'Editar contato' : 'Novo contato'} onFechar={onFechar} podeFechar={!salvando}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} disabled={salvando} placeholder="Nome da pessoa" className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-sm font-medium">Veículo
          <input value={veiculo} onChange={(e) => setVeiculo(e.target.value)} disabled={salvando} placeholder="O Globo, G1, Rádio Globo…" className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-sm font-medium">Cargo
          <input value={cargo} onChange={(e) => setCargo(e.target.value)} disabled={salvando} placeholder="Repórter, Editor…" className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-sm font-medium">E-mail
          <input value={email} onChange={(e) => setEmail(e.target.value)} disabled={salvando} type="email" placeholder="nome@veiculo.com" className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-sm font-medium">Telefone
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} disabled={salvando} placeholder="(21) 90000-0000" className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-sm font-medium">Domínio do veículo <span className="font-normal text-muted-foreground">(opcional)</span>
          <input value={dominio} onChange={(e) => setDominio(e.target.value)} disabled={salvando} placeholder="oglobo.globo.com" className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-sm font-medium">Tags <span className="font-normal text-muted-foreground">(separadas por vírgula)</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} disabled={salvando} placeholder="saude, emergencia" className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-sm font-medium sm:col-span-2">Notas
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} disabled={salvando} rows={2} className={`mt-1 ${inputClass}`} />
        </label>
      </div>

      {erro && <p className="text-xs text-destructive">{erro}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
        <Button onClick={enviar} disabled={salvando || (!nome.trim() && !email.trim())}>
          {salvando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Salvar
        </Button>
      </div>
    </Dialog>
  )
}

function DialogBuscarDominio({ onFechar, onAdicionados }: {
  onFechar: () => void
  onAdicionados: () => void
}) {
  const [dominio, setDominio] = useState('')
  const [veiculo, setVeiculo] = useState('')
  const [candidatos, setCandidatos] = useState<CandidatoDeContato[] | null>(null)
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [resultado, setResultado] = useState('')
  const [buscando, buscar] = useTransition()
  const [salvando, salvar] = useTransition()

  function buscarAgora() {
    setErro(''); setAviso(''); setResultado(''); setCandidatos(null)
    buscar(async () => {
      const form = new FormData()
      form.set('dominio', dominio)
      const r = await buscarContatosPorDominio(form)
      if (r.erro) { setErro(r.erro); return }
      setCandidatos(r.candidatos ?? [])
      setVeiculo(r.organizacao || '')
      setAviso(r.aviso ?? '')
      // Pré-marca quem ainda não está cadastrado — é o caso comum.
      setSelecionados(new Set((r.candidatos ?? []).map((_, i) => i).filter((i) => !r.candidatos![i].jaCadastrado)))
    })
  }

  function alternar(i: number) {
    setSelecionados((atual) => {
      const novo = new Set(atual)
      if (novo.has(i)) novo.delete(i); else novo.add(i)
      return novo
    })
  }

  function adicionar() {
    if (!candidatos) return
    setErro(''); setResultado('')
    const escolhidos = candidatos.filter((_, i) => selecionados.has(i))
    salvar(async () => {
      const form = new FormData()
      form.set('dominio', dominio)
      form.set('veiculo', veiculo)
      form.set('candidatos', JSON.stringify(escolhidos))
      const r = await adicionarContatosDaBusca(form)
      if (r.erro) { setErro(r.erro); return }
      setResultado(`${r.adicionados} contato(s) adicionado(s).${r.repetidos ? ` ${r.repetidos} já estavam na lista.` : ''}`)
      onAdicionados()
      setCandidatos(null)
    })
  }

  const ocupado = buscando || salvando

  return (
    <Dialog
      titulo="Buscar contatos por domínio"
      descricao="A Hunter.io mostra todo mundo que já viu naquele veículo. Você escolhe quem entra na lista."
      largura="max-w-2xl"
      onFechar={onFechar}
      podeFechar={!ocupado}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-48 flex-1 text-sm font-medium">Domínio do veículo
          <input
            value={dominio}
            onChange={(e) => setDominio(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') buscarAgora() }}
            disabled={ocupado}
            placeholder="oglobo.globo.com"
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <Button onClick={buscarAgora} disabled={ocupado || dominio.trim().length < 3}>
          {buscando ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          {buscando ? 'Buscando…' : 'Buscar'}
        </Button>
      </div>

      {erro && <p className="text-xs text-destructive">{erro}</p>}
      {aviso && <p className="text-xs text-amber-700 dark:text-amber-400">{aviso}</p>}
      {resultado && <p className="text-xs text-emerald-700 dark:text-emerald-500">{resultado}</p>}

      {candidatos && candidatos.length > 0 && (
        <>
          <label className="text-sm font-medium">Nome do veículo, para salvar junto com os contatos
            <input value={veiculo} onChange={(e) => setVeiculo(e.target.value)} disabled={ocupado} className={`mt-1 ${inputClass}`} />
          </label>

          <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
            {candidatos.map((c, i) => (
              <label key={`${c.email}-${i}`} className={`flex items-start gap-2.5 border-b border-border p-2.5 text-sm last:border-0 ${c.jaCadastrado ? 'opacity-50' : 'cursor-pointer hover:bg-muted/40'}`}>
                <input
                  type="checkbox"
                  checked={selecionados.has(i)}
                  onChange={() => alternar(i)}
                  disabled={ocupado || c.jaCadastrado}
                  className="mt-0.5 size-4 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{[c.nome, c.sobrenome].filter(Boolean).join(' ') || c.email}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.email}{c.cargo ? ` · ${c.cargo}` : ''}{c.confianca !== null ? ` · confiança ${c.confianca}%` : ''}
                  </span>
                </span>
                {c.jaCadastrado
                  ? <span className="shrink-0 text-[11px] text-muted-foreground">já cadastrado</span>
                  : c.status && <BadgeDeStatus status={comoBalde(c.status)} />}
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onFechar} disabled={ocupado}>Fechar</Button>
            <Button onClick={adicionar} disabled={ocupado || selecionados.size === 0}>
              {salvando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Adicionar {selecionados.size || ''} selecionado(s)
            </Button>
          </div>
        </>
      )}
    </Dialog>
  )
}

function DialogEncontrarEmail({ onFechar, onEncontrado }: {
  onFechar: () => void
  onEncontrado: () => void
}) {
  const [nome, setNome] = useState('')
  const [sobrenome, setSobrenome] = useState('')
  const [dominio, setDominio] = useState('')
  const [veiculo, setVeiculo] = useState('')
  const [cargo, setCargo] = useState('')
  const [telefone, setTelefone] = useState('')
  const [notas, setNotas] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [buscando, buscar] = useTransition()

  function enviar() {
    setErro(''); setAviso('')
    buscar(async () => {
      const form = new FormData()
      form.set('nome', nome)
      form.set('sobrenome', sobrenome)
      form.set('dominio', dominio)
      form.set('veiculo', veiculo)
      form.set('cargo', cargo)
      form.set('telefone', telefone)
      form.set('notas', notas)
      const r = await encontrarEEcadastrarContato(form)
      if (r.erro) { setErro(r.erro); return }
      if (r.aviso) setAviso(r.aviso)
      onEncontrado()
    })
  }

  return (
    <Dialog
      titulo="Encontrar e-mail por nome"
      descricao="Quando já se sabe quem procurar — só falta o e-mail. A Hunter.io tenta achar pelo padrão do domínio."
      onFechar={onFechar}
      podeFechar={!buscando}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} disabled={buscando} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-sm font-medium">Sobrenome
          <input value={sobrenome} onChange={(e) => setSobrenome(e.target.value)} disabled={buscando} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-sm font-medium sm:col-span-2">Domínio do veículo
          <input value={dominio} onChange={(e) => setDominio(e.target.value)} disabled={buscando} placeholder="oglobo.globo.com" className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-sm font-medium">Veículo <span className="font-normal text-muted-foreground">(opcional)</span>
          <input value={veiculo} onChange={(e) => setVeiculo(e.target.value)} disabled={buscando} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-sm font-medium">Cargo <span className="font-normal text-muted-foreground">(opcional)</span>
          <input value={cargo} onChange={(e) => setCargo(e.target.value)} disabled={buscando} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-sm font-medium">Telefone <span className="font-normal text-muted-foreground">(opcional)</span>
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} disabled={buscando} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="text-sm font-medium">Notas <span className="font-normal text-muted-foreground">(opcional)</span>
          <input value={notas} onChange={(e) => setNotas(e.target.value)} disabled={buscando} className={`mt-1 ${inputClass}`} />
        </label>
      </div>

      {erro && <p className="text-xs text-destructive">{erro}</p>}
      {aviso && <p className="text-xs text-amber-700 dark:text-amber-400">{aviso}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onFechar} disabled={buscando}>Cancelar</Button>
        <Button onClick={enviar} disabled={buscando || !nome.trim() || !sobrenome.trim() || !dominio.trim()}>
          {buscando ? <Loader2 className="size-4 animate-spin" /> : <UserSearch className="size-4" />}
          {buscando ? 'Procurando…' : 'Encontrar e cadastrar'}
        </Button>
      </div>
    </Dialog>
  )
}
