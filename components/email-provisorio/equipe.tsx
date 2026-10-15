'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Copy, KeyRound, Loader2, Mail, ShieldCheck, UserMinus, UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ENDERECO_DO_EMAIL } from '@/lib/dominio'
import {
  criarContaDoEmail, darAcessoAoEmail, definirResponsavelDoEmail, liberarSetorDoEmail, novaSenhaDoEmail, tirarAcessoDoEmail,
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

/** Uma linha do resultado de "Liberar o setor de uma vez": criada (usuário e senha) ou com erro. */
export type ContaCriada = { nome: string; usuario?: string; senha?: string; erro?: string }

type Resultado = { erro?: string; recado?: string; nome?: string; usuario?: string; senhaTemporaria?: string; criadas?: ContaCriada[] }
const campo = 'rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

/**
 * A equipe de cada caixa no app de e-mail. A senha provisória aparece uma
 * vez, aqui, para quem criou: é ela que a pessoa usa no primeiro acesso,
 * quando escolhe a dela. Nada da senha vai para log ou e-mail. "Liberar o
 * setor de uma vez" cria várias contas de uma lista de nomes e mostra o
 * quadro de cada pessoa, com "Copiar" por pessoa, para mandar no WhatsApp.
 */
export function EquipeDasCaixas({ caixas, administra, eu }: { caixas: CaixaDaEquipe[]; administra: boolean; eu: string }) {
  const router = useRouter()
  const [recado, setRecado] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [senhas, setSenhas] = useState<{ caixa: string; pessoas: ContaCriada[] } | null>(null)
  const [ocupado, rodar] = useTransition()

  const executar = (acao: () => Promise<Resultado>, caixa: string) => rodar(async () => {
    const r = await acao()
    setRecado(r.erro ? { tom: 'erro', texto: r.erro } : r.recado ? { tom: 'ok', texto: r.recado } : null)
    if (r.senhaTemporaria) setSenhas({ caixa, pessoas: [{ nome: r.nome ?? '', usuario: r.usuario ?? '', senha: r.senhaTemporaria }] })
    else if (r.criadas) setSenhas({ caixa, pessoas: r.criadas })
    router.refresh()
  })

  return (
    <div className="flex flex-col gap-4">
      {recado && (
        <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${recado.tom === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-700'}`} role={recado.tom === 'erro' ? 'alert' : 'status'}>
          {recado.tom === 'erro' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}{recado.texto}
        </p>
      )}
      {senhas && <SenhasProvisorias caixa={senhas.caixa} pessoas={senhas.pessoas} onFechar={() => setSenhas(null)} />}
      {!caixas.length && <p className="text-sm text-muted-foreground">Nenhuma caixa ativa ainda.</p>}
      {caixas.map((c) => <Caixa key={c.id} caixa={c} administra={administra} eu={eu} ocupado={ocupado} executar={executar} />)}
    </div>
  )
}

/** O recado pronto para mandar à pessoa (WhatsApp, impresso): endereço, usuário e senha provisória. */
function recadoDaPessoa(caixa: string, p: ContaCriada): string {
  return [
    caixa ? `E-mail do setor: ${caixa}` : null,
    `Endereço: ${ENDERECO_DO_EMAIL}`,
    `Usuário: ${p.usuario}`,
    `Senha provisória: ${p.senha}`,
    'No primeiro acesso, você escolhe uma senha só sua.',
  ].filter(Boolean).join('\n')
}

function BotaoCopiar({ texto, rotulo = 'Copiar' }: { texto: string; rotulo?: string }) {
  const [copiou, setCopiou] = useState(false)
  return (
    <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(texto).then(() => setCopiou(true)) }}>
      <Copy className="size-4" />{copiou ? 'Copiado' : rotulo}
    </Button>
  )
}

/**
 * O quadro das senhas provisórias: uma pessoa ou a lista inteira do setor.
 * Cada pessoa tem o próprio "Copiar", para o recado ir um a um no WhatsApp;
 * "Copiar todos" junta tudo, separado por linha em branco. Fechar apaga: a
 * senha não aparece de novo.
 */
