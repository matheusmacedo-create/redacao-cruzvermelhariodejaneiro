import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { agoraEmBrasilia } from '@/lib/agenda/datas'
import { situacaoDaValidade } from '@/lib/patrimonio/estoque'
import { MATERIAIS_NO_SALDO, TEXTO_PEDE_MATERIAL, acharNoEstoque, textoDoSaldo, type MaterialNoSaldo } from './regras'
import { nivelNoPatrimonio } from './frota'
import type { Pessoa } from './acoes'

/**
 * O saldo do Estoque de materiais pelo WhatsApp: "estoque luva". Só leitura,
 * para quem vê o Estoque (o nível "ver" ou mais no Patrimônio, a permissão da
 * tela; a equipe da Escola não abre a área) — vale com a verificação em duas
 * etapas. Acha o material pelo código ou pelo nome (acharNoEstoque, em
 * regras.ts) entre os ativos e responde com o saldo, o mínimo, onde está (os
 * lotes com saldo, somados por local) e a validade mais próxima. As doações em
 * espécie entram no mesmo estoque, então a consulta vale para elas. Valor do
 * estoque, entrada, saída, transferência e ajuste ficam na tela.
 */

type Admin = ReturnType<typeof createAdminClient>

/** O "estoque <material>". null para quem não vê o Estoque (o bot segue como "desconhecido"). */
export async function saldoNoEstoque(admin: Admin, workspaceId: string, pessoa: Pessoa, busca: string, base: string): Promise<string | null> {
  if (await nivelNoPatrimonio(admin, workspaceId, pessoa) < 1) return null
  const termo = busca.replace(/\s+/g, ' ').trim()
  if (termo.length < 2) return TEXTO_PEDE_MATERIAL
  const naTela = `${base}/patrimonio/estoque`
  try {
    const { data: itens, error } = await admin.from('est_itens').select('id, codigo, nome, unidade, estoque_minimo, saldo, aviso_validade_dias')
      .eq('workspace_id', workspaceId).eq('ativo', true).order('nome').limit(5000)
    if (error) return `Não consegui ler o estoque agora. Veja em ${naTela}`
    const achados = acharNoEstoque((itens ?? []).map((i) => ({ ...i, nome: i.nome as string, codigo: i.codigo as string })), termo)
    const mostrados = achados.slice(0, MATERIAIS_NO_SALDO)
    const ids = mostrados.map((i) => i.id as string)
    const [{ data: lotes }, { data: locais }] = ids.length
      ? await Promise.all([
        admin.from('est_saldos').select('item_id, local_id, validade, quantidade').eq('workspace_id', workspaceId).in('item_id', ids).gt('quantidade', 0).limit(2000),
        admin.from('pat_locais').select('id, nome').eq('workspace_id', workspaceId),
      ])
      : [{ data: [] }, { data: [] }]
    const nomeDoLocal = new Map((locais ?? []).map((l) => [l.id as string, l.nome as string]))
    const hoje = agoraEmBrasilia().dia
    const materiais: MaterialNoSaldo[] = mostrados.map((i) => {
      const doItem = (lotes ?? []).filter((l) => l.item_id === i.id).map((l) => ({ local: l.local_id as string, validade: (l.validade as string | null) ?? null, quantidade: Number(l.quantidade) }))
      const porLocal = new Map<string, number>()
      for (const l of doItem) porLocal.set(l.local, (porLocal.get(l.local) ?? 0) + l.quantidade)
      const aviso = Number(i.aviso_validade_dias ?? 30)
      const validos = doItem.filter((l) => l.validade && situacaoDaValidade(l.validade, hoje, aviso) !== 'vencido').map((l) => l.validade as string).sort()
      const vencido = doItem.filter((l) => l.validade && situacaoDaValidade(l.validade, hoje, aviso) === 'vencido').reduce((s, l) => s + l.quantidade, 0)
      return {
        id: i.id as string, nome: i.nome, codigo: i.codigo, unidade: i.unidade as string, saldo: Number(i.saldo), minimo: Number(i.estoque_minimo),
        locais: [...porLocal.entries()].map(([local, quantidade]) => ({ nome: nomeDoLocal.get(local) ?? 'Local', quantidade })).sort((a, b) => b.quantidade - a.quantidade),
        validade: validos[0] ?? null, vencido: Math.round(vencido * 1000) / 1000,
      }
    })
    return textoDoSaldo({ busca: termo, materiais, total: achados.length, urlBase: base })
  } catch (causa) {
    console.error('[whatsapp] saldo do estoque não lido:', causa instanceof Error ? causa.message : causa)
    return `Não consegui ler o estoque agora. Veja em ${naTela}`
  }
}
