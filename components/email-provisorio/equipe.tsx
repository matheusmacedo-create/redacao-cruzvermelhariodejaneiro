'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Copy, KeyRound, Loader2, Mail, ShieldCheck, UserMinus, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  criarContaDoEmail, darAcessoAoEmail, definirResponsavelDoEmail, novaSenhaDoEmail, tirarAcessoDoEmail,
} from '@/app/actions/email-provisorio'

export type PessoaDaCaixa = {
  id: string
  nome: string
  usuario: string
  responsavel: boolean
  /** Entra no Palácio: a senha é cuidada lá, não aqui. */
  doPalacio: boolean
  ativa: boolean
  aguardandoPrimeiroAcesso: boolean
}
export type CaixaDaEquipe = { id: string; email: string; setor: string; pessoas: PessoaDaCaixa[] }

type Resultado = { erro?: string; recado?: string; usuario?: string; senhaTemporaria?: string }
const campo = 'rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

/**
 * A equipe de cada caixa no app de e-mail provisório. A senha provisória
 * aparece uma vez, aqui, para quem criou: é ela que a pessoa usa no primeiro
 * acesso, quando escolhe a dela. Nada da senha vai para log ou e-mail.
 */
export function EquipeDasCaixas({ caixas, administra, eu }: { caixas: CaixaDaEquipe[]; administra: boolean; eu: string }) {
  const router = useRouter()
  const [recado, setRecado] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [senha, setSenha] = useState<{ usuario: string; senha: string } | null>(null)
  const [ocupado, rodar] = useTransition()

  const executar = (acao: () => Promise<Resultado>) => rodar(async () => {
    const r = await acao()
    setRecado(r.erro ? { tom: 'erro', texto: r.erro } : r.recado ? { tom: 'ok', texto: r.recado } : null)
    if (r.senhaTemporaria) setSenha({ usuario: r.usuario ?? '', senha: r.senhaTemporaria })
    router.refresh()
  })

  return (
    <div className="flex flex-col gap-4">
      {recado && (
        <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${recado.tom === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-700'}`} role={recado.tom === 'erro' ? 'alert' : 'status'}>
          {recado.tom === 'erro' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}{recado.texto}
        </p>
      )}
      {senha && <SenhaProvisoria usuario={senha.usuario} senha={senha.senha} onFechar={() => setSenha(null)} />}
      {!caixas.length && <p className="text-sm text-muted-foreground">Nenhuma caixa ativa ainda.</p>}
      {caixas.map((c) => <Caixa key={c.id} caixa={c} administra={administra} eu={eu} ocupado={ocupado} executar={executar} />)}
    </div>
  )
}

function SenhaProvisoria({ usuario, senha, onFechar }: { usuario: string; senha: string; onFechar: () => void }) {
  const [copiou, setCopiou] = useState(false)
  const texto = `Endereço: https://email.cruzvermelhariodejaneiro.org\nUsuário: ${usuario}\nSenha provisória: ${senha}\nNo primeiro acesso, você escolhe uma senha só sua.`
  return (
    <Card className="flex flex-col gap-3 border-primary/40 bg-primary/5 p-4" role="status">
      <p className="flex items-center gap-2 font-medium"><KeyRound className="size-4 text-primary" />Passe estes dados à pessoa: a senha não aparece de novo</p>
      <pre className="whitespace-pre-wrap rounded-lg bg-background p-3 font-mono text-sm">{texto}</pre>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(texto).then(() => setCopiou(true)) }}><Copy className="size-4" />{copiou ? 'Copiado' : 'Copiar'}</Button>
        <Button size="sm" variant="ghost" onClick={onFechar}>Já passei, fechar</Button>
      </div>
    </Card>
  )
}

