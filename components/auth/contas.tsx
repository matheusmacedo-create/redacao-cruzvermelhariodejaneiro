'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, Mail, MailCheck, MailWarning } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { confirmarEmail, definirSenhaPeloLink, pedirAjudaComVerificacao, pedirRedefinicaoDeSenha, pedirTrocaDeEmail } from '@/app/actions/contas'
import { problemaDaSenha, SENHA_MINIMO } from '@/lib/usuarios/senha'
import { emailValido } from '@/lib/contas/emails'

const campo = 'h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
type Aviso = { tom: 'ok' | 'erro'; texto: string } | null

function Recado({ aviso }: { aviso: Aviso }) {
  if (!aviso) return null
  return <p role={aviso.tom === 'erro' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-sm ${aviso.tom === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>{aviso.texto}</p>
}

// ------------------------------------------------------------------ esqueci minha senha

export function EsqueciSenhaForm() {
  const [identificador, setIdentificador] = useState('')
  const [aviso, setAviso] = useState<Aviso>(null)
  const [enviado, setEnviado] = useState(false)
  const [ocupado, rodar] = useTransition()

  function enviar(event: React.FormEvent) {
    event.preventDefault()
    setAviso(null)
    rodar(async () => {
      const form = new FormData()
      form.set('identificador', identificador)
      const r = await pedirRedefinicaoDeSenha(form)
      if (r.erro) return setAviso({ tom: 'erro', texto: r.erro })
      setAviso({ tom: 'ok', texto: r.recado ?? 'Pedido recebido.' })
      setEnviado(true)
    })
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium">Usuário ou e-mail
        <input required autoComplete="username" value={identificador} onChange={(e) => setIdentificador(e.target.value)} className={campo} placeholder="nome.sobrenome ou seu@email.com" disabled={enviado} />
      </label>
      <Recado aviso={aviso} />
      {!enviado && <Button type="submit" size="lg" className="h-11" disabled={ocupado || identificador.trim().length < 3}>{ocupado && <Loader2 className="size-4 animate-spin" />}Enviar link por e-mail</Button>}
    </form>
  )
}

// ------------------------------------------------------------------ senha pelo link

export function SenhaPeloLinkForm({ token, usuario, nome, convite }: { token: string; usuario: string; nome: string; convite: boolean }) {
  const [nova, setNova] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [ver, setVer] = useState(false)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [ocupado, rodar] = useTransition()
  const problema = nova ? problemaDaSenha(nova, { usuario, nome }) : null
  const naoConfere = confirmacao.length > 0 && confirmacao !== nova

  function enviar(event: React.FormEvent) {
    event.preventDefault()
    setAviso(null)
    rodar(async () => {
      const form = new FormData()
      form.set('t', token)
      form.set('novaSenha', nova)
      form.set('confirmacao', confirmacao)
      const r = await definirSenhaPeloLink(form)
      if (r?.erro) setAviso({ tom: 'erro', texto: r.erro })
    })
  }

  const tipo = ver ? 'text' : 'password'
  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      {/* Para o gerenciador de senhas associar a senha nova ao usuário certo. */}
      <input type="text" name="username" autoComplete="username" value={usuario} readOnly hidden />
      <label className="flex flex-col gap-2 text-sm font-medium">{convite ? 'Sua senha' : 'Nova senha'}
        <div className="relative">
          <input required type={tipo} autoComplete="new-password" minLength={SENHA_MINIMO} value={nova} onChange={(e) => setNova(e.target.value)} className={`${campo} pr-11`} aria-invalid={Boolean(problema)} autoFocus />
          <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
        </div>
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">Confirmar senha
        <input required type={tipo} autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} className={campo} aria-invalid={naoConfere} />
      </label>
      <p className={`text-xs ${problema || naoConfere ? 'text-destructive' : 'text-muted-foreground'}`}>
        {problema ?? (naoConfere ? 'A confirmação não confere.' : `Mínimo de ${SENHA_MINIMO} caracteres, com letras e números, sem o seu nome ou usuário.`)}
      </p>
      <Recado aviso={aviso} />
      <Button type="submit" size="lg" className="h-11" disabled={ocupado || !nova || Boolean(problema) || confirmacao !== nova}>{ocupado && <Loader2 className="size-4 animate-spin" />}{convite ? 'Criar senha e continuar' : 'Salvar nova senha'}</Button>
    </form>
  )
}

// ------------------------------------------------------------------ confirmar e-mail

/**
 * Um botão, e não a confirmação no próprio GET da página: filtros de
 * segurança corporativos abrem todo link de todo e-mail antes da pessoa ver.
 * Se abrir já confirmasse, o robô confirmaria por ela.
 */
