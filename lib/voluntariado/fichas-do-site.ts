import 'server-only'
import sharp from 'sharp'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterChave } from '@/lib/integracoes/chaves'
import { notificar } from '@/lib/notificacoes/servidor'
import { gerentesDoVoluntariado } from '@/lib/membro/comunicacao'
import { LADO_DA_FOTO, conferirFoto } from '@/lib/membro/foto'
import { trocarFoto } from '@/lib/membro/foto-servidor'
import { camposDaFicha, deveImportar, versaoDoTermo, type FichaDoSite } from './fichas-do-site-regras'

/**
 * As fichas de voluntariado do site na Redação (27/10/2026). O cadastro do site
 * (cruzvermelhariodejaneiro.org/voluntariado/cadastro/) grava no banco do site; aqui elas
 * são buscadas pela API do site e viram "Inscrições pendentes" (origem 'importacao').
 * Aprovar uma delas avisa o site, que aceita a ficha e devolve o código de aprovação.
 *
 * A chave é a mesma dos dois lados: REDACAO_TOKEN no config-redacao.php do servidor do
 * site e, aqui, "Site — fichas de voluntariado" em Configurações → Integrações (ou a
 * variável SITE_VOLUNTARIOS_TOKEN). Sem ela, nada acontece.
 *
 * Rodam: a rotina diária (vercel.json), o aviso que o site manda a cada ficha nova e o
 * botão "Buscar fichas do site" da aba Inscrições pendentes.
 */

const API_PADRAO = 'https://cruzvermelhariodejaneiro.org/matricula-cursos-presenciais/api/redacao-voluntarios.php'
const LOTE = 20

export const apiDoSite = () => process.env.SITE_VOLUNTARIOS_URL?.trim() || API_PADRAO

export async function chaveDoSite(workspaceId: string): Promise<string | null> {
  return obterChave(workspaceId, 'site_voluntarios')
}

class ErroDoSite extends Error {}

