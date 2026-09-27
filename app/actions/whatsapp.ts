'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { auditarConta } from '@/lib/contas/servidor'
import { urlBase } from '@/lib/newsletter/contexto'
import { CATEGORIAS, type Categoria } from '@/lib/notificacoes/regras'
import {
  CODIGOS_POR_JANELA, CODIGO_TENTATIVAS, CODIGO_VALIDADE_MIN, JANELA_DOS_CODIGOS_MIN, WHATSAPP_PADRAO,
  codigoNoFormato, formatarNumero, mascararNumero, numeroCanonico, textoDoCodigo, textoDoMenu, type EstadoDaConexao,
} from '@/lib/whatsapp/regras'
import { entregar, processarFila } from '@/lib/whatsapp/fila'
import {
  codigoConfere, configDoWhatsapp, criarInstancia, desconectar, gerarCodigo, hashDoCodigo, ligarWebhook, mandar, pedirQr,
  situacaoDaConexao, temWhatsapp,
} from '@/lib/whatsapp/servidor'

/**
 * O WhatsApp do Palácio Virtual: a própria pessoa confirma o número dela
 * (Meu perfil) e a administração conecta o número do Palácio
 * (Configurações → WhatsApp).
 *
 * O número só passa a receber avisos depois do código de 6 dígitos que chega
 * nele: senão bastaria digitar o celular de outra pessoa para mandar a ela os
 * avisos (e o bot atenderia essa pessoa em nome da conta).
 */

type Resultado = { erro?: string; recado?: string }

// ------------------------------------------------------------------ Meu perfil

