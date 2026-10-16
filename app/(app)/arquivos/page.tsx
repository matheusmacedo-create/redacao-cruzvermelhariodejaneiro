import { FolderX, PlugZap } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Card } from '@/components/ui/card'
import { CentralDeArquivos } from '@/components/app/arquivos/central'
import { LigacaoDoDrive } from '@/components/app/arquivos/ligacao'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { tituloDaArea } from '@/lib/navegacao'
import { conexaoDoDrive, setoresQueAbro } from '@/lib/arquivos/servidor'

export const metadata = { title: tituloDaArea('/arquivos') }

export const dynamic = 'force-dynamic'

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

/**
 * Os Arquivos do setor: as pastas de cada setor no Google Drive da filial,
 * abertas pelo Palácio. A pessoa vê os setores de que faz parte
 * (setor_membros); quem tem arquivos.todos_os_setores vê todos. A pasta e o
 * conteúdo vêm do Drive na hora, pelas actions — nada fica guardado aqui.
 */
export default async function ArquivosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const contexto = await requireWorkspace()
  const q = await searchParams
  const [conexao, setores] = await Promise.all([conexaoDoDrive(contexto.workspace.id), setoresQueAbro(contexto)])
  const podeConfigurar = pode(contexto.role, 'arquivos.configurar')
  const pronta = Boolean(conexao && conexao.estado === 'ativa' && conexao.raiz_id)

  const status = um(q.drive)
  const motivo = um(q.motivo).slice(0, 300)
  const volta = status === 'ok' ? { tipo: 'ok' as const, texto: motivo || 'Google Drive conectado.' }
    : status === 'erro' ? { tipo: 'erro' as const, texto: motivo || 'Não foi possível conectar o Google Drive.' }
      : status === 'restrito' ? { tipo: 'erro' as const, texto: 'Só administradores ligam o Google Drive.' } : null

  const pedido = um(q.setor)
  const setorInicial = setores.find((s) => s.id === pedido)?.id ?? setores[0]?.id ?? ''

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Arquivos do setor" description="As pastas e os arquivos de cada setor, guardados no Google Drive da filial. Você vê as pastas dos setores de que faz parte: crie pastas, envie, abra, baixe e organize sem sair do Palácio." />

      {podeConfigurar && (
        <LigacaoDoDrive volta={volta} conexao={conexao ? { email: conexao.email_conta, expirada: conexao.estado === 'expirada', raizNome: conexao.raiz_nome, conectadaEm: conexao.conectada_em } : null} />
      )}

      {!pronta ? (
        !podeConfigurar && (
          <Card className="flex items-start gap-3 p-6">
            <PlugZap className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
            <div><p className="font-medium">Ainda não ligado</p><p className="mt-1 text-sm text-muted-foreground">Os Arquivos do setor dependem da ligação com o Google Drive da filial, que um administrador faz nesta mesma tela.</p></div>
          </Card>
        )
      ) : setores.length === 0 ? (
        <Card className="flex items-start gap-3 p-6">
          <FolderX className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
          <div><p className="font-medium">Você ainda não faz parte de um setor</p><p className="mt-1 text-sm text-muted-foreground">Cada setor tem a própria pasta. Peça a um administrador para incluir você no seu setor, em Pessoas → Setores.</p></div>
        </Card>
      ) : (
        <CentralDeArquivos key={setorInicial} setores={setores.map((s) => ({ id: s.id, nome: s.nome }))} setorInicial={setorInicial} />
      )}
    </div>
  )
}
