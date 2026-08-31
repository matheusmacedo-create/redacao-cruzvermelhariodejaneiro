import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { emailConfigurado, remetente, respostaPara, dominiosVerificados, semChave } from '@/lib/newsletter/resend'
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
 */
export async function GET() {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) }

  const configurado = emailConfigurado()
  const espaco = await espacoDaNewsletter()

  // ---- o domínio do remetente está verificado? ----
  const dominioDoRemetente = remetente().match(/<([^>]+)>/)?.[1]?.split('@')[1]
    ?? remetente().split('@')[1]
  let dominios: { nome: string; estado: string }[] | undefined
  let erroDosDominios: string | undefined
  if (configurado) {
    try { dominios = await dominiosVerificados() }
    catch (causa) { erroDosDominios = semChave(causa instanceof Error ? causa.message : String(causa)) }
  }
  const oNosso = dominios?.find((d) => d.nome === dominioDoRemetente)
  const dominioVerificado = oNosso?.estado === 'verified'

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

  // ---- o formulário do site está apontando para cá? ----
  // Confere o HTML público da home: é o jeito de descobrir que alguém
  // republicou o site por cima e levou o formulário junto.
  let formularioDaHome: string | undefined
  try {
    const res = await fetch('https://cruzvermelhariodejaneiro.org/', { cache: 'no-store' })
    const html = await res.text()
    formularioDaHome = html.includes('/api/newsletter/inscrever')
      ? 'ligado'
      : /newsletter-form/.test(html)
        ? 'DECORATIVO — o formulário existe na home mas não envia para lugar nenhum'
        : 'não encontrado na home'
  } catch {
    formularioDaHome = 'não deu para conferir daqui'
  }

  const oQueFazer: string[] = []
  if (!configurado) oQueFazer.push('Cadastre RESEND_API_KEY nas variáveis de ambiente da Vercel e republique — variável nova só vale num build novo.')
  else if (erroDosDominios) oQueFazer.push(`Não deu para listar os domínios do Resend: ${erroDosDominios}`)
  else if (!oNosso) oQueFazer.push(`O domínio "${dominioDoRemetente}" não está cadastrado no Resend. Cadastre-o e publique os registros de DNS que o painel mostrar.`)
  else if (!dominioVerificado) oQueFazer.push(`O domínio "${dominioDoRemetente}" está cadastrado como "${oNosso.estado}". Enquanto não ficar "verified", toda tentativa de envio volta 403.`)
  if ('erro' in espaco) oQueFazer.push(espaco.erro)
  if (erroDaLista) oQueFazer.push(`Não deu para contar a lista: ${erroDaLista}`)
  if (formularioDaHome?.startsWith('DECORATIVO')) {
    oQueFazer.push('O formulário da home ainda é o decorativo: quem se inscreve por lá tem o endereço descartado. Substitua pelo trecho de docs/newsletter-formulario-da-home.html.')
  }
  if (lista?.pendentes && !lista.confirmados) {
    oQueFazer.push(`Há ${lista.pendentes} inscrição(ões) pendente(s) e nenhuma confirmada — sinal de que os convites não estão chegando.`)
  }
  if (!respostaPara()) {
    oQueFazer.push('Sem NEWSLETTER_RESPONDER_PARA, quem responder à newsletter escreve para o vazio.')
  }

  const tudoOk = configurado && dominioVerificado && !('erro' in espaco) && !erroDaLista

  return NextResponse.json({
    configurado,
    remetente: remetente(),
    responderPara: respostaPara() ?? '(não configurado)',
    dominioDoRemetente,
    dominioVerificado,
    dominiosNaConta: dominios?.map((d) => `${d.nome} (${d.estado})`),
    urlBaseDosLinks: urlBase(),
    origensDoFormulario: origensPermitidas(),
    espaco: 'erro' in espaco ? espaco.erro : espaco.id,
    lista,
    tetoDeDestinatarios: TETO_DE_DESTINATARIOS,
    formularioDaHome,
    veredito: tudoOk
      ? `Envio pronto: chave válida, domínio "${dominioDoRemetente}" verificado${lista ? `, ${lista.confirmados} inscrito(s) confirmado(s)` : ''}.`
      : !configurado ? 'Falta a chave do Resend.'
      : !dominioVerificado ? `O domínio "${dominioDoRemetente}" ainda não está verificado no Resend.`
      : 'Veja oQueFazer.',
    ...(oQueFazer.length ? { oQueFazer } : {}),
  })
}