export async function pedirCodigoDoWhatsapp(formData: FormData): Promise<Resultado & { numero?: string }> {
  try {
    const context = await requireWorkspace({ escola: true })
    const numero = numeroCanonico(String(formData.get('numero') ?? ''))
    if (!numero) throw new Error('Número inválido. Use DDD e número, como (21) 98765-4321. De fora do Brasil, comece com + e o código do país.')
    const admin = createAdminClient()
    const config = await configDoWhatsapp(context.workspace.id)
    if (!config) throw new Error('O WhatsApp do Palácio Virtual ainda não foi ligado pela administração.')

    const { data: dono, error: semTabela } = await admin.from('whatsapp_contas').select('user_id').eq('numero', numero).maybeSingle()
    if (semTabela) throw new Error('O WhatsApp ainda não está pronto no banco. Avise a administração.')
    if (dono && dono.user_id !== context.user.id) throw new Error('Esse número já está confirmado em outra conta do Palácio Virtual.')

    const desde = new Date(Date.now() - JANELA_DOS_CODIGOS_MIN * 60_000).toISOString()
    const { count } = await admin.from('whatsapp_codigos').select('id', { count: 'exact', head: true }).eq('user_id', context.user.id).gte('criado_em', desde)
    if ((count ?? 0) >= CODIGOS_POR_JANELA) throw new Error(`Você já pediu ${CODIGOS_POR_JANELA} códigos nos últimos ${JANELA_DOS_CODIGOS_MIN} minutos. Espere um pouco e tente de novo.`)

    if (await temWhatsapp(config, numero) === false) throw new Error(`${formatarNumero(numero)} não tem WhatsApp. Confira os dígitos.`)

    // Só o último código vale.
    await admin.from('whatsapp_codigos').update({ usado_em: new Date().toISOString() }).eq('user_id', context.user.id).is('usado_em', null)
    const codigo = gerarCodigo()
    const { error } = await admin.from('whatsapp_codigos').insert({
      user_id: context.user.id, numero, codigo_hash: hashDoCodigo(context.user.id, numero, codigo),
      expira_em: new Date(Date.now() + CODIGO_VALIDADE_MIN * 60_000).toISOString(),
    })
    if (error) throw new Error('Não foi possível gerar o código.')

    const envio = await mandar(admin, context.workspace.id, { numero, texto: textoDoCodigo(codigo), tipo: 'codigo', userId: context.user.id, config })
    // Sem confirmação a tempo, o código costuma chegar com atraso: a tela abre o campo mesmo assim.
    if (!envio.ok && envio.semResposta) {
      return { recado: `O WhatsApp demorou a confirmar o envio para ${formatarNumero(numero)}. O código deve chegar em instantes: digite abaixo quando chegar. Se não chegar em 2 minutos, peça outro.`, numero: formatarNumero(numero) }
    }
    if (!envio.ok) throw new Error(`O código não saiu: ${envio.erro}`)
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
    if (!codigoConfere(pendente.codigo_hash as string, context.user.id, numero, codigo)) {
      await admin.from('whatsapp_codigos').update({ tentativas: tentativas + 1 }).eq('id', pendente.id).eq('tentativas', tentativas)
      const restam = CODIGO_TENTATIVAS - tentativas - 1
      throw new Error(restam > 0 ? `Código errado. ${restam === 1 ? 'Resta 1 tentativa' : `Restam ${restam} tentativas`}.` : 'Código errado. Peça um código novo.')
    }

    // Consome de forma atômica: dois cliques ao mesmo tempo não confirmam duas vezes.
    const agora = new Date().toISOString()
    const { data: consumido } = await admin.from('whatsapp_codigos').update({ usado_em: agora })
      .eq('id', pendente.id).is('usado_em', null).gt('expira_em', agora).select('id').maybeSingle()
    if (!consumido) throw new Error('Esse código já foi usado. Peça um novo.')

    const { error } = await admin.from('whatsapp_contas')
      .upsert({ user_id: context.user.id, numero, confirmado_em: agora, pausado_em: null, atualizado_em: agora }, { onConflict: 'user_id' })
    if (error?.code === '23505') throw new Error('Esse número acabou de ser confirmado em outra conta.')
    if (error) throw new Error('Não foi possível guardar o número.')

    await auditarConta(admin, { userId: context.user.id, atorId: context.user.id, acao: 'whatsapp_confirmado', detalhes: { numero: mascararNumero(numero) }, workspaceId: context.workspace.id })
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
  if (!config) throw new Error('Configure primeiro o endereço, a instância e a chave em Configurações → Integrações.')
  return { context, config }
}

async function registrarNaAtividade(workspaceId: string, atorId: string, acao: string) {
  await createAdminClient().from('activity_log').insert({ workspace_id: workspaceId, actor_id: atorId, action: acao, entity_type: 'integracao', metadata: { servico: 'evolution_api' } })
}

/** Lido pela tela a cada poucos segundos enquanto o QR está aberto. Só lê. */
export async function estadoDoWhatsapp(): Promise<{ estado?: EstadoDaConexao; erro?: string }> {
  try {
    const { config } = await exigirAdmin()
    const s = await situacaoDaConexao(config)
    return { estado: s.estado, erro: s.erro ?? undefined }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível ler a conexão.') }
  }
}

/** Pede o QR code (ou, com número, o código de pareamento). */
export async function conectarWhatsapp(formData: FormData): Promise<Resultado & { imagem?: string | null; codigo?: string | null; conectado?: boolean }> {
  try {
    const { context, config } = await exigirAdmin()
    const bruto = String(formData.get('numero') ?? '').trim()
    const numero = bruto ? numeroCanonico(bruto) : null
    if (bruto && !numero) throw new Error('Número inválido para o código de pareamento. Use DDD e número.')
    const qr = await pedirQr(config, numero)
    if (qr.erro) throw new Error(qr.erro)
    if (!qr.conectado) await registrarNaAtividade(context.workspace.id, context.user.id, 'whatsapp_qr_pedido')
    return { imagem: qr.imagem, codigo: qr.codigo, conectado: qr.conectado }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível pedir o QR code.') }
  }
}

export async function criarInstanciaDoWhatsapp(): Promise<Resultado> {
  try {
    const { context, config } = await exigirAdmin()
    const r = await criarInstancia(config)
    if (r.erro) throw new Error(r.erro)
    await registrarNaAtividade(context.workspace.id, context.user.id, 'whatsapp_instancia_criada')
    revalidatePath('/configuracoes/whatsapp')
    return { recado: `Instância "${config.instancia}" criada. Agora conecte o número pelo QR code.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível criar a instância.') }
  }
}

export async function desconectarWhatsapp(): Promise<Resultado> {
  try {
    const { context, config } = await exigirAdmin()
    const r = await desconectar(config)
    if (r.erro) throw new Error(r.erro)
    await registrarNaAtividade(context.workspace.id, context.user.id, 'whatsapp_desconectado')
    revalidatePath('/configuracoes/whatsapp')
    return { recado: 'WhatsApp desconectado. Os avisos param de sair por lá até conectar de novo.' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível desconectar.') }
  }
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
