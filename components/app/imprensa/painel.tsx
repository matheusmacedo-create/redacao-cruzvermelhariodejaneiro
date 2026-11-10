'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Building2, Check, ChevronRight, Download, History, ListChecks, ListPlus, Loader2, Newspaper, Pencil, Plus, Save, Search, Send,
  ShieldCheck, SlidersHorizontal, Trash2, Upload, UserSearch, Users, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  adicionarContatosDaBusca, buscarContatosPorDominio,
  encontrarEEcadastrarContato, excluirContato, excluirContatos,
  importarContatos, verificarEmailDoContato,
  type CandidatoDeContato, type ContatoDeImprensa,
} from '@/app/actions/imprensa'
import { mudarContatosDaLista } from '@/app/actions/imprensa-listas'
import { comoBalde } from '@/lib/imprensa/email-status'
import { campoClass, Dialog, inputClass, podeReceber, quandoLegivel } from './comum'
import { DialogCampanha, PainelDeCampanhas, type CampanhaNaTela, type Composicao } from './campanhas'
import { DialogContato } from './contato-form'
import { DialogLista, DialogPorNaLista, PainelDeListas, type OpcoesDeCriterio } from './listas'
import { BadgeDeStatus, Leitura, Marca, SeletorComOutro, STATUS_INFO } from './pecas'
import { PainelDeVeiculos } from './veiculos'
import { LIMITE_SEM_LEITURA, naoLe } from '@/lib/imprensa/campanha'
import {
  comoEtiqueta, lerCsv, linhasParaContatos, LOTE_DE_IMPORTACAO, TETO_DE_IMPORTACAO, type ResultadoDaLeitura,
} from '@/lib/imprensa/importacao'
import {
  A_CLASSIFICAR, atendeAoCriterio, contatosDaLista, criterioEstaVazio, ordenarListas, pracaDoContato,
  type CriterioDaLista, type ListaDeImprensa,
} from '@/lib/imprensa/listas'
import {
  chave, comMaiuscula, ORIGENS_SUGERIDAS, RELEVANCIAS, rotuloDaRelevancia, rotuloDoCanal, rotuloDoTipoDeContato,
  rotuloDoTipoDeVeiculo, TIPOS_DE_CONTATO, TIPOS_DE_VEICULO, type TipoDeContato, type VeiculoDeImprensa,
} from '@/lib/imprensa/vocabulario'

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

/** Os filtros da aba Contatos. Moram no painel: as abas Veículos e Listas abrem a de Contatos já filtrada. */
type FiltrosDeContatos = {
  status: string
  leitura: (typeof FILTROS_DE_LEITURA)[number]['id']
  lista: string
  veiculo: string
  editoria: string
  praca: string
  tipoDeVeiculo: string
  relevancia: string
  tipoDeContato: string
  etiqueta: string
}

const SEM_FILTROS: FiltrosDeContatos = {
  status: 'todos', leitura: 'todos', lista: '', veiculo: '', editoria: '', praca: '', tipoDeVeiculo: '', relevancia: '', tipoDeContato: '', etiqueta: '',
}

/** A parte dos filtros que pode virar lista salva: o que o contato cobre e onde, e não o estado do e-mail. */
function criterioDosFiltros(f: FiltrosDeContatos): CriterioDaLista {
  const um = (valor: string) => (valor ? [valor] : [])
  return {
    editorias: um(f.editoria), pracas: um(f.praca), tiposDeVeiculo: um(f.tipoDeVeiculo),
    tiposDeContato: um(f.tipoDeContato), etiquetas: um(f.etiqueta), relevancias: um(f.relevancia),
  }
}

