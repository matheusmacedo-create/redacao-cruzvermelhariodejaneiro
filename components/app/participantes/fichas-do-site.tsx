'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Download, Loader2, RefreshCw } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { buscarFichasDoSiteAgora, gerarCodigoNoSite } from '@/app/actions/participantes'

/**
 * As fichas do cadastro de voluntários do site (lib/voluntariado/fichas-do-site.ts): o botão
 * que busca as novas na hora, na aba Inscrições pendentes, e o cartão do código de aprovação
 * que o site devolve quando a inscrição é aprovada aqui.
 */

export function BuscarFichasDoSite({ ultimaBusca }: { ultimaBusca: string | null }) {
  const router = useRouter()
  const [ocupado, iniciar] = useTransition()
  const [mensagem, setMensagem] = useState<{ texto: string; erro: boolean } | null>(null)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-ajuda="voluntarios.fichas-do-site">
      <p className="text-sm text-muted-foreground">
        As fichas do cadastro do site chegam aqui sozinhas, a cada envio e numa conferência diária.
        {ultimaBusca ? ` Última busca: ${ultimaBusca}.` : ''}
      </p>
      <span className="flex flex-col items-end gap-1">
        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => iniciar(async () => {
          setMensagem(null)
          const r = await buscarFichasDoSiteAgora()
          setMensagem(r.erro ? { texto: r.erro, erro: true } : { texto: r.mensagem ?? 'Pronto.', erro: false })
          router.refresh()
        })}>
          {ocupado ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}Buscar fichas do site
        </Button>
        {mensagem && <p className={`text-xs ${mensagem.erro ? 'text-destructive' : 'text-muted-foreground'}`} role={mensagem.erro ? 'alert' : 'status'}>{mensagem.texto}</p>}
      </span>
    </div>
  )
}

export function CodigoDeAprovacaoDoSite({ participanteId, codigo, qr, url, whatsapp, mensagem, podeGerar, arquivo }: {
  participanteId: string; codigo: string | null; qr: string | null; url: string | null; whatsapp: string | null; mensagem: string | null; podeGerar: boolean; arquivo: string
}) {
  const router = useRouter()
  const [ocupado, iniciar] = useTransition()
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)
  if (!codigo) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p className="text-muted-foreground">A inscrição foi aprovada, mas o site ainda não devolveu o código de aprovação (o site pode ter ficado fora do ar, ou a ficha estava sem CPF: preencha o CPF em “Editar cadastro” e tente de novo).</p>
        {podeGerar && (
          <Button size="sm" className="w-fit" disabled={ocupado} onClick={() => iniciar(async () => {
            setErro('')
            const r = await gerarCodigoNoSite(participanteId)
            if (r.erro) setErro(r.erro)
            router.refresh()
          })}>{ocupado ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}Gerar código no site</Button>
        )}
        {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
      </div>
    )
  }
  const formatado = `${codigo.slice(0, 4)}-${codigo.slice(4)}`
  return (
    <div className="flex flex-wrap items-start gap-4">
      {qr && <img src={qr} alt={`QR code que abre a conferência do código ${formatado}`} className="size-40 shrink-0 rounded-lg border border-border bg-white p-2" />}
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
        <p className="text-2xl font-extrabold tracking-wider">{formatado}</p>
        {url && <p className="text-muted-foreground">O QR code abre <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">{url.replace(/^https?:\/\//, '')}</a>, onde qualquer pessoa confere o nome, o CPF mascarado e a data da aprovação.</p>}
        <div className="flex flex-wrap gap-2">
          {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: 'sm' })}>Enviar pelo WhatsApp</a>}
          {qr && <a href={qr} download={arquivo} className={buttonVariants({ size: 'sm', variant: 'outline' })}><Download className="size-3.5" />Baixar o QR code</a>}
          {mensagem && (
            <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(mensagem).then(() => setCopiado(true)) }}>
              <Copy className="size-3.5" />{copiado ? 'Mensagem copiada' : 'Copiar a mensagem'}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Para cancelar o código, use o portal do site (ficha do voluntário → “Cancelar o código”).</p>
      </div>
    </div>
  )
}
