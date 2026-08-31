'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { normalizarEmail, normalizarNome, novoToken, prazoDeConfirmacao, TEXTO_DO_CONSENTIMENTO } from '@/lib/newsletter/inscricao'
import { urlBase, urlDeConfirmacao, urlDeSaida, urlDeSaidaEmUmClique } from '@/lib/newsletter/contexto'
import { withFtp, baixarTexto, enviarNaRaizDoSite } from '@/lib/publicacao/ftp'
import { ligarFormularioNaHome, MARCA } from '@/lib/site/formulario-newsletter'
import { emailDeConfirmacao } from '@/lib/newsletter/modelo'
import { enviarEmail, emailConfigurado, semChave } from '@/lib/newsletter/resend'

/**
 * As ações da Central de e-mail.
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
  return { workspaceId: context.workspace.id, userId: context.user.id }
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
    const { workspaceId, userId } = await espacoAutorizado()
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
 *  2. O endereço entra como PENDENTE e recebe o convite, como qualquer outro.
 *     Ninguém é inscrito por decisão de terceiro; a confirmação continua sendo
 *     da pessoa. Quem inseriu fica registrado no consentimento.
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

    const token = novoToken()
    const linha = {
      workspace_id: workspaceId,
      email,
      nome,
      estado: 'pendente' as const,
      token_confirmacao: token,
      token_confirmacao_expira_em: prazoDeConfirmacao(),
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
        console.error('[newsletter] convite manual não saiu:', semChave(causa instanceof Error ? causa.message : String(causa)))
        revalidatePath('/newsletter')
        return { recado: `${email} foi acrescentado, mas o convite não saiu. Veja o diagnóstico e reenvie.` }
      }
    }

    revalidatePath('/newsletter')
    return {
      recado: emailConfigurado()
        ? `Convite enviado para ${email}. Ele entra na lista quando confirmar.`
        : `${email} foi acrescentado como pendente. O convite sai quando o envio for configurado.`,
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
    if (context.role !== 'admin') throw new Error('Só um administrador pode alterar a página inicial do site.')

    const rota = `${urlBase()}/api/newsletter/inscrever`

    const resultado = await withFtp(async (client, config) => {
      // Candidatos, do mais provável ao menos. Qual deles é a home quem diz é
      // o conteúdo, não o caminho: uma pasta de notícias também tem index.html.
      const candidatos = ['/index.html', '/public_html/index.html', `${config.baseDir.replace(/\/$/, '')}/../index.html`]

      for (const caminho of candidatos) {
        let html: string
        try { html = await baixarTexto(client, caminho) } catch { continue }
        if (!html.includes('newsletter-section')) continue

        const troca = ligarFormularioNaHome(html, rota)
        if (troca.estado === 'ja-ligado') return { ok: true as const, detalhe: troca.detalhe, gravou: false }
        if (troca.estado === 'recusado') return { ok: false as const, detalhe: troca.detalhe }

        const raiz = caminho.slice(0, caminho.lastIndexOf('/')) || '/'
        await enviarNaRaizDoSite(client, raiz, 'index.html', troca.html)
        return { ok: true as const, detalhe: troca.detalhe, gravou: true, onde: caminho, tamanho: troca.html.length }
      }

      return {
        ok: false as const,
        detalhe: 'Não alcancei a página inicial pelo FTP. A conta está confinada à pasta de notícias — no hPanel da Hostinger, libere a conta para /public_html (ou a raiz do site) e tente de novo.',
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
