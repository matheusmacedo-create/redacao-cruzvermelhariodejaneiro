'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, Eye, ImagePlus, Info, Loader2, PencilLine, Send, TestTube2, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  conferirEdicao, horarioDoAgendamento, lerRascunho, paraOCampoDeHorario, LIMITES, MINUTOS_MINIMOS_PARA_AGENDAR, RASCUNHO_VAZIO,
  type RascunhoDaEdicao,
} from '@/lib/newsletter/edicao'
import { horarioParaLer } from '@/lib/publicacao/agendamento'
import { emailDaNewsletter } from '@/lib/newsletter/modelo'
import { agendarEdicaoDaNewsletter, enviarEdicaoDaNewsletter, enviarTesteDaEdicao } from '@/app/actions/newsletter'

/**
 * O compositor da edição.
 *
 * Pensado primeiro para o celular e para quem não escreve e-mail todo dia: uma coluna, campos grandes, um passo
 * depois do outro (escrever, ver, testar, enviar). No computador a prévia fica ao lado.
 *
 * A PRÉVIA É A MENSAGEM DE VERDADE: o mesmo modelo que o envio usa (lib/newsletter/modelo.ts), montado aqui a cada
 * tecla, e não um desenho parecido. O que aparece no quadro é o que chega na caixa de entrada.
 *
 * O RASCUNHO fica guardado neste aparelho (localStorage), para um toque errado em "voltar" não custar o texto. É
 * conveniência de quem escreve: não vai ao servidor nem aparece para os colegas, e a tela funciona sem ele.
 *
 * A IMAGEM é reduzida aqui mesmo, antes de subir (1.200 px de largura, JPEG): foto de celular tem 4 a 12 MB, e uma
 * imagem desse tamanho num e-mail demora a abrir e pesa no plano de dados de quem lê. Reduzida, sobe em um instante
 * mesmo no 4G.
 *
 * AGENDAR usa a fila dos pacotes de Publicações: sai para quem estiver na lista na hora, e dá para cancelar em
 * "Edições" até lá.
 */

const CHAVE_DO_RASCUNHO = 'cvrj.newsletter.nova-edicao'

const CAMPO = 'w-full rounded-lg border border-border bg-background px-3.5 text-base outline-none transition-colors focus:border-foreground/50 focus:ring-3 focus:ring-foreground/10'

type Aviso = { tom: 'ok' | 'erro'; texto: string }

