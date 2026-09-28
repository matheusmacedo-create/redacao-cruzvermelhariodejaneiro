'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { MAXIMO_DO_TEXTO, MAXIMO_DO_TITULO, paraAUrl, type OpcoesDoCartaz } from '@/lib/cartaz/copy'

export type ItemDoAlvo = { valor: string; nome: string }
export type ChamadaNoSeletor = { chave: string; nome: string; texto: string; titulo: [string, string] }

/**
 * A barra acima de um cartaz com QR: volta, imprime e escolhe a copy — o alvo
 * (setor, curso…), a chamada, e título e frase de apoio livres. Tudo vai para
 * a URL (o link montado pode ser mandado a outra pessoa). Some na impressão.
 */
export function BarraDeOpcoes({ rota, voltar, alvo, chamadaPadrao, opcoes, chamadas, nota }: {
  rota: string
  voltar: { href: string; rotulo: string }
  /** O seletor principal: o rótulo, o nome do parâmetro na URL e os itens. */
  alvo: { rotulo: string; parametro: string; itens: ItemDoAlvo[]; ajuda?: string }
  chamadaPadrao: string
  opcoes: OpcoesDoCartaz
  chamadas: ChamadaNoSeletor[]
  /** Uma linha abaixo das opções: para onde o QR leva, por exemplo. */
  nota?: string
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [titulo, setTitulo] = useState(opcoes.titulo)
  const [texto, setTexto] = useState(opcoes.texto)
  const atual = chamadas.find((c) => c.chave === opcoes.chamada) ?? chamadas[0]

  const ir = (mudou: Partial<OpcoesDoCartaz>) => iniciar(() => router.replace(`${rota}${paraAUrl({ ...opcoes, ...mudou }, alvo.parametro, chamadaPadrao)}`, { scroll: false }))

  // O que a pessoa digita vai para a URL depois de uma pausa, não a cada letra.
  useEffect(() => {
    if (titulo.trim() === opcoes.titulo && texto.trim() === opcoes.texto) return
    const t = setTimeout(() => ir({ titulo: titulo.trim(), texto: texto.trim() }), 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a digitação dispara
  }, [titulo, texto])

  const campo = 'h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900'

  return (
    <div className="mx-auto mb-5 flex w-[210mm] max-w-[calc(100vw-2rem)] flex-col gap-3 print:hidden">
      <div className="flex items-center justify-between gap-2">
        <Link href={voltar.href} className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-neutral-700 hover:bg-white/70">
          <ArrowLeft className="size-4" aria-hidden="true" /><span className="sm:hidden">Voltar</span><span className="max-sm:hidden">{voltar.rotulo}</span>
        </Link>
        <div className="flex items-center gap-2">
          {pendente ? <Loader2 className="size-4 animate-spin text-neutral-500" aria-label="Atualizando" /> : null}
          <button type="button" onClick={() => window.print()} className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[rgb(227_34_25)] px-4 text-sm font-semibold text-white hover:bg-[rgb(200_28_20)]" data-cartaz-imprimir>
            <Printer className="size-4" aria-hidden="true" /><span className="sm:hidden">Imprimir</span><span className="max-sm:hidden">Imprimir ou salvar PDF</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl bg-white p-4 shadow-sm sm:grid-cols-2" data-cartaz-opcoes>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">
          {alvo.rotulo}
          {/* Alvo novo, chamada padrão: a escolhida pode ser só de um alvo. Título e frase livres continuam. */}
          <select className={campo} value={opcoes.alvo} onChange={(e) => ir({ alvo: e.target.value, chamada: chamadaPadrao })} data-cartaz-alvo>
            {alvo.itens.map((i) => <option key={i.valor} value={i.valor}>{i.nome}</option>)}
          </select>
          {alvo.ajuda && <span className="text-xs font-normal text-neutral-500">{alvo.ajuda}</span>}
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">
          Chamada
          <select className={campo} value={atual?.chave ?? chamadaPadrao} onChange={(e) => ir({ chamada: e.target.value })} data-cartaz-chamada>
            {chamadas.map((c) => <option key={c.chave} value={c.chave}>{c.nome}</option>)}
          </select>
          <span className="text-xs font-normal text-neutral-500">{chamadas.length} {chamadas.length === 1 ? 'opção' : 'opções'}. O título e a frase livres, abaixo, valem por cima da chamada.</span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">
          Título <span className="sr-only">(opcional)</span>
          <input className={campo} value={titulo} maxLength={MAXIMO_DO_TITULO} placeholder={`Opcional. Ex.: ${atual?.nome ?? ''}`} onChange={(e) => setTitulo(e.target.value)} data-cartaz-titulo />
          <span className="text-xs font-normal text-neutral-500">Use | antes da parte que fica em vermelho: “{atual ? `${atual.titulo[0]}|${atual.titulo[1]}` : 'Quebrou?|Chame a Manutenção.'}”</span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">
          Frase de apoio <span className="sr-only">(opcional)</span>
          <input className={campo} value={texto} maxLength={MAXIMO_DO_TEXTO} placeholder={`Opcional. Ex.: ${atual?.texto ?? ''}`} onChange={(e) => setTexto(e.target.value)} data-cartaz-texto />
        </label>
        {nota && <p className="text-xs text-neutral-500 sm:col-span-2">{nota}</p>}
      </div>
    </div>
  )
}
