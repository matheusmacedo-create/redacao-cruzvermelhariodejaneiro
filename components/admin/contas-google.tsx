'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Ban, CheckCircle2, Copy, Link2, Loader2, Unlink, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { criarConviteGoogle, desconectarGoogleAdmin, revogarConviteGoogle } from '@/app/actions/google-contas'
import { VALIDADE_MAXIMA_DIAS, VALIDADE_PADRAO_DIAS } from '@/lib/google/contas-regras'

export type ConexaoDeAdminNaTela = { email: string; estado: 'ativa' | 'expirada'; conectadaEm: string } | null
export type ConviteNaTela = { id: string; rotulo: string; setor: string | null; expiraEm: string; usos: number; maxUsos: number; criadoPor: string; vencido: boolean }
export type ContaGoogleNaTela = { id: string; nome: string; email: string; setor: string | null; grupo: string | null; grupoOk: boolean; quando: string }

type Resultado = { erro?: string; recado?: string; link?: string }
const campo = 'rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

/**
 * 5. Criar e-mails pelo link: a conta de administrador do Google que cria
 * usuários (conexão separada da do Gmail), os links para a equipe criar a
 * própria conta e quem já criou. O link aparece uma vez, para quem gerou:
 * no banco fica só o hash.
 */
export function ContasDoGoogle({ conexao, clienteConfigurado, setores, convites, contas, aviso }: {
  conexao: ConexaoDeAdminNaTela
  clienteConfigurado: boolean
  setores: { id: string; nome: string }[]
  convites: ConviteNaTela[]
  contas: ContaGoogleNaTela[]
  aviso: { tom: 'ok' | 'erro'; texto: string } | null
}) {
  const router = useRouter()
  const [recado, setRecado] = useState(aviso)
  const [link, setLink] = useState<string | null>(null)
  const [copiou, setCopiou] = useState(false)
  const [ocupado, rodar] = useTransition()

  const executar = (acao: () => Promise<Resultado>) => rodar(async () => {
    const r = await acao()
    setRecado(r.erro ? { tom: 'erro', texto: r.erro } : r.recado ? { tom: 'ok', texto: r.recado } : null)
    if (r.link) { setLink(r.link); setCopiou(false) }
    router.refresh()
  })

  function gerar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    executar(() => criarConviteGoogle(f))
  }

  const conectada = conexao?.estado === 'ativa'
  return (
    <Card className="flex flex-col gap-4 p-5" id="contas-google" data-ajuda="configuracoes.contas-google">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">5. Criar e-mails pelo link</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {!clienteConfigurado
              ? 'Primeiro, o cliente OAuth do Google em Integrações (o mesmo do passo 1).'
              : !conexao
                ? 'Conecte uma conta de superadministrador do Google Workspace: é ela que cria as contas das pessoas e as põe no grupo do setor. É outra conexão, separada da do passo 1.'
                : conexao.estado === 'expirada'
                  ? `A autorização de ${conexao.email} expirou ou foi revogada. Reconecte para os links voltarem a funcionar.`
                  : `Administrador conectado: ${conexao.email} (desde ${quando.format(new Date(conexao.conectadaEm))}).`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {clienteConfigurado && (
            <Button render={<a href="/api/google/conectar-admin" />} variant={conectada ? 'outline' : 'default'}>
              <Link2 className="size-4" />{conexao ? 'Reconectar' : 'Conectar conta de administrador'}
            </Button>
          )}
          {conexao && (
            <Button variant="ghost" className="text-destructive" disabled={ocupado}
              onClick={() => { if (confirm('Desconectar a conta de administrador? Os links param de funcionar até reconectar.')) executar(desconectarGoogleAdmin) }}>
              <Unlink className="size-4" />Desconectar
            </Button>
          )}
        </div>
      </div>

      {recado && (
        <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${recado.tom === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-700'}`} role={recado.tom === 'erro' ? 'alert' : 'status'}>
          {recado.tom === 'erro' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}{recado.texto}
        </p>
      )}

      {link && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4" role="status">
          <p className="text-sm font-medium">Mande este link para a equipe. Ele não aparece de novo.</p>
          <p className="mt-2 break-all rounded-lg bg-background p-3 font-mono text-sm">{link}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(link).then(() => setCopiou(true)) }}><Copy className="size-4" />{copiou ? 'Copiado' : 'Copiar link'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setLink(null)}>Já mandei, fechar</Button>
          </div>
        </div>
      )}

      {conectada && (
        <form onSubmit={gerar} className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-[1fr_8rem_8rem_1fr_auto]">
          <select name="setorId" defaultValue="" aria-label="Setor" className={campo}>
            <option value="">Qualquer setor (a pessoa escolhe)</option>
            {setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <input name="dias" type="number" min={1} max={VALIDADE_MAXIMA_DIAS} defaultValue={VALIDADE_PADRAO_DIAS} aria-label="Validade em dias" title="Validade em dias" className={campo} />
          <input name="maxUsos" type="number" min={1} max={500} defaultValue={30} aria-label="Quantas pessoas" title="Quantas pessoas podem usar" className={campo} />
          <input name="rotulo" maxLength={80} placeholder="Para lembrar: ex. equipe da Juventude" aria-label="Rótulo" className={campo} />
          <Button type="submit" disabled={ocupado}>{ocupado ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}Gerar link</Button>
          <p className="text-xs text-muted-foreground sm:col-span-5">
            Quem abre o link preenche nome, e-mail desejado, setor, celular e e-mail pessoal; a conta nasce no Google na hora, com senha provisória que o Google obriga a trocar. Validade em dias e quantas pessoas podem usar.
          </p>
        </form>
      )}

      {convites.length > 0 && (
        <div>
          <p className="text-sm font-medium">Links</p>
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {convites.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.rotulo || (c.setor ? `Setor ${c.setor}` : 'Qualquer setor')}{c.rotulo && c.setor ? <span className="font-normal text-muted-foreground"> · {c.setor}</span> : ''}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.vencido ? 'Venceu em' : 'Vale até'} {quando.format(new Date(c.expiraEm))} · {c.usos} de {c.maxUsos} usados · gerado por {c.criadoPor}
                  </p>
                </div>
                {!c.vencido && (
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={ocupado}
                    onClick={() => { if (confirm('Cancelar este link? Quem abrir depois não consegue criar conta por ele.')) executar(() => revogarConviteGoogle(c.id)) }}>
                    <Ban className="size-4" />Cancelar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-sm font-medium">Contas criadas pelo link</p>
        {contas.length ? (
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {contas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.nome} <span className="font-normal text-muted-foreground">· {c.email}</span></p>
                  <p className="text-xs text-muted-foreground">
                    {quando.format(new Date(c.quando))}{c.setor ? ` · ${c.setor}` : ''}
                    {c.grupo ? (c.grupoOk ? ` · no grupo ${c.grupo}` : ` · fora de ${c.grupo}: o endereço ainda é apelido, não grupo`) : ''}
                  </p>
                </div>
                {c.grupo && !c.grupoOk && <AlertTriangle className="size-4 text-warning-foreground" aria-label="Fora do grupo do setor" />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Ninguém criou conta pelo link ainda.</p>
        )}
      </div>
    </Card>
  )
}
