'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, LockKeyhole, UserRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

const internalEmail = (username: string) => `${username.toLowerCase()}@usuarios.cvrj.local`

export function LoginForm({ needsBootstrap }: { needsBootstrap: boolean }) {
  const router = useRouter()
  const [setup, setSetup] = useState(needsBootstrap)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError('')
    try {
      if (setup) {
        const response = await fetch('/api/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName, username, password }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error)
      }
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: internalEmail(username.trim()), password })
      if (signInError) throw new Error('Usuário ou senha inválidos.')
      router.push('/dashboard'); router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível entrar.')
    } finally { setLoading(false) }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {setup && <div className="rounded-lg border border-primary/25 bg-primary/5 p-4"><p className="text-sm font-semibold">Configuração inicial</p><p className="mt-1 text-sm text-muted-foreground">Crie o primeiro administrador. Nenhum e-mail será enviado.</p></div>}
      {setup && <label className="flex flex-col gap-2 text-sm font-medium">Nome completo<input required minLength={3} value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" placeholder="Nome do administrador" /></label>}
      <label className="flex flex-col gap-2 text-sm font-medium">Usuário<div className="relative"><UserRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><input required autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-3 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" placeholder="nome.sobrenome" /></div></label>
      <label className="flex flex-col gap-2 text-sm font-medium">Senha<div className="relative"><LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><input required minLength={8} autoComplete={setup ? 'new-password' : 'current-password'} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-11 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" placeholder="Mínimo de 8 caracteres"/><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showPassword ? <EyeOff className="size-4"/> : <Eye className="size-4"/>}</button></div></label>
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="h-12" disabled={loading}>{loading && <Loader2 className="size-4 animate-spin"/>}{setup ? 'Criar administrador e entrar' : 'Entrar'}</Button>
      {!needsBootstrap && <p className="text-center text-xs text-muted-foreground">Acesso exclusivo para colaboradores cadastrados.</p>}
    </form>
  )
}
