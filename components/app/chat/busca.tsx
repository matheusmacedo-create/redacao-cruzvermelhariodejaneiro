'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Paperclip, Search, X } from 'lucide-react'
import { buscarNoChat, type ResultadoDaBusca } from '@/app/actions/chat'
import { marcarBusca, resumoDaMensagem, tituloDaConversa, type PessoaDoChat } from '@/lib/chat/regras'
import { campo, quando } from './mensagem'

export type FiltrosDaBusca = { texto: string; aqui: boolean; autorId: string; soMencoes: boolean; comArquivos: boolean }
export const buscaVazia: FiltrosDaBusca = { texto: '', aqui: false, autorId: '', soMencoes: false, comArquivos: false }

/**
 * Busca em tudo que a pessoa pode ver no chat: texto e nome de arquivo, sem
 * acento, por começo de palavra. Filtros: esta conversa, uma pessoa, menções
 * a mim, só com arquivo. Clicar leva à mensagem (no fio, se for resposta).
 */
export function Busca({ inicial, canalId, tituloAqui, pessoas, nomeDe, onFechar }: {
  inicial: FiltrosDaBusca
  canalId: string
  tituloAqui: string
  pessoas: PessoaDoChat[]
  nomeDe: (id: string) => string
  onFechar: () => void
}) {
  const router = useRouter()
  const [f, setF] = useState(inicial)
  const [resultados, setResultados] = useState<ResultadoDaBusca[] | null>(null)
  const [erro, setErro] = useState('')
  const [buscando, iniciar] = useTransition()
  const caixa = useRef<HTMLInputElement>(null)
  const pedido = useRef(0)

  const buscar = (filtros: FiltrosDaBusca) => {
    const n = ++pedido.current
    const vazio = !filtros.texto.trim() && !filtros.soMencoes && !filtros.comArquivos && !filtros.autorId
    if (vazio) { setResultados(null); return }
    iniciar(async () => {
      const r = await buscarNoChat({ texto: filtros.texto, canalId: filtros.aqui ? canalId : null, autorId: filtros.autorId || null, soMencoes: filtros.soMencoes, comArquivos: filtros.comArquivos })
      if (n !== pedido.current) return
      setErro(r.erro ?? '')
      setResultados(r.resultados ?? [])
    })
  }
  const mudar = (novo: Partial<FiltrosDaBusca>) => { const g = { ...f, ...novo }; setF(g); if (!('texto' in novo)) buscar(g) }
  // Aberta por "Menções" ou "Arquivos", já busca; aberta pela lupa, espera o texto.
  const primeira = useRef(inicial)
  useEffect(() => { caixa.current?.focus(); buscar(primeira.current) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = (r: ResultadoDaBusca) => {
    const q = r.resposta_de ? `?fio=${r.resposta_de}&m=${r.id}` : `?m=${r.id}`
    router.push(`/chat/${r.canal_id}${q}`)
  }

  return (
    <aside className="flex w-full min-w-0 flex-col border-l border-border lg:w-96 lg:shrink-0" aria-label="Buscar no chat" data-busca>
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <p className="flex-1 font-semibold">Buscar</p>
        <button type="button" onClick={onFechar} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar a busca"><X className="size-4" /></button>
      </header>
      <form className="flex flex-col gap-2 border-b border-border p-3" onSubmit={(e) => { e.preventDefault(); buscar(f) }}>
        <label className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <input ref={caixa} value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} placeholder="Palavras ou nome de arquivo" maxLength={200}
            className={`${campo} pl-8`} aria-label="O que buscar" enterKeyHint="search" /></label>
        <div className="grid grid-cols-2 gap-2">
          <select value={f.aqui ? 'aqui' : 'tudo'} onChange={(e) => mudar({ aqui: e.target.value === 'aqui' })} className={`${campo} py-1.5`} aria-label="Onde buscar">
            <option value="tudo">Em todo o chat</option><option value="aqui">Só em {tituloAqui}</option>
          </select>
          <select value={f.autorId} onChange={(e) => mudar({ autorId: e.target.value })} className={`${campo} py-1.5`} aria-label="De quem">
            <option value="">De qualquer pessoa</option>
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-1.5"><input type="checkbox" className="size-4" checked={f.soMencoes} onChange={(e) => mudar({ soMencoes: e.target.checked })} />Menções a mim</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" className="size-4" checked={f.comArquivos} onChange={(e) => mudar({ comArquivos: e.target.checked })} />Com arquivos</label>
          <button type="submit" className="ml-auto text-xs font-medium text-primary hover:underline">Buscar</button>
        </div>
      </form>
      <div className="flex-1 overflow-y-auto p-2" aria-live="polite">
        {erro && <p className="m-2 rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive" role="alert">{erro}</p>}
        {buscando && <p className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Buscando…</p>}
        {!buscando && resultados === null && <p className="p-4 text-center text-sm text-muted-foreground">Escreva e tecle Enter. Vale começo de palavra e sem acento: “reun” acha “Reunião”.</p>}
        {!buscando && resultados?.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Nada encontrado.</p>}
        {!buscando && resultados && resultados.length > 0 && (
          <ul className="flex flex-col gap-1" data-resultados>
            {resultados.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => abrir(r)} className="w-full rounded-lg px-2.5 py-2 text-left hover:bg-muted">
                  <p className="flex items-baseline gap-1.5 text-xs text-muted-foreground">
                    <span className="truncate font-medium text-foreground">{tituloDaConversa({ tipo: r.canal_tipo, nome: r.canal_nome, pessoas: r.pessoas }, nomeDe)}</span>
                    {r.resposta_de && <span>· no fio</span>}
                    <span className="ml-auto shrink-0">{quando(r.created_at)}</span>
                  </p>
                  <p className="text-sm"><span className="font-semibold">{r.autor_id ? nomeDe(r.autor_id) : 'Alguém'}: </span>
                    {marcarBusca(resumoDaMensagem(r.corpo, 220), f.texto).map((t, i) => t.achou ? <mark key={i} className="rounded bg-warning/30 px-0.5 text-foreground">{t.valor}</mark> : <span key={i}>{t.valor}</span>)}
                  </p>
                  {(r.anexos ?? []).length > 0 && (
                    <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                      {r.anexos.map((a) => <span key={a.id} className="flex items-center gap-0.5"><Paperclip className="size-3" />{a.tipo === 'audio' ? 'Mensagem de voz' : a.nome}</span>)}
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
