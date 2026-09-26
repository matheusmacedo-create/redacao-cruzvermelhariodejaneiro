'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, Check, Download, FileText, Loader2, Newspaper, NotebookPen, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { arquivarEnvio, marcarEmAvaliacao, transcreverEnvio, virarPauta } from '@/app/actions/envios'
import { tamanhoLegivel } from '@/lib/envios/regras'
import { cn } from '@/lib/utils'

export type ArquivoNaTela = {
  id: string; nome: string; categoria: 'foto' | 'video' | 'audio' | 'documento'; tamanho: number
  url: string; baixar: string; naBiblioteca: boolean; gravadoNaHora: boolean
}

/** Transcrever o áudio: a transcrição aparece aqui e entra na pauta e na matéria. */
export function Transcricao({ envioId, temAudio, inicial }: { envioId: string; temAudio: boolean; inicial: string | null }) {
  const [texto, setTexto] = useState(inicial ?? '')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [rodando, rodar] = useTransition()
  if (!temAudio && !texto) return null
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4" data-ajuda="envios.transcricao">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Transcrição do áudio</h2>
        {temAudio && (
          <Button size="sm" variant="outline" disabled={rodando} onClick={() => rodar(async () => {
            setErro(''); setAviso('')
            const r = await transcreverEnvio(envioId)
            if (r.erro) { setErro(r.erro); return }
            setTexto(r.texto ?? ''); setAviso(r.aviso ?? '')
          })}>
            {rodando ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {rodando ? 'Transcrevendo…' : texto ? 'Transcrever de novo' : 'Transcrever com IA'}
          </Button>
        )}
      </div>
      {texto ? <p className="whitespace-pre-line text-sm leading-relaxed">{texto}</p>
        : <p className="text-sm text-muted-foreground">O áudio vira texto em português, para ler rápido e aproveitar na matéria.</p>}
      {aviso && <p className="text-xs text-muted-foreground">{aviso}</p>}
      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </section>
  )
}

/**
 * O material do envio e o que fazer com ele: escolher o que vai para a
 * matéria (vai para a Biblioteca), criar pauta + matéria + posts, ou arquivar.
 */
