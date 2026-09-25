'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, LockKeyhole, UserRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { resolverLogin } from '@/app/actions/contas'
import { concluirEntrada, prepararEntrada } from '@/app/actions/entrada'
import { impressaoDoNavegador, type Impressao } from './impressao'

const internalEmail = (username: string) => `${username.toLowerCase()}@usuarios.cvrj.local`

export function LoginForm({ needsBootstrap, aviso }: { needsBootstrap: boolean; aviso?: string }) {
  const router = useRouter()
  const [setup, setSetup] = useState(needsBootstrap)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // A impressão do aparelho começa a ser colhida quando a tela abre, para
  // estar pronta no clique (docs/registro-de-acessos.md §3).
  const impressao = useRef<Promise<Impressao | null> | null>(null)
  useEffect(() => { impressao.current = impressaoDoNavegador() }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError('')
    try {
      if (setup) {
        const response = await fetch('/api/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName, username, password }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error)
      }
      const supabase = createClient()
      // Usuário vai direto; e-mail é traduzido no servidor para o usuário da
      // conta (e, se não existir, para um endereço que só falha igual à senha errada).
      const identificador = username.trim()
      let email = internalEmail(identificador)
      if (!setup) {
        // Antes da senha: o bloqueio por tentativas erradas. Se a conferência
        // falhar por qualquer motivo, a entrada segue como era antes.
        let bloqueado: string | undefined
        try {
          const preparo = await Promise.race([
            prepararEntrada(identificador),
            new Promise<never>((_, recusar) => setTimeout(() => recusar(new Error('lento')), 6000)),
          ])
          email = preparo.email
          bloqueado = preparo.bloqueado
        } catch {
          if (identificador.includes('@')) email = await resolverLogin(identificador)
        }
        if (bloqueado) throw new Error(bloqueado)
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (!setup) await registrarResultado(identificador, !signInError, signInError?.code === 'user_banned' ? 'Conta desativada' : 'Senha errada')
      if (signInError) throw new Error(signInError.code === 'user_banned' ? 'Esta conta está desativada. Fale com um administrador.' : 'Usuário ou senha inválidos.')
      router.push('/dashboard'); router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível entrar.')
    } finally { setLoading(false) }
  }

  /** Registra o resultado sem nunca segurar a entrada por mais de 4 segundos. */
  async function registrarResultado(identificador: string, ok: boolean, motivo: string) {
    try {
      const sinais = await (impressao.current ?? Promise.resolve(null))
      await Promise.race([
        concluirEntrada(identificador, ok, motivo, JSON.stringify(sinais ?? {})),
        new Promise((resolver) => setTimeout(resolver, 4000)),
      ])
    } catch { /* o registro nunca impede a entrada */ }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {setup && <div className="rounded-lg border border-primary/25 bg-primary/5 p-4"><p className="text-sm font-semibold">Configuração inicial</p><p className="mt-1 text-sm text-muted-foreground">Crie o primeiro administrador. Nenhum e-mail será enviado.</p></div>}
      {setup && <label className="flex flex-col gap-2 text-sm font-medium">Nome completo<input required minLength={3} value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" placeholder="Nome do administrador" /></label>}
      {aviso && !setup && <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{aviso}</p>}
      <label className="flex flex-col gap-2 text-sm font-medium">{setup ? 'Usuário' : 'Usuário ou e-mail'}<div className="relative"><UserRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><input required autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-3 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" placeholder={setup ? 'nome.sobrenome' : 'nome.sobrenome ou seu@email.com'} /></div></label>
      <label className="flex flex-col gap-2 text-sm font-medium">Senha<div className="relative"><LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><input required minLength={8} autoComplete={setup ? 'new-password' : 'current-password'} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-11 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" placeholder="Mínimo de 8 caracteres"/><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showPassword ? <EyeOff className="size-4"/> : <Eye className="size-4"/>}</button></div></label>
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="h-12" disabled={loading}>{loading && <Loader2 className="size-4 animate-spin"/>}{setup ? 'Criar administrador e entrar' : 'Entrar'}</Button>
      {!needsBootstrap && <div className="flex flex-col items-center gap-2 text-center text-xs text-muted-foreground"><Link href="/esqueci-senha" className="text-sm text-primary underline-offset-4 hover:underline">Esqueci minha senha</Link><p>Acesso exclusivo para colaboradores cadastrados.</p><p className="max-w-xs text-[11px] leading-snug">Por segurança, registramos data, local aproximado e dados do aparelho de cada acesso.</p></div>}
    </form>
  )
}
