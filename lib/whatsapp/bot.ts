import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import { ORIGEM_DO_SITE } from '@/lib/site/sitemap'
import { lerCamadas } from '@/lib/agenda/camadas'
import { agoraEmBrasilia, somarDias } from '@/lib/agenda/datas'
import { camadasDisponiveis, itensDaAgenda } from '@/lib/agenda/fontes'
import { ABERTOS, ROTULO_DO_STATUS, ROTULO_DO_STATUS_PARA_EQUIPE, ehStatus } from '@/lib/chamados/regras'
import { claudeConfigurado, reescreverComClaude } from '@/lib/ia/anthropic'
import { ehPapel, type Papel } from '@/lib/permissoes'
import { registrar, type ConfigDoWhatsapp } from './servidor'
import { entregar } from './fila'
import { SISTEMA_DA_DUVIDA, buscarDuvida, pedidoDaDuvida } from './duvidas'
import {
  avisoCitado, comecarChamado, esperaTextoLivre, guardarPendencia, marcarPergunta, pendenciaAberta, perguntaVencida, responderAoAviso, responderVisita, seguirPendencia,
  type Pendencia, type Pessoa, type Resposta,
} from './acoes'
import { envioAberto, receberMidia } from './envio'
import { respostaAoVoluntario, voluntarioDoNumero } from './voluntarios'
import { comandoDoVoluntario } from './voluntarios-regras'
import { respostaClaraDaVisita } from '@/lib/portaria/regras'
import { visitaEsperandoResposta } from '@/lib/portaria/servidor'
import {
  APRESENTACAO_A_CADA_HORAS, APROVACOES_NA_RESPOSTA, AVISOS_NA_RESPOSTA, CHAMADOS_NA_RESPOSTA, JANELA_DAS_RESPOSTAS_MIN, RESPOSTAS_POR_JANELA,
  TEXTO_PAUSADO, TEXTO_VOLTOU, ehCancelamento, ehConfirmacao, lerEscolha, lerPedido, textoDaAgenda, textoDaAjuda, textoDaApresentacao, textoDasAprovacoes, textoDasLidas, textoDoMenu,
  textoDosAvisos, textoDosChamados, type ItemDoDia, type MensagemRecebida,
} from './regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O bot do WhatsApp: responde a quem escreve para o número do Palácio.
 *
 * Quem é da equipe e confirmou o número (whatsapp_contas) vê os avisos sem
 * abrir, marca como lidos e pausa ou retoma os avisos por aqui. Quem não é
 * recebe uma apresentação (no máximo uma por dia) com o caminho dos canais
 * oficiais: este número não é atendimento ao público.
 *
 * Nunca lança, e nunca responde duas vezes à mesma mensagem (o registro tem
 * trava por id; a Evolution reentrega quando demora). Um robô do outro lado
 * também não vira conversa infinita: há um teto de respostas por número.
 */
