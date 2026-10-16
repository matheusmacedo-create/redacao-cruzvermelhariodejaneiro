'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  ChevronRight, Download, ExternalLink, Eye, File, FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, Folder, FolderPlus,
  Loader2, Pencil, Presentation, RefreshCw, Trash2, TriangleAlert, Upload, Link2, ClipboardList, Shapes,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Campo, Confirmacao, Dialogo, FALHA_DE_REDE, OCUPADO_SEM_PERDER_FOCO, RegiaoDeRecados, Rodape, diaEHora, useRecado } from '@/components/app/transparencia/comum'
import {
  abrirNosArquivos, criarPastaNosArquivos, moverParaLixeiraNosArquivos, prepararEnvioAosArquivos, renomearNosArquivos,
  type ItemNaTela, type PastaAberta,
} from '@/app/actions/arquivos-do-setor'
import { cn } from '@/lib/utils'
import { MAXIMO_POR_ENVIO, ROTULO_DO_TIPO, TAMANHO_MAXIMO, tamanhoLegivel, type TipoDoItem } from '@/lib/arquivos/regras'

export type SetorNaTela = { id: string; nome: string }

const campo = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

const ICONE: Record<TipoDoItem, typeof File> = {
  pasta: Folder, documento: FileText, planilha: FileSpreadsheet, apresentacao: Presentation, formulario: ClipboardList, desenho: Shapes,
  atalho: Link2, pdf: FileText, imagem: FileImage, video: FileVideo, audio: FileAudio, texto: FileText, compactado: FileArchive, outro: File,
}

const urlDoItem = (setorId: string, id: string, modo: 'ver' | 'baixar') => `/api/arquivos/${setorId}/${encodeURIComponent(id)}?modo=${modo}`

// ---------------------------------------------------------------- o envio, fora do React

type Envio = { id: number; nome: string; estado: 'esperando' | 'enviando' | 'pronto' | 'erro'; progresso: number; erro?: string }

/** Arquivos subindo ao mesmo tempo. */
const SIMULTANEOS = 2

/** O arquivo vai do navegador direto ao Google, pela sessão de envio que o servidor abriu. */
function enviarAoGoogle(url: string, arquivo: File, aoAndar: (porcento: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', arquivo.type || 'application/octet-stream')
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && e.total > 0) aoAndar(Math.min(99, Math.floor((e.loaded / e.total) * 100))) }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`O Google recusou o arquivo (erro ${xhr.status}).`)))
    xhr.onerror = () => reject(new Error('A conexão caiu ou o navegador bloqueou o envio. Tente de novo.'))
    xhr.send(arquivo)
  })
}

// ---------------------------------------------------------------- a central

/**
 * Os Arquivos do setor: escolher o setor, andar nas pastas, criar pasta,
 * enviar, ver, baixar, renomear e mandar para a lixeira. Tudo passa pelas
 * actions de app/actions/arquivos-do-setor.ts, que conferem de novo no
 * servidor se a pessoa abre o setor e se o item mora na pasta dele.
 */
