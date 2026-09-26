'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, Check, Download, History, Loader2, Pencil, Plus, Search, Send,
  ShieldCheck, Trash2, Upload, UserSearch, Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  adicionarContatosDaBusca, atualizarContato, buscarContatosPorDominio, criarContatoManual,
  encontrarEEcadastrarContato, excluirContato, excluirContatos,
  importarContatos, verificarEmailDoContato,
  type CandidatoDeContato, type ContatoDeImprensa,
} from '@/app/actions/imprensa'
import { comoBalde } from '@/lib/imprensa/email-status'
import { Dialog, inputClass, selectClass, podeReceber, quandoLegivel } from './comum'
import { DialogCampanha, PainelDeCampanhas, type CampanhaNaTela, type Composicao } from './campanhas'
import { LIMITE_SEM_LEITURA, naoLe } from '@/lib/imprensa/campanha'
import {
  comoEtiqueta, lerCsv, linhasParaContatos, LOTE_DE_IMPORTACAO, TETO_DE_IMPORTACAO, type ResultadoDaLeitura,
} from '@/lib/imprensa/importacao'

/** Quantas linhas a tabela desenha. Filtro e seleção valem para todas. */
const LINHAS_NA_TELA = 300



const FILTROS_DE_LEITURA = [
  { id: 'todos', rotulo: 'Toda leitura' },
  { id: 'naole', rotulo: `Não leem (${LIMITE_SEM_LEITURA}+ envios sem abrir)` },
  { id: 'engajados', rotulo: 'Engajados (abriram o último envio)' },
  { id: 'le', rotulo: 'Já abriram algo' },
  { id: 'nunca', rotulo: 'Nunca receberam' },
  { id: 'saiu', rotulo: 'Saíram da lista' },
] as const


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
 * Imprensa: o banco de contatos — jornalistas, veículos e qualquer contato
 * relevante — com disparo de campanhas e o histórico do que saiu.
 *
 * Três caminhos para um contato entrar aqui: digitado à mão, encontrado por
 * domínio (a Hunter devolve todo mundo que ela já viu naquele veículo) ou
 * encontrado por nome (quando já se sabe QUEM procurar, só falta o e-mail).
 * Filtra no cliente de propósito — mesmo espírito do Registro: o volume aqui
 * é de uma redação, não de uma agência.
 */
