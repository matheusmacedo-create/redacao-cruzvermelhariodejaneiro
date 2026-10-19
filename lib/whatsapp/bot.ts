import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import { ORIGEM_DO_SITE } from '@/lib/site/sitemap'
import { agoraEmBrasilia, somarDias } from '@/lib/agenda/datas'
import { claudeConfigurado, reescreverComClaude } from '@/lib/ia/anthropic'
import { type Papel } from '@/lib/permissoes'
import { codigoConfere, registrar, type ConfigDoWhatsapp } from './servidor'
import { entregar } from './fila'
import { ehAdministracao, gerenciaUsuarios, pedirDesativacao, respostaDaAdministracao } from './admin'
import {
  codigosPendentesDoNumero, confirmarNumeroDaEquipe, confirmarNumeroDoVoluntario, contarTentativaErrada, donoDoVoluntario, type CodigoPendente,
} from './confirmacao'
import { SISTEMA_DA_DUVIDA, buscarDuvida, pedidoDaDuvida } from './duvidas'
import {
  avisoCitado, comecarChamado, esperaTextoLivre, guardarPendencia, marcarPergunta, ondeNoPalacio, pendenciaAberta, perguntaVencida, responderAoAviso, responderVisita,
  seguirPendencia, type Pendencia, type Pessoa, type Resposta,
} from './acoes'
import { atendeAlgumaFila, atenderPeloCodigo, respostaDosChamados } from './atendimento'
import { agendaDaPessoa, aprovacoesPendentes, avisosDaPessoa, pessoaDoEspaco } from './consultas'
import { comecarVisita, temPortaria, visitasDeHoje } from './portaria'
import { decidirPeloWhatsapp, listarDecisoes, podeDecidirNoFinanceiro } from './financeiro'
import { comecarPresenca, coordenaAcoes } from './presenca'
import { comecarViagem, frotaAgora, nivelNoPatrimonio } from './frota'
import { saldoNoEstoque } from './estoque'
import { conversaDeProtecao } from './protecao'
import { envioAberto, receberMidia } from './envio'
import { respostaAoVoluntario, voluntarioDoNumero } from './voluntarios'
import { comandoDoVoluntario } from './voluntarios-regras'
import { respostaClaraDaVisita } from '@/lib/portaria/regras'
import { visitaEsperandoResposta } from '@/lib/portaria/servidor'
import {
  APRESENTACAO_A_CADA_HORAS, APROVACOES_NA_RESPOSTA, AVISOS_NA_RESPOSTA, COMANDOS_DE_AREA, JANELA_DAS_RESPOSTAS_MIN, RESPOSTAS_POR_JANELA,
  TEXTO_DO_CODIGO_DE_VOLTA, TEXTO_PAUSADO, TEXTO_VOLTOU, codigoNaMensagem, ehCancelamento, ehConfirmacao, interativoDoMenu, lerEscolha, lerPedido, pareceViagem, soOCodigo,
  textoDaAgenda, textoDaAjuda,
  textoDaApresentacao, textoDaFalhaDoCodigoDeIda, textoDasAprovacoes, textoDasLidas, textoDoCodigoDeIdaErrado, textoDoMenu, textoDoNumeroConfirmado, textoDosAvisos,
  type Interativo, type ItemDoDia, type MensagemRecebida, type QuemNoMenu,
} from './regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O bot do WhatsApp: responde a quem escreve para o número do Palácio.
 *
 * Quem é da equipe e confirmou o número (whatsapp_contas) vê os avisos sem
 * abrir, marca como lidos e pausa ou retoma os avisos por aqui; quem
 * administra o espaço também pede o "status" do canal e faz a fila andar
 * (lib/whatsapp/admin.ts). Quem atende uma fila assume, resolve e transfere
 * chamados (lib/whatsapp/atendimento.ts); quem tem a portaria vê as visitas do
 * dia e registra quem chegou (lib/whatsapp/portaria.ts); quem decide despesas
 * ou compras vê o que espera a decisão dele (lib/whatsapp/financeiro.ts);
 * quem coordena as oportunidades marca a presença da ação de hoje
 * (lib/whatsapp/presenca.ts); quem vê a Frota consulta os veículos e quem a
 * opera registra a saída e o retorno (lib/whatsapp/frota.ts); quem vê o
 * Estoque consulta o saldo de um material (lib/whatsapp/estoque.ts). O
 * que é sensível — decidir, o voto de quem usa a verificação em duas etapas,
 * desativar uma conta — sai daqui como um link de confirmar no Palácio
 * (lib/whatsapp/confirmacoes.ts). Quem não é recebe uma apresentação (no
 * máximo uma por dia) com o caminho dos canais oficiais: este número não é
 * atendimento ao público.
 *
 * Logo depois do código de ida, o "Não fui eu" (lib/whatsapp/protecao.ts): a
 * resposta a um aviso de segurança, e a conferência dela, valem pelo número —
 * até do número antigo da conta — e mesmo com a verificação em duas etapas.
 *
 * Antes de tudo, o código de ida: quem está confirmando o número manda daqui
 * o código que a tela mostrou (lib/whatsapp/confirmacao.ts). Só entra nesse
 * caminho a mensagem com um código quando há código em aberto para o número
 * — e, se o número já é de alguém da equipe, só a mensagem que é o código
 * (regras.ts, soOCodigo), para o chamado com um número de patrimônio não se
 * perder ali; o resto segue como sempre.
 *
 * Dentro da janela de 24 h, o menu sai como lista e as perguntas do bot (a
 * conferência do voto, os passos do chamado) com botões ou lista (regras.ts,
 * Interativo). O toque chega como o comando digitado, citando a mensagem
 * tocada: vale para a pergunta daquela mensagem ou, na lista do menu, como
 * comando — nunca cai na pergunta mais nova nem na visita da portaria.
 *
 * Nunca lança, e nunca responde duas vezes à mesma mensagem (o registro tem
 * trava por id; a Kapso reentrega quando demora). Um robô do outro lado
 * também não vira conversa infinita: há um teto de respostas por número.
 */
