import type { TabelaDeMarcadores } from './marcadores'
import type { Handlers, Rascunho, ResultadoDoPreparo } from './laco'
import { LIMITES, TEXTOS_FIXOS, motivoDoCodigo, pedeSegredo, temLink, umaLinha, type NomeDaFerramenta, type Passo, type ResultadoDaAcao } from './regras'

/**
 * Os preparos do assistente do WhatsApp (as ferramentas preparar_*) e a revalidação do plano na hora do
 * "confirmo". Nada aqui escreve: o preparo devolve um Passo resolvido — tudo o que o texto do plano e o executor
 * precisam, lido do banco agora —, e o passo só entra no rascunho (laco.ts); o plano só sai depois de guardado e
 * mostrado (index.ts, plano.ts), e só é feito com o "confirmo" (fluxo.ts).
 *
 * Cada preparo, em ordem (a entrada já veio validada e passou pelo portão de intenção, em laco.ts):
 *  1. a escrita ligada para a pessoa e o número de confiança recente (sem isso, o texto fixo);
 *  2. o marcador resolvido para o tipo certo (marcador desconhecido, vencido ou de outro tipo é recusado);
 *  3. quem usa a verificação em duas etapas: voto, mensagem e comentário ficam de fora, com o link do Palácio
 *     (até a confirmação no Palácio, etapa 4); abrir chamado, responder à portaria e marcar lidos valem (isentos);
 *  4. a permissão e o estado, pela fonte (rodada aberta e sem o voto dela, destinatário ativo, chamado com papel,
 *     fila e assunto ativos, visita esperando, avisos sem ler);
 *  5. os limites do plano e do dia (3 votos, 3 destinatários e uma mensagem por destinatário, as mensagens diretas
 *     de hoje, 8 passos);
 *  6. as referências de integridade (o hash do conteúdo da matéria: na confirmação, a matéria mudada não recebe voto);
 *  7. o passo, com as pessoas sempre com @usuário e o ⚠ de homônimo.
 * O erro vai ao modelo (is_error, uma frase do código) e o motivo à pessoa, em "Ficou de fora".
 *
 * Módulo puro: a fonte dos dados é injetada (no servidor, executores.ts, fonteDoSupabase; nos testes, uma de
 * mentira) — conferido por `npx tsx scripts/conferir-assistente-escrita.ts`. A revalidação (revalidarPasso) refaz
 * as mesmas conferências com leituras novas, e a execução passa ainda pelas funções do banco que conferem de novo.
 */

export type ConferenciaDoVoto = { setor: string; itens: string[] }[]

/** A rodada em que a pessoa vai votar, ou por que não dá (o texto do código e o codigo de ResultadoDaAcao). */
export type RodadaParaVotar =
  | { ok: true; titulo: string; contentId: string; pedidaPor: string | null; pedidaEm: string; conferencia: ConferenciaDoVoto }
  | { ok: false; codigo: 'encerrada' | 'ja_votou' | 'sem_permissao' | 'erro'; texto: string }

/** Uma pessoa do espaço como o plano mostra: nome, @usuário, setor, se há outra com o mesmo nome e se está ativa. */
export type PessoaParaOPlano = { nome: string; username: string; setor: string | null; homonimo: boolean; ativa: boolean }

/** O que os preparos e a revalidação leem do banco, sempre no espaço e com as regras da tela para a pessoa. */
export interface FonteDosPreparos {
  rodada(aprovacaoId: string): Promise<RodadaParaVotar>
  /** O sha-256 de título ‖ subtítulo ‖ corpo (whatsapp_hash_do_conteudo); null sem a função ou com erro. */
  hashDoConteudo(contentId: string): Promise<string | null>
  /** Uma pessoa do espaço (ativa ou não); null se não é do espaço. */
  pessoa(id: string): Promise<PessoaParaOPlano | null>
  /** O chamado: código, título, se está encerrado e se a pessoa tem papel nele (solicitante ou equipe). */
  chamado(id: string): Promise<{ codigo: string; titulo: string; encerrado: boolean; temPapel: boolean } | null>
  /** A fila e o assunto ativos (o assunto da fila); null se algum não recebe chamados. */
  assunto(filaId: string, assuntoId: string): Promise<{ filaNome: string; assuntoNome: string; pedeLocal: boolean } | null>
  /** A visita que espera a resposta desta pessoa agora (a única). */
  visitaEsperando(): Promise<{ id: string; nome: string } | null>
  /** Quantos avisos da pessoa estão sem ler: todos, ou só estes. */
  avisosSemLer(ids: string[] | 'todos'): Promise<number>
  /** As mensagens diretas que já saíram hoje pelo assistente; null se não deu para contar. */
  mensagensDeHoje(): Promise<number | null>
  /** A conversa do Chat aceita mensagem (é do espaço e não está arquivada); o nome do canal, "" na conversa direta. */
  canal(canalId: string): Promise<{ nome: string } | null>
}

