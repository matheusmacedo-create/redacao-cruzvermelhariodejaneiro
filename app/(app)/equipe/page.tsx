import Link from 'next/link'
import { Download, Lock, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { contextoDaEquipe, COLUNAS_DO_MEMBRO, type Membro } from '@/lib/rh/acesso'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { PESSOAS_DA_EQUIPE } from '@/lib/equipe'
import {
  NIVEIS, NOMES_DOS_SETORES, SITUACOES, VINCULOS, ehSituacao, ehVinculo, faltamNaEquipe, organograma, rotuloDoVinculo, situacaoDaValidade, tempoDeCasa,
  type NomeDoNivel,
} from '@/lib/rh/regras'
import { NivelDeAcesso, TrazerLista } from '@/components/app/equipe/acoes'
import { Situacao, nomeDe } from '@/components/app/equipe/comum'
import { Organograma } from '@/components/app/equipe/organograma'

export const dynamic = 'force-dynamic'

const selectClass = 'rounded-lg border border-border bg-background px-3 py-2 text-sm'
/**
 * A Equipe da filial: funcionários, coordenadores, administrativo e
 * diretoria. Separada do Voluntariado, com dados e acessos próprios. Abas:
 * a lista, o organograma e — para admin — quem acessa.
 */
export default async function EquipePage({ searchParams }: { searchParams: Promise<{ aba?: string; q?: string; vinculo?: string; situacao?: string; setor?: string }> }) {
  const sp = await searchParams
  const { context, supabase, nivel } = await contextoDaEquipe()
  const ws = context.workspace.id

  if (nivel < 1) {
    return (
      <div>
        <PageHeader title="Gestão da equipe" description="Funcionários, coordenadores, administrativo e diretoria." />
        <Card className="flex items-start gap-3 p-6">
          <Lock className="mt-0.5 size-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Você ainda não tem acesso à Equipe.</p>
            <p className="mt-1 text-sm text-muted-foreground">Ela guarda dados de contrato, documentos e remuneração, e é liberada pessoa a pessoa. Peça a um administrador.</p>
          </div>
        </Card>
      </div>
    )
  }

  const ehAdmin = context.role === 'admin'
  const aba = sp.aba === 'organograma' ? 'organograma' : sp.aba === 'acessos' && ehAdmin ? 'acessos' : 'lista'
  const hoje = hojeEmSaoPaulo()

  const { data } = await supabase.from('equipe_membros').select(COLUNAS_DO_MEMBRO).eq('workspace_id', ws).order('nome').limit(5000)
  const membros = (data ?? []) as Membro[]
  const porId = new Map(membros.map((m) => [m.id, m]))
  const atuais = membros.filter((m) => m.situacao !== 'desligado')
  const faltam = nivel >= 2 ? faltamNaEquipe(PESSOAS_DA_EQUIPE, membros).length : 0

  const termo = (sp.q ?? '').trim().toLowerCase()
  const situacao = ehSituacao(sp.situacao) ? sp.situacao : sp.situacao === 'todas' ? null : 'atuais'
  const lista = membros
    .filter((m) => (situacao === 'atuais' ? m.situacao !== 'desligado' : !situacao || m.situacao === situacao))
    .filter((m) => !sp.vinculo || !ehVinculo(sp.vinculo) || m.vinculo === sp.vinculo)
    .filter((m) => !sp.setor || m.setor === sp.setor)
    .filter((m) => !termo || [m.nome, m.nome_social, m.cargo, m.setor, m.email_trabalho, m.telefone_trabalho].filter(Boolean).join(' ').toLowerCase().includes(termo))

  const abas = [
    { id: 'lista', rotulo: `Pessoas (${atuais.length})` },
    { id: 'organograma', rotulo: 'Organograma' },
    ...(ehAdmin ? [{ id: 'acessos', rotulo: 'Quem acessa' }] : []),
  ]
  const exportar = `/api/equipe/exportar?${new URLSearchParams(Object.entries({ vinculo: sp.vinculo ?? '', situacao: sp.situacao ?? '', setor: sp.setor ?? '' }).filter(([, v]) => v)).toString()}`
  const semAdmissao = atuais.filter((m) => !m.admissao || m.vinculo === 'outro').length
  // ASO, certificados e documentos com validade: só os que o nível deixa ver.
  const { data: comValidade } = nivel >= 2
    ? await supabase.from('equipe_arquivos').select('membro_id,validade').eq('workspace_id', ws).is('excluido_em', null).not('validade', 'is', null).limit(5000)
    : { data: [] }
  const atuaisIds = new Set(atuais.map((m) => m.id))
  const vencendo = (comValidade ?? []).filter((a) => atuaisIds.has(a.membro_id as string) && ['vencida', 'vence_logo'].includes(situacaoDaValidade(a.validade as string, hoje))).length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Gestão da equipe"
        description="Funcionários, coordenadores, administrativo e diretoria: contrato e cargo, histórico, documentos e remuneração. Voluntários ficam em Voluntariado."
        actions={nivel >= 2 ? <div className="flex flex-wrap items-start gap-2">
          <TrazerLista faltam={faltam} />
          <Button variant="outline" render={<a href={exportar} />}><Download className="size-4" />Exportar</Button>
          <Button render={<Link href="/equipe/novo" />}><Plus className="size-4" />Nova pessoa</Button>
        </div> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          [atuais.filter((m) => m.situacao === 'ativo').length, 'ativos'],
          [atuais.filter((m) => m.situacao === 'afastado').length, 'afastados'],
          [new Set(atuais.map((m) => m.setor).filter(Boolean)).size, 'setores com gente'],
          [semAdmissao, 'fichas sem admissão ou vínculo', semAdmissao > 0],
          ...(nivel >= 2 ? [[vencendo, 'arquivos vencidos ou vencendo (ASO, certificados)', vencendo > 0]] : []),
        ].map(([v, r, alerta], i) => (
          <Card key={i} className={`p-4 ${alerta ? 'border-warning/60' : ''}`}><p className="text-2xl font-bold tabular-nums">{v}</p><p className="text-xs text-muted-foreground">{r}</p></Card>
        ))}
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Abas">
        {abas.map((a) => (
          <Link key={a.id} href={`/equipe${a.id === 'lista' ? '' : `?aba=${a.id}`}`} aria-current={aba === a.id ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === a.id ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{a.rotulo}</Link>
        ))}
      </nav>

      {aba === 'lista' && (
        <>
          <form className="flex flex-wrap items-center gap-2" role="search">
            <div className="relative min-w-52 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input name="q" defaultValue={sp.q ?? ''} placeholder="Nome, cargo, setor, e-mail ou telefone" aria-label="Buscar" className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm" />
            </div>
            <select name="vinculo" defaultValue={sp.vinculo ?? ''} aria-label="Vínculo" className={selectClass}>
              <option value="">Todos os vínculos</option>{Object.entries(VINCULOS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
            </select>
            <select name="situacao" defaultValue={sp.situacao ?? ''} aria-label="Situação" className={selectClass}>
              <option value="">Ativos e afastados</option>
              {Object.entries(SITUACOES).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
              <option value="todas">Todas</option>
            </select>
            <select name="setor" defaultValue={sp.setor ?? ''} aria-label="Setor" className={selectClass}>
              <option value="">Todos os setores</option>{NOMES_DOS_SETORES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <Button type="submit" variant="outline">Filtrar</Button>
          </form>
          <Card className="overflow-hidden p-0">
            {!lista.length ? (
              <p className="p-10 text-center text-sm text-muted-foreground">{membros.length ? 'Ninguém neste filtro.' : 'Nenhuma ficha ainda. Cadastre ou traga a lista de setores.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[52rem] border-collapse text-sm">
                  <thead><tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5">Nome</th><th className="px-3 py-2.5">Setor</th><th className="px-3 py-2.5">Vínculo</th><th className="px-3 py-2.5">Gestor</th><th className="px-3 py-2.5">Contato</th><th className="px-3 py-2.5">Situação</th>
                  </tr></thead>
                  <tbody>
                    {lista.map((m) => (
                      <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="max-w-72 px-4 py-3">
                          <Link href={`/equipe/${m.id}`} className="block truncate font-medium hover:text-primary hover:underline">{nomeDe(m)}</Link>
                          <span className="text-xs text-muted-foreground">{[m.cargo, tempoDeCasa(m.admissao, hoje)].filter(Boolean).join(' · ') || '—'}</span>
                        </td>
                        <td className="px-3 py-3 text-xs">{m.setor ?? '—'}</td>
                        <td className="px-3 py-3 text-xs">{rotuloDoVinculo(m.vinculo)}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">{m.gestor_id && porId.get(m.gestor_id) ? nomeDe(porId.get(m.gestor_id)!) : '—'}</td>
                        <td className="px-3 py-3 text-xs"><span className="block">{m.email_trabalho ?? '—'}</span><span className="text-muted-foreground">{m.telefone_trabalho}</span></td>
                        <td className="px-3 py-3"><Situacao s={m.situacao} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {aba === 'organograma' && <Organograma arvore={organograma(atuais)} />}
      {aba === 'acessos' && <Acessos workspaceId={ws} />}
    </div>
  )
}

async function Acessos({ workspaceId }: { workspaceId: string }) {
  const { supabase } = await contextoDaEquipe()
  const [{ data: membros }, { data: acessos }, { data: auditoria }, { data: fichas }] = await Promise.all([
    supabase.from('workspace_members').select('user_id,role,profiles(full_name,active)').eq('workspace_id', workspaceId),
    supabase.from('equipe_acesso').select('user_id,nivel').eq('workspace_id', workspaceId),
    supabase.from('equipe_auditoria').select('acao,created_at,user_id,membro_id,detalhe').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(40),
    supabase.from('equipe_membros').select('id,nome').eq('workspace_id', workspaceId).limit(5000),
  ])
  const nivelDe = new Map((acessos ?? []).map((a) => [a.user_id as string, a.nivel as NomeDoNivel]))
  const perfil = (m: { profiles: unknown }) => (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string; active?: boolean } | null
  const nomes = new Map((membros ?? []).map((m) => [m.user_id as string, perfil(m)?.full_name ?? 'Alguém']))
  const ficha = new Map((fichas ?? []).map((f) => [f.id as string, f.nome as string]))
  const pessoas = (membros ?? []).filter((m) => perfil(m)?.active !== false)
    .sort((a, b) => (nomes.get(a.user_id as string) ?? '').localeCompare(nomes.get(b.user_id as string) ?? '', 'pt-BR'))
  const ACAO: Record<string, string> = {
    criar: 'criou a ficha de', editar: 'editou a ficha de', situacao: 'mudou a situação de', ver_documentos: 'abriu os documentos de',
    ver_documentos_e_banco: 'abriu documentos e banco de', ver_remuneracao: 'abriu a remuneração de', registrar_remuneracao: 'registrou remuneração de',
    excluir_remuneracao: 'excluiu um registro de remuneração de', exportar: 'exportou a planilha', acesso: 'mudou um acesso',
    enviar_arquivo: 'guardou um arquivo na ficha de', abrir_arquivo: 'abriu um arquivo de', excluir_arquivo: 'excluiu um arquivo de',
  }
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <Card className="p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="font-semibold">Quem acessa a Equipe</p>
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
              <span className="font-medium">{a.user_id ? nomes.get(a.user_id as string) ?? 'Alguém' : 'Sistema'}</span> {ACAO[a.acao as string] ?? a.acao}
              {a.membro_id && ficha.has(a.membro_id as string) ? <> <Link href={`/equipe/${a.membro_id}`} className="font-medium hover:underline">{ficha.get(a.membro_id as string)}</Link></> : null}
              {a.acao === 'acesso' && (a.detalhe as { usuario?: string; nivel?: string } | null)?.usuario
                ? <> de {nomes.get((a.detalhe as { usuario: string }).usuario) ?? 'alguém'} para {NIVEIS[(a.detalhe as { nivel?: NomeDoNivel }).nivel as NomeDoNivel]?.rotulo ?? 'sem acesso'}</> : null}
              <span className="text-muted-foreground"> · {new Date(a.created_at as string).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</span>
            </li>
          ))}
          {!auditoria?.length && <li className="px-4 py-6 text-center text-xs text-muted-foreground">Nada registrado ainda.</li>}
        </ul>
      </Card>
    </div>
  )
}
