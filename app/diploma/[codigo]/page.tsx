import type { Metadata } from 'next'
import { AlertTriangle, BadgeCheck, XCircle } from 'lucide-react'
import { diplomaPorCodigo, type Diploma } from '@/lib/cursos/diplomas'
import { dataPorExtenso } from '@/lib/cursos/certificado-pdf'
import { textoDoDiploma } from '@/lib/cursos/diploma-pdf'
import { normalizarCodigo } from '@/lib/cursos/regras'
import { Marca } from '@/components/membro/marca'

/** Código com % malformado vira texto vazio (e "não encontrado"), não erro 500. */
const decodificar = (bruto: string) => { try { return decodeURIComponent(bruto) } catch { return '' } }

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Verificação de diploma — Cruz Vermelha RJ', robots: { index: false, follow: false } }

/**
 * Qualquer pessoa confere aqui um Diploma de Reconhecimento pelo código
 * impresso nele: nome, o reconhecimento e a data. Nada de contato ou CPF.
 */
export default async function VerificarDiploma({ params }: { params: Promise<{ codigo: string }> }) {
  const codigo = normalizarCodigo(decodificar((await params).codigo))
  let d: Diploma | null = null
  let indisponivel = false
  try { d = await diplomaPorCodigo(codigo) } catch { indisponivel = true }

  return (
    <main className="flex min-h-screen items-center justify-center bg-sidebar px-4 py-10 text-foreground">
      <div className="flex w-full max-w-lg flex-col gap-6">
        <Marca subtitulo="Verificação de diploma" />
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm" id="verificacao" data-verificacao={indisponivel ? 'indisponivel' : !d ? 'nao-encontrado' : d.revogado_em ? 'cancelado' : 'valido'}>
          {indisponivel ? (
            <p className="flex items-start gap-3 text-warning-foreground"><AlertTriangle className="mt-0.5 size-6 shrink-0" /><span><span className="block font-semibold">Verificação indisponível agora</span><span className="text-sm">Tente de novo em alguns minutos.</span></span></p>
          ) : !d ? (
            <p className="flex items-start gap-3 text-destructive"><XCircle className="mt-0.5 size-6 shrink-0" /><span><span className="block font-semibold">Diploma não encontrado</span><span className="text-sm">Confira o código {codigo ? `(${codigo}) ` : ''}impresso no canto do diploma.</span></span></p>
          ) : (
            <div className="flex flex-col gap-4">
              {d.revogado_em
                ? <p className="flex items-center gap-2 font-semibold text-destructive"><XCircle className="size-6" />Diploma cancelado pela Cruz Vermelha RJ</p>
                : <p className="flex items-center gap-2 font-semibold text-success"><BadgeCheck className="size-6" />Diploma de Reconhecimento autêntico</p>}
              <dl className="grid gap-3 text-sm">
                <div><dt className="text-xs text-muted-foreground">Concedido a</dt><dd className="text-base font-medium">{d.nome}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Reconhecimento</dt><dd>{textoDoDiploma({ motivo: d.motivo, marcoHoras: d.marco_horas, texto: d.texto }).replace(/^em /, 'Em ')}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Emitido em</dt><dd>{dataPorExtenso(d.emitido_em)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Código</dt><dd className="font-mono">{d.codigo}</dd></div>
              </dl>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
