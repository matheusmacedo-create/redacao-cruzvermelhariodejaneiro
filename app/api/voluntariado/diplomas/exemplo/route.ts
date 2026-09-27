import { nivelDeParticipantesSemRedirecionar } from '@/lib/participantes/acesso'
import { assinaturasDaFilial, urlDeVerificacaoDoDiploma } from '@/lib/cursos/diplomas'
import { assinaturasDoDiploma } from '@/lib/cursos/assinaturas'
import { gerarPdfDoDiploma } from '@/lib/cursos/diploma-pdf'
import { logoOficial } from '@/lib/pdf/logo'

export const dynamic = 'force-dynamic'

/**
 * Um diploma de exemplo com as assinaturas que a filial escolheu, para conferir
 * como fica antes da cerimônia. O código é de mentira e não passa na verificação.
 */
export async function GET() {
  const equipe = await nivelDeParticipantesSemRedirecionar().catch(() => null)
  if (!equipe || equipe.nivel < 1) return new Response('Sem acesso.', { status: 403 })
  const [daFilial, logo] = await Promise.all([assinaturasDaFilial(equipe.workspaceId).catch(() => null), logoOficial()])
  const pdf = await gerarPdfDoDiploma({
    nome: 'Nome do Voluntário', motivo: 'horas', marcoHoras: 100, texto: null, emitidoEm: new Date().toISOString(),
    codigo: 'XXXX-XXXX', urlDeVerificacao: urlDeVerificacaoDoDiploma('XXXX-XXXX'), logo, assinaturas: assinaturasDoDiploma(null, daFilial),
  })
  return new Response(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="diploma-exemplo.pdf"', 'Cache-Control': 'private, no-store' } })
}
