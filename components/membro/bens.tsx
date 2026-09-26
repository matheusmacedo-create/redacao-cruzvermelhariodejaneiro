'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, CircleCheck, FileSignature, Package, TriangleAlert } from 'lucide-react'
import { aceitarTermoDoBem } from '@/app/actions/membro'
import type { BemComOVoluntario } from '@/lib/membro/bens'
import { dataCurta } from '@/lib/membro/regras'
import { cn } from '@/lib/utils'
import { botaoDoMembro } from './marca'
import { Secao, Selo } from './pecas'
import { RecadoEmFoco, RotuloDeEnvio } from './perfil'

function Aceitar({ id, aoAceitar }: { id: string; aoAceitar: () => void }) {
  const router = useRouter()
  const caixa = useRef<HTMLInputElement>(null)
  const [erro, setErro] = useState<{ texto: string; vez: number } | null>(null)
  const [lido, setLido] = useState(false)
  const [faltaMarcar, setFaltaMarcar] = useState(false)
  const [ocupado, iniciar] = useTransition()
  const idDaCaixa = `aceite-${id}`

  // O botão fica sempre ativo: desativado, não dizia o que faltava. Sem a
  // caixa marcada, o aviso aparece logo abaixo dela e o foco vai para lá.
  function aceitar() {
    if (!lido) {
      setFaltaMarcar(true)
      caixa.current?.focus()
      return
    }
    iniciar(async () => {
      setErro(null)
      const r = await aceitarTermoDoBem(id)
      if (r.erro) setErro((e) => ({ texto: r.erro!, vez: (e?.vez ?? 0) + 1 }))
      else { aoAceitar(); router.refresh() }
    })
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div>
        <label htmlFor={idDaCaixa} className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm">
          <input ref={caixa} id={idDaCaixa} type="checkbox" checked={lido} className="mt-0.5 size-5 shrink-0 accent-primary"
            aria-invalid={faltaMarcar || undefined} aria-describedby={faltaMarcar ? `${idDaCaixa}-erro` : undefined}
            onChange={(e) => { setLido(e.target.checked); if (e.target.checked) setFaltaMarcar(false) }} />
          Li o termo, conferi o bem e o recebi.
        </label>
        {faltaMarcar && (
          <p id={`${idDaCaixa}-erro`} className="flex items-start gap-1.5 pl-8 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />Marque a caixa acima para confirmar que leu o termo e recebeu o bem.
          </p>
        )}
      </div>
      <div>
        <button type="button" disabled={ocupado} className={cn(botaoDoMembro, 'w-full sm:w-auto')} onClick={aceitar}>
          <RotuloDeEnvio ocupado={ocupado} icone={FileSignature} rotulo="Aceitar o termo" andamento="Aceitando…" />
        </button>
      </div>
      {erro && <RecadoEmFoco key={erro.vez} tipo="erro">{erro.texto}</RecadoEmFoco>}
    </div>
  )
}

/**
 * Os bens da filial que estão com o voluntário, com o termo de
 * responsabilidade. Termo pendente primeiro: é o que pede ação (o Início e o
 * e-mail de entrega trazem a pessoa para cá, em `#bens`).
 */
export function BensComigo({ bens }: { bens: BemComOVoluntario[] }) {
  // O bem que a pessoa acabou de aceitar ganha um recado com foco: o botão
  // some junto com o termo, e sem isto o foco caía no `<body>`.
  const [recemAceito, setRecemAceito] = useState<string | null>(null)
  if (!bens.length) return null
  // `sort` é estável: dentro de cada grupo fica a ordem que veio do banco.
  const ordenados = [...bens].sort((a, b) => Number(!!a.termo_aceito_em) - Number(!!b.termo_aceito_em))
  return (
    <Secao titulo="Bens da filial com você" icone={Package} id="bens">
      {/* O tour aponta o primeiro bem (termo pendente vem primeiro), com o termo e o
          "Aceitar o termo" de que o passo fala: a lista inteira passa da tela no celular. */}
      <ul className="flex flex-col gap-3">
        {ordenados.map((b, i) => {
          const detalhes = [b.marca, b.modelo, b.numero_serie && `série ${b.numero_serie}`].filter(Boolean).join(' · ')
          return (
            <li key={b.cautela_id} data-cautela={b.cautela_id} data-ajuda={i === 0 ? 'membro.bens' : undefined} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold wrap-anywhere">{b.nome}</h3>
                  <p className="text-sm text-muted-foreground">Plaqueta <span className="font-mono text-foreground">{b.plaqueta}</span></p>
                </div>
                {b.termo_aceito_em
                  ? <Selo tom="sucesso" icone={CircleCheck}>Termo aceito em {dataCurta(b.termo_aceito_em)}</Selo>
                  : <Selo tom="aviso" icone={FileSignature}>Termo pendente</Selo>}
              </div>
              <p className="text-sm text-muted-foreground wrap-anywhere">
                {detalhes && <>{detalhes} · </>}Recebido em {dataCurta(b.entregue_em)}
                {b.prevista_devolucao && <> · Devolver até {dataCurta(b.prevista_devolucao)}</>}
              </p>
              {/* Aberto enquanto falta aceitar: é para ler antes de marcar a caixa. */}
              <details className="group" open={!b.termo_aceito_em}>
                <summary className="-mx-2 flex min-h-11 w-fit cursor-pointer list-none items-center gap-1 rounded-lg px-2 text-sm font-medium hover:bg-muted [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />Termo de responsabilidade
                </summary>
                <p className="mt-1 whitespace-pre-line rounded-lg bg-muted/60 p-3 text-sm leading-relaxed wrap-anywhere">{b.termo}</p>
              </details>
              {b.termo_aceito_em
                ? recemAceito === b.cautela_id && <RecadoEmFoco tipo="sucesso" titulo="Termo aceito.">O aceite ficou registrado com a data de hoje.</RecadoEmFoco>
                : <Aceitar id={b.cautela_id} aoAceitar={() => setRecemAceito(b.cautela_id)} />}
            </li>
          )
        })}
      </ul>
    </Secao>
  )
}
