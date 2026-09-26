import { PageHeader } from '@/components/app/page-header'
import { DirectDasRedes } from '@/components/app/atendimento/direct'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { tituloDaArea } from '@/lib/navegacao'
import type { Registro } from '@/lib/atendimento/situacao'

export const metadata = { title: tituloDaArea('/direct') }

/**
 * Direct das redes: o atendimento ao público nas redes sociais — as mensagens
 * do Direct e os comentários nas publicações. Só isso: e-mail mora em "E-mail
 * do setor", o que a equipe manda em "Envios da equipe", conversa interna no
 * Chat.
 *
 * As mensagens vêm do conector depois de a tela abrir (app/actions/atendimento
 * carregarFila); daqui sai só a situação de cada item, que é da equipe toda.
 */
export default async function DirectPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()

  // Sem a migração do Direct, a tela funciona igual; só não mostra quem respondeu.
  const { data, error } = await supabase.from('direct_atendimentos')
    .select('chave,situacao,por,em,profiles:por(full_name,username)')
    .eq('workspace_id', context.workspace.id).order('em', { ascending: false }).limit(3000)

  const registros: Record<string, Registro> = {}
  for (const r of data ?? []) {
    const perfil = (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) as { full_name?: string; username?: string } | null
    registros[r.chave as string] = { situacao: r.situacao as Registro['situacao'], por: r.por as string | null, nome: perfil?.full_name || perfil?.username || null, em: r.em as string }
  }

  return (
    <div>
      <PageHeader title="Direct das redes" description="As mensagens e os comentários do público nas redes sociais, e quem da equipe já atendeu cada um." />
      <DirectDasRedes registrosIniciais={registros} situacaoGuardada={!error} />
    </div>
  )
}
