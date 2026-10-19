import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { atribuirNoChamado, mudarStatusNoChamado, transferirNoChamado } from '@/lib/chamados/nucleo'
import { ABERTOS, ENCERRADOS, PRIORIDADES, ROTULO_DO_STATUS, ROTULO_DO_STATUS_PARA_EQUIPE, ehStatus, type Quem } from '@/lib/chamados/regras'
import { carregarChamado, filasQueAtendo, papeisNoChamado, type ChamadoCarregado } from '@/lib/chamados/servidor'
import { ehEquipeDaEscola } from '@/lib/permissoes'
import {
  BOTOES_DA_CONFERENCIA, CHAMADOS_NA_RESPOSTA, DICA_DO_ATENDIMENTO, TEXTO_PEDE_MOTIVO_DA_TRANSFERENCIA, TEXTO_PEDE_SOLUCAO, TEXTO_SEM_ACAO_PELO_WHATSAPP,
  acharPeloNome, ehConfirmacao, interativoDaEscolha, lerAtendimento, lerAtendimentoNoAviso, lerEscolha, lerTransferencia, primeiroNome, textoDaConferenciaDoChamado, textoDaEscolha,
  textoDosChamados, type AcaoNoChamado, type ChamadoNaLista, type Interativo, type Opcao,
} from './regras'
import { encerrarPendencia, podeAgirPeloWhatsapp, type Pendencia, type Pessoa, type Resposta } from './acoes'
import { chamadosDaPessoa } from './consultas'

/**
 * Quem atende uma fila de chamados, pelo WhatsApp: assumir, resolver (com a
 * solução) e transferir para outra fila — pelo comando com o código
 * ("resolver TI-0042: troquei o toner") ou respondendo ao aviso do chamado
 * ("resolvido: troquei o toner"). E o 5 de quem atende, que mostra também os
 * chamados abertos da fila.
 *
 * As ações passam pelas MESMAS funções da tela (lib/chamados/nucleo.ts:
 * mudarStatusNoChamado, atribuirNoChamado e transferirNoChamado), com as
 * mesmas conferências, o mesmo evento na linha do tempo (marcado com
 * `canal: 'whatsapp'`) e os mesmos avisos. Quem atende é quem a tela diz
 * (filasQueAtendo/papeisNoChamado: a equipe da fila e quem administra).
 *
 * Resolver e transferir terminam na conferência ("confirmo"), como o voto, e
 * as etapas ficam em whatsapp_pendencias (tipo "atender_chamado", da migração
 * 20261018213700: antes dela, o banco recusa a pergunta e o bot manda para o
 * chamado no Palácio). Assumir vai direto e funciona sem a migração.
 *
 * Como o resto das ações, vale só para quem pode agir pelo WhatsApp
 * (podeAgirPeloWhatsapp): com a verificação em duas etapas, o chamado se
 * atende no Palácio. Nada aqui envia mensagem: cada função devolve a resposta
 * e, quando falta um passo, a pergunta a guardar.
 */

type Admin = ReturnType<typeof createAdminClient>

type FilaNaConversa = { id: string; nome: string }
type DadosDoAtendimento = {
  acao: Exclude<AcaoNoChamado, 'assumir'>
  chamadoId: string
  codigo: string
  titulo: string
  etapa?: 'nota' | 'fila' | 'categoria' | 'motivo' | 'conferencia'
  /** O pedido veio respondendo ao aviso (a conferência lembra que podia ser só uma mensagem). */
  doAviso?: boolean
  nota?: string
  /** As filas da lista mostrada (a escolha é pelo número); sem a lista, a pessoa escreve o nome. */
  filas?: FilaNaConversa[]
  filaId?: string
  filaNome?: string
  categorias?: FilaNaConversa[]
  categoriaId?: string
  categoriaNome?: string
  motivo?: string
}

/** Os chamados da fila lidos para o 5 (a ordem de trabalho sai daqui, em memória). */
const LIMITE_DA_FILA = 200

const linkDoChamado = (base: string, id: string) => `${base}/chamados/${id}`
const mensagemDe = (causa: unknown, padrao: string) => (causa instanceof Error && causa.message ? causa.message : padrao)

// ------------------------------------------------------------------ quem atende

