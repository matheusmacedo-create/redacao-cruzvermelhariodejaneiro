import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Award, CalendarHeart, GraduationCap, MessageCircle, type LucideIcon } from 'lucide-react'
import { sessaoDoMembro } from '@/lib/membro/sessao'
import { COOKIE_DO_MEMBRO } from '@/lib/membro/entrada'
import { voltarSeguro } from '@/lib/membro/regras'
import { Logo } from '@/components/membro/marca'
import { Secao } from '@/components/membro/pecas'
import { Entrar } from '@/components/membro/entrar'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Entrar' }

const BENEFICIOS: { icone: LucideIcon; titulo: string; linha: string }[] = [
  { icone: GraduationCap, titulo: 'Cursos e apostilas', linha: 'Formação da Cruz Vermelha no seu ritmo.' },
  { icone: Award, titulo: 'Certificados verificáveis', linha: 'Qualquer pessoa confere pelo código.' },
  { icone: CalendarHeart, titulo: 'Ações e plantões', linha: 'Inscreva-se e receba lembrete por e-mail.' },
  { icone: MessageCircle, titulo: 'Canal com a coordenação', linha: 'Tire dúvidas e acompanhe as respostas.' },
]

/** No celular, abaixo do formulário do passo 1: o painel vermelho do computador não aparece ali. */
function BeneficiosNoCelular() {
  return (
    <Secao titulo="O que você encontra aqui" id="beneficios" className="mt-10 lg:hidden">
      <ul className="grid grid-cols-2 gap-3">
        {BENEFICIOS.map(({ icone: Icone, titulo, linha }) => (
          <li key={titulo} className="rounded-xl border border-border bg-card p-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icone className="size-5" aria-hidden="true" /></span>
            <p className="mt-2 text-sm font-semibold">{titulo}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{linha}</p>
          </li>
        ))}
      </ul>
    </Secao>
  )
}

/**
 * A entrada: uma coluna alinhada ao topo (centralizar na vertical fazia a
 * coluna pular ao trocar de etapa) e, a partir de lg, o painel da marca ao
 * lado. A logo aparece uma vez só; o emblema, só nela.
 */
export default async function EntrarNaAreaDoMembro({ searchParams }: { searchParams: Promise<{ email?: string | string[]; voltar?: string | string[] }> }) {
  const { email, voltar } = await searchParams
  const destino = voltarSeguro(voltar)
  if (await sessaoDoMembro()) redirect(destino ?? '/membro')
  const emailInicial = ((Array.isArray(email) ? email[0] : email) ?? '').trim().slice(0, 254)
  // Com cookie, a sessão existia e acabou; sem, a pessoa só abriu um link da área (ex.: de um e-mail).
  const sessaoAnterior = destino ? (await cookies()).has(COOKIE_DO_MEMBRO) : false

  return (
    // Fundo branco, e não o cinza da área: a logo oficial é um PNG de fundo
    // branco e, sobre o cinza, viraria uma caixa branca solta.
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(420px,1fr)_1.1fr]">
      <main className="px-4 pb-10 pt-8 sm:px-6 lg:px-12 lg:pt-[14vh]">
        <div className="mx-auto w-full max-w-md">
          <Logo className="w-32 sm:w-36" />
          <Entrar className="mt-8" emailInicial={emailInicial} voltar={destino} sessaoAnterior={sessaoAnterior} noPassoDoEmail={<BeneficiosNoCelular />} />
        </div>
      </main>

      {/*
        Vermelho chapado com uma sombra de canto, sem cruz e sem logo. Os
        cartões escurecem o fundo (e não clareiam): branco sobre o vermelho
        clareado cairia abaixo de 4,5:1 no texto pequeno.
      */}
      <aside aria-labelledby="painel-titulo" className="relative m-3 hidden overflow-hidden rounded-2xl bg-primary text-primary-foreground lg:sticky lg:top-3 lg:flex lg:h-[calc(100dvh-1.5rem)] lg:flex-col lg:self-start">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-linear-to-br from-transparent to-black/20" />
        <div className="relative flex flex-1 flex-col justify-center gap-8 p-10 xl:p-14">
          <h2 id="painel-titulo" className="max-w-xl text-3xl font-bold leading-tight tracking-tight text-balance xl:text-4xl">Quem ajuda também aprende, cresce e é reconhecido.</h2>
          <ul className="grid max-w-2xl gap-3 xl:grid-cols-2">
            {BENEFICIOS.map(({ icone: Icone, titulo, linha }) => (
              <li key={titulo} className="flex gap-3 rounded-xl border border-white/25 bg-black/10 p-4">
                <Icone className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-semibold">{titulo}</p>
                  <p className="mt-0.5 text-sm">{linha}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative px-10 pb-8 text-sm xl:px-14">Cruz Vermelha Brasileira · Filial do Rio de Janeiro</p>
      </aside>
    </div>
  )
}
