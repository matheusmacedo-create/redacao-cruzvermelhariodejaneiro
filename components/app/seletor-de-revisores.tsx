'use client'

import { UserCheck } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'

export type PessoaDoEspaco = { id: string; nome: string; iniciais: string; cor?: string }

/**
 * Escolha de quem precisa aprovar.
 *
 * Emite um `<input name="aprovadores">` por pessoa marcada, então funciona
 * dentro de qualquer `<form action={...}>` sem o formulário saber do estado.
 */
export function SeletorDeRevisores({
  pessoas,
  selecionados,
  onChange,
  titulo = 'Quem precisa aprovar',
  vazio = 'Não há outras pessoas neste espaço para aprovar.',
}: {
  pessoas: PessoaDoEspaco[]
  selecionados: string[]
  onChange: (ids: string[]) => void
  titulo?: string
  vazio?: string
}) {
  const alternar = (id: string) =>
    onChange(selecionados.includes(id) ? selecionados.filter((item) => item !== id) : [...selecionados, id])

  return (
    <div className="rounded-lg border border-border p-3 text-left">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <UserCheck className="size-3.5" />
        {titulo}
      </p>
      {pessoas.length ? (
        <div className="flex flex-wrap gap-2">
          {pessoas.map((pessoa) => {
            const marcado = selecionados.includes(pessoa.id)
            return (
              <button
                key={pessoa.id}
                type="button"
                aria-pressed={marcado}
                onClick={() => alternar(pessoa.id)}
                className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition-colors ${
                  marcado ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                <Avatar initials={pessoa.iniciais} color={pessoa.cor} size="sm" />
                {pessoa.nome}
              </button>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{vazio}</p>
      )}
      {selecionados.map((id) => <input key={id} type="hidden" name="aprovadores" value={id} />)}
    </div>
  )
}
