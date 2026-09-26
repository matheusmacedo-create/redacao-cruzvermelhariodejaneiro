'use client'

import { startTransition, useActionState, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronDown, CircleHelp, Loader2, Mail, PenLine, RotateCw, XCircle } from 'lucide-react'
import { entrar, pedirCodigo, type EstadoDeEntrada } from '@/app/actions/membro'
import { cn } from '@/lib/utils'
import {
  CHAVE_DO_ULTIMO_EMAIL, DIAS_DE_SESSAO, MINUTOS_DO_CODIGO, TAMANHO_DO_CODIGO, atalhoDoEmail, contagemLegivel, digitosDoCodigo, emailPlausivel,
  etapaAindaVale, horaLegivel, lerEtapaSalva, normalizarEmail, segundosParaReenviar, type EtapaSalva,
} from '@/lib/membro/entrada'
import { botaoDoMembro, botaoFantasma, botaoSecundario, campoDoMembro } from './marca'
import { CabecalhoDaPagina, LinkExterno, Recado } from './pecas'
import { CampoDoCodigo } from './campo-do-codigo'

/**
 * Entrada em dois passos, sem senha: e-mail → código de 6 dígitos.
 *
 * Quem decide a etapa é a tela, e ela só troca depois da resposta do
 * servidor: "Enviar código" mostra "Enviando…" e só então vai ao passo 2; um
 * reenvio que falha (limite de pedidos) mostra o erro ali mesmo, sem voltar
 * ao passo 1. O formulário do código é remontado a cada envio (`key`), o que
 * apaga o erro do código anterior.
 */

// ---------------------------------------------------------------- o que fica no navegador

/*
 * sessionStorage: a etapa do código (e-mail e horários, nunca o código), para
 * reabrir nela quando a pessoa volta do aplicativo de e-mail — o Safari do
 * iPhone costuma descartar a aba — ou recarrega a página. localStorage: só o
 * último e-mail usado, para já vir preenchido quando a sessão vence; o "Sair"
 * apaga (`esquecerAoSair`, em ./conta). O e-mail nunca vai para a URL.
 * Tudo com try/catch: em aba anônima ou com armazenamento bloqueado, a tela
 * funciona igual, só não lembra.
 */
const CHAVE_DA_ETAPA = 'cvrj-membro-entrada'

function lerGuardado(onde: 'sessao' | 'local', chave: string): string | null {
  try {
    return (onde === 'sessao' ? sessionStorage : localStorage).getItem(chave)
  } catch {
    return null
  }
}

function guardar(onde: 'sessao' | 'local', chave: string, valor: string | null) {
  try {
    const s = onde === 'sessao' ? sessionStorage : localStorage
    if (valor === null) s.removeItem(chave)
    else s.setItem(chave, valor)
  } catch {
    // Sem armazenamento: segue sem lembrar.
  }
}

const guardarEtapa = (e: EtapaSalva | null) => guardar('sessao', CHAVE_DA_ETAPA, e && JSON.stringify(e))

// Lidos com useSyncExternalStore, e não num efeito: no servidor (e na
// hidratação) valem null; logo depois, o que o navegador tiver guardado.
const semAssinatura = () => () => {}
const nadaNoServidor = () => null
const etapaGuardada = () => lerGuardado('sessao', CHAVE_DA_ETAPA)
const ultimoEmail = () => {
  const e = normalizarEmail(lerGuardado('local', CHAVE_DO_ULTIMO_EMAIL) ?? '')
  return emailPlausivel(e) ? e : null
}

/**
 * Tenta entrar. Se der certo, `entrar` redireciona e a promessa é rejeitada
 * com o redirecionamento: esta função não volta. Por isso a etapa guardada
 * sai antes, e só é devolvida se o código não passou.
 */
async function tentarEntrar(anterior: EstadoDeEntrada, fd: FormData): Promise<EstadoDeEntrada> {
  const guardada = lerGuardado('sessao', CHAVE_DA_ETAPA)
  guardar('sessao', CHAVE_DA_ETAPA, null)
  const r = await entrar(anterior, fd)
  if (guardada) guardar('sessao', CHAVE_DA_ETAPA, guardada)
  return r
}

// ---------------------------------------------------------------- a tela

type Tela = { etapa: 'email' } | { etapa: 'codigo'; email: string; enviadoEm: number | null; reenviado: boolean }

