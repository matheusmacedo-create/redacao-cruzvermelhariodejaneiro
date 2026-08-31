import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  normalizarEmail, normalizarNome, novoToken, prazoDeConfirmacao, ipDoPedido,
  TEXTO_DO_CONSENTIMENTO,
} from '@/lib/newsletter/inscricao'
import {
  espacoDaNewsletter, urlDeConfirmacao, urlDeSaida, urlDeSaidaEmUmClique, cabecalhosDeCors,
} from '@/lib/newsletter/contexto'
import { emailDeConfirmacao } from '@/lib/newsletter/modelo'
import { enviarEmail, emailConfigurado, semChave } from '@/lib/newsletter/resend'
import { decidirInscricao, LIMITE_POR_IP, type InscritoExistente } from '@/lib/newsletter/decisao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Inscrição na newsletter, vinda do site institucional.
 *
 * Esta é a PRIMEIRA rota de escrita da aplicação aberta sem sessão. Todas as
 * outras exigem um membro do espaço; esta, por definição, não pode. Por isso
 * ela nasce com as quatro defesas que uma rota assim precisa ter desde o
 * primeiro dia — depois vira dívida:
 *
 *  1. ARMADILHA. Um campo escondido que humano nenhum preenche. Robô de
 *     formulário preenche tudo que encontra; quando vier preenchido, a
 *     resposta é de sucesso e nada é gravado. Enganar o robô é melhor do que
 *     recusá-lo, porque recusa ele tenta de novo, diferente.
 *
 *  2. LIMITE POR ENDEREÇO DE IP, contado no banco. Um contador em memória não
 *     serve: cada instância da função tem a sua, e o atacante cai numa
 *     instância nova a cada chamada. O banco é o único lugar onde a contagem
 *     é compartilhada de verdade.
 *
 *  3. RESPOSTA SEMPRE IGUAL. Se a rota dissesse "este e-mail já está
 *     inscrito", qualquer um descobriria quem é da lista testando endereços,
 *     um a um. A lista de quem apoia uma instituição humanitária não é
 *     informação pública.
 *
 *  4. CONFIRMAÇÃO EM DUAS ETAPAS. Nada é enviado antes de a pessoa clicar no
 *     link que chega na caixa dela.
 *
 * O endereço é SEMPRE gravado antes de tentar enviar o convite. Se o Resend
 * estiver fora, ou nem configurado ainda, o pedido fica registrado como
 * pendente e o convite pode sair depois — perder o endereço de quem quis se
 * inscrever seria o único erro irreversível aqui.
 */

/** A mesma resposta para todo caminho de sucesso — inclusive os que não gravam. */
const RECADO = 'Quase lá! Enviamos um e-mail para você confirmar a inscrição. Confira também a caixa de spam.'

/**
 * O recado de quando ainda não há por onde enviar.
 *
 * Enquanto o RESEND_API_KEY não existir, o endereço é guardado mas nenhum
 * convite sai. Responder "confira seu e-mail" nesse estado seria mandar a
 * pessoa esperar por uma mensagem que não vem — e ela concluiria que a
 * inscrição falhou. O endereço fica registrado e o convite é enviado quando o
 * envio for ligado; é isso que a resposta diz.
 */
const RECADO_SEM_ENVIO = 'Recebemos seu cadastro! O e-mail de confirmação será enviado assim que nosso envio de newsletter entrar no ar.'

type Campos = { email: unknown; nome: unknown; armadilha: unknown; consentimento: unknown }

/**
 * Aceita JSON e formulário comum.
 *
 * O formulário comum importa: o site institucional é HTML estático, e um
 * <form> que funcione sem JavaScript é o caminho que nunca quebra — inclusive
 * para quem navega com script bloqueado.
 */
async function lerCampos(request: NextRequest): Promise<Campos> {
  const tipo = request.headers.get('content-type') ?? ''
  if (tipo.includes('application/json')) {
    const corpo = await request.json().catch(() => ({})) as Record<string, unknown>
    return { email: corpo.email, nome: corpo.nome, armadilha: corpo.site, consentimento: corpo.consentimento }
  }
  const form = await request.formData().catch(() => null)
  return {
    email: form?.get('email') ?? undefined,
    nome: form?.get('nome') ?? undefined,
    armadilha: form?.get('site') ?? undefined,
    consentimento: form?.get('consentimento') ?? undefined,
  }
}

/** Formulário sem JavaScript navega para a resposta; a de JSON fica em JSON. */
function querHtml(request: NextRequest): boolean {
  const tipo = request.headers.get('content-type') ?? ''
  const aceita = request.headers.get('accept') ?? ''
  return !tipo.includes('application/json') && aceita.includes('text/html')
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cabecalhosDeCors(request.headers.get('origin')) })
}

