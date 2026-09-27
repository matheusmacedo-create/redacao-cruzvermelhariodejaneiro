import { sessaoDoMembro } from '@/lib/membro/sessao'
import { urlDaEntrada } from '@/lib/membro/regras'
import { certificadosDoMembro } from '@/lib/membro/cursos'
import { gerarPdfDoCertificado } from '@/lib/cursos/certificado-pdf'
import { CODIGO_DE_CERTIFICADO } from '@/lib/cursos/regras'
import { urlBase } from '@/lib/newsletter/contexto'
import { logoOficial } from '@/lib/pdf/logo'

export const dynamic = 'force-dynamic'

// A logo oficial: do disco (lib/pdf/logo.ts); se o arquivo não veio no pacote, do próprio site.
let logoDoSite: Promise<Uint8Array | null> | null = null
async function logoDoCertificado(origem: string) {
  const doDisco = await logoOficial()
  if (doDisco) return doDisco
  logoDoSite ??= fetch(new URL('/images/logo-cvrj.png', origem)).then(async (r) => (r.ok ? new Uint8Array(await r.arrayBuffer()) : null)).catch(() => null)
  return logoDoSite
}

/** /membro/certificados/ABCD-2345/pdf — o PDF do certificado, só para o dono. */
export async function GET(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const m = await sessaoDoMembro()
  // Sem sessão, volta depois para a lista (e não para o PDF): no Android o PDF
  // baixa em vez de abrir, e a tela de entrada ficaria parada em "Entrando…".
  if (!m) return Response.redirect(new URL(urlDaEntrada('/membro/certificados'), request.url), 303)
  const { codigo } = await params
  if (!CODIGO_DE_CERTIFICADO.test(codigo)) return new Response('Certificado não encontrado.', { status: 404 })
  const c = (await certificadosDoMembro(m)).find((x) => x.codigo === codigo)
  if (!c) return new Response('Certificado não encontrado.', { status: 404 })
  const pdf = await gerarPdfDoCertificado({
    nome: c.nome, curso: c.curso_titulo, cargaHoraria: c.carga_horaria, nota: c.nota, emitidoEm: c.emitido_em, validoAte: c.valido_ate,
    codigo: c.codigo, urlDeVerificacao: `${urlBase()}/certificado/${c.codigo}`, logo: await logoDoCertificado(request.url),
  })
  const nome = `certificado-${c.codigo}.pdf`
  return new Response(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nome}"`, 'Cache-Control': 'private, no-store' } })
}
