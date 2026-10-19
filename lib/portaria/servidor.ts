import 'server-only'

import { after } from 'next/server'
import { del, get, put } from '@vercel/blob'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import { notificar, quemRecebeNoWhatsapp } from '@/lib/notificacoes/servidor'
import { cotaDeConversas, entregar } from '@/lib/whatsapp/fila'
import { escolherModelo } from '@/lib/whatsapp/modelos'
import {
  TETO_DA_IMAGEM_NA_META, apagarMidia, configDoWhatsapp, enviarModelo, modeloAprovado, modelosDaMeta, registrar, subirMidia, type ConfigDoWhatsapp,
} from '@/lib/whatsapp/servidor'
import { numeroCanonico, textoDoAviso } from '@/lib/whatsapp/regras'
import {
  interativoDaFicha, modeloDaFichaForaDaJanela, montagemDaFicha, sobeAFotoDaFicha, textoDaFicha, type FichaDaVisita,
} from '@/lib/whatsapp/portaria-regras'
import {
  RESPOSTAS, avisoParaPortaria, caminhoDaFotoDoVisitante, ehTokenDaEntrada, fotoDaVisita, hora, linkDaVisita, parametrosParaVisitante, type RespostaDaVisita,
} from './regras'

type Admin = ReturnType<typeof createAdminClient>

/** O espaço da filial e o segredo do QR: o autocadastro só vale com o segredo do cartaz em vigor. */
export async function espacoDaEntrada(token: unknown, admin: Admin = createAdminClient()): Promise<string | null> {
  if (!ehTokenDaEntrada(token)) return null
  const { data: ws } = await admin.from('workspaces').select('id').eq('kind', 'production').order('created_at').limit(1).maybeSingle()
  if (!ws) return null
  const { data: c } = await admin.from('portaria_config').select('token').eq('workspace_id', ws.id).maybeSingle()
  return c?.token === token ? (ws.id as string) : null
}

