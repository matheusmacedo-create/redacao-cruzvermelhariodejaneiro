import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  normalizarEmail, normalizarNome, novoToken, prazoDeConfirmacao, ipDoPedido,
  TEXTO_DO_CONSENTIMENTO,
} from '@/lib/newsletter/inscricao'
import {
  espacoDaNewsletter, urlDeConfirmacao, urlDeSaida, urlDeSaidaEmUmClique, cabecalhosDeCors,
} from '@/lib/newsletter/contexto'
import { emailDeConfirmacao, emailDoMaterial } from '@/lib/newsletter/modelo'
import { materialPorId } from '@/lib/newsletter/materiais'
import { enviarEmail, emailConfigurado, semChave } from '@/lib/newsletter/resend'
import { decidirInscricao, LIMITE_POR_IP, HORAS_ENTRE_ENTREGAS, type InscritoExistente } from '@/lib/newsletter/decisao'

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
 *
 * PEDIDO DE MATERIAL (09/11/2026). A caixa "Receba a lista do kit de emergência"
 * das matérias (lib/site/caixa-de-material.ts) manda para cá com o campo
 * `material`. É a mesma inscrição, com as mesmas quatro defesas, e três
 * diferenças: o texto do aceite gravado é o do material (a pessoa autorizou a
 * lista e depois as notícias), a origem é "materia" e o convite é a mensagem
 * que entrega o arquivo, cujo botão confirma a inscrição
 * (lib/newsletter/materiais.ts). Quem já está na lista também recebe o
 * arquivo, numa mensagem sem convite e sem mexer no registro dela, no máximo
 * uma vez por dia (decisao.ts, `entregar`). No primeiro pedido de verdade,
 * em 09/11/2026, um inscrito antigo pediu a lista e não recebeu nada: a caixa
 * tinha prometido o que a regra não deixava cumprir.
 *
 * A trava dessa entrega é a janela de um dia POR ENDEREÇO, e não o limite por
 * IP: a entrega não grava o IP de quem pediu (seria reescrever o registro do
 * consentimento de outra pessoa), então a defesa 2 não a conta. O pior que um
 * robô consegue com ela é uma mensagem por dia, com a lista, a quem já
 * escolheu receber mensagens da filial.
 */

/** A mesma resposta para todo caminho de sucesso — inclusive os que não gravam. */
const RECADO = 'Quase lá! Enviamos um e-mail para você confirmar a inscrição. Confira também a caixa de spam.'

/**
 * O recado de quando o convite NÃO saiu.
 *
 * Vale para os dois jeitos de não sair: a chave do Resend ainda não existe, ou
 * ela existe e a chamada falhou (domínio não verificado é a causa nº 1). Nos
 * dois casos o endereço está guardado — o que muda é o que se diz a quem está
 * do outro lado.
 *
 * Responder "confira seu e-mail" quando o e-mail comprovadamente não saiu é
 * mandar a pessoa esperar por uma mensagem que não vem; ela conclui que a
 * inscrição falhou e vai embora. Este texto diz a verdade sem expor a falha
 * técnica, e o cadastro segue valendo.
 */
const RECADO_SEM_ENVIO = 'Recebemos seu cadastro! O e-mail de confirmação será enviado assim que nosso envio de newsletter entrar no ar.'

