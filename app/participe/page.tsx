import type { Metadata } from 'next'
import Link from 'next/link'
import { FormularioPublico } from '@/components/participe/formulario-publico'
import { Logo } from '@/components/membro/marca'
import { CabecalhoDaPagina } from '@/components/membro/pecas'
import { createAdminClient } from '@/lib/supabase/admin'
import { nomesDosSetores } from '@/lib/setores'
import { NOMES_DOS_SETORES } from '@/lib/equipe'

// Título inteiro: esta página fica fora de app/membro, então o modelo
// "%s · Área do Voluntário" não se aplica aqui.
export const metadata: Metadata = { title: 'Seja voluntário — Cruz Vermelha RJ', description: 'Inscrição de voluntários da Cruz Vermelha Brasileira – Filial do Rio de Janeiro.' }

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

// Os setores vêm do cadastro do espaço; a página se refaz a cada 10 minutos.
export const revalidate = 600

async function setoresPublicos(): Promise<string[]> {
  try {
    const admin = createAdminClient()
    const { data: ws } = await admin.from('workspaces').select('id').eq('kind', 'production').order('created_at').limit(1).maybeSingle()
    return await nomesDosSetores(admin, (ws?.id as string) ?? '')
  } catch {
    // Sem banco (build sem variáveis, instabilidade): a lista oficial serve até a próxima geração.
    return [...NOMES_DOS_SETORES]
  }
}

/*
 * O mesmo produto da Área do Voluntário: mesmos tokens de escopo do
 * contêiner de app/membro/layout.tsx (vermelho de erro mais escuro que o da
 * marca, verde legível em texto), mesma logo e mesmas peças. O emblema só
 * aparece na logo oficial.
 */
export default async function Participe() {
  const setores = await setoresPublicos()
  return (
    <div className="min-h-dvh bg-sidebar text-foreground [--destructive:oklch(0.5_0.19_27)] [--success-texto:oklch(0.45_0.12_150)]">
      {/* Faixa branca: a logo oficial é um PNG de fundo branco e, sobre o cinza, viraria uma caixa solta. */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4 sm:px-6 lg:h-16">
          <Logo className="w-28 sm:w-32" />
          {/* No celular a pergunta some da tela (não cabe ao lado da logo em 320px), mas o leitor de tela continua lendo. */}
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <span className="sr-only sm:not-sr-only">Já é voluntário?</span>
            <Link href="/membro/entrar" className="-mr-2 inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-foreground underline-offset-4 hover:bg-muted hover:underline">
              Entrar<span className="sr-only"> na Área do Voluntário</span>
            </Link>
          </p>
        </div>
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-12 pt-6 sm:px-6 sm:pt-8">
        {/* A descrição serve antes e depois do envio: a tela de sucesso aparece embaixo dela. */}
        <CabecalhoDaPagina titulo="Seja voluntário" descricao="A coordenação do Voluntariado analisa cada inscrição e entra em contato para a formação inicial." />
        {/* `relative`: prende a armadilha para robôs, que fica fora da tela. */}
        <div className="relative rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <FormularioPublico hoje={hoje()} setores={setores} />
        </div>
      </main>
    </div>
  )
}
