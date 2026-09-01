'use client'

import { useState, useTransition } from 'react'
import { BarChart3, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ligarAnalyticsDoSite, type ResultadoDoAnalytics } from '@/app/actions/site'
import { ID_DO_ANALYTICS } from '@/lib/site/analytics'

/**
 * O botão que completa o Google Analytics no site.
 *
 * Um botão, e não uma tarefa de terminal, pelo mesmo motivo do formulário da
 * newsletter: quem opera a Redação não abre FTP — e o segredo do FTP mora na
 * Vercel, onde esta ação roda. A tela mostra exatamente o que foi alterado,
 * porque "mexi no seu site inteiro" sem lista é pedido de confiança demais.
 */
export function AnalyticsDoSite() {
  const [resultado, setResultado] = useState<ResultadoDoAnalytics | null>(null)
  const [rodando, iniciar] = useTransition()

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-6">
      <h2 className="flex items-center gap-2 font-semibold"><BarChart3 className="size-4" />Google Analytics no site</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        As páginas de notícia novas já nascem com o Analytics ({ID_DO_ANALYTICS}, o mesmo da página inicial).
        Este botão completa as páginas que já estão no servidor — notícias antigas, equipe, campanhas — sem tocar
        no que já tem o rastreador. Pode rodar quantas vezes quiser.
      </p>
      <div className="mt-4">
        <Button
          disabled={rodando}
          onClick={() => iniciar(async () => setResultado(await ligarAnalyticsDoSite()))}
        >
          {rodando ? <><Loader2 className="size-4 animate-spin" />Percorrendo o site…</> : 'Ligar o Analytics nas páginas do site'}
        </Button>
      </div>
      {resultado?.erro && <p className="mt-3 text-sm text-destructive">{resultado.erro}</p>}
      {resultado?.recado && (
        <div className="mt-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-success"><Check className="size-4" />{resultado.recado}</p>
          {(resultado.ligadas?.length ?? 0) > 0 && (
            <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2 font-mono text-xs">
              {resultado.ligadas!.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
          {(resultado.puladas?.length ?? 0) > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">Puladas por segurança: {resultado.puladas!.join(' · ')}</p>
          )}
        </div>
      )}
    </div>
  )
}
