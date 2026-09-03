'use client'

import { useMemo, useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink, Map, RefreshCw, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { importarDoCerebro, recusarSugestao, sincronizarCerebro } from '@/app/actions/cerebro'
import {
  DESTINO_POR_CANAL,
  MOTIVOS_RECUSA,
  PERGUNTAS,
  type MotivoRecusa,
  type PautaDoCerebro,
} from '@/lib/cerebro/contrato'
import type { Relacionados } from '@/lib/cerebro/relacionados'
import { cn } from '@/lib/utils'

/**
 * A tela do Cérebro no estado-alvo: história > post, decisão > métrica.
 *
 * Três zonas. O briefing resume o dia em números e destaques; a lista mostra
 * histórias em linhas densas — decisão, título, fato, até três flags e a
 * nota — agrupadas por fila; o drawer presta contas da selecionada com "o
 * que não pode" sempre aberto e a tabela de canais preenchida. As seis
 * barras vivem SÓ aqui dentro: no mural elas eram ruído.
 *
 * "Explorar o assunto" busca, sob demanda, outros sinais do acervo (com
 * imagem) e o que a Casa já publicou parecido — nunca junto do mural, que é
 * exatamente o custo que a pessoa não pediu.
 */

interface Filas {
  agir: PautaDoCerebro[]
  pautar: PautaDoCerebro[]
  agendar: PautaDoCerebro[]
  monitorar: PautaDoCerebro[]
}

const SECOES: { chave: keyof Filas; rotulo: string; explica: string }[] = [
  { chave: 'agir', rotulo: 'Agir agora', explica: 'Ruptura em curso. Cada hora custa relevância.' },
  { chave: 'pautar', rotulo: 'Pautar hoje', explica: 'Pauta boa sem urgência de minutos.' },
  { chave: 'agendar', rotulo: 'Agendar', explica: 'Tem data certa: entra no calendário.' },
  { chave: 'monitorar', rotulo: 'Monitorar', explica: 'Informa a equipe; não vira peça por ora.' },
]

const CHIP_MODO: Record<string, string> = {
  agir_agora: 'bg-primary text-white',
  produzir: 'bg-foreground text-background',
  agendar: 'bg-[#47586B] text-white',
  avaliar: 'bg-[#47586B] text-white',
  monitorar: 'bg-muted text-muted-foreground',
}

const faixaDaNota = (n: number) =>
  n >= 65
    ? 'text-[#1A7F45] bg-[#E7F3EB]'
    : n >= 40
      ? 'text-[#B7791F] bg-[#F7EEDD]'
      : 'text-muted-foreground bg-muted'

export function TelaDoCerebro({ filas, origem, geradoEm, erro }: {
  filas: Filas
  origem: 'apify' | 'seed' | null
  geradoEm: string | null
  erro: string | null
}) {
  const router = useRouter()
  const todas = useMemo(() => SECOES.flatMap((s) => filas[s.chave]), [filas])
  const [selecionadaId, setSelecionadaId] = useState<string | null>(todas[0]?.id ?? null)
  const [sheet, setSheet] = useState(false)
  const [fechadas, setFechadas] = useState<Set<string>>(new Set())
  const [briefingAberto, setBriefingAberto] = useState(false)
  const [sincronizando, iniciarSync] = useTransition()
  const selecionada = todas.find((p) => p.id === selecionadaId) ?? null

  // O "mergulho" de cada história fica guardado aqui em cima: trocar de
  // história e voltar não paga a busca de novo.
  const [relacionados, setRelacionados] = useState<Record<string, 'carregando' | Relacionados>>({})
  const vazio = (erro: string): Relacionados => ({ palavras: [], naImprensa: [], doCerebro: [], daCasa: [], erro })
  const explorar = async (p: PautaDoCerebro) => {
    setRelacionados((s) => ({ ...s, [p.id]: 'carregando' }))
    try {
      const r = await fetch('/api/cerebro/relacionados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, titulo: p.titulo, resumo: p.resumo }),
      })
      const d = (await r.json()) as Relacionados
      setRelacionados((s) => ({ ...s, [p.id]: r.ok ? d : vazio(d.erro ?? `HTTP ${r.status}`) }))
    } catch {
      setRelacionados((s) => ({ ...s, [p.id]: vazio('Sem conexão. Tente de novo.') }))
    }
  }

  const sincronizar = () =>
    iniciarSync(async () => {
      await sincronizarCerebro()
      router.refresh()
    })

  const quando = geradoEm
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(geradoEm))
    : null

  if (erro) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Cérebro indisponível.</span> {erro} O resto da
        Redação não é afetado — tente de novo em instantes.
      </div>
    )
  }

  const abrir = (id: string) => {
    setSelecionadaId(id)
    setSheet(true)
  }

  return (
    <div className="mt-4">
      {/* ── Zona A: briefing do dia ── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border bg-[#F7F4EF] px-4 py-3">
        <div className="flex">
          {SECOES.map((s, i) => (
            <div key={s.chave} className={cn('pr-4', i > 0 && 'border-l border-border pl-4')} title={s.explica}>
              <b className={cn('block text-xl font-extrabold leading-tight tabular-nums', s.chave === 'agir' && filas.agir.length > 0 && 'text-primary')}>
                {filas[s.chave].length}
              </b>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{s.rotulo}</span>
            </div>
          ))}
        </div>
        <div className="min-w-52 flex-1 space-y-0.5">
          {[...todas].sort((a, b) => b.decisao.nota - a.decisao.nota).slice(0, 3).map((p) => (
            <button key={p.id} type="button" onClick={() => abrir(p.id)} className="flex w-full items-baseline gap-2 text-left text-xs hover:underline">
              <span className={cn('rounded px-1.5 font-bold tabular-nums', faixaDaNota(p.decisao.nota))}>{p.decisao.nota}</span>
              <span className="truncate">{p.titulo}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setBriefingAberto(true)}>Gerar briefing</Button>
          <Button size="sm" variant="outline" render={<Link href="/cerebro/mapa" />}>
            <Map className="size-3.5" />Mapa
          </Button>
          <Button size="sm" variant="outline" onClick={sincronizar} disabled={sincronizando} title="Relê o Cérebro agora, sem esperar o cache de 5 minutos.">
            <RefreshCw className={cn('size-3.5', sincronizando && 'animate-spin')} />
            {sincronizando ? 'Sincronizando…' : 'Sincronizar'}
          </Button>
          {quando && (
            <span className="text-xs text-muted-foreground">
              Atualizado {quando}
              {origem === 'seed' && ' · acervo semente'}
            </span>
          )}
        </div>
      </div>

      {/* ── Zonas B + C ── */}
      <div className="mt-4 grid items-start gap-4 min-[1200px]:grid-cols-[58fr_42fr]">
        <div>
          {SECOES.map((s) => {
            const grupo = filas[s.chave]
            if (grupo.length === 0 && s.chave !== 'agir') return null
            const fechada = fechadas.has(s.chave)
            return (
              <section key={s.chave} className="mb-1.5">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-0.5 py-1.5"
                  onClick={() =>
                    setFechadas((antes) => {
                      const prox = new Set(antes)
                      if (prox.has(s.chave)) prox.delete(s.chave)
                      else prox.add(s.chave)
                      return prox
                    })
                  }
                >
                  <span className={cn('text-[10px] text-muted-foreground transition-transform', fechada && '-rotate-90')}>▼</span>
                  <span className="text-[11px] font-bold uppercase tracking-wider">{s.rotulo}</span>
                  <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">{grupo.length}</span>
                </button>
                {!fechada &&
                  (grupo.length === 0 ? (
                    <p className="mb-2 px-2 text-xs text-muted-foreground">Nada pedindo ação imediata agora — bom sinal.</p>
                  ) : (
                    grupo.map((p) => (
                      <Linha key={p.id} pauta={p} ativa={p.id === selecionadaId} aoAbrir={() => abrir(p.id)} />
                    ))
                  ))}
              </section>
            )
          })}
          {todas.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              O Cérebro não tem nada acima do corte agora. Quando a leitura das fontes trouxer algo, aparece aqui.
            </div>
          )}
        </div>

        <Drawer
          key={selecionada?.id ?? 'vazio'}
          pauta={selecionada}
          sheet={sheet}
          fecharSheet={() => setSheet(false)}
          rel={selecionada ? relacionados[selecionada.id] : undefined}
          aoExplorar={() => selecionada && explorar(selecionada)}
        />
      </div>

      {briefingAberto && <BriefingModal filas={filas} quando={quando} fechar={() => setBriefingAberto(false)} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Linha da lista: decisão, título, fato, flags, nota                  */
/* ------------------------------------------------------------------ */

function flagsDe(p: PautaDoCerebro): { texto: string; alerta?: boolean }[] {
  const f: { texto: string; alerta?: boolean }[] = []
  if (p.agrupados?.quantidade) f.push({ texto: `+${p.agrupados.quantidade} boletins juntos` })
  if (p.midia) f.push({ texto: p.midia.podePublicar ? 'Mídia autorizada' : `Mídia: ${p.midia.direito}`, alerta: !p.midia.podePublicar })
  if (!p.fato.confiavel) f.push({ texto: 'Conferir fonte', alerta: true })
  else f.push({ texto: 'Fonte confiável' })
  return f.slice(0, 3)
}

function Linha({ pauta: p, ativa, aoAbrir }: { pauta: PautaDoCerebro; ativa: boolean; aoAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={aoAbrir}
      className={cn(
        'grid w-full grid-cols-[1fr_auto] items-center gap-x-3 border-l-[3px] border-t border-t-border/60 px-3 py-2.5 text-left',
        ativa ? 'border-l-primary bg-[#F7F4EF]' : 'border-l-transparent hover:bg-muted/40',
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide', CHIP_MODO[p.decisao.modo] ?? 'bg-muted')}>
          {p.decisao.modoRotulo}
        </span>
        <span className="truncate text-sm font-bold">{p.titulo}</span>
      </span>
      <span className={cn('row-span-2 justify-self-end rounded px-2 py-0.5 text-sm font-extrabold tabular-nums', faixaDaNota(p.decisao.nota))}>
        {p.decisao.nota}
      </span>
      <span className="col-start-1 truncate text-xs text-muted-foreground">
        {p.resumo || p.fato.fonte} · {p.fato.conta ?? p.fato.fonte}
      </span>
      <span className="col-start-1 mt-1 flex flex-wrap gap-1.5">
        {flagsDe(p).map((f) => (
          <span key={f.texto} className={cn('rounded bg-muted px-1.5 py-px text-[11px] font-medium text-muted-foreground', f.alerta && 'bg-[#FBE9EB] text-primary')}>
            {f.texto}
          </span>
        ))}
      </span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Drawer: a história inteira, com as ações                            */
/* ------------------------------------------------------------------ */

function Drawer({ pauta: p, sheet, fecharSheet, rel, aoExplorar }: {
  pauta: PautaDoCerebro | null
  sheet: boolean
  fecharSheet: () => void
  rel: 'carregando' | Relacionados | undefined
  aoExplorar: () => void
}) {
  const router = useRouter()
  const [ocupado, iniciar] = useTransition()
  const [erroAcao, setErroAcao] = useState('')
  const [recusando, setRecusando] = useState(false)
  const [fatoInteiro, setFatoInteiro] = useState(false)

  if (!p)
    return (
      <aside className="hidden rounded-xl border border-border bg-[#F7F4EF] p-8 text-center text-sm text-muted-foreground min-[1200px]:block">
        Selecione uma história para ver fato, raciocínio, o que não pode e o plano por canal.
      </aside>
    )

  const trazer = () => {
    setErroAcao('')
    const form = new FormData()
    form.set('sinalId', p.id)
    iniciar(async () => {
      const r = await importarDoCerebro(form)
      if (r.erro && !r.id) return setErroAcao(r.erro)
      if (r.id) router.push(r.abrirEm ? `/redes/${r.id}?destino=${r.abrirEm}` : `/redes/${r.id}`)
    })
  }

  const recusar = (motivo: MotivoRecusa) => {
    setErroAcao('')
    const form = new FormData()
    form.set('sinalId', p.id)
    form.set('motivo', motivo)
    iniciar(async () => {
      const r = await recusarSugestao(form)
      if (r.erro) return setErroAcao(r.erro)
      setRecusando(false)
      fecharSheet()
      router.refresh()
    })
  }

  return (
    <aside
      className={cn(
        'flex-col rounded-xl border border-border bg-[#F7F4EF] min-[1200px]:sticky min-[1200px]:top-4 min-[1200px]:flex min-[1200px]:max-h-[calc(100dvh-100px)]',
        sheet ? 'fixed inset-0 z-40 flex max-h-none rounded-none' : 'hidden',
      )}
    >
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide', CHIP_MODO[p.decisao.modo] ?? 'bg-muted')}>
            {p.decisao.modoRotulo}
          </span>
          <span className={cn('rounded px-2 py-0.5 text-sm font-extrabold tabular-nums', faixaDaNota(p.decisao.nota))}>{p.decisao.nota}</span>
          <span className="text-xs text-muted-foreground">{p.fato.conta ?? p.fato.fonte}</span>
          <button type="button" onClick={fecharSheet} aria-label="Fechar" className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted min-[1200px]:hidden">
            <X className="size-4" />
          </button>
        </div>
        <h2 className="text-base font-extrabold leading-snug text-balance">{p.titulo}</h2>

        {/* As ações moram no topo: quem abre a história decide sem caçar
            botão no fim de um drawer comprido. */}
        <div>
          {recusando ? (
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Por que não usar?</p>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(MOTIVOS_RECUSA) as MotivoRecusa[]).map((m) => (
                  <button key={m} type="button" disabled={ocupado} title={MOTIVOS_RECUSA[m].explica} onClick={() => recusar(m)}
                    className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
                    {MOTIVOS_RECUSA[m].rotulo}
                  </button>
                ))}
                <button type="button" className="px-2 text-xs text-muted-foreground hover:underline" onClick={() => setRecusando(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={trazer} disabled={ocupado}>{ocupado ? 'Trazendo…' : 'Trazer para pauta'}</Button>
              {!rel && (
                <Button size="sm" variant="outline" onClick={aoExplorar}>
                  <Sparkles className="size-3.5" />Explorar o assunto
                </Button>
              )}
              <Button size="sm" variant="ghost" className="text-primary" onClick={() => setRecusando(true)} disabled={ocupado}>
                Não usar
              </Button>
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-3">
            <a href={p.fato.url} target="_blank" rel="noreferrer noopener" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
              Ver na fonte <ExternalLink className="inline size-3" />
            </a>
            {p.urlNoCerebro && (
              <a href={p.urlNoCerebro} target="_blank" rel="noreferrer noopener" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                Raciocínio no Cérebro
              </a>
            )}
          </div>
          {erroAcao && <p className="mt-1 text-xs text-destructive">{erroAcao}</p>}
        </div>

        {p.midia && (
          <div className="relative overflow-hidden rounded-lg border border-border">
            <Image src={p.midia.url} alt="" width={640} height={360} unoptimized className="h-40 w-full bg-muted object-contain" />
            <span className={cn('absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', p.midia.podePublicar ? 'bg-emerald-500/15 text-emerald-700' : 'bg-white/85 text-primary')}>
              {p.midia.direito}
            </span>
            <span className="absolute bottom-2 right-2 max-w-[75%] truncate rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">{p.midia.credito}</span>
          </div>
        )}

        <Bloco titulo="Fato">
          {/* A legenda crua do Instagram tem até 2.200 caracteres; o fato do
              drawer são poucas linhas — o resto abre para quem quiser. */}
          <p className={cn('text-sm', !fatoInteiro && 'line-clamp-4')}>{p.resumo || p.titulo}</p>
          {(p.resumo?.length ?? 0) > 280 && (
            <button type="button" onClick={() => setFatoInteiro((v) => !v)} className="mt-0.5 text-xs font-semibold text-primary hover:underline">
              {fatoInteiro ? 'Encolher' : 'Ler o post inteiro'}
            </button>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {p.fato.fonte}
            {p.fato.conta ? ` (${p.fato.conta})` : ''} · {dataCurta(p.fato.quando)}
          </p>
        </Bloco>

        {/* A trava nobre, sempre aberta — nunca um accordion vazio. */}
        <div className="rounded-r-lg border-l-[3px] border-primary bg-[#F3F1ED] px-3 py-2.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B0E20]">O que não pode</span>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[13px]">
            {(p.proibido.length ? p.proibido : ['Nenhuma trava específica além das regras gerais do Movimento.']).map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>

        {rel && (
          <Bloco titulo="No mesmo assunto">
            {rel === 'carregando' ? (
              <p className="mt-1 animate-pulse text-xs text-muted-foreground">Buscando no acervo do Cérebro e no histórico da Casa…</p>
            ) : (
              <PainelRelacionados rel={rel} />
            )}
          </Bloco>
        )}

        <Bloco titulo="Plano por canal">
          <table className="mt-1 w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="border-b border-border py-1 pr-2 font-bold">Canal</th>
                <th className="border-b border-border py-1 pr-2 font-bold">Usar?</th>
                <th className="border-b border-border py-1 font-bold">Como</th>
              </tr>
            </thead>
            <tbody>
              {p.canais.map((c) => (
                <tr key={c.canal} className="align-top">
                  <td className="border-b border-border/50 py-1.5 pr-2 font-medium">{DESTINO_POR_CANAL[c.canal]?.rotulo ?? c.canal}</td>
                  <td className={cn('border-b border-border/50 py-1.5 pr-2 text-[11px] font-extrabold', c.usar ? 'text-[#1A7F45]' : 'text-primary')}>
                    {c.usar ? 'SIM' : 'NÃO'}
                  </td>
                  <td className="border-b border-border/50 py-1.5 text-muted-foreground">
                    {c.usar && c.formato ? `${c.formato} — ` : ''}
                    {c.texto}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Bloco>

        <Bloco titulo="Por que apareceu">
          <ul className="mt-1 list-disc space-y-1 pl-4 text-[13px]">
            {p.decisao.porque.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </Bloco>

        <Bloco titulo={`Evidências · ${1 + (p.agrupados?.quantidade ?? 0)} sinal(is)`}>
          <Evidencia titulo={p.titulo} meta={`${p.fato.conta ?? p.fato.fonte} · ${dataCurta(p.fato.quando)}`} url={p.fato.url} />
          {(p.agrupados?.outros ?? []).slice(0, 6).map((o) => (
            <Evidencia key={o.id} titulo={o.titulo} meta="boletim agrupado" url={(o as { url?: string }).url} />
          ))}
          {(p.agrupados?.quantidade ?? 0) > 6 && (
            <p className="mt-1 text-[11px] text-muted-foreground">e mais {(p.agrupados?.quantidade ?? 0) - 6} boletins da mesma família…</p>
          )}
        </Bloco>

        <Bloco titulo="Critérios do motor">
          {PERGUNTAS.map(([chave, rotulo]) => {
            const nota = p.decisao.notas[chave] ?? 0
            return (
              <div key={chave} className="mt-1.5 grid grid-cols-[110px_1fr_30px] items-center gap-2 text-xs">
                <span>{rotulo}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-[#E7E4DE]">
                  <span className="block h-full bg-foreground" style={{ width: `${Math.min(100, nota)}%` }} />
                </span>
                <b className="text-right tabular-nums">{nota}</b>
              </div>
            )
          })}
        </Bloco>
      </div>
    </aside>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{titulo}</span>
      {children}
    </div>
  )
}

function Evidencia({ titulo, meta, url }: { titulo: string; meta: string; url?: string }) {
  return (
    <div className="mt-1.5 rounded-lg border border-border bg-background px-2.5 py-2">
      <p className="text-xs">{titulo}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {meta}
        {url && (
          <>
            {' · '}
            <a href={url} target="_blank" rel="noreferrer noopener" className="font-semibold text-primary hover:underline">
              abrir original
            </a>
          </>
        )}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* "No mesmo assunto": imagens, sinais e matérias da Casa              */
/* ------------------------------------------------------------------ */

function PainelRelacionados({ rel }: { rel: Relacionados }) {
  if (rel.erro) return <p className="mt-1 text-xs text-destructive">{rel.erro}</p>
  const comImagem = rel.doCerebro.filter((r) => r.midia).slice(0, 6)
  const semNada = rel.doCerebro.length === 0 && rel.daCasa.length === 0 && rel.naImprensa.length === 0
  return (
    <div className="mt-1.5">
      {rel.palavras.length > 0 && (
        <p className="mb-2 flex flex-wrap items-baseline gap-1.5 text-[11px] text-muted-foreground">
          Busca:
          {rel.palavras.map((t) => (
            <span key={t} className="rounded bg-muted px-1.5 py-px font-medium text-foreground">{t}</span>
          ))}
        </p>
      )}
      {semNada && <p className="text-xs text-muted-foreground">Nada encontrado com esses termos — assunto inédito por enquanto.</p>}
      {rel.naImprensa.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Na imprensa</p>
          {rel.naImprensa.map((m) => (
            <a key={m.url} href={m.url} target="_blank" rel="noreferrer noopener" className="group flex items-baseline gap-2 border-t border-border/50 py-1.5 text-xs first:border-t-0">
              <span className="min-w-0 truncate group-hover:underline">{m.titulo}</span>
              <span className="ml-auto whitespace-nowrap text-[11px] text-muted-foreground">{m.fonte}</span>
            </a>
          ))}
        </div>
      )}
      {comImagem.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {comImagem.map((r) => (
            <a key={r.id} href={r.url} target="_blank" rel="noreferrer noopener" className="group relative overflow-hidden rounded-md border border-border" title={r.titulo}>
              <Image src={r.midia!} alt="" width={200} height={150} unoptimized className="aspect-[4/3] w-full bg-muted object-cover" />
              <span className="absolute inset-x-1 bottom-1 truncate rounded bg-black/60 px-1.5 py-0.5 text-[9.5px] text-white">
                {r.conta ?? r.fonte}
              </span>
            </a>
          ))}
        </div>
      )}
      {rel.daCasa.length > 0 && (
        <div className="mt-2">
          {rel.daCasa.map((m) => (
            <Link key={m.url} href={m.url} className="group flex items-baseline gap-2 border-t border-border/50 py-1.5 text-xs first:border-t-0">
              <span className="rounded bg-[#FBE9EB] px-1.5 text-[9.5px] font-extrabold uppercase tracking-wide text-primary">nossa</span>
              <span className="truncate group-hover:underline">{m.titulo}</span>
              <span className="ml-auto whitespace-nowrap text-[11px] text-muted-foreground">{m.status}</span>
            </Link>
          ))}
        </div>
      )}
      {rel.doCerebro.filter((r) => !r.midia).slice(0, 5).map((r) => (
        <a key={r.id} href={r.url} target="_blank" rel="noreferrer noopener" className="group flex items-baseline gap-2 border-t border-border/50 py-1.5 text-xs first:border-t-0">
          <span className="truncate group-hover:underline">{r.titulo}</span>
          <span className="ml-auto whitespace-nowrap text-[11px] text-muted-foreground">{r.conta ?? r.fonte} · {dataCurta(r.quando)}</span>
        </a>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Briefing do dia                                                     */
/* ------------------------------------------------------------------ */

function BriefingModal({ filas, quando, fechar }: { filas: Filas; quando: string | null; fechar: () => void }) {
  const linha = (ps: PautaDoCerebro[]) => ps.slice(0, 3).map((p) => p.titulo).join('; ') || '—'
  const texto = `Briefing Cérebro — ${quando ?? 'agora'}
AGIR: ${linha(filas.agir)}
PAUTAR: ${linha(filas.pautar)}
AGENDAR: ${linha(filas.agendar)}
MONITORAR: ${linha(filas.monitorar)}
Fonte: leitura das contas oficiais e do acervo documental. O Cérebro recomenda; quem decide é a Redação.`
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="dialog" aria-modal="true" onClick={fechar}>
      <div className="w-full max-w-xl rounded-xl border border-border bg-background" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <b className="text-sm">Briefing do dia</b>
          <Button size="sm" variant="outline" onClick={fechar}>Fechar</Button>
        </div>
        <pre className="m-4 max-h-[60dvh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-[#F7F4EF] p-3 font-mono text-xs leading-relaxed">
          {texto}
        </pre>
        <div className="flex justify-end border-t border-border px-4 py-3">
          <Button
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(texto)
                setCopiado(true)
              } catch {
                setCopiado(false)
              }
            }}
          >
            {copiado ? 'Copiado ✓' : 'Copiar briefing'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function dataCurta(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16)
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d)
}
