import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import { notificar } from '@/lib/notificacoes/servidor'
import { entregar } from '@/lib/whatsapp/fila'
import { formatarNumero, mascararNumero, numeroCanonico } from '@/lib/whatsapp/regras'
import { CAMPOS_DA_FICHA, DIAS_DO_CONVITE, DIAS_ENTRE_LEMBRETES, LEMBRETES_NO_MAXIMO, textoDoConviteDaFicha, type CampoDaFicha } from './ficha'

/**
 * O link para a própria pessoa completar a ficha da Equipe
 * (docs: ARQUITETURA §8.5 e a migração 20260929130000). O RH pede na ficha,
 * o link sai pelo WhatsApp (ou o RH copia e manda como quiser), a pessoa
 * preenche em /ficha/<token> e quem pediu é avisado no sino. Só o hash do
 * token fica no banco; o lembrete troca o token, e o link antigo morre.
 */

type Admin = ReturnType<typeof createAdminClient>

export const hashDoConvite = (token: string) => createHash('sha256').update(`ficha:${token}`, 'utf8').digest('hex')
const novoToken = () => randomBytes(32).toString('base64url')
const urlDaFicha = (token: string) => `${urlBase()}/ficha/${token}`

/**
 * Para onde mandar: o WhatsApp que a pessoa confirmou no Palácio; senão, o
 * telefone pessoal da ficha. Nunca o de trabalho: pode ser o celular do setor,
 * e quem o tiver escreveria a ficha dela.
 */
async function destinoDaPessoa(admin: Admin, membro: { user_id: string | null }, telefonePessoal: string | null) {
  if (membro.user_id) {
    const { data } = await admin.from('whatsapp_contas').select('numero').eq('user_id', membro.user_id).maybeSingle()
    if (data?.numero) return data.numero as string
  }
  return numeroCanonico(telefonePessoal ?? '')
}

export async function criarConviteDaFicha(p: {
  workspaceId: string; membroId: string; criadoPor: string; incluiDocumentos: boolean; porWhatsapp: boolean
}): Promise<{ link: string | null; enviadoPara: string | null; recado: string }> {
  const admin = createAdminClient()
  const [{ data: membro }, { data: pessoais }] = await Promise.all([
    admin.from('equipe_membros').select('id, nome, nome_social, user_id, situacao').eq('id', p.membroId).eq('workspace_id', p.workspaceId).maybeSingle(),
    admin.from('equipe_pessoais').select('telefone_pessoal').eq('membro_id', p.membroId).maybeSingle(),
  ])
  if (!membro) throw new Error('Pessoa não encontrada.')
  if (membro.situacao === 'desligado') throw new Error('Esta pessoa foi desligada.')
  const destino = p.porWhatsapp ? await destinoDaPessoa(admin, membro as { user_id: string | null }, (pessoais?.telefone_pessoal as string | null) ?? null) : null
  if (p.porWhatsapp && !destino) throw new Error('A ficha não tem celular pessoal válido (nem WhatsApp confirmado no Palácio). Preencha o telefone pessoal ou use “Só gerar o link”.')

  // Um link aberto por pessoa: o novo cancela o anterior.
  await admin.from('equipe_convites').update({ cancelado_em: new Date().toISOString() }).eq('membro_id', p.membroId).is('usado_em', null).is('cancelado_em', null)
  const token = novoToken()
  const { error } = await admin.from('equipe_convites').insert({
    workspace_id: p.workspaceId, membro_id: p.membroId, token_hash: hashDoConvite(token), numero: destino ?? null,
    inclui_documentos: p.incluiDocumentos, criado_por: p.criadoPor, expira_em: new Date(Date.now() + DIAS_DO_CONVITE * 86_400_000).toISOString(),
  })
  if (error) throw new Error(error.code === '42P01' || error.code === 'PGRST205' ? 'O link da ficha ainda não está pronto no banco. Avise a administração.' : 'Não foi possível gerar o link.')
  const link = urlDaFicha(token)
  const nome = ((membro.nome_social as string | null) || (membro.nome as string)) ?? ''

  if (!destino) return { link, enviadoPara: null, recado: 'Link gerado. Copie e mande à pessoa: ele vale uma vez e por 7 dias.' }
  // Sem userId: é um pedido do RH, não um aviso do sino — a pausa dos avisos da pessoa não o segura na fila.
  const entrega = await entregar(admin, p.workspaceId, {
    numero: destino, tipo: 'aviso', categoria: 'equipe', userId: null,
    texto: textoDoConviteDaFicha({ nome, url: link, documentos: p.incluiDocumentos }),
  })
  const para = formatarNumero(destino)
  // Falhou o WhatsApp: o link volta para o RH mandar de outro jeito. Saiu: o link fica só com a pessoa.
  if (entrega.situacao === 'falhou') return { link, enviadoPara: null, recado: `O WhatsApp não saiu (${entrega.erro}). Copie o link e mande de outro jeito.` }
  return {
    link: null, enviadoPara: mascararNumero(destino),
    recado: entrega.situacao === 'na_fila' ? `O link vai para ${para} pelo WhatsApp assim que a fila andar (de 22h às 7h, espera a manhã).` : `Link mandado para ${para} pelo WhatsApp.`,
  }
}

