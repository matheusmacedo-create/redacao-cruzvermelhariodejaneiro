'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { salvarRegrasDeCompra } from '@/app/actions/compras'
import { valorNoCampo } from '@/lib/financeiro/regras'
import { campo, Rotulo } from './comum'

/**
 * As faixas de compra da filial: até quanto basta uma proposta, quantas
 * propostas acima disso e a partir de quanto a Diretoria também aprova.
 * Se a filial tiver um Regulamento de Compras, os números vêm dele.
 */
export function RegrasDeCompra({ inicial, setores, pode }: {
  inicial: { limite_simples: number; limite_diretoria: number; cotacoes_minimas: number; diretoria_setor_id: string | null }
  setores: { id: string; nome: string }[]
  pode: boolean
}) {
  const router = useRouter()
  const [simples, setSimples] = useState(valorNoCampo(inicial.limite_simples))
  const [diretoria, setDiretoria] = useState(valorNoCampo(inicial.limite_diretoria))
  const [minimo, setMinimo] = useState(String(inicial.cotacoes_minimas))
  const [setor, setSetor] = useState(inicial.diretoria_setor_id ?? '')
  const [recado, setRecado] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [salvando, iniciar] = useTransition()
  return (
    <form className="flex flex-col gap-4" data-regras-de-compra
      onSubmit={(e) => {
        e.preventDefault()
        iniciar(async () => {
          const r = await salvarRegrasDeCompra({ limite_simples: simples, limite_diretoria: diretoria, cotacoes_minimas: minimo, diretoria_setor_id: setor })
          setRecado(r.erro ? { tom: 'erro', texto: r.erro } : { tom: 'ok', texto: 'Regras salvas. Valem para os próximos envios para aprovação.' })
          if (!r.erro) router.refresh()
        })
      }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Rotulo texto="Compra simples até (R$)" ajuda="Até este valor, basta uma proposta.">
          <input value={simples} onChange={(e) => setSimples(e.target.value)} inputMode="decimal" disabled={!pode} className={campo} />
        </Rotulo>
        <Rotulo texto="Propostas exigidas acima disso" ajuda="O manual da Cruz Vermelha pede no mínimo 3.">
          <input type="number" min={1} max={10} value={minimo} onChange={(e) => setMinimo(e.target.value)} disabled={!pode} className={campo} />
        </Rotulo>
        <Rotulo texto="Diretoria aprova acima de (R$)" ajuda="Acima deste valor, além do Financeiro, alguém da Diretoria aprova.">
          <input value={diretoria} onChange={(e) => setDiretoria(e.target.value)} inputMode="decimal" disabled={!pode} className={campo} />
        </Rotulo>
        <Rotulo texto="Setor da Diretoria" ajuda="Quem é deste setor aprova como Diretoria. Setor sem ninguém: os administradores.">
          <select value={setor} onChange={(e) => setSetor(e.target.value)} disabled={!pode} className={campo}>
            <option value="">O setor chamado “Diretoria”</option>
            {setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </Rotulo>
      </div>
      <p className="text-xs text-muted-foreground">
        Menos propostas que o exigido, ou escolher uma que não é a mais barata, pede justificativa escrita — ela fica no pedido e no histórico, para a prestação de contas.
      </p>
      {recado && <p className={`text-sm ${recado.tom === 'erro' ? 'text-destructive' : 'text-success'}`} role={recado.tom === 'erro' ? 'alert' : 'status'}>{recado.texto}</p>}
      {pode && <Button type="submit" className="self-end" disabled={salvando}>{salvando && <Loader2 className="size-4 animate-spin" />}Salvar regras de compra</Button>}
    </form>
  )
}
