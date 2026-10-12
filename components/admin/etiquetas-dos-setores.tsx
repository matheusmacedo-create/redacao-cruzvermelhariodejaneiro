'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Filter, Loader2, Plus, Tag, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { apagarFiltroDaCaixa, criarFiltroDaCaixa, definirEtiquetaDaCaixa } from '@/app/actions/correio'
import { descricaoDoFiltro, type Criterio } from '@/lib/correio/filtros'

export type CaixaComEtiqueta = { id: string; email: string; setor: string; rotuloId: string | null }
export type EtiquetaNaTela = { id: string; nome: string }
export type FiltroNaTela = { id: string; criterio: Criterio; poeEtiquetas: string[] }

const campo = 'rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

/**
 * 4. O que leva e-mail a cada caixa, além do endereço: uma etiqueta do Gmail
 * e os filtros que a põem. Os endereços dos setores são apelidos de uma conta
 * só, e encaminhar de um para o outro não funciona — a etiqueta faz esse
 * papel (lib/correio/filtros.ts). Exemplo: o que chega em contato@ com
 * "voluntariado" no assunto ganha a etiqueta Voluntariado e aparece também
 * na caixa do Voluntariado.
 */
export function EtiquetasDosSetores({ caixas, etiquetas, filtros, erro }: {
  caixas: CaixaComEtiqueta[]
  etiquetas: EtiquetaNaTela[]
  filtros: FiltroNaTela[]
  /** O Gmail não respondeu (desconectado, permissão, cota): a seção mostra o motivo. */
  erro: string | null
}) {
  const router = useRouter()
  const [recado, setRecado] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [ocupado, rodar] = useTransition()
  const executar = (acao: () => Promise<{ erro?: string; recado?: string }>) => rodar(async () => {
    const r = await acao()
    setRecado(r.erro ? { tom: 'erro', texto: r.erro } : r.recado ? { tom: 'ok', texto: r.recado } : null)
    router.refresh()
  })

  return (
    <Card className="flex flex-col gap-3 p-5" data-ajuda="configuracoes.etiquetas">
      <div>
        <p className="font-medium">4. O que chega a cada caixa (etiquetas e filtros do Gmail)</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Cada caixa já recebe o que vai para o endereço dela. Para levar até ela outros e-mails (por exemplo, o que chega em contato@ falando de voluntariado),
          escolha uma etiqueta para a caixa e crie filtros que a ponham. O filtro roda no próprio Gmail, na hora em que o e-mail chega.
        </p>
      </div>
      {recado && (
        <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${recado.tom === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-700'}`} role={recado.tom === 'erro' ? 'alert' : 'status'}>
          {recado.tom === 'erro' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}{recado.texto}
        </p>
      )}
      {erro ? (
        <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{erro}</p>
      ) : !caixas.length ? (
        <p className="text-sm text-muted-foreground">Ative ao menos um endereço com setor (passo 3) para ligar etiquetas.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {caixas.map((c) => (
            <Linha key={c.id} caixa={c} etiquetas={etiquetas} filtros={c.rotuloId ? filtros.filter((f) => f.poeEtiquetas.includes(c.rotuloId!)) : []}
              ocupado={ocupado} executar={executar} />
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        A etiqueta continua visível no Gmail de contato@, como sempre. Uma conversa com a etiqueta aparece inteira na caixa do setor, com as respostas.
        Apagar um filtro não tira a etiqueta do que já foi etiquetado.
      </p>
    </Card>
  )
}

function Linha({ caixa, etiquetas, filtros, ocupado, executar }: {
  caixa: CaixaComEtiqueta
  etiquetas: EtiquetaNaTela[]
  filtros: FiltroNaTela[]
  ocupado: boolean
  executar: (a: () => Promise<{ erro?: string; recado?: string }>) => void
}) {
  const [novo, setNovo] = useState(false)
  const sugestao = caixa.setor.replace(/\s*\/\s*/g, ' e ')
  const escolher = (valor: string) => {
    if (valor === '__nova') {
      const nome = prompt('Nome da etiqueta nova no Gmail:', sugestao)
      if (nome?.trim()) executar(() => definirEtiquetaDaCaixa(caixa.id, `nova:${nome.trim()}`))
      return
    }
    executar(() => definirEtiquetaDaCaixa(caixa.id, valor))
  }

  function criar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    f.set('caixaId', caixa.id)
    f.set('aplicar', String(f.get('aplicar') === 'on'))
    executar(async () => {
      const r = await criarFiltroDaCaixa(f)
      if (!r.erro) setNovo(false)
      return r
    })
  }

  return (
    <li className="flex flex-col gap-2 p-3" data-caixa-etiqueta={caixa.email}>
      <div className="flex flex-wrap items-center gap-3">
        <Tag className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{caixa.setor}</p>
          <p className="truncate text-xs text-muted-foreground">{caixa.email}</p>
        </div>
        <select value={caixa.rotuloId ?? ''} disabled={ocupado} onChange={(e) => escolher(e.target.value)} aria-label={`Etiqueta de ${caixa.email}`} className={campo}>
          <option value="">Sem etiqueta (só o endereço)</option>
          {etiquetas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          <option value="__nova">+ Criar etiqueta nova…</option>
        </select>
      </div>
      {caixa.rotuloId && (
        <div className="flex flex-col gap-2 pl-7">
          {filtros.length ? (
            <ul className="flex flex-col gap-1">
              {filtros.map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-sm">
                  <Filter className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{descricaoDoFiltro(f.criterio)}</span>
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={ocupado} aria-label="Apagar filtro"
                    onClick={() => { if (confirm('Apagar este filtro no Gmail?')) executar(() => apagarFiltroDaCaixa(caixa.id, f.id)) }}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-muted-foreground">Nenhum filtro põe esta etiqueta ainda.</p>}
          {novo ? (
            <form onSubmit={criar} className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-2">
              <input name="de" placeholder="De (ex.: @prefeitura.rj.gov.br)" maxLength={200} className={campo} />
              <input name="para" placeholder="Para (ex.: contato@…)" maxLength={200} className={campo} />
              <input name="assunto" placeholder="Assunto contém (ex.: voluntariado)" maxLength={200} className={campo} />
              <input name="palavras" placeholder="Tem as palavras (busca do Gmail)" maxLength={200} className={campo} />
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="aplicar" defaultChecked className="size-4" />Aplicar também ao que já está na conta (até 500 mensagens)
              </label>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="ghost" onClick={() => setNovo(false)}>Cancelar</Button>
                <Button type="submit" disabled={ocupado}>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <Filter className="size-4" />}Criar filtro</Button>
              </div>
            </form>
          ) : (
            <Button size="sm" variant="outline" className="self-start" disabled={ocupado} onClick={() => setNovo(true)}><Plus className="size-4" />Novo filtro</Button>
          )}
        </div>
      )}
    </li>
  )
}
