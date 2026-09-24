import { notFound } from 'next/navigation'
import { Chat } from '@/components/app/chat/chat'
import { contextoDoChat, painelDoChat, pessoasDoChat } from '@/lib/chat/servidor'
import { COLUNAS_DA_MENSAGEM, POR_PAGINA, type MensagemDoChat } from '@/lib/chat/regras'
import { tituloDaArea } from '@/lib/navegacao'

export const metadata = { title: tituloDaArea('/chat') }
export const dynamic = 'force-dynamic'

const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v)

/**
 * Uma conversa do chat: a lista da lateral, as últimas mensagens principais
 * (as respostas ficam no fio) e quem está nela. Abrir marca como lida. O
 * resto (chegar, editar, apagar, reagir, responder) vem ao vivo pelo Realtime.
 *
 * ?fio=<id> abre o fio daquela mensagem; ?m=<id> leva até a mensagem (vinda
 * da busca ou de um aviso) e carrega a conversa em volta dela.
 */
export default async function ConversaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fio?: string; m?: string }> }) {
  const { id } = await params
  const { fio: fioPedido, m: alvoPedido } = await searchParams
  if (!uuid(id)) notFound()
  const { context, supabase } = await contextoDoChat()
  const ws = context.workspace.id
  const conversas = await painelDoChat(supabase, ws)
  const atual = conversas.find((c) => c.id === id)
  if (!atual) notFound()

  // A mensagem pedida: se é resposta, abre o fio e a conversa vai até a principal.
  const { data: alvo } = uuid(alvoPedido)
    ? await supabase.from('chat_mensagens').select('id, created_at, resposta_de').eq('id', alvoPedido).eq('canal_id', id).maybeSingle()
    : { data: null }
  const fioId = alvo?.resposta_de ?? (uuid(fioPedido) ? fioPedido : null)
  const { data: ancora } = alvo?.resposta_de
    ? await supabase.from('chat_mensagens').select('id, created_at').eq('id', alvo.resposta_de).maybeSingle()
    : { data: alvo }

  const principais = () => supabase.from('chat_mensagens').select(COLUNAS_DA_MENSAGEM).eq('canal_id', id).is('resposta_de', null)
  const [antes, depois, { data: membros }, pessoas, fio] = await Promise.all([
    ancora
      ? principais().lte('created_at', ancora.created_at).order('created_at', { ascending: false }).limit(31)
      : principais().order('created_at', { ascending: false }).limit(POR_PAGINA + 1),
    ancora ? principais().gt('created_at', ancora.created_at).order('created_at').limit(400) : Promise.resolve({ data: [] }),
    supabase.from('chat_membros').select('user_id').eq('canal_id', id),
    pessoasDoChat(ws, context.user.id, context.role === 'escola'),
    fioId
      ? Promise.all([
          supabase.from('chat_mensagens').select(COLUNAS_DA_MENSAGEM).eq('id', fioId).eq('canal_id', id).is('resposta_de', null).maybeSingle(),
          supabase.from('chat_mensagens').select(COLUNAS_DA_MENSAGEM).eq('resposta_de', fioId).order('created_at').limit(500),
        ])
      : null,
  ])
  if (atual.membro && atual.nao_lidas > 0) {
    await supabase.rpc('chat_ler', { p_canal_id: id })
  }
  const pagina = ancora ? 30 : POR_PAGINA
  const anteriores = (antes.data ?? []) as MensagemDoChat[]
  const lista = [...anteriores.slice(0, pagina).reverse(), ...((depois.data ?? []) as MensagemDoChat[])]
  const fioInicial = fio?.[0].data ? { pai: fio[0].data as MensagemDoChat, respostas: (fio[1].data ?? []) as MensagemDoChat[] } : null
  const lidas = conversas.map((c) => (c.id === id ? { ...c, nao_lidas: 0, mencoes: 0 } : c))
  return (
    <Chat key={`${id}:${alvo?.id ?? ''}`} eu={context.user.id} ehAdmin={context.role === 'admin'} redacao={context.role !== 'escola'}
      conversas={lidas} atual={{ ...atual, nao_lidas: 0, mencoes: 0 }} mensagens={lista} temMais={anteriores.length > pagina}
      membros={(membros ?? []).map((m) => m.user_id as string)} pessoas={pessoas} fioInicial={fioInicial} destaque={alvo?.id ?? null} />
  )
}
