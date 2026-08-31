import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * O que a Redação devolve ao Cérebro — a fase 2 do contrato.
 *
 * O motor do Cérebro sempre aceitou dois dados que ninguém preenchia:
 *
 * - `jaPublicado` — os ganchos que a Casa já publicou. Sem isso ele só pega
 *   marca textual de conteúdo requentado e repete o que acabou de sair.
 * - `acoesDaCasa` — as ações confirmadas da filial, do Registrar. É o que
 *   separa "o assunto apareceu" de "a filial fez algo": sem esse dado, quase
 *   todo sinal externo fica com ação real baixa.
 *
 * Esta rota fecha o laço. Só títulos e nomes de atividade saem daqui — nada
 * de corpo de peça, contato ou história de pessoa atendida. Com
 * CEREBRO_CONTEXTO_TOKEN configurado, a rota exige o token como Bearer (o
 * mesmo padrão do PAUTA_TOKEN do outro lado); sem ele, fica aberta como o
 * contrato de pauta.
 *
 * Janela de 60 dias nos dois conjuntos: o ineditismo compara com o que é
 * recente, e ação de seis meses atrás não sustenta post de balanço de hoje.
 */

const JANELA_DIAS = 60
const TETO = 200

export async function GET(req: Request) {
  const segredo = process.env.CEREBRO_CONTEXTO_TOKEN
  if (segredo) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${segredo}`) {
      return NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
    }
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    // Sem service role configurada não há o que servir; o Cérebro segue sem
    // contexto, que é como ele sempre viveu — falha aberta, nunca 500 opaco.
    return NextResponse.json({ erro: 'Supabase não configurado' }, { status: 503 })
  }

  const corte = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000).toISOString()

  const [publicados, registrar] = await Promise.all([
    // O que foi ao ar: destinos publicados, com o título do mestre do pacote
    // (a página do site pode ter título próprio em extras). publicado_em é o
    // carimbo do banco — updated_at mentiria a data.
    admin
      .from('package_destinations')
      .select('extras,publicado_em,social_packages(mestre)')
      .eq('estado', 'publicada')
      .gte('publicado_em', corte)
      .order('publicado_em', { ascending: false })
      .limit(TETO * 2),
    // O Registrar: Ação e Evento são operação da filial. História, Ideia e
    // Material são intenção — intenção não é ação real.
    admin
      .from('pautas')
      .select('title,created_at')
      .overlaps('tags', ['Ação', 'Evento'])
      .gte('created_at', corte)
      .order('created_at', { ascending: false })
      .limit(TETO),
  ])

  if (publicados.error || registrar.error) {
    return NextResponse.json({ erro: 'não foi possível montar o contexto' }, { status: 500 })
  }

  const jaPublicado = new Set<string>()
  for (const d of publicados.data ?? []) {
    const extras = (d.extras ?? {}) as Record<string, unknown>
    const pacote = d.social_packages as { mestre?: Record<string, unknown> } | null
    const titulo =
      (typeof extras.titulo === 'string' && extras.titulo.trim()) ||
      (typeof pacote?.mestre?.titulo === 'string' && (pacote.mestre.titulo as string).trim()) ||
      ''
    if (titulo) jaPublicado.add(titulo)
    if (jaPublicado.size >= TETO) break
  }

  const acoesDaCasa = [
    ...new Set((registrar.data ?? []).map((p) => (p.title ?? '').trim()).filter(Boolean)),
  ].slice(0, TETO)

  return NextResponse.json(
    {
      versao: '1.0',
      geradoEm: new Date().toISOString(),
      janelaDias: JANELA_DIAS,
      jaPublicado: [...jaPublicado],
      acoesDaCasa,
    },
    // O Cérebro guarda a resposta por alguns minutos do lado dele; daqui ela
    // sai sempre fresca para não somar dois caches defasados.
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
