import { IDIOMA_DO_MODELO, nomeDeModeloValido, type ObjetoDoModelo } from './regras'

/**
 * Os modelos (templates) da Meta por situação, sem banco nem rede — conferidos
 * por `npx tsx scripts/conferir-whatsapp.ts`.
 *
 * Fora da janela de 24 h, só sai modelo aprovado pela Meta. O cofre guarda um
 * modelo por finalidade, com uma variável que leva o texto inteiro (regras.ts,
 * modeloParaEnviar). Aqui fica o outro jeito, por situação: o catálogo dos
 * modelos que o Palácio cadastrou na Meta para cada caso, com o corpo, as
 * variáveis e os botões EXATAMENTE como foram cadastrados (outubro de 2026), em
 * ordem de preferência. Antes de mandar, o servidor lê na Meta como cada um
 * está (kapso.ts, modelosDaMetaKapso: GET /{WABA}/message_templates, com cache
 * de VALIDADE_DOS_MODELOS_MS) e usa o primeiro da lista que está APPROVED, em
 * português e da categoria UTILITY (modeloUtilAprovado): nunca MARKETING (a Meta
 * reclassifica modelos e cobra como marketing) nem AUTHENTICATION. Sem nenhum
 * aprovado — ou sem conseguir ler —, nenhum serve, e quem chama segue pelo
 * caminho de antes.
 *
 * Nesta entrega, só a portaria usa (a ficha da visita e a resposta ao
 * visitante); os outros avisos continuam pelo modelo do cofre (ARQUITETURA
 * §8.5, próximo passo: catalogar os demais).
 */

/** A situação que pede um modelo. */
export type SituacaoDoModelo = 'visita' | 'resposta_ao_visitante'

export type BotaoDoModelo =
  | { tipo: 'QUICK_REPLY'; texto: string }
  /** `url` com {{1}} no fim: o pedaço variável vai em MontagemDoModelo.links. */
  | { tipo: 'URL'; texto: string; url: string }

/** Um modelo como foi cadastrado na Meta. `cabecalho` "IMAGE": a foto vai pelo id da mídia (kapso.ts, subirMidiaKapso). */
export type ModeloDoCatalogo = { nome: string; cabecalho: 'IMAGE' | null; corpo: string; parametros: number; botoes: readonly BotaoDoModelo[] }

/** Os três botões da ficha da visita, na ordem cadastrada (a mesma das respostas 1, 2 e 3). */
const BOTOES_DA_VISITA: readonly BotaoDoModelo[] = [
  { tipo: 'QUICK_REPLY', texto: 'Pode subir' },
  { tipo: 'QUICK_REPLY', texto: 'Aguarde na recepção' },
  { tipo: 'QUICK_REPLY', texto: 'Não pode agora' },
]

const VISITA_V2 = 'Chegou uma visita para você na recepção da Cruz Vermelha RJ.\n\nQuem é: {{1}}\nAssunto: {{2}}\nHorário: {{3}}\n\nToque em uma das opções para responder à portaria.'
const VISITA = 'Visita na portaria da Cruz Vermelha RJ para você.\n\nVisitante: {{1}}\nMotivo: {{2}}\nChegada: {{3}}\n\nResponda pelos botões abaixo.'

/**
 * O catálogo, em ordem de preferência. Na visita, os de foto (cabeçalho de imagem) vêm antes, mas só servem quando há a
 * foto (escolherModelo): a Meta recusou o exemplo de imagem no cadastro, e eles ainda não existem lá — enquanto não
 * existirem (ou não forem aprovados), saem o portaria_visita_v2 e depois o portaria_visita, sem foto.
 *
 * Parâmetros: visita — {{1}} quem é (o nome e, entre parênteses, a empresa), {{2}} o motivo, {{3}} a chegada (hora e
 * quem registrou); resposta ao visitante — {{1}} quem ele veio visitar, {{2}} a situação.
 */
