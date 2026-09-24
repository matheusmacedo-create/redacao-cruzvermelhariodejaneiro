'use client'

import { useActionState, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/app/imprensa/comum'
import { criarCurso } from '@/app/actions/cursos'

export function NovoCurso() {
  const [aberto, setAberto] = useState(false)
  const [estado, enviar, enviando] = useActionState(criarCurso, {})
  if (!aberto) return <Button onClick={() => setAberto(true)}><Plus className="size-4" />Novo curso</Button>
  return (
    <form action={enviar} className="flex flex-wrap items-start gap-2" id="novo-curso">
      <div className="flex flex-col gap-1">
        <input name="titulo" required minLength={3} maxLength={160} autoFocus placeholder="Nome do curso" aria-label="Nome do curso" className={`${inputClass} w-64`} />
        {estado.erro && <span className="text-xs text-destructive" role="alert">{estado.erro}</span>}
      </div>
      <Button type="submit" disabled={enviando}>{enviando && <Loader2 className="size-4 animate-spin" />}Criar</Button>
      <Button type="button" variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button>
    </form>
  )
}
