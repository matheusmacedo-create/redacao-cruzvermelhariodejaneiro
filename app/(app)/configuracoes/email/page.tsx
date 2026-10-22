import { CorreioDosSetores } from '@/components/admin/correio-setores'
import { exigirAdministracao } from '@/lib/configuracoes/servidor'
import { createClient } from '@/lib/supabase/server'
import { obterCampos } from '@/lib/integracoes/chaves'
import { GmailError, listarEtiquetas, listarFiltros, urlDeRetorno } from '@/lib/google/gmail'
import { EtiquetasDosSetores, type EtiquetaNaTela, type FiltroNaTela } from '@/components/admin/etiquetas-dos-setores'
import { ContasDoGoogle, type ContaGoogleNaTela, type ConviteNaTela } from '@/components/admin/contas-google'
import { DriveDoGoogle } from '@/components/admin/drive-google'
import { AdsDoGoogle } from '@/components/admin/ads-google'
import { PLANOS_DO_GRANTS, idDaCampanha, idDaConta, linkDaCampanha, resumoDoPlano } from '@/lib/google/ads-regras'
import { campanhasRegistradas } from '@/lib/google/ads'

export const metadata = { title: 'E-mail dos setores — Configurações' }

/** O link já não serve (venceu ou esgotou)? Fora do componente: a regra de pureza do React não aceita Date.now() no corpo. */
function linkVencido(expiraEm: string, usos: number, maxUsos: number): boolean {
  return new Date(expiraEm).getTime() <= Date.now() || usos >= maxUsos
}

