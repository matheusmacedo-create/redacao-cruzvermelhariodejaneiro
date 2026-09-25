import { ShieldAlert, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Card } from '@/components/ui/card'
import { PainelDaTrilha } from '@/components/app/trilha/painel'
import { lerPainel, type SituacaoDaChave } from '@/components/app/trilha/dados'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { pode } from '@/lib/permissoes'
import { tituloDaArea } from '@/lib/navegacao'
import { obterChaveDaTrilha } from '@/lib/auditoria/chave'

export const metadata = { title: tituloDaArea('/trilha-publica') }

// As rodadas manuais rodam como server actions desta página. "Fechar e
// carimbar o lote de ontem" fala com os calendários do OpenTimestamps, com a
// autoridade de carimbo e com o FTP do site: passa do tempo padrão.
export const maxDuration = 60

const TITULO = 'Trilha pública'
const DESCRICAO = 'O registro verificável do que a filial publica e emite — matérias, comunicados, ofícios, certificados e o portal de transparência. Cada item ganha um código e um hash; todo dia um lote é fechado, assinado e ancorado no Bitcoin, para qualquer pessoa conferir sem depender da Redação.'

/**
 * A situação da chave de assinatura, lida aqui no servidor. Para a tela vai no
 * máximo a impressão digital — nunca a chave, nunca a variável, nem a
 * mensagem do OpenSSL (que não precisa sair do servidor para dizer "inválida").
 */
async function situacaoDaChave(): Promise<SituacaoDaChave> {
  try {
    const achada = await obterChaveDaTrilha()
    return achada ? { estado: 'configurada', id: achada.chave.id, origem: achada.origem } : { estado: 'ausente' }
  } catch (causa) {
    return { estado: 'invalida', motivo: causa instanceof Error && causa.message.includes('Ed25519') ? 'tipo' : 'formato' }
  }
}

function Aviso({ titulo, texto, restrito }: { titulo: string; texto: string; restrito?: boolean }) {
  const Icone = restrito ? ShieldAlert : TriangleAlert
  return (
    <div>
      <PageHeader title={TITULO} />
      <Card className="flex items-start gap-3 p-6">
        <Icone className="mt-0.5 size-5 text-muted-foreground" aria-hidden="true" />
        <div><p className="font-medium">{titulo}</p><p className="mt-1 text-sm text-muted-foreground">{texto}</p></div>
      </Card>
    </div>
  )
}

export default async function TrilhaPublicaPage() {
  const context = await requireWorkspace()
  if (!pode(context.role, 'trilha.ver')) {
    return <Aviso restrito titulo="Área restrita a administradores" texto="Os registros verificáveis, os lotes diários e os carimbos ficam com a administração. Para conferir um documento ou saber o código dele, fale com um administrador do espaço." />
  }

  // O cliente da própria pessoa: auditoria_painel confere de novo, no banco, que ela é admin.
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('auditoria_painel', { p_workspace_id: context.workspace.id })
  if (error) {
    // PGRST202: a API do banco não conhece a função — a migração da trilha ainda não foi aplicada.
    const semMigracao = error.code === 'PGRST202' || error.code === '42883'
    if (!semMigracao && error.code !== 'P0001') console.error('[trilha] painel indisponível:', error.code, error.message)
    return (
      <Aviso
        titulo={semMigracao ? 'A trilha ainda não existe neste banco' : 'Não foi possível abrir a trilha agora'}
        texto={semMigracao ? 'A migração da trilha (supabase/migrations/…_cvrj_auditoria.sql) precisa ser aplicada no Supabase antes desta tela funcionar.'
          : error.code === 'P0001' && error.message ? error.message : 'O banco recusou ou não respondeu à consulta. Tente de novo em instantes; se continuar, o motivo está no log do servidor.'}
      />
    )
  }

  return (
    <div>
      <PageHeader title={TITULO} description={DESCRICAO} />
      <PainelDaTrilha
        painel={lerPainel(data)}
        chave={await situacaoDaChave()}
        aberta={process.env.AUDITORIA_ABERTA?.trim() === '1'}
        geradoEm={new Date().toISOString()}
      />
    </div>
  )
}
