'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { createAdminClient } from '@/lib/supabase/admin'
import { ehControleDoNext, mensagemDoErro } from '@/lib/erro-de-acao'
import { auditarConta } from '@/lib/contas/servidor'
import { urlBase } from '@/lib/newsletter/contexto'
import { CATEGORIAS, type Categoria } from '@/lib/notificacoes/regras'
import {
  CODIGOS_POR_JANELA, CODIGO_TENTATIVAS, CODIGO_VALIDADE_MIN, JANELA_DOS_CODIGOS_MIN, WHATSAPP_PADRAO,
  codigoNoFormato, formatarNumero, linkDoWhatsapp, numeroCanonico, textoDoCodigo, textoDoCodigoDeIda, textoDoMenu, type SentidoDoCodigo,
} from '@/lib/whatsapp/regras'
import { entregar, processarFila } from '@/lib/whatsapp/fila'
import { confirmarNumeroDaEquipe } from '@/lib/whatsapp/confirmacao'
import {
  codigoConfere, configDoWhatsapp, gerarCodigo, hashDoCodigo, ligarWebhook, mandar, perfilConectado,
} from '@/lib/whatsapp/servidor'

/**
 * O WhatsApp do Palácio Virtual: a própria pessoa confirma o número dela
 * (Meu perfil) e a administração conecta o número do Palácio
 * (Configurações → WhatsApp).
 *
 * O número só passa a receber avisos depois de provado: a pessoa manda, dele,
 * o código que a tela mostra (o padrão; o bot confere), ou digita o código
 * que chega nele. Senão bastaria digitar o celular de outra pessoa para mandar
 * a ela os avisos (e o bot atenderia essa pessoa em nome da conta).
 */

type Resultado = { erro?: string; recado?: string }

/** O código de ida na tela: o número a confirmar, o código, o número do Palácio e o link com a mensagem pronta. */
export type CodigoDeIda = { numero: string; codigo: string; palacio: string | null; link: string | null; desde: string; expiraEm: string }

// ------------------------------------------------------------------ Meu perfil

/**
 * O começo dos dois caminhos: confere o número, a conta dona dele e o limite de
 * códigos, e guarda o hash de um código novo. Só o último vale, e o de ida e o
 * de volta contam juntos no limite.
 */
async function novoCodigo(formData: FormData, sentido: SentidoDoCodigo) {
  const context = await requireWorkspace({ escola: true })
  const numero = numeroCanonico(String(formData.get('numero') ?? ''))
  if (!numero) throw new Error('Número inválido. Use DDD e número, como (21) 98765-4321. De fora do Brasil, comece com + e o código do país.')
  const admin = createAdminClient()
  const config = await configDoWhatsapp(context.workspace.id)
  if (!config) throw new Error('O WhatsApp do Palácio Virtual ainda não foi ligado pela administração.')

  const { data: dono, error: semTabela } = await admin.from('whatsapp_contas').select('user_id').eq('numero', numero).maybeSingle()
  if (semTabela) throw new Error('O WhatsApp ainda não está pronto no banco. Avise a administração.')
  if (dono && dono.user_id !== context.user.id) throw new Error('Esse número já está confirmado em outra conta do Palácio Virtual.')

  const janela = new Date(Date.now() - JANELA_DOS_CODIGOS_MIN * 60_000).toISOString()
  const { count } = await admin.from('whatsapp_codigos').select('id', { count: 'exact', head: true }).eq('user_id', context.user.id).gte('criado_em', janela)
  if ((count ?? 0) >= CODIGOS_POR_JANELA) throw new Error(`Você já pediu ${CODIGOS_POR_JANELA} códigos nos últimos ${JANELA_DOS_CODIGOS_MIN} minutos. Espere um pouco e tente de novo.`)

  // Só o último código vale.
  await admin.from('whatsapp_codigos').update({ usado_em: new Date().toISOString() }).eq('user_id', context.user.id).is('usado_em', null)
  const codigo = gerarCodigo()
  const agora = new Date()
  const expiraEm = new Date(agora.getTime() + CODIGO_VALIDADE_MIN * 60_000).toISOString()
  const { error } = await admin.from('whatsapp_codigos').insert({
    user_id: context.user.id, numero, codigo_hash: hashDoCodigo(context.user.id, numero, codigo, sentido), expira_em: expiraEm,
  })
  if (error) throw new Error('Não foi possível gerar o código.')
  return { context, admin, config, numero, codigo, desde: agora.toISOString(), expiraEm }
}

