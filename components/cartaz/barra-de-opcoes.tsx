'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { MAXIMO_DO_TEXTO, MAXIMO_DO_TITULO, paraAUrl, type OpcoesDoCartaz } from '@/lib/cartaz/copy'

export type ItemDoAlvo = { valor: string; nome: string }
/** `nome` é o que o seletor mostra (o rótulo curto da chamada); `titulo` e `texto`, o que vai para a folha, servem de exemplo nos campos livres. */
export type ChamadaNoSeletor = { chave: string; nome: string; texto: string; titulo: [string, string] }

/**
 * A barra acima de um cartaz com QR: volta, imprime e escolhe a copy — o alvo
 * (setor, curso…), a chamada, e título e frase de apoio livres. Tudo vai para
 * a URL (o link montado pode ser mandado a outra pessoa). Some na impressão.
 *
 * O formulário é a única fonte do que a pessoa quer (`estado`); a URL é
 * derivada dele. Assim, trocar o setor enquanto o título ainda está sendo
 * digitado leva o título junto, e um pedido antigo nunca desfaz um novo.
 */
export function BarraDeOpcoes({ rota, voltar, alvo, chamadaPadrao, opcoes, chamadas, nota }: {
  rota: string
  voltar: { href: string; rotulo: string }
  /** O seletor principal: o rótulo, o nome do parâmetro na URL e os itens. */
  alvo: { rotulo: string; parametro: string; itens: ItemDoAlvo[]; ajuda?: string }
  chamadaPadrao: string
  /** As opções que o servidor leu da URL (já normalizadas: o alvo resolvido, o título cortado). */
  opcoes: OpcoesDoCartaz
  chamadas: ChamadaNoSeletor[]
  /** Uma linha abaixo das opções: para onde o QR leva, por exemplo. */
  nota?: string
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [estado, setEstado] = useState<OpcoesDoCartaz>(opcoes)
  const urlDe = (o: OpcoesDoCartaz) => paraAUrl({ ...o, titulo: o.titulo.trim(), texto: o.texto.trim() }, alvo.parametro, chamadaPadrao)
  /** A última URL pedida ao servidor (começa na que veio dele) e as opções desse pedido. */
  const pedida = useRef(urlDe(opcoes))
  const ultimoPedido = useRef(opcoes)
  const imprimirQuandoPronto = useRef(false)
  const atual = chamadas.find((c) => c.chave === estado.chamada) ?? chamadas[0]

  const pedir = (o: OpcoesDoCartaz) => {
    const u = urlDe(o)
    if (u === pedida.current) return
    pedida.current = u
    ultimoPedido.current = o
    iniciar(() => router.replace(`${rota}${u}`, { scroll: false }))
  }

  // Seletores vão para a URL na hora; o que a pessoa digita, depois de uma pausa.
  // Mudou o estado antes de o tempo passar, o pedido velho é cancelado (não dispara com opções antigas).
  useEffect(() => {
    if (urlDe(estado) === pedida.current) return
    const soDigitacao = estado.alvo === ultimoPedido.current.alvo && estado.chamada === ultimoPedido.current.chamada
    const t = setTimeout(() => pedir(estado), soDigitacao ? 600 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só o estado dispara; pedir/urlDe leem refs e props estáveis
  }, [estado])

  // Imprimir com edição pendente: manda o que falta e imprime quando a folha estiver atualizada.
  useEffect(() => {
    if (imprimirQuandoPronto.current && !pendente && urlDe(estado) === pedida.current) {
      imprimirQuandoPronto.current = false
      window.print()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reage ao fim da transição
  }, [pendente, opcoes])
  const imprimir = () => {
    if (!pendente && urlDe(estado) === pedida.current) { window.print(); return }
    imprimirQuandoPronto.current = true
    pedir(estado)
  }

  const campo = 'h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900'

  return (
    <div className="mx-auto mb-5 flex w-[210mm] max-w-[calc(100vw-2rem)] flex-col gap-3 print:hidden">
      <div className="flex items-center justify-between gap-2">
        <Link href={voltar.href} className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-neutral-700 hover:bg-white/70">
          <ArrowLeft className="size-4" aria-hidden="true" /><span className="sm:hidden">Voltar</span><span className="max-sm:hidden">{voltar.rotulo}</span>
        </Link>
        <div className="flex items-center gap-2">
          {pendente ? <Loader2 className="size-4 animate-spin text-neutral-500" aria-label="Atualizando" /> : null}
          <button type="button" onClick={imprimir} className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[rgb(227_34_25)] px-4 text-sm font-semibold text-white hover:bg-[rgb(200_28_20)]" data-cartaz-imprimir>
            <Printer className="size-4" aria-hidden="true" /><span className="sm:hidden">Imprimir</span><span className="max-sm:hidden">Imprimir ou salvar PDF</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl bg-white p-4 shadow-sm sm:grid-cols-2" data-cartaz-opcoes>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">
          {alvo.rotulo}
          {/* Alvo novo, chamada padrão: a escolhida pode ser só de um alvo. Título e frase livres continuam. */}
          <select className={campo} value={estado.alvo} onChange={(e) => setEstado((s) => ({ ...s, alvo: e.target.value, chamada: chamadaPadrao }))} data-cartaz-alvo>
            {alvo.itens.map((i) => <option key={i.valor} value={i.valor}>{i.nome}</option>)}
          </select>
          {alvo.ajuda && <span className="text-xs font-normal text-neutral-500">{alvo.ajuda}</span>}
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">
          Chamada
          <select className={campo} value={atual?.chave ?? chamadaPadrao} onChange={(e) => setEstado((s) => ({ ...s, chamada: e.target.value }))} data-cartaz-chamada>
            {chamadas.map((c) => <option key={c.chave} value={c.chave}>{c.nome}</option>)}
          </select>
          <span className="text-xs font-normal text-neutral-500">{chamadas.length} {chamadas.length === 1 ? 'opção' : 'opções'}. O título e a frase livres, abaixo, valem por cima da chamada.</span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">
          Título <span className="sr-only">(opcional)</span>
          <input className={campo} value={estado.titulo} maxLength={MAXIMO_DO_TITULO} placeholder={`Opcional. Ex.: ${atual ? `${atual.titulo[0]} ${atual.titulo[1]}`.trim() : ''}`} onChange={(e) => setEstado((s) => ({ ...s, titulo: e.target.value }))} data-cartaz-titulo />
          <span className="text-xs font-normal text-neutral-500">Use | antes da parte que fica em vermelho: “{atual ? `${atual.titulo[0]}|${atual.titulo[1]}` : 'Quebrou?|Chame a Manutenção.'}”</span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">
          Frase de apoio <span className="sr-only">(opcional)</span>
          <input className={campo} value={estado.texto} maxLength={MAXIMO_DO_TEXTO} placeholder={`Opcional. Ex.: ${atual?.texto ?? ''}`} onChange={(e) => setEstado((s) => ({ ...s, texto: e.target.value }))} data-cartaz-texto />
        </label>
        {nota && <p className="text-xs text-neutral-500 sm:col-span-2">{nota}</p>}
      </div>
    </div>
  )
}