export async function atenderMensagem(admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, m: MensagemRecebida): Promise<void> {
  try {
    // Grupo, mensagem do próprio número e endereço sem número: nem registra.
    if (m.ignorar || !m.numero) return
    const numero = m.numero

    const { data: conta } = await admin.from('whatsapp_contas').select('user_id, pausado_em').eq('numero', numero).maybeSingle()

    // O código de ida vem antes de tudo: o número ainda é desconhecido, ou é de quem pediu para confirmar de novo.
    // Número que já é de alguém da equipe só entra aqui com a mensagem que é só o código (ou a mensagem pronta):
    // "chamado: patrimônio 123456 sem toner" segue para o chamado, mesmo com um código em aberto para o número.
    const codigo = m.midia ? null : conta ? soOCodigo(m.texto) : codigoNaMensagem(m.texto)
    const pendentes = codigo ? await codigosPendentesDoNumero(admin, workspaceId, numero) : []
    if (codigo && pendentes.length) {
      const nova = await registrar(admin, { workspaceId, direcao: 'entrada', tipo: 'bot', situacao: 'recebida', numero, userId: null, mensagemId: m.id, comando: 'codigo_de_ida', enviadaEm: m.enviadaEm })
      if (!nova) return
      // A tentativa conta (e o número se confirma) mesmo com o teto de respostas batido: só a resposta fica de fora.
      const resposta = await respostaAoCodigoDeIda(admin, workspaceId, numero, codigo, pendentes, m.nome)
      if (!(await noTetoDeRespostas(admin, workspaceId, numero))) await entregar(admin, workspaceId, { numero, texto: resposta.texto, tipo: 'bot', userId: resposta.userId }, { config })
      return
    }

    // "Não fui eu" citando o aviso de segurança (ou até 24 h depois dele) e a conferência que vem em seguida: pelo número.
    const donoDoNumero = (conta?.user_id as string | undefined) ?? null
    const protecao = m.midia ? null : await conversaDeProtecao(admin, workspaceId, numero, m, donoDoNumero)
    if (protecao) {
      const nova = await registrar(admin, { workspaceId, direcao: 'entrada', tipo: 'bot', situacao: 'recebida', numero, userId: donoDoNumero, mensagemId: m.id, comando: protecao.comando, enviadaEm: m.enviadaEm })
      if (!nova || await noTetoDeRespostas(admin, workspaceId, numero)) return
      const r = await protecao.responder()
      const entrega = await entregar(admin, workspaceId, { numero, texto: r.texto, tipo: 'bot', userId: donoDoNumero, interativo: r.interativo }, { config })
      if (r.pergunta && entrega.situacao === 'enviada') await marcarPergunta(admin, r.pergunta, entrega.id)
      return
    }

    const pessoa = conta ? await pessoaDoEspaco(admin, workspaceId, conta.user_id as string) : null
    const pausado = Boolean(conta?.pausado_em)
    // Quem não é da equipe pode ser voluntário que confirmou o número na Área do Voluntário.
    const achado = pessoa ? null : await voluntarioDoNumero(admin, numero)
    const voluntario = achado?.workspaceId === workspaceId ? achado : null
    // Quem administra o espaço tem também "status" e "fila" (lib/whatsapp/admin.ts); para o resto, são "desconhecido".
    const administra = ehAdministracao(pessoa)
    // "saída…" e "retorno…" só são comando para quem opera a frota: o nível é lido só quando a mensagem parece do diário de bordo.
    const operaFrota = pessoa && !m.midia && pareceViagem(m.texto) ? (await nivelNoPatrimonio(admin, workspaceId, pessoa)) >= 2 : false
    const pedido = pessoa ? lerPedido(m.texto, { pausado, admin: administra, usuarios: gerenciaUsuarios(pessoa), frota: operaFrota }) : null
    const comando = pedido?.comando ?? (voluntario ? `voluntario_${comandoDoVoluntario(m.texto, { pausado: voluntario.pausado })}` : 'apresentacao')

    // Respondeu citando um aviso: a resposta vai para o chamado, o Chat ou a aprovação dele.
    const aviso = pessoa && m.citada ? await avisoCitado(admin, workspaceId, pessoa.id, m.citada) : null
    // Ou respondeu a uma pergunta do bot (a conferência antes de aprovar, os passos do chamado).
    let pendencia: Pendencia | null = null
    let estrita = false
    // Citou uma pergunta que já foi respondida, venceu ou foi trocada: nunca cai na pergunta mais nova
    // (a conferência antiga não pode aprovar outra matéria).
    let vencida = false
    // Tocou num botão ou numa linha de lista: a mensagem tocada vem junto, então o toque nunca cai na pergunta
    // mais nova. Na lista do menu, vale o comando; em outra mensagem que não é a pergunta aberta (a lista de
    // equipes de um chamado que já passou dessa etapa), vale como pergunta vencida — o "2" dela não escolhe o
    // assunto, nem marca os avisos como lidos.
    const tocou = m.toque && Boolean(m.citada)
    if (pessoa && !aviso) {
      if (m.citada) {
        pendencia = await pendenciaAberta(admin, workspaceId, pessoa.id, m.citada)
        estrita = Boolean(pendencia)
        vencida = !pendencia && await perguntaVencida(admin, workspaceId, pessoa.id, m.citada)
        if (tocou && !pendencia && !vencida) vencida = !(await citouOMenu(admin, workspaceId, pessoa.id, m.citada))
      }
      if (!vencida && !tocou) pendencia ??= await pendenciaAberta(admin, workspaceId, pessoa.id, null)
    }
    // Sem citar, a pergunta aberta só leva o que parece resposta a ela; "menu", "avisos" e cia. seguem valendo. Na
    // pergunta de texto livre, o nome de setor que também é comando de área ("Financeiro", "Portaria", "Estoque
    // central") é a resposta: o "Onde é?" do chamado não se perde na lista do Financeiro.
    const paraPendencia = Boolean(pendencia) && (estrita || comando === 'desconhecido' || lerEscolha(m.texto, 99) !== null || ehConfirmacao(m.texto)
      || ehCancelamento(m.texto) || (esperaTextoLivre(pendencia) && (m.texto.trim().split(/\s+/).length >= 3 || Boolean(pedido && COMANDOS_DE_AREA.has(pedido.comando)))))
    // Foto ou vídeo de quem é da equipe (sem citar um aviso): vira envio para a comunicação.
    const midia = Boolean(pessoa && m.midia && !aviso)

    const nova = await registrar(admin, {
      workspaceId, direcao: 'entrada', tipo: 'bot', situacao: 'recebida', numero, userId: pessoa?.id ?? null, mensagemId: m.id,
      comando: midia ? `midia_${m.midia?.categoria}` : aviso ? 'responder_aviso' : vencida ? 'pergunta_vencida' : paraPendencia ? `pendencia_${pendencia?.tipo}` : comando,
      enviadaEm: m.enviadaEm,
    })
    if (!nova) return

    const noTeto = await noTetoDeRespostas(admin, workspaceId, numero)

    // `interativo`: botões ou lista (só dentro da janela; fora, ou na fila, sai o texto). `comando`: a marca no registro da saída.
    // `categoria` e `semFila`: as respostas do assistente (lib/whatsapp/assistente) nunca esperam na fila; o recibo vai
    // como "assistente" (o texto some da fila depois do envio).
    const responder = (texto: string, extra: { interativo?: Interativo | null; comando?: string; categoria?: string; semFila?: boolean } = {}) => {
      const { semFila, ...resto } = extra
      return entregar(admin, workspaceId, { numero, texto, tipo: 'bot', userId: pessoa?.id ?? null, ...resto }, { config, semFila })
    }
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
        // Sem a tabela, ou com o tipo da pergunta ainda fora do CHECK (a migração dele não foi aplicada).
        await responder(r.semPergunta ?? `Isto ainda não está ligado no WhatsApp do Palácio. Faça pelo Palácio: ${base}${ondeNoPalacio(r.pergunta)}`)
        return
      }
      // Os botões da pergunta saem só aqui, com a pendência guardada: o toque cita esta mensagem e acha a pergunta.
      const entrega = await responder(r.texto, { interativo: r.interativo })
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
    // O toque não: o "1" da lista do menu são os avisos (o toque no botão da visita já veio pelo aviso citado).
    if (!m.midia && !tocou && respostaClaraDaVisita(m.texto)) {
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

    if (comando === 'atender_chamado' && pedido) {
      await enviar(await atenderPeloCodigo(admin, workspaceId, pessoa, pedido.resto, base))
      return
    }

    // A portaria é de quem a tela deixa (a equipe da Escola, não): para os outros, "portaria" cai no menu.
    if (comando === 'portaria') {
      const resposta = await visitasDeHoje(admin, workspaceId, pessoa, base)
      if (resposta) {
        await responder(resposta)
        return
      }
    }

    if (comando === 'registrar_visita' && pedido && temPortaria(pessoa)) {
      await enviar(await comecarVisita(admin, workspaceId, pessoa, pedido.resto, base))
      return
    }

    // As decisões do Financeiro e de Compras são de quem a tela deixa decidir: para os outros, as palavras caem no menu.
    if ((comando === 'financeiro' || comando === 'decidir_financeiro') && pedido && await podeDecidirNoFinanceiro(admin, workspaceId, pessoa)) {
      if (comando === 'financeiro') await enviar(await listarDecisoes(admin, workspaceId, pessoa, base))
      // Vale a lista do "financeiro" mais nova (a citada, se aberta, já veio pela pendência acima).
      else await enviar(await decidirPeloWhatsapp(admin, workspaceId, pessoa, await pendenciaAberta(admin, workspaceId, pessoa.id, null, 'financeiro'), pedido.resto, base))
      return
    }

    if (comando === 'desativar_conta' && pedido) {
      const resposta = await pedirDesativacao(admin, workspaceId, pessoa, pedido.resto, base)
      if (resposta) {
        await responder(resposta)
        return
      }
    }

    // As outras áreas, cada uma com a permissão da tela dela: para quem não tem, as palavras caem no menu.
    if (comando === 'presenca') {
      const resposta = await comecarPresenca(admin, workspaceId, pessoa, base)
      if (resposta) {
        await enviar(resposta)
        return
      }
    }

    if (comando === 'frota') {
      const resposta = await frotaAgora(admin, workspaceId, pessoa, base)
      if (resposta) {
        await responder(resposta)
        return
      }
    }

    if ((comando === 'saida_veiculo' || comando === 'retorno_veiculo') && pedido) {
      const resposta = await comecarViagem(admin, workspaceId, pessoa, comando === 'saida_veiculo' ? 'saida' : 'retorno', pedido.resto, base)
      if (resposta) {
        await enviar(resposta)
        return
      }
    }

    if (comando === 'estoque' && pedido) {
      const resposta = await saldoNoEstoque(admin, workspaceId, pessoa, pedido.resto, base)
      if (resposta) {
        await responder(resposta)
        return
      }
    }

    if (comando === 'avisos') {
      const { avisos, total } = await avisosDaPessoa(admin, workspaceId, pessoa.id, { soNaoLidos: true, limite: AVISOS_NA_RESPOSTA })
      await responder(textoDosAvisos({ avisos: avisos.map((a) => ({ titulo: a.titulo, mensagem: a.mensagem, link: a.link })), total, urlBase: base }))
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
      await responder(await respostaDaAgenda(admin, workspaceId, pessoa, base))
      return
    }

    if (comando === 'chamados') {
      await responder(await respostaDosChamados(admin, workspaceId, pessoa, base))
      return
    }

    if (comando === 'aprovacoes') {
      const pendentes = await aprovacoesPendentes(admin, workspaceId, pessoa.id, { limite: APROVACOES_NA_RESPOSTA })
      await responder(pendentes
        ? textoDasAprovacoes({ aprovacoes: pendentes.aprovacoes.map((a) => ({ id: a.id, titulo: a.titulo })), total: pendentes.total, urlBase: base })
        : `Não consegui ler as suas aprovações agora. Veja em ${base}/aprovacoes`)
      return
    }

    if (comando === 'status' || comando === 'fila') {
      const resposta = await respostaDaAdministracao(admin, workspaceId, pessoa, comando, config, base)
      if (resposta) {
        await responder(resposta)
        return
      }
    }

    if (comando === 'ajuda' && pedido) {
      await responder(await responderDuvida(pedido.resto, pessoa.papel, base))
      return
    }

    // O menu sai também como lista, marcado no registro: é por essa marca que o toque nele vale como comando (citouOMenu).
    const quem = await quemNoMenu(admin, workspaceId, pessoa)
    const menu = textoDoMenu({ nome: pessoa.nome, pausado, urlBase: base, naoEntendi: comando === 'desconhecido', ...quem })
    await responder(menu, { interativo: interativoDoMenu({ pausado, ...quem }), comando: 'menu' })
  } catch (causa) {
    console.error('[whatsapp] bot não respondeu:', causa instanceof Error ? causa.message : causa)
  }
}

