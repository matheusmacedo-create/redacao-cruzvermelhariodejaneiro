'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { urlBase } from '@/lib/newsletter/contexto'
import { exigirMembroQueEscreve } from '@/lib/membro/sessao'
import { codigoConfere, configDoWhatsapp, gerarCodigo, hashDoCodigo, mandar, temWhatsapp } from '@/lib/whatsapp/servidor'
import { entregar } from '@/lib/whatsapp/fila'
import {
  CODIGOS_POR_JANELA, CODIGO_TENTATIVAS, CODIGO_VALIDADE_MIN, JANELA_DOS_CODIGOS_MIN, codigoNoFormato, formatarNumero, numeroCanonico,
} from '@/lib/whatsapp/regras'
import { consentimentoGuardado, textoDoCodigoDoVoluntario, textoDoMenuDoVoluntario } from '@/lib/whatsapp/voluntarios-regras'

/**
 * O WhatsApp na Área do Voluntário: confirmar o próprio número com um código
 * mandado a ele, autorizar (LGPD) receber as oportunidades por lá, sair e
 * voltar, e tirar o número. Tudo pelo servidor, com a sessão do voluntário
 * (exigirMembroQueEscreve: a prévia da equipe não mexe em nada).
 */

type Resultado = { erro?: string; recado?: string }

/** O código amarrado ao voluntário (o prefixo separa do código de quem é da equipe). */
const dono = (participanteId: string) => `voluntario:${participanteId}`

export async function pedirCodigoDoVoluntario(formData: FormData): Promise<Resultado & { numero?: string }> {
  try {
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

    if (await temWhatsapp(config, numero) === false) throw new Error(`${formatarNumero(numero)} não tem WhatsApp. Confira os dígitos.`)

    const codigo = gerarCodigo()
    const { error } = await admin.from('participantes_whatsapp').upsert({
      participante_id: m.participanteId, workspace_id: m.workspaceId, numero_pendente: numero, codigo_hash: hashDoCodigo(dono(m.participanteId), numero, codigo),
      codigo_expira_em: new Date(agora.getTime() + CODIGO_VALIDADE_MIN * 60_000).toISOString(), codigo_tentativas: 0,
      codigos_desde: janelaAberta ? atual?.codigos_desde : agora.toISOString(), codigos_na_janela: naJanela + 1, atualizado_em: agora.toISOString(),
    }, { onConflict: 'participante_id' })
    if (error) throw new Error('Não foi possível gerar o código.')

    const envio = await mandar(admin, m.workspaceId, { numero, texto: textoDoCodigoDoVoluntario(codigo, CODIGO_VALIDADE_MIN), tipo: 'codigo', userId: null, config })
    if (!envio.ok && envio.semResposta) {
      return { recado: `O WhatsApp demorou a confirmar o envio para ${formatarNumero(numero)}. O código deve chegar em instantes: digite abaixo quando chegar.`, numero: formatarNumero(numero) }
    }
    if (!envio.ok) throw new Error(`O código não saiu: ${envio.erro}`)
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
    if (!codigoConfere(p.codigo_hash as string, dono(m.participanteId), numero, codigo)) {
      await admin.from('participantes_whatsapp').update({ codigo_tentativas: tentativas + 1 }).eq('participante_id', m.participanteId).eq('codigo_tentativas', tentativas)
      const restam = CODIGO_TENTATIVAS - tentativas - 1
      throw new Error(restam > 0 ? `Código errado. ${restam === 1 ? 'Resta 1 tentativa' : `Restam ${restam} tentativas`}.` : 'Código errado. Peça um código novo.')
    }

    // Consome o código e guarda o número com a autorização, de uma vez: dois cliques não confirmam duas vezes.
    const agora = new Date().toISOString()
    const { data: confirmado, error } = await admin.from('participantes_whatsapp').update({
      numero, confirmado_em: agora, consentimento_em: agora, consentimento_texto: consentimentoGuardado(), pausado_em: null,
      numero_pendente: null, codigo_hash: null, codigo_expira_em: null, codigo_tentativas: 0, atualizado_em: agora,
    }).eq('participante_id', m.participanteId).eq('codigo_hash', p.codigo_hash as string).select('participante_id').maybeSingle()
    if (error?.code === '23505') throw new Error('Esse número acabou de ser confirmado por outro voluntário.')
    if (error) throw new Error('Não foi possível guardar o número.')
    if (!confirmado) throw new Error('Esse código já foi usado. Peça um novo.')

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
