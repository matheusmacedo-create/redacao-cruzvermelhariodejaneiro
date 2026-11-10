'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ListPlus, Loader2, Pencil, Plus, Send, Siren, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { ContatoDeImprensa } from '@/app/actions/imprensa'
import { excluirLista, mudarContatosDaLista, salvarLista } from '@/app/actions/imprensa-listas'
import {
  A_CLASSIFICAR, criterioEstaVazio, criterioVazio, resumoDoCriterio, type CriterioDaLista, type ListaDeImprensa,
} from '@/lib/imprensa/listas'
import {
  comMaiuscula, EDITORIAS_SUGERIDAS, opcoesComAsEmUso, PRACAS_SUGERIDAS, RELEVANCIAS, TIPOS_DE_CONTATO, TIPOS_DE_VEICULO,
} from '@/lib/imprensa/vocabulario'
import { campoClass, Dialog, podeReceber } from './comum'
import { Chips, Marca } from './pecas'

/** O que o banco já usa, para o editor de filtro oferecer junto das sugestões. */
export type OpcoesDeCriterio = { editorias: readonly string[]; pracas: readonly string[]; etiquetas: readonly string[] }

/**
 * As listas salvas: uma seleção de contatos com nome, para não refazer o
 * filtro a cada envio. A lista fixa guarda as pessoas escolhidas; a lista por
 * filtro guarda o critério, e quem for cadastrado depois entra sozinho.
 */