/** Atende alguma fila? (o 5 e o menu mostram a fila.) A equipe da Escola não atende chamado. */
export async function atendeAlgumaFila(admin: Admin, workspaceId: string, pessoa: Pessoa): Promise<boolean> {
  if (ehEquipeDaEscola(pessoa.papel)) return false
  try {
    return (await filasQueAtendo(admin, workspaceId, pessoa.id, pessoa.papel)).size > 0
  } catch {
    return false
  }
}

async function chamadoPeloCodigo(admin: Admin, workspaceId: string, codigo: string): Promise<ChamadoCarregado | null> {
  const { data } = await admin.from('chamados').select('id').eq('workspace_id', workspaceId).eq('codigo', codigo).limit(1).maybeSingle()
  return data ? carregarChamado(admin, workspaceId, data.id as string) : null
}

// ------------------------------------------------------------------ o 5

/**
 * O 5: os chamados abertos que a pessoa abriu ou que estão com ela (consultas.ts, chamadosDaPessoa) e, para quem
 * atende uma fila, os abertos da fila que não estão com ela: sem responsável primeiro, depois a prioridade mais
 * alta e o mais antigo.
 */
export async function respostaDosChamados(admin: Admin, workspaceId: string, pessoa: Pessoa, base: string): Promise<string> {
  const userId = pessoa.id
  const atendo = ehEquipeDaEscola(pessoa.papel) ? new Set<string>() : await filasQueAtendo(admin, workspaceId, userId, pessoa.papel)
  const [meus, daFila] = await Promise.all([
    chamadosDaPessoa(admin, workspaceId, userId, { limite: CHAMADOS_NA_RESPOSTA }),
    atendo.size ? chamadosDaFila(admin, workspaceId, userId, atendo) : Promise.resolve(null),
  ])
  if (!meus) return `Não consegui ler os seus chamados agora. Veja em ${base}/chamados`
  return textoDosChamados({
    chamados: meus.chamados.map((c) => {
      const status = ehStatus(c.status) ? c.status : 'novo'
      const deOutro = c.solicitanteId !== userId
      return {
        id: c.id, codigo: c.codigo, titulo: c.titulo,
        situacao: deOutro ? `${ROTULO_DO_STATUS_PARA_EQUIPE[status]} · com você` : ROTULO_DO_STATUS[status],
      }
    }),
    total: meus.total, urlBase: base,
    // Quem atende e a leitura da fila falhou: o aviso de que não carregou (não "em dia") e a dica de como agir.
    daFila: atendo.size ? daFila ?? { chamados: [], total: 0, falhou: true } : null,
  })
}

/** Os abertos da fila que não são da pessoa (nem abertos por ela, nem com ela), na ordem de trabalho. null se a leitura falhou. */
async function chamadosDaFila(admin: Admin, workspaceId: string, userId: string, atendo: Set<string>): Promise<{ chamados: ChamadoNaLista[]; total: number } | null> {
  const { data, error } = await admin.from('chamados').select('id, codigo, titulo, status, prioridade, solicitante_id, responsavel_id, criado_em')
    .eq('workspace_id', workspaceId).in('fila_id', [...atendo]).in('status', [...ABERTOS]).order('criado_em', { ascending: true }).limit(LIMITE_DA_FILA)
  if (error) return null
  const peso = (p: unknown) => PRIORIDADES.length - PRIORIDADES.indexOf(p as (typeof PRIORIDADES)[number])
  const lista = (data ?? []).filter((c) => c.solicitante_id !== userId && c.responsavel_id !== userId)
    .sort((a, b) => Number(Boolean(a.responsavel_id)) - Number(Boolean(b.responsavel_id)) || peso(a.prioridade) - peso(b.prioridade)
      || String(a.criado_em).localeCompare(String(b.criado_em)))
  const mostrar = lista.slice(0, CHAMADOS_NA_RESPOSTA)
  const responsaveis = [...new Set(mostrar.map((c) => c.responsavel_id as string | null).filter((id): id is string => Boolean(id)))]
  const { data: perfis } = responsaveis.length ? await admin.from('profiles').select('id, full_name').in('id', responsaveis) : { data: [] }
  const nome = new Map((perfis ?? []).map((p) => [p.id as string, primeiroNome(p.full_name as string | null)]))
  return {
    chamados: mostrar.map((c) => {
      const status = ehStatus(c.status) ? c.status : 'novo'
      const com = c.responsavel_id ? `com ${nome.get(c.responsavel_id as string) || 'outra pessoa'}` : 'sem responsável'
      return { id: c.id as string, codigo: (c.codigo as string) || 'Chamado', titulo: (c.titulo as string) ?? '', situacao: `${ROTULO_DO_STATUS_PARA_EQUIPE[status]} · ${com}` }
    }),
    total: lista.length,
  }
}

