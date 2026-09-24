'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Bitcoin, ExternalLink, Loader2, Search, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { consultarCodigoNaTrilha } from '@/app/actions/trilha'
import { codigoEmGrupos, linkDeVerificacao } from '@/lib/auditoria/catalogo'
import { hashLegivel } from '@/lib/oficios/documento'
import {
  detalheDoEvento, diaLegivel, linkDaOrigem, linkDoBloco, numero, O_QUE_O_PUBLICO_VE, paginaDoDocumento, problemaDoCodigo, quando,
  ROTULO_DA_CLASSE, rotuloDaAcao, rotuloDoEstado, rotuloDoFluxo, rotuloDoPapel, rotuloDoTipo, tomDoEstado, type EventoDoItem, type ItemInterno,
} from './dados'
import { classeDoCabecalho, classeDoLink, Copiar, Rolagem, Selo } from './pecas'

type Achado =
  | { tipo: 'item'; item: ItemInterno }
  | { tipo: 'nada'; codigo: string }
  | { tipo: 'erro'; texto: string; formato: boolean }

const movimentoReduzido = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * O estado da consulta mora no painel, e não no formulário, porque a lista de
 * registros recentes também consulta (o botão "Histórico" de cada linha).
 */
export function useConsulta() {
  const [texto, setTexto] = useState('')
  const [achado, setAchado] = useState<Achado | null>(null)
  const [buscando, iniciar] = useTransition()
  const focarNoResultado = useRef(false)
  const secao = useRef<HTMLElement>(null)
  const titulo = useRef<HTMLHeadingElement>(null)

  function consultar(bruto: string, vindoDeOutroLugar = false) {
    if (buscando) return
    const valor = bruto.trim()
    setTexto(valor)
    const problema = problemaDoCodigo(valor)
    if (problema) { setAchado({ tipo: 'erro', texto: problema, formato: true }); return }
    focarNoResultado.current = vindoDeOutroLugar
    if (vindoDeOutroLugar) secao.current?.scrollIntoView({ behavior: movimentoReduzido() ? 'auto' : 'smooth', block: 'start' })
    iniciar(async () => {
      try {
        const r = await consultarCodigoNaTrilha(valor)
        setAchado(r.erro ? { tipo: 'erro', texto: r.erro, formato: false } : r.item ? { tipo: 'item', item: r.item } : { tipo: 'nada', codigo: valor })
      } catch {
        setAchado({ tipo: 'erro', texto: 'A consulta não chegou ao servidor. Confira a conexão e tente de novo.', formato: false })
      }
    })
  }

  // Quem pediu a consulta de outro ponto da tela (o histórico de uma linha da
  // lista, a versão nova de um item) é levado ao resultado: o foco vai junto.
  useEffect(() => {
    if (achado && focarNoResultado.current) {
      focarNoResultado.current = false
      titulo.current?.focus()
    }
  }, [achado])

  return { texto, setTexto, achado, buscando, consultar, secao, titulo }
}

