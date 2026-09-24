'use client'

import { useActionState, useState } from 'react'
import { Loader2, Mail } from 'lucide-react'
import { entrar, pedirCodigo, type EstadoDeEntrada } from '@/app/actions/membro'
import { botaoDoMembro, campoDoMembro } from './marca'

/**
 * Entrada em dois passos: e-mail → código de 6 dígitos. Sem senha.
 */
export function Entrar({ emailInicial }: { emailInicial: string }) {
  const [pedido, pedir, pedindo] = useActionState(pedirCodigo, { etapa: 'email', email: emailInicial } as EstadoDeEntrada)
  const [tentativa, tentar, entrando] = useActionState(entrar, { etapa: 'codigo' } as EstadoDeEntrada)
  const [trocar, setTrocar] = useState(false)
  const naEtapaDoCodigo = pedido.etapa === 'codigo' && !trocar

  if (!naEtapaDoCodigo) {
    return (
      <form action={(f) => { setTrocar(false); pedir(f) }} className="flex flex-col gap-4" id="form-email">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">E-mail do seu cadastro de voluntário
          <input id="m-email" name="email" type="email" required autoComplete="email" inputMode="email" defaultValue={pedido.email ?? emailInicial} className={campoDoMembro} />
        </label>
        {pedido.erro && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{pedido.erro}</p>}
        <button type="submit" disabled={pedindo} className={botaoDoMembro}>{pedindo ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}Receber código por e-mail</button>
        <p className="text-xs text-muted-foreground">Não tem senha: a cada acesso você recebe um código no e-mail cadastrado no Voluntariado.</p>
      </form>
    )
  }
  return (
    <form action={tentar} className="flex flex-col gap-4" id="form-codigo">
      <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-foreground/85">{pedido.aviso}</p>
      <input type="hidden" name="email" value={pedido.email ?? ''} />
      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">Código de 6 dígitos
        <input id="m-codigo" name="codigo" required inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} autoFocus
          className={`${campoDoMembro} text-center font-mono text-2xl tracking-[0.5em]`} />
      </label>
      {tentativa.erro && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{tentativa.erro}</p>}
      <button type="submit" disabled={entrando} className={botaoDoMembro}>{entrando && <Loader2 className="size-4 animate-spin" />}Entrar</button>
      <button type="button" onClick={() => setTrocar(true)} className="text-sm font-medium text-muted-foreground hover:text-foreground">Usar outro e-mail ou pedir novo código</button>
    </form>
  )
}