export function Compositor({ destinatarios, teto, remetente, envioConfigurado, podeEnviar, emailDeQuemEscreve }: {
  destinatarios: number
  teto: number
  remetente: string
  envioConfigurado: boolean
  podeEnviar: boolean
  emailDeQuemEscreve: string
}) {
  const [rascunho, setRascunho] = useState<RascunhoDaEdicao>(RASCUNHO_VAZIO)
  const [carregado, setCarregado] = useState(false)
  const [vista, setVista] = useState<'escrever' | 'previa'>('escrever')
  // O passo final aberto: a confirmação do envio agora, ou a escolha do dia e da hora.
  const [passo, setPasso] = useState<null | 'enviar' | 'agendar'>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [enviada, setEnviada] = useState<number | null>(null)
  const [agendadaPara, setAgendadaPara] = useState<string | null>(null)
  const [horario, setHorario] = useState('')
  // O mais cedo que o campo aceita, calculado quando o passo abre (o relógio não se lê durante o desenho da tela).
  const [horarioMinimo, setHorarioMinimo] = useState('')
  const [subindo, setSubindo] = useState(false)
  // A imagem recém-escolhida, embutida, para a prévia mostrar na hora (e mesmo onde o endereço público ainda não
  // responde, como num ambiente de teste). Não vai para o rascunho guardado: é grande, e o endereço basta.
  const [imagemLocal, setImagemLocal] = useState<{ url: string; dados: string } | null>(null)
  const [testando, comecarTeste] = useTransition()
  const [enviando, comecarEnvio] = useTransition()
  // Trava além do `disabled`: dois toques no mesmo instante chegam antes de o botão desabilitar.
  const jaEnviando = useRef(false)

  // O rascunho deste aparelho, lido depois de montar (no servidor não há localStorage).
  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(CHAVE_DO_RASCUNHO)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- o armazenamento do navegador só existe aqui
      if (guardado) setRascunho(lerRascunho(JSON.parse(guardado)))
    } catch { /* sem armazenamento, ou rascunho ilegível: começa em branco */ }
    setCarregado(true)
  }, [])

  useEffect(() => {
    if (!carregado || enviada !== null || agendadaPara !== null) return
    try {
      const vazio = Object.values(rascunho).every((v) => !v.trim())
      if (vazio) window.localStorage.removeItem(CHAVE_DO_RASCUNHO)
      else window.localStorage.setItem(CHAVE_DO_RASCUNHO, JSON.stringify(rascunho))
    } catch { /* o rascunho é conveniência */ }
  }, [rascunho, carregado, enviada, agendadaPara])

  const mudar = (campo: keyof RascunhoDaEdicao, valor: string) => {
    setRascunho((r) => ({ ...r, [campo]: valor }))
    if (passo === 'enviar') setPasso(null)
  }

  const conferencia = useMemo(() => conferirEdicao(rascunho), [rascunho])
  const temAlgo = Object.values(rascunho).some((v) => v.trim())
  const pronta = conferencia.erros.length === 0

  const previa = useMemo(() => {
    const html = emailDaNewsletter({
      titulo: conferencia.edicao.assunto || 'O assunto aparece aqui',
      ...conferencia.edicao,
      paragrafos: conferencia.edicao.paragrafos.length ? conferencia.edicao.paragrafos : ['O texto da edição aparece aqui, do jeito que chega na caixa de entrada.'],
      urlDeSaida: '#',
    }).html
    // Na prévia, a imagem recém-escolhida entra embutida; no envio vai o endereço público.
    return imagemLocal && conferencia.edicao.imagemUrl === imagemLocal.url ? html.replaceAll(imagemLocal.url, imagemLocal.dados) : html
  }, [conferencia, imagemLocal])

  const motivoDeNaoEnviar = !podeEnviar
    ? 'Enviar para a lista é para administradores e editores. Você pode escrever e ver a prévia; peça a um deles para enviar.'
    : !envioConfigurado
      ? 'O envio de e-mail não está configurado. Um administrador resolve em Newsletter → Configuração.'
      : destinatarios === 0
        ? 'Ainda não há ninguém na lista para receber.'
        : destinatarios > teto
          ? `A lista passou de ${teto} pessoas, e o envio de uma vez só não aguenta. Fale com a administração.`
          : ''
  const podeMandar = !motivoDeNaoEnviar && pronta

  const limpar = () => {
    setRascunho(RASCUNHO_VAZIO)
    setImagemLocal(null)
    setPasso(null)
    setAviso(null)
  }

  const escolherImagem = async (arquivo: File | undefined) => {
    if (!arquivo) return
    setSubindo(true)
    setAviso(null)
    try {
      const reduzida = await reduzirImagem(arquivo)
      const dados = new FormData()
      dados.set('arquivo', reduzida.blob, 'imagem.jpg')
      const r = await fetch('/api/newsletter/imagem', { method: 'POST', body: dados })
      const resposta = await r.json().catch(() => ({})) as { url?: string; erro?: string }
      if (!r.ok || !resposta.url) throw new Error(resposta.erro || 'Não foi possível enviar a imagem. Tente de novo.')
      setImagemLocal({ url: resposta.url, dados: reduzida.dados })
      setRascunho((atual) => ({ ...atual, imagem: resposta.url ?? '' }))
    } catch (causa) {
      setAviso({ tom: 'erro', texto: causa instanceof Error ? causa.message : 'Não foi possível usar esta imagem.' })
    } finally {
      setSubindo(false)
    }
  }

  const abrirAgendamento = () => {
    setAviso(null)
    // A sugestão: amanhã às 9h, a hora em que mais gente abre e-mail. Só na primeira vez; depois vale o que a pessoa pôs.
    if (!horario) {
      const amanha = new Date(Date.now() + 24 * 3600_000)
      setHorario(`${paraOCampoDeHorario(amanha).slice(0, 10)}T09:00`)
    }
    setHorarioMinimo(paraOCampoDeHorario(new Date(Date.now() + MINUTOS_MINIMOS_PARA_AGENDAR * 60_000)))
    setPasso('agendar')
  }

  const horarioConferido = horarioDoAgendamento(horario)

  const agendar = () => {
    if (jaEnviando.current) return
    jaEnviando.current = true
    comecarEnvio(async () => {
      const r = await agendarEdicaoDaNewsletter(rascunho, horario)
      jaEnviando.current = false
      if (r.erro || !r.quando) { setAviso({ tom: 'erro', texto: r.erro ?? 'Não foi possível agendar.' }); return }
      try { window.localStorage.removeItem(CHAVE_DO_RASCUNHO) } catch { /* conveniência */ }
      setAviso(null)
      setPasso(null)
      setAgendadaPara(r.quando)
    })
  }

  const testar = () => comecarTeste(async () => {
    const r = await enviarTesteDaEdicao(rascunho)
    setAviso(r.erro ? { tom: 'erro', texto: r.erro } : { tom: 'ok', texto: r.recado ?? 'Teste enviado.' })
  })

  const enviar = () => {
    if (jaEnviando.current) return
    jaEnviando.current = true
    comecarEnvio(async () => {
      const r = await enviarEdicaoDaNewsletter(rascunho)
      jaEnviando.current = false
      setPasso(null)
      if (r.erro) { setAviso({ tom: 'erro', texto: r.erro }); return }
      try { window.localStorage.removeItem(CHAVE_DO_RASCUNHO) } catch { /* conveniência */ }
      setAviso(null)
      setEnviada(r.enviados ?? destinatarios)
    })
  }

  if (enviada !== null || agendadaPara !== null) {
    const recomecar = () => { setRascunho(RASCUNHO_VAZIO); setImagemLocal(null); setEnviada(null); setAgendadaPara(null); setHorario(''); setVista('escrever') }
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <CheckCircle2 className="mx-auto size-12 text-success" />
        <h2 className="mt-4 text-xl font-bold">{agendadaPara ? 'Edição agendada' : 'Edição enviada'}</h2>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          {agendadaPara
            ? `“${conferencia.edicao.assunto}” sai em ${horarioParaLer(agendadaPara)}, para quem estiver na lista na hora. Você recebe um aviso no sino quando sair. Até lá, dá para cancelar em Edições.`
            : `“${conferencia.edicao.assunto}” saiu para ${enviada} pessoa${enviada === 1 ? '' : 's'}. Ela já aparece em Edições.`}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button className="h-12 px-5 text-base" render={<Link href="/newsletter" />}>Ver as edições</Button>
          <Button variant="outline" className="h-12 px-5 text-base" onClick={recomecar}>Escrever outra</Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-5 pb-4">
      {/* Para quem e de onde: o que a pessoa precisa saber antes de escrever. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl bg-muted px-4 py-3 text-sm">
        <p><span className="text-muted-foreground">Vai para </span><strong>{destinatarios} pessoa{destinatarios === 1 ? '' : 's'}</strong><span className="text-muted-foreground"> da lista</span></p>
        <p className="min-w-0 break-words text-muted-foreground">Sai de {remetente}</p>
      </div>

      {/* No celular, escrever e ver são duas telas; no computador ficam lado a lado e este seletor some. */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 lg:hidden" role="tablist" aria-label="Escrever ou ver a prévia">
        {([['escrever', 'Escrever', PencilLine], ['previa', 'Ver como fica', Eye]] as const).map(([id, rotulo, Icone]) => (
          <button
            key={id} type="button" role="tab" aria-selected={vista === id}
            onClick={() => setVista(id)}
            className={cn(
              'flex h-12 items-center justify-center gap-2 rounded-lg text-base font-medium transition-colors',
              vista === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
            )}
          >
            <Icone className="size-4" />{rotulo}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className={cn('space-y-5 p-5', vista !== 'escrever' && 'hidden lg:block')}>
          <Campo
            id="assunto" rotulo="Assunto" valor={rascunho.assunto} max={LIMITES.assunto}
            dica="É o que a pessoa lê antes de abrir. O celular corta perto de 40 letras: ponha o principal no começo."
          >
            <input
              id="assunto" value={rascunho.assunto} maxLength={LIMITES.assunto}
              onChange={(e) => mudar('assunto', e.target.value)}
              placeholder="Ex.: Campanha do agasalho: veja para onde foram as doações"
              className={cn(CAMPO, 'h-12')}
            />
          </Campo>

          <Campo
            id="chamada" rotulo="Chamada" opcional valor={rascunho.chamada} max={LIMITES.chamada}
            dica="A linha que aparece ao lado do assunto na caixa de entrada."
          >
            <input
              id="chamada" value={rascunho.chamada} maxLength={LIMITES.chamada}
              onChange={(e) => mudar('chamada', e.target.value)}
              placeholder="Ex.: Mais de 2 mil peças entregues em três comunidades"
              className={cn(CAMPO, 'h-12')}
            />
          </Campo>

          <Campo
            id="texto" rotulo="Texto" valor={rascunho.texto} max={LIMITES.texto}
            dica="Escreva como numa carta. Deixe uma linha em branco entre os parágrafos."
          >
            <textarea
              id="texto" value={rascunho.texto} rows={12}
              onChange={(e) => mudar('texto', e.target.value)}
              placeholder="Olá! Nesta edição…"
              className={cn(CAMPO, 'min-h-64 resize-y py-3 leading-relaxed')}
            />
          </Campo>

          <div>
            <p className="mb-1.5 text-base font-semibold">Imagem no topo <span className="ml-2 text-sm font-normal text-muted-foreground">(opcional)</span></p>
            {rascunho.imagem ? (
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <img src={imagemLocal?.url === rascunho.imagem ? imagemLocal.dados : rascunho.imagem} alt="" className="h-16 w-24 shrink-0 rounded-md bg-muted object-cover" />
                <p className="min-w-0 flex-1 text-sm text-muted-foreground">Aparece acima do título.</p>
                <button
                  type="button" onClick={() => { mudar('imagem', ''); setImagemLocal(null) }}
                  className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium hover:bg-muted"
                >
                  <Trash2 className="size-4" />Tirar
                </button>
              </div>
            ) : (
              <label className={cn(
                'flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 text-base font-medium transition-colors hover:bg-muted',
                subindo && 'pointer-events-none opacity-60',
              )}>
                {subindo ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
                {subindo ? 'Enviando a imagem…' : 'Escolher uma foto'}
                <input
                  type="file" accept="image/jpeg,image/png,image/*" className="sr-only" disabled={subindo}
                  onChange={(e) => { void escolherImagem(e.target.files?.[0]); e.target.value = '' }}
                />
              </label>
            )}
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Foto deitada fica melhor. Muita gente vê o e-mail sem as imagens: o texto precisa fazer sentido sozinho.
            </p>
          </div>

          <details className="rounded-lg border border-border" open={Boolean(rascunho.link || rascunho.rotuloDoBotao)}>
            <summary className="flex min-h-12 cursor-pointer items-center px-4 text-base font-medium">
              Acrescentar um botão <span className="ml-2 text-sm font-normal text-muted-foreground">(opcional)</span>
            </summary>
            <div className="space-y-5 border-t border-border p-4">
              <Campo id="link" rotulo="Para onde o botão leva" valor={rascunho.link} dica="Cole o endereço da página: a matéria no site, a página de doação, a inscrição do curso.">
                <input
                  id="link" type="url" inputMode="url" value={rascunho.link}
                  onChange={(e) => mudar('link', e.target.value)}
                  placeholder="https://cruzvermelhariodejaneiro.org/…"
                  className={cn(CAMPO, 'h-12')}
                />
              </Campo>
              <Campo id="rotulo" rotulo="O que está escrito no botão" valor={rascunho.rotuloDoBotao} max={LIMITES.rotuloDoBotao} dica="Em branco, fica “Ler a matéria completa”.">
                <input
                  id="rotulo" value={rascunho.rotuloDoBotao} maxLength={LIMITES.rotuloDoBotao}
                  onChange={(e) => mudar('rotuloDoBotao', e.target.value)}
                  placeholder="Ex.: Quero doar"
                  className={cn(CAMPO, 'h-12')}
                />
              </Campo>
            </div>
          </details>

          {temAlgo && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>O rascunho fica guardado neste aparelho.</span>
              <button type="button" onClick={limpar} className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-medium text-foreground hover:bg-muted">
                <Trash2 className="size-4" />Apagar e começar de novo
              </button>
            </div>
          )}
        </Card>

        <Card className={cn('overflow-hidden', vista !== 'previa' && 'hidden lg:block')}>
          <div className="border-b border-border px-5 py-3">
            <h2 className="font-semibold">Como chega na caixa de entrada</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">É a mensagem de verdade, com o rodapé e o link de saída.</p>
          </div>
          <Previa html={previa} />
        </Card>
      </div>

      {/* O que falta e o que vale rever. Só aparece depois que a pessoa começou a escrever: tela em branco não é erro. */}
      {temAlgo && (conferencia.erros.length > 0 || conferencia.avisos.length > 0) && (
        <ul className="space-y-2">
          {conferencia.erros.map((m) => (
            <li key={m} className="flex items-start gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{m}</span>
            </li>
          ))}
          {conferencia.avisos.map((m) => (
            <li key={m} className="flex items-start gap-2 rounded-lg bg-warning/15 px-4 py-3 text-sm text-warning-foreground">
              <Info className="mt-0.5 size-4 shrink-0" /><span>{m}</span>
            </li>
          ))}
        </ul>
      )}

      {aviso && (
        <p role="status" className={cn(
          'flex items-start gap-2 rounded-lg px-4 py-3 text-sm',
          aviso.tom === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-success/12 text-success',
        )}>
          {aviso.tom === 'erro' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
          <span>{aviso.texto}</span>
        </p>
      )}

      {motivoDeNaoEnviar && (
        <p className="flex items-start gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" /><span>{motivoDeNaoEnviar}</span>
        </p>
      )}

      {passo === 'enviar' && (
        <Card className="border-primary/40 p-5">
          <h2 className="text-lg font-bold">Enviar agora para {destinatarios} pessoa{destinatarios === 1 ? '' : 's'}?</h2>
          <p className="mt-1 text-base leading-relaxed text-muted-foreground">
            Assunto: “{conferencia.edicao.assunto}”. E-mail enviado não volta: depois de sair, não dá para corrigir nem cancelar.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button className="h-12 px-5 text-base" disabled={enviando} onClick={enviar}>
              {enviando ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
              {enviando ? 'Enviando…' : 'Sim, enviar agora'}
            </Button>
            <Button variant="outline" className="h-12 px-5 text-base" disabled={enviando} onClick={() => setPasso(null)}>
              <ArrowLeft className="size-5" />Voltar e revisar
            </Button>
          </div>
        </Card>
      )}

      {passo === 'agendar' && (
        <Card className="border-primary/40 p-5">
          <label htmlFor="horario" className="block text-lg font-bold">Quando a edição deve sair?</label>
          <p className="mt-1 text-base leading-relaxed text-muted-foreground">
            Horário de Brasília. Sai para quem estiver na lista na hora, e dá para cancelar em Edições até lá.
          </p>
          <input
            id="horario" type="datetime-local" value={horario}
            min={horarioMinimo}
            onChange={(e) => setHorario(e.target.value)}
            className={cn(CAMPO, 'mt-3 h-12 sm:max-w-xs')}
          />
          {horario && 'erro' in horarioConferido && (
            <p className="mt-2 flex items-start gap-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{horarioConferido.erro}</p>
          )}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button className="h-12 px-5 text-base" disabled={enviando || 'erro' in horarioConferido} onClick={agendar}>
              {enviando ? <Loader2 className="size-5 animate-spin" /> : <CalendarClock className="size-5" />}
              {enviando ? 'Agendando…' : 'quando' in horarioConferido ? `Agendar para ${horarioParaLer(horarioConferido.quando)}` : 'Agendar'}
            </Button>
            <Button variant="outline" className="h-12 px-5 text-base" disabled={enviando} onClick={() => setPasso(null)}>
              <ArrowLeft className="size-5" />Voltar
            </Button>
          </div>
        </Card>
      )}

      {passo === null && (
        <div data-ajuda="newsletter.nova.enviar" className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              variant="outline" className="h-12 px-5 text-base"
              disabled={testando || !pronta || !podeEnviar || !envioConfigurado}
              onClick={testar}
            >
              {testando ? <Loader2 className="size-5 animate-spin" /> : <TestTube2 className="size-5" />}
              {testando ? 'Enviando o teste…' : 'Enviar um teste para mim'}
            </Button>
            <Button className="h-12 px-5 text-base" disabled={!podeMandar} onClick={() => { setAviso(null); setPasso('enviar') }}>
              <Send className="size-5" />Enviar agora para {destinatarios} pessoa{destinatarios === 1 ? '' : 's'}
            </Button>
            <Button variant="outline" className="h-12 px-5 text-base" disabled={!podeMandar} onClick={abrirAgendamento}>
              <CalendarClock className="size-5" />Agendar para depois
            </Button>
          </div>
          {emailDeQuemEscreve && podeEnviar && (
            <p className="min-w-0 break-words text-sm text-muted-foreground">O teste vai para {emailDeQuemEscreve}.</p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * A prévia, na largura em que o e-mail é desenhado (600 px) e encolhida para caber na tela. Sem isso, no celular o
 * quadro mostraria só o lado esquerdo da mensagem: a prévia existe para a pessoa ver a mensagem inteira.
 */
const LARGURA_DO_EMAIL = 640
const ALTURA_DA_PREVIA = 760

function Previa({ html }: { html: string }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [escala, setEscala] = useState(1)

  useEffect(() => {
    const el = caixa.current
    if (!el) return
    const medir = () => setEscala(Math.min(1, el.clientWidth / LARGURA_DO_EMAIL))
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    return () => observador.disconnect()
  }, [])

  return (
    // Fundo branco de propósito, também no tema escuro: é o papel do e-mail.
    <div ref={caixa} className="overflow-hidden bg-white" style={{ height: ALTURA_DA_PREVIA * escala }}>
      {/* sandbox sem permissões: a prévia não roda script nem navega. */}
      <iframe
        title="Prévia da edição" sandbox="" srcDoc={html}
        className="origin-top-left border-0 bg-white"
        style={{ width: LARGURA_DO_EMAIL, height: ALTURA_DA_PREVIA, transform: `scale(${escala})` }}
      />
    </div>
  )
}

/** Um campo com rótulo grande, a dica embaixo e a contagem só quando falta pouco para o limite. */
function Campo({ id, rotulo, opcional, dica, valor, max, children }: {
  id: string
  rotulo: string
  opcional?: boolean
  dica?: string
  valor: string
  max?: number
  children: React.ReactNode
}) {
  const perto = max !== undefined && valor.length >= max * 0.8
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between gap-3 text-base font-semibold">
        <span>{rotulo}{opcional && <span className="ml-2 text-sm font-normal text-muted-foreground">(opcional)</span>}</span>
        {perto && <span className="text-sm font-normal tabular-nums text-muted-foreground">{valor.length} de {max}</span>}
      </label>
      {children}
      {dica && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{dica}</p>}
    </div>
  )
}

/**
 * Reduz a foto para o tamanho de e-mail: até 1.200 px de largura (o dobro dos 600 px da mensagem, para tela de
 * celular nítida), em JPEG. Devolve o arquivo para subir e a mesma imagem embutida, para a prévia.
 */
const LARGURA_DA_IMAGEM = 1200

async function reduzirImagem(arquivo: File): Promise<{ blob: Blob; dados: string }> {
  if (!arquivo.type.startsWith('image/')) throw new Error('Escolha uma foto (JPEG ou PNG).')
  let imagem: ImageBitmap
  try {
    imagem = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Não consegui abrir esta imagem. Tente uma foto em JPEG ou PNG.')
  }
  const escala = Math.min(1, LARGURA_DA_IMAGEM / imagem.width)
  const tela = document.createElement('canvas')
  tela.width = Math.max(1, Math.round(imagem.width * escala))
  tela.height = Math.max(1, Math.round(imagem.height * escala))
  const contexto = tela.getContext('2d')
  if (!contexto) throw new Error('Este navegador não conseguiu preparar a imagem.')
  // Fundo branco: PNG com transparência viraria preto ao passar para JPEG.
  contexto.fillStyle = '#ffffff'
  contexto.fillRect(0, 0, tela.width, tela.height)
  contexto.drawImage(imagem, 0, 0, tela.width, tela.height)
  imagem.close()
  const blob = await new Promise<Blob | null>((ok) => tela.toBlob(ok, 'image/jpeg', 0.85))
  if (!blob) throw new Error('Este navegador não conseguiu preparar a imagem.')
  return { blob, dados: tela.toDataURL('image/jpeg', 0.85) }
}