// ------------------------------------------------------------------ o pedido (pelo código ou pelo aviso)

/** "assumir TI-0042", "resolver TI-0042: …", "transferir TI-0042 para …", sem citar nada. */
export async function atenderPeloCodigo(admin: Admin, workspaceId: string, pessoa: Pessoa, texto: string, base: string): Promise<Resposta> {
  if (ehEquipeDaEscola(pessoa.papel)) return { texto: `Chamados ficam no Palácio: ${base}/chamados` }
  const pedido = lerAtendimento(texto)
  if (!pedido?.codigo) return { texto: DICA_DO_ATENDIMENTO }
  const c = await chamadoPeloCodigo(admin, workspaceId, pedido.codigo)
  const papeis = c ? papeisNoChamado(c, pessoa.id, await filasQueAtendo(admin, workspaceId, pessoa.id, pessoa.papel)) : []
  // Mesma resposta para "não existe" e "não é seu", como a tela.
  if (!c || !papeis.length) return { texto: `Não achei o chamado *${pedido.codigo}* entre os seus. Confira o código (ele muda quando o chamado troca de fila): ${base}/chamados` }
  if (!papeis.includes('equipe')) {
    return { texto: `Só quem atende ${c.fila.nome} assume, resolve ou transfere o *${c.codigo}*. Para falar com a equipe, responda a mensagem do aviso do chamado. ${linkDoChamado(base, c.id)}` }
  }
  if (!await podeAgirPeloWhatsapp(admin, workspaceId, pessoa)) return { texto: `${TEXTO_SEM_ACAO_PELO_WHATSAPP}\n\n${linkDoChamado(base, c.id)}` }
  return comecar(admin, workspaceId, pessoa, c, papeis, pedido.acao, pedido.texto, base, false)
}

/**
 * Respondendo ao aviso do chamado: o pedido de quem atende, se o texto é um
 * na forma que não deixa dúvida ("assumo", "resolvido: troquei o toner",
 * "transferir para Manutenção": lerAtendimentoNoAviso); null para a conversa
 * de sempre (vai para o chamado como mensagem). Quem chama
 * (responderAoAviso) já conferiu que a pessoa pode agir pelo WhatsApp.
 */
export async function atenderPeloAviso(admin: Admin, workspaceId: string, pessoa: Pessoa, c: ChamadoCarregado, papeis: Quem[], texto: string, base: string): Promise<Resposta | null> {
  const pedido = lerAtendimentoNoAviso(texto)
  if (!pedido || !papeis.includes('equipe')) return null
  // O código, aqui, só vale se for o deste aviso: "resolvido: rede-2 trocada" não cita chamado nenhum.
  const outro = pedido.codigo !== null && pedido.codigo !== c.codigo
  if (outro && pedido.acao === 'assumir') return { texto: `Este aviso é do chamado *${c.codigo}*. Para assumir o *${pedido.codigo}*, mande *assumir ${pedido.codigo}* sem responder o aviso.` }
  return comecar(admin, workspaceId, pessoa, c, papeis, pedido.acao, outro ? pedido.resto : pedido.texto, base, true)
}

async function comecar(admin: Admin, workspaceId: string, pessoa: Pessoa, c: ChamadoCarregado, papeis: Quem[], acao: AcaoNoChamado, texto: string, base: string, doAviso: boolean): Promise<Resposta> {
  const abrir = linkDoChamado(base, c.id)
  if (acao === 'assumir') return assumir(admin, pessoa, c, papeis, base)
  if (ENCERRADOS.includes(c.status) || c.status === 'resolvido') {
    return { texto: `O chamado *${c.codigo}* já está ${ROTULO_DO_STATUS_PARA_EQUIPE[c.status].toLowerCase()}. ${abrir}` }
  }
  const d: DadosDoAtendimento = { acao, chamadoId: c.id, codigo: c.codigo, titulo: c.titulo, ...(doAviso ? { doAviso } : {}) }
  if (acao === 'resolver') return proximoPasso(admin, workspaceId, c, { ...d, nota: texto.trim().slice(0, 5000) || undefined }, base)
  const { fila, motivo } = lerTransferencia(texto)
  return proximoPasso(admin, workspaceId, c, { ...d, motivo: motivo || undefined }, base, undefined, fila)
}

