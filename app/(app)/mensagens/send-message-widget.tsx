'use client'

import { useState } from 'react'
import { MessageCirclePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Avatar, privateAvatarUrl } from '@/components/ui/avatar'
import { sendDirectMessage } from '@/app/actions/editorial'

type Colleague = { id: string; name: string; initials: string; color?: string; avatarPath?: string | null }

export function SendMessageWidget({ colleagues }: { colleagues: Colleague[] }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" size="lg" type="button" onClick={() => setOpen(true)}>
        <MessageCirclePlus className="size-4" />
        Enviar aviso
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="send-message-title">
          <button type="button" className="absolute inset-0 bg-background/80 backdrop-blur-sm" aria-label="Fechar" onClick={() => setOpen(false)} />
          <Card className="relative z-10 w-full max-w-md p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="send-message-title" className="text-lg font-semibold">Enviar aviso</h2>
                <p className="mt-1 text-sm text-muted-foreground">Para avisos rápidos que não são sobre uma matéria específica. A pessoa recebe como notificação, no sino no topo da tela — isso não cria uma conversa nesta lista.</p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Fechar">
                <X className="size-4" />
              </Button>
            </div>
            <form
              action={sendDirectMessage}
              className="mt-4 flex flex-col gap-3"
              onSubmit={() => setOpen(false)}
            >
              <label className="text-sm font-medium">
                Para
                <select
                  name="recipientId"
                  required
                  defaultValue=""
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                >
                  <option value="" disabled>
                    Selecione uma pessoa
                  </option>
                  {colleagues.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
              {colleagues.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {colleagues.slice(0, 6).map((person) => (
                    <span key={person.id} className="flex items-center gap-1.5 rounded-full border border-border py-1 pl-1 pr-2.5 text-xs">
                      <Avatar initials={person.initials} color={person.color} src={privateAvatarUrl(person.avatarPath)} size="xs" />
                      {person.name.split(' ')[0]}
                    </span>
                  ))}
                </div>
              )}
              <label className="text-sm font-medium">
                Mensagem
                <textarea
                  name="body"
                  required
                  maxLength={2000}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                  placeholder="Escreva sua mensagem…"
                />
              </label>
              <Button type="submit" className="mt-1 self-end" disabled={!colleagues.length}>
                Enviar
              </Button>
            </form>
          </Card>
        </div>
      )}
    </>
  )
}
