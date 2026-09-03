import { ExternalLink } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { TelaDoCerebro } from '@/components/app/cerebro/tela'
import { requireWorkspace } from '@/lib/session'
import { lerPautas, urlDoCerebro } from '@/lib/cerebro/cliente'
import type { PautaDoCerebro } from '@/lib/cerebro/contrato'

/**
 * O Cérebro, no estado-alvo: história em vez de post.
 *
 * A página junta as filas do contrato — o corte padrão (agir agora,
 * produzir, agendar) mais o monitorar — e entrega tudo à tela de três
 * zonas: briefing do dia, lista densa e drawer de decisão. As seis barras
 * do motor vivem só no drawer; no mural, decisão, fato, flags e nota.
 */
export default async function CerebroPage() {
  await requireWorkspace()

  // Duas leituras com cache próprio (5 min na tag `cerebro`): o corte de
  // ação e a fila de monitorar. O que é caro — imagens e relacionados —
  // fica para o clique em "Explorar o assunto".
  const [sugestoes, monitorar] = await Promise.all([lerPautas(60), lerPautas(30, 'monitorar')])

  const porModo = (modo: string) => sugestoes.pautas.filter((p) => p.decisao.modo === modo)
  const filas: { agir: PautaDoCerebro[]; pautar: PautaDoCerebro[]; agendar: PautaDoCerebro[]; monitorar: PautaDoCerebro[] } = {
    agir: porModo('agir_agora'),
    pautar: porModo('produzir'),
    agendar: porModo('agendar'),
    monitorar: monitorar.pautas,
  }

  return (
    <div>
      <PageHeader
        title="Cérebro"
        description="Leitura das contas oficiais do Rio: fato, raciocínio, plano por canal e o que não pode. O Cérebro recomenda; quem produz e publica é a Redação."
        actions={
          <a
            href={urlDoCerebro()}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Abrir o Cérebro
            <ExternalLink className="size-3.5" />
          </a>
        }
      />
      <TelaDoCerebro
        filas={filas}
        origem={sugestoes.origem ?? monitorar.origem}
        geradoEm={sugestoes.geradoEm ?? monitorar.geradoEm}
        erro={sugestoes.erro}
      />
    </div>
  )
}
