import Link from 'next/link'
import { CalendarHeart, Download, Eye, GalleryHorizontalEnd, GraduationCap, Lock, Megaphone, MessageCircle, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { urlBase } from '@/lib/newsletter/contexto'
import { NIVEIS, SITUACOES, VINCULOS, ehSituacao, ehVinculo, idade, situacaoDaFormacao, type NomeDoNivel } from '@/lib/participantes/regras'
import { CopiarLink, DecidirInscricao, NivelDeAcesso } from '@/components/app/participantes/acoes'
import { nomesDosSetores } from '@/lib/setores'
import { tituloDaArea } from '@/lib/navegacao'

export const metadata = { title: tituloDaArea('/voluntariado') }

export const dynamic = 'force-dynamic'

const TETO = 20000
const selectClass = 'rounded-lg border border-border bg-background px-3 py-2 text-sm'

type Linha = {
  id: string; nome: string; nome_social: string | null; vinculo: string; situacao: string; setores: string[]; funcao: string | null
  email: string | null; telefone: string | null; data_nascimento: string | null; cidade: string | null; origem: string; created_at: string
  anonimizado_em: string | null
}

/**
 * O Voluntariado da filial: voluntários, juventude e instrutores
 * voluntários. A equipe contratada fica em /equipe. Abas: a lista, as
 * inscrições que chegaram pelo formulário público e — para admin — quem
 * pode acessar o cadastro.
 */
export default async function ParticipantesPage({ searchParams }: { searchParams: Promise<{ aba?: string; q?: string; vinculo?: string; situacao?: string; setor?: string }> }) {
  const sp = await searchParams
  const { context, supabase, nivel } = await contextoDeParticipantes()
  const ws = context.workspace.id

  if (nivel < 1) {
    return (
      <div>
        <PageHeader title="Voluntários" description="Cadastro de voluntários, juventude e instrutores voluntários." />
        <Card className="flex items-start gap-3 p-6">
          <Lock className="mt-0.5 size-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Você ainda não tem acesso a este cadastro.</p>
            <p className="mt-1 text-sm text-muted-foreground">Ele guarda dados pessoais e é liberado pessoa a pessoa. Peça a um administrador.</p>
          </div>
        </Card>
      </div>
    )
  }

  const aba = sp.aba === 'inscricoes' ? 'inscricoes' : sp.aba === 'acessos' && nivel >= 3 ? 'acessos' : 'lista'
  const hoje = hojeEmSaoPaulo()

  const linhas: Linha[] = []
  for (let de = 0; de < TETO; de += 1000) {
    const { data } = await supabase.from('participantes')
      .select('id,nome,nome_social,vinculo,situacao,setores,funcao,email,telefone,data_nascimento,cidade,origem,created_at,anonimizado_em')
      .eq('workspace_id', ws).order('nome').range(de, de + 999)
    linhas.push(...((data ?? []) as Linha[]))
    if (!data || data.length < 1000) break
  }
  const inicioDoMes = `${hoje.slice(0, 8)}01`
  const [{ data: horasDoMes }, { data: formacoes }] = await Promise.all([
    supabase.from('participante_horas').select('horas').eq('workspace_id', ws).gte('data', inicioDoMes).limit(10000),
    supabase.from('participante_formacoes').select('valido_ate').eq('workspace_id', ws).not('valido_ate', 'is', null).limit(10000),
  ])

  const { count: abertas } = nivel >= 2
    ? await supabase.from('membro_conversas').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('situacao', 'aberta')
    : { count: 0 }
  const conversasAbertas = abertas ?? 0
  const ativos = linhas.filter((l) => l.situacao === 'ativo')
  const pendentes = linhas.filter((l) => l.situacao === 'candidato')
  const totalHoras = (horasDoMes ?? []).reduce((s, h) => s + Number(h.horas), 0)
  const vencendo = (formacoes ?? []).filter((f) => ['vence_logo', 'vencida'].includes(situacaoDaFormacao(f.valido_ate, hoje))).length

  const termo = (sp.q ?? '').trim().toLowerCase()
  const lista = linhas.filter((l) => l.situacao !== 'candidato' && !l.anonimizado_em)
    .filter((l) => !sp.vinculo || !ehVinculo(sp.vinculo) || l.vinculo === sp.vinculo)
    .filter((l) => !sp.situacao || !ehSituacao(sp.situacao) || l.situacao === sp.situacao)
    .filter((l) => !sp.setor || l.setores.includes(sp.setor))
    .filter((l) => !termo || [l.nome, l.nome_social, l.email, l.telefone, l.funcao, l.cidade].filter(Boolean).join(' ').toLowerCase().includes(termo))

  const abas = [
    { id: 'lista', rotulo: `Voluntários (${linhas.filter((l) => l.situacao !== 'candidato' && !l.anonimizado_em).length})` },
    { id: 'inscricoes', rotulo: `Inscrições pendentes (${pendentes.length})` },
    ...(nivel >= 3 ? [{ id: 'acessos', rotulo: 'Quem acessa' }] : []),
  ]
  const exportar = `/api/voluntariado/exportar?${new URLSearchParams(Object.entries({ vinculo: sp.vinculo ?? '', situacao: sp.situacao ?? '', setor: sp.setor ?? '' }).filter(([, v]) => v)).toString()}`

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Voluntários"
        description="Voluntários, juventude e instrutores voluntários. CPF e saúde ficam cifrados; cada abertura é registrada. A equipe contratada fica em Recursos humanos."
        actions={nivel >= 2 ? <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<a href="/membro/previa?como=geral" target="_blank" rel="noopener" />}><Eye className="size-4" />Ver Área do Voluntário</Button>
          <CopiarLink url={`${urlBase()}/participe`} />
          <Button variant="outline" render={<a href={exportar} />}><Download className="size-4" />Exportar</Button>
          <Button render={<Link href="/voluntariado/novo" />} data-ajuda="voluntarios.novo"><Plus className="size-4" />Novo voluntário</Button>
        </div> : undefined}
      />

      <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="Área do Voluntário" id="area-do-voluntario" data-ajuda="voluntarios.atalhos">
        {[
          ...(nivel >= 2 ? [{ href: '/voluntariado/mensagens', rotulo: 'Mensagens', dica: conversasAbertas ? `${conversasAbertas} aguardando resposta` : 'Canal direto', icone: MessageCircle, alerta: conversasAbertas > 0 }] : []),
          ...(nivel >= 2 ? [{ href: '/voluntariado/avisos', rotulo: 'Avisos', dica: 'Mural dos voluntários', icone: Megaphone, alerta: false }] : []),
          ...(nivel >= 2 ? [{ href: '/voluntariado/banners', rotulo: 'Banners', dica: 'Destaques no Início', icone: GalleryHorizontalEnd, alerta: false }] : []),
          { href: '/voluntariado/oportunidades', rotulo: 'Oportunidades', dica: 'Ações, plantões e eventos', icone: CalendarHeart, alerta: false },
          { href: '/voluntariado/cursos', rotulo: 'Cursos e apostilas', dica: 'Formação e certificados', icone: GraduationCap, alerta: false },
        ].map((x) => (
          <Link key={x.href} href={x.href} className={`flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 hover:border-primary/50 ${x.alerta ? 'border-primary/60' : 'border-border'}`}>
            <x.icone className={`size-5 shrink-0 ${x.alerta ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className="min-w-0"><span className="block text-sm font-medium">{x.rotulo}</span><span className="block truncate text-xs text-muted-foreground">{x.dica}</span></span>
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-ajuda="voluntarios.numeros">
        {[
          [ativos.length, 'ativos'],
          [ativos.filter((l) => l.vinculo === 'voluntario' || l.vinculo === 'jovem').length, 'voluntários ativos'],
          [pendentes.length, 'inscrições pendentes', pendentes.length > 0],
          [totalHoras.toLocaleString('pt-BR', { maximumFractionDigits: 1 }), 'horas de voluntariado no mês'],
          [vencendo, 'formações vencidas ou vencendo', vencendo > 0],
        ].map(([v, r, alerta], i) => (
          <Card key={i} className={`p-4 ${alerta ? 'border-warning/60' : ''}`}><p className="text-2xl font-bold tabular-nums">{v}</p><p className="text-xs text-muted-foreground">{r}</p></Card>
        ))}
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Abas" data-ajuda="voluntarios.abas">
        {abas.map((a) => (
          <Link key={a.id} href={`/voluntariado${a.id === 'lista' ? '' : `?aba=${a.id}`}`} aria-current={aba === a.id ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === a.id ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{a.rotulo}</Link>
        ))}
      </nav>

      {aba === 'lista' && (
        <>
          <form className="flex flex-wrap items-center gap-2" role="search" data-ajuda="voluntarios.filtros">
            <div className="relative min-w-52 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input name="q" defaultValue={sp.q ?? ''} placeholder="Nome, e-mail, telefone, função ou cidade" aria-label="Buscar" className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm" />
            </div>
            <select name="vinculo" defaultValue={sp.vinculo ?? ''} aria-label="Vínculo" className={selectClass}>
              <option value="">Todos os vínculos</option>{Object.entries(VINCULOS).map(([k, v]) => <option key={k} value={k}>{v.plural}</option>)}
            </select>
            <select name="situacao" defaultValue={sp.situacao ?? ''} aria-label="Situação" className={selectClass}>
              <option value="">Todas as situações</option>{(['ativo', 'inativo', 'desligado'] as const).map((k) => <option key={k} value={k}>{SITUACOES[k].rotulo}</option>)}
            </select>
            <select name="setor" defaultValue={sp.setor ?? ''} aria-label="Setor" className={selectClass}>
              <option value="">Todos os setores</option>{(await nomesDosSetores(supabase, context.workspace.id)).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <Button type="submit" variant="outline">Filtrar</Button>
          </form>
          <Card className="overflow-hidden p-0">
            {!lista.length ? (
              <p className="p-10 text-center text-sm text-muted-foreground">{linhas.length ? 'Ninguém neste filtro.' : 'Nenhum voluntário ainda. Cadastre ou divulgue o link de inscrição.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[48rem] border-collapse text-sm">
                  <thead><tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5">Nome</th><th className="px-3 py-2.5">Vínculo</th><th className="px-3 py-2.5">Setores</th><th className="px-3 py-2.5">Contato</th><th className="px-3 py-2.5">Situação</th>
                  </tr></thead>
                  <tbody>
                    {lista.map((l) => (
                      <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="max-w-72 px-4 py-3">
                          <Link href={`/voluntariado/${l.id}`} className="block truncate font-medium hover:text-primary hover:underline">{l.nome_social || l.nome}</Link>
                          <span className="text-xs text-muted-foreground">{[l.funcao, idade(l.data_nascimento, hoje) !== null ? `${idade(l.data_nascimento, hoje)} anos` : null, l.cidade].filter(Boolean).join(' · ')}</span>
                        </td>
                        <td className="px-3 py-3 text-xs">{VINCULOS[l.vinculo as keyof typeof VINCULOS]?.rotulo ?? l.vinculo}</td>
                        <td className="max-w-56 px-3 py-3 text-xs text-muted-foreground">{l.setores.join(', ') || '—'}</td>
                        <td className="px-3 py-3 text-xs"><span className="block">{l.email ?? '—'}</span><span className="text-muted-foreground">{l.telefone}</span></td>
                        <td className="px-3 py-3"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${l.situacao === 'ativo' ? 'bg-success/15 text-success' : l.situacao === 'desligado' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>{SITUACOES[l.situacao as keyof typeof SITUACOES]?.rotulo}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {aba === 'inscricoes' && (
        <Card className="divide-y divide-border p-0">
          {!pendentes.length && <p className="p-10 text-center text-sm text-muted-foreground">Nenhuma inscrição esperando. O link público é {urlBase()}/participe.</p>}
          {pendentes.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <Link href={`/voluntariado/${l.id}`} className="font-medium hover:text-primary hover:underline">{l.nome_social || l.nome}</Link>
                <p className="text-xs text-muted-foreground">
                  {[VINCULOS[l.vinculo as keyof typeof VINCULOS]?.rotulo, idade(l.data_nascimento, hoje) !== null ? `${idade(l.data_nascimento, hoje)} anos` : null, l.email, l.setores.length ? `interesse: ${l.setores.join(', ')}` : null].filter(Boolean).join(' · ')}
                </p>
                <p className="text-[11px] text-muted-foreground">Inscrito em {new Date(l.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
              </div>
              {nivel >= 2 && <DecidirInscricao id={l.id} />}
            </div>
          ))}
        </Card>
      )}

      {aba === 'acessos' && <Acessos workspaceId={ws} />}
    </div>
  )
}

async function Acessos({ workspaceId }: { workspaceId: string }) {
  const { supabase } = await contextoDeParticipantes()
  const [{ data: membros }, { data: acessos }, { data: auditoria }] = await Promise.all([
    supabase.from('workspace_members').select('user_id,role,profiles(full_name,active)').eq('workspace_id', workspaceId),
    supabase.from('participantes_acesso').select('user_id,nivel').eq('workspace_id', workspaceId),
    supabase.from('participantes_auditoria').select('acao,created_at,user_id,participante_id,detalhe').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(30),
  ])
  const nivelDe = new Map((acessos ?? []).map((a) => [a.user_id as string, a.nivel as NomeDoNivel]))
  const nomes = new Map((membros ?? []).map((m) => [m.user_id as string, ((Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string } | null)?.full_name ?? 'Alguém']))
  const pessoas = (membros ?? []).filter((m) => ((Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { active?: boolean } | null)?.active !== false)
    .sort((a, b) => (nomes.get(a.user_id as string) ?? '').localeCompare(nomes.get(b.user_id as string) ?? '', 'pt-BR'))
  const ACAO: Record<string, string> = { criar: 'cadastrou', editar: 'editou', ver_sensiveis: 'abriu CPF/saúde', aprovar: 'aprovou inscrição', situacao: 'mudou a situação', anonimizar: 'apagou dados (LGPD)', exportar: 'exportou a planilha', acesso: 'mudou um acesso', inscricao_publica: 'inscrição pelo formulário', recusar_inscricao: 'recusou inscrição' }
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <Card className="p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="font-semibold">Quem acessa o cadastro</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
            {Object.values(NIVEIS).map((n) => <li key={n.rotulo}><span className="font-medium text-foreground">{n.rotulo}:</span> {n.descricao}</li>)}
          </ul>
        </div>
        <ul className="divide-y divide-border">
          {pessoas.map((m) => (
            <li key={m.user_id as string} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span>{nomes.get(m.user_id as string)}</span>
              <NivelDeAcesso userId={m.user_id as string} nivel={nivelDe.get(m.user_id as string) ?? null} ehAdmin={m.role === 'admin'} />
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-0">
        <p className="border-b border-border px-4 py-3 font-semibold">Registro de acessos e mudanças</p>
        <ul className="divide-y divide-border">
          {(auditoria ?? []).map((a, i) => (
            <li key={i} className="px-4 py-2 text-xs">
              <span className="font-medium">{a.user_id ? nomes.get(a.user_id as string) ?? 'Alguém' : 'Formulário público'}</span> {ACAO[a.acao as string] ?? a.acao}
              <span className="text-muted-foreground"> · {new Date(a.created_at as string).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</span>
            </li>
          ))}
          {!auditoria?.length && <li className="px-4 py-6 text-center text-xs text-muted-foreground">Nada registrado ainda.</li>}
        </ul>
      </Card>
    </div>
  )
}
