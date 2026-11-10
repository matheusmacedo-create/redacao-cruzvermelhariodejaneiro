'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Combine, Loader2, Pencil, Plus, Search, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { excluirVeiculo, juntarVeiculos, salvarVeiculo } from '@/app/actions/imprensa-veiculos'
import {
  chave, opcoesComAsEmUso, PRACAS_SUGERIDAS, RELEVANCIAS, rotuloDaRelevancia, rotuloDoTipoDeVeiculo, TIPOS_DE_VEICULO,
  type Relevancia, type TipoDeVeiculo, type VeiculoDeImprensa,
} from '@/lib/imprensa/vocabulario'
import { A_CLASSIFICAR } from '@/lib/imprensa/listas'
import { campoClass, Dialog } from './comum'
import { Marca, SeletorComOutro } from './pecas'

/** Quantos veículos a tela desenha. A busca e o filtro valem para todos. */
const VEICULOS_NA_TELA = 200

/**
 * O cadastro de veículos: o que cada um é (TV, rádio, jornal…), a praça e a
 * relevância. É o que permite filtrar os contatos por tipo de veículo.
 *
 * O veículo nasce sozinho quando alguém cadastra ou importa um contato com um
 * nome novo, e nasce "a classificar": esta aba é onde se completa.
 */