async function chamarSite<T>(workspaceId: string, init: { metodo: 'GET' | 'POST'; query?: string; corpo?: unknown }): Promise<T> {
  const chave = await chaveDoSite(workspaceId)
  if (!chave) throw new ErroDoSite('A ligação com o site não está configurada (Configurações → Integrações → Site — fichas de voluntariado).')
  const resp = await fetch(apiDoSite() + (init.query ?? ''), {
    method: init.metodo,
    headers: { Authorization: `Bearer ${chave}`, Accept: 'application/json', ...(init.corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: init.corpo ? JSON.stringify(init.corpo) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })
  const dados = (await resp.json().catch(() => ({}))) as T & { erro?: string }
  if (!resp.ok) throw new ErroDoSite(dados?.erro ? `O site respondeu: ${String(dados.erro).slice(0, 200)}` : `O site respondeu ${resp.status}.`)
  return dados
}

/** A selfie do site (JPG de até 800 px, de qualquer proporção) no formato da foto da Redação: JPEG quadrado de 512 px. */
async function fotoDaSelfie(base64: string): Promise<Uint8Array | null> {
  try {
    const jpeg = await sharp(Buffer.from(base64, 'base64')).rotate()
      .resize(LADO_DA_FOTO, LADO_DA_FOTO, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 85, mozjpeg: true }).toBuffer()
    const r = conferirFoto(new Uint8Array(jpeg))
    return 'erro' in r ? null : r.bytes
  } catch {
    return null
  }
}

export type ResultadoDaBusca = { importadas: number; puladas: number; jaExistiam: number; semFoto: number; erro?: string }

/**
 * Busca as fichas novas do site (a partir da última lida) e cria as inscrições pendentes.
 * Para no prazo e continua da mesma ficha na próxima vez. Nunca devolve dado pessoal.
 */
export async function buscarFichasDoSite(workspaceId: string, prazo = Date.now() + 40_000): Promise<ResultadoDaBusca> {
  const admin = createAdminClient()
  const r: ResultadoDaBusca = { importadas: 0, puladas: 0, jaExistiam: 0, semFoto: 0 }
  const { data: controle } = await admin.from('site_fichas_sincronizacao').select('ultimo_id, importadas').eq('workspace_id', workspaceId).maybeSingle()
  let ultimo = Number(controle?.ultimo_id ?? 0)
  const nomes: string[] = []
  try {
    for (let rodada = 0; rodada < 50 && Date.now() < prazo; rodada++) {
      const lote = await chamarSite<{ fichas: FichaDoSite[]; ultimo: number; mais: boolean }>(workspaceId, { metodo: 'GET', query: `?desde=${ultimo}&limite=${LOTE}` })
      for (const f of lote.fichas ?? []) {
        if (!deveImportar(f)) { r.puladas++; ultimo = f.id; continue }
        const { data: existente } = await admin.from('participantes').select('id').eq('workspace_id', workspaceId).eq('site_protocolo', f.protocolo).maybeSingle()
        if (existente) { r.jaExistiam++; ultimo = f.id; continue }
        const { data: id, error } = await admin.rpc('importar_ficha_do_site', {
          p_workspace_id: workspaceId, p_protocolo: f.protocolo, p: camposDaFicha(f), p_consentimento_em: f.consentimento_em, p_versao_termo: versaoDoTermo(f),
        })
        if (error) throw new Error(`ficha ${f.protocolo}: ${error.message}`)
        if (!id) { r.jaExistiam++; ultimo = f.id; continue }
        r.importadas++
        nomes.push(f.nome)
        // A selfie vira a foto do cadastro (e vai para "Fotos do crachá"). Falhar aqui não desfaz a inscrição.
        const foto = f.selfie ? await fotoDaSelfie(f.selfie) : null
        if (foto) {
          try {
            await trocarFoto({
              workspaceId, participanteId: String(id), bytes: foto,
              definir: async (caminho) => {
                const { error: e } = await admin.rpc('definir_foto_da_ficha_do_site', { p_participante_id: id, p_foto_path: caminho })
                if (e) throw new Error(e.message)
                return null
              },
            })
          } catch (causa) {
            r.semFoto++
            console.error('[fichas-do-site] foto não gravada:', causa instanceof Error ? causa.message : causa)
          }
        } else {
          r.semFoto++
        }
        ultimo = f.id
      }
      if (!lote.mais) break
    }
  } catch (causa) {
    r.erro = causa instanceof Error ? causa.message.slice(0, 300) : 'falhou'
  }
  await admin.from('site_fichas_sincronizacao').upsert({
    workspace_id: workspaceId, ultimo_id: ultimo, importadas: Number(controle?.importadas ?? 0) + r.importadas,
    ultima_execucao: new Date().toISOString(), ultimo_erro: r.erro ?? null, updated_at: new Date().toISOString(),
  })
  if (r.importadas > 0) {
    await notificar(admin, {
      workspaceId, para: await gerentesDoVoluntariado(workspaceId), atorId: null, categoria: 'aprovacoes',
      titulo: r.importadas === 1 ? 'Nova ficha de voluntário do site' : `${r.importadas} fichas de voluntário do site`,
      mensagem: r.importadas === 1 ? `${nomes[0].slice(0, 120)} se cadastrou pelo site.` : `Chegaram ${r.importadas} fichas do cadastro do site.`,
      link: '/voluntariado?aba=inscricoes', botao: 'Ver inscrições', nota: 'Aprove ou recuse em Voluntários → Inscrições pendentes.',
    })
  }
  return r
}

/**
 * Aprovação de uma inscrição que veio do site: o site aceita a ficha, cria o cadastro no
 * ponto da sede e devolve o código de aprovação, que fica gravado aqui. Ficha que não veio
 * do site: nada a fazer (null). O CPF vai junto quando a Redação tem e a ficha pode não ter.
 */
export async function aprovarNoSite(workspaceId: string, participanteId: string, quem: string): Promise<{ codigo: string } | { erro: string } | null> {
  const admin = createAdminClient()
  const { data: p } = await admin.from('participantes').select('site_protocolo').eq('id', participanteId).eq('workspace_id', workspaceId).maybeSingle()
  const protocolo = (p?.site_protocolo as string | null) ?? null
  if (!protocolo) return null
  try {
    const { data: cpf } = await admin.rpc('cpf_para_o_site', { p_participante_id: participanteId })
    const r = await chamarSite<{ ok: boolean; codigo: string }>(workspaceId, {
      metodo: 'POST', corpo: { acao: 'aprovar', protocolo, quem, ...(typeof cpf === 'string' && cpf ? { cpf } : {}) },
    })
    const { error } = await admin.rpc('registrar_aprovacao_do_site', { p_participante_id: participanteId, p_codigo: r.codigo })
    if (error) throw new Error(error.message)
    return { codigo: r.codigo }
  } catch (causa) {
    return { erro: causa instanceof Error ? causa.message.slice(0, 300) : 'Não foi possível avisar o site.' }
  }
}

/** Recusa de uma inscrição que veio do site: a ficha fica recusada lá também. Melhor esforço. */
export async function recusarNoSite(workspaceId: string, protocolo: string | null, quem: string): Promise<void> {
  if (!protocolo) return
  try {
    await chamarSite(workspaceId, { metodo: 'POST', corpo: { acao: 'recusar', protocolo, quem } })
  } catch (causa) {
    console.error('[fichas-do-site] recusa não chegou ao site:', causa instanceof Error ? causa.message : causa)
  }
}
