'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AudioLines, Loader2, Play, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { amostraDaVoz, salvarVoz } from '@/app/actions/voz'
import { MODELOS_DA_VOZ, MODELO_PADRAO, type ConfigDaVoz, type ModeloDaVoz } from '@/lib/voz/regras'

type Recado = { tom: 'ok' | 'erro'; texto: string } | null

/** Uma voz da conta, como a página manda (lib/voz/elevenlabs.ts, VozDaConta). */
export type VozNaTela = { id: string; nome: string; categoria: string; descricao: string | null; amostra: string | null; sotaque: string | null; genero: string | null }

const campo = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

const CATEGORIA: Record<string, string> = { premade: 'pronta', cloned: 'clonada', generated: 'criada', professional: 'profissional' }

/**
 * O cartão de Configurações › Voz: a voz da instituição (da conta da ElevenLabs), o modelo e os dois usos — narrar as
 * matérias do site e responder em áudio no WhatsApp a quem mandou áudio. Grava em voz_config pela action, que confere
 * de novo a permissão e se a voz é da conta. Vale na próxima publicação ou na próxima mensagem, sem deploy.
 */
export function PainelDaVoz({ pronto, config, vozes, erroDasVozes }: { pronto: boolean; config: ConfigDaVoz | null; vozes: VozNaTela[]; erroDasVozes: string | null }) {
  const router = useRouter()
  const [recado, setRecado] = useState<Recado>(null)
  const [ocupado, rodar] = useTransition()
  const [gerando, gerar] = useTransition()
  const [vozId, setVozId] = useState(config?.vozId ?? '')
  const [modelo, setModelo] = useState<ModeloDaVoz>(config?.modelo ?? MODELO_PADRAO)
  const [materias, setMaterias] = useState(config?.materias ?? false)
  const [whatsapp, setWhatsapp] = useState(config?.whatsapp ?? false)
  const [amostra, setAmostra] = useState<string | null>(null)

  const escolhida = vozes.find((v) => v.id === vozId) ?? null
  // A voz gravada que sumiu da conta continua na lista, para a tela não fingir que nada está escolhido.
  const opcoes = useMemo(() => (config?.vozId && !vozes.some((v) => v.id === config.vozId)
    ? [{ id: config.vozId, nome: `${config.vozNome ?? config.vozId} (não está mais na conta)`, categoria: '', descricao: null, amostra: null, sotaque: null, genero: null }, ...vozes]
    : vozes), [config, vozes])

  const ligado = Boolean(config?.materias || config?.whatsapp)

  function salvar() {
    setRecado(null)
    rodar(async () => {
      const r = await salvarVoz({ vozId, vozNome: escolhida?.nome ?? null, modelo, materias, whatsapp })
      setRecado(r.erro ? { tom: 'erro', texto: r.erro } : { tom: 'ok', texto: r.recado ?? 'Pronto.' })
      if (!r.erro) router.refresh()
    })
  }

  function ouvirEmPortugues() {
    setRecado(null)
    setAmostra(null)
    gerar(async () => {
      const r = await amostraDaVoz({ vozId, modelo })
      if (r.erro || !r.audio) setRecado({ tom: 'erro', texto: r.erro ?? 'Não foi possível gerar a amostra.' })
      else setAmostra(r.audio)
    })
  }

  return (
    <Card data-ajuda="voz.painel" className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"><AudioLines className="size-4" aria-hidden="true" />Voz da instituição</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Uma voz só para a filial, escolhida entre as da conta da ElevenLabs. Use uma voz pronta ou uma criada para vocês;
            voz clonada de uma pessoa real, só com a autorização dela por escrito.
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${!pronto || !ligado ? 'bg-muted text-muted-foreground' : 'bg-success/10 text-success'}`}>
          {!pronto ? 'Indisponível' : ligado ? 'Ligada' : 'Desligada'}
        </span>
      </div>

      {!pronto ? (
        <p className="text-sm text-muted-foreground">A voz ainda não está pronta no banco (falta aplicar a migração dela). Enquanto isso, as matérias saem sem áudio e o WhatsApp responde só por escrito.</p>
      ) : (
        <>
          {erroDasVozes && <p role="alert" className="text-sm text-destructive">Não consegui listar as vozes da conta: {erroDasVozes}</p>}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm" data-ajuda="voz.escolha">
              <span>Voz</span>
              <select className={campo} value={vozId} onChange={(e) => { setVozId(e.target.value); setAmostra(null) }}>
                <option value="">Escolha uma voz…</option>
                {opcoes.map((v) => (
                  <option key={v.id} value={v.id}>{v.nome}{[CATEGORIA[v.categoria], v.genero, v.sotaque].filter(Boolean).length ? ` — ${[CATEGORIA[v.categoria], v.genero, v.sotaque].filter(Boolean).join(', ')}` : ''}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Modelo</span>
              <select className={campo} value={modelo} onChange={(e) => { setModelo(e.target.value as ModeloDaVoz); setAmostra(null) }}>
                {MODELOS_DA_VOZ.map((m) => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
              </select>
            </label>
          </div>

          {escolhida && (
            <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3 text-sm">
              {escolhida.descricao && <p className="text-muted-foreground">{escolhida.descricao}</p>}
              {escolhida.amostra && (
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Amostra da ElevenLabs (costuma ser em inglês; não gasta crédito):</p>
                  {/* A amostra é da própria ElevenLabs: o navegador busca direto de lá. */}
                  <audio controls preload="none" src={escolhida.amostra} className="w-full max-w-md" />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" disabled={gerando} onClick={ouvirEmPortugues}>
                  {gerando ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}Ouvir em português com este modelo
                </Button>
                <span className="text-xs text-muted-foreground">Gasta uns 100 caracteres de crédito.</span>
              </div>
              {amostra && <audio controls autoPlay={false} src={amostra} className="w-full max-w-md" />}
            </div>
          )}

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium">Onde a voz fala</legend>
            <label className="flex items-start gap-2 text-sm" data-ajuda="voz.materias">
              <input type="checkbox" className="mt-1 size-4" checked={materias} onChange={(e) => setMaterias(e.target.checked)} />
              <span>
                <strong className="font-medium">Narrar as matérias do site</strong>
                <span className="block text-xs text-muted-foreground">
                  Ao publicar (ou republicar) uma matéria, o texto vira um áudio e a página ganha o “Ouça esta matéria”, com o aviso de que a voz é gerada por inteligência artificial.
                  Republicar sem mudar o texto não gasta crédito de novo. Matérias com mais de 30 mil caracteres ficam sem áudio. Para dar voz às matérias que já estavam no ar, use “Regerar e narrar as que faltam” em Configurações › Site (todas de uma vez) ou “Atualizar a página no site” na publicação de cada uma. O “Regerar” comum mantém os áudios que já existem, mas não cria novos.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm" data-ajuda="voz.whatsapp">
              <input type="checkbox" className="mt-1 size-4" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} />
              <span>
                <strong className="font-medium">Responder em áudio no WhatsApp a quem mandou áudio</strong>
                <span className="block text-xs text-muted-foreground">
                  Vale para o assistente (Configurações › WhatsApp, cartão “Assistente”). Quem fala com ele por áudio recebe a resposta por escrito, como sempre, e logo depois a mesma resposta falada.
                  Links, códigos, planos para confirmar e respostas longas ficam só no texto. O texto da resposta passa pela ElevenLabs para virar voz.
                </span>
              </span>
            </label>
          </fieldset>

          <div>
            <Button disabled={ocupado} onClick={salvar}>
              {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Salvar a voz
            </Button>
          </div>
        </>
      )}
      {recado && <p role={recado.tom === 'erro' ? 'alert' : 'status'} className={`text-sm ${recado.tom === 'erro' ? 'text-destructive' : 'text-success'}`}>{recado.texto}</p>}
    </Card>
  )
}
