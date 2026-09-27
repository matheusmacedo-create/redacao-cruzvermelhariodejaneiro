import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import { quando } from '@/lib/oportunidades/regras'
import { processarFila } from './fila'
import { configDoWhatsapp } from './servidor'
import { emSilencio, fimDoSilencio, formatarNumero } from './regras'
import {
  TEXTO_SAIU_DO_VOLUNTARIO, TEXTO_VOLTOU_DO_VOLUNTARIO, comandoDoVoluntario, textoDaListaDoVoluntario, textoDaOportunidade, textoDoMenuDoVoluntario,
} from './voluntarios-regras'

/**
 * O WhatsApp dos voluntários: o anúncio das oportunidades e o menu curto do
 * bot para quem é voluntário (não da equipe).
 *
 * Anúncio só para quem confirmou o número E autorizou na Área do Voluntário
 * (participantes_whatsapp), está ativo e não saiu. Vai tudo pela fila, com o
 * mesmo controle de volume do resto (12 por minuto, 3 s entre uma e outra,
 * silêncio das 22h às 7h): uma lista grande sai aos poucos, nunca de uma vez.
 * O texto é um só para todos — não há variação para despistar ninguém.
 */

type Admin = ReturnType<typeof createAdminClient>

const linkDaOportunidade = (id: string) => `/membro/oportunidades/${id}`

/**
 * Anuncia a oportunidade uma vez só (a primeira publicação marca
 * avisada_por_whatsapp_em). Devolve quantos entraram na fila.
 */
export async function avisarOportunidadePorWhatsapp(oportunidadeId: string): Promise<number> {
  try {
    const admin = createAdminClient()
    const agora = new Date()
    // Quem vira a marca anuncia: dois cliques em "publicar" não anunciam duas vezes.
    const { data: o, error } = await admin.from('oportunidades').update({ avisada_por_whatsapp_em: agora.toISOString() })
      .eq('id', oportunidadeId).eq('publicado', true).is('cancelada_em', null).is('avisada_por_whatsapp_em', null).gt('inicio', agora.toISOString())
      .select('id, workspace_id, titulo, inicio, fim, local, vagas, inscricoes_ate').maybeSingle()
    if (error || !o) return 0
    if (o.inscricoes_ate && new Date(o.inscricoes_ate as string) <= agora) return 0

    const { data: contas } = await admin.from('participantes_whatsapp').select('numero, participantes(situacao)')
      .eq('workspace_id', o.workspace_id).not('numero', 'is', null).is('pausado_em', null).limit(5000)
    const numeros = [...new Set((contas ?? []).filter((c) => {
      const p = (Array.isArray(c.participantes) ? c.participantes[0] : c.participantes) as { situacao?: string } | null
      return p?.situacao === 'ativo'
    }).map((c) => c.numero as string))]
    if (!numeros.length) return 0

    const texto = textoDaOportunidade({
      titulo: o.titulo as string, quando: quando(o.inicio as string, o.fim as string), local: (o.local as string | null) ?? null,
      vagas: o.vagas ? `${o.vagas} vagas` : null, url: `${urlBase()}${linkDaOportunidade(o.id as string)}`,
    })
    const enviarApos = (emSilencio(agora) ? fimDoSilencio(agora) : agora).toISOString()
    for (let i = 0; i < numeros.length; i += 500) {
      const { error: erroDaFila } = await admin.from('whatsapp_fila').insert(numeros.slice(i, i + 500).map((numero) => ({
        workspace_id: o.workspace_id, user_id: null, numero, texto, tipo: 'aviso', categoria: 'voluntariado',
        link: linkDaOportunidade(o.id as string), motivo: 'volume', enviar_apos: enviarApos,
      })))
      if (erroDaFila) {
        console.error('[whatsapp] oportunidade não entrou na fila:', erroDaFila.message)
        return i
      }
    }
    // Começa a sair agora; o resto anda a cada aviso, mensagem recebida, rotina e botão "Enviar a fila agora".
    await processarFila(admin, o.workspace_id as string, { orcamentoMs: 50_000 })
    return numeros.length
  } catch (causa) {
    console.error('[whatsapp] oportunidade não anunciada:', causa instanceof Error ? causa.message : causa)
    return 0
  }
}

/** Antes de sair da fila: o voluntário ainda quer, e a oportunidade ainda vale? Motivo para desistir, ou null. */
export async function desistirDoVoluntario(admin: Admin, item: { numero: string; link: string | null }): Promise<string | null> {
  const { data: conta } = await admin.from('participantes_whatsapp').select('pausado_em').eq('numero', item.numero).maybeSingle()
  if (!conta) return 'O voluntário tirou o número.'
  if (conta.pausado_em) return 'O voluntário saiu dos avisos por WhatsApp.'
  const id = /^\/membro\/oportunidades\/([0-9a-f-]{36})$/.exec(item.link ?? '')?.[1]
  if (id) {
    const { data: o } = await admin.from('oportunidades').select('publicado, cancelada_em, inicio').eq('id', id).maybeSingle()
    if (!o || !o.publicado || o.cancelada_em || new Date(o.inicio as string) <= new Date()) return 'A oportunidade não está mais aberta.'
  }
  return null
}

