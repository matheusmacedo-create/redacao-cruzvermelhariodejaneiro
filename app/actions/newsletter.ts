'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { normalizarEmail, normalizarNome, novoToken, prazoDeConfirmacao, TEXTO_DO_CONSENTIMENTO } from '@/lib/newsletter/inscricao'
import { urlBase, urlDeConfirmacao, urlDeSaida, urlDeSaidaEmUmClique } from '@/lib/newsletter/contexto'
import { withFtp, baixarTexto, enviarNaRaizDoSite } from '@/lib/publicacao/ftp'
import { ligarFormularioNaHome, candidatosDeIndex, MARCA } from '@/lib/site/formulario-newsletter'
import { emailDaNewsletter, emailDeBoasVindas, emailDeConfirmacao } from '@/lib/newsletter/modelo'
import { conferirEdicao, MINUTOS_SEM_REPETIR } from '@/lib/newsletter/edicao'
import { enviarEdicao } from '@/lib/newsletter/envio'
import { createClient } from '@/lib/supabase/server'
import { enviarEmail, emailConfigurado, semChave } from '@/lib/newsletter/resend'

/**
 * As ações da Newsletter.
 *
 * Todas usam o cliente administrativo, e não o da sessão: a tabela de
 * inscritos tem política de LEITURA para membros do espaço e nenhuma de
 * escrita — de propósito, porque quem escreve nela é a rota pública, que não
 * tem sessão. Aqui a autorização é conferida em código, no começo de cada
 * ação, com requireWorkspace().
 *
 * Erro-como-valor, no padrão da casa: a tela mostra a mensagem em vez de uma
 * página de erro.
 */

export type Resultado = { erro?: string; recado?: string }

/** Garante que quem chamou é do espaço e devolve o id dele. */
async function espacoAutorizado() {
  const context = await requireWorkspace()
  return { workspaceId: context.workspace.id, userId: context.user.id, role: context.role }
}

/**
 * Reenvia o convite de confirmação a quem ainda não confirmou.
 *
 * É a ação que resolve o problema mais comum da lista: alguém se inscreveu
 * quando o envio ainda não funcionava, ou o convite caiu em spam. Sem isto,
 * essas pessoas ficariam presas em "pendente" para sempre — a lista mostra
 * gente que quis entrar e nunca vai receber nada.
 *
 * O token é SEMPRE renovado. Reenviar o mesmo prolongaria a validade de um
 * link antigo que pode ter vazado num encaminhamento.
 */
export async function reenviarConvite(formData: FormData): Promise<Resultado> {
  try {
    const { workspaceId } = await espacoAutorizado()
    const id = String(formData.get('id') ?? '')
    if (!id) throw new Error('Inscrito não informado.')
    if (!emailConfigurado()) throw new Error('O envio de e-mail não está configurado: falta RESEND_API_KEY.')

    const admin = createAdminClient()
    const { data: inscrito } = await admin
      .from('newsletter_inscritos')
      .select('id, email, nome, estado, token_descadastro')
      .eq('workspace_id', workspaceId).eq('id', id).maybeSingle()

    if (!inscrito) throw new Error('Inscrito não encontrado.')
    if (inscrito.estado === 'confirmado') throw new Error('Este endereço já confirmou — não precisa de convite.')
    if (inscrito.estado === 'descadastrado') {
      // Reconvidar quem pediu para sair é o comportamento que transforma uma
      // lista legítima em spam, e é irreversível aos olhos de quem recebe.
      throw new Error('Este endereço pediu para sair da lista. Reenviar convite a quem se descadastrou não é permitido.')
    }

    const token = novoToken()
    const { error } = await admin.from('newsletter_inscritos').update({
      token_confirmacao: token,
      token_confirmacao_expira_em: prazoDeConfirmacao(),
    }).eq('id', inscrito.id)
    if (error) throw new Error('Não foi possível preparar o convite.')

    const modelo = emailDeConfirmacao({
      nome: inscrito.nome as string,
      urlConfirmar: urlDeConfirmacao(token),
      urlDeSaida: urlDeSaida(inscrito.token_descadastro as string),
    })
    await enviarEmail({
      para: inscrito.email as string,
      assunto: modelo.assunto,
      html: modelo.html,
      texto: modelo.texto,
      urlDeSaidaEmUmClique: urlDeSaidaEmUmClique(inscrito.token_descadastro as string),
    })

    revalidatePath('/newsletter')
    return { recado: `Convite reenviado para ${inscrito.email}.` }
  } catch (causa) {
    return { erro: semChave(mensagemDoErro(causa, 'Não foi possível reenviar o convite.')) }
  }
}

