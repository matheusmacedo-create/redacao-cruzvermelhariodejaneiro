'use client'

import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { deleteProject } from '@/app/actions/editorial'

export function DeleteProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="destructive" size="lg" type="button" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" />
        Excluir projeto
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-project-title">
          <button type="button" className="absolute inset-0 bg-foreground/40" aria-label="Fechar" onClick={() => setOpen(false)} />
          <Card className="relative z-10 w-full max-w-md p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <h2 id="delete-project-title" className="text-lg font-semibold text-balance">Excluir “{projectName}”?</h2>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Fechar">
                <X className="size-4" />
              </Button>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              As pautas deste projeto não são apagadas — elas continuam existindo, só ficam sem projeto vinculado. Essa ação não pode ser desfeita.
            </p>
            <form action={deleteProject} className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <input type="hidden" name="id" value={projectId} />
              <Button type="button" variant="outline" size="lg" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" variant="destructive" size="lg">Excluir definitivamente</Button>
            </form>
          </Card>
        </div>
      )}
    </>
  )
}
