'use client'

import { useState } from 'react'
import { AlertTriangle, Link2, Loader2, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FacebookIcon, InstagramIcon } from './platform-icon'
import { desconectarCanal } from '@/app/actions/social'
import { PLATFORM_LABEL, type SocialChannel } from '@/lib/meta/types'
import { cn } from '@/lib/utils'

/**
 * Canais conectados do Facebook e do Instagram.
 *
 * Só admin conecta ou desconecta: quem controla o canal controla o que sai em
 * nome da Cruz Vermelha.
 */

const icone = { facebook: FacebookIcon, instagram: InstagramIcon } as const

function ChannelRow({ canal, isAdmin }: { canal: SocialChannel; isAdmin: boolean }) {
  const [removendo, setRemovendo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const Icone = icone[canal.platform]
  const precisaReconectar = canal.status !== 'active'

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          canal.platform === 'instagram' ? 'bg-primary/10 text-primary' : 'bg-info/12 text-info',
        )}
      >
        <Icone className="size-[18px]" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{canal.account_name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {PLATFORM_LABEL[canal.platform]}
          {canal.username ? ` · @${canal.username}` : ''}
        </p>
      </div>

      {precisaReconectar ? (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning-foreground">
          <AlertTriangle className="size-3" />
          Reconectar
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-success/14 px-2 py-0.5 text-xs font-medium text-success">
          <span className="size-1.5 rounded-full bg-success" />
          Conectado
        </span>
      )}

      {isAdmin && (
        confirmando ? (
          <span className="flex items-center gap-1.5">
            <Button
              variant="destructive"
              size="sm"
              disabled={removendo}
              onClick={async () => {
                setRemovendo(true)
                setErro(null)
                try {
                  const form = new FormData()
                  form.set('channelId', canal.id)
                  await desconectarCanal(form)
                } catch (e) {
                  setErro(e instanceof Error ? e.message : 'Não foi possível desconectar.')
                  setRemovendo(false)
                  setConfirmando(false)
                }
              }}
            >
              {removendo ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Confirmar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmando(false)} disabled={removendo}>
              Cancelar
            </Button>
          </span>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmando(true)}>
            <Unlink className="size-3.5" />
            Desconectar
          </Button>
        )
      )}

      {erro && <p className="w-full text-xs text-destructive">{erro}</p>}
      {precisaReconectar && canal.last_error && (
        <p className="w-full text-xs text-muted-foreground">{canal.last_error}</p>
      )}
    </div>
  )
}

export function ChannelsPanel({
  canais,
  isAdmin,
  aviso,
}: {
  canais: SocialChannel[]
  isAdmin: boolean
  aviso?: { tipo: 'ok' | 'erro'; mensagem: string } | null
}) {
  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">Canais de publicação</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Contas do Facebook e do Instagram autorizadas a receber publicações desta Redação.
          </p>
        </div>
        {isAdmin && (
          <Button size="lg" render={<a href="/api/social/oauth/start" />}>
            <Link2 className="size-4" />
            Conectar Facebook/Instagram
          </Button>
        )}
      </div>

      {aviso && (
        <p
          className={cn(
            'border-b border-border px-5 py-3 text-sm',
            aviso.tipo === 'ok' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
          )}
        >
          {aviso.mensagem}
        </p>
      )}

      {canais.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhum canal conectado ainda.</p>
          <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
            Para publicar no Instagram, a conta precisa ser Business ou Creator e estar vinculada a uma Página do
            Facebook no Meta Business.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {canais.map((canal) => (
            <ChannelRow key={canal.id} canal={canal} isAdmin={isAdmin} />
          ))}
        </div>
      )}
    </Card>
  )
}
