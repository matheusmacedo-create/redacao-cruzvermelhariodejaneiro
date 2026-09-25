import Link from 'next/link'
import { Eye } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { avisosDoMembro, naoLidasDoMembro } from '@/lib/membro/canal'
import { sair } from '@/app/actions/membro'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { Logo } from '@/components/membro/marca'
import { NavegacaoCelular, NavegacaoTopo, SubAbas } from '@/components/membro/navegacao'
import { MenuDaConta } from '@/components/membro/conta'

export const dynamic = 'force-dynamic'

/** O ambiente do voluntário: só entra com sessão da área do membro. */
export default async function AreaDoMembro({ children }: { children: React.ReactNode }) {
  const m = await exigirMembro()
  // Contadores são enfeite: se o banco falhar, a área abre com zero, não com erro.
  const [naoLidas, avisos] = await Promise.all([
    naoLidasDoMembro(m).catch(() => 0),
    avisosDoMembro(m, hojeEmSaoPaulo()).catch(() => []),
  ])
  const avisosNovos = avisos.filter((a) => !a.visto).length
  return (
    <>
      {/* Aparece só com o foco do teclado; leva direto ao conteúdo, pulando cabeçalho e abas. */}
      <a href="#conteudo" className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-lg focus:translate-y-0">Pular para o conteúdo</a>
      {m.previa && (
        <div className="bg-warning text-warning-foreground" role="status" id="faixa-da-previa">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
            <span className="flex items-center gap-2 font-medium"><Eye className="size-4 shrink-0" />
              {m.previa.como === 'geral' ? 'Visualização: é isto que um voluntário vê. Nada é gravado.' : `Visualização como ${m.nome}. Só leitura — nada é gravado em nome dele.`}
            </span>
            <form action={sair}><button type="submit" className="rounded-md bg-warning-foreground px-3 py-1 text-xs font-semibold text-warning hover:opacity-90">Voltar ao Redação</button></form>
          </div>
        </div>
      )}
      {/* Sem backdrop-blur e sem a barra do celular aqui dentro: o filtro prendia o `fixed` da barra. */}
      <header className="border-b border-border bg-card lg:sticky lg:top-0 lg:z-30">
        {/* `max(…, env(safe-area-inset-*))`: com o iPhone deitado, a logo não fica sob o entalhe. Em pé, as laterais valem 0. */}
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] lg:h-16">
          <Link href="/membro" aria-label="Início da Área do Voluntário" className="flex min-h-11 shrink-0 items-center gap-3 rounded-lg">
            <Logo className="w-28 lg:w-32" />
            <span aria-hidden="true" className="hidden h-6 w-px bg-border sm:block" />
            <span className="hidden text-sm font-semibold sm:inline">Área do Voluntário</span>
          </Link>
          <NavegacaoTopo novidades={naoLidas + avisosNovos} />
          {/* Em todas as larguras: no celular, o "Sair" não fica só no fim do Perfil. */}
          <div className="shrink-0"><MenuDaConta nome={m.nome} email={m.email} previa={!!m.previa} /></div>
        </div>
      </header>
      {/*
        Embaixo, espaço para a barra do celular e a área segura do iPhone. O
        `scroll-padding` vai no <html> (enquanto a área está na tela) e vale
        para o foco do teclado, as âncoras (#bens, #o-{id}) e o
        `scrollIntoView`: no celular desconta a barra de baixo; no computador,
        o cabeçalho que gruda no alto. Sem ele, o Tab deixava o elemento
        focado escondido atrás de uma das duas.
      */}
      <main id="conteudo" tabIndex={-1} className="mx-auto max-w-5xl px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 outline-none sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] max-lg:[html:has(&)]:scroll-pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-12 lg:[html:has(&)]:scroll-pt-20">
        <SubAbas conversas={naoLidas} avisos={avisosNovos} />
        {children}
      </main>
      <NavegacaoCelular novidades={naoLidas + avisosNovos} />
    </>
  )
}