export function Entrar({ emailInicial, voltar, sessaoAnterior, noPassoDoEmail, className }: {
  /** O `?email=` do link de boas-vindas. */
  emailInicial: string
  /** Para onde ir depois de entrar, já conferido pela página (e de novo pela action). */
  voltar: string | null
  /** Havia um cookie de sessão: com `voltar`, o recado é "sua sessão terminou". */
  sessaoAnterior: boolean
  /** O que só aparece no passo 1, abaixo do formulário (os benefícios, no celular). */
  noPassoDoEmail?: React.ReactNode
  className?: string
}) {
  const bruta = useSyncExternalStore(semAssinatura, etapaGuardada, nadaNoServidor)
  const emailGuardado = useSyncExternalStore(semAssinatura, ultimoEmail, nadaNoServidor)
  // A hora em que a tela abriu decide, uma vez, se a etapa guardada ainda vale
  // (10 min): a tela não volta sozinha ao passo 1 enquanto está aberta.
  const [abertaEm] = useState(() => Date.now())
  const [escolha, setEscolha] = useState<Tela | null>(null)
  const [emailDigitado, setEmailDigitado] = useState<string | null>(null)
  const [focarEmail, setFocarEmail] = useState(false)
  const [anuncio, setAnuncio] = useState('')

  const guardada = lerEtapaSalva(bruta)
  const inicial = normalizarEmail(emailInicial)
  // Um `?email=` diferente do guardado é outra pessoa (ou outro link): começa do passo 1.
  const retomar = guardada && etapaAindaVale(guardada, abertaEm) && (!inicial || guardada.email === inicial) ? guardada : null
  const tela: Tela = escolha ?? (retomar ? { etapa: 'codigo', email: retomar.email, enviadoEm: retomar.enviadoEm, reenviado: false } : { etapa: 'email' })
  const email = emailDigitado ?? (emailInicial || emailGuardado || '')

  const irParaOCodigo = (para: string, enviadoEm: number | null, agora: number) => {
    setEscolha({ etapa: 'codigo', email: para, enviadoEm, reenviado: false })
    guardarEtapa({ email: para, enviadoEm, salvoEm: agora })
    setAnuncio(enviadoEm === null
      ? `Digite o código de 6 dígitos enviado para ${para}.`
      : `Código pedido para ${para}. Se não chegar, você pode pedir outro em 1 minuto.`)
  }

  return (
    <div className={className}>
      {/* Anuncia a troca de etapa e o reenvio; o foco já vai sozinho para o campo certo. */}
      <p aria-live="polite" className="sr-only">{anuncio}</p>
      {tela.etapa === 'email' ? (
        <PassoDoEmail
          email={email}
          aoMudarEmail={setEmailDigitado}
          focar={focarEmail}
          sessao={voltar ? (sessaoAnterior ? 'terminou' : 'pedida') : null}
          aoEnviar={(para, agora) => {
            guardar('local', CHAVE_DO_ULTIMO_EMAIL, para)
            irParaOCodigo(para, agora, agora)
          }}
          aoJaTerCodigo={(para) => irParaOCodigo(para, null, Date.now())}
          extras={noPassoDoEmail}
        />
      ) : (
        <PassoDoCodigo
          email={tela.email}
          enviadoEm={tela.enviadoEm}
          reenviado={tela.reenviado}
          voltar={voltar}
          aoTrocarEmail={() => {
            setEmailDigitado(tela.email)
            setEscolha({ etapa: 'email' })
            guardarEtapa(null)
            setFocarEmail(true)
            setAnuncio('')
          }}
          aoReenviar={(para, agora) => {
            setEscolha({ etapa: 'codigo', email: para, enviadoEm: agora, reenviado: true })
            guardarEtapa({ email: para, enviadoEm: agora, salvoEm: agora })
            setAnuncio(`Novo código pedido às ${horaLegivel(agora)}. Se chegar mais de um, use o mais recente.`)
          }}
        />
      )}
    </div>
  )
}

/** Erro logo abaixo do campo, ligado a ele por `aria-describedby`. Sempre com ícone. */
function ErroDoCampo({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-1.5 text-sm font-medium text-destructive">
      <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{children}
    </p>
  )
}

const TEXTO_DA_SESSAO = {
  terminou: 'Sua sessão terminou. Entre de novo para continuar de onde parou.',
  pedida: 'Entre para continuar: depois do código, você segue para a página que abriu.',
}

// ---------------------------------------------------------------- passo 1: e-mail

