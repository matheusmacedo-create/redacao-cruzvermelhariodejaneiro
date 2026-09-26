import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerCamadas } from '@/lib/agenda/camadas'
import { camadasPermitidasNoIcs, itensDaAgenda } from '@/lib/agenda/fontes'
import { agoraEmBrasilia, somarDias } from '@/lib/agenda/datas'
import { gerarIcs } from '@/lib/agenda/ics'
import { ehPapel } from '@/lib/permissoes'

export const dynamic = 'force-dynamic'

/** Quanto o link leva: um mês para trás e seis para frente. */
const DIAS_ANTES = 30
const DIAS_DEPOIS = 180

const naoEncontrado = () => new Response('Link de agenda inválido ou desligado.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })

/**
 * O link de assinatura da Agenda (Google Agenda, Outlook, celular). Sem
 * sessão: o token secreto é a credencial, e o banco guarda só o hash dele.
 *
 * A cada leitura confere de novo que a pessoa está ativa no espaço e o que ela
 * pode ver — perder o acesso a uma área tira a camada do link na próxima
 * sincronização; desligar o link na Agenda derruba tudo.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: bruto } = await params
  const token = bruto.replace(/\.ics$/i, '')
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return naoEncontrado()

  const admin = createAdminClient()
  const hash = createHash('sha256').update(token).digest('hex')
  const { data: pref } = await admin.from('agenda_preferencias').select('workspace_id,user_id,ics_camadas').eq('ics_token_hash', hash).maybeSingle()
  if (!pref) return naoEncontrado()

  const [{ data: perfil }, { data: vinculo }] = await Promise.all([
    admin.from('profiles').select('active').eq('id', pref.user_id).maybeSingle(),
    admin.from('workspace_members').select('role').eq('workspace_id', pref.workspace_id).eq('user_id', pref.user_id).maybeSingle(),
  ])
  if (!perfil || perfil.active === false || !vinculo || !ehPapel(vinculo.role)) return naoEncontrado()

  const permitidas = await camadasPermitidasNoIcs(admin, pref.workspace_id, pref.user_id, vinculo.role)
  const pedidas = lerCamadas(pref.ics_camadas)
  const camadas = permitidas.filter((c) => pedidas.includes(c))

  const hoje = agoraEmBrasilia().dia
  const { itens } = await itensDaAgenda(admin, pref.workspace_id, pref.user_id, { de: somarDias(hoje, -DIAS_ANTES), ate: somarDias(hoje, DIAS_DEPOIS) }, camadas)
  const origem = new URL(request.url).origin
  const corpo = gerarIcs(itens, { nome: 'Palácio Virtual', baseUrl: origem })
  return new Response(corpo, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="palacio-virtual.ics"',
      'cache-control': 'private, max-age=900',
      'x-robots-tag': 'noindex',
    },
  })
}