export const CATALOGO_DOS_MODELOS: Record<SituacaoDoModelo, readonly ModeloDoCatalogo[]> = {
  visita: [
    { nome: 'portaria_visita_foto_v2', cabecalho: 'IMAGE', corpo: VISITA_V2, parametros: 3, botoes: BOTOES_DA_VISITA },
    { nome: 'portaria_visita_foto', cabecalho: 'IMAGE', corpo: VISITA, parametros: 3, botoes: BOTOES_DA_VISITA },
    { nome: 'portaria_visita_v2', cabecalho: null, corpo: VISITA_V2, parametros: 3, botoes: BOTOES_DA_VISITA },
    { nome: 'portaria_visita', cabecalho: null, corpo: VISITA, parametros: 3, botoes: BOTOES_DA_VISITA },
  ],
  resposta_ao_visitante: [
    {
      nome: 'portaria_resposta_visitante_v2', cabecalho: null, parametros: 2, botoes: [],
      corpo: 'Recepção da Cruz Vermelha RJ: atualização sobre a sua visita a {{1}}.\n\nSituação: {{2}}\n\nEm caso de dúvida, procure a recepção.',
    },
    {
      nome: 'portaria_resposta_visitante', cabecalho: null, parametros: 2, botoes: [],
      corpo: 'Portaria da Cruz Vermelha RJ: sua visita para {{1}}.\n\nResposta: {{2}}\n\nQualquer dúvida, fale com a recepção.',
    },
  ],
}

/** O modelo do catálogo com esse nome (qualquer situação); null se não é do catálogo. */
export function modeloDoCatalogo(nome: string): ModeloDoCatalogo | null {
  for (const lista of Object.values(CATALOGO_DOS_MODELOS)) {
    const achado = lista.find((m) => m.nome === nome)
    if (achado) return achado
  }
  return null
}

// ------------------------------------------------------------------ como estão na Meta

/** Um modelo como a Meta devolve na lista (GET /{WABA}/message_templates?fields=name,status,category,language). */
export type ModeloNaMeta = { nome: string; status: string; categoria: string; idioma: string }

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** A página da lista de modelos (`{ data: [...] }`), só o que o Palácio usa; o que não tem nome válido fica de fora. Nunca lança. */
export function lerModelosDaMeta(dados: unknown): ModeloNaMeta[] {
  const lista = objeto(dados)?.data
  if (!Array.isArray(lista)) return []
  return lista.map(objeto).filter((m): m is Record<string, unknown> => m !== null).flatMap((m) => {
    const nome = texto(m.name)
    if (!nome || !nomeDeModeloValido(nome)) return []
    return [{
      nome,
      status: (texto(m.status) ?? '').toUpperCase().slice(0, 40),
      categoria: (texto(m.category) ?? '').toUpperCase().slice(0, 40),
      idioma: (texto(m.language) ?? '').slice(0, 20),
    }]
  })
}

/** Modelos por página na leitura da lista (o teto da Kapso). */
export const MODELOS_POR_PAGINA = 100

/**
 * O cursor da página seguinte (paging.cursors.after; Base64, que pode ter "+", "/" e "=" — vai pelo encodeURIComponent
 * de quem chama), quando há mais: a Meta diz com paging.next; a Kapso documenta só os cursores, e aí vale a página
 * cheia (`porPagina`). null na última.
 */
export function proximaPaginaDosModelos(dados: unknown, porPagina: number = MODELOS_POR_PAGINA): string | null {
  const d = objeto(dados)
  const paging = objeto(d?.paging)
  const lista = d?.data
  if (!texto(paging?.next) && !(Array.isArray(lista) && lista.length >= porPagina)) return null
  const depois = texto(objeto(paging?.cursors)?.after)
  return depois && /^[\w+/=-]{1,512}$/.test(depois) ? depois : null
}

/** Aprovado, em português e de Utilidade: só esse sai. MARKETING, AUTHENTICATION, PENDING, REJECTED, PAUSED e cia., nunca. */
export const modeloUtilAprovado = (m: ModeloNaMeta, idioma: string = IDIOMA_DO_MODELO): boolean =>
  m.status === 'APPROVED' && m.categoria === 'UTILITY' && m.idioma === idioma

/**
 * O primeiro modelo do catálogo da situação que está aprovado na Meta (modeloUtilAprovado); null se nenhum. Os de
 * cabeçalho de imagem só contam `comImagem` (sem a foto, a Meta recusaria o envio).
 */
export function escolherModelo(situacao: SituacaoDoModelo, naMeta: readonly ModeloNaMeta[], p: { comImagem?: boolean } = {}): ModeloDoCatalogo | null {
  const aprovados = new Set(naMeta.filter((m) => modeloUtilAprovado(m)).map((m) => m.nome))
  return CATALOGO_DOS_MODELOS[situacao].find((m) => aprovados.has(m.nome) && (m.cabecalho !== 'IMAGE' || p.comImagem === true)) ?? null
}

