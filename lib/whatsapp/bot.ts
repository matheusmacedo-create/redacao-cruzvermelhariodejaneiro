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
  avisoCitado, comecarChamado, esperaTextoLivre, guardarPendencia, marcarPergunta, ondeNoPalacio, pendenciaAberta, perguntaVencida, responderAoAviso, responderPelaFicha,
  responderVisita, seguirPendencia, type Pendencia, type Pessoa, type Resposta,
} from './acoes'
import { atendeAlgumaFila, atenderPeloCodigo, respostaDosChamados } from './atendimento'
import { agendaDaPessoa, aprovacoesPendentes, avisosDaPessoa, pessoaDoEspaco } from './consultas'
import { comecarVisita, receberFotoDaVisita, temPortaria, visitasDeHoje } from './portaria'
import { comecarCadastro } from './colaborador'
import { atorDeAprovacao, conversarNoAutocadastro, decidirAutocadastro, ehDoAutocadastro, acompanhamentoDoCadastro, criarCaixasDosSetoresPeloBotao, criarCaixaDoSetorPeloComando, linkDoTime, pendentesDeAprovacao, previaDasCaixas, situacaoDosGrupos, type Saida } from './autocadastro'
import { ehPedidoDeAcompanhamento, ehPedidoDeCaixas, lerAutocadastro, lerBotaoDeAprovacao, lerBotaoDeCaixas, lerCaixaDoSetor } from './autocadastro-regras'
import { destinoDaImagem, lerBotaoDaFicha, lerLegendaDeVisita, perguntaSemFila, type DadosDaVisita } from './portaria-regras'
import { decidirPeloWhatsapp, listarDecisoes, podeDecidirNoFinanceiro } from './financeiro'
import { comecarPresenca, coordenaAcoes } from './presenca'
import { comecarViagem, frotaAgora, nivelNoPatrimonio } from './frota'
import { saldoNoEstoque } from './estoque'
import { conversaDeProtecao } from './protecao'
import { envioAberto, receberMidia } from './envio'
import { destinoDoDocumento, receberDocumento } from './drive'
import { lerPastaDaResposta } from './drive-regras'
import { respostaAoVoluntario, voluntarioDoNumero } from './voluntarios'
import { comandoDoVoluntario } from './voluntarios-regras'
import { respostaClaraDaVisita } from '@/lib/portaria/regras'
import { visitaEsperandoResposta } from '@/lib/portaria/servidor'
import {
  APRESENTACAO_A_CADA_HORAS, APROVACOES_NA_RESPOSTA, AVISOS_NA_RESPOSTA, COMANDOS_DE_AREA, JANELA_DAS_RESPOSTAS_MIN, RESPOSTAS_POR_JANELA,
  TEXTO_DO_CODIGO_DE_VOLTA, TEXTO_PAUSADO, TEXTO_VOLTOU, alvoDoLink, codigoNaMensagem, ehCancelamento, ehConfirmacao, interativoDoMenu, lerEscolha, lerPedido, ofereceNaoFuiEu,
  normalizar, pareceViagem, soOCodigo,
  textoDaAgenda, textoDaAjuda,
  textoDaApresentacao, textoDaFalhaDoCodigoDeIda, textoDasAprovacoes, textoDasLidas, textoDoCodigoDeIdaErrado, textoDoMenu, textoDoNumeroConfirmado, textoDosAvisos,
  type Interativo, type ItemDoDia, type MensagemRecebida, type QuemNoMenu,
} from './regras'
import { responderComAssistente } from './assistente'
import { ASSISTENTE_INDISPONIVEL, disponibilidadeDoAssistente } from './assistente/uso'
import { cancelarPlano, confirmarPlano, guardarPlanoDoChat, planoAberto, type AbertoDaPessoa } from './assistente/plano'
import { esperarAVez, esquecer, lembrarLista, soltarVez } from './assistente/memoria'
import { LIMITES, TEXTOS_FIXOS, TEXTO_DA_ROTA, comandoDaRota, lerRespostaAoPlano, rotaDaMensagem, textoDoEcoDoAudio, type AvisoCitado, type Rota } from './assistente/regras'
import type { TipoDeItem } from './assistente/marcadores'
import { responderEmAudio } from '@/lib/voz/whatsapp'

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
 * desativar uma conta, cadastrar um colaborador (as etapas em
 * lib/whatsapp/colaborador.ts) — sai daqui como um link de confirmar no
 * Palácio (lib/whatsapp/confirmacoes.ts). Quem não é recebe uma apresentação (no
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
 * Com o assistente ligado para a pessoa (lib/whatsapp/assistente: whatsapp_ia_config, sem deploy), o que o bot
 * não entende vai para ele — o Claude, que lê o Palácio com as permissões da pessoa, responde do jeito dela e, com a
 * escrita ligada, prepara um plano exato —, e os comandos que escrevem passam a valer só pela frase exata ("cancelar
 * o chamado" não pausa os avisos). Antes de tudo isso, a resposta à pergunta ou ao plano do assistente é lida pelo
 * código (lerRespostaAoPlano): só "confirmo" escrito depois de o plano chegar (ou citando o plano) faz o plano, com a
 * vez da pessoa; "cancelar", "sim", "valeu" e "esquece" saem sem modelo. A resposta citando o aviso de um canal do
 * Chat, sem cara de pedido ao assistente, vira um plano de um passo. O plano sai com os botões Confirmar e Cancelar
 * (o toque traz o id e o hash do plano); o sensível — a decisão de despesa ou compra, ou o passo de quem usa a
 * verificação em duas etapas — ganha, no "confirmo", o link de confirmar no Palácio; o recibo do plano confirmado por
 * aqui oferece o "Não fui eu". O áudio com a transcrição da Kapso vai ao assistente (com o eco do que foi entendido)
 * e nunca escreve sem um plano confirmado por escrito ou pelo botão. Sem a configuração, nada disso existe: o bot é
 * exatamente o de antes (o áudio inclusive).
 *
 * Com o Google Drive conectado (lib/whatsapp/drive.ts), o documento de quem é da equipe vai para o Drive: a legenda
 * "guardar em Financeiro/2026" guarda na hora (com o link na resposta); sem ela, o bot pergunta a pasta; e a legenda
 * com outras palavras vai ao assistente (que prepara o plano de guardar). Sem o Drive, o documento solto recebe a
 * resposta de sempre.
 *
 * A foto do visitante vem antes disso tudo (lib/whatsapp/portaria.ts): com o registro da visita aberto, a imagem é a
 * foto dele (mesmo com um envio de fotos aberto); a imagem com a legenda "visitante: Nome" de quem tem a portaria abre
 * o registro com ela. Só o id da mídia fica na pergunta; o arquivo vem depois do "confirmo".
 *
 * O toque num botão da ficha da visita (lib/portaria/servidor.ts, avisarVisitado) também vem antes: o id traz a
 * resposta e a visita, e vale só para quem é visitado nela (acoes.ts, responderPelaFicha) — sem passar pelo aviso
 * citado, pela pergunta aberta nem pelo assistente.
 *
 * Nunca lança, e nunca responde duas vezes à mesma mensagem (o registro tem
 * trava por id; a Kapso reentrega quando demora). Um robô do outro lado
 * também não vira conversa infinita: há um teto de respostas por número.
 * `prazoDoLote`: até quando a rota do webhook pode esperar (o assistente termina antes).
 */
export async function atenderMensagem(admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, m: MensagemRecebida, opcoes: { prazoDoLote?: number } = {}): Promise<void> {
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

    // O autocadastro de colaborador (lib/whatsapp/autocadastro.ts): quem ainda não tem conta se cadastra pela conversa
    // (só texto e a foto do rosto); quem decide — um administrador ou o coordenador do setor, este pelo número — usa os
    // botões, "cadastros" e (coordenador) "link do time". Vem antes do resto: o número ainda é desconhecido, e o toque
    // nos botões traz o id do pedido.
    const textoLivre = !m.midia && !m.toque ? normalizar(m.texto) : ''
    const botaoCadastro = m.toque && !m.midia ? lerBotaoDeAprovacao(m.texto) : null
    const pedeCadastros = textoLivre === 'cadastros'
    const pedeLinkDoTime = ['link do time', 'meu time', 'link do meu time'].includes(textoLivre)
    const pedeGrupos = textoLivre === 'grupos'
    const pedeCaixas = ehPedidoDeCaixas(textoLivre)
    const pedeAcompanhamento = ehPedidoDeAcompanhamento(textoLivre)
    const botaoCaixas = m.toque && !m.midia ? lerBotaoDeCaixas(m.texto) : null
    const pedidoDaCaixa = textoLivre ? lerCaixaDoSetor(m.texto) : null
    const doAutocadastro = !pessoa && !botaoCadastro && await ehDoAutocadastro(admin, workspaceId, m)
    const ator = !doAutocadastro && (botaoCadastro || pedeCadastros || pedeLinkDoTime || pedeGrupos || pedeCaixas || pedeAcompanhamento || botaoCaixas || pedidoDaCaixa) ? await atorDeAprovacao(admin, workspaceId, numero, pessoa) : null
    if (doAutocadastro || ator) {
      const nova = await registrar(admin, { workspaceId, direcao: 'entrada', tipo: 'bot', situacao: 'recebida', numero, userId: pessoa?.id ?? null, mensagemId: m.id, comando: 'autocadastro', enviadaEm: m.enviadaEm })
      if (!nova) return
      // A conversa aberta não tem o teto de respostas (são ~15 trocas, uma por mensagem da pessoa); a abertura, sim.
      const aberta = doAutocadastro && !m.midia && lerAutocadastro(m.texto) ? false : doAutocadastro
      if (!aberta && !botaoCadastro && !botaoCaixas && await noTetoDeRespostas(admin, workspaceId, numero)) return
      let saidas: Saida[] = []
      if (doAutocadastro) saidas = await conversarNoAutocadastro(admin, workspaceId, config, m)
      else if (ator && botaoCadastro) saidas = await decidirAutocadastro(admin, workspaceId, config, ator, botaoCadastro)
      else if (ator && pedeGrupos) saidas = await situacaoDosGrupos(admin, workspaceId, ator)
      else if (ator && pedeAcompanhamento) saidas = await acompanhamentoDoCadastro(admin, workspaceId, ator)
      else if (ator && pedeCaixas) saidas = await previaDasCaixas(admin, workspaceId, ator)
      else if (ator && botaoCaixas) saidas = await criarCaixasDosSetoresPeloBotao(admin, workspaceId, config, ator, botaoCaixas, { prazoDoLote: opcoes.prazoDoLote })
      else if (ator && pedidoDaCaixa) saidas = await criarCaixaDoSetorPeloComando(admin, workspaceId, config, ator, pedidoDaCaixa)
      else if (ator && pedeLinkDoTime) saidas = await linkDoTime(admin, workspaceId, config, ator)
      else if (ator) saidas = await pendentesDeAprovacao(admin, workspaceId, ator)
      for (const s of saidas) await entregar(admin, workspaceId, { numero, texto: s.texto, tipo: 'bot', userId: pessoa?.id ?? null, interativo: s.interativo }, { config, semFila: true })
      return
    }
    // O áudio com a transcrição da Kapso só interessa ao assistente (o bot de comandos não ouve).
    const transcricao = pessoa && m.midia?.categoria === 'audio' && m.transcricao ? m.transcricao : null
    // O documento com legenda pode ir ao assistente (a pasta do Drive dita com outras palavras: lib/whatsapp/drive.ts).
    const legendaDeDocumento = Boolean(pessoa && m.midia?.categoria === 'documento' && m.texto.trim())
    // O assistente atende esta pessoa agora? Sem a configuração (ou sem a tabela), não: o bot de sempre.
    const ia = pessoa && (!m.midia || transcricao || legendaDeDocumento) ? await disponibilidadeDoAssistente(admin, workspaceId, pessoa, { numero, nome: m.nome }) : ASSISTENTE_INDISPONIVEL
    // Com o assistente (e sem envio de fotos aberto: com ele, o áudio é parte do envio, como sempre), o áudio segue como
    // a transcrição — e áudio nunca escreve sem plano: nada de comando fixo, de pergunta do bot, de resposta direta a
    // aviso ou à portaria; só o assistente (que lê ou prepara um plano) e os textos fixos do plano (o "confirmo" falado
    // não confirma). O eco do que foi entendido vai na frente da resposta.
    const doAudio = Boolean(transcricao && pessoa && ia.disponivel && !(await envioAberto(admin, pessoa.id)))
    if (doAudio && transcricao) m = { ...m, texto: transcricao, midia: null }
    const ecoDoAudio = doAudio ? textoDoEcoDoAudio(m.texto) : null
    const pausado = Boolean(conta?.pausado_em)
    // Quem não é da equipe pode ser voluntário que confirmou o número na Área do Voluntário.
    const achado = pessoa ? null : await voluntarioDoNumero(admin, numero)
    const voluntario = achado?.workspaceId === workspaceId ? achado : null
    // Quem administra o espaço tem também "status" e "fila" (lib/whatsapp/admin.ts); para o resto, são "desconhecido".
    const administra = ehAdministracao(pessoa)
    // "saída…" e "retorno…" só são comando para quem opera a frota: o nível é lido só quando a mensagem parece do diário de bordo.
    const operaFrota = pessoa && !m.midia && pareceViagem(m.texto) ? (await nivelNoPatrimonio(admin, workspaceId, pessoa)) >= 2 : false
    const pedido = !pessoa ? null : doAudio ? { comando: 'desconhecido' as const, resto: m.texto }
      : lerPedido(m.texto, { pausado, admin: administra, usuarios: gerenciaUsuarios(pessoa), frota: operaFrota, assistente: ia.disponivel })
    const comando = pedido?.comando ?? (voluntario ? `voluntario_${comandoDoVoluntario(m.texto, { pausado: voluntario.pausado })}` : 'apresentacao')
    // Com o assistente, "aprova a 2" só é a decisão do Financeiro com a lista do "financeiro" aberta, de quem decide
    // (lida uma vez aqui; undefined = não precisou ler): sem ela, o "2" é o da última lista da memória curta ("avisos",
    // "aprovacoes"), e a mensagem vai ao assistente (assistente/regras.ts, comandoDaRota).
    const listaDoFinanceiro = pessoa && ia.disponivel && pedido?.comando === 'decidir_financeiro'
      ? (await podeDecidirNoFinanceiro(admin, workspaceId, pessoa) ? await pendenciaAberta(admin, workspaceId, pessoa.id, null, 'financeiro') : null)
      : undefined
    const decisaoSemLista = listaDoFinanceiro === null

    // Tocou num botão da ficha da visita (ou na resposta rápida do modelo dela): o id diz a resposta e a visita. Quem
    // pode responder é conferido depois (responderPelaFicha); o título sem o id segue pelo aviso citado, como o "1".
    const botaoDaFicha = pessoa && m.toque && !m.midia ? lerBotaoDaFicha(m.texto) : null
    const fichaTocada = botaoDaFicha?.visitaId ? { resposta: botaoDaFicha.resposta, visitaId: botaoDaFicha.visitaId } : null

    // Respondeu citando um aviso: a resposta vai para o chamado, o Chat ou a aprovação dele.
    const aviso = pessoa && m.citada && !fichaTocada ? await avisoCitado(admin, workspaceId, pessoa.id, m.citada) : null
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
    let citouMenu = false
    if (pessoa && !aviso && !fichaTocada) {
      if (m.citada) {
        pendencia = await pendenciaAberta(admin, workspaceId, pessoa.id, m.citada)
        estrita = Boolean(pendencia)
        vencida = !pendencia && await perguntaVencida(admin, workspaceId, pessoa.id, m.citada)
        if (tocou && !pendencia && !vencida) {
          citouMenu = await citouOMenu(admin, workspaceId, pessoa.id, m.citada)
          vencida = !citouMenu
        }
      }
      if (!vencida && !tocou) pendencia ??= await pendenciaAberta(admin, workspaceId, pessoa.id, null)
    }
    // Sem citar, a pergunta aberta só leva o que parece resposta a ela; "menu", "avisos" e cia. seguem valendo. Na
    // pergunta de texto livre, o nome de setor que também é comando de área ("Financeiro", "Portaria", "Estoque
    // central") é a resposta: o "Onde é?" do chamado não se perde na lista do Financeiro.
    let paraPendencia = !doAudio && Boolean(pendencia) && (estrita || comando === 'desconhecido' || lerEscolha(m.texto, 99) !== null || ehConfirmacao(m.texto)
      || ehCancelamento(m.texto) || (esperaTextoLivre(pendencia) && (m.texto.trim().split(/\s+/).length >= 3 || Boolean(pedido && COMANDOS_DE_AREA.has(pedido.comando))))
      // Com um cadastro aberto, "Colaborador" sozinho é a resposta (o papel, o cargo), não um cadastro novo do zero.
      || (pendencia?.tipo === 'cadastrar_colaborador' && pedido?.comando === 'cadastrar_colaborador' && !pedido.resto))
    // A pergunta da pasta do Drive, com o assistente: o que não tem cara de caminho ("coloca na pasta de contratos do
    // jurídico") vai a ele, que vê o documento no contexto e prepara o plano; o caminho e o "cancelar" ficam com o bot.
    if (paraPendencia && pendencia?.tipo === 'guardar_documento' && ia.disponivel && ia.escrita && !m.midia && !ehCancelamento(m.texto) && !lerPastaDaResposta(m.texto)) paraPendencia = false
    // A foto do visitante (lib/whatsapp/portaria.ts): com o registro da visita aberto, a imagem é a foto dele — antes do
    // envio de fotos e do Drive, mesmo com um envio aberto; a imagem com a legenda "visitante: Nome" (com os dois-pontos:
    // "Nova visita do governador" é legenda para a comunicação) de quem tem a portaria abre o registro, já com a foto. O
    // resto das imagens segue como sempre.
    const legendaDeVisita = pessoa && m.midia ? lerLegendaDeVisita(m.texto) : null
    const registroDaVisita = pessoa && !aviso && m.midia?.categoria === 'foto'
      ? (pendencia?.tipo === 'registrar_visita' ? pendencia : await pendenciaAberta(admin, workspaceId, pessoa.id, null, 'registrar_visita'))
      : null
    const fotoDaVisita = pessoa && m.midia ? destinoDaImagem({
      categoria: m.midia.categoria, citouAviso: Boolean(aviso), aberto: registroDaVisita ? registroDaVisita.dados as unknown as DadosDaVisita : null,
      legenda: legendaDeVisita, temPortaria: temPortaria(pessoa),
    }) : null
    // Foto ou vídeo de quem é da equipe (sem citar um aviso): vira envio para a comunicação. O documento, com o Google
    // Drive conectado, vai para o Drive (a pasta na legenda, na pergunta do bot ou pelo assistente).
    const midia = Boolean(pessoa && m.midia && !aviso && !fotoDaVisita)
    const paraODrive = midia && pessoa && m.midia?.categoria === 'documento'
      ? await destinoDoDocumento(admin, workspaceId, pessoa, m, { assistente: ia.disponivel && ia.escrita && ia.podeAgir && ia.recente })
      : null

    // O assistente: o plano ou a pergunta aberta da pessoa, a resposta a eles (lida pelo código) e a rota.
    let aberto: AbertoDaPessoa | null = null
    let rota: Rota = 'bot'
    let respostaAoPlano: ReturnType<typeof lerRespostaAoPlano> = null
    if (pessoa && ia.disponivel && !m.midia && !fichaTocada) {
      aberto = await planoAberto(admin, pessoa.id, m.citada, { citacaoResolvida: Boolean(aviso || estrita || vencida || citouMenu) })
      // A visita na portaria também responde com número: só se pergunta quando o número pode ser da pergunta do assistente.
      const comNumero = lerEscolha(m.texto, 99) !== null && Boolean(aberto?.aberto.plano?.situacao === 'pergunta' || (aberto && !aberto.aberto.plano && aberto.aberto.recente))
      const visitaEsperando = comNumero ? Boolean(await visitaEsperandoResposta(admin, workspaceId, pessoa.id)) : false
      respostaAoPlano = aberto ? lerRespostaAoPlano(m.texto, aberto.aberto, { visitaEsperando, enviadaEm: m.enviadaEm }) : null
      // A janela de 2 min depois do plano (o "cancelar" atrasado, o "2" repetido, o "confirmo" tardio) não passa por cima de
      // outra pergunta: a do bot, aberta (a conferência do voto, os passos do chamado), ou a visita esperando a resposta.
      // O plano que espera o Palácio também cede a vez à pergunta mais nova, a menos que a mensagem cite o plano.
      if (respostaAoPlano && aberto && !aberto.aberto.plano && aberto.aberto.citacao !== 'plano_velho' && aberto.aberto.citacao !== 'plano' && (pendencia || visitaEsperando)) respostaAoPlano = null
      rota = rotaDaMensagem({
        disponivel: true, midia: false, comando: comandoDaRota(pedido?.comando ?? 'desconhecido', Boolean(listaDoFinanceiro)), texto: m.texto, resposta: respostaAoPlano,
        aviso: aviso ? tipoDoAviso(aviso.link) : null, paraPendencia,
        audio: doAudio,
      })
      // O plano de um passo para o Chat é escrita: sem a escrita do assistente para a pessoa, com a verificação em duas
      // etapas (a regra de sempre responde) ou sem texto, a resposta citando o canal sai como sempre.
      if (rota === 'chat_plano' && !(ia.escrita && ia.podeAgir && m.texto.trim().length >= 2)) rota = 'bot'
      // A pergunta do bot que já passou e a resposta clara à visita que espera ("pode subir") seguem o caminho de sempre,
      // antes do assistente (e o registro diz isso, não "ia").
      if (rota === 'ia' && !aviso && !doAudio && (vencida || (!tocou && respostaClaraDaVisita(m.texto) && await visitaEsperandoResposta(admin, workspaceId, pessoa.id)))) rota = 'bot'
    }

    const nova = await registrar(admin, {
      workspaceId, direcao: 'entrada', tipo: 'bot', situacao: 'recebida', numero, userId: pessoa?.id ?? null, mensagemId: m.id,
      comando: rota !== 'bot' ? rota
        : fichaTocada ? 'ficha_da_visita'
        : fotoDaVisita ? 'visita_foto'
        : paraODrive ? (paraODrive === 'assistente' ? 'ia' : `drive_${paraODrive}`)
          : midia ? `midia_${m.midia?.categoria}` : aviso ? 'responder_aviso' : vencida ? 'pergunta_vencida' : paraPendencia ? `pendencia_${pendencia?.tipo}`
            : decisaoSemLista ? 'desconhecido' : comando,
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

    // A pergunta fica guardada antes de sair: a resposta que cita ela acha o caminho de volta.
    const enviar = async (r: Resposta) => {
      if (!r.pergunta || !pessoa) {
        // O link de confirmar no Palácio (o cadastro de colaborador) sai na hora, como os links da conta.
        await responder(r.texto, r.semFila ? { categoria: 'conta', semFila: true } : {})
        return
      }
      const id = await guardarPendencia(admin, workspaceId, pessoa.id, r.pergunta)
      if (!id) {
        // Sem a tabela, ou com o tipo da pergunta ainda fora do CHECK (a migração dele não foi aplicada).
        await responder(r.semPergunta ?? `Isto ainda não está ligado no WhatsApp do Palácio. Faça pelo Palácio: ${base}${ondeNoPalacio(r.pergunta)}`)
        return
      }
      // Os botões da pergunta saem só aqui, com a pendência guardada: o toque cita esta mensagem e acha a pergunta. A do
      // registro da visita nunca espera na fila: leva o telefone do visitante (na autorização e na conferência), e
      // whatsapp_fila guardaria o texto (perguntaSemFila).
      const entrega = await responder(r.texto, { interativo: r.interativo, semFila: perguntaSemFila(r.pergunta.tipo) })
      if (entrega.situacao === 'enviada') await marcarPergunta(admin, id, entrega.id)
    }

    // A foto do visitante: o id da mídia entra no registro aberto mesmo com o teto de respostas batido (só a resposta
    // fica de fora); o registro novo pela legenda, não (sem a resposta, ninguém veria a pergunta).
    if (fotoDaVisita && pessoa) {
      if (noTeto && fotoDaVisita === 'comecar') return
      const r = await receberFotoDaVisita(admin, workspaceId, pessoa, m, { destino: fotoDaVisita, aberto: registroDaVisita, legenda: legendaDeVisita, base })
      if (r && !noTeto) await enviar(r)
      return
    }

    // A mídia é guardada mesmo com o teto de respostas batido: só a resposta fica de fora. O documento para o Drive
    // também (a legenda que diz a pasta guarda na hora); a resposta dele sai mais abaixo, com a pergunta guardada.
    const documento = midia && pessoa && paraODrive ? await receberDocumento(admin, workspaceId, pessoa, m, config, paraODrive) : null
    if (midia && pessoa && !documento) {
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

    // O toque na ficha da visita: a resposta à portaria, só de quem é visitado nela.
    if (fichaTocada) {
      await enviar(await responderPelaFicha(admin, workspaceId, pessoa, fichaTocada, base))
      return
    }

    // As respostas do assistente e as dele sem modelo: nunca esperam na fila (e o texto some dela se esperasse).
    const doAssistente = (texto: string) => responder(texto, { categoria: 'assistente', semFila: true })
    // O prazo do turno do assistente: 40 s, ou menos no fim do lote da rota (que tem 300 s para tudo).
    const prazo = Math.min(Date.now() + LIMITES.prazoMs, (opcoes.prazoDoLote ?? Number.POSITIVE_INFINITY) - 20_000)
    // Quem falou por áudio recebe a resposta também falada, se a voz da instituição estiver ligada para o WhatsApp.
    const emAudio = doAudio ? (texto: string) => responderEmAudio({ admin, workspaceId, config, numero, userId: pessoa.id, texto, prazo }) : null
    const assistente = (extra: { escolha?: string } = {}) => responderComAssistente({
      admin, workspaceId, pessoa, m, base, prazo, ia, aberto, responder: (texto, x) => responder(texto, x), eco: ecoDoAudio, emAudio, ...extra,
    })

    // A resposta ao plano ou à pergunta do assistente (o código lê; o modelo nunca).
    if (rota === 'ia_escolha' && respostaAoPlano?.tipo === 'escolha') {
      // O toque na lista traz o id da linha (esc:…); ao modelo vai o número da opção, como se tivesse sido digitado.
      const n = (aberto?.plano?.opcoes ?? []).indexOf(respostaAoPlano.marcador) + 1
      if (m.toque && n > 0) m = { ...m, texto: String(n) }
      await assistente({ escolha: respostaAoPlano.marcador })
      return
    }
    if (rota === 'ia_cancelar' || rota === 'ia_confirmo') {
      // Com a vez da pessoa: um turno que estava no meio (uma correção esperando o modelo) termina antes, e o plano
      // que ele trocou não é confirmado (o consumo é condicional: só o plano "aberto" lido aqui executa).
      const vez = await esperarAVez(admin, workspaceId, pessoa.id, prazo)
      if (!vez) {
        await doAssistente(TEXTOS_FIXOS.ocupado)
        return
      }
      let saida: Awaited<ReturnType<typeof confirmarPlano>> = { texto: TEXTOS_FIXOS.cancelado, saida: 'fixo' }
      try {
        if (rota === 'ia_confirmo' && aberto?.plano) saida = await confirmarPlano(admin, { workspaceId, pessoa, m, plano: aberto.plano, base, recente: ia.recente })
        else await cancelarPlano(admin, pessoa.id)
      } finally {
        await soltarVez(admin, pessoa.id)
      }
      if (saida.saida === 'recibo' && ofereceNaoFuiEu(saida.texto)) {
        // O recibo com o "Não fui eu" sai como os avisos de segurança: o botão e a marca no registro (lib/whatsapp/fila.ts),
        // e a resposta a ele protege a conta (lib/whatsapp/protecao.ts). Sem textos de ação: pode esperar na fila.
        await entregar(admin, workspaceId, { numero, texto: saida.texto, tipo: 'seguranca', userId: pessoa.id, categoria: 'assistente' }, { config })
      } else if (saida.saida === 'recibo') {
        await responder(saida.texto, { categoria: 'assistente' })
      } else if (saida.saida === 'link') {
        // O link de confirmar no Palácio sai na hora, como os links da conta (o texto some da fila se esperasse).
        await responder(saida.texto, { categoria: 'conta', semFila: true })
      } else {
        await doAssistente(saida.texto)
      }
      return
    }
    const textoDaRota = rota === 'ia_obrigado' ? undefined : TEXTO_DA_ROTA[rota]
    if (textoDaRota) {
      await doAssistente(ecoDoAudio ? `${ecoDoAudio}\n\n${textoDaRota}` : textoDaRota)
      return
    }

    // O documento para o Drive: guardado (o link), a pergunta da pasta, ou a legenda com outras palavras para o assistente.
    if (documento) {
      if (documento.tipo === 'resposta') await enviar(documento.resposta)
      else await assistente()
      return
    }

    if (aviso) {
      // Anexo respondendo um aviso: o arquivo não entra no chamado nem na conversa por aqui (só o texto entraria, sem ele).
      if (m.midia) {
        await responder(`Arquivo respondendo um aviso ainda não entra por aqui. Anexe pelo Palácio: ${base}${aviso.link ?? '/notificacoes'}`)
        return
      }
      // Citou o aviso pedindo algo ao assistente ("do que se trata?", "quem é o responsável disso?"): vai a ele, com o aviso no contexto.
      if (rota === 'ia') {
        await assistente()
        return
      }
      // Citou o aviso de um canal do Chat com a resposta ("ok, combinado"): o plano de um passo, que sai no canal com o "confirmo".
      const doChat = rota === 'chat_plano' ? alvoDoLink(aviso.link) : null
      if (doChat?.tipo === 'chat') {
        const vez = await esperarAVez(admin, workspaceId, pessoa.id, prazo)
        if (!vez) {
          await doAssistente(TEXTOS_FIXOS.ocupado)
          return
        }
        try {
          await guardarPlanoDoChat(admin, {
            workspaceId, pessoa, numero, alvo: { canalId: doChat.canalId, fio: doChat.fio }, texto: m.texto, base,
            saida: { semFila: (texto, interativo) => responder(texto, { categoria: 'assistente', semFila: true, interativo }), naFila: (texto) => responder(texto, { categoria: 'assistente' }) },
          })
        } finally {
          await soltarVez(admin, pessoa.id)
        }
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
    // O toque não: o "1" da lista do menu são os avisos (o toque no botão da visita já veio pelo aviso citado). O áudio
    // também não (vai ao assistente, que prepara o plano).
    if (!m.midia && !tocou && !doAudio && respostaClaraDaVisita(m.texto)) {
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
    if (comando === 'financeiro' && await podeDecidirNoFinanceiro(admin, workspaceId, pessoa)) {
      await enviar(await listarDecisoes(admin, workspaceId, pessoa, base))
      return
    }
    // Vale a lista do "financeiro" mais nova (a citada, se aberta, já veio pela pendência acima). Com o assistente, ela já
    // foi lida (listaDoFinanceiro); sem ela, a mensagem foi ao assistente e não chega aqui.
    if (comando === 'decidir_financeiro' && pedido && !decisaoSemLista && (listaDoFinanceiro || await podeDecidirNoFinanceiro(admin, workspaceId, pessoa))) {
      await enviar(await decidirPeloWhatsapp(admin, workspaceId, pessoa, listaDoFinanceiro ?? await pendenciaAberta(admin, workspaceId, pessoa.id, null, 'financeiro'), pedido.resto, base))
      return
    }

    // O cadastro de colaborador é de quem gerencia usuários (lerPedido já filtra; comecarCadastro confere de novo).
    if (comando === 'cadastrar_colaborador' && pedido) {
      const resposta = await comecarCadastro(admin, workspaceId, pessoa, pedido.resto, base)
      if (resposta) {
        await enviar(resposta)
        return
      }
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
      const entrega = await responder(textoDosAvisos({ avisos: avisos.map((a) => ({ titulo: a.titulo, mensagem: a.mensagem, link: a.link })), total, urlBase: base }))
      // Com o assistente, a lista entra na memória curta: "aprova a 2" logo depois aponta para o segundo aviso.
      if (ia.disponivel && entrega.situacao === 'enviada') await lembrarLista(admin, workspaceId, pessoa.id, avisos.map((a) => itemDoAviso(a.id, a.link)), entrega.id)
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
      const entrega = await responder(pendentes
        ? textoDasAprovacoes({ aprovacoes: pendentes.aprovacoes.map((a) => ({ id: a.id, titulo: a.titulo })), total: pendentes.total, urlBase: base })
        : `Não consegui ler as suas aprovações agora. Veja em ${base}/aprovacoes`)
      if (ia.disponivel && pendentes && entrega.situacao === 'enviada') {
        await lembrarLista(admin, workspaceId, pessoa.id, pendentes.aprovacoes.map((a) => ({ tipo: 'aprovacao' as const, id: a.id })), entrega.id)
      }
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

    // O assistente, sem modelo: "valeu" e "esquece" (a memória curta volta ao zero, e o plano ou a pergunta aberta é cancelada).
    if (rota === 'ia_obrigado') {
      await doAssistente(TEXTOS_FIXOS.obrigado)
      return
    }
    if (rota === 'ia_esquecer') {
      await esquecer(admin, pessoa.id)
      await cancelarPlano(admin, pessoa.id)
      await doAssistente(TEXTOS_FIXOS.esquecido)
      return
    }

    // O que o bot não entendeu, com o assistente ligado para a pessoa: vai a ele.
    if (rota === 'ia') {
      await assistente()
      return
    }

    // O menu sai também como lista, marcado no registro: é por essa marca que o toque nele vale como comando (citouOMenu).
    const quem = await quemNoMenu(admin, workspaceId, pessoa)
    const menu = textoDoMenu({ nome: pessoa.nome, pausado, urlBase: base, naoEntendi: comando === 'desconhecido' || decisaoSemLista, assistente: ia.disponivel, ...quem })
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
    frota: patrimonio >= 2 ? 'operar' : patrimonio >= 1 ? 'ver' : null, estoque: patrimonio >= 1, usuarios: gerenciaUsuarios(pessoa),
  }
}

/** O tipo do aviso citado, para a rota do assistente (o pedido de assinatura de ofício e o que não se reconhece: "outro"). */
function tipoDoAviso(link: string | null): AvisoCitado {
  const alvo = alvoDoLink(link)
  return alvo && alvo.tipo !== 'oficio' ? alvo.tipo : 'outro'
}

/** O item de um aviso na lista do "avisos", para a memória do assistente: a aprovação, o chamado ou a visita dele; senão, o próprio aviso. */
function itemDoAviso(id: string, link: string | null): { tipo: TipoDeItem; id: string } {
  const alvo = alvoDoLink(link)
  if (alvo?.tipo === 'aprovacao') return { tipo: 'aprovacao', id: alvo.id }
  if (alvo?.tipo === 'chamado') return { tipo: 'chamado', id: alvo.id }
  if (alvo?.tipo === 'visita') return { tipo: 'visita', id: alvo.id }
  return { tipo: 'aviso', id }
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
