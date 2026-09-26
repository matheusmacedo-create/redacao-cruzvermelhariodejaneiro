'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Archive, BarChart3, Check, ExternalLink, FileText, Loader2, RefreshCw, Trash2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  estadoDoSite, ligarAnalyticsDoSite, materiasArquivadas, materiasNoAr, publicarPaginasDoSite,
  regerarPaginasDasNoticias, republicarMateriaAction, tirarMateriaDoArAction,
  type EstadoDoSite, type MateriaArquivada, type MateriaNoAr, type ResultadoDoAnalytics, type ResultadoDasPaginas,
} from '@/app/actions/site'
import { ID_DO_ANALYTICS } from '@/lib/site/analytics'

/**
 * O botão que completa o Google Analytics no site.
 *
 * Um botão, e não uma tarefa de terminal, pelo mesmo motivo do formulário da
 * newsletter: quem opera a Redação não abre FTP — e o segredo do FTP mora na
 * Vercel, onde esta ação roda. A tela mostra exatamente o que foi alterado,
 * porque "mexi no seu site inteiro" sem lista é pedido de confiança demais.
 */
const dataCurta = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

export function AnalyticsDoSite() {
  const [resultado, setResultado] = useState<ResultadoDoAnalytics | null>(null)
  const [paginas, setPaginas] = useState<ResultadoDasPaginas | null>(null)
  const [estado, setEstado] = useState<EstadoDoSite | null>(null)
  const [rodando, iniciar] = useTransition()

  // O cartão abre SABENDO o que já foi feito. Sem isto ele se oferecia para
  // sempre como pendência vermelha, mesmo depois de concluído — o mesmo
  // defeito do cartão do formulário na Newsletter, e a mesma lição:
  // alarme que não confere ensina a ser ignorado.
  const jaLeu = useRef(false)
  useEffect(() => {
    if (jaLeu.current) return
    jaLeu.current = true
    estadoDoSite().then((r) => setEstado(r.estado ?? {}))
  }, [])

  const analyticsFeito = Boolean(estado?.analytics) || Boolean(resultado?.recado)
  const paginasFeitas = Boolean(estado?.paginas) || Boolean(paginas?.recado)

  return (
    <div data-ajuda="configuracoes.site" className="mt-6 rounded-xl border border-border bg-card p-6">
      <h2 className="flex items-center gap-2 font-semibold"><BarChart3 className="size-4" />Google Analytics no site</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        O Analytics ({ID_DO_ANALYTICS}) é nativo: toda página que a Redação cria — matéria, central de notícias,
        privacidade, termos — já nasce com ele, sem precisar de botão. A varredura abaixo só existe para arquivos
        antigos ou colocados no servidor por fora, e pula o que já tem o rastreador.
      </p>
      {estado?.analytics && !resultado && (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-success">
          <Check className="size-4" />Varredura feita em {dataCurta(estado.analytics.quando)} — {estado.analytics.resumo}.
        </p>
      )}
      <div className="mt-4">
        <Button
          variant={analyticsFeito ? 'outline' : 'default'}
          disabled={rodando}
          onClick={() => iniciar(async () => setResultado(await ligarAnalyticsDoSite()))}
        >
          {rodando
            ? <><Loader2 className="size-4 animate-spin" />Percorrendo o site…</>
            : analyticsFeito ? 'Varrer de novo as páginas antigas' : 'Ligar o Analytics nas páginas do site'}
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
      <div className="mt-6 border-t border-border pt-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><FileText className="size-4" />Páginas de base e vitrine</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Publica a Política de Privacidade e os Termos de Uso (com o CNPJ e o endereço da filial), a central de
          notícias em /noticias/, o sitemap.xml e o robots.txt, e liga os atalhos de Notícias no menu e no rodapé da
          página inicial. Daqui em diante o índice e o sitemap se atualizam sozinhos a cada matéria publicada.
        </p>
        {estado?.paginas && !paginas && (
          <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-success">
            <Check className="size-4" />Publicadas em {dataCurta(estado.paginas.quando)}. Índice e sitemap se mantêm sozinhos.
          </p>
        )}
        <div className="mt-3">
          <Button
            variant="outline"
            disabled={rodando}
            onClick={() => iniciar(async () => setPaginas(await publicarPaginasDoSite()))}
          >
            {rodando
              ? <><Loader2 className="size-4 animate-spin" />Publicando…</>
              : paginasFeitas ? 'Publicar de novo (regrava tudo)' : 'Publicar páginas do site'}
          </Button>
        </div>
        {paginas?.erro && <p className="mt-3 text-sm text-destructive">{paginas.erro}</p>}
        {paginas?.recado && (
          <div className="mt-3 text-sm">
            <p className="flex items-center gap-1.5 font-medium text-success"><Check className="size-4" />{paginas.recado}</p>
            {(paginas.detalhes?.length ?? 0) > 0 && (
              <ul className="mt-2 rounded-lg border border-border bg-muted/30 p-2 text-xs">
                {paginas.detalhes!.map((d) => <li key={d}>{d}</li>)}
              </ul>
            )}
          </div>
        )}

      <RegerarNoticias />
      <SecaoNoAr />
      </div>
    </div>
  )
}

