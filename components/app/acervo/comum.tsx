'use client'

import { useState } from 'react'
import { File, FileText, Film, Globe, ImageIcon, Inbox, Loader2, Lock, Music, RefreshCw, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FALHA_DE_REDE, OCUPADO_SEM_PERDER_FOCO, type Recado } from '@/components/app/transparencia/comum'
import { ORIGEM_DO_ACERVO } from '@/lib/acervo/paginas'
import { COLECAO, COLECOES, faltaParaPublicar, tipoDoArquivo, type Colecao, type Direitos, type Precisao } from '@/lib/acervo/regras'

/**
 * Peças comuns da tela /acervo: o item como a tela o recebe do servidor, os
 * diálogos que ela abre, os selos de situação, a prévia da imagem e o link de
 * download do original (link de 5 minutos, baixado na própria aba).
 */

/** Um item do catálogo (acervo_itens), montado em app/(app)/acervo/page.tsx. */
export type ItemNaTela = {
  id: string
  colecao: Colecao
  titulo: string
  descricao: string | null
  /** AAAA-MM-DD; com precisão de mês ou ano, o resto é 01. */
  dataItem: string | null
  dataPrecisao: Precisao
  autoria: string | null
  local: string | null
  direitos: Direitos
  credito: string | null
  textoAlternativo: string | null
  palavrasChave: string[]
  urlVideo: string | null
  /** Onde o arquivo está no bucket do acervo. */
  chave: string | null
  nomeOriginal: string | null
  tipoMime: string | null
  tamanho: number | null
  sha256: string | null
  largura: number | null
  altura: number | null
  publico: boolean
  slug: string | null
  publicadoEm: string | null
  atualizadoNoSiteEm: string | null
  /** A página do item no site: no ar, ou guardada de uma publicação anterior. */
  endereco: string | null
  /** Imagem pequena para o cartão (a versão de 480 px do site, ou um link assinado de 1 hora do original). */
  previa: string | null
  /** Imagem maior para a ficha completa. */
  previaGrande: string | null
  /** O original (link assinado), se a versão do site de um item público não abrir. */
  previaReserva: string | null
  criadoEm: string
  criadoPor: string | null
  atualizadoEm: string
  atualizadoPor: string | null
}

/**
 * Os diálogos da tela, um aberto por vez. A ficha completa (detalhe) é o
 * centro do item: editar, guardar, publicar e tirar do site voltam para ela,
 * com o recado do que aconteceu (`recado`) dentro dela.
 */
export type DialogoAberto =
  | { tipo: 'envio'; colecao?: Colecao }
  /** `vez` muda quando um recado novo chega com a ficha já aberta: ela se refaz e o recado recebe o foco. */
  | { tipo: 'detalhe'; id: string; recado?: Recado; vez?: number }
  /** A ficha volta para a publicação quando foi aberta dela, para corrigir o que falta; senão, para o detalhe. */
  | { tipo: 'ficha'; id: string; depois?: 'publicar' }
  | { tipo: 'publicar'; id: string; recado?: Recado }
  | { tipo: 'guardar' | 'tirar' | 'excluir'; id: string }

/** O andamento de "Atualizar as páginas do acervo" (em rodadas, quando há muitos itens). */
export type Progresso = { feitas: number; total: number } | null

export const ENDERECO_DO_ACERVO = `${ORIGEM_DO_ACERVO}/acervo/`

export const idDoCartao = (id: string) => `acervo-item-${id}`

/** O arquivo ainda está na caixa de entrada do bucket (sem a trava do acervo). */
export const naEntrada = (i: { chave: string | null }) => Boolean(i.chave?.startsWith('entrada/'))

/** A pasta da coleção para onde "Guardar na coleção" leva o arquivo (a mesma conta de lib/acervo/publicacao.ts). */
export const pastaDaColecao = (i: Pick<ItemNaTela, 'colecao' | 'dataItem' | 'criadoEm'>) => `${i.colecao}/${(i.dataItem ?? i.criadoEm).slice(0, 4)}/`

