import type { Metadata } from 'next'
import Image from 'next/image'
import { AlertTriangle, BadgeCheck, CircleUserRound, Phone, ShieldAlert, XCircle } from 'lucide-react'
import { verificarCracha } from '@/lib/cracha/servidor'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'
import { condensada } from '@/components/cracha/fonte'
import { RelogioAoVivo } from '@/components/cracha/relogio'
import { cn } from '@/lib/utils'

/** Código com % malformado vira texto vazio (e "inválido"), não erro 500. */
const decodificar = (bruto: string) => { try { return decodeURIComponent(bruto) } catch { return '' } }

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Verificação de crachá — Cruz Vermelha RJ', robots: { index: false, follow: false } }

const ESTADOS = {
  ativo: { titulo: 'Crachá válido', texto: 'Pessoa ativa na Cruz Vermelha Brasileira – Filial do Estado do Rio de Janeiro.', icone: BadgeCheck, cor: 'bg-[#1f7a3d]' },
  inativo: { titulo: 'Crachá inativo', texto: 'Esta pessoa não faz mais parte da filial. Não aceite este crachá como identificação.', icone: XCircle, cor: 'bg-[#b3261e]' },
  invalido: { titulo: 'Crachá não reconhecido', texto: 'Este código não é de um crachá da filial. Não aceite: pode ser falsificação.', icone: ShieldAlert, cor: 'bg-[#b3261e]' },
  indisponivel: { titulo: 'Verificação indisponível', texto: 'Não foi possível consultar o cadastro agora. Tente de novo em alguns minutos ou ligue para a filial.', icone: AlertTriangle, cor: 'bg-[#8a5a00]' },
} as const

/**
 * Quem lê o QR do crachá cai aqui — em geral na portaria, no celular. Em
 * cima, o resultado grande e colorido, com a hora ao vivo (um print antigo
 * fica parado); embaixo, a foto para comparar com o rosto, o nome na faixa
 * vermelha como no crachá, a função e o vínculo. Nada de CPF, saúde ou
 * contato pessoal (docs/IDENTIDADE.md).
 */
export default async function VerificarCracha({ params }: { params: Promise<{ codigo: string }> }) {
  const codigo = decodificar((await params).codigo)
  const v = await verificarCracha(codigo)
  const e = ESTADOS[v.estado]
  const Icone = e.icone
  const temPessoa = v.estado === 'ativo' || v.estado === 'inativo'

  return (
    <main className="min-h-screen bg-[#f4f1ec] text-[#1f1f1f]">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-3">
          <Image src="/images/logo-cvrj.png" alt="Cruz Vermelha Brasileira – Rio de Janeiro" width={1844} height={752} sizes="140px" className="h-auto w-[140px]" priority />
          <span className={cn(condensada.className, 'text-right text-[13px] font-semibold uppercase leading-tight tracking-wide text-[#5f6062]')}>Verificação<br />de crachá</span>
        </div>
      </header>

      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-5">
        <section id="verificacao" data-verificacao={v.estado} className={cn('rounded-2xl p-5 text-white shadow-[0_10px_30px_-15px_rgba(0,0,0,0.5)]', e.cor)} aria-live="polite">
          <div className="flex items-start gap-3">
            <Icone className="mt-0.5 size-9 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h1 className={cn(condensada.className, 'text-[30px] font-bold uppercase leading-none tracking-wide')}>{e.titulo}</h1>
              <p className="mt-1.5 text-sm leading-snug text-white/90">{e.texto}</p>
            </div>
          </div>
          <RelogioAoVivo className="mt-4 block rounded-lg bg-black/15 px-3 py-2 text-[13px] font-medium" />
        </section>

        {temPessoa && (
          <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_10px_30px_-18px_rgba(0,0,0,0.45)]" aria-label="Portador do crachá">
            <div className="flex justify-center bg-[#eeeeee] pt-5">
              {v.temFoto
                // A foto só vem de quem está ativo (a rota confere de novo).
                ? <img src={`/cracha/${encodeURIComponent(codigo)}/foto`} alt={`Foto de ${v.nomeCompleto}`} className="h-56 w-44 rounded-t-lg object-cover" />
                : <span className="flex h-56 w-44 items-end justify-center rounded-t-lg bg-[#e2e2e2] text-[#9a9a9a]"><CircleUserRound className="mb-8 size-24" aria-hidden="true" /></span>}
            </div>
            <p className={cn(condensada.className, 'bg-[#e32219] px-4 py-2.5 text-center text-[26px] font-bold uppercase leading-tight tracking-wide text-white', v.estado === 'inativo' && 'bg-[#6b6b6b] line-through decoration-2')}>
              {v.nomeCompleto}
            </p>
            <dl className="grid grid-cols-1 gap-3 p-5 text-sm">
              {(v.funcao || v.setor) && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-[#6b6b6b]">Função</dt>
                  <dd className={cn(condensada.className, 'text-[20px] font-bold uppercase leading-tight')}>{[v.funcao, v.setor].filter(Boolean).join(' · ')}</dd>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[#e32219]/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#b3261e]">{v.faixa === 'COLABORADOR VOLUNTÁRIO' ? 'Colaborador(a) voluntário(a)' : 'Colaborador(a)'}</span>
                {v.desde && <span className="rounded-full bg-[#f1efeb] px-3 py-1 text-xs font-medium text-[#3a3a3a]">Na filial desde {v.desde}</span>}
              </div>
            </dl>
          </section>
        )}

        {v.estado === 'ativo' && (
          <section className="rounded-2xl border border-black/10 bg-white p-5 text-sm">
            <h2 className="font-semibold">Como conferir</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[#3a3a3a]">
              <li>Compare a foto com o rosto de quem mostra o crachá.</li>
              <li>Confira se o nome é o mesmo impresso no crachá.</li>
              <li>A hora acima precisa estar correndo: tela parada pode ser um print.</li>
            </ol>
          </section>
        )}

        <footer className="rounded-2xl border border-black/10 bg-white p-5 text-sm">
          <p className="font-semibold">{DADOS_DA_FILIAL.nome}</p>
          <p className="text-xs text-[#6b6b6b]">CNPJ {DADOS_DA_FILIAL.cnpj} · Utilidade Pública Internacional (Decreto nº 9.620/1912)</p>
          <p className="mt-3 text-[#3a3a3a]">Dúvida sobre este crachá? Fale com a filial:</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            <a href={`tel:+55${DADOS_DA_FILIAL.telefone.replace(/\D/g, '')}`} className="inline-flex items-center gap-1.5 font-medium text-[#b3261e] underline-offset-4 hover:underline"><Phone className="size-4" aria-hidden="true" />{DADOS_DA_FILIAL.telefone}</a>
            <a href={`mailto:${DADOS_DA_FILIAL.email}`} className="font-medium text-[#b3261e] underline-offset-4 hover:underline">{DADOS_DA_FILIAL.email}</a>
          </p>
          <p className="mt-3 text-xs text-[#6b6b6b]">A situação é a de agora, lida no cadastro da filial. Esta página não mostra CPF, dados de saúde nem contato pessoal.</p>
        </footer>
      </div>
    </main>
  )
}
