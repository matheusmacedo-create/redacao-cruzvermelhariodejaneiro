'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Link2, Loader2, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { pedirFichaAPessoa } from '@/app/actions/equipe'

/**
 * "Pedir para a pessoa completar": gera o link pessoal da ficha (uso único,
 * 7 dias) e manda pelo WhatsApp, ou só gera para copiar. Os documentos entram
 * no link só se quem pede tem acesso a documentos e marca a caixa. Banco
 * nunca vai pelo link.
 */
export function PedirFicha({ membroId, faltam, podeDocumentos, linkAberto }: { membroId: string; faltam: string[]; podeDocumentos: boolean; linkAberto: string | null }) {
  const router = useRouter()
  const [documentos, setDocumentos] = useState(false)
  const [recado, setRecado] = useState<{ erro: boolean; texto: string } | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [ocupado, iniciar] = useTransition()

  const pedir = (porWhatsapp: boolean) => iniciar(async () => {
    setRecado(null); setCopiado(false)
    const r = await pedirFichaAPessoa(membroId, { documentos, porWhatsapp })
    if (r.erro) { setRecado({ erro: true, texto: r.erro }); return }
    setRecado({ erro: false, texto: r.recado ?? 'Link gerado.' })
    setLink(r.link ?? null)
    router.refresh()
  })
  const copiar = async () => {
    if (!link) return
    try { await navigator.clipboard.writeText(link); setCopiado(true) } catch { setCopiado(false) }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4" data-ajuda="rh.pedir-ficha">
      <div className="text-sm">
        <p className="font-medium">A própria pessoa completa a ficha</p>
        <p className="text-muted-foreground">
          {faltam.length ? <>Falta: {faltam.join(', ')}.</> : 'Os dados pessoais estão completos.'}{' '}
          Um link pessoal, que vale uma vez e por 7 dias, vai pelo WhatsApp; ela preenche sem login.
          {linkAberto && <> Há um link aberto desde {linkAberto}; pedir de novo cancela o anterior.</>}
        </p>
      </div>
      {podeDocumentos && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={documentos} onChange={(e) => setDocumentos(e.target.checked)} />
          <span>Pedir também os números dos documentos (CPF, RG, PIS, CTPS…). Dados bancários nunca vão pelo link.</span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={ocupado} onClick={() => pedir(true)}>
          {ocupado ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}Mandar pelo WhatsApp
        </Button>
        <Button variant="ghost" disabled={ocupado} onClick={() => pedir(false)}><Link2 className="size-4" />Só gerar o link</Button>
      </div>
      {recado && <p role={recado.erro ? 'alert' : 'status'} className={recado.erro ? 'text-sm text-destructive' : 'text-sm text-(--success-texto)'}>{recado.texto}</p>}
      {link && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <code className="max-w-full truncate rounded bg-muted px-2 py-1 text-xs">{link}</code>
          <Button variant="outline" size="sm" onClick={copiar}><Copy className="size-3.5" />{copiado ? 'Copiado' : 'Copiar o link'}</Button>
        </div>
      )}
    </div>
  )
}
