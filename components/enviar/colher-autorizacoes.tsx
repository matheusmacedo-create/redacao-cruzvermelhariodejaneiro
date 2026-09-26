'use client'

import { useState } from 'react'
import { Check, Copy, ExternalLink, Loader2, MessageCircle, PenLine } from 'lucide-react'
import { botaoDoMembro, botaoSecundario } from '@/components/membro/marca'
import { Recado } from '@/components/membro/pecas'
import { acaoDoEnvio } from './envio'

/**
 * Depois de "Recebemos!": o link (e o QR) do termo de uso de imagem para as
 * pessoas das fotos assinarem — passando o celular de mão em mão ali mesmo,
 * ou cada uma no seu. As assinaturas ficam em Biblioteca → Autorizações de
 * imagem e na tela do envio.
 */
export function ColherAutorizacoes({ envioId, token, titulo, temMenores }: { envioId: string; token: string; titulo: string; temMenores: boolean }) {
  const [link, setLink] = useState('')
  const [qr, setQr] = useState('')
  const [erro, setErro] = useState('')
  const [gerando, setGerando] = useState(false)
  const [copiado, setCopiado] = useState(false)

  async function gerar() {
    setGerando(true); setErro('')
    try {
      const j = await acaoDoEnvio(envioId, { token, acao: 'autorizacao' })
      const endereco = `${window.location.origin}${String(j.caminho)}`
      setLink(endereco)
      const QRCode = (await import('qrcode')).default
      setQr(await QRCode.toDataURL(endereco, { errorCorrectionLevel: 'M', margin: 1, width: 360 }))
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não foi possível gerar o link agora.')
    } finally {
      setGerando(false)
    }
  }

  async function copiar() {
    try { await navigator.clipboard.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* o link está à vista para copiar */ }
  }

  const recado = `Olá! Estas são as fotos de "${titulo}" da Cruz Vermelha RJ. Para podermos divulgá-las, veja as fotos e assine a autorização por este link (leva um minuto): ${link}`

  return (
    <section aria-labelledby="colher" className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-card p-4">
      <h3 id="colher" className="flex items-center gap-2 text-base font-semibold"><PenLine className="size-5 text-primary" aria-hidden="true" />Autorização de quem aparece nas fotos</h3>
      <p className="text-sm text-muted-foreground">
        Para a comunicação poder publicar, cada pessoa que aparece assina o termo no celular: vê as fotos, marca onde podem sair e assina com o dedo. Leva um minuto.
        {temMenores && ' Por criança ou adolescente, quem assina é o pai, a mãe ou o responsável.'}
      </p>
      {!link ? (
        <button type="button" onClick={gerar} disabled={gerando} className={`${botaoDoMembro} self-start`}>
          {gerando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Gerar o link para assinarem
        </button>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          {qr && <img src={qr} alt="QR code do link de autorização" className="w-40 self-center rounded-lg border border-border sm:self-start" />}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-sm">Mostre o QR para a pessoa ler com a câmera, passe o seu celular para ela assinar, ou mande o link.</p>
            <a href={link} target="_blank" rel="noreferrer" className={botaoDoMembro}><ExternalLink className="size-4" aria-hidden="true" />Assinar neste celular</a>
            <a href={`https://wa.me/?text=${encodeURIComponent(recado)}`} target="_blank" rel="noreferrer" className={botaoSecundario}><MessageCircle className="size-4" aria-hidden="true" />Mandar no WhatsApp</a>
            <button type="button" onClick={copiar} className={botaoSecundario}>{copiado ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}{copiado ? 'Copiado' : 'Copiar o link'}</button>
            <p className="text-xs text-muted-foreground">Uma assinatura por pessoa. O link vale 30 dias. No mesmo celular, depois de cada assinatura toque em “Outra pessoa vai assinar”.</p>
          </div>
        </div>
      )}
      {erro && <Recado tipo="erro">{erro}</Recado>}
    </section>
  )
}
