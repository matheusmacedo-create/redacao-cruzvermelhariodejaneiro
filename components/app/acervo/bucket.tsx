'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Download, Eye, FilePlus2, Folder, Loader2, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialogo, FALHA_DE_REDE, OCUPADO_SEM_PERDER_FOCO, Rodape, diaEHora, useFocoDepoisDaLista, type Recado } from '@/components/app/transparencia/comum'
import { catalogarArquivoDoBucket, linkDoArquivoDoBucket, navegarNoAcervo, type PastaDoAcervo } from '@/app/actions/acervo'
import { cn } from '@/lib/utils'
import { ehColecao, type Colecao } from '@/lib/acervo/regras'
import { EscolhaDeColecao, tamanhoLegivel, useAbrirLink } from './comum'

/** O que o servidor não aceita como item: as cópias do site e os textos que explicam as pastas. */
const catalogavel = (chave: string) => !chave.startsWith('site/') && !chave.endsWith('/') && !/(^|\/)(LEIA-ME\.txt|_sobre-esta-pasta\.txt)$/.test(chave)

/** A coleção da pasta, para já vir marcada ao catalogar (fotos/2019/… → Fotos). */
const colecaoDaChave = (chave: string): Colecao | null => {
  const primeira = chave.split('/')[0]
  return ehColecao(primeira) ? primeira : null
}

/** O arquivo que marca a própria pasta (chave terminada em "/") não aparece na lista. */
const arquivosDa = (p: PastaDoAcervo) => p.arquivos.filter((a) => a.chave !== p.prefixo && !a.chave.endsWith('/'))

function NotaDaPasta({ prefixo }: { prefixo: string }) {
  if (!prefixo) {
    return (
      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li><span className="font-mono">entrada/</span> é a caixa de entrada, <strong className="text-foreground">sem trava</strong>: o que chegou e ainda não foi organizado. Os envios pela Redação caem em <span className="font-mono">entrada/redacao/</span>.</li>
        <li><span className="font-mono">site/</span> guarda cópias do site no ar, uma pasta por dia. Não entram no catálogo.</li>
        <li>Nas outras pastas (<span className="font-mono">documentos/</span>, <span className="font-mono">fotos/</span>…) vale a <strong className="text-foreground">trava de 30 dias</strong>: nada se apaga nem se troca antes disso.</li>
      </ul>
    )
  }
  const texto = prefixo.startsWith('entrada/')
    ? 'Caixa de entrada, sem trava: o que chegou e ainda não foi organizado.'
    : prefixo.startsWith('site/')
      ? 'Cópias do site no ar, uma pasta por dia. Servem de registro e não entram no catálogo.'
      : 'Pasta do acervo, com trava: nada aqui se apaga nem se troca por 30 dias depois do envio.'
  return <p className="text-xs text-muted-foreground">{texto}</p>
}

/**
 * A aba "Pastas do acervo": o bucket como pastas, para achar e baixar qualquer
 * arquivo — inclusive o que entrou por fora da Redação (painel da Cloudflare,
 * Cyberduck, rclone), que ganha ficha em "Catalogar". Abre na primeira vez que
 * a aba é mostrada.
 */