export default async function EmailDosSetoresPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; google_admin?: string; google_drive?: string; google_ads?: string; motivo?: string }>
}) {
  const context = await exigirAdministracao()
  const supabase = await createClient()
  const workspaceId = context.workspace.id
  const [{ data: members }, clienteGoogle, conexao, setores, membrosDeSetor, caixas, conexaoAdmin, convites, contasGoogle, conexaoDrive, conexaoAds] = await Promise.all([
    supabase.from('workspace_members').select('user_id,profiles(full_name,username)').eq('workspace_id', workspaceId),
    obterCampos(workspaceId, 'google_oauth'),
    supabase.from('google_conexao').select('email_conta,estado,sincronizada_em').eq('workspace_id', workspaceId).maybeSingle(),
    supabase.from('setores').select('id,nome').eq('workspace_id', workspaceId).order('nome'),
    supabase.from('setor_membros').select('setor_id,user_id').eq('workspace_id', workspaceId),
    supabase.from('caixas_de_email').select('id,email,nome_exibicao,nome_remetente,assinatura_html,setor_id,ativa,no_gmail,principal,rotulo_gmail_id').eq('workspace_id', workspaceId).order('email'),
    supabase.from('google_admin_conexao').select('email_conta,estado,conectada_em').eq('workspace_id', workspaceId).maybeSingle(),
    supabase.from('google_convites').select('id,rotulo,setor_id,expira_em,max_usos,usos,created_at,profiles:criado_por(full_name,username)').eq('workspace_id', workspaceId).is('revogado_em', null).order('created_at', { ascending: false }).limit(30),
    supabase.from('google_contas').select('id,nome,email,setor_id,grupo_email,grupo_ok,created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(100),
    // O Drive (passo 6): com erro, a tabela ainda não existe (a migração do Drive não foi aplicada) e o cartão diz isso.
    supabase.from('google_drive_conexao').select('email_conta,estado,conectada_em,pasta_raiz_link').eq('workspace_id', workspaceId).maybeSingle(),
    // O Google Ads (passo 7): como o Drive, com erro a tabela ainda não existe.
    supabase.from('google_ads_conexao').select('email_conta,estado,conectada_em,customer_id,contas_acessiveis').eq('workspace_id', workspaceId).maybeSingle(),
  ])

  // Etiquetas e filtros vêm do Gmail na hora (passo 4); sem conexão ou com erro, a seção diz o motivo e o resto da tela segue.
  let etiquetas: EtiquetaNaTela[] = []
  let filtros: FiltroNaTela[] = []
  let erroDoGmail: string | null = null
  if (conexao.data?.estado === 'ativa') {
    try {
      [etiquetas, filtros] = await Promise.all([listarEtiquetas(workspaceId), listarFiltros(workspaceId)])
    } catch (causa) {
      erroDoGmail = causa instanceof GmailError ? causa.message : 'Não foi possível ler as etiquetas do Gmail agora.'
    }
  } else {
    erroDoGmail = 'Conecte a conta Google (passo 1) para ligar etiquetas e filtros.'
  }
  const nomeDoSetor = new Map((setores.data ?? []).map((s) => [s.id as string, s.nome as string]))

  const { google, google_admin: googleAdmin, google_drive: googleDrive, google_ads: googleAds, motivo } = await searchParams
  const aviso = google === 'ok'
    ? { tom: 'ok' as const, texto: motivo || 'Conta Google conectada.' }
    : google === 'erro' ? { tom: 'erro' as const, texto: motivo || 'Não foi possível conectar a conta Google.' }
      : google === 'restrito' ? { tom: 'erro' as const, texto: 'Só administradores conectam a conta Google.' } : null
  const avisoDoAdmin = googleAdmin === 'ok'
    ? { tom: 'ok' as const, texto: motivo || 'Conta de administrador conectada.' }
    : googleAdmin === 'erro' ? { tom: 'erro' as const, texto: motivo || 'Não foi possível conectar a conta de administrador.' }
      : googleAdmin === 'restrito' ? { tom: 'erro' as const, texto: 'Só administradores conectam a conta de administrador do Google.' } : null
  const avisoDoDrive = googleDrive === 'ok'
    ? { tom: 'ok' as const, texto: motivo || 'Google Drive conectado.' }
    : googleDrive === 'erro' ? { tom: 'erro' as const, texto: motivo || 'Não foi possível conectar o Google Drive.' }
      : googleDrive === 'restrito' ? { tom: 'erro' as const, texto: 'Só administradores conectam o Google Drive.' } : null
  const avisoDoAds = googleAds === 'ok'
    ? { tom: 'ok' as const, texto: motivo || 'Google Ads conectado.' }
    : googleAds === 'erro' ? { tom: 'erro' as const, texto: motivo || 'Não foi possível conectar o Google Ads.' }
      : googleAds === 'restrito' ? { tom: 'erro' as const, texto: 'Só administradores conectam o Google Ads.' } : null
  const ads = conexaoAds.data
  const contaDoAds = idDaConta((ads?.customer_id as string | null) ?? null)
  // As campanhas que o Palácio já criou nesta conta, por plano (o registro fica em activity_log).
  const registradas = contaDoAds ? await campanhasRegistradas(workspaceId, contaDoAds) : new Map()
  const dolares = (micros: number) => `US$ ${(micros / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
  const planosNaTela = PLANOS_DO_GRANTS.map((pl) => {
    const feita = registradas.get(pl.id)
    const campanhaId = feita ? idDaCampanha(feita.recurso) : null
    return {
      id: pl.id, nome: pl.nome, destino: pl.destino, ...resumoDoPlano(pl), local: pl.local.rotulo,
      orcamentoDiario: dolares(pl.orcamentoDiarioMicros), lanceMaximo: dolares(pl.lanceMaximoMicros),
      campanha: feita ? { link: contaDoAds && campanhaId ? linkDaCampanha(contaDoAds, campanhaId) : null, criadaEm: feita.criadaEm } : null,
    }
  })
  const nomeDe = (p: unknown) => { const x = (Array.isArray(p) ? p[0] : p) as { full_name?: string; username?: string } | null; return x?.full_name || x?.username || '—' }
  const convitesNaTela: ConviteNaTela[] = (convites.data ?? []).map((c) => ({
    id: c.id as string, rotulo: String(c.rotulo ?? ''), setor: c.setor_id ? nomeDoSetor.get(c.setor_id as string) ?? null : null,
    expiraEm: c.expira_em as string, usos: Number(c.usos), maxUsos: Number(c.max_usos), criadoPor: nomeDe(c.profiles),
    vencido: linkVencido(c.expira_em as string, Number(c.usos), Number(c.max_usos)),
  }))
  const contasNaTela: ContaGoogleNaTela[] = (contasGoogle.data ?? []).map((c) => ({
    id: c.id as string, nome: String(c.nome), email: String(c.email), setor: c.setor_id ? nomeDoSetor.get(c.setor_id as string) ?? null : null,
    grupo: (c.grupo_email as string | null) ?? null, grupoOk: Boolean(c.grupo_ok), quando: c.created_at as string,
  }))

  const pessoas = (members ?? []).map((m) => {
    const perfil = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string; username?: string } | null
    return { id: m.user_id as string, nome: perfil?.full_name || perfil?.username || '—' }
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <div className="flex flex-col gap-4">
      <CorreioDosSetores
        aviso={aviso}
        clienteConfigurado={Boolean(clienteGoogle)}
        retorno={urlDeRetorno()}
        conexao={conexao.data ? { email: conexao.data.email_conta, estado: conexao.data.estado, sincronizadaEm: conexao.data.sincronizada_em } : null}
        setores={(setores.data ?? []).map((s) => ({
          id: s.id, nome: s.nome,
          membros: (membrosDeSetor.data ?? []).filter((m) => m.setor_id === s.id).map((m) => m.user_id as string),
        }))}
        pessoas={pessoas}
        caixas={(caixas.data ?? []).map((c) => ({
          id: c.id, email: c.email, nome: c.nome_exibicao, nomeRemetente: c.nome_remetente ?? '', assinatura: c.assinatura_html,
          setorId: c.setor_id, ativa: c.ativa, noGmail: c.no_gmail, principal: c.principal,
        }))}
      />
      <EtiquetasDosSetores
        caixas={(caixas.data ?? []).filter((c) => c.ativa && c.no_gmail && c.setor_id).map((c) => ({
          id: c.id, email: c.email, setor: nomeDoSetor.get(c.setor_id as string) ?? c.email, rotuloId: c.rotulo_gmail_id ?? null,
        }))}
        etiquetas={etiquetas}
        filtros={filtros}
        erro={erroDoGmail}
      />
      <ContasDoGoogle
        aviso={avisoDoAdmin}
        clienteConfigurado={Boolean(clienteGoogle)}
        conexao={conexaoAdmin.data ? { email: conexaoAdmin.data.email_conta, estado: conexaoAdmin.data.estado, conectadaEm: conexaoAdmin.data.conectada_em } : null}
        setores={(setores.data ?? []).map((s) => ({ id: s.id as string, nome: s.nome as string }))}
        convites={convitesNaTela}
        contas={contasNaTela}
      />
      <DriveDoGoogle
        aviso={avisoDoDrive}
        clienteConfigurado={Boolean(clienteGoogle)}
        disponivel={!conexaoDrive.error}
        conexao={conexaoDrive.data ? {
          email: String(conexaoDrive.data.email_conta), estado: conexaoDrive.data.estado === 'expirada' ? 'expirada' : 'ativa',
          conectadaEm: String(conexaoDrive.data.conectada_em), pastaRaizLink: (conexaoDrive.data.pasta_raiz_link as string | null) ?? null,
        } : null}
      />
      <AdsDoGoogle
        aviso={avisoDoAds}
        clienteConfigurado={Boolean(clienteGoogle)}
        disponivel={!conexaoAds.error}
        conexao={ads ? {
          email: String(ads.email_conta), estado: ads.estado === 'expirada' ? 'expirada' : 'ativa', conectadaEm: String(ads.conectada_em),
          contaEscolhida: contaDoAds, contasAcessiveis: ((ads.contas_acessiveis as string[] | null) ?? []),
        } : null}
        planos={planosNaTela}
      />
    </div>
  )
}
