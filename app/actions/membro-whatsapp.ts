'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { ehControleDoNext, mensagemDoErro } from '@/lib/erro-de-acao'
import { urlBase } from '@/lib/newsletter/contexto'
import { exigirMembro, exigirMembroQueEscreve } from '@/lib/membro/sessao'
import { codigoConfere, configDoWhatsapp, gerarCodigo, hashDoCodigo, mandar, perfilConectado } from '@/lib/whatsapp/servidor'
import { entregar } from '@/lib/whatsapp/fila'
import { confirmarNumeroDoVoluntario, donoDoVoluntario as dono } from '@/lib/whatsapp/confirmacao'
import {
  CODIGOS_POR_JANELA, CODIGO_TENTATIVAS, CODIGO_VALIDADE_MIN, JANELA_DOS_CODIGOS_MIN, codigoNoFormato, formatarNumero, linkDoWhatsapp, numeroCanonico,
  textoDoCodigoDeIda, type SentidoDoCodigo,
} from '@/lib/whatsapp/regras'
import { textoDoCodigoDoVoluntario, textoDoMenuDoVoluntario } from '@/lib/whatsapp/voluntarios-regras'

/**
 * O WhatsApp na Área do Voluntário: confirmar o próprio número, autorizar
 * (LGPD) receber as oportunidades por lá, sair e voltar, e tirar o número.
 * Tudo pelo servidor, com a sessão do voluntário (exigirMembroQueEscreve: a
 * prévia da equipe não mexe em nada).
 *
 * A confirmação tem os dois caminhos de Meu perfil (lib/whatsapp/regras.ts):
 * o padrão, em que o voluntário manda ao Palácio o código que a tela mostra
 * (o bot confere), e a alternativa, em que o código chega no número e ele
 * digita. O código em andamento fica na própria linha (participantes_whatsapp).
 */

type Resultado = { erro?: string; recado?: string }

/** O código de ida na tela: o número a confirmar, o código, o número do Palácio e o link com a mensagem pronta. */
export type CodigoDeIdaDoVoluntario = { numero: string; codigo: string; palacio: string | null; link: string | null; desde: string; expiraEm: string }

/**
 * O começo dos dois caminhos: a autorização marcada, o número livre e o limite
 * de códigos (o de ida e o de volta contam juntos). Guarda o hash do código
 * novo no lugar do anterior: só o último vale.
 */
async function novoCodigoDoVoluntario(formData: FormData, sentido: SentidoDoCodigo) {
  const m = await exigirMembroQueEscreve()
  if (formData.get('autorizo') !== '1') throw new Error('Marque a autorização para receber as oportunidades pelo WhatsApp.')
  const numero = numeroCanonico(String(formData.get('numero') ?? ''))
  if (!numero) throw new Error('Número inválido. Use DDD e número, como (21) 98765-4321.')
  const admin = createAdminClient()
  const config = await configDoWhatsapp(m.workspaceId)
  if (!config) throw new Error('O WhatsApp do Voluntariado ainda não está ligado. Tente mais tarde.')

  const { data: outro, error: semTabela } = await admin.from('participantes_whatsapp').select('participante_id').eq('numero', numero).maybeSingle()
  if (semTabela) throw new Error('O WhatsApp ainda não está pronto. Tente mais tarde.')
  if (outro && outro.participante_id !== m.participanteId) throw new Error('Esse número já está confirmado por outro voluntário.')

  const { data: atual } = await admin.from('participantes_whatsapp').select('codigos_desde, codigos_na_janela').eq('participante_id', m.participanteId).maybeSingle()
  const agora = new Date()
  const janelaAberta = atual?.codigos_desde && agora.getTime() - new Date(atual.codigos_desde as string).getTime() < JANELA_DOS_CODIGOS_MIN * 60_000
  const naJanela = janelaAberta ? Number(atual?.codigos_na_janela ?? 0) : 0
  if (naJanela >= CODIGOS_POR_JANELA) throw new Error(`Você já pediu ${CODIGOS_POR_JANELA} códigos nos últimos ${JANELA_DOS_CODIGOS_MIN} minutos. Espere um pouco e tente de novo.`)

  const codigo = gerarCodigo()
  const expiraEm = new Date(agora.getTime() + CODIGO_VALIDADE_MIN * 60_000).toISOString()
  const { error } = await admin.from('participantes_whatsapp').upsert({
    participante_id: m.participanteId, workspace_id: m.workspaceId, numero_pendente: numero, codigo_hash: hashDoCodigo(dono(m.participanteId), numero, codigo, sentido),
    codigo_expira_em: expiraEm, codigo_tentativas: 0,
    codigos_desde: janelaAberta ? atual?.codigos_desde : agora.toISOString(), codigos_na_janela: naJanela + 1, atualizado_em: agora.toISOString(),
  }, { onConflict: 'participante_id' })
  if (error) throw new Error('Não foi possível gerar o código.')
  return { m, admin, config, numero, codigo, desde: agora.toISOString(), expiraEm }
}

