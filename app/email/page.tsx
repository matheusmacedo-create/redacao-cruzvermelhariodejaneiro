import { CaixaDoCorreio, type EnvioNaTela, type Estado } from '@/components/app/correio/correio'
import { CabecalhoDoEmail } from '@/components/email-provisorio/cabecalho'
import { atualizarEmail, enviarEmailProvisorio, marcarConversaEmail } from '@/app/actions/email-provisorio'
import { exigirContextoDoEmail } from '@/lib/email-provisorio/sessao'
import { createAdminClient } from '@/lib/supabase/admin'
import { sincronizarSeAntigo } from '@/lib/correio/sincronizar'
import { abrirConversa, conversasDaPasta, naoLidasPorCaixa, type ConversaNaLista } from '@/lib/correio/caixa-de-entrada'
import { ehPasta, type MensagemLida } from '@/lib/correio/leitura'
import { GmailError, semLeitura as faltaLeitura } from '@/lib/google/gmail'

export const metadata = { title: 'E-mail dos setores' }
export const dynamic = 'force-dynamic'

/**
 * O app de e-mail provisório (/email; email.cruzvermelhariodejaneiro.org
 * abre aqui): a mesma caixa do Palácio (/correio), para quem ainda não usa o
 * Palácio. As caixas vêm de lib/email-provisorio/sessao.ts; a leitura, o
 * envio e as conferências de cada conversa são as mesmas do Palácio.
 */
export default async function EmailPage({ searchParams }: {
  searchParams: Promise<{ caixa?: string; pasta?: string; q?: string; conversa?: string; pagina?: string; escrever?: string }>
}) {
  const ctx = await exigirContextoDoEmail()
  if (!ctx) {
    return (
      <main className="min-h-screen bg-background">
        <CabecalhoDoEmail nome="" responsavel={false} atual="caixa" />
        <p className="mx-auto mt-16 max-w-md px-6 text-center text-muted-foreground">
          Sua conta ainda não tem nenhuma caixa. Peça ao responsável do seu setor para liberar o acesso.
        </p>
      </main>
    )
  }
  const sp = await searchParams
  const ws = ctx.workspaceId
  await sincronizarSeAntigo(ws)

  const admin = createAdminClient()
  const emails = ctx.caixas.map((c) => c.email)
  const [{ data: envios }, { data: conexao }, { data: setores }] = await Promise.all([
    emails.length
      ? admin.from('emails_enviados').select('id,de,para,cc,assunto,corpo,estado,erro,created_at,setor_id,profiles:autor_id(full_name,username)')
        .eq('workspace_id', ws).in('de', emails).order('created_at', { ascending: false }).limit(200)
      : Promise.resolve({ data: [] as never[] }),
    admin.from('google_conexao').select('estado').eq('workspace_id', ws).maybeSingle(),
    admin.from('setores').select('id,nome').eq('workspace_id', ws),
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

  const caixas = ctx.caixas
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
        naoLidasPorCaixa(ws, caixas),
        pasta ? conversasDaPasta(ws, caixa, pasta, estado.q, estado.pagina) : Promise.resolve({ conversas: [], proxima: null }),
        estado.conversa ? abrirConversa(ws, caixa, estado.conversa) : Promise.resolve(null),
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
    <main className="min-h-screen bg-background">
      <CabecalhoDoEmail nome={ctx.nome} responsavel={ctx.responsavelDe.size > 0} atual="caixa" />
      <div className="p-3 sm:p-4">
        <CaixaDoCorreio
          ambiente={{
            base: '/email', anexo: '/api/email/anexo', nomeDoRegistro: 'Registro de envios',
            semCaixa: 'Peça ao responsável do seu setor para liberar o acesso.', semConta: 'Avise o administrador do Palácio.',
            atualizar: atualizarEmail, enviar: enviarEmailProvisorio, marcar: marcarConversaEmail,
          }}
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
          ehAdmin={false}
          hoje={new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())}
        />
      </div>
    </main>
  )
}
