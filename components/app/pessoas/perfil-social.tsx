import Link from 'next/link'
import {
  AtSign, Building2, CalendarDays, CheckCircle2, Clock, EyeOff, FileText, Globe, Hash, Info, Link2, Lock, Mail,
  MessageCircle, Pencil, Phone, ShieldCheck, Sparkles, Star, Ticket, Users, Zap,
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { privateAvatarUrl } from '@/lib/avatar-url'
import { ehPapel, PAPEL } from '@/lib/permissoes'
import { iniciaisDe } from '@/lib/pessoas/diretorio'
import type { PerfilParaLeitura } from '@/lib/pessoas/perfil-servidor'
import {
  CANAIS, CAPAS, duracao, hrefDoContato, selinhoDeResposta, taxa, TIPOS_DE_CONTATO, VISIBILIDADES,
  type Canal, type Contato, type TipoDeContato,
} from '@/lib/pessoas/perfil'
import { cn } from '@/lib/utils'
import { BotaoMensagem } from './botao-mensagem'

const ICONE: Record<Canal, typeof Mail> = {
  email: Mail, telefone: Phone, whatsapp: MessageCircle, ramal: Hash, instagram: AtSign, linkedin: Link2, site: Globe, outro: Info,
}

const data = (iso: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
const quando = (iso: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

export function PerfilSocial({ p }: { p: PerfilParaLeitura }) {
  const selinho = selinhoDeResposta(p.metricas)
  const papel = ehPapel(p.papel) ? PAPEL[p.papel] : null
  const online = p.online
  const vazio = !p.bio && !p.disponibilidade && !p.habilidades.length && !p.contatos.length

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Card className="overflow-hidden p-0" data-ajuda="diretorio.perfil-topo">
        <div className={cn('h-28 bg-gradient-to-br sm:h-40', CAPAS[p.capa].classe)} aria-hidden />
        <div className="px-4 pb-5 sm:px-6">
          <div className="-mt-12 flex flex-wrap items-end justify-between gap-3 sm:-mt-14">
            <div className="relative">
              <Avatar initials={p.iniciais || iniciaisDe(p.nome)} color={p.cor ?? '#9ca3af'} src={privateAvatarUrl(p.avatarPath)} alt={p.nome}
                size="xl" className="size-24 text-3xl ring-4 ring-card sm:size-28" />
              {online && <span className="absolute bottom-2 right-2 size-4 rounded-full bg-success ring-4 ring-card" title="Com a Redação aberta agora" />}
            </div>
            <div className="flex flex-wrap gap-2" data-ajuda="diretorio.perfil-acoes">
              {p.leitor.ehDono
                ? <Button variant="outline" render={<Link href={`/pessoas/${p.id}/editar`} />}><Pencil className="size-4" />Editar perfil</Button>
                : p.ativo && <BotaoMensagem pessoaId={p.id} nome={p.nome} />}
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-1">
            <h1 className="flex flex-wrap items-baseline gap-x-2 text-2xl font-bold">
              {p.nome}
              {p.pronomes && <span className="text-sm font-normal text-muted-foreground">({p.pronomes})</span>}
            </h1>
            <p className="text-muted-foreground">
              {[p.cargo, p.setor].filter(Boolean).join(' · ') || 'Cargo e setor não informados'}
              {p.usuario && <span className="text-primary"> · @{p.usuario}</span>}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium">
              {selinho && <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-success"><Zap className="size-3.5" />{selinho}</span>}
              {papel && <span className={cn('rounded-full border px-2.5 py-1', p.papel === 'admin' ? 'border-primary/40 text-primary' : 'border-border text-muted-foreground')} title={papel.descricao}>{papel.rotulo}</span>}
              {!p.ativo && <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">Conta desativada</span>}
              {p.membroDesde && <span className="inline-flex items-center gap-1 text-muted-foreground"><CalendarDays className="size-3.5" />Na Redação desde {data(p.membroDesde)}</span>}
              {p.vistoEm && !online && <span className="text-muted-foreground" title="Só você e administradores veem isto">Visto em {quando(p.vistoEm)}</span>}
            </div>
            {p.bio
              ? <p className="mt-3 max-w-3xl whitespace-pre-line text-[15px] leading-relaxed">{p.bio}</p>
              : p.leitor.ehDono && <p className="mt-3 text-sm italic text-muted-foreground">Você ainda não escreveu uma apresentação.</p>}
          </div>
        </div>
      </Card>

      {p.leitor.ehDono && vazio && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-primary/30 bg-primary/5 p-4">
          <p className="text-sm"><strong>Complete o seu perfil.</strong> Conte o que você faz, em que pode ajudar e como a equipe fala com você.</p>
          <Button render={<Link href={`/pessoas/${p.id}/editar`} />}><Sparkles className="size-4" />Completar perfil</Button>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Metricas p={p} />
          {(p.disponibilidade || p.habilidades.length > 0) && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sobre</h2>
              {p.disponibilidade && <p className="mb-3 flex items-start gap-2 text-sm"><Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span><span className="text-muted-foreground">Disponível:</span> {p.disponibilidade}</span></p>}
              {p.habilidades.length > 0 && (
                <div>
                  <p className="mb-2 text-sm text-muted-foreground">Pode ajudar com</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {p.habilidades.map((h) => <li key={h} className="rounded-full border border-border bg-muted/50 px-3 py-1 text-sm">{h}</li>)}
                  </ul>
                </div>
              )}
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-6" data-ajuda="diretorio.contatos">
          <Contatos p={p} tipo="institucional" />
          <Contatos p={p} tipo="pessoal" />
        </div>
      </div>
    </div>
  )
}

function Tile({ icone: Icone, titulo, valor, detalhe }: { icone: typeof Mail; titulo: string; valor: string; detalhe?: string | null }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border p-4">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Icone className="size-3.5" />{titulo}</span>
      <span className="text-2xl font-bold tabular-nums">{valor}</span>
      {detalhe && <span className="text-xs text-muted-foreground">{detalhe}</span>}
    </div>
  )
}

function Metricas({ p }: { p: PerfilParaLeitura }) {
  const m = p.metricas
  if (!m) {
    return (
      <Card className="flex items-start gap-3 p-5 text-sm text-muted-foreground" data-ajuda="diretorio.metricas">
        <EyeOff className="mt-0.5 size-4 shrink-0" />
        <p>{p.nome.split(' ')[0]} preferiu não mostrar as métricas no perfil.</p>
      </Card>
    )
  }
  const tChat = taxa(m.chat.respondidas, m.chat.recebidas)
  const tAprov = taxa(m.aprovacoes.decididos, m.aprovacoes.pedidos)
  const nota = m.chamados.nota_media != null ? m.chamados.nota_media.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null
  return (
    <Card className="p-5" data-ajuda="diretorio.metricas">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Como responde à equipe</h2>
        <span className="text-xs text-muted-foreground">Últimos {m.dias} dias · mediana, em tempo corrido</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Tile icone={MessageCircle} titulo="Tempo de resposta no chat" valor={duracao(m.chat.mediana_min) ?? '—'}
          detalhe={m.chat.recebidas ? `Respondeu ${m.chat.respondidas} de ${m.chat.recebidas} conversas e menções${tChat != null ? ` (${tChat}%)` : ''}` : 'Sem mensagens diretas ou menções no período'} />
        <Tile icone={CheckCircle2} titulo="Tempo para decidir aprovações" valor={duracao(m.aprovacoes.mediana_min) ?? '—'}
          detalhe={m.aprovacoes.pedidos ? `Decidiu ${m.aprovacoes.decididos} de ${m.aprovacoes.pedidos} pedidos${tAprov != null ? ` (${tAprov}%)` : ''}` : 'Nenhum pedido de aprovação no período'} />
        {m.chamados.atendidos > 0 && (
          <Tile icone={Ticket} titulo="Primeira resposta em chamados" valor={duracao(m.chamados.primeira_resposta_mediana_min) ?? '—'}
            detalhe={`${m.chamados.resolvidos} de ${m.chamados.atendidos} resolvidos`} />
        )}
        {m.chamados.avaliacoes > 0 && nota && (
          <Tile icone={Star} titulo="Nota no atendimento" valor={`${nota} / 5`} detalhe={`${m.chamados.avaliacoes} ${m.chamados.avaliacoes === 1 ? 'avaliação' : 'avaliações'} de quem abriu o chamado`} />
        )}
        <Tile icone={FileText} titulo="Produção" valor={String(m.producao.pautas_em_andamento)}
          detalhe={`${m.producao.pautas_em_andamento === 1 ? 'pauta em andamento' : 'pautas em andamento'} · ${m.producao.conteudos_criados} ${m.producao.conteudos_criados === 1 ? 'conteúdo criado' : 'conteúdos criados'}`} />
        <Tile icone={Users} titulo="Mensagens no chat" valor={String(m.chat.enviadas)} detalhe="enviadas no período" />
      </div>
      {p.leitor.ehDono && !p.mostrarMetricas && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3.5" />Escondidas do seu perfil: só você e administradores veem.</p>
      )}
    </Card>
  )
}

function LinhaDeContato({ canal, valor, rotulo, rodape }: { canal: Canal; valor: string; rotulo?: string; rodape?: React.ReactNode }) {
  const Icone = ICONE[canal]
  const href = hrefDoContato({ canal, valor })
  const externo = href?.startsWith('http')
  // E-mail e link longos cortam com reticências (o endereço inteiro fica no
  // título); quebrar no meio da palavra deixava "…janeiro.or / g".
  const texto = <span className="block truncate" title={valor}>{valor}</span>
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icone className="size-4" /></span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="text-xs text-muted-foreground">{rotulo || CANAIS[canal].rotulo}</p>
        {href ? <a href={href} target={externo ? '_blank' : undefined} rel={externo ? 'noreferrer' : undefined} className="block font-medium hover:text-primary hover:underline">{texto}</a> : <p className="font-medium">{texto}</p>}
        {rodape}
      </div>
    </li>
  )
}

function Contatos({ p, tipo }: { p: PerfilParaLeitura; tipo: TipoDeContato }) {
  const lista: Contato[] = p.contatos.filter((c) => c.tipo === tipo)
  const daFicha = tipo === 'institucional' ? p.contatosDaFicha : []
  const nada = !lista.length && !daFicha.length
  if (nada && tipo === 'pessoal' && !p.leitor.ehDono && !p.contatosOcultos) return null
  return (
    <Card className="p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {tipo === 'institucional' ? <Building2 className="size-4" /> : <Users className="size-4" />}{TIPOS_DE_CONTATO[tipo]}
      </h2>
      {nada
        ? <p className="py-2 text-sm text-muted-foreground">{p.leitor.ehDono ? 'Nenhum ainda. Adicione em "Editar perfil".' : tipo === 'pessoal' ? 'Nenhum visível para você.' : 'Nenhum informado.'}</p>
        : (
          <ul className="divide-y divide-border">
            {daFicha.map((c) => <LinhaDeContato key={`ficha-${c.rotulo}-${c.valor}`} canal={c.canal} valor={c.valor} rotulo={c.rotulo} />)}
            {lista.map((c, i) => (
              <LinhaDeContato key={`${c.canal}-${c.valor}-${i}`} canal={c.canal} valor={c.valor} rotulo={c.rotulo}
                rodape={p.leitor.ehDono && <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">{c.visibilidade === 'equipe' ? <Users className="size-3" /> : c.visibilidade === 'setor' ? <Building2 className="size-3" /> : <ShieldCheck className="size-3" />}{VISIBILIDADES[c.visibilidade].rotulo}</p>} />
            ))}
          </ul>
        )}
      {tipo === 'pessoal' && p.contatosOcultos > 0 && !p.leitor.ehDono && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3.5" />{p.contatosOcultos === 1 ? 'Há 1 contato restrito' : `Há ${p.contatosOcultos} contatos restritos`} a outro grupo.</p>
      )}
    </Card>
  )
}
