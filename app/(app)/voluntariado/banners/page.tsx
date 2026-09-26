import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { ordenarBanners } from '@/lib/banners/regras'
import { urlDoBanner } from '@/lib/banners/imagem'
import { PainelDeBanners, type BannerNaEquipe } from '@/components/app/canal/banners'

export const dynamic = 'force-dynamic'

/** Os banners do Início da Área do Voluntário: a comunicação institucional com o voluntariado. */
export default async function BannersDosVoluntarios() {
  const { context, supabase, nivel } = await contextoDeParticipantes()
  if (nivel < 2) notFound()
  const { data } = await supabase.from('membro_banners')
    .select('id,titulo,texto,imagem_caminho,link_url,link_rotulo,inicio,fim,ativo,ordem,created_at')
    .eq('workspace_id', context.workspace.id).limit(200)
  const banners: BannerNaEquipe[] = ordenarBanners((data ?? []) as Omit<BannerNaEquipe, 'imagem'>[])
    .map((b) => ({ ...b, imagem: urlDoBanner(b.imagem_caminho) }))
  return (
    <div className="flex flex-col gap-6">
      <Link href="/voluntariado" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Voluntariado</Link>
      <PageHeader title="Banners da Área do Voluntário" description="Aparecem no alto do Início de todo o voluntariado: campanhas, agradecimentos, chamadas e fotos das ações. Com mais de um no ar, eles se revezam. Programe o período e ligue ou desligue quando quiser." />
      <Card className="p-5">
        <PainelDeBanners banners={banners} hoje={hojeEmSaoPaulo()} />
      </Card>
    </div>
  )
}