// ------------------------------------------------------------------ assumir

/**
 * Deixa o chamado com quem pediu: "Atender" (novo → em atendimento, que já
 * faz da pessoa a responsável quando não havia) e, se ele estava com outra
 * pessoa ou já em andamento, o responsável da triagem. As mesmas funções e
 * os mesmos avisos dos dois botões da tela.
 */
async function assumir(admin: Admin, pessoa: Pessoa, c: ChamadoCarregado, papeis: Quem[], base: string): Promise<Resposta> {
  const abrir = linkDoChamado(base, c.id)
  if (ENCERRADOS.includes(c.status) || c.status === 'resolvido') {
    return { texto: `O chamado *${c.codigo}* já está ${ROTULO_DO_STATUS_PARA_EQUIPE[c.status].toLowerCase()}. ${abrir}` }
  }
  if (c.responsavel_id === pessoa.id && c.status !== 'novo') return { texto: `O chamado *${c.codigo}* já está com você. ${abrir}` }
  const autor = { id: pessoa.id, nome: pessoa.nome }
  const comOutro = c.responsavel_id && c.responsavel_id !== pessoa.id ? c.responsavel_id : null
  let nomeDoOutro: string | null = null
  if (comOutro) {
    const { data } = await admin.from('profiles').select('full_name').eq('id', comOutro).maybeSingle()
    nomeDoOutro = (data?.full_name as string | null)?.trim() || null
  }
  try {
    // "Atender": sem responsável, quem atende passa a ser o responsável (mudarStatusNoChamado).
    if (c.status === 'novo') await mudarStatusNoChamado(admin, { c, papeis, autor, para: 'em_atendimento', nota: '', canal: 'whatsapp' })
    if (comOutro || (c.status !== 'novo' && c.responsavel_id !== pessoa.id)) {
      await atribuirNoChamado(admin, { c, papeis, autor, responsavelId: pessoa.id, canal: 'whatsapp' })
    }
  } catch (causa) {
    return { texto: `${mensagemDe(causa, 'Não foi possível assumir o chamado.')} ${abrir}` }
  }
  const status = c.status === 'novo' ? 'em_atendimento' : c.status
  return {
    texto: [
      `Pronto: o chamado *${c.codigo}* · ${c.titulo} está com você (${ROTULO_DO_STATUS_PARA_EQUIPE[status].toLowerCase()})${nomeDoOutro ? `. Estava com ${nomeDoOutro}` : ''}.`,
      `Para responder a quem abriu, responda a mensagem do aviso do chamado. Para resolver: *resolver ${c.codigo}:* e a solução.`,
      abrir,
    ].join('\n\n'),
  }
}

// ------------------------------------------------------------------ resolver e transferir (em etapas)