function PassoDoEmail({ email, aoMudarEmail, focar, sessao, aoEnviar, aoJaTerCodigo, extras }: {
  email: string
  aoMudarEmail: (v: string) => void
  focar: boolean
  sessao: keyof typeof TEXTO_DA_SESSAO | null
  aoEnviar: (email: string, agora: number) => void
  aoJaTerCodigo: (email: string) => void
  extras?: React.ReactNode
}) {
  const [estado, pedir, pedindo] = useActionState(async (anterior: EstadoDeEntrada, fd: FormData): Promise<EstadoDeEntrada> => {
    const r = await pedirCodigo(anterior, fd)
    // Só troca de etapa com a resposta na mão: o código saiu (ou a resposta
    // neutra, igual para quem não tem cadastro).
    if (r.etapa === 'codigo' && r.email) {
      const para = r.email
      const agora = Date.now()
      startTransition(() => aoEnviar(para, agora))
    }
    return r
  }, { etapa: 'email' })
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const campo = useRef<HTMLInputElement>(null)
  const erro = erroLocal ?? (pedindo ? null : estado.erro ?? null)

  // Confere antes de gastar um dos 5 pedidos por hora.
  const conferir = (texto: string, seVazio: string): { email: string } | { erro: string } => {
    const e = normalizarEmail(texto)
    if (!e) return { erro: seVazio }
    if (!emailPlausivel(e)) return { erro: 'Confira o e-mail: ele precisa ter o formato nome@exemplo.com.' }
    return { email: e }
  }
  const recusar = (mensagem: string) => {
    setErroLocal(mensagem)
    campo.current?.focus()
  }

  return (
    <>
      <CabecalhoDaPagina sobretitulo="Passo 1 de 2" titulo="Entrar na Área do Voluntário" descricao="Sem senha: enviamos um código de 6 dígitos para o seu e-mail." />
      {sessao && <Recado tipo="info" className="mt-5">{TEXTO_DA_SESSAO[sessao]}</Recado>}

      <form
        id="form-email"
        noValidate
        action={(fd) => {
          // Com o botão em `aria-disabled` (e não `disabled`), o Enter no campo ainda envia: a guarda barra o segundo pedido.
          if (pedindo) return
          const c = conferir(String(fd.get('email') ?? ''), 'Digite seu e-mail.')
          if ('erro' in c) return recusar(c.erro)
          setErroLocal(null)
          pedir(fd)
        }}
        className="mt-6 flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="m-email" className="text-sm font-medium">Seu e-mail</label>
          <input
            ref={campo}
            id="m-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus={focar}
            placeholder="nome@exemplo.com"
            value={email}
            onChange={(e) => { aoMudarEmail(e.target.value); setErroLocal(null) }}
            readOnly={pedindo}
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? 'email-dica email-erro' : 'email-dica'}
            className={cn(campoDoMembro, 'min-h-12 pointer-fine:sm:text-base')}
          />
          <p id="email-dica" className="text-xs text-muted-foreground">O mesmo e-mail que você usou na inscrição.</p>
          {erro && <ErroDoCampo id="email-erro">{erro}</ErroDoCampo>}
        </div>
        {/* `aria-disabled` e não `disabled`: desativar o botão focado jogaria o foco no `<body>`, e no erro nada o devolvia. */}
        <button type="submit" aria-disabled={pedindo || undefined} className={cn(botaoDoMembro, 'min-h-12 w-full aria-disabled:opacity-60')}>
          {pedindo
            ? <><Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />Enviando…</>
            : <><Mail className="size-4" aria-hidden="true" />Enviar código</>}
        </button>
        {/* Vai ao passo 2 sem pedir outro código: pedir de novo invalidaria o que já chegou. */}
        <button
          type="button"
          disabled={pedindo}
          onClick={() => {
            const c = conferir(email, 'Digite seu e-mail primeiro.')
            if ('erro' in c) recusar(c.erro)
            else aoJaTerCodigo(c.email)
          }}
          className={cn(botaoFantasma, 'w-full')}
        >
          Já tenho um código
        </button>
      </form>

      <div className="mt-6 flex flex-col items-center gap-1 text-center text-sm text-muted-foreground">
        <p>Este aparelho fica conectado por {DIAS_DE_SESSAO} dias depois do último acesso.</p>
        <p>
          Ainda não faz parte?{' '}
          <Link href="/participe" className="inline-flex min-h-11 items-center font-semibold text-foreground underline underline-offset-4 hover:no-underline">Quero me inscrever</Link>
        </p>
      </div>
      {extras}
    </>
  )
}

// ---------------------------------------------------------------- passo 2: código

