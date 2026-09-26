import { Logo } from '@/components/membro/marca'
import { CabecalhoDaPagina } from '@/components/membro/pecas'
import { FormularioDeEnvio, type EventoDoEnvio } from '@/components/enviar/formulario'
import { createAdminClient } from '@/lib/supabase/admin'
import { nomesDosSetores } from '@/lib/setores'
import { NOMES_DOS_SETORES } from '@/lib/equipe'
import { PARAGRAFOS_DO_TERMO, TERMO_VERSAO, TITULO_DO_TERMO } from '@/lib/imagem/termo'

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

async function setores(): Promise<string[]> {
  try {
    const admin = createAdminClient()
    const { data: ws } = await admin.from('workspaces').select('id').eq('kind', 'production').order('created_at').limit(1).maybeSingle()
    return await nomesDosSetores(admin, (ws?.id as string) ?? '')
  } catch {
    return [...NOMES_DOS_SETORES]
  }
}

/**
 * A página de "Mandar uma ação" (/enviar e /enviar/<codigo> do evento). Mesmo
 * visual da inscrição de voluntários (/participe): a logo oficial numa faixa
 * branca, cartão no fundo cinza.
 */
export async function PaginaDeEnvio({ evento }: { evento?: EventoDoEnvio }) {
  const lista = await setores()
  return (
    <div className="min-h-dvh bg-sidebar text-foreground [--destructive:oklch(0.5_0.19_27)] [--success-texto:oklch(0.45_0.12_150)]">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4 sm:px-6 lg:h-16">
          <Logo className="w-28 sm:w-32" />
        </div>
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-12 pt-6 sm:px-6 sm:pt-8">
        <CabecalhoDaPagina
          titulo={evento ? `Fotos do evento: ${evento.nome}` : 'Mandar uma ação'}
          descricao={evento
            ? 'Mande as fotos e os vídeos que você fez e conte o que viu. Tudo entra no álbum do evento, junto com o de todo mundo, e a comunicação transforma em post e matéria.'
            : 'Fez uma ação, um atendimento ou um evento? Mande as fotos, os vídeos e conte o que aconteceu — a comunicação transforma em post e matéria.'}
        />
        <div className="relative rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <FormularioDeEnvio hoje={hoje()} setores={lista} termo={{ titulo: TITULO_DO_TERMO, versao: TERMO_VERSAO, paragrafos: PARAGRAFOS_DO_TERMO }} evento={evento} />
        </div>
      </main>
    </div>
  )
}