// ------------------------------------------------------------------ montar o envio

/**
 * Os limites da Meta para o envio de modelo: o corpo preenchido (com as variáveis) tem até 1024 caracteres; o payload
 * do botão de resposta rápida, o nosso teto (volta no webhook como o toque — regras.ts, lerEventoDaKapso); `parametro`,
 * o nosso teto por variável (o corpo inteiro ainda tem de caber em `corpo`).
 */
export const LIMITES_DO_MODELO = { corpo: 1024, parametro: 300, payload: 128, link: 500 } as const

/**
 * O texto cabendo numa variável de modelo: a Meta recusa quebra de linha, tabulação e mais de 4 espaços seguidos ali
 * (erro 132018). Uma linha, espaços simples, a formatação do WhatsApp de fora (o asterisco no nome não vira negrito
 * pela metade), cortada em `max` com "…"; vazio vira "—" (a Meta recusa variável vazia).
 */
export function parametroDoModelo(t: string | null | undefined, max: number = LIMITES_DO_MODELO.parametro): string {
  const linha = String(t ?? '').replace(/[\u0000-\u001f\u007f\u00a0\u2028\u2029]+/g, ' ').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim()
  const cortado = linha.length <= max ? linha : `${linha.slice(0, Math.max(1, max - 1)).trimEnd()}…`
  return cortado || '—'
}

/** O corpo do modelo com as variáveis no lugar ({{1}}, {{2}}…), como chega ao celular. */
export const corpoPreenchido = (m: ModeloDoCatalogo, parametros: readonly string[]): string =>
  m.corpo.replace(/\{\{(\d+)\}\}/g, (todo, n: string) => parametros[Number(n) - 1] ?? todo)

/** O id da mídia que a Meta devolveu no upload (POST /{phone_number_id}/media). */
export const idDeMidiaValido = (id: unknown): id is string => typeof id === 'string' && /^[\w.-]{1,128}$/.test(id)

/**
 * O que preencher: `parametros` na ordem do corpo ({{1}}, {{2}}…); `imagem`, o id da mídia para o cabeçalho de imagem;
 * `respostas`, o payload de cada botão de resposta rápida, na ordem (o que volta no webhook quando a pessoa toca — sem
 * ele, volta o texto do botão); `links`, o pedaço variável ({{1}}) de cada botão de link, na ordem.
 */
export type MontagemDoModelo = { parametros: readonly (string | null | undefined)[]; imagem?: string | null; respostas?: readonly string[]; links?: readonly string[] }

/**
 * O objeto `template` pronto para a Cloud API (POST /{phone_number_id}/messages com type "template"); null quando não
 * dá para mandar sem a Meta recusar — número de variáveis diferente do cadastrado, cabeçalho de imagem sem a imagem,
 * payload vazio, longo ou faltando para algum botão de resposta rápida (com `respostas`), link faltando. As variáveis
 * passam por parametroDoModelo, cortadas para o corpo inteiro caber em LIMITES_DO_MODELO.corpo.
 */
export function montarModelo(m: ModeloDoCatalogo, p: MontagemDoModelo): ObjetoDoModelo | null {
  const L = LIMITES_DO_MODELO
  if (!nomeDeModeloValido(m.nome) || p.parametros.length !== m.parametros) return null
  // O que sobra do corpo para as variáveis, dividido igualmente: o corpo preenchido nunca passa do limite da Meta.
  const fixo = m.corpo.replace(/\{\{\d+\}\}/g, '').length
  const porVariavel = m.parametros ? Math.min(L.parametro, Math.floor((L.corpo - fixo) / m.parametros)) : 0
  if (m.parametros && porVariavel < 1) return null
  const parametros = p.parametros.map((v) => parametroDoModelo(v, porVariavel))
  if (corpoPreenchido(m, parametros).length > L.corpo) return null

  const componentes: ObjetoDoModelo['components'] = []
  if (m.cabecalho === 'IMAGE') {
    if (!idDeMidiaValido(p.imagem)) return null
    componentes.push({ type: 'header', parameters: [{ type: 'image', image: { id: p.imagem } }] })
  }
  if (parametros.length) componentes.push({ type: 'body', parameters: parametros.map((t) => ({ type: 'text' as const, text: t })) })

  const rapidos = m.botoes.map((b, indice) => ({ b, indice })).filter((x) => x.b.tipo === 'QUICK_REPLY')
  if (p.respostas) {
    if (p.respostas.length !== rapidos.length) return null
    for (const [i, { indice }] of rapidos.entries()) {
      const payload = String(p.respostas[i] ?? '').trim()
      if (!payload || payload.length > L.payload) return null
      componentes.push({ type: 'button', sub_type: 'quick_reply', index: String(indice), parameters: [{ type: 'payload', payload }] })
    }
  }
  const links = m.botoes.map((b, indice) => ({ b, indice })).filter((x) => x.b.tipo === 'URL' && /\{\{1\}\}$/.test(x.b.url))
  for (const [i, { indice }] of links.entries()) {
    const sufixo = String(p.links?.[i] ?? '').trim()
    if (!sufixo || sufixo.length > L.link || /\s/.test(sufixo)) return null
    componentes.push({ type: 'button', sub_type: 'url', index: String(indice), parameters: [{ type: 'text', text: sufixo }] })
  }
  return { name: m.nome, language: { code: IDIOMA_DO_MODELO }, components: componentes }
}