/** A próxima pergunta, até a conferência. `busca`: a equipe escrita ("transferir … para Manutenção"). */
async function proximoPasso(admin: Admin, workspaceId: string, c: ChamadoCarregado, d: DadosDoAtendimento, base: string, pendenciaId?: number, busca?: string): Promise<Resposta> {
  const perguntar = (dados: DadosDoAtendimento, texto: string, interativo: Interativo | null = null): Resposta =>
    ({ texto, pergunta: { tipo: 'atender_chamado', dados, id: pendenciaId }, interativo })
  const escolher = (dados: DadosDoAtendimento, pergunta: string, opcoes: Opcao[]) =>
    perguntar(dados, textoDaEscolha({ pergunta, opcoes }), interativoDaEscolha(opcoes, { cancelar: 'Deixar o chamado como está' }))

  if (d.acao === 'resolver') {
    if (!d.nota || d.nota.length < 5) return perguntar({ ...d, etapa: 'nota', nota: undefined }, TEXTO_PEDE_SOLUCAO)
    return perguntar({ ...d, etapa: 'conferencia' }, textoDaConferenciaDoChamado({ acao: 'resolver', codigo: c.codigo, titulo: c.titulo, nota: d.nota, doAviso: d.doAviso }), BOTOES_DA_CONFERENCIA)
  }

  if (!d.filaId) {
    const { data } = await admin.from('chamado_filas').select('id, nome, prefixo').eq('workspace_id', workspaceId).eq('ativa', true).neq('id', c.fila_id).order('ordem')
    const filas = (data ?? []).map((f) => ({ id: f.id as string, nome: f.nome as string, apelidos: [f.prefixo as string] }))
    if (!filas.length) return { texto: `Nenhuma outra equipe está recebendo chamados agora. ${linkDoChamado(base, c.id)}` }
    const achadas = busca ? acharPeloNome(filas, busca) : []
    if (achadas.length === 1) {
      d = { ...d, filaId: achadas[0].id, filaNome: achadas[0].nome, filas: undefined }
    } else {
      const lista = achadas.length ? achadas : filas
      const naoAchou = busca && !achadas.length ? `Não achei a equipe “${busca}”. ` : ''
      // Mais do que cabe numa lista: a pessoa escreve o nome (ou parte dele).
      if (lista.length > 9) return perguntar({ ...d, etapa: 'fila', filas: undefined }, `${naoAchou}Para qual equipe vai o chamado *${c.codigo}*? Escreva o nome da equipe, ou *cancelar*.`)
      return escolher({ ...d, etapa: 'fila', filas: lista.map((f) => ({ id: f.id, nome: f.nome })) }, `${naoAchou}Para qual equipe vai o chamado *${c.codigo}*?`, lista.map((f) => ({ nome: f.nome })))
    }
  }

  if (!d.categoriaId) {
    const { data } = await admin.from('chamado_categorias').select('id, nome').eq('fila_id', d.filaId).eq('ativa', true).order('ordem').limit(9)
    const categorias = (data ?? []).map((x) => ({ id: x.id as string, nome: x.nome as string }))
    if (!categorias.length) return { texto: `${d.filaNome ?? 'Essa equipe'} ainda não tem assuntos para chamado. Transfira pelo Palácio: ${linkDoChamado(base, c.id)}` }
    if (categorias.length > 1) return escolher({ ...d, etapa: 'categoria', categorias }, `Qual é o assunto na fila de *${d.filaNome ?? 'destino'}*?`, categorias.map((x) => ({ nome: x.nome })))
    d = { ...d, categoriaId: categorias[0].id, categoriaNome: categorias[0].nome, categorias: undefined }
  }

  if (!d.motivo || d.motivo.length < 3) return perguntar({ ...d, etapa: 'motivo', motivo: undefined }, TEXTO_PEDE_MOTIVO_DA_TRANSFERENCIA)
  return perguntar({ ...d, etapa: 'conferencia' }, textoDaConferenciaDoChamado({
    acao: 'transferir', codigo: c.codigo, titulo: c.titulo, de: c.fila.nome, para: d.filaNome ?? 'outra fila', assunto: d.categoriaNome ?? '—', motivo: d.motivo,
  }), BOTOES_DA_CONFERENCIA)
}

/**
 * A resposta à pergunta aberta. O chamado é lido de novo a cada passo: se
 * saiu da fila da pessoa (transferido, ou ela saiu da equipe), a pergunta
 * acaba. `estrita` = a pessoa citou a pergunta: o que não serve é pedido de
 * novo; sem citar, devolve null e segue como mensagem comum.
 */
