import { ShieldAlert, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Card } from '@/components/ui/card'
import { PainelDosCanais } from '@/components/app/canais/painel'
import type { VersaoDosCanais } from '@/components/app/canais/lista'
import { codigosDaTrilha, nomesDasPessoas, registrosPorVersao } from '@/components/app/transparencia/servidor'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { pode } from '@/lib/permissoes'
import { tituloDaArea } from '@/lib/navegacao'
import { origemDoSite } from '@/lib/auditoria/consulta'
import { portalAberto } from '@/lib/transparencia/paginas'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'
import { ROTULO_DO_CANAL, TIPOS_DE_CANAL, type Canal, type TipoDeCanal } from '@/lib/transparencia/regras'

export const metadata = { title: tituloDaArea('/canais-oficiais') }

export const dynamic = 'force-dynamic'

type LinhaDaVersao = { id: string; versao: number; canais: unknown; observacao: string | null; publicado_em: string; publicado_por: string | null }

const ehTipo = (t: unknown): t is TipoDeCanal => typeof t === 'string' && (TIPOS_DE_CANAL as readonly string[]).includes(t)

/** O jsonb gravado, lido com cuidado: versão antiga continua aparecendo mesmo que a regra de hoje seja outra. */
function canaisDa(bruto: unknown): Canal[] {
  if (!Array.isArray(bruto)) return []
  return bruto.map((c) => {
    const item = (c ?? {}) as Record<string, unknown>
    const tipo = ehTipo(item.tipo) ? item.tipo : 'outro'
    const url = typeof item.url === 'string' && item.url.trim() ? item.url.trim() : null
    return { tipo, rotulo: String(item.rotulo ?? '').trim() || ROTULO_DO_CANAL[tipo], valor: String(item.valor ?? ''), url }
  })
}

/**
 * A página de canais oficiais por dentro: a versão no ar, o editor da
 * próxima e as anteriores. Cada versão é a lista inteira e não muda depois
 * de publicada; a trilha pública registra cada uma.
 */
export default async function CanaisOficiaisPage() {
  const context = await requireWorkspace()
  if (!pode(context.role, 'transparencia.gerenciar')) {
    return <div><PageHeader title="Canais oficiais" /><Card className="flex items-start gap-3 p-6"><ShieldAlert className="mt-0.5 size-5 text-muted-foreground" /><div><p className="font-medium">Área restrita a administradores</p><p className="mt-1 text-sm text-muted-foreground">A lista de canais oficiais é mantida pela administração. Se um perfil, telefone ou endereço mudou, fale com um administrador do espaço.</p></div></Card></div>
  }

  const supabase = await createClient()
  const workspaceId = context.workspace.id
  const cabecalho = <PageHeader title="Canais oficiais" description="A lista pública dos endereços, telefones e perfis que são mesmo da filial — é por ela que alguém confere se uma mensagem em nome da Cruz Vermelha é verdadeira. Cada publicação é uma versão nova e inteira; a anterior fica na trilha pública como substituída." />

  // Leitura pelo cliente da pessoa: o RLS da tabela só deixa admin ler.
  const { data, error } = await supabase.from('canais_oficiais_versoes')
    .select('id,versao,canais,observacao,publicado_em,publicado_por')
    .eq('workspace_id', workspaceId).order('versao', { ascending: false })
  if (error) {
    console.error('[canais-oficiais] leitura:', error.message)
    return <div>{cabecalho}<Card className="flex items-start gap-3 p-6"><TriangleAlert className="mt-0.5 size-5 text-warning-foreground" /><div><p className="font-medium">Não foi possível ler a lista agora</p><p className="mt-1 text-sm text-muted-foreground">Tente de novo em instantes. Se persistir, confira se a migração do portal (cvrj_transparencia, em supabase/migrations) já foi aplicada neste banco.</p></div></Card></div>
  }
  const linhas = (data ?? []) as LinhaDaVersao[]

  // Depois da permissão conferida: a função da trilha só aceita a chave de serviço.
  // A origem dos canais é o próprio espaço: uma lista por espaço, uma versão na trilha por publicação.
  const [codigos, nomes] = await Promise.all([
    linhas.length ? codigosDaTrilha('canais', [workspaceId]) : Promise.resolve([]),
    nomesDasPessoas(supabase, linhas.map((l) => l.publicado_por)),
  ])

  const registros = registrosPorVersao(linhas, codigos)
  const versoes: VersaoDosCanais[] = linhas.map((l) => {
    const registro = registros.get(l.id) ?? null
    return {
      id: l.id, versao: l.versao, canais: canaisDa(l.canais), observacao: l.observacao, publicadoEm: l.publicado_em,
      publicadoPor: l.publicado_por ? nomes.get(l.publicado_por) ?? null : null,
      codigo: registro?.codigo ?? null, hash: registro?.hash ?? null,
    }
  })

  const origem = origemDoSite()
  // Só para a primeira versão: os dados oficiais que o rodapé do site já mostra, para conferir e publicar.
  const sugestao: Canal[] = versoes.length ? [] : [
    { tipo: 'site', rotulo: ROTULO_DO_CANAL.site, valor: new URL(origem).host, url: `${origem}/` },
    { tipo: 'email', rotulo: ROTULO_DO_CANAL.email, valor: DADOS_DA_FILIAL.email, url: null },
    { tipo: 'telefone', rotulo: ROTULO_DO_CANAL.telefone, valor: DADOS_DA_FILIAL.telefone, url: null },
    { tipo: 'endereco', rotulo: ROTULO_DO_CANAL.endereco, valor: DADOS_DA_FILIAL.endereco, url: null },
    { tipo: 'cnpj', rotulo: ROTULO_DO_CANAL.cnpj, valor: DADOS_DA_FILIAL.cnpj, url: null },
  ]

  return (
    <div>
      {cabecalho}
      <PainelDosCanais
        versoes={versoes}
        trilhaDisponivel={codigos !== null}
        aberto={portalAberto()}
        endereco={`${origem}/canais-oficiais/`}
        sugestao={sugestao}
      />
    </div>
  )
}
