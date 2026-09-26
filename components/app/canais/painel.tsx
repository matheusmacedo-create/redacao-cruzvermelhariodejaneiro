'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BadgeCheck, History, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  AvisoDeLancamento, CodigoDaTrilha, Etiqueta, FALHA_DE_REDE, HashCurto, OCUPADO_SEM_PERDER_FOCO, RegiaoDeRecados, SemCodigo, diaEHora, recadoDe,
  useFocoDepoisDaLista, useRecado, type Resultado,
} from '@/components/app/transparencia/comum'
import { atualizarPaginaDosCanais } from '@/app/actions/transparencia'
import type { Canal } from '@/lib/transparencia/regras'
import { EditorDosCanais } from './editor'
import { ListaDeCanais, type VersaoDosCanais } from './lista'

const ID_DA_VERSAO_ATUAL = 'canais-versao-atual'

/**
 * A tela /canais-oficiais: o que está no ar, o editor da próxima versão e as
 * versões anteriores. Cada versão publicada é imutável; a página pública
 * mostra sempre a mais nova.
 */
export function PainelDosCanais({ versoes, trilhaDisponivel, aberto, endereco, sugestao }: {
  /** Da mais nova para a mais antiga. */
  versoes: VersaoDosCanais[]
  trilhaDisponivel: boolean
  aberto: boolean
  endereco: string
  /** Ponto de partida para a primeira versão (os dados do rodapé do site). */
  sugestao: Canal[]
}) {
  const router = useRouter()
  const [recado, setRecado] = useRecado()
  const [atualizando, iniciar] = useTransition()
  const atual = versoes[0] ?? null
  const anteriores = versoes.slice(1)
  // Depois de publicar, o editor volta do servidor refeito (e o botão que tinha o foco some).
  const focarDepois = useFocoDepoisDaLista(atual?.id ?? null, ID_DA_VERSAO_ATUAL)

  const atualizarSite = () => iniciar(async () => {
    try {
      setRecado(recadoDe(await atualizarPaginaDosCanais(), 'Página de canais oficiais refeita no site com a versão no ar.'))
    } catch {
      setRecado({ tipo: 'erro', texto: FALHA_DE_REDE })
    }
  })

  function publicado(r: Resultado) {
    focarDepois(ID_DA_VERSAO_ATUAL)
    setRecado(recadoDe(r, 'Versão nova publicada. A anterior ficou na trilha como substituída.'))
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-5">
      <AvisoDeLancamento aberto={aberto} endereco={endereco} atualizando={atualizando} onAtualizar={atualizarSite} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          {atual ? <VersaoNoAr v={atual} trilhaDisponivel={trilhaDisponivel} /> : (
            <Card className="p-5">
              <h2 id={ID_DA_VERSAO_ATUAL} tabIndex={-1} className="text-base font-semibold outline-none">Nenhuma versão publicada ainda</h2>
              <p className="mt-1 text-sm text-muted-foreground">Monte a lista abaixo e publique a primeira. Até lá, a página pública de canais oficiais não existe.</p>
            </Card>
          )}
          {/* Refeito a cada versão publicada: o editor sempre parte do que está no ar. */}
          <EditorDosCanais key={atual?.id ?? 'primeira'} atual={atual} sugestao={sugestao} endereco={endereco} aoPublicar={publicado} />
        </div>

        <section aria-labelledby="canais-historico" className="flex flex-col gap-2" data-ajuda="canais.historico">
          <h2 id="canais-historico" className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <History className="size-4" aria-hidden />Versões anteriores
          </h2>
          <p className="text-xs text-muted-foreground">Substituídas: saíram da página, mas continuam registradas na trilha pública, sem mudança.</p>
          {anteriores.length ? (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {anteriores.map((v) => (
                <li key={v.id} className="px-3 py-2.5 text-sm">
                  <details>
                    <summary className="cursor-pointer">
                      <span className="font-medium">Versão {v.versao}</span>
                      <span className="text-muted-foreground"> · {diaEHora(v.publicadoEm)} · {v.canais.length} {v.canais.length === 1 ? 'canal' : 'canais'}</span>
                    </summary>
                    <div className="mt-2 flex flex-col gap-2">
                      {v.publicadoPor && <p className="text-xs text-muted-foreground">Publicada por {v.publicadoPor}.</p>}
                      <ListaDeCanais canais={v.canais} />
                      {v.observacao && <p className="whitespace-pre-line text-xs text-muted-foreground">{v.observacao}</p>}
                      <Registro v={v} trilhaDisponivel={trilhaDisponivel} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">{atual ? 'A versão no ar é a primeira.' : 'Nenhuma ainda.'}</p>}
        </section>
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

function VersaoNoAr({ v, trilhaDisponivel }: { v: VersaoDosCanais; trilhaDisponivel: boolean }) {
  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5" data-ajuda="canais.no-ar">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={ID_DA_VERSAO_ATUAL} tabIndex={-1} className="flex items-center gap-1.5 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <BadgeCheck className="size-4 text-success" aria-hidden />No ar: versão {v.versao}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Publicada em {diaEHora(v.publicadoEm)}{v.publicadoPor ? ` por ${v.publicadoPor}` : ''} · {v.canais.length} {v.canais.length === 1 ? 'canal' : 'canais'}
          </p>
        </div>
        <Etiqueta estado="no_ar">No ar</Etiqueta>
      </div>
      <ListaDeCanais canais={v.canais} />
      {v.observacao && <p className="whitespace-pre-line text-sm text-muted-foreground">{v.observacao}</p>}
      <Registro v={v} trilhaDisponivel={trilhaDisponivel} />
    </Card>
  )
}

function Registro({ v, trilhaDisponivel }: { v: VersaoDosCanais; trilhaDisponivel: boolean }) {
  return (
    <dl className="grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
      <dt className="text-muted-foreground">SHA-256 do registro</dt>
      <dd>{v.hash ? <HashCurto hash={v.hash} rotulo="SHA-256 do registro" /> : '—'}</dd>
      <dt className="text-muted-foreground">Código de verificação</dt>
      <dd>{v.codigo ? <CodigoDaTrilha codigo={v.codigo} /> : <SemCodigo trilhaDisponivel={trilhaDisponivel} />}</dd>
    </dl>
  )
}
