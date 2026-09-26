import type { Metadata } from 'next'
import { Megaphone, Pin } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { avisosDoMembro } from '@/lib/membro/canal'
import { dataCurta } from '@/lib/membro/regras'
import { createAdminClient } from '@/lib/supabase/admin'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { AtualizarNovidades, SeloDeNovo } from '@/components/membro/canal'
import { CabecalhoDaPagina, EstadoVazio, Selo } from '@/components/membro/pecas'

export const dynamic = 'force-dynamic'

// O template do layout completa: "Avisos · Área do Voluntário".
export const metadata: Metadata = { title: 'Avisos' }

/**
 * O mural completo. Abrir aqui marca todos como vistos. Cada cartão tem
 * `id="aviso-{id}"`: o Início leva direto a um aviso.
 */
export default async function Avisos() {
  const m = await exigirMembro()
  const avisos = await avisosDoMembro(m, hojeEmSaoPaulo())
  const novos = avisos.filter((a) => !a.visto).map((a) => a.id)
  // Se marcou, o número de novidades do layout (calculado na mesma requisição) já está velho.
  let marcou = false
  if (novos.length && !m.previa) {
    const { error } = await createAdminClient().rpc('membro_ver_avisos', { p_participante_id: m.participanteId, p_avisos: novos })
    marcou = !error
  }
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <CabecalhoDaPagina titulo="Avisos" descricao="Recados da coordenação para todos os voluntários." />
      {avisos.length ? (
        <div className="flex flex-col gap-3">
          {/* O tour aponta o primeiro aviso, com os selos "Fixado" e "Novo" de que o
              passo fala: a lista inteira passa da tela, e no celular os selos ficavam de fora. */}
          {avisos.map((a, i) => (
            <article key={a.id} id={`aviso-${a.id}`} aria-labelledby={`aviso-${a.id}-titulo`} data-ajuda={i === 0 ? 'membro.avisos' : undefined} className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {a.fixado && <Selo icone={Pin}>Fixado</Selo>}
                <SeloDeNovo novo={!a.visto} />
                <time dateTime={a.created_at}>{dataCurta(a.created_at)}</time>
              </div>
              <h2 id={`aviso-${a.id}-titulo`} className="mt-2 text-base font-semibold wrap-anywhere">{a.titulo}</h2>
              <p className="mt-1 whitespace-pre-line text-sm wrap-anywhere">{a.texto}</p>
            </article>
          ))}
        </div>
      ) : (
        <EstadoVazio icone={Megaphone} titulo="Nenhum aviso no momento." texto="Quando a coordenação publicar um recado para os voluntários, ele aparece aqui." />
      )}
      {marcou && <AtualizarNovidades />}
    </div>
  )
}
