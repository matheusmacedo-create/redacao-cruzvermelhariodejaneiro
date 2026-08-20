'use client'

import { useState } from 'react'
import { AlertTriangle, Sparkles, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { resetWorkspaceData, seedDemoWorkspace } from '@/app/actions/admin'

export function DangerZone({ workspace }: { workspace: { id: string; name: string; kind: 'demo' | 'production' } }) {
  return (
    <div className="mt-8 flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Zona de risco</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspace.kind === 'production'
            ? 'Ações que apagam dados reais deste espaço de Produção. Use apenas quando quiser começar do zero.'
            : 'Ações para manter o espaço de Demonstração cheio de exemplos, sem afetar a Produção.'}
        </p>
      </div>

      {workspace.kind === 'demo' && (
        <Card className="flex flex-col gap-3 border-primary/30 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Sparkles className="size-4" /></span>
            <div>
              <p className="font-medium">Adicionar dados de demonstração</p>
              <p className="mt-0.5 text-sm text-muted-foreground">Cria projetos, pautas, matérias, aprovações e agendamentos de exemplo neste espaço.</p>
            </div>
          </div>
          <form action={seedDemoWorkspace}>
            <input type="hidden" name="workspaceId" value={workspace.id} />
            <Button type="submit" variant="outline" className="w-full sm:w-auto">Gerar dados de exemplo</Button>
          </form>
        </Card>
      )}

      <ResetCard workspace={workspace} />
    </div>
  )
}

function ResetCard({ workspace }: { workspace: { id: string; name: string; kind: 'demo' | 'production' } }) {
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const matches = confirmText.trim() === workspace.name

  return (
    <>
      <Card className="flex flex-col gap-3 border-destructive/30 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"><Trash2 className="size-4" /></span>
          <div>
            <p className="font-medium">Reiniciar dados de {workspace.kind === 'production' ? 'Produção' : 'Demonstração'}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Apaga projetos, pautas, matérias, aprovações, agendamentos, mensagens e arquivos deste espaço. Contas e pessoas continuam existindo.</p>
          </div>
        </div>
        <Button type="button" variant="destructive" className="w-full sm:w-auto shrink-0" onClick={() => setOpen(true)}>Reiniciar dados</Button>
      </Card>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="reset-workspace-title">
          <button type="button" className="absolute inset-0 bg-foreground/40" aria-label="Fechar" onClick={() => setOpen(false)} />
          <Card className="relative z-10 w-full max-w-md p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"><AlertTriangle className="size-4" /></span>
                <h2 id="reset-workspace-title" className="text-lg font-semibold text-balance">Apagar tudo em “{workspace.name}”?</h2>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Fechar"><X className="size-4" /></Button>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Isso apaga permanentemente todos os projetos, pautas, matérias, aprovações, mensagens, agendamentos e arquivos deste espaço. Não é possível desfazer. As contas de usuário continuam funcionando normalmente.
            </p>
            <label className="mt-4 block text-sm font-medium">
              Digite <span className="font-semibold">{workspace.name}</span> para confirmar
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-destructive focus:ring-2 focus:ring-destructive/30"
                autoComplete="off"
              />
            </label>
            <form action={resetWorkspaceData} className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <input type="hidden" name="confirmName" value={confirmText} />
              <Button type="button" variant="outline" size="lg" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" variant="destructive" size="lg" disabled={!matches}>Apagar tudo definitivamente</Button>
            </form>
          </Card>
        </div>
      )}
    </>
  )
}
