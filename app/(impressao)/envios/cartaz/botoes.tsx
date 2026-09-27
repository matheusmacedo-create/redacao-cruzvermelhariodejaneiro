'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Download, Loader2, Printer } from 'lucide-react'
import { CHAMADAS, FORMATOS, MAXIMO_DA_ACAO, MODELOS, nomeDoArquivo, paraAUrl, type OpcoesDoCartaz } from '@/lib/envios/cartaz'

/**
 * A barra acima do cartaz: formato, modelo, chamada e o nome da ação, que
 * vão para a URL (o link do cartaz montado pode ser mandado a outra pessoa).
 * Some na impressão. "Salvar como PDF" é o destino da própria janela de
 * impressão; o PNG vem de /api/envios/cartaz.
 */
export function BotoesDoCartaz({ opcoes }: { opcoes: OpcoesDoCartaz }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [acao, setAcao] = useState(opcoes.acao)

  const ir = (mudou: Partial<OpcoesDoCartaz>) => iniciar(() => router.replace(`/envios/cartaz${paraAUrl({ ...opcoes, ...mudou })}`, { scroll: false }))

  // O nome da ação vai para a URL depois de uma pausa na digitação, não a cada letra.
  useEffect(() => {
    if (acao.trim() === opcoes.acao) return
    const t = setTimeout(() => ir({ acao: acao.trim() }), 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a digitação dispara
  }, [acao])

  const png = `/api/envios/cartaz${paraAUrl(opcoes)}`
  const campo = 'h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900'

  return (
    <div className="mx-auto mb-5 flex w-[210mm] max-w-[calc(100vw-2rem)] flex-col gap-3 print:hidden">
      <div className="flex items-center justify-between gap-2">
        <Link href="/envios" className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-neutral-700 hover:bg-white/70">
          <ArrowLeft className="size-4" aria-hidden="true" /><span className="sm:hidden">Voltar</span><span className="max-sm:hidden">Envios da equipe</span>
        </Link>
        <div className="flex items-center gap-2">
          {pendente ? <Loader2 className="size-4 animate-spin text-neutral-500" aria-label="Atualizando" /> : null}
          <a href={png} download={nomeDoArquivo(opcoes)} className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 hover:bg-neutral-50">
            <Download className="size-4" aria-hidden="true" />Baixar PNG
          </a>
          {FORMATOS[opcoes.formato].imprime ? (
            <button type="button" onClick={() => window.print()} className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[rgb(227_34_25)] px-4 text-sm font-semibold text-white hover:bg-[rgb(200_28_20)]">
              <Printer className="size-4" aria-hidden="true" /><span className="sm:hidden">Imprimir</span><span className="max-sm:hidden">Imprimir ou salvar PDF</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl bg-white p-4 shadow-sm sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">
          Formato
          <select className={campo} value={opcoes.formato} onChange={(e) => ir({ formato: e.target.value as OpcoesDoCartaz['formato'] })}>
            {Object.entries(FORMATOS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
          </select>
          <span className="text-xs font-normal text-neutral-500">{FORMATOS[opcoes.formato].dica}</span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">
          Modelo
          <select className={campo} value={opcoes.modelo} onChange={(e) => ir({ modelo: e.target.value as OpcoesDoCartaz['modelo'] })}>
            {Object.entries(MODELOS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
          </select>
          <span className="text-xs font-normal text-neutral-500">{MODELOS[opcoes.modelo].dica}</span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">
          Chamada
          <select className={campo} value={opcoes.chamada} onChange={(e) => ir({ chamada: e.target.value as OpcoesDoCartaz['chamada'] })}>
            {Object.entries(CHAMADAS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">
          Nome da ação <span className="sr-only">(opcional)</span>
          <input className={campo} value={acao} maxLength={MAXIMO_DA_ACAO} placeholder="Opcional. Ex.: Plantão de Verão · Copacabana" onChange={(e) => setAcao(e.target.value)} />
        </label>
      </div>
    </div>
  )
}
