/**
 * O Início modular: os blocos que existem, a arrumação padrão e as regras
 * para ler, mover e esconder. Cada pessoa guarda a sua arrumação
 * (inicio_preferencias); sem nada guardado, vale a padrão. Módulo puro —
 * conferido por scripts/conferir-inicio.ts.
 */

/**
 * Largura natural de cada bloco. "inteiro" ocupa a linha toda; "largo" e
 * "estreito" seguidos dividem a linha em duas colunas (a larga e a estreita,
 * como o "Meu dia" de sempre), cada coluna na ordem escolhida.
 */
export type Largura = 'inteiro' | 'largo' | 'estreito'

export const BLOCOS = {
  abertura: { nome: 'Saudação e números do dia', descricao: 'A frase do seu dia, os atalhos de criar e quatro números que levam ao que é seu.', largura: 'inteiro' },
  esperando: { nome: 'Esperando você', descricao: 'Os conteúdos que esperam o seu voto.', largura: 'largo' },
  pautas: { nome: 'Minhas pautas', descricao: 'As suas pautas em aberto, por prazo.', largura: 'largo' },
  projetos: { nome: 'Projetos', descricao: 'Os projetos ativos, os seus primeiro.', largura: 'largo' },
  hoje: { nome: 'Hoje na comunicação', descricao: 'O que está no calendário hoje, o que foi ao ar e o que falhou.', largura: 'estreito' },
  tempo: { nome: 'Tempo no Rio', descricao: 'A previsão de 7 dias, com alerta de chuva forte e calor.', largura: 'estreito' },
  equipe: { nome: 'A equipe agora', descricao: 'O que a equipe fez por último.', largura: 'estreito' },
  semana: { nome: 'A semana da comunicação', descricao: 'Dia a dia da semana, os números e a saúde dos canais.', largura: 'inteiro' },
  indicadores: { nome: 'Indicadores', descricao: 'Os últimos 30 dias comparados aos 30 anteriores.', largura: 'inteiro' },
  areas: { nome: 'Todas as áreas', descricao: 'O mapa de todas as áreas do Palácio, recolhido.', largura: 'inteiro' },
} as const satisfies Record<string, { nome: string; descricao: string; largura: Largura }>

export type IdDoBloco = keyof typeof BLOCOS
export const IDS = Object.keys(BLOCOS) as IdDoBloco[]
export const ehBloco = (id: unknown): id is IdDoBloco => typeof id === 'string' && Object.hasOwn(BLOCOS, id)

/** A ordem de sempre: a abertura, o "Meu dia" (larga + estreita), a semana, os indicadores e as áreas. */
export const ORDEM_PADRAO: IdDoBloco[] = ['abertura', 'esperando', 'pautas', 'projetos', 'hoje', 'tempo', 'equipe', 'semana', 'indicadores', 'areas']

export type Arrumacao = { id: IdDoBloco; visivel: boolean }[]
export const arrumacaoPadrao = (): Arrumacao => ORDEM_PADRAO.map((id) => ({ id, visivel: true }))

/**
 * Lê a arrumação guardada. Ignora o que não é bloco e o repetido; o bloco
 * novo (que ainda não existia quando a pessoa arrumou) entra visível, logo
 * depois do bloco que vem antes dele na ordem padrão.
 */
export function lerArrumacao(bruto: unknown): Arrumacao {
  if (!Array.isArray(bruto)) return arrumacaoPadrao()
  const vistos = new Set<IdDoBloco>()
  const lista: Arrumacao = []
  for (const x of bruto) {
    const id = (x as { id?: unknown })?.id
    if (!ehBloco(id) || vistos.has(id)) continue
    vistos.add(id)
    lista.push({ id, visivel: (x as { visivel?: unknown }).visivel !== false })
  }
  if (!lista.length) return arrumacaoPadrao()
  for (const id of ORDEM_PADRAO) {
    if (vistos.has(id)) continue
    const antes = ORDEM_PADRAO.slice(0, ORDEM_PADRAO.indexOf(id)).reverse().find((a) => vistos.has(a))
    const onde = antes ? lista.findIndex((b) => b.id === antes) + 1 : 0
    lista.splice(onde, 0, { id, visivel: true })
    vistos.add(id)
  }
  return lista
}

/** Sobe (-1) ou desce (+1) um bloco. Na ponta, não muda nada. */
export function mover(a: Arrumacao, id: IdDoBloco, passo: -1 | 1): Arrumacao {
  const i = a.findIndex((b) => b.id === id)
  const j = i + passo
  if (i < 0 || j < 0 || j >= a.length) return a
  const nova = [...a]
  ;[nova[i], nova[j]] = [nova[j], nova[i]]
  return nova
}

/** Leva um bloco para a posição de outro (arrastar e soltar). */
export function levarPara(a: Arrumacao, id: IdDoBloco, alvo: IdDoBloco): Arrumacao {
  const de = a.findIndex((b) => b.id === id)
  const para = a.findIndex((b) => b.id === alvo)
  if (de < 0 || para < 0 || de === para) return a
  const nova = [...a]
  const [bloco] = nova.splice(de, 1)
  nova.splice(para, 0, bloco)
  return nova
}

export const alternar = (a: Arrumacao, id: IdDoBloco): Arrumacao => a.map((b) => (b.id === id ? { ...b, visivel: !b.visivel } : b))

export const ehPadrao = (a: Arrumacao) => JSON.stringify(a) === JSON.stringify(arrumacaoPadrao())

/**
 * As faixas da tela: bloco "inteiro" é uma faixa sozinho; blocos "largo" e
 * "estreito" seguidos formam uma faixa de duas colunas (os largos na
 * principal, os estreitos ao lado, cada um na ordem da pessoa).
 */
export type Faixa = { tipo: 'inteiro'; id: IdDoBloco } | { tipo: 'colunas'; largos: IdDoBloco[]; estreitos: IdDoBloco[] }

export function faixas(a: Arrumacao): Faixa[] {
  const saida: Faixa[] = []
  let atual: Extract<Faixa, { tipo: 'colunas' }> | null = null
  for (const b of a) {
    if (!b.visivel) continue
    const largura = BLOCOS[b.id].largura
    if (largura === 'inteiro') {
      atual = null
      saida.push({ tipo: 'inteiro', id: b.id })
      continue
    }
    if (!atual) saida.push(atual = { tipo: 'colunas', largos: [], estreitos: [] })
    ;(largura === 'largo' ? atual.largos : atual.estreitos).push(b.id)
  }
  return saida
}

/** Para o banco: só id e visível, na ordem. */
export const paraGuardar = (a: Arrumacao) => a.map(({ id, visivel }) => ({ id, visivel }))