export type ContextoDoPreparo = {
  fonte: FonteDosPreparos
  tabela: TabelaDeMarcadores
  /** O rascunho deste turno (os limites do plano contam o que já entrou). */
  rascunho: Pick<Rascunho, 'passos'>
  pessoaId: string
  /** Pode agir pelo WhatsApp (sem a verificação em duas etapas, nem obrigação de usar). */
  podeAgir: boolean
  /** A escrita pelo assistente ligada para a pessoa (whatsapp_ia_config.escrita, com o número recente). */
  escrita: boolean
  /** O número de confiança recente (confirmado há menos de 180 dias ou login há menos de 60). */
  recente: boolean
  /** O endereço do Palácio (o link de "faça pelo Palácio"). */
  base: string
  /** As mensagens diretas por dia pelo assistente (whatsapp_ia_config.mensagens_dia). */
  mensagensDia: number
  /** O rótulo que o código já escreveu para o marcador (contexto ou leituras), para o "Ficou de fora" sem ler o banco de novo. */
  rotuloDe?: (marcador: string) => string | null
}

/** Um link do Palácio que a resposta em texto leva (posProcessarResposta): o preparo recusado de quem usa a verificação em duas etapas. */
export type LinkDoPalacio = { titulo: string; href: string }

type Falha = Extract<ResultadoDoPreparo, { ok: false }>
const falha = (erro: string, extra: Omit<Falha, 'ok' | 'erro'> = {}): Falha => ({ ok: false, erro, ...extra })
const desconhecido = (prefixo: string, onde: string) =>
  falha(`Marcador desconhecido: use um marcador ${prefixo}_ que apareceu no contexto ou em ${onde}.`)
const entreAspas = (t: string) => `“${umaLinha(t, 140) || 'Sem título'}”`

/**
 * Os preparos de um turno. `links`: os do Palácio para a resposta em texto (o voto, a mensagem ou o comentário de
 * quem usa a verificação em duas etapas), na ordem e sem repetir.
 */
