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
import { createAdminClient } from '@/lib/supabase/admin'
import { configDoWhatsapp } from '@/lib/whatsapp/servidor'
import { mascararNumero } from '@/lib/whatsapp/regras'
import { lerMarcaDoConvite } from '@/lib/contas/convite'

export const metadata = { title: 'Adicionar pessoas' }
export const dynamic = 'force-dynamic'

/**
 * O cadastro de quem entra: escolher da equipe quem ainda não tem login (ou
 * alguém de fora), conferir WhatsApp, e-mail, setor e papel e mandar os
 * convites de uma vez. Cada pessoa cria a própria senha pelo link, que sai
 * por e-mail e/ou WhatsApp; quem não tem ficha no RH ganha uma, e o pedido
 * para completar a ficha pode ir na mesma mensagem. Abaixo, os convites que
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
  const semAcesso = pessoas.filter((p) => p.acesso === 'sem_acesso')
  const convidados = pessoas.filter((p) => p.acesso === 'convite' && p.user_id)
  // O celular da ficha do RH e o canal do último convite: tabelas só do servidor (a página já exige admin).
  const admin = createAdminClient()
  const fichas = semAcesso.map((p) => p.ficha_id).filter((id): id is string => Boolean(id))
  const [{ data: telefones }, { data: links }, whatsapp] = await Promise.all([
    fichas.length ? admin.from('equipe_pessoais').select('membro_id, telefone_pessoal').in('membro_id', fichas) : Promise.resolve({ data: [] }),
    convidados.length ? admin.from('tokens_de_conta').select('user_id, email, criado_em').eq('finalidade', 'definir_senha').in('user_id', convidados.map((p) => p.user_id as string)).order('criado_em', { ascending: false })
      : Promise.resolve({ data: [] }),
    configDoWhatsapp(ws),
  ])
  const telefoneDe = new Map((telefones ?? []).map((t) => [t.membro_id as string, (t.telefone_pessoal as string | null) ?? '']))
  const canalDe = new Map<string, string | null>()
  for (const l of links ?? []) if (!canalDe.has(l.user_id as string)) canalDe.set(l.user_id as string, (l.email as string | null) ?? null)
  const candidatos: Candidato[] = semAcesso.map((p) => ({
    chave: p.chave, nome: p.nome, cargo: p.cargo, setor: p.setor, email: p.email, fichaId: p.ficha_id,
    whatsapp: (p.ficha_id && telefoneDe.get(p.ficha_id)) || null,
    papel: ((p.setor && sugerido.get(p.setor)) || 'colaborador') as Papel,
  }))
  const pendentes: Pendente[] = convidados.map((p) => {
    const numero = lerMarcaDoConvite(canalDe.get(p.user_id as string)).numero
    return { userId: p.user_id as string, nome: p.nome, email: p.email, setor: p.setor, criadoEm: p.criado_em, whatsapp: numero ? mascararNumero(numero) : null }
  })
  return (
    <div className="flex flex-col gap-6">
      <Link href="/pessoas" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Diretório</Link>
      <PageHeader title="Adicionar pessoas ao Palácio Virtual" description="Um cadastro só: a pessoa ganha o acesso (recebe o usuário e cria a própria senha pelo link, por WhatsApp e/ou e-mail), a ficha no RH e, se quiser, o pedido para completar a ficha — tudo numa mensagem." />
      <AdicionarPessoas candidatos={candidatos} pendentes={pendentes} setores={setores} envioConfigurado={emailConfigurado()} whatsappConfigurado={Boolean(whatsapp)} inicial={sp.nome} />
    </div>
  )
}