/**
 * Reenvia o convite a TODOS os pendentes de uma vez.
 *
 * Existe por causa de um caso concreto: enquanto o envio não estava
 * configurado, quem se inscreveu ficou guardado sem receber nada. Ligado o
 * envio, essas pessoas precisam de um convite — uma a uma seria trabalho
 * manual proporcional ao tamanho do problema.
 *
 * O teto é o mesmo do envio de edição, e pela mesma razão: acima dele a
 * função da Vercel morre no meio, e metade dos convites some sem registro.
 */
const TETO_DE_CONVITES = 100

export async function reenviarConvitesPendentes(): Promise<Resultado> {
  try {
    const { workspaceId } = await espacoAutorizado()
    if (!emailConfigurado()) throw new Error('O envio de e-mail não está configurado: falta RESEND_API_KEY.')

    const admin = createAdminClient()
    const { data: pendentes } = await admin
      .from('newsletter_inscritos')
      .select('id, email, nome, token_descadastro')
      .eq('workspace_id', workspaceId).eq('estado', 'pendente')
      .order('created_at', { ascending: true })
      .limit(TETO_DE_CONVITES + 1)

    const lista = pendentes ?? []
    if (!lista.length) throw new Error('Não há ninguém pendente de confirmação.')
    if (lista.length > TETO_DE_CONVITES) {
      throw new Error(`Há mais de ${TETO_DE_CONVITES} pendentes, e não cabem num envio só. Reenvie individualmente ou fale comigo para construir o envio em fila.`)
    }

    let enviados = 0
    for (const inscrito of lista) {
      const token = novoToken()
      const { error } = await admin.from('newsletter_inscritos').update({
        token_confirmacao: token,
        token_confirmacao_expira_em: prazoDeConfirmacao(),
      }).eq('id', inscrito.id)
      if (error) continue

      const modelo = emailDeConfirmacao({
        nome: inscrito.nome as string,
        urlConfirmar: urlDeConfirmacao(token),
        urlDeSaida: urlDeSaida(inscrito.token_descadastro as string),
      })
      try {
        await enviarEmail({
          para: inscrito.email as string,
          assunto: modelo.assunto,
          html: modelo.html,
          texto: modelo.texto,
          urlDeSaidaEmUmClique: urlDeSaidaEmUmClique(inscrito.token_descadastro as string),
        })
        enviados++
      } catch (causa) {
        // Uma falha não pode derrubar a leva inteira: os outros convites são
        // independentes. O que não pode é a tela dizer que foram todos.
        console.error('[newsletter] convite não saiu para', inscrito.email, semChave(causa instanceof Error ? causa.message : String(causa)))
      }
    }

    revalidatePath('/newsletter')
    return enviados === lista.length
      ? { recado: `${enviados} convite(s) reenviado(s).` }
      : { erro: `Saíram ${enviados} de ${lista.length} convites. Veja o diagnóstico para o motivo dos que falharam.` }
  } catch (causa) {
    return { erro: semChave(mensagemDoErro(causa, 'Não foi possível reenviar os convites.')) }
  }
}

/**
 * Apaga um inscrito, de verdade.
 *
 * É o direito de eliminação da LGPD (art. 18, VI). Quando alguém pede para ser
 * apagado, "marcar como descadastrado" não atende: o pedido é para sumir com o
 * dado, não para parar de receber. Por isso aqui é DELETE, e não update.
 *
 * A diferença importa na prática: descadastrar mantém o endereço na base para
 * impedir reinscrição acidental; apagar significa que, se a pessoa se
 * inscrever de novo amanhã, entra como novata — que é exatamente o certo,
 * porque o registro anterior deixou de existir a pedido dela.
 */
