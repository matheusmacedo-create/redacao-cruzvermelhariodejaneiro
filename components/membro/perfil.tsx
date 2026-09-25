'use client'

import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import { BellRing, Check, CircleCheck, LoaderCircle, LogOut, type LucideIcon } from 'lucide-react'
import { preferirAvisos, sair, salvarPerfil } from '@/app/actions/membro'
import { DISPONIBILIDADES, UFS } from '@/lib/participantes/regras'
import type { Perfil } from '@/lib/membro/dados'
import { cn } from '@/lib/utils'
import { barraFixa, botaoDoMembro, botaoSecundario, campoDoMembro } from './marca'
import { Recado, Secao } from './pecas'

/*
 * O formulário do perfil envia por `onSubmit` + `startTransition`, e não por
 * `<form action>`: com `action`, o React 19 zera o formulário depois de toda
 * ação — inclusive quando o servidor devolve erro, e a pessoa perdia tudo o
 * que tinha acabado de digitar.
 */

/** Verbo parado e verbo em andamento no mesmo lugar: o botão não muda de largura ao enviar. */
export function RotuloDeEnvio({ ocupado, icone: Icone, rotulo, andamento }: { ocupado: boolean; icone?: LucideIcon; rotulo: string; andamento: string }) {
  const camada = 'col-start-1 row-start-1 inline-flex items-center justify-center gap-2'
  return (
    <span className="inline-grid">
      <span className={cn(camada, ocupado && 'invisible')}>{Icone && <Icone className="size-4 shrink-0" aria-hidden="true" />}{rotulo}</span>
      <span className={cn(camada, !ocupado && 'invisible')}><LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />{andamento}</span>
    </span>
  )
}

/**
 * Recado que recebe o foco ao aparecer (monte de novo com outra `key` a cada
 * resultado). Serve quando o botão que a pessoa tocou some junto com a ação:
 * sem isto o foco caía no `<body>` e o leitor de tela ficava sem rumo.
 */
export function RecadoEmFoco({ className, ...props }: React.ComponentProps<typeof Recado>) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return <Recado {...props} ref={ref} tabIndex={-1} className={cn('outline-none', className)} />
}

const cartao = 'rounded-xl border border-border bg-card p-4 sm:p-5'
// `scroll-mt-8`: os links de "Falta preencher" levam direto ao campo (#m-telefone,
// #m-cep); sem a margem, o rótulo ficava cortado no alto da tela do celular. No
// computador vale o `scroll-mt` maior do <main>, que desconta o cabeçalho fixo.
const campo = `${campoDoMembro} scroll-mt-8`

function Rotulado({ id, rotulo, dica, largo, children }: { id: string; rotulo: string; dica?: string; largo?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', largo && 'sm:col-span-2')}>
      <label htmlFor={id} className="text-sm font-medium">{rotulo}</label>
      {dica && <p id={`${id}-dica`} className="text-sm text-muted-foreground">{dica}</p>}
      {children}
    </div>
  )
}

function Campo({ id, rotulo, dica, largo, ...input }: { id: string; rotulo: string; dica?: string; largo?: boolean } & Omit<React.ComponentProps<'input'>, 'id' | 'className'>) {
  return (
    <Rotulado id={id} rotulo={rotulo} dica={dica} largo={largo}>
      <input id={id} aria-describedby={dica ? `${id}-dica` : undefined} className={campo} {...input} />
    </Rotulado>
  )
}

/** O formulário como texto, para saber se algo mudou desde o último salvamento. */
const retrato = (f: HTMLFormElement) => JSON.stringify([...new FormData(f)].map(([k, v]) => [k, String(v)]))

type Resultado = { erro?: string; ok?: boolean; vez: number }

/**
 * O que o voluntário pode mudar sozinho. O banco confere a lista de novo.
 * A barra "Alterações não salvas" só aparece quando algo mudou; o resultado
 * vem no alto do formulário e recebe o foco. Com erro, tudo o que a pessoa
 * digitou continua na tela.
 */
