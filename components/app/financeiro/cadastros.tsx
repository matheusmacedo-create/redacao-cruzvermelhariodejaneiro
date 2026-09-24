'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/app/imprensa/comum'
import { definirAcessoDoFinanceiro, salvarCadastro, salvarEmpresa, salvarRegras } from '@/app/actions/financeiro'
import { NIVEIS, TIPOS_DE_CONTA, dataCurta, documentoLegivel, reais, valorNoCampo, type NomeDoNivel } from '@/lib/financeiro/regras'
import type { Cadastros } from '@/lib/financeiro/acesso'

type Tabela = 'conta' | 'fonte' | 'categoria' | 'favorecido'

function Campo({ rotulo, children, largo, ajuda }: { rotulo: string; children: React.ReactNode; largo?: boolean; ajuda?: string }) {
  return <label className={`flex flex-col gap-1 text-sm font-medium ${largo ? 'sm:col-span-2' : ''}`}>{rotulo}{children}{ajuda && <span className="text-xs font-normal text-muted-foreground">{ajuda}</span>}</label>
}

/** O formulário de um cadastro, aberto no lugar da linha (ou no topo, para criar). */
function Formulario({ tabela, id, onFim, children }: { tabela: Tabela; id: string | null; onFim: () => void; children: React.ReactNode }) {
  const [estado, enviar, enviando] = useActionState(salvarCadastro.bind(null, tabela, id), {})
  useEffect(() => { if (estado.ok) onFim() }, [estado.ok, onFim])
  return (
    <form action={enviar} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4" data-cadastro={tabela}>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
      {estado.erro && <p className="text-xs text-destructive" role="alert">{estado.erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onFim}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={enviando}>{enviando && <Loader2 className="size-3.5 animate-spin" />}Salvar</Button>
      </div>
    </form>
  )
}

function Ativa({ ativa, rotulo = 'Em uso' }: { ativa: boolean; rotulo?: string }) {
  return (
    <Campo rotulo="Situação">
      <select name="ativa" defaultValue={ativa ? 'sim' : 'nao'} className={inputClass}><option value="sim">{rotulo}</option><option value="nao">Arquivada (não aparece para novos lançamentos)</option></select>
    </Campo>
  )
}

function Lista<T extends { id: string }>({ itens, titulo, podeEditar, vazio, linha, formulario }: {
  itens: T[]; titulo: string; podeEditar: boolean; vazio: string; linha: (x: T) => React.ReactNode; formulario: (x: T | null, fim: () => void) => React.ReactNode
}) {
  const router = useRouter()
  const [editando, setEditando] = useState<string | null>(null)
  const fim = () => { setEditando(null); router.refresh() }
  return (
    <div className="flex flex-col gap-3">
      {podeEditar && (editando === 'novo' ? formulario(null, fim) : (
        <div><Button size="sm" variant="outline" onClick={() => setEditando('novo')}><Plus className="size-3.5" />{titulo}</Button></div>
      ))}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {itens.map((x) => (
          <li key={x.id} className="px-4 py-3">
            {editando === x.id ? formulario(x, fim) : (
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">{linha(x)}</div>
                {podeEditar && <button type="button" title="Editar" aria-label="Editar" onClick={() => setEditando(x.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="size-3.5" /></button>}
              </div>
            )}
          </li>
        ))}
        {!itens.length && <li className="p-8 text-center text-sm text-muted-foreground">{vazio}</li>}
      </ul>
    </div>
  )
}

export function Contas({ c, saldos, pode }: { c: Cadastros; saldos: Record<string, number>; pode: boolean }) {
  return (
    <Lista itens={c.contas} titulo="Nova conta" podeEditar={pode} vazio="Nenhuma conta. Cadastre a conta do banco e o caixa em dinheiro."
      linha={(x) => (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span>
            <span className={`font-medium ${x.ativa ? '' : 'text-muted-foreground line-through'}`}>{x.nome}</span>
            <span className="block text-xs text-muted-foreground">{[TIPOS_DE_CONTA[x.tipo as keyof typeof TIPOS_DE_CONTA], x.banco, x.agencia && `ag. ${x.agencia}`, x.numero && `c/c ${x.numero}`, c.fontes.find((f) => f.id === x.fonte_id)?.nome].filter(Boolean).join(' · ')}</span>
            <span className="block text-xs text-muted-foreground">Saldo inicial {reais(x.saldo_inicial)} em {dataCurta(x.saldo_inicial_em)}</span>
          </span>
          <span className="text-right"><span className="block text-xs text-muted-foreground">Saldo hoje</span><span className={`font-semibold tabular-nums ${(saldos[x.id] ?? 0) < 0 ? 'text-destructive' : ''}`}>{reais(saldos[x.id] ?? x.saldo_inicial)}</span></span>
        </div>
      )}
      formulario={(x, fim) => (
        <Formulario tabela="conta" id={x?.id ?? null} onFim={fim}>
          <Campo rotulo="Nome"><input name="nome" required maxLength={80} defaultValue={x?.nome} placeholder="Ex.: Itaú movimento" className={inputClass} /></Campo>
          <Campo rotulo="Tipo"><select name="tipo" defaultValue={x?.tipo ?? 'corrente'} className={inputClass}>{Object.entries(TIPOS_DE_CONTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          <Campo rotulo="Banco"><input name="banco" maxLength={80} defaultValue={x?.banco ?? ''} className={inputClass} /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Agência"><input name="agencia" maxLength={20} defaultValue={x?.agencia ?? ''} className={inputClass} /></Campo>
            <Campo rotulo="Conta"><input name="numero" maxLength={30} defaultValue={x?.numero ?? ''} className={inputClass} /></Campo>
          </div>
          <Campo rotulo="Saldo inicial" ajuda="O saldo do extrato no dia abaixo. Negativo com sinal de menos."><input name="saldo_inicial" inputMode="decimal" defaultValue={valorNoCampo(x?.saldo_inicial ?? 0)} className={inputClass} /></Campo>
          <Campo rotulo="Em"><input type="date" name="saldo_inicial_em" required defaultValue={x?.saldo_inicial_em ?? new Date().toISOString().slice(0, 10)} className={inputClass} /></Campo>
          <Campo rotulo="Fonte padrão" ajuda="Conta exclusiva de convênio? Escolha a fonte dele: os lançamentos nela já vêm com essa fonte." largo>
            <select name="fonte_id" defaultValue={x?.fonte_id ?? ''} className={inputClass}><option value="">Nenhuma</option>{c.fontes.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
          </Campo>
          {x && <Ativa ativa={x.ativa} />}
        </Formulario>
      )} />
  )
}

export function Fontes({ c, pode }: { c: Cadastros; pode: boolean }) {
  return (
    <Lista itens={c.fontes} titulo="Nova fonte" podeEditar={pode} vazio="Nenhuma fonte."
      linha={(x) => (
        <span>
          <span className={`font-medium ${x.ativa ? '' : 'text-muted-foreground line-through'}`}>{x.nome}</span>
          <span className={`ml-2 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${x.restrita ? 'bg-warning/20 text-warning-foreground' : 'bg-success/15 text-success'}`}>{x.restrita ? 'Com destino' : 'Livre'}</span>
          <span className="block text-xs text-muted-foreground">
            {[x.financiador, c.projetos.find((p) => p.id === x.projeto_id)?.name && `projeto ${c.projetos.find((p) => p.id === x.projeto_id)?.name}`,
              x.valor_previsto !== null && `previsto ${reais(x.valor_previsto)}`, x.inicio && x.fim && `${dataCurta(x.inicio)} a ${dataCurta(x.fim)}`].filter(Boolean).join(' · ') || x.descricao}
          </span>
        </span>
      )}
      formulario={(x, fim) => (
        <Formulario tabela="fonte" id={x?.id ?? null} onFim={fim}>
          <Campo rotulo="Nome"><input name="nome" required maxLength={120} defaultValue={x?.nome} placeholder="Ex.: Termo de fomento 12/2026" className={inputClass} /></Campo>
          <Campo rotulo="Tipo">
            <select name="restrita" defaultValue={x ? (x.restrita ? 'sim' : 'nao') : 'sim'} className={inputClass}><option value="sim">Com destino (convênio, doação carimbada)</option><option value="nao">Livre</option></select>
          </Campo>
          <Campo rotulo="Financiador"><input name="financiador" maxLength={160} defaultValue={x?.financiador ?? ''} className={inputClass} /></Campo>
          <Campo rotulo="Projeto"><select name="projeto_id" defaultValue={x?.projeto_id ?? ''} className={inputClass}><option value="">Nenhum</option>{c.projetos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Campo>
          <Campo rotulo="Início da vigência"><input type="date" name="inicio" defaultValue={x?.inicio ?? ''} className={inputClass} /></Campo>
          <Campo rotulo="Fim da vigência"><input type="date" name="fim" defaultValue={x?.fim ?? ''} className={inputClass} /></Campo>
          <Campo rotulo="Valor previsto"><input name="valor_previsto" inputMode="decimal" defaultValue={valorNoCampo(x?.valor_previsto)} className={inputClass} /></Campo>
          {x && <Ativa ativa={x.ativa} rotulo="Em uso" />}
          <Campo rotulo="Descrição" largo><textarea name="descricao" rows={2} maxLength={2000} defaultValue={x?.descricao ?? ''} className={inputClass} /></Campo>
        </Formulario>
      )} />
  )
}

export function Categorias({ c, pode }: { c: Cadastros; pode: boolean }) {
  const [tipo, setTipo] = useState<'despesa' | 'receita'>('despesa')
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1" role="tablist">
        {(['despesa', 'receita'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tipo === t} onClick={() => setTipo(t)}
            className={`rounded-lg px-3 py-1.5 text-sm ${tipo === t ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted'}`}>{t === 'despesa' ? 'Despesas' : 'Receitas'}</button>
        ))}
      </div>
      <Lista itens={c.categorias.filter((x) => x.tipo === tipo)} titulo="Nova categoria" podeEditar={pode} vazio="Nenhuma categoria."
        linha={(x) => (
          <span className="flex flex-wrap items-baseline justify-between gap-2">
            <span><span className={`font-medium ${x.ativa ? '' : 'text-muted-foreground line-through'}`}>{x.nome}</span>{x.fixa && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">fixa</span>}
              <span className="block text-xs text-muted-foreground">{x.grupo ?? 'Sem grupo'}</span></span>
            <span className="font-mono text-xs text-muted-foreground" title="Conta no plano de contas do contador">{x.codigo_contabil ?? ''}</span>
          </span>
        )}
        formulario={(x, fim) => (
          <Formulario tabela="categoria" id={x?.id ?? null} onFim={fim}>
            <input type="hidden" name="tipo" value={x?.tipo ?? tipo} />
            <Campo rotulo="Nome"><input name="nome" required maxLength={80} defaultValue={x?.nome} className={inputClass} /></Campo>
            <Campo rotulo="Grupo"><input name="grupo" maxLength={60} defaultValue={x?.grupo ?? ''} list="grupos-de-categoria" className={inputClass} /></Campo>
            <Campo rotulo="Código no plano de contas" ajuda="O contador liga cada categoria à conta contábil dele."><input name="codigo_contabil" maxLength={40} defaultValue={x?.codigo_contabil ?? ''} className={inputClass} /></Campo>
            {tipo === 'despesa' && (
              <Campo rotulo="Despesa fixa?" ajuda="Entra no cálculo de quantos meses o caixa aguenta.">
                <select name="fixa" defaultValue={x?.fixa ? 'sim' : 'nao'} className={inputClass}><option value="nao">Não</option><option value="sim">Sim, todo mês</option></select>
              </Campo>
            )}
            {x && <Ativa ativa={x.ativa} />}
            <datalist id="grupos-de-categoria">{[...new Set(c.categorias.map((k) => k.grupo).filter(Boolean))].map((g) => <option key={g} value={g!} />)}</datalist>
          </Formulario>
        )} />
    </div>
  )
}

export function Favorecidos({ c, pode }: { c: Cadastros; pode: boolean }) {
  const [busca, setBusca] = useState('')
  const termo = busca.trim().toLowerCase()
  const itens = c.favorecidos.filter((f) => !termo || [f.nome, f.documento, f.email].filter(Boolean).join(' ').toLowerCase().includes(termo))
  return (
    <div className="flex flex-col gap-3">
      <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, CNPJ ou e-mail" aria-label="Buscar favorecido" className={inputClass} />
      <Lista itens={itens} titulo="Novo favorecido" podeEditar={pode} vazio={c.favorecidos.length ? 'Ninguém com esse nome.' : 'Nenhum favorecido ainda. Eles também podem ser cadastrados na hora do lançamento.'}
        linha={(x) => (
          <span><span className="font-medium">{x.nome}</span>
            <span className="block text-xs text-muted-foreground">{[documentoLegivel(x.documento), x.chave_pix && `Pix ${x.chave_pix}`, x.email, x.telefone].filter(Boolean).join(' · ')}</span></span>
        )}
        formulario={(x, fim) => (
          <Formulario tabela="favorecido" id={x?.id ?? null} onFim={fim}>
            <Campo rotulo="Nome"><input name="nome" required maxLength={160} defaultValue={x?.nome} className={inputClass} /></Campo>
            <Campo rotulo="CPF ou CNPJ" ajuda={x?.documento?.length === 11 ? 'CPF guardado; aparece mascarado na lista.' : undefined}><input name="documento" inputMode="numeric" maxLength={20} defaultValue={x?.documento ?? ''} className={inputClass} /></Campo>
            <Campo rotulo="Chave Pix"><input name="chave_pix" maxLength={140} defaultValue={x?.chave_pix ?? ''} className={inputClass} /></Campo>
            <Campo rotulo="E-mail"><input type="email" name="email" maxLength={200} defaultValue={x?.email ?? ''} className={inputClass} /></Campo>
            <Campo rotulo="Telefone"><input name="telefone" maxLength={30} defaultValue={x?.telefone ?? ''} className={inputClass} /></Campo>
            <Campo rotulo="Observação" largo><textarea name="observacao" rows={2} maxLength={1000} defaultValue={x?.observacao ?? ''} className={inputClass} /></Campo>
          </Formulario>
        )} />
    </div>
  )
}

/** Nome, razão social e CNPJ da empresa destes livros (sai no pacote do contador). */
export function DadosDaEmpresa({ empresa, pode }: { empresa: NonNullable<Cadastros['empresa']>; pode: boolean }) {
  const [estado, enviar, enviando] = useActionState(salvarEmpresa.bind(null, empresa.id), {})
  const cnpj = empresa.cnpj ? empresa.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : ''
  return (
    <form action={enviar} className="flex flex-col gap-4" id="dados-da-empresa">
      <fieldset disabled={!pode} className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome curto" ajuda="Como aparece no seletor do Financeiro."><input name="nome" required maxLength={80} defaultValue={empresa.nome} className={inputClass} /></Campo>
        <Campo rotulo="CNPJ"><input name="cnpj" inputMode="numeric" maxLength={20} defaultValue={cnpj} placeholder="00.000.000/0000-00" className={inputClass} /></Campo>
        <Campo rotulo="Razão social" largo ajuda="Sai no cabeçalho do pacote do contador."><input name="razao_social" maxLength={200} defaultValue={empresa.razao_social ?? ''} className={inputClass} /></Campo>
      </fieldset>
      <p className="text-xs text-muted-foreground">{empresa.principal ? 'Empresa principal: patrimônio, estoque, doações e trabalho voluntário entram no fechamento dela.' : 'Empresa à parte: contas, fontes, lançamentos, orçamento e fechamento do mês próprios.'}{empresa.fechado_ate ? ` Mês fechado até ${dataCurta(empresa.fechado_ate)}.` : ''}</p>
      {estado.erro && <p className="text-sm text-destructive" role="alert">{estado.erro}</p>}
      {estado.ok && !estado.erro && <p className="text-sm text-success" role="status">Dados da empresa salvos.</p>}
      {pode && <div><Button type="submit" disabled={enviando}>{enviando && <Loader2 className="size-4 animate-spin" />}Salvar</Button></div>}
    </form>
  )
}

/** Aprovação opcional (desligada) e a reserva mínima usada na saúde do caixa. */
export function Regras({ config, pode }: { config: Cadastros['config']; pode: boolean }) {
  const [estado, enviar, enviando] = useActionState(salvarRegras, {})
  const [ativa, setAtiva] = useState(config.aprovacao_ativa)
  return (
    <form action={enviar} className="flex flex-col gap-4" id="regras">
      <fieldset disabled={!pode} className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Aprovação de despesas</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="aprovacao_ativa" value="sim" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} className="mt-0.5" />
          <span>Despesas a partir de um valor precisam ser aprovadas antes de pagar<span className="block text-xs text-muted-foreground">Quem lançou nunca aprova a própria despesa. Quem aprova precisa do nível Aprovar ou Gestão.</span></span>
        </label>
        {ativa && (
          <label className="flex flex-col gap-1 text-sm font-medium sm:w-64">A partir de
            <input name="aprovacao_acima" inputMode="decimal" required defaultValue={valorNoCampo(config.aprovacao_acima)} placeholder="Ex.: 1.000,00" className={inputClass} />
            <span className="text-xs font-normal text-muted-foreground">Use 0,00 para toda despesa pedir aprovação.</span>
          </label>
        )}
      </fieldset>
      <fieldset disabled={!pode} className="flex flex-col gap-2 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Reserva mínima</legend>
        <label className="flex flex-wrap items-center gap-2 text-sm">O caixa livre deve cobrir
          <input name="reserva_minima_meses" inputMode="decimal" defaultValue={String(config.reserva_minima_meses).replace('.', ',')} className={`${inputClass} !w-20 py-1`} />
          meses de despesas fixas.</label>
        <span className="text-xs text-muted-foreground">Usado no painel de saúde do caixa para avisar quando o fôlego fica curto.</span>
      </fieldset>
      {estado.erro && <p className="text-sm text-destructive" role="alert">{estado.erro}</p>}
      {estado.ok && !estado.erro && <p className="text-sm text-success" role="status">Regras salvas.</p>}
      {pode && <div><Button type="submit" disabled={enviando}>{enviando && <Loader2 className="size-4 animate-spin" />}Salvar regras</Button></div>}
    </form>
  )
}

/**
 * Nível e alcance de uma pessoa no Financeiro: todas as empresas ou só uma
 * (ex.: só os livros da Escola). A equipe da escola só pode ter a Escola.
 */
export function NivelDeAcesso({ userId, nivel, empresaId, empresas, soEscola = false }: {
  userId: string; nivel: NomeDoNivel | null; empresaId: string | null
  empresas: { id: string; nome: string; tipo: string }[]; soEscola?: boolean
}) {
  const router = useRouter()
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const escola = empresas.find((e) => e.tipo === 'escola')
  const alcance = soEscola ? escola?.id ?? '' : empresaId ?? ''
  const mudar = (n: NomeDoNivel | null, e: string) => iniciar(async () => {
    setErro('')
    const r = await definirAcessoDoFinanceiro(userId, n, soEscola ? escola?.id ?? null : e || null)
    if (r.erro) setErro(r.erro); else router.refresh()
  })
  return (
    <span className="flex flex-wrap items-center justify-end gap-2" data-acesso={userId}>
      {ocupado && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      <select value={nivel ?? ''} disabled={ocupado} aria-label="Nível no Financeiro" className={`${inputClass} !w-auto py-1`}
        onChange={(e) => mudar((e.target.value || null) as NomeDoNivel | null, alcance)}>
        <option value="">Sem acesso</option>{Object.entries(NIVEIS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
      </select>
      {nivel && empresas.length > 1 && (
        <select value={alcance} disabled={ocupado || soEscola} aria-label="De qual empresa" className={`${inputClass} !w-auto py-1`}
          onChange={(e) => mudar(nivel, e.target.value)}>
          {!soEscola && <option value="">Todas as empresas</option>}
          {empresas.filter((e) => !soEscola || e.tipo === 'escola').map((e) => <option key={e.id} value={e.id}>Só {e.nome}</option>)}
        </select>
      )}
      {erro && <span className="w-full text-right text-xs text-destructive">{erro}</span>}
    </span>
  )
}