function SenhasProvisorias({ caixa, pessoas, onFechar }: { caixa: string; pessoas: ContaCriada[]; onFechar: () => void }) {
  const criadas = pessoas.filter((p) => p.usuario && p.senha)
  const comErro = pessoas.filter((p) => p.erro)
  const tudo = criadas.map((p) => `${p.nome ? `${p.nome}\n` : ''}${recadoDaPessoa(caixa, p)}`).join('\n\n')
  return (
    <Card className="flex flex-col gap-3 border-primary/40 bg-primary/5 p-4" role="status">
      <p className="flex items-center gap-2 font-medium">
        <KeyRound className="size-4 text-primary" />
        {criadas.length === 1 && !comErro.length ? 'Passe estes dados à pessoa: a senha não aparece de novo' : 'Passe a cada pessoa os dados dela: as senhas não aparecem de novo'}
      </p>
      {criadas.length > 0 && (
        <ul className="flex flex-col gap-2">
          {criadas.map((p) => (
            <li key={p.usuario} className="flex flex-col gap-2 rounded-lg bg-background p-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                {p.nome && <p className="text-sm font-medium">{p.nome}</p>}
                <pre className="whitespace-pre-wrap font-mono text-sm">{recadoDaPessoa(caixa, p)}</pre>
              </div>
              <BotaoCopiar texto={recadoDaPessoa(caixa, p)} />
            </li>
          ))}
        </ul>
      )}
      {comErro.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Linhas com problema">
          {comErro.map((p, i) => (
            <li key={`${p.nome}-${i}`} className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /><span><span className="font-medium">{p.nome}</span>: {p.erro}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {criadas.length > 1 && <BotaoCopiar texto={tudo} rotulo="Copiar todos" />}
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
  executar: (a: () => Promise<Resultado>, caixa: string) => void
}) {
  const [modo, setModo] = useState<'nada' | 'nova' | 'existente' | 'lote'>('nada')
  const alternar = (m: typeof modo) => setModo(modo === m ? 'nada' : m)

  function enviar(e: React.FormEvent<HTMLFormElement>, acao: (f: FormData) => Promise<Resultado>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    f.set('caixaId', caixa.id)
    executar(async () => {
      const r = await acao(f)
      if (!r.erro) setModo('nada')
      return r
    }, caixa.email)
  }

  return (
    <Card className="flex flex-col gap-3 p-4" data-caixa={caixa.email}>
      <div className="flex flex-wrap items-center gap-2">
        <Mail className="size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{caixa.setor}</p>
          <p className="truncate text-xs text-muted-foreground">{caixa.email}</p>
        </div>
        <Button size="sm" variant={modo === 'lote' ? 'secondary' : 'default'} disabled={ocupado} onClick={() => alternar('lote')}><Users className="size-4" />Liberar o setor de uma vez</Button>
        <Button size="sm" variant={modo === 'nova' ? 'secondary' : 'outline'} disabled={ocupado} onClick={() => alternar('nova')}><UserPlus className="size-4" />Nova pessoa</Button>
        <Button size="sm" variant={modo === 'existente' ? 'secondary' : 'ghost'} disabled={ocupado} onClick={() => alternar('existente')}>Dar acesso a quem já tem conta</Button>
      </div>

      {modo === 'lote' && (
        <form onSubmit={(e) => enviar(e, liberarSetorDoEmail)} className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3">
          <label htmlFor={`pessoas-${caixa.id}`} className="text-sm font-medium">Um nome completo por linha</label>
          <textarea id={`pessoas-${caixa.id}`} name="pessoas" required rows={6} autoCapitalize="words" spellCheck={false}
            placeholder={'Maria da Silva\nJoão Pereira; joao.p'} className={`${campo} font-mono`} />
          <p className="text-xs text-muted-foreground">
            O usuário sai do nome (Maria da Silva vira maria.silva). Para escolher outro, escreva depois de ponto e vírgula. Cada pessoa recebe a própria senha provisória, que aparece uma vez, para você passar. Até 30 por vez.
          </p>
          {administra && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="primeiraResponsavel" value="1" className="size-4 accent-primary" />
              A primeira pessoa da lista fica responsável pela caixa (dá e tira acesso, gera senha provisória)
            </label>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={ocupado}>{ocupado && <Loader2 className="size-4 animate-spin" />}Criar os acessos</Button>
          </div>
        </form>
      )}
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
                <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => executar(() => definirResponsavelDoEmail(caixa.id, p.id, !p.responsavel), caixa.email)}>
                  <ShieldCheck className="size-4" />{p.responsavel ? 'Tirar de responsável' : 'Tornar responsável'}
                </Button>
              )}
              {!p.doPalacio && p.id !== eu && (
                <Button size="sm" variant="ghost" disabled={ocupado}
                  onClick={() => { if (confirm(`Gerar uma senha provisória nova para ${p.nome}? A senha atual deixa de valer.`)) executar(() => novaSenhaDoEmail(caixa.id, p.id), caixa.email) }}>
                  <KeyRound className="size-4" />Senha provisória
                </Button>
              )}
              {(administra || !p.responsavel) && (
                <Button size="sm" variant="ghost" className="text-destructive" disabled={ocupado}
                  onClick={() => { if (confirm(`Tirar o acesso de ${p.nome} a ${caixa.email}?`)) executar(() => tirarAcessoDoEmail(caixa.id, p.id), caixa.email) }}>
                  <UserMinus className="size-4" />Tirar acesso
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Ninguém tem acesso por aqui ainda{administra ? ' — use “Liberar o setor de uma vez” com a lista da equipe e marque a primeira pessoa como responsável.' : '.'}
          {' '}Quem é do setor no Palácio já vê a caixa.
        </p>
      )}
    </Card>
  )
}
