'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { sincronizarEscolaAgora } from '@/app/actions/escola'

/** Relê saldo e transações na Únicopag agora (o cron faz isso uma vez por dia). */
export function AtualizarAgora({ quando }: { quando: string | null }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [estado, setEstado] = useState<{ erro?: string; recado?: string }>({})
  return (
    <div className="flex flex-col items-end gap-1" id="atualizar-escola">
      <Button variant="outline" disabled={pendente} onClick={() => iniciar(async () => { setEstado(await sincronizarEscolaAgora()); router.refresh() })}>
        {pendente ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{pendente ? 'Lendo a Únicopag…' : 'Atualizar agora'}
      </Button>
      <p className="text-xs text-muted-foreground" role="status">
        {estado.erro ? <span className="text-destructive">{estado.erro}</span> : estado.recado ?? (quando ? `Atualizado ${quando}` : 'Ainda não atualizado')}
      </p>
    </div>
  )
}