function PassoDoCodigo({ email, enviadoEm, reenviado, voltar, aoTrocarEmail, aoReenviar }: {
  email: string
  /** null: a pessoa disse "Já tenho um código" (não sabemos quando saiu). */
  enviadoEm: number | null
  reenviado: boolean
  voltar: string | null
  aoTrocarEmail: () => void
  aoReenviar: (email: string, agora: number) => void
}) {
  // Relógio da contagem do "Reenviar": anda só enquanto falta tempo.
  const [agora, setAgora] = useState(() => Date.now())
  const faltam = segundosParaReenviar(enviadoEm, agora)
  const contando = faltam > 0
  useEffect(() => {
    if (!contando) return
    const relogio = setInterval(() => setAgora(Date.now()), 500)
    return () => clearInterval(relogio)
  }, [contando])

  const [reenvio, reenviar, reenviando] = useActionState(async (anterior: EstadoDeEntrada, fd: FormData): Promise<EstadoDeEntrada> => {
    const r = await pedirCodigo(anterior, fd)
    if (r.etapa === 'codigo') {
      const quando = Date.now()
      startTransition(() => aoReenviar(email, quando))
    }
    return r
  }, { etapa: 'codigo' })
  const pedirNovo = () => {
    if (reenviando) return
    const fd = new FormData()
    fd.set('email', email)
    startTransition(() => reenviar(fd))
  }
  const erroDoReenvio = reenviando ? null : reenvio.erro
  const atalho = atalhoDoEmail(email)

  return (
    <>
      <CabecalhoDaPagina
        sobretitulo="Passo 2 de 2"
        titulo="Confira seu e-mail"
        // Sem afirmar o envio: a resposta é a mesma com ou sem cadastro, e quem ainda não foi aprovado não recebe nada.
        descricao={enviadoEm === null ? 'Digite o código de 6 dígitos que enviamos para:' : 'Se o e-mail abaixo tiver cadastro ativo, enviamos para ele um código de 6 dígitos:'}
      >
        {/* `-ml-2` no botão: ao lado do e-mail fica a 8px dele; quando um e-mail longo o empurra para a linha de baixo, o ícone alinha à esquerda. */}
        <div className="flex flex-wrap items-center gap-x-2">
          {/* O e-mail inteiro, sem máscara: a pessoa acabou de digitá-lo, e vê-lo ajuda a achar erro de digitação. */}
          <strong className="min-w-0 break-all font-semibold">{email}</strong>
          <button type="button" onClick={aoTrocarEmail} className={cn(botaoFantasma, '-ml-2 px-2')}>
            <PenLine className="size-4" aria-hidden="true" />Trocar e-mail
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          {enviadoEm === null
            ? `O código vale por ${MINUTOS_DO_CODIGO} minutos depois do envio. Se venceu, peça outro aqui embaixo.`
            : `Pode levar até 1 minuto. O código vale por ${MINUTOS_DO_CODIGO} minutos.`}
        </p>
        {/* À vista, e não só no "Não chegou?": quem ainda espera a aprovação é quem mais precisa ler isto. Sem revelar se o e-mail tem cadastro. */}
        {enviadoEm !== null && (
          <p className="mt-2 text-sm text-muted-foreground">Inscreveu-se há pouco? O acesso é liberado quando a coordenação aprova sua inscrição, e você recebe um e-mail de boas-vindas.</p>
        )}
        {reenviado && enviadoEm !== null && (
          <p className="mt-2 flex items-start gap-1.5 text-sm font-medium text-(--success-texto)">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            Novo código pedido às {horaLegivel(enviadoEm)}. Se chegar mais de um, use o mais recente.
          </p>
        )}
      </CabecalhoDaPagina>

      <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <FormDoCodigo key={enviadoEm ?? 'sem-envio'} email={email} voltar={voltar} pedirNovo={pedirNovo} reenviando={reenviando} />
        {erroDoReenvio && <div className="mt-3"><ErroDoCampo>{erroDoReenvio}</ErroDoCampo></div>}

        <div className={cn('mt-5 grid gap-2 border-t border-border pt-5', atalho && 'sm:grid-cols-2')}>
          {atalho && <LinkExterno href={atalho.href} className={cn(botaoSecundario, 'w-full')}>{atalho.rotulo}</LinkExterno>}
          {/* Enquanto reenvia, `aria-disabled` (o botão focado não perde o foco se der erro); na contagem, `disabled` de verdade. */}
          <form action={(fd) => { if (!reenviando) reenviar(fd) }}>
            <input type="hidden" name="email" value={email} />
            <button type="submit" disabled={contando} aria-disabled={reenviando || undefined} className={cn(botaoSecundario, 'w-full aria-disabled:opacity-60')}>
              {reenviando
                ? <><Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />Enviando…</>
                : contando
                  // A contagem que muda a cada segundo fica fora do leitor de tela; quem avisa é a região abaixo.
                  ? <><span aria-hidden="true" className="tabular-nums">Reenviar em {contagemLegivel(faltam)}</span><span className="sr-only">Reenviar código</span></>
                  : <><RotateCw className="size-4" aria-hidden="true" />Reenviar código</>}
            </button>
          </form>
        </div>
        <p aria-live="polite" className="sr-only">{enviadoEm !== null && !contando ? 'Você já pode pedir um novo código.' : ''}</p>
      </div>

      <details className="group mt-4 rounded-xl border border-border bg-card">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 text-sm font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2"><CircleHelp className="size-4 text-muted-foreground" aria-hidden="true" />Não chegou?</span>
          <ChevronDown className="size-4 text-muted-foreground group-open:rotate-180 motion-safe:transition-transform" aria-hidden="true" />
        </summary>
        <ul className="flex list-disc flex-col gap-2 border-t border-border py-3 pl-9 pr-4 text-sm text-muted-foreground">
          <li>Procure por “código de acesso” no Spam, em Promoções ou no Lixo eletrônico e marque como “Não é spam”.</li>
          <li>Confira se o e-mail acima está certo.</li>
          {/* Mesmo número que a Política de Privacidade publica como o WhatsApp do Voluntariado (lib/site/juridico.ts). Mudou lá, muda aqui. */}
          <li>
            Ainda sem código? Fale com a coordenação do Voluntariado pelo WhatsApp{' '}
            {/* nowrap: sem ele, o ponto final caía sozinho na linha de baixo. */}
            <span className="whitespace-nowrap"><LinkExterno href="https://wa.me/5521970360264">(21) 97036-0264</LinkExterno>.</span>
          </li>
        </ul>
      </details>
    </>
  )
}

