import Image from 'next/image'
import QRCode from 'qrcode'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { urlBase } from '@/lib/newsletter/contexto'
import { linkDaEntrada } from '@/lib/portaria/regras'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'
import { BotoesDoCartaz } from './botoes'

export const metadata = { title: 'Cartaz — Portaria' }
export const dynamic = 'force-dynamic'

/**
 * O cartaz do QR da entrada (Portaria virtual), para imprimir e deixar na
 * recepção (A4 em pé). Fora do grupo (app), como o cartaz dos Envios: sem
 * menu nem topo, a folha impressa é só o cartaz. Quem usa a portaria vê o
 * segredo pela política de portaria_config; a equipe da Escola não entra.
 */
export default async function CartazDaPortaria() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data } = await supabase.from('portaria_config').select('token').eq('workspace_id', context.workspace.id).maybeSingle()
  if (!data?.token) {
    return <p className="p-8 text-sm">O QR da entrada ainda não foi criado (migração 20260929060000). Avise a administração.</p>
  }
  const link = linkDaEntrada(urlBase(), data.token as string)
  const qr = await QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 0, width: 1200, color: { dark: '#1a1a1a', light: '#ffffff' } })

  return (
    <div className="min-h-dvh bg-neutral-200 py-6 print:bg-white print:py-0">
      <style>{'@page { size: A4 portrait; margin: 0 } @media print { html, body { background: #fff } }'}</style>
      <BotoesDoCartaz />
      <article className="mx-auto flex h-[297mm] w-[210mm] flex-col overflow-hidden bg-white text-neutral-900 shadow-xl max-[860px]:[zoom:0.72] max-[600px]:[zoom:0.45] print:shadow-none print:[zoom:1]" aria-label="Cartaz: registro de visitante">
        <div className="h-[4mm] bg-[rgb(227_34_25)] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]" />
        <div className="flex flex-1 flex-col items-center px-[18mm] pb-[12mm] pt-[16mm] text-center">
          <Image src="/images/logo-cvrj.png" alt="Cruz Vermelha Brasileira – Rio de Janeiro" width={1844} height={752} priority sizes="80mm" className="h-auto w-[72mm]" />
          <h1 className="mt-[14mm] text-[44pt] font-extrabold leading-none tracking-tight">Visitante?</h1>
          <p className="mt-[4mm] text-[18pt] leading-snug text-neutral-700">Registre a sua entrada pelo celular.</p>
          <div className="mt-[12mm] rounded-[4mm] border-[1.4mm] border-[rgb(227_34_25)] bg-white p-[5mm] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
            <img src={qr} alt={`QR code para ${link}`} className="block size-[92mm]" />
          </div>
          <ol className="mt-[12mm] flex flex-col gap-[4mm] text-left text-[14pt] leading-snug">
            {['Aponte a câmera do celular para o código.', 'Preencha o seu nome e quem vai visitar.', 'Mostre a tela na portaria.'].map((t, i) => (
              <li key={i} className="flex items-center gap-[4mm]">
                <span className="flex size-[10mm] shrink-0 items-center justify-center rounded-full bg-[rgb(227_34_25)] text-[14pt] font-bold text-white [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">{i + 1}</span>{t}
              </li>
            ))}
          </ol>
          <p className="mt-auto text-[11pt] text-neutral-600">Não pedimos documento. Os dados ficam no livro de visitantes da filial, só para a segurança de todos.</p>
        </div>
        <div className="flex h-[12mm] items-center justify-between border-t border-neutral-200 px-[16mm] text-[9.5pt] text-neutral-500">
          <span>{DADOS_DA_FILIAL.nome}</span>
          <span>cruzvermelhariodejaneiro.org</span>
        </div>
      </article>
    </div>
  )
}
