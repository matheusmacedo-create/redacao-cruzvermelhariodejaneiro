'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, CircleX, Clock, Loader2, Pencil, RotateCw, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialogo, FALHA_DE_REDE, OCUPADO_SEM_PERDER_FOCO, Rodape } from '@/components/app/transparencia/comum'
import { prepararEnvioAoAcervo, registrarNoAcervo, type EnvioPreparado } from '@/app/actions/acervo'
import { cn } from '@/lib/utils'
import { COLECOES, TAMANHO_MAXIMO, type Colecao } from '@/lib/acervo/regras'
import { EscolhaDeColecao, tamanhoLegivel } from './comum'

/** O servidor prepara até 50 links por pedido. */
const MAXIMO_POR_VEZ = 50
/** Arquivos subindo ao mesmo tempo. */
const SIMULTANEOS = 2
/** O link de envio vale 1 hora: arquivo que só começa depois de 50 minutos pede um link novo. */
const VALIDADE_DO_LINK_MS = 50 * 60_000

type Estado = 'esperando' | 'enviando' | 'conferindo' | 'pronto' | 'erro' | 'cancelado' | 'recusado'
type Linha = { id: number; arquivo: File; tipo: string; estado: Estado; progresso: number; erro?: string; itemId?: string }
type Link = { envio: EnvioPreparado; preparadoEm: number; enviado: boolean }
type Controle = { cancelado: boolean; links: Map<number, Link>; xhrs: Set<XMLHttpRequest> }

// ---------------------------------------------------------------- o envio, fora do React

/** Quando o navegador não sabe o tipo (HEIC no Windows, PDF como application/x-pdf…), vale a extensão. */
const TIPO_PELA_EXTENSAO: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif',
  mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
}

function tipoDoArquivoLocal(f: File): string {
  const t = f.type.toLowerCase()
  if (t === 'application/pdf' || /^(image|video|audio)\//.test(t)) return t
  const ext = /\.([a-z0-9]{1,5})$/i.exec(f.name)?.[1]?.toLowerCase()
  return (ext && TIPO_PELA_EXTENSAO[ext]) || t || 'application/octet-stream'
}

function problemaDoArquivo(f: File): string | null {
  if (f.size <= 0) return 'O arquivo está vazio.'
  if (f.size > TAMANHO_MAXIMO) return `Tem ${tamanhoLegivel(f.size)}; o limite é 2 GB por arquivo.`
  return null
}

const mesmoArquivo = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified

/** Erro já explicado para a pessoa (o resto vira "falha de rede"). */
class ErroDoEnvio extends Error {}
class EnvioCancelado extends Error {}

/** O arquivo vai do navegador direto ao R2, pelo link assinado, com o andamento. */
function enviarPorPut(url: string, arquivo: File, tipo: string, aoAndar: (porcento: number) => void, xhrs: Set<XMLHttpRequest>): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhrs.add(xhr)
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', tipo)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && e.total > 0) aoAndar(Math.min(99, Math.floor((e.loaded / e.total) * 100))) }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new ErroDoEnvio(xhr.status === 403 ? 'O link de envio venceu ou foi recusado. Tente de novo.' : `O armazenamento recusou o arquivo (erro ${xhr.status}).`))
    }
    xhr.onerror = () => reject(new ErroDoEnvio('A conexão caiu ou o navegador bloqueou o envio. Tente de novo.'))
    xhr.onabort = () => reject(new EnvioCancelado())
    xhr.onloadend = () => { xhrs.delete(xhr) }
    xhr.send(arquivo)
  })
}

/** Os links de envio de uma vez só, para a rodada inteira. Devolve o erro, se houver. */
async function prepararLinks(fila: Linha[], links: Map<number, Link>): Promise<string | null> {
  if (!fila.length) return null
  try {
    const p = await prepararEnvioAoAcervo(fila.map((l) => ({ nome: l.arquivo.name, tipo: l.tipo, tamanho: l.arquivo.size })))
    const envios = p.envios
    if (p.erro || !envios || envios.length !== fila.length) return p.erro ?? 'Não foi possível preparar o envio.'
    const agora = Date.now()
    fila.forEach((l, n) => links.set(l.id, { envio: envios[n], preparadoEm: agora, enviado: false }))
    return null
  } catch {
    return FALHA_DE_REDE
  }
}

