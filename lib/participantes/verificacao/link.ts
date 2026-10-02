import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import { notificar } from '@/lib/notificacoes/servidor'
import { enviarAoVoluntario, gerentesDoVoluntariado } from '@/lib/membro/comunicacao'
import { emailDoPedidoDeDocumentos } from '@/lib/membro/emails'
import { entregar } from '@/lib/whatsapp/fila'
import { formatarNumero, mascararNumero, numeroCanonico } from '@/lib/whatsapp/regras'
import {
  DIAS_DO_LINK, DIAS_ENTRE_LEMBRETES, LEMBRETES_NO_MAXIMO, textoDoPedidoDeDocumentos, type CanalDoPedido, type CategoriaDeDocumento, type Escopo, type Lado, type RegistroProfissional,
} from './regras'

/**
 * O link pessoal do candidato (docs: ARQUITETURA §7.36, migração
 * 20261002000000). A coordenação pede na ficha; o link sai por e-mail ou
 * WhatsApp (ou a coordenação copia), o candidato aceita o termo e manda os
 * documentos em /verificacao/<token>, e a coordenação é avisada no sino. Só
 * o hash do token fica no banco; o lembrete troca o token, e o link antigo
 * morre. Diferente da ficha do RH, o link vale várias visitas até o
 * candidato concluir o envio (ou vencer): ele pode parar e voltar.
 */

type Admin = ReturnType<typeof createAdminClient>

export const hashDoLink = (token: string) => createHash('sha256').update(`verificacao:${token}`, 'utf8').digest('hex')
export const novoToken = () => randomBytes(32).toString('base64url')
export const urlDaVerificacao = (token: string) => `${urlBase()}/verificacao/${token}`
export const ehToken = (token: string) => /^[A-Za-z0-9_-]{30,60}$/.test(token)

export type { CanalDoPedido }

/**
 * Abre (ou reaproveita) a verificação e gera o link. Roda com o cliente da
 * pessoa logada: é o banco que confere o nível. Devolve o link só quando
 * ninguém o mandou — se saiu por e-mail ou WhatsApp, fica com o candidato.
 */
export async function pedirDocumentos(supabase: SupabaseClient, p: { workspaceId: string; participanteId: string; escopo: Escopo; canal: CanalDoPedido }): Promise<{ link: string | null; enviadoPara: string | null; recado: string }> {
  const admin = createAdminClient()
  const { data: v } = await admin.from('participantes').select('nome, nome_social, email, telefone, situacao, anonimizado_em').eq('id', p.participanteId).eq('workspace_id', p.workspaceId).maybeSingle()
  if (!v || v.anonimizado_em) throw new Error('Participante não encontrado.')
  const nome = ((v.nome_social as string | null) || (v.nome as string)) ?? ''
  const email = (v.email as string | null)?.trim().toLowerCase() || null
  const numero = p.canal === 'whatsapp' ? numeroCanonico(v.telefone as string | null) : null
  if (p.canal === 'email' && !email) throw new Error('O cadastro não tem e-mail. Mande pelo WhatsApp ou copie o link.')
  if (p.canal === 'whatsapp' && !numero) throw new Error('O cadastro não tem um celular válido. Mande por e-mail ou copie o link.')

  const token = novoToken()
  const { error } = await supabase.rpc('abrir_verificacao_participante', {
    p_participante_id: p.participanteId, p_escopo: p.escopo, p_token_hash: hashDoLink(token), p_dias: DIAS_DO_LINK,
    p_enviado_para: p.canal === 'email' ? email : p.canal === 'whatsapp' ? numero : null,
  })
  if (error) {
    if (error.code === 'P0001' && error.message) throw new Error(error.message)
    throw new Error(error.code === '42883' || error.code === 'PGRST202' ? 'A verificação ainda não está pronta no banco. Avise a administração.' : 'Não foi possível gerar o link.')
  }
  const link = urlDaVerificacao(token)
  const texto = textoDoPedidoDeDocumentos({ nome, url: link, renovacao: p.escopo === 'renovacao' })

  if (p.canal === 'email') {
    const saiu = await enviarAoVoluntario(email, emailDoPedidoDeDocumentos({ nome, url: link, renovacao: p.escopo === 'renovacao', dias: DIAS_DO_LINK }))
    if (!saiu) return { link, enviadoPara: null, recado: 'O e-mail não saiu. Copie o link e mande de outro jeito.' }
    return { link: null, enviadoPara: email, recado: `Link mandado para ${email}. Vale ${DIAS_DO_LINK} dias.` }
  }
  if (p.canal === 'whatsapp' && numero) {
    // Sem userId: é um pedido da coordenação, não um aviso do sino.
    const entrega = await entregar(admin, p.workspaceId, { numero, tipo: 'aviso', categoria: 'aprovacoes', userId: null, texto })
    if (entrega.situacao === 'falhou') return { link, enviadoPara: null, recado: `O WhatsApp não saiu (${entrega.erro}). Copie o link e mande de outro jeito.` }
    const para = formatarNumero(numero)
    return { link: null, enviadoPara: mascararNumero(numero), recado: entrega.situacao === 'na_fila' ? `O link vai para ${para} pelo WhatsApp assim que a fila andar (de 22h às 7h, espera a manhã).` : `Link mandado para ${para} pelo WhatsApp.` }
  }
  return { link, enviadoPara: null, recado: `Link gerado. Copie e mande ao candidato: vale ${DIAS_DO_LINK} dias.` }
}

