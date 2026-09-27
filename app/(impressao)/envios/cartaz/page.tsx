import { notFound } from 'next/navigation'
import { requireWorkspace } from '@/lib/session'
import { avaliaEnvios } from '@/lib/envios/servidor'
import { linkEQrDoEnvio } from '@/lib/envios/cartaz-servidor'
import { FORMATOS, lerOpcoes } from '@/lib/envios/cartaz'
import { Cartaz } from '@/components/envios/cartaz'
import { condensada } from '@/components/cracha/fonte'
import { BotoesDoCartaz } from './botoes'

export const metadata = { title: 'Cartaz — Mandar uma ação' }

/** Quanto a prévia encolhe a peça na tela (o A4 aparece no tamanho real). */
const PREVIA = { a4: 1, story: 0.42, feed: 0.56, quadrado: 0.62 } as const

/**
 * O cartaz do link /enviar, em quatro formatos (A4 para imprimir, story,
 * post do feed e quadrado), três modelos e quatro chamadas, com o nome da
 * ação opcional. O A4 imprime ou vira PDF pela janela de impressão; todos
 * baixam em PNG por /api/envios/cartaz, com o mesmo desenho
 * (components/envios/cartaz.tsx). Fica fora do grupo (app) de propósito: sem
 * menu, topo nem painel de ajuda, a página impressa é só o cartaz. Mesma
 * regra de acesso de /envios (quem avalia os envios).
 */
export default async function CartazDoEnvio({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await requireWorkspace()
  if (!(await avaliaEnvios(context.user.id, context.workspace.id))) notFound()
  const opcoes = lerOpcoes(await searchParams)
  const { qr, endereco } = await linkEQrDoEnvio()
  const f = FORMATOS[opcoes.formato]
  const escala = PREVIA[opcoes.formato]

  return (
    <div className="min-h-dvh bg-neutral-200 py-6 print:bg-white print:py-0">
      {/* Uma folha A4 exata na impressão, com as cores da marca (sem isso o navegador tira o fundo). */}
      <style>{'@page { size: A4 portrait; margin: 0 } @media print { html, body { background: #fff } } .cartaz-cvb, .cartaz-cvb * { print-color-adjust: exact; -webkit-print-color-adjust: exact }'}</style>
      <BotoesDoCartaz opcoes={opcoes} />

      {/* No celular o A4 encolhe para caber; os formatos de rede já aparecem reduzidos. */}
      <div className={`mx-auto w-fit print:[zoom:1] ${opcoes.formato === 'a4' ? 'max-[860px]:[zoom:0.72] max-[600px]:[zoom:0.45]' : 'max-[600px]:[zoom:0.75]'}`}>
        <div className="cartaz-cvb shadow-xl print:shadow-none" style={{ width: f.largura * escala, height: f.altura * escala }} aria-label={`Cartaz (${f.rotulo}): mande a sua ação para a Comunicação`}>
          <div style={{ zoom: escala }} className="print:[zoom:1]">
            <Cartaz {...opcoes} qr={qr} logo="/images/logo-cvrj.png" endereco={endereco} fontes={{ texto: 'var(--font-libre-franklin), sans-serif', titulo: `${condensada.style.fontFamily}, sans-serif` }} />
          </div>
        </div>
      </div>
    </div>
  )
}
