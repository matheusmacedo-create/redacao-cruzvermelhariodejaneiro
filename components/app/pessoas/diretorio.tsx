'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Copy, LayoutGrid, Mail, MessageCircle, Phone, Rows3, Search, ShieldAlert, UserPlus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { privateAvatarUrl } from '@/lib/avatar-url'
import { cn } from '@/lib/utils'
import { PAPEL, ehPapel } from '@/lib/permissoes'
import { ACESSOS, filtrar, iniciaisDe, nomeExibido, pendencias, porSetor, whatsapp, type Acesso, type PessoaDoDiretorio } from '@/lib/pessoas/diretorio'

export type SetorNoDiretorio = { nome: string; descricao: string | null; responsavel: string | null; email: string | null }

const quando = (t: string) => new Date(t).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short' })

function Contato({ href, icone: Icone, rotulo, externo }: { href: string; icone: typeof Mail; rotulo: string; externo?: boolean }) {
  return (
    <a href={href} target={externo ? '_blank' : undefined} rel={externo ? 'noreferrer' : undefined} title={rotulo} aria-label={rotulo}
      className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-primary/40 hover:text-primary">
      <Icone className="size-4" />
    </a>
  )
}

function CartaoDaPessoa({ p, ehAdmin }: { p: PessoaDoDiretorio; ehAdmin: boolean }) {
  const [copiado, setCopiado] = useState(false)
  const nome = nomeExibido(p.nome)
  const falta = ehAdmin && p.origem === 'conta' ? pendencias(p) : []
  const zap = whatsapp(p.telefone)
  const acesso = ACESSOS[p.acesso]
  return (
    <Card className={cn('flex flex-col gap-3 p-4', p.acesso === 'desativado' && 'opacity-60')} data-pessoa={nome}>
      <div className="flex items-start gap-3">
        {p.user_id
          ? <Link href={`/pessoas/${p.user_id}`} aria-label={`Perfil de ${nome}`} className="rounded-full focus-visible:ring-2 focus-visible:ring-ring"><Avatar initials={p.iniciais || iniciaisDe(p.nome)} color={p.cor ?? '#9ca3af'} src={privateAvatarUrl(p.avatar_path)} alt={nome} size="lg" /></Link>
          : <Avatar initials={p.iniciais || iniciaisDe(p.nome)} color={p.cor ?? '#9ca3af'} src={privateAvatarUrl(p.avatar_path)} alt={nome} size="lg" />}
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{p.user_id ? <Link href={`/pessoas/${p.user_id}`} className="hover:text-primary hover:underline">{nome}</Link> : nome}</h3>
          <p className={cn('truncate text-sm', p.cargo ? 'text-muted-foreground' : 'italic text-muted-foreground/70')}>{p.cargo || 'Cargo não informado'}</p>
          {p.gestor && <p className="truncate text-xs text-muted-foreground">Responde a {nomeExibido(p.gestor)}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
        {p.setor ? <span className="rounded-md bg-primary/10 px-2 py-0.5 text-primary">{p.setor}</span> : <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">Sem setor</span>}
        {p.papel && ehPapel(p.papel) && p.acesso !== 'desativado' && (
          <span className={cn('rounded-md border px-2 py-0.5', p.papel === 'admin' ? 'border-primary/40 text-primary' : 'border-border text-muted-foreground')} title={PAPEL[p.papel].descricao}>{PAPEL[p.papel].rotulo}</span>
        )}
        {p.acesso !== 'ativo' && <span className={cn('rounded-md px-2 py-0.5', acesso.classe)} title={acesso.ajuda}>{acesso.rotulo}</span>}
      </div>
      {(p.email || p.telefone) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {p.email && <Contato href={`mailto:${p.email}`} icone={Mail} rotulo={`E-mail: ${p.email}`} />}
          {p.email && (
            <button type="button" title="Copiar e-mail" aria-label="Copiar e-mail" onClick={async () => { try { await navigator.clipboard.writeText(p.email!); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch { /* sem permissão */ } }}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary">
              <Copy className="size-3.5" />{copiado ? 'Copiado' : <span className="max-w-40 truncate">{p.email}</span>}
            </button>
          )}
          {p.telefone && <Contato href={`tel:${p.telefone.replace(/[^\d+]/g, '')}`} icone={Phone} rotulo={`Telefone: ${p.telefone}`} />}
          {zap && <Contato href={zap} icone={MessageCircle} rotulo="WhatsApp" externo />}
        </div>
      )}
      {ehAdmin && p.fichaSolta && <Link href={`/equipe/${p.fichaSolta}/editar`} className="text-xs text-warning-foreground hover:underline">A ficha da Equipe desta pessoa não está ligada ao login — ligar</Link>}
      {ehAdmin && (falta.length > 0 || p.acesso === 'sem_acesso' || p.visto_em) && (
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs">
          {falta.length > 0 ? <span className="text-warning-foreground">Falta: {falta.join(', ')}</span> : p.visto_em ? <span className="text-muted-foreground">Visto em {quando(p.visto_em)}</span> : <span />}
          {p.acesso === 'sem_acesso'
            ? <Link href={`/pessoas/adicionar?nome=${encodeURIComponent(p.nome)}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><UserPlus className="size-3.5" />Dar acesso</Link>
            : falta.length > 0 && <Link href="/usuarios" className="font-medium text-primary hover:underline">Completar</Link>}
        </div>
      )}
    </Card>
  )
}

const FILTROS_DE_ACESSO: { valor: Acesso | 'todos'; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Todos' }, { valor: 'ativo', rotulo: 'Com acesso' }, { valor: 'convite', rotulo: 'Convite pendente' }, { valor: 'sem_acesso', rotulo: 'Sem acesso' },
]

export function Diretorio({ pessoas, setores, ehAdmin, alertaDeAdmins }: {
  pessoas: PessoaDoDiretorio[]; setores: SetorNoDiretorio[]; ehAdmin: boolean; alertaDeAdmins: { admins: number; contas: number } | null
}) {
  const [q, setQ] = useState('')
  const [setor, setSetor] = useState('')
  const [acesso, setAcesso] = useState<Acesso | 'todos'>('todos')
  const [vista, setVista] = useState<'cartoes' | 'setores'>('cartoes')
  const visiveis = useMemo(() => pessoas.filter((p) => p.acesso !== 'desativado' || ehAdmin), [pessoas, ehAdmin])
  const lista = useMemo(() => filtrar(visiveis, { q, setor, acesso }), [visiveis, q, setor, acesso])
  const nomes = setores.map((s) => s.nome)
  const contagem = (s: string) => visiveis.filter((p) => p.setor === s).length
  const grupos = useMemo(() => porSetor(lista, nomes), [lista, nomes])
  const infoDoSetor = new Map(setores.map((s) => [s.nome, s]))

  return (
    <div className="flex flex-col gap-5" id="diretorio">
      {alertaDeAdmins && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/50 bg-warning/10 px-4 py-3 text-sm" role="status" id="alerta-admins">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
          <p><strong>{alertaDeAdmins.admins} de {alertaDeAdmins.contas} contas são administradoras.</strong> Admin cria contas, muda papéis e vê tudo do espaço — o recomendado é 1 ou 2 (um titular e um reserva). Quem só publica pode ser <em>editor</em>; quem só acompanha, <em>colaborador</em>. <Link href="/usuarios" className="font-medium text-primary hover:underline">Revisar papéis</Link></p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2" data-ajuda="diretorio.busca">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, cargo, setor, e-mail ou telefone" aria-label="Buscar" className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm" />
        </div>
        <div className="flex rounded-lg border border-border p-0.5" role="radiogroup" aria-label="Mostrar">
          {([['cartoes', LayoutGrid, 'Pessoas'], ['setores', Rows3, 'Por setor']] as const).map(([v, Icone, r]) => (
            <button key={v} type="button" role="radio" aria-checked={vista === v} onClick={() => setVista(v)}
              className={cn('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm', vista === v ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}><Icone className="size-4" />{r}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2" data-ajuda="diretorio.filtros">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Setores">
          <button type="button" onClick={() => setSetor('')} className={cn('shrink-0 rounded-full px-3 py-1 text-xs font-medium', !setor ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground')}>Todos os setores · {visiveis.length}</button>
          {nomes.filter((s) => contagem(s) > 0).map((s) => (
            <button key={s} type="button" onClick={() => setSetor(setor === s ? '' : s)} className={cn('shrink-0 rounded-full px-3 py-1 text-xs font-medium', setor === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>{s} · {contagem(s)}</button>
          ))}
          {visiveis.some((p) => !p.setor) && <button type="button" onClick={() => setSetor(setor === '__sem' ? '' : '__sem')} className={cn('shrink-0 rounded-full px-3 py-1 text-xs font-medium', setor === '__sem' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>Sem setor · {visiveis.filter((p) => !p.setor).length}</button>}
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Acesso">
          {FILTROS_DE_ACESSO.map((a) => (
            <button key={a.valor} type="button" onClick={() => setAcesso(a.valor)} className={cn('rounded-lg px-2.5 py-1 text-xs font-medium', acesso === a.valor ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}>
              {a.rotulo}{a.valor !== 'todos' && ` · ${visiveis.filter((p) => p.acesso === a.valor).length}`}
            </button>
          ))}
        </div>
      </div>

      {!lista.length ? <Card className="p-10 text-center text-sm text-muted-foreground">Ninguém com esse filtro.</Card> : vista === 'cartoes' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" id="cartoes" data-ajuda="diretorio.cartoes">{lista.map((p) => <CartaoDaPessoa key={p.chave} p={p} ehAdmin={ehAdmin} />)}</div>
      ) : (
        <div className="flex flex-col gap-6" id="por-setor">
          {grupos.map((g) => {
            const info = g.setor ? infoDoSetor.get(g.setor) : null
            return (
              <section key={g.setor ?? '__sem'} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
                  <div>
                    <h2 className="font-semibold">{g.setor ?? 'Sem setor'} <span className="text-sm font-normal text-muted-foreground">· {g.pessoas.length}</span></h2>
                    {info?.descricao && <p className="text-xs text-muted-foreground">{info.descricao}</p>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {info?.responsavel && <>Responsável: <span className="font-medium text-foreground">{nomeExibido(info.responsavel)}</span></>}
                    {info?.email && <>{info.responsavel ? ' · ' : ''}<a href={`mailto:${info.email}`} className="text-primary hover:underline">{info.email}</a></>}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{g.pessoas.map((p) => <CartaoDaPessoa key={p.chave} p={p} ehAdmin={ehAdmin} />)}</div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
