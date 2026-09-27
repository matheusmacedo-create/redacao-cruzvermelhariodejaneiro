import { quandoFoiPublicada, type Versao } from '@/lib/versao'

/**
 * O pé do menu para quem cuida do sistema: quando a versão no ar foi
 * publicada e o que ela trouxe (o título do PR), com links para o PR e o
 * commit. Rodando local, diz só isso.
 */
export function VersaoNoAr({ versao }: { versao: Versao }) {
  const link = 'rounded hover:text-foreground hover:underline'
  if (!versao.commit) return <p className="mt-2 px-2 text-[11px] text-muted-foreground">Versão local, fora da Vercel.</p>
  return (
    <div className="mt-2 rounded-lg border border-sidebar-border bg-white/60 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground" title={versao.titulo ?? undefined}>
      <p className="flex items-center gap-1.5 font-medium text-foreground">
        <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
        No ar{versao.publicadaEm ? <span className="font-normal text-muted-foreground" suppressHydrationWarning> · {quandoFoiPublicada(versao.publicadaEm)}</span> : null}
      </p>
      {versao.titulo && <p className="mt-1 line-clamp-2 text-foreground/80">{versao.titulo}</p>}
      <p className="mt-1 flex items-center gap-2 font-mono text-[10px]">
        {versao.linkDoPr && <a href={versao.linkDoPr} target="_blank" rel="noopener" className={link}>PR #{versao.pr}</a>}
        <a href={versao.linkDoCommit!} target="_blank" rel="noopener" className={link}>{versao.commit}</a>
      </p>
    </div>
  )
}
