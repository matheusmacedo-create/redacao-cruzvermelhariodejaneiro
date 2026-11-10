'use client'

import { useId, useMemo, useState, useTransition } from 'react'
import { Check, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { atualizarContato, criarContatoManual, type ContatoDeImprensa } from '@/app/actions/imprensa'
import {
  CANAIS, chave, comMaiuscula, EDITORIAS_SUGERIDAS, lerEditorias, MAXIMO_DE_EDITORIAS, opcoesComAsEmUso, ORIGENS_SUGERIDAS,
  PRACAS_SUGERIDAS, rotuloDoTipoDeVeiculo, TIPOS_DE_CONTATO, type Canal, type TipoDeContato, type VeiculoDeImprensa,
} from '@/lib/imprensa/vocabulario'
import { campoClass, Dialog } from './comum'
import { Chips, SeletorComOutro } from './pecas'

/**
 * Cadastrar ou editar um contato. O essencial fica à vista (quem é, onde
 * trabalha, como falar, o que cobre); o resto abre em "Mais campos".
 *
 * O veículo é um texto: o banco acha o veículo do cadastro por ele, sem
 * diferenciar maiúscula, e cria o que não existe.
 */
export function DialogContato({ editando, veiculos, editoriasEmUso, pracasEmUso, veiculoInicial = '', onFechar, onSalvo }: {
  editando: ContatoDeImprensa | null
  veiculos: readonly VeiculoDeImprensa[]
  editoriasEmUso: readonly string[]
  pracasEmUso: readonly string[]
  /** Ao criar a partir de um veículo, ele já vem preenchido. */
  veiculoInicial?: string
  onFechar: () => void
  onSalvo: () => void
}) {
  const idDaLista = useId()
  const [nome, setNome] = useState(editando?.nome ?? '')
  const [veiculo, setVeiculo] = useState(editando?.veiculo ?? veiculoInicial)
  const [cargo, setCargo] = useState(editando?.cargo ?? '')
  const [dominio, setDominio] = useState(editando?.dominio ?? '')
  const [email, setEmail] = useState(editando?.email ?? '')
  const [telefone, setTelefone] = useState(editando?.telefone ?? '')
  const [whatsapp, setWhatsapp] = useState(editando?.whatsapp ?? '')
  const [editorias, setEditorias] = useState<string[]>(editando?.editorias ?? [])
  const [outraEditoria, setOutraEditoria] = useState('')
  const [praca, setPraca] = useState(editando?.praca ?? '')
  const [tipoDeContato, setTipoDeContato] = useState<TipoDeContato>(editando?.tipoDeContato ?? 'jornalista')
  const [canal, setCanal] = useState<Canal>(editando?.canalPreferido ?? 'email')
  const [tags, setTags] = useState(editando?.tags.join(', ') ?? '')
  const [origem, setOrigem] = useState(editando?.origemDoDado ?? '')
  const [notas, setNotas] = useState(editando?.notas ?? '')
  const [erro, setErro] = useState('')
  const [salvando, salvar] = useTransition()

  // Quem já preencheu os campos de baixo os encontra abertos ao editar.
  const [maisCampos] = useState(Boolean(editando && (
    editando.tipoDeContato !== 'jornalista' || editando.canalPreferido !== 'email' || editando.whatsapp
    || editando.tags.length || editando.origemDoDado || editando.dominio
  )))

  const opcoesDeEditoria = useMemo(
    () => opcoesComAsEmUso(EDITORIAS_SUGERIDAS, [...editoriasEmUso, ...editorias]).map((e) => ({ id: e, rotulo: comMaiuscula(e) })),
    [editoriasEmUso, editorias],
  )
  const opcoesDePraca = useMemo(() => opcoesComAsEmUso(PRACAS_SUGERIDAS, pracasEmUso), [pracasEmUso])
  const doCadastro = useMemo(() => veiculos.find((v) => chave(v.nome) === chave(veiculo)), [veiculos, veiculo])

  function adicionarEditoria() {
    const novas = lerEditorias([...editorias, outraEditoria])
    setEditorias(novas)
    setOutraEditoria('')
  }

  function enviar() {
    setErro('')
    salvar(async () => {
      const form = new FormData()
      if (editando) form.set('id', editando.id)
      form.set('nome', nome)
      // O banco só não diferencia maiúscula. Quando o nome digitado é o de um veículo do cadastro
      // a menos do acento ("Radio Globo"), vai o nome do cadastro: senão nasceria um veículo repetido.
      form.set('veiculo', doCadastro ? doCadastro.nome : veiculo)
      // Para a ação saber se a pessoa mexeu no veículo (ver atualizarContato).
      if (editando) form.set('veiculoAnterior', editando.veiculo)
      form.set('cargo', cargo)
      form.set('dominio', dominio)
      form.set('email', email)
      form.set('telefone', telefone)
      form.set('whatsapp', whatsapp)
      // A editoria ainda no campo "Outra" entra junto: quem digitou e foi direto em Salvar não a perde.
      form.set('editorias', lerEditorias([...editorias, outraEditoria]).join(','))
      form.set('praca', praca)
      form.set('tipoDeContato', tipoDeContato)
      form.set('canalPreferido', canal)
      form.set('tags', tags)
      form.set('origemDoDado', origem)
      form.set('notas', notas)
      const r = editando ? await atualizarContato(form) : await criarContatoManual(form)
      if (r.erro) { setErro(r.erro); return }
      onSalvo()
    })
  }

  const rotulo = 'block text-sm font-medium'
  const dica = 'mt-1 block text-xs font-normal text-muted-foreground'

  return (
    <Dialog titulo={editando ? 'Editar contato' : 'Novo contato'} largura="max-w-2xl" onFechar={onFechar} podeFechar={!salvando}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={`${rotulo} sm:col-span-2`}>Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} disabled={salvando} placeholder="Nome da pessoa" autoComplete="off" className={`mt-1 ${campoClass}`} />
        </label>
        <label className={rotulo}>Veículo ou organização
          <input value={veiculo} onChange={(e) => setVeiculo(e.target.value)} disabled={salvando} list={idDaLista} placeholder="O Globo, CBN, Defesa Civil…" autoComplete="off" className={`mt-1 ${campoClass}`} />
          <datalist id={idDaLista}>{veiculos.map((v) => <option key={v.id} value={v.nome} />)}</datalist>
          {veiculo.trim() && (
            <span className={dica}>
              {doCadastro
                ? `Já está no cadastro: ${[rotuloDoTipoDeVeiculo(doCadastro.tipo), doCadastro.praca].filter(Boolean).join(' · ')}.`
                : 'Veículo novo: entra no cadastro de veículos ao salvar.'}
            </span>
          )}
        </label>
        <label className={rotulo}>Cargo
          <input value={cargo} onChange={(e) => setCargo(e.target.value)} disabled={salvando} placeholder="Repórter, editora, produtor…" autoComplete="off" className={`mt-1 ${campoClass}`} />
        </label>
        <label className={rotulo}>E-mail
          <input value={email} onChange={(e) => setEmail(e.target.value)} disabled={salvando} type="email" inputMode="email" placeholder="nome@veiculo.com" autoComplete="off" className={`mt-1 ${campoClass}`} />
        </label>
        <label className={rotulo}>Telefone
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} disabled={salvando} type="tel" inputMode="tel" placeholder="(21) 90000-0000" autoComplete="off" className={`mt-1 ${campoClass}`} />
          <span className={dica}>Com DDD. Serve para ligar e para o WhatsApp.</span>
        </label>

        <div className="sm:col-span-2">
          <p className={rotulo}>Editorias que cobre</p>
          <p className={dica}>Toque em todas as que valem. É por elas que se envia só para quem cobre o assunto.</p>
          <div className="mt-2">
            <Chips rotulo="Editorias que cobre" opcoes={opcoesDeEditoria} marcadas={editorias} onMudar={(novas) => setEditorias(novas.slice(0, MAXIMO_DE_EDITORIAS))} desabilitado={salvando} />
          </div>
          <div className="mt-2 flex gap-2">
            <input
              aria-label="Outra editoria"
              value={outraEditoria}
              onChange={(e) => setOutraEditoria(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarEditoria() } }}
              disabled={salvando}
              placeholder="Outra editoria"
              className={campoClass}
            />
            <Button type="button" variant="outline" onClick={adicionarEditoria} disabled={salvando || !outraEditoria.trim()} className="min-h-11 shrink-0 px-3">
              <Plus className="size-4" />Adicionar
            </Button>
          </div>
        </div>

        <div className={rotulo}>Praça
          <SeletorComOutro rotulo="Praça" valor={praca} onMudar={setPraca} opcoes={opcoesDePraca} vazio={doCadastro?.praca ? `A do veículo (${doCadastro.praca})` : 'A do veículo'} placeholder="Cidade ou região" desabilitado={salvando} />
          <span className={dica}>Onde a pessoa cobre. Em branco, vale a praça do veículo.</span>
        </div>
        <label className={`${rotulo} sm:col-span-2`}>Notas
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} disabled={salvando} rows={3} placeholder="Melhor horário, assuntos de interesse, como prefere receber…" className={`mt-1 ${campoClass}`} />
        </label>
      </div>

      <details open={maisCampos} className="rounded-lg border border-border">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">Mais campos</summary>
        <div className="grid grid-cols-1 gap-4 border-t border-border p-3 sm:grid-cols-2">
          <label className={rotulo}>Tipo de contato
            <select value={tipoDeContato} onChange={(e) => setTipoDeContato(e.target.value as TipoDeContato)} disabled={salvando} className={`mt-1 ${campoClass}`}>
              {TIPOS_DE_CONTATO.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
            </select>
          </label>
          <div>
            <p className={rotulo}>Como prefere ser procurado</p>
            <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Como prefere ser procurado">
              {CANAIS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={canal === c.id}
                  onClick={() => setCanal(c.id)}
                  disabled={salvando}
                  className={`min-h-11 rounded-lg border px-3.5 text-sm ${canal === c.id ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
                >
                  {c.rotulo}
                </button>
              ))}
            </div>
          </div>
          <label className={rotulo}>WhatsApp <span className="font-normal text-muted-foreground">(se for outro número)</span>
            <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} disabled={salvando} type="tel" inputMode="tel" placeholder="(21) 90000-0000" autoComplete="off" className={`mt-1 ${campoClass}`} />
          </label>
          <label className={rotulo}>Etiquetas <span className="font-normal text-muted-foreground">(separadas por vírgula)</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} disabled={salvando} placeholder="evento-2026, coletiva" autoComplete="off" className={`mt-1 ${campoClass}`} />
          </label>
          <div className={rotulo}>De onde veio este contato
            <SeletorComOutro rotulo="De onde veio este contato" valor={origem} onMudar={setOrigem} opcoes={ORIGENS_SUGERIDAS} vazio="Não informado" outro="Outra origem…" placeholder="Ex.: coletiva de 12/03" desabilitado={salvando} />
            <span className={dica}>Fica na ficha. Saber de onde veio o dado é parte do cuidado com a LGPD.</span>
          </div>
          <label className={rotulo}>Site do veículo <span className="font-normal text-muted-foreground">(opcional)</span>
            <input value={dominio} onChange={(e) => setDominio(e.target.value)} disabled={salvando} inputMode="url" placeholder="oglobo.globo.com" autoComplete="off" className={`mt-1 ${campoClass}`} />
          </label>
        </div>
      </details>

      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onFechar} disabled={salvando} className="min-h-11 px-4">Cancelar</Button>
        <Button onClick={enviar} disabled={salvando || (!nome.trim() && !email.trim())} className="min-h-11 px-4">
          {salvando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Salvar
        </Button>
      </div>
    </Dialog>
  )
}
