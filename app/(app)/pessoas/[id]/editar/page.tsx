import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/app/page-header'
import { EditorDePerfil } from '@/components/app/pessoas/editor-de-perfil'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { ehCapa, lerContatos } from '@/lib/pessoas/perfil'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Editar perfil' }

/** Só o próprio perfil é editável — nem administrador edita o de outra pessoa. */
export default async function EditarPerfilPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const context = await requireWorkspace()
  if (id !== context.user.id) redirect(`/pessoas/${id}`)

  // O RLS deixa cada um ler o próprio perfil social.
  const supabase = await createClient()
  const { data: s } = await supabase.from('perfil_social').select('*').eq('user_id', context.user.id).maybeSingle()

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Editar meu perfil"
        description="O que a equipe vê quando abre o seu perfil. Nome, foto, cargo e setor vêm do seu cadastro (Meu perfil) e da ficha na Equipe."
        breadcrumbs={[{ label: 'Diretório', href: '/pessoas' }, { label: 'Meu perfil', href: `/pessoas/${id}` }, { label: 'Editar' }]}
      />
      <EditorDePerfil inicial={{
        id,
        bio: String(s?.bio ?? ''),
        pronomes: String(s?.pronomes ?? ''),
        capa: ehCapa(s?.capa) ? s.capa : 'vermelho',
        disponibilidade: String(s?.disponibilidade ?? ''),
        habilidades: Array.isArray(s?.habilidades) ? s.habilidades : [],
        contatos: lerContatos(s?.contatos),
        mostrarMetricas: s?.mostrar_metricas !== false,
      }} />
    </div>
  )
}
