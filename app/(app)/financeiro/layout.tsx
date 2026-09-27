import { SecoesDaEscola } from '@/components/app/escola/secoes'
import { FaixaDoLivro } from '@/components/app/financeiro/faixa-do-livro'
import { ProvedorDoLivro } from '@/components/app/financeiro/livro'
import { contextoDoFinanceiro } from '@/lib/financeiro/acesso'
import { contextoDoMarketing } from '@/lib/escola/marketing-servidor'
import { livroDaEmpresa } from '@/lib/financeiro/livro'

/**
 * Todas as telas do Financeiro, nos dois livros: /financeiro/... (filial) e
 * /escola/financeiro/... (Escola, reescrito pelo proxy para cá). O livro
 * vem do endereço (lib/financeiro/livro.ts); a faixa diz de quem são os
 * livros, e na Escola as seções dela ficam no alto, como no resto da Escola.
 */
export default async function LayoutDoFinanceiro({ children }: { children: React.ReactNode }) {
  const { livro, empresa, empresas } = await contextoDoFinanceiro()
  const outroVisivel = empresas.some((e) => livroDaEmpresa(e.tipo) !== livro)
  const marketing = livro === 'escola' ? (await contextoDoMarketing()).nivel >= 2 : false
  return (
    <ProvedorDoLivro livro={livro}>
      {livro === 'escola' && <div className="mb-4"><SecoesDaEscola atual="/escola/financeiro" marketing={marketing} /></div>}
      {/* Só para quem enxerga a empresa: quem só pede compras não tem livros a ver. */}
      {empresa && <FaixaDoLivro livro={livro} empresa={empresa} outroVisivel={outroVisivel} />}
      {children}
    </ProvedorDoLivro>
  )
}
