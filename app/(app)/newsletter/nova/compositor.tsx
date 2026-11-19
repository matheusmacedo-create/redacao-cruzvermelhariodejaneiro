'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, Info, Loader2, PencilLine, Send, TestTube2, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { conferirEdicao, lerRascunho, LIMITES, RASCUNHO_VAZIO, type RascunhoDaEdicao } from '@/lib/newsletter/edicao'
import { emailDaNewsletter } from '@/lib/newsletter/modelo'
import { enviarEdicaoDaNewsletter, enviarTesteDaEdicao } from '@/app/actions/newsletter'

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
  const [confirmando, setConfirmando] = useState(false)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [enviada, setEnviada] = useState<number | null>(null)
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
    if (!carregado || enviada !== null) return
    try {
      const vazio = Object.values(rascunho).every((v) => !v.trim())
      if (vazio) window.localStorage.removeItem(CHAVE_DO_RASCUNHO)
      else window.localStorage.setItem(CHAVE_DO_RASCUNHO, JSON.stringify(rascunho))
    } catch { /* o rascunho é conveniência */ }
  }, [rascunho, carregado, enviada])

  const mudar = (campo: keyof RascunhoDaEdicao, valor: string) => {
    setRascunho((r) => ({ ...r, [campo]: valor }))
    setConfirmando(false)
  }

  const conferencia = useMemo(() => conferirEdicao(rascunho), [rascunho])
  const temAlgo = Object.values(rascunho).some((v) => v.trim())
  const pronta = conferencia.erros.length === 0

  const previa = useMemo(() => emailDaNewsletter({
    titulo: conferencia.edicao.assunto || 'O assunto aparece aqui',
    ...conferencia.edicao,
    paragrafos: conferencia.edicao.paragrafos.length ? conferencia.edicao.paragrafos : ['O texto da edição aparece aqui, do jeito que chega na caixa de entrada.'],
    urlDeSaida: '#',
  }).html, [conferencia])

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
    setConfirmando(false)
    setAviso(null)
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
      setConfirmando(false)
      if (r.erro) { setAviso({ tom: 'erro', texto: r.erro }); return }
      try { window.localStorage.removeItem(CHAVE_DO_RASCUNHO) } catch { /* conveniência */ }
      setAviso(null)
      setEnviada(r.enviados ?? destinatarios)
    })
  }

  if (enviada !== null) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <CheckCircle2 className="mx-auto size-12 text-success" />
        <h2 className="mt-4 text-xl font-bold">Edição enviada</h2>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          “{conferencia.edicao.assunto}” saiu para {enviada} pessoa{enviada === 1 ? '' : 's'}. Ela já aparece em Edições.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button className="h-12 px-5 text-base" render={<Link href="/newsletter" />}>Ver as edições</Button>
          <Button
            variant="outline" className="h-12 px-5 text-base"
            onClick={() => { setRascunho(RASCUNHO_VAZIO); setEnviada(null); setVista('escrever') }}
          >
            Escrever outra
          </Button>
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

      {confirmando ? (
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
            <Button variant="outline" className="h-12 px-5 text-base" disabled={enviando} onClick={() => setConfirmando(false)}>
              <ArrowLeft className="size-5" />Voltar e revisar
            </Button>
          </div>
        </Card>
      ) : (
        <div data-ajuda="newsletter.nova.enviar" className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            variant="outline" className="h-12 px-5 text-base"
            disabled={testando || !pronta || !podeEnviar || !envioConfigurado}
            onClick={testar}
          >
            {testando ? <Loader2 className="size-5 animate-spin" /> : <TestTube2 className="size-5" />}
            {testando ? 'Enviando o teste…' : 'Enviar um teste para mim'}
          </Button>
          <Button className="h-12 px-5 text-base" disabled={!podeMandar} onClick={() => { setAviso(null); setConfirmando(true) }}>
            <Send className="size-5" />Enviar para {destinatarios} pessoa{destinatarios === 1 ? '' : 's'}
          </Button>
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