/**
 * O modelo da situação pronto para mandar: o primeiro do catálogo que está aprovado na Meta (modeloUtilAprovado) e
 * que monta com o que se tem (montarModelo — o de foto, só com a foto); null se nenhum. É o que vai fora da janela de
 * 24 h (kapso.ts, enviarTextoKapso com modeloForaDaJanela, ou enviarModeloKapso direto).
 */
export function modeloDaSituacao(situacao: SituacaoDoModelo, naMeta: readonly ModeloNaMeta[], montagem: MontagemDoModelo): ObjetoDoModelo | null {
  const aprovados = new Set(naMeta.filter((m) => modeloUtilAprovado(m)).map((m) => m.nome))
  for (const m of CATALOGO_DOS_MODELOS[situacao]) {
    if (!aprovados.has(m.nome) || (m.cabecalho === 'IMAGE' && !idDeMidiaValido(montagem.imagem))) continue
    const pronto = montarModelo(m, montagem)
    if (pronto) return pronto
  }
  return null
}

// ------------------------------------------------------------------ a leitura com cache

/** Quanto tempo a lista lida da Meta vale (a aprovação de um modelo chega ao Palácio em até tanto). */
export const VALIDADE_DOS_MODELOS_MS = 10 * 60_000
/** Quanto tempo vale a falha (nenhum aprovado), antes de tentar ler de novo: a Meta fora do ar não vira uma chamada por mensagem. */
export const VALIDADE_DA_FALHA_MS = 60_000

/**
 * A lista dos modelos na Meta, guardada em memória por `chave` (o número do Palácio): uma leitura a cada
 * VALIDADE_DOS_MODELOS_MS, e quem pede ao mesmo tempo espera a mesma leitura. `ler` devolve null (ou lança) quando não
 * conseguiu: aí vale a lista vazia — nenhum aprovado — por VALIDADE_DA_FALHA_MS. Nunca lança. `agora`: o relógio (os
 * testes passam o deles).
 */
export function cacheDosModelos(p: { agora?: () => number } = {}) {
  const agora = p.agora ?? Date.now
  const guardadas = new Map<string, { ate: number; lista: Promise<ModeloNaMeta[]> }>()
  return {
    modelos(chave: string, ler: () => Promise<ModeloNaMeta[] | null>): Promise<ModeloNaMeta[]> {
      const guardada = guardadas.get(chave)
      if (guardada && guardada.ate > agora()) return guardada.lista
      // Enquanto a leitura não volta, a entrada vale para sempre: quem pedir junto espera a mesma.
      const entrada = { ate: Number.POSITIVE_INFINITY, lista: Promise.resolve([] as ModeloNaMeta[]) }
      entrada.lista = (async () => {
        let lida: ModeloNaMeta[] | null = null
        try { lida = await ler() } catch { lida = null }
        entrada.ate = agora() + (lida ? VALIDADE_DOS_MODELOS_MS : VALIDADE_DA_FALHA_MS)
        return lida ?? []
      })()
      guardadas.set(chave, entrada)
      return entrada.lista
    },
    /** Esquece a lista (de uma chave ou de todas): a próxima pergunta lê de novo. */
    esquecer(chave?: string) {
      if (chave === undefined) guardadas.clear()
      else guardadas.delete(chave)
    },
  }
}
