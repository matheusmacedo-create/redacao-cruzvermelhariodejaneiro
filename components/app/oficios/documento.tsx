import Image from 'next/image'
import { LINHAS_DO_DECRETO, linhasDoRodape } from '@/lib/pdf/timbrado-texto'
import { blocosDoCorpo, localEData, momento, tituloDoOficio, type Documento } from '@/lib/oficios/documento'

export type AssinaturaNaFolha = {
  ordem: number
  nome: string
  /** CPF mascarado do cadastro da Equipe (***.456.789-**). */
  cpf?: string | null
  cargo: string | null
  setor?: string | null
  estado: 'pendente' | 'assinado' | 'recusado'
  assinadoEm: string | null
  metodo?: 'senha' | 'govbr' | null
  /** Nome no certificado do gov.br/ICP-Brasil, quando assinou por lá. */
  titularDoCertificado?: string | null
}

/**
 * A folha do ofício, no formato da correspondência oficial e com o mesmo
 * desenho do PDF (lib/oficios/pdf.ts): o timbrado do manual (logo, decreto, setor e rodapé da filial), número, local e data,
 * destinatário, assunto, vocativo, texto, fecho e o
 * bloco de assinaturas. Serve à tela interna, à pré-visualização do rascunho
 * e à página pública de conferência (que também é a versão para imprimir).
 */
export function FolhaDoOficio({ doc, assinaturas, rodape, marcaDagua }: {
  doc: Documento
  assinaturas?: AssinaturaNaFolha[]
  rodape?: React.ReactNode
  marcaDagua?: string
}) {
  const blocos = blocosDoCorpo(doc.corpo)
  const assinantes = assinaturas ?? doc.assinantes.map((a) => ({ ...a, estado: 'pendente' as const, assinadoEm: null }))
  const dest = doc.destinatario
  return (
    <article className="folha-oficio relative mx-auto w-full max-w-[52rem] overflow-hidden rounded-md border border-border bg-white px-6 py-8 font-sans text-[14.5px] leading-relaxed text-neutral-900 shadow-sm sm:px-14 sm:py-12 print:max-w-none print:rounded-none print:border-0 print:px-0 print:py-0 print:shadow-none">
      {marcaDagua && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-[24deg] select-none font-sans text-6xl font-black uppercase tracking-widest text-neutral-900/[0.06] sm:text-8xl">{marcaDagua}</span>
        </div>
      )}
      {/* O timbrado do manual (p. 24): logo à esquerda, o decreto à direita e o setor centrado, sem fio nem marca d'água. */}
      <header>
        <div className="flex items-start justify-between gap-4">
          <Image src="/images/logo-cvrj.png" alt="Cruz Vermelha Brasileira – Rio de Janeiro" width={1844} height={752} sizes="190px" className="-ml-[3%] h-auto w-[120px] shrink-0 sm:w-[190px]" />
          <p className="mt-1 text-right text-[9px] leading-snug text-neutral-500 sm:text-[10px]">{LINHAS_DO_DECRETO.map((l) => <span key={l} className="block whitespace-nowrap">{l}</span>)}</p>
        </div>
        {doc.setor && <p className="mt-1 text-center text-lg font-semibold uppercase tracking-tight text-neutral-900 [font-stretch:condensed]">{doc.setor}</p>}
      </header>

      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="font-sans text-[15px] font-bold uppercase">{tituloDoOficio(doc.numero, null)}</p>
        <p>{localEData(doc.local, doc.data)}</p>
      </div>

      {(dest.nome || dest.cargo || dest.orgao || dest.endereco) && (
        <div className="mt-8 leading-snug">
          {dest.nome && <p className="font-bold">{dest.nome}</p>}
          {dest.cargo && <p>{dest.cargo}</p>}
          {dest.orgao && <p>{dest.orgao}</p>}
          {dest.endereco && <p className="whitespace-pre-line">{dest.endereco}</p>}
        </div>
      )}

      <p className="mt-6 pl-[4.3em] -indent-[4.3em] font-bold">Assunto: {doc.assunto || <span className="font-normal text-neutral-400">(sem assunto)</span>}</p>

      {doc.vocativo && <p className="mt-6 indent-12">{doc.vocativo}</p>}
      <div className="mt-3 flex flex-col gap-3 text-justify [hyphens:auto]" lang="pt-BR">
        {blocos.length ? blocos.map((b, i) => b.tipo === 'titulo'
          ? <h3 key={i} className="mt-2 break-after-avoid font-bold">{b.texto}</h3>
          : b.tipo === 'lista'
            ? (
              <ul key={i} className="flex flex-col gap-1 pl-6 text-left">
                {b.itens.map((it, k) => (
                  <li key={k} className="flex gap-3">
                    <span className={`w-5 shrink-0 ${it.marcador ? '' : 'text-[#e32219]'}`}>{it.marcador ?? '•'}</span>
                    <span>{it.texto}</span>
                  </li>
                ))}
              </ul>
            )
            : <p key={i} className="indent-12">{b.texto}</p>)
          : <p className="text-neutral-400">(o texto do ofício aparece aqui)</p>}
      </div>
      {doc.fecho && <p className="mt-6 indent-12">{doc.fecho}</p>}

      <div className={`mt-10 grid gap-8 ${assinantes.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {assinantes.map((a) => (
          <div key={a.ordem} className="break-inside-avoid text-center text-sm">
            <div className={`mx-auto mb-2 min-h-12 max-w-64 border-b ${a.estado === 'assinado' ? 'border-neutral-900' : 'border-dashed border-neutral-400'} flex items-end justify-center pb-1 font-sans text-[11px]`}>
              {a.estado === 'assinado' && a.assinadoEm
                ? <span className="text-emerald-800">{a.metodo === 'govbr' ? `Assinado com gov.br${a.titularDoCertificado ? ` (${a.titularDoCertificado})` : ''} em ${momento(a.assinadoEm)}` : `Assinado eletronicamente em ${momento(a.assinadoEm)}`}</span>
                : a.estado === 'recusado' ? <span className="text-red-700">Assinatura recusada</span> : <span className="text-neutral-400">Aguardando assinatura</span>}
            </div>
            <p className="font-bold">{a.nome}</p>
            {a.cpf && <p className="font-sans text-xs text-neutral-600">CPF {a.cpf}</p>}
            {(a.cargo || a.setor) && <p className="text-neutral-700">{[a.cargo, a.setor].filter(Boolean).join(' · ')}</p>}
          </div>
        ))}
      </div>

      <div className="mt-12 text-center text-[10.5px] leading-snug text-balance text-neutral-600">
        {linhasDoRodape().map((l, i) => <p key={l} className={i === 0 ? 'font-semibold text-neutral-900' : undefined}>{l}</p>)}
      </div>
      {rodape && <footer className="mt-4 border-t border-neutral-200 pt-3 font-sans text-[11px] leading-relaxed text-neutral-600">{rodape}</footer>}
    </article>
  )
}