export function CentralDeArquivos({ setores, setorInicial }: { setores: SetorNaTela[]; setorInicial: string }) {
  const id = useId()
  const [setorId, setSetorId] = useState(setorInicial)
  const [pasta, setPasta] = useState<PastaAberta | null>(null)
  const [carregando, setCarregando] = useState<'pasta' | 'mais' | null>('pasta')
  const [erro, setErro] = useState<{ texto: string; pastaId?: string } | null>(null)
  const [recado, setRecado] = useRecado()
  const [dialogo, setDialogo] = useState<{ tipo: 'nova' } | { tipo: 'renomear'; item: ItemNaTela } | { tipo: 'lixeira'; item: ItemNaTela } | null>(null)
  const [envios, setEnvios] = useState<Envio[]>([])
  const enviando = envios.some((e) => e.estado === 'esperando' || e.estado === 'enviando')
  const seletor = useRef<HTMLInputElement>(null)
  // Só a resposta do pedido mais novo vale (quem clica rápido em duas pastas).
  const pedido = useRef(0)

  const abrir = useCallback(async (setor: string, pastaId?: string, focar = false) => {
    pedido.current += 1
    const n = pedido.current
    setCarregando('pasta')
    setErro(null)
    try {
      const r = await abrirNosArquivos(setor, pastaId)
      if (pedido.current !== n) return
      if (r.erro || !r.pasta) { setErro({ texto: r.erro ?? 'Não foi possível abrir a pasta.', pastaId }); return }
      setPasta(r.pasta)
      if (focar) requestAnimationFrame(() => document.getElementById(`${id}-titulo`)?.focus())
    } catch {
      if (pedido.current === n) setErro({ texto: FALHA_DE_REDE, pastaId })
    } finally {
      if (pedido.current === n) setCarregando(null)
    }
  }, [id])

  // A primeira abertura (o estado já começa em "abrindo"); as outras passam por abrir().
  useEffect(() => {
    pedido.current += 1
    const n = pedido.current
    abrirNosArquivos(setorInicial).then((r) => {
      if (pedido.current !== n) return
      setCarregando(null)
      if (r.erro || !r.pasta) setErro({ texto: r.erro ?? 'Não foi possível abrir a pasta.' })
      else setPasta(r.pasta)
    }, () => {
      if (pedido.current !== n) return
      setCarregando(null)
      setErro({ texto: FALHA_DE_REDE })
    })
  }, [setorInicial])

  function trocarSetor(novo: string) {
    if (novo === setorId || enviando) return
    setSetorId(novo)
    setPasta(null)
    // O endereço guarda o setor: recarregar ou mandar o link abre no mesmo lugar.
    window.history.replaceState(null, '', `/arquivos?setor=${novo}`)
    void abrir(novo)
  }

  async function carregarMais() {
    if (!pasta?.continuacao) return
    const atual = pasta
    const n = pedido.current
    setCarregando('mais')
    try {
      const r = await abrirNosArquivos(atual.setorId, atual.id, atual.continuacao ?? undefined)
      if (pedido.current !== n) return
      const mais = r.pasta
      if (r.erro || !mais) { setErro({ texto: r.erro ?? 'Não foi possível carregar mais itens.', pastaId: atual.id }); return }
      setPasta((p) => (p && p.id === mais.id ? { ...mais, itens: [...p.itens, ...mais.itens] } : p))
    } catch {
      if (pedido.current === n) setErro({ texto: FALHA_DE_REDE, pastaId: atual.id })
    } finally {
      if (pedido.current === n) setCarregando(null)
    }
  }

  async function enviar(lista: FileList | null) {
    if (!lista?.length || !pasta) return
    const arquivos = Array.from(lista)
    if (seletor.current) seletor.current.value = ''
    if (arquivos.length > MAXIMO_POR_ENVIO) { setRecado({ tipo: 'erro', texto: `Envie até ${MAXIMO_POR_ENVIO} arquivos de cada vez.` }); return }
    const grande = arquivos.find((a) => a.size > TAMANHO_MAXIMO)
    if (grande) { setRecado({ tipo: 'erro', texto: `“${grande.name}” tem ${tamanhoLegivel(grande.size)}; o limite pelo Palácio é ${tamanhoLegivel(TAMANHO_MAXIMO)}. Arquivo desse tamanho vai pelo próprio Google Drive.` }); return }
    const vazio = arquivos.find((a) => a.size === 0)
    if (vazio) { setRecado({ tipo: 'erro', texto: `“${vazio.name}” está vazio.` }); return }
    const destino = pasta
    const linhas: Envio[] = arquivos.map((a, n) => ({ id: Date.now() + n, nome: a.name, estado: 'esperando', progresso: 0 }))
    setEnvios(linhas)
    const mudar = (envioId: number, parte: Partial<Envio>) => setEnvios((atual) => atual.map((e) => (e.id === envioId ? { ...e, ...parte } : e)))
    let p: Awaited<ReturnType<typeof prepararEnvioAosArquivos>>
    try {
      p = await prepararEnvioAosArquivos(destino.setorId, destino.id, arquivos.map((a) => ({ nome: a.name, tipo: a.type, tamanho: a.size })))
    } catch {
      p = { erro: FALHA_DE_REDE }
    }
    const sessoes = p.envios
    if (p.erro || !sessoes || sessoes.length !== arquivos.length) {
      setEnvios((atual) => atual.map((e) => ({ ...e, estado: 'erro', erro: p.erro ?? 'Não foi possível preparar o envio.' })))
      return
    }
    let proximo = 0
    async function trabalhar() {
      while (proximo < arquivos.length) {
        const n = proximo
        proximo += 1
        const linha = linhas[n]
        mudar(linha.id, { estado: 'enviando' })
        let ultimo = 0
        try {
          await enviarAoGoogle(sessoes![n].url, arquivos[n], (porcento) => {
            if (porcento === ultimo) return
            ultimo = porcento
            mudar(linha.id, { progresso: porcento })
          })
          mudar(linha.id, { estado: 'pronto', progresso: 100 })
        } catch (causa) {
          mudar(linha.id, { estado: 'erro', erro: causa instanceof Error ? causa.message : FALHA_DE_REDE })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(SIMULTANEOS, arquivos.length) }, trabalhar))
    // A lista nova vem do Drive: o que chegou aparece com o nome e o tamanho que o Google guardou.
    void abrir(destino.setorId, destino.id)
  }

  const feito = (r: { erro?: string; recado?: string }, padrao: string) => {
    setDialogo(null)
    setRecado({ tipo: 'ok', texto: r.recado ?? padrao })
    if (pasta) void abrir(pasta.setorId, pasta.id)
  }

  const nomeDoSetor = setores.find((s) => s.id === setorId)?.nome ?? 'Setor'

  return (
    <div className="flex flex-col gap-5">
      {setores.length > 1 && (
        <div data-ajuda="arquivos.setores">
          <p className="mb-2 text-sm font-medium" id={`${id}-setores`}>Setor</p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${id}-setores`}>
            {setores.map((s) => (
              <Button key={s.id} type="button" size="sm" variant={s.id === setorId ? 'default' : 'outline'} aria-pressed={s.id === setorId} onClick={() => trocarSetor(s.id)} disabled={enviando && s.id !== setorId}>
                {s.nome}
              </Button>
            ))}
          </div>
        </div>
      )}

      <Card className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-2">
          <nav aria-label="Pasta aberta" data-ajuda="arquivos.caminho">
            <ol className="flex flex-wrap items-center gap-1 text-sm">
              {(pasta?.caminho ?? [{ id: '', nome: nomeDoSetor }]).map((d, n, todos) => (
                <li key={`${d.id}-${n}`} className="flex items-center gap-1">
                  {n > 0 && <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />}
                  {n === todos.length - 1 || !pasta
                    ? <span aria-current="location" className="break-all px-1 font-medium">{d.nome}</span>
                    : <button type="button" onClick={() => abrir(pasta.setorId, n === 0 ? undefined : d.id, true)} className="break-all rounded px-1 text-primary hover:underline">{d.nome}</button>}
                </li>
              ))}
            </ol>
          </nav>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 id={`${id}-titulo`} tabIndex={-1} className="break-all text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              {pasta?.caminho.at(-1)?.nome ?? nomeDoSetor}
            </h2>
            <div className="flex flex-wrap gap-2" data-ajuda="arquivos.acoes">
              <Button type="button" size="sm" variant="outline" onClick={() => setDialogo({ tipo: 'nova' })} disabled={!pasta || !pasta.podeAcrescentar || carregando === 'pasta'}><FolderPlus aria-hidden />Nova pasta</Button>
              <Button type="button" size="sm" onClick={() => seletor.current?.click()} disabled={!pasta || !pasta.podeAcrescentar || carregando === 'pasta' || enviando} {...OCUPADO_SEM_PERDER_FOCO}>
                {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}Enviar arquivos
              </Button>
              <input ref={seletor} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => enviar(e.target.files)} />
              <Button type="button" size="sm" variant="ghost" onClick={() => abrir(setorId, pasta?.id)} disabled={carregando !== null} {...OCUPADO_SEM_PERDER_FOCO}>
                {carregando === 'pasta' ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}Recarregar
              </Button>
            </div>
          </div>
        </div>

        {envios.length > 0 && <ListaDeEnvios envios={envios} onFechar={enviando ? undefined : () => setEnvios([])} />}

        <p className="sr-only" role="status">{carregando === 'pasta' ? 'Abrindo a pasta…' : carregando === 'mais' ? 'Carregando mais itens…' : ''}</p>
        {erro && (
          <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between" role="alert">
            <p className="flex items-start gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{erro.texto}</p>
            <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => abrir(setorId, erro.pastaId)}><RefreshCw aria-hidden />Tentar de novo</Button>
          </div>
        )}

        {!pasta && !erro && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />Abrindo a pasta do setor…</p>}

        {pasta && (
          <div className={cn('transition-opacity', carregando === 'pasta' && 'opacity-60')} aria-busy={carregando === 'pasta'} data-ajuda="arquivos.lista">
            {pasta.itens.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Pasta vazia. Use “Enviar arquivos” ou “Nova pasta” para começar.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {pasta.itens.map((item) => (
                  <LinhaDoItem key={item.id} item={item} setorId={pasta.setorId}
                    onAbrirPasta={() => abrir(pasta.setorId, item.id, true)}
                    onRenomear={() => setDialogo({ tipo: 'renomear', item })}
                    onLixeira={() => setDialogo({ tipo: 'lixeira', item })} />
                ))}
              </ul>
            )}
            {pasta.continuacao && (
              <Button type="button" variant="outline" size="sm" onClick={carregarMais} disabled={carregando !== null} focusableWhenDisabled className="mt-3 aria-disabled:opacity-60">
                {carregando === 'mais' && <Loader2 className="animate-spin" aria-hidden />}Mostrar mais
              </Button>
            )}
          </div>
        )}
      </Card>

      {dialogo?.tipo === 'nova' && pasta && (
        <DialogoDeNome titulo="Nova pasta" rotulo="Nome da pasta" inicial="" confirmar="Criar pasta" andamento="Criando…"
          executar={(nome) => criarPastaNosArquivos(pasta.setorId, pasta.id, nome)} onFeito={(r) => feito(r, 'Pasta criada.')} onFechar={() => setDialogo(null)} />
      )}
      {dialogo?.tipo === 'renomear' && pasta && (
        <DialogoDeNome titulo="Renomear" rotulo="Novo nome" inicial={dialogo.item.nome} confirmar="Salvar nome" andamento="Salvando…"
          executar={(nome) => renomearNosArquivos(pasta.setorId, dialogo.item.id, nome)} onFeito={(r) => feito(r, 'Nome salvo.')} onFechar={() => setDialogo(null)} />
      )}
      {dialogo?.tipo === 'lixeira' && pasta && (
        <Confirmacao titulo="Mover para a lixeira?" confirmar={{ rotulo: 'Mover para a lixeira', icone: <Trash2 className="size-4" aria-hidden /> }} destrutivo andamento="Movendo…"
          executar={() => moverParaLixeiraNosArquivos(pasta.setorId, dialogo.item.id)} onFeito={(r) => feito(r, 'Foi para a lixeira.')} onFechar={() => setDialogo(null)}>
          <p>“{dialogo.item.nome}” vai para a lixeira do Google Drive{dialogo.item.tipo === 'pasta' ? ', com tudo o que estiver dentro' : ''}. Dá para recuperar por lá em até 30 dias.</p>
        </Confirmacao>
      )}

      <RegiaoDeRecados recado={recado} onFechar={() => setRecado(null)} />
    </div>
  )
}

function LinhaDoItem({ item, setorId, onAbrirPasta, onRenomear, onLixeira }: { item: ItemNaTela; setorId: string; onAbrirPasta: () => void; onRenomear: () => void; onLixeira: () => void }) {
  const Icone = ICONE[item.tipo]
  const pasta = item.tipo === 'pasta'
  const soNoGoogle = item.tipo === 'formulario' || item.tipo === 'atalho'
  const detalhe = [ROTULO_DO_TIPO[item.tipo], item.modificadoEm ? `alterado em ${diaEHora(item.modificadoEm)}` : null, !pasta && item.tamanho !== null ? tamanhoLegivel(item.tamanho) : null].filter(Boolean).join(' · ')
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Icone className={cn('mt-0.5 size-5 shrink-0', pasta ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
        <div className="min-w-0">
          {pasta
            ? <button type="button" onClick={onAbrirPasta} className="break-all text-left text-sm font-medium hover:underline">{item.nome}</button>
            : soNoGoogle && item.linkNoGoogle
              ? <a href={item.linkNoGoogle} target="_blank" rel="noopener noreferrer" className="break-all text-sm font-medium hover:underline">{item.nome}</a>
              : <a href={urlDoItem(setorId, item.id, 'ver')} target="_blank" rel="noopener noreferrer" className="break-all text-sm font-medium hover:underline">{item.nome}</a>}
          <p className="text-xs text-muted-foreground">{detalhe}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 pl-8 sm:pl-0">
        {!pasta && !soNoGoogle && (
          <>
            <Button size="xs" variant="ghost" render={<a href={urlDoItem(setorId, item.id, 'ver')} target="_blank" rel="noopener noreferrer" />}><Eye aria-hidden />Ver<span className="sr-only"> {item.nome}</span></Button>
            <Button size="xs" variant="ghost" render={<a href={urlDoItem(setorId, item.id, 'baixar')} />}><Download aria-hidden />Baixar<span className="sr-only"> {item.nome}</span></Button>
          </>
        )}
        {item.linkNoGoogle && (
          <Button size="xs" variant="ghost" render={<a href={item.linkNoGoogle} target="_blank" rel="noopener noreferrer" />}><ExternalLink aria-hidden />Abrir no Google<span className="sr-only"> {item.nome}</span></Button>
        )}
        {item.podeEditar && (
          <>
            <Button size="xs" variant="ghost" type="button" onClick={onRenomear}><Pencil aria-hidden />Renomear<span className="sr-only"> {item.nome}</span></Button>
            <Button size="xs" variant="ghost" type="button" onClick={onLixeira} className="text-destructive hover:text-destructive"><Trash2 aria-hidden />Lixeira<span className="sr-only"> {item.nome}</span></Button>
          </>
        )}
      </div>
    </li>
  )
}

function ListaDeEnvios({ envios, onFechar }: { envios: Envio[]; onFechar?: () => void }) {
  const prontos = envios.filter((e) => e.estado === 'pronto').length
  const falhas = envios.filter((e) => e.estado === 'erro').length
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-medium" role="status">{prontos} de {envios.length} enviado{envios.length === 1 ? '' : 's'}{falhas ? ` · ${falhas} com erro` : ''}</p>
        {onFechar && <Button type="button" size="xs" variant="ghost" onClick={onFechar}>Fechar</Button>}
      </div>
      <ul className="flex flex-col gap-1.5">
        {envios.map((e) => (
          <li key={e.id} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">{e.nome}</span>
              <span className={cn('shrink-0 text-xs', e.estado === 'erro' ? 'text-destructive' : 'text-muted-foreground')}>
                {e.estado === 'esperando' ? 'Na fila' : e.estado === 'enviando' ? `${e.progresso}%` : e.estado === 'pronto' ? 'Enviado' : 'Erro'}
              </span>
            </div>
            {e.estado === 'enviando' && <div className="h-1 overflow-hidden rounded bg-border" aria-hidden><div className="h-full bg-primary transition-[width]" style={{ width: `${e.progresso}%` }} /></div>}
            {e.erro && <p className="text-xs text-destructive">{e.erro}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function DialogoDeNome({ titulo, rotulo, inicial, confirmar, andamento, executar, onFeito, onFechar }: {
  titulo: string
  rotulo: string
  inicial: string
  confirmar: string
  andamento: string
  executar: (nome: string) => Promise<{ erro?: string; recado?: string }>
  onFeito: (r: { erro?: string; recado?: string }) => void
  onFechar: () => void
}) {
  const [nome, setNome] = useState(inicial)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) { setErro('Dê um nome.'); return }
    setOcupado(true)
    setErro('')
    try {
      const r = await executar(nome)
      if (r.erro) { setErro(r.erro); return }
      onFeito(r)
    } catch {
      setErro(FALHA_DE_REDE)
    } finally {
      setOcupado(false)
    }
  }
  return (
    <Dialogo titulo={titulo} onFechar={onFechar} podeFechar={!ocupado}>
      <form onSubmit={salvar} className="flex flex-col gap-4" data-corpo>
        <Campo rotulo={rotulo}>
          {(p) => <input {...p} className={campo} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} data-autofocus autoComplete="off" />}
        </Campo>
        <Rodape erros={erro ? [erro] : []} andamento={ocupado ? andamento : ''}>
          <Button type="button" variant="outline" onClick={onFechar} disabled={ocupado}>Cancelar</Button>
          <Button type="submit" disabled={ocupado} {...OCUPADO_SEM_PERDER_FOCO}>{ocupado && <Loader2 className="animate-spin" aria-hidden />}{ocupado ? andamento : confirmar}</Button>
        </Rodape>
      </form>
    </Dialogo>
  )
}