export async function atenderMensagem(admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, m: MensagemRecebida): Promise<void> {
  try {
    // Grupo, mensagem do próprio número e endereço sem número: nem registra.
    if (m.ignorar || !m.numero) return
    const numero = m.numero

    const { data: conta } = await admin.from('whatsapp_contas').select('user_id, pausado_em').eq('numero', numero).maybeSingle()
    const pessoa = conta ? await pessoaDoEspaco(admin, workspaceId, conta.user_id as string) : null
    const pausado = Boolean(conta?.pausado_em)
    // Quem não é da equipe pode ser voluntário que confirmou o número na Área do Voluntário.
    const achado = pessoa ? null : await voluntarioDoNumero(admin, numero)
    const voluntario = achado?.workspaceId === workspaceId ? achado : null
    const pedido = pessoa ? lerPedido(m.texto, { pausado }) : null
    const comando = pedido?.comando ?? (voluntario ? `voluntario_${comandoDoVoluntario(m.texto, { pausado: voluntario.pausado })}` : 'apresentacao')

    // Respondeu citando um aviso: a resposta vai para o chamado, o Chat ou a aprovação dele.
    const aviso = pessoa && m.citada ? await avisoCitado(admin, workspaceId, pessoa.id, m.citada) : null
    // Ou respondeu a uma pergunta do bot (a conferência antes de aprovar, os passos do chamado).
    let pendencia: Pendencia | null = null
    let estrita = false
    // Citou uma pergunta que já foi respondida, venceu ou foi trocada: nunca cai na pergunta mais nova
    // (a conferência antiga não pode aprovar outra matéria).
    let vencida = false
    if (pessoa && !aviso) {
      if (m.citada) {
        pendencia = await pendenciaAberta(admin, workspaceId, pessoa.id, m.citada)
        estrita = Boolean(pendencia)
        vencida = !pendencia && await perguntaVencida(admin, workspaceId, pessoa.id, m.citada)
      }
      if (!vencida) pendencia ??= await pendenciaAberta(admin, workspaceId, pessoa.id, null)
    }
    // Sem citar, a pergunta aberta só leva o que parece resposta a ela; "menu", "avisos" e cia. seguem valendo.
    const paraPendencia = Boolean(pendencia) && (estrita || comando === 'desconhecido' || lerEscolha(m.texto, 99) !== null || ehConfirmacao(m.texto)
      || ehCancelamento(m.texto) || (esperaTextoLivre(pendencia) && m.texto.trim().split(/\s+/).length >= 3))
    // Foto ou vídeo de quem é da equipe (sem citar um aviso): vira envio para a comunicação.
    const midia = Boolean(pessoa && m.midia && !aviso)

    const nova = await registrar(admin, {
      workspaceId, direcao: 'entrada', tipo: 'bot', situacao: 'recebida', numero, userId: pessoa?.id ?? null, mensagemId: m.id,
      comando: midia ? `midia_${m.midia?.categoria}` : aviso ? 'responder_aviso' : vencida ? 'pergunta_vencida' : paraPendencia ? `pendencia_${pendencia?.tipo}` : comando,
    })
    if (!nova) return

    const desde = new Date(Date.now() - JANELA_DAS_RESPOSTAS_MIN * 60_000).toISOString()
    const { count: respostas } = await admin.from('whatsapp_mensagens').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('direcao', 'saida').eq('tipo', 'bot').eq('numero', numero).gte('criado_em', desde)
    const noTeto = (respostas ?? 0) >= RESPOSTAS_POR_JANELA

    const responder = (texto: string) => entregar(admin, workspaceId, { numero, texto, tipo: 'bot', userId: pessoa?.id ?? null }, { config })
    const base = urlBase()

    // A mídia é guardada mesmo com o teto de respostas batido: só a resposta fica de fora.
    if (midia && pessoa) {
      const resposta = await receberMidia(admin, workspaceId, pessoa, m, config, base)
      if (resposta && !noTeto) await responder(resposta.texto)
      return
    }
    if (noTeto) return

    if (voluntario) {
      await responder((await respostaAoVoluntario(admin, voluntario, m.texto, base)).resposta)
      return
    }

    if (!pessoa) {
      const umDia = new Date(Date.now() - APRESENTACAO_A_CADA_HORAS * 3_600_000).toISOString()
      const { count } = await admin.from('whatsapp_mensagens').select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).eq('direcao', 'saida').eq('tipo', 'bot').eq('numero', numero).gte('criado_em', umDia)
      if ((count ?? 0) > 0) return
      await responder(textoDaApresentacao({ urlBase: base, site: ORIGEM_DO_SITE }))
      return
    }

    // A pergunta fica guardada antes de sair: a resposta que cita ela acha o caminho de volta.
    const enviar = async (r: Resposta) => {
      if (!r.pergunta) {
        await responder(r.texto)
        return
      }
      const id = await guardarPendencia(admin, workspaceId, pessoa.id, r.pergunta)
      if (!id) {
        const onde = r.pergunta.tipo === 'aprovar' ? `/aprovacoes/${String(r.pergunta.dados.approvalId ?? '')}` : '/chamados/novo'
        await responder(`Isto ainda não está ligado no WhatsApp do Palácio. Faça pelo Palácio: ${base}${onde}`)
        return
      }
      const entrega = await responder(r.texto)
      if (entrega.situacao === 'enviada') await marcarPergunta(admin, id, entrega.id)
    }

    if (aviso) {
      // Anexo respondendo um aviso: o arquivo não entra no chamado nem na conversa por aqui (só o texto entraria, sem ele).
      if (m.midia) {
        await responder(`Arquivo respondendo um aviso ainda não entra por aqui. Anexe pelo Palácio: ${base}${aviso.link ?? '/notificacoes'}`)
        return
      }
      await enviar(await responderAoAviso(admin, workspaceId, pessoa, aviso.link, m.texto, base))
      return
    }

    if (vencida && !m.midia) {
      await responder('Esta pergunta não vale mais: já foi respondida, venceu ou foi trocada por outra. Se precisar, comece de novo.')
      return
    }

    if (pendencia && paraPendencia) {
      const resposta = await seguirPendencia(admin, workspaceId, pessoa, pendencia, m.texto, base, estrita)
      if (resposta) {
        await enviar(resposta)
        return
      }
      // A pergunta mais nova não serviu, mas pode haver um envio de fotos aberto esperando o "pronto" ou o título.
      if (pendencia.tipo !== 'envio' && !estrita) {
        const envio = await envioAberto(admin, pessoa.id)
        const doEnvio = envio ? await seguirPendencia(admin, workspaceId, pessoa, envio, m.texto, base, false) : null
        if (doEnvio) {
          await enviar(doEnvio)
          return
        }
      }
    }

    // Respondeu à portaria sem citar o aviso ("1", "pode subir"): vale para a única visita de agora que espera esta pessoa.
    if (!m.midia && respostaClaraDaVisita(m.texto)) {
      const visita = await visitaEsperandoResposta(admin, workspaceId, pessoa.id)
      if (visita) {
        await enviar(await responderVisita(admin, workspaceId, pessoa, visita.id, m.texto, base))
        return
      }
    }

    if (comando === 'abrir_chamado' && pedido) {
      await enviar(await comecarChamado(admin, workspaceId, pessoa, pedido.resto, base))
      return
    }

    if (comando === 'avisos') {
      const [{ data: avisos }, { count: total }] = await Promise.all([
        admin.from('notifications').select('title, message, link').eq('user_id', pessoa.id).eq('workspace_id', workspaceId).is('read_at', null)
          .order('created_at', { ascending: false }).limit(AVISOS_NA_RESPOSTA),
        admin.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', pessoa.id).eq('workspace_id', workspaceId).is('read_at', null),
      ])
      await responder(textoDosAvisos({
        avisos: (avisos ?? []).map((a) => ({ titulo: a.title as string, mensagem: (a.message as string) ?? '', link: (a.link as string | null) ?? null })),
        total: total ?? 0, urlBase: base,
      }))
      return
    }

    if (comando === 'lidas') {
      const { data: lidas } = await admin.from('notifications').update({ read_at: new Date().toISOString() })
        .eq('user_id', pessoa.id).eq('workspace_id', workspaceId).is('read_at', null).select('id')
      await responder(textoDasLidas(lidas?.length ?? 0))
      return
    }

    if (comando === 'parar' || comando === 'voltar') {
      const agora = new Date().toISOString()
      const { error } = await admin.from('whatsapp_contas')
        .update({ pausado_em: comando === 'parar' ? agora : null, atualizado_em: agora })
        .eq('user_id', pessoa.id)
      // Quem é da equipe e também voluntário com o mesmo número: o "sair" do anúncio vale para os dois.
      await admin.from('participantes_whatsapp').update({ pausado_em: comando === 'parar' ? agora : null, atualizado_em: agora }).eq('numero', numero)
      await responder(error ? 'Não consegui mudar agora. Tente de novo daqui a pouco ou mude em Meu perfil.' : comando === 'parar' ? TEXTO_PAUSADO : TEXTO_VOLTOU)
      return
    }

    if (comando === 'agenda') {
      await responder(await agendaDaPessoa(admin, workspaceId, pessoa, base))
      return
    }

    if (comando === 'chamados') {
      await responder(await chamadosDaPessoa(admin, workspaceId, pessoa.id, base))
      return
    }

    if (comando === 'aprovacoes') {
      await responder(await aprovacoesDaPessoa(admin, workspaceId, pessoa.id, base))
      return
    }

    if (comando === 'ajuda' && pedido) {
      await responder(await responderDuvida(pedido.resto, pessoa.papel, base))
      return
    }

    const menu = textoDoMenu({ nome: pessoa.nome, pausado, urlBase: base })
    await responder(comando === 'desconhecido' ? `_Não entendi. Este número responde só às opções abaixo; mensagens soltas não chegam a ninguém._\n\n${menu}` : menu)
  } catch (causa) {
    console.error('[whatsapp] bot não respondeu:', causa instanceof Error ? causa.message : causa)
  }
}