/**
 * O caminho padrão: a tela mostra o código e o voluntário manda ao número do
 * Palácio pelo link (mensagem pronta). Nada sai daqui, então não depende da
 * janela de 24 h nem de modelo. O bot confere e confirma.
 */
export async function gerarCodigoDeIdaDoVoluntario(formData: FormData): Promise<Resultado & { ida?: CodigoDeIdaDoVoluntario }> {
  try {
    const { config, numero, codigo, desde, expiraEm } = await novoCodigoDoVoluntario(formData, 'ida')
    const { numero: doPalacio } = await perfilConectado(config)
    return {
      ida: {
        numero: formatarNumero(numero), codigo, palacio: doPalacio ? formatarNumero(doPalacio) : null,
        link: linkDoWhatsapp(doPalacio, textoDoCodigoDeIda(codigo, 'voluntariado')), desde, expiraEm,
      },
    }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível gerar o código.') }
  }
}

/** A tela do código de ida pergunta, a cada poucos segundos, se o bot já confirmou aquele número. Só lê. */
export async function conferirConfirmacaoDoVoluntario(numeroNaTela: string, desde: string): Promise<{ confirmado: boolean; valendo: boolean }> {
  try {
    const m = await exigirMembro()
    const numero = numeroCanonico(numeroNaTela)
    if (!numero) return { confirmado: false, valendo: false }
    const { data: p } = await createAdminClient().from('participantes_whatsapp')
      .select('numero, confirmado_em, numero_pendente, codigo_hash, codigo_expira_em, codigo_tentativas').eq('participante_id', m.participanteId).maybeSingle()
    const confirmado = Boolean(p?.numero === numero && p.confirmado_em && new Date(p.confirmado_em as string).getTime() >= new Date(desde).getTime())
    const valendo = Boolean(p?.numero_pendente === numero && p.codigo_hash && p.codigo_expira_em && new Date(p.codigo_expira_em as string) > new Date()
      && Number(p.codigo_tentativas ?? 0) < CODIGO_TENTATIVAS)
    return { confirmado, valendo }
  } catch (causa) {
    if (ehControleDoNext(causa)) throw causa
    return { confirmado: false, valendo: true }
  }
}

/**
 * A alternativa: o código chega no número e o voluntário digita. Só chega dentro da janela de 24 h ou pelo modelo de Autenticação.
 * `codigoTrocado`: o envio falhou depois de o código novo tomar o lugar do anterior — o código de ida que
 * a tela mostrava não vale mais, e ela volta ao formulário do número (onde está o “Gerar código”).
 */
export async function pedirCodigoDoVoluntario(formData: FormData): Promise<Resultado & { numero?: string; codigoTrocado?: boolean }> {
  try {
    const { m, admin, config, numero, codigo } = await novoCodigoDoVoluntario(formData, 'volta')
    // Fora da janela de 24 h, o código vai sozinho pelo modelo de Autenticação (o texto é fixo da Meta).
    const envio = await mandar(admin, m.workspaceId, { numero, texto: textoDoCodigoDoVoluntario(codigo, CODIGO_VALIDADE_MIN), tipo: 'codigo', codigo, userId: null, config })
    if (!envio.ok && envio.semResposta) {
      return { recado: `O WhatsApp demorou a confirmar o envio para ${formatarNumero(numero)}. O código deve chegar em instantes: digite abaixo quando chegar.`, numero: formatarNumero(numero) }
    }
    if (!envio.ok) {
      return { erro: `O código não saiu: ${envio.erro} Use “Gerar código” e mande o código pelo WhatsApp: esse caminho não depende disso.`.slice(0, 500), codigoTrocado: true }
    }
    return { recado: `Mandamos um código para ${formatarNumero(numero)} pelo WhatsApp. Ele vale por ${CODIGO_VALIDADE_MIN} minutos.`, numero: formatarNumero(numero) }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mandar o código.') }
  }
}