type Campos = { email: unknown; nome: unknown; armadilha: unknown; consentimento: unknown; material: unknown; origem: unknown }

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
    return { email: corpo.email, nome: corpo.nome, armadilha: corpo.site, consentimento: corpo.consentimento, material: corpo.material, origem: corpo.origem }
  }
  const form = await request.formData().catch(() => null)
  return {
    email: form?.get('email') ?? undefined,
    nome: form?.get('nome') ?? undefined,
    armadilha: form?.get('site') ?? undefined,
    consentimento: form?.get('consentimento') ?? undefined,
    material: form?.get('material') ?? undefined,
    origem: form?.get('origem') ?? undefined,
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

  // O material pedido, quando o formulário é a caixa de uma matéria. Campo ausente ou vazio é a inscrição comum.
  const pediuMaterial = typeof campos.material === 'string' && campos.material.trim() !== ''
  const material = pediuMaterial ? materialPorId(campos.material) : null
  // Os recados deste pedido: os do material, ou os da inscrição comum. Todo caminho de sucesso usa o mesmo.
  const recado = material?.recado ?? RECADO
  const recadoSemEnvio = material?.recadoSemEnvio ?? RECADO_SEM_ENVIO

  // Defesa 1: a armadilha. Sucesso para o robô, sem gravar nada.
  if (typeof campos.armadilha === 'string' && campos.armadilha.trim()) {
    return responder(true, recado)
  }

  // Material que não existe: página antiga em cache ou formulário forjado. Não vira inscrição comum, porque o aceite
  // que a pessoa leu na caixa não é o da newsletter, e gravar um texto que ela não viu seria registrar o que não houve.
  if (pediuMaterial && !material) {
    return responder(false, 'Este formulário está desatualizado. Recarregue a página e tente de novo.', 400)
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
  // é compartilhada entre as instâncias da função. Conta por updated_at (o
  // gatilho newsletter_inscritos_touch o atualiza): o reenvio de um endereço
  // que já existe também gasta a cota — senão bastava repetir o mesmo e-mail
  // para mandar convites sem limite.
  let inscricoesDoIpNaHora = 0
  if (ip) {
    const desde = new Date(Date.now() - 3600_000).toISOString()
    const { count } = await admin
      .from('newsletter_inscritos')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', espaco.id)
      .eq('consentimento_ip', ip)
      .gte('updated_at', desde)
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
    pedeMaterial: Boolean(material),
  })

  // Defesa 3: todo caminho silenciado responde igual ao de sucesso. O motivo
  // fica no log do servidor e nunca na resposta.
  if (decisao.acao === 'silenciar') {
    if (decisao.porque === 'limite-de-ip') {
      console.warn(`[newsletter] limite de ${LIMITE_POR_IP} inscrições/hora atingido pelo IP ${ip}`)
    }
    return responder(true, recado)
  }

  // Já está na lista e pediu o material: recebe só o arquivo. Nada do registro dela muda (nem o aceite, nem a origem).
  if (decisao.acao === 'entregar') {
    // `entregar` só sai com material; a conferência é para o compilador e para um engano futuro na decisão.
    if (!material) return responder(true, recado)
    if (!emailConfigurado()) {
      console.warn('[newsletter] material pedido por quem já está na lista, mas RESEND_API_KEY não está configurada')
      return responder(true, recadoSemEnvio)
    }
    // A hora da entrega é marcada ANTES de enviar, e é ela que fecha a janela de um dia (decisao.ts). Não há coluna
    // própria para isso: a marca é o updated_at da linha, e nenhum outro valor dela muda.
    //
    // A marca leva a regra junto, de propósito: só grava se a linha CONTINUA confirmada (quem saiu da lista entre a
    // leitura e agora não é tocado) e se a última mudança dela tem mais de um dia. É o banco que decide, e não a
    // leitura feita acima: dois pedidos que chegam juntos leram a mesma hora antiga, e só o primeiro consegue marcar.
    // Sem a marca nada é enviado, e a resposta é a de sempre.
    //
    // O custo de marcar antes: se o envio falhar, a janela já fechou e a pessoa só recebe pedindo de novo amanhã
    // (o gatilho newsletter_inscritos_touch não deixa devolver a hora antiga). O recado desse caso diz que o envio
    // está fora do ar e aponta o guia, onde o arquivo está.
    const limite = new Date(Date.now() - HORAS_ENTRE_ENTREGAS * 3600_000).toISOString()
    const { data: marcado, error: erroDaMarca } = await admin
      .from('newsletter_inscritos')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', decisao.inscrito).eq('estado', 'confirmado').lt('updated_at', limite)
      .select('token_descadastro').maybeSingle()
    if (erroDaMarca) {
      console.error('[newsletter] falha ao marcar a entrega do material:', erroDaMarca.message)
      return responder(true, recadoSemEnvio)
    }
    if (!marcado) return responder(true, recado)
    try {
      const modelo = emailDoMaterial({
        material,
        // Sem confirmação a fazer, o botão vai direto ao arquivo.
        urlBaixar: material.arquivo,
        urlDeSaida: urlDeSaida(marcado.token_descadastro as string),
        jaInscrito: true,
      })
      await enviarEmail({
        para: email,
        assunto: modelo.assunto,
        html: modelo.html,
        texto: modelo.texto,
        urlDeSaidaEmUmClique: urlDeSaidaEmUmClique(marcado.token_descadastro as string),
      })
    } catch (causa) {
      console.error('[newsletter] material não saiu:', semChave(causa instanceof Error ? causa.message : String(causa)))
      return responder(true, recadoSemEnvio)
    }
    return responder(true, recado)
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
    // De onde veio: a caixa de material e a caixa "Receba as notícias" (lib/site/convites-da-materia.ts, que manda
    // origem=materia) ficam no fim das matérias; a inscrição comum, na home. Qualquer outro valor conta como home.
    origem: material || campos.origem === 'materia' ? ('materia' as const) : ('home' as const),
    // O texto que a pessoa leu e aceitou: o do material, quando o pedido veio da caixa dele.
    consentimento_texto: material?.consentimento ?? TEXTO_DO_CONSENTIMENTO,
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
    return responder(true, recadoSemEnvio)
  }

  try {
    // Com material, o convite é a mensagem que entrega o arquivo: o botão é o link de confirmação com o material
    // junto, e a rota de confirmação termina no arquivo (app/newsletter/confirmar).
    const modelo = material
      ? emailDoMaterial({
          material,
          urlBaixar: `${urlDeConfirmacao(token)}&m=${encodeURIComponent(material.id)}`,
          urlDeSaida: urlDeSaida(gravado.token_descadastro as string),
        })
      : emailDeConfirmacao({
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
    // O cadastro fica: perder o endereço de quem quis se inscrever seria o
    // único erro irreversível aqui. Mas a resposta muda — dizer "enviamos" de
    // um e-mail que não saiu é a promessa que este projeto começou consertando.
    console.error('[newsletter] convite não saiu:', semChave(causa instanceof Error ? causa.message : String(causa)))
    return responder(true, recadoSemEnvio)
  }

  return responder(true, recado)
}