/**
 * O caminho padrão: a tela mostra o código e a pessoa manda ao número do
 * Palácio (o link abre o WhatsApp com a mensagem pronta). Nada sai daqui: quem
 * escreve é a pessoa, então não depende da janela de 24 h nem de modelo. O bot
 * confere e confirma (lib/whatsapp/bot.ts); a tela vê por conferirConfirmacaoDoWhatsapp.
 */
export async function gerarCodigoDeIdaDoWhatsapp(formData: FormData): Promise<Resultado & { ida?: CodigoDeIda }> {
  try {
    const { config, numero, codigo, desde, expiraEm } = await novoCodigo(formData, 'ida')
    // O número do Palácio vem da Kapso; sem ele, a tela mostra só o código e a instrução.
    const { numero: doPalacio } = await perfilConectado(config)
    return {
      ida: {
        numero: formatarNumero(numero), codigo, palacio: doPalacio ? formatarNumero(doPalacio) : null,
        link: linkDoWhatsapp(doPalacio, textoDoCodigoDeIda(codigo)), desde, expiraEm,
      },
    }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível gerar o código.') }
  }
}

/**
 * A tela do código de ida pergunta, a cada poucos segundos, se o bot já
 * confirmou aquele número. Só lê. `valendo` = o código ainda espera a mensagem
 * (não venceu, não foi trocado, não errou demais).
 */
export async function conferirConfirmacaoDoWhatsapp(numeroNaTela: string, desde: string): Promise<{ confirmado: boolean; valendo: boolean }> {
  try {
    const context = await requireWorkspace({ escola: true })
    const numero = numeroCanonico(numeroNaTela)
    if (!numero) return { confirmado: false, valendo: false }
    const admin = createAdminClient()
    const [{ data: conta }, { data: pendente }] = await Promise.all([
      admin.from('whatsapp_contas').select('confirmado_em').eq('user_id', context.user.id).eq('numero', numero).maybeSingle(),
      admin.from('whatsapp_codigos').select('id').eq('user_id', context.user.id).eq('numero', numero).is('usado_em', null)
        .gt('expira_em', new Date().toISOString()).lt('tentativas', CODIGO_TENTATIVAS).limit(1).maybeSingle(),
    ])
    // Só vale a confirmação depois do código: quem já tinha este número e gerou outro não vê "confirmado" antes da hora.
    const confirmado = Boolean(conta && new Date(conta.confirmado_em as string).getTime() >= new Date(desde).getTime())
    return { confirmado, valendo: Boolean(pendente) }
  } catch (causa) {
    if (ehControleDoNext(causa)) throw causa
    // Falha passageira: a tela pergunta de novo daqui a pouco.
    return { confirmado: false, valendo: true }
  }
}

/** A alternativa: o Palácio manda o código ao número e a pessoa digita. Só chega dentro da janela de 24 h ou pelo modelo de Autenticação. */
export async function pedirCodigoDoWhatsapp(formData: FormData): Promise<Resultado & { numero?: string }> {
  try {
    const { context, admin, config, numero, codigo } = await novoCodigo(formData, 'volta')
    // Fora da janela de 24 h, o código vai sozinho pelo modelo de Autenticação (o texto é fixo da Meta).
    const envio = await mandar(admin, context.workspace.id, { numero, texto: textoDoCodigo(codigo), tipo: 'codigo', codigo, userId: context.user.id, config })
    // Sem confirmação a tempo, o código costuma chegar com atraso: a tela abre o campo mesmo assim.
    if (!envio.ok && envio.semResposta) {
      return { recado: `O WhatsApp demorou a confirmar o envio para ${formatarNumero(numero)}. O código deve chegar em instantes: digite abaixo quando chegar. Se não chegar em 2 minutos, peça outro.`, numero: formatarNumero(numero) }
    }
    if (!envio.ok) throw new Error(`O código não saiu: ${envio.erro} Use “Gerar código” e mande o código ao Palácio pelo WhatsApp: esse caminho não depende disso.`)
    return { recado: `Mandamos um código para ${formatarNumero(numero)} pelo WhatsApp. Ele vale por ${CODIGO_VALIDADE_MIN} minutos.`, numero: formatarNumero(numero) }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mandar o código.') }
  }
}