function Caixa({ caixa, administra, eu, ocupado, executar }: {
  caixa: CaixaDaEquipe
  administra: boolean
  eu: string
  ocupado: boolean
  executar: (a: () => Promise<Resultado>) => void
}) {
  const [modo, setModo] = useState<'nada' | 'nova' | 'existente'>('nada')

  function enviar(e: React.FormEvent<HTMLFormElement>, acao: (f: FormData) => Promise<Resultado>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    f.set('caixaId', caixa.id)
    executar(async () => {
      const r = await acao(f)
      if (!r.erro) setModo('nada')
      return r
    })
  }

  return (
    <Card className="flex flex-col gap-3 p-4" data-caixa={caixa.email}>
      <div className="flex flex-wrap items-center gap-2">
        <Mail className="size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{caixa.setor}</p>
          <p className="truncate text-xs text-muted-foreground">{caixa.email}</p>
        </div>
        <Button size="sm" variant={modo === 'nova' ? 'secondary' : 'outline'} disabled={ocupado} onClick={() => setModo(modo === 'nova' ? 'nada' : 'nova')}><UserPlus className="size-4" />Nova pessoa</Button>
        <Button size="sm" variant={modo === 'existente' ? 'secondary' : 'ghost'} disabled={ocupado} onClick={() => setModo(modo === 'existente' ? 'nada' : 'existente')}>Dar acesso a quem já tem conta</Button>
      </div>

      {modo === 'nova' && (
        <form onSubmit={(e) => enviar(e, criarContaDoEmail)} className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-[1fr_14rem_auto]">
          <input name="nome" required minLength={3} maxLength={120} placeholder="Nome completo" aria-label="Nome completo" className={campo} />
          <input name="usuario" maxLength={40} autoCapitalize="none" placeholder="Usuário (vazio: nome.sobrenome)" aria-label="Usuário" className={campo} />
          <Button type="submit" disabled={ocupado}>{ocupado && <Loader2 className="size-4 animate-spin" />}Criar acesso</Button>
          <p className="text-xs text-muted-foreground sm:col-span-3">A conta entra só no e-mail, só nesta caixa. A senha provisória aparece uma vez, para você passar à pessoa.</p>
        </form>
      )}
      {modo === 'existente' && (
        <form onSubmit={(e) => enviar(e, darAcessoAoEmail)} className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/20 p-3">
          <input name="usuario" required maxLength={40} autoCapitalize="none" placeholder="Usuário da pessoa (ex.: nome.sobrenome)" aria-label="Usuário" className={`${campo} min-w-0 flex-1`} />
          <Button type="submit" disabled={ocupado}>{ocupado && <Loader2 className="size-4 animate-spin" />}Dar acesso</Button>
        </form>
      )}

      {caixa.pessoas.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {caixa.pessoas.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {p.nome}
                  {p.responsavel && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Responsável</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {p.usuario}
                  {p.doPalacio ? ' · usa o Palácio' : p.aguardandoPrimeiroAcesso ? ' · ainda não fez o primeiro acesso' : ''}
                  {!p.ativa && <span className="text-destructive"> · conta desativada</span>}
                </p>
              </div>
              {administra && (
                <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => executar(() => definirResponsavelDoEmail(caixa.id, p.id, !p.responsavel))}>
                  <ShieldCheck className="size-4" />{p.responsavel ? 'Tirar de responsável' : 'Tornar responsável'}
                </Button>
              )}
              {!p.doPalacio && p.id !== eu && (
                <Button size="sm" variant="ghost" disabled={ocupado}
                  onClick={() => { if (confirm(`Gerar uma senha provisória nova para ${p.nome}? A senha atual deixa de valer.`)) executar(() => novaSenhaDoEmail(caixa.id, p.id)) }}>
                  <KeyRound className="size-4" />Senha provisória
                </Button>
              )}
              {(administra || !p.responsavel) && (
                <Button size="sm" variant="ghost" className="text-destructive" disabled={ocupado}
                  onClick={() => { if (confirm(`Tirar o acesso de ${p.nome} a ${caixa.email}?`)) executar(() => tirarAcessoDoEmail(caixa.id, p.id)) }}>
                  <UserMinus className="size-4" />Tirar acesso
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Ninguém tem acesso por aqui ainda{administra ? ' — dê acesso a alguém do setor e faça essa pessoa responsável.' : '.'}
          {' '}Quem é do setor no Palácio já vê a caixa.
        </p>
      )}
    </Card>
  )
}
