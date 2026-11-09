import 'server-only'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { EmailError, enviarLote, semChave, TAMANHO_DO_LOTE, type Mensagem } from '@/lib/newsletter/resend'
import { urlBase } from '@/lib/newsletter/contexto'
import { emailDaCampanha, podeTerSaido, valeTentarDeNovo } from '@/lib/imprensa/campanha'

/**
 * A fila das campanhas de imprensa: quem tira os lotes do banco e entrega ao
 * Resend. Roda em três lugares — logo depois de "Enviar" (a action espera as
 * campanhas pequenas e solta as grandes com after()), e a cada minuto pelo
 * relógio do banco (/api/comunicados/fila), que cuida das agendadas e do que
 * sobrou.
 *
 * As regras que decidem QUEM recebe moram no banco (migração 20261109120000):
 * enfileirar_campanha monta a lista e reservar_lote_de_campanha entrega um
 * lote por vez, a um trabalhador por vez. Aqui só se monta a mensagem, envia
 * e confirma. Se esta função morrer no meio, nada se perde em silêncio: o
 * lote reservado e não confirmado vira falha em 10 minutos, com o aviso de
 * que pode ter saído, e o resto continua na fila para o minuto seguinte.
 */

const REMETENTE_PADRAO = 'Cruz Vermelha RJ — Comunicação <imprensa@noticias.cruzvermelhariodejaneiro.org>'
export const remetenteDaCampanha = () => process.env.IMPRENSA_REMETENTE?.trim() || REMETENTE_PADRAO
export const respostaDaCampanha = () => process.env.IMPRENSA_RESPONDER_PARA?.trim() || undefined

export const urlDoPixel = (token: string) => `${urlBase()}/api/comunicados/abertura/${token}`
export const urlDoClique = (token: string) => `${urlBase()}/api/comunicados/clique/${token}`
// c = o destinatário: diz qual campanha fez a pessoa sair.
export const urlDeSaidaDoContato = (token: string, c: string) => `${urlBase()}/comunicados/sair?t=${token}&c=${c}`
export const urlDeSaidaEmUmCliqueDoContato = (token: string, c: string) => `${urlBase()}/api/comunicados/sair?t=${token}&c=${c}`

/** O Resend aceita 10 chamadas por segundo por conta, e a conta é a mesma dos
 * e-mails de acesso e dos avisos: a campanha não pode tomar a vez deles. */
const PAUSA_ENTRE_LOTES_MS = 600
const ESPERA_ANTES_DE_REPETIR_MS = [2_000, 5_000]
/** Uma chamada ao Resend pode levar até 20 s; repetida duas vezes, um lote
 * sozinho passa de um minuto. Não se começa lote novo sem esta folga. */
const FOLGA_PARA_UM_LOTE_MS = 5_000

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Admin = ReturnType<typeof createAdminClient>
type Linha = { id: string; campanha_id: string; contato_id: string | null; email: string; nome: string; token_abertura: string }
type Campanha = { assunto: string; corpo: string; link_url: string; link_rotulo: string }

export type ResultadoDaFila = { lotes: number; enviados: number; falhas: number; fechadas: number }

async function falharLinhas(admin: Admin, ids: string[], motivo: string) {
  if (!ids.length) return
  const { error } = await admin.from('press_campanha_destinatarios')
    .update({ estado: 'falhou', erro: motivo.slice(0, 500) }).in('id', ids).eq('estado', 'enviando')
  if (error) console.error('[comunicados] falha não registrada:', error.message)
}