/** A pessoa ativa, membro deste espaço; null para o resto (conta desativada vira "número desconhecido"). */
async function pessoaDoEspaco(admin: Admin, workspaceId: string, userId: string): Promise<Pessoa | null> {
  const { data } = await admin.from('workspace_members').select('user_id, role, profiles(full_name, active)').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle()
  const perfil = (Array.isArray(data?.profiles) ? data?.profiles[0] : data?.profiles) as { full_name?: string | null; active?: boolean } | null | undefined
  if (!data || !perfil || perfil.active === false || !ehPapel(data.role)) return null
  return { id: userId, nome: perfil.full_name ?? null, papel: data.role }
}

// ------------------------------------------------------------------ consultas
//
// O cliente é o de serviço (não há sessão no WhatsApp), então cada consulta
// filtra pela pessoa e pelo espaço, e a agenda passa pelo mesmo crivo de
// acesso do resumo semanal por e-mail (camadasDisponiveis com semSessao).

/** Hoje e amanhã, com as camadas que a pessoa deixou ligadas na Agenda. */
async function agendaDaPessoa(admin: Admin, workspaceId: string, pessoa: Pessoa, base: string): Promise<string> {
  const hoje = agoraEmBrasilia().dia
  const amanha = somarDias(hoje, 1)
  const [disponiveis, { data: preferencias }] = await Promise.all([
    camadasDisponiveis(admin, workspaceId, pessoa.id, pessoa.papel, { semSessao: true }),
    admin.from('agenda_preferencias').select('camadas_ocultas').eq('workspace_id', workspaceId).eq('user_id', pessoa.id).maybeSingle(),
  ])
  const ocultas = lerCamadas(preferencias?.camadas_ocultas)
  const { itens, falhas } = await itensDaAgenda(admin, workspaceId, pessoa.id, { de: hoje, ate: amanha }, [...disponiveis].filter((c) => !ocultas.includes(c)))
  // Só o que começa no dia: a campanha que dura o mês inteiro não enche a lista de todo dia.
  const doDia = (dia: string): ItemDoDia[] => itens.filter((i) => i.dia === dia).map((i) => ({ titulo: i.titulo, hora: i.hora ?? null, detalhe: i.detalhe ?? null }))
  return textoDaAgenda({ hoje, amanha, itensHoje: doDia(hoje), itensAmanha: doDia(amanha), urlBase: base, falhou: falhas.length > 0 })
}