// ------------------------------------------------------------------ bot

export type Voluntario = { participanteId: string; workspaceId: string; nome: string | null; pausado: boolean }

/** O voluntário ativo dono deste número confirmado, ou null. */
export async function voluntarioDoNumero(admin: Admin, numero: string): Promise<Voluntario | null> {
  const { data, error } = await admin.from('participantes_whatsapp').select('participante_id, workspace_id, pausado_em, participantes(nome, nome_social, situacao)')
    .eq('numero', numero).maybeSingle()
  if (error || !data) return null
  const p = (Array.isArray(data.participantes) ? data.participantes[0] : data.participantes) as { nome?: string; nome_social?: string | null; situacao?: string } | null
  if (!p || p.situacao !== 'ativo') return null
  return { participanteId: data.participante_id as string, workspaceId: data.workspace_id as string, nome: p.nome_social || p.nome || null, pausado: Boolean(data.pausado_em) }
}

export async function respostaAoVoluntario(admin: Admin, v: Voluntario, texto: string, base: string): Promise<{ comando: string; resposta: string }> {
  const comando = comandoDoVoluntario(texto, { pausado: v.pausado })
  const url = `${base}/membro/oportunidades`
  const agora = new Date().toISOString()

  if (comando === 'oportunidades') {
    const { data } = await admin.from('oportunidades').select('titulo, inicio, fim, local').eq('workspace_id', v.workspaceId).eq('publicado', true)
      .is('cancelada_em', null).gt('inicio', agora).order('inicio').limit(20)
    return {
      comando,
      resposta: textoDaListaDoVoluntario({
        titulo: '*Oportunidades abertas*', vazio: 'Nenhuma oportunidade aberta agora. Quando sair uma, ela chega por aqui.', url,
        itens: (data ?? []).map((o) => ({ titulo: o.titulo as string, quando: quando(o.inicio as string, o.fim as string), detalhe: (o.local as string | null) ?? null })),
      }),
    }
  }

  if (comando === 'inscricoes') {
    const { data } = await admin.from('oportunidade_inscricoes').select('situacao, oportunidades(titulo, inicio, fim, cancelada_em)')
      .eq('participante_id', v.participanteId).in('situacao', ['inscrito', 'espera']).limit(50)
    const itens = (data ?? []).map((i) => ({ i, o: (Array.isArray(i.oportunidades) ? i.oportunidades[0] : i.oportunidades) as { titulo: string; inicio: string; fim: string; cancelada_em: string | null } | null }))
      .filter(({ o }) => o && !o.cancelada_em && o.fim > agora)
      .sort((a, b) => a.o!.inicio.localeCompare(b.o!.inicio))
      .map(({ i, o }) => ({ titulo: o!.titulo, quando: quando(o!.inicio, o!.fim), detalhe: i.situacao === 'espera' ? 'na lista de espera' : 'inscrição confirmada' }))
    return { comando, resposta: textoDaListaDoVoluntario({ titulo: '*Suas inscrições*', vazio: 'Você não tem inscrição em oportunidade que ainda vai acontecer.', url, itens }) }
  }

  if (comando === 'sair' || comando === 'voltar') {
    const { error } = await admin.from('participantes_whatsapp')
      .update({ pausado_em: comando === 'sair' ? agora : null, atualizado_em: agora }).eq('participante_id', v.participanteId)
    return { comando, resposta: error ? 'Não consegui mudar agora. Tente de novo daqui a pouco ou mude na Área do Voluntário.' : comando === 'sair' ? TEXTO_SAIU_DO_VOLUNTARIO : TEXTO_VOLTOU_DO_VOLUNTARIO }
  }

  const menu = textoDoMenuDoVoluntario({ nome: v.nome, pausado: v.pausado, urlBase: base })
  return { comando, resposta: comando === 'desconhecido' ? `_Não entendi. Este número responde só às opções abaixo; para falar com a coordenação, use Mensagens na Área do Voluntário._\n\n${menu}` : menu }
}

// ------------------------------------------------------------------ Área do Voluntário

export type WhatsappDoVoluntario = { numero: string | null; pausado: boolean; pendente: string | null; autorizadoEm: string | null }

/** O quadro do WhatsApp no perfil do voluntário; null = ainda não disponível (sem a tabela ou sem o WhatsApp ligado). */
export async function whatsappDoVoluntario(participanteId: string, workspaceId: string): Promise<WhatsappDoVoluntario | null> {
  const admin = createAdminClient()
  const [{ data, error }, config] = await Promise.all([
    admin.from('participantes_whatsapp').select('numero, pausado_em, numero_pendente, codigo_expira_em, consentimento_em').eq('participante_id', participanteId).maybeSingle(),
    configDoWhatsapp(workspaceId),
  ])
  if (error || !config) return null
  const pendenteValendo = data?.numero_pendente && data.codigo_expira_em && new Date(data.codigo_expira_em as string) > new Date()
  return {
    numero: data?.numero ? formatarNumero(data.numero as string) : null,
    pausado: Boolean(data?.pausado_em),
    pendente: pendenteValendo ? formatarNumero(data!.numero_pendente as string) : null,
    autorizadoEm: (data?.consentimento_em as string | null) ?? null,
  }
}
