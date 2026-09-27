import type { Metadata } from 'next'
import { AlertTriangle, BadgeCheck, XCircle } from 'lucide-react'
import { verificarCracha } from '@/lib/cracha/servidor'
import { Marca } from '@/components/membro/marca'

/** Código com % malformado vira texto vazio (e "inválido"), não erro 500. */
const decodificar = (bruto: string) => { try { return decodeURIComponent(bruto) } catch { return '' } }

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Verificação de crachá — Cruz Vermelha RJ', robots: { index: false, follow: false } }

/**
 * Quem lê o QR do crachá cai aqui: diz se o portador faz parte da filial e
 * está ativo, com a foto para comparar. O mínimo para conferir — nome,
 * função, vínculo —; nada de CPF, saúde ou contato (docs/IDENTIDADE.md).
 */
export default async function VerificarCracha({ params }: { params: Promise<{ codigo: string }> }) {
  const codigo = decodificar((await params).codigo)
  const v = await verificarCracha(codigo)

  return (
    <main className="flex min-h-screen items-center justify-center bg-sidebar px-4 py-10 text-foreground">
      <div className="flex w-full max-w-lg flex-col gap-6">
        <Marca subtitulo="Verificação de crachá" />
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm" id="verificacao" data-verificacao={v.estado}>
          {v.estado === 'indisponivel' ? (
            <p className="flex items-start gap-3 text-warning-foreground"><AlertTriangle className="mt-0.5 size-6 shrink-0" /><span><span className="block font-semibold">Verificação indisponível agora</span><span className="text-sm">Tente de novo em alguns minutos.</span></span></p>
          ) : v.estado === 'invalido' ? (
            <p className="flex items-start gap-3 text-destructive"><XCircle className="mt-0.5 size-6 shrink-0" /><span><span className="block font-semibold">Crachá não reconhecido</span><span className="text-sm">Este código não é de um crachá da Cruz Vermelha Brasileira – Filial do Estado do Rio de Janeiro. Desconfie e, se puder, avise a filial.</span></span></p>
          ) : (
            <div className="flex flex-col gap-5">
              {v.estado === 'ativo'
                ? <p className="flex items-center gap-2 font-semibold text-success"><BadgeCheck className="size-6" />Crachá válido: pessoa ativa na filial</p>
                : <p className="flex items-center gap-2 font-semibold text-destructive"><XCircle className="size-6" />Crachá inativo: esta pessoa não está mais ativa na filial</p>}
              <div className="flex items-start gap-4">
                {v.temFoto && (
                  <img src={`/cracha/${encodeURIComponent(codigo)}/foto`} alt={`Foto de ${v.nomeCompleto}`} className="h-32 w-24 shrink-0 rounded-md object-cover ring-1 ring-border" />
                )}
                <dl className="grid min-w-0 gap-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Nome</dt><dd className="text-base font-medium">{v.nomeCompleto}</dd></div>
                  {(v.funcao || v.setor) && <div><dt className="text-xs text-muted-foreground">Função</dt><dd>{[v.funcao, v.setor].filter(Boolean).join(' · ')}</dd></div>}
                  <div><dt className="text-xs text-muted-foreground">Vínculo</dt><dd>{v.faixa === 'COLABORADOR VOLUNTÁRIO' ? 'Colaborador(a) voluntário(a)' : 'Colaborador(a)'}{v.desde ? ` · desde ${v.desde}` : ''}</dd></div>
                </dl>
              </div>
              <p className="text-xs text-muted-foreground">Compare a foto com o rosto de quem mostra o crachá. A situação é a de agora, lida no cadastro da filial.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