/** Quem pode ser visitado: as pessoas ativas do Palácio (a equipe da Escola também recebe visita). */
export async function pessoasParaVisitar(workspaceId: string, admin: Admin = createAdminClient()): Promise<{ id: string; nome: string; setor: string | null }[]> {
  const { data } = await admin.from('workspace_members').select('user_id,coordination,profiles(full_name,active)').eq('workspace_id', workspaceId)
  return ((data ?? []) as unknown as { user_id: string; coordination: string | null; profiles: { full_name: string | null; active: boolean | null } | null }[])
    .filter((m) => m.profiles && m.profiles.active !== false && m.profiles.full_name?.trim())
    .map((m) => ({ id: m.user_id, nome: m.profiles!.full_name!.trim(), setor: m.coordination }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** O aviso de sempre da chegada (o sino, o e-mail e, para quem não recebe a ficha, o WhatsApp). */
function avisoDaChegada(v: { nome: string; empresa: string | null; motivo: string | null }): { titulo: string; mensagem: string } {
  return {
    titulo: `${v.nome} chegou para falar com você`,
    mensagem: [v.empresa ? `De ${v.empresa}.` : '', v.motivo ? (/[.!?…]$/.test(v.motivo) ? v.motivo : `${v.motivo}.`) : '', 'Diga à portaria se pode subir, se aguarda na recepção ou se não pode receber agora.']
      .filter(Boolean).join(' ').slice(0, 400),
  }
}

type VisitaAvisada = { workspaceId: string; visitaId: string; visitadoId: string | null; nome: string; empresa: string | null; motivo: string | null; fotoASeguir?: boolean }

/**
 * Avisa quem é visitado e pede a resposta: pode subir, aguarde na recepção ou não pode agora. O sino e o e-mail saem
 * pelo notificar, conforme a preferência; no WhatsApp, quem receberia o aviso (o número confirmado, sem pausa, com a
 * portaria ligada: quemRecebeNoWhatsapp) recebe no lugar dele a FICHA da visita — os três botões, com a foto no
 * cabeçalho quando há (mandarFicha) —, sem WhatsApp repetido. O link é o da visita: responder a mensagem, ou tocar num
 * botão, chega aqui de volta (lib/whatsapp/acoes.ts). Sai na hora, mesmo à noite e com o Palácio aberto: a pessoa está
 * na portaria. `fotoASeguir`: a tela sobe a foto logo depois de registrar (components/app/portaria/acoes.tsx), e a
 * ficha espera um pouco por ela. Nunca lança.
 */
export async function avisarVisitado(v: VisitaAvisada, atorId: string | null) {
  if (!v.visitadoId) return
  const visitadoId = v.visitadoId
  try {
    const admin = createAdminClient()
    const link = linkDaVisita(v.visitaId)
    const aviso = avisoDaChegada(v)
    // Na dúvida (a leitura falhou), o aviso de sempre: ninguém fica sem aviso por causa da ficha.
    let ficha: Awaited<ReturnType<typeof quemRecebeNoWhatsapp>> = null
    try {
      ficha = await quemRecebeNoWhatsapp(admin, { workspaceId: v.workspaceId, categoria: 'portaria', destinos: [visitadoId], link, importante: true })
    } catch {
      ficha = null
    }
    const conta = ficha?.contas.find((c) => c.user_id === visitadoId) ?? null
    const linhas = await notificar(admin, {
      // Quem chegou é o visitante, não quem registrou: o aviso sai mesmo quando a pessoa da portaria registra uma visita
      // para si (notificar não avisa o autor, e isso a calaria).
      workspaceId: v.workspaceId, para: [visitadoId], atorId: atorId === visitadoId ? null : atorId, categoria: 'portaria', importante: true,
      titulo: aviso.titulo, mensagem: aviso.mensagem, link, botao: 'Responder à portaria', semWhatsapp: conta ? [visitadoId] : [],
    })
    if (!ficha || !conta) return
    const destino = { config: ficha.config, numero: conta.numero, notificacaoId: linhas.find((l) => l.user_id === visitadoId)?.id ?? null }
    const mandar = () => mandarFicha(admin, { ...v, visitadoId }, destino, atorId, aviso)
    try { after(mandar) } catch { await mandar() }
  } catch (causa) {
    console.error('[portaria] aviso da chegada não saiu:', causa instanceof Error ? causa.message : causa)
  }
}

const dormir = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms))

/** Quanto a ficha espera pela foto que a tela sobe logo depois de registrar (a página da portaria tem 60 s). */
export const ESPERA_DA_FOTO_MS = 20_000
/**
 * Quanto esperar, depois de a ficha sair, para apagar da Meta a foto subida para ela: o envio é aceito antes de a Meta
 * pôr a mensagem a caminho, e a mídia apagada antes disso deixaria a ficha sem a foto. Depois, a foto fica só no
 * celular de quem é visitado (e na conversa do número do Palácio na Kapso).
 */
export const ESPERA_PARA_APAGAR_A_FOTO_MS = 20_000

/** A visita como a ficha mostra; com `esperarFoto`, até ESPERA_DA_FOTO_MS pela foto que a tela está subindo. */
async function visitaParaAFicha(admin: Admin, visitaId: string, esperarFoto: boolean) {
  const fim = Date.now() + (esperarFoto ? ESPERA_DA_FOTO_MS : 0)
  for (;;) {
    const { data, error } = await admin.from('portaria_visitas').select('nome, empresa, motivo, foto_path, entrada_em, descartada_em').eq('id', visitaId).maybeSingle()
    if (error || !data) return null
    if (data.foto_path || Date.now() + 2_000 > fim) return data as { nome: string; empresa: string | null; motivo: string | null; foto_path: string | null; entrada_em: string | null; descartada_em: string | null }
    await dormir(2_000)
  }
}

/**
 * A ficha no WhatsApp de quem é visitado (lib/whatsapp/portaria-regras.ts). Dentro da janela de 24 h, os três botões
 * com a foto no cabeçalho — subida à Meta só quando pode aparecer (sobeAFotoDaFicha) e apagada de lá depois, por
 * melhor esforço. Fora da janela, o modelo aprovado da visita (portaria_visita_v2, depois portaria_visita; só APPROVED
 * e UTILITY: lib/whatsapp/modelos.ts), com os mesmos botões; sem modelo aprovado, o aviso de antes, pelo modelo dos
 * avisos do cofre (regras.ts, modeloParaEnviar) — a pessoa não fica sem aviso. Pela entrega de sempre (entregar:
 * volume e reenvio; o que esperar na fila sai como o aviso de antes, com os botões 1, 2 e 3), registrada com o aviso do
 * sino: a resposta que cita a ficha volta à visita. No log, nada do visitante. Nunca lança.
 */
async function mandarFicha(admin: Admin, v: VisitaAvisada & { visitadoId: string }, d: { config: ConfigDoWhatsapp; numero: string; notificacaoId: string | null },
  atorId: string | null, aviso: { titulo: string; mensagem: string }) {
  let midia: string | null = null
  let saiu = false
  try {
    const visita = await visitaParaAFicha(admin, v.visitaId, Boolean(v.fotoASeguir))
    if (!visita || visita.descartada_em) return
    const { data: autor } = atorId && atorId !== v.visitadoId ? await admin.from('profiles').select('full_name').eq('id', atorId).maybeSingle() : { data: null }
    const ficha: FichaDaVisita = {
      visitaId: v.visitaId, visitante: visita.nome || v.nome, empresa: visita.empresa ?? v.empresa, motivo: visita.motivo ?? v.motivo,
      chegada: hora(visita.entrada_em ?? new Date().toISOString()),
      registradaPor: atorId === v.visitadoId ? 'você' : (autor?.full_name as string | null)?.trim() || null,
    }

    const temFoto = fotoDaVisita(visita.foto_path, v.workspaceId, v.visitaId)
    if (temFoto && visita.foto_path) {
      const [cota, naMeta] = await Promise.all([cotaDeConversas(admin, v.workspaceId, d.numero), modelosDaMeta(d.config)])
      const sobe = sobeAFotoDaFicha({ temFoto, janelaAberta: cota ? cota.janelaAberta : null, modeloComFoto: escolherModelo('visita', naMeta, { comImagem: true })?.cabecalho === 'IMAGE' })
      const bytes = sobe ? await lerFotoDoVisitante(visita.foto_path) : null
      const subida = bytes ? await subirMidia(d.config, bytes, 'image/jpeg') : null
      if (subida?.ok) midia = subida.id
    }

    const base = urlBase()
    const link = linkDaVisita(v.visitaId)
    const entrega = await entregar(admin, v.workspaceId, {
      numero: d.numero, texto: textoDaFicha(ficha, base), tipo: 'aviso', userId: v.visitadoId, notificacaoId: d.notificacaoId, categoria: 'portaria', link,
      interativo: interativoDaFicha(v.visitaId, midia),
      // Pedido só com a janela fechada: o modelo aprovado da visita ou, sem ele, o aviso de antes (o texto do notificar).
      modeloForaDaJanela: async () => modeloDaFichaForaDaJanela({
        naMeta: await modelosDaMeta(d.config), montagem: montagemDaFicha(ficha, midia), cofre: d.config,
        textoDoAviso: textoDoAviso({ urlBase: base, titulo: aviso.titulo.slice(0, 200), mensagem: aviso.mensagem.slice(0, 280), link }),
      }),
    }, { config: d.config })
    saiu = entrega.situacao === 'enviada'
    if (saiu && d.notificacaoId) await admin.from('notifications').update({ whatsapp_em: new Date().toISOString() }).eq('id', d.notificacaoId)
  } catch (causa) {
    console.error('[portaria] a ficha da visita não saiu:', causa instanceof Error ? causa.name : 'erro')
  } finally {
    if (midia) {
      if (saiu) await dormir(ESPERA_PARA_APAGAR_A_FOTO_MS)
      await apagarMidia(d.config, midia)
    }
  }
}

/**
 * A resposta no WhatsApp do visitante que autorizou na entrada. Ele nunca escreveu ao número do Palácio — a janela de
 * 24 h está fechada —, então só sai o modelo aprovado da situação (portaria_resposta_visitante_v2, depois
 * portaria_resposta_visitante; só APPROVED e UTILITY: lib/whatsapp/modelos.ts). Sem modelo aprovado, não sai, e a
 * portaria fica sabendo (avisoParaPortaria). Sem fila: a resposta de agora não serve daqui a uma hora. No registro do
 * WhatsApp, só o resultado: nem o telefone do visitante. Nunca lança; true se a Meta aceitou.
 */
async function avisarOVisitante(admin: Admin, workspaceId: string, numero: string, parametros: [string, string]): Promise<boolean> {
  try {
    const config = await configDoWhatsapp(workspaceId)
    if (!config) return false
    const modelo = await modeloAprovado(config, 'resposta_ao_visitante', { parametros })
    if (!modelo) return false
    const envio = await enviarModelo(config, numero, modelo)
    await registrar(admin, {
      workspaceId, direcao: 'saida', tipo: 'aviso', situacao: envio.ok ? 'enviada' : 'falhou', numero: null, userId: null,
      mensagemId: envio.ok ? envio.id : null, erro: envio.ok ? null : envio.erro.replace(/\d{8,}/g, '[número]'),
    })
    return envio.ok
  } catch {
    return false
  }
}

/**
 * Depois de uma resposta (pelo Palácio ou pelo WhatsApp): avisa a portaria
 * (quem registrou ou confirmou a entrada) e, se o visitante autorizou na
 * entrada, manda a resposta para o WhatsApp dele (avisarOVisitante). Nunca
 * lança; devolve se o visitante recebeu e se ele autorizou mas ficou sem a
 * resposta (`visitanteSemAviso`: a portaria dá a resposta a ele).
 */
export async function aposResposta(visitaId: string, quemRespondeu: string): Promise<{ visitanteAvisado: boolean; visitanteSemAviso: boolean }> {
  const nada = { visitanteAvisado: false, visitanteSemAviso: false }
  try {
    const admin = createAdminClient()
    const { data: v } = await admin.from('portaria_visitas')
      .select('id, workspace_id, nome, telefone, visitado_id, visitado_texto, resposta, resposta_recado, avisar_visitante, registrado_por, confirmado_por')
      .eq('id', visitaId).maybeSingle()
    if (!v || !v.resposta) return nada
    const resposta = v.resposta as RespostaDaVisita
    const [{ data: visitado }, { data: autor }, { data: vinculo }] = await Promise.all([
      v.visitado_id ? admin.from('profiles').select('full_name').eq('id', v.visitado_id).maybeSingle() : Promise.resolve({ data: null }),
      admin.from('profiles').select('full_name').eq('id', quemRespondeu).maybeSingle(),
      v.visitado_id ? admin.from('workspace_members').select('coordination').eq('workspace_id', v.workspace_id).eq('user_id', v.visitado_id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    const nomeDoVisitado = (visitado?.full_name as string | null)?.trim() || (v.visitado_texto as string | null) || 'Quem você veio visitar'

    // O visitante, no WhatsApp que autorizou: só pelo modelo aprovado, fora do silêncio da noite.
    const numero = v.avisar_visitante ? numeroCanonico(v.telefone as string | null) : null
    const visitanteAvisado = numero
      ? await avisarOVisitante(admin, v.workspace_id as string, numero, parametrosParaVisitante({ quem: nomeDoVisitado, setor: (vinculo?.coordination as string | null) ?? null, resposta }))
      : false
    const visitanteSemAviso = Boolean(v.avisar_visitante) && !visitanteAvisado

    // A portaria: quem registrou (ou confirmou o cadastro do QR). Quem respondeu não é avisado do que fez.
    const aviso = avisoParaPortaria({
      visitante: v.nome as string, quemRespondeu: (autor?.full_name as string | null)?.trim() || 'Quem é visitado', resposta,
      recado: v.resposta_recado as string | null, visitanteAvisado, visitanteSemAviso,
    })
    await notificar(admin, {
      workspaceId: v.workspace_id as string, para: [v.registrado_por as string | null, v.confirmado_por as string | null], atorId: quemRespondeu,
      categoria: 'portaria', importante: true, titulo: aviso.titulo, mensagem: aviso.mensagem, link: '/portaria', botao: 'Abrir a Portaria',
    })
    return { visitanteAvisado, visitanteSemAviso }
  } catch (causa) {
    console.error('[portaria] aviso da resposta não saiu:', causa instanceof Error ? causa.message : causa)
    return nada
  }
}

/**
 * A visita que espera esta pessoa agora: a de hoje (últimas 2 h), ainda
 * dentro, sem resposta ou com "aguarde". Só quando é uma: com duas, a
 * resposta sem citar a mensagem seria um chute.
 */
export async function visitaEsperandoResposta(admin: Admin, workspaceId: string, userId: string): Promise<{ id: string; nome: string } | null> {
  const { data, error } = await admin.from('portaria_visitas').select('id, nome, resposta').eq('workspace_id', workspaceId).eq('visitado_id', userId)
    .is('saida_em', null).is('descartada_em', null).gte('entrada_em', new Date(Date.now() - 2 * 3_600_000).toISOString()).limit(5)
  if (error) return null
  const abertas = (data ?? []).filter((v) => !v.resposta || v.resposta === 'aguardar')
  return abertas.length === 1 ? { id: abertas[0].id as string, nome: abertas[0].nome as string } : null
}

export const rotuloDaResposta = (r: RespostaDaVisita) => RESPOSTAS[r].rotulo

/** Grava a foto no Blob privado e devolve o caminho; quem chama registra no banco. */
export async function guardarFotoDoVisitante(workspaceId: string, visitaId: string, bytes: Uint8Array): Promise<string> {
  const blob = await put(caminhoDaFotoDoVisitante(workspaceId, visitaId, crypto.randomUUID()), Buffer.from(bytes), { access: 'private', addRandomSuffix: false, contentType: 'image/jpeg' })
  return blob.pathname
}

/**
 * A foto do visitante (JPEG, já reduzida) lida do Blob privado, para subir à Meta com a ficha. null se não deu, ou se
 * passa do teto da Meta para imagem (5 MB). Nunca lança.
 */
export async function lerFotoDoVisitante(caminho: string): Promise<Uint8Array | null> {
  try {
    const r = await get(caminho, { access: 'private' })
    if (!r || r.statusCode !== 200 || r.blob.size > TETO_DA_IMAGEM_NA_META) return null
    const bytes = new Uint8Array(await new Response(r.stream).arrayBuffer())
    return bytes.length && bytes.length <= TETO_DA_IMAGEM_NA_META ? bytes : null
  } catch {
    return null
  }
}

/** Apagar o arquivo é melhor esforço: o banco já não aponta para ele. */
export async function apagarFotoDoVisitante(caminho: string | null | undefined) {
  if (!caminho || !caminho.startsWith('portaria/')) return
  try {
    await del(caminho)
  } catch (causa) {
    console.error('[portaria] não foi possível apagar a foto do Blob:', causa instanceof Error ? causa.message : causa)
  }
}