export async function apagarInscrito(formData: FormData): Promise<Resultado> {
  try {
    const { workspaceId, userId, role } = await espacoAutorizado()
    // A tela já esconde o botão de quem não é admin, mas a action é um
    // endpoint público para qualquer membro logado: a regra tem de estar aqui.
    if (!pode(role, 'newsletter.apagar')) throw new Error('Só um administrador pode apagar inscritos.')
    const id = String(formData.get('id') ?? '')
    if (!id) throw new Error('Inscrito não informado.')

    const admin = createAdminClient()
    const { data: inscrito } = await admin
      .from('newsletter_inscritos').select('email')
      .eq('workspace_id', workspaceId).eq('id', id).maybeSingle()
    if (!inscrito) throw new Error('Inscrito não encontrado.')

    const { error } = await admin.from('newsletter_inscritos')
      .delete().eq('workspace_id', workspaceId).eq('id', id)
    if (error) throw new Error('Não foi possível apagar o registro.')

    // O registro de atividade guarda que a exclusão aconteceu e quem pediu,
    // sem guardar o endereço apagado — senão apagar não teria apagado nada.
    await admin.from('activity_log').insert({
      workspace_id: workspaceId,
      actor_id: userId,
      action: 'newsletter_inscrito_apagado',
      entity_type: 'newsletter',
      metadata: { motivo: 'pedido de eliminação (LGPD art. 18, VI)' },
    })

    revalidatePath('/newsletter')
    return { recado: 'Registro apagado.' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível apagar o registro.') }
  }
}

/**
 * Acrescenta um endereço à mão.
 *
 * Serve para quem pediu pessoalmente — no balcão de um curso, numa ligação. E
 * é o ponto por onde uma lista comprada entraria, então tem duas travas:
 *
 *  1. UM endereço por vez. Não há campo de colar lista, de propósito: o
 *     atrito é a defesa. Importação em massa sem prova de consentimento é o
 *     que faz uma instituição inteira ser marcada como spam.
 *  2. Quem inseriu fica registrado no consentimento. O endereço entra na lista
 *     na hora, como no formulário do site (19/11/2026: sem clique de
 *     confirmação), e recebe as boas-vindas com o link de saída.
 */
export async function adicionarInscrito(formData: FormData): Promise<Resultado> {
  try {
    const { workspaceId, userId } = await espacoAutorizado()

    const email = normalizarEmail(formData.get('email'))
    if (!email) throw new Error('Endereço de e-mail inválido.')
    const nome = normalizarNome(formData.get('nome'))

    const admin = createAdminClient()
    const { data: existente } = await admin
      .from('newsletter_inscritos').select('id, estado')
      .eq('workspace_id', workspaceId).eq('email', email).maybeSingle()

    if (existente?.estado === 'confirmado') throw new Error('Este endereço já está na lista.')
    if (existente?.estado === 'descadastrado') {
      throw new Error('Este endereço pediu para sair da lista. Só a própria pessoa pode voltar, pelo formulário do site.')
    }

    const linha = {
      workspace_id: workspaceId,
      email,
      nome,
      estado: 'confirmado' as const,
      confirmado_em: new Date().toISOString(),
      token_confirmacao: null,
      token_confirmacao_expira_em: null,
      origem: 'manual' as const,
      // Registra QUEM inseriu: numa inscrição manual, o consentimento foi dado
      // fora do sistema, e a única prova possível é quem afirma tê-lo colhido.
      consentimento_texto: `${TEXTO_DO_CONSENTIMENTO} [Inscrição manual registrada por um membro da equipe (${userId}), que declarou ter o consentimento da pessoa.]`,
    }

    const { data: gravado, error } = existente
      ? await admin.from('newsletter_inscritos').update(linha).eq('id', existente.id).select('token_descadastro').single()
      : await admin.from('newsletter_inscritos').insert(linha).select('token_descadastro').single()
    if (error || !gravado) throw new Error('Não foi possível gravar o endereço.')

    if (emailConfigurado()) {
      try {
        const modelo = emailDeBoasVindas({ nome, urlDeSaida: urlDeSaida(gravado.token_descadastro as string) })
        await enviarEmail({
          para: email,
          assunto: modelo.assunto,
          html: modelo.html,
          texto: modelo.texto,
          urlDeSaidaEmUmClique: urlDeSaidaEmUmClique(gravado.token_descadastro as string),
        })
      } catch (causa) {
        console.error('[newsletter] as boas-vindas da inscrição manual não saíram:', semChave(causa instanceof Error ? causa.message : String(causa)))
        revalidatePath('/newsletter')
        return { recado: `${email} entrou na lista, mas a mensagem de boas-vindas não saiu. Veja o diagnóstico do envio.` }
      }
    }

    revalidatePath('/newsletter')
    return {
      recado: emailConfigurado()
        ? `${email} entrou na lista e recebeu a mensagem de boas-vindas.`
        : `${email} entrou na lista. A mensagem de boas-vindas não saiu: o envio de e-mail não está configurado.`,
    }
  } catch (causa) {
    return { erro: semChave(mensagemDoErro(causa, 'Não foi possível acrescentar o endereço.')) }
  }
}

/**
 * Liga o formulário da newsletter na home do site institucional.
 *
 * Esta é a única ação do sistema que reescreve uma página do site
 * institucional que não nasceu aqui. Por isso ela tem mais freios do que
 * qualquer outra:
 *
 *  - RESTRITA A ADMINISTRADOR. Publicar no site já é sério; reescrever a home
 *    é outro patamar.
 *  - O CONTEÚDO É QUE IDENTIFICA O ARQUIVO, não o caminho. Se o que foi
 *    baixado não tiver a seção da newsletter conhecida, nada é gravado — e
 *    isso protege inclusive contra ter pego o index.html errado.
 *  - CONFERE DEPOIS. Termina buscando a home pública para provar que a
 *    mudança está no ar. Gravar por FTP e presumir que deu certo é como o
 *    "os arquivos subiram mas a página não responde" já aconteceu aqui antes.
 *  - IDEMPOTENTE. Rodar de novo não duplica nada.
 */
export async function ligarFormularioDoSite(): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    if (!pode(context.role, 'site.configurar')) throw new Error('Só um administrador pode alterar a página inicial do site.')

    const rota = `${urlBase()}/api/newsletter/inscrever`

    const resultado = await withFtp(async (client, config) => {
      // A pasta certa é DESCOBERTA, não adivinhada: o painel da Hostinger mostra
      // o caminho cortado, e já custou tentativa e erro neste projeto. Listamos
      // o que a conta enxerga e montamos os candidatos a partir disso.
      await client.cd('/')
      const naRaiz = await client.list()
      const pastasDaRaiz = naRaiz.filter((i) => i.isDirectory).map((i) => i.name)

      let pastasDeDomains: string[] = []
      if (pastasDaRaiz.includes('domains')) {
        try {
          await client.cd('/domains')
          pastasDeDomains = (await client.list()).filter((i) => i.isDirectory).map((i) => i.name)
          await client.cd('/')
        } catch { /* sem permissão de listar: seguimos com os outros candidatos */ }
      }

      const candidatos = candidatosDeIndex({ baseDir: config.baseDir, pastasDaRaiz, pastasDeDomains })
      const tentados: string[] = []

      for (const caminho of candidatos) {
        tentados.push(caminho)
        let html: string
        try { html = await baixarTexto(client, caminho) } catch { continue }
        // É o CONTEÚDO que identifica a home, não o caminho: uma pasta de
        // notícias também tem index.html, e com acesso ao servidor inteiro há
        // mais index.html por aí do que se imagina.
        if (!html.includes('newsletter-section')) continue

        const troca = ligarFormularioNaHome(html, rota)
        if (troca.estado === 'ja-ligado') return { ok: true as const, detalhe: troca.detalhe, gravou: false }
        if (troca.estado === 'recusado') return { ok: false as const, detalhe: troca.detalhe }

        const pasta = caminho.slice(0, caminho.lastIndexOf('/')) || '/'
        await enviarNaRaizDoSite(client, pasta, 'index.html', troca.html)
        return { ok: true as const, detalhe: troca.detalhe, gravou: true, onde: caminho, tamanho: troca.html.length }
      }

      return {
        ok: false as const,
        detalhe: `Não encontrei a home em nenhum destes caminhos: ${tentados.join(', ')}. `
          + `A conta enxerga na raiz: ${pastasDaRaiz.join(', ') || '(nada)'}. `
          + 'Me diga qual é a pasta do site e eu acrescento.',
      }
    })

    if (!resultado.ok) return { erro: resultado.detalhe }

    // A prova: a home pública tem de mostrar a marca. Sem esta conferência, um
    // FTP que aceitou o arquivo na pasta errada passaria por sucesso.
    let confirmado = false
    try {
      const res = await fetch('https://cruzvermelhariodejaneiro.org/', { cache: 'no-store' })
      confirmado = (await res.text()).includes(MARCA)
    } catch { /* rede: a conferência falha, a gravação não se desfaz */ }

    if (resultado.gravou) {
      await createAdminClient().from('activity_log').insert({
        workspace_id: context.workspace.id,
        actor_id: context.user.id,
        action: 'newsletter_formulario_ligado',
        entity_type: 'site',
        metadata: { onde: resultado.onde, tamanho: resultado.tamanho, confirmado },
      })
    }

    revalidatePath('/newsletter')
    return {
      recado: confirmado
        ? `${resultado.detalhe} Conferido: a home pública já está com o formulário ligado.`
        : `${resultado.detalhe} Não consegui confirmar na home pública agora — abra cruzvermelhariodejaneiro.org e teste o formulário.`,
    }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível ligar o formulário da home.') }
  }
}