export function PainelDeListas({ listas, contatosPorLista, opcoes, contar, podeDisparar, envioDisponivel, podeOrganizar, usuarioId, onVerContatos, onEnviar }: {
  /** Já na ordem da tela: as de plantão primeiro. */
  listas: ListaDeImprensa[]
  contatosPorLista: ReadonlyMap<string, ContatoDeImprensa[]>
  opcoes: OpcoesDeCriterio
  /** Quantos contatos atendem a um critério hoje. */
  contar: (criterio: CriterioDaLista) => number
  podeDisparar: boolean
  envioDisponivel: boolean
  podeOrganizar: boolean
  usuarioId: string
  onVerContatos: (listaId: string) => void
  onEnviar: (listaId: string) => void
}) {
  const router = useRouter()
  const [dialogo, setDialogo] = useState<'fechado' | 'criar' | ListaDeImprensa>('fechado')
  const [recado, setRecado] = useState('')

  return (
    <div className="flex flex-col gap-4">
      <div data-ajuda="imprensa.listas" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {listas.length === 0
            ? 'Nenhuma lista ainda. Uma lista guarda uma seleção de contatos com nome, para enviar só para quem cobre o assunto.'
            : <><span className="font-medium text-foreground">{listas.length}</span> {listas.length === 1 ? 'lista' : 'listas'}. As de plantão aparecem primeiro.</>}
        </p>
        <Button onClick={() => { setRecado(''); setDialogo('criar') }} className="min-h-11 shrink-0 px-4"><Plus className="size-4" />Nova lista</Button>
      </div>

      {recado && <p className="text-sm text-emerald-700">{recado}</p>}

      {listas.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {listas.map((l) => {
            const contatos = contatosPorLista.get(l.id) ?? []
            const aptos = contatos.filter(podeReceber).length
            return (
              <li key={l.id}>
                <Card className={`flex h-full flex-col gap-3 p-4 ${l.plantao ? 'border-destructive/40' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-base font-semibold break-words">{l.nome}</p>
                    {l.plantao && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"><Siren className="size-3.5" />Plantão</span>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {l.tipo === 'fixa' ? 'Lista fixa: as pessoas escolhidas.' : `Por filtro. ${resumoDoCriterio(l.criterio)}.`}
                  </p>
                  {l.descricao && <p className="text-sm whitespace-pre-line">{l.descricao}</p>}
                  <p className="text-sm">
                    <span className="font-medium">{contatos.length}</span> {contatos.length === 1 ? 'contato' : 'contatos'}{l.tipo === 'filtro' ? ' hoje' : ''}
                    {contatos.length > 0 && <span className="text-muted-foreground"> · {aptos === contatos.length ? 'todos podem receber e-mail' : `${aptos} ${aptos === 1 ? 'pode' : 'podem'} receber e-mail`}</span>}
                  </p>
                  {l.tipo === 'fixa' && contatos.length === 0 && (
                    <p className="text-sm text-muted-foreground">Ainda vazia. Na aba Contatos, marque as pessoas e toque em “Pôr numa lista”.</p>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => onVerContatos(l.id)} disabled={!contatos.length} className="min-h-11 flex-1 px-3">
                      <Users className="size-4" />Ver contatos
                    </Button>
                    {podeDisparar && (
                      <Button variant="outline" onClick={() => onEnviar(l.id)} disabled={!envioDisponivel || !aptos} className="min-h-11 flex-1 px-3"
                        title={envioDisponivel ? undefined : 'Envio de e-mail não configurado (RESEND_API_KEY)'}>
                        <Send className="size-4" />Enviar campanha
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => { setRecado(''); setDialogo(l) }} className="min-h-11 px-3">
                      <Pencil className="size-4" />Editar
                    </Button>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {dialogo !== 'fechado' && (
        <DialogLista
          editando={dialogo === 'criar' ? null : dialogo}
          opcoes={opcoes}
          contar={contar}
          podeApagar={dialogo !== 'criar' && (podeOrganizar || dialogo.criadaPor === usuarioId)}
          onFechar={() => setDialogo('fechado')}
          onFeito={(texto) => { setDialogo('fechado'); setRecado(texto); router.refresh() }}
        />
      )}
    </div>
  )
}

/** Os campos de um critério, um grupo por vez: abre o que interessa e toca nas opções. */
function EditorDeCriterio({ valor, onMudar, opcoes, desabilitado }: {
  valor: CriterioDaLista
  onMudar: (criterio: CriterioDaLista) => void
  opcoes: OpcoesDeCriterio
  desabilitado: boolean
}) {
  const grupos = useMemo(() => {
    const todos: { campo: keyof CriterioDaLista; titulo: string; opcoes: { id: string; rotulo: string }[] }[] = [
      { campo: 'editorias', titulo: 'Editoria', opcoes: opcoesComAsEmUso(EDITORIAS_SUGERIDAS, [...opcoes.editorias, ...valor.editorias]).map((e) => ({ id: e, rotulo: comMaiuscula(e) })) },
      { campo: 'pracas', titulo: 'Praça', opcoes: opcoesComAsEmUso(PRACAS_SUGERIDAS, [...opcoes.pracas, ...valor.pracas]).map((p) => ({ id: p, rotulo: p })) },
      { campo: 'tiposDeVeiculo', titulo: 'Tipo de veículo', opcoes: [...TIPOS_DE_VEICULO.map((t) => ({ id: t.id as string, rotulo: t.rotulo as string })), { id: A_CLASSIFICAR, rotulo: 'A classificar' }] },
      { campo: 'relevancias', titulo: 'Relevância do veículo', opcoes: RELEVANCIAS.map((r) => ({ id: r.id as string, rotulo: r.rotulo as string })) },
      { campo: 'tiposDeContato', titulo: 'Tipo de contato', opcoes: TIPOS_DE_CONTATO.map((t) => ({ id: t.id as string, rotulo: t.rotulo as string })) },
      // A etiqueta é comparada inteira e com acento: "saude" e "saúde" são duas opções.
      { campo: 'etiquetas', titulo: 'Etiqueta', opcoes: [...new Set([...opcoes.etiquetas, ...valor.etiquetas])].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((e) => ({ id: e, rotulo: e })) },
    ]
    return todos.filter((g) => g.opcoes.length > 0)
  }, [opcoes, valor])
  // Abre os grupos que já têm escolha; os outros ficam fechados, um toque cada.
  const [abertos] = useState(() => new Set(grupos.filter((g) => valor[g.campo].length > 0).map((g) => g.campo)))

  return (
    <div className="flex flex-col gap-2">
      {grupos.map((g) => (
        <details key={g.campo} open={abertos.has(g.campo)} className="rounded-lg border border-border">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 text-sm font-medium">
            <span>{g.titulo}</span>
            {valor[g.campo].length > 0 && <Marca tom="destaque">{valor[g.campo].length === 1 ? '1 escolha' : `${valor[g.campo].length} escolhas`}</Marca>}
          </summary>
          <div className="border-t border-border p-3">
            <Chips rotulo={g.titulo} opcoes={g.opcoes} marcadas={valor[g.campo]} onMudar={(marcadas) => onMudar({ ...valor, [g.campo]: marcadas })} desabilitado={desabilitado} />
          </div>
        </details>
      ))}
    </div>
  )
}

/**
 * Criar ou editar uma lista. `inicial` vem da aba Contatos: o filtro que
 * estava ligado, para "Salvar filtro como lista".
 */
export function DialogLista({ editando, inicial, opcoes, contar, podeApagar, onFechar, onFeito }: {
  editando: ListaDeImprensa | null
  /** `foraDaLista`: o que estava ligado na tela e a lista não guarda (a busca, a situação do e-mail…). */
  inicial?: { criterio: CriterioDaLista; foraDaLista?: string[] }
  opcoes: OpcoesDeCriterio
  contar: (criterio: CriterioDaLista) => number
  podeApagar: boolean
  onFechar: () => void
  onFeito: (recado: string) => void
}) {
  const [nome, setNome] = useState(editando?.nome ?? '')
  const [descricao, setDescricao] = useState(editando?.descricao ?? '')
  const [tipo, setTipo] = useState<'fixa' | 'filtro'>(editando?.tipo ?? 'filtro')
  const [criterio, setCriterio] = useState<CriterioDaLista>(editando?.criterio ?? inicial?.criterio ?? criterioVazio())
  const [plantao, setPlantao] = useState(editando?.plantao ?? false)
  const [erro, setErro] = useState('')
  const [ocupado, rodar] = useTransition()

  const porFiltro = tipo === 'filtro'
  const semFiltro = porFiltro && criterioEstaVazio(criterio)
  const atendem = porFiltro && !semFiltro ? contar(criterio) : 0

  function salvar() {
    setErro('')
    rodar(async () => {
      const form = new FormData()
      if (editando) form.set('id', editando.id)
      form.set('nome', nome)
      form.set('descricao', descricao)
      form.set('tipo', tipo)
      form.set('criterio', JSON.stringify(criterio))
      form.set('plantao', plantao ? 'sim' : 'nao')
      const r = await salvarLista(form)
      if (r.erro) { setErro(r.erro); return }
      onFeito(editando ? 'Lista salva.' : porFiltro
        ? 'Lista criada. Quem for cadastrado depois e atender ao filtro entra nela sozinho.'
        : 'Lista criada. Para pôr gente nela, marque os contatos na aba Contatos e toque em “Pôr numa lista”.')
    })
  }

  function apagar() {
    if (!editando || !confirm(`Apagar a lista “${editando.nome}”? Os contatos continuam no banco. Não dá para desfazer.`)) return
    setErro('')
    rodar(async () => {
      const form = new FormData()
      form.set('id', editando.id)
      const r = await excluirLista(form)
      if (r.erro) { setErro(r.erro); return }
      onFeito(`A lista “${editando.nome}” foi apagada.`)
    })
  }

  const rotulo = 'block text-sm font-medium'
  const dica = 'mt-1 block text-xs font-normal text-muted-foreground'

  return (
    <Dialog titulo={editando ? 'Editar lista' : 'Nova lista'} largura="max-w-2xl" onFechar={onFechar} podeFechar={!ocupado}>
      <label className={rotulo}>Nome da lista
        <input value={nome} onChange={(e) => setNome(e.target.value)} disabled={ocupado} maxLength={120} placeholder="Saúde na Baixada, Plantão de TV e rádio…" autoComplete="off" className={`mt-1 ${campoClass}`} />
      </label>

      {!editando && (
        <div>
          <p className={rotulo}>Como a lista é montada</p>
          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Como a lista é montada">
            {([
              ['filtro', 'Por filtro', 'Entra quem atende ao filtro, inclusive quem for cadastrado depois.'],
              ['fixa', 'Fixa', 'Só as pessoas que você puser nela, uma a uma.'],
            ] as const).map(([id, titulo, texto]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={tipo === id}
                onClick={() => setTipo(id)}
                disabled={ocupado}
                className={`min-h-11 rounded-lg border p-3 text-left text-sm ${tipo === id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}`}
              >
                <span className={`block font-medium ${tipo === id ? 'text-primary' : ''}`}>{titulo}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{texto}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {porFiltro ? (
        <div>
          <p className={rotulo}>Filtro</p>
          <p className={dica}>Dentro de um grupo, basta atender a uma das escolhas. Entre grupos, precisa atender a todos.</p>
          <div className="mt-2">
            <EditorDeCriterio valor={criterio} onMudar={setCriterio} opcoes={opcoes} desabilitado={ocupado} />
          </div>
          <p className="mt-2 text-sm" aria-live="polite">
            {semFiltro
              ? <span className="text-muted-foreground">Escolha ao menos um filtro.</span>
              : <><span className="font-medium">{atendem}</span> {atendem === 1 ? 'contato atende' : 'contatos atendem'} a este filtro hoje.</>}
          </p>
          {!editando && inicial?.foraDaLista && inicial.foraDaLista.length > 0 && (
            <p className="mt-2 rounded-md bg-amber-500/10 px-2.5 py-2 text-sm text-amber-800">
              A lista guarda só o filtro acima. O que também estava ligado na tela não entra nela: {inicial.foraDaLista.join(', ')}. Por isso a lista pode ter mais gente do que a tela mostrava.
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {editando
            ? 'Lista fixa. Para pôr ou tirar gente, vá à aba Contatos, marque as pessoas e use “Pôr numa lista” ou “Tirar da lista”.'
            : 'A lista nasce vazia. Depois, na aba Contatos, marque as pessoas e toque em “Pôr numa lista”.'}
        </p>
      )}

      <label className={rotulo}>Para que serve <span className="font-normal text-muted-foreground">(opcional)</span>
        <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={ocupado} rows={2} maxLength={500} placeholder="Quando usar esta lista" className={`mt-1 ${campoClass}`} />
      </label>

      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm">
        <input type="checkbox" checked={plantao} onChange={(e) => setPlantao(e.target.checked)} disabled={ocupado} className="mt-0.5 size-5 shrink-0" />
        <span>
          <span className="font-medium">Lista de plantão</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">Para emergência: quem precisa saber primeiro. Aparece no topo das listas e na hora de enviar.</span>
        </span>
      </label>

      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}

      <div className="flex flex-wrap justify-end gap-2">
        {editando && podeApagar && (
          <Button variant="outline" onClick={apagar} disabled={ocupado} className="mr-auto min-h-11 px-4 text-destructive"><Trash2 className="size-4" />Apagar lista</Button>
        )}
        <Button variant="outline" onClick={onFechar} disabled={ocupado} className="min-h-11 px-4">Cancelar</Button>
        <Button onClick={salvar} disabled={ocupado || !nome.trim() || semFiltro} className="min-h-11 px-4">
          {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}Salvar
        </Button>
      </div>
    </Dialog>
  )
}

const NOVA = '__nova__'

/** Pôr os contatos marcados numa lista fixa que existe, ou numa lista nova. */
export function DialogPorNaLista({ ids, listasFixas, onFechar, onFeito }: {
  ids: string[]
  listasFixas: readonly ListaDeImprensa[]
  onFechar: () => void
  onFeito: (recado: string, listaId: string) => void
}) {
  const [escolha, setEscolha] = useState(listasFixas.length ? '' : NOVA)
  const [nome, setNome] = useState('')
  const [plantao, setPlantao] = useState(false)
  const [erro, setErro] = useState('')
  const [ocupado, rodar] = useTransition()
  const nova = escolha === NOVA
  const quantos = ids.length === 1 ? '1 contato' : `${ids.length} contatos`

  function por() {
    setErro('')
    rodar(async () => {
      const form = new FormData()
      form.set('ids', JSON.stringify(ids))
      if (nova) {
        form.set('nome', nome)
        form.set('tipo', 'fixa')
        form.set('plantao', plantao ? 'sim' : 'nao')
        const r = await salvarLista(form)
        if (r.erro || !r.id) { setErro(r.erro ?? 'Não foi possível criar a lista.'); return }
        onFeito(r.aviso ?? `Lista “${nome.trim()}” criada com ${r.postos ?? 0} contato(s).`, r.id)
        return
      }
      form.set('listaId', escolha)
      const r = await mudarContatosDaLista(form)
      if (r.erro) { setErro(r.erro); return }
      const lista = listasFixas.find((l) => l.id === escolha)
      onFeito(`${r.quantos ?? 0} contato(s) na lista “${lista?.nome ?? ''}”. Quem já estava nela não foi repetido.`, escolha)
    })
  }

  return (
    <Dialog titulo="Pôr numa lista" descricao={`${quantos} marcado(s) na aba Contatos.`} onFechar={onFechar} podeFechar={!ocupado}>
      <label className="block text-sm font-medium">Lista
        <select value={escolha} onChange={(e) => setEscolha(e.target.value)} disabled={ocupado} className={`mt-1 ${campoClass}`}>
          {listasFixas.length > 0 && <option value="">Escolha a lista</option>}
          {listasFixas.map((l) => <option key={l.id} value={l.id}>{l.plantao ? 'Plantão: ' : ''}{l.nome}</option>)}
          <option value={NOVA}>Criar uma lista nova…</option>
        </select>
        <span className="mt-1 block text-xs font-normal text-muted-foreground">Só as listas fixas aparecem aqui. Na lista por filtro, entra quem atende ao filtro.</span>
      </label>

      {nova && (
        <>
          <label className="block text-sm font-medium">Nome da lista nova
            <input value={nome} onChange={(e) => setNome(e.target.value)} disabled={ocupado} maxLength={120} placeholder="Convidados da coletiva, Plantão…" autoComplete="off" className={`mt-1 ${campoClass}`} />
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" checked={plantao} onChange={(e) => setPlantao(e.target.checked)} disabled={ocupado} className="size-5 shrink-0" />
            <span>É uma lista de plantão, para emergência</span>
          </label>
        </>
      )}

      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onFechar} disabled={ocupado} className="min-h-11 px-4">Cancelar</Button>
        <Button onClick={por} disabled={ocupado || (nova ? !nome.trim() : !escolha)} className="min-h-11 px-4">
          {ocupado ? <Loader2 className="size-4 animate-spin" /> : <ListPlus className="size-4" />}Pôr {quantos}
        </Button>
      </div>
    </Dialog>
  )
}