export async function confirmarCodigoDoWhatsapp(formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace({ escola: true })
    const codigo = String(formData.get('codigo') ?? '').replace(/\D/g, '')
    if (!codigoNoFormato(codigo)) throw new Error('O código tem 6 números.')
    const admin = createAdminClient()
    const { data: pendente } = await admin.from('whatsapp_codigos').select('id, numero, codigo_hash, tentativas, expira_em')
      .eq('user_id', context.user.id).is('usado_em', null).order('criado_em', { ascending: false }).limit(1).maybeSingle()
    if (!pendente || new Date(pendente.expira_em as string) <= new Date()) throw new Error('O código venceu ou não foi pedido. Peça um novo.')
    const tentativas = Number(pendente.tentativas ?? 0)
    if (tentativas >= CODIGO_TENTATIVAS) {
      await admin.from('whatsapp_codigos').update({ usado_em: new Date().toISOString() }).eq('id', pendente.id)
      throw new Error('Muitas tentativas erradas. Peça um código novo.')
    }
    const numero = pendente.numero as string
    // Só o código de volta (o que chegou no número): o de ida, mostrado na tela, não serve aqui.
    if (!codigoConfere(pendente.codigo_hash as string, context.user.id, numero, codigo, 'volta')) {
      await admin.from('whatsapp_codigos').update({ tentativas: tentativas + 1 }).eq('id', pendente.id).eq('tentativas', tentativas)
      const restam = CODIGO_TENTATIVAS - tentativas - 1
      throw new Error(restam > 0 ? `Código errado. ${restam === 1 ? 'Resta 1 tentativa' : `Restam ${restam} tentativas`}.` : 'Código errado. Peça um código novo.')
    }

    const r = await confirmarNumeroDaEquipe(admin, { codigoId: pendente.id as string, userId: context.user.id, numero, workspaceId: context.workspace.id, sentido: 'volta' })
    if (!r.ok) {
      throw new Error(r.motivo === 'usado' ? 'Esse código já foi usado. Peça um novo.'
        : r.motivo === 'outra_conta' ? 'Esse número acabou de ser confirmado em outra conta.' : 'Não foi possível guardar o número.')
    }
    // Boas-vindas com o menu: a pessoa vê na hora o que o número faz.
    await entregar(admin, context.workspace.id, {
      numero, tipo: 'bot', userId: context.user.id,
      texto: `Pronto: os avisos do Palácio Virtual passam a chegar por aqui.\n\n${textoDoMenu({ nome: context.profile?.full_name ?? null, pausado: false, urlBase: urlBase() })}`,
    })
    revalidatePath('/perfil')
    return { recado: `WhatsApp confirmado: ${formatarNumero(numero)}.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível confirmar o código.') }
  }
}

export async function pausarMeuWhatsapp(pausar: boolean): Promise<Resultado> {
  try {
    const context = await requireWorkspace({ escola: true })
    const { data, error } = await createAdminClient().from('whatsapp_contas')
      .update({ pausado_em: pausar ? new Date().toISOString() : null, atualizado_em: new Date().toISOString() })
      .eq('user_id', context.user.id).select('user_id').maybeSingle()
    if (error || !data) throw new Error('Não foi possível mudar agora.')
    revalidatePath('/perfil')
    return { recado: pausar ? 'Avisos por WhatsApp pausados.' : 'Avisos por WhatsApp ligados de novo.' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mudar agora.') }
  }
}

export async function removerMeuWhatsapp(): Promise<Resultado> {
  try {
    const context = await requireWorkspace({ escola: true })
    const admin = createAdminClient()
    const { error } = await admin.from('whatsapp_contas').delete().eq('user_id', context.user.id)
    if (error) throw new Error('Não foi possível remover o número.')
    await admin.from('whatsapp_codigos').update({ usado_em: new Date().toISOString() }).eq('user_id', context.user.id).is('usado_em', null)
    await auditarConta(admin, { userId: context.user.id, atorId: context.user.id, acao: 'whatsapp_removido', workspaceId: context.workspace.id })
    revalidatePath('/perfil')
    return { recado: 'Número removido. Os avisos continuam no sino e no e-mail.' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível remover o número.') }
  }
}

/** Por assunto, o que chega pelo WhatsApp. */
export async function salvarCategoriasDoWhatsapp(categorias: Record<string, boolean>): Promise<Resultado> {
  try {
    const context = await requireWorkspace({ escola: true })
    const limpas = Object.fromEntries(CATEGORIAS.map((c) => [c, typeof categorias?.[c] === 'boolean' ? categorias[c] : WHATSAPP_PADRAO])) as Record<Categoria, boolean>
    const { error } = await createAdminClient().from('notificacao_preferencias')
      .upsert({ user_id: context.user.id, whatsapp: limpas, atualizado_em: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) throw new Error('Não foi possível salvar a preferência.')
    revalidatePath('/perfil')
    return { recado: 'Preferência salva.' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar a preferência.') }
  }
}

// ------------------------------------------------------------------ Configurações → WhatsApp

async function exigirAdmin() {
  const context = await requireWorkspace()
  if (!pode(context.role, 'integracoes.configurar')) throw new Error('Só administradores conectam o WhatsApp do Palácio Virtual.')
  const config = await configDoWhatsapp(context.workspace.id)
  if (!config) throw new Error('Configure primeiro a chave da Kapso e o Phone number ID em Configurações → Integrações.')
  return { context, config }
}

async function registrarNaAtividade(workspaceId: string, atorId: string, acao: string) {
  await createAdminClient().from('activity_log').insert({ workspace_id: workspaceId, actor_id: atorId, action: acao, entity_type: 'integracao', metadata: { servico: 'kapso' } })
}

export async function ligarRecebimentoDoWhatsapp(): Promise<Resultado> {
  try {
    const { context, config } = await exigirAdmin()
    const r = await ligarWebhook(config, context.workspace.id)
    if (r.erro) throw new Error(r.erro)
    await registrarNaAtividade(context.workspace.id, context.user.id, 'whatsapp_webhook_ligado')
    revalidatePath('/configuracoes/whatsapp')
    return { recado: 'Recebimento ligado: o bot passa a responder a quem escreve para o número.' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível ligar o recebimento.') }
  }
}

/** Faz a fila andar agora (o que já pode sair; o silêncio continua valendo). */
export async function enviarFilaAgora(): Promise<Resultado> {
  try {
    const { context } = await exigirAdmin()
    const r = await processarFila(createAdminClient(), context.workspace.id, { orcamentoMs: 120_000, limite: 30 })
    revalidatePath('/configuracoes/whatsapp')
    const partes = [`${r.enviadas} ${r.enviadas === 1 ? 'mensagem enviada' : 'mensagens enviadas'}`]
    if (r.adiadas) partes.push(`${r.adiadas} para tentar de novo mais tarde`)
    if (r.desistiu) partes.push(`${r.desistiu} ${r.desistiu === 1 ? 'descartada' : 'descartadas'} (aviso já lido, número removido ou falha sem volta)`)
    if (r.restam) partes.push(`${r.restam} ainda esperando a vez`)
    return { recado: `${partes.join('; ')}.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível fazer a fila andar.') }
  }
}

/** Mensagem de teste para o WhatsApp confirmado de quem clicou. */
export async function testarWhatsapp(): Promise<Resultado> {
  try {
    const { context, config } = await exigirAdmin()
    const admin = createAdminClient()
    const { data: conta } = await admin.from('whatsapp_contas').select('numero').eq('user_id', context.user.id).maybeSingle()
    if (!conta) throw new Error('Confirme antes o seu WhatsApp em Meu perfil: o teste vai para ele.')
    const envio = await mandar(admin, context.workspace.id, {
      numero: conta.numero as string, tipo: 'teste', userId: context.user.id, config,
      texto: `*Teste do Palácio Virtual*\n\nSe esta mensagem chegou, o WhatsApp do Palácio está funcionando. Responda *menu* para testar o bot.`,
    })
    if (!envio.ok) throw new Error(envio.erro)
    revalidatePath('/configuracoes/whatsapp')
    return { recado: `Teste enviado para ${formatarNumero(conta.numero as string)}.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mandar o teste.') }
  }
}