/**
 * "Nova edição": a edição escrita na própria Newsletter (app/(app)/newsletter/nova).
 *
 * As duas ações abaixo conferem a edição de novo no servidor, com a mesma função que a tela usa
 * (lib/newsletter/edicao.ts): a tela pode estar desatualizada, e e-mail enviado não volta.
 */

/** Quem pode escrever e enviar uma edição; devolve o contexto ou lança a mensagem para a tela. */
async function autorizadoAEnviar() {
  const context = await requireWorkspace()
  if (!pode(context.role, 'newsletter.enviar')) {
    throw new Error('Enviar uma edição para a lista é para administradores e editores. Peça a um deles, ou monte a edição em Publicações para aprovação.')
  }
  if (!emailConfigurado()) throw new Error('O envio de e-mail não está configurado: falta RESEND_API_KEY.')
  return context
}

/**
 * Manda a edição só para quem está escrevendo, para ver como chega na caixa de entrada.
 *
 * Vai para o e-mail da conta de quem pediu, nunca para um endereço digitado: um campo "enviar teste para" seria um
 * jeito de mandar mensagem da filial a qualquer pessoa. O assunto leva "[Teste]" e o link de saída aponta para a
 * página de saída sem inscrição nenhuma: tocar nele não tira ninguém da lista.
 */