/** Envia um lote já reservado e grava o resultado. Nunca lança. */
async function enviarUmLote(admin: Admin, lote: Linha[], campanhas: Map<string, Campanha | null>, prazo: number): Promise<{ enviados: number; falhas: number }> {
  const campanhaId = lote[0].campanha_id
  if (!campanhas.has(campanhaId)) {
    const { data } = await admin.from('press_campanhas')
      .select('assunto, corpo, link_url, link_rotulo').eq('id', campanhaId).maybeSingle()
    campanhas.set(campanhaId, data ?? null)
  }
  const campanha = campanhas.get(campanhaId)
  const todos = lote.map((d) => d.id)
  if (!campanha) {
    await falharLinhas(admin, todos, 'A campanha não foi encontrada na hora do envio.')
    return { enviados: 0, falhas: lote.length }
  }

  // O link de saída é do contato, e não da campanha: sem ele a mensagem não sai.
  const contatos = [...new Set(lote.map((d) => d.contato_id).filter((c): c is string => Boolean(c)))]
  const { data: tokens, error: erroTokens } = await admin.from('press_contacts')
    .select('id, token_descadastro').in('id', contatos)
  if (erroTokens) {
    await falharLinhas(admin, todos, 'Não foi possível ler os contatos na hora do envio.')
    return { enviados: 0, falhas: lote.length }
  }
  const tokenDoContato = new Map((tokens ?? []).map((c) => [c.id as string, c.token_descadastro as string]))
  const prontos = lote.filter((d) => d.contato_id && tokenDoContato.has(d.contato_id))
  const semContato = lote.filter((d) => !prontos.includes(d)).map((d) => d.id)
  await falharLinhas(admin, semContato, 'O contato foi removido do banco antes do envio.')
  if (!prontos.length) return { enviados: 0, falhas: semContato.length }

  const mensagens: Mensagem[] = prontos.map((d) => {
    const tokenSaida = tokenDoContato.get(d.contato_id as string) as string
    const email = emailDaCampanha({
      assunto: campanha.assunto, corpo: campanha.corpo, nome: d.nome,
      linkUrl: campanha.link_url, linkRotulo: campanha.link_rotulo,
      urlDoClique: urlDoClique(d.token_abertura),
      urlDoPixel: urlDoPixel(d.token_abertura),
      urlDeSaida: urlDeSaidaDoContato(tokenSaida, d.token_abertura),
    })
    return {
      para: d.email,
      assunto: email.assunto,
      html: email.html,
      texto: email.texto,
      urlDeSaidaEmUmClique: urlDeSaidaEmUmCliqueDoContato(tokenSaida, d.token_abertura),
      de: remetenteDaCampanha(),
      responderPara: respostaDaCampanha(),
    }
  })
  const ids = prontos.map((d) => d.id)
  // A mesma chave em toda tentativa deste lote: se a primeira chegou ao Resend
  // e só a resposta se perdeu, a repetição devolve os mesmos ids sem reenviar.
  const chaveDeIdempotencia = `campanha-lote/${randomUUID()}`

  for (let tentativa = 0; ; tentativa++) {
    try {
      const { ids: resendIds } = await enviarLote(mensagens, { chaveDeIdempotencia })
      const confirmar = () => admin.rpc('confirmar_lote_de_campanha', { p_ids: ids, p_resend_ids: resendIds })
      let { error } = await confirmar()
      if (error) ({ error } = await confirmar())
      // As mensagens saíram; se o banco não confirmou, as linhas ficam
      // reservadas e viram "não confirmado" em 10 minutos — nunca "falhou" já.
      if (error) console.error('[comunicados] lote enviado e não confirmado:', error.message)
      return { enviados: prontos.length, falhas: semContato.length }
    } catch (causa) {
      const status = causa instanceof EmailError ? causa.status : 0
      const motivo = semChave(causa instanceof Error ? causa.message : String(causa))
      const espera = ESPERA_ANTES_DE_REPETIR_MS[tentativa] ?? 5_000
      if (valeTentarDeNovo(status, motivo, tentativa) && Date.now() + espera < prazo) {
        await pausa(espera)
        continue
      }
      await falharLinhas(admin, ids, podeTerSaido(status) ? `${motivo} A mensagem pode ter saído: confira antes de reenviar.` : motivo)
      return { enviados: 0, falhas: lote.length }
    }
  }
}

/**
 * Trabalha na fila por até `orcamentoMs`: reserva um lote, envia, confirma, e
 * de novo. No fim, fecha as campanhas que esvaziaram e solta a vez.
 *
 * Só um trabalhador envia por vez (o banco decide): quem chega com outro
 * trabalhando volta sem ter feito nada, e isso não é erro. Nunca lança.
 */
export async function processarFila(orcamentoMs: number): Promise<ResultadoDaFila> {
  const resultado: ResultadoDaFila = { lotes: 0, enviados: 0, falhas: 0, fechadas: 0 }
  let admin: Admin
  try { admin = createAdminClient() } catch (causa) {
    console.error('[comunicados] fila sem banco:', causa instanceof Error ? causa.message : causa)
    return resultado
  }
  const trabalhador = randomUUID()
  const prazo = Date.now() + orcamentoMs
  const campanhas = new Map<string, Campanha | null>()

  try {
    while (Date.now() + FOLGA_PARA_UM_LOTE_MS < prazo) {
      const { data, error } = await admin.rpc('reservar_lote_de_campanha', { p_trabalhador: trabalhador, p_tamanho: TAMANHO_DO_LOTE })
      if (error) { console.error('[comunicados] fila não reservou lote:', error.message); break }
      const lote = (data ?? []) as Linha[]
      if (!lote.length) break
      if (resultado.lotes > 0) await pausa(PAUSA_ENTRE_LOTES_MS)
      resultado.lotes += 1
      const r = await enviarUmLote(admin, lote, campanhas, prazo)
      resultado.enviados += r.enviados
      resultado.falhas += r.falhas
    }
  } catch (causa) {
    console.error('[comunicados] fila interrompida:', causa instanceof Error ? causa.message : causa)
  } finally {
    try {
      const { data, error } = await admin.rpc('concluir_campanhas_terminadas')
      if (error) console.error('[comunicados] campanhas não fechadas:', error.message)
      resultado.fechadas = Number(data) || 0
      // Solta a vez: o próximo minuto (ou a próxima campanha) não espera os 2
      // minutos da reserva vencerem.
      await admin.from('press_campanhas').update({ trabalhador: null, trabalhando_ate: null }).eq('trabalhador', trabalhador)
    } catch (causa) {
      console.error('[comunicados] fila não fechou:', causa instanceof Error ? causa.message : causa)
    }
  }
  return resultado
}