export function criarPreparador(c: ContextoDoPreparo): { preparar: Handlers['preparar']; links: LinkDoPalacio[] } {
  const links: LinkDoPalacio[] = []
  const rotulo = (marcador: unknown, reserva: string) => (c.rotuloDe?.(String(marcador)) ?? null) || reserva

  /** Voto, mensagem e comentário de quem usa a verificação em duas etapas: de fora, com o link de onde fazer. */
  const peloPalacio = (oQue: string, titulo: string, href: string): Falha => {
    if (!links.some((l) => l.href === href)) links.push({ titulo, href })
    return falha(TEXTOS_FIXOS.dois_fatores, { oQue, motivo: TEXTOS_FIXOS.dois_fatores_motivo, link: `${c.base}${href}` })
  }

  async function voto(e: Record<string, unknown>): Promise<ResultadoDoPreparo> {
    const id = c.tabela.resolver(String(e.aprovacao), 'aprovacao')
    if (!id) return desconhecido('apr', 'ler_aprovacoes')
    const nome = rotulo(e.aprovacao, 'a aprovação')
    if (!c.podeAgir) return peloPalacio(`votar em ${nome}`, `Votar em ${nome}`, `/aprovacoes/${id}`)
    const decisao = e.decisao === 'pedir_ajustes' ? 'changes_requested' as const : 'approved' as const
    const votos = c.rascunho.passos.filter((p): p is Extract<Passo, { acao: 'votar' }> => p.acao === 'votar')
    const mesma = votos.find((v) => v.aprovacaoId === id)
    if (mesma && mesma.decisao !== decisao) return falha('Já há outro voto nesta aprovação no plano.', { oQue: `votar em ${nome}` })
    if (!mesma && new Set(votos.map((v) => v.aprovacaoId)).size >= LIMITES.votos) {
      return falha(`No máximo ${LIMITES.votos} votos por plano; diga à pessoa que o resto é pelo Palácio.`, {
        oQue: `votar em ${nome}`, motivo: `no máximo ${LIMITES.votos} votos por plano; o resto, pelo Palácio`, link: `${c.base}/aprovacoes`,
      })
    }
    const r = await c.fonte.rodada(id)
    if (!r.ok) return falha(r.texto, { oQue: `votar em ${nome}`, motivo: motivoDoCodigo(r.texto) })
    const oQue = `votar em ${entreAspas(r.titulo)}`
    const hash = await c.fonte.hashDoConteudo(r.contentId)
    if (!hash) {
      return falha('O voto pelo assistente ainda não está ligado; diga que é pelo Palácio.', {
        oQue, motivo: 'o voto por aqui ainda não está ligado; vote pelo Palácio', link: `${c.base}/aprovacoes/${id}`,
      })
    }
    const quem = r.pedidaPor ? await c.fonte.pessoa(r.pedidaPor) : null
    return {
      ok: true,
      passo: {
        acao: 'votar', aprovacaoId: id, decisao,
        // Ao aprovar não vai nota: o plano mostra só o que sai (e a nota do "aprovar" não apareceria nele).
        nota: decisao === 'changes_requested' ? String(e.nota ?? '').trim() : '',
        hashConteudo: hash, titulo: r.titulo,
        pedidoPor: quem ? { nome: quem.nome, username: quem.username, homonimo: quem.homonimo } : null,
        pedidoEm: r.pedidaEm,
        // A conferência do setor é a declaração de quem aprova; no pedido de ajustes, não se aplica.
        conferencia: decisao === 'approved' ? r.conferencia : [],
        isento: false,
      },
    }
  }

  async function mensagem(e: Record<string, unknown>): Promise<ResultadoDoPreparo> {
    const id = c.tabela.resolver(String(e.para), 'pessoa')
    if (!id) return desconhecido('pes', 'buscar_pessoa')
    const nome = rotulo(e.para, 'a pessoa')
    const oQue = `mensagem para ${nome}`
    if (id === c.pessoaId) return falha('A mensagem direta é para um colega, não para a própria pessoa.', { oQue })
    if (!c.podeAgir) return peloPalacio(oQue, `Mensagem para ${nome}`, `/mensagens/pessoa/${id}`)
    const para = await c.fonte.pessoa(id)
    if (!para?.ativa) return falha('Essa pessoa não está mais no espaço.', { oQue })
    const mensagens = c.rascunho.passos.filter((p): p is Extract<Passo, { acao: 'mensagem_direta' }> => p.acao === 'mensagem_direta')
    if (mensagens.some((m) => m.paraId === id)) return falha('Já há uma mensagem para essa pessoa no plano: uma por pessoa, com tudo junto.', { oQue })
    if (new Set(mensagens.map((m) => m.paraId)).size >= LIMITES.destinatarios) {
      return falha(`Mensagens para no máximo ${LIMITES.destinatarios} pessoas por plano; diga à pessoa que o resto é pelo Palácio.`, {
        oQue, motivo: `mensagens para no máximo ${LIMITES.destinatarios} pessoas por plano; o resto, pelo Palácio`,
      })
    }
    const hoje = (await c.fonte.mensagensDeHoje()) ?? 0
    if (hoje + mensagens.length + 1 > c.mensagensDia) {
      return falha(`A pessoa chegou ao limite de ${c.mensagensDia} mensagens diretas por dia pelo WhatsApp; diga que é pelo Palácio.`, {
        oQue, motivo: TEXTOS_FIXOS.limite_de_mensagens, link: `${c.base}/mensagens/pessoa/${id}`,
      })
    }
    // Já conferido em validarEntrada; de novo aqui, porque o passo sai em nome da pessoa.
    const texto = String(e.texto ?? '').trim()
    if (!texto || temLink(texto) || pedeSegredo(texto)) return falha('A mensagem não pode ir vazia, ter link nem pedir senha, código ou token.', { oQue })
    return { ok: true, passo: { acao: 'mensagem_direta', paraId: id, para: { nome: para.nome, username: para.username, setor: para.setor, homonimo: para.homonimo }, texto, isento: false } }
  }

  async function comentario(e: Record<string, unknown>): Promise<ResultadoDoPreparo> {
    const id = c.tabela.resolver(String(e.chamado), 'chamado')
    if (!id) return desconhecido('cha', 'ler_chamados')
    const nome = rotulo(e.chamado, 'o chamado')
    const oQue = `comentar no chamado ${nome}`
    if (!c.podeAgir) return peloPalacio(oQue, `Chamado ${nome}`, `/chamados/${id}`)
    const ch = await c.fonte.chamado(id)
    if (!ch?.temPapel) return falha('Esse chamado não é desta pessoa (nem da fila que ela atende); só pelo Palácio.', { oQue, motivo: 'esse chamado não é seu nem da sua fila' })
    if (ch.encerrado) return falha('Este chamado está encerrado; se precisar, abra um novo.', { oQue, motivo: 'o chamado está encerrado' })
    const texto = String(e.texto ?? '').trim()
    if (texto.length < 2 || temLink(texto) || pedeSegredo(texto)) return falha('O comentário não pode ter link nem pedir senha, código ou token.', { oQue })
    return { ok: true, passo: { acao: 'comentar_chamado', chamadoId: id, codigo: ch.codigo, titulo: ch.titulo, texto, isento: false } }
  }

  async function chamado(e: Record<string, unknown>): Promise<ResultadoDoPreparo> {
    const oQue = 'abrir um chamado'
    const filaId = c.tabela.resolver(String(e.fila), 'fila')
    const assuntoId = c.tabela.resolver(String(e.assunto), 'assunto')
    if (!filaId || !assuntoId) return falha('Use a fila (fil_) e o assunto (ass_) que ler_filas_de_chamado devolveu.')
    const a = await c.fonte.assunto(filaId, assuntoId)
    if (!a) return falha('Essa fila ou esse assunto não recebe chamados agora; confira com ler_filas_de_chamado.', { oQue })
    const local = String(e.local ?? '').trim()
    if (a.pedeLocal && !local) return falha('Este assunto pede o local (sala, andar ou setor): pergunte à pessoa, se ela não disse.', { oQue })
    const relato = String(e.relato ?? '').trim()
    if (relato.length < 5 || pedeSegredo(relato)) return falha('O relato precisa dizer o problema (sem senha, código ou token).', { oQue })
    const urgencia = Number(e.urgencia)
    return {
      ok: true,
      passo: {
        acao: 'abrir_chamado', filaId, filaNome: a.filaNome, categoriaId: assuntoId, categoriaNome: a.assuntoNome, relato,
        local: local ? umaLinha(local, LIMITES.local) : null, urgencia: urgencia === 1 || urgencia === 3 ? urgencia : 2, isento: true,
      },
    }
  }

  async function visita(e: Record<string, unknown>): Promise<ResultadoDoPreparo> {
    const oQue = 'a resposta à portaria'
    const id = c.tabela.resolver(String(e.visita), 'visita')
    if (!id) return desconhecido('vis', 'ler_avisos')
    if (c.rascunho.passos.some((p) => p.acao === 'responder_visita')) return falha('Já há uma resposta à portaria no plano.', { oQue })
    const v = await c.fonte.visitaEsperando()
    if (!v || v.id !== id) return falha('Essa visita não espera mais a resposta desta pessoa.', { oQue, motivo: 'a visita não espera mais a sua resposta' })
    const recado = String(e.recado ?? '').trim()
    const resposta = e.resposta === 'subir' || e.resposta === 'recusar' ? e.resposta : 'aguardar'
    return { ok: true, passo: { acao: 'responder_visita', visitaId: id, visitante: v.nome, resposta, recado: recado || null, isento: true } }
  }

  async function lidos(e: Record<string, unknown>): Promise<ResultadoDoPreparo> {
    const oQue = 'marcar avisos como lidos'
    if (c.rascunho.passos.some((p) => p.acao === 'marcar_lidos')) return falha('Já há um passo de marcar avisos como lidos no plano.', { oQue })
    if (e.escopo === 'todos') {
      const quantos = await c.fonte.avisosSemLer('todos')
      if (!quantos) return falha('Não há avisos sem ler.', { oQue, motivo: 'não há avisos sem ler' })
      return { ok: true, passo: { acao: 'marcar_lidos', avisoIds: 'todos', quantos, isento: true } }
    }
    const ids = (Array.isArray(e.avisos) ? e.avisos : []).map((m) => c.tabela.resolver(String(m), 'aviso'))
    if (!ids.length || ids.some((i) => !i)) return desconhecido('avi', 'ler_avisos')
    const unicos = [...new Set(ids as string[])]
    const quantos = await c.fonte.avisosSemLer(unicos)
    if (!quantos) return falha('Esses avisos já estão lidos.', { oQue, motivo: 'esses avisos já estavam lidos' })
    return { ok: true, passo: { acao: 'marcar_lidos', avisoIds: unicos, quantos, isento: true } }
  }

  const PREPAROS: Partial<Record<NomeDaFerramenta, (e: Record<string, unknown>) => Promise<ResultadoDoPreparo>>> = {
    preparar_voto: voto, preparar_mensagem_direta: mensagem, preparar_comentario_no_chamado: comentario,
    preparar_chamado: chamado, preparar_resposta_a_visita: visita, preparar_marcar_avisos_lidos: lidos,
  }

  return {
    links,
    async preparar(nome, e) {
      const preparo = PREPAROS[nome]
      if (!preparo) return falha('Ferramenta desconhecida.')
      if (!c.recente) return falha(TEXTOS_FIXOS.numero_antigo, { motivo: 'confirme o número de novo em Meu perfil para pedir ações por aqui' })
      if (!c.escrita) return falha(TEXTOS_FIXOS.escrita_desligada, { motivo: 'pedir ações por aqui não está ligado para você' })
      if (c.rascunho.passos.length >= LIMITES.passos) return falha(`No máximo ${LIMITES.passos} passos por plano; diga à pessoa que o resto é pelo Palácio.`, { motivo: `no máximo ${LIMITES.passos} passos por plano` })
      try {
        return await preparo(e)
      } catch {
        return falha('Não deu para preparar agora; siga sem isso.', { motivo: 'não deu para conferir agora' })
      }
    },
  }
}