/** Os chamados abertos que a pessoa abriu ou que estão com ela. */
async function chamadosDaPessoa(admin: Admin, workspaceId: string, userId: string, base: string): Promise<string> {
  const deQuem = `solicitante_id.eq.${userId},responsavel_id.eq.${userId}`
  const [{ data, error }, { count }] = await Promise.all([
    admin.from('chamados').select('id, codigo, titulo, status, solicitante_id').eq('workspace_id', workspaceId).or(deQuem).in('status', [...ABERTOS])
      .order('atualizado_em', { ascending: false }).limit(CHAMADOS_NA_RESPOSTA),
    admin.from('chamados').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).or(deQuem).in('status', [...ABERTOS]),
  ])
  if (error) return `Não consegui ler os seus chamados agora. Veja em ${base}/chamados`
  return textoDosChamados({
    chamados: (data ?? []).map((c) => {
      const status = ehStatus(c.status) ? c.status : 'novo'
      const deOutro = c.solicitante_id !== userId
      return {
        id: c.id as string, codigo: (c.codigo as string) || 'Chamado', titulo: (c.titulo as string) ?? '',
        situacao: deOutro ? `${ROTULO_DO_STATUS_PARA_EQUIPE[status]} · com você` : ROTULO_DO_STATUS[status],
      }
    }),
    total: count ?? data?.length ?? 0, urlBase: base,
  })
}

