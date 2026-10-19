'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bot, Loader2, PlayCircle, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { retomarAssistenteDoWhatsapp, salvarAssistenteDoWhatsapp } from '@/app/actions/whatsapp'
import { FAIXAS_DO_CARTAO, MODOS_DO_CARTAO, PILOTO_MAXIMO, ROTULO_DO_TETO, type ConfigDoCartao } from '@/lib/whatsapp/assistente/cartao'

type Recado = { tom: 'ok' | 'erro'; texto: string } | null
type Teto = keyof typeof FAIXAS_DO_CARTAO

const campo = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })
const dolar = (n: number) => `US$ ${n.toFixed(2).replace('.', ',')}`

/** O que a página manda (lib/whatsapp/assistente/uso.ts, estadoDoAssistente), sem nada de conversa: só configuração e contagens. */
export type AssistenteNaTela = {
  pronto: boolean
  config: ConfigDoCartao | null
  numeros: { conversas: number; pessoas: number; gasto: number; comCache: number; recusas: number; erros: number } | null
  pessoas: { id: string; nome: string; usuario: string; papel: string; whatsapp: boolean }[]
  chave: boolean
  modelo: string
  esforco: string
  /** A pausa em vigor, decidida no servidor (disjuntor, chave ou modelo). */
  pausa: { ate: string; motivo: string | null } | null
  /** A confirmação do plano no Palácio está disponível (a migração das confirmações do plano foi aplicada). */
  noPalacio: boolean
}

const PADRAO: ConfigDoCartao = {
  modo: 'desligado', piloto: [], escrita: false, teto_usd_dia: 10, teto_usd_pessoa_dia: 1, turnos_pessoa_hora: 20, turnos_pessoa_dia: 60, leituras_detalhe_dia: 40, mensagens_dia: 10,
}

/**
 * O cartão "Assistente" de Configurações → WhatsApp: liga e desliga o assistente que entende linguagem natural no
 * número do Palácio, escolhe quem ele atende (piloto, administradores ou toda a equipe), a escrita e os tetos —
 * tudo gravado em whatsapp_ia_config pela action, que confere de novo a permissão. Vale na próxima mensagem,
 * sem deploy. Desligado (o padrão), o bot é exatamente o de antes.
 */
