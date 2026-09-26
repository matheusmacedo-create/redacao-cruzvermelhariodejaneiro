import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { AdicionarPessoas, type Candidato, type Pendente } from '@/components/app/pessoas/adicionar'
import { requireWorkspace } from '@/lib/session'
import { pode, type Papel } from '@/lib/permissoes'
import { createClient } from '@/lib/supabase/server'
import { PESSOAS_DA_EQUIPE, SETORES } from '@/lib/equipe'
import { nomesDosSetores } from '@/lib/setores'
import { emailConfigurado } from '@/lib/newsletter/resend'
import { montarDiretorio, type LinhaDoDiretorio } from '@/lib/pessoas/diretorio'

export const metadata = { title: 'Adicionar pessoas' }
export const dynamic = 'force-dynamic'

/**
 * Dar acesso à Redação: escolher da equipe quem ainda não tem login (ou
 * alguém de fora), conferir e-mail, setor e papel e mandar os convites de uma
 * vez. Cada pessoa cria a própria senha pelo link. Abaixo, os convites que
 * ainda não foram usados, para reenviar ou cancelar.
 */
export default async function AdicionarPage({ searchParams }: { searchParams: Promise<{ nome?: string }> }) {
  const sp = await searchParams
  const context = await requireWorkspace()
  if (!pode(context.role, 'usuarios.gerenciar')) notFound()
  const supabase = await createClient()
  const ws = context.workspace.id
  const [{ data: linhas }, setores] = await Promise.all([supabase.rpc('diretorio', { p_workspace_id: ws }), nomesDosSetores(supabase, ws)])
  const pessoas = montarDiretorio((linhas ?? []) as LinhaDoDiretorio[], PESSOAS_DA_EQUIPE.map((p) => ({ nome: p.nome, cargo: p.cargo, setor: p.setor })))
  // Papel sugerido pelo setor (o mesmo de lib/equipe); fora dele, colaborador — o mais restrito.
  const sugerido = new Map(SETORES.map((s) => [s.nome, s.papelSugerido]))
  const candidatos: Candidato[] = pessoas.filter((p) => p.acesso === 'sem_acesso').map((p) => ({
    chave: p.chave, nome: p.nome, cargo: p.cargo, setor: p.setor, email: p.email, fichaId: p.ficha_id,
    papel: ((p.setor && sugerido.get(p.setor)) || 'colaborador') as Papel,
  }))
  const pendentes: Pendente[] = pessoas.filter((p) => p.acesso === 'convite' && p.user_id).map((p) => ({ userId: p.user_id as string, nome: p.nome, email: p.email, setor: p.setor, criadoEm: p.criado_em }))
  return (
    <div className="flex flex-col gap-6">
      <Link href="/pessoas" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Diretório</Link>
      <PageHeader title="Adicionar pessoas ao Palácio Virtual" description="Convite por e-mail: a pessoa recebe o usuário e cria a própria senha — ninguém mais a conhece. Para quem não tem e-mail, use a senha temporária em Usuários." />
      <AdicionarPessoas candidatos={candidatos} pendentes={pendentes} setores={setores} envioConfigurado={emailConfigurado()} inicial={sp.nome} />
    </div>
  )
}
