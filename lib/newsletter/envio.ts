import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { emailDaNewsletter } from '@/lib/newsletter/modelo'
import { urlDeSaida, urlDeSaidaEmUmClique } from '@/lib/newsletter/contexto'
import { enviarLote, emLotes, emailConfigurado, semChave, type Mensagem } from '@/lib/newsletter/resend'

/**
 * A remessa de uma edição para a lista.
 *
 * TETO DE DESTINATÁRIOS, e por que ele existe
 *
 * Uma função da Vercel morre no tempo limite dela. Cada chamada de lote leva
 * um par de segundos e leva 100 endereços; com o teto abaixo, a remessa cabe
 * folgada no orçamento de tempo.
 *
 * Acima do teto, esta função RECUSA em vez de mandar para uma parte da lista.
 * Meia remessa é o pior resultado possível: ninguém sabe quem recebeu, e
 * reenviar duplica para quem já tinha recebido. Recusar dizendo o número é
 * ruim e visível; mandar pela metade é ruim e invisível.
 *
 * Quando a lista se aproximar disto, o envio precisa virar fila com registro
 * de quem já recebeu — trabalho de verdade, não um ajuste de constante. Subir
 * o número sem construir a fila só adia o problema para uma edição maior.
 */
export const TETO_DE_DESTINATARIOS = 1000

export type ResultadoDaRemessa = {
  enviados: number
  destinatarios: number
  /** A remessa foi agendada, não entregue: "enviados" ainda não é "recebidos". */
  agendada: boolean
  erro?: string
}

type Inscrito = { email: string; nome: string; token_descadastro: string }

/** Quem está confirmado — o único estado que recebe newsletter. */
export async function destinatarios(workspaceId: string): Promise<Inscrito[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('newsletter_inscritos')
    .select('email, nome, token_descadastro')
    .eq('workspace_id', workspaceId)
    .eq('estado', 'confirmado')
    .order('created_at', { ascending: true })
    .limit(TETO_DE_DESTINATARIOS + 1)
  if (error) throw new Error(`Não foi possível ler a lista: ${error.message}`)
  return (data ?? []) as Inscrito[]
}

export type Edicao = {
  assunto: string
  chamada?: string
  paragrafos: string[]
  urlDaMateria?: string
  rotuloDoBotao?: string
  imagemUrl?: string
  /** Quando entregar, em ISO 8601. Ausente = agora. */
  agendarPara?: string
}

/**
 * Monta a mensagem de UMA pessoa.
 *
 * Cada destinatário recebe um HTML próprio porque o link de saída é o dele.
 * Um link de saída compartilhado tiraria a lista inteira no primeiro clique.
 */
function mensagemPara(inscrito: Inscrito, edicao: Edicao): Mensagem {
  const modelo = emailDaNewsletter({
    titulo: edicao.assunto,
    chamada: edicao.chamada,
    paragrafos: edicao.paragrafos,
    urlDaMateria: edicao.urlDaMateria,
    rotuloDoBotao: edicao.rotuloDoBotao,
    imagemUrl: edicao.imagemUrl,
    urlDeSaida: urlDeSaida(inscrito.token_descadastro),
  })
  return {
    para: inscrito.email,
    assunto: modelo.assunto,
    html: modelo.html,
    texto: modelo.texto,
    urlDeSaidaEmUmClique: urlDeSaidaEmUmClique(inscrito.token_descadastro),
    agendarPara: edicao.agendarPara,
  }
}

/**
 * Envia a edição para toda a lista confirmada.
 *
 * Devolve erro-como-valor, no padrão da casa: uma remessa que falha no meio
 * precisa dizer quantos saíram, e não só que deu errado — é a diferença entre
 * saber e não saber se pode reenviar.
 */
export async function enviarEdicao(
  workspaceId: string,
  edicao: Edicao,
): Promise<ResultadoDaRemessa> {
  if (!emailConfigurado()) {
    return { enviados: 0, destinatarios: 0, agendada: false, erro: 'O envio de e-mail não está configurado: falta RESEND_API_KEY nas variáveis de ambiente.' }
  }
  if (!edicao.assunto.trim()) {
    return { enviados: 0, destinatarios: 0, agendada: false, erro: 'A edição precisa de um assunto.' }
  }

  let lista: Inscrito[]
  try {
    lista = await destinatarios(workspaceId)
  } catch (causa) {
    return { enviados: 0, destinatarios: 0, agendada: false, erro: semChave(causa instanceof Error ? causa.message : String(causa)) }
  }

  // Lista vazia é falha, não sucesso silencioso. "Publicada" com zero
  // destinatários esconderia justamente o problema mais provável de todos: o
  // formulário do site parou de gravar e ninguém percebeu.
  if (!lista.length) {
    return { enviados: 0, destinatarios: 0, agendada: false, erro: 'Não há nenhum inscrito confirmado para receber esta edição.' }
  }

  if (lista.length > TETO_DE_DESTINATARIOS) {
    return {
      enviados: 0,
      destinatarios: lista.length,
      agendada: false,
      erro: `A lista tem mais de ${TETO_DE_DESTINATARIOS} inscritos, e o envio de uma vez só não cabe no tempo da função. Nada foi enviado — meia remessa seria pior. É preciso construir o envio em fila antes desta edição.`,
    }
  }

  const mensagens = lista.map((i) => mensagemPara(i, edicao))
  let enviados = 0

  for (const lote of emLotes(mensagens)) {
    try {
      const { enviados: n } = await enviarLote(lote)
      enviados += n
    } catch (causa) {
      // Para no primeiro lote que falha. Continuar tentando os seguintes
      // depois de a API recusar quase sempre significa multiplicar a mesma
      // falha — e cada tentativa gasta tempo da função que a remessa não tem.
      return {
        enviados,
        destinatarios: lista.length,
        agendada: Boolean(edicao.agendarPara),
        erro: `${semChave(causa instanceof Error ? causa.message : String(causa))} Saíram ${enviados} de ${lista.length} antes da falha.`,
      }
    }
  }

  return { enviados, destinatarios: lista.length, agendada: Boolean(edicao.agendarPara) }
}
