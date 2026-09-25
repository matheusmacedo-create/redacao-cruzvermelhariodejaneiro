import Image from 'next/image'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'
import { blocosDoCorpo, localEData, momento, tituloDoOficio, type Documento } from '@/lib/oficios/documento'

export type AssinaturaNaFolha = {
  ordem: number
  nome: string
  cargo: string | null
  estado: 'pendente' | 'assinado' | 'recusado'
  assinadoEm: string | null
  metodo?: 'senha' | 'govbr' | null
  /** Nome no certificado do gov.br/ICP-Brasil, quando assinou por lá. */
  titularDoCertificado?: string | null
}

/**
 * A folha do ofício, no formato da correspondência oficial e com o mesmo
 * desenho do PDF (lib/oficios/pdf.ts): timbre com a logo, número, local e data, destinatário, assunto, vocativo, texto, fecho e o
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
    <article className="folha-oficio relative mx-auto w-full max-w-[52rem] overflow-hidden rounded-md border border-border bg-white px-6 py-8 font-serif text-[15px] leading-relaxed text-neutral-900 shadow-sm sm:px-14 sm:py-12 print:max-w-none print:rounded-none print:border-0 print:px-0 print:py-0 print:shadow-none">
      {marcaDagua && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-[24deg] select-none font-sans text-6xl font-black uppercase tracking-widest text-neutral-900/[0.06] sm:text-8xl">{marcaDagua}</span>
        </div>
      )}
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-6 -right-6 size-44 opacity-[0.05] print:hidden">
        <span className="absolute left-1/2 top-0 h-full w-[34%] -translate-x-1/2 bg-[#e32219]" />
        <span className="absolute left-0 top-1/2 h-[34%] w-full -translate-y-1/2 bg-[#e32219]" />
      </span>
      <header className="flex items-center justify-between gap-4 border-b-2 border-[#e32219] pb-3 font-sans">
        <Image src="/images/logo-cvrj.png" alt="Cruz Vermelha Brasileira – Rio de Janeiro" width={1844} height={752} sizes="170px" className="-ml-[3%] h-auto w-[140px] shrink-0 sm:w-[170px]" />
        <div className="min-w-0 text-right text-[11px] leading-snug text-neutral-600">
          {doc.setor && <p className="text-xs font-bold uppercase tracking-wide text-neutral-900">{doc.setor}</p>}
          <p className="hidden sm:block">{DADOS_DA_FILIAL.email}</p>
          <p className="hidden sm:block">{DADOS_DA_FILIAL.telefone}</p>
        </div>
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
            {a.cargo && <p className="text-neutral-700">{a.cargo}</p>}
          </div>
        ))}
      </div>

      <div className="mt-10 border-t border-[#e32219] pt-2 font-sans text-[11px] leading-snug text-neutral-600">
        <p className="font-bold text-neutral-900">{DADOS_DA_FILIAL.nome} · CNPJ {DADOS_DA_FILIAL.cnpj}</p>
        <p>{DADOS_DA_FILIAL.endereco}</p>
      </div>
      {rodape && <footer className="mt-4 border-t border-neutral-200 pt-3 font-sans text-[11px] leading-relaxed text-neutral-600">{rodape}</footer>}
    </article>
  )
}