/**
 * O que muda o menu desta pessoa (QuemNoMenu), cada área com a permissão da tela dela. É o mesmo cálculo do menu do
 * bot e das boas-vindas depois de confirmar o número (app/actions/whatsapp.ts).
 */
export async function quemNoMenu(admin: Admin, workspaceId: string, pessoa: Pessoa): Promise<QuemNoMenu> {
  const [atende, financeiro, presenca, patrimonio] = await Promise.all([
    atendeAlgumaFila(admin, workspaceId, pessoa), podeDecidirNoFinanceiro(admin, workspaceId, pessoa),
    coordenaAcoes(admin, workspaceId, pessoa), nivelNoPatrimonio(admin, workspaceId, pessoa),
  ])
  return {
    admin: ehAdministracao(pessoa), portaria: temPortaria(pessoa), atende, financeiro, presenca,
    frota: patrimonio >= 2 ? 'operar' : patrimonio >= 1 ? 'ver' : null, estoque: patrimonio >= 1,
  }
}

/** A mensagem citada é um menu que o bot mandou a esta pessoa (a saída marcada "menu")? Na dúvida, não. */
async function citouOMenu(admin: Admin, workspaceId: string, userId: string, citada: string): Promise<boolean> {
  const { data } = await admin.from('whatsapp_mensagens').select('id').eq('workspace_id', workspaceId).eq('direcao', 'saida')
    .eq('mensagem_id', citada).eq('user_id', userId).eq('comando', 'menu').limit(1).maybeSingle()
  return Boolean(data)
}

