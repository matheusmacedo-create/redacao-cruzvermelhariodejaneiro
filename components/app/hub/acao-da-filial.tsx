'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { salvarAcaoDoPacote } from '@/app/actions/acoes-do-site'
import { dataDaAcaoLegivel, hojeNoRio, validarAcao, type AcaoDoMestre } from '@/lib/site/marca-de-acao'

/**
 * O cartão "Nossas ações" da tela do pacote: marca a notícia como o relato de
 * uma ação que a filial realizou, com o dia e o local. É o que a põe na página
 * /acoes/ do site (lib/site/acoes.ts).
 *
 * Tem botão próprio de salvar, fora do autosave do texto: mexe numa página
 * pública que já pode estar no ar, e a pessoa precisa ver a resposta.
 *
 * Pensado para o celular: uma pergunta, dois campos, um botão, tudo com 44 px
 * ou mais de altura.
 */
export function AcaoDaFilial({ pacoteId, inicial, sugestao, encerrado }: {
  pacoteId: string
  /** A marca gravada; nula quando o pacote não é uma ação. */
  inicial: AcaoDoMestre | null
  /** O dia e o local que a pauta já sabe (pauta registrada como Ação ou Evento). */
  sugestao: AcaoDoMestre | null
  encerrado: boolean
}) {
  const [gravada, setGravada] = useState<AcaoDoMestre | null>(inicial)
  const [ligada, setLigada] = useState(Boolean(inicial))
  const [data, setData] = useState(inicial?.data ?? sugestao?.data ?? '')
  const [local, setLocal] = useState(inicial?.local ?? sugestao?.local ?? '')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [salvando, rodar] = useTransition()

  const mudou = ligada !== Boolean(gravada) || (ligada && (data !== (gravada?.data ?? '') || local.trim() !== (gravada?.local ?? '')))

  function salvar() {
    setErro(''); setAviso('')
    if (ligada) {
      const conferida = validarAcao({ data, local })
      if ('erro' in conferida) { setErro(conferida.erro); return }
    }
    rodar(async () => {
      const r = await salvarAcaoDoPacote(pacoteId, { ligada, data, local })
      if (r.erro) { setErro(r.erro); return }
      setGravada(r.acao ?? null)
      setAviso(r.aviso ?? 'Salvo.')
    })
  }

  const campo = 'mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

  return (
    <div data-ajuda="publicacoes.nossas-acoes" className="rounded-lg border border-border p-3">
      <p className="text-sm font-semibold">Nossas ações <span className="font-normal text-muted-foreground">(página do site)</span></p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        O site tem uma página com o histórico do que a filial já fez, com foto, data e local. Marque abaixo quando esta notícia contar uma ação nossa.
      </p>
      <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          checked={ligada}
          disabled={encerrado || salvando}
          onChange={(e) => { setLigada(e.target.checked); setErro(''); setAviso('') }}
          className="size-5 shrink-0 accent-[#cc0000]"
        />
        Esta notícia conta uma ação que a filial realizou
      </label>

      {ligada && (
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Dia da ação
            <input type="date" value={data} max={hojeNoRio()} disabled={encerrado || salvando} onChange={(e) => setData(e.target.value)} className={campo} />
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">O dia em que aconteceu, não o da publicação.</span>
          </label>
          <label className="text-sm font-medium">Local <span className="font-normal text-muted-foreground">(opcional)</span>
            <input value={local} maxLength={120} disabled={encerrado || salvando} onChange={(e) => setLocal(e.target.value)} placeholder="Ex.: Praça da Cruz Vermelha, Centro" className={campo} />
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">Como aparece na página: lugar e bairro ou cidade.</span>
          </label>
        </div>
      )}

      {!gravada && ligada && sugestao && (
        <p className="mt-2 text-xs text-muted-foreground">Preenchido com o que está na pauta. Confira antes de salvar.</p>
      )}
      {gravada && !mudou && !aviso && (
        <p className="mt-2 text-xs text-muted-foreground">
          Marcada como ação de {dataDaAcaoLegivel(gravada.data)}{gravada.local ? `, em ${gravada.local}` : ''}.
        </p>
      )}
      {erro && <p role="alert" className="mt-2 text-sm font-medium text-destructive">{erro}</p>}
      {aviso && !erro && <p role="status" className="mt-2 text-sm text-emerald-700">{aviso}</p>}

      {mudou && !encerrado && (
        <Button type="button" onClick={salvar} disabled={salvando} className="mt-3 min-h-11 w-full sm:w-auto">
          {salvando ? 'Salvando…' : ligada ? 'Salvar em Nossas ações' : 'Tirar de Nossas ações'}
        </Button>
      )}
    </div>
  )
}