export function PainelDeVeiculos({ veiculos, contagem, pracasEmUso, podeOrganizar, onVerContatos }: {
  veiculos: VeiculoDeImprensa[]
  /** Quantos contatos cada veículo tem, pelo id. */
  contagem: ReadonlyMap<string, number>
  pracasEmUso: readonly string[]
  podeOrganizar: boolean
  onVerContatos: (veiculoId: string) => void
}) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('todos')
  const [dialogo, setDialogo] = useState<'fechado' | 'criar' | VeiculoDeImprensa>('fechado')
  const [recado, setRecado] = useState('')

  const aClassificar = useMemo(() => veiculos.filter((v) => !v.tipo).length, [veiculos])
  const filtrados = useMemo(() => {
    const termo = chave(busca)
    return veiculos.filter((v) => {
      if (tipo === A_CLASSIFICAR ? Boolean(v.tipo) : tipo !== 'todos' && v.tipo !== tipo) return false
      return !termo || chave(`${v.nome} ${v.praca} ${v.dominio}`).includes(termo)
    })
  }, [veiculos, busca, tipo])

  return (
    <div className="flex flex-col gap-4">
      <div data-ajuda="imprensa.veiculos" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar veículo por nome ou praça…" aria-label="Buscar veículo" className={`pl-9 ${campoClass}`} />
        </div>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de veículo" className={`sm:w-auto ${campoClass}`}>
          <option value="todos">Todos os tipos</option>
          <option value={A_CLASSIFICAR}>A classificar ({aClassificar})</option>
          {TIPOS_DE_VEICULO.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
        </select>
        <Button onClick={() => { setRecado(''); setDialogo('criar') }} className="min-h-11 px-4"><Plus className="size-4" />Novo veículo</Button>
      </div>

      {aClassificar > 0 && tipo !== A_CLASSIFICAR && (
        <Card className="flex flex-col gap-2 border-amber-500/40 bg-amber-500/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="font-medium">{aClassificar === 1 ? '1 veículo ainda sem tipo.' : `${aClassificar} veículos ainda sem tipo.`}</span>{' '}
            Diga se é TV, rádio, jornal ou site para poder filtrar os contatos por tipo de veículo.
          </p>
          <Button variant="outline" onClick={() => setTipo(A_CLASSIFICAR)} className="min-h-11 shrink-0 px-4">Ver os que faltam</Button>
        </Card>
      )}

      {recado && <p className="text-sm text-emerald-700">{recado}</p>}

      <p className="text-sm text-muted-foreground">
        {veiculos.length === 0
          ? 'Nenhum veículo ainda. Ele entra aqui sozinho quando você cadastra ou importa um contato, ou pelo botão “Novo veículo”.'
          : filtrados.length === 0
            ? 'Nenhum veículo no filtro atual.'
            : <><span className="font-medium text-foreground">{filtrados.length}</span> {filtrados.length === 1 ? 'veículo' : 'veículos'}</>}
      </p>

      {filtrados.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtrados.slice(0, VEICULOS_NA_TELA).map((v) => {
            const contatos = contagem.get(v.id) ?? 0
            return (
              <li key={v.id}>
                <Card className="flex h-full flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold break-words">{v.nome}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {[v.tipo ? rotuloDoTipoDeVeiculo(v.tipo) : null, v.praca || null].filter(Boolean).join(' · ') || 'Sem tipo nem praça'}
                      </p>
                      {v.dominio && <p className="mt-0.5 text-xs break-all text-muted-foreground">{v.dominio}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {!v.tipo && <Marca tom="alerta">A classificar</Marca>}
                      {v.relevancia !== 'media' && <Marca tom={v.relevancia === 'alta' ? 'destaque' : 'neutro'}>Relevância {rotuloDaRelevancia(v.relevancia).toLowerCase()}</Marca>}
                    </div>
                  </div>
                  {v.notas && <p className="text-sm whitespace-pre-line text-muted-foreground">{v.notas}</p>}
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => onVerContatos(v.id)} disabled={!contatos} className="min-h-11 flex-1 px-3">
                      <Users className="size-4" />{contatos === 0 ? 'Sem contatos' : contatos === 1 ? 'Ver 1 contato' : `Ver ${contatos} contatos`}
                    </Button>
                    <Button variant="outline" onClick={() => { setRecado(''); setDialogo(v) }} className="min-h-11 px-3">
                      <Pencil className="size-4" />Editar
                    </Button>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {filtrados.length > VEICULOS_NA_TELA && (
        <p className="text-sm text-muted-foreground">A tela mostra {VEICULOS_NA_TELA} de {filtrados.length}. Use a busca para achar os outros.</p>
      )}

      {dialogo !== 'fechado' && (
        <DialogVeiculo
          editando={dialogo === 'criar' ? null : dialogo}
          veiculos={veiculos}
          contatos={dialogo === 'criar' ? 0 : contagem.get(dialogo.id) ?? 0}
          pracasEmUso={pracasEmUso}
          podeOrganizar={podeOrganizar}
          onFechar={() => setDialogo('fechado')}
          onFeito={(texto) => { setDialogo('fechado'); setRecado(texto); router.refresh() }}
        />
      )}
    </div>
  )
}

function DialogVeiculo({ editando, veiculos, contatos, pracasEmUso, podeOrganizar, onFechar, onFeito }: {
  editando: VeiculoDeImprensa | null
  veiculos: readonly VeiculoDeImprensa[]
  contatos: number
  pracasEmUso: readonly string[]
  podeOrganizar: boolean
  onFechar: () => void
  onFeito: (recado: string) => void
}) {
  const [nome, setNome] = useState(editando?.nome ?? '')
  const [tipo, setTipo] = useState<TipoDeVeiculo>(editando?.tipo ?? '')
  const [praca, setPraca] = useState(editando?.praca ?? '')
  const [relevancia, setRelevancia] = useState<Relevancia>(editando?.relevancia ?? 'media')
  const [dominio, setDominio] = useState(editando?.dominio ?? '')
  const [notas, setNotas] = useState(editando?.notas ?? '')
  const [destino, setDestino] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, rodar] = useTransition()

  const opcoesDePraca = useMemo(() => opcoesComAsEmUso(PRACAS_SUGERIDAS, pracasEmUso), [pracasEmUso])
  const outros = useMemo(() => veiculos.filter((v) => v.id !== editando?.id), [veiculos, editando])

  function salvar() {
    setErro('')
    rodar(async () => {
      const form = new FormData()
      if (editando) form.set('id', editando.id)
      form.set('nome', nome)
      form.set('tipo', tipo)
      form.set('praca', praca)
      form.set('relevancia', relevancia)
      form.set('dominio', dominio)
      form.set('notas', notas)
      const r = await salvarVeiculo(form)
      if (r.erro) { setErro(r.erro); return }
      onFeito(editando ? 'Veículo salvo.' : 'Veículo cadastrado.')
    })
  }

  function juntar() {
    const fica = outros.find((v) => v.id === destino)
    if (!editando || !fica) return
    const quantos = contatos === 1 ? 'O contato dele passa' : `Os ${contatos} contatos dele passam`
    if (!confirm(`Juntar “${editando.nome}” a “${fica.nome}”? ${contatos ? `${quantos} para “${fica.nome}”, e ` : ''}“${editando.nome}” sai do cadastro. Não dá para desfazer.`)) return
    setErro('')
    rodar(async () => {
      const form = new FormData()
      form.set('origem', editando.id)
      form.set('destino', fica.id)
      const r = await juntarVeiculos(form)
      if (r.erro) { setErro(r.erro); return }
      onFeito(`“${editando.nome}” foi juntado a “${fica.nome}”${r.movidos ? `: ${r.movidos} contato(s) mudaram de veículo` : ''}.`)
    })
  }

  function apagar() {
    if (!editando || !confirm(`Apagar “${editando.nome}” do cadastro de veículos? Não dá para desfazer.`)) return
    setErro('')
    rodar(async () => {
      const form = new FormData()
      form.set('id', editando.id)
      const r = await excluirVeiculo(form)
      if (r.erro) { setErro(r.erro); return }
      onFeito(`“${editando.nome}” foi apagado.`)
    })
  }

  const rotulo = 'block text-sm font-medium'
  const dica = 'mt-1 block text-xs font-normal text-muted-foreground'

  return (
    <Dialog titulo={editando ? 'Editar veículo' : 'Novo veículo'} largura="max-w-2xl" onFechar={onFechar} podeFechar={!ocupado}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={`${rotulo} sm:col-span-2`}>Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} disabled={ocupado} placeholder="O Globo, CBN Rio, TV Brasil…" autoComplete="off" className={`mt-1 ${campoClass}`} />
          {editando && contatos > 0 && <span className={dica}>Mudar o nome aqui muda também nos {contatos === 1 ? '1 contato' : `${contatos} contatos`} deste veículo.</span>}
        </label>
        <label className={rotulo}>Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeVeiculo)} disabled={ocupado} className={`mt-1 ${campoClass}`}>
            <option value="">A classificar</option>
            {TIPOS_DE_VEICULO.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
          </select>
          <span className={dica}>“Não é imprensa” serve para órgão público, empresa ou ONG.</span>
        </label>
        <div className={rotulo}>Praça
          <SeletorComOutro rotulo="Praça" valor={praca} onMudar={setPraca} opcoes={opcoesDePraca} vazio="Não informada" placeholder="Cidade ou região" desabilitado={ocupado} />
          <span className={dica}>Onde o veículo circula ou é ouvido.</span>
        </div>
        <div className="sm:col-span-2">
          <p className={rotulo}>Relevância para a Cruz Vermelha</p>
          <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Relevância para a Cruz Vermelha">
            {RELEVANCIAS.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={relevancia === r.id}
                onClick={() => setRelevancia(r.id)}
                disabled={ocupado}
                className={`min-h-11 rounded-lg border px-4 text-sm ${relevancia === r.id ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
              >
                {r.rotulo}
              </button>
            ))}
          </div>
        </div>
        <label className={rotulo}>Site <span className="font-normal text-muted-foreground">(opcional)</span>
          <input value={dominio} onChange={(e) => setDominio(e.target.value)} disabled={ocupado} inputMode="url" placeholder="oglobo.globo.com" autoComplete="off" className={`mt-1 ${campoClass}`} />
        </label>
        <label className={`${rotulo} sm:col-span-2`}>Notas
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} disabled={ocupado} rows={3} placeholder="Horário de fechamento, telefone da redação, programas…" className={`mt-1 ${campoClass}`} />
        </label>
      </div>

      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onFechar} disabled={ocupado} className="min-h-11 px-4">Cancelar</Button>
        <Button onClick={salvar} disabled={ocupado || !nome.trim()} className="min-h-11 px-4">
          {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}Salvar
        </Button>
      </div>

      {editando && podeOrganizar && (
        <details className="rounded-lg border border-border">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">Juntar a outro veículo ou apagar</summary>
          <div className="flex flex-col gap-4 border-t border-border p-3">
            {outros.length > 0 && (
              <div>
                <label className={rotulo}>Este veículo é o mesmo que
                  <select value={destino} onChange={(e) => setDestino(e.target.value)} disabled={ocupado} className={`mt-1 ${campoClass}`}>
                    <option value="">Escolha o veículo que fica</option>
                    {outros.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                  </select>
                </label>
                <p className={dica}>Para quando o mesmo veículo entrou com dois nomes (“Globo” e “O Globo”). Os contatos passam para o que fica.</p>
                <Button variant="outline" onClick={juntar} disabled={ocupado || !destino} className="mt-2 min-h-11 px-4"><Combine className="size-4" />Juntar</Button>
              </div>
            )}
            <div>
              <Button variant="outline" onClick={apagar} disabled={ocupado || contatos > 0} className="min-h-11 px-4 text-destructive"><Trash2 className="size-4" />Apagar veículo</Button>
              {contatos > 0 && <p className={dica}>Tem {contatos === 1 ? '1 contato' : `${contatos} contatos`}: para apagar, junte a outro veículo antes.</p>}
            </div>
          </div>
        </details>
      )}
    </Dialog>
  )
}