export function FormularioDoPerfil({ p }: { p: Perfil }) {
  const formulario = useRef<HTMLFormElement>(null)
  const barra = useRef<HTMLDivElement>(null)
  // O último estado que o servidor confirmou. Começa no que veio do banco.
  const salvo = useRef<string | null>(null)
  const [alterado, setAlterado] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [enviando, iniciar] = useTransition()
  const v = (k: keyof Perfil) => String(p[k] ?? '')

  useEffect(() => {
    if (formulario.current) salvo.current = retrato(formulario.current)
  }, [])

  // O navegador não rola até um campo que já está na tela, mesmo que a barra
  // fixa o cubra (e `scrollIntoView` com `nearest` ignora o `scroll-margin`
  // nesse caso). Com a barra visível, o campo em foco sobe até ficar acima dela.
  function mostrarCampoAtivo() {
    const ativo = document.activeElement
    if (!barra.current || !(ativo instanceof HTMLElement) || !formulario.current?.contains(ativo) || barra.current.contains(ativo)) return
    // No chip, o `<input>` é invisível: quem aparece é o `<label>`.
    const alvo = (ativo.matches('input[type=checkbox]') && ativo.closest('label')) || ativo
    const coberto = alvo.getBoundingClientRect().bottom - barra.current.getBoundingClientRect().top + 12
    if (coberto > 0) window.scrollBy({ top: coberto })
  }

  // A barra acabou de aparecer (primeira mudança): pode ter caído em cima do campo que a pessoa está usando.
  useEffect(() => {
    if (alterado) mostrarCampoAtivo()
  }, [alterado])

  function aoMudar(e: React.FormEvent<HTMLFormElement>) {
    setAlterado(retrato(e.currentTarget) !== salvo.current)
    // "Cadastro atualizado" não vale mais para o que a pessoa voltou a mexer. O erro fica até a próxima tentativa.
    setResultado((r) => (r?.ok ? null : r))
  }

  function aoEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const dados = new FormData(form)
    const enviado = retrato(form)
    iniciar(async () => {
      const r = await salvarPerfil({}, dados)
      if (r.ok) {
        salvo.current = enviado
        // Se a pessoa continuou digitando enquanto salvava, a barra fica.
        setAlterado(retrato(form) !== enviado)
      }
      setResultado((anterior) => ({ ...r, vez: (anterior?.vez ?? 0) + 1 }))
    })
  }

  return (
    <form ref={formulario} id="form-perfil" className="flex flex-col gap-6" onChange={aoMudar} onSubmit={aoEnviar} onFocus={() => { if (alterado) mostrarCampoAtivo() }}>
      {resultado?.erro && (
        <RecadoEmFoco key={resultado.vez} id="perfil-resultado" tipo="erro" titulo={resultado.erro}>
          <p>O que você digitou continua aqui. Confira e tente salvar de novo.</p>
        </RecadoEmFoco>
      )}
      {resultado?.ok && <RecadoEmFoco key={resultado.vez} id="perfil-resultado" tipo="sucesso" titulo="Cadastro atualizado." />}

      <Secao titulo="Contato" className={cn(cartao, 'gap-4')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="m-nome-social" name="nome_social" rotulo="Nome social" maxLength={200} defaultValue={v('nome_social')} autoComplete="off"
            dica="Opcional. Se preenchido, é por ele que chamamos você aqui e nos e-mails." largo />
          <Campo id="m-telefone" name="telefone" rotulo="Telefone ou WhatsApp" type="tel" maxLength={40} defaultValue={v('telefone')} autoComplete="tel" />
        </div>
      </Secao>

      <Secao titulo="Endereço" className={cn(cartao, 'gap-4')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="m-cep" name="cep" rotulo="CEP" inputMode="numeric" maxLength={12} defaultValue={v('cep')} autoComplete="postal-code" />
          <Campo id="m-logradouro" name="logradouro" rotulo="Logradouro" maxLength={200} defaultValue={v('logradouro')} autoComplete="address-line1" />
          <Campo id="m-numero" name="numero" rotulo="Número" maxLength={20} defaultValue={v('numero')} />
          <Campo id="m-complemento" name="complemento" rotulo="Complemento" maxLength={120} defaultValue={v('complemento')} autoComplete="address-line2" />
          <Campo id="m-bairro" name="bairro" rotulo="Bairro" maxLength={120} defaultValue={v('bairro')} autoComplete="address-level3" />
          <Campo id="m-cidade" name="cidade" rotulo="Cidade" maxLength={120} defaultValue={v('cidade')} autoComplete="address-level2" />
          <Rotulado id="m-uf" rotulo="UF">
            {/* Sem UF no cadastro, fica em branco: o antigo padrão "RJ" gravava um estado que a pessoa nunca escolheu. */}
            <select id="m-uf" name="uf" defaultValue={p.uf ?? ''} autoComplete="address-level1" className={campo}>
              <option value="">Selecione</option>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Rotulado>
        </div>
      </Secao>

      {/* `autoComplete="off"`: o navegador preenchia aqui o nome e o telefone da própria pessoa. */}
      <Secao titulo="Contato de emergência" id="emergencia" className={cn(cartao, 'gap-4')}>
        <p className="-mt-2 text-sm text-muted-foreground">Quem a filial avisa se algo acontecer com você durante uma ação.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="m-emerg-nome" name="emergencia_nome" rotulo="Nome" maxLength={200} defaultValue={v('emergencia_nome')} autoComplete="off" />
          <Campo id="m-emerg-tel" name="emergencia_telefone" rotulo="Telefone" type="tel" maxLength={40} defaultValue={v('emergencia_telefone')} autoComplete="off" />
          <Campo id="m-emerg-par" name="emergencia_parentesco" rotulo="Parentesco ou relação" maxLength={60} defaultValue={v('emergencia_parentesco')} autoComplete="off" />
        </div>
      </Secao>

      <Secao titulo="Perfil de voluntariado" className={cn(cartao, 'gap-4')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="m-habilidades" name="habilidades" rotulo="Habilidades" defaultValue={p.habilidades.join(', ')} dica="Separe por vírgula. Ex.: primeiros socorros, fotografia." largo />
          <Campo id="m-idiomas" name="idiomas" rotulo="Idiomas" defaultValue={p.idiomas.join(', ')} dica="Separe por vírgula. Ex.: inglês, Libras." largo />
          <fieldset id="disponibilidade" className="min-w-0 sm:col-span-2">
            <legend className="mb-2 text-sm font-medium">Quando você pode atuar</legend>
            <div className="flex flex-wrap gap-2">
              {DISPONIBILIDADES.map((d) => (
                <label key={d} className="relative inline-flex min-h-11 cursor-pointer select-none items-center gap-1.5 rounded-full border border-input bg-background px-4 text-sm hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:checked]:hover:bg-primary/90 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring">
                  <input type="checkbox" name="disponibilidade" value={d} defaultChecked={p.disponibilidade.includes(d)} className="peer sr-only" />
                  <Check className="hidden size-4 shrink-0 peer-checked:block" aria-hidden="true" />{d}
                </label>
              ))}
            </div>
            {/* Mantém o campo no envio mesmo sem nada marcado: é assim que o banco sabe que era para limpar. */}
            <input type="hidden" name="disponibilidade" value="" />
          </fieldset>
        </div>
      </Secao>

      {alterado && (
        <div ref={barra} className={cn(barraFixa, 'flex flex-wrap items-center justify-between gap-x-4 gap-y-2')}>
          <p className="text-sm font-medium">Alterações não salvas</p>
          <button type="submit" disabled={enviando} className={botaoDoMembro}>
            <RotuloDeEnvio ocupado={enviando} rotulo="Salvar" andamento="Salvando…" />
          </button>
        </div>
      )}
    </form>
  )
}

/**
 * Avisos da coordenação por e-mail: liga e desliga na hora, fora do
 * formulário (não depende do "Salvar"). A caixa já mostra a escolha enquanto
 * o servidor grava; se der erro, volta sozinha ao que era.
 */
export function PreferenciaDeAvisos({ inicial }: { inicial: boolean }) {
  const [ligado, setLigado] = useState(inicial)
  const [mostrado, mostrar] = useOptimistic(ligado)
  const [erro, setErro] = useState('')
  const [salvou, setSalvou] = useState(false)
  const [ocupado, iniciar] = useTransition()
  const mudar = (valor: boolean) => iniciar(async () => {
    mostrar(valor)
    setErro('')
    setSalvou(false)
    const r = await preferirAvisos(valor)
    if (r.erro) setErro(r.erro)
    else { setLigado(valor); setSalvou(true) }
  })
  return (
    <Secao titulo={<>Preferências <span className="font-normal text-muted-foreground">· salva na hora</span></>} icone={BellRing} id="preferencias" className={cartao}>
      <div>
        {/* Sem `disabled` enquanto grava: desativar a caixa focada tirava o foco dela. */}
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input id="avisos-por-email" type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary" checked={mostrado}
            aria-describedby="avisos-por-email-dica" onChange={(e) => mudar(e.target.checked)} />
          <span className="min-w-0">
            <span className="font-medium">Receber os avisos do mural também por e-mail</span>
            <span id="avisos-por-email-dica" className="mt-0.5 block text-muted-foreground">E-mails sobre as suas inscrições, certificados e respostas às suas mensagens chegam sempre.</span>
          </span>
        </label>
        {/* Sempre no DOM (vazio não ocupa espaço): a região precisa existir antes de mudar para o leitor de tela anunciar. */}
        <p role="status" className="flex items-center gap-1.5 pl-8 text-sm">
          {ocupado
            ? <><LoaderCircle className="size-4 shrink-0 text-muted-foreground motion-safe:animate-spin" aria-hidden="true" />Salvando…</>
            : salvou && <><CircleCheck className="size-4 shrink-0 text-success" aria-hidden="true" /><span className="text-(--success-texto)">Preferência salva.</span></>}
        </p>
      </div>
      {erro && <Recado tipo="erro">{erro}</Recado>}
    </Secao>
  )
}

function BotaoDeSair() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className={cn(botaoSecundario, 'w-full sm:w-auto')}>
      <RotuloDeEnvio ocupado={pending} icone={LogOut} rotulo="Sair da Área do Voluntário" andamento="Saindo…" />
    </button>
  )
}

/**
 * O "Sair" no fim do Perfil. No celular é o único; no computador também está
 * no menu da conta. A página não o mostra na visualização da equipe (lá o
 * menu diz "Voltar ao Redação").
 */
export function SairDaArea() {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-6">
      <p className="text-sm text-muted-foreground">Seu acesso continua ativo neste aparelho. Se ele for compartilhado, saia ao terminar.</p>
      <form action={sair}><BotaoDeSair /></form>
    </div>
  )
}
