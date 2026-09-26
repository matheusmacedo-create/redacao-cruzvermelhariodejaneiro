'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, ShieldCheck, ShieldOff, Smartphone, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { registrarMudancaNaVerificacao } from '@/app/actions/verificacao'
import { CadastroDoApp } from './verificacao'

const data = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' })

export function VerificacaoNoPerfil({ fatores, obrigatoria }: { fatores: { id: string; nome: string; criadoEm: string }[]; obrigatoria: boolean }) {
  const router = useRouter()
  const [cadastrando, setCadastrando] = useState(false)
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [ocupado, rodar] = useTransition()
  const ativa = fatores.length > 0

  function remover(fator: { id: string; nome: string }) {
    if (obrigatoria && fatores.length === 1) {
      return setAviso({ tom: 'erro', texto: 'Para o seu papel a verificação é obrigatória. Cadastre outro aparelho antes de remover este.' })
    }
    const ultimo = fatores.length === 1
    if (!confirm(ultimo ? `Remover "${fator.nome}"? A verificação em duas etapas será desligada e você passa a entrar só com a senha.` : `Remover "${fator.nome}"? Ele deixa de gerar códigos válidos.`)) return
    setAviso(null)
    rodar(async () => {
      const { error } = await createClient().auth.mfa.unenroll({ factorId: fator.id })
      if (error) return setAviso({ tom: 'erro', texto: 'Não foi possível remover o aparelho. Saia e entre de novo com o código, e tente outra vez.' })
      await registrarMudancaNaVerificacao('removida')
      setAviso({ tom: 'ok', texto: ultimo ? 'Verificação em duas etapas desligada.' : `"${fator.nome}" removido.` })
      router.refresh()
    })
  }

  function concluido() {
    setCadastrando(false)
    setAviso({ tom: 'ok', texto: 'Verificação em duas etapas ativada. No próximo login, o Palácio Virtual vai pedir o código do app.' })
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${ativa ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>{ativa ? <ShieldCheck className="size-4" /> : <ShieldOff className="size-4" />}</span>
        <div>
          <p className="font-medium">Verificação em duas etapas {ativa ? 'ativada' : 'desligada'}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {ativa
              ? 'Além da senha, o login pede o código de 6 dígitos do app autenticador no seu celular.'
              : 'Proteja sua conta: além da senha, o login passa a pedir um código que muda a cada 30 segundos no seu celular. Quem descobrir sua senha não entra sem ele.'}
            {obrigatoria && ' Para o seu papel, ela é obrigatória.'}
          </p>
        </div>
      </div>

      {ativa && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {fatores.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="flex items-center gap-2"><Smartphone className="size-4 text-muted-foreground" />{f.nome}<span className="text-xs text-muted-foreground">· desde {data.format(new Date(f.criadoEm))}</span></span>
              <Button variant="ghost" size="sm" className="text-destructive" disabled={ocupado} onClick={() => remover(f)}><Trash2 className="size-3.5" />Remover</Button>
            </li>
          ))}
        </ul>
      )}

      {aviso && <p role={aviso.tom === 'erro' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-sm ${aviso.tom === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>{aviso.texto}</p>}

      {cadastrando
        ? <div className="rounded-lg border border-border p-4"><CadastroDoApp nomesEmUso={fatores.map((f) => f.nome)} aoConcluir={concluido} cancelar={() => setCadastrando(false)} /></div>
        : (
          <div className="flex justify-end">
            <Button variant={ativa ? 'outline' : 'default'} size="lg" disabled={ocupado} onClick={() => { setAviso(null); setCadastrando(true) }}>
              {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{ativa ? 'Adicionar outro aparelho' : 'Ativar verificação em duas etapas'}
            </Button>
          </div>
        )}
      {ativa && fatores.length === 1 && <p className="text-xs text-muted-foreground">Dica: cadastre um segundo aparelho (um tablet, ou o app num gerenciador de senhas). Se perder o celular, você continua entrando pelo outro.</p>}
    </div>
  )
}
