'use server'

import { requireWorkspace } from '@/lib/session'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { obterPerfil, perfilPadrao, redesConectadas, semSegredo } from '@/lib/publicacao/upload-post'
import {
  filaDeAtendimento, responderComentario, responderDm, esconderComentario,
  REDES_COM_COMENTARIO, REDES_COM_DM, FORA_DO_ALCANCE, nomeDoCanal,
} from '@/lib/atendimento/conector'
import type { Mensagem } from '@/lib/atendimento/normalizar'

/**
 * As ações do atendimento.
 *
 * A leitura acontece por ação, e não no carregamento da página, porque são
 * várias chamadas ao conector: uma para o histórico e uma por publicação. Se
 * isso pendurasse o render, a Caixa de entrada abriria na velocidade da rede
 * mais lenta — e quem só quer ver os rascunhos esperaria por nada.
 */

export type Fila = {
  mensagens?: Mensagem[]
  avisos?: string[]
  /** Redes conectadas cujo atendimento NÃO passa por aqui, com o motivo. */
  foraDoAlcance?: { canal: string; motivo: string }[]
  erro?: string
}

export async function carregarFila(): Promise<Fila> {
  try {
    await requireWorkspace()

    // UMA leitura do perfil serve às duas perguntas: quem somos no Instagram
    // (para distinguir a nossa resposta da mensagem de quem escreveu) e quais
    // redes conectadas ficam fora do alcance. Eram duas chamadas idênticas ao
    // conector a cada abertura da fila. Falha aqui não derruba nada: a fila
    // funciona sem perfil, só com menos contexto.
    let perfil: Awaited<ReturnType<typeof obterPerfil>>['dados']['profile'] | undefined
    try { perfil = (await obterPerfil(perfilPadrao())).dados.profile } catch { perfil = undefined }

    const conta = perfil?.social_accounts?.instagram
    const nossoUsuario = typeof conta === 'string' ? conta || undefined : conta?.username || undefined
    const { mensagens, avisos } = await filaDeAtendimento({ nossoUsuario })

    // O que está conectado mas não é atendido aqui. Dizer isso é o que impede
    // alguém de concluir que "não tem pergunta nenhuma" quando na verdade há
    // perguntas numa rede que este painel não alcança.
    const foraDoAlcance = (perfil ? redesConectadas(perfil) : [])
      .filter((canal) => !REDES_COM_COMENTARIO.includes(canal as never) && !REDES_COM_DM.includes(canal as never))
      .map((canal) => ({ canal, motivo: FORA_DO_ALCANCE[canal] ?? 'Este conector não lê respostas desta rede.' }))

    return { mensagens, avisos, foraDoAlcance }
  } catch (causa) {
    return { erro: semSegredo(mensagemDoErro(causa, 'Não foi possível carregar o atendimento.')) }
  }
}

export type Resultado = { erro?: string; recado?: string }

/**
 * Responde — comentário ou mensagem direta, conforme a origem.
 *
 * A validação do que dá para responder é refeita AQUI, e não só na tela: o
 * cliente diz o que quer, o servidor decide o que pode. Uma janela de 24h que
 * fechou entre o carregamento da tela e o clique só é percebida deste lado.
 */
export async function responder(formData: FormData): Promise<Resultado> {
  try {
    await requireWorkspace()

    const origem = String(formData.get('origem') ?? '')
    const canal = String(formData.get('canal') ?? '')
    const texto = String(formData.get('texto') ?? '').trim()

    if (!texto) throw new Error('Escreva a resposta antes de enviar.')
    if (texto.length > 2_000) throw new Error('A resposta passou de 2.000 caracteres.')

    if (origem === 'dm') {
      const destinatarioId = String(formData.get('destinatarioId') ?? '')
      if (!destinatarioId) throw new Error('Não sei para quem enviar esta resposta.')
      await responderDm({ destinatarioId, mensagem: texto })
      return { recado: 'Mensagem enviada.' }
    }

    const comentarioId = String(formData.get('comentarioId') ?? '')
    const postId = String(formData.get('postId') ?? '')
    if (!comentarioId && !postId) throw new Error('Não sei onde publicar esta resposta.')
    if (canal === 'instagram' && !comentarioId) {
      throw new Error('No Instagram só é possível responder a um comentário existente, e o identificador dele não veio.')
    }

    await responderComentario({ canal, comentarioId: comentarioId || undefined, postId: postId || undefined, mensagem: texto })
    return { recado: `Resposta publicada no ${nomeDoCanal(canal)}.` }
  } catch (causa) {
    return { erro: semSegredo(mensagemDoErro(causa, 'Não foi possível enviar a resposta.')) }
  }
}

/**
 * Esconde (ou mostra de novo) um comentário.
 *
 * Esconder, e não apagar: uma instituição humanitária recebe ataque e
 * desinformação junto com as perguntas, e a decisão de sumir com a fala de
 * alguém precisa ser reversível. Apagar não é.
 */
export async function esconder(formData: FormData): Promise<Resultado> {
  try {
    await requireWorkspace()
    const canal = String(formData.get('canal') ?? '')
    const comentarioId = String(formData.get('comentarioId') ?? '')
    const mostrar = formData.get('mostrar') === '1'
    if (!comentarioId) throw new Error('Comentário não identificado.')

    await esconderComentario({ canal, comentarioId, esconder: !mostrar })
    return { recado: mostrar ? 'Comentário visível de novo.' : 'Comentário escondido para o público.' }
  } catch (causa) {
    return { erro: semSegredo(mensagemDoErro(causa, 'Não foi possível mudar a visibilidade do comentário.')) }
  }
}