export type ConviteAberto = {
  aberto: true; nome: string; incluiDocumentos: boolean; preenchidos: CampoDaFicha[]; temDocumentos: boolean; expiraEm: string
}

/** O que a página pública mostra: quem é (o primeiro nome) e o que já está preenchido — nunca os valores. */
export async function conviteDoToken(token: string): Promise<ConviteAberto | { aberto: false } | null> {
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) return null
  const admin = createAdminClient()
  const { data: c } = await admin.from('equipe_convites').select('id, membro_id, inclui_documentos, expira_em, usado_em, cancelado_em').eq('token_hash', hashDoConvite(token)).maybeSingle()
  if (!c) return null
  if (c.usado_em || c.cancelado_em || new Date(c.expira_em as string) <= new Date()) return { aberto: false }
  const [{ data: membro }, { data: pessoais }] = await Promise.all([
    admin.from('equipe_membros').select('nome, nome_social, tem_documentos, situacao').eq('id', c.membro_id).maybeSingle(),
    admin.from('equipe_pessoais').select(CAMPOS_DA_FICHA.map((x) => x.campo).join(',')).eq('membro_id', c.membro_id).maybeSingle(),
  ])
  if (!membro || membro.situacao === 'desligado') return { aberto: false }
  const linha = (pessoais ?? {}) as unknown as Record<string, unknown>
  return {
    aberto: true, nome: (((membro.nome_social as string | null) || (membro.nome as string)) ?? '').trim().split(/\s+/)[0] ?? '',
    incluiDocumentos: Boolean(c.inclui_documentos), temDocumentos: Boolean(membro.tem_documentos), expiraEm: c.expira_em as string,
    preenchidos: CAMPOS_DA_FICHA.map((x) => x.campo).filter((campo) => String(linha[campo] ?? '').trim() !== ''),
  }
}

/** Depois que a pessoa mandou: quem pediu fica sabendo (sino, e e-mail/WhatsApp pelas preferências). */
export async function avisarQuemPediuAFicha(token: string) {
  try {
    const admin = createAdminClient()
    const { data: c } = await admin.from('equipe_convites').select('workspace_id, membro_id, criado_por').eq('token_hash', hashDoConvite(token)).maybeSingle()
    if (!c?.criado_por) return
    const { data: m } = await admin.from('equipe_membros').select('nome, nome_social').eq('id', c.membro_id).maybeSingle()
    const nome = ((m?.nome_social as string | null) || (m?.nome as string | null)) ?? 'A pessoa'
    await notificar(admin, {
      workspaceId: c.workspace_id as string, para: [c.criado_por as string], atorId: null, categoria: 'equipe',
      titulo: `${nome} completou a ficha`, mensagem: 'Os dados chegaram pelo link. Confira na ficha.',
      link: `/equipe/${c.membro_id}?aba=pessoal`, botao: 'Abrir a ficha',
    })
  } catch (causa) {
    console.error('[equipe] aviso da ficha não saiu:', causa instanceof Error ? causa.message : causa)
  }
}

/**
 * Lembrete de ficha incompleta: link aberto, mandado pelo WhatsApp, sem uso
 * há 2 dias. Cada lembrete troca o token (o link antigo para de valer) e
 * sai no máximo 2 vezes. Roda na rotina diária do WhatsApp.
 */
export async function lembrarFichas(admin: Admin): Promise<number> {
  try {
    const agora = new Date()
    const antes = new Date(agora.getTime() - DIAS_ENTRE_LEMBRETES * 86_400_000).toISOString()
    const { data } = await admin.from('equipe_convites').select('id, workspace_id, membro_id, numero, inclui_documentos, criado_em, lembrado_em, lembretes')
      .is('usado_em', null).is('cancelado_em', null).gt('expira_em', agora.toISOString()).not('numero', 'is', null).lt('lembretes', LEMBRETES_NO_MAXIMO).limit(50)
    let lembrados = 0
    for (const c of data ?? []) {
      if (((c.lembrado_em as string | null) ?? (c.criado_em as string)) > antes) continue
      const { data: m } = await admin.from('equipe_membros').select('nome, nome_social, situacao').eq('id', c.membro_id).maybeSingle()
      if (!m || m.situacao === 'desligado') continue
      const token = novoToken()
      const { data: trocou } = await admin.from('equipe_convites').update({ token_hash: hashDoConvite(token), lembrado_em: agora.toISOString(), lembretes: Number(c.lembretes) + 1 })
        .eq('id', c.id).is('usado_em', null).select('id').maybeSingle()
      if (!trocou) continue
      await entregar(admin, c.workspace_id as string, {
        numero: c.numero as string, tipo: 'aviso', categoria: 'equipe', userId: null,
        texto: textoDoConviteDaFicha({ nome: ((m.nome_social as string | null) || (m.nome as string)) ?? '', url: urlDaFicha(token), documentos: Boolean(c.inclui_documentos), lembrete: true }),
      })
      lembrados++
    }
    return lembrados
  } catch (causa) {
    console.error('[equipe] lembretes da ficha:', causa instanceof Error ? causa.message : causa)
    return 0
  }
}