export function ConfirmarEmailBotao({ token, email }: { token: string; email: string }) {
  const [aviso, setAviso] = useState<Aviso>(null)
  const [feito, setFeito] = useState(false)
  const [ocupado, rodar] = useTransition()
  function confirmar() {
    setAviso(null)
    rodar(async () => {
      const form = new FormData()
      form.set('t', token)
      const r = await confirmarEmail(form)
      if (r.erro) return setAviso({ tom: 'erro', texto: r.erro })
      setAviso({ tom: 'ok', texto: r.recado ?? 'E-mail confirmado.' })
      setFeito(true)
    })
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-lg bg-muted/50 px-3 py-2 font-mono text-sm">{email}</p>
      <Recado aviso={aviso} />
      {feito
        ? <Button size="lg" className="h-11" render={<Link href="/" />}>Ir para a Redação</Button>
        : <Button size="lg" className="h-11" disabled={ocupado} onClick={confirmar}>{ocupado && <Loader2 className="size-4 animate-spin" />}Confirmar este e-mail</Button>}
    </div>
  )
}

// ------------------------------------------------------------------ e-mail no perfil

export function EmailDaConta({ email, confirmado, pendente, envioConfigurado }: { email: string | null; confirmado: boolean; pendente: string | null; envioConfigurado: boolean }) {
  const router = useRouter()
  const [editando, setEditando] = useState(!email)
  const [valor, setValor] = useState(pendente ?? email ?? '')
  const [aviso, setAviso] = useState<Aviso>(null)
  const [ocupado, rodar] = useTransition()
  const valido = Boolean(emailValido(valor))

  function enviar(event?: React.FormEvent, endereco = valor) {
    event?.preventDefault()
    setAviso(null)
    rodar(async () => {
      const form = new FormData()
      form.set('email', endereco)
      const r = await pedirTrocaDeEmail(form)
      setAviso(r.erro ? { tom: 'erro', texto: r.erro } : { tom: 'ok', texto: r.recado ?? 'Enviado.' })
      if (!r.erro) { setEditando(false); router.refresh() }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${confirmado ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning-foreground'}`}>{confirmado ? <MailCheck className="size-4" /> : <MailWarning className="size-4" />}</span>
        <div className="min-w-0">
          <p className="font-medium break-all">{email ?? 'Nenhum e-mail cadastrado'}{email && <span className={`ml-2 text-xs font-normal ${confirmado ? 'text-success' : 'text-warning-foreground'}`}>{confirmado ? 'confirmado' : 'não confirmado'}</span>}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            É para ele que vão os links de senha e os avisos de segurança da sua conta. {!confirmado && 'Sem um e-mail confirmado, você não consegue usar "Esqueci minha senha".'}
          </p>
          {pendente && pendente !== email && <p className="mt-1 text-sm text-warning-foreground">Aguardando confirmação de {pendente}. Abra o link que enviamos para esse endereço.</p>}
        </div>
      </div>
      <Recado aviso={aviso} />
      {!envioConfigurado && <p className="text-sm text-muted-foreground">O envio de e-mail da Redação ainda não está configurado. Fale com um administrador.</p>}
      {envioConfigurado && (editando ? (
        <form onSubmit={enviar} className="flex flex-col gap-2 sm:flex-row">
          <input type="email" autoComplete="email" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="seu@email.com" className={`${campo} h-10`} />
          <div className="flex gap-2">
            {email && <Button type="button" variant="ghost" size="lg" onClick={() => { setEditando(false); setValor(email) }}>Cancelar</Button>}
            <Button type="submit" size="lg" disabled={!valido || ocupado}>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}Enviar confirmação</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          {email && !confirmado && <Button variant="outline" size="lg" disabled={ocupado} onClick={() => enviar(undefined, email)}>{ocupado && <Loader2 className="size-4 animate-spin" />}Reenviar confirmação</Button>}
          <Button variant="outline" size="lg" onClick={() => setEditando(true)}><Mail className="size-4" />{email ? 'Trocar e-mail' : 'Cadastrar e-mail'}</Button>
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ perdi o celular

export function PedirAjudaBotao() {
  const [aviso, setAviso] = useState<Aviso>(null)
  const [ocupado, rodar] = useTransition()
  function pedir() {
    if (!confirm('Avisar os administradores por e-mail que você perdeu ou trocou de celular? Um deles vai confirmar com você antes de remover a verificação.')) return
    setAviso(null)
    rodar(async () => {
      const r = await pedirAjudaComVerificacao()
      setAviso(r.erro ? { tom: 'erro', texto: r.erro } : { tom: 'ok', texto: r.recado ?? 'Aviso enviado.' })
    })
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <button type="button" onClick={pedir} disabled={ocupado} className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50">
        {ocupado ? 'Avisando…' : 'Perdi ou troquei de celular — avisar os administradores'}
      </button>
      <Recado aviso={aviso} />
    </div>
  )
}
