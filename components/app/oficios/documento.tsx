import { localEData, momento, paragrafos, tituloDoOficio, type Documento } from '@/lib/oficios/documento'

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
 * A folha do ofício, no formato da correspondência oficial: timbre,
 * número, local e data, destinatário, assunto, vocativo, texto, fecho e o
 * bloco de assinaturas. Serve à tela interna, à pré-visualização do rascunho
 * e à página pública de conferência (que também é a versão para imprimir).
 */
export function FolhaDoOficio({ doc, assinaturas, rodape, marcaDagua }: {
  doc: Documento
  assinaturas?: AssinaturaNaFolha[]
  rodape?: React.ReactNode
  marcaDagua?: string
}) {
  const blocos = paragrafos(doc.corpo)
  const assinantes = assinaturas ?? doc.assinantes.map((a) => ({ ...a, estado: 'pendente' as const, assinadoEm: null }))
  const dest = doc.destinatario
  return (
    <article className="folha-oficio relative mx-auto w-full max-w-[52rem] overflow-hidden rounded-md border border-border bg-white px-6 py-8 font-serif text-[15px] leading-relaxed text-neutral-900 shadow-sm sm:px-14 sm:py-12 print:max-w-none print:rounded-none print:border-0 print:px-0 print:py-0 print:shadow-none">
      {marcaDagua && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-[24deg] select-none font-sans text-6xl font-black uppercase tracking-widest text-neutral-900/[0.06] sm:text-8xl">{marcaDagua}</span>
        </div>
      )}
      <header className="flex items-center gap-4 border-b-2 border-[#e32219] pb-4 font-sans">
        <span aria-hidden="true" className="relative inline-block size-10 shrink-0">
          <span className="absolute left-1/2 top-0 h-full w-[34%] -translate-x-1/2 bg-[#e32219]" />
          <span className="absolute left-0 top-1/2 h-[34%] w-full -translate-y-1/2 bg-[#e32219]" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wide">{doc.emitente || 'Cruz Vermelha Brasileira'}</p>
          {doc.setor && <p className="text-xs text-neutral-600">{doc.setor}</p>}
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="font-sans text-sm font-bold">{tituloDoOficio(doc.numero, null)}</p>
        <p className="text-sm">{localEData(doc.local, doc.data)}</p>
      </div>

      {(dest.nome || dest.cargo || dest.orgao || dest.endereco) && (
        <div className="mt-6 text-sm leading-snug">
          {dest.nome && <p>{dest.nome}</p>}
          {dest.cargo && <p>{dest.cargo}</p>}
          {dest.orgao && <p>{dest.orgao}</p>}
          {dest.endereco && <p className="whitespace-pre-line">{dest.endereco}</p>}
        </div>
      )}

      <p className="mt-6 text-sm"><span className="font-bold">Assunto:</span> {doc.assunto || <span className="text-neutral-400">(sem assunto)</span>}</p>

      {doc.vocativo && <p className="mt-6">{doc.vocativo}</p>}
      <div className="mt-4 flex flex-col gap-3 text-justify [hyphens:auto]" lang="pt-BR">
        {blocos.length ? blocos.map((p, i) => <p key={i} className="indent-10">{p}</p>) : <p className="text-neutral-400">(o texto do ofício aparece aqui)</p>}
      </div>
      {doc.fecho && <p className="mt-6">{doc.fecho}</p>}

      <div className="mt-10 grid gap-8 sm:grid-cols-2">
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

      {rodape && <footer className="mt-10 border-t border-neutral-300 pt-4 font-sans text-[11px] leading-relaxed text-neutral-600">{rodape}</footer>}
    </article>
  )
}