export type ArquivoEnviado = { id: string; categoria: CategoriaDeDocumento; lado: Lado | null; nome: string; tamanho: number; dataDocumento: string | null }
export type ReferenciaEnviada = { nome: string; relacao: string; telefone: string | null; email: string | null }
export type VerificacaoAberta = {
  aberto: true; participanteId: string; workspaceId: string; escopo: Escopo; nome: string; termoAceito: boolean; temCpf: boolean; expiraEm: string
  registroProfissional: RegistroProfissional | null; arquivos: ArquivoEnviado[]; referencias: ReferenciaEnviada[]
}

/** O que a página pública mostra: o primeiro nome, o escopo e o que já foi enviado — nunca os dados do cadastro. */
export async function verificacaoDoToken(token: string): Promise<VerificacaoAberta | { aberto: false } | null> {
  if (!ehToken(token)) return null
  const { data, error } = await createAdminClient().rpc('verificacao_pelo_token', { p_token_hash: hashDoLink(token) })
  if (error) { console.error('[verificacao] link:', error.message); return null }
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.aberto !== true) return { aberto: false }
  return {
    aberto: true, participanteId: String(d.participanteId), workspaceId: String(d.workspaceId), escopo: d.escopo === 'renovacao' ? 'renovacao' : 'completa',
    nome: String(d.nome ?? ''), termoAceito: d.termoAceito === true, temCpf: d.temCpf === true, expiraEm: String(d.expiraEm ?? ''),
    registroProfissional: (d.registroProfissional as RegistroProfissional | null) ?? null,
    arquivos: Array.isArray(d.arquivos) ? (d.arquivos as ArquivoEnviado[]) : [],
    referencias: Array.isArray(d.referencias) ? (d.referencias as ReferenciaEnviada[]) : [],
  }
}

/** O candidato concluiu: quem gerencia o Voluntariado fica sabendo (sino e, conforme a preferência, e-mail/WhatsApp). */
export async function avisarCoordenacao(p: { workspaceId: string; participanteId: string; nome: string }) {
  try {
    const admin = createAdminClient()
    await notificar(admin, {
      workspaceId: p.workspaceId, para: await gerentesDoVoluntariado(p.workspaceId), atorId: null, categoria: 'aprovacoes',
      titulo: `${p.nome.slice(0, 120)} enviou os documentos para verificação`, mensagem: 'Confira identidade, antecedentes, sanções e referências na ficha antes de aprovar.',
      link: `/voluntariado/${p.participanteId}#verificacao`, botao: 'Abrir a verificação',
    })
  } catch (causa) {
    console.error('[verificacao] aviso à coordenação não saiu:', causa instanceof Error ? causa.message : causa)
  }
}

/**
 * Lembrete de documentos que não chegaram: link aberto, mandado por e-mail
 * ou WhatsApp, sem novidade há 5 dias. Cada lembrete troca o token (o link
 * antigo para de valer) e sai no máximo 2 vezes. Roda na rotina diária.
 */
export async function lembrarCandidatos(admin: Admin): Promise<number> {
  try {
    const agora = new Date()
    const antes = new Date(agora.getTime() - DIAS_ENTRE_LEMBRETES * 86_400_000).toISOString()
    const { data } = await admin.from('participantes_verificacoes').select('id, workspace_id, participante_id, escopo, link_enviado_para, created_at, lembrado_em, lembretes')
      .eq('estado', 'aberta').not('token_hash', 'is', null).gt('link_expira_em', agora.toISOString()).not('link_enviado_para', 'is', null).lt('lembretes', LEMBRETES_NO_MAXIMO).limit(50)
    let lembrados = 0
    for (const x of data ?? []) {
      if (((x.lembrado_em as string | null) ?? (x.created_at as string)) > antes) continue
      const { data: p } = await admin.from('participantes').select('nome, nome_social, situacao, anonimizado_em').eq('id', x.participante_id).maybeSingle()
      if (!p || p.situacao === 'desligado' || p.anonimizado_em) continue
      const para = String(x.link_enviado_para)
      const token = novoToken()
      const { data: trocou } = await admin.from('participantes_verificacoes').update({ token_hash: hashDoLink(token), lembrado_em: agora.toISOString(), lembretes: Number(x.lembretes) + 1 })
        .eq('id', x.id).eq('estado', 'aberta').select('id').maybeSingle()
      if (!trocou) continue
      const nome = ((p.nome_social as string | null) || (p.nome as string)) ?? ''
      const url = urlDaVerificacao(token)
      const renovacao = x.escopo === 'renovacao'
      if (para.includes('@')) {
        await enviarAoVoluntario(para, emailDoPedidoDeDocumentos({ nome, url, renovacao, lembrete: true, dias: DIAS_DO_LINK }))
      } else {
        await entregar(admin, x.workspace_id as string, { numero: para, tipo: 'aviso', categoria: 'aprovacoes', userId: null, texto: textoDoPedidoDeDocumentos({ nome, url, renovacao, lembrete: true }) })
      }
      lembrados++
    }
    return lembrados
  } catch (causa) {
    console.error('[verificacao] lembretes:', causa instanceof Error ? causa.message : causa)
    return 0
  }
}
