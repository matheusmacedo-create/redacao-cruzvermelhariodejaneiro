import Image from 'next/image'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { requireWorkspace } from '@/lib/session'
import { urlBase } from '@/lib/newsletter/contexto'
import { avaliaEnvios } from '@/lib/envios/servidor'
import { BotoesDoCartaz } from './botoes'

export const metadata = { title: 'Cartaz — Mandar uma ação' }

/**
 * O cartaz do link /enviar, para imprimir na ação (A4 em pé) ou salvar em
 * PDF e mandar no grupo. Fica fora do grupo (app) de propósito: sem menu,
 * topo nem painel de ajuda, a página impressa é só o cartaz. Mesma regra de
 * acesso de /envios (quem avalia os envios).
 *
 * Identidade: a logo oficial, o vermelho da marca e a Libre Franklin do
 * sistema. O QR vai em PNG grande (1200 px) para sair nítido no papel.
 */
export default async function CartazDoEnvio() {
  const context = await requireWorkspace()
  if (!(await avaliaEnvios(context.user.id, context.workspace.id))) notFound()
  const link = `${urlBase()}/enviar`
  const qr = await QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 0, width: 1200, color: { dark: '#1a1a1a', light: '#ffffff' } })
  const enderecoCurto = link.replace(/^https?:\/\//, '')

  return (
    <div className="min-h-dvh bg-neutral-200 py-6 print:bg-white print:py-0">
      {/* Uma folha A4 exata na impressão; na tela, a mesma folha com sombra (reduzida no celular, para caber). */}
      <style>{'@page { size: A4 portrait; margin: 0 } @media print { html, body { background: #fff } }'}</style>
      <BotoesDoCartaz />

      <article className="mx-auto flex h-[297mm] w-[210mm] flex-col overflow-hidden bg-white text-neutral-900 shadow-xl max-[860px]:[zoom:0.72] max-[600px]:[zoom:0.45] print:shadow-none print:[zoom:1]" aria-label="Cartaz: mande a sua ação para a Comunicação">
        {/* Faixa da marca: a cruz é SEMPRE vermelha sobre branco (manual da marca e regra de uso do
            emblema) — nunca vazada em branco sobre vermelho. O vermelho entra como filete embaixo. */}
        <div className="flex h-[14mm] items-center gap-[4mm] border-b-[1.2mm] border-[rgb(227_34_25)] bg-white px-[16mm] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
          <svg viewBox="0 0 30 30" className="size-[6mm]" aria-hidden="true"><path d="M10 0h10v10h10v10H20v10H10V20H0V10h10z" fill="rgb(227 34 25)" /></svg>
          <p className="text-[11pt] font-semibold uppercase tracking-[0.18em] text-neutral-800">Comunicação · Cruz Vermelha RJ</p>
        </div>

        <div className="flex flex-1 flex-col px-[16mm] pb-[10mm] pt-[12mm]">
          <Image src="/images/logo-cvrj.png" alt="Cruz Vermelha Brasileira – Rio de Janeiro" width={1844} height={752} priority sizes="70mm" className="h-auto w-[62mm]" />

          <h1 className="mt-[10mm] text-[34pt] font-extrabold leading-[1.05] tracking-tight">
            Fez uma ação?<br /><span className="text-[rgb(227_34_25)] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">Mande para a Comunicação.</span>
          </h1>
          <p className="mt-[5mm] max-w-[160mm] text-[14pt] leading-snug text-neutral-700">
            Fotos, vídeos, áudios e o relato do que aconteceu viram post e matéria — e mostram ao Rio o trabalho da Cruz Vermelha.
          </p>

          <div className="mt-[10mm] flex items-center gap-[10mm]">
            <div className="shrink-0 rounded-[4mm] border-[1.2mm] border-[rgb(227_34_25)] bg-white p-[4mm] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
              <img src={qr} alt={`QR code para ${link}`} className="block size-[78mm]" />
            </div>
            <ol className="flex flex-col gap-[6mm] text-[13pt] leading-snug">
              {[
                ['Aponte a câmera do celular', 'para o código ao lado.'],
                ['Conte o que aconteceu', 'e anexe fotos, vídeos ou áudios.'],
                ['Envie', 'e a Comunicação cuida do resto.'],
              ].map(([forte, resto], i) => (
                <li key={i} className="flex gap-[4mm]">
                  <span className="flex size-[10mm] shrink-0 items-center justify-center rounded-full bg-[rgb(227_34_25)] text-[14pt] font-bold text-white [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">{i + 1}</span>
                  <span className="pt-[1.5mm]"><strong className="font-bold">{forte}</strong> {resto}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-[8mm] flex flex-wrap gap-[3mm] text-[11pt]">
            {['Sem login', 'Sem aplicativo', 'Direto do celular'].map((t) => (
              <span key={t} className="rounded-full border border-neutral-300 px-[4mm] py-[1.5mm] font-medium text-neutral-700">{t}</span>
            ))}
          </div>

          <section className="mt-[9mm] rounded-[3mm] bg-neutral-100 px-[7mm] py-[5mm] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]" aria-label="O que vale mandar">
            <p className="text-[10pt] font-bold uppercase tracking-[0.14em] text-[rgb(227_34_25)] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">O que vale mandar</p>
            <ul className="mt-[3mm] grid grid-cols-2 gap-x-[8mm] gap-y-[2mm] text-[12pt] text-neutral-800">
              {['Atendimentos e ações de saúde', 'Treinamentos e cursos', 'Campanhas e arrecadações', 'Eventos, visitas e parcerias'].map((t) => (
                <li key={t} className="flex items-center gap-[2.5mm]"><span className="size-[2mm] shrink-0 bg-[rgb(227_34_25)] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]" aria-hidden="true" />{t}</li>
              ))}
            </ul>
          </section>

          <p className="mt-auto text-[10.5pt] leading-snug text-neutral-600">
            Sem câmera? Digite o endereço: <strong className="font-semibold text-neutral-900">{enderecoCurto}</strong>
            <br />Só mande imagens de pessoas que autorizaram o uso — o formulário pergunta.
          </p>
        </div>

        <div className="flex h-[12mm] items-center justify-between border-t border-neutral-200 px-[16mm] text-[9.5pt] text-neutral-500">
          <span>Cruz Vermelha Brasileira — Filial do Estado do Rio de Janeiro</span>
          <span>cruzvermelhariodejaneiro.org</span>
        </div>
      </article>
    </div>
  )
}