export async function enviarTesteDaEdicao(rascunho: unknown): Promise<Resultado> {
  try {
    const context = await autorizadoAEnviar()
    const para = context.user.email
    if (!para) throw new Error('A sua conta não tem e-mail para receber o teste.')

    const { erros, edicao } = conferirEdicao(rascunho)
    if (erros.length) throw new Error(erros[0])

    const saida = `${urlBase()}/newsletter/sair`
    const modelo = emailDaNewsletter({ titulo: edicao.assunto, ...edicao, urlDeSaida: saida })
    await enviarEmail({
      para,
      assunto: `[Teste] ${modelo.assunto}`,
      html: modelo.html,
      texto: modelo.texto,
      urlDeSaidaEmUmClique: saida,
    })
    return { recado: `Teste enviado para ${para}. Confira como ficou no celular antes de enviar para a lista.` }
  } catch (causa) {
    return { erro: semChave(mensagemDoErro(causa, 'Não foi possível enviar o teste.')) }
  }
}

/**
 * Envia a edição para toda a lista.
 *
 * Grava a edição no mesmo lugar em que o pacote de Publicações grava a dele (um pacote livre com o destino
 * "newsletter"), de propósito: o histórico da Newsletter, o Histórico geral e o calendário já leem dali, e uma edição
 * não pode existir em dois formatos conforme a tela em que nasceu. O pacote nasce como "publicado" ou "falhou" e não
 * passa por Publicações.
 *
 * A edição é gravada ANTES do envio, como "publicando": se a função morrer no meio, sobra o registro de que uma
 * remessa começou, em vez de mensagens na rua sem rastro.
 */
