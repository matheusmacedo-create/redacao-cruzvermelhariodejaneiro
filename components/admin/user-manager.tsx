'use client'

import { useState } from 'react'
import { Loader2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function UserManager({ members }: { members: any[] }) {
  const [open,setOpen]=useState(false); const [loading,setLoading]=useState(false); const [message,setMessage]=useState('')
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage(''); const form=new FormData(event.currentTarget)
    const response=await fetch('/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(form))}); const result=await response.json(); setLoading(false)
    if (!response.ok) return setMessage(result.error)
    setMessage('Colaborador criado com sucesso.'); event.currentTarget.reset(); window.location.reload()
  }
  const input='h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
  return <section className="rounded-xl border border-border bg-card"><div className="flex items-center justify-between border-b border-border p-5"><div><h2 className="font-semibold">Equipe deste espaço</h2><p className="mt-1 text-sm text-muted-foreground">Acesso por usuário e senha, sem configuração de e-mail.</p></div><Button onClick={()=>setOpen((value)=>!value)}><UserPlus className="size-4"/>Adicionar</Button></div>{open && <form onSubmit={submit} className="grid gap-3 border-b border-border bg-muted/30 p-5 md:grid-cols-2"><input required name="fullName" className={input} placeholder="Nome completo"/><input required name="username" pattern="[a-z0-9._-]{3,40}" className={input} placeholder="usuario.sobrenome"/><input required name="password" type="password" minLength={8} className={input} placeholder="Senha inicial"/><input name="jobTitle" className={input} placeholder="Função"/><input name="coordination" className={input} placeholder="Coordenação"/><select required name="role" defaultValue="colaborador" className={input}><option value="admin">Admin</option><option value="editor">Editor</option><option value="colaborador">Colaborador</option></select><div className="flex items-center gap-3 md:col-span-2"><Button type="submit" disabled={loading}>{loading && <Loader2 className="size-4 animate-spin"/>}Criar acesso</Button>{message && <p className="text-sm text-muted-foreground">{message}</p>}</div></form>}<ul>{members.map((member)=><li key={member.user_id} className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 last:border-0"><div><p className="text-sm font-medium">{member.profiles?.full_name}</p><p className="text-xs text-muted-foreground">@{member.profiles?.username} · {member.coordination || 'Sem coordenação'}</p></div><span className="rounded-md bg-muted px-2 py-1 text-xs font-medium capitalize">{member.role}</span></li>)}</ul></section>
}
