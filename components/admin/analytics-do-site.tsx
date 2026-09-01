'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Archive, BarChart3, Check, ExternalLink, FileText, Loader2, Trash2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ligarAnalyticsDoSite, materiasArquivadas, materiasNoAr, publicarPaginasDoSite,
  republicarMateriaAction, tirarMateriaDoArAction,
  type MateriaArquivada, type MateriaNoAr, type ResultadoDoAnalytics, type ResultadoDasPaginas,
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
export function AnalyticsDoSite() {
  const [resultado, setResultado] = useState<ResultadoDoAnalytics | null>(null)
  const [paginas, setPaginas] = useState<ResultadoDasPaginas | null>(null)
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
      <div className="mt-6 border-t border-border pt-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><FileText className="size-4" />Páginas de base e vitrine</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Publica a Política de Privacidade e os Termos de Uso (com o CNPJ e o endereço da filial), a central de
          notícias em /noticias/, o sitemap.xml e o robots.txt, e liga os atalhos de Notícias no menu e no rodapé da
          página inicial. Daqui em diante o índice e o sitemap se atualizam sozinhos a cada matéria publicada.
        </p>
        <div className="mt-3">
          <Button
            variant="outline"
            disabled={rodando}
            onClick={() => iniciar(async () => setPaginas(await publicarPaginasDoSite()))}
          >
            {rodando ? <><Loader2 className="size-4 animate-spin" />Publicando…</> : 'Publicar páginas do site'}
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

      <SecaoNoAr />
      </div>
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
    <div className="mt-6 border-t border-border pt-5">
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