export async function enviarEdicaoDaNewsletter(rascunho: unknown): Promise<Resultado & { enviados?: number }> {
  try {
    const context = await autorizadoAEnviar()
    const workspaceId = context.workspace.id

    const { erros, edicao } = conferirEdicao(rascunho)
    if (erros.length) throw new Error(erros[0])

    const supabase = await createClient()

    // O toque duplo no botão, ou a tela reenviada depois de um tempo esgotado: o mesmo assunto não sai duas vezes
    // seguidas. "falhou" não conta, para dar para tentar de novo depois de corrigir a causa.
    const desde = new Date(Date.now() - MINUTOS_SEM_REPETIR * 60_000).toISOString()
    const { data: recentes } = await supabase
      .from('package_destinations').select('id, extras')
      .eq('workspace_id', workspaceId).eq('canal', 'newsletter')
      .in('estado', ['publicando', 'publicada', 'na_fila']).gte('created_at', desde)
    if ((recentes ?? []).some((d) => (d.extras as Record<string, string> | null)?.assunto === edicao.assunto)) {
      throw new Error(`Uma edição com este mesmo assunto saiu há menos de ${MINUTOS_SEM_REPETIR} minutos. Para não mandar duas vezes à mesma lista, nada foi enviado. Confira em “Edições”.`)
    }

    const corpo = edicao.paragrafos.join('\n\n')
    const { data: pacote, error: erroDoPacote } = await supabase
      .from('social_packages')
      .insert({
        workspace_id: workspaceId,
        titulo_interno: edicao.assunto,
        origem_tipo: 'livre',
        mestre: { titulo: edicao.assunto, subtitulo: edicao.chamada ?? '', corpo, ...(edicao.urlDaMateria ? { linkUrl: edicao.urlDaMateria } : {}) },
        created_by: context.user.id,
      })
      .select('id').single()
    if (erroDoPacote || !pacote) throw new Error('Não foi possível registrar a edição. Nada foi enviado.')

    const { data: destino, error: erroDoDestino } = await supabase
      .from('package_destinations')
      .insert({
        workspace_id: workspaceId,
        package_id: pacote.id,
        canal: 'newsletter',
        formato: 'edicao',
        corpo,
        extras: { assunto: edicao.assunto, chamada: edicao.chamada ?? '', rotuloDoBotao: edicao.rotuloDoBotao ?? '', origem: 'newsletter' },
        // Escrita aqui, e não gerada do texto-mestre: regenerar as variantes do pacote não mexe nela.
        descolada: true,
        estado: 'publicando',
      })
      .select('id').single()
    if (erroDoDestino || !destino) {
      await supabase.from('social_packages').update({ status: 'falhou' }).eq('id', pacote.id).eq('workspace_id', workspaceId)
      throw new Error('Não foi possível registrar a edição. Nada foi enviado.')
    }

    const remessa = await enviarEdicao(workspaceId, edicao)
    const deu = !remessa.erro

    const { error: erroAoFechar } = await supabase.from('package_destinations').update(deu
      ? { estado: 'publicada', erro: null, external_url: `${remessa.enviados} destinatário${remessa.enviados === 1 ? '' : 's'}` }
      : { estado: 'falhou', erro: (remessa.erro ?? '').slice(0, 500) },
    ).eq('id', destino.id).eq('workspace_id', workspaceId)
    await supabase.from('social_packages').update({ status: deu ? 'publicado' : 'falhou' }).eq('id', pacote.id).eq('workspace_id', workspaceId)
    if (erroAoFechar) console.error('[newsletter] a edição saiu, mas o estado não foi gravado:', destino.id, erroAoFechar.message)

    revalidatePath('/newsletter')
    revalidatePath('/redes')
    if (!deu) return { erro: semChave(remessa.erro ?? 'A edição não saiu.') }
    return { recado: `Edição enviada para ${remessa.enviados} pessoa${remessa.enviados === 1 ? '' : 's'}.`, enviados: remessa.enviados }
  } catch (causa) {
    return { erro: semChave(mensagemDoErro(causa, 'Não foi possível enviar a edição.')) }
  }
}