export function CartaoDoAssistente({ a }: { a: AssistenteNaTela }) {
  const router = useRouter()
  const [recado, setRecado] = useState<Recado>(null)
  const [ocupado, rodar] = useTransition()
  const inicial = a.config ?? PADRAO
  const [modo, setModo] = useState(inicial.modo)
  const [piloto, setPiloto] = useState(() => new Set(inicial.piloto))
  const [escrita, setEscrita] = useState(inicial.escrita)
  const [tetos, setTetos] = useState<Record<Teto, string>>(() => Object.fromEntries((Object.keys(FAIXAS_DO_CARTAO) as Teto[]).map((t) => [t, String(inicial[t])])) as Record<Teto, string>)

  function acao(fn: () => Promise<{ erro?: string; recado?: string }>) {
    setRecado(null)
    rodar(async () => {
      const r = await fn()
      setRecado(r.erro ? { tom: 'erro', texto: r.erro } : { tom: 'ok', texto: r.recado ?? 'Pronto.' })
      if (!r.erro) router.refresh()
    })
  }

  const pausada = a.pausa
  const n = a.numeros

  return (
    <Card data-ajuda="whatsapp.assistente" className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"><Bot className="size-4" aria-hidden="true" />Assistente (escrever do seu jeito)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ligado, quem escreve ao número do Palácio do jeito que fala (“o que tenho pra aprovar?”, “como está meu chamado do ar?”) recebe a resposta do Claude,
            que consulta o Palácio com as permissões da própria pessoa. Os comandos do menu continuam iguais. Desligado, o bot responde como sempre.
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${inicial.modo === 'desligado' || !a.pronto ? 'bg-muted text-muted-foreground' : pausada ? 'bg-warning/15 text-foreground' : 'bg-success/10 text-success'}`}>
          {!a.pronto ? 'Indisponível' : inicial.modo === 'desligado' ? 'Desligado' : pausada ? 'Pausado' : 'Ligado'}
        </span>
      </div>

      {!a.pronto ? (
        <p className="text-sm text-muted-foreground">O assistente ainda não está pronto no banco (falta aplicar a migração dele). Enquanto isso, o bot responde como sempre.</p>
      ) : (
        <>
          <ul className="space-y-0.5 text-sm text-muted-foreground">
            <li>Chave da Anthropic: {a.chave ? <span className="text-foreground">configurada</span> : <span className="text-destructive">falta (sem ela, o assistente não liga)</span>}.</li>
            <li>Modelo: <strong className="font-mono text-xs text-foreground">{a.modelo}</strong>, esforço <strong className="font-mono text-xs text-foreground">{a.esforco}</strong> (mudam nas variáveis WHATSAPP_IA_MODELO e WHATSAPP_IA_ESFORCO).</li>
            <li>Confirmação no Palácio: {a.noPalacio
              ? <span className="text-foreground">ligada (a decisão de despesa ou compra e os planos de quem usa a verificação em duas etapas terminam com o link do Palácio)</span>
              : <span>indisponível (falta aplicar a migração das confirmações do plano; até lá, esses pedidos ficam de fora, com o link da tela)</span>}.</li>
            {n && <li>Hoje: <span className="text-foreground">{n.conversas} {n.conversas === 1 ? 'conversa' : 'conversas'}</span> de {n.pessoas} {n.pessoas === 1 ? 'pessoa' : 'pessoas'} · {dolar(n.gasto)} de {dolar(Number(inicial.teto_usd_dia))} · {n.comCache}% com cache · {n.recusas} {n.recusas === 1 ? 'recusa' : 'recusas'} · {n.erros} {n.erros === 1 ? 'erro' : 'erros'}.</li>}
          </ul>

          {pausada && (
            <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <p>Pausado até {quando.format(new Date(pausada.ate))}{pausada.motivo ? `: ${pausada.motivo}` : '.'} Enquanto isso, o bot de comandos responde sozinho.</p>
              <div><Button size="sm" variant="outline" disabled={ocupado} onClick={() => acao(retomarAssistenteDoWhatsapp)}><PlayCircle className="size-4" />Retomar agora</Button></div>
            </div>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Quem o assistente atende</legend>
            {MODOS_DO_CARTAO.map((o) => (
              <label key={o.valor} className="flex items-start gap-2 text-sm">
                <input type="radio" name="modo" className="mt-1" checked={modo === o.valor} onChange={() => setModo(o.valor)} />
                <span><strong className="font-medium">{o.rotulo}</strong> <span className="text-muted-foreground">— {o.ajuda}</span></span>
              </label>
            ))}
          </fieldset>

          {modo === 'piloto' && (
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="mb-2 text-xs text-muted-foreground">Quem entra no piloto (até {PILOTO_MAXIMO}). Só funciona para quem confirmou o WhatsApp em Meu perfil.</p>
              <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                {a.pessoas.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4" checked={piloto.has(p.id)} onChange={() => setPiloto((atual) => {
                      const novo = new Set(atual)
                      if (novo.has(p.id)) novo.delete(p.id)
                      else novo.add(p.id)
                      return novo
                    })} />
                    <span className="min-w-0 truncate">{p.nome}{p.usuario ? <span className="text-muted-foreground"> @{p.usuario}</span> : null}{!p.whatsapp && <span className="text-xs text-muted-foreground"> · sem WhatsApp confirmado</span>}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 size-4" checked={escrita} onChange={(e) => setEscrita(e.target.checked)} />
            <span>
              <strong className="font-medium">Deixar o assistente preparar ações para a pessoa confirmar</strong> (votos, mensagens, comentários, abrir, assumir, resolver e transferir chamados, resposta e registro na portaria, marcar lidos, e a decisão de despesa ou compra).
              <span className="block text-xs text-muted-foreground">Nada é feito sem a pessoa responder <em>confirmo</em> (ou tocar em Confirmar) no plano exato que o Palácio escreve (até 3 votos por plano; as mensagens diretas no teto abaixo). A decisão de despesa ou compra e os planos de quem usa a verificação em duas etapas terminam no Palácio, pelo link. O recibo traz o “Não fui eu”. Comece pelo piloto; administradores só depois de ver o recibo funcionando.</span>
            </span>
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(Object.keys(FAIXAS_DO_CARTAO) as Teto[]).map((t) => (
              <label key={t} className="flex flex-col gap-1 text-sm">
                <span>{ROTULO_DO_TETO[t]}</span>
                <input type="number" inputMode="decimal" min={FAIXAS_DO_CARTAO[t].min} max={FAIXAS_DO_CARTAO[t].max} step={FAIXAS_DO_CARTAO[t].inteiro ? 1 : 0.01}
                  value={tetos[t]} className={campo} onChange={(e) => setTetos((atual) => ({ ...atual, [t]: e.target.value }))} />
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Batido o teto da pessoa, só ela volta ao bot de comandos até a meia-noite; batido o do espaço, o assistente desliga para todos até a meia-noite, e a administração é avisada aos 80% e aos 100%.
            Do que se conversa, o Palácio guarda só o comando e os números de uso (tokens, custo, tempo) — nunca o texto das mensagens.
          </p>

          <div>
            <Button disabled={ocupado} onClick={() => acao(() => salvarAssistenteDoWhatsapp({ modo, piloto: [...piloto], escrita, ...tetos }))}>
              {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Salvar o assistente
            </Button>
          </div>
        </>
      )}
      {recado && <p role={recado.tom === 'erro' ? 'alert' : 'status'} className={`text-sm ${recado.tom === 'erro' ? 'text-destructive' : 'text-success'}`}>{recado.texto}</p>}
    </Card>
  )
}
