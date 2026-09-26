import 'server-only'

import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { atualizar, carimbar } from '@/lib/oficios/carimbo'
import { enviarArquivoDeVerificacao, withFtp } from '@/lib/publicacao/ftp'
import { descobrirRaizDoSite } from '@/lib/site/vitrine'
import { notificar } from '@/lib/notificacoes/servidor'
import { assinarManifesto, type ChaveDaTrilha } from './assinatura'
import { obterChaveDaTrilha } from './chave'
import { arquivosDoLote, espelharChave, espelharIndice, espelharLote, espelhoConfigurado, type LoteParaEspelhar } from './espelho'
import { carimbarTempo } from './tsa'

/**
 * As rotinas da trilha (docs/auditoria-publica.md §4), chamadas pelos crons:
 *
 *   diária (madrugada): registra o que os ganchos perderam, confere a cadeia
 *   inteira, fecha o lote de ontem, assina, carimba (RFC 3161 e
 *   OpenTimestamps) e publica os arquivos em /verificar/lotes/ no site;
 *
 *   provas (tarde): pergunta aos calendários se os lotes já entraram num
 *   bloco do Bitcoin e republica o .ots confirmado.
 *
 *   As duas terminam copiando para o espelho no R2 (lib/auditoria/espelho.ts)
 *   o que mudou nos lotes, independente de o site ter respondido.
 *
 * Cada passo falha sozinho: erro de um lote fica gravado nele e o resto segue.
 */

type Admin = ReturnType<typeof createAdminClient>

export const PAINEL_DA_TRILHA = '/trilha-publica'

/** O que public.auditoria_lotes_pendentes devolve. */
type LotePendente = {
  dia: string
  itens: number
  compromisso: string
  manifesto: string
  hash_manifesto: string
  assinatura: string | null
  chave_id: string | null
  ots: string | null
  ots_estado: 'pendente' | 'enviado' | 'confirmado'
  bloco: number | null
  tsr: string | null
  tentativas: number
  precisa_assinar: boolean
  precisa_tsr: boolean
  precisa_ots: boolean
  precisa_atualizar_ots: boolean
  precisa_publicar: boolean
}

export type ResumoDaRotina = {
  sincronizacao?: Record<string, number>
  cadeia?: { ok: boolean; eventos: number; lotes: number; lotes_ok: boolean }
  lote?: { dia: string; itens: number; compromisso: string } | null
  lotes: { dia: string; passos: string[]; erros: string[] }[]
  publicados: string[]
  /** Lotes copiados para o espelho no R2 nesta rodada. */
  espelhados: string[]
  /** Arquivos cujo registro permanente no R2 difere do banco. */
  divergencias: string[]
  avisos: string[]
}

