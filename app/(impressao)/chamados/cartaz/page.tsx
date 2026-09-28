import Image from 'next/image'
import Link from 'next/link'
import QRCode from 'qrcode'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { urlBase } from '@/lib/newsletter/contexto'
import { linkDoCartaz, PASSOS_DO_CARTAZ } from '@/lib/chamados/cartaz'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'
import { BotoesDoCartaz } from './botoes'

export const metadata = { title: 'Cartaz — Chamados' }
export const dynamic = 'force-dynamic'

/**
 * O cartaz com QR de uma fila de chamados, para colar no setor (A4 em pé): o QR
 * abre "Abrir chamado" já no setor (/chamado?fila=…). Fora do grupo (app), como
 * os cartazes da Portaria e dos Envios: sem menu nem topo, a folha impressa é
 * só o cartaz. Quem abre chamado (toda a equipe do Palácio) pode imprimir.
 */
export default async function CartazDosChamados({ searchParams }: { searchParams: Promise<{ fila?: string }> }) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data } = await supabase.from('chamado_filas').select('id, slug, nome, descricao').eq('workspace_id', context.workspace.id).eq('ativa', true).order('ordem')
  const filas = (data ?? []) as { id: string; slug: string; nome: string; descricao: string | null }[]
  if (!filas.length) {
    return <p className="p-8 text-sm">Nenhum setor recebe chamados ainda. <Link href="/chamados" className="underline">Voltar aos Chamados</Link></p>
  }
  const { fila } = await searchParams
  const f = filas.find((x) => x.slug === fila || x.id === fila) ?? filas[0]
  const link = linkDoCartaz(urlBase(), f.slug)
  const qr = await QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 0, width: 1200, color: { dark: '#1a1a1a', light: '#ffffff' } })
  const curto = link.replace(/^https?:\/\//, '')

  return (
    <div className="min-h-dvh bg-neutral-200 py-6 print:bg-white print:py-0">
      <style>{'@page { size: A4 portrait; margin: 0 } @media print { html, body { background: #fff } }'}</style>
      <BotoesDoCartaz filas={filas.map((x) => ({ slug: x.slug, nome: x.nome }))} atual={f.slug} />
      <article className="mx-auto flex h-[297mm] w-[210mm] flex-col overflow-hidden bg-white text-neutral-900 shadow-xl max-[860px]:[zoom:0.72] max-[600px]:[zoom:0.45] print:shadow-none print:[zoom:1]" aria-label={`Cartaz: abrir chamado para ${f.nome}`} data-cartaz-chamados={f.slug}>
        <div className="h-[4mm] bg-[rgb(227_34_25)] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]" />
        <div className="flex flex-1 flex-col items-center px-[18mm] pb-[12mm] pt-[14mm] text-center">
          <Image src="/images/logo-cvrj.png" alt="Cruz Vermelha Brasileira – Rio de Janeiro" width={1844} height={752} priority sizes="80mm" className="h-auto w-[66mm]" />
          <p className="mt-[9mm] text-[15pt] font-semibold uppercase tracking-[0.12em] text-[rgb(227_34_25)] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">Chamados</p>
          <h1 className="mt-[3mm] text-[36pt] font-extrabold leading-[1.05] tracking-tight [text-wrap:balance]">Precisa de {f.nome}?</h1>
          <p className="mt-[4mm] max-w-[150mm] text-[16pt] leading-snug text-neutral-700 [text-wrap:balance]">{f.descricao?.trim() || 'Abra um chamado pelo celular e acompanhe a resposta.'}</p>
          <div className="mt-[8mm] rounded-[4mm] border-[1.4mm] border-[rgb(227_34_25)] bg-white p-[5mm] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
            <img src={qr} alt={`QR code para ${link}`} className="block size-[74mm]" />
          </div>
          <p className="mt-[3mm] font-mono text-[10pt] text-neutral-500">{curto}</p>
          <ol className="mt-[8mm] flex flex-col gap-[4mm] text-left text-[14pt] leading-snug">
            {PASSOS_DO_CARTAZ.map((t, i) => (
              <li key={i} className="flex items-center gap-[4mm]">
                <span className="flex size-[10mm] shrink-0 items-center justify-center rounded-full bg-[rgb(227_34_25)] text-[14pt] font-bold text-white [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">{i + 1}</span>{t}
              </li>
            ))}
          </ol>
          <p className="mt-auto pt-[6mm] text-[11pt] text-neutral-600">Para a equipe da filial, com o login do Palácio Virtual. Cada chamado tem prazo e fica registrado.</p>
        </div>
        <div className="flex h-[12mm] items-center justify-between border-t border-neutral-200 px-[16mm] text-[9.5pt] text-neutral-500">
          <span>{DADOS_DA_FILIAL.nome}</span>
          <span>cruzvermelhariodejaneiro.org</span>
        </div>
      </article>
    </div>
  )
}