export async function seguirAtendimento(admin: Admin, workspaceId: string, pessoa: Pessoa, p: Pendencia, texto: string, base: string, estrita: boolean): Promise<Resposta | null> {
  const d = p.dados as unknown as DadosDoAtendimento
  const deNovo = (t: string) => (estrita ? { texto: t } : null)
  const abrir = linkDoChamado(base, String(d.chamadoId ?? ''))
  const c = d.chamadoId ? await carregarChamado(admin, workspaceId, d.chamadoId) : null
  const papeis = c ? papeisNoChamado(c, pessoa.id, await filasQueAtendo(admin, workspaceId, pessoa.id, pessoa.papel)) : []
  if (!c || !papeis.includes('equipe')) {
    await encerrarPendencia(admin, p.id)
    return { texto: `Este chamado não está mais na fila que você atende. ${abrir}` }
  }
  const avancar = async (dados: DadosDoAtendimento, busca?: string) => {
    const r = await proximoPasso(admin, workspaceId, c, dados, base, p.id, busca)
    if (!r.pergunta) await encerrarPendencia(admin, p.id)
    return r
  }

  if (d.etapa === 'nota') {
    const nota = texto.trim().slice(0, 5000)
    if (nota.length < 5 || lerEscolha(texto, 99) !== null) return deNovo('Escreva a solução em uma frase (é o que quem abriu vai ler), ou *cancelar*.')
    return avancar({ ...d, nota })
  }
  if (d.etapa === 'fila') {
    const n = d.filas ? lerEscolha(texto, d.filas.length) : null
    if (n && d.filas) return avancar({ ...d, filaId: d.filas[n - 1].id, filaNome: d.filas[n - 1].nome, filas: undefined })
    // Também vale escrever o nome da equipe em vez do número.
    const busca = texto.replace(/\s+/g, ' ').trim().slice(0, 80)
    if (busca.length < 2 || lerEscolha(texto, 99) !== null) return deNovo(d.filas ? `Responda com o número da equipe (1 a ${d.filas.length}), ou *cancelar*.` : 'Escreva o nome da equipe de destino, ou *cancelar*.')
    return avancar({ ...d, filas: undefined }, busca)
  }
  if (d.etapa === 'categoria') {
    const n = lerEscolha(texto, d.categorias?.length ?? 0)
    if (!n || !d.categorias) return deNovo(`Responda com o número do assunto (1 a ${d.categorias?.length ?? 1}), ou *cancelar*.`)
    return avancar({ ...d, categoriaId: d.categorias[n - 1].id, categoriaNome: d.categorias[n - 1].nome, categorias: undefined })
  }
  if (d.etapa === 'motivo') {
    const motivo = texto.trim().slice(0, 2000)
    if (motivo.length < 3 || lerEscolha(texto, 99) !== null) return deNovo('Diga em poucas palavras por que está transferindo, ou *cancelar*.')
    return avancar({ ...d, motivo })
  }
  if (d.etapa !== 'conferencia') {
    await encerrarPendencia(admin, p.id)
    return { texto: `Não consegui continuar. Faça pelo Palácio: ${abrir}` }
  }

  if (!ehConfirmacao(texto)) return estrita ? { texto: 'Para seguir, responda a conferência com *confirmo*; para desistir, *cancelar*.' } : null
  if (!await encerrarPendencia(admin, p.id)) return { texto: 'Esta conferência já foi respondida.' }
  if (!await podeAgirPeloWhatsapp(admin, workspaceId, pessoa)) return { texto: `${TEXTO_SEM_ACAO_PELO_WHATSAPP}\n\n${abrir}` }
  const autor = { id: pessoa.id, nome: pessoa.nome }
  try {
    if (d.acao === 'resolver') {
      const mudou = await mudarStatusNoChamado(admin, { c, papeis, autor, para: 'resolvido', nota: d.nota ?? '', canal: 'whatsapp' })
      if (!mudou) return { texto: `Nada mudou: o chamado *${c.codigo}* já estava resolvido. ${abrir}` }
      return { texto: `Pronto: *${c.codigo}* resolvido. Quem abriu foi avisado para confirmar e avaliar (ou reabrir, se o problema continuar). ${abrir}` }
    }
    const novo = await transferirNoChamado(admin, {
      c, papeis, autor, filaId: d.filaId ?? '', categoriaId: d.categoriaId ?? '', motivo: d.motivo ?? '', canal: 'whatsapp',
    })
    return { texto: `Pronto: *${c.codigo}* transferido para ${novo.fila} e agora se chama *${novo.codigo}*. A equipe de lá e quem abriu foram avisados. ${abrir}` }
  } catch (causa) {
    return { texto: `${mensagemDe(causa, d.acao === 'resolver' ? 'Não foi possível resolver o chamado.' : 'Não foi possível transferir.')} ${abrir}` }
  }
}
