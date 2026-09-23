'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { removerChaveDeIntegracao, salvarChaveDeIntegracao } from '@/app/actions/integracoes'

export type ChaveNaTela = {
  servico: string
  nome: string
  campos: readonly { id: string; rotulo: string; secreto: boolean }[]
  origem: 'cofre' | 'ambiente' | null
  atualizadaEm: string | null
  painel: string
}

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

/**
 * As chaves das ferramentas externas.
 *
 * O campo é de escrita só: a chave gravada nunca volta para a tela, nem
 * mascarada. Para trocar, cola-se a nova por cima.
 */
export function Integracoes({ chaves }: { chaves: ChaveNaTela[] }) {
  return (
    <div className="mt-8 flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Integrações</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Chaves de API das ferramentas usadas pela Redação. Ficam guardadas criptografadas no cofre do banco e valem na hora, sem republicar.
          Depois de salva, a chave não aparece mais para ninguém.
        </p>
      </div>
      {chaves.map((c) => <CartaoDaChave key={c.servico} chave={c} />)}
    </div>
  )
}

function CartaoDaChave({ chave }: { chave: ChaveNaTela }) {
  const router = useRouter()
  const [valor, setValor] = useState('')
  const [campos, setCampos] = useState<Record<string, string>>({})
  const multiplo = chave.campos.length > 0
  const pronto = multiplo ? chave.campos.every((c) => (campos[c.id] ?? '').trim().length >= 8) : valor.trim().length >= 8
  const [recado, setRecado] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [ocupado, rodar] = useTransition()

  function salvar() {
    setRecado(null)
    rodar(async () => {
      const form = new FormData()
      form.set('servico', chave.servico)
      form.set('valor', valor)
      for (const c of chave.campos) form.set(c.id, campos[c.id] ?? '')
      const r = await salvarChaveDeIntegracao(form)
      setRecado(r.erro ? { tom: 'erro', texto: r.erro } : { tom: 'ok', texto: r.recado ?? 'Pronto.' })
      if (!r.erro) { setValor(''); setCampos({}); router.refresh() }
    })
  }

  function remover() {
    if (!confirm(`Remover a chave da ${chave.nome} do cofre?`)) return
    setRecado(null)
    rodar(async () => {
      const form = new FormData()
      form.set('servico', chave.servico)
      const r = await removerChaveDeIntegracao(form)
      setRecado(r.erro ? { tom: 'erro', texto: r.erro } : { tom: 'ok', texto: r.recado ?? 'Pronto.' })
      if (!r.erro) router.refresh()
    })
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><KeyRound className="size-4" /></span>
          <div>
            <p className="font-medium">{chave.nome}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {chave.origem === 'cofre' && chave.atualizadaEm
                ? `Configurada no cofre em ${quando.format(new Date(chave.atualizadaEm))}.`
                : chave.origem === 'ambiente'
                  ? 'Usando a variável de ambiente da Vercel. Salvar aqui passa a valer no lugar dela.'
                  : 'Não configurada.'}
            </p>
          </div>
        </div>
        {chave.origem === 'cofre' && (
          <Button variant="ghost" size="sm" onClick={remover} disabled={ocupado} className="text-destructive">
            <Trash2 className="size-4" />Remover
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {multiplo ? chave.campos.map((c) => (
          <input
            key={c.id}
            type={c.secreto ? 'password' : 'text'}
            autoComplete="off"
            spellCheck={false}
            value={campos[c.id] ?? ''}
            onChange={(e) => setCampos((atual) => ({ ...atual, [c.id]: e.target.value }))}
            disabled={ocupado}
            placeholder={c.rotulo}
            aria-label={c.rotulo}
            className="min-w-56 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        )) : <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          disabled={ocupado}
          placeholder={chave.origem ? 'Colar uma chave nova para substituir' : 'Colar a chave'}
          aria-label={`Chave da ${chave.nome}`}
          className="min-w-56 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
        />}
        <Button onClick={salvar} disabled={ocupado || !pronto}>
          {ocupado ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          Salvar no cofre
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        A chave fica em <a href={chave.painel} target="_blank" rel="noreferrer" className="text-primary hover:underline">{chave.painel.replace(/^https:\/\//, '')}</a>.
        Nunca cole chave no chat, em e-mail ou em documento — só aqui.
      </p>
      {recado && <p className={`text-xs ${recado.tom === 'erro' ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-500'}`}>{recado.texto}</p>}
    </Card>
  )
}