type Balanco = {
  feitas: number
  puladas: { titulo: string; motivo: string }[]
  falhas: { titulo: string; erro: string }[]
  avisos: { titulo: string; aviso: string }[]
  detalhes: string[]
}

/**
 * Regera todas as matérias no ar com o molde atual (cabeçalho, rodapé,
 * dados estruturados, fotos otimizadas) e, no fim, o índice, as páginas de
 * base, o sitemap e o robots.
 *
 * Cada página no site é um arquivo gravado no dia da publicação: corrigir o
 * gerador não corrige o que já está no ar. O servidor trabalha em rodadas
 * (até perto do limite de tempo da função) e diz de onde continuar; a tela
 * chama de novo até acabar, como em "Atualizar as páginas do acervo".
 */
function RegerarNoticias() {
  const [confirmando, setConfirmando] = useState(false)
  const [rodando, iniciar] = useTransition()
  const [progresso, setProgresso] = useState<{ vistas: number; total: number } | null>(null)
  const [balanco, setBalanco] = useState<Balanco | null>(null)
  const [erro, setErro] = useState('')

  function regerar() {
    setConfirmando(false); setErro(''); setBalanco(null); setProgresso(null)
    iniciar(async () => {
      const soma: Balanco = { feitas: 0, puladas: [], falhas: [], avisos: [], detalhes: [] }
      let continuacao: { depoisDe: string | null; soVitrine: boolean } | null = null
      let vistas = 0
      let semAvanco = 0
      try {
        for (;;) {
          const r = await regerarPaginasDasNoticias(continuacao)
          if (r.erro) { setErro(r.erro); break }
          soma.feitas += r.feitas ?? 0
          soma.puladas.push(...(r.puladas ?? []))
          soma.falhas.push(...(r.falhas ?? []))
          soma.avisos.push(...(r.avisos ?? []))
          if (r.vitrine) soma.detalhes.push(...r.vitrine.detalhes)
          vistas += r.vistas ?? 0
          setProgresso({ vistas, total: Math.max(r.total ?? 0, vistas) })
          if (!r.proximo) break
          // Rodada que não andou (uma matéria pesada demais para o tempo da
          // função, ou o site sem responder): tenta mais duas vezes e para.
          semAvanco = (r.vistas ?? 0) > 0 || r.vitrine ? 0 : semAvanco + 1
          if (semAvanco >= 3) { setErro('A regeração parou de avançar. Tente de novo em alguns minutos.'); break }
          continuacao = r.proximo
        }
      } catch {
        setErro('A conexão caiu no meio da regeração. O que já foi feito está no ar; rode de novo para terminar.')
      }
      setBalanco(soma)
      setProgresso(null)
    })
  }

  return (
    <div className="mt-6 border-t border-border pt-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><RefreshCw className="size-4" />Regerar as páginas das matérias</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Refaz no site todas as matérias publicadas com o molde atual — cabeçalho e rodapé do site, dados para o
        Google, fotos otimizadas — e, no fim, a central de notícias, a privacidade, os termos, o sitemap e o
        robots. Endereços e datas não mudam. Matéria com texto editado depois da última publicação fica de fora:
        essa se revisa e republica pela própria tela.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {confirmando ? (
          <>
            <span className="text-sm text-muted-foreground">Regravar todas as matérias no site?</span>
            <Button size="sm" disabled={rodando} onClick={regerar}><RefreshCw className="size-3.5" />Regerar agora</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmando(false)}>Cancelar</Button>
          </>
        ) : (
          <Button variant="outline" disabled={rodando} onClick={() => setConfirmando(true)}>
            {rodando
              ? <><Loader2 className="size-4 animate-spin" />{progresso ? `Regerando… ${progresso.vistas} de ${progresso.total}` : 'Regerando…'}</>
              : 'Regerar as páginas das matérias'}
          </Button>
        )}
      </div>
      {erro && <p className="mt-3 text-sm text-destructive">{erro}</p>}
      {balanco && !rodando && (
        <div className="mt-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-success">
            <Check className="size-4" />
            {balanco.feitas} matéria(s) regerada(s){balanco.puladas.length ? `, ${balanco.puladas.length} pulada(s)` : ''}{balanco.falhas.length ? `, ${balanco.falhas.length} com falha` : ''}.
          </p>
          {balanco.detalhes.length > 0 && (
            <ul className="mt-2 rounded-lg border border-border bg-muted/30 p-2 text-xs">
              {balanco.detalhes.map((d) => <li key={d}>{d}</li>)}
            </ul>
          )}
          {balanco.falhas.length > 0 && (
            <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs">
              {balanco.falhas.map((f, i) => <li key={`${f.titulo}-${i}`}><strong>{f.titulo}</strong>: {f.erro}</li>)}
            </ul>
          )}
          {balanco.puladas.length > 0 && (
            <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2 text-xs">
              {balanco.puladas.map((p, i) => <li key={`${p.titulo}-${i}`}><strong>{p.titulo}</strong>: {p.motivo}</li>)}
            </ul>
          )}
          {balanco.avisos.length > 0 && (
            <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2 text-xs">
              {balanco.avisos.map((a, i) => <li key={`${a.titulo}-${i}`}><strong>{a.titulo}</strong>: ficou fora da página — {a.aviso}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * O que está publicado em /noticias/ AGORA — com o verbo que faltava.
 *
 * A central de notícias e o sitemap listam tudo que tem site_url, e no dia em
 * que entraram no ar expuseram as matérias de teste publicadas meses antes:
 * "Teste1", "UASNASKADK…", na primeira página do noticiário, para o público e
 * para o Google. Publicar sempre teve botão; despublicar não existia.
 *
 * "Tirar do ar" apaga a pasta no servidor, limpa o endereço no registro e
 * regera o índice e o sitemap na mesma hora. É reversível: o slug fica, e
 * republicar volta ao mesmo endereço.
 */
function SecaoNoAr() {
  const [materias, setMaterias] = useState<MateriaNoAr[] | null>(null)
  const [erro, setErro] = useState('')
  const [recado, setRecado] = useState('')
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [tirando, iniciar] = useTransition()

  const [arquivadas, setArquivadas] = useState<MateriaArquivada[] | null>(null)

  const carregar = useCallback(async () => {
    const [noAr, fora] = await Promise.all([materiasNoAr(), materiasArquivadas()])
    if (noAr.erro) setErro(noAr.erro)
    else setMaterias(noAr.materias ?? [])
    if (!fora.erro) setArquivadas(fora.materias ?? [])
  }, [])

  const jaCarregou = useRef(false)
  useEffect(() => {
    if (jaCarregou.current) return
    jaCarregou.current = true
    carregar()
  }, [carregar])

  function republicar(m: MateriaArquivada) {
    setErro(''); setRecado('')
    iniciar(async () => {
      const form = new FormData()
      form.set('contentId', m.id)
      const r = await republicarMateriaAction(form)
      if (r.erro) { setErro(r.erro); return }
      setRecado(r.recado ?? 'De volta ao ar.')
      await carregar()
    })
  }

  function tirar(m: MateriaNoAr) {
    setErro(''); setRecado(''); setConfirmando(null)
    iniciar(async () => {
      const form = new FormData()
      form.set('contentId', m.id)
      const r = await tirarMateriaDoArAction(form)
      if (r.erro) { setErro(r.erro); return }
      setRecado(r.recado ?? 'A página saiu do ar.')
      await carregar()
    })
  }

  return (
    <div data-ajuda="configuracoes.no-ar" className="mt-6 border-t border-border pt-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><ExternalLink className="size-4" />No ar em /noticias/</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Tudo que a central de notícias e o sitemap mostram ao público agora. Tirar do ar apaga a página do servidor
        e a remove do índice e do sitemap na mesma hora — e é reversível: republicando, ela volta no mesmo endereço.
      </p>
      {erro && <p className="mt-3 text-sm text-destructive">{erro}</p>}
      {recado && <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-success"><Check className="size-4" />{recado}</p>}
      {materias === null && !erro && <p className="mt-3 text-sm text-muted-foreground">Carregando…</p>}
      {materias?.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Nenhuma matéria publicada no site.</p>}
      {(materias?.length ?? 0) > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {materias!.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <a href={m.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium hover:underline" title={m.url}>
                {m.titulo}
              </a>
              {m.publicadaEm && (
                <span className="text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat('pt-BR').format(new Date(m.publicadaEm))}
                </span>
              )}
              {confirmando === m.id ? (
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Apagar do servidor?</span>
                  <Button size="sm" variant="destructive" disabled={tirando} onClick={() => tirar(m)}>
                    {tirando ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}Tirar do ar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmando(null)}>Cancelar</Button>
                </span>
              ) : (
                <Button size="sm" variant="outline" disabled={tirando} onClick={() => setConfirmando(m.id)}>
                  Tirar do ar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* A pasta das arquivadas: nada do que saiu do ar se perdeu. O texto
          continua no banco, e daqui ele volta — no mesmo endereço. */}
      {(arquivadas?.length ?? 0) > 0 && (
        <div className="mt-5">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Archive className="size-3.5" />Arquivadas — fora do ar
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            O texto de cada uma continua guardado; republicar volta ao mesmo endereço de antes.
          </p>
          <ul className="mt-2 divide-y divide-border rounded-lg border border-dashed border-border">
            {arquivadas!.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-muted-foreground" title={`/noticias/${m.slug}/`}>{m.titulo}</span>
                <span className="font-mono text-[11px] text-muted-foreground">/{m.slug}/</span>
                <Button size="sm" variant="outline" disabled={tirando} onClick={() => republicar(m)}>
                  {tirando ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}Republicar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
