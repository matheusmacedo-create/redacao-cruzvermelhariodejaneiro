import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { DESTINO_POR_CANAL, PERGUNTAS, type PautaDoCerebro } from '@/lib/cerebro/contrato'
import { ImportarBotao } from './importar-botao'
import { RecusarBotao } from './recusar-botao'

/**
 * Uma pauta do Cérebro por inteiro, na tela do Cérebro.
 *
 * O cartão do painel de Publicações resume; este presta contas: as seis
 * notas, o raciocínio completo, o plano por canal e as travas. Uma
 * recomendação sem raciocínio vira ordem, e ninguém deveria receber ordem de
 * um sistema de triagem — as frases do "porquê" ficam à vista de quem decide.
 */
export function CartaoDetalhado({ pauta: p }: { pauta: PautaDoCerebro }) {
  const liberados = p.canais.filter((c) => c.usar)
  const quando = formatarQuando(p.fato.quando)

  return (
    <Card className="flex flex-col overflow-hidden p-0" id={p.id}>
      {p.midia && (
        <div className="relative">
          {/* A capa vem do cache do Cérebro. É referência de triagem: o selo
              de direito fica sobre ela para ninguém a usar sem ver a regra. */}
          <Image
            src={p.midia.url}
            alt=""
            width={640}
            height={360}
            unoptimized
            className="h-44 w-full bg-muted object-contain"
          />
          <span
            className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              p.midia.podePublicar
                ? 'bg-emerald-500/15 text-emerald-700'
                : 'bg-destructive/10 text-destructive'
            }`}
            title={
              p.midia.podePublicar
                ? 'Material autorizado. Pode entrar na peça.'
                : 'Mídia de terceiro. Não entra na peça — use arte própria ou foto autorizada da filial.'
            }
          >
            {p.midia.direito}
          </span>
          <span className="absolute bottom-2 right-2 max-w-[75%] truncate rounded bg-black/60 px-2 py-1 text-[10px] text-white">
            {p.midia.credito}
          </span>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-bold uppercase tracking-wide text-primary">
            {p.decisao.modoRotulo}
          </span>
          <span className="tabular-nums">
            {p.fato.conta ?? p.fato.fonte}
            {quando ? ` · ${quando}` : ''} · {p.decisao.nota}/100
          </span>
        </div>

        <div>
          <h3 className="text-sm font-semibold leading-snug">{p.titulo}</h3>
          <p className="mt-1 line-clamp-4 text-xs text-muted-foreground">{p.resumo}</p>
        </div>

        {/* As seis perguntas do motor, com as notas que somaram o veredito. */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {PERGUNTAS.map(([chave, rotulo]) => {
            const nota = p.decisao.notas[chave] ?? 0
            return (
              <div key={chave} className="text-[11px] text-muted-foreground">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{rotulo}</span>
                  <span className="tabular-nums">{nota}</span>
                </div>
                <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${nota >= 65 ? 'bg-emerald-500' : nota >= 38 ? 'bg-amber-500' : 'bg-muted-foreground/40'}`}
                    style={{ width: `${Math.max(2, Math.min(100, nota))}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        <div className="rounded-lg bg-muted/60 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Por que apareceu</span>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {p.decisao.porque.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>

        {/* O plano e as travas abrem sob demanda: são o dever de casa do
            Cérebro, não a manchete do cartão. <details> dispensa JavaScript. */}
        <details className="rounded-lg border border-dashed p-2.5 text-[11px] text-muted-foreground">
          <summary className="cursor-pointer select-none font-semibold text-foreground">
            Plano por canal e o que não pode
          </summary>
          <div className="mt-2 space-y-2">
            {p.canais.map((c) => (
              <div key={c.canal}>
                <p className="font-medium text-foreground">
                  {DESTINO_POR_CANAL[c.canal]?.rotulo ?? c.canal} —{' '}
                  {c.usar ? 'faria' : 'não faria'}
                  {c.formato ? ` (${c.formato})` : ''}
                </p>
                {c.texto && <p className="mt-0.5">{c.texto}</p>}
                {c.cta && c.cta !== '—' && <p className="mt-0.5">Encaminhamento: {c.cta}</p>}
              </div>
            ))}
            {p.proibido.length > 0 && (
              <div>
                <p className="font-semibold uppercase tracking-wide text-destructive">Não pode</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {p.proibido.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>

        {p.agrupados && p.agrupados.quantidade > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Agrupa mais {p.agrupados.quantidade} boletim(ns) semelhante(s) da mesma conta.
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <ImportarBotao sinalId={p.id} destinos={liberados.length} />
          <RecusarBotao sinalId={p.id} />
          <span className="ml-auto flex items-center gap-3">
            <a
              href={p.fato.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Ver na fonte
            </a>
            {p.urlNoCerebro && (
              <a
                href={p.urlNoCerebro}
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Raciocínio no Cérebro
              </a>
            )}
          </span>
        </div>
      </div>
    </Card>
  )
}

function formatarQuando(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}
