import { sessaoDoMembro } from '@/lib/membro/sessao'
import { certificadosDoMembro } from '@/lib/membro/cursos'
import { gerarPdfDoCertificado } from '@/lib/cursos/certificado-pdf'
import { CODIGO_DE_CERTIFICADO } from '@/lib/cursos/regras'
import { urlBase } from '@/lib/newsletter/contexto'

export const dynamic = 'force-dynamic'

/** /membro/certificados/ABCD-2345/pdf — o PDF do certificado, só para o dono. */
export async function GET(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const m = await sessaoDoMembro()
  if (!m) return Response.redirect(new URL('/membro/entrar', request.url), 303)
  const { codigo } = await params
  if (!CODIGO_DE_CERTIFICADO.test(codigo)) return new Response('Certificado não encontrado.', { status: 404 })
  const c = (await certificadosDoMembro(m)).find((x) => x.codigo === codigo)
  if (!c) return new Response('Certificado não encontrado.', { status: 404 })
  const pdf = await gerarPdfDoCertificado({
    nome: c.nome, curso: c.curso_titulo, cargaHoraria: c.carga_horaria, nota: c.nota, emitidoEm: c.emitido_em, validoAte: c.valido_ate,
    codigo: c.codigo, urlDeVerificacao: `${urlBase()}/certificado/${c.codigo}`,
  })
  const nome = `certificado-${c.codigo}.pdf`
  return new Response(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nome}"`, 'Cache-Control': 'private, no-store' } })
}
