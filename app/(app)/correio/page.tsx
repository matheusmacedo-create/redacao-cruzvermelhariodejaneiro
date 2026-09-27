import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { createClient } from '@/lib/supabase/server'
import { CaixaDoCorreio, type EnvioNaTela, type Estado } from '@/components/app/correio/correio'
import { tituloDaArea } from '@/lib/navegacao'
import { sincronizarSeAntigo } from '@/lib/correio/sincronizar'
import { abrirConversa, caixasVisiveis, conversasDaPasta, naoLidasPorCaixa, type ConversaNaLista } from '@/lib/correio/caixa-de-entrada'
import { ehPasta, type MensagemLida } from '@/lib/correio/leitura'
import { GmailError, semLeitura as faltaLeitura } from '@/lib/google/gmail'

export const metadata = { title: tituloDaArea('/correio') }

export const dynamic = 'force-dynamic'

/**
 * E-mail do setor (/correio): a caixa de cada setor, como num cliente de
 * e-mail — caixa de entrada, enviados, todas, ler, responder, encaminhar e
 * escrever pelo endereço do setor, com a assinatura fixa dele.
 *
 * Tudo vem do Gmail na hora (lib/correio/caixa-de-entrada.ts): nada do
 * conteúdo fica no banco. A pessoa só vê as caixas do setor dela (todas,
 * para admin), e de cada caixa só o que envolve o endereço. O "Registro do
 * Palácio" é o que saiu por aqui, com quem enviou.
 */
export default async function CorreioPage({ searchParams }: {
  searchParams: Promise<{ caixa?: string; pasta?: string; q?: string; conversa?: string; pagina?: string; escrever?: string }>
}) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const workspaceId = context.workspace.id
  const admin = pode(context.role, 'correio.todas_as_caixas')
  const sp = await searchParams
  // Nome e assinatura de cada endereço vêm do Gmail; se a última leitura tem mais de 1 hora, lê de novo antes de mostrar.
  await sincronizarSeAntigo(workspaceId)

  const [caixas, { data: setores }, { data: envios }, { data: conexao }] = await Promise.all([
    caixasVisiveis(context),
    supabase.from('setores').select('id,nome').eq('workspace_id', workspaceId),
    supabase.from('emails_enviados').select('id,de,para,cc,assunto,corpo,estado,erro,created_at,setor_id,autor_id,profiles:autor_id(full_name,username)')
      .eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(200),
    supabase.from('google_conexao').select('estado').eq('workspace_id', workspaceId).maybeSingle(),
  ])
  const nomeDoSetor = new Map((setores ?? []).map((s) => [s.id as string, s.nome as string]))
  const historico: EnvioNaTela[] = (envios ?? []).map((e) => {
    const perfil = (Array.isArray(e.profiles) ? e.profiles[0] : e.profiles) as { full_name?: string; username?: string } | null
    return {
      id: e.id, de: e.de, para: e.para ?? [], cc: e.cc ?? [], assunto: e.assunto, corpo: e.corpo,
      estado: e.estado, erro: e.erro, quando: e.created_at,
      setor: nomeDoSetor.get(e.setor_id as string) ?? '—',
      autor: perfil?.full_name || perfil?.username || '—',
    }
  })
  const situacao = !conexao ? 'desconectado' as const : conexao.estado === 'expirada' ? 'expirada' as const : 'ok' as const

  const caixa = caixas.find((c) => c.id === sp.caixa) ?? caixas[0]
  const estado: Estado = {
    caixa: caixa?.id ?? '',
    pasta: sp.pasta === 'registro' ? 'registro' : ehPasta(sp.pasta) ? sp.pasta : 'entrada',
    q: (sp.q ?? '').slice(0, 200),
    conversa: sp.conversa && /^[0-9a-f]{6,32}$/i.test(sp.conversa) ? sp.conversa : null,
    pagina: sp.pagina && /^[A-Za-z0-9_-]{1,200}$/.test(sp.pagina) ? sp.pagina : null,
    escrever: sp.escrever === '1',
  }

  let naoLidas: Record<string, number> = {}
  let lista: ConversaNaLista[] = []
  let proxima: string | null = null
  let conversa: MensagemLida[] | null = null
  let semLeitura = false
  let erroDoGmail: string | null = null
  if (situacao === 'ok' && caixa) {
    try {
      const pasta = estado.pasta === 'registro' ? null : estado.pasta
      const [contas, pagina, aberta] = await Promise.all([
        naoLidasPorCaixa(workspaceId, caixas),
        pasta ? conversasDaPasta(workspaceId, caixa, pasta, estado.q, estado.pagina) : Promise.resolve({ conversas: [], proxima: null }),
        estado.conversa ? abrirConversa(workspaceId, caixa, estado.conversa) : Promise.resolve(null),
      ])
      naoLidas = contas
      lista = pagina.conversas
      proxima = pagina.proxima
      conversa = aberta
    } catch (causa) {
      semLeitura = faltaLeitura(causa)
      erroDoGmail = causa instanceof GmailError ? causa.message : 'Não foi possível ler o Gmail agora. Tente de novo em instantes.'
    }
  }

  return (
    <div>
      <PageHeader
        title="E-mail do setor"
        description="A caixa do seu setor: receba, leia, responda e envie pelo endereço dele, sempre com a assinatura oficial."
      />
      <CaixaDoCorreio
        caixas={caixas}
        estado={estado}
        naoLidas={naoLidas}
        lista={lista}
        proxima={proxima}
        conversa={conversa}
        historico={historico}
        situacao={situacao}
        semLeitura={semLeitura}
        erroDoGmail={erroDoGmail}
        ehAdmin={admin}
        hoje={new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())}
      />
    </div>
  )
}
