import { LogOut } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { naoLidasDoMembro } from '@/lib/membro/canal'
import { sair } from '@/app/actions/membro'
import { Marca } from '@/components/membro/marca'
import { Navegacao } from '@/components/membro/navegacao'

export const dynamic = 'force-dynamic'

/** O ambiente do voluntário: só entra com sessão da área do membro. */
export default async function AreaDoMembro({ children }: { children: React.ReactNode }) {
  const m = await exigirMembro()
  const naoLidas = await naoLidasDoMembro(m).catch(() => 0)
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Marca />
          <Navegacao naoLidas={naoLidas} />
          <form action={sair}>
            <button type="submit" className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900" title={`Sair (${m.email ?? m.nome})`}>
              <LogOut className="size-4" /><span className="hidden md:inline">Sair</span>
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 lg:pb-10">{children}</main>
    </>
  )
}