export function MaterialEAcoes({ envioId, estado, arquivos, jaVirou }: {
  envioId: string; estado: string; arquivos: ArquivoNaTela[]; jaVirou: boolean
}) {
  const router = useRouter()
  const midias = arquivos.filter((a) => a.categoria === 'foto' || a.categoria === 'video')
  // Por padrão, todas as fotos e os vídeos que cabem na Biblioteca (300 MB).
  const [escolhidos, setEscolhidos] = useState<Set<string>>(() => new Set(midias.filter((a) => a.tamanho <= 300 * 1024 * 1024).map((a) => a.id)))
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [pronto, setPronto] = useState('')
  const [rodando, rodar] = useTransition()

  // Abrir o envio já o tira de "novo". Feito no navegador, e não no desenho da
  // página: pré-carregamento de link não pode marcar nada como visto.
  useEffect(() => { if (estado === 'novo') void marcarEmAvaliacao(envioId) }, [envioId, estado])

  function alternar(id: string) {
    setEscolhidos((atual) => { const n = new Set(atual); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function transformar(criarMateria: boolean) {
    setErro(''); setAviso('')
    rodar(async () => {
      const r = await virarPauta(envioId, [...escolhidos], criarMateria)
      if (r.erro) { setErro(r.erro); return }
      // Com aviso (um arquivo que não entrou na Biblioteca), fica na tela para a pessoa ler.
      if (r.aviso) { setAviso(r.aviso); setPronto(r.destino ?? ''); router.refresh(); return }
      if (r.destino) router.push(r.destino)
    })
  }
  function arquivar(sim: boolean) {
    setErro('')
    rodar(async () => { const r = await arquivarEnvio(envioId, sim); if (r.erro) setErro(r.erro); else router.refresh() })
  }

  const documentos = arquivos.filter((a) => a.categoria === 'documento')
  const audios = arquivos.filter((a) => a.categoria === 'audio')

  return (
    <div className="flex flex-col gap-4">
      {audios.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Áudios</h2>
          {audios.map((a) => (
            <div key={a.id} className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3">
              <span className="text-xs text-muted-foreground">{a.gravadoNaHora ? 'Gravado na hora' : a.nome} · {tamanhoLegivel(a.tamanho)}</span>
              <audio controls preload="metadata" src={a.url} className="w-full" />
            </div>
          ))}
        </section>
      )}

      {midias.length > 0 && (
        <section className="flex flex-col gap-2" data-ajuda="envios.fotos-e-videos">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Fotos e vídeos</h2>
            {!jaVirou && <p className="text-xs text-muted-foreground">Marque o que vai para a matéria e os posts ({escolhidos.size} de {midias.length})</p>}
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {midias.map((a) => {
              const marcado = escolhidos.has(a.id)
              return (
                <li key={a.id} className={cn('group relative overflow-hidden rounded-lg border bg-muted', !jaVirou && marcado ? 'border-primary ring-2 ring-primary/30' : 'border-border')}>
                  {a.categoria === 'foto'
                    ? <a href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.nome} loading="lazy" className="aspect-square w-full object-cover" /></a>
                    : <video src={a.url} controls preload="metadata" className="aspect-square w-full bg-black object-contain" />}
                  {!jaVirou && (
                    <label className="absolute left-1.5 top-1.5 flex size-8 cursor-pointer items-center justify-center rounded-md bg-white/90 shadow">
                      <input type="checkbox" checked={marcado} onChange={() => alternar(a.id)} className="size-4 accent-[var(--primary)]" aria-label={`Usar ${a.nome}`} />
                    </label>
                  )}
                  {a.naBiblioteca && <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white"><Check className="size-3" aria-hidden="true" />na Biblioteca</span>}
                  <div className="flex items-center justify-between gap-1 bg-card px-2 py-1 text-[11px] text-muted-foreground">
                    <span className="truncate">{tamanhoLegivel(a.tamanho)}</span>
                    <a href={a.baixar} className="inline-flex items-center gap-0.5 hover:text-foreground" aria-label={`Baixar ${a.nome}`}><Download className="size-3" aria-hidden="true" />original</a>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {documentos.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Documentos</h2>
          <ul className="flex flex-col gap-1.5">
            {documentos.map((a) => (
              <li key={a.id}><a href={a.baixar} className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"><FileText className="size-4" aria-hidden="true" />{a.nome} <span className="text-muted-foreground">({tamanhoLegivel(a.tamanho)})</span></a></li>
            ))}
          </ul>
        </section>
      )}

      {aviso && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <p>{aviso}</p>
          {pronto && <a href={pronto} className="w-fit font-semibold underline underline-offset-4">{pronto.startsWith('/redes/') ? 'Abrir o pacote (matéria e posts)' : 'Abrir a pauta'} →</a>}
        </div>
      )}
      {erro && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{erro}</p>}

      {!jaVirou && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-4" data-ajuda="envios.acoes">
          <p className="text-sm font-semibold">O que fazer com este envio</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => transformar(true)} disabled={rodando}>
              {rodando ? <Loader2 className="size-4 animate-spin" /> : <Newspaper className="size-4" />}Criar matéria e posts{escolhidos.size ? ` com ${escolhidos.size} arquivo${escolhidos.size > 1 ? 's' : ''}` : ''}
            </Button>
            <Button variant="outline" onClick={() => transformar(false)} disabled={rodando}><NotebookPen className="size-4" />Só criar a pauta</Button>
            {estado === 'arquivado'
              ? <Button variant="ghost" onClick={() => arquivar(false)} disabled={rodando}><ArchiveRestore className="size-4" />Tirar do arquivo</Button>
              : <Button variant="ghost" onClick={() => arquivar(true)} disabled={rodando}><Archive className="size-4" />Arquivar</Button>}
          </div>
          <p className="text-xs text-muted-foreground">
            &ldquo;Criar matéria e posts&rdquo; cria a pauta, copia os arquivos marcados para a Biblioteca (com o crédito de quem mandou) e abre o pacote de publicação com o relato como rascunho.
            Os originais continuam guardados no acervo.
          </p>
        </div>
      )}
    </div>
  )
}
