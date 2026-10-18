import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'
import { notificar } from '@/lib/notificacoes/servidor'
import { contextoDoPatrimonio } from './acesso'
import { quemOperaOPatrimonio } from './destinatarios'
import { km, placaLegivel, type RetornoDaViagem } from './frota'

/** Bens do patrimônio que podem virar veículo: não baixados e ainda sem veículo (mais o atual, na edição). Veículos primeiro. */
export async function bensSemVeiculo(atual: string | null): Promise<{ id: string; nome: string }[]> {
  const { context, supabase } = await contextoDoPatrimonio()
  const ws = context.workspace.id
  const [{ data: bens }, { data: usados }, { data: cats }] = await Promise.all([
    supabase.from('pat_bens').select('id,plaqueta,nome,categoria_id').eq('workspace_id', ws).neq('situacao', 'baixado').order('numero').limit(10000),
    supabase.from('frota_veiculos').select('bem_id').eq('workspace_id', ws).not('bem_id', 'is', null),
    supabase.from('pat_categorias').select('id').eq('workspace_id', ws).ilike('nome', 'Veículos%'),
  ])
  const ocupados = new Set((usados ?? []).map((u) => u.bem_id as string).filter((b) => b !== atual))
  const deVeiculo = new Set((cats ?? []).map((c) => c.id as string))
  return (bens ?? []).filter((b) => !ocupados.has(b.id as string))
    .sort((a, b) => Number(deVeiculo.has(b.categoria_id as string)) - Number(deVeiculo.has(a.categoria_id as string)))
    .map((b) => ({ id: b.id as string, nome: `${b.plaqueta} · ${b.nome}` }))
}

/**
 * Um plano de manutenção venceu por km na viagem que acabou de voltar: avisa quem opera a frota (o mesmo
 * aviso para o "Retorno" da tela e para o retorno registrado pelo WhatsApp). Nunca lança (notificar não lança).
 */
export async function avisarManutencaoVencida(admin: ReturnType<typeof createAdminClient>, p: { workspaceId: string; veiculoId: string; atorId: string; planos: RetornoDaViagem['planos_vencidos'] }) {
  if (!p.planos.length) return
  const { data: v } = await admin.from('frota_veiculos').select('placa,apelido').eq('id', p.veiculoId).eq('workspace_id', p.workspaceId).maybeSingle()
  await notificar(admin, {
    workspaceId: p.workspaceId, para: await quemOperaOPatrimonio(admin, p.workspaceId), atorId: p.atorId, categoria: 'patrimonio',
    titulo: `Manutenção vencida: ${v ? `${v.apelido ? `${v.apelido} · ` : ''}${placaLegivel(v.placa as string)}` : 'veículo'}`,
    mensagem: p.planos.map((x) => `${x.nome} (${km(x.km)})`).join('; '), link: `/patrimonio/frota/${p.veiculoId}`, botao: 'Ver o veículo',
  })
}
