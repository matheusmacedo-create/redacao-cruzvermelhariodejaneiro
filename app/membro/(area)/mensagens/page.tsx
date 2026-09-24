import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { conversasDoMembro } from '@/lib/membro/canal'
import { CATEGORIAS_DA_CONVERSA, SITUACOES_DA_CONVERSA, haQuanto, novaParaOMembro } from '@/lib/canal/regras'
import { NovaConversa } from '@/components/membro/canal'

export const dynamic = 'force-dynamic'

/** O canal direto com a coordenação do Voluntariado. */
export default async function Mensagens() {
  const m = await exigirMembro()
  const conversas = await conversasDoMembro(m)
  const agora = new Date()
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mensagens</h1>
          <p className="text-sm text-neutral-600">Fale direto com a coordenação do Voluntariado. A resposta chega aqui e no seu e-mail.</p>
        </div>
      </div>
      <NovaConversa />
      {conversas.length ? (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white" id="conversas">
          {conversas.map((c) => {
            const nova = novaParaOMembro(c)
            return (
              <li key={c.id}>
                <Link href={`/membro/mensagens/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50">
                  <span className={`size-2 shrink-0 rounded-full ${nova ? 'bg-[#e32219]' : 'bg-transparent'}`} aria-label={nova ? 'Resposta nova' : undefined} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${nova ? 'font-semibold' : 'font-medium'}`}>{c.assunto}</span>
                    <span className="block text-xs text-neutral-500">{CATEGORIAS_DA_CONVERSA[c.categoria as keyof typeof CATEGORIAS_DA_CONVERSA] ?? c.categoria} · {SITUACOES_DA_CONVERSA[c.situacao as keyof typeof SITUACOES_DA_CONVERSA]}</span>
                  </span>
                  <span className="shrink-0 text-xs text-neutral-500">{haQuanto(c.atualizada_em, agora)}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
          <MessageCircle className="size-8 text-neutral-400" />
          <p className="font-medium">Nenhuma conversa ainda.</p>
          <p className="text-sm text-neutral-500">Dúvidas sobre ações, disponibilidade, certificados, sugestões — é só escrever.</p>
        </div>
      )}
    </div>
  )
}