// ------------------------------------------------------------------ a revalidação (na confirmação, com leituras novas)

const confere: ResultadoDaAcao = { ok: true, codigo: 'feito', texto: 'confere' }

/**
 * Cada passo de novo, antes de qualquer escrita: a rodada ainda aberta e sem o voto da pessoa, e a matéria com o
 * MESMO conteúdo do plano (o hash; a versão da matéria não serve de trava); o destinatário ativo; o chamado com papel
 * e aberto; a fila e o assunto ativos; a visita ainda esperando; a conversa do Chat aceitando mensagem. O texto é o
 * motivo, que entra em "Nada foi feito: …". Nunca lança.
 */
export async function revalidarPasso(passo: Passo, fonte: FonteDosPreparos, pessoaId: string): Promise<ResultadoDaAcao> {
  try {
    if (passo.acao === 'votar') {
      const r = await fonte.rodada(passo.aprovacaoId)
      if (!r.ok) return { ok: false, codigo: r.codigo, texto: r.texto }
      const hash = await fonte.hashDoConteudo(r.contentId)
      if (!hash) return { ok: false, codigo: 'indisponivel', texto: 'o voto por aqui não está ligado agora' }
      return hash === passo.hashConteudo ? confere : { ok: false, codigo: 'mudou', texto: `a matéria ${entreAspas(passo.titulo)} mudou depois do plano` }
    }
    if (passo.acao === 'mensagem_direta') {
      const p = await fonte.pessoa(passo.paraId)
      return p?.ativa && passo.paraId !== pessoaId ? confere : { ok: false, codigo: 'erro', texto: 'essa pessoa não está mais no espaço' }
    }
    if (passo.acao === 'comentar_chamado') {
      const ch = await fonte.chamado(passo.chamadoId)
      if (!ch?.temPapel) return { ok: false, codigo: 'sem_permissao', texto: `você não está mais no chamado ${umaLinha(passo.codigo, 20)}` }
      return ch.encerrado ? { ok: false, codigo: 'encerrada', texto: `o chamado ${umaLinha(passo.codigo, 20)} foi encerrado` } : confere
    }
    if (passo.acao === 'abrir_chamado') {
      const a = await fonte.assunto(passo.filaId, passo.categoriaId)
      if (!a) return { ok: false, codigo: 'erro', texto: 'a fila ou o assunto não recebe mais chamados' }
      return a.pedeLocal && !passo.local ? { ok: false, codigo: 'erro', texto: 'o assunto agora pede o local' } : confere
    }
    if (passo.acao === 'responder_visita') {
      const v = await fonte.visitaEsperando()
      return v?.id === passo.visitaId ? confere : { ok: false, codigo: 'encerrada', texto: 'a visita não espera mais a sua resposta' }
    }
    if (passo.acao === 'responder_chat') {
      return (await fonte.canal(passo.canalId)) ? confere : { ok: false, codigo: 'sem_permissao', texto: 'a conversa não aceita mais mensagens' }
    }
    return confere
  } catch {
    return { ok: false, codigo: 'erro', texto: 'não deu para conferir agora' }
  }
}
