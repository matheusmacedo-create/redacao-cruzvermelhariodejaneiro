'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/app/imprensa/comum'
import { salvarCadastroDoPatrimonio } from '@/app/actions/patrimonio'
import type { CadastrosDoPatrimonio } from '@/lib/patrimonio/acesso'

function Campo({ rotulo, children, largo, ajuda }: { rotulo: string; children: React.ReactNode; largo?: boolean; ajuda?: string }) {
  return <label className={`flex flex-col gap-1 text-sm font-medium ${largo ? 'sm:col-span-2' : ''}`}>{rotulo}{children}{ajuda && <span className="text-xs font-normal text-muted-foreground">{ajuda}</span>}</label>
}

function Formulario({ tabela, id, onFim, children }: { tabela: 'categoria' | 'local' | 'config'; id: string | null; onFim: () => void; children: React.ReactNode }) {
  const [estado, enviar, enviando] = useActionState(salvarCadastroDoPatrimonio.bind(null, tabela, id), {})
  useEffect(() => { if (estado.ok) onFim() }, [estado.ok, onFim])
  return (
    <form action={enviar} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4" data-cadastro={tabela}>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
      {estado.erro && <p className="text-xs text-destructive" role="alert">{estado.erro}</p>}
      <div className="flex justify-end gap-2">
        {tabela !== 'config' && <Button type="button" variant="ghost" size="sm" onClick={onFim}>Cancelar</Button>}
        <Button type="submit" size="sm" disabled={enviando}>{enviando && <Loader2 className="size-3.5 animate-spin" />}Salvar</Button>
      </div>
      {tabela === 'config' && estado.ok && !estado.erro && <p className="text-xs text-success">Salvo.</p>}
    </form>
  )
}

function Lista<T extends { id: string }>({ itens, novo, pode, linha, formulario }: { itens: T[]; novo: string; pode: boolean; linha: (x: T) => React.ReactNode; formulario: (x: T | null, fim: () => void) => React.ReactNode }) {
  const router = useRouter()
  const [editando, setEditando] = useState<string | null>(null)
  const fim = () => { setEditando(null); router.refresh() }
  return (
    <div className="flex flex-col gap-3">
      {pode && (editando === 'novo' ? formulario(null, fim) : <div><Button size="sm" variant="outline" onClick={() => setEditando('novo')}><Plus className="size-3.5" />{novo}</Button></div>)}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {itens.map((x) => (
          <li key={x.id} className="px-4 py-3">
            {editando === x.id ? formulario(x, fim) : (
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">{linha(x)}</div>
                {pode && <button type="button" title="Editar" aria-label="Editar" onClick={() => setEditando(x.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="size-3.5" /></button>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

const Situacao = ({ ativa }: { ativa: boolean }) => (
  <Campo rotulo="Situação"><select name={'ativa'} defaultValue={ativa ? 'sim' : 'nao'} className={inputClass}><option value="sim">Em uso</option><option value="nao">Arquivada</option></select></Campo>
)

export function Categorias({ c, pode }: { c: CadastrosDoPatrimonio; pode: boolean }) {
  return (
    <Lista itens={c.categorias} novo="Nova categoria" pode={pode}
      linha={(x) => (
        <span><span className={`font-medium ${x.ativa ? '' : 'text-muted-foreground line-through'}`}>{x.nome}</span>
          <span className="block text-xs text-muted-foreground">
            {[x.vida_util_meses ? `vida útil ${x.vida_util_meses} meses (${(Math.round((1200 / x.vida_util_meses) * 10) / 10).toLocaleString('pt-BR')}% ao ano)` : 'não deprecia', x.residual_pct ? `residual ${x.residual_pct}%` : null,
              x.manutencao_meses ? `manutenção a cada ${x.manutencao_meses} meses` : null, x.conta_contabil ? `conta ${x.conta_contabil}` : null].filter(Boolean).join(' · ')}
          </span></span>
      )}
      formulario={(x, fim) => (
        <Formulario tabela="categoria" id={x?.id ?? null} onFim={fim}>
          <Campo rotulo="Nome" largo><input name="nome" required maxLength={80} defaultValue={x?.nome} className={inputClass} /></Campo>
          <Campo rotulo="Vida útil (meses)" ajuda="Vazio: não deprecia. Tabela da Receita: móveis 120, computadores 60, veículos 60."><input name="vida_util_meses" inputMode="numeric" defaultValue={x?.vida_util_meses ?? ''} className={inputClass} /></Campo>
          <Campo rotulo="Valor residual (%)"><input name="residual_pct" inputMode="decimal" defaultValue={x ? String(x.residual_pct).replace('.', ',') : '0'} className={inputClass} /></Campo>
          <Campo rotulo="Manutenção a cada (meses)"><input name="manutencao_meses" inputMode="numeric" defaultValue={x?.manutencao_meses ?? ''} className={inputClass} /></Campo>
          <Campo rotulo="Conta contábil" ajuda="Do plano de contas do contador."><input name="conta_contabil" maxLength={40} defaultValue={x?.conta_contabil ?? ''} className={inputClass} /></Campo>
          {x && <Situacao ativa={x.ativa} />}
        </Formulario>
      )} />
  )
}

export function Locais({ c, pode }: { c: CadastrosDoPatrimonio; pode: boolean }) {
  return (
    <Lista itens={c.locais} novo="Novo local" pode={pode}
      linha={(x) => <span><span className={`font-medium ${x.ativo ? '' : 'text-muted-foreground line-through'}`}>{x.nome}</span>{x.descricao && <span className="block text-xs text-muted-foreground">{x.descricao}</span>}</span>}
      formulario={(x, fim) => (
        <Formulario tabela="local" id={x?.id ?? null} onFim={fim}>
          <Campo rotulo="Nome"><input name="nome" required maxLength={80} defaultValue={x?.nome} placeholder="Ex.: Almoxarifado, Base Maracanã, Ambulância 01" className={inputClass} /></Campo>
          <Campo rotulo="Descrição"><input name="descricao" maxLength={300} defaultValue={x?.descricao ?? ''} className={inputClass} /></Campo>
          {x && <Campo rotulo="Situação"><select name="ativo" defaultValue={x.ativo ? 'sim' : 'nao'} className={inputClass}><option value="sim">Em uso</option><option value="nao">Desativado</option></select></Campo>}
        </Formulario>
      )} />
  )
}

export function Numeracao({ c, pode }: { c: CadastrosDoPatrimonio; pode: boolean }) {
  if (!pode) return <p className="text-sm text-muted-foreground">Prefixo {c.config.prefixo}; próximo número {c.config.proximo_numero}.</p>
  return (
    <Formulario tabela="config" id={null} onFim={() => undefined}>
      <Campo rotulo="Prefixo da plaqueta" ajuda={`O próximo bem será ${c.config.prefixo}-${String(c.config.proximo_numero).padStart(5, '0')}. Mudar o prefixo não renumera os que já existem.`}>
        <input name="prefixo" required maxLength={8} defaultValue={c.config.prefixo} className={`${inputClass} uppercase`} />
      </Campo>
      <span />
      <Campo rotulo="Texto do termo de responsabilidade" largo ajuda="Copiado em cada entrega: mudar aqui não altera termos já aceitos.">
        <textarea name="termo_padrao" required rows={5} maxLength={4000} defaultValue={c.config.termo_padrao} className={inputClass} />
      </Campo>
    </Formulario>
  )
}