/**
 * Um arquivo: o PUT no R2 e, com ele lá, a ficha no catálogo. Se o PUT já foi
 * e só a ficha falhou, tentar de novo não manda o arquivo outra vez.
 */
async function enviarUm(l: Linha, colecao: Colecao, c: Controle, mudar: (id: number, parte: Partial<Linha>) => void): Promise<void> {
  try {
    let link = c.links.get(l.id)
    if (!link || !link.enviado) {
      if (!link || Date.now() - link.preparadoEm > VALIDADE_DO_LINK_MS) {
        const p = await prepararEnvioAoAcervo([{ nome: l.arquivo.name, tipo: l.tipo, tamanho: l.arquivo.size }])
        if (p.erro || !p.envios?.[0]) throw new ErroDoEnvio(p.erro ?? 'Não foi possível preparar o envio.')
        link = { envio: p.envios[0], preparadoEm: Date.now(), enviado: false }
        c.links.set(l.id, link)
      }
      if (c.cancelado) throw new EnvioCancelado()
      mudar(l.id, { estado: 'enviando', progresso: 0, erro: undefined })
      let ultimo = 0
      await enviarPorPut(link.envio.url, l.arquivo, l.tipo, (porcento) => {
        if (porcento === ultimo) return
        ultimo = porcento
        mudar(l.id, { progresso: porcento })
      }, c.xhrs)
      link.enviado = true
    }
    mudar(l.id, { estado: 'conferindo', progresso: 100 })
    const r = await registrarNoAcervo({ chave: link.envio.chave, nome: link.envio.nome, tipo: l.tipo, colecao })
    if (r.erro || !r.id) throw new ErroDoEnvio(r.erro ?? 'Não foi possível registrar o arquivo.')
    mudar(l.id, { estado: 'pronto', itemId: r.id })
  } catch (causa) {
    if (causa instanceof EnvioCancelado) mudar(l.id, { estado: 'cancelado', progresso: 0 })
    else mudar(l.id, { estado: 'erro', erro: causa instanceof ErroDoEnvio ? causa.message : FALHA_DE_REDE })
  }
}

/** A fila, poucos arquivos por vez; cancelar para de puxar arquivo novo. */
async function enviarFila(fila: Linha[], colecao: Colecao, c: Controle, mudar: (id: number, parte: Partial<Linha>) => void): Promise<void> {
  let proxima = 0
  const trabalhar = async () => {
    while (!c.cancelado && proxima < fila.length) {
      const l = fila[proxima]
      proxima += 1
      await enviarUm(l, colecao, c, mudar)
    }
  }
  await Promise.all(Array.from({ length: Math.min(SIMULTANEOS, fila.length) }, trabalhar))
}

// ---------------------------------------------------------------- a tela

function textoDoEstado(l: Linha): string {
  switch (l.estado) {
    case 'esperando': return 'esperando'
    case 'enviando': return `enviando, ${l.progresso}%`
    case 'conferindo': return 'conferindo e criando a ficha…'
    case 'pronto': return 'no acervo'
    case 'cancelado': return 'não enviado (cancelado)'
    case 'erro':
    case 'recusado': return l.erro ?? 'não foi'
  }
}

function IconeDoEstado({ estado }: { estado: Estado }) {
  const classe = 'mt-0.5 size-4 shrink-0'
  switch (estado) {
    case 'esperando': return <Clock className={cn(classe, 'text-muted-foreground')} aria-hidden />
    case 'enviando':
    case 'conferindo': return <Loader2 className={cn(classe, 'animate-spin text-primary')} aria-hidden />
    case 'pronto': return <CircleCheck className={cn(classe, 'text-success')} aria-hidden />
    case 'cancelado': return <CircleX className={cn(classe, 'text-muted-foreground')} aria-hidden />
    case 'erro':
    case 'recusado': return <CircleAlert className={cn(classe, 'text-destructive')} aria-hidden />
  }
}

