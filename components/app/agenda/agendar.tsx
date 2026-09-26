'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createCalendarEvent } from '@/app/actions/editorial'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { Janela } from './janela'

const campo = 'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm'

/** O "Agendar" de sempre: uma data avulsa, com pauta integrada se quiser. */
export function Agendar({ aberta, aoFechar, diaInicial }: { aberta: boolean; aoFechar: () => void; diaInicial: string }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  return (
    <Janela aberta={aberta} aoFechar={aoFechar} titulo="Novo agendamento">
      <form
        action={(formData) => iniciar(async () => {
          setErro(null)
          try {
            await createCalendarEvent(formData)
            aoFechar()
            router.refresh()
          } catch (causa) {
            setErro(mensagemDoErro(causa, 'Não foi possível salvar o agendamento.'))
          }
        })}
        className="flex flex-col gap-4"
      >
        <label className="text-sm font-medium">Título<input required minLength={3} name="title" className={campo} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">Data<input required name="eventDate" type="date" defaultValue={diaInicial} key={diaInicial} className={campo} /></label>
          <label className="text-sm font-medium">Horário<input name="eventTime" type="time" className={campo} /></label>
        </div>
        <label className="text-sm font-medium">Tipo
          <select name="type" className={campo}>
            <option value="publicacao">Publicação</option>
            <option value="prazo">Prazo</option>
            <option value="atividade">Atividade</option>
          </select>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <input name="createPauta" type="checkbox" className="mt-0.5 size-4 accent-primary" />
          <span><strong className="block font-medium">Criar pauta integrada</strong><span className="text-muted-foreground">Cria uma pauta com este título e data e mantém acesso direto pelo calendário.</span></span>
        </label>
        {erro && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
        <Button type="submit" size="lg" disabled={pendente}>{pendente ? 'Salvando…' : 'Salvar agendamento'}</Button>
      </form>
    </Janela>
  )
}
