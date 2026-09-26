'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Eye, Loader2, MessageCircle, Share2, ShieldCheck, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AssinaturaDesenhada } from '@/components/autorizacao/assinatura-desenhada'
import { assinaturaDe, encerrarColeta, marcarFotosAutorizadas, revogarAutorizacao } from '@/app/actions/autorizacoes-de-imagem'

export function CompartilharLink({ link, titulo }: { link: string; titulo: string }) {
  const [copiado, setCopiado] = useState(false)
  const texto = `Olá! Estas são as fotos de "${titulo}" da Cruz Vermelha RJ. Para podermos divulgá-las, veja as fotos e assine a autorização por este link (leva um minuto): ${link}`
  async function copiar() {
    try { await navigator.clipboard.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* sem permissão: o campo está à vista para copiar */ }
  }
  async function compartilhar() {
    // Sem o menu de compartilhar do sistema (computador), copia o recado inteiro.
    if (typeof navigator.share !== 'function') { try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* sem permissão */ } return }
    try { await navigator.share({ title: 'Autorização de uso de imagem', text: texto }) } catch { /* cancelado */ }
  }
  return (
    <div className="flex flex-col gap-2">
      <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link de autorização" className="h-10 w-full rounded-lg border border-border bg-muted/40 px-3 font-mono text-xs" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={copiar}>{copiado ? <Check className="size-4" /> : <Copy className="size-4" />}{copiado ? 'Copiado' : 'Copiar link'}</Button>
        <Button variant="outline" render={<a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer" />}><MessageCircle className="size-4" />Mandar no WhatsApp</Button>
        <Button type="button" variant="outline" onClick={compartilhar}><Share2 className="size-4" />Compartilhar</Button>
      </div>
    </div>
  )
}

export function AcoesDaColeta({ id, aberto, podeMarcar, pendentes }: { id: string; aberto: boolean; podeMarcar: boolean; pendentes: number }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState('')
  const [erro, setErro] = useState('')
  async function rodar(nome: string, acao: (f: FormData) => Promise<{ erro?: string }>, pergunta: string) {
    if (!confirm(pergunta)) return
    setOcupado(nome); setErro('')
    const f = new FormData(); f.set('id', id)
    const r = await acao(f)
    setOcupado('')
    if (r.erro) setErro(r.erro); else router.refresh()
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap gap-2">
        {podeMarcar && (
          <Button data-ajuda="autorizacao.marcar" size="sm" variant="outline" disabled={!!ocupado}
            onClick={() => rodar('marcar', marcarFotosAutorizadas, `Marcar as ${pendentes} foto(s) como "Uso autorizado" na Biblioteca?\n\nFaça isso só quando TODAS as pessoas que aparecem nelas tiverem assinado.`)}>
            {ocupado === 'marcar' ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}Marcar fotos como autorizadas
          </Button>
        )}
        {aberto && (
          <Button size="sm" variant="ghost" disabled={!!ocupado} onClick={() => rodar('encerrar', encerrarColeta, 'Encerrar o link? Ninguém mais consegue assinar por ele; as assinaturas feitas continuam valendo.')}>
            {ocupado === 'encerrar' ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}Encerrar o link
          </Button>
        )}
      </div>
      {erro && <p role="alert" className="text-xs text-destructive">{erro}</p>}
    </div>
  )
}

export function DetalheDaAssinatura({ id, codigo, documentoHash, termoVersao, revogada, podeRevogar }: {
  id: string; codigo: string; documentoHash: string; termoVersao: string; revogada: boolean; podeRevogar: boolean
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [tracos, setTracos] = useState<[number, number][][] | null>(null)
  const [revogando, setRevogando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function abrir() {
    setAberto(!aberto)
    if (!tracos) { const r = await assinaturaDe(id); if (r.tracos) setTracos(r.tracos); else setErro(r.erro ?? '') }
  }
  async function revogar() {
    setOcupado(true); setErro('')
    const f = new FormData(); f.set('id', id); f.set('motivo', motivo)
    const r = await revogarAutorizacao(f)
    setOcupado(false)
    if (r.erro) { setErro(r.erro); return }
    setRevogando(false); router.refresh()
  }

  return (
    <div className="flex flex-col items-end gap-2 text-left">
      <Button size="sm" variant="ghost" onClick={abrir} aria-expanded={aberto}><Eye className="size-4" />{aberto ? 'Fechar' : 'Ver assinatura'}</Button>
      {aberto && (
        <div className="flex w-72 flex-col gap-2 rounded-lg border border-border bg-background p-3 text-xs">
          {tracos ? <AssinaturaDesenhada tracos={tracos} rotulo={`Assinatura ${codigo}`} /> : !erro && <Loader2 className="size-4 animate-spin" />}
          <p className="text-muted-foreground">Termo {termoVersao}</p>
          <p className="break-all font-mono text-[10px] text-muted-foreground" title="Impressão digital (SHA-256) do documento assinado">{documentoHash}</p>
          {!revogada && podeRevogar && !revogando && <Button size="sm" variant="destructive" onClick={() => setRevogando(true)}>Registrar revogação</Button>}
          {revogando && (
            <div className="flex flex-col gap-2">
              <label htmlFor={`motivo-${id}`} className="font-medium">Como a pessoa pediu?</label>
              <textarea id={`motivo-${id}`} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={500} placeholder='Ex.: "pediu por e-mail em 12/10"' className="rounded-md border border-border bg-background p-2" />
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" disabled={ocupado} onClick={revogar}>{ocupado && <Loader2 className="size-4 animate-spin" />}Revogar</Button>
                <Button size="sm" variant="ghost" onClick={() => setRevogando(false)}>Cancelar</Button>
              </div>
            </div>
          )}
          {erro && <p role="alert" className="text-destructive">{erro}</p>}
        </div>
      )}
    </div>
  )
}
