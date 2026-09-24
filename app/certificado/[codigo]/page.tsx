import type { Metadata } from 'next'
import { AlertTriangle, BadgeCheck, XCircle } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { CODIGO_DE_CERTIFICADO, normalizarCodigo } from '@/lib/cursos/regras'
import { dataPorExtenso } from '@/lib/cursos/certificado-pdf'
import { Marca } from '@/components/membro/marca'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Verificação de certificado — Cruz Vermelha RJ', robots: { index: false, follow: false } }

/**
 * Qualquer pessoa confere aqui um certificado da Área do Voluntário pelo
 * código impresso nele. Mostra o mínimo para conferir: nome, curso, datas e
 * situação — nada de contato, CPF ou nota.
 */
export default async function VerificarCertificado({ params }: { params: Promise<{ codigo: string }> }) {
  const codigo = normalizarCodigo(decodeURIComponent((await params).codigo))
  let c: { nome: string; curso_titulo: string; carga_horaria: number | null; emitido_em: string; valido_ate: string | null; revogado_em: string | null } | null = null
  let indisponivel = false
  if (CODIGO_DE_CERTIFICADO.test(codigo)) {
    try {
      const { data, error } = await createAdminClient().from('certificados').select('nome,curso_titulo,carga_horaria,emitido_em,valido_ate,revogado_em').eq('codigo', codigo).maybeSingle()
      if (error) throw new Error(error.message)
      c = data
    } catch {
      indisponivel = true
    }
  }
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const vencido = c?.valido_ate && c.valido_ate < hoje

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 px-4 py-10 text-neutral-900">
      <div className="flex w-full max-w-lg flex-col gap-6">
        <Marca subtitulo="Verificação de certificado" />
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm" id="verificacao">
          {indisponivel ? (
            <p className="flex items-start gap-3 text-amber-800"><AlertTriangle className="mt-0.5 size-6 shrink-0" /><span><span className="block font-semibold">Verificação indisponível agora</span><span className="text-sm">Tente de novo em alguns minutos.</span></span></p>
          ) : !c ? (
            <p className="flex items-start gap-3 text-red-800"><XCircle className="mt-0.5 size-6 shrink-0" /><span><span className="block font-semibold">Certificado não encontrado</span><span className="text-sm">Confira o código {codigo ? `(${codigo}) ` : ''}impresso no rodapé do certificado.</span></span></p>
          ) : (
            <div className="flex flex-col gap-4">
              {c.revogado_em ? (
                <p className="flex items-center gap-2 font-semibold text-red-800"><XCircle className="size-6" />Certificado cancelado pela Cruz Vermelha RJ</p>
              ) : vencido ? (
                <p className="flex items-center gap-2 font-semibold text-amber-800"><AlertTriangle className="size-6" />Certificado autêntico, com validade vencida</p>
              ) : (
                <p className="flex items-center gap-2 font-semibold text-emerald-800"><BadgeCheck className="size-6" />Certificado autêntico e válido</p>
              )}
              <dl className="grid gap-3 text-sm">
                <div><dt className="text-xs text-neutral-500">Nome</dt><dd className="text-base font-medium">{c.nome}</dd></div>
                <div><dt className="text-xs text-neutral-500">Curso</dt><dd>{c.curso_titulo}{c.carga_horaria ? ` · ${Number(c.carga_horaria).toLocaleString('pt-BR')} h` : ''}</dd></div>
                <div><dt className="text-xs text-neutral-500">Emitido em</dt><dd>{dataPorExtenso(c.emitido_em)}</dd></div>
                {c.valido_ate && <div><dt className="text-xs text-neutral-500">Válido até</dt><dd>{dataPorExtenso(c.valido_ate)}</dd></div>}
                <div><dt className="text-xs text-neutral-500">Código</dt><dd className="font-mono">{codigo}</dd></div>
              </dl>
            </div>
          )}
        </section>
        <p className="text-center text-xs text-neutral-500">Cruz Vermelha Brasileira – Filial do Estado do Rio de Janeiro</p>
      </div>
    </main>
  )
}
