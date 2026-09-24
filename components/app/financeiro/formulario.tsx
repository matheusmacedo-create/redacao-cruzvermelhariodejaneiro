'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Loader2, Plus, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, inputClass } from '@/components/app/imprensa/comum'
import { atualizarLancamento, criarLancamento, salvarCadastro } from '@/app/actions/financeiro'
import {
  FORMAS, REPETICOES, dataCurta, gerarOcorrencias, lerValor, mesDe, reais, valorNoCampo, type Lancamento, type Repeticao, type Tipo,
} from '@/lib/financeiro/regras'
import type { Cadastros } from '@/lib/financeiro/acesso'

const TIPOS_DO_FORM: { id: Tipo; rotulo: string; icone: typeof ArrowUpRight; ajuda: string }[] = [
  { id: 'despesa', rotulo: 'Despesa', icone: ArrowUpRight, ajuda: 'Sai dinheiro' },
  { id: 'receita', rotulo: 'Receita', icone: ArrowDownLeft, ajuda: 'Entra dinheiro' },
  { id: 'transferencia', rotulo: 'Transferência', icone: ArrowLeftRight, ajuda: 'Entre contas da filial' },
]

function Campo({ rotulo, ajuda, children, largo }: { rotulo: string; ajuda?: string; children: React.ReactNode; largo?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 text-sm font-medium ${largo ? 'sm:col-span-2' : ''}`}>
      {rotulo}{children}{ajuda && <span className="text-xs font-normal text-muted-foreground">{ajuda}</span>}
    </label>
  )
}

/** Cadastra um favorecido sem sair do lançamento. */
function FavorecidoRapido({ onCriado, onFechar }: { onCriado: (f: { id: string; nome: string }) => void; onFechar: () => void }) {
  const [estado, enviar, enviando] = useActionState(salvarCadastro.bind(null, 'favorecido', null), {})
  const [nome, setNome] = useState('')
  useEffect(() => { if (estado.ok && estado.id) onCriado({ id: estado.id, nome }) }, [estado.ok, estado.id, nome, onCriado])
  return (
    <Dialog titulo="Novo favorecido" descricao="Fornecedor, prestador, doador ou quem recebe o pagamento." onFechar={onFechar}>
      <form action={enviar} className="flex flex-col gap-3" id="favorecido-rapido">
        <Campo rotulo="Nome"><input name="nome" required minLength={2} maxLength={160} value={nome} onChange={(e) => setNome(e.target.value)} className={inputClass} /></Campo>
        <Campo rotulo="CPF ou CNPJ" ajuda="Opcional, mas ajuda o contador e evita cadastro repetido."><input name="documento" inputMode="numeric" maxLength={20} className={inputClass} /></Campo>
        <Campo rotulo="Chave Pix"><input name="chave_pix" maxLength={140} className={inputClass} /></Campo>
        {estado.erro && <p className="text-xs text-destructive" role="alert">{estado.erro}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button type="submit" disabled={enviando}>{enviando && <Loader2 className="size-4 animate-spin" />}Cadastrar</Button>
        </div>
      </form>
    </Dialog>
  )
}

/**
 * O lançamento: despesa, receita ou transferência. Na criação, dá para
 * parcelar ou repetir todo mês — o banco recebe cada ocorrência pronta, no
 * mesmo grupo. Na edição, parcelas e recorrências podem mudar "só esta" ou
 * "esta e as próximas em aberto".
 */
export function FormularioDeLancamento({ cadastros, hoje, l, tipoInicial = 'despesa', emGrupo = false }: {
  cadastros: Cadastros; hoje: string; l?: Lancamento; tipoInicial?: Tipo; emGrupo?: boolean
}) {
  const router = useRouter()
  const editando = Boolean(l)
  const [estado, enviar, enviando] = useActionState(editando ? atualizarLancamento.bind(null, l!.id) : criarLancamento, {})
  useEffect(() => { if (estado.id) router.push(`/financeiro/${estado.id}`) }, [estado.id, router])

  const livre = cadastros.fontes.find((f) => !f.restrita && f.ativa) ?? cadastros.fontes[0]
  const contasAtivas = cadastros.contas.filter((c) => c.ativa || c.id === l?.conta_id || c.id === l?.conta_destino_id)
  const [tipo, setTipo] = useState<Tipo>(l?.tipo ?? tipoInicial)
  const [valor, setValor] = useState(valorNoCampo(l?.valor))
  const [contaId, setContaId] = useState(l?.conta_id ?? contasAtivas[0]?.id ?? '')
  const [fonteId, setFonteId] = useState(l?.fonte_id ?? contasAtivas[0]?.fonte_id ?? livre?.id ?? '')
  const [vencimento, setVencimento] = useState(l?.vencimento ?? hoje)
  const [competencia, setCompetencia] = useState(l ? mesDe(l.competencia) : mesDe(hoje))
  const [competenciaManual, setCompetenciaManual] = useState(editando)
  const [repeticao, setRepeticao] = useState<Repeticao>('unica')
  const [vezes, setVezes] = useState(2)
  const [pago, setPago] = useState(false)
  const [favorecidos, setFavorecidos] = useState(cadastros.favorecidos.map((f) => ({ id: f.id, nome: f.nome })))
  const [favorecidoId, setFavorecidoId] = useState(l?.favorecido_id ?? '')
  const [novoFavorecido, setNovoFavorecido] = useState(false)

  const categorias = cadastros.categorias.filter((c) => c.tipo === tipo && (c.ativa || c.id === l?.categoria_id))
  const grupos = [...new Set(categorias.map((c) => c.grupo ?? 'Outras'))]
  const numero = lerValor(valor)
  const pedeAprovacao = tipo === 'despesa' && cadastros.config.aprovacao_ativa && numero !== null && numero >= (cadastros.config.aprovacao_acima ?? 0)
  const previa = useMemo(() => (numero && repeticao !== 'unica' && vezes >= 2
    ? gerarOcorrencias({ descricao: '', valor: numero, vencimento, competencia: `${competencia}-01`, repeticao, vezes })
    : []), [numero, repeticao, vezes, vencimento, competencia])

  const mudarConta = (id: string) => {
    setContaId(id)
    const fonte = cadastros.contas.find((c) => c.id === id)?.fonte_id
    if (fonte) setFonteId(fonte)
  }
  const mudarVencimento = (d: string) => {
    setVencimento(d)
    if (!competenciaManual && d) setCompetencia(mesDe(d))
  }

  if (!contasAtivas.length) {
    return <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">Cadastre antes uma conta (banco ou caixa) em <Link href="/financeiro/cadastros" className="font-medium text-primary hover:underline">Cadastros</Link>.</p>
  }

  return (
    <>
    <form action={enviar} className="flex flex-col gap-5" id="form-lancamento">
      <input type="hidden" name="tipo" value={tipo} />
      {!editando && (
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo">
          {TIPOS_DO_FORM.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={tipo === t.id} onClick={() => setTipo(t.id)}
              className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2.5 text-sm transition ${tipo === t.id ? 'border-primary bg-primary/5 font-semibold text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
              <t.icone className="size-4" />{t.rotulo}<span className="text-[11px] font-normal">{t.ajuda}</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Descrição" largo>
          <input name="descricao" required minLength={2} maxLength={190} defaultValue={l?.descricao.replace(/ \(\d+\/\d+\)$/, '') ?? ''}
            placeholder={tipo === 'receita' ? 'Ex.: Doação da campanha de inverno' : tipo === 'transferencia' ? 'Ex.: Aplicação do mês' : 'Ex.: Conta de luz da sede'} className={inputClass} />
        </Campo>
        <Campo rotulo={repeticao === 'parcelada' ? 'Valor total' : 'Valor'}>
          <input name="valor" required inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" className={`${inputClass} tabular-nums`} />
        </Campo>
        {tipo !== 'transferencia' ? (
          <Campo rotulo={tipo === 'receita' ? 'Quem pagou (opcional)' : 'Favorecido'}>
            <span className="flex gap-2">
              <select name="favorecido_id" value={favorecidoId} onChange={(e) => setFavorecidoId(e.target.value)} className={inputClass}>
                <option value="">{tipo === 'receita' ? 'Não identificado' : 'Escolha…'}</option>
                {favorecidos.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
              <Button type="button" variant="outline" size="icon" title="Novo favorecido" aria-label="Novo favorecido" onClick={() => setNovoFavorecido(true)}><Plus className="size-4" /></Button>
            </span>
          </Campo>
        ) : <span className="hidden sm:block" />}

        {tipo !== 'transferencia' && (
          <Campo rotulo="Categoria">
            <select name="categoria_id" required defaultValue={l?.categoria_id ?? ''} className={inputClass}>
              <option value="" disabled>Escolha…</option>
              {grupos.map((g) => (
                <optgroup key={g} label={g}>
                  {categorias.filter((c) => (c.grupo ?? 'Outras') === g).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </optgroup>
              ))}
            </select>
          </Campo>
        )}
        <Campo rotulo={tipo === 'receita' ? 'Conta onde entra' : tipo === 'transferencia' ? 'Sai da conta' : 'Conta de onde sai'}>
          <select name="conta_id" required value={contaId} onChange={(e) => mudarConta(e.target.value)} className={inputClass}>
            {contasAtivas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
        {tipo === 'transferencia' && (
          <Campo rotulo="Vai para a conta">
            <select name="conta_destino_id" required defaultValue={l?.conta_destino_id ?? ''} className={inputClass}>
              <option value="" disabled>Escolha…</option>
              {contasAtivas.filter((c) => c.id !== contaId).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
        )}
        <Campo rotulo="Fonte do recurso" ajuda={cadastros.fontes.find((f) => f.id === fonteId)?.restrita ? 'Recurso com destino: só pode ser usado neste convênio ou projeto.' : 'Dinheiro livre da filial.'}>
          <select name="fonte_id" required value={fonteId} onChange={(e) => setFonteId(e.target.value)} className={inputClass}>
            {cadastros.fontes.filter((f) => f.ativa || f.id === l?.fonte_id).map((f) => <option key={f.id} value={f.id}>{f.nome}{f.restrita ? ' (com destino)' : ''}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Projeto (opcional)">
          <select name="projeto_id" defaultValue={l?.projeto_id ?? ''} className={inputClass}>
            <option value="">Nenhum</option>
            {cadastros.projetos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Campo>
        <Campo rotulo={tipo === 'receita' ? 'Data prevista' : 'Vencimento'}>
          <input type="date" name="vencimento" required value={vencimento} onChange={(e) => mudarVencimento(e.target.value)} className={inputClass} />
        </Campo>
        <Campo rotulo="Competência" ajuda="O mês a que a despesa ou receita se refere (ex.: luz de agosto paga em setembro).">
          <input type="month" name="competencia" required value={competencia} onChange={(e) => { setCompetencia(e.target.value); setCompetenciaManual(true) }} className={inputClass} />
        </Campo>
      </div>

      {!editando && (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-medium">Repetição</legend>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {(Object.keys(REPETICOES) as Repeticao[]).map((r) => (
              <label key={r} className="flex items-center gap-2"><input type="radio" name="repeticao" value={r} checked={repeticao === r} onChange={() => { setRepeticao(r); if (r !== 'unica') setPago(false) }} />{REPETICOES[r]}</label>
            ))}
            {repeticao !== 'unica' && (
              <label className="flex items-center gap-2">{repeticao === 'parcelada' ? 'em' : 'por'}
                <input type="number" name="vezes" min={2} max={120} value={vezes} onChange={(e) => setVezes(Number(e.target.value))} className={`${inputClass} !w-20 py-1`} />
                {repeticao === 'parcelada' ? 'parcelas' : 'meses'}
              </label>
            )}
          </div>
          {previa.length > 0 && (
            <p className="text-xs text-muted-foreground" id="previa-repeticao">
              {previa.length} × {reais(previa[previa.length - 1].valor)}{previa[0].valor !== previa[previa.length - 1].valor ? ` (a 1ª de ${reais(previa[0].valor)})` : ''} · de {dataCurta(previa[0].vencimento)} a {dataCurta(previa[previa.length - 1].vencimento)}
              {repeticao === 'mensal' ? ` · total ${reais(previa.reduce((s, o) => s + o.valor, 0))}` : ''}
            </p>
          )}
        </fieldset>
      )}

      {!editando && repeticao === 'unica' && (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="pago" value="sim" checked={pago} onChange={(e) => setPago(e.target.checked)} disabled={pedeAprovacao} />
            {tipo === 'receita' ? 'Já foi recebido' : 'Já foi pago'}
          </label>
          {pago && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo rotulo="Em"><input type="date" name="pago_em" required defaultValue={hoje} max={hoje} className={inputClass} /></Campo>
              <Campo rotulo="Valor pago" ajuda="Se teve juros ou desconto."><input name="valor_pago" inputMode="decimal" placeholder={valor || '0,00'} className={inputClass} /></Campo>
            </div>
          )}
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Forma de pagamento">
          <select name="forma" defaultValue={l?.forma ?? ''} className={inputClass}>
            <option value="">—</option>{Object.entries(FORMAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Nº do documento" ajuda="Nota fiscal, boleto, recibo."><input name="documento" maxLength={80} defaultValue={l?.documento ?? ''} className={inputClass} /></Campo>
        <Campo rotulo="Observação" largo><textarea name="observacao" rows={2} maxLength={2000} defaultValue={l?.observacao ?? ''} className={inputClass} /></Campo>
      </div>

      {editando && emGrupo && (
        <fieldset className="flex flex-wrap gap-4 rounded-lg border border-border p-4 text-sm">
          <legend className="px-1 font-medium">Aplicar a mudança em</legend>
          <label className="flex items-center gap-2"><input type="radio" name="escopo" value="este" defaultChecked />Só este</label>
          <label className="flex items-center gap-2"><input type="radio" name="escopo" value="futuros" />Este e os próximos em aberto</label>
        </fieldset>
      )}

      {pedeAprovacao && (
        <p className="flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning-foreground" id="aviso-aprovacao">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />A partir de {reais(cadastros.config.aprovacao_acima ?? 0)}, a despesa precisa ser aprovada por outra pessoa antes de ser paga.
        </p>
      )}
      {estado.erro && <p className="text-sm text-destructive" role="alert">{estado.erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" disabled={enviando}>{enviando && <Loader2 className="size-4 animate-spin" />}{editando ? 'Salvar' : previa.length ? `Lançar ${previa.length}` : 'Lançar'}</Button>
      </div>
    </form>

      {novoFavorecido && (
        <FavorecidoRapido onFechar={() => setNovoFavorecido(false)}
          onCriado={(f) => { setFavorecidos((a) => [...a, f].sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))); setFavorecidoId(f.id); setNovoFavorecido(false) }} />
      )}
    </>
  )
}
