import { ExternalLink } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { TelaDoCerebro, type PacoteDoSinal } from '@/components/app/cerebro/tela'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { lerPautas, urlDoCerebro } from '@/lib/cerebro/cliente'
import { claudeConfigurado } from '@/lib/ia/anthropic'
import type { PautaDoCerebro } from '@/lib/cerebro/contrato'

/**
 * O Cérebro, no estado-alvo: história em vez de post.
 *
 * A página junta as filas do contrato — o corte padrão (agir agora,
 * produzir, agendar), a fila de "avaliar" (nota alta, falta confirmar ação
 * da filial) e a de monitorar — e entrega tudo à tela de três zonas:
 * briefing do dia, lista densa e drawer de decisão. As seis barras do motor
 * vivem só no drawer; no mural, decisão, fato, flags e nota.
 *
 * A tela também precisa saber o que a Casa já fez com cada sinal: o pacote
 * aberto a partir dele, se existe. Isso vem do nosso banco — é o dado mais
 * fresco — e o Cérebro complementa com o que lembra (naRedacao).
 */
export default async function CerebroPage() {
  const context = await requireWorkspace()

  // Três leituras com cache próprio (5 min na tag `cerebro`). O que é caro —
  // imagens e relacionados — fica para o clique em "Explorar o assunto".
  const [sugestoes, avaliar, monitorar] = await Promise.all([
    lerPautas(60),
    lerPautas(30, 'avaliar'),
    lerPautas(30, 'monitorar'),
  ])

  const porModo = (modo: string) => sugestoes.pautas.filter((p) => p.decisao.modo === modo)
  const filas: {
    agir: PautaDoCerebro[]
    pautar: PautaDoCerebro[]
    agendar: PautaDoCerebro[]
    conferir: PautaDoCerebro[]
    monitorar: PautaDoCerebro[]
  } = {
    agir: porModo('agir_agora'),
    pautar: porModo('produzir'),
    agendar: porModo('agendar'),
    conferir: avaliar.pautas,
    monitorar: monitorar.pautas,
  }

  // Pacotes já abertos a partir de sinais, por id do sinal. O id gravado pode
  // ser o de um boletim recolhido pelo agrupamento; o `agrupados.outros` de
  // cada pauta leva o pacote ao chefe que o representa hoje.
  const pacotesPorSinal: Record<string, PacoteDoSinal> = {}
  const supabase = await createClient()
  const { data: pacotes } = await supabase
    .from('social_packages')
    .select('id,status,cerebro_sinal_id,updated_at')
    .eq('workspace_id', context.workspace.id)
    .not('cerebro_sinal_id', 'is', null)
    .neq('status', 'arquivado')
    .order('updated_at', { ascending: false })
    .limit(300)
  const porSinalGravado = new Map<string, PacoteDoSinal>()
  for (const p of pacotes ?? []) {
    if (p.cerebro_sinal_id && !porSinalGravado.has(p.cerebro_sinal_id)) {
      porSinalGravado.set(p.cerebro_sinal_id, { id: p.id, status: p.status })
    }
  }
  const todas = [...filas.agir, ...filas.pautar, ...filas.agendar, ...filas.conferir, ...filas.monitorar]
  for (const p of todas) {
    const direto = porSinalGravado.get(p.id)
    const viaRecolhido = (p.agrupados?.outros ?? []).map((o) => porSinalGravado.get(o.id)).find(Boolean)
    const pacote = direto ?? viaRecolhido
    if (pacote) pacotesPorSinal[p.id] = pacote
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
        pacotesPorSinal={pacotesPorSinal}
        redatorDisponivel={claudeConfigurado()}
        origem={sugestoes.origem ?? monitorar.origem}
        geradoEm={sugestoes.geradoEm ?? monitorar.geradoEm}
        erro={sugestoes.erro}
      />
    </div>
  )
}