export function tamanhoLegivel(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1).replace('.', ',')} MB`
  return `${(bytes / 1024 ** 3).toFixed(2).replace('.', ',')} GB`
}

/** 12 → "12 itens", 1 → "1 item". */
export const quantidadeDeItens = (n: number) => `${n.toLocaleString('pt-BR')} ${n === 1 ? 'item' : 'itens'}`

// ---------------------------------------------------------------- tipo do arquivo

export type RotuloDoTipo = 'Imagem' | 'PDF' | 'Vídeo' | 'Áudio' | 'Documento' | 'Outro'

const ICONE_DO_TIPO: Record<RotuloDoTipo, LucideIcon> = {
  Imagem: ImageIcon, PDF: FileText, Vídeo: Film, Áudio: Music, Documento: FileText, Outro: File,
}

const DE_ESCRITORIO = /(msword|officedocument|opendocument|rtf|^text\/)/

export function rotuloDoTipo(i: Pick<ItemNaTela, 'tipoMime' | 'chave' | 'urlVideo'>): RotuloDoTipo {
  const tipo = tipoDoArquivo(i.tipoMime)
  if (tipo === 'imagem') return 'Imagem'
  if (tipo === 'pdf') return 'PDF'
  if (tipo === 'video' || (!i.chave && i.urlVideo)) return 'Vídeo'
  if (tipo === 'audio') return 'Áudio'
  return DE_ESCRITORIO.test((i.tipoMime ?? '').toLowerCase()) ? 'Documento' : 'Outro'
}

/** Só imagem, PDF e vídeo (pelo link do YouTube ou do Vimeo) vão para o site; o resto fica no acervo interno. */
export function podeIrAoSite(i: Pick<ItemNaTela, 'tipoMime' | 'colecao'>): boolean {
  const tipo = tipoDoArquivo(i.tipoMime)
  return tipo === 'imagem' || tipo === 'pdf' || tipo === 'video' || i.colecao === 'videos'
}

/** O que falta, pela ficha gravada, para o item poder ir ao site (a mesma regra que o servidor confere). */
export function faltaDoItem(i: ItemNaTela): string[] {
  return faltaParaPublicar({
    colecao: i.colecao, titulo: i.titulo, descricao: i.descricao, data_item: i.dataItem, data_precisao: i.dataPrecisao,
    autoria: i.autoria, local: i.local, direitos: i.direitos, credito: i.credito, texto_alternativo: i.textoAlternativo,
    palavras_chave: i.palavrasChave, url_video: i.urlVideo, tipo_mime: i.tipoMime, chave_r2: i.chave, tamanho: i.tamanho,
  })
}

// ---------------------------------------------------------------- prévia e selos

function SemPrevia({ rotulo, grande }: { rotulo: RotuloDoTipo; grande?: boolean }) {
  const Icone = ICONE_DO_TIPO[rotulo]
  return (
    <div className="flex size-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
      <Icone className={grande ? 'size-10' : 'size-8'} aria-hidden />
      <span className="text-xs font-semibold uppercase tracking-wide">{rotulo}</span>
    </div>
  )
}

/**
 * A imagem do item, ou o tipo do arquivo quando não há imagem. O link assinado
 * do R2 muda a cada ida ao servidor (depois de cada ação): a primeira URL vale
 * enquanto funcionar, para o navegador não baixar tudo de novo. Se ela vencer
 * (1 hora), vale a mais nova; depois, a reserva (o original de um item
 * público cuja versão do site não abriu); se nenhuma abrir (HEIC, TIFF…),
 * fica o tipo.
 */
export function Previa({ url, reserva, alt, rotulo, grande, className }: {
  url: string | null
  reserva?: string | null
  alt: string
  rotulo: RotuloDoTipo
  grande?: boolean
  className?: string
}) {
  const [primeira] = useState(url)
  const [primeiraReserva] = useState(reserva)
  const [falhas, setFalhas] = useState<string[]>([])
  const src = [primeira, url, primeiraReserva, reserva].find((u): u is string => typeof u === 'string' && !falhas.includes(u)) ?? null
  if (!src) return <SemPrevia rotulo={rotulo} grande={grande} />
  return (
    <img
      src={src}
      alt={alt}
      loading={grande ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFalhas((f) => [...f, src])}
      className={cn('size-full object-cover', className)}
    />
  )
}

const SELO = 'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold'
const TOM_DO_SELO = {
  site: 'bg-success/15 text-success',
  privado: 'bg-muted text-muted-foreground',
  entrada: 'bg-warning/25 text-warning-foreground',
} as const

/**
 * "No site" (com o link da página, quando `comLink`), "Privado" e "Na caixa de
 * entrada". No cartão, o link fica por cima do botão que cobre o cartão.
 */
export function SelosDoItem({ item, comLink = true }: { item: ItemNaTela; comLink?: boolean }) {
  return (
    <>
      {item.publico
        ? comLink && item.endereco
          ? (
            <a href={item.endereco} target="_blank" rel="noopener noreferrer" className={cn(SELO, TOM_DO_SELO.site, 'relative z-10 hover:underline')}>
              <Globe className="size-3" aria-hidden />No site<span className="sr-only"> (abre a página do item em outra aba)</span>
            </a>
          )
          : <span className={cn(SELO, TOM_DO_SELO.site)}><Globe className="size-3" aria-hidden />No site</span>
        : <span className={cn(SELO, TOM_DO_SELO.privado)}><Lock className="size-3" aria-hidden />Privado</span>}
      {naEntrada(item) && <span className={cn(SELO, TOM_DO_SELO.entrada)}><Inbox className="size-3" aria-hidden />Na caixa de entrada</span>}
    </>
  )
}

// ---------------------------------------------------------------- escolha da coleção

/**
 * As cinco coleções, com a ajuda de cada uma, para escolher uma (no envio e ao
 * catalogar um arquivo do bucket). O foco do diálogo começa na escolhida, ou
 * na primeira.
 */
export function EscolhaDeColecao({ idBase, legenda, valor, aoEscolher, desativada, ajuda }: {
  /** Os botões ganham o id `${idBase}-${coleção}` (para a tela levar o foco até eles). */
  idBase: string
  legenda: string
  valor: Colecao | null
  aoEscolher: (c: Colecao) => void
  desativada?: boolean
  ajuda?: string
}) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={desativada}>
      <legend className="mb-1 text-sm font-medium">{legenda}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {COLECOES.map((c, n) => (
          <label
            key={c}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:disabled]:cursor-default has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50"
          >
            <input
              type="radio"
              name={idBase}
              id={`${idBase}-${c}`}
              value={c}
              checked={valor === c}
              onChange={() => aoEscolher(c)}
              data-autofocus={(valor ? valor === c : n === 0) ? '' : undefined}
              className="mt-0.5 accent-primary"
            />
            <span className="flex flex-col">
              <span className="font-medium">{COLECAO[c].nome}</span>
              <span className="text-xs text-muted-foreground">{COLECAO[c].ajuda}</span>
            </span>
          </label>
        ))}
      </div>
      {ajuda && <p className="text-xs text-pretty text-muted-foreground">{ajuda}</p>}
    </fieldset>
  )
}

// ---------------------------------------------------------------- recado dentro de um diálogo

const ESTILO_DO_RECADO: Record<Recado['tipo'], string> = {
  ok: 'border-success/40 bg-success/5',
  aviso: 'border-warning/60 bg-warning/10',
  erro: 'border-destructive/40 bg-destructive/5 text-destructive',
}

/**
 * Com um diálogo aberto, o recado do pé da tela fica atrás dele: o que
 * acontece dentro do diálogo é dito dentro dele. A região existe sempre, para
 * o leitor de tela anunciar quando ela muda; o recado que já vem com o diálogo
 * (`focar`) recebe o foco, para ser lido logo que ele abre.
 */
export function RecadoNoDialogo({ recado, focar, acaoDoAviso }: { recado: Recado | null; focar?: boolean; acaoDoAviso?: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {recado && (
        <div
          tabIndex={focar ? -1 : undefined}
          data-autofocus={focar ? '' : undefined}
          className={cn('flex flex-col gap-1.5 rounded-lg border px-3 py-2 text-sm outline-none', ESTILO_DO_RECADO[recado.tipo])}
        >
          <p className="text-pretty">{recado.texto}</p>
          {recado.link && <a href={recado.link.href} target="_blank" rel="noopener noreferrer" className="self-start font-medium text-primary underline">{recado.link.rotulo}</a>}
          {recado.oferecerAtualizacao && acaoDoAviso}
        </div>
      )}
    </div>
  )
}

/** "Atualizar as páginas do acervo": no topo do catálogo e nos avisos de página que o site não refez. */
export function BotaoDeAtualizarPaginas({ atualizando, progresso, onAtualizar, size = 'default', variant = 'outline', className }: {
  atualizando: boolean
  progresso: Progresso
  onAtualizar: () => void
  size?: 'default' | 'sm'
  variant?: 'outline' | 'ghost'
  className?: string
}) {
  return (
    <Button type="button" size={size} variant={variant} className={cn(OCUPADO_SEM_PERDER_FOCO.className, className)} focusableWhenDisabled onClick={onAtualizar} disabled={atualizando}>
      {atualizando ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
      {atualizando ? (progresso ? `Atualizando… ${progresso.feitas} de ${progresso.total}` : 'Atualizando…') : 'Atualizar as páginas do acervo'}
    </Button>
  )
}

// ---------------------------------------------------------------- download

/**
 * Baixar o original: o servidor dá um link de 5 minutos, que já responde como
 * anexo (Content-Disposition: attachment, com o nome original). Seguir o link
 * na própria aba baixa o arquivo sem sair da tela — nada de aba nova em branco
 * nem de bloqueio de pop-up.
 */
export function useAbrirLink() {
  const [abrindo, setAbrindo] = useState<string | null>(null)
  async function abrir(chave: string, buscar: () => Promise<{ erro?: string; url?: string }>, avisar: (r: Recado) => void) {
    setAbrindo(chave)
    try {
      const r = await buscar()
      if (r.erro || !r.url) { avisar({ tipo: 'erro', texto: r.erro ?? 'Não foi possível abrir o arquivo.' }); return }
      const a = document.createElement('a')
      a.href = r.url
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch {
      avisar({ tipo: 'erro', texto: FALHA_DE_REDE })
    } finally {
      setAbrindo(null)
    }
  }
  return { abrindo, abrir }
}