function FormDoCodigo({ email, voltar, pedirNovo, reenviando }: { email: string; voltar: string | null; pedirNovo: () => void; reenviando: boolean }) {
  const [estado, tentar, entrando] = useActionState(tentarEntrar, { etapa: 'codigo' })
  const [codigo, setCodigo] = useState('')
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [mexeuDepoisDoErro, setMexeuDepoisDoErro] = useState(false)
  const campo = useRef<HTMLInputElement>(null)

  // Deu erro: os dígitos ficam, e o foco volta ao campo com tudo selecionado
  // (é só digitar por cima).
  useEffect(() => {
    if (!estado.erro) return
    campo.current?.focus()
    campo.current?.select()
  }, [estado])

  // Código vencido, usado ou com tentativas esgotadas: insistir não adianta.
  const codigoMorreu = !entrando && !!estado.novoCodigo
  const erroDoServidor = !entrando && estado.erro && (codigoMorreu || !mexeuDepoisDoErro) ? estado.erro : null
  const erro = erroLocal ?? erroDoServidor

  return (
    <form
      id="form-codigo"
      noValidate
      action={(fd) => {
        if (digitosDoCodigo(String(fd.get('codigo') ?? '')).length !== TAMANHO_DO_CODIGO) {
          setErroLocal('Digite os 6 dígitos do código.')
          campo.current?.focus()
          return
        }
        setErroLocal(null)
        setMexeuDepoisDoErro(false)
        tentar(fd)
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="email" value={email} />
      {voltar && <input type="hidden" name="voltar" value={voltar} />}
      <div className="flex flex-col gap-2">
        <label htmlFor="m-codigo" className="text-sm font-medium">Código de 6 dígitos</label>
        <CampoDoCodigo
          ref={campo}
          valor={codigo}
          aoMudar={(d) => { setCodigo(d); setErroLocal(null); setMexeuDepoisDoErro(true) }}
          erro={!!erro}
          somenteLeitura={entrando}
          enviarAoCompletar={!codigoMorreu}
          descritoPor={erro ? 'codigo-dica codigo-erro' : 'codigo-dica'}
        />
        <p id="codigo-dica" className="text-xs text-muted-foreground">Está no assunto do e-mail, antes de “é o seu código de acesso”.</p>
        {erro && <ErroDoCampo id="codigo-erro">{erro}</ErroDoCampo>}
      </div>
      {codigoMorreu ? (
        <button type="button" onClick={pedirNovo} aria-disabled={reenviando || undefined} className={cn(botaoDoMembro, 'min-h-12 w-full aria-disabled:opacity-60')}>
          {reenviando
            ? <><Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />Enviando…</>
            : <><RotateCw className="size-4" aria-hidden="true" />Enviar novo código</>}
        </button>
      ) : (
        <button type="submit" disabled={entrando} className={cn(botaoDoMembro, 'min-h-12 w-full')}>
          {entrando ? <><Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />Entrando…</> : 'Entrar'}
        </button>
      )}
    </form>
  )
}
