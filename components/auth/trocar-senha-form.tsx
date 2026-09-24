'use client'

import { useState, useTransition } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trocarMinhaSenha } from '@/app/actions/usuarios'
import { problemaDaSenha, SENHA_MINIMO } from '@/lib/usuarios/senha'

const campo = 'h-10 w-full rounded-lg border border-border bg-background px-3 pr-10 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

/**
 * Troca da própria senha. O aviso da política aparece enquanto se digita
 * (mesma regra de lib/usuarios/senha.ts), mas quem recusa de verdade é a action.
 */
export function TrocarSenhaForm({ origem, usuario, nome }: { origem: 'perfil' | 'obrigatoria'; usuario: string; nome: string }) {
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [ver, setVer] = useState(false)
  const [erro, setErro] = useState('')
  const [ocupado, rodar] = useTransition()

  const problema = nova ? problemaDaSenha(nova, { usuario, nome }) : null
  const naoConfere = confirmacao.length > 0 && confirmacao !== nova
  const pronto = atual && nova && !problema && confirmacao === nova

  function enviar(event: React.FormEvent) {
    event.preventDefault()
    setErro('')
    rodar(async () => {
      const form = new FormData()
      form.set('origem', origem)
      form.set('senhaAtual', atual)
      form.set('novaSenha', nova)
      form.set('confirmacao', confirmacao)
      const r = await trocarMinhaSenha(form)
      if (r?.erro) setErro(r.erro)
    })
  }

  const tipo = ver ? 'text' : 'password'
  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium">{origem === 'obrigatoria' ? 'Senha temporária (a que você acabou de usar)' : 'Senha atual'}
        <div className="relative"><input required type={tipo} autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} className={campo} />
          <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar senhas' : 'Mostrar senhas'} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
        </div>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">Nova senha
          <input required type={tipo} autoComplete="new-password" minLength={SENHA_MINIMO} value={nova} onChange={(e) => setNova(e.target.value)} className={campo} aria-invalid={Boolean(problema)} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Confirmar nova senha
          <input required type={tipo} autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} className={campo} aria-invalid={naoConfere} />
        </label>
      </div>
      <p className={`text-xs ${problema || naoConfere ? 'text-destructive' : 'text-muted-foreground'}`}>
        {problema ?? (naoConfere ? 'A confirmação não confere.' : `Mínimo de ${SENHA_MINIMO} caracteres, com letras e números, sem o seu nome ou usuário. Ao trocar, as outras sessões abertas são encerradas.`)}
      </p>
      {erro && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
      <div className="flex justify-end">
        <Button type="submit" size="lg" variant={origem === 'perfil' ? 'outline' : 'default'} disabled={!pronto || ocupado}>{ocupado && <Loader2 className="size-4 animate-spin" />}Trocar senha</Button>
      </div>
    </form>
  )
}
