'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { FileText, Handshake, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { atualizarPaginaDoPortal } from '@/app/actions/transparencia'
import { AvisoDeLancamento, OCUPADO_SEM_PERDER_FOCO, RegiaoDeRecados, recadoDe, useRecado } from './comum'
import { Documentos, type DocumentoNaTela } from './documentos'
import { Parcerias, type ParceriaNaTela } from './parcerias'

export type Aba = 'documentos' | 'parcerias'

const ABAS: { id: Aba; rotulo: string; Icone: typeof FileText }[] = [
  { id: 'documentos', rotulo: 'Documentos', Icone: FileText },
  { id: 'parcerias', rotulo: 'Parcerias (MROSC)', Icone: Handshake },
]

/**
 * A tela /transparencia: o aviso do lançamento oculto, as duas abas e os
 * recados. A aba vai para o endereço (?aba=parcerias) para dar para mandar o
 * link certo a alguém.
 */
export function PainelDaTransparencia({ documentos, parcerias, trilhaDisponivel, aberto, endereco, hoje, abaInicial }: {
  documentos: DocumentoNaTela[]
  parcerias: ParceriaNaTela[]
  trilhaDisponivel: boolean
  aberto: boolean
  endereco: string
  hoje: string
  abaInicial: Aba
}) {
  const id = useId()
  const [aba, setAba] = useState<Aba>(abaInicial)
  const [recado, setRecado] = useRecado()
  const [atualizando, iniciar] = useTransition()
  const botoes = useRef<Partial<Record<Aba, HTMLButtonElement | null>>>({})

  const atualizarSite = () => iniciar(async () => {
    try {
      setRecado(recadoDe(await atualizarPaginaDoPortal(), 'Página do portal refeita no site com o que está publicado aqui.'))
    } catch {
      setRecado({ tipo: 'erro', texto: 'Não foi possível falar com o servidor. Confira a conexão e tente de novo.' })
    }
  })

  function trocar(nova: Aba, focar: boolean) {
    setAba(nova)
    if (focar) botoes.current[nova]?.focus()
    const url = new URL(window.location.href)
    if (nova === 'documentos') url.searchParams.delete('aba')
    else url.searchParams.set('aba', nova)
    window.history.replaceState(null, '', url)
  }

  // Setas, Home e End entre as abas, como pede o padrão de abas da WAI-ARIA.
  function teclado(e: React.KeyboardEvent) {
    const i = ABAS.findIndex((a) => a.id === aba)
    const destino = e.key === 'ArrowRight' ? ABAS[(i + 1) % ABAS.length]
      : e.key === 'ArrowLeft' ? ABAS[(i - 1 + ABAS.length) % ABAS.length]
        : e.key === 'Home' ? ABAS[0] : e.key === 'End' ? ABAS[ABAS.length - 1] : null
    if (!destino) return
    e.preventDefault()
    trocar(destino.id, true)
  }

  const contagem: Record<Aba, number> = { documentos: documentos.length, parcerias: parcerias.length }

  return (
    <div className="flex flex-col gap-5">
      <AvisoDeLancamento aberto={aberto} endereco={endereco} atualizando={atualizando} onAtualizar={atualizarSite} />

      <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Conteúdo do portal" onKeyDown={teclado} data-ajuda="transparencia.abas">
        {ABAS.map(({ id: a, rotulo, Icone }) => (
          <button
            key={a}
            ref={(el) => { botoes.current[a] = el }}
            type="button"
            role="tab"
            id={`${id}-aba-${a}`}
            aria-selected={aba === a}
            aria-controls={`${id}-painel-${a}`}
            tabIndex={aba === a ? 0 : -1}
            onClick={() => trocar(a, false)}
            className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${aba === a ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <Icone className="size-4" aria-hidden />{rotulo}<span className="text-xs tabular-nums text-muted-foreground">({contagem[a]})</span>
          </button>
        ))}
      </div>

      {/* As duas abas ficam montadas: trocar de aba não fecha o que estava aberto na outra. */}
      <div role="tabpanel" id={`${id}-painel-documentos`} aria-labelledby={`${id}-aba-documentos`} hidden={aba !== 'documentos'} tabIndex={-1} className="outline-none">
        <Documentos documentos={documentos} trilhaDisponivel={trilhaDisponivel} aberto={aberto} aoRecado={setRecado} painelId={`${id}-painel-documentos`} />
      </div>
      <div role="tabpanel" id={`${id}-painel-parcerias`} aria-labelledby={`${id}-aba-parcerias`} hidden={aba !== 'parcerias'} tabIndex={-1} className="outline-none">
        <Parcerias parcerias={parcerias} trilhaDisponivel={trilhaDisponivel} hoje={hoje} aoRecado={setRecado} painelId={`${id}-painel-parcerias`} />
      </div>

      <RegiaoDeRecados
        recado={recado}
        onFechar={() => setRecado(null)}
        acaoDoAviso={
          <Button size="sm" variant="outline" className={`self-start ${OCUPADO_SEM_PERDER_FOCO.className}`} focusableWhenDisabled onClick={atualizarSite} disabled={atualizando}>
            {atualizando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}Atualizar a página no site
          </Button>
        }
      />
    </div>
  )
}