/** O teto de respostas por número na janela: um robô do outro lado não vira enxurrada. */
async function noTetoDeRespostas(admin: Admin, workspaceId: string, numero: string): Promise<boolean> {
  const desde = new Date(Date.now() - JANELA_DAS_RESPOSTAS_MIN * 60_000).toISOString()
  const { count } = await admin.from('whatsapp_mensagens').select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId).eq('direcao', 'saida').eq('tipo', 'bot').eq('numero', numero).gte('criado_em', desde)
  return (count ?? 0) >= RESPOSTAS_POR_JANELA
}

// ------------------------------------------------------------------ código de ida

/**
 * O código de ida chegou do próprio número: confere com cada código em aberto
 * para ele e, conferindo, confirma como o caminho de digitar confirma
 * (lib/whatsapp/confirmacao.ts). O código de volta mandado aqui não confirma
 * nem conta tentativa; qualquer outro conta uma tentativa.
 */
async function respostaAoCodigoDeIda(admin: Admin, workspaceId: string, numero: string, codigo: string, pendentes: CodigoPendente[], nome: string | null): Promise<{ texto: string; userId: string | null }> {
  for (const p of pendentes) {
    if (p.quem === 'equipe') {
      if (!codigoConfere(p.hash, p.userId, numero, codigo, 'ida')) continue
      // Como a tela exige a sessão no espaço: conta desativada ou de fora não confirma.
      const pessoa = await pessoaDoEspaco(admin, workspaceId, p.userId)
      if (!pessoa) return { texto: textoDaFalhaDoCodigoDeIda('falhou', 'equipe'), userId: null }
      // O nome de perfil que veio com o código fica como o nome visto (o assistente para no número se ele mudar).
      const r = await confirmarNumeroDaEquipe(admin, { codigoId: p.id, userId: p.userId, numero, workspaceId, sentido: 'ida', nome })
      return { texto: r.ok ? textoDoNumeroConfirmado('palacio') : textoDaFalhaDoCodigoDeIda(r.motivo, 'equipe'), userId: r.ok ? p.userId : null }
    }
    if (!codigoConfere(p.hash, donoDoVoluntario(p.participanteId), numero, codigo, 'ida')) continue
    const r = await confirmarNumeroDoVoluntario(admin, { participanteId: p.participanteId, numero, codigoHash: p.hash })
    return { texto: r.ok ? textoDoNumeroConfirmado('voluntariado') : textoDaFalhaDoCodigoDeIda(r.motivo, 'voluntario'), userId: null }
  }
  const deVolta = pendentes.some((p) => codigoConfere(p.hash, p.quem === 'equipe' ? p.userId : donoDoVoluntario(p.participanteId), numero, codigo, 'volta'))
  if (deVolta) return { texto: TEXTO_DO_CODIGO_DE_VOLTA, userId: null }
  return { texto: textoDoCodigoDeIdaErrado(await contarTentativaErrada(admin, pendentes)), userId: null }
}

// ------------------------------------------------------------------ consultas
//
// Os dados vêm de lib/whatsapp/consultas.ts (os mesmos que o assistente usa); aqui só a formatação.

/** Hoje e amanhã, com as camadas que a pessoa deixou ligadas na Agenda. */
async function respostaDaAgenda(admin: Admin, workspaceId: string, pessoa: Pessoa, base: string): Promise<string> {
  const hoje = agoraEmBrasilia().dia
  const amanha = somarDias(hoje, 1)
  const { itens, falhou } = await agendaDaPessoa(admin, workspaceId, pessoa, { de: hoje, ate: amanha })
  // Só o que começa no dia: a campanha que dura o mês inteiro não enche a lista de todo dia.
  const doDia = (dia: string): ItemDoDia[] => itens.filter((i) => i.dia === dia).map((i) => ({ titulo: i.titulo, hora: i.hora ?? null, detalhe: i.detalhe ?? null }))
  return textoDaAgenda({ hoje, amanha, itensHoje: doDia(hoje), itensAmanha: doDia(amanha), urlBase: base, falhou })
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
