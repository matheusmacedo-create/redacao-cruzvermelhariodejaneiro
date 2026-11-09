import { NextResponse, type NextRequest } from 'next/server'
import { requirePermissao } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { emailConfigurado, remetente, respostaPara, listarDominios } from '@/lib/newsletter/resend'
import { vereditoDoEnvio, type ListagemDeDominios } from '@/lib/newsletter/diagnostico'
import { urlBase, espacoDaNewsletter, origensPermitidas } from '@/lib/newsletter/contexto'
import { TETO_DE_DESTINATARIOS } from '@/lib/newsletter/envio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Diagnóstico da newsletter, no padrão de /api/admin/redes-check e ia-check.
 *
 * Existe porque a newsletter falha em silêncio de três jeitos que ninguém
 * percebe olhando a tela: o domínio não verificado (toda chamada volta 403), o
 * DNS incompleto (as mensagens saem e vão para spam) e o formulário do site
 * desligado (a lista para de crescer e ninguém repara).
 *
 * Nunca devolve segredo: só nomes de variável, e o remetente, que é público
 * por definição — ele aparece no cabeçalho de toda mensagem enviada.
 *
 * O veredito mora em lib/newsletter/diagnostico.ts, e não aqui: ele só afirma
 * o que foi conferido. Com a chave "só de envio" o Resend não lista domínios,
 * e a resposta é "não deu para consultar", nunca "não está verificado".
 *
 * `?so=formulario` devolve só a leitura da home: é o que o cartão "Formulário
 * do site" pede sozinho a cada abertura da Newsletter, e ele não precisa (nem
 * deve) chamar o Resend e contar a lista para isso.
 */

/**
 * O formulário do site está apontando para cá? Confere o HTML público da
 * home: é o jeito de descobrir que alguém republicou o site por cima e levou
 * o formulário junto.
 */
async function lerFormularioDaHome(): Promise<string> {
  try {
    const res = await fetch('https://cruzvermelhariodejaneiro.org/', { cache: 'no-store' })
    const html = await res.text()
    return html.includes('/api/newsletter/inscrever')
      ? 'ligado'
      : /newsletter-form/.test(html)
        ? 'DECORATIVO — o formulário existe na home mas não envia para lugar nenhum'
        : 'não encontrado na home'
  } catch {
    return 'não deu para conferir daqui'
  }
}

export async function GET(request: NextRequest) {
  try { await requirePermissao('diagnosticos.executar') } catch { return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) }

  if (request.nextUrl.searchParams.get('so') === 'formulario') {
    return NextResponse.json({ formularioDaHome: await lerFormularioDaHome() })
  }

  const configurado = emailConfigurado()
  const espaco = await espacoDaNewsletter()

  // ---- o domínio do remetente está verificado? ----
  const dominioDoRemetente = remetente().match(/<([^>]+)>/)?.[1]?.split('@')[1]
    ?? remetente().split('@')[1]
    ?? '(remetente sem domínio)'
  const listagem: ListagemDeDominios | null = configurado ? await listarDominios() : null

  // ---- a lista ----
  let lista: Record<string, number> | undefined
  let erroDaLista: string | undefined
  if (!('erro' in espaco)) {
    const admin = createAdminClient()
    const contar = async (filtro?: { estado: string }) => {
      let q = admin.from('newsletter_inscritos').select('id', { count: 'exact', head: true })
        .eq('workspace_id', espaco.id)
      if (filtro) q = q.eq('estado', filtro.estado)
      const { count, error } = await q
      if (error) throw new Error(error.message)
      return count ?? 0
    }
    try {
      const [total, confirmados, pendentes, descadastrados, invalidos] = await Promise.all([
        contar(), contar({ estado: 'confirmado' }), contar({ estado: 'pendente' }),
        contar({ estado: 'descadastrado' }), contar({ estado: 'invalido' }),
      ])
      lista = { total, confirmados, pendentes, descadastrados, invalidos }
    } catch (causa) {
      erroDaLista = causa instanceof Error ? causa.message : String(causa)
    }
  }

  const formularioDaHome = await lerFormularioDaHome()

  const { veredito, tom, dominioVerificado, oQueFazer } = vereditoDoEnvio({
    configurado,
    dominioDoRemetente,
    listagem,
    erroDoEspaco: 'erro' in espaco ? espaco.erro : null,
    erroDaLista,
    lista: lista ? { confirmados: lista.confirmados, pendentes: lista.pendentes } : null,
    formularioDaHome,
    temRespostaPara: Boolean(respostaPara()),
  })

  return NextResponse.json({
    configurado,
    remetente: remetente(),
    responderPara: respostaPara() ?? '(não configurado)',
    dominioDoRemetente,
    // true ou false só quando o Resend respondeu a lista; null quando não deu para conferir.
    dominioVerificado,
    ...(listagem?.tipo === 'chave-so-de-envio' ? { chaveDoResend: 'só de envio (não lista domínios)' } : {}),
    dominiosNaConta: listagem?.tipo === 'lista' ? listagem.dominios.map((d) => `${d.nome} (${d.estado})`) : undefined,
    urlBaseDosLinks: urlBase(),
    origensDoFormulario: origensPermitidas(),
    espaco: 'erro' in espaco ? espaco.erro : espaco.id,
    lista,
    tetoDeDestinatarios: TETO_DE_DESTINATARIOS,
    formularioDaHome,
    veredito,
    tom,
    ...(oQueFazer.length ? { oQueFazer } : {}),
  })
}