/** As rodadas de aprovação em aberto em que o voto da pessoa ainda falta. */
async function aprovacoesDaPessoa(admin: Admin, workspaceId: string, userId: string, base: string): Promise<string> {
  const { data: votos, error } = await admin.from('approval_voters').select('approval_id').eq('workspace_id', workspaceId).eq('user_id', userId).eq('decision', 'pending').limit(200)
  if (error) return `Não consegui ler as suas aprovações agora. Veja em ${base}/aprovacoes`
  const ids = [...new Set((votos ?? []).map((v) => v.approval_id as string))]
  if (!ids.length) return textoDasAprovacoes({ aprovacoes: [], total: 0, urlBase: base })
  const { data: abertas } = await admin.from('approvals').select('id, content_id').eq('workspace_id', workspaceId).eq('status', 'pending').in('id', ids)
    .order('created_at', { ascending: false })
  const lista = abertas ?? []
  const mostrar = lista.slice(0, APROVACOES_NA_RESPOSTA)
  const pecas = [...new Set(mostrar.map((a) => a.content_id as string))]
  const { data: titulos } = pecas.length ? await admin.from('content_pieces').select('id, title').in('id', pecas) : { data: [] }
  const tituloDe = new Map((titulos ?? []).map((t) => [t.id as string, (t.title as string | null)?.trim() || 'Matéria sem título']))
  return textoDasAprovacoes({
    aprovacoes: mostrar.map((a) => ({ id: a.id as string, titulo: tituloDe.get(a.content_id as string) ?? 'Matéria sem título' })),
    total: lista.length, urlBase: base,
  })
}

/**
 * A dúvida respondida com a Central de ajuda. O Claude só resume os trechos
 * achados (esforço baixo, resposta curta); sem chave, fora do ar ou demorando,
 * vão os trechos como estão. A busca olha só as áreas que a pessoa abre.
 */
async function responderDuvida(pergunta: string, papel: Papel, base: string): Promise<string> {
  const achados = buscarDuvida(pergunta, papel)
  let resposta: string | null = null
  if (achados.length && claudeConfigurado()) {
    try {
      const { texto } = await reescreverComClaude({
        system: SISTEMA_DA_DUVIDA, texto: pedidoDaDuvida(pergunta, achados), effort: 'low', maxTokens: 2_000, timeoutMs: 30_000,
      })
      resposta = texto
    } catch (causa) {
      console.error('[whatsapp] dúvida sem resumo do Claude:', causa instanceof Error ? causa.message : causa)
    }
  }
  return textoDaAjuda({ pergunta, achados, resposta, urlBase: base })
}
