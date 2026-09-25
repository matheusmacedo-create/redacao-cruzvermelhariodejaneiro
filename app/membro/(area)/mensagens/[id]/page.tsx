import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Clock, Tag } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { autorDaMensagem, categoriaLegivel, conversaDoMembro, dataEHora, horaDaMensagem, situacaoDaConversa } from '@/lib/membro/canal'
import { createAdminClient } from '@/lib/supabase/admin'
import { novaParaOMembro } from '@/lib/canal/regras'
import { cn } from '@/lib/utils'
import { AtualizarNovidades, ListaDaConversa, Responder, SeloDaConversa } from '@/components/membro/canal'
import { CabecalhoDaPagina, Selo } from '@/components/membro/pecas'

export const dynamic = 'force-dynamic'

// Título fixo: o assunto é da pessoa e pode ser longo; o H1 da página já o mostra.
export const metadata: Metadata = { title: 'Conversa' }

/** Uma conversa com a coordenação. Largura de leitura, alinhada à esquerda como Avisos. */
export default async function Conversa({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await exigirMembro()
  const d = await conversaDoMembro(m, id)
  if (!d) notFound()
  const { conversa, mensagens } = d
  // Abrir a conversa conta como leitura da resposta. Se marcou, o número de
  // novidades do layout (calculado na mesma requisição) já está velho.
  let marcou = false
  if (!m.previa && novaParaOMembro(conversa)) {
    const { error } = await createAdminClient().rpc('membro_ler_conversa', { p_participante_id: m.participanteId, p_conversa_id: id })
    marcou = !error
  }
  const agora = new Date()
  const ultima = mensagens.at(-1)
  const aguardando = conversa.situacao === 'aberta' && ultima?.autor === 'membro'
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <CabecalhoDaPagina voltar={{ href: '/membro/mensagens', rotulo: 'Mensagens' }} titulo={<span className="wrap-anywhere">{conversa.assunto}</span>}>
        <div className="flex flex-wrap gap-2">
          <Selo icone={Tag}><span className="sr-only">Categoria: </span>{categoriaLegivel(conversa.categoria)}</Selo>
          <SeloDaConversa {...situacaoDaConversa(conversa, { naLista: false })} />
        </div>
      </CabecalhoDaPagina>
      <ListaDaConversa total={mensagens.length}>
        {mensagens.map((x) => {
          const minha = x.autor === 'membro'
          return (
            // `scroll-mt-4`: ao rolar até uma mensagem, sobra um respiro acima dela.
            <li key={x.id} id={`mensagem-${x.id}`} className={cn('flex scroll-mt-4 flex-col gap-1', minha ? 'items-end' : 'items-start')}>
              <p className="px-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{autorDaMensagem(x)}</span>
                {' · '}<time dateTime={x.created_at} title={dataEHora(x.created_at)}>{horaDaMensagem(x.created_at, agora)}</time>
              </p>
              <div className={cn('max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm wrap-anywhere', minha ? 'rounded-br-md bg-primary/10 text-foreground' : 'rounded-bl-md border border-border bg-card')}>{x.texto}</div>
            </li>
          )
        })}
      </ListaDaConversa>
      {aguardando && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />Quando a coordenação responder, a resposta chega aqui e no seu e-mail.
        </p>
      )}
      <Responder conversaId={id} encerrada={conversa.situacao === 'encerrada'} />
      {marcou && <AtualizarNovidades />}
    </div>
  )
}