// Os crons têm 60 s; o FTP da publicação vem depois do laço e precisa de folga.
const TEMPO_MAXIMO_MS = 35_000
const hojeEmSaoPaulo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const diaAnterior = (dia: string) => {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
const daquiA = (horas: number) => new Date(Date.now() + horas * 3_600_000).toISOString()
const mensagem = (causa: unknown) => (causa instanceof Error ? causa.message : typeof causa === 'object' && causa && 'message' in causa ? String((causa as { message: unknown }).message) : String(causa)).slice(0, 400)

async function lerChave(resumo: ResumoDaRotina): Promise<ChaveDaTrilha | null> {
  try {
    const achada = await obterChaveDaTrilha()
    if (!achada) resumo.avisos.push('Chave de assinatura não configurada (nem no cofre do Palácio Virtual nem na Vercel): os lotes ficam sem assinatura até ela chegar.')
    return achada?.chave ?? null
  } catch (causa) {
    resumo.avisos.push(`Chave de assinatura inválida: ${mensagem(causa)}`)
    return null
  }
}

async function processarPendentes(admin: Admin, resumo: ResumoDaRotina, inicio: number, atualizarOts: boolean) {
  const { data, error } = await admin.rpc('auditoria_lotes_pendentes', { p_limite: 8 })
  if (error) { resumo.avisos.push(`fila de lotes: ${mensagem(error)}`); return }
  const lotes = (data ?? []) as LotePendente[]
  if (!lotes.length) return
  const chave = lotes.some((l) => l.precisa_assinar) ? await lerChave(resumo) : null
  const paraPublicar: LotePendente[] = []

  for (const l of lotes) {
    if (Date.now() - inicio > TEMPO_MAXIMO_MS) { resumo.avisos.push('Tempo da rodada esgotado; o restante fica para a próxima.'); break }
    const r = { dia: l.dia, passos: [] as string[], erros: [] as string[] }
    const falhou = async (passo: string, causa: unknown) => {
      const texto = `${passo}: ${mensagem(causa)}`
      r.erros.push(texto)
      await admin.rpc('auditoria_registrar_erro_lote', { p_dia: l.dia, p_erro: texto })
    }

    if (l.precisa_assinar && chave) {
      try {
        const assinatura = assinarManifesto(l.manifesto, chave)
        const { data: gravou, error: e } = await admin.rpc('auditoria_assinar_lote', { p_dia: l.dia, p_assinatura: assinatura, p_chave_id: chave.id })
        if (e) throw e
        if (gravou) { l.assinatura = assinatura; l.chave_id = chave.id; r.passos.push('assinado') }
      } catch (causa) { await falhou('assinatura', causa) }
    }

    if (l.precisa_tsr) {
      try {
        const c = await carimbarTempo(createHash('sha256').update(l.manifesto, 'utf8').digest())
        const tsr = c.tsr.toString('base64')
        const { data: gravou, error: e } = await admin.rpc('auditoria_gravar_tsr', { p_dia: l.dia, p_tsr: tsr })
        if (e) throw e
        // Outra rodada (o botão manual junto do cron) carimbou antes: vale o que está no banco,
        // que a próxima publicação leva. Este aqui não é publicado.
        if (gravou) { l.tsr = tsr; r.passos.push(`carimbo de tempo (${c.horario.toISOString()})`) }
      } catch (causa) { await falhou('carimbo de tempo', causa) }
    }

    if (l.precisa_ots) {
      try {
        const { prova } = await carimbar(l.compromisso)
        const { data: gravou, error: e } = await admin.rpc('auditoria_gravar_ots', { p_dia: l.dia, p_ots: prova, p_estado: 'enviado', p_proxima: daquiA(4) })
        if (e) throw e
        if (gravou) { l.ots = prova; r.passos.push('enviado aos calendários do OpenTimestamps') }
      } catch (causa) { await falhou('OpenTimestamps', causa) }
    } else if (atualizarOts && l.precisa_atualizar_ots && l.ots) {
      try {
        const a = await atualizar(l.ots)
        if (a.confirmada) {
          const { data: gravou, error: e } = await admin.rpc('auditoria_gravar_ots', { p_dia: l.dia, p_ots: a.prova, p_estado: 'confirmado', p_bloco: a.bloco })
          if (e) throw e
          if (gravou) { l.ots = a.prova; l.bloco = a.bloco; r.passos.push(`confirmado no bloco ${a.bloco} do Bitcoin`) }
        } else {
          const { data: gravou, error: e } = await admin.rpc('auditoria_gravar_ots', { p_dia: l.dia, p_ots: a.prova, p_estado: null, p_proxima: daquiA(6) })
          if (e) throw e
          if (gravou) l.ots = a.prova
          r.passos.push('ainda sem bloco do Bitcoin')
        }
      } catch (causa) { await falhou('atualização do OpenTimestamps', causa) }
    }

    const mudouArquivo = r.passos.some((p) => !p.startsWith('ainda'))
    if (l.precisa_publicar || mudouArquivo) paraPublicar.push(l)
    resumo.lotes.push(r)
  }

  if (paraPublicar.length) await publicarLotes(admin, paraPublicar, chave ?? await lerChaveSilenciosa(), resumo)
}

async function lerChaveSilenciosa(): Promise<ChaveDaTrilha | null> {
  try { return (await obterChaveDaTrilha())?.chave ?? null } catch { return null }
}

/** Sobe os arquivos de cada lote, a chave pública e o índice, numa sessão de FTP. */
async function publicarLotes(admin: Admin, lotes: LotePendente[], chave: ChaveDaTrilha | null, resumo: ResumoDaRotina) {
  try {
    const { data: indice, error } = await admin.rpc('auditoria_indice_lotes')
    if (error) throw error
    await withFtp(async (client, config) => {
      const raiz = await descobrirRaizDoSite(client, config)
      if (!raiz) throw new Error('Não achei a pasta do site no FTP.')
      const enviar = (relativo: string, conteudo: Buffer | string) => enviarArquivoDeVerificacao(client, raiz, relativo, conteudo)
      if (chave) {
        await enviar('chave-publica.pem', chave.publicaPem)
        await enviar(`chaves/${chave.id}.pem`, chave.publicaPem)
      }
      for (const l of lotes) {
        for (const a of arquivosDoLote(l)) await enviar(`lotes/${l.dia}/${a.nome}`, a.conteudo)
        const { error: e } = await admin.rpc('auditoria_marcar_publicado', { p_dia: l.dia })
        if (e) throw e
        resumo.publicados.push(l.dia)
      }
      await enviar('lotes/indice.json', `${JSON.stringify(indice, null, 2)}\n`)
    })
  } catch (causa) {
    const texto = `publicação no site: ${mensagem(causa)}`
    resumo.avisos.push(texto)
    for (const l of lotes) {
      if (!resumo.publicados.includes(l.dia)) await admin.rpc('auditoria_registrar_erro_lote', { p_dia: l.dia, p_erro: texto })
    }
  }
}

/**
 * Espelho no R2: os lotes cujos arquivos mudaram desde a última cópia, a chave
 * e o índice. Sem as variáveis do R2, não faz nada. Lote com divergência no
 * registro permanente não é marcado: volta toda rodada, e o aviso também.
 */
async function espelharNoR2(admin: Admin, resumo: ResumoDaRotina, inicio: number) {
  let espelho: ReturnType<typeof espelhoConfigurado>
  try {
    espelho = espelhoConfigurado()
  } catch (causa) {
    resumo.avisos.push(`espelho no R2: ${mensagem(causa)}`)
    return
  }
  if (!espelho) return
  if (Date.now() - inicio > 50_000) { resumo.avisos.push('Sem tempo para o espelho no R2 nesta rodada; fica para a próxima.'); return }
  try {
    const { data, error } = await admin.rpc('auditoria_lotes_para_espelhar', { p_limite: 8 })
    if (error) throw error
    const lotes = (data ?? []) as LoteParaEspelhar[]
    if (!lotes.length) return
    const chave = await lerChaveSilenciosa()
    if (chave) resumo.divergencias.push(...await espelharChave(espelho, chave))
    for (const l of lotes) {
      const divergencias = await espelharLote(espelho, l)
      if (divergencias.length) {
        resumo.divergencias.push(...divergencias)
        await admin.rpc('auditoria_registrar_erro_lote', { p_dia: l.dia, p_erro: `espelho no R2: ${divergencias[0]}` })
        continue
      }
      const { error: e } = await admin.rpc('auditoria_marcar_espelhado', { p_dia: l.dia, p_versao: l.versao })
      if (e) throw e
      resumo.espelhados.push(l.dia)
    }
    const { data: indice, error: e2 } = await admin.rpc('auditoria_indice_lotes')
    if (e2) throw e2
    await espelharIndice(espelho, indice)
  } catch (causa) {
    resumo.avisos.push(`espelho no R2: ${mensagem(causa)}`)
  }
}

/** Aviso à administração (sino e, conforme a preferência, e-mail) quando algo pede atenção. Um por rodada, no máximo. */
async function avisarAdministracao(admin: Admin, resumo: ResumoDaRotina) {
  const problemas: string[] = []
  if (resumo.cadeia && !resumo.cadeia.ok) problemas.push('a conferência da cadeia acusou divergência')
  const falhas = resumo.sincronizacao?.falhas_24h ?? 0
  if (falhas > 0) problemas.push(`${falhas} registro(s) não entraram na trilha nas últimas 24 horas`)
  const comErro = resumo.lotes.filter((l) => l.erros.length).map((l) => l.dia)
  if (comErro.length) problemas.push(`lote(s) com erro: ${comErro.join(', ')}`)
  if (resumo.divergencias.length) problemas.push(`o registro permanente no R2 difere do banco em ${resumo.divergencias.length} arquivo(s)`)
  if (!problemas.length) return
  try {
    const { data: ws } = await admin.from('workspaces').select('id').eq('kind', 'production').order('created_at').limit(1).maybeSingle()
    if (!ws) return
    const { data: admins } = await admin.from('workspace_members').select('user_id').eq('workspace_id', ws.id).eq('role', 'admin')
    await notificar(admin, {
      workspaceId: ws.id as string,
      para: (admins ?? []).map((a) => a.user_id as string),
      atorId: null,
      categoria: 'auditoria',
      titulo: 'Trilha pública pede atenção',
      mensagem: `Na rodada de hoje, ${problemas.join('; ')}.`,
      link: PAINEL_DA_TRILHA,
      botao: 'Abrir a trilha pública',
      nota: 'A conferência roda toda madrugada; o painel mostra o detalhe de cada lote e de cada falha.',
    })
  } catch (causa) {
    console.error('[trilha] aviso à administração não gravado:', mensagem(causa))
  }
}

export async function rotinaDiaria(): Promise<ResumoDaRotina> {
  const admin = createAdminClient()
  const inicio = Date.now()
  const resumo: ResumoDaRotina = { lotes: [], publicados: [], espelhados: [], divergencias: [], avisos: [] }

  const sinc = await admin.rpc('auditoria_sincronizar')
  if (sinc.error) resumo.avisos.push(`sincronização: ${mensagem(sinc.error)}`)
  else resumo.sincronizacao = sinc.data as Record<string, number>

  const verificacao = await admin.rpc('auditoria_verificar_cadeia', { p_origem: 'cron' })
  if (verificacao.error) resumo.avisos.push(`conferência da cadeia: ${mensagem(verificacao.error)}`)
  else {
    const v = verificacao.data as { ok: boolean; eventos: number; lotes: number; lotes_ok: boolean }
    resumo.cadeia = { ok: v.ok, eventos: v.eventos, lotes: v.lotes, lotes_ok: v.lotes_ok }
  }

  const dia = diaAnterior(hojeEmSaoPaulo())
  const fechado = await admin.rpc('auditoria_fechar_lote', { p_dia: dia })
  if (fechado.error) resumo.avisos.push(`fechamento do lote de ${dia}: ${mensagem(fechado.error)}`)
  else {
    const f = fechado.data as { dia: string; itens: number; compromisso: string } | null
    resumo.lote = f ? { dia: f.dia, itens: f.itens, compromisso: f.compromisso } : null
  }

  await processarPendentes(admin, resumo, inicio, true)
  await espelharNoR2(admin, resumo, inicio)
  await avisarAdministracao(admin, resumo)
  return resumo
}

export async function rotinaDasProvas(): Promise<ResumoDaRotina> {
  const admin = createAdminClient()
  const resumo: ResumoDaRotina = { lotes: [], publicados: [], espelhados: [], divergencias: [], avisos: [] }
  const inicio = Date.now()
  await processarPendentes(admin, resumo, inicio, true)
  await espelharNoR2(admin, resumo, inicio)
  if (resumo.divergencias.length) await avisarAdministracao(admin, resumo)
  return resumo
}