export function PastasDoAcervo({ ativa, podeGerenciar, aoRecado, abrirFicha, painelId }: {
  ativa: boolean
  podeGerenciar: boolean
  aoRecado: (r: Recado) => void
  abrirFicha: (itemId: string) => void
  painelId: string
}) {
  const id = useId()
  const router = useRouter()
  const [pasta, setPasta] = useState<PastaDoAcervo | null>(null)
  const [carregando, setCarregando] = useState<'pasta' | 'mais' | null>('pasta')
  const [erro, setErro] = useState<{ texto: string; prefixo: string; mais?: boolean } | null>(null)
  const [catalogando, setCatalogando] = useState<{ chave: string; indice: number } | null>(null)
  const iniciou = useRef(false)
  // Só a resposta do pedido mais novo vale (quem clica rápido em duas pastas).
  const pedido = useRef(0)
  const { abrindo, abrir } = useAbrirLink()
  const focarDepois = useFocoDepoisDaLista(pasta, painelId)

  useEffect(() => {
    if (!ativa || iniciou.current) return
    iniciou.current = true
    pedido.current += 1
    const n = pedido.current
    navegarNoAcervo('').then((r) => {
      if (pedido.current !== n) return
      setCarregando(null)
      if (r.erro || !r.pasta) setErro({ texto: r.erro ?? 'Não foi possível abrir o acervo.', prefixo: '' })
      else setPasta(r.pasta)
    }, () => {
      if (pedido.current !== n) return
      setCarregando(null)
      setErro({ texto: FALHA_DE_REDE, prefixo: '' })
    })
  }, [ativa])

  async function abrirPasta(prefixo: string) {
    pedido.current += 1
    const n = pedido.current
    setCarregando('pasta')
    setErro(null)
    try {
      const r = await navegarNoAcervo(prefixo)
      if (pedido.current !== n) return
      if (r.erro || !r.pasta) { setErro({ texto: r.erro ?? 'Não foi possível abrir a pasta.', prefixo }); return }
      setPasta(r.pasta)
      // O botão clicado some com a lista: o foco vai para o nome da pasta aberta.
      requestAnimationFrame(() => document.getElementById(`${id}-titulo`)?.focus())
    } catch {
      if (pedido.current === n) setErro({ texto: FALHA_DE_REDE, prefixo })
    } finally {
      if (pedido.current === n) setCarregando(null)
    }
  }

  async function carregarMais() {
    if (!pasta?.continuacao) return
    const atual = pasta
    const antes = arquivosDa(atual).length
    const n = pedido.current
    setCarregando('mais')
    setErro(null)
    try {
      const r = await navegarNoAcervo(atual.prefixo, atual.continuacao)
      if (pedido.current !== n) return
      const mais = r.pasta
      if (r.erro || !mais) { setErro({ texto: r.erro ?? 'Não foi possível carregar mais arquivos.', prefixo: atual.prefixo, mais: true }); return }
      setPasta((p) => (p && p.prefixo === mais.prefixo ? {
        ...mais,
        pastas: [...p.pastas, ...mais.pastas.filter((x) => !p.pastas.includes(x))],
        arquivos: [...p.arquivos, ...mais.arquivos],
        catalogados: { ...p.catalogados, ...mais.catalogados },
      } : p))
      // O botão some quando a pasta acaba: o foco vai para o primeiro arquivo novo.
      requestAnimationFrame(() => (document.getElementById(`${id}-arquivo-${antes}`) ?? document.getElementById(`${id}-titulo`))?.focus())
    } catch {
      if (pedido.current === n) setErro({ texto: FALHA_DE_REDE, prefixo: atual.prefixo, mais: true })
    } finally {
      if (pedido.current === n) setCarregando(null)
    }
  }

  if (!pasta) {
    return (
      <Card className="flex flex-col items-start gap-3 p-6 text-sm" aria-busy={carregando === 'pasta'}>
        {erro ? (
          <>
            <p className="flex items-start gap-2 text-destructive" role="alert"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{erro.texto}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => abrirPasta(erro.prefixo)}><RefreshCw aria-hidden />Tentar de novo</Button>
          </>
        ) : (
          <p className="flex items-center gap-2 text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" aria-hidden />Abrindo o acervo…</p>
        )}
      </Card>
    )
  }

  const partes = pasta.prefixo.split('/').filter(Boolean)
  const arquivos = arquivosDa(pasta)
  const nomeDaPasta = (p: string) => p.slice(pasta.prefixo.length).replace(/\/$/, '')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <nav aria-label="Pasta aberta">
          <ol className="flex flex-wrap items-center gap-1 text-sm">
            <li>
              {partes.length
                ? <button type="button" onClick={() => abrirPasta('')} className="rounded px-1 text-primary hover:underline">Acervo</button>
                : <span aria-current="location" className="px-1 font-medium">Acervo</span>}
            </li>
            {partes.map((p, n) => {
              const prefixo = `${partes.slice(0, n + 1).join('/')}/`
              return (
                <li key={prefixo} className="flex items-center gap-1">
                  <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
                  {n === partes.length - 1
                    ? <span aria-current="location" className="break-all px-1 font-medium">{p}</span>
                    : <button type="button" onClick={() => abrirPasta(prefixo)} className="break-all rounded px-1 text-primary hover:underline">{p}</button>}
                </li>
              )
            })}
          </ol>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id={`${id}-titulo`} tabIndex={-1} className="break-all text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              {partes.length ? `${partes[partes.length - 1]}/` : 'Pastas do acervo'}
            </h2>
            <NotaDaPasta prefixo={pasta.prefixo} />
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => abrirPasta(pasta.prefixo)} disabled={carregando !== null} {...OCUPADO_SEM_PERDER_FOCO}>
            {carregando === 'pasta' ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}Recarregar
          </Button>
        </div>
        {podeGerenciar && !pasta.prefixo && (
          <p className="text-xs text-pretty text-muted-foreground">Arquivo que entrou por fora da Redação (painel da Cloudflare, Cyberduck, rclone) aparece aqui: “Catalogar” dá a ele uma ficha no catálogo.</p>
        )}
      </div>

      <p className="sr-only" role="status">{carregando === 'pasta' ? 'Abrindo a pasta…' : carregando === 'mais' ? 'Carregando mais arquivos…' : ''}</p>
      {erro && (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between" role="alert">
          <p>{erro.texto}</p>
          <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => (erro.mais ? carregarMais() : abrirPasta(erro.prefixo))}>
            <RefreshCw aria-hidden />Tentar de novo
          </Button>
        </div>
      )}

      <div className={cn('flex flex-col gap-4 transition-opacity', carregando === 'pasta' && 'opacity-60')} aria-busy={carregando === 'pasta'}>
        {pasta.pastas.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Pastas">
            {pasta.pastas.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => abrirPasta(p)}
                  className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 truncate font-medium">{nomeDaPasta(p)}</span>
                  {p === 'entrada/' && <span className="ml-auto shrink-0 text-[11px] font-medium text-warning-foreground">sem trava</span>}
                  {p === 'site/' && <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">cópias do site</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        {arquivos.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">Arquivos em {pasta.prefixo || 'Acervo'}</caption>
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Nome</th>
                  <th scope="col" className="px-3 py-2 font-medium">Tamanho</th>
                  <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">Enviado em</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {arquivos.map((a, n) => {
                  const nome = a.chave.slice(pasta.prefixo.length)
                  const itemId = pasta.catalogados[a.chave]
                  return (
                    <tr key={a.chave}>
                      <td className="w-full max-w-0 px-3 py-2">
                        <span className="block break-all">{nome}</span>
                        {itemId && <span className="text-[11px] font-medium text-success">no catálogo</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">{tamanhoLegivel(a.tamanho)}</td>
                      <td className="hidden whitespace-nowrap px-3 py-2 text-muted-foreground sm:table-cell">{a.modificadoEm ? diaEHora(a.modificadoEm) : '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            id={`${id}-arquivo-${n}`}
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => abrir(a.chave, () => linkDoArquivoDoBucket(a.chave), aoRecado)}
                            disabled={abrindo === a.chave}
                            {...OCUPADO_SEM_PERDER_FOCO}
                          >
                            {abrindo === a.chave ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}Baixar<span className="sr-only"> {nome}</span>
                          </Button>
                          {itemId ? (
                            <Button id={`${id}-ficha-${n}`} type="button" size="sm" variant="ghost" onClick={() => abrirFicha(itemId)}>
                              <Eye aria-hidden />Ver ficha<span className="sr-only"> de {nome}</span>
                            </Button>
                          ) : podeGerenciar && catalogavel(a.chave) ? (
                            <Button type="button" size="sm" variant="ghost" onClick={() => setCatalogando({ chave: a.chave, indice: n })}>
                              <FilePlus2 aria-hidden />Catalogar<span className="sr-only"> {nome}</span>
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!pasta.pastas.length && !arquivos.length && <Card className="p-6 text-center text-sm text-muted-foreground">Pasta vazia.</Card>}

        {pasta.continuacao && (
          <div className="flex justify-center">
            <Button type="button" variant="outline" onClick={carregarMais} disabled={carregando !== null} {...OCUPADO_SEM_PERDER_FOCO}>
              {carregando === 'mais' && <Loader2 className="animate-spin" aria-hidden />}{carregando === 'mais' ? 'Carregando…' : 'Carregar mais'}
            </Button>
          </div>
        )}
      </div>

      {catalogando && (
        <Catalogar
          key={catalogando.chave}
          chave={catalogando.chave}
          onFechar={() => setCatalogando(null)}
          onFeito={(itemId) => {
            const { chave, indice } = catalogando
            setCatalogando(null)
            setPasta((p) => (p ? { ...p, catalogados: { ...p.catalogados, [chave]: itemId } } : p))
            focarDepois(`${id}-ficha-${indice}`)
            aoRecado({ tipo: 'ok', texto: 'Arquivo catalogado como item privado. Em “Ver ficha”, complete a ficha para poder publicar.' })
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

/** "Catalogar": o arquivo do bucket ganha ficha privada na coleção escolhida, e continua onde está. */
function Catalogar({ chave, onFechar, onFeito }: { chave: string; onFechar: () => void; onFeito: (itemId: string) => void }) {
  const id = useId()
  const [colecao, setColecao] = useState<Colecao | null>(() => colecaoDaChave(chave))
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (ocupado) return
    if (!colecao) { setErro('Escolha a coleção.'); return }
    iniciar(async () => {
      setErro('')
      try {
        const r = await catalogarArquivoDoBucket(chave, colecao)
        if (r.erro || !r.id) { setErro(r.erro ?? 'Não foi possível catalogar o arquivo.'); return }
        onFeito(r.id)
      } catch {
        setErro(FALHA_DE_REDE)
      }
    })
  }

  return (
    <Dialogo titulo="Catalogar arquivo" descricao={chave.split('/').pop() ?? chave} largura="max-w-xl" onFechar={onFechar} podeFechar={!ocupado}>
      <form className="flex flex-col gap-4" onSubmit={enviar}>
        <p className="text-sm text-pretty text-muted-foreground">
          O arquivo ganha uma ficha privada no catálogo, com o título tirado do nome. Ele continua onde está no bucket
          {chave.startsWith('entrada/') ? '; depois, “Guardar na coleção” o leva para a pasta com trava.' : '.'}
        </p>
        <EscolhaDeColecao idBase={`${id}-colecao`} legenda="Coleção" valor={colecao} aoEscolher={(c) => { setColecao(c); setErro('') }} desativada={ocupado} />
        <Rodape erros={erro ? [erro] : []} andamento={ocupado ? 'Catalogando: conferindo o arquivo no bucket…' : ''}>
          <Button type="button" variant="outline" onClick={onFechar} disabled={ocupado}>Cancelar</Button>
          <Button type="submit" disabled={ocupado} {...OCUPADO_SEM_PERDER_FOCO}>
            {ocupado ? <Loader2 className="animate-spin" aria-hidden /> : <FilePlus2 aria-hidden />}{ocupado ? 'Catalogando…' : 'Catalogar'}
          </Button>
        </Rodape>
      </form>
    </Dialogo>
  )
}
