import { ShieldAlert } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Card } from '@/components/ui/card'
import { GestaoDeUsuarios, type EventoNaTela, type UsuarioNaTela } from '@/components/admin/usuarios'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { pode, ehPapel } from '@/lib/permissoes'
import { chaveDoNome, PESSOAS_DA_EQUIPE } from '@/lib/equipe'
import { emailConfigurado } from '@/lib/newsletter/resend'
import { tituloDaArea } from '@/lib/navegacao'
import { nomesDosSetores } from '@/lib/setores'
import { configDoWhatsapp } from '@/lib/whatsapp/servidor'
import { formatarNumero, numeroCanonico } from '@/lib/whatsapp/regras'
import { lerMarcaDoConvite } from '@/lib/contas/convite'

export const metadata = { title: tituloDaArea('/usuarios') }

type Perfil = {
  id: string; username: string; full_name: string; job_title: string | null; initials: string | null
  color: string | null; avatar_path: string | null; active: boolean; trocar_senha?: boolean; desativado_em?: string | null
  email?: string | null; email_confirmado_em?: string | null
}

export default async function UsuariosPage() {
  const context = await requireWorkspace()
  if (!pode(context.role, 'usuarios.gerenciar')) {
    return <div><PageHeader title="Usuários e permissões" /><Card className="flex items-start gap-3 p-6"><ShieldAlert className="mt-0.5 size-5 text-muted-foreground" /><div><p className="font-medium">Área restrita a administradores</p><p className="mt-1 text-sm text-muted-foreground">Para criar um acesso, mudar um papel ou redefinir uma senha, fale com um administrador do espaço.</p></div></Card></div>
  }

  const supabase = await createClient()
  const admin = createAdminClient()
  const workspaceId = context.workspace.id

  const [{ data: membros }, contas, auditoria, setores, whatsapp] = await Promise.all([
    // profiles(*) e não a lista de colunas: a tela continua abrindo se o
    // deploy chegar antes da migração que criou trocar_senha/desativado_em.
    supabase.from('workspace_members').select('user_id, role, coordination, created_at, profiles(*)').eq('workspace_id', workspaceId).order('created_at'),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    pode(context.role, 'usuarios.auditoria')
      ? supabase.from('auditoria_de_acesso').select('id, ator_id, alvo_id, acao, detalhes, criado_em').eq('workspace_id', workspaceId).order('criado_em', { ascending: false }).limit(60)
      : Promise.resolve({ data: [] as never[], error: null }),
    nomesDosSetores(supabase, workspaceId),
    configDoWhatsapp(workspaceId),
  ])

  const ultimoAcesso = new Map((contas.data?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]))
  const aparelhos = new Map((contas.data?.users ?? []).map((u) => [u.id, (u.factors ?? []).filter((f) => f.status === 'verified').length]))

  // Quem nunca entrou pode receber o convite de primeiro acesso: o WhatsApp vem
  // sugerido do último convite ou, sem ele, do celular pessoal da ficha do RH.
  const nuncaEntraram = (membros ?? []).map((m) => m.user_id as string).filter((id) => !ultimoAcesso.get(id))
  const [{ data: links }, { data: fichas }] = nuncaEntraram.length ? await Promise.all([
    admin.from('tokens_de_conta').select('user_id, email, criado_em').eq('finalidade', 'definir_senha').in('user_id', nuncaEntraram).order('criado_em', { ascending: false }),
    admin.from('equipe_membros').select('user_id, equipe_pessoais(telefone_pessoal)').eq('workspace_id', workspaceId).in('user_id', nuncaEntraram),
  ]) : [{ data: [] }, { data: [] }]
  const whatsappSugerido = new Map<string, string>()
  for (const f of fichas ?? []) {
    const pessoais = (Array.isArray(f.equipe_pessoais) ? f.equipe_pessoais[0] : f.equipe_pessoais) as { telefone_pessoal: string | null } | null
    const numero = numeroCanonico(pessoais?.telefone_pessoal ?? '')
    if (numero) whatsappSugerido.set(f.user_id as string, formatarNumero(numero))
  }
  const conviteDe = new Map<string, { whatsapp: string | null; porEmail: boolean }>()
  for (const l of links ?? []) {
    if (conviteDe.has(l.user_id as string)) continue
    const canal = lerMarcaDoConvite((l.email as string | null) ?? null)
    conviteDe.set(l.user_id as string, { whatsapp: canal.numero ? formatarNumero(canal.numero) : null, porEmail: canal.porEmail })
    if (canal.numero) whatsappSugerido.set(l.user_id as string, formatarNumero(canal.numero))
  }

  const usuarios: UsuarioNaTela[] = (membros ?? []).flatMap((m) => {
    const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as Perfil | null
    if (!p || !ehPapel(m.role)) return []
    return [{
      id: p.id, usuario: p.username, nome: p.full_name, cargo: p.job_title ?? '', iniciais: p.initials ?? '', cor: p.color, avatar: p.avatar_path,
      papel: m.role, coordenacao: m.coordination ?? '', ativo: p.active !== false, trocarSenha: Boolean(p.trocar_senha),
      desativadoEm: p.desativado_em ?? null, criadoEm: m.created_at, ultimoAcesso: ultimoAcesso.get(p.id) ?? null, souEu: p.id === context.user.id,
      aparelhos: aparelhos.get(p.id) ?? 0,
      email: p.email ?? null, emailConfirmado: Boolean(p.email && p.email_confirmado_em),
      ultimoConvite: conviteDe.get(p.id) ?? null, whatsappSugerido: whatsappSugerido.get(p.id) ?? null,
    }]
  }).sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR'))

  // Quem está na lista oficial da equipe e ainda não tem conta. Casa pelo
  // nome (sem acento/caixa) ou pelo usuário sugerido.
  const nomes = new Set(usuarios.map((u) => chaveDoNome(u.nome)))
  const logins = new Set(usuarios.map((u) => u.usuario))
  const semAcesso = PESSOAS_DA_EQUIPE.filter((p) => !nomes.has(chaveDoNome(p.nome)) && !logins.has(p.usuario))

  const nomeDe = new Map(usuarios.map((u) => [u.id, u.nome]))
  const eventos: EventoNaTela[] = (auditoria.data ?? []).map((e) => ({
    id: e.id, acao: e.acao, detalhes: (e.detalhes ?? {}) as Record<string, unknown>, quando: e.criado_em,
    ator: e.ator_id ? nomeDe.get(e.ator_id) ?? 'Conta removida' : 'Sistema', alvo: e.alvo_id ? nomeDe.get(e.alvo_id) ?? 'Conta removida' : null,
  }))

  return (
    <div>
      <PageHeader title="Usuários e permissões" description={`Quem acessa o espaço ${context.workspace.name}, com qual papel, e o que cada papel pode fazer.`} />
      <GestaoDeUsuarios usuarios={usuarios} semAcesso={semAcesso} eventos={eventos} auditoriaDisponivel={!auditoria.error} verificacaoObrigatoriaPara={context.verificacaoObrigatoriaPara} envioConfigurado={emailConfigurado()} whatsappConfigurado={Boolean(whatsapp)} setores={setores} />
    </div>
  )
}