export function PainelDeImprensa({ contatos, campanhas, envioNoMes, hunterDisponivel, envioDisponivel, podeDisparar, ehAdmin }: {
  contatos: ContatoDeImprensa[]
  campanhas: CampanhaNaTela[]
  envioNoMes: { enviados: number; limite: number | null }
  hunterDisponivel: boolean
  envioDisponivel: boolean
  podeDisparar: boolean
  ehAdmin: boolean
}) {
  const router = useRouter()
  const [aba, setAba] = useState<'contatos' | 'campanhas'>('contatos')
  const [composicao, setComposicao] = useState<Composicao | null>(null)
  const [recado, setRecado] = useState('')

  return (
    <div className="flex flex-col gap-4">
      <div data-ajuda="imprensa.abas" className="flex gap-1 border-b border-border" role="tablist">
        {([['contatos', `Contatos (${contatos.length})`, Users], ['campanhas', `Campanhas (${campanhas.length})`, History]] as const).map(([id, rotulo, Icone]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={aba === id}
            onClick={() => setAba(id)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${aba === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <Icone className="size-4" />{rotulo}
          </button>
        ))}
      </div>
      {recado && <p className="text-xs text-emerald-700 dark:text-emerald-500">{recado}</p>}
      {aba === 'contatos'
        ? <Contatos contatos={contatos} hunterDisponivel={hunterDisponivel} envioDisponivel={envioDisponivel} podeDisparar={podeDisparar} ehAdmin={ehAdmin} abrirCampanha={(ids) => setComposicao({ ids })} />
        : <PainelDeCampanhas campanhas={campanhas} envioNoMes={envioNoMes} podeDisparar={podeDisparar} envioDisponivel={envioDisponivel} abrirCampanha={setComposicao} />}
      {composicao && (
        <DialogCampanha
          todos={contatos}
          inicial={composicao}
          onFechar={() => setComposicao(null)}
          onFeito={(texto, enviou) => {
            setComposicao(null)
            setRecado(texto)
            router.refresh()
            if (enviou) setAba('campanhas')
          }}
        />
      )}
    </div>
  )
}

function Contatos({ contatos, hunterDisponivel, envioDisponivel, podeDisparar, ehAdmin, abrirCampanha }: {
  contatos: ContatoDeImprensa[]
  hunterDisponivel: boolean
  envioDisponivel: boolean
  podeDisparar: boolean
  ehAdmin: boolean
  abrirCampanha: (ids: string[]) => void
}) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroLeitura, setFiltroLeitura] = useState<(typeof FILTROS_DE_LEITURA)[number]['id']>('todos')
  const [filtroLista, setFiltroLista] = useState('todas')
  const [dialogImportar, setDialogImportar] = useState(false)

  const listas = useMemo(() => {
    const contagem = new Map<string, number>()
    for (const c of contatos) for (const t of c.tags) contagem.set(t, (contagem.get(t) ?? 0) + 1)
    return [...contagem.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
  }, [contatos])
  const [dialogNovo, setDialogNovo] = useState<'fechado' | 'criar' | ContatoDeImprensa>('fechado')
  const [dialogBusca, setDialogBusca] = useState(false)
  const [dialogFinder, setDialogFinder] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [removendo, remover] = useTransition()
  const [recado, setRecado] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return contatos.filter((c) => {
      if (filtroStatus !== 'todos' && c.emailStatus !== filtroStatus) return false
      if (filtroLeitura === 'naole' && (c.descadastradoEm || !naoLe(c.enviosSemAbertura))) return false
      if (filtroLeitura === 'engajados' && (c.descadastradoEm || !c.totalAberturas || c.enviosSemAbertura > 0)) return false
      if (filtroLeitura === 'le' && !c.totalAberturas) return false
      if (filtroLista !== 'todas' && !c.tags.includes(filtroLista)) return false
      if (filtroLeitura === 'nunca' && c.totalEnvios) return false
      if (filtroLeitura === 'saiu' && !c.descadastradoEm) return false
      if (!termo) return true
      const alvo = `${c.nome} ${c.veiculo} ${c.cargo} ${c.email ?? ''} ${c.dominio} ${c.tags.join(' ')}`.toLowerCase()
      return alvo.includes(termo)
    })
  }, [contatos, busca, filtroStatus, filtroLeitura, filtroLista])

  // A seleção só vale para quem está na tela: filtrar de novo não pode deixar
  // gente escondida selecionada para um disparo.
  const visiveis = useMemo(() => new Set(filtrados.map((c) => c.id)), [filtrados])
  const escolhidos = useMemo(() => filtrados.filter((c) => selecionados.has(c.id)), [filtrados, selecionados])
  const todosMarcados = filtrados.length > 0 && escolhidos.length === filtrados.length

  function alternar(id: string) {
    setSelecionados((atual) => {
      const novo = new Set([...atual].filter((i) => visiveis.has(i)))
      if (novo.has(id)) novo.delete(id); else novo.add(id)
      return novo
    })
  }

  function alternarTodos() {
    setSelecionados(todosMarcados ? new Set() : new Set(filtrados.map((c) => c.id)))
  }

  function removerSelecionados() {
    if (!confirm(`Remover ${escolhidos.length} contato(s) do banco? Não dá para desfazer.`)) return
    setRecado(null)
    remover(async () => {
      const form = new FormData()
      form.set('ids', JSON.stringify(escolhidos.map((c) => c.id)))
      const r = await excluirContatos(form)
      if (r.erro) { setRecado({ tom: 'erro', texto: r.erro }); return }
      setRecado({ tom: 'ok', texto: `${r.removidos} contato(s) removido(s).` })
      setSelecionados(new Set())
      router.refresh()
    })
  }

  function baixarCsv() {
    const cabecalho = ['Nome', 'Veículo/organização', 'Cargo', 'E-mail', 'Situação', 'Confiança', 'Telefone', 'Tags', 'Notas', 'Envios', 'Aberturas', 'Envios seguidos sem abrir', 'Saiu da lista em']
    const corpo = filtrados.map((c) => [
      c.nome, c.veiculo, c.cargo, c.email ?? '', STATUS_INFO[c.emailStatus].rotulo,
      c.confianca !== null ? `${c.confianca}%` : '', c.telefone, c.tags.join(', '), c.notas,
      String(c.totalEnvios), String(c.totalAberturas), String(c.enviosSemAbertura),
      c.descadastradoEm ? quandoLegivel.format(new Date(c.descadastradoEm)) : '',
    ].map(celula).join(';'))
    // BOM na frente: sem ele o Excel em português abre o acento errado.
    const csv = `﻿${[cabecalho.map(celula).join(';'), ...corpo].join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `banco-de-contatos-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      {!hunterDisponivel && (
        <Card className="border-dashed p-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Busca automática desligada.</span> Um administrador cola a chave da
          Hunter.io em Configurações → Integrações para encontrar e verificar contatos. O cadastro manual continua
          funcionando normalmente.
        </Card>
      )}

      <div data-ajuda="imprensa.barra" className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, veículo, e-mail…"
            className={`w-full pl-9 ${inputClass}`}
          />
        </div>
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className={selectClass} aria-label="Situação do e-mail">
          <option value="todos">Toda situação</option>
          <option value="valido">Válido</option>
          <option value="arriscado">Arriscado</option>
          <option value="invalido">Inválido</option>
          <option value="nao_verificado">Não verificado</option>
        </select>
        <select value={filtroLeitura} onChange={(e) => setFiltroLeitura(e.target.value as typeof filtroLeitura)} className={selectClass} aria-label="Leitura">
          {FILTROS_DE_LEITURA.map((f) => <option key={f.id} value={f.id}>{f.rotulo}</option>)}
        </select>
        {listas.length > 0 && (
          <select value={filtroLista} onChange={(e) => setFiltroLista(e.target.value)} className={selectClass} aria-label="Lista">
            <option value="todas">Todas as listas</option>
            {listas.map(([t, n]) => <option key={t} value={t}>{t} ({n})</option>)}
          </select>
        )}
        {hunterDisponivel && (
          <>
            <Button variant="outline" onClick={() => setDialogBusca(true)}><Building2 className="size-4" />Buscar por domínio</Button>
            <Button variant="outline" onClick={() => setDialogFinder(true)}><UserSearch className="size-4" />Encontrar e-mail</Button>
          </>
        )}
        <Button data-ajuda="imprensa.novo-contato" variant="outline" onClick={() => setDialogNovo('criar')}><Plus className="size-4" />Novo contato</Button>
        <Button variant="outline" onClick={() => setDialogImportar(true)}><Upload className="size-4" />Importar planilha</Button>
        <Button variant="outline" onClick={baixarCsv} disabled={!filtrados.length}><Download className="size-4" />Baixar CSV</Button>
      </div>

      {escolhidos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">{escolhidos.length} selecionado(s)</span>
          <span className="text-xs text-muted-foreground">· {escolhidos.filter(podeReceber).length} podem receber</span>
          <span className="flex-1" />
          {podeDisparar && (
            <Button size="sm" onClick={() => abrirCampanha(escolhidos.filter(podeReceber).map((c) => c.id))} disabled={!envioDisponivel || !escolhidos.some(podeReceber)}
              title={envioDisponivel ? undefined : 'Envio de e-mail não configurado (RESEND_API_KEY)'}>
              <Send className="size-4" />Enviar campanha
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={removerSelecionados} disabled={removendo} className="text-destructive">
            {removendo ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}Remover
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelecionados(new Set())}>Limpar</Button>
        </div>
      )}
      {recado && <p className={`text-xs ${recado.tom === 'erro' ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-500'}`}>{recado.texto}</p>}

      <p className="text-xs text-muted-foreground">
        {filtrados.length === 0
          ? contatos.length === 0
            ? 'Nenhum contato ainda. Importe uma planilha, busque pela Hunter.io ou cadastre à mão.'
            : 'Nenhum contato no filtro atual.'
          : <><span className="font-medium text-foreground">{filtrados.length}</span> {filtrados.length === 1 ? 'contato' : 'contatos'}</>}
      </p>

      {filtrados.length > 0 && (
        <Card data-ajuda="imprensa.tabela" className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="w-10 px-4 py-2.5">
                    <input type="checkbox" checked={todosMarcados} onChange={alternarTodos} aria-label="Selecionar todos da lista filtrada" className="size-4" />
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Veículo / organização</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">E-mail</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Leitura</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Telefone</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(0, LINHAS_NA_TELA).map((c) => (
                  <LinhaDoContato
                    key={c.id}
                    contato={c}
                    hunterDisponivel={hunterDisponivel}
                    selecionado={selecionados.has(c.id)}
                    onSelecionar={() => alternar(c.id)}
                    onEditar={() => setDialogNovo(c)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {filtrados.length > LINHAS_NA_TELA && (
        <p className="text-xs text-muted-foreground">
          A tabela mostra {LINHAS_NA_TELA} de {filtrados.length}. Filtros, &ldquo;selecionar todos&rdquo;, envio e CSV valem para os {filtrados.length}.
        </p>
      )}

      {dialogImportar && (
        <DialogImportar
          listasExistentes={listas.map(([t]) => t)}
          onFechar={() => setDialogImportar(false)}
          onImportado={(etiqueta) => { router.refresh(); if (etiqueta) setFiltroLista(etiqueta) }}
        />
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
      {!ehAdmin && contatos.length > 0 && (
        <p className="text-[11px] text-muted-foreground">Remover contato é permitido a administradores e a quem cadastrou.</p>
      )}
    </div>
  )
}

function Leitura({ contato }: { contato: ContatoDeImprensa }) {
  if (contato.descadastradoEm) {
    return <span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">Saiu da lista</span>
  }
  if (!contato.totalEnvios) return <span className="text-xs text-muted-foreground">nunca recebeu</span>
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs">Abriu {contato.totalAberturas} de {contato.totalEnvios}</span>
      {naoLe(contato.enviosSemAbertura) && (
        <span className="inline-flex w-fit rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
          {contato.enviosSemAbertura} seguidos sem abrir
        </span>
      )}
    </div>
  )
}

function LinhaDoContato({ contato, hunterDisponivel, selecionado, onSelecionar, onEditar }: {
  contato: ContatoDeImprensa
  hunterDisponivel: boolean
  selecionado: boolean
  onSelecionar: () => void
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
    <tr className={`border-b border-border align-top last:border-0 hover:bg-muted/30 ${selecionado ? 'bg-primary/5' : ''}`}>
      <td className="px-4 py-3">
        <input type="checkbox" checked={selecionado} onChange={onSelecionar} aria-label={`Selecionar ${contato.nome || contato.email || 'contato'}`} className="mt-0.5 size-4" />
      </td>
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
      <td className="px-4 py-3"><Leitura contato={contato} /></td>
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
        <label className="text-sm font-medium">Veículo / organização
          <input value={veiculo} onChange={(e) => setVeiculo(e.target.value)} disabled={salvando} placeholder="O Globo, Prefeitura, empresa parceira…" className={`mt-1 ${inputClass}`} />
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
        <label className="text-sm font-medium">Domínio <span className="font-normal text-muted-foreground">(opcional)</span>
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

/**
 * Importar planilha (CSV). A leitura acontece aqui no navegador: a pessoa vê
 * o que foi entendido — quantos e-mails, quais colunas — antes de gravar
 * qualquer coisa. Grava em lotes de mil.
 */
function DialogImportar({ listasExistentes, onFechar, onImportado }: {
  listasExistentes: string[]
  onFechar: () => void
  onImportado: (etiqueta: string) => void
}) {
  const [arquivo, setArquivo] = useState('')
  const [leitura, setLeitura] = useState<ResultadoDaLeitura | null>(null)
  const [etiqueta, setEtiqueta] = useState('')
  const [erro, setErro] = useState('')
  const [progresso, setProgresso] = useState('')
  const [resultado, setResultado] = useState('')
  const [gravando, gravar] = useTransition()

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    setErro(''); setResultado(''); setLeitura(null)
    const f = e.target.files?.[0]
    if (!f) return
    if (!/\.(csv|txt|tsv)$/i.test(f.name)) {
      setErro('Envie um arquivo .csv. No Excel ou no Google Planilhas: Arquivo → Salvar como / Fazer download → CSV.')
      return
    }
    let texto = await f.text()
    // Planilha salva pelo Excel em português costuma vir em Latin-1: os
    // acentos chegam como "�". Relê no encoding certo.
    if (texto.includes('\uFFFD')) texto = new TextDecoder('windows-1252').decode(await f.arrayBuffer())
    const r = linhasParaContatos(lerCsv(texto))
    if (!r.contatos.length) { setErro('Não encontrei nenhum e-mail nesse arquivo.'); return }
    if (r.contatos.length > TETO_DE_IMPORTACAO) { setErro(`O arquivo tem ${r.contatos.length} e-mails; o máximo por importação é ${TETO_DE_IMPORTACAO}. Divida em partes.`); return }
    setArquivo(f.name)
    setEtiqueta((atual) => atual || comoEtiqueta(f.name.replace(/\.[^.]+$/, '')))
    setLeitura(r)
  }

  function importar() {
    if (!leitura) return
    setErro(''); setResultado('')
    const lista = comoEtiqueta(etiqueta)
    gravar(async () => {
      let inseridos = 0, atualizados = 0, recusados = 0
      const total = leitura.contatos.length
      for (let i = 0; i < total; i += LOTE_DE_IMPORTACAO) {
        setProgresso(`Gravando ${Math.min(i + LOTE_DE_IMPORTACAO, total)} de ${total}…`)
        const form = new FormData()
        form.set('linhas', JSON.stringify(leitura.contatos.slice(i, i + LOTE_DE_IMPORTACAO)))
        form.set('etiqueta', lista)
        const r = await importarContatos(form)
        if (r.erro) {
          setErro(i ? `${r.erro} (os ${i} primeiros já foram gravados)` : r.erro)
          setProgresso('')
          if (i) onImportado(lista)
          return
        }
        inseridos += r.inseridos ?? 0
        atualizados += r.atualizados ?? 0
        recusados += r.recusados ?? 0
      }
      setProgresso('')
      setResultado(`${inseridos} novo(s) no banco. ${atualizados} já existiam${lista ? ` e ganharam a lista "${lista}"` : ''}.${recusados ? ` ${recusados} recusados por e-mail inválido.` : ''}`)
      setLeitura(null)
      onImportado(lista)
    })
  }

  const COLUNAS: [keyof ResultadoDaLeitura['mapa'], string][] = [['email', 'E-mail'], ['nome', 'Nome'], ['veiculo', 'Organização'], ['cargo', 'Cargo'], ['telefone', 'Telefone']]

  return (
    <Dialog
      titulo="Importar planilha"
      descricao="CSV de qualquer origem — Excel, Google Planilhas, Gmail, Outlook, LinkedIn. E-mail repetido não duplica."
      largura="max-w-2xl"
      onFechar={onFechar}
      podeFechar={!gravando}
    >
      <label className="text-sm font-medium">Arquivo .csv
        <input type="file" accept=".csv,.txt,.tsv,text/csv" onChange={escolher} disabled={gravando} className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm" />
      </label>

      {leitura && (
        <>
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <p><strong>{leitura.contatos.length}</strong> e-mail(s) em <span className="break-all">{arquivo}</span>.
              {leitura.repetidosNoArquivo > 0 && <span className="text-muted-foreground"> {leitura.repetidosNoArquivo} repetido(s) no próprio arquivo.</span>}
              {leitura.semEmail > 0 && <span className="text-muted-foreground"> {leitura.semEmail} linha(s) sem e-mail ignorada(s).</span>}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Colunas entendidas: {COLUNAS.map(([k, rotulo]) => `${rotulo} → ${leitura.mapa[k] === -1 ? '—' : `"${leitura.cabecalho[leitura.mapa[k]] ?? ''}"`}`).join(' · ')}
            </p>
          </div>

          <div className="max-h-48 overflow-y-auto rounded-lg border border-border text-xs">
            {leitura.contatos.slice(0, 8).map((c) => (
              <p key={c.email} className="truncate border-b border-border px-3 py-1.5 last:border-0">
                <span className="font-medium">{c.nome || '(sem nome)'}</span> · {c.email}{c.veiculo ? ` · ${c.veiculo}` : ''}
              </p>
            ))}
            {leitura.contatos.length > 8 && <p className="px-3 py-1.5 text-muted-foreground">… e mais {leitura.contatos.length - 8}</p>}
          </div>

          <label className="text-sm font-medium">Nome da lista <span className="font-normal text-muted-foreground">(vira etiqueta: serve para segmentar por origem)</span>
            <input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} disabled={gravando} list="listas-existentes" placeholder="ex.: jornalistas-saude-rj" className={`mt-1 ${inputClass}`} />
            <datalist id="listas-existentes">{listasExistentes.map((t) => <option key={t} value={t} />)}</datalist>
          </label>

          <p className="text-xs text-muted-foreground">
            Antes do primeiro envio para uma lista comprada ou raspada, vale verificar os e-mails: endereço morto vira devolução, e devolução derruba a entrega de tudo o que sai do domínio — inclusive a newsletter.
          </p>
        </>
      )}

      {erro && <p className="text-xs text-destructive">{erro}</p>}
      {progresso && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />{progresso}</p>}
      {resultado && <p className="text-xs text-emerald-700 dark:text-emerald-500">{resultado}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onFechar} disabled={gravando}>{resultado ? 'Fechar' : 'Cancelar'}</Button>
        {leitura && (
          <Button onClick={importar} disabled={gravando}>
            {gravando ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Importar {leitura.contatos.length}
          </Button>
        )}
      </div>
    </Dialog>
  )
}