export async function POST(request: NextRequest) {
  const cors = cabecalhosDeCors(request.headers.get('origin'))
  const html = querHtml(request)

  const responder = (ok: boolean, recado: string, status = 200) => {
    if (html) {
      const destino = new URL(ok ? '/newsletter/quase-la' : '/newsletter/erro', request.nextUrl.origin)
      // O recado viaja também no sucesso: sem envio configurado ele é outro, e
      // a página não tem como saber disso sozinha.
      destino.searchParams.set(ok ? 'recado' : 'motivo', recado)
      return NextResponse.redirect(destino, { status: 303 })
    }
    return NextResponse.json(ok ? { ok: true, recado } : { ok: false, erro: recado }, { status, headers: cors })
  }

  const campos = await lerCampos(request)

  // Defesa 1: a armadilha. Sucesso para o robô, sem gravar nada.
  if (typeof campos.armadilha === 'string' && campos.armadilha.trim()) {
    return responder(true, RECADO)
  }

  const email = normalizarEmail(campos.email)
  if (!email) return responder(false, 'Confira o endereço de e-mail digitado.', 400)

  // O aceite é obrigatório e explícito. Ausente = não há consentimento a
  // registrar, e sem consentimento a instituição não pode enviar nada.
  const aceitou = campos.consentimento === true || campos.consentimento === 'on'
    || campos.consentimento === 'true' || campos.consentimento === '1'
  if (!aceitou) {
    return responder(false, 'É preciso autorizar o envio para concluir a inscrição.', 400)
  }

  const nome = normalizarNome(campos.nome)
  const ip = ipDoPedido(request.headers)
  const agente = request.headers.get('user-agent')?.slice(0, 300) ?? null

  const espaco = await espacoDaNewsletter()
  if ('erro' in espaco) {
    console.error('[newsletter]', espaco.erro)
    return responder(false, 'A inscrição está indisponível neste momento. Tente mais tarde.', 503)
  }

  const admin = createAdminClient()

  // Defesa 2: limite por IP, contado no banco — o único lugar onde a contagem
  // é compartilhada entre as instâncias da função.
  let inscricoesDoIpNaHora = 0
  if (ip) {
    const desde = new Date(Date.now() - 3600_000).toISOString()
    const { count } = await admin
      .from('newsletter_inscritos')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', espaco.id)
      .eq('consentimento_ip', ip)
      .gte('created_at', desde)
    inscricoesDoIpNaHora = count ?? 0
  }

  const { data: existente } = await admin
    .from('newsletter_inscritos')
    .select('id, estado, token_descadastro, updated_at')
    .eq('workspace_id', espaco.id)
    .eq('email', email)
    .maybeSingle()

  const decisao = decidirInscricao({
    existente: (existente ?? null) as InscritoExistente,
    inscricoesDoIpNaHora,
  })

  // Defesa 3: todo caminho silenciado responde igual ao de sucesso. O motivo
  // fica no log do servidor e nunca na resposta.
  if (decisao.acao === 'silenciar') {
    if (decisao.porque === 'limite-de-ip') {
      console.warn(`[newsletter] limite de ${LIMITE_POR_IP} inscrições/hora atingido pelo IP ${ip}`)
    }
    return responder(true, RECADO)
  }

  const token = novoToken()
  const linha = {
    workspace_id: espaco.id,
    email,
    nome: nome || (decisao.atualizar ? undefined : ''),
    estado: 'pendente' as const,
    token_confirmacao: token,
    token_confirmacao_expira_em: prazoDeConfirmacao(),
    // Quem saiu e voltou tem o registro de saída limpo: o pedido novo é dela,
    // e a confirmação em duas etapas prova que é.
    descadastrado_em: null,
    origem: 'home' as const,
    consentimento_texto: TEXTO_DO_CONSENTIMENTO,
    consentimento_ip: ip,
    consentimento_agente: agente,
  }

  const { data: gravado, error } = decisao.atualizar
    ? await admin.from('newsletter_inscritos').update(linha).eq('id', decisao.atualizar)
        .select('token_descadastro').single()
    : await admin.from('newsletter_inscritos').insert(linha)
        .select('token_descadastro').single()

  if (error || !gravado) {
    console.error('[newsletter] falha ao gravar a inscrição:', error?.message)
    return responder(false, 'Não foi possível concluir a inscrição agora. Tente mais tarde.', 500)
  }

  // Defesa 4: o convite. Falha aqui NÃO desfaz o cadastro — o endereço já
  // está guardado, e o convite pode ser reenviado depois pela tela de gestão.
  if (!emailConfigurado()) {
    console.warn('[newsletter] inscrição gravada, mas RESEND_API_KEY não está configurada: convite não enviado para', email)
    return responder(true, RECADO_SEM_ENVIO)
  }

  try {
    const modelo = emailDeConfirmacao({
      nome,
      urlConfirmar: urlDeConfirmacao(token),
      urlDeSaida: urlDeSaida(gravado.token_descadastro as string),
    })
    await enviarEmail({
      para: email,
      assunto: modelo.assunto,
      html: modelo.html,
      texto: modelo.texto,
      urlDeSaidaEmUmClique: urlDeSaidaEmUmClique(gravado.token_descadastro as string),
    })
  } catch (causa) {
    console.error('[newsletter] convite não saiu:', semChave(causa instanceof Error ? causa.message : String(causa)))
  }

  return responder(true, RECADO)
}