/** Uma célula de CSV: aspas dobradas e o campo inteiro entre aspas. */
function celula(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`
}

type Aba = 'contatos' | 'veiculos' | 'listas' | 'campanhas'

/**
 * Imprensa: o banco de contatos (jornalistas e qualquer contato relevante), o
 * cadastro dos veículos, as listas salvas e o disparo de campanhas, com o
 * histórico do que saiu.
 *
 * Três caminhos para um contato entrar aqui: digitado à mão, encontrado por
 * domínio (a Hunter devolve todo mundo que ela já viu naquele veículo) ou
 * encontrado por nome (quando já se sabe QUEM procurar, só falta o e-mail).
 * Filtra no cliente de propósito — mesmo espírito do Registro: o volume aqui
 * é de uma redação, não de uma agência.
 */
export function PainelDeImprensa({ contatos, veiculos, listas, membros, campanhas, envioNoMes, hunterDisponivel, envioDisponivel, podeDisparar, podeOrganizar, usuarioId, ehAdmin }: {
  contatos: ContatoDeImprensa[]
  veiculos: VeiculoDeImprensa[]
  listas: ListaDeImprensa[]
  /** Quem está em cada lista fixa: { idDaLista: [idDoContato, …] }. */
  membros: Record<string, string[]>
  campanhas: CampanhaNaTela[]
  envioNoMes: { enviados: number; limite: number | null }
  hunterDisponivel: boolean
  envioDisponivel: boolean
  podeDisparar: boolean
  podeOrganizar: boolean
  usuarioId: string
  ehAdmin: boolean
}) {
  const router = useRouter()
  const [aba, setAba] = useState<Aba>('contatos')
  const [filtros, setFiltros] = useState<FiltrosDeContatos>(SEM_FILTROS)
  const [composicao, setComposicao] = useState<Composicao | null>(null)
  const [recado, setRecado] = useState('')

  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos])
  const listasEmOrdem = useMemo(() => ordenarListas(listas), [listas])
  const contatosPorLista = useMemo(() => {
    const membrosPorLista = new Map(Object.entries(membros).map(([id, ids]) => [id, new Set(ids)]))
    return new Map(listasEmOrdem.map((l) => [l.id, contatosDaLista(l, contatos, veiculosPorId, membrosPorLista)]))
  }, [listasEmOrdem, contatos, veiculosPorId, membros])
  const contagemPorVeiculo = useMemo(() => {
    const contagem = new Map<string, number>()
    for (const c of contatos) if (c.veiculoId) contagem.set(c.veiculoId, (contagem.get(c.veiculoId) ?? 0) + 1)
    return contagem
  }, [contatos])
  // O que o banco já usa: alimenta os filtros, os formulários e o editor de lista.
  const emUso: OpcoesDeCriterio = useMemo(() => {
    const editorias = new Set<string>()
    const pracas = new Set<string>()
    const etiquetas = new Set<string>()
    for (const c of contatos) {
      for (const e of c.editorias) editorias.add(e)
      for (const t of c.tags) etiquetas.add(t)
      const praca = pracaDoContato(c, c.veiculoId ? veiculosPorId.get(c.veiculoId) : undefined)
      if (praca) pracas.add(praca)
    }
    for (const v of veiculos) if (v.praca) pracas.add(v.praca)
    const emOrdem = (itens: Set<string>) => [...itens].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return { editorias: emOrdem(editorias), pracas: emOrdem(pracas), etiquetas: emOrdem(etiquetas) }
  }, [contatos, veiculos, veiculosPorId])

  const contar = (criterio: CriterioDaLista) =>
    contatos.filter((c) => atendeAoCriterio(c, c.veiculoId ? veiculosPorId.get(c.veiculoId) : undefined, criterio)).length

  const ABAS: [Aba, string, number, typeof Users][] = [
    ['contatos', 'Contatos', contatos.length, Users],
    ['veiculos', 'Veículos', veiculos.length, Newspaper],
    ['listas', 'Listas', listas.length, ListChecks],
    ['campanhas', 'Campanhas', campanhas.length, History],
  ]

  return (
    <div className="flex flex-col gap-4">
      <div data-ajuda="imprensa.abas" className="flex border-b border-border" role="tablist">
        {ABAS.map(([id, rotulo, total, Icone]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={aba === id}
            onClick={() => setAba(id)}
            className={`-mb-px flex min-h-11 flex-1 items-center justify-center gap-1.5 border-b-2 px-1 text-sm font-medium transition-colors sm:flex-none sm:px-3 ${aba === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <Icone className="hidden size-4 sm:block" />{rotulo}<span className="hidden sm:inline">({total})</span>
          </button>
        ))}
      </div>
      {recado && <p className="text-sm text-emerald-700">{recado}</p>}
      {aba === 'contatos' && (
        <Contatos
          contatos={contatos}
          veiculos={veiculos}
          veiculosPorId={veiculosPorId}
          listas={listasEmOrdem}
          contatosPorLista={contatosPorLista}
          emUso={emUso}
          contar={contar}
          filtros={filtros}
          setFiltros={setFiltros}
          hunterDisponivel={hunterDisponivel}
          envioDisponivel={envioDisponivel}
          podeDisparar={podeDisparar}
          ehAdmin={ehAdmin}
          abrirCampanha={(ids) => setComposicao({ ids })}
        />
      )}
      {aba === 'veiculos' && (
        <PainelDeVeiculos
          veiculos={veiculos}
          contagem={contagemPorVeiculo}
          pracasEmUso={emUso.pracas}
          podeOrganizar={podeOrganizar}
          onVerContatos={(veiculo) => { setFiltros({ ...SEM_FILTROS, veiculo }); setAba('contatos') }}
        />
      )}
      {aba === 'listas' && (
        <PainelDeListas
          listas={listasEmOrdem}
          contatosPorLista={contatosPorLista}
          opcoes={emUso}
          contar={contar}
          podeDisparar={podeDisparar}
          envioDisponivel={envioDisponivel}
          podeOrganizar={podeOrganizar}
          usuarioId={usuarioId}
          onVerContatos={(lista) => { setFiltros({ ...SEM_FILTROS, lista }); setAba('contatos') }}
          onEnviar={(listaId) => setComposicao({ listaId })}
        />
      )}
      {aba === 'campanhas' && (
        <PainelDeCampanhas campanhas={campanhas} envioNoMes={envioNoMes} podeDisparar={podeDisparar} envioDisponivel={envioDisponivel} abrirCampanha={setComposicao} />
      )}
      {composicao && (
        <DialogCampanha
          todos={contatos}
          listas={listasEmOrdem}
          contatosPorLista={contatosPorLista}
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

function Contatos({ contatos, veiculos, veiculosPorId, listas, contatosPorLista, emUso, contar, filtros, setFiltros, hunterDisponivel, envioDisponivel, podeDisparar, ehAdmin, abrirCampanha }: {
  contatos: ContatoDeImprensa[]
  veiculos: VeiculoDeImprensa[]
  veiculosPorId: ReadonlyMap<string, VeiculoDeImprensa>
  listas: ListaDeImprensa[]
  contatosPorLista: ReadonlyMap<string, ContatoDeImprensa[]>
  emUso: OpcoesDeCriterio
  contar: (criterio: CriterioDaLista) => number
  filtros: FiltrosDeContatos
  setFiltros: (filtros: FiltrosDeContatos) => void
  hunterDisponivel: boolean
  envioDisponivel: boolean
  podeDisparar: boolean
  ehAdmin: boolean
  abrirCampanha: (ids: string[]) => void
}) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [painelDeFiltros, setPainelDeFiltros] = useState(false)
  const [maisAcoes, setMaisAcoes] = useState(false)
  const [dialogImportar, setDialogImportar] = useState(false)
  const [dialogNovo, setDialogNovo] = useState<'fechado' | 'criar' | ContatoDeImprensa>('fechado')
  const [dialogBusca, setDialogBusca] = useState(false)
  const [dialogFinder, setDialogFinder] = useState(false)
  const [dialogLista, setDialogLista] = useState<'fechado' | 'salvar-filtro' | 'por-na-lista'>('fechado')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [ocupado, rodar] = useTransition()
  const [recado, setRecado] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)

  const mudar = (parte: Partial<FiltrosDeContatos>) => setFiltros({ ...filtros, ...parte })
  const criterio = useMemo(() => criterioDosFiltros(filtros), [filtros])
  const listaAtual = listas.find((l) => l.id === filtros.lista)
  const veiculoAtual = filtros.veiculo ? veiculosPorId.get(filtros.veiculo) : undefined

  const filtrados = useMemo(() => {
    const termo = chave(busca)
    const daLista = filtros.lista ? new Set((contatosPorLista.get(filtros.lista) ?? []).map((c) => c.id)) : null
    return contatos.filter((c) => {
      if (filtros.status !== 'todos' && c.emailStatus !== filtros.status) return false
      if (filtros.leitura === 'naole' && (c.descadastradoEm || !naoLe(c.enviosSemAbertura))) return false
      if (filtros.leitura === 'engajados' && (c.descadastradoEm || !c.totalAberturas || c.enviosSemAbertura > 0)) return false
      if (filtros.leitura === 'le' && !c.totalAberturas) return false
      if (filtros.leitura === 'nunca' && c.totalEnvios) return false
      if (filtros.leitura === 'saiu' && !c.descadastradoEm) return false
      if (filtros.veiculo && c.veiculoId !== filtros.veiculo) return false
      if (daLista && !daLista.has(c.id)) return false
      const veiculo = c.veiculoId ? veiculosPorId.get(c.veiculoId) : undefined
      if (!atendeAoCriterio(c, veiculo, criterio)) return false
      if (!termo) return true
      const alvo = `${c.nome} ${c.veiculo} ${c.cargo} ${c.email ?? ''} ${c.dominio} ${c.tags.join(' ')} ${c.editorias.join(' ')} ${pracaDoContato(c, veiculo)}`
      return chave(alvo).includes(termo)
    })
  }, [contatos, busca, filtros, criterio, contatosPorLista, veiculosPorId])

  // A seleção só vale para quem está na tela: filtrar de novo não pode deixar
  // gente escondida selecionada para um disparo.
  const visiveis = useMemo(() => new Set(filtrados.map((c) => c.id)), [filtrados])
  const escolhidos = useMemo(() => filtrados.filter((c) => selecionados.has(c.id)), [filtrados, selecionados])
  const todosMarcados = filtrados.length > 0 && escolhidos.length === filtrados.length

  // Os filtros ligados, um a um, para a pessoa ver o que está valendo e tirar com um toque.
  const ligados: { rotulo: string; tirar: Partial<FiltrosDeContatos> }[] = []
  if (filtros.lista) ligados.push({ rotulo: `Lista: ${listaAtual?.nome ?? 'apagada'}`, tirar: { lista: '' } })
  if (filtros.veiculo) ligados.push({ rotulo: `Veículo: ${veiculoAtual?.nome ?? 'apagado'}`, tirar: { veiculo: '' } })
  if (filtros.editoria) ligados.push({ rotulo: `Editoria: ${comMaiuscula(filtros.editoria)}`, tirar: { editoria: '' } })
  if (filtros.praca) ligados.push({ rotulo: `Praça: ${filtros.praca}`, tirar: { praca: '' } })
  if (filtros.tipoDeVeiculo) ligados.push({ rotulo: `Tipo de veículo: ${filtros.tipoDeVeiculo === A_CLASSIFICAR ? 'a classificar' : rotuloDoTipoDeVeiculo(filtros.tipoDeVeiculo)}`, tirar: { tipoDeVeiculo: '' } })
  if (filtros.relevancia) ligados.push({ rotulo: `Relevância: ${rotuloDaRelevancia(filtros.relevancia)}`, tirar: { relevancia: '' } })
  if (filtros.tipoDeContato) ligados.push({ rotulo: `Tipo de contato: ${rotuloDoTipoDeContato(filtros.tipoDeContato)}`, tirar: { tipoDeContato: '' } })
  if (filtros.etiqueta) ligados.push({ rotulo: `Etiqueta: ${filtros.etiqueta}`, tirar: { etiqueta: '' } })
  if (filtros.status !== 'todos') ligados.push({ rotulo: `E-mail: ${STATUS_INFO[filtros.status as ContatoDeImprensa['emailStatus']]?.rotulo ?? filtros.status}`, tirar: { status: 'todos' } })
  if (filtros.leitura !== 'todos') ligados.push({ rotulo: FILTROS_DE_LEITURA.find((f) => f.id === filtros.leitura)?.rotulo ?? 'Leitura', tirar: { leitura: 'todos' } })

  // O que está ligado na tela e não cabe numa lista salva: "Salvar filtro como lista" avisa.
  const foraDaLista: string[] = []
  if (busca.trim()) foraDaLista.push('a busca')
  if (filtros.lista) foraDaLista.push('o filtro “Lista”')
  if (filtros.veiculo) foraDaLista.push('o veículo escolhido')
  if (filtros.status !== 'todos') foraDaLista.push('a situação do e-mail')
  if (filtros.leitura !== 'todos') foraDaLista.push('a leitura')

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
    rodar(async () => {
      const form = new FormData()
      form.set('ids', JSON.stringify(escolhidos.map((c) => c.id)))
      const r = await excluirContatos(form)
      if (r.erro) { setRecado({ tom: 'erro', texto: r.erro }); return }
      setRecado({ tom: 'ok', texto: `${r.removidos} contato(s) removido(s).` })
      setSelecionados(new Set())
      router.refresh()
    })
  }

  function tirarDaLista() {
    if (!listaAtual) return
    if (!confirm(`Tirar ${escolhidos.length} contato(s) da lista “${listaAtual.nome}”? Eles continuam no banco.`)) return
    setRecado(null)
    rodar(async () => {
      const form = new FormData()
      form.set('listaId', listaAtual.id)
      form.set('acao', 'tirar')
      form.set('ids', JSON.stringify(escolhidos.map((c) => c.id)))
      const r = await mudarContatosDaLista(form)
      if (r.erro) { setRecado({ tom: 'erro', texto: r.erro }); return }
      setRecado({ tom: 'ok', texto: `${r.quantos} contato(s) fora da lista “${listaAtual.nome}”.` })
      setSelecionados(new Set())
      router.refresh()
    })
  }

  function baixarCsv() {
    const cabecalho = [
      'Nome', 'Veículo/organização', 'Tipo de veículo', 'Cargo', 'E-mail', 'Situação', 'Confiança', 'Telefone', 'WhatsApp', 'Canal preferido',
      'Editorias', 'Praça', 'Tipo de contato', 'Etiquetas', 'Origem do dado', 'Notas', 'Envios', 'Aberturas', 'Envios seguidos sem abrir', 'Saiu da lista em', 'Devolveu em',
    ]
    const corpo = filtrados.map((c) => {
      const veiculo = c.veiculoId ? veiculosPorId.get(c.veiculoId) : undefined
      return [
        c.nome, c.veiculo, veiculo?.tipo ? rotuloDoTipoDeVeiculo(veiculo.tipo) : '', c.cargo, c.email ?? '', STATUS_INFO[c.emailStatus].rotulo,
        c.confianca !== null ? `${c.confianca}%` : '', c.telefone, c.whatsapp, rotuloDoCanal(c.canalPreferido),
        c.editorias.join(', '), pracaDoContato(c, veiculo), rotuloDoTipoDeContato(c.tipoDeContato), c.tags.join(', '), c.origemDoDado, c.notas,
        String(c.totalEnvios), String(c.totalAberturas), String(c.enviosSemAbertura),
        c.descadastradoEm ? quandoLegivel.format(new Date(c.descadastradoEm)) : '',
        c.devolvidoEm ? quandoLegivel.format(new Date(c.devolvidoEm)) : '',
      ].map(celula).join(';')
    })
    // BOM na frente: sem ele o Excel em português abre o acento errado.
    const csv = `﻿${[cabecalho.map(celula).join(';'), ...corpo].join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `banco-de-contatos-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const rotuloDoFiltro = 'block text-xs font-medium text-muted-foreground'

  return (
    <div className="flex flex-col gap-4">
      {!hunterDisponivel && (
        <Card className="border-dashed p-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Busca automática desligada.</span> Um administrador cola a chave da
          Hunter.io em Configurações → Integrações para encontrar e verificar contatos. O cadastro manual continua
          funcionando normalmente.
        </Card>
      )}

      <div data-ajuda="imprensa.barra" className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, veículo, e-mail…"
              aria-label="Buscar contato"
              className={`pl-9 ${campoClass}`}
            />
          </div>
          <Button variant="outline" onClick={() => setPainelDeFiltros((aberto) => !aberto)} aria-expanded={painelDeFiltros} className="min-h-11 shrink-0 px-3">
            <SlidersHorizontal className="size-4" />Filtros{ligados.length ? ` (${ligados.length})` : ''}
          </Button>
        </div>

        {painelDeFiltros && (
          <Card className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
            {listas.length > 0 && (
              <label className={rotuloDoFiltro}>Lista
                <select value={filtros.lista} onChange={(e) => mudar({ lista: e.target.value })} className={`mt-1 ${campoClass}`}>
                  <option value="">Todas</option>
                  {listas.map((l) => <option key={l.id} value={l.id}>{l.plantao ? 'Plantão: ' : ''}{l.nome}</option>)}
                </select>
              </label>
            )}
            {emUso.editorias.length > 0 && (
              <label className={rotuloDoFiltro}>Editoria
                <select value={filtros.editoria} onChange={(e) => mudar({ editoria: e.target.value })} className={`mt-1 ${campoClass}`}>
                  <option value="">Todas</option>
                  {emUso.editorias.map((e) => <option key={e} value={e}>{comMaiuscula(e)}</option>)}
                </select>
              </label>
            )}
            {emUso.pracas.length > 0 && (
              <label className={rotuloDoFiltro}>Praça
                <select value={filtros.praca} onChange={(e) => mudar({ praca: e.target.value })} className={`mt-1 ${campoClass}`}>
                  <option value="">Todas</option>
                  {emUso.pracas.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            )}
            <label className={rotuloDoFiltro}>Tipo de veículo
              <select value={filtros.tipoDeVeiculo} onChange={(e) => mudar({ tipoDeVeiculo: e.target.value })} className={`mt-1 ${campoClass}`}>
                <option value="">Todos</option>
                {TIPOS_DE_VEICULO.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
                <option value={A_CLASSIFICAR}>A classificar</option>
              </select>
            </label>
            <label className={rotuloDoFiltro}>Relevância do veículo
              <select value={filtros.relevancia} onChange={(e) => mudar({ relevancia: e.target.value })} className={`mt-1 ${campoClass}`}>
                <option value="">Todas</option>
                {RELEVANCIAS.map((r) => <option key={r.id} value={r.id}>{r.rotulo}</option>)}
              </select>
            </label>
            <label className={rotuloDoFiltro}>Tipo de contato
              <select value={filtros.tipoDeContato} onChange={(e) => mudar({ tipoDeContato: e.target.value })} className={`mt-1 ${campoClass}`}>
                <option value="">Todos</option>
                {TIPOS_DE_CONTATO.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
              </select>
            </label>
            {emUso.etiquetas.length > 0 && (
              <label className={rotuloDoFiltro}>Etiqueta
                <select value={filtros.etiqueta} onChange={(e) => mudar({ etiqueta: e.target.value })} className={`mt-1 ${campoClass}`}>
                  <option value="">Todas</option>
                  {emUso.etiquetas.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            )}
            <label className={rotuloDoFiltro}>Situação do e-mail
              <select value={filtros.status} onChange={(e) => mudar({ status: e.target.value })} className={`mt-1 ${campoClass}`}>
                <option value="todos">Toda situação</option>
                <option value="valido">Válido</option>
                <option value="arriscado">Arriscado</option>
                <option value="invalido">Inválido</option>
                <option value="nao_verificado">Não verificado</option>
              </select>
            </label>
            <label className={rotuloDoFiltro}>Leitura
              <select value={filtros.leitura} onChange={(e) => mudar({ leitura: e.target.value as FiltrosDeContatos['leitura'] })} className={`mt-1 ${campoClass}`}>
                {FILTROS_DE_LEITURA.map((f) => <option key={f.id} value={f.id}>{f.rotulo}</option>)}
              </select>
            </label>
          </Card>
        )}

        <div className="flex flex-wrap gap-2">
          <Button data-ajuda="imprensa.novo-contato" onClick={() => setDialogNovo('criar')} className="min-h-11 px-4"><Plus className="size-4" />Novo contato</Button>
          {/* No celular, o que se usa menos fica atrás de "Mais opções": a lista de contatos sobe. */}
          <Button variant="outline" onClick={() => setMaisAcoes((aberto) => !aberto)} aria-expanded={maisAcoes} className="min-h-11 px-3 sm:hidden">Mais opções</Button>
          <div className={`${maisAcoes ? 'flex' : 'hidden'} w-full flex-wrap gap-2 sm:flex sm:w-auto`}>
            <Button variant="outline" onClick={() => setDialogImportar(true)} className="min-h-11 px-3"><Upload className="size-4" />Importar planilha</Button>
            {hunterDisponivel && (
              <>
                <Button variant="outline" onClick={() => setDialogBusca(true)} className="min-h-11 px-3"><Building2 className="size-4" />Buscar por domínio</Button>
                <Button variant="outline" onClick={() => setDialogFinder(true)} className="min-h-11 px-3"><UserSearch className="size-4" />Encontrar e-mail</Button>
              </>
            )}
            <Button variant="outline" onClick={baixarCsv} disabled={!filtrados.length} className="min-h-11 px-3"><Download className="size-4" />Baixar CSV</Button>
          </div>
        </div>
      </div>

      {escolhidos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">{escolhidos.length} selecionado(s)</span>
          <span className="text-xs text-muted-foreground">· {escolhidos.filter(podeReceber).length} podem receber</span>
          <span className="hidden flex-1 sm:block" />
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {podeDisparar && (
              <Button onClick={() => abrirCampanha(escolhidos.filter(podeReceber).map((c) => c.id))} disabled={!envioDisponivel || !escolhidos.some(podeReceber)} className="min-h-11 px-3"
                title={envioDisponivel ? undefined : 'Envio de e-mail não configurado (RESEND_API_KEY)'}>
                <Send className="size-4" />Enviar campanha
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogLista('por-na-lista')} disabled={ocupado} className="min-h-11 px-3"><ListPlus className="size-4" />Pôr numa lista</Button>
            {listaAtual?.tipo === 'fixa' && (
              <Button variant="outline" onClick={tirarDaLista} disabled={ocupado} className="min-h-11 px-3">Tirar da lista</Button>
            )}
            <Button variant="outline" onClick={removerSelecionados} disabled={ocupado} className="min-h-11 px-3 text-destructive">
              {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}Remover
            </Button>
            <Button variant="ghost" onClick={() => setSelecionados(new Set())} className="min-h-11 px-3">Limpar</Button>
          </div>
        </div>
      )}
      {recado && <p className={`text-sm ${recado.tom === 'erro' ? 'text-destructive' : 'text-emerald-700'}`}>{recado.texto}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          {filtrados.length === 0
            ? contatos.length === 0
              ? 'Nenhum contato ainda. Importe uma planilha, busque pela Hunter.io ou cadastre à mão.'
              : 'Nenhum contato no filtro atual.'
            : <><span className="font-medium text-foreground">{filtrados.length}</span> {filtrados.length === 1 ? 'contato' : 'contatos'}</>}
        </p>
        {ligados.map((f) => (
          <button
            key={f.rotulo}
            type="button"
            onClick={() => mudar(f.tirar)}
            aria-label={`Tirar o filtro ${f.rotulo}`}
            className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-muted/50 px-3 text-sm hover:bg-muted sm:min-h-8"
          >
            {f.rotulo}<X className="size-3.5 text-muted-foreground" />
          </button>
        ))}
        {ligados.length > 1 && (
          <button type="button" onClick={() => setFiltros(SEM_FILTROS)} className="min-h-11 px-1 text-sm text-primary hover:underline sm:min-h-8">Limpar filtros</button>
        )}
        {!criterioEstaVazio(criterio) && (
          <Button variant="outline" onClick={() => setDialogLista('salvar-filtro')} className="min-h-11 px-3 sm:min-h-8"><Save className="size-4" />Salvar filtro como lista</Button>
        )}
      </div>

      {filtrados.length > 0 && (
        <Card data-ajuda="imprensa.tabela" className="overflow-hidden p-0">
          {/* No celular, um cartão por contato; o toque no nome abre a ficha. */}
          <div className="md:hidden">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-border bg-muted/40 px-3 text-sm">
              <input type="checkbox" checked={todosMarcados} onChange={alternarTodos} className="size-5 shrink-0" />
              {todosMarcados ? 'Desmarcar todos' : `Marcar os ${filtrados.length}`}
            </label>
            <ul>
              {filtrados.slice(0, LINHAS_NA_TELA).map((c) => (
                <CartaoDoContato
                  key={c.id}
                  contato={c}
                  veiculo={c.veiculoId ? veiculosPorId.get(c.veiculoId) : undefined}
                  selecionado={selecionados.has(c.id)}
                  onSelecionar={() => alternar(c.id)}
                />
              ))}
            </ul>
          </div>
          <div className="hidden overflow-x-auto md:block">
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
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cobre</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(0, LINHAS_NA_TELA).map((c) => (
                  <LinhaDoContato
                    key={c.id}
                    contato={c}
                    veiculo={c.veiculoId ? veiculosPorId.get(c.veiculoId) : undefined}
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
        <p className="text-sm text-muted-foreground">
          A tela mostra {LINHAS_NA_TELA} de {filtrados.length}. Filtros, &ldquo;marcar todos&rdquo;, envio e CSV valem para os {filtrados.length}.
        </p>
      )}

      {dialogImportar && (
        <DialogImportar
          etiquetasExistentes={emUso.etiquetas}
          onFechar={() => setDialogImportar(false)}
          onImportado={(etiqueta) => { router.refresh(); if (etiqueta) setFiltros({ ...SEM_FILTROS, etiqueta }) }}
        />
      )}

      {dialogNovo !== 'fechado' && (
        <DialogContato
          editando={dialogNovo === 'criar' ? null : dialogNovo}
          veiculos={veiculos}
          editoriasEmUso={emUso.editorias}
          pracasEmUso={emUso.pracas}
          veiculoInicial={dialogNovo === 'criar' ? veiculoAtual?.nome : undefined}
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
      {dialogLista === 'salvar-filtro' && (
        <DialogLista
          editando={null}
          inicial={{ criterio, foraDaLista }}
          opcoes={emUso}
          contar={contar}
          podeApagar={false}
          onFechar={() => setDialogLista('fechado')}
          onFeito={(texto) => { setDialogLista('fechado'); setRecado({ tom: 'ok', texto }); router.refresh() }}
        />
      )}
      {dialogLista === 'por-na-lista' && (
        <DialogPorNaLista
          ids={escolhidos.map((c) => c.id)}
          listasFixas={listas.filter((l) => l.tipo === 'fixa')}
          onFechar={() => setDialogLista('fechado')}
          onFeito={(texto) => { setDialogLista('fechado'); setRecado({ tom: 'ok', texto }); setSelecionados(new Set()); router.refresh() }}
        />
      )}
      {!ehAdmin && contatos.length > 0 && (
        <p className="text-xs text-muted-foreground">Remover contato é permitido a administradores e a quem cadastrou.</p>
      )}
    </div>
  )
}

/** O que o contato cobre, em marcas: as editorias (até três) e a praça. */
function Cobre({ contato, veiculo }: { contato: ContatoDeImprensa; veiculo: VeiculoDeImprensa | undefined }) {
  const praca = pracaDoContato(contato, veiculo)
  const mostradas = contato.editorias.slice(0, 3)
  const resto = contato.editorias.length - mostradas.length
  if (!mostradas.length && !praca) return null
  return (
    <span className="flex flex-wrap items-center gap-1">
      {mostradas.map((e) => <Marca key={e} tom="destaque">{comMaiuscula(e)}</Marca>)}
      {resto > 0 && <Marca>+{resto}</Marca>}
      {praca && <span className="text-xs text-muted-foreground">{praca}</span>}
    </span>
  )
}

function CartaoDoContato({ contato, veiculo, selecionado, onSelecionar }: {
  contato: ContatoDeImprensa
  veiculo: VeiculoDeImprensa | undefined
  selecionado: boolean
  onSelecionar: () => void
}) {
  const nome = contato.nome || contato.email || '(sem nome)'
  return (
    <li className={`flex border-b border-border last:border-0 ${selecionado ? 'bg-primary/5' : ''}`}>
      <label className="flex w-12 shrink-0 cursor-pointer justify-center pt-4">
        <input type="checkbox" checked={selecionado} onChange={onSelecionar} aria-label={`Selecionar ${nome}`} className="size-5" />
      </label>
      <Link href={`/imprensa/contatos/${contato.id}`} className="flex min-w-0 flex-1 items-center gap-2 py-3 pr-3">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-base font-medium break-words">{nome}</span>
          {(contato.cargo || contato.veiculo) && (
            <span className="text-sm break-words text-muted-foreground">{[contato.cargo, contato.veiculo].filter(Boolean).join(' · ')}</span>
          )}
          <Cobre contato={contato} veiculo={veiculo} />
          <span className="flex flex-wrap items-center gap-1.5">
            {contato.tipoDeContato !== 'jornalista' && <Marca>{rotuloDoTipoDeContato(contato.tipoDeContato)}</Marca>}
            {contato.email ? <BadgeDeStatus status={contato.emailStatus} /> : <span className="text-xs text-muted-foreground">sem e-mail</span>}
            {contato.devolvidoEm && <span className="text-xs text-destructive">e-mail devolveu</span>}
            <Leitura contato={contato} />
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  )
}

function LinhaDoContato({ contato, veiculo, hunterDisponivel, selecionado, onSelecionar, onEditar }: {
  contato: ContatoDeImprensa
  veiculo: VeiculoDeImprensa | undefined
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
        <Link href={`/imprensa/contatos/${contato.id}`} className="font-medium hover:underline">
          {contato.nome || <span className="text-muted-foreground">(sem nome)</span>}
        </Link>
        {contato.cargo && <p className="text-xs text-muted-foreground">{contato.cargo}</p>}
        {contato.tipoDeContato !== 'jornalista' && <p className="mt-1"><Marca>{rotuloDoTipoDeContato(contato.tipoDeContato)}</Marca></p>}
        {erro && <p className="mt-1 text-xs text-destructive">{erro}</p>}
      </td>
      <td className="px-4 py-3">
        <p>{contato.veiculo || '—'}</p>
        {veiculo?.tipo
          ? <p className="text-xs text-muted-foreground">{rotuloDoTipoDeVeiculo(veiculo.tipo)}</p>
          : contato.dominio && <p className="text-xs text-muted-foreground">{contato.dominio}</p>}
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
              {contato.devolvidoEm && (
                <span className="text-[11px] text-destructive" title={contato.motivoDaDevolucao || undefined}>
                  Devolveu em {quandoLegivel.format(new Date(contato.devolvidoEm))}: não recebe mais
                </span>
              )}
            </div>
          )
          : <span className="text-xs text-muted-foreground">sem e-mail</span>}
      </td>
      <td className="px-4 py-3"><Leitura contato={contato} /></td>
      <td className="whitespace-nowrap px-4 py-3">{contato.telefone || '—'}</td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <Cobre contato={contato} veiculo={veiculo} />
          {contato.tags.length > 0 && (
            <span className="flex flex-wrap gap-1">{contato.tags.map((t) => <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t}</span>)}</span>
          )}
          {!contato.editorias.length && !contato.tags.length && !pracaDoContato(contato, veiculo) && '—'}
        </div>
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
      {aviso && <p className="text-xs text-amber-700">{aviso}</p>}
      {resultado && <p className="text-xs text-emerald-700">{resultado}</p>}

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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
      {aviso && <p className="text-xs text-amber-700">{aviso}</p>}

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
function DialogImportar({ etiquetasExistentes, onFechar, onImportado }: {
  etiquetasExistentes: readonly string[]
  onFechar: () => void
  onImportado: (etiqueta: string) => void
}) {
  const [arquivo, setArquivo] = useState('')
  const [leitura, setLeitura] = useState<ResultadoDaLeitura | null>(null)
  const [etiqueta, setEtiqueta] = useState('')
  const [tipoDeContato, setTipoDeContato] = useState<TipoDeContato>('jornalista')
  const [origem, setOrigem] = useState('')
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
        form.set('tipoDeContato', tipoDeContato)
        form.set('origemDoDado', origem)
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
      setResultado(`${inseridos} novo(s) no banco. ${atualizados} já existiam${lista ? ` e ganharam a etiqueta “${lista}”` : ''}.${recusados ? ` ${recusados} recusados por e-mail inválido.` : ''} Os veículos novos estão na aba Veículos, a classificar.`)
      setLeitura(null)
      onImportado(lista)
    })
  }

  const COLUNAS: [keyof ResultadoDaLeitura['mapa'], string][] = [
    ['email', 'E-mail'], ['nome', 'Nome'], ['veiculo', 'Veículo'], ['cargo', 'Cargo'], ['telefone', 'Telefone'],
    ['editorias', 'Editoria'], ['praca', 'Praça'], ['tipoDeVeiculo', 'Tipo de veículo'],
  ]

  return (
    <Dialog
      titulo="Importar planilha"
      descricao="CSV de qualquer origem: Excel, Google Planilhas, Gmail, Outlook, LinkedIn. E-mail repetido não duplica. Colunas de editoria, cidade e tipo de veículo também são lidas."
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
                <span className="font-medium">{c.nome || '(sem nome)'}</span> · {c.email}{c.veiculo ? ` · ${c.veiculo}` : ''}{c.editorias.length ? ` · ${c.editorias.join(', ')}` : ''}
              </p>
            ))}
            {leitura.contatos.length > 8 && <p className="px-3 py-1.5 text-muted-foreground">… e mais {leitura.contatos.length - 8}</p>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">Que tipo de contato é esta planilha
              <select value={tipoDeContato} onChange={(e) => setTipoDeContato(e.target.value as TipoDeContato)} disabled={gravando} className={`mt-1 ${campoClass}`}>
                {TIPOS_DE_CONTATO.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
              </select>
              <span className="mt-1 block text-xs font-normal text-muted-foreground">Vale para os contatos novos. Quem já está no banco fica como está.</span>
            </label>
            <div className="block text-sm font-medium">De onde veio esta planilha
              <SeletorComOutro rotulo="De onde veio esta planilha" valor={origem} onMudar={setOrigem} opcoes={ORIGENS_SUGERIDAS} vazio="Escolha" outro="Outra origem…" placeholder="Ex.: lista da coletiva de 12/03" desabilitado={gravando} />
              <span className={`mt-1 block text-xs font-normal ${origem.trim() ? 'text-muted-foreground' : 'text-amber-700'}`}>
                {origem.trim() ? 'Fica na ficha de cada contato.' : 'Diga de onde veio para poder importar: é o registro que a LGPD pede.'}
              </span>
            </div>
          </div>

          <label className="block text-sm font-medium">Etiqueta desta importação <span className="font-normal text-muted-foreground">(opcional)</span>
            <input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} disabled={gravando} list="etiquetas-existentes" placeholder="ex.: mailing-saude-2026" className={`mt-1 ${campoClass}`} />
            <datalist id="etiquetas-existentes">{etiquetasExistentes.map((t) => <option key={t} value={t} />)}</datalist>
            <span className="mt-1 block text-xs font-normal text-muted-foreground">Marca todos os contatos desta planilha, para achá-los depois no filtro “Etiqueta”.</span>
          </label>

          <p className="text-xs text-muted-foreground">
            Antes do primeiro envio para uma lista comprada ou raspada, vale verificar os e-mails: endereço morto vira devolução, e devolução derruba a entrega de tudo o que sai do domínio — inclusive a newsletter.
          </p>
        </>
      )}

      {erro && <p className="text-xs text-destructive">{erro}</p>}
      {progresso && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />{progresso}</p>}
      {resultado && <p className="text-xs text-emerald-700">{resultado}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onFechar} disabled={gravando} className="min-h-11 px-4 sm:min-h-0">{resultado ? 'Fechar' : 'Cancelar'}</Button>
        {leitura && (
          <Button onClick={importar} disabled={gravando || !origem.trim()} className="min-h-11 px-4 sm:min-h-0">
            {gravando ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Importar {leitura.contatos.length}
          </Button>
        )}
      </div>
    </Dialog>
  )
}