export async function confirmarCodigoDoVoluntario(formData: FormData): Promise<Resultado> {
  try {
    const m = await exigirMembroQueEscreve()
    if (formData.get('autorizo') !== '1') throw new Error('Marque a autorização para receber as oportunidades pelo WhatsApp.')
    const codigo = String(formData.get('codigo') ?? '').replace(/\D/g, '')
    if (!codigoNoFormato(codigo)) throw new Error('O código tem 6 números.')
    const admin = createAdminClient()
    const { data: p } = await admin.from('participantes_whatsapp').select('numero_pendente, codigo_hash, codigo_expira_em, codigo_tentativas')
      .eq('participante_id', m.participanteId).maybeSingle()
    if (!p?.codigo_hash || !p.numero_pendente || !p.codigo_expira_em || new Date(p.codigo_expira_em as string) <= new Date()) throw new Error('O código venceu ou não foi pedido. Peça um novo.')
    const tentativas = Number(p.codigo_tentativas ?? 0)
    if (tentativas >= CODIGO_TENTATIVAS) {
      await admin.from('participantes_whatsapp').update({ codigo_hash: null, codigo_expira_em: null }).eq('participante_id', m.participanteId)
      throw new Error('Muitas tentativas erradas. Peça um código novo.')
    }
    const numero = p.numero_pendente as string
    // Só o código de volta (o que chegou no número): o de ida, mostrado na tela, não serve aqui.
    if (!codigoConfere(p.codigo_hash as string, dono(m.participanteId), numero, codigo, 'volta')) {
      await admin.from('participantes_whatsapp').update({ codigo_tentativas: tentativas + 1 }).eq('participante_id', m.participanteId).eq('codigo_tentativas', tentativas)
      const restam = CODIGO_TENTATIVAS - tentativas - 1
      throw new Error(restam > 0 ? `Código errado. ${restam === 1 ? 'Resta 1 tentativa' : `Restam ${restam} tentativas`}.` : 'Código errado. Peça um código novo.')
    }

    // Consome o código e guarda o número com a autorização, de uma vez: dois cliques não confirmam duas vezes.
    const r = await confirmarNumeroDoVoluntario(admin, { participanteId: m.participanteId, numero, codigoHash: p.codigo_hash as string })
    if (!r.ok) {
      throw new Error(r.motivo === 'usado' ? 'Esse código já foi usado. Peça um novo.'
        : r.motivo === 'outra_conta' ? 'Esse número acabou de ser confirmado por outro voluntário.' : 'Não foi possível guardar o número.')
    }

    await entregar(admin, m.workspaceId, {
      numero, tipo: 'bot', userId: null,
      texto: `Pronto: as oportunidades de voluntariado passam a chegar por aqui.\n\n${textoDoMenuDoVoluntario({ nome: m.nome, pausado: false, urlBase: urlBase() })}`,
    })
    revalidatePath('/membro/perfil')
    return { recado: `WhatsApp confirmado: ${formatarNumero(numero)}.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível confirmar o código.') }
  }
}

export async function pausarWhatsappDoVoluntario(pausar: boolean): Promise<Resultado> {
  try {
    const m = await exigirMembroQueEscreve()
    const agora = new Date().toISOString()
    const { error } = await createAdminClient().from('participantes_whatsapp').update({ pausado_em: pausar ? agora : null, atualizado_em: agora })
      .eq('participante_id', m.participanteId).not('numero', 'is', null)
    if (error) throw new Error('Não foi possível salvar.')
    revalidatePath('/membro/perfil')
    return { recado: pausar ? 'Pronto: as oportunidades não chegam mais pelo WhatsApp.' : 'Pronto: as oportunidades voltam a chegar pelo WhatsApp.' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar.') }
  }
}

/** Tira o número e a autorização (a pessoa retira o consentimento). */
export async function removerWhatsappDoVoluntario(): Promise<Resultado> {
  try {
    const m = await exigirMembroQueEscreve()
    const { error } = await createAdminClient().from('participantes_whatsapp').delete().eq('participante_id', m.participanteId)
    if (error) throw new Error('Não foi possível remover.')
    revalidatePath('/membro/perfil')
    return { recado: 'Número removido. Nada mais chega pelo WhatsApp.' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível remover.') }
  }
}