function LinhaDoArquivo({ linha, podeTirar, tirar }: { linha: Linha; podeTirar: boolean; tirar: () => void }) {
  const { arquivo, estado, progresso } = linha
  return (
    <li className="flex flex-col gap-1.5 px-3 py-2 text-sm">
      <div className="flex items-start gap-2">
        <IconeDoEstado estado={estado} />
        <div className="min-w-0 flex-1">
          <p className="break-all font-medium">{arquivo.name}</p>
          <p className={cn('text-xs', estado === 'erro' || estado === 'recusado' ? 'text-destructive' : 'text-muted-foreground')}>
            {tamanhoLegivel(arquivo.size)} · {textoDoEstado(linha)}
          </p>
        </div>
        {podeTirar && (
          <button type="button" onClick={tirar} aria-label={`Tirar ${arquivo.name} da lista`} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {(estado === 'enviando' || estado === 'conferindo') && (
        <div role="progressbar" aria-label={`Envio de ${arquivo.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso} className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${progresso}%` }} />
        </div>
      )}
    </li>
  )
}

/**
 * Enviar arquivos ao acervo: primeiro a coleção, depois os arquivos (vários,
 * escolhidos ou arrastados). Cada um vai do navegador direto ao R2 — a função
 * da Vercel não aceita corpo grande — e, chegando lá, ganha uma ficha privada.
 * No meio do envio o diálogo só fecha cancelando.
 */
export function EnvioAoAcervo({ colecaoInicial, onFechar, onEnviados, onAbrirFicha }: {
  colecaoInicial?: Colecao
  onFechar: () => void
  /** Chamado ao fim de cada rodada, para a lista do catálogo vir de novo. */
  onEnviados: () => void
  onAbrirFicha: (itemId: string) => void
}) {
  const id = useId()
  const [colecao, setColecao] = useState<Colecao | null>(colecaoInicial ?? null)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [fase, setFase] = useState<'escolha' | 'enviando' | 'fim'>('escolha')
  const [erro, setErro] = useState('')
  const [arrastando, setArrastando] = useState(false)
  const proximoId = useRef(1)
  const controle = useRef<Controle>({ cancelado: false, links: new Map(), xhrs: new Set() })

  // Fechar a aba no meio do envio perde o que ainda não subiu: o navegador pergunta antes.
  useEffect(() => {
    if (fase !== 'enviando') return
    const segurar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', segurar)
    return () => window.removeEventListener('beforeunload', segurar)
  }, [fase])

  // Terminada a rodada, o foco vai para o próximo passo (completar a ficha, ou fechar).
  useEffect(() => {
    if (fase === 'fim') document.getElementById(`${id}-proximo`)?.focus()
  }, [fase, id])

  // Arquivo solto fora da área de envio: sem isto, o navegador abre o arquivo e sai da Redação.
  useEffect(() => {
    const segurar = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', segurar)
    window.addEventListener('drop', segurar)
    return () => {
      window.removeEventListener('dragover', segurar)
      window.removeEventListener('drop', segurar)
    }
  }, [])

  // Saindo da tela (voltar do navegador), os envios em andamento param.
  useEffect(() => {
    const c = controle.current
    return () => {
      c.cancelado = true
      for (const x of c.xhrs) x.abort()
    }
  }, [])

  const mudar = (linhaId: number, parte: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.id === linhaId ? { ...l, ...parte } : l)))

  function adicionar(lista: FileList | null | undefined) {
    if (!lista?.length || fase !== 'escolha') return
    setErro('')
    const novas: Linha[] = []
    let validas = linhas.filter((l) => l.estado !== 'recusado').length
    let deFora = 0
    for (const f of Array.from(lista)) {
      if (linhas.some((l) => mesmoArquivo(l.arquivo, f)) || novas.some((l) => mesmoArquivo(l.arquivo, f))) continue
      const problema = problemaDoArquivo(f)
      if (!problema && validas >= MAXIMO_POR_VEZ) { deFora += 1; continue }
      if (!problema) validas += 1
      novas.push({ id: proximoId.current, arquivo: f, tipo: tipoDoArquivoLocal(f), estado: problema ? 'recusado' : 'esperando', progresso: 0, erro: problema ?? undefined })
      proximoId.current += 1
    }
    setLinhas([...linhas, ...novas])
    if (deFora) setErro(`Até ${MAXIMO_POR_VEZ} arquivos por vez: ${deFora === 1 ? '1 ficou' : `${deFora} ficaram`} de fora. Envie numa próxima rodada.`)
  }

  function tirar(linhaId: number) {
    setLinhas((ls) => ls.filter((l) => l.id !== linhaId))
    document.getElementById(`${id}-arquivos`)?.focus()
  }

  async function enviar(repetir: boolean) {
    if (!colecao) {
      setErro('Escolha a coleção antes de enviar.')
      document.getElementById(`${id}-colecao-${COLECOES[0]}`)?.focus()
      return
    }
    const fila = linhas.filter((l) => (repetir ? l.estado === 'erro' || l.estado === 'cancelado' : l.estado === 'esperando'))
    if (!fila.length) { setErro('Escolha pelo menos um arquivo que possa ser enviado.'); return }
    setErro('')
    const c = controle.current
    c.cancelado = false
    setFase('enviando')
    const naFila = new Set(fila.map((l) => l.id))
    setLinhas((ls) => ls.map((l) => (naFila.has(l.id) ? { ...l, estado: 'esperando', progresso: 0, erro: undefined } : l)))
    const falha = await prepararLinks(fila.filter((l) => !c.links.get(l.id)?.enviado), c.links)
    if (falha) {
      setErro(falha)
      setFase(repetir ? 'fim' : 'escolha')
      return
    }
    await enviarFila(fila, colecao, c, mudar)
    if (c.cancelado) setLinhas((ls) => ls.map((l) => (naFila.has(l.id) && l.estado === 'esperando' ? { ...l, estado: 'cancelado' } : l)))
    setFase('fim')
    onEnviados()
  }

  function cancelar() {
    const c = controle.current
    c.cancelado = true
    for (const x of c.xhrs) x.abort()
  }

  const conta = (...estados: Estado[]) => linhas.filter((l) => estados.includes(l.estado)).length
  const aEnviar = linhas.filter((l) => l.estado === 'esperando')
  const prontos = conta('pronto')
  const naoForam = conta('erro', 'cancelado')
  const emJogo = linhas.length - conta('recusado')
  const primeiro = linhas.find((l) => l.estado === 'pronto' && l.itemId)
  const andamento = fase === 'enviando'
    ? `Enviando: ${prontos} de ${emJogo} no acervo${naoForam ? `, ${naoForam} com problema` : ''}.`
    : fase === 'fim' ? `Envio terminado: ${prontos} de ${emJogo} no acervo${naoForam ? `, ${naoForam} não ${naoForam === 1 ? 'foi' : 'foram'}` : ''}.` : ''

  return (
    <Dialogo titulo="Enviar arquivos ao acervo" descricao="Tudo entra privado, na caixa de entrada do bucket." largura="max-w-2xl" onFechar={onFechar} podeFechar={fase !== 'enviando'}>
      <EscolhaDeColecao
        idBase={`${id}-colecao`}
        legenda="1. A coleção"
        valor={colecao}
        aoEscolher={(c) => { setColecao(c); setErro('') }}
        desativada={fase !== 'escolha'}
        ajuda="Todos os arquivos desta rodada entram nela. Dá para trocar depois, na ficha de cada um, enquanto ele não for ao site."
      />

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium" aria-hidden>2. Os arquivos</p>
        <label
          htmlFor={`${id}-arquivos`}
          onDragOver={(e) => { e.preventDefault(); if (!arrastando && fase === 'escolha') setArrastando(true) }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); adicionar(e.dataTransfer.files) }}
          className={cn(
            'flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center text-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30',
            fase === 'escolha' ? 'cursor-pointer hover:border-primary/60' : 'opacity-60',
            arrastando ? 'border-primary bg-primary/5' : 'border-border',
          )}
        >
          <Upload className="size-5 text-muted-foreground" aria-hidden />
          <span className="font-medium">Escolher arquivos</span>
          <span className="text-xs text-muted-foreground">ou arraste para cá · até {MAXIMO_POR_VEZ} por vez, até 2 GB cada</span>
          <input
            id={`${id}-arquivos`}
            type="file"
            multiple
            className="sr-only"
            disabled={fase !== 'escolha'}
            aria-describedby={`${id}-regras`}
            onChange={(e) => { adicionar(e.target.files); e.target.value = '' }}
          />
        </label>
        <ul id={`${id}-regras`} className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Cada arquivo ganha uma ficha privada: ninguém de fora vê. Depois, complete a ficha — é ela que diz o que é, de quando e de quem.</li>
          {colecao === 'videos' && <li>Vídeo: o original fica aqui; para aparecer no site, ele precisa estar também no YouTube ou no Vimeo.</li>}
          <li>Dado pessoal (CPF, laudo, documento de aluno ou voluntário) só entra com motivo, e nunca vai ao site.</li>
        </ul>
      </div>

      {linhas.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">
            {fase === 'escolha'
              ? `${aEnviar.length} ${aEnviar.length === 1 ? 'arquivo' : 'arquivos'} para enviar · ${tamanhoLegivel(aEnviar.reduce((t, l) => t + l.arquivo.size, 0))}`
              : `${prontos} de ${emJogo} no acervo`}
          </p>
          <ul className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {linhas.map((l) => <LinhaDoArquivo key={l.id} linha={l} podeTirar={fase === 'escolha'} tirar={() => tirar(l.id)} />)}
          </ul>
        </div>
      )}

      {fase === 'fim' && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm">
          {prontos > 0 && (
            <p className="flex items-start gap-2">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              <span>{prontos === 1 ? '1 arquivo entrou' : `${prontos} arquivos entraram`} no acervo, como {prontos === 1 ? 'item privado' : 'itens privados'}. Agora complete a ficha de cada um, pelo catálogo.</span>
            </p>
          )}
          {naoForam > 0 && (
            <p className="flex items-start gap-2 text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{naoForam === 1 ? '1 arquivo não foi' : `${naoForam} arquivos não foram`}. O motivo está na lista; dá para tentar de novo.</span>
            </p>
          )}
        </div>
      )}

      {/* Os mesmos botões mudam de papel de uma fase para a outra: quem está com o foco não o perde no meio do envio. */}
      <Rodape erros={erro ? [erro] : []} andamento={andamento}>
        <Button
          key="sair"
          type="button"
          variant="outline"
          id={fase === 'fim' && !primeiro ? `${id}-proximo` : undefined}
          onClick={fase === 'enviando' ? cancelar : onFechar}
        >
          {fase === 'enviando' ? 'Cancelar o envio' : fase === 'fim' ? 'Fechar' : 'Cancelar'}
        </Button>
        {fase === 'fim' && naoForam > 0 && (
          <Button key="repetir" type="button" variant="outline" onClick={() => enviar(true)}><RotateCw aria-hidden />Tentar de novo ({naoForam})</Button>
        )}
        {fase !== 'fim' && (
          <Button key="enviar" type="button" onClick={() => enviar(false)} disabled={fase === 'enviando'} {...OCUPADO_SEM_PERDER_FOCO}>
            {fase === 'enviando' ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
            {fase === 'enviando' ? 'Enviando…' : aEnviar.length > 1 ? `Enviar ${aEnviar.length} arquivos` : 'Enviar'}
          </Button>
        )}
        {fase === 'fim' && primeiro?.itemId && (
          <Button key="ficha" type="button" id={`${id}-proximo`} onClick={() => onAbrirFicha(primeiro.itemId!)}>
            <Pencil aria-hidden />Completar a ficha<span className="sr-only"> de {primeiro.arquivo.name}</span>
          </Button>
        )}
      </Rodape>
    </Dialogo>
  )
}