export function ConsultaPorCodigo({ texto, setTexto, achado, buscando, consultar, secao, titulo }: ReturnType<typeof useConsulta>) {
  const invalido = achado?.tipo === 'erro' && achado.formato
  const aviso = buscando ? 'Consultando…'
    : achado?.tipo === 'item' ? `Registro encontrado: ${rotuloDoTipo(achado.item.tipo)}, ${rotuloDoEstado(achado.item.estado).toLowerCase()}.`
      : achado?.tipo === 'nada' ? 'Nenhum registro com esse código neste espaço.' : ''

  return (
    <section ref={secao} aria-labelledby="trilha-consultar" className="flex scroll-mt-4 flex-col gap-3">
      <div className="min-w-0">
        <h2 id="trilha-consultar" className="font-semibold">Consultar um código</h2>
        <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground text-pretty">
          Mostra o que a consulta pública mostraria e, só aqui, a história inteira do registro: cada evento, o papel de quem agiu e o hash de cada linha da cadeia.
        </p>
      </div>
      <Card className="flex flex-col gap-4 p-5">
        <form role="search" aria-label="Consultar um código na trilha" className="flex flex-col gap-1.5" onSubmit={(e) => { e.preventDefault(); consultar(texto) }}>
          <label htmlFor="trilha-codigo" className="text-sm font-medium">Código</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="trilha-codigo"
              name="codigo"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={80}
              placeholder="Cole o código aqui"
              aria-invalid={invalido || undefined}
              aria-describedby={invalido ? 'trilha-codigo-ajuda trilha-codigo-erro' : 'trilha-codigo-ajuda'}
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-sm tracking-wide outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 aria-invalid:border-destructive"
            />
            <Button type="submit" size="lg" className="h-10 aria-disabled:opacity-60" disabled={buscando} focusableWhenDisabled>
              {buscando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
              {buscando ? 'Consultando…' : 'Consultar'}
            </Button>
          </div>
          <p id="trilha-codigo-ajuda" className="text-xs text-muted-foreground">
            Os 26 caracteres da trilha (com ou sem hífens; O vale 0, I e L valem 1), os 32 impressos no rodapé do ofício ou o XXXX-XXXX do certificado.
          </p>
        </form>

        <p className="sr-only" aria-live="polite">{aviso}</p>

        {achado?.tipo === 'erro' && (
          <p id="trilha-codigo-erro" role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{achado.texto}</p>
        )}

        {achado?.tipo === 'nada' && (
          <div className="flex items-start gap-3 border-t border-border pt-5">
            <SearchX className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 text-sm">
              <h3 ref={titulo} tabIndex={-1} className="rounded-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                Nenhum registro com o código <span className="break-all font-mono">{achado.codigo}</span> neste espaço.
              </h3>
              <p className="mt-1 text-muted-foreground">
                Isso não prova falsificação: confira se o código foi copiado exatamente como está no documento. Documentos anteriores à trilha entram
                quando a rotina de pendências roda (em Rodar agora, “Registrar pendências agora”).
              </p>
            </div>
          </div>
        )}

        {achado?.tipo === 'item' && <ItemDetalhado item={achado.item} titulo={titulo} aoConsultar={(codigo) => consultar(codigo, true)} />}
      </Card>
    </section>
  )
}

function Campo({ rotulo, largo, children }: { rotulo: string; largo?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('min-w-0', largo && 'sm:col-span-2')}>
      <dt className="text-xs font-medium text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}

function Hash({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <span className="flex items-start gap-1">
      <code className="break-all font-mono text-xs">{hashLegivel(valor)}</code>
      <Copiar valor={valor} rotulo={rotulo} />
    </span>
  )
}

function ItemDetalhado({ item, titulo, aoConsultar }: { item: ItemInterno; titulo: React.RefObject<HTMLHeadingElement | null>; aoConsultar: (codigo: string) => void }) {
  const origem = linkDaOrigem(item.tipo, item.referencia_id)
  const pagina = paginaDoDocumento(item.tipo, item.codigo_externo)
  const lote = item.lote
  const bloco = lote?.bitcoin.bloco ?? null
  const sucessor = item.substituido_por

  return (
    <article aria-labelledby="trilha-item" className="flex flex-col gap-5 border-t border-border pt-5">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Selo tom={tomDoEstado(item.estado)}>{rotuloDoEstado(item.estado)}</Selo>
          <Selo tom="neutro">{rotuloDoTipo(item.tipo)}</Selo>
          {item.versao > 1 && <Selo tom="info">Versão {item.versao}</Selo>}
        </div>
        <div className="flex items-center gap-1">
          <h3 id="trilha-item" ref={titulo} tabIndex={-1} className="min-w-0 break-all rounded-sm font-mono text-lg font-semibold tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <span className="sr-only">Registro </span>{codigoEmGrupos(item.codigo)}
          </h3>
          <Copiar valor={item.codigo} rotulo="Copiar o código" />
        </div>
        {item.titulo && <p className="font-medium">{item.titulo}</p>}
        {O_QUE_O_PUBLICO_VE[item.classe] && <p className="text-xs text-muted-foreground">{O_QUE_O_PUBLICO_VE[item.classe]}</p>}
      </header>

      <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
        <Campo rotulo="Tipo">
          {rotuloDoTipo(item.tipo)}
          <span className="block text-xs text-muted-foreground">{ROTULO_DA_CLASSE[item.classe] ?? `Classe ${item.classe}`}</span>
        </Campo>
        <Campo rotulo="Estado">
          <Selo tom={tomDoEstado(item.estado)}>{rotuloDoEstado(item.estado)}</Selo>
          {item.estado_em && <span className="ml-2 text-xs text-muted-foreground">desde {quando(item.estado_em)}</span>}
        </Campo>
        <Campo rotulo="Registrado em">{quando(item.registrado_em)}</Campo>
        <Campo rotulo="Fluxo">{item.fluxo ? `${item.fluxo} · ${rotuloDoFluxo(item.fluxo)}` : '—'}</Campo>
        <Campo rotulo="Versão">
          {item.versao}
          {sucessor && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Substituída pela versão {sucessor.versao ?? 'mais nova'}:{' '}
              <button type="button" onClick={() => aoConsultar(sucessor.codigo)} className={cn(classeDoLink, 'font-mono')}>
                {codigoEmGrupos(sucessor.codigo)}<span className="sr-only"> — consultar a versão nova</span>
              </button>
            </span>
          )}
        </Campo>
        {item.codigo_externo && (
          <Campo rotulo="Código impresso no documento">
            <span className="flex items-center gap-1"><code className="break-all font-mono text-xs">{item.codigo_externo}</code><Copiar valor={item.codigo_externo} rotulo="Copiar o código impresso" /></span>
          </Campo>
        )}
        <Campo rotulo="Hash do conteúdo (SHA-256)" largo>{item.hash ? <Hash valor={item.hash} rotulo="Copiar o hash do conteúdo" /> : '—'}</Campo>
        {item.hash_arquivo && <Campo rotulo="Hash do arquivo (SHA-256)" largo><Hash valor={item.hash_arquivo} rotulo="Copiar o hash do arquivo" /></Campo>}
        {item.url && (
          <Campo rotulo="Endereço público" largo>
            <a href={item.url} target="_blank" rel="noreferrer" className={cn(classeDoLink, 'break-all')}>
              {item.url}<ExternalLink className="size-3.5 shrink-0" aria-hidden="true" /><span className="sr-only"> (abre em nova aba)</span>
            </a>
          </Campo>
        )}
        {item.certificado && (
          <>
            <Campo rotulo="Titular">{item.certificado.nome ?? '—'}</Campo>
            <Campo rotulo="Curso">{item.certificado.curso ?? '—'}</Campo>
            <Campo rotulo="Carga horária">{item.certificado.carga_horaria !== null ? `${numero(item.certificado.carga_horaria)} h` : '—'}</Campo>
            <Campo rotulo="Emitido em · válido até">{quando(item.certificado.emitido_em)} · {item.certificado.valido_ate ? quando(item.certificado.valido_ate) : 'sem validade'}</Campo>
          </>
        )}
        <Campo rotulo="Lote diário" largo>
          {lote ? (
            <>
              Lote de {diaLegivel(lote.dia)}
              <span className="mt-1 flex flex-wrap items-center gap-1.5">
                <Selo tom={lote.assinado ? 'ok' : 'aviso'}>{lote.assinado ? 'Assinado' : 'Sem assinatura'}</Selo>
                <Selo tom={lote.tsa ? 'ok' : 'neutro'}>{lote.tsa ? 'Carimbo RFC 3161' : 'RFC 3161 pendente'}</Selo>
                <Selo tom={lote.bitcoin.confirmado ? 'ok' : lote.ots ? 'aviso' : 'neutro'}>
                  <Bitcoin className="size-3" aria-hidden="true" /><span className="sr-only">Bitcoin: </span>
                  {lote.bitcoin.confirmado ? `Bloco ${bloco !== null ? numero(bloco) : '—'}` : lote.ots ? 'Aguardando bloco' : 'Na fila'}
                </Selo>
                {lote.bitcoin.confirmado && bloco !== null && (
                  <a href={linkDoBloco(bloco)} target="_blank" rel="noreferrer" className={cn(classeDoLink, 'text-xs')}>
                    ver o bloco<span className="sr-only"> {numero(bloco)} no mempool.space (abre em nova aba)</span><ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                )}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">Ainda fora de lote: entra no fechamento da próxima madrugada. Até lá, a consulta pública diz “prova em confirmação”.</span>
          )}
        </Campo>
        <Campo rotulo="Cadeia (conferência geral)">
          {!item.cadeia ? <span className="text-muted-foreground">Ainda não conferida</span>
            : item.cadeia.integra ? <>Íntegra<span className="block text-xs text-muted-foreground">na conferência de {quando(item.cadeia.verificada_em)}</span></>
              : <span className="font-medium text-destructive">Divergência na conferência de {quando(item.cadeia.verificada_em)}</span>}
        </Campo>
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" render={<a href={linkDeVerificacao(item.codigo)} target="_blank" rel="noreferrer" />}>
          <ExternalLink className="size-3.5" aria-hidden="true" />Página pública de conferência<span className="sr-only"> (abre em nova aba)</span>
        </Button>
        {origem && <Button variant="outline" size="sm" render={<Link href={origem.href} />}>{origem.rotulo}</Button>}
        {pagina && (
          <Button variant="outline" size="sm" render={<a href={pagina.href} target="_blank" rel="noreferrer" />}>
            <ExternalLink className="size-3.5" aria-hidden="true" />{pagina.rotulo}<span className="sr-only"> (abre em nova aba)</span>
          </Button>
        )}
      </div>

      <Historico eventos={item.eventos} />
    </article>
  )
}

function Historico({ eventos }: { eventos: EventoDoItem[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <h4 className="text-sm font-semibold">Histórico na trilha</h4>
        <p className="text-xs text-muted-foreground">Só a administração vê: a consulta pública nunca mostra papel, posição na cadeia nem motivo.</p>
      </div>
      {eventos.length ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <Rolagem rotulo="Histórico do registro">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <caption className="sr-only">Eventos do registro, na ordem da cadeia do fluxo</caption>
              <thead>
                <tr className={classeDoCabecalho}>
                  <th scope="col" className="px-3 py-2 text-right">Posição</th>
                  <th scope="col" className="px-3 py-2">Ação</th>
                  <th scope="col" className="px-3 py-2">Quando</th>
                  <th scope="col" className="px-3 py-2">Papel</th>
                  <th scope="col" className="px-3 py-2">Detalhe</th>
                  <th scope="col" className="px-3 py-2">Hash da linha</th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((e) => (
                  <tr key={`${e.ordem}-${e.hash}`} className="border-b border-border align-top last:border-0">
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{numero(e.ordem)}</td>
                    <th scope="row" className="px-3 py-2 text-left font-medium">{rotuloDaAcao(e.acao)}</th>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{quando(e.ocorrido_em)}</td>
                    <td className="px-3 py-2">{rotuloDoPapel(e.papel)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{detalheDoEvento(e)}</td>
                    <td className="px-3 py-2">{e.hash ? <code className="font-mono text-xs text-muted-foreground" title={e.hash}>{e.hash.slice(0, 16)}…</code> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Rolagem>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum evento gravado para este registro.</p>
      )}
    </div>
  )
}
