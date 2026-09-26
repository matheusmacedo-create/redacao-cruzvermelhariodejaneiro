import Link from 'next/link'
import { Download } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { estatisticas, respostaLegivel, TENTATIVAS_DO_QUIZ, type Pergunta, type Resposta } from '@/lib/oportunidades/perguntas'

/**
 * As respostas de uma oportunidade, para a equipe: o resumo de cada pergunta
 * (votos e percentual por opção; os textos) e a lista de quem respondeu. No
 * aviso, quantos confirmaram de quantos voluntários ativos; no quiz, a nota
 * de cada um. Componente de servidor: recebe tudo pronto da página.
 */

export type RespostaNaEquipe = {
  participanteId: string; nome: string; respostas: Resposta[]; atualizadoEm: string
  nota: number | null; aprovado: boolean | null; tentativas: number
}

const dataHora = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))

export function RespostasDaOportunidade({ id, tipo, perguntas, respostas, ativos, minima }: {
  id: string; tipo: string; perguntas: (Pergunta & { id: string })[]; respostas: RespostaNaEquipe[]; ativos: number; minima: number | null
}) {
  const quiz = tipo === 'quiz'
  const aviso = tipo === 'aviso'
  const est = estatisticas(perguntas, respostas.map((r) => r.respostas))
  const aprovados = respostas.filter((r) => r.aprovado).length
  const titulo = aviso ? 'Confirmações' : 'Respostas'
  const resumo = aviso
    ? `${respostas.length} de ${ativos} voluntários ativos confirmaram`
    : quiz ? `${respostas.length} ${respostas.length === 1 ? 'pessoa fez' : 'pessoas fizeram'} · ${aprovados} ${aprovados === 1 ? 'aprovada' : 'aprovadas'} (mínima ${minima ?? 70})`
      : `${respostas.length} ${respostas.length === 1 ? 'resposta' : 'respostas'}`

  return (
    <Card className="flex flex-col gap-4 p-5" id="respostas" data-ajuda="voluntarios.respostas">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{titulo}</p>
          <p className="text-xs text-muted-foreground">{resumo}</p>
        </div>
        {respostas.length > 0 && (
          <Button variant="outline" size="sm" render={<a href={`/api/voluntariado/oportunidades/${id}/respostas`} />}><Download className="size-4" />Planilha (CSV)</Button>
        )}
      </div>

      {est.length > 0 && respostas.length > 0 && (
        <ol className="flex flex-col gap-4">
          {est.map((e, i) => (
            <li key={e.id} className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">{i + 1}. {e.enunciado} <span className="font-normal text-muted-foreground">· {e.responderam} {e.responderam === 1 ? 'resposta' : 'respostas'}</span></p>
              {e.tipo === 'texto' ? (
                e.textos.length ? (
                  <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
                    {e.textos.map((t, k) => <li key={k} className="rounded-md bg-muted px-2 py-1 wrap-break-word">{t}</li>)}
                  </ul>
                ) : <p className="text-xs text-muted-foreground">Ninguém escreveu nada ainda.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {e.opcoes.map((o) => (
                    <li key={o.rotulo} className="flex items-center gap-2 text-sm">
                      <span className="w-32 shrink-0 truncate" title={o.rotulo}>{o.rotulo}{o.certa ? ' ✓' : ''}</span>
                      <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <span className={`absolute inset-y-0 left-0 rounded-full ${o.certa ? 'bg-success' : 'bg-primary'}`} style={{ width: `${o.pct}%` }} />
                      </span>
                      <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{o.votos} · {o.pct}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}

      {respostas.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-primary">{aviso ? 'Quem confirmou' : 'Resposta de cada pessoa'}</summary>
          <ul className="mt-2 divide-y divide-border text-sm">
            {respostas.map((r) => (
              <li key={r.participanteId} className="flex flex-col gap-0.5 py-2">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/voluntariado/${r.participanteId}`} className="font-medium hover:underline">{r.nome}</Link>
                  <span className="text-xs text-muted-foreground">
                    {quiz && r.nota !== null ? `Nota ${r.nota} · ${r.aprovado ? 'aprovado' : r.tentativas >= TENTATIVAS_DO_QUIZ ? 'não aprovado' : `${r.tentativas} de ${TENTATIVAS_DO_QUIZ} tentativas`} · ` : ''}{dataHora(r.atualizadoEm)}
                  </span>
                </span>
                {perguntas.map((p) => {
                  const texto = respostaLegivel(p, r.respostas.find((x) => x.p === p.id))
                  return texto ? <span key={p.id} className="text-xs text-muted-foreground wrap-break-word"><span className="text-foreground">{p.enunciado}</span> {texto}</span> : null
                })}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="text-sm text-muted-foreground">{aviso ? 'Ninguém confirmou ainda.' : 'Ninguém respondeu ainda.'}</p>
      )}
    </Card>
  )
}
