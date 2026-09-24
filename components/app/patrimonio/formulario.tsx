'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/app/imprensa/comum'
import { salvarBem } from '@/app/actions/patrimonio'
import { ESTADOS, ORIGENS, type Estado } from '@/lib/patrimonio/regras'
import type { Bem, CadastrosDoPatrimonio } from '@/lib/patrimonio/acesso'

function Campo({ rotulo, ajuda, children, largo }: { rotulo: string; ajuda?: string; children: React.ReactNode; largo?: boolean }) {
  return <label className={`flex flex-col gap-1 text-sm font-medium ${largo ? 'sm:col-span-2' : ''}`}>{rotulo}{children}{ajuda && <span className="text-xs font-normal text-muted-foreground">{ajuda}</span>}</label>
}

const valorNoCampo = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

/** O cadastro do bem. A plaqueta é gerada pelo banco na criação (prefixo + número). */
export function FormularioDoBem({ c, b, hoje }: { c: CadastrosDoPatrimonio; b?: Bem; hoje: string }) {
  const router = useRouter()
  const [estado, enviar, enviando] = useActionState(salvarBem.bind(null, b?.id ?? null), {})
  useEffect(() => { if (estado.id) router.push(`/patrimonio/${estado.id}`) }, [estado.id, router])
  const [origem, setOrigem] = useState(b?.origem ?? 'compra')
  const [categoria, setCategoria] = useState(b?.categoria_id ?? '')
  const cat = c.categorias.find((k) => k.id === categoria)
  return (
    <form action={enviar} className="flex flex-col gap-5" id="form-bem">
      {!b && <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">Plaqueta: <span className="font-mono font-semibold">{c.config.prefixo}-{String(c.config.proximo_numero).padStart(5, '0')}</span> <span className="text-muted-foreground">(gerada ao salvar; imprima a etiqueta com QR depois)</span></p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome do bem" largo><input name="nome" required minLength={2} maxLength={160} defaultValue={b?.nome} placeholder="Ex.: Desfibrilador Philips HS1" className={inputClass} /></Campo>
        <Campo rotulo="Categoria" ajuda={cat ? `${cat.vida_util_meses ? `Vida útil ${cat.vida_util_meses} meses` : 'Não deprecia'}${cat.manutencao_meses ? ` · manutenção a cada ${cat.manutencao_meses} meses` : ''}` : undefined}>
          <select name="categoria_id" required value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inputClass}>
            <option value="" disabled>Escolha…</option>{c.categorias.filter((k) => k.ativa || k.id === b?.categoria_id).map((k) => <option key={k.id} value={k.id}>{k.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Onde está">
          <select name="local_id" defaultValue={b?.local_id ?? c.locais[0]?.id ?? ''} className={inputClass}>
            <option value="">Sem local</option>{c.locais.filter((l) => l.ativo || l.id === b?.local_id).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Marca"><input name="marca" maxLength={80} defaultValue={b?.marca ?? ''} className={inputClass} /></Campo>
        <Campo rotulo="Modelo"><input name="modelo" maxLength={80} defaultValue={b?.modelo ?? ''} className={inputClass} /></Campo>
        <Campo rotulo="Número de série"><input name="numero_serie" maxLength={80} defaultValue={b?.numero_serie ?? ''} className={inputClass} /></Campo>
        <Campo rotulo="Plaqueta antiga" ajuda="Se o bem já tinha número de patrimônio, guarde aqui — a busca acha pelos dois."><input name="plaqueta_antiga" maxLength={40} defaultValue={b?.plaqueta_antiga ?? ''} className={inputClass} /></Campo>
        <Campo rotulo="Situação">
          <select name="situacao" defaultValue={b?.situacao === 'baixado' ? 'em_uso' : b?.situacao ?? 'em_uso'} className={inputClass}>
            <option value="em_uso">Em uso</option><option value="reserva">Reserva (guardado)</option><option value="em_manutencao">Em manutenção</option>
          </select>
        </Campo>
        <Campo rotulo="Estado">
          <select name="estado" defaultValue={b?.estado ?? 'bom'} className={inputClass}>{(Object.keys(ESTADOS) as Estado[]).map((e) => <option key={e} value={e}>{ESTADOS[e]}</option>)}</select>
        </Campo>
      </div>

      <fieldset className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Aquisição</legend>
        <Campo rotulo="Origem">
          <select name="origem" value={origem} onChange={(e) => setOrigem(e.target.value)} className={inputClass}>{Object.entries(ORIGENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Campo>
        <Campo rotulo="Data"><input type="date" name="aquisicao_em" max={hoje} defaultValue={b?.aquisicao_em ?? ''} className={inputClass} /></Campo>
        <Campo rotulo={origem === 'doacao' ? 'Valor de mercado' : 'Valor pago'} ajuda={origem === 'doacao' ? 'Bem doado entra pelo valor de mercado (ITG 2002).' : origem === 'comodato' ? 'Comodato não é da filial: não deprecia.' : undefined}>
          <input name="valor" inputMode="decimal" defaultValue={valorNoCampo(b?.valor)} placeholder="0,00" required={origem === 'doacao'} className={inputClass} />
        </Campo>
        <Campo rotulo={origem === 'doacao' ? 'Doador' : 'Fornecedor'}><input name="fornecedor" maxLength={160} defaultValue={b?.fornecedor ?? ''} className={inputClass} /></Campo>
        <Campo rotulo="Nota fiscal / documento"><input name="nota_fiscal" maxLength={80} defaultValue={b?.nota_fiscal ?? ''} className={inputClass} /></Campo>
        <Campo rotulo="Garantia até"><input type="date" name="garantia_ate" defaultValue={b?.garantia_ate ?? ''} className={inputClass} /></Campo>
        {c.fontes.length > 0 && (
          <Campo rotulo="Comprado com" ajuda="Bem comprado com dinheiro de convênio fica ligado a ele: o financiador pergunta onde está.">
            <select name="fonte_id" defaultValue={b?.fonte_id ?? ''} className={inputClass}>
              <option value="">—</option>{c.fontes.map((f) => <option key={f.id} value={f.id}>{f.nome}{f.restrita ? ' (com destino)' : ''}</option>)}
            </select>
          </Campo>
        )}
        {c.projetos.length > 0 && (
          <Campo rotulo="Projeto">
            <select name="projeto_id" defaultValue={b?.projeto_id ?? ''} className={inputClass}><option value="">—</option>{c.projetos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </Campo>
        )}
        {b?.lancamento_id && <input type="hidden" name="lancamento_id" value={b.lancamento_id} />}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Manutenção a cada (meses)" ajuda={cat?.manutencao_meses ? `Vazio: segue a categoria (${cat.manutencao_meses} meses).` : 'Vazio: sem manutenção periódica.'}>
          <input name="manutencao_meses" inputMode="numeric" maxLength={3} defaultValue={b?.manutencao_meses ?? ''} className={inputClass} />
        </Campo>
        <Campo rotulo="Descrição" largo><textarea name="descricao" rows={2} maxLength={2000} defaultValue={b?.descricao ?? ''} className={inputClass} /></Campo>
        <Campo rotulo="Observação" largo><textarea name="observacao" rows={2} maxLength={2000} defaultValue={b?.observacao ?? ''} className={inputClass} /></Campo>
      </div>
      {estado.erro && <p className="text-sm text-destructive" role="alert">{estado.erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" disabled={enviando}>{enviando && <Loader2 className="size-4 animate-spin" />}{b ? 'Salvar' : 'Cadastrar bem'}</Button>
      </div>
    </form>
  )
}
