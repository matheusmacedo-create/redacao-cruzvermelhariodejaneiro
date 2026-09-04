import type { PautaDoCerebro } from './contrato'

/**
 * A orientação do Cérebro, guardada no mestre do pacote como DADO.
 *
 * Até aqui o raciocínio, o plano por canal e o "o que não pode" chegavam ao
 * hub como um texto colado em "notas para quem aprova" — um textarea de duas
 * linhas dentro de um acordeão fechado. A parte mais valiosa da sugestão
 * sumia no exato lugar onde a notícia é escrita. Estruturado, o bloco pode
 * ser mostrado aberto no editor e entregue aos prompts de IA como trava.
 *
 * Vive em `social_packages.mestre.cerebro`. O autosave do mestre preserva
 * chaves que a tela não edita (pacotes.ts › salvarMestre), então isto
 * sobrevive à digitação.
 */
export interface OrientacaoDoCerebro {
  id: string
  url?: string
  nota: number
  modo: string
  modoRotulo: string
  eixo?: string
  eixoRotulo?: string
  porque: string[]
  proibido: string[]
  canais: { canal: string; usar: boolean; formato: string; texto: string; cta: string }[]
  fonte: { nome: string; conta: string | null; url: string; quando: string }
  capa?: { credito: string; direito: string; daCasa: boolean; podePublicar: boolean; motivoFalha?: string }
  agrupados?: number
  /** De onde saiu o texto do mestre: redigido pela IA ou montado da legenda. */
  texto: 'ia' | 'legenda'
  /** O que um humano precisa conferir antes de publicar. */
  paraConferir: string[]
  /** Peças por canal que a IA redigiu junto, quando redigiu. */
  pecas?: { legendaFeed?: string; stories?: string[] }
}

export function orientacaoDaPauta(
  p: PautaDoCerebro,
  extra: { texto: 'ia' | 'legenda'; paraConferir?: string[]; capaFalhou?: string; pecas?: OrientacaoDoCerebro['pecas'] },
): OrientacaoDoCerebro {
  return {
    id: p.id,
    url: p.urlNoCerebro,
    nota: p.decisao.nota,
    modo: p.decisao.modo,
    modoRotulo: p.decisao.modoRotulo,
    eixo: p.decisao.eixo ?? undefined,
    eixoRotulo: p.decisao.eixoRotulo ?? undefined,
    porque: p.decisao.porque,
    proibido: p.proibido,
    canais: p.canais.map((c) => ({ canal: c.canal, usar: c.usar, formato: c.formato, texto: c.texto, cta: c.cta })),
    fonte: { nome: p.fato.fonte, conta: p.fato.conta, url: p.fato.url, quando: p.fato.quando },
    capa: p.midia
      ? {
          credito: p.midia.credito,
          direito: p.midia.direito,
          daCasa: Boolean(p.midia.daCasa),
          podePublicar: p.midia.podePublicar,
          ...(extra.capaFalhou ? { motivoFalha: extra.capaFalhou } : {}),
        }
      : undefined,
    agrupados: p.agrupados?.quantidade || undefined,
    texto: extra.texto,
    paraConferir: extra.paraConferir ?? [],
    ...(extra.pecas ? { pecas: extra.pecas } : {}),
  }
}

/**
 * Lê a orientação de um mestre vindo do banco. Tolerante por desenho: o
 * jsonb pode vir de uma versão anterior da importação (sem a chave) ou ter
 * sido tocado à mão — nesse caso a tela simplesmente não mostra o bloco.
 */
export function lerOrientacao(mestre: unknown): OrientacaoDoCerebro | undefined {
  const m = (mestre ?? {}) as Record<string, unknown>
  const c = m.cerebro as Record<string, unknown> | undefined
  if (!c || typeof c !== 'object' || typeof c.id !== 'string') return undefined
  const textos = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  const fonte = (c.fonte ?? {}) as Record<string, unknown>
  const capa = c.capa as Record<string, unknown> | undefined
  const pecas = c.pecas as Record<string, unknown> | undefined
  return {
    id: c.id,
    url: typeof c.url === 'string' ? c.url : undefined,
    nota: typeof c.nota === 'number' ? c.nota : 0,
    modo: typeof c.modo === 'string' ? c.modo : '',
    modoRotulo: typeof c.modoRotulo === 'string' ? c.modoRotulo : '',
    eixo: typeof c.eixo === 'string' ? c.eixo : undefined,
    eixoRotulo: typeof c.eixoRotulo === 'string' ? c.eixoRotulo : undefined,
    porque: textos(c.porque),
    proibido: textos(c.proibido),
    canais: Array.isArray(c.canais)
      ? c.canais
          .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
          .map((x) => ({
            canal: String(x.canal ?? ''),
            usar: Boolean(x.usar),
            formato: String(x.formato ?? ''),
            texto: String(x.texto ?? ''),
            cta: String(x.cta ?? ''),
          }))
      : [],
    fonte: {
      nome: typeof fonte.nome === 'string' ? fonte.nome : '',
      conta: typeof fonte.conta === 'string' ? fonte.conta : null,
      url: typeof fonte.url === 'string' ? fonte.url : '',
      quando: typeof fonte.quando === 'string' ? fonte.quando : '',
    },
    capa: capa && typeof capa === 'object'
      ? {
          credito: String(capa.credito ?? ''),
          direito: String(capa.direito ?? ''),
          daCasa: Boolean(capa.daCasa),
          podePublicar: Boolean(capa.podePublicar),
          ...(typeof capa.motivoFalha === 'string' ? { motivoFalha: capa.motivoFalha } : {}),
        }
      : undefined,
    agrupados: typeof c.agrupados === 'number' ? c.agrupados : undefined,
    texto: c.texto === 'ia' ? 'ia' : 'legenda',
    paraConferir: textos(c.paraConferir),
    ...(pecas && typeof pecas === 'object'
      ? {
          pecas: {
            ...(typeof pecas.legendaFeed === 'string' ? { legendaFeed: pecas.legendaFeed } : {}),
            ...(Array.isArray(pecas.stories) ? { stories: textos(pecas.stories) } : {}),
          },
        }
      : {}),
  }
}
